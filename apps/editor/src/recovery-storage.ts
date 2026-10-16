import type { DocumentSessionSnapshot } from "./useDocumentSession.ts";

export const RECOVERY_DAYS = 10;
export const RECOVERY_DB = "ieumdoc-recovery";
export type RecoveryRecord = {
  id: string;
  version: number;
  path: string;
  recordedAt: number;
  recoveryText: string;
  snapshot: DocumentSessionSnapshot;
};
const TICKET_LIFETIME = RECOVERY_DAYS * 86400000;
type Ticket = [number, string | null, number];
type Barrier = { generation: string; expiresAt: number };

/** getRandomValues also works on a non-localhost HTTP Host (randomUUID does not). */
export function newRecoveryId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, "0")).join("");
}

let connection: Promise<IDBDatabase> | undefined;
function database(): Promise<IDBDatabase> {
  return connection ??= new Promise<IDBDatabase>((resolve, reject) => {
    let abandoned = false;
    // v1/v2 writers may accept missing metadata; they must not reopen this protocol.
    const request = indexedDB.open(RECOVERY_DB, 3);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("records")) {
        request.result.createObjectStore("records", { keyPath: "id" });
        request.result.createObjectStore("barriers");
      } else {
        // Records survive; obsolete tombstones/watermark grant no v3 permission.
        request.transaction!.objectStore("barriers").clear();
      }
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => { abandoned = true; reject(new Error("Local recovery storage is busy in another window.")); };
    request.onsuccess = () => {
      if (abandoned) { request.result.close(); return; }
      request.result.onversionchange = () => { request.result.close(); connection = undefined; };
      resolve(request.result);
    };
  }).catch(error => { connection = undefined; throw error; });
}

async function transaction<T>(run: (records: IDBObjectStore, barriers: IDBObjectStore, done: (result: T) => void, fail: (error: unknown) => void) => void): Promise<T> {
  const db = await database();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(["records", "barriers"], "readwrite");
    let result: T;
    tx.oncomplete = () => resolve(result);
    tx.onerror = tx.onabort = () => reject(tx.error ?? new Error("Local recovery transaction failed."));
    try { run(tx.objectStore("records"), tx.objectStore("barriers"), value => { result = value; }, error => { reject(error); tx.abort(); }); }
    catch (error) { tx.abort(); reject(error); }
  });
}

function ticket(barriers: IDBObjectStore, id: string, done: (value: Ticket) => void): void {
  const all = barriers.get("all");
  const session = barriers.get(["session", id]);
  session.onsuccess = () => done([Number(all.result ?? 0), (session.result as Barrier | undefined)?.generation ?? null, Date.now()]);
}

/** Tickets are captured on an applied edit, never on a later Save or timer turn.
 * IndexedDB transactions order deletion with writes across windows, without relying on messages. */
export const recoveryStorage = {
  restore(record: RecoveryRecord, id: string): Promise<void> {
    return transaction((records, barriers, done, fail) => {
      const stored = records.get(record.id);
      stored.onsuccess = () => {
        if (JSON.stringify(stored.result) !== JSON.stringify(record)) {
          fail(new Error("This recovery record changed or was deleted. Close this dialog and review the latest record."));
          return;
        }
        try {
          barriers.delete(["session", record.id]);
          records.delete(record.id);
          records.put({ ...record, id });
          done(undefined);
        } catch (error) { fail(error); }
      };
    });
  },
  async ticket(id: string): Promise<Ticket> {
    const db = await database();
    return new Promise<Ticket>((resolve, reject) => {
      const tx = db.transaction("barriers", "readwrite");
      let result: Ticket;
      const barriers = tx.objectStore("barriers");
      const all = barriers.get("all");
      const session = barriers.get(["session", id]);
      session.onsuccess = () => {
        try {
          const previous = session.result as Barrier | undefined;
          const issuedAt = Date.now();
          const generation = previous?.generation ?? newRecoveryId();
          // A backwards clock must not shorten an earlier pending ticket's registration.
          barriers.put({ generation, expiresAt: Math.max(previous?.expiresAt ?? 0, issuedAt + TICKET_LIFETIME) } satisfies Barrier, ["session", id]);
          result = [Number(all.result ?? 0), generation, issuedAt];
        } catch (error) { reject(error); tx.abort(); }
      };
      tx.oncomplete = () => resolve(result);
      tx.onerror = tx.onabort = () => reject(tx.error ?? new Error("Local recovery ticket failed."));
    });
  },
  write(id: string, expected: Ticket, capture: () => RecoveryRecord | null | undefined): Promise<boolean> {
    return transaction((records, barriers, done, fail) => ticket(barriers, id, current => {
      let written = false;
      const age = Date.now() - expected[2];
      // Clock rollback may delay expiry, but must not drop an otherwise valid edit.
      // Deletion safety comes from nonce/global equality, including after GC.
      if (age < TICKET_LIFETIME && current[0] === expected[0] &&
          current[1] !== null && current[1] === expected[1]) {
        try {
          // Capture at the actual write turn, after all earlier transactions and barriers.
          const record = capture();
          if (record) records.put(record);
          else if (record === null) records.delete(id);
          written = record !== undefined;
        } catch (error) { fail(error); }
      }
      done(written);
    }));
  },
  delete(id?: string): Promise<void> {
    return transaction((records, barriers, done, fail) => {
      if (id !== undefined) {
        barriers.delete(["session", id]);
        records.delete(id);
        done(undefined);
        return;
      }
      const key = "all";
      const read = barriers.get(key);
      read.onsuccess = () => {
        try {
          // Global generation invalidates old tickets, so old per-session barriers can go too.
          barriers.clear();
          barriers.put(Number(read.result ?? 0) + 1, key);
          records.clear();
          done(undefined);
        } catch (error) { fail(error); }
      };
    });
  },
  list(now = Date.now()): Promise<RecoveryRecord[]> {
    return transaction((records, barriers, done, fail) => {
      const cursor = barriers.openCursor();
      cursor.onsuccess = () => {
        const entry = cursor.result;
        if (!entry) return;
        try {
          if (Array.isArray(entry.key) && (entry.value as Barrier).expiresAt <= now) entry.delete();
          entry.continue();
        } catch (error) { fail(error); }
      };
      const read = records.getAll();
      read.onsuccess = () => {
        try {
          const kept: RecoveryRecord[] = [];
          for (const record of read.result as RecoveryRecord[]) {
            if (Number.isFinite(record.recordedAt) && now - record.recordedAt >= RECOVERY_DAYS * 86400000) {
              records.delete(record.id);
              barriers.delete(["session", record.id]);
            }
            else kept.push(record);
          }
          const time = (record: RecoveryRecord) => Number.isFinite(record.recordedAt) ? record.recordedAt : 0;
          done(kept.sort((a, b) => time(b) - time(a)));
        } catch (error) { fail(error); }
      };
    });
  },
};

