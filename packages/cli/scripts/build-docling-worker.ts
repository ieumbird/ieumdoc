import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { PLUGIN_UI } from "@litzio/plugin-api/config";
import { parse } from "@babel/parser";

/** Include erased type imports: esbuild's runtime graph alone cannot prove the
 * public boundary. Relative UI inputs must remain inside the plugin's source. */
function checkUiSources(entry: string) {
  const sourceDirectory = path.dirname(entry);
  const root = existsSync(path.join(sourceDirectory, "../package.json")) ? path.dirname(sourceDirectory) : sourceDirectory;
  const apiSources = new Map(["ui", "config"].map(name => [`@litzio/plugin-api/${name}`, fileURLToPath(import.meta.resolve(`@litzio/plugin-api/${name}`))]));
  const roots = [root, path.dirname(apiSources.get("@litzio/plugin-api/ui")!)];
  const visited = new Set<string>();
  const visit = (file: string) => {
    if (visited.has(file)) return; visited.add(file);
    const imports = new Set<string>();
    const walk = (node: any) => {
      if (!node || typeof node !== "object") return;
      if (["ImportDeclaration", "ExportNamedDeclaration", "ExportAllDeclaration", "ImportExpression"].includes(node.type) && node.source) imports.add(node.source.value);
      if (node.type === "TSImportType") imports.add(node.argument.value);
      if (node.type === "CallExpression" && node.callee?.type === "Import") {
        if (node.arguments[0]?.type !== "StringLiteral") throw new Error("Plugin UI imports must be static.");
        imports.add(node.arguments[0].value);
      }
      for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(walk); else if (value && typeof value === "object") walk(value);
    };
    walk(parse(readFileSync(file, "utf8"), { sourceType: "module", plugins: ["typescript", "jsx"] }));
    for (const name of imports) {
      if (apiSources.has(name)) { visit(apiSources.get(name)!); continue; }
      if (/^(?:react(?:\/jsx-runtime)?|@litzio\/core(?:\/[\w-]+)?)$/u.test(name)) continue;
      if (!name.startsWith(".")) {
        if (/(?:@tiptap|prosemirror|react-dom|apps[\\/]editor|^@\/|^@litzio\/)/u.test(name)) throw new Error(`Plugin UI cannot import editor/non-public code: ${name}`);
        continue; // Type-only module data may reference Node or validation libraries.
      }
      const resolved = path.resolve(path.dirname(file), name);
      if (!roots.some(root => { const relative = path.relative(root, resolved); return !relative.startsWith("..") && !path.isAbsolute(relative); })) throw new Error(`Plugin UI cannot import editor/non-public code: ${name}`);
      if (/\.(?:css|json)$/u.test(resolved)) continue;
      const source = [resolved, resolved + ".ts", resolved + ".tsx"].find(existsSync);
      if (!source) throw new Error(`Missing UI input: ${name}`);
      visit(source);
    }
  };
  visit(entry);
}

/** Bundle trusted UI without a second React. The factory's require is lexical,
 * not eval/global state; both renderer dependencies are supplied by the Host. */
export async function buildPluginUi(entry: string, destination: string) {
  checkUiSources(entry);
  const result = await build({ entryPoints: [entry], outdir: destination, bundle: true, platform: "browser", format: "cjs",
    target: "es2022", write: false, metafile: true, jsx: "automatic", external: ["react", "react/jsx-runtime"],
    plugins: [{ name: "plugin-boundary", setup(build) {
      build.onResolve({ filter: /(?:apps[\\/]editor|@tiptap|prosemirror|react-dom|react\/jsx-dev-runtime)/ }, args => {
        throw new Error(`Plugin UI cannot import editor/renderer internals: ${args.path}`);
      });
    } }], logLevel: "warning" });
  for (const input of Object.keys(result.metafile.inputs)) if (/(?:apps[\\/]editor|@tiptap|prosemirror|node_modules[\\/]react[\\/])/u.test(input)) {
    throw new Error(`Forbidden plugin UI input: ${input}`);
  }
  const script = result.outputFiles.find(file => file.path.endsWith(".js"))!.text;
  const css = result.outputFiles.find(file => file.path.endsWith(".css"))?.text ?? "";
  mkdirSync(destination, { recursive: true });
  writeFileSync(path.join(destination, PLUGIN_UI.script), `export function activate(host) {
    const module = { exports: {} };
    const require = name => {
      if (name === "react") return host.React;
      if (name === "react/jsx-runtime") return host.jsx;
      throw new Error("Unsupported UI import: " + name);
    };
    ${script}
    return module.exports.activate(host);
  }\n`);
  writeFileSync(path.join(destination, PLUGIN_UI.style), css);
  return result.metafile;
}

/** A self-contained trusted worker, also shipped beside the relocatable CLI. */
export async function buildDoclingWorker(destination: string) {
  mkdirSync(destination, { recursive: true });
  const result = await build({
    entryPoints: [fileURLToPath(new URL("../../docling/src/worker.ts", import.meta.url))],
    bundle: true, platform: "node", format: "cjs", target: "node24", write: false,
    legalComments: "inline", logLevel: "warning",
  });
  const bytes = result.outputFiles[0].contents;
  writeFileSync(path.join(destination, "worker.cjs"), bytes);
  await buildPluginUi(fileURLToPath(new URL("../../docling/src/ui-plugin.tsx", import.meta.url)), destination);
  writeFileSync(path.join(destination, "manifest.json"), JSON.stringify({
    id: "docling", version: createHash("sha256").update(bytes).digest("hex"),
    workerApi: 1, entry: "worker.cjs",
    ui: { api: PLUGIN_UI.api, reactMajor: PLUGIN_UI.reactMajor, script: PLUGIN_UI.script, style: PLUGIN_UI.style },
  }, null, 2) + "\n");
}
