// อัปโหลดไฟล์ลง backend/storage/<folder>/
// ใช้แบบนี้: router.post('/', upload('products').array('images', 8), handler)
// folder ที่ใช้: products, slips, evidence, avatars, shipments (หลักฐานการส่ง เปิดผ่าน API ที่ตรวจสิทธิ์)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const config = require('../config');
const AppError = require('../utils/AppError');

const ALLOWED_FOLDERS = ['products', 'slips', 'evidence', 'avatars', 'shipments'];
const ALLOWED_TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png' };

// ลายเซ็นต้นไฟล์ (magic bytes) mimetype ที่ client ส่งมาปลอมได้ จึงตรวจเนื้อไฟล์จริงหลังบันทึกอีกชั้น
const SIGNATURES = {
  'image/jpeg': [0xff, 0xd8, 0xff],
  'image/png': [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
};

function hasSignature(file) {
  const sig = SIGNATURES[file.mimetype];
  if (!sig) return false;
  const buf = Buffer.alloc(sig.length);
  let fd;
  try {
    fd = fs.openSync(file.path, 'r');
    const n = fs.readSync(fd, buf, 0, sig.length, 0);
    return n === sig.length && sig.every((b, i) => buf[i] === b);
  } catch {
    return false;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

// middleware ต่อท้าย multer: ไฟล์ไหนเนื้อในไม่ใช่ jpg/png จริง → ลบทุกไฟล์ในคำขอแล้วตอบ 400
function verifyFiles(req, res, next) {
  const files = req.file ? [req.file] : Array.isArray(req.files) ? req.files : Object.values(req.files || {}).flat();
  if (files.every(hasSignature)) return next();
  files.forEach((f) => fs.unlink(f.path, () => {}));
  req.file = undefined;
  req.files = undefined;
  return next(new AppError(400, 'UPLOAD_INVALID_TYPE', 'ไฟล์ไม่ใช่รูป .jpg หรือ .png จริง กรุณาเลือกไฟล์รูปภาพ'));
}

function upload(folder) {
  if (!ALLOWED_FOLDERS.includes(folder)) throw new Error(`Unknown upload folder: ${folder}`);
  const dir = path.join(config.upload.dir, folder);
  fs.mkdirSync(dir, { recursive: true });

  const m = multer({
    storage: multer.diskStorage({
      destination: dir,
      filename: (req, file, cb) => cb(null, crypto.randomUUID() + ALLOWED_TYPES[file.mimetype]),
    }),
    limits: { fileSize: config.upload.maxFileSizeMb * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (ALLOWED_TYPES[file.mimetype]) return cb(null, true);
      cb(new AppError(400, 'UPLOAD_INVALID_TYPE', 'รองรับเฉพาะไฟล์ .jpg, .jpeg และ .png'));
    },
  });
  // ใช้เหมือน multer เดิม (.single / .array / .fields) แต่ได้ [multer, ตรวจ magic bytes] ซึ่ง Express รับเป็น middleware ได้
  return {
    single: (name) => [m.single(name), verifyFiles],
    array: (name, max) => [m.array(name, max), verifyFiles],
    fields: (spec) => [m.fields(spec), verifyFiles],
  };
}

module.exports = upload;
