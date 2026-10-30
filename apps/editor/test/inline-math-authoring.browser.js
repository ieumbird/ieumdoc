// Run with pnpm browser:test inline-math-authoring.
// Changes, removes and creates inline math in paragraphs of a scratch file, saves and reloads it,
// and checks that display equations and cross-references are unchanged and that an unpreservable
// source fails closed. The file is a scratch copy under the repository's ignored tmp/ directory;
// prepare it first (see docs/test/TEST_GUIDE.md). The scenario writes that copy only.
async (page, { openPath, expect, screenshots }) => {
  const problems = [];
  page.on('console', message => { if (message.type() === 'error') problems.push(message.text()); });
  await page.unrouteAll();
  await page.reload();
  await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});

  const origin = page.url().split('/').slice(0, 3).join('/');
  const defaultPath = (await (await page.request.get(`${origin}/api/document`)).json()).path;
  const separator = defaultPath.includes('\\') ? '\\' : '/';
  const root = defaultPath.split(separator).slice(0, -4).join(separator);
  const file = [root, 'tmp', 'inline-math', 'math.md'].join(separator);
  const markdown = async () => {
    const response = await page.request.get(`${origin}/document/math.md?path=${encodeURIComponent(file)}`);
    if (response.status() !== 200) throw new Error(`Prepare ${file} first`);
    return (await response.text()).replaceAll('\r\n', '\n');
  };
  const open = async () => {
    await page.reload();
    await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
    await openPath(page, file);
  };
  const editor = page.locator('[data-document-tab][data-active=true]').getByTestId('document-editor');
  // The inline math sources in document order, read from the editor state.
  const sources = () => page.evaluate(() => {
    const values = [];
    document.querySelector('[data-document-tab][data-active=true] .ProseMirror').editor.state.doc.descendants(node => {
      if (node.type.name === 'inlineMath') values.push(node.attrs.value);
    });
    return values;
  });
  const mathNamed = async value => {
    const index = (await sources()).indexOf(value);
    if (index < 0) throw new Error(`inline math not found: ${value}`);
    // The visible formula: KaTeX's visually hidden 1px MathML box would be the click point.
    return editor.getByTestId('inline-math').nth(index).locator('.inline-math-rendered .katex-html');
  };
  // Select text through the editor's own selection (the state a mouse selection produces).
  const select = async text => {
    await page.evaluate(needle => {
      const instance = document.querySelector('[data-document-tab][data-active=true] .ProseMirror').editor;
      let range;
      instance.state.doc.descendants((node, position) => {
        if (range || !node.isText) return;
        const index = node.text.indexOf(needle);
        if (index >= 0) range = { from: position + index, to: position + index + needle.length };
      });
      if (!range) throw new Error(`text not found: ${needle}`);
      instance.chain().focus().setTextSelection(range).run();
    }, text);
    await page.getByTestId('selection-toolbar').waitFor();
  };
  const editSource = async (value, next) => {
    await (await mathNamed(value)).dblclick();
    await page.getByTestId('inline-math-editor').waitFor();
    const prefilled = await page.getByTestId('inline-math-source').inputValue() === value;
    await page.getByTestId('inline-math-source').fill(next);
    // Exercise Cmd+Enter through the common form with Apple platform emulation.
    await page.evaluate(() => Object.defineProperty(navigator, 'platform', {configurable:true, value:'MacIntel'}));
    try { await page.getByTestId('inline-math-source').press('Meta+Enter'); }
    finally { await page.evaluate(() => Reflect.deleteProperty(navigator, 'platform')); }
    await page.getByTestId('inline-math-editor').waitFor({state:'detached'});
    return prefilled;
  };

  const before = await markdown();
  if (!before.includes('The current is $i_d$') || before.includes('i_q')) {
    throw new Error('Scratch document is not a fresh math.md copy');
  }
  const result = {};
  await open();
  {
    let stage;
    for (const width of [1440, 640]) {
      await page.setViewportSize({width, height:900});
      const equation = editor.locator('[data-block="equation"]').first();
      await equation.scrollIntoViewIfNeeded();
      await equation.hover();
      await equation.getByRole('button', {name:'Edit',exact:true}).click();
      stage = await equation.getByTestId('equation-editor').count() ? 'after' : 'before';
      await page.getByTestId('equation-latex').fill('x = a + b\n  = c + d');
      await page.evaluate(() => document.fonts.ready);
      const blockBox = await equation.boundingBox();
      const inputBox = await page.getByTestId('equation-latex').boundingBox();
      expect(inputBox.x).toBeGreaterThanOrEqual(0);
      expect(inputBox.x + inputBox.width).toBeLessThanOrEqual(width);
      expect(Math.abs(inputBox.width - blockBox.width)).toBeLessThanOrEqual(2);
      expect(await equation.getByRole('form', {name:'Equation (1) properties', exact:true}).count()).toBe(1);
      if (screenshots) {
        await page.mouse.move(width - 2, 2);
        await page.screenshot({path:`tmp/equation-637/${stage}-${width}-block.png`});
      }
      await page.getByTestId('equation-cancel').click();
      await (await mathNamed('i_d')).dblclick();
      await page.getByTestId('inline-math-source').fill('i_d + i_q + v_{dc} + x + y + z + a + b + c');
      const popupBox = await page.getByTestId('inline-math-properties').boundingBox();
      expect(popupBox.x).toBeGreaterThanOrEqual(0);
      expect(popupBox.x + popupBox.width).toBeLessThanOrEqual(width);
      if (screenshots) {
        await page.mouse.move(width - 2, 2);
        await page.screenshot({path:`tmp/equation-637/${stage}-${width}-inline.png`});
      }
      await page.getByTestId('inline-math-cancel').click();
    }
    await page.setViewportSize({width:1280, height:720});
  }
  const mathTabId = await page.getByRole('tab', {selected:true}).getAttribute('id');
  // #637: the long source wraps in a wider popover; Enter keeps the prior submit behavior.
  await (await mathNamed('i_d')).dblclick();
  const field637 = page.getByTestId('inline-math-source');
  const popup637 = page.getByTestId('inline-math-properties');
  await field637.fill('x '.repeat(200));
  expect(await field637.evaluate(el => el.scrollWidth <= el.clientWidth && el.scrollHeight > el.clientHeight), 'Long source wraps within the field').toBe(true);
  await field637.fill('first second');
  await field637.press('Enter');
  await page.getByTestId('inline-math-editor').waitFor({state:'detached'});
  expect(await sources()).toContain('first second');
  await (await mathNamed('first second')).dblclick();
  expect(await field637.evaluate(el => el.tagName)).toBe('TEXTAREA');
  expect((await popup637.boundingBox()).width).toBeGreaterThan(320);
  await field637.fill('first\nsecond');
  expect(await field637.inputValue()).toBe('first second');
  await field637.fill('i_d');
  await page.getByTestId('inline-math-apply').click();
  await page.getByTestId('inline-math-editor').waitFor({state:'detached'});
  result.mathParagraphEditable = await editor.locator('p.paragraph', {hasText: 'The current is'}).count() === 1;
  result.renderedWithKatex = await editor.getByTestId('inline-math').locator('.katex').count() === 3;
  // {eq} reference paragraphs are editable since cross-reference authoring.
  result.crossReferenceEditable = await editor.locator('p.paragraph [data-testid="cross-reference"][data-label="eq-a"]').count() === 1;

  // Closing inline math must restore a caret at that formula, even if the engine previously
  // selected its atom or text elsewhere. Check immediately, then type without a focus helper.
  for (const start of ['selected math', 'other text']) for (const action of ['escape', 'apply']) {
    await editor.locator('.ProseMirror').evaluate((el, start) => {
      el.editor.state.doc.descendants((node, pos) => {
        if (start === 'selected math' && node.type.name === 'inlineMath' && node.attrs.value === 'i_d') el.editor.commands.setNodeSelection(pos);
        if (start === 'other text' && node.isText && node.text.includes('v_q')) el.editor.commands.setTextSelection(pos);
      });
      el.editor.view.focus();
    }, start);
    await (await mathNamed('i_d')).dblclick({timeout:5000});
    await page.getByTestId('inline-math-source').fill('i_d');
    if (action === 'apply') await page.getByTestId('inline-math-apply').click();
    else await page.getByTestId('inline-math-source').press('Escape');
    await page.getByTestId('inline-math-editor').waitFor({state:'detached'});
    const restored = await editor.locator('.ProseMirror').evaluate(el => {
      const e = el.editor;
      let after;
      e.state.doc.descendants((node, pos) => {
        if (node.type.name === 'inlineMath' && node.attrs.value === 'i_d') after = pos + node.nodeSize;
      });
      return {focused:document.activeElement === el && e.view.hasFocus(),
        selection:e.state.selection.toJSON(), after};
    });
    if (!restored.focused || restored.selection.type !== 'text' || restored.selection.anchor !== restored.after ||
      restored.selection.head !== restored.after) throw new Error(`Inline math ${start}/${action} did not restore its caret: ${JSON.stringify(restored)}`);
    const before = await editor.locator('.ProseMirror').evaluate(el => JSON.stringify(el.editor.getJSON()));
    await page.keyboard.type('Focus460');
    const adjacent = await editor.locator('.ProseMirror').evaluate(el => {
      let text;
      el.editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'inlineMath' && node.attrs.value === 'i_d') text = el.editor.state.doc.nodeAt(pos + node.nodeSize)?.text;
      });
      return text;
    });
    if (adjacent !== 'Focus460 and the voltage is ') throw new Error(`Inline math ${start}/${action}: typing lost its formula or adjacent text: ${adjacent}`);
    await page.keyboard.press('Control+z');
    if (await editor.locator('.ProseMirror').evaluate(el => JSON.stringify(el.editor.getJSON())) !== before) {
      throw new Error(`Inline math ${start}/${action}: Undo did not restore content`);
    }
  }
  result.closeRestoresCaretAndTyping = true;

  // #557: independent forms retain unapplied input across outside focus, Save, Source and tabs.
  const appliedBeforeDraft = await editor.locator('.ProseMirror').evaluate(el => JSON.stringify(el.editor.getJSON()));
  await (await mathNamed('i_d')).click();
  expect(await page.getByTestId('inline-math-editor').count(), 'Single click selects only').toBe(0);
  expect(await editor.locator('.ProseMirror').evaluate(el => ({type:el.editor.state.selection.toJSON().type,
    value:el.editor.state.selection.node?.attrs.value}))).toEqual({type:'node',value:'i_d'});
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('inline-math-source')).toBeFocused();
  await page.getByTestId('inline-math-source').fill('uncommitted-first');
  const firstSourceId = await page.getByTestId('inline-math-source').getAttribute('id');
  await (await mathNamed('i_d')).dblclick();
  expect(await page.getByTestId('inline-math-source').inputValue(), 'Re-entry preserves draft').toBe('uncommitted-first');
  await (await mathNamed('v_{dc}')).dblclick();
  const forms = page.getByTestId('inline-math-editor');
  await forms.nth(1).getByTestId('inline-math-source').fill('uncommitted-second');
  await editor.locator('p.paragraph', {hasText:'The current is'}).click({position:{x:4,y:4}});
  expect(await forms.count(), 'Outside focus keeps both drafts').toBe(2);
  expect(await editor.locator('.ProseMirror').evaluate(el => JSON.stringify(el.editor.getJSON()))).toBe(appliedBeforeDraft);
  await page.getByTestId('draft-notice').waitFor({state:'visible'});
  expect(await page.evaluate(() => {const e = new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented;})).toBe(true);
  await page.getByTestId('save').click();
  await page.locator('[data-testid="status"][data-operation^="saved"]').waitFor();
  expect(await markdown()).not.toContain('uncommitted');
  expect(await page.getByTestId('status').innerText()).toBe('Unsaved changes');
  await page.getByTestId('view-source').click();
  const sourceView = page.locator('[data-document-tab][data-active=true]').getByTestId('source-view');
  await sourceView.waitFor();
  expect(await sourceView.locator('pre').textContent()).not.toContain('uncommitted');
  expect(await forms.count(), 'Hidden document exposes no property portals').toBe(0);
  await page.getByTestId('view-visual').click();
  await forms.nth(1).waitFor();
  await page.getByRole('tab', {name:'technical-document.md',exact:true}).click();
  expect(await forms.count()).toBe(0);
  await page.locator(`#${mathTabId}`).click();
  await forms.nth(1).waitFor();
  expect(await forms.getByTestId('inline-math-source').evaluateAll(inputs => inputs.map(input => input.value).sort())).toEqual(['uncommitted-first','uncommitted-second']);
  const fileActions = page.getByRole('button', {name:'File actions',exact:true});
  await fileActions.click();
  await page.getByRole('menuitem', {name:'Reload',exact:true}).click();
  const reloadGuard = page.getByRole('dialog', {name:'Discard local changes?'});
  await reloadGuard.getByRole('button', {name:'Keep editing',exact:true}).click();
  await reloadGuard.waitFor({state:'detached'});
  await expect(fileActions).toBeFocused();
  const closeMath = page.getByRole('button', {name:'Close math.md',exact:true});
  await closeMath.click();
  const closeGuard = page.getByRole('dialog', {name:'Save changes?',exact:true});
  await closeGuard.getByRole('button', {name:'Cancel',exact:true}).click();
  // Finish the prior modal's dismissal and finalFocus before starting a property action.
  // Otherwise its late return to Close math.md can receive Enter and reopen this dialog.
  await closeGuard.waitFor({state:'detached'});
  await expect(closeMath).toBeFocused();
  const firstDraft = forms.filter({has:page.locator(`[id="${firstSourceId}"]`)});
  // Both independent popovers may overlap; activate the chosen Cancel by keyboard.
  const cancelFirst = firstDraft.getByTestId('inline-math-cancel');
  await cancelFirst.focus();
  await expect(cancelFirst).toBeFocused();
  await cancelFirst.press('Enter');
  // Check focus/content immediately. Base UI may retain the closed portal until the next frame,
  // as for block properties; count the remaining form only after that portal has detached.
  const afterCancel = await editor.locator('.ProseMirror').evaluate(el => ({focused:el.editor.view.hasFocus(),
    document:JSON.stringify(el.editor.getJSON()),empty:el.editor.state.selection.empty}));
  expect(afterCancel).toEqual({focused:true,document:appliedBeforeDraft,empty:true});
  await forms.filter({has:page.locator(`[id="${firstSourceId}"]`)}).waitFor({state:'detached'});
  expect(await forms.count(), 'Cancelling one instance keeps the other').toBe(1);
  expect(await forms.getByTestId('inline-math-source').inputValue()).toBe('uncommitted-second');
  expect(await page.getByTestId('draft-notice').isVisible()).toBe(true);
  await forms.getByTestId('inline-math-source').press('Escape');
  await forms.waitFor({state:'detached'});
  await page.getByTestId('draft-notice').waitFor({state:'detached'});
  expect(await editor.locator('.ProseMirror').evaluate(el => JSON.stringify(el.editor.getJSON()))).toBe(appliedBeforeDraft);
  result.explicitDraftLifecycle = true;

  // Change a source: the form opens prefilled.
  result.formPrefilled = await editSource('i_d', 'i_q');

  // Selected Enter opens properties without changing the paragraph or formula.
  const paragraphs = await editor.locator('p.paragraph').count();
  await (await mathNamed('i_q')).click();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('inline-math-source')).toBeFocused();
  result.enterKeepsMath = await editor.locator('p.paragraph').count() === paragraphs &&
    (await sources()).includes('i_q');
  await page.getByTestId('inline-math-cancel').click();
  await page.getByTestId('inline-math-editor').waitFor({state:'detached'});

  // Remove inline math back to its source as plain text; its bold mark stays.
  await (await mathNamed('v_{dc}')).dblclick();
  await page.getByTestId('inline-math-remove').click();
  result.removedToText = !(await sources()).includes('v_{dc}') &&
    await editor.locator('strong', {hasText: 'v_{dc}'}).count() === 1;

  // Create inline math from selected text.
  await select('v_q');
  await page.getByRole('button', {name:'Inline math', exact:true}).click();
  result.createdFromSelection = (await sources()).includes('v_q');

  // Plain text edit in a math paragraph.
  await editor.locator('p.paragraph', {hasText: 'The current is'}).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Done.');

  await page.getByRole('button', {name:'Save', exact:true}).click();
  await page.getByText('Saved', {exact:true}).filter({visible:true}).waitFor();
  const saved = await markdown();
  result.canonicalMarkdown = saved === [
    '---', 'ieumdoc: 1', '---', '',
    '# Math',
    '',
    'The current is $i_q$ and the voltage is **v\\_{dc}**. Done.',
    '',
    'Convert $v_q$ into math and see [the $x$ page](https://a.example).',
    '',
    'See {eq}`eq-a` here.',
    '',
    '```{math}',
    ':label: eq-a',
    '',
    'x',
    '```',
    '',
  ].join('\n');

  await open();
  result.reloaded = JSON.stringify(await sources()) === JSON.stringify(['i_q', 'v_q', 'x']) &&
    await editor.locator('a[href="https://a.example"]').getByTestId('inline-math').count() === 1;

  // A source the canonical Markdown cannot write back fails at Save; the file is unchanged.
  await editSource('v_q', '`v$');
  await page.getByRole('button', {name:'Save', exact:true}).click();
  await page.getByText('Save failed', {exact:true}).filter({visible:true}).waitFor();
  result.unpreservableRejected = await markdown() === saved;

  result.consoleErrors = problems.filter(message => !message.includes('Failed to load resource'));
  const failed = Object.entries(result).filter(([key, value]) => key !== 'consoleErrors' && value !== true);
  if (failed.length > 0 || result.consoleErrors.length > 0) {
    throw new Error(`Inline math authoring failed: ${JSON.stringify(result)}\n${saved}`);
  }
  return result;
}
