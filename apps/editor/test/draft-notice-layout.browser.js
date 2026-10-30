// Draft context must neither move the document nor cover its first lines.
async (page, { openPath, expect, screenshots }) => {
  const initial = await (await page.request.get(page.url().split('/').slice(0, 3).join('/') + '/api/document')).json();
  const sep = initial.path.includes('\\') ? '\\' : '/';
  const file = [...initial.path.split(sep).slice(0, -4), 'tmp', 'short-fields', 'fields.md'].join(sep);
  await page.evaluate(async () => (await import('/src/i18n.ts')).i18n.changeLanguage('en'));
  await openPath(page, file);
  const active = page.locator('[data-document-tab][data-active=true]');
  const heading = active.getByRole('heading', { name: 'Section one', exact: true });
  const notice = page.getByTestId('draft-notice');
  const results = [];
  const capture = async name => {
    if (screenshots) await page.screenshot({ path: `tmp/draft-notice-839/${name}.png` });
  };
  const geometry = () => heading.evaluate(el => ({ top: el.getBoundingClientRect().top,
    scroll: el.closest('[data-document-tab]').scrollTop }));
  const frame = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  for (const [width, language, theme] of [[1440, 'en', 'light'], [640, 'ko', 'dark']]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(async ({ language, theme }) => {
      (await import('/src/theme.ts')).applyTheme(theme);
      await (await import('/src/i18n.ts')).i18n.changeLanguage(language);
      await document.fonts.ready;
    }, { language, theme });
    await heading.hover();
    await active.getByTestId('label-target-edit').click();
    const input = page.getByTestId('label-target-input');
    await expect(input).toBeFocused();
    const original = await input.inputValue();
    const before = await geometry();
    await capture(`${width}-idle`);
    await input.pressSequentially('x');
    await notice.waitFor();
    await frame();
    const typed = await geometry();
    await input.fill(original);
    await notice.waitFor({ state: 'detached' });
    await frame();
    const reverted = await geometry();
    // Invalid metadata survives Source rather than being applied on outside click.
    await input.pressSequentially(' ');
    await notice.waitFor();
    // Wait for header measurement, not for a favorable document position.
    await frame();
    const during = await geometry();
    await capture(`${width}-draft`);
    const bounds = await notice.boundingBox();
    const lines = await notice.evaluate(el => {
      const range = document.createRange(); range.selectNodeContents(el.querySelector('.message-text'));
      return new Set([...range.getClientRects()].map(rect => rect.top)).size;
    });
    if (width === 640) expect(lines).toBeGreaterThan(1);
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    await page.getByTestId('view-source').click();
    await expect(notice).toBeVisible();
    const source = active.getByTestId('source-view');
    await expect(source).toBeVisible();
    expect((await source.boundingBox()).y).toBeGreaterThanOrEqual(bounds.y + bounds.height);
    await capture(`${width}-source`);
    await page.getByTestId('view-visual').click();
    await input.press('Escape');
    await notice.waitFor({ state: 'detached' });
    await frame();
    const after = await geometry();
    results.push({ width, before, typed, reverted, during, after, lines });
  }
  await page.evaluate(async () => (await import('/src/i18n.ts')).i18n.changeLanguage('en'));
  expect(results, 'Draft appearance/removal must keep content and native scroll stationary').toEqual(
    results.map(result => ({ ...result, typed: result.before, reverted: result.before, during: result.before, after: result.before })));
  return { results };
}
