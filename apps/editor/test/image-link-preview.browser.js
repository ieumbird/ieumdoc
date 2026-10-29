// A reading overlay must not mutate the editor or request remote destinations.
async (page, {openPath, activeDocument, expect, screenshots}) => {
  const origin = page.url().split('/').slice(0,3).join('/');
  const loaded = await (await page.request.get(`${origin}/api/document`)).json();
  const sep = loaded.path.includes('\\') ? '\\' : '/';
  const file = [...loaded.path.split(sep).slice(0,-4),'tmp','image-link-preview','links.md'].join(sep);
  await openPath(page, file);
  const surface = activeDocument(page);
  const editor = surface.locator('.ProseMirror');
  const preview = surface.getByTestId('image-link-preview');
  const link = name => surface.getByRole('link', {name, exact:true});
  const hover = async name => { await page.mouse.move(0,0); await link(name).hover(); };
  const state = () => editor.evaluate(dom => ({json:dom.editor.getJSON(), selection:dom.editor.state.selection.toJSON()}));
  const initial = await state();
  const pagesBefore = page.context().pages().length;
  const imageReady = async () => {
    await expect(preview).toBeVisible();
    await expect.poll(() => preview.locator('img').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
    const src = await preview.locator('img').getAttribute('src');
    if (!src.startsWith('/document/diagram.svg?path=') || !src.includes(encodeURIComponent(file))) throw new Error(`Wrong Host source: ${src}`);
  };
  const bounds = async () => {
    const geometry = await preview.evaluate(node => {
      const popup = node.getBoundingClientRect();
      const viewport = node.closest('.document-scroll').getBoundingClientRect();
      const header = document.querySelector('.app-header').getBoundingClientRect();
      return {popup:popup.toJSON(), viewport:viewport.toJSON(), header:header.bottom};
    });
    const {popup:p, viewport:v, header} = geometry;
    if (p.left < v.left || p.right > v.right || p.top < Math.max(v.top,header) || p.bottom > v.bottom || p.width > 320.1 || p.height > 260) {
      throw new Error(`Preview escapes viewport: ${JSON.stringify(geometry)}`);
    }
  };
  for (const width of [1440,640]) {
    await page.setViewportSize({width,height:900});
    await page.evaluate(()=>document.fonts.ready);
    await hover('Local diagram');
    await imageReady(); await bounds();
    if (screenshots) await page.screenshot({path:`tmp/image-link-preview-evidence/after-${width}.png`});
    await page.mouse.move(0,0);
    await expect(preview).toHaveCount(0);
  }
  expect(await state()).toEqual(initial);
  await hover('Local diagram'); await imageReady();
  await page.keyboard.press('Escape');
  await expect(preview).toHaveCount(0);
  // Native keyboard focus, including Tab traversal, without changing document selection.
  await link('Local diagram').focus();
  await imageReady();
  await expect(link('Local diagram')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(preview).toHaveCount(0);
  expect(page.url().startsWith(origin)).toBe(true);
  await page.keyboard.press('Tab');
  await expect(link('Missing image')).toBeFocused();
  await expect(preview).toHaveText('Image not found');
  await hover('Broken image');
  await expect(preview).toHaveText('Image not found');
  await page.mouse.move(0,0);
  await expect(preview).toHaveCount(0);
  for (const name of ['Quote diagram','List diagram','Cell diagram','Endnote diagram']) {
    await hover(name); await imageReady(); await bounds();
    await page.mouse.move(0,0); await expect(preview).toHaveCount(0);
  }
  const note = surface.locator('[data-block="footnote"]');
  expect(await note.getAttribute('aria-readonly')).toBe('true');
  await expect(note.getByRole('button',{name:'Apply',exact:true})).toHaveCount(0);
  await link('Endnote diagram').focus(); await imageReady();
  expect(await state()).toEqual(initial);
  // No external request or Host media lookup for remote image links, even on focus.
  const requests = [];
  const observe = request => { if (/example.invalid|\/document\//.test(request.url())) requests.push(request.url()); };
  page.on('request',observe);
  await hover('Remote image');
  await link('Remote image').focus();
  await page.evaluate(()=>new Promise(requestAnimationFrame));
  await expect(preview).toHaveCount(0);
  expect(requests).toEqual([]);
  page.off('request',observe);
  // Modified clicks keep the existing relative-link behavior.
  await link('Local diagram').click({modifiers:['Control']});
  await expect(preview).toHaveCount(0);
  expect(page.url().startsWith(origin)).toBe(true);
  expect(page.context().pages()).toHaveLength(pagesBefore);
  // Editing and composition dismiss the reading aid without intercepting text input.
  await editor.evaluate(dom => { dom.editor.view.focus(); dom.editor.commands.setTextSelection(2); });
  await hover('Local diagram'); await imageReady();
  await page.keyboard.type('X');
  await expect(preview).toHaveCount(0);
  await expect(editor).toContainText('X');
  await editor.evaluate(dom => dom.editor.commands.undo());
  await hover('Local diagram'); await imageReady();
  await editor.dispatchEvent('compositionstart');
  await expect(preview).toHaveCount(0);
  await hover('Endnote diagram');
  await expect(preview).toHaveCount(0);
  await editor.dispatchEvent('compositionend');
  // Make actual scrolling possible without changing the captured fixture state.
  await editor.evaluate(dom => dom.editor.commands.insertContentAt(dom.editor.state.doc.content.size,
    Array.from({length:25},()=>({type:'paragraph',content:[{type:'text',text:'Reading context.'}]}))));
  await hover('Local diagram'); await imageReady();
  const top = (await preview.boundingBox()).y;
  await surface.evaluate(node => node.closest('.document-scroll').scrollBy(0,24));
  await expect.poll(async () => (await preview.boundingBox())?.y).not.toBe(top);
  await bounds();
  await surface.evaluate(node => node.closest('.document-scroll').scrollTo(0,1000));
  await expect(preview).toHaveCount(0);
  // Both groups have their own viewport; the overlay may not cover the other document.
  await page.setViewportSize({width:1440,height:900});
  const id = await surface.getAttribute('data-document-tab');
  await page.locator(`#tab-${id}`).click({button:'right'});
  await page.getByRole('menuitem',{name:'Open to the right',exact:true}).click();
  await expect(page.locator('[data-editor-group]')).toHaveCount(2);
  // The same document/DOM identity moved to its group; use its stable tab id.
  const moved = page.locator(`[data-document-tab="${id}"]`);
  const movedPreview = moved.getByTestId('image-link-preview');
  for (const width of [1440,640]) {
    await page.setViewportSize({width,height:900});
    await page.mouse.move(0,0);
    await moved.getByRole('link',{name:'Local diagram',exact:true}).hover();
    await expect(movedPreview.locator('img')).toBeVisible();
    await expect.poll(() => movedPreview.evaluate(node => {
      const r=node.getBoundingClientRect(), v=node.closest('.document-scroll').getBoundingClientRect();
      return r.left>=v.left && r.right<=v.right && r.top>=v.top && r.bottom<=v.bottom;
    })).toBe(true);
  }
  return {hover:true,focus:true,endnote:true,remoteRequests:requests.length,missing:true,broken:true,scroll:true,split:true};
}
