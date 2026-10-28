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
    const inspect = (element: HTMLElement) => {
      const css = getComputedStyle(element), bounds = element.getBoundingClientRect();
      return { inline: element.getAttribute("style"), width: bounds.width, right: bounds.right, clientWidth: element.clientWidth,
        background: css.background, backgroundColor: css.backgroundColor, backgroundImage: css.backgroundImage,
        backgroundAttachment: css.backgroundAttachment, scrollbarGutter: css.scrollbarGutter, position: css.position,
        overflow: css.overflow, transform: css.transform, contain: css.contain };
    };
    return { surface, width: innerWidth, height: innerHeight, rowRight: rect.right, rootClientWidth: document.documentElement.clientWidth,
      scrollY, root: inspect(document.documentElement), body: inspect(document.body), popup: surface === "settings" ? inspect(row.parentElement!) : null,
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
  // Diagnostic only: preserve the original acceptance result, and restore every changed
  // property before returning. This CI experiment distinguishes native and DOM paint.
  if (proveOldHeight && result.mismatches.length) {
    const nativeBackground = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.getBackgroundColor());
    const properties = ["background-color", "background-image", "background-position-x", "background-position-y", "background-size",
      "background-repeat", "background-attachment", "background-origin", "background-clip"];
    const original = await page.evaluate(properties => ({
      backgrounds: [document.documentElement, document.body].map(element => properties.map(property =>
        ({ property, value: element.style.getPropertyValue(property), priority: element.style.getPropertyPriority(property) }))),
      gutter: { value: document.documentElement.style.getPropertyValue("scrollbar-gutter"), priority: document.documentElement.style.getPropertyPriority("scrollbar-gutter") },
    }), properties);
    const restore = async () => {
      await page.evaluate(original => {
        document.getElementById("caption-gutter-probe")?.remove();
        [document.documentElement, document.body].forEach((element, i) => {
          element.style.removeProperty("background");
          original.backgrounds[i]!.forEach(({ property, value, priority }) => {
            if (value) element.style.setProperty(property, value, priority); else element.style.removeProperty(property);
          });
        });
        if (original.gutter.value) document.documentElement.style.setProperty("scrollbar-gutter", original.gutter.value, original.gutter.priority);
        else document.documentElement.style.removeProperty("scrollbar-gutter");
      }, original);
      await app.evaluate(({ BrowserWindow }, color) => BrowserWindow.getAllWindows()[0]!.setBackgroundColor(color), nativeBackground);
    };
    const record = async (suffix: string) => {
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      const dom = await page.evaluate(() => {
        const html = document.documentElement, body = document.body, shell = document.querySelector(".app-shell")!;
        return { innerWidth, scrollY, scrollHeight: html.scrollHeight, shell: shell.getBoundingClientRect().toJSON(),
          popup: document.querySelector(".settings-screen")!.getBoundingClientRect().toJSON(),
          htmlStyle: html.getAttribute("style"), bodyStyle: body.getAttribute("style"),
          rootBackground: getComputedStyle(html).background, bodyBackground: getComputedStyle(body).background,
          lock: [getComputedStyle(html).overflowY, getComputedStyle(body).overflowY],
          probe: document.getElementById("caption-gutter-probe")?.getBoundingClientRect().toJSON() };
      });
      const background = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.getBackgroundColor());
      writeFileSync(`${output}${suffix}-dom.json`, JSON.stringify({ ...dom, nativeBackground: background }, null, 2));
      return sample(suffix);
    };
    try {
      await record("-probe-baseline");
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setBackgroundColor("#ff00ff"));
      await page.evaluate(({ top, height }) => {
        document.documentElement.style.setProperty("background", "linear-gradient(#0000ff, #0000ff) scroll #00ff00", "important");
        const strip = document.createElement("div"); strip.id = "caption-gutter-probe";
        strip.style.cssText = `position:fixed;top:${top}px;height:${height}px;left:calc(100% - 1px);right:-100px;background:#ff0000;z-index:2147483647;pointer-events:none`;
        document.body.append(strip);
      }, { top: geometry.bottom - geometry.border, height: geometry.border * 2 });
      await record("-probe-layered");
      await page.evaluate(() => document.getElementById("caption-gutter-probe")!.remove());
      await record("-probe-root-image-color-native");
      await restore();
      await page.evaluate(() => {
        document.documentElement.style.setProperty("background", "none", "important");
        document.body.style.setProperty("background", "#00ffff", "important");
      });
      await record("-probe-body");
      await restore();
      await page.evaluate(() => document.documentElement.style.setProperty("scrollbar-gutter", "auto", "important"));
      await record("-probe-auto-gutter");
    } finally {
      await restore();
      const restored = await record("-probe-restored");
      assert.deepEqual(restored.mismatches, result.mismatches, "diagnostics restore the original pixel result");
    }
  }
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
