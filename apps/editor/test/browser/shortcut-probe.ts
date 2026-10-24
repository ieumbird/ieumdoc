// Windows browser-default audit: run from this checkout with
// pnpm exec tsx apps/editor/test/browser/shortcut-probe.ts chrome (or msedge).
// Headed installed browsers, one persistent profile per checkout/channel, no native UI automation.
import assert from "node:assert/strict";
import { chromium, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { REPOSITORY_ROOT } from "./fixtures.ts";

export const candidates = ["Slash", "Quote", "Semicolon", "Backslash", "BracketLeft", "BracketRight", "Backquote", "Comma", "Period"];

// Also used against the actual Electron window in the #381 audit.
export async function probeShortcuts(page: Page) {
  await page.bringToFront();
  await page.setContent('<input id="probe" value="unchanged" aria-label="Shortcut probe">');
  await page.evaluate(() => {
    (window as any).shortcutEvents = [];
    window.addEventListener("keydown", event => {
      if (!event.ctrlKey || event.code.startsWith("Control")) return;
      event.preventDefault();
      (window as any).shortcutEvents.push({ code: event.code, key: event.key,
        trusted: event.isTrusted, cancelable: event.cancelable, prevented: event.defaultPrevented });
    }, { capture: true });
  });
  await page.locator("#probe").focus();
  const results = [];
  for (const code of candidates) {
    await page.evaluate(() => { (window as any).shortcutEvents = []; });
    await page.keyboard.press(`Control+${code}`);
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    results.push(await page.evaluate(code => ({ code, events: (window as any).shortcutEvents,
      focused: document.hasFocus() && document.activeElement?.id === "probe",
      value: (document.querySelector("#probe") as HTMLInputElement).value }), code));
  }
  return results;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.join(REPOSITORY_ROOT, "apps/editor/test/browser/shortcut-probe.ts")) {
  const channel = process.argv[2];
  assert.ok(channel === "chrome" || channel === "msedge", "Choose installed chrome or msedge");
  const id = createHash("sha256").update(REPOSITORY_ROOT).digest("hex").slice(0, 16);
  const profile = path.join(tmpdir(), "ieumdoc-browser-profile", id + (channel === "msedge" ? "-edge" : ""));
  const context = await chromium.launchPersistentContext(profile, { channel, headless: false });
  try {
    const page = await context.newPage();
    const pages = context.pages().length;
    const results = await probeShortcuts(page);
    const output = { channel, version: context.browser()?.version(), profile, headed: true, results,
      noExtraTabs: context.pages().length === pages };
    mkdirSync(path.join(REPOSITORY_ROOT, "tmp"), { recursive: true });
    writeFileSync(path.join(REPOSITORY_ROOT, `tmp/shortcut-probe-${channel}.json`), JSON.stringify(output, null, 2));
    console.log(JSON.stringify(output));
    assert.ok(output.noExtraTabs);
    for (const result of results) {
      assert.equal(result.events.length, 1, result.code);
      assert.deepEqual(result.events[0], { code: result.code, key: result.events[0].key, trusted: true, cancelable: true, prevented: true });
      assert.ok(result.focused, result.code);
      assert.equal(result.value, "unchanged", result.code);
    }
  } finally { await context.close(); }
}
