// Payment Service  — api-spec หัวข้อ 7, D-01, D-10
const { pool, withTransaction } = require('../config/db');
const time = require('../config/time');
const AppError = require('../utils/AppError');
const escrow = require('./escrow');
const { notify, EVENTS } = require('./notify');

// แปลงเป็นสตางค์ เพื่อคำนวณเงินอย่างแม่นยำ ไม่ผ่าน float
function toSatang(value) {
  const s = typeof value === 'number' ? value.toFixed(2) : String(value || '0').trim();
  const [baht, frac = ''] = s.split('.');
  return Number(baht) * 100 + Number(frac.padEnd(2, '0'));
}
const toDecimal = (satang) => `${Math.floor(satang / 100)}.${String(satang % 100).padStart(2, '0')}`;

const fs = require('fs');
const path = require('path');
const config = require('../config');

// สลิปเปิดผ่าน API ที่ตรวจสิทธิ์เท่านั้น (ผู้จ่ายหรือแอดมิน) ไม่เสิร์ฟเป็นไฟล์สาธารณะ
const slipUrl = (paymentId, slipPath) => (slipPath ? `/api/payments/${paymentId}/slip` : null);

function removeUploaded(file) {
  if (file && file.path) fs.promises.unlink(file.path).catch(() => {});
}

// ตรวจข้อมูลประกอบสลิป (ไม่บังคับทุกช่อง ยกเว้นไฟล์)
function readSlipFields(body = {}) {
  const errors = {};
  const slipReference = body.slipReference ? String(body.slipReference).trim() : null;
  let slipAmount = null;
  let slipTransferredAt = null;
  if (slipReference && slipReference.length > 100) errors.slipReference = 'เลขอ้างอิงยาวเกิน 100 ตัวอักษร';
  if (body.slipAmount !== undefined && body.slipAmount !== '') {
    if (!/^\d{1,10}(\.\d{1,2})?$/.test(String(body.slipAmount).trim())) errors.slipAmount = 'ยอดที่โอนต้องเป็นตัวเลข ทศนิยมไม่เกิน 2 ตำแหน่ง';
    else slipAmount = toDecimal(toSatang(String(body.slipAmount).trim()));
  }
  if (body.slipTransferredAt) {
    const d = new Date(body.slipTransferredAt);
    if (Number.isNaN(d.getTime())) errors.slipTransferredAt = 'วันเวลาที่โอนไม่ถูกต้อง';
    else if (d.getTime() > Date.now() + 5 * 60 * 1000) errors.slipTransferredAt = 'วันเวลาที่โอนต้องไม่เป็นเวลาในอนาคต';
    else slipTransferredAt = d;
  }
  if (Object.keys(errors).length) throw new AppError(400, 'VALIDATION_ERROR', 'กรุณาตรวจสอบข้อมูลสลิป', errors);
  return { slipReference, slipAmount, slipTransferredAt };
}

/**
 * 7.4 ข้อมูลหน้าชำระเงิน (ข้อ 5.5 ใน requirement)
 * @param {number} orderId
 * @param {number} buyerId
 */
