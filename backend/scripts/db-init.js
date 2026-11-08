// สร้างฐานข้อมูลใหม่ทั้งหมดจาก docs/erd/schema.sql แล้วใส่ข้อมูลจาก backend/seeds/*.sql
// ใช้: npm run db:init   (ข้อมูลเดิมในฐานข้อมูลจะถูกลบทั้งหมด)
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const config = require('../src/config');

const ROOT = path.join(__dirname, '..');
const SCHEMA = path.join(ROOT, '..', 'docs', 'erd', 'schema.sql');
const SEEDS_DIR = path.join(ROOT, 'seeds');

async function main() {
  const { database, ...server } = config.db;
  const conn = await mysql.createConnection({ ...server, multipleStatements: true });
  try {
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await conn.query(`USE \`${database}\``);

    await conn.query(fs.readFileSync(SCHEMA, 'utf8'));
    console.log(`schema: ${path.relative(ROOT, SCHEMA)}`);

    const seeds = fs.readdirSync(SEEDS_DIR).filter((f) => f.endsWith('.sql')).sort();
    for (const file of seeds) {
      await conn.query(fs.readFileSync(path.join(SEEDS_DIR, file), 'utf8'));
      console.log(`seed:   ${file}`);
    }
    console.log(`Database "${database}" is ready.`);
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
