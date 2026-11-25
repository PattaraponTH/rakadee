// ตั้งเวลาปิดประมูลของสินค้าให้ใกล้ขึ้น ใช้ตอนเดโม Auto Extend / ปิดประมูลสด (ใช้ในเครื่องตัวเองเท่านั้น)
// ใช้: node scripts/demo-ending.js <listingId> <นาที>   เช่น 12 3 = สินค้า 12 ปิดในอีก 3 นาที
// บิดตอนเหลือ ≤ 2 นาที ระบบต่อเวลาให้ (Auto Extend) ครบเวลาแล้ว Scheduler ปิดประมูลภายใน 1 นาที
const config = require('../src/config');
const db = require('../src/config/db');

async function main() {
  if (config.env === 'production') throw new Error('ใช้ใน production ไม่ได้');
  const id = Number(process.argv[2]);
  const minutes = Number(process.argv[3]);
  if (!Number.isInteger(id) || !(minutes > 0)) throw new Error('ใช้: node scripts/demo-ending.js <listingId> <นาที>');
  const [res] = await db.pool.query(
    "UPDATE listings SET end_at = UTC_TIMESTAMP() + INTERVAL ? SECOND WHERE id = ? AND status = 'active'",
    [Math.round(minutes * 60), id],
  );
  if (!res.affectedRows) throw new Error(`ไม่พบสินค้า ${id} ที่กำลังประมูล`);
  console.log(`สินค้า ${id} จะปิดประมูลในอีก ${minutes} นาที (รีเฟรชหน้าสินค้าเพื่อดู countdown ใหม่)`);
}

main().catch((err) => { console.error(err.message); process.exitCode = 1; }).finally(() => db.pool.end());
