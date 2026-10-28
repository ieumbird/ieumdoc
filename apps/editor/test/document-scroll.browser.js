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
  return {keyboard:true, wheel:true, dragAutoScroll:true, source:true, print:true};
}
