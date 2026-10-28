// Document-level bibliography edits use ordinary Save; resource refresh never replaces the body.
async (page, { openPath, reloadDocument, waitForEditorFocus, bibliographyFixture, screenshots }) => {
  page.setDefaultTimeout(15000);
  const assert = (ok, message) => { if (!ok) throw Error(message); };
  const origin = page.url().split('/').slice(0, 3).join('/');
  const initial = await (await page.request.get(origin + '/api/document')).json();
  const sep = initial.path.includes('\\') ? '\\' : '/';
  const file = [...initial.path.split(sep).slice(0, -4), 'tmp', 'bibliography', 'connect.md'].join(sep);
  const unused = file.replace('connect.md', 'unused.md');
  const regressions = [];
  const references = () => page.locator('[data-document-tab][data-active=true]').getByRole('region', { name: 'References', exact: true, includeHidden: true });
  const save = async () => {
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.locator('[data-testid="status"][data-operation="saved"]').waitFor();
  };
  await openPath(page, unused);
  if (await references().count()) regressions.push('Unused document must have no References area');
  if (screenshots) await page.screenshot({ path: 'tmp/visual-refinement/references-unused-1280.png', fullPage: true });
  const settings = page.getByRole('button', { name: 'Document settings', exact: true });
  const settingsDialog = page.getByRole('region', {name:'Document settings',exact:true}).locator('.display-settings');
  for (const entry of ['Document settings', 'command center']) {
    if (entry === 'Document settings') {
      await settings.click(); await settingsDialog.waitFor();
      if (screenshots) await page.screenshot({path:'tmp/visual-refinement/references-document-settings-1280.png'});
    }
    let connect;
    if (entry === 'Document settings') connect = settingsDialog.getByRole('button', { name: 'Connect bibliography…', exact: true });
    else {
      await page.keyboard.press('Control+/');
      await page.getByRole('combobox', { name: 'Search documents and commands', exact: true }).fill('> Connect bibliography');
      connect = page.getByRole('option', { name: 'Connect bibliography…', exact: true });
    }
    if (!await connect.count()) {
      regressions.push(`${entry} must offer Connect bibliography`);
      if (entry === 'command center') await page.keyboard.press('Escape');
      continue;
    }
    await connect.click();
    await page.getByRole('group', { name: 'Bibliography files in this folder', exact: true }).waitFor();
    assert(await references().count() === 0, 'Opening the connection UI alone leaves an unused document without References');
    await page.getByRole('button', { name: 'Connect refs.bib', exact: true }).click();
    await page.getByRole('dialog', {name:'Connect bibliography…',exact:true}).waitFor({state:'detached'});
    if(entry==='Document settings') {
      await connect.and(page.locator(':focus')).waitFor();
      assert(await connect.evaluate(n=>n===document.activeElement),'Bibliography must return focus to Connect');
      await page.keyboard.press('Escape');
    }
    assert(await references().count() === 1, `${entry} connection shows References before Save`);
    assert(!(await (await page.request.get(`${origin}/api/document?path=${encodeURIComponent(unused)}`)).json()).source.includes('bibliography:'), `${entry} stages without writing`);
    await save(); await reloadDocument(page);
    await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({ state: 'attached' });
    assert(await references().count() === 1, `${entry} declaration survives Save and Reload without citations`);
    await references().getByRole('button', { name: 'Disconnect refs.bib', exact: true }).click();
    assert(await references().count() === 0, 'Staged removal of the only declaration hides unused References');
    await save(); await reloadDocument(page);
    await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({ state: 'attached' });
    assert(await references().count() === 0, 'Disconnection survives Save and Reload');
  }
  await openPath(page, file);
  assert(await references().count() === 1, 'A citation alone shows References');
  await page.locator('[data-citation]').hover();
  await page.getByTestId('citation-edit').click();
  // Keep Remove's queued focus behind the next input, as in the CI failure (#489).
  await page.getByTestId('citation-remove').evaluate(button => {
    const schedule = window.requestAnimationFrame;
    window.citationRemoveFrames = [];
    window.requestAnimationFrame = callback => { window.citationRemoveFrames.push(callback); return 0; };
    try { button.click(); } finally { window.requestAnimationFrame = schedule; }
  });
  if (await references().count()) regressions.push('Removing the last citation with no declaration must hide References');
  let focusWaitResolved = false;
  const focusReturned = waitForEditorFocus(page).then(() => { focusWaitResolved = true; });
  try {
    assert(await page.evaluate(() => window.citationRemoveFrames.length > 0 && document.activeElement === document.body), 'Remove still owes the editor its focus');
    assert(!focusWaitResolved, 'The focus helper must remain pending while BODY has focus');
  } finally {
    await page.evaluate(() => { for (const frame of window.citationRemoveFrames.splice(0)) frame(performance.now()); });
    await focusReturned;
  }
  await page.keyboard.press('Control+z');
  assert(await references().count() === 1, 'Undo restores the citation and References');
  assert(regressions.length === 0, regressions.join('\n'));
  // Inserting into an unused document shows the region without a declaration or resource read.
  await openPath(page, unused);
  const unusedEditor = page.locator('[data-document-tab][data-active=true] .document-editor');
  await unusedEditor.evaluate(el => { const e = el.editor; e.commands.setTextSelection(e.state.doc.content.size - 1); e.view.focus(); });
  await page.keyboard.type(' /citation'); await page.keyboard.press('Enter');
  await page.getByTestId('citation-key').fill('article');
  await page.getByTestId('citation-apply').click();
  assert(await references().count() === 1, 'Inserting the first citation shows References');
  await unusedEditor.locator('[data-citation]').hover();
  await unusedEditor.getByTestId('citation-edit').click(); await page.getByTestId('citation-remove').click();
  assert(await references().count() === 0, 'Removing the inserted citation hides References again');
  await save();
  await openPath(page, file);
  const tab = page.locator('[data-document-tab][data-active=true]');
  const editor = tab.locator('.document-editor');
  const hash = bibliographyFixture.hash();
  const source = async () => (await (await page.request.get(`${origin}/api/document?path=${encodeURIComponent(file)}`)).json()).source;
  const type = async text => {
    await editor.evaluate(el => { const e = el.editor; e.commands.setTextSelection(e.state.doc.content.size - 1); e.view.focus(); });
    await page.keyboard.type(text);
  };
  await type(' Unsaved before connection.');
  await references().getByRole('button', { name: 'Connect bibliography…', exact: true }).click();
  await page.getByRole('button', { name: 'Connect refs.bib', exact: true }).click();
  const pending = tab.getByText('Save this document to load the connected bibliography files.', { exact: true });
  await pending.waitFor();
  assert((await editor.innerText()).includes('Unsaved before connection.'), 'Connecting preserves unsaved edits');
  assert(!(await source()).includes('bibliography:'), 'Connecting does not write before Save');
  await editor.click(); await page.keyboard.press('Control+z');
  assert(await pending.count() === 0, 'Connection is one undo step');
  assert((await editor.innerText()).includes('Unsaved before connection.'), 'Undo connection keeps earlier typing');
  await page.keyboard.press('Control+Shift+z'); await pending.waitFor();
  await page.evaluate(async () => { await document.fonts.ready; document.activeElement?.blur(); });
  await page.mouse.move(0, 0);
  if (screenshots) await page.screenshot({ path: 'tmp/visual-refinement/bibliography-connection-pending.png', fullPage: true });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByTestId('ui-language').selectOption('ko'); await page.keyboard.press('Escape');
  await page.getByTestId('settings-dialog').waitFor({ state: 'detached' });
  await tab.getByText('연결한 참고문헌 파일을 불러오려면 문서를 저장하세요.', { exact: true }).waitFor();
  assert(await tab.getByText('다른 앱에서 .bib 파일을 수정했다면 문서를 저장한 뒤 다시 불러오기를 선택해 참고문헌을 갱신하세요.', { exact: true }).count() === 1, 'Korean notices explain both Save and external changes');
  await page.setViewportSize({ width: 640, height: 812 });
  await tab.getByRole('button', { name: '참고문헌 파일 연결…', exact: true }).scrollIntoViewIfNeeded();
  assert(await page.locator('html').evaluate(el => el.scrollWidth <= innerWidth), 'Bibliography actions fit narrow width');
  assert(await tab.getByRole('button', { name: 'refs.bib 연결 해제', exact: true }).isVisible(), 'Korean disconnect stays actionable');
  await page.evaluate(() => document.activeElement?.blur()); await page.mouse.move(0, 0);
  if (screenshots) await page.screenshot({ path: 'tmp/visual-refinement/bibliography-connection-ko-640.png', fullPage: true });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole('button', { name: '설정', exact: true }).click();
  await page.getByTestId('ui-language').selectOption('en'); await page.keyboard.press('Escape');
  await page.getByTestId('settings-dialog').waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Source', exact: true }).click();
  await tab.getByTestId('source-view').waitFor();
  assert((await tab.getByTestId('source-view').innerText()).includes('refs.bib'), 'Source previews the staged Core operation');
  assert(await settings.count() === 0, 'Document settings is hidden in Source');
  await page.keyboard.press('Control+/');
  await page.getByRole('combobox', { name: 'Search documents and commands', exact: true }).fill('> Connect bibliography');
  assert(await page.getByRole('option', { name: 'Connect bibliography…', exact: true }).getAttribute('aria-disabled') === 'true', 'Command cannot connect from Source');
  await page.keyboard.press('Escape');
  await page.getByRole('dialog', { name: 'Command center', exact: true }).waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Visual', exact: true }).click();
  // Hold the successful response after disk commit to exercise edits after the submitted snapshot.
  let release;
  const held = new Promise(resolve => { release = resolve; });
  let committed;
  const disk = new Promise(resolve => { committed = resolve; });
  await page.route('**/api/document', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    const response = await route.fetch(); committed(); await held; await route.fulfill({ response });
  });
  if (await settings.getAttribute('aria-expanded') !== 'true') await settings.click();
  await page.getByRole('button',{name:'Reference style',exact:true}).click();
  await page.getByRole('menu',{name:'Reference style',exact:true}).and(page.locator(':focus-within')).waitFor();
  await page.keyboard.press('Control+s'); await disk;
  const styleMenu = page.getByRole('menu',{name:'Reference style',exact:true});
  if (await styleMenu.count()) {
    assert(await styleMenu.getByRole('menuitemradio').evaluateAll(items => items.length > 0 && items.every(n => n.getAttribute('aria-disabled') === 'true')), 'An already-open notation menu cannot change settings during Save');
    await page.keyboard.press('Escape'); await styleMenu.waitFor({state:'detached'});
  }
  assert(await page.getByRole('checkbox',{name:'Number headings',exact:true}).isDisabled(), 'Document settings cannot change during Save');
  await page.keyboard.press('Control+/');
  await page.getByRole('combobox', { name: 'Search documents and commands', exact: true }).fill('> Connect bibliography');
  assert(await page.getByRole('option', { name: 'Connect bibliography…', exact: true }).getAttribute('aria-disabled') === 'true', 'Command cannot connect during Save');
  await page.keyboard.press('Escape');
  await page.getByRole('dialog', { name: 'Command center', exact: true }).waitFor({ state: 'detached' });
  await type(' Typed during Save.'); release();
  await page.locator('[data-testid="status"][data-operation="saved-pending"]').waitFor();
  await page.unroute('**/api/document');
  assert(await pending.count() === 0, 'Successful Save finishes bibliography loading without a body Reload');
  assert((await editor.innerText()).includes('Typed during Save.'), 'Snapshot refresh keeps typing after submitted Save');
  assert(await editor.locator('[data-citation][data-readiness="complete"]').count() === 1, 'Existing citation resolves after Save');
  await type(' /feedb');
  await page.getByRole('menuitem', { name: /^conference ·/ }).waitFor();
  await page.keyboard.press('Enter');
  await type(' /citation'); await page.keyboard.press('Enter');
  await page.getByTestId('citation-form').waitFor();
  const input = page.getByTestId('citation-key');
  assert(await page.getByTestId('citation-form').getByRole('option', { name: /^book / }).count() === 1, 'Citation form offers loaded keys');
  await input.fill('book'); await page.getByTestId('citation-apply').click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.locator('[data-testid="status"][data-operation="saved"]').waitFor();
  const saved = await source();
  assert(saved.includes('refs.bib') && saved.includes('Typed during Save.') && saved.includes('{cite:p}`conference`') && saved.includes('{cite:p}`book`'), 'Save keeps declaration, edits and inserted citations');
  await reloadDocument(page);
  await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({ state: 'attached' });
  assert(await editor.locator('[data-citation][data-readiness="complete"]').count() === 3, 'Reload keeps declaration and resolution');
  await tab.getByRole('button', { name: 'Disconnect refs.bib', exact: true }).click(); await pending.waitFor();
  assert(await editor.locator('[data-citation][data-readiness="complete"]').count() === 3, 'Disconnect waits for Save');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.locator('[data-testid="status"][data-operation="saved"]').waitFor();
  assert(!(await source()).includes('bibliography:'), 'Disconnect removes declaration through ordinary Save');
  assert(await editor.locator('[data-citation][data-readiness="complete"]').count() === 0, 'Disconnected entries no longer resolve');
  await reloadDocument(page); await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({ state: 'attached' });
  assert(await tab.getByRole('button', { name: 'Disconnect refs.bib', exact: true }).count() === 0, 'Disconnect persists after Reload');
  // Review regressions: collect both findings so each is proved on the same pre-fix run.
  const failures = [];
  for (const index of [0, 1]) {
    const connected = file.replace('connect.md', `connected-${index}.md`);
    await openPath(page, connected);
    await references().getByRole('button', { name: 'Connect bibliography…', exact: true }).click();
    const choices = page.getByRole('group', { name: 'Bibliography files in this folder', exact: true });
    await choices.waitFor();
    if (await choices.getByRole('button', { name: 'Connect refs.bib', exact: true }).count()) failures.push(`P1: connected-${index} offers an equivalent refs.bib declaration`);
    if (await choices.getByRole('button', { name: 'Connect References [2024].bib', exact: true }).count()) failures.push(`P1: connected-${index} offers a Core-invalid filename`);
    await page.keyboard.press('Escape');
    await page.getByRole('dialog', { name: 'Connect bibliography…', exact: true }).waitFor({ state: 'detached' });
  }
  await openPath(page, file);
  await references().getByRole('button', { name: 'Connect bibliography…', exact: true }).click();
  const choices = page.getByRole('group', { name: 'Bibliography files in this folder', exact: true });
  const longName = 'References-' + 'unbroken'.repeat(18) + '.bib';
  const longCandidate = choices.getByRole('button', { name: `Connect ${longName}`, exact: true });
  await longCandidate.waitFor();
  await page.setViewportSize({ width: 640, height: 812 });
  // The shared modal now owns accessibility/focus; measure its candidates directly.
  await choices.scrollIntoViewIfNeeded();
  const geometry = await choices.evaluate(el => {
    const panel = el.getBoundingClientRect();
    const dialog = el.closest('[role="dialog"]');
    const popup = dialog.getBoundingClientRect();
    return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
      dialogWidth: dialog.clientWidth, dialogScrollWidth: dialog.scrollWidth,
      panelInsideDialog: panel.left >= popup.left && panel.right <= popup.right,
      buttons: [...el.querySelectorAll('button')].map(button => {
      const bounds = button.getBoundingClientRect();
      return { left: bounds.left, right: bounds.right, inside: bounds.left >= panel.left && bounds.right <= panel.right };
    }) };
  });
  if (geometry.scrollWidth > geometry.width || geometry.dialogScrollWidth > geometry.dialogWidth || !geometry.panelInsideDialog || geometry.buttons.some(button => !button.inside)) failures.push(`P2: candidate list overflows at 640px: ${JSON.stringify(geometry)}`);
  if (screenshots) {
    await page.evaluate(async () => { await document.fonts.ready; document.activeElement?.blur(); }); await page.mouse.move(0, 0);
    await page.screenshot({ path: 'tmp/visual-refinement/bibliography-candidates-640.png', fullPage: true });
  }
  assert(failures.length === 0, failures.join('\n'));
  assert(await longCandidate.getAttribute('title') === longName, 'Ellipsized candidate keeps its full filename in title and accessible name');
  await longCandidate.click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.locator('[data-testid="status"][data-operation="saved"]').waitFor();
  assert((await source()).includes(longName), 'The long valid candidate remains connectable and saves');
  await reloadDocument(page); await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({ state: 'attached' });
  assert(await tab.getByRole('button', { name: `Disconnect ${longName}`, exact: true }).count() === 1, 'Saved long filename survives Reload');
  assert(bibliographyFixture.hash() === hash, 'BibTeX bytes are never written');
}
