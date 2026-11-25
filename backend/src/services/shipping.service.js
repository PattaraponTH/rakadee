// คำสั่งซื้อและการจัดส่ง (เจ้าของ: PM) — api-spec หัวข้อ 8, requirement ข้อ 6, D-08
// order.create() อยู่ใน order.service.js (Programmer) ไฟล์นี้ดูแลตั้งแต่ Order เกิดแล้ว:
//   อ่านคำสั่งซื้อ (8.1, 8.2, 8.7), รายการรอส่ง (8.3), บันทึกจัดส่ง (8.4), ยืนยันรับ (8.5), ยกเลิกเมื่อไม่ส่ง (8.6)
//   และ Scheduler shippingDeadline / autoRelease (เรียก remindShipping / notifyOverdue / autoReleaseOne)
const fs = require('fs');
const path = require('path');
const db = require('../config/db');
const config = require('../config');
const time = require('../config/time');
const AppError = require('../utils/AppError');
const escrow = require('./escrow');
const { notify, EVENTS } = require('./notify');

// ---------------------------------------------------------------- Interface ของ QA (ยังไม่มีไฟล์ก็ทำงานต่อได้)
// penalty.add(userId, type, { orderId, note }) และ dispute.isOpen(orderId) ตาม AGENTS.md
// QA สร้าง services/penalty.js และ services/dispute.js แล้วโค้ดนี้จะเรียกของจริงอัตโนมัติ
function optionalModule(file) {
  try {
    return require(file);
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND' && String(err.message).includes(path.basename(file))) return null;
    throw err;
  }
}
const penalty = optionalModule('./penalty');
const dispute = optionalModule('./dispute');

async function isDisputeOpen(orderId, conn = db.pool) {
  if (dispute && typeof dispute.isOpen === 'function') return Boolean(await dispute.isOpen(orderId));
  const [[row]] = await conn.query("SELECT id FROM disputes WHERE order_id = ? AND status <> 'closed' LIMIT 1", [orderId]);
  return Boolean(row);
}

async function addPenalty(userId, type, data) {
  if (!penalty || typeof penalty.add !== 'function') {
    console.warn(`[shipping] penalty.add ยังไม่มี (QA) ข้ามบทลงโทษ ${type} ของผู้ใช้ ${userId}`, data);
    return;
  }
  try {
    await penalty.add(userId, type, data);
  } catch (err) {
    console.error('[shipping] penalty.add failed:', err.message);
  }
}

async function safeNotify(userId, event, data) {
  try {
    await notify(userId, event, data);
  } catch (err) {
    console.error('[shipping] notify failed:', err.message);
  }
}

// ---------------------------------------------------------------- ค่าคงที่และตัวช่วย
const ORDER_STATUSES = ['pending_payment', 'awaiting_shipment', 'shipped', 'completed', 'disputed', 'cancelled'];
const CARRIERS = ['thailand_post', 'kerry', 'flash', 'jt', 'other'];
const CARRIER_LABEL = { thailand_post: 'ไปรษณีย์ไทย', kerry: 'Kerry Express', flash: 'Flash Express', jt: 'J&T Express' };

const money = (v) => (v === null || v === undefined ? null : Number(v));
const iso = (v) => (v ? new Date(v).toISOString() : null);
const isAdmin = (u) => u.role === 'admin' || u.role === 'super_admin';

function validationError(errors) {
  return new AppError(400, 'VALIDATION_ERROR', 'กรุณาตรวจสอบข้อมูลที่กรอก', errors);
}

function parseAddress(value) {
  if (!value) return null;
  const a = typeof value === 'string' ? JSON.parse(value) : value;
  return a && Object.keys(a).length ? a : null;
}

