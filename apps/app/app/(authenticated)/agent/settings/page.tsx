import { ChatGPTConnection } from "@/features/agent/chatgpt-connection";

export default function AgentSettingsPage() {
  return (
    <main className="mx-auto w-full max-w-2xl space-y-5 p-5">
      <h1 className="font-semibold text-xl">Agent settings</h1>
      <ChatGPTConnection />
    </main>
  );
}
