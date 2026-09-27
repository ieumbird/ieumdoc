// Run with pnpm exec playwright-cli run-code --filename=apps/editor/test/admonition-authoring.browser.js.
// Edits simple admonition bodies through the real Editor, saves and reloads a scratch file, and
// checks that variants, inline semantics, unsupported admonitions and surrounding blocks survive.
// The file is a scratch copy under the repository's ignored tmp/ directory; prepare it first with
// `pnpm browser:prepare` (see docs/test/TEST_GUIDE.md). The scenario writes that copy only.
async page => {
  const problems = [];
  page.on('console', message => { if (message.type() === 'error') problems.push(message.text()); });
  await page.unrouteAll();
  await page.reload();
  await page.locator('[data-testid="status"][data-operation="Ready"]').waitFor({state:'attached'});

  const origin = page.url().split('/').slice(0, 3).join('/');
  const defaultPath = (await (await page.request.get(`${origin}/api/document`)).json()).path;
  const separator = defaultPath.includes('\\') ? '\\' : '/';
  const root = defaultPath.split(separator).slice(0, -4).join(separator);
  const file = [root, 'tmp', 'admonition-authoring', 'authoring.md'].join(separator);
  const markdown = async () => {
    const response = await page.request.get(`${origin}/document/authoring.md?path=${encodeURIComponent(file)}`);
    if (response.status() !== 200) throw new Error(`Prepare ${file} first`);
    return (await response.text()).replaceAll('\r\n', '\n');
  };
  const open = async () => {
    await page.reload();
    await page.locator('[data-testid="status"][data-operation="Ready"]').waitFor({state:'attached'});
    await page.getByRole('button', {name:'Open…'}).click();
    await page.getByTestId('file-path').fill(file);
    await page.getByRole('dialog').getByRole('button', {name:'Open', exact:true}).click();
    await page.locator('[data-testid="status"][data-operation="Ready"]').waitFor({state:'attached'});
  };
  const editor = page.getByTestId('document-editor');
  const admonitions = () => editor.locator('aside[data-block="admonition"]');
  const selectText = async needle => {
    await page.evaluate(needle => {
      const instance = document.querySelector('.ProseMirror').editor;
      let range;
      instance.state.doc.descendants((node, position) => {
        if (range || !node.isText) return;
        const index = node.text.indexOf(needle);
        if (index >= 0) range = { from: position + index, to: position + index + needle.length };
      });
      if (!range) throw new Error(`text not found: ${needle}`);
      instance.commands.setTextSelection(range);
      instance.view.focus();
    }, needle);
    await page.getByTestId('selection-toolbar').waitFor();
  };

  const before = await markdown();
  if (!before.startsWith('# Admonition authoring')) throw new Error('Scratch document is not a fresh authoring.md copy');
  const result = {};
  await open();
  result.admonitionCount = await admonitions().count() === 6;
  result.onlySimpleNoteWarningEditable = await editor.locator('aside[data-block="admonition"][data-readonly="false"]').count() === 2;
  result.variantsInitially = JSON.stringify(await admonitions().evaluateAll(nodes => nodes.map(node => node.dataset.variant))) ===
    JSON.stringify(['warning', 'note', 'note', 'warning', 'note', 'tip']);

  await selectText('Before');
  await page.keyboard.type('After');
  await selectText('simple');
  await page.getByRole('button', {name:'Bold', exact:true}).click();

  await page.getByRole('button', {name:'Save', exact:true}).click();
  await page.getByText('Saved', {exact:true}).waitFor();
  const saved = await markdown();
  result.canonicalMarkdown = saved === [
    '# Admonition authoring',
    '',
    'Intro paragraph.',
    '',
    ':::{warning}',
    'After **bold** and *italic*, [manual](https://a.example), {math}`x`\\',
    'after the break.',
    ':::',
    '',
    ':::{note}',
    'A **simple** note.',
    ':::',
    '',
    ':::{admonition} Custom title',
    'Title body remains read-only.',
    ':::',
    '',
    ':::{warning}',
    ':class: custom',
    '',
    'Option body remains read-only.',
    ':::',
    '',
    ':::{note}',
    'First paragraph.',
    '',
    'Second paragraph.',
    ':::',
    '',
    ':::{tip}',
    'Custom variant remains read-only.',
    ':::',
    '',
    'End paragraph.',
    '',
  ].join('\n');

  await open();
  const blocks = admonitions();
  result.reloadedVariants = JSON.stringify(await blocks.evaluateAll(nodes => nodes.map(node => node.dataset.variant))) ===
    JSON.stringify(['warning', 'note', 'note', 'warning', 'note', 'tip']);
  result.reloadedInlineSemantics = await blocks.nth(0).locator('strong').count() === 1 &&
    await blocks.nth(0).locator('em').count() === 1 &&
    await blocks.nth(0).locator('a[href="https://a.example"]').count() === 1 &&
    await blocks.nth(0).getByTestId('inline-math').count() === 1 &&
    await blocks.nth(0).locator('br').count() === 1 &&
    await blocks.nth(1).locator('strong', {hasText:'simple'}).count() === 1;
  result.unsupportedRemainReadOnly = await editor.locator('aside[data-block="admonition"][data-readonly="true"]').count() === 4 &&
    await blocks.nth(2).getByText('Title body remains read-only.').count() === 1 &&
    await blocks.nth(3).getByText('Option body remains read-only.').count() === 1 &&
    await blocks.nth(4).getByText('Second paragraph.').count() === 1 &&
    await blocks.nth(5).getByText('Custom variant remains read-only.').count() === 1;
  result.otherBlocksPreserved = await editor.locator('h1', {hasText:'Admonition authoring'}).count() === 1 &&
    await editor.locator('p.paragraph', {hasText:'Intro paragraph.'}).count() === 1 &&
    await editor.locator('p.paragraph', {hasText:'End paragraph.'}).count() === 1;

  const savedBeforeInvalidEdit = await markdown();
  await page.evaluate(() => {
    const instance = document.querySelector('.ProseMirror').editor;
    let position;
    instance.state.doc.descendants((node, pos) => {
      if (position === undefined && node.type.name === 'inlineMath') position = pos;
    });
    if (position === undefined) throw new Error('inline math not found');
    instance.view.dispatch(instance.state.tr.setNodeAttribute(position, 'value', `${String.fromCharCode(10)}x`));
  });
  await page.getByRole('button', {name:'Save', exact:true}).click();
  await page.getByText('Save failed', {exact:true}).waitFor();
  result.failedEditDidNotWrite = await markdown() === savedBeforeInvalidEdit;

  result.consoleErrors = problems.filter(message => !message.includes('Failed to load resource'));
  const failed = Object.entries(result).filter(([key, value]) => key !== 'consoleErrors' && value !== true);
  if (failed.length > 0 || result.consoleErrors.length > 0) {
    throw new Error(`Admonition authoring failed: ${JSON.stringify(result)}\n${saved}`);
  }
  return result;
}
