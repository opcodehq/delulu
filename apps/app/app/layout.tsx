import { AnalyticsProvider } from "@delulu/analytics";
import { AuthProvider } from "@delulu/auth/provider";
import { UserJot } from "@/features/analytics/userjot";
import "@/app/styles.css";
import { DesignSystemProvider } from "@delulu/design-system";
import { fonts } from "@delulu/design-system/lib/fonts";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import type { ReactNode } from "react";

interface RootLayoutProperties {
  readonly children: ReactNode;
}

const RootLayout = ({ children }: RootLayoutProperties) => (
  <html className={fonts} lang="en" suppressHydrationWarning>
    <head>
      {process.env.NEXT_PUBLIC_AFFONSO_PROGRAM_ID && (
        <script
          async
          data-affonso={process.env.NEXT_PUBLIC_AFFONSO_PROGRAM_ID}
          data-cookie_duration="90"
          defer
          src="https://affonso.io/js/pixel.min.js"
        />
      )}
    </head>
    <body data-density="compact" data-texture="dither">
      <DesignSystemProvider>
        <AuthProvider
          privacyUrl="https://delulu.social/legal/privacy-policy"
          termsUrl="https://delulu.social/legal/terms-of-service"
        >
          <AnalyticsProvider platform="app">
            <NuqsAdapter>{children}</NuqsAdapter>
          </AnalyticsProvider>
        </AuthProvider>
      </DesignSystemProvider>
      <UserJot />
    </body>
  </html>
);

export default RootLayout;
