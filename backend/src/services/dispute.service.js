// dispute.service.js — ข้อพิพาท (เจ้าของ: QA) requirement 6.4, 7, 8.2-4, D-08, api-spec หัวข้อ 9
// Interface กลาง: dispute.isOpen(orderId) → true ถ้ามีข้อพิพาทที่ status <> 'closed'
//
// Flow:
//   ผู้ซื้อเปิด (9.1)  → disputes.open + หลักฐานฝั่งผู้ซื้อ, Order = disputed, Escrow คง held (release ไม่ได้ D-08)
//   ส่งหลักฐานเพิ่ม (9.3) → ผู้ซื้อ/ผู้ขายของ Order ก่อนปิด
//   แอดมินเปลี่ยนสถานะ (9.5) → awaiting_evidence | investigating | return_in_progress | refund_in_progress
//   แอดมินตัดสิน (9.6) → closed + refund_buyer (escrow.refund + Order cancelled/dispute_refund)
//                                 | release_seller (escrow.release → Order completed)
const fs = require('fs');
const path = require('path');
const config = require('../config');
const db = require('../config/db');
const AppError = require('../utils/AppError');
const { notify, EVENTS } = require('./notify');
const audit = require('./audit');
const escrow = require('./escrow');

const TYPES = ['not_received', 'not_as_described', 'damaged', 'other'];
const ADMIN_STATUSES = ['awaiting_evidence', 'investigating', 'return_in_progress', 'refund_in_progress'];
const ALL_STATUSES = ['open', ...ADMIN_STATUSES, 'closed'];
const RESOLUTIONS = ['refund_buyer', 'release_seller'];
const MAX_FILES = 5;

const iso = (d) => (d ? new Date(d).toISOString() : null);
const money = (v) => (v === null || v === undefined ? null : Number(v));
// ไฟล์หลักฐานเปิดผ่าน API ที่ตรวจสิทธิ์เท่านั้น (9.7 / 8.8) ไม่เสิร์ฟ /uploads/evidence แบบ static
const evidenceUrl = (disputeId, evidenceId) => `/api/disputes/${disputeId}/evidence/${evidenceId}`;
const proofUrl = (orderId, p) => (p ? `/api/orders/${orderId}/shipment/proof` : null);

// ลบไฟล์ที่ multer บันทึกไว้แล้วเมื่อคำขอล้มเหลว (กันไฟล์ค้างใน storage)
function cleanupFiles(files) {
  for (const f of files || []) fs.unlink(f.path, () => {});
}

// ----------------------------------------------------------------
// Interface: dispute.isOpen(orderId)
// ----------------------------------------------------------------
async function isOpen(orderId, conn = null) {
  const runner = conn || db.pool;
  const [rows] = await runner.query(
    "SELECT 1 FROM disputes WHERE order_id = ? AND status <> 'closed' LIMIT 1",
    [orderId],
  );
  return rows.length > 0;
}

