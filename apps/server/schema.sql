-- BelugawBot v2.0 — Unified schema (migrated from Cloudflare D1)
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ============ CORE TABLES ============

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price INTEGER NOT NULL,
  category TEXT NOT NULL DEFAULT 'Umum',
  product_image_url TEXT,
  is_unlimited_stock INTEGER NOT NULL DEFAULT 0,
  digital_file_pointer TEXT,
  delivery_note TEXT,
  terms_url TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS stock_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  data TEXT NOT NULL,
  is_sold INTEGER NOT NULL DEFAULT 0,
  sold_to_user_id INTEGER,
  sold_at TEXT,
  sold_in_order_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  username TEXT NOT NULL DEFAULT '',
  first_name TEXT NOT NULL DEFAULT '',
  product_id INTEGER NOT NULL,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price INTEGER NOT NULL,
  price INTEGER NOT NULL,
  payment_provider TEXT NOT NULL DEFAULT 'manual',
  payment_method TEXT DEFAULT 'qris',
  transaction_id TEXT,
  qr_string TEXT,
  status TEXT NOT NULL DEFAULT 'pending_payment',
  delivery_payload TEXT,
  payment_proof_path TEXT,
  payment_proof_mime TEXT,
  proof_submitted_at TEXT,
  payment_reviewed_by TEXT,
  payment_rejection_reason TEXT,
  payment_review_action TEXT,
  admin_note TEXT,
  payment_confirmed_at TEXT,
  allocated_stock_ids TEXT,
  stock_allocated_at TEXT,
  delivery_error TEXT,
  delivery_attempted_at TEXT,
  delivery_attempts INTEGER NOT NULL DEFAULT 0,
  delivery_started_at TEXT,
  wallet_credited_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT,
  paid_at TEXT,
  delivered_at TEXT,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS users (
  user_id INTEGER PRIMARY KEY,
  username TEXT NOT NULL DEFAULT '',
  first_name TEXT NOT NULL DEFAULT '',
  is_blocked INTEGER NOT NULL DEFAULT 0,
  blocked_at TEXT,
  last_active TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  payload TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS download_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT NOT NULL UNIQUE,
  order_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  object_key TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  max_downloads INTEGER NOT NULL DEFAULT 5,
  download_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS broadcast_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  status TEXT NOT NULL DEFAULT 'queued',
  message TEXT NOT NULL,
  button_text TEXT,
  button_url TEXT,
  recipients INTEGER NOT NULL DEFAULT 0,
  sent INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  blocked INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  started_at TEXT,
  finished_at TEXT
);

CREATE TABLE IF NOT EXISTS payment_proof_sessions (
  user_id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

-- ============ NEW FEATURE TABLES ============

-- Reviews / Ratings
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL UNIQUE,
  product_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  username TEXT NOT NULL DEFAULT '',
  first_name TEXT NOT NULL DEFAULT '',
  rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
  comment TEXT DEFAULT '',
  is_visible INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (order_id) REFERENCES orders(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

-- Wallet / Balance
CREATE TABLE IF NOT EXISTS wallets (
  user_id INTEGER PRIMARY KEY,
  balance INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  balance_after INTEGER NOT NULL DEFAULT 0,
  reference_id TEXT,
  description TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);

-- Support Tickets
CREATE TABLE IF NOT EXISTS support_tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  username TEXT NOT NULL DEFAULT '',
  first_name TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS ticket_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL,
  sender_type TEXT NOT NULL DEFAULT 'user',
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE
);

-- ============ INDEXES ============

CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category, is_active);
CREATE INDEX IF NOT EXISTS idx_stock_product_unsold ON stock_items(product_id, is_sold);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status_created ON orders(status, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_tx_unique ON orders(transaction_id);
CREATE INDEX IF NOT EXISTS idx_users_active_broadcast ON users(is_blocked);
CREATE INDEX IF NOT EXISTS idx_download_tokens_order_id ON download_tokens(order_id);
CREATE INDEX IF NOT EXISTS idx_download_tokens_user_id ON download_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_jobs_created ON broadcast_jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id, is_visible);
CREATE INDEX IF NOT EXISTS idx_reviews_user ON reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_user ON wallet_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_user ON support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket ON ticket_messages(ticket_id);

-- ============ DEFAULT SETTINGS ============

INSERT OR IGNORE INTO settings (key, value) VALUES ('payment_gateway', 'wallet');
INSERT OR IGNORE INTO settings (key, value) VALUES ('manual_payment_enabled', '');
INSERT OR IGNORE INTO settings (key, value) VALUES ('manual_payment_method_name', 'GoPay Merchant QR');
INSERT OR IGNORE INTO settings (key, value) VALUES ('manual_payment_account_name', '');
INSERT OR IGNORE INTO settings (key, value) VALUES ('manual_payment_qris_image', '');
INSERT OR IGNORE INTO settings (key, value) VALUES ('manual_payment_instructions', '');
INSERT OR IGNORE INTO settings (key, value) VALUES ('order_expiry_minutes', '');
INSERT OR IGNORE INTO settings (key, value) VALUES ('checkout_expiry_minutes', '60');
INSERT OR IGNORE INTO settings (key, value) VALUES ('brand_name', 'Ciganstore');
INSERT OR IGNORE INTO settings (key, value) VALUES ('brand_short_name', 'CIGAN');
INSERT OR IGNORE INTO settings (key, value) VALUES ('brand_tagline', 'Belanja produk digital menggunakan saldo wallet dengan pengiriman instan.');
INSERT OR IGNORE INTO settings (key, value) VALUES ('broadcast_title', 'Pengumuman Resmi');
INSERT OR IGNORE INTO settings (key, value) VALUES ('support_telegram_url', '');
INSERT OR IGNORE INTO settings (key, value) VALUES ('support_whatsapp_url', '');
INSERT OR IGNORE INTO settings (key, value) VALUES ('wallet_topup_enabled', '1');
INSERT OR IGNORE INTO settings (key, value) VALUES ('wallet_min_topup', '1');
INSERT OR IGNORE INTO settings (key, value) VALUES ('review_enabled', '1');

-- Menjaga foreign key tetap aktif untuk order top-up wallet.
INSERT OR IGNORE INTO products (
  id, name, description, price, category, is_unlimited_stock, is_active, created_at, updated_at
) VALUES (
  0, 'Wallet Top Up', 'Produk sistem untuk top-up wallet', 0, 'Sistem', 1, 0, datetime('now'), datetime('now')
);



