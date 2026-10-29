// Endnotes (#119, #140, #194, endnotes v4): MyST footnotes shown as one endnotes region after the
// body. Opening a file whose definitions are written within the body changes nothing on disk,
// says what the first Save does, and Source shows that Markdown; Save writes the definitions after
// the body in first-reference order, and saving again gives the same file. Reference chips go to
// their definitions and numbers return to the invoking reference; definitions are edited in place
// or as source; `/` Endnote inserts one; endnotes cannot be dragged and sections hold none;
// reference order changes move them in one Undo step; a draft holds placement until it closes.
async (page, { screenshots = false, openPath, reloadDocument, expect, recoveryRecords }) => {
  page.setDefaultTimeout(15_000);
  await page.unrouteAll();
  await page.reload();
  const ready = () => page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
  const saved = () => page.locator('[data-testid="status"][data-operation="saved"]').waitFor({state:'attached'});
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
    await openPath(page, path);
    await page.getByRole('dialog').waitFor({state:'detached'});
  };
  const editor = page.locator('[data-document-tab][data-active=true] .document-editor');
  const chips = editor.getByTestId('footnote-reference');
  const texts = async locator => (await locator.allInnerTexts()).map(text => text.trim());
  const notice = page.getByTestId('document-notice');
  const save = page.locator('.document-tab-row [data-testid="save"]');
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
  const firstDefinition = editor.locator('[data-testid="footnote-definition"][data-label="b"]');
  if (screenshots) {
    for (const width of [1440, 640]) {
      await page.setViewportSize({width, height: 900});
      await firstDefinition.scrollIntoViewIfNeeded();
      await page.evaluate(() => document.activeElement?.blur());
      await page.mouse.move(0, 0);
      await page.screenshot({path: `tmp/endnotes-714/rest-${width}.png`, fullPage: true});
      await firstDefinition.getByTestId('endnote-edit').click();
      await page.keyboard.press('End');
      await page.waitForFunction(() => document.querySelector('[data-document-tab][data-active=true] .document-editor').editor.state.selection.$from.parent.attrs.label === 'b');
      await page.screenshot({path: `tmp/endnotes-714/edit-${width}.png`, fullPage: true});
      await editor.locator('p.paragraph', {hasText: 'Middle paragraph.'}).click();
    }
    await page.setViewportSize({width: 1280, height: 720});
  }
  assert(await firstDefinition.getAttribute('aria-readonly') === 'true', 'Endnotes start read-only');
  await editor.locator('p.paragraph', {hasText: 'Middle paragraph.'}).click();
  await page.waitForFunction(() => document.querySelector('[data-document-tab][data-active=true] .document-editor').editor.state.selection.$from.parent.textContent === 'Middle paragraph.');
  await page.keyboard.press('End');
  await page.waitForFunction(() => { const {$from} = document.querySelector('[data-document-tab][data-active=true] .document-editor').editor.state.selection; return $from.parentOffset === $from.parent.content.size; });
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => document.querySelector('[data-document-tab][data-active=true] .document-editor').editor.state.selection.node?.attrs.label === 'b');
  await page.keyboard.press('Enter');
  assert(await firstDefinition.getAttribute('aria-readonly') === 'true', 'Enter cannot start editing');
  await firstDefinition.locator('p').dblclick();
  assert(await firstDefinition.getAttribute('aria-readonly') === 'true', 'Double-click cannot start editing');
  await firstDefinition.locator('p').click();
  await page.keyboard.type('Unexpected');
  assert((await firstDefinition.locator('p').innerText()) === 'Defined first.', 'A single click and typing changed a read-only definition');
  assert(await firstDefinition.getAttribute('aria-readonly') === 'true', 'A single click started editing');
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.evaluate(() => navigator.clipboard.writeText('Pasted text'));
  await page.keyboard.press('Control+v');
  assert((await firstDefinition.locator('p').innerText()) === 'Defined first.', 'Paste changed a read-only definition');
  const originalNote = await firstDefinition.locator('p').innerHTML();
  await firstDefinition.getByTestId('endnote-edit').click();
  await page.keyboard.type(' Cancelled.');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('Second line.');
  assert(await firstDefinition.locator('p br').count() > 0, 'Shift+Enter keeps an inline line break');
  await firstDefinition.getByTestId('endnote-cancel').click();
  assert(await firstDefinition.getAttribute('aria-readonly') === 'true' && await firstDefinition.locator('p').innerHTML() === originalNote, 'Cancel restores the original inline content');
  await firstDefinition.getByTestId('endnote-edit').click();
  await page.keyboard.press('Enter');
  assert(await firstDefinition.getAttribute('aria-readonly') === 'true', 'Enter applies and ends editing');
  // Let the NodeView's editable-to-read-only rendering settle before the next physical key.
  const rendered = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await rendered();
  await page.keyboard.press('ArrowDown');
  await rendered();
  assert(await editor.evaluate(element => element.editor.state.selection.node?.attrs.label) === 'a', 'ArrowDown selects the next read-only definition');
  await page.keyboard.press('ArrowUp');
  await rendered();
  assert(await editor.evaluate(element => element.editor.state.selection.node?.attrs.label) === 'b', 'ArrowUp selects the previous read-only definition');
  await page.keyboard.press('Tab');
  assert((await firstDefinition.locator('p').innerText()) === 'Defined first.', 'Arrow or Tab navigation changed a read-only definition');
  assert(await read() === written, 'Opening changed the file');
  assert(await order() === 'heading paragraph paragraph b a', `Opened order: ${await order()}`);
  assert(await status() !== 'Unsaved changes', 'Opening or cancelling made the document dirty');
  assert(/Save moves this file's endnote definitions after the body/.test(await notice.innerText()), 'Missing endnote placement notice');
  assert((await showSource().then(preview => preview.textContent())) === placed, 'Source differs from the Markdown Save writes');
  await showVisual();
  assert(await read() === written && await status() !== 'Unsaved changes', 'Source changed the file or made it dirty');
  result.openWritesNothingAndExplains = true;

  // [^b] is referenced first, so it is endnote 1 although [^a] sorts first.
  assert(JSON.stringify(await texts(chips)) === '["1","2"]', `Chip numbers: ${await texts(chips)}`);
  assert(JSON.stringify(await chips.evaluateAll(nodes => nodes.map(node => node.dataset.label))) === '["b","a"]', 'Chip labels');
  assert(JSON.stringify(await texts(editor.getByTestId('footnote-number'))) === '["1","2"]', 'Definition numbers');
  assert(await editor.evaluate(element => {
    const accent=getComputedStyle(element.querySelector('[data-testid="footnote-reference"] sup')).color;
    return [...element.querySelectorAll('[data-testid="footnote-number"]')].every(number=>getComputedStyle(number).color===accent);
  }), 'Definition numbers must share the superscript reference accent');
  result.numberedByFirstReference = true;

  await editor.locator('[data-testid="footnote-reference"][data-label="a"] sup').click();
  const selected = await page.evaluate(() => document.querySelector('[data-document-tab][data-active=true] .document-editor').editor.state.selection.node?.attrs.label);
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

  // Drag real selected body text onto a read-only definition. A drop's destination is not
  // the editor's prior selection, so a selection-only guard cannot protect this path.
  const bodyForDrop = editor.locator('p.paragraph', {hasText: 'Middle paragraph.'});
  const noteForDrop = editor.locator('[data-testid="footnote-definition"][data-label="b"] p');
  await bodyForDrop.scrollIntoViewIfNeeded();
  const textPoint = (locator, offset, side) => locator.evaluate((element, {offset, side}) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node; let left = offset;
    while ((node = walker.nextNode())) {
      if (left < node.textContent.length) {
        const range = document.createRange();
        range.setStart(node, left); range.setEnd(node, left + 1);
        const box = range.getBoundingClientRect();
        return {x: side === 'right' ? box.right - 1 : box.left + 1, y: box.top + box.height / 2};
      }
      left -= node.textContent.length;
    }
    throw Error('Missing text position');
  }, {offset, side});
  await page.evaluate(() => {
    window.__endnoteDragEvents = [];
    for (const type of ['dragstart', 'drop', 'dragend']) document.addEventListener(type, event => {
      const instance = document.querySelector('[data-document-tab][data-active=true] .document-editor')?.editor;
      window.__endnoteDragEvents.push({type: event.type, trusted: event.isTrusted, selection: instance?.state.selection.toJSON().type});
    }, true);
  });
  const start = await textPoint(bodyForDrop, 0, 'left');
  const end = await textPoint(bodyForDrop, 5, 'right');
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  await page.mouse.move(end.x, end.y, {steps: 8}); await page.mouse.up();
  await page.waitForFunction(() => {
    const {state} = document.querySelector('[data-document-tab][data-active=true] .document-editor').editor;
    return state.doc.textBetween(state.selection.from, state.selection.to) === 'Middle';
  });
  const source = await textPoint(bodyForDrop, 2, 'left');
  const destination = await textPoint(noteForDrop, 5, 'left');
  const beforeDrop = await editor.evaluate(element => JSON.stringify(element.editor.getJSON()));
  await page.mouse.move(source.x, source.y); await page.mouse.down();
  await page.mouse.move(destination.x, destination.y, {steps: 15}); await page.mouse.up();
  const dragEvents = await page.evaluate(() => window.__endnoteDragEvents);
  assert(dragEvents.some(event => event.type === 'dragstart' && event.trusted) && dragEvents.some(event => event.type === 'drop' && event.trusted), 'Expected an actual trusted text drag and drop: ' + JSON.stringify(dragEvents));
  assert(await editor.evaluate(element => JSON.stringify(element.editor.getJSON())) === beforeDrop, 'Body text drop changed a read-only definition or its source');

  // An external draggable element supplies plain text, both with ordinary and whole-document selection.
  for (const selectAll of [false, true]) {
    if (selectAll) {
      await bodyForDrop.click();
      await page.waitForFunction(() => document.querySelector('[data-document-tab][data-active=true] .document-editor').editor.state.selection.$from.parent.textContent === 'Middle paragraph.');
      await page.keyboard.press('Control+a');
      assert(await editor.evaluate(element => element.editor.state.selection.toJSON().type) === 'all', 'Ctrl+A must select the whole document');
    }
    await page.evaluate(() => {
      const source = document.createElement('div');
      source.id = 'external-endnote-drop-probe'; source.draggable = true; source.textContent = 'External drag';
      source.style.cssText = 'position:fixed;top:70px;left:10px;width:100px;height:28px;z-index:99999;background:white';
      source.addEventListener('dragstart', event => { event.dataTransfer.setData('text/plain', 'EXTERNAL'); event.dataTransfer.effectAllowed = 'copy'; });
      document.body.append(source);
      window.__endnoteDragEvents = [];
    });
    const external = await page.locator('#external-endnote-drop-probe').boundingBox();
    const externalDestination = await textPoint(noteForDrop, 5, 'left');
    await page.mouse.move(external.x + 20, external.y + 12); await page.mouse.down();
    await page.mouse.move(externalDestination.x, externalDestination.y, {steps: 15}); await page.mouse.up();
    const externalEvents = await page.evaluate(() => { document.querySelector('#external-endnote-drop-probe').remove(); return window.__endnoteDragEvents; });
    const dragStart = externalEvents.find(event => event.type === 'dragstart' && event.trusted);
    assert(dragStart && externalEvents.some(event => event.type === 'drop' && event.trusted), 'Expected an actual external text drop: ' + JSON.stringify(externalEvents));
    if (selectAll) assert(dragStart.selection === 'all', 'Whole-document selection must still be active when the external drag starts');
    assert(await editor.evaluate(element => JSON.stringify(element.editor.getJSON())) === beforeDrop, `External text drop changed a read-only definition (AllSelection=${selectAll})`);
  }

  // A paste transaction aimed inside the definition is also protected when selection is elsewhere.
  await editor.evaluate(element => {
    const instance = element.editor;
    let inside; let body;
    instance.state.doc.forEach((node, pos) => {
      if (node.type.name === 'footnoteDefinition' && node.attrs.label === 'b') inside = pos + 4;
      if (node.type.name === 'paragraph' && node.textContent === 'Middle paragraph.') body = pos + 2;
    });
    instance.commands.setTextSelection(body); instance.view.focus();
    instance.view.dispatch(instance.state.tr.insertText('PASTE', inside).setMeta('uiEvent', 'paste'));
  });
  assert(await editor.evaluate(element => JSON.stringify(element.editor.getJSON())) === beforeDrop, 'Paste aimed at a read-only definition changed the document');
  await save.click(); await saved();
  assert(await read() === edited, 'Save after blocked drops changed the file');
  await reloadDocument(page); await ready();
  assert(await read() === edited && (await noteForDrop.innerText()) === 'Defined first.', 'Reload after blocked drops changed the definition');
  result.readonlyDropAndPaste = true;

  // A true whole-document replacement is distinct from a targeted drop into an endnote.
  const beforeWholeDocumentEdit = await editor.evaluate(element => JSON.stringify(element.editor.getJSON()));
  for (const action of ['Backspace', 'Delete', 'type']) {
    await editor.evaluate(element => element.editor.view.focus());
    await page.keyboard.press('Control+a');
    assert(await editor.evaluate(element => element.editor.state.selection.toJSON().type) === 'all', `${action}: whole document must be selected`);
    if (action === 'type') await page.keyboard.type('Replacement');
    else await page.keyboard.press(action);
    assert(await editor.evaluate(element => JSON.stringify(element.editor.getJSON())) !== beforeWholeDocumentEdit, `${action}: whole-document replacement must happen`);
    await page.keyboard.press('Control+z');
    assert(await editor.evaluate(element => JSON.stringify(element.editor.getJSON())) === beforeWholeDocumentEdit, `${action}: one Undo must restore the whole document`);
  }
  // Chromium may normalize AllSelection to a document-covering TextSelection before the
  // composition transaction. This is real composition, not a native Windows IME probe.
  await editor.evaluate(element => element.editor.view.focus());
  await page.keyboard.press('Control+a');
  assert(await editor.evaluate(element => element.editor.state.selection.toJSON().type) === 'all', 'Composition must start with a whole-document selection');
  const wholeComposition = await page.context().newCDPSession(page);
  try {
    await wholeComposition.send('Input.dispatchKeyEvent', {type: 'rawKeyDown', key: 'Process', code: 'KeyH', windowsVirtualKeyCode: 229, nativeVirtualKeyCode: 229});
    await wholeComposition.send('Input.imeSetComposition', {text: 'ㅎ', selectionStart: 1, selectionEnd: 1});
    await page.waitForTimeout(120);
    assert(await editor.evaluate(element => element.editor.state.doc.textContent) === 'ㅎ', 'The first composition update must replace the document');
    await wholeComposition.send('Input.imeSetComposition', {text: '한글', selectionStart: 2, selectionEnd: 2});
    await page.waitForTimeout(120);
    assert(await editor.evaluate(element => element.editor.state.doc.textContent) === '한글', 'The second composition update must be retained');
    await wholeComposition.send('Input.insertText', {text: '한글'});
    await page.waitForTimeout(120);
    assert(await editor.evaluate(element => element.editor.state.doc.textContent) === '한글', 'Whole-document composition must replace the document');
    await page.waitForFunction(() => !document.querySelector('[data-document-tab][data-active=true] .document-editor').editor.view.composing);
  } finally { await wholeComposition.detach(); }
  await page.keyboard.press('Control+z');
  assert(await editor.evaluate(element => JSON.stringify(element.editor.getJSON())) === beforeWholeDocumentEdit, 'One Undo must restore the document after composition');
  await editor.evaluate(element => element.editor.view.focus());
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+x');
  assert(await editor.evaluate(element => JSON.stringify(element.editor.getJSON())) === beforeWholeDocumentEdit, 'Whole-document cut retains the existing lossless-copy refusal');
  assert(/cannot be cut losslessly/.test(await page.getByTestId('notice').innerText()), 'Whole-document cut refusal must explain why nothing was removed');

  // A chip selects its read-only definition; only Edit begins editing.
  const caretIn = label => page.waitForFunction(label => {
    const {selection} = document.querySelector('[data-document-tab][data-active=true] .document-editor').editor.state;
    return selection.empty && selection.$from.parent.type.name === 'footnoteDefinition' && selection.$from.parent.attrs.label === label;
  }, label);
  await editor.locator('[data-testid="footnote-reference"][data-label="b"] sup').click();
  assert(await editor.evaluate(element => element.editor.state.selection.node?.attrs.label) === 'b', 'Reference must select its definition before Enter');
  await firstDefinition.getByTestId('endnote-edit').click();
  await caretIn('b');
  await page.keyboard.type(' More.');
  await firstDefinition.getByTestId('endnote-apply').click();
  assert(await firstDefinition.getAttribute('aria-readonly') === 'true' && (await firstDefinition.locator('p').innerText()).endsWith(' More.'), 'Apply retains the edits and closes the editor');
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
  await created.getByTestId('endnote-edit').click();
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
  await page.getByTestId('error').getByText('Technical details', {exact:true}).click();
  assert(/\[\^b\] has no reference/.test(await page.getByTestId('error').innerText()), 'Refusal reason missing: ' + await page.getByTestId('error').innerText());
  assert(await read() === inserted, 'Refused save wrote the file');
  result.unreferencedDefinitionRefused = true;

  // The rejected edit is real unsaved work, including its unreferenced definition. Finish it
  // explicitly before the next fixture; a page reload alone legitimately offers its recovery.
  const rejectedDocument = await editor.evaluate(element => element.editor.getJSON());
  await expect.poll(async () => (await recoveryRecords(page)).filter(record => record.path === file)
    .map(record => record.snapshot.editor.editorDocument.content)).toContainEqual(rejectedDocument.content);
  await reloadDocument(page);
  await page.getByRole('button', {name:'Discard and reload', exact:true}).click();
  await ready();
  assert(JSON.stringify(await chips.evaluateAll(nodes => nodes.map(node => node.dataset.label))) === '["b","a","1"]', 'Discard did not restore saved references');
  assert(await read() === inserted, 'Discard and reload wrote the file');
  await expect.poll(async () => (await recoveryRecords(page)).some(record => record.path === file)).toBe(false);

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
  const richNote = editor.locator('[data-testid="footnote-definition"][data-label="c"]');
  const inlineMath = richNote.getByTestId('inline-math');
  await inlineMath.dblclick();
  assert(await page.getByTestId('inline-math-properties').count() === 0, 'A read-only definition cannot open inline math properties');
  assert(await richNote.getAttribute('aria-readonly') === 'true', 'Inline math does not implicitly open the definition');
  await richNote.getByTestId('endnote-edit').click();
  await inlineMath.dblclick();
  await page.getByTestId('inline-math-properties').waitFor();
  assert(await richNote.getAttribute('aria-readonly') === 'false', 'Inline math properties retain their endnote edit session');
  await page.getByTestId('inline-math-source').fill('x+1');
  await page.getByRole('button', {name: 'Settings', exact: true}).focus();
  assert(await richNote.getAttribute('aria-readonly') === 'true', 'Focus outside the properties ends endnote editing');
  assert(await page.getByTestId('inline-math-source').isDisabled() && await page.getByTestId('inline-math-apply').isDisabled(), 'A retained property draft cannot edit a read-only definition');
  await richNote.getByTestId('endnote-edit').click();
  assert(await page.getByTestId('inline-math-source').inputValue() === 'x+1' && !await page.getByTestId('inline-math-source').isDisabled(), 'Reopening retains the property draft');
  await page.getByTestId('inline-math-cancel').click();
  await page.getByTestId('inline-math-properties').waitFor({state: 'detached'});
  assert(await richNote.getAttribute('aria-readonly') === 'false', 'Cancel returns to the editing definition');
  await page.keyboard.press('Escape');
  assert(await richNote.getAttribute('aria-readonly') === 'true', 'Escape returns the definition to read-only');
  assert(await editor.evaluate(element => JSON.stringify(element.editor.getJSON())) === originalState, 'Property entry changed the document');
  // The region's decorative label is not a heading: the Outline lists the document's one heading.
  // At the default 1280px viewport the Outline is an explicit overlay.
  await page.getByRole('button',{name:'Outline',exact:true}).click();
  await page.getByTestId('outline').waitFor();
  assert(JSON.stringify(await page.getByTestId('outline').locator('button').allInnerTexts()) === '["Notes in context"]', 'Region label entered the Outline');
  await page.getByRole('button',{name:'Outline',exact:true}).click();
  const presentation = () => editor.evaluate(element => {
    const {view, state} = element.editor;
    const probe=document.createElement('div');
    probe.style.cssText='font-size:var(--font-size-document-endnote);line-height:var(--line-height-document-endnote);padding-left:var(--space-document-endnote-indent);margin-top:var(--space-document-endnotes);margin-bottom:var(--space-document-endnote-gap)';
    document.body.append(probe);
    const computed=getComputedStyle(probe);
    const expected={fontSize:computed.fontSize,lineHeight:computed.lineHeight,indent:computed.paddingLeft,regionGap:computed.marginTop,noteGap:computed.marginBottom};
    probe.remove();
    const isDefinition = node => node.type.name === 'footnoteDefinition';
    const notes = [];
    state.doc.forEach((node, pos, index) => {
      if (!isDefinition(node)) return;
      const dom = view.nodeDOM(pos);
      const style = getComputedStyle(dom);
      const heading = getComputedStyle(dom.querySelector('.footnote-definition'), '::before');
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
    return {notes, expected, overflow: document.documentElement.scrollWidth - innerWidth};
  });
  const displays = [];
  for (const width of [1440, 768, 640]) {
    await page.setViewportSize({width, height:900});
    await page.evaluate(async () => { await document.fonts.ready; document.querySelector('.document-scroll[data-active="true"]').scrollTo(0,0); document.activeElement?.blur(); });
    await page.mouse.move(0,0);
    await page.waitForTimeout(150);
    if (screenshots) await page.screenshot({path:`tmp/visual-refinement/footnotes-${width}.png`, fullPage:true});
    displays.push({width, ...await presentation()});
  }
  for (const display of displays) {
    const expected=display.expected;
    assert(display.notes.length > 0, 'No definitions to review');
    for (const note of display.notes) {
      assert(note.startsGroup ? note.heading === '"Endnotes"' && note.border === '1px' : note.heading !== '"Endnotes"', `Group heading: ${JSON.stringify(note)}`);
      assert(note.fontSize === expected.fontSize && note.lineHeight === expected.lineHeight, `Note typography: ${JSON.stringify(note)}`);
      assert(note.numberSize === expected.fontSize && note.numberAlign === 'baseline', `Definition number: ${JSON.stringify(note)}`);
      assert(note.indent === expected.indent && note.marginTop === (note.startsGroup ? expected.regionGap : expected.noteGap) && note.marginBottom === (note.endsGroup ? expected.regionGap : expected.noteGap), `Note spacing: ${JSON.stringify(note)}`);
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
  for (const name of ['Move up', 'Move down']) {
    assert(await page.getByRole('menuitem', {name, exact:true}).isDisabled(), `Endnote menu enables ${name}`);
  }
  const actions = await page.getByRole('menuitem').allInnerTexts();
  assert(actions.length > 0 && actions.every(item => !/미주로 모으기|Insert|Change to/.test(item)), `Endnote actions: ${actions}`);
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

  // Enter applies without adding a body block or splitting the endnotes region.
  await editor.locator('[data-testid="footnote-definition"][data-label="b"]').getByTestId('endnote-edit').click();
  await caretIn('b');
  await page.keyboard.press('Enter');
  assert((await presentation()).notes.filter(note => note.heading === '"Endnotes"').length === 1, 'Enter split the endnotes region');
  assert(await editor.evaluate(element => element.editor.state.selection.node?.attrs.label) === 'b', 'Enter did not select the read-only definition');
  assert(await editor.evaluate(element => JSON.stringify(element.editor.getJSON())) === originalState, 'Enter changed the applied document');
  result.groupFollowsHistory = true;

  // The decorative label is absent from native DOM text selection and Source copying.
  // Whole-definition copying retains its existing fail-closed restriction.
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.evaluate(() => navigator.clipboard.writeText('clipboard before note selection'));
  await editor.evaluate(element => { element.editor.commands.selectAll(); element.editor.commands.focus(); });
  await page.keyboard.press('Control+c');
  assert(await page.evaluate(() => navigator.clipboard.readText()) === 'clipboard before note selection', 'Rejected copy changed clipboard');
  assert(/cannot be copied losslessly/.test(await page.getByTestId('notice').innerText()), 'Existing copy restriction missing');
  assert(!await editor.evaluate(element => { const range = document.createRange(); range.selectNodeContents(element); return range.toString().includes('Endnotes'); }), 'Generated heading entered selected text');
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
  assert((await presentation()).notes.every(note => note.startsGroup ? note.heading === '"Endnotes"' : note.heading !== '"Endnotes"'), 'Reload lost group presentation');
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
  await editor.locator('[data-testid="footnote-definition"][data-label="x"]').getByTestId('endnote-edit').click();
  await caretIn('x');
  await page.keyboard.type(' Edited.');
  await editor.locator('[data-testid="footnote-definition"][data-label="x"] [data-testid="footnote-number"]').click();
  assert(await editor.evaluate(element => element.editor.state.selection.$from.parent.textContent.startsWith('Second')), 'Returned to first reference');
  await editor.locator('[data-label="x"][data-testid="footnote-reference"] sup').nth(1).click();
  assert(await editor.evaluate(element => element.editor.state.selection.node?.attrs.label) === 'x', 'Repeated reference did not select the definition');
  await editor.locator('p.paragraph', {hasText:'First'}).click();
  await page.waitForFunction(() => document.querySelector('[data-document-tab][data-active=true] .document-editor').editor.state.selection.$from.parent.textContent.startsWith('First'));
  await page.keyboard.press('Home');
  await page.keyboard.type('Prefix ');
  await editor.locator('[data-testid="footnote-definition"][data-label="x"] [data-testid="footnote-number"]').click();
  assert(await editor.evaluate(element => element.editor.state.selection.$from.parent.textContent.startsWith('Second')), 'Return bookmark did not map body edits');
  // Screen readers hear the number and its action.
  assert(await editor.locator('[data-testid="footnote-definition"][data-label="x"] [data-testid="footnote-number"]').getAttribute('aria-label') === 'Endnote 1. Return to the reference.', 'Number has no accessible name');
  await save.click();
  await saved();
  const repeatedSaved = await reader(fixture('repeat.md'))();
  assert(repeatedSaved === '---\nieumdoc: 1\n---\n\n# Repeated note\n\nPrefix First[^x].\n\nSecond[^x] and other[^y].\n\n[^x]: Shared note. Edited.\n\n[^y]: Other note.\n', 'Repeated note saved differently: ' + JSON.stringify(repeatedSaved));
  result.returnToInvokingReference = true;

  const note = editor.locator('[data-testid="footnote-definition"][data-label="x"]');
  await note.getByTestId('endnote-edit').click();
  await page.getByRole('button', {name: 'Settings', exact: true}).focus();
  assert(await note.getAttribute('aria-readonly') === 'true', 'Focus outside the endnote ends editing');
  await editor.evaluate(element => element.editor.view.focus());
  assert(await editor.evaluate(element => element.editor.state.selection.node?.attrs.label) === 'x', 'Returning focus does not put a caret inside the read-only definition');
  await note.getByTestId('endnote-edit').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' /');
  await page.getByRole('menu', {name: 'Insert block', exact: true}).waitFor();
  await page.keyboard.press('Escape');
  assert(await note.getAttribute('aria-readonly') === 'false', 'Escape closes the slash menu before the endnote');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Escape');
  assert(await note.getAttribute('aria-readonly') === 'true', 'Escape closes the endnote after the menu');

  // Dragging inside the read-only definition cannot turn it into an editing selection.
  const box = await note.locator('p').boundingBox();
  await page.mouse.move(box.x + 8, box.y + 8);
  await page.mouse.down();
  await page.mouse.move(box.x + 70, box.y + 8, {steps: 4});
  await page.mouse.up();
  const beforeDragInput = await editor.evaluate(element => JSON.stringify(element.editor.getJSON()));
  await page.keyboard.type('drag');
  assert(await editor.evaluate(element => JSON.stringify(element.editor.getJSON())) === beforeDragInput, 'Drag then typing changed a read-only definition');

  // #714: both the reported direct CDP sequence and an IME's Process key path.
  // Every navigation path stays read-only, and the next composition in body prose works.
  const beforeCompositionText = await note.locator('p').innerText();
  const beforeComposition = await editor.evaluate(element => JSON.stringify(element.editor.getJSON()));
  const input = await page.context().newCDPSession(page);
  const compose = text => input.send('Input.imeSetComposition', {text, selectionStart:text.length, selectionEnd:text.length});
  try {
    for (const via of ['text', 'reference', 'arrows', 'block']) {
      for (const processKey of [false, true]) {
        if (via === 'text') await note.locator('p').click();
        if (via === 'reference') await editor.locator('[data-testid="footnote-reference"][data-label="x"] sup').first().click();
        if (via === 'arrows') {
          await editor.locator('[data-testid="footnote-reference"][data-label="y"] sup').click();
          await page.keyboard.press('ArrowUp');
        }
        if (via === 'block') await editor.evaluate(element => {
          const e=element.editor;
          e.state.doc.forEach((n,pos)=>{if(n.type.name==='footnoteDefinition' && n.attrs.label==='x')e.commands.setNodeSelection(pos);});
          e.view.focus();
        });
        assert(await editor.evaluate(element => element.editor.state.selection.node?.attrs.label) === 'x', `${via}: expected the selected read-only definition`);
        if (processKey) await input.send('Input.dispatchKeyEvent', {type:'rawKeyDown', key:'Process', windowsVirtualKeyCode:229, nativeVirtualKeyCode:229});
        await compose('ㅎ'); await compose('하'); await compose('한글');
        await input.send('Input.insertText', {text:'한글'});
        await page.waitForFunction(() => {
          const el=document.querySelector('[data-document-tab][data-active=true] .document-editor');
          return el.isContentEditable && el.editor.view.hasFocus() && !el.editor.view.composing;
        });
        assert(await note.getAttribute('aria-readonly') === 'true' && await note.locator('p').innerText() === beforeCompositionText, `${via}: composition changed the read-only text`);
        if (processKey) {
          assert(await editor.evaluate(element => element.editor.state.selection.$from.parent.textContent) === '한글', `${via}: composing text must occur exactly once in body space`);
          await page.keyboard.type('Z');
          assert(await editor.evaluate(element => element.editor.state.selection.$from.parent.textContent) === '한글Z', `${via}: subsequent input stopped`);
          await page.keyboard.press('Control+z');
        } else {
          assert(await editor.evaluate(element => JSON.stringify(element.editor.getJSON())) === beforeComposition, `${via}: direct composition changed the document`);
          await page.keyboard.press('ArrowDown');
          assert(await editor.evaluate(element => element.editor.state.selection.node?.attrs.label) === 'y', `${via}: composition left keyboard navigation blocked`);
        }
        assert(await editor.evaluate(element => JSON.stringify(element.editor.getJSON())) === beforeComposition, `${via}: retained input or damaged a definition`);
      }
    }
    // The direct composition path must leave the native input service usable as well.
    await editor.locator('p.paragraph', {hasText:'Prefix First'}).click();
    await page.waitForFunction(() => {
      const s=document.querySelector('[data-document-tab][data-active=true] .document-editor').editor.state.selection;
      return s.empty && s.$from.parent.type.name==='paragraph' && s.$from.parent.textContent.startsWith('Prefix First');
    });
    await page.keyboard.press('End');
    await page.waitForFunction(() => {
      const {$from}=document.querySelector('[data-document-tab][data-active=true] .document-editor').editor.state.selection;
      return $from.parentOffset === $from.parent.content.size;
    });
    const beforeBody = await editor.evaluate(element => element.editor.state.selection.$from.parent.textContent);
    await compose('ㄴ'); await compose('나'); await input.send('Input.insertText', {text:'나'});
    await page.waitForFunction(() => !document.querySelector('[data-document-tab][data-active=true] .document-editor').editor.view.composing);
    await page.keyboard.type('Z');
    assert(await editor.evaluate(element => element.editor.state.selection.$from.parent.textContent) === beforeBody + '나Z', 'Body input failed after read-only composition');
    assert(await note.locator('p').innerText() === beforeCompositionText, 'Composition left stale rendered endnote text');
    await page.keyboard.press('Control+z');
  } finally { await input.detach(); }
  result.readOnlyCompositionDoesNotStall = true;

  // Empty-definition guidance names both safe corrections, in the actual alert and badge.
  await note.getByTestId('endnote-edit').click();
  await caretIn('x');
  await editor.evaluate(element => {
    const e = element.editor;
    e.state.doc.forEach((node, pos) => {
      if (node.type.name === 'footnoteDefinition' && node.attrs.label === 'x') {
        e.commands.setTextSelection({from:pos+1, to:pos+node.nodeSize-1});
        e.commands.deleteSelection();
      }
    });
  });
  await save.click();
  await page.locator('[data-testid="status"][data-operation="save-failed"]').waitFor();
  const error = page.getByTestId('error');
  assert((await error.innerText()).includes('references and definition together'), 'Empty endnote guidance omits paired removal');
  assert((await page.getByTestId('block-save-error').innerText()).includes('references + definition'), 'Empty endnote badge omits paired removal');
  assert(await reader(fixture('repeat.md'))() === repeatedSaved, 'Empty endnote refusal wrote the file');
  await page.getByRole('button', {name:'Settings', exact:true}).click();
  await page.getByTestId('ui-language').selectOption('ko');
  await page.keyboard.press('Escape');
  await page.getByTestId('settings-dialog').waitFor({state:'detached'});
  assert((await presentation()).notes[0].heading === '"미주"', 'Korean UI must localize the region label');
  assert(await note.getByTestId('endnote-edit').innerText() === '편집', 'Endnote controls must reuse UI translations');
  assert((await error.innerText()).includes('참조와 정의를 함께 제거'), 'Korean empty endnote guidance omits paired removal');
  assert((await page.getByTestId('block-save-error').innerText()).includes('참조·정의 함께 제거'), 'Korean badge omits paired removal');
  await page.getByRole('button', {name:'설정', exact:true}).click();
  await page.getByTestId('ui-language').selectOption('en');
  await page.keyboard.press('Escape');
  await page.getByTestId('settings-dialog').waitFor({state:'detached'});
  assert((await presentation()).notes[0].heading === '"Endnotes"', 'English UI must use plural Endnotes');
  await note.getByTestId('endnote-edit').click();
  await caretIn('x');
  await page.keyboard.type('Restored note.');
  await save.click();
  await saved();
  assert((await reader(fixture('repeat.md'))()).includes('[^x]: Restored note.'), 'Filling the empty definition did not save');
  assert(await page.getByTestId('error').count() === 0, 'Successful correction retained save guidance');
  result.emptyEndnoteGuidance = true;

  return result;
}