// ----------------------------------------------------------------
// 9.1 POST /api/orders/:id/disputes — ผู้ซื้อเปิดข้อพิพาท
// ----------------------------------------------------------------
async function openDispute(orderId, user, body, files = []) {
  try {
    const type = typeof body.type === 'string' ? body.type.trim() : '';
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    const contactInfo = typeof body.contactInfo === 'string' ? body.contactInfo.trim() : '';
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) : null;

    const errors = {};
    if (!TYPES.includes(type)) errors.type = 'กรุณาเลือกประเภทปัญหา';
    if (description.length < 10) errors.description = 'กรุณาอธิบายปัญหาอย่างน้อย 10 ตัวอักษร';
    if (contactInfo.length > 255) errors.contactInfo = 'ช่องทางติดต่อต้องไม่เกิน 255 ตัวอักษร';
    if (files.length > MAX_FILES) errors.files = `แนบหลักฐานได้ไม่เกิน ${MAX_FILES} รูป`;
    if (Object.keys(errors).length) throw new AppError(400, 'VALIDATION_ERROR', 'ข้อมูลข้อพิพาทไม่ถูกต้อง', errors);

    const result = await db.withTransaction(async (conn) => {
      const [[order]] = await conn.query(
        'SELECT id, buyer_id, seller_id, status FROM orders WHERE id = ? FOR UPDATE',
        [orderId],
      );
      if (!order) throw new AppError(404, 'NOT_FOUND', 'ไม่พบคำสั่งซื้อ');
      if (Number(order.buyer_id) !== user.id) throw new AppError(403, 'FORBIDDEN', 'เฉพาะผู้ซื้อของคำสั่งซื้อนี้เท่านั้น');

      if (await isOpen(orderId, conn)) {
        throw new AppError(409, 'DISPUTE_ALREADY_OPEN', 'คำสั่งซื้อนี้มีข้อพิพาทที่ยังไม่ปิดอยู่แล้ว');
      }
      const [[esc]] = await conn.query('SELECT status FROM escrows WHERE order_id = ? FOR UPDATE', [orderId]);
      if (!['awaiting_shipment', 'shipped'].includes(order.status) || !esc || esc.status !== 'held') {
        throw new AppError(409, 'DISPUTE_NOT_ALLOWED', 'เปิดข้อพิพาทได้เฉพาะคำสั่งซื้อที่ชำระแล้วและยังไม่ปล่อยเงิน', {
          status: order.status,
        });
      }

      const [ins] = await conn.query(
        `INSERT INTO disputes (order_id, opened_by, type, description, contact_info, status)
         VALUES (?, ?, ?, ?, ?, 'open')`,
        [orderId, user.id, type, description, contactInfo || null],
      );
      const disputeId = ins.insertId;
      await insertEvidence(conn, disputeId, user.id, 'buyer', files, note);
      await conn.query("UPDATE orders SET status = 'disputed' WHERE id = ?", [orderId]);
      return { disputeId, sellerId: Number(order.seller_id) };
    });

    // แจ้งผู้ขายและแอดมินทุกคน (api-spec 11: DISPUTE_OPENED → ผู้ขาย, แอดมิน)
    await notify(result.sellerId, EVENTS.DISPUTE_OPENED, { orderId, disputeId: result.disputeId });
    const [admins] = await db.pool.query(
      "SELECT id FROM users WHERE role IN ('admin', 'super_admin') AND status = 'active'",
    );
    for (const a of admins) {
      await notify(a.id, EVENTS.DISPUTE_OPENED, {
        orderId,
        disputeId: result.disputeId,
        message: `คำสั่งซื้อ #ORD-${orderId} มีข้อพิพาทใหม่รอตรวจสอบ`,
        linkUrl: `/pages/admin/dispute-detail.html?id=${result.disputeId}`,
      });
    }

    return { disputeId: result.disputeId, status: 'open', orderStatus: 'disputed' };
  } catch (err) {
    cleanupFiles(files);
    throw err;
  }
}

async function insertEvidence(conn, disputeId, userId, party, files, note) {
  for (const f of files) {
    await conn.query(
      `INSERT INTO dispute_evidence (dispute_id, uploaded_by, party, file_path, note)
       VALUES (?, ?, ?, ?, ?)`,
      [disputeId, userId, party, `evidence/${f.filename}`, note || null],
    );
  }
}

// ----------------------------------------------------------------
// โหลดข้อพิพาท + ตรวจสิทธิ์ (ผู้ซื้อ / ผู้ขายของ Order / แอดมิน)
// ----------------------------------------------------------------
// forWrite: คนนอกที่พยายามเขียน (ส่งหลักฐาน 9.3) ได้ 403 แบบเดียวกับเปิดข้อพิพาท 9.1 · การอ่าน (9.2 / 9.7) ยังได้ 404 ไม่บอกว่ามีข้อพิพาทนี้
async function loadDisputeForViewer(disputeId, user, { forWrite = false } = {}) {
  const [[row]] = await db.pool.query(
    `SELECT d.*, o.buyer_id, o.seller_id
       FROM disputes d JOIN orders o ON o.id = d.order_id
      WHERE d.id = ?`,
    [disputeId],
  );
  if (!row) throw new AppError(404, 'NOT_FOUND', 'ไม่พบข้อพิพาท');
  const isAdmin = ['admin', 'super_admin'].includes(user.role);
  const party = Number(row.buyer_id) === user.id ? 'buyer' : Number(row.seller_id) === user.id ? 'seller' : null;
  if (!isAdmin && !party) {
    if (forWrite) throw new AppError(403, 'FORBIDDEN', 'เฉพาะผู้ซื้อหรือผู้ขายของคำสั่งซื้อนี้เท่านั้น');
    throw new AppError(404, 'NOT_FOUND', 'ไม่พบข้อพิพาท');
  }
  return { row, party, isAdmin };
}

