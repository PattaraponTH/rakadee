// Auth Service— ข้อ 1 ใน docs/api-spec/api-spec.md
const { withTransaction, pool } = require('../config/db');
const AppError = require('../utils/AppError');
const time = require('../config/time');
const config = require('../config');
const { hashPassword, verifyPassword, isStrongPassword } = require('../utils/password');
const {
  validateThaiIdCard,
  hashIdCard,
  encryptIdCard,
  hashSha256,
  generateOtpCode,
  generateRandomToken,
} = require('../utils/security');
const wallet = require('./wallet');
const { notify, EVENTS } = require('./notify');

/**
 * ดึงข้อมูล ToS และ Privacy Policy
 */
async function getTerms() {
  const [rows] = await pool.query(
    "SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ('terms_version', 'privacy_version')"
  );

  const settings = {};
  for (const r of rows) settings[r.setting_key] = r.setting_value;

  const termsVersion = settings.terms_version || '1.0';
  const privacyVersion = settings.privacy_version || '1.0';

  const termsHtml = `
    <div class="legal-content">
      <h3 style="margin-top:0; color:#0f172a; font-size:15px;">ข้อกำหนดและเงื่อนไขการใช้งานแพลตฟอร์มประมูลออนไลน์ Rakadee (เวอร์ชัน ${termsVersion})</h3>
      <p style="margin-bottom:8px;">ยินดีต้อนรับสู่ <strong>Rakadee</strong> แพลตฟอร์มตลาดกลางประมูลสินค้าออนไลน์ การลงทะเบียน สมัครสมาชิก หรือเข้าใช้งานระบบนี้ ถือว่าท่านได้อ่าน ทำความเข้าใจ และตกลงยินยอมผูกพันตามข้อกำหนดและเงื่อนไขดังต่อไปนี้ทุกประการ:</p>
      
      <ol style="padding-left:20px; margin:0 0 12px 0;">
        <li style="margin-bottom:6px;">
          <strong>บทบาทของแพลตฟอร์ม:</strong> Rakadee ทำหน้าที่เป็นผู้ให้บริการตลาดกลางอิเล็กทรอนิกส์ (Marketplace Platform) เพื่ออำนวยความสะดวกในการจัดประมูล ซื้อขาย และส่งมอบสินค้าระหว่างผู้ซื้อ (Bidder) และผู้ขาย (Seller) โดยแพลตฟอร์มไม่ใช่คู่สัญญาโดยตรงในธุรกรรมการซื้อขายสินค้ายกเว้นในฐานะคนกลางผู้ให้บริการ
        </li>
        <li style="margin-bottom:6px;">
          <strong>คุณสมบัติและการยืนยันตัวตน:</strong> ผู้ใช้งานต้องมีอายุตั้งแต่ 18 ปีบริบูรณ์ขึ้นไป และต้องให้ข้อมูลที่ถูกต้อง ตรงตามความเป็นจริง โดยผู้ใช้งาน 1 ท่านสามารถเปิดใช้งานได้เพียง 1 บัญชีเท่านั้น และต้องผ่านการยืนยันตัวตนด้วยเลขประจำตัวประชาชน 13 หลักและรหัส OTP ทางโทรศัพท์มือถือ ห้ามมิให้สร้างบัญชีจำลองหรือใช้บัญชีผู้อื่นเพื่อทำการปั่นราคาประมูล (Shill Bidding) โดยเด็ดขาด
        </li>
        <li style="margin-bottom:6px;">
          <strong>พันธะผูกพันของการเสนอราคา (Irrevocable Bidding):</strong> การเคาะเสนอราคา (Bid) ทุกครั้งถือเป็นคำเสนอซื้อที่มีผลผูกพันตามกฎหมาย ผู้ประมูลไม่สามารถเพิกถอนหรือยกเลิกการเสนอราคาได้ไม่ว่ากรณีใดๆ หากท่านเป็นผู้ชนะการประมูล ท่านมีหน้าที่ตามกฎหมายที่จะต้องชำระค่าสินค้าและค่าจัดส่งเต็มจำนวนภายในระยะเวลาที่กำหนด (48 ชั่วโมง)
        </li>
        <li style="margin-bottom:6px;">
          <strong>ระบบเสนอราคาอัตโนมัติและการต่อเวลา:</strong> ระบบรองรับการตั้งเพดานราคาเสนออัตโนมัติ (Proxy Bid) โดยระบบจะเคาะเพิ่มให้ตามขั้นต่ำที่จำเป็นเท่านั้น และหากมีการเสนอราคาในช่วง 2 นาทีสุดท้ายก่อนปิดประมูล ระบบจะต่อเวลาออกไปอัตโนมัติ (Auto Extend) ครั้งละ 2 นาที (สูงสุด 10 ครั้ง) เพื่อป้องกันการดักเคาะราคาวินาทีสุดท้ายและให้ความเป็นธรรมแก่ผู้ร่วมประมูลทุกคน
        </li>
        <li style="margin-bottom:6px;">
          <strong>ระบบคนกลางคุ้มครองเงิน (Escrow Protection):</strong> เงินค่าสินค้าและค่าจัดส่งที่ผู้ชนะประมูลชำระจะถูกพักไว้ในระบบคนกลาง (Escrow) และจะไม่ถูกโอนให้ผู้ขายจนกว่าผู้ซื้อจะได้รับสินค้าและกดยืนยัน หรือพ้นกำหนดระยะเวลาปล่อยเงินอัตโนมัติ (7 วันหลังจัดส่งสำเร็จ) เพื่อป้องกันการหลอกลวงและไม่ส่งสินค้า
        </li>
        <li style="margin-bottom:6px;">
          <strong>หน้าที่ของผู้ขายและสินค้าต้องห้าม:</strong> ผู้ขายต้องส่งมอบสินค้าที่ตรงตามรายละเอียด สภาพจริง และรูปถ่ายที่ลงประกาศไว้ และต้องจัดส่งพัสดุพร้อมแจ้งหมายเลขติดตามพัสดุ (Tracking Number) ภายใน 3 วันหลังได้รับการชำระเงิน ห้ามลงประมูลสินค้าผิดกฎหมาย สิ่งลามกอนาจาร อาวุธ สิ่งเสพติด หรือสินค้าละเมิดทรัพย์สินทางปัญญาและสินค้าลอกเลียนแบบทุกประเภท
        </li>
        <li style="margin-bottom:6px;">
          <strong>ค่าธรรมเนียมการให้บริการ:</strong> แพลตฟอร์มคิดค่าธรรมเนียมการใช้บริการจากผู้ขายในอัตรา 5% ของราคาปิดประมูล (ขั้นต่ำ 20 บาท และไม่เกินราคาปิดประมูล) โดยจะหักออกจากยอดเงินที่โอนให้ผู้ขายหลังการส่งมอบสินค้าเสร็จสิ้น
        </li>
        <li style="margin-bottom:6px;">
          <strong>ข้อพิพาทและบทลงโทษ:</strong> หากผู้ซื้อไม่ได้รับสินค้า หรือสินค้าไม่ตรงตามสภาพอย่างมีนัยสำคัญ สามารถเปิดข้อพิพาท (Dispute) ได้ภายใน 3 วันหลังได้รับของ ในกรณีที่มีการฝ่าฝืนกฎ เบี้ยวการชำระเงิน ไม่ส่งของ หรือฉ้อโกง แพลตฟอร์มขอสงวนสิทธิ์ในการระงับการใช้งานบัญชี (Suspend) ยึดเงินมัดจำ หรือยกเลิกบัญชีถาวรพร้อมขึ้นบัญชีดำ (Blacklist) และดำเนินคดีตามกฎหมายถึงที่สุด
        </li>
      </ol>
    </div>
  `;

  const privacyHtml = `
    <div class="legal-content">
      <h3 style="margin-top:0; color:#0f172a; font-size:15px;">นโยบายความเป็นส่วนตัวและคุ้มครองข้อมูลส่วนบุคคล (PDPA Privacy Policy) (เวอร์ชัน ${privacyVersion})</h3>
      <p style="margin-bottom:8px;">Rakadeeให้ความสำคัญอย่างยิ่งต่อการคุ้มครองข้อมูลส่วนบุคคลของท่าน นโยบายนี้จัดทำขึ้นตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 (PDPA) เพื่อแจ้งให้ท่านทราบถึงแนวทางปฏิบัติของเรา:</p>
      
      <ol style="padding-left:20px; margin:0 0 12px 0;">
        <li style="margin-bottom:6px;">
          <strong>ข้อมูลส่วนบุคคลที่เก็บรวบรวม:</strong>
          <ul style="padding-left:16px; margin-top:4px;">
            <li>ข้อมูลระบุตัวตน: ชื่อ-นามสกุลจริง, ชื่อผู้ใช้, วันเกิด, เลขประจำตัวประชาชน 13 หลัก</li>
            <li>ข้อมูลการติดต่อ: อีเมล, หมายเลขโทรศัพท์มือถือ, ที่อยู่สำหรับจัดส่งสินค้าและออกเอกสาร</li>
            <li>ข้อมูลการเงินและธุรกรรม: ประวัติการประมูล, รายการคำสั่งซื้อ, ยอดเงินและประวัติความเคลื่อนไหวในกระเป๋าเงิน (Mock Wallet)</li>
            <li>ข้อมูลทางเทคนิค: หมายเลข IP Address, ชนิดและเวอร์ชันของเบราว์เซอร์, ข้อมูลอุปกรณ์, ประวัติการเข้าสู่ระบบ (Session Logs)</li>
          </ul>
        </li>
        <li style="margin-bottom:6px;">
          <strong>วัตถุประสงค์ในการประมวลผลข้อมูล:</strong> เราประมวลผลข้อมูลของท่านเพื่อ (ก) การยืนยันตัวตนและป้องกันการทุจริตในการประมูล (ข) การอำนวยความสะดวกในการชำระเงินและการส่งมอบสินค้า (ค) การแจ้งเตือนสถานะการประมูลและการจัดส่ง (ง) การระงับข้อพิพาทและบังคับใช้ตามกฎหมาย และ (จ) การปฏิบัติตามหน้าที่ตามกฎหมายที่เกี่ยวข้อง
        </li>
        <li style="margin-bottom:6px;">
          <strong>มาตรการความปลอดภัยและการเข้ารหัสขั้นสูง:</strong> ข้อมูลเลขประจำตัวประชาชนของท่านจะถูกเข้ารหัสระดับสูงด้วยอัลกอริทึม AES-256-GCM ทันทีที่เข้าสู่ระบบ และจะไม่ถูกเปิดเผยต่อสาธารณะหรือคู่กรณี (ระบบจะแสดงเฉพาะเลข 4 ตัวท้ายเพื่อการตรวจสอบ) รหัสผ่านของท่านจะถูกแฮชด้วย Scrypt ป้องกันการถอดรหัส และทุกการเชื่อมต่อส่งผ่านเครือข่ายที่มีการเข้ารหัสความปลอดภัย
        </li>
        <li style="margin-bottom:6px;">
          <strong>การเปิดเผยข้อมูลแก่บุคคลภายนอก:</strong> เราจะไม่จำหน่ายหรือนำข้อมูลส่วนบุคคลของท่านไปเผยแพร่แก่บุคคลภายนอก ยกเว้นการเปิดเผยข้อมูลชื่อ-ที่อยู่-เบอร์โทรศัพท์ระหว่างคู่สัญญา (ผู้ซื้อและผู้ขายที่ชนะการประมูล) เท่าที่จำเป็นเพื่อการจัดส่งพัสดุ หรือเปิดเผยต่อเจ้าพนักงานตามคำสั่งศาลหรือกฎหมาย
        </li>
        <li style="margin-bottom:6px;">
          <strong>สิทธิของเจ้าของข้อมูลส่วนบุคคล:</strong> ท่านมีสิทธิตามกฎหมาย PDPA ในการขอเข้าถึง ขอรับสำเนา ขอแก้ไขข้อมูลให้ถูกต้อง ขอคัดค้านการประมวลผล ขอให้ระงับการใช้ หรือขอให้ลบทำลายข้อมูลส่วนบุคคลของท่าน (ภายใต้เงื่อนไขว่าไม่มีธุรกรรม ข้อพิพาท หรือภาระผูกพันทางกฎหมายค้างชำระอยู่ในระบบ)
        </li>
        <li style="margin-bottom:6px;">
          <strong>การติดต่อและช่องทางคุ้มครองข้อมูล:</strong> หากท่านมีข้อสงสัยหรือประสงค์จะใช้สิทธิเกี่ยวกับข้อมูลส่วนบุคคล สามารถติดต่อเจ้าหน้าที่คุ้มครองข้อมูลส่วนบุคคล (DPO) ได้ทางอีเมล: privacy@rakadee.local
        </li>
      </ol>
    </div>
  `;

  return {
    termsVersion,
    termsHtml,
    privacyVersion,
    privacyHtml,
  };
}

