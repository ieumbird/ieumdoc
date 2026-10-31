import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PLUGIN_UI, type UiRegistration } from "@document-plugins/api/config";
import type { UiHost, UiContributions } from "@document-plugins/api/ui";
import { UiRegistry, contributionNotices, type ActiveUi } from "../src/plugin-ui-registry.ts";
import { PluginStore } from "../server/plugin-store.ts";
import { buildDoclingWorker, buildPluginUi } from "../../../packages/cli/scripts/build-docling-worker.ts";
import { createProtocolHandler, ORIGIN } from "../../desktop/src/host-protocol.ts";
import { startHttpHost } from "../server/http-host.ts";

const registration = (id = "test", revision = "a"): UiRegistration => ({ id, revision,
  ui: { api: PLUGIN_UI.api, reactMajor: PLUGIN_UI.reactMajor, script: PLUGIN_UI.script } });
const settle = () => new Promise<void>(resolve => setImmediate(resolve));
test("UI activations isolate faults, reject incompatibility before load, preserve other plugins and dispose on detach", async () => {
  let states: ActiveUi[] = [], loads: string[] = [], disposed: string[] = [], publishedWithoutOld = false, closing = false;
  const registry = new UiRegistry("19.1.1", next => { states = next; publishedWithoutOld = !next.some(item => item.id === "test"); },
    async item => {
      loads.push(item.id);
      if (item.id === "broken") throw new Error("evaluation failed");
      return { release() {}, module: { activate: () => ({ commands: [], sidebar: [], tabs: [], dispose() {
        assert.ok(closing || publishedWithoutOld); disposed.push(item.id);
      } }) } };
    }, () => ({} as UiHost), () => {});
  const good = registration(), other = registration("other"), broken = registration("broken"), incompatible = registration("incompatible");
  incompatible.ui.api = 99;
  registry.reconcile([good, other, broken, incompatible]); await settle();
  assert.deepEqual(loads, ["test", "other", "broken"]);
  assert.match(states.find(item => item.id === "broken")!.error!, /evaluation failed/u);
  assert.match(states.find(item => item.id === "incompatible")!.error!, /Incompatible/u);
  const otherActivation = states.find(item => item.id === "other")!.contributions;
  registry.reconcile([other]); await settle();
  assert.deepEqual(disposed, ["test"]);
  assert.equal(states[0]!.contributions, otherActivation);
  registry.reconcile([good, other]); await settle();
  assert.deepEqual(loads, ["test", "other", "broken", "test"]);
  closing = true; registry.close(); await settle();
  assert.deepEqual(disposed.sort(), ["other", "test", "test"]);
});
test("a late ESM load cannot revive a disabled/replaced activation; detached Host calls are rejected", async () => {
  let finish!: (value: any) => void, activated = 0, released = 0, savedGuard!: () => void;
  const registry = new UiRegistry("19.1.1", () => {}, () => new Promise(resolve => { finish = resolve; }),
    (_item, guard) => { savedGuard = guard; return {} as UiHost; }, () => {});
  const loaded = { release() { released++; }, module: { activate() { activated++; return { commands: [], sidebar: [], tabs: [], dispose() {} }; } } };
  registry.reconcile([registration()]); registry.reconcile([]); finish(loaded); await settle();
  assert.equal(activated, 0); assert.equal(released, 1);
  registry.reconcile([registration()]); finish(loaded); await settle();
  assert.equal(activated, 1); savedGuard();
  registry.reconcile([]); assert.throws(savedGuard, /disabled/u);
  registry.close();
});
test("React major mismatch and malformed activation are contribution failures", async () => {
  let states: ActiveUi[] = [], loaded = 0, disposed = 0;
  const registry = new UiRegistry("18.3.0", next => { states = next; }, async () => { loaded++; throw Error(); }, () => ({} as UiHost), () => {});
  registry.reconcile([registration()]); await settle(); assert.equal(loaded, 0); assert.match(states[0]!.error!, /React/u); registry.close();
  const invalid = new UiRegistry("19.1.1", next => { states = next; }, async () => ({ release() {}, module: { activate: () => ({
    commands: null, sidebar: [], tabs: [], dispose() { disposed++; },
  } as unknown as UiContributions) } }), () => ({} as UiHost), () => {});
  invalid.reconcile([registration()]); await settle(); assert.match(states[0]!.error!, /commands/u); assert.equal(disposed, 1); invalid.close();
  const plugin: ActiveUi = { ...registration(), contributions: { commands: [], sidebar: [], tabs: [{ id: "view", label: "View", open: async () => ({ path: "test", data: null }), View: () => null, notices() { throw Error("bad notice"); } }], dispose() {} } };
  assert.match(contributionNotices(plugin, "view", null)[0].message, /bad notice/u);
});

