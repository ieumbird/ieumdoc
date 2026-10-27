export type FileOperationRequest = { root: string; path: string };
export type RenameFileRequest = FileOperationRequest & {
  /** The stem only. The Host preserves the original extension. */
  name: string;
  /** Dirty tabs in this Editor window. Applied source supplements the disk check;
   * path-only entries include unapplied property drafts. Other windows use Save conflicts. */
  openDocuments?: { path: string; source?: string }[];
};
export type FileOperationResponse = { path: string; updatedDocuments?: string[]; skippedDocuments?: string[] };

/** Shared input feedback; Host remains the authority, including on non-Windows systems. */
export function validFileStem(name: string): boolean {
  return !!name.trim() && name === name.trim() && name !== "." && name !== ".." &&
    !/[<>:"/\\|?*\u0000-\u001f\u007f]/.test(name) && !/[. ]$/.test(name) &&
    !/^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(name) &&
    !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(name);
}
