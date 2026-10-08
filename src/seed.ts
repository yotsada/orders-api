import { pathToFileURL } from 'node:url';
import { openDb, type DB } from './db.js';

import type { OrderStatus } from './orders/status.js';

// ข้อมูลตั้งต้น (ไม่สุ่ม → test คาดผลได้)
const CUSTOMERS = [
  ['Natthaya Srisuk', 'natthaya.s@example.com', '+66 81 111 0001'],
  ['Kittipong Wong', 'kittipong.w@example.com', '+66 81 111 0002'],
  ['Emily Carter', 'emily.carter@example.com', '+66 81 111 0003'],
  ['Somchai Prasert', 'somchai.p@example.com', '+66 81 111 0004'],
  ['Daniel Kim', 'daniel.kim@example.com', '+66 81 111 0005'],
  ['Pim Rattanakorn', 'pim.r@example.com', '+66 81 111 0006'],
  ['Liam OBrien', 'liam.ob@example.com', '+66 81 111 0007'],
  ['Suda Meesuk', 'suda.m@example.com', '+66 81 111 0008'],
] as const;

const PRODUCTS = [
  ['Wireless Keyboard K3', 320000],
  ['USB-C Hub 7-in-1', 290000],
  ['Aluminium Laptop Stand', 310000],
  ['Wireless Mouse M2', 89000],
  ['27" Monitor', 899000],
  ['Webcam HD', 145000],
] as const;

const STATUSES: OrderStatus[] = ['paid', 'pending', 'shipped', 'paid', 'cancelled', 'shipped', 'refunded', 'paid'];


const AOM = ['Aom Chaiyaporn', 'aom.c@example.com', '+66 81 234 5678'] as const;

type Item = { productName: string; quantity: number; unitPriceSatang: number };
type SeedOrder = {
  id: string; status: OrderStatus; customer: readonly [string, string, string];
  items: Item[]; createdAt: string;
};

// ออเดอร์ตัวอย่างตาม SPEC (ใช้ใน curl/test)
const FEATURED: Record<string, Partial<SeedOrder>> = {
  'ORD-10478': {
    status: 'paid', customer: AOM, createdAt: '2026-09-19T09:02:00Z',
    items: [
      { productName: 'Wireless Keyboard K3', quantity: 2, unitPriceSatang: 320000 },
      { productName: 'USB-C Hub 7-in-1', quantity: 1, unitPriceSatang: 290000 },
      { productName: 'Aluminium Laptop Stand', quantity: 1, unitPriceSatang: 310000 },
    ], // รวม 1,240,000 สตางค์
  },
  'ORD-10455': { status: 'pending', customer: AOM }, // Aom อีกออเดอร์ สถานะต่าง → ทดสอบ filter
};

const SEED_COUNT = 40;
const NEWEST_AT = Date.parse('2026-09-21T14:32:00Z');
const STEP_MS = 12 * 60 * 60 * 1000; // ห่างกันออเดอร์ละ 12 ชม.

// สร้าง 40 ออเดอร์: ORD-10482 (ใหม่สุด) → ORD-10443
export function buildSeedOrders(): SeedOrder[] {
  return Array.from({ length: SEED_COUNT }, (_, i) => {
    const id = `ORD-${10482 - i}`;
    const items: Item[] = Array.from({ length: (i % 3) + 1 }, (_, k) => {
      const [productName, unitPriceSatang] = PRODUCTS[(i + k) % PRODUCTS.length];
      return { productName, quantity: (k % 2) + 1, unitPriceSatang };
    });
    const base: SeedOrder = {
      id,
      status: STATUSES[i % STATUSES.length],
      customer: CUSTOMERS[i % CUSTOMERS.length],
      items,
      createdAt: new Date(NEWEST_AT - i * STEP_MS).toISOString().replace('.000Z', 'Z'),
    };
    return { ...base, ...FEATURED[id] };
  });
}

// ล้างแล้วใส่ใหม่ใน transaction เดียว (พังกลางทาง = rollback)
export function seed(db: DB): number {
  const orders = buildSeedOrders();
  const insertOrder = db.prepare(
    `INSERT INTO orders (id, status, customer_name, customer_email, customer_phone, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const insertItem = db.prepare(
    `INSERT INTO order_items (order_id, product_name, quantity, unit_price_satang) VALUES (?, ?, ?, ?)`,
  );
  db.transaction(() => {
    db.exec('DELETE FROM order_items; DELETE FROM orders;');
    for (const o of orders) {
      const [name, email, phone] = o.customer;
      insertOrder.run(o.id, o.status, name, email, phone, o.createdAt);
      for (const it of o.items) insertItem.run(o.id, it.productName, it.quantity, it.unitPriceSatang);
    }
  })();
  return orders.length;
}

// รันตรง ๆ (npm run seed) เท่านั้น · import จาก test จะไม่รันส่วนนี้
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const db = openDb();
  console.log(`seeded ${seed(db)} orders`);
  db.close();
}