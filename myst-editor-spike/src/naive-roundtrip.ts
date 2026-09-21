import { readFileSync, writeFileSync } from "node:fs";
import { mystParse } from "myst-parser";
import { writeMd } from "myst-to-md";
import { VFile } from "vfile";

const source = readFileSync(new URL("../sample.md", import.meta.url), "utf8");
const ast = mystParse(source);
const file = new VFile();
writeMd(file, ast);
const markdown = String(file.result ?? "");
writeFileSync(new URL("../naive-output.md", import.meta.url), `${markdown}\n`);
console.log(markdown);
console.error(file.messages);
