import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { beforeEach } from "node:test";

const testDataDir = fs.mkdtempSync(
  path.join(os.tmpdir(), "ciganstore-wallet-"),
);
process.env.NODE_ENV = "test";
process.env.DATA_DIR = testDataDir;

const { createDb, getRawDb, initDb } = await import("../src/db.js");
initDb(path.join(testDataDir, "wallet-test.db"));

function resetDatabase() {
  getRawDb().exec(`
    DELETE FROM payment_proof_sessions;
    DELETE FROM reviews;
    DELETE FROM wallet_transactions;
    DELETE FROM wallets;
    DELETE FROM download_tokens;
    DELETE FROM orders;
    DELETE FROM stock_items;
    DELETE FROM products WHERE id <> 0;
    DELETE FROM users;
    DELETE FROM admin_audit_logs;
  `);
}

beforeEach(resetDatabase);

function createUser(db, userId = 2001) {
  db.upsertUser({
    id: userId,
    username: `user${userId}`,
    first_name: "Wallet Buyer",
  });
  return userId;
}

function createProduct(db, { price = 15000, stock = ["license-1"] } = {}) {
  const productId = db.addProduct({
    name: "Produk Wallet",
    description: "Produk untuk pengujian wallet",
    price,
    category: "Test",
  });
  if (stock.length) db.addStockItems(productId, stock);
  return productId;
}

function createTopup(
  db,
  userId,
  amount = 25000,
  transactionId = "topup:test:1",
) {
  return db.createWalletTopupOrder({
    user_id: userId,
    username: `user${userId}`,
    first_name: "Wallet Buyer",
    amount,
    transaction_id: transactionId,
    expires_at: new Date(Date.now() + 3600000).toISOString(),
  });
}

test("top up menerima nominal Rupiah bulat positif dan menolak nominal invalid", () => {
  const db = createDb();
  const userId = createUser(db);

  for (const amount of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(
      () => createTopup(db, userId, amount, `topup:invalid:${amount}`),
      /INVALID_AMOUNT/,
    );
  }

  const created = createTopup(db, userId, 1);
  const order = db.getOrderById(created.orderId);
  assert.equal(created.idempotent, false);
  assert.equal(order.product_id, 0);
  assert.equal(order.unit_price, 1);
  assert.equal(order.price, 1);
  assert.equal(order.payment_method, "gopay_qr");
});

test("pembuatan top up idempotent dan membatasi satu top up aktif", () => {
  const db = createDb();
  const userId = createUser(db);

  const first = createTopup(db, userId, 10000, "topup:same-message");
  const repeated = createTopup(db, userId, 10000, "topup:same-message");
  assert.equal(repeated.orderId, first.orderId);
  assert.equal(repeated.idempotent, true);

  assert.throws(
    () => createTopup(db, userId, 20000, "topup:new-message"),
    /DUPLICATE_TOPUP/,
  );
  assert.equal(
    getRawDb().prepare("SELECT COUNT(*) AS count FROM orders").get().count,
    1,
  );
});

test("persetujuan top up menambah saldo 1:1 tepat sekali", () => {
  const db = createDb();
  const userId = createUser(db);
  const { orderId } = createTopup(db, userId, 27501);

  db.startPaymentProofSession(userId, orderId);
  db.submitPaymentProof({
    userId,
    orderId,
    path: "payment/proofs/topup.jpg",
    mime: "image/jpeg",
  });
  db.approveManualPayment(orderId, "admin");
  const claimed = db.claimOrderDelivery(orderId);
  assert.equal(claimed.claimed, true);
  assert.equal(claimed.order.status, "delivering");

  const credited = db.creditWalletTopupAndComplete(orderId);
  const repeated = db.creditWalletTopupAndComplete(orderId);
  assert.equal(credited.changed, true);
  assert.equal(credited.balance, 27501);
  assert.equal(repeated.changed, false);
  assert.equal(repeated.balance, 27501);
  assert.equal(db.getOrderById(orderId).status, "delivered");

  const transactions = db.getWalletTransactions(userId);
  assert.equal(transactions.length, 1);
  assert.equal(transactions[0].type, "topup");
  assert.equal(transactions[0].amount, 27501);
  assert.equal(transactions[0].balance_after, 27501);
});

test("checkout wallet memakai harga database dan idempotent saat callback diulang", () => {
  const db = createDb();
  const userId = createUser(db);
  const productId = createProduct(db, { price: 12000, stock: ["one", "two"] });
  db.adjustWalletBalance(userId, 50000, "Saldo pengujian");

  const params = {
    user_id: userId,
    username: `user${userId}`,
    first_name: "Wallet Buyer",
    product_id: productId,
    quantity: 2,
    transaction_id: "wallet:callback:1",
  };
  const first = db.walletCheckout(params);
  const repeated = db.walletCheckout(params);

  assert.equal(first.idempotent, false);
  assert.equal(first.total, 24000);
  assert.equal(first.balance, 26000);
  assert.equal(repeated.orderId, first.orderId);
  assert.equal(repeated.idempotent, true);
  assert.equal(repeated.balance, 26000);

  const order = db.getOrderById(first.orderId);
  assert.equal(order.unit_price, 12000);
  assert.equal(order.price, 24000);
  assert.equal(order.status, "delivery_pending");
  assert.equal(
    getRawDb()
      .prepare(
        "SELECT COUNT(*) AS count FROM wallet_transactions WHERE type = 'purchase'",
      )
      .get().count,
    1,
  );
});

test("saldo atau stok tidak cukup tidak membuat order maupun mendebit wallet", () => {
  const db = createDb();
  const poorUserId = createUser(db, 3001);
  const productId = createProduct(db, { price: 10000, stock: ["only-one"] });
  db.adjustWalletBalance(poorUserId, 5000, "Saldo kecil");

  assert.throws(
    () =>
      db.walletCheckout({
        user_id: poorUserId,
        product_id: productId,
        quantity: 1,
        transaction_id: "wallet:insufficient",
      }),
    /INSUFFICIENT/,
  );
  assert.equal(db.getWallet(poorUserId).balance, 5000);

  const stockedUserId = createUser(db, 3002);
  db.adjustWalletBalance(stockedUserId, 50000, "Saldo cukup");
  assert.throws(
    () =>
      db.walletCheckout({
        user_id: stockedUserId,
        product_id: productId,
        quantity: 2,
        transaction_id: "wallet:no-stock",
      }),
    /NOSTOCK/,
  );
  assert.equal(db.getWallet(stockedUserId).balance, 50000);
  assert.equal(
    getRawDb()
      .prepare("SELECT COUNT(*) AS count FROM orders WHERE product_id <> 0")
      .get().count,
    0,
  );
});

test("checkout menolak kuantitas invalid tanpa mutasi saldo", () => {
  const db = createDb();
  const userId = createUser(db);
  const productId = createProduct(db);
  db.adjustWalletBalance(userId, 50000, "Saldo pengujian");

  for (const quantity of [0, -1, 1.5, 11]) {
    assert.throws(
      () =>
        db.walletCheckout({
          user_id: userId,
          product_id: productId,
          quantity,
          transaction_id: `wallet:quantity:${quantity}`,
        }),
      /INVALID_QUANTITY/,
    );
  }
  assert.equal(db.getWallet(userId).balance, 50000);
});
