import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { CommandMenu } from "../src/CommandMenu.tsx";
import { TooltipProvider } from "../src/components/ui/tooltip.tsx";
import { splitDocumentPath } from "../src/shell/document-path.ts";
import { MessageArea } from "../src/shell/MessageArea.tsx";
import { NewDialog } from "../src/shell/NewDialog.tsx";
import { OpenDialog } from "../src/shell/OpenDialog.tsx";
import { Sidebar } from "../src/shell/Sidebar.tsx";
import { TopBar } from "../src/shell/TopBar.tsx";

const noop = () => {};
const PATH = String.raw`C:\docs\guide.md`;

test("document path splits for display without changing the address", () => {
  assert.deepEqual(splitDocumentPath("C:\\docs\\guide.md"), { directory: "C:\\docs\\", name: "guide.md" });
  assert.deepEqual(splitDocumentPath("/tmp/a/b.md"), { directory: "/tmp/a/", name: "b.md" });
  assert.deepEqual(splitDocumentPath("b.md"), { directory: "", name: "b.md" });
});

test("sidebar holds only product, Open and the current document, and collapses", () => {
  const open = renderToStaticMarkup(<Sidebar open documentPath={PATH} onToggle={noop} onOpen={noop} onNew={noop} />);
  assert.match(open, /IeumDoc/);
  assert.match(open, />Open…</);
  assert.match(open, />New</);
  assert.match(open, /aria-current="page"/);
  assert.match(open, /title="C:\\docs\\guide.md"/);
  assert.match(open, />guide\.md</);
  assert.match(open, /aria-label="Collapse sidebar"/);
  const collapsed = renderToStaticMarkup(<Sidebar open={false} documentPath={PATH} onToggle={noop} onOpen={noop} onNew={noop} />);
  assert.match(collapsed, /aria-label="Expand sidebar"/);
  assert.doesNotMatch(collapsed, /Open…|guide\.md|IeumDoc/);
});

test("top bar shows filename while keeping the complete path in its title", () => {
  const html = renderToStaticMarkup(
    <TooltipProvider>
      <TopBar documentPath={PATH} status="Ready" view="visual" onViewChange={noop} saveDisabled={false} onSave={noop} />
    </TooltipProvider>,
  );
  assert.match(html, /title="C:\\docs\\guide.md"/);
  assert.match(html, />guide\.md</);
  assert.doesNotMatch(html, /aria-disabled="true"/);
  // The disabled Save button keeps focus/hover so its Tooltip is reachable; the tooltip's
  // own text only mounts in a browser (see docs/test/TEST_GUIDE.md's Editor UX Shell v1 section).
  const blocked = renderToStaticMarkup(
    <TooltipProvider>
      <TopBar documentPath="" status="Ready" view="visual" onViewChange={noop} saveDisabled saveHint="No document is open." onSave={noop} />
    </TooltipProvider>,
  );
  assert.match(blocked, /No file opened/);
  assert.match(blocked, /<button\b(?=[^>]*data-testid="save")(?=[^>]*aria-disabled="true")(?=[^>]*tabindex="0")[^>]*>/);
});

test("status presentation distinguishes loaded, dirty, confirmed save and in-flight/error states", () => {
  for (const [status, unsaved, expected] of [
    ["Ready", false, ""], ["Ready", true, "Unsaved changes"],
    ["Saved", false, "Saved"], ["Saved", true, "Unsaved changes"],
    ["Saved; newer edits pending", true, "Unsaved changes"],
    ["Saved; newer edits pending", false, "Saved"], // Newer edits undone back to the saved baseline.
    ["Saving…", true, "Saving…"], ["Save conflict", true, "Save conflict"],
    ["Save failed", true, "Save failed"], ["Load failed", false, "Load failed"],
  ] as const) {
    const html = renderToStaticMarkup(<TooltipProvider><TopBar documentPath={PATH} status={status} unsaved={unsaved}
      view="visual" onViewChange={noop} saveDisabled={false} onSave={noop} /></TooltipProvider>);
    assert.match(html, new RegExp(`role="status"[^>]*>(?:<[^>]+>)*${expected}</`), `${status}, dirty=${unsaved}`);
  }
});

test("an unwritable document shows Cannot save in place of the idle states", () => {
  for (const [status, unsaved, expected] of [
    ["Ready", false, "Cannot save"], ["Ready", true, "Cannot save"],
    ["Opening…", false, "Opening…"], ["Open failed", false, "Open failed"],
  ] as const) {
    const html = renderToStaticMarkup(<TooltipProvider><TopBar documentPath={PATH} status={status} unsaved={unsaved}
      writable={false} view="visual" onViewChange={noop} saveDisabled saveHint="blocked" onSave={noop} /></TooltipProvider>);
    assert.match(html, new RegExp(`role="status"[^>]*>(?:<[^>]+>)*${expected}</`), `${status}, dirty=${unsaved}`);
    assert.match(html, /<button\b(?=[^>]*data-testid="save")(?=[^>]*aria-disabled="true")[^>]*>/);
  }
});

test("top bar exposes the active document view and blocks unavailable Source", () => {
  const html = renderToStaticMarkup(
    <TooltipProvider>
      <TopBar documentPath={PATH} status="Ready" saveDisabled={false} onSave={noop} view="source" onViewChange={noop} />
    </TooltipProvider>,
  );
  assert.match(html, /<[^>]+\b(?=[^>]*role="group")(?=[^>]*aria-label="Document view")[^>]*>/);
  assert.match(html, /<button\b(?=[^>]*data-testid="view-visual")(?=[^>]*aria-pressed="false")[^>]*>/);
  assert.match(html, /<button\b(?=[^>]*data-testid="view-source")(?=[^>]*aria-pressed="true")[^>]*>/);
  assert.match(html, />Visual</);
  assert.match(html, />Source</);
  const blocked = renderToStaticMarkup(
    <TooltipProvider>
      <TopBar documentPath={PATH} status="Ready" saveDisabled onSave={noop} view="visual" onViewChange={noop}
        sourceHint="Apply or Cancel the Figure edit before viewing Source." />
    </TooltipProvider>,
  );
  assert.match(blocked, /<button\b(?=[^>]*data-testid="view-source")(?=[^>]*aria-disabled="true")[^>]*>/);
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

test("Open dialog renders nothing while closed", () => {
  // The dialog content is portaled and only mounts in a browser once open (see the
  // "Editor UX Shell v1" browser script for the Open/Cancel/error flow it drives).
  const html = renderToStaticMarkup(
    <OpenDialog open={false} initialPath={PATH} busy={false} onOpen={async () => ""} onClose={noop} />,
  );
  assert.equal(html, "");
});

test("New dialog renders nothing while closed", () => {
  const html = renderToStaticMarkup(<NewDialog open={false} busy={false} onCreate={async () => ""} onClose={noop} />);
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
