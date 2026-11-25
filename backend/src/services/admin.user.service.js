// admin.user.service.js — จัดการผู้ใช้และบทลงโทษ (เจ้าของ: QA) requirement 7.3, 8.1, 8.2-5, api-spec 10.1–10.7
//
// สิทธิ์ Admin vs Super Admin (api-spec 10 ท้ายหัวข้อ, ข้อ 8.1):
//   Admin ห้ามแก้/แบนผู้ใช้ที่เป็น admin หรือ super_admin (CANNOT_MODIFY_ADMIN), ห้ามปลดแบน (10.5 = super_admin)
//   และห้ามคืนสถานะบัญชีที่ถูกแบนผ่าน 10.3 (นับเป็นการปลดแบน)
//   ไม่มี API แก้ยอด Wallet ในระบบ
// แอดมินทุกคนแก้สถานะบัญชีตัวเองไม่ได้
const db = require('../config/db');
const AppError = require('../utils/AppError');
const { notify, EVENTS } = require('./notify');
const audit = require('./audit');
const penalty = require('./penalty');

const iso = (d) => (d ? new Date(d).toISOString() : null);
const money = (v) => (v === null || v === undefined ? null : Number(v));
const ADMIN_ROLES = ['admin', 'super_admin'];
const USER_STATUSES = ['pending_verification', 'active', 'restricted', 'suspended', 'banned'];
const USER_ROLES = ['bidder', 'seller', 'admin', 'super_admin'];
// 10.1 ส่งเบอร์แบบปิดบางส่วน (api-spec 10.1) รูปแบบเดียวกับหน้า admin/users.js · หน้าโปรไฟล์ 10.2 ยังส่งเบอร์เต็ม
const maskPhone = (p) => (p && p.length === 10 ? `${p.slice(0, 3)}-***-${p.slice(6)}` : p);

// ตรวจว่าแอดมินคนนี้แก้ไขบัญชีเป้าหมายได้หรือไม่
function assertCanModify(actor, target) {
  if (actor.id === Number(target.id)) {
    throw new AppError(403, 'FORBIDDEN', 'ไม่สามารถเปลี่ยนสถานะบัญชีของตัวเองได้');
  }
  if (ADMIN_ROLES.includes(target.role) && actor.role !== 'super_admin') {
    throw new AppError(403, 'CANNOT_MODIFY_ADMIN', 'Admin ไม่สามารถจัดการบัญชีแอดมินคนอื่นได้');
  }
}

// ----------------------------------------------------------------
// 10.1 GET /api/admin/users
// ----------------------------------------------------------------
async function listUsers({ q, status, role, page, limit }) {
  const where = ['1=1'];
  const params = [];
  if (status) {
    if (!USER_STATUSES.includes(status)) throw new AppError(400, 'VALIDATION_ERROR', 'สถานะไม่ถูกต้อง', { status: `ใช้ได้: ${USER_STATUSES.join(', ')}` });
    where.push('u.status = ?');
    params.push(status);
  }
  if (role) {
    if (!USER_ROLES.includes(role)) throw new AppError(400, 'VALIDATION_ERROR', 'บทบาทไม่ถูกต้อง', { role: `ใช้ได้: ${USER_ROLES.join(', ')}` });
    where.push('u.role = ?');
    params.push(role);
  }
  if (q && String(q).trim()) {
    const like = `%${String(q).trim()}%`;
    where.push('(u.full_name LIKE ? OR u.display_name LIKE ? OR u.email LIKE ? OR u.phone LIKE ? OR u.username LIKE ?)'); // ชื่อ / อีเมล / เบอร์
    params.push(like, like, like, like, like);
  }
  const whereSql = where.join(' AND ');

  const [[{ total }]] = await db.pool.query(`SELECT COUNT(*) AS total FROM users u WHERE ${whereSql}`, params);
  const [rows] = await db.pool.query(
    `SELECT u.id, u.username, u.full_name, u.display_name, u.email, u.phone, u.id_card_last4,
            u.role, u.status, u.status_until, u.created_at,
            (SELECT COUNT(*) FROM penalties p WHERE p.user_id = u.id) AS penalty_count
       FROM users u
      WHERE ${whereSql}
      ORDER BY u.created_at DESC, u.id DESC
      LIMIT ? OFFSET ?`,
    [...params, limit, (page - 1) * limit],
  );

  return {
    items: rows.map((r) => ({
      id: r.id,
      username: r.username,
      fullName: r.full_name,         // เพิ่มจาก spec 10.1 สำหรับคอลัมน์ "ชื่อ" (รอ SA เพิ่มใน api-spec)
      displayName: r.display_name,
      email: r.email,
      phone: maskPhone(r.phone),
      idCardLast4: r.id_card_last4,  // เพิ่มจาก spec 10.1 สำหรับคอลัมน์ "บัตร ปชช." (4 ตัวท้ายเท่านั้น ตาม 0.5)
      role: r.role,
      status: r.status,
      statusUntil: iso(r.status_until),
      createdAt: iso(r.created_at),
      penaltyCount: Number(r.penalty_count),
    })),
    page,
    limit,
    total: Number(total),
  };
}

