// Disposable manual capture scenario, invoked only through pnpm browser:test.
// Copy to apps/editor/test/table-handles-capture.browser.js; remove after capture.
async (page, {openPath}) => {
  page.setDefaultTimeout(15000);
  await page.unrouteAll();
  const origin = page.url().split('/').slice(0,3).join('/');
  const loaded = await (await page.request.get(`${origin}/api/document`)).json();
  const sep = loaded.path.includes('\\') ? '\\' : '/';
  const root = loaded.path.split(sep).slice(0, -4).join(sep);
  const file = [root, 'tmp', 'table-authoring', 'tables.md'].join(sep);
  const results = [];
  for (const locale of ['en', 'ko']) for (const width of [1440, 390]) {
    await page.setViewportSize({width, height:900});
    await page.evaluate(() => localStorage.setItem('ieumdoc.uiLanguage', 'en'));
    await page.reload();
    await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
    await openPath(page, file);
    await page.getByRole('dialog').waitFor({state:'detached'});
    if (locale === 'ko') {
      const expand = page.getByRole('button',{name:'Expand sidebar',exact:true});
      if (await expand.isVisible()) await expand.click();
      await page.getByRole('button',{name:'Settings',exact:true}).click();
      await page.getByTestId('ui-language').selectOption('ko');
      await page.keyboard.press('Escape');
      await page.getByTestId('settings-dialog').waitFor({state:'detached'});
      const collapse = page.getByRole('button',{name:'사이드바 접기',exact:true});
      if (width < 640 && await collapse.isVisible()) await collapse.click();
    }
    const table = page.locator('[data-document-tab][data-active=true] .table-block').first();
    await table.locator('td').first().click();
    await table.locator('.table-scroll').evaluate(scroll => { scroll.scrollLeft = scroll.scrollWidth; });
    await page.mouse.move(0,0);
    await page.evaluate(async () => { await document.fonts.ready; window.scrollTo(0,0); });
    await page.screenshot({path:`tmp/517/PHASE/${locale}-${width}-active.png`});
    results.push(await table.evaluate((table, input) => ({...input, state:'active',
      dpr:devicePixelRatio, zoom:visualViewport.scale, scrollY,
      scrollLeft:table.querySelector('.table-scroll').scrollLeft,
      font:getComputedStyle(table).fontFamily,
      userAgent:navigator.userAgent,
      handles:[...table.querySelectorAll('.table-row-handle,.table-column-handle')].map(n=>({name:n.getAttribute('aria-label'),title:n.title,text:n.textContent,rect:n.getBoundingClientRect().toJSON()}))
    }), {locale,width}));
    await page.evaluate(() => document.activeElement?.blur());
    await page.mouse.move(0,0);
    await page.getByText('Intro paragraph.',{exact:true}).filter({visible:true}).click();
    await page.evaluate(() => document.activeElement?.blur());
    await page.mouse.move(0,0);
    await page.screenshot({path:`tmp/517/PHASE/${locale}-${width}-rest.png`});
    await table.hover();
    await table.locator('.table-column-handle').last().focus();
    await page.mouse.move(0,0);
    await page.keyboard.press('Enter');
    await page.getByRole('menu').waitFor();
    await page.screenshot({path:`tmp/517/PHASE/${locale}-${width}-keyboard-menu.png`});
    await page.keyboard.press('Escape');
  }
  await page.evaluate(()=>localStorage.setItem('ieumdoc.uiLanguage','en'));
  return results;
}
