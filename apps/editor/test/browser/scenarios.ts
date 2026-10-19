/** The stable browser suite, shared by the runner and its coverage/selection checks. */
export const STABLE_SCENARIOS = [
  "continuous-editing",
  "editor-shell",
  "layout-rules",
  "quiet-document",
  "visual-states",
  "new-document",
  "open-files",
  "save-during-edit",
  "save-session",
  "document-session",
  "recovery-storage",
  "recovery",
  "document-tabs",
  "equation-insertion",
  "equation-save-during-edit",
  "equation-node-selection-typing",
  "reference-save-reload",
  "quote-save-reload",
  "writeability-preflight",
  "block-move",
  "document-title",
  "figure-authoring",
  "pending-figure",
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
  "property-drafts",
  "code-highlighting",
  "section-reference",
  "folder-navigation",
  "footnotes",
  "focus-caret",
  "desktop-updates",
];

/** Production HTTP has a different startup and filesystem policy; run it against its own Host. */
export const HTTP_SCENARIOS = ["http-host"];

/** Select before starting a server probe or browser; an invalid/empty shard must fail. */
export function selectBrowserScenarios(args: readonly string[]): {
  scenarios: string[];
  screenshots: boolean;
  shard?: string;
} {
  const screenshots = args.includes("--screenshots");
  const shards = args.filter(arg => arg.startsWith("--shard"));
  const requested = args.filter(arg => arg !== "--screenshots" && !arg.startsWith("--shard"));
  if (requested.some(name => HTTP_SCENARIOS.includes(name)) && requested.some(name => !HTTP_SCENARIOS.includes(name))) {
    throw new Error("Run HTTP Host scenarios separately from Vite scenarios.");
  }
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
  if (screenshots && (requested.length !== 1 || !["quiet-document", "folder-navigation", "desktop-updates", "open-files", "document-tabs", "recovery", "footnotes", ...HTTP_SCENARIOS].includes(requested[0]!))) {
    throw new Error("Use: pnpm browser:test quiet-document|folder-navigation|desktop-updates|open-files|document-tabs|footnotes|http-host --screenshots");
  }
  return { scenarios: requested.length ? requested : [...STABLE_SCENARIOS], screenshots };
}
