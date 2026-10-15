// Real independent sessions, explicit per-file Save/Reload, and optional visual/memory review.
async (page, { openDocument, reloadDocument, activeDocument, removeTabFixture, screenshots = false }) => {
  const check = (value, message) => { if (!value) throw new Error(message); };
  const origin = page.url().split('/').slice(0, 3).join('/');
  const loaded = await (await page.request.get(`${origin}/api/document`)).json();
  const sep = loaded.path.includes('\\') ? '\\' : '/';
  const root = loaded.path.split(sep).slice(0, -4).join(sep);
  const file = name => [root, 'tmp', 'document-tabs', name].join(sep);
  const a = file('technical-1.md'), b = file('technical-2.md');
  const editor = () => activeDocument(page).locator('.document-editor');
  const ready = () => page.locator('[data-testid="status"][data-operation="Ready"]').waitFor({state:'attached'});
  const read = async path => (await page.request.get(`${origin}/api/document?path=${encodeURIComponent(path)}`)).json();
  const activate = async name => {
    await page.getByRole('tab', {name:new RegExp(`^${name.replaceAll('.', '\\.')}(, Unsaved changes)?$`)}).click();
    await page.waitForFunction(name => document.querySelector('[data-testid="current-file"]')?.textContent === name, name);
  };
  check(await page.getByRole('tab').count() === 1, 'The startup document is not the first tab');
  await page.getByRole('button', {name:'Close technical-document.md',exact:true}).click();
  await page.getByTestId('document-start').waitFor();
  await openDocument(page, a); await ready();
  await editor().evaluate(n => {
    window.tabEditorA = n.editor;
    n.editor.commands.insertContentAt(1, 'A independent ');
    n.editor.commands.setTextSelection({from:3,to:10});
  });
  const equation = () => activeDocument(page).locator('[data-block="equation"]');
  await equation().hover();
  await equation().getByRole('button',{name:'Edit',exact:true}).click();
  await page.getByTestId('equation-latex').fill('A property draft');
  // Preserve an engine selection independently of the property input's DOM focus.
  await editor().evaluate(n => n.editor.commands.setTextSelection({from:3,to:10}));
  await page.evaluate(() => window.scrollTo(0, 420));
  const beforeA = await editor().evaluate(n => ({json:JSON.stringify(n.editor.getJSON()), selection:n.editor.state.selection.toJSON(), y:scrollY}));
  await openDocument(page, b); await ready();
  check(!await page.getByTestId('equation-editor').count(), 'A hidden property portal is still mounted');
  await editor().evaluate(n => {
    window.tabEditorB = n.editor;
    n.editor.commands.insertContentAt(1, 'B independent ');
    n.editor.commands.setTextSelection({from:2,to:5});
  });
  await equation().hover(); await equation().getByRole('button',{name:'Edit',exact:true}).click();
  await page.getByTestId('equation-latex').fill('B property draft');
  await editor().evaluate(n => n.editor.commands.setTextSelection({from:2,to:5}));
  await page.evaluate(() => window.scrollTo(0, 180));
  const beforeB = await editor().evaluate(n => ({json:JSON.stringify(n.editor.getJSON()), selection:n.editor.state.selection.toJSON(), y:scrollY}));
  let switchRequests = 0;
  const countRequest = request => { if (/\/api\/document/.test(request.url())) switchRequests++; };
  page.on('request', countRequest);
  await activate('technical-1.md');
  const afterA = await editor().evaluate(n => ({same:n.editor === window.tabEditorA, json:JSON.stringify(n.editor.getJSON()), selection:n.editor.state.selection.toJSON(), y:scrollY}));
  check(afterA.same && afterA.json === beforeA.json && JSON.stringify(afterA.selection) === JSON.stringify(beforeA.selection) && Math.abs(afterA.y-beforeA.y)<2, `A did not retain its state: ${JSON.stringify({beforeA,afterA})}`);
  check(await page.getByTestId('equation-latex').inputValue() === 'A property draft', 'A draft was replaced');
  check(await page.getByRole('tab',{name:'technical-1.md, Unsaved changes',exact:true}).evaluate(n => n === document.activeElement), 'Reactivated properties stole tab focus');
  await activate('technical-2.md');
  const afterB = await editor().evaluate(n => ({same:n.editor === window.tabEditorB, json:JSON.stringify(n.editor.getJSON()), selection:n.editor.state.selection.toJSON(), y:scrollY}));
  check(afterB.same && afterB.json === beforeB.json && JSON.stringify(afterB.selection) === JSON.stringify(beforeB.selection) && Math.abs(afterB.y-beforeB.y)<2, 'B did not retain its own state');
  check(await page.getByTestId('equation-latex').inputValue() === 'B property draft', 'B draft was replaced');
  check(switchRequests === 0, 'Tab switching requested document serialization or loading');
  page.off('request', countRequest);
  await page.getByTestId('equation-cancel').click();
  await editor().focus(); await page.keyboard.press('Control+z');
  check(!(await editor().innerText()).includes('B independent'), 'B undo did not use its own history');
  await page.keyboard.press('Control+Shift+z');
  await activate('technical-1.md');
  check((await editor().innerText()).includes('A independent'), 'B undo affected A');
  await page.getByTestId('equation-cancel').click();
  await editor().focus(); await page.keyboard.press('Control+z');
  check(!(await editor().innerText()).includes('A independent'), 'A undo history was lost');
  await page.keyboard.press('Control+Shift+z');

  // An exact already-normalized path keeps the existing instance and edits.
  await openDocument(page, b); await activate('technical-1.md');
  check(await page.getByRole('tab').count() === 2, 'Reopening B made a duplicate tab');
  check(await editor().evaluate(n => n.editor === window.tabEditorA), 'Reopening replaced the existing editor');
  await page.getByRole('button',{name:'Source',exact:true}).click();
  await page.getByTestId('source-view').waitFor();
  await activate('technical-2.md');
  check(await editor().isVisible(), 'B inherited A Source view');
  await activate('technical-1.md');
  check(await activeDocument(page).getByTestId('source-view').isVisible(), 'A lost its Source view');
  await page.getByRole('button',{name:'Visual',exact:true}).click();
  for (const [name, path, own, other] of [['technical-1.md',a,'A independent','B independent'], ['technical-2.md',b,'B independent','A independent']]) {
    await activate(name);
    await page.getByTestId('save').click();
    await page.getByText('Saved',{exact:true}).filter({visible:true}).waitFor();
    const disk = await read(path);
    check(disk.source.includes(own) && !disk.source.includes(other), `${name} saved another tab's content`);
    await reloadDocument(page); await ready();
    check((await editor().innerText()).includes(own) && !(await editor().innerText()).includes(other), `${name} Reload lost or mixed saved content`);
  }
  // Arrow/Home/End navigation is scoped to the document tablist; Delete closes its tab.
  const tabA = page.getByRole('tab',{name:'technical-1.md',exact:true});
  await tabA.focus(); await page.keyboard.press('End');
  check(await page.getByRole('tab',{name:'technical-2.md',exact:true}).getAttribute('aria-selected') === 'true', 'End did not activate the last tab');
  await page.keyboard.press('Home');
  check(await tabA.getAttribute('aria-selected') === 'true', 'Home did not activate the first tab');

  // External deletion must not make a retained session depend on another Host GET.
  await editor().evaluate(n => {
    window.tabEditorA = n.editor;
    n.editor.commands.insertContentAt(1, 'Retained after disk removal ');
    n.editor.commands.setTextSelection({from:2,to:8});
  });
  const beforeRemoval = await editor().evaluate(n => ({json:JSON.stringify(n.editor.getJSON()), selection:n.editor.state.selection.toJSON()}));
  await activate('technical-2.md');
  removeTabFixture();
  check((await page.request.get(`${origin}/api/document?path=${encodeURIComponent(a)}`)).status() === 400, 'The scratch file was not removed on disk');
  switchRequests = 0;
  page.on('request', countRequest);
  try {
    // The already-listed entry remains; no refresh or file watcher is involved.
    await page.getByTestId('folder').getByRole('treeitem',{name:'technical-1.md',exact:true}).click();
    await page.waitForFunction(path => document.querySelector('[data-testid="current-file"]')?.getAttribute('title') === path, a);
    check(switchRequests === 0, 'An exact open path performed a Host request');
    check(await page.getByRole('tab').count() === 2 && !await page.getByTestId('error').count(), 'Activating a missing open file added a tab or an error');
    const retained = await editor().evaluate(n => ({same:n.editor === window.tabEditorA,json:JSON.stringify(n.editor.getJSON()),selection:n.editor.state.selection.toJSON()}));
    check(retained.same && retained.json === beforeRemoval.json && JSON.stringify(retained.selection) === JSON.stringify(beforeRemoval.selection), 'Missing-file activation replaced the retained session');
    await editor().focus(); await page.keyboard.press('Control+z');
    check(!(await editor().innerText()).includes('Retained after disk removal'), 'Missing-file activation lost undo history');
  } finally { page.off('request', countRequest); }

  // Same-name labels and narrow overflow are observable product contracts.
  await openDocument(page, file(['alpha','guide.md'].join(sep))); await ready();
  await openDocument(page, file(['beta','guide.md'].join(sep))); await ready();
  check(await page.getByRole('tab',{name:'guide.md — alpha',exact:true}).count() === 1 &&
    await page.getByRole('tab',{name:'guide.md — beta',exact:true}).count() === 1, 'Same-name files are ambiguous');
  await page.setViewportSize({width:375,height:900});
  const narrow = await page.evaluate(() => {
    const row = document.querySelector('[role="tablist"]');
    const save = document.querySelector('[data-testid="save"]').getBoundingClientRect();
    return {page:document.documentElement.scrollWidth, width:innerWidth, scrolls:row.scrollWidth>row.clientWidth, saveLeft:save.left,saveRight:save.right};
  });
  check(narrow.page <= narrow.width && narrow.scrolls && narrow.saveLeft>=0 && narrow.saveRight<=narrow.width, `Tabs push Save or the page sideways: ${JSON.stringify(narrow)}`);
  await page.setViewportSize({width:1440,height:900});

  if (screenshots) {
    // Manual review only: captures and rough heap/switch timings do not impose performance gates.
    for (const width of [1440,375]) {
      await page.setViewportSize({width,height:900});
      const shot = async state => {
        await page.evaluate(async () => { await document.fonts.ready; window.scrollTo(0,0); document.activeElement?.blur(); });
        await page.mouse.move(0,0);
        await page.screenshot({path:`tmp/document-tabs-visual/after-${width}-${state}.png`});
      };
      await activate('technical-1.md'); await shot('several');
      await page.getByRole('tab',{name:'guide.md — beta',exact:true}).click(); await shot('same-name');
      await editor().evaluate(n => n.editor.commands.insertContentAt(1,'Visual review dirty '));
      await page.getByTestId('status').filter({hasText:'Unsaved changes'}).waitFor(); await shot('dirty');
      await page.getByRole('button',{name:'Close guide.md — beta',exact:true}).click();
      await page.getByRole('dialog',{name:'Save changes?',exact:true}).waitFor(); await shot('close-dialog');
      await page.getByRole('button',{name:'Cancel',exact:true}).click();
      await page.getByRole('dialog').waitFor({state:'detached'});
      await editor().evaluate(n => n.editor.commands.undo());
    }
    await page.setViewportSize({width:1440,height:900});
    // Close the two extra same-name tabs and B to measure one, then eight identical technical documents.
    for (const name of ['guide.md — alpha','guide.md','technical-2.md']) await page.getByRole('button',{name:`Close ${name}`,exact:true}).click();
    await page.evaluate(() => { delete window.tabEditorA; delete window.tabEditorB; });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    const heap = async () => {
      await cdp.send('HeapProfiler.collectGarbage');
      const {metrics} = await cdp.send('Performance.getMetrics');
      return Math.round(metrics.find(m => m.name === 'JSHeapUsedSize').value / 1024 / 1024 * 100) / 100;
    };
    try {
      const oneMiB = await heap();
      for (let i=2;i<=8;i++) { await openDocument(page,file(`technical-${i}.md`)); await ready(); }
      const eightMiB = await heap();
      const latency = await page.evaluate(async () => {
        const tabs = [...document.querySelectorAll('[role="tab"]')];
        const timings = [];
        for (let turn=0;turn<24;turn++) {
          const start=performance.now(); tabs[turn%tabs.length].click();
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          timings.push(performance.now()-start);
        }
        return timings.sort((a,b)=>a-b);
      });
      const measurement = {oneMiB,eightMiB,deltaMiB:Math.round((eightMiB-oneMiB)*100)/100,
        switchMedianMs:Math.round((latency[11]+latency[12])/2*10)/10,switchP95Ms:Math.round(latency[22]*10)/10,
        documents:8,samples:24,viewport:'1440x900',note:'Vite development build, post-GC JS heap, click through two animation frames; excludes native DOM/image memory'};
      await page.evaluate(value => { window.documentTabsMeasurement=value; },measurement);
    } finally { await cdp.detach(); }
  }
  return {independentState:true, retainedDrafts:true, undo:true, sourceView:true, saveReload:true, accessibleSwitching:true, missingFileActivation:true,
    measurement: screenshots ? await page.evaluate(() => window.documentTabsMeasurement) : undefined};
}
