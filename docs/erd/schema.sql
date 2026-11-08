-- =====================================================================
-- Rakadee — Database schema (MySQL 8.0, InnoDB, utf8mb4)
-- แหล่งความจริงของชื่อตาราง/คอลัมน์ทั้งระบบ ห้ามเดาชื่อเอง ให้ยึดไฟล์นี้
-- อ้างอิง: requirement ข้อ 1-8, docs/decision-log.md (D-01 ถึง D-12)
--
-- กติกา
--   * id ทุกตารางเป็น BIGINT UNSIGNED AUTO_INCREMENT (D-12)
--   * เวลาเก็บเป็น UTC ชนิด DATETIME, เงินเป็น DECIMAL(12,2)
--   * ค่าสถานะเป็นภาษาอังกฤษตัวเล็ก ชื่อภาษาไทยแปลงที่ FE
--   * กฎที่ DB บังคับไม่ได้ (เช่น ลำดับสถานะ) ให้ตรวจที่ service และเขียนไว้ใน comment
--
-- รันทั้งไฟล์: npm run db:init (ใน backend/) จะ DROP แล้วสร้างใหม่ทั้งหมด
-- =====================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS
  system_settings, admin_audit_logs, notification_settings, notifications,
  suspicious_flags, blacklists, penalties, dispute_evidence, disputes,
  shipments, escrows, wallet_transactions, wallets, payments, orders,
  watchlists, proxy_bids, bids, listing_images, listings, categories,
  seller_profiles, addresses, sessions, user_tokens, otp_codes,
  user_consents, users;

SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------------------
-- 1. สมาชิกและความปลอดภัยบัญชี (SA) — requirement 1.3, 1.4, 2
-- ---------------------------------------------------------------------

