import type { FastifyPluginAsync } from 'fastify';
import type { DB } from '../db.js';
import { ApiError } from '../errors.js';
import { getOrder, listOrders, updateStatus } from './repository.js';
import { canTransition, ORDER_STATUSES, type OrderStatus } from './status.js';

// ค่าคงที่ของ pagination (แก้จุดเดียว)
export const DEFAULT_PAGE_SIZE = 8;
export const MAX_PAGE_SIZE = 100;

interface ListQuery {
  page: number;
  pageSize: number;
  status?: OrderStatus;
  q?: string;
}

// schema: Fastify validate + แปลง "8" → 8 ให้ · ผิด → 400
const listQuerySchema = {
  type: 'object',
  properties: {
    page: { type: 'integer', minimum: 1, default: 1 },
    pageSize: { type: 'integer', minimum: 1, maximum: MAX_PAGE_SIZE, default: DEFAULT_PAGE_SIZE },
    status: { type: 'string', enum: ORDER_STATUSES },
    q: { type: 'string', maxLength: 100 },
  },
} as const;

// body ของ PATCH: ต้องมี status ที่อยู่ใน enum
const statusBodySchema = {
  type: 'object',
  required: ['status'],
  properties: { status: { type: 'string', enum: ORDER_STATUSES } },
} as const;

// รับ db จากภายนอก → test ส่ง DB ชั่วคราวเข้ามาได้
export const ordersRoutes =
  (db: DB): FastifyPluginAsync =>
  async (app) => {
    // GET /orders: รายการ + filter + แบ่งหน้า
    app.get<{ Querystring: ListQuery }>('/orders', { schema: { querystring: listQuerySchema } }, async (req) => {
      const { page, pageSize, status, q } = req.query;
      const { data, total } = listOrders(db, { page, pageSize, status, q });
      return { data, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
    });

    // GET /orders/:id: ออเดอร์เต็ม · ไม่พบ → 404
    app.get<{ Params: { id: string } }>('/orders/:id', async (req) => {
      const order = getOrder(db, req.params.id);
      if (!order) throw new ApiError(404, 'Order not found', req.params.id);
      return order;
    });

    // PATCH /orders/:id/status: 404 → 409 → อัปเดต → คืน order ใหม่
    app.patch<{ Params: { id: string }; Body: { status: OrderStatus } }>(
      '/orders/:id/status',
      { schema: { body: statusBodySchema } },
      async (req) => {
        const { id } = req.params;
        const to = req.body.status;

        const order = getOrder(db, id);
        if (!order) throw new ApiError(404, 'Order not found', id);

        const from = order.status;
        if (!canTransition(from, to) || !updateStatus(db, id, from, to)) {
          throw new ApiError(409, 'Invalid status transition', `${from} → ${to} is not allowed`);
        }
        return getOrder(db, id);
      },
    );
  };