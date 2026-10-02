import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: { environment: "jsdom" },
  resolve: {
    alias: [
      {
        find: "@delulu/core/publishing",
        replacement: path.resolve("../../packages/core/src/publishing"),
      },
      {
        find: "@delulu/client",
        replacement: fileURLToPath(
          new URL("../../packages/client/src/index.ts", import.meta.url)
        ),
      },
      {
        find: "@delulu/core/domain",
        replacement: path.resolve("../../packages/core/src/domain"),
      },
      {
        find: "@delulu/core/kernel",
        replacement: path.resolve("../../packages/core/src/kernel"),
      },
      {
        find: /^@delulu\/core$/,
        replacement: path.resolve("../../packages/core/src/index.ts"),
      },
      {
        find: /^@delulu\/contracts$/,
        replacement: path.resolve("../../packages/contracts/src/index.ts"),
      },
      {
        find: /^@delulu\/(?!icons(?:\/|$))/,
        replacement: `${path.resolve("../../packages")}/`,
      },
      { find: "@", replacement: path.resolve(".") },
    ],
  },
});
