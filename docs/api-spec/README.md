# API Spec (เจ้าของ: SA)

- **`api-spec.md`** รายการ API ทั้งระบบ (path, สิทธิ์, request, response, error code, Socket.IO events) **ไฟล์หลักที่ AI และทุกคนอ้างอิง**
- ข้อตกลงรูปแบบ response, error, pagination และสิทธิ์อยู่ในหัวข้อ 0 ของ `api-spec.md` (สรุปจาก D-11, D-12 ใน `docs/decision-log.md`)
- เพิ่มหรือแก้ endpoint ต้องแก้ `api-spec.md` ก่อนหรือพร้อมกับโค้ดใน PR เดียวกัน และแจ้งเจ้าของโมดูลที่เรียกใช้
