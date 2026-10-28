import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { textRevision } from "@ieumdoc/file-commit";
import { getEditableDocument, parse } from "@ieumdoc/core";
import { RootAccess } from "../server/file-access.ts";
import { sandboxPolicy, verifyReport } from "../server/ai/ai-api.ts";
import { CLI_RUNNER } from "../server/ai/cli-runner.ts";
import { REPORT_OPERATIONS_EXAMPLE } from "../server/ai/report-example.ts";
import { CodexAppServer, LineDecoder, encodeMessage, requiredModel, type RpcMessage, type Transport } from "../server/ai/codex-app-server.ts";

test("the exact requested catalog model is required; other Luna versions and Sol are never fallbacks", () => {
  const models = [{ id: "gpt-5.6-luna", model: "gpt-5.6-luna", displayName: "GPT-5.6-Luna" },
    { id: "gpt-6.1-sol", model: "gpt-6.1-sol", displayName: "GPT-6.1-Sol" }];
  assert.equal(requiredModel(models), null);
  assert.equal(requiredModel([...models, { id: "gpt-6-luna", model: "gpt-6-luna", displayName: "GPT-6-Luna" }]), "gpt-6-luna");
});

test("Codex stdio frames split UTF-8, correlates requests, declines tool approvals and closes pending calls", async () => {
  const stdin = new PassThrough(), stdout = new PassThrough();
  const events = new EventEmitter();
  const transport = Object.assign(events, { stdin, stdout, kill: () => events.emit("exit", null) }) as unknown as Transport;
  const messages: RpcMessage[] = [];
  const decoder = new LineDecoder(message => {
    messages.push(message);
    if (["initialize", "echo"].includes(message.method ?? "")) {
      const bytes = Buffer.from(encodeMessage({ id: message.id!, result: message.params }));
      for (let i = 0; i < bytes.length; i++) stdout.write(bytes.subarray(i, i + 1));
    }
  });
  stdin.on("data", chunk => decoder.push(chunk));
  let starts = 0;
  const codex = new CodexAppServer({ start: () => { starts++; return transport; } });
  assert.deepEqual(await Promise.all([codex.request("echo", { text: "한글" }), codex.request("echo", { text: "✓" })]), [{ text: "한글" }, { text: "✓" }]);
  assert.equal(starts, 1);
  stdout.write(encodeMessage({ id: 99, method: "item/fileChange/requestApproval", params: {} }));
  assert.deepEqual(messages.find(message => message.id === 99)?.result, { decision: "decline" });
  const pending = codex.request("pending", {});
  await new Promise(resolve => setImmediate(resolve));
  codex.close();
  await assert.rejects(pending, /stopped/);
});

