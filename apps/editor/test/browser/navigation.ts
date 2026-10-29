import path from "node:path";
import type { Page } from "@playwright/test";
import type { Editor } from "@tiptap/core";

/** Follow the empty-state entry or an opened folder's menu, retaining its focus return target. */
export async function openFolderPicker(page: Page, language = "en"): Promise<void> {
  const sidebar = page.getByTestId("sidebar");
  const name = language === "ko" ? "폴더 열기…" : "Open folder…";
  const folders = sidebar.getByTestId("folder");
  if (await folders.count()) {
    await folders.first().getByRole("button", { name: language === "ko" ? "더 많은 작업" : "More actions", exact: true }).click();
    await page.getByRole("menuitem", { name, exact: true }).click();
  } else await sidebar.getByRole("button", { name, exact: true }).click();
  await page.getByTestId("folder-path").waitFor();
}

/** Open (add) the file's folder through the picker, then choose the file in that folder's tree. An existing tab is activated without rereading its content. */
export async function openDocument(page: Page, file: string): Promise<void> {
  const sidebar = page.getByTestId("sidebar");
  // Expand the Sidebar through its rail when the caller has collapsed it.
  const expand = page.getByRole("button", { name: "Expand Explorer", exact: true });
  if (await expand.isVisible()) await expand.click();
  await openFolderPicker(page);
  await page.getByTestId("folder-path").fill(path.dirname(file));
  await page.getByTestId("folder-open").click();
  await page.getByRole("dialog", { name: "Open folder", exact: true }).waitFor({ state: "detached" });
  // The chosen directory may now live inside an already-open ancestor (#702).
  await sidebar.locator(`[role="treeitem"][data-path=${JSON.stringify(file)}]`).click();
}

/** Wait for Reload's modal/menu focus handoff; callers still answer dirty-tab confirmation. */
export async function reloadDocument(page: Page): Promise<void> {
  await page.getByRole("button", { name: "File actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "Reload", exact: true }).click();
  await page.getByRole("menu").waitFor({ state: "detached" });
  await page.waitForFunction(() => {
    const dialog = document.querySelector('[role="dialog"]');
    if (dialog) {
      // A loading modal must finish, but an interactive discard prompt belongs to the caller.
      // Closing popups remain mounted with enabled buttons until final focus is handed back.
      if (!dialog.hasAttribute("data-open")) return false;
      const keepEditing = Array.from(dialog.querySelectorAll("button"))
        .find(button => button.textContent === "Keep editing");
      return keepEditing && !keepEditing.disabled && dialog.contains(document.activeElement);
    }
    return document.activeElement?.matches('button[aria-label="File actions"]');
  });
}

export const activeDocument = (page: Page) => page.locator('[data-document-tab][data-active="true"]');

/** A form can disappear before its scheduled return to the editor has taken focus. */
export async function waitForEditorFocus(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const element = document.querySelector<HTMLElement & { editor?: Editor }>('[data-document-tab][data-active="true"] .document-editor');
    const editor = element?.editor;
    return editor && !editor.isDestroyed && editor.view.hasFocus();
  });
}

/** Open a successful document and wait for its exact active path before using the editor. */
export async function openPath(page: Page, file: string): Promise<void> {
  await openDocument(page, file);
  await waitForActivePath(page, file);
  await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({ state: "attached" });
}

/** Wait after a scoped tree selection without reopening or changing its folder access. */
export async function waitForActivePath(page: Page, file: string): Promise<void> {
  // The click can finish while the previous document is still active and ready.
  await page.waitForFunction(file => document.querySelector('[data-testid="current-file"]')?.getAttribute('title') === file, file);
}
