import { Suspense } from "react";
import { LinkedInAccountSelect } from "@/app/linkedin-account-select/linkedin-account-select";

import { AuthorizationShell } from "@/shell/navigation/authorization-shell";

export const dynamic = "force-dynamic";

export default function LinkedInAccountSelectPage() {
  return (
    <Suspense
      fallback={
        <AuthorizationShell>
          <output>Loading LinkedIn destinations…</output>
        </AuthorizationShell>
      }
    >
      <LinkedInAccountSelect />
    </Suspense>
  );
}
