// Visual review on real scratch files. Screenshots are evidence, never a replacement document.
// pnpm browser:test quiet-document (prepare is automatic); captures live under tmp/visual-refinement/.
async page => {
  await page.unrouteAll();
  const origin = page.url().split('/').slice(0, 3).join('/');
  const loaded = await (await page.request.get(`${origin}/api/document`)).json();
  const sep = loaded.path.includes('\\') ? '\\' : '/';
  const root = loaded.path.split(sep).slice(0, -4).join(sep);
  const scratch = name => [root, 'tmp', 'quiet-document', name].join(sep);
  const check = (value, message) => { if (!value) throw Error(message); };
  const results = [];
  const open = async name => {
    await page.reload();
    await page.locator('[data-testid="status"][data-operation="Ready"]').waitFor({state:'attached'});
    await page.getByRole('button', {name:'Open…'}).click();
    await page.getByTestId('file-path').fill(scratch(name));
    await page.getByRole('dialog').getByRole('button', {name:'Open',exact:true}).click();
    await page.locator('[data-testid="status"][data-operation="Ready"]').waitFor({state:'attached'});
    check(await page.getByTestId('current-file').getAttribute('title') === scratch(name), 'Wrong file');
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map(img => img.decode()));
    });
  };
  const rest = async () => {
    await page.evaluate(() => { window.scrollTo(0,0); document.activeElement?.blur(); });
    await page.mouse.move(0,0);
    await page.waitForTimeout(150);
  };
  const shot = name => page.screenshot({path:`tmp/visual-refinement/after-${name}.png`});
  const json = () => page.locator('.document-editor').evaluate(n => JSON.stringify(n.editor.getJSON()));
  const bounds = async (locator, label) => {
    await locator.waitFor();
    await page.waitForTimeout(200);
    const result = await locator.evaluate(n => {
      const r=n.getBoundingClientRect();
      const header=document.querySelector('.app-header').getBoundingClientRect().bottom;
      const children=[...n.querySelectorAll('input,select,textarea,button')].map(c=>{
        const a=c.getBoundingClientRect();return {x:a.x,y:a.y,right:a.right,bottom:a.bottom,height:a.height};
      });
      return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height,header,viewport:[innerWidth,innerHeight],children,scrollWidth:n.scrollWidth,clientWidth:n.clientWidth};
    });
    check(result.x>=0&&result.right<=result.viewport[0]+1&&result.y>=result.header-1&&result.bottom<=result.viewport[1]+1, `${label} outside viewport: ${JSON.stringify(result)}`);
    check(result.children.length>0, `${label}: required controls missing`);
    check(result.children.every(c=>c.y>=result.y-1&&c.bottom<=result.bottom+1), `${label}: controls clipped vertically ${JSON.stringify(result)}`);
    check(result.scrollWidth<=result.clientWidth+1&&result.children.every(c=>c.x>=result.x-1&&c.right<=result.right+1), `${label}: controls clipped horizontally`);
    results.push({label,...result});
  };
  await open('quiet-document.md');
  const initial=await json();
  await rest();
  const metadata=page.locator('.block-metadata');
  const metadataState=await metadata.evaluateAll(nodes=>nodes.map(n=>({visibility:getComputedStyle(n).visibility,pointer:getComputedStyle(n).pointerEvents,controls:n.querySelectorAll('button,a,input').length})));
  check(metadataState.length===2&&metadataState.every(m=>m.visibility==='hidden'&&m.pointer==='none'&&m.controls===0),'Rest metadata must be hidden, inert text; controls remain separate');
  check(await page.getByTestId('current-file').textContent()==='quiet-document.md','Filename must be the visible identity');
  check(await page.getByTestId('status').textContent()==='','Loaded document should have quiet idle status');
  for(const kind of ['figure','equation']) {
    const block=page.locator(`.${kind}`),meta=block.locator('.block-metadata');
    const before=await block.boundingBox();
    await block.hover();
    check(await meta.evaluate(n=>getComputedStyle(n).visibility==='visible'),`${kind}: hover metadata missing`);
    await rest();
    check((await block.boundingBox()).y===before.y,`${kind}: metadata shifted content`);
  }
  for(const width of [1440,1024,768,705,704]) {
    await page.setViewportSize({width,height:1000});
    await rest();
    await shot(`${width}-rest`);
    await page.getByRole('button',{name:'Collapse sidebar',exact:true}).click();
    await rest();
    await shot(`${width}-collapsed`);
    await page.getByRole('button',{name:'Expand sidebar',exact:true}).click();
  }
  for(const width of [1440,1024,768]) {
    await page.setViewportSize({width,height:1000});
    await rest();
    await page.getByTestId('figure-image').click();
    await page.getByTestId('figure-properties').waitFor();
    check(await page.locator('.figure .block-metadata').evaluate(n=>getComputedStyle(n).visibility==='visible'),'Selected metadata missing');
    await rest();
    await shot(`${width}-figure-selected`);
    await page.getByRole('button',{name:'Edit figure'}).click();
    await page.waitForFunction(()=>document.activeElement?.getAttribute('data-testid')==='figure-image-url');
    await bounds(page.getByTestId('figure-properties'), `Figure ${width}`);
    const colors=await page.evaluate(()=>{
      const root=getComputedStyle(document.documentElement),input=document.querySelector('[data-testid="figure-image-url"]');
      const interaction=root.getPropertyValue('--id-color-interaction').trim();
      const probe=document.createElement('span');probe.style.color=interaction;document.body.append(probe);const color=getComputedStyle(probe).color;probe.remove();
      return {color,outline:getComputedStyle(document.querySelector('.figure')).outlineColor,border:getComputedStyle(input).borderColor,ring:getComputedStyle(input).boxShadow};
    });
    check(colors.outline===colors.color&&colors.border===colors.color&&colors.ring.includes(colors.color),`Interaction role not applied: ${JSON.stringify(colors)}`);
    await page.mouse.move(0,0);
    await shot(`${width}-figure-editing`);
    // The selected outline is an interaction state, not draft ownership.
    await page.getByTestId('figure-caption').fill('수정 중인 caption');
    check(await page.getByTestId('status').textContent()==='Unsaved changes','Dirty Figure draft has misleading status');
    await page.locator('.document-editor').press('ArrowDown');
    check(await page.getByTestId('figure-caption').inputValue()==='수정 중인 caption','Selection movement lost the Figure draft');
    check(await page.locator('.figure[data-selected="false"][data-editing="true"]').count()===1,'Independent selected/editing axes missing');
    await page.getByTestId('figure-cancel').click();
    await page.locator('.paragraph').first().click();
    await page.locator('.equation').hover();
    await page.locator('.equation').getByRole('button',{name:'Edit',exact:true}).click();
    await page.getByTestId('equation-editor').waitFor();
    await page.evaluate(()=>window.scrollTo(0,0));
    await page.mouse.move(0,0);
    await shot(`${width}-equation-editing`);
    await page.getByTestId('equation-cancel').click();
  }
  check(await json()===initial,'Visual interactions or canceled drafts changed document JSON');
  check(await page.getByTestId('status').textContent()==='','Canceled drafts left a false dirty status');

  const contrast=await page.evaluate(()=>{
    const canvas=document.createElement('canvas');canvas.width=canvas.height=1;
    const context=canvas.getContext('2d');
    const rgba=color=>{context.clearRect(0,0,1,1);context.fillStyle=color;context.fillRect(0,0,1,1);return [...context.getImageData(0,0,1,1).data];};
    const luminance=rgb=>rgb.slice(0,3).map(v=>{v/=255;return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[0.2126,0.7152,0.0722][i],0);
    return ['.document-path-name','.product','.caption','.admonition-label','.admonition-body','.cross-reference-chip','.block-kind','[data-testid="save"]'].map(selector=>{
      const n=document.querySelector(selector);if(!n)throw Error(`Missing contrast target ${selector}`);
      let bg=[255,255,255,255];
      for(let p=n;p;p=p.parentElement){const c=rgba(getComputedStyle(p).backgroundColor);if(c[3]===255){bg=c;break;}}
      const a=luminance(rgba(getComputedStyle(n).color)),b=luminance(bg);
      return {selector,ratio:(Math.max(a,b)+0.05)/(Math.min(a,b)+0.05)};
    });
  });
  check(contrast.every(c=>c.ratio>=4.5),`UI contrast below 4.5:1 ${JSON.stringify(contrast)}`);
  results.push({contrast});

  // Real keyboard navigation exposes hidden tools before activation.
  await page.setViewportSize({width:1440,height:1000});
  await page.getByTestId('save').focus();
  let keyboardFigure=false;
  for(let i=0;i<12;i++) {
    await page.keyboard.press('Tab');
    if(await page.evaluate(()=>document.activeElement?.getAttribute('aria-label')==='Edit figure')) {
      keyboardFigure=await page.getByRole('button',{name:'Edit figure'}).evaluate(n=>getComputedStyle(n).opacity==='1'&&getComputedStyle(n).pointerEvents==='auto');
      break;
    }
  }
  check(keyboardFigure,'Figure Edit unreachable or invisible with Tab');
  check(await page.locator('.figure .block-metadata').evaluate(n=>getComputedStyle(n).visibility==='visible'),'Keyboard focus metadata missing');
  await page.keyboard.press('Enter');
  await page.waitForFunction(()=>document.activeElement?.getAttribute('data-testid')==='figure-image-url');
  await page.getByTestId('figure-cancel').click();

  // Gutter menu takes focus; Escape restores the opening control.
  await page.locator('.heading').first().hover();
  const insert=page.getByRole('button',{name:'Insert block after heading block 1',exact:true});
  await insert.click();
  await page.getByRole('menu',{name:'Insert block'}).waitFor();
  await page.waitForFunction(()=>document.activeElement?.getAttribute('role')==='menuitem');
  await page.keyboard.press('Escape');
  check(await insert.evaluate(n=>n===document.activeElement),'Gutter menu did not return keyboard focus');

  // Native Chromium composition input, then undo/redo. OS candidate-window behavior is a manual check.
  const paragraph=page.locator('.paragraph').first();
  await paragraph.click();
  await page.keyboard.press('End');
  const originalText=await paragraph.textContent();
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Input.imeSetComposition',{text:'한글입력',selectionStart:4,selectionEnd:4});
  await cdp.send('Input.insertText',{text:'한글입력'});
  await cdp.detach();
  check((await paragraph.textContent()).includes('한글입력'),'Korean composition failed');
  check(await page.getByTestId('status').textContent()==='Unsaved changes','Typing did not expose unsaved state');
  await page.keyboard.press('Control+z');
  check(await paragraph.textContent()===originalText,'Composition undo failed');
  check(await page.getByTestId('status').textContent()==='','Undo to baseline left a false dirty status');
  await page.keyboard.press('Control+Shift+z');
  check((await paragraph.textContent()).includes('한글입력'),'Composition redo failed');
  await page.getByTestId('save').click();
  await page.getByText('Saved',{exact:true}).waitFor();
  await paragraph.click();
  await page.keyboard.press('End');
  await page.keyboard.insertText(' AFTER_SAVE');
  check(await page.getByTestId('status').textContent()==='Unsaved changes','Confirmed Saved remained visible after an edit');
  await page.keyboard.press('Control+z');
  check(await page.getByTestId('status').textContent()==='Saved','Undo to the saved baseline did not clear dirty status');
  await page.keyboard.press('Control+Shift+z');
  check(await page.getByTestId('status').textContent()==='Unsaved changes','Redo did not restore dirty status');
  await open('quiet-document.md');
  check((await page.locator('.paragraph').first().textContent()).includes('한글입력')&&!(await page.locator('.paragraph').first().textContent()).includes('AFTER_SAVE'),'Save / Reload did not preserve only the saved composition');

  // Reorder through the real drag handle, then restore through history.
  await page.locator('.heading').first().hover();
  const target=page.locator('.paragraph').first();
  const targetBox=await target.boundingBox();
  await page.getByRole('button',{name:'Move heading block 1',exact:true}).dragTo(target,{targetPosition:{x:40,y:targetBox.height-2}});
  check(await page.locator('.document-editor').evaluate(n=>n.editor.state.doc.firstChild.type.name==='paragraph'),'Block drag failed');
  await page.keyboard.press('Control+z');
  check(await page.locator('.document-editor').evaluate(n=>n.editor.state.doc.firstChild.type.name==='heading'),'Block move undo failed');

  // Inline overlays at the right edge, including resize and scroll while open.
  await page.setViewportSize({width:768,height:700});
  await page.locator('.inline-math-rendered').first().click();
  await bounds(page.getByTestId('inline-math-form'),'Inline math 768');
  await page.setViewportSize({width:704,height:650});
  await page.mouse.wheel(0,120);
  await bounds(page.getByTestId('inline-math-form'),'Inline math resized/scrolled');
  await shot('704-inline-math');
  await page.getByTestId('inline-math-source').press('Escape');
  await page.locator('.cross-reference-chip').last().click();
  await bounds(page.getByTestId('reference-form'),'Reference 704');
  await shot('704-reference');
  await page.getByTestId('reference-target').press('Escape');
  await page.locator('.paragraph').first().dblclick();
  await bounds(page.getByTestId('selection-toolbar'),'Selection toolbar 704');
  await page.getByRole('button',{name:'Link',exact:true}).click();
  await bounds(page.getByTestId('link-form'),'Link 704');
  await shot('704-link');
  await page.getByTestId('link-url').press('Escape');
  await page.waitForFunction(()=>document.querySelector('.document-editor')?.contains(document.activeElement));
  check(await page.locator('.document-editor').evaluate(n=>n.contains(document.activeElement)),'Inline form did not return focus');
  await page.locator('.paragraph').last().click();
  await page.keyboard.press('End');
  await page.keyboard.type(' /');
  await bounds(page.getByRole('menu',{name:'Insert block'}),'Slash menu 704');
  check(await page.locator('.document-editor').evaluate(n=>n.contains(document.activeElement)),'Slash stole editor focus');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+z');

  // Long content stays scrollable inside its block; the whole document never clips it.
  await open('아주-긴-파일명-very-long-technical-document-name-for-visual-review.md');
  for(const width of [1440,1024,768]) {
    await page.setViewportSize({width,height:1000});
    await rest();
    const local=await page.evaluate(()=>{
      const required=s=>{const n=document.querySelector(s);if(!n)throw Error(`Missing ${s}`);return n;};
      const math=required('.equation-math'),content=required('.equation-content'),table=required('.table-block');
      const text=required('.document-path-name'),path=required('.document-path');
      return {math:[math.clientWidth,math.scrollWidth],table:[table.clientWidth,table.scrollWidth],formulaLeft:content.getBoundingClientRect().left-math.getBoundingClientRect().left,docOverflow:document.documentElement.scrollWidth>innerWidth,filenameVisible:text.getBoundingClientRect().width>100,pathTitle:path.title};
    });
    check(local.math[1]>local.math[0]&&local.table[1]>local.table[0],`Long fixture did not exercise scrolling ${JSON.stringify(local)}`);
    check(local.formulaLeft>=-1&&!local.docOverflow&&local.filenameVisible&&local.pathTitle===scratch('아주-긴-파일명-very-long-technical-document-name-for-visual-review.md'),`Long content clipped ${JSON.stringify(local)}`);
    await page.locator('.equation-math').evaluate(n=>n.scrollLeft=n.scrollWidth);
    check(await page.locator('.equation-math').evaluate(n=>n.scrollLeft>0),'Formula not scrollable to end');
    await page.locator('.equation-math').evaluate(n=>n.scrollLeft=0);
    await shot(`${width}-long-content`);
    results.push({width,...local});
  }
  for(const [button,label] of [['Open…','Open'],['New','New']]) {
    await page.getByRole('button',{name:button,exact:true}).click();
    await bounds(page.getByRole('dialog'),`${label} dialog`);
    await shot(`768-${label.toLowerCase()}-dialog`);
    await page.getByRole('dialog').getByRole('button',{name:'Cancel',exact:true}).click();
  }
  return {keyboardFigure,visualInteractionsPreservedJSON:true,compositionUndoRedo:true,statusSaveReload:true,blockDragUndo:true,results};
}
