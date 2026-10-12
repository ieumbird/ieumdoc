import path from "node:path";
import type { Page } from "@playwright/test";

/** Choose through the picker/tree, or explicitly Reload the current file to test rereading it. */
export async function openDocument(page: Page, file: string): Promise<void> {
  const sidebar = page.getByTestId("sidebar");
  const expand = sidebar.getByRole("button", { name: "Expand sidebar", exact: true });
  if (await expand.isVisible()) await expand.click();
  if (await sidebar.getByTestId("folder").count()) {
    await sidebar.getByRole("button", { name: "More actions", exact: true }).click();
    await page.getByRole("menuitem", { name: "Open folder…", exact: true }).click();
  } else {
    await sidebar.getByRole("button", { name: "Open folder…", exact: true }).click();
  }
  await page.getByTestId("folder-path").fill(path.dirname(file));
  await page.getByTestId("folder-open").click();
  await page.getByRole("dialog", { name: "Open folder", exact: true }).waitFor({ state: "detached" });
  if (await page.getByTestId("current-file").getAttribute("title") === file) {
    await page.getByRole("button", { name: "Reload", exact: true }).click();
  } else {
    await sidebar.getByRole("treeitem", { name: path.basename(file), exact: true }).click();
  }
}
