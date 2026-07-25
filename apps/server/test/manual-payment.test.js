import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { beforeEach } from 'node:test';

const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'boslay-manual-payment-'));
process.env.NODE_ENV = 'test';
process.env.DATA_DIR = testDataDir;
process.env.API_BASE_URL = 'https://example.test';
process.env.BOT_TOKEN = 'test-token';

const [{ deliverOrder }, { createDb, getRawDb }, paymentService] = await Promise.all([
  import('../src/index.js'),
  import('../src/db.js'),
  import('../src/services/payment.js'),
]);

function resetDatabase() {
  const raw = getRawDb();
  raw.exec(`
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

function createPendingOrder({ userId = 1001, stock = ['account@example.com|secret'], quantity = 1 } = {}) {
  const db = createDb();
  db.upsertUser({ id: userId, username: `user${userId}`, first_name: 'Buyer' });
  const productId = db.addProduct({
    name: 'Produk Test',
    description: 'test',
    price: 15000,
    category: 'Test',
  });
  db.addStockItems(productId, stock);
  const orderId = db.createPlaceholderOrder({
    user_id: userId,
    username: `user${userId}`,
    first_name: 'Buyer',
    product_id: productId,
    product_name: 'Produk Test',
    quantity,
    unit_price: 15000,
    price: 15000 * quantity,
    expires_at: new Date(Date.now() + 3600000).toISOString(),
  });
  return { db, userId, productId, orderId };
}

function submitProof(db, userId, orderId, suffix = 'one') {
  db.startPaymentProofSession(userId, orderId);
  db.submitPaymentProof({
    userId,
    orderId,
    path: `payment/proofs/${suffix}.jpg`,
    mime: 'image/jpeg',
  });
}

test('membuat order dan menyimpan bukti pembayaran pada order yang benar', () => {
  const { db, userId, orderId } = createPendingOrder();
  assert.equal(db.getOrderById(orderId).status, 'pending_payment');

  submitProof(db, userId, orderId);
  const order = db.getOrderById(orderId);
  assert.equal(order.status, 'waiting_confirmation');
  assert.equal(order.payment_proof_path, 'payment/proofs/one.jpg');
  assert.ok(order.proof_submitted_at);
  assert.equal(db.getPaymentProofSession(userId), null);
});

test('menolak pembayaran lalu menerima bukti ulang', () => {
  const { db, userId, orderId } = createPendingOrder();
  submitProof(db, userId, orderId);
  db.rejectManualPayment(orderId, 'admin-1', 'Nominal tidak terlihat', true, 'cek ulang');
  let order = db.getOrderById(orderId);
  assert.equal(order.status, 'payment_rejected');
  assert.equal(order.payment_review_action, 'request_new_proof');

  submitProof(db, userId, orderId, 'replacement');
  order = db.getOrderById(orderId);
  assert.equal(order.status, 'waiting_confirmation');
  assert.equal(order.payment_proof_path, 'payment/proofs/replacement.jpg');
  assert.equal(order.payment_rejection_reason, null);
});

test('persetujuan ganda dan bersamaan hanya mengubah status sekali', async () => {
  const { db, userId, orderId } = createPendingOrder();
  submitProof(db, userId, orderId);

  const [first, second] = await Promise.all([
    Promise.resolve().then(() => db.approveManualPayment(orderId, 'admin-a')),
    Promise.resolve().then(() => db.approveManualPayment(orderId, 'admin-b')),
  ]);
  assert.equal(Number(first.changed) + Number(second.changed), 1);
  assert.equal(db.getOrderById(orderId).status, 'delivery_pending');
  assert.ok(db.getOrderById(orderId).payment_confirmed_at);
});

test('pengiriman Telegram gagal mempertahankan alokasi dan retry tidak mengambil stok baru', async () => {
  const { db, userId, orderId } = createPendingOrder({
    stock: ['first@example.com|pw1', 'second@example.com|pw2'],
  });
  submitProof(db, userId, orderId);
  const approved = db.approveManualPayment(orderId, 'admin');

  let failedSends = 0;
  await assert.rejects(
    deliverOrder(db, approved.order, {
      sendMessage: async () => {
        failedSends += 1;
        throw new Error('simulated Telegram failure');
      },
      notifyAdmin: async () => {},
    }),
    /simulated Telegram failure/
  );
  assert.equal(failedSends, 1);
  const failedOrder = db.getOrderById(orderId);
  assert.equal(failedOrder.status, 'delivery_pending');
  assert.match(failedOrder.delivery_error, /simulated Telegram failure/);
  const allocatedBeforeRetry = failedOrder.allocated_stock_ids;
  assert.deepEqual(JSON.parse(allocatedBeforeRetry).length, 1);
  assert.equal(db.listStock(approved.order.product_id).filter((item) => item.is_sold).length, 1);

  const successfulMessages = [];
  await deliverOrder(db, failedOrder, {
    sendMessage: async (_chatId, text) => {
      successfulMessages.push(text);
      return { message_id: successfulMessages.length };
    },
    notifyAdmin: async () => {},
  });
  const delivered = db.getOrderById(orderId);
  assert.equal(delivered.status, 'delivered');
  assert.equal(delivered.allocated_stock_ids, allocatedBeforeRetry);
  assert.equal(db.listStock(approved.order.product_id).filter((item) => item.is_sold).length, 1);
  assert.equal(successfulMessages.filter((message) => message.includes('Detail Produk')).length, 1);
});

test('dua delivery bersamaan hanya mengirim payload produk sekali', async () => {
  const { db, userId, orderId } = createPendingOrder();
  submitProof(db, userId, orderId);
  const { order } = db.approveManualPayment(orderId, 'admin');
  let productMessages = 0;
  const sendMessage = async (_chatId, text) => {
    if (text.includes('Detail Produk')) productMessages += 1;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return { message_id: productMessages };
  };

  await Promise.all([
    deliverOrder(db, order, { sendMessage, notifyAdmin: async () => {} }),
    deliverOrder(db, order, { sendMessage, notifyAdmin: async () => {} }),
  ]);
  assert.equal(productMessages, 1);
  assert.equal(db.getOrderById(orderId).status, 'delivered');
});

test('bukti ditolak untuk order terminal dan user terblokir tidak otomatis terbuka atau bisa checkout', () => {
  const { db, userId, orderId } = createPendingOrder();
  assert.equal(db.cancelOrderByUser(orderId, userId), true);
  assert.throws(
    () => db.startPaymentProofSession(userId, orderId),
    /Bukti tidak dapat dikirim/
  );

  db.toggleUserBlock(userId, true);
  db.upsertUser({ id: userId, username: 'updated', first_name: 'Updated' });
  assert.equal(db.getUser(userId).is_blocked, 1);
  assert.throws(
    () => db.createPlaceholderOrder({
      user_id: userId,
      username: 'updated',
      first_name: 'Updated',
      product_id: 1,
      product_name: 'Blocked Checkout',
      quantity: 1,
      unit_price: 1000,
      price: 1000,
      expires_at: new Date(Date.now() + 3600000).toISOString(),
    }),
    /Akun diblokir/
  );
});

test('validasi upload menolak format, ukuran, dan path traversal', () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x01]);
  assert.equal(paymentService.validatePaymentImage(jpeg).mime, 'image/jpeg');
  assert.throws(() => paymentService.validatePaymentImage(Buffer.from('not an image')), /JPG, PNG, atau WebP/);
  assert.throws(
    () => paymentService.validatePaymentImage(Buffer.alloc(2 * 1024 * 1024 + 1, 0xff)),
    /maksimum 2 MB/
  );
  assert.throws(
    () => paymentService.resolvePrivateUploadPath(testDataDir, '../../secret.jpg', ['payment']),
    /tidak valid/
  );
});
