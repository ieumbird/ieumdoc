// SPIKE: Draw.io diagram files referenced by Figures. Transport only; no document semantics.
/** A Figure whose image is an editable Draw.io SVG (SVG with the diagram XML in `content`). */
export const DRAWIO_SVG = /\.drawio\.svg$/i;
export const isDrawioImage = (imageUrl: string) => DRAWIO_SVG.test(imageUrl.split(/[?#]/, 1)[0] ?? "");
/** The Draw.io action a Figure's properties popup offers: create into an empty Figure, or edit its diagram. */
export function drawioAction(imageUrl: string, available: boolean): "create" | "edit" | undefined {
  if (!available) return undefined;
  if (!imageUrl.trim()) return "create";
  return isDrawioImage(imageUrl) ? "edit" : undefined;
}

/** GET /api/drawio: whether a local Draw.io webapp is served at /drawio/ and its custom libraries. */
export type DrawioInfo = { available: boolean; libraries: { title: string; url: string }[] };
/** GET /api/drawio?documentPath=&path=: the diagram file and the revision a later write must match. */
export type DrawioFile = { svg: string; revision: string };
/** POST /api/drawio: create (no path) or replace (path + revision) a .drawio.svg beside the document. */
export type DrawioWriteRequest = { documentPath: string; svg: string; path?: string; revision?: string };
export type DrawioWriteResponse = { path: string; revision: string };
