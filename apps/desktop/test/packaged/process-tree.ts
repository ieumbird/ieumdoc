import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";

export interface ProcessRecord {
  pid: number;
  parentPid: number;
  // UTC, round-trip format: keep sub-millisecond precision for PID identity.
  created: string;
  image: string | null;
  workingSet: number;
}

/** Windows retains a dead parent's PID, which may now name a younger process. */
export function ownedProcessTree(all: ProcessRecord[], root: ProcessRecord): ProcessRecord[] {
  assert.ok(all.some(p => p.pid === root.pid && p.created === root.created), "The launched process exited or its PID was reused");
  const owned = new Map([[root.pid, root]]);
  let previous: number;
  do {
    previous = owned.size;
    for (const process of all) {
      const parent = owned.get(process.parentPid);
      if (parent && process.created >= parent.created) owned.set(process.pid, process);
    }
  } while (owned.size !== previous);
  return [...owned.values()];
}

interface Listener { pid: number; address: string }

export function ownedListeners(owned: ProcessRecord[], after: ProcessRecord[], listeners: Listener[]): string[] {
  const identities = new Map(owned.map(p => [p.pid, p.created]));
  return listeners.filter(listener => {
    const created = identities.get(listener.pid);
    if (!created) return false;
    // Do not silently accept a port attributed to a PID that changed during sampling.
    assert.ok(after.some(p => p.pid === listener.pid && p.created === created), "A TCP owner exited or its PID was reused during sampling");
    return true;
  }).map(listener => listener.address);
}

/** One frozen process enumeration, with identity confirmation after querying ports. */
export function processTree(pid: number, exe: string, started: number, spawned: number) {
  const script = `$ErrorActionPreference = 'Stop'; ` +
    `function Snapshot { @(Get-CimInstance Win32_Process | ForEach-Object { ` +
    `@{ pid = [int]$_.ProcessId; parentPid = [int]$_.ParentProcessId; ` +
    `created = $_.CreationDate.ToUniversalTime().ToString('o'); image = $_.ExecutablePath; workingSet = [double]$_.WorkingSetSize } }) }; ` +
    `$all = @(Snapshot); ` +
    `$listeners = @(Get-NetTCPConnection -State Listen -ErrorAction Stop | ForEach-Object { ` +
    `@{ pid = [int]$_.OwningProcess; address = $_.LocalAddress + ':' + $_.LocalPort } }); ` +
    `$after = @(Snapshot); ConvertTo-Json -Depth 4 -Compress @{ all = $all; after = $after; listeners = $listeners }`;
  const snapshot = JSON.parse(execFileSync("powershell", ["-NoProfile", "-Command", script], { encoding: "utf8" })) as {
    all: ProcessRecord[]; after: ProcessRecord[]; listeners: Listener[];
  };
  const root = snapshot.all.find(p => p.pid === pid);
  assert.ok(root, "The launched process is missing from the snapshot");
  assert.equal(root.image?.toLowerCase(), path.resolve(exe).toLowerCase(), "The root PID does not name the launched executable");
  assert.ok(Date.parse(root.created) >= started && Date.parse(root.created) <= spawned, "The root PID was reused after launch");
  assert.ok(snapshot.after.some(p => p.pid === root.pid && p.created === root.created), "The launched process exited during sampling");
  const owned = ownedProcessTree(snapshot.all, root);
  return {
    processes: owned.length,
    listening: ownedListeners(owned, snapshot.after, snapshot.listeners),
    workingSetMb: Math.round(owned.reduce((sum, p) => sum + p.workingSet, 0) / 1024 / 1024),
    identities: owned,
  };
}
