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
  const editor = page.locator('.document-editor');
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
  await page.getByText('Saved', {exact:true}).waitFor();
  const empty = await read();
  check(empty.source === created.source && empty.source.trim() === '' && empty.document.blocks.length === 0,
    'An empty Save changed the canonical empty file or wrote placeholder content');
  await page.getByRole('button', {name:'Source', exact:true}).click();
  check((await page.locator('.source-view-text').innerText()).trim() === '', 'The hint leaked into Source');
  await page.getByRole('button', {name:'Visual', exact:true}).click();

  // Width/alignment and Wide preferences are covered by layout-rules. Here the empty surface
  // must still fill the viewport and remain distinguishable, including in the narrow layout.
  for (const width of [1440, 768]) {
    await page.setViewportSize({width, height:900});
    await idle();
    const surface = await page.evaluate(() => {
      const paper = document.querySelector('.document');
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
  const paper = await page.locator('.document').boundingBox();
  await page.mouse.click(paper.x + paper.width/2, paper.y + paper.height - 40);
  check(await focused(), 'The empty paper below the text did not focus the editor');
  await page.keyboard.type('/');
  await page.getByRole('menuitem', {name:'Heading 1', exact:true}).waitFor();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Backspace');
  check(await hint(), 'Dismissing and deleting the slash did not restore the hint');
  await page.keyboard.type('Browser-created paragraph');

  // Retain unsaved-work protection and normal focus return after a failed New.
  await create.click();
  await page.getByTestId('new-file-name').fill('another-document');
  await page.getByRole('dialog').getByRole('button', {name:'Create', exact:true}).click();
  await page.getByText('Save or discard the current changes before creating another file.', {exact:true}).waitFor();
  await page.getByRole('dialog').getByRole('button', {name:'Cancel', exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'detached'});
  check(await create.evaluate(element => element === document.activeElement), 'Failed New did not restore its opening control');
  check(await page.getByTestId('current-file').getAttribute('title') === file &&
    (await editor.innerText()).trim() === 'Browser-created paragraph', 'New discarded unsaved work');
  await page.getByRole('button', {name:'Save', exact:true}).click();
  await page.getByText('Saved', {exact:true}).waitFor();
  const written = await read();
  check(written.source.trim() === 'Browser-created paragraph', 'Save did not write only the entered text');
  await page.getByRole('button', {name:'Reload', exact:true}).click();
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
  return {immediateTyping:true, hintUndo:true, emptySaveAndSource:true, emptySurface:true, insertAndSlash:true,
    blankPaperClick:true, newPreservesUnsavedWork:true, savedAndReloadedRealFile:true, cancelFocus:true};
}
