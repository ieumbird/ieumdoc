import { test, expect, chromium, type BrowserContext, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { prepareBrowserFixtures, REPOSITORY_ROOT } from "./fixtures.ts";
import { openDocument, reloadDocument } from "./navigation.ts";
import { recoveryRecords, resetRecovery } from "./recovery-records.ts";

// Same checkout-owned persistent Chrome profile as the serial HTTP harness. No server restart.
const profile = path.join(tmpdir(), "ieumdoc-browser-profile", createHash("sha256").update(REPOSITORY_ROOT).digest("hex").slice(0, 16));
const origin = process.env.IEUMDOC_BROWSER_URL ?? "http://127.0.0.1:5181";
const ready = (page: Page) => page.locator('[data-testid="status"][data-operation="ready"]').waitFor({ state: "attached" });

test("HTTP recovery survives an owned browser process crash, then Save/Reload and conflict", async ({}, info) => {
  prepareBrowserFixtures();
  const file = path.join(REPOSITORY_ROOT, "tmp/http-host-a/fixture/a.md");
  const original = readFileSync(file, "utf8");
  let context: BrowserContext | undefined;
  const processes: number[] = [];
  const launch = async () => {
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
    await page.goto(origin); await ready(page);
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
    await openDocument(page, file); await ready(page);
    const edit = async (text: string) => {
      await page.locator(".document-editor p").first().click();
      await page.keyboard.press("End"); await page.keyboard.insertText(text);
      await expect.poll(async () => (await recoveryRecords(page)).some(r => r.path === file && r.recoveryText.includes(text)), { timeout: 15_000 }).toBe(true);
    };
    await edit(" HTTP crash recorded.");
    const recorded = await recoveryRecords(page);
    expect(readFileSync(file, "utf8")).toBe(original);
    await crash();
    page = await launch();
    expect(await recoveryRecords(page)).toEqual(recorded);
    await expect(page.getByRole("button", { name: "Review recovery", exact: true })).toBeVisible();
    await openDocument(page, file); await ready(page);
    await page.getByTestId("recovery-prompt").waitFor();
    await page.getByRole("button", { name: "Restore work", exact: true }).click();
    await expect(page.getByRole("tab", { name: "a.md, Unsaved changes", exact: true })).toBeVisible();
    await expect(page.locator(".document-editor")).toContainText("HTTP crash recorded.");
    expect(readFileSync(file, "utf8")).toBe(original);
    await page.getByTestId("save").click();
    await page.locator('[data-testid="status"][data-operation="saved"]').waitFor();
    await expect.poll(() => recoveryRecords(page)).toEqual([]);
    const saved = readFileSync(file, "utf8");
    expect(saved).toContain("HTTP crash recorded.");
    await reloadDocument(page); await ready(page);
    await expect(page.locator(".document-editor")).toContainText("HTTP crash recorded.");

    await edit(" HTTP conflict recorded.");
    const conflictRecord = await recoveryRecords(page);
    await crash();
    const outside = saved + "\nChanged outside before restore.\n";
    writeFileSync(file, outside);
    page = await launch();
    expect(await recoveryRecords(page)).toEqual(conflictRecord);
    await page.getByRole("button", { name: "Review recovery", exact: true }).click();
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
