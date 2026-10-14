// Core rejection reaches Open/Reload without replacing the active editor or its drafts.
async (page, { openDocument }) => {
  await page.unrouteAll();
  await page.reload();
  const ready = () => page.locator('[data-testid="status"][data-operation="Ready"]').waitFor({state:'attached'});
  await ready();
  const origin = page.url().split('/').slice(0, 3).join('/');
  const initial = await (await page.request.get(`${origin}/api/document`)).json();
  const sep = initial.path.includes('\\') ? '\\' : '/';
  const rejectedPath = [...initial.path.split(sep).slice(0,-4), 'tmp', 'writeability-preflight', 'blocked-markdown.md'].join(sep);
  const assert = (ok, message) => { if (!ok) throw Error(message); };
  const rejected = await page.request.get(`${origin}/api/document?path=${encodeURIComponent(rejectedPath)}`);
  const refusal = await rejected.json();
  assert(rejected.status() === 400 && refusal.code === 'native-marker' && !refusal.document, 'Core admission error was not propagated');
  const editor = page.locator('.document-editor');
  const snapshot = () => editor.evaluate(el => JSON.stringify({doc:el.editor.getJSON(), selection:el.editor.state.selection.toJSON()}));
  const activePath = await page.getByTestId('current-file').getAttribute('title');
  const before = await snapshot();
  await openDocument(page, rejectedPath);
  await page.getByText(refusal.error, {exact:true}).first().waitFor();
  assert(await page.getByTestId('current-file').getAttribute('title') === activePath, 'Rejected Open installed another document');
  assert(await snapshot() === before, 'Rejected Open changed the document or selection');

  const paragraph = editor.locator('p.paragraph').filter({hasText:'The current reference is calculated'});
  await paragraph.click(); await page.keyboard.press('End'); await page.keyboard.type(' Unsaved.');
  const equation = page.locator('[data-block="equation"]').first();
  await equation.hover(); await equation.getByRole('button', {name:'Edit', exact:true}).click();
  await page.getByTestId('equation-latex').fill('x + draft');
  const local = await snapshot();
  // The on-disk file has become unsupported: replay its real Core error at the same locator.
  await page.route('**/api/document?*', route => route.request().method() === 'GET'
    ? route.fulfill({status:400, json:refusal}) : route.continue());
  try {
    await page.getByRole('button', {name:'File actions', exact:true}).click();
    await page.getByRole('menuitem', {name:'Reload', exact:true}).click();
    await page.getByRole('button', {name:'Discard and reload', exact:true}).click();
    await page.getByRole('dialog', {name:'Discard local changes?'}).waitFor({state:'detached'});
    await page.getByText(refusal.error, {exact:true}).first().waitFor();
    assert(await snapshot() === local, 'Rejected Reload discarded local document or selection');
    assert(await page.getByTestId('equation-latex').inputValue() === 'x + draft', 'Rejected Reload discarded the unapplied draft');
    assert(await page.getByTestId('status').innerText() === 'Open failed', 'Rejected Reload did not report failure');
  } finally { await page.unroute('**/api/document?*'); }
  await page.getByTestId('equation-cancel').click();
  await page.getByRole('button', {name:'File actions', exact:true}).click();
  await page.getByRole('menuitem', {name:'Reload', exact:true}).click();
  await page.getByRole('dialog', {name:'Discard local changes?'}).waitFor();
  await page.getByRole('button', {name:'Keep editing', exact:true}).click();

  // Initial admission failure has no document installed.
  await page.route('**/api/document', route => route.fulfill({status:400, json:refusal}));
  await page.reload();
  await page.getByText(refusal.error, {exact:true}).first().waitFor();
  assert(await editor.count() === 0, 'Initial failure installed an editor');
  await page.unroute('**/api/document');
  await page.reload(); await ready();
  return {openPreservesState:true, reloadPreservesInputAndDraft:true, initialFailureHasNoDocument:true};
}
