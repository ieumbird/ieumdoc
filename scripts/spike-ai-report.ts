// Manual spike harness, never part of the ordinary test suite. No installation or global configuration.
import fs from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { startHttpHost } from "../apps/editor/server/http-host.ts";
import { CodexAppServer } from "../apps/editor/server/ai/codex-app-server.ts";
import { sandboxPolicy } from "../apps/editor/server/ai/ai-api.ts";

const base = path.resolve(process.env.IEUMDOC_AI_EVIDENCE ?? path.join(tmpdir(), "ieumdoc-ai-report-1028"));
const root = path.join(base, "scratch"); const output = path.join(root, "reports");
for (const dir of [root, output, path.join(base, "captures")]) fs.mkdirSync(dir, { recursive: true });
for (const file of ["technical-document.md", "diagram.svg"]) fs.copyFileSync(path.join("apps/editor/document", file), path.join(root, file));
fs.writeFileSync(path.join(root, "converter-spec.md"), "---\nieumdoc: 1\n---\n\n# Converter specification (synthetic fixture)\n\nRated power is 6600 W. Grid RMS voltage is 220 V. DC link target is 400 V. Current command follows i = P / V. Control sequence: power command, current reference, PI current controller, PWM, converter plant.\n");
fs.writeFileSync(path.join(root, "test-results.md"), "---\nieumdoc: 1\n---\n\n# Test results (synthetic fixture)\n\nAt 3300 W: measured efficiency 94.2 percent, THD 5.1 percent. At 6600 W: measured efficiency 95.4 percent, THD 4.8 percent. Acceptance THD limit is 4.5 percent. Both THD results exceed the target; do not claim compliance. Values are synthetic demonstration data, not real product measurements.\n");

if (process.argv[2] === "models") {
  const codex = new CodexAppServer();
  try {
    const models = [];
    let cursor: string | null = null;
    do {
      const result = await codex.request("model/list", { includeHidden: true, cursor });
      models.push(...result.data); cursor = result.nextCursor;
    } while (cursor);
    fs.writeFileSync(path.join(base, "model-catalog.json"), JSON.stringify(models, null, 2));
    console.log(JSON.stringify(models.filter(model => /luna/i.test(JSON.stringify(model))), null, 2));
  } finally { codex.close(); }
} else if (process.argv[2] === "probe") {
  const codex = new CodexAppServer();
  try {
    const { account } = await codex.request("account/read", {});
    const models = await codex.request("model/list", { includeHidden: true });
    console.log(JSON.stringify({ version: await codex.version(), auth: account?.type, models: models.data.map((m: any) => m.id) }));
    // Synthetic sentinels only. Never probe user/private data or mutate outside the scratch evidence.
    const outside = path.join(base, "outside-read-sentinel.txt"); fs.writeFileSync(outside, "IEUMDOC_OUTSIDE_READ_SENTINEL");
    const denied = path.join(root, "outside-write-probe.txt");
    const probes: Record<string, unknown> = {};
    for (const [name, script] of [
      ["outsideRead", `Get-Content -LiteralPath '${outside.replaceAll("'", "''")}'`],
      ["outsideWrite", `Set-Content -LiteralPath '${denied.replaceAll("'", "''")}' -Value unexpected -ErrorAction Stop`],
      ["network", "try { (Invoke-WebRequest 'https://example.com' -TimeoutSec 10).StatusCode } catch { Write-Error $_; exit 1 }"],
    ]) {
      try { probes[name] = await codex.request("command/exec", { command: ["powershell.exe", "-NoProfile", "-Command", script], cwd: output, sandboxPolicy: sandboxPolicy(output), timeoutMs: 20000 }); }
      catch (error) { probes[name] = { error: String(error) }; }
    }
    const schemaProbe = { ...sandboxPolicy(output), readOnlyAccess: { type: "restricted", includePlatformDefaults: true, readableRoots: [root] } };
    try { probes.restrictedRead = await codex.request("command/exec", { command: ["powershell.exe", "-NoProfile", "-Command", `Get-Content -LiteralPath '${outside.replaceAll("'", "''")}'`], cwd: output, sandboxPolicy: schemaProbe, timeoutMs: 20000 }); }
    catch (error) { probes.restrictedRead = { error: String(error) }; }
    fs.writeFileSync(path.join(base, "sandbox-probe.json"), JSON.stringify({ probes, outsideWriteExists: fs.existsSync(denied), policy: sandboxPolicy(output) }, null, 2));
    console.log(JSON.stringify(probes, null, 2));
  } finally { codex.close(); }
} else if (process.argv[2] === "profile-probe") {
  const normalized = (file: string) => file.replaceAll("\\", "/");
  const filesystem = `permissions.ieumdoc-spike.filesystem={\":root\"=\"deny\",\":minimal\"=\"read\",${JSON.stringify(normalized(root))}=\"read\",${JSON.stringify(normalized(output))}=\"write\"}`;
  const codex = new CodexAppServer({ args: ["-c", filesystem, "-c", "permissions.ieumdoc-spike.network.enabled=false"] });
  const results: Record<string, unknown> = {};
  try {
    results.profiles = await codex.request("permissionProfile/list", { cwd: output });
    for (const [name, script] of [
      ["insideRead", `Get-Content -LiteralPath '${path.join(root, "converter-spec.md")}'`],
      ["outsideRead", `Get-Content -LiteralPath '${path.join(base, "outside-read-sentinel.txt")}'`],
      ["insideWrite", `Set-Content -LiteralPath '${path.join(output, "profile-write.txt")}' -Value allowed -ErrorAction Stop`],
    ]) {
      try { results[name] = await codex.request("command/exec", { command: ["powershell.exe", "-NoProfile", "-Command", script], cwd: output, permissionProfile: "ieumdoc-spike", timeoutMs: 20000 }); }
      catch (error) { results[name] = { error: String(error) }; }
    }
    fs.writeFileSync(path.join(base, "permission-profile-probe.json"), JSON.stringify(results, null, 2)); console.log(JSON.stringify(results, null, 2));
  } finally { codex.close(); }
} else {
  const host = await startHttpHost({ roots: [root], editorDir: path.resolve("apps/editor/dist"), port: 5198, ai: true,
    aiObserver: event => fs.appendFileSync(path.join(base, "events.ndjson"), JSON.stringify({ at: new Date().toISOString(), ...event }) + "\n") });
  console.log(JSON.stringify({ url: host.url, root, output, pid: process.pid }));
  fs.writeFileSync(path.join(base, "host.json"), JSON.stringify({ pid: process.pid, url: host.url, root, output }));
  const stop = () => {
    clearInterval(stopWatch);
    void host.close().then(() => { process.stdin.pause(); console.log("Host and Codex closed."); });
  };
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, stop);
  process.stdin.on("data", data => { if (String(data).trim() === "stop") stop(); });
  const stopFile = path.join(base, "stop-host");
  fs.rmSync(stopFile, { force: true });
  const stopWatch = setInterval(() => {
    if (!fs.existsSync(stopFile)) return;
    stop();
  }, 250);
}
