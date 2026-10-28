// SPIKE: AI edit proposals: Core block split/compose, block hunks, partial accept and the word diff.
import assert from "node:assert/strict";
import fs from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { composeBlocks, documentBlocks } from "@ieumdoc/core";
import { textRevision } from "@ieumdoc/file-commit";
import { AI_MODEL } from "../server/ai/codex-app-server.ts";
import { applyBlockChanges, buildProposal, composeAccepted, diffBlocks } from "../server/ai/edit-proposal.ts";
import { startHttpHost } from "../server/http-host.ts";
import { acceptedHunks, diffText } from "../src/ai-review.ts";

const SOURCE = [
  "---", "ieumdoc: 1", "---", "", "# OBC", "", "Alpha beta gamma.[^n]", "", "(fig-a)=", ":::{figure} a.png", "Caption.", ":::", "",
  "$$", "x = 1", "$$", "", "| A | B |", "| - | - |", "| 1 | 2 |", "", "[^n]: Note.", "",
].join("\n");

test("Core splits a document into canonical top-level blocks and composes them back", () => {
  const blocks = documentBlocks(SOURCE);
  assert.equal(blocks[0].type, "frontmatter");
  assert.equal(blocks.at(-1)!.type, "endnotes");
  assert.match(blocks.at(-1)!.markdown, /^\[\^n\]: Note\.$/);
  assert.ok(blocks.some(block => block.markdown.startsWith(":::{figure}")));
  const canonical = composeBlocks(blocks.map(block => block.markdown));
  assert.deepEqual(documentBlocks(canonical).map(block => block.markdown), blocks.map(block => block.markdown));
});

test("block changes refer to original indexes and keep front matter and endnotes", () => {
  const blocks = ["fm", "a", "b", "c", "notes"], types = ["frontmatter", "heading", "paragraph", "paragraph", "endnotes"];
  assert.deepEqual(applyBlockChanges(blocks, types, [
    { action: "replace", block: 2, markdown: "B", reason: "" },
    { action: "insert_after", block: 3, markdown: "## Summary\n\nShort.", reason: "" },
    { action: "delete", block: 1, markdown: "", reason: "" },
  ]), ["fm", "", "B", "c", "## Summary\n\nShort.", "notes"]);
  assert.deepEqual(applyBlockChanges(blocks, types, [{ action: "insert_after", block: 4, markdown: "x", reason: "" }]), ["fm", "a", "b", "c", "x", "notes"]);
  assert.throws(() => applyBlockChanges(blocks, types, [{ action: "replace", block: 0, markdown: "x", reason: "" }]), /frontmatter/);
  assert.throws(() => applyBlockChanges(blocks, types, [{ action: "delete", block: 9, markdown: "", reason: "" }]), /does not exist/);
});

test("the block diff groups changes into hunks; any accepted subset composes", () => {
  const before = ["fm", "a", "b", "c", "d"], after = ["fm", "a", "B", "c", "d", "e", "f"];
  const hunks = diffBlocks(before, after);
  assert.deepEqual(hunks.map(hunk => [hunk.old, hunk.new]), [[[2, 3], [2, 3]], [[5, 5], [5, 7]]]);
  assert.deepEqual(composeAccepted(before, after, hunks, new Set([0, 1])), after);
  assert.deepEqual(composeAccepted(before, after, hunks, new Set()), before);
  assert.deepEqual(composeAccepted(before, after, hunks, new Set([1])), ["fm", "a", "b", "c", "d", "e", "f"]);
  assert.deepEqual(composeAccepted(before, after, hunks, new Set([0])), ["fm", "a", "B", "c", "d"]);
  assert.deepEqual(diffBlocks(["fm", "a", "b"], ["fm", "b"]).map(hunk => [hunk.old, hunk.new]), [[[1, 2], [1, 1]]]);
});

