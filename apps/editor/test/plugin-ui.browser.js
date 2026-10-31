async (page, { expect, openPath, pluginFixture, screenshots }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: /^(Settings|설정)$/ }).click();
  await page.getByTestId('ui-language').selectOption('en');
  await page.getByTestId('settings-back').click();
  await openPath(page, pluginFixture.document);
  const nativeTabId = await page.getByRole('tablist', { name: 'Documents', exact: true }).getByRole('tab', { selected: true }).getAttribute('id');
  const native = page.locator('.document-scroll[data-active=true] .ProseMirror');
  await native.locator('p').first().click();
  await page.keyboard.press('End'); await page.keyboard.type(' retained draft');
  await native.evaluate(element => { globalThis.__uiOriginalDocument = element; });
  const timeOrigin = await page.evaluate(() => performance.timeOrigin);
  const origin = page.url().split('/').slice(0, 3).join('/');
  const register = async manifest => {
    const response = await page.request.post(origin + '/api/worker-plugins', { headers: { Origin: origin }, data: { manifest } });
    expect(response.status(), await response.text()).toBe(200);
  };
  const disable = async () => {
    const response = await page.request.delete(origin + '/api/worker-plugins', { headers: { Origin: origin }, data: { id: 'fixture' } });
    expect(response.status()).toBe(200);
  };
  const center = page.getByRole('dialog', { name: 'Command center', exact: true });
  const command = center.getByRole('option', { name: 'Fixture command', exact: true });
  let manifest = pluginFixture.write('ready');
  try {
    await page.keyboard.press('Control+Slash');
    await center.getByRole('combobox').fill('> Fixture command');
    await expect(command).toHaveCount(0);
    await register(manifest);
    await expect(command).toBeVisible(); await command.click();
    await expect(page.getByRole('button', { name: 'Fixture sidebar', exact: true })).toBeVisible();
    const tab = page.getByRole('tab', { name: / · Fixture view$/ });
    const id = await tab.getAttribute('id');
    await page.getByRole('button', { name: 'Fixture count 0' }).click();
    await expect(page.getByRole('button', { name: 'Fixture count 1' })).toBeVisible();
    await page.keyboard.press('Control+Slash');
    await center.getByRole('combobox').fill('> Fixture command');
    await disable(); await expect(command).toHaveCount(0);
    await center.press('Escape');
    await expect(page.getByText('Plugin is disabled.', { exact: true })).toBeVisible();
    expect(await page.locator('link[rel=stylesheet][href*="id=fixture"]').count()).toBe(0);
    expect(await page.evaluate(() => globalThis.__uiFixtureMountedAtDispose)).toEqual([0]);
    await expect(tab).toHaveAttribute('id', id);
    await expect(page.getByRole('button', { name: 'Fixture sidebar', exact: true })).toHaveCount(0);
    if (screenshots) {
      await page.screenshot({ path: 'tmp/857-evidence/disabled-1440-light-en.png' });
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      await page.getByTestId('ui-language').selectOption('ko'); await page.getByTestId('theme').selectOption('dark');
      await page.setViewportSize({ width: 640, height: 1000 }); await page.getByTestId('settings-back').click();
      await expect(page.getByText('플러그인이 꺼져 있습니다.', { exact: true })).toBeVisible();
      await page.screenshot({ path: 'tmp/857-evidence/disabled-640-dark-ko.png' });
      await page.getByRole('button', { name: '설정', exact: true }).click();
      await page.getByTestId('ui-language').selectOption('en'); await page.getByTestId('theme').selectOption('light');
      await page.setViewportSize({ width: 1440, height: 1000 }); await page.getByTestId('settings-back').click();
    }
    // Same installed bytes/module URL; activation is new and local view state resets.
    await register(manifest);
    await expect(page.getByRole('button', { name: 'Fixture count 0' })).toBeVisible();
    await expect(tab).toHaveAttribute('id', id);
    expect(await page.evaluate(() => globalThis.__uiFixtureEvaluations)).toBe(1);
    expect(await page.evaluate(() => globalThis.__uiFixtureDisposals)).toBe(1);
    expect(await page.locator('link[rel=stylesheet][href*="id=fixture"]').count()).toBe(1);
    manifest = pluginFixture.write('render-error'); await register(manifest);
    await expect(page.getByRole('alert').filter({ hasText: 'Plugin view failed.' })).toBeVisible();
    if (screenshots) await page.screenshot({ path: 'tmp/857-evidence/render-error-1440-light-en.png' });
    manifest = pluginFixture.write('load-error'); await register(manifest);
    await expect(page.getByText('Plugin could not load.', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Fixture sidebar', exact: true })).toHaveCount(0);
    // Refuse an incompatible listing before either asset is requested.
    let futureAssets = 0;
    await page.route('**/api/ui-plugins?*id=future*', route => { futureAssets++; return route.abort(); });
    await page.route('**/api/ui-plugins', async route => {
      const response = await route.fetch(); const items = await response.json();
      await route.fulfill({ response, json: [...items, { id: 'future', revision: 'future', ui: { api: 999, reactMajor: 19, script: 'ui.mjs', style: 'ui.css' } }] });
    });
    await expect(page.getByText(/future: Error: Incompatible UI Host API/)).toBeVisible();
    expect(futureAssets).toBe(0);
    await page.unroute('**/api/ui-plugins');
    manifest = pluginFixture.write('ready'); await register(manifest);
    await expect(page.getByRole('button', { name: 'Fixture count 0' })).toBeVisible();
    await expect(tab).toHaveAttribute('id', id);
    await page.locator('#' + nativeTabId).click();
    const preserved = page.locator('.document-scroll[data-active=true] .ProseMirror');
    expect(await preserved.evaluate(element => element === globalThis.__uiOriginalDocument)).toBe(true);
    await expect(preserved).toContainText('retained draft');
    await preserved.locator('p').first().click(); await page.keyboard.press('End'); await page.keyboard.type(' after faults');
    await expect(preserved).toContainText('after faults');
    expect(await page.evaluate(() => performance.timeOrigin)).toBe(timeOrigin);
  } finally { await disable(); }
  return { reloaded: false, nativeDocumentPreserved: true, retainedTab: true, injectedReactHooks: true };
}
