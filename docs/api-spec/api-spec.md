# Rakadee API Specification

แหล่งความจริงของ path, request, response และ error code ทั้งระบบ คู่กับ `docs/erd/schema.sql`
อ้างอิง requirement ข้อ 1–8 และ `docs/decision-log.md` (D-01 ถึง D-12)

## 0. ข้อตกลงร่วม

### 0.1 รูปแบบทั่วไป (D-11)

- Base path: `/api` (เสิร์ฟจาก server เดียวกับหน้าเว็บ เช่น `http://localhost:3000/api`)
- Request/Response เป็น JSON `camelCase` ยกเว้นอัปโหลดไฟล์ใช้ `multipart/form-data`
- เงินเป็นตัวเลขทศนิยม 2 ตำแหน่ง (`1500.00`) เวลาเป็น ISO 8601 UTC (`2026-11-08T07:30:00.000Z`)
- สำเร็จ: `{ "success": true, "data": { ... } }`
- ผิดพลาด: `{ "success": false, "error": { "code": "BID_TOO_LOW", "message": "ข้อความภาษาไทย", "details": { ... } } }`
- รายการแบบแบ่งหน้า: query `page` (เริ่ม 1), `limit` (ค่าเริ่มต้น 20, สูงสุด 50) ตอบ `data: { items: [...], page, limit, total }`
- ไฟล์ที่อัปโหลด: jpg/jpeg/png ไม่เกิน 5MB (`backend/src/middlewares/upload.js`) API ตอบเป็น URL เช่น `/uploads/products/<uuid>.jpg`

### 0.2 การยืนยันตัวตน (D-12)

- Login แล้วได้ `token` ส่งทุก request เป็น header `Authorization: Bearer <token>`
- Token อายุ 7 วัน เก็บ hash ในตาราง `sessions` logout/เปลี่ยนรหัส/รีเซ็ตรหัส = `revoked_at`
- Socket.IO ส่ง token ใน `io({ auth: { token } })` (หัวข้อ 12)

### 0.3 สิทธิ์ (Role) และสถานะบัญชี

| สัญลักษณ์ในตาราง | ความหมาย |
| --- | --- |
| `public` | ใครก็เรียกได้ รวม Guest |
| `member` | login แล้วและ `role` เป็น `bidder` หรือ `seller` |
| `seller` | login แล้วและ `role = seller` |
| `admin` | `role` เป็น `admin` หรือ `super_admin` |
| `super_admin` | `role = super_admin` เท่านั้น |

Middleware (SA): `requireAuth` → `requireRole(...)` → `requireActiveAccount(action)` ตรวจสถานะบัญชีตาม D-03:

| action | pending_verification | active | restricted | suspended | banned |
| --- | --- | --- | --- | --- | --- |
| `login` | ได้ (ไปหน้า OTP) | ได้ | ได้ | ได้ (ดูอย่างเดียว) | ไม่ได้ `ACCOUNT_BANNED` |
| `bid` (บิด, Proxy, Buy Now) | `ACCOUNT_NOT_VERIFIED` | ได้ | ได้ | `ACCOUNT_SUSPENDED` | - |
| `sell` (ลง/แก้/ส่งตรวจสินค้า, เปิดร้าน) | `ACCOUNT_NOT_VERIFIED` | ได้ | `ACCOUNT_RESTRICTED` | `ACCOUNT_SUSPENDED` | - |
| `pay` (ชำระ, ยืนยันรับ, เปิดข้อพิพาท, บันทึกจัดส่ง) | `ACCOUNT_NOT_VERIFIED` | ได้ | ได้ | ได้ | - |

บัญชีที่ `suspended` ยังต้องจ่ายเงิน/ส่งของของ Order ที่ค้างอยู่ได้ (action `pay`)

### 0.4 Error code ร่วม

| HTTP | code | เมื่อไร |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | ข้อมูลไม่ถูกต้อง `details: { field: "ข้อความ" }` |
| 400 | `UPLOAD_INVALID`, `UPLOAD_INVALID_TYPE` | ไฟล์ใหญ่เกิน / ชนิดไม่รองรับ |
| 401 | `UNAUTHORIZED` | ไม่มี token / token หมดอายุหรือถูกยกเลิก |
| 403 | `FORBIDDEN` | role ไม่มีสิทธิ์ หรือไม่ใช่เจ้าของข้อมูล |
| 403 | `ACCOUNT_NOT_VERIFIED`, `ACCOUNT_RESTRICTED`, `ACCOUNT_SUSPENDED`, `ACCOUNT_BANNED` | ตาราง 0.3 (`details: { until }` ถ้ามีวันหมด) |
| 404 | `NOT_FOUND` | ไม่พบข้อมูล หรือไม่มีสิทธิ์เห็น (เช่น สินค้า draft ของคนอื่น) |
| 409 | `INVALID_STATE` | สถานะปัจจุบันทำ action นี้ไม่ได้ `details: { status }` |
| 500 | `INTERNAL_ERROR` | ข้อผิดพลาดในระบบ |

แต่ละ endpoint ด้านล่างระบุเฉพาะ error เฉพาะของ endpoint นั้น error ร่วมใช้ได้ทุก endpoint

### 0.5 ข้อมูลที่ห้ามส่งออก (QA API-21)

- เลขบัตรประชาชนเต็ม: ส่งได้แค่ `idCardLast4`
- `reservePrice`: ส่งให้เจ้าของสินค้าและแอดมินเท่านั้น สาธารณะส่ง `reserveMet: true|false|null`
- `maxAmount` ของ Proxy: ส่งให้เจ้าของ Proxy เท่านั้น
- ชื่อผู้บิดสาธารณะ: ปิดบังเป็น `a***3` (ตัวแรก + `***` + ตัวท้ายของ username) ยกเว้นผู้บิดเห็นของตัวเองเป็น `isMe: true`
- ที่อยู่จัดส่ง เบอร์โทร และเลขพัสดุของ Order: เฉพาะผู้ซื้อ ผู้ขายของ Order นั้น และแอดมิน
- `passwordHash`, token, `idCardEncrypted`, `idCardHash`: ห้ามส่งออกทุกกรณี

### 0.6 Object ที่ใช้ซ้ำ

```jsonc
// UserMe — ผู้ใช้ปัจจุบัน
{ "id": 4, "email": "buyer1@rakadee.local", "username": "buyer1", "fullName": "ผู้ซื้อ หนึ่ง",
  "displayName": "buyer1", "phone": "0822222222", "idCardLast4": "4005", "avatarUrl": null, "bio": null,
  "role": "bidder", "status": "active", "statusUntil": null,
  "phoneVerified": true, "emailVerified": true, "isSeller": false, "createdAt": "..." }

// ListingCard — การ์ดในหน้ารายการ
{ "id": 12, "title": "...", "coverUrl": "/uploads/products/x.jpg", "itemCondition": "used_good",
  "currentPrice": 1500.00, "startPrice": 1000.00, "bidCount": 4, "buyNowPrice": 5000.00,
  "shippingFee": 50.00, "status": "active", "endAt": "...", "categoryId": 21 }

// Money
1500.00
```

---

## 1. Auth & ความปลอดภัยบัญชี (เจ้าของ: SA) — ข้อ 2.1–2.4-2

