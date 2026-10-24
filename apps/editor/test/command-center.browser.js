// The command center only dispatches existing shell actions. These checks protect its focus,
// keyboard/modal handoff, active-tab targeting and real file Save/Reload integration.
async (page, { openDocument, activeDocument, screenshots = false }) => {
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
  const open = async (query = '', shortcut = 'Control+p') => {
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

  // The center is also available before opening a document, with document actions disabled.
  await page.getByRole('button', {name:'Close technical-document.md',exact:true}).click();
  await page.getByTestId('document-start').waitFor();
  await page.getByRole('button', {name:'Command center',exact:true}).click();
  await waitForInput();
  await input().fill('> save');
  check(await center().getByRole('option', {name:'Save',exact:true}).getAttribute('aria-disabled') === 'true', 'Save available without a document');
  await page.keyboard.press('Enter');
  check(await center().isVisible(), 'Disabled command dismissed the center');
  await input().fill('no-match-zzzz');
  check(await center().getByText('No matches',{exact:true}).isVisible(), 'No-match state missing');
  await page.keyboard.press('Escape');
  await center().waitFor({state:'detached'});

  await openDocument(page, file('technical-1.md')); await ready();
  // Search only listings already held by the sidebar, including collapsed cached children.
  const openFolder = async path => {
    await run('open folder');
    await page.getByTestId('folder-path').fill(path + sep);
    await page.getByTestId('folder-open').click();
    await page.getByRole('dialog').waitFor({state:'detached'});
    await page.locator(`[data-testid="folder"][data-root="${path.replaceAll('\\','\\\\')}"]`).waitFor();
  };
  const folderPath = file('').slice(0,-1);
  await openFolder(folderPath);
  const folder = page.getByTestId('folder').first();
  await folder.getByRole('treeitem',{name:'technical-8.md',exact:true}).waitFor();
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
  page.off('request', countSearchRequests);
  await page.keyboard.press('Escape'); await center().waitFor({state:'detached'});

  await folder.getByRole('treeitem',{name:'alpha',exact:true}).click();
  await folder.getByRole('treeitem',{name:'guide.md',exact:true}).waitFor();
  await folder.getByRole('treeitem',{name:'alpha',exact:true}).click();
  await open('guide.md');
  check(await center().getByRole('option',{name:'guide.md',exact:true}).count() === 1, 'Collapsed loaded folder omitted or unlisted sibling included');
  check((await center().getByRole('option',{name:'guide.md',exact:true}).innerText()).includes([folderPath,'alpha','guide.md'].join(sep)), 'Collapsed result has no path');
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
  await open('technical-8.md');
  await page.keyboard.press('Enter'); await center().waitFor({state:'detached'});
  await page.waitForFunction(() => document.querySelector('[data-testid="current-file"]')?.textContent === 'technical-8.md');
  await ready();
  await page.keyboard.type('opened384');
  check((await editor().innerText()).includes('opened384'), 'Unopened file did not focus its editor');
  await page.keyboard.press('Control+z');
  await open('technical-1.md');
  await page.keyboard.press('Enter'); await center().waitFor({state:'detached'});
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
    for (const [shortcut,expected] of [['Control+p','technical'],['Control+Shift+p','>technical']]) {
      await page.keyboard.press(shortcut);
      await page.keyboard.type('technical');
      await page.clock.runFor(50);
      await waitForInput();
      if (await input().inputValue() !== expected ||
        await editor().evaluate(n => JSON.stringify(n.editor.getJSON())) !== JSON.stringify(before.json)) {
        failures.push(`Immediate ${shortcut} typing lost search characters or edited the document`);
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
  await openDocument(page, file('technical-2.md')); await ready();
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

  await open('', 'Control+Shift+p');
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
  await page.keyboard.press('Control+p');
  check(await center().count()===0 && await page.getByRole('dialog').count()===1, 'Center opened over Settings');
  await page.keyboard.press('Escape');
  await page.getByTestId('settings-dialog').waitFor({state:'detached'});
  await run('open folder');
  await page.getByTestId('folder-path').waitFor();
  await page.waitForFunction(() => document.activeElement?.getAttribute('data-testid')==='folder-path', null, {timeout:5000});
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({state:'detached'});
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
  await openDocument(page, file('technical-2.md')); await ready();
  await open('technical-1');
  await page.keyboard.press('Enter');
  await center().waitFor({state:'detached'});
  await page.waitForFunction(() => document.querySelector('[data-testid="current-file"]')?.textContent === 'technical-1.md');
  check(await editor().evaluate(n => n.editor === window.commandCenterEditor && JSON.stringify(n.editor.getJSON())) === dirty, 'Tab search replaced the editor or dirty content');
  check(await page.getByTestId('equation-latex').inputValue() === 'command center draft', 'Tab search lost property draft');
  await page.getByTestId('equation-cancel').click();
  await editor().focus(); await page.keyboard.press('Control+z');
  check(!(await editor().innerText()).includes('command center edit'), 'Tab search lost undo');
  await page.keyboard.press('Control+Shift+z');
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

  await openDocument(page, file('alpha'+sep+'guide.md')); await ready();
  await openDocument(page, file('beta'+sep+'guide.md')); await ready();
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
  if (screenshots) await page.screenshot({path:'tmp/command-center/search-ko-375.png'});
  await korean.getByRole('combobox').fill('> settings');
  await page.keyboard.press('Enter');
  await page.getByTestId('ui-language').selectOption('en');
  await page.keyboard.press('Escape'); await page.getByTestId('settings-dialog').waitFor({state:'detached'});
  result.bilingualSearch = true;
  return result;
}
