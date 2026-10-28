import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type ElectronApplication, type Page } from "@playwright/test";

/** OS-composed pixels, never webContents.capturePage (which omits native Views). */
export async function captionPixels(app: ElectronApplication, page: Page, output: string, surface: "settings" | "document", proveOldHeight = false) {
  await app.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows()[0]!; window.show(); window.focus(); });
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isFocused())).toBe(true);
  await page.mouse.move(300, 200); // Native hover paint must not affect the rest-state sample.
  const geometry = await page.evaluate(async surface => {
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const row = document.querySelector(surface === "settings" ? ".settings-topbar" : ".app-titlebar")!;
    const rect = row.getBoundingClientRect(), style = getComputedStyle(row);
    const overlay = (navigator as Navigator & { windowControlsOverlay: { getTitlebarAreaRect(): DOMRect } }).windowControlsOverlay.getTitlebarAreaRect();
    const root = getComputedStyle(document.documentElement);
    // Resolve rem/calc through layout; parseFloat(--layout-header-row) would read 2.5, not 40px.
    const probe = document.createElement("div");
    probe.style.position = "fixed"; // Measuring a token must not create page overflow.
    probe.style.height = "calc(var(--layout-header-row) - var(--border-width))";
    document.body.append(probe);
    const expectedOverlay = probe.getBoundingClientRect().height;
    probe.remove();
    return { surface, width: innerWidth, height: innerHeight, rowRight: rect.right, rootClientWidth: document.documentElement.clientWidth,
      scrollLock: [getComputedStyle(document.documentElement).overflowY, getComputedStyle(document.body).overflowY],
      bottom: rect.bottom, border: parseFloat(style.borderBottomWidth),
      rgb: style.borderBottomColor.match(/\d+/g)!.slice(0, 3).map(Number), captionLeft: overlay.right,
      overlayHeight: overlay.height, expectedOverlay, tokenBorder: parseFloat(root.getPropertyValue("--border-width")) };
  }, surface);
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(`${output}-geometry.json`, JSON.stringify(geometry, null, 2));
  assert.equal(geometry.border, geometry.tokenBorder);
  assert.equal(geometry.overlayHeight, geometry.expectedOverlay, "native height follows the header content box, excluding its border");
  assert.ok(geometry.captionLeft > 8 && geometry.captionLeft < geometry.width - 30);
  if (surface === "settings") {
    assert.ok(geometry.scrollLock.includes("hidden"), "Base UI retains the underlying page scroll lock");
  } else {
    assert.equal(geometry.rowRight, geometry.rootClientWidth, "document strip ends at the current root scrollbar; #488 owns that gutter");
  }
  const handle = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.getNativeWindowHandle().readBigUInt64LE().toString());
  const sample = (suffix: string) => {
    const result = JSON.parse(execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-File",
      fileURLToPath(new URL("caption-pixels.ps1", import.meta.url))], {
      input: JSON.stringify({ ...geometry, handle, output: `${output}${suffix}.png` }), encoding: "utf8", timeout: 15_000, windowsHide: true,
    }));
    writeFileSync(`${output}${suffix}.json`, JSON.stringify({ geometry, ...result }, null, 2));
    assert.deepEqual(result.reference, geometry.rgb, "the web separator outside native controls locates the screen row");
    return result as { mismatches: number[]; sampled: number };
  };
  // Negative control on the originally reported Settings surface: prove the capture sees
  // native paint. A renderer-only image would incorrectly pass even with the old 40px height.
  if (proveOldHeight) {
    try {
      await app.evaluate(({ BrowserWindow }, height) => BrowserWindow.getAllWindows()[0]!.setTitleBarOverlay({ height }), geometry.expectedOverlay + geometry.border);
      await expect.poll(() => page.evaluate(() => (navigator as Navigator & { windowControlsOverlay: { getTitlebarAreaRect(): DOMRect } }).windowControlsOverlay.getTitlebarAreaRect().height)).toBe(geometry.expectedOverlay + geometry.border);
      const old = sample("-old-height");
      assert.ok(old.mismatches.length > old.sampled * 0.9, "old opaque overlay must cover the separator on the OS screen");
    } finally {
      await app.evaluate(({ BrowserWindow }, height) => BrowserWindow.getAllWindows()[0]!.setTitleBarOverlay({ height }), geometry.expectedOverlay);
      await expect.poll(() => page.evaluate(() => (navigator as Navigator & { windowControlsOverlay: { getTitlebarAreaRect(): DOMRect } }).windowControlsOverlay.getTitlebarAreaRect().height)).toBe(geometry.expectedOverlay);
    }
  }
  const result = sample("");
  // #694 owner scope: keep the document's existing root scrollbar, record all its pixels,
  // and require the native overlay not to obscure the separator in the web content area.
  // Settings has no exception: its separator must reach the full window edge.
  const allowedGutterStart = surface === "document" ? geometry.rootClientWidth : geometry.width;
  const blocked = result.mismatches.filter(x => x < allowedGutterStart);
  writeFileSync(`${output}-summary.json`, JSON.stringify({ surface, rootGutter: geometry.width - geometry.rootClientWidth,
    sampled: result.sampled, mismatches: result.mismatches.length, gutterMismatches: result.mismatches.length - blocked.length,
    overlayMismatches: blocked.length, rootGutterFollowUp: surface === "document" ? "#488 phase 0" : null }, null, 2));
  assert.deepEqual(blocked, [], surface === "settings" ? "Settings separator reaches the full native caption edge"
    : "native paint leaves the document separator visible up to the existing root scrollbar (#488)");
}
