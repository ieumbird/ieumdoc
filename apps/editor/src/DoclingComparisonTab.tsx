import { memo, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import type { ComparisonSnapshot } from "@ieumdoc/docling/compare";
import { i18n } from "./i18n.ts";
import { PluginTabBoundary, type PluginUiState } from "./plugin-ui.tsx";
import { EditorVisibility } from "./editor-visibility.ts";

export const DoclingComparisonTab = memo(function DoclingComparisonTab({ id, snapshot, plugin, active, focused, groupIndex, onFocus }: {
  id: string; snapshot: ComparisonSnapshot; plugin: PluginUiState; active: boolean; focused: boolean; groupIndex: number; onFocus(id: string): void;
}) {
  useTranslation();
  const View = plugin.contribution?.tab.View;
  return <div className="docling-tab" role="tabpanel" tabIndex={-1} id={`panel-${id}`} aria-labelledby={`tab-${id}`} hidden={!active} inert={!active}
    data-document-tab={id} data-active={focused ? "true" : "false"} data-visible={active ? "true" : "false"} data-group-index={groupIndex}
    style={{ "--editor-group-index": groupIndex } as CSSProperties}
    onFocusCapture={() => onFocus(id)} onPointerDownCapture={() => onFocus(id)}>
    <EditorVisibility value={active}>{View ? <PluginTabBoundary key={plugin.revision}><View snapshot={snapshot} /></PluginTabBoundary>
      : <p role="status" data-plugin-state={plugin.status}>{i18n.t(plugin.status === "disabled" ? "Module is disabled. Register or enable it to restore this tab."
        : plugin.status === "error" ? "Module UI failed." : "Loading module UI…")} {plugin.reason}</p>}</EditorVisibility>
  </div>;
});