// คอลัมน์ที่ใช้ทั้งรายการและรายละเอียด
const ORDER_SELECT = `
  SELECT o.*,
         l.title AS listing_title,
         (SELECT CONCAT('/uploads/products/', li.file_path) FROM listing_images li
           WHERE li.listing_id = l.id ORDER BY li.is_cover DESC, li.sort_order, li.id LIMIT 1) AS cover_url,
         b.display_name AS buyer_name, b.username AS buyer_username,
         s.display_name AS seller_name, s.username AS seller_username,
         sp.shop_name,
         (SELECT p.status FROM payments p WHERE p.order_id = o.id ORDER BY p.id DESC LIMIT 1) AS payment_status,
         (SELECT d.status FROM disputes d WHERE d.order_id = o.id ORDER BY d.id DESC LIMIT 1) AS dispute_status
    FROM orders o
    JOIN listings l ON l.id = o.listing_id
    JOIN users b ON b.id = o.buyer_id
    JOIN users s ON s.id = o.seller_id
    LEFT JOIN seller_profiles sp ON sp.user_id = o.seller_id`;

function summary(r) {
  return {
    id: Number(r.id),
    status: r.status,
    closingType: r.closing_type,
    listing: { id: Number(r.listing_id), title: r.listing_title, coverUrl: r.cover_url || null },
    buyer: { id: Number(r.buyer_id), displayName: r.buyer_name || r.buyer_username },
    seller: { id: Number(r.seller_id), displayName: r.shop_name || r.seller_name || r.seller_username },
    itemPrice: money(r.item_price),
    shippingFee: money(r.shipping_fee),
    totalAmount: money(r.total_amount),
    paymentStatus: r.payment_status || null,
    disputeStatus: r.dispute_status || null,
    paymentDueAt: iso(r.payment_due_at),
    shipDueAt: iso(r.ship_due_at),
    autoReleaseAt: iso(r.auto_release_at),
    createdAt: iso(r.created_at),
  };
}

// โหลด Order ที่ผู้ใช้คนนี้มีสิทธิ์ดู ไม่มีสิทธิ์ตอบ NOT_FOUND เหมือนไม่มี (api-spec 0.4)
async function loadOrderRow(viewer, orderId) {
  const [[row]] = await db.pool.query(`${ORDER_SELECT} WHERE o.id = ?`, [orderId]);
  const allowed = row && (isAdmin(viewer) || Number(row.buyer_id) === viewer.id || Number(row.seller_id) === viewer.id);
  if (!allowed) throw new AppError(404, 'NOT_FOUND', 'ไม่พบคำสั่งซื้อนี้');
  return row;
}

// ---------------------------------------------------------------- 8.1 GET /api/orders
async function listMyOrders(viewer, { role = 'buyer', status, page, limit }) {
  if (!['buyer', 'seller'].includes(role)) throw validationError({ role: 'ใช้ buyer หรือ seller' });
  if (status && !ORDER_STATUSES.includes(status)) throw validationError({ status: 'สถานะไม่ถูกต้อง' });
  const where = [role === 'seller' ? 'o.seller_id = ?' : 'o.buyer_id = ?'];
  const params = [viewer.id];
  if (status) {
    where.push('o.status = ?');
    params.push(status);
  }
  const whereSql = `WHERE ${where.join(' AND ')}`;
  const [[{ total }]] = await db.pool.query(`SELECT COUNT(*) AS total FROM orders o ${whereSql}`, params);
  const [rows] = await db.pool.query(
    `${ORDER_SELECT} ${whereSql} ORDER BY o.created_at DESC, o.id DESC LIMIT ? OFFSET ?`,
    [...params, limit, (page - 1) * limit],
  );
  // จำนวนต่อสถานะ (ใช้ทำตัวเลขบนแท็บ)
  const [counts] = await db.pool.query(
    `SELECT status, COUNT(*) AS n FROM orders WHERE ${role === 'seller' ? 'seller_id' : 'buyer_id'} = ? GROUP BY status`,
    [viewer.id],
  );
  return {
    items: rows.map(summary),
    page,
    limit,
    total: Number(total),
    counts: Object.fromEntries(ORDER_STATUSES.map((s) => [s, Number((counts.find((c) => c.status === s) || {}).n || 0)])),
  };
}

