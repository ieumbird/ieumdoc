// Actual collection/Host refusals, snapshot invalidation and keyboard navigation. No validation mock.
async (page, { openPath, reloadDocument, expect, screenshots }) => {
  await page.evaluate(() => localStorage.setItem('ieumdoc.uiLanguage', 'en'));
  await page.reload();
  const origin = page.url().split('/').slice(0,3).join('/');
  const loaded = await (await page.request.get(`${origin}/api/document`)).json();
  const sep = loaded.path.includes('\\') ? '\\' : '/';
  const file = [...loaded.path.split(sep).slice(0,-4), 'tmp', 'table-authoring', 'tables.md'].join(sep);
  await openPath(page, file);
  const editor = page.locator('[data-document-tab][data-active=true] .document-editor');
  const overlay = page.getByTestId('block-save-error');
  const cellOverlay = page.getByTestId('cell-save-error');
  const error = page.getByTestId('error');
  const read = async () => (await (await page.request.get(`${origin}/api/document?path=${encodeURIComponent(file)}`)).json()).source;
  const language = language => page.evaluate(async language => (await import('/src/i18n.ts')).i18n.changeLanguage(language), language);
  const refuse = async () => {
    const before = await read();
    await page.getByTestId('save').click();
    await page.locator('[data-testid="status"][data-operation="save-failed"]').waitFor();
    if (await read() !== before) throw new Error('Refusal wrote the file');
  };
  const save = async () => {
    await page.getByTestId('save').click();
    await page.locator('[data-testid="status"][data-operation="saved"]').waitFor();
    if (await overlay.count() || await cellOverlay.count() || await error.count()) throw new Error('Successful Save retained an error');
  };
  // Real collection failure: deleting the title's text is editable, but cannot be saved.
  await editor.evaluate(el => {
    const e = el.editor;
    e.commands.setTextSelection({from:1, to:e.state.doc.firstChild.content.size + 1});
    e.commands.deleteSelection();
    window.errorSelection = JSON.stringify(e.state.selection.toJSON());
  });
  await language('ko');
  await refuse();
  if (!(await error.innerText()).includes('(제목)') || (await error.innerText()).includes('empty heading')) throw new Error('Summary must localize the kind and collapse the technical reason');
  await expect(error.locator('details')).not.toHaveAttribute('open');
  if (!await editor.evaluate(el => JSON.stringify(el.editor.state.selection.toJSON()) === window.errorSelection)) throw new Error('Highlight changed the selection');
  if (screenshots) for (const width of [1440,640]) for (const theme of ['light','dark']) {
    await page.setViewportSize({width, height:900});
    await page.emulateMedia({colorScheme:theme});
    await page.mouse.move(0,0);
    await page.evaluate(async () => { window.scrollTo(0,0); await document.fonts.ready; });
    await expect(overlay).toHaveText('저장 불가');
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('Error overflows the viewport');
    await page.screenshot({path:`tmp/save-error-578/after-${width}-${theme}.png`});
  }
  await error.getByText('기술적 세부 정보', {exact:true}).click();
  if (!(await error.innerText()).includes('empty heading')) throw new Error('Technical reason was lost');
  await language('en');
  if (!(await error.innerText()).startsWith('Block 1 (heading):') || await overlay.innerText() !== 'Cannot save') throw new Error('Visible errors did not switch language');
  await page.getByRole('button', {name:'Go to problem',exact:true}).focus();
  await page.keyboard.press('Enter');
  if (!await editor.evaluate(el => el.editor.view.hasFocus() && el.editor.state.selection.$from.parent.type.name === 'heading')) throw new Error('Keyboard navigation missed heading');
  await page.keyboard.type('Tables');
  if (await overlay.count() || await page.getByRole('button',{name:'Go to problem',exact:true}).count()) throw new Error('Editing retained stale locations');
  await save();

  // Real Core/Host cell refusal: editable inline math whose canonical write cannot preserve it.
  await editor.evaluate(el => {
    const e = el.editor;
    let cellPos;
    e.state.doc.descendants((node,pos) => { if (cellPos === undefined && node.type.name === 'tableCell' && !node.attrs.header) cellPos = pos; });
    e.commands.insertContentAt(cellPos + 1, {type:'inlineMath', attrs:{value:'`v$'}});
    if (e.state.doc.nodeAt(cellPos + 1)?.attrs.value !== '`v$') throw new Error('Invalid math was not inserted');
  });
  await refuse();
  await expect(cellOverlay).toBeVisible();
  await language('ko');
  if (!(await error.innerText()).includes('(표)') || !(await error.innerText()).includes('2행, 1열')) throw new Error('Cell coordinates/kind missing: ' + await error.innerText());
  await page.setViewportSize({width:640,height:500});
  await page.evaluate(() => window.scrollTo(0,0));
  await page.getByRole('button',{name:'문제 위치로 이동',exact:true}).click();
  if (!await editor.evaluate(el => el.editor.view.hasFocus() && el.editor.state.selection.$from.parent.type.name === 'tableCell')) throw new Error('Cell navigation missed the cell');
  if (!await page.evaluate(() => window.scrollY > 0)) throw new Error('Navigation did not scroll to the offscreen cell');
  const geometry = await overlay.evaluate(outline => {
    const e = document.querySelector('[data-document-tab][data-active=true] .document-editor').editor;
    let pos = 0; for (let i=0;i<2;i++) pos += e.state.doc.child(i).nodeSize;
    const target = e.view.nodeDOM(pos), rect = target.getBoundingClientRect(), ring = outline.getBoundingClientRect();
    const style = getComputedStyle(outline);
    const cell = target.querySelector('td').getBoundingClientRect();
    const highlight = document.querySelector('[data-testid="cell-save-error"]').getBoundingClientRect();
    const probe = document.createElement('div');
    probe.style.borderRadius = 'var(--id-radius-block-hover)';
    probe.style.boxShadow = 'inset 0 0 0 var(--size-block-hover-outline) var(--id-color-danger)';
    probe.style.padding = 'var(--space-block-hover-block) var(--space-block-hover-inline)';
    document.body.append(probe);
    const probeStyle=getComputedStyle(probe);
    const expected = {radius:probeStyle.borderRadius, shadow:probeStyle.boxShadow, inline:parseFloat(probeStyle.paddingLeft), block:parseFloat(probeStyle.paddingTop)};
    probe.remove();
    return {horizontal:Math.abs(ring.left - rect.left + expected.inline)<1,
      vertical:Math.abs(ring.top - rect.top + expected.block)<1,
      width:Math.abs(ring.width - rect.width - 2*expected.inline)<1,
      shadow:style.boxShadow === expected.shadow, radius:style.borderRadius === expected.radius,
      cell:['left','top','width','height'].every(key => Math.abs(cell[key] - highlight[key])<1),
      header:cell.top >= document.querySelector('.app-header').getBoundingClientRect().bottom,
      stacking:getComputedStyle(e.view.dom.closest('.document')).isolation === 'isolate',
      values:{ring:ring.toJSON(),block:rect.toJSON(),cell:cell.toJSON(),highlight:highlight.toJSON(),expected,shadow:style.boxShadow}};
  });
  if (Object.entries(geometry).some(([key,value]) => key !== 'values' && !value)) throw new Error('Error geometry: ' + JSON.stringify(geometry));
  await editor.evaluate(el => {
    const e=el.editor; let pos=0; for (let i=0;i<2;i++) pos+=e.state.doc.child(i).nodeSize;
    e.commands.setNodeSelection(pos);
  });
  await editor.locator('.table-block').hover();
  const priority = await overlay.evaluate(outline => {
    const selected = document.querySelector('[data-document-tab][data-active=true] .table-block[data-selected="true"]');
    const hover = document.querySelector('[data-testid="block-hover-outline"]');
    return selected && hover && Number(getComputedStyle(outline).zIndex) > Number(getComputedStyle(selected,'::after').zIndex);
  });
  if (!priority) throw new Error('Error is not above simultaneous selection and hover');
  if (screenshots) for (const width of [1440,640]) for (const theme of ['light','dark']) {
    await page.setViewportSize({width,height:900});
    await page.emulateMedia({colorScheme:theme});
    await page.getByRole('button',{name:'문제 위치로 이동',exact:true}).click();
    await page.mouse.move(0,0);
    await page.screenshot({path:`tmp/save-error-578/cell-${width}-${theme}.png`});
  }
  await language('en');
  // Any structural edit invalidates the complete submitted list, even if another block changed.
  await editor.evaluate(el => el.editor.commands.insertContentAt(el.editor.state.doc.firstChild.nodeSize, {type:'paragraph',content:[{type:'text',text:'Inserted.'}]}));
  if (await overlay.count() || await cellOverlay.count()) throw new Error('Insertion kept a stale highlight');
  await editor.evaluate(el => el.editor.commands.undo());
  if (await overlay.count()) throw new Error('Undo resurrected a stale highlight');
  await editor.evaluate(el => el.editor.commands.redo());
  if (await overlay.count()) throw new Error('Redo resurrected a stale highlight');
  await refuse();
  if (await overlay.getAttribute('data-block-index') !== '3') throw new Error('Next Save did not locate the shifted table');
  await editor.evaluate(el => { const e=el.editor, pos=e.state.doc.firstChild.nodeSize; e.view.dispatch(e.state.tr.delete(pos,pos+e.state.doc.child(1).nodeSize)); });
  if (await overlay.count()) throw new Error('Deletion kept a stale highlight');
  await refuse();
  if (await overlay.getAttribute('data-block-index') !== '2') throw new Error('Next Save did not refresh the location');
  await editor.evaluate(async el => { const e=el.editor; const {reorderBlock}=await import('/src/block-reorder.ts'); e.view.dispatch(reorderBlock(e.state,2,1)); });
  if (await overlay.count()) throw new Error('Move kept a stale highlight');
  await refuse();
  if (await overlay.getAttribute('data-block-index') !== '1') throw new Error('Moved block was misidentified');
  await editor.evaluate(el => {
    const e=el.editor; let start;
    e.state.doc.descendants((node,pos) => { if (start === undefined && node.type.name === 'inlineMath') start=pos; });
    e.view.dispatch(e.state.tr.delete(start,start+1));
  });
  await save();
  // Restore normal order, Save and Reload through the real Host.
  await editor.evaluate(async el => { const e=el.editor; const {reorderBlock}=await import('/src/block-reorder.ts'); e.view.dispatch(reorderBlock(e.state,1,2)); });
  await save();
  await reloadDocument(page);
  await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
  if (await overlay.count() || await editor.locator('table').count() !== 1) throw new Error('Reload lost the corrected table');
  // Hold a real refusal while input changes the submitted snapshot. The late response must not
  // highlight the newly occupying index, and must still retain the original refusal details.
  await editor.evaluate(el => {
    const e=el.editor; let cellPos;
    e.state.doc.descendants((node,pos) => { if (cellPos === undefined && node.type.name === 'tableCell' && !node.attrs.header) cellPos=pos; });
    e.commands.insertContentAt(cellPos+1,{type:'inlineMath',attrs:{value:'`v$'}});
  });
  let release, arrived;
  const gate = new Promise(resolve => { release=resolve; });
  const received = new Promise(resolve => { arrived=resolve; });
  const delayed = async route => {
    if (route.request().method() !== 'POST') return route.continue();
    const response = await route.fetch(); arrived(); await gate; await route.fulfill({response});
  };
  await page.route('**/api/document',delayed);
  try {
    await page.getByTestId('save').click(); await received;
    await editor.evaluate(el => el.editor.commands.insertContentAt(el.editor.state.doc.firstChild.nodeSize,{type:'paragraph',content:[{type:'text',text:'During Save.'}]}));
    release();
    await page.locator('[data-testid="status"][data-operation="save-failed"]').waitFor();
    // Immediate state after completion; no polling/reload can conceal stale decoration.
    if (await overlay.count() || await cellOverlay.count() || await page.getByRole('button',{name:'Go to problem',exact:true}).count()) throw new Error('Late refusal installed stale snapshot locations');
    if (!(await error.innerText()).includes('The document changed.')) throw new Error('Stale-location guidance missing');
  } finally { release(); await page.unroute('**/api/document',delayed); }
  await editor.evaluate(el => {
    const e=el.editor; let start;
    e.state.doc.descendants((node,pos) => { if (start === undefined && node.type.name === 'inlineMath') start=pos; });
    e.view.dispatch(e.state.tr.delete(start,start+1));
  });
  await save();
  return {headingRefusal:true, cellRefusal:true, keyboardNavigation:true, snapshotInvalidation:['typing','insertion','deletion','move','pending-response'], realSaveReload:true};
}