async function getPaymentInfo(orderId, buyerId) {
  const [orderRows] = await pool.query(
    `SELECT o.id, o.listing_id, o.buyer_id, o.seller_id, o.closing_type,
            o.item_price, o.shipping_fee, o.total_amount, o.shipping_address,
            o.status, o.payment_due_at,
            l.title AS listing_title,
            (SELECT CONCAT('/uploads/products/', li.file_path) FROM listing_images li WHERE li.listing_id = l.id AND li.is_cover = 1 LIMIT 1) AS cover_url
     FROM orders o
     JOIN listings l ON o.listing_id = l.id
     WHERE o.id = ?`,
    [orderId]
  );

  if (orderRows.length === 0) {
    throw new AppError(404, 'NOT_FOUND', 'ไม่พบคำสั่งซื้อที่ระบุ');
  }

  const order = orderRows[0];
  if (order.buyer_id !== buyerId) {
    throw new AppError(403, 'FORBIDDEN', 'คุณไม่มีสิทธิ์เข้าถึงข้อมูลการชำระเงินของคำสั่งซื้อนี้');
  }

  // ดึงยอดคงเหลือในกระเป๋า Mock Wallet ของผู้ซื้อ
  const [wallets] = await pool.query('SELECT balance FROM wallets WHERE user_id = ?', [buyerId]);
  const walletBalance = wallets.length > 0 ? Number(wallets[0].balance) : 0.00;

  // ตรวจสอบ Payment ล่าสุดของ Order นี้
  const [payments] = await pool.query(
    `SELECT id, status, reject_reason, slip_file_path, created_at
     FROM payments
     WHERE order_id = ?
     ORDER BY id DESC
     LIMIT 1`,
    [orderId]
  );

  const latestPayment = payments.length > 0 ? {
    id: Number(payments[0].id),
    status: payments[0].status,
    rejectReason: payments[0].reject_reason || null,
    slipUrl: slipUrl(payments[0].id, payments[0].slip_file_path),
  } : null;

  const totalAmount = Number(order.total_amount);
  const shortfall = Math.max(0, Number((totalAmount - walletBalance).toFixed(2)));

  // คำนวณเวลาที่เหลือ (วินาที)
  // D-01: ถ้าระหว่างรอแอดมินตรวจ (pending_review) เวลา 48 ชม. หยุดนับ -> remainingSec = null
  let remainingSec = null;
  if (!latestPayment || latestPayment.status !== 'pending_review') {
    const msLeft = new Date(order.payment_due_at).getTime() - Date.now();
    remainingSec = Math.max(0, Math.floor(msLeft / 1000));
  }

  let shippingAddress = {};
  try {
    shippingAddress = typeof order.shipping_address === 'string'
      ? JSON.parse(order.shipping_address)
      : order.shipping_address || {};
  } catch {
    shippingAddress = {};
  }

  return {
    orderId: Number(order.id),
    listing: {
      id: Number(order.listing_id),
      title: order.listing_title,
      coverUrl: order.cover_url || null,
    },
    mode: order.closing_type,
    itemPrice: Number(order.item_price),
    shippingFee: Number(order.shipping_fee),
    totalAmount,
    paymentDueAt: new Date(order.payment_due_at).toISOString(),
    remainingSec,
    paymentMethods: ['mock_wallet'],
    walletBalance,
    shortfall,
    shippingAddress,
    latestPayment,
  };
}

/**
 * 7.5 เปลี่ยนที่อยู่จัดส่ง (ก่อนชำระเท่านั้น)
 * @param {number} orderId
 * @param {number} buyerId
 * @param {number} addressId
 */
async function updateShippingAddress(orderId, buyerId, addressId) {
  if (!addressId) {
    throw new AppError(400, 'VALIDATION_ERROR', 'กรุณาระบุที่อยู่จัดส่ง', { addressId: 'กรุณาระบุที่อยู่จัดส่ง' });
  }

  return withTransaction(async (conn) => {
    const [orders] = await conn.query(
      'SELECT id, buyer_id, status FROM orders WHERE id = ? FOR UPDATE',
      [orderId]
    );

    if (orders.length === 0) throw new AppError(404, 'NOT_FOUND', 'ไม่พบคำสั่งซื้อที่ระบุ');
    const order = orders[0];

    if (order.buyer_id !== buyerId) {
      throw new AppError(403, 'FORBIDDEN', 'คุณไม่มีสิทธิ์แก้ไขที่อยู่จัดส่งของคำสั่งซื้อนี้');
    }

    if (order.status !== 'pending_payment') {
      throw new AppError(400, 'INVALID_STATE', 'ไม่สามารถเปลี่ยนที่อยู่จัดส่งได้ในสถานะนี้');
    }

    // ตรวจสอบว่ามี Payment ที่กำลังรอตรวจอยู่หรือไม่
    const [pendingPayments] = await conn.query(
      "SELECT id FROM payments WHERE order_id = ? AND status = 'pending_review' LIMIT 1",
      [orderId]
    );
    if (pendingPayments.length > 0) {
      throw new AppError(400, 'INVALID_STATE', 'ไม่สามารถเปลี่ยนที่อยู่ได้เนื่องจากอยู่ระหว่างรอตรวจสอบการชำระเงิน');
    }

    // ดึงที่อยู่ของผู้ซื้อ
    const [addresses] = await conn.query(
      `SELECT recipient_name, phone, address_line, sub_district, district, province, postal_code
       FROM addresses
       WHERE id = ? AND user_id = ?`,
      [addressId, buyerId]
    );

    if (addresses.length === 0) {
      throw new AppError(404, 'NOT_FOUND', 'ไม่พบที่อยู่จัดส่งที่ระบุในบัญชีของคุณ');
    }

    const addr = addresses[0];
    const snapshot = {
      recipientName: addr.recipient_name,
      phone: addr.phone,
      addressLine: addr.address_line,
      subDistrict: addr.sub_district,
      district: addr.district,
      province: addr.province,
      postalCode: addr.postal_code,
    };

    await conn.query(
      'UPDATE orders SET shipping_address = ? WHERE id = ?',
      [JSON.stringify(snapshot), orderId]
    );

    return {
      shippingAddress: snapshot,
    };
  });
}

