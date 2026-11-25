// ข้อมูลเดโม (Phase 3): สร้างผู้ใช้ ร้าน สินค้า การประมูล คำสั่งซื้อ ข้อพิพาท และบทลงโทษ ครบทุกสถานะ
// ใช้: npm run db:demo   (ลบข้อมูลเดิมทั้งหมด แล้วสร้างใหม่จาก db:init + ข้อมูลชุดนี้)
// ทุกอย่างสร้างผ่าน API และ Scheduler จริงของระบบ ยอดเงิน / Escrow / แจ้งเตือน / Audit Log จึงตรงกับการใช้งานจริง
// รันใกล้เวลาเดโม เพราะเวลาปิดประมูลของสินค้าที่กำลังประมูลนับจากตอนรัน (ดู ACTIVE ด้านล่าง)
// รูปสินค้าใน seeds/demo/ เป็นภาพประกอบที่สร้างขึ้น ไม่ใช่รูปสินค้าจริง สลิปเป็นสลิปจำลองที่เขียนกำกับไว้
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../src/config');
const db = require('../src/config/db');

if (config.env === 'production') {
  console.error('db:demo ใช้ใน production ไม่ได้');
  process.exit(1);
}

const IMG = path.join(__dirname, '..', 'seeds', 'demo');
const HOUR = 3600 * 1000;
const MIN = 60 * 1000;
let BASE = '';
// อีเมลจำลองและ log ของ Scheduler ระหว่างสร้างข้อมูลไม่ต้องแสดง (แสดงเฉพาะความคืบหน้าของสคริปต์)
const log = console.log.bind(console);
console.log = () => {};
const tokens = {};
const ids = {};

// ---------------------------------------------------------------- helpers
async function login(username) {
  const [[u]] = await db.pool.query('SELECT id FROM users WHERE username = ?', [username]);
  const token = crypto.randomBytes(32).toString('hex');
  await db.pool.query(
    `INSERT INTO sessions (user_id, token_hash, ip_address, user_agent, expires_at)
     VALUES (?, ?, '127.0.0.1', 'demo-seed script', UTC_TIMESTAMP() + INTERVAL 1 HOUR)`,
    [u.id, crypto.createHash('sha256').update(token).digest('hex')],
  );
  tokens[username] = token;
  ids[username] = Number(u.id);
}

async function call(who, method, url, body, files) {
  const headers = { Authorization: `Bearer ${tokens[who]}` };
  let payload;
  if (files) {
    payload = new FormData();
    for (const [k, v] of Object.entries(body || {})) payload.append(k, String(v));
    for (const [field, names] of Object.entries(files)) {
      for (const name of names) {
        const buf = fs.readFileSync(path.join(IMG, name));
        payload.append(field, new Blob([buf], { type: name.endsWith('.png') ? 'image/png' : 'image/jpeg' }), name);
      }
    }
  } else if (body) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(BASE + url, { method, headers, body: payload });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    throw new Error(`${method} ${url} (${who}) → ${res.status} ${JSON.stringify(json.error || json)}`);
  }
  return json.data;
}

const sql = (q, p = []) => db.pool.query(q, p);
const at = (ms) => new Date(Date.now() + ms);

// ---------------------------------------------------------------- 1. ผู้ใช้เพิ่ม (รหัสผ่าน Test@1234 เหมือนบัญชีทดสอบ)
const NEW_USERS = [
  { username: 'seller2', name: 'วิภา ของสะสม', display: 'วิภา', phone: '0811110002' },
  { username: 'seller3', name: 'ธนา ร้านใหม่', display: 'ธนา', phone: '0811110003' },
  { username: 'buyer3', name: 'กิตติ ผู้ซื้อ', display: 'กิตติ', phone: '0822220003' },
  { username: 'buyer4', name: 'มานี ผู้ซื้อ', display: 'มานี', phone: '0822220004' },
];
const ADDRESS = {
  seller2: ['วิภา ของสะสม', '0811110002', '88/8 ถนนท่าแพ', 'ช้างคลาน', 'เมืองเชียงใหม่', 'เชียงใหม่', '50100'],
  seller3: ['ธนา ร้านใหม่', '0811110003', '12 ถนนมิตรภาพ', 'ในเมือง', 'เมืองขอนแก่น', 'ขอนแก่น', '40000'],
  buyer3: ['กิตติ ผู้ซื้อ', '0822220003', '45 ถนนสุขุมวิท', 'บางนา', 'บางนา', 'กรุงเทพมหานคร', '10260'],
  buyer4: ['มานี ผู้ซื้อ', '0822220004', '7 ถนนนิมิตใหม่', 'ทรายกองดิน', 'คลองสามวา', 'กรุงเทพมหานคร', '10510'],
};

