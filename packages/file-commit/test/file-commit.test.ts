import assert from "node:assert/strict";
import fs, { chmodSync, lstatSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { commitFile, decodeUtf8, preflightFileCommit, textRevision } from "../src/index.ts";

// A partial temporary write and a change found just before the rename are exercised through
// the Editor Host's save tests; these cover the remaining file properties and failures.

const ORIGINAL = "Original.\n";

test("UTF-8 decoding rejects malformed bytes and preserves valid text including BOM", () => {
  for (const bytes of [[0xff], [0x80], [0xc0, 0xaf], [0xe2, 0x82], [0xed, 0xa0, 0x80], [0xf4, 0x90, 0x80, 0x80]]) {
    assert.throws(() => decodeUtf8(Uint8Array.from(bytes)), /Invalid UTF-8/);
  }
  const source = "\uFEFF한글 😀 �\r\n";
  assert.equal(decodeUtf8(Buffer.from(source)), source);
});

test("preflight and commit refuse invalid Unicode and detect raw-byte changes hidden by lossy decoding", () => {
  withFile((dir, file) => {
    for (const invalid of ["\uD800", "\uDC00"]) {
      assert.throws(() => preflightFileCommit(file, invalid, textRevision(ORIGINAL)), /Invalid Unicode/);
      assert.throws(() => commitFile(file, invalid, textRevision(ORIGINAL)), /Invalid Unicode/);
      assert.equal(readFileSync(file, "utf8"), ORIGINAL);
      assert.deepEqual(readdirSync(dir), ["document.md"]);
    }
    const malformed = Buffer.from([0xff]);
    writeFileSync(file, malformed);
    assert.throws(() => preflightFileCommit(file, "Changed", textRevision("�")), /changed after it was read/);
    assert.throws(() => commitFile(file, "Changed", textRevision("�")), /changed after it was read/);
    assert.deepEqual(readFileSync(file), malformed);
    assert.deepEqual(readdirSync(dir), ["document.md"]);
    const valid = "\uFEFF한글 😀 �\n";
    writeFileSync(file, valid);
    assert.deepEqual(preflightFileCommit(file, valid + "Again\n", textRevision(valid)), {
      target: fs.realpathSync(file), mode: statSync(file).mode,
    });
    assert.equal(decodeUtf8(readFileSync(file)), valid);
    commitFile(file, valid + "Again\n", textRevision(valid));
    assert.equal(decodeUtf8(readFileSync(file)), valid + "Again\n");
  });
});

function withFile(run: (dir: string, file: string) => void): void {
  const dir = mkdtempSync(path.join(tmpdir(), "litzio-file-commit-"));
  const file = path.join(dir, "document.md");
  writeFileSync(file, ORIGINAL);
  try {
    run(dir, file);
  } finally {
    chmodSync(file, 0o644);
    rmSync(dir, { recursive: true, force: true });
  }
}

test("a failed rename keeps the original and removes the temporary file", (context) => {
  withFile((dir, file) => {
    context.mock.method(fs, "renameSync", () => { throw new Error("rename refused"); });
    assert.throws(() => commitFile(file, "Changed.\n", textRevision(ORIGINAL)), /rename refused/);
    context.mock.restoreAll();
    assert.equal(readFileSync(file, "utf8"), ORIGINAL);
    assert.deepEqual(readdirSync(dir), ["document.md"]);
  });
});

test("a symlinked document stays a link and its target is replaced", (context) => {
  withFile((dir, file) => {
    const link = path.join(dir, "link.md");
    try {
      symlinkSync(file, link);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EPERM") return context.skip("file symlinks need extra permission here");
      throw error;
    }
    assert.equal(preflightFileCommit(link, "Changed.\n", textRevision(ORIGINAL)).target, fs.realpathSync(file));
    assert.equal(readFileSync(file, "utf8"), ORIGINAL);
    commitFile(link, "Changed.\n", textRevision(ORIGINAL));
    assert.equal(lstatSync(link).isSymbolicLink(), true);
    assert.equal(readFileSync(file, "utf8"), "Changed.\n");
    assert.deepEqual(readdirSync(dir).sort(), ["document.md", "link.md"]);
  });
});

test("the replacement keeps the file mode regardless of the umask", { skip: process.platform === "win32" && "POSIX modes" }, () => {
  withFile((_dir, file) => {
    chmodSync(file, 0o664);
    const umask = process.umask(0o077);
    try {
      commitFile(file, "Changed.\n", textRevision(ORIGINAL));
    } finally {
      process.umask(umask);
    }
    assert.equal(statSync(file).mode & 0o7777, 0o664);
    assert.equal(readFileSync(file, "utf8"), "Changed.\n");
  });
});

test("a read-only file is refused rather than replaced", { skip: process.getuid?.() === 0 && "root may write any file" }, () => {
  withFile((dir, file) => {
    chmodSync(file, 0o444);
    assert.throws(() => preflightFileCommit(file, "Changed.\n", textRevision(ORIGINAL)), { code: /^(EACCES|EPERM)$/ });
    assert.throws(() => commitFile(file, "Changed.\n", textRevision(ORIGINAL)), { code: /^(EACCES|EPERM)$/ });
    assert.equal(readFileSync(file, "utf8"), ORIGINAL);
    assert.deepEqual(readdirSync(dir), ["document.md"]);
  });
});
