import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { CommandMenu } from "../src/CommandMenu.tsx";
import { splitDocumentPath } from "../src/shell/document-path.ts";
import { MessageArea } from "../src/shell/MessageArea.tsx";
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
  const open = renderToStaticMarkup(<Sidebar open documentPath={PATH} onToggle={noop} onOpen={noop} />);
  assert.match(open, /IeumDoc/);
  assert.match(open, />Open…</);
  assert.match(open, /aria-current="page" title="C:\\docs\\guide.md">guide.md</);
  assert.match(open, /aria-label="Collapse sidebar"/);
  const collapsed = renderToStaticMarkup(<Sidebar open={false} documentPath={PATH} onToggle={noop} onOpen={noop} />);
  assert.match(collapsed, /aria-label="Expand sidebar"/);
  assert.doesNotMatch(collapsed, /Open…|guide\.md|IeumDoc/);
});

test("top bar shows the current path on the left and save state with Save on the right", () => {
  const html = renderToStaticMarkup(
    <TopBar documentPath={PATH} status="Ready" saveDisabled={false} onSave={noop} />,
  );
  assert.match(html, /data-testid="current-file" title="C:\\docs\\guide.md"><span class="document-path-directory">C:\\docs\\<\/span><span class="document-path-name">guide.md<\/span>/);
  assert.ok(html.indexOf("current-file") < html.indexOf('data-testid="status"'));
  assert.ok(html.indexOf('data-testid="status"') < html.indexOf(">Save<"));
  const blocked = renderToStaticMarkup(
    <TopBar documentPath="" status="Ready" saveDisabled saveHint="Apply or Cancel the Equation edit before saving." onSave={noop} />,
  );
  assert.match(blocked, /No file opened/);
  assert.match(blocked, /<button disabled="" title="Apply or Cancel the Equation edit before saving\."[^>]*>Save/);
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

test("Open dialog keeps direct path entry", () => {
  const html = renderToStaticMarkup(
    <OpenDialog initialPath={PATH} busy={false} onOpen={async () => ""} onClose={noop} />,
  );
  assert.match(html, /<dialog/);
  assert.match(html, /data-testid="file-path"[^>]*value="C:\\docs\\guide.md"/);
  assert.match(html, />Open<\/button>/);
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