/**
 * 7.6 ชำระเงินด้วย Mock Wallet (D-01)
 * @param {number} orderId
 * @param {number} buyerId
 */
async function payWithWallet(orderId, buyerId, file, body = {}) {
  // สลิปไม่บังคับ (D-01) ถ้าแนบมาจะบันทึกใน transaction เดียวกับการหักเงิน
  try {
    const slip = file ? readSlipFields(body) : { slipReference: null, slipAmount: null, slipTransferredAt: null };
    return await payInTransaction(orderId, buyerId, file ? `slips/${file.filename}` : null, slip);
  } catch (err) {
    if (file) removeUploaded(file);
    throw err;
  }
}

async function payInTransaction(orderId, buyerId, slipPath, slip) {
  return withTransaction(async (conn) => {
    // 1. ล็อก Order
    const [orders] = await conn.query(
      'SELECT id, buyer_id, seller_id, total_amount, status, payment_due_at, shipping_address FROM orders WHERE id = ? FOR UPDATE',
      [orderId]
    );

    if (orders.length === 0) throw new AppError(404, 'NOT_FOUND', 'ไม่พบคำสั่งซื้อที่ระบุ');
    const order = orders[0];

    if (order.buyer_id !== buyerId) {
      throw new AppError(403, 'FORBIDDEN', 'คุณไม่ใช่ผู้ซื้อของคำสั่งซื้อนี้');
    }

    if (order.status !== 'pending_payment') {
      throw new AppError(409, 'INVALID_STATE', 'คำสั่งซื้อไม่ได้อยู่ในสถานะรอชำระเงิน', { status: order.status });
    }

    // ตรวจสอบวันหมดอายุการชำระเงิน
    if (new Date(order.payment_due_at) <= new Date()) {
      throw new AppError(409, 'PAYMENT_EXPIRED', 'หมดเวลาชำระเงินสำหรับคำสั่งซื้อนี้แล้ว');
    }

    // ตรวจสอบว่าไม่มี Payment ที่รอตรวจอยู่แล้ว (ป้องกันกดซ้ำ)
    const [pendingPayments] = await conn.query(
      "SELECT id FROM payments WHERE order_id = ? AND status = 'pending_review' FOR UPDATE",
      [orderId]
    );
    if (pendingPayments.length > 0) {
      throw new AppError(409, 'PAYMENT_ALREADY_SUBMITTED', 'คำสั่งซื้อนี้อยู่ระหว่างรอตรวจสอบการชำระเงิน');
    }

    // ตรวจสอบว่ามีที่อยู่จัดส่งแล้วหรือไม่
    let addr = {};
    try {
      addr = typeof order.shipping_address === 'string'
        ? JSON.parse(order.shipping_address)
        : order.shipping_address || {};
    } catch {
      addr = {};
    }

    if (!addr || !addr.recipientName || !addr.addressLine) {
      throw new AppError(400, 'ADDRESS_REQUIRED', 'กรุณาระบุที่อยู่จัดส่งก่อนชำระเงิน');
    }

    // 2. ล็อก Wallet ของผู้ซื้อ
    const [wallets] = await conn.query(
      'SELECT id, balance FROM wallets WHERE user_id = ? FOR UPDATE',
      [buyerId]
    );

    if (wallets.length === 0) {
      throw new AppError(400, 'INSUFFICIENT_BALANCE', 'ไม่พบกระเป๋าเงินของผู้ใช้');
    }

    const wallet = wallets[0];
    const balanceSatang = toSatang(wallet.balance);
    const totalSatang = toSatang(order.total_amount);

    if (balanceSatang < totalSatang) {
      const shortfall = (totalSatang - balanceSatang) / 100;
      throw new AppError(400, 'INSUFFICIENT_BALANCE', 'ยอดเงินในกระเป๋าไม่เพียงพอ', { shortfall });
    }

    // 3. หักเงินใน Wallet
    const newBalanceSatang = balanceSatang - totalSatang;
    const newBalanceDecimal = toDecimal(newBalanceSatang);
    const amountDecimal = toDecimal(totalSatang);

    await conn.query('UPDATE wallets SET balance = ? WHERE id = ?', [newBalanceDecimal, wallet.id]);

    // 4. บันทึก Transaction ใน Wallet Ledger
    await conn.query(
      `INSERT INTO wallet_transactions
        (wallet_id, type, amount, balance_after, reference_type, reference_id, note)
       VALUES (?, 'payment', ?, ?, 'order', ?, ?)`,
      [wallet.id, `-${amountDecimal}`, newBalanceDecimal, order.id, `ชำระค่าสินค้า Order #${order.id}`]
    );

    // 5. บันทึกแถว Payment สถานะ pending_review (D-01)
    const [payResult] = await conn.query(
      `INSERT INTO payments (order_id, payer_id, amount, method, status,
                             slip_file_path, slip_amount, slip_transferred_at, slip_reference, slip_uploaded_at)
       VALUES (?, ?, ?, 'mock_wallet', 'pending_review', ?, ?, ?, ?, IF(? IS NULL, NULL, UTC_TIMESTAMP()))`,
      [order.id, buyerId, amountDecimal, slipPath, slip.slipAmount, slip.slipTransferredAt, slip.slipReference, slipPath]
    );

    const paymentId = Number(payResult.insertId);

    return {
      paymentId,
      status: 'pending_review',
      walletBalance: Number(newBalanceDecimal),
      slipUrl: slipUrl(paymentId, slipPath),
    };
  });
}

