import { notFound } from "next/navigation";

// Content HQ is not publicly available while its runtime is being provisioned.
export default function AgentPage() {
  notFound();
}
