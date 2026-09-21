import { mystParse } from "myst-parser";
import { liftMystDirectivesAndRolesTransform } from "myst-transforms";
import type { Document } from "../document.ts";

export function parse(source: string): Document {
  const document = mystParse(source) as Document;
  liftMystDirectivesAndRolesTransform(document);
  return document;
}
