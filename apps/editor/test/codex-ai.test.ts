// SPIKE: Codex app-server client and `/api/ai/*` routes against a fake app-server.
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";
import { AI_MODEL, CodexAppServer, LineDecoder, encodeMessage, type RpcMessage, type Transport } from "../server/ai/codex-app-server.ts";
import { startHttpHost } from "../server/http-host.ts";

test("app-server framing is newline-delimited JSON without a jsonrpc field, across chunk boundaries", () => {
  const seen: RpcMessage[] = [];
  const invalid: string[] = [];
  const decoder = new LineDecoder(message => seen.push(message), line => invalid.push(line));
  const wire = encodeMessage({ id: 1, result: { text: "한글 ✓" } }) + encodeMessage({ method: "x" });
  assert.equal(wire.includes("jsonrpc"), false);
  const bytes = Buffer.from(wire + "not json\n");
  for (let index = 0; index < bytes.length; index += 3) decoder.push(bytes.subarray(index, index + 3));
  assert.deepEqual(seen, [{ id: 1, result: { text: "한글 ✓" } }, { method: "x" }]);
  assert.deepEqual(invalid, ["not json"]);
});

/** An in-process fake app-server: answers requests with `reply` and records client messages. */
function fakeTransport(reply: (message: RpcMessage, send: (message: RpcMessage) => void) => void) {
  const stdin = new PassThrough(), stdout = new PassThrough();
  const sent: RpcMessage[] = [];
  const transport = Object.assign(new EventEmitter(), { stdin, stdout, kill: () => transport.emit("exit", null) }) as unknown as Transport & EventEmitter;
  const send = (message: RpcMessage) => stdout.write(encodeMessage(message));
  const decoder = new LineDecoder(message => { sent.push(message); reply(message, send); });
  stdin.on("data", chunk => decoder.push(chunk));
  return { transport, sent, send };
}

test("the client initializes once, correlates responses, forwards notifications and declines approvals", async () => {
  let starts = 0;
  const fake = fakeTransport((message, send) => {
    if (message.method === "initialize") send({ id: message.id!, result: { userAgent: "fake" } });
    if (message.method === "echo") send({ id: message.id!, result: message.params });
    if (message.method === "boom") send({ id: message.id!, error: { code: 1, message: "bad" } });
  });
  const client = new CodexAppServer({ start: () => { starts++; return fake.transport; } });
  const notes: [string, unknown][] = [];
  client.on("notification", (method, params) => notes.push([method, params]));
  const [a, b] = await Promise.all([client.request("echo", { n: 1 }), client.request("echo", { n: 2 })]);
  assert.deepEqual([a, b], [{ n: 1 }, { n: 2 }]);
  await assert.rejects(client.request("boom", {}), /bad/);
  assert.equal(starts, 1);
  assert.deepEqual(fake.sent.slice(0, 2).map(message => message.method), ["initialize", "initialized"]);
  fake.send({ method: "item/agentMessage/delta", params: { delta: "hi" } });
  fake.send({ id: 99, method: "item/commandExecution/requestApproval", params: {} });
  fake.send({ id: 100, method: "item/tool/requestUserInput", params: {} });
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.deepEqual(notes, [["item/agentMessage/delta", { delta: "hi" }]]);
  assert.deepEqual(fake.sent.find(message => message.id === 99), { id: 99, result: { decision: "decline" } });
  assert.equal(fake.sent.find(message => message.id === 100)?.error?.code, -32601);
  const pending = client.request("never", {});
  await new Promise(resolve => setTimeout(resolve, 10));
  client.close();
  await assert.rejects(pending, /stopped/);
});

const FAKE_APP_SERVER = String.raw`#!/usr/bin/env node
if (process.argv[2] === "--version") { console.log("codex-cli 9.9.9"); process.exit(0); }
const log = require("node:fs");
const send = message => process.stdout.write(JSON.stringify(message) + "\n");
let buffer = "";
process.stdin.on("data", chunk => {
  buffer += chunk;
  let index;
  while ((index = buffer.indexOf("\n")) >= 0) {
    const message = JSON.parse(buffer.slice(0, index)); buffer = buffer.slice(index + 1);
    log.appendFileSync(process.env.FAKE_LOG, JSON.stringify(message) + "\n");
    const { id, method, params } = message;
    if (method === "initialize") send({ id, result: {} });
    else if (method === "account/read") send({ id, result: { account: { type: "chatgpt", email: "hidden@example.com", planType: "plus" } } });
    else if (method === "model/list") send({ id, result: { data: [{ id: "other-model", model: "other-model" }, { id: process.env.FAKE_MODEL, model: process.env.FAKE_MODEL }], nextCursor: null } });
    else if (method === "thread/start") send({ id, result: { thread: { id: "t1" } } });
    else if (method === "turn/start") {
      send({ id, result: { turn: { id: "u1" } } });
      send({ method: "item/agentMessage/delta", params: { threadId: "t1", turnId: "u1", itemId: "m1", delta: "See " } });
      send({ method: "item/agentMessage/delta", params: { threadId: "t1", turnId: "u1", itemId: "m1", delta: "[A](a.md#Title)." } });
      send({ method: "item/completed", params: { threadId: "t1", turnId: "u1", item: { type: "agentMessage", id: "m1", text: "See [A](a.md#Title)." } } });
      send({ method: "turn/completed", params: { threadId: "t1", turn: { id: "u1", status: "completed", error: null } } });
    }
  }
});
`;

