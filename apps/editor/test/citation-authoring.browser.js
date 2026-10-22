// Citation authoring: slash search and insertion, the citation form's key group and role,
// Cancel/Apply/Remove, Undo/Redo and Save → Reload. The external BibTeX file is never written.
async (page, { openDocument, reloadDocument, bibliographyFixture }) => {
  page.setDefaultTimeout(15000);
  const assert = (ok, message) => { if (!ok) throw Error(message); };
  const ready = () => page.locator('[data-testid="status"][data-operation="ready"]').waitFor({ state: 'attached' });
  const origin = page.url().split('/').slice(0, 3).join('/');
  const initial = await (await page.request.get(origin + '/api/document')).json();
  const sep = initial.path.includes('\\') ? '\\' : '/';
  const root = [...initial.path.split(sep).slice(0, -4), 'tmp', 'bibliography'].join(sep);
  const file = [root, 'chapters', 'authoring.md'].join(sep);
  const readSource = async () => (await (await page.request.get(`${origin}/api/document?path=${encodeURIComponent(file)}`)).json()).source;
  const bibHash = bibliographyFixture.hash();
  // Reopen from the common folder so the tab may read ../refs.bib (the chapter folder alone may not).
  await openDocument(page, file); await ready();
  const sidebar = page.getByTestId('sidebar');
  const expand = page.getByRole('button', { name: 'Expand sidebar', exact: true });
  if (await expand.isVisible()) await expand.click();
  await sidebar.getByRole('button', { name: 'Files', exact: true }).click();
  await sidebar.getByRole('button', { name: 'More actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Open folder…', exact: true }).click();
  await page.getByTestId('folder-path').fill(root);
  await page.getByTestId('folder-open').click();
  await page.getByRole('dialog', { name: 'Open folder', exact: true }).waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Close authoring.md', exact: true }).click();
  const chapters = sidebar.getByRole('treeitem', { name: 'chapters', exact: true });
  if (await chapters.getAttribute('aria-expanded') !== 'true') await chapters.click();
  await sidebar.getByRole('treeitem', { name: 'authoring.md', exact: true }).click(); await ready();
  const editor = page.locator('[data-document-tab][data-active=true] .document-editor');
  const form = page.getByTestId('citation-form');
  const citations = () => editor.evaluate(element => {
    const found = [];
    element.editor.state.doc.descendants(node => { if (node.type.name === 'citation') found.push(`${node.attrs.role}:${node.attrs.keys.join(',')}`); });
    return JSON.stringify(found);
  });
  const chip = keys => editor.locator(`[data-citation][data-keys='${JSON.stringify(keys)}']`);
  const edit = async keys => {
    await chip(keys).hover();
    await chip(keys).getByTestId('citation-edit').click();
    await form.waitFor();
  };
  // Focus synchronously: Tiptap's focus command waits for an animation frame.
  await page.evaluate(() => {
    const instance = document.querySelector('[data-document-tab][data-active=true] .document-editor').editor;
    let end;
    instance.state.doc.forEach((node, position) => { if (node.textContent === 'Write here.') end = position + node.nodeSize - 1; });
    instance.commands.setTextSelection(end);
    instance.view.focus();
    if (!instance.view.hasFocus()) throw Error('Editor did not take focus');
  });

  // Slash search lists matching readable entries and inserts the chosen one as cite:p.
  await page.keyboard.type(' /feedb');
  await page.getByRole('menuitem', { name: /^conference · M\. Kim, “Feedback,”/ }).waitFor();
  await page.keyboard.press('Enter');
  assert(await citations() === JSON.stringify(['cite:p:article', 'cite:p:conference']), 'Slash search inserts the chosen entry as cite:p');
  assert(await chip(['conference']).locator('.cross-reference-chip').textContent() === '[2]', 'The new citation takes the next first-occurrence number');
  assert(!(await editor.innerText()).includes('/feedb'), 'The slash query is replaced');

  // The form refuses invalid keys, keeps typed keys the bibliography lacks, and Core canonicalizes the role.
  await page.keyboard.type(' /cite');
  await page.getByRole('menuitem', { name: 'Citation…', exact: true }).click();
  await form.waitFor();
  assert(await form.locator('datalist option').count() === 10, 'Every readable entry is searchable in the form');
  await page.getByTestId('citation-key').fill('bad key');
  await page.getByTestId('citation-add').click();
  assert(await form.getByRole('alert').isVisible(), 'An invalid key is refused in the form');
  await page.getByTestId('citation-key').fill('missing-key');
  await page.getByTestId('citation-key').press('Enter');
  await page.getByTestId('citation-key').fill('book');
  await page.getByTestId('citation-role').selectOption('cite');
  await page.getByTestId('citation-apply').click();
  await form.waitFor({ state: 'detached' });
  const inserted = JSON.stringify(['cite:p:article', 'cite:p:conference', 'cite:t:missing-key,book']);
  assert(await citations() === inserted, 'A pending typed key joins the group and multi-key cite becomes cite:t');
  assert(await chip(['missing-key', 'book']).getAttribute('data-readiness') === 'unresolved', 'A key absent from the bibliography stays citable and unresolved');
  assert(!(await editor.innerText()).includes('/cite'), 'The slash query is consumed by the form');

  // Cancel changes nothing; Apply replaces role and keys; Remove deletes the atom only.
  await edit(['article']);
  await page.getByTestId('citation-role').selectOption('cite:t');
  await page.keyboard.press('Escape');
  await form.waitFor({ state: 'detached' });
  assert(await citations() === inserted, 'Escape cancels the form without changes');
  await edit(['article']);
  assert(await page.getByTestId('citation-role').inputValue() === 'cite:p', 'The form opens with the stored role');
  await form.getByRole('button', { name: 'Remove key article', exact: true }).click();
  await page.getByTestId('citation-key').fill('standard');
  await page.getByTestId('citation-apply').click();
  await form.waitFor({ state: 'detached' });
  assert(await citations() === JSON.stringify(['cite:p:standard', 'cite:p:conference', 'cite:t:missing-key,book']), 'Apply replaces the key group');
  await edit(['conference']);
  await page.getByTestId('citation-remove').click();
  const removed = JSON.stringify(['cite:p:standard', 'cite:t:missing-key,book']);
  assert(await citations() === removed, 'Remove deletes the citation atom');
  assert((await editor.innerText()).includes('Write here.'), 'Surrounding text remains');

  await page.keyboard.press('Control+z');
  assert(JSON.parse(await citations()).includes('cite:p:conference'), 'Undo restores the removed citation');
  await page.keyboard.press('Control+Shift+z');
  assert(await citations() === removed, 'Redo removes it again');

  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.locator('[data-testid="status"][data-operation="saved"]').waitFor({ state: 'attached' });
  const saved = await readSource();
  assert(saved.includes('{cite:p}`standard`') && saved.includes('{cite:t}`missing-key,book`') && !saved.includes('conference'), 'Save writes explicit roles and key groups');
  assert(bibliographyFixture.hash() === bibHash, 'Authoring never writes the BibTeX file');
  await reloadDocument(page); await ready();
  assert(await citations() === removed, 'Save → Reload keeps roles and key groups');
  return { slashInsert: true, formInsert: true, editRemove: true, undoRedo: true, saveReload: true, bibHash };
}
