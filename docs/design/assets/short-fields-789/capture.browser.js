// Copy temporarily to apps/editor/test/manual-short-fields-789.browser.js, then run
// pnpm browser:test manual-short-fields-789 and remove the temporary copy afterward.
// Manual visual evidence only; short-field-errors owns the behavior assertions.
async (page, {openPath}) => {
  const origin = page.url().split('/').slice(0, 3).join('/');
  const loaded = (await (await page.request.get(`${origin}/api/document`)).json()).path;
  const sep = loaded.includes('\\') ? '\\' : '/';
  const file = [...loaded.split(sep).slice(0,-4), 'tmp', 'short-fields', 'fields.md'].join(sep);
  for (const [width,language,theme] of [[1440,'en','light'],[640,'ko','dark']]) {
    await page.setViewportSize({width,height:900});
    await page.evaluate(({language,theme}) => {
      localStorage.setItem('ieumdoc.uiLanguage',language);
      localStorage.setItem('ieumdoc.theme',theme);
    },{language,theme});
    await page.reload();
    await page.locator('[data-testid="status"][data-operation="ready"]').waitFor();
    if (language === 'en') await openPath(page,file);
    const active = page.locator('[data-document-tab][data-active=true]');
    await active.locator('.ProseMirror').waitFor();
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.querySelectorAll('.document img')].map(image => image.decode()));
    });
    const align = async (block,top) => {
      await block.evaluate((element,top) => {
        const scroll = element.closest('.document-scroll');
        scroll.scrollTop += element.getBoundingClientRect().top - top;
      },top);
      await page.mouse.move(0,0);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    };
    const figure = active.locator('[data-block="figure"]').first();
    await figure.hover({position:{x:4,y:4}});
    await figure.locator('.figure-edit').click();
    await page.getByTestId('figure-label').fill(' bad-label');
    await page.getByTestId('figure-apply').click();
    await align(figure,550);
    if (width === 640) await page.screenshot({path:'tmp/short-fields-review/640-figure.png'});
    await page.getByTestId('figure-label').press('Escape');
    const table=active.locator('[data-block="table"]').first();
    await table.hover({position:{x:4,y:4}});
    await table.getByRole('button',{name:language==='en'?'Edit table':'표 편집',exact:true}).click();
    await page.getByTestId('table-label').fill(' bad-label');
    await page.getByTestId('table-apply').click();
    await align(table,400);
    if (width === 1440) await page.screenshot({path:'tmp/short-fields-review/1440-table.png'});
    await page.getByTestId('table-cancel').click();
  }
}
