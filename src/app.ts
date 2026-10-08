import cors from '@fastify/cors';
import Fastify from 'fastify';
import type { DB } from './db.js';
import { registerErrorHandlers } from './errors.js';
import { ordersRoutes } from './orders/routes.js';

interface AppOptions {
  logger?: boolean;
  corsOrigin?: string; // origin ของ frontend · ไม่ส่ง = ไม่เปิด CORS
}

// สร้าง app (ยังไม่ listen) → server.ts และ test ใช้ร่วมกัน
export function buildApp(db: DB, opts: AppOptions = {}) {
  const app = Fastify({ logger: opts.logger ?? false });
  registerErrorHandlers(app);
  // CORS: อนุญาตเฉพาะ origin ที่ตั้งไว้ · รวม PATCH (preflight)
  if (opts.corsOrigin) app.register(cors, { origin: opts.corsOrigin, methods: ['GET', 'PATCH'] });
  app.register(ordersRoutes(db), { prefix: '/api/v1' });
  return app;
}