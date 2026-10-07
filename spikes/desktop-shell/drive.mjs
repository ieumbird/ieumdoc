// Spike driver: the packaged app (release/win-unpacked) under Playwright, one launch.
// Checks that the shell serves every Editor Host path without a TCP port and protects unsaved edits.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");
const { _electron: electron } = createRequire(path.join(repo, "node_modules/.pnpm/playwright-core@1.64.0-alpha-1789764292000/node_modules/playwright-core/"))("playwright-core");

const run = path.join(here, ".run");
const work = path.join(run, "work");
const logFile = path.join(run, "events.jsonl");
rmSync(work, { recursive: true, force: true });
mkdirSync(path.join(work, "folder"), { recursive: true });
const doc = path.join(work, "folder", "doc.md");
writeFileSync(doc, readFileSync(path.join(repo, "apps/editor/document/technical-document.md"), "utf8"));
writeFileSync(path.join(work, "folder", "diagram.svg"), readFileSync(path.join(repo, "apps/editor/document/diagram.svg")));
rmSync(logFile, { force: true });
const events = () => existsSync(logFile) ? readFileSync(logFile, "utf8").trim().split("\n").map(JSON.parse) : [];
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const results = {};

const app = await electron.launch({
  executablePath: path.join(here, "release/win-unpacked/IeumDoc Spike.exe"),
  // A separate profile under .run; reused across runs.
  args: [`--user-data-dir=${path.join(run, "profile")}`],
  env: { ...process.env, IEUMDOC_SPIKE_LOG: logFile, IEUMDOC_SPIKE_UNLOAD_ANSWER: "stay" },
  timeout: 60_000,
});
const page = await app.firstWindow();
// The shell, not Playwright, answers beforeunload (will-prevent-unload); a listener stops Playwright's auto-dismiss.
page.on("dialog", () => {});
const ready = () => page.locator('[data-testid="status"][data-operation="Ready"]').waitFor({ state: "attached", timeout: 20_000 });
const status = () => page.locator('[data-testid="status"]').innerText();
const error = () => page.locator('[data-testid="error"]').innerText().catch(() => "");
const editor = page.locator('[data-testid="document-editor"] [contenteditable="true"]');
async function step(name, body) {
  try { results[name] = await body(); } catch (cause) {
    results[name] = { error: String(cause?.message ?? cause).split("\n")[0] };
    await page.screenshot({ path: path.join(run, `fail-${name}.png`) }).catch(() => {});
  }
}
async function figureLoaded() {
  return page.waitForFunction(() => [...document.querySelectorAll('[data-testid="figure-image"]')]
    .every((image) => image.complete && image.naturalWidth > 0), null, { timeout: 10_000 }).then(() => true, () => false);
}

await step("1-sample-opens", async () => {
  await ready();
  return { url: page.url(), heading: await page.locator(".ProseMirror h1").first().innerText(), figureImageShown: await figureLoaded(),
    initial: events().find((event) => event.event === "ready")?.initial };
});

await step("2-no-listening-port", async () => {
  const pid = app.process().pid;
  const script = `$all = Get-CimInstance Win32_Process; $ids = @(${pid}); do { $before = $ids.Count; $ids = @($ids + ($all | Where-Object { $ids -contains $_.ParentProcessId } | ForEach-Object ProcessId) | Select-Object -Unique) } while ($ids.Count -ne $before); ` +
    `$listen = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $ids -contains $_.OwningProcess }); "$($ids.Count) $($listen.Count) $(($listen | ForEach-Object { $_.LocalAddress + ':' + $_.LocalPort }) -join ',')"`;
  const [processes, listening, addresses] = execFileSync("powershell", ["-NoProfile", "-Command", script], { encoding: "utf8" }).trim().split(" ");
  return { appProcesses: Number(processes), listeningSockets: Number(listening), addresses: addresses ?? "" };
});

await step("3-open-edit-save", async () => {
  await page.getByRole("button", { name: "Open…", exact: true }).click();
  await page.getByTestId("file-path").fill(doc);
  await page.getByRole("dialog").getByRole("button", { name: "Open", exact: true }).click();
  await ready();
  await page.locator(".ProseMirror p").first().click();
  await page.keyboard.press("Home");
  await page.keyboard.type("DESKTOP ");
  await page.keyboard.press("Control+S");
  await page.waitForFunction(() => document.querySelector('[data-testid="status"]')?.textContent === "Saved", null, { timeout: 10_000 });
  return { status: await status(), figureImageShown: await figureLoaded(), diskHasEdit: readFileSync(doc, "utf8").includes("DESKTOP ") };
});

await step("4-paste-png-asset", async () => {
  await page.locator(".ProseMirror p").first().click();
  await page.locator(".document-editor").evaluate(async (element) => {
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = 8;
    canvas.getContext("2d").fillRect(0, 0, 8, 8);
    const png = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    const data = new DataTransfer(); data.items.add(new File([png], "paste.png", { type: "image/png" }));
    element.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="figure-image"]').length >= 2, null, { timeout: 10_000 });
  const assets = existsSync(path.join(work, "folder", "assets")) ? readdirSync(path.join(work, "folder", "assets")) : [];
  return { assetFiles: assets.length, pastedImageShown: await figureLoaded(), error: await error() };
});

await step("5-close-with-unsaved-edits", async () => {
  // The paste above is unsaved. The shell answers "stay" (IEUMDOC_SPIKE_UNLOAD_ANSWER).
  const before = events().length;
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  await pause(1500);
  const windows = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
  return { statusBefore: await status(), questionAsked: events().slice(before).some((event) => event.event === "unload-question"), windowStillOpen: windows === 1 };
});

await step("6-save-then-new-document", async () => {
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[data-testid="status"]')?.textContent === "Saved", null, { timeout: 10_000 });
  const created = path.join(work, "folder", "created.md");
  await page.getByRole("button", { name: "New", exact: true }).click();
  await page.getByTestId("new-file-path").fill(created);
  await page.getByRole("dialog").getByRole("button", { name: "Create", exact: true }).click();
  await ready();
  return { saved: readFileSync(doc, "utf8").includes("./assets/image-"), created: existsSync(created) };
});

await step("7-open-folder", async () => {
  await page.getByRole("button", { name: "Open folder…" }).click();
  await page.getByTestId("folder-path").fill(path.join(work, "folder"));
  await page.getByTestId("folder-open").click();
  await page.getByRole("button", { name: "doc.md", exact: true }).first().waitFor({ timeout: 10_000 });
  return { listed: await page.getByRole("button", { name: "created.md", exact: true }).count() > 0 };
});

writeFileSync(path.join(run, "results.json"), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
// The window keeps its "stay" answer, so end the whole process tree rather than asking it to close.
execFileSync("taskkill", ["/PID", String(app.process().pid), "/T", "/F"], { stdio: "ignore" });
