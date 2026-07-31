import assert from "node:assert/strict";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

const testDataDir = fs.mkdtempSync(
  path.join(os.tmpdir(), "ciganstore-security-"),
);
process.env.NODE_ENV = "test";
process.env.DATA_DIR = testDataDir;
process.env.API_BASE_URL = "http://api.test";
process.env.ADMIN_APP_ORIGIN = "http://admin.test";
process.env.ADMIN_SESSION_SECRET =
  "test-session-secret-that-is-long-enough-for-tests";
process.env.MAX_DIGITAL_FILE_BYTES = "1024";

const {
  createSessionToken,
  hashAdminPassword,
  isValidAdminPasswordHash,
  verifyAdminPassword,
  verifySessionToken,
  verifyTelegramInitData,
} = await import("../src/utils/security.js");

const adminPassword = "Correct Horse Battery Staple";
process.env.ADMIN_PANEL_PASSWORD_HASH = await hashAdminPassword(adminPassword, {
  salt: Buffer.alloc(16, 7),
});

const { app } = await import("../src/index.js");
const { createDb } = await import("../src/db.js");

async function login() {
  const response = await app.request("/api/admin/login", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: process.env.ADMIN_APP_ORIGIN,
    },
    body: JSON.stringify({ password: adminPassword }),
  });
  assert.equal(response.status, 200);
  const cookie = response.headers.get("set-cookie");
  assert.match(cookie, /tb_session=/);
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Strict/i);
  return cookie.split(";")[0];
}

test("hash scrypt memverifikasi password tanpa menyimpan plaintext", async () => {
  const hash = process.env.ADMIN_PANEL_PASSWORD_HASH;
  assert.equal(isValidAdminPasswordHash(hash), true);
  assert.equal(hash.includes(adminPassword), false);
  assert.equal(await verifyAdminPassword(adminPassword, hash), true);
  assert.equal(await verifyAdminPassword("password yang salah", hash), false);
  await assert.rejects(() => hashAdminPassword("pendek"), /minimal 12/);
});

test("token sesi menolak signature rusak, payload malformed, dan expiry", () => {
  const secret = process.env.ADMIN_SESSION_SECRET;
  const valid = createSessionToken(
    { role: "admin", sub: "admin", exp: Date.now() + 60_000 },
    secret,
  );
  assert.equal(verifySessionToken(valid, secret)?.role, "admin");
  assert.equal(verifySessionToken(`${valid}x`, secret), null);
  assert.equal(verifySessionToken("bukan-token", secret), null);
  assert.equal(
    verifySessionToken(
      createSessionToken(
        { role: "admin", sub: "admin", exp: Date.now() - 1 },
        secret,
      ),
      secret,
    ),
    null,
  );
});

test("validasi Telegram init data menerima signature sah dan menolak perubahan", () => {
  const botToken = "123456:test-bot-token";
  const authDate = Math.floor(Date.now() / 1000);
  const user = JSON.stringify({ id: 42, username: "buyer" });
  const values = { auth_date: String(authDate), query_id: "AAEAA", user };
  const dataCheckString = Object.entries(values)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();
  const hash = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");
  const params = new URLSearchParams({ ...values, hash }).toString();

  assert.equal(verifyTelegramInitData(params, botToken)?.id, 42);
  assert.equal(
    verifyTelegramInitData(params.replace("buyer", "attacker"), botToken),
    null,
  );
});

test("admin login menolak origin asing dan password salah", async () => {
  const rejectedOrigin = await app.request("/api/admin/login", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://evil.test",
    },
    body: JSON.stringify({ password: adminPassword }),
  });
  assert.equal(rejectedOrigin.status, 403);

  const rejectedPassword = await app.request("/api/admin/login", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: process.env.ADMIN_APP_ORIGIN,
    },
    body: JSON.stringify({ password: "password yang salah" }),
  });
  assert.equal(rejectedPassword.status, 401);
});

test("login aman memberi akses bootstrap dan security headers", async () => {
  const cookie = await login();
  const response = await app.request("/api/admin/bootstrap", {
    headers: { cookie },
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.match(
    response.headers.get("content-security-policy"),
    /default-src 'self'/,
  );
  assert.match(
    response.headers.get("content-security-policy"),
    /connect-src 'self' http:\/\/api\.test/,
  );
});

test("upload file digital dibatasi sebelum penyimpanan", async () => {
  const cookie = await login();
  const form = new FormData();
  form.append(
    "file",
    new Blob([Buffer.alloc(1025)], { type: "application/octet-stream" }),
    "oversized.bin",
  );
  const response = await app.request("/api/admin/uploads/digital-file", {
    method: "POST",
    headers: { cookie, origin: process.env.ADMIN_APP_ORIGIN },
    body: form,
  });
  assert.equal(response.status, 413);
  const files = fs.readdirSync(path.join(testDataDir, "uploads", "downloads"));
  assert.equal(files.length, 0);
});

test("klaim token download tidak dapat melampaui kuota", async () => {
  const db = createDb();
  const token = crypto.randomUUID();
  db.createDownloadToken({
    token,
    orderId: 9001,
    userId: 42,
    objectKey: "downloads/test.bin",
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    maxDownloads: 3,
  });

  const claims = await Promise.all(
    Array.from({ length: 20 }, async () => db.claimDownloadToken(token)),
  );
  assert.equal(claims.filter(Boolean).length, 3);
  assert.equal(db.getDownloadToken(token).download_count, 3);
  assert.equal(db.claimDownloadToken(token), null);
});

test("startup production gagal pada konfigurasi keamanan lemah", () => {
  const result = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", 'await import("./src/index.js")'],
    {
      cwd: path.resolve(import.meta.dirname, ".."),
      env: {
        ...process.env,
        NODE_ENV: "production",
        DATA_DIR: path.join(testDataDir, "invalid-production"),
        ADMIN_PANEL_PASSWORD_HASH: "plaintext-tidak-valid",
        ADMIN_SESSION_SECRET: "pendek",
        TELEGRAM_WEBHOOK_SECRET: "placeholder",
        API_BASE_URL: "http://api.test",
        ADMIN_APP_ORIGIN: "http://admin.test",
        ADMIN_COOKIE_SAME_SITE: "Unsafe",
      },
      encoding: "utf8",
    },
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Konfigurasi keamanan production tidak valid/);
  assert.match(result.stderr, /ADMIN_PANEL_PASSWORD_HASH/);
  assert.match(result.stderr, /ADMIN_SESSION_SECRET/);
  assert.match(result.stderr, /TELEGRAM_WEBHOOK_SECRET/);
  assert.match(result.stderr, /URL HTTPS/);
  assert.match(result.stderr, /ADMIN_COOKIE_SAME_SITE/);
});
