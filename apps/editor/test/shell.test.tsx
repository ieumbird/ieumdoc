import assert from "node:assert/strict";
import test from "node:test";
import { activeAfterClose, allTabsPendingWork, openedTab, tabLabels, tabNames } from "../src/document-tabs.ts";

import { renderToStaticMarkup } from "react-dom/server";
import type { FolderEntry } from "../shared/document-protocol.ts";
import { CommandMenu } from "../src/CommandMenu.tsx";
import { TooltipProvider } from "../src/components/ui/tooltip.tsx";
import { createOutlineStore } from "../src/outline.ts";
import { createDocumentSessionLifetime } from "../src/document-session.ts";
import { visibleRecentFolders } from "../src/preferences.ts";
import { DocumentPanel } from "../src/shell/DocumentPanel.tsx";
import { DisplaySettings } from "../src/shell/DisplaySettings.tsx";
import { documentLocation, splitDocumentPath, unquotePath } from "../src/shell/document-path.ts";
import { MessageArea } from "../src/shell/MessageArea.tsx";
import { NewDialog } from "../src/shell/NewDialog.tsx";
import { Sidebar } from "../src/shell/Sidebar.tsx";
import { TopBar } from "../src/shell/TopBar.tsx";
import { i18n } from "../src/i18n.ts";
import { en, ko } from "../src/locales.ts";
import { messageText, type UiMessage } from "../src/ui-message.ts";
import { readUiLanguage, writeUiLanguage, UI_LANGUAGE_KEY } from "../src/preferences.ts";
import { filterInsertCommands } from "../src/block-commands.ts";

test("bundled languages cover keys and interpolation parameters without relying on fallback", () => {
  assert.deepEqual(Object.keys(ko).sort(), Object.keys(en).sort());
  const parameters = (text: string) => [...new Set([...text.matchAll(/{{([^}]+)}}/g)].map(match => match[1]))].sort();
  for (const key of Object.keys(en) as (keyof typeof en)[]) {
    assert.ok(ko[key].trim(), key);
    assert.deepEqual(parameters(ko[key]), parameters(en[key]), key);
    assert.equal(i18n.getResource("ko", "translation", key), ko[key], key);
  }
});

test("language preference uses an explicit choice before the preferred language and tolerates unavailable storage", () => {
  const storage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const navigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const values = new Map<string, string>();
  try {
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
      getItem: (key: string) => values.get(key), setItem: (key: string, value: string) => values.set(key, value),
    } });
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: { languages: ["ko-KR", "en-US"] } });
    assert.equal(readUiLanguage(), "ko");
    assert.equal(writeUiLanguage("en"), true);
    assert.equal(readUiLanguage(), "en");
    values.set(UI_LANGUAGE_KEY, "invalid");
    assert.equal(readUiLanguage(), "ko");
    Object.defineProperty(globalThis, "localStorage", { configurable: true, get() { throw Error("blocked"); } });
    assert.equal(readUiLanguage(), "ko");
    assert.equal(writeUiLanguage("en"), false);
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: { languages: ["fr-FR", "ko-KR"] } });
    assert.equal(readUiLanguage(), "en");
  } finally {
    if (storage) Object.defineProperty(globalThis, "localStorage", storage); else Reflect.deleteProperty(globalThis, "localStorage");
    if (navigator) Object.defineProperty(globalThis, "navigator", navigator); else Reflect.deleteProperty(globalThis, "navigator");
  }
});

test("translated messages and commands follow language changes while operation identities stay stable", async () => {
  const message: UiMessage = { key: "Source view unavailable: {{reason}}", values: { reason: "RAW <detail>" } };
  try {
    await i18n.changeLanguage("ko");
    assert.equal(messageText(message), "소스 보기를 사용할 수 없습니다: RAW <detail>");
    assert.equal(i18n.t("recoveryCount", { count: 2 }), "로컬 복구 기록 2개.");
    for (const query of ["제목", "heading"]) assert.ok(filterInsertCommands(query).some(item => item.id === "heading-2"));
    assert.equal(filterInsertCommands("heading").find(item => item.id === "heading-2")?.label, "제목 2");
    const html = renderToStaticMarkup(<TooltipProvider><TopBar documentPath="test.md" status="saving" unsaved
      view="visual" onViewChange={() => {}} saveDisabled onSave={() => {}} /></TooltipProvider>);
    assert.match(html, /data-operation="saving"/);
    assert.match(html, /저장 중…/);
    assert.match(html, /data-testid="save"/);
    await i18n.changeLanguage("en");
    assert.equal(messageText(message), "Source view unavailable: RAW <detail>");
    assert.equal(i18n.t("recoveryCount", { count: 1 }), "1 local recovery record.");
    assert.equal(i18n.t("recoveryCount", { count: 2 }), "2 local recovery records.");
    assert.ok(filterInsertCommands("그림").some(item => item.id === "figure"));
  } finally { await i18n.changeLanguage("en"); }
});

