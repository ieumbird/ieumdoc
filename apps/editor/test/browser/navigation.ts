import path from "node:path";
import type { Page } from "@playwright/test";

/** Choose through the picker/tree. An existing tab is activated without rereading its content. */
export async function openDocument(page: Page, file: string): Promise<void> {
  const sidebar = page.getByTestId("sidebar");
  // The rail's toggle, or the TopBar's at phone widths, where a closed sidebar has no rail.
  const expand = page.getByRole("button", { name: "Expand sidebar", exact: true });
  if (await expand.isVisible()) await expand.click();
  await sidebar.getByRole("button", { name: "Files", exact: true }).click();
  if (await sidebar.getByTestId("folder").count()) {
    await sidebar.getByRole("button", { name: "More actions", exact: true }).click();
    await page.getByRole("menuitem", { name: "Open folder…", exact: true }).click();
  } else {
    await sidebar.getByRole("button", { name: "Open folder…", exact: true }).click();
  }
  await page.getByTestId("folder-path").fill(path.dirname(file));
  await page.getByTestId("folder-open").click();
  await page.getByRole("dialog", { name: "Open folder", exact: true }).waitFor({ state: "detached" });
  await sidebar.getByRole("treeitem", { name: path.basename(file), exact: true }).click();
}

/** Explicit disk read, including its work-loss confirmation when the target tab is dirty. */
export async function reloadDocument(page: Page): Promise<void> {
  await page.getByRole("button", { name: "File actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "Reload", exact: true }).click();
}

export const activeDocument = (page: Page) => page.locator('[data-document-tab][data-active="true"]');
