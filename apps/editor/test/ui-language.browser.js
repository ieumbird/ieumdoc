// Runtime display preferences preserve the editor, drafts, selection and real Save path.
async (page, { openPath, screenshots }) => {
  page.setDefaultTimeout(15000);
  await page.emulateMedia({colorScheme:'light'});
  const check = (ok, reason) => { if (!ok) throw Error(reason); };
  const ready = () => page.locator('[data-testid="status"][data-operation="ready"]').waitFor({ state: 'attached' });
  await ready();
  const origin = page.url().split('/').slice(0, 3).join('/');
  const initial = await (await page.request.get(`${origin}/api/document`)).json();
  const sep = initial.path.includes('\\') ? '\\' : '/';
  const file = [...initial.path.split(sep).slice(0, -4), 'tmp', 'reference-save-reload', 'technical-document.md'].join(sep);
  await openPath(page, file);
  const editor = page.locator('[data-document-tab][data-active=true] .document-editor');
  const original = await editor.evaluateHandle(node => node.editor);
  const snapshot = () => editor.evaluate(node => ({ json: JSON.stringify(node.editor.getJSON()), selection: node.editor.state.selection.toJSON() }));
  const settings = async language => {
    await page.getByRole('button', { name: language === 'ko' ? '설정' : 'Settings', exact: true }).click();
    await page.getByTestId('ui-language').waitFor();
  };
  const closeSettings = async () => {
    await page.keyboard.press('Escape');
    await page.getByTestId('settings-dialog').waitFor({ state: 'detached' });
  };
  // Observe the first mounted UI, before a preference could be repaired by a later effect.
  await page.addInitScript(() => {
    const observer = new MutationObserver(() => {
      if (document.querySelector('#root')?.childElementCount) {
        window.accentAtFirstUi = document.documentElement.dataset.accent;
        window.themeAtFirstUi = document.documentElement.dataset.theme;
        window.pageAtFirstUi = document.documentElement.dataset.page;
        observer.disconnect();
      }
    });
    observer.observe(document, { childList: true, subtree: true });
  });
  const accentResults = [];
  const captureMetadata = [];
  try {
    await editor.evaluate(async node => {
      const { INSERT_COMMANDS } = await import('/src/block-commands.ts');
      const state = node.editor.state;
      node.editor.view.dispatch(INSERT_COMMANDS.find(command => command.id === 'note').run(state, state.doc.childCount - 1));
      node.editor.commands.insertContent('Language note body');
    });
    const admonitionLabel = editor.locator('[data-block="admonition"] .admonition-label').last();
    check(await admonitionLabel.innerText() === 'Note', 'English Admonition label is missing');
    // A real applied edit plus an unapplied property draft must both survive.
    await editor.evaluate(node => node.editor.chain().focus().setTextSelection(3).insertContent('LANGUAGE-PRESERVED ').run());
    const equation = page.locator('[data-document-tab][data-active=true] [data-block="equation"]').first();
    await equation.hover();
    await equation.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByTestId('equation-latex').fill('x_{language} = 42');
    const before = await snapshot();
    const tabCount = await page.getByRole('tab').count();
    const scrollBefore = await page.evaluate(() => scrollY);
    await settings('en');
    const screen = page.getByTestId('settings-dialog');
    await page.waitForFunction(() => document.activeElement?.textContent === 'Back to document');
    check(await screen.locator('.settings-document-name').innerText() === 'technical-document.md' &&
      await screen.getByRole('img',{name:'Unsaved changes',exact:true}).count() === 1, 'Settings lost the return document or unsaved cue');
    await page.keyboard.press('Tab');
    check(await screen.getByRole('button',{name:'Appearance & language',exact:true}).evaluate(n => n === document.activeElement), 'Back does not lead to category navigation');
    await page.keyboard.press('Tab'); await page.keyboard.press('Enter');
    check(await screen.getByRole('heading',{name:'Local recovery',exact:true}).isVisible(), 'Keyboard cannot select recovery');
    await screen.getByRole('button',{name:'Appearance & language',exact:true}).click();
    if (screenshots) {
      for (const theme of ['light','dark']) {
        await page.getByTestId('theme').selectOption(theme);
        for (const width of [1440,640]) {
          await page.setViewportSize({width,height:900});
          await page.evaluate(async () => { await document.fonts.ready; document.activeElement?.blur(); document.querySelector('.settings-body').scrollTop = 0; });
          await page.mouse.move(0,0);
          await page.screenshot({path:`tmp/settings-617/${theme}-${width}.png`});
          captureMetadata.push(await page.evaluate(() => ({theme:document.documentElement.dataset.theme,
            width:innerWidth,height:innerHeight,dpr:devicePixelRatio,scale:visualViewport.scale,
            zoom:getComputedStyle(document.documentElement).zoom,font:getComputedStyle(document.querySelector('.settings-content')).fontFamily,
            scroll:document.querySelector('.settings-body').scrollTop,userAgent:navigator.userAgent})));
        }
      }
      await page.setViewportSize({width:1280,height:720});
      await page.getByTestId('theme').selectOption('system');
    }
    check(await screen.getByRole('radiogroup', {name:'Accent color',exact:true}).count() === 1,
      'Accent color must expose a named radio group with visible swatches');
    const pagePicker = page.getByTestId('page-background');
    check(await pagePicker.inputValue() === 'paper', 'Page style must default to paper');
    const themePicker = page.getByTestId('theme');
    check(await themePicker.inputValue() === 'system', 'Theme must default to System');
    for (const colorScheme of ['dark','light']) {
      await page.emulateMedia({colorScheme});
      await page.waitForFunction(theme => document.documentElement.dataset.theme === theme, colorScheme);
      check(await page.locator('html').evaluate(n => getComputedStyle(n).colorScheme) === colorScheme, 'Native controls must follow the resolved theme');
    }
    const picker = page.getByRole('radiogroup', { name: 'Accent color', exact: true });
    const presets = await picker.getByRole('radio').evaluateAll(options => options.map(option => option.value));
    check(presets.join(',') === 'blue,violet,plum,teal,green,graphite', 'Settings must expose the six validated presets');
    await page.getByTestId('ui-language').focus();
    await page.keyboard.press('Tab');
    for (const [key, value] of [['ArrowRight','violet'],['ArrowDown','plum'],['ArrowLeft','violet'],['ArrowUp','blue'],['ArrowUp','graphite'],['ArrowRight','blue']]) {
      await page.keyboard.press(key);
      const radio = picker.locator(`input[value="${value}"]`);
      check(await radio.isChecked() && await radio.evaluate(n => n === document.activeElement && n.matches(':focus-visible')),
        `${key} must select and focus ${value}`);
      check(await radio.evaluate(n => getComputedStyle(n.nextElementSibling).boxShadow !== 'none'), 'Keyboard focus must have a visible ring');
      check(await page.locator('html').getAttribute('data-accent') === value, 'Arrow selection must apply the accent immediately');
    }
    await page.keyboard.press('Tab');
    check(!await picker.evaluate(n => n.contains(document.activeElement)), 'Radio group must occupy one Tab stop');
    for (const theme of ['light','dark']) {
    await themePicker.selectOption(theme);
    const swatches = await picker.locator('.settings-accent-swatch').evaluateAll(nodes => nodes.map(n => getComputedStyle(n).backgroundColor));
    check(new Set(swatches).size === presets.length, `${theme}: unselected swatches must show distinct colors`);
    for (const width of [1440,640]) {
      await page.setViewportSize({width,height:900});
      check(await picker.evaluate(n => n.scrollWidth <= n.clientWidth && [...n.querySelectorAll('label')].every(label => {
        const r = label.getBoundingClientRect();
        return r.top === n.firstElementChild.getBoundingClientRect().top && r.left >= 0 && r.right <= innerWidth && label.scrollWidth <= label.clientWidth;
      })), `${theme}/${width}: accent choices must fit without clipping or sideways overflow`);
      check(await screen.locator('.settings-accent-control').evaluate(n => n.scrollWidth <= n.clientWidth &&
        n.lastElementChild.getBoundingClientRect().left >= n.firstElementChild.getBoundingClientRect().right),
        `${theme}/${width}: current color name must fit beside the swatch row`);
    }
    await page.setViewportSize({width:1280,height:720});
    await pagePicker.selectOption('flat');
    check(await page.locator('html').getAttribute('data-page') === 'flat', 'Page selection did not apply');
    check(JSON.stringify(await snapshot()) === JSON.stringify(before), 'Page style changed document or selection');
    await page.emulateMedia({colorScheme:theme === 'light' ? 'dark' : 'light'});
    check(await page.locator('html').getAttribute('data-theme') === theme, 'An explicit theme changed with the OS');
    for (const preset of presets) {
      await picker.locator(`input[value="${preset}"]`).check();
      await picker.locator(`input[value="${preset}"]`).focus();
      const colors = await page.evaluate(() => {
        const root = document.documentElement;
        const resolve = name => {
          const probe = document.createElement('span'); probe.style.color = `var(--id-color-${name})`; document.body.append(probe);
          const value = getComputedStyle(probe).color; probe.remove(); return value;
        };
        const editor = document.querySelector('[data-document-tab][data-active=true] .document-editor');
        const picker = document.querySelector('[data-testid="accent-color"] input:checked + .settings-accent-face');
        const selection = getComputedStyle(editor.querySelector('.paragraph'), '::selection');
        return { theme: root.dataset.theme, preset: root.dataset.accent, interaction: resolve('interaction'), selected: resolve('text-selected'),
          selectedSurface: resolve('surface-selected'), ring: getComputedStyle(picker.querySelector('.settings-accent-swatch')).outlineColor, swatch: getComputedStyle(picker.querySelector('.settings-accent-swatch')).backgroundColor,
          save: getComputedStyle(document.querySelector('[data-testid="save"]')).backgroundColor,
          selectionText: selection.color, selectionBackground: selection.backgroundColor,
          link: getComputedStyle(editor.querySelector('a')).color,
          reference: getComputedStyle(editor.querySelector('.cross-reference-chip')).color };
      });
      check(colors.preset === preset && colors.swatch === colors.interaction && colors.ring === colors.interaction && colors.save === colors.interaction &&
        colors.link === colors.interaction && colors.reference === colors.interaction &&
        colors.selectionText === colors.selected && colors.selectionBackground === colors.selectedSurface,
        `Accent consumers did not update: ${JSON.stringify(colors)}`);
      check(colors.interaction === swatches[presets.indexOf(preset)], 'Every swatch must match its actual theme accent before selection');
      const radio = picker.locator(`input[value="${preset}"]`);
      const name = await radio.getAttribute('aria-label');
      check(!!name && await radio.locator('..').getAttribute('title') === name &&
        await screen.locator('.settings-accent-name').innerText() === name,
        'Each swatch must retain its accessible name and tooltip; only the selected name appears beside the row');
      check(await picker.locator('.settings-accent-swatch').evaluateAll(nodes => nodes.every(n => {
        const style = getComputedStyle(n);
        return n.closest('label').querySelector('input').checked
          ? style.outlineStyle === 'solid' && parseFloat(style.outlineWidth) >= 2 && parseFloat(style.outlineOffset) >= 2
          : style.outlineStyle === 'none';
      })), 'Only the selected accent must show an offset selection ring');
      accentResults.push(colors);
    }
    check(new Set(accentResults.filter(r => r.theme === theme).map(result => result.interaction)).size === presets.length, 'Presets must produce distinct colors');
    }
    await picker.locator('input[value="teal"]').check();
    if (screenshots) await page.screenshot({ path: 'tmp/256/settings-en.png' });
    await page.getByTestId('ui-language').selectOption('ko');
    await page.getByRole('heading', { name: '표시 언어', exact: true }).waitFor();
    check(await page.locator('html').getAttribute('lang') === 'ko', 'Page language did not update');
    if (screenshots) await page.screenshot({ path: 'tmp/256/settings-ko.png' });
    await closeSettings();
    check(await page.evaluate(() => scrollY) === scrollBefore, 'Settings changed document scroll');
    await page.getByTestId('folder').first().getByRole('button', {name:'더 많은 작업', exact:true}).click();
    await page.getByRole('menuitem', {name:'폴더 열기…', exact:true}).waitFor();
    check(await page.getByRole('menuitem', {name:'폴더 열기…', exact:true}).isVisible(), 'Folder menu must be translated');
    await page.keyboard.press('Escape');
    await page.getByRole('menu').waitFor({state:'detached'});
    check(await admonitionLabel.innerText() === '참고', 'Existing Admonition label did not switch language');
    check(await page.getByRole('button', { name: /번째 문단 블록 뒤에 삽입/ }).count() > 0, 'Paragraph handle exposes its internal English type');
    check(await page.getByRole('button', { name: /번째 제목 블록 이동/ }).count() > 0, 'Heading handle exposes its internal English type');
    check(await editor.evaluate((node, handle) => node.editor === handle, original), 'Language change replaced the editor');
    check(JSON.stringify(await snapshot()) === JSON.stringify(before), 'Language change changed content or selection');
    check(await page.getByRole('tab').count() === tabCount, 'Language change lost tabs');
    check(await page.getByTestId('equation-latex').inputValue() === 'x_{language} = 42', 'Language change lost property draft');
    check(await page.getByTestId('equation-apply').innerText() === '적용', 'NodeView did not update language');
    check(await page.getByTestId('status').innerText() === '저장하지 않은 변경 사항', 'Dirty state did not survive');
    // The screen releases its modal before revealing and focusing the inline settings block.
    await settings('ko');
    await screen.getByRole('button',{name:'문서 설정 열기',exact:true}).click();
    await screen.waitFor({state:'detached'});
    const documentSettings = page.getByRole('region',{name:'문서 설정',exact:true}).locator('.display-settings');
    await documentSettings.waitFor();
    await page.getByRole('button',{name:'문서 설정',exact:true}).and(page.locator(':focus')).waitFor();
    await page.keyboard.press('Escape'); await documentSettings.waitFor({state:'hidden'});
    check(await page.getByRole('button',{name:'문서 설정',exact:true}).evaluate(n => n === document.activeElement), 'Document settings handoff did not focus its disclosure');
    await page.getByTestId('equation-apply').click();
    const applied = await snapshot();
    await editor.evaluate(node => node.editor.commands.undo());
    check((await snapshot()).json !== applied.json, 'Undo no longer works');
    await editor.evaluate(node => node.editor.commands.redo());
    check((await snapshot()).json === applied.json, 'Redo did not restore applied edits');

    // Block equations may now be empty; inline math still requires content or explicit Remove.
    // Test failure text at its origin, then switch language while the error remains visible.
    await editor.evaluate(node => node.editor.commands.insertContentAt(3, { type: 'inlineMath', attrs: { value: 'x' } }));
    await editor.getByTestId('inline-math').first().locator('.inline-math-rendered').dblclick();
    const beforeInvalidApply = (await snapshot()).json;
    await page.getByTestId('inline-math-source').fill('');
    await page.getByTestId('inline-math-apply').click();
    await page.getByText('LaTeX를 입력하거나 제거를 선택하세요.', { exact: true }).waitFor();
    await settings('ko');
    await page.getByTestId('ui-language').selectOption('en');
    await closeSettings();
    await page.getByText('Enter LaTeX, or use Remove.', { exact: true }).waitFor();
    check((await snapshot()).json === beforeInvalidApply, 'Invalid Apply or language change modified the document');
    check(await page.getByTestId('inline-math-source').inputValue() === '', 'Language change lost the invalid draft');
    await page.getByTestId('inline-math-cancel').click();
    await settings('en');
    await page.getByTestId('ui-language').selectOption('ko');
    await closeSettings();

    // The same real Host write works in Korean; a disk Reload retains that content.
    await page.getByTestId('save').click();
    await page.locator('[data-operation="saved"]').waitFor();
    const disk = await (await page.request.get(`${origin}/api/document?path=${encodeURIComponent(file)}`)).json();
    check(disk.source.includes('LANGUAGE-PRESERVED') && disk.source.includes('x_{language}'), 'Save lost edits');
    await page.getByRole('button', { name: '파일 작업', exact: true }).click();
    await page.getByRole('menuitem', { name: '다시 불러오기', exact: true }).click();
    await ready();
    check((await snapshot()).json.includes('LANGUAGE-PRESERVED'), 'Reload lost saved edits');

    // A structured conflict keeps edits and re-renders its guidance in the selected language.
    await editor.evaluate(node => node.editor.commands.insertContentAt(3, 'CONFLICT-KEPT '));
    const conflictDocument = (await snapshot()).json;
    await page.route('**/api/document', async route => route.request().method() === 'POST'
      ? route.fulfill({ status: 409, json: { error: 'External revision conflict detail' } }) : route.continue());
    await page.getByTestId('save').click();
    await page.locator('[data-operation="save-conflict"]').waitFor();
    check((await page.getByTestId('error').innerText()).includes('기술적 세부 정보'), 'Korean conflict guidance is missing');
    await settings('ko');
    await page.getByTestId('ui-language').selectOption('en');
    await closeSettings();
    check((await page.getByTestId('error').innerText()).startsWith('External change:'), 'Existing conflict did not switch language');
    check((await snapshot()).json === conflictDocument, 'Language change discarded conflicted edits');
    await settings('en');
    await page.getByTestId('ui-language').selectOption('ko');
    await closeSettings();
    await page.unroute('**/api/document');
    await page.getByTestId('save').click();
    await page.locator('[data-operation="saved"]').waitFor();

    // Apply the saved theme even while the main application bundle is still loading.
    let releaseMain, mainContinued;
    const mainGate = new Promise(resolve => {releaseMain = resolve;});
    const mainFinished = new Promise(resolve => {mainContinued = resolve;});
    const holdMain = async route => {await mainGate; try {await route.continue();} finally {mainContinued();}};
    await page.route('**/src/main.tsx*', holdMain);
    try {
      await page.reload({waitUntil:'commit'});
      await page.waitForFunction(() => document.documentElement.style.colorScheme === 'dark');
      check(await page.evaluate(() => document.documentElement.dataset.page === 'flat' && document.documentElement.dataset.theme === 'dark' && !document.querySelector('#root')?.childElementCount),
        'Startup theme must apply before the main bundle mounts');
    } finally {releaseMain(); await mainFinished; await page.unroute('**/src/main.tsx*', holdMain);}
    await ready();
    check(await page.locator('html').getAttribute('lang') === 'ko', 'Language preference was not restored');
    check(await page.evaluate(() => window.accentAtFirstUi === 'teal' && document.documentElement.dataset.accent === 'teal'), 'Saved accent must apply at the first mounted UI');
    check(await page.evaluate(() => window.themeAtFirstUi === 'dark' && document.documentElement.dataset.theme === 'dark'), 'Saved theme must apply at the first mounted UI');
    check(await page.evaluate(() => window.pageAtFirstUi === 'flat'), 'Page style must restore before first mounted UI');
    check(!disk.source.includes('pageBackground') && !disk.source.includes('uiLanguage') && !disk.source.includes('accentColor') && !disk.source.includes('ieumdoc.theme'), 'Display preference leaked into document');
    await settings('ko');
    check(await page.getByRole('combobox',{name:'테마',exact:true}).inputValue() === 'dark' &&
      await page.getByRole('option',{name:'시스템',exact:true}).count() === 1, 'Korean theme labels are missing');
    check(await page.getByRole('combobox',{name:'페이지 모양',exact:true}).inputValue() === 'flat' && await page.getByRole('option',{name:'종이',exact:true}).count() === 1 && await page.getByRole('option',{name:'평면',exact:true}).count() === 1, 'Korean page labels are missing');
    check(await page.getByRole('radiogroup',{name:'포인트 색',exact:true}).getByRole('radio',{name:'청록',exact:true}).isChecked(), 'Korean radio labels and selected state are missing');
    if (screenshots) {
      await page.setViewportSize({ width: 640, height: 812 });
      await page.screenshot({ path: 'tmp/256/settings-ko-640.png' });
      check(await page.locator('html').evaluate(node => node.scrollWidth <= innerWidth), 'Korean settings overflow at narrow width');
    }
    await page.getByTestId('ui-language').selectOption('en');
    await closeSettings();
    // Malformed and disabled storage fall back safely on startup. The live choice still works.
    await page.evaluate(() => { localStorage.setItem('ieumdoc.accentColor', 'unknown'); localStorage.setItem('ieumdoc.theme', 'unknown'); localStorage.setItem('ieumdoc.pageBackground', 'unknown'); });
    await page.reload(); await ready();
    check(await page.evaluate(() => window.accentAtFirstUi === 'blue'), 'Invalid accent must fall back to blue before mounting');
    check(await page.evaluate(() => window.themeAtFirstUi === 'light'), 'Invalid theme must fall back to System before mounting');
    check(await page.evaluate(() => window.pageAtFirstUi === 'paper'), 'Invalid page background must default to paper');
    await page.addInitScript(() => {
      const get = Storage.prototype.getItem, set = Storage.prototype.setItem;
      Storage.prototype.getItem = function(key) { if (['ieumdoc.accentColor','ieumdoc.theme','ieumdoc.pageBackground'].includes(key)) throw Error('blocked'); return get.call(this, key); };
      Storage.prototype.setItem = function(key, value) { if (['ieumdoc.accentColor','ieumdoc.theme','ieumdoc.pageBackground'].includes(key)) throw Error('blocked'); return set.call(this, key, value); };
    });
    await page.reload(); await ready();
    check(await page.evaluate(() => window.accentAtFirstUi === 'blue'), 'Unavailable accent store must not block startup');
    await settings('en');
    check(await page.getByTestId('theme').inputValue() === 'system', 'Unavailable theme storage must fall back to System');
    check(await page.getByTestId('page-background').inputValue() === 'paper', 'Unavailable page store must default to paper');
    await page.getByTestId('page-background').selectOption('flat');
    check(await page.locator('html').getAttribute('data-page') === 'flat', 'Live page background must work without storage');
    await page.getByRole('alert').filter({hasText:'Page style could not be saved.'}).waitFor();
    await page.getByTestId('theme').selectOption('dark');
    check(await page.locator('html').getAttribute('data-theme') === 'dark', 'Live theme must work without storage');
    await page.getByRole('alert').filter({hasText:'Theme could not be saved.'}).waitFor();
    await page.getByTestId('accent-color').getByRole('radio', {name:'Plum',exact:true}).check();
    check(await page.evaluate(() => document.documentElement.dataset.accent === 'plum'), 'Live accent must work without storage');
    await page.getByRole('alert').filter({ hasText: 'Accent color could not be saved.' }).waitFor();
    await closeSettings();
    await settings('en');
    check(await page.getByTestId('accent-color').getByRole('radio', {name:'Plum',exact:true}).isChecked(), 'Reopening Settings lost the live choice');
    check(await page.getByTestId('page-background').inputValue() === 'flat', 'Reopening Settings lost live page choice');
    check(await page.getByTestId('theme').inputValue() === 'dark', 'Reopening Settings lost the live theme choice');
    await page.getByTestId('theme').selectOption('system');
    await page.emulateMedia({colorScheme:'dark'});
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
    await page.emulateMedia({colorScheme:'light'});
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
    await closeSettings();
    return { accentResults, captureMetadata, firstUiAccent: true, invalidAndUnavailableStorage: true, editorPreserved: true, draftAndSelectionPreserved: true, undoRedo: true, liveError: true, saveReload: true, conflictPreserved: true, persisted: true };
  } finally {
    await original.dispose();
    await page.evaluate(() => { localStorage.setItem('ieumdoc.uiLanguage', 'en'); document.documentElement.dataset.accent = 'blue'; });
    await page.setViewportSize({ width: 1280, height: 720 });
  }
}
