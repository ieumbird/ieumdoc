import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { prepareBrowserFixtures, REPOSITORY_ROOT } from "./fixtures.ts";
import { HTTP_SCENARIOS, MANUAL_SCENARIO_FILES, selectBrowserScenarios, STABLE_SCENARIOS } from "./scenarios.ts";

try {
  const { scenarios, screenshots, shard } = selectBrowserScenarios(process.argv.slice(2));
  if (scenarios.some(name => HTTP_SCENARIOS.includes(name))) {
    if (!process.env.IEUMDOC_BROWSER_URL && !existsSync(path.join(REPOSITORY_ROOT, "packages/cli/dist/cli.mjs"))) {
      throw new Error("Build the production HTTP Host first: pnpm --filter @ieumdoc/cli build");
    }
    process.env.IEUMDOC_BROWSER_HOST = "http";
    prepareBrowserFixtures();
  }
  const unknown = scenarios.filter(name => !existsSync(path.join(REPOSITORY_ROOT, "apps/editor/test", MANUAL_SCENARIO_FILES[name] ?? `${name}.browser.js`)));
  if (unknown.length) throw new Error(`Unknown scenario: ${unknown.join(", ")}\nStable: ${STABLE_SCENARIOS.join(", ")}`);
  if (shard) console.log(`Browser shard ${shard}: ${scenarios.length} scenarios\n${scenarios.join(", ")}`);
  const require = createRequire(import.meta.url);
  const cli = require.resolve("@playwright/test/cli");
  process.env.IEUMDOC_BROWSER_SCENARIOS = JSON.stringify(scenarios);
  process.env.IEUMDOC_BROWSER_SCREENSHOTS = String(screenshots);
  process.argv = [process.execPath, cli, "test", "--config", path.join(REPOSITORY_ROOT, "apps/editor/test/browser/playwright.config.ts")];
  process.once("exit", code => {
    const log = process.env.IEUMDOC_BROWSER_SERVER_LOG;
    if (code && log && existsSync(log)) console.error(readFileSync(log, "utf8"));
  });
  // The exported CLI bin owns asynchronous completion, process signals and teardown.
  await import(pathToFileURL(cli).href);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
}
