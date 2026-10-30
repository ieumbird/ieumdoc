// Manual capture only: copy temporarily into apps/editor/test/inline-form-capture.browser.js,
// run pnpm browser:test inline-form-capture, then remove the temporary scenario.
async (page, { openPath, expect }) => {
  const origin = page.url().split('/').slice(0,3).join('/');
  const initial = await (await page.request.get(`${origin}/api/document`)).json();
  const sep = initial.path.includes('\\') ? '\\' : '/';
  const root = initial.path.split(sep).slice(0,-4);
  const results = [];
  for (const [width, language, theme] of [[1440,'en','light'],[640,'ko','dark']]) {
    await page.setViewportSize({width,height:900});
    await page.evaluate(async ({language,theme}) => {
      (await import('/src/theme.ts')).applyTheme(theme);
      await (await import('/src/i18n.ts')).i18n.changeLanguage(language);
    }, {language,theme});
    for (const kind of ['link','reference']) {
      await page.evaluate(async () => (await import('/src/i18n.ts')).i18n.changeLanguage('en'));
      const file = [...root,'tmp',kind === 'link' ? 'link-authoring' : 'cross-reference',kind === 'link' ? 'links.md' : 'refs.md'].join(sep);
      await openPath(page,file);
      await page.evaluate(async language => (await import('/src/i18n.ts')).i18n.changeLanguage(language), language);
      if (kind === 'link') {
        await page.evaluate(() => {
          const editor = document.querySelector('[data-document-tab][data-active=true] .document-editor').editor;
          editor.view.focus();
          let range;
          editor.state.doc.descendants((node,pos) => { if (!range && node.isText && node.text.includes('OpenAI')) range = {from:pos,to:pos+6}; });
          editor.commands.setTextSelection(range);
        });
        await page.keyboard.press('Control+Quote');
        await page.getByTestId('link-url').fill('https://example.com/unapplied');
      } else {
        const chip = page.locator('[data-document-tab][data-active=true]').getByTestId('cross-reference').first();
        await chip.hover();
        await chip.getByTestId('cross-reference-edit').click();
        await page.getByTestId('reference-target').selectOption('reference:eq:eq-b');
      }
      await page.evaluate(() => document.fonts.ready);
      const stage = await page.getByTestId(`${kind}-cancel`).count() ? 'after' : 'before';
      await page.screenshot({path:`tmp/790/${stage}-${width}-${kind}.png`});
      await page.locator('.app-brand').click({position:{x:2,y:2}});
      results.push({stage,width,language,theme,kind,file,retained:await page.getByTestId(`${kind}-form`).count() === 1});
      if (await page.getByTestId(`${kind}-form`).count()) await page.getByTestId(kind === 'link'?'link-url':'reference-target').press('Escape');
    }
  }
  for (const result of results) expect(result.retained).toBe(result.stage === 'after');
  return {results,environment:await page.evaluate(() => ({userAgent:navigator.userAgent,dpr:devicePixelRatio,zoom:getComputedStyle(document.documentElement).zoom,fonts:document.fonts.status}))};
}