/**
 * สมัครสมาชิกใหม่ (1.2)
 */
async function register(data, ipAddress = '127.0.0.1', userAgent = '') {
  const {
    email,
    password,
    phone,
    idCardNumber,
    acceptTerms,
    acceptPrivacy,
    termsVersion = '1.0',
    privacyVersion = '1.0',
  } = data;
  // username เก็บเป็นตัวพิมพ์เล็กเสมอ (spec: a-z 0-9 _) · ชื่อจริง trim ก่อนตรวจ (ห้ามว่างหรือมีแต่ช่องว่าง)
  const username = typeof data.username === 'string' ? data.username.trim().toLowerCase() : '';
  const fullName = typeof data.fullName === 'string' ? data.fullName.trim().replace(/\s+/g, ' ') : '';

  // 1. Validation 
  if (!acceptTerms || !acceptPrivacy) {
    throw new AppError(400, 'TERMS_NOT_ACCEPTED', 'กรุณายอมรับข้อกำหนดการใช้งานและนโยบายความเป็นส่วนตัว');
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'รูปแบบอีเมลไม่ถูกต้อง', { field: 'email' });
  }

  if (!/^[a-z0-9_]{4,30}$/.test(username)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'ชื่อผู้ใช้ต้องมีความยาว 4-30 ตัวอักษร (a-z, 0-9, _)', { field: 'username' });
  }

  if (fullName.length < 2 || fullName.length > 150) {
    throw new AppError(400, 'VALIDATION_ERROR', 'กรุณากรอกชื่อ-นามสกุลจริง (2–150 ตัวอักษร)', { field: 'fullName' });
  }

  if (!isStrongPassword(password)) {
    throw new AppError(400, 'WEAK_PASSWORD', 'รหัสผ่านต้องมีความยาวอย่างน้อย 8 ตัวอักษร และประกอบด้วยตัวพิมพ์ใหญ่ ตัวพิมพ์เล็ก และตัวเลข');
  }

  if (!phone || !/^0\d{9}$/.test(phone)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'เบอร์โทรศัพท์ต้องเป็นตัวเลข 10 หลักขึ้นต้นด้วย 0', { field: 'phone' });
  }

  if (!validateThaiIdCard(idCardNumber)) {
    throw new AppError(400, 'INVALID_ID_CARD', 'เลขประจำตัวประชาชนไม่ถูกต้อง กรุณาตรวจสอบว่ากรอกเลข 13 หลักตรงตามบัตรจริง');
  }

  const idCardHash = hashIdCard(idCardNumber);

  // 2. ตรวจสอบ Blacklist (เลขบัตรหรือเบอร์โทร)
  const [blacklisted] = await pool.query(
    'SELECT id, reason FROM blacklists WHERE (id_card_hash = ? OR phone = ?) AND revoked_at IS NULL LIMIT 1',
    [idCardHash, phone]
  );
  if (blacklisted.length > 0) {
    throw new AppError(403, 'BLACKLISTED', 'ข้อมูลนี้ถูกระงับการใช้งานในระบบ');
  }

  // 3. ตรวจสอบข้อมูลซ้ำ
  const [existing] = await pool.query(
    `SELECT
      SUM(email = ?) AS email_taken,
      SUM(username = ?) AS username_taken,
      SUM(phone = ?) AS phone_taken,
      SUM(id_card_hash = ?) AS id_card_taken
     FROM users`,
    [email, username, phone, idCardHash]
  );

  const ex = existing[0] || {};
  if (Number(ex.email_taken) > 0) throw new AppError(409, 'EMAIL_TAKEN', 'อีเมลนี้ถูกใช้งานแล้ว');
  if (Number(ex.username_taken) > 0) throw new AppError(409, 'USERNAME_TAKEN', 'ชื่อผู้ใช้นี้ถูกใช้งานแล้ว');
  if (Number(ex.phone_taken) > 0) throw new AppError(409, 'PHONE_TAKEN', 'เบอร์โทรศัพท์นี้ถูกใช้งานแล้ว');
  if (Number(ex.id_card_taken) > 0) throw new AppError(409, 'ID_CARD_TAKEN', 'เลขประจำตัวประชาชนนี้ถูกลงทะเบียนแล้ว');

  // 4. บันทึกลงฐานข้อมูลใน Transaction
  const created = await withTransaction(async (conn) => {
    const passwordHash = hashPassword(password);
    const idCardEncrypted = encryptIdCard(idCardNumber);
    const idCardLast4 = idCardNumber.slice(-4);

    // 4.1 สร้างแถว users
    const [userRes] = await conn.query(
      `INSERT INTO users (
        email, username, password_hash, full_name, display_name, phone,
        id_card_encrypted, id_card_hash, id_card_last4, role, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'bidder', 'pending_verification')`,
      [email, username, passwordHash, fullName, username, phone, idCardEncrypted, idCardHash, idCardLast4]
    );
    const userId = Number(userRes.insertId);

    // 4.2 บันทึก user_consents 2 แถว
    await conn.query(
      `INSERT INTO user_consents (user_id, consent_type, version, ip_address, user_agent)
       VALUES (?, 'terms_of_service', ?, ?, ?), (?, 'privacy_policy', ?, ?, ?)`,
      [userId, termsVersion, ipAddress, userAgent, userId, privacyVersion, ipAddress, userAgent]
    );

    // 4.3 สร้าง Mock OTP
    const otpCode = generateOtpCode();
    const otpHash = hashSha256(otpCode);
    const otpExpiresAt = new Date(Date.now() + (time.otpExpireMs || 5 * 60 * 1000));

    await conn.query(
      'INSERT INTO otp_codes (user_id, code_hash, attempts, expires_at) VALUES (?, ?, 0, ?)',
      [userId, otpHash, otpExpiresAt]
    );

    console.log(`[AUTH:MOCK_OTP] userId=${userId} phone=${phone} code=${otpCode} expiresAt=${otpExpiresAt.toISOString()}`);

    // 4.4 Token ยืนยันอีเมล
    const emailVerifyToken = generateRandomToken(32);
    const emailTokenHash = hashSha256(emailVerifyToken);
    const emailTokenExpires = new Date(Date.now() + time.emailVerifyExpireMs);

    await conn.query(
      'INSERT INTO user_tokens (user_id, purpose, token_hash, expires_at) VALUES (?, \'email_verify\', ?, ?)',
      [userId, emailTokenHash, emailTokenExpires]
    );

    console.log(`[AUTH:EMAIL_VERIFY] userId=${userId} email=${email} token=${emailVerifyToken}`);

    return {
      userId,
      email,
      username,
      idCardLast4,
      otpExpiresAt: otpExpiresAt.toISOString(),
      emailVerifyToken,
    };
  });

  // ส่งลิงก์ยืนยันอีเมลหลัง COMMIT แล้วเท่านั้น
  const { emailVerifyToken, ...result } = created;
  sendEmailVerifyLink(result.userId, emailVerifyToken);
  return result;
}

