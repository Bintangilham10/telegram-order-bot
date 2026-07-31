import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";

test("migrasi menambah kolom manual payment tanpa menghapus order lama", async () => {
  const dataDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "ciganstore-migration-"),
  );
  const dbPath = path.join(dataDir, "legacy.db");
  const legacy = new Database(dbPath);
  legacy.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE products (
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
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      username TEXT NOT NULL DEFAULT '',
      first_name TEXT NOT NULL DEFAULT '',
      product_id INTEGER NOT NULL,
      product_name TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      unit_price INTEGER NOT NULL,
      price INTEGER NOT NULL,
      payment_provider TEXT NOT NULL DEFAULT 'sakurupiah',
      payment_method TEXT DEFAULT 'qris',
      transaction_id TEXT,
      qr_string TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      delivery_payload TEXT,
      created_at TEXT NOT NULL,
      expires_at TEXT,
      paid_at TEXT,
      delivered_at TEXT,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );
    INSERT INTO products (
      id, name, description, price, category, is_unlimited_stock,
      is_active, created_at, updated_at
    ) VALUES (1, 'Legacy Product', '', 10000, 'Legacy', 0, 1, datetime('now'), datetime('now'));
    INSERT INTO orders (
      id, user_id, product_id, product_name, quantity, unit_price, price,
      payment_provider, status, created_at
    ) VALUES (42, 9001, 1, 'Legacy Product', 1, 10000, 10000, 'sakurupiah', 'delivered', datetime('now'));
  `);
  legacy.close();

  const { initDb } = await import(`../src/db.js?migration=${Date.now()}`);
  const migrated = initDb(dbPath);
  const columns = migrated
    .prepare("PRAGMA table_info(orders)")
    .all()
    .map((column) => column.name);
  for (const expected of [
    "payment_proof_path",
    "proof_submitted_at",
    "payment_reviewed_by",
    "payment_confirmed_at",
    "allocated_stock_ids",
    "delivery_error",
    "delivery_attempts",
    "wallet_credited_at",
  ]) {
    assert.ok(
      columns.includes(expected),
      `missing migrated column ${expected}`,
    );
  }
  const oldOrder = migrated.prepare("SELECT * FROM orders WHERE id = 42").get();
  assert.equal(oldOrder.product_name, "Legacy Product");
  assert.equal(oldOrder.status, "delivered");
  assert.equal(migrated.pragma("foreign_keys", { simple: true }), 1);
  assert.equal(
    migrated
      .prepare(
        "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'payment_proof_sessions'",
      )
      .get().count,
    1,
  );
  assert.equal(
    migrated
      .prepare("SELECT value FROM settings WHERE key = 'payment_gateway'")
      .get().value,
    "wallet",
  );
  assert.equal(
    migrated
      .prepare("SELECT value FROM settings WHERE key = 'brand_name'")
      .get().value,
    "Ciganstore",
  );
  assert.equal(
    migrated
      .prepare("SELECT value FROM settings WHERE key = 'brand_short_name'")
      .get().value,
    "CIGAN",
  );
  migrated.close();
});