// OrderDetail แบบย่อสำหรับหน้าข้อพิพาท (ไทม์ไลน์ Order ตาม requirement 8.2-4)
async function buildOrderSummary(orderId) {
  const [[o]] = await db.pool.query(
    `SELECT o.*, l.title AS listing_title,
            (SELECT CONCAT('/uploads/products/', li.file_path) FROM listing_images li
              WHERE li.listing_id = l.id AND li.is_cover = 1 LIMIT 1) AS cover_url,
            ub.display_name AS buyer_name, us.display_name AS seller_name
       FROM orders o
       JOIN listings l ON l.id = o.listing_id
       JOIN users ub ON ub.id = o.buyer_id
       JOIN users us ON us.id = o.seller_id
      WHERE o.id = ?`,
    [orderId],
  );
  const [[esc]] = await db.pool.query('SELECT status, amount, held_at, released_at, refunded_at FROM escrows WHERE order_id = ?', [orderId]);
  const [[ship]] = await db.pool.query(
    'SELECT carrier, carrier_other, tracking_number, shipped_at, proof_file_path, note FROM shipments WHERE order_id = ?',
    [orderId],
  );

  const timeline = [
    ['order_created', o.created_at],
    ['paid', o.paid_at],
    ['shipped', o.shipped_at],
    ['completed', o.completed_at],
    ['cancelled', o.cancelled_at],
  ].filter(([, at]) => at).map(([event, at]) => ({ event, at: iso(at) }));

  return {
    id: o.id,
    status: o.status,
    closingType: o.closing_type,
    listing: { id: o.listing_id, title: o.listing_title, coverUrl: o.cover_url || null },
    buyer: { id: o.buyer_id, displayName: o.buyer_name },
    seller: { id: o.seller_id, displayName: o.seller_name },
    itemPrice: money(o.item_price),
    shippingFee: money(o.shipping_fee),
    totalAmount: money(o.total_amount),
    shippingAddress: typeof o.shipping_address === 'string' ? JSON.parse(o.shipping_address) : o.shipping_address,
    escrow: esc ? { status: esc.status, amount: money(esc.amount) } : null,
    shipment: ship ? {
      carrier: ship.carrier,
      carrierOther: ship.carrier_other,
      trackingNumber: ship.tracking_number,
      shippedAt: iso(ship.shipped_at),
      proofUrl: proofUrl(o.id, ship.proof_file_path),
      note: ship.note,
    } : null,
    paymentDueAt: iso(o.payment_due_at),
    shipDueAt: iso(o.ship_due_at),
    autoReleaseAt: iso(o.auto_release_at),
    completedAt: iso(o.completed_at),
    timeline,
  };
}

async function listEvidence(disputeId) {
  const [rows] = await db.pool.query(
    'SELECT id, party, file_path, note, created_at FROM dispute_evidence WHERE dispute_id = ? ORDER BY created_at ASC, id ASC',
    [disputeId],
  );
  return rows.map((e) => ({ id: e.id, party: e.party, url: evidenceUrl(disputeId, e.id), note: e.note, createdAt: iso(e.created_at) }));
}

// ----------------------------------------------------------------
// 9.2 GET /api/disputes/:id
// ----------------------------------------------------------------
async function getDispute(disputeId, user) {
  const { row } = await loadDisputeForViewer(disputeId, user);
  return {
    id: row.id,
    orderId: row.order_id,
    type: row.type,
    description: row.description,
    contactInfo: row.contact_info,
    status: row.status,
    resolution: row.resolution,
    adminNote: row.admin_note,
    openedAt: iso(row.created_at),
    resolvedAt: iso(row.resolved_at),
    order: await buildOrderSummary(row.order_id),
    evidence: await listEvidence(row.id),
  };
}

// ----------------------------------------------------------------
// 9.3 POST /api/disputes/:id/evidence — ผู้ซื้อ/ผู้ขายส่งหลักฐานเพิ่ม
// ----------------------------------------------------------------
// 9.7 GET /api/disputes/:id/evidence/:evidenceId — คืน path ไฟล์ (ผู้ซื้อ/ผู้ขายของ Order และแอดมิน, คนอื่น NOT_FOUND)
async function getEvidenceFile(disputeId, evidenceId, user) {
  await loadDisputeForViewer(disputeId, user);
  const [[ev]] = await db.pool.query(
    'SELECT file_path FROM dispute_evidence WHERE id = ? AND dispute_id = ?',
    [evidenceId, disputeId],
  );
  if (!ev) throw new AppError(404, 'NOT_FOUND', 'ไม่พบไฟล์หลักฐาน');
  const root = path.resolve(config.upload.dir);
  const file = path.resolve(root, ev.file_path);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) throw new AppError(404, 'NOT_FOUND', 'ไม่พบไฟล์หลักฐาน');
  return file;
}

