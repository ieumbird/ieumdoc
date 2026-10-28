import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { ExplorerFolders } from "../src/explorer.ts";
import { createProtocolHandler, ORIGIN } from "../src/host-protocol.ts";

test("Explorer only opens existing directories in currently opened, Host-listed roots", async () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), "ieumdoc-explorer-"));
  try {
    const root = path.join(temp, "root");
    const child = path.join(root, "child");
    const outside = path.join(temp, "outside");
    mkdirSync(child, { recursive: true }); mkdirSync(outside);
    const file = path.join(root, "run.exe"); writeFileSync(file, "not executable");
    const folders = new ExplorerFolders();
    const calls: string[] = [];
    const open = async (folder: string) => { calls.push(folder); return ""; };
    assert.throws(() => folders.setOpened([root]), /Unknown/);
    const handler = createProtocolHandler(temp, { sample: "" }, undefined, root => folders.listedRoot(root));
    assert.equal((await handler(new Request(`${ORIGIN}/api/folder?root=${encodeURIComponent(root)}`))).status, 200);
    folders.setOpened([root]);
    await folders.open(root, open); await folders.open(child, open);
    assert.deepEqual(calls, [root, child]);
    for (const target of [outside, path.join(root, "..", "outside"), file, path.join(root, "missing"),
      "\\\\server\\share", "//server/share", "\\\\?\\C:\\Windows", null, {}, "relative", root + "\0", "\ud800"]) {
      await assert.rejects(() => folders.open(target, open));
    }
    const link = path.join(root, "escape");
    symlinkSync(outside, link, process.platform === "win32" ? "junction" : "dir");
    await assert.rejects(() => folders.open(link, open));
    assert.equal(calls.length, 2, "rejected inputs never invoke the OS");
    await assert.rejects(() => folders.open(child, async () => "OS refused"), /OS refused/);
    folders.setOpened([]);
    await assert.rejects(() => folders.open(root, open));
    folders.setOpened([root]); rmSync(child, { recursive: true });
    await assert.rejects(() => folders.open(child, open));
  } finally { rmSync(temp, { recursive: true, force: true }); }
});
