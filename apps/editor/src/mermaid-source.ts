/** Editor input cleanup matching MyST directive boundaries, without trimming authored lines. */
export function normalizeMermaidSource(source: string): string {
  return source.replace(/\r\n?/g, "\n").replace(/^(?:[^\S\n]*\n)+/, "").trimEnd();
}
