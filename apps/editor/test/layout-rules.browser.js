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
  await page.getByRole('button',{name:'Open…'}).click();
  await page.getByTestId('file-path').fill(file);
  await page.getByRole('dialog').getByRole('button',{name:'Open',exact:true}).click();
  await page.locator('[data-testid="status"][data-operation="Ready"]').waitFor({state:'attached'});
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
        const compact=[...document.querySelectorAll('.sidebar-header button,.sidebar-actions button,.figure-edit,.equation-edit')].map(n=>n.getBoundingClientRect().height);
        if(compact.length<3)throw Error('Missing compact controls');
        for(const button of document.querySelectorAll('.figure-edit,.equation-edit')) {
          if(getComputedStyle(button).fontFamily!==getComputedStyle(document.body).fontFamily)throw Error('Document font leaked into UI control');
        }
        const icons=collapsed?null:[...document.querySelectorAll('.sidebar-actions svg,.sidebar-document-icon')].map(n=>n.getBoundingClientRect());
        if(icons&&icons.length!==3)throw Error('Missing expanded sidebar icons');
        const labels=collapsed?null:[...document.querySelectorAll('.sidebar-actions button,.sidebar-document-name')].map(n=>{
          const text=[...n.childNodes].find(c=>c.nodeType===Node.TEXT_NODE&&c.textContent.trim());
          if(!text)throw Error('Missing sidebar label');
          const r=document.createRange();r.selectNode(text);return r.getBoundingClientRect().left;
        });
        const type=s=>{const cs=getComputedStyle(required(s));return {size:parseFloat(cs.fontSize),line:parseFloat(cs.lineHeight),weight:cs.fontWeight,font:cs.fontFamily};};
        const headings=[1,2,3,4,5,6].map(n=>type('h'+n+'.heading'));
        const body=type('.paragraph'),caption=type('.caption'),table=type('.table');
        const family=body.font.split(',').map(s=>s.trim().replaceAll('"',''));
        const expected=['Pretendard Variable','Pretendard','Noto Sans KR','Apple SD Gothic Neo','Malgun Gothic','Segoe UI','sans-serif'];
        if(JSON.stringify(family)!==JSON.stringify(expected)||[...headings,caption,table].some(t=>t.font!==body.font)||getComputedStyle(document.body).fontFamily!==body.font)throw Error('Shared sans font contract changed');
        const shellOverflow=['.app-shell','.sidebar','.app-main','.top-bar','.document-column','.document','.document-editor','.figure','.equation','.table-block'].filter(s=>{const r=rect(s);return r.left<0||r.right>innerWidth+1;});
        return {width,collapsed,header:rect('.top-bar').height,sidebarHeader:rect('.sidebar-header').height,centerDelta:Math.abs(main.left+main.width/2-column.left-column.width/2),blockDelta:Math.max(...starts)-Math.min(...starts),gutterGap:doc.left-controls.right,standard,compact,icons:icons?.map(r=>({x:r.x,w:r.width,h:r.height}))??null,labels,body,headings,caption,table,shellOverflow};
      },{collapsed,width});
      const fail=result.centerDelta>1||result.blockDelta>1||result.gutterGap<11||Math.abs(before-after)>0.5||result.standard!==32||result.compact.some(h=>h!==28)||result.shellOverflow.length||result.body.size!==17||Math.abs(result.body.line-28.9)>0.1||result.headings.some((t,i)=>t.size!==[34,24,20,18,16,14][i]||t.weight!=='700')||result.caption.size!==14||result.table.size!==14||(!collapsed&&(Math.max(...result.labels)-Math.min(...result.labels)>1||result.icons.some(i=>i.w!==16||i.h!==16)));
      // Below 704px the TopBar intentionally wraps; the sidebar header remains 48px.
      if(fail||result.sidebarHeader!==48||(width>704&&result.header!==48)||(width<=704&&result.header<=48))throw Error(JSON.stringify(result));
      results.push({...result,hoverShift:after-before});
      if(collapsed)await page.getByRole('button',{name:'Expand sidebar',exact:true}).click();
    }
  }
  return results;
}
