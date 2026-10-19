// Run with pnpm browser:test document-title (prepare is automatic).
// The document title (#255) in scratch copies: the leading H1 is the title, its handle does not
// drag, changes that would push it down are refused with a notice, Enter in it continues below it,
// a document without one offers Add a title, and a title left empty goes away again. Scratch files
// live under the repository's ignored tmp/ directory.
async (page, { openDocument }) => {
  await page.unrouteAll();
  await page.setViewportSize({width: 1280, height: 1000});
  await page.reload();
  await page.locator('[data-testid="status"][data-operation="Ready"]').waitFor({state:'attached'});
  const origin = page.url().split('/').slice(0, 3).join('/');
  const defaultPath = (await (await page.request.get(`${origin}/api/document`)).json()).path;
  const separator = defaultPath.includes('\\') ? '\\' : '/';
  const root = defaultPath.split(separator).slice(0, -4).join(separator);
  const scratch = name => [root, 'tmp', 'document-title', name].join(separator);
  const read = async name => (await (await page.request.get(`${origin}/api/document?path=${encodeURIComponent(scratch(name))}`)).json()).source;
  const check = (ok, message) => { if (!ok) throw new Error(message); };
  const ready = () => page.locator('[data-testid="status"][data-operation="Ready"]').waitFor({state:'attached'});
  const editor = page.locator('[data-document-tab][data-active=true] .document-editor');
  const blocks = () => editor.evaluate(node => { const out = []; node.editor.state.doc.forEach(child => out.push(`${child.type.name}${child.attrs.level ?? ''}:${child.textContent}`)); return out; });
  const caretBlock = () => editor.evaluate(node => node.editor.state.selection.$from.index(0));
  const result = {};

  await openDocument(page, scratch('technical-document.md'));
  await ready();
  const title = page.locator('[data-document-tab][data-active=true] [data-document-title="true"]');
  result.titleMarked = await title.count() === 1 && (await title.innerText()).trim() === 'Converter Control';
  const original = await blocks();

  // The title's handle does not drag and says why.
  await title.hover({position:{x:4, y:4}});
  const handle = page.getByRole('button', {name:'Move heading block 1', exact:true});
  result.handleFixed = await handle.getAttribute('draggable') === 'false' && (await handle.getAttribute('title')).includes('title stays at the top');

  // An engine change that would put a block above the title, or move the title, is refused.
  for (const change of ['insert', 'move']) {
    await editor.evaluate((node, change) => {
      const {state, view} = node.editor;
      const {paragraph} = state.schema.nodes;
      const second = state.doc.child(0).nodeSize;
      const tr = change === 'insert' ? state.tr.insert(0, paragraph.create(null, state.schema.text('Above.')))
        : state.tr.delete(second, second + state.doc.child(1).nodeSize).insert(0, state.doc.child(1));
      view.dispatch(tr);
    }, change);
    check(JSON.stringify(await blocks()) === JSON.stringify(original), `Title ${change} was not refused`);
  }
  result.guardRefuses = await page.getByTestId('notice').filter({hasText:'The title stays at the top of the document.'}).count() === 1;

  // Enter at the start of the title opens a paragraph below it; in the middle, the rest goes below.
  // The caret is placed directly: caret keys right after a click can lag the engine selection.
  // Tiptap may apply focus a frame later; wait until the engine has it before typing.
  const caretAt = async offset => {
    await editor.evaluate((node, offset) => node.editor.chain().focus().setTextSelection(1 + offset).run(), offset);
    await editor.evaluate((node, offset) => new Promise(resolve => {
      const ready = () => node.editor.view.hasFocus() && node.editor.state.selection.$from.depth === 1 &&
        node.editor.state.selection.$from.index(0) === 0 && node.editor.state.selection.$from.parentOffset === offset;
      const wait = () => ready() ? resolve() : requestAnimationFrame(wait);
      wait();
    }), offset);
  };
  await caretAt(0);
  await page.keyboard.press('Enter');
  const atStart = await blocks();
  result.enterAtStart = atStart[0] === 'heading1:Converter Control' && atStart[1] === 'paragraph:' && await caretBlock() === 1;
  await page.keyboard.press('Control+z');
  check(JSON.stringify(await blocks()) === JSON.stringify(original), 'Undo did not restore the title');
  await caretAt('Converter'.length);
  await page.keyboard.press('Enter');
  const split = await blocks();
  result.enterSplitsBelow = split[0] === 'heading1:Converter' && split[1] === 'paragraph: Control' && await caretBlock() === 1;
  await page.keyboard.press('Control+z');
  check(JSON.stringify(await blocks()) === JSON.stringify(original), 'Undo did not restore the split title');

  // Without a title, Add a title starts one at the top; typing and Save write it as the leading H1.
  await openDocument(page, scratch('untitled.md'));
  await ready();
  const add = page.locator('[data-document-tab][data-active=true]').getByRole('button', {name:'Add a title', exact:true});
  await add.click();
  const empty = page.locator('[data-document-tab][data-active=true] [data-document-title="true"]');
  await empty.waitFor();
  result.emptyTitlePlaceholder = await empty.getAttribute('data-title-placeholder') === 'Title' && await caretBlock() === 0 &&
    await empty.evaluate(node => getComputedStyle(node, '::before').content) === '"Title"';
  await page.keyboard.type('Field notes');
  await page.keyboard.press('Control+s');
  await page.locator('[data-testid="status"][data-operation="Saved"]').waitFor({state:'attached'});
  result.titleSaved = (await read('untitled.md')).startsWith('---\nieumdoc: 1\n---\n\n# Field notes\n\nLead paragraph.\n');
  result.addHidden = await add.count() === 0;

  // A title left empty goes away once the caret leaves it, leaving the document unchanged.
  await openDocument(page, scratch('untitled-empty.md'));
  await ready();
  const addEmpty = page.locator('[data-document-tab][data-active=true]').getByRole('button', {name:'Add a title', exact:true});
  await addEmpty.click();
  await page.locator('[data-document-tab][data-active=true] [data-document-title="true"]').waitFor();
  // Clicking the paragraph, where it now sits below the new title, moves the caret out of it.
  const lead = await page.locator('[data-document-tab][data-active=true] .paragraph').first().boundingBox();
  await page.mouse.click(lead.x + 20, lead.y + lead.height / 2);
  await page.locator('[data-document-tab][data-active=true] [data-document-title="true"]').waitFor({state:'detached', timeout:2000}).catch(() => {});
  result.emptyTitleRemoved = await page.locator('[data-document-tab][data-active=true] [data-document-title="true"]').count() === 0 &&
    await addEmpty.isVisible() && (await blocks())[0] === 'paragraph:Lead paragraph.' &&
    !(await page.getByTestId('status').innerText()).includes('Unsaved');

  const failed = Object.entries(result).filter(([, ok]) => !ok).map(([name]) => name);
  if (failed.length) throw new Error(`Document title checks failed: ${failed.join(', ')} ${JSON.stringify(result)}`);
  return result;
}
