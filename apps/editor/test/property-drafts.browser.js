// Independent property drafts keep dirty status, focus and discard protection.
async (page, { openDocument }) => {
  await page.unrouteAll();
  await page.reload();
  const ready = () => page.locator('[data-testid="status"][data-operation="Ready"]').waitFor({state:'attached'});
  await ready();
  const origin = page.url().split('/').slice(0,3).join('/');
  const initial = await (await page.request.get(`${origin}/api/document`)).json();
  const sep = initial.path.includes('\\') ? '\\' : '/';
  const file = [...initial.path.split(sep).slice(0,-4), 'tmp', 'property-drafts', 'drafts.md'].join(sep);
  await openDocument(page, file);
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
  // Base UI moves focus into the properties after they open.
  const focused = testId => page.waitForFunction(id => document.activeElement?.getAttribute('data-testid') === id, testId, {timeout:2000})
    .then(() => true, () => false);
  // Closing a form returns keyboard focus to the editor at its block, without a document change.
  const focusedBlock = () => editor.evaluate(element => {
    const {selection} = element.editor.state;
    return element.editor.view.hasFocus() ? (selection.node ?? selection.$from.node(1))?.type.name : null;
  });
  const table = page.locator('[data-block="table"]');
  const beginTable = async () => { await table.hover(); await activate(table.getByRole('button', {name:'Edit table', exact:true})); };


  await editor.locator('h2').hover();
  await page.getByTestId('label-target-edit').click();
  check(await focused('label-target-input'), 'Edit did not focus the section label');
  await page.getByTestId('label-target-input').fill('section-draft');
  await dirty();
  await page.getByRole('button', {name:'File actions', exact:true}).click();
  await page.getByRole('menuitem', {name:'Reload', exact:true}).click();
  await page.getByRole('dialog', {name:'Discard local changes?'}).waitFor();
  await page.getByRole('button', {name:'Keep editing', exact:true}).click();
  check(await page.getByTestId('label-target-input').inputValue() === 'section-draft', 'Reload discarded section draft');
  await beginTable();
  check(await focused('table-caption-input'), 'Edit did not focus the table caption');
  await page.getByTestId('table-caption-input').fill('Table draft');
  await activate(page.getByTestId('label-target-cancel'));
  await dirty();
  check(await page.getByTestId('table-caption-input').inputValue() === 'Table draft', 'Closing one kind lost another');
  await activate(page.getByTestId('table-cancel'));
  await page.getByTestId('draft-notice').waitFor({state:'detached'});
  check(await json() === baseline && await page.getByTestId('status').innerText() === '', 'Cancel changed document or leaked registration');
  check(await focusedBlock() === 'table', 'Cancel did not return focus to the table');
  await beginTable();
  check(await focused('table-caption-input'), 'Edit did not focus the table caption');
  await page.keyboard.press('Escape');
  await page.getByTestId('table-editor').waitFor({state:'detached'});
  await editor.locator('h2').hover();
  await page.getByTestId('label-target-edit').click();
  check(await focused('label-target-input'), 'Edit did not focus the section label');
  await page.keyboard.press('Escape');
  await page.getByTestId('label-target-editor').waitFor({state:'detached'});
  check(await focusedBlock() === 'labelTarget' && await json() === baseline && await page.getByTestId('status').innerText() === '',
    'Escape did not return focus to its block, or changed the document');

  return {multipleKinds:true, reload:true, beforeunload:true, focus:true};
}
