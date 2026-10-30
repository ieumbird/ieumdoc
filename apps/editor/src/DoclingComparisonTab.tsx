import { memo, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { DoclingCompareView } from "@ieumdoc/docling/ui";
import type { ComparisonSnapshot } from "@ieumdoc/docling/compare";
import { Button } from "./components/ui/button.tsx";
import { ReadOnlyDocument } from "./ReadOnlyDocument.tsx";
import { i18n, type MessageKey } from "./i18n.ts";
import { EditorVisibility } from "./editor-visibility.ts";

function CompareButton(props: { children?: React.ReactNode; onClick(): void; disabled?: boolean }) {
  return <Button size="sm" variant="ghost" {...props} />;
}
const text = (key: string) => i18n.t(key as MessageKey);

export const DoclingComparisonTab = memo(function DoclingComparisonTab({ id, snapshot, active, focused, groupIndex, onFocus }: {
  id: string; snapshot: ComparisonSnapshot; active: boolean; focused: boolean; groupIndex: number; onFocus(id: string): void;
}) {
  useTranslation();
  return <div className="docling-tab" role="tabpanel" tabIndex={-1} id={`panel-${id}`} aria-labelledby={`tab-${id}`} hidden={!active} inert={!active}
    data-document-tab={id} data-active={focused ? "true" : "false"} data-visible={active ? "true" : "false"} data-group-index={groupIndex}
    style={{ "--editor-group-index": groupIndex } as CSSProperties}
    onFocusCapture={() => onFocus(id)} onPointerDownCapture={() => onFocus(id)}>
    <EditorVisibility value={active}><DoclingCompareView snapshot={snapshot} ReadingSurface={ReadOnlyDocument} Button={CompareButton} text={text}
      imageUrl={uri => `${import.meta.env.BASE_URL}document/${uri.split("/").map(encodeURIComponent).join("/")}?${new URLSearchParams({ path: snapshot.path })}`} /></EditorVisibility>
  </div>;
});