test("/api/ai routes report status and stream a read-only turn with the fixed model only", async t => {
  const base = fs.mkdtempSync(path.join(tmpdir(), "ieumdoc-ai-"));
  const root = path.join(base, "docs"), editorDir = path.join(base, "editor"), bin = path.join(base, "codex"), log = path.join(base, "log.ndjson");
  fs.mkdirSync(root); fs.mkdirSync(editorDir);
  fs.writeFileSync(path.join(root, "a.md"), "# Title\n\nAlpha.\n");
  fs.writeFileSync(path.join(editorDir, "index.html"), "<!doctype html>");
  fs.writeFileSync(bin, FAKE_APP_SERVER, { mode: 0o755 });
  const saved = { ...process.env };
  Object.assign(process.env, { IEUMDOC_CODEX_BIN: bin, FAKE_LOG: log, FAKE_MODEL: AI_MODEL });
  const host = await startHttpHost({ editorDir, roots: [root], port: 0, ai: true });
  const disabled = await startHttpHost({ editorDir, roots: [root], port: 0 });
  t.after(async () => { process.env = saved; await host.close(); await disabled.close(); fs.rmSync(base, { recursive: true, force: true }); });

  assert.deepEqual(await (await fetch(`${disabled.url}/api/ai/status`)).json(), { enabled: false });
  assert.equal((await fetch(`${disabled.url}/api/ai/turn`, { method: "POST", headers: { Origin: disabled.url, "Content-Type": "application/json" }, body: "{}" })).status, 404);

  const status = await (await fetch(`${host.url}/api/ai/status`)).json();
  assert.deepEqual(status, { enabled: true, installed: true, version: "9.9.9", loggedIn: true, authMethod: "chatgpt", model: AI_MODEL, modelLabel: "GPT Luna", modelAvailable: true });

  const response = await fetch(`${host.url}/api/ai/turn`, {
    method: "POST", headers: { Origin: host.url, "Content-Type": "application/json" },
    body: JSON.stringify({ session: "tab-1", root, path: path.join(root, "a.md"), question: "What is A?", documentText: "Title\n\nAlpha.", selection: "Alpha." }),
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /ndjson/);
  const events = (await response.text()).trim().split("\n").map(line => JSON.parse(line));
  assert.deepEqual(events.map(event => event.type), ["started", "delta", "delta", "message", "done"]);
  assert.equal(events.at(-1).status, "completed");

  const messages = fs.readFileSync(log, "utf8").trim().split("\n").map(line => JSON.parse(line));
  const thread = messages.find(message => message.method === "thread/start");
  assert.equal(thread.params.sandbox, "read-only");
  assert.equal(thread.params.approvalPolicy, "never");
  assert.equal(thread.params.cwd, fs.realpathSync(root));
  const turn = messages.find(message => message.method === "turn/start");
  assert.equal(turn.params.model, AI_MODEL);
  assert.match(turn.params.input[0].text, /Current document: a\.md[\s\S]*Selected text[\s\S]*Alpha\.[\s\S]*What is A\?/);
  assert.ok(messages.every(message => message.params?.model === undefined || message.params.model === AI_MODEL));

  const outside = await fetch(`${host.url}/api/ai/turn`, {
    method: "POST", headers: { Origin: host.url, "Content-Type": "application/json" },
    body: JSON.stringify({ session: "tab-2", root: base, question: "?" }),
  });
  assert.equal(outside.status, 403);
});

test("a missing fixed model refuses the turn instead of falling back", async t => {
  const base = fs.mkdtempSync(path.join(tmpdir(), "ieumdoc-ai-"));
  const root = path.join(base, "docs"), editorDir = path.join(base, "editor"), bin = path.join(base, "codex"), log = path.join(base, "log.ndjson");
  fs.mkdirSync(root); fs.mkdirSync(editorDir);
  fs.writeFileSync(path.join(editorDir, "index.html"), "<!doctype html>");
  fs.writeFileSync(bin, FAKE_APP_SERVER, { mode: 0o755 });
  const saved = { ...process.env };
  Object.assign(process.env, { IEUMDOC_CODEX_BIN: bin, FAKE_LOG: log, FAKE_MODEL: "not-luna" });
  const host = await startHttpHost({ editorDir, roots: [root], port: 0, ai: true });
  t.after(async () => { process.env = saved; await host.close(); fs.rmSync(base, { recursive: true, force: true }); });
  assert.equal((await (await fetch(`${host.url}/api/ai/status`)).json()).modelAvailable, false);
  const response = await fetch(`${host.url}/api/ai/turn`, {
    method: "POST", headers: { Origin: host.url, "Content-Type": "application/json" },
    body: JSON.stringify({ session: "tab-1", root, question: "?" }),
  });
  assert.equal(response.status, 503);
  const methods = fs.readFileSync(log, "utf8").trim().split("\n").map(line => JSON.parse(line).method);
  assert.equal(methods.includes("thread/start") || methods.includes("turn/start"), false);
});

test("answer citations become document links; other links stay text", async () => {
  const { answerParts, joinDocumentPath } = await import("../src/ai.ts");
  assert.deepEqual(answerParts("See [Intro](notes/a%20b.md#Getting%20started) and [web](https://x.dev)."), [
    { text: "See " },
    { text: "Intro", target: "notes/a%20b.md#Getting%20started", path: "notes/a b.md", anchor: "Getting started" },
    { text: " and " }, { text: "[web](https://x.dev)" }, { text: "." },
  ]);
  assert.equal(joinDocumentPath("/docs/", "./notes/a.md"), "/docs/notes/a.md");
  assert.equal(joinDocumentPath("C:\\docs", "notes/a.md"), "C:\\docs\\notes\\a.md");
});

test("citations may carry raw spaces in their heading anchors", async () => {
  const { answerParts } = await import("../src/ai.ts");
  assert.deepEqual(answerParts("[A](a.md#11 kW 설계)")[0], { text: "A", target: "a.md#11 kW 설계", path: "a.md", anchor: "11 kW 설계" });
});
