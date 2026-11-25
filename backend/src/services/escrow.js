// Escrow Service  —  5.3, 5.4, D-08, D-10 ใน docs/api-spec/api-spec.md
//   - escrow.hold(orderId)
//   - escrow.release(orderId)
//   - escrow.refund(orderId)
const { withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');
const { notify, EVENTS } = require('./notify');
const settings = require('./settings');

// ค่าเริ่มต้นตาม requirement 5.4 (ค่าจริงอ่านจากตั้งค่าระบบด้วย settings.feeConfig())
const DEFAULT_FEE = { percent: 5, min: 20 };

/**
 * คำนวณค่าธรรมเนียมแพลตฟอร์ม requirement 5.4 / D-10
 * สูตร: min(max(ราคาปิด × percent%, min), ราคาปิด) ค่าเริ่มต้น 5% ขั้นต่ำ 20 บาท (Super Admin แก้ได้ที่ตั้งค่าระบบ)
 * คำนวณจากราคาปิดประมูลเท่านั้น (ไม่รวมค่าส่ง) เป็นสตางค์จำนวนเต็ม
 * @param {number} itemPrice ราคาปิดประมูล (บาท)
 * @param {{ percent: number, min: number }} [cfg] จาก settings.feeConfig()
 * @returns {number} ค่าธรรมเนียม (บาท)
 */
function calculatePlatformFee(itemPrice, cfg = DEFAULT_FEE) {
  const itemSatang = Math.round(Number(itemPrice) * 100);
  const minFeeSatang = Math.round(Number(cfg.min) * 100);
  const basisPoints = Math.round(Number(cfg.percent) * 100); // 5% = 500
  const calculatedFeeSatang = Math.round((itemSatang * basisPoints) / 10000);

  let feeSatang = Math.max(calculatedFeeSatang, minFeeSatang);
  feeSatang = Math.min(feeSatang, itemSatang); // ห้ามเกินราคาประมูล

  return feeSatang / 100;
}

/**
 * พักเงินคำสั่งซื้อใน Escrow (สร้างตอนแอดมินอนุมัติการชำระ (5.3))
 * @param {number} orderId รหัสคำสั่งซื้อ
 * @param {object} [existingConn] connection ในกรณีเรียกจาก transaction ภายนอก
 * @returns {Promise<{ orderId: number, amount: number, status: string }>}
 */
async function hold(orderId, existingConn = null) {
  const runner = async (conn) => {
    // 1. ดึงยอดรวมของ Order
    const [orders] = await conn.query(
      'SELECT id, total_amount, status FROM orders WHERE id = ? FOR UPDATE',
      [orderId]
    );
    if (orders.length === 0) {
      throw new AppError(404, 'NOT_FOUND', 'ไม่พบคำสั่งซื้อที่ระบุ');
    }

    const order = orders[0];
    const totalAmount = Number(order.total_amount);

    // 2. 1 order = 1 escrow: ถ้ามีอยู่แล้วห้ามรีเซ็ตกลับเป็น held (กันปล่อยเงิน/คืนเงินซ้ำ)
    const [existing] = await conn.query('SELECT status FROM escrows WHERE order_id = ? FOR UPDATE', [orderId]);
    if (existing.length > 0) {
      if (existing[0].status === 'held') return { orderId: Number(orderId), amount: totalAmount, status: 'held' };
      throw new AppError(409, 'INVALID_STATE', `คำสั่งซื้อนี้ปิดเงินพักไปแล้ว (สถานะ ${existing[0].status})`);
    }
    await conn.query(
      `INSERT INTO escrows (order_id, amount, status, held_at)
       VALUES (?, ?, 'held', UTC_TIMESTAMP())`,
      [orderId, totalAmount]
    );

    return {
      orderId: Number(orderId),
      amount: totalAmount,
      status: 'held',
    };
  };

  if (existingConn) return runner(existingConn);
  return withTransaction(runner);
}

/**
 * ปล่อยเงินให้ผู้ขาย (หักค่าธรรมเนียม) ตอนผู้ซื้อยืนยันรับ / ครบ 7 วัน / ผู้ขายชนะข้อพิพาท (D-10)
 * @param {number} orderId รหัสคำสั่งซื้อ
 * @param {object} [existingConn]
 */
async function release(orderId, existingConn = null) {
  const runner = async (conn) => {
    // 1. ตรวจสอบข้อพิพาทที่ยังเปิดอยู่ (ถ้ามีห้ามปล่อยเงิน D-08)
    const [disputes] = await conn.query(
      'SELECT id, status FROM disputes WHERE order_id = ? AND status NOT IN (\'resolved\', \'closed\') LIMIT 1',
      [orderId]
    );
    if (disputes.length > 0) {
      throw new AppError(409, 'INVALID_STATE', 'ไม่สามารถปล่อยเงินได้เนื่องจากมีข้อพิพาทที่ยังไม่สิ้นสุด');
    }

    // 2. ดึงข้อมูล Escrow
    const [escrows] = await conn.query(
      'SELECT id, amount, status FROM escrows WHERE order_id = ? FOR UPDATE',
      [orderId]
    );
    if (escrows.length === 0) {
      throw new AppError(404, 'NOT_FOUND', 'ไม่พบรายการเงินพัก');
    }

    const escrow = escrows[0];
    if (escrow.status !== 'held') {
      throw new AppError(409, 'INVALID_STATE', `ไม่สามารถปล่อยเงินได้เนื่องจากสถานะคือ ${escrow.status}`);
    }

    // 3. ดึงข้อมูล Order เพื่อหาผู้ขายและราคาปิดสำหรับคิดค่าธรรมเนียม
    const [orders] = await conn.query(
      'SELECT id, seller_id, buyer_id, item_price, shipping_fee, total_amount FROM orders WHERE id = ? FOR UPDATE',
      [orderId]
    );
    const order = orders[0];
    const sellerId = Number(order.seller_id);
    const itemPrice = Number(order.item_price);
    const totalAmount = Number(order.total_amount);

    // 4. คำนวณค่าธรรมเนียมแพลตฟอร์ม: คิดจาก item_price เท่านั้น (D-10)
    const feeAmount = calculatePlatformFee(itemPrice, await settings.feeConfig()); // ค่าตั้ง ณ เวลาปล่อยเงิน
    // คิดเป็นสตางค์ (จำนวนเต็ม) ตาม AGENTS.md ไม่ลบ float ตรงๆ
    const netSatang = Math.round(totalAmount * 100) - Math.round(feeAmount * 100);
    const netSellerAmount = netSatang / 100;

    // 5. โอนเงินสุทธิเข้า Wallet ของผู้ขาย
    const [sellerWallets] = await conn.query(
      'SELECT id, balance FROM wallets WHERE user_id = ? FOR UPDATE',
      [sellerId]
    );
    if (sellerWallets.length === 0) {
      throw new AppError(500, 'INTERNAL_ERROR', 'ไม่พบกระเป๋าเงินของผู้ขาย');
    }

    const sellerWallet = sellerWallets[0];
    const balanceAfter = (Math.round(Number(sellerWallet.balance) * 100) + netSatang) / 100;

    // ยอดสุทธิ 0 บาท (เช่น ราคาปิด ≤ ค่าธรรมเนียมขั้นต่ำ และไม่มีค่าส่ง) ไม่มีเงินเข้า Wallet
    // จึงไม่บันทึก ledger (wallet_transactions.amount ห้ามเป็น 0 ตาม CHECK ใน schema) แต่ยังปล่อย Escrow ตามปกติ
    if (netSatang > 0) {
      await conn.query(
        'UPDATE wallets SET balance = ? WHERE id = ?',
        [balanceAfter, sellerWallet.id]
      );

      // 6. บันทึกธุรกรรม ledger (wallet_transactions)
      await conn.query(
        `INSERT INTO wallet_transactions
          (wallet_id, type, amount, balance_after, reference_type, reference_id, note)
         VALUES (?, 'sale_proceeds', ?, ?, 'order', ?, ?)`,
        [sellerWallet.id, netSellerAmount, balanceAfter, orderId, `รายได้จากคำสั่งซื้อ #ORD-${orderId} (หักค่าธรรมเนียม ${feeAmount} บาท)`]
      );
    }

    // 7. อัปเดตสถานะ Escrow เป็น 'released'
    await conn.query(
      `UPDATE escrows
       SET status = 'released', fee_amount = ?, net_amount = ?, released_at = UTC_TIMESTAMP()
       WHERE id = ?`,
      [feeAmount, netSellerAmount, escrow.id]
    );

    // 8. อัปเดต Order เป็น 'completed'
    await conn.query(
      'UPDATE orders SET status = \'completed\', completed_at = UTC_TIMESTAMP() WHERE id = ?',
      [orderId]
    );

    // แจ้งเตือนผู้ขาย (เงินเข้ากระเป๋า)
    notify(sellerId, EVENTS.FUNDS_RELEASED, {
      orderId,
      amount: netSellerAmount,
      feeAmount,
    }).catch(() => {});

    // แจ้งเตือนผู้ซื้อ (คำสั่งซื้อเสร็จสมบูรณ์) — notify ทั้งสองฝั่งตาม requirement
    if (order.buyer_id) {
      notify(order.buyer_id, EVENTS.ORDER_COMPLETED, { orderId }).catch(() => {});
    }

    return {
      orderId: Number(orderId),
      totalAmount,
      feeAmount,
      netSellerAmount,
      status: 'released',
    };
  };

  if (existingConn) return runner(existingConn);
  return withTransaction(runner);
}

/**
 * คืนเงินเต็มจำนวนให้ผู้ซื้อ (ผู้ขายไม่ส่งสินค้าเกิน 72 ชม. หรือผู้ซื้อชนะข้อพิพาท (D-10)
 * @param {number} orderId รหัสคำสั่งซื้อ
 * @param {object} [existingConn]
 */
async function refund(orderId, existingConn = null) {
  const runner = async (conn) => {
    // 1. ดึงข้อมูล Escrow
    const [escrows] = await conn.query(
      'SELECT id, amount, status FROM escrows WHERE order_id = ? FOR UPDATE',
      [orderId]
    );
    if (escrows.length === 0) {
      throw new AppError(404, 'NOT_FOUND', 'ไม่พบรายการเงินพักใน Escrow');
    }

    const escrow = escrows[0];
    if (escrow.status !== 'held') {
      throw new AppError(409, 'INVALID_STATE', `ไม่สามารถคืนเงินได้เนื่องจากสถานะ Escrow คือ ${escrow.status}`);
    }

    // 2. ดึงข้อมูล Order เพื่อหาผู้ซื้อ
    const [orders] = await conn.query(
      'SELECT id, buyer_id, total_amount FROM orders WHERE id = ? FOR UPDATE',
      [orderId]
    );
    const order = orders[0];
    const buyerId = Number(order.buyer_id);
    const refundAmount = Number(escrow.amount); // คืนเต็มจำนวน (ราคา + ค่าส่ง)

    // 3. คืนเงินเข้า Wallet ของผู้ซื้อ
    const [buyerWallets] = await conn.query(
      'SELECT id, balance FROM wallets WHERE user_id = ? FOR UPDATE',
      [buyerId]
    );
    if (buyerWallets.length === 0) {
      throw new AppError(500, 'INTERNAL_ERROR', 'ไม่พบกระเป๋าเงินของผู้ซื้อ');
    }

    const buyerWallet = buyerWallets[0];
    const balanceBefore = Number(buyerWallet.balance);
    const balanceAfter = balanceBefore + refundAmount;

    await conn.query(
      'UPDATE wallets SET balance = ? WHERE id = ?',
      [balanceAfter, buyerWallet.id]
    );

    // 4. บันทึกธุรกรรม ledger (wallet_transactions)
    await conn.query(
      `INSERT INTO wallet_transactions
        (wallet_id, type, amount, balance_after, reference_type, reference_id, note)
       VALUES (?, 'escrow_refund', ?, ?, 'order', ?, ?)`,
      [buyerWallet.id, refundAmount, balanceAfter, orderId, `คืนเงินจากคำสั่งซื้อ #${orderId}`]
    );

    // 5. อัปเดตสถานะ Escrow เป็น 'refunded'
    await conn.query(
      `UPDATE escrows
       SET status = 'refunded', refunded_at = UTC_TIMESTAMP()
       WHERE id = ?`,
      [escrow.id]
    );

    // แจ้งเตือนผู้ซื้อ
    notify(buyerId, EVENTS.REFUNDED, {
      orderId,
      amount: refundAmount,
    }).catch(() => {});

    return {
      orderId: Number(orderId),
      refundAmount,
      status: 'refunded',
    };
  };

  if (existingConn) return runner(existingConn);
  return withTransaction(runner);
}

module.exports = {
  calculatePlatformFee,
  hold,
  release,
  refund,
};

