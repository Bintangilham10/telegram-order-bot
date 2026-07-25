import crypto from 'node:crypto';
import path from 'node:path';

export const MAX_PAYMENT_IMAGE_BYTES = 2 * 1024 * 1024;

const IMAGE_TYPES = {
  jpeg: { extension: '.jpg', mime: 'image/jpeg' },
  png: { extension: '.png', mime: 'image/png' },
  webp: { extension: '.webp', mime: 'image/webp' },
};

function detectImageType(buffer) {
  if (
    buffer.length >= 3
    && buffer[0] === 0xff
    && buffer[1] === 0xd8
    && buffer[2] === 0xff
  ) return IMAGE_TYPES.jpeg;

  if (
    buffer.length >= 8
    && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) return IMAGE_TYPES.png;

  if (
    buffer.length >= 12
    && buffer.subarray(0, 4).toString('ascii') === 'RIFF'
    && buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) return IMAGE_TYPES.webp;

  return null;
}

export function validatePaymentImage(input, maxBytes = MAX_PAYMENT_IMAGE_BYTES) {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input || []);
  if (!buffer.length) throw new Error('File gambar kosong.');
  if (buffer.length > maxBytes) throw new Error('Ukuran gambar maksimum 2 MB.');

  const type = detectImageType(buffer);
  if (!type) throw new Error('Format gambar harus JPG, PNG, atau WebP.');
  return { ...type, size: buffer.length };
}

export function createRandomImageName(extension) {
  const safeExtension = ['.jpg', '.png', '.webp'].includes(extension) ? extension : '.bin';
  return `${crypto.randomUUID()}${safeExtension}`;
}

export function normalizePrivateUploadKey(value) {
  let key = String(value || '').trim().replaceAll('\\', '/');
  key = key.replace(/^\/+/, '');
  if (key.toLowerCase().startsWith('uploads/')) key = key.slice('uploads/'.length);
  if (!key || key.includes('\0')) throw new Error('Lokasi file tidak valid.');

  const normalized = path.posix.normalize(key);
  if (normalized === '..' || normalized.startsWith('../') || path.posix.isAbsolute(normalized)) {
    throw new Error('Lokasi file tidak valid.');
  }
  return normalized;
}

export function resolvePrivateUploadPath(uploadsDir, storedKey, allowedPrefixes = []) {
  const normalizedKey = normalizePrivateUploadKey(storedKey);
  if (
    allowedPrefixes.length
    && !allowedPrefixes.some((prefix) => {
      const normalizedPrefix = normalizePrivateUploadKey(prefix).replace(/\/+$/, '');
      return normalizedKey === normalizedPrefix || normalizedKey.startsWith(`${normalizedPrefix}/`);
    })
  ) {
    throw new Error('Lokasi file tidak diizinkan.');
  }

  const root = path.resolve(uploadsDir);
  const resolved = path.resolve(root, ...normalizedKey.split('/'));
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error('Lokasi file tidak valid.');
  }
  return { key: normalizedKey, path: resolved };
}
