/** Characters own the bindings; physical positions are an opaque-IME fallback only.
 * Labels and ARIA tokens derive from the same definition as the event matcher. */
function shortcut(code: string, key: string, virtualKey: number) {
  const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  return {
    label: mac ? `⌘${key}` : `Ctrl+${key}`,
    aria: `Control+${key} Meta+${key}`,
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
