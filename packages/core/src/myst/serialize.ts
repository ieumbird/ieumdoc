import { writeMd } from "myst-to-md";
import { VFile } from "vfile";
import { cloneDocument, type Document } from "../document.ts";

export function serialize(document: Document): string {
  const tree = cloneDocument(document);
  const file = new VFile();
  writeMd(file, tree as never);
  const markdown = String(file.result ?? "").trimEnd();
  return `${markdown}\n`;
}