const noop = () => {};
const PATH = String.raw`C:\docs\guide.md`;
const display = { headingNumbering: false, numberingDisabled: false, onToggleHeadingNumbering: noop, wide: false, onToggleWide: noop };

test("tabs use Host paths, choose the right then left neighbour, and leave an inactive close alone", () => {
  const tabs = [{ id: "a", path: "C:/a/guide.md" }, { id: "b", path: "C:/b/guide.md" }, { id: "c", path: "C:/c/readme.md" }];
  assert.equal(openedTab(tabs, "C:/b/guide.md"), tabs[1]);
  assert.equal(openedTab(tabs, "C:/b/../b/guide.md"), undefined, "normalization is the Host's job");
  assert.equal(activeAfterClose(tabs, "b", "b"), "c");
  assert.equal(activeAfterClose(tabs, "c", "c"), "b");
  assert.equal(activeAfterClose(tabs, "a", "b"), "a");
  assert.equal(activeAfterClose([tabs[0]!], "a", "a"), null);
});

test("same-named files use enough of their parent folders to distinguish them", () => {
  assert.deepEqual(tabNames([{ path: "C:\\one\\guide.md" }, { path: "C:\\two\\guide.md" }, { path: "/readme.md" }]),
    ["guide.md — one", "guide.md — two", "readme.md"]);
  assert.deepEqual(tabNames([{ path: "/a/docs/guide.md" }, { path: "/b/docs/guide.md" }]),
    ["guide.md — a/docs", "guide.md — b/docs"]);
  // The label keeps the folder apart from the name, so the name can give way to it.
  assert.deepEqual(tabLabels([{ path: "C:\\one\\guide.md" }, { path: "C:\\two\\guide.md" }, { path: "/readme.md" }]),
    [{ name: "guide.md", folder: "one" }, { name: "guide.md", folder: "two" }, { name: "readme.md" }]);
});

test("the TopBar location names folders from the chosen folder down, else only the document's own", () => {
  assert.deepEqual(documentLocation(String.raw`C:\work\docs\guides\guide.md`, String.raw`C:\work\docs`), ["docs", "guides"]);
  assert.deepEqual(documentLocation(String.raw`C:\work\docs\index.md`, String.raw`C:\work\docs\\`), ["docs"]);
  assert.deepEqual(documentLocation(String.raw`C:\work\docs-old\index.md`, String.raw`C:\work\docs`), ["docs-old"]);
  assert.deepEqual(documentLocation("/srv/notes/a.md"), ["notes"]);
  assert.deepEqual(documentLocation(""), []);
});

test("pending work includes every tab and opening before a tab exists", () => {
  const clean = { pendingWork: () => null };
  for (const reason of ["unsaved", "draft", "saving", "source", "asset", "opening"]) {
    assert.equal(allTabsPendingWork([clean, { pendingWork: () => reason }, clean], false), reason);
  }
  assert.equal(allTabsPendingWork([clean, clean], false), null);
  assert.equal(allTabsPendingWork([], false), null);
  assert.match(allTabsPendingWork([], true)!, /opening/);
});
test("document session lifetime rejects delayed completions after replacement or disposal, independently of other sessions", async () => {
  const first = createDocumentSessionLifetime();
  const second = createDocumentSessionLifetime();
  const oldEditor = first.capture();
  const otherEditor = second.capture();
  let complete!: () => void;
  const response = new Promise<void>(resolve => { complete = resolve; });
  const completed: string[] = [];
  const oldCompletion = response.then(() => { if (oldEditor()) completed.push("old"); });
  const otherCompletion = response.then(() => { if (otherEditor()) completed.push("other"); });
  first.replace();
  const replacement = first.capture();
  complete();
  await Promise.all([oldCompletion, otherCompletion]);
  assert.deepEqual(completed, ["other"]);
  assert.equal(replacement(), true);

  first.dispose();
  assert.equal(replacement(), false);
  // React StrictMode may set the hook up again; retired callbacks stay retired.
  first.activate();
  assert.equal(oldEditor(), false);
  assert.equal(replacement(), false);
  assert.equal(first.capture()(), true);
  assert.equal(otherEditor(), true);
});

