/**
 * Numbered reference targets are computed from a document's top-level blocks, like sections:
 * MyST numbers display equations, figures and table directives in document order, and the
 * automatic numbers are never written; authored fixed enumerators remain document text.
 * Neither is used as identity (ADR-0003). This
 * rule is the one Core's read model, the CLI and the Editor share. It has no MyST dependency.
 */

export type NumberedKind = "equation" | "figure" | "table";

/** Input: a target count or authored fixed string. Output: the first displayed number. */
export type NumberedTargets = Partial<Record<NumberedKind, number | string>>;

export const NUMBERED_KINDS: readonly NumberedKind[] = ["equation", "figure", "table"];

/** Editor-neutral heading counter settings projected from MyST front matter. */
export type HeadingNumbering = {
  enabled: boolean[];
  counts: (number | null)[];
  offset: number;
  enumerators: (string | null)[];
};

/** Default authoring policy: H1–H6 are numbered body sections. */
export function defaultHeadingNumbering(enabled: boolean): HeadingNumbering | null {
  return enabled ? { enabled: [true, true, true, true, true, true], counts: [0, 0, 0, 0, 0, 0], offset: 0,
    enumerators: [null, null, null, null, null, null] } : null;
}

/** Computed heading numbers in the current block order; no number is authored as text. */
export function headingNumbers(blocks: { block: string; level?: number }[], settings?: HeadingNumbering | null): (string | undefined)[] {
  let counts = [...(settings?.counts ?? [])];
  const increment = (level: number) => {
    if (!settings?.enabled[level - 1]) return undefined;
    const depth = level + settings.offset;
    counts = counts.map((count, index) => count === null || index < depth - 1 ? count : index === depth - 1 ? count + 1 : 0);
    const parts = counts.filter(count => count !== null);
    while (parts.at(-1) === 0) parts.pop();
    const number = parts.join(".");
    return settings.enumerators[level - 1]?.replace(/%s/g, number) ?? number;
  };
  return blocks.map(block => {
    if (block.block === "heading") return increment(block.level ?? 1);
    return undefined;
  });
}

/** Section references share heading counters; with numbers off, retain the heading's name. */
export function sectionReferenceText(title: string, number?: string): string {
  return `§ ${number ?? title}`;
}

/**
 * Each equation, figure or table read-model block holds one numbered target of its kind.
 * Core and interfaces use this rule for both parsed and newly inserted blocks, independently
 * of caption or label content.
 */
export function blockTargets(block: { block: string; enumerator?: string; label?: string; caption?: unknown }): NumberedTargets {
  if (block.block === "equation") return { equation: block.enumerator ?? 1 };
  if (block.block === "figure") return { figure: block.enumerator ?? 1 };
  if (block.block === "table") return { table: block.enumerator ?? 1 };
  return {};
}

/** For each block, the number of its first target of each kind it holds, counting from 1. */
export function targetNumbers(blocks: NumberedTargets[]): NumberedTargets[] {
  const next: Record<NumberedKind, number> = { equation: 1, figure: 1, table: 1 };
  return blocks.map((targets) => {
    const first: NumberedTargets = {};
    for (const kind of NUMBERED_KINDS) {
      const count = targets[kind] ?? 0;
      if (typeof count === "string") first[kind] = count;
      else if (count > 0) {
        first[kind] = next[kind];
        next[kind] += count;
      }
    }
    return first;
  });
}

export type NumberingDiagnostic = {
  code: "numbering-missing" | "numbering-duplicate";
  severity: "warning";
  kind: NumberedKind;
  path: readonly number[];
  enumerator?: string;
};

/** Fixed mode is inferred from authored targets, never stored as document metadata.
 * Missing numbers retain MyST's automatic fallback until authored; diagnostics never gate writes. */
export function numberingReport(blocks: readonly { block: string; path: readonly number[]; enumerator?: string }[]) {
  const numbers = targetNumbers(blocks.map(blockTargets));
  const targets = blocks.flatMap((block, index) => NUMBERED_KINDS.flatMap(kind => numbers[index][kind] === undefined ? [] : [{
    kind, path: block.path, number: numbers[index][kind]!, ...(block.enumerator !== undefined ? { enumerator: block.enumerator } : {}),
  }]));
  const mode: "fixed" | "automatic" = targets.some(target => target.enumerator !== undefined) ? "fixed" : "automatic";
  const diagnostics: NumberingDiagnostic[] = [];
  if (mode === "fixed") {
    const counts = new Map<NumberedKind, Map<string, number>>();
    for (const target of targets) if (target.enumerator !== undefined) {
      const used = counts.get(target.kind) ?? new Map<string, number>();
      used.set(target.enumerator, (used.get(target.enumerator) ?? 0) + 1);
      counts.set(target.kind, used);
    }
    for (const target of targets) {
      if (target.enumerator === undefined) diagnostics.push({ code: "numbering-missing", severity: "warning", kind: target.kind, path: target.path });
      else if (counts.get(target.kind)!.get(target.enumerator)! > 1) diagnostics.push({ code: "numbering-duplicate", severity: "warning", kind: target.kind, path: target.path, enumerator: target.enumerator });
    }
  }
  return { mode, targets, diagnostics };
}

