// Auction Engine service (เจ้าของ: Programmer) — api-spec หัวข้อ 6, ข้อ 4
// อ้างอิง docs/auction/proxy-bid-algorithm.pdf (ฉบับแก้ไข 12 พ.ย. 2026) กฎข้อ 1–10 และ D-13 ถึง D-16
//
// ส่วนบน: decideBid() pure function ตัดสินผลการบิด (ไม่แตะ DB) + ตัวช่วยเงิน/ปิดชื่อ
// ส่วนล่าง: placeBid() / buyNow() / closeListing() ทำงานกับ DB ใน withTransaction() + SELECT ... FOR UPDATE
//           แล้วหลัง COMMIT ค่อย emit Socket และ notify() (ไม่ให้ client เห็นผลที่ถูก rollback)
//
// เงินภายในไฟล์นี้เป็น "สตางค์" (จำนวนเต็ม) เวลาเป็น epoch ms (UTC) แปลงเป็น DECIMAL/ISO ตอนเขียน DB และส่งออก
const AppError = require('../utils/AppError');
const time = require('../config/time'); // autoExtendMs, autoExtendMaxCount (ห้าม hard-code)
const { notify, EVENTS } = require('./notify'); // interface กลางของ PM

// ---------- เงิน ----------

// "1500.50" | 1500.5 | "1500" -> 150050  (ไม่ผ่าน float เพื่อกันปัดเศษผิด)
function toSatang(value) {
  if (value === null || value === undefined || value === '') return null;
  const s = String(value).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return NaN;
  const [baht, frac = ''] = s.split('.');
  return Number(baht) * 100 + Number(frac.padEnd(2, '0'));
}

// 150050 -> "1500.50" (ใช้ตอนเขียนลง DECIMAL(12,2) และส่งออก API)
function fromSatang(satang) {
  if (satang === null || satang === undefined) return null;
  const baht = Math.floor(satang / 100);
  const frac = String(satang % 100).padStart(2, '0');
  return `${baht}.${frac}`;
}

function formatBaht(satang) {
  const [baht, frac] = fromSatang(satang).split('.');
  const withComma = Number(baht).toLocaleString('en-US');
  return frac === '00' ? withComma : `${withComma}.${frac}`;
}

// ---------- ข้อมูลสาธารณะ ----------

// ปิดชื่อแบบ a***3 (D-16)
function maskUsername(username) {
  if (!username) return '***';
  const s = String(username);
  if (s.length <= 2) return `${s[0]}***`;
  return `${s[0]}***${s[s.length - 1]}`;
}

// D-15: กด Buy Now ได้จนกว่าราคาปัจจุบันจะถึงราคา Buy Now
function isBuyNowAvailable(listing) {
  if (listing.buyNowPrice === null || listing.buyNowPrice === undefined) return false;
  if (listing.status !== 'active') return false;
  return listing.currentPrice === null || listing.currentPrice < listing.buyNowPrice;
}

function minNextBid(listing) {
  return listing.currentPrice === null
    ? listing.startPrice
    : listing.currentPrice + listing.bidIncrement;
}

// ---------- ตัดสินผลการบิด ----------

const ACCOUNT_ERRORS = {
  pending_verification: ['ACCOUNT_NOT_VERIFIED', 'บัญชียังไม่ได้ยืนยันตัวตน จึงยังบิดไม่ได้'],
  suspended: ['ACCOUNT_SUSPENDED', 'บัญชีถูกระงับชั่วคราว จึงบิดไม่ได้'],
  banned: ['ACCOUNT_BANNED', 'บัญชีถูกระงับถาวร จึงบิดไม่ได้'],
};

function tooLow(mode, minNext) {
  const code = mode === 'proxy' ? 'PROXY_TOO_LOW' : 'BID_TOO_LOW';
  const what = mode === 'proxy' ? 'วงเงิน Proxy ' : 'ราคาที่เสนอ';
  return new AppError(400, code, `${what}ต้องไม่ต่ำกว่า ${formatBaht(minNext)} บาท`, { minNextBid: Number(fromSatang(minNext)) });
}

// กฎข้อ 9 (D-14): วงเงินผู้นำถึง Reserve แล้วแต่ราคายังต่ำกว่า -> ดันราคาไปที่ Reserve
function applyReserve(listing, price, maxOfLeader) {
  const r = listing.reservePrice;
  if (r !== null && r !== undefined && price < r && maxOfLeader >= r) return r;
  return price;
}

