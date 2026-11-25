// ข้อความแจ้งเตือนของแต่ละ event (api-spec หัวข้อ 11 ตาราง Event, requirement ข้อ 7 การแจ้งเตือน)
// group ใช้กับ notification_settings: auction | finance | shipping (null = ปิดไม่ได้)
// data ที่ใช้ได้: listingId, listingTitle, orderId, amount (หรือ currentPrice / price / finalPrice), reason, result, forSeller,
//                endAt, extendCount, trackingNumber, carrier, proxyStopped, link,
//                disputeId, status, resolution, note, action, penaltyType, until, count
const time = require('../config/time');

const baht = (n) => `฿${Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const item = (d) => d.listingTitle || (d.listingId ? `สินค้า #${d.listingId}` : 'สินค้า');
const price = (d) => d.amount ?? d.currentPrice ?? d.price ?? d.finalPrice;
const hours = (ms) => Math.round(ms / 3600000);
const minutes = (ms) => Math.round(ms / 60000);
// วันเวลาตามเวลาไทยในข้อความ เช่น "25 พ.ย. 2569 14:30 น."
const thaiTime = (v) => `${new Date(v).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })} น.`;
const order = (d) => (d.orderId ? `#ORD-${d.orderId}` : '');

const listingLink = (d) => (d.listingId ? `/pages/listing.html?id=${d.listingId}` : null);
const orderLink = (d) => (d.orderId ? `/pages/orders.html?id=${d.orderId}` : null);
const disputeLink = (d) => (d.disputeId ? `/pages/disputes.html?id=${d.disputeId}` : orderLink(d));
const DISPUTE_STATUS_TH = {
  awaiting_evidence: 'รอหลักฐาน',
  investigating: 'กำลังตรวจสอบ',
  return_in_progress: 'ดำเนินการคืนสินค้า',
  refund_in_progress: 'ดำเนินการคืนเงิน',
};

