import assert from "node:assert/strict";
import test from "node:test";
import { activeAfterClose, allTabsPendingWork, openedTab, tabLabels, tabNames } from "../src/document-tabs.ts";

import { renderToStaticMarkup } from "react-dom/server";
import type { FolderEntry } from "../shared/document-protocol.ts";
import { CommandMenu } from "../src/CommandMenu.tsx";
import { TooltipProvider } from "../src/components/ui/tooltip.tsx";
import { createOutlineStore } from "../src/outline.ts";
import { createDocumentSessionLifetime } from "../src/document-session.ts";
import { readCollapsedFolderSections, readOpenTabs, visibleRecentFolders, writeCollapsedFolderSections, writeOpenTabs } from "../src/preferences.ts";
import { DocumentPanel } from "../src/shell/DocumentPanel.tsx";
import { DisplaySettings } from "../src/shell/DisplaySettings.tsx";
import { DocumentSettings } from "../src/shell/DocumentSettings.tsx";
import { documentLocation, splitDocumentPath, unquotePath } from "../src/shell/document-path.ts";
import { MessageArea } from "../src/shell/MessageArea.tsx";
import { SaveDisplayError } from "../src/save-error.ts";
import { SaveContentError } from "../shared/save-error.ts";
import { NewDialog } from "../src/shell/NewDialog.tsx";
import { Sidebar } from "../src/shell/Sidebar.tsx";
import { TopBar } from "../src/shell/TopBar.tsx";
import { i18n } from "../src/i18n.ts";
import { en, ko } from "../src/locales.ts";
import { messageText, type UiMessage } from "../src/ui-message.ts";
import { ACCENT_COLORS, ACCENT_COLOR_KEY, readAccentColor, writeAccentColor, readUiLanguage, writeUiLanguage, UI_LANGUAGE_KEY } from "../src/preferences.ts";
import { filterInsertCommands } from "../src/block-commands.ts";
import { FileText } from "lucide-react";
import { filterCommandCenterItems, type CommandCenterItem } from "../src/shell/command-center.ts";
import { COMMAND_CENTER_SHORTCUT, EDITOR_SHORTCUTS, LINK_SHORTCUT, PROPERTY_APPLY_SHORTCUT, SAVE_SHORTCUT, UNDO_SHORTCUT, REDO_SHORTCUT, shortcutLabel } from "../src/shortcuts.ts";
import { KeyboardShortcutGroups, keyboardShortcutGroups } from "../src/shell/KeyboardShortcutsDialog.tsx";
import { SelectionToolbar } from "../src/SelectionToolbar.tsx";
import { extensions, flattenExtensions, getExtensionField, type Editor } from "@tiptap/core";
import { createEditorExtensions } from "../src/editor-schema.tsx";

const normalizeBinding = (binding: string) => binding.toLowerCase().split("-").sort().join("-");
function registeredBindings() {
  // Core enables these exported extensions; exclude the exported PluginKey, which has no type.
  // Include createEditorExtensions so application keymaps such as documentInteraction are audited.
  const core = Object.values(extensions).filter(extension => "type" in extension) as typeof extensions.Keymap[];
  return new Set(flattenExtensions([...core, ...createEditorExtensions({type:"doc",content:[]}, () => {})]).flatMap(extension => {
    const keymap = getExtensionField<() => Record<string, unknown>>(extension, "addKeyboardShortcuts", {
      name: extension.name, options: extension.options, storage: extension.storage,
    });
    return keymap ? Object.keys(keymap()).map(normalizeBinding) : [];
  }));
}

