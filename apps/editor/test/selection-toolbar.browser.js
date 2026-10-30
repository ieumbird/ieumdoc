// #838: viewport collisions must not cover the selection or intercept unrelated clicks.
async (page, { openPath, activeDocument, expect, screenshots }) => {
  await page.evaluate(() => localStorage.setItem('ieumdoc.uiLanguage', 'en'));
  await page.reload();
  await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({ state: 'attached' });
  const origin = page.url().split('/').slice(0, 3).join('/');
  const loaded = await (await page.request.get(`${origin}/api/document`)).json();
  const sep = loaded.path.includes('\\') ? '\\' : '/';
  const file = [...loaded.path.split(sep).slice(0, -4), 'tmp', 'selection-toolbar', 'overlays.md'].join(sep);
  await openPath(page, file);
  const surface = activeDocument(page);
  const editor = surface.locator('.ProseMirror');
  const text = editor.locator('p.paragraph', { hasText: 'Select this' });
  const toolbar = surface.getByTestId('selection-toolbar');
  const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const position = async (target, offset) => {
    await target.evaluate((node, offset) => {
      const viewport = node.closest('.document-scroll');
      viewport.scrollTop += node.getBoundingClientRect().top - viewport.getBoundingClientRect().top - offset;
    }, offset);
    await settle();
  };
  const selectLine = async () => {
    await text.click();
    await page.keyboard.press('Home');
    await page.keyboard.press('Shift+End');
    await expect(toolbar).toBeVisible();
  };
  const geometry = overlay => overlay.evaluate(node => {
    const o = node.getBoundingClientRect();
    const range = getSelection().getRangeAt(0);
    const rects = [...range.getClientRects()].filter(r => r.width && r.height);
    const v = node.closest('.document-scroll').getBoundingClientRect();
    return { overlaps: rects.some(r => o.left < r.right && o.right > r.left && o.top < r.bottom && o.bottom > r.top),
      inside: o.top >= v.top && o.bottom <= v.bottom && o.left >= v.left && o.right <= v.right,
      top: o.top, bottom: o.bottom, selectionTop: Math.min(...rects.map(r => r.top)), selectionBottom: Math.max(...rects.map(r => r.bottom)) };
  });
  const result = {};
  const clearOf = async (overlay, target) => {
    const o = await overlay.boundingBox(), a = await target.boundingBox();
    expect(o.y + o.height <= a.y || o.y >= a.y + a.height, 'Overlay must clear its anchor vertically').toBe(true);
    expect(await overlay.evaluate(node => {
      const o = node.getBoundingClientRect(), v = node.closest('.document-scroll').getBoundingClientRect();
      return o.top >= v.top && o.bottom <= v.bottom && o.left >= v.left && o.right <= v.right;
    }), 'Overlay stays inside its document viewport').toBe(true);
  };
  const clearsSelection = overlay => overlay.evaluate(node => {
    const instance = node.closest('.document').querySelector('.ProseMirror').editor;
    const { from, to } = instance.state.selection;
    const start = instance.view.coordsAtPos(from), end = instance.view.coordsAtPos(to);
    const o = node.getBoundingClientRect();
    return o.bottom <= Math.min(start.top, end.top) || o.top >= Math.max(start.bottom, end.bottom);
  });
  const states = screenshots ? [[1440, 'light', 'en'], [640, 'light', 'en'], [1440, 'dark', 'ko'], [640, 'dark', 'ko']] : [[1440, 'light', 'en'], [640, 'light', 'en'], [640, 'dark', 'ko']];
  for (const [width, theme, language] of states) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(({ theme, language }) => {
      localStorage.setItem('ieumdoc.theme', theme);
      localStorage.setItem('ieumdoc.uiLanguage', language);
    }, { theme, language });
    await page.reload();
    await text.waitFor();
    await page.evaluate(() => document.fonts.ready);
    await position(text, 200);
    await selectLine();
    if (!screenshots) {
      const ordinary = await geometry(toolbar);
      expect(ordinary.overlaps).toBe(false);
      expect(ordinary.bottom).toBeLessThanOrEqual(ordinary.selectionTop);
    }
    await position(text, 12);
    if (screenshots) {
      await page.screenshot({ path: `tmp/selection-toolbar-evidence/${width}-${theme}-${language}-toolbar.png` });
      await page.keyboard.press('Control+Quote');
      await surface.getByTestId('link-form').waitFor();
      await settle();
      await page.screenshot({ path: `tmp/selection-toolbar-evidence/${width}-${theme}-${language}-link.png` });
      await page.keyboard.press('Escape');
      await page.keyboard.press('ArrowRight');
      await settle();
      const note = text.getByTestId('footnote-reference');
      const height = await surface.evaluate(node => node.closest('.document-scroll').clientHeight);
      await position(note, height - 36);
      await note.hover();
      await surface.getByTestId('reference-preview').waitFor();
      await settle();
      await page.screenshot({ path: `tmp/selection-toolbar-evidence/${width}-${theme}-${language}-preview.png` });
      continue;
    }
    const top = await geometry(toolbar);
    expect(top.overlaps, `Toolbar covers the selected line at ${width}px: ${JSON.stringify(top)}`).toBe(false);
    expect(top.inside).toBe(true);
    expect(top.top).toBeGreaterThanOrEqual(top.selectionBottom);

    // Esc still discards the URL draft (#821); only the selection toolbar remains.
    await page.keyboard.press('Control+Quote');
    const linkForm = surface.getByTestId('link-form');
    await expect(linkForm).toBeVisible();
    await settle();
    // Form autofocus can scroll, but the engine's selected text must remain unobscured.
    expect(await clearsSelection(linkForm)).toBe(true);
    await page.getByTestId('link-url').fill('https://example.com/unapplied');
    await page.keyboard.press('Escape');
    await expect(surface.getByTestId('link-form')).toHaveCount(0);
    const destination = editor.locator('h2', { hasText: 'Click destination' });
    await position(destination, 20);
    await expect(toolbar).toBeHidden();
    // Scrolling back restores tools for the retained engine selection without reselecting.
    await position(text, 200);
    await expect(toolbar).toBeVisible();
    await position(destination, 20);
    await expect(toolbar).toBeHidden();
    const box = await destination.boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    // Native selection changes at the click; ProseMirror consumes selectionchange afterward.
    expect(await destination.evaluate(node => node.contains(getSelection().anchorNode))).toBe(true);
    await expect.poll(() => editor.evaluate(dom => dom.editor.state.selection.$from.parent.textContent)).toBe('Click destination');
    expect(await text.locator('a').getAttribute('href')).toBe('https://example.com/original');
    // A bottom-edge reading card flips above its chip instead of covering it.
    const note = text.getByTestId('footnote-reference');
    const height = await surface.evaluate(node => node.closest('.document-scroll').clientHeight);
    await position(note, height - 36);
    await note.hover();
    const preview = surface.getByTestId('reference-preview');
    await expect(preview).toBeVisible();
    await settle();
    await clearOf(preview, note);
    const previewBox = await preview.boundingBox(), noteBox = await note.boundingBox();
    expect(previewBox.y + previewBox.height).toBeLessThanOrEqual(noteBox.y);
    await page.mouse.move(0, 0);
    // Existing inline reference/citation forms use the same collision correction.
    for (const [chipSelector, editId, formId] of [
      ['[data-testid="cross-reference"]', 'cross-reference-edit', 'reference-form'],
      ['[data-citation]', 'citation-edit', 'citation-form'],
    ]) {
      const chip = editor.locator(chipSelector);
      await position(chip, height - 40);
      await chip.hover();
      await chip.getByTestId(editId).click();
      const form = surface.getByTestId(formId);
      await expect(form).toBeVisible();
      await settle();
      await clearOf(form, chip.locator('.cross-reference-chip'));
      await page.keyboard.press('Escape');
      await expect(form).toHaveCount(0);
    }
    const paragraph = editor.locator('p.paragraph', { hasText: 'Following paragraph 0.' });
    await position(paragraph, 200);
    await paragraph.click();
    await page.keyboard.press('Home');
    await page.keyboard.type('/');
    const menu = surface.getByRole('menu');
    await expect(menu).toBeVisible();
    await position(paragraph, height - 36);
    // Home addresses the current visual line, which can be the paragraph's second line.
    expect(await clearsSelection(menu)).toBe(true);
    await position(editor.locator('p.paragraph', { hasText: 'Following paragraph 10.' }), 20);
    await expect(menu).toBeHidden();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Backspace');
    await position(text, 200);
    await selectLine();
    await position(editor.locator('p.paragraph', { hasText: 'Following paragraph 10.' }), 20);
    await expect(toolbar).toBeHidden();
    await page.keyboard.press('Tab');
    expect(await editor.evaluate(dom => dom === document.activeElement), 'Hidden toolbar must not swallow Tab').toBe(false);
    result[width] = 'selection clear; offscreen toolbar does not intercept heading click; Esc discards URL';
  }
  return result;
}
