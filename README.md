# Orders API (Dev Test — ส่วน B)

REST API สำหรับ Orders Dashboard · Node + Fastify + TypeScript + SQLite (better-sqlite3)

## รัน (3 คำสั่ง)

ต้องมี Node.js **22.9 ขึ้นไป** และอินเทอร์เน็ตตอน `npm install` (better-sqlite3 ดาวน์โหลด Node headers ระหว่างติดตั้ง)

```bash
npm install
npm run fresh   # seed 40 ออเดอร์ใหม่ + เปิด server ที่ http://localhost:3000
npm test        # integration test (ใช้ DB ชั่วคราว ไม่แตะข้อมูลจริง)
```

- ถ้าจะรีสตาร์ทโดยไม่ล้างข้อมูล ใช้ `npm run dev` (ข้อมูลอยู่ใน `data/orders.db`)
- ถ้าจะ reset ข้อมูลกลับเป็นชุดเริ่มต้น ใช้ `npm run seed`
- ข้อความ `.env not found. Continuing without it.` เป็นเรื่องปกติ ถ้าไม่มีไฟล์ `.env` จะใช้ค่า default

## ค่าตั้ง (ไม่บังคับ)

คัดลอก `.env.example` เป็น `.env` แล้วแก้ได้

| ตัวแปร | default |
|---|---|
| `PORT` | `3000` |
| `DB_PATH` | `data/orders.db` |
| `CORS_ORIGIN` | `http://localhost:5173` (Vite dev server ของ frontend) |

## Endpoints (base `/api/v1`)

| Method | Path | ผลลัพธ์ |
|---|---|---|
| GET | `/orders?page&pageSize&status&q` | 200 `{ data, meta }` · pageSize 1–100 · status ผิดหรือ pageSize ผิดได้ 400 |
| GET | `/orders/{id}` | 200 order เต็ม (รวม phone, items) · ไม่พบได้ 404 |
| PATCH | `/orders/{id}/status` body `{ "status": "shipped" }` | 200 order ใหม่ · ผิดกติกาได้ 409 · ไม่พบได้ 404 · body ผิดได้ 400 |

- `q` ค้นใน id, ชื่อ และอีเมล แบบไม่สนตัวพิมพ์ · เรียง `createdAt` ใหม่→เก่าเสมอ
- เงินเป็น integer สตางค์ (`totalSatang` คำนวณที่ server จาก items) · เวลาเป็น ISO 8601 UTC
- Error ทุกกรณีมีรูปแบบเดียว `{ "status": 404, "title": "Order not found", "detail": "ORD-99999" }` และ 500 ไม่ส่ง stack หรือ SQL กลับไป

State machine (`src/orders/status.ts`):

```
pending → paid | cancelled
paid    → shipped | refunded
shipped → refunded
cancelled, refunded → (เปลี่ยนต่อไม่ได้)
```

ตัวอย่าง:

```bash
curl "http://localhost:3000/api/v1/orders?status=paid&q=aom"
curl -X PATCH -H "content-type: application/json" -d '{"status":"shipped"}' \
  http://localhost:3000/api/v1/orders/ORD-10478/status
```

## โครงไฟล์

```
src/
  db.ts                 # เปิด SQLite + schema
  seed.ts               # 40 ออเดอร์ (ไม่สุ่ม → test คาดผลได้)
  errors.ts             # ApiError + global error handler
  app.ts                # buildApp(db) — ใช้ร่วมกันระหว่าง server และ test
  server.ts             # อ่าน env แล้ว listen
  orders/
    status.ts           # ORDER_STATUSES + ตาราง TRANSITIONS
    repository.ts       # SQL ทั้งหมด + map snake_case → camelCase
    routes.ts           # 3 endpoints + JSON Schema validation · MAX_PAGE_SIZE
tests/orders.test.ts    # ยิง HTTP จริง (port สุ่ม) กับไฟล์ DB ชั่วคราว
```
