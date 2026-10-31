async (page, { openPath, reloadDocument, activeDocument, screenshots = false }) => {
  page.setDefaultTimeout(15000);
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
  const recoveryLayouts = [];
  const capture = async name => {
    const reviewLayout = name === 'prompt' || name === 'incompatible';
    if (!screenshots && !reviewLayout) return;
    const layoutFailures = [];
    for (const width of [1440,640]) {
      await page.setViewportSize({width,height:900});
      await page.evaluate(async () => { await document.fonts.ready; document.querySelector('.document-scroll[data-active="true"]').scrollTo(0,0); });
      if (screenshots) await page.screenshot({path:`tmp/296/${name}-${width}.png`});
      const prompt = page.getByTestId('recovery-prompt');
      if (reviewLayout) {
        const layout = await prompt.evaluate(node => {
          const box = node.getBoundingClientRect();
          const path = node.querySelector('[data-slot="dialog-description"] p');
          return {width:node.clientWidth, scroll:node.scrollWidth, pathWidth:path.clientWidth, pathScroll:path.scrollWidth,
            wrap:getComputedStyle(path).overflowWrap, dpr:devicePixelRatio, zoom:visualViewport.scale, font:getComputedStyle(path).fontFamily,
            buttons:[...node.querySelectorAll('[data-slot="dialog-footer"] button')].map(button => {
              const r=button.getBoundingClientRect();
              return {text:button.textContent,inside:r.left>=box.left && r.right<=box.right && r.top>=box.top && r.bottom<=box.bottom};
            })};
        });
        recoveryLayouts.push({name,viewport:width,...layout});
        if (layout.pathScroll>layout.pathWidth || layout.scroll>layout.width) layoutFailures.push(`${name} recovery path/content overflows at ${width}: ${JSON.stringify(layout)}`);
        if (!layout.buttons.every(button=>button.inside)) layoutFailures.push(`${name} recovery buttons leave dialog at ${width}: ${JSON.stringify(layout)}`);
        if (!layoutFailures.length) for (const button of await prompt.locator('[data-slot="dialog-footer"] button:enabled').all()) await button.click({trial:true});
      }
      for (const dialog of await page.getByRole('dialog', {name:/^(Delete recovery record\?|복구 기록을 삭제할까요\?|Delete all recovery records\?)$/}).all()) {
        if (await dialog.isVisible()) check(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth), `${name} dialog content overflows at ${width}`);
      }
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name} overflows at ${width}`);
    }
    check(!layoutFailures.length, layoutFailures.join("\n"));
    await page.setViewportSize({width:1440,height:900});
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
    await openPath(page,file);
    await page.getByRole('button',{name:'Close technical-1.md',exact:true}).click();
    await page.getByTestId('document-start').waitFor();
  }
  check(await page.evaluate(async () => {
    const {RECOVERY_DB}=await import('/src/recovery-storage.ts');
    const db=await new Promise(resolve=>{const r=indexedDB.open(RECOVERY_DB);r.onsuccess=()=>resolve(r.result);});
    const keys=await new Promise(resolve=>{const r=db.transaction('barriers').objectStore('barriers').getAllKeys();r.onsuccess=()=>resolve(r.result);});
    db.close(); return !keys.some(Array.isArray);
  }), 'Repeated clean Open/Close leaves per-session metadata');
  await openPath(page,file);
  // Normalize the CRLF fixture through real Save so independent edits form separate regions.
  await page.getByTestId('save').click();
  await page.locator('[data-testid="status"][data-operation="saved"]').waitFor();
  await edit(page,'Recovered applied text. ');
  await engine(page).evaluate(async node => {
    const {deleteBlock} = await import('/src/block-commands.ts');
    const editor = node.editor;
    const index = editor.state.doc.content.content.findIndex(block => block.type.name === 'paragraph');
    editor.view.dispatch(deleteBlock(editor.state,index));
    editor.commands.insertContentAt(editor.state.doc.content.size,{type:'paragraph',content:[{type:'text',text:'Added recovery paragraph.'}]});
  });
  await count(1);
  const first = (await records())[0];
  check(first.snapshot.editor.savedDocument && first.snapshot.file.source && first.snapshot.file.revision, 'Opening/checkpoint absent');

  // Tab memory restores clean documents, but leaves unsaved work to the existing review.
  const cleanFile = [root, 'tmp', 'document-tabs', 'technical-2.md'].join(sep);
  await openPath(page,cleanFile);
  await page.getByRole('tab',{name:'technical-1.md, Unsaved changes',exact:true}).click();
  const navigation = await page.evaluate(() => localStorage.getItem('litzio.openTabs'));
  page.on('dialog', dialog => dialog.accept());
  await page.reload(); await ready(page);
  await page.getByTestId('recovery-prompt').waitFor();
  check(await page.getByRole('tablist',{name:'Documents',exact:true,includeHidden:true}).getByRole('tab',{includeHidden:true}).count() === 1 && await page.getByRole('tab',{name:'technical-2.md',exact:true,includeHidden:true}).count() === 1, 'Tab memory bypassed recovery or failed to restore the clean tab');
  check(JSON.stringify(await records()) === JSON.stringify([first]), 'Automatic tab restoration changed the recovery record');
  check(await page.evaluate(() => localStorage.getItem('litzio.openTabs')) === navigation, 'Recovery exclusion rewrote navigation memory');
  await page.keyboard.press('Control+Slash');
  check(await page.getByTestId('recovery-prompt').isVisible() && !await page.getByRole('dialog',{name:'Command center',exact:true}).count(), 'Command center bypassed the startup recovery dialog');
  await page.getByRole('button',{name:'Not now',exact:true}).click();
  await page.keyboard.press('Control+Slash');
  const restoredCenter = page.getByRole('dialog',{name:'Command center',exact:true});
  await restoredCenter.getByRole('combobox').fill('technical-2.md');
  await page.keyboard.press('Enter');
  await restoredCenter.waitFor({state:'detached'});
  await page.waitForFunction(() => document.querySelector('[data-document-tab][data-active="true"] .document-editor')?.editor.view.hasFocus());
  await page.getByRole('button',{name:'Close technical-2.md',exact:true}).click();
  await page.getByRole('button',{name:'Review recovery'}).waitFor();
  await capture('list');
  await openPath(page,file);
  await page.getByTestId('recovery-prompt').waitFor(); await capture('prompt');
  // Source comparison does not restore/acknowledge or modify this record.
  const compareButton = page.getByRole('button',{name:'Compare',exact:true});
  const diffRegion = () => page.getByRole('region',{name:'Source differences',exact:true});
  const firstBeforeCompare = JSON.stringify(await records());
  const comparisonURL = '**/api/document-source?recovery=1';
  let releasePreview;
  const gate = new Promise(resolve=>{releasePreview=resolve;});
  const delayedPreview = async route=>{await gate; await route.fulfill({json:{disk:null,markdown:''}});};
  await page.route(comparisonURL, delayedPreview);
  await compareButton.click(); await page.getByText('Loading comparison…',{exact:true}).waitFor();
  for(const name of ['Restore work','Delete record','Not now']) check(await page.getByRole('button',{name,exact:true}).isEnabled(), 'Loading blocked recovery actions');
  await page.getByRole('button',{name:'Not now',exact:true}).click();
  releasePreview(); await page.unroute(comparisonURL,delayedPreview);
  await page.getByRole('button',{name:'Close technical-1.md',exact:true}).click();
  await page.getByRole('button',{name:'Review recovery'}).click();
  const failedPreview = route=>route.fulfill({status:500,json:{error:'Preview unavailable for test'}});
  await page.route(comparisonURL,failedPreview);
  // A reopened review starts collapsed.
  if(await compareButton.getAttribute('aria-expanded')==='true') await compareButton.click();
  await compareButton.click(); await page.getByText('Comparison unavailable: Preview unavailable for test',{exact:true}).waitFor();
  for(const name of ['Restore work','Delete record','Not now']) check(await page.getByRole('button',{name,exact:true}).isEnabled(),'Error blocked recovery actions');
  await page.unroute(comparisonURL,failedPreview); await compareButton.click();
  let previewMarkdown;
  const previewResponse = page.waitForResponse(response => response.url().includes('/api/document-source?recovery=1'));
  await compareButton.click();
  previewMarkdown = (await (await previewResponse).json()).markdown;
  await diffRegion().waitFor();
  const changeCount = await diffRegion().locator('[data-change-start]').count();
  // Exactly three separated regions: modified title, deleted paragraph, appended paragraph.
  check(changeCount === 3, 'Mixed edits did not produce the three expected change regions');
  check((await page.getByRole('status').allTextContents()).includes(`${changeCount} changes`), 'Wrong displayed change count');
  check(await diffRegion().locator('[data-kind="removed"]').count() > 0 && await diffRegion().locator('[data-kind="added"]').count() > 0 && await diffRegion().locator('mark').count() > 0,'Missing line/word changes');
  await page.getByRole('button',{name:'Next change',exact:true}).focus(); await page.keyboard.press('Enter');
  check(await diffRegion().locator('[data-change-start="1"]').evaluate(node=>node===document.activeElement),'Keyboard next change did not focus first change');
  await page.getByRole('button',{name:'Previous change',exact:true}).click();
  check(await diffRegion().locator(`[data-change-start="${changeCount}"]`).evaluate(node=>node===document.activeElement),'Previous did not wrap to last change');
  for (const width of [640,1440]) for (const theme of ['light','dark']) {
    await page.setViewportSize({width,height:900});
    await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
    await page.evaluate(()=>document.fonts.ready);
    const geometry = await page.getByTestId('recovery-prompt').evaluate(node=>({width:node.clientWidth,scroll:node.scrollWidth,viewport:innerWidth,dpr:devicePixelRatio,zoom:visualViewport.scale,theme:document.documentElement.dataset.theme,
      footer:[...node.querySelectorAll('[data-slot="dialog-footer"] button')].every(button=>{const b=button.getBoundingClientRect(),p=node.getBoundingClientRect();return b.left>=p.left&&b.right<=p.right;})}));
    recoveryLayouts.push({name:'comparison',...geometry});
    check(geometry.scroll<=geometry.width && geometry.width<width && geometry.footer,'Comparison/footer overflow');
    if(screenshots) await page.screenshot({path:`tmp/296/comparison-${width}-${theme}.png`});
  }
  await page.evaluate(()=>document.documentElement.dataset.theme='light'); await page.setViewportSize({width:1440,height:900});
  await compareButton.click();
  check(JSON.stringify(await records()) === firstBeforeCompare,'Comparison changed the recovery record');
  // Hold a genuine worker module during calculation: Delete and Escape must remain usable.
  let releaseWorker;
  const workerGate=new Promise(resolve=>{releaseWorker=resolve;});
  const workerURL='**/src/recovery-diff.worker.ts*';
  const delayedWorker=async route=>{const response=await route.fetch();await workerGate;await route.fulfill({response});};
  await page.route(workerURL,delayedWorker);
  await compareButton.click(); await page.getByText('Calculating differences…',{exact:true}).waitFor();
  let actionStart=Date.now();
  await page.getByRole('button',{name:'Delete record',exact:true}).click();
  const calculationDelete=page.getByRole('dialog',{name:'Delete recovery record?',exact:true});
  await calculationDelete.waitFor();
  check(Date.now()-actionStart<1000,'Delete did not respond during computation');
  await page.keyboard.press('Escape'); await calculationDelete.waitFor({state:'hidden'});
  actionStart=Date.now(); await page.keyboard.press('Escape');
  await page.getByTestId('recovery-prompt').waitFor({state:'detached'});
  check(Date.now()-actionStart<1000,'Escape did not respond during computation');
  releaseWorker(); await page.unroute(workerURL,delayedWorker);
  await page.getByRole('button',{name:'Review recovery'}).click();
  if(await compareButton.getAttribute('aria-expanded')==='true') await compareButton.click();
  // Reviewer regression: 50 changed code lines, 1000 words each (~337 KiB per side).
  const largeSource = word => '---\nlitzio: 1\n---\n\n```text\n' + Array(50).fill(Array.from({length:1000},(_,i)=>word+i).join(' ')).join('\n') + '\n```\n';
  const largePair = {disk:{source:largeSource('old'),revision:first.snapshot.file.revision},markdown:largeSource('new')};
  const largePreview = route=>route.fulfill({json:largePair});
  await page.route(comparisonURL,largePreview);
  await page.evaluate(()=>{
    const started=performance.now(); let previous=started;
    window.comparisonTiming={started,maxGap:0,readyAfter:null};
    window.comparisonHeartbeat=setInterval(()=>{const now=performance.now();window.comparisonTiming.maxGap=Math.max(window.comparisonTiming.maxGap,now-previous);previous=now;},10);
    window.comparisonObserver=new MutationObserver(()=>{
      if(window.comparisonTiming.readyAfter===null && document.querySelector('[aria-label="Source differences"]')) window.comparisonTiming.readyAfter=performance.now()-started;
    });
    window.comparisonObserver.observe(document.body,{childList:true,subtree:true});
  });
  await compareButton.click();
  // A fixed observation window, with direct assertions afterwards; no readiness polling/reload.
  const largeComparisonMetrics = await page.evaluate(async()=>{
    await new Promise(resolve=>setTimeout(resolve,2000));
    clearInterval(window.comparisonHeartbeat); window.comparisonObserver.disconnect();
    return {...window.comparisonTiming,ready:!!document.querySelector('[aria-label="Source differences"]'),
      omitted:document.body.textContent.includes('Word highlighting omitted to keep comparison responsive.')};
  });
  check(largeComparisonMetrics.maxGap<500,`Comparison blocked the main thread: ${JSON.stringify(largeComparisonMetrics)}`);
  check(largeComparisonMetrics.ready && largeComparisonMetrics.readyAfter<2000,`Comparison exceeded its total budget: ${JSON.stringify(largeComparisonMetrics)}`);
  check(largeComparisonMetrics.omitted,'Large comparison did not explain omitted word highlighting');
  check((await diffRegion().innerText()).includes('new999'),'Cancelled comparison overwrote the new result');
  await compareButton.click(); await page.unroute(comparisonURL,largePreview);
  const oversizedPreview=route=>route.fulfill({json:{disk:{...largePair.disk,source:'x'.repeat(1_000_001)},markdown:''}});
  await page.route(comparisonURL,oversizedPreview); await compareButton.click();
  await page.getByText('Comparison unavailable: Comparison is too large. Use the plaintext recovery copy.',{exact:true}).waitFor();
  for(const name of ['Restore work','Delete record','Not now']) check(await page.getByRole('button',{name,exact:true}).isEnabled(),'Computation budget failure blocked recovery actions');
  await page.getByText('Plaintext recovery copy',{exact:true}).click();
  check(await page.getByRole('textbox',{name:'Plaintext recovery copy',exact:true}).inputValue()===first.recoveryText,'Computation budget failure lost the salvage copy');
  await page.getByText('Plaintext recovery copy',{exact:true}).click();
  await compareButton.click(); await page.unroute(comparisonURL,oversizedPreview);
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
  check(await page.getByRole('tablist', {name:'Documents',exact:true}).getByRole('tab').count() === 1, 'Recovery and remembered tabs opened the document twice');
  check(await engine(page).evaluate(n => !n.editor.can().undo()), 'Restored Undo history should be empty');
  await page.getByTestId('save').click();
  await page.locator('[data-testid="status"][data-operation="saved"]').waitFor(); await count(0);
  const disk = await (await page.request.get(`${origin}/api/document?path=${encodeURIComponent(file)}`)).json();
  check(disk.source.includes('Recovered applied text.'), 'Restored Save did not reach disk');
  check(disk.source === previewMarkdown, 'Restored Save bytes differ from preview');
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
    await openPath(other,file);
    await edit(page,'Window A. '); await edit(other,'Window B. '); await count(2);
    const before = await records();
    check(new Set(before.map(r => r.id)).size === 2, 'Windows share a session id');
    await page.getByTestId('save').click();
    await page.locator('[data-testid="status"][data-operation="saved"]').waitFor(); await count(1);
    check((await records())[0].recoveryText.includes('Window B.'), 'Saving A removed B');
  } finally { await other.close(); }
  await page.reload(); await ready(page); await count(1);
  await page.getByRole('button',{name:'Review recovery'}).click();
  await page.getByRole('button',{name:'Compare',exact:true}).click(); await diffRegion().waitFor();
  await page.getByText('The file changed after this record. Comparing with the current disk file.',{exact:true}).waitFor();
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
  await page.getByRole('button',{name:'Compare',exact:true}).click(); await diffRegion().waitFor();
  await page.getByText(/^Plaintext comparison instead of Save preview:/).waitFor();
  check(!(await diffRegion().innerText()).includes('litzio:'),'Fallback compared Markdown to plaintext');
  await page.getByRole('button',{name:'Restore work',exact:true}).click();
  await page.getByTestId('recovery-prompt').waitFor({state:'detached'});
  check(await engine(page).evaluate(n => n.editor.state.doc.firstChild.textContent === '' && [...n.editor.state.doc.content.content].some(node => node.type.name === 'figure' && !node.attrs.imagePath)), 'Unsaveable heading/pending Figure lost on restore');
  await page.getByTestId('save').click();
  await page.locator('[data-testid="status"][data-operation="save-failed"]').waitFor(); await count(1);
  // Tab Don't save explicitly deletes its record, unlike closing the window above.
  await page.getByRole('button',{name:'Close technical-1.md',exact:true}).click();
  await page.getByRole('button',{name:"Don't save",exact:true}).click(); await count(0);

  // Common Settings, clear with a scheduled write, and resuming only after another applied edit.
  await openPath(page,file);
  await edit(page,'Before clear. '); await count(1);
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.getByRole('button',{name:'Saving & recovery',exact:true}).click();
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
    await openPath(laterWindow,file);
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
  await page.getByTestId('equation-edit-source').click();
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

  // A genuinely absent file still previews the session and marks all content as added.
  await page.evaluate(async record=>{
    const {recoveryStorage:store}=await import('/src/recovery-storage.ts');
    const id='missing-file'; const clean=structuredClone(record);
    clean.path=clean.path.replace(/\.md$/,'-missing.md'); clean.snapshot.file.path=clean.path;
    clean.snapshot.editor.editorDocument=structuredClone(clean.snapshot.editor.savedDocument);
    await store.write(id,await store.ticket(id,clean.path),()=>({...clean,id,recordedAt:Date.now()}));
  },unsaveable);
  await page.reload(); await ready(page); await page.getByRole('button',{name:'Review recovery'}).click();
  await page.getByRole('button',{name:'Compare',exact:true}).click(); await diffRegion().waitFor();
  await page.getByText('File missing. All recovered content is shown as added.',{exact:true}).waitFor();
  check(await diffRegion().locator('[data-kind="removed"], [data-kind="same"]').count()===0,'Missing disk was not all additions');
  await page.getByRole('button',{name:'Delete record',exact:true}).click();
  await page.getByRole('dialog',{name:'Delete recovery record?',exact:true}).getByRole('button',{name:'Delete record',exact:true}).click(); await count(0);

  // Unsupported/malformed format still exposes independently stored plaintext and explicit delete.
  await page.evaluate(async record => {
    const {recoveryStorage: store} = await import('/src/recovery-storage.ts');
    const id = 'incompatible'; const ticket = await store.ticket(id, record.path);
    await store.write(id,ticket,() => ({...record,id,path:'C:\\Users\\한글 사용자\\' + 'very-long-unbroken-folder-name'.repeat(12) + '\\document.md',version:99,recordedAt:Date.now(),snapshot:null,recoveryText:'Plaintext survives incompatible schema.'}));
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
    await store.write(id,await store.ticket(id, record.path),() => ({...record,id,version:1,path:{broken:true},snapshot:null,recordedAt:Date.now(),recoveryText:'Malformed record text is still accessible.'}));
  },unsaveable);
  await page.reload(); await ready(page);
  await page.getByRole('button',{name:'Review recovery'}).click();
  await page.getByText('The recovery opening source or saved checkpoint is incomplete.',{exact:true}).waitFor();
  await page.getByText('Plaintext recovery copy',{exact:true}).click();
  check((await page.getByRole('textbox',{name:'Plaintext recovery copy'}).inputValue()).includes('Malformed record text'), 'Malformed record lost plaintext fallback');
  await page.getByRole('button',{name:'Delete record',exact:true}).click();
  await page.getByRole('dialog',{name:'Delete recovery record?',exact:true}).getByRole('button',{name:'Delete record',exact:true}).click(); await count(0);
  await page.addInitScript(() => Object.defineProperty(window,'indexedDB',{get() { throw new DOMException('Storage access denied','SecurityError'); }}));
  await page.evaluate(path => localStorage.setItem('litzio.openTabs',JSON.stringify({paths:[path],activePath:path})),file);
  await page.reload(); await ready(page);
  await page.getByTestId('writeability-warning').filter({hasText:'Local recovery is unavailable'}).waitFor();
  check(await page.getByRole('tablist', {name:'Documents',exact:true}).getByRole('tab').count() === 0, 'Unavailable recovery was bypassed by automatic tab restoration');
  await capture('unavailable');
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.getByRole('button',{name:'Saving & recovery',exact:true}).click();
  await page.getByRole('heading',{name:'Local recovery',exact:true}).waitFor();
  await page.keyboard.press('Escape');
  await openPath(page,file);
  await edit(page,'Storage unavailable but Save works. ');
  await page.getByTestId('save').click();
  await page.locator('[data-testid="status"][data-operation="saved"]').waitFor();
  check((await (await page.request.get(`${origin}/api/document?path=${encodeURIComponent(file)}`)).json()).source.includes('Storage unavailable but Save works.'), 'Unavailable recovery blocked original Save');
  return { largeComparisonMetrics, malformedPlaintext:true, crossWindowClear:true, insecureContextAPIs:true, modalSaveProtected:true, saveRaceReplay:true, draftsExcluded:true, unavailableVisible:true, persistence:true, matchingPrompt:true, restoreSaveReload:true, multiwindow:true, conflict:true,
    failedReloadRetained:true, unsaveableAndPendingFigure:true, tabDiscard:true, clearPending:true, pendingConcurrentWrites:true,
    recoveryLayouts, quotaFailureVisible:true, incompatiblePlaintext:true, screenshots };
}
