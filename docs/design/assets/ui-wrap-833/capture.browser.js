// Manual product evidence for #833; run through pnpm browser:test ui-wrap-capture.
async (page, { openPath, expect }) => {
  const origin = page.url().split('/').slice(0, 3).join('/');
  const initial = await (await page.request.get(`${origin}/api/document`)).json();
  const sep = initial.path.includes('\\') ? '\\' : '/';
  const root = initial.path.split(sep).slice(0, -4);
  const results = [];
  for (const [width, language, theme] of [[640, 'ko', 'dark'], [1440, 'en', 'light']]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(async ({ language, theme }) => {
      localStorage.setItem('ieumdoc.uiLanguage', language);
      (await import('/src/theme.ts')).applyTheme(theme);
      await (await import('/src/i18n.ts')).i18n.changeLanguage(language);
    }, { language, theme });
    await page.evaluate(async () => (await import('/src/i18n.ts')).i18n.changeLanguage('en'));
    await openPath(page, [...root, 'tmp', 'short-fields', 'fields.md'].join(sep));
    await page.evaluate(async language => (await import('/src/i18n.ts')).i18n.changeLanguage(language), language);
    const active = page.locator('[data-document-tab][data-active=true]');
    const equation = active.locator('[data-block=equation]').first();
    await equation.hover({ position: { x: 4, y: 4 } });
    await equation.getByRole('button', { name: language === 'ko' ? '편집' : 'Edit', exact: true }).click();
    await page.getByTestId('equation-edit-source').click();
    await page.getByTestId('equation-latex').fill('x + y');
    await expect(page.getByTestId('draft-notice')).toBeVisible();
    const stage = await page.locator('.app-shell').evaluate(el => getComputedStyle(el).wordBreak === 'keep-all' ? 'after' : 'before');
    const capture = async (name, selector) => {
      await page.evaluate(() => document.fonts.ready);
      await page.mouse.move(0, 0);
      await page.screenshot({ path: `tmp/ui-wrap-833/${stage}-${width}-${name}.png` });
      results.push(await page.locator(selector).first().evaluate((el, info) => {
        const style = getComputedStyle(el), rect = el.getBoundingClientRect();
        return { ...info, text: el.textContent, wordBreak: style.wordBreak, overflowWrap: style.overflowWrap,
          fits: el.scrollWidth <= el.clientWidth, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          dpr: devicePixelRatio, zoom: getComputedStyle(document.documentElement).zoom, font: style.fontFamily, fonts: document.fonts.status };
      }, { stage, width, language, theme, name }));
    };
    await capture('draft-form', '.message-text');
    await capture('property-hint', '.form-hint');
    await page.getByRole('button', { name: language === 'ko' ? '설정' : 'Settings', exact: true }).click();
    await expect(page.getByTestId('settings-back')).toBeFocused();
    await page.getByRole('button', { name: language === 'ko' ? '저장·복구' : 'Saving & recovery', exact: true }).click();
    await capture('settings', '.settings-label p');
    await page.keyboard.press('Escape');
    await page.getByTestId('settings-dialog').waitFor({ state: 'detached' });
    await page.locator('.document-tab[data-selected=true] .document-tab-close').click();
    await page.getByRole('dialog').waitFor();
    await capture('confirm', '[data-slot=dialog-description]');
    await page.getByRole('button', { name: language === 'ko' ? '취소' : 'Cancel', exact: true }).click();
    await page.getByRole('dialog').waitFor({state:'detached'});
    await page.getByTestId('equation-cancel').click();
    await page.evaluate(async () => (await import('/src/i18n.ts')).i18n.changeLanguage('en'));
    await openPath(page, [...root, 'tmp', 'reference-save-reload', 'fixed.md'].join(sep));
    await page.evaluate(async language => (await import('/src/i18n.ts')).i18n.changeLanguage(language), language);
    await page.locator('[data-document-tab][data-active=true] .document-editor').evaluate(el => {
      const editor = el.editor;
      editor.state.doc.forEach((node, pos) => {
        if (node.attrs.label === 'fixed-table') editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, enumerator: null }));
      });
    });
    await expect(page.locator('.notification-center')).toBeVisible();
    await capture('notifications', '.notification-center li');
    if (width === 640) {
      await page.evaluate(async () => {
        const { recoveryStorage } = await import('/src/recovery-storage.ts');
        window.wrapOriginalList = recoveryStorage.list;
        recoveryStorage.list = async () => { throw new Error('https://example.com/' + 'OversizedIdentifier'.repeat(30)); };
        window.dispatchEvent(new Event('focus'));
      });
      try {
        const warning = page.locator('.notification-center li').filter({ hasText: 'OversizedIdentifier' });
        await expect(warning).toBeVisible();
        const geometry = await warning.evaluate(el => ({
          contentFits: el.scrollWidth <= el.clientWidth,
          right: el.getBoundingClientRect().right,
          pageFits: document.documentElement.scrollWidth <= innerWidth,
          viewport: innerWidth,
        }));
        expect(geometry.contentFits && geometry.pageFits).toBe(true);
        expect(geometry.right).toBeLessThanOrEqual(geometry.viewport);
        await capture('long-token', '.notification-center li');
        results.push({ longTokenGeometry: geometry });
      } finally {
        await page.evaluate(async () => {
          const { recoveryStorage } = await import('/src/recovery-storage.ts');
          recoveryStorage.list = window.wrapOriginalList;
          window.dispatchEvent(new Event('focus'));
        });
      }
    }
  }
  await page.evaluate(async () => (await import('/src/i18n.ts')).i18n.changeLanguage('en'));
  return { results, userAgent: await page.evaluate(() => navigator.userAgent) };
}
