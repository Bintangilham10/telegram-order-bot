// Ciganstore Order Bot — Wallet Checkout + Manual GoPay Top Up
import "dotenv/config";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initDb, createDb, getRawDb } from "./db.js";
import {
  createSessionToken,
  verifySessionToken,
  parseCookie,
} from "./utils/security.js";
import {
  answerCallback,
  downloadTelegramFile,
  sendMessage,
  sendPhoto,
  setWebhook,
  telegramApi,
  TelegramApiError,
} from "./services/telegram.js";
import {
  createRandomImageName,
  resolvePrivateUploadPath,
  validatePaymentImage,
} from "./services/payment.js";

const env = process.env;
const PORT = Number(env.PORT || 3000);
const DATA_DIR = path.resolve(env.DATA_DIR || "./data");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
const PAYMENT_UPLOADS_DIR = path.join(UPLOADS_DIR, "payment");
const PAYMENT_PROOFS_DIR = path.join(PAYMENT_UPLOADS_DIR, "proofs");
for (const dir of [
  DATA_DIR,
  path.join(UPLOADS_DIR, "products"),
  path.join(UPLOADS_DIR, "downloads"),
  PAYMENT_UPLOADS_DIR,
  PAYMENT_PROOFS_DIR,
]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
initDb(path.join(DATA_DIR, "belugawbot.db"));

const app = new Hono();
app.use(
  "*",
  cors({
    origin: (origin) => {
      const allowed = [env.ADMIN_APP_ORIGIN, env.API_BASE_URL].filter(Boolean);
      if (!origin) return env.ADMIN_APP_ORIGIN || "*";
      return allowed.includes(origin) ? origin : allowed[0] || origin;
    },
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);
app.use("*", async (c, next) => {
  c.set("db", createDb());
  await next();
});

// ============ RATE LIMITING ============
const rateLimitStore = new Map();
function rateLimit(key, maxRequests, windowMs) {
  const now = Date.now();
  let entry = rateLimitStore.get(key);
  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + windowMs };
    rateLimitStore.set(key, entry);
  }
  entry.count++;
  rateLimitStore.set(key, entry);
  return entry.count <= maxRequests;
}
const rateLimitCleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore) {
    if (now >= entry.resetAt) rateLimitStore.delete(key);
  }
}, 300000);
rateLimitCleanupTimer.unref?.();
const tgFloodMap = new Map();
const TG_FLOOD_COOLDOWN_MS = 1500;
function checkTgFlood(userId) {
  const now = Date.now();
  const last = tgFloodMap.get(String(userId)) || 0;
  if (now - last < TG_FLOOD_COOLDOWN_MS) return false;
  tgFloodMap.set(String(userId), now);
  return true;
}
const tgFloodCleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, time] of tgFloodMap) {
    if (now - time > 60000) tgFloodMap.delete(key);
  }
}, 600000);
tgFloodCleanupTimer.unref?.();

// ============ MAINTENANCE ============
function isMaintenanceMode() {
  try {
    return createDb().getSetting("maintenance_mode", "0") === "1";
  } catch {
    return false;
  }
}

