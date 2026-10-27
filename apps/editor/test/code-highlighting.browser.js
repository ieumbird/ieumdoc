// Deferred grammars are display-only; delayed/failed loading must preserve input and engine history.
async (page, { openPath, reloadDocument, assertSavedSource, expect }) => {
  await page.unrouteAll();
  const origin = page.url().split('/').slice(0,3).join('/');
  const loaded = await (await page.request.get(`${origin}/api/document`)).json();
  const sep = loaded.path.includes('\\') ? '\\' : '/';
  const file = [...loaded.path.split(sep).slice(0,-4), 'tmp', 'code-highlighting', 'code.md'].join(sep);
  const ready = () => page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
  const open = async () => {
    await page.reload(); await ready();
    await openPath(page, file); await page.getByRole('dialog').waitFor({state:'detached'});
  };
  const check = (ok,reason) => { if(!ok) throw Error(reason); };
  const code = page.locator('[data-document-tab][data-active=true] [data-block="code"]');
  const snapshot = () => page.locator('[data-document-tab][data-active=true] .document-editor').evaluate(element => {
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
    await page.locator('[data-document-tab][data-active=true] .document-editor p', {hasText:'After.'}).click();
    await page.locator('[data-document-tab][data-active=true] .document-editor').evaluate(async element => {
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
    await page.locator('[data-document-tab][data-active=true] [data-block="figure"]').waitFor();
    await page.waitForFunction(() => document.querySelector('[data-testid="status"]')?.getAttribute('data-operation') !== 'adding-image');
    await page.locator('[data-document-tab][data-active=true] .document-editor').evaluate(element => element.editor.view.focus());
    await page.keyboard.press('ControlOrMeta+z');
    check(await page.locator('[data-document-tab][data-active=true] [data-block="figure"]').count() === 0 && (await code.locator('pre').innerText()).includes('+ 2'), 'Grammar completion cancelled upload or changed its history group');
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
      const lowlight=document.querySelector('[data-document-tab][data-active=true] .document-editor').editor.extensionManager.extensions.find(extension => extension.name === 'codeBlock').options.lowlight;
      const {common}=await import('/src/code-languages.ts');
      return {actual:lowlight.listLanguages().sort(),expected:Object.keys(common).sort()};
    });
    check(JSON.stringify(languages.actual) === JSON.stringify(languages.expected), 'Deferred registration changed language set: '+JSON.stringify(languages));
    // Measure actual highlighted text, including each role used by the grammar, in both themes.
    await code.evaluate(n => {
      const e=n.closest('.document-editor').editor, text=n.querySelector('code');
      e.commands.insertContentAt(e.view.posAtDOM(text,0)+text.textContent.length,
        {type:'text',text:'\n// readable comment\nconst label = "color";'});
    });
    await code.locator('.hljs-string').waitFor();
    const beforeTheme = await snapshot();
    for (const theme of ['light','dark']) {
      await page.evaluate(theme => {document.documentElement.dataset.theme=theme;},theme);
      const colors = await code.evaluate(n => {
        const canvas=document.createElement('canvas'), context=canvas.getContext('2d');
        const rgb=color=>{context.clearRect(0,0,1,1);context.fillStyle=color;context.fillRect(0,0,1,1);return [...context.getImageData(0,0,1,1).data];};
        const lum=rgb=>rgb.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
        return ['.hljs-keyword','.hljs-number','.hljs-string','.hljs-comment'].map(selector=>{
          const node=n.querySelector(selector); if(!node)throw Error(`Missing code role ${selector}`);
          let bg; for(let p=node;p;p=p.parentElement) {const color=rgb(getComputedStyle(p).backgroundColor);if(color[3]===255){bg=color;break;}}
          const a=lum(rgb(getComputedStyle(node).color)),b=lum(bg);
          return {selector,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
        });
      });
      check(colors.every(c=>c.ratio>=4.5), `${theme} code contrast: ${JSON.stringify(colors)}`);
      check(await snapshot() === beforeTheme, 'Theme changed code content, selection or history');
    }
    await page.evaluate(() => {document.documentElement.dataset.theme='light';});
  } finally { release(); releaseAsset(); await page.unroute('**/src/code-languages.ts*'); await page.unroute('**/api/asset?*'); }
  await page.getByRole('button', {name:'File actions', exact:true}).click();
  await page.getByRole('menuitem', {name:'Reload', exact:true}).click();
  await page.getByRole('button',{name:'Discard and reload',exact:true}).click();
  await ready();
  // A successful HTTP module that throws exercises the caught failure without hiding console errors.
  await page.route('**/src/code-languages.ts*', route => route.fulfill({status:200,contentType:'text/javascript',body:'throw new Error("grammar load probe");'}));
  try {
    await open();
    await page.waitForFunction(() => {
      const lowlight=document.querySelector('[data-document-tab][data-active=true] .document-editor')?.editor.extensionManager.extensions.find(extension => extension.name === 'codeBlock').options.lowlight;
      return lowlight?.listLanguages().length === 0 && document.querySelector('[data-document-tab][data-active=true] [data-block="code"]');
    });
    await code.locator('pre').click(); await page.keyboard.press('End'); await page.keyboard.type(' plain');
    check(await code.locator('pre span').count() === 0 && (await code.locator('pre').innerText()).endsWith(' plain'), 'Load failure prevented plain editing');
    check(await code.getByTestId('code-language').inputValue() === 'js', 'Load failure changed language');
    await page.keyboard.press('ControlOrMeta+z');
    check(!(await code.locator('pre').innerText()).endsWith(' plain'), 'Load failure lost Undo');
  } finally { await page.unroute('**/src/code-languages.ts*'); }

  // The existing field remains free text; its adjacent shared menu is keyboard reachable.
  const language = code.getByTestId('code-language');
  const picker = code.getByRole('button', {name:'Choose code language', exact:true});
  const engineLanguage = () => code.evaluate(element => {
    const editor = element.closest('.document-editor').editor;
    return editor.state.doc.content.content.find(node => node.type.name === 'codeBlock').attrs.language;
  });
  const expectLanguage = value => expect.poll(() => code.evaluate(element => ({
    input: element.querySelector('[data-testid="code-language"]').value,
    engine: element.closest('.document-editor').editor.state.doc.content.content.find(node => node.type.name === 'codeBlock').attrs.language,
  })), {message:'Language input and document must reflect the selected language'}).toEqual({input:value,engine:value});
  await language.focus(); await page.keyboard.press('Tab');
  check(await picker.evaluate(element => element === document.activeElement), 'Tab did not reach the language list');
  await page.keyboard.press('Enter');
  const menu = page.getByRole('menu', {name:'Choose code language',exact:true});
  await menu.waitFor();
  // Visibility precedes Base UI's frame-scheduled initial focus. Send keys only once
  // the menu owns them, then wait for the intended item before confirming it.
  await expect(menu.getByRole('menuitem',{name:'Plain text',exact:true})).toBeFocused();
  await page.keyboard.press('End');
  await expect(menu.getByRole('menuitem',{name:'rust',exact:true})).toBeFocused();
  await page.keyboard.press('Enter');
  await menu.waitFor({state:'detached'});
  await expectLanguage('rust');
  await expect(picker).toBeFocused();
  await page.locator('[data-document-tab][data-active=true] .document-editor').evaluate(element => element.editor.commands.undo());
  check(await language.inputValue() === await engineLanguage() && await engineLanguage() !== 'rust', 'Language Undo did not synchronize the input');
  await page.locator('[data-document-tab][data-active=true] .document-editor').evaluate(element => element.editor.commands.redo());
  check(await language.inputValue() === 'rust', 'Language Redo did not synchronize the input');
  await picker.click(); await menu.waitFor(); await page.keyboard.press('Escape');
  await menu.waitFor({state:'detached'});
  check(await menu.count() === 0 && await language.inputValue() === 'rust', 'Escape changed the language');
  await language.fill('custom-language');
  check(await engineLanguage() === 'custom-language', 'Unlisted language was rejected');
  await language.fill(' x y`z ');
  check(await language.inputValue() === 'xyz' && await engineLanguage() === 'xyz', 'Fence-name filtering changed');
  await picker.click(); await menu.waitFor(); await page.getByRole('menuitem',{name:'Plain text',exact:true}).click();
  await menu.waitFor({state:'detached'});
  await expectLanguage('');

  // Chromium creates real composing ranges. Assert each update immediately, so a later
  // commit, poll or reload cannot mask the stale controlled-value restoration from #527.
  const cdp = await page.context().newCDPSession(page);
  const compose = text => cdp.send('Input.imeSetComposition',{text,selectionStart:text.length,selectionEnd:text.length});
  try {
    await language.focus();
    for (const text of ['ㅎ','한','한글']) {
      await compose(text);
      check(await language.inputValue() === text, 'Language composition duplicated or lost '+text);
      check(await engineLanguage() === '', 'Intermediate composition changed the document language');
    }
    // IME confirmation must not open or select from the adjacent menu.
    await language.dispatchEvent('keydown',{key:'Enter',keyCode:229,isComposing:true,bubbles:true});
    await cdp.send('Input.insertText',{text:'한글'});
    check(await language.inputValue() === '한글' && await engineLanguage() === '한글', 'Language composition commit duplicated input');
    check(await menu.count() === 0, 'IME confirmation opened the language menu');
    await compose('취소'); await compose('');
    check(await language.inputValue() === '한글' && await engineLanguage() === '한글', 'Cancelled composition changed the language');
    await page.locator('[data-document-tab][data-active=true] .document-editor').evaluate(element => element.editor.commands.undo());
    check(await language.inputValue() === await engineLanguage() && await engineLanguage() !== '한글', 'Language composition Undo failed');
    await page.locator('[data-document-tab][data-active=true] .document-editor').evaluate(element => element.editor.commands.redo());
    check(await language.inputValue() === '한글', 'Language composition Redo failed');

    await code.locator('pre').click(); await page.keyboard.press('End');
    const beforeComposition = await code.locator('pre').textContent();
    await compose('ㅎ'); await compose('한글'); await cdp.send('Input.insertText',{text:'한글'});
    check(await code.locator('pre').textContent() === beforeComposition+'한글', 'Code body composition duplicated input');
    await page.keyboard.press('ControlOrMeta+z');
    check(await code.locator('pre').textContent() === beforeComposition, 'Code body composition Undo failed');
    await page.keyboard.press('ControlOrMeta+Shift+z');
    check(await code.locator('pre').textContent() === beforeComposition+'한글', 'Code body composition Redo failed');
  } finally { await cdp.detach(); }
  const originalSource = (await (await page.request.get(`${origin}/api/document?path=${encodeURIComponent(file)}`)).json()).source;
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await page.locator('[data-testid="status"]:is([data-operation="saved"], [data-operation="save-failed"])').waitFor();
  check(await page.getByTestId('status').getAttribute('data-operation') === 'saved', 'Code composition Save failed');
  const disk = await (await page.request.get(`${origin}/api/document?path=${encodeURIComponent(file)}`)).json();
  check(disk.source.includes('```한글\nconst value = 1;한글\n```'), 'Save did not preserve the composed language and code');
  await assertSavedSource(disk.source, originalSource.replace('```js\nconst value = 1;', '```한글\nconst value = 1;한글'), 'Composition Save changed other document content');
  await reloadDocument(page); await ready();
  check(await language.inputValue() === '한글' && await code.locator('pre').textContent() === 'const value = 1;한글', 'Reload lost composed input');
  return {deferred:true,languageSet:true,unknownFallback:true,failedFallback:true,history:true,languageMenu:true,customLanguage:true,compositionCommitCancel:true,bodyCompositionUndoRedo:true,compositionSaveReload:true};
}