test("only the latest document read can open a session, without retiring its current editor on failure", () => {
  const session = createDocumentSessionLifetime();
  const editor = session.capture();
  const olderRead = session.beginOpen();
  const newerRead = session.beginOpen();
  assert.equal(olderRead(), false);
  assert.equal(newerRead(), true);
  // A failed Open leaves the current editor, its callbacks and drafts usable.
  assert.equal(editor(), true);
  session.replace();
  assert.equal(newerRead(), false);
  assert.equal(editor(), false);
});

test("restricted Host recent folders hide other roots, parent traversal and prefix siblings", () => {
  const recent = ["C:\\docs", "c:/DOCS/sub", "C:\\docs-other", "C:\\docs\\..\\private", "/srv/docs/a", "/srv/Docs/b"];
  assert.deepEqual(visibleRecentFolders(recent), recent);
  assert.deepEqual(visibleRecentFolders(recent, ["C:\\docs", "/srv/docs"]), ["C:\\docs", "c:/DOCS/sub", "/srv/docs/a"]);
  assert.deepEqual(visibleRecentFolders(recent, []), []);
});

test("document path splits for display without changing the address", () => {
  assert.deepEqual(splitDocumentPath("C:\\docs\\guide.md"), { directory: "C:\\docs\\", name: "guide.md" });
  assert.deepEqual(splitDocumentPath("/tmp/a/b.md"), { directory: "/tmp/a/", name: "b.md" });
  assert.deepEqual(splitDocumentPath("b.md"), { directory: "", name: "b.md" });
  assert.equal(unquotePath('  "C:\\문서\\가이드.md"  '), "C:\\문서\\가이드.md");
  assert.equal(unquotePath(" /tmp/my docs/ "), "/tmp/my docs/");
  assert.equal(unquotePath('"unfinished'), '"unfinished');
});

test("sidebar without a folder offers only Open folder, and collapses", () => {
  const open = renderToStaticMarkup(<Sidebar open documentPath={PATH} display={display} onToggle={noop} onOpenFolder={noop} />);
  assert.match(open, /IeumDoc/);
  assert.match(open, />Open folder…</);
  assert.doesNotMatch(open, /Open file…/);
  assert.doesNotMatch(open, /data-testid="folder"/);
  // No app-level full-path New and no second listing of the open document; TopBar names it.
  assert.doesNotMatch(open, />New</);
  assert.doesNotMatch(open, /aria-current/);
  assert.match(open, /id="sidebar-display"[^>]*hidden/);
  assert.match(open, /aria-label="Collapse sidebar"/);
  const collapsed = renderToStaticMarkup(<Sidebar open={false} documentPath={PATH} display={display} onToggle={noop} onOpenFolder={noop} />);
  assert.match(collapsed, /aria-label="Expand sidebar"/);
  assert.doesNotMatch(collapsed, /Open file…|IeumDoc/);
  assert.match(collapsed, /id="sidebar-files"[^>]*hidden/);
  assert.match(collapsed, /id="sidebar-display"[^>]*hidden/);
  for (const label of ["Files", "Display"]) assert.match(collapsed, new RegExp(`aria-label="${label}"`));
});