test("displayed shortcuts match existing bindings on Windows and macOS", () => {
  const navigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  try {
    for (const mac of [false, true]) {
      Object.defineProperty(globalThis, "navigator", {configurable:true, value:{platform:mac ? "MacIntel" : "Win32", userAgent:"test"}});
      const registered = registeredBindings();
      // Shell handlers use these shared definitions outside the engine keymap.
      for (const shortcut of [COMMAND_CENTER_SHORTCUT, SAVE_SHORTCUT, LINK_SHORTCUT, PROPERTY_APPLY_SHORTCUT]) registered.add(normalizeBinding(shortcut.binding));
      for (const group of keyboardShortcutGroups()) for (const entry of group.entries) for (const shortcut of entry.shortcuts) {
        assert.equal(shortcut.label, shortcutLabel(shortcut.binding, mac));
        assert.ok(registered.has(normalizeBinding(shortcut.binding)), `Unregistered ${mac ? "macOS" : "Windows"} guide binding: ${shortcut.binding}`);
      }
    }
  } finally {
    if (navigator) Object.defineProperty(globalThis, "navigator", navigator); else Reflect.deleteProperty(globalThis, "navigator");
  }
});

test("the guide retains the curated IeumDoc editing commands", () => {
  const labels = new Set(keyboardShortcutGroups().flatMap(group => group.entries.map(entry => entry.label)));
  for (const label of ["Command center", "Save", "Undo", "Redo", "New block", "Apply properties", "Line break",
    "Heading level / list indent", "Bullet list", "Numbered list", "Code block", "Go to document end",
    "Bold", "Italic", "Strikethrough", "Inline code", "Link", "Subscript", "Superscript", "Next / previous cell"] as const) {
    assert.ok(labels.has(label), `Missing curated command: ${label}`);
  }
});

test("shortcut guide and formatting tooltips display shared labels for existing bindings", async () => {
  const escape = (text: string) => text.replaceAll("&", "&amp;").replaceAll("'", "&#x27;").replaceAll('"', "&quot;");
  const toolbar = renderToStaticMarkup(<SelectionToolbar editor={{ isActive: () => false } as unknown as Editor}
    style={{}} toolbarRef={{current:null}} onLeave={() => {}} onReject={() => {}} onEditLink={() => {}} onEditReference={() => {}} />);
  for (const shortcut of Object.values(EDITOR_SHORTCUTS)) {
    assert.equal(shortcut.label, shortcutLabel(shortcut.binding));
  }
  for (const key of ["bold", "italic", "strike", "code", "subscript", "superscript"] as const) {
    assert.ok(toolbar.includes(escape(`(${EDITOR_SHORTCUTS[key].label})`)));
    assert.ok(toolbar.includes(EDITOR_SHORTCUTS[key].aria));
  }
  try {
    for (const language of ["en", "ko"]) {
      await i18n.changeLanguage(language);
      const guide = renderToStaticMarkup(<KeyboardShortcutGroups />);
      for (const shortcut of keyboardShortcutGroups().flatMap(group => group.entries.flatMap(entry => entry.shortcuts))) {
        assert.ok(guide.includes(escape(shortcut.label)), `${language}: missing ${shortcut.label}`);
      }
      assert.ok(guide.includes(i18n.t("Line break")));
    }
  } finally { await i18n.changeLanguage("en"); }
  // A changed shared label must reach both surfaces; equal hand-written strings would fail.
  const shortcuts = [COMMAND_CENTER_SHORTCUT, SAVE_SHORTCUT, LINK_SHORTCUT, ...Object.values(EDITOR_SHORTCUTS)];
  const descriptors = shortcuts.map(shortcut => Object.getOwnPropertyDescriptor(shortcut, "label")!);
  try {
    shortcuts.forEach((shortcut, index) => Object.defineProperty(shortcut, "label", { configurable: true, value: `shared label ${index}` }));
    const guide = renderToStaticMarkup(<KeyboardShortcutGroups />);
    const sharedToolbar = renderToStaticMarkup(<SelectionToolbar editor={{ isActive: () => false } as unknown as Editor}
      style={{}} toolbarRef={{current:null}} onLeave={() => {}} onReject={() => {}} onEditLink={() => {}} onEditReference={() => {}} />);
    for (const shortcut of keyboardShortcutGroups().flatMap(group => group.entries.flatMap(entry => entry.shortcuts))) assert.ok(guide.includes(shortcut.label));
    for (const key of ["bold", "italic", "strike", "code", "subscript", "superscript"] as const) {
      assert.ok(sharedToolbar.includes(EDITOR_SHORTCUTS[key].label), `${key} tooltip must read the shared label`);
    }
  } finally { shortcuts.forEach((shortcut, index) => Object.defineProperty(shortcut, "label", descriptors[index]!)); }
  assert.equal(shortcutLabel(EDITOR_SHORTCUTS.undo.binding, false), "Ctrl+Z");
  assert.equal(shortcutLabel(EDITOR_SHORTCUTS.redoAlternative.binding, true), "⌘Shift+Z");
  assert.equal(shortcutLabel("Mod-'", true), "⌘'");
});

