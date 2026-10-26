/** Characters own the bindings; physical positions are an opaque-IME fallback only.
 * Labels and ARIA tokens derive from the same definition as the event matcher. */
export const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

/** Tiptap notation also describes existing engine bindings; this does not register a key. */
export function shortcutLabel(binding: string, mac = isMac()): string {
  return binding.split("-").map(key => key === "Mod" ? (mac ? "⌘" : "Ctrl") : key === "Alt" && mac ? "Option"
    : key.length === 1 ? key.toUpperCase() : key).join("+").replace("⌘+", "⌘");
}

function editorShortcut(binding: string) {
  const ariaKey = binding.split("-").map(key => key === "," ? "Comma" : key === "." ? "Period"
    : key.length === 1 ? key.toUpperCase() : key).join("+");
  return { binding, get label() { return shortcutLabel(binding); },
    aria: ariaKey.includes("Mod") ? ["Control", "Meta"].map(mod => ariaKey.replace("Mod", mod)).join(" ") : ariaKey };
}

function shortcut(code: string, key: string, virtualKey: number) {
  const definition = editorShortcut(`Mod-${key}`);
  return {
    ...definition,
    get label() { return definition.label; },
    key: key.toLowerCase(),
    matches: (event: KeyboardEvent, { opaqueOnly = false }: { opaqueOnly?: boolean } = {}) => {
      if (event.isComposing || !(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return false;
      const opaque = event.key === "Process" || event.key === "Unidentified";
      if (opaqueOnly && (!opaque || (event.keyCode !== 0 && event.keyCode !== 229))) return false;
      // Chromium browser accelerators use the virtual key, even when an IME hides the character.
      // Accept this shortcut's VK, unspecified (0), or IME processing (229), never e.g. Zoom Out
      // (189) or French AZERTY apostrophe's digit 4 (52). Unknown native mappings fail closed.
      if (event.keyCode !== virtualKey && event.keyCode !== 0 && event.keyCode !== 229) return false;
      return event.key.toLowerCase() === key.toLowerCase() ||
        (opaque && event.code === code);
    },
  };
}

export const COMMAND_CENTER_SHORTCUT = shortcut("Slash", "/", 191);
export const LINK_SHORTCUT = shortcut("Quote", "'", 222);
export const SAVE_SHORTCUT = shortcut("KeyS", "S", 83);
export const UNDO_SHORTCUT = shortcut("KeyZ", "Z", 90);
export const REDO_SHORTCUT = shortcut("KeyY", "Y", 89);

// Existing Tiptap bindings (UndoRedo, StarterKit marks, Code, Subscript/Superscript).
// The shell, formatting tooltips and guide share these labels; Tiptap still owns the keymaps.
export const EDITOR_SHORTCUTS = {
  undo: UNDO_SHORTCUT,
  redo: REDO_SHORTCUT,
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
  bulletList: editorShortcut("Mod-Shift-8"),
  orderedList: editorShortcut("Mod-Shift-7"),
  codeBlock: editorShortcut("Mod-Alt-c"),
  documentEnd: editorShortcut("Mod-End"),
  documentEndMac: editorShortcut("Mod-ArrowDown"),
  undoRussian: editorShortcut("Mod-я"),
  redoRussian: editorShortcut("Mod-Shift-я"),
  selectAll: editorShortcut("Mod-a"),
  copy: editorShortcut("Mod-c"),
  cut: editorShortcut("Mod-x"),
  backspace: editorShortcut("Backspace"),
  shiftBackspace: editorShortcut("Shift-Backspace"),
  delete: editorShortcut("Delete"),
  joinBackward: editorShortcut("Mod-Backspace"),
  joinForward: editorShortcut("Mod-Delete"),
  up: editorShortcut("ArrowUp"),
  down: editorShortcut("ArrowDown"),
  macBackspace: editorShortcut("Ctrl-h"),
  macDelete: editorShortcut("Ctrl-d"),
  macAltBackspace: editorShortcut("Alt-Backspace"),
  macCtrlAltBackspace: editorShortcut("Ctrl-Alt-Backspace"),
  macAltDelete: editorShortcut("Alt-Delete"),
  macAltD: editorShortcut("Alt-d"),
  macLineStart: editorShortcut("Ctrl-a"),
  macLineEnd: editorShortcut("Ctrl-e"),
};

// Existing application navigation handlers and native clipboard keys, not new keymaps.
export const INTERACTION_SHORTCUTS = {
  slash: editorShortcut("/"), escape: editorShortcut("Escape"),
  left: editorShortcut("ArrowLeft"), right: editorShortcut("ArrowRight"),
  home: editorShortcut("Home"), end: editorShortcut("End"), space: editorShortcut("Space"),
  paste: editorShortcut("Mod-v"), pastePlain: editorShortcut("Mod-Shift-v"),
};
