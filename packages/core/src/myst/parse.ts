import { mystParse } from "myst-parser";
import {
  containerChildrenTransform,
  liftMystDirectivesAndRolesTransform,
} from "myst-transforms";
import { VFile } from "vfile";
import type { MystDocument } from "./tree.ts";

export function parse(source: string): MystDocument {
  const document = mystParse(source) as MystDocument;
  liftMystDirectivesAndRolesTransform(document);
  containerChildrenTransform(document, new VFile());
  return document;
}