// ============ AUTO BACKUP ============
function runAutoBackup() {
  try {
    const backupDir = path.join(DATA_DIR, "backups");
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const backupFile = path.join(backupDir, `belugawbot_${timestamp}.db`);
    const rawDb = getRawDb();
    if (rawDb) {
      rawDb
        .backup(backupFile)
        .then(() => {
          console.log(`[Backup] ✅ ${backupFile}`);
          const files = fs
            .readdirSync(backupDir)
            .filter((f) => f.startsWith("belugawbot_") && f.endsWith(".db"))
            .sort()
            .reverse();
          for (const old of files.slice(7)) {
            try {
              fs.unlinkSync(path.join(backupDir, old));
            } catch {}
          }
        })
        .catch((err) => console.error("[Backup] ❌", err.message));
    }
  } catch (err) {
    console.error("[Backup] ❌", err.message);
  }
}
function scheduleBackup() {
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(20, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  const delay = next.getTime() - now.getTime();
  console.log(
    `[Backup] Next backup scheduled in ${Math.round(delay / 60000)} minutes`,
  );
  setTimeout(() => {
    runAutoBackup();
    setInterval(runAutoBackup, 86400000);
  }, delay);
}
if (env.NODE_ENV !== "test") scheduleBackup();

// ============ HELPERS ============
function jsonOk(c, data = {}) {
  return c.json({ ok: true, data });
}
function jsonErr(c, message, status = 400) {
  return c.json({ ok: false, error: message }, status);
}
function formatIdr(value) {
  return Number(value || 0).toLocaleString("id-ID");
}
function escapeHtml(input) {
  return (input || "")
    .toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
function isUrl(value) {
  return /^https?:\/\//i.test(String(value || "").trim());
}
function isLikely2faToken(value) {
  const source = String(value || "").trim();
  if (!source) return false;
  if (/\b2fa\b/i.test(source)) return true;
  return /^[A-Z0-9-]{6,}$/i.test(source);
}
function formatWibDateTime(isoDate, timeZone = "Asia/Jakarta") {
  try {
    return new Intl.DateTimeFormat("id-ID", {
      timeZone,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(isoDate));
  } catch {
    return "-";
  }
}
function isR2FilePointer(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .startsWith("file:");
}
function toLocalFileKey(pointer) {
  return String(pointer || "")
    .trim()
    .replace(/^file:/i, "")
    .replace(/^\/+/, "");
}
function basenameFromKey(key) {
  const parts = String(key || "")
    .split("/")
    .filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "download.bin";
}
function formatOrderCodeWithBrand(orderId, shortName) {
  const safe = String(shortName || "BLG").toUpperCase();
  return `${safe}${String(Number(orderId) || 0).padStart(3, "0")}`;
}
function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function parseStockItem(raw) {
  const source = String(raw || "").trim();
  const parts = source
    .split("|")
    .map((x) => x.trim())
    .filter(Boolean);
  if (parts.length === 1 && isUrl(parts[0])) {
    return {
      type: "download",
      lines: [`Download Link: <code>${escapeHtml(parts[0])}</code>`],
      copy: [{ label: "Copy Link", value: parts[0] }],
    };
  }
  if (parts.length >= 2) {
    const [email, password, ...rest] = parts;
    const lines = [
      `Email: <code>${escapeHtml(email)}</code>`,
      `Password: <code>${escapeHtml(password)}</code>`,
    ];
    const copy = [
      { label: "Copy Email", value: email },
      { label: "Copy Password", value: password },
    ];
    let has2fa = false;
    rest.forEach((extraRaw, idx) => {
      const extra = String(extraRaw || "").trim();
      if (!extra) return;
      let label = "Additional Info",
        copyLabel = "Copy Info";
      if (isUrl(extra)) {
        label = idx === 0 ? "Mail Access Link" : "Access Link";
        copyLabel = "Copy Link";
      } else if (isLikely2faToken(extra)) {
        label = "2FA Code";
        copyLabel = "Copy 2FA";
        has2fa = true;
      }
      lines.push(`${label}: <code>${escapeHtml(extra)}</code>`);
      copy.push({ label: copyLabel, value: extra });
    });
    return { type: "credential", lines, copy, has2fa };
  }
  return {
    type: "raw",
    lines: [`Data: <code>${escapeHtml(source)}</code>`],
    copy: source ? [{ label: "Copy Data", value: source }] : [],
  };
}

// ============ SETTINGS ============
function getBrandSettings(db) {
  return {
    name: db.getSetting("brand_name", "Ciganstore"),
    shortName:
      String(db.getSetting("brand_short_name", "CIGAN"))
        .replace(/[^A-Za-z0-9]/g, "")
        .slice(0, 8)
        .toUpperCase() || "CIGAN",
    tagline: db.getSetting("brand_tagline", ""),
    broadcastTitle: db.getSetting("broadcast_title", "Pengumuman Resmi"),
    supportTelegramUrl: db.getSetting("support_telegram_url", ""),
    supportWhatsappUrl: db.getSetting("support_whatsapp_url", ""),
  };
}
function settingOrEnv(db, settingKey, envKey, fallback = "") {
  const stored = String(db.getSetting(settingKey, "") || "").trim();
  if (stored) return stored;
  const fromEnv = String(env[envKey] || "").trim();
  return fromEnv || fallback;
}
function getManualPaymentConfig(db) {
  const enabledRaw = settingOrEnv(
    db,
    "wallet_topup_enabled",
    "MANUAL_PAYMENT_ENABLED",
    "true",
  ).toLowerCase();
  return {
    enabled: !["0", "false", "no", "off"].includes(enabledRaw),
    methodName: settingOrEnv(
      db,
      "manual_payment_method_name",
      "MANUAL_PAYMENT_METHOD_NAME",
      "GoPay Merchant QR",
    ),
    accountName: settingOrEnv(
      db,
      "manual_payment_account_name",
      "MANUAL_PAYMENT_ACCOUNT_NAME",
      "Ciganstore",
    ),
    qrisImage: settingOrEnv(
      db,
      "manual_payment_qris_image",
      "MANUAL_PAYMENT_QRIS_IMAGE",
      "",
    ),
    instructions: settingOrEnv(
      db,
      "manual_payment_instructions",
      "MANUAL_PAYMENT_INSTRUCTIONS",
      "Bayar sesuai nominal top up lalu kirim bukti pembayaran.",
    ),
  };
}
function getAdminChatId(db) {
  const raw = db.getSetting("admin_telegram_id", String(env.ADMIN_ID || ""));
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
function getCheckoutExpiryMinutes(db) {
  const raw = settingOrEnv(
    db,
    "order_expiry_minutes",
    "ORDER_EXPIRY_MINUTES",
    db.getSetting("checkout_expiry_minutes", "60"),
  );
  const minutes = Number(raw);
  return Number.isFinite(minutes)
    ? Math.max(5, Math.min(1440, Math.floor(minutes)))
    : 60;
}
function getQrisImageFile(config) {
  if (!config.qrisImage)
    throw new Error("Gambar QRIS merchant belum diunggah atau dikonfigurasi.");
  const resolved = resolvePrivateUploadPath(UPLOADS_DIR, config.qrisImage, [
    "payment",
  ]);
  if (!fs.existsSync(resolved.path))
    throw new Error("Gambar QRIS merchant tidak ditemukan.");
  const buffer = fs.readFileSync(resolved.path);
  const type = validatePaymentImage(buffer);
  return { ...resolved, buffer, ...type };
}

// ============ NOTIFICATIONS ============
async function notifyAdmin(db, text) {
  const adminChatId = getAdminChatId(db);
  if (!adminChatId) return;
  try {
    await sendMessage(adminChatId, text);
  } catch (err) {
    console.error("[AdminNotify]", err.message);
  }
}

// ============ DELIVERY ============
function buildDeliveryMessage(
  orderId,
  stockItems,
  quantity,
  brand,
  product = null,
) {
  const sections = [];
  const copyButtons = [];
  let has2faItem = false;
  const orderCode = formatOrderCodeWithBrand(orderId, brand?.shortName);
  stockItems.forEach((item, idx) => {
    const parsed = parseStockItem(item.data);
    if (parsed.has2fa) has2faItem = true;
    const titlePrefix = quantity > 1 ? `Item ${idx + 1}` : "Detail Produk";
    sections.push(`<b>${titlePrefix}</b>\n${parsed.lines.join("\n")}`);
    if (idx === 0) {
      parsed.copy.slice(0, 3).forEach((entry) => {
        copyButtons.push([
          { text: entry.label, copy_text: { text: entry.value } },
        ]);
      });
    }
  });
  const text = [
    "✅ <b>Pembayaran Berhasil</b>",
    "━━━━━━━━━━━━━━━━━━━━",
    `Order <b>${orderCode}</b> sudah diproses.`,
    "",
    ...sections,
    "",
    ...(has2faItem
      ? [
          "<b>Panduan Login Akun (Jika Ada 2FA)</b>",
          "1) Login akun seperti biasa (email + password).",
          '2) Saat diminta OTP/Authenticator code, buka <a href="https://2fa.live">2fa.live</a>.',
          "3) Paste <b>2FA Code</b> dari order, lalu ambil 6 digit OTP yang muncul.",
          "4) Masukkan OTP tersebut ke halaman login akun.",
          "",
        ]
      : []),
    ...(product?.delivery_note
      ? [
          "<b>📌 Catatan Khusus Produk</b>",
          String(product.delivery_note).trim(),
          "",
        ]
      : []),
    "Simpan data ini dengan aman.",
  ].join("\n");
  return { text, copyButtons, termsUrl: product?.terms_url || null };
}
function getStartMenuKeyboard({ preserveMessage = false, brand = null } = {}) {
  const viewProducts = preserveMessage ? "view_products_keep" : "view_products";
  const myOrders = preserveMessage ? "my_orders_keep" : "my_orders";
  const rows = [
    [{ text: "🛒 Lihat Produk", callback_data: viewProducts }],
    [{ text: "📦 Pesanan Saya", callback_data: myOrders }],
    [{ text: "💳 Wallet Saya", callback_data: "wallet" }],
    [{ text: "🎫 Support", callback_data: "support" }],
  ];
  const supportUrl = String(
    brand?.supportTelegramUrl || brand?.supportWhatsappUrl || "",
  ).trim();
  if (supportUrl) rows.push([{ text: "💬 Customer Service", url: supportUrl }]);
  return rows;
}
function buildDeliveryKeyboard(
  copyButtons = [],
  brand = null,
  termsUrl = null,
) {
  const rows = [];
  if (Array.isArray(copyButtons) && copyButtons.length)
    rows.push(...copyButtons);
  if (termsUrl && /^https?:\/\//i.test(termsUrl))
    rows.push([{ text: "📋 Lihat Syarat & Panduan", url: termsUrl }]);
  rows.push(...getStartMenuKeyboard({ preserveMessage: true, brand }));
  return rows;
}
function createUniqueDownloadUrl(db, order, objectKey) {
  const token = crypto.randomUUID().replaceAll("-", "");
  const expiresAt = new Date(Date.now() + 72 * 3600000).toISOString();
  db.createDownloadToken({
    token,
    orderId: order.id,
    userId: order.user_id,
    objectKey,
    expiresAt,
    maxDownloads: 5,
  });
  return `${env.API_BASE_URL}/api/shop/download/${token}`;
}
function normalizeDeliveryStock(db, order, stockItems) {
  return stockItems.map((item) => {
    if (!isR2FilePointer(item.data)) return item;
    const key = toLocalFileKey(item.data);
    if (!key) return item;
    const uniqueUrl = createUniqueDownloadUrl(db, order, key);
    return { ...item, data: uniqueUrl };
  });
}

async function deliverOrder(db, order, dependencies = {}) {
  const sendTelegramMessage = dependencies.sendMessage || sendMessage;
  const sendAdminNotification = dependencies.notifyAdmin || notifyAdmin;
  let claimed;
  try {
    claimed = db.claimOrderDelivery(order.id);
  } catch (err) {
    db.recordDeliveryPreparationError(order.id, err.message);
    throw err;
  }
  if (!claimed.claimed)
    return {
      delivered: claimed.order?.status === "delivered",
      status: claimed.order?.status,
      skipped: true,
    };

  const activeOrder = claimed.order;
  if (
    Number(activeOrder.product_id) === 0 &&
    activeOrder.product_name === "Wallet Top Up"
  ) {
    const credited = db.creditWalletTopupAndComplete(activeOrder.id);
    const amount = Number(activeOrder.unit_price);
    try {
      await sendTelegramMessage(
        activeOrder.user_id,
        `✅ <b>Top Up Berhasil!</b>\n\n💰 Rp ${formatIdr(amount)} telah ditambahkan ke wallet kamu.\n\nGunakan /wallet untuk cek saldo.`,
      );
    } catch {}
    await sendAdminNotification(
      db,
      `💰 <b>Wallet Top Up</b>\n\n👤 ${escapeHtml(activeOrder.first_name || activeOrder.username)}\n💵 Rp ${formatIdr(amount)}`,
    );
    return { delivered: true, credited: credited.changed, status: "delivered" };
  }

  const brand = getBrandSettings(db);
  const orderCode = formatOrderCodeWithBrand(activeOrder.id, brand.shortName);
  const product = db.getProductById(activeOrder.product_id);
  const normalizedStock = normalizeDeliveryStock(
    db,
    activeOrder,
    claimed.stock,
  );
  const deliveryPayload = {
    orderId: activeOrder.id,
    productName: activeOrder.product_name,
    quantity: activeOrder.quantity,
    items: normalizedStock.map((item, idx) => ({
      itemNo: idx + 1,
      data: item.data,
    })),
    deliveryNote: product?.delivery_note || null,
    termsUrl: product?.terms_url || null,
  };
  const payload = buildDeliveryMessage(
    activeOrder.id,
    normalizedStock,
    activeOrder.quantity,
    brand,
    product,
  );
  const inlineKeyboard = buildDeliveryKeyboard(
    payload.copyButtons,
    brand,
    payload.termsUrl,
  );

  try {
    await sendTelegramMessage(activeOrder.user_id, payload.text, {
      reply_markup: { inline_keyboard: inlineKeyboard },
    });
  } catch (err) {
    db.failOrderDelivery(activeOrder.id, err.message);
    await sendAdminNotification(
      db,
      `🚨 <b>Pengiriman Gagal</b>\n\n📋 ${orderCode}\n⚠️ ${escapeHtml(err.message)}\n\nGunakan aksi retry di panel admin.`,
    );
    throw err;
  }

  if (!db.completeOrderDelivery(activeOrder.id, deliveryPayload)) {
    throw new Error(
      "Status order berubah sebelum delivery dapat diselesaikan.",
    );
  }

  const receiptText = [
    "🧾 <b>Receipt / Bukti Pembelian</b>",
    "━━━━━━━━━━━━━━━━━━━━",
    `🔔 Order: <b>${orderCode}</b>`,
    `📦 Produk: <b>${escapeHtml(activeOrder.product_name)}</b>`,
    `🔢 Qty: ${activeOrder.quantity}`,
    `💰 Total: Rp ${formatIdr(activeOrder.price)}`,
    `💳 Metode: ${activeOrder.payment_provider === "wallet" ? "Saldo Wallet" : "Pembayaran Manual"}`,
    `📅 Tanggal: ${formatWibDateTime(new Date().toISOString())} WIB`,
    "",
    "Terima kasih telah berbelanja! 🙏",
  ].join("\n");
  try {
    await sendTelegramMessage(activeOrder.user_id, receiptText);
  } catch {}
  return { delivered: true, status: "delivered" };
}

// ============ CRON ============
let _expiryActive = false;
async function processExpiredOrders() {
  if (_expiryActive) return;
  _expiryActive = true;
  try {
    const db = createDb();
    const expired = db.expireManualOrders();
    for (const order of expired) {
      const brand = getBrandSettings(db);
      try {
        await sendMessage(
          order.user_id,
          `⏰ Order ${formatOrderCodeWithBrand(order.id, brand.shortName)} expired. Silakan checkout ulang.`,
        );
      } catch {}
      await notifyAdmin(
        db,
        `⏰ <b>Order Expired</b>\n\n📋 ${formatOrderCodeWithBrand(order.id, brand.shortName)}\n👤 ${escapeHtml(order.first_name || order.username || order.user_id)}\n💰 Rp ${formatIdr(order.price)}\n📦 ${escapeHtml(order.product_name)}`,
      );
    }
  } finally {
    _expiryActive = false;
  }
}

// ============ AUTH ============
async function requireAdmin(c, next) {
  const token = parseCookie(c.req.header("cookie"))["tb_session"];
  const secret = env.ADMIN_SESSION_SECRET;
  if (!token || !secret) return jsonErr(c, "Unauthorized", 401);
  const payload = verifySessionToken(token, secret);
  if (!payload || payload.role !== "admin")
    return jsonErr(c, "Unauthorized", 401);
  c.set("admin", payload);
  await next();
}

// ============ BROADCAST ============
async function deliverBroadcastToUser(user, text, options) {
  try {
    await sendMessage(Number(user.user_id), text, options);
    return "sent";
  } catch (err) {
    if (err instanceof TelegramApiError) {
      if (err.errorCode === 429 && err.retryAfter > 0) {
        const retryAfter = err.retryAfter || 1;
        await wait((retryAfter + 1) * 1000);
        await sendMessage(Number(user.user_id), text, options);
        return "sent";
      }
      if (err.errorCode === 403 || err.errorCode === 400) {
        const desc = String(err.description || "").toLowerCase();
        if (
          desc.includes("blocked") ||
          desc.includes("forbidden") ||
          desc.includes("user is deactivated") ||
          desc.includes("chat not found") ||
          desc.includes("can't initiate conversation")
        )
          return "blocked";
      }
    }
    throw err;
  }
}
async function runBroadcastJob(jobId, { message, buttonText, buttonUrl }) {
  const db = createDb();
  const brand = getBrandSettings(db);
  const text = escapeHtml(message);
  const options =
    buttonText && buttonUrl
      ? {
          reply_markup: {
            inline_keyboard: [[{ text: buttonText, url: buttonUrl }]],
          },
        }
      : {};
  const CHUNK_SIZE = 20,
    CHUNK_GAP_MS = 1200;
  db.markBroadcastJobRunning(jobId);
  let cursor = 0,
    lastError = null;
  try {
    for (;;) {
      const page = db.getActiveUsersPage({
        afterUserId: cursor,
        pageSize: 500,
      });
      if (!page.length) break;
      for (let i = 0; i < page.length; i += CHUNK_SIZE) {
        const chunk = page.slice(i, i + CHUNK_SIZE);
        const results = await Promise.allSettled(
          chunk.map((user) => deliverBroadcastToUser(user, text, options)),
        );
        let sent = 0,
          failed = 0,
          blocked = 0;
        const blockedIds = [];
        for (let j = 0; j < results.length; j++) {
          if (results[j].status === "fulfilled") {
            if (results[j].value === "blocked") {
              blocked++;
              blockedIds.push(chunk[j].user_id);
            } else sent++;
          } else {
            failed++;
            lastError = results[j].reason?.message || "unknown";
          }
        }
        blockedIds.forEach((uid) => {
          try {
            db.markUserBlocked(uid);
          } catch {}
        });
        db.incrementBroadcastJobCounters(jobId, { sent, failed, blocked });
        await wait(CHUNK_GAP_MS);
      }
      cursor = Number(page[page.length - 1].user_id);
      if (page.length < 500) break;
    }
    db.finishBroadcastJob(jobId, { status: "done", lastError });
    db.insertAudit("broadcast.done", "admin", { jobId, lastError });
  } catch (err) {
    db.finishBroadcastJob(jobId, {
      status: "failed",
      lastError: err?.message || "unknown",
    });
    db.insertAudit("broadcast.failed", "admin", { jobId, error: err?.message });
  }
}

// ============ PRODUCT CATALOG ============
async function sendProductCatalog(db, chatId, messageId = null, page = 0) {
  const products = db.getProducts();
  const brand = getBrandSettings(db);
  const perPage = 5;
  const totalPages = Math.max(1, Math.ceil(products.length / perPage));
  const currentPage = Math.min(page, totalPages - 1);
  const pageProducts = products.slice(
    currentPage * perPage,
    (currentPage + 1) * perPage,
  );
  if (!products.length) {
    const emptyText =
      "😕 Belum ada produk tersedia saat ini.\n\nSilakan cek lagi nanti.";
    if (messageId) {
      return telegramApi("editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: emptyText,
        reply_markup: { inline_keyboard: getStartMenuKeyboard({ brand }) },
      });
    }
    return sendMessage(chatId, emptyText, {
      reply_markup: { inline_keyboard: getStartMenuKeyboard({ brand }) },
    });
  }
  let text = `🛒 <b>Daftar Produk</b>\n━━━━━━━━━━━━━━━━━━━━\n\n`;
  for (const p of pageProducts) {
    const rating = db.getProductRating(p.id);
    const ratingStr =
      rating.count > 0 ? ` ⭐ ${rating.avg}/5 (${rating.count})` : "";
    text += `<b>${escapeHtml(p.name)}</b>${ratingStr}\n`;
    text += `💰 Rp ${formatIdr(p.price)}\n`;
    text += `📦 Stok: ${Number(p.is_unlimited_stock) === 1 ? "∞ Unlimited" : p.stock_count}\n`;
    if (p.description) text += `📝 ${escapeHtml(p.description)}\n`;
    text += "\n";
  }
  if (totalPages > 1)
    text += `Halaman ${currentPage + 1} dari ${totalPages}\n\n`;
  const rows = [];
  for (const p of pageProducts) {
    rows.push([
      {
        text: `🔍 ${escapeHtml(p.name).slice(0, 30)}`,
        callback_data: `product_detail_${p.id}`,
      },
    ]);
  }
  const navRow = [];
  if (currentPage > 0)
    navRow.push({
      text: "⬅️ Sebelumnya",
      callback_data: `catalog_page_${currentPage - 1}`,
    });
  if (currentPage < totalPages - 1)
    navRow.push({
      text: "➡️ Selanjutnya",
      callback_data: `catalog_page_${currentPage + 1}`,
    });
  if (navRow.length) rows.push(navRow);
  rows.push([{ text: "📦 Pesanan Saya", callback_data: "my_orders" }]);
  if (messageId) {
    return telegramApi("editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: rows },
    });
  }
  return sendMessage(chatId, text, { reply_markup: { inline_keyboard: rows } });
}

async function sendProductDetail(db, chatId, messageId, productId) {
  const product = db.getProductById(productId);
  const brand = getBrandSettings(db);
  if (!product || !Number(product.is_active)) {
    const text = "😕 Produk tidak ditemukan atau sudah tidak tersedia.";
    if (messageId) {
      return telegramApi("editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: getStartMenuKeyboard({ brand }) },
      });
    }
    return sendMessage(chatId, text, {
      reply_markup: { inline_keyboard: getStartMenuKeyboard({ brand }) },
    });
  }
  const rating = db.getProductRating(product.id);
  const ratingStr =
    rating.count > 0
      ? `⭐ ${rating.avg}/5 (${rating.count} ulasan)`
      : "⭐ Belum ada ulasan";
  const text = [
    `🛍️ <b>${escapeHtml(product.name)}</b>`,
    "━━━━━━━━━━━━━━━━━━━━",
    `💰 <b>Harga:</b> Rp ${formatIdr(product.price)}`,
    `📦 <b>Stok:</b> ${Number(product.is_unlimited_stock) === 1 ? "∞ Unlimited" : product.stock_count}`,
    `${ratingStr}`,
    "",
    product.description
      ? `📝 <b>Deskripsi:</b>\n${escapeHtml(product.description)}`
      : "",
    "",
    product.delivery_note
      ? `📌 <b>Catatan:</b> ${escapeHtml(product.delivery_note)}`
      : "",
    "",
    "Klik tombol di bawah untuk membeli!",
  ]
    .filter(Boolean)
    .join("\n");
  const rows = [
    [{ text: "🛒 Beli Sekarang", callback_data: `buy_qty_${product.id}` }],
    [{ text: "⬅️ Kembali ke Daftar Produk", callback_data: "view_products" }],
  ];
  if (messageId) {
    return telegramApi("editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: rows },
    });
  }
  return sendMessage(chatId, text, { reply_markup: { inline_keyboard: rows } });
}

function manualPaymentKeyboard(orderId) {
  return [
    [{ text: "✅ Saya Sudah Bayar", callback_data: `payment_paid_${orderId}` }],
    [
      { text: "❌ Batalkan Pesanan", callback_data: `cancel_order_${orderId}` },
      {
        text: "🔎 Cek Status Pesanan",
        callback_data: `check_order_${orderId}`,
      },
    ],
  ];
}
async function sendManualPaymentInstructions(db, chatId, order) {
  const brand = getBrandSettings(db);
  const config = getManualPaymentConfig(db);
  const qris = getQrisImageFile(config);
  const orderCode = formatOrderCodeWithBrand(order.id, brand.shortName);
  const caption = [
    `💳 <b>Top Up ${orderCode}</b>`,
    "━━━━━━━━━━━━━━━━━━━━",
    `💰 <b>Nominal: Rp ${formatIdr(order.price)}</b>`,
    "",
    `📱 <b>${escapeHtml(config.methodName)}</b>`,
    `👤 Atas nama: ${escapeHtml(config.accountName)}`,
    "",
    escapeHtml(config.instructions),
    "",
    "Saldo akan bertambah sesuai nominal setelah bukti disetujui admin.",
    "Tekan <b>Saya Sudah Bayar</b> lalu kirim foto bukti pembayaran.",
    `⏰ Batas waktu: ${formatWibDateTime(order.expires_at)} WIB`,
  ].join("\n");
  return sendPhoto(chatId, qris.buffer, caption, {
    mime: qris.mime,
    filename: `gopay-merchant${qris.extension}`,
    reply_markup: { inline_keyboard: manualPaymentKeyboard(order.id) },
  });
}
function describeOrderStatus(order) {
  const isTopup = Number(order.product_id) === 0;
  const labels = {
    pending_payment: "Menunggu pembayaran",
    waiting_confirmation: "Bukti sedang diperiksa admin",
    payment_rejected: "Bukti ditolak / perlu dikirim ulang",
    delivery_pending: isTopup
      ? "Pembayaran disetujui, saldo segera dikreditkan"
      : "Pembayaran selesai, menunggu pengiriman",
    delivering: isTopup ? "Saldo sedang dikreditkan" : "Produk sedang dikirim",
    delivered: isTopup ? "Saldo sudah ditambahkan" : "Produk sudah dikirim",
    cancelled: "Pesanan dibatalkan",
    expired: "Pesanan kedaluwarsa",
  };
  return labels[order.status] || order.status;
}

async function handleBuyProduct(
  db,
  { chatId, messageId, userId, username, firstName, productId, quantity = 1 },
) {
  const user = db.getUser(userId);
  if (Number(user?.is_blocked) === 1)
    return sendMessage(
      chatId,
      "🚫 Akun kamu diblokir dan tidak dapat melakukan checkout. Hubungi customer service.",
    );
  const product = db.getProductById(productId);
  const brand = getBrandSettings(db);
  if (!product || !Number(product.is_active))
    return sendMessage(
      chatId,
      "😕 Produk tidak ditemukan atau sudah tidak tersedia.",
    );
  const transactionId = `wallet:${userId}:${chatId}:${messageId || 0}:${productId}:${quantity}`;
  let checkout;
  try {
    checkout = db.walletCheckout({
      user_id: userId,
      username: username || "",
      first_name: firstName || "",
      product_id: product.id,
      quantity,
      transaction_id: transactionId,
    });
  } catch (err) {
    if (err.message.startsWith("INSUFFICIENT:"))
      return sendMessage(
        chatId,
        `❌ ${escapeHtml(String(err.message).replace("INSUFFICIENT:", ""))}\n\nIsi saldo dengan <code>/topup jumlah</code>. Contoh: <code>/topup 5000</code>.`,
      );
    if (err.message.startsWith("NOSTOCK:"))
      return sendMessage(
        chatId,
        "😕 Stok produk tidak cukup. Saldo kamu tidak dipotong.",
      );
    if (err.message.startsWith("USER_BLOCKED:"))
      return sendMessage(
        chatId,
        "🚫 Akun kamu diblokir dan tidak dapat melakukan checkout.",
      );
    return sendMessage(
      chatId,
      `❌ Checkout gagal: ${escapeHtml(String(err.message).replace(/^[A-Z_]+:/, ""))}`,
    );
  }
  const order = db.getOrderById(checkout.orderId);
  const orderCode = formatOrderCodeWithBrand(order.id, brand.shortName);
  try {
    const delivery = await deliverOrder(db, order);
    if (!checkout.idempotent)
      await notifyAdmin(
        db,
        `🛍️ <b>Pembelian via Wallet</b>\n\n📦 ${escapeHtml(product.name)} x${quantity}\n👤 ${escapeHtml(firstName || username || userId)}\n💰 Rp ${formatIdr(checkout.total)}\n🏷️ ${orderCode}\n💳 Sisa saldo Rp ${formatIdr(checkout.balance)}`,
      );
    if (checkout.idempotent && delivery.skipped)
      await sendMessage(
        chatId,
        `ℹ️ Checkout ${orderCode} sudah diproses sebelumnya.`,
      );
  } catch (err) {
    console.error("[Buy] Delivery failed:", err.message);
    await sendMessage(
      chatId,
      `⚠️ Pembayaran wallet untuk ${orderCode} berhasil, tetapi pengiriman mengalami kendala. Admin akan memproses ulang tanpa memotong saldo lagi.`,
    );
  }
}

async function handleWalletTopup(db, msg, user, amountText) {
  const amount = Number(String(amountText || "").trim());
  if (!Number.isSafeInteger(amount) || amount < 1) {
    return sendMessage(
      msg.chat.id,
      "❌ Nominal top up harus bilangan Rupiah bulat positif.\n\nContoh: <code>/topup 5000</code>",
    );
  }
  if (Number(db.getUser(user.id)?.is_blocked) === 1)
    return sendMessage(
      msg.chat.id,
      "🚫 Akun kamu diblokir dan tidak dapat melakukan top up.",
    );
  const config = getManualPaymentConfig(db);
  if (!config.enabled)
    return sendMessage(
      msg.chat.id,
      "⚠️ Top up wallet sedang dinonaktifkan. Silakan coba lagi nanti.",
    );
  try {
    getQrisImageFile(config);
  } catch (err) {
    console.error("[Topup] GoPay QR unavailable:", err.message);
    return sendMessage(
      msg.chat.id,
      "⚠️ QR GoPay Merchant belum tersedia. Silakan hubungi admin.",
    );
  }

  const expiresAt = new Date(
    Date.now() + getCheckoutExpiryMinutes(db) * 60000,
  ).toISOString();
  const transactionId = `topup:${user.id}:${msg.chat.id}:${msg.message_id || 0}`;
  let created;
  try {
    created = db.createWalletTopupOrder({
      user_id: user.id,
      username: user.username || "",
      first_name: user.first_name || "",
      amount,
      transaction_id: transactionId,
      expires_at: expiresAt,
    });
    const order = db.getOrderById(created.orderId);
    await sendManualPaymentInstructions(db, msg.chat.id, order);
    if (!created.idempotent)
      await notifyAdmin(
        db,
        `💳 <b>Permintaan Top Up</b>\n\n👤 ${escapeHtml(user.first_name || user.username || user.id)}\n💰 Rp ${formatIdr(amount)}\n📋 ${formatOrderCodeWithBrand(order.id, getBrandSettings(db).shortName)}\n⏳ Menunggu bukti pembayaran.`,
      );
  } catch (err) {
    if (created?.orderId && !created.idempotent)
      db.cancelOrderByUser(created.orderId, user.id);
    const message = err.message.startsWith("DUPLICATE_TOPUP:")
      ? "Kamu masih punya top up aktif. Selesaikan, batalkan, atau tunggu hingga kedaluwarsa."
      : String(err.message).replace(/^[A-Z_]+:/, "");
    await sendMessage(
      msg.chat.id,
      `❌ Gagal membuat top up: ${escapeHtml(message)}`,
    );
  }
}

async function handleIncomingPaymentProof(db, msg, user) {
  const session = db.getPaymentProofSession(user.id);
  if (!session) return false;
  const photo =
    Array.isArray(msg.photo) && msg.photo.length
      ? msg.photo[msg.photo.length - 1]
      : null;
  const document =
    msg.document && String(msg.document.mime_type || "").startsWith("image/")
      ? msg.document
      : null;
  const telegramFile = photo || document;
  if (!telegramFile) {
    await sendMessage(
      msg.chat.id,
      "📷 Kirim bukti sebagai foto atau file gambar JPG, PNG, atau WebP (maksimum 2 MB).",
    );
    return true;
  }
  if (Number(telegramFile.file_size || 0) > 2 * 1024 * 1024) {
    await sendMessage(
      msg.chat.id,
      "❌ Ukuran bukti pembayaran maksimum 2 MB. Silakan kirim gambar yang lebih kecil.",
    );
    return true;
  }

  let writtenPath = null;
  try {
    const downloaded = await downloadTelegramFile(telegramFile.file_id);
    const type = validatePaymentImage(downloaded.buffer);
    const fileName = createRandomImageName(type.extension);
    const key = `payment/proofs/${fileName}`;
    const resolved = resolvePrivateUploadPath(UPLOADS_DIR, key, [
      "payment/proofs",
    ]);
    fs.writeFileSync(resolved.path, downloaded.buffer, { flag: "wx" });
    writtenPath = resolved.path;
    const previousKey = db.submitPaymentProof({
      userId: user.id,
      orderId: session.order_id,
      path: resolved.key,
      mime: type.mime,
    });
    writtenPath = null;
    if (previousKey) {
      try {
        const previous = resolvePrivateUploadPath(UPLOADS_DIR, previousKey, [
          "payment/proofs",
        ]);
        if (previous.path !== resolved.path && fs.existsSync(previous.path))
          fs.unlinkSync(previous.path);
      } catch {}
    }
    const order = db.getOrderById(session.order_id);
    const brand = getBrandSettings(db);
    await sendMessage(
      msg.chat.id,
      `✅ Bukti pembayaran untuk order <b>${formatOrderCodeWithBrand(order.id, brand.shortName)}</b> sudah diterima.\n\nStatus: <b>Menunggu konfirmasi admin</b>.`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "🔎 Cek Status Pesanan",
                callback_data: `check_order_${order.id}`,
              },
            ],
          ],
        },
      },
    );
    await notifyAdmin(
      db,
      `🧾 <b>Bukti Pembayaran Baru</b>\n\n📋 ${formatOrderCodeWithBrand(order.id, brand.shortName)}\n👤 ${escapeHtml(order.first_name || order.username || order.user_id)}\n📦 ${escapeHtml(order.product_name)}\n💰 Rp ${formatIdr(order.price)}\n\nPeriksa melalui panel admin.`,
    );
  } catch (err) {
    if (writtenPath && fs.existsSync(writtenPath)) {
      try {
        fs.unlinkSync(writtenPath);
      } catch {}
    }
    console.error("[PaymentProof]", err.message);
    await sendMessage(
      msg.chat.id,
      `❌ Bukti tidak dapat disimpan: ${escapeHtml(String(err.message).replace(/^[A-Z_]+:/, ""))}`,
    );
  }
  return true;
}

