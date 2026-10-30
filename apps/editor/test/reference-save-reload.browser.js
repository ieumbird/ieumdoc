// Run with pnpm browser:test reference-save-reload.
// Edits an unrelated paragraph, saves and reloads a real file, then checks that the {eq} role
// stays a semantic reference and `[](#...)` fragment links stay ordinary links (issue #12).
// The file is a scratch copy under the repository's ignored tmp/ directory; prepare it first
// (see docs/test/TEST_GUIDE.md). The scenario writes that copy only.
async (page, { openPath, openDocument, reloadDocument, expect }) => {
  await page.unrouteAll();
  await page.reload();
  await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});

  const origin = page.url().split('/').slice(0, 3).join('/');
  const defaultPath = (await (await page.request.get(`${origin}/api/document`)).json()).path;
  const separator = defaultPath.includes('\\') ? '\\' : '/';
  const root = defaultPath.split(separator).slice(0, -4).join(separator);
  const filePath = [root, 'tmp', 'reference-save-reload', 'technical-document.md'].join(separator);
  const markdown = async () => {
    const response = await page.request.get(`${origin}/document/technical-document.md?path=${encodeURIComponent(filePath)}`);
    if (response.status() !== 200) throw new Error(`Prepare ${filePath} first`);
    return (await response.text()).replaceAll('\r\n', '\n');
  };
  const reference = 'See [Figure](#fig-control) and {eq}`eq-current`.';
  const link = 'The rated current follows from [Equation](#eq-current).';
  const before = await markdown();
  if (!before.includes(reference) || !before.includes(link) || before.includes('ReferenceSaveMarker')) {
    throw new Error('Scratch document is not a fresh technical-document.md copy');
  }

  await openDocument(page, filePath);
  await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
  if (!(await page.getByTestId('current-file').getAttribute('title')).includes('reference-save-reload')) {
    throw new Error('Scratch file was not opened');
  }
  await page.getByText('The current reference is calculated from the active power command.', {exact:true}).filter({visible:true}).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' ReferenceSaveMarker');
  await page.getByRole('button', {name:'Save', exact:true}).click();
  await page.getByText('Saved', {exact:true}).filter({visible:true}).waitFor();

  await page.reload();
  await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
  await openPath(page, filePath);
  const article = await page.getByRole('article').innerText();
  const saved = await markdown();
  const result = {
    editSavedAndReloaded: article.includes('ReferenceSaveMarker') && saved.includes('ReferenceSaveMarker'),
    semanticReferenceKept: saved.includes(reference),
    fragmentLinkKept: saved.includes(link),
    referenceNotFlattened: !saved.includes('[Figure](#fig-control) and [Equation](#eq-current)'),
    referenceParagraphEditable: await page.locator('[data-document-tab][data-active=true] p.paragraph').filter({hasText:'See Figure'}).count() === 1,
  };
  const failed = Object.entries(result).filter(([, value]) => value !== true);
  if (failed.length > 0) throw new Error(`Reference Save/Reload failed: ${JSON.stringify(result)}`);
  // Opening and saving fixed numbers must already work before number-entry controls ship.
  const fixedPath = [root, 'tmp', 'reference-save-reload', 'fixed.md'].join(separator);
  await openPath(page, fixedPath);
  const active = page.locator('[data-document-tab][data-active=true]');
  const fixedState = async () => ({
    captions: await active.locator('figcaption.caption, [data-testid="table-caption"]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-number'))),
    equation: await active.getByTestId('equation-number').innerText(),
    references: await active.locator('p.paragraph').filter({hasText:'See Figure'}).innerText(),
  });
  let expected = { captions: ['Figure 17', 'Table A.3', 'Figure B.2'], equation: '(4-2)',
    references: 'See Figure\u00a017, Table\u00a0A.3, (4-2) and Figure\u00a0B.2.' };
  const assertFixedState = async () => {
    const state = await fixedState();
    if (JSON.stringify(state) !== JSON.stringify(expected)) throw new Error(`Fixed number projection failed: ${JSON.stringify(state)}`);
  };
  await assertFixedState();
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  const engine = active.locator('.document-editor');
  for (const enumerator of ['17', 'A.3', '4-2', 'B.2']) {
    const originalPath = await engine.evaluate((element, number) => {
      const editor = element.editor;
      let selected;
      editor.state.doc.forEach((node, pos) => { if (node.attrs.enumerator === number) selected = {node, pos}; });
      if (!selected) throw new Error(`Missing fixed target ${number}`);
      editor.commands.setNodeSelection(selected.pos);
      editor.view.focus();
      return selected.node.attrs.sourcePath;
    }, enumerator);
    await page.keyboard.press('Control+x');
    const cut = await engine.evaluate((element, number) => element.editor.getJSON().content.some(node => node.attrs?.enumerator === number), enumerator);
    if (cut) throw new Error(`Cut did not remove fixed target ${enumerator}`);
    await page.keyboard.press('Control+End');
    await page.keyboard.press('Control+v');
    const pasted = await engine.evaluate((element, number) => element.editor.getJSON().content.find(node => node.attrs?.enumerator === number), enumerator);
    if (!pasted || pasted.attrs.sourcePath === originalPath) throw new Error(`Paste did not retain ${enumerator} on a fresh locator`);
  }
  await assertFixedState();
  await active.getByText('Before.', {exact:true}).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' FixedSaveMarker');
  await page.getByRole('button', {name:'Save', exact:true}).click();
  await page.getByText('Saved', {exact:true}).filter({visible:true}).waitFor();
  const fixedResponse = await page.request.get(`${origin}/document/fixed.md?path=${encodeURIComponent(fixedPath)}`);
  if (!fixedResponse.ok()) throw new Error(`Fixed document read failed: ${fixedResponse.status()}`);
  const fixedSaved = await fixedResponse.text();
  for (const number of ['17', 'A.3', '4-2', 'B.2']) {
    if (!fixedSaved.includes(`:enumerator: ${number}`)) throw new Error(`Fixed number lost on Save: ${number}`);
  }
  if (!fixedSaved.includes('FixedSaveMarker')) throw new Error('Fixed document edit was not saved');
  await page.reload();
  await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
  await openPath(page, fixedPath);
  await assertFixedState();
  const attrs = label => engine.evaluate((element, label) => element.editor.getJSON().content.find(node => node.attrs?.label === label)?.attrs, label);
  const edit = async (label, kind, fixed = true) => {
    await engine.evaluate((element, label) => {
      const editor = element.editor;
      editor.state.doc.forEach((node, pos) => { if (node.attrs.label === label) editor.commands.setNodeSelection(pos); });
      editor.view.focus();
    }, label);
    await page.keyboard.press('Enter');
    if (kind === 'mermaid') await page.getByTestId('mermaid-edit-source').click();
    if (fixed && !await page.getByTestId(`${kind}-enumerator`).isVisible())
      await page.getByTestId(`${kind}-editor`).getByRole('button', {name:'Fixed',exact:true}).click();
    if (fixed) await page.getByTestId(`${kind}-enumerator`).waitFor();
  };
  const applyNumber = async (label, kind, value) => {
    await edit(label, kind);
    if (value) await page.getByTestId(`${kind}-enumerator`).fill(value);
    else await page.getByTestId(`${kind}-editor`).getByRole('button', {name:'Automatic',exact:true}).click();
    await page.getByTestId(`${kind}-apply`).click();
    await page.getByTestId(`${kind}-editor`).waitFor({state:'detached'});
    expect((await attrs(label)).enumerator).toBe(value || null);
  };
  const save = async () => {
    await page.getByTestId('save').click();
    await page.locator('[data-testid="status"][data-operation="saved"]').waitFor();
  };
  // Number-only input is a property draft: Cancel preserves applied state; Apply is undoable.
  for (const [label, kind, previous, value] of [
    ['fixed-image','figure','17','18'], ['fixed-table','table','A.3','A.4'],
    ['fixed-equation','equation','4-2','5-1'], ['fixed-diagram','mermaid-property','B.2','C.2'],
  ]) {
    await edit(label, kind);
    expect(await page.getByTestId(`${kind}-enumerator`).inputValue()).toBe(previous);
    // Fixed mode must survive an empty draft and block every form's completion path.
    await page.getByTestId(`${kind}-enumerator`).fill('');
    await page.getByTestId(`${kind}-apply`).click();
    await expect(page.getByTestId(`${kind}-enumerator`)).toHaveAttribute('aria-invalid','true');
    await expect(page.getByTestId(`${kind}-enumerator`)).toBeFocused();
    expect((await attrs(label)).enumerator).toBe(previous);
    const errorId = await page.getByTestId(`${kind}-enumerator`).getAttribute('aria-describedby');
    expect(await page.locator(`[id="${errorId}"]`).innerText()).toBe('Enter a fixed number or choose Automatic.');
    if (kind === 'figure' || kind === 'mermaid-property') {
      // Outside pointer completion also keeps an invalid number draft open.
      await active.getByText('Before. FixedSaveMarker',{exact:true}).click();
      await expect(page.getByTestId(`${kind}-enumerator`)).toBeFocused();
      expect((await attrs(label)).enumerator).toBe(previous);
    }
    if (kind === 'mermaid-property') {
      await page.getByTestId('mermaid-edit-source').click();
      await expect(page.getByTestId('mermaid-source')).toHaveCount(0);
      await expect(page.getByTestId('mermaid-property-enumerator')).toBeFocused();
    }
    // Automatic previews the Core counter with this block's fixed enumerator removed.
    await page.getByTestId(`${kind}-editor`).getByRole('button',{name:'Automatic',exact:true}).click();
    await expect(page.getByTestId(`${kind}-enumerator`)).toHaveCount(0);
    expect(await page.getByTestId(`${kind}-automatic-number`).innerText()).toBe('Automatic number: 1');
    await page.getByTestId(`${kind}-editor`).getByRole('button',{name:'Fixed',exact:true}).click();
    await page.getByTestId(`${kind}-enumerator`).fill('discard');
    await expect(page.getByTestId('draft-notice')).toBeVisible();
    expect((await attrs(label)).enumerator).toBe(previous);
    if (kind === 'figure' || kind === 'mermaid-property') await page.getByTestId(kind === 'figure' ? 'figure-alt' : 'mermaid-property-label').press('Escape');
    else if (kind === 'table') await page.getByTestId('table-label').press('Escape');
    else await page.getByTestId(`${kind}-cancel`).click();
    await page.getByTestId(`${kind}-editor`).waitFor({state:'detached'});
    expect((await attrs(label)).enumerator).toBe(previous);
    await applyNumber(label, kind, value);
    if (kind === 'figure') {
      await engine.evaluate(element => element.editor.commands.undo());
      expect((await attrs(label)).enumerator).toBe(previous);
      await engine.evaluate(element => element.editor.commands.redo());
      expect((await attrs(label)).enumerator).toBe(value);
    }
  }
  expected = {captions:['Figure 18','Table A.4','Figure C.2'], equation:'(5-1)',
    references:'See Figure\u00a018, Table\u00a0A.4, (5-1) and Figure\u00a0C.2.'};
  await assertFixedState();
  // Mermaid source is a separate form and uses the same fixed-mode gate.
  await edit('fixed-diagram','mermaid');
  await page.getByTestId('mermaid-enumerator').fill('   ');
  await page.getByTestId('mermaid-apply').click();
  await expect(page.getByTestId('mermaid-enumerator')).toHaveAttribute('aria-invalid','true');
  expect((await attrs('fixed-diagram')).enumerator).toBe('C.2');
  await page.getByTestId('mermaid-editor').getByRole('button',{name:'Automatic',exact:true}).click();
  expect(await page.getByTestId('mermaid-automatic-number').innerText()).toBe('Automatic number: 1');
  await page.getByTestId('mermaid-apply').click();
  await page.getByTestId('mermaid-editor').waitFor({state:'detached'});
  expect((await attrs('fixed-diagram')).enumerator).toBeNull();
  await applyNumber('fixed-diagram','mermaid','C.2');
  await save();
  await reloadDocument(page);
  await assertFixedState();
  // The Core report supplies missing/duplicate warnings; neither disables Save.
  await applyNumber('fixed-table','table','');
  await edit('fixed-table','table');
  expect(await page.getByTestId('numbering-block-warning').innerText()).toContain('Missing fixed number');
  await page.getByTestId('table-label').press('Escape');
  await applyNumber('fixed-diagram','mermaid-property','18');
  await edit('fixed-diagram','mermaid-property');
  expect(await page.getByTestId('numbering-block-warning').innerText()).toContain('18 is duplicated');
  const warningStyle = await page.getByTestId('numbering-block-warning').evaluate(el => {
    const control=el.closest('.figure-number-field'), label=control.querySelector('span'), s=getComputedStyle(el), l=getComputedStyle(label);
    return {size:s.fontSize,line:s.lineHeight,labelSize:l.fontSize,labelLine:l.lineHeight,
      left:el.getBoundingClientRect().left,fieldLeft:control.getBoundingClientRect().left};
  });
  expect(warningStyle.size).toBe(warningStyle.labelSize);
  expect(warningStyle.line).toBe(warningStyle.labelLine);
  expect(warningStyle.left).toBe(warningStyle.fieldLeft);
  await page.getByTestId('mermaid-property-label').press('Escape');
  expect(await active.getByTestId('numbering-warnings').innerText()).toContain('Saving is allowed');
  await save();
  await reloadDocument(page);
  expect(await active.getByTestId('numbering-warnings').innerText()).toContain('Numbering warnings: 3.');
  expect((await attrs('fixed-table')).enumerator).toBeNull();
  expect((await attrs('fixed-diagram')).enumerator).toBe('18');
  for (const [label, kind] of [['fixed-image','figure'],['fixed-diagram','mermaid-property'],['fixed-equation','equation']]) await applyNumber(label,kind,'');
  expect(await active.getByTestId('numbering-warnings').count()).toBe(0);
  await save();
  await reloadDocument(page);
  expect(await active.getByTestId('numbering-warnings').count()).toBe(0);
  expect(await active.getByTestId('equation-number').innerText()).toBe('(1)');
  await edit('fixed-diagram','mermaid-property',false);
  await expect(page.getByTestId('mermaid-property-editor').getByRole('button',{name:'Automatic',exact:true})).toHaveAttribute('aria-pressed','true');
  expect(await page.getByTestId('mermaid-property-automatic-number').innerText()).toBe('Automatic number: 2');
  await page.getByTestId('mermaid-property-label').press('Escape');
  // Empty fixed equations can Apply; the existing final-save error path must explain both remedies.
  const emptyPath = [root,'tmp','reference-save-reload','empty-fixed.md'].join(separator);
  await openPath(page,emptyPath);
  await active.locator('[data-block="equation"]').hover();
  await active.locator('[data-block="equation"]').getByRole('button',{name:'Edit',exact:true}).click();
  await page.getByTestId('equation-editor').getByRole('button',{name:'Fixed',exact:true}).click();
  await page.getByTestId('equation-editor').getByTestId('equation-enumerator').fill('E.1');
  await page.getByTestId('equation-apply').click();
  await page.getByTestId('equation-editor').waitFor({state:'detached'});
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.getByTestId('ui-language').selectOption('ko');
  await page.keyboard.press('Escape');
  await page.getByTestId('settings-dialog').waitFor({state:'detached'});
  const readEmpty = async () => (await (await page.request.get(`${origin}/api/document?path=${encodeURIComponent(emptyPath)}`)).json()).source;
  const emptyBefore = await readEmpty();
  await page.getByTestId('save').click();
  await page.locator('[data-testid="status"][data-operation="save-failed"]').waitFor();
  expect(await page.getByTestId('error').innerText()).toContain('수식 내용을 입력하거나 고정 번호를 해제');
  expect(await readEmpty()).toBe(emptyBefore);
  await active.locator('[data-block="equation"]').hover();
  await active.locator('[data-block="equation"]').getByRole('button',{name:'편집',exact:true}).click();
  await page.getByTestId('equation-editor').getByRole('button',{name:'자동',exact:true}).click();
  expect(await page.getByTestId('equation-automatic-number').innerText()).toBe('자동 번호: 1');
  await page.getByTestId('equation-apply').click();
  await page.getByTestId('equation-editor').waitFor({state:'detached'});
  await save();
  await active.locator('[data-block="equation"]').hover();
  await active.locator('[data-block="equation"]').getByRole('button',{name:'편집',exact:true}).click();
  await expect(page.getByTestId('equation-editor').getByRole('button',{name:'자동',exact:true})).toHaveAttribute('aria-pressed','true');
  expect(await page.getByTestId('equation-automatic-number').innerText()).toBe('자동 번호: 1');
  await page.getByTestId('equation-cancel').click();
  await page.getByRole('button',{name:'설정',exact:true}).click();
  await page.getByTestId('ui-language').selectOption('en');
  await page.keyboard.press('Escape');
  await page.getByTestId('settings-dialog').waitFor({state:'detached'});
  result.numberEntryDraftsAndWarnings = true;
  result.fixedNumbersSavedAndReloaded = true;
  result.fixedNumbersCutPastedSavedAndReloaded = true;
  return result;
}
