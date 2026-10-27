// Real scratch file: New -> immediate typing -> undo/empty Save -> writing -> Save/Reload.
// pnpm browser:test new-document
async page => {
  await page.unrouteAll();
  const origin = page.url().split('/').slice(0, 3).join('/');
  const loaded = await (await page.request.get(`${origin}/api/document`)).json();
  const sep = loaded.path.includes('\\') ? '\\' : '/';
  const root = loaded.path.split(sep).slice(0, -4).join(sep);
  let folder = [root, 'tmp', 'new-document'].join(sep);
  // Start with the same Host start response used by Desktop, then exercise real folder/file APIs.
  await page.route(/\/api\/document$/, route => route.request().method() === 'GET'
    ? route.fulfill({json:{start:true}}) : route.continue());
  folder = [folder, 'entry-location'].join(sep);
  const file = [folder, 'new-document.md'].join(sep);
  const check = (value, message) => { if (!value) throw Error(message); };
  const ready = () => page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
  const read = async () => (await page.request.get(`${origin}/api/document?path=${encodeURIComponent(file)}`)).json();
  const editor = page.locator('[data-document-tab][data-active=true] .document-editor');
  // The document's text: the Add a title place above an untitled document is not content (#255).
  const text = () => editor.evaluate(node => node.editor.state.doc.textContent);
  const focused = () => editor.evaluate(element => element === document.activeElement);
  const hint = () => editor.locator('> p').first().evaluate(element => {
    const content = getComputedStyle(element, '::before').content;
    return content !== 'none' && content !== 'normal' && content !== '""';
  });
  const idle = async () => {
    await page.evaluate(() => document.activeElement?.blur());
    await page.mouse.move(0, 0);
  };
  const create = page.getByRole('button', {name:'New document…', exact:true});

  await page.reload();
  await ready();
  const startNew = page.getByTestId('document-start').getByRole('button', {name:'New document…', exact:true});
  await startNew.click();
  await page.getByTestId('folder-path').waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({state:'detached'});
  check(await startNew.evaluate(node => node === document.activeElement), 'Cancelled location did not return to New document');
  check(await page.getByTestId('folder').count() === 0 && await page.getByRole('tab').count() === 0,
    'Cancelled location opened a folder or document');
  const filesNew = page.getByTestId('sidebar').getByRole('button', {name:'New document…',exact:true});
  await filesNew.click();
  await page.getByTestId('folder-path').waitFor();
  await page.getByRole('dialog').getByRole('button', {name:'Cancel',exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'detached'});
  check(await filesNew.evaluate(node => node === document.activeElement), 'Files New lost focus after cancelling location');
  await filesNew.click();
  await page.getByTestId('folder-path').fill(folder.split(sep).slice(0,-1).join(sep) + sep);
  const picker = page.getByRole('dialog');
  await picker.getByRole('button', {name:'New folder', exact:true}).click();
  await page.getByTestId('new-folder-name').fill('entry-location');
  await page.getByTestId('new-folder-name').press('Enter');
  await page.waitForFunction(folder => document.querySelector('[data-testid="folder-path"]').value.replace(/[\\/]+$/, '') === folder, folder);
  await page.getByTestId('folder-open').click();
  await page.getByRole('dialog', {name:'New document',exact:true}).waitFor();
  check(await page.getByTestId('new-file-directory').inputValue() === folder &&
    await page.getByTestId('folder').getAttribute('data-root') === folder, 'Chosen folder was not the New destination/sidebar root');
  check(await page.getByTestId('new-file-name').evaluate(node => node === document.activeElement), 'Folder-to-New handoff lost filename focus');
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({state:'detached'});
  check(await page.getByRole('button', {name:'Collapse sidebar', exact:true}).evaluate(node => node === document.activeElement),
    'When first-folder selection removes the empty-state New entry, Cancel must return to the visible Sidebar toggle');
  // The folder action now uses the opened folder without asking for a location again.
  await page.getByTestId('sidebar').getByRole('button', {name:'New document…',exact:true}).click();
  await page.getByTestId('new-file-name').fill('new-document');
  await page.getByRole('dialog').getByRole('button', {name:'Create', exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'detached'});
  await ready();
  check(await page.getByTestId('current-file').getAttribute('title') === file, 'New did not open the created file');
  check(await focused(), 'New must focus the first paragraph without an editor click');
  check(await hint(), 'An empty document needs a writing hint');
  const created = await read();

  // No programmatic focus/click before typing: this failed on the original blank screen.
  await page.keyboard.type('Immediate typing');
  check((await text()).trim() === 'Immediate typing', 'New did not accept immediate typing');
  check(!await hint(), 'The hint remained over typed content');
  await page.keyboard.press('Control+z');
  check((await text()).trim() === '' && await hint(), 'Undo did not restore the empty hint');
  check((await page.getByTestId('status').innerText()).trim() === '', 'The hint dirtied an empty document');
  await page.getByRole('button', {name:'Save', exact:true}).click();
  await page.getByText('Saved', {exact:true}).filter({visible:true}).waitFor();
  const empty = await read();
  check(empty.source === created.source && empty.source.trim() === '---\nieumdoc: 1\n---' && empty.document.blocks.length === 0,
    'An empty Save changed the canonical empty file or wrote placeholder content');
  await page.getByRole('button', {name:'Source', exact:true}).click();
  check((await page.locator('.source-view-text').innerText()).trim() === '---\nieumdoc: 1\n---', 'The hint leaked into Source');
  await page.getByRole('button', {name:'Visual', exact:true}).click();

  // Width/alignment and Wide preferences are covered by layout-rules. Here the empty surface
  // must still fill the viewport and remain distinguishable, including in the narrow layout.
  for (const width of [1440, 768]) {
    await page.setViewportSize({width, height:900});
    await idle();
    const surface = await page.evaluate(() => {
      const paper = document.querySelector('[data-document-tab][data-active=true] .document');
      const bounds = paper.getBoundingClientRect();
      const header = document.querySelector('.app-header').getBoundingClientRect();
      const column = getComputedStyle(document.querySelector('.document-column'));
      const style = getComputedStyle(paper);
      return {height:bounds.height, minimum:innerHeight-header.height-parseFloat(column.paddingTop)-parseFloat(column.paddingBottom),
        paper:style.backgroundColor, canvas:getComputedStyle(document.documentElement).backgroundColor,
        frame:style.boxShadow, overflow:document.documentElement.scrollWidth>innerWidth};
    });
    check(surface.height >= surface.minimum-1 && surface.paper !== surface.canvas && surface.frame !== 'none' && !surface.overflow,
      `Empty document surface at ${width}: ${JSON.stringify(surface)}`);
    check(await hint(), 'The empty hint disappeared on blur/resize');
  }

  const insert = page.getByRole('button', {name:'Insert block after paragraph block 1', exact:true});
  check(await insert.evaluate(element => getComputedStyle(element.parentElement).opacity === '1' &&
    getComputedStyle(element).pointerEvents !== 'none'), 'The first insert action is hidden at rest');
  await insert.click();
  await page.getByRole('menuitem', {name:'Heading 2', exact:true}).waitFor();
  check(await page.getByRole('menuitem', {name:'Heading 1', exact:true}).count() === 0, 'Body insert menu offers H1');
  await page.keyboard.press('Escape');
  // Clicking well below the one-line editor must still put the caret in the document.
  const paper = await page.locator('[data-document-tab][data-active=true] .document').boundingBox();
  await page.mouse.click(paper.x + paper.width/2, paper.y + paper.height - 40);
  check(await focused(), 'The empty paper below the text did not focus the editor');
  await page.keyboard.type('/');
  await page.getByRole('menuitem', {name:'Heading 2', exact:true}).waitFor();
  check(await page.getByRole('menuitem', {name:'Heading 1', exact:true}).count() === 0, 'Body slash menu offers H1');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Backspace');
  check(await hint(), 'Dismissing and deleting the slash did not restore the hint');
  await page.keyboard.type('Browser-created paragraph');

  // New opens the name form without discarding this tab; Cancel retains input and focus.
  await create.click();
  await page.getByTestId('new-file-name').fill('another-document');
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({state:'detached'});
  check(await create.evaluate(element => element === document.activeElement), 'Cancelled New did not restore its opening control');
  check(await page.getByTestId('current-file').getAttribute('title') === file &&
    (await text()).trim() === 'Browser-created paragraph', 'New discarded unsaved work');
  await page.getByRole('button', {name:'Save', exact:true}).click();
  await page.getByText('Saved', {exact:true}).filter({visible:true}).waitFor();
  const written = await read();
  check(written.source === '---\nieumdoc: 1\n---\n\nBrowser-created paragraph\n', 'Save did not write only the entered text');
  await page.getByRole('button', {name:'File actions', exact:true}).click();
  await page.getByRole('menuitem', {name:'Reload', exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'detached'});
  await ready();
  check((await text()).trim() === 'Browser-created paragraph' && !await hint(), 'Reload lost the saved text or showed the hint');

  // A later cancelled creation must not repeat the successful creation's focus handoff.
  await create.click();
  await page.getByTestId('new-file-name').fill('cancelled');
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({state:'detached'});
  check(await create.evaluate(element => element === document.activeElement), 'Cancelled New stole editor focus');
  const listing = await (await page.request.get(`${origin}/api/folder?root=${encodeURIComponent(folder)}`)).json();
  check(listing.entries.every(entry => entry.kind === 'document' && entry.path === file) && listing.entries.length === 1,
    'Failed or cancelled New created a file');

  // Writing past the window keeps the new line above the paper's end space, which leaves the
  // last line room to rise; that room is display only and never reaches the saved file.
  await page.setViewportSize({width:1440, height:900});
  const end = await page.locator('[data-document-tab][data-active=true] .document').boundingBox();
  await page.mouse.click(end.x + end.width/2, end.y + end.height - 40);
  const lines = Array.from({length:30}, (_, index) => `Line ${index + 1}`);
  for (const line of lines) {
    await page.keyboard.press('Enter');
    await page.keyboard.type(line);
  }
  // Below the caret while writing, and below the last line once scrolled to the end.
  const room = target => page.evaluate(target => ({
    below: innerHeight - (target === 'caret' ? getSelection().getRangeAt(0).getClientRects()[0]
      : document.querySelector('[data-document-tab][data-active=true] .document-editor > :last-child').getBoundingClientRect()).bottom,
    end: parseFloat(getComputedStyle(document.querySelector('[data-document-tab][data-active=true] .document')).paddingBottom),
    viewport: innerHeight, scrolled: scrollY,
  }), target);
  // A quarter of the window is the least that lifts the line off the bottom edge.
  const writing = await room('caret');
  check(writing.scrolled > 0 && writing.end >= writing.viewport / 4 && writing.below >= writing.end - 1,
    `The line being written stays at the bottom of the window: ${JSON.stringify(writing)}`);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const scrolledEnd = await room('line');
  check(scrolledEnd.below >= scrolledEnd.end - 1, `No room below the last line: ${JSON.stringify(scrolledEnd)}`);
  await page.getByRole('button', {name:'Save', exact:true}).click();
  await page.getByText('Saved', {exact:true}).filter({visible:true}).waitFor();
  check((await read()).source.trimEnd() === '---\nieumdoc: 1\n---\n\n' + ['Browser-created paragraph', ...lines].join('\n\n'),
    'The end space changed the saved document');
  // New opens a second session without saving or discarding the dirty first document.
  await editor.locator('p').last().click();
  await page.keyboard.press('End'); await page.keyboard.type(' Kept across New.');
  const diskBeforeNew = (await read()).source;
  await page.keyboard.press('Control+Slash');
  await page.getByRole('combobox', {name:'Search documents and commands'}).fill('> 새 문서');
  await page.keyboard.press('Enter');
  await page.getByRole('dialog', {name:'Command center',exact:true}).waitFor({state:'detached'});
  const newName = page.getByTestId('new-file-name');
  await newName.waitFor();
  await newName.and(page.locator(':focus')).waitFor({state:'attached', timeout:5000});
  check(await newName.evaluate(el => el === document.activeElement), 'New did not focus the filename');
  check(await page.getByTestId('new-file-directory').inputValue() === folder, 'New command did not default to the current document folder');
  await newName.fill('second-document');
  await page.getByRole('dialog', {name:'New document'}).getByRole('button', {name:'Create',exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'detached'}); await ready();
  check((await page.getByTestId('current-file').getAttribute('title')).endsWith('second-document.md') && await focused(), 'New did not create/focus its tab');
  // Add a title must reuse the empty starting block, so Enter leaves only one writing paragraph (#437).
  await page.locator('[data-document-tab][data-active=true]').getByRole('button', {name:'Add a title',exact:true}).click();
  await page.keyboard.type('Field notes');
  await page.keyboard.press('Enter');
  const titleEnter = await editor.evaluate(el => {
    const {doc, selection} = el.editor.state;
    return {blocks:doc.content.content.map(node => [node.type.name, node.textContent]),
      dom:[...el.children].map(node => node.tagName),
      caret:selection.$from.index(0), offset:selection.$from.parentOffset,
      focused:el.editor.view.hasFocus()};
  });
  check(JSON.stringify(titleEnter.blocks) === JSON.stringify([['heading','Field notes'],['paragraph','']]) &&
    titleEnter.dom.join('|') === 'H1|P' && titleEnter.caret === 1 && titleEnter.offset === 0 && titleEnter.focused,
    `Title Enter must leave one empty paragraph and its caret: ${JSON.stringify(titleEnter)}`);
  await page.keyboard.type('First paragraph');
  await page.keyboard.press('Control+s');
  await page.locator('[data-testid="status"][data-operation="saved"]').waitFor({state:'attached'});
  const secondFile = [folder, 'second-document.md'].join(sep);
  const titleSaved = await (await page.request.get(`${origin}/api/document?path=${encodeURIComponent(secondFile)}`)).json();
  check(titleSaved.source === '---\nieumdoc: 1\n---\n\n# Field notes\n\nFirst paragraph\n',
    'Title Enter did not save the title and the paragraph entered at its caret');
  check((await read()).source === diskBeforeNew, 'New silently saved the first document');
  await page.getByRole('tab', {name:'new-document.md, Unsaved changes',exact:true}).click();
  check((await editor.innerText()).includes('Kept across New.'), 'New lost the first session');
  return {immediateTyping:true, hintUndo:true, emptySaveAndSource:true, emptySurface:true, insertAndSlash:true,
    blankPaperClick:true, newPreservesUnsavedWork:true, savedAndReloadedRealFile:true, cancelFocus:true,
    writingEndSpace:true, titleEnterSingleParagraph:true};
}
