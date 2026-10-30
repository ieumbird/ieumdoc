// Manual visual review only. Temporarily copy this file to
// apps/editor/test/empty-entry-capture.browser.js, run pnpm browser:test empty-entry-capture,
// then remove that copy before running Editor unit tests. No stable-suite registration.
async (page, { openPath, expect }) => {
  const phase = 'after';
  const initial = await (await page.request.get(page.url().split('/').slice(0,3).join('/') + '/api/document')).json();
  const sep = initial.path.includes('\\') ? '\\' : '/';
  const file = [...initial.path.split(sep).slice(0,-4), 'tmp', 'pending-figure', 'pending.md'].join(sep);
  const measurements = [];
  for (const [width, theme, language] of [[1440,'light','en'],[1440,'dark','en'],[640,'light','ko']]) {
    await page.setViewportSize({width,height:900});
    await page.evaluate(({theme,language}) => {
      localStorage.setItem('ieumdoc.theme',theme);
      localStorage.setItem('ieumdoc.uiLanguage','en');
      localStorage.removeItem('ieumdoc.openTabs');
    }, {theme,language});
    await page.reload();
    await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
    await openPath(page,file);
    await page.evaluate(async language => { const { i18n } = await import('/src/i18n.ts'); await i18n.changeLanguage(language); },language);
    const title = page.locator('[data-document-tab][data-active=true] [data-document-title]');
    const capture = async state => {
      await page.evaluate(async () => { await document.fonts.ready; });
      await page.mouse.move(0,0);
      await page.screenshot({path:`docs/design/assets/empty-entry-786/${phase}-${width}-${theme}-${language}-${state}.png`,animations:'disabled'});
      measurements.push({width,theme,language,state,...await title.evaluate(n => {
        const box = n.getBoundingClientRect(), style = getComputedStyle(n), hint = getComputedStyle(n,'::placeholder');
        return {height:box.height,font:style.fontSize,placeholderFont:hint.fontSize,
          placeholderLineHeight:hint.lineHeight,
          hintCenterOffset:parseFloat(style.borderTopWidth) + parseFloat(style.paddingTop) + parseFloat(hint.lineHeight) / 2 - box.height / 2,
          focused:n === document.activeElement,focusOutlineOffset:style.outlineOffset};
      })});
    };
    await expect(title).toHaveValue('');
    await capture('empty-title');
    await title.fill(language === 'ko' ? '전력 변환기 설계' : 'Converter control design');
    await capture('typing-title');
    await title.fill('');
    await page.getByText('Intro.',{exact:true}).filter({visible:true}).hover();
    await page.locator('[data-document-tab][data-active=true] .document-editor').evaluate(async n => {
      const { INSERT_COMMANDS } = await import('/src/block-commands.ts');
      n.editor.view.dispatch(INSERT_COMMANDS.find(c => c.id === 'figure').run(n.editor.state,0));
    });
    await expect(page.getByTestId('figure-no-content')).toBeVisible();
    await capture('pending-figure');
  }
  return measurements;
}
