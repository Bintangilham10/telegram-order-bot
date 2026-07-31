import crypto from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(crypto.scrypt);
const SCRYPT_KEY_LENGTH = 64;
const DEFAULT_SCRYPT_PARAMS = Object.freeze({ N: 16384, r: 8, p: 1 });

function toBase64Url(buffer) {
  return Buffer.from(buffer).toString("base64url");
}

function fromBase64Url(base64url) {
  const value = String(base64url || "");
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error("Invalid base64url value");
  }
  return Buffer.from(value, "base64url");
}

function timingSafeBufferEqual(left, right) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function timingSafeStringEqual(left, right) {
  const a = crypto.createHash("sha256").update(String(left)).digest();
  const b = crypto.createHash("sha256").update(String(right)).digest();
  return crypto.timingSafeEqual(a, b);
}

function sign(payload, secret) {
  return toBase64Url(
    crypto.createHmac("sha256", secret).update(payload).digest(),
  );
}

function hmacRaw(keyBytes, messageBytes) {
  return crypto.createHmac("sha256", keyBytes).update(messageBytes).digest();
}

function parseScryptHash(encodedHash) {
  const parts = String(encodedHash || "").split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return null;
  const [N, r, p] = parts.slice(1, 4).map(Number);
  if (
    !Number.isSafeInteger(N) ||
    N < 16384 ||
    N > 262144 ||
    (N & (N - 1)) !== 0 ||
    !Number.isSafeInteger(r) ||
    r < 1 ||
    r > 16 ||
    !Number.isSafeInteger(p) ||
    p < 1 ||
    p > 8
  ) {
    return null;
  }
  try {
    const salt = fromBase64Url(parts[4]);
    const digest = fromBase64Url(parts[5]);
    if (salt.length < 16 || digest.length !== SCRYPT_KEY_LENGTH) return null;
    return { N, r, p, salt, digest };
  } catch {
    return null;
  }
}

export function isValidAdminPasswordHash(encodedHash) {
  return Boolean(parseScryptHash(encodedHash));
}

export async function hashAdminPassword(
  password,
  { salt = crypto.randomBytes(16), ...params } = {},
) {
  const value = String(password || "");
  if (value.length < 12) {
    throw new Error("Password admin minimal 12 karakter.");
  }
  if (value.length > 1024) {
    throw new Error("Password admin maksimum 1024 karakter.");
  }
  const { N, r, p } = { ...DEFAULT_SCRYPT_PARAMS, ...params };
  const digest = await scrypt(value, salt, SCRYPT_KEY_LENGTH, {
    N,
    r,
    p,
    maxmem: 128 * N * r + 32 * 1024 * 1024,
  });
  return `scrypt$${N}$${r}$${p}$${toBase64Url(salt)}$${toBase64Url(digest)}`;
}

export async function verifyAdminPassword(password, encodedHash) {
  const parsed = parseScryptHash(encodedHash);
  if (
    !parsed ||
    typeof password !== "string" ||
    password.length < 1 ||
    password.length > 1024
  ) {
    return false;
  }
  const actual = await scrypt(password, parsed.salt, SCRYPT_KEY_LENGTH, {
    N: parsed.N,
    r: parsed.r,
    p: parsed.p,
    maxmem: 128 * parsed.N * parsed.r + 32 * 1024 * 1024,
  });
  return timingSafeBufferEqual(actual, parsed.digest);
}

export function verifyTelegramInitData(
  initData,
  botToken,
  maxAgeSeconds = 300,
) {
  if (!initData || !botToken) return null;

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash || !/^[a-f0-9]{64}$/i.test(hash)) return null;

  const authDate = Number(params.get("auth_date") || 0);
  if (!authDate) return null;
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - authDate) > maxAgeSeconds) return null;

  const entries = [];
  for (const [k, v] of params.entries()) {
    if (k === "hash") continue;
    entries.push([k, v]);
  }

  entries.sort((a, b) => a[0].localeCompare(b[0]));
  const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join("\n");

  const secretKey = hmacRaw(Buffer.from("WebAppData"), Buffer.from(botToken));
  const computed = hmacRaw(secretKey, Buffer.from(dataCheckString));
  if (!timingSafeBufferEqual(computed, Buffer.from(hash, "hex"))) return null;

  const userRaw = params.get("user");
  if (!userRaw) return null;

  let user;
  try {
    user = JSON.parse(userRaw);
  } catch {
    return null;
  }

  return {
    id: Number(user.id),
    username: user.username || "",
    first_name: user.first_name || "",
    auth_date: authDate,
  };
}

export function createSessionToken(data, secret) {
  if (!secret) throw new Error("Session secret belum dikonfigurasi.");
  const payload = toBase64Url(Buffer.from(JSON.stringify(data)));
  const signature = sign(payload, secret);
  return `${payload}.${signature}`;
}

export function verifySessionToken(token, secret) {
  if (!token || !secret) return null;
  const parts = String(token).split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  try {
    const [payload, signature] = parts;
    const expected = sign(payload, secret);
    if (!timingSafeStringEqual(signature, expected)) return null;
    const parsed = JSON.parse(fromBase64Url(payload).toString("utf8"));
    if (!parsed || typeof parsed !== "object") return null;
    if (!Number.isFinite(parsed.exp) || Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function parseCookie(header = "") {
  const out = {};
  const parts = header.split(";");
  for (const part of parts) {
    const [k, ...rest] = part.trim().split("=");
    if (!k) continue;
    out[k] = rest.join("=");
  }
  return out;
}
