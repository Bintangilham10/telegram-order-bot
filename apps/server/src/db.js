// Database module: better-sqlite3 (sync) — migrated from Cloudflare D1
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function nowIso() {
  return new Date().toISOString();
}

let _db = null;

export function initDb(dbPath) {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  _db = new Database(dbPath);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");

  // Run schema
  const schemaPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../schema.sql",
  );
  if (fs.existsSync(schemaPath)) {
    const schema = fs.readFileSync(schemaPath, "utf8");
    _db.exec(schema);
  }

  // Migrations: add columns that may not exist yet
  const migrations = [
    "ALTER TABLE orders ADD COLUMN payment_ref TEXT",
    "ALTER TABLE orders ADD COLUMN qr_image_url TEXT",
    "ALTER TABLE orders ADD COLUMN payment_proof_path TEXT",
    "ALTER TABLE orders ADD COLUMN payment_proof_mime TEXT",
    "ALTER TABLE orders ADD COLUMN proof_submitted_at TEXT",
    "ALTER TABLE orders ADD COLUMN payment_reviewed_by TEXT",
    "ALTER TABLE orders ADD COLUMN payment_rejection_reason TEXT",
    "ALTER TABLE orders ADD COLUMN payment_review_action TEXT",
    "ALTER TABLE orders ADD COLUMN admin_note TEXT",
    "ALTER TABLE orders ADD COLUMN payment_confirmed_at TEXT",
    "ALTER TABLE orders ADD COLUMN allocated_stock_ids TEXT",
    "ALTER TABLE orders ADD COLUMN stock_allocated_at TEXT",
    "ALTER TABLE orders ADD COLUMN delivery_error TEXT",
    "ALTER TABLE orders ADD COLUMN delivery_attempted_at TEXT",
    "ALTER TABLE orders ADD COLUMN delivery_attempts INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE orders ADD COLUMN delivery_started_at TEXT",
    "ALTER TABLE orders ADD COLUMN wallet_credited_at TEXT",
  ];
  for (const sql of migrations) {
    try {
      _db.prepare(sql).run();
    } catch {
      /* column already exists */
    }
  }
  _db.exec(
    "CREATE INDEX IF NOT EXISTS idx_orders_manual_review ON orders(payment_provider, status, proof_submitted_at)",
  );
  _db
    .prepare(
      `UPDATE settings SET value = ''
     WHERE key IN ('sakurupiah_api_id', 'sakurupiah_api_key')`,
    )
    .run();
  _db
    .prepare(
      `INSERT INTO settings (key, value) VALUES ('payment_gateway', 'wallet')
     ON CONFLICT(key) DO UPDATE SET value = 'wallet'`,
    )
    .run();
  _db
    .prepare(
      `UPDATE settings SET value = 'Ciganstore'
       WHERE key IN ('brand_name', 'manual_payment_account_name')
         AND value = 'Boslay Store'`,
    )
    .run();
  _db
    .prepare(
      `UPDATE settings SET value = 'CIGAN'
       WHERE key = 'brand_short_name' AND value = 'BSLY'`,
    )
    .run();

  return _db;
}

export function getRawDb() {
  return _db;
}