test("a proposal is validated by Core and maps change reasons to hunks", () => {
  const proposal = buildProposal(SOURCE, { summary: "s", changes: [
    { action: "replace", block: 2, markdown: "Alpha gamma.[^n]", reason: "concise" },
    { action: "insert_after", block: 2, markdown: "## Summary\n\nShort.", reason: "summary" },
  ] });
  assert.equal(proposal.hunks.length, 1);
  assert.deepEqual(proposal.hunks[0].old, [2, 3]);
  assert.deepEqual(proposal.hunks[0].new, [2, 5]);
  assert.equal(proposal.hunks[0].reason, "concise · summary");
  assert.match(proposal.markdown, /Alpha gamma\.\[\^n\]\n\n## Summary\n\nShort\./);
  assert.throws(() => buildProposal(SOURCE, { summary: "", changes: [{ action: "replace", block: 2, markdown: ":::{figure}\n", reason: "" }] }));
});

test("the word diff marks deletions before insertions and keeps shared words", () => {
  assert.deepEqual(diffText("고전압 배터리를 충전한다.", "400–800 V 고전압 배터리를 충전한다."), [
    { kind: "ins", text: "400–800 V " }, { kind: "same", text: "고전압 배터리를 충전한다." }]);
  assert.deepEqual(diffText("Q is 12.7 here", "Q is 12.0 here"), [
    { kind: "same", text: "Q is 12." }, { kind: "del", text: "7" }, { kind: "ins", text: "0" }, { kind: "same", text: " here" }]);
  const pieces = diffText("a b c d", "a x y d");
  assert.equal(pieces.filter(piece => piece.kind !== "ins").map(piece => piece.text).join(""), "a b c d");
  assert.equal(pieces.filter(piece => piece.kind !== "del").map(piece => piece.text).join(""), "a x y d");
  assert.deepEqual(acceptedHunks([{ id: 0, old: [1, 2], new: [1, 2], reason: "" }, { id: 1, old: [3, 3], new: [3, 4], reason: "" }], { 0: "accepted" }), null);
  assert.deepEqual(acceptedHunks([{ id: 0, old: [1, 2], new: [1, 2], reason: "" }, { id: 1, old: [3, 3], new: [3, 4], reason: "" }], { 0: "accepted", 1: "rejected" }), [0]);
});

const FAKE_EDIT_SERVER = String.raw`#!/usr/bin/env node
if (process.argv[2] === "--version") { console.log("codex-cli 9.9.9"); process.exit(0); }
const log = require("node:fs");
const send = message => process.stdout.write(JSON.stringify(message) + "\n");
let buffer = "";
let turns = 0;
process.stdin.on("data", chunk => {
  buffer += chunk;
  let index;
  while ((index = buffer.indexOf("\n")) >= 0) {
    const message = JSON.parse(buffer.slice(0, index)); buffer = buffer.slice(index + 1);
    log.appendFileSync(process.env.FAKE_LOG, JSON.stringify(message) + "\n");
    const { id, method } = message;
    if (method === "initialize") send({ id, result: {} });
    else if (method === "model/list") send({ id, result: { data: [{ id: process.env.FAKE_MODEL, model: process.env.FAKE_MODEL }], nextCursor: null } });
    else if (method === "thread/start") send({ id, result: { thread: { id: "t1" } } });
    else if (method === "turn/start") {
      turns++;
      const output = turns === 1
        ? { summary: "bad", changes: [{ action: "replace", block: 0, markdown: "x", reason: "" }] }
        : { summary: "Shorter.", changes: [{ action: "replace", block: 2, markdown: "Alpha.", reason: "concise" }, { action: "insert_after", block: 3, markdown: "## Summary\n\nDone.", reason: "summary" }] };
      send({ id, result: { turn: { id: "u" + turns } } });
      send({ method: "item/completed", params: { threadId: "t1", item: { type: "agentMessage", id: "m" + turns, text: JSON.stringify(output) } } });
      send({ method: "turn/completed", params: { threadId: "t1", turn: { id: "u" + turns, status: "completed", error: null } } });
    }
  }
});
`;

test("/api/ai/edit proposes Core-validated hunks; /api/ai/apply writes only accepted ones with a revision check", async t => {
  const base = fs.mkdtempSync(path.join(tmpdir(), "ieumdoc-ai-edit-"));
  const root = path.join(base, "docs"), editorDir = path.join(base, "editor"), bin = path.join(base, "codex"), log = path.join(base, "log.ndjson");
  fs.mkdirSync(root); fs.mkdirSync(editorDir);
  const file = path.join(root, "a.md");
  const source = "---\nieumdoc: 1\n---\n\n# Title\n\nAlpha beta gamma.\n\nLast.\n";
  fs.writeFileSync(file, source);
  fs.writeFileSync(path.join(editorDir, "index.html"), "<!doctype html>");
  fs.writeFileSync(bin, FAKE_EDIT_SERVER, { mode: 0o755 });
  const saved = { ...process.env };
  Object.assign(process.env, { IEUMDOC_CODEX_BIN: bin, FAKE_LOG: log, FAKE_MODEL: AI_MODEL });
  const host = await startHttpHost({ editorDir, roots: [root], port: 0, ai: true });
  t.after(async () => { process.env = saved; await host.close(); fs.rmSync(base, { recursive: true, force: true }); });
  const post = (route: string, body: object) => fetch(`${host.url}/api/ai/${route}`, { method: "POST", headers: { Origin: host.url, "Content-Type": "application/json" }, body: JSON.stringify(body) });

  assert.equal((await post("edit", { session: "s", root, path: file, revision: "stale", request: "shorter" })).status, 409);
  const response = await post("edit", { session: "s", root, path: file, revision: textRevision(source), request: "shorter" });
  const events = (await response.text()).trim().split("\n").map(line => JSON.parse(line));
  assert.deepEqual(events.map(event => event.type), ["started", "activity", "proposal", "done"]);
  const { proposal } = events[2];
  assert.equal(proposal.hunks.length, 2);
  assert.equal(proposal.proposed.blocks.length > proposal.original.blocks.length, true);
  assert.equal(fs.readFileSync(file, "utf8"), source, "nothing is written before accept");

  const messages = fs.readFileSync(log, "utf8").trim().split("\n").map(line => JSON.parse(line));
  const thread = messages.find(message => message.method === "thread/start");
  assert.deepEqual([thread.params.sandbox, thread.params.approvalPolicy, thread.params.cwd], ["read-only", "never", fs.realpathSync(root)]);
  const turns = messages.filter(message => message.method === "turn/start");
  assert.equal(turns.length, 2);
  assert.ok(turns.every(turn => turn.params.model === AI_MODEL && turn.params.outputSchema?.required.includes("changes")));
  assert.match(turns[1].params.input[0].text, /rejected by IeumDoc Core/);

  const applied = await (await post("apply", { id: proposal.id, accepted: [1] })).json();
  assert.equal(applied.written, true);
  const written = fs.readFileSync(file, "utf8");
  assert.equal(applied.revision, textRevision(written));
  assert.match(written, /Alpha beta gamma\.\n\nLast\.\n\n## Summary\n\nDone\.\n$/);
  assert.equal((await post("apply", { id: proposal.id, accepted: [0] })).status, 404, "a proposal applies once");

  const second = await post("edit", { session: "s", root, path: file, revision: textRevision(written), request: "again" });
  const next = (await second.text()).trim().split("\n").map(line => JSON.parse(line)).find(event => event.type === "proposal").proposal;
  fs.appendFileSync(file, "\nChanged elsewhere.\n");
  assert.equal((await post("apply", { id: next.id, accepted: [0] })).status, 409);
  assert.match(fs.readFileSync(file, "utf8"), /Changed elsewhere/);
});
