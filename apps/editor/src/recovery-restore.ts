import { getSchema } from "@tiptap/core";
import { createEditorExtensions } from "./editor-schema.tsx";
import { prepareEditorSnapshot } from "./editor-snapshot.ts";
import { toTiptapDocument } from "./tiptap-document.ts";
import type { RecoveryRecord } from "./recovery-storage.ts";
import type { DocumentSessionSnapshot } from "./useDocumentSession.ts";

export function prepareRecovery(record: RecoveryRecord): DocumentSessionSnapshot {
  if (record.version !== 1) throw new Error("This recovery format is not supported by this version of IeumDoc.");
  const snapshot = record.snapshot;
  if (typeof record.id !== "string" || !record.id || typeof record.path !== "string" || !record.path ||
      !snapshot?.file || typeof snapshot.file.source !== "string" ||
      !Array.isArray(snapshot.file.document?.blocks) ||
      !/^[a-f0-9]{64}$/.test(snapshot.file.revision) || snapshot.file.path !== record.path ||
      (snapshot.savedEdits !== undefined && (!snapshot.savedEdits || typeof snapshot.savedEdits !== "object" || Array.isArray(snapshot.savedEdits)))) {
    throw new Error("The recovery opening source or saved checkpoint is incomplete.");
  }
  const opening = toTiptapDocument(snapshot.file.document);
  const schema = getSchema(createEditorExtensions(opening, () => {}));
  return { ...structuredClone(snapshot), editor: prepareEditorSnapshot(schema, opening, snapshot.editor) };
}
