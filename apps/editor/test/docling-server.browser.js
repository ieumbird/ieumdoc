// Real Host → fake HTTP Docling. Browser routing never simulates conversion decisions.
async (page, { expect, openFolderPicker, doclingFixture: fixture, screenshots }) => {
  let initialReadLost = false, conversionPosts = 0, acceptedId;
  const transport = async route => {
    if (route.request().method() === 'GET' && !initialReadLost) { initialReadLost = true; return route.abort('failed'); }
    if (route.request().method() === 'POST') {
      conversionPosts++;
      if (conversionPosts === 1) {
        const response = await route.fetch();
        expect(response.ok()).toBe(true);
        acceptedId = (await response.json()).id;
        return route.abort('failed'); // The Host accepted the job; only its response is lost.
      }
    }
    return route.continue();
  };
  await page.route('**/api/docling-conversion', transport);
  await page.evaluate(() => { localStorage.setItem('ieumdoc.uiLanguage', 'en'); localStorage.setItem('ieumdoc.theme', 'light'); });
  const initialRecovery = page.waitForResponse(response => response.url().endsWith('/api/docling-conversion') && response.request().method() === 'GET' && response.ok());
  await page.reload();
  await initialRecovery;
  await page.setViewportSize({ width: 1440, height: 1000 });
  const capture = async name => { if (screenshots) { await page.evaluate(() => document.fonts.ready); await page.screenshot({ path: `${fixture.captures}/${name}.png` }); } };
  const settings = async () => {
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'Docling', exact: true }).click();
  };
  await settings();
  const field = page.getByRole('textbox', { name: 'Server address' });
  const addressRow = async () => {
    const a = await page.locator('#docling-server').boundingBox();
    const b = await page.getByRole('button', { name: /^(Check connection|연결 확인)$/ }).boundingBox();
    expect(b.x).toBeGreaterThanOrEqual(a.x + a.width);
    expect(Math.abs(a.y + a.height / 2 - b.y - b.height / 2)).toBeLessThan(2);
  };
  const check = async () => {
    await page.getByRole('button', { name: 'Check connection', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Check connection', exact: true })).toBeEnabled();
  };
  await field.fill(fixture.url);
  await check();
  // Busy completion is followed by a direct state assertion, without reload/poll masking it.
  expect(await page.locator('#docling-server-result').textContent()).toContain('ready and compatible');
  expect(await page.locator('#docling-server-result').textContent()).toContain('differs from the profile');
  await addressRow();
  await expect(page.getByRole('link', { name: 'Server setup guide' })).toHaveAttribute('href', 'https://github.com/ieumbird/ieumdoc/blob/master/docs/guides/docling-server.md');
  await expect(page.getByTestId('settings-dialog')).toContainText('not conversion models');
  await capture('settings-success-en-1440');
  // A → delayed B → A: Check must save and inspect the final displayed address A.
  let releaseSave, saveStarted;
  const saveGate = new Promise(resolve => { releaseSave = resolve; });
  const savingB = new Promise(resolve => { saveStarted = resolve; });
  const delayedSave = async route => {
    if (route.request().method() === 'PUT' && route.request().postDataJSON().server === 'http://127.0.0.1:1') {
      saveStarted(); await saveGate;
    }
    return route.continue();
  };
  await page.route('**/api/docling-settings', delayedSave);
  try {
    await field.fill('http://127.0.0.1:1'); await field.press('Tab'); await savingB;
    await field.fill(fixture.url);
    await page.getByRole('button', { name: 'Check connection', exact: true }).click();
    releaseSave();
    await expect(page.getByRole('button', { name: 'Check connection', exact: true })).toBeEnabled();
    expect(await field.inputValue()).toBe(fixture.url);
    expect(await page.locator('#docling-server-result').textContent()).toContain('ready and compatible');
    const stored = await (await page.request.get(page.url().split('/').slice(0, 3).join('/') + '/api/docling-settings')).json();
    expect(stored.server).toBe(fixture.url);
  } finally { releaseSave(); await page.unroute('**/api/docling-settings', delayedSave); }
  fixture.mode('not-ready'); await check();
  expect(await page.locator('#docling-server-result').textContent()).toContain('not ready');
  fixture.mode('version'); await check();
  expect(await page.locator('#docling-server-result').textContent()).toContain('version is incompatible');
  await field.fill('http://127.0.0.1:1'); await check();
  expect(await page.locator('#docling-server-result').textContent()).toContain('Could not connect');
  await expect(page.getByRole('link', { name: 'Server setup guide' })).toBeVisible();
  await capture('settings-failure-en-1440');
  await field.fill(fixture.url); fixture.mode('pending'); await check();
  await page.getByTestId('settings-back').click();
  await page.reload();
  await settings();
  await expect(field).toHaveValue(fixture.url);
  await page.getByTestId('settings-back').click();
  const separator = fixture.input.includes('\\') ? '\\' : '/';
  const parent = fixture.input.split(separator).slice(0, -1).join(separator);
  await openFolderPicker(page);
  await page.getByTestId('folder-path').fill(parent);
  await page.getByTestId('folder-open').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const pdf = page.locator('[role=treeitem]').filter({ hasText: 'paper.pdf' });
  await pdf.click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: 'Convert with Docling' })).toBeVisible();
  await capture('pdf-menu-en-1440');
  await page.getByRole('menuitem', { name: 'Convert with Docling' }).click();
  const progress = page.getByTestId('docling-conversion');
  const expectComparison = async (label = 'Docling comparison') => {
    await expect(progress).toHaveCount(0);
    const job = await (await page.request.get(page.url().split('/').slice(0, 3).join('/') + '/api/docling-conversion')).json();
    expect(job.state).toBe('success');
    const bundle = job.output.split(/[\\/]/).at(-1);
    await expect(page.getByRole('tab', { name: `${label} · ${bundle}`, exact: true })).toBeVisible();
  };
  await progress.getByRole('button', { name: /Start conversion|Convert again/ }).click();
  await expect(progress).toContainText('Server task');
  expect(conversionPosts).toBe(1);
  const observed = await (await page.request.get(page.url().split('/').slice(0, 3).join('/') + '/api/docling-conversion')).json();
  expect(observed.id).toBe(acceptedId);
  await capture('progress-en-1440');
  await progress.getByRole('button', { name: 'Stop waiting' }).click();
  await expect(progress.getByRole('button', { name: 'Convert again' })).toBeEnabled();
  expect(await progress.textContent()).toContain('server task may continue');
  await progress.getByRole('button', { name: 'Close', exact: true }).last().click();
  await expect(progress).toHaveCount(0); // The existing shortcut guard rejects a closing modal.
  // Command Center hands its PDF picker to the same explicit conversion dialog.
  await page.keyboard.press('Control+Slash');
  await page.getByRole('dialog', { name: 'Command center' }).getByRole('combobox').fill('> Convert with Docling');
  await page.getByRole('option', { name: 'Convert with Docling', exact: true }).click();
  await page.getByRole('combobox', { name: 'PDF path' }).fill(fixture.input);
  await page.getByTestId('folder-open').click();
  await expect(progress).toBeVisible();
  fixture.mode('model-missing');
  await progress.getByRole('button', { name: /Start conversion|Convert again/ }).click();
  await expect(progress).toContainText('Docling conversion failed.');
  await progress.getByRole('button', { name: 'Close', exact: true }).last().click();
  // A modal can make the retained window center inert; its cause must still be stored/rendered.
  const center = page.getByRole('complementary', { name: 'Notifications', includeHidden: true });
  await expect(center).toContainText('required model is missing');
  expect(await center.textContent()).not.toContain('secret-server-path');
  await expect(center).toContainText('Server task');
  await center.getByRole('button', { name: 'Go to problem' }).click();
  await expect(progress).toBeVisible();
  // A's delayed automatic comparison must not dismiss/overwrite B's newer failure.
  fixture.mode('success');
  let releaseComparison, comparisonStarted;
  const comparisonGate = new Promise(resolve => { releaseComparison = resolve; });
  const openingA = new Promise(resolve => { comparisonStarted = resolve; });
  const delayedComparison = async route => { comparisonStarted(); await comparisonGate; return route.continue(); };
  await page.route('**/api/docling-compare?*', delayedComparison);
  try {
    await progress.getByRole('button', { name: 'Convert again' }).click();
    await openingA;
    fixture.mode('failure');
    await progress.getByRole('button', { name: 'Convert again' }).click();
    await expect(progress).toContainText('Docling conversion failed.');
    const newer = await (await page.request.get(page.url().split('/').slice(0, 3).join('/') + '/api/docling-conversion')).json();
    await expect(center).toContainText(newer.failure.taskId);
    const oldResponse = page.waitForResponse('**/api/docling-compare?*');
    releaseComparison(); await (await oldResponse).finished();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    expect(await progress.count()).toBe(1);
    expect(await center.textContent()).toContain(newer.failure.taskId);
  } finally { releaseComparison(); await page.unroute('**/api/docling-compare?*', delayedComparison); }
  fixture.mode('success');
  await progress.getByRole('button', { name: 'Convert again' }).click();
  await expectComparison();
  await expect(page.locator('.docling-source img')).toBeVisible();
  await expect(center).toHaveCount(0);
  await capture('completed-en-1440');
  // A prior success is a baseline, never evidence that a rejected/lost new start succeeded.
  const endpoint = page.url().split('/').slice(0, 3).join('/') + '/api/docling-conversion';
  const oldSuccess = await (await page.request.get(endpoint)).json();
  let releaseInitial, readRetried, reads = 0, refusedPosts = 0, refuse = '';
  const initialGate = new Promise(resolve => { releaseInitial = resolve; });
  const retried = new Promise(resolve => { readRetried = resolve; });
  const oldSnapshot = async route => {
    if (route.request().method() === 'GET') {
      if (++reads === 1) return route.abort('failed');
      if (reads === 2) { readRetried(); await initialGate; }
    }
    if (route.request().method() === 'POST' && refuse) {
      refusedPosts++;
      return refuse === 'reject' ? route.fulfill({ status: 400, json: { error: 'Rejected new conversion' } }) : route.abort('failed');
    }
    return route.fallback();
  };
  await page.route('**/api/docling-conversion', oldSnapshot);
  try {
    await page.reload(); await retried;
    await page.keyboard.press('Control+Slash');
    await page.getByRole('dialog', { name: 'Command center' }).getByRole('combobox').fill('> Convert with Docling');
    await page.getByRole('option', { name: 'Convert with Docling', exact: true }).click();
    await page.getByRole('combobox', { name: 'PDF path' }).fill(fixture.input);
    await page.getByTestId('folder-open').click();
    await expect(progress.getByRole('button', { name: 'Start conversion' })).toBeDisabled();
    expect(refusedPosts).toBe(0);
    releaseInitial();
    await expect(progress.getByRole('button', { name: 'Start conversion' })).toBeEnabled();
    expect(await page.getByRole('tab', { name: /Docling comparison ·/ }).count()).toBe(0);
    for (const mode of ['reject', 'lost']) {
      refuse = mode;
      const readBack = page.waitForResponse(response => response.url() === endpoint && response.request().method() === 'GET' && response.ok());
      await progress.getByRole('button', { name: 'Start conversion' }).click();
      await (await readBack).finished();
      await expect(progress.getByRole('button', { name: 'Start conversion' })).toBeEnabled();
      const reason = mode === 'reject' ? 'Rejected new conversion' : 'Failed to fetch';
      expect(await progress.textContent()).toContain(reason);
      expect(await center.textContent()).toContain(reason);
      expect(await page.getByRole('tab', { name: /Docling comparison ·/ }).count()).toBe(0);
      expect((await (await page.request.get(endpoint)).json()).id).toBe(oldSuccess.id);
    }
    expect(refusedPosts).toBe(2); // Exactly the two explicit user attempts; no automatic POST retry.
    refuse = '';
    await progress.getByRole('button', { name: 'Start conversion' }).click();
    await expectComparison();
    await expect(center).toHaveCount(0);
  } finally { releaseInitial(); await page.unroute('**/api/docling-conversion', oldSnapshot); }
  if (screenshots) {
    await page.evaluate(() => localStorage.setItem('ieumdoc.uiLanguage', 'ko'));
    await page.reload();
    await page.setViewportSize({ width: 640, height: 1000 });
    await page.getByRole('button', { name: '설정', exact: true }).click();
    await page.getByRole('button', { name: 'Docling', exact: true }).click();
    await page.getByRole('button', { name: '연결 확인', exact: true }).click();
    await page.getByRole('button', { name: '연결 확인', exact: true }).waitFor();
    await addressRow();
    await capture('settings-success-ko-640');
    await page.getByRole('textbox', { name: '서버 주소' }).fill('http://127.0.0.1:1');
    await page.getByRole('button', { name: '연결 확인', exact: true }).click();
    await expect(page.locator('#docling-server-result')).toContainText('연결할 수 없습니다');
    await capture('settings-failure-ko-640');
    await page.getByRole('textbox', { name: '서버 주소' }).fill(fixture.url);
    await page.getByRole('button', { name: '연결 확인', exact: true }).click();
    await page.getByTestId('settings-back').click();
    await pdf.click({ button: 'right' }); await capture('pdf-menu-ko-640');
    await page.getByRole('menuitem', { name: 'Docling으로 변환' }).click();
    fixture.mode('pending');
    await progress.getByRole('button', { name: /변환 시작|다시 변환/ }).click();
    await expect(progress).toContainText('서버 작업'); await capture('progress-ko-640');
    fixture.mode('success');
    await expectComparison('Docling 대조');
    await expect(progress).toHaveCount(0); await capture('completed-ko-640');
    await page.getByRole('button', { name: '설정', exact: true }).click();
    await page.getByRole('button', { name: '표시·언어', exact: true }).click();
    await page.getByTestId('theme').selectOption('dark');
    await page.getByRole('button', { name: 'Docling', exact: true }).click();
    await page.getByRole('button', { name: '연결 확인', exact: true }).click();
    await expect(page.locator('#docling-server-result')).toContainText('호환됩니다');
    await capture('settings-dark-ko-640');
  }
  return { connection: ['ready', 'not-ready', 'version', 'unreachable'], entry: ['PDF menu', 'Command Center'], conversion: ['cancelled', 'failed', 'success'] };
}
