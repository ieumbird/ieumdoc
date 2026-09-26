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
const CONSOLE_MONITOR_START = `async page => {
  // The same CLI page is reused, so restore its default viewport after visual scenarios resize it.
  await page.setViewportSize({width: 1280, height: 720});
  await page.mouse.move(0, 0);
  await page.evaluate(() => { window.scrollTo(0, 0); document.activeElement?.blur(); });
  const key = "__ieumdocBrowserConsoleMonitor";
  if (page[key]) throw new Error("Browser console monitor is already active.");
  const errors = [];
  const listener = message => {
    if (message.type() === "error") {
      const location = message.location();
      errors.push(message.text() + (location.url ? " @ " + location.url : ""));
    }
  };
  const pageErrorListener = error => errors.push("Uncaught page error: " + error.message);
  page.on("console", listener);
  page.on("pageerror", pageErrorListener);
  page[key] = {errors, listener, pageErrorListener};
  return {consoleMonitor: true};
}`;
const CONSOLE_MONITOR_END = `async page => {
  const key = "__ieumdocBrowserConsoleMonitor";
  const monitor = page[key];
  if (!monitor) throw new Error("Browser console monitor was lost during the scenario.");
  page.off("console", monitor.listener);
  page.off("pageerror", monitor.pageErrorListener);
  delete page[key];
  return monitor.errors;
}`;
const BROWSER_STATE_DIAGNOSTIC = `async page => page.evaluate(() => {
  const visible = element => !!element && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden";
  const editor = document.querySelector(".document-editor");
  const instance = editor?.editor;
  const selection = instance?.state.selection;
  const active = document.activeElement;
  return {
    url: location.href,
    viewport: [innerWidth, innerHeight],
    activeElement: active ? {tag: active.tagName, testId: active.getAttribute("data-testid"), role: active.getAttribute("role"), label: active.getAttribute("aria-label"), className: typeof active.className === "string" ? active.className : ""} : null,
    editorFocused: instance?.view.hasFocus() ?? false,
    selection: selection ? {type: selection.constructor.name, empty: selection.empty, from: selection.from, to: selection.to, parent: selection.$from.parent.type.name, text: instance.state.doc.textBetween(selection.from, selection.to, " ")} : null,
    visibleMenus: [...document.querySelectorAll('[role="menu"]')].filter(visible).map(element => ({label: element.getAttribute("aria-label"), text: element.innerText})),
    visibleMenuItems: [...document.querySelectorAll('[role="menuitem"]')].filter(visible).map(element => element.innerText),
    visibleDialogs: [...document.querySelectorAll('[role="dialog"]')].filter(visible).map(element => ({label: element.getAttribute("aria-label"), testId: element.getAttribute("data-testid")})),
    status: document.querySelector('[data-testid="status"]')?.innerText ?? null,
    editorTextLength: editor?.innerText.length ?? 0,
  };
})`;

