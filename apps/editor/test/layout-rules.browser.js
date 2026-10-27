// Real Core-backed scratch fixture; run with pnpm browser:test layout-rules.
async (page, { openPath, withBlockHover, expect }) => {
  page.setDefaultTimeout(15000);
  await page.unrouteAll();
  const origin = page.url().split('/').slice(0,3).join('/');
  const loaded = await (await page.request.get(`${origin}/api/document`)).json();
  const sep = loaded.path.includes('\\') ? '\\' : '/';
  const root = loaded.path.split(sep).slice(0,-4).join(sep);
  const file = [root, 'tmp', 'quiet-document', 'quiet-document.md'].join(sep);
  await page.reload();
  await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
  await openPath(page, file);
  // The sidebar is measured with its folder: heading, actions and listed files.
  await page.getByTestId('sidebar').getByRole('button',{name:'Open folder…',exact:true}).click();
  await page.getByTestId('folder-path').fill(file.slice(0,file.lastIndexOf(sep)));
  await page.getByTestId('folder-open').click();
  await page.getByRole('dialog').waitFor({state:'detached'});
  await page.getByTestId('folder').getByRole('treeitem',{name:'quiet-document.md',exact:true}).waitFor();
  await page.evaluate(async()=>{await document.fonts.ready; await Promise.all([...document.images].map(i=>i.decode()));});
  // Include native controls absent from the layout fixture, without changing its saved source
  // or the document used by the geometry checks below.
  const isolationDocument=await page.locator('[data-document-tab][data-active=true] .document-editor').evaluate(element=>{
    const editor=element.editor, original=editor.getJSON();
    editor.commands.insertContentAt(editor.state.doc.content.size,[
      {type:'codeBlock',attrs:{language:'js'},content:[{type:'text',text:'const value = 1;'}]},
      {type:'labelTarget',attrs:{label:'isolation-label'}},
    ]);
    return original;
  });
  // Document preferences must not resize or restyle navigation, controls or dialog text.
  const results=[];
  const language=async (next,delayFocus=false)=>{
    const current=await page.locator('html').getAttribute('lang');
    const expand=page.getByRole('button',{name:current==='ko'?'사이드바 펼치기':'Expand sidebar',exact:true});
    if(await expand.isVisible())await expand.click();
    // Hold Base UI's actual initial focus on the reproducing phone-width path (#541).
    if(delayFocus)await page.evaluate(()=>{
      const focus=HTMLElement.prototype.focus;
      HTMLElement.prototype.focus=function(...args){
        if(this.matches('[data-testid="settings-back"]')){
          window.releaseSettingsFocus=()=>{HTMLElement.prototype.focus=focus;focus.apply(this,args);};
          return;
        }
        return focus.apply(this,args);
      };
    });
    await page.getByRole('button',{name:current==='ko'?'설정':'Settings',exact:true}).click();
    // selectOption does not focus the select. Escape on the opener can dismiss the phone sidebar.
    let focusReady=false;
    const focused=expect(page.getByTestId('settings-back')).toBeFocused().then(()=>{focusReady=true;});
    try{
      if(delayFocus){
        await page.waitForFunction(()=>!!window.releaseSettingsFocus);
        if(focusReady)throw Error('Settings readiness must wait for initial focus');
      }
    }finally{
      if(delayFocus)await page.evaluate(()=>window.releaseSettingsFocus?.());
      await focused;
    }
    await page.getByTestId('ui-language').selectOption(next);
    await page.keyboard.press('Escape');
    await page.getByTestId('settings-dialog').waitFor({state:'detached'});
    await expect(page.getByRole('button',{name:next==='ko'?'설정':'Settings',exact:true})).toBeFocused();
  };
  for(const width of [1440,390])for(const locale of ['en','ko']){
  await page.setViewportSize({width,height:1000});
  await page.getByTestId('document-panel').waitFor({state:width>=1424?'visible':'detached'});
  await language(locale,width===390&&locale==='en');
  await page.getByTestId('sidebar').getByRole('button',{name:locale==='ko'?'폴더 열기…':'Open folder…',exact:true}).click();
  await page.getByTestId('folder-path').fill(file.slice(0,file.lastIndexOf(sep)+1));
  // #522 removes the duplicate current-folder crumb. A ready New folder action means the
  // current path's listing is available; keep all typography and geometry assertions below.
  await expect(page.getByRole('dialog').getByRole('button',{name:locale==='ko'?'새 폴더':'New folder',exact:true})).toBeEnabled();
  await page.getByTestId('folder-path').focus();
  const isolation = await page.evaluate(() => {
    const root=document.documentElement;
    // The narrow layout deliberately unmounts the closed Outline; its desktop coverage stays required.
    const selectors=[...(innerWidth>=1424?['.document-outline-item']:[]),'.sidebar-tree-item','[data-testid="save"]','.figure-edit','.equation-edit','.folder-picker-crumb',
      '.table-row-handle','.table-column-handle','.table-extend','.table-action-bar button',
      '.code-language','.block-metadata','.label-target-edit','.cross-reference-edit','[role="dialog"]',
      // Caption/table families stay UI-owned; their sizes have separate document tokens.
      '.caption','.table'];
    const type=n=>{
      const s=getComputedStyle(n);
      // Reference edit icons have a fixed SVG size; their em offsets deliberately follow
      // the reference text. Inspect the visible icon size rather than that anchor's em.
      const size=n.matches('.cross-reference-edit')?getComputedStyle(n.querySelector('svg')).width:s.fontSize;
      return [s.fontFamily,size,s.lineHeight,s.fontWeight];
    };
    const ui=()=>selectors.map(selector=>{
      const nodes=[...document.querySelectorAll(selector)];
      if(!nodes.length)throw Error(`Missing UI isolation target: ${selector}`);
      return nodes.map(type);
    });
    const before=ui(), body=document.querySelector('.document-editor'), original=type(body);
    const required=s=>{const n=document.querySelector(s);if(!n)throw Error(`Missing control ${s}`);return n;};
    const resolve=(property,token)=>{
      const probe=document.createElement('span');probe.style[property]=`var(${token})`;document.body.append(probe);
      const value=getComputedStyle(probe)[property];probe.remove();return value;
    };
    const geometry=[['[data-testid="save"]',32],['.folder-picker-field',32],['.code-language',28],
      ['.table-row-handle',28],['.table-column-handle',28],['.table-extend',28],
      ['.table-action-bar button',28],['.sidebar-collapse',28]].map(([selector,height])=>{
        const n=required(selector),s=getComputedStyle(n);
        return {selector,height:n.getBoundingClientRect().height,expected:height,radius:s.borderRadius,expectedRadius:resolve('borderRadius','--id-radius-md')};
      });
    const handles=[...document.querySelectorAll('.table-row-handle,.table-column-handle')];
    if(!handles.length || handles.some(n=>n.textContent.trim() || !n.querySelector('svg[aria-hidden="true"]') || !n.title || n.title!==n.getAttribute('aria-label'))) {
      throw Error('Light table handles must retain localized address names/tooltips without visible address text');
    }
    const crumbs=[...document.querySelectorAll('.folder-picker-crumb')];
    if(!crumbs.length)throw Error('Missing breadcrumb controls');
    const selected=getComputedStyle(required('.sidebar-tree-item[aria-current="page"]'));
    const field=getComputedStyle(required('.folder-picker-field'));
    const shared={geometry,crumbs:crumbs.every(n=>n.getBoundingClientRect().height>=28&&getComputedStyle(n).borderRadius===resolve('borderRadius','--id-radius-md')),
      selected:selected.backgroundColor===resolve('backgroundColor','--id-color-surface-selected')&&selected.color===resolve('color','--id-color-text-selected'),
      focus:field.borderColor===resolve('color','--id-color-border-focus')&&field.boxShadow.includes(resolve('color','--id-color-interaction')),
      language:document.documentElement.lang};
    const overrides={'--font-size-document':`calc(${original[1]} * 1.25)`,'--font-family-document':original[0].includes('monospace')?'serif':'monospace',
      '--line-height-document':`calc(${original[2]} * 1.25)`};
    const saved=Object.keys(overrides).map(name=>[name,root.style.getPropertyValue(name),root.style.getPropertyPriority(name)]);
    try {
      for(const [name,value] of Object.entries(overrides))root.style.setProperty(name,value);
      const after=ui();
      // UI text sizes have their own owners; document text uses its document tokens.
      const documentType=()=>[body,...body.querySelectorAll('.heading,.caption,.table')].map(type);
      const documentBefore=documentType();
      const uiOverrides={'--font-size-sm':'1.5rem','--font-size-xs':'1.25rem','--line-height-label':'2rem','--line-height-meta':'1.75rem'};
      const savedUI=Object.keys(uiOverrides).map(name=>[name,root.style.getPropertyValue(name),root.style.getPropertyPriority(name)]);
      let documentUnchanged;
      try {
        for(const [name,value] of Object.entries(uiOverrides))root.style.setProperty(name,value);
        documentUnchanged=JSON.stringify(documentBefore)===JSON.stringify(documentType());
      } finally {
        for(const [name,value,priority] of savedUI)value?root.style.setProperty(name,value,priority):root.style.removeProperty(name);
      }
      return {shared,documentUnchanged,uiUnchanged:JSON.stringify(before)===JSON.stringify(after),
        changes:selectors.flatMap((selector,i)=>JSON.stringify(before[i])===JSON.stringify(after[i])?[]:[{selector,before:before[i],after:after[i]}]),
        documentChanged:type(body)[0]!==original[0]&&parseFloat(type(body)[1])>parseFloat(original[1])&&type(body)[2]!==original[2]};
    } finally {
      for(const [name,value,priority] of saved) value?root.style.setProperty(name,value,priority):root.style.removeProperty(name);
    }
  });
  if(!isolation.uiUnchanged||!isolation.documentChanged||!isolation.documentUnchanged)throw Error(`Document typography leaked into UI: ${JSON.stringify(isolation)}`);
  const shared=isolation.shared;
  if(shared.language!==locale||!shared.crumbs||!shared.selected||!shared.focus||shared.geometry.some(c=>c.height!==c.expected||c.radius!==c.expectedRadius))
    throw Error(`Shared control contract (${locale}/${width}): ${JSON.stringify(shared)}`);
  results.push({shared:{width,...shared}});
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({state:'detached'});
  }
  await language('en');
  await page.setViewportSize({width:1440,height:1000});
  await page.getByRole('button',{name:'Collapse sidebar',exact:true}).waitFor();
  await page.locator('[data-document-tab][data-active=true] .document-editor').evaluate((element,original)=>element.editor.commands.setContent(original),isolationDocument);
  await withBlockHover(page, async () => {
    for(const width of [1440,1424,1423,1280,1279,1025,1024,768,705,704]) {
      await page.setViewportSize({width,height:1000});
      for(const collapsed of [false,true]) {
        if(collapsed) await page.getByRole('button',{name:'Collapse sidebar',exact:true}).click();
        await page.mouse.move(width-2,2);
        await page.evaluate(()=>{window.scrollTo(0,0);document.activeElement?.blur();});
        const rest=await page.locator('.block-controls').evaluateAll(nodes=>nodes.map(n=>({opacity:getComputedStyle(n).opacity,pointer:getComputedStyle(n).pointerEvents})));
        if(!rest.length || rest.some(n=>n.opacity!=='0'||n.pointer!=='none')) throw Error('Rest gutter must be invisible and inert');
        const paragraph=page.locator('[data-document-tab][data-active=true] .document-editor > .paragraph').first();
        const before=(await paragraph.boundingBox()).x;
        await paragraph.hover();
        const extent=page.getByTestId('block-hover-outline');
        await extent.waitFor();
        const contentExtent=await extent.boundingBox();
        const controls=page.locator('.block-controls.visible').first();
        for(const button of await controls.getByRole('button').all()) {
          await button.hover();
          if(!await extent.isVisible()||JSON.stringify(await extent.boundingBox())!==JSON.stringify(contentExtent))
            throw Error(`Gutter hover changed extent at ${width}px (collapsed=${collapsed})`);
        }
        const controlsBox=await controls.boundingBox();
        if(controlsBox.x+controlsBox.width>=contentExtent.x)throw Error('Expanded extent covers the gutter');
        if(await controls.evaluate(n=>getComputedStyle(n).opacity)!=='1') throw Error('Gutter disappears between block and button');
        const after=(await paragraph.boundingBox()).x;
        const headerOverlap=await page.locator('.top-bar').evaluate(header=>{
          const controls=[...header.querySelectorAll('button,.status')].map(n=>({name:n.getAttribute('aria-label')||n.textContent.trim(),r:n.getBoundingClientRect()})).filter(({r})=>r.width>0&&r.height>0);
          return controls.flatMap((a,i)=>controls.slice(i+1).filter(b=>Math.min(a.r.right,b.r.right)-Math.max(a.r.left,b.r.left)>0.5&&Math.min(a.r.bottom,b.r.bottom)-Math.max(a.r.top,b.r.top)>0.5).map(b=>`${a.name} / ${b.name}`));
        });
        if(headerOverlap.length)throw Error(`TopBar controls overlap at ${width}px: ${headerOverlap.join(', ')}`);
        const result=await page.evaluate(({collapsed,width})=>{
          const required=s=>{const n=document.querySelector(s);if(!n)throw Error(`Missing required ${s}`);return n;};
          const rect=s=>required(s).getBoundingClientRect();
          const main=rect('.app-main'),column=rect('.document-column'),doc=rect('[data-document-tab][data-active=true] .document-editor');
          const selectors=['.heading','.paragraph','.table-block','.figure','.equation','.admonition'];
          const starts=selectors.map(s=>rect('[data-document-tab][data-active=true] .document-editor '+s).left);
          const controls=rect('.block-controls.visible');
          const standard=rect('[data-testid="save"]').height;
          const compactSelectors=['.sidebar-header button','.top-bar-document-settings','[data-document-tab][data-active=true] .figure-edit','[data-document-tab][data-active=true] .equation-edit',...(collapsed?[]:['.sidebar-folder-actions button'])];
          const compact=compactSelectors.flatMap(selector=>{
            const nodes=[...document.querySelectorAll(selector)];
            if(!nodes.length)throw Error(`Missing compact control: ${selector}`);
            return nodes.map(n=>n.getBoundingClientRect().height);
          });
          for(const button of document.querySelectorAll('[data-document-tab][data-active=true] .figure-edit,[data-document-tab][data-active=true] .equation-edit')) {
            if(getComputedStyle(button).fontFamily!==getComputedStyle(document.body).fontFamily)throw Error('Document font leaked into UI control');
          }
          // Every sidebar icon is 16px; top-level tree entries share one icon start and one text start.
          const icons=collapsed?null:[...document.querySelectorAll('.sidebar-folder-name svg,.sidebar-tree-item svg')].map(n=>n.getBoundingClientRect());
          const rowIcons=collapsed?null:[...document.querySelectorAll('.sidebar-tree-item[aria-level="1"] .sidebar-tree-icon')].map(n=>n.getBoundingClientRect().x);
          if(icons&&icons.length<2)throw Error('Missing expanded sidebar icons');
          const labels=collapsed?null:[...document.querySelectorAll('.sidebar-tree-item[aria-level="1"] .sidebar-tree-name')].map(n=>{
            if(!n.textContent.trim())throw Error('Missing sidebar label');
            return n.getBoundingClientRect().left;
          });
          // Expanded widths are adjustable values; the collapsed rail is fixed.
          const token=name=>{const v=getComputedStyle(document.documentElement).getPropertyValue(name).trim();if(!v.endsWith('rem'))throw Error(`Unexpected ${name}: ${v}`);return parseFloat(v)*parseFloat(getComputedStyle(document.documentElement).fontSize);};
          const sidebarWidth=rect('.sidebar').width;
          const expectedSidebar=collapsed?token('--layout-sidebar-rail-width'):token(innerWidth<=1024?'--layout-sidebar-width-narrow':'--layout-sidebar-width');
          // The document panel starts open (docked) from the 1424px docking width and closed below it,
          // independently of the 1024px narrow sidebar.
          const panel=document.querySelector('.document-panel')?.getBoundingClientRect();
          const panelWidth=panel?Math.min(panel.right,innerWidth+1)-panel.left:0;
          const expectedPanel=innerWidth<1424?0:token('--layout-document-panel-width');
          const type=s=>{const cs=getComputedStyle(required(s));return {size:parseFloat(cs.fontSize),line:parseFloat(cs.lineHeight),weight:cs.fontWeight,font:cs.fontFamily};};
          const headings=[1,2,3,4,5,6].map(n=>type('h'+n+'.heading'));
          // The table wrapper also owns the editable caption; measure the rendered cell content.
          const body=type('.paragraph'),caption=type('.caption'),table=type('.table [data-table-cell]');
          const expectedType=(size,line,weight='--font-weight-document-heading')=>{
            const probe=document.createElement('span');
            probe.style.fontSize=`var(${size})`;probe.style.lineHeight=`var(${line})`;probe.style.fontWeight=`var(${weight})`;
            document.body.append(probe);
            const s=getComputedStyle(probe), value={size:parseFloat(s.fontSize),line:parseFloat(s.lineHeight),weight:s.fontWeight};
            probe.remove();return value;
          };
          const expectedTypeValues={body:expectedType('--font-size-document','--line-height-document'),
            headings:[1,2,3,4,5,6].map(n=>expectedType(`--font-size-document-h${n}`,'--line-height-document-heading')),
            caption:expectedType('--font-size-document-caption','--line-height-document-caption'),
            table:expectedType('--font-size-document-table','--line-height-document-table')};
          const fontProbe=document.createElement('span');
          fontProbe.style.fontFamily='var(--font-family-document)';document.body.append(fontProbe);
          const documentFont=getComputedStyle(fontProbe).fontFamily;
          fontProbe.style.fontFamily='var(--font-family-sans)';
          const uiFont=getComputedStyle(fontProbe).fontFamily;fontProbe.remove();
          if([body,...headings].some(t=>t.font!==documentFont)||
            [caption,table].some(t=>t.font!==uiFont)||getComputedStyle(document.body).fontFamily!==uiFont)
            throw Error('Document/UI font must follow its own token');
          const shellOverflow=['.app-shell','.sidebar','.app-main','.top-bar','.document-column','[data-document-tab][data-active=true] .document','[data-document-tab][data-active=true] .document-editor','.figure','.equation','.table-block'].filter(s=>{const r=rect(s);return r.left<0||r.right>innerWidth+1;});
          const center=rect('.command-center-trigger'), actions=rect('.top-bar-actions');
          return {width,collapsed,header:rect('.top-bar').height,headerWidth:main.width,commandCenterDelta:Math.abs(center.left+center.width/2-(main.left+main.width/2)),centerBottom:center.bottom,actionsTop:actions.top,sidebarHeader:rect('.sidebar-header').height,centerDelta:Math.abs(main.left+main.width/2-column.left-column.width/2),blockDelta:Math.max(...starts)-Math.min(...starts),gutterGap:doc.left-controls.right,standard,compact,icons:icons?.map(r=>({x:r.x,w:r.width,h:r.height}))??null,rowIcons,labels,sidebarWidth,expectedSidebar,panelWidth,expectedPanel,body,headings,caption,table,expectedTypeValues,shellOverflow};
        },{collapsed,width});
        const matchesType=(actual,expected)=>Math.abs(actual.size-expected.size)<0.1&&Math.abs(actual.line-expected.line)<0.1;
        const expected=result.expectedTypeValues;
        const fail=result.centerDelta>1||result.blockDelta>1||result.gutterGap<11||Math.abs(before-after)>0.5||result.standard!==32||result.compact.some(h=>h!==28)||result.shellOverflow.length||!matchesType(result.body,expected.body)||result.headings.some((t,i)=>!matchesType(t,expected.headings[i])||t.weight!==expected.headings[i].weight)||!matchesType(result.caption,expected.caption)||!matchesType(result.table,expected.table)||Math.abs(result.sidebarWidth-result.expectedSidebar)>0.5||Math.abs(result.panelWidth-result.expectedPanel)>0.5||(!collapsed&&(Math.max(...result.labels)-Math.min(...result.labels)>1||!result.rowIcons.length||Math.max(...result.rowIcons)-Math.min(...result.rowIcons)>1||result.icons.some(i=>i.w!==16||i.h!==16)));
        // The center gets its own row when the header's actual width is below 56rem,
        // independently of how much width the sidebar and outline occupy.
        if(width>=1280&&width<=1424&&result.header!==48)throw Error(`Docking boundary wrapped TopBar: ${JSON.stringify(result)}`);
        if(width>=1279&&Math.abs(await page.locator('.document-column').evaluate(n=>n.getBoundingClientRect().width)-928)>0.5)
          throw Error(`Docking reduced Standard column at ${width}px`);
        const stacked=result.headerWidth<896;
        if(fail||result.sidebarHeader!==48||result.commandCenterDelta>1||(!stacked&&result.header!==48)||
          (stacked&&(result.header<=48||result.actionsTop<result.centerBottom+7)))throw Error(JSON.stringify(result));
        results.push({...result,hoverShift:after-before});
        if(collapsed)await page.getByRole('button',{name:'Expand sidebar',exact:true}).click();
      }
    }
  });
  // On a phone-width viewport the wrapped TopBar keeps every control inside the viewport, in order:
  // left to right within a row, then the next row; 4px apart within a group, 12px between groups.
  // Below 640px the sidebar starts closed without a rail; opened, it covers the whole screen (#321),
  // so the TopBar is measured with the sidebar closed.
  for(const width of [414,375]) {
    await page.setViewportSize({width,height:800});
    if(width===414&&await page.getByRole('button',{name:'Expand sidebar',exact:true}).count()!==1)throw Error('Narrow sidebar did not start collapsed');
    for(const collapsed of [false,true]) {
      if(collapsed) await page.getByRole('button',{name:'Collapse sidebar',exact:true}).click();
      else if(await page.getByRole('button',{name:'Expand sidebar',exact:true}).count()) await page.getByRole('button',{name:'Expand sidebar',exact:true}).click();
      await page.evaluate(()=>window.scrollTo(0,0));
      // Phone widths (#321): closed, no rail and the document has the whole width; open, the sidebar covers the screen.
      const overlay=await page.evaluate(()=>{
        const sidebar=document.querySelector('.sidebar'),r=sidebar.getBoundingClientRect();
        return {display:getComputedStyle(sidebar).display,left:r.left,width:r.width,height:r.height,main:document.querySelector('.app-main').getBoundingClientRect().left,innerWidth,innerHeight};
      });
      if(collapsed?overlay.display!=='none'||overlay.main!==0:Math.abs(overlay.left)>0.5||Math.abs(overlay.width-overlay.innerWidth)>0.5||Math.abs(overlay.height-overlay.innerHeight)>0.5||overlay.main!==0)
        throw Error(`Phone sidebar must be closed beside a full-width document or cover the screen: ${JSON.stringify({collapsed,overlay})}`);
      if(!collapsed){
        if(width===375){
          // Escape inside the full-screen sidebar closes it and focuses the TopBar control that reopens it.
          await page.getByRole('button',{name:'Collapse sidebar',exact:true}).focus();
          await page.keyboard.press('Escape');
          const expand=page.getByRole('button',{name:'Expand sidebar',exact:true});
          if(!await expand.evaluate(n=>n===document.activeElement))throw Error('Escape did not close the full-screen sidebar');
          await expand.click();
          if(!await page.getByRole('button',{name:'Collapse sidebar',exact:true}).evaluate(n=>n===document.activeElement))throw Error('Opening did not move focus into the sidebar');
        }
        continue;
      }
      const narrow=await page.evaluate(()=>{
        // Visual/Source is one segmented control: its track is measured as a single control.
        const views=document.querySelector('.view-toggle');
        if(!views||!['Visual','Source'].every(name=>[...views.querySelectorAll('button')].some(n=>n.textContent.trim()===name)))throw Error('Missing view control');
        const buttons=[views,...[...document.querySelectorAll('.top-bar-actions button')].filter(n=>!views.contains(n))].map(n=>{
          const r=n.getBoundingClientRect();
          return {name:n===views?'Visual/Source':n.getAttribute('aria-label')??n.textContent.trim(),group:n.closest('.top-bar-group')?.getAttribute('aria-label'),left:r.left,right:r.right,top:r.top,bottom:r.bottom};
        });
        if(!['Visual/Source','Outline','Save','File actions'].every(name=>buttons.some(b=>b.name===name)))throw Error('Missing TopBar controls');
        const outside=buttons.filter(b=>b.left<0||b.right>innerWidth+0.5).map(b=>b.name);
        const disorder=[],gaps=[];
        buttons.slice(1).forEach((b,i)=>{
          const a=buttons[i];
          // Controls of different heights share a row when they overlap vertically.
          if(b.top<a.bottom-1&&a.top<b.bottom-1){
            const gap=b.left-a.right;
            if(gap<0)disorder.push(`${a.name}>${b.name}`);
            else if(a.group===b.group?Math.abs(gap-4)>0.5:gap<12-0.5)gaps.push(`${a.name}|${b.name}:${gap}`);
          } else if(b.top<a.bottom-1)disorder.push(`${a.name}>${b.name}`);
        });
        return {width:innerWidth,overflow:document.documentElement.scrollWidth-innerWidth,outside,disorder,gaps};
      });
      if(narrow.overflow>0||narrow.outside.length||narrow.disorder.length||narrow.gaps.length)throw Error(`Narrow TopBar ${collapsed?'collapsed':'expanded'}: ${JSON.stringify(narrow)}`);
      results.push({...narrow,collapsed});
      await page.getByRole('button',{name:'File actions',exact:true}).click();
      const reload=await page.getByRole('menuitem',{name:'Reload',exact:true}).boundingBox();
      if(!reload||reload.x<0||reload.x+reload.width>width||reload.y<0||reload.y+reload.height>800)throw Error('Reload menu leaves the viewport');
      await page.keyboard.press('Escape');
    }
  }
  // Opened below the docking width, the document panel overlays at its own width below the sticky
  // header: the document keeps its width, the page does not scroll sideways, and Save, Reload and the
  // Outline toggle stay uncovered, also when the TopBar wraps. Escape closes it and returns focus.
  const outlineToggle=page.getByRole('button',{name:'Outline',exact:true});
  const shell=async()=>{
    // Viewport changes complete before the next ResizeObserver delivery. Wait for its
    // actual measurement, then assert heading/panel geometry without a retry or reload.
    await page.waitForFunction(()=>parseFloat(getComputedStyle(document.querySelector('.app-shell')).getPropertyValue('--app-header-height'))===document.querySelector('.app-header').offsetHeight);
    return page.evaluate(()=>{
    const rect=s=>{const n=document.querySelector(s);if(!n)throw Error(`Missing required ${s}`);return n.getBoundingClientRect();};
    const measured=parseFloat(getComputedStyle(document.querySelector('.app-shell')).getPropertyValue('--app-header-height'));
    const header=rect('.app-header').height;
    const heading=document.querySelector('[data-document-tab][data-active=true] .heading');
    if(!heading)throw Error('Missing heading for measured-header scroll margin check');
    const gapProbe=document.createElement('span');document.body.append(gapProbe);gapProbe.style.height='var(--space-8)';
    const gap=parseFloat(getComputedStyle(gapProbe).height);gapProbe.remove();
    if(Math.abs(measured-header)>0.5 || Math.abs(parseFloat(getComputedStyle(heading).scrollMarginTop)-header-gap)>0.5)
      throw Error(`Heading scroll margin did not follow the measured header: ${JSON.stringify({measured,header,gap,margin:getComputedStyle(heading).scrollMarginTop})}`);
    const panel=document.querySelector('.document-panel')?.getBoundingClientRect();
    const token=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--layout-document-panel-width'))*parseFloat(getComputedStyle(document.documentElement).fontSize);
    const uncovered=['[data-testid="save"]','.top-bar-actions button[aria-label="File actions"]','.top-bar-actions button[aria-label="Outline"]'].every(s=>{
      const r=rect(s);const hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return document.querySelector(s).contains(hit);
    });
    return {main:rect('.app-main').width,column:rect('.document-column').width,panelLeft:panel?.left??null,panelRight:panel?.right??null,panelTop:panel?.top??null,panelBottom:panel?.bottom??null,headerBottom:rect('.app-header').bottom,uncovered,token,overflow:document.documentElement.scrollWidth>innerWidth};
    });
  };
  for(const width of [1423,1280,1279,1024,768,704]) {
    await page.setViewportSize({width,height:1000});
    await page.locator('.document-panel').waitFor({state:'detached'});
    const closed=await shell();
    await outlineToggle.click();
    await page.getByTestId('outline').waitFor();
    const open=await shell();
    if(open.main!==closed.main||open.column!==closed.column||Math.abs(open.panelRight-width)>0.5||Math.abs(open.panelRight-open.panelLeft-open.token)>0.5||open.overflow||await outlineToggle.getAttribute('aria-pressed')!=='true'||
      Math.abs(open.panelTop-open.headerBottom)>0.5||Math.abs(open.panelBottom-1000)>0.5||!open.uncovered)
      throw Error(`Narrow document panel: ${JSON.stringify({width,closed,open})}`);
    await page.getByTestId('outline').getByRole('button').first().focus();
    await page.keyboard.press('Escape');
    await page.locator('.document-panel').waitFor({state:'detached'});
    if(!await outlineToggle.evaluate(n=>n===document.activeElement)||await outlineToggle.getAttribute('aria-pressed')!=='false')throw Error('Escape did not return focus to the Outline button');
    results.push({panel:{width,closed,open}});
  }
  // Beside a wide document the panel is docked: hiding it widens the area the document centers in.
  await page.setViewportSize({width:1440,height:1000});
  await page.getByTestId('outline').waitFor();
  const docked=await shell();
  const panelHeader=await page.locator('.document-panel-header').evaluate(header=>{
    const row=header.getBoundingClientRect(), title=header.querySelector('h2').getBoundingClientRect();
    return {height:row.height,sidebarHeight:document.querySelector('.sidebar-header').getBoundingClientRect().height,titleCenterDelta:Math.abs(title.top+title.height/2-row.top-row.height/2)};
  });
  if(panelHeader.height!==panelHeader.sidebarHeight||panelHeader.titleCenterDelta>0.5)throw Error(`Outline header alignment: ${JSON.stringify(panelHeader)}`);
  await outlineToggle.click();
  await page.locator('.document-panel').waitFor({state:'detached'});
  const hidden=await shell();
  const hiddenFocus=await outlineToggle.evaluate(n=>n===document.activeElement);
  await outlineToggle.click();
  await page.getByTestId('outline').waitFor();
  if(Math.abs(hidden.main-docked.main-docked.token)>0.5||Math.abs(docked.panelRight-docked.panelLeft-docked.token)>0.5||!hiddenFocus)
    throw Error(`Docked document panel: ${JSON.stringify({docked,hidden,hiddenFocus})}`);
  // Let resize events and React commit before reading an unchanged closed state: that state
  // alone cannot tell whether the overlay transition has happened yet.
  const resizePanel = async width => {
    await page.setViewportSize({width,height:1000});
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  };
  // A docked choice survives both directions; overlay dismissal must not overwrite it.
  {
    await outlineToggle.click();
    await expect(outlineToggle).toHaveAttribute('aria-pressed','false');
    await resizePanel(1423);
    await resizePanel(1424);
    await expect(outlineToggle).toHaveAttribute('aria-pressed','false');
    await outlineToggle.click();
    await resizePanel(1423);
    await expect(outlineToggle).toHaveAttribute('aria-pressed','false');
    await outlineToggle.click();
    await outlineToggle.click();
    await resizePanel(1424);
    await expect(outlineToggle).toHaveAttribute('aria-pressed','true');
  }
  // Session-only: reloading forgets explicit closure and restores the wide default.
  await outlineToggle.click();
  await page.reload();
  await page.getByTestId('outline').waitFor();
  results.push({dockedChoiceSurvivesResize:true,overlayDismissalPreservesDockedChoice:true,reloadRestoresDefault:true});
  // Editing shows the interaction-colored caret, not a frame around the whole document, whether
  // focus comes from a click or the keyboard.
  const editing=async()=>page.locator('[data-document-tab][data-active=true] .document-editor').evaluate(n=>{
    const cs=getComputedStyle(n);
    return {focused:document.activeElement===n,outline:cs.outlineStyle,boxShadow:cs.boxShadow,border:['Top','Right','Bottom','Left'].map(side=>parseFloat(cs['border'+side+'Width'])).reduce((a,b)=>a+b,0),caret:cs.caretColor,interaction:getComputedStyle(document.documentElement).getPropertyValue('--id-color-interaction').trim()};
  });
  const noFrame=state=>state.focused&&state.outline==='none'&&state.boxShadow==='none'&&state.border===0;
  await page.locator('[data-document-tab][data-active=true] .document-editor > .paragraph').first().click();
  const clicked=await editing();
  await page.locator('[data-document-tab][data-active=true] [data-table-cell]').first().click();
  const cell=await editing();
  await page.evaluate(()=>document.activeElement?.blur());
  await page.locator('[data-document-tab][data-active=true] .document-editor').focus();
  await page.keyboard.press('ArrowDown');
  const keyboard=await editing();
  const caretColor=await page.evaluate(color=>{const probe=document.createElement('span');probe.style.color=color;document.body.append(probe);const value=getComputedStyle(probe).color;probe.remove();return value;},clicked.interaction);
  if(![clicked,cell,keyboard].every(noFrame)||clicked.caret!==caretColor)throw Error(`Editing frames the document: ${JSON.stringify({clicked,cell,keyboard,caretColor})}`);
  // Chrome stays put: a status message appearing never moves the top bar controls.
  await page.setViewportSize({width:1440,height:1000});
  const controls=()=>page.locator('.top-bar-actions button').evaluateAll(nodes=>nodes.map(n=>Math.round(n.getBoundingClientRect().x)));
  const clean=await controls();
  await page.locator('[data-document-tab][data-active=true] .document-editor > .paragraph').first().click();
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
    const main=rect('.app-main'),column=rect('.document-column'),doc=rect('[data-document-tab][data-active=true] .document-editor');
    const starts=['.heading','.paragraph','.table-block','.figure','.equation','.admonition'].map(s=>rect('[data-document-tab][data-active=true] .document-editor '+s).left);
    const probe=document.createElement('div');
    probe.style.width=getComputedStyle(document.documentElement).getPropertyValue('--layout-content-width-wide');
    document.body.append(probe);const wide=probe.getBoundingClientRect().width;probe.remove();
    return {width:column.width,available:main.width,wide,centerDelta:Math.abs(main.left+main.width/2-column.left-column.width/2),blockDelta:Math.max(...starts)-Math.min(...starts),textInset:doc.left-column.left};
  });
  const toggle=page.getByRole('button',{name:'Wide document',exact:true});
  const unchanged=()=>page.locator('[data-document-tab][data-active=true] .document-editor').evaluate(n=>JSON.stringify({doc:n.editor.getJSON(),dirty:document.querySelector('[data-testid="status"]').textContent}));
  const beforeWidth=await unchanged();
  const standard=await column();
  const before=await controls();
  await toggle.click();
  const wide=await column();
  const after=await controls();
  if(!(wide.wide>0)||Math.abs(wide.width-Math.min(wide.wide,wide.available))>1||wide.width<=standard.width||wide.centerDelta>1||wide.blockDelta>1||
    Math.abs(wide.textInset-standard.textInset)>0.5||JSON.stringify(before)!==JSON.stringify(after)||await toggle.getAttribute('aria-pressed')!=='true'||await unchanged()!==beforeWidth)
    throw Error(`Wide document layout: ${JSON.stringify({standard,wide,before,after})}`);
  await page.reload();
  await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
  const remembered=await toggle.getAttribute('aria-pressed')==='true'&&await page.locator('.app-shell--wide').count()===1;
  await toggle.click();
  if(!remembered||await page.locator('.app-shell--wide').count()!==0)throw Error('Wide document preference was not remembered or cleared');
  results.push({wide:{standard:standard.width,wide:wide.width}});
  // The settings dialog fits the viewport independently of Sidebar width/state.
  for(const width of [1920,1440,1280,1024,768,390,375]) {
    await page.setViewportSize({width,height:800});
    await page.getByTestId('document-panel').waitFor({state:width>=1424?'visible':'detached'});
    const opener=page.getByRole('button',{name:'Document settings',exact:true});
    await opener.click();
    const dialog=page.getByRole('dialog',{name:'Document settings',exact:true});
    await dialog.waitFor();
    const bounds=await dialog.evaluate(n=>{
      const r=n.getBoundingClientRect();
      return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,overflow:n.scrollWidth>n.clientWidth,
        controls:[...n.querySelectorAll('input,select,button')].map(c=>{const b=c.getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,bottom:b.bottom};})};
    });
    if(bounds.left<0||bounds.right>width||bounds.top<0||bounds.bottom>800||bounds.overflow||!bounds.controls.length||bounds.controls.some(c=>c.left<bounds.left||c.right>bounds.right||c.top<bounds.top||c.bottom>bounds.bottom))
      throw Error(`Document settings leaves viewport: ${JSON.stringify({width,bounds})}`);
    await page.keyboard.press('Escape'); await dialog.waitFor({state:'detached'});
    if(!await opener.evaluate(n=>n===document.activeElement))throw Error('Settings did not restore opener focus');
    if(await page.getByTestId('sidebar').locator('.sidebar-tools').count())throw Error('Sidebar still switches tools');
  }
  // Preserve #552's one-row shell while the centered command button yields to the new toggle.
  const headerMatrix=[];
  await page.setViewportSize({width:1920,height:900});
  for(const lang of ['en','ko']) {
    await language(lang);
    for(const width of [1440,1424,1423,1280]) {
      await page.setViewportSize({width,height:900});
      for(const collapsed of [false,true]) {
        const sidebarCollapsed=await page.locator('.sidebar--collapsed').count()>0;
        if(sidebarCollapsed!==collapsed)await page.getByRole('button',{name:lang==='ko'?(collapsed?'사이드바 접기':'사이드바 펼치기'):(collapsed?'Collapse sidebar':'Expand sidebar'),exact:true}).click();
        for(const panel of [true,false]) {
          const outline=page.getByRole('button',{name:lang==='ko'?'개요':'Outline',exact:true});
          if((await outline.getAttribute('aria-pressed')==='true')!==panel)await outline.click();
          await page.getByTestId('document-panel').waitFor({state:panel?'visible':'detached'});
          // ResizeObserver commits the responsive details before the measured paint.
          await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
          const geometry=await page.locator('.top-bar').evaluate(header=>{
            const box=header.getBoundingClientRect(),center=header.querySelector('.command-center-trigger'),r=center.getBoundingClientRect();
            const controls=[...header.querySelectorAll('button,.status')].map(n=>({name:n.getAttribute('aria-label')||n.textContent.trim(),r:n.getBoundingClientRect()})).filter(({r})=>r.width>0&&r.height>0);
            const overlap=controls.flatMap((a,i)=>controls.slice(i+1).filter(b=>Math.min(a.r.right,b.r.right)-Math.max(a.r.left,b.r.left)>0.5&&Math.min(a.r.bottom,b.r.bottom)-Math.max(a.r.top,b.r.top)>0.5).map(b=>`${a.name}/${b.name}`));
            const name=center.querySelector('.command-center-action'),shortcut=center.querySelector('kbd');
            const locationShown=getComputedStyle(center.querySelector('.document-path')).display!=='none';
            const shortcutShown=getComputedStyle(shortcut).display!=='none'&&getComputedStyle(shortcut).visibility!=='hidden';
            return {height:box.height,width:box.width,centerWidth:r.width,centerDelta:Math.abs(r.left+r.width/2-box.left-box.width/2),overlap,
              outside:controls.filter(({r})=>r.left<box.left||r.right>box.right||r.top<box.top||r.bottom>box.bottom).map(({name})=>name),
              locationShown,shortcutShown,actionClipped:name.scrollWidth>name.clientWidth+1,
              wideVisible:[...header.querySelectorAll('.top-bar-toggle')].every(n=>n.getBoundingClientRect().width===28)};
          });
          if(geometry.height!==48||geometry.centerWidth<160||geometry.centerDelta>1||geometry.overlap.length||geometry.outside.length||!geometry.wideVisible||
            (geometry.actionClipped&&(geometry.locationShown||geometry.shortcutShown))||(!geometry.shortcutShown&&geometry.locationShown))
            throw Error(`Responsive TopBar: ${JSON.stringify({lang,width,collapsed,panel,geometry})}`);
          headerMatrix.push({lang,width,collapsed,panel,centerWidth:geometry.centerWidth});
        }
      }
    }
  }
  await language('en');
  results.push({headerMatrix});
  return results;
}
