// The command center only dispatches existing shell actions. These checks protect its focus,
// keyboard/modal handoff, active-tab targeting and real file Save/Reload integration.
async (page, { openPath, waitForActivePath, activeDocument, screenshots = false }) => {
  page.setDefaultTimeout(10000);
  const check = (ok, message) => { if (!ok) throw Error(message); };
  const origin = page.url().split('/').slice(0,3).join('/');
  const loaded = await (await page.request.get(`${origin}/api/document`)).json();
  const sep = loaded.path.includes('\\') ? '\\' : '/';
  const root = loaded.path.split(sep).slice(0, -4).join(sep);
  const file = name => [root, 'tmp', 'document-tabs', name].join(sep);
  const editor = () => activeDocument(page).locator('.document-editor');
  const center = () => page.getByRole('dialog', { name: 'Command center', exact: true });
  const input = () => center().getByRole('combobox');
  const waitForInput = () => page.waitForFunction(() => document.activeElement?.getAttribute('role') === 'combobox', null, {timeout:5000});
  const open = async (query = '', shortcut = 'Control+Slash') => {
    await page.keyboard.press(shortcut);
    await waitForInput();
    if (query) await input().fill(query);
  };
  const run = async query => {
    await open(`> ${query}`);
    await page.keyboard.press('Enter');
    await center().waitFor({state:'detached'});
  };
  const ready = () => page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
  const result = {};

  // Compare the two entry points on identical file state, including input-rule Undo precedence.
  const inputRuleResults = [];
  for (const route of ['keyboard', 'command']) {
    await editor().evaluate(n => {
      let start;
      n.editor.state.doc.forEach((node, pos) => { if (start === undefined && node.type.name === 'paragraph') start = pos + 1; });
      if (start === undefined) throw Error('Missing paragraph for input-rule regression');
      n.editor.commands.setTextSelection(start); n.editor.view.focus();
    });
    await page.keyboard.type('## ');
    check(await editor().evaluate(n => n.editor.state.selection.$from.parent.type.name === 'heading'), 'Heading input rule did not apply');
    if (route === 'keyboard') await page.keyboard.press('Control+z');
    else await run('undo');
    const undone = await editor().evaluate(n => ({ document:n.editor.getJSON(), selection:n.editor.state.selection.toJSON(),
      text:n.editor.state.selection.$from.parent.textContent, canRedo:n.editor.can().redo() }));
    check(undone.text.startsWith('## '), `${route} Undo lost the input-rule space: ${undone.text}`);
    check(await editor().evaluate(n => n === document.activeElement), `${route} input-rule Undo lost editor focus`);
    // Input-rule Undo is not native history Undo. Undo its transaction before comparing Redo too.
    await page.keyboard.press('Control+z');
    check(await editor().evaluate(n => n.editor.can().redo()), 'Missing history step for Redo comparison');
    if (route === 'keyboard') await page.keyboard.press('Control+y');
    else await run('redo');
    const redone = await editor().evaluate(n => ({ document:n.editor.getJSON(), selection:n.editor.state.selection.toJSON() }));
    check(await editor().evaluate(n => n === document.activeElement), `${route} Redo lost editor focus`);
    inputRuleResults.push({undone, redone});
    await run('reload');
    await page.getByRole('button',{name:'Discard and reload',exact:true}).click();
    await page.getByRole('dialog').waitFor({state:'detached'}); await ready();
  }
  check(JSON.stringify(inputRuleResults[0]) === JSON.stringify(inputRuleResults[1]), 'Keyboard and command history differ after input-rule conversion');
  result.inputRuleHistoryParity = true;

  // #471: use the active editor's native history; each dispatch is exactly one step.
  const snapshot = () => editor().evaluate(n => JSON.stringify(n.editor.getJSON()));
  const baseline471 = await snapshot();
  await editor().evaluate(n => { n.editor.commands.setTextSelection(2); n.editor.view.focus(); });
  await page.keyboard.type('first471');
  const first471 = await snapshot();
  // A formatting transaction separates the two history events without a timed delay.
  await editor().evaluate(n => n.editor.commands.setTextSelection({from:2,to:10}));
  await page.keyboard.press('Control+b');
  const second471 = await snapshot();
  await page.getByRole('button', {name:'Command center',exact:true}).click();
  await waitForInput();
  await input().fill('> Undo');
  if (screenshots) await page.screenshot({path:'tmp/command-center/history-471.png'});
  const undo471 = center().getByRole('option', {name:'Undo',exact:true});
  if (await undo471.count() !== 1) {
    await input().fill('> keyboard shortcuts');
    check(await center().getByRole('option', {name:'Keyboard shortcuts',exact:true}).count() === 1,
      'Undo command and Keyboard shortcuts entry are missing');
    throw Error('Undo command is missing');
  }
  check(await undo471.locator('kbd').textContent() === 'Ctrl+Z', 'Undo shortcut hint missing');
  await undo471.click(); await center().waitFor({state:'detached'});
  check(await snapshot() === first471, 'Undo did not apply exactly one history step');
  check(await editor().evaluate(n => n === document.activeElement), 'Undo did not return editor focus');
  await run('undo');
  check(await snapshot() === baseline471, 'Second Undo did not reach the original document');
  await open('> undo');
  check(await undo471.getAttribute('aria-disabled') === 'true', 'Undo available with empty history');
  await input().fill('> redo');
  check((await center().getByRole('option', {name:'Redo',exact:true}).innerText()).includes('Ctrl+Y'), 'Redo shortcut hint missing');
  await page.keyboard.press('Enter'); await center().waitFor({state:'detached'});
  check(await snapshot() === first471, 'Redo did not apply exactly one history step');
  check(await editor().evaluate(n => n === document.activeElement), 'Redo did not return editor focus');
  await run('redo');
  check(await snapshot() === second471, 'Second Redo did not restore formatting');
  await open('> redo');
  check(await center().getByRole('option', {name:'Redo',exact:true}).getAttribute('aria-disabled') === 'true', 'Redo available with empty future history');
  await page.keyboard.press('Escape'); await center().waitFor({state:'detached'});
  await run('undo'); await run('undo');

  for (const dismissal of ['Escape', 'Close', 'outside click']) {
    const fromTrigger = dismissal === 'Close';
    if (fromTrigger) {
      await page.getByRole('button', {name:'Command center',exact:true}).focus();
      await page.getByRole('button', {name:'Command center',exact:true}).click();
      await waitForInput();
      await input().fill('> keyboard shortcuts');
      await page.keyboard.press('Enter'); await center().waitFor({state:'detached'});
    } else await run('keyboard shortcuts');
    const guide = page.getByRole('dialog', {name:'Keyboard shortcuts',exact:true});
    await guide.waitFor();
    check((await guide.innerText()).includes('Line break inside a block') &&
      (await guide.innerText()).includes('Shift+Enter'), 'Line-break shortcut is missing from the guide');
    check((await guide.innerText()).includes('Ctrl+/') && (await guide.innerText()).includes('Ctrl+S'), 'General shortcut hints missing');
    if (dismissal === 'Escape') for (const [label, hint] of [
      ['Toggle bullet list','Ctrl+Shift+8'], ['Toggle numbered list','Ctrl+Shift+7'],
      ['Toggle code block','Ctrl+Alt+C'], ['Move to the document end','Ctrl+End'],
    ]) {
      await guide.getByText(label,{exact:true}).scrollIntoViewIfNeeded();
      check(await guide.getByText(hint,{exact:true}).isVisible(), `${label} shortcut is missing or unreachable`);
    }
    if (screenshots) await page.screenshot({path:'tmp/command-center/shortcuts-471.png'});
    if (dismissal === 'Escape') await page.keyboard.press('Escape');
    else if (dismissal === 'outside click') await page.locator('[data-slot="dialog-overlay"]').click({position:{x:8,y:8}});
    else await guide.getByRole('button', {name:'Close',exact:true}).click();
    await guide.waitFor({state:'detached'});
    const focus = fromTrigger ? page.getByRole('button', {name:'Command center',exact:true}) : editor();
    check(await focus.evaluate(n => n === document.activeElement), `${dismissal} did not restore focus from the shortcut guide`);
    check(await snapshot() === baseline471, 'Shortcut guide edited the document');
    // The next shortcut opens from the editor, as the first one did.
    await editor().focus();
  }
  result.historyAndShortcutGuide = true;

  for (const shiftKey of [false, true]) {
    const allowed = await page.evaluate(shiftKey => window.dispatchEvent(new KeyboardEvent('keydown',
      {key:'p',code:'KeyP',ctrlKey:true,shiftKey,bubbles:true,cancelable:true})), shiftKey);
    check(allowed && await center().count() === 0, 'Print shortcut was intercepted');
  }
  // German Slash-position '-' must retain browser zoom; opaque IME keys cannot hide its VK.
  for (const key of ['-', 'Process', 'Unidentified']) {
    const allowed = await page.evaluate(key => window.dispatchEvent(new KeyboardEvent('keydown',
      {key,code:'Slash',keyCode:189,ctrlKey:true,bubbles:true,cancelable:true})), key);
    check(allowed && await center().count() === 0, 'German zoom shortcut was intercepted');
  }
  for (const event of [{key:'/',code:'Digit7',keyCode:55,shiftKey:true},
    {key:'/',code:'Period',keyCode:190,shiftKey:true}, {key:'!',code:'Slash',keyCode:223},
    {key:'／',code:'Slash',keyCode:191}]) {
    const allowed = await page.evaluate(event => window.dispatchEvent(new KeyboardEvent('keydown',
      {...event,ctrlKey:true,bubbles:true,cancelable:true})), event);
    check(allowed && await center().count() === 0, 'A shifted or different character opened the center');
  }
  await page.keyboard.press('Control+Alt+Shift+KeyP');
  check(await center().count() === 0, 'Previous AltGr-prone shortcut still opens the center');
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown',
    {key:'Process',code:'Slash',keyCode:229,ctrlKey:true,isComposing:true,bubbles:true,cancelable:true})));
  check(await center().count() === 0, 'Shortcut interrupted IME composition');
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown',
    {key:'Process',code:'Slash',keyCode:229,ctrlKey:true,bubbles:true,cancelable:true})));
  await waitForInput();
  await page.keyboard.type('settings');
  check(await input().inputValue() === 'settings', 'Typing after shortcut missed the command input');
  await page.keyboard.press('Escape'); await center().waitFor({state:'detached'});
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown',
    {key:'Unidentified',code:'Slash',keyCode:0,ctrlKey:true,bubbles:true,cancelable:true})));
  await waitForInput();
  await page.keyboard.press('Escape'); await center().waitFor({state:'detached'});
  const trigger = page.getByRole('button',{name:'Command center',exact:true});
  check(await trigger.getAttribute('title') === 'Command center (Ctrl+/)' &&
    await trigger.getAttribute('aria-keyshortcuts') === 'Control+/ Meta+/', 'Center shortcut label mismatch');
  result.nonConflictingCodeShortcut = true;

  // The center is also available before opening a document, with document actions disabled.
  await page.getByRole('button', {name:'Close technical-document.md',exact:true}).click();
  await page.getByTestId('document-start').waitFor();
  await page.getByRole('button', {name:'Command center',exact:true}).click();
  await waitForInput();
  await input().fill('> save');
  check(await center().getByRole('option', {name:'Save',exact:true}).locator('kbd').textContent() === 'Ctrl+S', 'Save shortcut label mismatch');
  check(await center().getByRole('option', {name:'Save',exact:true}).getAttribute('aria-disabled') === 'true', 'Save available without a document');
  for (const name of ['Undo', 'Redo']) {
    await input().fill(`> ${name}`);
    check(await center().getByRole('option', {name,exact:true}).getAttribute('aria-disabled') === 'true', `${name} available without a document`);
  }
  await page.keyboard.press('Enter');
  check(await center().isVisible(), 'Disabled command dismissed the center');
  await input().fill('no-match-zzzz');
  check(await center().getByText('No matches',{exact:true}).isVisible(), 'No-match state missing');
  await page.keyboard.press('Escape');
  await center().waitFor({state:'detached'});

  await openPath(page, file('technical-1.md'));
  // Search only listings already held by the sidebar, including collapsed cached children.
  const openFolder = async path => {
    await run('open folder');
    await page.getByTestId('folder-path').fill(path + sep);
    await page.getByTestId('folder-open').click();
    await page.getByRole('dialog').waitFor({state:'detached'});
    await page.locator(`[data-testid="folder"][data-root="${path.replaceAll('\\','\\\\')}"]`).waitFor({state:'attached'});
  };
  const folderPath = file('').slice(0,-1);
  await openFolder(folderPath);
  const folder = page.getByTestId('folder').first();
  await folder.getByRole('treeitem',{name:'technical-8.md',exact:true}).waitFor();
  const sectionToggle = folder.getByRole('button', {name:/^(Collapse|Expand) folder /, includeHidden:true});
  await sectionToggle.click();
  let searchRequests = 0;
  const countSearchRequests = request => { if (/\/api\/(folder|document)(\?|$)/.test(request.url())) searchRequests++; };
  page.on('request', countSearchRequests);
  await open('technical');
  if (screenshots) await page.screenshot({path:'tmp/command-center/sidebar-search-384.png'});
  const matches = await center().getByRole('option').allTextContents();
  check(matches.some(text => text.includes('technical-8.md')), 'Sidebar-listed unopened document missing from search');
  check(await center().getByRole('option',{name:'technical-1.md',exact:true}).count() === 1, 'Opened tab duplicated by sidebar listing');
  check((await center().getByRole('option',{name:'technical-1.md',exact:true}).innerText()).includes('Opened tab'), 'Opened tab not distinguished');
  check((await center().getByRole('option',{name:'technical-8.md',exact:true}).innerText()).includes('Files'), 'Unopened file not distinguished');
  check(JSON.stringify(await center().getByRole('option').evaluateAll(nodes => nodes.map(n => n.getAttribute('aria-label')))) ===
    JSON.stringify(Array.from({length:8}, (_,i) => `technical-${i+1}.md`)), 'Results did not keep tabs first and unopened files in path order');
  await input().fill('guide.md');
  check(await center().getByRole('option').count() === 0, 'Unlisted subfolder document appeared in search');
  for (const excluded of ['diagram.svg','notes.txt']) {
    await input().fill(excluded);
    check(await center().getByRole('option').count() === 0, `Non-document ${excluded} appeared in document search`);
  }
  check(searchRequests === 0, 'Searching made a Host listing or document request');
  check(await sectionToggle.getAttribute('aria-expanded') === 'false', 'Search expanded a collapsed section');
  page.off('request', countSearchRequests);
  await page.keyboard.press('Escape'); await center().waitFor({state:'detached'});
  await open('technical-1.md');
  await page.keyboard.press('Enter'); await center().waitFor({state:'detached'});
  check(await sectionToggle.getAttribute('aria-expanded') === 'false', 'Selecting the already-active document must preserve manual collapse');

  await sectionToggle.click();
  await folder.getByRole('treeitem',{name:'alpha',exact:true}).click();
  await folder.getByRole('treeitem',{name:'guide.md',exact:true}).waitFor();
  await folder.getByRole('treeitem',{name:'alpha',exact:true}).click();
  await open('guide.md');
  check(await center().getByRole('option',{name:'guide.md',exact:true}).count() === 1, 'Collapsed loaded folder omitted or unlisted sibling included');
  check((await center().getByRole('option',{name:'guide.md',exact:true}).innerText()).includes([folderPath,'alpha','guide.md'].join(sep)), 'Collapsed result has no path');
  await page.keyboard.press('Escape'); await center().waitFor({state:'detached'});
  // Relisting a parent can disconnect a preserved child cache. Collapsed, reachable caches
  // remain searchable, but a removed child must not leak results from its old listing.
  const removeAlpha = async route => {
    const response = await route.fetch();
    const listing = await response.json();
    if (listing.path === folderPath) listing.entries = listing.entries.filter(entry => entry.name !== 'alpha');
    await route.fulfill({response,json:listing});
  };
  await page.route('**/api/folder?**', removeAlpha);
  try {
    await openFolder(folderPath);
    check(await folder.getByRole('treeitem',{name:'alpha',exact:true}).count() === 0, 'Parent relisting still displays the removed folder');
    await open('guide.md');
    check(await center().getByRole('option').count() === 0, 'Disconnected child cache remained searchable after parent relisting');
    await page.keyboard.press('Escape'); await center().waitFor({state:'detached'});
  } finally { await page.unroute('**/api/folder?**', removeAlpha); }
  await openFolder(folderPath);
  await open('guide.md');
  check(await center().getByRole('option',{name:'guide.md',exact:true}).count() === 1, 'Restoring the parent entry lost its collapsed child cache');
  await page.keyboard.press('Escape'); await center().waitFor({state:'detached'});
  // Overlapping opened roots must not duplicate the same cached file.
  await openFolder([folderPath,'alpha'].join(sep));
  await open('guide.md');
  check(await center().getByRole('option',{name:'guide.md',exact:true}).count() === 1, 'Overlapping roots duplicated a document');
  await page.keyboard.press('Escape'); await center().waitFor({state:'detached'});

  // Existing dirty content is retained; opening a file must hand focus to its mounted editor.
  await editor().evaluate(n => { n.editor.commands.setTextSelection(2); n.editor.view.focus(); });
  await page.keyboard.type('retained384');
  const retained = await editor().evaluate(n => JSON.stringify(n.editor.getJSON()));
  await sectionToggle.click();
  await open('technical-8.md');
  await page.keyboard.press('Enter'); await center().waitFor({state:'detached'});
  await page.waitForFunction(() => document.querySelector('[data-testid="current-file"]')?.textContent === 'technical-8.md');
  await ready();
  check(await sectionToggle.getAttribute('aria-expanded') === 'true' &&
    await folder.getByRole('treeitem',{name:'technical-8.md',exact:true}).getAttribute('aria-current') === 'page',
    'Opening a search result must reveal its section and current document');
  await page.keyboard.type('opened384');
  check((await editor().innerText()).includes('opened384'), 'Unopened file did not focus its editor');
  await page.keyboard.press('Control+z');
  await open('technical-1.md');
  await page.keyboard.press('Enter'); await center().waitFor({state:'detached'});
  await waitForActivePath(page, file('technical-1.md'));
  check(await editor().evaluate(n => JSON.stringify(n.editor.getJSON())) === retained, 'Opening a listed file lost existing dirty work');
  await page.keyboard.press('Control+z');
  await open('foreign.md');
  const foreign = center().getByRole('option',{name:'foreign.md',exact:true});
  check((await foreign.innerText()).includes('Not an IeumDoc document'), 'Non-native file has no explanation');
  check(await foreign.evaluate(n => getComputedStyle(n).color) === await folder.getByRole('treeitem',{name:'foreign.md',exact:true,includeHidden:true}).evaluate(n => getComputedStyle(n).color), 'Non-native result differs from sidebar muted treatment');
  await page.keyboard.press('Enter'); await center().waitFor({state:'detached'});
  await page.getByRole('dialog',{name:'Cannot open document',exact:true}).waitFor();
  check(await page.getByTestId('current-file').textContent() === 'technical-1.md', 'Non-native selection replaced the document');
  await page.keyboard.press('Escape'); await page.getByRole('dialog',{name:'Cannot open document',exact:true}).waitFor({state:'detached'});
  result.sidebarListedDocuments = true;

  await editor().evaluate(n => {
    window.commandCenterEditor = n.editor;
    n.editor.commands.setTextSelection({from:2,to:5});
    n.editor.view.focus();
  });
  const before = await editor().evaluate(n => ({json:n.editor.getJSON(),selection:n.editor.state.selection.toJSON()}));
  for (const dismissal of ['Escape', 'outside click']) {
    await open();
    await page.keyboard.press('ArrowDown');
    if (dismissal === 'Escape') await page.keyboard.press('Escape');
    else await page.locator('[data-slot="dialog-overlay"]').click({position:{x:8,y:8}});
    await center().waitFor({state:'detached'});
    await page.waitForFunction(() => document.activeElement?.classList.contains('document-editor'), null, {timeout:5000});
    const after = await editor().evaluate(n => ({json:n.editor.getJSON(),selection:n.editor.state.selection.toJSON(),same:n.editor===window.commandCenterEditor}));
    check(after.same && JSON.stringify(after.json)===JSON.stringify(before.json) && JSON.stringify(after.selection)===JSON.stringify(before.selection), `${dismissal} changed editor or selection`);
  }
  result.cancelPreservesEditorAndSelection = true;
  result.outsideClickRestoresEditorFocus = true;

  // Delay the next animation frame while sending real keys: opening must accept typing
  // before the Dialog's deferred initial-focus pass, without changing the old document.
  const failures = [];
  await page.clock.install({time:new Date('2026-10-24T00:00:00Z')});
  // install starts a running clock; pause in its future even when the runner is under load.
  await page.clock.pauseAt(new Date('2026-10-24T00:01:00Z'));
  try {
    for (const expected of ['technical','>technical']) {
      await page.keyboard.press('Control+Slash');
      await page.keyboard.type(expected);
      await page.clock.runFor(50);
      await waitForInput();
      if (await input().inputValue() !== expected ||
        await editor().evaluate(n => JSON.stringify(n.editor.getJSON())) !== JSON.stringify(before.json)) {
        failures.push(`Immediate ${expected} typing lost search characters or edited the document`);
      }
      await page.keyboard.press('Escape');
      await page.clock.runFor(50);
      await center().waitFor({state:'detached'});
    }
  } finally { await page.clock.resume(); }

  // Search navigation and pointer movement share Base UI's one highlighted result.
  await open();
  await page.keyboard.type('> s');
  await page.keyboard.press('ArrowDown');
  const visual = center().getByRole('option',{name:'Visual',exact:true});
  check(await visual.getAttribute('data-highlighted') !== null, 'First Down after typing did not move to the next result');
  const highlightedSurface = await visual.evaluate(n => getComputedStyle(n).backgroundColor);
  const settings = center().getByRole('option',{name:'Settings',exact:true});
  await settings.hover();
  check(await settings.getAttribute('data-highlighted') !== null &&
    await center().locator('[data-highlighted]').count() === 1 &&
    await input().getAttribute('aria-activedescendant') === await settings.getAttribute('id'), 'Hover and keyboard active result diverged');
  check(highlightedSurface !== 'rgba(0, 0, 0, 0)' &&
    await settings.evaluate(n => getComputedStyle(n).backgroundColor) === highlightedSurface,
    'Hover has no selected-surface feedback');
  if (screenshots) await page.screenshot({path:'tmp/command-center/keyboard-hover-386.png'});
  await page.keyboard.press('ArrowUp');
  check(await center().getByRole('option',{name:'Collapse sidebar',exact:true}).getAttribute('data-highlighted') !== null,
    'Keyboard did not continue from the hovered result');
  await page.keyboard.press('Escape'); await center().waitFor({state:'detached'});
  result.searchArrowsAndHover = true;

  // Both a newly opened tab and a retained tab must accept typing without an editor click.
  await openPath(page, file('technical-2.md'));
  for (const [index,name] of ['technical-1','technical-2','technical-2','technical-1'].entries()) {
    await open(name);
    await page.keyboard.press('Enter'); await center().waitFor({state:'detached'});
    await page.waitForFunction(name => document.querySelector('[data-testid="current-file"]')?.textContent===`${name}.md`, name);
    const marker = `focus386${index}`;
    await page.keyboard.type(marker);
    if (!(await editor().innerText()).includes(marker)) failures.push(`Document selection did not focus ${name}`);
    else await page.keyboard.press('Control+z');
  }
  check(failures.length === 0, failures.join('; '));
  result.immediateSearchAndDocumentTyping = true;

  await open('>');
  check(await input().inputValue() === '>', 'Command shortcut did not select command-only mode');
  check(await center().getByRole('option', {name:'technical-1.md',exact:true}).count() === 0, 'Command-only mode lists documents');
  await input().fill('> save');
  let unexpectedSaves = 0;
  const countSave = request => { if (request.method()==='POST' && request.url().endsWith('/api/document')) unexpectedSaves++; };
  page.on('request', countSave);
  await input().dispatchEvent('compositionstart');
  await input().dispatchEvent('keydown', {key:'Enter',code:'Enter',keyCode:229,isComposing:true,bubbles:true});
  await input().dispatchEvent('compositionend');
  await page.keyboard.press('Control+s');
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  check(await center().isVisible() && unexpectedSaves===0, 'IME Enter or Save shortcut executed behind the center');
  page.off('request', countSave);
  await page.keyboard.press('Escape'); await center().waitFor({state:'detached'});
  result.shortcutAndImeOwnership = true;

  // A command opening another modal hands focus to it; shortcuts cannot open a second modal.
  await run('settings');
  await page.getByTestId('settings-dialog').waitFor();
  await page.waitForFunction(() => document.querySelector('[data-testid="settings-dialog"]')?.contains(document.activeElement), null, {timeout:5000});
  await page.keyboard.press('Control+Slash');
  check(await center().count()===0 && await page.getByRole('dialog').count()===1, 'Center opened over Settings');
  await page.keyboard.press('Control+Quote');
  check(await page.getByTestId('link-form').count()===0, 'Link form opened over Settings');
  await page.keyboard.press('Escape');
  await page.getByTestId('settings-dialog').waitFor({state:'detached'});
  const folderReturnTarget = await page.evaluateHandle(() => document.activeElement);
  await run('open folder');
  await page.getByTestId('folder-path').waitFor();
  await page.waitForFunction(() => document.activeElement?.getAttribute('data-testid')==='folder-path', null, {timeout:5000});
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({state:'detached'});
  check(await page.evaluate(target => target === document.activeElement, folderReturnTarget), 'Open folder command lost its focus return');
  await folderReturnTarget.dispose();
  result.modalHandoff = true;

  // Commands may hide their invoking control. Hand focus to the toggle that survives.
  await page.setViewportSize({width:1440,height:900});
  const panel = page.getByTestId('document-panel');
  if (!await panel.isVisible()) await page.getByRole('button',{name:'Outline',exact:true}).click();
  await panel.getByRole('button',{name:'Hide outline',exact:true}).focus();
  await run('hide outline');
  await panel.waitFor({state:'detached'});
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label')==='Outline', null, {timeout:5000});
  await run('show outline');
  await panel.waitFor();
  await page.getByRole('button',{name:'Display',exact:true}).click();
  await page.getByRole('checkbox',{name:'Wide document',exact:true}).focus();
  await run('collapse sidebar');
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label')==='Expand sidebar', null, {timeout:5000});
  await run('expand sidebar');
  await page.getByRole('button',{name:'Files',exact:true}).click();
  result.panelCommandsRetainFocus = true;

  // Existing tabs retain their editor, unapplied property draft, and native history.
  await editor().evaluate(n => { n.editor.commands.setTextSelection(2); n.editor.view.focus(); });
  await page.keyboard.type('command center edit ');
  const equation = activeDocument(page).locator('[data-block="equation"]').first();
  await equation.hover(); await equation.getByRole('button',{name:'Edit',exact:true}).click();
  await page.getByTestId('equation-latex').fill('command center draft');
  const dirty = await editor().evaluate(n => JSON.stringify(n.editor.getJSON()));
  await openPath(page, file('technical-2.md'));
  await open('> undo');
  check(await center().getByRole('option',{name:'Undo',exact:true}).getAttribute('aria-disabled') === 'true', 'Undo targeted the inactive dirty tab');
  await page.keyboard.press('Escape'); await center().waitFor({state:'detached'});
  await open('technical-1');
  await page.keyboard.press('Enter');
  await center().waitFor({state:'detached'});
  await page.waitForFunction(() => document.querySelector('[data-testid="current-file"]')?.textContent === 'technical-1.md');
  check(await editor().evaluate(n => n.editor === window.commandCenterEditor && JSON.stringify(n.editor.getJSON())) === dirty, 'Tab search replaced the editor or dirty content');
  check(await page.getByTestId('equation-latex').inputValue() === 'command center draft', 'Tab search lost property draft');
  await page.getByTestId('equation-cancel').click();
  await run('undo');
  check(!(await editor().innerText()).includes('command center edit'), 'Tab search lost undo');
  await run('redo');
  // Hold the actual Save response to observe the same disabled actions and tab restrictions.
  let releaseSave;
  const saveGate = new Promise(resolve => { releaseSave = resolve; });
  const holdSave = async route => {
    if (route.request().method()==='POST') await saveGate;
    await route.continue();
  };
  await page.route('**/api/document', holdSave);
  try {
    await run('save');
    await page.locator('[data-testid="status"][data-operation="saving"]').waitFor();
    await open('> save');
    check(await center().getByRole('option',{name:'Save',exact:true}).getAttribute('aria-disabled')==='true', 'Save was available while saving');
    for (const name of ['Undo', 'Redo']) {
      await input().fill(`> ${name}`);
      check(await center().getByRole('option',{name,exact:true}).getAttribute('aria-disabled')==='true', `${name} was available while saving`);
    }
    await input().fill('technical-2');
    check(await center().getByRole('option',{name:'technical-2.md',exact:true}).getAttribute('aria-disabled')==='true', 'Tab switch was available while saving');
    await page.keyboard.press('Enter');
    check(await page.getByTestId('current-file').textContent()==='technical-1.md', 'Busy command switched the active tab');
    await input().fill('technical-6');
    check(await center().getByRole('option',{name:'technical-6.md',exact:true}).getAttribute('aria-disabled')==='true', 'Unopened file was available while saving');
    await page.keyboard.press('Enter');
    check(await page.getByTestId('current-file').textContent()==='technical-1.md', 'Busy command opened another file');
    await page.keyboard.press('Escape'); await center().waitFor({state:'detached'});
  } finally {
    releaseSave();
  }
  await page.locator('[data-testid="status"][data-operation="saved"]').waitFor();
  await page.unroute('**/api/document', holdSave);
  const saved = (await (await page.request.get(`${origin}/api/document?path=${encodeURIComponent(file('technical-1.md'))}`)).json()).source;
  check(saved.includes('command center edit'), 'Center did not save the active document');
  // Reload starts after the center closes; the preceding ready state is not completion.
  const reloadResponse = page.waitForResponse(response => response.request().method()==='GET' &&
    response.url()===`${origin}/api/document?path=${encodeURIComponent(file('technical-1.md'))}`);
  await run('reload');
  const reloaded = await reloadResponse;
  check(reloaded.ok(), 'Reload request failed');
  await reloaded.finished();
  await page.getByRole('dialog').waitFor({state:'detached'});
  await ready();
  check((await editor().innerText()).includes('command center edit'), 'Reload lost the saved content');
  result.tabStateAndSaveReload = true;
  await run('source');
  await activeDocument(page).getByTestId('source-view').waitFor();
  await open('> undo');
  check(await center().getByRole('option',{name:'Undo',exact:true}).getAttribute('aria-disabled')==='true', 'History available in Source view');
  await page.keyboard.press('Escape'); await center().waitFor({state:'detached'});
  await open('technical-2');
  await page.keyboard.press('Enter'); await center().waitFor({state:'detached'});
  await open('technical-1');
  await page.keyboard.press('Enter'); await center().waitFor({state:'detached'});
  await activeDocument(page).getByTestId('source-view').waitFor();
  check(await page.getByRole('tab',{name:'technical-1.md',exact:true}).evaluate(n => n===document.activeElement),
    'Selecting a Source tab lost its view or focused the hidden editor');
  await run('visual');
  await editor().waitFor();
  check(await page.getByTestId('view-visual').evaluate(n => n===document.activeElement), 'View command left focus in hidden content');

  await openPath(page, file('alpha'+sep+'guide.md'));
  await openPath(page, file('beta'+sep+'guide.md'));
  await open('guide.md');
  check(await center().getByRole('option',{name:'guide.md — alpha',exact:true}).count()===1 &&
    await center().getByRole('option',{name:'guide.md — beta',exact:true}).count()===1, 'Same-named documents are not distinguishable');
  await input().fill('technical-1');
  await page.keyboard.press('Enter'); await center().waitFor({state:'detached'});
  await page.waitForFunction(() => document.querySelector('[data-testid="current-file"]')?.textContent === 'technical-1.md');
  result.viewAndDuplicateNames = true;

  // The top-center entry and popup stay usable with panels and at phone width.
  for (const width of [1440,1024,768,375]) {
    await page.setViewportSize({width,height:900});
    const trigger = page.getByRole('button',{name:'Command center',exact:true});
    const box = await trigger.boundingBox();
    const bar = await page.locator('.top-bar').boundingBox();
    check(box && bar && Math.abs(box.x+box.width/2-(bar.x+bar.width/2)) < 1, `Center entry not centered at ${width}`);
    check(box.x>=0 && box.x+box.width<=width, `Center entry clipped at ${width}`);
    if (screenshots) await page.screenshot({path:`tmp/command-center/center-${width}.png`});
    await trigger.click(); await waitForInput();
    const popup = await center().boundingBox();
    check(popup.x>=0 && popup.x+popup.width<=width && popup.y>=0 && popup.y+popup.height<=900, `Popup clipped at ${width}`);
    if (screenshots) await page.screenshot({path:`tmp/command-center/search-${width}.png`});
    await page.keyboard.press('Escape'); await center().waitFor({state:'detached'});
    if (width === 1440 || width === 375) {
      await run('keyboard shortcuts');
      const guide = page.getByRole('dialog',{name:'Keyboard shortcuts',exact:true});
      await guide.waitFor();
      const bounds = await guide.boundingBox();
      check(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width && bounds.y >= 0 && bounds.y + bounds.height <= 900,
        `Shortcut guide clipped at ${width}`);
      check(await guide.evaluate(n => n.scrollWidth <= n.clientWidth), `Shortcut guide overflows at ${width}`);
      if (screenshots) await page.screenshot({path:`tmp/command-center/shortcuts-${width}-471.png`});
      await guide.getByText('Toggle code block',{exact:true}).scrollIntoViewIfNeeded();
      check(await guide.getByText('Ctrl+Alt+C',{exact:true}).isVisible(), `Code shortcut unreachable at ${width}`);
      if (screenshots) await page.screenshot({path:`tmp/command-center/shortcuts-code-${width}-471.png`});
      await guide.getByText('Submit a single-line form / cancel; in Citation, Enter first adds the typed key',{exact:true}).scrollIntoViewIfNeeded();
      check(await guide.evaluate(n => n.scrollWidth <= n.clientWidth), `Lower shortcut groups overflow at ${width}`);
      await page.keyboard.press('Escape'); await guide.waitFor({state:'detached'});
    }
  }
  result.responsiveCenter = true;
  await run('expand sidebar');
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label')==='Collapse sidebar', null, {timeout:5000});
  await page.getByRole('button',{name:'Display',exact:true}).click();
  await page.getByRole('checkbox',{name:'Wide document',exact:true}).focus();
  await run('collapse sidebar');
  await page.waitForFunction(() => document.querySelector('.top-bar-sidebar')===document.activeElement, null, {timeout:5000});
  result.phoneSidebarFocus = true;
  await run('settings');
  await page.getByTestId('ui-language').selectOption('ko');
  await page.keyboard.press('Escape'); await page.getByTestId('settings-dialog').waitFor({state:'detached'});
  await page.getByRole('button',{name:'커맨드 센터',exact:true}).click();
  await waitForInput();
  const korean = page.getByRole('dialog',{name:'커맨드 센터',exact:true});
  await korean.getByRole('combobox').fill('> save');
  check(await korean.getByRole('option',{name:'저장',exact:true}).count()===1, 'English alias did not find a Korean command');
  await korean.getByRole('combobox').fill('> 저장');
  check(await korean.getByRole('option',{name:'저장',exact:true}).count()===1, 'Korean command search failed');
  check(await korean.getByTestId('command-center-count').innerText() === '검색 결과 1개', 'Korean result count missing');
  if (screenshots) await page.screenshot({path:'tmp/command-center/search-ko-375.png'});
  await korean.getByRole('combobox').fill('> keyboard shortcuts');
  await page.keyboard.press('Enter'); await korean.waitFor({state:'detached'});
  const koreanGuide = page.getByRole('dialog',{name:'키보드 단축키',exact:true});
  await koreanGuide.waitFor();
  check((await koreanGuide.innerText()).includes('블록 안 줄바꿈') && (await koreanGuide.innerText()).includes('Shift+Enter'),
    'Korean shortcut guide is missing the line-break entry');
  check(await koreanGuide.evaluate(n => n.scrollWidth <= n.clientWidth), 'Korean guide overflows on phone');
  if (screenshots) await page.screenshot({path:'tmp/command-center/shortcuts-ko-375-471.png'});
  await page.keyboard.press('Escape'); await koreanGuide.waitFor({state:'detached'});
  await page.getByRole('button',{name:'커맨드 센터',exact:true}).click(); await waitForInput();
  await korean.getByRole('combobox').fill('> settings');
  await page.keyboard.press('Enter');
  await page.getByTestId('ui-language').selectOption('en');
  await page.keyboard.press('Escape'); await page.getByTestId('settings-dialog').waitFor({state:'detached'});
  result.bilingualSearch = true;

  // A large Host listing stays fully searchable without mounting every match. Keep timing out
  // of regression assertions; protect bounded rows, live counts, narrowing and keyboard access.
  await page.setViewportSize({width:1280,height:720});
  const bulk = Array.from({length:2000},(_,i) => {
    const name = `bulk-${String(i).padStart(4,'0')}.md`;
    return {name,path:file(name),kind:'document',native:true};
  });
  const bulkListing = async route => {
    const response = await route.fetch();
    const listing = await response.json();
    if (listing.path === folderPath) listing.entries = bulk;
    await route.fulfill({response,json:listing});
  };
  await page.route('**/api/folder?**', bulkListing);
  try {
    await openFolder(folderPath);
    await folder.getByRole('treeitem',{name:'bulk-1999.md',exact:true,includeHidden:true}).waitFor({state:'attached'});
    const collapse = page.getByRole('button',{name:'Collapse sidebar',exact:true});
    if (await collapse.isVisible()) await collapse.click();
    searchRequests = 0;
    page.on('request', countSearchRequests);
    await open('bulk');
    const visibleCount = await center().getByRole('option').count();
    check(visibleCount === 50, 'Large result set did not show only the first 50 matches');
    const count = center().getByTestId('command-center-count');
    check(await count.innerText() === 'Showing 50 of 2000 results. Type more to narrow your search.', 'Truncated results concealed the total or narrowing guidance');
    check(await count.getAttribute('role') === 'status' && await count.getAttribute('aria-live') === 'polite' && await count.getAttribute('aria-atomic') === 'true', 'Count is not a polite atomic live status');
    await count.evaluate(n => { window.commandCenterCount = n; });
    check(await center().getByRole('button',{name:/Previous results|Next results/}).count() === 0, 'Pagination controls remain');
    check(await center().getByRole('option').first().getAttribute('aria-label') === 'bulk-0000.md' && await center().getByRole('option').last().getAttribute('aria-label') === 'bulk-0049.md', 'Truncation lost path order');
    if (screenshots) await page.screenshot({path:'tmp/command-center/limited-1280.png'});
    for (let i = 1; i < visibleCount; i++) await page.keyboard.press('ArrowDown');
    check(await center().getByRole('option',{name:'bulk-0049.md',exact:true}).getAttribute('data-highlighted') !== null, 'Keyboard cannot reach the last visible match');
    await page.keyboard.press('ArrowDown');
    const highlighted = await center().locator('[role="option"][data-highlighted]').getAttribute('aria-label');
    check(highlighted === 'bulk-0000.md' || highlighted === 'bulk-0049.md', 'ArrowDown escaped the visible matches');
    check(await center().getByRole('option').count() === 50, 'Keyboard navigation expanded the result limit');
    await page.setViewportSize({width:375,height:900});
    const box = await count.boundingBox();
    check(box && box.x >= 0 && box.x + box.width <= 375, 'Result count clipped on phone');
    if (screenshots) await page.screenshot({path:'tmp/command-center/limited-375.png'});
    await input().fill('bulk-000');
    check(await center().getByRole('option').count() === 10 && await count.innerText() === 'Results: 10', 'Narrowing did not recompute the full result count');
    await input().fill('bulk-no-match');
    check(await center().getByRole('option').count() === 0 && await count.innerText() === 'Results: 0', 'Empty search lost its count');
    await input().fill('bulk-1999');
    check(await center().getByRole('option').count() === 1 && await count.innerText() === 'Results: 1', 'Narrowing searched only the first 50 matches');
    check(await count.evaluate(n => n === window.commandCenterCount), 'Query changes remounted the live count status');
    check(searchRequests === 0, 'Searching made Host requests');
    page.off('request', countSearchRequests);
    await page.keyboard.press('Enter'); await center().waitFor({state:'detached'});
    await page.waitForFunction(() => document.querySelector('[data-testid="current-file"]')?.textContent === 'bulk-1999.md');
    await ready();
    await page.keyboard.type('bulk384');
    check((await editor().innerText()).includes('bulk384'), 'A late search result did not open with editor focus');
    await page.keyboard.press('Control+z');
    result.largeListing = {documents:bulk.length,visibleCount};
  } finally {
    page.off('request', countSearchRequests);
    await page.unroute('**/api/folder?**', bulkListing);
  }
  return result;
}