-- role: bidder = สมาชิกทั่วไป, seller = สมาชิกที่เปิดสิทธิ์ผู้ขายแล้ว (ทำได้ทุกอย่างที่ bidder ทำได้)
--       admin / super_admin สร้างจาก seed เท่านั้น และบิด/ลงสินค้าไม่ได้ (D-07)
-- status: 5 ค่าตาม D-03; status_until ใช้กับ restricted/suspended (Scheduler restoreStatus คืนเป็น active)
CREATE TABLE users (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email              VARCHAR(150) NOT NULL,
  username           VARCHAR(30)  NOT NULL,
  password_hash      VARCHAR(255) NOT NULL,          -- รูปแบบ scrypt$<salt>$<hash> (D-12)
  full_name          VARCHAR(150) NOT NULL,          -- ชื่อจริง (ไม่แสดงสาธารณะ)
  display_name       VARCHAR(50)  NOT NULL,          -- ชื่อที่แสดง (เริ่มต้น = username)
  phone              VARCHAR(10)  NOT NULL,          -- เบอร์มือถือไทย 10 หลัก
  id_card_encrypted  VARBINARY(255) NULL,            -- AES-256-GCM ของเลขบัตร 13 หลัก (คีย์ใน .env)
  id_card_hash       CHAR(64)     NULL,              -- HMAC-SHA256 ของเลขบัตร ใช้เช็กซ้ำ/blacklist
  id_card_last4      CHAR(4)      NULL,              -- แสดงผลได้เฉพาะ 4 ตัวท้าย
  avatar_path        VARCHAR(255) NULL,
  bio                VARCHAR(500) NULL,
  role               ENUM('bidder','seller','admin','super_admin') NOT NULL DEFAULT 'bidder',
  status             ENUM('pending_verification','active','restricted','suspended','banned') NOT NULL DEFAULT 'pending_verification',
  status_until       DATETIME     NULL,
  status_reason      VARCHAR(255) NULL,
  phone_verified_at  DATETIME     NULL,              -- ผ่าน OTP
  email_verified_at  DATETIME     NULL,              -- กดลิงก์ยืนยันอีเมล (ข้อ 2-5)
  activated_at       DATETIME     NULL,              -- เปลี่ยนเป็น active ครั้งแรก = เวลาที่ได้เครดิต 10,000 (D-05)
  last_login_at      DATETIME     NULL,
  created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_username (username),
  UNIQUE KEY uq_users_phone (phone),
  UNIQUE KEY uq_users_id_card_hash (id_card_hash),   -- 1 เลขบัตร = 1 บัญชี (ข้อ 1.4-1)
  KEY idx_users_status (status, status_until)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- หลักฐานการยอมรับ ToS / นโยบาย PDPA (ข้อ 2.1)
CREATE TABLE user_consents (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id       BIGINT UNSIGNED NOT NULL,
  consent_type  ENUM('terms_of_service','privacy_policy') NOT NULL,
  version       VARCHAR(20)  NOT NULL,
  ip_address    VARCHAR(45)  NOT NULL,
  user_agent    VARCHAR(255) NULL,
  accepted_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_consents_user (user_id),
  CONSTRAINT fk_consents_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Mock OTP ยืนยันเบอร์ (ข้อ 2.2-2): หมดอายุ 5 นาที, กรอกผิดได้ 5 ครั้ง, ขอใหม่ได้ทุก 60 วินาที
CREATE TABLE otp_codes (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     BIGINT UNSIGNED NOT NULL,
  code_hash   CHAR(64)  NOT NULL,                   -- SHA-256 ของรหัส 6 หลัก
  attempts    TINYINT UNSIGNED NOT NULL DEFAULT 0,
  expires_at  DATETIME  NOT NULL,
  used_at     DATETIME  NULL,
  created_at  DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_otp_user (user_id, created_at),
  CONSTRAINT fk_otp_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- โทเคนใช้ครั้งเดียว: ยืนยันอีเมล (ข้อ 2-5) และรีเซ็ตรหัสผ่าน 30 นาที (ข้อ 2.3-2)
CREATE TABLE user_tokens (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     BIGINT UNSIGNED NOT NULL,
  purpose     ENUM('email_verify','password_reset') NOT NULL,
  token_hash  CHAR(64) NOT NULL,
  expires_at  DATETIME NOT NULL,
  used_at     DATETIME NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_user_tokens_hash (token_hash),
  KEY idx_user_tokens_user (user_id, purpose),
  CONSTRAINT fk_user_tokens_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Session แบบ opaque token (D-12): ใช้ทั้ง login, รายการอุปกรณ์ (ข้อ 2.4-2) และยกเลิกทุก session ตอนเปลี่ยนรหัส
CREATE TABLE sessions (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id       BIGINT UNSIGNED NOT NULL,
  token_hash    CHAR(64)     NOT NULL,              -- SHA-256 ของ token ที่ส่งให้ client
  ip_address    VARCHAR(45)  NOT NULL,
  user_agent    VARCHAR(255) NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at    DATETIME     NOT NULL,
  revoked_at    DATETIME     NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sessions_token (token_hash),
  KEY idx_sessions_user (user_id, revoked_at),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 2. Settings (PM) — ข้อ 2.4
-- ---------------------------------------------------------------------

-- สมุดที่อยู่ (ข้อ 2.4-3) ผู้ใช้ 1 คนมีที่อยู่เริ่มต้นได้ 1 ที่ (service ต้องปลด is_default ของที่อื่นใน transaction เดียว)
CREATE TABLE addresses (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id         BIGINT UNSIGNED NOT NULL,
  recipient_name  VARCHAR(150) NOT NULL,
  phone           VARCHAR(10)  NOT NULL,
  address_line    VARCHAR(255) NOT NULL,            -- บ้านเลขที่ ถนน ซอย
  sub_district    VARCHAR(100) NOT NULL,
  district        VARCHAR(100) NOT NULL,
  province        VARCHAR(100) NOT NULL,
  postal_code     CHAR(5)      NOT NULL,
  is_default      TINYINT(1)   NOT NULL DEFAULT 0,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_addresses_user (user_id, is_default),
  CONSTRAINT fk_addresses_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- เปิดสิทธิ์ผู้ขาย (QA, ข้อ 2.4-5): กรอกแล้วได้ role = seller ทันที ไม่ต้องรอแอดมิน (D-07)
CREATE TABLE seller_profiles (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id           BIGINT UNSIGNED NOT NULL,
  shop_name         VARCHAR(100) NOT NULL,
  shop_description  VARCHAR(1000) NULL,
  origin_province   VARCHAR(100) NOT NULL,
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_seller_profiles_user (user_id),
  CONSTRAINT fk_seller_profiles_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 3. สินค้าและการประมูล (QA ลงสินค้า, Programmer Auction Engine) — ข้อ 3, 4
-- ---------------------------------------------------------------------

-- หมวดหลัก (parent_id NULL) และหมวดย่อย 1 ชั้น (ข้อ 3.1-1b)
CREATE TABLE categories (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  parent_id   BIGINT UNSIGNED NULL,
  name        VARCHAR(100) NOT NULL,
  slug        VARCHAR(120) NOT NULL,
  sort_order  INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_categories_slug (slug),
  KEY idx_categories_parent (parent_id, sort_order),
  CONSTRAINT fk_categories_parent FOREIGN KEY (parent_id) REFERENCES categories (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- status (ข้อ 1.7-1): draft → pending_review → rejected | active → ended ; cancelled (เฉพาะก่อน active)
-- start_at/end_at เป็น NULL จนกว่าแอดมินอนุมัติ: start_at = เวลาอนุมัติ, end_at = start_at + duration_days (ข้อ 3.4-5)
-- current_price/current_bidder_id/bid_count อัปเดตใน transaction เดียวกับ INSERT bids (SELECT ... FOR UPDATE)
-- result (ข้อ 1.7-2) และ winner_id ตั้งตอนปิดประมูล; reserve_price ห้ามส่งออก API สาธารณะ
CREATE TABLE listings (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  seller_id          BIGINT UNSIGNED NOT NULL,
  category_id        BIGINT UNSIGNED NOT NULL,      -- ต้องเป็นหมวดย่อย
  title              VARCHAR(150) NOT NULL,
  description        TEXT NOT NULL,
  included_items     VARCHAR(500) NULL,             -- สิ่งที่ได้รับ
  item_condition     ENUM('new','used_good','defective') NOT NULL,   -- ของใหม่ / มือสองสภาพดี / มีตำหนิ
  defect_detail      VARCHAR(1000) NULL,            -- บังคับเมื่อ item_condition = defective
  shipping_fee       DECIMAL(12,2) NOT NULL DEFAULT 0.00,              -- ส่งฟรีใส่ 0
  origin_province    VARCHAR(100) NOT NULL,
  start_price        DECIMAL(12,2) NOT NULL,
  bid_increment      DECIMAL(12,2) NOT NULL,
  reserve_price      DECIMAL(12,2) NULL,
  buy_now_price      DECIMAL(12,2) NULL,
  duration_days      TINYINT UNSIGNED NOT NULL,
  status             ENUM('draft','pending_review','rejected','active','ended','cancelled') NOT NULL DEFAULT 'draft',
  reject_reason      VARCHAR(500) NULL,             -- บังคับเมื่อ rejected
  submitted_at       DATETIME NULL,
  reviewed_by        BIGINT UNSIGNED NULL,
  reviewed_at        DATETIME NULL,
  start_at           DATETIME NULL,
  end_at             DATETIME NULL,
  extend_count       TINYINT UNSIGNED NOT NULL DEFAULT 0,             -- สูงสุดตาม time.autoExtendMaxCount
  current_price      DECIMAL(12,2) NULL,            -- NULL = ยังไม่มีผู้บิด
  current_bidder_id  BIGINT UNSIGNED NULL,
  bid_count          INT UNSIGNED NOT NULL DEFAULT 0,
  result             ENUM('has_winner','no_bid','below_reserve','buy_now') NULL,
  winner_id          BIGINT UNSIGNED NULL,
  closed_at          DATETIME NULL,
  created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_listings_status_end (status, end_at),
  KEY idx_listings_category (category_id, status),
  KEY idx_listings_seller (seller_id, status),
  KEY idx_listings_created (status, start_at),
  CONSTRAINT fk_listings_seller   FOREIGN KEY (seller_id)         REFERENCES users (id),
  CONSTRAINT fk_listings_category FOREIGN KEY (category_id)       REFERENCES categories (id),
  CONSTRAINT fk_listings_reviewer FOREIGN KEY (reviewed_by)       REFERENCES users (id),
  CONSTRAINT fk_listings_bidder   FOREIGN KEY (current_bidder_id) REFERENCES users (id),
  CONSTRAINT fk_listings_winner   FOREIGN KEY (winner_id)         REFERENCES users (id),
  CONSTRAINT chk_listings_prices CHECK (
        start_price > 0 AND bid_increment > 0 AND shipping_fee >= 0
    AND (reserve_price IS NULL OR reserve_price >= start_price)
    AND (buy_now_price IS NULL OR (buy_now_price > start_price
         AND (reserve_price IS NULL OR buy_now_price > reserve_price)))),
  CONSTRAINT chk_listings_duration CHECK (duration_days IN (1, 3, 7))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- รูปสินค้า 1–8 รูป, jpg/jpeg/png ไม่เกิน 5MB, มีรูปปก 1 รูป (ข้อ 3.1-2) — นับจำนวนที่ service
CREATE TABLE listing_images (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  listing_id  BIGINT UNSIGNED NOT NULL,
  file_path   VARCHAR(255) NOT NULL,                -- เช่น products/<uuid>.jpg (ใต้ backend/storage)
  is_cover    TINYINT(1) NOT NULL DEFAULT 0,
  sort_order  TINYINT UNSIGNED NOT NULL DEFAULT 0,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_listing_images_listing (listing_id, sort_order),
  CONSTRAINT fk_listing_images_listing FOREIGN KEY (listing_id) REFERENCES listings (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ประวัติการบิดทุกครั้ง (manual, proxy ที่ระบบบิดแทน, buy_now) — ip/user_agent ใช้ตรวจปั่นราคา (ข้อ 7.3-2)
CREATE TABLE bids (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  listing_id  BIGINT UNSIGNED NOT NULL,
  bidder_id   BIGINT UNSIGNED NOT NULL,
  amount      DECIMAL(12,2) NOT NULL,
  bid_type    ENUM('manual','proxy','buy_now') NOT NULL,
  ip_address  VARCHAR(45)  NULL,
  user_agent  VARCHAR(255) NULL,
  created_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),     -- มิลลิวินาที เพื่อเรียงลำดับบิดที่ใกล้กัน
  PRIMARY KEY (id),
  KEY idx_bids_listing (listing_id, created_at),
  KEY idx_bids_bidder (bidder_id, created_at),
  CONSTRAINT fk_bids_listing FOREIGN KEY (listing_id) REFERENCES listings (id),
  CONSTRAINT fk_bids_bidder  FOREIGN KEY (bidder_id)  REFERENCES users (id),
  CONSTRAINT chk_bids_amount CHECK (amount > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Proxy Bid 1 คน 1 รายการต่อสินค้า (ข้อ 4.2) — max_amount เป็นความลับ ส่งให้เจ้าของเท่านั้น
-- Proxy ชน Proxy วงเงินเท่ากัน: คนที่ priority_at เก่ากว่าชนะ (priority_at เปลี่ยนเฉพาะตอนเพิ่มวงเงิน)
CREATE TABLE proxy_bids (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  listing_id   BIGINT UNSIGNED NOT NULL,
  bidder_id    BIGINT UNSIGNED NOT NULL,
  max_amount   DECIMAL(12,2) NOT NULL,
  is_active    TINYINT(1) NOT NULL DEFAULT 1,       -- 0 = ยกเลิก หรือวงเงินถูกแซงแล้ว
  priority_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_proxy_bids_listing_bidder (listing_id, bidder_id),
  KEY idx_proxy_bids_active (listing_id, is_active, max_amount),
  CONSTRAINT fk_proxy_bids_listing FOREIGN KEY (listing_id) REFERENCES listings (id),
  CONSTRAINT fk_proxy_bids_bidder  FOREIGN KEY (bidder_id)  REFERENCES users (id),
  CONSTRAINT chk_proxy_bids_amount CHECK (max_amount > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Watchlist (ข้อ 1.5-3) — ending_soon_notified_at กันแจ้งเตือน "ใกล้หมดเวลา" ซ้ำ
CREATE TABLE watchlists (
  id                       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id                  BIGINT UNSIGNED NOT NULL,
  listing_id               BIGINT UNSIGNED NOT NULL,
  ending_soon_notified_at  DATETIME NULL,
  created_at               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_watchlists_user_listing (user_id, listing_id),
  KEY idx_watchlists_listing (listing_id),
  CONSTRAINT fk_watchlists_user    FOREIGN KEY (user_id)    REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_watchlists_listing FOREIGN KEY (listing_id) REFERENCES listings (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 4. คำสั่งซื้อ การเงิน และการจัดส่ง (SA, PM) — ข้อ 5, 6
-- ---------------------------------------------------------------------

-- 1 listing = 1 order สร้างโดย order.create() ตอนปิดประมูลที่มีผู้ชนะ หรือ Buy Now
-- status (ข้อ 1.7-3 + D-08): pending_payment → awaiting_shipment → shipped → completed
--                            pending_payment → cancelled (หมดเวลาชำระ)
--                            awaiting_shipment → cancelled (ผู้ซื้อยกเลิกเมื่อผู้ขายไม่ส่งเกินกำหนด)
--                            awaiting_shipment | shipped → disputed → completed | cancelled
-- ระหว่างแอดมินตรวจการชำระ order ยังเป็น pending_payment (ดูสถานะจาก payments) และ payment_due_at หยุดนับ (D-01)
CREATE TABLE orders (
  id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  listing_id           BIGINT UNSIGNED NOT NULL,
  buyer_id             BIGINT UNSIGNED NOT NULL,
  seller_id            BIGINT UNSIGNED NOT NULL,
  closing_type         ENUM('auction','buy_now') NOT NULL,
  item_price           DECIMAL(12,2) NOT NULL,      -- ราคาปิดประมูล (ฐานคิดค่าธรรมเนียม)
  shipping_fee         DECIMAL(12,2) NOT NULL,
  total_amount         DECIMAL(12,2) NOT NULL,      -- item_price + shipping_fee = ยอดที่ผู้ซื้อจ่าย
  shipping_address     JSON NOT NULL,               -- snapshot ที่อยู่เริ่มต้น ณ ตอนสร้าง order (ข้อ 2.4-3c)
  status               ENUM('pending_payment','awaiting_shipment','shipped','completed','disputed','cancelled') NOT NULL DEFAULT 'pending_payment',
  payment_due_at       DATETIME NOT NULL,           -- created_at + time.paymentDueMs
  payment_reminded_at  DATETIME NULL,               -- กันแจ้งเตือน 24 ชม. ซ้ำ
  paid_at              DATETIME NULL,               -- แอดมินอนุมัติการชำระ
  ship_due_at          DATETIME NULL,               -- paid_at + time.shippingDueMs
  ship_reminded_at     DATETIME NULL,
  shipped_at           DATETIME NULL,
  auto_release_at      DATETIME NULL,               -- shipped_at + time.autoReleaseMs
  completed_at         DATETIME NULL,
  cancelled_at         DATETIME NULL,
  cancel_reason        ENUM('payment_timeout','seller_no_shipment','dispute_refund') NULL,
  created_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_orders_listing (listing_id),
  KEY idx_orders_buyer (buyer_id, status),
  KEY idx_orders_seller (seller_id, status),
  KEY idx_orders_payment_due (status, payment_due_at),
  KEY idx_orders_ship_due (status, ship_due_at),
  KEY idx_orders_auto_release (status, auto_release_at),
  CONSTRAINT fk_orders_listing FOREIGN KEY (listing_id) REFERENCES listings (id),
  CONSTRAINT fk_orders_buyer   FOREIGN KEY (buyer_id)   REFERENCES users (id),
  CONSTRAINT fk_orders_seller  FOREIGN KEY (seller_id)  REFERENCES users (id),
  CONSTRAINT chk_orders_amount CHECK (item_price > 0 AND shipping_fee >= 0 AND total_amount = item_price + shipping_fee)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 1 แถว = 1 ครั้งที่กดชำระผ่าน Mock Wallet (D-01) ถ้าแอดมินปฏิเสธ ผู้ซื้อชำระใหม่ได้เป็นแถวใหม่
-- status: pending_review → success | rejected   (ต่อ order มี pending_review ได้ครั้งละ 1 แถว — ตรวจใน transaction)
-- slip_* ไม่บังคับ (ข้อ 5.5 รายละเอียดหลักฐาน)
CREATE TABLE payments (
  id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id             BIGINT UNSIGNED NOT NULL,
  payer_id             BIGINT UNSIGNED NOT NULL,
  amount               DECIMAL(12,2) NOT NULL,      -- = orders.total_amount
  method               ENUM('mock_wallet') NOT NULL DEFAULT 'mock_wallet',
  status               ENUM('pending_review','success','rejected') NOT NULL DEFAULT 'pending_review',
  slip_file_path       VARCHAR(255) NULL,
  slip_amount          DECIMAL(12,2) NULL,          -- ยอดที่ระบุว่าโอน
  slip_transferred_at  DATETIME NULL,               -- วันเวลาที่ระบุว่าโอน
  slip_reference       VARCHAR(100) NULL,           -- เลขอ้างอิง
  slip_uploaded_at     DATETIME NULL,
  reviewed_by          BIGINT UNSIGNED NULL,
  reviewed_at          DATETIME NULL,
  reject_reason        VARCHAR(500) NULL,           -- บังคับเมื่อ rejected
  created_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_payments_order (order_id, status),
  KEY idx_payments_review (status, created_at),
  CONSTRAINT fk_payments_order    FOREIGN KEY (order_id)    REFERENCES orders (id),
  CONSTRAINT fk_payments_payer    FOREIGN KEY (payer_id)    REFERENCES users (id),
  CONSTRAINT fk_payments_reviewer FOREIGN KEY (reviewed_by) REFERENCES users (id),
  CONSTRAINT chk_payments_amount CHECK (amount > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Mock Wallet 1 คน 1 กระเป๋า สร้างพร้อมเครดิตแรกเข้า 10,000 บาท (D-05) — ไม่มีเติมเงิน/ถอนเงิน (D-09)
CREATE TABLE wallets (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     BIGINT UNSIGNED NOT NULL,
  balance     DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_wallets_user (user_id),
  CONSTRAINT fk_wallets_user FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT chk_wallets_balance CHECK (balance >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Ledger ทุกการเปลี่ยนแปลงยอด (amount: บวก = เงินเข้า, ลบ = เงินออก) ดูเส้นทางเงินใน D-10
--   initial_credit  +10,000 เมื่อ active ครั้งแรก
--   payment         -total  ผู้ซื้อกดชำระ (เงินอยู่ระหว่างรอแอดมินตรวจ)
--   payment_refund  +total  แอดมินปฏิเสธการชำระ
--   sale_proceeds   +(total - fee) ผู้ขายได้รับเมื่อปล่อย Escrow
--   escrow_refund   +total  คืนผู้ซื้อ (ผู้ขายไม่ส่ง / แพ้ข้อพิพาท)
CREATE TABLE wallet_transactions (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  wallet_id       BIGINT UNSIGNED NOT NULL,
  type            ENUM('initial_credit','payment','payment_refund','sale_proceeds','escrow_refund') NOT NULL,
  amount          DECIMAL(12,2) NOT NULL,
  balance_after   DECIMAL(12,2) NOT NULL,
  reference_type  ENUM('order','payment','escrow') NULL,
  reference_id    BIGINT UNSIGNED NULL,
  note            VARCHAR(255) NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_wallet_tx_wallet (wallet_id, created_at),
  KEY idx_wallet_tx_reference (reference_type, reference_id),
  CONSTRAINT fk_wallet_tx_wallet FOREIGN KEY (wallet_id) REFERENCES wallets (id),
  CONSTRAINT chk_wallet_tx_amount CHECK (amount <> 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Escrow 1 order 1 แถว สร้างตอนแอดมินอนุมัติการชำระ (ข้อ 5.3)
-- status: held → released | refunded  ระหว่างมีข้อพิพาทยังเป็น held แต่ release ไม่ได้ (D-08)
-- ค่าธรรมเนียมเก็บที่นี่ที่เดียว: fee = min(max(item_price × 5%, 20), item_price) คิดตอน release (ข้อ 5.4)
CREATE TABLE escrows (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id     BIGINT UNSIGNED NOT NULL,
  amount       DECIMAL(12,2) NOT NULL,              -- = orders.total_amount
  status       ENUM('held','released','refunded') NOT NULL DEFAULT 'held',
  fee_amount   DECIMAL(12,2) NULL,                  -- ตั้งตอน released
  net_amount   DECIMAL(12,2) NULL,                  -- amount - fee_amount ที่โอนให้ผู้ขาย
  held_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  released_at  DATETIME NULL,
  refunded_at  DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_escrows_order (order_id),
  KEY idx_escrows_status (status),
  CONSTRAINT fk_escrows_order FOREIGN KEY (order_id) REFERENCES orders (id),
  CONSTRAINT chk_escrows_amount CHECK (amount > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ข้อมูลจัดส่งที่ผู้ขายบันทึก (ข้อ 6.1, 6.5) — ไม่มีสถานะ "ถึงปลายทาง" จากขนส่ง ผู้ซื้อกดยืนยันรับเอง (D-08)
CREATE TABLE shipments (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id         BIGINT UNSIGNED NOT NULL,
  carrier          ENUM('thailand_post','kerry','flash','jt','other') NOT NULL,
  carrier_other    VARCHAR(100) NULL,               -- บังคับเมื่อ carrier = other
  tracking_number  VARCHAR(100) NOT NULL,
  shipped_at       DATETIME NOT NULL,               -- วันเวลาที่ส่งตามที่ผู้ขายกรอก
  proof_file_path  VARCHAR(255) NULL,
  note             VARCHAR(500) NULL,
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_shipments_order (order_id),
  CONSTRAINT fk_shipments_order FOREIGN KEY (order_id) REFERENCES orders (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 5. ข้อพิพาท บทลงโทษ และความปลอดภัย (QA) — ข้อ 6.4, 7, 8.2-4, 8.2-5
-- ---------------------------------------------------------------------

-- status (ข้อ 1.7-7): open → awaiting_evidence → investigating → return_in_progress | refund_in_progress → closed
-- 1 order มีข้อพิพาทที่ยังไม่ปิดได้ 1 รายการ (บังคับด้วย open_order_id UNIQUE)
-- resolution: refund_buyer (escrow.refund) | release_seller (escrow.release)
CREATE TABLE disputes (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id       BIGINT UNSIGNED NOT NULL,
  opened_by      BIGINT UNSIGNED NOT NULL,          -- ผู้ซื้อ
  type           ENUM('not_received','not_as_described','damaged','other') NOT NULL,
  description    TEXT NOT NULL,
  contact_info   VARCHAR(255) NULL,                 -- ช่องทางติดต่อเพิ่มเติม
  status         ENUM('open','awaiting_evidence','investigating','return_in_progress','refund_in_progress','closed') NOT NULL DEFAULT 'open',
  resolution     ENUM('refund_buyer','release_seller') NULL,
  admin_note     VARCHAR(1000) NULL,
  resolved_by    BIGINT UNSIGNED NULL,
  resolved_at    DATETIME NULL,
  open_order_id  BIGINT UNSIGNED AS (IF(status <> 'closed', order_id, NULL)) STORED,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_disputes_open_order (open_order_id),
  KEY idx_disputes_order (order_id),
  KEY idx_disputes_status (status, created_at),
  CONSTRAINT fk_disputes_order    FOREIGN KEY (order_id)    REFERENCES orders (id),
  CONSTRAINT fk_disputes_opener   FOREIGN KEY (opened_by)   REFERENCES users (id),
  CONSTRAINT fk_disputes_resolver FOREIGN KEY (resolved_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- หลักฐานของทั้งผู้ซื้อและผู้ขาย (รูป jpg/png ตาม upload middleware)
CREATE TABLE dispute_evidence (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  dispute_id   BIGINT UNSIGNED NOT NULL,
  uploaded_by  BIGINT UNSIGNED NOT NULL,
  party        ENUM('buyer','seller') NOT NULL,
  file_path    VARCHAR(255) NOT NULL,
  note         VARCHAR(500) NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_dispute_evidence_dispute (dispute_id),
  CONSTRAINT fk_dispute_evidence_dispute FOREIGN KEY (dispute_id)  REFERENCES disputes (id) ON DELETE CASCADE,
  CONSTRAINT fk_dispute_evidence_user    FOREIGN KEY (uploaded_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- บันทึกความผิด (ข้อ 7.1, 7.2) เขียนผ่าน penalty.add(userId, type, { orderId })
--   non_payment ครั้งที่ 1 → warning, ครั้งที่ 2 ขึ้นไป → suspend (time.suspendMs)
--   no_shipment ครั้งที่ 1 → warning, ครั้งที่ 2 ขึ้นไป → restrict (time.suspendMs)
--   admin_ban → ban + เพิ่ม blacklists
CREATE TABLE penalties (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id       BIGINT UNSIGNED NOT NULL,
  type          ENUM('non_payment','no_shipment','shill_bidding','admin_ban') NOT NULL,
  order_id      BIGINT UNSIGNED NULL,
  action        ENUM('warning','restrict','suspend','ban') NOT NULL,
  action_until  DATETIME NULL,
  note          VARCHAR(500) NULL,
  created_by    BIGINT UNSIGNED NULL,               -- NULL = ระบบ (Scheduler)
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_penalties_user (user_id, type),
  CONSTRAINT fk_penalties_user    FOREIGN KEY (user_id)    REFERENCES users (id),
  CONSTRAINT fk_penalties_order   FOREIGN KEY (order_id)   REFERENCES orders (id),
  CONSTRAINT fk_penalties_creator FOREIGN KEY (created_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Blacklist เลขบัตรและเบอร์ที่ถูกแบน กันสมัครใหม่ (ข้อ 1.4-2d) — ตรวจตอนสมัครด้วย id_card_hash หรือ phone
CREATE TABLE blacklists (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id       BIGINT UNSIGNED NULL,
  id_card_hash  CHAR(64)    NULL,
  phone         VARCHAR(10) NULL,
  reason        VARCHAR(500) NOT NULL,
  created_by    BIGINT UNSIGNED NOT NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_by    BIGINT UNSIGNED NULL,
  revoked_at    DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_blacklists_id_card (id_card_hash, revoked_at),
  KEY idx_blacklists_phone (phone, revoked_at),
  CONSTRAINT fk_blacklists_user    FOREIGN KEY (user_id)    REFERENCES users (id),
  CONSTRAINT fk_blacklists_creator FOREIGN KEY (created_by) REFERENCES users (id),
  CONSTRAINT fk_blacklists_revoker FOREIGN KEY (revoked_by) REFERENCES users (id),
  CONSTRAINT chk_blacklists_target CHECK (id_card_hash IS NOT NULL OR phone IS NOT NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Shill detection เบื้องต้น (ข้อ 7.3-2): ระบบบันทึก flag ให้แอดมินตรวจ ไม่ลงโทษอัตโนมัติ
CREATE TABLE suspicious_flags (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  listing_id   BIGINT UNSIGNED NOT NULL,
  bidder_id    BIGINT UNSIGNED NOT NULL,
  seller_id    BIGINT UNSIGNED NOT NULL,
  reason       ENUM('same_ip','same_device','repeated_seller') NOT NULL,
  detail       VARCHAR(255) NULL,
  reviewed_by  BIGINT UNSIGNED NULL,
  reviewed_at  DATETIME NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_flags_review (reviewed_at, created_at),
  CONSTRAINT fk_flags_listing  FOREIGN KEY (listing_id)  REFERENCES listings (id),
  CONSTRAINT fk_flags_bidder   FOREIGN KEY (bidder_id)   REFERENCES users (id),
  CONSTRAINT fk_flags_seller   FOREIGN KEY (seller_id)   REFERENCES users (id),
  CONSTRAINT fk_flags_reviewer FOREIGN KEY (reviewed_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 6. แจ้งเตือน แอดมิน และตั้งค่าระบบ (PM) — ข้อ 7 (แจ้งเตือน), 8
-- ---------------------------------------------------------------------

-- event ต้องตรงกับ EVENTS ใน backend/src/services/notify.js
CREATE TABLE notifications (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id         BIGINT UNSIGNED NOT NULL,
  event           VARCHAR(40)  NOT NULL,
  title           VARCHAR(150) NOT NULL,
  message         VARCHAR(500) NOT NULL,
  link_url        VARCHAR(255) NULL,                -- หน้า FE ที่เกี่ยวข้อง เช่น /pages/orders.html?id=12
  reference_type  ENUM('listing','order','payment','dispute','user') NULL,
  reference_id    BIGINT UNSIGNED NULL,
  read_at         DATETIME NULL,
  emailed_at      DATETIME NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_notifications_user (user_id, read_at, created_at),
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- เปิด/ปิดแจ้งเตือนตามกลุ่ม (ข้อ 2.4-4) แยกช่องทางเว็บ/อีเมล — ไม่มีแถว = เปิดทั้งหมด
CREATE TABLE notification_settings (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id         BIGINT UNSIGNED NOT NULL,
  auction_web     TINYINT(1) NOT NULL DEFAULT 1,
  auction_email   TINYINT(1) NOT NULL DEFAULT 1,
  finance_web     TINYINT(1) NOT NULL DEFAULT 1,
  finance_email   TINYINT(1) NOT NULL DEFAULT 1,
  shipping_web    TINYINT(1) NOT NULL DEFAULT 1,
  shipping_email  TINYINT(1) NOT NULL DEFAULT 1,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_notification_settings_user (user_id),
  CONSTRAINT fk_notification_settings_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Audit Log ทุกการกระทำของแอดมิน (ข้อ 8.2-6) เขียนผ่าน audit.log()
CREATE TABLE admin_audit_logs (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  admin_id     BIGINT UNSIGNED NOT NULL,
  action       VARCHAR(50) NOT NULL,                -- เช่น LISTING_APPROVE, PAYMENT_REJECT, USER_BAN
  target_type  VARCHAR(30) NOT NULL,                -- listing, order, payment, user, dispute, setting
  target_id    VARCHAR(50) NOT NULL,
  detail       JSON NULL,
  ip_address   VARCHAR(45) NOT NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_audit_admin (admin_id, created_at),
  KEY idx_audit_action (action, created_at),
  CONSTRAINT fk_audit_admin FOREIGN KEY (admin_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ตั้งค่าระบบ (Super Admin, ข้อ 8.1) — ค่าเริ่มต้นอยู่ใน backend/seeds/001_seed.sql
-- ระยะเวลาของ Scheduler ยังอ่านจาก config/time.js (ย่อเวลาตอนทดสอบผ่าน .env)
CREATE TABLE system_settings (
  setting_key    VARCHAR(50) NOT NULL,
  setting_value  VARCHAR(255) NOT NULL,
  description    VARCHAR(255) NULL,
  updated_by     BIGINT UNSIGNED NULL,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (setting_key),
  CONSTRAINT fk_settings_updater FOREIGN KEY (updated_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
