import { telegramCall } from "./index";

const TELEGRAM_FILE_PATH = /^[a-zA-Z0-9_./-]+$/;

export async function downloadTelegramFile(
  token: string,
  fileId: string
): Promise<Uint8Array> {
  const limit = 20 * 1024 * 1024;
  const file = await telegramCall<{ file_path?: string; file_size?: number }>(
    token,
    "getFile",
    { file_id: fileId }
  );
  if (
    !(file.ok && file.result.file_path) ||
    (file.result.file_size ?? 0) > limit
  ) {
    throw new Error("File unavailable or larger than 20 MB");
  }
  const path = file.result.file_path;
  if (
    !TELEGRAM_FILE_PATH.test(path) ||
    path.startsWith("/") ||
    path.split("/").includes("..")
  ) {
    throw new Error("Invalid file path");
  }
  let response: Response;
  try {
    response = await fetch(
      `https://api.telegram.org/file/bot${token}/${path}`,
      { redirect: "error", signal: AbortSignal.timeout(20_000) }
    );
  } catch {
    throw new Error("Telegram file download unavailable");
  }
  if (!(response.ok && response.body)) {
    throw new Error("Telegram file download unavailable");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) {
        break;
      }
      length += chunk.value.byteLength;
      if (length > limit) {
        await reader.cancel();
        throw new Error("File exceeds 20 MB");
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