async function sendStartMenu(chatId, firstName = "Kak", options = {}) {
  const db = options?.db || createDb();
  const brand = options?.brand || getBrandSettings(db);
  const prefix = String(options?.prefix || "").trim();
  const lines = [];
  if (prefix) lines.push(prefix);
  lines.push(`Halo ${escapeHtml(firstName || "Kak")} 👋`);
  lines.push("");
  lines.push(brand.tagline || "Selamat datang!");
  await sendMessage(chatId, lines.join("\n"), {
    reply_markup: { inline_keyboard: getStartMenuKeyboard({ brand }) },
  });
}

// ============ RATE LIMIT MIDDLEWARE ============
app.use("/api/*", async (c, next) => {
  const ip =
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    c.req.header("x-real-ip") ||
    c.req.header("cf-connecting-ip") ||
    "unknown";
  const key = `api:${ip}`;
  if (!rateLimit(key, 200, 60000))
    return c.json(
      { ok: false, error: "Too many requests. Coba lagi nanti." },
      429,
    );
  await next();
});

// ============ ROUTES: HEALTH ============
app.get("/health", (c) =>
  jsonOk(c, {
    service: "ciganstore-order-bot",
    version: "3.0.0-manual-payment",
  }),
);
app.get("/", (c) => {
  if (env.ADMIN_APP_ORIGIN) return c.redirect(env.ADMIN_APP_ORIGIN, 302);
  return jsonOk(c, { service: "ciganstore-order-bot" });
});

