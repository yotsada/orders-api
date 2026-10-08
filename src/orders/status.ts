// สถานะทั้งหมด: แหล่งเดียว ใช้ทั้ง type + validation
export const ORDER_STATUSES = ['pending', 'paid', 'shipped', 'cancelled', 'refunded'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

// state machine: สถานะ → สถานะที่ไปต่อได้ (ตารางเดียว)
// Record<OrderStatus,...> → เพิ่มสถานะใหม่แล้วลืมใส่ที่นี่ = compile error
export const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending: ['paid', 'cancelled'],
  paid: ['shipped', 'refunded'],
  shipped: ['refunded'],
  cancelled: [],
  refunded: [],
};

export const canTransition = (from: OrderStatus, to: OrderStatus): boolean => TRANSITIONS[from].includes(to);