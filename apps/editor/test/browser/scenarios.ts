/** The stable browser suite, shared by the runner and its coverage/selection checks. */
export const STABLE_SCENARIOS = [
  "continuous-editing",
  "editor-shell",
  "layout-rules",
  "quiet-document",
  "new-document",
  "open-files",
  "save-during-edit",
  "save-session",
  "equation-insertion",
  "equation-save-during-edit",
  "reference-save-reload",
  "quote-save-reload",
  "writeability-preflight",
  "block-move",
  "figure-authoring",
  "image-assets",
  "external-html-paste",
  "figure-draft-race",
  "table-cell-editing",
  "table-authoring",
  "link-authoring",
  "inline-math-authoring",
  "inline-math-split",
  "admonition-authoring",
  "structural-block-authoring",
  "markdown-input",
  "basic-blocks",
  "outline",
  "list-authoring",
  "source-view",
  "source-view-pending",
  "label-authoring",
  "cross-reference",
  "block-source-editing",
  "section-reference",
  "folder-navigation",
  "footnotes",
];

/** Select before starting a server probe or browser; an invalid/empty shard must fail. */
export function selectBrowserScenarios(args: readonly string[]): {
  scenarios: string[];
  screenshots: boolean;
  shard?: string;
} {
  const screenshots = args.includes("--screenshots");
  const shards = args.filter(arg => arg.startsWith("--shard"));
  const requested = args.filter(arg => arg !== "--screenshots" && !arg.startsWith("--shard"));
  if (shards.length > 1) throw new Error("Specify --shard only once.");
  if (shards.length) {
    const match = /^--shard=([1-9]\d*)\/([1-9]\d*)$/.exec(shards[0]!);
    if (!match) throw new Error("Use --shard=<index>/<count> with positive integers.");
    const index = Number(match[1]);
    const count = Number(match[2]);
    if (!Number.isSafeInteger(index) || !Number.isSafeInteger(count) || index > count || count > STABLE_SCENARIOS.length) {
      throw new Error("Shard index must be within its count, and every shard must contain scenarios.");
    }
    if (requested.length || screenshots) throw new Error("Use --shard with the full stable suite, without names or --screenshots.");
    return {
      scenarios: STABLE_SCENARIOS.filter((_, position) => position % count === index - 1),
      screenshots: false,
      shard: `${index}/${count}`,
    };
  }
  if (screenshots && (requested.length !== 1 || !["quiet-document", "folder-navigation"].includes(requested[0]!))) {
    throw new Error("Use: pnpm browser:test quiet-document|folder-navigation --screenshots");
  }
  return { scenarios: requested.length ? requested : [...STABLE_SCENARIOS], screenshots };
}