// ============ ROUTES: TELEGRAM WEBHOOK ============
app.post("/telegram/webhook", async (c) => {
  const secret = c.req.header("x-telegram-bot-api-secret-token");
  if (env.TELEGRAM_WEBHOOK_SECRET && secret !== env.TELEGRAM_WEBHOOK_SECRET)
    return jsonErr(c, "Forbidden", 403);
  const db = c.get("db");
  const update = await c.req.json();
  const _maintenanceOn = isMaintenanceMode();
  if (update.message?.from) {
    const msg = update.message;
    const user = msg.from;
    db.upsertUser(user);
    if (_maintenanceOn) {
      if (String(user.id) !== String(env.ADMIN_ID)) {
        await sendMessage(
          msg.chat.id,
          "🔧 <b>Maintenance Mode</b>\n\nToko sedang dalam perbaikan. Silakan coba lagi nanti.",
        );
        return c.text("ok");
      }
    }
    if (await handleIncomingPaymentProof(db, msg, user)) return c.text("ok");
    if (!checkTgFlood(user.id)) return c.text("ok");
    const text = (msg.text || "").trim();
    if (text.startsWith("/start"))
      await sendStartMenu(msg.chat.id, user.first_name, { db });
    else if (
      text.startsWith("/produk") ||
      text.startsWith("/shop") ||
      text.startsWith("/store")
    )
      await sendProductCatalog(db, msg.chat.id);
    else if (text.startsWith("/pesanan") || text.startsWith("/order")) {
      const orders = db.getOrdersByUser(user.id, 10);
      if (!orders.length) {
        await sendMessage(msg.chat.id, "📭 Belum ada pesanan.");
      } else {
        const brand = getBrandSettings(db);
        const lines = orders.map(
          (o) =>
            `${formatOrderCodeWithBrand(o.id, brand.shortName)} | ${escapeHtml(o.product_name)} | Rp ${formatIdr(o.price)} | ${o.status.toUpperCase()}`,
        );
        await sendMessage(
          msg.chat.id,
          `<b>Pesanan Kamu</b>\n\n${lines.join("\n")}`,
        );
      }
    } else if (text.startsWith("/wallet") || text.startsWith("/saldo")) {
      const wallet = db.getWallet(user.id);
      await sendMessage(
        msg.chat.id,
        `💳 <b>Saldo Wallet</b>\n\nRp ${formatIdr(wallet.balance)}\n\nSemua produk dibayar dari saldo. Isi saldo dengan <code>/topup jumlah</code>.`,
      );
    } else if (text === "/topup" || text.startsWith("/topup ")) {
      await handleWalletTopup(db, msg, user, text.slice("/topup".length));
    } else if (text.startsWith("/support") || text.startsWith("/bantuan"))
      await sendMessage(
        msg.chat.id,
        "🎫 <b>Customer Support</b>\n\nKirim pesan kamu di bawah ini dan kami akan membalas secepatnya.\n\nFormat:\n/tiket [pesan kamu]\n\nContoh:\n/tiket Akun tidak bisa login",
      );
    else if (text.startsWith("/tiket ")) {
      const content = text.slice(7).trim();
      if (!content || content.length < 5) {
        await sendMessage(
          msg.chat.id,
          "❌ Pesan tiket minimal 5 karakter.\n\nFormat: /tiket [pesan kamu]",
        );
      } else {
        const ticketId = db.createTicket(
          user.id,
          user.username,
          user.first_name,
          content.slice(0, 50),
          content,
        );
        await sendMessage(
          msg.chat.id,
          `✅ Tiket #${ticketId} berhasil dibuat.\n\nKami akan membalas secepatnya. Cek status dengan /pesanan.`,
        );
        await notifyAdmin(
          db,
          `🎫 <b>Tiket Baru #${ticketId}</b>\n\n👤 ${escapeHtml(user.first_name || user.username)}\n💬 ${escapeHtml(content.slice(0, 200))}`,
        );
      }
    } else if (text)
      await sendStartMenu(msg.chat.id, user.first_name, {
        prefix: "Perintah tidak dikenali. Menampilkan menu utama ya.",
        db,
      });
  }
  if (update.callback_query) {
    const cq = update.callback_query;
    const data = cq.data || "";
    const user = cq.from;
    const chatId = cq.message?.chat?.id;
    const messageId = cq.message?.message_id;
    await answerCallback(cq.id);
    db.upsertUser(user);
    if (!checkTgFlood(user.id)) return c.text("ok");
    if (_maintenanceOn) {
      if (String(user.id) !== String(env.ADMIN_ID)) return c.text("ok");
    }
    if (data === "view_products")
      await sendProductCatalog(db, chatId, messageId, 0);
    else if (data === "view_products_keep")
      await sendProductCatalog(db, chatId, null, 0);
    else if (data.startsWith("catalog_page_")) {
      const page = Number(data.split("_")[2]) || 0;
      await sendProductCatalog(db, chatId, messageId, page);
    } else if (data.startsWith("product_detail_")) {
      const productId = Number(data.split("_")[2]);
      await sendProductDetail(db, chatId, messageId, productId);
    } else if (data.startsWith("buy_qty_")) {
      const productId = Number(data.split("_")[2]);
      const product = db.getProductById(productId);
      if (!product) {
        await sendMessage(chatId, "😕 Produk tidak ditemukan.");
        return;
      }
      const isUnlimited = Number(product.is_unlimited_stock) === 1;
      const stockCount = Number(product.stock_count || 0);
      const maxQty = isUnlimited ? 10 : Math.min(10, Math.max(0, stockCount));
      if (maxQty < 1) {
        await sendMessage(chatId, "😕 Stok produk ini sedang habis.");
        return;
      }
      const rows = [];
      for (let q = 1; q <= maxQty; q++) {
        rows.push({
          text: `${q}x - Rp ${formatIdr(Number(product.price) * q)}`,
          callback_data: `buy_${productId}_${q}`,
        });
      }
      const keyboard = [];
      for (let i = 0; i < rows.length; i += 3) {
        keyboard.push(rows.slice(i, i + 3));
      }
      keyboard.push([
        { text: "⬅️ Kembali", callback_data: `product_detail_${productId}` },
      ]);
      await sendMessage(
        chatId,
        `🛒 <b>Pilih Jumlah</b>\n\n${escapeHtml(product.name)}\n💰 Rp ${formatIdr(product.price)}/item\n📦 Stok: ${isUnlimited ? "∞ Unlimited" : stockCount}\n\nPilih jumlah pembelian:`,
        { reply_markup: { inline_keyboard: keyboard } },
      );
    } else if (data.startsWith("buy_")) {
      const parts = data.split("_");
      const productId = Number(parts[1]);
      const quantity = Number(parts[2] || 1);
      await handleBuyProduct(db, {
        chatId,
        messageId,
        userId: user.id,
        username: user.username,
        firstName: user.first_name,
        productId,
        quantity,
      });
    } else if (data.startsWith("payment_paid_")) {
      const orderId = Number(data.slice("payment_paid_".length));
      try {
        const order = db.startPaymentProofSession(user.id, orderId);
        const brand = getBrandSettings(db);
        await sendMessage(
          chatId,
          `📷 <b>Kirim Bukti Pembayaran</b>\n\nOrder: <b>${formatOrderCodeWithBrand(order.id, brand.shortName)}</b>\n\nSilakan kirim foto bukti pembayaran sekarang. Format JPG, PNG, atau WebP; maksimum 2 MB.`,
        );
      } catch (err) {
        await sendMessage(
          chatId,
          `❌ ${escapeHtml(String(err.message).replace(/^[A-Z_]+:/, ""))}`,
        );
      }
    } else if (data.startsWith("cancel_order_")) {
      const orderId = Number(data.slice("cancel_order_".length));
      const cancelled = db.cancelOrderByUser(orderId, user.id);
      if (cancelled) {
        await sendMessage(chatId, "✅ Pesanan berhasil dibatalkan.");
      } else {
        const order = db.getOrderById(orderId);
        await sendMessage(
          chatId,
          order && Number(order.user_id) === Number(user.id)
            ? `❌ Order berstatus <b>${escapeHtml(order.status)}</b> dan tidak dapat dibatalkan.`
            : "❌ Order tidak ditemukan.",
        );
      }
    } else if (data.startsWith("check_order_")) {
      const orderId = Number(data.slice("check_order_".length));
      const order = db.getOrderById(orderId);
      if (!order || Number(order.user_id) !== Number(user.id)) {
        await sendMessage(chatId, "❌ Order tidak ditemukan.");
      } else {
        const brand = getBrandSettings(db);
        const rows = [];
        if (["pending_payment", "payment_rejected"].includes(order.status))
          rows.push([
            {
              text: "✅ Saya Sudah Bayar",
              callback_data: `payment_paid_${order.id}`,
            },
          ]);
        rows.push([{ text: "📦 Pesanan Saya", callback_data: "my_orders" }]);
        const reason =
          order.status === "payment_rejected" && order.payment_rejection_reason
            ? `\n\nAlasan admin: ${escapeHtml(order.payment_rejection_reason)}`
            : "";
        const deliveryError = order.delivery_error
          ? `\n\nKendala pengiriman: ${escapeHtml(order.delivery_error)}`
          : "";
        await sendMessage(
          chatId,
          `🔎 <b>Status ${formatOrderCodeWithBrand(order.id, brand.shortName)}</b>\n\n${escapeHtml(describeOrderStatus(order))}${reason}${deliveryError}`,
          { reply_markup: { inline_keyboard: rows } },
        );
      }
    } else if (data === "my_orders" || data === "my_orders_keep") {
      const orders = db.getOrdersByUser(user.id, 10);
      const brand = getBrandSettings(db);
      const text = orders.length
        ? `<b>Pesanan Kamu</b>\n\n${orders.map((o) => `${formatOrderCodeWithBrand(o.id, brand.shortName)} | ${escapeHtml(o.product_name)} | Rp ${formatIdr(o.price)} | ${o.status.toUpperCase()}`).join("\n")}`
        : "📭 Belum ada pesanan.";
      await sendMessage(chatId, text, {
        reply_markup: { inline_keyboard: getStartMenuKeyboard({ brand }) },
      });
    } else if (data === "wallet") {
      const wallet = db.getWallet(user.id);
      await sendMessage(
        chatId,
        `💳 <b>Saldo Wallet</b>\n\nRp ${formatIdr(wallet.balance)}\n\nSemua produk dibayar dari saldo. Isi saldo dengan <code>/topup jumlah</code>.`,
        { reply_markup: { inline_keyboard: getStartMenuKeyboard({}) } },
      );
    } else if (data === "support")
      await sendMessage(
        chatId,
        "🎫 Kirim /tiket [pesan] untuk buat tiket support baru.",
      );
  }
  return c.text("ok");
});

