import readline from "node:readline";
import { hashAdminPassword } from "../utils/security.js";

function readHidden(prompt) {
  if (!process.stdin.isTTY) {
    return new Promise((resolve, reject) => {
      let input = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (chunk) => {
        input += chunk;
      });
      process.stdin.on("end", () => resolve(input.trimEnd()));
      process.stdin.on("error", reject);
    });
  }

  return new Promise((resolve, reject) => {
    const characters = [];
    const wasRaw = process.stdin.isRaw;
    readline.emitKeypressEvents(process.stdin);
    process.stdout.write(prompt);
    process.stdin.setRawMode(true);
    process.stdin.resume();

    const cleanup = () => {
      process.stdin.off("keypress", onKeypress);
      process.stdin.setRawMode(Boolean(wasRaw));
      process.stdin.pause();
      process.stdout.write("\n");
    };
    const onKeypress = (text, key = {}) => {
      if (key.ctrl && key.name === "c") {
        cleanup();
        reject(new Error("Dibatalkan."));
        return;
      }
      if (key.name === "return" || key.name === "enter") {
        cleanup();
        resolve(characters.join(""));
        return;
      }
      if (key.name === "backspace") {
        if (characters.pop() !== undefined) process.stdout.write("\b \b");
        return;
      }
      if (!key.ctrl && !key.meta && text && !/[\r\n]/.test(text)) {
        characters.push(text);
        process.stdout.write("*");
      }
    };
    process.stdin.on("keypress", onKeypress);
  });
}

try {
  const password = await readHidden("Password admin (minimum 12 karakter): ");
  if (process.stdin.isTTY) {
    const confirmation = await readHidden("Ulangi password admin: ");
    if (password !== confirmation)
      throw new Error("Konfirmasi password berbeda.");
  }
  const hash = await hashAdminPassword(password);
  console.log("\nSalin seluruh baris berikut ke file .env:\n");
  console.log(`ADMIN_PANEL_PASSWORD_HASH='${hash}'`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