/**
 * ตัดสินผลการบิดหนึ่งครั้ง (ทั้ง Manual และ Proxy)
 *
 * @param {object} p
 * @param {object} p.listing แถว listings ที่ล็อกแล้ว แปลงเงินเป็นสตางค์ เวลาเป็น ms:
 *   { id, status, sellerId, startPrice, bidIncrement, currentPrice|null, currentBidderId|null,
 *     reservePrice|null, buyNowPrice|null, endAt, extendCount }
 * @param {object|null} p.leaderProxy proxy_bids ของผู้นำที่ is_active = 1: { maxAmount } หรือ null
 * @param {object} p.user req.user: { id, role | roles[], status }
 * @param {number} p.amount X เป็นสตางค์ (Manual = ราคาที่บิด, Proxy = วงเงินสูงสุด)
 * @param {'manual'|'proxy'} p.mode
 * @param {number} p.now เวลา server (ms)
 * @returns ผลลัพธ์ให้ service เอาไปเขียนลง DB (ดู JSDoc ด้านล่าง)
 */
function decideBid({ listing: L, leaderProxy, user: U, amount: X, mode, now }) {
  if (mode !== 'manual' && mode !== 'proxy') throw new Error(`invalid mode: ${mode}`);
  // ตรวจรูปแบบตัวเลขที่ controller ด้วย error code ตาม openapi.yaml (ยังไม่มี) ที่นี่กันแค่การเรียกผิด
  if (!Number.isInteger(X) || X <= 0) throw new Error(`amount must be positive integer satang: ${X}`);

  // กฎ 1: สถานะรายการ (ถูก Buy Now หรือปิดแล้ว status จะไม่ใช่ active)
  if (L.status !== 'active') throw new AppError(409, 'AUCTION_NOT_ACTIVE', 'รายการนี้ไม่ได้อยู่ระหว่างประมูล');
  if (now >= L.endAt) throw new AppError(409, 'AUCTION_ENDED', 'การประมูลนี้หมดเวลาแล้ว');

  // กฎ 2: สิทธิ์ผู้บิด
  const roles = Array.isArray(U.roles) ? U.roles : [U.role];
  if (roles.includes('admin') || roles.includes('super_admin')) {
    throw new AppError(403, 'FORBIDDEN', 'บัญชีแอดมินไม่สามารถบิดได้');
  }
  if (String(U.id) === String(L.sellerId)) {
    throw new AppError(403, 'SELF_BIDDING', 'ไม่สามารถบิดสินค้าของตัวเองได้');
  }
  if (U.status !== 'active' && U.status !== 'restricted') {
    // D-03 มี 5 สถานะ ที่เหลือคือ 3 ตัวนี้ (ชื่อ code ตามเอกสาร Proxy Bid E8)
    if (!ACCOUNT_ERRORS[U.status]) throw new Error(`unknown account status: ${U.status}`);
    const [code, msg] = ACCOUNT_ERRORS[U.status];
    throw new AppError(403, code, msg);
  }

  const inc = L.bidIncrement;
  const prevLeader = L.currentBidderId;
  const leaderMax = leaderProxy ? leaderProxy.maxAmount : L.currentPrice;

  const bids = []; // แถวที่ต้อง INSERT ลง bids ตามลำดับ
  const proxyUpserts = []; // { bidderId, maxAmount, isActive, resetPriority }
  let deactivateProxyOf = null;
  let outbid = null;
  let proxyStopped = false;
  let priceMoved = true;
  let leader;
  let price;

  const addBid = (bidderId, amount, bidType) => bids.push({ bidderId, amount, bidType });

  if (prevLeader === null || prevLeader === undefined) {
    // กฎ 3: บิดแรก
    if (X < L.startPrice) throw tooLow(mode, L.startPrice);
    leader = U.id;
    if (mode === 'proxy') proxyUpserts.push({ bidderId: U.id, maxAmount: X, isActive: true, resetPriority: true });
    price = mode === 'manual' ? X : L.startPrice;
    price = applyReserve(L, price, mode === 'proxy' ? X : price);
    addBid(U.id, price, mode);
  } else if (String(U.id) === String(prevLeader)) {
    // กฎ 4: ผู้นำเพิ่มวงเงิน
    if (mode === 'manual') {
      throw new AppError(409, 'ALREADY_LEADING', 'คุณเป็นผู้นำอยู่แล้ว ถ้าต้องการเพิ่มราคาให้เพิ่มวงเงิน Proxy แทน');
    }
    if (X <= leaderMax) {
      throw new AppError(400, 'PROXY_CANNOT_DECREASE', `วงเงินใหม่ต้องมากกว่า ${formatBaht(leaderMax)} บาท (ลดหรือยกเลิกวงเงินไม่ได้)`);
    }
    proxyUpserts.push({ bidderId: U.id, maxAmount: X, isActive: true, resetPriority: true });
    leader = U.id;
    priceMoved = false; // D-16: ไม่ต่อเวลา แม้ราคาขยับเพราะ Reserve
    price = applyReserve(L, L.currentPrice, X);
    if (price !== L.currentPrice) addBid(U.id, price, 'proxy');
  } else {
    // กฎ 5: ต้องถึงขั้นต่ำ
    const minNext = L.currentPrice + inc;
    if (X < minNext) throw tooLow(mode, minNext);

    if (X > leaderMax) {
      // กฎ 6: U แซงผู้นำเดิม
      outbid = prevLeader;
      proxyStopped = Boolean(leaderProxy);
      if (leaderMax > L.currentPrice) addBid(prevLeader, leaderMax, 'proxy');
      if (leaderProxy) deactivateProxyOf = prevLeader;
      leader = U.id;
      if (mode === 'proxy') proxyUpserts.push({ bidderId: U.id, maxAmount: X, isActive: true, resetPriority: true });
      price = mode === 'manual' ? X : Math.min(X, leaderMax + inc);
      price = applyReserve(L, price, mode === 'proxy' ? X : price);
      addBid(U.id, price, mode);
    } else {
      // กฎ 7 (เสมอ, คนตั้งก่อนชนะ) และกฎ 8: ผู้นำเดิมรักษาตำแหน่ง
      outbid = U.id;
      proxyStopped = mode === 'proxy';
      leader = prevLeader;
      addBid(U.id, X, mode);
      if (mode === 'proxy') proxyUpserts.push({ bidderId: U.id, maxAmount: X, isActive: false, resetPriority: true });
      price = X === leaderMax ? leaderMax : Math.min(leaderMax, X + inc);
      price = applyReserve(L, price, leaderMax);
      addBid(prevLeader, price, 'proxy');
    }
  }

  // กฎ 10: Auto Extend ครั้งเดียวต่อคำขอ (D-16: เหลือ 2:00 พอดีก็นับ)
  let endAt = L.endAt;
  let extendCount = L.extendCount;
  let extended = false;
  // เทียบเวลาที่เหลือเป็นวินาทีเต็ม (ปัดเวลาบิดขึ้นเป็นวินาที) ให้ตรงกับ end_at ที่เก็บถึงวินาที
  // QA R2-3: หลังต่อเวลา end_at = เวลาบิด + 2:00 ปัดขึ้น จึงเหลือ 120–121 วินาที บิดภายใน 1 วินาทีแรกต้องต่อด้วย (2:00 พอดีก็นับ)
  const nowSec = Math.ceil(now / 1000) * 1000;
  if (priceMoved && L.endAt - nowSec <= time.autoExtendMs && L.extendCount < time.autoExtendMaxCount) {
    // listings.end_at เก็บละเอียดถึงวินาที (MySQL ปัดมิลลิวินาทีขึ้น/ลง) จึงปัดขึ้นเป็นวินาทีเต็มเอง
    // เวลาปิดใหม่ไม่น้อยกว่าเวลาบิด + 2 นาทีเสมอ และค่าที่เก็บตรงกับที่ส่งให้ client
    endAt = Math.ceil((now + time.autoExtendMs) / 1000) * 1000;
    extendCount += 1;
    extended = true;
  }

  const reserveMet = L.reservePrice === null || L.reservePrice === undefined ? null : price >= L.reservePrice;

  return {
    price, // current_price ใหม่
    leader, // current_bidder_id ใหม่
    prevLeader: prevLeader ?? null,
    leaderChanged: String(leader) !== String(prevLeader),
    bids, // INSERT ลง bids ตามลำดับ แล้ว bid_count += bids.length
    proxyUpserts, // INSERT ... ON DUPLICATE KEY UPDATE (priority_at = now เมื่อ resetPriority)
    deactivateProxyOf, // UPDATE proxy_bids SET is_active = 0 ของผู้นำเดิม
    outbid, // userId ที่ต้อง notify(OUTBID)
    proxyStopped, // ข้อความแจ้งเตือนบอกว่า Proxy หยุดทำงาน (4.2-2c)
    extended,
    endAt,
    extendCount,
    reserveMet, // null = ไม่ได้ตั้ง Reserve
    minNextBid: price + inc,
    buyNowAvailable: isBuyNowAvailable({ ...L, currentPrice: price }),
  };
}

