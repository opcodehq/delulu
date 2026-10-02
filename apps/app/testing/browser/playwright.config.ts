import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.browser.ts",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  outputDir: "../../.cache/browser-results",
  reporter: [
    ["list"],
    ["html", { outputFolder: ".cache/browser-report", open: "never" }],
  ],
  use: {
    baseURL: "http://127.0.0.1:4180",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {},
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile-dark",
      use: {
        ...devices["Pixel 7"],
        colorScheme: "dark",
        reducedMotion: "reduce",
      },
    },
  ],
  webServer: {
    command: "pnpm build:fixtures && pnpm preview:fixtures",
    cwd: process.cwd(),
    url: "http://127.0.0.1:4180",
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