/**
 * 7.7 แนบหรือเปลี่ยนสลิประหว่างรอตรวจ (ไม่บังคับ แต่ถ้าเรียกต้องมีไฟล์)
 * @param {number} paymentId
 * @param {number} buyerId
 * @param {object} file
 * @param {object} body
 */
async function uploadSlip(paymentId, buyerId, file, body = {}) {
  if (!file) {
    throw new AppError(400, 'SLIP_REQUIRED', 'กรุณาอัปโหลดไฟล์สลิป', { slip: 'กรุณาเลือกไฟล์สลิป' });
  }
  try {
    const slip = readSlipFields(body);
    const relPath = `slips/${file.filename}`;
    const oldPath = await withTransaction(async (conn) => {
      const [payments] = await conn.query(
        'SELECT id, payer_id, status, slip_file_path FROM payments WHERE id = ? FOR UPDATE',
        [paymentId]
      );
      if (payments.length === 0) throw new AppError(404, 'NOT_FOUND', 'ไม่พบรายการชำระเงิน');
      const payment = payments[0];
      if (payment.payer_id !== buyerId) throw new AppError(404, 'NOT_FOUND', 'ไม่พบรายการชำระเงิน');
      if (payment.status !== 'pending_review') {
        throw new AppError(409, 'INVALID_STATE', 'ไม่สามารถแนบสลิปได้เนื่องจากรายการได้รับการตรวจสอบแล้ว', { status: payment.status });
      }
      await conn.query(
        `UPDATE payments
         SET slip_file_path = ?, slip_amount = ?, slip_transferred_at = ?, slip_reference = ?, slip_uploaded_at = UTC_TIMESTAMP()
         WHERE id = ?`,
        [relPath, slip.slipAmount, slip.slipTransferredAt, slip.slipReference, paymentId]
      );
      return payment.slip_file_path;
    });
    // ลบไฟล์สลิปเดิมที่ถูกแทนที่ (ไม่ให้ไฟล์ค้าง)
    if (oldPath && oldPath !== relPath) removeUploaded({ path: path.join(config.upload.dir, oldPath) });
    return {
      paymentId: Number(paymentId),
      slipUrl: slipUrl(paymentId, relPath),
      slipUploadedAt: new Date().toISOString(),
    };
  } catch (err) {
    removeUploaded(file);
    throw err;
  }
}

/**
 * GET /api/payments/:id/slip — ไฟล์สลิป (ผู้จ่ายหรือแอดมินเท่านั้น)
 * @param {number} paymentId
 * @param {object} viewer req.user
 * @returns {Promise<string>} absolute path ของไฟล์
 */