| # | Method | Path | สิทธิ์ | ทำอะไร |
| --- | --- | --- | --- | --- |
| 1.1 | GET | `/api/auth/terms` | public | ข้อกำหนดการใช้งานและนโยบายความเป็นส่วนตัว + เวอร์ชัน |
| 1.2 | POST | `/api/auth/register` | public | สมัครสมาชิก |
| 1.3 | POST | `/api/auth/otp/verify` | public | ยืนยัน OTP |
| 1.4 | POST | `/api/auth/otp/resend` | public | ขอ OTP ใหม่ |
| 1.5 | POST | `/api/auth/login` | public | เข้าสู่ระบบ |
| 1.6 | POST | `/api/auth/logout` | login | ออกจากระบบ (session นี้) |
| 1.7 | GET | `/api/auth/me` | login | ข้อมูลผู้ใช้ปัจจุบัน |
| 1.8 | POST | `/api/auth/email/verify` | public | ยืนยันอีเมลจากลิงก์ |
| 1.9 | POST | `/api/auth/email/resend` | login | ส่งลิงก์ยืนยันอีเมลใหม่ |
| 1.10 | POST | `/api/auth/password/forgot` | public | ขอลิงก์รีเซ็ตรหัสผ่าน |
| 1.11 | POST | `/api/auth/password/reset` | public | ตั้งรหัสผ่านใหม่จากลิงก์ |
| 1.12 | POST | `/api/auth/password/change` | login | เปลี่ยนรหัสผ่าน (ต้องกรอกรหัสเดิม) |
| 1.13 | GET | `/api/auth/sessions` | login | อุปกรณ์/ประวัติการเข้าสู่ระบบ |
| 1.14 | DELETE | `/api/auth/sessions/:id` | login | ออกจากระบบอุปกรณ์อื่น |

**1.1 GET `/api/auth/terms`** → `{ termsVersion: "1.0", termsHtml, privacyVersion: "1.0", privacyHtml }`

**1.2 POST `/api/auth/register`**

```json
{ "email": "somchai@example.com", "username": "somchai123", "password": "Strong123",
  "fullName": "สมชาย ใจดี", "phone": "0812345678", "idCardNumber": "1103700012345",
  "acceptTerms": true, "acceptPrivacy": true, "termsVersion": "1.0", "privacyVersion": "1.0" }
```

- Validation: อีเมลถูกรูปแบบ, username 4–30 ตัว `a-z 0-9 _`, รหัสผ่านตาม policy (`utils/password.js`), เบอร์ 10 หลักขึ้นต้น 0, เลขบัตร 13 หลักและผ่าน checksum, ต้องยอมรับทั้งสองข้อ
- ระบบ: เช็ก blacklist (เลขบัตร/เบอร์) → เช็กซ้ำ → สร้าง user `pending_verification` → บันทึก `user_consents` 2 แถว (version, IP) → สร้าง OTP (log ลง console + ส่งอีเมล) → ส่งลิงก์ยืนยันอีเมล
- 201 → `{ userId: 21, email, username, idCardLast4: "2345", otpExpiresAt }`
- Errors: `EMAIL_TAKEN`, `USERNAME_TAKEN`, `PHONE_TAKEN`, `ID_CARD_TAKEN` (409), `BLACKLISTED` (403), `TERMS_NOT_ACCEPTED`, `INVALID_ID_CARD`, `WEAK_PASSWORD` (400)

**1.3 POST `/api/auth/otp/verify`** `{ "userId": 21, "code": "482910" }`

- ผ่าน: `phone_verified_at`, `status = active`, `activated_at`, เรียก `wallet.create(userId)` (+10,000, D-05), สร้าง session
- 200 → `{ token, expiresAt, user: UserMe, walletBalance: 10000.00 }`
- Errors: `OTP_INVALID` (400, `details: { attemptsLeft }`), `OTP_EXPIRED` (400), `OTP_TOO_MANY_ATTEMPTS` (429 กรอกผิด 5 ครั้ง ต้องขอใหม่), `ALREADY_VERIFIED` (409)

**1.4 POST `/api/auth/otp/resend`** `{ "userId": 21 }` → `{ otpExpiresAt }` · Errors: `OTP_RESEND_TOO_SOON` (429, `details: { retryAfterSec }` ขอได้ทุก 60 วินาที), `ALREADY_VERIFIED`

**1.5 POST `/api/auth/login`** `{ "identifier": "somchai123", "password": "Strong123" }` (identifier = อีเมลหรือ username)

- 200 → `{ token, expiresAt, user: UserMe }` (ถ้า `pending_verification` FE พาไปหน้า OTP พร้อม `userId`)
- Errors: `INVALID_CREDENTIALS` (401 ไม่บอกว่าผิดช่องไหน), `ACCOUNT_BANNED` (403)

**1.6 POST `/api/auth/logout`** → `{ loggedOut: true }`

**1.7 GET `/api/auth/me`** → `UserMe` (navbar ใช้ตัวนี้)

**1.8 POST `/api/auth/email/verify`** `{ "token": "..." }` → `{ emailVerified: true }` · Errors: `TOKEN_INVALID`, `TOKEN_EXPIRED` (400)

**1.9 POST `/api/auth/email/resend`** → `{ sent: true }`

**1.10 POST `/api/auth/password/forgot`** `{ "email": "..." }` → `{ sent: true }` เสมอ (ไม่บอกว่ามีอีเมลนี้หรือไม่) ลิงก์อายุ `time.passwordResetExpireMs` (30 นาที) ใช้ได้ครั้งเดียว

**1.11 POST `/api/auth/password/reset`** `{ "token": "...", "newPassword": "..." }` → `{ reset: true }` และยกเลิกทุก session · Errors: `TOKEN_INVALID`, `TOKEN_EXPIRED`, `WEAK_PASSWORD`

**1.12 POST `/api/auth/password/change`** `{ "currentPassword", "newPassword" }` → `{ changed: true }` ยกเลิก session อื่นทั้งหมด (คง session ปัจจุบัน) · Errors: `WRONG_PASSWORD` (400), `WEAK_PASSWORD`, `SAME_PASSWORD`

**1.13 GET `/api/auth/sessions`** → `{ items: [{ id, ipAddress, userAgent, createdAt, lastSeenAt, isCurrent }] }` เฉพาะที่ยังไม่ revoke

**1.14 DELETE `/api/auth/sessions/:id`** → `{ revoked: true }` · Errors: `NOT_FOUND`

---

## 2. Settings: โปรไฟล์ ที่อยู่ การแจ้งเตือน (เจ้าของ: PM) — ข้อ 2.4-1, 2.4-3, 2.4-4