// ----------------------------------------------------------------
// 10.2 GET /api/admin/users/:id — โปรไฟล์มุมแอดมิน
// ----------------------------------------------------------------
async function getUser(userId) {
  const [[u]] = await db.pool.query(
    `SELECT u.*, sp.status AS shop_status, sp.shop_name
       FROM users u LEFT JOIN seller_profiles sp ON sp.user_id = u.id
      WHERE u.id = ?`,
    [userId],
  );
  if (!u) throw new AppError(404, 'NOT_FOUND', 'ไม่พบผู้ใช้');

  const [[wallet]] = await db.pool.query('SELECT id, balance FROM wallets WHERE user_id = ?', [userId]);
  const [[stats]] = await db.pool.query(
    `SELECT
       (SELECT COUNT(*) FROM bids WHERE bidder_id = ?) AS bids,
       (SELECT COUNT(*) FROM listings WHERE winner_id = ?) AS won,
       (SELECT COUNT(*) FROM orders WHERE seller_id = ? AND status = 'completed') AS sold`,
    [userId, userId, userId],
  );
  const [penalties] = await db.pool.query(
    `SELECT id, type, order_id, action, action_until, note, created_by, created_at
       FROM penalties WHERE user_id = ? ORDER BY created_at DESC, id DESC`,
    [userId],
  );
  const [recentBids] = await db.pool.query(
    `SELECT b.id, b.listing_id, l.title, b.amount, b.bid_type, b.ip_address, b.created_at
       FROM bids b JOIN listings l ON l.id = b.listing_id
      WHERE b.bidder_id = ? ORDER BY b.created_at DESC LIMIT 20`,
    [userId],
  );
  const [recentOrders] = await db.pool.query(
    `SELECT o.id, o.listing_id, l.title, o.total_amount, o.status, o.created_at,
            IF(o.buyer_id = ?, 'buyer', 'seller') AS my_role
       FROM orders o JOIN listings l ON l.id = o.listing_id
      WHERE o.buyer_id = ? OR o.seller_id = ?
      ORDER BY o.created_at DESC LIMIT 20`,
    [userId, userId, userId],
  );
  const [transactions] = wallet
    ? await db.pool.query(
      `SELECT id, type, amount, balance_after, reference_type, reference_id, note, created_at
         FROM wallet_transactions WHERE wallet_id = ? ORDER BY created_at DESC, id DESC LIMIT 50`,
      [wallet.id],
    )
    : [[]];
  const [blacklists] = await db.pool.query(
    `SELECT id, phone, (id_card_hash IS NOT NULL) AS has_id_card, reason, created_at, revoked_at
       FROM blacklists WHERE user_id = ? ORDER BY created_at DESC`,
    [userId],
  );

  return {
    // UserMe (ไม่มีเลขบัตรเต็ม api-spec 0.5)
    user: {
      id: u.id,
      email: u.email,
      username: u.username,
      fullName: u.full_name,
      displayName: u.display_name,
      phone: u.phone,
      idCardLast4: u.id_card_last4,
      avatarUrl: u.avatar_path ? `/uploads/${u.avatar_path}` : null,
      bio: u.bio,
      role: u.role,
      status: u.status,
      statusUntil: iso(u.status_until),
      statusReason: u.status_reason,
      phoneVerified: Boolean(u.phone_verified_at),
      emailVerified: Boolean(u.email_verified_at),
      isSeller: u.role === 'seller',
      shop: u.shop_status ? { shopName: u.shop_name, status: u.shop_status } : null,
      lastLoginAt: iso(u.last_login_at),
      createdAt: iso(u.created_at),
    },
    wallet: wallet ? { balance: money(wallet.balance) } : null,
    stats: { bids: Number(stats.bids), won: Number(stats.won), sold: Number(stats.sold) },
    penalties: penalties.map((p) => ({
      id: p.id,
      type: p.type,
      orderId: p.order_id,
      action: p.action,
      actionUntil: iso(p.action_until),
      note: p.note,
      createdBy: p.created_by,
      createdAt: iso(p.created_at),
    })),
    recentBids: recentBids.map((b) => ({
      id: b.id,
      listingId: b.listing_id,
      listingTitle: b.title,
      amount: money(b.amount),
      bidType: b.bid_type,
      ipAddress: b.ip_address,
      createdAt: iso(b.created_at),
    })),
    recentOrders: recentOrders.map((o) => ({
      id: o.id,
      listingId: o.listing_id,
      listingTitle: o.title,
      role: o.my_role,
      totalAmount: money(o.total_amount),
      status: o.status,
      createdAt: iso(o.created_at),
    })),
    transactions: transactions.map((t) => ({
      id: t.id,
      type: t.type,
      amount: money(t.amount),
      balanceAfter: money(t.balance_after),
      referenceType: t.reference_type,
      referenceId: t.reference_id,
      note: t.note,
      createdAt: iso(t.created_at),
    })),
    blacklists: blacklists.map((b) => ({
      id: b.id,
      phone: b.phone,
      hasIdCard: Boolean(b.has_id_card),
      reason: b.reason,
      createdAt: iso(b.created_at),
      revokedAt: iso(b.revoked_at),
    })),
  };
}

