// Deferred grammars are display-only; delayed/failed loading must preserve input and engine history.
async page => {
  await page.unrouteAll();
  const origin = page.url().split('/').slice(0,3).join('/');
  const loaded = await (await page.request.get(`${origin}/api/document`)).json();
  const sep = loaded.path.includes('\\') ? '\\' : '/';
  const file = [...loaded.path.split(sep).slice(0,-4), 'tmp', 'code-highlighting', 'code.md'].join(sep);
  const ready = () => page.locator('[data-testid="status"][data-operation="Ready"]').waitFor({state:'attached'});
  const open = async () => {
    await page.reload(); await ready();
    await page.getByRole('button',{name:'Open file…'}).click();
    await page.getByTestId('file-path').fill(file);
    await page.getByRole('dialog').getByRole('button',{name:'Open',exact:true}).click();
    await ready(); await page.getByRole('dialog').waitFor({state:'detached'});
  };
  const check = (ok,reason) => { if(!ok) throw Error(reason); };
  const code = page.locator('[data-block="code"]');
  const snapshot = () => page.locator('.document-editor').evaluate(element => {
    const {doc,selection} = element.editor.state;
    return JSON.stringify({doc:doc.toJSON(),selection:selection.toJSON(),undo:element.editor.can().undo()});
  });
  let release;
  const gate = new Promise(resolve => { release=resolve; });
  let releaseAsset;
  const assetGate = new Promise(resolve => { releaseAsset=resolve; });
  let assetStarted;
  const uploading = new Promise(resolve => { assetStarted=resolve; });
  let requested=0;
  await page.route('**/src/code-languages.ts*', async route => { requested++; await gate; await route.continue(); });
  await page.route('**/api/asset?*', async route => { const response=await route.fetch(); assetStarted(); await assetGate; await route.fulfill({response}); });
  try {
    await page.reload(); await ready();
    check(requested === 0, 'Code-free document requested grammars');
    await open();
    await code.locator('pre').click();
    await page.keyboard.press('End'); await page.keyboard.type(' + 2');
    await page.locator('.document-editor p', {hasText:'After.'}).click();
    await page.locator('.document-editor').evaluate(async element => {
      const canvas=document.createElement('canvas'); canvas.width=canvas.height=2;
      const png=await new Promise(resolve => canvas.toBlob(resolve,'image/png'));
      const data=new DataTransfer(); data.items.add(new File([png],'probe.png',{type:'image/png'}));
      element.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));
    });
    await uploading;
    const before = await snapshot();
    release();
    await code.locator('.hljs-keyword').waitFor();
    check(before === await snapshot(), 'Grammar completion changed document/selection/history');
    releaseAsset();
    await page.locator('[data-block="figure"]').waitFor();
    await page.waitForFunction(() => document.querySelector('[data-testid="status"]')?.getAttribute('data-operation') !== 'Adding image…');
    await page.locator('.document-editor').evaluate(element => element.editor.view.focus());
    await page.keyboard.press('ControlOrMeta+z');
    check(await page.locator('[data-block="figure"]').count() === 0 && (await code.locator('pre').innerText()).includes('+ 2'), 'Grammar completion cancelled upload or changed its history group');
    await page.keyboard.press('ControlOrMeta+z');
    check(!(await code.locator('pre').innerText()).includes('+ 2'), 'Grammar completion lost Undo');
    await page.keyboard.press('ControlOrMeta+Shift+z');
    check((await code.locator('pre').innerText()).includes('+ 2'), 'Grammar completion lost Redo');
    await code.hover();
    await code.getByTestId('code-language').fill('unknown-language');
    check(await code.locator('pre span').count() === 0, 'Unknown language did not use plain fallback');
    await code.getByTestId('code-language').fill('javascript');
    await code.locator('.hljs-keyword').waitFor();
    const languages = await page.evaluate(async () => {
      const lowlight=document.querySelector('.document-editor').editor.extensionManager.extensions.find(extension => extension.name === 'codeBlock').options.lowlight;
      const {common}=await import('/src/code-languages.ts');
      return {actual:lowlight.listLanguages().sort(),expected:Object.keys(common).sort()};
    });
    check(JSON.stringify(languages.actual) === JSON.stringify(languages.expected), 'Deferred registration changed language set: '+JSON.stringify(languages));
  } finally { release(); releaseAsset(); await page.unroute('**/src/code-languages.ts*'); await page.unroute('**/api/asset?*'); }
  await page.getByRole('button',{name:'Reload',exact:true}).click();
  await page.getByRole('button',{name:'Discard and reload',exact:true}).click();
  await ready();
  // A successful HTTP module that throws exercises the caught failure without hiding console errors.
  await page.route('**/src/code-languages.ts*', route => route.fulfill({status:200,contentType:'text/javascript',body:'throw new Error("grammar load probe");'}));
  try {
    await open();
    await page.waitForFunction(() => {
      const lowlight=document.querySelector('.document-editor')?.editor.extensionManager.extensions.find(extension => extension.name === 'codeBlock').options.lowlight;
      return lowlight?.listLanguages().length === 0 && document.querySelector('[data-block="code"]');
    });
    await code.locator('pre').click(); await page.keyboard.press('End'); await page.keyboard.type(' plain');
    check(await code.locator('pre span').count() === 0 && (await code.locator('pre').innerText()).endsWith(' plain'), 'Load failure prevented plain editing');
    check(await code.getByTestId('code-language').inputValue() === 'js', 'Load failure changed language');
    await page.keyboard.press('ControlOrMeta+z');
    check(!(await code.locator('pre').innerText()).endsWith(' plain'), 'Load failure lost Undo');
  } finally { await page.unroute('**/src/code-languages.ts*'); }
  return {deferred:true,languageSet:true,unknownFallback:true,failedFallback:true,history:true};
}
