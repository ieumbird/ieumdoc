async (page, { openFolderPicker, screenshots = false, fileActionsRoot, expect, recoveryRecords, activeDocument } = {}) => {
  const origin = page.url().split('/').slice(0, 3).join('/');
  const root = fileActionsRoot;
  const sep = root.includes('\\') ? '\\' : '/';
  const file = name => root + sep + name;
  const row = name => page.getByRole('treeitem', {name, exact:true});
  const dialog = page.getByRole('dialog');
  const menu = page.getByRole('menu');
  const rename = () => page.getByRole('menuitem', {name:'Rename…', exact:true});
  const cancel = async () => { await dialog.getByRole('button', {name:'Cancel', exact:true}).click(); await dialog.waitFor({state:'hidden'}); };
  const context = async (name, action) => {
    await row(name).click({button:'right'});
    await page.getByRole('menuitem', {name:action, exact:true}).click();
    await dialog.waitFor();
  };
  await openFolderPicker(page);
  await page.getByTestId('folder-path').fill(root + sep);
  await page.getByTestId('folder-open').click(); await row('a.md').waitFor();
  const nativeMenu = locator => locator.evaluate(node => node.dispatchEvent(new MouseEvent('contextmenu', {bubbles:true,cancelable:true})));
  expect(await nativeMenu(row('nested'))).toBe(true);
  expect(await nativeMenu(activeDocument(page))).toBe(true);
  await row('a.md').focus(); await row('a.md').press('Shift+F10'); await expect(rename()).toBeVisible();
  await page.keyboard.press('Escape'); await menu.waitFor({state:'hidden'}); await expect(row('a.md')).toBeFocused();
  await row('a.md').press('ContextMenu'); await expect(rename()).toBeVisible();
  await page.keyboard.press('Escape'); await menu.waitFor({state:'hidden'});
  const metadata = [];
  for (const width of [1440, 640]) {
    await page.setViewportSize({width, height:900});
    const expand = page.getByRole('button', {name:'Expand sidebar', exact:true});
    if (await expand.isVisible()) await expand.click();
    await page.emulateMedia({colorScheme:width === 640 ? 'dark' : 'light'});
    await expect(page.locator('html')).toHaveAttribute('data-theme',width === 640 ? 'dark' : 'light');
    await row('a.md').click({button:'right'}); await rename().waitFor();
    if (screenshots) await page.screenshot({path:`tmp/file-actions-evidence/after-menu-${width}.png`});
    await rename().click(); await dialog.waitFor();
    if (screenshots) await page.screenshot({path:`tmp/file-actions-evidence/after-rename-${width}.png`});
    expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true); await cancel();
    await context('a.md','Delete file…');
    if (screenshots) await page.screenshot({path:`tmp/file-actions-evidence/after-delete-${width}.png`});
    await expect(dialog.getByRole('button',{name:'Cancel',exact:true})).toBeFocused();
    expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    metadata.push(await page.evaluate(() => ({width:innerWidth,dpr:devicePixelRatio,zoom:visualViewport.scale,dark:matchMedia('(prefers-color-scheme:dark)').matches,font:getComputedStyle(document.body).fontFamily})));
    await cancel();
  }
  await page.setViewportSize({width:1440,height:900}); await page.emulateMedia({colorScheme:'light'});
  await row('a.md').click(); await expect(page.getByTestId('current-file')).toHaveText('a.md');
  const paragraph = activeDocument(page).locator('.document-editor p').first();
  await paragraph.click(); await page.keyboard.press('End'); await page.keyboard.type(' Changed.');
  await expect(page.getByRole('tab',{name:'a.md, Unsaved changes',exact:true})).toBeVisible();
  await expect.poll(async () => (await recoveryRecords(page)).some(record => record.path === file('a.md'))).toBe(true);
  const editor = await activeDocument(page).locator(".tiptap").elementHandle();
  let reads = 0;
  const track = request => { if(request.method()==='GET' && request.url().startsWith(origin+'/api/document?')) reads++; };
  page.on('request', track); await context('a.md','Rename…');
  await dialog.getByRole('textbox',{name:'File name',exact:true}).fill('b');
  await dialog.getByRole('button',{name:'Rename',exact:true}).click();
  await expect(dialog.getByRole('alert')).toContainText('already exists');
  await dialog.getByRole('textbox',{name:'File name',exact:true}).fill('renamed');
  await dialog.getByRole('button',{name:'Rename',exact:true}).click();
  await dialog.waitFor({state:'hidden'}); await row('renamed.md').waitFor();
  expect(reads).toBe(0); page.off('request',track);
  expect(await editor.evaluate(node => node === document.querySelector('[data-document-tab][data-active="true"] .tiptap'))).toBe(true);
  await expect(page.getByRole('tab',{name:'renamed.md, Unsaved changes',exact:true})).toBeVisible();
  const records = await recoveryRecords(page);
  expect(records.some(record => record.path === file('a.md'))).toBe(false);
  expect(records.some(record => record.path === file('renamed.md') && record.snapshot.file.path === record.path && record.recoveryText.includes('Changed.'))).toBe(true);
  await paragraph.click(); await page.keyboard.press('Control+z'); await expect(paragraph).toHaveText('Alpha.');
  await page.keyboard.press('Control+Shift+z'); await expect(paragraph).toContainText('Changed.');
  await page.getByTestId('save').click();
  await page.locator('[data-testid="status"][data-operation="saved"]').waitFor({state:'attached'});
  const saved = await (await page.request.get(origin+'/api/document?path='+encodeURIComponent(file('renamed.md')))).json();
  expect(saved.source).toContain('Changed.');
  // An inactive tab's dirty Figure caption blocks all writes, even though the image
  // path itself has not changed. The same dialog shows actionable save-first guidance.
  await row('ref.md').click(); await expect(page.getByTestId('current-file')).toHaveText('ref.md');
  const caption = () => activeDocument(page).getByTestId('figure-caption-content').first();
  await caption().click(); await page.keyboard.press('End'); await page.keyboard.type(' Applied edit.');
  await expect(page.getByRole('tab',{name:'ref.md, Unsaved changes',exact:true})).toBeVisible();
  await row('b.md').click(); await expect(page.getByTestId('current-file')).toHaveText('b.md');
  await context('diagram.svg','Rename…');
  await dialog.getByRole('textbox',{name:'File name',exact:true}).fill('updated');
  await dialog.getByRole('button',{name:'Rename',exact:true}).click();
  await expect(dialog.getByRole('alert')).toContainText('ref.md');
  for (const width of [1440, 640]) {
    await page.setViewportSize({width,height:900}); await page.evaluate(() => document.fonts.ready);
    if (screenshots) await page.screenshot({path:`tmp/file-actions-evidence/media-dirty-${width}.png`});
    expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  }
  await expect(dialog.getByRole('alert')).toContainText('Save these documents before renaming');
  await cancel(); await page.setViewportSize({width:1440,height:900});
  expect((await (await page.request.get(origin+'/api/document?path='+encodeURIComponent(file('ref.md')))).json()).source).not.toContain('Applied edit.');
  await row('ref.md').click(); await expect(caption()).toContainText('Applied edit.');
  await page.getByTestId('save').click(); await page.locator('[data-testid="status"][data-operation="saved"]').waitFor({state:'attached'});
  const editFigure = activeDocument(page).getByRole('button',{name:'Edit figure',exact:true});
  await editFigure.locator('..').hover({position:{x:4,y:4}}); await editFigure.click();
  await page.getByRole('textbox',{name:'Alt text',exact:true}).fill('Unapplied alt');
  await row('b.md').click(); await expect(page.getByTestId('current-file')).toHaveText('b.md');
  await context('diagram.svg','Rename…');
  await dialog.getByRole('textbox',{name:'File name',exact:true}).fill('updated');
  await dialog.getByRole('button',{name:'Rename',exact:true}).click();
  await expect(dialog.getByRole('alert')).toContainText('Save these documents before renaming the image: ref.md');
  await cancel(); await row('ref.md').click();
  await expect(page.getByRole('textbox',{name:'Alt text',exact:true})).toHaveValue('Unapplied alt');
  await page.getByRole('dialog',{name:'Figure 1 properties'}).getByRole('button',{name:'Cancel',exact:true}).click();
  await row('second-ref.md').click(); await expect(page.getByTestId('current-file')).toHaveText('second-ref.md');
  await page.getByRole('button',{name:'Source',exact:true}).click();
  await expect(activeDocument(page).getByTestId('source-view')).toBeVisible();
  const other = await page.context().newPage();
  try {
    await other.goto(origin+'/?path='+encodeURIComponent(file('ref.md')));
    await expect(other.getByTestId('current-file')).toHaveText('ref.md');
    await activeDocument(other).getByTestId('figure-caption-content').first().click();
    await other.keyboard.press('End'); await other.keyboard.type(' Other window.');
    await context('diagram.svg','Rename…');
    await dialog.getByRole('textbox',{name:'File name',exact:true}).fill('updated');
    await dialog.getByRole('button',{name:'Rename',exact:true}).click();
    await dialog.waitFor({state:'hidden'});
    expect(await activeDocument(page).getByTestId('source-view').count()).toBe(0);
    // Direct state after the operation: no polling/reload may mask a stale open tab.
    for (const name of ['ref.md','second-ref.md']) {
      const panel = await page.getByRole('tab',{name,exact:true}).getAttribute('aria-controls');
      const source = await page.locator('#'+panel).getByTestId('figure-image').getAttribute('src');
      expect(source).toContain('/updated.svg');
    }
    expect(await page.getByRole('tab',{name:/Unsaved changes/}).count()).toBe(0);
    await expect(page.getByTestId('notice')).toContainText('foreign.md');
    for (const name of ['ref.md','second-ref.md']) {
      const disk = await (await page.request.get(origin+'/api/document?path='+encodeURIComponent(file(name)))).json();
      expect(disk.source).toContain('./updated.svg');
      expect(disk.source).not.toContain('Other window.');
    }
    const conflict = other.waitForResponse(response => response.url().includes('/api/document') && response.request().method()==='POST');
    await other.getByTestId('save').click(); expect((await conflict).status()).toBe(409);
    await expect(other.getByText('Save conflict',{exact:true}).filter({visible:true})).toBeVisible();
    await expect(activeDocument(other)).toContainText('Other window.');
  } finally { await other.close(); }
  // Saving a newly edited, reloaded tab uses its new revision and cannot revert the image path.
  await row('ref.md').click(); await expect(caption()).toContainText('Applied edit.');
  await caption().click(); await page.keyboard.press('End'); await page.keyboard.type(' After rename.');
  await page.getByTestId('save').click(); await page.locator('[data-testid="status"][data-operation="saved"]').waitFor({state:'attached'});
  const rewritten = await (await page.request.get(origin+'/api/document?path='+encodeURIComponent(file('ref.md')))).json();
  expect(rewritten.source).toContain('./updated.svg'); expect(rewritten.source).toContain('After rename.');
  await row('renamed.md').click(); await expect(page.getByTestId('current-file')).toHaveText('renamed.md');
  await context('unused.svg','Rename…');
  await dialog.getByRole('textbox',{name:'File name',exact:true}).fill('free');
  await dialog.getByRole('button',{name:'Rename',exact:true}).click(); await dialog.waitFor({state:'hidden'});
  await expect(row('free.svg')).toBeFocused();
  await context('notes.txt','Delete file…'); await cancel(); await expect(row('notes.txt')).toBeFocused();
  await paragraph.click(); await page.keyboard.press('End'); await page.keyboard.type(' Unsaved.');
  await row('b.md').click(); await expect(page.getByTestId('current-file')).toHaveText('b.md');
  await context('renamed.md','Delete file…');
  await dialog.getByRole('button',{name:'Delete and discard changes',exact:true}).click(); await dialog.waitFor({state:'hidden'});
  await expect(row('renamed.md')).toHaveCount(0);
  expect((await recoveryRecords(page)).some(record => record.path === file('renamed.md'))).toBe(false);
  await expect(page.getByTestId('current-file')).toHaveText('b.md');
  expect(await page.getByTestId('sidebar').getByRole('treeitem').evaluateAll(nodes => nodes.includes(document.activeElement))).toBe(true);
  await context('notes.txt','Delete file…'); await dialog.getByRole('button',{name:'Delete file',exact:true}).click();
  await dialog.waitFor({state:'hidden'}); await expect(row('notes.txt')).toHaveCount(0);
  // The document locator used by existing Figure NodeViews and future uploads changes in place.
  await row('ref.md').click(); await expect(page.getByTestId('current-file')).toHaveText('ref.md');
  const figureBefore = await activeDocument(page).locator('[data-block="figure"]').elementHandle();
  await context('ref.md','Rename…');
  await dialog.getByRole('textbox',{name:'File name',exact:true}).fill('ref-renamed');
  await dialog.getByRole('button',{name:'Rename',exact:true}).click(); await dialog.waitFor({state:'hidden'});
  const image = activeDocument(page).getByTestId('figure-image');
  await expect(image).toHaveAttribute('src', new RegExp(encodeURIComponent(file('ref-renamed.md'))));
  expect(await figureBefore.evaluate(node => node.isConnected)).toBe(true);
  await expect.poll(() => image.evaluate(node => node.complete && node.naturalWidth > 0)).toBe(true);
  const upload = page.waitForRequest(request => request.method() === 'POST' && request.url().includes('/api/asset?'));
  await activeDocument(page).locator('.document-editor').evaluate(el => {
    el.editor.commands.focus('end');
    const bytes = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='), ch => ch.charCodeAt(0));
    const data = new DataTransfer(); data.items.add(new File([bytes], 'paste.png', {type:'image/png'}));
    el.dispatchEvent(new ClipboardEvent('paste', {clipboardData:data,bubbles:true,cancelable:true}));
  });
  expect(decodeURIComponent((await upload).url())).toContain(file('ref-renamed.md'));
  await expect(activeDocument(page).getByTestId('figure-image')).toHaveCount(2);
  await context('ref-renamed.md','Delete file…');
  await dialog.getByRole('button',{name:'Delete and discard changes',exact:true}).click(); await dialog.waitFor({state:'hidden'});
  await expect(page.getByTestId('current-file')).toHaveText('b.md');
  expect((await recoveryRecords(page)).some(record => record.path === file('ref-renamed.md'))).toBe(false);
  // Real session tickets in a second window precede its first persisted record. The file
  // action in this window must revoke them even though it cannot suspend that recorder.
  for (const action of ['delete', 'rename']) {
    const name = `race-${action}.md`;
    const other = await page.context().newPage();
    try {
      await other.goto(origin + '/?path=' + encodeURIComponent(file(name)));
      await expect(other.getByTestId('current-file')).toHaveText(name);
      await other.evaluate(async () => {
        const { recoveryStorage } = await import('/src/recovery-storage.ts');
        const write = recoveryStorage.write;
        recoveryStorage.write = async (...args) => {
          window.pendingRecoveryWrite = true;
          await new Promise(resolve => { window.releaseRecoveryWrite = resolve; });
          const result = await write(...args);
          window.pendingRecoveryResult = result;
          return result;
        };
      });
      await activeDocument(other).locator('.document-editor p').first().click();
      await other.keyboard.press('End'); await other.keyboard.type(' Delayed first record.');
      await other.waitForFunction(() => window.pendingRecoveryWrite === true);
      expect((await recoveryRecords(other)).filter(record => record.path === file(name))).toHaveLength(0);
      await context(name, action === 'delete' ? 'Delete file…' : 'Rename…');
      if (action === 'rename') await dialog.getByRole('textbox',{name:'File name',exact:true}).fill('race-renamed');
      await dialog.getByRole('button',{name:action === 'delete' ? 'Delete file' : 'Rename',exact:true}).click();
      await dialog.waitFor({state:'hidden'}); await expect(row(name)).toHaveCount(0);
      await other.evaluate(() => window.releaseRecoveryWrite());
      await other.waitForFunction(() => typeof window.pendingRecoveryResult === 'boolean');
      expect(await other.evaluate(() => window.pendingRecoveryResult)).toBe(false);
      expect((await recoveryRecords(other)).filter(record => record.path === file(name))).toHaveLength(0);
    } finally { await other.close(); }
  }
  return {metadata,root,renamedWithoutRead:true,undoPreserved:true,recoveryMovedAndDeleted:true,otherWindowFirstWriteRevoked:true,
    dirtyReferenceRefused:true,draftReferenceRefused:true,cleanReferenceTabsReloaded:true,otherWindowSaveConflict:true};
}
