import { test, expect, chromium, type BrowserContext, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { prepareBrowserFixtures, REPOSITORY_ROOT } from "./fixtures.ts";
import { openPath, reloadDocument } from "./navigation.ts";
import { recoveryRecords, resetRecovery } from "./recovery-records.ts";
import type { Editor } from "@tiptap/core";

// Same checkout-owned persistent Chrome profile as the serial HTTP harness. No server restart.
const profile = path.join(tmpdir(), "ieumdoc-browser-profile", createHash("sha256").update(REPOSITORY_ROOT).digest("hex").slice(0, 16));
const origin = process.env.IEUMDOC_BROWSER_URL ?? "http://127.0.0.1:5181";
const ready = (page: Page) => page.locator('[data-testid="status"][data-operation="ready"]').waitFor({ state: "attached" });

test("HTTP recovery survives an owned browser process crash, then Save/Reload and conflict", async ({}, info) => {
  prepareBrowserFixtures();
  const file = path.join(REPOSITORY_ROOT, "tmp/http-host-a/fixture/a.md");
  writeFileSync(file, "---\nieumdoc: 1\n---\n");
  const original = readFileSync(file, "utf8");
  let context: BrowserContext | undefined;
  const processes: number[] = [];
  const launch = async (startupPath?: string) => {
    context = await chromium.launchPersistentContext(profile, {
      ...(process.platform === "win32" ? { channel: "chrome" } : {}), headless: true,
    });
    const cdp = await context.browser()!.newBrowserCDPSession();
    const { processInfo } = await cdp.send("SystemInfo.getProcessInfo");
    const pid = processInfo.find(p => p.type === "browser")!.id;
    expect(pid).toBeGreaterThan(0);
    expect(processes).not.toContain(pid);
    processes.push(pid);
    await cdp.detach();
    const page = await context.newPage();
    const url = new URL(origin);
    if (startupPath) url.searchParams.set("path", startupPath);
    await page.goto(url.href); await ready(page);
    expect(new URL(page.url()).origin).toBe(new URL(origin).origin);
    return page;
  };
  const crash = async () => {
    const owned = context!;
    const stopped = owned.waitForEvent("close");
    // PID came from this launched browser's CDP session, never a process-name/port search.
    if (process.platform === "win32") execFileSync("taskkill", ["/PID", String(processes.at(-1)), "/T", "/F"]);
    else process.kill(processes.at(-1)!, "SIGKILL");
    await stopped;
    await expect.poll(() => {
      try { process.kill(processes.at(-1)!, 0); return false; }
      catch (error) { if ((error as NodeJS.ErrnoException).code === "ESRCH") return true; throw error; }
    }).toBe(true);
    context = undefined;
  };
  try {
    let page = await launch();
    await resetRecovery(page);
    await openPath(page, file);
    await page.getByRole("button", { name: "Add a title", exact: true }).click();
    await page.keyboard.type("HTTP recovery paper");
    await page.keyboard.press("Enter");
    await page.keyboard.type("HTTP body.");
    await page.locator(".document-editor").evaluate(element => {
      const editor = (element as HTMLElement & {editor: Editor}).editor;
      editor.commands.insertContentAt(editor.state.doc.content.size, [
        {type:"equation",attrs:{latex:"x^2 + y^2 = z^2"}},
        {type:"table",attrs:{caption:[{kind:"text",text:"HTTP table caption"}]},content:[
          {type:"tableRow",content:[{type:"tableCell",attrs:{header:true},content:[{type:"text",text:"Header"}]}]},
          {type:"tableRow",content:[{type:"tableCell",attrs:{header:false},content:[{type:"text",text:"Measured cell"}]}]},
        ]},
        {type:"figure",content:[{type:"text",text:"HTTP pending figure caption"}]},
      ]);
    });
    const structured = await page.locator(".document-editor").evaluate(element => (element as HTMLElement & {editor:Editor}).editor.getJSON());
    const edit = async (text: string) => {
      await page.locator(".document-editor p").first().click();
      await page.keyboard.press("End"); await page.keyboard.insertText(text);
      await expect.poll(async () => (await recoveryRecords(page)).some(r => r.path === file && r.recoveryText.includes(text)), { timeout: 15_000 }).toBe(true);
    };
    await edit(" HTTP crash recorded.");
    const recorded = await recoveryRecords(page);
    expect(readFileSync(file, "utf8")).toBe(original);
    await crash();
    // Navigation preferences may revert to older clean tabs after a process kill. An explicit
    // startup path offers this record in the review dialog regardless of that separate memory.
    page = await launch(file);
    expect(await recoveryRecords(page)).toEqual(recorded);
    await expect(page.getByTestId("recovery-prompt")).toBeVisible();
    await expect(page.getByTestId("recovery-prompt")).toContainText(file);
    await page.getByRole("button", { name: "Restore work", exact: true }).click();
    await expect(page.getByRole("tab", { name: "a.md, Unsaved changes", exact: true })).toBeVisible();
    await expect(page.locator(".document-editor")).toContainText("HTTP crash recorded.");
    const restored = await page.locator(".document-editor").evaluate(element => (element as HTMLElement & {editor:Editor}).editor.getJSON());
    // The prose changed after the structural capture; all inserted atoms and table content must match.
    expect(restored.content?.filter(node => ["equation","table","figure"].includes(node.type!)))
      .toEqual(structured.content?.filter(node => ["equation","table","figure"].includes(node.type!)));
    expect(readFileSync(file, "utf8")).toBe(original);
    await page.getByTestId("save").click();
    await page.locator('[data-testid="status"][data-operation="saved"]').waitFor();
    await expect.poll(() => recoveryRecords(page)).toEqual([]);
    const saved = readFileSync(file, "utf8");
    expect(saved).toContain("HTTP crash recorded.");
    for (const text of ["HTTP recovery paper","x^2 + y^2 = z^2","Header","Measured cell","HTTP table caption","HTTP pending figure caption"]) expect(saved).toContain(text);
    await reloadDocument(page); await ready(page);
    await expect(page.locator(".document-editor")).toContainText("HTTP crash recorded.");
    await expect(page.locator(".document-editor")).toContainText("Measured cell");
    await expect(page.locator(".document-editor")).toContainText("HTTP pending figure caption");

    await edit(" HTTP conflict recorded.");
    const conflictRecord = await recoveryRecords(page);
    await crash();
    const outside = saved + "\nChanged outside before restore.\n";
    writeFileSync(file, outside);
    page = await launch(file);
    expect(await recoveryRecords(page)).toEqual(conflictRecord);
    await expect(page.getByTestId("recovery-prompt")).toBeVisible();
    await expect(page.getByTestId("recovery-prompt")).toContainText(file);
    await page.getByRole("button", { name: "Restore work", exact: true }).click();
    await expect(page.getByRole("tab", { name: "a.md, Unsaved changes", exact: true })).toBeVisible();
    expect(readFileSync(file, "utf8")).toBe(outside);
    const response = page.waitForResponse(r => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/document");
    await page.getByTestId("save").click();
    expect((await response).status()).toBe(409);
    await page.locator('[data-testid="status"][data-operation="save-conflict"]').waitFor();
    await expect(page.locator(".document-editor")).toContainText("HTTP conflict recorded.");
    expect(readFileSync(file, "utf8")).toBe(outside);
    expect((await recoveryRecords(page)).some(r => r.recoveryText.includes("HTTP conflict recorded."))).toBe(true);
    const proof = info.outputPath("host-recovery-proof.json");
    writeFileSync(proof, JSON.stringify({ platform: process.platform, origin, profile, processes, forcedBrowserRestarts: 2, serverRestarted: false, committedRecordSurvived: true, restoreDirty: true, originalUnchangedUntilSave: true, saveReload: true, externalConflict409: true }, null, 2));
    await info.attach("host-recovery-proof", { path: proof, contentType: "application/json" });
  } finally {
    await context?.close();
    prepareBrowserFixtures();
  }
});
