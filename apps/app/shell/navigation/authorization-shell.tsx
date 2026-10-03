import { Frame } from "@delulu/design-system/components/ui/frame";
import type { ReactNode } from "react";

export function AuthorizationShell({ children }: { children: ReactNode }) {
  return (
    <main
      className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-background p-4"
      data-slot="authorization-shell"
    >
      <Frame
        className="px-6 py-6"
        frameClassName="w-full max-w-md"
        guides="viewport"
      >
        {children}
      </Frame>
    </main>
  );
}