export function createDb() {
  if (!_db) throw new Error("Database not initialized. Call initDb() first.");
  const db = _db;

  return {
    // ============ USERS ============
    upsertUser(user) {
      db.prepare(
        `INSERT INTO users (user_id, username, first_name, last_active)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           username = excluded.username,
           first_name = excluded.first_name,
           last_active = excluded.last_active`,
      ).run(user.id, user.username || "", user.first_name || "", nowIso());
    },

    getUser(userId) {
      return (
        db
          .prepare("SELECT * FROM users WHERE user_id = ? LIMIT 1")
          .get(userId) || null
      );
    },

    // ============ PRODUCTS ============
    getProducts() {
      return db
        .prepare(
          `
        SELECT p.*, CASE
          WHEN p.is_unlimited_stock = 1 THEN 999999
          ELSE (SELECT COUNT(*) FROM stock_items s WHERE s.product_id = p.id AND s.is_sold = 0)
        END AS stock_count
        FROM products p WHERE p.is_active = 1 ORDER BY p.id ASC
      `,
        )
        .all();
    },

    getProductsByCategory(category) {
      return db
        .prepare(
          `
        SELECT p.*, CASE
          WHEN p.is_unlimited_stock = 1 THEN 999999
          ELSE (SELECT COUNT(*) FROM stock_items s WHERE s.product_id = p.id AND s.is_sold = 0)
        END AS stock_count
        FROM products p WHERE p.is_active = 1 AND p.category = ? ORDER BY p.id ASC
      `,
        )
        .all(category);
    },

    getCategories() {
      return db
        .prepare(
          `SELECT DISTINCT category, COUNT(*) as count FROM products WHERE is_active = 1 GROUP BY category ORDER BY category ASC`,
        )
        .all();
    },

    getProductById(id) {
      return (
        db
          .prepare(
            `
        SELECT p.*, CASE
          WHEN p.is_unlimited_stock = 1 THEN 999999
          ELSE (SELECT COUNT(*) FROM stock_items s WHERE s.product_id = p.id AND s.is_sold = 0)
        END AS stock_count
        FROM products p WHERE p.id = ? LIMIT 1
      `,
          )
          .get(id) || null
      );
    },

    addProduct({
      name,
      description,
      price,
      category,
      is_unlimited_stock = 0,
      digital_file_pointer = null,
      delivery_note = null,
      terms_url = null,
    }) {
      const now = nowIso();
      const result = db
        .prepare(
          `INSERT INTO products (name, description, price, category, is_unlimited_stock, digital_file_pointer, delivery_note, terms_url, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        )
        .run(
          name,
          description || "",
          price,
          category || "Umum",
          is_unlimited_stock ? 1 : 0,
          is_unlimited_stock ? digital_file_pointer || null : null,
          delivery_note || null,
          terms_url || null,
          now,
          now,
        );
      return result.lastInsertRowid;
    },

    updateProduct(id, data) {
      db.prepare(
        `UPDATE products SET name = ?, description = ?, price = ?, category = ?,
         is_unlimited_stock = ?, digital_file_pointer = ?, delivery_note = ?, terms_url = ?, updated_at = ?
         WHERE id = ?`,
      ).run(
        data.name,
        data.description || "",
        data.price,
        data.category || "Umum",
        data.is_unlimited_stock ? 1 : 0,
        data.is_unlimited_stock ? data.digital_file_pointer || null : null,
        data.delivery_note || null,
        data.terms_url || null,
        nowIso(),
        id,
      );
    },

    deleteProduct(id) {
      db.prepare(
        "UPDATE products SET is_active = 0, updated_at = ? WHERE id = ?",
      ).run(nowIso(), id);
    },

    // ============ STOCK ============
    listStock(productId) {
      return db
        .prepare(
          "SELECT * FROM stock_items WHERE product_id = ? ORDER BY is_sold ASC, id DESC",
        )
        .all(productId);
    },

    addStockItems(productId, items) {
      const now = nowIso();
      const insert = db.prepare(
        "INSERT INTO stock_items (product_id, data, is_sold, created_at) VALUES (?, ?, 0, ?)",
      );
      const tx = db.transaction((productId, items) => {
        for (const item of items) {
          insert.run(productId, item, now);
        }
        return items.length;
      });
      return tx(productId, items);
    },

    deleteUnsoldStockById(stockId) {
      db.prepare("DELETE FROM stock_items WHERE id = ? AND is_sold = 0").run(
        stockId,
      );
    },

    reserveStock(productId, quantity) {
      return db
        .prepare(
          "SELECT id, data FROM stock_items WHERE product_id = ? AND is_sold = 0 ORDER BY id ASC LIMIT ?",
        )
        .all(productId, quantity);
    },

    markStockSold(stockIds, userId, orderId = null) {
      if (!stockIds.length) return;
      const stamp = nowIso();
      const update = db.prepare(
        "UPDATE stock_items SET is_sold = 1, sold_to_user_id = ?, sold_at = ?, sold_in_order_id = ? WHERE id = ?",
      );
      const tx = db.transaction(() => {
        for (const id of stockIds) {
          update.run(userId, stamp, orderId, id);
        }
      });
      tx();
    },

    // ============ ORDERS ============
    createOrderIfStockAvailable(order) {
      const now = nowIso();
      const result = db
        .prepare(
          `INSERT INTO orders (
          user_id, username, first_name, product_id, product_name,
          quantity, unit_price, price, payment_provider, transaction_id, qr_string, qr_image_url,
          status, created_at, expires_at
        )
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_payment', ?, ?
        WHERE (SELECT is_unlimited_stock FROM products WHERE id = ?) = 1
        OR (
          (SELECT COUNT(*) FROM stock_items s WHERE s.product_id = ? AND s.is_sold = 0) -
          (SELECT COALESCE(SUM(o.quantity), 0) FROM orders o
           WHERE o.product_id = ?
             AND o.status IN ('pending_payment', 'waiting_confirmation', 'payment_rejected', 'delivery_pending')
             AND o.allocated_stock_ids IS NULL
             AND (o.expires_at IS NULL OR o.expires_at > ?))
        ) >= ?`,
        )
        .run(
          order.user_id,
          order.username || "",
          order.first_name || "",
          order.product_id,
          order.product_name,
          order.quantity,
          order.unit_price,
          order.price,
          order.payment_provider || "manual",
          order.transaction_id || null,
          order.qr_string || null,
          order.qr_image_url || null,
          now,
          order.expires_at,
          order.product_id,
          order.product_id,
          order.product_id,
          now,
          order.quantity,
        );
      if (!result?.changes) return null;
      return result.lastInsertRowid;
    },

    createPlaceholderOrder(params) {
      const now = nowIso();
      const buyer = db
        .prepare("SELECT is_blocked FROM users WHERE user_id = ? LIMIT 1")
        .get(params.user_id);
      if (Number(buyer?.is_blocked) === 1) {
        throw new Error("USER_BLOCKED:Akun diblokir dan tidak dapat checkout.");
      }
      // Atomic: check pending + insert dalam 1 transaksi (anti race condition)
      const result = db
        .prepare(
          `INSERT INTO orders (
          user_id, username, first_name, product_id, product_name,
          quantity, unit_price, price, payment_provider, payment_method, transaction_id, status, created_at, expires_at
        )
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, 'manual', 'qris', NULL, 'pending_payment', ?, ?
        WHERE NOT EXISTS (
          SELECT 1 FROM orders
          WHERE user_id = ?
            AND status IN ('pending_payment', 'waiting_confirmation', 'payment_rejected', 'delivery_pending', 'delivering')
        )`,
        )
        .run(
          params.user_id,
          params.username || "",
          params.first_name || "",
          params.product_id,
          params.product_name,
          params.quantity,
          params.unit_price,
          params.price,
          now,
          params.expires_at,
          params.user_id,
        );
      if (!result?.changes) {
        throw new Error("DUPLICATE_ORDER:Masih ada order pending.");
      }
      return result.lastInsertRowid;
    },
    createWalletTopupOrder(params) {
      const amount = Number(params.amount);
      const transactionId = String(params.transaction_id || "").trim();
      if (!Number.isSafeInteger(amount) || amount < 1) {
        throw new Error(
          "INVALID_AMOUNT:Nominal top up harus bilangan Rupiah bulat minimal Rp 1.",
        );
      }
      if (!transactionId || transactionId.length > 200) {
        throw new Error(
          "INVALID_TRANSACTION:Identitas permintaan top up tidak valid.",
        );
      }

      const txn = db.transaction(() => {
        const existing = db
          .prepare(
            "SELECT id FROM orders WHERE transaction_id = ? AND user_id = ? LIMIT 1",
          )
          .get(transactionId, params.user_id);
        if (existing) return { orderId: existing.id, idempotent: true };

        const buyer = db
          .prepare("SELECT is_blocked FROM users WHERE user_id = ? LIMIT 1")
          .get(params.user_id);
        if (Number(buyer?.is_blocked) === 1) {
          throw new Error(
            "USER_BLOCKED:Akun diblokir dan tidak dapat melakukan top up.",
          );
        }

        const active = db
          .prepare(
            `SELECT id FROM orders
           WHERE user_id = ?
             AND product_id = 0
             AND payment_provider = 'manual'
             AND status IN ('pending_payment', 'waiting_confirmation', 'payment_rejected', 'delivery_pending', 'delivering')
           LIMIT 1`,
          )
          .get(params.user_id);
        if (active)
          throw new Error("DUPLICATE_TOPUP:Masih ada top up yang aktif.");

        const now = nowIso();
        const result = db
          .prepare(
            `INSERT INTO orders (
            user_id, username, first_name, product_id, product_name,
            quantity, unit_price, price, payment_provider, payment_method,
            transaction_id, status, created_at, expires_at
          ) VALUES (?, ?, ?, 0, 'Wallet Top Up', 1, ?, ?, 'manual', 'gopay_qr', ?, 'pending_payment', ?, ?)`,
          )
          .run(
            params.user_id,
            params.username || "",
            params.first_name || "",
            amount,
            amount,
            transactionId,
            now,
            params.expires_at,
          );
        return { orderId: result.lastInsertRowid, idempotent: false };
      });
      return txn();
    },

    deleteOrder(orderId) {
      db.prepare("DELETE FROM orders WHERE id = ?").run(orderId);
    },

    updateOrderStatus(orderId, status) {
      const paidAt = status === "paid" ? nowIso() : null;
      const deliveredAt = status === "delivered" ? nowIso() : null;
      db.prepare(
        "UPDATE orders SET status = ?, paid_at = COALESCE(?, paid_at), delivered_at = COALESCE(?, delivered_at) WHERE id = ?",
      ).run(status, paidAt, deliveredAt, orderId);
    },

    setOrderDeliveryPayload(orderId, payload) {
      db.prepare("UPDATE orders SET delivery_payload = ? WHERE id = ?").run(
        payload ? JSON.stringify(payload) : null,
        orderId,
      );
    },

    getOrderById(orderId) {
      return (
        db.prepare("SELECT * FROM orders WHERE id = ? LIMIT 1").get(orderId) ||
        null
      );
    },

    getOrderDeliveryByUser(orderId, userId) {
      return (
        db
          .prepare(
            "SELECT id, status, delivery_payload, delivered_at FROM orders WHERE id = ? AND user_id = ? LIMIT 1",
          )
          .get(orderId, userId) || null
      );
    },

    getOrdersByUser(userId, limit = 10) {
      return db
        .prepare(
          "SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT ?",
        )
        .all(userId, limit);
    },

    getAllOrders(limit = 100) {
      return db
        .prepare("SELECT * FROM orders ORDER BY id DESC LIMIT ?")
        .all(limit);
    },

    // ============ MANUAL PAYMENT ============
    startPaymentProofSession(userId, orderId) {
      const order = db
        .prepare(
          `SELECT id, user_id, status, expires_at FROM orders
         WHERE id = ? AND user_id = ? LIMIT 1`,
        )
        .get(orderId, userId);
      if (!order) throw new Error("ORDER_NOT_FOUND:Order tidak ditemukan.");
      if (
        order.expires_at &&
        new Date(order.expires_at).getTime() <= Date.now()
      ) {
        db.prepare(
          `UPDATE orders SET status = 'expired'
           WHERE id = ? AND status IN ('pending_payment', 'payment_rejected')`,
        ).run(orderId);
        throw new Error("INVALID_STATUS:Order sudah kedaluwarsa.");
      }
      if (!["pending_payment", "payment_rejected"].includes(order.status)) {
        throw new Error(
          `INVALID_STATUS:Bukti tidak dapat dikirim untuk order berstatus ${order.status}.`,
        );
      }
      db.prepare(
        `INSERT INTO payment_proof_sessions (user_id, order_id, created_at)
         VALUES (?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           order_id = excluded.order_id,
           created_at = excluded.created_at`,
      ).run(userId, orderId, nowIso());
      return order;
    },

    getPaymentProofSession(userId) {
      return (
        db
          .prepare(
            `SELECT s.user_id, s.order_id, s.created_at, o.status
         FROM payment_proof_sessions s
         JOIN orders o ON o.id = s.order_id
         WHERE s.user_id = ? LIMIT 1`,
          )
          .get(userId) || null
      );
    },

    submitPaymentProof({ userId, orderId, path: proofPath, mime }) {
      const tx = db.transaction(() => {
        const session = db
          .prepare(
            "SELECT order_id FROM payment_proof_sessions WHERE user_id = ? LIMIT 1",
          )
          .get(userId);
        if (!session || Number(session.order_id) !== Number(orderId)) {
          throw new Error(
            "PROOF_SESSION_MISSING:Sesi pengiriman bukti tidak ditemukan.",
          );
        }

        const previous = db
          .prepare(
            "SELECT payment_proof_path FROM orders WHERE id = ? AND user_id = ? LIMIT 1",
          )
          .get(orderId, userId);
        const result = db
          .prepare(
            `UPDATE orders
           SET payment_proof_path = ?,
               payment_proof_mime = ?,
               proof_submitted_at = ?,
               status = 'waiting_confirmation',
               payment_rejection_reason = NULL,
               payment_review_action = NULL,
               delivery_error = NULL
           WHERE id = ?
             AND user_id = ?
             AND status IN ('pending_payment', 'payment_rejected')
             AND (expires_at IS NULL OR expires_at > ?)`,
          )
          .run(proofPath, mime, nowIso(), orderId, userId, nowIso());
        if (result.changes !== 1) {
          throw new Error(
            "INVALID_STATUS:Status order sudah berubah. Bukti tidak disimpan.",
          );
        }
        db.prepare("DELETE FROM payment_proof_sessions WHERE user_id = ?").run(
          userId,
        );
        return previous?.payment_proof_path || null;
      });
      return tx();
    },

    cancelOrderByUser(orderId, userId) {
      const result = db
        .prepare(
          `UPDATE orders SET status = 'cancelled'
         WHERE id = ? AND user_id = ?
           AND status IN ('pending_payment', 'payment_rejected')`,
        )
        .run(orderId, userId);
      if (result.changes) {
        db.prepare("DELETE FROM payment_proof_sessions WHERE order_id = ?").run(
          orderId,
        );
      }
      return result.changes === 1;
    },

    expireManualOrders(now = nowIso()) {
      const tx = db.transaction(() => {
        const rows = db
          .prepare(
            `SELECT * FROM orders
           WHERE payment_provider = 'manual'
             AND status IN ('pending_payment', 'payment_rejected')
             AND expires_at IS NOT NULL
             AND expires_at <= ?`,
          )
          .all(now);
        if (!rows.length) return [];
        const expire = db.prepare(
          `UPDATE orders SET status = 'expired'
           WHERE id = ? AND status IN ('pending_payment', 'payment_rejected')`,
        );
        const clearSession = db.prepare(
          "DELETE FROM payment_proof_sessions WHERE order_id = ?",
        );
        const expired = [];
        for (const row of rows) {
          if (expire.run(row.id).changes === 1) {
            clearSession.run(row.id);
            expired.push({ ...row, status: "expired" });
          }
        }
        return expired;
      });
      return tx();
    },

    listManualPayments(limit = 200) {
      return db
        .prepare(
          `SELECT * FROM orders
         WHERE payment_provider = 'manual'
         ORDER BY
           CASE status
             WHEN 'waiting_confirmation' THEN 0
             WHEN 'delivery_pending' THEN 1
             WHEN 'delivering' THEN 2
             WHEN 'payment_rejected' THEN 3
             ELSE 4
           END,
           id DESC
         LIMIT ?`,
        )
        .all(Math.min(500, Math.max(1, limit)));
    },

    approveManualPayment(orderId, actor, note = "") {
      const tx = db.transaction(() => {
        const current = db
          .prepare("SELECT * FROM orders WHERE id = ? LIMIT 1")
          .get(orderId);
        if (!current) throw new Error("ORDER_NOT_FOUND:Order tidak ditemukan.");
        if (
          ["delivery_pending", "delivering", "delivered"].includes(
            current.status,
          )
        ) {
          return { changed: false, order: current };
        }
        if (current.status !== "waiting_confirmation") {
          throw new Error(
            `INVALID_STATUS:Order berstatus ${current.status}, bukan waiting_confirmation.`,
          );
        }
        const stamp = nowIso();
        const result = db
          .prepare(
            `UPDATE orders
           SET status = 'delivery_pending',
               payment_reviewed_by = ?,
               payment_review_action = 'approved',
               admin_note = ?,
               payment_rejection_reason = NULL,
               payment_confirmed_at = ?,
               delivery_error = NULL
           WHERE id = ? AND status = 'waiting_confirmation'`,
          )
          .run(String(actor || "admin"), String(note || ""), stamp, orderId);
        const order = db
          .prepare("SELECT * FROM orders WHERE id = ? LIMIT 1")
          .get(orderId);
        return { changed: result.changes === 1, order };
      });
      return tx();
    },

    rejectManualPayment(
      orderId,
      actor,
      reason,
      requestNewProof = false,
      note = "",
      newExpiresAt = null,
    ) {
      const action = requestNewProof ? "request_new_proof" : "rejected";
      const result = db
        .prepare(
          `UPDATE orders
         SET status = 'payment_rejected',
             payment_reviewed_by = ?,
             payment_review_action = ?,
             payment_rejection_reason = ?,
             admin_note = ?,
             payment_confirmed_at = NULL,
             expires_at = CASE WHEN ? = 1 THEN ? ELSE expires_at END
          WHERE id = ? AND status = 'waiting_confirmation'`,
        )
        .run(
          String(actor || "admin"),
          action,
          String(reason || ""),
          String(note || ""),
          requestNewProof ? 1 : 0,
          requestNewProof
            ? newExpiresAt || new Date(Date.now() + 3600000).toISOString()
            : null,
          orderId,
        );
      if (result.changes !== 1) {
        const current = db
          .prepare("SELECT * FROM orders WHERE id = ? LIMIT 1")
          .get(orderId);
        if (!current) throw new Error("ORDER_NOT_FOUND:Order tidak ditemukan.");
        throw new Error(
          `INVALID_STATUS:Order berstatus ${current.status}, bukan waiting_confirmation.`,
        );
      }
      return db
        .prepare("SELECT * FROM orders WHERE id = ? LIMIT 1")
        .get(orderId);
    },

    claimOrderDelivery(orderId) {
      const tx = db.transaction(() => {
        const current = db
          .prepare("SELECT * FROM orders WHERE id = ? LIMIT 1")
          .get(orderId);
        if (!current) throw new Error("ORDER_NOT_FOUND:Order tidak ditemukan.");
        if (current.status !== "delivery_pending") {
          return { claimed: false, order: current, stock: [] };
        }

        const stamp = nowIso();
        const claim = db
          .prepare(
            `UPDATE orders
           SET status = 'delivering',
               delivery_started_at = ?,
               delivery_attempted_at = ?,
               delivery_attempts = delivery_attempts + 1,
               delivery_error = NULL
           WHERE id = ? AND status = 'delivery_pending'`,
          )
          .run(stamp, stamp, orderId);
        if (claim.changes !== 1) {
          return {
            claimed: false,
            order: db
              .prepare("SELECT * FROM orders WHERE id = ? LIMIT 1")
              .get(orderId),
            stock: [],
          };
        }

        let order = db
          .prepare("SELECT * FROM orders WHERE id = ? LIMIT 1")
          .get(orderId);
        if (
          Number(order.product_id) === 0 &&
          order.product_name === "Wallet Top Up"
        ) {
          return { claimed: true, order, stock: [] };
        }

        let stock = [];
        if (order.allocated_stock_ids) {
          const ids = JSON.parse(order.allocated_stock_ids);
          if (Array.isArray(ids) && ids.length) {
            const placeholders = ids.map(() => "?").join(",");
            const rows = db
              .prepare(
                `SELECT id, data FROM stock_items
               WHERE sold_in_order_id = ? AND id IN (${placeholders})
               ORDER BY id ASC`,
              )
              .all(orderId, ...ids);
            const byId = new Map(rows.map((row) => [Number(row.id), row]));
            stock = ids.map((id) => byId.get(Number(id))).filter(Boolean);
          } else if (Array.isArray(ids)) {
            const product = db
              .prepare("SELECT * FROM products WHERE id = ? LIMIT 1")
              .get(order.product_id);
            if (
              product &&
              Number(product.is_unlimited_stock) === 1 &&
              product.digital_file_pointer
            ) {
              stock = Array.from({ length: order.quantity }, () => ({
                id: null,
                data: product.digital_file_pointer,
              }));
            }
          }
        } else {
          const product = db
            .prepare("SELECT * FROM products WHERE id = ? LIMIT 1")
            .get(order.product_id);
          if (!product)
            throw new Error("PRODUCT_NOT_FOUND:Produk tidak ditemukan.");
          if (
            Number(product.is_unlimited_stock) === 1 &&
            product.digital_file_pointer
          ) {
            stock = Array.from({ length: order.quantity }, () => ({
              id: null,
              data: product.digital_file_pointer,
            }));
            db.prepare(
              "UPDATE orders SET allocated_stock_ids = ?, stock_allocated_at = ? WHERE id = ?",
            ).run("[]", stamp, orderId);
          } else {
            stock = db
              .prepare(
                `SELECT id, data FROM stock_items
               WHERE product_id = ? AND is_sold = 0
               ORDER BY id ASC LIMIT ?`,
              )
              .all(order.product_id, order.quantity);
            if (stock.length < order.quantity) {
              throw new Error(
                "STOCK_UNAVAILABLE:Stok tidak cukup untuk order yang sudah dibayar.",
              );
            }
            const allocate = db.prepare(
              `UPDATE stock_items
               SET is_sold = 1, sold_to_user_id = ?, sold_at = ?, sold_in_order_id = ?
               WHERE id = ? AND is_sold = 0`,
            );
            for (const item of stock) {
              if (
                allocate.run(order.user_id, stamp, orderId, item.id).changes !==
                1
              ) {
                throw new Error("STOCK_RACE:Stok berubah saat dialokasikan.");
              }
            }
            db.prepare(
              "UPDATE orders SET allocated_stock_ids = ?, stock_allocated_at = ? WHERE id = ?",
            ).run(JSON.stringify(stock.map((item) => item.id)), stamp, orderId);
          }
        }

        if (stock.length < order.quantity) {
          throw new Error(
            "ALLOCATED_STOCK_MISSING:Alokasi stok order tidak lengkap.",
          );
        }
        order = db
          .prepare("SELECT * FROM orders WHERE id = ? LIMIT 1")
          .get(orderId);
        return { claimed: true, order, stock };
      });
      return tx();
    },

    failOrderDelivery(orderId, errorMessage) {
      const result = db
        .prepare(
          `UPDATE orders
         SET status = 'delivery_pending', delivery_error = ?
         WHERE id = ? AND status = 'delivering'`,
        )
        .run(
          String(errorMessage || "Pengiriman gagal").slice(0, 2000),
          orderId,
        );
      return result.changes === 1;
    },

    recordDeliveryPreparationError(orderId, errorMessage) {
      db.prepare(
        `UPDATE orders SET delivery_error = ?
         WHERE id = ? AND status = 'delivery_pending'`,
      ).run(
        String(errorMessage || "Persiapan pengiriman gagal").slice(0, 2000),
        orderId,
      );
    },

    completeOrderDelivery(orderId, payload) {
      const result = db
        .prepare(
          `UPDATE orders
         SET status = 'delivered',
             delivery_payload = ?,
             delivered_at = ?,
             delivery_error = NULL
         WHERE id = ? AND status = 'delivering'`,
        )
        .run(payload ? JSON.stringify(payload) : null, nowIso(), orderId);
      return result.changes === 1;
    },

    creditWalletTopupAndComplete(orderId) {
      const tx = db.transaction(() => {
        const order = db
          .prepare("SELECT * FROM orders WHERE id = ? LIMIT 1")
          .get(orderId);
        if (!order) throw new Error("ORDER_NOT_FOUND:Order tidak ditemukan.");
        if (order.status === "delivered" && order.wallet_credited_at) {
          return {
            changed: false,
            balance: this.getWallet(order.user_id).balance,
            order,
          };
        }
        if (
          order.status !== "delivering" ||
          Number(order.product_id) !== 0 ||
          order.product_name !== "Wallet Top Up"
        ) {
          throw new Error(
            `INVALID_STATUS:Top-up tidak dapat diselesaikan dari status ${order.status}.`,
          );
        }

        const amount = Number(order.unit_price);
        if (!Number.isSafeInteger(amount) || amount < 1) {
          throw new Error(
            "INVALID_AMOUNT:Nominal top up pada order tidak valid.",
          );
        }
        const stamp = nowIso();
        const complete = db
          .prepare(
            `UPDATE orders
           SET status = 'delivered',
               wallet_credited_at = ?,
               delivered_at = ?,
               delivery_error = NULL
           WHERE id = ? AND status = 'delivering' AND wallet_credited_at IS NULL`,
          )
          .run(stamp, stamp, order.id);
        if (complete.changes !== 1) {
          throw new Error(
            "CREDIT_CONFLICT:Top up sudah diproses atau status order berubah.",
          );
        }

        const wallet = this.getWallet(order.user_id);
        const balance = Number(wallet.balance) + amount;
        db.prepare(
          "UPDATE wallets SET balance = ?, updated_at = ? WHERE user_id = ?",
        ).run(balance, stamp, order.user_id);
        db.prepare(
          `INSERT INTO wallet_transactions
           (user_id, type, amount, balance_after, reference_id, description, created_at)
           VALUES (?, 'topup', ?, ?, ?, ?, ?)`,
        ).run(
          order.user_id,
          amount,
          balance,
          String(order.id),
          `Top Up via pembayaran manual - Order #${order.id}`,
          stamp,
        );
        return {
          changed: true,
          balance,
          order: db
            .prepare("SELECT * FROM orders WHERE id = ? LIMIT 1")
            .get(orderId),
        };
      });
      return tx();
    },

    // ============ DOWNLOAD TOKENS ============
    createDownloadToken({
      token,
      orderId,
      userId,
      objectKey,
      expiresAt,
      maxDownloads = 5,
    }) {
      db.prepare(
        `INSERT INTO download_tokens (token, order_id, user_id, object_key, expires_at, max_downloads, download_count, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
      ).run(
        token,
        orderId,
        userId,
        objectKey,
        expiresAt,
        maxDownloads,
        nowIso(),
      );
    },

    getDownloadToken(token) {
      return (
        db
          .prepare("SELECT * FROM download_tokens WHERE token = ? LIMIT 1")
          .get(token) || null
      );
    },

    incrementDownloadCount(token) {
      db.prepare(
        "UPDATE download_tokens SET download_count = download_count + 1 WHERE token = ?",
      ).run(token);
    },

    // ============ SETTINGS ============
    getSetting(key, fallback = "") {
      const row = db
        .prepare("SELECT value FROM settings WHERE key = ? LIMIT 1")
        .get(key);
      return row?.value ?? fallback;
    },

    setSetting(key, value) {
      db.prepare(
        `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      ).run(key, value);
    },

    // ============ DASHBOARD / STATS ============
    getDashboardStats() {
      const now = new Date();
      const startOfToday = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
      ).toISOString();
      const startOfYesterday = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() - 1,
      ).toISOString();
      const start7d = new Date(now.getTime() - 7 * 86400000).toISOString();
      const start14d = new Date(now.getTime() - 14 * 86400000).toISOString();

      const products = db
        .prepare("SELECT COUNT(*) AS count FROM products WHERE is_active = 1")
        .get();
      const users = db.prepare("SELECT COUNT(*) AS count FROM users").get();
      const pendingOrders = db
        .prepare(
          "SELECT COUNT(*) AS count FROM orders WHERE status IN ('pending', 'pending_payment', 'waiting_confirmation', 'payment_rejected')",
        )
        .get();
      const paidOrders = db
        .prepare(
          "SELECT COUNT(*) AS count FROM orders WHERE product_id <> 0 AND status IN ('paid', 'delivery_pending', 'delivering', 'delivered')",
        )
        .get();
      const revenue = db
        .prepare(
          "SELECT COALESCE(SUM(price), 0) AS total FROM orders WHERE product_id <> 0 AND status IN ('paid', 'delivery_pending', 'delivering', 'delivered')",
        )
        .get();
      const revenueToday = db
        .prepare(
          "SELECT COALESCE(SUM(price), 0) AS total FROM orders WHERE product_id <> 0 AND status IN ('paid', 'delivery_pending', 'delivering', 'delivered') AND created_at >= ?",
        )
        .get(startOfToday);
      const revenueYesterday = db
        .prepare(
          "SELECT COALESCE(SUM(price), 0) AS total FROM orders WHERE product_id <> 0 AND status IN ('paid', 'delivery_pending', 'delivering', 'delivered') AND created_at >= ? AND created_at < ?",
        )
        .get(startOfYesterday, startOfToday);
      const ordersToday = db
        .prepare("SELECT COUNT(*) AS count FROM orders WHERE created_at >= ?")
        .get(startOfToday);
      const revenue7d = db
        .prepare(
          "SELECT COALESCE(SUM(price), 0) AS total FROM orders WHERE product_id <> 0 AND status IN ('paid', 'delivery_pending', 'delivering', 'delivered') AND created_at >= ?",
        )
        .get(start7d);
      const ordersLast7d = db
        .prepare(
          "SELECT COUNT(*) AS count FROM orders WHERE product_id <> 0 AND status IN ('paid', 'delivery_pending', 'delivering', 'delivered') AND created_at >= ?",
        )
        .get(start7d);
      const sparkRows = db
        .prepare(
          "SELECT substr(created_at, 1, 10) AS day, COALESCE(SUM(price), 0) AS revenue, COUNT(*) AS orders FROM orders WHERE product_id <> 0 AND status IN ('paid', 'delivery_pending', 'delivering', 'delivered') AND created_at >= ? GROUP BY day ORDER BY day ASC",
        )
        .all(start14d);
      const newUsers7d = db
        .prepare("SELECT COUNT(*) AS count FROM users WHERE created_at >= ?")
        .get(start7d);

      const sparkMap = Object.fromEntries(sparkRows.map((r) => [r.day, r]));
      const spark = [];
      for (let i = 13; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 86400000);
        const day = d.toISOString().slice(0, 10);
        const row = sparkMap[day];
        spark.push({
          day,
          label: day.slice(5),
          revenue: Number(row?.revenue || 0),
          orders: Number(row?.orders || 0),
        });
      }

      return {
        totalProducts: Number(products?.count || 0),
        totalUsers: Number(users?.count || 0),
        pendingOrders: Number(pendingOrders?.count || 0),
        paidOrders: Number(paidOrders?.count || 0),
        totalRevenue: Number(revenue?.total || 0),
        revenueToday: Number(revenueToday?.total || 0),
        revenueYesterday: Number(revenueYesterday?.total || 0),
        ordersToday: Number(ordersToday?.count || 0),
        revenue7d: Number(revenue7d?.total || 0),
        ordersLast7d: Number(ordersLast7d?.count || 0),
        newUsers7d: Number(newUsers7d?.count || 0),
        spark,
      };
    },

    // ============ ANALYTICS (NEW) ============
    getAnalytics(days = 30) {
      const start = new Date(Date.now() - days * 86400000).toISOString();

      const dailyRevenue = db
        .prepare(
          `
        SELECT substr(created_at, 1, 10) AS day, COALESCE(SUM(price), 0) AS revenue, COUNT(*) AS orders
        FROM orders WHERE product_id <> 0 AND status IN ('paid', 'delivery_pending', 'delivering', 'delivered') AND created_at >= ?
        GROUP BY day ORDER BY day ASC
      `,
        )
        .all(start);

      const topProducts = db
        .prepare(
          `
        SELECT product_name, product_id, COUNT(*) AS total_orders, SUM(price) AS total_revenue
        FROM orders WHERE product_id <> 0 AND status IN ('paid', 'delivery_pending', 'delivering', 'delivered') AND created_at >= ?
        GROUP BY product_id ORDER BY total_revenue DESC LIMIT 10
      `,
        )
        .all(start);

      const categoryRevenue = db
        .prepare(
          `
        SELECT p.category, COUNT(o.id) AS orders, SUM(o.price) AS revenue
        FROM orders o JOIN products p ON o.product_id = p.id
        WHERE o.status IN ('paid', 'delivery_pending', 'delivering', 'delivered') AND o.created_at >= ?
        GROUP BY p.category ORDER BY revenue DESC
      `,
        )
        .all(start);

      const hourlyDistribution = db
        .prepare(
          `
        SELECT CAST(substr(created_at, 12, 2) AS INTEGER) AS hour, COUNT(*) AS orders
        FROM orders WHERE product_id <> 0 AND status IN ('paid', 'delivery_pending', 'delivering', 'delivered') AND created_at >= ?
        GROUP BY hour ORDER BY hour ASC
      `,
        )
        .all(start);

      const conversionRate = (() => {
        const total = db
          .prepare(
            "SELECT COUNT(*) AS c FROM orders WHERE product_id <> 0 AND created_at >= ?",
          )
          .get(start);
        const paid = db
          .prepare(
            "SELECT COUNT(*) AS c FROM orders WHERE product_id <> 0 AND status IN ('paid', 'delivery_pending', 'delivering', 'delivered') AND created_at >= ?",
          )
          .get(start);
        return total?.c > 0
          ? (((paid?.c || 0) / total.c) * 100).toFixed(1)
          : "0.0";
      })();

      const avgOrderValue = db
        .prepare(
          "SELECT AVG(price) AS avg FROM orders WHERE product_id <> 0 AND status IN ('paid', 'delivery_pending', 'delivering', 'delivered') AND created_at >= ?",
        )
        .get(start);

      return {
        dailyRevenue,
        topProducts,
        categoryRevenue,
        hourlyDistribution,
        conversionRate: Number(conversionRate),
        avgOrderValue: Math.round(Number(avgOrderValue?.avg || 0)),
      };
    },

    // ============ USERS (ADMIN) ============
    getUsersOverview(limit = 500) {
      return db
        .prepare(
          `
        SELECT u.user_id, u.username, u.first_name, u.last_active, u.is_blocked,
          COALESCE((SELECT COUNT(*) FROM orders o WHERE o.user_id = u.user_id), 0) AS total_orders,
          COALESCE((SELECT COUNT(*) FROM orders o WHERE o.user_id = u.user_id AND o.product_id <> 0 AND o.status IN ('paid', 'delivery_pending', 'delivering', 'delivered')), 0) AS paid_orders,
          COALESCE((SELECT SUM(o.price) FROM orders o WHERE o.user_id = u.user_id AND o.product_id <> 0 AND o.status IN ('paid', 'delivery_pending', 'delivering', 'delivered')), 0) AS total_spent,
          COALESCE((SELECT balance FROM wallets w WHERE w.user_id = u.user_id), 0) AS wallet_balance
        FROM users u ORDER BY u.last_active DESC LIMIT ?
      `,
        )
        .all(Math.min(2000, Math.max(1, limit)));
    },

    getActiveUsersPage({ afterUserId = 0, pageSize = 500 } = {}) {
      return db
        .prepare(
          `
        SELECT user_id, username, first_name FROM users
        WHERE is_blocked = 0 AND user_id > ? ORDER BY user_id ASC LIMIT ?
      `,
        )
        .all(Number(afterUserId) || 0, Math.min(2000, Math.max(1, pageSize)));
    },

    countActiveUsers() {
      const row = db
        .prepare("SELECT COUNT(*) AS count FROM users WHERE is_blocked = 0")
        .get();
      return Number(row?.count || 0);
    },

    markUserBlocked(userId) {
      db.prepare(
        "UPDATE users SET is_blocked = 1, blocked_at = ? WHERE user_id = ?",
      ).run(nowIso(), userId);
    },

    // ============ BROADCAST ============
    createBroadcastJob({ message, buttonText, buttonUrl, recipients }) {
      const result = db
        .prepare(
          `INSERT INTO broadcast_jobs (status, message, button_text, button_url, recipients, created_at)
         VALUES ('queued', ?, ?, ?, ?, ?)`,
        )
        .run(
          message,
          buttonText || null,
          buttonUrl || null,
          recipients,
          nowIso(),
        );
      return result.lastInsertRowid;
    },

    markBroadcastJobRunning(jobId) {
      db.prepare(
        "UPDATE broadcast_jobs SET status = 'running', started_at = ? WHERE id = ?",
      ).run(nowIso(), jobId);
    },

    incrementBroadcastJobCounters(
      jobId,
      { sent = 0, failed = 0, blocked = 0 } = {},
    ) {
      if (!sent && !failed && !blocked) return;
      db.prepare(
        "UPDATE broadcast_jobs SET sent = sent + ?, failed = failed + ?, blocked = blocked + ? WHERE id = ?",
      ).run(Number(sent), Number(failed), Number(blocked), jobId);
    },

    finishBroadcastJob(jobId, { status = "done", lastError = null } = {}) {
      db.prepare(
        "UPDATE broadcast_jobs SET status = ?, last_error = ?, finished_at = ? WHERE id = ?",
      ).run(status, lastError, nowIso(), jobId);
    },

    getBroadcastJob(jobId) {
      return (
        db
          .prepare("SELECT * FROM broadcast_jobs WHERE id = ? LIMIT 1")
          .get(jobId) || null
      );
    },

    getRecentBroadcastJobs(limit = 5) {
      return db
        .prepare("SELECT * FROM broadcast_jobs ORDER BY id DESC LIMIT ?")
        .all(Math.min(50, Math.max(1, limit)));
    },

    // ============ PRODUCT BUYERS ============
    getProductBuyers(productId) {
      return db
        .prepare(
          `
        SELECT DISTINCT user_id, MAX(id) AS latest_order_id, MAX(first_name) AS first_name, MAX(username) AS username
        FROM orders WHERE product_id = ? AND status IN ('paid', 'delivery_pending', 'delivering', 'delivered')
        GROUP BY user_id ORDER BY user_id ASC
      `,
        )
        .all(productId);
    },

    // ============ AUDIT LOG ============
    insertAudit(action, actor, payload = null) {
      db.prepare(
        "INSERT INTO admin_audit_logs (action, actor, payload, created_at) VALUES (?, ?, ?, ?)",
      ).run(action, actor, payload ? JSON.stringify(payload) : null, nowIso());
    },

    // ============ REVIEWS (NEW) ============
    addReview({
      orderId,
      productId,
      userId,
      username,
      firstName,
      rating,
      comment,
    }) {
      const result = db
        .prepare(
          `INSERT INTO reviews (order_id, product_id, user_id, username, first_name, rating, comment, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          orderId,
          productId,
          userId,
          username || "",
          firstName || "",
          rating,
          comment || "",
          nowIso(),
        );
      return result.lastInsertRowid;
    },

    getProductReviews(productId, limit = 50) {
      return db
        .prepare(
          "SELECT * FROM reviews WHERE product_id = ? AND is_visible = 1 ORDER BY id DESC LIMIT ?",
        )
        .all(productId, limit);
    },

    getProductRating(productId) {
      const row = db
        .prepare(
          "SELECT AVG(rating) AS avg, COUNT(*) AS count FROM reviews WHERE product_id = ? AND is_visible = 1",
        )
        .get(productId);
      return {
        avg: row?.avg ? Number(row.avg.toFixed(1)) : 0,
        count: Number(row?.count || 0),
      };
    },

    getAllReviews(limit = 100) {
      return db
        .prepare(
          `
        SELECT r.*, p.name AS product_name FROM reviews r
        JOIN products p ON r.product_id = p.id
        ORDER BY r.id DESC LIMIT ?
      `,
        )
        .all(limit);
    },

    toggleReviewVisibility(reviewId, visible) {
      db.prepare("UPDATE reviews SET is_visible = ? WHERE id = ?").run(
        visible ? 1 : 0,
        reviewId,
      );
    },

    hasReviewed(orderId) {
      const row = db
        .prepare("SELECT id FROM reviews WHERE order_id = ? LIMIT 1")
        .get(orderId);
      return !!row;
    },

    // ============ WALLET (NEW) ============
    getWallet(userId) {
      let wallet = db
        .prepare("SELECT * FROM wallets WHERE user_id = ? LIMIT 1")
        .get(userId);
      if (!wallet) {
        db.prepare(
          "INSERT OR IGNORE INTO wallets (user_id, balance, updated_at) VALUES (?, 0, ?)",
        ).run(userId, nowIso());
        wallet = { user_id: userId, balance: 0, updated_at: nowIso() };
      }
      return wallet;
    },

    addWalletTransaction(
      userId,
      type,
      amount,
      description = "",
      referenceId = null,
    ) {
      const tx = db.transaction(() => {
        const wallet = this.getWallet(userId);
        const newBalance = wallet.balance + amount;
        if (newBalance < 0) throw new Error("Saldo tidak cukup");
        db.prepare(
          "UPDATE wallets SET balance = ?, updated_at = ? WHERE user_id = ?",
        ).run(newBalance, nowIso(), userId);
        db.prepare(
          `INSERT INTO wallet_transactions (user_id, type, amount, balance_after, reference_id, description, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          userId,
          type,
          amount,
          newBalance,
          referenceId,
          description,
          nowIso(),
        );
        return newBalance;
      });
      return tx();
    },

    getWalletTransactions(userId, limit = 30) {
      return db
        .prepare(
          "SELECT * FROM wallet_transactions WHERE user_id = ? ORDER BY id DESC LIMIT ?",
        )
        .all(userId, limit);
    },

    // ============ SUPPORT TICKETS (NEW) ============
    createTicket(userId, username, firstName, subject, message) {
      const now = nowIso();
      const tx = db.transaction(() => {
        const result = db
          .prepare(
            `INSERT INTO support_tickets (user_id, username, first_name, subject, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'open', ?, ?)`,
          )
          .run(userId, username || "", firstName || "", subject, now, now);
        const ticketId = result.lastInsertRowid;
        db.prepare(
          `INSERT INTO ticket_messages (ticket_id, sender_type, message, created_at) VALUES (?, 'user', ?, ?)`,
        ).run(ticketId, message, now);
        return ticketId;
      });
      return tx();
    },

    addTicketMessage(ticketId, senderType, message) {
      const now = nowIso();
      db.prepare(
        "INSERT INTO ticket_messages (ticket_id, sender_type, message, created_at) VALUES (?, ?, ?, ?)",
      ).run(ticketId, senderType, message, now);
      const newStatus = senderType === "admin" ? "replied" : "open";
      db.prepare(
        "UPDATE support_tickets SET status = ?, updated_at = ? WHERE id = ?",
      ).run(newStatus, now, ticketId);
    },

    getTicket(ticketId) {
      return (
        db
          .prepare("SELECT * FROM support_tickets WHERE id = ? LIMIT 1")
          .get(ticketId) || null
      );
    },

    getTicketMessages(ticketId) {
      return db
        .prepare(
          "SELECT * FROM ticket_messages WHERE ticket_id = ? ORDER BY id ASC",
        )
        .all(ticketId);
    },

    getTicketsByUser(userId, limit = 20) {
      return db
        .prepare(
          "SELECT * FROM support_tickets WHERE user_id = ? ORDER BY id DESC LIMIT ?",
        )
        .all(userId, limit);
    },

    getAllTickets(status = null, limit = 100) {
      if (status) {
        return db
          .prepare(
            "SELECT * FROM support_tickets WHERE status = ? ORDER BY updated_at DESC LIMIT ?",
          )
          .all(status, limit);
      }
      return db
        .prepare(
          "SELECT * FROM support_tickets ORDER BY CASE status WHEN 'open' THEN 0 WHEN 'replied' THEN 1 ELSE 2 END, updated_at DESC LIMIT ?",
        )
        .all(limit);
    },

    closeTicket(ticketId) {
      db.prepare(
        "UPDATE support_tickets SET status = 'closed', closed_at = ?, updated_at = ? WHERE id = ?",
      ).run(nowIso(), nowIso(), ticketId);
    },

    // ============ WALLET ADMIN ============
    getAllWallets(limit = 500) {
      return db
        .prepare(
          `
        SELECT w.user_id, w.balance, w.updated_at,
          u.username, u.first_name, u.last_active
        FROM wallets w LEFT JOIN users u ON w.user_id = u.user_id
        ORDER BY w.balance DESC LIMIT ?
      `,
        )
        .all(Math.min(2000, limit));
    },

    adjustWalletBalance(userId, amount, description, actor = "admin") {
      const tx = db.transaction(() => {
        const wallet = this.getWallet(userId);
        const newBalance = wallet.balance + amount;
        if (newBalance < 0) throw new Error("Saldo tidak boleh negatif");
        db.prepare(
          "UPDATE wallets SET balance = ?, updated_at = ? WHERE user_id = ?",
        ).run(newBalance, nowIso(), userId);
        db.prepare(
          `INSERT INTO wallet_transactions (user_id, type, amount, balance_after, reference_id, description, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          userId,
          amount >= 0 ? "admin_credit" : "admin_debit",
          amount,
          newBalance,
          `adj_${Date.now()}`,
          description || `Manual adjustment by ${actor}`,
          nowIso(),
        );
        return newBalance;
      });
      return tx();
    },

    // Atomic wallet checkout: validate product + check stock/balance + debit exactly once.
    walletCheckout(orderParams) {
      const quantity = Number(orderParams.quantity);
      const productId = Number(orderParams.product_id);
      const transactionId = String(orderParams.transaction_id || "").trim();
      if (!Number.isSafeInteger(productId) || productId < 1) {
        throw new Error("PRODUCT_NOT_FOUND:Produk tidak ditemukan.");
      }
      if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10) {
        throw new Error(
          "INVALID_QUANTITY:Jumlah pembelian harus antara 1 sampai 10.",
        );
      }
      if (!transactionId || transactionId.length > 200) {
        throw new Error("INVALID_TRANSACTION:Identitas checkout tidak valid.");
      }

      const txn = db.transaction(() => {
        const existing = db
          .prepare(
            "SELECT * FROM orders WHERE transaction_id = ? AND user_id = ? LIMIT 1",
          )
          .get(transactionId, orderParams.user_id);
        if (existing) {
          const wallet = this.getWallet(orderParams.user_id);
          return {
            orderId: existing.id,
            balance: Number(wallet.balance),
            total: Number(existing.price),
            idempotent: true,
          };
        }

        const buyer = db
          .prepare("SELECT is_blocked FROM users WHERE user_id = ? LIMIT 1")
          .get(orderParams.user_id);
        if (Number(buyer?.is_blocked) === 1)
          throw new Error(
            "USER_BLOCKED:Akun diblokir dan tidak dapat checkout.",
          );
        const product = db
          .prepare(
            "SELECT * FROM products WHERE id = ? AND is_active = 1 LIMIT 1",
          )
          .get(productId);
        if (!product)
          throw new Error(
            "PRODUCT_NOT_FOUND:Produk tidak ditemukan atau sudah tidak aktif.",
          );
        const nominal = Number(product.price) * quantity;
        if (!Number.isSafeInteger(nominal) || nominal < 1) {
          throw new Error("INVALID_AMOUNT:Harga produk tidak valid.");
        }
        const wallet = this.getWallet(orderParams.user_id);
        if (Number(wallet.balance) < nominal) {
          throw new Error(
            `INSUFFICIENT:Saldo wallet tidak cukup. Saldo saat ini Rp ${Number(wallet.balance) || 0}.`,
          );
        }

        const now = nowIso();
        const result = db
          .prepare(
            `INSERT INTO orders (
            user_id, username, first_name, product_id, product_name,
            quantity, unit_price, price, payment_provider, payment_method,
            transaction_id, status, created_at, paid_at
          )
          SELECT ?, ?, ?, ?, ?, ?, ?, ?, 'wallet', 'wallet', ?, 'delivery_pending', ?, ?
          WHERE (SELECT is_unlimited_stock FROM products WHERE id = ?) = 1
          OR (
            (SELECT COUNT(*) FROM stock_items s WHERE s.product_id = ? AND s.is_sold = 0) -
            (SELECT COALESCE(SUM(o.quantity), 0) FROM orders o
             WHERE o.product_id = ?
               AND o.status IN ('pending_payment', 'waiting_confirmation', 'payment_rejected', 'delivery_pending')
               AND o.allocated_stock_ids IS NULL
               AND (o.expires_at IS NULL OR o.expires_at > ?))
          ) >= ?`,
          )
          .run(
            orderParams.user_id,
            orderParams.username || "",
            orderParams.first_name || "",
            product.id,
            product.name,
            quantity,
            product.price,
            nominal,
            transactionId,
            now,
            now,
            product.id,
            product.id,
            product.id,
            now,
            quantity,
          );
        if (!result?.changes)
          throw new Error("NOSTOCK:Stok produk tidak cukup.");
        const orderId = result.lastInsertRowid;
        const newBalance = Number(wallet.balance) - nominal;
        db.prepare(
          "UPDATE wallets SET balance = ?, updated_at = ? WHERE user_id = ?",
        ).run(newBalance, now, orderParams.user_id);
        db.prepare(
          `INSERT INTO wallet_transactions (user_id, type, amount, balance_after, reference_id, description, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          orderParams.user_id,
          "purchase",
          -nominal,
          newBalance,
          String(orderId),
          `Order #${orderId} - ${product.name}`,
          now,
        );
        return {
          orderId,
          balance: newBalance,
          total: nominal,
          idempotent: false,
        };
      });
      return txn();
    },

    // ============ USER ADMIN ============
    toggleUserBlock(userId, blocked) {
      if (blocked) {
        db.prepare(
          "UPDATE users SET is_blocked = 1, blocked_at = ? WHERE user_id = ?",
        ).run(nowIso(), userId);
      } else {
        db.prepare(
          "UPDATE users SET is_blocked = 0, blocked_at = NULL WHERE user_id = ?",
        ).run(userId);
      }
    },

    getUserDetail(userId) {
      const user = db
        .prepare("SELECT * FROM users WHERE user_id = ? LIMIT 1")
        .get(userId);
      if (!user) return null;
      const orders = db
        .prepare(
          "SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT 20",
        )
        .all(userId);
      const wallet = this.getWallet(userId);
      const walletTxns = this.getWalletTransactions(userId, 20);
      return { user, orders, wallet, walletTxns };
    },

    // ============ RATE LIMIT HELPERS ============
    getUserDailyTopupCount(userId) {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const row = db
        .prepare(
          "SELECT COUNT(*) AS count FROM orders WHERE user_id = ? AND product_id = 0 AND product_name = 'Wallet Top Up' AND created_at >= ?",
        )
        .get(userId, startOfDay.toISOString());
      return Number(row?.count || 0);
    },

    getUserDailyOrderCount(userId) {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const row = db
        .prepare(
          "SELECT COUNT(*) AS count FROM orders WHERE user_id = ? AND created_at >= ?",
        )
        .get(userId, startOfDay.toISOString());
      return Number(row?.count || 0);
    },

    getLastOrderTime(userId) {
      const row = db
        .prepare(
          "SELECT created_at FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT 1",
        )
        .get(userId);
      return row?.created_at ? new Date(row.created_at).getTime() : 0;
    },

    // ============ AUDIT LOG ADMIN ============
    getAuditLogs(limit = 100) {
      return db
        .prepare("SELECT * FROM admin_audit_logs ORDER BY id DESC LIMIT ?")
        .all(Math.min(500, limit));
    },

    getOpenTicketCount() {
      const row = db
        .prepare(
          "SELECT COUNT(*) AS count FROM support_tickets WHERE status = 'open'",
        )
        .get();
      return Number(row?.count || 0);
    },
  };
}
