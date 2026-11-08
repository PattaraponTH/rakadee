-- ข้อมูลตั้งต้นสำหรับพัฒนาและทดสอบ (รันหลัง docs/erd/schema.sql ผ่าน npm run db:init)
-- บัญชีทดสอบ (ใช้ในเครื่องตัวเองเท่านั้น):
--   superadmin / Super@1234   admin / Admin@1234
--   seller1 / buyer1 / buyer2 รหัสผ่าน Test@1234 (active, มี Wallet 10,000 บาท)

SET NAMES utf8mb4;

INSERT INTO users (id, email, username, password_hash, full_name, display_name, phone, role, status, phone_verified_at, email_verified_at, activated_at) VALUES
  (1, 'superadmin@rakadee.local', 'superadmin', 'scrypt$8ccd60fb06ff780bb1c228885c55131c$ce0ee8537745cb36f6d209a657fd13319582794510f1f755ea4593c47a0111b6e672ca5d7d4bee7f616f8a3d9235d62eb6ce0c3965e8c6cde6777b0edade67b0', 'Super Admin', 'Super Admin', '0800000001', 'super_admin', 'active', UTC_TIMESTAMP(), UTC_TIMESTAMP(), UTC_TIMESTAMP()),
  (2, 'admin@rakadee.local', 'admin', 'scrypt$419174c7e01ccad1670f836604cb03a9$9e877a8d8d81c58ac432abf2bd826d63b841cdf18969db9d2d3dc97e0e8f47f33e767f338b10022b2ab47bafcb0c3df32d1dc952c32499d8681cac3a8f366a86', 'Admin', 'Admin', '0800000002', 'admin', 'active', UTC_TIMESTAMP(), UTC_TIMESTAMP(), UTC_TIMESTAMP()),
  (3, 'seller1@rakadee.local', 'seller1', 'scrypt$70479c76a1830b6cb808b3529c42bb7d$5a1a15883c1246962649aab3ed274a8c6504dd5371182cd5728639c69d451d7a5a2dabeee643ef162cf68ae3b34d05691ff1c448a5e97c975ff7c6fe69f06658', 'ผู้ขาย ทดสอบ', 'ร้านทดสอบ', '0811111111', 'seller', 'active', UTC_TIMESTAMP(), UTC_TIMESTAMP(), UTC_TIMESTAMP()),
  (4, 'buyer1@rakadee.local', 'buyer1', 'scrypt$70479c76a1830b6cb808b3529c42bb7d$5a1a15883c1246962649aab3ed274a8c6504dd5371182cd5728639c69d451d7a5a2dabeee643ef162cf68ae3b34d05691ff1c448a5e97c975ff7c6fe69f06658', 'ผู้ซื้อ หนึ่ง', 'buyer1', '0822222222', 'bidder', 'active', UTC_TIMESTAMP(), UTC_TIMESTAMP(), UTC_TIMESTAMP()),
  (5, 'buyer2@rakadee.local', 'buyer2', 'scrypt$70479c76a1830b6cb808b3529c42bb7d$5a1a15883c1246962649aab3ed274a8c6504dd5371182cd5728639c69d451d7a5a2dabeee643ef162cf68ae3b34d05691ff1c448a5e97c975ff7c6fe69f06658', 'ผู้ซื้อ สอง', 'buyer2', '0833333333', 'bidder', 'active', UTC_TIMESTAMP(), UTC_TIMESTAMP(), UTC_TIMESTAMP());

INSERT INTO seller_profiles (user_id, shop_name, shop_description, origin_province) VALUES
  (3, 'ร้านทดสอบ', 'ร้านสำหรับทดสอบระบบ', 'กรุงเทพมหานคร');

