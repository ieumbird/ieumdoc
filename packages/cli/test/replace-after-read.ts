// Test-only preload: another writer replaces the document right after the CLI first reads it.
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";

const target = process.env.IEUMDOC_TEST_REPLACE_AFTER_READ;
const replacement = Buffer.from(process.env.IEUMDOC_TEST_REPLACEMENT ?? "", "base64");
const read = fs.readFileSync;
let replaced = false;
fs.readFileSync = ((...args: Parameters<typeof read>) => {
  const result = read(...args);
  if (!replaced && args[0] === target) {
    replaced = true;
    fs.writeFileSync(target, replacement);
  }
  return result;
}) as typeof read;
syncBuiltinESMExports();
