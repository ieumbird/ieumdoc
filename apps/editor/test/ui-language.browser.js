// Runtime display preferences preserve the editor, drafts, selection and real Save path.
async (page, { openPath, screenshots }) => {
  page.setDefaultTimeout(15000);
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
        observer.disconnect();
      }
    });
    observer.observe(document, { childList: true, subtree: true });
  });
  const accentResults = [];
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
    await settings('en');
    const picker = page.getByRole('combobox', { name: 'Accent color', exact: true });
    const presets = await picker.locator('option').evaluateAll(options => options.map(option => option.value));
    check(presets.join(',') === 'blue,violet,plum,teal,green,graphite', 'Settings must expose the six validated presets');
    for (const preset of presets) {
      await picker.selectOption(preset);
      await picker.focus();
      const colors = await page.evaluate(() => {
        const root = document.documentElement;
        const resolve = name => {
          const probe = document.createElement('span'); probe.style.color = `var(--id-color-${name})`; document.body.append(probe);
          const value = getComputedStyle(probe).color; probe.remove(); return value;
        };
        const editor = document.querySelector('[data-document-tab][data-active=true] .document-editor');
        const picker = document.querySelector('[data-testid="accent-color"]');
        const selection = getComputedStyle(editor.querySelector('.paragraph'), '::selection');
        return { preset: root.dataset.accent, interaction: resolve('interaction'), selected: resolve('text-selected'),
          selectedSurface: resolve('surface-selected'), focus: getComputedStyle(picker).borderColor,
          save: getComputedStyle(document.querySelector('[data-testid="save"]')).backgroundColor,
          selectionText: selection.color, selectionBackground: selection.backgroundColor,
          link: getComputedStyle(editor.querySelector('a')).color,
          reference: getComputedStyle(editor.querySelector('.cross-reference-chip')).color };
      });
      check(colors.preset === preset && colors.focus === colors.interaction && colors.save === colors.interaction &&
        colors.link === colors.interaction && colors.reference === colors.interaction &&
        colors.selectionText === colors.selected && colors.selectionBackground === colors.selectedSurface,
        `Accent consumers did not update: ${JSON.stringify(colors)}`);
      accentResults.push(colors);
    }
    check(new Set(accentResults.map(result => result.interaction)).size === presets.length, 'Presets must produce distinct colors');
    await picker.selectOption('teal');
    if (screenshots) await page.screenshot({ path: 'tmp/256/settings-en.png' });
    await page.getByTestId('ui-language').selectOption('ko');
    await page.getByRole('heading', { name: '표시 언어', exact: true }).waitFor();
    check(await page.locator('html').getAttribute('lang') === 'ko', 'Page language did not update');
    if (screenshots) await page.screenshot({ path: 'tmp/256/settings-ko.png' });
    await closeSettings();
    const koreanOpen = page.getByTestId('sidebar').getByRole('button', {name:'폴더 열기…', exact:true});
    check(await koreanOpen.isVisible() && await koreanOpen.getAttribute('title') === '폴더 열기…', 'Korean header Open folder name and tooltip must match');
    check(await admonitionLabel.innerText() === '참고', 'Existing Admonition label did not switch language');
    check(await page.getByRole('button', { name: /번째 문단 블록 뒤에 삽입/ }).count() > 0, 'Paragraph handle exposes its internal English type');
    check(await page.getByRole('button', { name: /번째 제목 블록 이동/ }).count() > 0, 'Heading handle exposes its internal English type');
    check(await editor.evaluate((node, handle) => node.editor === handle, original), 'Language change replaced the editor');
    check(JSON.stringify(await snapshot()) === JSON.stringify(before), 'Language change changed content or selection');
    check(await page.getByRole('tab').count() === tabCount, 'Language change lost tabs');
    check(await page.getByTestId('equation-latex').inputValue() === 'x_{language} = 42', 'Language change lost property draft');
    check(await page.getByTestId('equation-apply').innerText() === '적용', 'NodeView did not update language');
    check(await page.getByTestId('status').innerText() === '저장하지 않은 변경 사항', 'Dirty state did not survive');
    await page.getByTestId('equation-apply').click();
    const applied = await snapshot();
    await editor.evaluate(node => node.editor.commands.undo());
    check((await snapshot()).json !== applied.json, 'Undo no longer works');
    await editor.evaluate(node => node.editor.commands.redo());
    check((await snapshot()).json === applied.json, 'Redo did not restore applied edits');

    // Test failure text at its origin, then switch language while the error remains visible.
    await equation.hover();
    await equation.getByRole('button', { name: '편집', exact: true }).click();
    await page.getByTestId('equation-latex').fill('');
    await page.getByTestId('equation-apply').click();
    await page.getByText('수식 LaTeX는 비워 둘 수 없습니다.', { exact: true }).waitFor();
    await settings('ko');
    await page.getByTestId('ui-language').selectOption('en');
    await closeSettings();
    await page.getByText('Equation LaTeX cannot be empty.', { exact: true }).waitFor();
    await page.getByTestId('equation-cancel').click();
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

    // Language preference persists across a page reload; it does not enter the Markdown.
    await page.reload();
    await ready();
    check(await page.locator('html').getAttribute('lang') === 'ko', 'Language preference was not restored');
    check(await page.evaluate(() => window.accentAtFirstUi === 'teal' && document.documentElement.dataset.accent === 'teal'), 'Saved accent must apply at the first mounted UI');
    check(!disk.source.includes('uiLanguage') && !disk.source.includes('accentColor'), 'Display preference leaked into document');
    await settings('ko');
    if (screenshots) {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.screenshot({ path: 'tmp/256/settings-ko-375.png' });
      check(await page.locator('html').evaluate(node => node.scrollWidth <= innerWidth), 'Korean settings overflow at phone width');
    }
    await page.getByTestId('ui-language').selectOption('en');
    await closeSettings();
    // Malformed and disabled storage fall back safely on startup. The live choice still works.
    await page.evaluate(() => localStorage.setItem('ieumdoc.accentColor', 'unknown'));
    await page.reload(); await ready();
    check(await page.evaluate(() => window.accentAtFirstUi === 'blue'), 'Invalid accent must fall back to blue before mounting');
    await page.addInitScript(() => {
      const get = Storage.prototype.getItem, set = Storage.prototype.setItem;
      Storage.prototype.getItem = function(key) { if (key === 'ieumdoc.accentColor') throw Error('blocked'); return get.call(this, key); };
      Storage.prototype.setItem = function(key, value) { if (key === 'ieumdoc.accentColor') throw Error('blocked'); return set.call(this, key, value); };
    });
    await page.reload(); await ready();
    check(await page.evaluate(() => window.accentAtFirstUi === 'blue'), 'Unavailable accent store must not block startup');
    await settings('en');
    await page.getByTestId('accent-color').selectOption('plum');
    check(await page.evaluate(() => document.documentElement.dataset.accent === 'plum'), 'Live accent must work without storage');
    await page.getByRole('alert').filter({ hasText: 'Accent color could not be saved.' }).waitFor();
    await closeSettings();
    await settings('en');
    check(await page.getByTestId('accent-color').inputValue() === 'plum', 'Reopening Settings lost the live choice');
    await closeSettings();
    return { accentResults, firstUiAccent: true, invalidAndUnavailableStorage: true, editorPreserved: true, draftAndSelectionPreserved: true, undoRedo: true, liveError: true, saveReload: true, conflictPreserved: true, persisted: true };
  } finally {
    await original.dispose();
    await page.evaluate(() => { localStorage.setItem('ieumdoc.uiLanguage', 'en'); document.documentElement.dataset.accent = 'blue'; });
    await page.setViewportSize({ width: 1280, height: 720 });
  }
}
