import { buildApp } from './app.js';
import { openDb } from './db.js';

// ค่าตั้งจาก env (ดู .env.example) · ไม่ตั้ง = ค่า default
const PORT = Number(process.env.PORT ?? 3000);
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? 'http://localhost:5173'; // Vite dev server

// จุดเริ่มโปรแกรม: เปิด DB → listen
const app = buildApp(openDb(), { logger: true, corsOrigin: CORS_ORIGIN });

app.listen({ port: PORT }).catch((err: unknown) => {
  app.log.error(err);
  process.exit(1);
});