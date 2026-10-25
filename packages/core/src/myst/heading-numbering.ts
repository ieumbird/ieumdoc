import { defaultHeadingNumbering, type HeadingNumbering } from "../numbering.ts";
import { FRONT_MATTER_FIELD } from "./parse.ts";
import { cloneDocument, type MystDocument } from "./tree.ts";
import { serializeFor } from "./serialize.ts";
import { metadata } from "./metadata.ts";

/** Native v1 has one numbering policy: H1 title, H2-H6 sections. */
export function getHeadingNumbering(document: MystDocument): HeadingNumbering | undefined {
  // Internal fragment projections have no document settings.
  if (document.children[0]?.[FRONT_MATTER_FIELD] !== true) return undefined;
  const { yaml } = metadata(document);
  return defaultHeadingNumbering(yaml.getIn(["numbering", "headings"]) === true) ?? undefined;
}

export function updateHeadingNumbering(document: MystDocument, enabled: boolean): MystDocument {
  if (typeof enabled !== "boolean") throw new Error("heading numbering must be true or false");
  const next = cloneDocument(document);
  const { node, yaml } = metadata(next);
  yaml.setIn(["numbering", "headings"], enabled);
  yaml.setIn(["numbering", "title"], false);
  node.value = String(yaml).trimEnd();
  serializeFor(next, "heading numbering cannot be preserved through canonical round-trip");
  return next;
}
