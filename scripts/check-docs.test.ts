import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { checkDocs, headingAnchors } from "./check-docs.ts";

function repository(run: (root: string, write: (file: string, source: string) => void) => void) {
  const root = mkdtempSync(path.join(os.tmpdir(), "ieumdoc-docs-check-"));
  const write = (file: string, source: string) => {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), source);
  };
  try {
    write("README.md", "# Example\n[Docs](docs/README.md) [Contribute](CONTRIBUTING.md) [License](LICENSE)\n");
    write("AGENTS.md", "# Rules\n");
    write("CONTRIBUTING.md", "[Rules](AGENTS.md) [Docs](docs/README.md)\n");
    write("LICENSE", "Fixture license\n");
    write("docs/README.md", "# Docs\n[Guide](<가이드 (초안).md>)\n");
    write("docs/가이드 (초안).md", "# 한글 제목!\n## Repeat\n## Repeat-1\n## Repeat\n## A & B -- C\n");
    write(".github/pull_request_template.md", "[Docs](/docs/README.md)\n");
    run(root, write);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("local Markdown links work across encoded paths, references, images, titles and directories", () => {
  repository((root, write) => {
    write("docs/image.png", "fixture");
    write("docs/README.md", [
      "# Docs",
      '[Guide](<가이드 (초안).md> "title")',
      "[Encoded](%EA%B0%80%EC%9D%B4%EB%93%9C%20%28%EC%B4%88%EC%95%88%29.md?view=1#%ED%95%9C%EA%B8%80-%EC%A0%9C%EB%AA%A9)",
      "[Balanced](가이드%20(초안).md#repeat-2)",
      "[Escaped](가이드%20\\(초안\\).md#a--b----c)",
      "[Root](../) [Directory](../docs/) [Directory heading](../docs/#docs)",
      "![Image](image.png)",
      "[Full][guide] [guide][] [guide]",
      '[guide]: <가이드 (초안).md> "Reference title"',
      "[Multiline](\n<가이드 (초안).md>#invalid)", // Not a Markdown link: fragment belongs inside angle destination.
      "[Multiline](\n<가이드 (초안).md#repeat>\n)",
      "[External](https://example.invalid/not-fetched) [Mail](mailto:nobody@example.invalid)",
    ].join("\r\n"));
    const result = checkDocs(root);
    assert.deepEqual(result.failures, []);
    assert.equal(result.documents, 1);
  });
});

test("GitHub-style Korean, formatting, punctuation, repeated hyphens and duplicate collisions", () => {
  const source = [
    "# 한글 제목!", "## **Bold** and `code`", "## A &amp; B -- C",
    "## Repeat", "## Repeat-1", "## Repeat", "## Repeat", "## API_name",
    "Setext title", "============", '<a id="custom-anchor"></a>',
    "```md", "# Not a heading", "```",
  ].join("\n");
  assert.deepEqual([...headingAnchors(source)], [
    "한글-제목", "bold-and-code", "a--b----c", "repeat", "repeat-1", "repeat-2", "repeat-3", "api_name", "setext-title", "custom-anchor",
  ]);
});

test("examples in code, front matter and comments are not live links or headings", () => {
  repository((root, write) => {
    write("AGENTS.md", [
      "---", "example: '[Bad](missing.md)'", "---", "# Rules",
      "`[Bad](missing.md)`", "`` `[Bad](missing.md)` ``",
      "<!-- [Bad](missing.md) -->", "```md", "[Bad](missing.md)", "```",
      "~~~~", "[Bad](missing.md)", "~~~", "[Bad](missing.md)", "~~~~",
      "", "    [Bad](missing.md)", "", "[Self](#rules)",
    ].join("\n"));
    assert.deepEqual(checkDocs(root).failures, []);
  });
});

test("broken targets report source, exact line, original link, resolved target and reason", () => {
  repository((root, write) => {
    write("AGENTS.md", [
      "# Rules", "[Missing](missing.md)", "[Case](readme.md)",
      "[Anchor](docs/README.md#absent)", "[Outside](../escape.md)",
      "[Encoding](%xx.md)", "![Case image](docs/Image.png)",
    ].join("\r\n"));
    write("docs/image.png", "fixture");
    const failures = checkDocs(root).failures;
    assert.equal(failures.length, 6);
    assert.deepEqual(failures[0], {
      source: "AGENTS.md", line: 2, original: "[Missing](missing.md)",
      target: "missing.md", resolved: "missing.md", reason: "local path does not exist",
    });
    assert.match(failures[1].reason, /case mismatch/);
    assert.equal(failures[2].resolved, "docs/README.md#absent");
    assert.match(failures[2].reason, /anchor/);
    assert.match(failures[3].reason, /escapes repository/);
    assert.equal(failures[4].reason, "invalid URL encoding");
    assert.match(failures[5].reason, /case mismatch/);
  });
});

test("index requires a direct link to each maintained doc and roots must stay connected", () => {
  repository((root, write) => {
    write("docs/extra.md", "# Unindexed\n");
    write("docs/nested/README.md", "# Also unindexed\n");
    write("README.md", "[Directory alone is not the index](docs/)\n");
    write("CONTRIBUTING.md", "# Disconnected\n");
    // These are outside the declared scan, and must not create broken-link failures.
    write("packages/core/test/fixtures/example.md", "[Example](missing.md)\n");
    write("docs/node_modules/generated.md", "[Generated](missing.md)\n");
    const failures = checkDocs(root).failures;
    assert.equal(failures.filter(failure => failure.reason.includes("missing from the index")).length, 2);
    assert.equal(failures.filter(failure => failure.reason.includes("connection")).length, 5);
    assert.ok(failures.every(failure => failure.line === 1 && failure.original === "(required direct link)"));
  });
});