| # | Method | Path | สิทธิ์ | ทำอะไร |
| --- | --- | --- | --- | --- |
| 2.1 | PATCH | `/api/users/me` | login | แก้ชื่อที่แสดง, คำแนะนำตัว |
| 2.2 | POST | `/api/users/me/avatar` | login | อัปโหลดรูปโปรไฟล์ (field `avatar`) |
| 2.3 | DELETE | `/api/users/me/avatar` | login | ลบรูปโปรไฟล์ |
| 2.4 | GET | `/api/users/me/addresses` | member | รายการที่อยู่ |
| 2.5 | POST | `/api/users/me/addresses` | member | เพิ่มที่อยู่ |
| 2.6 | PUT | `/api/users/me/addresses/:id` | member | แก้ที่อยู่ |
| 2.7 | DELETE | `/api/users/me/addresses/:id` | member | ลบที่อยู่ |
| 2.8 | POST | `/api/users/me/addresses/:id/default` | member | ตั้งเป็นที่อยู่เริ่มต้น |
| 2.9 | GET | `/api/users/me/notification-settings` | member | ดูการตั้งค่าแจ้งเตือน |
| 2.10 | PUT | `/api/users/me/notification-settings` | member | บันทึกการตั้งค่าแจ้งเตือน |
| 2.11 | GET | `/api/users/:id/public` | public | ข้อมูลสาธารณะของผู้ใช้ (ตัวอย่างโปรไฟล์) |

- **2.1** `{ "displayName": "สมชาย", "bio": "..." }` (displayName 2–50, bio ≤ 500) → `UserMe`
- **2.2** → `{ avatarUrl }` · **2.3** → `{ avatarUrl: null }`
- **Address object:** `{ id, recipientName, phone, addressLine, subDistrict, district, province, postalCode, isDefault }`
- **2.5 / 2.6** body = Address ไม่มี `id` (ทุกฟิลด์บังคับ, `postalCode` 5 หลัก) ที่อยู่แรกเป็นค่าเริ่มต้นอัตโนมัติ → Address
- **2.7** ลบที่อยู่เริ่มต้นได้ถ้ามีที่อยู่อื่น (ระบบตั้งอันเก่าสุดเป็นค่าเริ่มต้นแทน) · Errors: `LAST_DEFAULT_ADDRESS` (409 ลบอันสุดท้ายไม่ได้ถ้ามี Order ที่ยังไม่จ่าย)
- **2.9 / 2.10** `{ "auction": { "web": true, "email": true }, "finance": { "web": true, "email": false }, "shipping": { "web": true, "email": true } }`
- **2.11** → `{ id, displayName, avatarUrl, bio, joinedAt, isSeller, emailVerified, phoneVerified }`

---

## 3. เปิดสิทธิ์ผู้ขาย (เจ้าของ: QA) — ข้อ 2.4-5, D-07

| # | Method | Path | สิทธิ์ | ทำอะไร |
| --- | --- | --- | --- | --- |
| 3.1 | POST | `/api/seller/profile` | member (`sell`) | เปิดร้าน → `role = seller` ทันที |
| 3.2 | GET | `/api/seller/profile` | seller | ข้อมูลร้านของฉัน |
| 3.3 | PUT | `/api/seller/profile` | seller | แก้ข้อมูลร้าน |
| 3.4 | GET | `/api/sellers/:userId` | public | โปรไฟล์ร้านสาธารณะ + สินค้าที่กำลังประมูล |

- **3.1 / 3.3** `{ "shopName": "ร้านการ์ด", "shopDescription": "...", "originProvince": "เชียงใหม่" }` → `{ shopName, shopDescription, originProvince, createdAt }` · Errors: `ALREADY_SELLER` (409)
- **3.4** → `{ userId, shopName, shopDescription, originProvince, displayName, avatarUrl, joinedAt, activeListings: [ListingCard] }`

---

## 4. สินค้า: ลงขายและอนุมัติ (เจ้าของ: QA) — ข้อ 3.1–3.4, 8.2-2

สถานะ (ข้อ 1.7-1): `draft` → `pending_review` → `active` | `rejected`; `rejected` แก้แล้วส่งใหม่ได้; `cancelled` ได้เฉพาะก่อน `active`

| # | Method | Path | สิทธิ์ | ทำอะไร |
| --- | --- | --- | --- | --- |
| 4.1 | GET | `/api/categories` | public | หมวดหลัก + หมวดย่อย |
| 4.2 | POST | `/api/listings` | seller (`sell`) | สร้างสินค้า (บันทึกเป็น `draft`) |
| 4.3 | PUT | `/api/listings/:id` | seller เจ้าของ | แก้ (เฉพาะ draft / pending_review / rejected) |
| 4.4 | POST | `/api/listings/:id/images` | seller เจ้าของ | อัปโหลดรูป (field `images` หลายไฟล์) |
| 4.5 | DELETE | `/api/listings/:id/images/:imageId` | seller เจ้าของ | ลบรูป |
| 4.6 | POST | `/api/listings/:id/images/:imageId/cover` | seller เจ้าของ | ตั้งเป็นรูปปก |
| 4.7 | POST | `/api/listings/:id/submit` | seller เจ้าของ | ส่งตรวจ → `pending_review` |
| 4.8 | POST | `/api/listings/:id/cancel` | seller เจ้าของ | ยกเลิก (ก่อน active) |
| 4.9 | GET | `/api/seller/listings` | seller | สินค้าของฉัน (`?status=` แยกแท็บ) |
| 4.10 | GET | `/api/admin/listings` | admin | รายการตามสถานะ (ค่าเริ่มต้น `pending_review`) |
| 4.11 | GET | `/api/admin/listings/:id` | admin | รายละเอียดเต็ม (รวม reserve) |
| 4.12 | POST | `/api/admin/listings/:id/approve` | admin | อนุมัติ → `active` เริ่มประมูลทันที |
| 4.13 | POST | `/api/admin/listings/:id/reject` | admin | ไม่อนุมัติ (บังคับเหตุผล) |

**4.1** → `{ items: [{ id: 2, name: "ของสะสม", slug, children: [{ id: 21, name: "การ์ดสะสม", slug }] }] }`

**4.2 / 4.3 body** (ข้อ 3.1–3.3)

```json
{ "title": "การ์ดโปเกมอน Charizard", "categoryId": 21, "description": "...",
  "includedItems": "การ์ด 1 ใบ + ซองกันรอย", "itemCondition": "defective", "defectDetail": "มุมขวาบนถลอก",
  "shippingFee": 50.00, "originProvince": "เชียงใหม่",
  "startPrice": 1000.00, "bidIncrement": 100.00, "reservePrice": 3000.00, "buyNowPrice": 5000.00,
  "durationDays": 3 }
```

- Validation (ทั้ง FE และ BE, ข้อ 3.3): ช่องบังคับ title, categoryId (ต้องเป็นหมวดย่อย), description, itemCondition, shippingFee, originProvince, startPrice, bidIncrement, durationDays; `itemCondition` ∈ `new | used_good | defective`, `defective` ต้องมี `defectDetail`; ตัวเลขต้องไม่ติดลบ, `startPrice > 0`, `bidIncrement > 0`, `reservePrice ≥ startPrice`, `buyNowPrice > startPrice` และ `> reservePrice`; `durationDays` ∈ 1, 3, 7
- `originProvince` ค่าเริ่มต้นจากข้อมูลร้าน
- Response → `ListingDetail` (ดู 5.2) สำหรับเจ้าของ รวม `reservePrice`, `status`, `rejectReason`
- Errors: `VALIDATION_ERROR` (`details` ระบุทุกช่อง เช่น `{ "reservePrice": "ราคาขั้นต่ำต้องไม่น้อยกว่าราคาเริ่มต้น" }`), `INVALID_STATE` (แก้หลังอนุมัติ)

