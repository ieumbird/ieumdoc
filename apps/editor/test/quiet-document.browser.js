// Regression checks on real scratch files; optional captures are for manual visual review.
// pnpm browser:test quiet-document --screenshots writes tmp/visual-refinement/after-*.png.
async (page, { screenshots = false, openDocument, withBlockHover }) => {
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
      await Promise.all([...document.images].map(img => img.decode()));
    });
  };
  const rest = async () => {
    await page.evaluate(() => { window.scrollTo(0,0); document.activeElement?.blur(); });
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
      return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height,header,viewport:[innerWidth,innerHeight],children,scrollWidth:n.scrollWidth,clientWidth:n.clientWidth,scrollHeight:n.scrollHeight,clientHeight:n.clientHeight};
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
      check(fonts.length > 0 && fonts.every(font => font.isCustomFont && font.familyName.includes('Pretendard')),
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
  const outlineRadii = async block => {
    const selected = await block.evaluate(n => {
      const s = getComputedStyle(n);
      return {radius:parseFloat(s.borderTopLeftRadius), offset:parseFloat(s.outlineOffset)};
    });
    const hover = await extent.evaluate(n => parseFloat(getComputedStyle(n).borderTopLeftRadius));
    return {...selected, hover, matches:Math.abs(selected.radius + selected.offset - hover) < 0.1};
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
    for (const kind of ['figure','equation']) {
      const block = page.locator(`[data-document-tab][data-active=true] .${kind}`);
      await selectBlock(block);
      check(await block.getAttribute('data-selected') === 'true', `${kind}: selection missing`);
      await block.hover(); await extent.waitFor();
      radii.push({kind,...await outlineRadii(block)});
    }
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
    results.push({typingHover:{hiddenAfterTyping,hiddenAfterLayout},radii});
    check(hiddenAfterTyping && hiddenAfterLayout && radii.every(r => r.matches),
      `Typing/outline regression: ${JSON.stringify({hiddenAfterTyping,hiddenAfterLayout,radii})}`);
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
  const metadataState=await metadata.evaluateAll(nodes=>nodes.map(n=>({visibility:getComputedStyle(n).visibility,pointer:getComputedStyle(n).pointerEvents,controls:n.querySelectorAll('button,a,input').length})));
  check(metadataState.length===await page.locator('[data-document-tab][data-active=true] :is([data-block="figure"], [data-block="equation"], [data-block="table"])').count()&&metadataState.every(m=>m.visibility==='hidden'&&m.pointer==='none'&&m.controls===0),'Rest metadata must be hidden, inert text; controls remain separate');
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
    for(const width of [1440,1024,768,705,704,414,375]) {
      await page.setViewportSize({width,height:1000});
      await rest();
      await shot(`${width}-rest`);
      await withBlockHover(page, async () => {
        await page.locator('[data-document-tab][data-active=true] .paragraph').first().hover();
        await shot(`${width}-paragraph-hover`);
      });
      // Phone widths start with the rail; there the opened sidebar overlays the document.
      if(await page.getByRole('button',{name:'Expand sidebar',exact:true}).count()) {
        await page.getByRole('button',{name:'Expand sidebar',exact:true}).click();
        await rest();
        await shot(`${width}-sidebar-overlay`);
      } else {
        await page.getByRole('button',{name:'Collapse sidebar',exact:true}).click();
        await rest();
        await shot(`${width}-collapsed`);
        await page.getByRole('button',{name:'Expand sidebar',exact:true}).click();
      }
      await page.getByRole('button',{name:'Display',exact:true}).click();
      await rest();
      await shot(`${width}-display`);
      await page.getByRole('button',{name:'Files',exact:true}).click();
      // A phone sidebar covers the document. Leave it closed before the next phone width's
      // rest/hover captures; crossing 414 → 375 does not cross the responsive breakpoint.
      if (width < 640) await page.getByRole('button',{name:'Collapse sidebar',exact:true}).click();
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
      check(await page.locator('[data-document-tab][data-active=true] .figure').evaluate((n, color) => getComputedStyle(n).outlineColor === color, hoverStyle.interaction) &&
        await extent.evaluate((n, shadow) => getComputedStyle(n).boxShadow === shadow, hoverStyle.expectedShadow),
        'Selected Figure must keep its blue outer outline alongside the neutral hover inset');
    });
    if (screenshots) {
      await rest();
      await shot(`${width}-figure-selected`);
    }
    await page.getByRole('button',{name:'Edit figure'}).click();
    await page.waitForFunction(()=>document.activeElement?.getAttribute('data-testid')==='figure-image-url');
    await bounds(page.getByTestId('figure-properties'), `Figure ${width}`);
    const colors=await page.evaluate(()=>{
      const root=getComputedStyle(document.documentElement),input=document.querySelector('[data-testid="figure-image-url"]');
      const interaction=root.getPropertyValue('--id-color-interaction').trim();
      const probe=document.createElement('span');probe.style.color=interaction;document.body.append(probe);const color=getComputedStyle(probe).color;probe.remove();
      return {color,outline:getComputedStyle(document.querySelector('[data-document-tab][data-active=true] .figure')).outlineColor,border:getComputedStyle(input).borderColor,ring:getComputedStyle(input).boxShadow};
    });
    check(colors.outline===colors.color&&colors.border===colors.color&&colors.ring.includes(colors.color),`Interaction role not applied: ${JSON.stringify(colors)}`);
    await withBlockHover(page, async () => {
      await page.locator('[data-document-tab][data-active=true] .figure').hover(); await extent.waitFor();
      check(await page.locator('[data-document-tab][data-active=true] .figure').evaluate((n, color) => getComputedStyle(n).outlineColor === color, colors.color),
        'Hover obscured the editing Figure outline');
      check((await outlineRadii(page.locator('[data-document-tab][data-active=true] .figure'))).matches,
        'Editing Figure and hover outline corner radii differ');
    });
    await page.mouse.move(0,0);
    await shot(`${width}-figure-editing`);
    // The selected outline is an interaction state, not draft ownership.
    await page.getByTestId('figure-caption').fill('수정 중인 caption');
    check(await page.getByTestId('status').textContent()==='Unsaved changes','Dirty Figure draft has misleading status');
    await page.locator('[data-document-tab][data-active=true] .document-editor').press('ArrowDown');
    check(await page.getByTestId('figure-caption').inputValue()==='수정 중인 caption','Selection movement lost the Figure draft');
    check(await page.locator('[data-document-tab][data-active=true] .figure[data-selected="false"][data-editing="true"]').count()===1,'Independent selected/editing axes missing');
    await page.getByTestId('figure-cancel').click();
    await page.locator('[data-document-tab][data-active=true] .paragraph').first().click();
    // Equation Apply/Cancel is exercised by the dedicated Equation regressions.
    if (screenshots) {
      await page.locator('[data-document-tab][data-active=true] .equation').hover();
      await page.locator('[data-document-tab][data-active=true] .equation').getByRole('button',{name:'Edit',exact:true}).click();
      await page.getByTestId('equation-editor').waitFor();
      await page.evaluate(()=>window.scrollTo(0,0));
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
  await page.waitForFunction(()=>document.activeElement?.getAttribute('data-testid')==='figure-image-url');
  await page.getByTestId('figure-cancel').click();

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

  // Reorder through the real drag handle, then restore through history. The leading title stays
  // first (#255), so the paragraph after it moves below the next block.
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
  await page.locator('[data-document-tab][data-active=true] .inline-math-rendered .katex-html').first().click();
  await bounds(page.getByTestId('inline-math-form'),'Inline math 768');
  await page.setViewportSize({width:704,height:650});
  await page.mouse.wheel(0,120);
  await bounds(page.getByTestId('inline-math-form'),'Inline math resized/scrolled');
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
  for(const width of [1440,1024,768]) {
    await page.setViewportSize({width,height:1000});
    await rest();
    const local=await page.evaluate(()=>{
      const required=s=>{const n=document.querySelector('[data-document-tab][data-active=true] '+s) ?? document.querySelector(s);if(!n)throw Error(`Missing ${s}`);return n;};
      const math=required('.equation-math'),content=required('.equation-content'),table=required('.table-scroll');
      const text=required('.document-path-name'),path=required('.document-path');
      return {math:[math.clientWidth,math.scrollWidth],table:[table.clientWidth,table.scrollWidth],formulaLeft:content.getBoundingClientRect().left-math.getBoundingClientRect().left,docOverflow:document.documentElement.scrollWidth>innerWidth,filenameVisible:text.getBoundingClientRect().width>100,pathTitle:path.title};
    });
    check(local.math[1]>local.math[0]&&local.table[1]>local.table[0],`Long fixture did not exercise scrolling ${JSON.stringify(local)}`);
    check(local.formulaLeft>=-1&&!local.docOverflow&&local.filenameVisible&&local.pathTitle===scratch('아주-긴-파일명-very-long-technical-document-name-for-visual-review.md'),`Long content clipped ${JSON.stringify(local)}`);
    await page.locator('[data-document-tab][data-active=true] .equation-math').evaluate(n=>n.scrollLeft=n.scrollWidth);
    check(await page.locator('[data-document-tab][data-active=true] .equation-math').evaluate(n=>n.scrollLeft>0),'Formula not scrollable to end');
    await page.locator('[data-document-tab][data-active=true] .equation-math').evaluate(n=>n.scrollLeft=0);
    await shot(`${width}-long-content`);
    // A table wider than the column keeps its table actions reachable before it is scrolled.
    const wide=page.locator('[data-document-tab][data-active=true] .table-block');
    await wide.locator('.table-scroll').evaluate(n=>n.scrollLeft=0);
    await wide.hover({position:{x:8,y:8}});
    const actions=await wide.evaluate(block=>{
      const view=block.querySelector('.table-scroll').getBoundingClientRect();
      return ['Edit table','Table actions','Delete table'].map(name=>{
        const r=block.querySelector(`[aria-label="${name}"]`)?.getBoundingClientRect();
        return {name,visible:!!r&&r.width>0&&r.left>=view.left-0.5&&r.right<=view.right+0.5};
      });
    });
    check(actions.every(a=>a.visible),`Wide table actions out of view ${JSON.stringify({width,actions})}`);
    await rest();
    results.push({width,...local});
  }
  for(const [button,label] of [['Open folder…','Folder']]) {
    await page.getByRole('button',{name:button,exact:true}).click();
    await bounds(page.getByRole('dialog'),`${label} dialog`);
    await shot(`768-${label.toLowerCase()}-dialog`);
    await page.getByRole('dialog').getByRole('button',{name:'Cancel',exact:true}).click();
  }
  return {screenshotCount,keyboardFigure,visualInteractionsPreservedJSON:true,compositionUndoRedo:true,statusSaveReload:true,blockDragUndo:true,results};
}