/** Plaintext escape hatch independent of schema/canonical validation, including atom attributes. */
export function recoveryText(snapshot: DocumentSessionSnapshot): string {
  const parts: string[] = [];
  function visit(value: unknown): void {
    if (!value || typeof value !== "object") return;
    const node = value as { text?: unknown; attrs?: Record<string, unknown>; content?: unknown[]; marks?: unknown[] };
    if (typeof node.text === "string") parts.push(node.text);
    if (node.marks?.length) parts.push(`[marks: ${JSON.stringify(node.marks)}]`);
    if (node.attrs) for (const [key, attr] of Object.entries(node.attrs)) {
      if (key !== "sourcePath" && key !== "deletedPaths" && attr !== "" && attr !== null && attr !== undefined) {
        parts.push(`[${key}: ${typeof attr === "string" ? attr : JSON.stringify(attr)}]`);
      }
    }
    if (Array.isArray(node.content)) node.content.forEach(visit);
  }
  visit(snapshot.editor.editorDocument);
  return parts.join("\n");
}

/** One recorder per mounted document session. Recovery never gates editing, Save or closing. */
export function createRecoveryRecorder(id: string, capture: () => DocumentSessionSnapshot | null, failed: (error: unknown) => void, succeeded: () => void = () => {}) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let epoch = 0;
  let permit: Promise<Ticket | null> | undefined;
  let queue = Promise.resolve();
  let failures = 0;
  let edited = false;
  const reportFailure = (error: unknown) => { failures++; failed(error); };
  const schedule = () => {
    if (timer || !permit) return;
    const current = epoch;
    timer = setTimeout(() => {
      timer = undefined;
      const allowed = permit!;
      queue = queue.then(async () => {
        const token = await allowed;
        if (!token || current !== epoch) return;
        let capturedFailures = failures;
        const written = await recoveryStorage.write(id, token, () => {
          if (current !== epoch) return undefined;
          const snapshot = capture();
          capturedFailures = failures;
          return snapshot ? { id, version: 1, path: snapshot.file.path, recordedAt: Date.now(), recoveryText: recoveryText(snapshot), snapshot } : null;
        });
        if (written && current === epoch && capturedFailures === failures) succeeded();
      }).catch(error => { if (current === epoch) reportFailure(error); });
    }, 500);
  };
  const cancel = () => { epoch++; clearTimeout(timer); timer = undefined; permit = undefined; };
  return {
    edit() {
      edited = true;
      const current = epoch;
      permit = recoveryStorage.ticket(id).catch(error => { if (current === epoch) reportFailure(error); return null; });
      schedule();
    },
    checkpoint: schedule,
    discard(): Promise<boolean> {
      cancel();
      // A never-edited recorder owns neither a ticket nor a record. Restores call edit().
      if (!edited) return Promise.resolve(true);
      const current = epoch, priorFailures = failures;
      return recoveryStorage.delete(id).then(() => {
        if (current === epoch && priorFailures === failures) succeeded();
        return true;
      }, error => { if (current === epoch) reportFailure(error); return false; });
    },
    cancel,
  };
}