**4.4** สูงสุดรวม 8 รูป รูปแรกที่อัปโหลดเป็นปกอัตโนมัติ → `{ images: [{ id, url, isCover, sortOrder }] }` · Errors: `TOO_MANY_IMAGES` (400)

**4.7** ตรวจครบ: ฟิลด์บังคับ + มีรูป 1–8 รูป + มีปก → `{ id, status: "pending_review", submittedAt }` · Errors: `IMAGES_REQUIRED`, `VALIDATION_ERROR`, `INVALID_STATE`

**4.8** → `{ id, status: "cancelled" }` · Errors: `INVALID_STATE` (เริ่มประมูลแล้ว)

**4.9** query `status`, `page`, `limit` → รายการ `{ ...ListingCard, status, rejectReason, submittedAt }`

**4.10** query `status` (ค่าเริ่มต้น `pending_review`), `q`, `page` → `{ items: [{ id, title, coverUrl, seller: { id, displayName, shopName }, categoryName, startPrice, submittedAt, status }] }`

**4.12** ระบบตั้ง `start_at = now`, `end_at = now + durationDays`, `current_price = NULL`, `notify(seller, LISTING_APPROVED)`, `audit.log(LISTING_APPROVE)` → `{ id, status: "active", startAt, endAt }`

**4.13** `{ "reason": "ภาพไม่ชัด" }` (บังคับ 5–500 ตัว) → `{ id, status: "rejected", rejectReason }` + `notify(LISTING_REJECTED)` + `audit.log(LISTING_REJECT)` · Errors: `REASON_REQUIRED`

---

## 5. หน้าแรก ค้นหา รายละเอียด Watchlist (เจ้าของ: Programmer) — ข้อ 1.5-2, 3.5

| # | Method | Path | สิทธิ์ | ทำอะไร |
| --- | --- | --- | --- | --- |
| 5.1 | GET | `/api/listings` | public | ค้นหา/กรอง/เรียง (เฉพาะ active และ ended) |
| 5.2 | GET | `/api/listings/:id` | public | รายละเอียดสินค้า |
| 5.3 | GET | `/api/listings/:id/bids` | public | ประวัติการบิด (ปิดบังชื่อ) |
| 5.4 | GET | `/api/home` | public | หน้าแรก: ใกล้จบ + ใหม่ล่าสุด |
| 5.5 | GET | `/api/watchlist` | member | รายการ Watchlist |
| 5.6 | POST | `/api/watchlist` | member | เพิ่ม `{ listingId }` |
| 5.7 | DELETE | `/api/watchlist/:listingId` | member | ลบ |

**5.1 query** (ข้อ 3.5)

| param | ค่า |
| --- | --- |
| `q` | ค้นหาในชื่อและรายละเอียด |
| `categoryId` | หมวดหลักหรือหมวดย่อย (หมวดหลักรวมหมวดย่อยทั้งหมด) |
| `condition` | `new`, `used_good`, `defective` (ใส่หลายค่าคั่นด้วย `,`) |
| `minPrice`, `maxPrice` | ช่วงราคาปัจจุบัน (ยังไม่มีบิดใช้ราคาเริ่มต้น) |
| `status` | `active` (ค่าเริ่มต้น), `ended` |
| `endingWithinHours` | ใกล้จบภายในกี่ชั่วโมง |
| `sort` | `newest` (ค่าเริ่มต้น), `ending_soon`, `price_asc`, `price_desc` |
| `page`, `limit` | แบ่งหน้า |

→ `{ items: [ListingCard], page, limit, total }`

**5.2** → `ListingDetail`

```jsonc
{ "id": 12, "title": "...", "description": "...", "includedItems": "...",
  "itemCondition": "defective", "defectDetail": "...", "category": { "id": 21, "name": "การ์ดสะสม", "parent": { "id": 2, "name": "ของสะสม" } },
  "images": [{ "id": 1, "url": "/uploads/products/a.jpg", "isCover": true }],
  "shippingFee": 50.00, "originProvince": "เชียงใหม่",
  "startPrice": 1000.00, "bidIncrement": 100.00, "currentPrice": 1500.00, "minNextBid": 1600.00,
  "buyNowPrice": 5000.00, "buyNowAvailable": true, "reserveMet": false,
  "bidCount": 4, "status": "active", "result": null,
  "startAt": "...", "endAt": "...", "extendCount": 2, "maxExtendCount": 10,
  "serverTime": "2026-11-08T07:30:00.000Z",
  "seller": { "id": 3, "displayName": "ร้านทดสอบ", "shopName": "ร้านทดสอบ" },
  "me": { "isOwner": false, "isLeading": true, "inWatchlist": true, "proxy": { "maxAmount": 3000.00, "isActive": true } } }
```

- `minNextBid` = `startPrice` ถ้ายังไม่มีบิด ไม่งั้น `currentPrice + bidIncrement`
- `buyNowAvailable` = สถานะ active และมี `buyNowPrice` และ (ยังไม่มีบิด หรือ `currentPrice < buyNowPrice`) (D-15)
- `me` เป็น `null` สำหรับ Guest; เจ้าของสินค้าได้ `reservePrice` เพิ่ม
- สินค้า draft/pending/rejected/cancelled ของคนอื่นตอบ `NOT_FOUND`

**5.3** → `{ items: [{ bidder: "b***1", isMe: false, amount: 1500.00, bidType: "manual", createdAt }], page, limit, total }` เรียงใหม่สุดก่อน (`bidType` ของ Proxy แสดงเป็น `"auto"`)

**5.4** → `{ endingSoon: [ListingCard x 8], newest: [ListingCard x 8] }`

**5.5** → `{ items: [{ ...ListingCard, addedAt }] }` · **5.6** → `{ listingId, inWatchlist: true }` · Errors: `ALREADY_IN_WATCHLIST` (409) · **5.7** → `{ listingId, inWatchlist: false }`

---

## 6. Auction Engine (เจ้าของ: Programmer) — ข้อ 4

| # | Method | Path | สิทธิ์ | ทำอะไร |
| --- | --- | --- | --- | --- |
| 6.1 | POST | `/api/listings/:id/bids` | member (`bid`) | บิดเอง |
| 6.2 | GET | `/api/listings/:id/proxy` | member | ดู Proxy ของฉัน |
| 6.3 | PUT | `/api/listings/:id/proxy` | member (`bid`) | ตั้ง / เพิ่มวงเงิน Proxy (ลดหรือยกเลิกไม่ได้ D-13) |
| 6.5 | POST | `/api/listings/:id/buy-now` | member (`bid`) | ซื้อทันที |
| 6.6 | GET | `/api/me/bids` | member | การประมูลของฉัน |
| 6.7 | GET | `/api/me/won` | member | รายการที่ชนะ |

**6.1 POST `/api/listings/:id/bids`** `{ "amount": 1600.00 }`

