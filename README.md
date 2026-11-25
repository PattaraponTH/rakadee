# Rakadee — เว็บประมูลสินค้าออนไลน์

งานรายวิชา CSI400 ระบบประมูลสินค้าออนไลน์แบบ real-time พร้อม Mock Wallet, Escrow และระบบจัดการข้อพิพาท

## ติดตั้งและรัน

ต้องมี [Node.js](https://nodejs.org) 20 ขึ้นไป และ MySQL 8

```bash
cd backend
npm install
cp .env.example .env      # Windows: copy .env.example .env
# แก้ค่า DB_* ใน .env ให้ตรงกับ MySQL ในเครื่อง และสร้างคีย์เข้ารหัสเลขบัตรใหม่ (วิธีอยู่ใน .env.example)
npm run db:init           # สร้างตารางทั้งหมด + ข้อมูลทดสอบ (ลบข้อมูลเดิม)
npm run dev
```

เปิด http://localhost:3000 (เช็กสถานะ API และ Database ได้ที่ http://localhost:3000/api/health)

- `npm run dev` รีสตาร์ตเองเมื่อแก้ไฟล์ (ใช้ตอนพัฒนา)
- `npm start` รันปกติ
- `npm test` unit test (สูตรค่าธรรมเนียม)

บัญชีทดสอบจาก seed: `superadmin` / `Super@1234`, `admin` / `Admin@1234`, `seller1` `buyer1` `buyer2` / `Test@1234` (สมาชิกมี Wallet 10,000 บาท)

### ข้อมูลเดโม

```bash
npm run db:demo           # ล้างฐานข้อมูล แล้วสร้างข้อมูลเดโมครบทุกสถานะ (สินค้า ประมูล คำสั่งซื้อ ข้อพิพาท บทลงโทษ)
```

- เพิ่มบัญชี `seller2` `seller3` `buyer3` `buyer4` (รหัสผ่าน `Test@1234`) จบแล้วสคริปต์พิมพ์เลขคำสั่งซื้อ / สินค้าที่ใช้เดโมแต่ละขั้น
- เวลาปิดประมูลนับจากตอนรัน จึงควรรันก่อนเดโมไม่นาน (สินค้าใกล้จบปิดใน 45 นาที)
- เดโม Auto Extend สด: `node scripts/demo-ending.js <listingId> <นาที>` ตั้งให้สินค้าปิดเร็วขึ้น แล้วบิดตอนเหลือไม่เกิน 2 นาที
- รูปสินค้าเป็นภาพประกอบที่สร้างขึ้น (`backend/seeds/demo/`) สลิปเป็นสลิปจำลอง

ถ้า Database ขึ้นว่า unavailable ให้เช็กว่า MySQL เปิดอยู่ และค่า `DB_*` ใน `.env` ถูกต้อง

### ทดสอบโดยไม่ต้องผ่านหน้า login

ใช้ตอนทดสอบ API หรือสลับบัญชีเร็วๆ (ใช้ได้เฉพาะเครื่องตัวเอง ไม่ทำงานเมื่อ `NODE_ENV=production`)

```bash
npm run dev:token -- buyer1      # หรือ seller1, admin, superadmin
```

นำ token ที่ได้ไปใช้:

- **หน้าเว็บ:** เปิด DevTools > Console แล้วพิมพ์ `localStorage.setItem('rakadee_token', '<token>')` แล้วรีเฟรช
- **Postman / curl:** ใส่ header `Authorization: Bearer <token>`

อีเมลแจ้งเตือนจะแสดงใน console ของ server จนกว่าจะตั้ง `SMTP_*` ใน `.env`

### ทดสอบเรื่องเวลา (ชำระเงิน 48 ชม., ส่งของ 72 ชม., ปล่อยเงิน 7 วัน ฯลฯ)

เปิดบรรทัด `*_MINUTES` ใน `.env` แล้วใส่ค่าสั้นๆ เช่น `PAYMENT_DUE_MINUTES=5` แล้วรีสตาร์ต server (Scheduler ตรวจทุก 1 นาที)

## ใช้ AI เขียนโค้ด

ทุกคนในทีมใช้ AI ช่วยเขียนโค้ด กติกาทั้งหมดอยู่ใน [`AGENTS.md`](AGENTS.md) (Claude Code อ่านผ่าน `CLAUDE.md` ส่วน Cursor/Copilot/Codex อ่าน `AGENTS.md` เอง)

ทุกครั้งที่สั่งงาน AI ให้แนบหรือชี้ไปที่:

1. `AGENTS.md`
2. `docs/decision-log.md`
3. `docs/erd/schema.sql` และ `docs/api-spec/api-spec.md`
4. ข้อในเอกสาร requirement ที่เกี่ยวกับงานนั้น

ตัวอย่างคำสั่ง:

> อ่าน AGENTS.md, docs/decision-log.md, docs/erd/schema.sql และ docs/api-spec/api-spec.md ก่อน แล้วทำ API ลงสินค้า (POST /api/listings) ตาม requirement ข้อ 3.1–3.3 ที่แนบมา ทำเฉพาะโมดูลลงสินค้า ห้ามแก้ไฟล์โมดูลอื่น เสร็จแล้วบอกวิธีทดสอบทีละขั้น

## โครงสร้าง

```
backend/    Express API, Socket.IO, Scheduler (node-cron)
frontend/   HTML / CSS / JS (เสิร์ฟจาก backend ที่ port เดียวกัน)
docs/       Decision Log, ERD (schema.sql), API Spec, เอกสาร QA
```

รายละเอียดโฟลเดอร์และกติกาการเขียนโค้ดอยู่ใน `AGENTS.md`

## การทำงานร่วมกัน

- `main` = เวอร์ชันพร้อมเดโม, `dev` = รวมงานระหว่างพัฒนา
- แตก branch จาก `dev` ชื่อ `feature/<module>-<งาน>` แล้วเปิด Pull Request เข้า `dev` ให้ PM review
- ห้าม push ตรงเข้า `main` หรือ `dev`

## ทีม

| ตำแหน่ง | โมดูล |
| --- | --- |
| PM | Foundation, Notification, Settings, Shipping, Admin Dashboard, Audit Log |
| SA | Auth, Wallet, Payment, Escrow, ERD, API Spec |
| QA | ลงสินค้า, อนุมัติสินค้า, Dispute, บทลงโทษ, จัดการผู้ใช้, Test Plan |
| Programmer | Auction Engine, หน้าแรก, ค้นหา, รายละเอียดสินค้า, Watchlist |
