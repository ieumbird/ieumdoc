async (page, { openDocument, reloadDocument, activeDocument, screenshots = false }) => {
  const check = (ok, why) => { if (!ok) throw new Error(why); };
  const origin = page.url().split('/').slice(0,3).join('/');
  const loaded = await (await page.request.get(`${origin}/api/document`)).json();
  const sep = loaded.path.includes('\\') ? '\\' : '/';
  const root = loaded.path.split(sep).slice(0,-4).join(sep);
  const file = [root, 'tmp', 'document-tabs', 'technical-1.md'].join(sep);
  const engine = target => activeDocument(target).locator('.document-editor');
  const ready = target => target.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
  const records = () => page.evaluate(async () => (await import('/src/recovery-storage.ts')).recoveryStorage.list());
  const count = async expected => {
    for (let attempt = 0; attempt < 100; attempt++) {
      if ((await records()).length === expected) return;
      await page.waitForTimeout(50);
    }
    throw new Error(`Expected ${expected} recovery records, found ${JSON.stringify(await records())}`);
  };
  const confirmPendingDeletion = async (dialog, actionName, whilePending = async () => {}) => {
    const before = await records();
    await page.evaluate(async () => {
      const {recoveryStorage:store} = await import('/src/recovery-storage.ts');
      const original = store.delete;
      const gate = new Promise(resolve => { window.releaseRecoveryDelete = resolve; });
      store.delete = async (...args) => {
        try { await gate; return await original.apply(store,args); }
        finally { store.delete = original; delete window.releaseRecoveryDelete; }
      };
    });
    await dialog.getByRole('button',{name:actionName,exact:true}).click();
    await page.waitForFunction(() => document.querySelector('[role="dialog"][aria-busy="true"]'));
    await whilePending(before);
    await page.mouse.click(2,2);
    check(await dialog.isVisible(), 'Outside click dismissed a pending deletion');
    check(await dialog.getByRole('button',{name:'Cancel',exact:true}).isDisabled(), 'Pending cancellation remained enabled');
    const pendingIds = new Set((await records()).map(record => record.id));
    check(before.every(record => pendingIds.has(record.id)), 'Pending deletion removed a record before storage completed');
    await page.evaluate(() => window.releaseRecoveryDelete());
    await dialog.waitFor({state:'hidden',timeout:5000});
  };
  const edit = (target, text) => engine(target).evaluate((node,text) => node.editor.commands.insertContentAt(1,text), text);
  const capture = async name => {
    if (!screenshots) return;
    for (const width of [1440,375]) {
      await page.setViewportSize({width,height:900});
      await page.waitForFunction(narrow => document.querySelector(".app-shell").classList.contains("app-shell--sidebar-overlay") === narrow, width < 640);
      await page.evaluate(async () => { await document.fonts.ready; window.scrollTo(0,0); });
      await page.screenshot({path:`tmp/296/${name}-${width}.png`});
      for (const dialog of await page.getByRole('dialog', {name:/^(Delete recovery record\?|복구 기록을 삭제할까요\?|Delete all recovery records\?)$/}).all()) {
        if (await dialog.isVisible()) check(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth), `${name} dialog content overflows at ${width}`);
      }
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name} overflows at ${width}`);
    }
    await page.setViewportSize({width:1440,height:900});
    await page.waitForFunction(() => !document.querySelector(".app-shell").classList.contains("app-shell--sidebar-overlay"));
  };
  // Opening/restoring must also work where the secure-context-only UUID API is absent.
  await page.addInitScript(() => Object.defineProperty(Crypto.prototype,'randomUUID',{value:undefined}));
  // Use the real start surface rather than a synthetic page or an alternate renderer.
  await page.route('**/api/document', route => route.request().method() === 'GET'
    ? route.fulfill({json:{start:true}}) : route.continue());
  await page.reload(); await ready(page);
  await page.getByText('No local recovery records.',{exact:true}).waitFor();
  await capture('empty');
  for (let i = 0; i < 8; i++) {
    await openDocument(page,file); await ready(page);
    await page.getByRole('button',{name:'Close technical-1.md',exact:true}).click();
    await page.getByTestId('document-start').waitFor();
  }
  check(await page.evaluate(async () => {
    const {RECOVERY_DB}=await import('/src/recovery-storage.ts');
    const db=await new Promise(resolve=>{const r=indexedDB.open(RECOVERY_DB);r.onsuccess=()=>resolve(r.result);});
    const keys=await new Promise(resolve=>{const r=db.transaction('barriers').objectStore('barriers').getAllKeys();r.onsuccess=()=>resolve(r.result);});
    db.close(); return !keys.some(Array.isArray);
  }), 'Repeated clean Open/Close leaves per-session metadata');
  await openDocument(page,file); await ready(page);
  await edit(page,'Recovered applied text. '); await count(1);
  const first = (await records())[0];
  check(first.snapshot.editor.savedDocument && first.snapshot.file.source && first.snapshot.file.revision, 'Opening/checkpoint absent');

  // A normal page reload keeps the record; opening its document offers it first.
  page.on('dialog', dialog => dialog.accept());
  await page.reload(); await ready(page);
  await page.getByRole('button',{name:'Review recovery'}).waitFor();
  await capture('list');
  await openDocument(page,file); await ready(page);
  await page.getByTestId('recovery-prompt').waitFor(); await capture('prompt');
  const beforeDelete = await records();
  const deleteButton = page.getByRole('button',{name:'Delete record',exact:true});
  await deleteButton.click();
  const deleteConfirm = page.getByRole('dialog',{name:'Delete recovery record?',exact:true});
  await deleteConfirm.waitFor({timeout:5000});
  await capture('delete-confirm');
  await page.evaluate(async () => (await import('/src/i18n.ts')).i18n.changeLanguage('ko'));
  const koreanConfirm = page.getByRole('dialog',{name:'복구 기록을 삭제할까요?',exact:true});
  check((await koreanConfirm.innerText()).includes(first.path) && (await koreanConfirm.innerText()).includes('이 작업은 되돌릴 수 없습니다.'), 'Korean confirmation lost its target or warning');
  await capture('delete-confirm-ko');
  await page.evaluate(async () => (await import('/src/i18n.ts')).i18n.changeLanguage('en'));
  check((await deleteConfirm.innerText()).includes(first.path), 'Delete confirmation omitted the record path');
  check((await deleteConfirm.innerText()).includes('This cannot be undone.'), 'Delete confirmation omitted irreversible loss');
  check(JSON.stringify(await records()) === JSON.stringify(beforeDelete), 'Opening confirmation deleted a record');
  await deleteConfirm.getByRole('button',{name:'Cancel',exact:true}).click();
  await deleteConfirm.waitFor({state:'hidden'});
  await page.waitForFunction(() => document.activeElement?.textContent === 'Delete record', null, {timeout:5000});
  check(JSON.stringify(await records()) === JSON.stringify(beforeDelete), 'Cancel changed recovery records');
  await deleteButton.click(); await deleteConfirm.waitFor({timeout:5000});
  await page.keyboard.press('Escape'); await deleteConfirm.waitFor({state:'hidden'});
  await page.waitForFunction(() => document.activeElement?.textContent === 'Delete record', null, {timeout:5000});
  check(JSON.stringify(await records()) === JSON.stringify(beforeDelete), 'Escape changed recovery records');

  await deleteButton.click(); await deleteConfirm.waitFor({timeout:5000});
  await page.mouse.click(2,2);
  await deleteConfirm.waitFor({state:'hidden',timeout:5000});
  await page.waitForFunction(() => document.activeElement?.textContent === 'Delete record', null, {timeout:5000});
  check(await page.getByTestId('recovery-prompt').isVisible(), 'Outside dismissal closed the parent recovery review');
  check(JSON.stringify(await records()) === JSON.stringify(beforeDelete), 'Outside dismissal changed recovery records');
  await page.keyboard.press('Control+s');
  check(JSON.stringify(await records()) === JSON.stringify([first]), 'Save shortcut bypassed recovery modal');
  await page.getByRole('button',{name:'Restore work',exact:true}).click();
  await page.getByTestId('recovery-prompt').waitFor({state:'detached'});
  await engine(page).getByText(/Recovered applied text/).waitFor();
  check(await engine(page).evaluate(n => !n.editor.can().undo()), 'Restored Undo history should be empty');
  await page.getByTestId('save').click();
  await page.locator('[data-testid="status"][data-operation="saved"]').waitFor(); await count(0);
  const disk = await (await page.request.get(`${origin}/api/document?path=${encodeURIComponent(file)}`)).json();
  check(disk.source.includes('Recovered applied text.'), 'Restored Save did not reach disk');
  await reloadDocument(page); await ready(page);
  check((await engine(page).innerText()).includes('Recovered applied text.'), 'Saved work did not survive Reload');

  // Real Save response held while newer input is applied: the next record must use its new acknowledgement.
  await edit(page,'Before delayed Save. '); await count(1);
  let releaseSave, saveArrived, savedRevision;
  const saveGate = new Promise(resolve => { releaseSave = resolve; });
  const saveStarted = new Promise(resolve => { saveArrived = resolve; });
  const delayedSave = async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    const response = await route.fetch();
    savedRevision = (await response.json()).revision;
    saveArrived(); await saveGate; await route.fulfill({response});
  };
  await page.route('**/api/document',delayedSave);
  try {
    await page.getByTestId('save').click(); await saveStarted;
    await edit(page,'During delayed Save. ');
    releaseSave();
    await page.locator('[data-testid="status"][data-operation="saved-pending"]').waitFor();
    for (let attempt = 0; attempt < 100; attempt++) {
      const record = (await records())[0];
      if (record?.snapshot.file.revision === savedRevision && record.recoveryText.includes('During delayed Save.')) break;
      if (attempt === 99) throw new Error('Recording after Save retained an old acknowledgement or lost newer input');
      await page.waitForTimeout(50);
    }
  } finally { releaseSave(); await page.unroute('**/api/document',delayedSave); }
  await page.reload(); await ready(page);
  await page.getByRole('button',{name:'Review recovery'}).click();
  await page.getByRole('button',{name:'Restore work',exact:true}).click();
  await page.getByTestId('recovery-prompt').waitFor({state:'detached'});
  await page.getByTestId('save').click();
  await page.locator('[data-testid="status"][data-operation="saved"]').waitFor(); await count(0);
  check((await (await page.request.get(`${origin}/api/document?path=${encodeURIComponent(file)}`)).json()).source.includes('During delayed Save.'), 'Restored newer edits did not replay against the acknowledged Save');

  // Save in one window must not clean another window, and restored work keeps its old revision.
  const other = await page.context().newPage();
  try {
    await other.goto(origin); await ready(other);
    await openDocument(other,file); await ready(other);
    await edit(page,'Window A. '); await edit(other,'Window B. '); await count(2);
    const before = await records();
    check(new Set(before.map(r => r.id)).size === 2, 'Windows share a session id');
    await page.getByTestId('save').click();
    await page.locator('[data-testid="status"][data-operation="saved"]').waitFor(); await count(1);
    check((await records())[0].recoveryText.includes('Window B.'), 'Saving A removed B');
  } finally { await other.close(); }
  await page.reload(); await ready(page); await count(1);
  await page.getByRole('button',{name:'Review recovery'}).click();
  await page.getByRole('button',{name:'Restore work',exact:true}).click();
  await page.getByTestId('recovery-prompt').waitFor({state:'detached'});
  await page.getByTestId('save').click();
  await page.locator('[data-testid="status"][data-operation="save-conflict"]').waitFor(); await count(1);
  check((await engine(page).innerText()).includes('Window B.'), 'Conflict lost restored work');

  // A failed Reload keeps both the live content and its record. A successful one deletes it.
  const reloadURL = '**/api/document?*';
  await page.route(reloadURL, route => route.fulfill({status:400,json:{error:'Test read unavailable'}}));
  await reloadDocument(page); await page.getByRole('button',{name:'Discard and reload'}).click();
  await page.getByText('Test read unavailable',{exact:true}).waitFor(); await count(1);
  await page.unroute(reloadURL);
  await reloadDocument(page); await page.getByRole('button',{name:'Discard and reload'}).click();
  await ready(page); await count(0);

  // Empty applied heading and a pending Figure are recoverable without canonical validation.
  await engine(page).evaluate(n => {
    const editor = n.editor;
    editor.view.dispatch(editor.state.tr.delete(1,editor.state.doc.firstChild.nodeSize-1));
    editor.commands.insertContentAt(editor.state.doc.content.size, {type:'figure',attrs:{sourcePath:'new:990001',imagePath:'',alt:'',caption:'',label:''}});
  });
  await count(1);
  const unsaveable = (await records())[0];
  await page.reload(); await ready(page);
  await page.getByRole('button',{name:'Review recovery'}).click();
  await page.getByRole('button',{name:'Restore work',exact:true}).click();
  await page.getByTestId('recovery-prompt').waitFor({state:'detached'});
  check(await engine(page).evaluate(n => n.editor.state.doc.firstChild.textContent === '' && [...n.editor.state.doc.content.content].some(node => node.type.name === 'figure' && !node.attrs.imagePath)), 'Unsaveable heading/pending Figure lost on restore');
  await page.getByTestId('save').click();
  await page.locator('[data-testid="status"][data-operation="save-failed"]').waitFor(); await count(1);
  // Tab Don't save explicitly deletes its record, unlike closing the window above.
  await page.getByRole('button',{name:'Close technical-1.md',exact:true}).click();
  await page.getByRole('button',{name:"Don't save",exact:true}).click(); await count(0);

  // Common Settings, clear with a scheduled write, and resuming only after another applied edit.
  await openDocument(page,file); await ready(page);
  await edit(page,'Before clear. '); await count(1);
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await capture('settings');
  await page.keyboard.press('Control+s');
  check(await page.getByTestId('status').getAttribute('data-operation') === 'ready', 'Save shortcut bypassed Settings modal');
  await page.getByRole('button',{name:'Clear all recovery records…',exact:true}).click();
  const clearConfirm = page.getByRole('dialog',{name:'Delete all recovery records?',exact:true});
  await clearConfirm.waitFor({timeout:5000});
  const beforeClear = await records();
  await clearConfirm.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.waitForFunction(() => document.activeElement?.textContent === 'Clear all recovery records…', null, {timeout:5000});
  check(JSON.stringify(await records()) === JSON.stringify(beforeClear), 'Cancel clear changed records');
  await page.getByRole('button',{name:'Clear all recovery records…',exact:true}).click();
  await clearConfirm.waitFor({timeout:5000});
  await page.mouse.click(2,2);
  await clearConfirm.waitFor({state:'hidden',timeout:5000});
  await page.waitForFunction(() => document.activeElement?.textContent === 'Clear all recovery records…', null, {timeout:5000});
  check(await page.getByTestId('settings-dialog').isVisible(), 'Outside dismissal closed Settings');
  check(JSON.stringify(await records()) === JSON.stringify(beforeClear), 'Outside clear dismissal changed records');
  await page.getByRole('button',{name:'Clear all recovery records…',exact:true}).click();
  await capture('clear-confirm');
  const laterWindow = await page.context().newPage();
  try {
    await laterWindow.goto(origin); await ready(laterWindow);
    await openDocument(laterWindow,file); await ready(laterWindow);
    await laterWindow.getByRole('button',{name:'Not now',exact:true}).click();
    await confirmPendingDeletion(clearConfirm, 'Delete all records', async before => {
      // Commit an existing record update and a new other-window record while deletion is gated.
      await edit(laterWindow,'Other window recorded during pending clear. ');
      await edit(page,'Recorded during pending clear. ');
      let committed = [];
      for (let attempt = 0; attempt < 100; attempt++) {
        committed = await records();
        if (committed.some(record => record.recoveryText.includes('Other window recorded during pending clear.')) &&
            committed.some(record => record.recoveryText.includes('Recorded during pending clear.'))) break;
        await page.waitForTimeout(50);
      }
      check(committed.some(record => !before.some(previous => previous.id === record.id) && record.recoveryText.includes('Other window recorded during pending clear.')), 'Concurrent write did not add another window record');
      check(before.some(previous => committed.some(record => record.id === previous.id && record.recoveryText.includes('Recorded during pending clear.') && record.recoveryText !== previous.recoveryText)), 'Concurrent write did not update an existing record');
      // Also leave writes scheduled at the actual Clear-all boundary to test invalidation below.
      await edit(laterWindow,'Other window scheduled before clear. ');
      await edit(page,'Scheduled before clear. ');
    }); await count(0);
    await page.waitForTimeout(650); await count(0);
    await edit(laterWindow,'Other window after clear. '); await count(1);
    check((await records())[0].recoveryText.includes('Other window after clear.'), 'Other window could not resume after clear');
    await laterWindow.getByRole('button',{name:'Close technical-1.md',exact:true}).click();
    await laterWindow.getByRole('button',{name:"Don't save",exact:true}).click(); await count(0);
  } finally { await laterWindow.close(); }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(650); await count(0);
  const equation = activeDocument(page).locator('[data-block="equation"]');
  await equation.hover(); await equation.getByRole('button',{name:'Edit',exact:true}).click();
  await page.getByTestId('equation-latex').fill('Unapplied recovery draft');
  await page.waitForTimeout(650); await count(0);
  await page.getByTestId('equation-cancel').click();
  await engine(page).evaluate(n => n.editor.commands.insertContentAt(n.editor.state.doc.content.size,{type:'paragraph',attrs:{sourcePath:'new:990002'}}));
  await page.waitForTimeout(650); await count(0);
  await edit(page,'After clear. '); await count(1);

  // Quota failure is persistent UI, and does not prevent input or Save.
  await page.evaluate(() => {
    window.originalRecoveryPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(...args) {
      if (this.name === 'records') throw new DOMException('Storage quota exceeded', 'QuotaExceededError');
      return window.originalRecoveryPut.apply(this,args);
    };
  });
  await edit(page,'Quota failure text. ');
  await page.getByTestId('writeability-warning').filter({hasText:'Local recovery is unavailable'}).waitFor();
  await page.waitForTimeout(5100);
  check(await page.getByTestId('writeability-warning').isVisible(), 'Recording failure timed out');
  await capture('failure');
  await page.evaluate(() => { IDBObjectStore.prototype.put = window.originalRecoveryPut; });
  await page.getByTestId('save').click();
  await page.locator('[data-testid="status"][data-operation="saved"]').waitFor(); await count(0);
  await page.getByRole('button',{name:'Close technical-1.md',exact:true}).click();

  // Unsupported/malformed format still exposes independently stored plaintext and explicit delete.
  await page.evaluate(async record => {
    const {recoveryStorage: store} = await import('/src/recovery-storage.ts');
    const id = 'incompatible'; const ticket = await store.ticket(id);
    await store.write(id,ticket,() => ({...record,id,version:99,recordedAt:Date.now(),snapshot:null,recoveryText:'Plaintext survives incompatible schema.'}));
  },unsaveable);
  await page.reload(); await ready(page);
  await page.getByRole('button',{name:'Review recovery'}).click();
  await page.getByText('Recovery cannot be restored',{exact:true}).waitFor();
  check(await page.getByRole('button',{name:'Restore work',exact:true}).isDisabled(), 'Incompatible restore is enabled');
  await page.getByText('Plaintext recovery copy',{exact:true}).click();
  check((await page.getByRole('textbox',{name:'Plaintext recovery copy'}).inputValue()).includes('Plaintext survives'), 'Plaintext fallback lost');
  await page.evaluate(() => Object.defineProperty(navigator,'clipboard',{value:undefined,configurable:true}));
  await page.getByRole('button',{name:'Copy text',exact:true}).click();
  await page.getByText(/Clipboard access is unavailable/).waitFor();
  await capture('incompatible');
  await page.getByRole('button',{name:'Delete record',exact:true}).click();
  await confirmPendingDeletion(page.getByRole('dialog',{name:'Delete recovery record?',exact:true}), 'Delete record'); await count(0);
  await page.getByText('No local recovery records.',{exact:true}).waitFor();
  await page.evaluate(async record => {
    const {recoveryStorage: store} = await import('/src/recovery-storage.ts');
    const id = 'malformed';
    await store.write(id,await store.ticket(id),() => ({...record,id,version:1,path:{broken:true},snapshot:null,recordedAt:Date.now(),recoveryText:'Malformed record text is still accessible.'}));
  },unsaveable);
  await page.reload(); await ready(page);
  await page.getByRole('button',{name:'Review recovery'}).click();
  await page.getByText('The recovery opening source or saved checkpoint is incomplete.',{exact:true}).waitFor();
  await page.getByText('Plaintext recovery copy',{exact:true}).click();
  check((await page.getByRole('textbox',{name:'Plaintext recovery copy'}).inputValue()).includes('Malformed record text'), 'Malformed record lost plaintext fallback');
  await page.getByRole('button',{name:'Delete record',exact:true}).click();
  await page.getByRole('dialog',{name:'Delete recovery record?',exact:true}).getByRole('button',{name:'Delete record',exact:true}).click(); await count(0);
  await page.addInitScript(() => Object.defineProperty(window,'indexedDB',{get() { throw new DOMException('Storage access denied','SecurityError'); }}));
  await page.reload(); await ready(page);
  await page.getByTestId('writeability-warning').filter({hasText:'Local recovery is unavailable'}).waitFor();
  await capture('unavailable');
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.getByRole('heading',{name:'Local recovery',exact:true}).waitFor();
  await page.keyboard.press('Escape');
  await openDocument(page,file); await ready(page);
  await edit(page,'Storage unavailable but Save works. ');
  await page.getByTestId('save').click();
  await page.locator('[data-testid="status"][data-operation="saved"]').waitFor();
  check((await (await page.request.get(`${origin}/api/document?path=${encodeURIComponent(file)}`)).json()).source.includes('Storage unavailable but Save works.'), 'Unavailable recovery blocked original Save');
  return { malformedPlaintext:true, crossWindowClear:true, insecureContextAPIs:true, modalSaveProtected:true, saveRaceReplay:true, draftsExcluded:true, unavailableVisible:true, persistence:true, matchingPrompt:true, restoreSaveReload:true, multiwindow:true, conflict:true,
    failedReloadRetained:true, unsaveableAndPendingFigure:true, tabDiscard:true, clearPending:true, pendingConcurrentWrites:true,
    quotaFailureVisible:true, incompatiblePlaintext:true, screenshots };
}