// ----------------------------------------------------------------
// 10.3 POST /api/admin/users/:id/status
// ----------------------------------------------------------------
async function changeStatus(userId, actor, ip, body) {
  const status = body && body.status;
  const reason = body && typeof body.reason === 'string' ? body.reason.trim() : '';
  const errors = {};
  if (!['active', 'restricted', 'suspended'].includes(status)) errors.status = 'ใช้ได้: active, restricted, suspended';
  if (!reason) errors.reason = 'กรุณาระบุเหตุผล';
  else if (reason.length > 255) errors.reason = 'เหตุผลต้องไม่เกิน 255 ตัวอักษร';

  let until = null;
  if (status === 'restricted' || status === 'suspended') {
    until = body.until ? new Date(body.until) : null;
    if (!until || Number.isNaN(until.getTime())) errors.until = 'กรุณาระบุวันสิ้นสุด (ISO 8601)';
    else if (until.getTime() <= Date.now()) errors.until = 'วันสิ้นสุดต้องเป็นเวลาในอนาคต';
  }
  if (Object.keys(errors).length) throw new AppError(400, 'VALIDATION_ERROR', 'ข้อมูลไม่ถูกต้อง', errors);

  const prev = await db.withTransaction(async (conn) => {
    const [[target]] = await conn.query('SELECT id, role, status FROM users WHERE id = ? FOR UPDATE', [userId]);
    if (!target) throw new AppError(404, 'NOT_FOUND', 'ไม่พบผู้ใช้');
    assertCanModify(actor, target);
    if (target.status === 'pending_verification') {
      throw new AppError(409, 'INVALID_STATE', 'บัญชียังไม่ยืนยัน OTP เปลี่ยนสถานะไม่ได้', { status: target.status });
    }
    if (target.status === 'banned' && actor.role !== 'super_admin') {
      throw new AppError(403, 'FORBIDDEN', 'เฉพาะ Super Admin เท่านั้นที่คืนสถานะบัญชีที่ถูกแบนได้');
    }
    await conn.query(
      'UPDATE users SET status = ?, status_until = ?, status_reason = ? WHERE id = ?',
      [status, until, status === 'active' ? null : reason, userId],
    );
    return target.status;
  });

  await audit.log(actor.id, 'USER_STATUS', 'user', userId, ip, { from: prev, to: status, until: iso(until), reason });
  await notify(userId, EVENTS.ACCOUNT_STATUS_CHANGED, { status, until: iso(until), reason: status === 'active' ? null : reason });
  return { id: userId, status, statusUntil: iso(until) };
}

