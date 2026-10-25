/** Characters own the bindings; physical positions are an opaque-IME fallback only.
 * Labels and ARIA tokens derive from the same definition as the event matcher. */
const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

/** Tiptap notation also describes existing engine bindings; this does not register a key. */
export function shortcutLabel(binding: string, mac = isMac()): string {
  return binding.split("-").map(key => key === "Mod" ? (mac ? "⌘" : "Ctrl")
    : key.length === 1 ? key.toUpperCase() : key).join("+").replace("⌘+", "⌘");
}

function editorShortcut(binding: string) {
  const ariaKey = binding.split("-").map(key => key === "," ? "Comma" : key === "." ? "Period"
    : key.length === 1 ? key.toUpperCase() : key).join("+");
  return { binding, get label() { return shortcutLabel(binding); },
    aria: ariaKey.includes("Mod") ? ["Control", "Meta"].map(mod => ariaKey.replace("Mod", mod)).join(" ") : ariaKey };
}

function shortcut(code: string, key: string, virtualKey: number) {
  return {
    ...editorShortcut(`Mod-${key}`),
    matches: (event: KeyboardEvent) => {
      if (event.isComposing || !(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return false;
      // Chromium browser accelerators use the virtual key, even when an IME hides the character.
      // Accept this punctuation's VK, unspecified (0), or IME processing (229), never e.g. Zoom Out
      // (189) or French AZERTY apostrophe's digit 4 (52). Unknown native mappings fail closed.
      if (event.keyCode !== virtualKey && event.keyCode !== 0 && event.keyCode !== 229) return false;
      return event.key.toLowerCase() === key.toLowerCase() ||
        ((event.key === "Process" || event.key === "Unidentified") && event.code === code);
    },
  };
}

export const COMMAND_CENTER_SHORTCUT = shortcut("Slash", "/", 191);
export const LINK_SHORTCUT = shortcut("Quote", "'", 222);
export const SAVE_SHORTCUT = shortcut("KeyS", "S", 83);

// Existing Tiptap bindings (UndoRedo, StarterKit marks, Code, Subscript/Superscript).
// The shell, formatting tooltips and guide share these labels; Tiptap still owns the keymaps.
export const EDITOR_SHORTCUTS = {
  undo: editorShortcut("Mod-z"),
  redo: editorShortcut("Mod-y"),
  redoAlternative: editorShortcut("Mod-Shift-z"),
  bold: editorShortcut("Mod-b"),
  italic: editorShortcut("Mod-i"),
  strike: editorShortcut("Mod-Shift-s"),
  code: editorShortcut("Mod-e"),
  subscript: editorShortcut("Mod-,"),
  superscript: editorShortcut("Mod-."),
  newBlock: editorShortcut("Enter"),
  lineBreak: editorShortcut("Shift-Enter"),
  lineBreakAlternative: editorShortcut("Mod-Enter"),
  tab: editorShortcut("Tab"),
  shiftTab: editorShortcut("Shift-Tab"),
};