async function createUsers() {
  const wallet = require('../src/services/wallet');
  const [[ref]] = await sql("SELECT password_hash FROM users WHERE username = 'buyer1'");
  for (const u of NEW_USERS) {
    const [r] = await sql(
      `INSERT INTO users (email, username, password_hash, full_name, display_name, phone, role, status,
                          phone_verified_at, email_verified_at, activated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'bidder', 'active', UTC_TIMESTAMP(), UTC_TIMESTAMP(), UTC_TIMESTAMP())`,
      [`${u.username}@rakadee.local`, u.username, ref.password_hash, u.name, u.display, u.phone],
    );
    await wallet.create(r.insertId);
    await login(u.username);
    const [recipientName, phone, addressLine, subDistrict, district, province, postalCode] = ADDRESS[u.username];
    await call(u.username, 'POST', '/users/me/addresses', {
      recipientName, phone, addressLine, subDistrict, district, province, postalCode, isDefault: true,
    });
  }
  // ชื่อร้าน / ชื่อแสดงของบัญชีทดสอบเดิมให้ดูเหมือนจริงขึ้น
  const seller1Addr = (await call('seller1', 'GET', '/users/me/addresses')).items[0].id;
  await call('seller1', 'PUT', '/seller/profile', { shopName: 'Gadget Hub BKK', shopDescription: 'อุปกรณ์ไอทีมือสองสภาพดี ตรวจเช็กก่อนส่งทุกชิ้น', originProvince: 'กรุงเทพมหานคร', addressId: seller1Addr });
  await call('seller1', 'PATCH', '/users/me', { displayName: 'Gadget Hub', bio: 'ร้านไอทีมือสอง ตอบแชตไว ส่งทุกวัน' });
  await call('buyer1', 'PATCH', '/users/me', { displayName: 'สมชาย', bio: 'ชอบสะสมของเก่าและแกดเจ็ต' });
  await call('buyer2', 'PATCH', '/users/me', { displayName: 'สมหญิง', bio: '' });
}

// ---------------------------------------------------------------- 2. ร้านค้า (D-18): seller2 อนุมัติแล้ว, seller3 รออนุมัติ
async function createShops() {
  const addr = async (who) => (await call(who, 'GET', '/users/me/addresses')).items[0].id;
  await call('seller2', 'POST', '/seller/profile', {
    shopName: 'บ้านของสะสม', shopDescription: 'การ์ด ฟิกเกอร์ เหรียญ แสตมป์ ของแท้ทุกชิ้น', originProvince: 'เชียงใหม่', addressId: await addr('seller2'),
  });
  await call('admin', 'POST', `/admin/seller-applications/${ids.seller2}/reject`, { reason: 'กรุณาเพิ่มรายละเอียดร้านว่าขายสินค้าประเภทใด' });
  await call('seller2', 'POST', '/seller/profile', {
    shopName: 'บ้านของสะสม', shopDescription: 'การ์ด ฟิกเกอร์ เหรียญ แสตมป์ ของแท้ทุกชิ้น รับประกันคืนเงินถ้าไม่ตรงปก', originProvince: 'เชียงใหม่', addressId: await addr('seller2'),
  });
  await call('admin', 'POST', `/admin/seller-applications/${ids.seller2}/approve`);
  await call('seller3', 'POST', '/seller/profile', {
    shopName: 'ธนาแฟชั่น', shopDescription: 'เสื้อผ้าและรองเท้ามือสองแบรนด์ดัง', originProvince: 'ขอนแก่น', addressId: await addr('seller3'),
  });
}

// ---------------------------------------------------------------- 3. สินค้า
// cond: new | used_good | defective · img: ไฟล์ใน seeds/demo
function listingBody(l) {
  return {
    title: l.title, categoryId: l.cat, description: l.desc, includedItems: l.included || '',
    itemCondition: l.cond, defectDetail: l.cond === 'new' ? '' : (l.defect || 'ไม่มีตำหนิ'),
    originProvince: l.province || 'กรุงเทพมหานคร', shippingFee: l.ship ?? 50,
    startPrice: l.start, bidIncrement: l.inc, reservePrice: l.reserve ?? '', buyNowPrice: l.buyNow ?? '',
    durationDays: l.days || 7,
  };
}

