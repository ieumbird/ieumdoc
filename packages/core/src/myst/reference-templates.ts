import { isMap, isScalar } from "yaml";
import { NUMBERED_KINDS, referenceTemplatesError, type ReferenceTemplates, type ReferenceTemplateUpdate } from "../numbering.ts";
import { FRONT_MATTER_FIELD } from "./parse.ts";
import { metadata } from "./metadata.ts";
import { serializeFor } from "./serialize.ts";
import { cloneDocument, type MystDocument } from "./tree.ts";

/** Read MyST's string shorthand and template-only object form. No other options are admitted. */
export function referenceTemplateValue(value: unknown): string | undefined {
  if (isScalar(value) && typeof value.value === "string") return value.value;
  if (isMap(value) && value.items.length === 1 && value.has("template")) {
    const template = value.get("template", true);
    if (isScalar(template) && typeof template.value === "string") return template.value;
  }
  return undefined;
}

export function getReferenceTemplates(document: MystDocument): ReferenceTemplates {
  if (document.children[0]?.[FRONT_MATTER_FIELD] !== true) return {};
  const { yaml } = metadata(document);
  return Object.fromEntries(NUMBERED_KINDS.flatMap(kind => {
    const template = referenceTemplateValue(yaml.getIn(["numbering", kind], true));
    return template === undefined ? [] : [[kind, template]];
  }));
}

/** Omitted keys stay unchanged; null removes a template and restores its default. */
export function updateReferenceTemplates(document: MystDocument, templates: ReferenceTemplateUpdate): MystDocument {
  const error = referenceTemplatesError(templates, true);
  if (error) throw new Error(error);
  const next = cloneDocument(document);
  const { node, yaml } = metadata(next);
  for (const kind of NUMBERED_KINDS) {
    if (!Object.hasOwn(templates, kind)) continue;
    if (templates[kind] === null) {
      if (yaml.hasIn(["numbering", kind])) yaml.deleteIn(["numbering", kind]);
    } else yaml.setIn(["numbering", kind], yaml.createNode({ template: templates[kind] }));
  }
  const numbering = yaml.get("numbering", true);
  if (isMap(numbering) && numbering.items.length === 0) yaml.delete("numbering");
  node.value = String(yaml).trimEnd();
  serializeFor(next, "reference templates cannot be preserved through canonical round-trip");
  return next;
}
