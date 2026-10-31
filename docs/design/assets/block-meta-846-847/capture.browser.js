// Temporary same-state evidence through the repository persistent browser runner.
async (page, {openPath}) => {
 const initial=await (await page.request.get(page.url().split('/').slice(0,3).join('/')+'/api/document')).json();
 const sep=initial.path.includes('\\')?'\\':'/';
 const file=[...initial.path.split(sep).slice(0,-4),'tmp','mermaid-authoring','metadata.md'].join(sep);
 await openPath(page,file);
 const active=page.locator('[data-document-tab][data-active=true]');
 const editor=active.locator('.document-editor');
 const mermaid=active.locator('[data-content-kind=mermaid]');
 const table=active.locator('[data-block=table]');
 const results=[];
 for(const [width,language,theme] of [[1440,'en','light'],[640,'ko','dark']]) {
  await page.setViewportSize({width,height:1000});
  await page.evaluate(async({language,theme})=>{ await(await import('/src/i18n.ts')).i18n.changeLanguage(language); (await import('/src/theme.ts')).applyTheme(theme); },{language,theme});
  await page.evaluate(()=>document.fonts.ready);
  await mermaid.locator('[data-testid=mermaid-preview][aria-busy=false] img').waitFor();
  const select=async kind=>editor.evaluate((el,kind)=>{el.editor.state.doc.forEach((n,p)=>{if(n.type.name===kind)el.editor.commands.setNodeSelection(p)});el.editor.view.focus()},kind);
  const face=()=>mermaid.getByTestId('mermaid-kind').evaluate(el=>{const s=getComputedStyle(el);return {font:s.fontSize,color:s.color,bg:s.backgroundColor,border:s.borderColor,rect:el.getBoundingClientRect().toJSON()}});
  await select('equation');await page.mouse.move(0,0);
  const rest=await face();
  const overlap=await active.locator('[data-block=equation]').evaluate((eq,r)=>{const box=eq.getBoundingClientRect(),s=getComputedStyle(eq,'::after');return r.y<box.bottom+parseFloat(getComputedStyle(eq).getPropertyValue('--space-block-hover-block')) && r.y+r.height>box.top},rest.rect);
  await page.screenshot({path:`tmp/meta-evidence/before-${width}-equation.png`});
  await mermaid.getByTestId('mermaid-preview').click(); await page.mouse.move(0,0);
  const selected=await face();
  await table.hover({position:{x:4,y:4}});
  await page.screenshot({path:`tmp/meta-evidence/before-${width}.png`});
  const meta=table.locator('.block-metadata');
  await meta.click();
  const opened=await page.getByTestId('table-editor').count();
  results.push({width,rest,selected,overlap,tableClickOpened:opened>0});
  if(opened) await page.getByTestId('table-label').press('Escape');
 }
 return results;
}
