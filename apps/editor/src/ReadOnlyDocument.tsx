import { memo } from "react";
import type { ReadingSurfaceProps } from "@ieumdoc/docling/compare";
import { DocumentEditor } from "./DocumentEditor.tsx";

const reject = () => {};

/** Thin shell adapter: the module receives the ordinary Editor's fixed Read mode. */
export const ReadOnlyDocument = memo(function ReadOnlyDocument({ document, path, onLayout, onSelection }: ReadingSurfaceProps) {
  return <div className="docling-readonly-document" data-testid="comparison-document">
    <DocumentEditor document={document} documentPath={path} readOnly onStructuralReject={reject}
      onReadingLayout={onLayout} onReadingSelection={onSelection} />
  </div>;
});