// ---------------------------------------------------------------- 8.2 GET /api/orders/:id
async function getOrder(viewer, orderId) {
  const r = await loadOrderRow(viewer, orderId);
  const isBuyer = Number(r.buyer_id) === viewer.id;
  const isSeller = Number(r.seller_id) === viewer.id;
  const now = Date.now();

  const [payments] = await db.pool.query(
    'SELECT id, status, reject_reason, created_at, reviewed_at FROM payments WHERE order_id = ? ORDER BY id',
    [orderId],
  );
  const [[esc]] = await db.pool.query(
    'SELECT status, amount, fee_amount, net_amount, held_at, released_at, refunded_at FROM escrows WHERE order_id = ?',
    [orderId],
  );
  const [[ship]] = await db.pool.query('SELECT * FROM shipments WHERE order_id = ?', [orderId]);
  const [disputes] = await db.pool.query(
    'SELECT id, status, created_at, resolved_at, resolution FROM disputes WHERE order_id = ? ORDER BY id',
    [orderId],
  );
  const latestPayment = payments[payments.length - 1] || null;
  const latestDispute = disputes[disputes.length - 1] || null;
  const disputeOpen = Boolean(latestDispute && latestDispute.status !== 'closed');

  // ไทม์ไลน์เรียงตามเวลา
  const timeline = [{ event: 'order_created', at: iso(r.created_at) }];
  payments.forEach((p) => {
    timeline.push({ event: 'payment_submitted', at: iso(p.created_at) });
    if (p.status === 'rejected' && p.reviewed_at) timeline.push({ event: 'payment_rejected', at: iso(p.reviewed_at), note: p.reject_reason });
  });
  if (r.paid_at) timeline.push({ event: 'paid', at: iso(r.paid_at) });
  if (r.shipped_at) timeline.push({ event: 'shipped', at: iso(r.shipped_at) });
  disputes.forEach((d) => {
    timeline.push({ event: 'dispute_opened', at: iso(d.created_at) });
    if (d.resolved_at) timeline.push({ event: 'dispute_resolved', at: iso(d.resolved_at), note: d.resolution });
  });
  if (esc && esc.released_at) timeline.push({ event: 'funds_released', at: iso(esc.released_at) });
  if (esc && esc.refunded_at) timeline.push({ event: 'refunded', at: iso(esc.refunded_at) });
  if (r.completed_at) timeline.push({ event: 'completed', at: iso(r.completed_at) });
  if (r.cancelled_at) timeline.push({ event: 'cancelled', at: iso(r.cancelled_at), note: r.cancel_reason });
  timeline.sort((a, b) => new Date(a.at) - new Date(b.at));

  const shipOverdue = r.status === 'awaiting_shipment' && r.ship_due_at && new Date(r.ship_due_at).getTime() < now;
  // ผู้ขายเห็นที่อยู่ผู้ซื้อหลังชำระเงินสำเร็จเท่านั้น
  const showAddress = isBuyer || isAdmin(viewer) || Boolean(r.paid_at);

  return {
    ...summary(r),
    viewerRole: isBuyer ? 'buyer' : isSeller ? 'seller' : 'admin',
    shippingAddress: showAddress ? parseAddress(r.shipping_address) : null,
    payment: latestPayment ? {
      id: Number(latestPayment.id),
      status: latestPayment.status,
      rejectReason: latestPayment.reject_reason,
      submittedAt: iso(latestPayment.created_at),
      paidAt: iso(r.paid_at),
    } : null,
    escrow: esc ? {
      status: esc.status,
      amount: money(esc.amount),
      feeAmount: money(esc.fee_amount),
      netAmount: money(esc.net_amount),
    } : null,
    shipment: ship ? {
      carrier: ship.carrier,
      carrierLabel: ship.carrier === 'other' ? ship.carrier_other : CARRIER_LABEL[ship.carrier],
      carrierOther: ship.carrier_other,
      trackingNumber: ship.tracking_number,
      shippedAt: iso(ship.shipped_at),
      proofUrl: ship.proof_file_path ? `/api/orders/${orderId}/shipment/proof` : null,
      note: ship.note,
    } : null,
    dispute: latestDispute ? { id: Number(latestDispute.id), status: latestDispute.status } : null,
    paidAt: iso(r.paid_at),
    shippedAt: iso(r.shipped_at),
    completedAt: iso(r.completed_at),
    cancelledAt: iso(r.cancelled_at),
    cancelReason: r.cancel_reason,
    shipOverdue: Boolean(shipOverdue),
    canShip: isSeller && r.status === 'awaiting_shipment' && !disputeOpen,
    canCancel: isBuyer && Boolean(shipOverdue) && !disputeOpen,
    canConfirmReceipt: isBuyer && r.status === 'shipped' && !disputeOpen,
    canOpenDispute: isBuyer && ['awaiting_shipment', 'shipped'].includes(r.status)
      && Boolean(esc && esc.status === 'held') && !disputeOpen,
    canPay: isBuyer && r.status === 'pending_payment'
      && (!latestPayment || latestPayment.status === 'rejected') && new Date(r.payment_due_at).getTime() > now,
    timeline,
    serverTime: new Date(now).toISOString(),
  };
}

