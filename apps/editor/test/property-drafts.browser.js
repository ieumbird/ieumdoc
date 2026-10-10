// Draft membership by kind + snapshot locator, and source Apply's destructive replacement boundary.
async page => {
  await page.unrouteAll();
  await page.reload();
  const ready = () => page.locator('[data-testid="status"][data-operation="Ready"]').waitFor({state:'attached'});
  await ready();
  const origin = page.url().split('/').slice(0,3).join('/');
  const initial = await (await page.request.get(`${origin}/api/document`)).json();
  const sep = initial.path.includes('\\') ? '\\' : '/';
  const file = [...initial.path.split(sep).slice(0,-4), 'tmp', 'property-drafts', 'drafts.md'].join(sep);
  await page.getByRole('button', {name:'Open file…'}).click();
  await page.getByTestId('file-path').fill(file);
  await page.getByRole('dialog').getByRole('button', {name:'Open', exact:true}).click();
  await ready();
  await page.getByRole('dialog').waitFor({state:'detached'});
  const editor = page.locator('.document-editor');
  const json = () => editor.evaluate(element => JSON.stringify(element.editor.getJSON()));
  const baseline = await json();
  const check = (ok, reason) => { if (!ok) throw Error(reason); };
  const dirty = async () => {
    await page.waitForFunction(() => document.querySelector('[data-testid="status"]').textContent === 'Unsaved changes');
    check(await page.getByTestId('status').innerText() === 'Unsaved changes', 'Draft was omitted from dirty status');
    check(await page.evaluate(() => {
      const event = new Event('beforeunload', {cancelable:true}); window.dispatchEvent(event); return event.defaultPrevented;
    }), 'Draft was omitted from beforeunload');
  };
  const activate = async button => { await button.focus(); await button.press("Enter"); };
  const table = page.locator('[data-block="table"]');
  const source = table.locator('.original-content');
  const beginTable = async () => { await table.hover(); await activate(table.getByRole('button', {name:'Edit table', exact:true})); };
  const beginSource = async () => {
    if (!await source.evaluate(element => element.open)) await source.locator('summary').click();
    await source.getByTestId('block-source-edit').click();
  };

  await editor.locator('h2').hover();
  await page.getByTestId('label-target-edit').click();
  await page.getByTestId('label-target-input').fill('section-draft');
  await dirty();
  await page.getByRole('button', {name:'Reload', exact:true}).click();
  await page.getByRole('dialog', {name:'Discard local changes?'}).waitFor();
  await page.getByRole('button', {name:'Keep editing', exact:true}).click();
  check(await page.getByTestId('label-target-input').inputValue() === 'section-draft', 'Reload discarded section draft');
  await beginTable();
  await page.getByTestId('table-caption-input').fill('Table draft');
  await activate(page.getByTestId('label-target-cancel'));
  await dirty();
  check(await page.getByTestId('table-caption-input').inputValue() === 'Table draft', 'Closing one kind lost another');
  await activate(page.getByTestId('table-cancel'));
  await page.getByTestId('draft-notice').waitFor({state:'detached'});
  check(await json() === baseline && await page.getByTestId('status').innerText() === '', 'Cancel changed document or leaked registration');

  await beginSource();
  await source.getByTestId('block-source-input').fill('Replacement paragraph.');
  await beginTable();
  await page.getByTestId('table-caption-input').fill('Preserve me');
  await activate(source.getByTestId('block-source-apply'));
  await source.getByTestId('block-source-error').waitFor();
  check(await json() === baseline, 'Source Apply destroyed another draft');
  check(await page.getByTestId('table-caption-input').inputValue() === 'Preserve me', 'Source Apply lost table draft');
  await activate(page.getByTestId('table-cancel'));
  await dirty(); // Same locator, different kind: closing Table must retain Source.
  await activate(source.getByTestId('block-source-cancel'));

  await beginSource();
  await source.getByTestId('block-source-input').fill('Stale source replacement.');
  await beginTable();
  await page.getByTestId('table-caption-input').fill('Applied caption');
  await activate(page.getByTestId('table-apply'));
  const applied = await json();
  await activate(source.getByTestId('block-source-apply'));
  await source.getByTestId('block-source-error').waitFor();
  check(await json() === applied && await page.getByTestId('table-caption').innerText() === 'Applied caption', 'Stale Source Apply overwrote applied table edit');
  await activate(source.getByTestId('block-source-cancel'));
  await editor.evaluate(element => element.editor.view.focus());
  await page.keyboard.press('ControlOrMeta+z');
  check(await json() === baseline, 'Undo did not restore source eligibility');

  let release;
  const responseGate = new Promise(resolve => { release = resolve; });
  let started;
  const requestStarted = new Promise(resolve => { started = resolve; });
  await page.route('**/api/block-source', async route => {
    const response = await route.fetch(); started(); await responseGate; await route.fulfill({response});
  });
  try {
    await beginSource();
    await source.getByTestId('block-source-input').fill('Submitted source.');
    await activate(source.getByTestId('block-source-apply'));
    await requestStarted;
    await source.getByTestId('block-source-input').fill('Newer source.');
    await dirty();
    release();
    await source.getByTestId('block-source-error').waitFor();
    check(await json() === baseline && await source.getByTestId('block-source-input').inputValue() === 'Newer source.', 'Delayed Apply lost newer source input');
    await activate(source.getByTestId('block-source-cancel'));
  } finally { release(); await page.unroute('**/api/block-source'); }
  await page.getByTestId('draft-notice').waitFor({state:'detached'});
  check(await json() === baseline, 'Draft cleanup leaked');
  return {multipleKinds:true, sameLocator:true, staleApply:true, delayedInput:true, reload:true, beforeunload:true};
}
