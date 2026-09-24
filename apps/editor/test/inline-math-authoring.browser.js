// Run with pnpm exec playwright-cli run-code --filename=apps/editor/test/inline-math-authoring.browser.js.
// Changes, removes and creates inline math in paragraphs of a scratch file, saves and reloads it,
// and checks that display equations and cross-references are unchanged and that an unpreservable
// source fails closed. The file is a scratch copy under the repository's ignored tmp/ directory;
// prepare it first (see docs/test/TEST_GUIDE.md). The scenario writes that copy only.
async page => {
  const problems = [];
  page.on('console', message => { if (message.type() === 'error') problems.push(message.text()); });
  await page.unrouteAll();
  await page.reload();
  await page.getByText('Ready', {exact:true}).waitFor();

  const origin = page.url().split('/').slice(0, 3).join('/');
  const defaultPath = (await (await page.request.get(`${origin}/api/document`)).json()).path;
  const separator = defaultPath.includes('\\') ? '\\' : '/';
  const root = defaultPath.split(separator).slice(0, -4).join(separator);
  const file = [root, 'tmp', 'inline-math', 'math.md'].join(separator);
  const markdown = async () => {
    const response = await page.request.get(`${origin}/document/math.md?path=${encodeURIComponent(file)}`);
    if (response.status() !== 200) throw new Error(`Prepare ${file} first`);
    return (await response.text()).replaceAll('\r\n', '\n');
  };
  const open = async () => {
    await page.reload();
    await page.getByText('Ready', {exact:true}).waitFor();
    await page.getByRole('button', {name:'Open…'}).click();
    await page.getByTestId('file-path').fill(file);
    await page.getByRole('dialog').getByRole('button', {name:'Open', exact:true}).click();
    await page.getByText('Ready', {exact:true}).waitFor();
  };
  const editor = page.getByTestId('document-editor');
  // The inline math sources in document order, read from the editor state.
  const sources = () => page.evaluate(() => {
    const values = [];
    document.querySelector('.ProseMirror').editor.state.doc.descendants(node => {
      if (node.type.name === 'inlineMath') values.push(node.attrs.value);
    });
    return values;
  });
  const mathNamed = async value => {
    const index = (await sources()).indexOf(value);
    if (index < 0) throw new Error(`inline math not found: ${value}`);
    return editor.getByTestId('inline-math').nth(index).locator('.inline-math-rendered');
  };
  // Select text through the editor's own selection (the state a mouse selection produces).
  const select = async text => {
    await page.evaluate(needle => {
      const instance = document.querySelector('.ProseMirror').editor;
      let range;
      instance.state.doc.descendants((node, position) => {
        if (range || !node.isText) return;
        const index = node.text.indexOf(needle);
        if (index >= 0) range = { from: position + index, to: position + index + needle.length };
      });
      if (!range) throw new Error(`text not found: ${needle}`);
      instance.chain().focus().setTextSelection(range).run();
    }, text);
    await page.getByTestId('selection-toolbar').waitFor();
  };
  const editSource = async (value, next) => {
    await (await mathNamed(value)).click();
    await page.getByTestId('inline-math-form').waitFor();
    const prefilled = await page.getByTestId('inline-math-source').inputValue() === value;
    await page.getByTestId('inline-math-source').fill(next);
    await page.getByTestId('inline-math-apply').click();
    await page.getByTestId('inline-math-form').waitFor({state:'detached'});
    return prefilled;
  };

  const before = await markdown();
  if (!before.includes('The current is $i_d$') || before.includes('i_q')) {
    throw new Error('Scratch document is not a fresh math.md copy');
  }
  const result = {};
  await open();
  result.mathParagraphEditable = await editor.locator('p.paragraph', {hasText: 'The current is'}).count() === 1;
  result.renderedWithKatex = await editor.getByTestId('inline-math').locator('.katex').count() === 3;
  result.crossReferenceReadOnly = await editor.locator('[data-block="readonly-paragraph"]', {hasText: 'eq-a'}).count() === 1;

  // Change a source: the form opens prefilled.
  result.formPrefilled = await editSource('i_d', 'i_q');

  // Enter on a selected inline math node does not split the paragraph or delete the math.
  const paragraphs = await editor.locator('p.paragraph').count();
  await (await mathNamed('i_q')).click();
  await page.getByTestId('inline-math-form').waitFor();
  await page.keyboard.press('Escape');
  await page.getByTestId('inline-math-form').waitFor({state:'detached'});
  await page.keyboard.press('Enter');
  result.enterKeepsMath = await editor.locator('p.paragraph').count() === paragraphs &&
    (await sources()).includes('i_q');

  // Remove inline math back to its source as plain text; its bold mark stays.
  await (await mathNamed('v_{dc}')).click();
  await page.getByTestId('inline-math-remove').click();
  result.removedToText = !(await sources()).includes('v_{dc}') &&
    await editor.locator('strong', {hasText: 'v_{dc}'}).count() === 1;

  // Create inline math from selected text.
  await select('v_q');
  await page.getByRole('button', {name:'Inline math', exact:true}).click();
  result.createdFromSelection = (await sources()).includes('v_q');

  // Plain text edit in a math paragraph.
  await editor.locator('p.paragraph', {hasText: 'The current is'}).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Done.');

  await page.getByRole('button', {name:'Save', exact:true}).click();
  await page.getByText('Saved', {exact:true}).waitFor();
  const saved = await markdown();
  result.canonicalMarkdown = saved === [
    '# Math',
    '',
    'The current is {math}`i_q` and the voltage is **v\\_{dc}**. Done.',
    '',
    'Convert {math}`v_q` into math and see [the {math}`x` page](https://a.example).',
    '',
    'See {eq}`eq-a` here.',
    '',
    '```{math}',
    ':label: eq-a',
    '',
    'x',
    '```',
    '',
  ].join('\n');

  await open();
  result.reloaded = JSON.stringify(await sources()) === JSON.stringify(['i_q', 'v_q', 'x']) &&
    await editor.locator('a[href="https://a.example"]').getByTestId('inline-math').count() === 1;

  // A source the canonical Markdown cannot write back fails at Save; the file is unchanged.
  await editSource('v_q', '`v');
  await page.getByRole('button', {name:'Save', exact:true}).click();
  await page.getByText('Save failed', {exact:true}).waitFor();
  result.unpreservableRejected = await markdown() === saved;

  result.consoleErrors = problems.filter(message => !message.includes('Failed to load resource'));
  const failed = Object.entries(result).filter(([key, value]) => key !== 'consoleErrors' && value !== true);
  if (failed.length > 0 || result.consoleErrors.length > 0) {
    throw new Error(`Inline math authoring failed: ${JSON.stringify(result)}\n${saved}`);
  }
  return result;
}
