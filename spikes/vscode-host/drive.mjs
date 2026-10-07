// Spike driver: one VS Code launch in an isolated, reused profile; records what each scenario does.
// SPIKE_EOL=lf|crlf picks the fixture line endings; SPIKE_FORMAT=on|off toggles markdown format-on-save.
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

// No trailing separator: a trailing backslash escapes the closing quote on the Windows command line.
const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");
const require = createRequire(path.join(repo, "node_modules/.pnpm/playwright-core@1.64.0-alpha-1789764292000/node_modules/playwright-core/"));
const { _electron: electron } = require("playwright-core");

const eol = process.env.SPIKE_EOL === "crlf" ? "\r\n" : "\n";
const formatOnSave = process.env.SPIKE_FORMAT !== "off";
// SPIKE_FORMATTER=emphasis uses the spike's Prettier-style formatter instead of Markdown All in One.
const emphasisFormatter = process.env.SPIKE_FORMATTER === "emphasis";
const formatter = emphasisFormatter ? "ieumdoc-spike.ieumdoc-vscode-spike" : "yzhang.markdown-all-in-one";
// SPIKE_PROVIDER=custom opens the CustomEditorProvider (IeumDoc owns the document) instead of the CustomTextEditor.
const provider = process.env.SPIKE_PROVIDER === "custom" ? "custom" : "text";
const variant = `${provider}-${eol === "\n" ? "lf" : "crlf"}-format-${formatOnSave ? (emphasisFormatter ? "emphasis" : "maio") : "off"}`;
const run = path.join(here, ".run");
const workspace = path.join(run, "workspace");
const doc = path.join(workspace, "doc.md");
const logFile = path.join(run, `events-${variant}.jsonl`);
mkdirSync(path.join(run, "user-data/User"), { recursive: true });
mkdirSync(workspace, { recursive: true });
const original = readFileSync(path.join(repo, "apps/editor/document/technical-document.md"), "utf8").replace(/\r?\n/g, eol);
writeFileSync(doc, original);
copyFileSync(path.join(repo, "apps/editor/document/diagram.svg"), path.join(workspace, "diagram.svg"));
rmSync(logFile, { force: true });
// Every run starts without editors restored from the previous run.
for (const state of ["user-data/User/workspaceStorage", "user-data/Backups"]) rmSync(path.join(run, state), { recursive: true, force: true });
writeFileSync(path.join(run, "user-data/User/settings.json"), JSON.stringify({
  "window.dialogStyle": "custom",
  "window.titleBarStyle": "custom",
  "workbench.startupEditor": "none",
  "workbench.tips.enabled": false,
  "security.workspace.trust.enabled": false,
  "extensions.autoUpdate": false,
  "extensions.autoCheckUpdates": false,
  "update.mode": "none",
  "telemetry.telemetryLevel": "off",
  "chat.disableAIFeatures": true,
  "[markdown]": { "editor.defaultFormatter": formatter, "editor.formatOnSave": formatOnSave },
}, null, 2));

const results = { variant };
const events = () => existsSync(logFile) ? readFileSync(logFile, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse) : [];
const disk = () => readFileSync(doc, "utf8");
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const app = await electron.launch({
  executablePath: "C:/Program Files/Microsoft VS Code/Code.exe",
  args: [workspace, `--user-data-dir=${path.join(run, "user-data")}`, `--extensions-dir=${path.join(run, "extensions")}`,
    // Markdown All in One (a markdown formatter users have) loads from a copy, beside the spike.
    `--extensionDevelopmentPath=${here}`, `--extensionDevelopmentPath=${path.join(run, "extensions", "yzhang.markdown-all-in-one-3.6.3")}`,
    "--skip-welcome", "--skip-release-notes", "--disable-workspace-trust"],
  env: { ...process.env, IEUMDOC_SPIKE_OPEN: doc, IEUMDOC_SPIKE_LOG: logFile,
    IEUMDOC_SPIKE_FORMATTER: emphasisFormatter ? "emphasis" : "", IEUMDOC_SPIKE_PROVIDER: provider },
  timeout: 60_000,
});
const window = await app.firstWindow();
await window.waitForLoadState("domcontentloaded");
await window.setViewportSize({ width: 1600, height: 900 }).catch(() => {});
await pause(4000);
// First-run sign-in onboarding covers the workbench in a fresh profile.
const skipSignIn = window.getByText("Continue without Signing In");
if (await skipSignIn.count()) await skipSignIn.click();
const shot = (name) => window.screenshot({ path: path.join(run, `${variant}-${name}.png`) });

async function editorFrame(previous) {
  for (let attempt = 0; attempt < 60; attempt++) {
    for (const frame of window.frames()) {
      if (frame !== previous && !frame.isDetached() && await frame.locator(".ProseMirror").count().catch(() => 0)) return frame;
    }
    await pause(500);
  }
  throw new Error("IeumDoc webview did not render");
}
const ieumStatus = (frame) => frame.locator('[data-testid="status"]').innerText().catch(() => "");
const ieumError = (frame) => frame.locator('[data-testid="error"]').innerText().catch(() => "");
const dirtyTabs = () => window.locator(".tabs-container .tab.dirty").count();
const since = (from, name) => events().slice(from).filter((event) => !name || event.event === name);
const names = (from) => since(from).map((event) => event.event + (event.status ? `:${event.status}` : "") + (event.reason ? `:reason${event.reason}` : ""));

