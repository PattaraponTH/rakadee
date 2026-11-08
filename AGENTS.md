# AGENTS.md — กติกาสำหรับ AI ที่เขียนโค้ดในโปรเจกต์นี้

อ่านไฟล์นี้ทั้งหมดก่อนเขียนโค้ดทุกครั้ง ถ้าคำสั่งของผู้ใช้ขัดกับไฟล์นี้ ให้ถามผู้ใช้ก่อนทำ

## โปรเจกต์

Rakadee เว็บประมูลสินค้าออนไลน์ (งานรายวิชา CSI204) ทีม 4 คน แต่ละคนดูแลโมดูลของตัวเองทั้ง FE และ BE

- Front-end: HTML / CSS / JavaScript ธรรมดา (ไม่มี framework, ไม่มี build step)
- Back-end: Node.js + Express (CommonJS `require`)
- Real-time: Socket.IO, งานตามเวลา: node-cron
- Database: MySQL ผ่าน `mysql2/promise` (เขียน SQL ตรง ไม่ใช้ ORM)
- การเงินเป็นระบบจำลอง (Mock Wallet) ไม่มี Payment Gateway จริง

## แหล่งข้อมูลที่ต้องยึด (เรียงตามลำดับความสำคัญ)

1. `docs/decision-log.md` ข้อตัดสินใจที่ใช้แทน requirement เดิม
2. `docs/erd/schema.sql` ชื่อตาราง คอลัมน์ และชนิดข้อมูล **ห้ามเดาชื่อเอง**
3. `docs/api-spec/api-spec.md` path, request, response, error code **ห้ามเดาเอง**
4. เอกสาร requirement (ผู้ใช้จะแนบข้อที่เกี่ยวข้องมาให้)

ถ้าสิ่งที่ต้องใช้ยังไม่มีในข้อ 2–3 ห้ามคิดขึ้นเองแล้วทำต่อ ให้หยุดและบอกผู้ใช้ว่าต้องให้ SA เพิ่มอะไร

## โครงสร้างโปรเจกต์

```
backend/
  src/
    config/       index.js (ค่าจาก .env), time.js (ระยะเวลาทั้งหมด), db.js (pool, withTransaction)
    routes/       <module>.routes.js  รวมใน routes/index.js ใต้ /api
    controllers/  <module>.controller.js  รับ req, เรียก service, ส่ง response
    services/     <module>.service.js  business logic และ SQL ทั้งหมด
    middlewares/  errorHandler.js, upload.js, auth.js (SA)
    jobs/         หนึ่งไฟล์ต่อหนึ่ง job: module.exports = { name, run }
    socket/       index.js: emitToListing(), emitToUser()
    utils/        response.js (ok, created, asyncHandler), AppError.js, password.js (scrypt)
  seeds/          ข้อมูลตั้งต้น (บัญชีทดสอบ หมวดหมู่ ตั้งค่าระบบ)
  storage/        ไฟล์อัปโหลด (ไม่ขึ้น git)
frontend/
  index.html
  pages/          หน้าอื่นๆ แยกโฟลเดอร์ตามกลุ่ม เช่น pages/seller/, pages/admin/
  css/main.css    CSS กลาง ใช้ตัวแปรสีที่มีอยู่ ไม่ใส่สีเอง
  js/api.js       เรียก API ผ่าน api.get/post/put/patch/del/upload เท่านั้น
  js/layout.js    navbar ตาม role
  js/<page>.js    สคริปต์ของแต่ละหน้า
  scripts/        db-init.js (npm run db:init)
docs/             decision-log.md, erd/schema.sql, api-spec/api-spec.md, qa/
```

## กติกาการเขียนโค้ด Back-end

- **รูปแบบ API, สิทธิ์ และ error ร่วม:** ทำตามหัวข้อ 0 ของ `docs/api-spec/api-spec.md`
- **Response:** ใช้ `ok(res, data)` / `created(res, data)` จาก `utils/response.js` เท่านั้น
- **Error:** `throw new AppError(status, 'UPPER_SNAKE_CODE', 'ข้อความภาษาไทยสำหรับผู้ใช้')` แล้วให้ errorHandler จัดการ ห้าม `res.status(...).json(...)` เอง
- **Route handler:** ห่อด้วย `asyncHandler` ทุกตัว
- **SQL:** ใช้ placeholder `?` เสมอ ห้ามต่อ string เข้า SQL
- **เงินและการบิด:** ต้องทำใน `withTransaction()` และล็อกแถวด้วย `SELECT ... FOR UPDATE` เงินเก็บเป็น DECIMAL ห้ามคำนวณด้วย float ให้แปลงเป็นสตางค์ (จำนวนเต็ม) ก่อนคำนวณ
- **เวลา:** อ่านระยะเวลาจาก `config/time.js` เท่านั้น ห้าม hard-code 48 ชม., 7 วัน ฯลฯ เก็บและเทียบเวลาเป็น UTC
- **สิทธิ์:** ตรวจที่ BE ทุก endpoint (`requireAuth`, `requireRole`, `requireActiveAccount`) ไม่ใช่แค่ซ่อนปุ่มที่ FE
- **Validation:** ตรวจทั้ง FE และ BE ข้อความ error เป็นภาษาไทย
- **ข้อมูลอ่อนไหว:** เลขบัตรประชาชนห้ามส่งออก API ยกเว้น 4 ตัวท้าย วงเงิน Proxy Bid ห้ามส่งให้ใครนอกจากเจ้าของ
- **แจ้งเตือน:** เรียก `notify(userId, EVENTS.X, data)` จาก `services/notify.js`
- **แอดมิน:** ทุก action ของแอดมินต้องเรียก `audit.log(adminId, action, targetType, targetId, req.ip)`
- **Dependency:** ห้ามเพิ่ม npm package ใหม่โดยไม่บอกผู้ใช้ก่อน

