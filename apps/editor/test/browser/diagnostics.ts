import { expect, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import type { Editor } from "@tiptap/core";
import { writeFileSync } from "node:fs";
import type { classifyConsoleErrors } from "./console-errors.ts";

/** Compare exact saved source, keeping both strings only when the assertion fails. */
export function savedSourceAssertion(testInfo: TestInfo) {
  let comparison = 0;
  return async (actual: string, expected: string, message: string): Promise<void> => {
    comparison++;
    try {
      expect(actual, message).toBe(expected);
    } catch (error) {
      for (const [kind, source] of [["expected", expected], ["actual", actual]]) {
        const file = testInfo.outputPath(`saved-source-${comparison}-${kind}.md`);
        writeFileSync(file, source);
        await testInfo.attach(`saved-source-${comparison}-${kind}`, { path: file, contentType: "text/plain" });
      }
      throw error;
    }
  };
}

/** Capture before closing the custom page: default context fixture diagnostics cannot own it. */
export async function finishScenarioDiagnostics(
  session: BrowserContext,
  page: Page,
  testInfo: TestInfo,
  consoleErrors: { errors: string[] } & ReturnType<typeof classifyConsoleErrors>,
): Promise<void> {
  const failed = testInfo.status !== testInfo.expectedStatus ||
    consoleErrors.unexpected.length > 0 || consoleErrors.missing.length > 0;
  if (!failed) {
    await session.tracing.stop(); // No archive on success.
    return;
  }

  const diagnosticErrors: string[] = [];
  const capture = async (name: string, action: () => Promise<void>) => {
    try { await action(); }
    catch (error) { diagnosticErrors.push(`${name}: ${String(error)}`); }
  };
  const attachText = async (name: string, text: string, contentType: string) => {
    const file = testInfo.outputPath(name);
    writeFileSync(file, text);
    await testInfo.attach(name, { path: file, contentType });
  };
  await capture("input-events", async () => {
    const history = await page.evaluate(() => {
      const read = (window as typeof window & { __litzioInputEvents?: () => unknown }).__litzioInputEvents;
      if (!read) throw new Error("Input event recorder unavailable in this document");
      return read();
    }).catch(error => ({ diagnosticError: String(error) }));
    await attachText("input-events.json", JSON.stringify(history, null, 2), "application/json");
  });
  await capture("browser-state", async () => {
    const state = await page.evaluate(() => {
      const visible = (element: Element) => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden";
      const editor = document.querySelector<HTMLElement & { editor?: Editor }>('[data-document-tab][data-active="true"] .document-editor');
      const instance = editor?.editor;
      const selection = instance?.state.selection;
      const active = document.activeElement;
      const domSelection = window.getSelection();
      return {
        url: location.href,
        viewport: [innerWidth, innerHeight],
        documentFocused: document.hasFocus(),
        tabs: [...document.querySelectorAll('[role="tab"]')].map(element => ({ text: element.textContent, path: element.closest("[title]")?.getAttribute("title"), selected: element.getAttribute("aria-selected"), controls: element.getAttribute("aria-controls") })),
        documentTabs: [...document.querySelectorAll('[data-document-tab]')].map(element => ({ id: element.getAttribute("data-document-tab"), active: element.getAttribute("data-active") })),
        activeElement: active ? { tag: active.tagName, testId: active.getAttribute("data-testid"), role: active.getAttribute("role"), label: active.getAttribute("aria-label"), className: typeof active.className === "string" ? active.className : "" } : null,
        editorFocused: instance?.view.hasFocus() ?? false,
        selection: selection ? { type: selection.constructor.name, empty: selection.empty, from: selection.from, to: selection.to, parent: selection.$from.parent.type.name, text: instance!.state.doc.textBetween(selection.from, selection.to, " ") } : null,
        domSelection: domSelection ? { anchorNode: domSelection.anchorNode?.nodeName, anchorOffset: domSelection.anchorOffset, focusNode: domSelection.focusNode?.nodeName, focusOffset: domSelection.focusOffset, text: domSelection.toString() } : null,
        visibleMenus: [...document.querySelectorAll<HTMLElement>('[role="menu"]')].filter(visible).map(element => ({ label: element.getAttribute("aria-label"), text: element.innerText })),
        visibleMenuItems: [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].filter(visible).map(element => element.innerText),
        visibleDialogs: [...document.querySelectorAll('[role="dialog"]')].filter(visible).map(element => ({ label: element.getAttribute("aria-label"), testId: element.getAttribute("data-testid") })),
        status: document.querySelector<HTMLElement>('[data-testid="status"]')?.innerText ?? null,
        editorTextLength: editor?.innerText.length ?? 0,
      };
    }).catch(error => ({ diagnosticError: String(error) }));
    await attachText("browser-state.json", JSON.stringify({
      pages: session.pages().map(open => ({ url: open.url(), scenarioPage: open === page })),
      ...state,
    }, null, 2), "application/json");
  });
  await capture("console-errors", () => attachText("console-errors.json", JSON.stringify(consoleErrors, null, 2), "application/json"));
  await capture("error-context", async () => {
    const snapshot = await page.locator("body").ariaSnapshot({ timeout: 5_000 }).catch(error => `Snapshot unavailable: ${String(error)}`);
    // Scenario scripts run in a VM: their Error objects may be serialized as `value`.
    const errors = testInfo.errors.map(error => error.stack ?? error.message ?? error.value ?? JSON.stringify(error));
    await attachText("error-context.md", `# ${testInfo.title}\n\n${[...errors, ...consoleErrors.unexpected, ...consoleErrors.missing].join("\n\n")}\n\n## Page snapshot\n\n\`\`\`yaml\n${snapshot}\n\`\`\`\n`, "text/markdown");
  });
  await capture("screenshot", async () => {
    const file = testInfo.outputPath("test-failed.png");
    await page.screenshot({ path: file, timeout: 5_000, caret: "initial" });
    await testInfo.attach("screenshot", { path: file, contentType: "image/png" });
  });
  await capture("trace", async () => {
    const file = testInfo.outputPath("trace.zip");
    await session.tracing.stop({ path: file });
    await testInfo.attach("trace", { path: file, contentType: "application/zip" });
  });
  if (diagnosticErrors.length) {
    console.error("Failure diagnostics incomplete:", diagnosticErrors);
    await attachText("diagnostic-errors.json", JSON.stringify(diagnosticErrors, null, 2), "application/json");
  }
}