- อัลกอริทึมเต็ม (กฎ 1–10, pseudocode, ตัวอย่างตัวเลข) อยู่ใน `docs/auction/proxy-bid-algorithm.pdf` ใช้ฟังก์ชันเดียว `placeBid(listingId, userId, amount, mode)` ทั้ง 6.1 (`manual`) และ 6.3 (`proxy`)
- ใน transaction: `SELECT ... FOR UPDATE` listing → ตรวจข้อ 4.1-2 (active, `now < end_at`, ไม่ใช่เจ้าของ, ไม่ใช่แอดมิน, สถานะบัญชี, `amount ≥ minNextBid`) → INSERT bids → ประมวล Proxy ของผู้นำ (ข้อ 4.2) → ดันราคาถึง Reserve ถ้าเข้าเงื่อนไข (D-14) → Auto Extend ถ้าเหลือ ≤ 2 นาทีและยังไม่ครบ 10 ครั้ง (`end_at = เวลาบิด + 2 นาที`, D-16) → commit → Socket `bid:new`, `bid:leader` (+ `auction:extended`) → `notify(ผู้ถูกแซง, OUTBID)`
- ไม่เช็กยอด Wallet (D-06)
- 201 → `{ listingId, currentPrice, minNextBid, bidCount, isLeading, endAt, extended: true, extendCount, serverTime }` (`isLeading` อาจเป็น false ถ้า Proxy ของคนอื่นบิดทับทันที)
- Errors: `BID_TOO_LOW` (400, `details: { minNextBid }`), `AUCTION_NOT_ACTIVE` (409), `AUCTION_ENDED` (409), `SELF_BIDDING` (403), `ALREADY_LEADING` (409 เป็นผู้นำอยู่แล้ว)

**6.2** → `{ maxAmount, isActive, isLeading }` หรือ `null`

**6.3 PUT** `{ "maxAmount": 3000.00 }` ตั้งครั้งแรกหรือเพิ่มวงเงิน ระบบบิดแทนทันทีถ้าจำเป็น → `{ maxAmount, isActive, isLeading, currentPrice, minNextBid, extended, endAt }` · Errors: `PROXY_TOO_LOW` (400 ต้อง ≥ `minNextBid`, `details: { minNextBid }`), `PROXY_CANNOT_DECREASE` (400 วงเงินใหม่ต้องมากกว่าเดิม D-13), `AUCTION_NOT_ACTIVE`, `AUCTION_ENDED`, `SELF_BIDDING`
- ผู้นำเพิ่มวงเงิน: ราคาไม่ขยับ (ยกเว้นดันถึง Reserve ตาม D-14) และไม่ต่อเวลา (D-16)

**6.5 POST `/api/listings/:id/buy-now`** `{ "confirm": true }` ใช้ได้เมื่อ `buyNowAvailable` เป็นจริง (D-15)

- ใน transaction: ตรวจ active + มี `buyNowPrice` + ไม่ใช่เจ้าของ + สถานะบัญชี → INSERT bids (`buy_now`) → listing `ended`, `result = buy_now`, `winner_id` → `order.create(listingId, buyerId, buyNowPrice)` → Socket `auction:closed` → แจ้งเตือนผู้ซื้อ ผู้ขาย และผู้บิดคนอื่น
- 201 → `{ listingId, orderId, price, paymentDueAt }`
- Errors: `BUY_NOW_NOT_AVAILABLE` (409), `AUCTION_NOT_ACTIVE`, `SELF_BIDDING`, `CONFIRM_REQUIRED` (400)

**6.6** query `status` = `active` | `ended` → `{ items: [{ ...ListingCard, myHighestBid, isLeading, result, won }] }`

**6.7** → `{ items: [{ listingId, title, coverUrl, price, orderId, orderStatus, paymentDueAt }] }`

**Scheduler `closeAuctions`** (ไม่มี API): หา `status = active AND end_at <= now` ปิดทีละรายการใน transaction ตัดสินผล (ข้อ 4.5):

| เงื่อนไข | result | ผล |
| --- | --- | --- |
| ไม่มีบิด | `no_bid` | แจ้งผู้ขาย |
| มีบิดแต่ `current_price < reserve_price` | `below_reserve` | แจ้งผู้ขายและผู้บิดสูงสุด ไม่สร้าง Order |
| มีบิดและถึง reserve (หรือไม่ตั้ง reserve) | `has_winner` | `order.create()` แจ้งผู้ชนะ (`AUCTION_WON`) ผู้แพ้ (`AUCTION_LOST`) ผู้ขาย |

`order.create()` (Programmer): สร้าง Order `pending_payment`, `item_price`, `shipping_fee`, `total_amount`, snapshot ที่อยู่เริ่มต้นของผู้ซื้อ (ถ้าไม่มีที่อยู่ให้เก็บ `{}` และผู้ซื้อต้องเลือกที่อยู่ก่อนชำระ), `payment_due_at = now + time.paymentDueMs`

---

## 7. Wallet และการชำระเงิน (เจ้าของ: SA) — ข้อ 5.1, 5.2, 5.5, 8.2-3, D-01, D-10

| # | Method | Path | สิทธิ์ | ทำอะไร |
| --- | --- | --- | --- | --- |
| 7.1 | GET | `/api/wallet` | member | ยอดคงเหลือ + ยอดรอรับ (ผู้ขาย) |
| 7.2 | GET | `/api/wallet/transactions` | member | ประวัติธุรกรรม |
| 7.3 | GET | `/api/seller/earnings` | seller | รายได้แยกรายการ + ค่าธรรมเนียม |
| 7.4 | GET | `/api/orders/:id/payment` | ผู้ซื้อของ Order | ข้อมูลหน้าชำระเงิน |
| 7.5 | PUT | `/api/orders/:id/shipping-address` | ผู้ซื้อของ Order | เปลี่ยนที่อยู่จัดส่ง (ก่อนชำระเท่านั้น) |
| 7.6 | POST | `/api/orders/:id/pay` | ผู้ซื้อของ Order (`pay`) | ชำระด้วย Mock Wallet |
| 7.7 | POST | `/api/payments/:id/slip` | ผู้ซื้อ | แนบสลิปจำลอง (ไม่บังคับ) |
| 7.8 | GET | `/api/admin/payments` | admin | รายการรอตรวจ (`?status=pending_review`) |
| 7.9 | GET | `/api/admin/payments/:id` | admin | รายละเอียดการชำระ + Order |
| 7.10 | POST | `/api/admin/payments/:id/approve` | admin | อนุมัติ → Escrow |
| 7.11 | POST | `/api/admin/payments/:id/reject` | admin | ปฏิเสธ → คืนเงิน (บังคับเหตุผล) |

**7.1** → `{ balance: 7250.00, pendingIncome: 1500.00, currency: "THB" }` (`pendingIncome` = ผลรวมของ Escrow `held` ใน Order ที่ฉันเป็นผู้ขาย หักค่าธรรมเนียมตามสูตร D-10)

**7.2** query `page`, `type` → `{ items: [{ id, type, amount, balanceAfter, referenceType, referenceId, note, createdAt }], page, limit, total }`

**7.3** → `{ items: [{ orderId, listingTitle, itemPrice, shippingFee, feeAmount, netAmount, status: "held|released|refunded", releasedAt }], totals: { released, pending, fees } }`

