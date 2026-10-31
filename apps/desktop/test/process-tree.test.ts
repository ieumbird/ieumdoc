import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { test } from "node:test";
import { ownedListeners, ownedProcessTree, processTree, type ProcessRecord } from "./packaged/process-tree.ts";

const record = (pid: number, parentPid: number, created: string): ProcessRecord =>
  ({ pid, parentPid, created, image: "C:\\Apps\\Litzio\\Litzio.exe", workingSet: 1024 });

test("a reused root or descendant PID cannot adopt older system processes and their listeners", () => {
  const root = record(100, 50, "2026-10-26T01:08:29.6520000Z");
  const child = record(200, 100, "2026-10-26T01:08:29.7000000Z");
  const renderer = record(300, 200, "2026-10-26T01:08:29.7000001Z");
  const oldSystem = record(400, 100, "2026-10-26T00:00:00.0000000Z");
  const ssh = record(500, 400, "2026-10-26T00:00:01.0000000Z");
  // This app image predates its replacement parent, but not the root: retain it.
  const orphan = record(600, 200, "2026-10-26T01:08:29.6999999Z");
  // Reverse order requires a complete traversal, not a single pass.
  const all = [ssh, renderer, orphan, child, oldSystem, root];
  const owned = ownedProcessTree(all, root);
  assert.deepEqual(owned.map(p => p.pid).sort(), [100, 200, 300, 600]);
  assert.deepEqual(ownedListeners(owned, all, [{ pid: 500, address: "0.0.0.0:22" }]), []);
  assert.deepEqual(ownedListeners(owned, all, [{ pid: 300, address: "127.0.0.1:1234" }, { pid: 600, address: "127.0.0.1:1235" }]),
    ["127.0.0.1:1234", "127.0.0.1:1235"]);
  // The old PID-only algorithm reproduces the contamination in this same snapshot.
  const ids = new Set([root.pid]);
  let before: number;
  do {
    before = ids.size;
    for (const p of all) if (ids.has(p.parentPid)) ids.add(p.pid);
  } while (before !== ids.size);
  assert.ok(ids.has(ssh.pid));
});

test("missing/reused root identities fail instead of producing an empty passing measurement", () => {
  const root = record(100, 50, "2026-10-26T01:08:29.6520000Z");
  assert.throws(() => ownedProcessTree([], root), /exited or its PID was reused/);
  assert.throws(() => ownedProcessTree([{ ...root, created: "2026-10-26T01:08:29.6520001Z" }], root), /exited or its PID was reused/);
});

test("an already owned orphan listener survives its helper exiting and the helper PID being reused", () => {
  const root = record(100, 50, "2026-10-26T01:08:29.0000000Z");
  const helper = record(200, 100, "2026-10-26T01:08:30.0000000Z");
  const listener = record(300, 200, "2026-10-26T01:08:31.0000000Z");
  const oldOwned = ownedProcessTree([root, helper, listener], root);
  const newHelper = { ...helper, created: "2026-10-26T01:08:32.0000000Z" };
  for (const current of [[root, newHelper, listener], [root, listener]]) {
    const newOwned = ownedProcessTree(current, root, oldOwned);
    assert.deepEqual(ownedListeners(newOwned, current, [{ pid: 300, address: "127.0.0.1:1234" }]), ["127.0.0.1:1234"]);
    assert.ok(newOwned.some(p => p.pid === listener.pid && p.created === listener.created));
  }
  // Confirmation belongs to a process identity, never just its recycled PID.
  const replacement = { ...listener, parentPid: 999, created: "2026-10-26T01:08:33.0000000Z" };
  assert.ok(!ownedProcessTree([root, newHelper, replacement], root, oldOwned).some(p => p.pid === replacement.pid));
});

test("a first-observed orphan app listener is owned even when its parent PID already names a younger helper", () => {
  const root = record(100, 50, "2026-10-26T01:08:29.0000000Z");
  const replacementHelper = record(200, 100, "2026-10-26T01:08:32.0000000Z");
  const listener = { ...record(300, 200, "2026-10-26T01:08:31.0000000Z"), image: "c:\\apps\\Litzio\\helpers\\listener.exe" };
  const all = [listener, replacementHelper, root];
  const owned = ownedProcessTree(all, root);
  assert.deepEqual(ownedListeners(owned, all, [{ pid: 300, address: "127.0.0.1:1234" }]), ["127.0.0.1:1234"]);
  assert.deepEqual(owned.map(p => p.pid).sort(), [100, 200, 300]);
});

test("ambiguous ancestry after root creation fails unless the executable is under the app directory", () => {
  const root = record(100, 50, "2026-10-26T01:08:29.0000000Z");
  const helper = record(200, 100, "2026-10-26T01:08:32.0000000Z");
  for (const image of [null, "C:\\Windows\\System32\\external.exe", "C:\\Apps\\Litzio-other\\listener.exe"]) {
    const listener = { ...record(300, 200, root.created), image };
    assert.throws(() => ownedProcessTree([root, helper, listener], root), /Ambiguous ownership.*PID 300.*parent PID 200/);
    const older = { ...listener, created: "2026-10-26T01:08:28.9999999Z" };
    assert.deepEqual(ownedProcessTree([root, helper, older], root).map(p => p.pid), [100, 200]);
  }
});

test("PID reuse during TCP enumeration fails rather than attributing an unrelated listener", () => {
  const root = record(100, 50, "2026-10-26T01:08:29.6520000Z");
  const listeners = [{ pid: 100, address: "0.0.0.0:3389" }];
  assert.throws(() => ownedListeners([root], [{ ...root, created: "2026-10-26T01:08:30.0000000Z" }], listeners), /PID was reused during sampling/);
  assert.throws(() => ownedListeners([root], [], listeners), /exited/);
});

test("the Windows collector reports a launched process's real TCP listener", { skip: process.platform !== "win32" }, async () => {
  const child = spawn(process.execPath, ["-e", "const s = require('node:net').createServer(); s.listen(0, '127.0.0.1', () => process.send(s.address().port));"],
    { stdio: ["ignore", "ignore", "inherit", "ipc"] });
  const exited = new Promise(resolve => child.once("exit", resolve));
  try {
    const [port] = await once(child, "message");
    const tree = await processTree(child, process.execPath);
    assert.ok(tree.identities.some(p => p.pid === child.pid));
    assert.ok(tree.workingSetMb > 0);
    assert.ok(tree.listening.includes(`127.0.0.1:${port}`), "a real app-owned listener must fail the packaged no-listener assertion");
    const sampling = processTree(child, process.execPath);
    child.kill();
    await assert.rejects(sampling, /The launched process exited/);
  } finally {
    child.kill();
    await exited;
  }
  await assert.rejects(processTree(child, process.execPath), /The launched process exited/);
});