async function addEvidence(disputeId, user, body, files = []) {
  try {
    const { party } = await loadDisputeForViewer(disputeId, user, { forWrite: true });
    if (!party) throw new AppError(403, 'FORBIDDEN', 'เฉพาะผู้ซื้อหรือผู้ขายของคำสั่งซื้อนี้เท่านั้น');
    if (!files.length) throw new AppError(400, 'VALIDATION_ERROR', 'กรุณาแนบรูปหลักฐานอย่างน้อย 1 รูป', { files: 'ต้องมีอย่างน้อย 1 รูป' });
    if (files.length > MAX_FILES) throw new AppError(400, 'VALIDATION_ERROR', `แนบได้ไม่เกิน ${MAX_FILES} รูปต่อครั้ง`, { files: `ไม่เกิน ${MAX_FILES} รูป` });
    const note = typeof body.note === 'string' ? body.note.trim() : '';
    if (note.length > 500) throw new AppError(400, 'VALIDATION_ERROR', 'หมายเหตุต้องไม่เกิน 500 ตัวอักษร', { note: 'ไม่เกิน 500 ตัวอักษร' });

    await db.withTransaction(async (conn) => {
      const [[d]] = await conn.query('SELECT status FROM disputes WHERE id = ? FOR UPDATE', [disputeId]);
      if (d.status === 'closed') throw new AppError(409, 'INVALID_STATE', 'ข้อพิพาทนี้ปิดแล้ว', { status: d.status });
      await insertEvidence(conn, disputeId, user.id, party, files, note || null);
    });
    return { evidence: await listEvidence(disputeId) };
  } catch (err) {
    cleanupFiles(files);
    throw err;
  }
}

// ----------------------------------------------------------------
// GET /api/disputes — ข้อพิพาทของฉัน (เพิ่มจาก spec: เมนู "ข้อพิพาท" ในหน้าผู้ขาย — รอ SA เพิ่มใน api-spec หัวข้อ 9)
//   role   = seller (ฉันเป็นผู้ขาย) | buyer (ฉันเป็นผู้ซื้อ) | ไม่ส่ง = ทั้งสองฝั่ง
//   status = active (ยังไม่ปิด) | closed | สถานะใดสถานะหนึ่งใน 6 ค่า | ไม่ส่ง = ทั้งหมด
// ----------------------------------------------------------------
async function listMine(user, { role, status, page, limit }) {
  const where = [];
  const params = [];
  if (role === 'seller') { where.push('o.seller_id = ?'); params.push(user.id); }
  else if (role === 'buyer') { where.push('o.buyer_id = ?'); params.push(user.id); }
  else if (!role) { where.push('(o.seller_id = ? OR o.buyer_id = ?)'); params.push(user.id, user.id); }
  else throw new AppError(400, 'VALIDATION_ERROR', 'role ไม่ถูกต้อง', { role: 'ใช้ได้: seller, buyer' });

  if (status === 'active') where.push("d.status <> 'closed'");
  else if (status) {
    if (!ALL_STATUSES.includes(status)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'สถานะไม่ถูกต้อง', { status: `ใช้ได้: active, ${ALL_STATUSES.join(', ')}` });
    }
    where.push('d.status = ?');
    params.push(status);
  }
  const from = `FROM disputes d
    JOIN orders o ON o.id = d.order_id
    JOIN listings l ON l.id = o.listing_id
    JOIN users ub ON ub.id = o.buyer_id
    JOIN users us ON us.id = o.seller_id
   WHERE ${where.join(' AND ')}`;

  const [[{ total }]] = await db.pool.query(`SELECT COUNT(*) AS total ${from}`, params);
  const [rows] = await db.pool.query(
    `SELECT d.id, d.order_id, d.type, d.status, d.resolution, d.created_at, d.updated_at,
            l.title AS listing_title, o.total_amount, o.buyer_id,
            (SELECT CONCAT('/uploads/products/', li.file_path) FROM listing_images li
              WHERE li.listing_id = l.id AND li.is_cover = 1 LIMIT 1) AS cover_url,
            ub.display_name AS buyer_name, us.display_name AS seller_name,
            (SELECT COUNT(*) FROM dispute_evidence e WHERE e.dispute_id = d.id AND e.party = 'seller') AS seller_evidence_count
       ${from}
      ORDER BY (d.status = 'closed') ASC, d.created_at DESC
      LIMIT ? OFFSET ?`,
    [...params, limit, (page - 1) * limit],
  );
  return {
    items: rows.map((r) => {
      const myRole = Number(r.buyer_id) === user.id ? 'buyer' : 'seller';
      return {
        id: r.id,
        orderId: r.order_id,
        listingTitle: r.listing_title,
        coverUrl: r.cover_url || null,
        type: r.type,
        status: r.status,
        resolution: r.resolution,
        totalAmount: money(r.total_amount),
        myRole,
        counterparty: myRole === 'buyer' ? r.seller_name : r.buyer_name,
        sellerEvidenceCount: Number(r.seller_evidence_count),
        openedAt: iso(r.created_at),
        updatedAt: iso(r.updated_at),
      };
    }),
    page,
    limit,
    total: Number(total),
  };
}

