// Run with pnpm exec playwright-cli run-code --filename=apps/editor/test/link-authoring.browser.js.
// Adds, retargets, relabels and removes ordinary links through the selection toolbar, saves and
// reloads a real file, and checks that cross-references stay read-only and invalid links fail
// closed. The file is a scratch copy under the repository's ignored tmp/ directory; prepare it
// first (see docs/test/TEST_GUIDE.md). The scenario writes that copy only.
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
  const file = [root, 'tmp', 'link-authoring', 'links.md'].join(separator);
  const markdown = async () => {
    const response = await page.request.get(`${origin}/document/links.md?path=${encodeURIComponent(file)}`);
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
  // Select text through the editor's own selection (the state a mouse selection produces).
  // Setting the DOM selection from a script races with ProseMirror's DOM updates after a link change.
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
  const setLink = async (text, url) => {
    await select(text);
    await page.getByRole('button', {name:'Link', exact:true}).click();
    await page.getByTestId('link-url').fill(url);
    await page.getByTestId('link-apply').click();
    await page.getByTestId('link-form').waitFor({state:'detached'});
  };

  const before = await markdown();
  if (!before.includes('See [OpenAI](https://openai.com)') || before.includes('research')) {
    throw new Error('Scratch document is not a fresh links.md copy');
  }
  const result = {};
  await open();
  result.linkParagraphEditable = await editor.locator('p.paragraph', {hasText: 'OpenAI'}).count() === 1;
  // {eq} reference paragraphs are editable since cross-reference authoring.
  result.crossReferenceEditable = await editor.locator('p.paragraph [data-testid="cross-reference"]', {hasText: 'eq-a'}).count() === 1;

  // Retarget an existing link: the form opens with its current URL.
  await select('OpenAI');
  await page.getByRole('button', {name:'Link', exact:true}).click();
  result.formPrefilled = await page.getByTestId('link-url').inputValue() === 'https://openai.com';
  await page.getByTestId('link-url').fill('https://openai.com/research');
  await page.getByTestId('link-apply').click();
  await page.getByTestId('link-form').waitFor({state:'detached'});

  // Relabel: typing inside the link text keeps the link. (Typing at the very start or end of a
  // link, or over all of its text, is outside the link: links are non-inclusive marks.)
  await select('pen');
  await page.keyboard.type('PEN');

  // Remove the link inside bold text; bold stays.
  await select('docs');
  await page.getByRole('button', {name:'Link', exact:true}).click();
  await page.getByTestId('link-remove').click();
  await page.getByTestId('link-form').waitFor({state:'detached'});

  // Add a link to plain text; the form rejects a URL with spaces first.
  await select('linked');
  await page.getByRole('button', {name:'Link', exact:true}).click();
  await page.getByTestId('link-url').fill('https://example.com/a b');
  await page.getByTestId('link-apply').click();
  result.spacesRejectedInForm = await page.getByText('A URL cannot contain spaces.').count() === 1;
  await page.getByTestId('link-url').fill('https://example.com/linked');
  await page.getByTestId('link-apply').click();
  await page.getByTestId('link-form').waitFor({state:'detached'});

  // Plain text edit in a link paragraph. Click near its start: the floating selection
  // toolbar of the previous selection may cover the paragraph's center.
  await editor.locator('p.paragraph', {hasText: 'for details'}).click({position: {x: 4, y: 4}});
  await page.keyboard.press('End');
  await page.keyboard.type(' Updated.');

  await page.getByRole('button', {name:'Save', exact:true}).click();
  await page.getByText('Saved', {exact:true}).waitFor();
  const saved = await markdown();
  const expected = [
    '# Links',
    '',
    'See [OPENAI](https://openai.com/research) for **bold docs text** for details. Updated.',
    '',
    'A plain paragraph to [linked](https://example.com/linked) text.',
    '',
    'See {eq}`eq-a` and [details](#eq-a).',
  ].join('\n');
  result.canonicalMarkdown = saved.startsWith(`${expected}\n`);
  result.fragmentLinkStillLink = saved.includes('[details](#eq-a)') && saved.includes('{eq}`eq-a`');

  await open();
  result.linksAfterReload = await editor.locator('a[href="https://openai.com/research"]').innerText() === 'OPENAI' &&
    await editor.locator('a[href="https://example.com/linked"]').innerText() === 'linked' &&
    await editor.locator('a[href="https://a.example/docs"]').count() === 0 &&
    await editor.locator('strong', {hasText: 'bold docs text'}).count() === 1;

  // A URL the canonical Markdown cannot keep as typed fails at Save; the file is unchanged.
  await setLink('linked', 'https://example.com/한글');
  await page.getByRole('button', {name:'Save', exact:true}).click();
  await page.getByText('Save failed', {exact:true}).waitFor();
  result.unpreservableRejected = await markdown() === saved;

  result.consoleErrors = problems.filter(message => !message.includes('Failed to load resource'));
  const failed = Object.entries(result).filter(([key, value]) => key !== 'consoleErrors' && value !== true);
  if (failed.length > 0 || result.consoleErrors.length > 0) {
    throw new Error(`Link authoring failed: ${JSON.stringify(result)}\n${saved}`);
  }
  return result;
}