// ----------------------------------------------------------------
// 10.4 POST /api/admin/users/:id/ban — แบน + Blacklist
// ----------------------------------------------------------------
async function banUser(userId, actor, ip, body) {
  const reason = body && typeof body.reason === 'string' ? body.reason.trim() : '';
  if (!reason) throw new AppError(400, 'REASON_REQUIRED', 'กรุณาระบุเหตุผลการแบน');
  if (reason.length > 500) throw new AppError(400, 'VALIDATION_ERROR', 'เหตุผลต้องไม่เกิน 500 ตัวอักษร', { reason: 'ไม่เกิน 500 ตัวอักษร' });

  const result = await db.withTransaction(async (conn) => {
    const [[target]] = await conn.query('SELECT id, role, status FROM users WHERE id = ? FOR UPDATE', [userId]);
    if (!target) throw new AppError(404, 'NOT_FOUND', 'ไม่พบผู้ใช้');
    assertCanModify(actor, target);
    if (target.status === 'banned') throw new AppError(409, 'INVALID_STATE', 'บัญชีนี้ถูกแบนอยู่แล้ว', { status: target.status });
    return penalty.add(userId, 'admin_ban', { note: reason, createdBy: actor.id, conn });
  });

  await audit.log(actor.id, 'USER_BAN', 'user', userId, ip, { reason, blacklistId: result.blacklistId });
  await notify(userId, EVENTS.ACCOUNT_STATUS_CHANGED, { status: 'banned', reason }); // session ถูกยกเลิกแล้ว จึงได้ทางอีเมลเป็นหลัก
  return { id: userId, status: 'banned', blacklistId: result.blacklistId };
}

// ----------------------------------------------------------------
// 10.5 POST /api/admin/blacklists/:id/revoke — ปลดแบน (super_admin)
// ไม่คืนสถานะบัญชีอัตโนมัติ ใช้ 10.3
// ----------------------------------------------------------------
async function revokeBlacklist(blacklistId, actor, ip) {
  const revokedAt = await db.withTransaction(async (conn) => {
    const [[bl]] = await conn.query('SELECT id, user_id, revoked_at FROM blacklists WHERE id = ? FOR UPDATE', [blacklistId]);
    if (!bl) throw new AppError(404, 'NOT_FOUND', 'ไม่พบรายการ Blacklist');
    if (bl.revoked_at) throw new AppError(409, 'INVALID_STATE', 'รายการนี้ถูกปลดไปแล้ว');
    await conn.query('UPDATE blacklists SET revoked_by = ?, revoked_at = UTC_TIMESTAMP() WHERE id = ?', [actor.id, blacklistId]);
    const [[row]] = await conn.query('SELECT revoked_at FROM blacklists WHERE id = ?', [blacklistId]);
    return row.revoked_at;
  });
  await audit.log(actor.id, 'BLACKLIST_REVOKE', 'blacklist', blacklistId, ip);
  return { blacklistId, revokedAt: iso(revokedAt) };
}