INSERT INTO addresses (user_id, recipient_name, phone, address_line, sub_district, district, province, postal_code, is_default) VALUES
  (3, 'ผู้ขาย ทดสอบ', '0811111111', '1 ถนนพหลโยธิน', 'ลาดยาว', 'จตุจักร', 'กรุงเทพมหานคร', '10900', 1),
  (4, 'ผู้ซื้อ หนึ่ง', '0822222222', '99 ถนนรัชดาภิเษก', 'ดินแดง', 'ดินแดง', 'กรุงเทพมหานคร', '10400', 1),
  (5, 'ผู้ซื้อ สอง', '0833333333', '50 ถนนนิมมานเหมินท์', 'สุเทพ', 'เมืองเชียงใหม่', 'เชียงใหม่', '50200', 1);

-- Wallet + เครดิตแรกเข้า (D-05) เฉพาะสมาชิก ไม่สร้างให้แอดมิน
INSERT INTO wallets (id, user_id, balance) VALUES (1, 3, 10000.00), (2, 4, 10000.00), (3, 5, 10000.00);
INSERT INTO wallet_transactions (wallet_id, type, amount, balance_after, note) VALUES
  (1, 'initial_credit', 10000.00, 10000.00, 'เครดิตแรกเข้า'),
  (2, 'initial_credit', 10000.00, 10000.00, 'เครดิตแรกเข้า'),
  (3, 'initial_credit', 10000.00, 10000.00, 'เครดิตแรกเข้า');

-- หมวดหมู่หลักและหมวดย่อย (ข้อ 3.1-1b)
INSERT INTO categories (id, parent_id, name, slug, sort_order) VALUES
  (1,  NULL, 'อิเล็กทรอนิกส์', 'electronics', 1),
  (2,  NULL, 'ของสะสม', 'collectibles', 2),
  (3,  NULL, 'เสื้อผ้าและแฟชั่น', 'fashion', 3),
  (4,  NULL, 'บ้านและของใช้', 'home', 4),
  (5,  NULL, 'อื่นๆ', 'others', 5),
  (11, 1, 'มือถือและแท็บเล็ต', 'phones-tablets', 1),
  (12, 1, 'คอมพิวเตอร์และอุปกรณ์', 'computers', 2),
  (13, 1, 'กล้องและเลนส์', 'cameras', 3),
  (14, 1, 'เครื่องเสียง', 'audio', 4),
  (21, 2, 'การ์ดสะสม', 'trading-cards', 1),
  (22, 2, 'ฟิกเกอร์และโมเดล', 'figures', 2),
  (23, 2, 'เหรียญและแสตมป์', 'coins-stamps', 3),
  (24, 2, 'ของเก่า', 'antiques', 4),
  (31, 3, 'เสื้อผ้า', 'clothing', 1),
  (32, 3, 'รองเท้า', 'shoes', 2),
  (33, 3, 'กระเป๋า', 'bags', 3),
  (34, 3, 'นาฬิกาและเครื่องประดับ', 'watches-jewelry', 4),
  (41, 4, 'เฟอร์นิเจอร์', 'furniture', 1),
  (42, 4, 'เครื่องใช้ไฟฟ้า', 'appliances', 2),
  (51, 5, 'อื่นๆ', 'others-misc', 1);

-- ตั้งค่าระบบเริ่มต้น (Super Admin แก้ได้ที่หน้าตั้งค่าระบบ)
INSERT INTO system_settings (setting_key, setting_value, description) VALUES
  ('platform_fee_percent', '5', 'ค่าธรรมเนียมแพลตฟอร์ม (% ของราคาปิดประมูล)'),
  ('platform_fee_min', '20', 'ค่าธรรมเนียมขั้นต่ำ (บาท)'),
  ('initial_wallet_credit', '10000', 'เครดิตแรกเข้า Mock Wallet (บาท)'),
  ('terms_version', '1.0', 'เวอร์ชันข้อกำหนดการใช้งานปัจจุบัน'),
  ('privacy_version', '1.0', 'เวอร์ชันนโยบายความเป็นส่วนตัวปัจจุบัน');