async function getSlipFile(paymentId, viewer) {
  const [[p]] = await pool.query('SELECT payer_id, slip_file_path FROM payments WHERE id = ?', [paymentId]);
  const isAdmin = viewer.role === 'admin' || viewer.role === 'super_admin';
  if (!p || (!isAdmin && Number(p.payer_id) !== viewer.id) || !p.slip_file_path) {
    throw new AppError(404, 'NOT_FOUND', 'ไม่พบไฟล์สลิป');
  }
  const root = path.resolve(config.upload.dir);
  const file = path.resolve(root, p.slip_file_path);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) throw new AppError(404, 'NOT_FOUND', 'ไม่พบไฟล์สลิป');
  return file;
}

/**
 * 7.8 รายการชำระเงินรอแอดมินตรวจ (Admin)
 * @param {string} status
 * @param {number} page
 * @param {number} limit
 */
async function getAdminPayments(status = 'pending_review', page = 1, limit = 20) {
  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(50, Math.max(1, Number(limit) || 20));
  const offset = (p - 1) * l;

  const validStatuses = ['pending_review', 'success', 'rejected'];
  const targetStatus = validStatuses.includes(status) ? status : 'pending_review';

  const [countRows] = await pool.query(
    'SELECT COUNT(*) AS total FROM payments WHERE status = ?',
    [targetStatus]
  );
  const total = countRows[0].total;

  const [rows] = await pool.query(
    `SELECT p.id AS payment_id, p.order_id, p.amount, p.status, p.created_at,
            (p.slip_file_path IS NOT NULL) AS has_slip,
            u.id AS buyer_id, u.display_name AS buyer_name,
            l.title AS listing_title
     FROM payments p
     JOIN users u ON p.payer_id = u.id
     JOIN orders o ON p.order_id = o.id
     JOIN listings l ON o.listing_id = l.id
     WHERE p.status = ?
     ORDER BY p.created_at ASC
     LIMIT ? OFFSET ?`,
    [targetStatus, l, offset]
  );

  const items = rows.map((r) => {
    const createdDate = new Date(r.created_at);
    const reviewDueAt = new Date(createdDate.getTime() + time.adminPaymentReviewMs).toISOString();

    return {
      paymentId: Number(r.payment_id),
      orderId: Number(r.order_id),
      buyer: {
        id: Number(r.buyer_id),
        displayName: r.buyer_name,
      },
      listingTitle: r.listing_title,
      amount: Number(r.amount),
      hasSlip: Boolean(r.has_slip),
      createdAt: createdDate.toISOString(),
      reviewDueAt,
    };
  });

  return {
    items,
    page: p,
    limit: l,
    total,
  };
}

/**
 * 7.9 รายละเอียดการชำระเงิน + Order (Admin)
 * @param {number} paymentId
 */
async function getAdminPaymentDetail(paymentId) {
  const [rows] = await pool.query(
    `SELECT p.*,
            u.id AS buyer_id, u.username AS buyer_username, u.display_name AS buyer_display_name, u.phone AS buyer_phone, u.email AS buyer_email,
            s.id AS seller_id, s.username AS seller_username, s.display_name AS seller_display_name, s.phone AS seller_phone, s.email AS seller_email,
            o.id AS order_id, o.listing_id, o.item_price, o.shipping_fee, o.total_amount AS order_total,
            o.shipping_address, o.status AS order_status, o.payment_due_at,
            l.title AS listing_title,
            (SELECT CONCAT('/uploads/products/', li.file_path) FROM listing_images li WHERE li.listing_id = l.id AND li.is_cover = 1 LIMIT 1) AS cover_url
     FROM payments p
     JOIN orders o ON p.order_id = o.id
     JOIN listings l ON o.listing_id = l.id
     JOIN users u ON p.payer_id = u.id
     JOIN users s ON o.seller_id = s.id
     WHERE p.id = ?`,
    [paymentId]
  );

  if (rows.length === 0) {
    throw new AppError(404, 'NOT_FOUND', 'ไม่พบข้อมูลการชำระเงิน');
  }

  const r = rows[0];

  let shippingAddress = {};
  try {
    shippingAddress = typeof r.shipping_address === 'string' ? JSON.parse(r.shipping_address) : r.shipping_address || {};
  } catch {
    shippingAddress = {};
  }

  return {
    payment: {
      id: Number(r.id),
      orderId: Number(r.order_id),
      amount: Number(r.amount),
      method: r.method,
      status: r.status,
      slipUrl: slipUrl(r.id, r.slip_file_path),
      slipAmount: r.slip_amount ? Number(r.slip_amount) : null,
      slipTransferredAt: r.slip_transferred_at ? new Date(r.slip_transferred_at).toISOString() : null,
      slipReference: r.slip_reference,
      slipUploadedAt: r.slip_uploaded_at ? new Date(r.slip_uploaded_at).toISOString() : null,
      rejectReason: r.reject_reason,
      reviewedBy: r.reviewed_by ? Number(r.reviewed_by) : null,
      reviewedAt: r.reviewed_at ? new Date(r.reviewed_at).toISOString() : null,
      createdAt: new Date(r.created_at).toISOString(),
    },
    order: {
      id: Number(r.order_id),
      listingId: Number(r.listing_id),
      listingTitle: r.listing_title,
      coverUrl: r.cover_url || null,
      itemPrice: Number(r.item_price),
      shippingFee: Number(r.shipping_fee),
      totalAmount: Number(r.order_total),
      status: r.order_status,
      paymentDueAt: new Date(r.payment_due_at).toISOString(),
      shippingAddress,
    },
    buyer: {
      id: Number(r.buyer_id),
      username: r.buyer_username,
      displayName: r.buyer_display_name,
      phone: r.buyer_phone,
      email: r.buyer_email,
    },
    seller: {
      id: Number(r.seller_id),
      username: r.seller_username,
      displayName: r.seller_display_name,
      phone: r.seller_phone,
      email: r.seller_email,
    },
  };
}