test("property Apply uses the platform modifier and excludes composition and extra modifiers", () => {
  for (const mac of [false, true]) {
    const key = (overrides: Partial<KeyboardEvent>) => ({ key: "Enter", ctrlKey: !mac, metaKey: mac,
      shiftKey: false, altKey: false, isComposing: false, ...overrides }) as KeyboardEvent;
    assert.equal(PROPERTY_APPLY_SHORTCUT.matches(key({}), mac), true);
    for (const overrides of [{isComposing:true}, {shiftKey:true}, {altKey:true}, {ctrlKey:mac,metaKey:!mac},
      {ctrlKey:true,metaKey:true}, {ctrlKey:false,metaKey:false}, {key:"Process"}]) {
      assert.equal(PROPERTY_APPLY_SHORTCUT.matches(key(overrides), mac), false);
    }
    assert.equal(shortcutLabel(PROPERTY_APPLY_SHORTCUT.binding, mac), mac ? "⌘Enter" : "Ctrl+Enter");
  }
});

test("shell shortcuts follow characters and preserve layout-specific browser accelerators", () => {
  const key = (overrides: Partial<KeyboardEvent>) => ({ code: "Slash", key: "/", keyCode: 191, ctrlKey: true,
    metaKey: false, altKey: false, shiftKey: false, isComposing: false, ...overrides }) as KeyboardEvent;
  assert.equal(COMMAND_CENTER_SHORTCUT.matches(key({})), true);
  assert.equal(COMMAND_CENTER_SHORTCUT.matches(key({ ctrlKey: false, metaKey: true })), true);
  assert.equal(LINK_SHORTCUT.matches(key({ code: "Quote", key: "'", keyCode: 222 })), true);
  assert.equal(LINK_SHORTCUT.matches(key({ code: "Quote", key: "'", keyCode: 222, ctrlKey: false, metaKey: true })), true);
  assert.equal(COMMAND_CENTER_SHORTCUT.matches(key({ key: "-", keyCode: 189 })), false, "German zoom out");
  assert.equal(LINK_SHORTCUT.matches(key({ code: "Quote", key: "ä", keyCode: 222 })), false, "German umlaut");
  assert.equal(LINK_SHORTCUT.matches(key({ code: "Digit4", key: "'", keyCode: 52 })), false, "French tab 4");
  assert.equal(COMMAND_CENTER_SHORTCUT.matches(key({ code: "Digit7", shiftKey: true })), false, "German shifted slash");
  assert.equal(LINK_SHORTCUT.matches(key({ code: "Backslash", key: "'", keyCode: 220, shiftKey: true })), false, "German shifted apostrophe");
  assert.equal(COMMAND_CENTER_SHORTCUT.matches(key({ key: "／" })), false, "Full-width punctuation is a different character");
  for (const shortcut of [COMMAND_CENTER_SHORTCUT, LINK_SHORTCUT]) {
    const code = shortcut === COMMAND_CENTER_SHORTCUT ? "Slash" : "Quote";
    const character = code === "Slash" ? "/" : "'";
    const keyCode = code === "Slash" ? 191 : 222;
    const event = { code, key: character, keyCode };
    assert.equal(shortcut.matches(key({ ...event, isComposing: true })), false);
    assert.equal(shortcut.matches(key({ ...event, altKey: true })), false);
    assert.equal(shortcut.matches(key({ ...event, shiftKey: true })), false);
    assert.equal(shortcut.matches(key({ ...event, ctrlKey: false })), false);
    assert.equal(shortcut.matches(key({ ...event, code: "KeyL" })), true, "Visible character owns the binding");
    for (const opaque of ["Process", "Unidentified"]) {
      for (const imeCode of [0, 229, keyCode]) {
        assert.equal(shortcut.matches(key({ code, key: opaque, keyCode: imeCode })), true);
      }
      for (const reserved of [189, 187, 109, 107, 48, 52, 75, 76, 80]) {
        assert.equal(shortcut.matches(key({ code, key: opaque, keyCode: reserved })), false, "IME cannot mask a browser accelerator");
      }
      assert.equal(shortcut.matches(key({ code: "KeyL", key: opaque, keyCode: 229 })), false);
    }
  }
  for (const [shortcut, code, character, virtualKey] of [
    [REDO_SHORTCUT, "KeyY", "y", 89], [UNDO_SHORTCUT, "KeyZ", "z", 90],
  ] as const) {
    const matches = (overrides: Partial<KeyboardEvent>) => shortcut.matches(
      key({ code, key: "Process", keyCode: 229, ...overrides }), { opaqueOnly: true });
    for (const opaque of ["Process", "Unidentified"]) {
      for (const keyCode of [0, 229]) assert.equal(matches({ key: opaque, keyCode }), true);
    }
    for (const guard of [
      { key: character }, { key: "q" }, { keyCode: virtualKey }, { keyCode: 81 },
      { code: "KeyQ" }, { isComposing: true }, { altKey: true }, { shiftKey: true },
      { ctrlKey: false },
    ]) assert.equal(matches(guard), false, JSON.stringify(guard));
  }
});

