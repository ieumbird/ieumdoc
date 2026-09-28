// Real scratch-file saves across engine history, drafts and an external conflict.
async page => {
  await page.unrouteAll();
  await page.reload();
  const ready = () => page.locator('[data-testid="status"][data-operation="Ready"]').waitFor({state:'attached'});
  await ready();
  const origin = page.url().split('/').slice(0, 3).join('/');
  const loaded = await (await page.request.get(`${origin}/api/document`)).json();
  const separator = loaded.path.includes('\\') ? '\\' : '/';
  const root = loaded.path.split(separator).slice(0, -4).join(separator);
  const file = [root, 'tmp', 'save-session', 'session.md'].join(separator);
  const technical = [root, 'tmp', 'save-session', 'technical-document.md'].join(separator);
  const result = {};
  const check = (name, value) => { if (!value) throw new Error(name); result[name] = true; };
  const read = async path => (await (await page.request.get(`${origin}/api/document?path=${encodeURIComponent(path)}`)).json());
  const save = async () => {
    await page.getByTestId('save').click();
    await page.locator('[data-testid="status"][data-operation^="Saved"]').waitFor({state:'attached'});
  };
  const open = async path => {
    await page.getByRole('button', {name:'Open…'}).click();
    await page.getByTestId('file-path').fill(path);
    await page.getByRole('dialog').getByRole('button', {name:'Open', exact:true}).click();
    await page.getByRole('dialog').waitFor({state:'detached'});
    await ready();
  };
  const paragraph = () => page.locator('.document-editor > p[data-block="paragraph"]').first();
  const undo = async () => { await paragraph().click(); await page.keyboard.press('Control+z'); };
  const redo = async () => { await paragraph().click(); await page.keyboard.press('Control+Shift+z'); };
  await open(file);
  await paragraph().click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Saved');
  await page.evaluate(() => {
    const editor = document.querySelector('.document-editor').editor;
    window.saveSession = {editor, selection: editor.state.selection.toJSON()};
  });
  await save();
  check('saveKeepsEditorAndSelection', await page.evaluate(() => {
    const e = document.querySelector('.document-editor').editor;
    return e === window.saveSession.editor && JSON.stringify(e.state.selection.toJSON()) === JSON.stringify(window.saveSession.selection) && e.can().undo();
  }));
  check('firstFile', (await read(file)).source.includes('Alpha. Saved'));
  await undo();
  check('undoAfterSaveDirty', await page.getByTestId('status').innerText() === 'Unsaved changes');
  await save();
  check('undoSaved', (await read(file)).source.includes('Alpha.\n'));
  await redo();
  await save();
  check('redoSaved', (await read(file)).source.includes('Alpha. Saved'));

  // Enter leaves an empty editing paragraph in place. It does not block a Save or become a file block.
  await paragraph().click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  const selection = await page.evaluate(() => document.querySelector('.document-editor').editor.state.selection.from);
  await save();
  check('emptyParagraphRetained', await page.locator('.document-editor > p[data-block="paragraph"]').count() === 3 &&
    await page.evaluate(pos => document.querySelector('.document-editor').editor.state.selection.from === pos, selection));
  check('emptyParagraphNotWritten', (await read(file)).document.blocks.length === 3);
  await page.locator('.document-editor').focus();
  await page.keyboard.type('Inserted.');
  await save();
  check('typingAfterEmptySave', (await read(file)).source.includes('Inserted.'));
  await undo();
  await save();
  check('undoInsertionAcrossSave', !(await read(file)).source.includes('Inserted.'));
  await redo();
  await save();

  // Deletion and history still address the opening snapshot after indexes have changed.
  await page.getByText('Beta.', {exact:true}).hover();
  await page.getByRole('button', {name:'Move paragraph block 4', exact:true}).click();
  await page.getByRole('menuitem', {name:'Delete', exact:true}).click();
  await save();
  check('deletionSaved', !(await read(file)).source.includes('Beta.'));
  await undo();
  await save();
  check('undoDeletionSaved', (await read(file)).source.includes('Beta.'));

  // Set a precise text selection to isolate split/save history from pointer hit testing.
  await page.locator('.document-editor').evaluate(element => {
    const e = element.editor;
    e.commands.setTextSelection(e.state.doc.firstChild.nodeSize + 3);
    e.view.focus();
  });
  await page.keyboard.press('Enter');
  await save();
  check('splitSaved', (await read(file)).source.includes('Al\n\npha. Saved'));
  await undo(); await save();
  check('undoSplitSaved', (await read(file)).source.includes('Alpha. Saved'));
  await redo(); await save();
  await page.getByText('pha. Saved', {exact:true}).click(); await page.keyboard.press('Home'); await page.keyboard.press('Backspace');
  await save();
  check('mergeAfterSavedSplit', (await read(file)).source.includes('Alpha. Saved'));

  // Keep the real write response in flight while another structural edit is typed.
  let release, arrived;
  const gate = new Promise(resolve => { release = resolve; });
  const received = new Promise(resolve => { arrived = resolve; });
  await page.route('**/api/document', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    const response = await route.fetch(); arrived(); await gate; await route.fulfill({response});
  });
  await page.getByTestId('save').click(); await received;
  await paragraph().click(); await page.keyboard.press('End'); await page.keyboard.press('Enter');
  await page.keyboard.type('DuringSave');
  const pendingDocument = await page.locator('.document-editor').evaluate(element => JSON.stringify(element.editor.getJSON()));
  release();
  await page.locator('[data-testid="status"][data-operation="Saved; newer edits pending"]').waitFor({state:'attached'});
  check('pendingStructureRetained', pendingDocument.includes('DuringSave') &&
    await page.locator('.document-editor').evaluate(element => JSON.stringify(element.editor.getJSON())) === pendingDocument &&
    !(await read(file)).source.includes('DuringSave'));
  await page.unrouteAll(); await save();
  check('pendingStructureSavedNext', (await read(file)).source.includes('DuringSave'));

  const beforeInvalid = (await read(file)).source;
  await page.locator('.document-editor').evaluate(element => {
    const e = element.editor, from = e.state.doc.firstChild.nodeSize + 1;
    e.commands.setTextSelection({from, to:from + e.state.doc.child(1).content.size}); e.view.focus();
  });
  await page.keyboard.press('Backspace');
  await page.getByTestId('save').click(); await page.getByText('Save failed', {exact:true}).waitFor();
  const invalid = { error: await page.getByTestId('error').innerText(), diskKept: (await read(file)).source === beforeInvalid,
    paragraph: await paragraph().textContent() };
  if (!invalid.error.includes('Block 2 (paragraph)') || !invalid.diskKept || invalid.paragraph !== '') throw new Error(JSON.stringify(invalid));
  check('invalidContentLocatedAndRetained', true);
  await undo(); await save();

  // A rejected save must not acknowledge the edited state or break subsequent history/save.
  await paragraph().click(); await page.keyboard.press('End'); await page.keyboard.type(' Retry');
  await page.route('**/api/document', route => route.request().method() === 'POST'
    ? route.fulfill({status:400, json:{error:'Temporary save failure'}}) : route.continue());
  await page.getByTestId('save').click();
  await page.getByText('Save failed', {exact:true}).waitFor();
  check('failureRetainsInput', (await paragraph().innerText()).includes('Retry') && !(await read(file)).source.includes('Retry'));
  await page.unrouteAll(); await save();
  check('retryWrites', (await read(file)).source.includes('Retry'));

  // Real independent write to the same file; local save must conflict and Source must remain recoverable.
  await paragraph().click(); await page.keyboard.press('End'); await page.keyboard.type(' Local');
  const external = await read(file);
  const target = external.document.blocks.find(block => block.block === 'paragraph');
  const response = await page.request.post(`${origin}/api/document`, {data:{path:file, revision:external.revision,
    paragraphs:[{path:target.path, content:[{kind:'text', text:'External.'}]}]}});
  check('externalWrite', response.ok());
  await page.getByTestId('save').click(); await page.getByText('Save conflict', {exact:true}).waitFor();
  check('conflictPreservesBoth', (await paragraph().innerText()).includes('Local') && (await read(file)).source.includes('External.'));
  await page.getByTestId('view-source').click(); await page.getByTestId('source-view').waitFor();
  check('conflictSourceRecovery', (await page.getByTestId('source-view').innerText()).includes('Local'));
  await page.getByTestId('view-visual').click();
  await page.getByRole('button', {name:'Reload', exact:true}).click();
  await page.getByRole('dialog', {name:'Discard local changes?'}).waitFor();
  await page.getByRole('button', {name:'Keep editing', exact:true}).click();
  check('reloadCancelKeepsWork', (await paragraph().innerText()).includes('Local'));
  check('beforeUnloadProtected', await page.evaluate(() => {
    const event = new Event('beforeunload', {cancelable:true}); window.dispatchEvent(event); return event.defaultPrevented;
  }));
  await page.getByRole('button', {name:'Reload', exact:true}).click();
  await page.getByRole('button', {name:'Discard and reload', exact:true}).click(); await ready();
  check('reloadUsesDisk', (await paragraph().innerText()) === 'External.');

  const blockCount = (await read(file)).document.blocks.length;
  await page.getByRole('dialog').waitFor({state:'detached'});
  await page.locator('.document-editor').evaluate(element => {
    const e = element.editor; e.commands.setTextSelection(e.state.doc.firstChild.nodeSize + 1); e.view.focus();
  });
  await page.keyboard.press('Enter');
  await save();
  const leading = { blocks:(await read(file)).document.blocks.length, blockCount, text:await paragraph().textContent(),
    json:await page.locator('.document-editor').evaluate(element => element.editor.getJSON()) };
  if (leading.blocks !== blockCount || leading.text !== '') throw new Error(JSON.stringify(leading));
  check('leadingEmptyParagraphNotWritten', true);
  await undo(); await save();

  // Existing drafts survive saving applied body content and Source switching, then Apply saves them.
  await open(technical);
  const body = page.getByText('The current reference is calculated from the active power command.', {exact:true});
  await body.click(); await page.keyboard.press('End'); await page.keyboard.type(' BodySaved');
  const equation = page.locator('[data-block="equation"]').first();
  await equation.hover(); await equation.getByRole('button', {name:'Edit', exact:true}).click();
  await page.getByTestId('equation-latex').fill('x + 40');
  await save();
  check('draftSaveIsExplicit', (await page.getByTestId('status').innerText()) === 'Unsaved changes' && await page.getByTestId('draft-notice').isVisible());
  check('onlyAppliedContentWritten', (await read(technical)).source.includes('BodySaved') && !(await read(technical)).source.includes('x + 40'));
  await page.getByTestId('view-source').click(); await page.getByTestId('source-view').waitFor();
  check('sourceExcludesDraft', !(await page.getByTestId('source-view').innerText()).includes('x + 40'));
  await page.getByTestId('view-visual').click();
  check('draftRetained', await page.getByTestId('equation-latex').inputValue() === 'x + 40');
  await page.getByTestId('equation-apply').click(); await save();
  check('appliedDraftWritten', (await read(technical)).source.includes('x + 40'));
  await page.getByRole('button', {name:'Reload', exact:true}).click(); await ready();
  check('reopenedAppliedEquation', await page.locator('[data-block="equation"] .katex').count() > 0 &&
    (await page.getByTestId('document-editor').innerText()).includes('BodySaved'));
  return result;
}
