// Run with pnpm browser:test figure-authoring.
// Exercises Figure editing, insertion, Apply/Cancel, Save and Reload against a real file.
// The file is a scratch copy under the repository's ignored tmp/ directory; prepare it first
// (see docs/test/TEST_GUIDE.md). The scenario writes that copy only.
async (page, { openDocument, expect }) => {
  const problems = [];
  const onConsole = message => {
    if (message.type() === 'error' || message.type() === 'warning') problems.push(`${message.type()}: ${message.text()}`);
  };
  const onPageError = error => problems.push(`pageerror: ${error.message}`);
  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  await page.unrouteAll();
  await page.reload();
  await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});

  const origin = page.url().split('/').slice(0, 3).join('/');
  const defaultPath = (await (await page.request.get(`${origin}/api/document`)).json()).path;
  const separator = defaultPath.includes('\\') ? '\\' : '/';
  const root = defaultPath.split(separator).slice(0, -4).join(separator);
  const filePath = [root, 'tmp', 'figure-authoring', 'technical-document.md'].join(separator);
  const media = name => `${origin}/document/${name}?path=${encodeURIComponent(filePath)}`;
  for (const name of ['diagram.svg', 'diagram-v2.svg']) {
    if ((await page.request.get(media(name))).status() !== 200) {
      throw new Error(`Prepare ${filePath} with diagram.svg and diagram-v2.svg first`);
    }
  }
  const semantic = async () => {
    const response = await (await page.request.get(`${origin}/api/document?path=${encodeURIComponent(filePath)}`)).json();
    return response.document.blocks.filter(block => block.block === 'figure').map(block => ({
      label: block.label, imageUrl: block.imageUrl, imageAlt: block.imageAlt, caption: block.caption.text,
    }));
  };
  const initial = await semantic();
  if (initial.length !== 1 || initial[0].label !== 'fig-control' || initial[0].imageUrl !== './diagram.svg') {
    throw new Error(`Scratch document is not a fresh technical-document.md copy: ${JSON.stringify(initial)}`);
  }

  const result = {};
  const figures = page.locator('[data-document-tab][data-active=true] [data-block="figure"]');
  const saveEnabled = page.locator('.top-bar [data-testid="save"]:not([aria-disabled="true"])');
  const saveDisabled = page.locator('.top-bar [data-testid="save"][aria-disabled="true"]');
  const imageLoaded = figure => figure.locator('[data-testid="figure-image"]').evaluate(async image => {
    if (!image.complete) await new Promise(resolve => { image.onload = image.onerror = resolve; });
    return image.naturalWidth > 0 && image.getAttribute('src');
  });
  const openScratch = async () => {
    await page.reload();
    await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
    await openDocument(page, filePath);
    await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
    if (!(await page.getByTestId('current-file').getAttribute('title')).includes('figure-authoring')) throw new Error('Scratch file was not opened');
  };
  const save = async () => {
    await saveEnabled.waitFor();
    await page.getByRole('button', {name:'Save', exact:true}).click();
    await page.getByText('Saved', {exact:true}).filter({visible:true}).waitFor();
  };
  // Where closing a form leaves keyboard focus: the editor and the top-level block of its selection.
  const editorFocus = () => page.evaluate(() => {
    const {editor} = document.querySelector('[data-document-tab][data-active=true] .document-editor');
    const {selection} = editor.state;
    const block = selection.node ?? selection.$from.node(1);
    return editor.view.hasFocus() && {block: block?.type.name, path: block?.attrs.sourcePath, from: selection.from, to: selection.to,
      empty: selection.empty, text: selection.$from.parent.textContent};
  });
  const insertAfterParagraph = async name => {
    const paragraph = page.getByText('The current reference is calculated from the active power command.', {exact:true}).filter({visible:true});
    await paragraph.hover();
    await page.getByRole('button', {name:'Insert block after paragraph block 9'}).click();
    await page.getByRole('menu', {name:'Insert block'}).getByRole('menuitem', {name, exact:true}).click();
  };
  const editor = page.getByTestId('figure-editor');
  const imageFocused = () => page.waitForFunction(() => document.activeElement?.getAttribute('data-testid') === 'figure-image-url', null, {timeout:2000})
    .then(() => true, () => false);

  try {
    await openScratch();
    const baselineParagraphs = await page.locator('[data-document-tab][data-active=true] [data-block="paragraph"]').count();

    // #427: real keyboard deletion/Undo must restore the entire engine document and Figure DOM.
    const snapshot = () => page.locator('[data-document-tab][data-active=true] .document-editor').evaluate(element => element.editor.getJSON());
    const beforeDelete = await snapshot();
    for (const key of ['Backspace', 'Delete']) {
      await page.getByText('The current reference is calculated from the active power command.', {exact:true}).filter({visible:true}).click();
      await page.keyboard.press('ControlOrMeta+a');
      await page.keyboard.press(key);
      expect(await figures.count(), 'Select all deletes the Figure').toBe(0);
      await page.keyboard.press('ControlOrMeta+z');
      expect(await snapshot(), 'One Undo restores the exact document').toEqual(beforeDelete);
      await page.keyboard.press('ControlOrMeta+Shift+z');
      expect(await figures.count(), 'Redo deletes the document again').toBe(0);
      await page.keyboard.press('ControlOrMeta+z');
      expect(await snapshot()).toEqual(beforeDelete);
    }
    expect(await figures.first().locator('img').getAttribute('alt')).toBe(initial[0].imageAlt);
    expect(await figures.first().locator('figcaption').innerText()).toBe(initial[0].caption);
    expect(Boolean(await imageLoaded(figures.first()))).toBe(true);

    // A. Existing Figure: selection opens no properties; explicit Edit, Apply, Save, Reload.
    await figures.first().locator('img').click();
    result.selectionOnly = await page.getByTestId('figure-properties').count() === 0 && await editor.count() === 0 &&
      await page.evaluate(() => document.activeElement?.closest('[data-document-tab][data-active=true] .document-editor') !== null);
    await figures.first().getByRole('button', {name:'Edit figure'}).locator('..').hover({position:{x:4,y:4}});
    await figures.first().getByRole('button', {name:'Edit figure'}).click();
    await editor.waitFor();
    result.editFocusesImage = await imageFocused();
    // #461: a clicked image is selected without hiding its siblings; editing resumes filtering.
    const picker = page.getByRole('dialog', {name:'Choose image'});
    const pathField = picker.getByRole('combobox', {name:'Image path'});
    const imageNames = ['diagram-v2.svg', 'diagram.svg'];
    const listedImages = async () => (await picker.getByRole('option').allTextContents()).filter(name => imageNames.includes(name)).sort();
    await page.getByRole('button', {name:'Choose…', exact:true}).click();
    await picker.getByRole('option', {name:'diagram-v2.svg', exact:true}).waitFor();
    expect(await listedImages()).toEqual(imageNames);
    await picker.getByRole('option', {name:'diagram.svg', exact:true}).click();
    expect(await listedImages(), 'Selecting an image keeps sibling images listed (#461)').toEqual(imageNames);
    expect(await picker.getByRole('option', {name:'diagram.svg', exact:true}).getAttribute('aria-selected')).toBe('true');
    expect(await pathField.inputValue()).toBe(filePath.replace('technical-document.md', 'diagram.svg'));
    await pathField.press('End');
    await pathField.press('Backspace');
    expect(await listedImages(), 'Editing the clicked path resumes filtering').toEqual(['diagram.svg']);
    expect(await picker.getByRole('option', {selected:true}).count()).toBe(0);
    await pathField.fill(filePath.replace('technical-document.md', 'diagram-v'));
    expect(await listedImages(), 'Typed path prefixes still filter').toEqual(['diagram-v2.svg']);
    await pathField.press('Tab');
    expect(await pathField.inputValue()).toBe(filePath.replace('technical-document.md', 'diagram-v2.svg'));
    expect(await listedImages(), 'Keyboard completion keeps path filtering').toEqual(['diagram-v2.svg']);
    await pathField.fill(filePath.slice(0, -'technical-document.md'.length));
    expect(await listedImages()).toEqual(imageNames);
    await picker.getByRole('option', {name:'diagram-v2.svg', exact:true}).click();
    expect(await listedImages()).toEqual(imageNames);
    expect(await picker.getByRole('option', {name:'diagram-v2.svg', exact:true}).getAttribute('aria-selected')).toBe('true');
    await picker.getByRole('button', {name:'Use “diagram-v2.svg”', exact:true}).click();
    await picker.waitFor({state:'hidden'});
    expect(await page.getByTestId('figure-image-url').inputValue()).toBe('./diagram-v2.svg');
    await page.getByRole('button', {name:'Choose…', exact:true}).click();
    await picker.getByRole('option', {name:'diagram-v2.svg', exact:true}).waitFor();
    expect(await listedImages()).toEqual(imageNames);
    expect(await picker.getByRole('option', {selected:true}).count()).toBe(0);
    await picker.getByRole('button', {name:'Cancel', exact:true}).click();
    await picker.waitFor({state:'hidden'});
    // A case-sensitive Host can list both names, even when this test runs on Windows.
    const caseSensitiveListing = async route => {
      const response = await route.fetch();
      const listing = await response.json();
      const original = listing.entries.find(entry => entry.name === 'diagram.svg');
      if (!original) return route.fulfill({response});
      const other = {...original, name:'Diagram.svg', path:original.path.replace(/diagram\.svg$/, 'Diagram.svg')};
      await route.fulfill({response, json:{...listing, entries:[other, ...listing.entries]}});
    };
    await page.route('**/api/folder-browse?*', caseSensitiveListing);
    try {
      await page.getByRole('button', {name:'Choose…', exact:true}).click();
      const upper = picker.getByRole('option', {name:'Diagram.svg', exact:true});
      const lower = picker.getByRole('option', {name:'diagram.svg', exact:true});
      await upper.waitFor();
      for (const key of ['Tab', 'ArrowRight']) {
        await pathField.fill(filePath.slice(0, -'technical-document.md'.length));
        await lower.click();
        expect(await lower.getAttribute('aria-selected'), 'Click selects the exact Host path, including case').toBe('true');
        expect(await upper.getAttribute('aria-selected')).toBe('false');
        expect(await pathField.getAttribute('aria-activedescendant')).toBe(await lower.getAttribute('id'));
        await pathField.press('End');
        await pathField.press(key);
        expect(await pathField.inputValue(), `${key} preserves the clicked file's exact path`).toBe(filePath.replace('technical-document.md', 'diagram.svg'));
      }
      await picker.getByRole('button', {name:'Cancel', exact:true}).click();
      await picker.waitFor({state:'hidden'});
    } finally {
      await page.unroute('**/api/folder-browse?*', caseSensitiveListing);
    }
    result.existingLabelInForm = await page.getByTestId('figure-label').inputValue() === 'fig-control' &&
      await editor.locator('input').count() === 4;
    await page.getByTestId('figure-image-url').fill('./diagram-v2.svg');
    await page.getByTestId('figure-alt').fill('Updated block diagram');
    await page.getByTestId('figure-caption').fill('Updated converter control diagram.');
    await page.locator('[data-document-tab][data-active=true]').getByTestId("figure-draft-status").waitFor();
    result.existingDraftMarkedUnsaved = await figures.first().getByTestId('figure-draft-status').isVisible();
    await page.getByTestId('figure-apply').click();
    await editor.waitFor({state:'detached'});
    const appliedBeforeDelete = await snapshot();
    await page.getByText('The current reference is calculated from the active power command.', {exact:true}).filter({visible:true}).click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Backspace');
    expect(await figures.count()).toBe(0);
    await page.keyboard.press('ControlOrMeta+z');
    expect(await snapshot(), 'Undo after Apply restores applied Figure properties').toEqual(appliedBeforeDelete);
    result.existingPreviewAfterApply = String(await imageLoaded(figures.first())).startsWith('/document/diagram-v2.svg?path=');
    await save();
    await openScratch();
    const reloadedExisting = (await semantic())[0];
    result.existingSavedAndReloaded = JSON.stringify(reloadedExisting) === JSON.stringify({
      label: 'fig-control', imageUrl: './diagram-v2.svg', imageAlt: 'Updated block diagram', caption: 'Updated converter control diagram.',
    });
    result.existingReloadedPreview = String(await imageLoaded(figures.first())).startsWith('/document/diagram-v2.svg?path=');
    result.existingReloadedCaption = await figures.first().locator('figcaption').innerText() === 'Updated converter control diagram.';

    // A2. Apply asks Core: a caption MyST would reinterpret keeps the form open and never becomes applied state.
    const appliedCaption = 'Updated converter control diagram.';
    await figures.first().getByRole('button', {name:'Edit figure'}).locator('..').hover({position:{x:4,y:4}});
    await figures.first().getByRole('button', {name:'Edit figure'}).click();
    await editor.waitFor();
    await page.getByTestId('figure-caption').fill('% comment');
    await page.getByTestId('figure-apply').click();
    const coreError = editor.getByText(/canonical round-trip|not canonical/);
    await coreError.waitFor();
    result.invalidApplyKeepsForm = await editor.isVisible() &&
      await page.getByTestId('figure-caption').inputValue() === '% comment';
    result.invalidApplyShowsCoreError = await coreError.isVisible();
    result.invalidApplyKeepsAppliedValue = await figures.first().locator('figcaption').innerText() === appliedCaption;
    result.invalidApplyAllowsAppliedSave = await saveEnabled.count() === 1;
    await page.getByTestId('figure-caption').fill('Cost is 5 units.');
    await page.getByTestId('figure-apply').click();
    await editor.waitFor({state:'detached'});
    result.validApplyAfterError = await figures.first().locator('figcaption').innerText() === 'Cost is 5 units.';
    await save();
    await openScratch();
    const revalidated = (await semantic())[0];
    result.validCaptionSavedAndReloaded = revalidated.caption === 'Cost is 5 units.' && revalidated.label === 'fig-control' &&
      await figures.first().locator('figcaption').innerText() === 'Cost is 5 units.';

    // C1. A new Figure is a document block at once: no form opens, the caret is in its caption,
    // and Undo removes it.
    await insertAfterParagraph('Figure');
    await figures.nth(1).waitFor();
    result.newFigureOpensNoForm = await editor.count() === 0;
    const inserted = await editorFocus();
    result.newFigureCaretInCaption = inserted !== false && inserted.block === 'figure' && inserted.empty && inserted.text === '';
    result.newFigureIsUnsaved = await saveEnabled.count() === 1;
    await page.keyboard.press('ControlOrMeta+z');
    result.newFigureUndoRemoves = await figures.count() === 1;

    // B. `/figure` from a transient paragraph, a caption typed at the caret, an image set by Edit, Save, Reload.
    await insertAfterParagraph('Paragraph');
    await page.keyboard.type('/figure');
    await page.getByRole('menu', {name:'Insert block'}).getByRole('menuitem', {name:'Figure', exact:true}).click();
    result.slashReplacesTransientParagraph = await page.locator('[data-document-tab][data-active=true] [data-block="paragraph"]').count() === baselineParagraphs &&
      await figures.count() === 2 && await editor.count() === 0;
    const created = figures.nth(1);
    await page.keyboard.type('New figure caption.');
    result.newCaptionTypedAtCaret = await created.locator('figcaption').innerText() === 'New figure caption.';
    await created.getByRole('button', {name:'Edit figure'}).locator('..').hover({position:{x:4,y:4}});
    await created.getByRole('button', {name:'Edit figure'}).click();
    await editor.waitFor();
    result.newLabelEmpty = await page.getByTestId('figure-label').inputValue() === '';
    await page.getByTestId('figure-image-url').fill('./diagram.svg');
    await page.getByTestId('figure-alt').fill('New figure alt');
    await page.getByTestId('figure-apply').click();
    await editor.waitFor({state:'detached'});
    const newBeforeDelete = await snapshot();
    await page.getByText('The current reference is calculated from the active power command.', {exact:true}).filter({visible:true}).click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Backspace');
    expect(await figures.count()).toBe(0);
    await page.keyboard.press('ControlOrMeta+z');
    expect(await snapshot(), 'Undo keeps the newly filled Figure image, alt text and caption').toEqual(newBeforeDelete);
    result.newPreviewAfterApply = String(await imageLoaded(created)).startsWith('/document/diagram.svg?path=');

    // C2. Apply, Edit, change, Cancel keeps the block and restores the applied value.
    await created.getByRole('button', {name:'Edit figure'}).locator('..').hover({position:{x:4,y:4}});
    await created.getByRole('button', {name:'Edit figure'}).click();
    await editor.waitFor();
    await page.getByTestId('figure-caption').fill('Discarded caption.');
    await page.getByTestId('figure-cancel').click();
    result.appliedCancelKeepsBlock = await figures.count() === 2;
    result.appliedCancelRestores = await created.locator('figcaption').innerText() === 'New figure caption.';
    await save();
    await openScratch();
    const reloaded = await semantic();
    result.newSavedAndReloaded = JSON.stringify(reloaded[1]) === JSON.stringify({
      label: '', imageUrl: './diagram.svg', imageAlt: 'New figure alt', caption: 'New figure caption.',
    });
    result.labelUnchanged = reloaded[0].label === 'fig-control';
    result.reloadedFigureCount = await figures.count() === 2;
    result.noEmptyParagraphSaved = await page.locator('[data-document-tab][data-active=true] [data-block="paragraph"]').count() === baselineParagraphs;
    result.newReloadedPreview = String(await imageLoaded(figures.nth(1))).startsWith('/document/diagram.svg?path=');

    // Escape cancels an existing Figure draft without removing it.
    await figures.first().getByRole('button', {name:'Edit figure'}).locator('..').hover({position:{x:4,y:4}});
    await figures.first().getByRole('button', {name:'Edit figure'}).click();
    await editor.waitFor();
    await page.getByTestId('figure-alt').fill('Escaped');
    await page.getByTestId('figure-alt').press('Escape');
    await editor.waitFor({state:'detached'});
    result.escapeCancels = await figures.count() === 2 && await saveDisabled.count() === 0 &&
      await figures.first().locator('img').getAttribute('alt') === 'Updated block diagram';
    const firstPath = await figures.first().getAttribute('data-source-path');
    const afterEscape = await editorFocus();
    result.escapeReturnsCaret = afterEscape.empty && await page.evaluate(path => {
      const {selection, doc} = document.querySelector('[data-document-tab][data-active=true] .document-editor').editor.state;
      let end;
      doc.forEach((node, pos) => { if (node.attrs.sourcePath === path) end = pos + node.nodeSize; });
      return selection.from === end || selection.from === end + 1;
    }, firstPath);

    // Validation that finishes after the user has moved on applies without taking focus back.
    let releaseValidation;
    const validationGate = new Promise(resolve => { releaseValidation = resolve; });
    await page.route('**/api/figure-validation', async route => { await validationGate; return route.continue(); });
    await figures.first().getByRole('button', {name:'Edit figure'}).locator('..').hover({position:{x:4,y:4}});
    await figures.first().getByRole('button', {name:'Edit figure'}).click();
    await editor.waitFor();
    await page.getByTestId('figure-alt').fill('Validated later');
    await page.getByTestId('figure-apply').click();
    await page.getByText('The current reference is calculated from the active power command.', {exact:true}).filter({visible:true}).click();
    await page.keyboard.press('End');
    await page.waitForFunction(() => {
      const {$from, empty} = document.querySelector('[data-document-tab][data-active=true] .document-editor').editor.state.selection;
      return empty && $from.parent.type.name === 'paragraph' && $from.parentOffset === $from.parent.content.size;
    });
    const movedOn = await editorFocus();
    releaseValidation();
    await editor.waitFor({state:'detached'});
    await page.unroute('**/api/figure-validation');
    result.lateValidationKeepsFocus = await figures.first().locator('img').getAttribute('alt') === 'Validated later' &&
      movedOn.block === 'paragraph' && JSON.stringify(await editorFocus()) === JSON.stringify(movedOn);
    await save();
    await openScratch();

    // A Figure draft typed while a Save is in flight survives the response and is not saved until applied.
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const posted = [];
    await page.route('**/api/document**', async route => {
      if (route.request().method() !== 'POST') return route.continue();
      posted.push(route.request().postDataJSON());
      if (posted.length === 1) await gate;
      return route.continue();
    });
    await page.getByRole('button', {name:'Save', exact:true}).click();
    await figures.first().getByRole('button', {name:'Edit figure'}).locator('..').hover({position:{x:4,y:4}});
    await figures.first().getByRole('button', {name:'Edit figure'}).click();
    await editor.waitFor();
    await page.waitForFunction(() => document.activeElement?.getAttribute('data-testid') === 'figure-image-url');
    await page.getByTestId('figure-caption').fill('Caption typed during save.');
    release();
    await page.getByText('Unsaved changes', {exact:true}).filter({visible:true}).waitFor();
    result.delayedSaveKeepsDraft = await page.getByTestId('figure-caption').inputValue() === 'Caption typed during save.' &&
      !posted[0].figures?.length;
    await page.getByTestId('figure-apply').click();
    await save();
    await page.unroute('**/api/document**');
    result.delayedDraftAppliedAndSaved = posted[1]?.figures?.[0]?.to?.caption === 'Caption typed during save.' &&
      (await semantic())[0].caption === 'Caption typed during save.' && (await semantic())[0].label === 'fig-control';

    // #58: captions live in the same editor state as prose. Native formatting,
    // rich clipboard input, edits to existing formatting, Undo/Redo and Reload keep it.
    const caption = figures.first().getByTestId('figure-caption-content');
    const selectCaption = async text => {
      await caption.click();
      await page.keyboard.press('End');
      await page.keyboard.press('Shift+Home');
      await page.waitForFunction(text => {
        const e = document.querySelector('[data-document-tab][data-active=true] .document-editor').editor;
        const s = e.state.selection;
        return s.$from.parent.type.name === 'figure' && e.state.doc.textBetween(s.from, s.to) === text;
      }, text);
    };
    await selectCaption('Caption typed during save.');
    await page.keyboard.type('Caption rich');
    await selectCaption('Caption rich');
    await page.keyboard.press('ControlOrMeta+b');
    result.captionBoldApplied = await caption.locator('strong').innerText() === 'Caption rich';
    await save();
    await openScratch();
    result.captionFormattingReloaded = await caption.locator('strong').innerText() === 'Caption rich';
    await caption.click();
    await page.keyboard.press('End');
    await page.keyboard.type(' revised');
    result.formattedCaptionTextEdited = await caption.locator('strong').innerText() === 'Caption rich revised';
    await save();
    await openScratch();
    result.captionTextAndFormattingReloaded = await caption.locator('strong').innerText() === 'Caption rich revised';
    await selectCaption('Caption rich revised');
    await page.keyboard.press('ControlOrMeta+b');
    result.captionBoldRemoved = await caption.locator('strong').count() === 0;
    await page.keyboard.press('ControlOrMeta+z');
    result.captionUndoKeepsFormatting = await caption.locator('strong').count() === 1;
    await page.keyboard.press('ControlOrMeta+Shift+z');
    result.captionRedoRemovesFormatting = await caption.locator('strong').count() === 0;
    await save();
    await openScratch();
    result.captionRemovalReloaded = await caption.locator('strong').count() === 0;
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.locator('[data-document-tab][data-active=true] .document-editor strong', {hasText:'DC-link voltage'}).evaluate(element => {
      const range = document.createRange(); range.selectNodeContents(element);
      getSelection().removeAllRanges(); getSelection().addRange(range);
    });
    await page.waitForFunction(() => {
      const e = document.querySelector('[data-document-tab][data-active=true] .document-editor').editor;
      return e.state.doc.textBetween(e.state.selection.from, e.state.selection.to) === 'DC-link voltage';
    });
    await page.keyboard.press('ControlOrMeta+c');
    await selectCaption('Caption rich revised');
    await page.keyboard.press('ControlOrMeta+v');
    result.captionRichPaste = await caption.locator('strong').innerText() === 'DC-link voltage';
    await save();
    await openScratch();
    result.captionRichPasteReloaded = await caption.locator('strong').innerText() === 'DC-link voltage';
    // Updating metadata never flattens a formatted caption or replaces its text caret (#275).
    await caption.click();
    await page.keyboard.press('End');
    await page.waitForFunction(() => {
      const {selection} = document.querySelector('[data-document-tab][data-active=true] .document-editor').editor.state;
      return selection.empty && selection.$from.parent.type.name === 'figure' &&
        selection.$from.parentOffset === selection.$from.parent.content.size;
    });
    const captionSelection = await page.evaluate(() => document.querySelector('[data-document-tab][data-active=true] .document-editor').editor.state.selection.toJSON());
    await figures.first().getByRole('button', {name:'Edit figure'}).locator('..').hover({position:{x:4,y:4}});
    await figures.first().getByRole('button', {name:'Edit figure'}).click();
    await editor.waitFor();
    await page.getByTestId('figure-alt').fill('Rich caption image');
    await page.getByTestId('figure-apply').click();
    await editor.waitFor({state:'detached'});
    const restoredCaption = await page.evaluate(() => {
      const {editor} = document.querySelector('[data-document-tab][data-active=true] .document-editor');
      return {selection:editor.state.selection.toJSON(), focus:editor.view.hasFocus()};
    });
    result.metadataKeepsCaptionCaret = restoredCaption.focus && JSON.stringify(restoredCaption.selection) === JSON.stringify(captionSelection);
    await page.keyboard.type(' CaptionCaret275');
    result.typingKeepsFigure = await caption.innerText() === 'DC-link voltage CaptionCaret275' && await figures.count() === 2;
    await save();
    await openScratch();
    result.metadataKeepsCaptionFormatting = (await caption.locator('strong').innerText()).startsWith('DC-link voltage') &&
      await caption.innerText() === 'DC-link voltage CaptionCaret275' &&
      (await semantic())[0].imageAlt === 'Rich caption image' && (await semantic())[0].label === 'fig-control';

    // In a new empty document, `/figure` makes the only block an empty Figure that saves.
    const emptyName = `empty-${Date.now()}.md`;
    const emptyPath = filePath.replace('technical-document.md', emptyName);
    await page.getByTestId('sidebar').getByRole('button', {name:'Open folder…', exact:true}).click();
    await page.getByTestId('folder-path').fill(filePath.slice(0, -'technical-document.md'.length));
    await page.getByTestId('folder-open').click();
    await page.getByRole('dialog').waitFor({state:'detached'});
    await page.getByRole('button', {name:'New file in folder', exact:true}).click();
    await page.getByTestId('new-file-name').fill(emptyName);
    await page.getByRole('dialog').getByRole('button', {name:'Create', exact:true}).click();
    await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
    await page.locator('[data-document-tab][data-active=true] [data-testid="document-editor"] [contenteditable="true"]').click();
    await page.keyboard.type('/figure');
    await page.getByRole('menu', {name:'Insert block'}).getByRole('menuitem', {name:'Figure', exact:true}).click();
    result.onlyBlockFigureOpensNoForm = await figures.count() === 1 && await editor.count() === 0;
    await save();
    const onlyBlocks = (await (await page.request.get(`${origin}/api/document?path=${encodeURIComponent(emptyPath)}`)).json()).document.blocks;
    result.onlyBlockFigureSaved = onlyBlocks.length === 1 && onlyBlocks[0].block === 'figure' && onlyBlocks[0].contentKind === 'none';

    result.consoleProblems = problems;
    const failed = Object.entries(result).filter(([key, value]) => key !== 'consoleProblems' && value !== true);
    if (failed.length || problems.length) throw new Error(`Figure authoring failed: ${JSON.stringify(result)}`);
    return result;
  } finally {
    await page.unrouteAll();
    page.off('console', onConsole);
    page.off('pageerror', onPageError);
  }
}