async function typeInFirstParagraph(frame, text) {
  await frame.locator(".ProseMirror p").first().click();
  await window.keyboard.type(text);
}

async function command(title) {
  await window.keyboard.press("Control+Shift+P");
  await pause(600);
  await window.keyboard.type(title);
  await pause(800);
  await window.keyboard.press("Enter");
  await pause(1500);
}

async function step(name, body) {
  try {
    results[name] = await body();
  } catch (error) {
    results[name] = { error: String(error?.message ?? error).split("\n")[0] };
    await shot(`fail-${name}`).catch(() => {});
  }
}

let frame;
await step("A-open", async () => {
  frame = await editorFrame();
  await pause(1000);
  return { heading: await frame.locator(".ProseMirror h1").first().innerText() };
});

await step("B-type-without-save", async () => {
  const from = events().length;
  await typeInFirstParagraph(frame, "B1 ");
  await pause(1000);
  return { ieumdocStatus: await ieumStatus(frame), vscodeDirtyTabs: await dirtyTabs(),
    textDocumentChanges: since(from, "text-change").length, diskChanged: disk() !== original };
});

await step("C-save-button", async () => {
  const from = events().length;
  await frame.locator('[data-testid="save"]').click();
  await pause(3000);
  const save = since(from, "ieumdoc-save")[0];
  const onDisk = disk();
  return { ieumdocStatus: await ieumStatus(frame), ieumdocError: await ieumError(frame), vscodeDirtyTabs: await dirtyTabs(),
    events: names(from), saveApiReturned: save?.written ?? null,
    bufferDiffersFromIeumdocMarkdownBeforeSave: save?.formatted ?? null,
    diskEqualsIeumdocMarkdown: save ? onDisk === save.markdown : null,
    diskHasCRLF: onDisk.includes("\r\n"), diskHasEdit: onDisk.includes("B1"),
    ieumdocEmphasis: save?.markdown.match(/[*_]phase current[*_]/)?.[0] ?? null,
    diskEmphasis: onDisk.match(/[*_]phase current[*_]/)?.[0] ?? null,
    diskTable: onDisk.slice(onDisk.indexOf("| Port")).trim().split(/\r?\n/) };
});

await step("D-second-save-ctrl-s", async () => {
  const from = events().length;
  await typeInFirstParagraph(frame, "D1 ");
  await window.keyboard.press("Control+S");
  await pause(3000);
  return { ieumdocStatus: await ieumStatus(frame), ieumdocError: (await ieumError(frame)).split("\n")[0],
    diskHasEdit: disk().includes("D1"), events: names(from) };
});

await step("E-ctrl-z-in-webview", async () => {
  const before = disk();
  const from = events().length;
  await typeInFirstParagraph(frame, "E1 ");
  await pause(300);
  await window.keyboard.press("Control+Z");
  await pause(1500);
  const text = await frame.locator(".ProseMirror p").first().innerText();
  return { tiptapUndidE1: !text.includes("E1"), textDocumentUndos: since(from, "text-change").filter((event) => event.reason === 1).length,
    vscodeDirtyTabs: await dirtyTabs(), diskChanged: disk() !== before, events: names(from) };
});

await step("G-close-with-unsaved-ieumdoc-edits", async () => {
  await command("File: Revert File");
  // Reverting a custom document reloads its webview.
  frame = await editorFrame();
  await pause(1000);
  const from = events().length;
  await typeInFirstParagraph(frame, "G1 ");
  await pause(500);
  const statusBefore = await ieumStatus(frame);
  await command("View: Close Editor");
  await pause(1000);
  const dialog = window.locator(".monaco-dialog-box");
  const prompt = await dialog.count() ? await dialog.innerText() : "";
  if (prompt) await window.keyboard.press("Escape");
  return { ieumdocStatusBeforeClose: statusBefore, vscodePrompted: Boolean(prompt), prompt: prompt.split("\n").slice(0, 3),
    panelDisposed: since(from, "panel-disposed").length, diskHasG1: disk().includes("G1"), events: names(from) };
});

await step("F-text-editor-beside", async () => {
  await command("IeumDoc Spike: Open Both");
  frame = await editorFrame();
  const from = events().length;
  const text = window.locator(".editor-group-container").nth(1).locator(".monaco-editor .view-lines");
  await text.click();
  await window.keyboard.press("Control+End");
  await window.keyboard.type(`${eol === "\n" ? "\n" : "\n"}TEXT-F`);
  await pause(1000);
  const ieumdocShowsTextEdit = (await frame.locator(".ProseMirror").innerText()).includes("TEXT-F");
  await typeInFirstParagraph(frame, "F1 ");
  await window.keyboard.press("Control+S");
  await pause(3000);
  await shot("F");
  return { textEditorOpened: await text.count(), vscodeDirtyTabs: await dirtyTabs(), ieumdocShowsTextEdit,
    ieumdocStatus: await ieumStatus(frame), ieumdocError: (await ieumError(frame)).split("\n")[0],
    diskHasTextEdit: disk().includes("TEXT-F"), diskHasF1: disk().includes("F1"), events: names(from) };
});

writeFileSync(path.join(run, `results-${variant}.json`), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
await app.close();