// ---------- แจ้งเตือนหลังบิด ----------

/**
 * ส่งแจ้งเตือนจากผลของ decideBid() ตามเอกสาร Proxy Bid หน้า 4
 * เรียก "หลัง COMMIT เท่านั้น" (ไม่ให้แจ้งเตือนออกไปแล้ว transaction ถูก rollback)
 *
 * @param {object} p
 * @param {number|string} p.listingId
 * @param {object} p.result ผลจาก decideBid()
 * @param {Array<number|string>} [p.extendRecipientIds] ผู้ที่เคยบิด + คนใน Watchlist
 *   ต้อง query จาก DB (bids, watchlists) ใน placeBid() ตอนมี schema.sql แล้ว ใช้เฉพาะเมื่อ result.extended
 */
async function notifyBidResult({ listingId, result, extendRecipientIds = [] }) {
  const jobs = [];

  // ถูกแซง: ผู้นำเดิมที่ถูกแซง หรือผู้ท้าชิงที่แพ้ทันที (กฎ 6–8) proxyStopped = Proxy หยุดทำงาน (4.2-2c)
  if (result.outbid !== null && result.outbid !== undefined) {
    jobs.push(notify(result.outbid, EVENTS.OUTBID, {
      listingId,
      currentPrice: fromSatang(result.price),
      proxyStopped: result.proxyStopped,
    }));
  }

  // ต่อเวลา: ส่งคนละครั้ง แม้ชื่อซ้ำทั้งในผู้บิดและ Watchlist
  if (result.extended) {
    const endAt = new Date(result.endAt).toISOString();
    const unique = [...new Map(extendRecipientIds.map((id) => [String(id), id])).values()];
    const extendCount = result.extendCount; // PR #9: ข้อความ "ครั้งที่ n/10" ใช้ค่านี้
    unique.forEach((id) => jobs.push(notify(id, EVENTS.AUCTION_EXTENDED, { listingId, endAt, extendCount })));
  }

  // บิด COMMIT ไปแล้ว แจ้งเตือนล้มต้องไม่ทำให้คำขอบิดล้ม: เก็บ log ไว้ดูแทน
  const results = await Promise.allSettled(jobs);
  results.filter((r) => r.status === 'rejected')
    .forEach((r) => console.error('[auction] notify failed:', r.reason && r.reason.message));
}


