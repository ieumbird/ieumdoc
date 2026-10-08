// Edit a read-only block's MyST source: refusal, Apply, Undo/Redo, further editing, Save → Reload.
async page => {
  await page.unrouteAll();
  await page.reload();
  const ready = () => page.locator('[data-testid="status"][data-operation="Ready"]').waitFor({state:'attached'});
  await ready();
  const origin = page.url().split('/').slice(0, 3).join('/');
  const defaultPath = (await (await page.request.get(`${origin}/api/document`)).json()).path;
  const sep = defaultPath.includes('\\') ? '\\' : '/';
  const root = defaultPath.split(sep).slice(0, -4).join(sep);
  const file = [root, 'tmp', 'block-source-editing', 'block-source.md'].join(sep);
  const read = async () => (await (await page.request.get(`${origin}/api/document?path=${encodeURIComponent(file)}`)).json()).source;
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  await page.getByRole('button', {name:'Open file…'}).click();
  await page.getByTestId('file-path').fill(file);
  await page.getByRole('dialog').getByRole('button', {name:'Open', exact:true}).click();
  await ready();
  await page.getByRole('dialog').waitFor({state:'detached'});
  const opened = await read();
  const editor = page.locator('.document-editor');
  const image = page.locator('.original-content').filter({hasText:'Markdown image'});
  const editSource = async (original, source) => {
    if (!await original.evaluate(details => details.open)) await original.locator('summary').click();
    await original.getByTestId('block-source-edit').click();
    await original.getByTestId('block-source-input').fill(source);
    await original.getByTestId('block-source-apply').click();
  };
  const result = {};

  await editSource(image, '```\nunclosed');
  await image.getByTestId('block-source-error').waitFor();
  assert((await image.getByTestId('block-source-error').innerText()).includes('not closed'), 'Refusal reason missing');
  assert(await page.getByTestId('status').textContent() !== 'Unsaved changes', 'Refused source changed the document');
  await image.getByTestId('block-source-cancel').click();
  result.refusedWithReason = true;

  await editSource(image, 'The diagram is **important**.');
  const paragraph = editor.locator('p.paragraph', {hasText:'The diagram is important.'});
  await paragraph.waitFor();
  assert(await paragraph.locator('strong').innerText() === 'important', 'Applied source is not projected as formatted text');
  assert(await image.count() === 0, 'Read-only image remains after Apply');
  // Apply returns focus to the editor on the next frame; history keys need it.
  await page.waitForFunction(() => document.querySelector('.document-editor').editor.view.hasFocus());
  await page.keyboard.press('Control+z');
  await image.waitFor();
  assert(await paragraph.count() === 0, 'Undo did not restore the read-only block in one step');
  await page.keyboard.press('Control+Shift+z');
  await paragraph.waitFor();
  result.undoRedo = true;

  await paragraph.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Edited.');
  await editor.locator('p.paragraph', {hasText:'The diagram is important. Edited.'}).waitFor();
  result.furtherVisualEditing = true;

  const tasks = page.locator('.original-content').filter({hasText:'list'});
  await editSource(tasks, '- [x] Draft\n- [x] Review');
  await tasks.locator('summary', {hasText:'Applied source'}).waitFor();
  assert(await tasks.locator('pre').textContent() === '- [x] Draft\n- [x] Review', 'Read-only result does not show the applied source');
  result.readOnlyResult = true;

  await page.locator('.top-bar [data-testid="save"]').click();
  await page.locator('[data-testid="status"][data-operation="Saved"]').waitFor({state:'attached'});
  const saved = await read();
  assert(saved === opened.replace('![Diagram](./diagram.svg)', 'The diagram is **important**. Edited.').replace('*   [ ] Draft', '*   [x] Draft'),
    'Saved Markdown differs: ' + JSON.stringify({opened, saved}));
  await page.getByRole('button', {name:'Reload', exact:true}).click();
  await ready();
  await editor.locator('p.paragraph', {hasText:'The diagram is important. Edited.'}).waitFor();
  assert(await page.locator('.original-content summary', {hasText:'Original line 5'}).count() === 1, 'Reloaded task list lost its source line');
  result.saveReload = true;
  return result;
}
