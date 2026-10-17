// Endnotes (#119, #140, #194, endnotes v4): MyST footnotes shown as one endnotes region after the
// body. Opening a file whose definitions are written within the body changes nothing on disk,
// says what the first Save does, and Source shows that Markdown; Save writes the definitions after
// the body in first-reference order, and saving again gives the same file. Reference chips go to
// their definitions and numbers return to the invoking reference; definitions are edited in place
// or as source; `/` Endnote inserts one; endnotes cannot be dragged and sections hold none;
// reference order changes move them in one Undo step; a draft holds placement until it closes.
async (page, { screenshots = false, openDocument }) => {
  page.setDefaultTimeout(15_000);
  await page.unrouteAll();
  await page.reload();
  const ready = () => page.locator('[data-testid="status"][data-operation="Ready"]').waitFor({state:'attached'});
  const saved = () => page.locator('[data-testid="status"][data-operation="Saved"]').waitFor({state:'attached'});
  await ready();
  const origin = page.url().split('/').slice(0, 3).join('/');
  const defaultPath = (await (await page.request.get(`${origin}/api/document`)).json()).path;
  const sep = defaultPath.includes('\\') ? '\\' : '/';
  const root = defaultPath.split(sep).slice(0, -4).join(sep);
  const fixture = name => [root, 'tmp', 'footnotes', name].join(sep);
  const reader = path => async () => (await (await page.request.get(`${origin}/api/document?path=${encodeURIComponent(path)}`)).json()).source.replaceAll('\r\n', '\n');
  const file = fixture('footnotes.md');
  const read = reader(file);
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const open = async path => {
    await openDocument(page, path);
    await ready();
    await page.getByRole('dialog').waitFor({state:'detached'});
  };
  const editor = page.locator('[data-document-tab][data-active=true] .document-editor');
  const chips = editor.getByTestId('footnote-reference');
  const texts = async locator => (await locator.allInnerTexts()).map(text => text.trim());
  const notice = page.getByTestId('document-notice');
  const save = page.locator('.top-bar [data-testid="save"]');
  const status = () => page.getByTestId('status').innerText();
  const order = () => editor.evaluate(element => {
    const labels = [];
    element.editor.state.doc.forEach(node => labels.push(node.type.name === 'footnoteDefinition' ? node.attrs.label : node.attrs.footnote || node.type.name));
    return labels.join(' ');
  });
  const showSource = async () => {
    await page.getByRole('button', {name:'Source', exact:true}).click();
    const preview = page.locator('[data-document-tab][data-active=true]').getByTestId('source-view').locator('pre');
    await preview.waitFor();
    return preview;
  };
  const showVisual = async () => {
    await page.getByRole('button', {name:'Visual', exact:true}).click();
    await editor.waitFor();
  };
  const result = {};

  // An external file writes [^b] between paragraphs. Opening it writes nothing and is not an edit;
  // the endnotes follow the body, and a notice and Source say what the first Save writes.
  const written = '---\nieumdoc: 1\n---\n\n# Footnotes\n\nFirst claim[^b] and second[^a].\n\n[^b]: Defined first.\n\nMiddle paragraph.\n\n' +
    '[^a]: Defined later,\n    on two lines.\n';
  const placed = '---\nieumdoc: 1\n---\n\n# Footnotes\n\nFirst claim[^b] and second[^a].\n\nMiddle paragraph.\n\n[^b]: Defined first.\n\n' +
    '[^a]: Defined later,\n    on two lines.\n';
  await open(file);
  assert(await read() === written, 'Opening changed the file');
  assert(await order() === 'heading paragraph paragraph b a', `Opened order: ${await order()}`);
  assert(await status() !== 'Unsaved changes', 'Opening made the document dirty');
  assert(/Save moves this file's endnote definitions after the body/.test(await notice.innerText()), 'Missing endnote placement notice');
  assert((await showSource().then(preview => preview.textContent())) === placed, 'Source differs from the Markdown Save writes');
  await showVisual();
  assert(await read() === written && await status() !== 'Unsaved changes', 'Source changed the file or made it dirty');
  result.openWritesNothingAndExplains = true;

  // [^b] is referenced first, so it is endnote 1 although [^a] sorts first.
  assert(JSON.stringify(await texts(chips)) === '["1","2"]', `Chip numbers: ${await texts(chips)}`);
  assert(JSON.stringify(await chips.evaluateAll(nodes => nodes.map(node => node.dataset.label))) === '["b","a"]', 'Chip labels');
  assert(JSON.stringify(await texts(editor.getByTestId('footnote-number'))) === '["1","2"]', 'Definition numbers');
  result.numberedByFirstReference = true;

  await editor.locator('[data-testid="footnote-reference"][data-label="a"] sup').click();
  const selected = await page.evaluate(() => document.querySelector('[data-document-tab][data-active=true] .document-editor').editor.state.selection.$from.parent.attrs.label);
  assert(selected === 'a', `Chip went to ${selected}`);
  result.chipGoesToDefinition = true;

  // The first Save writes the edit and the endnotes after the body; the notice ends with it.
  await editor.locator('p.paragraph', {hasText:'First claim'}).click({position:{x:4, y:8}});
  // Wait until the caret has moved from the endnote to the paragraph.
  await page.waitForFunction(() => document.querySelector('[data-document-tab][data-active=true] .document-editor').editor.state.selection.empty);
  await page.keyboard.press('End');
  await page.keyboard.type(' Edited.');
  await save.click();
  await saved();
  const edited = await read();
  assert(edited === placed.replace('second[^a].', 'second[^a]. Edited.'), 'Saved Markdown differs: ' + JSON.stringify({placed, edited}));
  assert(await notice.count() === 0, 'Notice stayed after Save');
  await page.getByRole('button', {name:'File actions', exact:true}).click();
  await page.getByRole('menuitem', {name:'Reload', exact:true}).click();
  await ready();
  assert(JSON.stringify(await texts(chips)) === '["1","2"]' && await notice.count() === 0, 'Reloaded chips or notice');
  result.firstSavePlacesEndnotes = true;

  // A chip goes into its editable definition, which is edited in place.
  const caretIn = label => page.waitForFunction(label => {
    const {selection} = document.querySelector('[data-document-tab][data-active=true] .document-editor').editor.state;
    return selection.empty && selection.$from.parent.type.name === 'footnoteDefinition' && selection.$from.parent.attrs.label === label;
  }, label);
  await editor.locator('[data-testid="footnote-reference"][data-label="b"] sup').click();
  await caretIn('b');
  await page.keyboard.type(' More.');
  result.chipGoesIntoEditableDefinition = true;

  // `/` Endnote: the reference follows the word, and the new definition takes the caret in the region.
  await editor.locator('p.paragraph', {hasText:'Middle paragraph.'}).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' /footnote');
  await page.getByRole('menuitem', {name:'Endnote', exact:true}).waitFor();
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
  const back = await page.evaluate(() => document.querySelector('[data-document-tab][data-active=true] .document-editor').editor.state.selection.node?.attrs.label);
  assert(back === '1', `Number went back to ${back}`);
  result.slashInsertsFootnote = true;
  await save.click();
  await saved();
  const inserted = await read();
  const expected = edited.replace('[^b]: Defined first.', '[^b]: Defined first. More.').replace('Middle paragraph.', 'Middle paragraph.[^1]') + '\n[^1]: New note.\n';
  assert(inserted === expected, 'Saved Markdown differs: ' + JSON.stringify({expected, inserted}));
  await page.getByRole('button', {name:'File actions', exact:true}).click();
  await page.getByRole('menuitem', {name:'Reload', exact:true}).click();
  await ready();
  assert(JSON.stringify(await texts(chips)) === '["1","2","3"]', 'Reloaded chips after insertion');
  result.insertedSaveReload = true;

  // Removing the only reference to [^b] would make MyST drop its definition.
  await editor.locator('p.paragraph', {hasText:'First claim'}).click({position:{x:4, y:8}});
  await page.keyboard.press('Home');
  for (let step = 0; step < 'First claim'.length; step++) await page.keyboard.press('ArrowRight');
  // Moving onto the chip selects it from the editor's selection, so let that catch up first.
  await page.waitForFunction(() => document.querySelector('[data-document-tab][data-active=true] .document-editor').editor.state.selection.$from.parentOffset === 'First claim'.length);
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => document.querySelector('[data-document-tab][data-active=true] .document-editor').editor.state.selection.node?.type.name === 'footnoteReference');
  await page.keyboard.press('Backspace');
  assert(JSON.stringify(await chips.evaluateAll(nodes => nodes.map(node => node.dataset.label))) === '["a","1"]', 'Chip not removed');
  await save.click();
  await page.getByText('Save failed', {exact:true}).filter({visible:true}).waitFor();
  assert(/\[\^b\] has no reference/.test(await page.getByTestId('error').innerText()), 'Refusal reason missing: ' + await page.getByTestId('error').innerText());
  assert(await read() === inserted, 'Refused save wrote the file');
  result.unreferencedDefinitionRefused = true;

  // One trailing region, from definitions written in three places.
  await page.reload();
  await ready();
  const regionsFile = fixture('regions.md');
  const regionsRead = reader(regionsFile);
  await open(regionsFile);
  const regionsSource = await regionsRead();
  const regionsBody = regionsSource.split('\n\n').filter(part => !part.startsWith('[^') && !part.startsWith('    '));
  const regionsNotes = [
    '[^b]: A note beside another definition.',
    '[^a]: A short note.',
    '[^c]: 긴 각주도 본문과 구별되면서 읽기 쉬워야 합니다. A longer explanation keeps **bold text**, a [link](https://example.com) and $x^2$ in its original position.',
    '[^d]: The final note.',
  ];
  const regionsPlaced = [...regionsBody, ...regionsNotes].join('\n\n') + '\n';
  assert(regionsSource !== regionsPlaced, 'Fixture already places its endnotes');
  const originalState = await editor.evaluate(element => JSON.stringify(element.editor.getJSON()));
  // The region's decorative label is not a heading: the Outline lists the document's one heading.
  assert(JSON.stringify(await page.getByTestId('outline').locator('button').allInnerTexts()) === '["Notes in context"]', 'Region label entered the Outline');
  const presentation = () => editor.evaluate(element => {
    const {view, state} = element.editor;
    const isDefinition = node => node.type.name === 'footnoteDefinition';
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
    // Phone widths start with the sidebar collapsed to its rail.
    if (width === 375) await page.getByRole('button', {name:'Expand sidebar', exact:true}).waitFor();
    await page.evaluate(async () => { await document.fonts.ready; window.scrollTo(0,0); document.activeElement?.blur(); });
    await page.mouse.move(0,0);
    await page.waitForTimeout(150);
    if (screenshots) await page.screenshot({path:`tmp/visual-refinement/footnotes-${width}.png`, fullPage:true});
    displays.push({width, ...await presentation()});
  }
  for (const display of displays) {
    assert(display.notes.length > 0, 'No definitions to review');
    for (const note of display.notes) {
      assert(note.startsGroup ? note.heading === '"미주"' && note.border === '1px' : note.heading !== '"미주"', `Group heading: ${JSON.stringify(note)}`);
      assert(note.fontSize === '16px' && note.lineHeight === '24px', `Note typography: ${JSON.stringify(note)}`);
      assert(note.numberSize === '16px' && note.numberAlign === 'baseline', `Definition number: ${JSON.stringify(note)}`);
      assert(note.indent === '24px' && note.marginTop === (note.startsGroup ? '24px' : '8px') && note.marginBottom === (note.endsGroup ? '24px' : '8px'), `Note spacing: ${JSON.stringify(note)}`);
      assert(note.bounds.left >= 0 && note.bounds.right <= display.width && display.overflow <= 1, `Viewport overflow: ${JSON.stringify(display)}`);
    }
  }
  assert(displays.every(display => display.notes.filter(note => note.startsGroup).length === 1 && display.notes.at(-1).endsGroup), 'Expected one trailing region');
  assert(displays.every(display => display.notes.map(note => note.label).join(',') === 'b,a,c,d'), 'Definitions must follow first reference order');
  assert(await order() === 'heading paragraph paragraph paragraph b a c d', 'Body appeared after an endnote');
  assert(await editor.evaluate(element => JSON.stringify(element.editor.getJSON())) === originalState, 'Presentation changed document state');
  result.singleTrailingEndnotes = true;

  // Endnotes are not dragged and nothing is inserted after them: their handle opens block actions,
  // and a body block dropped below them lands at the end of the body.
  await page.setViewportSize({width:1440, height:900});
  const handles = page.locator('.block-handle[data-endnote="true"]');
  assert(await handles.count() === 4 && (await handles.evaluateAll(nodes => nodes.map(node => node.getAttribute('draggable')))).every(value => value === 'false'), 'Endnote handles can drag');
  assert(await page.locator('.block-insert').count() === 4, 'An endnote offers Insert block below');
  await editor.locator('[data-testid="footnote-definition"][data-label="b"]').hover();
  await page.getByRole('button', {name:/^Actions for endnote block \d+$/}).first().click();
  const actions = await page.getByRole('menuitem').allInnerTexts();
  assert(actions.length > 0 && actions.every(item => !/미주로 모으기|Insert/.test(item)), `Endnote actions: ${actions}`);
  await page.keyboard.press('Escape');
  const resumes = editor.locator('p.paragraph', {hasText:'Body resumes'});
  await resumes.hover({position:{x:4, y:4}});
  const handle = await page.getByRole('button', {name:'Move paragraph block 3', exact:true}).boundingBox();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  const lastNote = await editor.locator('[data-testid="footnote-definition"], .unsupported.footnote-definition').last().boundingBox();
  for (const y of [lastNote.y + lastNote.height - 2, lastNote.y + lastNote.height - 1]) await page.mouse.move(700, y, {steps:5});
  await page.mouse.up();
  await page.getByTestId('block-drag-source').waitFor({state:'detached'});
  assert(await order() === 'heading paragraph paragraph paragraph b a c d', `Drop entered the endnotes: ${await order()}`);
  assert(await editor.evaluate(element => element.editor.state.doc.child(3).textContent.startsWith('Body resumes')), 'Dropped block not at the body end');
  await editor.evaluate(element => element.editor.commands.focus());
  await page.keyboard.press('Control+z');
  assert(await editor.evaluate(element => JSON.stringify(element.editor.getJSON())) === originalState, 'Undo did not restore the drop');
  result.endnotesNotDraggedOrInsertedAfter = true;

  // Enter exits a definition into the body before the region. The appended ordering
  // transaction shares the engine's original history event.
  await editor.locator('[data-testid="footnote-definition"][data-label="b"] p').click();
  await caretIn('b');
  await page.keyboard.press('Enter');
  assert((await presentation()).notes.filter(note => note.heading === '"미주"').length === 1, 'Enter split the endnotes region');
  assert(await editor.evaluate(element => element.editor.state.selection.$from.parent.type.name === 'paragraph'), 'Enter did not leave the definition');
  await page.keyboard.press('Control+z');
  assert(await editor.evaluate(element => JSON.stringify(element.editor.getJSON())) === originalState, 'One Undo did not restore definitions');
  assert((await presentation()).notes.find(note => note.label === 'a').heading !== '"미주"', 'Undo split the endnotes region');
  result.groupFollowsHistory = true;

  // The decorative label is absent from native DOM text selection and Source copying.
  // Whole-definition copying retains its existing fail-closed restriction.
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.evaluate(() => navigator.clipboard.writeText('clipboard before note selection'));
  await editor.evaluate(element => { element.editor.commands.selectAll(); element.editor.commands.focus(); });
  await page.keyboard.press('Control+c');
  assert(await page.evaluate(() => navigator.clipboard.readText()) === 'clipboard before note selection', 'Rejected copy changed clipboard');
  assert(/cannot be copied losslessly/.test(await page.getByTestId('notice').innerText()), 'Existing copy restriction missing');
  assert(!await editor.evaluate(element => { const range = document.createRange(); range.selectNodeContents(element); return range.toString().includes('미주'); }), 'Generated heading entered selected text');
  const preview = await showSource();
  assert(await preview.textContent() === regionsPlaced, 'Source differs from the Markdown Save writes');
  await preview.evaluate(element => {
    const range = document.createRange(); range.selectNodeContents(element);
    const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
  });
  await page.keyboard.press('Control+c');
  const copiedSource = (await page.evaluate(() => navigator.clipboard.readText())).replaceAll('\r\n', '\n');
  // Chromium's native preformatted selection omits the terminal newline.
  assert(copiedSource === regionsPlaced.replace(/\n$/, ''), 'Source clipboard differs: ' + JSON.stringify({copiedSource, regionsPlaced}));
  await showVisual();
  result.decorativeHeadingExcluded = true;

  // An unedited document's first Save places its endnotes; saving again gives the same file.
  assert(await status() !== 'Unsaved changes' && await notice.count() === 1 && await regionsRead() === regionsSource, 'Unedited document state');
  await save.click();
  await saved();
  assert(await regionsRead() === regionsPlaced, 'First Save did not place the endnotes');
  assert(await notice.count() === 0, 'Notice stayed after Save');
  await save.click();
  await saved();
  assert(await regionsRead() === regionsPlaced, 'Repeated Save changed the file');
  await page.getByRole('button', {name:'File actions', exact:true}).click();
  await page.getByRole('menuitem', {name:'Reload', exact:true}).click();
  await ready();
  assert(await editor.evaluate(element => JSON.stringify(element.editor.getJSON())) === originalState, 'Reload changed definition order or state');
  assert((await presentation()).notes.every(note => note.startsGroup ? note.heading === '"미주"' : note.heading !== '"미주"'), 'Reload lost group presentation');
  await save.click();
  await saved();
  assert(await regionsRead() === regionsPlaced, 'Save after Reload changed the file');
  result.uneditedSavePlacesOnce = true;

  // Moving [^b]'s reference to the end of the paragraph moves its endnote last; one Undo restores both.
  const moveReference = () => editor.evaluate(element => {
    const {state, view} = element.editor;
    const start = state.doc.child(0).nodeSize + 1;
    let at = -1;
    state.doc.child(1).forEach((node, offset) => { if (node.type.name === 'footnoteReference' && node.attrs.label === 'b') at = start + offset; });
    const end = start + state.doc.child(1).content.size;
    const chip = state.doc.nodeAt(at);
    view.dispatch(state.tr.insert(end, chip).delete(at, at + chip.nodeSize));
  });
  await moveReference();
  assert(await order() === 'heading paragraph paragraph paragraph a c d b', `Reordered endnotes: ${await order()}`);
  assert(JSON.stringify(await texts(chips)) === '["1","2","3","4"]' && JSON.stringify(await texts(editor.getByTestId('footnote-number'))) === '["1","2","3","4"]', 'Renumbered endnotes');
  await editor.evaluate(element => element.editor.commands.focus());
  await page.waitForFunction(() => document.querySelector('[data-document-tab][data-active=true] .document-editor').editor.view.hasFocus());
  const orderBecomes = expected => page.waitForFunction(expected => {
    const labels = [];
    document.querySelector('[data-document-tab][data-active=true] .document-editor').editor.state.doc.forEach(node => labels.push(node.type.name === 'footnoteDefinition' ? node.attrs.label : node.attrs.footnote || node.type.name));
    return labels.join(' ') === expected;
  }, expected, {timeout: 5000}).then(() => true, () => false);
  await page.keyboard.press('Control+z');
  assert(await orderBecomes('heading paragraph paragraph paragraph b a c d'), 'Undo did not restore reference and endnote order');
  await page.keyboard.press('Control+Shift+z');
  assert(await orderBecomes('heading paragraph paragraph paragraph a c d b'), 'Redo did not restore reference and endnote order');
  await save.click();
  await saved();
  const reordered = [regionsBody[0], regionsBody[1], regionsBody[2].replace('First claim[^b], second[^a], long note[^c] and final note[^d].', 'First claim, second[^a], long note[^c] and final note[^d].[^b]'),
    ...regionsBody.slice(3), regionsNotes[1], regionsNotes[2], regionsNotes[3], regionsNotes[0]].join('\n\n') + '\n';
  assert(await regionsRead() === reordered, 'Saved reference order differs: ' + await regionsRead());
  result.referenceOrderUndoRedo = true;

  // Sections hold no endnotes: deleting the last section keeps the endnotes other sections
  // reference, deleting one that holds an endnote's last reference is refused, and moving a
  // section leaves the endnotes after the body.
  const sectionsFile = fixture('sections.md');
  const sectionsRead = reader(sectionsFile);
  await open(sectionsFile);
  const headingAction = async (text, item) => {
    const index = await editor.evaluate((element, text) => {
      let found = -1;
      element.editor.state.doc.forEach((node, _pos, at) => { if (found < 0 && node.textContent === text) found = at; });
      return found + 1;
    }, text);
    await editor.locator('h1, h2, h3').filter({hasText:new RegExp(`^${text}$`)}).hover();
    await page.getByRole('button', {name:`Move heading block ${index}`, exact:true}).click();
    await page.getByRole('menuitem', {name:item, exact:true}).click();
  };
  assert(await order() === 'heading heading paragraph heading paragraph b a', `Sections order: ${await order()}`);
  await headingAction('Section A', 'Delete section');
  assert(/last reference to endnote 2\b/.test(await page.getByTestId('notice').innerText()), 'Orphaning section delete not explained');
  assert(await order() === 'heading heading paragraph heading paragraph b a', 'Refused section delete changed the document');
  await headingAction('Section A', 'Move section down');
  assert(await order() === 'heading heading paragraph heading paragraph b a' &&
    await editor.evaluate(element => element.editor.state.doc.child(1).textContent === 'Section B'), 'Section move took endnotes');
  await page.keyboard.press('Control+z');
  await headingAction('Section B', 'Delete section');
  assert(await order() === 'heading heading paragraph b a', `Last section delete took endnotes: ${await order()}`);
  await save.click();
  await saved();
  assert(await sectionsRead() === '---\nieumdoc: 1\n---\n\n# Document\n\n## Section A\n\nFirst claim[^b] and another[^a].\n\n[^b]: First note.\n\n[^a]: Second note.\n', 'Section delete saved differently: ' + await sectionsRead());
  result.sectionsHoldNoEndnotes = true;

  // Repeated references return to the invoking occurrence after definition and body edits.
  await open(fixture('repeat.md'));
  await editor.locator('[data-label="x"][data-testid="footnote-reference"] sup').nth(1).click();
  await caretIn('x');
  await page.keyboard.type(' Edited.');
  await editor.locator('[data-testid="footnote-definition"][data-label="x"] [data-testid="footnote-number"]').click();
  assert(await editor.evaluate(element => element.editor.state.selection.$from.parent.textContent.startsWith('Second')), 'Returned to first reference');
  await editor.locator('[data-label="x"][data-testid="footnote-reference"] sup').nth(1).click();
  await caretIn('x');
  await editor.locator('p.paragraph', {hasText:'First'}).click();
  await page.keyboard.press('Home');
  await page.keyboard.type('Prefix ');
  await editor.locator('[data-testid="footnote-definition"][data-label="x"] [data-testid="footnote-number"]').click();
  assert(await editor.evaluate(element => element.editor.state.selection.$from.parent.textContent.startsWith('Second')), 'Return bookmark did not map body edits');
  // Screen readers hear the number and its action.
  assert(await editor.locator('[data-testid="footnote-definition"][data-label="x"] [data-testid="footnote-number"]').getAttribute('aria-label') === 'Endnote 1. Return to the reference.', 'Number has no accessible name');
  await save.click();
  await saved();
  assert(await reader(fixture('repeat.md'))() === '---\nieumdoc: 1\n---\n\n# Repeated note\n\nPrefix First[^x].\n\nSecond[^x] and other[^y].\n\n[^x]: Shared note. Edited.\n\n[^y]: Other note.\n', 'Repeated note saved differently');
  result.returnToInvokingReference = true;

  return result;
}