test("tab preferences distinguish absent/empty memory and tolerate malformed or unavailable storage", () => {
  const storage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  let saved: string | null = null;
  try {
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
      getItem: () => saved, setItem: (_key: string, value: string) => { saved = value; },
    } });
    assert.equal(readOpenTabs(), null);
    writeOpenTabs({ paths: [], activePath: null });
    assert.deepEqual(readOpenTabs(), { paths: [], activePath: null });
    for (const invalid of ["{broken", "[]", "null", '{"paths":false}']) {
      saved = invalid; assert.equal(readOpenTabs(), null);
    }
    saved = JSON.stringify({ paths: ["/a.md", 42, "", "/a.md", "/b.md"], activePath: "/missing.md" });
    assert.deepEqual(readOpenTabs(), { paths: ["/a.md", "/b.md"], activePath: null });
    Object.defineProperty(globalThis, "localStorage", { configurable: true, get() { throw Error("blocked"); } });
    assert.equal(readOpenTabs(), null);
    assert.doesNotThrow(() => writeOpenTabs({ paths: ["/a.md"], activePath: "/a.md" }));
  } finally {
    if (storage) Object.defineProperty(globalThis, "localStorage", storage); else Reflect.deleteProperty(globalThis, "localStorage");
  }
});

test("collapsed section preferences contain only root paths and tolerate malformed or unavailable storage", () => {
  const storage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  let saved: string | null = null;
  try {
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
      getItem: () => saved, setItem: (key: string, value: string) => {
        assert.equal(key, "ieumdoc.collapsedFolderSections"); saved = value;
      },
    } });
    assert.deepEqual(readCollapsedFolderSections(), []);
    writeCollapsedFolderSections(["/r", "C:\\docs"]);
    assert.deepEqual(JSON.parse(saved!), ["/r", "C:\\docs"]);
    assert.deepEqual(readCollapsedFolderSections(), ["/r", "C:\\docs"]);
    for (const invalid of ["{broken", "{}", "null"]) {
      saved = invalid; assert.deepEqual(readCollapsedFolderSections(), []);
    }
    saved = JSON.stringify(["/r", 42, "", "/r"]);
    assert.deepEqual(readCollapsedFolderSections(), ["/r"]);
    Object.defineProperty(globalThis, "localStorage", { configurable: true, get() { throw Error("blocked"); } });
    assert.deepEqual(readCollapsedFolderSections(), []);
    assert.doesNotThrow(() => writeCollapsedFolderSections(["/r"]));
  } finally {
    if (storage) Object.defineProperty(globalThis, "localStorage", storage); else Reflect.deleteProperty(globalThis, "localStorage");
  }
});

