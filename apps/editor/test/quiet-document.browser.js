// Regression checks on real scratch files; optional captures are for manual visual review.
// pnpm browser:test quiet-document --screenshots writes tmp/visual-refinement/after-*.png.
async (page, { openFolderPicker, screenshots = false, openDocument, openPath, withBlockHover }) => {
  // Manual review only, before the regression edits its disposable fixtures.
  const themeReview = screenshots ? await (async (page, { openPath, screenshots }) => {
  if (!screenshots) throw Error('Use --screenshots for the manual theme review');
  const origin = page.url().split('/').slice(0,3).join('/');
  const loaded = await (await page.request.get(`${origin}/api/document`)).json();
  const sep = loaded.path.includes('\\') ? '\\' : '/';
  const file = [...loaded.path.split(sep).slice(0, -4), 'tmp', 'quiet-document', 'quiet-document.md'].join(sep);
  const open = async path => {
    await page.setViewportSize({width:1440,height:1000});
    await openPath(page, path);
    await page.getByRole('button', {name:'More actions', exact:true}).click();
    await page.getByRole('menuitem', {name:'Close folder', exact:true}).click();
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.querySelectorAll('.document img[src]')].map(img => img.decode()));
    });
  };
  const available = await page.evaluate(() => !!document.documentElement.dataset.theme);
  const captures = [];
  const settings = async () => {
    const button = page.getByRole('button',{name:'Settings',exact:true});
    if (!await button.isVisible()) await page.getByRole('button',{name:'Expand Explorer',exact:true}).click();
    await button.click();
  };
  const closeSettings = async () => {
    await page.keyboard.press('Escape');
    await page.getByTestId('settings-dialog').waitFor({state:'detached'});

  };
  for (const theme of available ? ['light','dark'] : ['before']) {
    for (const accent of ['blue']) {
    for (const background of ['paper','flat']) {
      await open(file);
      await settings();
      if (available) await page.getByTestId('theme').selectOption(theme);
      await page.getByTestId('accent-color').locator(`input[value="${accent}"]`).check();
      await page.getByTestId('page-background').selectOption(background);
      await closeSettings();
      for (const width of [1440,640]) {
        await page.setViewportSize({width,height:1000});
        await page.evaluate(() => { document.querySelector('.document-scroll[data-active="true"]').scrollTo(0,0); document.activeElement?.blur(); });
        await page.mouse.move(0,0);
        const shot = async name => {
          const file = `tmp/page-background-593/${theme}-${background}-${width}-${name}.png`;
          await page.screenshot({path:file}); captures.push(file);
        };
        await shot('document');
        for (const [name, selector] of [['figure','.figure'],['equation','.equation'],['table','.table-block'],['code','.code-block'],['callout','.admonition']]) {
          const block = page.locator(`[data-document-tab][data-active=true] ${selector}`).first();
          if (await block.count()) {
            await block.evaluate(n => n.scrollIntoView({block:'center'}));
            await shot(name);
          }
        }
        await page.evaluate(() => document.querySelector('.document-scroll[data-active="true"]').scrollTo(0,0));
        await settings();
        await shot('settings');
        await closeSettings();
        await page.getByRole('button',{name:'File actions',exact:true}).click();
        await page.getByRole('menu').and(page.locator(':focus-within')).waitFor();
        await page.mouse.move(0,0);
        await shot('menu');
        await page.keyboard.press('Escape');
      }
      const codeFile = [...loaded.path.split(sep).slice(0,-4), 'tmp', 'code-highlighting', 'code.md'].join(sep);
      await open(codeFile);
      await page.locator('[data-document-tab][data-active=true] .hljs-keyword').waitFor();
      for (const width of [1440,640]) {
        await page.setViewportSize({width,height:1000});
        await page.evaluate(() => { document.querySelector('.document-scroll[data-active="true"]').scrollTo(0,0); document.activeElement?.blur(); });
        await page.mouse.move(0,0);
        const path = `tmp/page-background-593/${theme}-${background}-${width}-code.png`;
        await page.screenshot({path}); captures.push(path);
      }
      await page.setViewportSize({width:1440,height:1000});
      await page.getByRole('button',{name:'Close code.md',exact:true}).click();
    }
    }
  }
  return {captures};
}
)(page, {openPath, screenshots}) : null;
  if (screenshots) {
    await page.evaluate(() => {localStorage.clear(); sessionStorage.clear();});
    await page.reload();
    await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
  }
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
    await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
    await openDocument(page, scratch(name));
    await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
    check(await page.getByTestId('current-file').getAttribute('title') === scratch(name), 'Wrong file');
    // Keep the existing visual-review state: a loaded document with no folder displayed.
    await page.getByRole('button', {name:'More actions', exact:true}).click();
    await page.getByRole('menuitem', {name:'Close folder', exact:true}).click();
    await page.evaluate(async () => {
      await document.fonts.ready;
      // ProseMirror's src-less separator img is a caret shim, not a document image.
      await Promise.all([...document.querySelectorAll('[data-document-tab][data-active=true] img[src]')].map(img => img.decode()));
    });
  };
  const rest = async () => {
    await page.evaluate(() => { document.querySelector('.document-scroll[data-active="true"]').scrollTo(0,0); document.activeElement?.blur(); });
    await page.mouse.move(0,0);
    await page.waitForTimeout(150);
  };
  let screenshotCount = 0;
  const shot = async name => {
    if (!screenshots) return;
    await page.screenshot({path:`tmp/visual-refinement/after-${name}.png`});
    screenshotCount++;
  };
  const json = () => page.locator('[data-document-tab][data-active=true] .document-editor').evaluate(n => JSON.stringify(n.editor.getJSON()));
  const bounds = async (locator, label) => {
    await locator.waitFor();
    await page.waitForTimeout(200);
    const result = await locator.evaluate(n => {
      const r=n.getBoundingClientRect();
      const header=document.querySelector('.app-header').getBoundingClientRect().bottom;
      const children=[...n.querySelectorAll('input,select,textarea,button')].map(c=>{
        const a=c.getBoundingClientRect();return {x:a.x,y:a.y,right:a.right,bottom:a.bottom,height:a.height};
      });
      const positioner=n.parentElement;
      const documentScroll=document.querySelector('.document-scroll[data-active="true"]');
      return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height,header,viewport:[innerWidth,innerHeight],children,scrollWidth:n.scrollWidth,clientWidth:n.clientWidth,scrollHeight:n.scrollHeight,clientHeight:n.clientHeight,
        placement:n.dataset.side,positionerStyle:positioner?.getAttribute('style'),
        documentScroll:documentScroll&&{top:documentScroll.scrollTop,height:documentScroll.clientHeight},
        visualViewport:window.visualViewport&&[visualViewport.width,visualViewport.height]};
    });
    check(result.x>=0&&result.right<=result.viewport[0]+1&&result.y>=result.header-1&&result.bottom<=result.viewport[1]+1, `${label} outside viewport: ${JSON.stringify(result)}`);
    check(result.children.length>0, `${label}: required controls missing`);
    if (result.scrollHeight > result.clientHeight && await locator.getAttribute('role') === 'menu') {
      // The added tab row reduces height: a constrained menu must expose its final action by scrolling.
      await locator.evaluate(n => n.scrollTop = n.scrollHeight);
      const last = await locator.locator('button').last().boundingBox();
      check(last && last.y >= result.y && last.y + last.height <= result.bottom + 1, `${label}: last action is unreachable`);
      await locator.evaluate(n => n.scrollTop = 0);
    } else check(result.children.every(c=>c.y>=result.y-1&&c.bottom<=result.bottom+1), `${label}: controls clipped vertically ${JSON.stringify(result)}`);
    check(result.scrollWidth<=result.clientWidth+1&&result.children.every(c=>c.x>=result.x-1&&c.right<=result.right+1), `${label}: controls clipped horizontally`);
    results.push({label,...result});
  };
  // #506: measure actual glyph lines, not just the declared word-break property.
  // Typography isolation includes the docked Outline, now available from 1424px.
  await page.setViewportSize({width:1440,height:1000});
  await open('korean-wrap.md');
  // Code/math keep their contextual rules; document preferences must not reach UI or Source.
  const wrapping = await page.locator('[data-document-tab][data-active=true] .document-editor').evaluate(host => {
    const contexts=['.heading','.paragraph','.list','.quote-body','.admonition-body','.caption','[data-table-cell]','pre','.footnote-definition-body'];
    return [...host.querySelectorAll('code,.katex')].map(n=>{
      const s=getComputedStyle(n);
      return {kind:n.matches('code')?'code':'math',heading:!!n.closest('.heading'),contexts:contexts.filter(selector=>n.closest(selector)),
        wordBreak:s.wordBreak,overflowWrap:s.overflowWrap};
    });
  });
  check(['.heading','.paragraph','.list','.quote-body','.admonition-body','.caption','[data-table-cell]','pre','.footnote-definition-body']
    .every(context=>wrapping.some(n=>n.kind==='code'&&n.contexts.includes(context)))&&
    ['code','math'].every(kind=>[true,false].every(heading=>wrapping.some(n=>n.kind===kind&&n.heading===heading)))&&
    wrapping.every(n=>n.wordBreak===(n.heading?'keep-all':'normal')&&n.overflowWrap==='break-word'),
    `Code/math lost contextual wrapping: ${JSON.stringify(wrapping)}`);
  // Callout content follows body prose even when the document font/size is customized.
  const calloutType = await page.evaluate(() => {
    const root=document.documentElement;
    const type=selector=>{
      const n=document.querySelector(selector);if(!n)throw Error(`Missing callout typography target: ${selector}`);
      const s=getComputedStyle(n);return [s.fontFamily,s.fontSize,s.lineHeight];
    };
    const read=()=>({body:type('.paragraph'),content:type('.admonition-body'),label:type('.admonition-label')});
    const before=read();
    const overrides={'--font-family-document':'monospace','--font-size-document':'23px','--line-height-document':'2'};
    const saved=Object.keys(overrides).map(name=>[name,root.style.getPropertyValue(name),root.style.getPropertyPriority(name)]);
    try {
      for(const [name,value] of Object.entries(overrides))root.style.setProperty(name,value);
      return {before,after:read()};
    } finally {
      for(const [name,value,priority] of saved)value?root.style.setProperty(name,value,priority):root.style.removeProperty(name);
    }
  });
  check([calloutType.before,calloutType.after].every(t=>JSON.stringify(t.body)===JSON.stringify(t.content))&&
    JSON.stringify(calloutType.before.label)===JSON.stringify(calloutType.after.label)&&
    JSON.stringify(calloutType.before.content)!==JSON.stringify(calloutType.after.content),
    `Callout content must follow body typography without changing its label: ${JSON.stringify(calloutType)}`);
  const checkUIIsolation = async selectors => page.evaluate(selectors => {
    const root=document.documentElement;
    const read=()=>selectors.map(selector=>{
      const nodes=[...document.querySelectorAll(selector)];
      if(!nodes.length)throw Error(`Missing typography target: ${selector}`);
      return nodes.map(n=>{const s=getComputedStyle(n);return [s.fontFamily,s.fontSize,s.lineHeight,s.wordBreak,s.overflowWrap];});
    });
    const before=read();
    const probe=document.createElement('span');
    probe.style.fontFamily='var(--font-family-document)';probe.style.fontSize='var(--font-size-document)';
    probe.style.lineHeight='var(--line-height-document)';document.body.append(probe);
    const current=getComputedStyle(probe);
    const overrides={'--font-family-document':current.fontFamily.includes('monospace')?'serif':'monospace',
      '--font-size-document':`calc(${current.fontSize} * 1.25)`,
      '--line-height-document':`calc(${current.lineHeight} * 1.25)`,'--word-break-document':'break-all'};
    probe.remove();
    const saved=Object.keys(overrides).map(name=>[name,root.style.getPropertyValue(name),root.style.getPropertyPriority(name)]);
    try {
      for(const [name,value] of Object.entries(overrides))root.style.setProperty(name,value);
      return {selectors,before,after:read()};
    } finally {
      for(const [name,value,priority] of saved)value?root.style.setProperty(name,value,priority):root.style.removeProperty(name);
    }
  },selectors);
  const uiIsolation=await checkUIIsolation(['[data-testid="save"]','.document-settings-summary','.document-outline-item','.document-outline-number',
    '.code-language','.figure-edit','.table-column-handle']);
  check(JSON.stringify(uiIsolation.before)===JSON.stringify(uiIsolation.after),
    `Document typography leaked into UI: ${JSON.stringify(uiIsolation)}`);
  await page.getByRole('button',{name:'Source',exact:true}).click();
  await page.getByTestId('source-view').waitFor();
  const sourceIsolation=await checkUIIsolation(['.source-view-text','.source-line']);
  check(JSON.stringify(sourceIsolation.before)===JSON.stringify(sourceIsolation.after),
    `Document typography leaked into Source: ${JSON.stringify(sourceIsolation)}`);
  await page.getByRole('button',{name:'Edit',exact:true}).click();
  await page.locator('[data-document-tab][data-active=true] .document-editor').waitFor();
  results.push({wrapping,uiIsolation,sourceIsolation});
  const wrapResults = [];
  const prose = page.locator('[data-document-tab][data-active=true] .document-editor > .paragraph').first();
  const wrapDocument = await json();
  for (const width of [1440,640]) {
    await page.setViewportSize({width,height:1000});
    await rest();
    await page.evaluate(async () => { await document.fonts.ready; });
    await shot(`korean-wrap-${width}`);
    wrapResults.push(await page.locator('[data-document-tab][data-active=true] .document-editor').evaluate((host,width) => {
      const surfaces=['.heading','.paragraph','.list .paragraph','.quote-body','.admonition-body','.caption','[data-table-cell]','.footnote-definition-body'];
      const splitWords=[];
      const coverage=surfaces.map(selector => {
        const nodes=[...host.querySelectorAll(selector)];
        for(const node of nodes) {
          const walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT);
          while(walker.nextNode()) {
            const text=walker.currentNode;
            if(text.parentElement.closest('code,.katex'))continue;
            for(const match of text.textContent.matchAll(/[가-힣]+/g)) {
              const range=document.createRange();
              range.setStart(text,match.index); range.setEnd(text,match.index+match[0].length);
              const rects=[...range.getClientRects()].filter(r=>r.width>0);
              const lines=new Set(rects.map(r=>Math.round(r.top))),style=getComputedStyle(node);
              const available=node.getBoundingClientRect().width-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight);
              // A word wider than an empty line must use the emergency fallback.
              if(lines.size>1&&rects.reduce((sum,r)=>sum+r.width,0)<=available+1)splitWords.push({selector,word:match[0]});
            }
          }
        }
        return {selector,count:nodes.length};
      });
      const paragraph=host.querySelector(':scope > .paragraph'), text=paragraph.firstChild;
      const lines=[];
      for(let i=0;i<text.length;i++) {
        if(/\s/.test(text.textContent[i]))continue;
        const range=document.createRange();range.setStart(text,i);range.setEnd(text,i+1);
        const rect=range.getBoundingClientRect(), y=Math.round(rect.top);
        let line=lines.find(line=>line.y===y);
        if(!line)lines.push(line={y,start:i,end:i});
        line.end=i;
      }
      const brokenEdges=lines.filter(line=>(line.start>0&&!/\s/.test(text.textContent[line.start-1])) ||
        (line.end+1<text.length&&!/\s/.test(text.textContent[line.end+1])));
      const strandedPunctuation=lines.filter(line=>/^[」』）)、。，．！？]/.test(text.textContent.slice(line.start)));
      const urls=[...host.querySelectorAll(':scope > .paragraph,[data-table-cell]')]
        .filter(n=>n.textContent.startsWith('https://')).map(n=>{
          const range=document.createRange();range.selectNodeContents(n);
          const box=n.getBoundingClientRect();
          return {cell:n.matches('[data-table-cell]'),inside:[...range.getClientRects()].every(r=>r.left>=box.left-1&&r.right<=box.right+1),
            scrollWidth:n.scrollWidth,clientWidth:n.clientWidth};
        });
      const compounds=[...host.querySelectorAll(':scope > .paragraph,[data-table-cell]')]
        .filter(n=>n.textContent.startsWith('전력변환시스템출력전압제어기전류측정결과분석')).map(n=>{
          const range=document.createRange();range.selectNodeContents(n);
          const rects=[...range.getClientRects()].filter(r=>r.width>0),box=n.getBoundingClientRect();
          return {cell:n.matches('[data-table-cell]'),wraps:new Set(rects.map(r=>Math.round(r.top))).size>1,
            inside:rects.every(r=>r.left>=box.left-1&&r.right<=box.right+1),scrollWidth:n.scrollWidth,clientWidth:n.clientWidth};
        });
      const mixed=[...host.querySelectorAll(':scope > .paragraph')].find(n=>n.textContent.startsWith('정격출력은'));
      if(!mixed)throw Error('Missing mixed Korean/numeric sentence');
      const mixedTokens=['11 kW','(1)','(2)'].map(token=>{
        const start=mixed.firstChild.textContent.indexOf(token);if(start<0)throw Error(`Missing mixed token: ${token}`);
        const range=document.createRange();range.setStart(mixed.firstChild,start);range.setEnd(mixed.firstChild,start+token.length);
        return {token,lines:new Set([...range.getClientRects()].filter(r=>r.width>0).map(r=>Math.round(r.top))).size};
      });
      return {width,coverage,splitWords,lines,brokenEdges,strandedPunctuation,urls,compounds,mixedTokens,
        pageOverflow:document.documentElement.scrollWidth>innerWidth,
        paperOverflow:host.scrollWidth>host.clientWidth+1,
        environment:{userAgent:navigator.userAgent,dpr:devicePixelRatio,zoom:visualViewport.scale,font:getComputedStyle(paragraph).fontFamily}};
    },width));
  }
  // Glyph geometry checks behavior without freezing a particular font size or line count.
  check(wrapResults.every(r=>r.coverage.every(c=>c.count>0)&&r.lines.length>1), 'Missing Korean wrapping coverage');
  check(wrapResults.every(r=>!r.splitWords.length&&!r.brokenEdges.length&&!r.strandedPunctuation.length),
    `Korean words split across lines: ${JSON.stringify(wrapResults)}`);
  check(wrapResults.every(r=>r.urls.some(u=>u.cell)&&r.urls.some(u=>!u.cell)&&
    r.urls.every(u=>u.inside&&u.scrollWidth<=u.clientWidth+1)&&!r.pageOverflow&&!r.paperOverflow),
    `Long URL overflow: ${JSON.stringify(wrapResults)}`);
  check(wrapResults.every(r=>r.compounds.some(c=>c.cell)&&r.compounds.some(c=>!c.cell&&c.wraps)&&
    r.compounds.every(c=>c.inside&&c.scrollWidth<=c.clientWidth+1)),`Korean compound overflow: ${JSON.stringify(wrapResults)}`);
  check(wrapResults.every(r=>r.mixedTokens.every(t=>t.lines===1)),`Mixed sentence split a unit or parenthesis: ${JSON.stringify(wrapResults)}`);
  // Tables normally size to their content and scroll locally. Also exercise a constrained
  // real cell, so an intrinsically wide cell cannot make the token fallback assertions vacuous.
  const constrainedTokens=await page.locator('[data-document-tab][data-active=true] [data-table-cell]').evaluateAll(cells=>{
    const tokens=cells.filter(cell=>/^(https:\/\/|전력변환시스템출력전압제어기전류측정결과분석)/.test(cell.textContent));
    const saved=tokens.map(cell=>cell.style.maxWidth);
    try {
      for(const cell of tokens)cell.style.maxWidth='180px';
      return tokens.map(cell=>{
        const range=document.createRange();range.selectNodeContents(cell);
        const rects=[...range.getClientRects()].filter(r=>r.width>0),box=cell.getBoundingClientRect();
        return {kind:cell.textContent.startsWith('https://')?'URL':'Korean compound',wraps:new Set(rects.map(r=>Math.round(r.top))).size>1,
          inside:rects.every(r=>r.left>=box.left-1&&r.right<=box.right+1),width:box.width,scrollWidth:cell.scrollWidth,clientWidth:cell.clientWidth};
      });
    } finally { tokens.forEach((cell,i)=>cell.style.maxWidth=saved[i]); }
  });
  check(constrainedTokens.some(t=>t.kind==='URL')&&constrainedTokens.some(t=>t.kind==='Korean compound')&&
    constrainedTokens.every(t=>t.wraps&&t.inside&&t.scrollWidth<=t.clientWidth+1),`Constrained table token overflow: ${JSON.stringify(constrainedTokens)}`);
  // Click at a real wrapped-line start and select across its preceding line break.
  await prose.scrollIntoViewIfNeeded();
  const caret=await prose.evaluate(n=>{
    const text=n.firstChild,range=document.createRange();let previousY;
    for(let i=0;i<text.length;i++) {
      if(/\s/.test(text.textContent[i]))continue;
      range.setStart(text,i);range.setEnd(text,i+1);const r=range.getBoundingClientRect();
      if(previousY!==undefined&&r.top>previousY+1)return {x:r.left+r.width/4,y:r.top+r.height/2,pos:n.closest('.document-editor').editor.view.posAtDOM(text,i),offset:i};
      previousY=r.top;
    }
    throw Error('Paragraph did not wrap');
  });
  const nativeSelection=()=>prose.evaluate(async n=>{
    const selection=window.getSelection(), editor=n.closest('.document-editor').editor;
    // Capture the native result immediately; only the engine's selectionchange observer is async.
    const {anchorNode,anchorOffset,focusNode,focusOffset}=selection;
    const anchor=editor.view.posAtDOM(anchorNode,anchorOffset),focus=editor.view.posAtDOM(focusNode,focusOffset);
    const from=Math.min(anchor,focus),to=Math.max(anchor,focus),text=selection.toString();
    const lines=new Set([...selection.getRangeAt(0).getClientRects()].filter(r=>r.width>0).map(r=>Math.round(r.top))).size;
    if(editor.state.selection.from!==from||editor.state.selection.to!==to)await new Promise((resolve,reject)=>{
      const updated=()=>{clearTimeout(timeout);editor.off('selectionUpdate',updated);resolve();};
      const timeout=setTimeout(()=>{editor.off('selectionUpdate',updated);reject(Error('Native selectionUpdate missing'));},1000);
      editor.on('selectionUpdate',updated);
    });
    return {from,to,anchorOffset,anchorInText:anchorNode===n.firstChild,lines,
      engineMatches:editor.state.selection.from===from&&editor.state.selection.to===to&&editor.state.doc.textBetween(from,to)===text&&
        selection.anchorNode===anchorNode&&selection.anchorOffset===anchorOffset&&selection.focusNode===focusNode&&selection.focusOffset===focusOffset};
  });
  await page.mouse.click(caret.x,caret.y);
  const clicked=await nativeSelection();
  check(clicked.anchorInText&&clicked.anchorOffset===caret.offset&&clicked.from===caret.pos&&clicked.to===caret.pos&&clicked.engineMatches,
    `Wrapped-line click placed the caret incorrectly: ${JSON.stringify(clicked)}`);
  await page.keyboard.press('ArrowRight');
  check((await nativeSelection()).engineMatches,'ArrowRight native/engine selection mismatch');
  await page.keyboard.press('Shift+ArrowUp');
  const selected=await nativeSelection();
  check(selected.from<caret.pos&&selected.to>caret.pos&&selected.lines>1&&selected.engineMatches,
    `Selection across a wrapped line changed text or positions: ${JSON.stringify(selected)}`);
  // Chromium's native composition protocol at the preceding line end. OS IME UI is manual.
  await prose.evaluate((n,pos)=>{
    const editor=n.closest('.document-editor').editor;
    editor.commands.setTextSelection(pos-1);editor.view.focus();
  },caret.pos);
  const beforeComposition=await prose.textContent();
  const wrapCDP=await page.context().newCDPSession(page);
  try {
    await wrapCDP.send('Input.imeSetComposition',{text:'한글',selectionStart:2,selectionEnd:2});
    await wrapCDP.send('Input.imeSetComposition',{text:'한글입력',selectionStart:4,selectionEnd:4});
    await wrapCDP.send('Input.insertText',{text:'한글입력'});
  } finally { await wrapCDP.detach(); }
  check(await prose.textContent()===beforeComposition.slice(0,caret.offset-1)+'한글입력'+beforeComposition.slice(caret.offset-1),
    'Composition at a wrapped line end lost or reordered text');
  await page.keyboard.press('Control+z');
  check(await json()===wrapDocument,'Wrapped-line composition undo did not restore the document');
  results.push({koreanWrapping:wrapResults,constrainedTokens,wrappedCaretSelection:true,wrappedCompositionUndo:true});
  await page.setViewportSize({width:1280,height:720});
  await open('quiet-document.md');
  // A CSS family list also passes when a system fallback is used. Inspect the actual
  // glyph fonts so a missing font import/asset cannot silently pass on developer PCs.
  const fontSession = await page.context().newCDPSession(page);
  try {
    await fontSession.send('DOM.enable');
    await fontSession.send('CSS.enable');
    const {root} = await fontSession.send('DOM.getDocument');
    for (const selector of ['[data-document-tab][data-active=true] .document-editor h1', '[data-document-tab][data-active=true] .document-editor .paragraph', '[data-testid="save"]']) {
      const {nodeId} = await fontSession.send('DOM.querySelector', {nodeId:root.nodeId, selector});
      const {fonts} = await fontSession.send('CSS.getPlatformFontsForNode', {nodeId});
      // A chosen document family may differ from the bundled UI font. When it uses
      // Pretendard, still require real custom glyphs rather than a system fallback.
      const bundled=await page.locator(selector).first().evaluate(n=>getComputedStyle(n).fontFamily.includes('Pretendard'));
      check(fonts.length > 0 && (!bundled || fonts.every(font => font.isCustomFont && font.familyName.includes('Pretendard'))),
        `${selector}: bundled Pretendard glyphs required: ${JSON.stringify(fonts)}`);
      results.push({selector, fonts});
    }
  } finally {
    await fontSession.detach();
  }
  // Inline math takes --math-inline-size of its text instead of KaTeX's own 1.21em.
  const inlineMath=await page.locator('[data-document-tab][data-active=true] .document-editor .inline-math-rendered .katex').first().evaluate(n=>{
    const token=getComputedStyle(document.documentElement).getPropertyValue('--math-inline-size').trim();
    if(!token.endsWith('em'))throw Error(`Unexpected --math-inline-size: ${token}`);
    return {token,actual:parseFloat(getComputedStyle(n).fontSize),expected:parseFloat(token)*parseFloat(getComputedStyle(n.parentElement).fontSize)};
  });
  check(Math.abs(inlineMath.actual-inlineMath.expected)<0.1,`Inline math size must follow its token: ${JSON.stringify(inlineMath)}`);
  const initial=await json();
  const extent = page.getByTestId('block-hover-outline');
  const selectBlock = block => block.evaluate(n => {
    const editor = n.closest('.document-editor').editor;
    editor.state.doc.forEach((_node, pos) => {
      const dom = editor.view.nodeDOM(pos);
      if (dom === n || dom?.contains(n)) editor.commands.setNodeSelection(pos);
    });
  });
  const outlineGeometry = async block => {
    const selected = await block.evaluate(n => {
      const r = n.getBoundingClientRect(), s = getComputedStyle(n), overlay = getComputedStyle(n, '::after');
      // Measure the painted outer edge, including the native outline on the base.
      const expansion = parseFloat(s.outlineOffset) + parseFloat(s.outlineWidth);
      return overlay.content !== 'none' ? {
        x:r.x + parseFloat(overlay.left), y:r.y + parseFloat(overlay.top),
        width:parseFloat(overlay.width), height:parseFloat(overlay.height),
        radius:parseFloat(overlay.borderTopLeftRadius), shadow:overlay.boxShadow,
      } : {x:r.x-expansion,y:r.y-expansion,width:r.width+2*expansion,height:r.height+2*expansion,
        radius:parseFloat(s.borderTopLeftRadius)+expansion,stroke:parseFloat(s.outlineWidth)};
    });
    const hover = await extent.evaluate(n => {
      const r=n.getBoundingClientRect(),s=getComputedStyle(n);
      return {x:r.x,y:r.y,width:r.width,height:r.height,radius:parseFloat(s.borderTopLeftRadius),shadow:s.boxShadow};
    });
    const sameStroke = selected.shadow && selected.shadow.replace(/rgba?\([^)]+\)/, '') === hover.shadow.replace(/rgba?\([^)]+\)/, '');
    const delta = Object.fromEntries(['x','y','width','height','radius'].map(k => [k, selected[k]-hover[k]]));
    return {selected,hover,delta,sameStroke,matches:sameStroke && Object.values(delta).every(d => Math.abs(d)<0.1)};
  };
  const hoverStyle = await withBlockHover(page, async () => {
    await rest();
    // Keyboard selection alone reveals no extent; pointer and selection are independent axes.
    await page.locator('[data-document-tab][data-active=true] .document-editor').focus();
    await page.keyboard.press('ArrowDown');
    check(!await extent.isVisible(), 'Keyboard selection showed a hovered extent');
    const hoverParagraph = page.locator('[data-document-tab][data-active=true] .paragraph').first();
    const textGeometry = () => hoverParagraph.evaluate(n => {
      const range = document.createRange(); range.selectNodeContents(n);
      return [...range.getClientRects()].map(r => [r.x, r.y, r.width, r.height]);
    });
    const textBeforeHover = await textGeometry();
    await hoverParagraph.hover();
    await extent.waitFor();
    check(JSON.stringify(await textGeometry()) === JSON.stringify(textBeforeHover), 'Hover moved text (expected 0px)');
    const hoverStyle = await extent.evaluate(n => {
      const probe = document.createElement('span');
      probe.style.boxShadow = 'inset 0 0 0 var(--size-block-hover-outline) var(--id-color-block-hover-outline)';
      probe.style.borderRadius = 'var(--id-radius-block-hover)';
      probe.style.color = 'var(--id-color-block-hover-outline)';
      probe.style.padding = 'var(--space-block-hover-block) var(--space-block-hover-inline)';
      document.body.append(probe);
      const expected = getComputedStyle(probe), actual = getComputedStyle(n);
      const result = {shadow:actual.boxShadow, radius:actual.borderRadius, pointer:actual.pointerEvents,
        expectedShadow:expected.boxShadow, expectedRadius:expected.borderRadius, neutral:expected.color,
        inlineGap:parseFloat(expected.paddingLeft), blockGap:parseFloat(expected.paddingTop)};
      probe.style.color = 'var(--id-color-interaction)';
      result.interaction = getComputedStyle(probe).color;
      probe.remove(); return result;
    });
    check(hoverStyle.shadow === hoverStyle.expectedShadow && hoverStyle.radius === hoverStyle.expectedRadius &&
      hoverStyle.pointer === 'none' && hoverStyle.neutral !== hoverStyle.interaction &&
      hoverStyle.inlineGap > 0 && hoverStyle.blockGap > 0, `Hover roles/overlay: ${JSON.stringify(hoverStyle)}`);
    const pointerExtent = await extent.boundingBox();
    await page.locator('[data-document-tab][data-active=true] .document-editor').evaluate(n => n.editor.commands.setNodeSelection(0));
    check(await extent.isVisible() && JSON.stringify(await extent.boundingBox()) === JSON.stringify(pointerExtent) &&
      JSON.stringify(await textGeometry()) === JSON.stringify(textBeforeHover),
      'Selection replaced the pointer extent or moved text');
    // Nested cell content still outlines the whole top-level table, like the gutter handle.
    for (const [target, block] of [[hoverParagraph, hoverParagraph], [page.locator('[data-document-tab][data-active=true] .equation'), page.locator('[data-document-tab][data-active=true] .equation')],
      [page.locator('[data-document-tab][data-active=true]').getByTestId('figure-image'), page.locator('[data-document-tab][data-active=true] .figure')],
      [page.locator('[data-document-tab][data-active=true] .table [data-table-cell]').first(), page.locator('[data-document-tab][data-active=true] .table-block')]]) {
      await target.hover(); await extent.waitFor();
      const actual = await extent.boundingBox(), content = await block.boundingBox();
      const expected = {x:content.x - hoverStyle.inlineGap, y:content.y - hoverStyle.blockGap,
        width:content.width + 2 * hoverStyle.inlineGap, height:content.height + 2 * hoverStyle.blockGap};
      check(['x','y','width','height'].every(k => Math.abs(actual[k] - expected[k]) < 0.1),
        `Hover did not outline the top-level block: ${JSON.stringify({actual,expected})}`);
    }
    await hoverParagraph.hover();
    const paragraphBox = await hoverParagraph.boundingBox();
    const rowExtent = await extent.boundingBox();
    const controls = page.locator('.block-controls').filter({has:page.getByRole('button', {name:/^Move paragraph block \d+$/})}).first();
    for (const control of [controls.locator('.block-insert'), controls.locator('.block-handle')]) {
      await control.hover();
      check(await extent.isVisible() && JSON.stringify(await extent.boundingBox()) === JSON.stringify(rowExtent),
        'Gutter hover lost or changed the block extent');
      const controlBox = await control.boundingBox();
      check(controlBox.x + controlBox.width < rowExtent.x && await control.evaluate(n => {
        const r = n.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return hit === n || n.contains(hit);
      }), 'Expanded extent covers a gutter control');
    }
    check(JSON.stringify(await textGeometry()) === JSON.stringify(textBeforeHover), 'Gutter hover moved text (expected 0px)');
    const adjacentGaps = await hoverParagraph.evaluate(n => {
      const r = n.getBoundingClientRect();
      return [r.top - n.previousElementSibling.getBoundingClientRect().bottom,
        n.nextElementSibling.getBoundingClientRect().top - r.bottom];
    });
    check(adjacentGaps.every(gap => gap > 2 * hoverStyle.blockGap), 'Expanded extents overlap neighboring blocks');
    // The whole row inside the paper stays active, but gaps and coordinates outside the host do not.
    await page.mouse.move(paragraphBox.x + paragraphBox.width + hoverStyle.inlineGap, paragraphBox.y + 4);
    check(await extent.isVisible(), 'Trailing row hover lost the extent');
    for (const [x,y] of [[paragraphBox.x + 4, paragraphBox.y + paragraphBox.height + 2], [0,0]]) {
      await hoverParagraph.hover(); await extent.waitFor(); await page.mouse.move(x,y);
      await extent.waitFor({state:'hidden'});
    }
    const radii = [];
    const originalViewport = page.viewportSize();
    for (const width of [1440,640]) {
      await page.setViewportSize({width,height:1000});
      for (const kind of ['figure','equation','table-block']) {
        const block = page.locator(`[data-document-tab][data-active=true] .${kind}`);
        await selectBlock(block);
        check(await block.getAttribute('data-selected') === 'true', `${kind}: selection missing`);
        await block.hover(); await extent.waitFor();
        radii.push({width,kind,...await outlineGeometry(block)});
        if (screenshots && kind !== 'table-block') {
          const r = await extent.boundingBox();
          await page.screenshot({path:`tmp/visual-refinement/overlap-${width}-${kind}.png`,
            clip:{x:r.x-2,y:r.y-2,width:Math.min(r.width+4,180),height:Math.min(r.height+4,100)}});
        }
      }
    }
    console.log('Block outline geometry: '+JSON.stringify(radii));
    check(radii.every(r => r.matches), 'Selection/hover outer edges differ: '+JSON.stringify(radii));
    await page.setViewportSize(originalViewport);
    // A real exit and return to the exact same point restores hover; leaving alone does not.
    const returnBlock = page.locator('[data-document-tab][data-active=true] .equation');
    await returnBlock.hover();
    const returnPoint = await returnBlock.boundingBox();
    const point = {x:returnPoint.x+returnPoint.width/2,y:returnPoint.y+returnPoint.height/2};
    await page.mouse.move(point.x,point.y);
    await page.mouse.move(0,0);
    check(!await extent.isVisible(), 'Pointer outside the document retained hover');
    await page.mouse.move(point.x,point.y);
    check(await extent.isVisible(), 'Returning to the same point after real movement lost hover');
    // Type with the pointer still on a different block. Do not poll for the disappearance.
    await hoverParagraph.click();
    await page.keyboard.press('End');
    const equation = page.locator('[data-document-tab][data-active=true] .equation');
    await equation.hover(); await extent.waitFor();
    const beforeTyping = await hoverParagraph.boundingBox();
    const viewport = page.viewportSize();
    await page.keyboard.type('x');
    const hiddenAfterTyping = !await extent.isVisible();
    check(await equation.locator('.block-metadata').evaluate(n => getComputedStyle(n).visibility === 'visible') &&
      await equation.locator('.equation-edit').evaluate(n => getComputedStyle(n).opacity === '1'),
      'Typing changed the independent metadata/Edit hover rules');
    check(JSON.stringify(await hoverParagraph.boundingBox()) === JSON.stringify(beforeTyping),
      'Hiding the hover outline while typing moved content');
    // Scrolling moves blocks under a stationary pointer; it is not pointer movement.
    await page.mouse.wheel(0,60);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await equation.dispatchEvent('mouseover');
    const hiddenAfterScroll = !await extent.isVisible();
    check(hiddenAfterScroll, 'Scroll/mouseover restored the typing-suppressed outline');
    // A transaction and resize without pointer input must not bring the outline back.
    await page.keyboard.press('ArrowLeft');
    await page.setViewportSize({...viewport,height:viewport.height + 1});
    const hiddenAfterLayout = !await extent.isVisible();
    await page.setViewportSize(viewport);
    const box = await equation.boundingBox();
    await page.mouse.move(box.x + box.width / 2 + 1, box.y + box.height / 2);
    check(await extent.isVisible(), 'Real pointer movement did not restore the hover outline');
    await page.keyboard.press('Control+z');
    check(await json() === initial, 'Typing probe did not undo to the original document');
    const keyboardChanges = [];
    for (const key of ['Enter','Shift+Enter']) {
      await hoverParagraph.click(); await page.keyboard.press('End');
      await equation.hover(); await extent.waitFor();
      // Pure navigation is not input; it may leave the existing hover outline visible.
      await page.keyboard.press('ArrowLeft');
      check(await extent.isVisible(), 'Navigation unexpectedly hid the hover outline');
      await page.keyboard.press(key);
      const changed = await json() !== initial;
      const hidden = !await extent.isVisible();
      keyboardChanges.push({key,changed,hidden});
      await page.keyboard.press('Control+z');
      check(await json() === initial, `${key}: undo did not restore the document`);
    }
    results.push({typingHover:{hiddenAfterTyping,hiddenAfterLayout,hiddenAfterScroll},keyboardChanges,radii});
    check(hiddenAfterTyping && hiddenAfterLayout && keyboardChanges.every(k => k.changed && k.hidden) && radii.every(r => r.matches),
      `Typing/outline regression: ${JSON.stringify({hiddenAfterTyping,hiddenAfterLayout,keyboardChanges,radii})}`);
    results.push({hoverStyle, hoverTextShift:0, gutterHoverRetainsExtent:true, adjacentGaps,
      pointerIndependentOfSelection:true, topLevelCellExtent:true});
    return hoverStyle;
  });
  // Isolate input-device emulation from this page's later resize/selection checks.
  // The probe still uses the actual Editor and unmodified product media rules.
  const mainMedia = await page.evaluate(() => matchMedia('(hover: none)').matches);
  const mainState = () => page.locator('[data-document-tab][data-active=true] .document-editor').evaluate(n => JSON.stringify({
    document:n.editor.getJSON(), selection:n.editor.state.selection.toJSON(),
    status:document.querySelector('[data-testid="status"]').textContent,
  }));
  const beforeProbe = await mainState();
  const noHoverPage = await page.context().newPage();
  try {
    await noHoverPage.goto(page.url());
    await noHoverPage.locator('[data-operation="ready"]').waitFor({state:'attached'});
    await openDocument(noHoverPage, scratch('quiet-document.md'));
    await noHoverPage.waitForFunction(path => document.querySelector('[data-testid="current-file"]')?.getAttribute('title') === path, scratch('quiet-document.md'));
    if (!await noHoverPage.evaluate(() => matchMedia('(hover: none)').matches)) {
      const touchSession = await page.context().newCDPSession(noHoverPage);
      await touchSession.send('Emulation.setTouchEmulationEnabled', {enabled:true});
    }
    check(await noHoverPage.evaluate(() => matchMedia('(hover: none)').matches), 'Probe must have actual no-hover media');
    check(await page.evaluate(() => matchMedia('(hover: none)').matches) === mainMedia,
      'Touch emulation leaked into the main page media');
    await noHoverPage.locator('[data-document-tab][data-active=true] .paragraph').first().hover();
    const hiddenExtent = noHoverPage.getByTestId('block-hover-outline');
    await hiddenExtent.waitFor({state:'attached'});
    check(!await hiddenExtent.isVisible() && await hiddenExtent.evaluate(n => getComputedStyle(n).display === 'none'),
      'Actual no-hover media must suppress the existing extent');
  } finally {
    // Touch emulation belongs to this page; closing it also closes its CDP sessions.
    await noHoverPage.close();
  }
  check(await page.evaluate(() => matchMedia('(hover: none)').matches) === mainMedia,
    'No-hover probe changed the main page media');
  check(await mainState() === beforeProbe, 'No-hover probe changed the main document, selection or status');
  await page.locator('[data-document-tab][data-active=true] .document-editor').evaluate(n => n.editor.commands.setTextSelection(1));
  await rest();
  results.push({noHoverHidden:true, mainPagePreserved:true});
  const metadata=page.locator('[data-document-tab][data-active=true] .block-metadata');
  const metadataState=await metadata.evaluateAll(nodes=>nodes.map(n=>({visibility:getComputedStyle(n).visibility,pointer:getComputedStyle(n).pointerEvents,controlsHidden:[...n.querySelectorAll('button,a,input')].every(c=>getComputedStyle(c).visibility==='hidden')})));
  check(metadataState.length===await page.locator('[data-document-tab][data-active=true] :is([data-block="figure"], [data-block="equation"], [data-block="table"])').count()&&metadataState.every(m=>m.visibility==='hidden'&&m.pointer==='none'&&m.controlsHidden),'Rest metadata and its label entry must be hidden and inert');
  check(await page.getByTestId('current-file').textContent()==='quiet-document.md','Filename must be the visible identity');
  check(await page.getByTestId('status').textContent()==='','Loaded document should have quiet idle status');
  for(const kind of ['figure','equation','table-block']) {
    const block=page.locator(`[data-document-tab][data-active=true] .${kind}`),meta=block.locator('.block-metadata');
    const before=await block.boundingBox();
    await block.hover();
    check(await meta.evaluate(n=>getComputedStyle(n).visibility==='visible'),`${kind}: hover metadata missing`);
    await rest();
    check((await block.boundingBox()).y===before.y,`${kind}: metadata shifted content`);
  }
  // These states only produce review images; layout-rules asserts responsive boundaries.
  if (screenshots) {
    await page.setViewportSize({width:1440,height:1000});
    for (const kind of ['figure','equation']) {
      await rest();
      const block = page.locator(`[data-document-tab][data-active=true] .${kind}`);
      await selectBlock(block);
      check(await block.getAttribute('data-selected') === 'true', `${kind}: visual-review selection missing`);
      await withBlockHover(page, async () => {
        await block.hover(); await extent.waitFor();
        await shot(`1440-${kind}-selected-hover`);
      });
    }
    for(const width of [1440,1424,1423,1280,1279,1024,768,705,704,640]) {
      await page.setViewportSize({width,height:1000});
      await rest();
      await shot(`${width}-rest`);
      await withBlockHover(page, async () => {
        await page.locator('[data-document-tab][data-active=true] .paragraph').first().hover();
        await shot(`${width}-paragraph-hover`);
      });
      // Capture both explicit Sidebar states.
      if(await page.getByRole('button',{name:'Expand Explorer',exact:true}).count()) {
        await page.getByRole('button',{name:'Expand Explorer',exact:true}).click();
        await rest();
        await shot(`${width}-sidebar-expanded`);
      } else {
        await page.getByRole('button',{name:'Collapse Explorer',exact:true}).click();
        await rest();
        await shot(`${width}-collapsed`);
        await page.getByRole('button',{name:'Expand Explorer',exact:true}).click();
      }
      await page.getByRole('button',{name:'Document settings',exact:true}).click();
      await rest();
      await shot(`${width}-display`);
      // Capture preparation blurs focus; direct Escape back to the inline disclosure.
      await page.getByRole('button',{name:'Document settings',exact:true}).focus();
      await page.keyboard.press('Escape');
      await page.getByRole('region', {name:'Document settings',exact:true}).locator('.display-settings').waitFor({state:'hidden'});

    }
  }
  for(const width of [1440,1024,768]) {
    await page.setViewportSize({width,height:1000});
    await rest();
    await page.locator('[data-document-tab][data-active=true]').getByTestId('figure-image').click();
    check(await page.getByTestId('figure-properties').count()===0,'Selection opened properties');
    check(await page.locator('[data-document-tab][data-active=true] .figure .block-metadata').evaluate(n=>getComputedStyle(n).visibility==='visible'),'Selected metadata missing');
    await withBlockHover(page, async () => {
      await page.locator('[data-document-tab][data-active=true] .figure').hover(); await extent.waitFor();
      check(await page.locator('[data-document-tab][data-active=true] .figure').evaluate((n, color) => getComputedStyle(n, '::after').boxShadow.includes(color), hoverStyle.interaction) &&
        await extent.evaluate((n, shadow) => getComputedStyle(n).boxShadow === shadow, hoverStyle.expectedShadow),
        'Selected Figure must keep its accent stroke over the neutral hover stroke');
    });
    if (screenshots) {
      await rest();
      await shot(`${width}-figure-selected`);
    }
    await page.getByRole('button',{name:'Edit figure'}).click();
    await page.waitForFunction(()=>document.activeElement?.getAttribute('data-testid')==='figure-replace');
    await bounds(page.getByTestId('figure-properties'), `Figure ${width}`);
    await page.getByTestId('figure-alt').focus();
    const colors=await page.evaluate(()=>{
      const root=getComputedStyle(document.documentElement),input=document.querySelector('[data-testid="figure-alt"]');
      const interaction=root.getPropertyValue('--id-color-interaction').trim();
      const probe=document.createElement('span');probe.style.color=interaction;document.body.append(probe);const color=getComputedStyle(probe).color;probe.remove();
      return {color,outline:getComputedStyle(document.querySelector('[data-document-tab][data-active=true] .figure'), '::after').boxShadow,border:getComputedStyle(input).borderColor,ring:getComputedStyle(input).boxShadow};
    });
    check(colors.outline.includes(colors.color)&&colors.border===colors.color&&colors.ring.includes(colors.color),`Interaction role not applied: ${JSON.stringify(colors)}`);
    await withBlockHover(page, async () => {
      await page.locator('[data-document-tab][data-active=true] .figure').hover(); await extent.waitFor();
      check(await page.locator('[data-document-tab][data-active=true] .figure').evaluate((n, color) => getComputedStyle(n, '::after').boxShadow.includes(color), colors.color),
        'Hover obscured the editing Figure outline');
      check((await outlineGeometry(page.locator('[data-document-tab][data-active=true] .figure'))).matches,
        'Editing Figure and hover outline geometry differs');
    });
    await page.mouse.move(0,0);
    await shot(`${width}-figure-editing`);
    // The selected outline is an interaction state, not draft ownership.
    await page.getByTestId('figure-alt').fill('수정 중인 caption');
    check(await page.getByTestId('status').textContent()==='Unsaved changes','Dirty Figure draft has misleading status');
    await page.locator('[data-document-tab][data-active=true] .document-editor').press('ArrowDown');
    check(await page.getByTestId('figure-alt').inputValue()==='수정 중인 caption','Selection movement lost the Figure draft');
    check(await page.locator('[data-document-tab][data-active=true] .figure[data-selected="false"][data-editing="true"]').count()===1,'Independent selected/editing axes missing');
    await page.getByTestId('figure-alt').press('Escape');
    await page.getByTestId('figure-editor').waitFor({state:'detached'});
    await page.locator('[data-document-tab][data-active=true] .paragraph').first().click();
    // Equation Apply/Cancel is exercised by the dedicated Equation regressions.
    if (screenshots) {
      await page.locator('[data-document-tab][data-active=true] .equation').hover();
      await page.locator('[data-document-tab][data-active=true] .equation').getByRole('button',{name:'Edit',exact:true}).click();
      await page.getByTestId('equation-edit-source').click();
      await page.getByTestId('equation-editor').waitFor();
      await page.evaluate(()=>document.querySelector('.document-scroll[data-active="true"]').scrollTo(0,0));
      await page.mouse.move(0,0);
      await shot(`${width}-equation-editing`);
      await page.getByTestId('equation-cancel').click();
    }
  }
  check(await json()===initial,'Visual interactions or canceled drafts changed document JSON');
  check(await page.getByTestId('status').textContent()==='','Canceled drafts left a false dirty status');

  // Cancel switches Save from the accent action back to its clean state. Measure the
  // static face after the existing color transition, not an interpolated frame.
  await page.getByTestId('save').evaluate(async n => {
    await Promise.all(n.getAnimations().map(animation => animation.finished));
  });
  const contrast=await page.evaluate(()=>{
    const canvas=document.createElement('canvas');canvas.width=canvas.height=1;
    const context=canvas.getContext('2d');
    const rgba=color=>{context.clearRect(0,0,1,1);context.fillStyle=color;context.fillRect(0,0,1,1);return [...context.getImageData(0,0,1,1).data];};
    const luminance=rgb=>rgb.slice(0,3).map(v=>{v/=255;return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[0.2126,0.7152,0.0722][i],0);
    return ['.document-path-name','.product','.caption','.admonition-label','.admonition-body','.cross-reference-chip','.block-kind','[data-testid="save"]'].map(selector=>{
      const n=document.querySelector('[data-document-tab][data-active=true] '+selector) ?? document.querySelector(selector);if(!n)throw Error(`Missing contrast target ${selector}`);
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
  check(await page.locator('[data-document-tab][data-active=true] .figure .block-metadata').evaluate(n=>getComputedStyle(n).visibility==='visible'),'Keyboard focus metadata missing');
  await page.keyboard.press('Enter');
  await page.waitForFunction(()=>document.activeElement?.getAttribute('data-testid')==='figure-replace');
  await page.getByTestId('figure-alt').press('Escape');
    await page.getByTestId('figure-editor').waitFor({state:'detached'});

  // Gutter menu takes focus; Escape restores the opening control.
  await page.locator('[data-document-tab][data-active=true] .heading').first().hover();
  const insert=page.getByRole('button',{name:'Insert block after heading block 1',exact:true});
  await insert.click();
  await page.getByRole('menu',{name:'Insert block'}).waitFor();
  await page.waitForFunction(()=>document.activeElement?.getAttribute('role')==='menuitem');
  await page.keyboard.press('Escape');
  check(await insert.evaluate(n=>n===document.activeElement),'Gutter menu did not return keyboard focus');

  // Native Chromium composition input, then undo/redo. OS candidate-window behavior is a manual check.
  const paragraph=page.locator('[data-document-tab][data-active=true] .paragraph').first();
  await paragraph.click();
  await page.keyboard.press('End');
  const originalText=await paragraph.textContent();
  const cdp=await page.context().newCDPSession(page);
  try {
    await withBlockHover(page, async () => {
      await paragraph.hover(); await extent.waitFor();
      await cdp.send('Input.imeSetComposition',{text:'한글입력',selectionStart:4,selectionEnd:4});
      check(!await extent.isVisible(), 'IME composition left the hover outline visible');
      await cdp.send('Input.insertText',{text:'한글입력'});
      check(!await extent.isVisible(), 'IME commit restored the hover outline without pointer movement');
    });
  } finally {
    await cdp.detach();
  }
  check((await paragraph.textContent()).includes('한글입력'),'Korean composition failed');
  check(await page.getByTestId('status').textContent()==='Unsaved changes','Typing did not expose unsaved state');
  await page.keyboard.press('Control+z');
  check(await paragraph.textContent()===originalText,'Composition undo failed');
  check(await page.getByTestId('status').textContent()==='','Undo to baseline left a false dirty status');
  await page.keyboard.press('Control+Shift+z');
  check((await paragraph.textContent()).includes('한글입력'),'Composition redo failed');
  await page.getByTestId('save').click();
  await page.getByText('Saved',{exact:true}).filter({visible:true}).waitFor();
  await paragraph.click();
  await page.keyboard.press('End');
  await page.keyboard.insertText(' AFTER_SAVE');
  check(await page.getByTestId('status').textContent()==='Unsaved changes','Confirmed Saved remained visible after an edit');
  await page.keyboard.press('Control+z');
  check(await page.getByTestId('status').textContent()==='Saved','Undo to the saved baseline did not clear dirty status');
  await page.keyboard.press('Control+Shift+z');
  check(await page.getByTestId('status').textContent()==='Unsaved changes','Redo did not restore dirty status');
  await page.getByRole('button', {name:'File actions', exact:true}).click();
  await page.getByRole('menuitem', {name:'Reload', exact:true}).click();
  await page.getByRole('button', {name:'Discard and reload', exact:true}).click();
  await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
  await open('quiet-document.md');
  check((await page.locator('[data-document-tab][data-active=true] .paragraph').first().textContent()).includes('한글입력')&&!(await page.locator('[data-document-tab][data-active=true] .paragraph').first().textContent()).includes('AFTER_SAVE'),'Save / Reload did not preserve only the saved composition');

  // Reorder through the real drag handle, then restore through history. Move the
  // paragraph after the first body H1 below the next block.
  const lead=page.locator('[data-document-tab][data-active=true] .document-editor > .paragraph').first();
  await lead.hover();
  const target=page.locator('[data-document-tab][data-active=true] .document-editor > :nth-child(3)');
  const targetBox=await target.boundingBox();
  await page.getByRole('button',{name:'Move paragraph block 2',exact:true}).dragTo(target,{targetPosition:{x:40,y:targetBox.height-2}});
  check(await page.locator('[data-document-tab][data-active=true] .document-editor').evaluate(n=>n.editor.state.doc.child(1).type.name!=='paragraph'&&n.editor.state.doc.child(2).type.name==='paragraph'),'Block drag failed');
  await page.keyboard.press('Control+z');
  check(await page.locator('[data-document-tab][data-active=true] .document-editor').evaluate(n=>n.editor.state.doc.firstChild.type.name==='heading'),'Block move undo failed');

  // Inline overlays at the right edge, including resize and scroll while open.
  await page.setViewportSize({width:768,height:700});
  await page.locator('[data-document-tab][data-active=true] .inline-math-rendered .katex-html').first().dblclick();
  await bounds(page.getByTestId('inline-math-properties'),'Inline math 768');
  await page.setViewportSize({width:704,height:650});
  await page.mouse.wheel(0,120);
  await bounds(page.getByTestId('inline-math-properties'),'Inline math resized/scrolled');
  await shot('704-inline-math');
  await page.getByTestId('inline-math-source').press('Escape');
  // A resolved chip goes to its target; its edit button opens the reference form.
  await page.locator('[data-document-tab][data-active=true] .cross-reference').last().hover();
  await page.locator('[data-document-tab][data-active=true]').getByTestId('cross-reference-edit').last().click();
  await bounds(page.getByTestId('reference-form'),'Reference 704');
  await shot('704-reference');
  await page.getByTestId('reference-target').press('Escape');
  // This check is about toolbar placement at a narrow viewport. Create a real text
  // selection directly so a double-click landing on an inline atom does not make it flaky.
  await page.evaluate(text => {
    const editor = document.querySelector('[data-document-tab][data-active=true] .document-editor').editor;
    let range;
    editor.state.doc.descendants((node, position) => {
      if (range || !node.isText) return;
      const index = node.text.indexOf(text);
      if (index >= 0) range = {from: position + index, to: position + index + text.length};
    });
    if (!range) throw new Error(`text not found: ${text}`);
    editor.commands.setTextSelection(range);
    editor.view.focus();
    editor.commands.scrollIntoView();
  }, 'This document describes');
  await bounds(page.getByTestId('selection-toolbar'),'Selection toolbar 704');
  await page.getByRole('button',{name:'Link',exact:true}).click();
  await bounds(page.getByTestId('link-form'),'Link 704');
  await shot('704-link');
  await page.getByTestId('link-url').press('Escape');
  await page.waitForFunction(()=>document.querySelector('[data-document-tab][data-active=true] .document-editor')?.contains(document.activeElement));
  check(await page.locator('[data-document-tab][data-active=true] .document-editor').evaluate(n=>n.contains(document.activeElement)),'Inline form did not return focus');
  await page.locator('[data-document-tab][data-active=true] .paragraph').last().click();
  await page.keyboard.press('End');
  await page.keyboard.type(' /');
  await bounds(page.getByRole('menu',{name:'Insert block'}),'Slash menu 704');
  check(await page.locator('[data-document-tab][data-active=true] .document-editor').evaluate(n=>n.contains(document.activeElement)),'Slash stole editor focus');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+z');

  // Long content stays scrollable inside its block; the whole document never clips it.
  await open('아주-긴-파일명-very-long-technical-document-name-for-visual-review.md');
  for(const width of [1440,1024,768,640]) {
    await page.setViewportSize({width,height:1000});
    await rest();
    const local=await page.evaluate(()=>{
      const required=s=>{const n=document.querySelector('[data-document-tab][data-active=true] '+s) ?? document.querySelector(s);if(!n)throw Error(`Missing ${s}`);return n;};
      const math=required('.equation-math'),content=required('.equation-content'),table=required('.table-scroll');
      // The tab owns visible file identity; TopBar location is optional secondary information.
      const text=required('[role="tab"][aria-selected="true"] .document-tab-name'),path=text.closest('.document-tab');
      const paper=required('.document-editor').getBoundingClientRect();
      const contained=[math,table].every(n=>{const r=n.getBoundingClientRect();return r.left>=paper.left-1&&r.right<=paper.right+1&&['auto','scroll'].includes(getComputedStyle(n).overflowX);});
      return {math:[math.clientWidth,math.scrollWidth],table:[table.clientWidth,table.scrollWidth],formulaLeft:content.getBoundingClientRect().left-math.getBoundingClientRect().left,contained,docOverflow:document.documentElement.scrollWidth>innerWidth,filenameVisible:(()=>{
        const r=text.getBoundingClientRect(),row=path.parentElement.getBoundingClientRect(),close=path.querySelector('.document-tab-close').getBoundingClientRect();
        // #695 reserves the row's right side for actions. At 640px require readable text
        // and the complete close target inside the scroller, rather than a 100px label.
        return r.width>=32&&r.left>=row.left&&r.right<=row.right&&close.left>=row.left&&close.right<=row.right;
      })(),pathTitle:path.title};
    });
    check(local.math[1]>local.math[0]&&local.table[1]>local.table[0],`Long fixture did not exercise scrolling ${JSON.stringify(local)}`);
    check(local.contained&&local.formulaLeft>=-1&&!local.docOverflow&&local.filenameVisible&&local.pathTitle===scratch('아주-긴-파일명-very-long-technical-document-name-for-visual-review.md'),`Long content clipped ${JSON.stringify(local)}`);
    await page.locator('[data-document-tab][data-active=true] .equation-math').evaluate(n=>n.scrollLeft=n.scrollWidth);
    check(await page.locator('[data-document-tab][data-active=true] .equation-math').evaluate(n=>n.scrollLeft>0),'Formula not scrollable to end');
    await page.locator('[data-document-tab][data-active=true] .equation-math').evaluate(n=>n.scrollLeft=0);
    await shot(`${width}-long-content`);
    await page.locator('[data-document-tab][data-active=true] .table-scroll').evaluate(n=>n.scrollLeft=n.scrollWidth);
    check(await page.locator('[data-document-tab][data-active=true] .table-scroll').evaluate(n=>n.scrollLeft>0),'Table not scrollable to end');
    // A table wider than the column keeps its table actions reachable before it is scrolled.
    const wide=page.locator('[data-document-tab][data-active=true] .table-block');
    await wide.locator('.table-scroll').evaluate(n=>n.scrollLeft=0);
    await wide.hover({position:{x:8,y:8}});
    const actions=await wide.evaluate(block=>{
      const view=block.querySelector('.table-scroll').getBoundingClientRect();
      return ['Edit table','Table actions'].map(name=>{
        const r=block.querySelector(`[aria-label="${name}"]`)?.getBoundingClientRect();
        return {name,visible:!!r&&r.width>0&&r.left>=view.left-0.5&&r.right<=view.right+0.5};
      });
    });
    check(await wide.getByRole('button',{name:'Delete table',exact:true}).count()===0,'Delete table belongs in More');
    await wide.getByRole('button',{name:'Table actions',exact:true}).click();
    await page.getByRole('menu',{name:'Table actions',exact:true}).getByRole('menuitem',{name:'Delete table',exact:true}).waitFor();
    await page.keyboard.press('Escape');
    check(actions.every(a=>a.visible),`Wide table actions out of view ${JSON.stringify({width,actions})}`);
    await rest();
    results.push({width,...local});
  }
  await page.setViewportSize({width:768,height:1000});
  for(const [button,label] of [['Open folder…','Folder']]) {
    await openFolderPicker(page);
    await bounds(page.getByRole('dialog'),`${label} dialog`);
    await shot(`768-${label.toLowerCase()}-dialog`);
    await page.getByRole('dialog').getByRole('button',{name:'Cancel',exact:true}).click();
  }
  return {screenshotCount,themeReview,keyboardFigure,visualInteractionsPreservedJSON:true,compositionUndoRedo:true,statusSaveReload:true,blockDragUndo:true,results};
}
