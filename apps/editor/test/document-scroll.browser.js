// Container-specific boundaries; existing navigation/authoring scenarios keep their assertions.
async (page, { openPath, expect }) => {
  await page.setViewportSize({width:1440, height:900});
  const origin = page.url().split('/').slice(0, 3).join('/');
  const loaded = await (await page.request.get(`${origin}/api/document`)).json();
  const sep = loaded.path.includes('\\') ? '\\' : '/';
  const root = loaded.path.split(sep).slice(0, -4).join(sep);
  await openPath(page, [root, 'tmp', 'outline', 'outline.md'].join(sep));
  const viewport = page.locator('.document-scroll[data-active="true"]');
  await expect(viewport).toHaveCount(1);
  await page.evaluate(async () => { await document.fonts.ready; document.activeElement?.blur(); });
  const state = () => viewport.evaluate(node => ({top:node.scrollTop, end:node.scrollHeight-node.clientHeight,
    window:window.scrollY, right:node.getBoundingClientRect().right, width:innerWidth}));
  const chrome = () => page.locator('.app-titlebar, .sidebar, .app-header, .document-panel:not(.document-panel--overlay)').evaluateAll(nodes => nodes.map(node => {
    const {x,y,width,height} = node.getBoundingClientRect(); return {x,y,width,height};
  }));
  const before = await chrome();
  for (const key of ['PageDown', 'Space', 'End', 'PageUp', 'Shift+Space', 'Home']) {
    const previous = await state();
    await page.keyboard.press(key);
    const next = await state();
    expect(next.window, `${key} moved the window`).toBe(0);
    expect(next.right, 'Native scrollbar left the window edge').toBe(next.width);
    if (key === 'Home') expect(next.top).toBe(0);
    else if (key === 'End') expect(next.top).toBe(next.end);
    else if (key === 'PageUp' || key === 'Shift+Space') expect(next.top).toBeLessThan(previous.top);
    else expect(next.top).toBeGreaterThan(previous.top);
  }
  await page.mouse.move(900, 500);
  await page.mouse.wheel(0, 600);
  await page.waitForFunction(() => document.querySelector('.document-scroll[data-active="true"]').scrollTop > 0);
  expect(await chrome(), 'Scrolling moved shell chrome').toEqual(before);
  expect((await state()).window).toBe(0);

  // A native drag near the window edge must scroll this document, with the shell stationary.
  await viewport.evaluate(node => node.scrollTop = 0);
  const paragraph = viewport.locator('.document-editor > p').first();
  await paragraph.hover();
  const handle = viewport.getByRole('button', {name:/^Move paragraph block/}).first();
  const box = await handle.boundingBox();
  await page.mouse.move(box.x + box.width/2, box.y + box.height/2);
  await page.mouse.down();
  try {
    await page.mouse.move(900, 896, {steps:10});
    await page.mouse.move(901, 896);
    await expect(viewport.getByTestId('block-drag-source')).toBeVisible();
    await page.waitForFunction(() => document.querySelector('.document-scroll[data-active="true"]').scrollTop > 0);
    expect((await state()).window).toBe(0);
    expect(await chrome()).toEqual(before);
    await page.keyboard.press('Escape');
  } finally { await page.mouse.up(); }

  // Source uses the same owning viewport and native keys, without involving the editor engine.
  await page.getByTestId('view-source').click();
  const source = viewport.getByTestId('source-view');
  await source.evaluate(node => { node.tabIndex = -1; node.focus({preventScroll:true}); });
  await viewport.evaluate(node => node.scrollTop = 0);
  await page.keyboard.press('PageDown');
  await page.waitForFunction(() => document.querySelector('.document-scroll[data-active="true"]').scrollTop > 0);
  expect((await state()).window).toBe(0);
  await page.getByTestId('view-visual').click();

  await page.emulateMedia({media:'print'});
  try {
    const print = await viewport.evaluate(node => {
      const last = node.querySelector('.document-editor > :last-child');
      return {position:getComputedStyle(node).position, overflow:getComputedStyle(node).overflowY,
        height:node.clientHeight, total:node.scrollHeight, last:last.getBoundingClientRect().bottom,
        bottom:node.getBoundingClientRect().bottom, top:node.scrollTop, pageHeight:document.documentElement.scrollHeight};
    });
    expect(print.position).toBe('static');
    expect(print.overflow).toBe('visible');
    expect(print.last).toBeLessThanOrEqual(print.bottom);
    expect(print.last).toBeLessThanOrEqual(print.pageHeight);
    expect(print.top).toBe(0);
  } finally { await page.emulateMedia({media:'screen'}); }
  // The #694 follow-up requires the native scrollbar below chrome, while the title-strip
  // boundary reaches the window edge. Capture these same measured states for manual review.
  await openPath(page, [root, 'tmp', 'quiet-document', 'quiet-document.md'].join(sep));
  const captures = [], geometry = [];
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => localStorage.setItem('ieumdoc.theme', theme), theme);
    await page.reload();
    await expect(page.getByTestId('status')).toHaveAttribute('data-operation', 'ready');
    for (const width of [1440, 640]) {
      await page.setViewportSize({width, height:900});
      if (width === 640) await page.getByTestId('document-panel').waitFor({state:'detached'});
      for (const sidebar of ['open', 'closed']) {
        const expand = page.getByRole('button', {name:'Expand sidebar', exact:true});
        if ((sidebar === 'open') === await expand.isVisible()) {
          await page.getByRole('button', {name:sidebar === 'open' ? 'Expand sidebar' : 'Collapse sidebar', exact:true}).click();
        }
        for (const panel of ['closed', 'open']) {
          const toggle = page.getByRole('button', {name:'Outline', exact:true});
          if ((await toggle.getAttribute('aria-pressed') === 'true') !== (panel === 'open')) await toggle.click();
          await page.evaluate(async () => {
            await document.fonts.ready;
            await Promise.all([...document.querySelectorAll('.document img[src]')].map(img => img.decode()));
            document.activeElement?.blur();
          });
          await page.mouse.move(0, 0);
          for (const position of ['top', 'scrolled']) {
            await viewport.evaluate(async (node, position) => {
              node.scrollTop = position === 'top' ? 0 : 420;
              await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            }, position);
            const measured = await viewport.evaluate(node => {
              const box = node.getBoundingClientRect();
              const header = document.querySelector('.app-header').getBoundingClientRect();
              const title = document.querySelector('.app-titlebar');
              const titleBox = title.getBoundingClientRect();
              return {top:box.top, bottom:box.bottom, right:box.right, headerBottom:header.bottom,
                titleRight:titleBox.right, titleBorder:parseFloat(getComputedStyle(title).borderBottomWidth),
                rootScroll:window.scrollY, rootHeight:document.documentElement.scrollHeight,
                width:innerWidth, height:innerHeight, scrollbar:node.offsetWidth-node.clientWidth};
            });
            expect(measured.top, 'Scrollbar must start below tabs/messages').toBe(measured.headerBottom);
            expect(measured.bottom).toBe(measured.height);
            expect(measured.right).toBe(measured.width);
            expect(measured.titleRight, 'Title-strip boundary must reach the window controls edge').toBe(measured.width);
            expect(measured.titleBorder).toBeGreaterThan(0);
            expect(measured.rootScroll).toBe(0);
            expect(measured.rootHeight).toBeLessThanOrEqual(measured.height);
            const name = `after-${theme}-${width}-${sidebar}-${panel}-${position}`;
            const path = `tmp/document-scroll-capture/${name}.png`;
            await page.screenshot({path}); captures.push(path);
            geometry.push({name, ...measured});
          }
        }
      }
    }
  }
  return {keyboard:true, wheel:true, dragAutoScroll:true, source:true, print:true, captures, geometry,
    userAgent:await page.evaluate(() => navigator.userAgent)};
}