async function createListing(l, { submit = true, approve = true } = {}) {
  const created = await call(l.seller, 'POST', '/listings', listingBody(l));
  const id = created.id || (created.listing && created.listing.id);
  await call(l.seller, 'POST', `/listings/${id}/images`, {}, { images: l.img });
  if (submit) await call(l.seller, 'POST', `/listings/${id}/submit`);
  if (submit && approve) await call('admin', 'POST', `/admin/listings/${id}/approve`);
  return id;
}

const bid = (who, id, amount) => call(who, 'POST', `/listings/${id}/bids`, { amount });
// บิดที่ราคาขั้นต่ำถัดไปตามที่ระบบคำนวณ (ใช้หลังมี Proxy ที่ดันราคาอัตโนมัติ)
const bidMin = async (who, id) => bid(who, id, (await call(who, 'GET', `/listings/${id}`)).minNextBid);
const proxy = (who, id, maxAmount) => call(who, 'PUT', `/listings/${id}/proxy`, { maxAmount });

async function endNow(listingId) {
  await sql('UPDATE listings SET end_at = UTC_TIMESTAMP() - INTERVAL 1 SECOND WHERE id = ?', [listingId]);
  await require('../src/jobs/closeAuctions').run();
  const [[o]] = await sql('SELECT id FROM orders WHERE listing_id = ?', [listingId]);
  return o ? Number(o.id) : null;
}

async function pay(buyer, orderId) {
  const d = await call(buyer, 'POST', `/orders/${orderId}/pay`, { slipReference: `DEMO${orderId}` }, { slip: ['slip-mock.png'] });
  return d.paymentId || (d.payment && d.payment.id);
}
const approvePay = (paymentId) => call('admin', 'POST', `/admin/payments/${paymentId}/approve`);
const ship = (seller, orderId, carrier, tracking) => call(seller, 'POST', `/orders/${orderId}/shipment`,
  { carrier, trackingNumber: tracking, shippedAt: new Date().toISOString(), note: 'ห่อกันกระแทก 2 ชั้น' }, { proof: ['proof-parcel.jpg'] });
const confirm = (buyer, orderId) => call(buyer, 'POST', `/orders/${orderId}/confirm-receipt`);

