// Telegram Bot API service
export class TelegramApiError extends Error { constructor({ method, errorCode, description, retryAfter }) { super(`[Telegram] ${method} failed: ${description || 'unknown error'}`); this.name = 'TelegramApiError'; this.method = method; this.errorCode = errorCode || 0; this.description = description || ''; this.retryAfter = Number(retryAfter) || 0; } }
const BOT_TOKEN = () => process.env.BOT_TOKEN;
export async function telegramApi(method, payload, isForm = false) { const endpoint = `https://api.telegram.org/bot${BOT_TOKEN()}/${method}`; const init = isForm ? { method: 'POST', body: payload } : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }; const res = await fetch(endpoint, init); const data = await res.json().catch(() => ({})); if (!data?.ok) { throw new TelegramApiError({ method, errorCode: data?.error_code, description: data?.description, retryAfter: data?.parameters?.retry_after }); } return data.result; }
export async function sendMessage(chatId, text, options = {}) { return telegramApi('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', ...options }); }
export async function sendPhoto(chatId, photoBuffer, caption, options = {}) { const formData = new FormData(); formData.append('chat_id', String(chatId)); formData.append('photo', new Blob([photoBuffer], { type: options.mime || 'image/png' }), options.filename || 'image.png'); formData.append('caption', caption || ''); formData.append('parse_mode', 'HTML'); if (options.reply_markup) { formData.append('reply_markup', JSON.stringify(options.reply_markup)); } return telegramApi('sendPhoto', formData, true); }
export async function answerCallback(callbackQueryId) { return telegramApi('answerCallbackQuery', { callback_query_id: callbackQueryId }); }
export async function setWebhook(url, secretToken) { return telegramApi('setWebhook', { url, secret_token: secretToken, allowed_updates: ['message', 'callback_query'], drop_pending_updates: false }); }
export async function downloadTelegramFile(fileId) {
  const info = await telegramApi('getFile', { file_id: fileId });
  if (!info?.file_path) throw new Error('Telegram tidak memberikan lokasi file.');
  const response = await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN()}/${info.file_path}`);
  if (!response.ok) throw new Error(`Gagal mengunduh file Telegram (${response.status}).`);
  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    filePath: info.file_path,
  };
}
