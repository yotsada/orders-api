import { STATUS_CODES } from 'node:http';
import type { FastifyError, FastifyInstance } from 'fastify';

// error ที่ตั้งใจโยน (404/409/...) → ส่งตามนี้ตรง ๆ
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly title: string,
    public readonly detail: string,
  ) {
    super(title);
  }
}

// รูปแบบ error เดียวทุก endpoint (SPEC §5)
interface ErrorBody {
  status: number;
  title: string;
  detail: string;
}

// ติดตั้ง handler กลาง
export function registerErrorHandlers(app: FastifyInstance) {
  app.setErrorHandler((err: FastifyError, req, reply) => {
    let body: ErrorBody;

    if (err instanceof ApiError) {
      body = { status: err.status, title: err.title, detail: err.detail };
    } else if (err.validation) {
      // query/body ไม่ผ่าน schema
      body = { status: 400, title: 'Invalid request', detail: err.message };
    } else if (err.statusCode && err.statusCode < 500) {
      // 4xx อื่นจาก Fastify เช่น JSON พัง
      body = { status: err.statusCode, title: STATUS_CODES[err.statusCode] ?? 'Bad Request', detail: err.message };
    } else {
      // 500: log เต็มฝั่ง server · ส่งกลับแค่ข้อความกลาง ๆ
      req.log.error(err);
      body = { status: 500, title: 'Internal Server Error', detail: 'Unexpected error' };
    }
    return reply.status(body.status).send(body);
  });

  // path ไม่มี → 404 รูปแบบเดียวกัน
  app.setNotFoundHandler((req, reply) => {
    const body: ErrorBody = { status: 404, title: 'Route not found', detail: `${req.method} ${req.url}` };
    return reply.status(404).send(body);
  });
}