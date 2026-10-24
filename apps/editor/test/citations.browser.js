// Interface regression: real typing, typed clipboard, live numbering and Save → Reload.
// Optional images are manual review evidence, never pass/fail pixel assertions.
async (page, { openDocument, reloadDocument, screenshots, assertSavedSource }) => {
  page.setDefaultTimeout(15000);
  const assert = (ok, message) => { if (!ok) throw Error(message); };
  const ready = () => page.locator('[data-testid="status"][data-operation="ready"]').waitFor({ state: 'attached' });
  const saved = () => page.locator('[data-testid="status"][data-operation="saved"]').waitFor({ state: 'attached' });
  await ready();
  const origin = page.url().split('/').slice(0, 3).join('/');
  const initial = await (await page.request.get(`${origin}/api/document`)).json();
  const sep = initial.path.includes('\\') ? '\\' : '/';
  const file = [...initial.path.split(sep).slice(0, -4), 'tmp', 'citations', 'citations.md'].join(sep);
  const read = async () => (await (await page.request.get(`${origin}/api/document?path=${encodeURIComponent(file)}`)).json());
  const before = (await read()).source;
  const resourceRequests = [];
  const request = request => { if (/\.bib(?:$|[?&])/i.test(decodeURIComponent(request.url()))) resourceRequests.push(request.url()); };
  page.on('request', request);
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openDocument(page, file);
    await ready();
    const editor = page.locator('[data-document-tab][data-active=true] .document-editor');
    const chips = editor.locator('[data-citation] > .cross-reference-chip');
    const semantic = () => editor.evaluate(element => {
      const found = [];
      const walk = node => { if (node.type === 'citation') found.push({ role: node.attrs.role, keys: node.attrs.keys, marks: node.marks });
        if (node.attrs?.caption) found.push({ caption: node.attrs.caption });
        node.content?.forEach(walk); };
      walk(element.editor.getJSON()); return JSON.stringify(found);
    });
    assert(await chips.count() === 9, 'All inline citations, including table caption and endnote, must display');
    assert(JSON.stringify(await chips.allTextContents()) === JSON.stringify(['[1]', '[2]', '[1]', '[2], [3]', '[3], [1]', '[2], [1]', '[5]', '[4]', '[6]']), 'Displayed numbers must match the Core content order');
    assert((await chips.first().getAttribute('title')).includes('Alpha') && (await chips.first().getAttribute('title')).includes('could not be verified'), 'Exact keys and unverified status must be available');
    assert(await editor.locator('[data-citation][data-resolved]').count() === 0, 'Citation must not claim resource resolution');
    await assertSavedSource((await read()).source, before, 'Open must not write');
    const original = await semantic();

    await editor.evaluate(element => { const e = element.editor; e.commands.setTextSelection(e.state.doc.child(0).nodeSize + 1); e.view.focus(); });
    await page.keyboard.type('Edited ');
    await page.keyboard.press('Control+z');
    assert(!await editor.getByText('Edited Single', { exact: false }).count(), 'Typing undo should remove the edit');
    await page.keyboard.press('Control+Shift+z');
    assert(await semantic() === original, 'Typing and history must preserve citation attributes');

    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await editor.evaluate(element => {
      const e = element.editor; let at;
      e.state.doc.descendants((node, pos) => { if (node.type.name === 'citation' && at === undefined) at = pos; });
      e.commands.setNodeSelection(at); e.view.focus();
    });
    await page.keyboard.press('Control+x');
    assert((await page.evaluate(() => navigator.clipboard.readText())).includes('{cite}`Alpha`'), 'Plain clipboard must identify the citation');
    await editor.evaluate(element => {
      const e = element.editor; let at;
      e.state.doc.forEach((node, pos) => { if (node.textContent === 'Move here.') at = pos + node.nodeSize - 1; });
      e.commands.setTextSelection(at); e.view.focus();
    });
    await page.keyboard.press('Control+v');
    assert(await chips.count() === 9, 'Typed clipboard must move rather than lose or duplicate the citation');
    assert(await chips.first().textContent() === '[1]' && (await chips.first().getAttribute('title')).includes('Beta'), 'Numbers must update when first citation order changes');
    const moved = await semantic();
    await page.keyboard.press('Control+z');
    assert(await chips.count() === 8, 'Paste must be one undoable transaction');
    await page.keyboard.press('Control+Shift+z');
    assert(await semantic() === moved, 'Redo must restore role, key order and marks');

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await saved();
    const written = await read();
    assert(written.source.includes('Edited Single') && written.source.includes('bibliography:') && written.source.includes('../refs.bib') && written.source.includes('./standards.bib'), 'Save must keep typed text and declaration spelling');
    await reloadDocument(page); await ready();
    assert(await editor.getByText('Literal @kim and [@literal] stay text.', { exact: true }).count() === 1, 'Literal @ and bracket text must survive Save and Reload');
    assert(await semantic() === moved, 'Reload must retain role, exact keys, group order and marks');
    assert(await chips.first().textContent() === '[1]' && (await chips.first().getAttribute('title')).includes('Beta'), 'Reload numbers must match edited order');
    await page.getByRole('button', { name: 'Save', exact: true }).click(); await saved();
    await assertSavedSource((await read()).source, written.source, 'Repeated Save must be canonical and stable');

    // Enter leaves a citation-only paragraph; Backspace rejoins it through real Host saves.
    const citationCaret = () => editor.evaluate(element => {
      const e = element.editor;
      e.state.doc.descendants((node, pos) => {
        if (node.type.name === 'citation' && node.attrs.keys[0] === 'Alpha' && node.attrs.role === 'cite') {
          e.commands.setTextSelection(pos); return false;
        }
      });
      e.view.focus();
    });
    await citationCaret();
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Save', exact: true }).click(); await saved();
    assert((await read()).source.includes('Move here.\n\n**{cite}`Alpha`**'), 'Split must persist the marked citation-only paragraph');
    await reloadDocument(page); await ready();
    assert(await semantic() === moved, 'Split Reload must retain all citation semantics');
    await citationCaret();
    await page.keyboard.press('Backspace');
    await page.getByRole('button', { name: 'Save', exact: true }).click(); await saved();
    await assertSavedSource((await read()).source, written.source, 'Merge must restore the original canonical bytes');
    await reloadDocument(page); await ready();
    assert(await semantic() === moved, 'Merge Reload must retain all citation semantics');

    // Already-open citation NodeViews and static table captions must both react to language changes.
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByTestId('ui-language').selectOption('ko');
    await page.keyboard.press('Escape');
    await page.getByTestId('settings-dialog').waitFor({ state: 'detached' });
    assert((await chips.first().getAttribute('title')).includes('참고문헌을 확인할 수 없음'), 'Korean citation status missing');
    assert((await editor.locator('[data-testid="table-caption"] [data-citation] > span').getAttribute('title')).includes('참고문헌'), 'Table caption citation must translate too');
    assert(await semantic() === moved, 'Language changes must not change citations');

    if (screenshots) {
      for (const width of [1440, 375]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.evaluate(async () => { await document.fonts.ready; window.scrollTo(0, 0); document.activeElement?.blur(); });
        await page.mouse.move(0, 0);
        await page.screenshot({ path: `tmp/visual-refinement/citations-${width}.png` });
      }
    }
    // Restore the shared browser locale preference for later scenarios.
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('button', { name: '설정', exact: true }).click();
    await page.getByTestId('ui-language').selectOption('en');
    await page.keyboard.press('Escape');
    assert(resourceRequests.length === 0, 'Bibliography reads must use the dedicated Host route, never direct .bib URLs');
    return { citations: 9, clipboard: true, liveNumbers: true, saveReload: true, bilingualStatus: true, bibliographyRequests: resourceRequests };
  } finally { page.off('request', request); }
}