// อีเมลยืนยัน (1.2, 1.9): ลิงก์ไปหน้า verify-email.html?token=...
function sendEmailVerifyLink(userId, token) {
  const link = `${config.appUrl}/pages/verify-email.html?token=${token}`;
  notify(userId, EVENTS.ACCOUNT_VERIFY, { link }).catch(() => {});
}

/**
 * ยืนยัน OTP (1.3)
 */
async function verifyOtp(userId, code, ipAddress = '127.0.0.1', userAgent = '') {
  if (!userId || !code) {
    throw new AppError(400, 'VALIDATION_ERROR', 'กรุณาระบุรหัสผู้ใช้และรหัส OTP');
  }

  const out = await withTransaction(async (conn) => {
    // 1. ตรวจสอบสถานะ User
    const [users] = await conn.query(
      'SELECT id, role, status, phone_verified_at, activated_at FROM users WHERE id = ? FOR UPDATE',
      [userId]
    );
    if (users.length === 0) {
      throw new AppError(404, 'NOT_FOUND', 'ไม่พบบัญชีผู้ใช้');
    }

    const u = users[0];
    if (u.phone_verified_at && u.status === 'active') {
      throw new AppError(409, 'ALREADY_VERIFIED', 'เบอร์โทรศัพท์นี้ได้รับการยืนยันเรียบร้อยแล้ว');
    }

    // 2. ดึง OTP ล่าสุดที่ยังไม่ถูกใช้
    const [otps] = await conn.query(
      'SELECT id, code_hash, attempts, expires_at, used_at FROM otp_codes WHERE user_id = ? AND used_at IS NULL ORDER BY id DESC LIMIT 1 FOR UPDATE',
      [userId]
    );
    if (otps.length === 0) {
      throw new AppError(400, 'OTP_EXPIRED', 'ไม่พบรหัส OTP หรือรหัสหมดอายุแล้ว กรุณาขอใหม่');
    }

    const otp = otps[0];

    // ตรวจสอบวันหมดอายุ
    if (new Date(otp.expires_at) <= new Date()) {
      throw new AppError(400, 'OTP_EXPIRED', 'รหัส OTP หมดอายุแล้ว กรุณาขอใหม่');
    }

    // ตรวจสอบจำนวนครั้งที่กรอกผิด
    if (otp.attempts >= 5) {
      throw new AppError(429, 'OTP_TOO_MANY_ATTEMPTS', 'กรอกรหัสผิดเกิน 5 ครั้ง กรุณาขอรหัส OTP ใหม่');
    }

    // 3. เปรียบเทียบรหัส OTP
    const inputHash = hashSha256(String(code).trim());
    if (inputHash !== otp.code_hash) {
      const newAttempts = otp.attempts + 1;
      await conn.query('UPDATE otp_codes SET attempts = ? WHERE id = ?', [newAttempts, otp.id]);
      const attemptsLeft = Math.max(0, 5 - newAttempts);
      // ห้าม throw ใน transaction ไม่งั้นตัวนับ attempts ถูก rollback (กรอกผิดได้ไม่จำกัด) ให้ COMMIT ก่อนแล้วค่อย throw
      return { otpError: new AppError(400, 'OTP_INVALID', 'รหัส OTP ไม่ถูกต้อง', { attemptsLeft }) };
    }

    // 4. ยืนยัน OTP สำเร็จ
    await conn.query('UPDATE otp_codes SET used_at = UTC_TIMESTAMP() WHERE id = ?', [otp.id]);

    // 5. ปรับสถานะ user เป็น active และบันทึก activated_at
    await conn.query(
      `UPDATE users
       SET status = 'active',
           phone_verified_at = UTC_TIMESTAMP(),
           activated_at = COALESCE(activated_at, UTC_TIMESTAMP())
       WHERE id = ?`,
      [userId]
    );

    // 6. สร้างกระเป๋าเงิน Mock Wallet 10,000 บาท (D-05)
    const createdWallet = await wallet.create(userId, conn);

    // 7. สร้าง Session Token
    const sessionToken = generateRandomToken(32);
    const tokenHash = hashSha256(sessionToken);
    const ttlHours = config.security.sessionTtlHours || 168;
    const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000);

    await conn.query(
      'INSERT INTO sessions (user_id, token_hash, ip_address, user_agent, expires_at) VALUES (?, ?, ?, ?, ?)',
      [userId, tokenHash, ipAddress, userAgent, expiresAt]
    );

    // 8. ดึงข้อมูล UserMe
    const [userRows] = await conn.query(
      `SELECT
        id, email, username, full_name, display_name, phone, id_card_last4,
        avatar_path, bio, role, status, status_until,
        phone_verified_at, email_verified_at, created_at
       FROM users WHERE id = ?`,
      [userId]
    );
    const finalUser = userRows[0];

    const userMe = {
      id: Number(finalUser.id),
      email: finalUser.email,
      username: finalUser.username,
      fullName: finalUser.full_name,
      displayName: finalUser.display_name,
      phone: finalUser.phone,
      idCardLast4: finalUser.id_card_last4,
      avatarUrl: finalUser.avatar_path ? `/uploads/avatars/${finalUser.avatar_path}` : null,
      bio: finalUser.bio,
      role: finalUser.role,
      status: finalUser.status,
      statusUntil: finalUser.status_until ? new Date(finalUser.status_until).toISOString() : null,
      phoneVerified: Boolean(finalUser.phone_verified_at),
      emailVerified: Boolean(finalUser.email_verified_at),
      isSeller: finalUser.role === 'seller',
      createdAt: new Date(finalUser.created_at).toISOString(),
    };

    return {
      token: sessionToken,
      expiresAt: expiresAt.toISOString(),
      user: userMe,
      walletBalance: createdWallet.balance,
    };
  });
  if (out.otpError) throw out.otpError;
  return out;
}

