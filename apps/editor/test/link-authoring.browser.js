// Run with pnpm browser:test link-authoring.
// Adds, retargets, relabels and removes ordinary links through the selection toolbar, saves and
// reloads a real file, and checks that cross-references stay read-only and invalid links fail
// closed. The file is a scratch copy under the repository's ignored tmp/ directory; prepare it
// first (see docs/test/TEST_GUIDE.md). The scenario writes that copy only.
async (page, { openPath, screenshots, expect }) => {
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

  await select('OpenAI', 'capture link form');
  await page.keyboard.press("Control+Quote");
  if (screenshots) {
    for (const width of [1440, 640]) {
      await page.setViewportSize({width, height:900});
      await page.evaluate(() => document.fonts.ready);
      await page.mouse.move(0, 0);
      await page.screenshot({path:`tmp/open-link-725/link-en-${width}.png`});
    }
    await page.setViewportSize({width:1280, height:720});
  }

  // #790: an unapplied URL belongs to the same draft/work-loss path as source properties.
  const applied = () => editor.locator('.ProseMirror').evaluate(el => JSON.stringify(el.editor.getJSON()));
  const appliedBeforeDraft = await applied();
  const linkTab = await page.getByRole('tab', {name:'links.md',exact:true}).getAttribute('id');
  await page.getByTestId('link-url').fill('https://example.com/unapplied');
  await editor.locator('p.paragraph', {hasText:'A plain paragraph'}).click({position:{x:4,y:4}});
  expect(await page.getByTestId('link-url').inputValue(), 'Outside click retains URL').toBe('https://example.com/unapplied');
  expect(await applied()).toBe(appliedBeforeDraft);
  await page.keyboard.press('Control+Quote');
  expect(await page.getByTestId('link-url').inputValue(), 'Shortcut re-entry keeps original draft').toBe('https://example.com/unapplied');
  await page.getByTestId('draft-indicator').waitFor();
  expect(await page.getByTestId('draft-indicator').getAttribute('aria-label')).toBe('Unapplied draft. Save and Source include applied content only. Unapplied edit drafts stay unsaved until you apply them.');
  expect(await page.evaluate(() => { const event = new Event('beforeunload',{cancelable:true}); window.dispatchEvent(event); return event.defaultPrevented; })).toBe(true);
  await page.getByTestId('save').click();
  await page.locator('[data-testid="status"][data-operation^="saved"]').waitFor();
  expect(await markdown()).not.toContain('unapplied');
  expect(await page.getByTestId('status').innerText()).toBe('Unsaved changes');
  await page.getByTestId('view-source').click();
  const source = page.locator('[data-document-tab][data-active=true]').getByTestId('source-view');
  await source.waitFor();
  expect(await source.innerText()).not.toContain('unapplied');
  expect(await page.getByTestId('link-form').count()).toBe(0);
  await page.getByTestId('view-visual').click();
  expect(await page.getByTestId('link-url').inputValue()).toBe('https://example.com/unapplied');
  await page.getByRole('tab',{name:'technical-document.md',exact:true}).click();
  expect(await page.getByTestId('link-form').count()).toBe(0);
  await page.locator(`#${linkTab}`).click();
  expect(await page.getByTestId('link-url').inputValue()).toBe('https://example.com/unapplied');
  expect(await page.getByTestId('link-url').evaluate(el => el === document.activeElement), 'Returning tab does not autofocus the retained draft').toBe(false);
  const closeLink = page.getByRole('button',{name:'Close links.md',exact:true});
  await closeLink.click();
  const closeGuard = page.getByRole('dialog',{name:'Save changes?',exact:true});
  await expect(closeGuard).toContainText('Unapplied property drafts will be lost');
  await closeGuard.getByRole('button',{name:'Cancel',exact:true}).click();
  await closeGuard.waitFor({state:'detached'});
  await expect(closeLink).toBeFocused();
  expect(await page.getByTestId('link-url').inputValue()).toBe('https://example.com/unapplied');
  await page.getByTestId('link-cancel').click();
  expect(await applied()).toBe(appliedBeforeDraft);
  await page.getByTestId('draft-indicator').waitFor({state:'detached'});
  result.explicitDraftLifecycle = true;

  // Editing before a retained link must not shift Apply onto different text.
  await select('OpenAI', 'mapped link');
  await page.keyboard.press('Control+Quote');
  await page.getByTestId('link-url').fill('https://example.com/mapped');
  await page.evaluate(() => {
    const instance = document.querySelector('[data-document-tab][data-active=true] .document-editor').editor;
    instance.view.focus();
    instance.commands.setTextSelection(1);
  });
  await page.keyboard.type('Prefix ');
  const beforeLinkDeletion = await applied();
  await page.evaluate(() => {
    const instance = document.querySelector('[data-document-tab][data-active=true] .document-editor').editor;
    let position;
    instance.state.doc.forEach((node,pos) => { if (node.type.name === 'paragraph' && node.textContent.includes('OpenAI')) position = pos; });
    instance.commands.setNodeSelection(position);
    instance.view.focus();
  });
  await page.keyboard.press('Delete');
  expect(await page.getByTestId('link-url').inputValue()).toBe('https://example.com/mapped');
  await page.keyboard.press('ControlOrMeta+z');
  expect(await applied()).toBe(beforeLinkDeletion);
  await page.getByTestId('link-apply').click();
  expect(await editor.locator('a[href="https://example.com/mapped"]').innerText()).toBe('OpenAI');
  await page.keyboard.press('ControlOrMeta+z');
  await page.keyboard.press('ControlOrMeta+z');
  expect(await applied()).toBe(appliedBeforeDraft);

  // Observe attempted opens without leaving the edited document; one open below uses a real tab.
  const pagesBeforeOpening = page.context().pages().length;
  await page.evaluate(() => {
    window.linkOpens = [];
    const original = window.open.bind(window);
    window.open = (...args) => { window.linkOpens.push(args); return window.realLinkOpen ? original(...args) : null; };
  });
  const opens = () => page.evaluate(() => window.linkOpens);
  const assertOpens = async count => {
    const actual = await opens();
    if (actual.length !== count || actual.some(([, target, features]) => target !== '_blank' || features !== 'noopener')) {
      throw Error(`Unexpected link opens: ${JSON.stringify(actual)}`);
    }
  };
  const existingLink = editor.locator('a[href="https://openai.com"]');
  await existingLink.click();
  await assertOpens(0);
  for (const modifier of ['Control', 'Meta']) {
    // Separate single clicks spatially; ProseMirror classifies nearby rapid clicks as multi-clicks.
    await editor.locator('p.paragraph', {hasText:'A plain paragraph'}).click({position:{x:4,y:4}});
    await existingLink.click({modifiers:[modifier]});
  }
  await assertOpens(2);
  if ((await opens()).some(([url]) => url !== 'https://openai.com/')) throw Error('Wrong clicked link target');
  // ProseMirror excludes drags before handleClick; exercise actual pointer movement.
  const box = await existingLink.boundingBox();
  await page.keyboard.down('Control');
  await page.mouse.move(box.x + 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2, {steps:8});
  await page.mouse.up();
  await page.keyboard.up('Control');
  await assertOpens(2);
  await editor.locator('.ProseMirror').dispatchEvent('compositionstart', {data:'한'});
  await existingLink.click({modifiers:['Control']});
  await assertOpens(2);
  await editor.locator('.ProseMirror').dispatchEvent('compositionend', {data:'한'});
  // A fragment is still editable but never opens or navigates.
  await editor.locator('a[href="#eq-a"]').click({modifiers:['Control']});
  await assertOpens(2);
  const sourceBeforeOpen = await editor.locator('.ProseMirror').evaluate(el => JSON.stringify(el.editor.getJSON()));
  await select('OpenAI', 'open button');
  await page.keyboard.press("Control+Quote");
  for (const url of ['./other.md', '#eq-a', '//example.com', 'mailto:a@example.com', 'javascript:alert(1)', 'https://']) {
    await page.getByTestId('link-url').fill(url);
    if (!await page.getByTestId('link-open').isDisabled() ||
      await page.getByTestId('link-open').locator('..').getAttribute('title') !== 'Only external http(s) links can be opened.') throw Error(`Open allowed ${url}`);
  }
  for (const url of ['http://example.com/path', 'https://example.com/preview']) {
    await page.getByTestId('link-url').fill(url);
    await page.getByTestId('link-url').focus();
    await page.keyboard.press('Tab');
    if (!await page.getByTestId('link-open').evaluate(node => node === document.activeElement)) throw Error('Open is not reachable by Tab');
    await page.keyboard.press('Enter');
    if ((await opens()).at(-1)[0] !== url) throw Error('Open did not use current draft URL');
  }
  await assertOpens(4);
  if (await editor.locator('.ProseMirror').evaluate(el => JSON.stringify(el.editor.getJSON())) !== sourceBeforeOpen) throw Error('Open applied the URL draft');
  // The web surface really opens an isolated tab. Intercept the destination to avoid a network dependency.
  await page.context().route('https://example.com/preview', route => route.fulfill({contentType:'text/html',body:'External link preview'}));
  await page.evaluate(() => { window.realLinkOpen = true; });
  const tabPromise = page.context().waitForEvent('page');
  await page.getByTestId('link-open').click();
  const tab = await tabPromise;
  await tab.waitForLoadState();
  if (tab.url() !== 'https://example.com/preview' || !await tab.evaluate(() => window.opener === null)) throw Error('External tab was not isolated');
  await tab.close();
  await page.evaluate(() => { window.realLinkOpen = false; });
  await page.getByTestId('link-url').press('Escape');
  const countBeforeNote = (await opens()).length;
  await editor.getByTestId('footnote-definition').locator('a').click({modifiers:['Control']});
  await assertOpens(countBeforeNote);
  if (page.context().pages().length !== pagesBeforeOpening) throw Error('An ignored click opened an unwanted tab');
  result.externalOpening = true;

  // Endnote edit sessions can end on outside focus too; the nested reference form must
  // keep its values and Cancel action just like the existing inline-math source form.
  const note = editor.getByTestId('footnote-definition');
  const beforeNoteDraft = await applied();
  await note.getByTestId('endnote-edit').click();
  await select('External note', 'nested reference draft');
  await page.getByTestId('selection-toolbar').getByRole('button',{name:'Cross-reference',exact:true}).click();
  await page.getByTestId('reference-apply').click();
  await note.getByTestId('cross-reference').hover();
  await note.getByTestId('cross-reference-edit').click();
  await editor.locator('p.paragraph', {hasText:'A plain paragraph'}).click({position:{x:4,y:4}});
  expect(await note.getByTestId('reference-form').count(), 'Ending endnote editing retains its reference form').toBe(1);
  expect(await note.getByTestId('reference-apply').isDisabled()).toBe(true);
  await note.getByTestId('endnote-edit').click();
  expect(await note.getByTestId('reference-target').inputValue()).toBe('reference:eq:eq-a');
  expect(await note.getByTestId('reference-apply').isEnabled()).toBe(true);
  await note.getByTestId('reference-cancel').click();
  await page.keyboard.press('ControlOrMeta+z');
  expect(await applied()).toBe(beforeNoteDraft);

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
  // Outside focus and tab switches retain input; only explicit Cancel discards it.
  const appliedBeforeBlur = await editor.locator('.ProseMirror').evaluate(el => JSON.stringify(el.editor.getJSON()));
  for (const destination of ['same document', 'another tab']) {
    await page.getByTestId('link-url').press('Control+a');
    await page.getByTestId('link-url').pressSequentially('https://uncommitted.example');
    if (destination === 'same document') {
      await editor.locator('p.paragraph', {hasText:'A plain paragraph'}).click({position:{x:4,y:4}});
    } else {
      await page.getByRole('tab', {name:'technical-document.md',exact:true}).click();
      await page.getByTestId('link-form').waitFor({state:'detached'});
      await page.locator(`#${linkTab}`).click();
    }
    expect(await page.getByTestId('link-url').inputValue()).toBe('https://uncommitted.example');
    if (await editor.locator('.ProseMirror').evaluate(el => JSON.stringify(el.editor.getJSON())) !== appliedBeforeBlur) throw new Error(`Link blur applied input on ${destination}`);
    await page.getByTestId('link-cancel').click();
    await page.getByTestId('link-form').waitFor({state:'detached'});
    await select('OpenAI', `after blur to ${destination}`);
    await page.getByRole('button', {name:'Link',exact:true}).click();
    if (await page.getByTestId('link-url').inputValue() !== 'https://openai.com') throw new Error(`Cancel retained link input on ${destination}`);
  }
  result.inlineBlurRetainsWithoutApply = true;
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
    '---', 'litzio: 1', '---', '',
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