test("sidebar folder is a tree under the chosen folder that marks the open document once", () => {
  const listing = (path: string, entries: FolderEntry[]) => ({ root: String.raw`C:\docs`, path, entries });
  const root = listing(String.raw`C:\docs`, [
    { name: "guides", kind: "folder", path: String.raw`C:\docs\guides` },
    { name: "specs", kind: "folder", path: String.raw`C:\docs\specs` },
    { name: "guide.md", kind: "document", path: String.raw`C:\docs\guide.md` },
  ]);
  const guides = listing(String.raw`C:\docs\guides`, [
    { name: "guide.md", kind: "document", path: String.raw`C:\docs\guides\guide.md` },
  ]);
  const folder = {
    root: String.raw`C:\docs`,
    nodes: new Map([[root.path, root], [guides.path, guides]]),
    expanded: new Set([guides.path]),
    pending: new Map(),
  };
  const html = renderToStaticMarkup(
    <Sidebar open documentPath={String.raw`C:\docs\guides\guide.md`} display={display} folder={folder} onToggle={noop} onOpenFolder={noop} />,
  );
  assert.match(html, /title="C:\\docs"/);
  assert.match(html, />docs</);
  assert.match(html, /role="tree"/);
  assert.match(html, /<li\b(?=[^>]*role="treeitem")(?=[^>]*aria-level="1")(?=[^>]*aria-expanded="true")[^>]*title="C:\\docs\\guides"/);
  assert.match(html, /<li\b(?=[^>]*role="treeitem")(?=[^>]*aria-level="2")(?=[^>]*aria-current="page")[^>]*title="C:\\docs\\guides\\guide.md"/);
  assert.match(html, /<li\b(?=[^>]*aria-expanded="false")[^>]*title="C:\\docs\\specs"/);
  assert.equal(html.match(/aria-current="page"/g)?.length, 1, "the open document, not the other guide.md");
  // One tab stop, on the open document.
  assert.equal(html.match(/<li\b(?=[^>]*role="treeitem")(?=[^>]*tabindex="0")/g)?.length, 1);
  assert.doesNotMatch(html, /Up to/);
  // New names no folder here: its dialog shows and chooses the destination.
  assert.match(html, /<button\b(?=[^>]*aria-label="New file in folder")(?=[^>]*title="New file…")[^>]*>/);
  assert.match(html, /<button\b(?=[^>]*aria-label="New folder")(?=[^>]*title="New folder…")[^>]*>/);
  // Open folder and Close folder are behind one menu instead of a row of buttons.
  assert.match(html, /<button\b(?=[^>]*aria-label="More actions")(?=[^>]*aria-haspopup="menu")[^>]*>/);
  assert.doesNotMatch(html, /data-testid="sidebar-empty"|>Open file…<|>Close folder</);
  const empty = listing(String.raw`C:\docs`, []);
  const top = renderToStaticMarkup(
    <Sidebar open documentPath={PATH} display={display} folder={{ ...folder, nodes: new Map([[empty.path, empty]]), expanded: new Set() }}
      onToggle={noop} onOpenFolder={noop} />,
  );
  assert.match(top, /No folders or Markdown files/);

  // A file without the native marker stays listed but says it is not an IeumDoc document.
  const mixed = listing(String.raw`C:\docs`, [
    { name: "plain.md", kind: "document", path: String.raw`C:\docs\plain.md`, native: false },
    { name: "note.md", kind: "document", path: String.raw`C:\docs\note.md`, native: true },
  ]);
  const marked = renderToStaticMarkup(
    <Sidebar open documentPath={PATH} display={display} folder={{ ...folder, nodes: new Map([[mixed.path, mixed]]), expanded: new Set() }}
      onToggle={noop} onOpenFolder={noop} />,
  );
  assert.match(marked, /<li\b(?=[^>]*data-foreign="true")(?=[^>]*aria-description="Not an IeumDoc document")[^>]*>/);
  assert.equal(marked.match(/data-foreign/g)?.length, 1, "only the unmarked file");
  try {
    void i18n.changeLanguage("ko");
    const localized = renderToStaticMarkup(
      <Sidebar open documentPath={PATH} display={display} folder={{ ...folder, nodes: new Map([[mixed.path, mixed]]), expanded: new Set() }}
        onToggle={noop} onOpenFolder={noop} />,
    );
    assert.match(localized, /title="C:\\docs\\plain.md\n이음독 문서가 아님"/);
    assert.match(localized, /aria-description="이음독 문서가 아님"/);
  } finally { void i18n.changeLanguage("en"); }
});

