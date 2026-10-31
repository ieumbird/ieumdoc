// Manual real-service proof. Not part of the stable suite; explicitly requires the external server.
async (page, { expect, openFolderPicker, doclingFixture: fixture }) => {
  page.setDefaultTimeout(60000);
  await page.evaluate(() => { localStorage.setItem('litzio.uiLanguage', 'en'); localStorage.setItem('litzio.theme', 'light'); });
  await page.reload();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Docling', exact: true }).click();
  await page.getByRole('textbox', { name: 'Server address' }).fill(fixture.url);
  await page.getByRole('button', { name: 'Check connection', exact: true }).click();
  await expect(page.locator('#docling-server-result')).toContainText('ready and compatible');
  await page.screenshot({ path: `${fixture.captures}/real-settings-en-1440.png` });
  await page.getByTestId('settings-back').click();
  const separator = fixture.input.includes('\\') ? '\\' : '/';
  await openFolderPicker(page);
  await page.getByTestId('folder-path').fill(fixture.input.split(separator).slice(0, -1).join(separator));
  await page.getByTestId('folder-open').click();
  await page.locator('[role=treeitem]').filter({ hasText: 'nist-source.pdf' }).click({ button: 'right' });
  await page.screenshot({ path: `${fixture.captures}/real-pdf-menu-en-1440.png` });
  await page.getByRole('menuitem', { name: 'Convert with Docling' }).click();
  const progress = page.getByTestId('docling-conversion');
  await progress.getByRole('button', { name: 'Start conversion' }).click();
  await expect(progress).toContainText('Server task');
  await page.screenshot({ path: `${fixture.captures}/real-progress-en-1440.png` });
  await page.waitForFunction(() => document.querySelector('.docling-tab[data-active=true] .docling-source img') ||
    document.querySelector('[data-testid=docling-conversion]')?.textContent.includes('Docling conversion failed.'), null, { timeout: 600000 });
  const current = await (await page.request.get(page.url().split('/').slice(0, 3).join('/') + '/api/docling-conversion')).json();
  expect(current.state).toBe('success');
  const record = fixture.result(current.output);
  await page.screenshot({ path: `${fixture.captures}/real-completed-en-1440.png` });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Appearance & language', exact: true }).click();
  await page.getByTestId('theme').selectOption('dark');
  await page.getByTestId('ui-language').selectOption('ko');
  await page.getByTestId('settings-back').click();
  await page.screenshot({ path: `${fixture.captures}/real-completed-dark-ko-1440.png` });
  await page.setViewportSize({ width: 640, height: 1000 });
  await page.screenshot({ path: `${fixture.captures}/real-completed-dark-ko-640.png` });
  return { input: fixture.input, output: current.output, taskId: record.taskId, elapsedMs: record.elapsedMs,
    pages: record.document.pages, images: record.images.length, verification: record.verification, server: record.server };
}
