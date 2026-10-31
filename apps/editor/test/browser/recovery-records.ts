import type { Page } from "@playwright/test";

/** Read committed records in production builds, without importing Vite source or writing test records. */
export function recoveryRecords(page: Page): Promise<{ id: string; path: string; recoveryText: string; snapshot: unknown }[]> {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open("litzio-recovery");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction("records", "readonly");
      const records = tx.objectStore("records").getAll();
      tx.oncomplete = () => { db.close(); resolve(records.result); };
      tx.onabort = tx.onerror = () => { db.close(); reject(tx.error); };
    };
  }));
}

/** Reset initial recovery/tab state between tests, never between a test's crash/restarts. */
export async function resetRecovery(page: Page): Promise<void> {
  await page.evaluate(() => localStorage.removeItem("litzio.openTabs"));
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase("litzio-recovery");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Test recovery reset was blocked"));
  }));
  await page.reload();
  await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({ state: "attached" });
}