// ----------------------------------------------------------------
// 9.4 GET /api/admin/disputes
// ----------------------------------------------------------------
async function adminList({ status, q, page, limit }) {
  const where = ['1=1'];
  const params = [];
  // active = ยังไม่สิ้นสุด (แท็บ "กำลังดำเนินการ") — เพิ่มจาก spec 9.4 รอ SA เพิ่มค่านี้
  if (status === 'active') {
    where.push("d.status <> 'closed'");
  } else if (status) {
    if (!ALL_STATUSES.includes(status)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'สถานะไม่ถูกต้อง', { status: `ใช้ได้: ${ALL_STATUSES.join(', ')}` });
    }
    where.push('d.status = ?');
    params.push(status);
  }
  if (q && String(q).trim()) {
    const s = String(q).trim();
    const like = `%${s}%`;
    where.push('(d.order_id = ? OR l.title LIKE ? OR ub.username LIKE ? OR us.username LIKE ?)');
    params.push(Number(s.replace(/\D/g, '')) || 0, like, like, like);
  }
  const from = `FROM disputes d
    JOIN orders o ON o.id = d.order_id
    JOIN listings l ON l.id = o.listing_id
    JOIN users ub ON ub.id = o.buyer_id
    JOIN users us ON us.id = o.seller_id
   WHERE ${where.join(' AND ')}`;

  const [[{ total }]] = await db.pool.query(`SELECT COUNT(*) AS total ${from}`, params);
  const [rows] = await db.pool.query(
    `SELECT d.id, d.order_id, d.type, d.status, d.resolution, d.created_at, d.updated_at,
            l.title AS listing_title, o.total_amount,
            ub.id AS buyer_id, ub.display_name AS buyer_name,
            us.id AS seller_id, us.display_name AS seller_name
       ${from}
      ORDER BY (d.status = 'closed') ASC, d.created_at ASC
      LIMIT ? OFFSET ?`,
    [...params, limit, (page - 1) * limit],
  );
  return {
    items: rows.map((r) => ({
      id: r.id,
      orderId: r.order_id,
      type: r.type,
      status: r.status,
      resolution: r.resolution,
      listingTitle: r.listing_title,
      totalAmount: money(r.total_amount),
      buyer: { id: r.buyer_id, displayName: r.buyer_name },
      seller: { id: r.seller_id, displayName: r.seller_name },
      openedAt: iso(r.created_at),
      updatedAt: iso(r.updated_at),
    })),
    page,
    limit,
    total: Number(total),
  };
}

// ----------------------------------------------------------------
// 9.5 PATCH /api/admin/disputes/:id/status
// ----------------------------------------------------------------
async function adminUpdateStatus(disputeId, admin, ip, body) {
  const status = body && body.status;
  const note = body && typeof body.note === 'string' ? body.note.trim().slice(0, 1000) : null;
  if (!ADMIN_STATUSES.includes(status)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'สถานะไม่ถูกต้อง', { status: `ใช้ได้: ${ADMIN_STATUSES.join(', ')}` });
  }

  const parties = await db.withTransaction(async (conn) => {
    const [[d]] = await conn.query(
      `SELECT d.id, d.status, d.order_id, o.buyer_id, o.seller_id
         FROM disputes d JOIN orders o ON o.id = d.order_id
        WHERE d.id = ? FOR UPDATE`,
      [disputeId],
    );
    if (!d) throw new AppError(404, 'NOT_FOUND', 'ไม่พบข้อพิพาท');
    if (d.status === 'closed') throw new AppError(409, 'INVALID_STATE', 'ข้อพิพาทนี้ปิดแล้ว', { status: d.status });
    await conn.query('UPDATE disputes SET status = ? WHERE id = ?', [status, disputeId]);
    return { orderId: d.order_id, buyerId: Number(d.buyer_id), sellerId: Number(d.seller_id) };
  });

  // note ยังไม่มีคอลัมน์ใน schema จึงเก็บไว้ใน audit detail และส่งไปในข้อความแจ้งเตือน
  await audit.log(admin.id, 'DISPUTE_STATUS', 'dispute', disputeId, ip, { status, note });
  // 9.5 แจ้งทั้งสองฝ่าย
  for (const uid of [parties.buyerId, parties.sellerId]) {
    await notify(uid, EVENTS.DISPUTE_UPDATED, { orderId: parties.orderId, disputeId, status, note });
  }
  return { id: disputeId, status };
}

