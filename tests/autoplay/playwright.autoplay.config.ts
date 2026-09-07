import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";

/** The repository root, so the preview server starts against the built dist. */
const root = resolve(import.meta.dirname, "../..");
const port = 5196;
const baseURL = `http://127.0.0.1:${port}/tyche/`;

export default defineConfig({
  testDir: import.meta.dirname,
  fullyParallel: true,
  workers: process.env.CI ? 2 : 3,
  retries: 0,
  // A full fourteen-day rotation plus the tribunal needs its own budget.
  timeout: 35 * 60_000,
  expect: { timeout: 20_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: resolve(root, "playwright-report/autoplay") }]],
  outputDir: resolve(root, "test-results/autoplay"),
  use: { baseURL, trace: "off", screenshot: "off", video: "off" },
  projects: [
    {
      name: "autoplay-desktop",
      use: { browserName: "chromium", viewport: { width: 1440, height: 900 } },
    },
    {
      name: "autoplay-portrait",
      use: {
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: false,
      },
    },
    {
      name: "autoplay-landscape",
      use: {
        browserName: "chromium",
        viewport: { width: 844, height: 390 },
        hasTouch: true,
        isMobile: false,
      },
    },
  ],
  webServer: {
    command: `npm run preview -- --port ${port} --strictPort`,
    cwd: root,
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
