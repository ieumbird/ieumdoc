// Actual folder/media Host requests; document state remains owned by the same editor instance.
async (page, { openDocument, screenshots }) => {
  page.setDefaultTimeout(10000);
  const longDialogFailures = [];
  const longDialogLayouts = [];
  const check = (ok, message) => { if (!ok) throw Error(message); };
  const origin = page.url().split('/').slice(0,3).join('/');
  const initial = await (await page.request.get(origin + '/api/document')).json();
  const sep = initial.path.includes('\\') ? '\\' : '/';
  const root = [...initial.path.split(sep).slice(0, -4), 'tmp', 'file-preview'].join(sep);
  await openDocument(page, root + sep + 'document.md');
  await page.getByTestId('current-file').filter({hasText:'document.md'}).waitFor();
  const row = name => page.getByTestId('sidebar').getByRole('treeitem', { name, exact: true });
  const clickRow = name => row(name).click({position:{x:8,y:14}});
  const dialog = () => page.locator('[data-slot="dialog-content"]');
  const editor = page.locator('[data-document-tab][data-active=true] .document-editor');
  const snapshot = () => editor.evaluate(el => ({ json: JSON.stringify(el.editor.getJSON()), selection: el.editor.state.selection.toJSON(), undo: el.editor.can().undo() }));
  let documentReads = 0, writes = 0, leaks = 0;
  page.on('request', request => {
    if (request.url().includes('/api/document?')) documentReads++;
    if (['PUT','POST','DELETE'].includes(request.method())) writes++;
    if (request.url().includes('preview-leak') || request.url().includes('svg11.dtd')) leaks++;
  });
  for (const name of ['archive.zip', 'README', 'notes.txt']) {
    await row(name).focus(); await row(name).press('Enter');
    await dialog().getByText('This file cannot be edited in IeumDoc.', {exact:true}).waitFor();
    await page.keyboard.press('Escape');
    await dialog().waitFor({state:'detached'});
    check(await row(name).evaluate(el => document.activeElement === el), 'Other-file close must return to its row');
  }
  await editor.locator('p').filter({hasText:'Alpha.'}).click();
  await page.keyboard.press('End'); await page.keyboard.type(' Dirty.');
  await editor.locator('h2').hover();
  await page.getByTestId('label-target-edit').filter({visible:true}).click();
  const draft = page.getByTestId('label-target-input');
  await draft.fill('section-draft');
  const before = await snapshot();
  for (const name of ['diagram.svg', 'photo.PNG', 'doctype.svg', 'active.svg']) {
    await clickRow(name);
    await dialog().getByRole('img', {name,exact:true}).waitFor();
    if (name === 'doctype.svg') {
      check(await dialog().getByRole('img').evaluate(img => img.naturalWidth === 20 && img.naturalHeight === 20), 'DOCTYPE SVG did not decode');
      if (screenshots) await page.screenshot({path:'tmp/file-preview-capture/doctype.png'});
    }
    await page.keyboard.press('Control+s');
    await dialog().getByRole('button', {name:'Close',exact:true}).click();
    await dialog().waitFor({state:'detached'});
    check(await row(name).evaluate(el => document.activeElement === el), 'Image close must return to its row');
    check(JSON.stringify(await snapshot()) === JSON.stringify(before), 'Preview changed document, selection or undo');
    check(await draft.inputValue() === 'section-draft', 'Preview lost the unapplied draft');
    check((await page.getByTestId('status').innerText()).includes('Unsaved'), 'Dirty/draft status was lost');
  }
  check(documentReads === 0 && writes === 0, 'File preview must never open/save a document or choose/copy an image');
  check(leaks === 0 && !(await page.evaluate(() => window.__previewExecuted)), 'SVG executed or requested an external resource');
  const direct = await page.context().newPage();
  try {
    await direct.goto(`${page.url().split('/').slice(0,3).join('/')}/api/file-preview?root=${encodeURIComponent(root)}&path=${encodeURIComponent(root + sep + 'active.svg')}`);
    check(!(await direct.evaluate(() => window.__previewExecuted)), 'Direct SVG navigation executed script');
  } finally { await direct.close(); }
  for (const width of [1440, 375]) {
    await page.setViewportSize({width, height:900});
    if (width === 375) await page.getByRole('button',{name:'Expand sidebar',exact:true}).click();
    await clickRow('diagram.svg');
    await dialog().getByRole('img').waitFor();
    const box = await dialog().boundingBox();
    check(box.x >= 0 && box.x + box.width <= width && box.y >= 0 && box.y + box.height <= 900, 'Preview exceeds viewport');
    if (screenshots) await page.screenshot({path:`tmp/file-preview-capture/image-${width}.png`});
    await page.keyboard.press('Escape'); await dialog().waitFor({state:'detached'});
    await clickRow('archive.zip');
    if (screenshots) await page.screenshot({path:`tmp/file-preview-capture/file-${width}.png`});
    await page.keyboard.press('Escape'); await dialog().waitFor({state:'detached'});
  }
  await clickRow('긴파일이름' + 'unbrokenfilename'.repeat(8) + '.zip');
  await measureLongDialog('preview', dialog());
  await page.keyboard.press('Escape'); await dialog().waitFor({state:'detached'});
  check(!longDialogFailures.length, `Long preview overflow: ${JSON.stringify(longDialogLayouts)}`);
  await page.setViewportSize({width:1440,height:900});
  // A damaged/failed response stays inside the modal; closing before a late load never reopens it.
  let release, finish;
  const gate = new Promise(resolve => { release = resolve; });
  const finished = new Promise(resolve => { finish = resolve; });
  const delayed = async route => { await gate; try { await route.fulfill({status:200, contentType:'image/png', body:'invalid image'}); } finally { finish(); } };
  await page.route('**/api/file-preview?*', delayed);
  await clickRow('delayed.png');
  await dialog().getByRole('status').waitFor();
  await page.keyboard.press('Escape'); await dialog().waitFor({state:'detached'});
  release(); await finished; await page.unroute('**/api/file-preview?*', delayed);
  await clickRow('README');
  await dialog().getByText('This file cannot be edited in IeumDoc.',{exact:true}).waitFor();
  await page.keyboard.press('Escape'); await dialog().waitFor({state:'detached'});
  const damaged = route => route.fulfill({status:200, contentType:'image/png', body:'invalid image'});
  await page.route('**/api/file-preview?*', damaged);
  await clickRow('broken.png');
  await dialog().getByRole('alert').waitFor();
  await page.keyboard.press('Escape'); await dialog().waitFor({state:'detached'});
  await page.unroute('**/api/file-preview?*', damaged);
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.getByTestId('ui-language').selectOption('ko');
  await page.keyboard.press('Escape'); await dialog().waitFor({state:'detached'});
  await clickRow('diagram.svg');
  await dialog().getByText('읽기 전용 이미지 미리보기',{exact:true}).waitFor();
  if (screenshots) await page.screenshot({path:'tmp/file-preview-capture/image-ko.png'});
  await page.keyboard.press('Escape'); await dialog().waitFor({state:'detached'});
  await clickRow('README');
  await dialog().getByText('이 파일은 이음독에서 편집할 수 없습니다.',{exact:true}).waitFor();
  await page.keyboard.press('Escape'); await dialog().waitFor({state:'detached'});
  await page.getByRole('button',{name:'설정',exact:true}).click();
  await page.getByTestId('ui-language').selectOption('en');
  await page.keyboard.press('Escape'); await dialog().waitFor({state:'detached'});
  check(JSON.stringify(await snapshot()) === JSON.stringify(before) && await draft.inputValue() === 'section-draft', 'Late/error or translated preview lost editor state');
  return {longDialogLayouts, readOnly:true, dirtyDraftSelectionUndo:true, focus:true, svgIsolation:true, errorLateResponse:true, i18n:true, widths:[1440,375]};
  async function measureLongDialog(name, dialog) {
    await dialog.waitFor();
    for (const width of [1440,375]) {
      await page.setViewportSize({width,height:900});
      await page.evaluate(async () => { await document.fonts.ready; scrollTo(0,0); });
      const layout = await dialog.evaluate(node => {
        const box=node.getBoundingClientRect();
        return {width:node.clientWidth,scroll:node.scrollWidth,dpr:devicePixelRatio,zoom:visualViewport.scale,font:getComputedStyle(node).fontFamily,
          text:[...node.querySelectorAll('[data-slot="dialog-title"], [data-slot="dialog-description"] p, :scope > p')].map(p=>({width:p.clientWidth,scroll:p.scrollWidth})),
          buttons:[...node.querySelectorAll('button')].map(b=>{const r=b.getBoundingClientRect();return {text:b.textContent,inside:r.left>=box.left && r.right<=box.right && r.top>=box.top && r.bottom<=box.bottom};})};
      });
      longDialogLayouts.push({name,viewport:width,...layout});
      if (screenshots) await page.screenshot({path:`tmp/401-${name}-${width}.png`});
      if (layout.scroll>layout.width || layout.text.some(p=>p.scroll>p.width) || !layout.buttons.every(b=>b.inside)) longDialogFailures.push({name,viewport:width,...layout});
      else for (const b of await dialog.getByRole('button').all()) await b.click({trial:true});
    }
    await page.setViewportSize({width:1440,height:900});
  }

}