test("command center searches document paths and translated commands, with an explicit command-only prefix", () => {
  const items: CommandCenterItem[] = [
    { id: "document", kind: "document", label: "save-guide.md", detail: "C:/guides/문서/save-guide.md", icon: FileText, run() {} },
    { id: "save", kind: "command", label: "저장", keywords: ["save"], disabled: true, icon: FileText, run() {} },
    { id: "copy", kind: "command", label: "Copy path", keywords: ["경로 복사"], icon: FileText, run() {} },
  ];
  const ids = (query: string) => filterCommandCenterItems(items, query).map(item => item.id);
  assert.deepEqual(ids("SAVE"), ["document", "save"]);
  assert.deepEqual(ids("> SAVE"), ["save"]);
  assert.deepEqual(ids("저장"), ["save"]);
  assert.deepEqual(ids("문서 GUIDE"), ["document"]);
  assert.deepEqual(ids("> 경로 복사"), ["copy"]);
  assert.deepEqual(ids("unknown"), []);
  assert.equal(filterCommandCenterItems(items, "> save")[0]?.disabled, true);
  const ranked: CommandCenterItem[] = [
    { id: "path", kind: "file", label: "guide.md", detail: "C:/settings/guide.md", icon: FileText, run() {} },
    { id: "refresh", kind: "command", label: "Refresh folder", detail: "C:/settings", icon: FileText, run() {} },
    { id: "alias", kind: "command", label: "설정", keywords: ["settings"], icon: FileText, run() {} },
    { id: "settings", kind: "command", label: "Settings", icon: FileText, run() {} },
    { id: "document-settings", kind: "command", label: "Document settings…", icon: FileText, run() {} },
    { id: "named-file", kind: "document", label: "settings.md", icon: FileText, run() {} },
  ];
  const order = (query: string) => filterCommandCenterItems(ranked, query).map(item => item.id);
  assert.deepEqual(order("ＳＥＴＴＩＮＧＳ"), ["settings", "document-settings", "named-file", "path", "refresh", "alias"]);
  assert.deepEqual(order("> settings"), ["settings", "document-settings", "refresh", "alias"]);
  assert.deepEqual(order(""), ranked.map(item => item.id));
  assert.deepEqual(order(">"), ["refresh", "alias", "settings", "document-settings"]);
});

test("bundled languages cover keys and interpolation parameters without relying on fallback", () => {
  assert.deepEqual(Object.keys(ko).sort(), Object.keys(en).sort());
  const parameters = (text: string) => [...new Set([...text.matchAll(/{{([^}]+)}}/g)].map(match => match[1]))].sort();
  for (const key of Object.keys(en) as (keyof typeof en)[]) {
    assert.ok(ko[key].trim(), key);
    assert.deepEqual(parameters(ko[key]), parameters(en[key]), key);
    assert.equal(i18n.getResource("ko", "translation", key), ko[key], key);
  }
});

