// Footnotes (#119, #140): numbered reference chips go to their definitions, a paragraph with
// footnotes is edited and saved with every definition where it is written, a read-only
// definition's own source applies unchanged, a one-paragraph definition is edited in place, `/`
// Footnote inserts a reference and a definition whose number goes back to it, and removing a
// footnote's last reference is refused with the reason.
async (page, { screenshots = false, openDocument }) => {
  await page.unrouteAll();
  await page.reload();
  const ready = () => page.locator('[data-testid="status"][data-operation="Ready"]').waitFor({state:'attached'});
  await ready();
  const origin = page.url().split('/').slice(0, 3).join('/');
  const defaultPath = (await (await page.request.get(`${origin}/api/document`)).json()).path;
  const sep = defaultPath.includes('\\') ? '\\' : '/';
  const root = defaultPath.split(sep).slice(0, -4).join(sep);
  const file = [root, 'tmp', 'footnotes', 'footnotes.md'].join(sep);
  const read = async () => (await (await page.request.get(`${origin}/api/document?path=${encodeURIComponent(file)}`)).json()).source.replaceAll('\r\n', '\n');
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const open = async () => {
    await openDocument(page, file);
    await ready();
    await page.getByRole('dialog').waitFor({state:'detached'});
  };
  await open();
  const opened = await read();
  const editor = page.locator('.document-editor');
  const chips = editor.getByTestId('footnote-reference');
  const texts = async locator => (await locator.allInnerTexts()).map(text => text.trim());
  const result = {};

  // [^b] is referenced first, so it is footnote 1 although [^a] sorts first.
  assert(JSON.stringify(await texts(chips)) === '["1","2"]', `Chip numbers: ${await texts(chips)}`);
  assert(JSON.stringify(await chips.evaluateAll(nodes => nodes.map(node => node.dataset.label))) === '["b","a"]', 'Chip labels');
  assert(JSON.stringify(await texts(editor.getByTestId('footnote-number'))) === '["1","2"]', 'Definition numbers');
  result.numberedByFirstReference = true;

  await editor.locator('[data-testid="footnote-reference"][data-label="a"] sup').click();
  const selected = await page.evaluate(() => document.querySelector('.document-editor').editor.state.selection.node?.attrs.footnote);
  assert(selected === 'a', `Chip went to ${selected}`);
  result.chipGoesToDefinition = true;

  // The definition's source is its own; applying it unchanged changes nothing.
  const definition = page.locator('.original-content').filter({hasText:'[^a]: Defined later,'});
  await definition.locator('summary').click();
  assert(await definition.locator('pre').textContent() === '[^a]: Defined later,\n    on two lines.\n\n    Second paragraph.', 'Definition source');
  await definition.getByTestId('block-source-edit').click();
  await definition.getByTestId('block-source-apply').click();
  await definition.getByTestId('block-source-input').waitFor({state:'detached'});
  result.definitionSourceApplies = true;
  // Apply returns focus to the editor, with the definition selected, on the next frame.
  await page.waitForFunction(() => document.querySelector('.document-editor').editor.view.hasFocus());

  await editor.locator('p.paragraph', {hasText:'First claim'}).click({position:{x:4, y:8}});
  // The click replaces the definition's node selection a moment later; typing before would replace the block.
  await page.waitForFunction(() => document.querySelector('.document-editor').editor.state.selection.empty);
  await page.keyboard.press('End');
  await page.keyboard.type(' Edited.');
  await page.locator('.top-bar [data-testid="save"]').click();
  await page.locator('[data-testid="status"][data-operation="Saved"]').waitFor({state:'attached'});
  const saved = await read();
  assert(saved === opened.replace('second[^a].', 'second[^a]. Edited.'), 'Saved Markdown differs: ' + JSON.stringify({opened, saved}));
  await page.getByRole('button', {name:'Reload', exact:true}).click();
  await ready();
  assert(JSON.stringify(await texts(chips)) === '["1","2"]', 'Reloaded chips');
  result.editSaveReload = true;

  // A chip goes into its editable definition, which is edited in place.
  const caretIn = label => page.waitForFunction(label => {
    const {selection} = document.querySelector('.document-editor').editor.state;
    return selection.empty && selection.$from.parent.type.name === 'footnoteDefinition' && selection.$from.parent.attrs.label === label;
  }, label);
  await editor.locator('[data-testid="footnote-reference"][data-label="b"] sup').click();
  await caretIn('b');
  await page.keyboard.type(' More.');
  result.chipGoesIntoEditableDefinition = true;

  // `/` Footnote: the reference follows the word, and the new definition at the end takes the caret.
  await editor.locator('p.paragraph', {hasText:'Middle paragraph.'}).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' /footnote');
  await page.getByRole('menuitem', {name:'Footnote', exact:true}).waitFor();
  await page.keyboard.press('Enter');
  await caretIn('1');
  const created = editor.locator('[data-testid="footnote-definition"][data-label="1"]');
  // One Undo removes the reference and its definition together; Redo restores both.
  await page.keyboard.press('Control+z');
  assert(JSON.stringify(await texts(chips)) === '["1","2"]' && await created.count() === 0, 'Undo left part of the footnote');
  await page.keyboard.press('Control+Shift+z');
  await created.locator('p').click();
  await caretIn('1');
  await page.keyboard.type('New note.');
  assert(JSON.stringify(await texts(chips)) === '["1","2","3"]', `Chips after insertion: ${await texts(chips)}`);
  assert((await created.getByTestId('footnote-number').innerText()).trim() === '3', 'New definition number');
  await created.getByTestId('footnote-number').click();
  const back = await page.evaluate(() => document.querySelector('.document-editor').editor.state.selection.node?.attrs.label);
  assert(back === '1', `Number went back to ${back}`);
  result.slashInsertsFootnote = true;
  await page.locator('.top-bar [data-testid="save"]').click();
  await page.locator('[data-testid="status"][data-operation="Saved"]').waitFor({state:'attached'});
  const inserted = await read();
  const expected = saved.replace('[^b]: Defined first.', '[^b]: Defined first. More.').replace('Middle paragraph.', 'Middle paragraph.[^1]') + '\n[^1]: New note.\n';
  assert(inserted === expected, 'Saved Markdown differs: ' + JSON.stringify({expected, inserted}));
  await page.getByRole('button', {name:'Reload', exact:true}).click();
  await ready();
  assert(JSON.stringify(await texts(chips)) === '["1","2","3"]', 'Reloaded chips after insertion');
  result.insertedSaveReload = true;

  // Removing the only reference to [^b] would make MyST drop its definition.
  await editor.locator('p.paragraph', {hasText:'First claim'}).click({position:{x:4, y:8}});
  await page.keyboard.press('Home');
  for (let step = 0; step < 'First claim'.length; step++) await page.keyboard.press('ArrowRight');
  // Moving onto the chip selects it from the editor's selection, so let that catch up first.
  await page.waitForFunction(() => document.querySelector('.document-editor').editor.state.selection.$from.parentOffset === 'First claim'.length);
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => document.querySelector('.document-editor').editor.state.selection.node?.type.name === 'footnoteReference');
  await page.keyboard.press('Backspace');
  assert(JSON.stringify(await chips.evaluateAll(nodes => nodes.map(node => node.dataset.label))) === '["a","1"]', 'Chip not removed');
  await page.locator('.top-bar [data-testid="save"]').click();
  await page.getByText('Save failed', {exact:true}).waitFor();
  assert(/\[\^b\] has no reference/.test(await page.getByTestId('error').innerText()), 'Refusal reason missing');
  assert(await read() === inserted, 'Refused save wrote the file');
  result.unreferencedDefinitionRefused = true;

  // Presentation (#185): definitions in place, with one heading per contiguous run,
  // including read-only definitions. Captures precede checks to record the old display.
  await page.reload();
  await ready();
  const regionsFile = [root, 'tmp', 'footnotes', 'regions.md'].join(sep);
  await openDocument(page, regionsFile);
  await ready();
  const regionsRead = async () => (await (await page.request.get(`${origin}/api/document?path=${encodeURIComponent(regionsFile)}`)).json()).source.replaceAll('\r\n', '\n');
  const regionsSource = await regionsRead();
  const originalState = await editor.evaluate(element => JSON.stringify(element.editor.getJSON()));
  const presentation = () => editor.evaluate(element => {
    const {view, state} = element.editor;
    const isDefinition = node => node.type.name === 'footnoteDefinition' || (node.type.name === 'unsupportedBlock' && node.attrs.footnote);
    const notes = [];
    state.doc.forEach((node, pos, index) => {
      if (!isDefinition(node)) return;
      const dom = view.nodeDOM(pos);
      const style = getComputedStyle(dom);
      const heading = getComputedStyle(dom, '::before');
      const number = dom.querySelector('[data-testid="footnote-number"]');
      const definitionStyle = getComputedStyle(number.closest('[data-block]'));
      const numberStyle = getComputedStyle(number);
      notes.push({
        label: node.attrs.label || node.attrs.footnote,
        startsGroup: index === 0 || !isDefinition(state.doc.child(index - 1)),
        endsGroup: index === state.doc.childCount - 1 || !isDefinition(state.doc.child(index + 1)),
        heading: heading.content, border: heading.borderTopWidth,
        fontSize: style.fontSize, lineHeight: style.lineHeight,
        numberSize: numberStyle.fontSize, numberAlign: numberStyle.verticalAlign,
        marginTop: style.marginTop, marginBottom: style.marginBottom,
        indent: definitionStyle.paddingLeft,
        bounds: {left: dom.getBoundingClientRect().left, right: dom.getBoundingClientRect().right},
      });
    });
    return {notes, overflow: document.documentElement.scrollWidth - innerWidth};
  });
  const displays = [];
  for (const width of [1440, 768, 375]) {
    await page.setViewportSize({width, height:900});
    if (width === 375) await page.getByRole('button', {name:'Collapse sidebar', exact:true}).click();
    await page.evaluate(async () => { await document.fonts.ready; window.scrollTo(0,0); document.activeElement?.blur(); });
    await page.mouse.move(0,0);
    await page.waitForTimeout(150);
    if (screenshots) await page.screenshot({path:`tmp/visual-refinement/footnotes-${width}.png`, fullPage:true});
    displays.push({width, ...await presentation()});
  }
  for (const display of displays) {
    assert(display.notes.length > 0, 'No definitions to review');
    for (const note of display.notes) {
      assert(note.startsGroup ? note.heading === '"Footnotes"' && note.border === '1px' : note.heading !== '"Footnotes"', `Group heading: ${JSON.stringify(note)}`);
      assert(note.fontSize === '16px' && note.lineHeight === '24px', `Note typography: ${JSON.stringify(note)}`);
      assert(note.numberSize === '16px' && note.numberAlign === 'baseline', `Definition number: ${JSON.stringify(note)}`);
      assert(note.indent === '24px' && note.marginTop === (note.startsGroup ? '24px' : '8px') && note.marginBottom === (note.endsGroup ? '24px' : '8px'), `Note spacing: ${JSON.stringify(note)}`);
      assert(note.bounds.left >= 0 && note.bounds.right <= display.width && display.overflow <= 1, `Viewport overflow: ${JSON.stringify(display)}`);
    }
  }
  assert(await editor.evaluate(element => JSON.stringify(element.editor.getJSON())) === originalState, 'Presentation changed document state');
  result.noteRegionsInPlace = true;

  // Enter between the editable/read-only pair splits the visual run. Undo joins it again,
  // without inserting a semantic group or consuming an extra history step.
  await page.setViewportSize({width:1440, height:900});
  await editor.locator('[data-testid="footnote-definition"][data-label="b"] p').click();
  await caretIn('b');
  await page.keyboard.press('Enter');
  assert((await presentation()).notes.find(note => note.label === 'a').heading === '"Footnotes"', 'Following note needs a new group');
  await page.keyboard.press('Control+z');
  assert(await editor.evaluate(element => JSON.stringify(element.editor.getJSON())) === originalState, 'One Undo did not restore definitions');
  assert((await presentation()).notes.find(note => note.label === 'a').heading !== '"Footnotes"', 'Undo did not join the visual group');
  result.groupFollowsHistory = true;

  // The decorative label is absent from native DOM text selection and Source copying.
  // Whole-definition copying retains its existing fail-closed restriction.
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.evaluate(() => navigator.clipboard.writeText('clipboard before note selection'));
  await editor.evaluate(element => { element.editor.commands.selectAll(); element.editor.commands.focus(); });
  await page.keyboard.press('Control+c');
  assert(await page.evaluate(() => navigator.clipboard.readText()) === 'clipboard before note selection', 'Rejected copy changed clipboard');
  assert(/cannot be copied losslessly/.test(await page.getByTestId('notice').innerText()), 'Existing copy restriction missing');
  assert(!await editor.evaluate(element => { const range = document.createRange(); range.selectNodeContents(element); return range.toString().includes('Footnotes'); }), 'Generated heading entered selected text');
  await page.getByRole('button', {name:'Source', exact:true}).click();
  const preview = page.getByTestId('source-view').locator('pre');
  await preview.waitFor();
  assert(await preview.textContent() === regionsSource, 'Decorative heading or reordered notes entered Source');
  await preview.evaluate(element => {
    const range = document.createRange(); range.selectNodeContents(element);
    const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
  });
  await page.keyboard.press('Control+c');
  const copiedSource = (await page.evaluate(() => navigator.clipboard.readText())).replaceAll('\r\n', '\n');
  // Chromium's native preformatted selection omits the terminal newline.
  assert(copiedSource === regionsSource.replace(/\n$/, ''), 'Source clipboard differs: ' + JSON.stringify({copiedSource, regionsSource}));
  await page.getByRole('button', {name:'Visual', exact:true}).click();
  await editor.waitFor();
  result.decorativeHeadingExcluded = true;

  await page.getByRole('button', {name:'Save', exact:true}).click();
  await page.locator('[data-testid="status"][data-operation="Saved"]').waitFor({state:'attached'});
  assert(await regionsRead() === regionsSource, 'Presentation changed saved Markdown');
  await page.getByRole('button', {name:'Reload', exact:true}).click();
  await ready();
  assert(await editor.evaluate(element => JSON.stringify(element.editor.getJSON())) === originalState, 'Reload changed definition order or state');
  assert((await presentation()).notes.every(note => note.startsGroup ? note.heading === '"Footnotes"' : note.heading !== '"Footnotes"'), 'Reload lost group presentation');
  result.regionSaveReload = true;
  return result;
}
