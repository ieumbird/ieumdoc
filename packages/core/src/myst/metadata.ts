import { DocumentDiagnosticError } from "../write-error.ts";
import { isMap, parseDocument } from "yaml";
import { FRONT_MATTER_FIELD } from "./parse.ts";
import type { MystDocument } from "./tree.ts";

/** Shared YAML document for semantic metadata edits; preserves comments and unrelated settings. */
export function metadata(document: MystDocument) {
  const node = document.children[0];
  if (node?.[FRONT_MATTER_FIELD] !== true) throw new DocumentDiagnosticError("native-metadata", "Native frontmatter is required");
  const yaml = parseDocument(String(node.value ?? ""));
  if (yaml.errors.length || !isMap(yaml.contents)) throw new DocumentDiagnosticError("native-metadata", "Invalid native frontmatter");
  return { node, yaml };
}
