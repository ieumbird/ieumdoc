// Real Core-backed scratch fixture; run with pnpm browser:test layout-rules.
async page => {
  await page.unrouteAll();
  const origin = page.url().split('/').slice(0,3).join('/');
  const loaded = await (await page.request.get(`${origin}/api/document`)).json();
  const sep = loaded.path.includes('\\') ? '\\' : '/';
  const root = loaded.path.split(sep).slice(0,-4).join(sep);
  const file = [root, 'tmp', 'quiet-document', 'quiet-document.md'].join(sep);
  await page.reload();
  await page.locator('[data-testid="status"][data-operation="Ready"]').waitFor({state:'attached'});
  await page.getByRole('button',{name:'Open file…'}).click();
  await page.getByTestId('file-path').fill(file);
  await page.getByRole('dialog').getByRole('button',{name:'Open',exact:true}).click();
  await page.locator('[data-testid="status"][data-operation="Ready"]').waitFor({state:'attached'});
  // The sidebar is measured with its folder: heading, actions and listed files.
  await page.getByRole('button',{name:'Open folder…',exact:true}).click();
  await page.getByTestId('folder-path').fill(file.slice(0,file.lastIndexOf(sep)));
  await page.getByTestId('folder-open').click();
  await page.getByRole('dialog').waitFor({state:'detached'});
  await page.getByTestId('folder').getByRole('button',{name:'quiet-document.md',exact:true}).waitFor();
  await page.evaluate(async()=>{await document.fonts.ready; await Promise.all([...document.images].map(i=>i.decode()));});
  const results=[];
  for(const width of [1440,1025,1024,768,705,704]) {
    await page.setViewportSize({width,height:1000});
    for(const collapsed of [false,true]) {
      if(collapsed) await page.getByRole('button',{name:'Collapse sidebar',exact:true}).click();
      await page.mouse.move(width-2,2);
      await page.evaluate(()=>{window.scrollTo(0,0);document.activeElement?.blur();});
      const rest=await page.locator('.block-controls').evaluateAll(nodes=>nodes.map(n=>({opacity:getComputedStyle(n).opacity,pointer:getComputedStyle(n).pointerEvents})));
      if(!rest.length || rest.some(n=>n.opacity!=='0'||n.pointer!=='none')) throw Error('Rest gutter must be invisible and inert');
      const paragraph=page.locator('.document-editor > .paragraph').first();
      const before=(await paragraph.boundingBox()).x;
      await paragraph.hover();
      const controls=page.locator('.block-controls.visible').first();
      await controls.getByRole('button').first().hover();
      if(await controls.evaluate(n=>getComputedStyle(n).opacity)!=='1') throw Error('Gutter disappears between block and button');
      const after=(await paragraph.boundingBox()).x;
      const result=await page.evaluate(({collapsed,width})=>{
        const required=s=>{const n=document.querySelector(s);if(!n)throw Error(`Missing required ${s}`);return n;};
        const rect=s=>required(s).getBoundingClientRect();
        const main=rect('.app-main'),column=rect('.document-column'),doc=rect('.document-editor');
        const selectors=['.heading','.paragraph','.table-block','.figure','.equation','.admonition'];
        const starts=selectors.map(s=>rect('.document-editor '+s).left);
        const controls=rect('.block-controls.visible');
        const standard=rect('[data-testid="save"]').height;
        const compact=[...document.querySelectorAll('.sidebar-header button,.sidebar-folder-actions button,.figure-edit,.equation-edit')].map(n=>n.getBoundingClientRect().height);
        if(compact.length<3)throw Error('Missing compact controls');
        for(const button of document.querySelectorAll('.figure-edit,.equation-edit')) {
          if(getComputedStyle(button).fontFamily!==getComputedStyle(document.body).fontFamily)throw Error('Document font leaked into UI control');
        }
        // The folder heading and its entries share one icon slot and one text start.
        const icons=collapsed?null:[...document.querySelectorAll('.sidebar-folder-name svg,.sidebar-folder-item svg')].map(n=>n.getBoundingClientRect());
        if(icons&&icons.length<2)throw Error('Missing expanded sidebar icons');
        const labels=collapsed?null:[...document.querySelectorAll('.sidebar-folder-name span,.sidebar-folder-item span')].map(n=>{
          if(!n.textContent.trim())throw Error('Missing sidebar label');
          return n.getBoundingClientRect().left;
        });
        // Expanded widths are adjustable values; the collapsed rail is fixed.
        const token=name=>{const v=getComputedStyle(document.documentElement).getPropertyValue(name).trim();if(!v.endsWith('rem'))throw Error(`Unexpected ${name}: ${v}`);return parseFloat(v)*parseFloat(getComputedStyle(document.documentElement).fontSize);};
        const sidebarWidth=rect('.sidebar').width;
        const expectedSidebar=collapsed?token('--layout-sidebar-rail-width'):token(innerWidth<=1024?'--layout-sidebar-width-narrow':'--layout-sidebar-width');
        const type=s=>{const cs=getComputedStyle(required(s));return {size:parseFloat(cs.fontSize),line:parseFloat(cs.lineHeight),weight:cs.fontWeight,font:cs.fontFamily};};
        const headings=[1,2,3,4,5,6].map(n=>type('h'+n+'.heading'));
        const body=type('.paragraph'),caption=type('.caption'),table=type('.table');
        const family=body.font.split(',').map(s=>s.trim().replaceAll('"',''));
        const expected=['Pretendard Variable','Pretendard','Noto Sans KR','Apple SD Gothic Neo','Malgun Gothic','Segoe UI','sans-serif'];
        if(JSON.stringify(family)!==JSON.stringify(expected)||[...headings,caption,table].some(t=>t.font!==body.font)||getComputedStyle(document.body).fontFamily!==body.font)throw Error('Shared sans font contract changed');
        const shellOverflow=['.app-shell','.sidebar','.app-main','.top-bar','.document-column','.document','.document-editor','.figure','.equation','.table-block'].filter(s=>{const r=rect(s);return r.left<0||r.right>innerWidth+1;});
        return {width,collapsed,header:rect('.top-bar').height,sidebarHeader:rect('.sidebar-header').height,centerDelta:Math.abs(main.left+main.width/2-column.left-column.width/2),blockDelta:Math.max(...starts)-Math.min(...starts),gutterGap:doc.left-controls.right,standard,compact,icons:icons?.map(r=>({x:r.x,w:r.width,h:r.height}))??null,labels,sidebarWidth,expectedSidebar,body,headings,caption,table,shellOverflow};
      },{collapsed,width});
      const fail=result.centerDelta>1||result.blockDelta>1||result.gutterGap<11||Math.abs(before-after)>0.5||result.standard!==32||result.compact.some(h=>h!==28)||result.shellOverflow.length||result.body.size!==17||Math.abs(result.body.line-28.9)>0.1||result.headings.some((t,i)=>t.size!==[34,24,20,18,16,14][i]||t.weight!=='700')||result.caption.size!==14||result.table.size!==14||Math.abs(result.sidebarWidth-result.expectedSidebar)>0.5||(!collapsed&&(Math.max(...result.labels)-Math.min(...result.labels)>1||Math.max(...result.icons.map(i=>i.x))-Math.min(...result.icons.map(i=>i.x))>1||result.icons.some(i=>i.w!==16||i.h!==16)));
      // Below 704px the TopBar intentionally wraps; the sidebar header remains 48px.
      if(fail||result.sidebarHeader!==48||(width>704&&result.header!==48)||(width<=704&&result.header<=48))throw Error(JSON.stringify(result));
      results.push({...result,hoverShift:after-before});
      if(collapsed)await page.getByRole('button',{name:'Expand sidebar',exact:true}).click();
    }
  }
  // Editing shows the interaction-colored caret, not a frame around the whole document, whether
  // focus comes from a click or the keyboard.
  const editing=async()=>page.locator('.document-editor').evaluate(n=>{
    const cs=getComputedStyle(n);
    return {focused:document.activeElement===n,outline:cs.outlineStyle,boxShadow:cs.boxShadow,border:['Top','Right','Bottom','Left'].map(side=>parseFloat(cs['border'+side+'Width'])).reduce((a,b)=>a+b,0),caret:cs.caretColor,interaction:getComputedStyle(document.documentElement).getPropertyValue('--id-color-interaction').trim()};
  });
  const noFrame=state=>state.focused&&state.outline==='none'&&state.boxShadow==='none'&&state.border===0;
  await page.locator('.document-editor > .paragraph').first().click();
  const clicked=await editing();
  await page.locator('[data-table-cell]').first().click();
  const cell=await editing();
  await page.evaluate(()=>document.activeElement?.blur());
  await page.locator('.document-editor').focus();
  await page.keyboard.press('ArrowDown');
  const keyboard=await editing();
  const caretColor=await page.evaluate(color=>{const probe=document.createElement('span');probe.style.color=color;document.body.append(probe);const value=getComputedStyle(probe).color;probe.remove();return value;},clicked.interaction);
  if(![clicked,cell,keyboard].every(noFrame)||clicked.caret!==caretColor)throw Error(`Editing frames the document: ${JSON.stringify({clicked,cell,keyboard,caretColor})}`);
  // Chrome stays put: a status message appearing never moves the top bar controls.
  await page.setViewportSize({width:1440,height:1000});
  const controls=()=>page.locator('.top-bar-actions button').evaluateAll(nodes=>nodes.map(n=>Math.round(n.getBoundingClientRect().x)));
  const clean=await controls();
  await page.locator('.document-editor > .paragraph').first().click();
  await page.keyboard.press('End');
  await page.keyboard.type('!');
  await page.locator('[data-testid="status"]',{hasText:'Unsaved changes'}).waitFor();
  const dirty=await controls();
  await page.keyboard.press('Control+z');
  if(JSON.stringify(clean)!==JSON.stringify(dirty))throw Error(`Status moved the top bar controls: ${JSON.stringify({clean,dirty})}`);
  // Wide document: the column takes --layout-content-width-wide (capped by the window), keeps the
  // content axis and gutter, moves no top bar control, and is remembered across a reload.
  await page.setViewportSize({width:1920,height:1000});
  await page.mouse.move(1918,2);
  const column=()=>page.evaluate(()=>{
    const rect=s=>{const n=document.querySelector(s);if(!n)throw Error(`Missing required ${s}`);return n.getBoundingClientRect();};
    const main=rect('.app-main'),column=rect('.document-column'),doc=rect('.document-editor');
    const starts=['.heading','.paragraph','.table-block','.figure','.equation','.admonition'].map(s=>rect('.document-editor '+s).left);
    const probe=document.createElement('div');
    probe.style.width=getComputedStyle(document.documentElement).getPropertyValue('--layout-content-width-wide');
    document.body.append(probe);const wide=probe.getBoundingClientRect().width;probe.remove();
    return {width:column.width,available:main.width,wide,centerDelta:Math.abs(main.left+main.width/2-column.left-column.width/2),blockDelta:Math.max(...starts)-Math.min(...starts),textInset:doc.left-column.left};
  });
  const toggle=page.getByRole('button',{name:'Wide document',exact:true});
  const standard=await column();
  const before=await controls();
  await toggle.click();
  const wide=await column();
  const after=await controls();
  if(!(wide.wide>0)||Math.abs(wide.width-Math.min(wide.wide,wide.available))>1||wide.width<=standard.width||wide.centerDelta>1||wide.blockDelta>1||
    Math.abs(wide.textInset-standard.textInset)>0.5||JSON.stringify(before)!==JSON.stringify(after)||await toggle.getAttribute('aria-pressed')!=='true')
    throw Error(`Wide document layout: ${JSON.stringify({standard,wide,before,after})}`);
  await page.reload();
  await page.locator('[data-testid="status"][data-operation="Ready"]').waitFor({state:'attached'});
  const remembered=await toggle.getAttribute('aria-pressed')==='true'&&await page.locator('.app-shell--wide').count()===1;
  await toggle.click();
  if(!remembered||await page.locator('.app-shell--wide').count()!==0)throw Error('Wide document preference was not remembered or cleared');
  results.push({wide:{standard:standard.width,wide:wide.width}});
  return results;
}
