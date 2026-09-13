export const conversationName = (phoneId: string, sender: string) =>
  `whatsapp:${phoneId}:${sender}`;
/** Fail closed: a missing or malformed allowlist never opens the pilot. */
const TELEGRAM_USER_ID = /^[1-9]\d{0,15}$/;
export const isAllowedTelegramSender = (sender: string, allowed?: string) =>
  TELEGRAM_USER_ID.test(sender) && sender === allowed;
