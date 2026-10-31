import { i18n, type MessageKey } from "./i18n.ts";

const reasons = [
  "This recovery format is not supported by this editor version.",
  "The recovery opening source or saved checkpoint is incomplete.",
  "Editor content would be lost", "Unsupported editor field", "Editor snapshot must contain a doc",
  "Invalid editor deletion metadata", "Invalid editor heading numbering", "Missing editor block locator",
  "Unknown editor block locator", "Duplicate editor block locator", "Missing editor deletion metadata",
  "Editor locator exceeds the supported range",
] as const satisfies readonly MessageKey[];

/** Resolve at render time so an open recovery dialog follows UI language changes. */
export function recoveryReasonText(reason: string): string {
  const prefix = "Incompatible editor snapshot: ";
  if (reason.startsWith(prefix)) return i18n.t("Incompatible editor snapshot: {{reason}}", {
    reason: recoveryReasonText(reason.slice(prefix.length)),
  });
  const attribute = "Invalid editor attribute ";
  if (reason.startsWith(attribute)) return i18n.t("Invalid editor attribute {{attribute}}", {attribute: reason.slice(attribute.length)});
  const key = reasons.find(key => key === reason);
  return key ? i18n.t(key) : reason; // External engine diagnostics remain literal.
}
