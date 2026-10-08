import type { DB } from '../db.js';
import type { OrderStatus } from './status.js';

// รูปแบบ JSON ฝั่ง API (camelCase)
export interface OrderSummary {
  id: string;
  status: OrderStatus;
  customer: { name: string; email: string };
  totalSatang: number;
  createdAt: string;
}

// Order เต็ม (สำหรับ drawer)
export interface LineItem {
  productName: string;
  quantity: number;
  unitPriceSatang: number;
}
export interface Order extends Omit<OrderSummary, 'customer'> {
  customer: { name: string; email: string; phone: string };
  items: LineItem[];
}

export interface ListParams {
  page: number;
  pageSize: number;
  status?: OrderStatus;
  q?: string;
}

// แถวจาก DB (snake_case)
interface OrderRow {
  id: string;
  status: OrderStatus;
  customer_name: string;
  customer_email: string;
  total_satang: number;
  created_at: string;
}

interface OrderDetailRow extends OrderRow {
  customer_phone: string;
}

interface ItemRow {
  product_name: string;
  quantity: number;
  unit_price_satang: number;
}

// ยอดรวม: server คำนวณจาก items ทุกครั้ง
const TOTAL_SQL = `COALESCE((SELECT SUM(i.quantity * i.unit_price_satang)
                             FROM order_items i WHERE i.order_id = o.id), 0)`;

// กัน % และ _ ที่ผู้ใช้พิมพ์ ไม่ให้กลายเป็น wildcard
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

// map snake_case → camelCase (จุดเดียว)
const toSummary = (r: OrderRow): OrderSummary => ({
  id: r.id,
  status: r.status,
  customer: { name: r.customer_name, email: r.customer_email },
  totalSatang: r.total_satang,
  createdAt: r.created_at,
});

// รายการ + filter + แบ่งหน้า
export function listOrders(db: DB, p: ListParams): { data: OrderSummary[]; total: number } {
  const where: string[] = [];
  const args: (string | number)[] = [];

  if (p.status) {
    where.push('o.status = ?');
    args.push(p.status);
  }
  if (p.q) {
    // LIKE ของ SQLite ไม่สนตัวพิมพ์ (A-Z)
    where.push(`(o.id LIKE ? ESCAPE '\\' OR o.customer_name LIKE ? ESCAPE '\\' OR o.customer_email LIKE ? ESCAPE '\\')`);
    const pattern = `%${escapeLike(p.q)}%`;
    args.push(pattern, pattern, pattern);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  // total = นับหลัง filter ก่อนแบ่งหน้า
  const countRow = db.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM orders o ${whereSql}`).get(...args);

  // เรียงใหม่→เก่าเสมอ · id เป็นตัวตัดสินเมื่อเวลาเท่ากัน (หน้าไม่ซ้ำ/ไม่หาย)
  const rows = db
    .prepare<unknown[], OrderRow>(
      `SELECT o.id, o.status, o.customer_name, o.customer_email, o.created_at, ${TOTAL_SQL} AS total_satang
       FROM orders o ${whereSql}
       ORDER BY o.created_at DESC, o.id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...args, p.pageSize, (p.page - 1) * p.pageSize);

  return { data: rows.map(toSummary), total: countRow?.n ?? 0 };
}

// ออเดอร์เดียว + items · ไม่พบ → undefined
export function getOrder(db: DB, id: string): Order | undefined {
  const row = db
    .prepare<[string], OrderDetailRow>(
      `SELECT o.id, o.status, o.customer_name, o.customer_email, o.customer_phone, o.created_at,
              ${TOTAL_SQL} AS total_satang
       FROM orders o WHERE o.id = ?`,
    )
    .get(id);
  if (!row) return undefined;

  const items = db
    .prepare<[string], ItemRow>(
      `SELECT product_name, quantity, unit_price_satang FROM order_items WHERE order_id = ? ORDER BY id`,
    )
    .all(id);

  return {
    ...toSummary(row),
    customer: { name: row.customer_name, email: row.customer_email, phone: row.customer_phone },
    items: items.map((i) => ({ productName: i.product_name, quantity: i.quantity, unitPriceSatang: i.unit_price_satang })),
  };
}


// เปลี่ยนสถานะ · WHERE status = from กันคนอื่นแก้ไปก่อน → คืน false
export function updateStatus(db: DB, id: string, from: OrderStatus, to: OrderStatus): boolean {
  const res = db.prepare('UPDATE orders SET status = ? WHERE id = ? AND status = ?').run(to, id, from);
  return res.changes === 1;
}