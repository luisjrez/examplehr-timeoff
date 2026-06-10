import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

// E2E runs against a real `next dev` server so the mock HCM route handlers are
// exercised end-to-end. Tests are serial: the HCM store is a shared in-memory
// singleton and each spec resets it via POST /api/hcm/reset.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  // HTML report always available (pnpm exec playwright show-report);
  // traces/videos on failure are the forensic evidence regressions attach
  // to the auto-filed GitHub issue.
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `pnpm dev --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
