import { ChannelConversation } from "./channel-conversation";

// Preserve the deployed Durable Object class name and storage namespace.
export class WhatsAppConversation extends ChannelConversation {}
export type {
  ChannelMessage,
  ConversationBinding,
} from "./channel-conversation";
export { WhatsAppResponseTarget } from "./channel-conversation";