test("accent preference defaults safely and remembers only a validated preset", () => {
  const storage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const values = new Map<string, string>();
  try {
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
      getItem: (key: string) => values.get(key), setItem: (key: string, value: string) => values.set(key, value),
    } });
    assert.equal(readAccentColor(), "blue");
    for (const color of ACCENT_COLORS) {
      assert.equal(writeAccentColor(color), true);
      assert.equal(values.get(ACCENT_COLOR_KEY), color);
      assert.equal(readAccentColor(), color);
    }
    values.set(ACCENT_COLOR_KEY, "unrecognized");
    assert.equal(readAccentColor(), "blue");
    Object.defineProperty(globalThis, "localStorage", { configurable: true, get() { throw Error("blocked"); } });
    assert.equal(readAccentColor(), "blue");
    assert.equal(writeAccentColor("teal"), false);
  } finally {
    if (storage) Object.defineProperty(globalThis, "localStorage", storage); else Reflect.deleteProperty(globalThis, "localStorage");
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
  const open = renderToStaticMarkup(<Sidebar onFileAction={async () => ""} fileActionsDisabled={false} isFileDirty={() => false} open documentPath={PATH} onToggle={noop} onOpenFolder={noop} />);
  assert.match(open, />Files</);
  assert.match(open, /<button\b(?=[^>]*aria-label="Open folder…")(?=[^>]*title="Open folder…")/);
  assert.doesNotMatch(open, /Open file…/);
  assert.doesNotMatch(open, /data-testid="folder"/);
  // No app-level full-path New and no second listing of the open document; TopBar names it.
  assert.doesNotMatch(open, />New</);
  assert.doesNotMatch(open, /aria-current/);
  assert.doesNotMatch(open, /sidebar-tools|sidebar-display|aria-label="Display"/);
  assert.match(open, /aria-label="Collapse sidebar"/);
  const collapsed = renderToStaticMarkup(<Sidebar onFileAction={async () => ""} fileActionsDisabled={false} isFileDirty={() => false} open={false} documentPath={PATH} onToggle={noop} onOpenFolder={noop} onSettings={noop} />);
  assert.match(collapsed, /aria-label="Expand sidebar"/);
  assert.doesNotMatch(collapsed, /Open file…|IeumDoc/);
  assert.match(collapsed, /id="sidebar-files"[^>]*hidden/);
  assert.doesNotMatch(collapsed, /sidebar-tools|sidebar-display|aria-label="Display"|aria-label="Settings"/);
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
    sectionExpanded: true,
    nodes: new Map([[root.path, root], [guides.path, guides]]),
    expanded: new Set([guides.path]),
    pending: new Map(),
  };
  const html = renderToStaticMarkup(
    <Sidebar onFileAction={async () => ""} fileActionsDisabled={false} isFileDirty={() => false} open documentPath={String.raw`C:\docs\guides\guide.md`} folders={[folder]} onToggle={noop} onOpenFolder={noop} onNewDocument={noop} />,
  );
  assert.match(html, /title="C:\\docs"/);
  assert.match(html, />docs</);
  assert.match(html, /role="tree"/);
  assert.doesNotMatch(html, />New document…<\/button>/, "Opened folders have no duplicate New document row");
  assert.match(html, /<button\b(?=[^>]*aria-label="Collapse folder docs")(?=[^>]*aria-expanded="true")(?=[^>]*aria-controls="[^"]+")/);
  assert.match(html, /<li\b(?=[^>]*role="treeitem")(?=[^>]*aria-level="1")(?=[^>]*aria-expanded="true")[^>]*title="C:\\docs\\guides"/);
  assert.match(html, /<li\b(?=[^>]*role="treeitem")(?=[^>]*aria-level="2")(?=[^>]*aria-current="page")[^>]*title="C:\\docs\\guides\\guide.md"/);
  assert.match(html, /<li\b(?=[^>]*aria-expanded="false")[^>]*title="C:\\docs\\specs"/);
  assert.equal(html.match(/aria-current="page"/g)?.length, 1, "the open document, not the other guide.md");
  // One tab stop, on the open document.
  assert.equal(html.match(/<li\b(?=[^>]*role="treeitem")(?=[^>]*tabindex="0")/g)?.length, 1);
  assert.doesNotMatch(html, /Up to/);
  // New names no folder here: its dialog shows and chooses the destination.
  assert.match(html, /<button\b(?=[^>]*aria-label="New document…")(?=[^>]*title="New document…")[^>]*>/);
  assert.doesNotMatch(html, /<button\b[^>]*aria-label="New folder"/, "New folder belongs in the menu, leaving more root-name space");
  // More actions collects folder creation/opening/refresh/close; no duplicate Open button is shown.
  assert.match(html, /<button\b(?=[^>]*aria-label="More actions")(?=[^>]*aria-haspopup="menu")[^>]*>/);
  assert.doesNotMatch(html, /data-testid="sidebar-empty"|>Open file…<|>Close folder</);
  const empty = listing(String.raw`C:\docs`, []);
  const top = renderToStaticMarkup(
    <Sidebar onFileAction={async () => ""} fileActionsDisabled={false} isFileDirty={() => false} open documentPath={PATH} folders={[{ ...folder, nodes: new Map([[empty.path, empty]]), expanded: new Set() }]}
      onToggle={noop} onOpenFolder={noop} />,
  );
  assert.match(top, /No files or folders/);
  const collapsed = renderToStaticMarkup(
    <Sidebar onFileAction={async () => ""} fileActionsDisabled={false} isFileDirty={() => false} open documentPath={PATH} folders={[{ ...folder, sectionExpanded: false }]}
      onToggle={noop} onOpenFolder={noop} />,
  );
  assert.match(collapsed, /<ul\b(?=[^>]*role="tree")(?=[^>]*hidden)/);
  assert.match(collapsed, /aria-label="Expand folder docs"/);

  // A file without the native marker stays listed but says it is not an IeumDoc document.
  const mixed = listing(String.raw`C:\docs`, [
    { name: "plain.md", kind: "document", path: String.raw`C:\docs\plain.md`, native: false },
    { name: "note.md", kind: "document", path: String.raw`C:\docs\note.md`, native: true },
  ]);
  const marked = renderToStaticMarkup(
    <Sidebar onFileAction={async () => ""} fileActionsDisabled={false} isFileDirty={() => false} open documentPath={PATH} folders={[{ ...folder, nodes: new Map([[mixed.path, mixed]]), expanded: new Set() }]}
      onToggle={noop} onOpenFolder={noop} />,
  );
  assert.match(marked, /<li\b(?=[^>]*data-foreign="true")(?=[^>]*aria-description="Not an IeumDoc document")[^>]*>/);
  assert.equal(marked.match(/data-foreign/g)?.length, 1, "only the unmarked file");
  try {
    void i18n.changeLanguage("ko");
    const localized = renderToStaticMarkup(
      <Sidebar onFileAction={async () => ""} fileActionsDisabled={false} isFileDirty={() => false} open documentPath={PATH} folders={[{ ...folder, nodes: new Map([[mixed.path, mixed]]), expanded: new Set() }]}
        onToggle={noop} onOpenFolder={noop} />,
    );
    assert.match(localized, /title="C:\\docs\\plain.md\n이음독 문서가 아님"/);
    assert.match(localized, /aria-description="이음독 문서가 아님"/);
    assert.match(localized, /aria-label="docs 폴더 접기"/);
  } finally { void i18n.changeLanguage("en"); }
});