/**
 * ขอส่ง OTP ใหม่ (1.4)
 */
async function resendOtp(userId) {
  if (!userId) throw new AppError(400, 'VALIDATION_ERROR', 'กรุณาระบุรหัสผู้ใช้');

  const [users] = await pool.query(
    'SELECT id, phone, status, phone_verified_at FROM users WHERE id = ?',
    [userId]
  );
  if (users.length === 0) throw new AppError(404, 'NOT_FOUND', 'ไม่พบบัญชีผู้ใช้');

  const u = users[0];
  if (u.phone_verified_at && u.status === 'active') {
    throw new AppError(409, 'ALREADY_VERIFIED', 'เบอร์โทรศัพท์นี้ได้รับการยืนยันเรียบร้อยแล้ว');
  }

  // ตรวจสอบ rate limit: ขอได้ทุก 60 วินาที
  const [latestOtp] = await pool.query(
    'SELECT id, created_at FROM otp_codes WHERE user_id = ? ORDER BY id DESC LIMIT 1',
    [userId]
  );
  if (latestOtp.length > 0) {
    const elapsedSec = Math.floor((Date.now() - new Date(latestOtp[0].created_at).getTime()) / 1000);
    if (elapsedSec < 60) {
      throw new AppError(429, 'OTP_RESEND_TOO_SOON', 'กรุณารอ 60 วินาทีก่อนขอรหัสใหม่', {
        retryAfterSec: 60 - elapsedSec,
      });
    }
  }

  // สร้าง OTP ตัวใหม่
  const otpCode = generateOtpCode();
  const otpHash = hashSha256(otpCode);
  const otpExpiresAt = new Date(Date.now() + (time.otpExpireMs || 5 * 60 * 1000));

  await pool.query(
    'INSERT INTO otp_codes (user_id, code_hash, attempts, expires_at) VALUES (?, ?, 0, ?)',
    [userId, otpHash, otpExpiresAt]
  );

  console.log(`[AUTH:RESEND_OTP] userId=${userId} phone=${u.phone} code=${otpCode} expiresAt=${otpExpiresAt.toISOString()}`);

  return {
    otpExpiresAt: otpExpiresAt.toISOString(),
  };
}

