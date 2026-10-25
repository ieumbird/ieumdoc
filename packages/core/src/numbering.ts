/**
 * Numbered reference targets are computed from a document's top-level blocks, like sections:
 * MyST numbers display equations, figures and captioned tables in document order, and the
 * numbers are never written to the document (ADR-0002) nor used as identity (ADR-0003). This
 * rule is the one Core's read model, the CLI and the Editor share. It has no MyST dependency.
 */

export type NumberedKind = "equation" | "figure" | "table";

/** How many numbered targets of each kind a block holds; or, from `targetNumbers`, the
 * number of the block's first target of each kind. */
export type NumberedTargets = Partial<Record<NumberedKind, number>>;

export const NUMBERED_KINDS: readonly NumberedKind[] = ["equation", "figure", "table"];

/** Editor-neutral heading counter settings projected from MyST front matter. */
export type HeadingNumbering = {
  enabled: boolean[];
  counts: (number | null)[];
  offset: number;
  enumerators: (string | null)[];
};

/** Default authoring policy: H1 is a title; H2–H6 are numbered sections. */
export function defaultHeadingNumbering(enabled: boolean): HeadingNumbering | null {
  return enabled ? { enabled: [false, true, true, true, true, true], counts: [0, 0, 0, 0, 0, 0], offset: -1,
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

/**
 * The numbered targets a read-model block (Core's EditableBlock, or an editor block of the same
 * shape) holds. Core sets `numbered` only where a block differs from its kind's default: one
 * equation per equation block, one figure per figure block, none otherwise. Blocks an interface
 * adds through Core's insert operations have that default.
 */
export function blockTargets(block: { block: string; label?: string; caption?: unknown }): NumberedTargets {
  if (block.block === "equation") return { equation: 1 };
  if (block.block === "figure") return { figure: 1 };
  if (block.block === "table" && (block.label || (Array.isArray(block.caption) && block.caption.length > 0))) return { table: 1 };
  return {};
}

/** For each block, the number of its first target of each kind it holds, counting from 1. */
export function targetNumbers(blocks: NumberedTargets[]): NumberedTargets[] {
  const next: Record<NumberedKind, number> = { equation: 1, figure: 1, table: 1 };
  return blocks.map((targets) => {
    const first: NumberedTargets = {};
    for (const kind of NUMBERED_KINDS) {
      const count = targets[kind] ?? 0;
      if (count > 0) {
        first[kind] = next[kind];
        next[kind] += count;
      }
    }
    return first;
  });
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
export function referenceNumberText(kind: NumberedKind, number: number, templates?: ReferenceTemplates | null): string {
  return (templates?.[kind] ?? DEFAULT_REFERENCE_TEMPLATES[kind]).replace(/%s|\{number\}|\{subEnumerator\}/g, String(number));
}
