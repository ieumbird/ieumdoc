// Input surfaces and field-level errors; document warnings and submission rules have their own regressions.
async (page, { openPath, expect, screenshots }) => {
  const origin = page.url().split('/').slice(0, 3).join('/');
  const defaultPath = (await (await page.request.get(`${origin}/api/document`)).json()).path;
  const separator = defaultPath.includes('\\') ? '\\' : '/';
  const root = defaultPath.split(separator).slice(0, -4).join(separator);
  const file = [root, 'tmp', 'short-fields', 'fields.md'].join(separator);
  const problems = [];
  const openEditor = async (block, button) => {
    await block.scrollIntoViewIfNeeded();
    await block.hover({ position: { x: 4, y: 4 } });
    await button.click();
  };
  const capture = async name => {
    if (screenshots) await page.screenshot({ path: `tmp/short-fields-captures/${name}.png` });
  };
  const checkSurface = async testId => {
    const field = page.getByTestId(testId);
    await field.press('Tab');
    await page.mouse.move(0, 0);
    const rest = await field.evaluate(input => ({border: getComputedStyle(input).borderTopColor, background: getComputedStyle(input).backgroundColor}));
    expect(rest.border, `${testId}: quiet rest border`).toBe('rgba(0, 0, 0, 0)');
    expect(rest.background, `${testId}: visible fill`).not.toBe('rgba(0, 0, 0, 0)');
    await field.hover();
    expect(await field.evaluate(input => getComputedStyle(input).borderTopColor), `${testId}: hover boundary`).not.toBe(rest.border);
    await field.focus();
    expect(await field.evaluate(input => getComputedStyle(input).boxShadow), `${testId}: keyboard focus ring`).not.toBe('none');
  };
  const checkError = async (testId, value, expectedMessage) => {
    const field = page.getByTestId(testId);
    const state = await field.evaluate(input => {
      const ids = (input.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
      const messages = ids.map(id => document.getElementById(id));
      return { message: messages.map(message => message?.textContent ?? '').join(' '), invalid: input.getAttribute('aria-invalid'), border: getComputedStyle(input).borderTopColor,
        errorColor: messages[0] ? getComputedStyle(messages[0]).color : undefined, described: messages.some(message => message?.textContent?.trim()),
        below: messages.some(message => message && message.getBoundingClientRect().top >= input.getBoundingClientRect().bottom - 1) };
    });
    if ((expectedMessage && state.message !== expectedMessage) || state.invalid !== 'true' || state.border !== state.errorColor || !state.described || !state.below || await field.inputValue() !== value) {
      problems.push({ testId, value, state });
    }
  };
  for (const [width, language, theme] of [[1440, 'en', 'light'], [640, 'ko', 'dark']]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(({ language, theme }) => {
      localStorage.setItem('litzio.uiLanguage', language);
      localStorage.setItem('litzio.theme', theme);
    }, { language, theme });
    await page.reload();
    await page.getByTestId('status').filter({ visible: true }).waitFor();
    if (language === 'en') await openPath(page, file);
    else await page.locator('[data-document-tab][data-active=true] .ProseMirror').waitFor();
    await page.locator('html[data-theme="' + theme + '"]').waitFor();
    await page.evaluate(() => document.fonts.ready);
    const active = page.locator('[data-document-tab][data-active=true]');
    const tag = `${width}-${theme}-${language}`;
    const labelError = language === 'en' ? 'Label cannot have leading or trailing spaces.' : '레이블 앞뒤에 공백을 넣을 수 없습니다.';
    const edit = language === 'en' ? 'Edit' : '편집';
    const equation = active.locator('[data-block="equation"]').first();
    await openEditor(equation, equation.getByRole('button', { name: edit, exact: true }));
    await page.getByTestId('equation-edit-source').click();
    await checkSurface('equation-label');
    await page.getByTestId('equation-label').fill(' bad-label');
    await page.getByTestId('equation-apply').click();
    await capture(`${tag}-equation`);
    await checkError('equation-label', ' bad-label', labelError);
    await page.getByTestId('equation-label').fill('eq-one');
    await expect(page.getByTestId('equation-label')).not.toHaveAttribute('aria-invalid', 'true');
    await page.getByTestId('equation-editor').getByRole('button', {name: language === 'en' ? 'Fixed' : '고정', exact: true}).click();
    await page.getByTestId('equation-apply').click();
    await checkError('equation-enumerator', '');
    await page.getByTestId('equation-cancel').click();

    const figure = active.locator('[data-block="figure"]').first();
    await openEditor(figure, figure.locator('.figure-edit'));
    await page.getByTestId('figure-label').fill(' bad-label');
    await page.getByTestId('figure-apply').click();
    await capture(`${tag}-figure`);
    await checkError('figure-label', ' bad-label', labelError);
    await page.getByTestId('figure-label').fill('fig-one');
    await page.getByTestId('figure-alt').fill(' bad alt');
    await page.getByTestId('figure-apply').click();
    await checkError('figure-alt', ' bad alt');
    await page.getByTestId('figure-alt').fill('Diagram');
    if (!await page.getByTestId('figure-properties').locator('details').evaluate(element => element.open)) {
      await page.getByTestId('figure-properties').locator('summary').click();
    }
    await page.getByTestId('figure-file-name').fill('bad/name');
    await page.getByTestId('figure-rename').click();
    await checkError('figure-file-name', 'bad/name');
    const alignment = await page.getByTestId('figure-file-name').evaluate(input => {
      const button = input.closest('.figure-image-field').querySelector('button');
      const field = input.getBoundingClientRect();
      const action = button.getBoundingClientRect();
      return Math.abs(field.top + field.height / 2 - action.top - action.height / 2);
    });
    expect(alignment, 'Rename remains centered on its input when an error wraps below it').toBeLessThanOrEqual(1);
    await page.getByTestId('figure-file-name').press('Escape');

    const table = active.locator('[data-block="table"]').first();
    await openEditor(table, table.getByRole('button', {name: language === 'en' ? 'Edit table' : '표 편집', exact: true}));
    await checkSurface('table-label');
    await page.getByTestId('table-label').fill(' bad-label');
    await page.getByTestId('table-apply').click();
    await capture(`${tag}-table`);
    await checkError('table-label', ' bad-label', labelError);
    await page.getByTestId('table-label').fill('eq-one');
    await page.getByTestId('table-apply').click();
    await checkError('table-label', 'eq-one', language === 'en'
      ? 'This label already names another target, including an automatic heading ID.'
      : '이 레이블은 이미 다른 대상에 사용 중입니다. 제목의 자동 ID도 중복될 수 없습니다.');
    await page.getByTestId('table-label').fill("''");
    await page.getByTestId('table-apply').click();
    await checkError('table-label', "''", language === 'en'
      ? 'This label cannot name a reference target. Choose another label.'
      : '이 레이블은 참조 대상을 지정할 수 없습니다. 다른 레이블을 입력하세요.');
    await page.getByTestId('table-label').press('Escape');

    const mermaid = active.locator('.mermaid-figure').first();
    await openEditor(mermaid, mermaid.locator('.figure-edit'));
    await page.getByTestId('mermaid-property-label').fill(' bad-label');
    await page.getByTestId('mermaid-property-apply').click();
    await capture(`${tag}-mermaid-metadata`);
    await checkError('mermaid-property-label', ' bad-label', labelError);
    await page.getByTestId('mermaid-property-label').press('Escape');
    await openEditor(mermaid, mermaid.locator('.figure-edit'));
    await page.getByTestId('mermaid-edit-source').click();
    await page.getByTestId('mermaid-source').fill('');
    await page.getByTestId('mermaid-apply').click();
    await capture(`${tag}-mermaid-source`);
    await checkError('mermaid-source', '');
    await page.getByTestId('mermaid-cancel').click();

    await active.getByRole('heading', {name: 'Section one', exact: true}).hover();
    await active.getByTestId('label-target-edit').click();
    await checkSurface('label-target-input');
    await page.getByTestId('label-target-input').fill(' bad-label');
    await page.getByTestId('label-target-apply').click();
    await capture(`${tag}-section`);
    await checkError('label-target-input', ' bad-label', labelError);
    await page.getByTestId('label-target-input').fill('절');
    await page.getByTestId('label-target-apply').click();
    await checkError('label-target-input', '절', language === 'en'
      ? 'A section label uses 1-100 ASCII letters, digits or | @ < > * . / _ - + : characters.'
      : '절 레이블은 영문자, 숫자 또는 | @ < > * . / _ - + : 문자 1~100자로 입력하세요.');
    await page.getByTestId('label-target-input').press('Escape');

    await active.getByTestId('inline-math').locator('.katex-html').dblclick();
    await page.getByTestId('inline-math-source').fill('');
    await page.getByTestId('inline-math-apply').click();
    await capture(`${tag}-inline-math`);
    await checkError('inline-math-source', '');
    await page.getByTestId('inline-math-cancel').click();

    await active.locator('.ProseMirror').evaluate(element => {
      const instance = element.editor;
      let range;
      instance.state.doc.descendants((node, position) => {
        if (!range && node.isText && node.text === 'link') range = {from: position, to: position + node.nodeSize};
      });
      instance.view.focus();
      instance.commands.setTextSelection(range);
    });
    await page.getByTestId('selection-toolbar').waitFor();

    await page.getByTestId('selection-toolbar').getByRole('button', {name: language === 'en' ? 'Link' : '링크', exact: true}).click();
    // The URL field autofocuses; its fill and focus follow the shared short-field surface.
    await expect(page.getByTestId('link-url')).toBeFocused();
    await page.getByTestId('link-url').fill('bad url');
    await page.getByTestId('link-apply').click();
    await capture(`${tag}-link`);
    await checkError('link-url', 'bad url');
    await page.getByTestId('link-url').press('Escape');
  }
  expect(problems, 'Every rejected input retains its value and describes a localized error below itself').toEqual([]);
}
