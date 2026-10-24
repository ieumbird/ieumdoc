import path from "node:path";
import { REPOSITORY_ROOT } from "./fixtures.ts";

type ExpectedConsoleErrorRule = {
  status: number;
  pathname: string;
  minimum: number;
  queryPath?: string;
  description: string;
};

const EXPECTED_CONSOLE_ERRORS: Record<string, ExpectedConsoleErrorRule[]> = {
  "command-center": [
    { status: 400, pathname: "/api/document", queryPath: path.join(REPOSITORY_ROOT, "tmp", "document-tabs", "foreign.md"), minimum: 1, description: "listed non-native Markdown uses the existing admission refusal" },
  ],
  "ui-language": [
    {status: 409, pathname: "/api/document", minimum: 1, description: "conflict guidance follows language changes while preserving edits"},
  ],
  "recovery": [
    {status: 409, pathname: "/api/document", minimum: 1, description: "restored work retains its acknowledged revision against another window's Save"},
    {status: 400, pathname: "/api/document", minimum: 1, description: "failed Reload retains its local recovery record"},
  ],
  "writeability-preflight": [
    {status: 400, pathname: "/api/document", minimum: 4, description: "native document admission failures on Open, Reload and startup"},
    {status: 403, pathname: "/api/document", minimum: 1, description: "non-native Open permission failure"},
  ],
  "http-host": [
    { status: 403, pathname: "/api/folder-browse", minimum: 1, description: "HTTP picker refuses a path outside all allowed roots" },
    { status: 409, pathname: "/api/document", minimum: 1, description: "HTTP Save preserves local input after another writer commits" },
  ],
  "image-assets": [
    { status: 404, pathname: "/document/assets/missing.png", queryPath: path.join(REPOSITORY_ROOT, "tmp", "image-assets", "paths.md"), minimum: 1, description: "a missing Figure image shows its load failure" },
    { status: 400, pathname: "/api/asset", minimum: 1, description: "mocked Host write rejection keeps the document unchanged" },
    { status: 403, pathname: "/api/asset", minimum: 1, description: "mocked rollback failure exposes the remaining asset path" },
  ],
  "save-session": [
    {status: 409, pathname: "/api/document", minimum: 1, description: "external edit conflicts with the retained session"},
    {status: 400, pathname: "/api/document", minimum: 2, description: "invalid content and a mocked failed save retain pending work"},
  ],
  "editor-shell": [
    {status: 400, pathname: "/api/document", minimum: 1, description: "mocked save rejection"},
    {status: 409, pathname: "/api/document", minimum: 1, description: "mocked save conflict"},
  ],
  "open-files": [
    {status: 400, pathname: "/api/document", minimum: 1, description: "failed Save cancels the document switch"},
    {
      status: 404,
      pathname: "/document/diagram.svg",
      queryPath: path.join(REPOSITORY_ROOT, "tmp", "open-files", "ieumdoc-a.md"),
      minimum: 1,
      description: "missing diagram for mocked file A",
    },
    {
      status: 404,
      pathname: "/document/diagram.svg",
      queryPath: path.join(REPOSITORY_ROOT, "tmp", "open-files", "ieumdoc-b.md"),
      minimum: 1,
      description: "missing diagram for mocked file B",
    },
    {status: 409, pathname: "/api/document", minimum: 1, description: "mocked save conflict"},
  ],
  "save-during-edit": [
    {status: 409, pathname: "/api/document", minimum: 1, description: "mocked save conflict"},
  ],
  "link-authoring": [
    {status: 400, pathname: "/api/document", minimum: 1, description: "rejected unpreservable link save"},
  ],
  "inline-math-authoring": [
    {status: 400, pathname: "/api/document", minimum: 1, description: "rejected unpreservable inline math save"},
  ],
  "admonition-authoring": [
    {status: 400, pathname: "/api/document", minimum: 1, description: "rejected unpreservable admonition edit"},
  ],
  "footnotes": [
    {status: 400, pathname: "/api/document", minimum: 1, description: "rejected save that would drop an unreferenced footnote"},
  ],
  "folder-navigation": [
    {status: 400, pathname: "/api/document", minimum: 1, description: "folder New refuses to overwrite an existing document"},
    {status: 400, pathname: "/api/folder", minimum: 1, description: "a missing folder or file cannot be opened as a folder, and New folder rejects reserved or existing names"},
    {status: 400, pathname: "/api/folder-browse", minimum: 1, description: "a missing folder cannot be browsed"},
  ],
  "folder-memory": [
    {status: 400, pathname: "/api/folder", minimum: 1, description: "a remembered missing folder is quietly skipped during restoration"},
  ],
  "document-tabs": [
    {status: 400, pathname: "/api/document", minimum: 1, description: "missing or non-native remembered documents are quietly excluded, and an open file may be removed externally"},
    {status: 403, pathname: "/api/document", minimum: 1, description: "a remembered path denied by the Host is quietly excluded"},
  ],
};

export function classifyConsoleErrors(scenario: string, messages: string[]) {
  const rules = EXPECTED_CONSOLE_ERRORS[scenario] ?? [];
  const matched = rules.map(() => 0);
  const unexpected: string[] = [];

  for (const message of messages) {
    const status = Number(message.match(/status of (\d{3}) \(/)?.[1]);
    const location = message.match(/ @ (https?:\/\/\S+)$/)?.[1];
    let url: URL | undefined;
    try {
      if (location) url = new globalThis.URL(location);
    } catch {
      // A malformed or non-HTTP console location cannot match an expected response.
    }
    const ruleIndex = rules.findIndex((rule) => status === rule.status && url?.pathname === rule.pathname &&
      (!rule.queryPath || rule.queryPath === url.searchParams.get("path")));
    if (ruleIndex < 0) {
      unexpected.push(message);
    } else {
      matched[ruleIndex] += 1;
    }
  }

  const missing = rules.flatMap((rule, index) =>
    matched[index] < rule.minimum ? [`${rule.minimum - matched[index]} × ${rule.description} (${rule.status} ${rule.pathname})`] : []);
  const expected = rules.flatMap((rule, index) =>
    matched[index] > 0 ? [`${rule.status} ${rule.pathname} × ${matched[index]} (${rule.description})`] : []);
  return {expected, unexpected, missing};
}
