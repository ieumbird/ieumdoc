// Reference a heading: the slash menu labels it, the chip shows and goes to the heading, Save → Reload.
async page => {
  await page.unrouteAll();
  await page.reload();
  const ready = () => page.locator('[data-testid="status"][data-operation="Ready"]').waitFor({state:'attached'});
  await ready();
  const origin = page.url().split('/').slice(0, 3).join('/');
  const defaultPath = (await (await page.request.get(`${origin}/api/document`)).json()).path;
  const sep = defaultPath.includes('\\') ? '\\' : '/';
  const root = defaultPath.split(sep).slice(0, -4).join(sep);
  const file = [root, 'tmp', 'section-reference', 'sections.md'].join(sep);
  const read = async () => (await (await page.request.get(`${origin}/api/document?path=${encodeURIComponent(file)}`)).json()).source;
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  await page.getByRole('button', {name:'Open…'}).click();
  await page.getByTestId('file-path').fill(file);
  await page.getByRole('dialog').getByRole('button', {name:'Open', exact:true}).click();
  await ready();
  await page.getByRole('dialog').waitFor({state:'detached'});
  const opened = await read();
  const editor = page.locator('.document-editor');
  const chip = page.getByTestId('cross-reference');
  const labels = () => page.getByTestId('label-target').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-label')));
  const focused = () => page.waitForFunction(() => document.querySelector('.document-editor').editor.view.hasFocus());
  const result = {};

  // Type `/` at the end of a paragraph and pick an unlabeled heading: one step labels it and references it.
  await page.evaluate(() => {
    const editor = document.querySelector('.document-editor').editor;
    let end;
    editor.state.doc.forEach((node, position) => { if (node.textContent === 'See the install section.') end = position + node.nodeSize - 1; });
    editor.commands.setTextSelection(end);
    editor.view.focus();
  });
  await page.keyboard.type(' /install');
  await page.getByRole('menuitem', {name:'Section reference: Install'}).click();
  await chip.waitFor();
  assert(await chip.getAttribute('data-resolved') === 'true' && (await chip.innerText()).includes('Install'), 'Section reference does not show its heading');
  assert(JSON.stringify(await labels()) === JSON.stringify(['sec-install']), 'Heading was not labeled: ' + JSON.stringify(await labels()));
  await focused();
  await page.keyboard.press('Control+z');
  await chip.waitFor({state:'detached'});
  assert((await labels()).length === 0, 'Undo kept the label');
  await page.keyboard.press('Control+Shift+z');
  await chip.waitFor();
  result.labelAndReferenceInOneStep = JSON.stringify(await labels()) === JSON.stringify(['sec-install']);

  // The chip goes to its heading.
  await chip.locator('.cross-reference-chip').click();
  await page.waitForFunction(() => {
    const { selection } = document.querySelector('.document-editor').editor.state;
    return selection.$from.parent.type.name === 'heading' && selection.$from.parent.textContent === 'Install';
  });
  result.goesToHeading = true;

  // MyST reads only ASCII target labels; the form says so before anything is saved.
  // A section label is hidden at rest and shows with its heading.
  const edit = page.getByTestId('label-target-edit');
  assert(await edit.evaluate(node => getComputedStyle(node.parentElement).opacity) === '0', 'Section label is visible at rest');
  await editor.locator('h2').filter({hasText:/^Install$/}).hover();
  await edit.click();
  await page.getByTestId('label-target-input').fill('설치');
  await page.getByTestId('label-target-apply').click();
  await page.getByTestId('label-target-properties').getByText(/ASCII/).waitFor();
  await page.getByTestId('label-target-cancel').click();
  result.labelRules = JSON.stringify(await labels()) === JSON.stringify(['sec-install']);

  // A heading's block menu labels it without referencing it; a Korean heading gets a numbered label.
  const index = await editor.evaluate(element => {
    let found = -1;
    element.editor.state.doc.forEach((node, _pos, at) => { if (found < 0 && node.textContent === '개요') found = at; });
    return found + 1;
  });
  await editor.locator('h2').filter({hasText:/^개요$/}).hover();
  await page.getByRole('button', {name:`Move heading block ${index}`, exact:true}).click();
  await page.getByRole('menuitem', {name:'Add section label', exact:true}).click();
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="label-target"]').length === 2);
  result.blockMenuLabel = JSON.stringify(await labels()) === JSON.stringify(['sec-install', 'sec-1']);

  await page.locator('.top-bar [data-testid="save"]').click();
  await page.locator('[data-testid="status"][data-operation="Saved"]').waitFor({state:'attached'});
  const saved = await read();
  const expected = opened.replace('## Install', '(sec-install)=\n\n## Install').replace('See the install section.', 'See the install section. {ref}`sec-install`')
    .replace('## 개요', '(sec-1)=\n\n## 개요');
  assert(saved === expected, 'Saved Markdown differs: ' + JSON.stringify({saved, expected}));
  await page.getByRole('button', {name:'Reload', exact:true}).click();
  await ready();
  await chip.waitFor();
  result.saveReload = await chip.getAttribute('data-resolved') === 'true' && JSON.stringify(await labels()) === JSON.stringify(['sec-install', 'sec-1']);
  for (const [name, passed] of Object.entries(result)) assert(passed, `${name} failed`);
  return result;
}
