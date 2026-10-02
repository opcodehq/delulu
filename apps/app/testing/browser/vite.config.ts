import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = path.resolve(here, "../..");
export default defineConfig({
  root: here,
  cacheDir: path.resolve(here, "node_modules/.vite"),
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 4173,
    fs: { allow: [path.resolve(app, "../..")] },
  },
  build: {
    outDir: path.resolve(app, ".cache/browser-build"),
    emptyOutDir: true,
  },
  define: {
    "process.env": JSON.stringify({
      NODE_ENV: "development",
      NEXT_PUBLIC_API_URL: "http://fixture.local",
      NEXT_PUBLIC_ADMIN_EMAILS: "test@example.com",
    }),
  },
  resolve: {
    alias: [
      {
        find: /^@delulu\/auth(?:\/.*)?$/,
        replacement: path.join(here, "auth.tsx"),
      },
      {
        find: /^@delulu\/analytics(?:\/posthog\/client)?$/,
        replacement: path.join(here, "integrations.tsx"),
      },
      {
        find: "@logtail/next",
        replacement: path.join(here, "integrations.tsx"),
      },
      {
        find: "@sentry/nextjs",
        replacement: path.join(here, "integrations.tsx"),
      },
      {
        find: "@/app/onboarding/_actions",
        replacement: path.join(here, "integrations.tsx"),
      },
      {
        find: "@/features/onboarding/feature-tour",
        replacement: path.join(here, "integrations.tsx"),
      },
      {
        find: "@/shell/navigation/posthog-identifier",
        replacement: path.join(here, "integrations.tsx"),
      },
      {
        find: "@/shell/navigation/userjot-identifier",
        replacement: path.join(here, "integrations.tsx"),
      },
      {
        find: "next/navigation",
        replacement: path.join(here, "navigation.tsx"),
      },
      { find: "next/link", replacement: path.join(here, "navigation.tsx") },
      { find: "next/image", replacement: path.join(here, "image.tsx") },
      {
        find: "@delulu/client",
        replacement: path.resolve(app, "../../packages/client/src/index.ts"),
      },
      {
        find: /^@delulu\/(?!icons(?:\/|$)|core(?:\/|$)|contracts(?:\/|$))/,
        replacement: `${path.resolve(app, "../../packages")}/`,
      },
      { find: "@", replacement: app },
    ],
    dedupe: ["react", "react-dom"],
  },
});
