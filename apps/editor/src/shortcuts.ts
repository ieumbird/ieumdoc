/** Physical keys keep shortcuts independent of Korean/English keyboard layout.
 * Labels and ARIA tokens derive from the same definition as the event matcher. */
function shortcut(code: string, alt = false, shift = false) {
  const key = code.replace(/^Key/, "");
  const keys = [...(alt ? ["Alt"] : []), ...(shift ? ["Shift"] : []), key].join("+");
  const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  return {
    label: mac ? `⌘${keys.replace("Alt", "Option")}` : `Ctrl+${keys}`,
    aria: `Control+${keys} Meta+${keys}`,
    matches: (event: KeyboardEvent) => !event.isComposing && event.code === code &&
      (event.ctrlKey || event.metaKey) && event.altKey === alt && event.shiftKey === shift,
  };
}

export const COMMAND_CENTER_SHORTCUT = shortcut("KeyP", true, true);
export const LINK_SHORTCUT = shortcut("KeyK", true, true);
export const SAVE_SHORTCUT = shortcut("KeyS");
