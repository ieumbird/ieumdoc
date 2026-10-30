// Copy to apps/editor/test/manual-mermaid-badge-771.browser.js, run with
// IEUMDOC_BROWSER_URL=http://127.0.0.1:5283 pnpm browser:test manual-mermaid-badge-771,
// then remove the temporary copy. Manual evidence; mermaid-authoring owns assertions.
async (page, {openPath, expect}) => {
  const origin = page.url().split('/').slice(0,3).join('/');
  const loaded = (await (await page.request.get(`${origin}/api/document`)).json()).path;
  const sep = loaded.includes('\\') ? '\\' : '/';
  const file = [...loaded.split(sep).slice(0,-4), 'tmp','mermaid-authoring','diagram.md'].join(sep);
  const measurements = [];
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
    const figure = active.locator('[data-content-kind="mermaid"]').first();
    await expect(figure.getByTestId('mermaid-preview')).toHaveAttribute('aria-busy','false');
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.querySelectorAll('.document-editor img')].map(image=>image.decode()));
    });
    await active.getByText('Before.',{exact:true}).click();
    await figure.evaluate(el=>el.closest('.document-scroll').scrollTop=0);
    await page.mouse.move(0,0);
    const phase = await figure.getByTestId('mermaid-kind').count() ? 'after' : 'before';
    await page.screenshot({path:`docs/design/assets/mermaid-badge-771/${phase}-${width}-rest.png`});
    await figure.hover({position:{x:4,y:4}});
    await page.screenshot({path:`docs/design/assets/mermaid-badge-771/${phase}-${width}-hover.png`});
    measurements.push(await figure.evaluate(el=>{
      const rect = target => target ? target.getBoundingClientRect().toJSON() : null;
      return {figure:rect(el),badge:rect(el.querySelector('[data-testid="mermaid-kind"]')),
        metadata:rect(el.querySelector('.block-metadata')),edit:rect(el.querySelector('.figure-edit')),
        image:rect(el.parentElement.querySelector('figure:not([data-content-kind="mermaid"])')),
        overflow:document.documentElement.scrollWidth>innerWidth,dpr:devicePixelRatio};
    }));
  }
  return measurements;
}
