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
  let commonNames;
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
    await code.evaluate(n => {
      const editor=n.closest('.document-editor').editor;
      const tr=editor.state.tr;
      editor.state.doc.descendants((node,pos) => {
        if (node.type.name === 'codeBlock') tr.setNodeMarkup(pos, undefined, {...node.attrs,language:'unknown-language'});
      });
      editor.view.dispatch(tr);
    });
    await expect(code.getByTestId('code-language')).toHaveText('unknown-language');
    check(await code.locator('pre span').count() === 0, 'Unknown language did not use plain fallback');
    await code.getByTestId('code-language').click();
    await page.getByRole('menuitemradio', {name:'javascript',exact:true}).click();
    await page.getByRole('menu').waitFor({state:'detached'});
    await code.locator('.hljs-keyword').waitFor();
    const languages = await page.evaluate(async () => {
      const lowlight=document.querySelector('[data-document-tab][data-active=true] .document-editor').editor.extensionManager.extensions.find(extension => extension.name === 'codeBlock').options.lowlight;
      const {common}=await import('/src/code-languages.ts');
      return {actual:lowlight.listLanguages().sort(),expected:Object.keys(common).sort()};
    });
    commonNames = languages.expected;
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
    check((await code.getByTestId('code-language').textContent()) === 'js', 'Load failure changed language');
    await page.keyboard.press('ControlOrMeta+z');
    check(!(await code.locator('pre').innerText()).endsWith(' plain'), 'Load failure lost Undo');
  } finally { await page.unroute('**/src/code-languages.ts*'); }

  // Existing arbitrary fence names stay literal until an explicit selection.
  const picker = code.getByTestId('code-language');
  const menu = page.getByRole('menu', {name:'Choose code language',exact:true});
  const engineLanguage = () => code.evaluate(element => {
    const editor = element.closest('.document-editor').editor;
    return editor.state.doc.content.content.find(node => node.type.name === 'codeBlock').attrs.language;
  });
  const expectLanguage = async value => {
    await expect(picker).toHaveText(value || 'Plain text');
    check(await engineLanguage() === value, 'Selected language and engine differ');
  };
  check(await picker.count() === 1 && await code.locator('input').count() === 0, 'Language must have one selection trigger and no text input');
  await expectLanguage('js');
  const beforeMenu = await snapshot();
  await picker.focus(); await page.keyboard.press('Enter'); await menu.waitFor();
  await expect(menu.getByRole('menuitemradio',{name:'Plain text',exact:true})).toBeFocused();
  await expect(menu.getByRole('menuitemradio',{name:'js',exact:true})).toHaveAttribute('aria-checked','true');
  const choices = await menu.getByRole('menuitemradio').allTextContents();
  check(commonNames.filter(name => name !== 'plaintext').every(name => choices.some(text => text.trim() === name)), 'Menu is missing a common grammar');
  check(!choices.some(text => text.trim() === 'plaintext') && new Set(choices).size === choices.length, 'Menu duplicates a plain-text choice or language');
  check(choices.some(text => text.trim() === 'html') && choices.some(text => text.trim() === 'powershell'), 'Menu lost existing choices');
  await page.keyboard.press('Escape'); await menu.waitFor({state:'detached'});
  check(await snapshot() === beforeMenu, 'Opening/dismissing the menu changed the document or history');
  await picker.click(); await menu.getByRole('menuitemradio',{name:'js',exact:true}).click();
  await menu.waitFor({state:'detached'});
  check(await snapshot() === beforeMenu, 'Choosing the current unlisted value changed the document or history');
  await expect(picker).toBeFocused();
  await page.keyboard.press('Enter'); await menu.waitFor();
  await expect(menu.getByRole('menuitemradio',{name:'Plain text',exact:true})).toBeFocused();
  await page.keyboard.type('rust');
  await expect(menu.getByRole('menuitemradio',{name:'rust',exact:true})).toBeFocused();
  await page.keyboard.press('Enter'); await menu.waitFor({state:'detached'});
  await expectLanguage('rust'); await expect(picker).toBeFocused();
  await page.locator('[data-document-tab][data-active=true] .document-editor').evaluate(element => element.editor.commands.undo());
  await expectLanguage('js');
  await page.locator('[data-document-tab][data-active=true] .document-editor').evaluate(element => element.editor.commands.redo());
  await expectLanguage('rust');
  await picker.click(); await menu.waitFor();
  await expect(menu.getByRole('menuitemradio',{name:'rust',exact:true})).toHaveAttribute('aria-checked','true');
  await menu.getByRole('menuitemradio',{name:'Plain text',exact:true}).click();
  await menu.waitFor({state:'detached'}); await expectLanguage('');
  await picker.click(); await menu.getByRole('menuitemradio',{name:'python-repl',exact:true}).click();
  await menu.waitFor({state:'detached'}); await expectLanguage('python-repl');

  // Code-body composition remains engine-owned; the removed language input has no IME state.
  const cdp = await page.context().newCDPSession(page);
  const compose = text => cdp.send('Input.imeSetComposition',{text,selectionStart:text.length,selectionEnd:text.length});
  try {
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
  check(await page.getByTestId('status').getAttribute('data-operation') === 'saved', 'Code language Save failed');
  const disk = await (await page.request.get(`${origin}/api/document?path=${encodeURIComponent(file)}`)).json();
  check(disk.source.includes('```python-repl\nconst value = 1;한글\n```'), 'Save did not preserve the selected language and code');
  await assertSavedSource(disk.source, originalSource.replace('```js\nconst value = 1;', '```python-repl\nconst value = 1;한글'), 'Language Save changed other document content');
  await reloadDocument(page); await ready();
  check(await picker.textContent() === 'python-repl' && await code.locator('pre').textContent() === 'const value = 1;한글', 'Reload lost composed input');
  await code.evaluate(n => n.closest('.document-editor').editor.setEditable(false));
  await expect(picker).toBeDisabled();
  await picker.focus(); await page.keyboard.press('Enter');
  check(await menu.count() === 0, 'Read-only code opened the language menu');
  return {deferred:true,languageSet:true,unknownFallback:true,failedFallback:true,history:true,languageMenu:true,unlistedLanguage:true,readOnly:true,bodyCompositionUndoRedo:true,languageSaveReload:true};
}
