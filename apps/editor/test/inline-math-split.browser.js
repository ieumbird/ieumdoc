// Run with pnpm exec playwright-cli run-code --filename=apps/editor/test/inline-math-split.browser.js.
// Splits paragraphs with Enter at a caret right after inline math (plain, inside bold and inside a
// link), saves and reloads a real file, and checks both paragraphs and their inline math exactly.
// Inline math is one offset position in Core; the Host must split at the same position.
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
  const file = [root, 'tmp', 'inline-math', 'split.md'].join(separator);
  const markdown = async () => {
    const response = await page.request.get(`${origin}/document/split.md?path=${encodeURIComponent(file)}`);
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
  const sources = () => page.evaluate(() => {
    const values = [];
    document.querySelector('.ProseMirror').editor.state.doc.descendants(node => {
      if (node.type.name === 'inlineMath') values.push(node.attrs.value);
    });
    return values;
  });
  // Put the caret right after (or before) an inline math node, then press the real Enter key.
  const enterNextTo = async (value, after) => {
    await page.evaluate(({value, after}) => {
      const instance = document.querySelector('.ProseMirror').editor;
      let caret;
      instance.state.doc.descendants((node, position) => {
        if (caret === undefined && node.type.name === 'inlineMath' && node.attrs.value === value) {
          caret = after ? position + node.nodeSize : position;
        }
      });
      if (caret === undefined) throw new Error(`inline math not found: ${value}`);
      instance.commands.setTextSelection(caret);
      instance.view.focus();
    }, {value, after});
    // The key must reach the editor: wait until it owns DOM focus.
    await page.waitForFunction(() => document.activeElement?.classList.contains('ProseMirror'));
    await page.keyboard.press('Enter');
  };

  const before = await markdown();
  if (!before.startsWith('The current $i_d$, then more.')) throw new Error('Scratch document is not a fresh split.md copy');
  const result = {};
  await open();
  const paragraphs = await editor.locator('p.paragraph').count();
  await enterNextTo('i_d', true);
  await enterNextTo('x', false);
  await enterNextTo('a', true);
  await enterNextTo('b', true);
  await enterNextTo('c', true);
  result.splitInEditor = await editor.locator('p.paragraph').count() === paragraphs + 5;

  await page.getByRole('button', {name:'Save', exact:true}).click();
  await page.getByText('Saved', {exact:true}).waitFor();
  const saved = await markdown();
  result.canonicalMarkdown = saved === [
    'The current {math}`i_d`',
    '',
    ', then more.',
    '',
    'Value:&#x20;',
    '',
    '{math}`x` end.',
    '',
    '**Bold {math}`a`**',
    '',
    ', and [see {math}`b`](u)',
    '',
    '[-now](u).',
    '',
    'Go [see {math}`c`](u)',
    '',
    '[-now](u).',
    '',
  ].join('\n');

  await open();
  result.reloadedParagraphs = await editor.locator('p.paragraph').count() === paragraphs + 5;
  result.reloadedMath = JSON.stringify(await sources()) === JSON.stringify(['i_d', 'x', 'a', 'b', 'c']) &&
    await editor.locator('strong').getByTestId('inline-math').count() === 1 &&
    await editor.locator('a[href="u"]').getByTestId('inline-math').count() === 2;

  result.consoleErrors = problems;
  const failed = Object.entries(result).filter(([key, value]) => key !== 'consoleErrors' && value !== true);
  if (failed.length > 0 || problems.length > 0) {
    throw new Error(`Inline math split failed: ${JSON.stringify(result)}\n${saved}`);
  }
  return result;
}