/**
 * 7.10 แอดมินอนุมัติการชำระเงิน → Escrow Hold
 * @param {number} paymentId
 * @param {number} adminId
 * @param {string} ipAddress
 */
async function approvePayment(paymentId, adminId, ipAddress = '127.0.0.1') {
  let orderInfo = null;
  let shipDueAt = null;

  const result = await withTransaction(async (conn) => {
    // 1. ล็อก Payment
    const [payments] = await conn.query(
      'SELECT id, order_id, payer_id, amount, status FROM payments WHERE id = ? FOR UPDATE',
      [paymentId]
    );

    if (payments.length === 0) throw new AppError(404, 'NOT_FOUND', 'ไม่พบข้อมูลการชำระเงิน');
    const payment = payments[0];

    if (payment.status !== 'pending_review') {
      throw new AppError(409, 'INVALID_STATE', 'รายการนี้ได้รับการตรวจสอบไปแล้ว', { status: payment.status });
    }

    // 2. ล็อก Order
    const [orders] = await conn.query(
      'SELECT id, buyer_id, seller_id, total_amount, status FROM orders WHERE id = ? FOR UPDATE',
      [payment.order_id]
    );

    if (orders.length === 0) throw new AppError(404, 'NOT_FOUND', 'ไม่พบคำสั่งซื้อ');
    const order = orders[0];
    if (order.status !== 'pending_payment') {
      throw new AppError(409, 'INVALID_STATE', 'คำสั่งซื้อนี้ไม่อยู่ในสถานะรอชำระเงินแล้ว', { status: order.status });
    }

    // 3. ปรับสถานะ Payment เป็น success
    await conn.query(
      `UPDATE payments
       SET status = 'success', reviewed_by = ?, reviewed_at = UTC_TIMESTAMP()
       WHERE id = ?`,
      [adminId, paymentId]
    );

    // 4. ปรับสถานะ Order เป็น awaiting_shipment
    shipDueAt = new Date(Date.now() + time.shippingDueMs);
    await conn.query(
      `UPDATE orders
       SET status = 'awaiting_shipment', paid_at = UTC_TIMESTAMP(), ship_due_at = ?
       WHERE id = ?`,
      [shipDueAt, order.id]
    );

    // 5. นำเงินเข้า Escrow Hold
    await escrow.hold(order.id, conn);

    orderInfo = {
      orderId: order.id,
      buyerId: order.buyer_id,
      sellerId: order.seller_id,
      amount: Number(payment.amount),
    };

    return {
      paymentId: Number(paymentId),
      status: 'success',
      orderStatus: 'awaiting_shipment',
      shipDueAt: shipDueAt.toISOString(),
    };
  });

  // 6. หลัง Commit: แจ้งเตือนผู้ซื้อ และ บันทึก Audit Log (ไม่บล็อกถ้าล้มเหลว)
  if (orderInfo) {
    notify(orderInfo.buyerId, EVENTS.PAYMENT_SUCCESS, {
      orderId: orderInfo.orderId,
      amount: orderInfo.amount,
    }).catch(() => {});
    // แจ้งผู้ขายให้จัดส่ง (api-spec 7.10)
    notify(orderInfo.sellerId, EVENTS.ORDER_PAID, {
      orderId: orderInfo.orderId,
      shipDueAt: shipDueAt.toISOString(),
    }).catch(() => {});

    const audit = require('./audit');
    audit.log(adminId, 'PAYMENT_APPROVE', 'payment', paymentId, ipAddress, {
      orderId: orderInfo.orderId,
      amount: orderInfo.amount,
    }).catch(() => {});
  }

  return result;
}

