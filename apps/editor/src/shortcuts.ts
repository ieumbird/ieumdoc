/** Physical keys keep shortcuts independent of Korean/English keyboard layout.
 * Labels and ARIA tokens derive from the same definition as the event matcher. */
function shortcut(code: string, key: string) {
  const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  return {
    label: mac ? `⌘${key}` : `Ctrl+${key}`,
    aria: `Control+${key} Meta+${key}`,
    matches: (event: KeyboardEvent) => !event.isComposing && event.code === code &&
      (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey,
  };
}

export const COMMAND_CENTER_SHORTCUT = shortcut("Slash", "/");
export const LINK_SHORTCUT = shortcut("Quote", "'");
export const SAVE_SHORTCUT = shortcut("KeyS", "S");
