# เอกสาร QA (เจ้าของ: QA)

| ไฟล์ | เนื้อหา | สถานะ |
| --- | --- | --- |
| `test-plan-and-test-cases.pdf` | Test Plan + Test Case 94 เคส (11 โมดูล) | ใช้ได้ ต้องปรับบางเคสตามรายการด้านล่าง |
| `review-erd-api-spec.pdf` | รายงาน Review ERD และ API Spec ฉบับแรกของ SA (52 ข้อสังเกต) | ปิดครบแล้วใน `docs/erd/schema.sql`, `docs/api-spec/api-spec.md` และ D-07 ถึง D-12 |

## Test Case ที่ต้องปรับให้ตรงกับ ERD / API Spec ฉบับใหม่

| Test Case | เหตุผล | ปรับเป็น |
| --- | --- | --- |
| TC-16, TC-17 | ทดสอบ KYC ซึ่งตัดออกแล้ว (D-07, D-09) | เปลี่ยนเป็นทดสอบเข้ารหัสเลขบัตรตอนสมัคร (API ส่งแค่ `idCardLast4`) และยืนยันอีเมลด้วยลิงก์ (API 1.8) |
| TC-21 | เปิดร้านต้องผ่าน KYC และกรอกบัญชีธนาคาร | เปิดร้านได้ทันทีเมื่อบัญชี active (API 3.1) ทดสอบ `pending_verification`/`restricted` ถูกปฏิเสธ และ `ALREADY_SELLER` |
| TC-42 | คาดหวังว่าบิดเกินยอด Wallet ถูกปฏิเสธ | บิดได้ทั้ง 10,000 และ 10,001 เพราะไม่เช็กยอดตอนบิด (D-06) |
| TC-45 (c) | คาดหวังว่าตั้ง Proxy เกินยอด Wallet ถูกปฏิเสธ | ตั้งได้ ไม่เช็กยอด Wallet (D-06) |
| เพิ่มใหม่ | กฎ Proxy Bid ใหม่ D-13 ถึง D-16 | ใช้ตัวอย่าง 1–4, E1–E20 และ R1–R4 ใน `docs/auction/proxy-bid-algorithm.pdf` เป็นเคสทดสอบ Auction Engine |
| TC-47 | อ้าง "วงเงินไม่พอ" ใน Wallet | ใช้ "วงเงิน Proxy ไม่พอ" แทน (ระบบหยุดบิดแทนและแจ้งเตือน) |
| TC-59 | ทดสอบเติมเงิน (DEPOSIT) | ทดสอบเครดิตแรกเข้า 10,000 บาทครั้งเดียวและประวัติธุรกรรม (API 7.1, 7.2) |
| TC-61 | เติมเงินแล้วชำระใหม่ | ยอดไม่พอ → `INSUFFICIENT_BALANCE` พร้อม `shortfall` ปุ่มชำระกดไม่ได้ (ไม่มีเติมเงิน) |
| TC-68 | ตรวจยอดรวมโดยมีสถานะ FROZEN | ใช้สูตรตรวจยอดใน D-10 (ไม่มี FROZEN) |
| TC-73, TC-81, TC-84, TC-85 | คาดหวัง Escrow = FROZEN ระหว่างข้อพิพาท | Escrow = `held` + Order = `disputed` และ release ไม่ได้จนตัดสิน (D-08) |
| TC-93 | อ้าง action อนุมัติ KYC และรีวิว | ใช้รายการ action ใน API Spec หัวข้อ 11 |
| ทุกเคส | ชื่อ endpoint `/auctions`, error code `ERR_*`, สถานะตัวพิมพ์ใหญ่ | ใช้ path, error code และค่าสถานะตาม `docs/api-spec/api-spec.md` |

บัญชีทดสอบและข้อมูลตั้งต้นอยู่ใน `backend/seeds/001_seed.sql` ย่อเวลา (48 ชม., 7 วัน ฯลฯ) ผ่านตัวแปรใน `backend/.env` ตาม `.env.example`
