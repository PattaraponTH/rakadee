# เอกสาร QA (เจ้าของ: QA)

| ไฟล์ | เนื้อหา | สถานะ |
| --- | --- | --- |
| `test-plan-and-test-cases.pdf` | Test Plan + Test Case 104 เคส (11 โมดูล) | ใช้ได้ ต้องปรับบางเคสตามรายการด้านล่าง |
| `review-erd-api-spec.pdf` | รายงาน Review ERD และ API Spec ฉบับแรกของ SA (52 ข้อสังเกต) | ปิดครบแล้วใน `docs/erd/schema.sql`, `docs/api-spec/api-spec.md` และ D-07 ถึง D-12 |

## Test Case ที่ต้องปรับให้ตรงกับ ERD / API Spec ฉบับใหม่

| Test Case | เหตุผล | ปรับเป็น |
| --- | --- | --- |
| TC-16, TC-17 | ทดสอบ KYC ซึ่งตัดออกแล้ว (D-07, D-09) | เปลี่ยนเป็นทดสอบเข้ารหัสเลขบัตรตอนสมัคร (API ส่งแค่ `idCardLast4`) และยืนยันอีเมลด้วยลิงก์ (API 1.8) |
| TC-21 | เปิดร้านต้องผ่าน KYC และกรอกบัญชีธนาคาร | ยื่นเปิดร้าน (API 3.1) ต้องยืนยันอีเมล + มีที่อยู่ → `pending` → แอดมินอนุมัติจึงได้ role seller (D-18) ทดสอบ `EMAIL_NOT_VERIFIED`, `ADDRESS_REQUIRED`, `APPLICATION_PENDING`, `ALREADY_SELLER` |
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

## อัพเดทงาน

#### ไฟล์ที่สร้างใหม่
| ไฟล์ | หน้าที่ |
|---|---|
| `frontend/pages/seller/open-shop.html` + `js/seller/open-shop.js` | ฟอร์มเปิดร้าน (3.1); redirect ถ้าเป็น seller แล้ว |
| `frontend/pages/seller/listings.html` + `js/seller/listings.js` | "สินค้าของฉัน" แท็บ 6 สถานะ, cancel in-line (4.9/4.8) |
| `frontend/pages/seller/listing-form.html` + `js/seller/listing-form.js` | ฟอร์มลงสินค้าแบบ single-page 4 ส่วน, upload รูป, preview, validate ครบ 3.3, save draft/submit/cancel (4.2–4.8) |
| `frontend/pages/admin/listings.html` + `js/admin/listings.js` | ตารางรออนุมัติ + แท็บสถานะ + ค้นหา (4.10) |
| `frontend/pages/admin/listing-detail.html` + `js/admin/listing-detail.js` | รายละเอียดเต็ม + approve + reject modal (4.11–4.13) |
| `frontend/css/admin.css` | สไตล์โครงหน้า Admin |
| `frontend/js/admin/admin-shell.js` | สร้างโครงหน้า Admin ให้ทุกหน้า admin (ใช้แทน `layout.js` ที่ยังไม่ได้ตกแต่ง สามารถแทนได้ถ้าทำมาเพิ่มแล้ว) |
| `backend/src/services/seller.service.js` | openShop, getMyProfile, updateMyProfile, getPublicProfile |
| `backend/src/services/listing.service.js` | getCategories, createListing, updateListing, addImages, deleteImage, setCover, submitListing, cancelListing, getMyListings + serializeListingDetail (ListingDetail ของ QA) |
| `backend/src/services/admin.listing.service.js` | adminListListings, adminGetListing, approveListing, rejectListing |
| `backend/src/controllers/seller.controller.js` | controller 3.1–3.4 |
| `backend/src/controllers/listing.controller.js` | controller 4.1–4.9 |
| `backend/src/controllers/admin.listing.controller.js` | controller 4.10–4.13 |
| `backend/src/routes/seller.routes.js` | mount seller profile + 4.9 |
| `backend/src/routes/listing.routes.js` | mount 4.2–4.8 |
| `backend/src/routes/admin.listing.routes.js` | mount 4.10–4.13 |
| `backend/src/utils/parseId.js` | guard URL param ให้เป็น integer บวก → 400 ถ้าว่างหรือไม่ใช่เลข |

#### Endpoint ที่ทำแล้ว
| # | Method | Path | สถานะ |
|---|---|---|---|
| 3.1 | POST | `/api/seller/profile` | ✅ |
| 3.2 | GET | `/api/seller/profile` | ✅ |
| 3.3 | PUT | `/api/seller/profile` | ✅ |
| 3.4 | GET | `/api/sellers/:userId` | ✅ |
| 4.1 | GET | `/api/categories` | ✅ |
| 4.2 | POST | `/api/listings` | ✅ |
| 4.3 | PUT | `/api/listings/:id` | ✅ |
| 4.4 | POST | `/api/listings/:id/images` | ✅ |
| 4.5 | DELETE | `/api/listings/:id/images/:imageId` | ✅ |
| 4.6 | POST | `/api/listings/:id/images/:imageId/cover` | ✅ |
| 4.7 | POST | `/api/listings/:id/submit` | ✅ |
| 4.8 | POST | `/api/listings/:id/cancel` | ✅ |
| 4.9 | GET | `/api/seller/listings` | ✅ |
| 4.10 | GET | `/api/admin/listings` | ✅ |
| 4.11 | GET | `/api/admin/listings/:id` | ✅ |
| 4.12 | POST | `/api/admin/listings/:id/approve` | ✅ |
| 4.13 | POST | `/api/admin/listings/:id/reject` | ✅ |

## FE
เปิดร้าน: `/pages/seller/open-shop.html` (ใช้ token buyer)
ลงสินค้า: `/pages/seller/listing-form.html` (ใช้ token seller)
สินค้าของฉัน: `/pages/seller/listings.html` (ใช้ token seller)
Admin ตรวจสอบ: `/pages/admin/listings.html` (ใช้ token admin)
Admin รายละเอียด: `/pages/admin/listing-detail.html` (ใช้ token admin)

## งานต่อไปที่ต้องทำ Phase 2
งาน QA
Dispute (ข้อ 6.2-2, 6.4, 7, 8.2-4, API 9)
-ฟอร์มเปิดข้อพิพาท: ประเภทปัญหา รายละเอียด หลักฐาน (หลายรูป) ช่องทางติดต่อ เปิดได้เฉพาะก่อนเงิน
ถูกปล่อย
-เปิดแล้วล็อก Escrow (autoRelease ต้องข้าม) และ Order เป็น "อยู่ระหว่างตรวจสอบข้อพิพาท"
-หน้าผู้ขายส่งหลักฐานฝั่งตัวเอง
-สถานะข้อพิพาท 6 ค่าตามข้อ 1.7-7
-Admin: ตารางข้อพิพาท, หน้ารายละเอียด (ไทม์ไลน์ Order, หลักฐานสองฝั่ง), ปุ่มตัดสินคืนเงินผู้ซื้อ
(escrow. refund() + ยกเลิก Order) หรือปล่อยเงินผู้ขาย (escrow.release())

บทลงโทษ (ข้อ 7.1-7.3 และ D-03 , API 10)
-penalty.add(userId, type) บันทึกแต้ม และเปลี่ยนสถานะ: ไม่จ่ายครั้งที่ 2 เป็น suspended 7
วัน,ไม่ส่งของซ้ำเป็น restricted
-Scheduler restoreStatus : ครบกำหนดแล้วคืนเป็น active
-Shill detection: flag เมื่อผู้บิดใช้ IP หรืออุปกรณ์เดียวกับผู้ขาย หรือบิดร้านเดิมซ้ำผิดปกติ แสดงในหน้า
แอดมิน

จัดการผู้ใช้ (ข้อ 8.2-5,8.1 , API 10)
-ตารางสมาชิก: ค้นหาชื่อ อีเมล เบอร์, กรองสถานะ
-หน้าโปรไฟล์ในมุมแอดมิน: ประวัติประมูล ประวัติขาย ยอด Wallet ประวัติความผิด ประวัติธุรกรรม
-เปลี่ยนสถานะบัญชี, แบนพร้อมเพิ่มเลขบัตร (hash) และเบอร์เข้า blacklists
-สิทธิ์: Admin ห้ามลบข้อมูลสำคัญ ห้ามแก้ยอด Wallet ห้ามจัดการแอดมินคนอื่น ส่วน Super Admin
ทำได้ทั้งหมด

งานเพิ่ม
-เปิดร้านแบบใหม่: ยื่นแล้วเป็น pending ไม่ตั้ง role seller
ทันที, ตรวจอีเมลยืนยันแล้ว + ที่อยู่, หน้า "รออนุมัติ / ไม่ผ่าน
เพราะ ... " (D-18, API 3.1-3.4)
-หน้าแอดมินตรวจร้าน: รายการคำขอ, รายละเอียดผู้สมัคร, ปุ่ม
อนุมัติ / ไม่อนุมัติ (บังคับเหตุผล) + notify + audit.log (D-18, API 3.5-3.8)
-เมนูแอดมิน: เปลี่ยนไอคอนหัวใจเป็นกระดึ่งพร้อมคำว่า "แจ้ง
เตือน", เพิ่มเมนู "ตรวจร้านค้า" (คำแนะนำข้อ 2)

คําแนะนําแต่ละข้อ
-2.ปุ่มหัวใจในหน้าแอดมินไม่ชัด (จริงๆ คือ
ปุ่มแจ้งเตือน)
-3.จัดการผู้ใช้ บล็อก / แบนบัญชี
-3.ผู้ขายต้องตรวจความน่าเชื่อถือ บัญชี ที่
อยู่


## อัพเดทงาน Phase 2

งาน QA Phase 2 (ข้อพิพาท, บทลงโทษ, จัดการผู้ใช้, เปิดร้านแบบใหม่ D-18) ทั้ง BE และ FE รวมเข้ากับงานของเพื่อน PR #11–#17 แล้ว
อ้างอิง D-03, D-08, D-18 และ api-spec หัวข้อ 3, 9, 10

#### ไฟล์ที่สร้างใหม่
| ไฟล์ | หน้าที่ |
|---|---|
| `backend/src/routes/admin.seller.routes.js` | mount แอดมินตรวจร้าน 3.5–3.8 |
| `backend/src/services/dispute.service.js` | ข้อพิพาท 9.1–9.6 + `listMine` (ข้อพิพาทของฉัน) |
| `backend/src/services/dispute.js` | Interface `dispute.isOpen(orderId)` ให้ SA (escrow) / PM (autoRelease) เรียก |
| `backend/src/controllers/dispute.controller.js` | controller 9.1–9.6 + ข้อพิพาทของฉัน |
| `backend/src/routes/dispute.routes.js` | mount 9.1–9.3 + `GET /api/disputes` (อัปโหลดหลักฐาน ≤ 5 รูป) |
| `backend/src/services/penalty.js` | Interface `penalty.add(userId, type, { orderId, note })` บันทึกความผิด + เปลี่ยนสถานะ (ไม่ลดระดับสถานะเดิม) |
| `backend/src/services/admin.user.service.js` | จัดการผู้ใช้ + แบน/ปลดแบน + บิดน่าสงสัย 10.1–10.7 |
| `backend/src/controllers/admin.user.controller.js` | controller 9.4–9.6, 10.1–10.7 |
| `backend/src/routes/admin.qa.routes.js` | mount 9.4–9.6, 10.1–10.7 (10.5 เฉพาะ super_admin) |
| `backend/src/jobs/restoreStatus.js` | Scheduler คืน restricted/suspended ที่ครบกำหนดเป็น active (ทุก 1 นาที) |
| `backend/src/jobs/detectShill.js` | Scheduler บันทึก suspicious_flags: IP เดียวกับผู้ขาย, บิดร้านเดิม ≥ 5 รายการใน 7 วัน (ไม่สร้างซ้ำ) |
| `frontend/css/qa.css` | สไตล์ร่วมของ QA: ป้ายสถานะ, stepper, รูปหลักฐาน, ไทม์ไลน์, modal, ตาราง, wizard (ใช้ตัวแปรสีจาก `main.css`) |
| `frontend/js/qa-common.js` | ตัวช่วยร่วม: `qa.el()` ใส่ข้อความด้วย textContent, ป้ายสถานะภาษาไทย, modal, เลือกไฟล์ + preview, แบ่งหน้า, `qa.requireAdmin()` |
| `frontend/js/seller/seller-nav.js` | sidebar ผู้ขาย: แดชบอร์ด, สินค้าของฉัน, ลงสินค้าใหม่, รอจัดส่ง (PM), การเงินผู้ขาย (SA), ข้อพิพาท |
| `frontend/pages/seller/dashboard.html` + `js/seller/dashboard.js` | แดชบอร์ดผู้ขาย (ภาพ 28) ดึง 4.9, 8.3, 7.1, 7.3 |
| `frontend/pages/seller/listing-preview.html` + `js/seller/listing-preview.js` | ตัวอย่างสินค้าก่อนส่งตรวจ (ภาพ 34) |
| `frontend/pages/seller/disputes.html` + `js/seller/disputes.js` | รายการข้อพิพาทฝั่งผู้ขาย แท็บ กำลังดำเนินการ / สิ้นสุด / ทั้งหมด |
| `frontend/pages/dispute-open.html` + `js/dispute-open.js` | ผู้ซื้อเปิดข้อพิพาท (ภาพ 21) เช็กสิทธิ์จาก 8.2 ก่อนกรอก |
| `frontend/pages/disputes.html` + `js/disputes.js` | ติดตามข้อพิพาท มุมผู้ซื้อ (ภาพ 22) / มุมผู้ขาย (ภาพ 38) + ส่งหลักฐานเพิ่ม |
| `frontend/pages/admin/seller-applications.html` + `js/admin/seller-applications.js` | แอดมินรายการคำขอเปิดร้าน (3.5) |
| `frontend/pages/admin/seller-application.html` + `js/admin/seller-application.js` | รายละเอียดผู้สมัคร + อนุมัติ / ไม่อนุมัติ บังคับเหตุผล (3.6–3.8) |
| `frontend/pages/admin/disputes.html` + `js/admin/disputes.js` | แอดมินรายการข้อพิพาท แท็บ กำลังดำเนินการ / สิ้นสุด / ทั้งหมด (9.4) |
| `frontend/pages/admin/dispute-detail.html` + `js/admin/dispute-detail.js` | แอดมินจัดการข้อพิพาท: ไทม์ไลน์ Order, หลักฐานสองฝั่ง, เปลี่ยนสถานะ, modal ตัดสิน (ภาพ A5) |
| `frontend/pages/admin/users.html` + `js/admin/users.js` | จัดการผู้ใช้ (ภาพ A6): ตาราง + แผงโปรไฟล์ + ระงับ/แบน/คืนสถานะ/ปลดแบน + แท็บ "บิดน่าสงสัย" (10.1–10.7) |
| `frontend/pages/admin/suspicious-flags.html` | หน้าส่งต่อไป `users.html?tab=flags` |
| `frontend/pages/admin/sellers.html` | หน้าส่งต่อไป `seller-applications.html` (การ์ด "ร้านค้ารออนุมัติ" ในแดชบอร์ด PM ลิงก์มาที่นี่) |

#### Endpoint ที่ทำแล้ว
| # | Method | Path | สถานะ |
|---|---|---|---|
| 3.1 | POST | `/api/seller/profile` | ✅ แก้ตาม D-18: ยื่นแล้วเป็น `pending` role ยังไม่เปลี่ยน, ต้องยืนยันอีเมล + มีที่อยู่, ยื่นใหม่ได้หลังถูกปฏิเสธ |
| 3.2 | GET | `/api/seller/profile` | ✅ แก้: สิทธิ์ `member`, ตอบ `null` ถ้ายังไม่เคยยื่น |
| 3.3 | PUT | `/api/seller/profile` | ✅ แก้: เฉพาะร้าน `approved` |
| 3.4 | GET | `/api/sellers/:userId` | ✅ แก้: เฉพาะร้าน `approved` |
| 3.5 | GET | `/api/admin/seller-applications` | ✅ |
| 3.6 | GET | `/api/admin/seller-applications/:userId` | ✅ |
| 3.7 | POST | `/api/admin/seller-applications/:userId/approve` | ✅ notify + audit.log (บัญชีที่ถูกแบนอนุมัติไม่ได้) |
| 3.8 | POST | `/api/admin/seller-applications/:userId/reject` | ✅ บังคับเหตุผล + notify + audit.log |
| 9.1 | POST | `/api/orders/:id/disputes` | ✅ |
| 9.2 | GET | `/api/disputes/:id` | ✅ |
| 9.3 | POST | `/api/disputes/:id/evidence` | ✅ |
| 9.x | GET | `/api/disputes?role=&status=` | ✅ ⚠ เพิ่มจาก spec (ข้อพิพาทของฉัน) รอ SA เพิ่มใน api-spec |
| 9.4 | GET | `/api/admin/disputes` | ✅ (+ `status=active` เพิ่มจาก spec) |
| 9.5 | PATCH | `/api/admin/disputes/:id/status` | ✅ (ยังไม่แจ้งเตือน รอ event จาก SA/PM) |
| 9.6 | POST | `/api/admin/disputes/:id/resolve` | ✅ refund_buyer / release_seller |
| 10.1 | GET | `/api/admin/users` | ✅ (+ `fullName`, `idCardLast4`) |
| 10.2 | GET | `/api/admin/users/:id` | ✅ |
| 10.3 | POST | `/api/admin/users/:id/status` | ✅ |
| 10.4 | POST | `/api/admin/users/:id/ban` | ✅ |
| 10.5 | POST | `/api/admin/blacklists/:id/revoke` | ✅ super_admin เท่านั้น |
| 10.6 | GET | `/api/admin/suspicious-flags` | ✅ |
| 10.7 | POST | `/api/admin/suspicious-flags/:id/review` | ✅ |

| Interface / Scheduler | สถานะ | ใครเรียก |
|---|---|---|
| `penalty.add(userId, type, { orderId, note })` | ✅ | SA `paymentTimeout` (`non_payment`), PM 8.6 ยกเลิก Order (`no_shipment`), QA 10.4 (`admin_ban`) |
| `dispute.isOpen(orderId)` | ✅ | PM `autoRelease`, ยืนยันรับสินค้า, บันทึกจัดส่ง |
| Scheduler `restoreStatus` | ✅ | ทุก 1 นาที |
| Scheduler `detectShill` | ✅ `same_ip`, `repeated_seller` (ยังไม่มี `same_device`) | ทุก 1 นาที |

## ไฟล์ที่แก้

ไฟล์ของ QA:
| ไฟล์ | แก้อะไร |
|---|---|
| `backend/src/services/seller.service.js` | เปิดร้านตาม D-18 + แอดมินตรวจร้าน 3.5–3.8 |
| `backend/src/controllers/seller.controller.js` | เพิ่ม controller 3.5–3.8 |
| `backend/src/routes/seller.routes.js` | 3.2 เปลี่ยนสิทธิ์จาก `seller` เป็น `member` |
| `backend/src/services/listing.service.js` | `defectDetail` บังคับทั้ง `used_good` และ `defective` และบันทึกได้ถูกต้อง · 4.9 เพิ่ม `durationDays` · ListingDetail เพิ่ม `maxExtendCount`, `me` (`buildMe()`) ตาม spec |
| `backend/src/services/admin.listing.service.js`, `controllers/admin.listing.controller.js` | 4.11 ส่ง `me` ของแอดมิน |
| `frontend/pages/seller/open-shop.html` + `js/seller/open-shop.js` | ทำใหม่ตาม D-18: เลือกที่อยู่, เช็กอีเมลยืนยัน, หน้า "รออนุมัติ / ไม่ผ่านเพราะ..." |
| `frontend/pages/seller/listings.html` + `js/seller/listings.js` | ตารางตามภาพ 29 + แท็บ + แถบเหตุผลที่ไม่อนุมัติ |
| `frontend/pages/seller/listing-form.html` + `js/seller/listing-form.js` | wizard 4 ขั้นตามภาพ 30–33, ช่องตำหนิบังคับสำหรับมือสอง, สวิตช์ซื้อทันที, ตัวอย่างรายได้ (ระบุว่าใช้ค่าธรรมเนียมเริ่มต้น) |
| `frontend/pages/admin/listings.html` + `js/admin/listings.js` | รายการ + แผงรายละเอียดด้านขวา (ภาพ A2), modal ปฏิเสธพร้อมเหตุผลด่วน, กล่องยืนยันอนุมัติ |
| `frontend/js/admin/admin-shell.js` + `css/admin.css` | โครงหน้าแอดมินตามภาพ: sidebar "R Admin", กระดิ่ง "แจ้งเตือน" แทนหัวใจ (คำแนะนำข้อ 2), เมนู "ตรวจร้านค้า", "ข้อพิพาท", "ผู้ใช้" + เมนู คำสั่งซื้อ (PM), การเงิน (SA), ตั้งค่าระบบ (PM, เฉพาะ Super Admin) · คลิกอีเมลมุมขวาบนเปิดเมนู การแจ้งเตือน / ตั้งค่า / ออกจากระบบ (เอา "กลับหน้าเว็บ" และปุ่มออกจากระบบใน sidebar ออก) |
| `frontend/pages/disputes.html` | ลิงก์ `?orderId=` จากหน้าคำสั่งซื้อของ PM ส่งต่อไปฟอร์มเปิดข้อพิพาท |
| `frontend/js/admin/` listings, disputes, dispute-detail, seller-applications, seller-application, users | ใช้ `qa.requireAdmin()`: ไม่ login → หน้า login, ไม่ใช่แอดมิน → หน้าแรก |
| `frontend/js/seller/*.js`, `js/disputes.js`, `js/dispute-open.js` | ส่ง `?next=` ตอนพาไปหน้า login (เหมือนหน้า PM) |
| `backend/src/routes/index.js` (ไฟล์กลาง) | เพิ่ม 3 บรรทัด mount router ใหม่ของ QA |

