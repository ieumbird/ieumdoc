// pnpm browser:test document-title --screenshots
// Metadata title input, shared history, real Save/Source/Reload, and leading H1 sections.
async (page, { openPath, reloadDocument, expect, screenshots, waitForEditorFocus }) => {
  await page.unrouteAll();
  await page.setViewportSize({width:1440,height:900});
  const origin = page.url().split('/').slice(0,3).join('/');
  const initial = await (await page.request.get(`${origin}/api/document`)).json();
  const sep = initial.path.includes('\\') ? '\\' : '/';
  const scratch = name => [...initial.path.split(sep).slice(0,-4), 'tmp', 'document-title', name].join(sep);
  const active = page.locator('[data-document-tab][data-active=true]');
  const editor = active.locator('.document-editor');
  const title = active.getByRole('textbox', {name:'Title',exact:true});
  const read = async name => (await (await page.request.get(`${origin}/api/document?path=${encodeURIComponent(scratch(name))}`)).json());
  const save = async () => {
    await page.keyboard.press('Control+s');
    const status = page.getByTestId('status');
    await page.locator('[data-testid="status"]:is([data-operation="saved"],[data-operation="save-failed"])').waitFor();
    await expect(status, await page.locator('body').innerText()).toHaveAttribute('data-operation','saved');
  };
  const capture = async suffix => {
    if (!screenshots) return;
    await page.evaluate(() => document.fonts.ready);
    for (const width of [1440,640]) {
      await page.setViewportSize({width,height:900});
      await expect(title).toBeVisible();
      await page.screenshot({path:`tmp/722-${suffix}-${width}.png`});
    }
    await page.setViewportSize({width:1440,height:900});
  };

  // Same original source as the Before capture: H1 stays body, with an empty title input.
  await openPath(page, scratch('technical-document.md'));
  await expect(title).toHaveValue('');
  await expect(title).toHaveAttribute('placeholder','Add a title (optional)');
  const titleStyle = () => title.evaluate(n => ({ height:n.getBoundingClientRect().height,
    font:getComputedStyle(n).fontSize, placeholderFont:getComputedStyle(n,'::placeholder').fontSize }));
  const emptyStyle = await titleStyle();
  expect(parseFloat(emptyStyle.placeholderFont)).toBeLessThan(parseFloat(emptyStyle.font));
  const titleGeometry = () => title.evaluate(n => {
    const box = n.getBoundingClientRect(), style = getComputedStyle(n), hint = getComputedStyle(n,'::placeholder');
    const h1 = n.closest('[data-document-tab]').querySelector('.document-editor h1').getBoundingClientRect();
    const hintCenter = box.top + parseFloat(style.borderTopWidth) + parseFloat(style.paddingTop) + parseFloat(hint.lineHeight) / 2;
    return {box:{x:box.x,y:box.y,width:box.width,height:box.height}, bodyTop:h1.top,
      hintCenterOffset:hintCenter - (box.top + box.height / 2),
      focusGap:parseFloat(style.outlineOffset) + parseFloat(style.paddingLeft)};
  });
  for (const width of [1440,640]) {
    await page.setViewportSize({width,height:900});
    await title.evaluate(n => n.blur());
    const unfocused = await titleGeometry();
    expect(Math.abs(unfocused.hintCenterOffset)).toBeLessThan(0.1);
    await title.focus();
    const focused = await titleGeometry();
    expect(focused.box).toEqual(unfocused.box);
    expect(focused.bodyTop).toBe(unfocused.bodyTop);
    expect(focused.focusGap).toBeGreaterThan(0);
    await title.fill('Title');
    const typing = await titleGeometry();
    expect(typing.box).toEqual(unfocused.box);
    expect(typing.bodyTop).toBe(unfocused.bodyTop);
    expect(typing.focusGap).toBeGreaterThan(0);
    await title.fill('');
    expect(Math.abs((await titleGeometry()).hintCenterOffset)).toBeLessThan(0.1);
  }
  await page.setViewportSize({width:1440,height:900});
  await title.fill('Optional document title');
  expect((await titleStyle()).height).toBe(emptyStyle.height);
  expect(await title.evaluate(n => n.matches(':placeholder-shown'))).toBe(false);
  await title.fill('');
  expect(await title.evaluate(n => n.matches(':placeholder-shown'))).toBe(true);
  expect((await titleStyle()).height).toBe(emptyStyle.height);
  await expect(editor.locator('h1')).toHaveText('Converter Control');
  await expect(editor.locator('[data-document-title]')).toHaveCount(0);
  await editor.locator('h1').hover();
  await expect(page.getByRole('button', {name:'Move heading block 1',exact:true})).toHaveAttribute('draggable','true');
  await page.mouse.move(0,0);
  await capture('after-existing');

  await openPath(page, scratch('chapter.md'));
  await expect(title).toHaveValue('IEEE 1547 · Chapter 7');
  const opening = (await read('chapter.md')).document;
  await expect(editor.locator('h1').first()).toHaveAttribute('data-heading-number','1');
  await expect(editor.locator('h2')).toHaveAttribute('data-heading-number','1.1');
  const outline = page.getByTestId('outline');
  if (!await outline.isVisible()) await page.getByRole('button', {name:'Outline',exact:true}).click();
  await expect(outline).not.toContainText('IEEE 1547');
  await expect(outline).toContainText('1 Power quality');
  await capture('after-authored');

  await title.fill('Updated chapter title');
  await expect(page.getByTestId('status')).toHaveAttribute('title','Unsaved changes');
  await page.keyboard.press('Control+z');
  await expect(title).toHaveValue('IEEE 1547 · Chapter 7');
  await page.keyboard.press('Control+Shift+z');
  await expect(title).toHaveValue('Updated chapter title');
  // Enter enters existing body text, retaining its H1 and content.
  await page.keyboard.press('Enter');
  await waitForEditorFocus(page);
  await expect(editor.locator('h1').first()).toHaveText('Power quality');
  await save();
  const changed = await read('chapter.md');
  expect(changed.document.title).toBe('Updated chapter title');
  expect(changed.document.blocks).toEqual(opening.blocks);
  expect(changed.source).toContain('title: Updated chapter title');
  expect(changed.source).not.toContain('# Updated chapter title');

  await page.getByRole('button', {name:'Source',exact:true}).click();
  await expect(active.getByTestId('source-view')).toContainText('title: Updated chapter title');
  await page.getByRole('button', {name:'Visual',exact:true}).click();
  await reloadDocument(page);
  await expect(title).toHaveValue('Updated chapter title');
  await title.fill('');
  await save();
  const cleared = await read('chapter.md');
  expect(cleared.document.title).toBe('');
  expect(cleared.document.blocks).toEqual(opening.blocks);
  await reloadDocument(page);
  await expect(title).toHaveValue('');
  await expect(editor.locator('h1').first()).toHaveText('Power quality');

  // The labeled leading H1 moves with its section and remains a reference target.
  await editor.locator('h1').first().hover();
  await page.getByRole('button', {name:'Move heading block 2',exact:true}).click();
  await page.getByRole('menuitem', {name:'Move section down',exact:true}).click();
  await expect(editor.locator('h1').first()).toHaveText('Next clause');
  await expect(editor.locator('h1').last()).toHaveAttribute('data-heading-number','2');
  await expect(editor.locator('[data-label="clause-7"] .cross-reference-chip')).toHaveText('§ 2');
  await save();
  await reloadDocument(page);
  await expect(editor.locator('h1').first()).toHaveText('Next clause');
  await expect(title).toHaveValue('');
  // Single-line input follows the existing inline-math convention: pasted line separators become spaces.
  await page.context().grantPermissions(['clipboard-read','clipboard-write']);
  await title.focus();
  await page.evaluate(() => navigator.clipboard.writeText('  first\r\nsecond\u0085third\u2028fourth\u2029last  '));
  await page.keyboard.press('Control+v');
  await expect(title).toHaveValue('  first second third fourth last  ');
  await page.keyboard.press('Shift+Enter');
  await waitForEditorFocus(page);
  await expect(title).toHaveValue('  first second third fourth last  ');
  await save();
  expect((await read('chapter.md')).document.title).toBe('  first second third fourth last  ');
  await reloadDocument(page);
  await expect(title).toHaveValue('  first second third fourth last  ');
  return {singleLinePaste:true, plainMetadataTitle:true, noImplicitPromotion:true, history:true, enterKeepsBody:true,
    sourceSaveReload:true, emptyTitle:true, movableLeadingH1:true, coreNumbersAndReference:true};
}
