import { defineConfig } from "@playwright/test";
import path from "node:path";
import { REPOSITORY_ROOT } from "./fixtures.ts";

const url = process.env.IEUMDOC_BROWSER_URL ?? "http://127.0.0.1:5173";

export default defineConfig({
  testDir: import.meta.dirname,
  testMatch: "scenarios.spec.ts",
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 10 * 60_000,
  reporter: "list",
  outputDir: path.join(REPOSITORY_ROOT, "tmp/browser-results"),
  // An explicitly supplied URL belongs to its caller. The default local server can be owned by Playwright.
  webServer: process.env.IEUMDOC_BROWSER_URL ? undefined : {
    command: process.platform !== "win32" && process.env.IEUMDOC_BROWSER_SERVER_LOG ? 'pnpm editor > "$IEUMDOC_BROWSER_SERVER_LOG" 2>&1' : "pnpm editor",
    cwd: REPOSITORY_ROOT,
    url: `${url}/api/document`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    gracefulShutdown: { signal: "SIGTERM", timeout: 10_000 },
    stdout: "pipe",
    stderr: "pipe",
  },
});
