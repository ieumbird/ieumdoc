// pnpm browser:test list-format [--screenshots]. Interface checks, then optional manual captures.
async (page, { openPath, expect, screenshots }) => {
  const origin = page.url().split('/').slice(0, 3).join('/');
  const defaultPath = (await (await page.request.get(`${origin}/api/document`)).json()).path;
  const separator = defaultPath.includes('\\') ? '\\' : '/';
  const root = defaultPath.split(separator).slice(0, -4).join(separator);
  const file = [root, 'tmp', 'list-format', 'list-format.md'].join(separator);
  await openPath(page, file);
  const tab = page.locator('[data-document-tab][data-active=true]');
  const editor = tab.locator('.document-editor');
  await expect(editor).toContainText('List formats');
  const json = () => editor.evaluate(el => el.editor.getJSON());
  // Typed paste allocates fresh session locators, which are not document meaning.
  const semantic = value => JSON.parse(JSON.stringify(value, (key, value) => key === 'sourcePath' ? undefined : value));
  const menu = name => page.getByRole('menu', { name, exact: true });
  const blockMenu = async (index, label = 'Block actions') => {
    await tab.locator('.block-handle').nth(index).focus();
    await page.keyboard.press('Enter');
    await menu(label).and(page.locator(':focus-within')).waitFor();
    return menu(label);
  };
  const formats = async () => {
    await (await blockMenu(2)).getByRole('menuitem', { name: 'List format', exact: true }).click();
    await menu('List format').and(page.locator(':focus-within')).waitFor();
    return menu('List format');
  };
  const target = () => editor.locator(':scope > ol').first();
  const choose = async name => (await formats()).getByRole('menuitemradio', { name, exact: true }).click();
  expect(await (await blockMenu(5)).getByRole('menuitem', { name: 'List format', exact: true }).count()).toBe(0);
  await page.keyboard.press('Escape');
  // Cursor in another list must not retarget a handle action.
  await editor.evaluate(el => {
    const e = el.editor; let pos = 3;
    for (let index = 0; index < 4; index++) pos += e.state.doc.child(index).nodeSize;
    e.commands.setTextSelection(pos); e.view.focus();
  });
  const before = await json();
  const options = await formats();
  expect(await options.getByRole('menuitemradio').allTextContents()).toEqual(['1.', '1)', 'a.', 'a)', 'A.', 'A)', 'i.', 'i)', 'I.', 'I)']);
  expect(await options.getByRole('menuitemradio', { name: '1.', exact: true }).getAttribute('aria-checked')).toBe('true');
  await options.getByRole('menuitemradio', { name: 'a)', exact: true }).click();
  const selected = await json();
  expect(selected.content[2].attrs).toMatchObject({ start: 3, style: 'lower-alpha', delimiter: ')' });
  expect(selected.content[2].content[0].content[1].attrs).toMatchObject({ start: 2, style: 'decimal', delimiter: '.' });
  expect(selected.content[4]).toEqual(before.content[4]);
  await page.keyboard.press('Control+z'); expect(await json()).toEqual(before);
  await page.keyboard.press('Control+Shift+z'); expect(await json()).toEqual(selected);
  const current = await formats();
  expect(await current.getByRole('menuitemradio', { name: 'a)', exact: true }).getAttribute('aria-checked')).toBe('true');
  await current.getByRole('menuitemradio', { name: 'a)', exact: true }).click();
  await page.keyboard.press('Control+z'); expect(await json()).toEqual(before);
  await page.keyboard.press('Control+Shift+z');
  for (const [style, preview] of [['decimal', '1'], ['lower-alpha', 'a'], ['upper-alpha', 'A'], ['lower-roman', 'i'], ['upper-roman', 'I']]) {
    for (const delimiter of ['.', ')']) {
      await choose(preview + delimiter);
      expect(await target().getAttribute('data-list-style')).toBe(style);
      expect(await target().getAttribute('data-list-delimiter')).toBe(delimiter);
      expect(await target().evaluate(el => getComputedStyle(el).listStyleType)).toBe(style);
      if (delimiter === ')') expect(await target().locator(':scope > li').first().evaluate(el => getComputedStyle(el, '::marker').content)).toContain('") "');
    }
  }
  await choose('a)');
  // The actual typed copy/paste event path, isolated from the shared OS clipboard.
  const copied = await editor.evaluate(el => {
    const e = el.editor; let at = 0;
    for (let index = 0; index < 2; index++) at += e.state.doc.child(index).nodeSize;
    e.commands.setNodeSelection(at);
    const data = new DataTransfer();
    e.view.dom.dispatchEvent(new ClipboardEvent('copy', { clipboardData: data, bubbles: true, cancelable: true }));
    const html = data.getData('text/html');
    at = 0; for (let index = 0; index < 4; index++) at += e.state.doc.child(index).nodeSize;
    e.commands.setNodeSelection(at);
    e.view.dom.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    return html;
  });
  expect(copied).toContain('data-litzio-type="orderedList"');
  const pasted = await json();
  expect(pasted.content[4].attrs).toMatchObject({ start: 3, style: 'lower-alpha', delimiter: ')' });
  expect(semantic(pasted.content[4].content)).toEqual(semantic(pasted.content[2].content));
  await page.keyboard.press('Control+z'); expect((await json()).content[4]).toEqual(before.content[4]);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.locator('[data-testid="status"]:is([data-operation="saved"], [data-operation="save-failed"])').waitFor({ state: 'attached' });
  expect(await page.getByTestId('status').getAttribute('data-operation')).toBe('saved');
  const saved = await (await page.request.get(`${origin}/document/list-format.md?path=${encodeURIComponent(file)}`)).text();
  expect(saved).toContain('{style=lower-alpha}\n3)');
  const expected = await json();
  await page.reload();
  await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({ state: 'attached' });
  expect(semantic((await json()).content)).toEqual(semantic(expected.content));
  expect(await target().getAttribute('data-list-delimiter')).toBe(')');
  // Capture walk is manual evidence, separate from the assertions above.
  const captures = [];
  if (screenshots) for (const language of ['en', 'ko']) {
    await page.evaluate(language => localStorage.setItem('litzio.uiLanguage', language), language);
    await page.reload();
    await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({ state: 'attached' });
    for (const width of [1440, 640]) {
      await page.setViewportSize({ width, height: 900 });
      const capture = async state => {
        const path = `tmp/list-format-evidence/after-${language}-${state}-${width}.png`;
        await page.screenshot({ path }); captures.push(path);
      };
      await page.mouse.move(0, 0); await capture('document');
      const actions = await blockMenu(2, language === 'ko' ? '블록 작업' : 'Block actions');
      await capture('menu');
      await actions.getByRole('menuitem', { name: language === 'ko' ? '목록 형식' : 'List format', exact: true }).click();
      await menu(language === 'ko' ? '목록 형식' : 'List format').and(page.locator(':focus-within')).waitFor();
      await capture('formats'); await page.keyboard.press('Escape');
    }
  }
  return { targetAndCurrentCheck: true, oneStepUndo: true, typedClipboard: true, savedAndReloaded: true, captures };
}
