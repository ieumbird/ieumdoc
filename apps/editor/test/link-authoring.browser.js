// Run with pnpm browser:test link-authoring.
// Adds, retargets, relabels and removes ordinary links through the selection toolbar, saves and
// reloads a real file, and checks that cross-references stay read-only and invalid links fail
// closed. The file is a scratch copy under the repository's ignored tmp/ directory; prepare it
// first (see docs/test/TEST_GUIDE.md). The scenario writes that copy only.
async (page, { openPath }) => {
  page.setDefaultTimeout(15000);
  const problems = [];
  page.on('console', message => { if (message.type() === 'error') problems.push(message.text()); });
  await page.unrouteAll();
  await page.reload();
  await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});

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
    await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
    await openPath(page, file);
  };
  const editor = page.locator('[data-document-tab][data-active=true]').getByTestId('document-editor');
  // Focus synchronously before setting the engine selection. Tiptap's chain().focus() queues
  // an animation frame, leaving a window where a native focus/selectionchange can read an old
  // DOM caret back into the engine before the requested range has reached the DOM (#343).
  const select = async (text, step) => {
    const expected = await page.evaluate(needle => {
      const instance = document.querySelector('[data-document-tab][data-active=true] .ProseMirror').editor;
      let range;
      instance.state.doc.descendants((node, position) => {
        if (range || !node.isText) return;
        const index = node.text.indexOf(needle);
        if (index >= 0) range = { from: position + index, to: position + index + needle.length };
      });
      if (!range) throw new Error(`text not found: ${needle}`);
      instance.view.focus();
      instance.commands.setTextSelection(range);
      return [range.from, range.to];
    }, text);
    // #337: CI once never showed the toolbar here. Report the focus state instead of waiting out the test.
    await page.getByTestId('selection-toolbar').waitFor().catch(async error => {
      const state = await page.evaluate(() => {
        const instance = document.querySelector('[data-document-tab][data-active=true] .ProseMirror').editor;
        const { from, to } = instance.state.selection;
        const dom = getSelection();
        return { activeElement: document.activeElement?.outerHTML.slice(0, 80), editorFocused: instance.view.hasFocus(),
          documentFocused: document.hasFocus(), selection: [from, to], linkForms: document.querySelectorAll('[data-testid="link-form"]').length,
          selectedText: instance.state.doc.textBetween(from, to), domText: dom?.toString(), domCollapsed: dom?.isCollapsed };
      });
      throw new Error(`Selection toolbar missing at ${step} for "${text}" (expected ${JSON.stringify(expected)}): ${JSON.stringify(state)}`, { cause: error });
    });
  };
  const setLink = async (text, url) => {
    await select(text, 'set invalid-save link');
    await page.keyboard.press("Control+Quote");
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
  result.crossReferenceEditable = await editor.locator('p.paragraph [data-testid="cross-reference"][data-label="eq-a"]').count() === 1;

  // Retarget an existing link: the form opens with its current URL.
  await select('OpenAI', 'initial retarget');
  for (const event of [
    {key:'ä',code:'Quote',keyCode:222},
    {key:'ù',code:'Quote',keyCode:192},
    {key:"'",code:'Digit4',keyCode:52},
    {key:"'",code:'Backslash',keyCode:220,shiftKey:true},
    ...['Process','Unidentified'].map(key => ({key,code:'Quote',keyCode:52})),
  ]) {
    const allowed = await editor.locator('.ProseMirror').evaluate((node,event) => node.dispatchEvent(new KeyboardEvent('keydown',
      {...event,ctrlKey:true,bubbles:true,cancelable:true})), event);
    if (!allowed || await page.getByTestId('link-form').count()) throw Error('Layout-specific key was intercepted by Link');
  }
  const linkButton = page.getByRole('button', {name:'Link',exact:true});
  if (await linkButton.getAttribute('title') !== "Link (Ctrl+')" ||
      await linkButton.getAttribute('aria-keyshortcuts') !== "Control+' Meta+'") throw Error('Link shortcut label mismatch');
  await page.keyboard.press('Control+Alt+Shift+KeyK');
  if (await page.getByTestId('link-form').count()) throw Error('Previous AltGr-prone shortcut still opens the link form');
  await page.keyboard.press("Control+Quote");
  await page.getByTestId('link-url').waitFor();
  await page.getByTestId('link-url').press('Escape');
  await page.getByTestId('link-form').waitFor({state:'detached'});
  await select('OpenAI', 'Korean code shortcut');
  await editor.locator('.ProseMirror').dispatchEvent('keydown',
    {key:'Process',code:'Quote',keyCode:229,ctrlKey:true,isComposing:true,bubbles:true,cancelable:true});
  if (await page.getByTestId('link-form').count()) throw Error('Link shortcut interrupted composition');
  await editor.locator('.ProseMirror').dispatchEvent('keydown',
    {key:'Unidentified',code:'Quote',keyCode:0,ctrlKey:true,bubbles:true,cancelable:true});
  await page.getByTestId('link-url').waitFor();
  result.physicalKeyLinkShortcut = true;

  result.formPrefilled = await page.getByTestId('link-url').inputValue() === 'https://openai.com';
  // Transient inline input closes without Apply on any outside blur, including tab switches.
  const appliedBeforeBlur = await editor.locator('.ProseMirror').evaluate(el => JSON.stringify(el.editor.getJSON()));
  for (const destination of ['same document', 'another tab']) {
    await page.getByTestId('link-url').press('Control+a');
    await page.getByTestId('link-url').pressSequentially('https://uncommitted.example');
    if (destination === 'same document') {
      await editor.locator('p.paragraph', {hasText:'A plain paragraph'}).click({position:{x:4,y:4}});
    } else {
      await page.getByRole('tab', {name:'technical-document.md',exact:true}).click();
      await page.getByTestId('link-form').waitFor({state:'detached'});
      await page.getByRole('tab', {name:'links.md',exact:true}).click();
    }
    await page.getByTestId('link-form').waitFor({state:'detached'});
    if (await editor.locator('.ProseMirror').evaluate(el => JSON.stringify(el.editor.getJSON())) !== appliedBeforeBlur) throw new Error(`Link blur applied input on ${destination}`);
    await select('OpenAI', `after blur to ${destination}`);
    await page.getByRole('button', {name:'Link',exact:true}).click();
    if (await page.getByTestId('link-url').inputValue() !== 'https://openai.com') throw new Error(`Link input survived blur on ${destination}`);
  }
  result.inlineBlurClosesWithoutApply = true;
  await page.getByTestId('link-url').fill('https://openai.com/research');
  await page.getByTestId('link-apply').click();
  await page.getByTestId('link-form').waitFor({state:'detached'});

  // Relabel: typing inside the link text keeps the link. (Typing at the very start or end of a
  // link, or over all of its text, is outside the link: links are non-inclusive marks.)
  await select('pen', 'relabel existing link');
  await page.keyboard.type('PEN');

  // Remove the link inside bold text; bold stays.
  await select('docs', 'remove bold link');
  await page.getByRole('button', {name:'Link', exact:true}).click();
  // Hold only frames queued by Remove so a slow old focus callback cannot escape coverage.
  // Restore the browser scheduler immediately; release the held work after the next form opens.
  await page.getByTestId('link-remove').evaluate(button => {
    const schedule = window.requestAnimationFrame;
    window.previousLinkFrames = [];
    window.requestAnimationFrame = callback => { window.previousLinkFrames.push(callback); return 0; };
    try { button.click(); } finally { window.requestAnimationFrame = schedule; }
  });
  await page.getByTestId('link-form').waitFor({state:'detached'});

  // Add a link to plain text; the form rejects a URL with spaces first.
  await select('linked', 'add plain-text link');
  await page.keyboard.press("Control+Quote");
  await page.getByTestId('link-url').waitFor();
  await page.evaluate(() => window.previousLinkFrames.forEach(callback => callback(performance.now())));
  await page.getByTestId('link-url').fill('https://example.com/a b');
  await page.getByTestId('link-apply').click();
  result.spacesRejectedInForm = await page.getByText('A URL cannot contain spaces.').filter({visible:true}).count() === 1;
  await page.getByTestId('link-url').fill('https://example.com/linked');
  await page.getByTestId('link-apply').click();
  await page.getByTestId('link-form').waitFor({state:'detached'});

  // Plain text edit in a link paragraph. Click near its start: the floating selection
  // toolbar of the previous selection may cover the paragraph's center.
  await editor.locator('p.paragraph', {hasText: 'for details'}).click({position: {x: 4, y: 4}});
  await page.keyboard.press('End');
  await page.keyboard.type(' Updated.');

  await page.getByRole('button', {name:'Save', exact:true}).click();
  await page.getByText('Saved', {exact:true}).filter({visible:true}).waitFor();
  const saved = await markdown();
  const expected = [
    '---', 'ieumdoc: 1', '---', '',
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
  await page.getByText('Save failed', {exact:true}).filter({visible:true}).waitFor();
  result.unpreservableRejected = await markdown() === saved;

  result.consoleErrors = problems.filter(message => !message.includes('Failed to load resource'));
  const failed = Object.entries(result).filter(([key, value]) => key !== 'consoleErrors' && value !== true);
  if (failed.length > 0 || result.consoleErrors.length > 0) {
    throw new Error(`Link authoring failed: ${JSON.stringify(result)}\n${saved}`);
  }
  return result;
}