// =====================================================================
// ส่วนที่ทำงานกับ DB (schema.sql: listings, bids, proxy_bids, watchlists, orders)
// =====================================================================
const db = require('../config/db');
const { emitToListing, emitToUser } = require('../socket');
const order = require('./order.service'); // order.create() (Programmer)

const PUBLIC_STATUSES = ['active', 'ended'];

// แถว listings จาก DB -> รูปแบบที่ decideBid() ใช้ (สตางค์ / ms)
function toEngineListing(row) {
  return {
    id: row.id,
    status: row.status,
    sellerId: row.seller_id,
    startPrice: toSatang(row.start_price),
    bidIncrement: toSatang(row.bid_increment),
    currentPrice: toSatang(row.current_price),
    currentBidderId: row.current_bidder_id,
    reservePrice: toSatang(row.reserve_price),
    buyNowPrice: toSatang(row.buy_now_price),
    endAt: row.end_at ? new Date(row.end_at).getTime() : 0,
    extendCount: row.extend_count,
  };
}

const money = (satang) => (satang === null || satang === undefined ? null : Number(fromSatang(satang)));
const iso = (ms) => new Date(ms).toISOString();

// ล็อกแถว listing (กฎ: ล็อกก่อนอ่านค่าใดๆ) สินค้าที่ไม่เปิดสาธารณะตอบ NOT_FOUND (api-spec 0.4)
async function lockListing(conn, listingId) {
  const [[row]] = await conn.query('SELECT * FROM listings WHERE id = ? FOR UPDATE', [listingId]);
  if (!row || !PUBLIC_STATUSES.includes(row.status)) throw new AppError(404, 'NOT_FOUND', 'ไม่พบสินค้านี้');
  return row;
}

