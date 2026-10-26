import assert from "node:assert/strict";
import { execFile, type ChildProcess } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

export interface ProcessRecord {
  pid: number;
  parentPid: number;
  // UTC, round-trip format: keep sub-millisecond precision for PID identity.
  created: string;
  image: string | null;
  workingSet: number;
}

/** Windows retains a dead parent's PID, which may now name a younger process. */
export function ownedProcessTree(all: ProcessRecord[], root: ProcessRecord, previous: ProcessRecord[] = []): ProcessRecord[] {
  assert.ok(all.some(p => p.pid === root.pid && p.created === root.created), "The launched process exited or its PID was reused");
  const owned = new Map([[root.pid, root]]);
  // A confirmed child stays owned while the same identity is alive, even if its
  // parent has exited or that parent's PID now names a younger process.
  const confirmed = new Map(previous.map(p => [p.pid, p.created]));
  for (const process of all) {
    if (confirmed.get(process.pid) === process.created) owned.set(process.pid, process);
  }
  let before: number;
  do {
    before = owned.size;
    for (const process of all) {
      const parent = owned.get(process.parentPid);
      if (parent && process.created >= parent.created) owned.set(process.pid, process);
    }
  } while (owned.size !== before);
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

/** Retain confirmed live identities across enumerations; sampling is not atomic. */
export async function processTree(child: ChildProcess, exe: string, previous: ProcessRecord[] = []) {
  const alive = () => assert.ok(child.pid && child.exitCode === null && child.signalCode === null && !child.killed,
    "The launched process exited; its PID cannot identify a live root");
  alive();
  const script = `$ErrorActionPreference = 'Stop'; ` +
    `function Snapshot { @(Get-CimInstance Win32_Process | ForEach-Object { ` +
    `@{ pid = [int]$_.ProcessId; parentPid = [int]$_.ParentProcessId; ` +
    `created = $_.CreationDate.ToUniversalTime().ToString('o'); image = $_.ExecutablePath; workingSet = [double]$_.WorkingSetSize } }) }; ` +
    `$all = @(Snapshot); ` +
    `$listeners = @(Get-NetTCPConnection -State Listen -ErrorAction Stop | ForEach-Object { ` +
    `@{ pid = [int]$_.OwningProcess; address = $_.LocalAddress + ':' + $_.LocalPort } }); ` +
    `$after = @(Snapshot); ConvertTo-Json -Depth 4 -Compress @{ all = $all; after = $after; listeners = $listeners }`;
  // Keep the event loop running so ChildProcess observes the original process handle's exit,
  // even if its PID is reused for the same executable while PowerShell is collecting data.
  const { stdout } = await run("powershell", ["-NoProfile", "-Command", script], { encoding: "utf8" });
  alive();
  const snapshot = JSON.parse(stdout) as {
    all: ProcessRecord[]; after: ProcessRecord[]; listeners: Listener[];
  };
  const root = snapshot.all.find(p => p.pid === child.pid);
  assert.ok(root, "The launched process is missing from the snapshot");
  assert.equal(root.image?.toLowerCase(), path.resolve(exe).toLowerCase(), "The root PID does not name the launched executable");
  assert.ok(snapshot.after.some(p => p.pid === root.pid && p.created === root.created), "The launched process exited during sampling");
  const owned = ownedProcessTree(snapshot.all, root, previous);
  const current = ownedProcessTree(snapshot.after, root, owned);
  return {
    processes: current.length,
    listening: ownedListeners(owned, snapshot.after, snapshot.listeners),
    workingSetMb: Math.round(current.reduce((sum, p) => sum + p.workingSet, 0) / 1024 / 1024),
    identities: current,
  };
}
