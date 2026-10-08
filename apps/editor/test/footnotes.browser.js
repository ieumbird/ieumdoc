// Footnotes (#119): numbered reference chips go to their definitions, a paragraph with footnotes
// is edited and saved with every definition where it is written, a definition's own source
// applies unchanged, and removing a footnote's last reference is refused with the reason.
async page => {
  await page.unrouteAll();
  await page.reload();
  const ready = () => page.locator('[data-testid="status"][data-operation="Ready"]').waitFor({state:'attached'});
  await ready();
  const origin = page.url().split('/').slice(0, 3).join('/');
  const defaultPath = (await (await page.request.get(`${origin}/api/document`)).json()).path;
  const sep = defaultPath.includes('\\') ? '\\' : '/';
  const root = defaultPath.split(sep).slice(0, -4).join(sep);
  const file = [root, 'tmp', 'footnotes', 'footnotes.md'].join(sep);
  const read = async () => (await (await page.request.get(`${origin}/api/document?path=${encodeURIComponent(file)}`)).json()).source.replaceAll('\r\n', '\n');
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const open = async () => {
    await page.getByRole('button', {name:'Open file…'}).click();
    await page.getByTestId('file-path').fill(file);
    await page.getByRole('dialog').getByRole('button', {name:'Open', exact:true}).click();
    await ready();
    await page.getByRole('dialog').waitFor({state:'detached'});
  };
  await open();
  const opened = await read();
  const editor = page.locator('.document-editor');
  const chips = editor.getByTestId('footnote-reference');
  const texts = async locator => (await locator.allInnerTexts()).map(text => text.trim());
  const result = {};

  // [^b] is referenced first, so it is footnote 1 although [^a] sorts first.
  assert(JSON.stringify(await texts(chips)) === '["1","2"]', `Chip numbers: ${await texts(chips)}`);
  assert(JSON.stringify(await chips.evaluateAll(nodes => nodes.map(node => node.dataset.label))) === '["b","a"]', 'Chip labels');
  assert(JSON.stringify(await texts(editor.getByTestId('footnote-number'))) === '["1","2"]', 'Definition numbers');
  result.numberedByFirstReference = true;

  await editor.locator('[data-testid="footnote-reference"][data-label="a"] sup').click();
  const selected = await page.evaluate(() => document.querySelector('.document-editor').editor.state.selection.node?.attrs.footnote);
  assert(selected === 'a', `Chip went to ${selected}`);
  result.chipGoesToDefinition = true;

  // The definition's source is its own; applying it unchanged changes nothing.
  const definition = page.locator('.original-content').filter({hasText:'[^a]: Defined later,'});
  await definition.locator('summary').click();
  assert(await definition.locator('pre').textContent() === '[^a]: Defined later,\n    on two lines.', 'Definition source');
  await definition.getByTestId('block-source-edit').click();
  await definition.getByTestId('block-source-apply').click();
  await definition.getByTestId('block-source-input').waitFor({state:'detached'});
  result.definitionSourceApplies = true;
  // Apply returns focus to the editor, with the definition selected, on the next frame.
  await page.waitForFunction(() => document.querySelector('.document-editor').editor.view.hasFocus());

  await editor.locator('p.paragraph', {hasText:'First claim'}).click({position:{x:4, y:8}});
  // The click replaces the definition's node selection a moment later; typing before would replace the block.
  await page.waitForFunction(() => document.querySelector('.document-editor').editor.state.selection.empty);
  await page.keyboard.press('End');
  await page.keyboard.type(' Edited.');
  await page.locator('.top-bar [data-testid="save"]').click();
  await page.locator('[data-testid="status"][data-operation="Saved"]').waitFor({state:'attached'});
  const saved = await read();
  assert(saved === opened.replace('second[^a].', 'second[^a]. Edited.'), 'Saved Markdown differs: ' + JSON.stringify({opened, saved}));
  await page.getByRole('button', {name:'Reload', exact:true}).click();
  await ready();
  assert(JSON.stringify(await texts(chips)) === '["1","2"]', 'Reloaded chips');
  result.editSaveReload = true;

  // Removing the only reference to [^b] would make MyST drop its definition.
  await editor.locator('p.paragraph', {hasText:'First claim'}).click({position:{x:4, y:8}});
  await page.keyboard.press('Home');
  for (let step = 0; step < 'First claim'.length; step++) await page.keyboard.press('ArrowRight');
  // Moving onto the chip selects it from the editor's selection, so let that catch up first.
  await page.waitForFunction(() => document.querySelector('.document-editor').editor.state.selection.$from.parentOffset === 'First claim'.length);
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => document.querySelector('.document-editor').editor.state.selection.node?.type.name === 'footnoteReference');
  await page.keyboard.press('Backspace');
  assert(JSON.stringify(await chips.evaluateAll(nodes => nodes.map(node => node.dataset.label))) === '["a"]', 'Chip not removed');
  await page.locator('.top-bar [data-testid="save"]').click();
  await page.getByText('Save failed', {exact:true}).waitFor();
  assert(/\[\^b\] has no reference/.test(await page.getByTestId('error').innerText()), 'Refusal reason missing');
  assert(await read() === saved, 'Refused save wrote the file');
  result.unreferencedDefinitionRefused = true;
  return result;
}