async function usernamesOf(conn, ids) {
  const unique = [...new Set(ids.map(Number))];
  if (!unique.length) return new Map();
  const [rows] = await conn.query('SELECT id, username FROM users WHERE id IN (?)', [unique]);
  return new Map(rows.map((r) => [Number(r.id), r.username]));
}

// ผู้ที่เคยบิด + คนใน Watchlist ของสินค้า (ใช้แจ้งเตือนต่อเวลา / ผู้แพ้)
async function bidderIds(listingId) {
  const [rows] = await db.query('SELECT DISTINCT bidder_id FROM bids WHERE listing_id = ?', [listingId]);
  return rows.map((r) => r.bidder_id);
}
async function watcherIds(listingId) {
  const [rows] = await db.query('SELECT user_id FROM watchlists WHERE listing_id = ?', [listingId]);
  return rows.map((r) => r.user_id);
}

/**
 * บิดหนึ่งครั้ง ใช้ทั้ง POST /api/listings/:id/bids (manual) และ PUT /api/listings/:id/proxy (proxy)
 * @param {object} p { listingId, user (req.user), amount (สตางค์), mode, ip, userAgent }
 */
async function placeBid({ listingId, user, amount, mode, ip = null, userAgent = null }) {
  const out = await db.withTransaction(async (conn) => {
    const row = await lockListing(conn, listingId);
    const L = toEngineListing(row);
    const now = Date.now();

    let leaderProxy = null;
    if (L.currentBidderId !== null) {
      const [[p]] = await conn.query(
        'SELECT max_amount FROM proxy_bids WHERE listing_id = ? AND bidder_id = ? AND is_active = 1',
        [listingId, L.currentBidderId],
      );
      if (p) leaderProxy = { maxAmount: toSatang(p.max_amount) };
    }

    const r = decideBid({ listing: L, leaderProxy, user, amount, mode, now });

    for (const b of r.bids) {
      await conn.query(
        `INSERT INTO bids (listing_id, bidder_id, amount, bid_type, ip_address, user_agent, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [listingId, b.bidderId, fromSatang(b.amount), b.bidType, ip, userAgent ? String(userAgent).slice(0, 255) : null, new Date(now)],
      );
    }
    for (const p of r.proxyUpserts) {
      await conn.query(
        `INSERT INTO proxy_bids (listing_id, bidder_id, max_amount, is_active, priority_at)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE max_amount = VALUES(max_amount), is_active = VALUES(is_active),
           priority_at = IF(?, VALUES(priority_at), priority_at)`,
        [listingId, p.bidderId, fromSatang(p.maxAmount), p.isActive ? 1 : 0, new Date(now), p.resetPriority ? 1 : 0],
      );
    }
    if (r.deactivateProxyOf !== null) {
      await conn.query('UPDATE proxy_bids SET is_active = 0 WHERE listing_id = ? AND bidder_id = ?', [listingId, r.deactivateProxyOf]);
    }
    await conn.query(
      `UPDATE listings SET current_price = ?, current_bidder_id = ?, bid_count = bid_count + ?,
         end_at = ?, extend_count = ? WHERE id = ?`,
      [fromSatang(r.price), r.leader, r.bids.length, new Date(r.endAt), r.extendCount, listingId],
    );

    const names = await usernamesOf(conn, r.bids.map((b) => b.bidderId)); // ทุกแถวที่ INSERT (ส่ง bid:new ทีละแถว)
    const [[myProxy]] = await conn.query(
      'SELECT max_amount, is_active FROM proxy_bids WHERE listing_id = ? AND bidder_id = ?',
      [listingId, user.id],
    );
    return { r, row, L, now, names, myProxy };
  });

  // ---------- หลัง COMMIT เท่านั้น ----------
  const { r, row, L, now, names, myProxy } = out;
  const bidCount = row.bid_count + r.bids.length;
  // QA RT-2: หนึ่งคำขออาจ INSERT หลายแถว (บิดของผู้ใช้ + Proxy ตอบกลับ) ส่ง bid:new ทุกแถวตามลำดับ
  // แถวก่อนสุดท้าย: ราคาและบิดขั้นต่ำ ณ แถวนั้น แถวสุดท้าย: ค่าสุดท้ายของคำขอ (r.price, r.minNextBid)
  // ห้ามส่ง user id ของผู้บิด (api-spec 12)
  const serverTime = iso(Date.now());
  r.bids.forEach((b, i) => {
    const isLast = i === r.bids.length - 1;
    emitToListing(listingId, 'bid:new', {
      listingId,
      currentPrice: money(isLast ? r.price : b.amount),
      minNextBid: money(isLast ? r.minNextBid : minNextBid({ ...L, currentPrice: b.amount })),
      bidCount: row.bid_count + i + 1,
      bidder: maskUsername(names.get(Number(b.bidderId))),
      amount: money(b.amount),
      bidType: b.bidType === 'proxy' ? 'auto' : b.bidType, // D-16
      endAt: iso(r.endAt),
      serverTime,
    });
  });
  if (r.leaderChanged) {
    emitToUser(r.leader, 'bid:leader', { listingId, isLeading: true, currentPrice: money(r.price) });
    if (r.prevLeader !== null) emitToUser(r.prevLeader, 'bid:leader', { listingId, isLeading: false, currentPrice: money(r.price) });
  }
  if (r.extended) emitToListing(listingId, 'auction:extended', { listingId, endAt: iso(r.endAt), extendCount: r.extendCount });

  let extendRecipientIds = [];
  if (r.extended) extendRecipientIds = [...(await bidderIds(listingId)), ...(await watcherIds(listingId))];
  await notifyBidResult({ listingId, result: r, extendRecipientIds });

  const isLeading = String(r.leader) === String(user.id);
  const base = {
    listingId,
    currentPrice: money(r.price),
    minNextBid: money(r.minNextBid),
    bidCount,
    isLeading,
    endAt: iso(r.endAt),
    extended: r.extended,
    extendCount: r.extendCount,
    serverTime: iso(now),
  };
  if (mode === 'manual') return base; // 6.1
  return { // 6.3: วงเงินส่งกลับให้เจ้าของ Proxy เท่านั้น (คนที่เรียกคือเจ้าของ)
    maxAmount: myProxy ? Number(myProxy.max_amount) : null,
    isActive: myProxy ? Boolean(myProxy.is_active) : false,
    ...base,
  };
}

// 6.2 GET /api/listings/:id/proxy — Proxy ของฉัน หรือ null
async function getMyProxy(listingId, userId) {
  const [[l]] = await db.query('SELECT status, current_bidder_id FROM listings WHERE id = ?', [listingId]);
  if (!l || !PUBLIC_STATUSES.includes(l.status)) throw new AppError(404, 'NOT_FOUND', 'ไม่พบสินค้านี้');
  const [[p]] = await db.query('SELECT max_amount, is_active FROM proxy_bids WHERE listing_id = ? AND bidder_id = ?', [listingId, userId]);
  if (!p) return null;
  return { maxAmount: Number(p.max_amount), isActive: Boolean(p.is_active), isLeading: String(l.current_bidder_id) === String(userId) };
}

// ปิดรายการใน transaction เดียวกับผู้เรียก (ใช้ทั้ง Buy Now และ Scheduler)
async function finishListing(conn, row, { result, winnerId }) {
  await conn.query(
    `UPDATE listings SET status = 'ended', result = ?, winner_id = ?, closed_at = UTC_TIMESTAMP() WHERE id = ?`,
    [result, winnerId, row.id],
  );
  await conn.query('UPDATE proxy_bids SET is_active = 0 WHERE listing_id = ?', [row.id]);
}

/**
 * 6.5 POST /api/listings/:id/buy-now — ปิดประมูลทันที ผล buy_now แล้วสร้าง Order (D-15)
 * @param {object} p { listingId, user, ip, userAgent }
 */
async function buyNow({ listingId, user, ip = null, userAgent = null }) {
  const out = await db.withTransaction(async (conn) => {
    const row = await lockListing(conn, listingId);
    const L = toEngineListing(row);
    const now = Date.now();
    if (L.status !== 'active') throw new AppError(409, 'AUCTION_NOT_ACTIVE', 'รายการนี้ไม่ได้อยู่ระหว่างประมูล');
    if (now >= L.endAt) throw new AppError(409, 'AUCTION_ENDED', 'การประมูลนี้หมดเวลาแล้ว');
    if (String(user.id) === String(L.sellerId)) throw new AppError(403, 'SELF_BIDDING', 'ไม่สามารถซื้อสินค้าของตัวเองได้');
    if (!isBuyNowAvailable(L)) throw new AppError(409, 'BUY_NOW_NOT_AVAILABLE', 'สินค้านี้ซื้อทันทีไม่ได้แล้ว');

    await conn.query(
      `INSERT INTO bids (listing_id, bidder_id, amount, bid_type, ip_address, user_agent, created_at)
       VALUES (?, ?, ?, 'buy_now', ?, ?, ?)`,
      [listingId, user.id, fromSatang(L.buyNowPrice), ip, userAgent ? String(userAgent).slice(0, 255) : null, new Date(now)],
    );
    await conn.query(
      'UPDATE listings SET current_price = ?, current_bidder_id = ?, bid_count = bid_count + 1 WHERE id = ?',
      [fromSatang(L.buyNowPrice), user.id, listingId],
    );
    await finishListing(conn, row, { result: 'buy_now', winnerId: user.id });
    const created = await order.create(listingId, user.id, money(L.buyNowPrice), { conn, closingType: 'buy_now' });
    return { row, L, created };
  });

  const { row, L, created } = out;
  const price = money(L.buyNowPrice);
  emitToListing(listingId, 'auction:closed', { listingId, result: 'buy_now', finalPrice: price, winnerId: user.id });
  await notifyClosed({ listingId, winnerId: user.id, orderId: created.orderId, price, sellerId: row.seller_id });
  return { listingId, orderId: created.orderId, price, paymentDueAt: created.paymentDueAt };
}

/**
 * Scheduler closeAuctions: ปิดรายการเดียวที่ end_at <= now (api-spec หัวข้อ 6 ตาราง closeAuctions)
 * คืน null ถ้ารายการถูกปิดไปแล้ว (เช่น Buy Now ชิงปิดก่อน)
 */
async function closeListing(listingId) {
  const out = await db.withTransaction(async (conn) => {
    const [[row]] = await conn.query('SELECT * FROM listings WHERE id = ? FOR UPDATE', [listingId]);
    if (!row || row.status !== 'active' || !row.end_at || new Date(row.end_at).getTime() > Date.now()) return null;
    const L = toEngineListing(row);

    let result;
    let winnerId = null;
    let created = null;
    if (L.currentBidderId === null) {
      result = 'no_bid';
    } else if (L.reservePrice !== null && L.currentPrice < L.reservePrice) {
      result = 'below_reserve';
    } else {
      result = 'has_winner';
      winnerId = L.currentBidderId;
    }
    await finishListing(conn, row, { result, winnerId });
    if (result === 'has_winner') {
      created = await order.create(listingId, winnerId, money(L.currentPrice), { conn, closingType: 'auction' });
    }
    return { row, L, result, winnerId, created };
  });
  if (!out) return null;

  const { row, L, result, winnerId, created } = out;
  const price = money(L.currentPrice);
  emitToListing(listingId, 'auction:closed', { listingId, result, finalPrice: price, winnerId });
  if (result === 'has_winner') {
    await notifyClosed({ listingId, winnerId, orderId: created.orderId, price, sellerId: row.seller_id });
  } else {
    await notifyNoWinner({ listingId, result, price, sellerId: row.seller_id });
  }
  return { listingId, result };
}

// มีผู้ชนะ (has_winner / buy_now): ผู้ชนะ AUCTION_WON, ผู้บิดคนอื่น AUCTION_LOST
// ผู้ขายใช้ AUCTION_WON + forSeller: true (api-spec 11, PR #9) ราคาส่งเป็น amount
async function notifyClosed({ listingId, winnerId, orderId, price, sellerId }) {
  await safeNotify(winnerId, EVENTS.AUCTION_WON, { listingId, orderId, amount: price });
  const losers = (await bidderIds(listingId)).filter((id) => String(id) !== String(winnerId));
  for (const id of losers) await safeNotify(id, EVENTS.AUCTION_LOST, { listingId, result: 'has_winner', amount: price });
  if (sellerId) await safeNotify(sellerId, EVENTS.AUCTION_WON, { listingId, orderId, amount: price, forSeller: true });
}

// ไม่มีผู้ชนะ (no_bid / below_reserve): ผู้บิดทุกคน AUCTION_LOST พร้อม result
// ผู้ขายใช้ AUCTION_LOST + forSeller: true + result (api-spec 11, PR #9)
async function notifyNoWinner({ listingId, result, price, sellerId }) {
  if (result === 'below_reserve') {
    for (const id of await bidderIds(listingId)) await safeNotify(id, EVENTS.AUCTION_LOST, { listingId, result, amount: price });
  }
  if (sellerId) await safeNotify(sellerId, EVENTS.AUCTION_LOST, { listingId, result, amount: price, forSeller: true });
}

/**
 * แจ้งเตือน "ใกล้หมดเวลา" (AUCTION_ENDING_SOON) ระยะจาก time.endingSoonMs (api-spec 11, PR #9)
 * เรียกจาก jobs/endingSoon.js ทุกรอบ scheduler กันส่งซ้ำด้วยคอลัมน์ในฐานข้อมูล (ปิด/เปิด server ใหม่ก็ไม่ส่งซ้ำหรือตกหล่น)
 * - คนใน Watchlist: watchlists.ending_soon_notified_at ต่อคน
 * - คนที่เคยบิด (ไม่ได้อยู่ใน Watchlist): listings.ending_soon_notified_at ต่อสินค้า ส่งครั้งเดียวตอนเข้าช่วง
 * จองแถวด้วย UPDATE ... WHERE ... IS NULL ก่อนส่ง จึงไม่ส่งซ้ำแม้ job ซ้อนกัน
 * @param {object} [p]
 * @param {number} [p.nowMs]
 * @returns {Promise<{ watchers: number, bidders: number }>}
 */
async function notifyEndingSoon({ nowMs = Date.now() } = {}) {
  const now = new Date(nowMs);
  const until = new Date(nowMs + time.endingSoonMs);
  let watchers = 0;
  let bidders = 0;

  const [watchRows] = await db.query(
    `SELECT w.id, w.user_id, w.listing_id
       FROM watchlists w JOIN listings l ON l.id = w.listing_id
      WHERE l.status = 'active' AND l.end_at > ? AND l.end_at <= ? AND w.ending_soon_notified_at IS NULL`,
    [now, until],
  );
  for (const w of watchRows) {
    const [res] = await db.query(
      'UPDATE watchlists SET ending_soon_notified_at = UTC_TIMESTAMP() WHERE id = ? AND ending_soon_notified_at IS NULL',
      [w.id],
    );
    if (res.affectedRows !== 1) continue; // รอบอื่นจองไปแล้ว
    await safeNotify(w.user_id, EVENTS.AUCTION_ENDING_SOON, { listingId: w.listing_id });
    watchers += 1;
  }

  const [listingRows] = await db.query(
    `SELECT id FROM listings
      WHERE status = 'active' AND end_at > ? AND end_at <= ? AND ending_soon_notified_at IS NULL`,
    [now, until],
  );
  for (const { id } of listingRows) {
    const [res] = await db.query(
      'UPDATE listings SET ending_soon_notified_at = UTC_TIMESTAMP() WHERE id = ? AND ending_soon_notified_at IS NULL',
      [id],
    );
    if (res.affectedRows !== 1) continue;
    const watching = new Set((await watcherIds(id)).map(String));
    for (const userId of await bidderIds(id)) {
      if (watching.has(String(userId))) continue; // ได้จาก Watchlist แล้ว
      await safeNotify(userId, EVENTS.AUCTION_ENDING_SOON, { listingId: id });
      bidders += 1;
    }
  }
  return { watchers, bidders };
}

// แจ้งเตือนล้มต้องไม่ทำให้งานที่ COMMIT แล้วล้ม
async function safeNotify(userId, event, data) {
  try {
    await notify(userId, event, data);
  } catch (err) {
    console.error('[auction] notify failed:', err.message);
  }
}

module.exports = {
  decideBid,
  notifyBidResult,
  placeBid,
  getMyProxy,
  buyNow,
  closeListing,
  notifyEndingSoon,
  toEngineListing,
  applyReserve,
  minNextBid,
  isBuyNowAvailable,
  maskUsername,
  toSatang,
  fromSatang,
  formatBaht,
};