// ============ ROUTES: ADMIN ============
app.post("/api/admin/login", async (c) => {
  const ip =
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    c.req.header("x-real-ip") ||
    "unknown";
  const loginKey = `admin_login:${ip}`;
  if (!rateLimit(loginKey, 5, 300000))
    return jsonErr(
      c,
      "Terlalu banyak percobaan login. Coba lagi dalam 5 menit.",
      429,
    );
  const body = await c.req.json();
  if (!body.password || body.password !== env.ADMIN_PANEL_PASSWORD)
    return jsonErr(c, "Password salah", 401);
  const token = createSessionToken(
    { role: "admin", iat: Date.now(), exp: Date.now() + 86400000 },
    env.ADMIN_SESSION_SECRET,
  );
  c.header(
    "Set-Cookie",
    `tb_session=${token}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=86400`,
  );
  return jsonOk(c, { message: "Login sukses" });
});
app.post("/api/admin/logout", requireAdmin, async (c) => {
  c.header(
    "Set-Cookie",
    "tb_session=; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=0",
  );
  return jsonOk(c, { message: "Logout sukses" });
});
app.get("/api/admin/bootstrap", requireAdmin, async (c) => {
  const db = c.get("db");
  const brand = getBrandSettings(db);
  const manualPayment = getManualPaymentConfig(db);
  const openTickets = db.getOpenTicketCount();
  let qrisConfigured = false;
  try {
    getQrisImageFile(manualPayment);
    qrisConfigured = true;
  } catch {}
  const walletTopup = {
    enabled: manualPayment.enabled,
    methodName: manualPayment.methodName,
    accountName: manualPayment.accountName,
    instructions: manualPayment.instructions,
    qrisConfigured,
    minimumAmount: 1,
  };
  return jsonOk(c, {
    stats: db.getDashboardStats(),
    recentOrders: db.getAllOrders(12),
    adminTelegramId: db.getSetting(
      "admin_telegram_id",
      String(env.ADMIN_ID || ""),
    ),
    paymentGateway: "wallet",
    manualPayment: walletTopup,
    walletTopup,
    checkoutExpiryMinutes: getCheckoutExpiryMinutes(db),
    brand,
    openTickets,
    systemStatus: {
      secrets: {
        BOT_TOKEN: Boolean(env.BOT_TOKEN),
        ADMIN_PANEL_PASSWORD: Boolean(env.ADMIN_PANEL_PASSWORD),
        ADMIN_SESSION_SECRET: Boolean(env.ADMIN_SESSION_SECRET),
        TELEGRAM_WEBHOOK_SECRET: Boolean(env.TELEGRAM_WEBHOOK_SECRET),
      },
      vars: {
        API_BASE_URL: Boolean(env.API_BASE_URL),
        ADMIN_APP_ORIGIN: Boolean(env.ADMIN_APP_ORIGIN),
        MANUAL_PAYMENT_QRIS_IMAGE: Boolean(manualPayment.qrisImage),
      },
    },
  });
});
app.post("/api/admin/settings/branding", requireAdmin, async (c) => {
  const db = c.get("db");
  const body = await c.req.json();
  const name = String(body?.name || "").trim();
  const shortName = String(body?.shortName || "")
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, 8)
    .toUpperCase();
  if (!name || name.length < 2)
    return jsonErr(c, "Brand name minimal 2 karakter");
  if (!shortName || shortName.length < 2)
    return jsonErr(c, "Short name minimal 2 karakter");
  db.setSetting("brand_name", name);
  db.setSetting("brand_short_name", shortName);
  db.setSetting("brand_tagline", String(body?.tagline || "").trim());
  db.setSetting(
    "broadcast_title",
    String(body?.broadcastTitle || "Pengumuman Resmi").trim(),
  );
  db.setSetting(
    "support_telegram_url",
    String(body?.supportTelegramUrl || "").trim(),
  );
  db.setSetting(
    "support_whatsapp_url",
    String(body?.supportWhatsappUrl || "").trim(),
  );
  db.insertAudit("settings.branding.update", "admin", { name, shortName });
  return jsonOk(c, getBrandSettings(db));
});
app.post("/api/admin/settings/general", requireAdmin, async (c) => {
  const db = c.get("db");
  const body = await c.req.json();
  const adminTelegramId = String(body?.adminTelegramId || "").trim();
  const methodName = String(body?.methodName || "GoPay Merchant QR").trim();
  const accountName = String(body?.accountName || "").trim();
  const instructions = String(body?.instructions || "").trim();
  const checkoutExpiryMinutes = Number(body?.checkoutExpiryMinutes || 60);
  if (!adminTelegramId || !/^\d+$/.test(adminTelegramId))
    return jsonErr(c, "Telegram Admin ID harus angka");
  if (!methodName || methodName.length > 50)
    return jsonErr(c, "Nama metode top up tidak valid");
  if (!accountName || accountName.length > 100)
    return jsonErr(c, "Nama akun merchant wajib diisi");
  if (!instructions || instructions.length > 1000)
    return jsonErr(c, "Instruksi top up wajib diisi (maksimum 1000 karakter)");
  if (
    !Number.isFinite(checkoutExpiryMinutes) ||
    checkoutExpiryMinutes < 5 ||
    checkoutExpiryMinutes > 1440
  )
    return jsonErr(c, "Expiry harus 5-1440 menit");
  const enabled = body?.enabled !== false;
  db.setSetting("payment_gateway", "wallet");
  db.setSetting("wallet_topup_enabled", enabled ? "1" : "0");
  db.setSetting("wallet_min_topup", "1");
  db.setSetting("manual_payment_enabled", enabled ? "1" : "0");
  db.setSetting("manual_payment_method_name", methodName);
  db.setSetting("manual_payment_account_name", accountName);
  db.setSetting("manual_payment_instructions", instructions);
  db.setSetting("admin_telegram_id", adminTelegramId);
  db.setSetting(
    "order_expiry_minutes",
    String(Math.floor(checkoutExpiryMinutes)),
  );
  db.insertAudit("settings.wallet_topup.update", "admin", {
    adminTelegramId,
    methodName,
    enabled,
  });
  return jsonOk(c, {
    paymentGateway: "wallet",
    adminTelegramId,
    checkoutExpiryMinutes: Math.floor(checkoutExpiryMinutes),
    enabled,
  });
});
app.post("/api/admin/payment/qris-image", requireAdmin, async (c) => {
  const db = c.get("db");
  const contentLength = Number(c.req.header("content-length") || 0);
  if (contentLength > 2 * 1024 * 1024 + 256 * 1024)
    return jsonErr(c, "Ukuran request terlalu besar", 413);
  const form = await c.req.formData();
  const file = form.get("file");
  if (!file || typeof file === "string")
    return jsonErr(c, "Gambar QRIS wajib diisi");
  if (Number(file.size || 0) > 2 * 1024 * 1024)
    return jsonErr(c, "Ukuran gambar maksimum 2 MB");
  const buffer = Buffer.from(await file.arrayBuffer());
  let type;
  try {
    type = validatePaymentImage(buffer);
  } catch (err) {
    return jsonErr(c, err.message);
  }
  const key = `payment/${createRandomImageName(type.extension)}`;
  const resolved = resolvePrivateUploadPath(UPLOADS_DIR, key, ["payment"]);
  fs.writeFileSync(resolved.path, buffer, { flag: "wx" });
  const previousKey = db.getSetting("manual_payment_qris_image", "");
  db.setSetting("manual_payment_qris_image", resolved.key);
  db.insertAudit("settings.manual_payment.qris_upload", "admin", {
    mime: type.mime,
    size: type.size,
  });
  if (previousKey) {
    try {
      const previous = resolvePrivateUploadPath(UPLOADS_DIR, previousKey, [
        "payment",
      ]);
      if (previous.path !== resolved.path && fs.existsSync(previous.path))
        fs.unlinkSync(previous.path);
    } catch {}
  }
  return jsonOk(c, { configured: true, mime: type.mime, size: type.size });
});
app.get("/api/admin/payment/qris-image", requireAdmin, async (c) => {
  try {
    const qris = getQrisImageFile(getManualPaymentConfig(c.get("db")));
    return new Response(qris.buffer, {
      status: 200,
      headers: {
        "content-type": qris.mime,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (err) {
    return jsonErr(c, err.message, 404);
  }
});
app.get("/api/admin/telegram/webhook/status", requireAdmin, async (c) => {
  if (!env.BOT_TOKEN)
    return jsonOk(c, { configured: false, reason: "BOT_TOKEN belum diset" });
  try {
    const info = await telegramApi("getWebhookInfo", {});
    const expectedUrl = `${env.API_BASE_URL}/telegram/webhook`;
    return jsonOk(c, {
      configured: info?.url === expectedUrl,
      expectedUrl,
      info,
    });
  } catch (err) {
    return jsonErr(c, err.message, 500);
  }
});
app.post("/api/admin/telegram/webhook/setup", requireAdmin, async (c) => {
  if (!env.BOT_TOKEN || !env.API_BASE_URL)
    return jsonErr(c, "BOT_TOKEN/API_BASE_URL harus diset dulu");
  const url = `${env.API_BASE_URL}/telegram/webhook`;
  const result = await setWebhook(url, env.TELEGRAM_WEBHOOK_SECRET);
  return jsonOk(c, { configured: true, webhookUrl: url, result });
});
app.post("/api/admin/telegram/webhook/delete", requireAdmin, async (c) => {
  if (!env.BOT_TOKEN) return jsonErr(c, "BOT_TOKEN belum diset");
  const result = await telegramApi("deleteWebhook", {
    drop_pending_updates: false,
  });
  return jsonOk(c, { deleted: true, result });
});
app.get("/api/admin/products", requireAdmin, async (c) =>
  jsonOk(c, c.get("db").getProducts()),
);
app.post("/api/admin/products", requireAdmin, async (c) => {
  const db = c.get("db");
  const body = await c.req.json();
  const price = Number(body.price);
  if (!body.name || !Number.isFinite(price) || price < 1000)
    return jsonErr(c, "Data produk tidak valid");
  const isUnlimited = Boolean(body.is_unlimited_stock);
  if (isUnlimited && !body.digital_file_pointer)
    return jsonErr(c, "Produk unlimited wajib punya file pointer");
  const id = db.addProduct({
    ...body,
    price,
    is_unlimited_stock: isUnlimited ? 1 : 0,
  });
  db.insertAudit("product.create", "admin", { id, name: body.name });
  return jsonOk(c, { id });
});
app.put("/api/admin/products/:id", requireAdmin, async (c) => {
  const db = c.get("db");
  const id = Number(c.req.param("id"));
  const body = await c.req.json();
  const price = Number(body.price);
  if (!id || !body.name || !Number.isFinite(price) || price < 1000)
    return jsonErr(c, "Data produk tidak valid");
  db.updateProduct(id, {
    ...body,
    price,
    is_unlimited_stock: Boolean(body.is_unlimited_stock) ? 1 : 0,
  });
  db.insertAudit("product.update", "admin", { id });
  return jsonOk(c, { id });
});
app.delete("/api/admin/products/:id", requireAdmin, async (c) => {
  const db = c.get("db");
  const id = Number(c.req.param("id"));
  if (!id) return jsonErr(c, "ID tidak valid");
  db.deleteProduct(id);
  db.insertAudit("product.delete", "admin", { id });
  return jsonOk(c, { id });
});
app.get("/api/admin/products/:id/buyers", requireAdmin, async (c) => {
  const db = c.get("db");
  const id = Number(c.req.param("id"));
  const product = db.getProductById(id);
  if (!product) return jsonErr(c, "Produk tidak ditemukan", 404);
  return jsonOk(c, {
    productId: id,
    productName: product.name,
    buyers: db.getProductBuyers(id),
  });
});
app.post("/api/admin/products/:id/notify-update", requireAdmin, async (c) => {
  const db = c.get("db");
  const id = Number(c.req.param("id"));
  const body = await c.req.json().catch(() => ({}));
  const message = String(body?.message || "").trim();
  if (!message || message.length < 5)
    return jsonErr(c, "Pesan update minimal 5 karakter.");
  const product = db.getProductById(id);
  if (!product) return jsonErr(c, "Produk tidak ditemukan", 404);
  if (
    !(Number(product.is_unlimited_stock) === 1 && product.digital_file_pointer)
  )
    return jsonErr(c, "Hanya untuk produk digital (stok ∞)");
  const buyers = db.getProductBuyers(id);
  if (!buyers.length) return jsonErr(c, "Belum ada buyer.");
  (async () => {
    const brand = getBrandSettings(db);
    for (const buyer of buyers) {
      const lines = [
        `🔔 <b>Update Produk: ${escapeHtml(product.name)}</b>\n━━━━━━━━━━━━━━━━━━━━\n\n${escapeHtml(message)}`,
      ];
      if (
        body?.includeNewDownload !== false &&
        product.digital_file_pointer &&
        isR2FilePointer(product.digital_file_pointer)
      ) {
        const key = toLocalFileKey(product.digital_file_pointer);
        if (key) {
          const fakeOrder = {
            id: buyer.latest_order_id || 0,
            user_id: buyer.user_id,
          };
          const url = createUniqueDownloadUrl(db, fakeOrder, key);
          lines.push(
            `\n📥 <b>Link Download Terbaru</b>\n${url}\n<i>Berlaku 72 jam, max 5x download.</i>`,
          );
        }
      }
      try {
        await sendMessage(Number(buyer.user_id), lines.join("\n"));
      } catch {}
      await wait(50);
    }
    db.insertAudit("product.notify_update.done", "admin", {
      productId: id,
      totalBuyers: buyers.length,
    });
  })();
  return jsonOk(c, { productId: id, totalBuyers: buyers.length, queued: true });
});
app.get("/api/admin/stock/:productId", requireAdmin, async (c) => {
  const db = c.get("db");
  const productId = Number(c.req.param("productId"));
  const product = db.getProductById(productId);
  if (!product) return jsonErr(c, "Produk tidak ditemukan", 404);
  return jsonOk(c, { product, stock: db.listStock(productId) });
});
app.post("/api/admin/stock/:productId", requireAdmin, async (c) => {
  const db = c.get("db");
  const productId = Number(c.req.param("productId"));
  const body = await c.req.json();
  if (!productId || !Array.isArray(body.items))
    return jsonErr(c, "Payload tidak valid");
  const product = db.getProductById(productId);
  if (!product) return jsonErr(c, "Produk tidak ditemukan", 404);
  if (Number(product.is_unlimited_stock) === 1)
    return jsonErr(c, "Produk ini unlimited. Edit produk untuk ganti file.");
  const cleanItems = body.items.map((i) => (i || "").trim()).filter(Boolean);
  if (!cleanItems.length) return jsonErr(c, "Tidak ada item stok");
  const added = db.addStockItems(productId, cleanItems);
  db.insertAudit("stock.add", "admin", { productId, count: added });
  const shouldBroadcast = body.broadcast !== false;
  if (shouldBroadcast) {
    const brand = getBrandSettings(db);
    const text = `🔔 <b>Stok Baru Tersedia!</b>\n━━━━━━━━━━━━━━━━━━━━\n\n📦 <b>${escapeHtml(product.name)}</b>\n💰 Rp ${formatIdr(product.price)}\n📦 Stok ditambah: +${added}\n\nBuruan checkout sebelum kehabisan! 🛒`;
    (async () => {
      let cursor = 0;
      for (;;) {
        const page = db.getActiveUsersPage({
          afterUserId: cursor,
          pageSize: 500,
        });
        if (!page.length) break;
        for (let i = 0; i < page.length; i += 25) {
          const chunk = page.slice(i, i + 25);
          await Promise.allSettled(
            chunk.map((u) => deliverBroadcastToUser(u, text, {})),
          );
          await wait(1100);
        }
        cursor = Number(page[page.length - 1].user_id);
        if (page.length < 500) break;
      }
      db.insertAudit("stock.add.broadcast", "admin", {
        productId,
        productName: product.name,
        stockAdded: added,
      });
    })();
  }
  await notifyAdmin(
    db,
    `📦 Stok ditambah: <b>${escapeHtml(product.name)}</b> +${added} item`,
  );
  return jsonOk(c, { added, broadcast: shouldBroadcast });
});
app.delete("/api/admin/stock/item/:stockId", requireAdmin, async (c) => {
  const db = c.get("db");
  const stockId = Number(c.req.param("stockId"));
  if (!stockId) return jsonErr(c, "ID stok tidak valid");
  db.deleteUnsoldStockById(stockId);
  db.insertAudit("stock.delete", "admin", { stockId });
  return jsonOk(c, { stockId });
});
app.get("/api/admin/orders", requireAdmin, async (c) => {
  const db = c.get("db");
  const limit = Math.min(500, Math.max(1, Number(c.req.query("limit") || 100)));
  return jsonOk(c, db.getAllOrders(limit));
});
app.get("/api/admin/users", requireAdmin, async (c) => {
  const db = c.get("db");
  const limit = Math.min(
    2000,
    Math.max(1, Number(c.req.query("limit") || 500)),
  );
  return jsonOk(c, db.getUsersOverview(limit));
});
app.post("/api/admin/broadcast", requireAdmin, async (c) => {
  const db = c.get("db");
  const body = await c.req.json();
  const message = String(body?.message || "").trim();
  if (!message || message.length < 3)
    return jsonErr(c, "Pesan broadcast minimal 3 karakter");
  const buttonText = String(body?.buttonText || "").trim();
  const buttonUrl = String(body?.buttonUrl || "").trim();
  if ((buttonText && !buttonUrl) || (!buttonText && buttonUrl))
    return jsonErr(c, "Button text dan URL harus diisi bersamaan");
  const totalRecipients = db.countActiveUsers();
  if (!totalRecipients) return jsonErr(c, "Belum ada user aktif");
  const jobId = db.createBroadcastJob({
    message,
    buttonText,
    buttonUrl,
    recipients: totalRecipients,
  });
  runBroadcastJob(jobId, { message, buttonText, buttonUrl });
  db.insertAudit("broadcast.queue", "admin", {
    jobId,
    recipients: totalRecipients,
  });
  return jsonOk(c, { jobId, recipients: totalRecipients, queued: true });
});
app.get("/api/admin/broadcast/jobs", requireAdmin, async (c) =>
  jsonOk(
    c,
    c.get("db").getRecentBroadcastJobs(Number(c.req.query("limit") || 5)),
  ),
);
app.get("/api/admin/broadcast/jobs/:id", requireAdmin, async (c) => {
  const job = c.get("db").getBroadcastJob(Number(c.req.param("id")));
  return job ? jsonOk(c, job) : jsonErr(c, "Not found", 404);
});
app.post("/api/admin/uploads/digital-file", requireAdmin, async (c) => {
  const form = await c.req.formData();
  const file = form.get("file");
  if (!file || typeof file === "string")
    return jsonErr(c, "File digital wajib diisi");
  const safeName = String(file.name || "download.bin").replace(
    /[^a-zA-Z0-9._-]+/g,
    "_",
  );
  const key = `downloads/${Date.now()}-${crypto.randomUUID()}-${safeName}`;
  const filePath = path.join(UPLOADS_DIR, key);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const bytes = await file.arrayBuffer();
  fs.writeFileSync(filePath, Buffer.from(bytes));
  return jsonOk(c, { key, stockValue: `file:${key}` });
});
app.get("/api/admin/analytics", requireAdmin, async (c) => {
  const db = c.get("db");
  const days = Math.min(365, Math.max(7, Number(c.req.query("days") || 30)));
  return jsonOk(c, db.getAnalytics(days));
});
app.get("/api/admin/manual-payments", requireAdmin, async (c) => {
  const limit = Number(c.req.query("limit") || 200);
  return jsonOk(c, c.get("db").listManualPayments(limit));
});
app.get("/api/admin/orders/:id/payment-proof", requireAdmin, async (c) => {
  const db = c.get("db");
  const order = db.getOrderById(Number(c.req.param("id")));
  if (!order || !order.payment_proof_path)
    return jsonErr(c, "Bukti pembayaran tidak ditemukan", 404);
  try {
    const proof = resolvePrivateUploadPath(
      UPLOADS_DIR,
      order.payment_proof_path,
      ["payment/proofs"],
    );
    if (!fs.existsSync(proof.path))
      return jsonErr(c, "File bukti tidak ditemukan", 404);
    const buffer = fs.readFileSync(proof.path);
    const type = validatePaymentImage(buffer);
    return new Response(buffer, {
      status: 200,
      headers: {
        "content-type": type.mime,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (err) {
    return jsonErr(c, err.message, 404);
  }
});
app.post("/api/admin/orders/:id/approve-payment", requireAdmin, async (c) => {
  const db = c.get("db");
  const id = Number(c.req.param("id"));
  const body = await c.req.json().catch(() => ({}));
  const actor = String(c.get("admin")?.sub || env.ADMIN_ID || "admin");
  let approved;
  try {
    approved = db.approveManualPayment(
      id,
      actor,
      String(body?.note || "").trim(),
    );
  } catch (err) {
    return jsonErr(
      c,
      String(err.message).replace(/^[A-Z_]+:/, ""),
      err.message.startsWith("ORDER_NOT_FOUND:") ? 404 : 409,
    );
  }
  if (
    !approved.changed &&
    ["delivering", "delivered"].includes(approved.order.status)
  )
    return jsonOk(c, { id, status: approved.order.status, idempotent: true });
  try {
    const delivery = await deliverOrder(db, approved.order);
    db.insertAudit("manual_payment.approve", actor, { orderId: id, delivery });
    return jsonOk(c, {
      id,
      status: db.getOrderById(id).status,
      delivery,
      idempotent: !approved.changed,
    });
  } catch (err) {
    db.insertAudit("manual_payment.approve.delivery_failed", actor, {
      orderId: id,
      error: err.message,
    });
    return jsonErr(
      c,
      `Pembayaran disetujui, tetapi pengiriman gagal: ${err.message}`,
      502,
    );
  }
});
app.post("/api/admin/orders/:id/reject-payment", requireAdmin, async (c) => {
  const db = c.get("db");
  const id = Number(c.req.param("id"));
  const body = await c.req.json();
  const reason = String(body?.reason || "").trim();
  if (reason.length < 3 || reason.length > 1000)
    return jsonErr(c, "Alasan penolakan wajib diisi (3-1000 karakter)");
  const actor = String(c.get("admin")?.sub || env.ADMIN_ID || "admin");
  let order;
  try {
    order = db.rejectManualPayment(
      id,
      actor,
      reason,
      false,
      String(body?.note || "").trim(),
    );
  } catch (err) {
    return jsonErr(
      c,
      String(err.message).replace(/^[A-Z_]+:/, ""),
      err.message.startsWith("ORDER_NOT_FOUND:") ? 404 : 409,
    );
  }
  const brand = getBrandSettings(db);
  try {
    await sendMessage(
      order.user_id,
      `❌ <b>Bukti Pembayaran Ditolak</b>\n\nOrder ${formatOrderCodeWithBrand(order.id, brand.shortName)}\nAlasan: ${escapeHtml(reason)}\n\nKamu dapat menekan tombol di bawah untuk mengirim bukti baru.`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "✅ Saya Sudah Bayar",
                callback_data: `payment_paid_${order.id}`,
              },
            ],
            [
              {
                text: "🔎 Cek Status Pesanan",
                callback_data: `check_order_${order.id}`,
              },
            ],
          ],
        },
      },
    );
  } catch {}
  db.insertAudit("manual_payment.reject", actor, { orderId: id, reason });
  return jsonOk(c, { id, status: order.status });
});
app.post("/api/admin/orders/:id/request-new-proof", requireAdmin, async (c) => {
  const db = c.get("db");
  const id = Number(c.req.param("id"));
  const body = await c.req.json();
  const reason = String(body?.reason || "").trim();
  if (reason.length < 3 || reason.length > 1000)
    return jsonErr(c, "Catatan bukti ulang wajib diisi (3-1000 karakter)");
  const actor = String(c.get("admin")?.sub || env.ADMIN_ID || "admin");
  const expiresAt = new Date(
    Date.now() + getCheckoutExpiryMinutes(db) * 60000,
  ).toISOString();
  let order;
  try {
    order = db.rejectManualPayment(
      id,
      actor,
      reason,
      true,
      String(body?.note || "").trim(),
      expiresAt,
    );
  } catch (err) {
    return jsonErr(
      c,
      String(err.message).replace(/^[A-Z_]+:/, ""),
      err.message.startsWith("ORDER_NOT_FOUND:") ? 404 : 409,
    );
  }
  const brand = getBrandSettings(db);
  try {
    await sendMessage(
      order.user_id,
      `🔁 <b>Mohon Kirim Bukti Ulang</b>\n\nOrder ${formatOrderCodeWithBrand(order.id, brand.shortName)}\nCatatan admin: ${escapeHtml(reason)}\nBatas baru: ${formatWibDateTime(order.expires_at)} WIB`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "📷 Kirim Bukti Ulang",
                callback_data: `payment_paid_${order.id}`,
              },
            ],
            [
              {
                text: "🔎 Cek Status Pesanan",
                callback_data: `check_order_${order.id}`,
              },
            ],
          ],
        },
      },
    );
  } catch {}
  db.insertAudit("manual_payment.request_new_proof", actor, {
    orderId: id,
    reason,
    expiresAt,
  });
  return jsonOk(c, { id, status: order.status, expiresAt });
});
app.post("/api/admin/orders/:id/retry-delivery", requireAdmin, async (c) => {
  const db = c.get("db");
  const id = Number(c.req.param("id"));
  const order = db.getOrderById(id);
  if (!order) return jsonErr(c, "Order tidak ditemukan", 404);
  if (order.status === "delivered")
    return jsonOk(c, { id, status: "delivered", idempotent: true });
  if (order.status !== "delivery_pending")
    return jsonErr(
      c,
      `Order berstatus ${order.status}; retry hanya tersedia untuk delivery_pending`,
      409,
    );
  try {
    const delivery = await deliverOrder(db, order);
    db.insertAudit("order.retry_delivery", "admin", { orderId: id, delivery });
    return jsonOk(c, { id, status: db.getOrderById(id).status, delivery });
  } catch (err) {
    return jsonErr(c, `Pengiriman masih gagal: ${err.message}`, 502);
  }
});
app.get("/api/admin/reviews", requireAdmin, async (c) =>
  jsonOk(c, c.get("db").getAllReviews(100)),
);
app.post("/api/admin/reviews/:id/toggle", requireAdmin, async (c) => {
  const db = c.get("db");
  const id = Number(c.req.param("id"));
  const body = await c.req.json();
  db.toggleReviewVisibility(id, body.visible);
  db.insertAudit("review.toggle", "admin", { id, visible: body.visible });
  return jsonOk(c, { id });
});
app.get("/api/admin/tickets", requireAdmin, async (c) => {
  const db = c.get("db");
  const status = c.req.query("status") || null;
  return jsonOk(c, db.getAllTickets(status, 100));
});
app.get("/api/admin/tickets/:id", requireAdmin, async (c) => {
  const db = c.get("db");
  const id = Number(c.req.param("id"));
  const ticket = db.getTicket(id);
  if (!ticket) return jsonErr(c, "Tiket tidak ditemukan", 404);
  return jsonOk(c, { ticket, messages: db.getTicketMessages(id) });
});
app.post("/api/admin/tickets/:id/reply", requireAdmin, async (c) => {
  const db = c.get("db");
  const id = Number(c.req.param("id"));
  const body = await c.req.json();
  const message = String(body?.message || "").trim();
  if (!message) return jsonErr(c, "Pesan tidak boleh kosong");
  const ticket = db.getTicket(id);
  if (!ticket) return jsonErr(c, "Tiket tidak ditemukan", 404);
  db.addTicketMessage(id, "admin", message);
  try {
    await sendMessage(
      ticket.user_id,
      `💬 <b>Balasan Tiket #${id}</b>\n━━━━━━━━━━━━━━━━━━━━\n\n${escapeHtml(message)}`,
    );
  } catch {}
  db.insertAudit("ticket.reply", "admin", { ticketId: id });
  return jsonOk(c, { id });
});
app.post("/api/admin/tickets/:id/close", requireAdmin, async (c) => {
  const db = c.get("db");
  const id = Number(c.req.param("id"));
  db.closeTicket(id);
  const ticket = db.getTicket(id);
  if (ticket) {
    try {
      await sendMessage(
        ticket.user_id,
        `✅ Tiket #${id} telah ditutup. Terima kasih!`,
      );
    } catch {}
  }
  db.insertAudit("ticket.close", "admin", { ticketId: id });
  return jsonOk(c, { id });
});
app.get("/api/admin/wallets", requireAdmin, async (c) => {
  const db = c.get("db");
  return jsonOk(c, db.getAllWallets(500));
});
app.get("/api/admin/users/:userId/detail", requireAdmin, async (c) => {
  const db = c.get("db");
  const userId = c.req.param("userId");
  const detail = db.getUserDetail(userId);
  if (!detail) return jsonErr(c, "User not found", 404);
  return jsonOk(c, detail);
});
app.post("/api/admin/wallets/:userId/adjust", requireAdmin, async (c) => {
  const db = c.get("db");
  const userId = c.req.param("userId");
  const body = await c.req.json();
  const amount = Number(body.amount);
  const description = String(body.description || "").trim();
  if (!Number.isFinite(amount) || amount === 0)
    return jsonErr(c, "Amount harus angka dan tidak boleh 0");
  if (!description) return jsonErr(c, "Deskripsi wajib diisi");
  try {
    const newBalance = db.adjustWalletBalance(userId, amount, description);
    db.insertAudit("wallet.adjust", "admin", {
      userId,
      amount,
      description,
      newBalance,
    });
    return jsonOk(c, { userId, newBalance, amount, description });
  } catch (err) {
    return jsonErr(c, err.message);
  }
});
app.post("/api/admin/users/:userId/block", requireAdmin, async (c) => {
  const db = c.get("db");
  const userId = c.req.param("userId");
  const body = await c.req.json();
  const blocked = Boolean(body.blocked);
  db.toggleUserBlock(userId, blocked);
  db.insertAudit(blocked ? "user.block" : "user.unblock", "admin", { userId });
  return jsonOk(c, { userId, blocked });
});
app.get("/api/admin/maintenance", requireAdmin, async (c) => {
  const db = c.get("db");
  return jsonOk(c, { enabled: db.getSetting("maintenance_mode", "0") === "1" });
});
app.post("/api/admin/maintenance", requireAdmin, async (c) => {
  const db = c.get("db");
  const body = await c.req.json();
  const enabled = Boolean(body.enabled);
  db.setSetting("maintenance_mode", enabled ? "1" : "0");
  db.insertAudit("maintenance.toggle", "admin", { enabled });
  console.log(`[Maintenance] Mode ${enabled ? "ENABLED" : "DISABLED"}`);
  return jsonOk(c, { enabled });
});
app.post("/api/admin/backup", requireAdmin, async (c) => {
  try {
    runAutoBackup();
    c.get("db").insertAudit("backup.manual", "admin");
    return jsonOk(c, { message: "Backup started" });
  } catch (err) {
    return jsonErr(c, err.message);
  }
});
app.get("/api/admin/backups", requireAdmin, async (c) => {
  const backupDir = path.join(DATA_DIR, "backups");
  if (!fs.existsSync(backupDir)) return jsonOk(c, []);
  const files = fs
    .readdirSync(backupDir)
    .filter((f) => f.startsWith("belugawbot_") && f.endsWith(".db"))
    .sort()
    .reverse()
    .map((f) => {
      const stat = fs.statSync(path.join(backupDir, f));
      return { name: f, size: stat.size, date: stat.mtime.toISOString() };
    });
  return jsonOk(c, files);
});
app.get("/api/admin/audit-logs", requireAdmin, async (c) => {
  const db = c.get("db");
  return jsonOk(c, db.getAuditLogs(100));
});

