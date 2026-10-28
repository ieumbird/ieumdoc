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
  const run = async (name, query = name) => {
    await open(`> ${query}`);
    const command = center().getByRole('option', {name, exact:true});
    check(await command.count() === 1 && await command.getAttribute('aria-disabled') !== 'true', `Command unavailable: ${name}`);
    const matches = await center().getByRole('option').evaluateAll(nodes => nodes.map(n => n.getAttribute('aria-label')));
    // Folder paths also match the query. Navigate to the named command before Enter.
    for (let step = 0; step < matches.length && await command.getAttribute('data-highlighted') === null; step++) {
      await page.keyboard.press('ArrowDown');
    }
    check(await command.getAttribute('data-highlighted') !== null &&
      await input().getAttribute('aria-activedescendant') === await command.getAttribute('id'), `Command not selected: ${name}`);
    await page.keyboard.press('Enter');
    await center().waitFor({state:'detached'});
    return matches;
  };
  const ready = () => page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
  const result = {};

  // Manual Before/After evidence uses the same initial document and sidebar state.
  if (screenshots) {
    for (const width of [1440, 640]) {
      await page.setViewportSize({width, height:900});
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({path:`tmp/command-center/entry-556-${width}.png`});
    }
    await page.setViewportSize({width:1280, height:720});
  }

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
    else await run('Undo');
    const undone = await editor().evaluate(n => ({ document:n.editor.getJSON(), selection:n.editor.state.selection.toJSON(),
      text:n.editor.state.selection.$from.parent.textContent, canRedo:n.editor.can().redo() }));
    check(undone.text.startsWith('## '), `${route} Undo lost the input-rule space: ${undone.text}`);
    check(await editor().evaluate(n => n === document.activeElement), `${route} input-rule Undo lost editor focus`);
    // Input-rule Undo is not native history Undo. Undo its transaction before comparing Redo too.
    await page.keyboard.press('Control+z');
    check(await editor().evaluate(n => n.editor.can().redo()), 'Missing history step for Redo comparison');
    if (route === 'keyboard') await page.keyboard.press('Control+y');
    else await run('Redo');
    const redone = await editor().evaluate(n => ({ document:n.editor.getJSON(), selection:n.editor.state.selection.toJSON() }));
    check(await editor().evaluate(n => n === document.activeElement), `${route} Redo lost editor focus`);
    inputRuleResults.push({undone, redone});
    await run('Reload');
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
  await page.getByRole('button', {name:'Find documents and commands',exact:true}).click();
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
  await run('Undo');
  check(await snapshot() === baseline471, 'Second Undo did not reach the original document');
  await open('> undo');
  check(await undo471.getAttribute('aria-disabled') === 'true', 'Undo available with empty history');
  await input().fill('> redo');
  check((await center().getByRole('option', {name:'Redo',exact:true}).innerText()).includes('Ctrl+Y'), 'Redo shortcut hint missing');
  await page.keyboard.press('Enter'); await center().waitFor({state:'detached'});
  check(await snapshot() === first471, 'Redo did not apply exactly one history step');
  check(await editor().evaluate(n => n === document.activeElement), 'Redo did not return editor focus');
  await run('Redo');
  check(await snapshot() === second471, 'Second Redo did not restore formatting');
  await open('> redo');
  check(await center().getByRole('option', {name:'Redo',exact:true}).getAttribute('aria-disabled') === 'true', 'Redo available with empty future history');
  await page.keyboard.press('Escape'); await center().waitFor({state:'detached'});
  await run('Undo'); await run('Undo');

  for (const dismissal of ['Escape', 'Close', 'outside click']) {
    const guideSelection = await editor().evaluate(n => JSON.stringify(n.editor.state.selection.toJSON()));
    const fromTrigger = dismissal === 'Close';
    if (fromTrigger) {
      await page.getByRole('button', {name:'Find documents and commands',exact:true}).focus();
      await page.getByRole('button', {name:'Find documents and commands',exact:true}).click();
      await waitForInput();
      await input().fill('> keyboard shortcuts');
      await page.keyboard.press('Enter'); await center().waitFor({state:'detached'});
    } else await run('Keyboard shortcuts');
    const guide = page.getByRole('dialog', {name:'Keyboard shortcuts',exact:true});
    await guide.waitFor();
    check((await guide.innerText()).includes('Apply properties') && (await guide.innerText()).includes('Ctrl+Enter'), 'Property Apply shortcut is missing');
    check((await guide.innerText()).includes('Line break') &&
      (await guide.innerText()).includes('Shift+Enter'), 'Line-break shortcut is missing from the guide');
    check((await guide.innerText()).includes('Ctrl+/') && (await guide.innerText()).includes('Ctrl+S'), 'General shortcut hints missing');
    if (dismissal === 'Escape') for (const [label, hint] of [
      ['Bullet list','Ctrl+Shift+8'], ['Numbered list','Ctrl+Shift+7'],
      ['Code block','Ctrl+Alt+C'], ['Go to document end','Ctrl+End'],
    ]) {
      await guide.getByText(label,{exact:true}).scrollIntoViewIfNeeded();
      check(await guide.getByText(hint,{exact:true}).isVisible(), `${label} shortcut is missing or unreachable`);
    }
    if (screenshots) await page.screenshot({path:'tmp/command-center/shortcuts-471.png'});
    if (dismissal === 'Escape') await page.keyboard.press('Escape');
    else if (dismissal === 'outside click') await page.locator('[data-slot="dialog-overlay"]').click({position:{x:8,y:8}});
    else await guide.getByRole('button', {name:'Close',exact:true}).click();
    await guide.waitFor({state:'detached'});
    const focus = fromTrigger ? page.getByRole('button', {name:'Find documents and commands',exact:true}) : editor();
    check(await focus.evaluate(n => n === document.activeElement), `${dismissal} did not restore focus from the shortcut guide`);
    check(await snapshot() === baseline471, 'Shortcut guide edited the document');
    check(await editor().evaluate(n => JSON.stringify(n.editor.state.selection.toJSON())) === guideSelection,
      `${dismissal} changed the retained editor selection through the shortcut guide`);
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
  const trigger = page.getByRole('button',{name:'Find documents and commands',exact:true});
  check(await trigger.getAttribute('title') === 'Find documents and commands (Ctrl+/)' &&
    await trigger.getAttribute('aria-keyshortcuts') === 'Control+/ Meta+/', 'Center shortcut label mismatch');
  check(await trigger.locator('.command-center-action').innerText() === 'Find documents and commands', 'Trigger does not name its action');
  result.nonConflictingCodeShortcut = true;

  // The center is also available before opening a document, with document actions disabled.
  await page.getByRole('button', {name:'Close technical-document.md',exact:true}).click();
  await page.getByTestId('document-start').waitFor();
  await page.getByRole('button', {name:'Find documents and commands',exact:true}).click();
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
  check(await input().getAttribute('placeholder') === 'Search open tabs, loaded documents and commands', 'Search placeholder conceals its scope');
  check(await center().getByText('Documents come from open tabs and loaded folder lists. Expand unread subfolders to include their documents; refresh folders to update loaded lists.',{exact:true}).isVisible(), 'No-match guidance conceals unread subfolders');
  await page.keyboard.press('Escape');
  await center().waitFor({state:'detached'});

  // Both language aliases dispatch New before any folder/document exists, then cancel safely.
  for (const query of ['new document', '새 문서']) {
    const returnTarget = await page.evaluateHandle(() => document.activeElement);
    await run('New document…', query);
    await page.getByTestId('folder-path').waitFor();
    check(await page.getByTestId('new-file-name').count() === 0, 'New skipped location choice without an opened folder');
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({state:'detached'});
    check(await page.evaluate(target => target === document.activeElement, returnTarget), 'New command did not return focus after location cancellation');
    await returnTarget.dispose();
  }

  await openPath(page, file('technical-1.md'));
  // Search only listings already held by the sidebar, including collapsed cached children.
  const openFolder = async path => {
    await run('Open folder…');
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
  check(await center().locator('.command-center-empty').isVisible(), 'Unlisted subfolder has no scope guidance');
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

  // Ensure settings search matches a Refresh folder path on every checkout and OS.
  await openFolder([root, 'tmp', 'command-center-settings'].join(sep));

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
  const visual = center().locator('[role=option]:not([aria-disabled=true])').nth(1);
  check(await visual.getAttribute('data-highlighted') !== null, 'First Down after typing did not move to the next result');
  const highlighted = await visual.evaluate(n => {
    const probe=document.createElement('span');n.append(probe);
    probe.style.background='var(--id-color-surface-selected)';probe.style.color='var(--id-color-text-selected)';probe.style.borderRadius='var(--id-radius-md)';
    const c=getComputedStyle(n),p=getComputedStyle(probe),result={background:c.backgroundColor,selected:p.backgroundColor,text:c.color===p.color,radius:c.borderRadius===p.borderRadius,shadow:c.boxShadow};
    probe.style.background='var(--id-color-surface-selected-hover)';result.selectedHover=getComputedStyle(probe).backgroundColor;probe.remove();return result;
  });
  const settings = center().getByRole('option',{name:'Settings',exact:true});
  await settings.hover();
  check(await settings.getAttribute('data-highlighted') !== null &&
    await center().locator('[data-highlighted]').count() === 1 &&
    await input().getAttribute('aria-activedescendant') === await settings.getAttribute('id'), 'Hover and keyboard active result diverged');
  check(highlighted.background === highlighted.selected && highlighted.text && highlighted.radius && highlighted.shadow === 'none' &&
    await settings.evaluate(n => getComputedStyle(n).backgroundColor) === highlighted.selectedHover && highlighted.selectedHover !== highlighted.selected,
    'Command center must use selected background/text, selected-hover and control radius without a marker');
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
  const settingsMatches = await run('Settings');
  check(settingsMatches.includes('Refresh folder'), 'Settings search did not exercise a matching folder path');
  await page.getByTestId('settings-dialog').waitFor();
  await page.waitForFunction(() => document.querySelector('[data-testid="settings-dialog"]')?.contains(document.activeElement), null, {timeout:5000});
  await page.keyboard.press('Control+Slash');
  check(await center().count()===0 && await page.getByRole('dialog').count()===1, 'Center opened over Settings');
  await page.keyboard.press('Control+Quote');
  check(await page.getByTestId('link-form').count()===0, 'Link form opened over Settings');
  await page.keyboard.press('Escape');
  await page.getByTestId('settings-dialog').waitFor({state:'detached'});
  const folderReturnTarget = await page.evaluateHandle(() => document.activeElement);
  await run('Open folder…');
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
  // No explicit Outline choice yet: wait for the wide-layout default to commit.
  // An immediate isVisible + toggle can close it as the matchMedia handler opens it.
  await panel.waitFor();
  await panel.getByRole('button').first().focus();
  await run('Hide outline');
  await panel.waitFor({state:'detached'});
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label')==='Outline', null, {timeout:5000});
  await run('Show outline');
  await panel.waitFor();
  await page.getByRole('button',{name:'Collapse sidebar',exact:true}).focus();
  await run('Collapse sidebar');
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label')==='Expand sidebar', null, {timeout:5000});
  await run('Expand sidebar');
  result.panelCommandsRetainFocus = true;

  // Resolve the exact named command even when folder paths match the same search words.
  const documentSettings = page.getByRole('region', {name:'Document settings',exact:true}).locator('.display-settings');
  for (const query of ['document settings', '문서 설정']) {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await run('Document settings…', query);
    await documentSettings.waitFor();
    await page.getByRole('button',{name:'Document settings',exact:true}).and(page.locator(':focus')).waitFor();
    const revealed = await page.getByRole('button',{name:'Document settings',exact:true}).evaluate(n => ({top:n.getBoundingClientRect().top, bottom:n.getBoundingClientRect().bottom, header:document.querySelector('.app-header').getBoundingClientRect().bottom, height:innerHeight}));
    check(revealed.top>=revealed.header && revealed.bottom<=revealed.height, `Document settings is hidden behind the header: ${JSON.stringify(revealed)}`);
    await page.keyboard.press('Escape');
    await documentSettings.waitFor({state:'hidden'});
    check(await page.getByRole('button',{name:'Document settings',exact:true}).evaluate(n=>n===document.activeElement), 'Document settings command did not focus its disclosure');
  }
  result.documentSettingsCommands = true;
  const wideToggle = page.getByRole('button',{name:'Wide document',exact:true});
  const wasWide = await wideToggle.getAttribute('aria-pressed') === 'true';
  const beforeWidthCommand = {document:await snapshot(),status:await page.getByTestId('status').innerText()};
  await run(wasWide ? 'Standard document width' : 'Wide document');
  check((await wideToggle.getAttribute('aria-pressed') === 'true') !== wasWide, 'Width command did not toggle the TopBar control');
  await run(wasWide ? 'Wide document' : 'Standard document width');
  check((await wideToggle.getAttribute('aria-pressed') === 'true') === wasWide &&
    await snapshot() === beforeWidthCommand.document && await page.getByTestId('status').innerText() === beforeWidthCommand.status,
    'Width commands changed the document or failed to restore the device view');
  result.documentWidthCommands = true;

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
  await run('Undo');
  check(!(await editor().innerText()).includes('command center edit'), 'Tab search lost undo');
  await run('Redo');
  // Hold the actual Save response to observe the same disabled actions and tab restrictions.
  let releaseSave;
  const saveGate = new Promise(resolve => { releaseSave = resolve; });
  const holdSave = async route => {
    if (route.request().method()==='POST') await saveGate;
    await route.continue();
  };
  await page.route('**/api/document', holdSave);
  try {
    await run('Save');
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
  await run('Reload');
  const reloaded = await reloadResponse;
  check(reloaded.ok(), 'Reload request failed');
  await reloaded.finished();
  await page.getByRole('dialog').waitFor({state:'detached'});
  await ready();
  check((await editor().innerText()).includes('command center edit'), 'Reload lost the saved content');
  result.tabStateAndSaveReload = true;
  await run('Source');
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
  await run('Visual');
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

  // Collect both desktop regressions before reporting so narrow captures use the same state.
  const guideFailures = [];
  const inspectGuide = async (guide, width, language) => {
    const geometry = await guide.evaluate(n => {
      const labels = [...n.querySelectorAll('dt')];
      return {
        rows: labels.length,
        wrapped: labels.filter(label => label.parentElement.getBoundingClientRect().height >
          parseFloat(getComputedStyle(label).lineHeight) + 1).map(label => label.textContent),
        alias: /я/i.test(n.textContent),
        overflow: n.scrollWidth > n.clientWidth || document.documentElement.scrollWidth > innerWidth,
      };
    });
    check(geometry.rows > 0, 'Shortcut guide has no entries');
    if (width >= 1280 && geometry.wrapped.length) guideFailures.push(`${language} ${width}: wrapped entries: ${geometry.wrapped.join(', ')}`);
    if (geometry.alias) guideFailures.push(`${language} ${width}: Russian layout alias is shown`);
    if (geometry.overflow) guideFailures.push(`${language} ${width}: horizontal overflow`);
  };
  // The top-center entry and popup stay usable with panels and at narrow width.
  for (const width of [1440,1280,1024,768,640]) {
    await page.setViewportSize({width,height:900});
    const trigger = page.getByRole('button',{name:'Find documents and commands',exact:true});
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
    if (width === 1440 || width === 1280 || width === 640) {
      await run('Keyboard shortcuts');
      const guide = page.getByRole('dialog',{name:'Keyboard shortcuts',exact:true});
      await guide.waitFor();
      const bounds = await guide.boundingBox();
      check(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width && bounds.y >= 0 && bounds.y + bounds.height <= 900,
        `Shortcut guide clipped at ${width}`);
      check(await guide.evaluate(n => n.scrollWidth <= n.clientWidth), `Shortcut guide overflows at ${width}`);
      if (screenshots) await page.screenshot({path:`tmp/command-center/shortcuts-${width}-471.png`});
      await inspectGuide(guide, width, 'en');
      await guide.getByText('Code block',{exact:true}).scrollIntoViewIfNeeded();
      check(await guide.getByText('Ctrl+Alt+C',{exact:true}).isVisible(), `Code shortcut unreachable at ${width}`);
      if (screenshots) await page.screenshot({path:`tmp/command-center/shortcuts-code-${width}-471.png`});
      await guide.getByText('Next / previous cell',{exact:true}).scrollIntoViewIfNeeded();
      check(await guide.evaluate(n => n.scrollWidth <= n.clientWidth), `Lower shortcut groups overflow at ${width}`);
      await page.keyboard.press('Escape'); await guide.waitFor({state:'detached'});
    }
  }
  result.responsiveCenter = true;
  if (await page.getByRole('button',{name:'Collapse sidebar',exact:true}).isVisible())
    await page.getByRole('button',{name:'Collapse sidebar',exact:true}).click();
  await run('Expand sidebar');
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label')==='Collapse sidebar', null, {timeout:5000});
  await page.getByRole('button',{name:'Collapse sidebar',exact:true}).focus();
  await run('Collapse sidebar');
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label')==='Expand sidebar', null, {timeout:5000});
  result.narrowSidebarFocus = true;
  await run('Expand sidebar');
  await run('Settings');
  await page.getByTestId('ui-language').selectOption('ko');
  await page.keyboard.press('Escape'); await page.getByTestId('settings-dialog').waitFor({state:'detached'});
  await page.getByRole('button',{name:'문서·명령 찾기',exact:true}).click();
  await waitForInput();
  const korean = page.getByRole('dialog',{name:'커맨드 센터',exact:true});
  check(await korean.getByRole('combobox').getAttribute('placeholder') === '열린 탭·읽어 온 문서·명령 검색', 'Korean scope placeholder missing');
  await korean.getByRole('combobox').fill('no-match-556');
  check(await korean.getByText('문서는 열린 탭과 읽어 온 폴더 목록에서 찾습니다. 아직 읽지 않은 하위 폴더는 펼쳐야 포함되며, 폴더를 새로고침하면 읽어 온 목록이 갱신됩니다.',{exact:true}).isVisible(), 'Korean no-match scope guidance missing');
  await korean.getByRole('combobox').fill('> save');
  check(await korean.getByRole('option',{name:'저장',exact:true}).count()===1, 'English alias did not find a Korean command');
  await korean.getByRole('combobox').fill('> 저장');
  check(await korean.getByRole('option',{name:'저장',exact:true}).count()===1, 'Korean command search failed');
  const koreanMatches = await korean.getByRole('option').count();
  check(await korean.getByRole('option',{name:'저장 전 변경 내용 보기',exact:true}).count() === 1, 'Korean Save comparison command missing');
  check(await korean.getByTestId('command-center-count').innerText() === `검색 결과 ${koreanMatches}개`, 'Korean result count missing');
  if (screenshots) await page.screenshot({path:'tmp/command-center/search-ko-640.png'});
  await korean.getByRole('combobox').fill('> keyboard shortcuts');
  await page.keyboard.press('Enter'); await korean.waitFor({state:'detached'});
  const koreanGuide = page.getByRole('dialog',{name:'키보드 단축키',exact:true});
  await koreanGuide.waitFor();
  check((await koreanGuide.innerText()).includes('줄바꿈') && (await koreanGuide.innerText()).includes('Shift+Enter'),
    'Korean shortcut guide is missing the line-break entry');
  check(await koreanGuide.evaluate(n => n.scrollWidth <= n.clientWidth), 'Korean guide overflows on narrow');
  if (screenshots) await page.screenshot({path:'tmp/command-center/shortcuts-ko-640-471.png'});
  await inspectGuide(koreanGuide, 640, 'ko');
  await page.setViewportSize({width:1440,height:900});
  await koreanGuide.evaluate(n => n.scrollTop = 0);
  if (screenshots) await page.screenshot({path:'tmp/command-center/shortcuts-ko-1440-496.png'});
  await inspectGuide(koreanGuide, 1440, 'ko');
  await page.setViewportSize({width:640,height:900});
  await page.keyboard.press('Escape'); await koreanGuide.waitFor({state:'detached'});
  await page.getByRole('button',{name:'문서·명령 찾기',exact:true}).click(); await waitForInput();
  await korean.getByRole('combobox').fill('> settings');
  await korean.getByRole('option',{name:'설정',exact:true}).click();
  await page.getByTestId('ui-language').selectOption('en');
  await page.keyboard.press('Escape'); await page.getByTestId('settings-dialog').waitFor({state:'detached'});
  result.bilingualSearch = true;
  check(guideFailures.length === 0, guideFailures.join('\n'));

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
    await page.setViewportSize({width:640,height:900});
    const box = await count.boundingBox();
    check(box && box.x >= 0 && box.x + box.width <= 640, 'Result count clipped on narrow');
    if (screenshots) await page.screenshot({path:'tmp/command-center/limited-640.png'});
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
  // #528: the existing entry works with an open tab, follows live UI language, and
  // uses the same Open path from the start screen. Samples are disposable worktree copies.
  const sampleTitles = {en:'Current control for a 48 V converter',ko:'48 V 전력 변환기의 전류 제어 설계'};
  check(loaded.samples?.en && loaded.samples?.ko, 'Development Host omitted localized sample folders');
  for (const language of ['en','ko']) {
    await page.getByRole('button', {name:'Settings', exact:true}).click();
    await page.getByTestId('ui-language').selectOption(language);
    await page.keyboard.press('Escape');
    await page.getByTestId('settings-dialog').waitFor({state:'detached'});
    const commandName = language === 'ko' ? '샘플 문서 열기' : 'Open sample document';
    await page.keyboard.press('Control+Slash');
    const dialog = page.getByRole('dialog', {name:language === 'ko' ? '커맨드 센터' : 'Command center',exact:true});
    await dialog.getByRole('combobox').fill('> sample');
    await dialog.getByRole('option', {name:commandName,exact:true}).click();
    await dialog.waitFor({state:'detached'});
    await waitForActivePath(page, loaded.samples[language]);
    check(await editor().locator('h1').innerText() === sampleTitles[language], 'Command opened the wrong sample language');
    await editor().getByTestId("figure-image").waitFor();
    await page.waitForFunction(() => [...document.querySelectorAll('[data-document-tab][data-active=true] [data-block="figure"] img')].every(img => img.complete && img.naturalWidth > 0));
    await editor().getByTestId("mermaid-preview").locator("img").waitFor();
    check(await editor().locator('[data-block="figure"]').count() === 2, 'Sample figures were not rendered');
    if (screenshots) for (const width of [1440,640]) {
      await page.setViewportSize({width,height:900});
      await page.evaluate(async () => { await document.fonts.ready; document.activeElement?.blur(); document.querySelector('.document-column')?.scrollTo(0,0); window.scrollTo(0,0); });
      await page.mouse.move(0,0);
      await page.screenshot({path:`tmp/command-center/sample-${language}-${width}.png`});
      for (const [region,target] of [['image',editor().locator('[data-block="figure"]').first()],['mermaid',editor().getByTestId('mermaid-preview')]]) {
        await target.scrollIntoViewIfNeeded();
        await page.screenshot({path:`tmp/command-center/sample-${language}-${width}-${region}.png`});
      }
      await editor().locator('h1').scrollIntoViewIfNeeded();
    }
  }
  // Reload into a real localized start offer; opening the sample uses the same retained mapping.
  await page.route('**/api/document', route => route.fulfill({json:{start:true,samples:loaded.samples}}));
  await page.evaluate(() => localStorage.removeItem('ieumdoc.openTabs'));
  page.once('dialog', dialog => dialog.accept());
  await page.reload();
  await page.getByTestId('document-start').waitFor();
  await page.getByRole('button',{name:'샘플 문서 열기',exact:true}).click();
  await waitForActivePath(page, loaded.samples.ko);
  check(await editor().locator('h1').innerText() === sampleTitles.ko, 'Start screen opened the wrong sample language');
  await page.unroute('**/api/document');
  await page.getByRole('button',{name:'설정',exact:true}).click();
  await page.getByTestId('ui-language').selectOption('en');
  await page.keyboard.press('Escape');
  result.localizedSamples = {command:true,start:true,languages:['en','ko']};
  return result;
}
