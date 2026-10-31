// Core-unsupported Markdown opens as text; actual Host failures retain existing work.
async (page, { openDocument }) => {
  await page.unrouteAll();
  await page.reload();
  const ready = () => page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
  await ready();
  const origin = page.url().split('/').slice(0, 3).join('/');
  const initial = await (await page.request.get(`${origin}/api/document`)).json();
  const sep = initial.path.includes('\\') ? '\\' : '/';
  const rejectedPath = [...initial.path.split(sep).slice(0,-4), 'tmp', 'writeability-preflight', 'blocked-markdown.md'].join(sep);
  const assert = (ok, message) => { if (!ok) throw Error(message); };
  const rejected = await page.request.get(`${origin}/api/document?path=${encodeURIComponent(rejectedPath)}`);
  const textFile = await rejected.json();
  assert(rejected.status() === 200 && textFile.kind === 'text' && !textFile.document, 'Unsupported Markdown was not classified as text');
  const refusal = { code:'native-marker', error:'Host admission failed', issue:{ reason:'Host admission failed', action:'Review the file.' } };
  const editor = page.locator('[data-document-tab][data-active=true] .document-editor');
  const snapshot = () => editor.evaluate(el => JSON.stringify({doc:el.editor.getJSON(), selection:el.editor.state.selection.toJSON()}));
  const activePath = await page.getByTestId('current-file').getAttribute('title');
  const before = await snapshot();
  const alert = page.getByRole('dialog', {name:'Cannot open document', exact:true});
  const writes = [];
  page.on('request', request => { if (request.method() !== 'GET' && request.url().split('?')[0].endsWith('/api/document')) writes.push(request); });
  const assertAlert = async (name, failure) => {
    await alert.waitFor();
    const text = await alert.innerText();
    assert(text.includes(name) && text.includes(failure.issue.reason) && text.includes(failure.issue.action), 'Open Alert lost the filename, Core reason or action');
    assert(text.includes('Your current document has not changed.'), 'Open Alert did not explain state retention');
    assert(await page.getByTestId('error').count() === 0, 'Open Alert duplicated the top error');
    assert(await alert.getByRole('button').count() === 1, 'Open Alert needs one confirmation button');
    await page.keyboard.press('Control+s'); await page.evaluate(() => new Promise(requestAnimationFrame));
    assert(writes.length === 0, 'Save request escaped the Open Alert');
  };
  for (const name of ['blocked-markdown.md', 'unsupported-syntax.md']) {
    const file = rejectedPath.replace('blocked-markdown.md', name);
    await openDocument(page, file);
    await page.getByTestId('text-editor').filter({visible:true}).waitFor();
    assert(await alert.count() === 0, 'Text admission asked for confirmation');
    assert(await page.getByTestId('text-mode-notice').filter({visible:true}).count() === 1, 'Text mode has no explanation');
    await page.getByRole('tab', {name, exact:true}).locator('..').getByRole('button').click();
    await ready();
    assert(await snapshot() === before, 'Opening text changed the retained native editor');
  }

  // A filesystem failure keeps the existing top error, even when its text resembles a native reason.
  await page.route('**/api/document?*', route => route.fulfill({status:403, json:{error:'Permission denied. A native document requires leading frontmatter with litzio: 1'}}));
  try {
    await page.getByRole('treeitem', {name:'blocked-markdown.md',exact:true}).click();
    await page.getByTestId('error').filter({hasText:'Permission denied.'}).waitFor();
    assert(await alert.count() === 0, 'Non-native failure showed the Open Alert');
    assert(await snapshot() === before, 'Filesystem failure changed the editor');
  } finally { await page.unroute('**/api/document?*'); }

  const paragraph = editor.locator('p.paragraph').filter({hasText:'The current reference is calculated'});
  await paragraph.click(); await page.keyboard.press('End'); await page.keyboard.type(' Unsaved.');
  const equation = page.locator('[data-document-tab][data-active=true] [data-block="equation"]').first();
  await equation.hover(); await equation.getByRole('button', {name:'Edit', exact:true}).click();
  await page.getByTestId('equation-edit-source').click();
  await page.getByTestId('equation-latex').fill('x + draft');
  const local = await snapshot();
  // Failed Open adds no tab and preserves current applied work and property drafts.
  const tabCount = await page.getByRole('tab').count();
  let reads = 0;
  await page.route('**/api/document?*', route => { reads++; return route.fulfill({status:400, json:refusal}); });
  try {
    await page.getByRole('treeitem', {name:'blocked-markdown.md',exact:true}).click();
    await assertAlert('blocked-markdown.md', refusal);
    assert(reads === 1 && await page.getByRole('tab', {includeHidden:true}).count() === tabCount, 'Failed Open added a tab or skipped the Host');
    assert(await page.getByRole('dialog', {name:'Save changes?',exact:true}).count() === 0 && await page.getByTestId('error').count() === 0, 'Open failure duplicated confirmation/error surfaces');
    assert(await snapshot() === local && await page.getByTestId('equation-latex').inputValue() === 'x + draft', 'Failed Open discarded local work');
    await alert.getByRole('button', {name:'OK',exact:true}).click();
    await alert.waitFor({state:'detached'});
    assert(await page.getByRole('treeitem', {name:'blocked-markdown.md',exact:true}).evaluate(el => el === document.activeElement), 'Failed Open lost its focus return');
  } finally { await page.unroute('**/api/document?*'); }
  // The on-disk file has become unsupported: replay its real Core error at the same locator.
  await page.route('**/api/document?*', route => route.request().method() === 'GET'
    ? route.fulfill({status:400, json:refusal}) : route.continue());
  try {
    await page.getByRole('button', {name:'File actions', exact:true}).click();
    await page.getByRole('menuitem', {name:'Reload', exact:true}).click();
    await page.getByRole('button', {name:'Discard and reload', exact:true}).click();
    await page.getByRole('dialog', {name:'Discard local changes?'}).waitFor({state:'detached'});
    await page.getByText(refusal.error, {exact:true}).filter({visible:true}).first().waitFor();
    assert(await alert.count() === 0, 'Reload changed to Open Alert behavior');
    assert(await snapshot() === local, 'Rejected Reload discarded local document or selection');
    assert(await page.getByTestId('equation-latex').inputValue() === 'x + draft', 'Rejected Reload discarded the unapplied draft');
    assert(await page.getByTestId('status').innerText() === 'Open failed', 'Rejected Reload did not report failure');
  } finally { await page.unroute('**/api/document?*'); }
  await page.getByTestId('equation-cancel').click();
  await page.getByRole('button', {name:'File actions', exact:true}).click();
  await page.getByRole('menuitem', {name:'Reload', exact:true}).click();
  await page.getByRole('dialog', {name:'Discard local changes?'}).waitFor();
  await page.getByRole('button', {name:'Keep editing', exact:true}).click();

  // Exercise an actual default fallback, without higher-priority remembered tabs.
  await page.evaluate(() => localStorage.removeItem('ieumdoc.openTabs'));
  // Initial admission failure has no document installed.
  await page.route('**/api/document', route => route.fulfill({status:400, json:refusal}));
  await page.reload();
  await page.getByText(refusal.error, {exact:true}).filter({visible:true}).first().waitFor();
  assert(await editor.count() === 0, 'Initial failure installed an editor');
  await page.unroute('**/api/document');

  // Start without a document, then exercise a Host refusal at the sample entry.
  await page.route('**/api/document', route => route.fulfill({json:{start:true, samples:{ko:rejectedPath,en:rejectedPath}}}));
  await page.reload();
  const sampleButton = page.getByRole('button', {name:'Open sample document', exact:true});
  await page.route('**/api/document?*', route => route.fulfill({status:400,json:refusal}));
  await sampleButton.click();
  await alert.waitFor();
  assert((await alert.innerText()).includes('No document was opened.'), 'Rejected sample claimed an existing document');
  assert(await editor.count() === 0 && await page.getByTestId('notice').count() === 0 && await page.getByTestId('error').count() === 0, 'Rejected sample installed a document or duplicate message');
  await alert.getByRole('button', {name:'OK', exact:true}).click();
  await alert.waitFor({state:'detached'});
  assert(await sampleButton.evaluate(el => document.activeElement === el), 'Rejected sample did not return focus to its button');
  await page.unroute('**/api/document');
  await page.unroute('**/api/document?*');
  await page.reload(); await ready();
  return {openAlertAndFocus:true, nonNativeTopError:true, openPreservesState:true, reloadPreservesInputAndDraft:true, initialFailureHasNoDocument:true};
}
