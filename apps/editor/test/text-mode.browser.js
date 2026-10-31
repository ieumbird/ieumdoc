// Real shared Host, textarea input, Save acknowledgement and kind-specific local recovery.
async (page, { openPath, activeDocument, expect, recoveryRecords, screenshots, textFixture }) => {
  const origin = page.url().split('/').slice(0,3).join('/');
  const initial = await (await page.request.get(origin + '/api/document')).json();
  const sep = initial.path.includes('\\') ? '\\' : '/';
  const root = [...initial.path.split(sep).slice(0,-4), 'tmp', 'text-mode'].join(sep);
  const file = name => root + sep + name;
  const read = async path => (await page.request.get(origin + '/api/document?path=' + encodeURIComponent(path))).json();
  const input = () => activeDocument(page).getByTestId('text-editor');
  const save = async () => {
    const response = page.waitForResponse(r => r.request().method() === 'POST' && r.url().split('?')[0].endsWith('/api/document'));
    await page.keyboard.press('Control+s');
    expect((await response).status()).toBe(200);
    await expect(page.getByTestId('status')).toHaveAttribute('data-operation','saved');
  };
  const reload = async () => {
    await page.getByRole('button',{name:'File actions',exact:true}).click();
    await page.getByRole('menuitem',{name:'Reload',exact:true}).click();
    await page.getByRole('dialog').waitFor({state:'detached'});
    await expect(page.getByTestId('status')).toHaveAttribute('data-operation','ready');
  };
  const unloadBlocked = () => page.evaluate(() => {
    const event = new Event('beforeunload',{cancelable:true}); window.dispatchEvent(event); return event.defaultPrevented;
  });
  const configure = async (language,theme) => {
    await page.getByRole('button',{name:/^(Settings|설정)$/,exact:true}).click();
    await page.getByTestId('theme').selectOption(theme);
    await page.getByTestId('ui-language').selectOption(language);
    await page.getByTestId('settings-back').click();
    await page.getByTestId('settings-dialog').waitFor({state:'detached'});
    await page.evaluate(async () => { await document.fonts.ready; });
  };
  const nativeBefore = await read(file('native.md'));
  await openPath(page,file('foreign.md'));
  await expect(input()).toHaveValue('# 일반 Markdown\n\n**서식이 아닌 텍스트**와 <kbd>Ctrl</kbd>\n');
  await expect(activeDocument(page).locator('.document-editor')).toHaveCount(0);
  await expect(page.getByTestId('view-source')).toHaveCount(0);
  await expect(page.getByTestId('text-mode-notice')).toBeVisible();
  await expect(page.getByTestId('save')).toBeEnabled();
  if (screenshots) {
    await configure('ko','dark');
    await expect(page.getByTestId('text-mode-notice').filter({visible:true})).toHaveText('텍스트 모드 · 이음독 문서가 아닙니다');
    for (const width of [1440,640]) {
      await page.setViewportSize({width,height:900});
      await page.screenshot({path:`tmp/text-mode-captures/after-open-ko-dark-${width}.png`});
    }
    await configure('en','light');
  }
  const content = '\t  한글 😀 **literal** <div>\n\n마지막 줄  \n';
  await input().fill(content);
  expect(await unloadBlocked()).toBe(true);
  const element = await input().elementHandle();
  await save();
  // Inspect the first Saved commit directly, without a poll/reload hiding stale dirty state.
  expect(await unloadBlocked()).toBe(false);
  expect(await input().evaluate((node,old) => node === old,element)).toBe(true);
  await expect(input()).toBeFocused();
  expect((await read(file('foreign.md'))).source).toBe(content);
  await reload();
  await expect(input()).toHaveValue(content);

  // External edits can change admission in either direction, only when Reload accepts them.
  await openPath(page,file('native.md'));
  await expect(activeDocument(page).locator('.document-editor')).toBeVisible();
  textFixture.replaceNative('external plain Markdown\n');
  await reload();
  await expect(input()).toHaveValue('external plain Markdown\n');
  await input().fill(nativeBefore.source);
  await save();
  await page.keyboard.press('Control+s');
  await expect(page.getByTestId('status')).toHaveAttribute('data-operation','save-failed');
  expect((await read(file('native.md'))).source).toBe(nativeBefore.source);
  await reload();
  await expect(activeDocument(page).locator('.document-editor')).toBeVisible();

  await openPath(page,file('notes.txt'));
  await input().fill('닫기 전에 유지할 글자');
  await page.getByRole('button',{name:'Close notes.txt',exact:true}).click();
  await page.getByRole('dialog',{name:'Save changes?',exact:true}).getByRole('button',{name:'Cancel',exact:true}).click();
  await expect(input()).toHaveValue('닫기 전에 유지할 글자');
  expect((await read(file('notes.txt'))).source).toContain('일반 텍스트 파일');
  await page.getByRole('button',{name:'Close notes.txt',exact:true}).click();
  await page.getByRole('dialog',{name:'Save changes?',exact:true}).getByRole('button',{name:'Save',exact:true}).click();
  await expect(page.getByRole('tab',{name:/^notes\.txt/})).toHaveCount(0);
  expect((await read(file('notes.txt'))).source).toBe('닫기 전에 유지할 글자');
  await openPath(page,file('notes.txt'));

  // A held real Save acknowledgement cannot mark input typed later as saved.
  let release, arrived;
  const gate = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { arrived = resolve; });
  const hold = async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    const response = await route.fetch(); arrived(); await gate; await route.fulfill({response});
  };
  await input().fill('submitted text');
  await page.route('**/api/document',hold);
  try {
    await page.keyboard.press('Control+s'); await started;
    await input().fill('newer pending text\n복구할 내용');
    expect(await unloadBlocked()).toBe(true);
    release();
    await expect(page.getByTestId('status')).toHaveAttribute('data-operation','saved-pending');
  } finally { release(); await page.unroute('**/api/document',hold); }
  await expect.poll(async () => (await recoveryRecords(page)).some(r => r.path === file('notes.txt') && r.snapshot.kind === 'text' && r.snapshot.text === 'newer pending text\n복구할 내용' && r.snapshot.savedSource === 'submitted text')).toBe(true);
  expect((await read(file('notes.txt'))).source).toBe('submitted text');
  page.once('dialog',dialog => dialog.accept());
  await page.reload();
  await expect(page.getByTestId('recovery-prompt')).toBeVisible();
  await page.getByRole('button',{name:'Compare',exact:true}).click();
  await expect(page.locator('.recovery-diff')).toContainText('복구할 내용');
  await page.getByRole('button',{name:'Restore work',exact:true}).click();
  await expect(page.getByTestId('recovery-prompt')).toBeHidden();
  await expect(input()).toHaveValue('newer pending text\n복구할 내용');
  expect((await read(file('notes.txt'))).source).toBe('submitted text');
  await input().focus(); await save();
  expect((await read(file('notes.txt'))).source).toBe('newer pending text\n복구할 내용');

  // A second writer changes the disk; restored text retains the old revision and conflicts.
  const checkpoint = await read(file('notes.txt'));
  await input().fill('local recovery after conflict');
  await expect.poll(async () => (await recoveryRecords(page)).some(r => r.path === file('notes.txt') && r.recoveryText === 'local recovery after conflict')).toBe(true);
  const external = await page.request.post(origin + '/api/document',{data:{kind:'text',path:file('notes.txt'),revision:checkpoint.revision,source:'external writer'}});
  expect(external.status()).toBe(200);
  page.once('dialog',dialog => dialog.accept()); await page.reload();
  await expect(page.getByTestId('recovery-prompt')).toBeVisible();
  await page.getByRole('button',{name:'Restore work',exact:true}).click();
  await input().focus(); await page.keyboard.press('Control+s');
  await expect(page.getByTestId('status')).toHaveAttribute('data-operation','save-conflict');
  await expect(input()).toHaveValue('local recovery after conflict');
  expect((await read(file('notes.txt'))).source).toBe('external writer');
  expect(await unloadBlocked()).toBe(true);
  expect((await read(file('native.md'))).source).toBe(nativeBefore.source);
  if (screenshots) {
    await page.getByRole('button',{name:'File actions',exact:true}).click();
    await page.getByRole('menuitem',{name:'Reload',exact:true}).click();
    await page.getByRole('button',{name:'Discard and reload',exact:true}).click();
    await expect(page.getByTestId('status')).toHaveAttribute('data-operation','ready');
    await input().fill('일반 텍스트 파일을 편집합니다.\n\n# 제목과 **강조**도 입력한 글자 그대로입니다.\n블록이나 미리보기 없이 텍스트만 다룹니다.\n\n한글 줄바꿈과 탭·저장 버튼 영역을 확인합니다.');

    for (const [language,theme] of [['en','light'],['ko','dark']]) {
      await configure(language,theme);
      await expect(page.getByTestId('text-mode-notice').filter({visible:true})).toHaveText(language === 'ko' ? '텍스트 모드 · 이음독 문서가 아닙니다' : 'Text mode · Not an IeumDoc document');
      for (const width of [1440,640]) {
        await page.setViewportSize({width,height:900});
        const geometry = await input().evaluate(node => { const r=node.getBoundingClientRect(); return {left:r.left,right:r.right,window:innerWidth}; });
        expect(geometry.left).toBeGreaterThanOrEqual(0); expect(geometry.right).toBeLessThanOrEqual(geometry.window);
        await page.screenshot({path:`tmp/text-mode-captures/after-${language}-${theme}-${width}.png`});
      }
    }
    await configure('en','light');
  }
  await page.getByRole('button',{name:'Close notes.txt',exact:true}).click();
  await page.getByRole('dialog',{name:'Save changes?',exact:true}).getByRole('button',{name:"Don't save",exact:true}).click();
  await expect(page.getByRole('tab',{name:/^notes\.txt/})).toHaveCount(0);
  expect((await read(file('notes.txt'))).source).toBe('external writer');
  return {textSave:true,delayedAcknowledgement:true,closeProtection:true,textRecovery:true,externalConflict:true};
}
