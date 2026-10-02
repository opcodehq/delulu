import { Button } from "@delulu/design-system/components/ui/button";
import Link from "next/link";
import { AuthorizationShell } from "@/shell/navigation/authorization-shell";

export default function ExtensionAuthSuccessPage() {
  return (
    <AuthorizationShell>
      <div className="space-y-4 text-center">
        <div className="text-3xl">🎉</div>
        <h1 className="font-semibold text-lg tracking-tight">
          You're signed in!
        </h1>
        <p className="text-muted-foreground text-sm">
          You have been signed into the Sorted extension. You can safely close
          this tab and return to the extension popup.
        </p>
        <div className="flex flex-col items-center gap-3">
          <Button asChild>
            <Link href="/">Go to Delulu Social</Link>
          </Button>
        </div>
      </div>
    </AuthorizationShell>
  );
}
