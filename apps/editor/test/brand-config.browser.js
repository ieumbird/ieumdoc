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
      for (const width of [1440,640]) {
        await page.setViewportSize({width,height:900});
        if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw Error('Brand copy overflows the viewport');
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
