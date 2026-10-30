// Draft context must neither move the document nor cover its first lines.
async (page, { openPath, expect, screenshots }) => {
  const initial = await (await page.request.get(page.url().split('/').slice(0, 3).join('/') + '/api/document')).json();
  const sep = initial.path.includes('\\') ? '\\' : '/';
  const file = [...initial.path.split(sep).slice(0, -4), 'tmp', 'short-fields', 'fields.md'].join(sep);
  await page.evaluate(async () => (await import('/src/i18n.ts')).i18n.changeLanguage('en'));
  await openPath(page, file);
  const active = page.locator('[data-document-tab][data-active=true]');
  const heading = active.getByRole('heading', { name: 'Section one', exact: true });
  const notice = page.getByTestId('draft-indicator');
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
    // The viewport starts immediately below the tab row: no reserved notice row.
    const row = page.locator('.document-tab-row').first();
    const rowBounds = await row.boundingBox();
    const viewport = await active.boundingBox();
    expect(viewport.y).toBe(rowBounds.y + rowBounds.height);
    const paperGap = await active.evaluate(el => ({
      actual: el.querySelector('article.document').getBoundingClientRect().top - el.getBoundingClientRect().top,
      expected: parseFloat(getComputedStyle(el.querySelector('.document-column')).paddingTop),
    }));
    expect(paperGap.actual).toBe(paperGap.expected);
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
    const short = language === 'ko' ? '미적용 초안' : 'Unapplied draft';
    const full = language === 'ko' ? '저장과 소스에는 적용된 내용만 포함됩니다. 편집 초안은 적용해야 저장됩니다.'
      : 'Save and Source include applied content only. Unapplied edit drafts stay unsaved until you apply them.';
    await expect(notice).toHaveAccessibleName(`${short}. ${full}`);
    await expect(notice.locator('.draft-indicator-label')).toBeVisible({ visible: width === 1440 });
    await expect(notice.locator('svg')).toBeVisible({ visible: width === 640 });
    await notice.hover();
    await expect(page.getByTestId('draft-indicator-description')).toBeVisible();
    await expect(page.getByTestId('draft-indicator-description')).toHaveText(full);
    await page.mouse.move(0, 0);
    await expect(page.getByTestId('draft-indicator-description')).toBeHidden();
    await notice.focus();
    await expect(page.getByTestId('draft-indicator-description')).toBeVisible();
    await expect(page.getByTestId('draft-indicator-description')).toHaveText(full);
    await capture(`${width}-explanation`);
    await input.focus();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    const save = await page.getByTestId('save').boundingBox();
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(save.x);
    expect(bounds.y).toBeGreaterThanOrEqual(rowBounds.y);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(rowBounds.y + rowBounds.height);
    // Existing dirty status remains separate from the new draft indicator.
    await expect(page.getByTestId('status').locator('.document-status-dirty')).toBeVisible();
    const actions = await row.locator('.top-bar-group').last().evaluate(el => [...el.children].map(child => {
      const rect = child.getBoundingClientRect(); return { left: rect.left, right: rect.right };
    }));
    for (let i = 1; i < actions.length; i++) expect(actions[i].left - actions[i - 1].right).toBeGreaterThanOrEqual(4);
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
    results.push({ width, before, typed, reverted, during, after });
  }
  await page.evaluate(async () => (await import('/src/i18n.ts')).i18n.changeLanguage('en'));
  expect(results, 'Draft appearance/removal must keep content and native scroll stationary').toEqual(
    results.map(result => ({ ...result, typed: result.before, reverted: result.before, during: result.before, after: result.before })));
  return { results };
}
