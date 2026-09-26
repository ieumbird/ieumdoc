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
  assert.match(open, /aria-current="page" title="C:\\docs\\guide.md">[\s\S]*>guide\.md<\/span>/);
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
  assert.match(html, /data-testid="current-file" title="C:\\docs\\guide.md"><span class="document-path-name">guide.md<\/span>/);
  assert.ok(html.indexOf("current-file") < html.indexOf('data-testid="status"'));
  assert.ok(html.indexOf('data-testid="status"') < html.indexOf('data-testid="save"'));
  assert.doesNotMatch(html, /aria-disabled="true"/);
  // The disabled Save button keeps focus/hover so its Tooltip is reachable; the tooltip's
  // own text only mounts in a browser (see docs/test/TEST_GUIDE.md's Editor UX Shell v1 section).
  const blocked = renderToStaticMarkup(
    <TooltipProvider>
      <TopBar documentPath="" status="Ready" view="visual" onViewChange={noop} saveDisabled saveHint="Apply or Cancel the Equation edit before saving." onSave={noop} />
    </TooltipProvider>,
  );
  assert.match(blocked, /No file opened/);
  assert.match(blocked, /<button type="button" data-disabled="" tabindex="0" aria-disabled="true"[^>]*data-testid="save"[^>]*>Save<\/button>/);
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
    assert.ok(html.includes(`data-operation="${status}" role="status">${expected}</p>`), `${status}, dirty=${unsaved}`);
  }
});

test("an unwritable document shows Cannot save in place of the idle states", () => {
  for (const [status, unsaved, expected] of [
    ["Ready", false, "Cannot save"], ["Ready", true, "Cannot save"],
    ["Opening…", false, "Opening…"], ["Open failed", false, "Open failed"],
  ] as const) {
    const html = renderToStaticMarkup(<TooltipProvider><TopBar documentPath={PATH} status={status} unsaved={unsaved}
      writable={false} view="visual" onViewChange={noop} saveDisabled saveHint="blocked" onSave={noop} /></TooltipProvider>);
    assert.ok(html.includes(`data-operation="${status}" role="status">${expected}</p>`), `${status}, dirty=${unsaved}`);
    assert.match(html, /aria-disabled="true"[^>]*data-testid="save"/);
  }
});

test("top bar offers Visual and Source views left of status and Save", () => {
  const html = renderToStaticMarkup(
    <TooltipProvider>
      <TopBar documentPath={PATH} status="Ready" saveDisabled={false} onSave={noop} view="source" onViewChange={noop} />
    </TooltipProvider>,
  );
  assert.match(html, /role="group" aria-label="Document view"/);
  assert.match(html, /aria-pressed="false"[^>]*data-testid="view-visual"[^>]*>Visual</);
  assert.match(html, /aria-pressed="true"[^>]*data-testid="view-source"[^>]*>Source</);
  assert.ok(html.indexOf("view-source") < html.indexOf('data-testid="status"'));
  const blocked = renderToStaticMarkup(
    <TooltipProvider>
      <TopBar documentPath={PATH} status="Ready" saveDisabled onSave={noop} view="visual" onViewChange={noop}
        sourceHint="Apply or Cancel the Figure edit before viewing Source." />
    </TooltipProvider>,
  );
  assert.match(blocked, /aria-disabled="true"[^>]*data-testid="view-source"/);
});

test("message area separates dismissible errors from expiring notices", () => {
  assert.equal(renderToStaticMarkup(<MessageArea error="" notice="" onDismissError={noop} onNoticeExpired={noop} />), "");
  const html = renderToStaticMarkup(
    <MessageArea error="Save failed" notice="Discarded" onDismissError={noop} onNoticeExpired={noop} />,
  );
  assert.match(html, /data-testid="message-area"/);
  assert.match(html, /data-testid="error" role="alert"[^>]*><span class="message-text">Save failed<\/span><button[^>]*aria-label="Dismiss error"/);
  assert.match(html, /data-testid="notice" role="status"[^>]*><span class="message-text">Discarded<\/span><\/div>/);
});

test("message area keeps the writeability warning without a dismiss control", () => {
  const html = renderToStaticMarkup(
    <MessageArea error="" notice="" warning="Cannot save: reason" onDismissError={noop} onNoticeExpired={noop} />,
  );
  assert.match(html, /data-testid="writeability-warning" role="status" class="ui-notice ui-notice--warning message"><span class="message-text">Cannot save: reason<\/span><\/div>/);
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

test("command menu renders enabled and disabled commands and an empty state", () => {
  const html = renderToStaticMarkup(
    <CommandMenu
      label="Block actions"
      items={[{ id: "delete", label: "Delete", disabled: true }]}
      style={{}}
      onSelect={noop}
      onClose={noop}
    />,
  );
  assert.match(html, /role="menu" aria-label="Block actions"/);
  assert.match(html, /role="menuitem" class="command-menu-item" disabled="">Delete/);
  const empty = renderToStaticMarkup(<CommandMenu label="Insert block" items={[]} style={{}} onSelect={noop} onClose={noop} />);
  assert.match(empty, /No matches/);
});
