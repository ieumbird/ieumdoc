import { useCallback } from "react";
import { prepareRecovery } from "../recovery-restore.ts";
import { recoveryText, type RecoveryRecord } from "../recovery-storage.ts";
import { collectSupportedEdits, toTiptapDocument } from "../tiptap-document.ts";
import type { RecoveryPreviewResponse, SaveRequest } from "../../shared/document-protocol.ts";
import SourceCompare, { type Comparison } from "./SourceCompare.tsx";

async function compare(record: RecoveryRecord, signal: AbortSignal): Promise<Comparison> {
  let save: SaveRequest | undefined;
  let fallback = "";
  try {
    const snapshot = prepareRecovery(record);
    if (snapshot.kind === "text") {
      const response = await fetch(`${import.meta.env.BASE_URL}api/document-source?recovery=1`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: record.path }), signal,
      });
      const result: RecoveryPreviewResponse = await response.json();
      if (!response.ok || result.disk === undefined) throw new Error(result.error ?? `HTTP ${response.status}`);
      return { before: result.disk?.source ?? "", after: snapshot.text, fallback: "",
        changed: Boolean(result.disk && result.disk.revision !== snapshot.file.revision), missing: result.disk === null };
    }
    save = { path: record.path, revision: snapshot.file.revision,
      base: { source: snapshot.file.source, savedEdits: snapshot.savedEdits },
      ...collectSupportedEdits(snapshot.file.document, snapshot.editor.editorDocument) };
  } catch (error) { fallback = error instanceof Error ? error.message : String(error); }
  const response = await fetch(`${import.meta.env.BASE_URL}api/document-source?recovery=1`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: record.path, save }), signal,
  });
  const result: RecoveryPreviewResponse = await response.json();
  if (!response.ok) throw new Error(result.error ?? `HTTP ${response.status}`);
  if (result.disk === undefined) throw new Error(result.error ?? `HTTP ${response.status}`);
  fallback ||= result.error ?? "";
  let before = result.disk?.source ?? "";
  let after = result.markdown ?? record.recoveryText;
  if (fallback) {
    if (result.disk) {
      if (!result.disk.document) throw new Error(result.disk.error);
      const editorDocument = toTiptapDocument(result.disk.document);
      // Identical salvage traversal to newly recorded recovery copies; no Markdown conversion.
      before = recoveryText({ file: { path: record.path, source: result.disk.source, revision: result.disk.revision, document: result.disk.document, endnotesInPlace: true }, editor: { editorDocument, savedDocument: editorDocument } });
    }
    after = record.recoveryText;
  }
  const acknowledged = record.snapshot?.file?.revision;
  return { before, after, fallback, changed: Boolean(result.disk && acknowledged && result.disk.revision !== acknowledged), missing: result.disk === null };
}

export default function RecoveryCompare({ record }: { record: RecoveryRecord }) {
  const load = useCallback((signal: AbortSignal) => compare(record, signal), [record]);
  return <SourceCompare load={load} recovery />;
}
