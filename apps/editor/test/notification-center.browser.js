// Window-scoped notifications: applied Core numbering, render failures, lifecycle and navigation.
async (page, { openPath, expect, screenshots }) => {
  await page.evaluate(() => localStorage.setItem('ieumdoc.uiLanguage','en'));
  await page.reload();
  await page.locator('[data-testid="status"][data-operation="ready"]').waitFor();
  const origin = page.url().split('/').slice(0, 3).join('/');
  const initial = await (await page.request.get(`${origin}/api/document`)).json();
  const sep = initial.path.includes('\\') ? '\\' : '/';
  const root = initial.path.split(sep).slice(0, -4).join(sep);
  const file = [root, 'tmp', 'reference-save-reload', 'fixed.md'].join(sep);
  await openPath(page, file);
  const ownerId = await page.locator('[data-document-tab][data-active=true]').getAttribute('data-document-tab');
  const engine = page.locator('[data-document-tab][data-active=true] .document-editor');
  const center = page.locator('.notification-center');
  const toggle = () => center.locator(':scope > button');
  const change = async value => engine.evaluate((el, value) => {
    const e = el.editor;
    e.state.doc.forEach((node, pos) => {
      if (node.attrs.label === 'fixed-table') e.view.dispatch(e.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, enumerator: value }));
    });
  }, value);
  const diagram = async source => engine.evaluate((el, source) => {
    const e = el.editor;
    e.state.doc.forEach((node, pos) => {
      if (node.attrs.label === 'fixed-diagram') e.view.dispatch(e.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, mermaidSource: source }));
    });
  }, source);
  await engine.locator('p.paragraph').first().click();
  const selection = await engine.evaluate(el => JSON.stringify(el.editor.state.selection.toJSON()));
  await change(null);
  await expect(center).toContainText('Applied document');
  await expect(center).toHaveAttribute('data-severity', 'warning');
  await expect(toggle()).toHaveAttribute('aria-expanded', 'true');
  expect(await engine.evaluate(el => el.contains(document.activeElement))).toBe(true);
  expect(await engine.evaluate(el => JSON.stringify(el.editor.state.selection.toJSON()))).toBe(selection);
  if (screenshots) {
    await engine.locator('[data-testid=mermaid-preview] img').first().waitFor();
    for (const language of ['en', 'ko']) {
      if (language === 'ko') {
        await page.getByRole('button', { name: 'Settings', exact: true }).click();
        await page.getByTestId('ui-language').selectOption('ko');
        await page.keyboard.press('Escape');
        await page.getByTestId('settings-dialog').waitFor({ state: 'detached' });
      }
      for (const width of [1440, 640]) for (const theme of ['light', 'dark']) {
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ colorScheme: theme });
        await page.evaluate(async () => { await document.fonts.ready; document.querySelector('.document-scroll[data-active=true]').scrollTo(0,0); });
        await page.mouse.move(0,0);
        const geometry = await center.evaluate(el => {
          const list = el.querySelector('ul'), rect = el.getBoundingClientRect();
          return { left:rect.left, right:rect.right, top:rect.top, bottom:rect.bottom,
            width:innerWidth, height:innerHeight, contentFits:list.scrollWidth === list.clientWidth,
            pageFits:document.documentElement.scrollWidth <= innerWidth };
        });
        expect(geometry.left).toBeGreaterThanOrEqual(0);
        expect(geometry.right).toBeLessThanOrEqual(geometry.width - 16);
        expect(geometry.top).toBeGreaterThanOrEqual(0);
        expect(geometry.bottom).toBeLessThanOrEqual(geometry.height);
        expect(geometry.contentFits && geometry.pageFits).toBe(true);
        await page.screenshot({ path: `tmp/notification-792-after-${width}-${theme}-${language}.png` });
      }
    }
    await page.getByRole('button', { name:'설정', exact:true }).click();
    await page.getByTestId('ui-language').selectOption('en');
    await page.keyboard.press('Escape');
    await page.getByTestId('settings-dialog').waitFor({state:'detached'});
    await page.setViewportSize({width:1440,height:900});
    await page.emulateMedia({colorScheme:'light'});
  }
  await center.getByRole('button', { name:'Go to problem', exact:true }).click();
  expect(await engine.evaluate(el => el.editor.state.selection.$from.parent.type.name)).toBe('tableCell');
  await diagram('this is not Mermaid');
  await expect(center.getByTestId('mermaid-error')).toBeVisible();
  await expect(center).toHaveAttribute('data-severity', 'error');
  await expect(toggle()).toContainText('Error · 2');
  await toggle().click();
  await diagram('graph LR\n  A --> B');
  await expect(center.getByTestId('mermaid-error')).toHaveCount(0);
  await expect(center.locator('ul')).toBeHidden(); // Removing an error must not reopen the remaining warning.
  await change('A.3');
  await expect(center).toHaveCount(0);
  await change(null);
  await expect(center.locator('ul')).toBeVisible();
  await center.getByRole('button', { name:'Dismiss notification' }).click();
  await expect(center).toHaveCount(0);
  await engine.evaluate(el => el.editor.commands.insertContent('unrelated'));
  await expect(center).toHaveCount(0);
  await change('A.3');
  await change(null);
  await expect(center.locator('ul')).toBeVisible();
  // Hidden tabs keep their unresolved causes and navigation returns to the owning document.
  await openPath(page, initial.path);
  await expect(center.getByTestId('numbering-warning')).toHaveCount(1);
  await center.getByRole('button', {name:'Go to problem',exact:true}).click();
  await expect(page.locator(`[data-document-tab="${ownerId}"]`)).toHaveAttribute('data-active','true');
  await expect(engine).toBeFocused();
  const other = await page.context().newPage();
  try {
    await other.goto(`${origin}/?path=${encodeURIComponent(initial.path)}`);
    await other.locator('[data-testid="status"][data-operation="ready"]').waitFor();
    await expect(other.locator('.notification-center')).toHaveCount(0);
  } finally { await other.close(); }
  await toggle().click();
  await change('A.3');
  await expect(center).toHaveCount(0);
  // Pending Mermaid has no applied source. Only its draft preview reports input feedback.
  await diagram(null);
  await engine.getByRole('button', {name:'Write Mermaid',exact:true}).click();
  await page.getByTestId('mermaid-source').fill('this is not Mermaid');
  await expect(page.getByTestId('mermaid-edit-preview').getByTestId('mermaid-error')).toBeVisible();
  await expect(center.getByTestId('mermaid-error')).toHaveCount(0);
  await page.getByTestId('mermaid-cancel').click();
  await expect(center).toHaveCount(0);
  await page.getByRole('button', {name:'File actions',exact:true}).click();
  await page.getByRole('menuitem', {name:'Copy path',exact:true}).click();
  await expect(center).toHaveAttribute('data-severity','info');
  await expect(toggle()).toHaveAttribute('aria-expanded','false');
  await expect(center.getByTestId('notice')).toBeHidden();
  await toggle().click();
  await expect(center.getByTestId('notice')).toContainText('Copied the file path.');
  await expect(center).toHaveCount(0, {timeout:6500}); // Existing one-shot lifetime, no focus change.
  // Localizing an unresolved app cause must not revive a dismissed item.
  await page.evaluate(() => {
    window.__notificationClipboard = Object.getOwnPropertyDescriptor(Navigator.prototype, 'clipboard');
    Object.defineProperty(Navigator.prototype, 'clipboard', {configurable:true,get:()=>undefined});
  });
  try {
    await page.getByRole('button', {name:'File actions',exact:true}).click();
    await page.getByRole('menuitem', {name:'Copy path',exact:true}).click();
    await expect(center.getByTestId('error')).toBeVisible();
    await center.getByRole('button', {name:'Dismiss error',exact:true}).click();
    await page.getByRole('button', {name:'Settings',exact:true}).click();
    await page.getByTestId('ui-language').selectOption('ko');
    await page.keyboard.press('Escape');
    await page.getByTestId('settings-dialog').waitFor({state:'detached'});
    await expect(center).toHaveCount(0);
  } finally {
    await page.evaluate(() => Object.defineProperty(Navigator.prototype, 'clipboard', window.__notificationClipboard));
  }
  await page.getByRole('button', {name:'설정',exact:true}).click();
  await page.getByTestId('ui-language').selectOption('en');
  await page.keyboard.press('Escape');
  await page.getByTestId('settings-dialog').waitFor({state:'detached'});
  await expect(center).toHaveCount(0);
  return { lifecycle:true, focusPreserved:true, inactiveNavigation:true, windowIsolation:true };
}
