import type { ReactNode } from "react";

export function AuthorizationShell({ children }: { children: ReactNode }) {
  return (
    <main
      className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-background p-4"
      data-slot="authorization-shell"
    >
      <div className="relative w-full max-w-md">
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-0 h-screen -translate-y-1/2 border-zinc-950/10 border-l-[1.5px] border-dotted dark:border-white/10"
          data-slot="authorization-guide"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 right-0 h-screen -translate-y-1/2 border-zinc-950/10 border-l-[1.5px] border-dotted dark:border-white/10"
          data-slot="authorization-guide"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute top-0 left-1/2 w-screen -translate-x-1/2 border-zinc-950/10 border-t-[1.5px] border-dotted dark:border-white/10"
          data-slot="authorization-guide"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-0 left-1/2 w-screen -translate-x-1/2 border-zinc-950/10 border-t-[1.5px] border-dotted dark:border-white/10"
          data-slot="authorization-guide"
        />
        <div className="relative z-10 rounded-xl border border-border/60 bg-card px-6 py-6 text-card-foreground shadow-(--shadow-card)">
          {children}
        </div>
      </div>
    </main>
  );
}