// ----------------------------------------------------------------
// 10.6 GET /api/admin/suspicious-flags (?reviewed=false ค่าเริ่มต้น)
// ----------------------------------------------------------------
async function listFlags({ reviewed = 'false', page, limit }) {
  const where = [];
  if (reviewed === 'false') where.push('f.reviewed_at IS NULL');
  else if (reviewed === 'true') where.push('f.reviewed_at IS NOT NULL');
  else if (reviewed !== 'all') {
    throw new AppError(400, 'VALIDATION_ERROR', 'ค่า reviewed ไม่ถูกต้อง', { reviewed: 'ใช้ได้: true, false, all' });
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [[{ total }]] = await db.pool.query(`SELECT COUNT(*) AS total FROM suspicious_flags f ${whereSql}`);
  const [rows] = await db.pool.query(
    `SELECT f.id, f.reason, f.detail, f.reviewed_at, f.created_at,
            l.id AS listing_id, l.title,
            ub.id AS bidder_id, ub.username AS bidder_username, ub.display_name AS bidder_name,
            us.id AS seller_id, us.username AS seller_username, us.display_name AS seller_name,
            ur.id AS reviewer_id, ur.display_name AS reviewer_name
       FROM suspicious_flags f
       JOIN listings l ON l.id = f.listing_id
       JOIN users ub ON ub.id = f.bidder_id
       JOIN users us ON us.id = f.seller_id
       LEFT JOIN users ur ON ur.id = f.reviewed_by
       ${whereSql}
      ORDER BY f.created_at DESC, f.id DESC
      LIMIT ? OFFSET ?`,
    [limit, (page - 1) * limit],
  );
  return {
    items: rows.map((r) => ({
      id: r.id,
      reason: r.reason,
      detail: r.detail,
      listing: { id: r.listing_id, title: r.title },
      bidder: { id: r.bidder_id, username: r.bidder_username, displayName: r.bidder_name },
      seller: { id: r.seller_id, username: r.seller_username, displayName: r.seller_name },
      reviewedBy: r.reviewer_id ? { id: r.reviewer_id, displayName: r.reviewer_name } : null,
      reviewedAt: iso(r.reviewed_at),
      createdAt: iso(r.created_at),
    })),
    page,
    limit,
    total: Number(total),
  };
}

// ----------------------------------------------------------------
// 10.7 POST /api/admin/suspicious-flags/:id/review
// ----------------------------------------------------------------
async function reviewFlag(flagId, actor, ip) {
  const reviewedAt = await db.withTransaction(async (conn) => {
    const [[f]] = await conn.query('SELECT id, reviewed_at FROM suspicious_flags WHERE id = ? FOR UPDATE', [flagId]);
    if (!f) throw new AppError(404, 'NOT_FOUND', 'ไม่พบรายการ');
    if (f.reviewed_at) throw new AppError(409, 'INVALID_STATE', 'รายการนี้ตรวจแล้ว');
    await conn.query('UPDATE suspicious_flags SET reviewed_by = ?, reviewed_at = UTC_TIMESTAMP() WHERE id = ?', [actor.id, flagId]);
    const [[row]] = await conn.query('SELECT reviewed_at FROM suspicious_flags WHERE id = ?', [flagId]);
    return row.reviewed_at;
  });
  await audit.log(actor.id, 'FLAG_REVIEW', 'suspicious_flag', flagId, ip);
  return { id: flagId, reviewedAt: iso(reviewedAt) };
}

module.exports = { listUsers, getUser, changeStatus, banUser, revokeBlacklist, listFlags, reviewFlag };