test("Host admits only CLI-created/batched revision matches, reruns check and detects a check-time race", async t => {
  const root = fs.mkdtempSync(path.join(tmpdir(), "ieumdoc-ai-verification-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, "report.md"); const source = "---\nieumdoc: 1\n---\n\n# Report\n";
  fs.writeFileSync(file, source);
  const revision = textRevision(source), access = new RootAccess([root]);
  const receipts = [{ command: "create", file, exitCode: 0 }, { command: "apply-batch", file, exitCode: 0, revision }];
  let checks = 0; const check = async () => { checks++; return { ok: true }; };
  assert.equal((await verifyReport(file, receipts, false, access, check)).revision, revision);
  assert.equal(checks, 1);
  await assert.rejects(verifyReport(file, receipts, true, access, check), /bypass/);
  await assert.rejects(verifyReport(file, [{ ...receipts[1]!, dryRun: true }], false, access, check), /No successful CLI/);
  fs.appendFileSync(file, "\nOutside CLI edit.\n");
  await assert.rejects(verifyReport(file, receipts, false, access, check), /final CLI revision differs/);
  assert.equal(checks, 1, "Mismatch must be rejected before checking or opening");
  fs.writeFileSync(file, source);
  await assert.rejects(verifyReport(file, receipts, false, access, async () => { throw new Error("Host CLI check failed"); }), /check failed/);
  await assert.rejects(verifyReport(file, receipts, false, access, async () => { fs.appendFileSync(file, "\nrace\n"); }), /during Host validation/);
  assert.deepEqual(sandboxPolicy(root), { type: "workspaceWrite", writableRoots: [root], networkAccess: false, excludeTmpdirEnvVar: true, excludeSlashTmp: true });
});

test("CLI shim delegates to the real CLI and refuses source edits and overwritten creates", t => {
  const root = fs.mkdtempSync(path.join(tmpdir(), "ieumdoc-ai-shim-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const runner = path.join(root, "runner.cjs"), target = path.join(root, "report.md"), source = path.join(root, "source.md");
  fs.writeFileSync(runner, CLI_RUNNER); fs.writeFileSync(source, "original");
  // Source entry via tsx avoids depending on a prebuilt CLI in the ordinary Editor suite.
  const repo = path.resolve(import.meta.dirname, "../../..");
  const env = { ...process.env, NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --import=${pathToFileURL(path.join(repo, "node_modules/tsx/dist/loader.mjs")).href}`,
    IEUMDOC_CLI_ENTRY: path.join(repo, "packages/cli/src/cli.ts"), IEUMDOC_AI_ROOT: root, IEUMDOC_AI_OUTPUT: root, IEUMDOC_AI_TARGET: target };
  const run = (...args: string[]) => spawnSync(process.execPath, [runner, ...args], { env, encoding: "utf8", windowsHide: true });
  const creation = run("create", target);
  assert.equal(creation.status, 0, creation.stderr);
  assert.equal(run("help", "insert-block").status, 0);
  assert.equal(run("--version").status, 0);
  const created = fs.readFileSync(target, "utf8");
  assert.equal(run("create", target).status, 1);
  assert.equal(fs.readFileSync(target, "utf8"), created);
  assert.equal(run("apply-batch", source, "--operations", "missing", "--format", "json").status, 1);
  assert.equal(fs.readFileSync(source, "utf8"), "original");
  const operations = path.join(root, "operations.json");
  fs.writeFileSync(operations, JSON.stringify([{ command: "insert-block", at: 1, content: [{ kind: "text", text: "Created through Core CLI." }] }]));
  const batch = run("apply-batch", target, "--operations", operations, "--format", "json");
  assert.equal(batch.status, 0, batch.stderr);
  const receipt = JSON.parse(batch.stdout.split(/\r?\n/).find(line => line.startsWith("IEUMDOC_RECEIPT "))!.slice(16));
  assert.equal(receipt.revision, textRevision(fs.readFileSync(target, "utf8")));
  assert.equal(run("check", target, "--format", "json").status, 0);
  // Verify exactly the generic example injected into the model, through the real shim/CLI.
  const example = path.join(root, "example.md");
  const invoke = (args: string[], input?: string) => spawnSync(process.execPath, [runner, ...args],
    { env: { ...env, IEUMDOC_AI_TARGET: example }, input, encoding: "utf8", windowsHide: true });
  assert.equal(invoke(["create", example]).status, 0);
  const empty = fs.readFileSync(example, "utf8");
  const exampleArgs = ["apply-batch", example, "--operations", "-", "--if-revision", textRevision(empty), "--format", "json"];
  const preview = invoke([...exampleArgs, "--dry-run"], JSON.stringify(REPORT_OPERATIONS_EXAMPLE));
  assert.equal(preview.status, 0, preview.stderr);
  assert.equal(fs.readFileSync(example, "utf8"), empty);
  const applied = invoke(exampleArgs, JSON.stringify(REPORT_OPERATIONS_EXAMPLE));
  assert.equal(applied.status, 0, applied.stderr);
  const checked = invoke(["check", example, "--format", "json"]);
  assert.equal(checked.status, 0, checked.stderr);
  assert.deepEqual(JSON.parse(checked.stdout.split(/\r?\n/)[0]!).references.unresolved, []);
  const references = getEditableDocument(parse(fs.readFileSync(example, "utf8"))).blocks
    .flatMap(block => "content" in block ? block.content : []).filter(item => item.kind === "reference");
  assert.deepEqual(references.map(item => [item.role, item.label]),
    [["numref", "example-table"], ["eq", "example-equation"], ["numref", "example-figure"]]);
});