test("without a chosen folder, recent folders list again with one click", () => {
  const recent = [String.raw`C:\work\docs`, "/srv/notes/"];
  const html = renderToStaticMarkup(
    <Sidebar onFileAction={async () => ""} fileActionsDisabled={false} isFileDirty={() => false} open documentPath={PATH} onToggle={noop} onOpenFolder={noop} recent={recent} onOpenRecent={noop} />,
  );
  assert.match(html, /<button\b(?=[^>]*title="C:\\work\\docs")[^>]*>.*?>docs</);
  assert.match(html, /<button\b(?=[^>]*title="\/srv\/notes\/")[^>]*>.*?>notes</);
  // No recent list without a way to open one.
  assert.doesNotMatch(renderToStaticMarkup(<Sidebar onFileAction={async () => ""} fileActionsDisabled={false} isFileDirty={() => false} open documentPath={PATH} onToggle={noop} onOpenFolder={noop} recent={recent} />), /Recent/);
});

test("document panel offers navigation lists, and the TopBar Outline toggle shows whether it is open", () => {
  const outline = createOutlineStore();
  outline.set({ items: [{ index: 0, pos: 0, level: 1, text: "Intro" }, { index: 2, pos: 9, level: 2, text: "Detail" }], current: 1, tables: { items: [], current: -1 }, figures: { items: [], current: -1 } });
  const panel = renderToStaticMarkup(<DocumentPanel overlay={false} outline={outline} onSelectItem={noop} onClose={noop} />);
  assert.match(panel, />Outline</);
  assert.doesNotMatch(panel, /aria-label="Hide outline"/);
  assert.match(panel, /data-testid="outline"/);
  const currentText = panel.match(/<button\b[^>]*aria-current="location"[^>]*>([\s\S]*?)<\/button>/)?.[1];
  assert.equal(currentText?.replace(/<[^>]+>/g, ""), "Detail");
  assert.match(panel, /role="tablist"/);
  assert.match(panel, /aria-controls="document-panel-list-tables"/);
  assert.match(panel, />Tables 0</);
  assert.match(panel, />Figures 0</);
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

test("document settings renders grouped fields independently of placement", () => {
  const html = renderToStaticMarkup(<DisplaySettings disabled={false} groups={[{label: "Behavior", fields: [
    {id: "numbers", label: "Number headings", summary: "Save to keep changes", control: {kind: "checkbox", checked: true, onChange: noop}},
    {id: "resource", label: "Bibliography", summary: "refs.bib", control: {kind: "custom", render: id => <button aria-describedby={id}>Connect</button>}},
  ]}]} />);
  assert.match(html, /<legend[^>]*>Behavior/);
  assert.match(html, /checked=""/);
  assert.match(html, /refs.bib/);
  assert.match(html, /aria-describedby=/);
});

test("document settings summarizes current values and readonly has no editable controls", () => {
  const props = {expanded: false, onExpandedChange: noop, readOnly: false, disabled: false, headingNumbering: true,
    referenceTemplates: {figure: "Fig. %s", table: "Table %s", equation: "(%s)"}, bibliography: ["refs.bib"],
    onToggleHeadingNumbering: noop, onReferenceStyleChange: noop, onConnectBibliography: noop};
  const html = renderToStaticMarkup(<DocumentSettings {...props} />);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /Numbered headings · Concise references · refs.bib/);
  const readonly = renderToStaticMarkup(<DocumentSettings {...props} readOnly />);
  assert.doesNotMatch(readonly, /aria-expanded=|<input|<button/);
  assert.match(readonly, /Numbered headings · Concise references · refs.bib/);
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
    <MessageArea error="Save failed" notice="Table deleted" noticeAction={noop} onDismissError={noop} onNoticeExpired={noop} />,
  );
  assert.match(html, /<[^>]+\b(?=[^>]*data-testid="error")(?=[^>]*role="alert")[^>]*>/);
  assert.match(html, />Save failed</);
  assert.match(html, /aria-label="Dismiss error"/);
  assert.match(html, /<[^>]+\b(?=[^>]*data-testid="notice")(?=[^>]*role="status")[^>]*>/);
  assert.match(html, />Table deleted</);
  assert.match(html, /<button[^>]*>Undo<\/button>/);
});

