// Run with pnpm browser:test list-authoring.
// Edits list items with the keyboard (Enter, Tab, Enter on an empty item), inserts a numbered
// list from the slash menu, saves a scratch Markdown file, and reloads it.
async page => {
  await page.unrouteAll();
  await page.reload();
  await page.waitForFunction(() => document.querySelector('[data-testid="status"]')?.getAttribute('data-operation') === 'Ready');

  const origin = page.url().split('/').slice(0, 3).join('/');
  const defaultPath = (await (await page.request.get(`${origin}/api/document`)).json()).path;
  const separator = defaultPath.includes('\\') ? '\\' : '/';
  const root = defaultPath.split(separator).slice(0, -4).join(separator);
  const file = [root, 'tmp', 'list-authoring', 'lists.md'].join(separator);
  const markdown = async () => {
    const response = await page.request.get(`${origin}/document/lists.md?path=${encodeURIComponent(file)}`);
    if (response.status() !== 200) throw new Error(`Prepare ${file} first`);
    return (await response.text()).replaceAll('\r\n', '\n');
  };
  const fresh = '# Lists\n\nIntro paragraph.\n\n- Wire\n- Power\n\nDone.\n';
  if (await markdown() !== fresh) throw new Error('Scratch document is not a fresh list fixture');

  const openScratch = async () => {
    await page.getByRole('button', {name:'Open…'}).click();
    await page.getByTestId('file-path').fill(file);
    await page.getByRole('dialog').getByRole('button', {name:'Open', exact:true}).click();
    await page.waitForFunction(() =>
      document.querySelector('[data-testid="status"]')?.getAttribute('data-operation') === 'Ready' &&
      document.querySelector('[data-testid="current-file"]')?.getAttribute('title')?.includes('lists.md'));
  };
  // Place the caret after a text block's content, like continuous-editing; keys are real.
  const caretAtEnd = async (text) => page.locator('.document-editor').evaluate((element, text) => {
    const editor = element.editor;
    let position;
    editor.state.doc.descendants((node, pos) => {
      if (position === undefined && node.isTextblock && node.textContent === text) position = pos + 1 + node.content.size;
    });
    if (position === undefined) throw new Error(`Missing text block ${text}`);
    editor.commands.setTextSelection(position);
    editor.view.focus();
  }, text);

  await openScratch();
  const editor = page.getByTestId('document-editor');
  const list = editor.locator('ul[data-block="list"]').first();
  await list.waitFor({state:'visible'});
  const openedEditable = await list.locator(':scope > li').count() === 2;

  // Enter after "Wire" starts a new item; Tab nests it below "Wire".
  await caretAtEnd('Wire');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Check');
  await page.keyboard.press('Tab');
  const nested = list.locator(':scope > li').first().locator('ul[data-block="list"] > li');
  await nested.waitFor({state:'visible'});
  const tabNested = await nested.count() === 1 && await nested.innerText() === 'Check';

  // Enter twice after "Power": the empty item leaves the list as a paragraph.
  await caretAtEnd('Power');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('After list');
  const exitedList = await list.locator(':scope > li').count() === 2 &&
    await editor.locator(':scope .document-editor > p', {hasText:'After list'}).count() === 1;

  // The slash menu inserts a numbered list after the intro.
  await caretAtEnd('Intro paragraph.');
  await page.keyboard.press('Enter');
  await page.keyboard.type('/numbered');
  await page.getByRole('menu', {name:'Insert block'}).getByRole('menuitem', {name:'Numbered list', exact:true}).waitFor({state:'visible'});
  await page.keyboard.press('Enter');
  await page.keyboard.type('First');
  const numbered = editor.locator('ol[data-block="list"] > li');
  await numbered.waitFor({state:'visible'});
  await page.waitForFunction(() => document.querySelector('[data-testid="status"]')?.textContent?.trim() === 'Unsaved changes');

  await page.getByRole('button', {name:'Save', exact:true}).click();
  await page.locator('[data-testid="status"]:is([data-operation="Saved"], [data-operation="Save failed"])').waitFor({state:'attached'});
  if (await page.getByTestId('status').getAttribute('data-operation') !== 'Saved') {
    throw new Error(`Save failed: ${await page.locator('body').innerText()}`);
  }
  const saved = await markdown();
  const expected = [
    '# Lists',
    '',
    'Intro paragraph.',
    '',
    '1.  First',
    '',
    '*   Wire',
    '',
    '    *   Check',
    '*   Power',
    '',
    'After list',
    '',
    'Done.',
    '',
  ].join('\n');

  await page.reload();
  await page.waitForFunction(() => document.querySelector('[data-testid="status"]')?.getAttribute('data-operation') === 'Ready');
  await openScratch();
  const reloaded = page.getByTestId('document-editor');
  await reloaded.locator('ul[data-block="list"]').first().waitFor({state:'visible'});
  const result = {
    openedEditable,
    tabNested,
    exitedList,
    savedAsCanonicalMarkdown: saved === expected,
    reloadedNumbered: await reloaded.locator('ol[data-block="list"] > li').innerText() === 'First',
    reloadedNested: await reloaded.locator('ul[data-block="list"] ul[data-block="list"] > li').innerText() === 'Check',
  };
  const failed = Object.entries(result).filter(([, value]) => value !== true);
  if (failed.length > 0) throw new Error(`List authoring failed: ${JSON.stringify({result, saved})}`);
  return result;
}
