import { createElement, useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import { DocumentEditor } from "../../src/DocumentEditor.tsx";
import { useDocumentSession, type DocumentSession } from "../../src/useDocumentSession.ts";

/** Real hook + editor without the shell's busy guard, to exercise replacement during a request. */
export async function mountDocumentSessionHarness() {
  const { requestDocument } = await import("../../src/document-session.ts");
  const initial = await requestDocument("GET");
  if ("start" in initial) throw new Error("Harness requires a first document");
  const file = initial;
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  let current: DocumentSession;
  function Harness() {
    const session = useDocumentSession(file);
    useLayoutEffect(() => { current = session; });
    return session.document && createElement(DocumentEditor, {
      key: session.editorGeneration,
      ref: session.editorRef,
      document: session.document,
      documentPath: session.openedPath,
      ...session.editorCallbacks,
    });
  }
  root.render(createElement(Harness));
  return { host, get current() { return current; }, destroy() { root.unmount(); host.remove(); } };
}
