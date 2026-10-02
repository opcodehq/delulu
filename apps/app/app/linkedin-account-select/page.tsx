import { Suspense } from "react";
import { LinkedInAccountSelect } from "@/app/linkedin-account-select/linkedin-account-select";

export const dynamic = "force-dynamic";

export default function LinkedInAccountSelectPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center p-6">
          <output>Loading LinkedIn destinations…</output>
        </main>
      }
    >
      <LinkedInAccountSelect />
    </Suspense>
  );
}