// ---------------------------------------------------------------- สินค้าที่ปิดแล้ว → คำสั่งซื้อแต่ละสถานะ
async function endedListings() {
  const out = {};
  const won = async (key, l, bids, winnerFlow) => {
    const id = await createListing(l);
    for (const [who, amount] of bids) await bid(who, id, amount);
    out[key] = { listingId: id, orderId: await endNow(id) };
    if (winnerFlow) await winnerFlow(out[key].orderId);
    return out[key];
  };

  // คำสั่งซื้อที่สำเร็จแล้ว (ย้อนเวลาไปหลังสร้าง เพื่อให้กราฟ Dashboard มีข้อมูลหลายวัน)
  const complete = (buyer, seller, carrier, tracking) => async (orderId) => {
    await approvePay(await pay(buyer, orderId));
    await ship(seller, orderId, carrier, tracking);
    await confirm(buyer, orderId);
  };
  await won('done1', { seller: 'seller2', title: 'การ์ดมังกรขาวตาสีฟ้า พิมพ์ครั้งแรก', cat: 21, cond: 'used_good', defect: 'มุมล่างซ้ายมีรอยถลอกเล็กน้อย', desc: 'การ์ดสะสมพิมพ์ครั้งแรก เก็บในซองกันรอยตลอด', start: 500, inc: 50, ship: 40, img: ['card.jpg'], province: 'เชียงใหม่' },
    [['buyer2', 500], ['buyer1', 600], ['buyer2', 700], ['buyer1', 850]], complete('buyer1', 'seller2', 'thailand_post', 'EF123456789TH'));
  await won('done2', { seller: 'seller1', title: 'เก้าอี้สำนักงาน Ergonomic ปรับระดับได้', cat: 41, cond: 'used_good', defect: 'ที่วางแขนซ้ายมีรอยขีดข่วน', desc: 'เก้าอี้สุขภาพ พนักพิงตาข่าย ปรับความสูงและเอนได้', start: 900, inc: 100, ship: 150, img: ['chair.jpg'] },
    [['buyer1', 900], ['buyer2', 1200], ['buyer1', 1400], ['buyer2', 1500]], complete('buyer2', 'seller1', 'flash', 'TH0112233445'));
  await won('done3', { seller: 'seller1', title: 'ไมโครเวฟ 23 ลิตร ระบบดิจิทัล', cat: 42, cond: 'used_good', defect: 'ไม่มีตำหนิ', desc: 'ใช้งานปกติทุกฟังก์ชัน ล้างทำความสะอาดแล้ว', start: 800, inc: 100, ship: 100, img: ['microwave.jpg'] },
    [['buyer2', 800], ['buyer4', 1000], ['buyer2', 1200]], complete('buyer2', 'seller1', 'kerry', 'KER7788990011'));
  await won('done5', { seller: 'seller2', title: 'ฟิกเกอร์อนิเมะสเกล 1/7 ครบกล่อง', cat: 22, cond: 'new', desc: 'ของใหม่ยังไม่แกะซีล กล่องสวย', start: 1800, inc: 100, ship: 50, img: ['figure.jpg'], province: 'เชียงใหม่' },
    [['buyer1', 1800], ['buyer4', 2000], ['buyer1', 2200], ['buyer4', 2300]], complete('buyer4', 'seller2', 'jt', 'JT556677889900'));

  // ซื้อทันที (Buy Now) แล้วสำเร็จ
  {
    const id = await createListing({ seller: 'seller2', title: 'แสตมป์ชุดที่ระลึก ปี 2530 (4 ดวง)', cat: 23, cond: 'used_good', defect: 'ไม่มีตำหนิ', desc: 'แสตมป์ยังไม่ใช้งาน เก็บในอัลบั้ม', start: 300, inc: 20, buyNow: 450, ship: 30, img: ['stamp.jpg'], province: 'เชียงใหม่' });
    const d = await call('buyer3', 'POST', `/listings/${id}/buy-now`, { confirm: true });
    const orderId = d.orderId || (d.order && d.order.id);
    await complete('buyer3', 'seller2', 'thailand_post', 'EF987654321TH')(orderId);
    out.done4 = { listingId: id, orderId };
  }

  // ข้อพิพาท: ส่งของแล้ว ผู้ซื้อแจ้งว่าไม่ตรงปก ผู้ขายส่งหลักฐานกลับ แอดมินกำลังตรวจ
  await won('dispute', { seller: 'seller1', title: 'คีย์บอร์ด Mechanical สวิตช์แดง', cat: 12, cond: 'used_good', defect: 'ไม่มีตำหนิ', desc: 'คีย์บอร์ดเกมมิ่ง ไฟ RGB ใช้งานได้ทุกปุ่ม', start: 1200, inc: 100, ship: 50, img: ['keyboard.jpg'] },
    [['buyer3', 1200], ['buyer1', 1400], ['buyer3', 1500], ['buyer1', 1600]], async (orderId) => {
      await approvePay(await pay('buyer1', orderId));
      await ship('seller1', orderId, 'kerry', 'KER1122334455');
      const d = await call('buyer1', 'POST', `/orders/${orderId}/disputes`, {
        type: 'not_as_described', description: 'ปุ่มตัว Y หลุดหายตั้งแต่เปิดกล่อง แต่ประกาศบอกว่าใช้งานได้ทุกปุ่ม', contactInfo: 'LINE: somchai.demo', note: 'ถ่ายตอนเปิดกล่อง',
      }, { files: ['evidence-key.jpg', 'evidence-box.jpg'] });
      await call('seller1', 'POST', `/disputes/${d.disputeId}/evidence`, { note: 'ภาพก่อนแพ็ก ปุ่มครบทุกตัว' }, { files: ['keyboard.jpg'] });
      await call('admin', 'PATCH', `/admin/disputes/${d.disputeId}/status`, { status: 'investigating', note: 'ตรวจรูปทั้งสองฝ่ายอยู่' });
      out.disputeId = d.disputeId;
    });

  // อยู่ระหว่างจัดส่ง → ผู้ซื้อกดยืนยันรับได้
  await won('shipped', { seller: 'seller1', title: 'แจ็คเก็ตยีนส์ วินเทจ ไซซ์ L', cat: 31, cond: 'used_good', defect: 'สีซีดตามอายุผ้า', desc: 'ผ้ายีนส์หนา ทรงสวย อก 44 นิ้ว ยาว 26 นิ้ว', start: 600, inc: 50, ship: 50, img: ['jacket.jpg'] },
    [['buyer4', 600], ['buyer2', 800], ['buyer4', 850], ['buyer2', 900]], async (orderId) => {
      await approvePay(await pay('buyer2', orderId));
      await ship('seller1', orderId, 'flash', 'TH0998877665');
    });

  // รอจัดส่ง → ผู้ขายบันทึกจัดส่งได้
  await won('awaitShip', { seller: 'seller1', title: 'กระเป๋าหนังสะพายข้าง สีน้ำตาล', cat: 33, cond: 'used_good', defect: 'ขอบสายมีรอยถลอกเล็กน้อย', desc: 'หนังแท้ ช่องเยอะ ใส่แท็บเล็ต 10 นิ้วได้', start: 1500, inc: 100, ship: 60, img: ['bag.jpg'] },
    [['buyer3', 1500], ['buyer1', 1800], ['buyer3', 2100], ['buyer1', 2200]], async (orderId) => {
      await approvePay(await pay('buyer1', orderId));
    });

  // ชำระแล้วรอแอดมินตรวจ → แอดมินอนุมัติ / ปฏิเสธได้
  await won('review', { seller: 'seller1', title: 'ลำโพงบลูทูธพกพา กันน้ำ IP67', cat: 14, cond: 'used_good', defect: 'ไม่มีตำหนิ', desc: 'เสียงดี เบสแน่น แบตอยู่ได้ 20 ชั่วโมง', start: 2500, inc: 100, ship: 60, img: ['speaker.jpg'] },
    [['buyer4', 2500], ['buyer2', 2900], ['buyer4', 3100], ['buyer2', 3200]], async (orderId) => {
      await pay('buyer2', orderId);
    });

  // รอชำระเงิน → ผู้ซื้อกดชำระได้ (เดโมหน้าชำระเงิน)
  await won('pending', { seller: 'seller1', title: 'แท็บเล็ต 10.2 นิ้ว 64GB Wi-Fi', cat: 11, cond: 'used_good', defect: 'มีรอยขนแมวที่หลังเครื่อง', desc: 'แบตสุขภาพ 89% อุปกรณ์ครบกล่อง', included: 'เครื่อง, สายชาร์จ, กล่อง', start: 3500, inc: 100, ship: 60, img: ['tablet.jpg'] },
    [['buyer3', 3500], ['buyer1', 4000], ['buyer3', 4300], ['buyer1', 4500]]);

  // ไม่ชำระตามกำหนด → ยกเลิก + บทลงโทษครั้งที่ 1 (คำเตือน)
  await won('timeout', { seller: 'seller2', title: 'โมเดลรถเหล็ก สเกล 1:18', cat: 22, cond: 'new', desc: 'โมเดลรถสะสม เปิดประตูได้ ครบกล่อง', start: 1000, inc: 50, ship: 80, img: ['car.jpg'], province: 'เชียงใหม่' },
    [['buyer4', 1000], ['buyer3', 1100], ['buyer4', 1150], ['buyer3', 1300]], async (orderId) => {
      await sql('UPDATE orders SET payment_due_at = UTC_TIMESTAMP() - INTERVAL 1 MINUTE WHERE id = ?', [orderId]);
      await require('../src/jobs/paymentTimeout').run();
    });

  // ปิดแบบไม่มีผู้ชนะ
  {
    const id = await createListing({ seller: 'seller2', title: 'แจกันเซรามิกลายคราม', cat: 24, cond: 'used_good', defect: 'ปากแจกันบิ่นเล็กน้อย', desc: 'แจกันเก่าเก็บ สูง 30 ซม.', start: 2500, inc: 100, ship: 120, img: ['vase.jpg'], province: 'เชียงใหม่' });
    await endNow(id); // no_bid
    const id2 = await createListing({ seller: 'seller1', title: 'กีตาร์โปร่ง 41 นิ้ว พร้อมกระเป๋า', cat: 51, cond: 'used_good', defect: 'มีรอยปิ๊กที่หน้ากีตาร์', desc: 'เสียงใส สายใหม่ ตั้งคอแล้ว', start: 1500, inc: 100, reserve: 3000, ship: 150, img: ['guitar.jpg'] });
    await bid('buyer4', id2, 1500); await bid('buyer3', id2, 1800);
    await endNow(id2); // below_reserve
  }
  return out;
}