// ---------------------------------------------------------------- 8.8 GET /api/orders/:id/shipment/proof
async function getProofFile(viewer, orderId) {
  await loadOrderRow(viewer, orderId);
  const [[ship]] = await db.pool.query('SELECT proof_file_path FROM shipments WHERE order_id = ?', [orderId]);
  if (!ship || !ship.proof_file_path) throw new AppError(404, 'NOT_FOUND', 'ไม่มีหลักฐานการจัดส่ง');
  const file = path.resolve(config.upload.dir, ship.proof_file_path);
  if (!file.startsWith(path.resolve(config.upload.dir)) || !fs.existsSync(file)) {
    throw new AppError(404, 'NOT_FOUND', 'ไม่พบไฟล์หลักฐาน');
  }
  return file;
}

// ---------------------------------------------------------------- 8.3 GET /api/seller/shipments
async function listPendingShipments(viewer) {
  const [rows] = await db.pool.query(
    `${ORDER_SELECT} WHERE o.seller_id = ? AND o.status = 'awaiting_shipment' ORDER BY o.ship_due_at ASC, o.id ASC`,
    [viewer.id],
  );
  const now = Date.now();
  return {
    items: rows.map((r) => {
      const due = r.ship_due_at ? new Date(r.ship_due_at).getTime() : null;
      return {
        orderId: Number(r.id),
        listingTitle: r.listing_title,
        coverUrl: r.cover_url || null,
        buyer: { id: Number(r.buyer_id), displayName: r.buyer_name || r.buyer_username },
        paidAt: iso(r.paid_at),
        shipDueAt: iso(r.ship_due_at),
        remainingSec: due === null ? null : Math.max(0, Math.floor((due - now) / 1000)),
        overdue: due !== null && due < now,
        recipient: parseAddress(r.shipping_address),
        closingType: r.closing_type,
        shippingFee: money(r.shipping_fee),
        disputeStatus: r.dispute_status || null,
      };
    }),
    serverTime: new Date(now).toISOString(),
  };
}

// ---------------------------------------------------------------- ล็อก Order ใน transaction
async function lockOrder(conn, orderId) {
  const [[o]] = await conn.query('SELECT * FROM orders WHERE id = ? FOR UPDATE', [orderId]);
  if (!o) throw new AppError(404, 'NOT_FOUND', 'ไม่พบคำสั่งซื้อนี้');
  return o;
}

function invalidState(o, message) {
  return new AppError(409, 'INVALID_STATE', message, { status: o.status });
}