/**
 * เข้าสู่ระบบ (1.5)
 */
async function login(identifier, password, ipAddress = '127.0.0.1', userAgent = '') {
  if (!identifier || !password) {
    throw new AppError(400, 'VALIDATION_ERROR', 'กรุณากรอกชื่อผู้ใช้/อีเมล และรหัสผ่าน');
  }

  const [rows] = await pool.query(
    `SELECT
      id, email, username, password_hash, full_name, display_name, phone, id_card_last4,
      avatar_path, bio, role, status, status_until, phone_verified_at, email_verified_at, created_at
     FROM users
     WHERE email = ? OR username = ?
     LIMIT 1`,
    [identifier, identifier]
  );

  if (rows.length === 0) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'อีเมล/ชื่อผู้ใช้ หรือรหัสผ่านไม่ถูกต้อง');
  }

  const u = rows[0];

  // ตรวจสอบรหัสผ่านผ่าน password.js (scrypt)
  if (!verifyPassword(password, u.password_hash)) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'อีเมล/ชื่อผู้ใช้ หรือรหัสผ่านไม่ถูกต้อง');
  }

  if (u.status === 'banned') {
    throw new AppError(403, 'ACCOUNT_BANNED', 'บัญชีของคุณถูกระงับการใช้งานถาวร');
  }

  // สร้าง Session Token
  const sessionToken = generateRandomToken(32);
  const tokenHash = hashSha256(sessionToken);
  const ttlHours = config.security.sessionTtlHours || 168;
  const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000);

  await pool.query(
    'INSERT INTO sessions (user_id, token_hash, ip_address, user_agent, expires_at) VALUES (?, ?, ?, ?, ?)',
    [u.id, tokenHash, ipAddress, userAgent, expiresAt]
  );

  // อัปเดต last_login_at
  pool.query('UPDATE users SET last_login_at = UTC_TIMESTAMP() WHERE id = ?', [u.id]).catch(() => {});

  const userMe = {
    id: Number(u.id),
    email: u.email,
    username: u.username,
    fullName: u.full_name,
    displayName: u.display_name,
    phone: u.phone,
    idCardLast4: u.id_card_last4,
    avatarUrl: u.avatar_path ? `/uploads/avatars/${u.avatar_path}` : null,
    bio: u.bio,
    role: u.role,
    status: u.status,
    statusUntil: u.status_until ? new Date(u.status_until).toISOString() : null,
    phoneVerified: Boolean(u.phone_verified_at),
    emailVerified: Boolean(u.email_verified_at),
    isSeller: u.role === 'seller',
    createdAt: new Date(u.created_at).toISOString(),
  };

  return {
    token: sessionToken,
    expiresAt: expiresAt.toISOString(),
    user: userMe,
  };
}

