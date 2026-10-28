export type FileOperationRequest = { root: string; path: string };
export type RenameFileRequest = FileOperationRequest & {
  /** The stem only. The Host preserves the original extension. */
  name: string;
  /** Dirty tabs in this Editor window. Applied source supplements the disk check;
   * path-only entries include unapplied property drafts. Other windows use Save conflicts. */
  openDocuments?: { path: string; source?: string }[];
  /** Figure form's own session: only its paths change; unsaved properties stay local. */
  figureDocument?: { path: string; revision: string; source: string; imageUrl: string };
};
export type MediaReplacement = { from: string; to: string };
export type FileOperationResponse = { path: string; updatedDocuments?: string[]; skippedDocuments?: string[];
  figureDocument?: { revision: string; replacements: MediaReplacement[] } };

/** Shared input feedback; Host remains the authority, including on non-Windows systems. */
export function validFileStem(name: string): boolean {
  return !!name.trim() && name === name.trim() && name !== "." && name !== ".." &&
    !/[<>:"/\\|?*\u0000-\u001f\u007f]/.test(name) && !/[. ]$/.test(name) &&
    !/^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(name) &&
    !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(name);
}