// ---------------------------------------------------------------- 8.4 POST /api/orders/:id/shipment
function validateShipment(body, file) {
  const errors = {};
  const carrier = String(body.carrier || '').trim();
  const carrierOther = String(body.carrierOther || '').trim();
  const trackingNumber = String(body.trackingNumber || '').trim().toUpperCase();
  const note = String(body.note || '').trim();
  const shippedAt = body.shippedAt ? new Date(body.shippedAt) : null;

  if (!CARRIERS.includes(carrier)) errors.carrier = 'กรุณาเลือกผู้ให้บริการขนส่ง';
  if (carrier === 'other' && !carrierOther) errors.carrierOther = 'กรุณาระบุชื่อผู้ให้บริการขนส่ง';
  if (carrierOther.length > 100) errors.carrierOther = 'ชื่อผู้ให้บริการยาวเกิน 100 ตัวอักษร';
  if (!trackingNumber) errors.trackingNumber = 'กรุณากรอกเลขพัสดุ';
  else if (!/^[A-Z0-9-]{6,40}$/.test(trackingNumber)) errors.trackingNumber = 'เลขพัสดุต้องเป็นตัวอักษรอังกฤษหรือตัวเลข 6–40 ตัว';
  if (!shippedAt || Number.isNaN(shippedAt.getTime())) errors.shippedAt = 'กรุณาระบุวันเวลาที่ส่ง';
  else if (shippedAt.getTime() > Date.now() + 5 * 60 * 1000) errors.shippedAt = 'วันเวลาที่ส่งต้องไม่เป็นเวลาในอนาคต';
  if (note.length > 500) errors.note = 'หมายเหตุยาวเกิน 500 ตัวอักษร';
  if (Object.keys(errors).length) throw validationError(errors);

  return {
    carrier,
    carrierOther: carrier === 'other' ? carrierOther : null,
    trackingNumber,
    shippedAt,
    note: note || null,
    proofPath: file ? `shipments/${file.filename}` : null,
  };
}

function removeUploaded(file) {
  if (file) fs.promises.unlink(file.path).catch(() => {});
}

