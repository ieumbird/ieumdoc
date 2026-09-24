/**
 * Field rules for an Equation or Figure label, the reference target name a user
 * writes. An empty label means none. Observed in MyST parsing: surrounding spaces
 * are dropped from the written label or its identifier, and a line break ends the
 * directive option, so neither would reload as written. Target, reference and
 * duplicate checks need the document and live in Core's label operation. This
 * module has no MyST dependency so the Editor can apply the same rules before Save.
 */
export function labelError(label: string): string | undefined {
  if (typeof label !== "string") return "Label must be a string.";
  if (/[\r\n]/.test(label)) return "Label cannot contain line breaks.";
  if (label.trim() !== label) return "Label cannot have leading or trailing spaces.";
  return undefined;
}