/**
 * ออกจากระบบเซสชันปัจจุบัน (1.6)
 */
async function logout(sessionId) {
  if (sessionId) {
    await pool.query('UPDATE sessions SET revoked_at = UTC_TIMESTAMP() WHERE id = ?', [sessionId]);
  }
  return { loggedOut: true };
}

/**
 * ข้อมูลผู้ใช้ปัจจุบัน (1.7)
 */
async function getMe(userId) {
  const [rows] = await pool.query(
    `SELECT
      id, email, username, full_name, display_name, phone, id_card_last4,
      avatar_path, bio, role, status, status_until, phone_verified_at, email_verified_at, created_at
     FROM users
     WHERE id = ?`,
    [userId]
  );
  if (rows.length === 0) throw new AppError(404, 'NOT_FOUND', 'ไม่พบข้อมูลผู้ใช้');

  const u = rows[0];
  return {
    id: Number(u.id),
    email: u.email,
    username: u.username,
    fullName: u.full_name,
    displayName: u.display_name,
    phone: u.phone,
    idCardLast4: u.id_card_last4,
    avatarUrl: u.avatar_path ? `/uploads/avatars/${u.avatar_path}` : null,
    bio: u.bio,
    role: u.role,
    status: u.status,
    statusUntil: u.status_until ? new Date(u.status_until).toISOString() : null,
    phoneVerified: Boolean(u.phone_verified_at),
    emailVerified: Boolean(u.email_verified_at),
    isSeller: u.role === 'seller',
    createdAt: new Date(u.created_at).toISOString(),
  };
}

