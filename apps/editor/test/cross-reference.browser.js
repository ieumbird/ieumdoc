// Run with pnpm browser:test cross-reference.
// Inserts {eq}/{numref} references from a selection and from the slash menu, checks computed numbers
// and that clicking a reference goes to its target, retargets and removes
// references, edits text around them, and checks resolved/unresolved display, Source View and
// Save/Reload against a real file. The file is a scratch copy under the repository's ignored tmp/
// directory; prepare it first (see docs/test/TEST_GUIDE.md).
async (page, { openPath, screenshots, expect, recoveryRecords }) => {
  page.setDefaultTimeout(15000);
  const problems = [];
  page.on('console', message => { if (message.type() === 'error') problems.push(message.text()); });
  await page.unrouteAll();
  await page.reload();
  await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});

  const origin = page.url().split('/').slice(0, 3).join('/');
  const defaultPath = (await (await page.request.get(`${origin}/api/document`)).json()).path;
  const separator = defaultPath.includes('\\') ? '\\' : '/';
  const root = defaultPath.split(separator).slice(0, -4).join(separator);
  const filePath = [root, 'tmp', 'cross-reference', 'refs.md'].join(separator);
  const markdown = async () => {
    const response = await page.request.get(`${origin}/document/refs.md?path=${encodeURIComponent(filePath)}`);
    if (response.status() !== 200) throw new Error(`Prepare ${filePath} first`);
    return (await response.text()).replaceAll('\r\n', '\n');
  };
  const open = async () => {
    await page.reload();
    await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
    await openPath(page, filePath);
  };
  const sourceText = async () => {
    await page.getByTestId('view-source').click();
    await page.locator('[data-document-tab][data-active=true]').getByTestId('source-view').waitFor();
    const text = (await page.locator('[data-document-tab][data-active=true]').getByTestId('source-view').locator('pre').textContent()).replaceAll('\r\n', '\n');
    await page.getByTestId('view-visual').click();
    await page.locator('[data-document-tab][data-active=true]').getByTestId('document-editor').waitFor();
    return text;
  };
  const paragraph = index => page.locator('[data-document-tab][data-active=true] .document-editor > p').nth(index);
  // Chips show computed numbers; find one by the role and label it is written with ('Eq. eq-a').
  const chip = (scope, name) => {
    const [prefix, label] = name.split(' ');
    return scope.locator(`[data-testid="cross-reference"][data-role="${prefix === 'Eq.' ? 'eq' : 'numref'}"][data-label="${label}"]`);
  };
  const editReference = async reference => {
    await reference.hover();
    await reference.getByTestId('cross-reference-edit').click();
  };
  // Select through the editor's own TextSelection, then wait for the toolbar that selection shows.
  const selectText = async needle => {
    await page.evaluate(needle => {
      const instance = document.querySelector('[data-document-tab][data-active=true] .ProseMirror').editor;
      let range;
      instance.state.doc.descendants((node, position) => {
        if (range || !node.isText) return;
        const index = node.text.indexOf(needle);
        if (index >= 0) range = { from: position + index, to: position + index + needle.length };
      });
      if (!range) throw new Error(`text not found: ${needle}`);
      instance.commands.setTextSelection(range);
      instance.view.focus();
    }, needle);
    await page.getByTestId('selection-toolbar').waitFor();
  };

  const fresh = await markdown();
  if (!fresh.includes('{eq}`eq-a` and [details](#eq-a)') || fresh.includes('{eq}`eq-c`')) {
    throw new Error('Scratch document is not a fresh refs.md copy');
  }
  const result = {};
  await openPath(page, [root, 'tmp', 'cross-reference', 'no-targets.md'].join(separator));
  await selectText('Reference text');
  await page.getByTestId('selection-toolbar').getByRole('button', {name:'Cross-reference', exact:true}).click();
  await page.getByTestId('reference-form').waitFor();
  await page.keyboard.press('Escape');
  expect(await page.getByTestId('reference-form').count(), 'Escape dismisses a reference form with no targets').toBe(0);
  await selectText('Reference text');
  await page.getByTestId('selection-toolbar').getByRole('button', {name:'Cross-reference', exact:true}).click();
  await page.getByTestId('reference-form').waitFor();
  await page.locator('.app-header').click({position:{x:2,y:2}});
  expect(await page.getByTestId('reference-form').count(), 'Outside click dismisses a reference form with no targets').toBe(0);
  await paragraph(0).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' /');
  await page.getByRole('menu', {name:'Insert block', exact:true}).waitFor();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await open();

  await page.getByRole('button', {name:'Document settings', exact:true}).click();
  if (screenshots) {
    for (const width of [1280, 640]) {
      await page.setViewportSize({width, height:720});
      await page.screenshot({path:`tmp/reference-templates-${width}.png`});
    }
    await page.setViewportSize({width:1280, height:720});
  }
  expect(await page.getByRole('combobox', {name:'Reference style', exact:true}).count()).toBe(1);
  await page.keyboard.press('Escape');
  await page.getByRole('dialog', {name:'Document settings', exact:true}).waitFor({state:'detached'});

  // A. Reference paragraphs are editable; resolved and unresolved references look different.
  result.referenceParagraphsEditable = await page.locator('[data-readonly-paragraph]').count() === 0 &&
    await chip(paragraph(1), 'Eq. eq-a').count() === 1;
  result.resolvedShown = await chip(paragraph(1), 'Eq. eq-a').getAttribute('data-resolved') === 'true';
  const broken = chip(paragraph(2), 'Fig. missing-fig');
  result.unresolvedShown = await broken.getAttribute('data-resolved') === 'false' &&
    (await broken.locator('.cross-reference-chip').getAttribute('title')).startsWith('Unresolved');
  await broken.locator('.cross-reference-chip').click();
  await page.getByTestId('reference-form').waitFor();
  await page.keyboard.press('Escape');
  expect(await page.getByTestId('reference-form').count()).toBe(0);
  await broken.locator('.cross-reference-chip').click();
  await page.getByTestId('reference-form').waitFor();
  await page.locator('.app-header').click({position:{x:2,y:2}});
  expect(await page.getByTestId('reference-form').count()).toBe(0);
  result.fragmentLinkStaysLink = await paragraph(1).locator('a', {hasText: 'details'}).count() === 1;

  // A2. Chips and their targets show computed numbers; clicking a resolved chip goes to the target.
  result.numbersShown = await chip(paragraph(1), 'Eq. eq-a').locator('.cross-reference-chip').innerText() === '(1)' &&
    await page.locator('[data-document-tab][data-active=true]').getByTestId('equation-number').first().innerText() === '(1)' &&
    await page.locator('[data-document-tab][data-active=true] [data-block="figure"] figcaption').first().getAttribute('data-number') === 'Figure 1';
  await chip(paragraph(1), 'Eq. eq-a').locator('.cross-reference-chip').click();
  result.chipGoesToTarget = await page.evaluate(() => {
    const selection = document.querySelector('[data-document-tab][data-active=true] .document-editor').editor.state.selection;
    return selection.node?.type.name === 'equation' && selection.node.attrs.label === 'eq-a';
  }) && await page.locator('[data-document-tab][data-active=true] [data-block="equation"]').first().evaluate(element => {
    const box = element.getBoundingClientRect();
    return box.top >= 0 && box.bottom <= innerHeight;
  }) && await page.getByTestId('reference-form').count() === 0;

  // B. Selected text becomes an Equation reference through the selection toolbar.
  await selectText('control law');
  await page.getByTestId('selection-toolbar').getByRole('button', {name:'Cross-reference', exact:true}).click();
  await page.getByTestId('reference-target').selectOption('reference:eq:eq-b');
  await page.getByTestId('reference-apply').click();
  result.insertedFromSelection = await chip(paragraph(0), 'Eq. eq-b').count() === 1 &&
    !(await paragraph(0).innerText()).includes('control law');

  // C. A Figure reference at the caret from the slash menu.
  // End after a pointer click means the end of a *visual line*, which changes with
  // typography and viewport. Put the real editor caret at this paragraph's end.
  // Focus synchronously: Tiptap's focus command focuses on a later animation frame,
  // so typing right after it could reach the page body instead of the editor.
  await page.evaluate(() => {
    const editor = document.querySelector('[data-document-tab][data-active=true] .document-editor').editor;
    let end;
    editor.state.doc.forEach((node, position) => {
      if (end === undefined && node.type.name === 'paragraph') end = position + node.nodeSize - 1;
    });
    if (end === undefined) throw Error('Reference paragraph missing');
    editor.commands.setTextSelection(end);
    editor.view.focus();
    if (!editor.view.hasFocus()) throw Error('Editor did not take focus');
  });
  await page.keyboard.type(' /summary');
  const figureChoice = page.getByRole('menuitem', {name:'Figure\u00a01 · Converter control summary.', exact:true});
  await figureChoice.waitFor();
  result.captionSearchKeepsEditorFocus = await page.locator('[data-document-tab][data-active=true] .document-editor').evaluate(element => element.editor.view.hasFocus());
  // Exercise the multiword query through real typing, then insert by the shared keyboard path.
  for (let i = 0; i < 'summary'.length; i++) await page.keyboard.press('Backspace');
  await page.keyboard.type('Figure 1');
  await figureChoice.waitFor();
  await page.keyboard.press('Enter');
  result.insertedAtCaret = await chip(paragraph(0), 'Fig. fig-a').count() === 1 && !(await paragraph(0).innerText()).includes('/Figure 1');

  // D. Retarget an existing reference; E. remove one back to plain text.
  await editReference(chip(paragraph(1), 'Eq. eq-a'));
  await page.getByTestId('reference-target').selectOption('reference:eq:eq-b');
  await page.getByTestId('reference-apply').click();
  result.retargeted = await chip(paragraph(1), 'Eq. eq-b').count() === 1 && await chip(paragraph(1), 'Eq. eq-a').count() === 0;
  await editReference(chip(paragraph(2), 'Eq. eq-a'));
  await page.getByTestId('reference-remove').click();
  result.removedToText = await chip(paragraph(2), 'Eq. eq-a').count() === 0 && (await paragraph(2).innerText()).includes('later and eq-a.');

  // F. Text around references stays editable.
  // Click the start of the first line: the middle of a wrapped paragraph may be a reference chip.
  await paragraph(1).click({position:{x:1, y:4}});
  await page.keyboard.press('Home');
  await page.keyboard.type('Now ');

  // G. Renaming a label keeps the references resolved in the same transaction.
  const equationB = page.locator('[data-document-tab][data-active=true] [data-block="equation"]').nth(1);
  await equationB.getByRole('button', {name:'Edit', exact:true}).locator('..').hover({position:{x:4,y:4}});
  await equationB.getByRole('button', {name:'Edit', exact:true}).click();
  await page.getByTestId('equation-label').fill('eq-c');
  await page.getByTestId('equation-apply').click();
  await page.getByTestId('equation-editor').waitFor({state:'detached'});
  result.renamedTargetStaysResolved = await chip(paragraph(1), 'Eq. eq-c').getAttribute('data-resolved') === 'true';
  result.equationRenameDoesNotShowDeletionNotice = await page.getByTestId('notice').count() === 0;
  await page.keyboard.press('ControlOrMeta+z');
  await equationB.locator('.block-kind').filter({hasText:'eq-b'}).waitFor({state:'attached', timeout:5000});
  result.renameUndoTogether = await chip(paragraph(1), 'Eq. eq-b').getAttribute('data-resolved') === 'true' &&
    (await equationB.locator('.block-kind').textContent()).includes('eq-b');
  await page.keyboard.press('ControlOrMeta+Shift+z');
  result.renameRedoTogether = await chip(paragraph(1), 'Eq. eq-c').getAttribute('data-resolved') === 'true';
  result.renameRedoDoesNotShowDeletionNotice = await page.getByTestId('notice').count() === 0;
  // The atomic rename above is not deletion; deleting that renamed target still is.
  await chip(paragraph(1), 'Eq. eq-c').locator('.cross-reference-chip').click();
  await page.keyboard.press('Delete');
  result.renamedTargetDeletionWarns = (await page.getByTestId('notice').allTextContents()).some(text => text.includes('broke a reference')) &&
    await chip(paragraph(1), 'Eq. eq-c').locator('.cross-reference-chip').innerText() === 'Unresolved reference: eq-c';
  await page.keyboard.press('ControlOrMeta+z');
  result.renamedTargetDeletionUndo = await chip(paragraph(1), 'Eq. eq-c').getAttribute('data-resolved') === 'true' &&
    await page.getByTestId('notice').count() === 0;

  // H. Source shows the unsaved result; Save writes exactly that; Reload keeps kinds and targets.
  const preview = await sourceText();
  const expectedLines = [
    'The current is set by the {eq}`eq-c` and shown in the diagram. {numref}`fig-a`',
    'Now See {eq}`eq-c` and [details](#eq-a) with **bold** and $x$.',
    'See {numref}`missing-fig` for later and eq-a.',
    '```{math}\n:label: eq-a\n\na = b\n```',
    '```{math}\n:label: eq-c\n\nc = d\n```',
    ':::{figure} ./diagram.svg\n:name: fig-a\n\nConverter control summary.\n:::',
  ];
  result.sourceShowsUnsavedReferences = expectedLines.every(line => preview.includes(line));
  result.fileUntouchedBeforeSave = await markdown() === fresh;
  await page.getByRole('button', {name:'Save', exact:true}).click();
  await page.getByText('Saved', {exact:true}).filter({visible:true}).waitFor();
  result.saveMatchesSource = await markdown() === preview;
  await open();
  result.reloadedReferences = await chip(paragraph(0), 'Eq. eq-c').count() === 1 && await chip(paragraph(0), 'Fig. fig-a').count() === 1 &&
    await chip(paragraph(1), 'Eq. eq-c').getAttribute('data-resolved') === 'true' &&
    await chip(paragraph(2), 'Fig. missing-fig').getAttribute('data-resolved') === 'false' &&
    await chip(paragraph(0), 'Fig. fig-a').getAttribute('data-resolved') === 'true';
  result.reloadedSourceMatchesFile = await sourceText() === await markdown();

  // I. A table caption's inline math and references read as in the document and follow their
  // targets, while the caption itself stays exactly as written (#165).
  const captionPath = [root, 'tmp', 'cross-reference', 'caption.md'].join(separator);
  const captionFile = async () =>
    (await (await page.request.get(`${origin}/document/caption.md?path=${encodeURIComponent(captionPath)}`)).text()).replaceAll('\r\n', '\n');
  const captionFresh = await captionFile();
  const openCaption = async () => {
    await page.reload();
    await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
    await openPath(page, captionPath);
  };
  const caption = page.locator('[data-document-tab][data-active=true]').getByTestId('table-caption');
  // A missing chip fails at once instead of waiting for it.
  const captionChip = async text => {
    const chip = caption.locator('.cross-reference', {hasText: text});
    return await chip.count() === 1 ? chip.getAttribute('data-resolved') : 'missing';
  };
  const captionReads = async () => await caption.locator('.inline-math .katex').count() === 1 && !(await caption.innerText()).includes('$') &&
    await captionChip('Figure\u00a01') === 'true' && await captionChip('Unresolved reference: eq-gone') === 'false';
  await openCaption();
  result.captionShowsMathAndReferences = await captionReads();
  const captionFigure = page.locator('[data-document-tab][data-active=true] [data-block="figure"]');
  await captionFigure.getByRole('button', {name:'Edit figure'}).locator('..').hover({position:{x:4,y:4}});
  await captionFigure.getByRole('button', {name:'Edit figure'}).click();
  await page.getByTestId('figure-label').fill('fig-b');
  await page.getByTestId('figure-apply').click();
  await page.getByTestId('figure-editor').waitFor({state:'detached'});
  result.relabelDoesNotShowDeletionNotice = await page.getByTestId('notice').count() === 0;
  result.captionFollowsRelabeledTarget = await captionChip('Figure\u00a01') === 'true';
  await page.keyboard.press('ControlOrMeta+z');
  result.captionUndoResolvesAgain = await captionChip('Figure\u00a01') === 'true';
  result.captionSourceUnchanged = await sourceText() === captionFresh;
  await page.getByRole('button', {name:'Save', exact:true}).click();
  await page.getByText('Saved', {exact:true}).filter({visible:true}).waitFor();
  result.captionSaveKeepsMarkdown = await captionFile() === captionFresh;
  await openCaption();
  result.captionReloaded = await captionReads();
  await page.evaluate(() => {
    const editor = document.querySelector('[data-document-tab][data-active=true] .document-editor').editor;
    let pos;
    editor.state.doc.forEach((node, at) => { if (node.attrs.label === 'fig-a') pos = at; });
    editor.commands.setNodeSelection(pos);
    editor.view.focus();
  });
  await page.keyboard.press('Delete');
  result.captionOnlyReferenceDeletionNotice = (await page.getByTestId('notice').allTextContents()).some(text => text.includes('broke a reference'));
  await page.keyboard.press('ControlOrMeta+z');
  result.captionDeletionUndo = await captionChip('Figure\u00a01') === 'true' && await page.getByTestId('notice').count() === 0;

  // J. Deleting a referenced target warns at the time of deletion; Undo restores resolution.
  await page.reload();
  await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
  const deletionPath = [root, 'tmp', 'cross-reference', 'delete.md'].join(separator);
  await openPath(page, deletionPath);
  const active = page.locator('[data-document-tab][data-active=true]');
  const referenceText = label => active.locator(`[data-testid="cross-reference"][data-label="${label}"] .cross-reference-chip`);
  const readReferences = async () => Promise.all(['fig-a', 'tbl-a', 'eq-a'].map(label => referenceText(label).innerText()));
  const captions = active.locator('figcaption.caption, [data-testid="table-caption"]');
  const readCaptionLabels = () => captions.evaluateAll(elements => elements.map(element => {
    // The existing CSS owns the separator after Core's computed number text.
    const label = getComputedStyle(element, '::before').content;
    return label.slice(1, -1);
  }));
  const captionBody = source => source.replace(/^---\n[\s\S]*?\n---\n/, '');
  const originalCaptionBody = captionBody(await sourceText());
  expect(await readReferences()).toEqual(['Figure\u00a01', 'Table\u00a01', '(1)']);
  expect(await readCaptionLabels()).toEqual(['Figure 1. ', 'Table 1. ']);
  await page.getByRole('button', {name:'Document settings', exact:true}).click();
  if (screenshots) await page.screenshot({path:'tmp/reference-templates-display.png'});
  const templates = page.getByRole('combobox', {name:'Reference style', exact:true});
  await templates.selectOption('korean');
  await page.keyboard.press('Escape');
  await page.getByRole('dialog', {name:'Document settings', exact:true}).waitFor({state:'detached'});
  expect(await readReferences()).toEqual(['그림 1', '표 1', '식 (1)']);
  expect(await readCaptionLabels()).toEqual(['그림 1. ', '표 1. ']);
  if (screenshots) await page.screenshot({path:'tmp/caption-label-templates-462-after-1280.png', caret:'initial'});
  expect(await active.getByTestId('equation-number').first().innerText()).toBe('(1)');
  await page.evaluate(() => document.querySelector('[data-document-tab][data-active=true] .document-editor').editor.commands.undo());
  expect(await readReferences()).toEqual(['Figure\u00a01', 'Table\u00a01', '(1)']);
  expect(await readCaptionLabels()).toEqual(['Figure 1. ', 'Table 1. ']);
  await page.evaluate(() => document.querySelector('[data-document-tab][data-active=true] .document-editor').editor.commands.redo());
  expect(await readReferences()).toEqual(['그림 1', '표 1', '식 (1)']);
  expect(await readCaptionLabels()).toEqual(['그림 1. ', '표 1. ']);
  expect(captionBody(await sourceText())).toBe(originalCaptionBody);
  await page.getByRole('button', {name:'Save', exact:true}).click();
  await page.locator('[data-testid="status"][data-operation="saved"]').waitFor();
  const koreanDisk = await (await page.request.get(`${origin}/api/document?path=${encodeURIComponent(deletionPath)}`)).json();
  for (const value of ['그림 %s', '표 %s', '식 (%s)']) expect(koreanDisk.source).toContain(`template: ${value}`);
  expect(captionBody(koreanDisk.source)).toBe(originalCaptionBody);
  await page.reload();
  await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
  expect(await readReferences()).toEqual(['그림 1', '표 1', '식 (1)']);
  expect(await readCaptionLabels()).toEqual(['그림 1. ', '표 1. ']);
  const figureEdit = active.getByRole('button', {name:'Edit figure', exact:true});
  await figureEdit.locator('..').hover({position:{x:4,y:4}});
  await figureEdit.click();
  await expect(page.getByRole('dialog', {name:'그림 1 properties', exact:true})).toBeVisible();
  await page.getByTestId('figure-cancel').click();
  await active.locator('[data-block="table"]').hover();
  await active.getByRole('button', {name:'Edit table', exact:true}).click();
  await expect(page.getByRole('dialog', {name:'표 1 properties', exact:true})).toBeVisible();
  await page.getByTestId('table-cancel').click();
  await page.getByRole('button', {name:'Document settings', exact:true}).click();
  expect(await templates.inputValue()).toBe('korean');
  await templates.selectOption('default');
  await page.keyboard.press('Escape');
  await page.getByRole('dialog', {name:'Document settings', exact:true}).waitFor({state:'detached'});
  await page.getByRole('button', {name:'Save', exact:true}).click();
  await page.locator('[data-testid="status"][data-operation="saved"]').waitFor();
  for (const [kind, label, normal] of [['equation', 'eq-a', '(1)'], ['figure', 'fig-a', 'Figure\u00a01'], ['table', 'tbl-a', 'Table\u00a01']]) {
    const reference = active.locator(`[data-testid="cross-reference"][data-label="${label}"] .cross-reference-chip`);
    if (await reference.innerText() !== normal) throw new Error(`Normal ${kind} reference changed`);
    await page.evaluate(label => {
      const editor = document.querySelector('[data-document-tab][data-active=true] .document-editor').editor;
      let pos;
      editor.state.doc.forEach((node, at) => { if (node.attrs.label === label) pos = at; });
      editor.commands.setNodeSelection(pos);
      editor.view.focus();
    }, label);
    if (kind === 'table') await active.getByRole('button', {name:'Delete table', exact:true}).click();
    else await page.keyboard.press('Delete');
    result[`${kind}DeletionNotice`] = (await page.getByTestId('notice').allTextContents()).some(text => kind === 'table'
      ? text.includes('Table deleted') && text.includes('Undo') : text.includes('broke a reference') && text.includes('Ctrl+Z'));
    result[`${kind}BrokenText`] = await reference.innerText() === `Unresolved reference: ${label}`;
    if (screenshots && kind === 'table') {
      await page.mouse.move(0, 0);
      await page.evaluate(() => {
        for (const element of document.querySelectorAll('*')) {
          if (element.scrollTop) element.scrollTop = 0;
        }
      });
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({path:'tmp/375/deleted-table-1280.png'});
      await page.setViewportSize({width:640, height:900});
      await page.screenshot({path:'tmp/375/deleted-table-640.png'});
      await page.setViewportSize({width:1280, height:720});
    }
    await page.keyboard.press('ControlOrMeta+z');
    result[`${kind}UndoResolves`] = await reference.innerText() === normal && await reference.locator('..').getAttribute('data-resolved') === 'true';
    result[`${kind}UndoClearsNotice`] = await page.getByTestId('notice').count() === 0;
  }
  // Separate Undo groups: restoring only the last target must not hide earlier breakage.
  for (const label of ['eq-a', 'fig-a']) {
    await page.evaluate(label => {
      const editor = document.querySelector('[data-document-tab][data-active=true] .document-editor').editor;
      let pos;
      editor.state.doc.forEach((node, at) => { if (node.attrs.label === label) pos = at; });
      editor.commands.setNodeSelection(pos);
      editor.view.focus();
    }, label);
    await page.keyboard.press('Delete');
    if (label === 'eq-a') await page.waitForTimeout(650); // engine history's 500ms grouping delay
  }
  await page.keyboard.press('ControlOrMeta+z');
  result.partialUndoRestoresOnlyLastTarget = await active.locator('[data-label="fig-a"] .cross-reference-chip').innerText() === 'Figure\u00a01' &&
    await active.locator('[data-label="eq-a"] .cross-reference-chip').innerText() === 'Unresolved reference: eq-a';
  result.partialUndoKeepsEarlierDeletionNotice = (await page.getByTestId('notice').allTextContents()).some(text => text.includes('broke a reference'));
  await page.keyboard.press('ControlOrMeta+z');
  result.completeUndoClearsDeletionNotice = await active.locator('[data-label="eq-a"] .cross-reference-chip').innerText() === '(1)' &&
    await page.getByTestId('notice').count() === 0;

  // A target with no reference keeps its existing deletion flow and shows no new notice.
  await page.evaluate(() => {
    const editor = document.querySelector('[data-document-tab][data-active=true] .document-editor').editor;
    let pos;
    editor.state.doc.forEach((node, at) => { if (node.type.name === 'equation' && !node.attrs.label) pos = at; });
    editor.commands.setNodeSelection(pos);
    editor.view.focus();
  });
  await page.keyboard.press('Backspace');
  result.unreferencedDeletionHasNoNotice = await active.locator('[data-block="equation"]').count() === 1 && await page.getByTestId('notice').count() === 0;
  await page.keyboard.press('ControlOrMeta+z');
  // The same applied deletion notice and broken chip are translated in the existing UI.
  await page.getByRole('button', {name:'Settings', exact:true}).click();
  await page.getByTestId('ui-language').selectOption('ko');
  await page.keyboard.press('Escape');
  await page.getByTestId('settings-dialog').waitFor({state:'detached'});
  await page.evaluate(() => {
    const editor = document.querySelector('[data-document-tab][data-active=true] .document-editor').editor;
    let pos;
    editor.state.doc.forEach((node, at) => { if (node.attrs.label === 'eq-a') pos = at; });
    editor.commands.setNodeSelection(pos);
    editor.view.focus();
  });
  await page.keyboard.press('Delete');
  result.koreanDeletionNotice = (await page.getByTestId('notice').allTextContents()).some(text => text.includes('참조가 깨졌습니다. Ctrl+Z'));
  result.koreanBrokenChip = await active.locator('[data-label="eq-a"] .cross-reference-chip').innerText() === '깨진 참조: eq-a';
  // Exercise a committed deletion record, so the following Undo must also clear recovery.
  await expect.poll(async () => (await recoveryRecords(page)).some(record => record.path === deletionPath)).toBe(true);
  await page.keyboard.press('ControlOrMeta+z');
  await active.locator('[data-label="tbl-a"] .cross-reference-chip').click();
  await page.keyboard.press('Delete');
  result.koreanTableDeletionNotice = (await page.getByTestId('notice').innerText()).includes('표를 삭제했습니다') &&
    await page.getByTestId('notice').getByRole('button', {name:'되돌리기', exact:true}).count() === 1;
  if (screenshots) {
    await page.screenshot({path:'tmp/375/deleted-table-ko-1280.png'});
    await page.setViewportSize({width:640, height:900});
    await page.screenshot({path:'tmp/375/deleted-table-ko-640.png'});
    await page.setViewportSize({width:1280, height:720});
  }
  await page.getByTestId('notice').getByRole('button', {name:'되돌리기', exact:true}).click();
  result.koreanTableUndoResolves = await active.locator('[data-label="tbl-a"][data-resolved="true"]').count() > 0;
  await page.getByRole('button', {name:'설정', exact:true}).click();
  await page.getByTestId('ui-language').selectOption('en');
  await page.keyboard.press('Escape');
  await page.getByTestId('settings-dialog').waitFor({state:'detached'});

  // Undo updates the editor immediately; its recovery cleanup is asynchronous. Reloading first
  // can legitimately offer the older recorded deletion and make the sidebar modal-inaccessible.
  await expect.poll(async () => (await recoveryRecords(page)).some(record => record.path === deletionPath)).toBe(false);
  // Keep the explicit disk checkpoint for the platform-label reload, after proving Undo cleanup.
  await page.getByTestId('save').click();
  await page.locator('[data-testid="status"][data-operation="saved"]').waitFor({state:'attached'});

  // Emulate Apple's platform branch before module initialization, using this same profile.
  // This checks displayed shortcuts, not a native macOS keyboard run.
  await page.addInitScript(() => Object.defineProperty(navigator, 'platform', {configurable:true, get:() => 'MacIntel'}));
  await page.reload();
  await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
  try { await openPath(page, deletionPath); }
  catch (cause) {
    const state = await page.evaluate(() => ({
      language:document.documentElement.lang, viewport:[innerWidth,innerHeight],
      dialogs:[...document.querySelectorAll('[role="dialog"]')].map(n => n.textContent),
      sidebar:document.querySelector('[data-testid="sidebar"]')?.outerHTML.slice(0,3000),
      memory:localStorage.getItem('ieumdoc.openTabs'),
    }));
    throw new Error(`Apple reload navigation failed: ${JSON.stringify(state)}`, {cause});
  }
  await active.locator('[data-testid="cross-reference"][data-label="eq-a"][data-resolved="true"]').waitFor();
  await page.evaluate(() => {
    const editor = document.querySelector('[data-document-tab][data-active=true] .document-editor').editor;
    let pos;
    editor.state.doc.forEach((node, at) => { if (node.attrs.label === 'eq-a') pos = at; });
    editor.commands.setNodeSelection(pos);
    editor.view.focus();
  });
  await page.keyboard.press('Delete');
  result.appleShortcutEnglish = (await page.getByTestId('notice').allTextContents()).some(text => text.includes('Press ⌘Z to undo.'));
  await page.getByRole('button', {name:'Settings', exact:true}).click();
  await page.getByTestId('ui-language').selectOption('ko');
  await page.keyboard.press('Escape');
  await page.getByTestId('settings-dialog').waitFor({state:'detached'});
  result.appleShortcutKorean = (await page.getByTestId('notice').allTextContents()).some(text => text.includes('⌘Z로 되돌릴 수 있습니다.'));
  await page.evaluate(() => document.querySelector('[data-document-tab][data-active=true] .document-editor').editor.commands.undo());
  await page.getByRole('button', {name:'설정', exact:true}).click();
  await page.getByTestId('ui-language').selectOption('en');
  await page.keyboard.press('Escape');
  await page.getByTestId('settings-dialog').waitFor({state:'detached'});

  const failed = Object.entries(result).filter(([, value]) => value !== true);
  if (failed.length > 0 || problems.length > 0) {
    throw new Error(`Cross-reference authoring failed: ${JSON.stringify({result, consoleErrors: problems})}`);
  }
  return {...result, consoleErrors: problems};
}
