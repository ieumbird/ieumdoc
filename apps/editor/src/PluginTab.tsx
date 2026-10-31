import { Component, memo, type CSSProperties, type ReactNode } from "react";
import type { TabContent } from "@litzio/plugin-api/ui";
import type { ActiveUi } from "./plugin-ui-registry.ts";
import { EditorVisibility } from "./editor-visibility.ts";
import { i18n } from "./i18n.ts";
import { useTranslation } from "react-i18next";
import { Notice } from "./ui/primitives.tsx";

export type ContributedTab = TabContent & { id: string; plugin: string; kind: string; label: string; className?: string };
class ContributionBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  render() { return this.state.error ? <Notice tone="error" className="plugin-tab-message">{i18n.t("Plugin view failed.")}</Notice> : this.props.children; }
}
export const PluginTab = memo(function PluginTab({ tab, plugin, active, focused, groupIndex, onFocus }: {
  tab: ContributedTab; plugin?: ActiveUi; active: boolean; focused: boolean; groupIndex: number; onFocus(id: string): void;
}) {
  useTranslation();
  const View = plugin?.contributions?.tabs.find(kind => kind.id === tab.kind)?.View;
  return <div className={`plugin-tab ${tab.className ?? ""}`} role="tabpanel" tabIndex={-1} id={`panel-${tab.id}`} aria-labelledby={`tab-${tab.id}`}
    hidden={!active} inert={!active} data-document-tab={tab.id} data-active={focused ? "true" : "false"} data-visible={active ? "true" : "false"}
    data-group-index={groupIndex} style={{ "--editor-group-index": groupIndex } as CSSProperties}
    onFocusCapture={() => onFocus(tab.id)} onPointerDownCapture={() => onFocus(tab.id)}>
    {View ? <ContributionBoundary key={plugin!.revision}><EditorVisibility value={active}><View data={tab.data} /></EditorVisibility></ContributionBoundary>
      : <Notice className="plugin-tab-message">{i18n.t(plugin?.error ? "Plugin could not load." : "Plugin is disabled.")}</Notice>}
  </div>;
});
