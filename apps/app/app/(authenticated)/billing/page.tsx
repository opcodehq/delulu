import BillingClient from "@/features/billing/billing-client";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8788";
  const instance = await fetch(`${apiUrl}/v1/instance`, {
    cache: "no-store",
  })
    .then((response) => response.json() as Promise<{ deploymentMode?: string }>)
    .catch((): { deploymentMode?: string } => ({}));
  return (
    <BillingClient community={instance.deploymentMode === "self_hosted"} />
  );
}