// ย้อนเวลาคำสั่งซื้อที่สำเร็จ (กราฟ Dashboard 30 วัน) iv(h) = เวลาสร้าง Order + h ชั่วโมง
async function backdate(orderId, daysAgo) {
  const iv = (h) => `UTC_TIMESTAMP() - INTERVAL ${Number(daysAgo) * 24 - h} HOUR`;
  await sql(`UPDATE orders SET created_at = ${iv(0)}, paid_at = ${iv(2)}, shipped_at = ${iv(20)}, completed_at = ${iv(60)},
             payment_due_at = ${iv(48)}, ship_due_at = ${iv(2 + 72)}, auto_release_at = ${iv(20 + 24 * 7)} WHERE id = ?`, [orderId]);
  await sql(`UPDATE escrows SET held_at = ${iv(3)}, released_at = ${iv(60)} WHERE order_id = ?`, [orderId]);
  await sql(`UPDATE shipments SET shipped_at = ${iv(20)}, created_at = ${iv(20)} WHERE order_id = ?`, [orderId]);
  await sql(`UPDATE payments SET created_at = ${iv(1)}, reviewed_at = ${iv(2)} WHERE order_id = ?`, [orderId]);
  await sql(`UPDATE bids b JOIN orders o ON o.listing_id = b.listing_id SET b.created_at = ${iv(-24)} WHERE o.id = ?`, [orderId]);
  await sql(`UPDATE listings l JOIN orders o ON o.listing_id = l.id
               SET l.start_at = ${iv(-24 * 7)}, l.end_at = ${iv(0)}, l.closed_at = ${iv(0)}, l.created_at = ${iv(-24 * 8)},
                   l.submitted_at = ${iv(-24 * 7 - 2)}, l.reviewed_at = ${iv(-24 * 7)}
             WHERE o.id = ?`, [orderId]);
}