async function recordShipment(viewer, orderId, body, file) {
  let input;
  try {
    input = validateShipment(body, file);
  } catch (err) {
    removeUploaded(file);
    throw err;
  }

  let out;
  try {
    out = await db.withTransaction(async (conn) => {
      const o = await lockOrder(conn, orderId);
      if (Number(o.seller_id) !== viewer.id) throw new AppError(404, 'NOT_FOUND', 'ไม่พบคำสั่งซื้อนี้');
      if (o.status === 'cancelled') throw new AppError(409, 'ORDER_CANCELLED', 'คำสั่งซื้อนี้ถูกยกเลิกแล้ว');
      if (o.status !== 'awaiting_shipment') throw invalidState(o, 'คำสั่งซื้อนี้ไม่อยู่ในสถานะรอจัดส่ง');
      if (await isDisputeOpen(orderId, conn)) throw new AppError(409, 'DISPUTE_OPEN', 'คำสั่งซื้อนี้มีข้อพิพาทเปิดอยู่');
      if (o.paid_at) {
        // ช่องเวลาในฟอร์มละเอียดถึงนาที (ไม่มีวินาที) จึงเทียบระดับนาที: นาทีเดียวกับที่ชำระสำเร็จถือว่าใช้ได้
        // และเก็บเป็นเวลาชำระแทน เพื่อไม่ให้เวลาส่งในไทม์ไลน์ขึ้นก่อนเวลาชำระ
        const paidAt = new Date(o.paid_at);
        const paidMinute = Math.floor(paidAt.getTime() / 60000) * 60000;
        if (input.shippedAt.getTime() < paidMinute) {
          throw validationError({ shippedAt: 'วันเวลาที่ส่งต้องไม่ก่อนวันที่ชำระเงินสำเร็จ' });
        }
        if (input.shippedAt < paidAt) input.shippedAt = paidAt;
      }

      await conn.query(
        `INSERT INTO shipments (order_id, carrier, carrier_other, tracking_number, shipped_at, proof_file_path, note)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [orderId, input.carrier, input.carrierOther, input.trackingNumber, input.shippedAt, input.proofPath, input.note],
      );
      const autoReleaseAt = new Date(Date.now() + time.autoReleaseMs);
      await conn.query(
        "UPDATE orders SET status = 'shipped', shipped_at = UTC_TIMESTAMP(), auto_release_at = ? WHERE id = ?",
        [autoReleaseAt, orderId],
      );
      return { buyerId: Number(o.buyer_id), autoReleaseAt };
    });
  } catch (err) {
    removeUploaded(file);
    throw err;
  }

  await safeNotify(out.buyerId, EVENTS.SHIPPED, {
    orderId,
    trackingNumber: input.trackingNumber,
    carrier: input.carrier === 'other' ? input.carrierOther : CARRIER_LABEL[input.carrier],
  });
  return { orderId, status: 'shipped', autoReleaseAt: out.autoReleaseAt.toISOString() };
}

// ---------------------------------------------------------------- 8.5 POST /api/orders/:id/confirm-receipt
async function confirmReceipt(viewer, orderId) {
  const out = await db.withTransaction(async (conn) => {
    const o = await lockOrder(conn, orderId);
    if (Number(o.buyer_id) !== viewer.id) throw new AppError(404, 'NOT_FOUND', 'ไม่พบคำสั่งซื้อนี้');
    if (o.status === 'disputed' || await isDisputeOpen(orderId, conn)) {
      throw new AppError(409, 'DISPUTE_OPEN', 'คำสั่งซื้อนี้มีข้อพิพาทเปิดอยู่ รอแอดมินตัดสินก่อน');
    }
    if (o.status !== 'shipped') throw invalidState(o, 'ยืนยันรับได้หลังผู้ขายบันทึกการจัดส่งแล้วเท่านั้น');
    return escrow.release(orderId, conn); // ปล่อยเงินหักค่าธรรมเนียม + Order completed (SA)
  });
  return { orderId, status: 'completed', escrowStatus: out.status };
}

// ---------------------------------------------------------------- 8.6 POST /api/orders/:id/cancel
async function cancelForNoShipment(viewer, orderId, body = {}) {
  const reason = String(body.reason || '').trim().slice(0, 300) || 'ผู้ขายไม่จัดส่งภายในกำหนด';
  const out = await db.withTransaction(async (conn) => {
    const o = await lockOrder(conn, orderId);
    if (Number(o.buyer_id) !== viewer.id) throw new AppError(404, 'NOT_FOUND', 'ไม่พบคำสั่งซื้อนี้');
    if (o.status !== 'awaiting_shipment') throw invalidState(o, 'ยกเลิกได้เฉพาะคำสั่งซื้อที่รอจัดส่งเท่านั้น');
    if (!o.ship_due_at || new Date(o.ship_due_at).getTime() > Date.now()) {
      throw new AppError(409, 'CANCEL_NOT_ALLOWED', 'ยังไม่เลยกำหนดส่งของผู้ขาย', { shipDueAt: iso(o.ship_due_at) });
    }
    if (await isDisputeOpen(orderId, conn)) throw new AppError(409, 'DISPUTE_OPEN', 'คำสั่งซื้อนี้มีข้อพิพาทเปิดอยู่');
    await conn.query(
      "UPDATE orders SET status = 'cancelled', cancelled_at = UTC_TIMESTAMP(), cancel_reason = 'seller_no_shipment' WHERE id = ?",
      [orderId],
    );
    const refund = await escrow.refund(orderId, conn); // คืนเงินเต็มจำนวน (SA)
    return { sellerId: Number(o.seller_id), refundAmount: refund.refundAmount };
  });

  await addPenalty(out.sellerId, 'no_shipment', { orderId, note: reason });
  await safeNotify(out.sellerId, EVENTS.ORDER_CANCELLED, { orderId });
  return { orderId, status: 'cancelled', refundAmount: out.refundAmount };
}

// ---------------------------------------------------------------- 8.7 GET /api/admin/orders
async function listAllOrders({ status, q, page, limit }) {
  if (status && !ORDER_STATUSES.includes(status)) throw validationError({ status: 'สถานะไม่ถูกต้อง' });
  const where = [];
  const params = [];
  if (status) {
    where.push('o.status = ?');
    params.push(status);
  }
  const term = String(q || '').trim();
  if (term) {
    const idMatch = term.replace(/^#?ORD-?/i, '');
    const like = `%${term}%`;
    where.push('(o.id = ? OR l.title LIKE ? OR b.username LIKE ? OR b.display_name LIKE ? OR s.username LIKE ? OR s.display_name LIKE ? OR sp.shop_name LIKE ?)');
    params.push(/^\d+$/.test(idMatch) ? Number(idMatch) : 0, like, like, like, like, like, like);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [[{ total }]] = await db.pool.query(
    `SELECT COUNT(*) AS total FROM orders o
       JOIN listings l ON l.id = o.listing_id JOIN users b ON b.id = o.buyer_id JOIN users s ON s.id = o.seller_id
       LEFT JOIN seller_profiles sp ON sp.user_id = o.seller_id ${whereSql}`,
    params,
  );
  const [rows] = await db.pool.query(
    `${ORDER_SELECT} ${whereSql} ORDER BY o.created_at DESC, o.id DESC LIMIT ? OFFSET ?`,
    [...params, limit, (page - 1) * limit],
  );
  return { items: rows.map(summary), page, limit, total: Number(total) };
}

// ---------------------------------------------------------------- Scheduler
// shippingDeadline (1): เตือนผู้ขายครั้งเดียวเมื่อเหลือ time.shipReminderBeforeMs
async function remindShipping(limit = 100) {
  const [rows] = await db.pool.query(
    `SELECT id, seller_id, ship_due_at FROM orders
      WHERE status = 'awaiting_shipment' AND ship_reminded_at IS NULL
        AND ship_due_at > UTC_TIMESTAMP() AND ship_due_at <= ?
      ORDER BY ship_due_at LIMIT ?`,
    [new Date(Date.now() + time.shipReminderBeforeMs), limit],
  );
  let sent = 0;
  for (const r of rows) {
    const [res] = await db.pool.query(
      'UPDATE orders SET ship_reminded_at = UTC_TIMESTAMP() WHERE id = ? AND ship_reminded_at IS NULL', [r.id],
    );
    if (!res.affectedRows) continue; // อีกรอบส่งไปแล้ว
    await safeNotify(Number(r.seller_id), EVENTS.SHIP_DUE_SOON, { orderId: Number(r.id), shipDueAt: iso(r.ship_due_at) });
    sent += 1;
  }
  return sent;
}

// shippingDeadline (2): เลยกำหนดส่ง แจ้งผู้ซื้อครั้งเดียวว่ายกเลิกได้
async function notifyOverdue(limit = 100) {
  const [rows] = await db.pool.query(
    `SELECT id, buyer_id FROM orders
      WHERE status = 'awaiting_shipment' AND ship_overdue_notified_at IS NULL AND ship_due_at <= UTC_TIMESTAMP()
      ORDER BY ship_due_at LIMIT ?`,
    [limit],
  );
  let sent = 0;
  for (const r of rows) {
    const [res] = await db.pool.query(
      'UPDATE orders SET ship_overdue_notified_at = UTC_TIMESTAMP() WHERE id = ? AND ship_overdue_notified_at IS NULL', [r.id],
    );
    if (!res.affectedRows) continue;
    await safeNotify(Number(r.buyer_id), EVENTS.SHIP_OVERDUE, { orderId: Number(r.id) });
    sent += 1;
  }
  return sent;
}

// autoRelease: ครบ time.autoReleaseMs หลังส่งของ ไม่มีข้อพิพาท → ปล่อยเงินให้ผู้ขาย
async function dueForAutoRelease(limit = 50) {
  const [rows] = await db.pool.query(
    `SELECT o.id FROM orders o
      WHERE o.status = 'shipped' AND o.auto_release_at <= UTC_TIMESTAMP()
        AND NOT EXISTS (SELECT 1 FROM disputes d WHERE d.order_id = o.id AND d.status <> 'closed')
      ORDER BY o.auto_release_at LIMIT ?`,
    [limit],
  );
  return rows.map((r) => Number(r.id));
}

async function autoReleaseOne(orderId) {
  return db.withTransaction(async (conn) => {
    const o = await lockOrder(conn, orderId);
    if (o.status !== 'shipped' || !o.auto_release_at || new Date(o.auto_release_at).getTime() > Date.now()) return null;
    if (await isDisputeOpen(orderId, conn)) return null;
    return escrow.release(orderId, conn);
  });
}

module.exports = {
  ORDER_STATUSES,
  CARRIERS,
  listMyOrders,
  getOrder,
  getProofFile,
  listPendingShipments,
  recordShipment,
  confirmReceipt,
  cancelForNoShipment,
  listAllOrders,
  remindShipping,
  notifyOverdue,
  dueForAutoRelease,
  autoReleaseOne,
};
