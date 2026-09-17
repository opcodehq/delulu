import { decodeTelegramMessage } from "./index";

export interface TelegramMedia {
  fileId: string;
  filename: string;
  mimeType: string;
  size: number;
  kind: "voice" | "image" | "document";
}

export function decodeTelegramUpdate(value: unknown): {
  id: string;
  sender: string;
  text: string;
  callback?: { id: string; data: string };
  media?: TelegramMedia;
} | null {
  const message = decodeTelegramMessage(value);
  if (message) {
    return message;
  }
  if (!value || typeof value !== "object") {
    return null;
  }
  const update = value as {
    update_id?: number;
    message?: {
      caption?: string;
      from?: { id?: number; is_bot?: boolean };
      chat?: { id?: number; type?: string };
      voice?: { file_id: string; file_size?: number; mime_type?: string };
      photo?: Array<{ file_id: string; file_size?: number }>;
      document?: {
        file_id: string;
        file_size?: number;
        mime_type?: string;
        file_name?: string;
      };
    };
    callback_query?: {
      id?: string;
      data?: string;
      from?: { id?: number; is_bot?: boolean };
      message?: { chat?: { id?: number; type?: string } };
    };
  };
  const source = update.message;
  if (
    Number.isSafeInteger(update.update_id) &&
    source?.from?.is_bot === false &&
    Number.isSafeInteger(source.from.id) &&
    Number(source.from.id) > 0 &&
    source.chat?.type === "private" &&
    source.chat.id === source.from.id
  ) {
    const media = source.voice ?? source.photo?.at(-1) ?? source.document;
    if (
      media &&
      typeof media.file_id === "string" &&
      media.file_id.length <= 512
    ) {
      const kind = source.voice ? "voice" : source.photo ? "image" : "document";
      return {
        id: String(update.update_id),
        sender: String(source.from.id),
        text:
          typeof source.caption === "string"
            ? source.caption.slice(0, 4096)
            : "",
        media: {
          fileId: media.file_id,
          size: Number(media.file_size ?? 0),
          kind,
          filename:
            kind === "voice"
              ? "voice.ogg"
              : kind === "image"
                ? "image.jpg"
                : String(source.document?.file_name ?? "document")
                    .replace(/[^a-zA-Z0-9._-]/g, "_")
                    .slice(0, 100),
          mimeType:
            kind === "voice"
              ? String(source.voice?.mime_type ?? "audio/ogg")
              : kind === "image"
                ? "image/jpeg"
                : String(
                    source.document?.mime_type ?? "application/octet-stream"
                  ),
        },
      };
    }
  }
  const callback = update.callback_query;
  if (
    !(Number.isSafeInteger(update.update_id) && callback) ||
    typeof callback.id !== "string" ||
    callback.id.length > 256 ||
    typeof callback.data !== "string" ||
    callback.data.length > 64 ||
    !Number.isSafeInteger(callback.from?.id) ||
    Number(callback.from?.id) <= 0 ||
    callback.from?.is_bot !== false ||
    callback.message?.chat?.type !== "private" ||
    callback.message.chat.id !== callback.from.id
  ) {
    return null;
  }
  return {
    id: String(update.update_id),
    sender: String(callback.from.id),
    text: "",
    callback: { id: callback.id, data: callback.data },
  };
}

/** Plain text splitting without cutting surrogate pairs. */
export function splitTelegramText(text: string): string[] {
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 4000) {
    let end = remaining.lastIndexOf("\n", 4000);
    if (end < 2000) {
      end = 4000;
    }
    const unit = remaining.charCodeAt(end - 1);
    if (unit >= 0xd8_00 && unit <= 0xdb_ff) {
      end--;
    }
    chunks.push(remaining.slice(0, end));
    remaining = remaining.slice(end);
  }
  if (remaining) {
    chunks.push(remaining);
  }
  return chunks;
}