// ---------------------------------------------------------------- สินค้าที่กำลังประมูล / รอตรวจ / ร่าง / ไม่อนุมัติ
async function liveListings() {
  const out = {};
  // แข่งกันอยู่ มี Proxy (ราคาขั้นต่ำถึงแล้ว) ปิดใน 3 ชม.
  out.hot = await createListing({ seller: 'seller1', title: 'สมาร์ตโฟน 128GB สีมิดไนท์ ประกันเหลือ 3 เดือน', cat: 11, cond: 'used_good', defect: 'มีรอยขนแมวที่ขอบเครื่องด้านขวา', desc: 'เครื่องศูนย์ไทย แบต 91% สแกนหน้าใช้ได้ ไม่เคยซ่อม', included: 'เครื่อง, กล่อง, สายชาร์จ', start: 9000, inc: 200, reserve: 10000, ship: 60, img: ['phone.jpg'] });
  await bid('buyer1', out.hot, 9000);
  await bid('buyer4', out.hot, 9400);
  await proxy('buyer2', out.hot, 11000); // Proxy บิดแทนทีละขั้น ไม่บิดเต็มวงเงิน
  await bidMin('buyer1', out.hot);
  await bidMin('buyer1', out.hot);
  // ใกล้จบ (ไม่ถึงราคาขั้นต่ำ) ปิดใน 45 นาที
  out.soon = await createListing({ seller: 'seller2', title: 'การ์ดมังกรไฟ เกรด 8 ในเคส', cat: 21, cond: 'used_good', defect: 'ไม่มีตำหนิ', desc: 'การ์ดเกรดแล้ว เคสใสไม่มีรอยร้าว', start: 2000, inc: 100, reserve: 8000, ship: 40, img: ['card.jpg'], province: 'เชียงใหม่' });
  await bid('buyer2', out.soon, 2000); await bid('buyer1', out.soon, 3000); await bid('buyer2', out.soon, 4500);
  // มี Buy Now ยังไม่มีคนบิด (เดโมซื้อทันที)
  out.buyNow = await createListing({ seller: 'seller1', title: 'หูฟังไร้สายตัดเสียงรบกวน', cat: 14, cond: 'used_good', defect: 'ฟองน้ำครอบหูเริ่มลอกเล็กน้อย', desc: 'ตัดเสียงดีมาก แบตยังอึด ใช้งานประมาณ 1 ปี', start: 3500, inc: 100, buyNow: 6500, ship: 50, img: ['headphones.jpg'] });
  out.figure = await createListing({ seller: 'seller2', title: 'ฟิกเกอร์นักรบ ลิมิเต็ดอิดิชัน', cat: 22, cond: 'new', desc: 'ผลิตจำนวนจำกัด มีใบรับรอง', start: 1500, inc: 50, ship: 50, img: ['figure.jpg'], province: 'เชียงใหม่' });
  await bid('buyer3', out.figure, 1500); await bid('buyer1', out.figure, 1650);
  out.camera = await createListing({ seller: 'seller1', title: 'กล้องมิเรอร์เลส พร้อมเลนส์คิต 15-45', cat: 13, cond: 'used_good', defect: 'ไม่มีตำหนิ', desc: 'ชัตเตอร์ 8,000 ครั้ง เซนเซอร์สะอาด', included: 'กล้อง, เลนส์, แบต 2 ก้อน, สายคล้อง', start: 15000, inc: 500, buyNow: 21000, ship: 80, img: ['camera.jpg'] });
  out.coin = await createListing({ seller: 'seller2', title: 'เหรียญ 10 บาท ที่ระลึก ปี 2539', cat: 23, cond: 'used_good', defect: 'ไม่มีตำหนิ', desc: 'เหรียญสภาพสวย ไม่ผ่านการใช้งาน', start: 300, inc: 20, ship: 30, img: ['coin.jpg'], province: 'เชียงใหม่' });
  await bid('buyer3', out.coin, 300); await bid('buyer2', out.coin, 340); await bid('buyer3', out.coin, 400);
  out.watch = await createListing({ seller: 'seller1', title: 'นาฬิกาข้อมือออโตเมติก หน้าปัดน้ำเงิน', cat: 34, cond: 'used_good', defect: 'กระจกมีรอยขนแมว', desc: 'เดินตรง เก็บในกล่อง', start: 2500, inc: 100, ship: 50, img: ['watch.jpg'] });

  const ends = { hot: 3 * HOUR, soon: 45 * MIN, buyNow: 26 * HOUR, figure: 2 * 24 * HOUR, camera: 3 * 24 * HOUR, coin: 6 * HOUR, watch: 5 * 24 * HOUR };
  for (const [k, ms] of Object.entries(ends)) await sql('UPDATE listings SET end_at = ? WHERE id = ?', [at(ms), out[k]]);

  // รอแอดมินตรวจ 2 รายการ (เดโมอนุมัติ / ไม่อนุมัติ)
  out.pending1 = await createListing({ seller: 'seller1', title: 'โน้ตบุ๊ก 13 นิ้ว RAM 8GB SSD 256GB', cat: 12, cond: 'used_good', defect: 'มุมเครื่องมีรอยบุบเล็กน้อย', desc: 'เปิดติดเร็ว แบต 87% เหมาะทำงานเอกสาร', start: 12000, inc: 300, reserve: 15000, buyNow: 19000, ship: 80, img: ['laptop.jpg'] }, { approve: false });
  out.pending2 = await createListing({ seller: 'seller2', title: 'รองเท้าผ้าใบ ไซซ์ 42', cat: 32, cond: 'defective', defect: 'พื้นรองเท้าสึกด้านหลัง', desc: 'ใส่สบาย ซักทำความสะอาดแล้ว', start: 700, inc: 50, ship: 60, img: ['shoe.jpg'], province: 'เชียงใหม่' }, { approve: false });
  // ฉบับร่าง
  out.draft = await createListing({ seller: 'seller1', title: 'พัดลมตั้งพื้น 16 นิ้ว', cat: 42, cond: 'used_good', defect: 'ไม่มีตำหนิ', desc: 'ลมแรง 3 ระดับ ส่ายได้', start: 400, inc: 20, ship: 120, img: ['fan.jpg'] }, { submit: false });
  // ไม่อนุมัติ (แสดงเหตุผลในหน้าสินค้าของฉัน)
  out.rejected = await createListing({ seller: 'seller2', title: 'กล่องพัสดุเปล่า 50 ใบ', cat: 51, cond: 'new', desc: 'กล่องไปรษณีย์ขนาด C', start: 100, inc: 10, ship: 50, img: ['proof-parcel.jpg'], province: 'เชียงใหม่' }, { approve: false });
  await call('admin', 'POST', `/admin/listings/${out.rejected}/reject`, { reason: 'รูปไม่ตรงกับรายละเอียด กรุณาถ่ายรูปสินค้าจริงพร้อมจำนวน' });
  return out;
}

