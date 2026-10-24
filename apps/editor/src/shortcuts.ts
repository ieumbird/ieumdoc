/** Characters own the bindings; physical positions are an opaque-IME fallback only.
 * Labels and ARIA tokens derive from the same definition as the event matcher. */
function shortcut(code: string, key: string, virtualKey: number) {
  const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  return {
    label: mac ? `⌘${key}` : `Ctrl+${key}`,
    aria: `Control+${key} Meta+${key}`,
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
