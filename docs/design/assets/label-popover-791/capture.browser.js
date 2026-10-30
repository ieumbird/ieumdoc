async (page, {openPath, expect}) => {
  const origin = page.url().split('/').slice(0,3).join('/');
  const initial = await (await page.request.get(`${origin}/api/document`)).json();
  const sep = initial.path.includes('\\') ? '\\' : '/';
  const file = [...initial.path.split(sep).slice(0,-4), 'tmp', 'property-drafts', 'drafts.md'].join(sep);
  for (const [width, language, theme] of [[1440,'en','light'],[640,'ko','dark']]) {
    await page.setViewportSize({width,height:900});
    await page.evaluate(({language,theme}) => {localStorage.setItem('ieumdoc.uiLanguage',language);localStorage.setItem('ieumdoc.theme',theme);}, {language,theme});
    await page.reload();
    await page.getByTestId('status').waitFor();
    await page.evaluate(() => document.fonts.ready);
    if (width === 1440) await openPath(page,file);
    const active = page.locator('[data-document-tab][data-active=true]');
    const table = active.locator('[data-block="table"]');
    await table.hover({position:{x:4,y:4}});
    await table.getByRole('button',{name:language==='en'?'Edit table':'표 편집',exact:true}).click();
    await page.getByTestId('table-label').fill('table-example');
    await page.screenshot({path:`tmp/791-captures/table-${width}.png`});
    await page.getByTestId('table-label').press('Escape');
    await active.locator('h2').hover();
    await active.getByTestId('label-target-edit').click();
    await page.getByTestId('label-target-input').fill('section-example');
    await page.screenshot({path:`tmp/791-captures/section-${width}.png`});
    await page.getByTestId('label-target-input').press('Escape');
  }
  await page.setViewportSize({width:1440,height:900});
  const table = page.locator('[data-document-tab][data-active=true] [data-block="table"]');
  await table.hover({position:{x:4,y:4}});
  await table.getByRole('button',{name:'표 편집',exact:true}).click();
  expect(await page.getByTestId('table-apply').innerText(), 'short metadata uses Done').toBe('완료');
}