// ============ ROUTES: SHOP ============
app.get("/api/shop/branding", async (c) => {
  const db = c.get("db");
  const brand = getBrandSettings(db);
  return jsonOk(c, {
    name: brand.name,
    shortName: brand.shortName,
    tagline: brand.tagline,
    supportTelegramUrl: brand.supportTelegramUrl,
    supportWhatsappUrl: brand.supportWhatsappUrl,
  });
});
app.get("/api/shop/products", async (c) => {
  const db = c.get("db");
  const category = c.req.query("category");
  const products = category
    ? db.getProductsByCategory(category)
    : db.getProducts();
  const safeProducts = products.map((p) => {
    const {
      digital_file_pointer: _privateFile,
      delivery_payload: _privateDelivery,
      ...safe
    } = p;
    return { ...safe, rating: db.getProductRating(p.id) };
  });
  return jsonOk(c, safeProducts);
});
app.get("/api/shop/categories", async (c) =>
  jsonOk(c, c.get("db").getCategories()),
);
app.get("/api/shop/products/:id/reviews", async (c) => {
  const db = c.get("db");
  const id = Number(c.req.param("id"));
  return jsonOk(c, {
    reviews: db.getProductReviews(id),
    rating: db.getProductRating(id),
  });
});
app.get("/api/shop/download/:token", async (c) => {
  const db = c.get("db");
  const token = String(c.req.param("token") || "").trim();
  if (!token) return jsonErr(c, "Token tidak valid", 400);
  const grant = db.getDownloadToken(token);
  if (!grant) return jsonErr(c, "Link tidak valid", 404);
  if (Date.now() > new Date(grant.expires_at).getTime())
    return jsonErr(c, "Link expired", 410);
  if (Number(grant.download_count) >= Number(grant.max_downloads))
    return jsonErr(c, "Batas download habis", 410);
  let resolved;
  try {
    resolved = resolvePrivateUploadPath(UPLOADS_DIR, grant.object_key, [
      "downloads",
    ]);
  } catch {
    return jsonErr(c, "Lokasi file tidak valid", 403);
  }
  if (!fs.existsSync(resolved.path))
    return jsonErr(c, "File tidak ditemukan", 404);
  db.incrementDownloadCount(token);
  const fileName = basenameFromKey(resolved.key);
  const fileBuffer = fs.readFileSync(resolved.path);
  return new Response(fileBuffer, {
    status: 200,
    headers: {
      "content-type": "application/octet-stream",
      "content-disposition": `attachment; filename="${fileName}"`,
      "cache-control": "private, no-cache, no-store",
    },
  });
});

