/**
 * Runs Editor browser regressions against a running dev server (`pnpm editor`), each on
 * freshly prepared scratch fixtures, through one @playwright/cli browser session.
 *
 *   pnpm browser:test                      all stable scenarios
 *   pnpm browser:test source-view ...      only the named scenarios (any *.browser.js)
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { prepareBrowserFixtures, REPOSITORY_ROOT, SOURCE_DIRS } from "./fixtures.ts";

const URL = "http://127.0.0.1:5173";
const SESSION = "ieumdoc-browser-regression";

/** Scenarios in apps/editor/test/*.browser.js that pass reliably: currently all of them. */
export const STABLE_SCENARIOS = [
  "editor-shell",
  "layout-rules",
  "new-document",
  "open-files",
  "save-during-edit",
  "equation-insertion",
  "equation-save-during-edit",
  "reference-save-reload",
  "figure-authoring",
  "figure-draft-race",
  "table-cell-editing",
  "link-authoring",
  "inline-math-authoring",
  "inline-math-split",
  "admonition-authoring",
  "source-view",
  "source-view-pending",
  "label-authoring",
  "cross-reference",
];

const require = createRequire(import.meta.url);
const cliPackage = require.resolve("@playwright/cli/package.json");
const cli = path.join(path.dirname(cliPackage), JSON.parse(readFileSync(cliPackage, "utf8")).bin["playwright-cli"]);

function playwright(args: string[], capture: boolean) {
  // `open` leaves a browser daemon running; keep its output detached so this call returns.
  return spawnSync(process.execPath, [cli, `-s=${SESSION}`, ...args], {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "pipe"] : "ignore",
    timeout: 10 * 60_000,
  });
}

/** A digest of every committed source file the scratch fixtures are made from. */
function sourceDigest(): string {
  const hash = createHash("sha256");
  for (const dir of SOURCE_DIRS) {
    for (const name of readdirSync(dir, { recursive: true, encoding: "utf8" }).sort()) {
      const file = path.join(dir, name);
      if (statSync(file).isFile()) hash.update(name).update(readFileSync(file));
    }
  }
  return hash.digest("hex");
}

async function main(requested: string[]): Promise<number> {
  const unknown = requested.filter((name) => !existsSync(path.join(REPOSITORY_ROOT, "apps", "editor", "test", `${name}.browser.js`)));
  if (unknown.length > 0) {
    console.error(`Unknown scenario: ${unknown.join(", ")}\nStable: ${STABLE_SCENARIOS.join(", ")}`);
    return 2;
  }
  try {
    await fetch(`${URL}/api/document`);
  } catch {
    console.error(`The Editor dev server is not reachable at ${URL}. Start it first with: pnpm editor`);
    return 2;
  }
  const scenarios = requested.length > 0 ? requested : STABLE_SCENARIOS;
  const before = sourceDigest();
  playwright(["open", URL], false);
  const failures: string[] = [];
  try {
    for (const name of scenarios) {
      prepareBrowserFixtures();
      const started = Date.now();
      const run = playwright(["run-code", `--filename=apps/editor/test/${name}.browser.js`], true);
      const output = `${run.stdout ?? ""}${run.stderr ?? ""}`;
      const passed = run.status === 0 && output.includes("### Result");
      console.log(`${passed ? "PASS" : "FAIL"} ${name} (${((Date.now() - started) / 1000).toFixed(1)}s)`);
      if (!passed) {
        failures.push(name);
        console.log(output.split("\n").slice(0, 20).map((line) => `  ${line}`).join("\n"));
      }
    }
  } finally {
    playwright(["close"], false);
  }
  if (sourceDigest() !== before) {
    console.error("A committed fixture source changed during the run.");
    failures.push("(source fixtures)");
  }
  // Leave clean scratch copies for manual runs.
  prepareBrowserFixtures();
  console.log(failures.length > 0 ? `${failures.length} failed: ${failures.join(", ")}` : `${scenarios.length} passed`);
  return failures.length > 0 ? 1 : 0;
}

process.exitCode = await main(process.argv.slice(2));
