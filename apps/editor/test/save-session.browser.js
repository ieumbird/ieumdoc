// Real scratch-file saves across engine history, drafts and an external conflict.
async (page, { openDocument }) => {
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
    await openDocument(page, path);
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
    window.saveSession = {editor, selection: editor.state.selection.toJSON(), browserSave: []};
    window.addEventListener('keydown', event => { if (event.code === 'KeyS') window.saveSession.browserSave.push(!event.defaultPrevented); });
  });
  // Ctrl+S from the editor saves through the Save path without leaving the editor.
  await page.keyboard.press('Control+s');
  await page.locator('[data-testid="status"][data-operation^="Saved"]').waitFor({state:'attached'});
  check('saveShortcutKeepsEditorFocusSelectionAndHistory', await page.evaluate(() => {
    const e = document.querySelector('.document-editor').editor;
    return e === window.saveSession.editor && JSON.stringify(e.state.selection.toJSON()) === JSON.stringify(window.saveSession.selection) &&
      e.can().undo() && e.view.hasFocus() && JSON.stringify(window.saveSession.browserSave) === '[false]';
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
  // The shortcut reports a failure exactly like the button.
  await page.keyboard.press('Control+s');
  await page.getByText('Save failed', {exact:true}).waitFor();
  check('shortcutFailureShown', (await page.getByTestId('error').innerText()).includes('Temporary save failure'));
  check('failureRetainsInput', (await paragraph().innerText()).includes('Retry') && !(await read(file)).source.includes('Retry'));
  await page.unrouteAll(); await save();
  check('retryWrites', (await read(file)).source.includes('Retry'));

  // Real independent write to the same file; local save must conflict and Source must remain recoverable.
  await paragraph().click(); await page.keyboard.press('End'); await page.keyboard.type(' Local');
  const external = await read(file);
  const target = external.document.blocks.find(block => block.block === 'paragraph');
  const response = await page.request.post(`${origin}/api/document`, {data:{path:file, revision:external.revision, base:{source:external.source},
    paragraphs:[{path:target.path, content:[{kind:'text', text:'External.'}]}]}});
  check('externalWrite', response.ok());
  await page.getByTestId('save').click(); await page.getByText('Save conflict', {exact:true}).waitFor();
  check('conflictPreservesBoth', (await paragraph().innerText()).includes('Local') && (await read(file)).source.includes('External.'));
  await page.getByTestId('view-source').click(); await page.getByTestId('source-view').waitFor();
  check('conflictSourceRecovery', (await page.getByTestId('source-view').innerText()).includes('Local'));
  await page.getByTestId('view-visual').click();
  await page.getByRole('button', {name:'File actions', exact:true}).click();
  await page.getByRole('menuitem', {name:'Reload', exact:true}).click();
  await page.getByRole('dialog', {name:'Discard local changes?'}).waitFor();
  await page.getByRole('button', {name:'Keep editing', exact:true}).click();
  check('reloadCancelKeepsWork', (await paragraph().innerText()).includes('Local'));
  check('beforeUnloadProtected', await page.evaluate(() => {
    const event = new Event('beforeunload', {cancelable:true}); window.dispatchEvent(event); return event.defaultPrevented;
  }));
  await page.getByRole('button', {name:'File actions', exact:true}).click();
  await page.getByRole('menuitem', {name:'Reload', exact:true}).click();
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
  await page.getByRole('button', {name:'File actions', exact:true}).click();
  await page.getByRole('menuitem', {name:'Reload', exact:true}).click(); await ready();
  check('reopenedAppliedEquation', await page.locator('[data-block="equation"] .katex').count() > 0 &&
    (await page.getByTestId('document-editor').innerText()).includes('BodySaved'));

  // Keep the scattered opening source through normalization, Figure/history changes and a
  // delayed acknowledgement. The existing footnote fixture has only valid references/definitions.
  const notes = [root, 'tmp', 'footnotes', 'sections.md'].join(separator);
  const opening = await read(notes);
  const canonical = '# Document\n\n## Section A\n\nFirst claim[^b] and another[^a].\n\n## Section B\n\n' +
    'Another paragraph[^b].\n\n[^b]: First note.\n\n[^a]: Second note.\n';
  await open(notes);
  check('endnoteOpenKeepsSourceAndRevision', (await read(notes)).source === opening.source &&
    (await read(notes)).revision === opening.revision && await page.getByTestId('status').innerText() !== 'Unsaved changes');
  await page.locator('.document-editor').evaluate(element => { window.endnoteReplayEditor = element.editor; });
  const editor = page.locator('.document-editor');
  const same = (name, actual, expected) => {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${name}: ${JSON.stringify({actual, expected})}`);
  };
  const state = () => editor.evaluate(element => ({
    document: element.editor.getJSON(), selection: element.editor.state.selection.toJSON(),
    sameEditor: element.editor === window.endnoteReplayEditor,
  }));
  const preview = async expected => {
    const before = await read(notes);
    await page.getByTestId('view-source').click();
    const source = page.getByTestId('source-view').locator('pre');
    await source.waitFor();
    same('Endnote replay Source', await source.textContent(), expected);
    await page.getByTestId('view-visual').click();
    await editor.waitFor();
    const after = await read(notes);
    same('Source must not write', [after.source, after.revision], [before.source, before.revision]);
  };
  const saves = [];
  let acknowledged = opening, savedEdits, hold, releaseReplay;
  const replayRoute = async route => {
    if (route.request().method() !== 'POST') return route.continue();
    const request = route.request().postDataJSON();
    const response = await route.fetch();
    saves.push({request, status: response.status(), response: await response.json()});
    if (hold) { hold.arrived(); await hold.gate; }
    await route.fulfill({response});
  };
  await page.route('**/api/document', replayRoute);
  const verifySave = async (expected, expectedState, name) => {
    const disk = await read(notes), saved = saves.at(-1);
    same(`${name} Markdown`, disk.source, expected);
    same(`${name} status`, saved.status, 200);
    same(`${name} request revision`, saved.request.revision, acknowledged.revision);
    same(`${name} opening source`, saved.request.base.source, opening.source);
    same(`${name} savedEdits`, saved.request.base.savedEdits, savedEdits);
    const digest = await page.evaluate(async source => [...new Uint8Array(await crypto.subtle.digest('SHA-256',
      new TextEncoder().encode(source)))].map(byte => byte.toString(16).padStart(2, '0')).join(''), disk.source);
    same(`${name} revision`, [disk.revision, saved.response.revision], [digest, digest]);
    same(`${name} Editor/selection`, await state(), expectedState);
    check(`${name} retains Editor`, expectedState.sameEditor);
    const {path, revision, base, ...edits} = saved.request;
    savedEdits = edits;
    acknowledged = disk;
  };
  const saveState = async (expected, name) => {
    await preview(expected);
    const submittedState = await state();
    await save();
    await verifySave(expected, submittedState, name);
    await preview(expected);
  };
  try {
    await saveState(canonical, 'endnoteNormalization');
    check('normalizationChangedRevision', acknowledged.revision !== opening.revision && opening.source !== canonical);
    await paragraph().click(); await page.keyboard.press('End'); await page.keyboard.type(' Edited.');
    const edited = canonical.replace('another[^a].', 'another[^a]. Edited.');
    await saveState(edited, 'bodyAfterNormalization');
    await undo(); await saveState(canonical, 'undoNormalizedBody');
    await redo(); await saveState(edited, 'redoNormalizedBody');

    await paragraph().hover();
    await page.getByRole('button', {name:/Insert block after paragraph block/}).first().click();
    await page.getByRole('menuitem', {name:'Figure', exact:true}).click();
    const empty = edited.replace('Edited.\n\n## Section B', 'Edited.\n\n:::{figure}\n:::\n\n## Section B');
    await saveState(empty, 'emptyFigureWithEndnotes');
    await undo(); await saveState(edited, 'undoFigureWithEndnotes');
    await redo(); await saveState(empty, 'redoFigureWithEndnotes');

    // Move the first b reference to its paragraph end in one transaction; the endnote plugin
    // follows it in the same history event. The Figure and every opening locator remain.
    await editor.evaluate(element => {
      const {state, view} = element.editor;
      let block, start;
      state.doc.forEach((node, pos) => { if (node.type.name === 'paragraph' && node.textContent.startsWith('First claim')) { block = node; start = pos + 1; } });
      let at;
      block.forEach((node, offset) => { if (node.type.name === 'footnoteReference' && node.attrs.label === 'b') at = start + offset; });
      const chip = state.doc.nodeAt(at);
      view.dispatch(state.tr.insert(start + block.content.size, chip).delete(at, at + chip.nodeSize));
    });
    const reordered = empty.replace('First claim[^b] and another[^a]. Edited.', 'First claim and another[^a]. Edited.[^b]')
      .replace('[^b]: First note.\n\n[^a]: Second note.\n', '[^a]: Second note.\n\n[^b]: First note.\n');
    await saveState(reordered, 'reorderedEndnotesWithFigure');
    await undo(); await saveState(empty, 'undoEndnoteOrderWithFigure');
    await redo(); await saveState(reordered, 'redoEndnoteOrderWithFigure');

    const figure = editor.locator('[data-block="figure"]');
    const editFigure = figure.getByRole('button', {name:'Edit figure'});
    const editCaption = async caption => {
      await editFigure.locator('..').hover({position:{x:4,y:4}}); await editFigure.click();
      await page.getByTestId('figure-caption').fill(caption);
      await page.getByTestId('figure-apply').click();
      await page.getByTestId('figure-editor').waitFor({state:'detached'});
    };
    await editCaption('Reserved.');
    const captioned = reordered.replace(':::{figure}\n:::', ':::{figure}\n\nReserved.\n:::');
    await preview(captioned);

    // Fetch commits the actual file; only its response is held. No clock delay or mocked revision.
    let arrived;
    const received = new Promise(resolve => { arrived = resolve; });
    const gate = new Promise(resolve => { releaseReplay = resolve; });
    hold = {arrived, gate};
    await page.getByTestId('save').click(); await received;
    same('Held Save writes only its snapshot', (await read(notes)).source, captioned);
    const note = editor.locator('[data-block="footnote"][data-label="b"] p');
    await note.click();
    // A Figure's node selection changes to the clicked definition on the next frame.
    // Wait for the real caret before typing, as the existing footnotes scenario does.
    await page.waitForFunction(() => {
      const selection = document.querySelector('.document-editor').editor.state.selection;
      return selection.empty && selection.$from.parent.type.name === 'footnoteDefinition' && selection.$from.parent.attrs.label === 'b';
    });
    await page.keyboard.press('End'); await page.keyboard.type(' During save.');
    const pendingState = await state();
    releaseReplay();
    await page.locator('[data-testid="status"][data-operation="Saved; newer edits pending"]').waitFor({state:'attached'});
    hold = undefined;
    await verifySave(captioned, pendingState, 'captionSaveWithPendingEndnote');
    check('pendingEndnoteStaysDirty', await page.getByTestId('status').innerText() === 'Unsaved changes');
    const latest = captioned.replace('[^b]: First note.', '[^b]: First note. During save.');
    await preview(latest);
    await saveState(latest, 'pendingEndnoteNextSave');
    await undo(); await saveState(captioned, 'undoPendingEndnote');
    await redo(); await saveState(latest, 'redoPendingEndnote');
    await editCaption('');
    const latestEmpty = latest.replace(':::{figure}\n\nReserved.\n:::', ':::{figure}\n:::');
    await saveState(latestEmpty, 'restoreEmptyFigureKeepsPendingEndnote');

    await page.getByRole('button', {name:'File actions', exact:true}).click();
    await page.getByRole('menuitem', {name:'Reload', exact:true}).click(); await ready();
    const reloaded = await read(notes);
    same('Reload keeps Markdown and revision', [reloaded.source, reloaded.revision], [latestEmpty, acknowledged.revision]);
    same('Empty Figure survives Reload', reloaded.document.blocks.filter(block => block.block === 'figure')
      .map(block => [block.contentKind, block.label, block.caption.text]), [['none', '', '']]);
    same('Endnotes survive Reload in reference order', reloaded.document.blocks.filter(block => block.block === 'footnote')
      .map(block => [block.label, block.text]), [['a', 'Second note.'], ['b', 'First note. During save.']]);
    check('emptyFigureAndEndnotesVisibleAfterReload', await editor.locator('[data-block="figure"]').count() === 1 &&
      JSON.stringify(await editor.locator('[data-block="footnote"]').evaluateAll(nodes => nodes.map(node => node.dataset.label))) === '["a","b"]');
    await preview(latestEmpty);
  } finally {
    releaseReplay?.();
    await page.unroute('**/api/document', replayRoute);
  }
  return result;
}