**7.4** (ข้อ 5.5 หน้าชำระเงิน) → `{ orderId, listing: { id, title, coverUrl }, mode: "auction|buy_now", itemPrice, shippingFee, totalAmount, paymentDueAt, remainingSec, paymentMethods: ["mock_wallet"], walletBalance, shortfall, shippingAddress, latestPayment: { id, status, rejectReason, slipUrl } | null }`
- `shortfall` = `max(totalAmount − walletBalance, 0)` · `remainingSec` เป็น `null` ระหว่างรอแอดมินตรวจ (นาฬิกาหยุด)

**7.5** `{ "addressId": 3 }` → `{ shippingAddress }` · Errors: `INVALID_STATE` (ชำระแล้ว)

**7.6 POST `/api/orders/:id/pay`** `{}` (D-01)

- ใน transaction: lock order + wallet → Order ต้อง `pending_payment`, ยังไม่เลย `payment_due_at`, ไม่มี payment `pending_review`, มีที่อยู่จัดส่ง → `balance ≥ totalAmount` → หัก wallet + `wallet_transactions(payment)` → INSERT payments `pending_review`
- 201 → `{ paymentId, status: "pending_review", walletBalance }`
- Errors: `INSUFFICIENT_BALANCE` (400, `details: { shortfall }`), `PAYMENT_EXPIRED` (409), `PAYMENT_ALREADY_SUBMITTED` (409 กดซ้ำ), `ADDRESS_REQUIRED` (400), `INVALID_STATE`

**7.7 POST `/api/payments/:id/slip`** multipart: `slip` (ไฟล์), `slipAmount`, `slipTransferredAt`, `slipReference` (ไม่บังคับทุกช่อง แต่ต้องมีอย่างน้อยไฟล์) → `{ paymentId, slipUrl, slipUploadedAt }` · Errors: `INVALID_STATE` (ตรวจแล้ว)

**7.8** → `{ items: [{ paymentId, orderId, buyer: { id, displayName }, listingTitle, amount, hasSlip, createdAt, reviewDueAt }] }` เรียงเก่าสุดก่อน (`reviewDueAt` = createdAt + 24 ชม.)

**7.9** → `{ payment: {...ทุกฟิลด์รวม slip}, order: {...}, buyer, seller }`

**7.10** ใน transaction: payment `success` → order `awaiting_shipment`, `paid_at`, `ship_due_at = now + time.shippingDueMs` → `escrow.hold(orderId)` → `notify(buyer, PAYMENT_SUCCESS)` + แจ้งผู้ขายให้จัดส่ง → `audit.log(PAYMENT_APPROVE)` → `{ paymentId, status: "success", orderStatus: "awaiting_shipment", shipDueAt }`

**7.11** `{ "reason": "ยอดเงินไม่ตรง" }` ใน transaction: payment `rejected` → คืนเงิน `wallet_transactions(payment_refund)` → เลื่อน `payment_due_at` เท่ากับเวลาที่ถูกหยุดไว้ (เวลาที่เหลือตอนกดชำระ) → `notify(buyer)` → `audit.log(PAYMENT_REJECT)` → `{ paymentId, status: "rejected", paymentDueAt }` · Errors: `REASON_REQUIRED`, `INVALID_STATE`

**Scheduler (SA):** `paymentReminder` เมื่อผ่าน `time.paymentReminderMs` และยังไม่มี payment `pending_review` → `notify(PAYMENT_DUE_SOON)` ครั้งเดียว · `paymentTimeout` เมื่อเลย `payment_due_at` และไม่มี payment `pending_review` → Order `cancelled` (`payment_timeout`) + `penalty.add(buyer, 'non_payment', { orderId })` (D-04)

**Service (SA):** `escrow.hold(orderId)`, `escrow.release(orderId)` (ปฏิเสธถ้า `dispute.isOpen`; คิด fee ตาม D-10; `wallet_transactions(sale_proceeds)`; `notify(seller, FUNDS_RELEASED)`), `escrow.refund(orderId)` (`wallet_transactions(escrow_refund)`; `notify(buyer, REFUNDED)`)

---

## 8. คำสั่งซื้อและการจัดส่ง (เจ้าของ: PM) — ข้อ 6, D-08

| # | Method | Path | สิทธิ์ | ทำอะไร |
| --- | --- | --- | --- | --- |
| 8.1 | GET | `/api/orders` | member | คำสั่งซื้อของฉัน (`?role=buyer` ค่าเริ่มต้น / `seller`, `?status=`) |
| 8.2 | GET | `/api/orders/:id` | ผู้ซื้อ/ผู้ขายของ Order, admin | รายละเอียด + ไทม์ไลน์ |
| 8.3 | GET | `/api/seller/shipments` | seller | รายการรอจัดส่ง (ข้อ 6.5) |
| 8.4 | POST | `/api/orders/:id/shipment` | ผู้ขายของ Order (`pay`) | บันทึกการจัดส่ง (multipart ถ้ามีหลักฐาน) |
| 8.5 | POST | `/api/orders/:id/confirm-receipt` | ผู้ซื้อของ Order (`pay`) | ยืนยันรับสินค้า → ปล่อยเงิน |
| 8.6 | POST | `/api/orders/:id/cancel` | ผู้ซื้อของ Order | ขอยกเลิกเมื่อผู้ขายไม่ส่งเกินกำหนด |
| 8.7 | GET | `/api/admin/orders` | admin | ค้นหาคำสั่งซื้อทั้งหมด |

**OrderDetail (8.2)**

```jsonc
{ "id": 501, "status": "shipped", "closingType": "auction",
  "listing": { "id": 12, "title": "...", "coverUrl": "..." },
  "buyer": { "id": 4, "displayName": "buyer1" }, "seller": { "id": 3, "displayName": "ร้านทดสอบ" },
  "itemPrice": 3200.00, "shippingFee": 50.00, "totalAmount": 3250.00,
  "shippingAddress": { "recipientName": "...", "phone": "...", "addressLine": "...", "subDistrict": "...", "district": "...", "province": "...", "postalCode": "..." },
  "payment": { "status": "success", "paidAt": "..." }, "escrow": { "status": "held", "amount": 3250.00 },
  "shipment": { "carrier": "flash", "carrierOther": null, "trackingNumber": "TH123", "shippedAt": "...", "proofUrl": null, "note": null },
  "paymentDueAt": "...", "shipDueAt": "...", "autoReleaseAt": "...", "completedAt": null,
  "dispute": { "id": 55, "status": "investigating" } ,
  "canCancel": false, "canConfirmReceipt": true, "canOpenDispute": true,
  "timeline": [{ "event": "order_created", "at": "..." }, { "event": "paid", "at": "..." }, { "event": "shipped", "at": "..." }] }
```

- `canCancel` = ผู้ซื้อ + `awaiting_shipment` + เลย `ship_due_at` · `canConfirmReceipt` = ผู้ซื้อ + `shipped` · `canOpenDispute` = ผู้ซื้อ + (`awaiting_shipment` หรือ `shipped`) + escrow `held` + ไม่มีข้อพิพาทเปิดอยู่

**8.3** → `{ items: [{ orderId, listingTitle, paidAt, shipDueAt, remainingSec, recipient: {...shippingAddress}, shippingFee, disputeStatus }] }` (ข้อ 6.5 ครบ 8 ฟิลด์) เรียงใกล้ครบกำหนดก่อน