แก้ไฟล์ของโมดูลอื่น 
| ไฟล์ | เจ้าของ | แก้อะไร |
|---|---|---|
| `backend/src/services/user.service.js` บรรทัด 18, 255 | PM | `isSeller` นับจาก `u.role = 'seller'` แทนการมีแถว seller_profiles (ร้าน pending/rejected เคยได้ `isSeller: true` ผิด D-18) |
| `frontend/js/layout.js` | PM | ลิงก์ "ผู้ขาย" ใน navbar ไปแดชบอร์ดผู้ขาย ตามหมายเหตุในภาพ |

`auth.js` (SA) แก้ `isSeller` เองแล้วใน PR #13 · ไม่ได้แก้ schema, api-spec และไม่ได้เพิ่ม npm package

## ปัญหาที่เจอ

ปัญหาที่เจอและแก้แล้ว:
| ปัญหา | สาเหตุ | แก้ |
|---|---|---|
| ยื่นเปิดร้านแล้วเมนูผู้ขายขึ้นทันที ทั้งที่แอดมินยังไม่อนุมัติ | `isSeller` (PM/SA) นับจากการมีแถว seller_profiles | เช็ก `role = 'seller'` |
| แอดมินอนุมัติร้านของบัญชีที่ถูกแบน แล้วบัญชีนั้นกลายเป็นผู้ขาย | 3.7 ไม่ได้เช็กสถานะบัญชี | BE ตอบ `INVALID_STATE` + ซ่อนปุ่มที่ FE |
| รายละเอียดตำหนิกดบันทึกร่างแล้วไม่ลง DB และหายเมื่อกลับมาแก้ | FE/BE เก็บ `defectDetail` เฉพาะ `defective` | เก็บเมื่อสภาพไม่ใช่ `new` และบังคับกรอกสำหรับมือสอง |
| ListingDetail ของ 4.2/4.3/4.11 ขาด `maxExtendCount`, `me` | ไม่ตรง spec (เจอจาก contract test) | เพิ่ม `buildMe()` |
| จอมือถือ หน้าแอดมิน "สินค้า" ล้น 165px, "ผู้ใช้" ล้น 259px | grid บนมือถือใช้ `1fr` | `qa.css` ใช้ `minmax(0, 1fr)` |
| เปิดหน้าแจ้งปัญหาของ Order ที่มีข้อพิพาทอยู่แล้ว ยังเห็นฟอร์มเต็ม กรอกเสร็จถึงรู้ว่าส่งไม่ได้ | ไม่ได้เช็กก่อน (ตอนทำยังไม่มี 8.2) | `dispute-open.js` เช็ก `dispute`, `canOpenDispute`, `viewerRole` จาก 8.2 แล้วซ่อนฟอร์ม |
| สมาชิกที่ login แล้วเปิดหน้าแอดมิน ถูกส่งไปหน้า login | guard รวมกรณีไม่ login กับไม่ใช่แอดมิน | `qa.requireAdmin()` |
| ลิงก์ของ PM ชี้หน้า QA ผิด: `disputes.html?orderId=`, `admin/sellers.html` | ตั้งชื่อหน้าไม่ตรงกัน | ทำหน้าส่งต่อฝั่ง QA (ไม่ต้องแก้ไฟล์ PM) |
| รูปยาวในแผงอนุมัติเห็นไม่ครบ, ตัวนับ "รอตรวจสอบ" ค้าง, ตารางข้อพิพาทผู้ขายตัดบรรทัด | CSS / โหลดข้อมูลไม่ครบ | `object-fit: contain`, nowrap, โหลดตัวนับใหม่ทุกครั้ง |

ปัญหาที่ยังค้าง (รอคนอื่น):
| ปัญหา | ต้องการจาก |
|---|---|
| ยังไม่แจ้งเตือนตอนแอดมินเปลี่ยนสถานะข้อพิพาท และตอนโดนลงโทษ / ถูกเปลี่ยนสถานะบัญชี (ไม่มี event ใน api-spec หัวข้อ 11) · ตอนตัดสินมีแจ้งเตือนเรื่องเงิน `REFUNDED` / `FUNDS_RELEASED` จาก escrow อยู่แล้ว แต่ไม่บอกผลข้อพิพาท | SA (api-spec) + PM (`notificationTemplates.js`) |
| รูปหลักฐานข้อพิพาทเปิดดูไม่ได้ (404) ไฟล์ต้องเปิดผ่าน API ที่ตรวจสิทธิ์ (แบบสลิป 7.7b / หลักฐานส่ง 8.8) แต่ยังไม่มี API นี้ใน spec | SA (api-spec) แล้ว QA ทำ endpoint |
| ระยะเวลา 7 วันของ detectShill ยังเป็นค่าสำรองในโค้ด | PM เพิ่ม `shillWindowMs` ใน `config/time.js` |
| ตัวอย่างรายได้ในหน้าลงสินค้าใช้ค่าธรรมเนียมเริ่มต้น 5% / 20 บาท เพราะ API ตั้งค่าระบบ (11.8) เปิดให้ Super Admin เท่านั้น | PM (API ให้ผู้ขายอ่านค่าธรรมเนียม) |
| `same_device` ตรวจไม่ได้ (ไม่มีข้อมูลอุปกรณ์ใน schema) | SA (schema) |
| ฟิลด์ `note` ของ 9.5 ไม่มีคอลัมน์ (เก็บใน audit log แทน) | SA (schema) |
| `paymentTimeout` เรียก `penalty.add` โดยไม่เช็กว่า UPDATE ยกเลิก Order สำเร็จ (ถ้า job ทำงานซ้อนกันอาจลงโทษซ้ำ โอกาสต่ำ) | SA |
| หน้าคำสั่งซื้อ (`order-view.js`) และแดชบอร์ดแอดมินลิงก์ไป `disputes.html?orderId=` / `admin/sellers.html` (ใช้ได้เพราะ QA ทำหน้าส่งต่อแล้ว) | PM แก้ลิงก์ให้ตรงหน้าจริงเมื่อสะดวก |
| comment `schema.sql:149` ยังเขียนว่าเปิดร้านแล้วได้ role seller ทันที (ก่อน D-18) | SA |

ฝากปรับ (ข้อแนะนำจาก QA ถ้าเจ้าของอยากใช้แบบเดิมก็บอกได้ QA จะปรับลิงก์ฝั่งตัวเองตาม):
| เรื่อง | ตอนนี้ | แนะนำ | เจ้าของ | QA ต้องทำอะไรต่อ |
|---|---|---|---|---|
| หน้าการแจ้งเตือน / ตั้งค่าของแอดมิน | แอดมินกด "การแจ้งเตือน" / "ตั้งค่า" (เมนูอีเมลมุมขวาบน) หรือปุ่มกระดิ่ง แล้วหลุดไปหน้าเว็บหลักที่มี navbar ผู้ซื้อ | เมื่อ role เป็น admin / super_admin ให้ `notifications.html`, `settings.html` ใช้โครง `admin-page` + `admin-shell.js` แทน navbar (ดูตัวอย่าง `admin/orders.html`) · การซ่อนแท็บที่แอดมินไม่ใช้ (ที่อยู่จัดส่ง, ตั้งค่าแจ้งเตือน) PM ทำไว้แล้ว | PM | ไม่ต้อง (ลิงก์ชี้หน้าเดิมอยู่แล้ว) |
| login แล้วพาไปหน้าไหน | ทุกคนไปหน้าแรก (`login.html` บรรทัด 173–176) และไม่อ่าน `?next=` | admin / super_admin → `/pages/admin/dashboard.html` · คนอื่น → `?next=` ถ้ามี (รับเฉพาะ path ภายในเว็บ ขึ้นต้น `/` แต่ไม่ใช่ `//`) ไม่มีไปหน้าแรก · `pending_verification` ยังไปหน้า OTP | SA | ไม่ต้อง (หน้า QA ส่ง `?next=` แล้ว) |
| เมนู "รอจัดส่ง" ใน sidebar ผู้ขาย | `seller/shipments.html` ใช้ sidebar สมาชิก (`account-nav`) กดแล้วเมนูด้านซ้ายเปลี่ยนเป็น การประมูลของฉัน / Watchlist / ... | ใช้ sidebar ผู้ขายแทน: `<aside class="account-nav" id="seller-nav">` + โหลด `/js/seller/seller-nav.js` แทน `account-nav.js` (แก้ 2 บรรทัด เมนู "รอจัดส่ง" จะ active เอง) | PM | ไม่ต้อง |
| เมนู "การเงินผู้ขาย" ใน sidebar ผู้ขาย (ข้อแนะนำเรื่องหน้าตา) | ลิงก์ไป `wallet.html` ซึ่งถูกตาม D-09 ("ผู้ขายดูยอดรายได้ใน Wallet") แต่หน้านั้นไม่มีเมนูผู้ขาย กดแล้วเหมือนหลุดออกจากส่วนผู้ขาย | ถ้าสะดวก ให้ `wallet.html` แสดง sidebar ผู้ขาย (`seller-nav.js`) เมื่อเป็นผู้ขาย หรือทำหน้า `seller/earnings.html` ตามภาพ UI 37 (ยอดรอรับ 7.1 + รายได้ 7.3) โดยไม่ใส่ปุ่ม "ถอนเข้า Mock Wallet" เพราะขัด D-09 | SA | ถ้าทำหน้าใหม่: เปลี่ยนลิงก์ใน `seller-nav.js` 1 บรรทัด |
| navbar ตัดบรรทัด | ผู้ขายมีลิงก์ "ผู้ขาย" เพิ่ม ทำให้เมนูบน navbar ตกไปบรรทัดที่สองบนจอกว้าง ~1900px | ให้เมนู navbar ไม่ตัดบรรทัด (`white-space: nowrap` / ลดช่องไฟ) | PM (`layout.js`, `main.css`) | ไม่ต้อง |

สิ่งที่เพิ่มหรือทำต่างจาก api-spec (ต้องให้ SA เขียนลง api-spec):
| เรื่อง | ที่ไหน | เหตุผล |
|---|---|---|
| API ใหม่ `GET /api/disputes?role=seller\|buyer&status=active\|closed\|<สถานะ>` (member) → `{ items: [{ id, orderId, listingTitle, coverUrl, type, status, resolution, totalAmount, myRole, counterparty, sellerEvidenceCount, openedAt, updatedAt }], page, limit, total }` | `dispute.service.js` `listMine()` | เมนู "ข้อพิพาท" ใน sidebar ผู้ขาย (ภาพ 28–38) ต้องมีหน้ารายการ (spec เข้าข้อพิพาทผ่าน 8.2 ได้อยู่แล้ว ถ้า SA ไม่รับ ตัดออกได้) |
| `status=active` ใน 9.4 | `dispute.service.js` `adminList()` | แท็บ "กำลังดำเนินการ" ในหน้าแอดมิน |
| `durationDays` ใน 4.9 | `listing.service.js` | คอลัมน์ระยะเวลา (ภาพ 29) |
| ขอเพิ่ม `durationDays` ใน 5.2 (`ListingDetail`) สำหรับเจ้าของสินค้า (spec ยังไม่มีฟิลด์นี้) | Programmer (หลัง SA เพิ่มใน spec) | หน้าแก้ไข / ตัวอย่างสินค้าต้องใช้ ตอนนี้ FE หาจาก 4.9 แทน (`qa.ownerDurationDays()`) |
| `fullName`, `idCardLast4` ใน 10.1 | `admin.user.service.js` | คอลัมน์ชื่อ / บัตร ปชช. (ภาพ A6) ส่งแค่ 4 ตัวท้าย |
| `defectDetail` บังคับทั้ง `used_good` และ `defective` (spec 4.2 เขียนแค่ `defective`) | `listing.service.js` | ภาพ UI "บังคับสำหรับสินค้ามือสอง" + ข้อ 3.1-1f |
| response ของ 9.4, 10.6 และฟิลด์ใน `recentBids` / `recentOrders` / `transactions` ของ 10.2 | `dispute.service.js`, `admin.user.service.js` | spec ยังไม่กำหนด ทำตามที่หน้าเว็บใช้ |

## สรุปผลเทส

ทดสอบบนโค้ดที่รวม PR #11–#17 แล้ว กับฐานข้อมูลใหม่จาก `schema.sql` + `001_seed.sql` (22 พ.ย. 69) ผู้ใช้ในชุดเทสหลักสมัครผ่าน API จริง (register → OTP → ยืนยันอีเมล → เปิดร้าน → แอดมินอนุมัติ)

| ชุดเทส | ผล |
|---|---|
| Contract test api-spec หัวข้อ 3, 4, 9, 10 (status, ฟิลด์, error code, สิทธิ์) | ✅ 117/117 |
| จุดเชื่อม QA กับงานเพื่อน (penalty จาก PM/SA, autoRelease ข้ามข้อพิพาท, 8.2 แสดงข้อพิพาท) | ✅ 9/9 |
| Auth (SA) | ✅ 22/22 |
| เปิดร้านด้วยบัญชีจาก Auth จริง | ✅ 3/3 |
| ลงสินค้า → ประมูล → ปิด → Order (cross-test QA × Programmer × PM) | ✅ 10/10 |
| เงิน Payment / Escrow / Shipping | ✅ 32/32 |
| Auction (Programmer) | ✅ 19/19 |
| สถานะบัญชี D-03 กับสิทธิ์ bid / sell, restoreStatus, detectShill, แบน + blacklist | ✅ 7/7 |
| หน้า FE ทุกหน้า (41 หน้า) ด้วยบัญชีผู้ขาย / ผู้ซื้อ / แอดมิน / Super Admin ตาม role ที่ใช้หน้านั้น บนจอ 1280 และ 375 px | ✅ ไม่มี HTTP/JS error ไม่มี scroll แนวนอน (หลังแก้ 3 จุด) ยกเว้นรูปหลักฐาน 404 (ค้างข้างบน) |
| เมนูบัญชีแอดมิน (คลิกอีเมลมุมขวาบน) หลังปรับ | ✅ 7/7 |

#### เช็กลิสต์งาน QA Phase 2
| งาน | ผล |
|---|---|
| ฟอร์มเปิดข้อพิพาท: ประเภท รายละเอียด หลักฐานหลายรูป ช่องทางติดต่อ เปิดได้เฉพาะก่อนเงินถูกปล่อย | ✅ |
| เปิดแล้ว Escrow ยัง `held` ปล่อยไม่ได้ (autoRelease ข้าม, ยืนยันรับไม่ได้) และ Order เป็น `disputed` | ✅ |
| ผู้ขายส่งหลักฐานฝั่งตัวเอง | ✅ |
| สถานะข้อพิพาท 6 ค่าตามข้อ 1.7-7 | ✅ |
| แอดมิน: ตารางข้อพิพาท, รายละเอียด (ไทม์ไลน์ Order, หลักฐานสองฝั่ง), ตัดสินคืนเงินผู้ซื้อ / ปล่อยเงินผู้ขาย | ✅ (รูปหลักฐานยังเปิดไม่ได้ รอ API) |
| `penalty.add`: ไม่จ่ายครั้งที่ 2 → suspended 7 วัน, ไม่ส่งของครั้งที่ 2 → restricted | ✅ ทดสอบผ่าน job ของ SA และ API ของ PM จริง |
| `restoreStatus` ครบกำหนดคืน active | ✅ |
| Shill detection แสดงในหน้าแอดมิน | ✅ IP เดียวกัน + บิดร้านเดิมซ้ำ · ❌ อุปกรณ์เดียวกัน (ไม่มีข้อมูลใน schema) |
| ตารางสมาชิก: ค้นหาชื่อ อีเมล เบอร์ กรองสถานะ | ✅ |
| โปรไฟล์มุมแอดมิน: ประวัติประมูล ขาย Wallet ความผิด ธุรกรรม | ✅ |
| เปลี่ยนสถานะ, แบน + blacklist (เลขบัตร hash + เบอร์) | ✅ สมัครใหม่ด้วยเลขบัตรที่ถูกแบนได้ `BLACKLISTED` |
| สิทธิ์ Admin / Super Admin | ✅ Admin แก้/แบนแอดมินไม่ได้, ปลดแบนไม่ได้, ไม่มี API แก้ยอด Wallet |
| เปิดร้าน D-18: pending, ต้องยืนยันอีเมล + ที่อยู่, หน้า "รออนุมัติ / ไม่ผ่านเพราะ..." | ✅ |
| แอดมินตรวจร้าน: รายการ, รายละเอียด, อนุมัติ / ไม่อนุมัติ (บังคับเหตุผล) + notify + audit.log | ✅ |
| เมนูแอดมิน: กระดิ่ง "แจ้งเตือน" แทนหัวใจ, เมนู "ตรวจร้านค้า" | ✅ |

#### เทส Auth (SA หลัง merge)
ผ่านทั้งหมด: terms · สมัคร (ส่งแค่ `idCardLast4`) · OTP ถูก / ผิด (`attemptsLeft`) / ยืนยันซ้ำ · เครดิตแรกเข้า 10,000 + `initial_credit` 1 รายการ · อีเมลซ้ำ / รหัสอ่อน / เลขบัตรผิด checksum / ไม่ยอมรับข้อกำหนด · login ด้วย username และอีเมล · รหัสผิด `INVALID_CREDENTIALS` · ยืนยันอีเมลจากลิงก์ · sessions · เปลี่ยนรหัส (รหัสเดิมผิด / เหมือนเดิม / session อื่นหลุด) · forgot ไม่บอกว่ามีอีเมลหรือไม่ · logout แล้ว token ใช้ไม่ได้ · บัญชีถูกแบน login ได้ `ACCOUNT_BANNED`

#### เทสระบบลงสินค้าแบบ cross-test กับ PM
ผู้ขายที่สมัครจริงลงสินค้า → แอดมินอนุมัติ → 5.2 ของ Programmer เห็น `active` และไม่ส่ง `reservePrice` → บิด → ปิดประมูล → `order.create` สร้าง Order `pending_payment` ยอด 1,500 + ค่าส่ง 60 พร้อม snapshot ที่อยู่ → 8.2 ของ PM ผู้ชนะเห็น `canPay` → สินค้าย้ายไปแท็บ ended ใน 4.9 → ผู้ชนะได้แจ้งเตือน `AUCTION_WON` · ผ่านทั้งหมด

#### เทส Payment / Escrow / Shipping (ยอดเงินต้องตรง)
ตรวจทุกขั้นว่า **ยอดรวมทั้งระบบ = Wallet ทุกคน + เงินรอตรวจ + Escrow held + ค่าธรรมเนียม = 5 × 10,000 บาท คงที่ตลอด** และทุก Wallet `balance = ผลรวม wallet_transactions`

