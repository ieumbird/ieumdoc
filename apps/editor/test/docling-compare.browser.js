// Public NIST + declared synthetic supplement; no network Docling service or private content.
async (page, { expect }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const origin = page.url().split('/').slice(0, 3).join('/');
  const initial = await (await page.request.get(`${origin}/api/document`)).json();
  const separator = initial.path.includes('\\') ? '\\' : '/';
  const root = initial.path.split(separator).slice(0, -4).join(separator);
  const folder = name => [root, 'tmp', 'docling-compare', name].join(separator);
  const open = async name => {
    await page.getByRole('button', { name: 'Docling comparison', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Docling comparison' });
    await dialog.getByTestId('folder-path').fill(folder(name));
    await dialog.getByTestId('folder-open').click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('.docling-tab[data-active=true] .docling-source img').first()).toBeVisible();
  };
  const snapshot = await (await page.request.get(`${origin}/api/docling-compare?path=${encodeURIComponent(folder('nist-sp1108r4') + separator + 'document.md')}`)).json();
  const pageImages = new Set(Object.values(snapshot.map.pages).map(value => value.image?.uri));
  const requested = new Set();
  page.on('request', request => {
    const uri = decodeURIComponent((request.url().split('/document/')[1] ?? '').split('?')[0]);
    const path = decodeURIComponent((request.url().split('?path=')[1] ?? '').replaceAll('+', ' '));
    if (path === snapshot.path && pageImages.has(uri)) requested.add(uri);
  });
  await open('nist-sp1108r4');
  await expect(page.getByRole('tab', { name: /Docling comparison ·/ })).toHaveCount(1);
  await expect(page.locator('.docling-tab[data-active=true] .docling-wires path').first()).toBeAttached();
  const initialImages = [...requested];
  expect(initialImages.length).toBeGreaterThan(0);
  expect(initialImages.length).toBeLessThan(Object.keys(snapshot.map.pages).length);
  const tab = page.locator('.docling-tab[data-active=true]');
  const source = tab.locator('.docling-source'), reading = tab.locator('.docling-reading');
  const visiblePages = await source.locator('img').count();
  expect(visiblePages).toBeLessThanOrEqual(2);
  const correspondenceCounts = await page.evaluate(map => {
    const tab = document.querySelector('.docling-tab[data-active=true]');
    const left = tab.querySelector('.docling-source').getBoundingClientRect();
    const right = tab.querySelector('.docling-reading').getBoundingClientRect();
    let links = 0;
    for (const region of tab.querySelectorAll('.docling-region')) {
      const sourceY = region.getBoundingClientRect().top + region.getBoundingClientRect().height / 2;
      if (sourceY < left.top || sourceY > left.bottom) continue;
      for (const target of map.items.find(item => item.self_ref === region.dataset.sourceRef).targets) {
        let node = tab.querySelector(`[data-source-path="${target.path.join(',')}"]`);
        if (target.item) for (const [depth, index] of target.item.entries()) {
          node = node?.querySelectorAll(':scope > li')[index];
          if (depth < target.item.length - 1) node = node?.querySelector('ul,ol');
        }
        if (!node) continue;
        const rect = node.getBoundingClientRect(), y = rect.top + Math.min(rect.height / 2, 24);
        if (y >= right.top && y <= right.bottom) links++;
      }
    }
    const pages = [...tab.querySelectorAll('.docling-source img')].map(image => Number(image.closest('[data-page]').dataset.page));
    return { links, renderedLinks: tab.querySelectorAll('.docling-wires path').length,
      boxes: map.items.reduce((sum, item) => sum + item.provenance.filter(prov => pages.includes(prov.page_no)).length, 0),
      renderedBoxes: tab.querySelectorAll('.docling-region').length };
  }, snapshot.map);
  expect(correspondenceCounts.renderedBoxes).toBe(correspondenceCounts.boxes);
  expect(correspondenceCounts.renderedLinks).toBe(correspondenceCounts.links);
  const firstRegion = await tab.locator('.docling-region').first().evaluate(element => ({
    ref: element.dataset.sourceRef, page: Number(element.closest('[data-page]').dataset.page),
    top: parseFloat(element.style.top), left: parseFloat(element.style.left), height: parseFloat(element.style.height),
  }));
  const item = snapshot.map.items.find(item => item.self_ref === firstRegion.ref);
  const prov = item.provenance.find(prov => prov.page_no === firstRegion.page), size = snapshot.map.pages[String(firstRegion.page)].size;
  const expectedTop = prov.bbox.coord_origin === 'BOTTOMLEFT' ? size.height - Math.max(prov.bbox.t, prov.bbox.b) : Math.min(prov.bbox.t, prov.bbox.b);
  expect(Math.abs(firstRegion.top - expectedTop / size.height * 100)).toBeLessThan(.001);
  await source.evaluate(element => { element.scrollTop = 900; });
  await expect.poll(() => reading.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  const leftBefore = await source.evaluate(element => element.scrollTop);
  await reading.evaluate(element => { element.scrollTop += 500; });
  await expect.poll(() => source.evaluate(element => element.scrollTop)).not.toBe(leftBefore);
  await tab.getByRole('checkbox', { name: 'Sync scrolling' }).uncheck();
  const rightBefore = await reading.evaluate(element => element.scrollTop);
  await source.evaluate(element => { element.scrollTop = element.scrollHeight - element.clientHeight; });
  await expect(source.locator('[data-page="11"] img')).toBeVisible();
  expect(await reading.evaluate(element => element.scrollTop)).toBe(rightBefore);
  expect(await source.locator('img').count()).toBeLessThanOrEqual(2);
  expect(await tab.locator('.docling-region[data-status=decoration]').count()).toBeGreaterThan(0);
  await open('synthetic');
  const synthetic = page.locator('.docling-tab[data-active=true]');
  await expect(synthetic.locator('[data-category=table].docling-region')).toHaveCount(1);
  await expect(synthetic.locator('[data-category=formula].docling-region')).toHaveCount(1);
  await expect(synthetic.locator('[data-status=unsupported].docling-region')).toHaveCount(1);
  expect(await synthetic.locator('[data-testid=comparison-document] .ProseMirror[contenteditable=false]').count()).toBe(1);
  expect(await synthetic.locator('[data-testid=comparison-document] button:enabled').count()).toBe(0);
  const docBefore = await synthetic.locator('.ProseMirror').textContent();
  await synthetic.locator('.ProseMirror').click();
  await page.keyboard.type('Do not edit');
  expect(await synthetic.locator('.ProseMirror').textContent()).toBe(docBefore);
  await synthetic.locator('.docling-region[data-status=unsupported]').click();
  await expect(synthetic.locator('.docling-details')).toContainText('unsupported');
  await synthetic.getByRole('button', { name: 'Endnotes', exact: true }).click();
  await expect(synthetic.getByText('1 Synthetic explicit table endnote.')).toBeInViewport();
  // Repeat entry selects the existing tab rather than mounting another reading engine.
  await open('synthetic');
  await expect(page.getByRole('tab', { name: /Docling comparison ·/ })).toHaveCount(2);
  await page.getByRole('tab', { selected: true }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Open to the right', exact: true }).click();
  await expect(page.locator('.docling-tab[data-visible=true]')).toHaveCount(2);
  const paneBounds = await page.locator('.docling-tab[data-active=true]').boundingBox();
  expect(paneBounds.x).toBeGreaterThan(720);
  expect(paneBounds.x + paneBounds.width).toBeLessThanOrEqual(1440);
  await page.getByRole('tab', { selected: true }).last().click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Move to other group', exact: true }).click();
  await expect(page.locator('.docling-tab[data-visible=true]')).toHaveCount(1);
  await open('stale');
  const stale = page.locator('.docling-tab[data-active=true]');
  const center = page.getByRole('complementary', { name: 'Notifications' });
  await expect(center).toContainText('does not match');
  await expect(stale.getByRole('checkbox', { name: 'Sync scrolling' })).toBeDisabled();
  expect(await stale.locator('.docling-wires path').count()).toBe(0);
  await center.getByRole('button', { name: 'Go to problem' }).click();
  await expect(stale).toBeFocused();
  await center.getByRole('button', { name: 'Notifications', exact: true }).click();
  await expect(center.locator('ul')).toBeHidden();
  await center.getByRole('button', { name: 'Notifications', exact: true }).click();
  await center.getByRole('button', { name: 'Dismiss notification' }).click();
  await expect(center).toHaveCount(0);
  const staleTabId = await stale.getAttribute('aria-labelledby');
  await page.getByRole('tab', { name: 'technical-document.md', exact: true }).click();
  await page.locator('#' + staleTabId).click();
  await expect(center).toHaveCount(0);
  await page.getByRole('tab', { selected: true }).press('Delete');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  return { initialImages, totalPages: Object.keys(snapshot.map.pages).length, visiblePages, correspondenceCounts, firstRegion,
    readOnly: true, staleConnections: 0, endnotes: true };
}
