import { parse } from "../../src/myst/parse.ts";
import { serialize } from "../../src/myst/serialize.ts";
const src = ":::{figure}\n![a](./a.png)\n![b](./b.png)\n:::\n";
const tree = parse(src);
console.log(JSON.stringify(tree.children[0], (k, v) => k === "position" ? undefined : v));
const out = serialize(tree);
console.log(out);
console.log(JSON.stringify(parse(out).children[0], (k, v) => k === "position" ? undefined : v));