/**
 * 7.11 แอดมินปฏิเสธการชำระเงิน → คืนเงินเข้า Wallet (D-01)
 * @param {number} paymentId
 * @param {number} adminId
 * @param {string} reason
 * @param {string} ipAddress
 */
async function rejectPayment(paymentId, adminId, reason, ipAddress = '127.0.0.1') {
  if (!reason || !String(reason).trim()) {
    throw new AppError(400, 'REASON_REQUIRED', 'กรุณาระบุเหตุผลการปฏิเสธการชำระเงิน');
  }

  const cleanReason = String(reason).trim();
  let orderInfo = null;
  let newPaymentDueAt = null;

  const result = await withTransaction(async (conn) => {
    // 1. ล็อก Payment
    const [payments] = await conn.query(
      'SELECT id, order_id, payer_id, amount, status, created_at FROM payments WHERE id = ? FOR UPDATE',
      [paymentId]
    );

    if (payments.length === 0) throw new AppError(404, 'NOT_FOUND', 'ไม่พบข้อมูลการชำระเงิน');
    const payment = payments[0];

    if (payment.status !== 'pending_review') {
      throw new AppError(409, 'INVALID_STATE', 'รายการนี้ได้รับการตรวจสอบไปแล้ว', { status: payment.status });
    }

    // 2. ล็อก Order
    const [orders] = await conn.query(
      'SELECT id, buyer_id, total_amount, status, payment_due_at FROM orders WHERE id = ? FOR UPDATE',
      [payment.order_id]
    );

    if (orders.length === 0) throw new AppError(404, 'NOT_FOUND', 'ไม่พบคำสั่งซื้อ');
    const order = orders[0];
    // ปฏิเสธได้เสมอเพื่อคืนเงิน (แม้ Order ถูกยกเลิกไปแล้ว) แต่เลื่อนกำหนดชำระเฉพาะ Order ที่ยังรอชำระ

    // 3. ปรับสถานะ Payment เป็น rejected
    await conn.query(
      `UPDATE payments
       SET status = 'rejected', reject_reason = ?, reviewed_by = ?, reviewed_at = UTC_TIMESTAMP()
       WHERE id = ?`,
      [cleanReason, adminId, paymentId]
    );

    // 4. คืนเงินเข้า Wallet ของผู้ซื้อ
    const [wallets] = await conn.query(
      'SELECT id, balance FROM wallets WHERE user_id = ? FOR UPDATE',
      [order.buyer_id]
    );

    if (wallets.length === 0) throw new AppError(500, 'INTERNAL_ERROR', 'ไม่พบกระเป๋าเงินของผู้ซื้อ');

    const wallet = wallets[0];
    const currentBalanceSatang = toSatang(wallet.balance);
    const refundSatang = toSatang(payment.amount);
    const newBalanceSatang = currentBalanceSatang + refundSatang;
    const newBalanceDecimal = toDecimal(newBalanceSatang);
    const refundDecimal = toDecimal(refundSatang);

    await conn.query('UPDATE wallets SET balance = ? WHERE id = ?', [newBalanceDecimal, wallet.id]);

    // 5. บันทึก Transaction ใน Wallet Ledger: type = payment_refund
    await conn.query(
      `INSERT INTO wallet_transactions
        (wallet_id, type, amount, balance_after, reference_type, reference_id, note)
       VALUES (?, 'payment_refund', ?, ?, 'payment', ?, ?)`,
      [wallet.id, refundDecimal, newBalanceDecimal, paymentId, `คืนเงินเนื่องจากแอดมินปฏิเสธการชำระ: ${cleanReason}`]
    );

    // 6. เลื่อน payment_due_at ออกไปเท่ากับเวลาที่ถูกหยุดไว้ (D-01)
    const pausedMs = Math.max(0, Date.now() - new Date(payment.created_at).getTime());
    newPaymentDueAt = new Date(new Date(order.payment_due_at).getTime() + pausedMs);

    if (order.status === 'pending_payment') {
      await conn.query(
        'UPDATE orders SET payment_due_at = ? WHERE id = ?',
        [newPaymentDueAt, order.id]
      );
    }

    orderInfo = {
      orderId: order.id,
      buyerId: order.buyer_id,
      amount: Number(refundDecimal),
      canRepay: order.status === 'pending_payment', // ยังชำระใหม่ได้ (Order ยังไม่ถูกยกเลิก)
      payDueAt: order.status === 'pending_payment' ? newPaymentDueAt.toISOString() : null,
    };

    return {
      paymentId: Number(paymentId),
      status: 'rejected',
      paymentDueAt: newPaymentDueAt.toISOString(),
    };
  });

  // 7. หลัง Commit: แจ้งเตือนผู้ซื้อ และ บันทึก Audit Log
  if (orderInfo) {
    notify(orderInfo.buyerId, EVENTS.REFUNDED, {
      orderId: orderInfo.orderId,
      amount: orderInfo.amount,
      reason: cleanReason,
      paymentRejected: true, // ข้อความบอกว่าสลิปถูกปฏิเสธ + เหตุผล + ให้ชำระใหม่ (notificationTemplates REFUNDED)
      canRepay: orderInfo.canRepay,
      payDueAt: orderInfo.payDueAt,
    }).catch(() => {});

    const audit = require('./audit');
    audit.log(adminId, 'PAYMENT_REJECT', 'payment', paymentId, ipAddress, {
      orderId: orderInfo.orderId,
      amount: orderInfo.amount,
      reason: cleanReason,
    }).catch(() => {});
  }

  return result;
}

