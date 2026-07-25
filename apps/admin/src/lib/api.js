function resolveApiBaseUrl() {
  const fromEnv = String(import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/$/, '');
  if (fromEnv) return fromEnv;
  if (typeof window === 'undefined' || !window.location?.hostname) return '';
  return window.location.origin;
}

const base = resolveApiBaseUrl();

async function request(path, options = {}) {
  if (!base) throw new Error('Konfigurasi API belum ada. Set VITE_API_BASE_URL.');
  const res = await fetch(`${base}${path}`, {
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const json = await res.json().catch(() => ({
    ok: false,
    error: `Unexpected response from API (${res.status}). Periksa VITE_API_BASE_URL atau koneksi ke server.`,
  }));
  if (!res.ok || !json.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json.data;
}

async function requestForm(path, formData, options = {}) {
  if (!base) throw new Error('Konfigurasi API belum ada.');
  const res = await fetch(`${base}${path}`, {
    credentials: 'include',
    method: 'POST',
    body: formData,
    ...options,
  });
  const json = await res.json().catch(() => ({
    ok: false,
    error: `Unexpected response from API (${res.status}). Periksa VITE_API_BASE_URL atau koneksi ke server.`,
  }));
  if (!res.ok || !json.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json.data;
}

export const api = {
  login: (password) => request('/api/admin/login', { method: 'POST', body: JSON.stringify({ password }) }),
  logout: () => request('/api/admin/logout', { method: 'POST' }),
  bootstrap: () => request('/api/admin/bootstrap'),
  updateGeneralSettings: (payload) => request('/api/admin/settings/general', { method: 'POST', body: JSON.stringify(payload) }),
  updateBranding: (payload) => request('/api/admin/settings/branding', { method: 'POST', body: JSON.stringify(payload) }),
  telegramWebhookStatus: () => request('/api/admin/telegram/webhook/status'),
  telegramWebhookSetup: () => request('/api/admin/telegram/webhook/setup', { method: 'POST' }),
  telegramWebhookDelete: () => request('/api/admin/telegram/webhook/delete', { method: 'POST' }),
  products: () => request('/api/admin/products'),
  createProduct: (payload) => request('/api/admin/products', { method: 'POST', body: JSON.stringify(payload) }),
  updateProduct: (id, payload) => request(`/api/admin/products/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteProduct: (id) => request(`/api/admin/products/${id}`, { method: 'DELETE' }),
  productBuyers: (id) => request(`/api/admin/products/${id}/buyers`),
  notifyProductUpdate: (id, payload) => request(`/api/admin/products/${id}/notify-update`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  stock: (productId) => request(`/api/admin/stock/${productId}`),
  addStock: (productId, items, broadcast = true) => request(`/api/admin/stock/${productId}`, { method: 'POST', body: JSON.stringify({ items, broadcast }) }),
  deleteStock: (stockId) => request(`/api/admin/stock/item/${stockId}`, { method: 'DELETE' }),
  orders: (limit = 100) => request(`/api/admin/orders?limit=${limit}`),
  manualPayments: (limit = 200) => request(`/api/admin/manual-payments?limit=${limit}`),
  approvePayment: (id, note = '') => request(`/api/admin/orders/${id}/approve-payment`, {
    method: 'POST', body: JSON.stringify({ note }),
  }),
  rejectPayment: (id, reason, note = '') => request(`/api/admin/orders/${id}/reject-payment`, {
    method: 'POST', body: JSON.stringify({ reason, note }),
  }),
  requestNewProof: (id, reason, note = '') => request(`/api/admin/orders/${id}/request-new-proof`, {
    method: 'POST', body: JSON.stringify({ reason, note }),
  }),
  retryDelivery: (id) => request(`/api/admin/orders/${id}/retry-delivery`, { method: 'POST' }),
  paymentProofUrl: (id) => `${base}/api/admin/orders/${id}/payment-proof`,
  qrisImageUrl: () => `${base}/api/admin/payment/qris-image`,
  uploadQrisImage: (file) => {
    const form = new FormData();
    form.append('file', file);
    return requestForm('/api/admin/payment/qris-image', form);
  },
  users: (limit = 500) => request(`/api/admin/users?limit=${limit}`),
  broadcast: (payload) => request('/api/admin/broadcast', { method: 'POST', body: JSON.stringify(payload) }),
  broadcastJobs: (limit = 5) => request(`/api/admin/broadcast/jobs?limit=${limit}`),
  broadcastJob: (id) => request(`/api/admin/broadcast/jobs/${id}`),
  uploadDigitalFile: (file) => {
    const form = new FormData();
    form.append('file', file);
    return requestForm('/api/admin/uploads/digital-file', form);
  },
  // New: Reviews
  analytics: (days = 30) => request(`/api/admin/analytics?days=${days}`),
  reviews: () => request('/api/admin/reviews'),
  toggleReview: (id, visible) => request(`/api/admin/reviews/${id}/toggle`, { method: 'POST', body: JSON.stringify({ visible }) }),
  // New: Tickets
  tickets: (status) => request(`/api/admin/tickets${status ? `?status=${status}` : ''}`),
  ticket: (id) => request(`/api/admin/tickets/${id}`),
  replyTicket: (id, message) => request(`/api/admin/tickets/${id}/reply`, { method: 'POST', body: JSON.stringify({ message }) }),
  closeTicket: (id) => request(`/api/admin/tickets/${id}/close`, { method: 'POST' }),

  // Wallet Management
  wallets: () => request('/api/admin/wallets'),
  adjustWallet: (userId, amount, description) => request(`/api/admin/wallets/${userId}/adjust`, {
    method: 'POST', body: JSON.stringify({ amount, description }),
  }),
  // User Management
  userDetail: (userId) => request(`/api/admin/users/${userId}/detail`),
  blockUser: (userId, blocked) => request(`/api/admin/users/${userId}/block`, {
    method: 'POST', body: JSON.stringify({ blocked }),
  }),
  // Maintenance
  getMaintenanceStatus: () => request('/api/admin/maintenance'),
  setMaintenance: (enabled) => request('/api/admin/maintenance', {
    method: 'POST', body: JSON.stringify({ enabled }),
  }),
  // Backup
  triggerBackup: () => request('/api/admin/backup', { method: 'POST' }),
  listBackups: () => request('/api/admin/backups'),
  // Audit
  auditLogs: () => request('/api/admin/audit-logs'),
};