/** Scenarios in apps/editor/test/*.browser.js that pass reliably: currently all of them. */
export const STABLE_SCENARIOS = [
  "editor-shell",
  "layout-rules",
  "quiet-document",
  "new-document",
  "open-files",
  "save-during-edit",
  "equation-insertion",
  "equation-save-during-edit",
  "reference-save-reload",
  "quote-save-reload",
  "writeability-preflight",
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

function resultText(output: string): string | undefined {
  const marker = "### Result";
  const start = output.indexOf(marker);
  if (start < 0) return undefined;
  return output.slice(start + marker.length).replace(/^\r?\n/, "").split(/\r?\n### /, 1)[0].trim();
}

type ExpectedConsoleErrorRule = {
  status: number;
  pathname: string;
  minimum: number;
  queryPath?: RegExp;
  description: string;
};

const EXPECTED_CONSOLE_ERRORS: Record<string, ExpectedConsoleErrorRule[]> = {
  "editor-shell": [
    {status: 400, pathname: "/api/document", minimum: 1, description: "mocked save rejection"},
    {status: 409, pathname: "/api/document", minimum: 1, description: "mocked save conflict"},
  ],
  "open-files": [
    {
      status: 404,
      pathname: "/document/diagram.svg",
      queryPath: /^C:\\tmp\\ieumdoc-a\.md$/,
      minimum: 1,
      description: "missing diagram for mocked file A",
    },
    {
      status: 404,
      pathname: "/document/diagram.svg",
      queryPath: /^C:\\tmp\\ieumdoc-b\.md$/,
      minimum: 1,
      description: "missing diagram for mocked file B",
    },
    {status: 409, pathname: "/api/document", minimum: 1, description: "mocked save conflict"},
  ],
  "save-during-edit": [
    {status: 409, pathname: "/api/document", minimum: 1, description: "mocked save conflict"},
  ],
  "link-authoring": [
    {status: 400, pathname: "/api/document", minimum: 1, description: "rejected unpreservable link save"},
  ],
  "inline-math-authoring": [
    {status: 400, pathname: "/api/document", minimum: 1, description: "rejected unpreservable inline math save"},
  ],
  "admonition-authoring": [
    {status: 400, pathname: "/api/document", minimum: 1, description: "rejected unpreservable admonition edit"},
  ],
  "label-authoring": [
    {status: 400, pathname: "/api/document", minimum: 1, description: "rejected duplicate-label save"},
    {status: 400, pathname: "/api/document-source", minimum: 1, description: "rejected duplicate-label Source preview"},
  ],
};

function classifyConsoleErrors(scenario: string, messages: string[]) {
  const rules = EXPECTED_CONSOLE_ERRORS[scenario] ?? [];
  const matched = rules.map(() => 0);
  const unexpected: string[] = [];

  for (const message of messages) {
    const status = Number(message.match(/status of (\d{3}) \(/)?.[1]);
    const location = message.match(/ @ (https?:\/\/\S+)$/)?.[1];
    let url: URL | undefined;
    try {
      if (location) url = new globalThis.URL(location);
    } catch {
      // A malformed or non-HTTP console location cannot match an expected response.
    }
    const ruleIndex = rules.findIndex((rule) => status === rule.status && url?.pathname === rule.pathname &&
      (!rule.queryPath || rule.queryPath.test(url.searchParams.get("path") ?? "")));
    if (ruleIndex < 0) {
      unexpected.push(message);
    } else {
      matched[ruleIndex] += 1;
    }
  }

  const missing = rules.flatMap((rule, index) =>
    matched[index] < rule.minimum ? [`${rule.minimum - matched[index]} × ${rule.description} (${rule.status} ${rule.pathname})`] : []);
  const expected = rules.flatMap((rule, index) =>
    matched[index] > 0 ? [`${rule.status} ${rule.pathname} × ${matched[index]} (${rule.description})`] : []);
  return {expected, unexpected, missing};
}

function diagnosticOutput(output: string): string {
  const sourceStart = output.indexOf("### Ran Playwright code");
  if (sourceStart < 0) return output;
  const nextSection = ["### Page", "### Events", "### Error"]
    .map((section) => output.indexOf(`\n${section}`, sourceStart))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0];
  const omitted = "### Ran Playwright code\n[scenario source omitted]\n";
  return nextSection === undefined
    ? `${output.slice(0, sourceStart)}${omitted}`
    : `${output.slice(0, sourceStart)}${omitted}${output.slice(nextSection)}`;
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
    // Page routes are removed in scenario cleanup. A failed delayed-save scenario must
    // never fall through to writing the default source fixture after its mock is removed.
    const guard = playwright(["run-code", `async page => {
      await page.context().route('**/api/document**', async route => {
        if (route.request().method() === 'GET') return route.continue();
        const file = String(route.request().postDataJSON()?.path ?? '').replaceAll('\\\\', '/');
        const scratch = ${JSON.stringify(path.join(REPOSITORY_ROOT, "tmp").replaceAll("\\", "/") + "/")};
        if (!file.startsWith(scratch) || file.split('/').includes('..')) {
          return route.fulfill({status: 403, json: {error: 'Browser tests may write scratch files only.'}});
        }
        return route.continue();
      });
      const rejected = await page.evaluate(async file => {
        const response = await fetch('/api/document', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({path: file, revision: 'invalid-guard-probe'})});
        return response.status;
      }, ${JSON.stringify(path.join(REPOSITORY_ROOT, "apps/editor/document/technical-document.md"))});
      if (rejected !== 403) throw Error('Source write guard probe failed: ' + rejected);
      return {sourceWriteGuard: true};
    }`], true);
    if (guard.status !== 0 || !guard.stdout?.includes("### Result")) {
      console.error("Could not protect source fixtures from browser writes.");
      return 1;
    }
    for (const name of scenarios) {
      prepareBrowserFixtures();
      const started = Date.now();
      const monitorStart = playwright(["run-code", CONSOLE_MONITOR_START], true);
      const monitorStartOutput = `${monitorStart.stdout ?? ""}${monitorStart.stderr ?? ""}`;
      const monitorStarted = monitorStart.status === 0 && resultText(monitorStartOutput) !== undefined;
      const run = playwright(["run-code", `--filename=apps/editor/test/${name}.browser.js`], true);
      const output = `${run.stdout ?? ""}${run.stderr ?? ""}`;
      const scenarioFailed = run.status !== 0 || !output.includes("### Result");
      const browserDiagnostic = scenarioFailed
        ? playwright(["run-code", BROWSER_STATE_DIAGNOSTIC], true)
        : undefined;
      const monitorEnd = playwright(["run-code", CONSOLE_MONITOR_END], true);
      const monitorEndOutput = `${monitorEnd.stdout ?? ""}${monitorEnd.stderr ?? ""}`;
      let consoleErrors: string[] | undefined;
      try {
        const value = resultText(monitorEndOutput);
        if (monitorEnd.status === 0 && value !== undefined) {
          const parsed: unknown = JSON.parse(value);
          if (Array.isArray(parsed) && parsed.every((message) => typeof message === "string")) {
            consoleErrors = parsed;
          }
        }
      } catch {
        // Treat malformed monitor output as a test harness failure below.
      }
      const consoleClassification = classifyConsoleErrors(name, consoleErrors ?? []);
      const passed = run.status === 0 && output.includes("### Result") && monitorStarted &&
        consoleErrors !== undefined && consoleClassification.unexpected.length === 0 &&
        consoleClassification.missing.length === 0;
      console.log(`${passed ? "PASS" : "FAIL"} ${name} (${((Date.now() - started) / 1000).toFixed(1)}s)`);
      if (!monitorStarted) {
        failures.push(`${name} (console monitor setup)`);
        console.log(`${monitorStartOutput}${monitorStart.error ? `\n${monitorStart.error.message}` : ""}`);
      }
      if (consoleErrors === undefined) {
        failures.push(`${name} (console monitor result)`);
        console.log(`${monitorEndOutput}${monitorEnd.error ? `\n${monitorEnd.error.message}` : ""}`);
      } else {
        for (const message of consoleClassification.expected) console.log(`  expected console error: ${message}`);
        for (const message of consoleClassification.unexpected) console.log(`  unexpected console error: ${message}`);
        for (const message of consoleClassification.missing) console.log(`  missing expected console error: ${message}`);
        if (consoleClassification.unexpected.length > 0 || consoleClassification.missing.length > 0) {
          failures.push(`${name} (console errors)`);
        }
      }
      if (!passed) {
        if (run.status !== 0 || !output.includes("### Result")) failures.push(name);
        if (run.error) console.error(`  playwright-cli error: ${run.error.message}`);
        console.log(diagnosticOutput(output).split("\n").map((line) => `  ${line}`).join("\n"));
        if (browserDiagnostic) {
          const diagnostic = `${browserDiagnostic.stdout ?? ""}${browserDiagnostic.stderr ?? ""}`;
          const summary = resultText(diagnostic) ?? diagnosticOutput(diagnostic);
          console.log(`  Browser state after failure:\n${summary.split("\n").map((line) => `    ${line}`).join("\n")}`);
        }
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