test("installed UI assets use identical validated routes/CSP in Desktop and independent HTTP", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "plugin-ui-"));
  const oldDirectory = process.env.IEUMDOC_PLUGINS_DIR;
  process.env.IEUMDOC_PLUGINS_DIR = path.join(root, "plugins");
  let store: PluginStore | undefined, desktop: ReturnType<typeof createProtocolHandler> | undefined, http: Awaited<ReturnType<typeof startHttpHost>> | undefined;
  t.after(async () => {
    await http?.close(); await desktop?.close(); store?.close();
    if (oldDirectory === undefined) delete process.env.IEUMDOC_PLUGINS_DIR; else process.env.IEUMDOC_PLUGINS_DIR = oldDirectory;
    rmSync(root, { recursive: true, force: true });
  });
  await buildDoclingWorker(root);
  writeFileSync(path.join(root, "index.html"), "<!doctype html><title>Host fixture</title>");
  store = new PluginStore(process.env.IEUMDOC_PLUGINS_DIR);
  const installed = store.register(path.join(root, "manifest.json"));
  desktop = createProtocolHandler(root, { samples: {} as any });
  http = await startHttpHost({ roots: [root], editorDir: root, port: 0 });
  for (const send of [(route: string) => desktop!(new Request(ORIGIN + route)), (route: string) => fetch(http!.url + route)]) {
    const list = await send(PLUGIN_UI.route); assert.equal(list.status, 200);
    assert.equal((await list.json())[0].revision, installed.revision);
    const asset = (name: string, revision = installed.revision) => PLUGIN_UI.route + "?" + new URLSearchParams({ id: "docling", revision, asset: name });
    const script = await send(asset(PLUGIN_UI.script));
    assert.equal(script.status, 200); assert.match(script.headers.get("content-type")!, /javascript/u);
    assert.equal(script.headers.get("cache-control"), "no-store");
    assert.match(script.headers.get("content-security-policy")!, /script-src 'self'/u);
    assert.equal(await script.text(), readFileSync(path.join(installed.directory, PLUGIN_UI.script), "utf8"));
    assert.match((await send(asset(PLUGIN_UI.style))).headers.get("content-type")!, /text\/css/u);
    assert.notEqual((await send(asset("../worker.cjs"))).status, 200);
    assert.notEqual((await send(asset(PLUGIN_UI.script, "old"))).status, 200);
    store.unregister("docling"); assert.notEqual((await send(asset(PLUGIN_UI.script))).status, 200);
    assert.equal(store.register(path.join(root, "manifest.json")).revision, installed.revision);
  }
  const original = readFileSync(path.join(root, "manifest.json"), "utf8");
  const manifest = JSON.parse(original); manifest.ui.api = 99;
  writeFileSync(path.join(root, "manifest.json"), JSON.stringify(manifest));
  assert.throws(() => store.register(path.join(root, "manifest.json")), /incompatible UI/u);
  assert.equal(store.list()[0].revision, installed.revision);
  writeFileSync(path.join(root, "manifest.json"), original);
  writeFileSync(path.join(installed.directory, PLUGIN_UI.script), "tampered");
  assert.throws(() => store.uiAsset("docling", installed.revision, PLUGIN_UI.script), /hash mismatch/u);
});
test("plugin UI build refuses editor internals and bundles only injected React externals", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "plugin-ui-boundary-")); t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "bad.ts"); writeFileSync(source, 'import "@tiptap/core"; export function activate() {}');
  await assert.rejects(buildPluginUi(source, root), /cannot import editor/u);
  writeFileSync(source, 'import type { Editor } from "@tiptap/core"; export function activate() {}');
  await assert.rejects(buildPluginUi(source, root), /cannot import editor/u);
  writeFileSync(source, 'import type { Editor } from "../../apps/editor/src/DocumentEditor.tsx"; export function activate() {}');
  await assert.rejects(buildPluginUi(source, root), /cannot import editor/u);
  const graph = await buildPluginUi(path.resolve("../../packages/docling/src/ui-plugin.tsx"), root);
  const external = Object.values(graph.inputs).flatMap(input => input.imports).filter(item => item.external).map(item => item.path);
  assert.deepEqual([...new Set(external)].sort(), ["react", "react/jsx-runtime"]);
});
