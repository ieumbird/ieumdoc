// Manual visual review only: copy to apps/editor/test/equation-capture-788.browser.js,
// run pnpm browser:test equation-capture-788 with IEUMDOC_BROWSER_URL pointing at
// this checkout's server, then remove the temporary scenario. Never add it to stable.
// Before uses b9b2b8e9's equation-view.tsx; restore the working source afterwards.
async (page, {openPath}) => {
  const initial = await (await page.request.get(page.url().split('/').slice(0,3).join('/') + '/api/document')).json();
  const sep = initial.path.includes('\\') ? '\\' : '/';
  const file = [...initial.path.split(sep).slice(0,-4), 'tmp', 'short-fields', 'fields.md'].join(sep);
  for (const [width, language, theme] of [[1440,'en','light'],[640,'ko','dark']]) {
    await page.setViewportSize({width,height:900});
    await page.evaluate(({language,theme}) => { localStorage.setItem('ieumdoc.uiLanguage',language); localStorage.setItem('ieumdoc.theme',theme); }, {language,theme});
    await page.reload();
    await page.getByTestId('status').waitFor();
    if (width === 1440) await openPath(page,file);
    await page.evaluate(() => document.fonts.ready);
    const dismiss = page.locator('.notification-center li > button');
    if (await dismiss.count()) await dismiss.first().click();
    const equation = page.locator('[data-document-tab][data-active=true] [data-block="equation"]').first();
    await equation.hover();
    await equation.getByRole('button',{name:language==='en'?'Edit':'편집',exact:true}).click();
    const after = await page.getByTestId('equation-property-label').count() > 0;
    const field = page.getByTestId(after ? 'equation-property-label' : 'equation-label');
    await field.fill('eq-example');
    await page.getByTestId(after ? 'equation-property-editor' : 'equation-editor').getByRole('button',{name:language==='en'?'Fixed':'고정',exact:true}).click();
    const enumerator = page.getByTestId(after ? 'equation-property-enumerator' : 'equation-enumerator');
    await enumerator.fill('A.1');
    // Dismiss unrelated startup warnings by keyboard, without outside-applying metadata.
    const lateDismiss = page.locator('.notification-center li > button');
    if (await lateDismiss.count()) { await lateDismiss.first().press('Enter'); await enumerator.focus(); }
    await page.screenshot({path:`tmp/788-captures/${after?'after':'before'}-${width}.png`});
    await field.press('Escape');
  }
}