test("message area keeps the writeability warning without a dismiss control", () => {
  const html = renderToStaticMarkup(
    <MessageArea error="" notice="" warning="Cannot save: reason" onDismissError={noop} onNoticeExpired={noop} />,
  );
  assert.match(html, /role="status"/);
  assert.match(html, />Cannot save: reason</);
  assert.doesNotMatch(html, /Dismiss/);
});

test("save failures expose a list of navigation targets and collapsed unchanged technical details", async () => {
  const failure = new SaveDisplayError([
    new SaveContentError("Original Core reason.", undefined, { block: { index: 0, type: "table" }, action: "Original action." }),
    new SaveContentError("Another reason.", undefined, { block: { index: 2, type: "heading" } }),
  ]);
  try {
    await i18n.changeLanguage("ko");
    const html = renderToStaticMarkup(<MessageArea error={failure.message} notice=""
      saveError={{ failure, locations: failure.locations, onReveal: noop }} onDismissError={noop} onNoticeExpired={noop} />);
    assert.match(html, /\(표\)/);
    assert.match(html, /\(제목\)/);
    assert.match(html, /문제 위치로 이동/);
    assert.match(html, /aria-label="이전 문제"/);
    assert.match(html, /aria-label="다음 문제"/);
    assert.match(html, /<details[^>]*><summary>기술적 세부 정보<\/summary><p>Original Core reason\. Original action\./);
    assert.doesNotMatch(html, /<details[^>]*\bopen/);
    const stale = renderToStaticMarkup(<MessageArea error={failure.message} notice=""
      saveError={{ failure, locations: [], onReveal: noop }} onDismissError={noop} onNoticeExpired={noop} />);
    assert.match(stale, /문서가 변경되었습니다/);
    assert.doesNotMatch(stale, /문제 위치로 이동|aria-label="다음 문제"/);
  } finally { await i18n.changeLanguage("en"); }
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
