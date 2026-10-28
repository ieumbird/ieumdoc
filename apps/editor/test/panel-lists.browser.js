// Document navigation integration: Core-backed captions, shared current/reveal lifecycle and tabs.
async (page, { openDocument, expect, screenshots }) => {
  const origin = page.url().split('/').slice(0, 3).join('/');
  const initial = await (await page.request.get(`${origin}/api/document`)).json();
  const sep = initial.path.includes('\\') ? '\\' : '/';
  const root = initial.path.split(sep).slice(0, -4);
  const file = [...root, 'tmp', 'outline', 'panel-lists.md'].join(sep);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openDocument(page, file);
  const panel = page.getByTestId('document-panel');
  const tabs = panel.getByRole('tab');
  const tables = panel.getByTestId('tables');
  const figures = panel.getByTestId('figures');
  const editor = page.locator('[data-document-tab][data-active=true] .document-editor');
  await expect(tabs).toHaveText(['Outline', 'Tables', 'Figures']);
  await expect(panel.getByRole('tab', { name: 'Outline', exact: true })).toHaveAttribute('aria-selected', 'true');
  // Every tab controls a mounted panel, and only the chosen panel is exposed.
  for (const tab of await tabs.all()) {
    const id = await tab.getAttribute('aria-controls');
    await expect(page.locator(`#${id}`)).toHaveCount(1);
  }
  await expect(panel.getByRole('tabpanel')).toHaveCount(1);
  await tabs.nth(1).click();
  await expect(tables.getByRole('button')).toHaveText([
    'Table 1. Measured results', 'Table 2',
    'Table 3. A very long caption with enough words to wrap across more than two lines in the document navigation panel without widening the panel',
  ]);
  if (screenshots) await page.screenshot({ path: 'tmp/panel-700/tables-1440.png', animations: 'disabled' });
  await tabs.nth(2).click();
  if (screenshots) await page.screenshot({ path: 'tmp/panel-700/figures-1440.png', animations: 'disabled' });
  await expect(figures.getByRole('button').nth(0)).toHaveText('Figure 1. Signal flow through the system.');
  await expect(figures.getByRole('button').nth(1)).toHaveText('Figure 2');
  // Compare the actual body prefix, including its separator, rather than a second template.
  for (const [kind, list] of [['table', tables], ['figure', figures]]) {
    await tabs.nth(kind === 'table' ? 1 : 2).click();
    const bodyCaption = await editor.locator(`[data-block="${kind}"] .caption`).first().evaluate(n =>
      JSON.parse(getComputedStyle(n, '::before').content) + n.textContent);
    await expect(list.getByRole('button').first()).toHaveText(bodyCaption);
  }

  // Roving tab stop, automatic arrow activation, Home/End and connection to the list.
  await tabs.nth(2).focus();
  await page.keyboard.press('ArrowRight');
  await expect(tabs.nth(0)).toBeFocused();
  await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('End');
  await expect(tabs.nth(2)).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(tabs.nth(1)).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(tables.getByRole('button').first()).toBeFocused();

  const landed = async (kind, index) => {
    await expect.poll(() => editor.evaluate((element, { kind, index }) => {
      const editor = element.editor;
      const targets = [];
      editor.state.doc.forEach((node, pos) => { if (node.type.name === kind) targets.push({ node, pos }); });
      const target = targets[index];
      const selection = editor.state.selection;
      const dom = editor.view.nodeDOM(target.pos);
      const header = document.querySelector('.app-header').getBoundingClientRect().bottom;
      const top = dom.getBoundingClientRect().top;
      return { focused: editor.view.hasFocus(), insideTarget: selection.from >= target.pos && selection.to <= target.pos + target.node.nodeSize,
        clearsHeader: top >= header - 1, nearHeader: top <= header + 120, top, header, className: dom.className };
    }, { kind, index })).toMatchObject({ focused: true, insideTarget: true, clearsHeader: true, nearHeader: true });
  };
  // Activation from keyboard and pointer uses the same editor and never dirties the document.
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await landed('table', 1);
  await expect(tables.locator('[aria-current="location"]')).toHaveText('Table 2');
  await tabs.nth(2).click();
  await figures.getByRole('button').nth(1).click();
  await landed('figure', 1);
  await expect(figures.locator('[aria-current="location"]')).toHaveText('Figure 2');
  await expect(page.getByTestId('status')).toHaveAttribute('data-operation', 'ready');

  // Source-to-Visual reveal also applies to tables and figures.
  for (const [tab, kind, list] of [[1, 'table', tables], [2, 'figure', figures]]) {
    await page.getByTestId('view-source').click();
    await tabs.nth(tab).click();
    await list.getByRole('button').first().click();
    await expect(page.getByTestId('view-visual')).toHaveAttribute('aria-pressed', 'true');
    await landed(kind, 0);
  }

  // Manual scrolling updates each list through the original shared reading-line observer.
  for (const [tab, kind, list] of [[1, 'table', tables], [2, 'figure', figures]]) {
    await tabs.nth(tab).click();
    await editor.evaluate((element, kind) => {
      const editor = element.editor;
      let last;
      editor.state.doc.forEach((node, pos) => { if (node.type.name === kind) last = editor.view.nodeDOM(pos); });
      window.scrollTo(0, window.scrollY + last.getBoundingClientRect().top - window.innerHeight * 0.25);
    }, kind);
    await expect(list.locator('[aria-current="location"]')).toContainText(kind === 'table' ? 'Table 3.' : 'Figure 3.');
  }

  // A real keyboard deletion updates the list immediately; Undo restores it.
  await figures.getByRole('button').first().click();
  await page.keyboard.press('Delete');
  await expect(tabs.nth(2)).toHaveText('Figures');
  await expect(figures.getByRole('button')).toHaveCount(2);
  await expect(figures.getByRole('button').first()).toHaveText('Figure 1');
  await page.keyboard.press('Control+z');
  await expect(tabs.nth(2)).toHaveText('Figures');
  await expect(figures.getByRole('button')).toHaveCount(3);
  await expect(figures.getByRole('button').first()).toContainText('Signal flow');

  // Caption edits update navigation without Save or Reload.
  await tabs.nth(1).click();
  await tables.getByRole('button').first().click();
  const caption = editor.getByLabel('Table caption', { exact: true }).first();
  await caption.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' revised');
  await expect(tables.getByRole('button').first()).toHaveText('Table 1. Measured results revised');
  await page.keyboard.press('Control+z');
  await expect(tables.getByRole('button').first()).toHaveText('Table 1. Measured results');

  // Docked and overlay geometry, native caption reservation, independent drag region and themes.
  for (const width of [1440, 640]) {
    await page.setViewportSize({ width, height: 900 });
    if (!await panel.isVisible()) await page.getByRole('button', { name: 'Outline', exact: true }).click();
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
      const originalBounds = await tabs.evaluateAll(buttons => buttons.map(button => {
        const r = button.getBoundingClientRect(); return [r.x, r.y, r.width, r.height];
      }));
      for (let tab = 0; tab < 3; tab++) {
        await tabs.nth(tab).click();
        expect(await tabs.evaluateAll(buttons => buttons.map(button => {
          const r = button.getBoundingClientRect(); return [r.x, r.y, r.width, r.height];
        }))).toEqual(originalBounds);
        const faces = await tabs.evaluateAll(buttons => buttons.map(button => {
          const style = getComputedStyle(button);
          const probe = document.createElement('span');
          probe.style.background = 'var(--id-color-surface)';
          probe.style.boxShadow = 'var(--shadow-segment)'; button.append(probe);
          const themed = getComputedStyle(probe);
          const result = { weight: Number(style.fontWeight), selected: button.getAttribute('aria-selected') === 'true',
            face: style.backgroundColor === themed.backgroundColor, shadow: style.boxShadow === themed.boxShadow };
          probe.remove(); return result;
        }));
        expect(faces.every(face => face.selected ? face.weight === 600 && face.face && face.shadow : face.weight < 600)).toBe(true);
        const geometry = await panel.evaluate(panel => {
          const header = panel.querySelector('.document-panel-header');
          const nav = panel.querySelector('.document-panel-navigation');
          const segment = nav.querySelector('.view-toggle');
          const box = panel.getBoundingClientRect();
          return { headerHeight: header.getBoundingClientRect().height, navHeight: nav.getBoundingClientRect().height,
            adjacent: Math.abs(panel.getBoundingClientRect().top + parseFloat(getComputedStyle(panel).borderTopWidth) - nav.getBoundingClientRect().top) < 0.5,
            headerDrag: getComputedStyle(header).getPropertyValue('app-region'), segmentDrag: getComputedStyle(segment).getPropertyValue('app-region'),
            fits: box.left >= 0 && box.right <= innerWidth && panel.scrollWidth <= panel.clientWidth,
            buttonsFit: [...nav.querySelectorAll('button')].every(button => button.scrollWidth <= button.clientWidth),
          };
        });
        expect(geometry).toMatchObject({ headerHeight: 33, navHeight: 33, adjacent: true, headerDrag: 'none', segmentDrag: 'none', fits: true, buttonsFit: true });
      }
    }
  }
  // English segments retain the full panel width; the title strip owns caption reservation.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => document.documentElement.style.setProperty('--window-controls-width', '138px'));
  await expect.poll(() => panel.locator('.document-panel-header').evaluate(header => getComputedStyle(header).paddingRight)).toBe('12px');
  expect(await panel.locator('.document-panel-navigation').evaluate(nav => nav.scrollWidth <= nav.clientWidth)).toBe(true);
  await page.evaluate(() => document.documentElement.style.removeProperty('--window-controls-width'));

  // Switch to a heading-only document: empty guidance, localized tabs and no remembered list.
  await openDocument(page, [...root, 'tmp', 'outline', 'outline.md'].join(sep));
  await tabs.nth(1).click();
  await expect(tables).toHaveText('No tables');
  await tabs.nth(2).click();
  await expect(figures).toHaveText('No figures');
  try {
    await page.evaluate(() => localStorage.setItem('ieumdoc.uiLanguage', 'ko'));
    await page.reload();
    await expect(tabs).toHaveText(['개요', '표', '그림']);
    await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
    await tabs.nth(1).click();
    await expect(tables).toHaveText('표 없음');
    await tabs.nth(2).click();
    await expect(figures).toHaveText('그림 없음');
    await page.setViewportSize({ width: 640, height: 900 });
    if (!await panel.isVisible()) await page.getByRole('button', { name: '개요', exact: true }).click();
    expect(await tabs.evaluateAll(buttons => buttons.every(button => button.scrollWidth <= button.clientWidth))).toBe(true);
    // UI localization changes navigation labels, never the document's caption notation.
    await page.getByRole('button', { name: '개요', exact: true }).click();
    const fileTab = page.getByRole('tab', { name: 'panel-lists.md', exact: true });
    await fileTab.click();
    await page.getByRole('button', { name: '개요', exact: true }).click();
    await tabs.nth(1).click();
    await expect(tables.getByRole('button').first()).toHaveText('Table 1. Measured results');
  } finally {
    await page.evaluate(() => localStorage.setItem('ieumdoc.uiLanguage', 'en'));
  }
  return { captions: true, keyboard: true, reveal: true, scrollTracking: true, liveEdits: true, geometry: true, emptyAndLocalized: true };
}
