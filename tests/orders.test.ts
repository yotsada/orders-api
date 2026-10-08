import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { openDb, type DB } from '../src/db.js';
import { MAX_PAGE_SIZE } from '../src/orders/routes.js';
import { seed } from '../src/seed.js';

// DB ไฟล์จริงแยกต่อการรัน test (ไม่แตะ data/orders.db)
const dir = mkdtempSync(join(tmpdir(), 'orders-test-'));
let db: DB;
let app: ReturnType<typeof buildApp>;
let base: string;

beforeAll(async () => {
  db = openDb(join(dir, 'test.db'));
  app = buildApp(db);
  await app.listen({ port: 0 }); // port สุ่ม → ยิง HTTP จริง
  const addr = app.server.address();
  if (!addr || typeof addr === 'string') throw new Error('no port');
  base = `http://127.0.0.1:${addr.port}/api/v1`;
});

beforeEach(() => seed(db)); // ข้อมูลตั้งต้นเหมือนกันทุกข้อ

afterAll(async () => {
  await app.close();
  db.close(); // Windows: ต้องปิดก่อนลบไฟล์
  rmSync(dir, { recursive: true, force: true });
});

// helper ยิง HTTP
const get = (path: string) => fetch(base + path);
const patchStatus = (id: string, status: string) =>
  fetch(`${base}/orders/${id}/status`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status }),
  });

describe('Orders API', () => {
  // 1) filter status + q → meta.total ถูก
  it('กรอง status + ค้นหา q แล้ว meta.total ถูกต้อง', async () => {
    const res = await get('/orders?status=paid&q=AOM'); // ตัวใหญ่ → ต้องไม่สนตัวพิมพ์
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      data: [{ id: 'ORD-10478', status: 'paid', totalSatang: 1240000 }],
      meta: { page: 1, pageSize: 8, total: 1, totalPages: 1 },
    });

    // ไม่กรอง status → เจอ Aom 2 ออเดอร์ (พิสูจน์ว่า status กรองจริง)
    const all = await get('/orders?q=aom');
    expect(await all.json()).toMatchObject({ meta: { total: 2 } });

    // total ต้องนับก่อนแบ่งหน้า (ไม่ใช่จำนวนแถวในหน้านี้)
    const paged = await get('/orders?status=paid&pageSize=5');
    const body = await paged.json();
    expect(body).toMatchObject({ meta: { pageSize: 5, total: 15, totalPages: 3 } });
    expect(body).toHaveProperty('data.length', 5);
  });

  // 2) id ไม่มี → 404 รูปแบบ error เดียว
  it('id ที่ไม่มีอยู่ → 404 ใน error format', async () => {
    const res = await get('/orders/ORD-99999');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ status: 404, title: 'Order not found', detail: 'ORD-99999' });
  });

  // 3) state machine: paid → shipped ได้ · cancelled → shipped ไม่ได้
  it('paid → shipped ได้ 200 · cancelled → shipped ได้ 409', async () => {
    const ok = await patchStatus('ORD-10478', 'shipped'); // seed: paid
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ id: 'ORD-10478', status: 'shipped' });

    const bad = await patchStatus('ORD-10470', 'shipped'); // seed: cancelled
    expect(bad.status).toBe(409);
    expect(await bad.json()).toMatchObject({ status: 409, title: 'Invalid status transition' });

    // 409 แล้ว DB ต้องไม่เปลี่ยน
    expect(await (await get('/orders/ORD-10470')).json()).toMatchObject({ status: 'cancelled' });
  });

  // (เสริม) pageSize เกินเพดาน → 400 · ใช้ค่าคงที่ → แก้เพดานแล้ว test ตามเอง
  it('pageSize เกิน MAX_PAGE_SIZE → 400', async () => {
    const res = await get(`/orders?pageSize=${MAX_PAGE_SIZE + 1}`);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ status: 400, title: 'Invalid request' });

    expect((await get(`/orders?pageSize=${MAX_PAGE_SIZE}`)).status).toBe(200);
  });
});