// ============ SERVE STATIC ADMIN ============
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, "../public");
const adminDir = path.join(PUBLIC_DIR, "admin");
function serveStaticDir(c, dir) {
  let reqPath = c.req.path.split("/").slice(2).join("/") || "index.html";
  if (!reqPath || reqPath.endsWith("/")) reqPath += "index.html";
  const root = path.resolve(dir);
  const filePath = path.resolve(root, reqPath);
  if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`))
    return jsonErr(c, "Forbidden", 403);
  if (!fs.existsSync(filePath)) {
    const indexPath = path.join(root, "index.html");
    if (fs.existsSync(indexPath)) {
      return new Response(fs.readFileSync(indexPath), {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
    return jsonErr(c, "Not found", 404);
  }
  const ext = path.extname(filePath).toLowerCase();
  const mimeMap = {
    ".html": "text/html",
    ".js": "application/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2",
    ".woff": "font/woff",
  };
  const contentType = mimeMap[ext] || "application/octet-stream";
  const cacheControl =
    ext === ".html" ? "no-cache" : "public, max-age=31536000, immutable";
  return new Response(fs.readFileSync(filePath), {
    headers: { "content-type": contentType, "cache-control": cacheControl },
  });
}
if (fs.existsSync(adminDir)) {
  app.get("/admin/*", (c) => serveStaticDir(c, adminDir));
  app.get("/admin", (c) => serveStaticDir(c, adminDir));
}

// ============ ERROR HANDLER ============
app.onError((err, c) => {
  console.error("[API ERROR]", err);
  return jsonErr(c, err.message || "Internal server error", 500);
});

// ============ EXPIRY JOB ============
if (env.NODE_ENV !== "test") {
  setInterval(() => {
    processExpiredOrders().catch((err) =>
      console.error("[Expiry] processExpiredOrders error:", err),
    );
  }, 60_000);
  setTimeout(() => {
    processExpiredOrders().catch((err) =>
      console.error("[Expiry] initial check error:", err),
    );
  }, 5_000);
}

// ============ START SERVER ============
let server = null;
if (env.NODE_ENV !== "test") {
  server = serve({ fetch: app.fetch, port: PORT }, (info) => {
    console.log(
      `[Ciganstore Order Bot] Server running at http://localhost:${info.port}`,
    );
    console.log(`[Ciganstore Order Bot] Data directory: ${DATA_DIR}`);
  });
}

export { app, deliverOrder, processExpiredOrders, server };
