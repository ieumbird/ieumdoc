// Real scratch-file persistence, explicit drafts, native input dragging and real delayed renders.
async (page, { openPath, screenshots, expect, waitForEditorFocus, reloadDocument }) => {
  const origin = page.url().split('/').slice(0, 3).join('/');
  const initial = await (await page.request.get(origin + '/api/document')).json();
  const separator = initial.path.includes('\\') ? '\\' : '/';
  const root = initial.path.split(separator).slice(0, -4).join(separator);
  const file = [root, 'tmp', 'mermaid-authoring', 'diagram.md'].join(separator);
  // Hold a real render result after its SVG exists, allowing a later render to finish first.
  await page.route('**/src/mermaid-render.ts*', async route => {
    const response = await route.fetch();
    await route.fulfill({response, body: await response.text() + `\n
      const actualMermaidRender = renderMermaid;
      renderMermaid = async (...args) => {
        const result = await actualMermaidRender(...args);
        if (window.__holdMermaid && args[0].includes('Delayed')) {
          window.__mermaidHeld = true;
          await new Promise(resolve => window.__releaseMermaid = resolve);
        }
        return result;
      };\n`});
  });
  expect(await page.evaluate(() => performance.getEntriesByType('resource').some(r => r.name.includes('/src/mermaid-render.ts')))).toBe(false);
  await openPath(page, file);
  const active = page.locator('[data-document-tab][data-active=true]');
  const editor = active.locator('.document-editor');
  const figure = active.locator('[data-content-kind="mermaid"]').first();
  const field = () => active.getByTestId('mermaid-source');
  const preview = () => active.getByTestId('mermaid-edit-preview');
  const rendered = async (locator, text) => {
    await expect(locator).toHaveAttribute('aria-busy','false');
    await expect(locator.locator('img')).toBeVisible();
    expect(decodeURIComponent(await locator.locator('img').getAttribute('src'))).toContain(text);
  };
  const model = () => editor.evaluate(el => {
    const e=el.editor, h=e.state.plugins.find(p=>p.key.startsWith('history$')).getState(e.state);
    return {doc:e.getJSON(),undo:h.done.eventCount,redo:h.undone.eventCount};
  });
  const disk = async () => (await (await page.request.get(`${origin}/document/diagram.md?path=${encodeURIComponent(file)}`)).text()).replaceAll('\r\n','\n');
  const save = async () => {
    const response=page.waitForResponse(r=>r.request().method()==='POST' && /\/api\/document(?:\?|$)/.test(r.url()));
    await page.getByTestId('save').click(); expect((await response).status()).toBe(200);
  };
  const edit = async () => {
    await figure.hover({position:{x:4,y:4}}); await figure.getByRole('button',{name:'Edit figure'}).click();
    await expect(field()).toBeFocused();
    await expect(figure.getByTestId('figure-file-name')).toHaveCount(0);
  };
  await rendered(figure.getByTestId('mermaid-preview'), '>A<');
  // A visible <img> can still be broken: decode the real SVG image, including HTML labels.
  const beforeLabels = await model(), diskBeforeLabels = await disk();
  await edit();
  for (const label of ['첫 줄\\n둘째 줄', 'First<br>Second', 'First<br/>Second']) {
    await field().fill(`flowchart LR\n  A["${label}"] --> B`);
    await rendered(preview(), label.startsWith('첫') ? '첫 줄' : 'First');
    if (screenshots && label.startsWith('첫')) await page.screenshot({path:'tmp/mermaid-707-newline.png'});
    const image = await preview().locator('img').evaluate(async img => {
      try { await img.decode(); return {width:img.naturalWidth,height:img.naturalHeight}; }
      catch (error) { return {error:String(error),svg:decodeURIComponent(img.src)}; }
    });
    expect(image.error).toBeUndefined();
    expect(image.width).toBeGreaterThan(0); expect(image.height).toBeGreaterThan(0);
    const labelMarkup = await preview().locator('img').evaluate(img => {
      const xml = new DOMParser().parseFromString(decodeURIComponent(img.src.split(',')[1]), 'image/svg+xml');
      return {errors:xml.querySelectorAll('parsererror').length,
        breaks:xml.getElementsByTagNameNS('http://www.w3.org/1999/xhtml','br').length};
    });
    expect(labelMarkup.errors).toBe(0); expect(labelMarkup.breaks).toBeGreaterThan(0);
    expect(await field().inputValue()).toBe(`flowchart LR\n  A["${label}"] --> B`);
  }
  // Exercise an image-decoder rejection independently of Mermaid syntax errors.
  await page.evaluate(() => {
    window.__originalImageDecode = HTMLImageElement.prototype.decode;
    HTMLImageElement.prototype.decode = function () { return Promise.reject(new Error('Image decoder unavailable')); };
  });
  await field().fill('graph LR\n  DecodeFailure --> B');
  await expect(preview().getByTestId('mermaid-error')).toContainText('Image decoder unavailable');
  await expect(preview().locator('img')).toHaveCount(0);
  await page.evaluate(() => { HTMLImageElement.prototype.decode = window.__originalImageDecode; });
  await field().fill('graph LR\n  Recovered --> B'); await rendered(preview(), 'Recovered');
  await active.getByTestId('mermaid-cancel').click();
  expect(await model()).toEqual(beforeLabels); expect(await disk()).toBe(diskBeforeLabels);
  const refs=active.getByTestId('cross-reference');
  await expect(refs.nth(0)).toHaveAttribute('data-resolved','true');
  await expect(refs.nth(1)).toHaveAttribute('data-resolved','true');
  expect(await refs.allTextContents()).toEqual(['Figure\u00a01','Figure\u00a02']);
  // Empty captions share the table hint, but remain ordinary document input.
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  for (const language of ['en', 'ko']) {
    await page.evaluate(async language => (await import('/src/i18n.ts')).i18n.changeLanguage(language), language);
    const hint = language === 'ko' ? '그림 캡션을 입력하세요...' : 'Enter a figure caption…';
    const accessibleName = language === 'ko' ? '그림 캡션' : 'Figure caption';
    const allFigures = active.locator('[data-block="figure"]');
    const originalCaptions = ['Signal flow', 'Image caption'];
    for (let index = 0; index < 2; index++) {
      const caption = allFigures.nth(index).getByTestId('figure-caption-content');
      await caption.evaluate(element => {
        const editor = element.closest('.document-editor').editor;
        const path = element.closest('[data-block="figure"]').getAttribute('data-source-path');
        editor.state.doc.forEach((node, pos) => {
          if (node.type.name === 'figure' && node.attrs.sourcePath === path)
            editor.commands.setTextSelection({from:pos+1,to:pos+node.nodeSize-1});
        });
        editor.view.focus();
      });
      await page.keyboard.press('Backspace');
    }
    if (screenshots) {
      for (const width of [1440, 640]) {
        await page.setViewportSize({width, height:1000});
        await page.evaluate(() => document.fonts.ready);
        await allFigures.first().scrollIntoViewIfNeeded();
        await page.screenshot({path:`tmp/caption-677-${language}-${width}.png`});
      }
    }
    await save();
    expect(await disk()).not.toContain(hint);
    await page.getByTestId('view-source').click();
    expect(await active.getByTestId('source-view').innerText()).not.toContain(hint);
    await page.getByTestId('view-visual').click();
    await active.locator('.document-editor').evaluate(element => element.editor.commands.setTextSelection(1));
    for (let index = 0; index < 2; index++) {
      const caption = allFigures.nth(index).getByTestId('figure-caption-content');
      await expect(caption).toHaveAttribute('data-placeholder', hint);
      await expect(caption).toHaveAccessibleName(accessibleName);
      const style = await caption.evaluate(element => ({width:element.getBoundingClientRect().width,
        min:parseFloat(getComputedStyle(element).fontSize)*8, content:getComputedStyle(element,'::before').content,
        text:element.textContent}));
      expect(style.width).toBeGreaterThanOrEqual(style.min);
      expect(style.content).toBe(`"${hint}" / ""`);
      expect(style.text).toBe('');
      await page.evaluate(hint => navigator.clipboard.writeText(hint), hint);
      await allFigures.nth(index).evaluate(element => {
        const editor = element.closest('.document-editor').editor;
        const path = element.getAttribute('data-source-path');
        editor.state.doc.forEach((node, pos) => {
          if (node.type.name === 'figure' && node.attrs.sourcePath === path) editor.commands.setNodeSelection(pos);
        });
        editor.view.focus();
      });
      await page.keyboard.press('ControlOrMeta+c');
      expect(await page.evaluate(() => navigator.clipboard.readText())).not.toContain(hint);
      await caption.click({position:{x:20,y:8}});
      // One grapheme can span multiple UTF-16 units; deleting it must preserve contentDOM.
      await page.keyboard.insertText('🧪');
      await expect(caption).toHaveText('🧪');
      await page.keyboard.press('Backspace');
      await page.keyboard.press('Backspace');
      await expect(caption).toHaveText('');
      expect(await caption.locator('[data-node-view-content-react]').count()).toBe(1);
      await page.keyboard.type(originalCaptions[index]);
      await expect(caption).not.toHaveAttribute('data-placeholder');
      await expect(caption).toHaveText(originalCaptions[index]);
    }
    await save();
    expect(await disk()).not.toContain(hint);
    await page.getByTestId('view-source').click();
    expect(await active.getByTestId('source-view').innerText()).not.toContain(hint);
    await page.getByTestId('view-visual').click();
  }
  await page.evaluate(async () => (await import('/src/i18n.ts')).i18n.changeLanguage('en'));
  if (screenshots) {
    for (const theme of ['light', 'dark']) {
      await page.evaluate(async theme => (await import('/src/theme.ts')).applyTheme(theme), theme);
      for (const width of [1440, 640]) {
        await page.setViewportSize({width, height:1000});
        await page.evaluate(() => document.fonts.ready);
        await figure.scrollIntoViewIfNeeded();
        await rendered(figure.getByTestId('mermaid-preview'), '>A<');
        await page.screenshot({path:`tmp/mermaid-651-after-${theme}-${width}-display.png`});
        await edit(); await rendered(preview(), '>A<');
        expect((await field().boundingBox()).width).toBeGreaterThan((await figure.boundingBox()).width-2);
        expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
        await page.screenshot({path:`tmp/mermaid-651-after-${theme}-${width}-edit.png`});
        await active.getByTestId('mermaid-cancel').click();
      }
    }
  }
  await page.setViewportSize({width:1440,height:1000});
  await page.evaluate(async ()=>(await import('/src/theme.ts')).applyTheme('light'));
  const opening=await model(), originalDisk=await disk();
  await figure.getByTestId('mermaid-preview').dblclick(); await expect(field()).toBeFocused();
  await field().fill('graph LR'); await field().press('End'); await field().press('Enter'); await field().pressSequentially('  A --> C');
  expect(await field().inputValue()).toBe('graph LR\n  A --> C');
  const height=(await field().boundingBox()).height;
  await field().fill('graph LR\n  A-->B\n  B-->C\n  C-->D\n  D-->E\n  E-->F\n  F-->G\n  G-->H');
  expect((await field().boundingBox()).height).toBeGreaterThan(height);
  await field().press('Escape'); await waitForEditorFocus(page); expect(await model()).toEqual(opening);
  await page.context().grantPermissions(['clipboard-read','clipboard-write']);
  for (const id of ['mermaid-source','mermaid-label']) {
    await edit(); const input=active.getByTestId(id);
    await input.fill('alpha beta gamma'); await input.focus(); await input.evaluate(el=>el.setSelectionRange(0,5));
    // Rendering the now-invalid draft changes preview height. Measure after that real layout
    // transition, so the pointer still targets the selected native text when dragging begins.
    await expect(preview()).toHaveAttribute('aria-busy','false');
    const g=await input.evaluate(el=>{
      const r=el.getBoundingClientRect(),s=getComputedStyle(el),c=document.createElement('canvas').getContext('2d');c.font=s.font;
      return {start:r.left+parseFloat(s.borderLeftWidth)+parseFloat(s.paddingLeft)+c.measureText('al').width,
        end:r.right-parseFloat(s.paddingRight)-5,y:r.top+parseFloat(s.borderTopWidth)+parseFloat(s.paddingTop)+parseFloat(s.lineHeight)/2};
    });
    await page.evaluate(()=>{window.__mermaidDrag=[];for(const type of ['dragstart','drop'])document.addEventListener(type,e=>window.__mermaidDrag.push({type,trusted:e.isTrusted}),{capture:true,once:true});});
    await page.mouse.move(g.start,g.y);await page.mouse.down();await page.mouse.move(g.end,g.y,{steps:12});await page.mouse.up();
    expect(await input.inputValue()).toBe(' beta gammaalpha');
    expect(await page.evaluate(()=>window.__mermaidDrag)).toEqual([{type:'dragstart',trusted:true},{type:'drop',trusted:true}]);
    await page.evaluate(()=>navigator.clipboard.writeText(' PASTE'));await input.press('End');await input.press('ControlOrMeta+v');
    expect(await input.inputValue()).toBe(' beta gammaalpha PASTE');expect(await model()).toEqual(opening);
    await active.getByTestId('mermaid-cancel').click();expect(await model()).toEqual(opening);
  }
  await edit();await page.evaluate(()=>navigator.clipboard.writeText('graph TD\r\n  Draft --> Next'));
  await field().press('ControlOrMeta+a');await field().press('ControlOrMeta+v');
  expect(await field().inputValue()).toBe('graph TD\n  Draft --> Next');
  await active.getByText('Before.',{exact:true}).click();await expect(field()).toBeVisible();
  await expect(active.getByTestId('figure-draft-status')).toBeVisible();
  expect(await page.evaluate(()=>{const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented;})).toBe(true);
  await save();expect(await disk()).toBe(originalDisk);
  await page.getByRole('button',{name:'Source',exact:true}).click();
  const source=await active.getByTestId('source-view').locator('pre').textContent();
  expect(source).toContain('graph LR');expect(source).not.toContain('Draft --> Next');
  await page.getByRole('button',{name:'Visual',exact:true}).click();expect(await field().inputValue()).toBe('graph TD\n  Draft --> Next');
  await openPath(page,[root,'tmp','mermaid-authoring','other.md'].join(separator));
  await page.getByRole('tab',{name:'diagram.md, Unsaved changes',exact:true}).click();
  expect(await field().inputValue()).toBe('graph TD\n  Draft --> Next');
  const rejectedSource=':class: rejected\ngraph LR\n  A-->B';
  for(const [source,method] of [['','shortcut'], [' \t\n ','shortcut'], [rejectedSource,'shortcut'], ['\n'+rejectedSource+'\t \n','button']]) {
    await field().fill(source);
    if(method==='button')await active.getByTestId('mermaid-apply').click();
    else await field().press('ControlOrMeta+Enter');
    await expect(active.getByTestId('mermaid-editor').locator('[role="alert"]')).toBeVisible();
    await expect(field()).toBeEnabled();
    expect(await field().evaluate(input=>document.activeElement===input)).toBe(true);
    expect(await field().inputValue()).toBe(source);expect(await model()).toEqual(opening);
    await page.keyboard.type('Z');expect(await field().inputValue()).toBe(source+'Z');
    expect(await model()).toEqual(opening);
  }
  // Hold actual Core refusals while focus moves to prose or another document tab.
  // After busy completes, read focus directly; do not poll it back into the desired state.
  for(const elsewhere of ['prose','tab']) {
    let release, received;
    const gate=new Promise(resolve=>release=resolve), responseReady=new Promise(resolve=>received=resolve);
    await page.route('**/api/figure-validation',async route=>{
      const response=await route.fetch();received();await gate;await route.fulfill({response});
    },{times:1});
    await field().fill(rejectedSource);await field().press('ControlOrMeta+Enter');
    await responseReady;await expect(field()).toBeDisabled();
    const otherTab=page.getByRole('tab',{name:'other.md',exact:true});
    if(elsewhere==='prose')await active.getByText('Before.',{exact:true}).click();
    else await otherTab.click();
    const completed=page.waitForResponse(r=>r.url().endsWith('/api/figure-validation'));
    release();await (await completed).finished();
    if(elsewhere==='prose') {
      await expect(field()).toBeEnabled();
      expect(await field().evaluate(input=>document.activeElement===input)).toBe(false);
      expect(await editor.evaluate(el=>el.editor.view.hasFocus())).toBe(true);
    } else {
      // Inactive tabs intentionally unmount the form controls while retaining NodeView drafts.
      await page.evaluate(()=>new Promise(requestAnimationFrame));
      expect(await otherTab.evaluate(tab=>document.activeElement===tab)).toBe(true);
      const diagramTab=page.getByRole('tab',{name:'diagram.md, Unsaved changes',exact:true});
      await diagramTab.click();await expect(field()).toBeEnabled();
      await expect(active.getByTestId('mermaid-editor').locator('[role="alert"]')).toBeVisible();
      expect(await diagramTab.evaluate(tab=>document.activeElement===tab)).toBe(true);
    }
    expect(await field().inputValue()).toBe(rejectedSource);expect(await model()).toEqual(opening);
  }
  await field().fill('graph TD\n  Applied --> Next');await active.getByTestId('mermaid-label').fill('fig-new');
  const caption=figure.getByTestId('figure-caption-content');
  await caption.click();await page.keyboard.press('End');await page.keyboard.type(' live');
  await field().press('ControlOrMeta+Enter');await expect(field()).toHaveCount(0);await waitForEditorFocus(page);
  await expect(refs.first()).toHaveAttribute('data-resolved','true');await rendered(figure.getByTestId('mermaid-preview'),'Applied');
  await save();expect(await disk()).toContain('graph TD\n  Applied --> Next');expect(await disk()).toContain('{numref}`fig-new`');
  expect(await disk()).toContain('Signal flow live');
  await editor.evaluate(el=>el.editor.commands.undo());await rendered(figure.getByTestId('mermaid-preview'),'>A<');
  await editor.evaluate(el=>el.editor.commands.redo());await reloadDocument(page);
  await rendered(figure.getByTestId('mermaid-preview'),'Applied');await edit();expect(await field().inputValue()).toBe('graph TD\n  Applied --> Next');
  await page.evaluate(()=>{window.__holdMermaid=true;window.__mermaidHeld=false;});await field().fill('graph LR\n  Delayed --> Old');
  await page.waitForFunction(()=>window.__mermaidHeld);await field().fill('graph LR\n  Latest --> Result');await rendered(preview(),'Latest');
  await page.evaluate(async ()=>(await import('/src/theme.ts')).applyTheme('dark'));await expect(preview()).toHaveAttribute('data-theme','dark');
  await rendered(preview(),'Latest');const darkSvg=await preview().locator('img').getAttribute('src');
  await page.evaluate(async ()=>{window.__holdMermaid=false;window.__releaseMermaid();await new Promise(requestAnimationFrame);});
  expect(await preview().locator('img').getAttribute('src')).toBe(darkSvg);
  await page.evaluate(async ()=>(await import('/src/theme.ts')).applyTheme('light'));await rendered(preview(),'Latest');
  expect(await preview().locator('img').getAttribute('src')).not.toBe(darkSvg);
  await field().fill('this is not Mermaid');await expect(preview().getByTestId('mermaid-error')).toBeVisible();
  await active.getByTestId('mermaid-apply').click();await expect(field()).toHaveCount(0);await expect(figure.getByTestId('mermaid-error')).toBeVisible();
  await save();expect(await disk()).toContain('this is not Mermaid');await reloadDocument(page);await expect(figure.getByTestId('mermaid-error')).toBeVisible();
  await edit();await field().fill('graph LR\n  Safe["<img src=x onerror=alert(1)>"] --> B\n  click B "javascript:alert(1)"');await rendered(preview(),'Safe');
  expect(await figure.locator('script,svg,foreignObject').count()).toBe(0);await active.getByTestId('mermaid-cancel').click();
  await active.getByText('After.',{exact:true}).click();await page.keyboard.press('End');await page.keyboard.press('Enter');await page.keyboard.type('/mermaid');
  const menu=page.getByRole('menu',{name:'Insert block'});await expect(menu.getByRole('menuitem',{name:'Diagram',exact:true})).toBeVisible();
  await menu.getByRole('menuitem',{name:'Diagram',exact:true}).click();await expect(field()).toBeFocused();expect(await field().inputValue()).toBe('graph LR\n  A --> B');
  await active.getByTestId('mermaid-cancel').click();await save();expect((await disk()).match(/\{mermaid\}/g).length).toBe(2);
  await reloadDocument(page);const diagrams=active.locator('[data-content-kind="mermaid"]');await expect(diagrams).toHaveCount(2);await rendered(diagrams.last().getByTestId('mermaid-preview'),'>A<');
  await edit();await field().fill('graph LR\n  A --> B');await active.getByTestId('mermaid-apply').click();await expect(field()).toHaveCount(0);
  await rendered(diagrams.first().getByTestId('mermaid-preview'),'>A<');
  const urls=await diagrams.locator('[data-testid="mermaid-preview"] img').evaluateAll(imgs=>imgs.map(img=>decodeURIComponent(img.src)));
  expect(urls.length).toBe(2);
  const ids=urls.map(svg=>svg.match(/<svg[^>]* id="([^"]+)"/)[1]);expect(ids[0]).not.toBe(ids[1]);
  const panel=page.getByRole('complementary',{name:'Outline'});
  if(!await panel.isVisible())await page.getByRole('button',{name:'Outline',exact:true}).click();
  await panel.getByRole('tab',{name:'Figures',exact:true}).click();
  await expect(panel.getByRole('tabpanel').getByRole('button')).toHaveCount(3);
  await save();
  // A rejected lazy import is a block error, while source editing and real Save still work.
  await page.unroute('**/src/mermaid-render.ts*');
  await page.route('**/src/mermaid-render.ts*',route=>route.fulfill({contentType:'application/javascript',body:'throw new Error("Renderer chunk unavailable");'}));
  await page.reload();await expect(diagrams.first().getByTestId('mermaid-error')).toBeVisible();
  await edit();await field().fill('graph TD\n  Offline --> Saved');await active.getByTestId('mermaid-apply').click();
  await expect(field()).toHaveCount(0);await save();expect(await disk()).toContain('Offline --> Saved');
  // MyST drops only these boundaries. Keep first-line indentation, interior whitespace-only
  // lines and trailing whitespace on non-final lines through Apply -> Save -> reopen.
  const normalized='  graph LR  \n    A --> B\n \t\n    B --> C';
  const padded='\r\n \t\r\n'+normalized.replaceAll('\n','\r\n')+'\t \r\n \t\r\n';
  await edit();await field().fill(padded);
  await field().press('ControlOrMeta+Enter');await expect(field()).toHaveCount(0);
  await save();expect(await disk()).toContain('```{mermaid}\n'+normalized+'\n```');
  await reloadDocument(page);await edit();expect(await field().inputValue()).toBe(normalized);
  await active.getByTestId('mermaid-cancel').click();
  expect(await page.locator('body > div[style*="-100000px"]').count()).toBe(0);
  return {sourceSaved:true,draftsPreserved:true,realDrag:true,themeAndStaleRender:true};
}