**8.4** `{ "carrier": "flash", "carrierOther": null, "trackingNumber": "TH1234567890", "shippedAt": "2026-11-08T03:00:00Z", "note": "..." }` + ไฟล์ `proof` (ไม่บังคับ)
- `carrier` ∈ `thailand_post | kerry | flash | jt | other` (`other` ต้องมี `carrierOther`)
- ระบบ: Order `shipped`, `shipped_at`, `auto_release_at = now + time.autoReleaseMs`, `notify(buyer, SHIPPED)`
- → `{ orderId, status: "shipped", autoReleaseAt }` · Errors: `INVALID_STATE` (ไม่ใช่ `awaiting_shipment`), `ORDER_CANCELLED`

**8.5** → `escrow.release()` → `{ orderId, status: "completed", escrowStatus: "released" }` · Errors: `INVALID_STATE`, `DISPUTE_OPEN` (409)

**8.6** `{ "reason": "ผู้ขายไม่ส่งของ" }` → Order `cancelled` (`seller_no_shipment`) + `escrow.refund()` + `penalty.add(seller, 'no_shipment', { orderId })` → `{ orderId, status: "cancelled", refundAmount }` · Errors: `CANCEL_NOT_ALLOWED` (409 ยังไม่เลยกำหนด)

**8.7** query `status`, `q` (รหัส Order / ชื่อสินค้า / ผู้ใช้), `page` → รายการ `OrderDetail` แบบย่อ

**Scheduler (PM):** `shippingDeadline` แจ้งเตือนผู้ขายเมื่อเหลือ 24 ชม. ก่อน `ship_due_at` และแจ้งผู้ซื้อว่ายกเลิกได้เมื่อเลยกำหนด · `autoRelease` เมื่อ `status = shipped AND auto_release_at <= now AND ไม่มีข้อพิพาทเปิด` → `escrow.release()` + Order `completed`

---

## 9. ข้อพิพาท (เจ้าของ: QA) — ข้อ 6.4, 7 (ข้อมูลที่กรอก), 8.2-4, D-08

| # | Method | Path | สิทธิ์ | ทำอะไร |
| --- | --- | --- | --- | --- |
| 9.1 | POST | `/api/orders/:id/disputes` | ผู้ซื้อของ Order (`pay`) | เปิดข้อพิพาท (multipart หลักฐานหลายรูป) |
| 9.2 | GET | `/api/disputes/:id` | ผู้ซื้อ/ผู้ขายของ Order, admin | รายละเอียด + หลักฐานสองฝั่ง |
| 9.3 | POST | `/api/disputes/:id/evidence` | ผู้ซื้อ/ผู้ขายของ Order | ส่งหลักฐานเพิ่ม (field `files` + `note`) |
| 9.4 | GET | `/api/admin/disputes` | admin | รายการข้อพิพาท (`?status=`) |
| 9.5 | PATCH | `/api/admin/disputes/:id/status` | admin | เปลี่ยนสถานะระหว่างตรวจ |
| 9.6 | POST | `/api/admin/disputes/:id/resolve` | admin | ตัดสิน |

**9.1** multipart: `type` (`not_received | not_as_described | damaged | other`), `description` (บังคับ ≥ 10 ตัว), `contactInfo`, `files` (0–5 รูป)
- ระบบ: Order `disputed` (escrow ยัง `held` แต่ปล่อยไม่ได้), `notify(seller, DISPUTE_OPENED)`
- → `{ disputeId, status: "open", orderStatus: "disputed" }` · Errors: `DISPUTE_NOT_ALLOWED` (409 เงินถูกปล่อยแล้วหรือสถานะไม่ใช่), `DISPUTE_ALREADY_OPEN` (409)

**9.2** → `{ id, orderId, type, description, contactInfo, status, resolution, adminNote, openedAt, resolvedAt, order: OrderDetail(ย่อ), evidence: [{ id, party: "buyer|seller", url, note, createdAt }] }`

**9.3** → `{ evidence: [...] }` · Errors: `INVALID_STATE` (ปิดแล้ว)

**9.5** `{ "status": "awaiting_evidence" | "investigating" | "return_in_progress" | "refund_in_progress", "note": "..." }` → `{ id, status }` + แจ้งทั้งสองฝ่าย + `audit.log(DISPUTE_STATUS)`

**9.6** `{ "resolution": "refund_buyer" | "release_seller", "adminNote": "..." }` (adminNote บังคับ)
- `refund_buyer`: dispute `closed` → `escrow.refund()` → Order `cancelled` (`dispute_refund`)
- `release_seller`: dispute `closed` → `escrow.release()` → Order `completed`
- `audit.log(DISPUTE_RESOLVE)` → `{ id, status: "closed", resolution, orderStatus, escrowStatus }` · Errors: `INVALID_STATE` (ปิดแล้ว), `NOTE_REQUIRED`

**Service (QA):** `dispute.isOpen(orderId)` → `true` ถ้ามีแถวที่ `status <> 'closed'`

---

## 10. บทลงโทษและจัดการผู้ใช้ (เจ้าของ: QA) — ข้อ 7.1–7.3, 8.2-5

| # | Method | Path | สิทธิ์ | ทำอะไร |
| --- | --- | --- | --- | --- |
| 10.1 | GET | `/api/admin/users` | admin | ค้นหาสมาชิก (`?q=` ชื่อ/อีเมล/เบอร์/username, `?status=`, `?role=`) |
| 10.2 | GET | `/api/admin/users/:id` | admin | โปรไฟล์มุมแอดมิน |
| 10.3 | POST | `/api/admin/users/:id/status` | admin | เปลี่ยนสถานะบัญชี |
| 10.4 | POST | `/api/admin/users/:id/ban` | admin | แบน + Blacklist |
| 10.5 | POST | `/api/admin/blacklists/:id/revoke` | super_admin | ปลดแบน |
| 10.6 | GET | `/api/admin/suspicious-flags` | admin | รายการบิดน่าสงสัย (`?reviewed=false`) |
| 10.7 | POST | `/api/admin/suspicious-flags/:id/review` | admin | ทำเครื่องหมายว่าตรวจแล้ว |

**10.1** → `{ items: [{ id, username, displayName, email, phone, role, status, statusUntil, createdAt, penaltyCount }] }`

**10.2** → `{ user: {...UserMe ไม่มี idCard เต็ม}, wallet: { balance }, stats: { bids, won, sold }, penalties: [...], recentBids: [...], recentOrders: [...], transactions: [...] }`

**10.3** `{ "status": "active" | "restricted" | "suspended", "until": "2026-11-15T00:00:00Z", "reason": "..." }` (`until` บังคับเมื่อ restricted/suspended, `reason` บังคับ) → `{ id, status, statusUntil }` + `audit.log(USER_STATUS)` · Errors: `CANNOT_MODIFY_ADMIN` (403 Admin แก้แอดมินคนอื่นไม่ได้)

**10.4** `{ "reason": "..." }` → `status = banned`, ยกเลิกทุก session, เพิ่ม blacklists (id_card_hash + phone), `penalties(admin_ban)`, `audit.log(USER_BAN)` → `{ id, status: "banned", blacklistId }`