// ---------------------------------------------------------------- main
async function main() {
  const app = require('../src/app');
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  BASE = `http://127.0.0.1:${server.address().port}/api`;
  try {
    for (const u of ['superadmin', 'admin', 'seller1', 'buyer1', 'buyer2']) await login(u);
    log('1/5 ผู้ใช้และที่อยู่');
    await createUsers();
    log('2/5 ร้านค้า (D-18)');
    await createShops();
    log('3/5 สินค้าที่ปิดแล้วและคำสั่งซื้อทุกสถานะ');
    const ended = await endedListings();
    for (const [key, days] of [['done1', 18], ['done2', 12], ['done3', 8], ['done4', 4], ['done5', 2]]) await backdate(ended[key].orderId, days);
    log('4/5 สินค้าที่กำลังประมูล รอตรวจ ร่าง และไม่อนุมัติ');
    const live = await liveListings();
    log('5/5 บัญชีที่ถูกระงับโดยแอดมิน และ IP ของการบิด');
    // สคริปต์บิดจากเครื่องเดียว (localhost) ทุกบิดจึงมี IP เดียวกัน → จำลองให้แต่ละคนบิดจากคนละเครื่อง
    await sql("UPDATE bids SET ip_address = CONCAT('10.20.0.', bidder_id)");
    // ยกเว้น 1 กรณีให้ระบบจับได้ (detectShill: same_ip): buyer3 บิดเหรียญของ seller2 จาก IP เดียวกับที่ seller2 เคย login
    const sellerIp = `10.20.0.${ids.seller2}`;
    await sql("UPDATE bids SET ip_address = ? WHERE listing_id = ? AND bidder_id = ?", [sellerIp, live.coin, ids.buyer3]);
    await sql(`INSERT INTO sessions (user_id, token_hash, ip_address, user_agent, expires_at, revoked_at)
               VALUES (?, ?, ?, 'Mozilla/5.0 (demo)', UTC_TIMESTAMP() - INTERVAL 1 DAY, UTC_TIMESTAMP() - INTERVAL 1 DAY)`,
    [ids.seller2, crypto.randomBytes(32).toString('hex'), sellerIp]);
    await call('admin', 'POST', `/admin/users/${ids.buyer4}/status`, { status: 'suspended', until: at(3 * 24 * HOUR).toISOString(), reason: 'บิดแล้วทิ้งหลายรายการ ระงับเพื่อตรวจสอบ' });
    await sql("DELETE FROM sessions WHERE user_agent = 'demo-seed script'");

    const [[money]] = await sql(`SELECT (SELECT SUM(balance) FROM wallets) w,
      (SELECT COALESCE(SUM(amount), 0) FROM escrows WHERE status = 'held') e,
      (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE status = 'pending_review') p,
      (SELECT COALESCE(SUM(fee_amount), 0) FROM escrows WHERE status = 'released') f,
      (SELECT SUM(amount) FROM wallet_transactions WHERE type = 'initial_credit') c`);
    log(`\nเงินรวม: Wallet ${money.w} + Escrow ${money.e} + รอตรวจ ${money.p} + ค่าธรรมเนียม ${money.f} = ${(Number(money.w) + Number(money.e) + Number(money.p) + Number(money.f)).toFixed(2)} (เครดิตแรกเข้า ${money.c})`);
    log('\nพร้อมเดโม (รหัสผ่านสมาชิกทุกคน Test@1234, admin / Admin@1234, superadmin / Super@1234)');
    log(`  คำสั่งซื้อรอชำระ  #ORD-${ended.pending.orderId} (buyer1)      รอแอดมินตรวจ #ORD-${ended.review.orderId} (buyer2)`);
    log(`  รอจัดส่ง         #ORD-${ended.awaitShip.orderId} (seller1)     กำลังจัดส่ง  #ORD-${ended.shipped.orderId} (buyer2 ยืนยันรับ)`);
    log(`  ข้อพิพาท         #DSP-${String(ended.disputeId).padStart(4, '0')} (#ORD-${ended.dispute.orderId})`);
    log(`  ประมูลแข่งกัน     listing ${live.hot} (ปิดใน 3 ชม.)  ใกล้จบ ${live.soon} (45 นาที)  ซื้อทันที ${live.buyNow}`);
    log(`  รออนุมัติ         listing ${live.pending1}, ${live.pending2}  · ร้านรออนุมัติ: seller3`);
    log('  ต่อเวลาสด (Auto Extend): node scripts/demo-ending.js <listingId> <นาที>');
  } finally {
    server.close();
    await db.pool.end();
  }
}

main().catch((err) => {
  console.error('\nสร้างข้อมูลเดโมไม่สำเร็จ:', err.message);
  process.exit(1);
});
