import { FlowBuilder } from "@/features/automations/flow-builder/flow-builder";

export default async function EditAutomationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <FlowBuilder automationId={id} />;
}