test("without a chosen folder, recent folders list again with one click", () => {
  const recent = [String.raw`C:\work\docs`, "/srv/notes/"];
  const html = renderToStaticMarkup(
    <Sidebar open documentPath={PATH} display={display} onToggle={noop} onOpenFolder={noop} recent={recent} onOpenRecent={noop} />,
  );
  assert.match(html, /<button\b(?=[^>]*title="C:\\work\\docs")[^>]*>.*?>docs</);
  assert.match(html, /<button\b(?=[^>]*title="\/srv\/notes\/")[^>]*>.*?>notes</);
  // No recent list without a way to open one.
  assert.doesNotMatch(renderToStaticMarkup(<Sidebar open documentPath={PATH} display={display} onToggle={noop} onOpenFolder={noop} recent={recent} />), /Recent/);
});

test("document panel holds only the outline, and the TopBar Outline toggle shows whether it is open", () => {
  const outline = createOutlineStore();
  outline.set({ items: [{ index: 0, pos: 0, level: 1, text: "Intro" }, { index: 2, pos: 9, level: 2, text: "Detail" }], current: 1 });
  const panel = renderToStaticMarkup(<DocumentPanel overlay={false} outline={outline} onSelectHeading={noop} onClose={noop} />);
  assert.match(panel, />Outline</);
  assert.match(panel, /aria-label="Hide outline"/);
  assert.match(panel, /data-testid="outline"/);
  assert.match(panel, /aria-current="location"[^>]*>Detail</);
  // Outline only: no tabs or other document tools.
  assert.doesNotMatch(panel, /role="tab/);
  for (const open of [true, false]) {
    const html = renderToStaticMarkup(
      <TooltipProvider>
        <TopBar documentPath={PATH} status="ready" view="visual" onViewChange={noop} saveDisabled={false} onSave={noop}
          outline={open} onToggleOutline={noop} />
      </TooltipProvider>,
    );
    assert.match(html, new RegExp(`<button\\b(?=[^>]*aria-label="Outline")(?=[^>]*aria-pressed="${open}")[^>]*>`));
  }
});

test("Display distinguishes document numbering from local width and respects unavailable numbering", () => {
  const html = renderToStaticMarkup(<DisplaySettings {...display} documentPath={PATH} headingNumbering wide />);
  assert.match(html, /guide\.md/);
  assert.match(html, /Saved in document/);
  assert.match(html, /Local view/);
  assert.match(html, /aria-describedby="display-numbering-hint"[^>]*checked/);
  assert.match(html, /aria-describedby="display-width-hint"[^>]*checked/);
  const blocked = renderToStaticMarkup(<DisplaySettings {...display} documentPath="" numberingDisabled numberingHint="Open a document to change numbering." />);
  assert.match(blocked, /No document open/);
  assert.match(blocked, /<input\b(?=[^>]*disabled)(?=[^>]*aria-describedby="display-numbering-hint")[^>]*>/);
  assert.doesNotMatch(blocked, /<input\b(?=[^>]*disabled)(?=[^>]*aria-describedby="display-width-hint")[^>]*>/);
});

test("top bar shows filename while keeping the complete path in its title", () => {
  const html = renderToStaticMarkup(
    <TooltipProvider>
      <TopBar documentPath={PATH} status="ready" view="visual" onViewChange={noop} saveDisabled={false} onSave={noop} />
    </TooltipProvider>,
  );
  assert.match(html, /title="C:\\docs\\guide.md"/);
  assert.match(html, />guide\.md</);
  assert.doesNotMatch(html, /aria-disabled="true"/);
  // Without a document, Save is disabled.
  const blocked = renderToStaticMarkup(
    <TooltipProvider>
      <TopBar documentPath="" status="ready" view="visual" onViewChange={noop} saveDisabled onSave={noop} />
    </TooltipProvider>,
  );
  assert.match(blocked, /No file opened/);
  assert.match(blocked, /<button\b(?=[^>]*data-testid="save")(?=[^>]*disabled="")[^>]*>/);
});

test("status presentation distinguishes loaded, dirty, confirmed save and in-flight/error states", () => {
  for (const [status, unsaved, expected] of [
    ["ready", false, ""], ["ready", true, "Unsaved changes"],
    ["saved", false, "Saved"], ["saved", true, "Unsaved changes"],
    ["saved-pending", true, "Unsaved changes"],
    ["saved-pending", false, "Saved"], // Newer edits undone back to the saved baseline.
    ["saving", true, "Saving…"], ["save-conflict", true, "Save conflict"],
    ["save-failed", true, "Save failed"], ["open-failed", false, "Open failed"],
  ] as const) {
    const html = renderToStaticMarkup(<TooltipProvider><TopBar documentPath={PATH} status={status} unsaved={unsaved}
      view="visual" onViewChange={noop} saveDisabled={false} onSave={noop} /></TooltipProvider>);
    assert.match(html, new RegExp(`role="status"[^>]*>(?:<[^>]+>)*${expected}</`), `${status}, dirty=${unsaved}`);
  }
});

test("top bar exposes the active document view and disables both views during unavailable work", () => {
  const html = renderToStaticMarkup(
    <TooltipProvider>
      <TopBar documentPath={PATH} status="ready" saveDisabled={false} onSave={noop} view="source" onViewChange={noop} />
    </TooltipProvider>,
  );
  assert.match(html, /<[^>]+\b(?=[^>]*role="group")(?=[^>]*aria-label="Document view")[^>]*>/);
  assert.match(html, /<button\b(?=[^>]*data-testid="view-visual")(?=[^>]*aria-pressed="false")[^>]*>/);
  assert.match(html, /<button\b(?=[^>]*data-testid="view-source")(?=[^>]*aria-pressed="true")[^>]*>/);
  assert.match(html, />Visual</);
  assert.match(html, />Source</);
  const blocked = renderToStaticMarkup(
    <TooltipProvider>
      <TopBar documentPath={PATH} status="loading" saveDisabled onSave={noop} view="visual" onViewChange={noop} viewDisabled />
    </TooltipProvider>,
  );
  for (const view of ["visual", "source"]) {
    assert.match(blocked, new RegExp(`<button\\b(?=[^>]*data-testid="view-${view}")(?=[^>]*disabled)[^>]*>`));
  }
});

test("message area separates dismissible errors from expiring notices", () => {
  assert.equal(renderToStaticMarkup(<MessageArea error="" notice="" onDismissError={noop} onNoticeExpired={noop} />), "");
  const html = renderToStaticMarkup(
    <MessageArea error="Save failed" notice="Discarded" onDismissError={noop} onNoticeExpired={noop} />,
  );
  assert.match(html, /<[^>]+\b(?=[^>]*data-testid="error")(?=[^>]*role="alert")[^>]*>/);
  assert.match(html, />Save failed</);
  assert.match(html, /aria-label="Dismiss error"/);
  assert.match(html, /<[^>]+\b(?=[^>]*data-testid="notice")(?=[^>]*role="status")[^>]*>/);
  assert.match(html, />Discarded</);
});

test("message area keeps the writeability warning without a dismiss control", () => {
  const html = renderToStaticMarkup(
    <MessageArea error="" notice="" warning="Cannot save: reason" onDismissError={noop} onNoticeExpired={noop} />,
  );
  assert.match(html, /role="status"/);
  assert.match(html, />Cannot save: reason</);
  assert.doesNotMatch(html, /Dismiss/);
});

test("New dialog renders nothing while closed", () => {
  const html = renderToStaticMarkup(<NewDialog open={false} busy={false} destinations={[{ path: String.raw`C:\docs`, label: "docs" }]} directory={String.raw`C:\docs`} onCreate={async () => ""} onClose={noop} />);
  assert.equal(html, "");
});

test("command menu exposes disabled actions and an empty state", () => {
  const html = renderToStaticMarkup(
    <CommandMenu
      label="Block actions"
      items={[{ id: "delete", label: "Delete", disabled: true }]}
      style={{}}
      onSelect={noop}
      onClose={noop}
    />,
  );
  assert.match(html, /<[^>]+\b(?=[^>]*role="menu")(?=[^>]*aria-label="Block actions")[^>]*>/);
  assert.match(html, /<button\b(?=[^>]*role="menuitem")(?=[^>]*\sdisabled="")[^>]*>/);
  assert.match(html, />Delete</);
  const empty = renderToStaticMarkup(<CommandMenu label="Insert block" items={[]} style={{}} onSelect={noop} onClose={noop} />);
  assert.match(empty, /No matches/);
});
