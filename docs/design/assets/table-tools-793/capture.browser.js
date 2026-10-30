// Manual comparison only. Copy to apps/editor/test/manual-table-tools-793.browser.js,
// replace PHASE with before/after, then run pnpm browser:test manual-table-tools-793.
// Remove the temporary runner entry after use; this is not a stable test scenario.
async (page, {openPath}) => {
  const origin = page.url().split('/').slice(0,3).join('/');
  const loaded = await (await page.request.get(`${origin}/api/document`)).json();
  const sep = loaded.path.includes('\\') ? '\\' : '/';
  const file = [...loaded.path.split(sep).slice(0,-4),'tmp','table-authoring','tables.md'].join(sep);
  await page.evaluate(async () => {
    await (await import('/src/i18n.ts')).i18n.changeLanguage('en');
    (await import('/src/theme.ts')).applyTheme('light');
  });
  await openPath(page,file);
  const table = page.locator('[data-document-tab][data-active=true] [data-block="table"]');
  await table.locator('td').first().click();
  for (let i=0;i<5;i++) await table.getByRole('button',{name:'Append column',exact:true}).click();
  await table.getByLabel('Table caption',{exact:true}).click();
  await page.keyboard.type('Measured results for the seven sample conditions, with a caption that wraps at narrow widths.');
  for (const [width,language,theme] of [[1440,'en','light'],[640,'ko','dark']]) {
    await page.setViewportSize({width,height:900});
    await page.evaluate(async ({language,theme}) => {
      await (await import('/src/i18n.ts')).i18n.changeLanguage(language);
      (await import('/src/theme.ts')).applyTheme(theme);
    },{language,theme});
    await page.evaluate(() => document.fonts.ready);
    await table.locator('.table-scroll').evaluate(n => n.scrollLeft=0);
    await table.hover({position:{x:8,y:8}});
    await page.screenshot({path:`docs/design/assets/table-tools-793/PHASE-${width}.png`});
    await table.locator('.table-scroll').evaluate(n => n.scrollLeft=n.scrollWidth);
    await table.hover({position:{x:8,y:8}});
    await page.screenshot({path:`docs/design/assets/table-tools-793/PHASE-${width}-scrolled.png`});
    await table.getByRole('button',{name:await page.evaluate(async () => (await import('/src/i18n.ts')).i18n.t('Table actions')),exact:true}).click();
    await page.getByRole('menu').waitFor();
    await page.screenshot({path:`docs/design/assets/table-tools-793/PHASE-${width}-menu.png`});
    await page.keyboard.press('Escape');
  }
  await table.getByRole('button',{name:'표 편집',exact:true}).click();
  await page.getByTestId('table-label').waitFor();
  await page.screenshot({path:'docs/design/assets/table-tools-793/PHASE-640-properties.png'});
  await page.keyboard.press('Escape');
  await page.setViewportSize({width:1440,height:900});
  await page.evaluate(async () => {
    await (await import('/src/i18n.ts')).i18n.changeLanguage('en');
    (await import('/src/theme.ts')).applyTheme('light');
  });
  await openPath(page,loaded.path);
  for (const kind of ['figure','equation']) {
    const block = page.locator(`[data-document-tab][data-active=true] [data-block="${kind}"]`).first();
    await block.scrollIntoViewIfNeeded();
    await block.hover();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({path:`docs/design/assets/table-tools-793/PHASE-${kind}-comparison.png`});
  }
  return await page.evaluate(() => ({userAgent:navigator.userAgent,dpr:devicePixelRatio,
    viewport:{width:innerWidth,height:innerHeight},font:getComputedStyle(document.body).fontFamily}));
}
