// Product identity, localized copy and pre-paint preferences share one build setting.
async (page, { brand, expect, screenshots }) => {
  const previousLanguage = await page.evaluate(prefix => localStorage.getItem(`${prefix}.uiLanguage`), brand.storagePrefix);
  try {
    await page.route(/\/api\/document$/, route => route.request().method() === 'GET'
      ? route.fulfill({json:{start:true}}) : route.continue());
    for (const language of ['en','ko']) {
      await page.evaluate(({brand,language}) => {
        localStorage.clear();
        localStorage.setItem(`${brand.storagePrefix}.uiLanguage`, language);
        localStorage.setItem(`${brand.storagePrefix}.theme`, 'dark');
        localStorage.setItem(`${brand.storagePrefix}.pageBackground`, 'flat');
      }, {brand,language});
      await page.reload();
      const start = page.getByTestId('document-start');
      await expect(start).toBeVisible();
      await expect(start.locator('.document-start-product')).toHaveText(brand.name[language]);
      await expect(start.getByRole('heading',{level:1})).toContainText(brand.name[language]);
      await expect(page).toHaveTitle(brand.name[language]);
      await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
      await expect(page.locator('html')).toHaveAttribute('data-page','flat');
      // Switching the saved background survives the same startup path; captures match the baseline.
      await page.evaluate(prefix => localStorage.setItem(`${prefix}.pageBackground`, 'paper'), brand.storagePrefix);
      await page.reload();
      await expect(start).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-page','paper');
      await page.evaluate(() => document.fonts.ready);
      for (const [selector, source] of [['.document-start-mark', brand.icons.png], ['.app-brand img', brand.icons.png]]) {
        const mark = page.locator(selector);
        await expect(mark).toBeVisible();
        if (!(await mark.getAttribute('src')).includes(source.split('/').pop())) throw Error('Product mark ignores the configured PNG');
        if (!await mark.evaluate(async image => { await image.decode(); return image.naturalWidth === 1024 && image.naturalHeight === 1024; })) throw Error('Product PNG did not decode');
      }
      const favicon = page.locator('link[rel="icon"]');
      await expect(favicon).toHaveAttribute('type', 'image/png');
      if (!(await favicon.getAttribute('href')).includes(brand.icons.smallPng.split('/').pop())) throw Error('Favicon ignores the configured small PNG');
      for (const width of [1440,640]) {
        await page.setViewportSize({width,height:900});
        if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw Error('Brand copy overflows the viewport');
        const aligned = await page.locator('.app-brand img').evaluate(image => {
          const icon = image.getBoundingClientRect(), row = image.parentElement.getBoundingClientRect();
          return icon.left >= row.left && icon.right <= row.right && icon.top >= row.top && icon.bottom <= row.bottom
            && Math.abs((icon.top + icon.bottom - row.top - row.bottom) / 2) <= 1;
        });
        if (!aligned) throw Error('Header mark is clipped or vertically misaligned');
        if (screenshots) await page.screenshot({path:`tmp/859-brand/after-${width}-${language}-dark.png`});
      }
    }
  } finally {
    await page.evaluate(({prefix,language}) => {
      if (language === null) localStorage.removeItem(`${prefix}.uiLanguage`);
      else localStorage.setItem(`${prefix}.uiLanguage`, language);
    }, {prefix:brand.storagePrefix, language:previousLanguage});
  }
}
