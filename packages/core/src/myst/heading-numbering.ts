import { parseDocument, isMap, Document } from "yaml";
import { VFile } from "vfile";
import { validateNumbering } from "myst-frontmatter";
import { ReferenceState } from "myst-transforms";
import type { HeadingNumbering } from "../numbering.ts";
import { FRONT_MATTER_FIELD } from "./parse.ts";
import { cloneDocument, type MystDocument } from "./tree.ts";
import { serializeFor } from "./serialize.ts";

function metadata(document: MystDocument) {
  const node = document.children[0];
  if (node?.[FRONT_MATTER_FIELD] && node[FRONT_MATTER_FIELD] !== true) throw new Error("Unclosed front matter cannot be edited");
  const yaml: Document = parseDocument(node?.[FRONT_MATTER_FIELD] === true ? String(node.value ?? "") : "");
  if (yaml.errors.length) throw new Error(`Invalid front matter: ${yaml.errors[0].message}`);
  if (yaml.contents && !isMap(yaml.contents)) throw new Error("Front matter must be a YAML mapping");
  return { node: node?.[FRONT_MATTER_FIELD] === true ? node : undefined, yaml };
}

/** Project MyST's normalized heading settings, including starts and disabled levels. */
export function getHeadingNumbering(document: MystDocument, authoringEnabled?: boolean): HeadingNumbering | undefined {
  try {
    const yaml = metadata(document).yaml;
    if (authoringEnabled !== undefined) setHeadingNumbering(yaml, authoringEnabled);
    const frontmatter = yaml.toJS() ?? {};
    const numbering = frontmatter.numbering === undefined ? undefined : validateNumbering(frontmatter.numbering, { property: "numbering", messages: {} });
    const state = new ReferenceState("document.md", { frontmatter: { ...frontmatter, numbering }, vfile: new VFile() });
    const offset = state.offset - (state.numbering.title?.enabled ? 0 : 1);
    const levels = [1, 2, 3, 4, 5, 6].map(level => state.numbering[`heading_${level + offset}`]);
    const enabled = levels.map(level => level?.enabled ?? state.numbering.all?.enabled ?? false);
    if (!enabled.some(Boolean)) return undefined;
    return { enabled, counts: [...state.targetCounts.heading], offset,
      enumerators: levels.map(level => level?.enumerator ?? state.numbering.enumerator?.enumerator ?? null) };
  } catch {
    // Malformed metadata remains preserved/read-only; it is never rewritten by a read.
    return undefined;
  }
}

/** Change only heading numbering metadata; preserve other YAML values and comments. */
export function updateHeadingNumbering(document: MystDocument, enabled: boolean): MystDocument {
  if (typeof enabled !== "boolean") throw new Error("heading numbering must be true or false");
  const next = cloneDocument(document);
  const { node, yaml } = metadata(next);
  setHeadingNumbering(yaml, enabled);
  const value = String(yaml).trimEnd();
  if (node) node.value = value;
  else next.children.unshift({ type: "code", lang: "yaml", value, [FRONT_MATTER_FIELD]: true });
  serializeFor(next, "heading numbering cannot be preserved through canonical round-trip");
  return next;
}

/** The same metadata change serves both a read-only preview and the persistent operation. */
function setHeadingNumbering(yaml: Document, enabled: boolean) {
  if (!yaml.contents) yaml.contents = yaml.createNode({});
  const numbering = yaml.get("numbering", true);
  if (numbering !== undefined && !isMap(numbering)) {
    // Expanding the boolean keeps its effect on the other target kinds.
    const value = yaml.get("numbering");
    if (typeof value !== "boolean") throw new Error("numbering must be a boolean or YAML mapping");
    yaml.set("numbering", yaml.createNode({ all: value }));
  }
  if (!yaml.has("numbering")) yaml.set("numbering", yaml.createNode({}));
  yaml.setIn(["numbering", "headings"], enabled);
  yaml.setIn(["numbering", "title"], false);
  // Explicit level overrides would otherwise defeat the requested default policy.
  for (let level = 1; level <= 6; level++) yaml.deleteIn(["numbering", `heading_${level}`]);
}
