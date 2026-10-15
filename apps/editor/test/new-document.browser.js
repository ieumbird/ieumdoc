// Real scratch file: New -> immediate typing -> undo/empty Save -> writing -> Save/Reload.
// pnpm browser:test new-document
async page => {
  await page.unrouteAll();
  const origin = page.url().split('/').slice(0, 3).join('/');
  const loaded = await (await page.request.get(`${origin}/api/document`)).json();
  const sep = loaded.path.includes('\\') ? '\\' : '/';
  const root = loaded.path.split(sep).slice(0, -4).join(sep);
  const folder = [root, 'tmp', 'new-document'].join(sep);
  const file = [folder, 'new-document.md'].join(sep);
  const check = (value, message) => { if (!value) throw Error(message); };
  const ready = () => page.locator('[data-testid="status"][data-operation="Ready"]').waitFor({state:'attached'});
  const read = async () => (await page.request.get(`${origin}/api/document?path=${encodeURIComponent(file)}`)).json();
  const editor = page.locator('[data-document-tab][data-active=true] .document-editor');
  const focused = () => editor.evaluate(element => element === document.activeElement);
  const hint = () => editor.locator('> p').first().evaluate(element => {
    const content = getComputedStyle(element, '::before').content;
    return content !== 'none' && content !== 'normal' && content !== '""';
  });
  const idle = async () => {
    await page.evaluate(() => document.activeElement?.blur());
    await page.mouse.move(0, 0);
  };
  const create = page.getByRole('button', {name:'New file in folder', exact:true});

  await page.reload();
  await ready();
  await page.getByRole('button', {name:'Open folder…', exact:true}).click();
  await page.getByTestId('folder-path').fill(folder);
  await page.getByTestId('folder-open').click();
  await page.getByRole('dialog').waitFor({state:'detached'});
  await create.click();
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
  check((await editor.innerText()).trim() === 'Immediate typing', 'New did not accept immediate typing');
  check(!await hint(), 'The hint remained over typed content');
  await page.keyboard.press('Control+z');
  check((await editor.innerText()).trim() === '' && await hint(), 'Undo did not restore the empty hint');
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
  await page.getByRole('menuitem', {name:'Heading 1', exact:true}).waitFor();
  await page.keyboard.press('Escape');
  // Clicking well below the one-line editor must still put the caret in the document.
  const paper = await page.locator('[data-document-tab][data-active=true] .document').boundingBox();
  await page.mouse.click(paper.x + paper.width/2, paper.y + paper.height - 40);
  check(await focused(), 'The empty paper below the text did not focus the editor');
  await page.keyboard.type('/');
  await page.getByRole('menuitem', {name:'Heading 1', exact:true}).waitFor();
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
    (await editor.innerText()).trim() === 'Browser-created paragraph', 'New discarded unsaved work');
  await page.getByRole('button', {name:'Save', exact:true}).click();
  await page.getByText('Saved', {exact:true}).filter({visible:true}).waitFor();
  const written = await read();
  check(written.source === '---\nieumdoc: 1\n---\n\nBrowser-created paragraph\n', 'Save did not write only the entered text');
  await page.getByRole('button', {name:'File actions', exact:true}).click();
  await page.getByRole('menuitem', {name:'Reload', exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'detached'});
  await ready();
  check((await editor.innerText()).trim() === 'Browser-created paragraph' && !await hint(), 'Reload lost the saved text or showed the hint');

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
  await create.click();
  const newName = page.getByTestId('new-file-name');
  await newName.waitFor();
  check(await newName.evaluate(el => el === document.activeElement), 'New did not focus the filename');
  await newName.fill('second-document');
  await page.getByRole('dialog', {name:'New Markdown file'}).getByRole('button', {name:'Create',exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'detached'}); await ready();
  check((await page.getByTestId('current-file').getAttribute('title')).endsWith('second-document.md') && await focused(), 'New did not create/focus its tab');
  check((await read()).source === diskBeforeNew, 'New silently saved the first document');
  await page.getByRole('tab', {name:'new-document.md, Unsaved changes',exact:true}).click();
  check((await editor.innerText()).includes('Kept across New.'), 'New lost the first session');
  return {immediateTyping:true, hintUndo:true, emptySaveAndSource:true, emptySurface:true, insertAndSlash:true,
    blankPaperClick:true, newPreservesUnsavedWork:true, savedAndReloadedRealFile:true, cancelFocus:true,
    writingEndSpace:true};
}
