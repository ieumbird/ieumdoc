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

/**
 * Field rules for a `(label)=` target's label. MyST reads the line as a target only when
 * the label is 1-100 of these characters; anything else reloads as an ordinary paragraph.
 * Restated without the MyST dependency, like `labelKey`; Core tests pin it to the parser.
 */
export function targetLabelError(label: string): string | undefined {
  return labelError(label) ?? (/^[a-zA-Z0-9|@<>*./_\-+:]{1,100}$/.test(label) ? undefined
    : "A section label uses 1-100 ASCII letters, digits or | @ < > * . / _ - + : characters.");
}

/**
 * The key MyST resolves a reference to its target by: myst-common's `normalizeLabel`
 * identifier, restated without the MyST dependency so the Editor can tell whether a
 * reference names a target in the current document. Core tests pin it to MyST's.
 */
export function labelKey(label: string): string {
  return label.replace(/[\t\n\r ]+/g, " ").replace(/['‘’"“”]+/g, "").trim().toLowerCase();
}