/**
 * ยืนยันอีเมลจากลิงก์ (1.8)
 */
async function verifyEmail(token) {
  if (!token) throw new AppError(400, 'VALIDATION_ERROR', 'กรุณาระบุโทเค็นยืนยันอีเมล');
  const tokenHash = hashSha256(token);

  return withTransaction(async (conn) => {
    const [tokens] = await conn.query(
      `SELECT id, user_id, expires_at, used_at
       FROM user_tokens
       WHERE purpose = 'email_verify' AND token_hash = ?
       LIMIT 1 FOR UPDATE`,
      [tokenHash]
    );

    if (tokens.length === 0 || tokens[0].used_at) {
      throw new AppError(400, 'TOKEN_INVALID', 'ลิงก์ยืนยันอีเมลไม่ถูกต้องหรือถูกใช้งานแล้ว');
    }

    const t = tokens[0];
    if (new Date(t.expires_at) <= new Date()) {
      throw new AppError(400, 'TOKEN_EXPIRED', 'ลิงก์ยืนยันอีเมลหมดอายุแล้ว');
    }

    await conn.query('UPDATE user_tokens SET used_at = UTC_TIMESTAMP() WHERE id = ?', [t.id]);
    await conn.query('UPDATE users SET email_verified_at = UTC_TIMESTAMP() WHERE id = ?', [t.user_id]);

    return { emailVerified: true };
  });
}

/**
 * ส่งลิงก์ยืนยันอีเมลใหม่ (1.9)
 */
async function resendEmailVerify(userId) {
  const [users] = await pool.query('SELECT id, email, email_verified_at FROM users WHERE id = ?', [userId]);
  if (users.length === 0) throw new AppError(404, 'NOT_FOUND', 'ไม่พบบัญชีผู้ใช้');
  if (users[0].email_verified_at) throw new AppError(409, 'ALREADY_VERIFIED', 'อีเมลนี้ได้รับการยืนยันเรียบร้อยแล้ว');

  const token = generateRandomToken(32);
  const tokenHash = hashSha256(token);
  const expiresAt = new Date(Date.now() + time.emailVerifyExpireMs);

  await pool.query(
    'INSERT INTO user_tokens (user_id, purpose, token_hash, expires_at) VALUES (?, \'email_verify\', ?, ?)',
    [userId, tokenHash, expiresAt]
  );

  console.log(`[AUTH:RESEND_EMAIL_VERIFY] userId=${userId} email=${users[0].email} token=${token}`);
  sendEmailVerifyLink(userId, token);

  return { sent: true };
}

/**
 * ขอลิงก์รีเซ็ตรหัสผ่าน (1.10)
 */
async function forgotPassword(email) {
  if (!email) throw new AppError(400, 'VALIDATION_ERROR', 'กรุณาระบุอีเมล');

  const [users] = await pool.query('SELECT id, email FROM users WHERE email = ?', [email]);
  if (users.length > 0) {
    const userId = users[0].id;
    const token = generateRandomToken(32);
    const tokenHash = hashSha256(token);
    const expiresAt = new Date(Date.now() + (time.passwordResetExpireMs || 30 * 60 * 1000));

    await pool.query(
      'INSERT INTO user_tokens (user_id, purpose, token_hash, expires_at) VALUES (?, \'password_reset\', ?, ?)',
      [userId, tokenHash, expiresAt]
    );

    console.log(`[AUTH:PASSWORD_RESET] userId=${userId} email=${email} token=${token} expiresAt=${expiresAt.toISOString()}`);
    notify(userId, EVENTS.PASSWORD_RESET, { link: `${config.appUrl}/pages/reset-password.html?token=${token}` }).catch(() => {});
  }

  // คืนค่า sent: true เสมอเพื่อความปลอดภัย (ไม่เปิดเผยว่าอีเมลมีในระบบหรือไม่)
  return { sent: true };
}

/**
 * ตั้งรหัสผ่านใหม่จากลิงก์ (1.11)
 */