**10.5** → `{ blacklistId, revokedAt }` (ไม่คืนสถานะบัญชีอัตโนมัติ ใช้ 10.3)

**Service (QA):** `penalty.add(userId, type, { orderId, note })` ใน transaction: INSERT penalties → นับครั้งของ type เดียวกัน → ครั้งที่ 2 ขึ้นไป: `non_payment` → `suspended` จนถึง `now + time.suspendMs`, `no_shipment` → `restricted` จนถึง `now + time.suspendMs` → แจ้งผู้ใช้

**Scheduler (QA):** `restoreStatus` คืน `restricted`/`suspended` ที่ `status_until <= now` เป็น `active` · `detectShill` (หรือทำตอนบิด) บันทึก `suspicious_flags` เมื่อผู้บิดใช้ IP เดียวกับ session ของผู้ขาย หรือบิดร้านเดิม ≥ 5 รายการใน 7 วัน

**สิทธิ์ Admin vs Super Admin (ข้อ 8.1):** Admin ห้าม: แก้/แบนผู้ใช้ที่เป็น admin หรือ super_admin, ปลดแบน, แก้ยอด Wallet (ไม่มี API นี้ในระบบ), ตั้งค่าระบบ, ดู Audit Log ของแอดมินคนอื่น (ดูได้เฉพาะของตัวเอง)

---

## 11. แจ้งเตือน Dashboard Audit Log ตั้งค่าระบบ (เจ้าของ: PM) — ข้อ 7 (แจ้งเตือน), 8.2-1, 8.2-6, 8.1

| # | Method | Path | สิทธิ์ | ทำอะไร |
| --- | --- | --- | --- | --- |
| 11.1 | GET | `/api/notifications` | login | รายการแจ้งเตือน (`?unread=true`) |
| 11.2 | GET | `/api/notifications/unread-count` | login | จำนวนที่ยังไม่อ่าน |
| 11.3 | POST | `/api/notifications/:id/read` | login | อ่านแล้ว |
| 11.4 | POST | `/api/notifications/read-all` | login | อ่านทั้งหมด |
| 11.5 | GET | `/api/admin/dashboard` | admin | สถิติภาพรวม |
| 11.6 | GET | `/api/admin/dashboard/charts` | admin | ข้อมูลกราฟ (`?range=7d|30d&group=day|week`) |
| 11.7 | GET | `/api/admin/audit-logs` | admin | Audit Log (`?adminId=&action=&from=&to=`) |
| 11.8 | GET | `/api/admin/settings` | super_admin | ดูตั้งค่าระบบ |
| 11.9 | PUT | `/api/admin/settings` | super_admin | แก้ตั้งค่าระบบ |

**11.1** → `{ items: [{ id, event, title, message, linkUrl, isRead, createdAt }], page, limit, total, unreadCount }`

**Event ทั้งหมด** (ตรงกับ `services/notify.js`, กลุ่มใช้กับ notification_settings)

| event | กลุ่ม | ผู้รับ | ช่องทาง |
| --- | --- | --- | --- |
| `ACCOUNT_VERIFY` | - | ผู้สมัคร | อีเมลเท่านั้น (ไม่ปิดได้) |
| `LISTING_APPROVED`, `LISTING_REJECTED` | auction | ผู้ขาย | เว็บ + อีเมล |
| `OUTBID`, `AUCTION_EXTENDED`, `AUCTION_ENDING_SOON` | auction | ผู้บิด / Watchlist | เว็บ + อีเมล |
| `AUCTION_WON`, `AUCTION_LOST` | auction | ผู้ชนะ / ผู้แพ้ / ผู้ขาย | เว็บ + อีเมล |
| `PAYMENT_DUE_SOON`, `PAYMENT_SUCCESS`, `FUNDS_RELEASED`, `REFUNDED` | finance | ผู้ซื้อ / ผู้ขาย | เว็บ + อีเมล |
| `SHIPPED` | shipping | ผู้ซื้อ | เว็บ + อีเมล |
| `DISPUTE_OPENED` | shipping | ผู้ขาย, แอดมิน | เว็บ + อีเมล |

**11.5** → `{ users: { total, newToday, pendingVerification }, listings: { active, pendingReview }, orders: { pendingPayment, paymentReview, awaitingShipment, shipped }, money: { escrowHeld, feesCollected, gmvToday }, disputes: { open } }`

**11.6** → `{ labels: ["2026-11-01", ...], completedAuctions: [3, 5, ...], gmv: [12000.00, ...] }`

**11.7** → `{ items: [{ id, admin: { id, displayName }, action, targetType, targetId, detail, ipAddress, createdAt }], page, limit, total }` (Admin เห็นเฉพาะของตัวเอง)

**11.8 / 11.9** `{ "settings": { "platform_fee_percent": "5", "platform_fee_min": "20", ... } }` → ค่าใหม่ทั้งหมด + `audit.log(SETTING_UPDATE)` · Errors: `INVALID_SETTING` (400)

**รายการ action ของ `audit.log()`:** `LISTING_APPROVE`, `LISTING_REJECT`, `PAYMENT_APPROVE`, `PAYMENT_REJECT`, `DISPUTE_STATUS`, `DISPUTE_RESOLVE`, `USER_STATUS`, `USER_BAN`, `BLACKLIST_REVOKE`, `FLAG_REVIEW`, `SETTING_UPDATE`

---

## 12. Real-time (Socket.IO) — D-02, QA API-14

เชื่อมต่อ: `const socket = io({ auth: { token } })` (Guest ไม่ต้องส่ง token) server ตรวจ token แล้ว join ห้อง `user:<id>` อัตโนมัติ

| ทิศทาง | event | payload | ใคร |
| --- | --- | --- | --- |
| server → client | `server:time` | `{ now }` (ms) | ส่งทันทีที่เชื่อมต่อ ใช้ชดเชยนาฬิกา client |
| client → server | `listing:join` / `listing:leave` | `listingId` | หน้ารายละเอียดสินค้า |
| server → `listing:<id>` | `bid:new` | `{ listingId, currentPrice, minNextBid, bidCount, bidder: "b***1", amount, bidType, endAt, serverTime }` | ทุกคนในห้อง (ห้ามส่ง user id ของผู้บิด) |
| server → `user:<id>` | `bid:leader` | `{ listingId, isLeading, currentPrice }` | ส่งให้ผู้นำคนใหม่ (`true`) และผู้นำคนก่อน (`false`) ทุกครั้งที่ผู้นำเปลี่ยน รวมกรณี Proxy บิดแทน |
| server → `listing:<id>` | `auction:extended` | `{ listingId, endAt, extendCount }` | ทุกคนในห้อง |
| server → `listing:<id>` | `auction:closed` | `{ listingId, result, finalPrice, winnerId }` | ทุกคนในห้อง |
| server → `user:<id>` | `notification:new` | `{ id, event, title, message, linkUrl, createdAt }` | เจ้าของแจ้งเตือน |

ฟังก์ชันฝั่ง server: `emitToListing(listingId, event, payload)`, `emitToUser(userId, event, payload)` (`backend/src/socket/index.js`)
