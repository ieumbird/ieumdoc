// Rendered typography boundaries, including draft feedback outside PropertyForm.
async (page, { openPath, expect, screenshots }) => {
  const origin = page.url().split('/').slice(0, 3).join('/');
  const initial = await (await page.request.get(`${origin}/api/document`)).json();
  const sep = initial.path.includes('\\') ? '\\' : '/';
  const root = initial.path.split(sep).slice(0, -4);
  await page.evaluate(async () => (await import('/src/i18n.ts')).i18n.changeLanguage('en'));
  await page.setViewportSize({ width: 640, height: 900 });
  await openPath(page, [...root, 'tmp', 'short-fields', 'fields.md'].join(sep));
  await page.evaluate(async () => {
    (await import('/src/theme.ts')).applyTheme('dark');
    await (await import('/src/i18n.ts')).i18n.changeLanguage('ko');
    await document.fonts.ready;
  });
  const active = page.locator('[data-document-tab][data-active=true]');
  const results = [];
  const prose = async (locator, name, checkWords = false) => {
    await expect(locator).toBeVisible();
    const state = await locator.evaluate((el, checkWords) => {
      const style = getComputedStyle(el);
      const splitWords = [];
      if (checkWords) {
        const text = el.firstChild;
        for (const match of text.textContent.matchAll(/[가-힣]+/g)) {
          const range = document.createRange();
          const tops = [];
          for (let i = match.index; i < match.index + match[0].length; i++) {
            range.setStart(text, i); range.setEnd(text, i + 1);
            tops.push(range.getBoundingClientRect().top);
          }
          if (Math.max(...tops) - Math.min(...tops) > 1) splitWords.push(match[0]);
        }
      }
      return { wordBreak: style.wordBreak, overflowWrap: style.overflowWrap, splitWords };
    }, checkWords);
    expect(state.wordBreak, name).toBe('keep-all');
    expect(['anywhere', 'break-word'], `${name}: long-token fallback`).toContain(state.overflowWrap);
    expect(state.splitWords, `${name}: Korean words stay on one line`).toEqual([]);
    results.push({ name, ...state });
  };
  const open = async (block, button) => { await block.hover({ position: { x: 4, y: 4 } }); await button.click(); };
  const equation = active.locator('[data-block=equation]').first();
  await open(equation, equation.getByRole('button', { name: '편집', exact: true }));
  await page.getByTestId('equation-edit-source').click();
  await page.getByTestId('equation-latex').fill('x + y');
  // This status is a sibling of the form, inside .document-editor, not a form descendant.
  await prose(page.getByTestId('equation-draft-status'), 'equation draft', true);
  await prose(page.getByTestId('equation-editor'), 'embedded property form');
  await prose(page.getByTestId('equation-automatic-number'), 'embedded hint');
  await prose(page.getByTestId('draft-notice'), 'shell draft');
  if (screenshots) {
    await page.evaluate(() => document.fonts.ready);
    await page.mouse.move(0, 0);
    await page.screenshot({ path: 'tmp/ui-wrap-833/after-640-draft-form.png' });
  }
  await page.getByTestId('equation-latex').fill('\\frac{');
  await prose(page.getByTestId('equation-edit-preview-error'), 'embedded preview notice');
  await page.getByTestId('equation-cancel').click();
  const figure = active.locator('[data-block=figure]').first();
  await open(figure, figure.locator('.figure-edit'));
  await page.getByTestId('figure-alt').fill('Changed alt');
  await prose(figure.getByTestId('figure-draft-status'), 'image draft', true);
  await prose(page.getByTestId('figure-automatic-number'), 'image hint');
  await page.getByTestId('figure-alt').press('Escape');
  const table = active.locator('[data-block=table]').first();
  await open(table, table.getByRole('button', { name: '표 편집', exact: true }));
  await prose(page.getByTestId('table-editor'), 'table metadata form');
  await prose(page.getByTestId('table-automatic-number'), 'table hint');
  await page.getByTestId('table-label').press('Escape');
  const mermaid = active.locator('.mermaid-figure').first();
  await open(mermaid, mermaid.locator('.figure-edit'));
  await page.getByTestId('mermaid-edit-source').click();
  await page.getByTestId('mermaid-source').fill('graph LR\n A --> C');
  await prose(mermaid.getByTestId('figure-draft-status'), 'Mermaid draft', true);
  await prose(page.getByTestId('mermaid-automatic-number'), 'Mermaid hint');
  await page.getByTestId('mermaid-cancel').click();
  await active.locator('.document-editor').evaluate(el => el.editor.commands.insertContentAt(el.editor.state.doc.content.size,
    { type: 'codeBlock', attrs: { language: 'text' }, content: [{ type: 'text', text: '한글코드 LongIdentifier' }] }));
  for (const [selector, expected] of [['.document-editor', 'normal'], ['.paragraph', 'keep-all'],
    ['[data-table-cell]', 'keep-all'], ['.code-block pre', 'normal'], ['.code-block code', 'normal'], ['.code-language', 'normal']]) {
    const value = await active.locator(selector).first().evaluate(el => getComputedStyle(el).wordBreak);
    expect(value, `unchanged ${selector}`).toBe(expected);
    results.push({ name: selector, wordBreak: value });
  }
  await page.evaluate(async () => (await import('/src/i18n.ts')).i18n.changeLanguage('en'));
  return { results };
}