/** Number exact identifiers 1, 2, ... in the order their first reference is read. */
export function firstReferenceNumbers(references: Iterable<string>): Map<string, number> {
  const numbers = new Map<string, number>();
  for (const label of references) if (!numbers.has(label)) numbers.set(label, numbers.size + 1);
  return numbers;
}

/** Endnotes and bibliography keys use the same order policy, with independent namespaces/maps. */
export const footnoteNumbers = firstReferenceNumbers;

/** A top-level block as endnote ordering sees it: the footnote label it defines, if it is a
 * definition, and the footnote references it holds in document order. */
export type EndnoteBlock = { definition?: string; references: readonly string[] };

/**
 * Endnote order, the one placement policy of footnote definitions: body blocks first, as they
 * are, then the definitions in the order of the first reference to each. Native admission
 * rejects references inside definitions; defensive ordering still places such references
 * after the body's references. A definition no reference reaches comes last, in its current
 * order. Core's parse and canonical write and the Editor's endnotes region all order by it.
 */
export function endnoteOrder(blocks: readonly EndnoteBlock[]): number[] {
  const body = blocks.flatMap((block, index) => block.definition === undefined ? [index] : []);
  const definitions = blocks.flatMap((block, index) => block.definition === undefined ? [] : [index]);
  const referenced = new Set(body.flatMap(index => blocks[index].references));
  // Visit definitions in discovered order, so nested references have a stable trailing order.
  for (const label of referenced) {
    const definition = definitions.find(index => blocks[index].definition === label);
    if (definition !== undefined) blocks[definition].references.forEach(reference => referenced.add(reference));
  }
  const numbers = footnoteNumbers(referenced);
  return [...body, ...definitions.sort((left, right) =>
    (numbers.get(blocks[left].definition!) ?? Infinity) - (numbers.get(blocks[right].definition!) ?? Infinity))];
}

/**
 * Labels of the definitions that some block references now and none would once the blocks
 * `removed` selects are gone. Canonical write refuses an unreferenced definition, so a
 * structural removal names them before it runs rather than leaving them for Save.
 */
export function orphanedEndnotes(blocks: readonly EndnoteBlock[], removed: (index: number) => boolean): string[] {
  const before = new Set(blocks.flatMap(block => block.references));
  const after = new Set(blocks.flatMap((block, index) => removed(index) ? [] : block.references));
  return blocks.flatMap((block, index) => block.definition !== undefined && !removed(index) &&
    before.has(block.definition) && !after.has(block.definition) ? [block.definition] : []);
}

/** The label a new footnote takes: the smallest positive number no footnote in `labels` uses.
 * Labels match exactly, as in MyST; the shown number still follows reference order. */
export function nextFootnoteLabel(labels: Iterable<string>): string {
  const used = new Set(labels);
  let number = 1;
  while (used.has(String(number))) number++;
  return String(number);
}

/** Authored templates only; absent keys use MyST defaults. */
export type ReferenceTemplates = Partial<Record<NumberedKind, string>>;
export type ReferenceTemplateUpdate = Partial<Record<NumberedKind, string | null>>;
export const DEFAULT_REFERENCE_TEMPLATES: Readonly<Record<NumberedKind, string>> = {
  figure: "Figure\u00a0%s", table: "Table\u00a0%s", equation: "(%s)",
};

export function referenceTemplatesError(value: unknown, allowReset = false): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "reference templates must be an object";
  for (const [kind, template] of Object.entries(value)) {
    if (!NUMBERED_KINDS.includes(kind as NumberedKind)) return `unsupported reference template kind: ${kind}`;
    if (allowReset && template === null) continue;
    if (typeof template !== "string" || !template.trim() || !/%s|\{number\}|\{subEnumerator\}/.test(template)) {
      return `${kind} template must be a non-empty string containing %s or {number}`;
    }
    if (template.includes("{name}")) return "reference captions in templates are not supported";
  }
  return undefined;
}

/** MyST's numeric substitutions; native numbers have no chapter/subfigure hierarchy. */
export function referenceNumberText(kind: NumberedKind, number: number | string, templates?: ReferenceTemplates | null): string {
  return (templates?.[kind] ?? DEFAULT_REFERENCE_TEMPLATES[kind]).replace(/%s|\{number\}|\{subEnumerator\}/g, () => String(number));
}

/** Caption number text before its separator: authored reference templates, otherwise legacy spaces. */
export function captionNumberText(kind: "figure" | "table", number: number | string, templates?: ReferenceTemplates | null): string {
  return templates?.[kind] === undefined
    ? `${kind === "figure" ? "Figure" : "Table"} ${number}`
    : referenceNumberText(kind, number, templates);
}
