import type { NodePath } from "../document.ts";
import { labelIdentifier, referenceTargetIndex, resolveReference } from "./label.ts";
import { parse } from "./parse.ts";
import { serializeFor } from "./serialize.ts";
import { getNode, type MystDocument, type MystNode } from "./tree.ts";

/** Atomic opt-in around the existing label edit; all resolution stays at the MyST boundary. */
export function renameLabelReferences(document: MystDocument, path: NodePath, label: string,
  changeLabel: () => MystDocument): MystDocument {
  const current = getNode(document, path);
  if (typeof current.label !== "string" || !current.label || !label) {
    throw new Error("updating references requires an existing non-empty label and a non-empty new label");
  }
  const targetPath = current.type === "mystTarget" ? [path[0] + 1] : path;
  if (current.type === "mystTarget" && document.children[targetPath[0]]?.type !== "heading") {
    throw new Error("updating references requires a section target immediately before a heading");
  }
  const before = referenceTargetIndex(document);
  const oldIdentifier = labelIdentifier(current.label);
  const oldTarget = oldIdentifier ? before.lookup(oldIdentifier) : undefined;
  const targetKey = targetPath.join(".");
  if (!oldIdentifier || !oldTarget?.node || before.candidates(oldIdentifier).length !== 1 ||
      before.path(oldTarget.node)?.join(".") !== targetKey) {
    throw new Error("ambiguous target: the old label must resolve uniquely to the selected target");
  }
  // A conflict in the original snapshot must not be hidden by changing the selected label.
  const identifier = labelIdentifier(label);
  if (identifier && before.candidates(identifier).some(node => before.path(node)?.join(".") !== targetKey)) {
    throw new Error(`label ${JSON.stringify(label)} already names another target (including implicit heading IDs)`);
  }
  // Do not accidentally repair an unsupported old notation by replacing its label.
  serializeFor(document, "reference notation cannot be rewritten while preserving meaning");
  const next = changeLabel();
  const references: { path: NodePath; target?: string }[] = [];
  const visit = (node: MystNode, at: NodePath) => {
    if (node.type === "crossReference" ||
        node.type === "link" && typeof node.url === "string" && node.url.startsWith("#")) {
      const resolved = resolveReference(node, before.lookup);
      const resolvedPath = resolved?.node ? before.path(resolved.node) : undefined;
      if (resolved && !resolvedPath) throw new Error("ambiguous target: reference has no snapshot locator");
      if (resolved?.node === oldTarget.node) {
        const reference = getNode(next, at);
        if (node.type === "crossReference") {
          reference.label = label;
          reference.identifier = identifier;
        } else reference.url = `#${label}`;
      }
      references.push({ path: at, target: resolvedPath?.join(".") });
    }
    node.children?.forEach((child, index) => visit(child, [...at, index]));
  };
  document.children.forEach((node, index) => visit(node, [index]));
  const after = referenceTargetIndex(next);
  const newTarget = identifier ? after.lookup(identifier) : undefined;
  if (!identifier || after.candidates(identifier).length !== 1 ||
      !newTarget?.node || after.path(newTarget.node)?.join(".") !== targetKey) {
    throw new Error("ambiguous target: the new label does not resolve uniquely to the selected target");
  }
  for (const reference of references) {
    const resolved = resolveReference(getNode(next, reference.path), after.lookup);
    const key = resolved?.node ? after.path(resolved.node)?.join(".") : undefined;
    if (key !== reference.target) {
      throw new Error("rename would change resolution of an unrelated or previously unresolved reference");
    }
  }
  const failure = "reference notation cannot be rewritten while preserving meaning";
  const markdown = serializeFor(next, failure);
  if (serializeFor(parse(markdown), failure) !== markdown) throw new Error(failure);
  return next;
}
