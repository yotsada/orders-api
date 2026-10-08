import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type DB = Database.Database;
// path ของ DB: ตั้งผ่าน env ได้ ไม่ตั้ง = data/orders.db
export const DB_PATH = process.env.DB_PATH ?? 'data/orders.db';
// schema: IF NOT EXISTS → รันซ้ำได้ ข้อมูลเดิมไม่หาย
const SCHEMA = `
CREATE TABLE IF NOT EXISTS orders (
  id             TEXT PRIMARY KEY,
  status         TEXT NOT NULL,
  customer_name  TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  created_at     TEXT NOT NULL            -- ISO 8601 UTC ลงท้าย Z
);

CREATE TABLE IF NOT EXISTS order_items (
  id                INTEGER PRIMARY KEY,
  order_id          TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_name      TEXT NOT NULL,
  quantity          INTEGER NOT NULL CHECK (typeof(quantity) = 'integer' AND quantity > 0),
  unit_price_satang INTEGER NOT NULL CHECK (typeof(unit_price_satang) = 'integer' AND unit_price_satang >= 0)
);

CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_items_order_id   ON order_items(order_id);
`;

// เปิด DB + สร้างตาราง
export function openDb(path: string = DB_PATH): DB {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true }); // สร้าง data/ ถ้ายังไม่มี
  const db = new Database(path);
  db.pragma('foreign_keys = ON'); // SQLite ปิด FK เป็นค่าเริ่มต้น
  db.exec(SCHEMA);
  return db;
}