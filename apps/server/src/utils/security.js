import crypto from 'node:crypto';

function toBase64Url(buffer) {
  return Buffer.from(buffer)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromBase64Url(base64url) {
  const normalized = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, 'base64').toString('utf8');
}

function sign(payload, secret) {
  return toBase64Url(
    crypto.createHmac('sha256', secret).update(payload).digest()
  );
}

function hmacRaw(keyBytes, messageBytes) {
  return crypto.createHmac('sha256', keyBytes).update(messageBytes).digest();
}

export function verifyTelegramInitData(initData, botToken, maxAgeSeconds = 300) {
  if (!initData || !botToken) return null;

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;

  const authDate = Number(params.get('auth_date') || 0);
  if (!authDate) return null;
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - authDate) > maxAgeSeconds) return null;

  const entries = [];
  for (const [k, v] of params.entries()) {
    if (k === 'hash') continue;
    entries.push([k, v]);
  }

  entries.sort((a, b) => a[0].localeCompare(b[0]));
  const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join('\n');

  const secretKey = hmacRaw(Buffer.from('WebAppData'), Buffer.from(botToken));
  const computed = hmacRaw(secretKey, Buffer.from(dataCheckString));
  const computedHex = computed.toString('hex');
  if (computedHex !== hash) return null;

  const userRaw = params.get('user');
  if (!userRaw) return null;

  let user;
  try {
    user = JSON.parse(userRaw);
  } catch {
    return null;
  }

  return {
    id: Number(user.id),
    username: user.username || '',
    first_name: user.first_name || '',
    auth_date: authDate,
  };
}

export function createSessionToken(data, secret) {
  const payload = toBase64Url(Buffer.from(JSON.stringify(data)));
  const signature = sign(payload, secret);
  return `${payload}.${signature}`;
}

export function verifySessionToken(token, secret) {
  if (!token || !token.includes('.')) return null;
  const [payload, signature] = token.split('.');
  const expected = sign(payload, secret);
  if (signature !== expected) return null;

  const parsed = JSON.parse(fromBase64Url(payload));
  if (!parsed.exp || Date.now() > parsed.exp) return null;
  return parsed;
}

export function parseCookie(header = '') {
  const out = {};
  const parts = header.split(';');
  for (const part of parts) {
    const [k, ...rest] = part.trim().split('=');
    if (!k) continue;
    out[k] = rest.join('=');
  }
  return out;
}
