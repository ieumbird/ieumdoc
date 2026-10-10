import { createLowlight } from "lowlight";
import { Plugin, PluginKey } from "@tiptap/pm/state";

export const lowlight = createLowlight();
let loading: Promise<boolean> | undefined;

function loadLanguages(): Promise<boolean> {
  return loading ??= import("./code-languages.ts").then(({ common }) => {
    lowlight.register(common);
    return true;
  }).catch(() => false); // Code and its language remain editable if highlighting cannot load.
}

/** Defer all existing languages until this editor actually contains a code block. */
export function codeHighlightingPlugin(highlightPlugin: Plugin): Plugin {
  const field = highlightPlugin.spec.state;
  if (!field || highlightPlugin.spec.view) throw new Error("The lowlight state-only plugin contract changed.");
  const refresh = new PluginKey("codeHighlightRefresh");
  const plugin: Plugin = new Plugin({
    ...highlightPlugin.spec,
    state: {
      ...field,
      apply(transaction, value, oldState, newState) {
        return transaction.getMeta(refresh)
          ? field.init.call(highlightPlugin, { schema: newState.schema }, newState)
          : field.apply.call(highlightPlugin, transaction, value, oldState, newState);
      },
    },
    view(view) {
      let requested = false;
      let destroyed = false;
      const ensureHighlights = () => {
        if (requested || lowlight.listLanguages().length > 0) return;
        let hasCode = false;
        view.state.doc.descendants(node => {
          if (node.type.name === "codeBlock") hasCode = true;
          return !hasCode;
        });
        if (!hasCode) return;
        requested = true;
        void loadLanguages().then(loaded => {
          if (!loaded || destroyed || !view.state.plugins.includes(plugin)) return;
          // The stock field ignores metadata-only transactions. Rebuild only its decorations,
          // preserving the plugin set and every other plugin's state and view lifetime.
          view.dispatch(view.state.tr.setMeta(refresh, true).setMeta("addToHistory", false));
        });
      };
      ensureHighlights();
      return { update: ensureHighlights, destroy: () => { destroyed = true; } };
    },
  });
  return plugin;
}
