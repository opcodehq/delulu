import { AnalyticsProvider } from "@delulu/analytics";
import { AuthProvider } from "@delulu/auth/provider";
import "./styles.css";
import { DesignSystemProvider } from "@delulu/design-system";
import { fonts } from "@delulu/design-system/lib/fonts";
import { cn } from "@delulu/design-system/lib/utils";
import {
  createAISoftwareApplicationSchema,
  createOrganizationSchema,
  createWebSiteSchema,
  JsonLd,
} from "@delulu/seo/json-ld";
import { createMetadata } from "@delulu/seo/metadata";
import { getWebOrigin } from "@delulu/seo/url";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AffonsoCrossDomain } from "@/components/affonso-cross-domain";
import { CaptureAttribution } from "@/components/analytics/capture-attribution";
import { Footer } from "@/components/layout/footer";
import { Navbar } from "@/components/layout/navbar";

interface RootLayoutProperties {
  readonly children: ReactNode;
}

export const metadata: Metadata = createMetadata({
  title: "Delulu Social",
  description:
    "Social media management platform for creating and publishing content across multiple social networks",
  image: "/images/logo.webp",
  alternates: {
    canonical: getWebOrigin(),
  },
});

const RootLayout = ({ children }: RootLayoutProperties) => {
  const baseUrl = getWebOrigin();

  return (
    <html
      className={cn(fonts, "scroll-smooth")}
      lang="en"
      suppressHydrationWarning
    >
      <head>
        <JsonLd code={createOrganizationSchema(baseUrl)} />
        <JsonLd code={createWebSiteSchema(baseUrl)} />
        <JsonLd code={createAISoftwareApplicationSchema(baseUrl)} />
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
      <body>
        <DesignSystemProvider>
          <AuthProvider>
            <AnalyticsProvider platform="web">
              <Navbar />
              {children}
              <Footer />
            </AnalyticsProvider>
          </AuthProvider>
        </DesignSystemProvider>
        <AffonsoCrossDomain />
        <CaptureAttribution />
        {/* <Toolbar /> */}
      </body>
    </html>
  );
};

export default RootLayout;
