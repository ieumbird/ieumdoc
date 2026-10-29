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
  // Real pointer editing, compared with an ordinary link. Never repair focus or
  // selection through the engine before input: that concealed the tabindex regression.
  await hover('Missing image');
  await expect(preview).toHaveText('Image not found');
  await page.mouse.move(0,0);
  const settledSelection = async () => {
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    return editor.evaluate(dom => {
      const {selection,doc} = dom.editor.state;
      const native = getSelection();
      const anchor = native?.anchorNode;
      const element = anchor?.nodeType === Node.ELEMENT_NODE ? anchor : anchor?.parentElement;
      return {empty:selection.empty, href:selection.$from.marks().find(mark=>mark.type.name==='link')?.attrs.href,
        domHref:element?.closest('a')?.getAttribute('href'), focused:dom.editor.view.hasFocus(),
        text:doc.textBetween(selection.from,selection.to), domText:native?.toString(), from:selection.from,to:selection.to};
    });
  };
  const input = await page.context().newCDPSession(page);
  try {
    for (const name of ['Local diagram','Remote image','List diagram','Cell diagram']) {
      const index = await link(name).evaluate(node => [...node.closest('.ProseMirror').querySelectorAll('a')].indexOf(node));
      const target = editor.locator('a').nth(index);
      const href = await target.getAttribute('href');
      const original = await target.textContent();
      const point = async () => {
        // Separate successive clicks spatially; keep native single-click classification.
        await editor.locator('h1').click({position:{x:2,y:8}});
        const box = await target.boundingBox();
        await target.click({position:{x:box.width*0.7,y:box.height/2}});
      };
      await point();
      const caret = await settledSelection();
      expect(caret, `${name}: click must retain a native caret inside the clicked link`).toMatchObject({empty:true,href,domHref:href,focused:true});
      await page.keyboard.type('ZZ');
      expect(await target.textContent(), `${name}: typing must change the clicked link`).toContain('ZZ');
      await page.keyboard.press('Control+z');
      expect((await state()).json, `${name}: Undo must restore the whole document`).toEqual(initial.json);
      expect(await target.textContent()).toBe(original);

      await point();
      await page.keyboard.press('Shift+ArrowLeft');
      expect((await settledSelection()).empty, `${name}: wait for native range selection before opening its form`).toBe(false);
      await page.keyboard.press('Control+Quote');
      await expect(surface.getByTestId('link-url'), `${name}: link authoring shortcut`).toHaveValue(href);
      await surface.getByTestId('link-url').press('Escape');
      await expect(surface.getByTestId('link-form')).toHaveCount(0);
      expect((await state()).json).toEqual(initial.json);

      await editor.locator('h1').click({position:{x:2,y:8}});
      const box = await target.boundingBox();
      await target.dblclick({position:{x:box.width*0.75,y:box.height/2}});
      const word = await settledSelection();
      expect(word.empty, `${name}: double-click must select a word`).toBe(false);
      expect(word.text).toBe(original.split(' ').at(-1));
      expect(word.domText).toBe(word.text);
      await expect(preview).toHaveCount(0);

      await page.mouse.move(box.x+2,box.y+box.height/2);
      await page.mouse.down();
      await page.mouse.move(box.x+box.width-2,box.y+box.height/2,{steps:8});
      await page.mouse.up();
      const dragged = await settledSelection();
      expect(dragged.empty, `${name}: drag must retain a range`).toBe(false);
      expect(dragged.text.length).toBeGreaterThan(0);
      expect(dragged.domText).toBe(dragged.text);
      await expect(preview).toHaveCount(0);

      await point();
      await input.send('Input.imeSetComposition',{text:'ㅎ',selectionStart:1,selectionEnd:1});
      await expect(preview).toHaveCount(0);
      await input.send('Input.imeSetComposition',{text:'한글',selectionStart:2,selectionEnd:2});
      await input.send('Input.insertText',{text:'한글'});
      await settledSelection();
      expect(await target.textContent(), `${name}: Korean composition must commit in the clicked link`).toContain('한글');
      await expect(preview).toHaveCount(0);
      if (href === 'diagram.svg') {
        await page.mouse.move(0,0);
        await page.keyboard.press('ArrowLeft');
        await expect(preview.locator('img'), `${name}: navigation resumes reading after composition`).toBeVisible();
      }
      await page.keyboard.press('Control+z');
      expect((await state()).json, `${name}: composition Undo must restore the document`).toEqual(initial.json);
    }
  } finally { await input.detach(); }
  await editor.locator('h1').click({position:{x:2,y:8}});
  await page.mouse.move(0,0);
  const readingInitial = await state();
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
    await surface.evaluate(node => node.closest('.document-scroll').scrollTo(0,0));
    await hover('Local diagram');
    await imageReady(); await bounds();
    if (screenshots) await page.screenshot({path:`tmp/image-link-preview-evidence/after-${width}.png`});
    await page.mouse.move(0,0);
    await expect(preview).toHaveCount(0);
  }
  expect(await state()).toEqual(readingInitial);
  await hover('Local diagram'); await imageReady();
  await page.keyboard.press('Escape');
  await expect(preview).toHaveCount(0);
  // Keyboard reading follows the editor's existing caret, never anchor-element focus.
  await link('Local diagram').click();
  await page.mouse.move(0,0);
  await page.keyboard.press('Home');
  await expect(preview).toHaveCount(0);
  for (const character of 'See L') await page.keyboard.press('ArrowRight');
  await settledSelection();
  const keyboardCaret = await state();
  await imageReady();
  expect(await state()).toEqual(keyboardCaret);
  expect(await editor.evaluate(dom=>document.activeElement===dom)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(preview).toHaveCount(0);
  await page.keyboard.press('ArrowRight'); await imageReady();
  await page.keyboard.press('Shift+ArrowRight');
  await expect(preview).toHaveCount(0);
  await link('Missing image').click();
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
  expect((await state()).json).toEqual(initial.json);
  // No external request or Host media lookup for remote image links, even at the caret.
  const requests = [];
  const observe = request => { if (/example.invalid|\/document\//.test(request.url())) requests.push(request.url()); };
  page.on('request',observe);
  await hover('Remote image');
  await link('Remote image').click();
  await page.evaluate(()=>new Promise(requestAnimationFrame));
  await expect(preview).toHaveCount(0);
  expect(requests).toEqual([]);
  page.off('request',observe);
  // Modified clicks keep the existing relative-link behavior.
  await link('Local diagram').click({modifiers:['Control']});
  expect(page.url().startsWith(origin)).toBe(true);
  expect(page.context().pages()).toHaveLength(pagesBefore);
  await settledSelection();
  // Make actual scrolling possible without changing the captured fixture state.
  await editor.evaluate(dom => dom.editor.commands.insertContentAt(dom.editor.state.doc.content.size,
    Array.from({length:25},()=>({type:'paragraph',content:[{type:'text',text:'Reading context.'}]})), {updateSelection:false}));
  // Separate this single click from the preceding modified click at the same link.
  await editor.locator('h1').click({position:{x:2,y:8}});
  await link('Local diagram').click();
  expect(await settledSelection()).toMatchObject({empty:true,href:'diagram.svg',domHref:'diagram.svg'});
  await page.mouse.move(0,0);
  await page.keyboard.press('ArrowRight');
  await imageReady();
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
  return {hover:true,keyboardCaret:true,pointerEditing:true,koreanComposition:true,undo:true,endnote:true,remoteRequests:requests.length,missing:true,broken:true,scroll:true,split:true};
}
