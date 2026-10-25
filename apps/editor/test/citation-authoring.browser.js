// Citation authoring: slash search and insertion, the citation form's key group and role,
// Cancel/Apply/Remove, Undo/Redo and Save → Reload. The external BibTeX file is never written.
async (page, { openPath, waitForActivePath, reloadDocument, bibliographyFixture }) => {
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
  await openPath(page, file);
  const sidebar = page.getByTestId('sidebar');
  const expand = page.getByRole('button', { name: 'Expand sidebar', exact: true });
  if (await expand.isVisible()) await expand.click();
  await sidebar.getByRole('button', { name: 'Files', exact: true }).click();
  await page.getByTestId('sidebar').getByRole('button', {name:'Open folder…', exact:true}).click();
  await page.getByTestId('folder-path').fill(root);
  await page.getByTestId('folder-open').click();
  await page.getByRole('dialog', { name: 'Open folder', exact: true }).waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Close authoring.md', exact: true }).click();
  // The chapter folder opened first stays open too; use the common folder's own tree.
  const common = sidebar.locator(`[data-testid="folder"][data-root=${JSON.stringify(root)}]`);
  const chapters = common.getByRole('treeitem', { name: 'chapters', exact: true });
  if (await chapters.getAttribute('aria-expanded') !== 'true') await chapters.click();
  await common.getByRole('treeitem', { name: 'authoring.md', exact: true }).click();
  await waitForActivePath(page, file); await ready();
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
  // Exercise the same insertion paths on every supported inline surface, then persist them.
  const nestedFile = [root, 'chapters', 'nested.md'].join(sep);
  await openPath(page, nestedFile);
  const caret = async (text, replace = false) => editor.evaluate((element, { text, replace }) => {
    const instance = element.editor;
    let range;
    instance.state.doc.descendants((node, pos) => {
      if (node.isTextblock && node.textContent === text) range = { from: pos + 1, to: pos + node.nodeSize - 1 };
    });
    if (!range) throw Error(`Missing inline surface ${text}`);
    instance.commands.setTextSelection(replace ? range : range.to);
    instance.view.focus();
  }, { text, replace });
  const menu = page.getByRole('menu', { name: 'Insert block', exact: true });
  await caret('Only citation', true);
  await page.keyboard.type('/');
  await menu.waitFor();
  const insertArticle = async () => {
    await page.keyboard.type('article');
    await menu.getByRole('menuitem', { name: /^article ·/ }).waitFor();
    await page.keyboard.press('Enter');
  };
  await insertArticle();
  const citationOnly = () => editor.evaluate(element => {
    let found = false;
    element.editor.state.doc.descendants(node => {
      if (node.type.name === 'listItem' && node.firstChild?.childCount === 1 && node.firstChild.firstChild.type.name === 'citation') found = true;
    });
    return found;
  });
  assert(await citationOnly(), 'A list item may contain only a citation');
  const checkInsertionAvailability = async (allowed, location) => {
    const caretBefore = await editor.evaluate(element => element.editor.state.selection.from);
    await page.keyboard.press('ControlOrMeta+/');
    const center = page.getByRole('dialog', { name: 'Command center', exact: true });
    await center.getByRole('combobox').fill('> insert');
    for (const name of ['Insert citation…', 'Insert cross-reference…']) {
      assert((await center.getByRole('option', { name, exact: true }).getAttribute('aria-disabled') !== 'true') === allowed,
        `${location}: ${name} follows inline caret eligibility`);
    }
    await page.keyboard.press('Escape');
    await center.waitFor({ state: 'detached' });
    await page.waitForFunction(() => document.querySelector('[data-document-tab][data-active=true] .document-editor').editor.view.hasFocus());
    assert(await editor.evaluate(element => element.editor.state.selection.from) === caretBefore, `${location}: center dismissal retains caret`);
  };
  const surfaces = ['Item.', 'Nested item.', 'Quote.', 'Callout.', 'Header', 'Cell.', 'Caption.', 'Heading.', 'Nested inline', 'Definition.'];
  for (const text of surfaces) {
    await caret(text);
    await checkInsertionAvailability(true, text);
    await page.keyboard.type(' /');
    await menu.waitFor();
    const names = await menu.getByRole('menuitem').allTextContents();
    assert(names.every(name => /^(Endnote|Citation…|Section reference:)/.test(name.trim())), `${text}: only inline commands are offered: ${names}`);
    assert(await menu.getByRole('menuitem', { name: 'Endnote', exact: true }).count() === (text === 'Definition.' ? 0 : 1), `${text}: Endnote follows the Core definition restriction`);
    await insertArticle();
    await page.keyboard.type(' /reference');
    await menu.getByRole('menuitem', { name: 'Section reference: Target', exact: true }).click();
    if (text !== 'Definition.') {
      await page.keyboard.type(' /endnote');
      await menu.getByRole('menuitem', { name: 'Endnote', exact: true }).waitFor();
      await page.keyboard.press('Enter');
      await page.keyboard.type(`Note for ${text}`);
    }
  }
  await caret('Code.', true);
  await checkInsertionAvailability(false, 'Text selection');
  await caret('Code.');
  await checkInsertionAvailability(false, 'Code');
  await page.keyboard.type(' /');
  assert(await menu.count() === 0, 'Code keeps literal slash input');
  // Code edits with newly added endnotes hit a pre-existing, separate Core count check.
  // Restore this literal probe; this scenario persists the supported inline insertions above.
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  const saveResponse = page.waitForResponse(response => response.url().endsWith('/api/document') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const response = await saveResponse;
  assert(response.ok(), `Nested Save failed: ${await response.text()}`);
  await page.locator('[data-testid="status"][data-operation="saved"]').waitFor({ state: 'attached' });
  const nestedSaved = (await (await page.request.get(`${origin}/api/document?path=${encodeURIComponent(nestedFile)}`)).json()).source;
  assert(nestedSaved.includes('{cite:p}`article`') && !nestedSaved.includes('Only citation'), 'Save writes the explicit citation and removes the replaced list text');
  const inlineContent = () => editor.evaluate(element => {
    const blocks = [];
    element.editor.state.doc.descendants(node => {
      if (node.isTextblock) blocks.push({ type: node.type.name, content: node.content.toJSON() });
    });
    return JSON.stringify(blocks);
  });
  const nestedContent = await inlineContent();
  await reloadDocument(page); await ready();
  assert(await citationOnly(), 'Save → Reload retains the citation-only list item');
  assert(await inlineContent() === nestedContent, 'Save → Reload retains exact inline content on every supported surface, including new endnote definitions');
  // #374 + #377: these references came from the real nested slash menu, including
  // the document title, a heading and the Figure caption. Rename through the property form.
  const references = editor.getByTestId('cross-reference');
  const beforeRename = await inlineContent();
  const referenceCount = await references.count();
  assert(await editor.locator('h1 [data-testid="cross-reference"]').count() === 1 &&
    await editor.locator('figcaption [data-testid="cross-reference"]').count() === 1,
    'Nested slash references must be present in the title and Figure caption');
  await editor.locator('h2').filter({ hasText: /^Target$/ }).hover();
  await page.locator('[data-document-tab][data-active=true]').getByTestId('label-target-edit').click();
  await page.getByTestId('label-target-input').fill('section-renamed');
  await page.getByTestId('label-target-apply').click();
  await page.getByTestId('label-target-editor').waitFor({ state: 'detached' });
  const referencesFollow = async () => await references.count() === referenceCount && referenceCount > 0 &&
    await references.evaluateAll(nodes => nodes.every(node => node.dataset.label === 'section-renamed' && node.dataset.resolved === 'true'));
  assert(await referencesFollow(), 'All slash-inserted references follow the renamed section');
  await page.keyboard.press('ControlOrMeta+z');
  assert(await inlineContent() === beforeRename && await page.getByTestId('label-target').getAttribute('data-label') === 'section',
    'One Undo restores the section label and all nested inline references');
  await page.keyboard.press('ControlOrMeta+Shift+z');
  assert(await referencesFollow(), 'Redo reapplies the nested reference rename');
  const renamedContent = await inlineContent();
  const renameSave = page.waitForResponse(response => response.url().endsWith('/api/document') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  assert((await renameSave).ok(), 'Save accepts the nested reference rename');
  await page.locator('[data-testid="status"][data-operation="saved"]').waitFor({ state: 'attached' });
  await reloadDocument(page); await ready();
  assert(await referencesFollow() && await inlineContent() === renamedContent,
    'Save → Reload retains the renamed title, caption and other nested references');
  assert(bibliographyFixture.hash() === bibHash, 'Nested authoring never writes the BibTeX file');
  // #439: no slash or whitespace is needed after Korean text.
  const center = page.getByRole('dialog', { name: 'Command center', exact: true });
  const openInsert = async label => {
    await page.keyboard.press('ControlOrMeta+/');
    await center.getByRole('combobox').fill(label);
    await center.getByRole('option', { name: label, exact: true }).click();
    await center.waitFor({ state: 'detached' });
  };
  const snapshot = () => editor.evaluate(element => JSON.stringify(element.editor.state.doc.toJSON()));
  const position = () => editor.evaluate(element => element.editor.state.selection.from);
  const hasFocus = () => editor.evaluate(element => element.editor.view.hasFocus());
  await editor.evaluate(element => {
    const instance = element.editor;
    instance.commands.setTextSelection(instance.state.doc.content.size - 1);
    instance.view.focus();
  });
  await page.keyboard.insertText('한글문장계속');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.type('/');
  assert(await menu.count() === 0, 'Slash after Korean text keeps its existing literal trigger rule');
  await page.keyboard.press('Backspace');
  const beforeInsert = await snapshot();
  const insertionCaret = await position();
  for (const [label, testId] of [['Insert citation…', 'citation-form'], ['Insert cross-reference…', 'reference-form']]) {
    await openInsert(label);
    await page.getByTestId(testId).waitFor();
    await page.keyboard.press('Escape');
    await page.getByTestId(testId).waitFor({ state: 'detached' });
    assert(await hasFocus() && await position() === insertionCaret && await snapshot() === beforeInsert,
      `${label}: Escape preserves content, caret and editor focus`);
    await openInsert(label);
    await page.getByTestId(testId).waitFor();
    if (testId === 'citation-form') await page.getByTestId('citation-key').fill('article');
    await page.getByTestId(testId === 'citation-form' ? 'citation-apply' : 'reference-apply').click();
    assert(await hasFocus() && await position() === insertionCaret + 1, `${label}: insert at retained caret and return focus`);
    const applied = await snapshot();
    await page.keyboard.press('ControlOrMeta+z');
    assert(await snapshot() === beforeInsert, `${label}: one Undo removes only the insertion`);
    await page.keyboard.press('ControlOrMeta+Shift+z');
    assert(await snapshot() === applied, `${label}: Redo restores insertion`);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.locator('[data-testid="status"][data-operation="saved"]').waitFor({ state: 'attached' });
    await reloadDocument(page); await ready();
    assert(await snapshot() === applied, `${label}: Save → Reload retains exact content`);
    await editor.evaluate((element, pos) => {
      element.editor.commands.setTextSelection({ from: pos, to: pos + 1 });
      element.editor.commands.deleteSelection();
      element.editor.view.focus();
    }, insertionCaret);
    assert(await snapshot() === beforeInsert, 'Remove only the persisted probe atom');
  }
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByTestId('ui-language').selectOption('ko');
  await page.keyboard.press('Escape');
  await page.getByTestId('settings-dialog').waitFor({ state: 'detached' });
  await editor.evaluate((element, pos) => {
    element.editor.commands.setTextSelection(pos);
    element.editor.view.focus();
  }, insertionCaret);
  await page.keyboard.press('ControlOrMeta+/');
  const koreanCenter = page.getByRole('dialog', { name: '커맨드 센터', exact: true });
  await koreanCenter.getByRole('combobox').fill('삽입');
  for (const name of ['인용 삽입…', '상호 참조 삽입…']) {
    assert(await koreanCenter.getByRole('option', { name, exact: true }).isVisible(), `${name}: Korean insertion command is searchable`);
  }
  await page.keyboard.press('Escape');
  await koreanCenter.waitFor({ state: 'detached' });
  return { commandInsertion: true, slashInsert: true, formInsert: true, editRemove: true, undoRedo: true, saveReload: true, nestedInline: true, citationOnlyList: true, nestedReferenceRename: true, bibHash };
}
