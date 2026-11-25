const path = require('path');
const express = require('express');
const config = require('./config');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middlewares/errorHandler');

const app = express();

// กันเบราว์เซอร์เดาชนิดไฟล์เอง (ไฟล์ที่เสิร์ฟเป็นรูปจะไม่ถูกตีความเป็น HTML / สคริปต์)
app.use((req, res, next) => { res.setHeader('X-Content-Type-Options', 'nosniff'); next(); });
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// API
app.use('/api', routes);

// ไฟล์ที่อัปโหลดแบบสาธารณะ (รูปสินค้า รูปโปรไฟล์) ส่วนสลิป หลักฐาน เปิดผ่าน API ที่ตรวจสิทธิ์
app.use('/uploads/products', express.static(path.join(config.upload.dir, 'products')));
app.use('/uploads/avatars', express.static(path.join(config.upload.dir, 'avatars')));

// Front-end (HTML/CSS/JS) เสิร์ฟจาก server เดียวกัน
app.use(express.static(path.join(__dirname, '..', '..', 'frontend')));

app.use('/api', notFound);
app.use(errorHandler);

module.exports = app;