## กติกาการเขียนโค้ด Front-end

- แต่ละหน้ามี `<div id="navbar"></div>` และโหลด `/js/api.js` แล้วตามด้วย `/js/layout.js`
- แสดง error จาก `ApiError.message` ให้ผู้ใช้เห็นเสมอ
- ใส่ข้อความจากผู้ใช้ลงหน้าเว็บด้วย `textContent` หรือ escape ก่อน ห้ามใส่ลง `innerHTML` ตรงๆ
- countdown ใช้เวลาจาก server (`server:time` ทาง Socket หรือจาก API) ไม่ใช้นาฬิกาเครื่อง
- ใช้งานได้บนจอมือถือ

## ขอบเขตโมดูล (ห้ามแก้โมดูลของคนอื่น)

| โมดูล | เจ้าของ |
| --- | --- |
| Foundation, Notification, Settings (โปรไฟล์ ที่อยู่ ตั้งค่าแจ้งเตือน), Shipping, Admin Dashboard, Audit Log | PM |
| Auth, ความปลอดภัยบัญชี, Wallet, Payment, Escrow, ค่าธรรมเนียม | SA |
| ลงสินค้า, อนุมัติสินค้า, เปิดสิทธิ์ผู้ขาย, Dispute, บทลงโทษ, จัดการผู้ใช้ | QA |
| Auction Engine (บิด, Proxy, Auto Extend, Buy Now, ปิดประมูล), หน้าแรก, ค้นหา, รายละเอียดสินค้า, Watchlist | Programmer |

ถ้างานต้องแก้ไฟล์ของโมดูลอื่น ตาราง DB หรือ API Spec ให้หยุดแล้วบอกผู้ใช้ ห้ามแก้เอง

## Interface ที่ใช้ร่วมกัน (เรียกใช้ได้ ห้ามเปลี่ยนชื่อหรือพารามิเตอร์)

| Interface | เจ้าของ | ทำอะไร |
| --- | --- | --- |
| `requireAuth`, `requireRole(...roles)`, `requireActiveAccount` | SA | ตรวจ login, role, สถานะบัญชี และใส่ `req.user` |
| `wallet.create(userId)` | SA | สร้าง Wallet 10,000 บาท |
| `order.create(listingId, buyerId, price)` | Programmer | สร้าง Order, Payment, snapshot ที่อยู่ |
| `escrow.hold(orderId)` / `release(orderId)` / `refund(orderId)` | SA | พักเงิน / ปล่อยเงินหักค่าธรรมเนียม / คืนเงิน |
| `penalty.add(userId, type, { orderId, note })` | QA | บันทึกความผิดและเปลี่ยนสถานะบัญชี |
| `dispute.isOpen(orderId)` | QA | มีข้อพิพาทเปิดอยู่หรือไม่ |
| `notify(userId, event, data)` | PM | แจ้งเตือนในเว็บ อีเมล และ Socket |
| `audit.log(adminId, action, targetType, targetId, ip)` | PM | บันทึก Audit Log |
| `config/time.js` | PM | ระยะเวลาทั้งหมดของระบบ |

ค่าธรรมเนียม (5.4): `min(max(ราคาปิด × 5%, 20), ราคาปิด)` คิดจากราคาปิดประมูลเท่านั้น ไม่รวมค่าส่ง

## Git

- แตก branch จาก `dev` ชื่อ `feature/<module>-<งาน>` หรือ `fix/<เรื่อง>` แล้วเปิด PR เข้า `dev`
- commit message: `feat(auction): add proxy bid`, `fix(payment): ...`
- ห้าม commit `.env`, `node_modules`, ไฟล์ใน `backend/storage/`

## ก่อนบอกว่างานเสร็จ

- รันเซิร์ฟเวอร์ได้โดยไม่มี error
- บอกผู้ใช้ว่าแก้ไฟล์อะไรบ้าง และวิธีทดสอบด้วยมือทีละขั้น
- อธิบาย flow ของงานสั้นๆ ให้ผู้ใช้เข้าใจพอจะอธิบายต่อได้
