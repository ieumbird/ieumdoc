import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { PassThrough } from "node:stream";
import { test } from "node:test";
import { windowsEnvironment } from "../src/windows-environment.ts";

test("registry values travel losslessly on stdin, with fixed argv even for long Unicode PATH", async t => {
  const calls: { args: string[]; input: string }[] = [];
  t.mock.method(childProcess, "execFile", (_exe: string, args: string[], _options: unknown, callback: Function) => {
    const stdin = new PassThrough();
    const call = { args, input: "" }; calls.push(call);
    stdin.on("data", chunk => { call.input += chunk.toString(); });
    stdin.on("finish", () => callback(null, ""));
    return { stdin };
  });
  syncBuiltinESMExports();
  try {
    const environment = windowsEnvironment();
    for (const value of ["short", 'C:\\한글 도구\\"quoted";%VAR%\\bin;;'.repeat(220)]) {
      const previous = { value, kind: "ExpandString" as const };
      const next = { ...previous, value: `${value};C:\\Litzio\\bin` };
      await environment.write(previous, next);
      const call = calls.at(-1)!;
      assert.deepEqual(JSON.parse(Buffer.from(call.input, "base64").toString("utf8")), { previous, next });
      assert.ok(call.args.join(" ").length < 16_000, "fixed script stays below CreateProcess limit");
      const script = Buffer.from(call.args.at(-1)!, "base64").toString("utf16le");
      assert.match(script, /\[Console\]::In.ReadToEnd\(\)/);
      assert.ok(!script.includes(value), "user values must never become executable code");
    }
    assert.deepEqual(calls[0]!.args, calls[1]!.args, "PATH size/content does not change argv");
  } finally { t.mock.restoreAll(); syncBuiltinESMExports(); }
});
