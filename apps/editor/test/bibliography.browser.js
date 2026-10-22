// Real document-specific read boundary, independent tab snapshots and derived References.
async (page, { openDocument, reloadDocument, bibliographyFixture, screenshots }) => {
  page.setDefaultTimeout(15000);
  const assert = (ok, message) => { if (!ok) throw Error(message); };
  const ready = () => page.locator('[data-testid="status"][data-operation="ready"]').waitFor({ state: 'attached' });
  const save = async () => {
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.locator('[data-testid="status"][data-operation="saved"]').waitFor({ state: 'attached' });
  };
  const origin = page.url().split('/').slice(0, 3).join('/');
  const initial = await (await page.request.get(origin + '/api/document')).json();
  const sep = initial.path.includes('\\') ? '\\' : '/';
  const root = [...initial.path.split(sep).slice(0, -4), 'tmp', 'bibliography'].join(sep);
  const file = [root, 'chapters', 'paper.md'].join(sep);
  const readDocument = async () => (await (await page.request.get(`${origin}/api/document?path=${encodeURIComponent(file)}`)).json()).source;
  const originalSource = await readDocument(), originalBib = bibliographyFixture.read(), originalHash = bibliographyFixture.hash();
  const active = page.locator('[data-document-tab][data-active=true]');
  const editor = active.locator('.document-editor');
  const references = active.getByTestId('bibliography');
  const rows = references.locator('li[data-key]');
  const displayed = () => rows.evaluateAll(elements => elements.map(row => ({
    text: `${row.querySelector('.bibliography-number').textContent} ${row.querySelector('div > span').textContent}`,
    status: row.getAttribute('data-readiness'),
  })));
  const compare = async (source, bib) => {
    const expected = bibliographyFixture.report(source, bib).references.map(r => ({ text: r.text, status: r.status }));
    assert(JSON.stringify(await displayed()) === JSON.stringify(expected), 'Browser and Node must render identical references from the same source snapshots');
  };
  const sidebar = page.getByTestId('sidebar');
  const chooseFolder = async folder => {
    const expand = page.getByRole('button', { name: 'Expand sidebar', exact: true });
    if (await expand.isVisible()) await expand.click();
    await sidebar.getByRole('button', { name: 'Files', exact: true }).click();
    await sidebar.getByRole('button', { name: 'More actions', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Open folder…', exact: true }).click();
    await page.getByTestId('folder-path').fill(folder);
    await page.getByTestId('folder-open').click();
    await page.getByRole('dialog', { name: 'Open folder', exact: true }).waitFor({ state: 'detached' });
  };
  const capture = async (name, width) => {
    if (!screenshots) return;
    await page.setViewportSize({ width, height: 1000 });
    await references.waitFor({ state: 'visible' });
    await references.scrollIntoViewIfNeeded();
    await page.evaluate(async () => { await document.fonts.ready; document.activeElement?.blur(); });
    await page.mouse.move(0, 0);
    assert(await page.getByRole('dialog').count() === 0, 'No dialog may cover a References capture');
    assert(await references.isVisible(), 'Capture must show the actual References region');
    await page.screenshot({ path: `tmp/bibliography-capture/${name}-${width}.png` });
  };

  await page.setViewportSize({ width: 1440, height: 1000 });
  await openDocument(page, file); await ready();
  assert(await rows.count() === 9, 'One derived item per cited key, including unresolved keys');
  assert(await rows.filter({ has: page.locator('[data-readiness="complete"]') }).count() === 0, 'Narrow chapter scope must not grant parent access');
  assert((await displayed()).every(r => r.status === 'unverified'), 'Unavailable parent source must not fabricate missing-key warnings');
  await chooseFolder(root);
  await reloadDocument(page); await ready();
  assert((await displayed()).every(r => r.status === 'unverified'), 'Changing Sidebar folder must not expand the existing tab boundary on Reload');
  await capture('unverified', 1440);

  await page.getByRole('button', { name: 'Close paper.md', exact: true }).click();
  // The chapter folder opened first stays open too; use the common folder's own tree.
  const common = sidebar.locator(`[data-testid="folder"][data-root=${JSON.stringify(root)}]`);
  const chapters = common.getByRole('treeitem', { name: 'chapters', exact: true });
  if (await chapters.getAttribute('aria-expanded') !== 'true') await chapters.click();
  await common.getByRole('treeitem', { name: 'paper.md', exact: true }).click(); await ready();
  assert(await references.count() === 1, 'One References region follows the whole document');
  await compare(originalSource, originalBib);
  const bounds = await active.evaluate(panel => ({
    end: panel.querySelector('[data-footnote-definition]').getBoundingClientRect().bottom,
    references: panel.querySelector('[data-testid="bibliography"]').getBoundingClientRect().top,
  }));
  assert(bounds.references >= bounds.end, 'References must follow endnotes');
  assert(await editor.locator('[data-citation][data-keys=\'["standard","article"]\'] > span').textContent() === '[2], [1]', 'Stored group order remains unchanged');
  assert(await editor.locator('[data-testid="table-caption"] [data-citation]').getAttribute('data-readiness') === 'complete', 'Caption readiness must use the same snapshot');
  assert(await editor.locator('[data-citation][data-keys=\'["missing"]\']').getAttribute('data-readiness') === 'unresolved', 'Missing key must differ from unreadable resources');
  assert(await readDocument() === originalSource && bibliographyFixture.hash() === originalHash, 'Open may not write either source');

  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await editor.evaluate(element => {
    const e = element.editor; let at;
    e.state.doc.descendants((node, pos) => { if (node.type.name === 'citation' && at === undefined) at = pos; });
    e.commands.setNodeSelection(at); e.view.focus();
  });
  await page.keyboard.press('Control+x');
  await editor.evaluate(element => {
    const e = element.editor; let at;
    e.state.doc.forEach((node, pos) => { if (node.textContent === 'Move here.') at = pos + node.nodeSize - 1; });
    e.commands.setTextSelection(at); e.view.focus();
  });
  await page.keyboard.press('Control+v');
  assert(await rows.first().getAttribute('data-key') === 'standard', 'References must renumber with live first occurrence');
  await page.keyboard.press('Control+z'); await page.keyboard.press('Control+Shift+z');
  assert(await rows.first().getAttribute('data-key') === 'standard', 'Undo/Redo must retain derived numbering');
  await save();
  const savedSource = await readDocument();
  assert(!savedSource.includes('Control Study') && !savedSource.includes('STD-42'), 'References must never become Markdown blocks');
  assert(savedSource.includes('../refs.bib') && savedSource.includes('{cite:p}`standard,article`'), 'Source declaration and grouped keys survive Save');
  await compare(savedSource, originalBib);
  assert(bibliographyFixture.hash() === originalHash, 'Save must leave BibTeX byte-identical');

  // Other tabs own independent order and source snapshots, including untrusted strings.
  await common.getByRole('treeitem', { name: 'other.md', exact: true }).click(); await ready();
  assert(await rows.first().getAttribute('data-key') === 'unicode', 'Other tab has independent numbering');
  assert(await references.locator('img, script, a[href^="javascript:"]').count() === 0, 'Bibliography strings are typed text, not injected HTML or active URLs');
  const otherDisplay = JSON.stringify(await displayed());
  bibliographyFixture.change('updated');
  const updatedHash = bibliographyFixture.hash();
  await page.getByRole('tab', { name: 'paper.md', exact: true }).click();
  assert((await references.innerText()).includes('Control Study') && !(await references.innerText()).includes('Updated Study'), 'External changes remain outside the open snapshot until Reload');
  await save();
  assert(bibliographyFixture.hash() === updatedHash, 'Save may not overwrite an externally changed bibliography');
  assert((await references.innerText()).includes('Control Study'), 'Save does not refresh the bibliography snapshot');

  let release, seen, failed;
  const gate = new Promise(resolve => { release = resolve; });
  const requested = new Promise((resolve, reject) => { seen = resolve; failed = reject; });
  const delay = async route => {
    try { const response = await route.fetch(); seen(); await gate; await route.fulfill({ response }); } catch (error) { failed(error); }
  };
  await page.route('**/api/bibliography?**', delay);
  try {
    await reloadDocument(page);
    await Promise.race([requested, page.waitForTimeout(15000).then(() => { throw Error('Reload must request the bibliography within 15 seconds'); })]);
    assert(await page.getByRole('tab', { name: 'other.md', exact: true, includeHidden: true }).getAttribute('aria-disabled') === 'true', 'Tabs must be disabled during dependency loading');
    assert((await page.getByTestId('current-file').getAttribute('title')).endsWith('paper.md'), 'Opening remains busy while dependency response is pending');
  } finally {
    release();
  }
  await ready(); await page.unroute('**/api/bibliography?**', delay);
  assert((await references.innerText()).includes('Updated Study'), 'Reload must fetch external bibliography changes');
  await compare(await readDocument(), bibliographyFixture.read());
  await page.getByRole('tab', { name: 'other.md', exact: true }).click();
  assert(JSON.stringify(await displayed()) === otherDisplay, 'Another tab snapshot cannot be replaced by the late response');
  await page.getByRole('tab', { name: 'paper.md', exact: true }).click();

  bibliographyFixture.change('invalid');
  await reloadDocument(page); await ready();
  assert((await displayed()).every(r => r.status === 'unverified'), 'Parser failure must leave cited keys and numbers visible');
  await save();
  assert(bibliographyFixture.read() === '@article{broken', 'Invalid bibliography must not be rewritten by Save');
  bibliographyFixture.change('restore');
  await reloadDocument(page); await ready();
  await compare(await readDocument(), originalBib);
  assert(bibliographyFixture.hash() === originalHash, 'Reload recovery preserves the restored external bytes');

  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByTestId('ui-language').selectOption('ko'); await page.keyboard.press('Escape');
  await page.getByTestId('settings-dialog').waitFor({ state: 'detached' });
  assert(await references.getByRole('heading', { name: '참고문헌', exact: true }).count() === 1, 'References heading translates');
  assert((await editor.locator('[data-citation]').first().getAttribute('aria-label') ?? await editor.locator('[data-citation] > span').first().getAttribute('aria-label')).includes('인용'), 'Citation status translates');
  await capture('references-ko', 1440);
  await capture('references-ko', 375);
  await page.setViewportSize({ width: 375, height: 1000 });
  const narrow = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
  assert(narrow.scroll <= narrow.width, 'References must wrap without page-level overflow at 375px');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: '설정', exact: true }).click();
  await page.getByTestId('ui-language').selectOption('en'); await page.keyboard.press('Escape');
  await page.getByTestId('settings-dialog').waitFor({ state: 'detached' });
  // Persist through the real recovery producer, never seed or repair a recovery record.
  await editor.locator('p').filter({ hasText: 'Move here.' }).click();
  await page.keyboard.press('End'); await page.keyboard.type(' Bibliography recovery draft.');
  await page.getByRole('tab', { name: 'paper.md, Unsaved changes', exact: true }).waitFor();
  const records = () => page.evaluate(async () => (await import('/src/recovery-storage.ts')).recoveryStorage.list());
  let recorded;
  for (let attempt = 0; attempt < 100; attempt++) {
    recorded = (await records()).find(record => record.path === file && record.recoveryText.includes('Bibliography recovery draft.'));
    if (recorded) break;
    await page.waitForTimeout(50);
  }
  assert(recorded, 'Applied bibliography edits must create a real recovery record within 5 seconds');
  assert(recorded.snapshot.file.bibliographyRoot === root, 'Recovery must retain the original common folder context');
  assert(!Object.hasOwn(recorded.snapshot.file.bibliography, 'sources') && !JSON.stringify(recorded).includes('Control Study'), 'Recovery must never persist raw bibliography sources or derived entries');
  page.on('dialog', dialog => dialog.accept());
  await page.reload(); await ready();
  // Opening via the narrower chapter picker must not replace the stored recovery context.
  await openDocument(page, file); await ready();
  await page.getByTestId('recovery-prompt').waitFor();
  await page.getByRole('button', { name: 'Restore work', exact: true }).click();
  await page.getByTestId('recovery-prompt').waitFor({ state: 'detached' });
  await editor.getByText(/Bibliography recovery draft/).waitFor();
  await page.getByRole('tab', { name: 'paper.md, Unsaved changes', exact: true }).waitFor();
  assert((await displayed()).every(r => r.status === 'unverified'), 'Restored references remain unverified until explicit Reload');
  await save();
  assert((await displayed()).every(r => r.status === 'unverified'), 'Restored Save must not implicitly refresh sources');
  assert((await readDocument()).includes('Bibliography recovery draft.'), 'Restored dirty edits must reach disk');
  await reloadDocument(page); await ready();
  assert((await editor.innerText()).includes('Bibliography recovery draft.'), 'Restored Save survives Reload');
  await compare(await readDocument(), originalBib);
  assert(bibliographyFixture.hash() === originalHash, 'Recovery, Save and Reload keep bibliography bytes unchanged');
  return { sourceBoundary: true, nodeBrowserParity: true, snapshots: true, saveReload: true, bibHash: originalHash };
}