| Flow | ผล |
|---|---|
| ชนะประมูล 1,500 + ส่ง 60: จ่ายไม่แนบสลิป → `SLIP_REQUIRED` ไม่หักเงิน (ผลก่อน #30 · หลัง #30 จ่ายได้โดยไม่แนบสลิปตาม D-01) · จ่าย → หัก 1,560 · จ่ายซ้ำไม่หักซ้ำ · อนุมัติ → Escrow held 1,560 · ยืนยันรับก่อนส่งไม่ได้ · ส่ง → ยืนยันรับ → ค่าธรรมเนียม 75 (5% ของราคาปิด ไม่รวมค่าส่ง) ผู้ขายได้ 1,485 · **ผู้ซื้อจ่าย 1,560 = ผู้ขาย 1,485 + ค่าธรรมเนียม 75** · ยืนยันซ้ำไม่ปล่อยซ้ำ · 7.3 รายได้ผู้ขายตรง | ✅ |
| ซื้อทันที 300 + ส่ง 40: ปฏิเสธการชำระ → คืนเต็ม 340 · จ่ายใหม่ได้ · ส่งแล้วเปิดข้อพิพาท → ยืนยันรับไม่ได้ → ตัดสินคืนเงิน → ผู้ซื้อได้คืนเต็ม ผู้ขายไม่ได้ | ✅ |
| ราคา 300 → ค่าธรรมเนียมขั้นต่ำ 20 (5% = 15) ผู้ขายได้ 320 | ✅ |
| ราคา 15 → ค่าธรรมเนียม 15 (ไม่เกินราคาปิด) ผู้ขายได้แค่ค่าส่ง 40 · ปล่อยด้วย `autoRelease` เมื่อครบกำหนด | ✅ |
| ยกเลิกเพราะผู้ขายไม่ส่ง (8.6) → คืนเงิน + `penalty.add(no_shipment)` | ✅ (ชุดเทสจุดเชื่อม) |

#### บั๊กส่วน Auction
**ไม่พบบั๊ก** ทดสอบ 19 ข้อผ่านทั้งหมด: บิดต่ำกว่าราคาเริ่ม / ต่ำกว่าขั้นต่ำ (`minNextBid`) · เจ้าของบิดเอง / แอดมินบิด · ผู้นำบิดซ้ำ `ALREADY_LEADING` · Proxy บิดแทนทันที · D-13 ลดวงเงินไม่ได้ · D-14 วงเงินถึง Reserve ดันราคาไป Reserve · Proxy สองคน ราคา = อันดับ 2 + ขั้น · คนอื่นไม่เห็นวงเงิน Proxy (6.2, 5.2, 5.3) · Auto Extend ช่วงท้าย + เพดาน 10 ครั้ง · D-16 ผู้นำเพิ่มวงเงินไม่ต่อเวลา · D-15 Buy Now หายเมื่อราคาถึง · Buy Now ต้อง confirm / เจ้าของซื้อเองไม่ได้ · ปิด `has_winner` / `below_reserve` / `no_bid` · บิดหลังปิดไม่ได้ · 6.7 รายการที่ชนะ

#### เทสเมนูบัญชีแอดมิน (หลังปรับตามที่ผู้ใช้ขอ)
ผ่านทั้งหมด 7 ข้อ (Super Admin, จอ 1280 และ 375 px): sidebar ไม่มี "กลับหน้าเว็บ" / "ออกจากระบบ" แล้ว · คลิกอีเมลเปิดเมนู การแจ้งเตือน → `/pages/notifications.html`, ตั้งค่า → `/pages/settings.html`, ออกจากระบบ · คลิกที่อื่นหรือกด Esc แล้วเมนูปิด · กดออกจากระบบแล้ว token ใช้ไม่ได้ (401) · จอมือถือเมนูไม่ล้นจอ

#### ฝากปรับ / ส่งต่อให้เพื่อนแล้ว (เทสซ้ำเมื่อเพื่อนแก้เสร็จ)
| เรื่อง | เจ้าของ | เทสซ้ำอะไร |
|---|---|---|
| หน้าการแจ้งเตือน / ตั้งค่า แสดงในโครงหลังบ้านเมื่อเป็นแอดมิน | PM | แอดมินกด "การแจ้งเตือน" / "ตั้งค่า" / ปุ่มกระดิ่ง แล้วยังอยู่ในหลังบ้าน (sidebar + แถวบน) และยังไม่เห็นแท็บที่อยู่จัดส่ง / ตั้งค่าแจ้งเตือน · สมาชิกทั่วไปยังเห็นหน้าเดิม |
| login แล้ว admin / super_admin ไปหน้า dashboard และอ่าน `?next=` | SA | login ด้วย admin, superadmin → `/pages/admin/dashboard.html` · สมาชิกเปิดลิงก์ข้อพิพาทตอนยังไม่ login → login แล้วกลับหน้าเดิม · `?next=//evil.com` ต้องไม่พาออกนอกเว็บ · บัญชี `pending_verification` ยังไปหน้า OTP |
| เมนู "รอจัดส่ง" ใช้ sidebar ผู้ขาย | PM | ผู้ขายกด "รอจัดส่ง" แล้ว sidebar ด้านซ้ายยังเป็นเมนูผู้ขาย และเมนู "รอจัดส่ง" active |
| เมนู "การเงินผู้ขาย" | SA | ผู้ขายกดแล้วยังอยู่ในส่วนผู้ขาย ยอดรอรับและรายได้ตรงกับ 7.1 / 7.3 (ยอดเดียวกับที่เทสเงินไว้) ไม่มีปุ่มถอนเงิน |
| navbar ไม่ตัดบรรทัด | PM | บัญชีผู้ขายบนจอกว้างและจอแคบ เมนูอยู่บรรทัดเดียว / มือถือไม่ล้นจอ |
| รูปหลักฐานข้อพิพาท (404) | SA → QA | เมื่อ SA เพิ่ม API ใน spec แล้ว QA ทำ endpoint → ผู้ซื้อ / ผู้ขายของ Order และแอดมินเปิดรูปได้ คนอื่นได้ 404 |

#### วิธีทดสอบด้วยมือ (flow จริง ไม่ต้องใช้ SQL แล้ว)
1. `cd backend` → `npm run db:init` → `npm run dev` · ออก token `npm run dev:token -- <username>` แล้วใน DevTools: `localStorage.setItem('rakadee_token', '<token>')`
2. **เปิดร้าน:** buyer2 เปิด `/pages/seller/open-shop.html` ยื่น → admin เมนู "ตรวจร้านค้า" อนุมัติ / ไม่อนุมัติ
3. **ได้ Order:** seller1 ลงสินค้าที่มีราคาซื้อทันที → admin อนุมัติ → buyer1 กดซื้อทันที → ชำระที่ `/pages/payment.html?orderId=` (แนบสลิป) → admin เมนู "การเงิน" อนุมัติ → seller1 บันทึกจัดส่งในหน้าคำสั่งซื้อ
4. **ข้อพิพาท:** buyer1 หน้าคำสั่งซื้อ → "แจ้งปัญหา" → seller1 ส่งหลักฐานที่ `/pages/disputes.html?id=` → admin เมนู "ข้อพิพาท" เปลี่ยนสถานะ → ตัดสิน → ดูยอด Wallet
5. **บทลงโทษ / ผู้ใช้:** admin เมนู "ผู้ใช้" ระงับ / แบน / คืนสถานะ · ใช้ token superadmin ปลดแบน · แท็บ "บิดน่าสงสัย"
6. **ออกจากระบบ (แอดมิน):** คลิกอีเมลมุมขวาบน → "ออกจากระบบ"


## phase 3 (phase 2 เคลียร์แล้ว)

### ปรับเอกสาร Test Plan / Test Case (23 พ.ย. 69)

ไฟล์ใหม่ `docs/qa/Test_Plan_and_Test_Case_phase3.docx` (ปรับจาก `Test_Plan_and_Test_Case_updated.docx`) ยึดลำดับ decision-log → schema.sql → api-spec → requirement
จาก 104 เคสเป็น 116 เคส: แก้ 30 เคส เพิ่ม 12 เคส

| เคส | ปรับอะไร | อ้างอิง |
|---|---|---|
| TC-21 | เปิดร้านแล้วเป็น `pending` ไม่ใช่ seller ทันที เพิ่ม `EMAIL_NOT_VERIFIED`, `ADDRESS_REQUIRED`, `APPLICATION_PENDING` | D-18, API 3.1 |
| TC-22 | `categoryId` ต้องเป็นหมวดย่อย (21), สร้างแล้วเป็น `draft` ก่อนส่งตรวจ, เพิ่มฟิลด์บังคับ | API 4.2, 4.7 |
| TC-25 | `defectDetail` บังคับทั้ง `used_good` และ `defective` | API 4.2 |
| TC-26 | error code `IMAGES_REQUIRED`, `TOO_MANY_IMAGES`, `UPLOAD_INVALID(_TYPE)`, ลบปกแล้วตั้งปกใหม่อัตโนมัติ | API 4.4, 4.7, 0.4 |
| TC-04 | กติกา username 4–30 ตัว `a-z 0-9 _` (เดิมเขียนว่ายังไม่กำหนด) | API 1.2 |
| TC-18 | ไม่มี API เปลี่ยนเบอร์/อีเมล, ฟิลด์ของ 2.11, error code อัปโหลด | API 2.1–2.11 |
| TC-31, 33, 36, 39 | เหตุผล 5–500 ตัว, `UNAUTHORIZED`, `ALREADY_IN_WATCHLIST`, `VALIDATION_ERROR` | API 4.13, 0.4, 5.6 |
| TC-34 | ค่า page/limit ผิด spec ไม่กำหนด error ให้จดผลจริง | D-11 |
| TC-56 | ชื่อ event ตามตาราง API 11, ใกล้หมดเวลาใช้ `time.endingSoonMs` | API 11 |
| TC-60, 64 | สลิปไม่บังคับตาม D-01 (API 7.6 และโค้ดแก้ให้ตรงแล้วใน #30), แทนสลิปไม่มีไฟล์ = `SLIP_REQUIRED`, สลิปเปิดผ่าน 7.7b เท่านั้น | D-01, API 7.7, 7.7b |
| TC-63, 67, 74, 75, 77 | สิทธิ์คนนอก (`FORBIDDEN` / `NOT_FOUND` ตาม endpoint), 8.4 ตอบ 201, กติกาเลขพัสดุ 6–40 ตัว, `PENALTY_ISSUED` | API 7.6, 8.2, 8.4, 10 |
| TC-80 | รีวิวอยู่นอกสโคป ตั้งสถานะ N/A | D-09 |
| TC-82, 83 | คนนอกดูข้อพิพาท/ไฟล์หลักฐานได้ `NOT_FOUND`, เปิดรูปผ่าน 9.7 | API 9.2, 9.7 |
| TC-84, 86, 88 | `DISPUTE_RESOLVED`, `PENALTY_ISSUED`, `ACCOUNT_STATUS_CHANGED`, ตัด `same_device` | API 9.6, 10, 10.6 |
| TC-91, 92, 93, 94 | `CANNOT_MODIFY_ADMIN`, ไม่มี API เพิ่มแอดมิน/เปลี่ยน role, action `SELLER_APPROVE/REJECT`, ค่าธรรมเนียมอ่านจาก `settings.feeConfig()` | D-07, API 10.3, 11.7–11.10 |
| TC-97 (d) | บัญชีที่ถูกแบน token ถูกยกเลิก ได้ `UNAUTHORIZED` | API 0.3, 10.4 |
| ใหม่ TC-105 | แอดมินตรวจร้าน (อนุมัติ/ไม่อนุมัติ, notify, audit) | D-18, API 3.5–3.8 |
| ใหม่ TC-106 | กล่องยืนยันบิด/Proxy ≥ 2 เท่าของราคาปัจจุบัน | D-17 |
| ใหม่ TC-107, 108 | แอดมินเปลี่ยนสถานะข้อพิพาท, จัดการสถานะบัญชีและปลดแบน | API 9.3b–9.5, 10.1–10.5 |
| ใหม่ TC-109 | `GET /api/fee-config` และกราฟแดชบอร์ด | API 11.5, 11.6, 11.10 |
| ใหม่ TC-110–116 | E2E ผู้ขาย/ผู้ซื้อ (ข้อ 1.1-6), Permission matrix, Security, Real-time, Regression, UAT | แผนงาน Phase 3 |


คุณคือ QA TESTER module ของคุณคือ QA ทำงาน ต่อไปนี้
QA (นำเฟสนี้)
-เทส End-to-End ตาม flow ผู้ขายและผู้ซื้อในข้อ 1.1-6
-Boundary test ทั้งชุด:
• บิดเท่ากับราคาเริ่ม, เท่ากับปัจจุบัน + Increment, ขาดไป 1 บาท
o Auto Extend: บิดตอนเหลือ 2:00 และ 2:01, ต่อเวลาครั้งที่ 10 และ 11
o Proxy ชน Proxy วงเงินเท่ากัน คนตั้งก่อนต้องชนะ
o Reserve: ปิดที่ต่ำกว่า เท่ากับ สูงกว่า
• ค่าธรรมเนียม: ราคาปิด 15, 100, 400, 401, 1,000 บาท
o Deadline 24/48 ชม., 72 ชม., 7 วัน โดยย่อเวลาผ่าน .env
-Permission test: Guest / Bidder / Seller / Admin / Super Admin เรียก API ที่ไม่มีสิทธิ์, ผู้ขายบิด
ของตัวเอง, บัญชี suspended / restricted / banned ทำแต่ละอย่าง
-Security พื้นฐาน: SQL injection ในช่องค้นหา, XSS ในรายละเอียดสินค้า, อัปโหลดไฟล์ผิดชนิด, เลข
บัตรไม่หลุดใน API response
-Real-time test: เปิด 2-3 browser ดูสินค้าเดียวกัน ราคาและเวลาต้องตรงกันทุกจอ
-Regression ทุกครั้งที่มี merge เข้า main
-UAT: ให้คนนอกทีม 1-2 คนลองใช้ตามสคริปต์ แล้วเก็บ feedback
-สรุปรายงานผลการทดสอบ (จำนวน test case, ผ่าน, ไม่ผ่าน, บั๊กแยกตาม severity)

#### สรุปผลเทส
## 1.เทส End-to-End ตาม flow ผู้ขายและผู้ซื้อในข้อ 1.1-6

ทดสอบ 23 พ.ย. 69 · ฐานข้อมูลใหม่จาก `npm run db:demo` · บัญชีสมัครใหม่ทั้งหมด · TC-110 (ผู้ขาย), TC-111 (ผู้ซื้อ)

| ส่วน | ตรวจ | ผ่าน | ไม่ผ่าน |
|---|---|---|---|
| ผ่าน API (สคริปต์ยิง API จริงทุกขั้น) | 26 | 26 | 0 |
| ผ่านหน้าเว็บ (กดจริง 3 แท็บ: ผู้ขาย / แอดมิน / ผู้ซื้อ) | 37 | 30 | 7 |
| **รวม** | **63** | **56** | **7** |

**Flow ที่เทส:** สมัคร → OTP → Wallet 10,000 → ยืนยันอีเมล ❌R5-1 → เพิ่มที่อยู่ → ยื่นเปิดร้าน (รออนุมัติ) → แอดมินอนุมัติร้าน → ลงสินค้า 4 ขั้น → แอดมินอนุมัติสินค้า → ผู้ซื้อค้นหา / Watchlist / ตั้ง Proxy ❌R5-2 → คู่แข่งบิด Proxy ตอบอัตโนมัติ → ชนะ 1,400 → เลือกที่อยู่ ❌R5-5 → แนบสลิปชำระ ❌R5-4 → แอดมินอนุมัติเข้า Escrow → ผู้ขายบันทึกจัดส่ง ❌R5-3 → ผู้ซื้อยืนยันรับ → ผู้ขายได้ 11,390 (10,000 + 1,460 − ค่าธรรมเนียม 70) ✅ · ยอดรวมทั้งระบบ D-10 ตรง ✅ · แจ้งเตือนครบ 8 event ✅

**Validation ที่ผ่านระหว่างทาง:** ปุ่มสมัครกดไม่ได้จนติ๊กยอมรับ · OTP ผิดถูกปฏิเสธ · รหัสไปรษณีย์ 4 หลัก · มือสองต้องกรอกตำหนิ · Reserve < ราคาเริ่ม · เลขพัสดุผิดรูปแบบ · ยังไม่อนุมัติร้านไม่มีเมนูผู้ขาย (D-18) · Proxy ดันราคาถึง Reserve (D-14)

| # | severity | บั๊ก | ที่ควรเป็น | เจ้าของ |
|---|---|---|---|---|
| R5-1 | **high** | กดลิงก์ยืนยันอีเมลไม่ผ่าน: `verify-email.html` เรียก `GET /auth/verify-email?token=` (ปุ่มส่งใหม่เรียก `/auth/verify-email/resend`) ผู้ขายใหม่จึงเปิดร้านผ่านเว็บไม่ได้ | `POST /api/auth/email/verify { token }` และ `POST /api/auth/email/resend` (API 1.8, 1.9) | SA |
| R5-2 | medium | กด "ตั้ง Proxy Bid" ครั้งเดียว ตั้ง Proxy ทันทีด้วยราคาขั้นต่ำที่เติมไว้ในช่อง ไม่ได้กรอกวงเงินและไม่มีกล่องยืนยัน | ให้กรอกวงเงินเองหรือยืนยันก่อนส่ง (การบิดผูกพัน ข้อ 2.1) | Programmer |
| R5-3 | medium | บันทึกจัดส่งในนาทีเดียวกับที่แอดมินอนุมัติชำระ ได้ "วันเวลาที่ส่งต้องไม่ก่อนวันที่ชำระเงินสำเร็จ" เพราะช่องเวลาตัดวินาทีทิ้ง | FE เติมเวลาไม่ให้ก่อน `paidAt` หรือ BE เทียบระดับนาที (ตอนเดโมเจอแน่) | PM |
| R5-4 | low | หลังกดชำระ countdown ยังเดิน และยอด Wallet บน navbar ไม่อัปเดตจนกว่าจะรีเฟรช | อัปเดตหน้าหลังชำระสำเร็จ | SA |
| R5-5 | low | ลิงก์ "เพิ่มที่อยู่ใหม่" ในหน้าชำระไปหน้าตั้งค่าแล้วไม่มีทางกลับ | ส่ง `?next=` กลับหน้าชำระ | SA |
| R5-6 | low | กรอก OTP ผิดไม่บอกจำนวนครั้งที่เหลือ | แสดง `details.attemptsLeft` | SA |
| R5-7 | low | ตอนยืนยันรับ escrow ใช้ event `PAYMENT_SUCCESS` แจ้ง "คำสั่งซื้อเสร็จสมบูรณ์" และใช้ `#13` แทน `#ORD-13` | ใช้ event ที่ตรงความหมาย | SA |

**เพื่อนแก้แล้ว เทสผ่าน:** แอดมิน login แล้วไป dashboard · หน้ารอจัดส่ง / การเงินผู้ขายใช้ sidebar ผู้ขาย · แอดมินเปิดรูปสลิปได้

**หมายเหตุ:** สลิปบังคับ (ขัดกับ D-01) รอ PM / SA ตัดสิน · เบราว์เซอร์ที่ใช้เทสปิด `confirm()` จึงตั้งให้ตอบ "ตกลง" แทนการกด (ไม่ใช่บั๊ก) · รายละเอียดเต็มใน `test-report-phase3.md` หัวข้อ "รอบ 5"

#### เทสซ้ำหลังเพื่อนแก้ (23 พ.ย. 69 รอบเดียว)

ฐานข้อมูลใหม่จาก `npm run db:demo` (เงินรวม 70,000 ตรง) · โค้ดที่รวม 19 ไฟล์ที่เพื่อนแก้แล้ว · สคริปต์ E2E ชุดเดิม + เพิ่มเช็ก R5-3, R5-7 และยอดรวม D-10 · หน้าเว็บกดจริงด้วยบัญชีที่สมัครใหม่ผ่านหน้าสมัคร

| ส่วน | ตรวจ | ผ่าน | ไม่ผ่าน |
|---|---|---|---|
| ผ่าน API (flow เดิม 26 ขั้น + R5-7 + ยอดรวม D-10) | 28 | 28 | 0 |
| ผ่านหน้าเว็บ (จุดที่เคยเป็นบั๊ก + ขั้นก่อน/หลังของแต่ละจุด) | 13 | 13 | 0 |
| **รวม** | **41** | **41** | **0** |

| # | ผลเทสซ้ำ | หลักฐาน |
|---|---|---|
| R5-1 | ✅ หายแล้ว | เปิดลิงก์จากอีเมลใน log → หน้าเรียก `POST /api/auth/email/verify` 200 "ยืนยันอีเมลสำเร็จ!" · token ผิด → 400 แสดงกล่องส่งใหม่ → กด "ส่งอีเมลยืนยันอีกครั้ง" เรียก `POST /api/auth/email/resend` 200 · ผู้ขายที่ยืนยันจากหน้าเว็บเปิดร้านต่อได้ |
| R5-2 | ✅ หายแล้ว | กด "ตั้ง Proxy Bid" ขึ้นกล่อง "ยืนยันวงเงิน Proxy" ทุกครั้ง (แม้ราคาเท่าขั้นต่ำ) · กด "แก้ไขราคา" ไม่มีคำขอไป server · กด "ยืนยัน" → `PUT /proxy` 1 ครั้ง "ตั้งวงเงิน Proxy ฿2,500 สำเร็จ คุณเป็นผู้นำ" |
| R5-3 | ✅ หายแล้ว | แอดมินอนุมัติชำระ 15:33:14 → ผู้ขายกดบันทึกจัดส่งในหน้าคำสั่งซื้อ 15:33:34 (ช่องเวลา 22:33 ไม่มีวินาที) → 201 · API ส่งเวลาตัดวินาทีก็ผ่าน |
| R5-4 | ✅ หายแล้ว | กดชำระแล้ว countdown เปลี่ยนเป็น "รอแอดมินตรวจ (หยุดนับเวลา)" และไม่เดินต่อ · ยอดบน navbar เปลี่ยน ฿10,000 → ฿9,460 ทันทีไม่ต้องรีเฟรช |
| R5-5 | ✅ หายแล้ว | ไม่มีที่อยู่ → ลิงก์ "เพิ่มที่อยู่ใหม่" ไป `settings.html?next=/pages/payment.html?orderId=13#addresses` เปิดแท็บที่อยู่ มีลิงก์ "← กลับไปหน้าชำระเงิน" · เพิ่มที่อยู่แล้วกดกลับ เลือกที่อยู่ได้ |
| R5-6 | ✅ หายแล้ว | กรอก OTP ผิด → "รหัส OTP ไม่ถูกต้อง (เหลืออีก 4 ครั้ง)" · กรอกถูก → ไปหน้า Wallet ฿10,000 |
| R5-7 | ✅ หายแล้ว | ยืนยันรับแล้วผู้ซื้อได้ `ORDER_COMPLETED` "คำสั่งซื้อ #ORD-12 เสร็จสมบูรณ์ ระบบปล่อยเงินให้ผู้ขายแล้ว" · `PAYMENT_SUCCESS` มีแค่ตอนชำระ 1 รายการ · ทุกข้อความใช้ `#ORD-` |

**ส่วนอื่นยังผ่าน:** สมัคร → OTP → Wallet 10,000 · เปิดร้าน pending → แอดมินอนุมัติ · ลงสินค้า → อนุมัติ → ค้นหา / Watchlist · Proxy ตอบอัตโนมัติ → ชนะ 1,400 · ชำระ 1,460 → อนุมัติ → จัดส่ง → ยืนยันรับ → ผู้ขายได้ 11,390 · แจ้งเตือนครบ 9 event · ยอดรวม Wallet 81,495 + Escrow 4,860 + รอตรวจ 3,260 + ค่าธรรมเนียม 385 = 90,000 = เครดิตแรกเข้า ✅

**ข้อจำกัด:** หน้าเว็บกดซ้ำเฉพาะจุดที่เป็นบั๊กและขั้นที่ไฟล์ที่แก้เกี่ยวข้อง (สมัคร, ยืนยันอีเมล, รายละเอียดสินค้า, ชำระเงิน, ตั้งค่า, คำสั่งซื้อ) ส่วนหน้าลงสินค้า 4 ขั้น, แอดมินอนุมัติสินค้า / ร้าน และค้นหา ไม่มีไฟล์ถูกแก้ จึงเทสผ่าน API อย่างเดียว · สคริปต์ไม่ได้อยู่ใน `docs/qa/scripts/` ใช้ชุดเดิมจากรอบก่อน · ข้อมูลเทส (ผู้ใช้ id 10–12, สินค้า 25–26, Order 12–13, Proxy ของ buyer1 บนสินค้า 18 และ 20) อยู่ในฐานข้อมูล ควรรัน `npm run db:demo` ใหม่ก่อนเดโม



## 2.Boundary test ทั้งชุด: • บิดเท่ากับราคาเริ่ม, เท่ากับปัจจุบัน + Increment, ขาดไป 1 บาท
o Auto Extend: บิดตอนเหลือ 2:00 และ 2:01, ต่อเวลาครั้งที่ 10 และ 11
o Proxy ชน Proxy วงเงินเท่ากัน คนตั้งก่อนต้องชนะ
o Reserve: ปิดที่ต่ำกว่า เท่ากับ สูงกว่า
• ค่าธรรมเนียม: ราคาปิด 15, 100, 400, 401, 1,000 บาท
o Deadline 24/48 ชม., 72 ชม., 7 วัน โดยย่อเวลาผ่าน .env

ทดสอบ 23 พ.ย. 69 · ฐานข้อมูลใหม่จาก `npm run db:demo` · ยิง API จริงด้วยสคริปต์ ตรวจ response และข้อมูลในตาราง

| ส่วน | ตรวจ | ผ่าน | ไม่ผ่าน |
|---|---|---|---|
| บิดที่ขอบราคา | 11 | 9 | 2 |
| Auto Extend | 8 | 6 | 2 |
| Proxy ชน Proxy / ลดวงเงิน | 8 | 8 | 0 |
| Reserve ตอนปิด | 6 | 6 | 0 |
| ค่าธรรมเนียม + ยอดรวม D-10 | 7 | 6 | 1 |
| Deadline (ย่อเวลาผ่าน .env ให้ Scheduler จริงทำงาน) | 16 | 16 | 0 |
| **รวม** | **56** | **51** | **5** |

#### ผลแต่ละข้อ

| หัวข้อ | กรณี | ผล |
|---|---|---|
| บิด | ราคาเริ่ม 1,000: บิด 999 / 999.99 | ✅ `BID_TOO_LOW` (minNextBid 1000) |
| | บิดเท่าราคาเริ่ม 1,000 | ✅ รับบิด ผู้นำ ราคา 1,000 |
| | ปัจจุบัน 1,000 + Increment 100: บิด 1,099 (ขาด 1 บาท) | ✅ `BID_TOO_LOW` (minNextBid 1100) · ❌ R2-2 |
| | บิด 1,100 พอดี | ✅ รับบิด |
| | ผู้นำบิดทับตัวเอง | ✅ `ALREADY_LEADING` (D-16) |
| | 0, −100, "abc", ว่าง, ทศนิยม 3 ตำแหน่ง | ✅ `VALIDATION_ERROR` |
| Auto Extend | เหลือ 2:01 | ✅ ไม่ต่อเวลา |
| | เหลือ 2:00 พอดี | ✅ ต่อเวลา นับ 1 ครั้ง (D-16) |
| | เหลือ 1:00 | ✅ `end_at` = เวลาบิด + 2 นาที |
| | ต่อครั้งที่ 10 / ครั้งที่ 11 | ✅ ครั้งที่ 10 ต่อได้ ครั้งที่ 11 รับบิดแต่ไม่ต่อ |
| | ผู้นำเพิ่มวงเงินช่วงท้าย | ✅ ไม่ต่อเวลา (D-16) |
| | บิดทันทีหลังต่อเวลา (ภายใน ~0.5 วินาที) | ❌ R2-3 |
| Proxy | A ตั้ง 3,000 ก่อน B ตั้ง 3,000 (วงเงินเท่ากัน) | ✅ A ชนะ ราคา 3,000 |
| | A 3,000 / B 3,500 | ✅ B ชนะ ราคา 3,100 |
| | ผู้นำลดวงเงิน 3,500 → 3,000 / ตั้งเท่าเดิม | ✅ `PROXY_CANNOT_DECREASE` (D-13) · ไม่มี `DELETE` |
| | ตั้งต่ำกว่า minNextBid | ✅ `PROXY_TOO_LOW` |
| | Proxy 5,000 กับ Reserve 3,000 | ✅ ราคาขึ้นไป 3,000 ทันที (D-14) |
| | คนอื่นดู Proxy | ✅ ได้ `null` ไม่เห็นวงเงิน |
| Reserve | Reserve 3,000 ปิดที่ 2,999 | ✅ `below_reserve` ไม่สร้าง Order |
| | ปิดที่ 3,000 / 3,001 | ✅ `has_winner` สร้าง Order |
| | ไม่มีผู้บิด | ✅ `no_bid` |
| | รัน closeAuctions ซ้ำ | ✅ ไม่เกิด Order ซ้ำ |
| ค่าธรรมเนียม | ราคาปิด 15 (ค่าส่ง 0) | ❌ **R2-1** |
| | 100 / 400 / 401 / 1,000 | ✅ ค่าธรรมเนียม 20 / 20 / 20.05 / 50 ผู้ขายได้ 80 / 380 / 380.95 / 950 |
| | ยอดรวมทั้งระบบ D-10 / balance = ledger ทุก Wallet | ✅ ตรง 70,000 |
| Deadline | ระบบอ่านเวลาจาก .env (ย่อ: ชำระ 4 นาที, เตือน 2 นาที, จัดส่ง 4 นาที, ปล่อยเงิน 3 นาที, ระงับ 3 นาที) | ✅ |
| | ก่อนครบ 24 ชม. ไม่เตือน / ครบแล้วเตือน `PAYMENT_DUE_SOON` | ✅ เกิดหลังกำหนด 5 วินาที |
| | ก่อนเหลือ 24 ชม. ไม่เตือนผู้ขาย / ถึงแล้วเตือน `SHIP_DUE_SOON` | ✅ เกิดหลังกำหนด 4 วินาที |
| | ก่อนครบ 7 วัน ไม่ปล่อยเงิน / ครบแล้วปล่อยอัตโนมัติ | ✅ เกิดหลังกำหนด 5 วินาที ค่าธรรมเนียม 20 ผู้ขายได้ 210 |
| | ชำระก่อนหมด 48 ชม. 20 วินาที / หลังหมด 2 วินาที | ✅ 201 / `PAYMENT_EXPIRED` |
| | ครบ 48 ชม. ไม่ชำระ | ✅ `cancelled (payment_timeout)` + บทลงโทษ warning เกิดหลังกำหนด 7 วินาที |
| | Order ที่ชำระแล้วรอแอดมินตรวจ เลยกำหนด | ✅ ไม่ถูกยกเลิก (นาฬิกาหยุด D-01) |
| | ไม่จ่ายครั้งที่ 2 | ✅ `suspended` ตาม `SUSPEND_MINUTES` แล้ว `restoreStatus` คืน `active` หลังครบกำหนด 1 วินาที |
| | ขอยกเลิกก่อนเลยกำหนดส่ง 72 ชม. | ✅ `CANCEL_NOT_ALLOWED` |
| | เลยกำหนดส่ง | ✅ แจ้ง `SHIP_OVERDUE` (หลังกำหนด 7 วินาที) ยกเลิกได้ คืนเงินเต็ม 230 + บทลงโทษผู้ขาย `no_shipment` |

#### บั๊กที่เจอ (ยังไม่ได้แก้จากรอบก่อน)

| # | severity | บั๊ก | ที่ควรเป็น | เจ้าของ |
|---|---|---|---|---|
| R2-1 | **high** | ราคาปิด 15 ค่าส่ง 0 → ผู้ขายได้สุทธิ 0 → ยืนยันรับได้ 500 เงินค้างใน Escrow Order ค้าง `shipped` และ `autoRelease` ล้มทุกนาที (`escrow.release()` INSERT `wallet_transactions` ยอด 0 ขัด CHECK `amount <> 0`) | ปล่อยได้ ไม่ต้องเขียนรายการเมื่อ net = 0 | SA (`services/escrow.js`) |
| R2-2 | low | `details.minNextBid` ของ `BID_TOO_LOW` / `PROXY_TOO_LOW` เป็นสตริง `"2600.00"` | เป็นตัวเลขตาม API 0.1 | Programmer |
| R2-3 | low | บิดภายใน ~0.5 วินาทีหลังต่อเวลาไม่ต่ออีก (`end_at` เป็น DATETIME ปัดวินาทีขึ้น เหลือ 120.35 วินาที > 2:00) | ผลต่างไม่ถึง 1 วินาที แก้หรือไม่ก็ได้ | Programmer |

**ส่วนของ QA:** ไม่เจอบั๊กในโมดูล QA

**หมายเหตุ:** Deadline ใช้ `.env` ย่อเวลาจริงแล้วให้ Scheduler ของ server ทำงานเอง (ไม่ได้เลื่อนเวลาใน DB) จึงเช็กได้ว่าเหตุการณ์เกิดหลังกำหนดภายใน 1 รอบ Scheduler (≤ 1 นาที) · รายละเอียดเต็มใน `test-report-phase3.md`


#### เทสซ้ำหลังเพื่อนแก้ (23 พ.ย. 69 รอบเดียว)

ฐานข้อมูลต่อจากเทสข้อ 1 (เริ่มจาก `npm run db:demo`) · โค้ดที่รวม 19 ไฟล์ที่เพื่อนแก้แล้ว · สคริปต์ชุดเดิม (บิด / Auto Extend / Proxy / Reserve / ค่าธรรมเนียม + เช็กบั๊ก R2-2, R2-3) · Deadline ย่อเวลาผ่าน `.env` แล้วรีสตาร์ท server ให้ Scheduler จริงทำงาน

| ส่วน | ตรวจ | ผ่าน | ไม่ผ่าน |
|---|---|---|---|
| บิดที่ขอบราคา | 11 | 11 | 0 |
| Auto Extend | 8 | 8 | 0 |
| Proxy ชน Proxy / ลดวงเงิน / Reserve ของ Proxy | 8 | 8 | 0 |
| Reserve ตอนปิด | 5 | 5 | 0 |
| ค่าธรรมเนียม + ยอดรวม D-10 | 7 | 7 | 0 |
| Deadline (ย่อเวลาผ่าน .env) | 16 | 16 | 0 |
| **รวม** | **55** | **55** | **0** |

| # | ผลเทสซ้ำ | หลักฐาน |
|---|---|---|
| R2-1 | ✅ หายแล้ว | ราคาปิด 15 ค่าส่ง 0 → ยืนยันรับได้ Order `completed` Escrow `released` ค่าธรรมเนียม 15 ผู้ขายได้ 0 ไม่เขียน `wallet_transactions` ยอด 0 · log ของ server ไม่มี error จาก `autoRelease` |
| R2-2 | ✅ หายแล้ว | `details.minNextBid` ของ `BID_TOO_LOW` และ `PROXY_TOO_LOW` เป็นตัวเลข `1000` |
| R2-3 | ⚠️ ยังเกิด แต่ไม่มีผลเสียแล้ว | ตอนนี้ปัดเวลาปิดใหม่ขึ้นเป็นวินาทีเต็ม (`Math.ceil`) หลังต่อเวลาจึงเหลือ 120–121 วินาที บิดภายใน 1 วินาทีแรกจึงไม่ต่อเวลา (ยิงทันที: 10/10 ครั้งไม่ต่อ, เทสแยก 4/5 ครั้งไม่ต่อ · รอ 1.5 วินาที: ต่อ 5/5) แต่หลังบิดทุกครั้งเหลือเวลา ≥ 120 วินาที ไม่มีใครเสียเวลาบิด เสนอให้ปิดเรื่อง หรือเทียบเวลาระดับวินาทีถ้าอยากให้ตรงตัวอักษร |

**เคสที่สคริปต์ขึ้นไม่ผ่านแต่ไม่ใช่บั๊กใหม่:** TC-103 "Proxy ชนกันช่วงท้ายต่อเวลาครั้งเดียว" สคริปต์ยิง Proxy คนที่ 2 ทันทีหลัง Proxy คนแรกต่อเวลา จึงโดนสาเหตุเดียวกับ R2-3 · ยิงใหม่โดยรอ 1.5 วินาที → `extended=true` `extend_count` 1 → 2 ราคา 2,550 ถูกต้อง จึงนับว่าผ่าน

**ผลแต่ละข้อที่ยังผ่าน:** บิด 999.99 / 1,099 → `BID_TOO_LOW` · บิดเท่าราคาเริ่ม / ปัจจุบัน + Increment รับ · ผู้นำบิดทับ `ALREADY_LEADING` · 0, −100, "abc", null, ทศนิยม 3 ตำแหน่ง → `VALIDATION_ERROR` · เหลือ 2:01 ไม่ต่อ / 2:00 ต่อ / 1:00 `end_at` = เวลาบิด + 2 นาที · ครั้งที่ 10 ต่อ ครั้งที่ 11 ไม่ต่อ · ผู้นำเพิ่มวงเงินไม่ต่อ (D-16) · วงเงินเท่ากันคนตั้งก่อนชนะ 3,000 · 3,000 vs 3,500 → 3,100 · ลดวงเงิน / ตั้งเท่าเดิม `PROXY_CANNOT_DECREASE` · ไม่มี `DELETE` · ต่ำกว่า minNextBid `PROXY_TOO_LOW` · Proxy ≥ Reserve ดันราคาถึง 3,000 (D-14) · คนอื่นดู Proxy ได้ `null` · Reserve 3,000 ปิดที่ 2,999 `below_reserve` ไม่มี Order / 3,000 และ 3,001 `has_winner` · ไม่มีผู้บิด `no_bid` · ปิดซ้ำไม่เกิด Order ซ้ำ · ค่าธรรมเนียม 15 / 20 / 20 / 20.05 / 50 ผู้ขายได้ 0 / 80 / 380 / 380.95 / 950 · ยอดรวม 100,000 = เครดิตแรกเข้า และทุก Wallet ตรงกับ ledger

**Deadline:**

| กรณี | ผล |
|---|---|
| ระบบอ่านเวลาจาก .env (ชำระ 4 นาที, เตือน 2 นาที, จัดส่ง 4 นาที, เตือนผู้ขาย 2 นาทีก่อนครบ, ปล่อยเงิน 3 นาที, ระงับ 3 นาที) | ✅ `payment_due` +4, `ship_due` +4, `auto_release` +3 นาที |
| ก่อนครบ 24 ชม. ไม่เตือน / ครบแล้วเตือน `PAYMENT_DUE_SOON` | ✅ เกิดหลังกำหนด 40 วินาที |
| ก่อนเหลือ 24 ชม. ไม่เตือนผู้ขาย / ถึงแล้วเตือน `SHIP_DUE_SOON` | ✅ เกิดหลังกำหนด 40 วินาที |
| ก่อนครบ 7 วัน ไม่ปล่อยเงิน / ครบแล้วปล่อยอัตโนมัติ | ✅ เกิดหลังกำหนด 40 วินาที ค่าธรรมเนียม 20 ผู้ขายได้ 210 (ผ่าน `escrow.release()` ที่แก้แล้ว) |
| ชำระก่อนหมด 48 ชม. ~20 วินาที / หลังหมด 2 วินาที | ✅ 201 / `PAYMENT_EXPIRED` |
| ครบ 48 ชม. ไม่ชำระ | ✅ `cancelled (payment_timeout)` + บทลงโทษ warning (หลังกำหนด 37 วินาที) |
| Order ที่ชำระแล้วรอแอดมินตรวจ เลยกำหนด | ✅ ไม่ถูกยกเลิก (นาฬิกาหยุด D-01) |
| ไม่จ่ายครั้งที่ 2 | ✅ `suspended` ถึง +3 นาที แล้ว `restoreStatus` คืน `active` หลังครบกำหนด 1 วินาที |
| ขอยกเลิกก่อนเลยกำหนดส่ง 72 ชม. | ✅ `CANCEL_NOT_ALLOWED` |
| เลยกำหนดส่ง | ✅ แจ้ง `SHIP_OVERDUE` (หลังกำหนด 42 วินาที) ยกเลิกได้ คืนเงินเต็ม 230 + บทลงโทษผู้ขาย `no_shipment` |

หมายเหตุ: รอบนี้ Scheduler ทำงานช้ากว่ากำหนด ~40 วินาที (รอบก่อน ~5 วินาที) เพราะ server รีสตาร์ทกลางนาที แต่ยังอยู่ใน 1 รอบ Scheduler (≤ 1 นาที) · สคริปต์รอ `restoreStatus` ไม่นานพอจึงขึ้น FAIL ก่อนถึงเวลา ตรวจต่อจนถึงเวลาแล้วคืน `active` ถูกต้อง จึงนับว่าผ่าน · คืนค่า `backend/.env` เดิมและรีสตาร์ท server แล้ว

**ส่วนของ QA:** ไม่เจอบั๊กในโมดูล QA (บทลงโทษ `non_payment` / `no_shipment` และ `restoreStatus` อยู่ในผล Deadline)


## 3.Permission test: Guest / Bidder / Seller / Admin / Super Admin เรียก API ที่ไม่มีสิทธิ์, ผู้ขายบิด ของตัวเอง, บัญชี suspended / restricted / banned ทำแต่ละอย่าง

ทดสอบ 23 พ.ย. 69 · ฐานข้อมูลใหม่จาก `npm run db:demo` · ยิง API จริงด้วย token ของแต่ละ role และเปิดหน้าเว็บจริง · อ้างอิง API 0.3, 0.4, D-03, D-07

| ส่วน | ตรวจ | ผ่าน | ไม่ผ่าน |
|---|---|---|---|
| ตาราง role × endpoint (44 endpoint × 5 role: Guest / Bidder / Seller / Admin / Super Admin) | 220 | 216 | 4 |
| บิดของตัวเอง / แอดมินบิด | 8 | 8 | 0 |
| เจ้าของข้อมูล (Order, ข้อพิพาท, สลิป, สินค้า, ที่อยู่ของคนอื่น) | 13 | 13 | 0 |
| Admin vs Super Admin | 6 | 6 | 0 |
| สถานะบัญชี pending / restricted / suspended / banned × bid / sell / pay | 17 | 17 | 0 |
| หน้าเว็บ (เปิดหน้า admin / seller ด้วย role ที่ไม่มีสิทธิ์) | 9 | 7 | 2 |
| **รวม** | **273** | **267** | **6** |

#### ผลแต่ละข้อ

| หัวข้อ | กรณี | ผล |
|---|---|---|
| role × endpoint | ไม่มี token เรียก API ที่ต้อง login | ✅ `401 UNAUTHORIZED` ทุก endpoint |
| | Bidder เรียก API ผู้ขาย / แอดมิน | ✅ `403 FORBIDDEN` |
| | Seller เรียก API แอดมิน | ✅ `403 FORBIDDEN` |
| | Admin เรียก API สมาชิก (Watchlist, ที่อยู่, คำสั่งซื้อ ฯลฯ) | ✅ `403` · ❌ R3-1 (Wallet) |
| | Admin เรียก ตั้งค่าระบบ / ปลดแบน | ✅ `403` (เฉพาะ Super Admin) |
| | Super Admin เรียกได้ทุก API แอดมิน | ✅ |
| | API สาธารณะ (ค้นหา รายละเอียด หน้าแรก fee-config) | ✅ ทุก role รวม Guest |
| บิดของตัวเอง | ผู้ขายบิด / ตั้ง Proxy / Buy Now สินค้าตัวเอง | ✅ `SELF_BIDDING` ทั้ง 3 แบบ |
| | ผู้ขายบิดสินค้าร้านอื่น | ✅ บิดได้ |
| | Admin / Super Admin บิดและ Buy Now | ✅ `FORBIDDEN` (D-07) |
| เจ้าของข้อมูล | เปิด / ยืนยันรับ / ยกเลิก / จ่าย Order ของคนอื่น | ✅ `404` หรือ `403` ตาม spec |
| | ผู้ขายร้านอื่นเปิด Order / บันทึกจัดส่ง | ✅ `404 NOT_FOUND` |
| | คนนอกเปิดข้อพิพาท / ส่งหลักฐาน / เปิดสลิป | ✅ `404` / `403` |
| | แก้ / ส่งตรวจสินค้าร้านอื่น, ลบที่อยู่ของคนอื่น | ✅ ถูกปฏิเสธ |
| Admin vs Super Admin | Admin เปลี่ยนสถานะ / แบน Super Admin | ✅ `CANNOT_MODIFY_ADMIN` |
| | Admin แบนตัวเอง | ✅ ถูกปฏิเสธ `FORBIDDEN` "ไม่สามารถเปลี่ยนสถานะบัญชีของตัวเองได้" |
| | Admin ดู Audit Log (ส่ง `adminId` ของคนอื่น) | ✅ เห็นเฉพาะของตัวเอง |
| | Super Admin เปลี่ยนสถานะแอดมิน / เห็น Audit Log ทุกคน | ✅ |
| pending_verification | login | ✅ ได้ (ไปหน้า OTP) |
| | bid / sell (เปิดร้าน) / pay | ✅ `ACCOUNT_NOT_VERIFIED` |
| restricted | bid | ✅ บิดได้ (D-03) |
| | sell (เปิดร้าน, ลงสินค้า) | ✅ `ACCOUNT_RESTRICTED` |
| | pay (ชำระ Order ของตัวเอง) | ✅ ชำระได้ |
| suspended | login | ✅ ได้ (ดูอย่างเดียว) |
| | bid / ตั้ง Proxy / Buy Now / ลงสินค้า | ✅ `ACCOUNT_SUSPENDED` พร้อม `details.until` |
| | pay (ยืนยันรับ Order ค้าง, ผู้ขายบันทึกจัดส่ง Order ค้าง) | ✅ ทำได้ (API 0.3) |
| banned | token เดิม | ✅ `401` (ยกเลิก session ตอนแบน) |
| | login | ✅ `ACCOUNT_BANNED` |
| หน้าเว็บ | Guest เปิดหน้าแอดมิน / ลงสินค้า / Wallet | ✅ ไปหน้า login |
| | Bidder เปิดหน้าแอดมิน | ✅ กลับหน้าแรก |
| | Bidder เปิดหน้าลงสินค้า | ✅ ไปหน้าเปิดสิทธิ์ผู้ขาย · navbar ไม่มีเมนูผู้ขาย / แอดมิน |
| | Seller เปิดหน้าแอดมิน | ❌ R3-2 |

#### บั๊กที่เจอ

| # | severity | บั๊ก | ที่ควรเป็น | เจ้าของ |
|---|---|---|---|---|
| R3-1 | low | Admin / Super Admin เรียก `GET /api/wallet` และ `GET /api/wallet/transactions` ได้ 200 (`{ balance: 0 }`) เพราะ `routes/wallet.routes.js` มีแค่ `requireAuth` ไม่มี `requireRole('member')` (comment ในไฟล์เขียนว่า member) | `403 FORBIDDEN` ตาม API 7.1, 7.2 และ D-07 (แอดมินไม่มี Wallet) | SA |
| R3-2 | low | Seller เปิดหน้าแอดมินแล้วได้ผลไม่เหมือนกัน: `admin/payments.html` พาไปหน้า login ทั้งที่ login อยู่ ส่วน `admin/settings.html` ไม่พาออก แต่แสดงโครงหลังบ้าน (เมนูแอดมิน + ป้าย Admin + อีเมลผู้ขาย) พร้อมข้อความ "หน้านี้สำหรับ Super Admin เท่านั้น" (ข้อมูลไม่หลุด เพราะ API ปฏิเสธ) | ทุกหน้าแอดมินพาผู้ที่ไม่ใช่แอดมินกลับหน้าแรกแบบเดียวกัน (`qa.requireAdmin()`) | SA (`payments.html`), PM (`settings.html`) |

**ส่วนของ QA:** ไม่เจอบั๊กในโมดูล QA (สิทธิ์เปิดร้าน, ลงสินค้า, ข้อพิพาท, จัดการผู้ใช้ ผ่านทั้งหมด)

**หมายเหตุ:** API ที่เข้าได้ ใช้เกณฑ์ว่าไม่ได้ `401` / `403` (บาง endpoint ส่ง body ว่างจึงได้ `400` / `404` จาก validation หลังผ่านการตรวจสิทธิ์แล้ว) · หลังเทสคืนสถานะบัญชีทดสอบเป็น `active` แล้ว · ฐานข้อมูลในเครื่องมีข้อมูลเทสปนอยู่ ควรรัน `npm run db:demo` ใหม่ก่อนเดโม

#### เทสซ้ำหลังเพื่อนแก้ (23 พ.ย. 69 รอบเดียว)

ฐานข้อมูลต่อจากเทสข้อ 1–2 · โค้ดที่รวม 19 ไฟล์ที่เพื่อนแก้แล้ว · สคริปต์ Permission ชุดเดิม (token ของแต่ละ role) + เปิดหน้าเว็บจริง

| ส่วน | ตรวจ | ผ่าน | ไม่ผ่าน |
|---|---|---|---|
| API: role × endpoint, บิดของตัวเอง, เจ้าของข้อมูล, Admin vs Super Admin, สถานะบัญชี | 264 | 264 | 0 |
| หน้าเว็บ: Seller เปิดหน้าแอดมินทั้ง 14 หน้า | 14 | 14 | 0 |
| หน้าเว็บ: Guest / Bidder เปิดหน้าแอดมิน / ผู้ขาย / Wallet | 11 | 11 | 0 |
| หน้าเว็บ: Admin / Super Admin ยังเปิดหน้าที่แก้ได้ | 4 | 4 | 0 |
| **รวม** | **293** | **293** | **0** |

| # | ผลเทสซ้ำ | หลักฐาน |
|---|---|---|
| R3-1 | ✅ หายแล้ว | Admin / Super Admin เรียก `GET /api/wallet` และ `GET /api/wallet/transactions` ได้ `403 FORBIDDEN` ทั้ง 4 คำขอ · สมาชิกยังเรียกได้ปกติ |
| R3-2 | ✅ หายแล้ว | Seller เปิดหน้าแอดมินทั้ง 14 หน้า (รวม `payments.html`, `settings.html`) ถูกพากลับหน้าแรกเหมือนกันทุกหน้า · Guest ไปหน้า login พร้อม `?next=` · Bidder กลับหน้าแรก · Admin เปิด `payments.html` ได้ และเปิด `settings.html` ถูกพาไป dashboard (เฉพาะ Super Admin) · Super Admin เปิดได้ทั้งสองหน้า |

**เคสที่สคริปต์ขึ้นไม่ผ่านแต่ไม่ใช่บั๊ก:**
- TC-91 "Admin แบนตัวเอง" ได้ `403 FORBIDDEN` "ไม่สามารถเปลี่ยนสถานะบัญชีของตัวเองได้" สคริปต์ยังคาดหวัง `CANNOT_MODIFY_ADMIN` · ถูกปฏิเสธแบบเดียวกับรอบก่อน (รอบก่อนก็นับผ่าน)
- TC-97 "restricted บิดได้" ได้ `409 ALREADY_LEADING` เพราะ buyer1 เป็นผู้นำสินค้า 20 อยู่แล้วจาก Proxy ที่ตั้งตอนเทสข้อ 1 (ผ่านการตรวจสถานะบัญชีแล้ว) · เทสใหม่บนสินค้าใหม่ → `201` เป็นผู้นำ จึงนับว่าผ่าน

**ส่วนอื่นยังผ่าน:** ไม่มี token → `401` ทุก endpoint · Bidder เรียก API ผู้ขาย / แอดมิน และ Seller เรียก API แอดมิน → `403` · ตั้งค่าระบบ / ปลดแบนเฉพาะ Super Admin · API สาธารณะเปิดได้ทุก role · ผู้ขายบิด / Proxy / Buy Now ของตัวเอง `SELF_BIDDING` · แอดมินบิด `FORBIDDEN` · Order / ข้อพิพาท / สลิป / สินค้า / ที่อยู่ของคนอื่นถูกปฏิเสธ · Admin แก้ Super Admin `CANNOT_MODIFY_ADMIN` · Audit Log ของ Admin เห็นเฉพาะของตัวเอง · pending_verification / restricted / suspended / banned ทำ bid / sell / pay ได้ตามตาราง 0.3 และ D-03 ทุกข้อ

**ส่วนของ QA:** ไม่เจอบั๊กในโมดูล QA

**หมายเหตุ:** หลังเทสคืนสถานะ buyer1 เป็น `active` แล้ว (buyer4 `suspended` เป็นข้อมูลของ `db:demo`, perm… เป็นบัญชีทดสอบ) · ข้อสังเกตเล็กน้อย: หน้า `admin/payments.html` (SA) และ `admin/dashboard.html` (PM) ยังมีลิงก์ "← กลับหน้าเว็บ" ใน sidebar ขณะที่หน้าที่ใช้ `admin-shell.js` เอาออกแล้ว ไม่กระทบสิทธิ์

## 4.Security พื้นฐาน: SQL injection ในช่องค้นหา, XSS ในรายละเอียดสินค้า, อัปโหลดไฟล์ผิดชนิด, เลข บัตรไม่หลุดใน API response

ทดสอบ 23 พ.ย. 69 บน server ที่รันอยู่ (ไม่รีเซ็ตฐานข้อมูล) · **เทส 2 รอบ ผลตรงกันทุกข้อ** · API ยิงด้วยสคริปต์ · XSS เปิดหน้าเว็บจริงทุก role

| ส่วน | รอบ 1 (ผ่าน / ตรวจ) | รอบ 2 (ผ่าน / ตรวจ) | ตรงกันไหม |
|---|---|---|---|
| เลขบัตร / ข้อมูลอ่อนไหวไม่หลุด (24 API ทุก role + DB) | 29 / 29 | 29 / 29 | ✅ |
| SQL injection (ค้นหา 6 endpoint × 6 payload, sort / filter, login) | 44 / 44 | 44 / 44 | ✅ |
| id ใน URL ไม่ใช่ตัวเลข | 2 / 6 | 2 / 6 | ✅ (R4-1) |
| อัปโหลดไฟล์ผิดชนิด (avatar, รูปสินค้า, สลิป, หลักฐานข้อพิพาท × 7 แบบ) + ไฟล์ที่ต้องตรวจสิทธิ์ | 35 / 37 | 35 / 37 | ✅ (R4-2) |
| XSS หน้าเว็บ (23 หน้า × 5 role) | 23 / 23 | 23 / 23 | ✅ |
| **รวม** | **133 / 139** | **133 / 139** | ✅ บั๊กชุดเดียวกัน |

#### ผลแต่ละข้อ

| หัวข้อ | กรณี | ผล |
|---|---|---|
| เลขบัตร | สมัครด้วยเลขบัตรที่รู้ค่า | ✅ response มีแค่ `idCardLast4` |
| | ใน DB | ✅ `id_card_encrypted` ไม่มีเลขเต็ม, `id_card_hash` 64 ตัว, `id_card_last4` ถูก, รหัสผ่านเป็น `scrypt$` |
| | ค้นหาเลขเต็ม / เลข 13 หลัก / `idCardHash` / `passwordHash` / `token_hash` ใน 24 API (โปรไฟล์แอดมิน, ตรวจร้าน, Order, สลิป, ข้อพิพาท, Audit Log, แจ้งเตือน ฯลฯ) ด้วย Guest / สมาชิก / Admin / Super Admin | ✅ ไม่พบเลย แม้เป็น Super Admin |
| | Guest เปิดสินค้า | ✅ ไม่มี `reservePrice` / `maxAmount` |
| SQL injection | `' OR 1=1 --`, `' OR '1'='1`, `"; DROP TABLE listings; --`, `UNION SELECT password_hash`, `SLEEP(3)`, `' OR 1=1 #` ในช่องค้นหาสินค้าและค้นหาของแอดมิน 5 หน้า | ✅ ได้ผลว่าง ไม่มี error SQL ไม่ช้าผิดปกติ ไม่หลุด hash |
| | ใน `sort`, `categoryId`, `minPrice`, `condition`, `action` ของ Audit Log | ✅ ไม่มี error 500 / SQL |
| | login ด้วย `admin' --` และ `' OR '1'='1` | ✅ `INVALID_CREDENTIALS` |
| | หลังยิงทั้งหมด | ✅ ตาราง listings ยังครบ |
| id ไม่ใช่ตัวเลข | `/api/listings/abc`, `/api/orders/abc` | ✅ `400` / `404` |
| | `/api/orders/abc/payment`, `/api/payments/abc/slip`, `/api/admin/payments/abc`, `DELETE /api/auth/sessions/abc` | ❌ R4-1 |
| อัปโหลดไฟล์ | `.exe`, `.svg` (มีสคริปต์), `.gif`, `.pdf`, `.php`, `photo.jpg.exe` ทั้ง 4 จุดอัปโหลด | ✅ `UPLOAD_INVALID_TYPE` |
| | ไฟล์เกิน 5 MB | ✅ `UPLOAD_INVALID` |
| | ไฟล์ข้อความแต่ส่ง Content-Type `image/jpeg` | ❌ R4-2 |
| | เปิด `/uploads/slips/`, `/uploads/evidence/`, `/uploads/shipments/` ตรงๆ และ `/uploads/../.env` | ✅ `404` ไม่หลุดค่าใน `.env` |
| XSS | ใส่ `<img src=x onerror=...>` + `<script>` + `<b>` ใน ชื่อ / รายละเอียด / สิ่งที่ได้รับ / ตำหนิ ของสินค้า, ชื่อร้าน / รายละเอียดร้าน, ชื่อที่แสดง / คำแนะนำตัว, รายละเอียด / ช่องทางติดต่อของข้อพิพาท, ชื่อผู้รับ / ที่อยู่ | ✅ ทุกหน้าแสดงเป็นตัวอักษร ไม่มีสคริปต์ทำงาน ไม่มีแท็กถูกแทรก |
| | หน้าที่เปิด: หน้าแรก, ค้นหา, รายละเอียดสินค้า, โปรไฟล์ร้าน (Guest) · Watchlist, การประมูลของฉัน, แจ้งเตือน + กระดิ่ง, ข้อพิพาท, ที่อยู่, คำสั่งซื้อ (ผู้ซื้อ) · สินค้าของฉัน, แดชบอร์ด, ตั้งค่า, ข้อพิพาท, คำสั่งซื้อ (ผู้ขาย) · อนุมัติสินค้า, รายละเอียดสินค้า, ข้อพิพาท, จัดการผู้ใช้, ตรวจร้าน, คำสั่งซื้อ (แอดมิน) | ✅ 23 หน้า |

#### บั๊กที่เจอ (ทั้ง 2 รอบ)

| # | severity | บั๊ก | ที่ควรเป็น | เจ้าของ |
|---|---|---|---|---|
| R4-1 | medium | id ใน URL ไม่ใช่ตัวเลขได้ 500: `GET /api/orders/abc/payment`, `GET /api/payments/abc/slip`, `GET /api/admin/payments/abc`, `DELETE /api/auth/sessions/abc` (ค่า `NaN` ถูกส่งเข้า SQL `WHERE id = NaN` ไม่ใช่ injection แต่ระบบล้ม) | `400` / `404` ใช้ `utils/parseId.js` แบบ endpoint อื่น | SA |
| R4-2 | low | อัปโหลดไฟล์ข้อความที่ตั้ง Content-Type เป็น `image/jpeg` ผ่าน (รูปโปรไฟล์, รูปสินค้า) เพราะ `upload.js` เช็กแค่ mimetype ที่ client ส่ง ไฟล์ถูกเก็บเป็น `<uuid>.jpg` และเสิร์ฟเป็น `image/jpeg` สคริปต์จึงไม่ทำงาน แต่ไม่มี header `X-Content-Type-Options: nosniff` | ตรวจ magic bytes ของไฟล์ (JPG `FF D8 FF`, PNG `89 50 4E 47`) และเพิ่ม `nosniff` ตอนเสิร์ฟ `/uploads` | PM (`middlewares/upload.js`) |

**ส่วนของ QA:** ไม่เจอบั๊กในโมดูล QA (ลงสินค้า, ข้อพิพาท, ตรวจร้าน, จัดการผู้ใช้ escape ข้อความถูกต้องทุกหน้า) · ผู้ขายเห็นสถานะข้อพิพาทที่เพิ่งเปิดเป็น "กำลังตรวจสอบ" เป็นการออกแบบตามภาพ 38 (`qa-common.js` บรรทัด 44) ไม่ใช่บั๊ก

**หมายเหตุ:** รอบ 1 มีครั้งหนึ่งที่ server ตัดการเชื่อมต่อ (`ECONNRESET`) ตอนเตรียมข้อมูล รันซ้ำแล้วไม่เกิดอีกทั้ง 2 รอบ จึงไม่นับเป็นบั๊ก · ข้อมูลทดสอบ (สินค้า XSS id 25–26, ข้อพิพาท #2, ชื่อร้าน / ชื่อที่แสดงของ seller2, ที่อยู่ของ buyer1) ยังอยู่ในฐานข้อมูล ควรรัน `npm run db:demo` ใหม่ก่อนเดโม

#### เทสซ้ำหลังเพื่อนแก้ (23 พ.ย. 69 รอบเดียว)

ฐานข้อมูลต่อจากเทสข้อ 1–3 · โค้ดที่รวม 19 ไฟล์ที่เพื่อนแก้แล้ว · สคริปต์ Security ชุดเดิม (สมัครผู้ใช้ด้วยเลขบัตรที่รู้ค่า, SQLi, id ไม่ใช่ตัวเลข, อัปโหลด) · XSS ใส่ payload ผ่าน API จริงแล้วเปิดหน้าเว็บจริงทุก role

| ส่วน | ตรวจ | ผ่าน | ไม่ผ่าน |
|---|---|---|---|
| เลขบัตร / ข้อมูลอ่อนไหวไม่หลุด (24 API ทุก role + DB + สมัคร + Guest) | 29 | 29 | 0 |
| SQL injection (ค้นหา 6 endpoint × 6 payload, sort / filter, login) | 44 | 44 | 0 |
| id ใน URL ไม่ใช่ตัวเลข | 6 | 6 | 0 |
| อัปโหลดไฟล์ผิดชนิด (avatar, รูปสินค้า, สลิป, หลักฐานข้อพิพาท) + ไฟล์ที่ต้องตรวจสิทธิ์ | 35 | 35 | 0 |
| XSS หน้าเว็บ (24 หน้า × Guest / ผู้ซื้อ / ผู้ขาย 2 คน / แอดมิน) | 24 | 24 | 0 |
| **รวม** | **138** | **138** | **0** |

| # | ผลเทสซ้ำ | หลักฐาน |
|---|---|---|
| R4-1 | ✅ หายแล้ว | `GET /api/orders/abc/payment`, `GET /api/payments/abc/slip`, `GET /api/admin/payments/abc`, `DELETE /api/auth/sessions/abc` ได้ `400 VALIDATION_ERROR` ทั้ง 4 (เดิม 500) · `/api/listings/abc`, `/api/orders/abc` ยัง 400 |
| R4-2 | ✅ หายแล้ว | ไฟล์ข้อความที่ตั้ง Content-Type เป็น `image/jpeg` ถูกปฏิเสธ `UPLOAD_INVALID_TYPE` ทั้งรูปโปรไฟล์และรูปสินค้า (ตรวจ magic bytes แล้ว) · ทุก response รวม `/uploads` มี `X-Content-Type-Options: nosniff` (`app.js`) · รูป JPG / PNG จริงยังอัปโหลดได้ |

**เคสที่สคริปต์ขึ้นไม่ผ่านแต่ไม่ใช่บั๊ก (5 เคส ตรวจซ้ำแล้ว):**
- "พบเลข 13 หลัก" ใน `/api/sellers/3`, `/api/admin/orders`, `/api/admin/suspicious-flags`, `/api/notifications` คือ timestamp ในชื่อสินค้าทดสอบที่สคริปต์ข้อ 2 สร้าง (เช่น `QA-r23-1795448263932`) ไม่ใช่เลขบัตร · ตรวจซ้ำโดยไม่นับ timestamp → ไม่พบเลขบัตร / hash / token เลย
- "SQLi ใน audit action" ได้ 200 ผลว่าง 0 รายการ (injection ไม่ทำงาน) แต่กฎของสคริปต์หา `ER_` ไปเจอชื่อ action `SELLER_APPROVE` / `USER_STATUS` ในรายการ action ของ response

**ส่วนอื่นยังผ่าน:** response มีแค่ `idCardLast4` · ใน DB เลขบัตรเข้ารหัส / hash 64 ตัว / รหัสผ่าน `scrypt$` · Guest ไม่เห็น `reservePrice` / `maxAmount` · SQLi ทุก payload ได้ผลว่าง ไม่มี error SQL ไม่ช้าผิดปกติ ตาราง listings ยังครบ · login ด้วย `admin' --` ได้ `INVALID_CREDENTIALS` · `.exe`, `.svg`, `.gif`, `.pdf`, `.php`, `photo.jpg.exe` ได้ `UPLOAD_INVALID_TYPE` · เกิน 5 MB ได้ `UPLOAD_INVALID` · เปิด `/uploads/slips/`, `/uploads/evidence/`, `/uploads/shipments/` และ `/uploads/../.env` ตรงๆ ได้ 404
**XSS:** ใส่ `<img src=x onerror=...>` + `<script>` + `<b>` ใน ชื่อ / รายละเอียด / สิ่งที่ได้รับ / ตำหนิ ของสินค้า, ชื่อร้าน / รายละเอียดร้าน, ชื่อที่แสดง / คำแนะนำตัว, รายละเอียด / ช่องทางติดต่อของข้อพิพาท, ชื่อผู้รับ / ที่อยู่ → ทั้ง 24 หน้าไม่มีสคริปต์ทำงาน ไม่มีแท็ก `<img>` / `<b>` ถูกแทรก · 16 หน้าแสดง payload เป็นตัวอักษร (หน้าแรก, ค้นหา, รายละเอียดสินค้า, โปรไฟล์ร้าน, Watchlist, การประมูลของฉัน, ข้อพิพาทมุมผู้ซื้อ, ที่อยู่, ตั้งค่าผู้ขาย, สินค้าของฉัน, แดชบอร์ดผู้ขาย, ตัวอย่างสินค้า, แอดมิน: สินค้า / รายละเอียดสินค้า / รายละเอียดข้อพิพาท / ตรวจร้าน) · อีก 8 หน้าไม่ได้แสดงช่องที่ใส่ payload (แจ้งเตือนของผู้ซื้อ, คำสั่งซื้อ #8 มุมผู้ซื้อ / ผู้ขาย, ข้อพิพาท #2 มุมผู้ขาย, รายการข้อพิพาทผู้ขาย, แอดมิน: รายการข้อพิพาท / ผู้ใช้ / คำสั่งซื้อ)

**ส่วนของ QA:** ไม่เจอบั๊กในโมดูล QA (ลงสินค้า, ข้อพิพาท, ตรวจร้าน, จัดการผู้ใช้ escape ข้อความถูกต้องทุกหน้า)

**หมายเหตุ:** ข้อมูลทดสอบ (สินค้า XSS id 77, ข้อพิพาท #2 บน Order #8, ชื่อร้าน / ชื่อที่แสดงของ seller2, ที่อยู่ของ buyer1 และข้อมูลจากข้อ 1–3) อยู่ในฐานข้อมูล ควรรัน `npm run db:demo` ใหม่ก่อนเดโม

## 5.Real-time test: เปิด 2-3 browser ดูสินค้าเดียวกัน ราคาและเวลาต้องตรงกันทุกจอ

ทดสอบ 23 พ.ย. 69 รอบเดียว · ฐานข้อมูลต่อจากเทสข้อ 1–4 (ไม่รีเซ็ต) · สร้างสินค้าทดสอบใหม่ id 78–81 · เปิดหน้ารายละเอียดสินค้าเดียวกัน 3 แท็บ: Guest 1 แท็บ + buyer1 2 แท็บ · บิดจากหน้าเว็บ (buyer1) และจาก API (buyer2, buyer3 = อีกเครื่อง) · วัดเวลาด้วยตัวบันทึกในแต่ละแท็บ (MutationObserver) · จำลองนาฬิกาเครื่องเร็ว 5 นาทีใน 1 แท็บ · จำลองเน็ตหลุดด้วยการตัด Socket

| ส่วน | ตรวจ | ผ่าน | ไม่ผ่าน |
|---|---|---|---|
| ราคา / จำนวนบิด / ประวัติการบิด | 7 | 5 | 2 |
| เวลา: countdown, นาฬิกาเครื่องผิด, Auto Extend | 3 | 3 | 0 |
| เน็ตหลุดแล้วต่อใหม่ | 1 | 0 | 1 |
| ปิดประมูล / ซื้อทันที | 6 | 4 | 2 |
| **รวม** | **17** | **12** | **5** |

#### ผลแต่ละข้อ

| หัวข้อ | กรณี | ผล |
|---|---|---|
| เริ่มต้น | เปิด 3 แท็บ | ✅ ราคา ฿1,000, 0 การบิด, ต่อเวลา 0/10 ตรงกันทุกแท็บ |
| ราคา | buyer2 บิด ฿1,000 จาก API | ✅ ทุกแท็บเปลี่ยนเองภายใน 156–190 ms: ราคา, "1 การบิด", แถวประวัติ `b***2` |
| | buyer1 กด "บิดทันที" ฿1,100 ในหน้าเว็บ | ✅ แท็บอื่นเปลี่ยนพร้อมกัน (ห่างกัน 1 ms) · แท็บผู้บิดขึ้น "คุณเป็นผู้นำ" และ `b***1 (คุณ)` · คนอื่นเห็นชื่อปิดบัง `b***1` |
| | Guest เห็นช่อง "ราคาที่เสนอ (ขั้นต่ำ …)" หลังมีบิดใหม่ | ❌ RT-4 |
| | buyer3 ตั้ง Proxy ฿2,000 แล้ว buyer2 บิด ฿1,500 | ✅ ทุกแท็บ ฿1,600 "5 การบิด" ผู้นำ `b***3 (auto)` ตรงกับ DB · ป้าย "คุณเป็นผู้นำ" ของ buyer1 หายเมื่อถูกแซง |
| | ประวัติการบิดแบบ real-time เมื่อ 1 คำขอเกิดหลายบิด | ❌ RT-2 |
| | รีเฟรชหน้า | ✅ ประวัติครบ 5 แถว |
| เวลา | countdown 3 แท็บ เทียบเวลาปิดจริง | ✅ ห่างจากเวลาปิดจริงไม่เกิน 1 วินาทีทุกแท็บ (ปัดเป็นวินาที แต่ละแท็บเดินคนละจังหวะ) |
| | แท็บที่นาฬิกาเครื่องเร็ว 5 นาที | ✅ countdown ยังตรงกับแท็บอื่น (ใช้เวลา server จาก `server:time` / `serverTime`) |
| | บิดตอนเหลือ < 2:00 (Auto Extend) | ✅ ทุกแท็บขึ้น "ต่อเวลาอัตโนมัติแล้ว 1/10 ครั้ง" และ countdown ตรงเวลาปิดใหม่ (เวลาบิด + 2 นาที) ภายใน 1 วินาที รวมแท็บนาฬิกาเร็ว |
| เน็ตหลุด | ตัด Socket แท็บ Guest → buyer3 บิด (ต่อเวลาครั้งที่ 2) → ต่อ Socket ใหม่ | ❌ RT-1 |
| ปิดประมูล | ครบเวลา → Scheduler ปิด (`auction:closed`) | ✅ ทุกแท็บขึ้น "การประมูลปิดแล้ว ราคาปิด ฿1,100" ปุ่มบิดถูกปิด |
| | ราคาใหญ่หลังปิด | ❌ RT-3 |
| ซื้อทันที | buyer2 บิดถึงราคาซื้อทันที ฿5,000 (D-15) | ✅ ปุ่ม "ซื้อทันที" หายในแท็บผู้ซื้อทั้งสอง · ❌ RT-4 (Guest ยังเห็น) |
| | buyer3 กดซื้อทันที ฿3,000 จาก API | ✅ ทุกแท็บขึ้น "สินค้านี้ถูกซื้อทันทีแล้ว ราคา ฿3,000" ภายใน 1 วินาที ปุ่มถูกปิด · ❌ RT-3 (ราคา / countdown) |

#### บั๊กที่เจอ

| # | severity | บั๊ก | ที่ควรเป็น | เจ้าของ |
|---|---|---|---|---|
| RT-1 | medium | เน็ตหลุดแล้ว Socket ต่อใหม่ หน้าไม่โหลดข้อมูลใหม่ (`listing.js` `connectSocket()` แค่ `listing:join` อีกครั้ง) บิดที่เกิดระหว่างหลุดหายไป: แท็บนั้นค้าง ฿1,000 / 1 การบิด / ต่อเวลา 1/10 ขณะที่จอจริงเป็น ฿1,100 / 2 การบิด / 2/10 และ countdown ช้ากว่า 22 วินาที → ขึ้น "ปิดประมูลแล้ว / หมดเวลาประมูลแล้ว" และปิดปุ่มบิดก่อนเวลาจริง 17 วินาที (ถ้าเป็นผู้ซื้อจะเสียโอกาสบิดช่วงท้าย) | ตอน `connect` ครั้งที่ 2 ขึ้นไป โหลดข้อมูลสินค้า (5.2) และประวัติใหม่ หรือ server ส่งสถานะล่าสุดตอน `listing:join` | Programmer |
| RT-2 | low | คำขอเดียวที่เกิดหลายบิด (เช่น buyer2 บิด ฿1,500 แล้ว Proxy ของ buyer3 ตอบ ฿1,600) server ส่ง `bid:new` แค่บิดสุดท้าย ประวัติแบบ real-time จึงขาดแถว ฿1,500 ทุกจอ (ขึ้น "5 การบิด" แต่มี 4 แถว) จนกว่าจะรีเฟรช | ส่ง `bid:new` ทุกแถวที่ INSERT หรือ FE โหลดประวัติใหม่เมื่อ `bidCount` เพิ่มมากกว่า 1 | Programmer (`auction.service.js` / `listing.js`) |
| RT-3 | low | หลัง `auction:closed` ราคาใหญ่ไม่เปลี่ยนเป็นราคาปิด (ซื้อทันที: ข้อความ "ราคา ฿3,000" แต่ราคาใหญ่ ฿1,000 ทุกจอ) และ countdown ยังนับต่อ (เหลือ 23:59 ชม.) แม้รีเฟรชแล้ว countdown ก็ยังนับ | `applyClosed()` ตั้งราคาเป็น `finalPrice` แล้ว `paintAll()` · สินค้าที่ปิดแล้วหยุด countdown | Programmer (`listing.js`) |
| RT-4 | low | Guest เห็นฟอร์มบิดแบบปิดใช้งานที่สร้างครั้งเดียวตอนโหลด (`listing.js` บรรทัด 129–135): "ราคาที่เสนอ (ขั้นต่ำ ฿1,000)" ไม่เปลี่ยนเมื่อมีบิดใหม่ (ผู้ซื้อเห็น ฿1,100) และปุ่ม "ซื้อทันที ฿5,000" ยังแสดงแม้ราคาถึงราคาซื้อทันทีแล้ว (D-15) แม้รีเฟรช | อัปเดตฟอร์มของ Guest ใน `paintAll()` และซ่อนปุ่มซื้อทันทีด้วย `isBuyNowAvailable()` | Programmer (`listing.js`) |

**ส่วนของ QA:** ไม่เกี่ยวกับโมดูล QA (หน้ารายละเอียดสินค้าและ Socket ของการบิดเป็นของ Programmer)

**หมายเหตุ:** แท็บในเบราว์เซอร์เดียวกันใช้ token ร่วมกัน จึงโหลด Guest ก่อนแล้วค่อยใส่ token ให้แท็บ buyer1 · "อีกเครื่อง" ใช้การยิง API ด้วย token ของ buyer2 / buyer3 · ข้อมูลทดสอบ (สินค้า 78–81, Order #55 ของ buyer3) อยู่ในฐานข้อมูล ควรรัน `npm run db:demo` ใหม่ก่อนเดโม

## 6.Regression ทุกครั้งที่มี merge เข้า main

## 7.UAT: ให้คนนอกทีม 1-2 คนลองใช้ตามสคริปต์ แล้วเก็บ feedback

ผล TC-116 (24 พ.ย. 69) · คนนอกทีม 1 คน ทดสอบทั้งบทผู้ขายและผู้ซื้อตาม `docs/qa/uat-script.md` ทำจบทุกขั้น · คะแนนความง่าย **3 / 5** · จุดที่ติด: กรอกเลขประจำตัวประชาชนตอนสมัคร ต้องถามทีม 1 ครั้ง · ไม่ได้จับเวลา · PM เห็นชอบใช้เป็นผล UAT (**TC-116 Pass แบบมีข้อสังเกต**)

| # | Feedback | ประเมิน | ผล |
|---|---|---|---|
| F1 | ชำระได้ทีละสินค้า อยากจ่ายรวดเดียวแบบตะกร้า | สินค้าประมูลปิดคนละเวลา มี Order และกำหนดชำระแยกกัน | งานอนาคต (นอกขอบเขต Phase 3) |
| F2 | มีแนบสลิปแต่ไม่มี QR code หรือเลขบัญชีให้โอน | ระบบจ่ายจาก Mock Wallet อย่างเดียว ไม่มีการโอนจริง (D-01) | ปิด · สลิปไม่บังคับแล้ว (#30) ส่วน QR / โอนธนาคารรวมกับ F4 |
| F3 | ยอดใน Wallet พอแล้ว ทำไมยังบังคับแนบสลิป | D-01 เขียนว่าสลิปไม่บังคับ แต่ API 7.6 และโค้ดบังคับ เอกสารขัดกัน | แก้แล้ว #30 · จ่ายได้โดยไม่แนบสลิป แนบภายหลังได้ระหว่างรอตรวจ (7.7) แอดมินตรวจทุกรายการเหมือนเดิม |
| F4 | ควรให้เลือกจ่ายด้วย Wallet หรือสแกน QR / โอนธนาคาร | ขัด D-01 (Mock Wallet ช่องทางเดียว ไม่มี Payment Gateway) | งานอนาคต (นอกขอบเขต Phase 3) |
| F5 | ติดตอนกรอกเลขประจำตัวประชาชน ต้องถามทีม | ระบบตรวจหลักสุดท้ายตามสูตรบัตรจริง ข้อความ error ไม่บอกสาเหตุ | แก้แล้ว #30 · คำอธิบายใต้ช่อง และ error บอกว่าผิดที่ตัวอักษร / จำนวนหลัก / หลักสุดท้าย |

## 8.สรุปรายงานผลการทดสอบ (จำนวน test case, ผ่าน, ไม่ผ่าน, บั๊กแยกตาม severity)

สรุป ณ 24 พ.ย. 69 · อิง Test Case 116 เคสใน `Test_Plan_and_Test_Case_phase3.docx` · นับเฉพาะผลที่ทดสอบจริงในเฟส 3 (ข้อ 1–5 ด้านบน รวมรอบเทสซ้ำหลังเพื่อนแก้ และเทสเพิ่มกลุ่มเงิน + ข้อพิพาทด้านล่าง) · เคสที่ยังไม่ได้รันในเฟสนี้ไม่นับว่าผ่าน แม้เคยผ่านในเฟส 1–2 · ผลรายเคสกรอกไว้ใน `docs/qa/Test_Plan_and_Test_Case_phase3_tested.docx`

**เกณฑ์สถานะ:** Pass = ตรงผลคาดหวังทุกข้อที่ทดสอบ · บางส่วน = ทดสอบแล้วผ่าน แต่ยังไม่ครบทุกขั้นในเคส · Fail = มีข้อที่ไม่ตรงผลคาดหวัง · ยังไม่ทดสอบ = ไม่ได้รันในเฟส 3 · N/A = อยู่นอกขอบเขต

#### ภาพรวม

| สถานะ | จำนวนเคส | % |
|---|---|---|
| ✅ Pass | 115 | 99% |
| 🟡 ผ่านบางส่วน | 0 | 0% |
| ❌ Fail | ไม่มี (Fail เดิม 8 เคส TC-04, 44, 66, 83, 99, 102, 108, 114 แก้บั๊กและเทสซ้ำผ่านแล้ว 24 พ.ย. 69) |
| ⬜ ยังไม่ทดสอบในเฟส 3 | 0 | 0% |
| N/A (รีวิว นอกขอบเขต D-09) | 1 | 1% |
| **รวม** | **116** | **100%** |

ทดสอบแล้ว 115 เคส จาก 115 เคสที่อยู่ในขอบเขต = 100% (ทดสอบครบทุกขั้นในเคส ไม่มีเคสผ่านบางส่วน) · ผ่าน 115 เคส (100% ของที่ทดสอบ) · TC-116 (UAT) ผ่านแบบมีข้อสังเกต PM เห็นชอบ 24 พ.ย. 69 (ดูข้อ 7)

#### แยกตามโมดูล

| โมดูล | เจ้าของ | เคส | Pass | บางส่วน | Fail | ยังไม่ทดสอบ | N/A |
|---|---|---|---|---|---|---|---|
| Auth & ความปลอดภัยบัญชี | SA | 17 | 17 | 0 | 0 | 0 | 0 |
| Settings | PM | 3 | 3 | 0 | 0 | 0 | 0 |
| ลงสินค้า + อนุมัติ + เปิดสิทธิ์ผู้ขาย | QA | 12 | 12 | 0 | 0 | 0 | 0 |
| หน้าแรก / ค้นหา / รายละเอียด / Watchlist | Programmer | 5 | 5 | 0 | 0 | 0 | 0 |
| Auction Engine real-time | Programmer | 29 | 29 | 0 | 0 | 0 | 0 |
| Notification | PM | 4 | 4 | 0 | 0 | 0 | 0 |
| Wallet / Payment | SA | 10 | 10 | 0 | 0 | 0 | 0 |
| Escrow & ค่าธรรมเนียม | SA | 5 | 5 | 0 | 0 | 0 | 0 |
| Shipping & ยืนยันรับ | PM | 7 | 6 | 0 | 0 | 0 | 1 |
| Dispute & บทลงโทษ & จัดการผู้ใช้ | QA | 10 | 10 | 0 | 0 | 0 | 0 |
| Admin Dashboard + Audit Log + ตั้งค่าระบบ | PM | 7 | 7 | 0 | 0 | 0 | 0 |
| ทดสอบรวม Phase 3 | QA | 7 | 7 | 0 | 0 | 0 | 0 |
| **รวม** | | **116** | **115** | **0** | **0** | **0** | **1** |

(จำนวนเคสต่อโมดูลนับจากคอลัมน์ "โมดูล" ในตาราง Test Case จริง ซึ่ง Dispute มี 10 เคสรวม TC-107, 108 ต่างจากตารางสรุปหน้าแรกของเอกสารที่เขียน 8)

#### รายการเคส

| สถานะ | เคส |
|---|---|
| ✅ Pass | 115 เคส (ทุกเคสยกเว้น TC-80 N/A · TC-116 ผ่านแบบมีข้อสังเกต) |
| 🟡 บางส่วน | ไม่มี (24 เคสเดิมทดสอบส่วนที่ขาดครบแล้ว 24 พ.ย. 69) |
| ❌ Fail | ไม่มี (TC-04, 44, 66, 99, 102, 114 แก้บั๊กและเทสซ้ำผ่านแล้ว 24 พ.ย. 69) |
| ⬜ ยังไม่ทดสอบ | ไม่มี |

#### เทสเพิ่ม: กลุ่มเงิน + ข้อพิพาท (24 พ.ย. 69 รอบเดียว)

10 เคสที่ยังไม่ได้รันและกระทบเงิน: TC-61, 62, 64, 66, 69, 72, 73, 84, 85, 107 · ผู้ซื้อสมัครใหม่ผ่าน API 4 คน (คนละเคส) ผู้ขาย = seller1 · ยิง API จริงแล้วตรวจตาราง payments, escrows, wallet_transactions, disputes, notifications, admin_audit_logs · ฐานข้อมูลต่อจากเทสก่อนหน้า (ไม่รีเซ็ต) · server ใช้เวลาจริง (ไม่ย่อ .env)

| เคส | ผล | หลักฐาน |
|---|---|---|
| TC-61 ยอดไม่พอ | ✅ | Wallet 1,000 Order 3,250 → หน้าชำระ shortfall 2,250 · จ่ายตรงได้ `INSUFFICIENT_BALANCE` `details.shortfall` 2,250 · ไม่หักเงิน ไม่มีแถวใหม่ใน payments / wallet_transactions · Order ยัง pending_payment นาฬิกา 48 ชม. ไม่เปลี่ยน |
| TC-62 จ่ายซ้ำ | ✅ | ยิงชำระ 3 request พร้อมกัน → 201 แค่ 1 ที่เหลือ `PAYMENT_ALREADY_SUBMITTED` · หักเงินครั้งเดียว 3,250 payment 1 แถว · กดซ้ำหลังสำเร็จก็ได้ 409 |
| TC-64 แทนสลิป | ✅ | แทนสลิปพร้อมยอด / เวลาโอน / REF001 → 200 บันทึกครบ ยัง pending_review · .pdf / .gif `UPLOAD_INVALID_TYPE` · ไม่แนบ `SLIP_REQUIRED` · payment ที่ rejected แล้ว `INVALID_STATE` · คนอื่น POST / GET สลิปได้ 404 · ผู้จ่ายและแอดมินเปิดได้ · `/uploads/slips/...` ตรงๆ ได้ 404 |
| TC-66 ปฏิเสธสลิป | ❌ MN-1 | ไม่ใส่เหตุผล `REASON_REQUIRED` · ใส่เหตุผล → rejected คืน 9,000 (`payment_refund`) audit `PAYMENT_REJECT` ผู้ซื้อชำระใหม่ได้ ✅ · **แจ้งเตือนผู้ซื้อไม่มีเหตุผล** |
| TC-69 Escrow + ยอดรอรับ | ✅ | อนุมัติแล้ว escrow held 3,250 fee / net ยัง NULL · ผู้ขาย `pendingIncome` เพิ่ม 3,090 (3,250 − 160) balance ไม่เปลี่ยน · 7.3 มีรายการ held · ไม่มี API ถอนเงิน (404) |
| TC-72 ปล่อยเงินซ้ำไม่ได้ | ✅ | ข้อพิพาทเปิด: ยืนยันรับได้ `DISPUTE_OPEN` และ autoRelease (ตั้ง `auto_release_at` เลยกำหนด) ไม่ปล่อย · ยืนยันรับ 2 ครั้งพร้อมกัน + autoRelease 2 ครั้งคู่ขนาน → สำเร็จ 1 (อีกครั้ง `INVALID_STATE`) fee 160 ตั้งครั้งเดียว `sale_proceeds` 1 รายการ ผู้ขาย +3,090 ครั้งเดียว |
| TC-73 ข้อพิพาท → คืนเงิน | ✅ | เปิดข้อพิพาทแล้ว Order disputed Escrow ยัง held · ยืนยันรับ `DISPUTE_OPEN` · ตัดสินคืน → Escrow refunded มี refunded_at fee NULL ผู้ขายไม่ได้เงิน |
| TC-84 ตัดสินคืนเงิน | ✅ | รายละเอียดมีไทม์ไลน์ + หลักฐาน · adminNote ว่าง `NOTE_REQUIRED` สถานะไม่เปลี่ยน · refund_buyer → `{ closed, cancelled, refunded }` คืน 3,250 (`escrow_refund`) cancel_reason dispute_refund บันทึก resolved_by / resolved_at / admin_note · audit `DISPUTE_RESOLVE` · ทั้งสองฝ่ายได้ `DISPUTE_RESOLVED` ผู้ซื้อได้ `REFUNDED` |
| TC-85 ตัดสินปล่อยเงิน | ✅ | release_seller → `{ closed, completed, released }` fee 160 net 3,090 ผู้ขาย +3,090 · audit + แจ้งเตือน · ตัดสินซ้ำ `INVALID_STATE` · Bidder เรียก `FORBIDDEN` |
| TC-107 เปลี่ยนสถานะข้อพิพาท | ✅ | awaiting_evidence → investigating → refund_in_progress ได้ `{ id, status }` ทุกขั้น · closed / xxx `VALIDATION_ERROR` · ผู้ซื้อและผู้ขายได้ `DISPUTE_UPDATED` ขั้นละ 1 audit `DISPUTE_STATUS` 3 รายการ · `GET /api/disputes?status=active` เห็น myRole + counterparty · แอดมิน `?status=active` ไม่มีเคสที่ปิด เรียงเก่าสุดก่อน |
| ยอดรวม D-10 | ✅ | หลังเทส 118,604.95 + Escrow 4,450 + รอตรวจ 26,050 + ค่าธรรมเนียม 895.05 = 150,000 = เครดิตแรกเข้า · ทุก Wallet ตรงกับ ledger |

| # | severity | บั๊ก | ที่ควรเป็น | เจ้าของ |
|---|---|---|---|---|
| MN-1 | medium | แอดมินปฏิเสธสลิปแล้ว ผู้ซื้อได้แจ้งเตือน `REFUNDED` "฿9,000 เข้า Mock Wallet (#ORD-65)" อย่างเดียว ไม่บอกว่าสลิปถูกปฏิเสธ ไม่มีเหตุผล และลิงก์ไปหน้า Wallet · `payment.service.js` ส่ง `reason` มาแล้ว แต่ template `REFUNDED` ใน `notificationTemplates.js` ไม่ใช้ ผู้ซื้ออาจไม่รู้ว่าต้องชำระใหม่ในเวลาที่เหลือ แล้วโดนยกเลิก + บทลงโทษ `non_payment` | ข้อความบอกว่าการชำระถูกปฏิเสธ พร้อมเหตุผล และลิงก์ไปหน้าชำระของ Order นั้น (TC-66 "ได้รับแจ้งเตือนพร้อมเหตุผล") · ถ้าจะแยกเป็น event ใหม่ต้องให้ SA เพิ่มใน api-spec หัวข้อ 11 | PM (`notificationTemplates.js`) |

**หมายเหตุ:** สคริปต์ขึ้น FAIL ที่ TC-72 เพราะสคริปต์หา `sale_proceeds` ด้วย `reference_type = 'escrow'` แต่ระบบเก็บเป็น `order` ตรวจซ้ำแล้วมี 1 รายการ 3,090 ถูกต้อง จึงนับผ่าน (แก้สคริปต์แล้ว) · ข้อมูลทดสอบ (ผู้ใช้ m…, Order 65–69) อยู่ในฐานข้อมูล ควรรัน `npm run db:demo` ใหม่ก่อนเดโม

#### ซ้อมเดโม flow ผู้ขาย + ผู้ซื้อผ่านหน้าเว็บเต็มรอบ (24 พ.ย. 69)

ฐานข้อมูลใหม่จาก `npm run db:demo` · บัญชีสมัครใหม่ผ่านหน้าสมัครทั้งผู้ขายและผู้ซื้อ · สลับ role ด้วยหน้า login · กดหน้าเว็บทุกขั้น ยกเว้นคู่แข่ง 1 บิด (buyer2 ยิง API แทนอีกเครื่อง) และเร่งเวลาปิดด้วย `node scripts/demo-ending.js 25 0.5` ตามที่โปรเจกต์เตรียมไว้

| ขั้น | ผล |
|---|---|
| ผู้ขายสมัคร → OTP (จาก console) → Wallet ฿10,000 → กดลิงก์ยืนยันอีเมล | ✅ |
| เพิ่มที่อยู่ → ยื่นเปิดร้าน → "รอแอดมินตรวจสอบ" | ✅ · QA-1 (แก้แล้ว) |
| แอดมิน login → ไป dashboard → "ตรวจร้านค้า" → อนุมัติ | ✅ |
| ผู้ขาย login มีเมนู "ผู้ขาย" → ลงสินค้า 4 ขั้น (รูป, ค่าส่ง 60, ราคาเริ่ม 1,000, Reserve 1,200, 1 วัน) ตัวอย่างรายได้ ฿50 / สุทธิ ฿950 → ส่งตรวจ | ✅ |
| แอดมิน "อนุมัติสินค้า" → เริ่มประมูลทันที | ✅ |
| ผู้ซื้อสมัคร → OTP → ค้นหาจาก navbar เจอ → เพิ่ม Watchlist → ตั้ง Proxy ฿1,500 (กล่องยืนยัน) → ราคาขึ้นเป็น Reserve ฿1,200 (D-14) | ✅ (ดูหมายเหตุ) |
| คู่แข่งบิด ฿1,300 → Proxy ตอบ ฿1,400 จอผู้ซื้อยังเป็นผู้นำ | ✅ |
| ครบเวลา → Scheduler ปิด → "การประมูลปิดแล้ว ราคาปิด ฿1,400" → "รายการที่ชนะ" มีปุ่มชำระเงิน | ✅ |
| หน้าชำระ ฿1,460 → เพิ่มที่อยู่ผ่านลิงก์ (มีลิงก์กลับ) → เลือกที่อยู่ → แนบสลิป → ชำระ → Wallet ฿8,540 countdown หยุด | ✅ |
| แอดมิน "การเงิน" → อนุมัติเข้า Escrow | ✅ |
| ผู้ขาย "รอจัดส่ง" → บันทึกจัดส่ง ไปรษณีย์ไทย EE987654321TH | ✅ |
| ผู้ซื้อเห็นเลขพัสดุ → ยืนยันรับ (กล่องยืนยัน) → "คำสั่งซื้อเสร็จสมบูรณ์" | ✅ |
| ผู้ขาย ฿11,390 (10,000 + 1,460 − ค่าธรรมเนียม 70) · ยอดรวม 81,495 + 4,860 + 3,260 + 385 = 90,000 = เครดิตแรกเข้า · แจ้งเตือน 10 รายการครบทุกขั้น · ไม่มี error ใน console ของเบราว์เซอร์และ log ของ server | ✅ |

| # | severity | ปัญหา | ที่ควรเป็น | เจ้าของ |
|---|---|---|---|---|
| QA-1 | low | หน้าเปิดร้าน ลิงก์ "เพิ่มที่อยู่ก่อน" ไป `settings.html#addresses` โดยไม่มี `?next=` เพิ่มที่อยู่แล้วไม่มีทางกลับหน้าเปิดร้าน (แบบเดียวกับ R5-5 ที่แก้ในหน้าชำระแล้ว) | ส่ง `?next=/pages/seller/open-shop.html` · ✅ **แก้แล้ว 24 พ.ย. 69**: ลิงก์ "เพิ่มที่อยู่ก่อน" (`open-shop.js`) และ "จัดการสมุดที่อยู่" (`open-shop.html`) ส่ง `?next=` แล้ว เทสด้วยบัญชีใหม่ที่ไม่มีที่อยู่: กดลิงก์ → แท็บที่อยู่ → เพิ่ม → "← กลับไปหน้าก่อนหน้า" → กลับหน้าเปิดร้าน ที่อยู่ใหม่ถูกเลือกให้อัตโนมัติ | QA (`js/seller/open-shop.js`) |

**หมายเหตุ:** ตอนตั้ง Proxy เบราว์เซอร์ของ Claude ถูกซ่อน (pane hidden) กล่องยืนยันปิดพร้อม `returnValue = "confirm"` แต่ event `close` ไม่ถูกส่ง หน้าจึงไม่ส่งคำขอ ต้องสั่ง event `close` เองแทนเบราว์เซอร์ แล้วโค้ดของหน้าส่ง `PUT /proxy` และแสดงผลตามปกติ · ข้อ 1 (pane เปิดอยู่) ปุ่มเดียวกันทำงานเองได้ จึงไม่นับเป็นบั๊ก แต่ควรกดเองบนเครื่องจริงอีกครั้งก่อนเดโม · ประวัติแบบ real-time ไม่มีแถว ฿1,300 ของคู่แข่ง และแถว ฿1,400 ของผู้ซื้อไม่มี "(คุณ)" จนกว่าจะรีเฟรช (RT-2 เดิม)

#### เทสเพิ่ม: เคสที่ยังไม่ได้รัน 21 เคส (24 พ.ย. 69 รอบเดียว)

ยิง API จริงด้วยผู้ใช้สมัครใหม่ (~70 คน) + เปิดหน้าเว็บสำหรับกระดิ่งแจ้งเตือนและกราฟแดชบอร์ด · เวลาหมดอายุ OTP / ลิงก์รีเซ็ตทดสอบโดยตั้ง `expires_at` ใน DB ให้เหลือ / เลย 1 วินาที–1 นาที แทนการรอจริง · TC-58 ตั้ง SMTP ใน `.env` ไปพอร์ตที่ปิดชั่วคราวแล้วคืนค่าเดิม · TC-94 คืนค่าธรรมเนียมเป็น 5% / 20 บาทหลังเทส · ยอดรวม D-10 หลังเทส 860,000 = เครดิตแรกเข้า

| เคส | ผล | สรุป |
|---|---|---|
| TC-03 สมัครซ้ำ / blacklist | ✅ | `PHONE_TAKEN`, `ID_CARD_TAKEN`, `BLACKLISTED` (เบอร์และเลขบัตร) ไม่มีบัญชีใหม่ |
| TC-04 รูปแบบข้อมูลสมัคร | ❌ AU-1, AU-2 | รูปแบบอีเมล / เบอร์ / ชื่อผู้ใช้ผิดถูกปฏิเสธ (`details.field` ระบุช่อง) · ชื่อผู้ใช้ตัวพิมพ์ใหญ่สมัครได้ · ชื่อ-นามสกุลว่าง / ช่องว่างล้วนสมัครได้ |
| TC-05 รหัสผ่าน / เลขบัตร | ✅ | `WEAK_PASSWORD` 4 แบบ · `INVALID_ID_CARD` 4 แบบ |
| TC-08 OTP หมดอายุ / ส่งใหม่ | ✅ | ก่อนหมด 1 วินาทีผ่าน · หลังหมด `OTP_EXPIRED` · ส่งใหม่ก่อน 60 วินาที `OTP_RESEND_TOO_SOON` · ชุดเก่าใช้ไม่ได้ |
| TC-13 ลืมรหัสผ่าน | ✅ | ลิงก์อายุ 30 นาที token เป็น hash · รหัสใหม่ใช้ได้ รหัสเก่าไม่ได้ · session เดิม 2 อุปกรณ์ 401 |
| TC-14 ลิงก์รีเซ็ตหมดอายุ | ✅ | เหลือ 1 นาทีใช้ได้ · เลย 1 นาที `TOKEN_EXPIRED` · ลิงก์ที่ใช้แล้ว `TOKEN_INVALID` · รหัสอ่อน `WEAK_PASSWORD` ลิงก์ยังไม่ถูกใช้ |
| TC-15 เปลี่ยนรหัสผ่าน | ✅ | `WRONG_PASSWORD`, `WEAK_PASSWORD`, สำเร็จแล้ว session อื่นหลุด session ปัจจุบันยังใช้ได้ |
| TC-28 สถานะสินค้า | ✅ | draft ไม่โผล่ให้ Guest · แก้ / ยกเลิกได้เฉพาะก่อน active · แท็บ rejected มีเหตุผล |
| TC-31 ปฏิเสธสินค้า | ✅ | เหตุผล < 5 ตัว `REASON_REQUIRED` · ปฏิเสธแล้วแจ้งเตือนพร้อมเหตุผล + audit · แก้แล้วส่งใหม่ได้ (ข้อมูลทดสอบ "ไม่ชัด" ระบบนับ 6 ตัวอักษร จึงผ่านเกณฑ์ ไม่ใช่บั๊ก) |
| TC-40 บิดสินค้าที่ไม่ active | ✅ | draft / pending_review / rejected / cancelled `NOT_FOUND` · ended `AUCTION_NOT_ACTIVE` · หมดเวลา `AUCTION_ENDED` · ไม่มีแถวใน bids |
| TC-42 บิดเกินยอด Wallet | ✅ | 10,000 / 10,001 ผ่านทั้งคู่ Wallet ไม่เปลี่ยน (D-06) |
| TC-43 บิดพร้อมกัน | ✅ | 1,100 พร้อมกันสำเร็จ 1 · 12 คนพร้อมกันราคาถูกต้อง ไม่ซ้ำ · Buy Now ชนบิด มี Order เดียว |
| TC-55 กระดิ่งแจ้งเตือน | ✅ | unreadCount ตรง DB · อ่านแล้วลด 1 · อ่านของคนอื่น 404 · ถูกแซงแล้วกระดิ่ง 0 → 1 ทันที (หน้าเว็บ) |
| TC-57 ตั้งค่าแจ้งเตือน | ✅ | ปิดการประมูลแล้วไม่ได้ OUTBID แต่ได้การเงิน · ปิดอีเมลการเงินแล้วมีในเว็บ ไม่ส่งอีเมล |
| TC-58 อีเมลส่งไม่ได้ | ✅ | ธุรกรรมสำเร็จ แจ้งเตือนในเว็บบันทึก log `[notify] … failed: connect ECONNREFUSED` |
| TC-89 แดชบอร์ด | 🟡 | การ์ด 9 ค่าตรงกับ DB · กราฟ 3 ช่วงครบ · หน้าเว็บวาด 4 กราฟ · ยังไม่ได้ทดสอบ empty state (ต้องล้างฐานข้อมูล) |
| TC-94 ตั้งค่าค่าธรรมเนียม | ✅ | 3% / 30 บาทใช้กับ Order ใหม่ (ค่าธรรมเนียม 60) Order เดิมคงค่าเดิม · ค่าผิด `INVALID_SETTING` · audit มี from / to |
| TC-95 / 96 ตัวอย่างอัลกอริทึม Proxy | ✅ | ตรงทุกข้อ (a)–(d) และ E1–E6 |
| TC-99 Proxy / บิดพร้อมกัน | ❌ R2-3 | (a) 20 คนพร้อมกันถูกต้อง · (b) 2 คนบิดพร้อมกันช่วงท้ายต่อเวลา 1 ครั้ง (คาดหวัง 2) |
| TC-116 UAT | ✅ | คนนอกทีม 1 คนทำจบทั้งบทผู้ขายและผู้ซื้อ คะแนนความง่าย 3/5 ผ่านแบบมีข้อสังเกต PM เห็นชอบ (feedback F1–F5 ดูข้อ 7) |

| # | severity | บั๊ก | ที่ควรเป็น | เจ้าของ |
|---|---|---|---|---|
| AU-1 | low | สมัครด้วยชื่อผู้ใช้มีตัวพิมพ์ใหญ่ "WanPhut01" ได้ 201 และเก็บตามนั้น | API 1.2 กำหนด `a-z 0-9 _` → `VALIDATION_ERROR` (หรือแปลงเป็นตัวพิมพ์เล็กก่อนเก็บ) | SA (`auth.service.js`) |
| AU-2 | medium | สมัครโดยเว้นชื่อ-นามสกุลว่าง หรือใส่ช่องว่างล้วน ได้ 201 สร้างผู้ใช้ชื่อว่าง (แอดมินตรวจร้าน / จัดการผู้ใช้จะเห็นชื่อว่าง) | ชื่อ-นามสกุลเป็นช่องบังคับ (ข้อ 2.2-1) → `VALIDATION_ERROR` และ trim ก่อนตรวจ | SA (`auth.service.js`) |

**R2-3 เดิม:** TC-99 (b) คาดหวัง `extend_count = 2` เมื่อ 2 คนบิดสำเร็จพร้อมกันตอนเหลือ 1 นาที แต่ได้ 1 เพราะบิดที่ 2 ตามมาในวินาทีแรกหลังต่อเวลา (เวลาปิดใหม่ถูกปัดขึ้นเป็นวินาทีเต็ม) เวลาปิดยังเป็นอย่างน้อยเวลาบิดที่ 2 + 2 นาที · เคยเสนอให้ปิดเรื่อง แต่เคสนี้ใน Test Case ไม่ผ่าน จึงต้องให้ Programmer แก้หรือให้ PM เห็นชอบปรับผลคาดหวัง

**เคสที่สคริปต์ขึ้นไม่ผ่านแต่ไม่ใช่บั๊ก:** TC-13 อายุลิงก์ 1,801 วินาที (ปัดวินาที = 30 นาที) · TC-89 Order รอชำระ API 7 / DB 8 เพราะ API แยกรายการที่มีสลิปรอตรวจไปนับเป็น `paymentReview` ตาม spec · TC-57 ครั้งแรกเช็กก่อนแจ้งเตือนถูกบันทึก (notify ทำหลัง commit) และสคริปต์สร้างผู้ใช้ไม่มีที่อยู่ ตรวจซ้ำแล้วผ่าน

#### เทสส่วนที่ขาดของ 24 เคสผ่านบางส่วน (24 พ.ย. 69 รอบเดียว)

ยิง API จริง 149 ข้อ (ผู้ใช้สมัครใหม่ทุกเคส) + กดหน้าเว็บ (กล่องยืนยันบิด / ซื้อทันที, ฟอร์มข้อพิพาทแนบ 2 รูป, validation หน้าลงสินค้า / สมุดที่อยู่, ตัวอย่างรายได้หลังแก้ค่าธรรมเนียม) + ไล่เปิด 41 หน้า (51 คู่หน้า × role) ที่จอ 1280 และ 375 px · TC-89 empty state ทดสอบบนฐานข้อมูลว่าง (`npm run db:init`) แล้วคืนด้วย `npm run db:demo` · ค่าธรรมเนียมคืนเป็น 5% / 20 บาทแล้ว

**ผล:** ผ่าน 22 เคส · ไม่ผ่าน 2 เคส (TC-83, TC-108 ทั้งคู่เป็นโมดูลของ QA) → QA แก้ QA-2, QA-3 แล้วเทสซ้ำผ่านทั้ง 2 เคส (24 พ.ย. 69)

| เคส | ส่วนที่เพิ่งทดสอบ | ผล |
|---|---|---|
| TC-07 | กรอก OTP เดิมซ้ำ | ✅ `ALREADY_VERIFIED` used_at ถูกตั้ง |
| TC-10 | login อีเมล / ชื่อผู้ใช้ที่ไม่มี | ✅ `INVALID_CREDENTIALS` ข้อความเหมือนกันทุกกรณี |
| TC-18 | อัปโหลด / ลบรูปโปรไฟล์ แก้ชื่อที่แสดง / bio 2.11 และส่ง email / phone | ✅ |
| TC-19 | ตั้ง / เปลี่ยนค่าเริ่มต้น แก้ ลบ + validation หน้าเว็บ | ✅ |
| TC-20 | แก้ที่อยู่หลังสั่งซื้อ | ✅ Order ยังเป็นที่อยู่เดิม |
| TC-23 / 24 | เว้นว่างทุกช่องบังคับ ราคา / Reserve / Buy Now / ระยะเวลาครบชุด ทั้งหน้าเว็บและ API | ✅ |
| TC-29 | แก้ / เพิ่ม / ลบรูป / ยกเลิกสินค้าที่มีคนบิด + หน้าเว็บ | ✅ `INVALID_STATE` และหน้าเว็บ "ล็อกการแก้ไข" |
| TC-34 | ตัวกรองทุกแบบ รวมค่าขอบ AND เรียง 4 แบบ แบ่งหน้า query ผิด | ✅ |
| TC-36 | เพิ่มซ้ำ ดูรายการ ลบ | ✅ |
| TC-45 | Proxy เกินยอด Wallet + ผู้อื่น / ผู้ขายไม่เห็นวงเงิน | ✅ |
| TC-50 | กดยกเลิกในกล่องซื้อทันที (หน้าเว็บ) ซื้อซ้ำ สินค้าไม่เปิด Buy Now | ✅ |
| TC-77 | ยืนยันรับก่อนจัดส่ง ยืนยันซ้ำ | ✅ |
| TC-81 | เปิดข้อพิพาทผ่านหน้าเว็บแนบ 2 รูป + รายละเอียดสั้น | ✅ |
| TC-82 | เปิดหลังปล่อยเงิน เปิดซ้ำ | ✅ |
| TC-83 | ผู้ขายส่งหลักฐานจริง ไฟล์ผิดชนิด เปิดรูปผ่าน 9.7 ทุกฝ่าย | ✅ หลังแก้ QA-3 (เดิม ❌) |
| TC-88 | detectShill + หน้า "บิดน่าสงสัย" + ตรวจแล้ว | ✅ |
| TC-89 | empty state | ✅ ทั้ง 4 กราฟขึ้น "ยังไม่มีข้อมูลในช่วงเวลานี้" |
| TC-93 | ครบ 13 action + กรอง / เรียง + แก้ / ลบ log ไม่ได้ | ✅ |
| TC-105 | ไม่อนุมัติ ยื่นใหม่ บัญชีที่ถูกแบน Bidder เรียก API | ✅ |
| TC-106 | กล่องยืนยันบิด ≥ 2 เท่า (a)–(e) ยกเลิก / ยืนยัน | ✅ |
| TC-108 | ค้นหาสมาชิก โปรไฟล์ เปลี่ยนสถานะ ปลดแบน | ✅ หลังแก้ QA-2 (เดิม ❌) |
| TC-109 | ตัวอย่างรายได้หลังแก้ค่าธรรมเนียม | ✅ เปลี่ยนเป็น 3% / 30 ทันที |
| TC-115 | ทุกหน้าทุก role ที่ 1280 / 375 px | ✅ ไม่มี scroll แนวนอน ไม่มี error ใน log server |

| # | severity | บั๊ก | ที่ควรเป็น | เจ้าของ |
|---|---|---|---|---|
| QA-2 | low | ค้นหาสมาชิกของแอดมิน (10.1) ส่งเบอร์เต็ม 10 หลัก เช่น `0821946222` | API 10.1 กำหนดให้ปิดบางส่วน เช่น `082****222` (หน้าโปรไฟล์ 10.2 แสดงเต็มได้) | QA (`admin.user.service.js`) · ✅ แก้แล้ว: 10.1 ส่งเบอร์ `091-***-5044` (ค้นหาด้วยเบอร์เต็มยังเจอ) 10.2 ยังเต็ม |
| QA-3 | low | คนนอกส่งหลักฐานข้อพิพาท (9.3) ได้ `404 NOT_FOUND` แต่ Test Case TC-83 คาดหวัง `403 FORBIDDEN` · api-spec 9.3 ไม่ได้กำหนด error นี้ และ 404 สอดคล้องกับ 9.2 / 9.7 (ไม่บอกว่ามีข้อพิพาทนี้) | เลือกทางเดียว: แก้ Test Case เป็น 404 (แนะนำ) หรือแก้โค้ดเป็น 403 | QA (`dispute.service.js`) · ✅ แก้แล้ว: เลือกแก้โค้ด คนนอกส่งหลักฐานได้ `403 FORBIDDEN` แบบเดียวกับเปิดข้อพิพาท 9.1 ส่วนการอ่าน 9.2 / 9.7 ยัง 404 ไม่ต้องแก้ Test Case |

**ข้อสังเกต (ไม่ใช่บั๊ก):** TC-19 ลบที่อยู่อันสุดท้ายได้เมื่อไม่มี Order ค้างชำระ ตรง spec 2.7 (ถ้ามี Order ค้างชำระได้ `LAST_DEFAULT_ADDRESS`)

#### เทสซ้ำ 8 บั๊กที่เพื่อนแก้รอบล่าสุด (fixupdate-rakadee.zip · 24 พ.ย. 69 รอบเดียว)

ไฟล์ที่เปลี่ยน 6 ไฟล์: `auth.service.js` + `register.html` (SA: AU-1, AU-2) · `notificationTemplates.js` + `payment.service.js` (PM / SA: MN-1) · `auction.service.js` + `listing.js` (Programmer: R2-3, RT-1 ถึง RT-4) · ไฟล์อื่นในโปรเจกต์ตรงกับของเดิมทุกไฟล์ (รวม QA-1, QA-2, QA-3 และ `.env`)

| บั๊ก | เจ้าของ | วิธีเทส | ผล |
|---|---|---|---|
| AU-1 | SA | สมัคร "WanPhut…" · สมัครซ้ำด้วยตัวเล็ก / ตัวใหญ่ล้วน · ชื่อมีช่องว่าง / สั้น / ยาว / ภาษาไทย | ✅ เก็บเป็นตัวพิมพ์เล็ก ซ้ำได้ `USERNAME_TAKEN` รูปแบบผิดได้ `VALIDATION_ERROR` |
| AU-2 | SA | ชื่อ-นามสกุล ว่าง / ช่องว่างล้วน / 1 ตัว / ไม่ส่ง / ไม่ใช่ข้อความ / 151 ตัว · ช่องว่างซ้อน | ✅ ได้ `VALIDATION_ERROR` field `fullName` ทุกกรณี · "␣␣สมชาย␣␣␣␣ใจดี␣␣" เก็บเป็น "สมชาย ใจดี" |
| MN-1 | PM | แอดมินปฏิเสธสลิปพร้อมเหตุผล "ยอดเงินไม่ตรง" | ✅ หัวข้อ "การชำระเงินถูกปฏิเสธ" ข้อความมีเหตุผล + กำหนดชำระใหม่ ลิงก์ `/pages/payment.html?orderId=…` · คืนเงินจากข้อพิพาทยังเป็น "ได้รับเงินคืน" |
| R2-3 | Programmer | บิดที่ 2 ทันทีหลังต่อเวลา / รอ 1.5 วินาที อย่างละ 5 ครั้ง · Proxy ชนช่วงท้าย | ✅ ต่อเวลา 5/5 ทั้งสองแบบ · extend_count 1 → 2 |
| RT-1 | Programmer | ตัด Socket หน้า Guest → บิด + ต่อเวลาระหว่างหลุด → ต่อใหม่ | ✅ ราคา ฿3,000 → ฿3,100 ขั้นต่ำ ประวัติ 5 → 6 แถว countdown 1:45 (จริง 1:46) อัปเดตเองไม่ต้องรีเฟรช |
| RT-2 | Programmer | ผู้ซื้อ 1 ตั้ง Proxy · ผู้ซื้อ 2 บิดจน Proxy ตอบในคำขอเดียว | ✅ ขึ้นครบ 3 แถว (฿1,000 auto · ฿1,500 · ฿1,550 auto) ไม่ต้องรีเฟรช |
| RT-3 | Programmer | Guest เปิดหน้าไว้ → ซื้อทันที / หมดเวลาปิดเอง | ✅ ราคาใหญ่ ฿1,200 → ฿3,000 (ราคาปิด) countdown หยุดที่ 00 · ปิดตามเวลาขึ้น "การประมูลปิดแล้ว ราคาปิด ฿3,100" |
| RT-4 | Programmer | Guest เปิดหน้าไว้ → บิดใหม่ → บิดถึงราคาซื้อทันที → รีเฟรช · ยิง buy-now หลังราคาถึง | ✅ ขั้นต่ำ ฿1,000 → ฿1,600 → ฿3,050 ปุ่ม "ซื้อทันที" หายทันทีและหลังรีเฟรช · buy-now ได้ `BUY_NOW_NOT_AVAILABLE` ไม่มี Order |

**Regression:** กลุ่มเงิน + ข้อพิพาท 49 ข้อผ่าน (ยอด D-10 ตรง 110,000) · Boundary การบิด / Auto Extend / Proxy / Reserve / ค่าธรรมเนียม 40 ข้อ ผ่าน 39 ข้อ ข้อที่ขึ้นไม่ผ่านคือ TC-48 "2:01" ซึ่งไม่ใช่บั๊ก (ดูด้านล่าง) · server ไม่มี error

**ข้อสังเกต (ไม่ใช่บั๊ก) PM รับทราบแล้ว 24 พ.ย. 69 เพิ่มใน D-16:** หลังแก้ R2-3 ระบบนับเวลาที่เหลือเป็นวินาทีเต็มเหมือน countdown บนจอ เหลือ ≥ 121 วินาที (จอ 02:01) ไม่ต่อเวลา 6/6 · เหลือ 120.9 วินาที (จอ 02:00) ต่อเวลา · สคริปต์เดิมตั้ง "2:01" ไว้ที่ระดับวินาที ตอนบิดจริงเหลือ 120.9 วินาที จึงขึ้นไม่ผ่าน · ผลคาดหวัง TC-48 / TC-98 ยังถูก ถ้าอ่าน "2:01" เป็นเวลาที่แสดงบนจอ

#### บั๊กที่เจอในเฟส 3 แยกตาม severity

| severity | เจอ | แก้แล้ว (เทสซ้ำผ่าน) | ยังเปิด | รายการ |
|---|---|---|---|---|
| high | 2 | 2 | **0** | R5-1, R2-1 |
| medium | 6 | 6 | **0** | R5-2, R5-3, R4-1, RT-1, MN-1, AU-2 |
| low | 16 | 16 | **0** | R5-4, R5-5, R5-6, R5-7, R2-2, R2-3, R3-1, R3-2, R4-2, RT-2, RT-3, RT-4, AU-1, QA-1, QA-2, QA-3 |
| **รวม** | **24** | **24** | **0** | |

บั๊กที่ยังเปิด: ไม่มี (Programmer, SA, PM, QA แก้ครบทุกตัว เทสซ้ำผ่าน 24 พ.ย. 69)

#### เทียบเกณฑ์ผ่าน Phase 3 (Test Plan ข้อ 4.3–4.4)

| เกณฑ์ | ผล |
|---|---|
| บั๊ก severity high เป็นศูนย์ | ✅ (high 2 ตัวแก้และเทสซ้ำผ่านแล้ว) |
| เดโม flow ผู้ขายและผู้ซื้อ (ข้อ 1.1-6) ได้ครบในรอบเดียว | ✅ TC-110, TC-111 ผ่าน API และซ้อมผ่านหน้าเว็บเต็มรอบบน `db:demo` ใหม่แล้ว (24 พ.ย. 69) |
| ยอดเงินทั้งระบบตรง (D-10, TC-68) | ✅ ตรงทุกครั้งที่ตรวจ (70,000 / 90,000 / 100,000 / 150,000 ตามจำนวนผู้ใช้ และ 90,000 หลังซ้อมเดโมบน db:demo ใหม่) |
| ข้อเสนอ QA: กลุ่มยอดเงินและ Permission ผ่าน 100% | ✅ Permission (TC-112 ผ่าน 264/264) · ยอดเงิน TC-59 ถึง 73 ผ่านครบ (TC-66 ผ่านหลังแก้ MN-1) |
| Test Case ผ่านทั้งหมดหรือมีเหตุผลรองรับ / ไม่มีเคสค้างสถานะว่าง | ✅ ผ่าน 115 เคส Fail 0 · TC-116 (UAT) ผ่านแบบมีข้อสังเกต · TC-80 N/A |
| บั๊กที่ยังเปิดผ่านการเห็นชอบจาก PM | ✅ ไม่มีบั๊กค้าง · PM รับทราบนิยามขอบ 2:01 ของ Auto Extend แล้ว (TC-48 / TC-98, D-16) |

**สรุป:** ผ่านเกณฑ์ทดสอบ Phase 3 แล้ว ไม่มีบั๊กค้าง ไม่มีเคส Fail เงินตรงทุกเคสที่ทดสอบ สิทธิ์ถูกต้อง ระบบพร้อมเดโม · งานที่เหลือ:
1. ~~Programmer แก้ RT-1 ถึง RT-4, R2-3 · SA แก้ AU-1, AU-2 · PM แก้ MN-1~~ แก้และเทสซ้ำผ่านแล้ว 24 พ.ย. 69
2. ~~ซ้อมเดโมผ่านหน้าเว็บเต็มรอบ~~ ทำแล้ว 24 พ.ย. 69 · QA-1 แก้แล้ว
3. ~~รันเคสที่ยังไม่ทดสอบ 21 เคส และส่วนที่ขาดของ 24 เคสผ่านบางส่วน~~ ทำแล้ว 24 พ.ย. 69 · QA-2, QA-3 แก้แล้ว
4. ~~ทำ UAT (TC-116)~~ ทำแล้ว 24 พ.ย. 69 · F3, F5 แก้แล้วใน #30 · F1, F4 เป็นงานอนาคต
5. ~~PM รับทราบนิยามขอบ 2:01 ของ Auto Extend (TC-48 / TC-98)~~ รับทราบแล้ว 24 พ.ย. 69 เพิ่มหมายเหตุใน D-16
