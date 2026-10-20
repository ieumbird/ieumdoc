import { i18n } from "./i18n.ts";

/** Operation identity is independent of translated presentation. */
export const OPERATION_LABELS = {
  ready: "Ready", loading: "Loading…", opening: "Opening…", creating: "Creating…", saving: "Saving…",
  saved: "Saved", "saved-pending": "Saved; newer edits pending", "open-failed": "Open failed",
  "save-failed": "Save failed", "save-conflict": "Save conflict", "adding-image": "Adding image…",
} as const;
export type Operation = keyof typeof OPERATION_LABELS;
export const operationText = (operation: Operation): string => i18n.t(OPERATION_LABELS[operation]);
