// Run with pnpm browser:test reference-save-reload.
// Edits an unrelated paragraph, saves and reloads a real file, then checks that the {eq} role
// stays a semantic reference and `[](#...)` fragment links stay ordinary links (issue #12).
// The file is a scratch copy under the repository's ignored tmp/ directory; prepare it first
// (see docs/test/TEST_GUIDE.md). The scenario writes that copy only.
async (page, { openPath, openDocument }) => {
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
  const expected = { captions: ['Figure 17', 'Table A.3', 'Figure B.2'], equation: '(4-2)',
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
  result.fixedNumbersSavedAndReloaded = true;
  result.fixedNumbersCutPastedSavedAndReloaded = true;
  return result;
}
