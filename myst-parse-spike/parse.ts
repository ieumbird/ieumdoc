import { readFileSync } from "node:fs";
import { mystParse } from "myst-parser";

const markdown = readFileSync(new URL("./sample.md", import.meta.url), "utf8");
const ast = mystParse(markdown);
console.log(JSON.stringify(ast, null, 2));
