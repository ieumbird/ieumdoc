import { mystParse } from "myst-parser";
import {
  containerChildrenTransform,
  liftMystDirectivesAndRolesTransform,
} from "myst-transforms";
import { VFile } from "vfile";
import type { Document } from "../document.ts";

export function parse(source: string): Document {
  const document = mystParse(source) as Document;
  liftMystDirectivesAndRolesTransform(document);
  containerChildrenTransform(document, new VFile());
  return document;
}