const TEMPLATES = {
  ACCOUNT_VERIFY: {
    group: null, web: false, email: true,
    title: () => 'ยืนยันอีเมลของคุณ',
    message: (d) => `กดลิงก์เพื่อยืนยันอีเมล: ${d.link || ''}`,
    link: () => null,
  },
  PASSWORD_RESET: {
    group: null, web: false, email: true,
    title: () => 'ตั้งรหัสผ่านใหม่',
    message: (d) => `กดลิงก์เพื่อตั้งรหัสผ่านใหม่ (ใช้ได้ ${minutes(time.passwordResetExpireMs)} นาที ครั้งเดียว): ${d.link || ''}`,
    link: () => null,
  },
  // D-18 ผลการตรวจคำขอเปิดร้าน (ปิดไม่ได้)
  SELLER_APPROVED: {
    group: null,
    title: () => 'ร้านของคุณได้รับการอนุมัติ',
    message: () => 'คุณเป็นผู้ขายแล้ว เริ่มลงสินค้าประมูลได้เลย',
    link: () => '/pages/seller/listing-form.html',
  },
  SELLER_REJECTED: {
    group: null,
    title: () => 'คำขอเปิดร้านไม่ผ่านการอนุมัติ',
    message: (d) => `${d.reason ? `เหตุผล: ${d.reason} ` : ''}แก้ไขข้อมูลแล้วยื่นใหม่ได้`,
    link: () => '/pages/seller/open-shop.html',
  },
  LISTING_APPROVED: {
    group: 'auction',
    title: () => 'สินค้าได้รับการอนุมัติ',
    message: (d) => `${item(d)} เริ่มประมูลแล้ว`,
    link: listingLink,
  },
  LISTING_REJECTED: {
    group: 'auction',
    title: () => 'สินค้าไม่ผ่านการอนุมัติ',
    message: (d) => `${item(d)}${d.reason ? ` เหตุผล: ${d.reason}` : ''}`,
    link: (d) => (d.listingId ? `/pages/seller/listing-form.html?id=${d.listingId}` : null),
  },
  OUTBID: {
    group: 'auction',
    title: () => 'คุณถูกบิดแซง',
    message: (d) => `${item(d)} ถูกเสนอราคา ${baht(price(d))}${d.proxyStopped ? ' — Proxy ของคุณหยุดทำงานเพราะราคาเกินวงเงิน เพิ่มวงเงินหรือบิดเองได้' : ''}`,
    link: listingLink,
  },
  AUCTION_EXTENDED: {
    group: 'auction',
    title: () => 'ต่อเวลาอัตโนมัติ',
    message: (d) => `${item(d)} ต่อเวลาอีก ${minutes(time.autoExtendMs)} นาที${d.extendCount ? ` (ครั้งที่ ${d.extendCount}/${time.autoExtendMaxCount})` : ''}`,
    link: listingLink,
  },
  AUCTION_ENDING_SOON: {
    group: 'auction',
    title: () => 'ใกล้หมดเวลาประมูล',
    message: (d) => `${item(d)} ใกล้ปิดประมูลแล้ว`,
    link: listingLink,
  },
  // ผู้ขายใช้ event เดียวกัน ส่ง forSeller: true (api-spec 11 ตาราง Event)
  AUCTION_WON: {
    group: 'auction',
    title: (d) => (d.forSeller ? 'สินค้าของคุณขายได้แล้ว' : 'คุณชนะการประมูล!'),
    message: (d) => (d.forSeller
      ? `${item(d)} ปิดที่ราคา ${baht(price(d))} รอผู้ซื้อชำระเงินภายใน ${hours(time.paymentDueMs)} ชม.`
      : `${item(d)} ราคา ${baht(price(d))} กรุณาชำระภายใน ${hours(time.paymentDueMs)} ชม.`),
    link: (d) => (d.forSeller ? listingLink(d) : orderLink(d) || listingLink(d)),
  },
  AUCTION_LOST: {
    group: 'auction',
    title: (d) => (d.forSeller ? 'ปิดประมูลโดยไม่มีผู้ชนะ' : 'การประมูลสิ้นสุด'),
    message: (d) => {
      if (d.forSeller) {
        return d.result === 'below_reserve'
          ? `${item(d)} ราคาสูงสุด ${baht(price(d))} ไม่ถึงราคาขั้นต่ำที่ตั้งไว้`
          : `${item(d)} ไม่มีผู้บิด`;
      }
      return d.result === 'below_reserve'
        ? `${item(d)} ปิดประมูลแล้ว ราคาไม่ถึงราคาขั้นต่ำของผู้ขาย จึงไม่มีผู้ชนะ`
        : `${item(d)} ปิดประมูลแล้ว คุณไม่ใช่ผู้ชนะ`;
    },
    link: listingLink,
  },
  PAYMENT_DUE_SOON: {
    group: 'finance',
    title: () => 'ใกล้ถึงกำหนดชำระเงิน',
    message: (d) => `คำสั่งซื้อ ${order(d)} ${item(d)} เหลือเวลาชำระอีก 24 ชม.`,
    link: orderLink,
  },
  PAYMENT_SUCCESS: {
    group: 'finance',
    title: () => 'ชำระเงินสำเร็จ',
    message: (d) => `คำสั่งซื้อ ${order(d)} ชำระสำเร็จ เงินอยู่ใน Escrow จนกว่าคุณจะยืนยันรับสินค้า`,
    link: orderLink,
  },
  FUNDS_RELEASED: {
    group: 'finance',
    title: () => 'ได้รับเงินจากการขาย',
    message: (d) => (Number(d.amount) > 0
      ? `คำสั่งซื้อ ${order(d)} โอนเงิน ${baht(d.amount)} เข้า Mock Wallet แล้ว (หักค่าธรรมเนียมแล้ว)`
      : `คำสั่งซื้อ ${order(d)} เสร็จสมบูรณ์ ยอดสุทธิ ฿0 เพราะค่าธรรมเนียมขั้นต่ำเท่ากับราคาขาย`),
    link: () => '/pages/wallet.html',
  },
  // คืนเงิน: Escrow คืนเงิน (ข้อพิพาท / ไม่ส่งของ) หรือแอดมินปฏิเสธสลิป (paymentRejected + reason, canRepay, payDueAt)
  REFUNDED: {
    group: 'finance',
    title: (d) => (d.paymentRejected ? 'การชำระเงินถูกปฏิเสธ' : 'ได้รับเงินคืน'),
    message: (d) => {
      if (!d.paymentRejected) return `${baht(d.amount)} เข้า Mock Wallet${d.orderId ? ` (${order(d)})` : ''}`;
      const why = d.reason ? `: ${d.reason}` : '';
      const next = d.canRepay
        ? ` กรุณาชำระใหม่${d.payDueAt ? `ก่อน ${thaiTime(d.payDueAt)}` : 'ภายในเวลาที่เหลือ'} ไม่งั้นคำสั่งซื้อจะถูกยกเลิก`
        : '';
      return `การชำระ ${order(d)} ถูกปฏิเสธ${why} คืนเงิน ${baht(d.amount)} เข้า Mock Wallet แล้ว${next}`;
    },
    link: (d) => (d.paymentRejected && d.canRepay && d.orderId ? `/pages/payment.html?orderId=${d.orderId}` : '/pages/wallet.html'),
  },
  SHIPPED: {
    group: 'shipping',
    title: () => 'ผู้ขายส่งของแล้ว',
    message: (d) => `คำสั่งซื้อ ${order(d)}${d.trackingNumber ? ` เลขพัสดุ ${d.trackingNumber}` : ''}${d.carrier ? ` (${d.carrier})` : ''} ได้รับแล้วกดยืนยันรับสินค้า ไม่กดภายใน ${Math.round(time.autoReleaseMs / 86400000)} วันระบบปล่อยเงินให้ผู้ขายอัตโนมัติ`,
    link: orderLink,
  },
  ORDER_PAID: {
    group: 'shipping',
    title: () => 'ผู้ซื้อชำระเงินแล้ว กรุณาจัดส่ง',
    message: (d) => `คำสั่งซื้อ ${order(d)} ชำระเงินสำเร็จ เงินพักไว้ที่ระบบ กรุณาจัดส่งและบันทึกเลขพัสดุ${d.shipDueAt ? `ก่อน ${thaiTime(d.shipDueAt)}` : `ภายใน ${hours(time.shippingDueMs)} ชม.`}`,
    link: (d) => (d.orderId ? `/pages/orders.html?id=${d.orderId}#ship` : null),
  },
  SHIP_DUE_SOON: {
    group: 'shipping',
    title: () => 'ใกล้ครบกำหนดจัดส่ง',
    message: (d) => `คำสั่งซื้อ ${order(d)} ต้องบันทึกการจัดส่ง${d.shipDueAt ? `ก่อน ${thaiTime(d.shipDueAt)}` : `ภายใน ${hours(time.shipReminderBeforeMs)} ชม.`} ไม่ส่งตามกำหนดผู้ซื้อยกเลิกได้และบัญชีจะถูกจำกัดสิทธิ์`,
    link: orderLink,
  },
  SHIP_OVERDUE: {
    group: 'shipping',
    title: () => 'ผู้ขายยังไม่จัดส่งตามกำหนด',
    message: (d) => `คำสั่งซื้อ ${order(d)} เลยกำหนดส่งแล้ว คุณขอยกเลิกและรับเงินคืนเต็มจำนวนได้`,
    link: orderLink,
  },
  // ปล่อยเงินแล้ว (ยืนยันรับ / ปล่อยอัตโนมัติ 7 วัน / แอดมินตัดสินปล่อยเงิน) แจ้งผู้ซื้อ
  ORDER_COMPLETED: {
    group: 'shipping',
    title: () => 'คำสั่งซื้อเสร็จสมบูรณ์',
    message: (d) => `คำสั่งซื้อ ${order(d)} เสร็จสมบูรณ์ ระบบปล่อยเงินให้ผู้ขายแล้ว`,
    link: orderLink,
  },
  ORDER_CANCELLED: {
    group: 'shipping',
    title: () => 'คำสั่งซื้อถูกยกเลิก',
    message: (d) => `คำสั่งซื้อ ${order(d)} ถูกผู้ซื้อยกเลิกเพราะไม่จัดส่งตามกำหนด เงินคืนผู้ซื้อแล้ว`,
    link: orderLink,
  },
  DISPUTE_OPENED: {
    group: 'shipping',
    title: () => 'มีการเปิดข้อพิพาท',
    message: (d) => `คำสั่งซื้อ ${order(d)} ถูกแจ้งปัญหา กรุณาส่งหลักฐานของคุณ`,
    link: disputeLink,
  },
  // 9.5 แอดมินเปลี่ยนสถานะระหว่างตรวจ → แจ้งผู้ซื้อและผู้ขาย (data: orderId, disputeId, status, note)
  DISPUTE_UPDATED: {
    group: 'shipping',
    title: () => 'ข้อพิพาทมีความคืบหน้า',
    message: (d) => `ข้อพิพาทของคำสั่งซื้อ ${order(d)} เปลี่ยนสถานะเป็น "${DISPUTE_STATUS_TH[d.status] || d.status}"${d.note ? ` หมายเหตุ: ${d.note}` : ''}`,
    link: disputeLink,
  },
  // 9.6 ผลการตัดสิน (ปิดไม่ได้ เพราะเกี่ยวกับเงิน) data: orderId, disputeId, resolution, forSeller, reason
  DISPUTE_RESOLVED: {
    group: null,
    title: () => 'แอดมินตัดสินข้อพิพาทแล้ว',
    message: (d) => {
      const refund = d.resolution === 'refund_buyer';
      const result = refund
        ? (d.forSeller ? 'คืนเงินให้ผู้ซื้อ คำสั่งซื้อถูกยกเลิก' : 'คืนเงินเต็มจำนวนให้คุณ คำสั่งซื้อถูกยกเลิก')
        : (d.forSeller ? 'ปล่อยเงินให้คุณ (หักค่าธรรมเนียม)' : 'ปล่อยเงินให้ผู้ขาย คำสั่งซื้อเสร็จสิ้น');
      return `ข้อพิพาทของคำสั่งซื้อ ${order(d)} ตัดสินให้${result}${d.reason ? ` เหตุผล: ${d.reason}` : ''}`;
    },
    link: disputeLink,
  },
  // บทลงโทษอัตโนมัติ (penalty.add: non_payment / no_shipment) data: action (warning|suspend|restrict), penaltyType, until, orderId
  PENALTY_ISSUED: {
    group: null,
    title: (d) => ({ suspend: 'บัญชีของคุณถูกระงับชั่วคราว', restrict: 'บัญชีของคุณถูกจำกัดการลงขาย' }[d.action] || 'คุณได้รับคำเตือน'),
    message: (d) => {
      const why = d.penaltyType === 'non_payment' ? `ชนะประมูลแล้วไม่ชำระเงินตามกำหนด ${order(d)}` : `ไม่จัดส่งสินค้าตามกำหนด ${order(d)}`;
      if (d.action === 'warning') return `${why} (คำเตือนครั้งแรก) หากเกิดซ้ำบัญชีจะถูกจำกัดการใช้งาน`;
      const what = d.action === 'suspend' ? 'ประมูลและชำระเงินไม่ได้' : 'ลงสินค้าใหม่ไม่ได้';
      return `${why} เป็นครั้งที่ ${d.count || 2} บัญชีจะ${what}จนถึง ${thaiTime(d.until)}`;
    },
    link: () => '/pages/settings.html',
  },
  // 10.3 / 10.4 แอดมินเปลี่ยนสถานะบัญชี data: status, until, reason
  ACCOUNT_STATUS_CHANGED: {
    group: null,
    title: (d) => (d.status === 'active' ? 'บัญชีของคุณกลับมาใช้งานได้ตามปกติ' : 'สถานะบัญชีของคุณถูกเปลี่ยน'),
    message: (d) => {
      const label = { active: 'ใช้งานได้ตามปกติ', restricted: 'จำกัดการลงขาย', suspended: 'ระงับชั่วคราว', banned: 'ระงับถาวร' }[d.status] || d.status;
      return `แอดมินเปลี่ยนสถานะบัญชีเป็น "${label}"${d.until ? ` จนถึง ${thaiTime(d.until)}` : ''}${d.reason ? ` เหตุผล: ${d.reason}` : ''}`;
    },
    link: () => '/pages/settings.html',
  },
};

module.exports = { TEMPLATES };