async function resetPassword(token, newPassword) {
  if (!token || !newPassword) {
    throw new AppError(400, 'VALIDATION_ERROR', 'กรุณาระบุโทเค็นและรหัสผ่านใหม่');
  }

  if (!isStrongPassword(newPassword)) {
    throw new AppError(400, 'WEAK_PASSWORD', 'รหัสผ่านต้องมีความยาวอย่างน้อย 8 ตัวอักษร และประกอบด้วยตัวพิมพ์ใหญ่ ตัวพิมพ์เล็ก และตัวเลข');
  }

  const tokenHash = hashSha256(token);

  return withTransaction(async (conn) => {
    const [tokens] = await conn.query(
      `SELECT id, user_id, expires_at, used_at
       FROM user_tokens
       WHERE purpose = 'password_reset' AND token_hash = ?
       LIMIT 1 FOR UPDATE`,
      [tokenHash]
    );

    if (tokens.length === 0 || tokens[0].used_at) {
      throw new AppError(400, 'TOKEN_INVALID', 'ลิงก์รีเซ็ตรหัสผ่านไม่ถูกต้องหรือถูกใช้งานแล้ว');
    }

    const t = tokens[0];
    if (new Date(t.expires_at) <= new Date()) {
      throw new AppError(400, 'TOKEN_EXPIRED', 'ลิงก์รีเซ็ตรหัสผ่านหมดอายุแล้ว');
    }

    const newPasswordHash = hashPassword(newPassword);

    await conn.query('UPDATE users SET password_hash = ? WHERE id = ?', [newPasswordHash, t.user_id]);
    await conn.query('UPDATE user_tokens SET used_at = UTC_TIMESTAMP() WHERE id = ?', [t.id]);
    // ยกเลิกเซสชันทั้งหมดของผู้ใช้เพื่อความปลอดภัย
    await conn.query('UPDATE sessions SET revoked_at = UTC_TIMESTAMP() WHERE user_id = ? AND revoked_at IS NULL', [t.user_id]);

    return { reset: true }; // api-spec 1.11
  });
}

/**
 * เปลี่ยนรหัสผ่านโดยกรอกรหัสเดิม (1.12)
 */
async function changePassword(userId, currentSessionId, oldPassword, newPassword) {
  if (!oldPassword || !newPassword) {
    throw new AppError(400, 'VALIDATION_ERROR', 'กรุณาระบุรหัสผ่านเดิมและรหัสผ่านใหม่');
  }

  if (!isStrongPassword(newPassword)) {
    throw new AppError(400, 'WEAK_PASSWORD', 'รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 8 ตัวอักษร และประกอบด้วยตัวพิมพ์ใหญ่ ตัวพิมพ์เล็ก และตัวเลข');
  }

  return withTransaction(async (conn) => {
    const [users] = await conn.query('SELECT id, password_hash FROM users WHERE id = ? FOR UPDATE', [userId]);
    if (users.length === 0) throw new AppError(404, 'NOT_FOUND', 'ไม่พบบัญชีผู้ใช้');

    if (!verifyPassword(oldPassword, users[0].password_hash)) {
      throw new AppError(400, 'WRONG_PASSWORD', 'รหัสผ่านเดิมไม่ถูกต้อง');
    }
    if (oldPassword === newPassword) {
      throw new AppError(400, 'SAME_PASSWORD', 'รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม');
    }

    const newPasswordHash = hashPassword(newPassword);
    await conn.query('UPDATE users SET password_hash = ? WHERE id = ?', [newPasswordHash, userId]);

    // ยกเลิก session อื่นทั้งหมด ยกเว้น session ปัจจุบัน
    await conn.query(
      'UPDATE sessions SET revoked_at = UTC_TIMESTAMP() WHERE user_id = ? AND id != ? AND revoked_at IS NULL',
      [userId, currentSessionId]
    );

    return { changed: true }; // api-spec 1.12
  });
}

/**
 * ดูรายการอุปกรณ์/ประวัติการเข้าสู่ระบบ (1.13)
 */
async function getSessions(userId, currentSessionId) {
  const [rows] = await pool.query(
    `SELECT id, ip_address, user_agent, created_at, last_seen_at
     FROM sessions
     WHERE user_id = ? AND revoked_at IS NULL AND expires_at > UTC_TIMESTAMP()
     ORDER BY last_seen_at DESC`,
    [userId]
  );

  const items = rows.map((r) => ({
    id: Number(r.id),
    ipAddress: r.ip_address,
    userAgent: r.user_agent,
    createdAt: new Date(r.created_at).toISOString(),
    lastSeenAt: new Date(r.last_seen_at).toISOString(),
    isCurrent: Number(r.id) === Number(currentSessionId),
  }));

  return { items };
}

/**
 * ออกจากระบบอุปกรณ์อื่น (1.14)
 */
async function revokeSession(userId, sessionIdToRevoke) {
  const [res] = await pool.query(
    'UPDATE sessions SET revoked_at = UTC_TIMESTAMP() WHERE id = ? AND user_id = ? AND revoked_at IS NULL',
    [sessionIdToRevoke, userId]
  );
  if (res.affectedRows === 0) {
    throw new AppError(404, 'NOT_FOUND', 'ไม่พบเซสชันที่ระบุหรือไม่สามารถยกเลิกได้');
  }
  return { revoked: true };
}

module.exports = {
  getTerms,
  register,
  verifyOtp,
  resendOtp,
  login,
  logout,
  getMe,
  verifyEmail,
  resendEmailVerify,
  forgotPassword,
  resetPassword,
  changePassword,
  getSessions,
  revokeSession,
};