/**
 * 7.3 รายได้ของผู้ขายแยกรายการ + ค่าธรรมเนียม
 * @param {number} sellerId
 */
async function getSellerEarnings(sellerId) {
  const [rows] = await pool.query(
    `SELECT o.id AS order_id, l.title AS listing_title, o.item_price, o.shipping_fee,
            e.status AS escrow_status, e.fee_amount, e.net_amount, e.released_at, e.held_at
     FROM orders o
     JOIN listings l ON o.listing_id = l.id
     LEFT JOIN escrows e ON e.order_id = o.id
     WHERE o.seller_id = ? AND e.id IS NOT NULL
     ORDER BY o.id DESC`,
    [sellerId]
  );

  const feeCfg = await require('./settings').feeConfig();
  let totalReleased = 0;
  let totalPending = 0;
  let totalFees = 0;

  const items = rows.map((r) => {
    const itemPrice = Number(r.item_price);
    const shippingFee = Number(r.shipping_fee);
    const status = r.escrow_status; // held | released | refunded

    let feeAmount = 0;
    let netAmount = 0;

    if (status === 'released') {
      feeAmount = Number(r.fee_amount || 0);
      netAmount = Number(r.net_amount || 0);
      totalReleased += netAmount;
      totalFees += feeAmount;
    } else if (status === 'held') {
      feeAmount = escrow.calculatePlatformFee(itemPrice, feeCfg);
      netAmount = Math.max(0, itemPrice + shippingFee - feeAmount);
      totalPending += netAmount;
    } else {
      // refunded
      feeAmount = 0;
      netAmount = 0;
    }

    return {
      orderId: Number(r.order_id),
      listingTitle: r.listing_title,
      itemPrice,
      shippingFee,
      feeAmount,
      netAmount,
      status,
      releasedAt: r.released_at ? new Date(r.released_at).toISOString() : null,
    };
  });

  return {
    items,
    totals: {
      released: Number(totalReleased.toFixed(2)),
      pending: Number(totalPending.toFixed(2)),
      fees: Number(totalFees.toFixed(2)),
    },
  };
}

module.exports = {
  getPaymentInfo,
  updateShippingAddress,
  payWithWallet,
  uploadSlip,
  getSlipFile,
  getAdminPayments,
  getAdminPaymentDetail,
  approvePayment,
  rejectPayment,
  getSellerEarnings,
};
