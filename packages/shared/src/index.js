export const ORDER_STATUS = {
  PENDING_PAYMENT: 'pending_payment',
  WAITING_CONFIRMATION: 'waiting_confirmation',
  PAYMENT_REJECTED: 'payment_rejected',
  DELIVERY_PENDING: 'delivery_pending',
  DELIVERING: 'delivering',
  PAID: 'paid',
  DELIVERED: 'delivered',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
  FAILED: 'failed',
};

export const TICKET_STATUS = {
  OPEN: 'open',
  REPLIED: 'replied',
  CLOSED: 'closed',
};

export const WALLET_TX_TYPE = {
  TOPUP: 'topup',
  PURCHASE: 'purchase',
  REFUND: 'refund',
};
