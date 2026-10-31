import { DEFAULT_REFERENCE_TEMPLATES, NUMBERED_KINDS, type ReferenceTemplates } from "@litzio/core/numbering";

export const REFERENCE_STYLES = {
  default: { label: "Default", templates: {} },
  concise: { label: "Concise", templates: { figure: "Fig. %s", table: "Table %s", equation: "(%s)" } },
  formal: { label: "Formal", templates: { figure: "Figure %s", table: "Table %s", equation: "Equation (%s)" } },
  korean: { label: "Korean", templates: { figure: "그림 %s", table: "표 %s", equation: "식 (%s)" } },
} as const satisfies Record<string, { label: string; templates: ReferenceTemplates }>;
export type ReferenceStyle = keyof typeof REFERENCE_STYLES;

export function referenceStyle(templates?: ReferenceTemplates | null): ReferenceStyle | "custom" {
  return (Object.keys(REFERENCE_STYLES) as ReferenceStyle[]).find(style => NUMBERED_KINDS.every(kind =>
    (templates?.[kind] ?? DEFAULT_REFERENCE_TEMPLATES[kind]) ===
    ((REFERENCE_STYLES[style].templates as ReferenceTemplates)[kind] ?? DEFAULT_REFERENCE_TEMPLATES[kind]))) ?? "custom";
}
