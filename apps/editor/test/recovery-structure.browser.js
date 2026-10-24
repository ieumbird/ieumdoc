async (page, { openDocument, reloadDocument, screenshots }) => {
  page.setDefaultTimeout(15000);
  if (screenshots) await page.setViewportSize({width:1280,height:1000});
  await page.unrouteAll();
  const origin = page.url().split('/').slice(0,3).join('/');
  const loaded = await (await page.request.get(`${origin}/api/document`)).json();
  const sep = loaded.path.includes('\\') ? '\\' : '/';
  const folder = [...loaded.path.split(sep).slice(0, -4), 'tmp', 'new-document'].join(sep);
  const check = (ok, reason) => { if (!ok) throw Error(reason); };
  const engine = page.locator('[data-document-tab][data-active=true] .document-editor');
  await page.getByRole('button', {name:'Open folder…', exact:true}).click();
  await page.getByTestId('folder-path').fill(folder);
  await page.getByTestId('folder-open').click();
  await page.getByRole('dialog').waitFor({state:'detached'});
  await page.getByRole('button', {name:'New file in folder', exact:true}).click();
  await page.getByTestId('new-file-name').fill(`recovery-${Date.now()}`);
  await page.getByRole('dialog').getByRole('button', {name:'Create', exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'detached'});
  await page.keyboard.type('Opening paragraph');
  await page.locator('[data-document-tab][data-active=true]').getByRole('button',{name:'Add a title',exact:true}).click();
  await page.keyboard.type('Recovery paper');
  // Real Enter in the title creates an engine paragraph with default attrs before normalization.
  await page.keyboard.press('Enter');
  await page.keyboard.type('New paragraph');
  await engine.evaluate(async node => {
    const {insertEquationAfter,insertTableAfter,insertFigureAfter} = await import('/src/block-commands.ts');
    const editor = node.editor;
    for (const insert of [insertEquationAfter,insertTableAfter,insertFigureAfter]) editor.view.dispatch(insert(editor.state, editor.state.doc.childCount-1));
    const tr = editor.state.tr;
    editor.state.doc.forEach((child,pos) => {
      if (child.type.name === 'equation') tr.setNodeMarkup(pos,undefined,{...child.attrs,latex:'x^2 + y^2 = z^2'});
      if (child.type.name === 'table') tr.setNodeMarkup(pos,undefined,{...child.attrs,caption:[{kind:'text',text:'Measured results'}]});
    });
    const inputs = [];
    editor.state.doc.descendants((child,pos) => {
      if (child.type.name === 'tableCell') inputs.push({pos:pos+1,text:`Cell ${inputs.length+1}`});
      if (child.type.name === 'figure') inputs.push({pos:pos+1,text:'Pending figure caption'});
    });
    inputs.reverse().forEach(({pos,text})=>tr.insertText(text,pos));
    editor.view.dispatch(tr);
  });
  const file = await page.getByTestId('current-file').getAttribute('title');
  const records = () => page.evaluate(async () => (await import('/src/recovery-storage.ts')).recoveryStorage.list());
  let record;
  for (let attempt=0;attempt<100;attempt++) {
    record = (await records()).find(r=>r.path===file);
    if (record?.snapshot.editor.editorDocument.content.some(n=>n.type==='figure')) break;
    await page.waitForTimeout(50);
  }
  check(record, 'Applied draft was not recorded');
  const before = await engine.evaluate(n=>n.editor.getJSON());
  page.on('dialog',dialog=>dialog.accept());
  await page.reload();
  await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
  // The clean startup tab is restored; the dirty New document offers recovery first.
  await page.getByTestId('recovery-prompt').waitFor({state:'visible'});
  check(await page.getByRole('button',{name:'Restore work',exact:true}).isEnabled(), `Generated record refused: ${await page.getByTestId('recovery-prompt').innerText()}; deleted=${JSON.stringify(record.snapshot.editor.editorDocument.attrs.deletedPaths)}`);
  if (screenshots) {
    await page.evaluate(()=>document.fonts.ready);
    await page.screenshot({path:'tmp/331-recovery-prompt.png'});
  }
  await page.getByRole('button',{name:'Restore work',exact:true}).click();
  await page.getByTestId('recovery-prompt').waitFor({state:'detached'});
  check(JSON.stringify(await engine.evaluate(n=>n.editor.getJSON()))===JSON.stringify(before),'Restore changed structured engine content');
  check((await page.getByTestId('status').innerText()).includes('Unsaved changes'),'Restore acknowledged unsaved content');
  await page.getByTestId('save').click();
  await page.locator('[data-testid="status"][data-operation^="save"]').waitFor({state:'attached'});
  check(await page.getByTestId('status').getAttribute('data-operation')==='saved', await page.locator('body').innerText());
  const saved = await (await page.request.get(`${origin}/api/document?path=${encodeURIComponent(file)}`)).json();
  check(saved.document.blocks.some(b=>b.block==='heading') && saved.document.blocks.some(b=>b.block==='equation') && saved.document.blocks.some(b=>b.block==='table') && saved.document.blocks.some(b=>b.block==='figure'),'Save lost a structured block');
  for (const text of ['Recovery paper','New paragraph','Opening paragraph','x^2 + y^2 = z^2','Cell 1','Measured results','Pending figure caption']) check(saved.source.includes(text),`Save lost ${text}`);
  await reloadDocument(page);
  await engine.getByText('Recovery paper',{exact:true}).waitFor();
  const again = await (await page.request.get(`${origin}/api/document?path=${encodeURIComponent(file)}`)).json();
  check(saved.source===again.source,'Reload changed canonical source');
  // Refuse a different invalid path, retain readable fallback, and translate an already open dialog.
  await page.evaluate(async record => {
    const {recoveryStorage:store}=await import('/src/recovery-storage.ts');
    record.id='invalid-path';
    record.snapshot.editor.editorDocument.attrs.deletedPaths=['999'];
    await store.write(record.id,await store.ticket(record.id),()=>record);
  },record);
  await page.reload();
  await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
  await page.getByText('Incompatible editor snapshot: Invalid editor deletion metadata',{exact:true}).waitFor();
  check(await page.getByRole('button',{name:'Restore work',exact:true}).isDisabled(),'Unknown deletion was accepted');
  await page.getByText('Plaintext recovery copy',{exact:true}).click();
  const fallback = await page.getByRole('textbox',{name:'Plaintext recovery copy'}).inputValue();
  if (screenshots) {
    // Capture-only enlargement exposes math, table cells and captions together.
    // This does not change the product stylesheet or the stored recovery text.
    await page.getByRole('textbox',{name:'Plaintext recovery copy'}).evaluate(element=>{
      element.style.height='420px';
      element.scrollTop=0;
    });
    await page.evaluate(()=>document.fonts.ready);
    await page.screenshot({path:'tmp/331-after-fallback-en.png'});
  }
  for (const text of ['Recovery paper','x^2 + y^2 = z^2','Cell 1','Measured results','Pending figure caption']) check(fallback.includes(text),`Fallback lost ${text}`);
  check(!/\[(level|latex|caption|marks):/.test(fallback),'Fallback leaked internal attributes');
  await page.evaluate(async()=> (await import('/src/i18n.ts')).i18n.changeLanguage('ko'));
  await page.getByText('호환되지 않는 편집기 기록: 편집기 삭제 기록이 올바르지 않습니다',{exact:true}).waitFor();
  check(await page.getByRole('button',{name:'작업 복구',exact:true}).isDisabled(),'Language change changed restore permission');
  if (screenshots) await page.screenshot({path:'tmp/331-after-fallback-ko.png'});
  await page.evaluate(async()=> (await import('/src/i18n.ts')).i18n.changeLanguage('en'));
  await page.getByText('Incompatible editor snapshot: Invalid editor deletion metadata',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Delete record',exact:true}).click();
  return {created:true, structuredRestore:true, dirty:true, saveReload:true, invalidRefused:true, readableFallback:true, openDialogLanguage:true};
}
