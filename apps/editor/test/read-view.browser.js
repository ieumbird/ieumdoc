// Read uses the mounted editor: block navigation remains available, writing does not.
async (page, { openPath, expect, screenshots, recoveryRecords }) => {
  const origin = page.url().split('/').slice(0, 3).join('/');
  const initial = await (await page.request.get(`${origin}/api/document`)).json();
  const sep = initial.path.includes('\\') ? '\\' : '/';
  const root = initial.path.split(sep).slice(0, -4).join(sep);
  const file = name => [root, 'tmp', 'read-view', name].join(sep);
  const configure = async (language, theme) => {
    await page.getByRole('button', {name:/^(Settings|설정)$/}).click();
    await page.getByTestId('ui-language').selectOption(language);
    await page.getByTestId('theme').selectOption(theme);
    await page.getByTestId('settings-back').click();
    await expect(page.getByTestId('settings-dialog')).toHaveCount(0);
    await page.evaluate(() => document.fonts.ready);
  };
  await configure('en', 'light');
  await page.setViewportSize({width: 1440, height: 900});
  await openPath(page, file('reading.md'));
  const panel = page.locator('[data-document-tab][data-active=true]');
  const editor = panel.locator('.document-editor');
  const read = page.getByTestId('view-read');
  const edit = page.getByTestId('view-visual');
  const json = () => editor.evaluate(el => JSON.stringify(el.editor.getJSON()));
  const command = async name => {
    await page.keyboard.press('Control+Slash');
    const center = page.getByRole('dialog', {name: 'Command center', exact: true});
    await center.getByRole('combobox').fill(`> ${name}`);
    await center.getByRole('option', {name, exact: true}).click();
    await expect(center).toHaveCount(0);
  };
  const disk = async () => (await page.request.get(`${origin}/api/document?path=${encodeURIComponent(file('reading.md'))}`)).json();
  const opening = await disk();
  await expect(edit).toHaveText('Edit');
  await expect(edit).toHaveAttribute('aria-pressed', 'true');
  await editor.evaluate(el => { window.readViewEditor = el.editor; window.readViewTextSelection = el.editor.state.selection.constructor; });

  // An actual applied edit supplies both undo history and a recovery record.
  await editor.locator('p').filter({hasText: 'Read this'}).first().click({position:{x:4,y:12}});
  await page.keyboard.press('Home');
  await page.keyboard.type('Applied marker. ');
  await expect.poll(async () => (await recoveryRecords(page)).length).toBe(1);
  const records = await recoveryRecords(page);
  const applied = await json();
  const selection = () => editor.evaluate(el => ({type: el.editor.state.selection.constructor.name, from:el.editor.state.selection.from, to:el.editor.state.selection.to}));
  await panel.getByTestId('figure-image').click();
  await page.keyboard.press('ArrowLeft');
  const editArrow = await selection();
  const placeCaret = () => editor.evaluate(el => {
    const {state, view} = el.editor;
    let pos;
    state.doc.forEach((node, offset) => { if (node.type.name === 'paragraph' && node.textContent.startsWith('Applied marker.')) pos = offset; });
    view.dispatch(state.tr.setSelection(window.readViewTextSelection.create(state.doc, pos + 4)));
    view.dom.focus(); view.focus();
  });
  await placeCaret();
  const initialCaret = await selection();
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await selection()).from).toBe(initialCaret.from + 1);
  const editTextArrow = await selection();
  const equation = panel.locator('[data-block=equation]');
  await equation.getByTestId('equation-preview').dblclick();
  await page.getByTestId('equation-latex').fill('z=UNAPPLIED');
  const status = await page.getByTestId('status').getAttribute('data-operation');
  await read.click();
  await expect(read).toHaveAttribute('aria-pressed', 'true');
  await expect(editor).toHaveAttribute('contenteditable', 'false');
  await expect(equation.getByTestId('equation-preview')).toBeVisible();
  await expect(page.getByTestId('equation-latex')).toHaveCount(0);
  await expect(page.getByTestId('draft-indicator')).toBeVisible();
  await expect(page.getByTestId('status')).toHaveAttribute('data-operation', status);
  expect(await json()).toBe(applied);
  expect(await recoveryRecords(page)).toEqual(records);
  expect(await editor.evaluate(el => el.editor === window.readViewEditor)).toBe(true);

  // Browser Find/Print/zoom remain available when the reading surface has focus.
  expect(await editor.evaluate(el => ['f','p','+','-'].map(key => {
    const event = new KeyboardEvent('keydown', {key,ctrlKey:true,bubbles:true,cancelable:true});
    el.dispatchEvent(event); return event.defaultPrevented;
  }))).toEqual([false,false,false,false]);

  // Native input, explicit commands/keymaps/history, clipboard and file drop must
  // neither change the document nor reach a Host write (including image assets).
  const writes = [];
  const writing = request => {
    if (request.method() !== 'GET' && /\/api\/(document$|image|file$)/.test(request.url())) writes.push(request.url());
  };
  page.on('request', writing);
  await editor.locator('p').filter({hasText: 'Applied marker.'}).first().click();
  for (const key of ['a', 'Enter', 'Backspace', 'Delete', 'Control+b', 'Control+i', 'Control+z', 'Control+Shift+z', 'Control+y', 'Control+x', 'Control+v', 'Control+s']) {
    await page.keyboard.press(key);
  }
  await editor.evaluate(el => {
    const transfer = new DataTransfer();
    transfer.setData('text/plain', 'Forbidden paste/drop');
    transfer.setData('text/html', '<p>Forbidden HTML</p>');
    transfer.items.add(new File(['image'], 'forbidden.png', {type: 'image/png'}));
    el.dispatchEvent(new ClipboardEvent('paste', {bubbles: true, cancelable: true, clipboardData: transfer}));
    el.dispatchEvent(new DragEvent('drop', {bubbles: true, cancelable: true, dataTransfer: transfer}));
    el.editor.commands.insertContent('Forbidden command');
    el.editor.commands.undo();
    el.editor.commands.redo();
    el.editor.view.dispatch(el.editor.state.tr.setDocAttribute('title', 'Forbidden title'));
  });
  await expect(page.getByTestId('save')).toBeDisabled();
  await expect(panel.locator('[data-document-title]')).toHaveAttribute('readonly', '');
  expect(await panel.locator('[data-document-title]').getAttribute('placeholder')).toBe(null);
  await expect(panel.locator('.block-insert, .block-handle, .endnote-actions')).toHaveCount(0);
  await expect(panel.getByRole('button', {name: 'Document settings', exact: true})).toHaveCount(0);
  await expect(page.getByTestId('selection-toolbar')).toHaveCount(0);
  await expect(panel.getByTestId('code-language')).toBeDisabled();
  await expect(panel.getByTestId('cross-reference-edit')).toHaveCount(0);
  await expect(panel.getByRole('button',{name:'Edit citation',exact:true})).toHaveCount(0);
  await expect(panel.getByRole('button',{name:'Connect bibliography…',exact:true})).toHaveCount(0);
  await equation.getByTestId('equation-preview').dblclick();
  await expect(page.getByTestId('equation-latex')).toHaveCount(0);
  expect(await json()).toBe(applied);

  // Selection, arrow navigation, real copy and reading aids remain available.
  await editor.locator('p').filter({hasText: 'Applied marker.'}).first().click({position:{x:5,y:10}});
  await expect.poll(() => editor.evaluate(el => el.editor.state.selection.$from.parent.textContent.startsWith('Applied marker.'))).toBe(true);
  await panel.getByTestId('figure-image').click();
  expect(await editor.evaluate(el => el.editor.state.selection.constructor.name)).toBe('NodeSelection');
  await page.keyboard.press('ArrowLeft');
  expect(await selection()).toEqual(editArrow);
  await placeCaret();
  await page.keyboard.press('ArrowRight');
  await expect.poll(selection).toEqual(editTextArrow);
  await page.keyboard.press('Control+Home');
  expect((await selection()).from).toBe(1);
  await page.keyboard.press('Control+End');
  expect(await editor.evaluate(el => el.editor.state.selection.to === el.editor.state.doc.content.size)).toBe(true);
  expect(await json()).toBe(applied);
  await placeCaret();
  const extensionStart = (await selection()).from;
  await page.keyboard.press('Shift+ArrowRight');
  expect((await selection()).to).toBe(extensionStart + 1);
  await editor.locator('h2').hover();
  await expect(panel.getByTestId('block-hover-outline')).toBeVisible();
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  const paragraph = editor.locator('p').filter({hasText:'Applied marker.'}).first();
  await paragraph.scrollIntoViewIfNeeded();
  const textBounds = await paragraph.evaluate(el => {
    const range = document.createRange();
    range.setStart(el.firstChild, 0); range.setEnd(el.firstChild, 15);
    const r = range.getBoundingClientRect(); return {left:r.left, right:r.right, y:(r.top+r.bottom)/2};
  });
  await page.mouse.move(textBounds.left + 0.5, textBounds.y);
  await page.mouse.down();
  await page.mouse.move(textBounds.right + 0.5, textBounds.y, {steps:10});
  await page.mouse.up();
  await page.keyboard.press('Control+c');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('Applied marker.');
  await panel.locator('.footnote-reference').hover();
  await expect(panel.getByTestId('reference-preview')).toContainText('Reading preview content.');
  const outlineToggle = page.getByRole('button', {name: 'Outline', exact: true});
  if (await outlineToggle.getAttribute('aria-pressed') !== 'true') await outlineToggle.click();
  await page.getByTestId('outline').getByRole('button', {name: 'Section one', exact: true}).click();
  await expect(read).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', {name: 'Outline', exact: true}).click();
  await page.keyboard.press('Control+Slash');
  const center = page.getByRole('dialog', {name: 'Command center', exact: true});
  for (const name of ['Undo', 'Redo', 'Save', 'Insert cross-reference…', 'Document settings…']) {
    await center.getByRole('combobox').fill(`> ${name}`);
    await expect(center.getByRole('option', {name, exact: true})).toHaveAttribute('aria-disabled', 'true');
  }
  await page.keyboard.press('Escape');
  expect(writes).toEqual([]);
  expect(await disk()).toEqual(opening);
  expect(await recoveryRecords(page)).toEqual(records);
  page.off('request', writing);

  // Source and commands preserve the retained form too.
  await command('View: Source');
  await expect(panel.getByTestId('source-view')).toContainText('Applied marker.');
  await expect(panel.getByTestId('source-view')).not.toContainText('UNAPPLIED');
  await command('View: Read');
  await command('View: Edit');
  await expect(page.getByTestId('equation-latex')).toHaveValue('z=UNAPPLIED');
  await page.getByTestId('equation-cancel').click();
  await editor.locator('p').filter({hasText: 'Applied marker.'}).first().click();
  await page.keyboard.press('Control+z');
  await expect(editor).not.toContainText('Applied marker.');
  await page.keyboard.press('Control+Shift+z');
  await expect(editor).toContainText('Applied marker.');

  await placeCaret();
  await editor.evaluate(el => { const from = el.editor.state.selection.from; el.editor.commands.setTextSelection({from, to:from+4}); });
  await page.keyboard.press('Control+Quote');
  await page.getByTestId('link-url').fill('https://example.com/UNAPPLIED');
  await read.click();
  await expect(page.getByTestId('link-url')).toHaveCount(0);
  await edit.click();
  await expect(page.getByTestId('link-url')).toHaveValue('https://example.com/UNAPPLIED');
  await page.getByTestId('link-url').press('Escape');

  // Metadata outside-click completion must never apply when entering Read.
  await editor.locator('h2').hover();
  await panel.getByTestId('label-target-edit').click();
  await page.getByTestId('label-target-input').fill('UNAPPLIED-section');
  const beforeMetadata = await json();
  await read.click();
  expect(await json()).toBe(beforeMetadata);
  await expect(page.getByTestId('label-target-input')).toHaveCount(0);
  await edit.click();
  await expect(page.getByTestId('label-target-input')).toHaveValue('UNAPPLIED-section');
  await page.getByTestId('label-target-input').press('Escape');

  for (const item of [
    {kind:'image', field:'figure-label', value:'UNAPPLIED-image'},
    {kind:'table', field:'table-label', value:'UNAPPLIED-table'},
    {kind:'inline', field:'inline-math-source', value:'q+UNAPPLIED'},
  ]) {
    if (item.kind === 'image') await panel.getByTestId('figure-image').dblclick();
    if (item.kind === 'table') {
      const table = panel.locator('[data-block=table]');
      await table.hover({position:{x:4,y:4}});
      await table.getByRole('button',{name:'Edit table',exact:true}).click();
    }
    if (item.kind === 'inline') await panel.locator('.inline-math-rendered .katex-html').dblclick();
    await page.getByTestId(item.field).fill(item.value);
    const content = await json();
    let release, response;
    if (item.kind === 'image') {
      let requested;
      const gate = new Promise(resolve => { release = resolve; });
      const started = new Promise(resolve => { requested = resolve; });
      await page.route('**/api/figure-validation', async route => { requested(); await gate; await route.continue(); });
      response = page.waitForResponse(r => r.url().endsWith('/api/figure-validation'));
      await page.getByTestId(item.field).press('Control+Enter');
      await started;
    }
    await read.click();
    if (release) { release(); await response; await page.unroute('**/api/figure-validation'); }
    expect(await json()).toBe(content);
    await expect(page.getByTestId(item.field)).toHaveCount(0);
    await edit.click();
    await expect(page.getByTestId(item.field)).toHaveValue(item.value);
    await page.getByTestId(item.field).press('Escape');
  }

  // Source drafts of both Equation and Mermaid render only applied content in Read.
  await panel.locator('[data-content-kind=mermaid]').getByTestId('mermaid-preview').dblclick();
  await page.getByTestId('mermaid-edit-source').click();
  await page.getByTestId('mermaid-source').fill('graph LR\n  UNAPPLIED --> Draft');
  await read.click();
  await expect(panel.locator('[data-content-kind=mermaid]').getByTestId('mermaid-preview')).toBeVisible();
  await expect(page.getByTestId('mermaid-source')).toHaveCount(0);
  await edit.click();
  await expect(page.getByTestId('mermaid-source')).toHaveValue('graph LR\n  UNAPPLIED --> Draft');
  await read.click();

  const notifications = page.getByRole('button', {name:/^Notifications:/});
  if (await notifications.getAttribute('aria-expanded') === 'true') await notifications.click();
  // Compact draft status, all three segments and Save fit the supported tab row.
  if (screenshots) for (const [width, language, theme] of [[1440, 'en', 'light'], [640, 'ko', 'dark']]) {
    await page.setViewportSize({width, height: 900});
    await configure(language, theme);
    await panel.evaluate(el => { el.scrollTop = 0; });
    await expect(read).toHaveText(language === 'ko' ? '읽기' : 'Read');
    await page.mouse.move(0, 0);
    await page.screenshot({path: `tmp/read-view-849/after-${width}-${theme}-${language}.png`});
    const controls = await page.locator('[data-testid=view-read], [data-testid=view-visual], [data-testid=view-source], [data-testid=draft-indicator], [data-testid=save]').evaluateAll(nodes => nodes.map(node => {
      const r = node.getBoundingClientRect(); return {left:r.left, right:r.right, top:r.top, bottom:r.bottom};
    }));
    expect(controls.every(r => r.left >= 0 && r.right <= width && r.bottom > r.top)).toBe(true);
    expect(controls.every(r => Math.abs((r.top + r.bottom) / 2 - (controls[0].top + controls[0].bottom) / 2) <= 1)).toBe(true);
  }
  await configure('en', 'light');
  await page.setViewportSize({width:1440, height:900});

  await expect(read).toHaveText('Read');
  // Tabs and groups own their own switch. Moving a tab never replaces its editor.
  await openPath(page, file('other.md'));
  await expect(edit).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('tab', {name:/^reading\.md(?:,|$)/}).click();
  await expect(read).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('tab', {name:/^reading\.md(?:,|$)/}).click({button:'right'});
  await page.getByRole('menuitem', {name:'Open to the right', exact:true}).click();
  const left = page.locator('[data-editor-group="0"]');
  const right = page.locator('[data-editor-group="1"]');
  await expect(left.getByTestId('view-visual')).toHaveAttribute('aria-pressed','true');
  await expect(right.getByTestId('view-read')).toHaveAttribute('aria-pressed','true');
  await left.getByTestId('view-source').click();
  await expect(page.locator('[data-document-tab][data-group-index="0"][data-visible="true"]').getByTestId('source-view')).toBeVisible();
  await expect(right.getByTestId('view-read')).toHaveAttribute('aria-pressed','true');
  if (screenshots) await page.screenshot({path:'tmp/read-view-849/split-1440.png'});
  await right.getByTestId('view-visual').click();
  await expect(page.getByTestId('mermaid-source')).toHaveValue('graph LR\n  UNAPPLIED --> Draft');
  await right.getByTestId('view-read').click();
  await right.getByRole('button', {name:'Close reading.md',exact:true}).click();
  const guard = page.getByRole('dialog', {name:'Save changes?',exact:true});
  await expect(guard).toBeVisible();
  await expect(guard.getByRole('button',{name:'Save',exact:true})).toBeDisabled();
  await guard.getByRole('button',{name:'Cancel',exact:true}).click();
  await expect(right.getByTestId('view-read')).toHaveAttribute('aria-pressed','true');
  await right.getByRole('button', {name:'Close reading.md',exact:true}).click();
  await guard.getByRole('button',{name:"Don't save",exact:true}).click();
  await openPath(page, file('reading.md'));
  await expect(page.getByTestId('view-visual').filter({visible:true}).last()).toHaveAttribute('aria-pressed','true');
  expect(await disk()).toEqual(opening);
  if (screenshots) {
    await page.getByRole('button',{name:'Close reading.md',exact:true}).click();
    await page.getByRole('button',{name:'Close other.md',exact:true}).click();
    await page.getByTestId('folder').getByRole('button',{name:'More actions',exact:true}).click();
    await page.getByRole('menuitem',{name:'Close folder',exact:true}).click();
    await openPath(page, [root, 'tmp', 'short-fields', 'fields.md'].join(sep));
    for (const width of [1440,640]) {
      await page.setViewportSize({width,height:900});
      await configure('en','light');
      await page.locator('[data-document-tab][data-active=true]').evaluate(el => { el.scrollTop = 0; });
      await page.mouse.move(0,0);
      await page.screenshot({path:`tmp/read-view-849/after-controls-${width}.png`});
    }
  }
  return {mutationRoutesBlocked:true, draftsAndRecoveryPreserved:true, navigationAndCopy:true, independentTabsAndGroups:true};
}