// ----------------------------------------------------------------
// 9.6 POST /api/admin/disputes/:id/resolve
// ----------------------------------------------------------------
async function adminResolve(disputeId, admin, ip, body) {
  const resolution = body && body.resolution;
  const adminNote = body && typeof body.adminNote === 'string' ? body.adminNote.trim() : '';
  if (!RESOLUTIONS.includes(resolution)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'กรุณาเลือกผลการตัดสิน', { resolution: 'ใช้ได้: refund_buyer, release_seller' });
  }
  if (!adminNote) throw new AppError(400, 'NOTE_REQUIRED', 'กรุณาระบุเหตุผลการตัดสิน');
  if (adminNote.length > 1000) throw new AppError(400, 'VALIDATION_ERROR', 'เหตุผลต้องไม่เกิน 1000 ตัวอักษร', { adminNote: 'ไม่เกิน 1000 ตัวอักษร' });

  const result = await db.withTransaction(async (conn) => {
    const [[d]] = await conn.query('SELECT id, order_id, status FROM disputes WHERE id = ? FOR UPDATE', [disputeId]);
    if (!d) throw new AppError(404, 'NOT_FOUND', 'ไม่พบข้อพิพาท');
    if (d.status === 'closed') throw new AppError(409, 'INVALID_STATE', 'ข้อพิพาทนี้ปิดแล้ว', { status: d.status });
    const orderId = d.order_id;
    const [[o]] = await conn.query('SELECT id, buyer_id, seller_id FROM orders WHERE id = ? FOR UPDATE', [orderId]);

    // ปิดข้อพิพาทก่อน เพื่อให้ escrow.release() ผ่านเงื่อนไข "ไม่มีข้อพิพาทเปิด" (D-08)
    await conn.query(
      `UPDATE disputes SET status = 'closed', resolution = ?, admin_note = ?, resolved_by = ?, resolved_at = UTC_TIMESTAMP()
        WHERE id = ?`,
      [resolution, adminNote, admin.id, disputeId],
    );

    let orderStatus;
    let escrowStatus;
    if (resolution === 'refund_buyer') {
      await escrow.refund(orderId, conn);
      await conn.query(
        `UPDATE orders SET status = 'cancelled', cancel_reason = 'dispute_refund', cancelled_at = UTC_TIMESTAMP()
          WHERE id = ?`,
        [orderId],
      );
      orderStatus = 'cancelled';
      escrowStatus = 'refunded';
    } else {
      await escrow.release(orderId, conn); // escrow.release ตั้ง Order = completed เอง
      orderStatus = 'completed';
      escrowStatus = 'released';
    }
    return { orderId, orderStatus, escrowStatus, buyerId: Number(o.buyer_id), sellerId: Number(o.seller_id) };
  });

  await audit.log(admin.id, 'DISPUTE_RESOLVE', 'dispute', disputeId, ip, {
    resolution, adminNote, orderId: result.orderId,
  });
  // แจ้งผลการตัดสินทั้งสองฝ่าย (แจ้งเรื่องเงินคืน / เงินเข้า มาจาก escrow อยู่แล้ว)
  const base = { orderId: result.orderId, disputeId, resolution, reason: adminNote };
  await notify(result.buyerId, EVENTS.DISPUTE_RESOLVED, { ...base, forSeller: false });
  await notify(result.sellerId, EVENTS.DISPUTE_RESOLVED, { ...base, forSeller: true });
  return { id: disputeId, status: 'closed', resolution, orderStatus: result.orderStatus, escrowStatus: result.escrowStatus };
}

module.exports = {
  getEvidenceFile,
  isOpen,
  openDispute,
  getDispute,
  addEvidence,
  listMine,
  adminList,
  adminUpdateStatus,
  adminResolve,
  TYPES,
};
