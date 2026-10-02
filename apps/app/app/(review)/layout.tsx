import { secure } from "@delulu/security";
import { env } from "env";
import type { ReactNode } from "react";
import { StoreProvider } from "@/features/publishing/store-provider";
import { BackendProviders } from "@/shell/providers/backend";

interface ReviewLayoutProps {
  readonly children: ReactNode;
}

export const dynamic = "force-dynamic";

const ReviewLayout = async ({ children }: ReviewLayoutProps) => {
  if (env.ARCJET_KEY) {
    await secure(["CATEGORY:PREVIEW"]);
  }

  return (
    <BackendProviders>
      <StoreProvider>{children}</StoreProvider>
    </BackendProviders>
  );
};

export default ReviewLayout;
