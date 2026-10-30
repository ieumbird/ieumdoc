async (page, { openPath, activeDocument, screenshots = false, removeTabFixture }) => {
  const check = (ok, why) => { if (!ok) throw new Error(why); };
  const origin = page.url().split('/').slice(0, 3).join('/');
  const loaded = await (await page.request.get(`${origin}/api/document`)).json();
  const sep = loaded.path.includes('\\') ? '\\' : '/';
  const root = loaded.path.split(sep).slice(0, -4).join(sep);
  const file = [root, 'tmp', 'document-tabs', 'technical-1.md'].join(sep);
  await openPath(page, file);
  await page.getByTestId('save').click();
  await page.locator('[data-testid="status"][data-operation="saved"]').waitFor();
  const editor = () => activeDocument(page).locator('.document-editor');
  const read = async () => (await (await page.request.get(`${origin}/api/document?path=${encodeURIComponent(file)}`)).json());
  const records = () => page.evaluate(async () => (await import('/src/recovery-storage.ts')).recoveryStorage.list());
  const dialog = () => page.getByTestId('save-comparison');
  const menu = () => page.getByRole('button', { name: 'File actions', exact: true });
  const compare = async () => {
    await menu().click();
    await page.getByRole('menuitem', { name: 'Changes before saving', exact: true }).click();
    await dialog().waitFor();
  };
  const close = async () => { await page.keyboard.press('Escape'); await dialog().waitFor({ state: 'detached' }); };
  const layouts = [];
  const capture = async name => {
    for (const language of ['en', 'ko']) for (const width of [640, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(async language => { await (await import('/src/i18n.ts')).i18n.changeLanguage(language); await document.fonts.ready; }, language);
      await page.getByRole(name === 'comparison' ? 'heading' : 'menuitem', {
        name: language === 'ko' ? '저장 전 변경 내용 보기' : 'Changes before saving', exact: true,
      }).waitFor();
      const geometry = await page.getByRole(name === 'comparison' ? 'dialog' : 'menu').evaluate(node => {
        const r = node.getBoundingClientRect();
        return { left: r.left, right: r.right, width: node.clientWidth, scroll: node.scrollWidth, viewport: innerWidth };
      });
      check(geometry.scroll <= geometry.width && geometry.left >= 0 && geometry.right <= width, `${name} overflow: ${JSON.stringify(geometry)}`);
      layouts.push({ name, language, ...geometry });
      if (screenshots) await page.screenshot({ path: `tmp/pre-save-diff/${name}-${language}-${width}.png` });
    }
    await page.evaluate(async () => (await import('/src/i18n.ts')).i18n.changeLanguage('en'));
    await page.setViewportSize({ width: 1440, height: 900 });
  };
  await menu().click();
  check(await page.getByRole('menuitem', { name: 'Changes before saving', exact: true }).isDisabled(), 'Clean document can compare');
  await page.keyboard.press('Escape');
  await editor().evaluate(node => { node.editor.commands.insertContentAt(1, 'Preview changes. 미리보기. '); });
  // Wait only for the existing recovery recorder to settle before observing its invariance.
  for (let attempt = 0; attempt < 100; attempt++) {
    if ((await records()).some(record => record.recoveryText.includes('Preview changes.'))) break;
    if (attempt === 99) throw new Error('Applied edit was not recorded');
    await page.waitForTimeout(50);
  }
  const disk = await read();
  const beforeRecords = JSON.stringify(await records());
  const before = await editor().evaluate(node => ({ document: node.editor.getJSON(), selection: node.editor.state.selection.toJSON(), undo: node.editor.can().undo() }));
  await menu().click(); await capture('menu'); await page.keyboard.press('Escape');
  let request, preview;
  const url = '**/api/document-source?recovery=1';
  const observe = async route => { request = route.request().postDataJSON().save; const response = await route.fetch(); preview = await response.json(); await route.fulfill({ response }); };
  await page.route(url, observe);
  await compare();
  await dialog().getByRole('region', { name: 'Source differences', exact: true }).waitFor();
  check((await dialog().innerText()).includes('Canonical formatting changes are included.'), 'Canonical changes are hidden');
  check(await dialog().locator('mark').count() > 0, 'Missing word highlights');
  await dialog().getByRole('button', { name: 'Next change', exact: true }).click();
  check(await dialog().locator('[data-change-start="1"]').evaluate(node => node === document.activeElement), 'Next did not focus change');
  await capture('comparison');
  await page.keyboard.press('Control+s');
  check((await read()).revision === disk.revision && (await read()).source === disk.source, 'Comparison or shortcut wrote disk');
  check(JSON.stringify(await records()) === beforeRecords, 'Comparison changed recovery records');
  await close();
  check(await menu().evaluate(node => node === document.activeElement), 'Menu focus not restored');
  const after = await editor().evaluate(node => ({ document: node.editor.getJSON(), selection: node.editor.state.selection.toJSON(), undo: node.editor.can().undo() }));
  check(JSON.stringify(before) === JSON.stringify(after), 'Comparison changed editor, selection or history');
  await page.unroute(url, observe);
  await page.getByTestId('save').click();
  await page.locator('[data-testid="status"][data-operation="saved"]').waitFor();
  check((await read()).source === preview.markdown, 'Preview differs from real Save');
  const equation = editor().locator('[data-block="equation"]').first();
  await equation.hover(); await equation.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByTestId('equation-edit-source').click();
  await page.getByTestId('equation-latex').fill('x + 41');
  await compare();
  await dialog().getByText('0 changes', { exact: true }).waitFor();
  check(!(await dialog().innerText()).includes('x + 41'), 'Unapplied draft entered preview');
  await close();
  check(await page.getByTestId('equation-latex').inputValue() === 'x + 41', 'Comparison lost property draft');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await editor().evaluate(node => node.editor.commands.insertContentAt(1, 'Next edit. '));
  // Command center reuses the same command and captures the acknowledged Save checkpoint.
  await page.keyboard.press('Control+Slash');
  await page.getByRole('combobox').fill('Changes before saving');
  await page.getByRole('option', { name: /Changes before saving/ }).click();
  await dialog().getByRole('region', { name: 'Source differences', exact: true }).waitFor();
  check(!(await dialog().innerText()).includes('The file changed outside IeumDoc.'), 'Acknowledged revision treated as external');
  await close();
  const external = await read();
  const target = external.document.blocks.find(block => block.block === 'paragraph');
  const written = await page.request.post(`${origin}/api/document`, { data: { path: file, revision: external.revision,
    base: { source: external.source }, paragraphs: [{ path: target.path, content: [{ kind: 'text', text: 'External version.' }] }] } });
  check(written.ok(), 'External write failed');
  await compare();
  await dialog().getByText('The file changed outside IeumDoc. Comparing with the current disk file; Save will still report a conflict.', { exact: true }).waitFor();
  await close();
  await page.getByTestId('save').click();
  await page.locator('[data-testid="status"][data-operation="save-conflict"]').waitFor();
  check((await read()).source.includes('External version.'), 'Comparison acknowledged external write');
  // Actual Core refusal keeps its structured location and gives no false empty diff.
  await editor().evaluate(node => { const e = node.editor; e.view.dispatch(e.state.tr.delete(1, e.state.doc.firstChild.nodeSize - 1)); });
  await compare(); await dialog().getByRole('alert').waitFor();
  check((await dialog().getByRole('alert').innerText()).includes('Block 1 (heading)'), 'Preview refusal lost Save location');
  check((await dialog().innerText()).includes('The file changed outside IeumDoc.'), 'Collection failure concealed external revision change');
  check(await dialog().getByRole('region', { name: 'Source differences' }).count() === 0, 'Refusal showed successful diff');
  await close(); await editor().evaluate(node => node.editor.commands.undo());
  removeTabFixture();
  await compare();
  await dialog().getByText('File missing. All content Save would write is shown as added.', { exact: true }).waitFor();
  await close();
  // Same reviewed large input as recovery, against the shared real worker and UI.
  const words = prefix => Array.from({ length: 1000 }, (_, i) => prefix + i).join(' ');
  const pair = prefix => Array.from({ length: 50 }, () => words(prefix)).join('\n');
  const large = route => route.fulfill({ json: { disk: { source: pair('old'), revision: request.revision }, markdown: pair('new') } });
  await page.route(url, large);
  await page.evaluate(() => {
    const timing = window.preSaveTiming = { maxGap: 0, last: performance.now(), start: 0, readyAfter: null };
    window.preSaveTimer = setInterval(() => { const now = performance.now(); timing.maxGap = Math.max(timing.maxGap, now - timing.last); timing.last = now; }, 10);
    window.preSaveObserver = new MutationObserver(() => { if (!timing.readyAfter && document.querySelector('[aria-label="Source differences"]')) timing.readyAfter = performance.now() - timing.start; });
    window.preSaveObserver.observe(document.body, { childList: true, subtree: true });
  });
  await menu().click();
  await page.evaluate(() => { window.preSaveTiming.start = performance.now(); });
  await page.getByRole('menuitem', { name: 'Changes before saving', exact: true }).click();
  const performanceResult = await page.evaluate(async () => {
    await new Promise(resolve => setTimeout(resolve, 2000));
    clearInterval(window.preSaveTimer); window.preSaveObserver.disconnect();
    return { ...window.preSaveTiming, ready: !!document.querySelector('[aria-label="Source differences"]'), omitted: document.body.textContent.includes('Word highlighting omitted to keep comparison responsive.') };
  });
  check(performanceResult.maxGap < 500 && performanceResult.ready && performanceResult.readyAfter < 2000 && performanceResult.omitted, `Large preview unresponsive: ${JSON.stringify(performanceResult)}`);
  await close(); await page.unroute(url, large);
  return { layouts, performanceResult };
}
