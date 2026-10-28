// Run with pnpm browser:test outline.
// Navigates a long scratch document from the document panel outline with the mouse and the keyboard,
// follows the current section while scrolling, keeps that mark inside the outline list,
// and checks that heading edits update the outline
// immediately. The outline itself is navigation only; heading block menu section moves and
// deletion are then saved to the scratch file.
async (page, { openDocument, reloadDocument, expect }) => {
  // This scenario exercises docked navigation, above the 1424px docking boundary.
  await page.setViewportSize({width:1440,height:900});
  await page.unrouteAll();
  await page.reload();
  await page.waitForFunction(() => document.querySelector('[data-testid="status"]')?.getAttribute('data-operation') === 'ready');

  const origin = page.url().split('/').slice(0, 3).join('/');
  const defaultPath = (await (await page.request.get(`${origin}/api/document`)).json()).path;
  const separator = defaultPath.includes('\\') ? '\\' : '/';
  const root = defaultPath.split(separator).slice(0, -4).join(separator);
  const file = [root, 'tmp', 'outline', 'outline.md'].join(separator);

  await openDocument(page, file);
  await page.waitForFunction(() =>
    document.querySelector('[data-testid="status"]')?.getAttribute('data-operation') === 'ready' &&
    document.querySelector('[data-testid="current-file"]')?.getAttribute('title')?.includes('outline.md'));

  const outline = page.getByTestId('outline');
  const items = outline.getByRole('button');
  const texts = async () => (await items.allInnerTexts()).map(text => text.trim());
  const editor = page.locator('[data-document-tab][data-active=true]').getByTestId('document-editor');
  const current = () => outline.locator('[aria-current="location"]').innerText();
  const currentIs = async (text, step) => {
    try {
      await page.waitForFunction(text => document.querySelector('[data-testid="outline"] [aria-current="location"]')?.textContent === text, text, {timeout: 5000});
    } catch {
      const state = await page.evaluate(() => ({ current: document.querySelector('[data-testid="outline"] [aria-current]')?.textContent, scrollY: document.querySelector('.document-scroll[data-active="true"]').scrollTop, active: document.activeElement?.textContent?.slice(0, 40) }));
      throw new Error(`${step}: expected ${text} current, got ${JSON.stringify(state)}`);
    }
  };
  const expected = ['Outline guide', 'Section 1', 'Section 2', 'Detail 2', 'Section 3', 'Section 4', 'Detail 4', 'Section 5', 'Section 6', 'Detail 6'];
  await page.waitForFunction(count => document.querySelectorAll('[data-testid="outline"] button').length === count, expected.length);
  const listsHeadings = JSON.stringify(await texts()) === JSON.stringify(expected);
  // The outline is document navigation on the right; the sidebar browses files independently.
  const inDocumentPanel = await page.getByTestId('document-panel').getByTestId('outline').count() === 1 &&
    await page.getByTestId('sidebar').getByTestId('outline').count() === 0;
  const indentsByLevel = await items.nth(3).evaluate(element => getComputedStyle(element).paddingLeft) !==
    await items.nth(2).evaluate(element => getComputedStyle(element).paddingLeft);

  // The caret lands in the heading, which scrolls to the top of the view below the sticky header.
  const landed = async text => page.locator('[data-document-tab][data-active=true] .document-editor').evaluate((element, text) => {
    const editor = element.editor;
    const { $from } = editor.state.selection;
    const heading = [...element.querySelectorAll('h1, h2, h3, h4, h5, h6')].find(node => node.textContent === text);
    const top = heading?.getBoundingClientRect().top ?? -1;
    const header = document.querySelector('.app-header').getBoundingClientRect().bottom;
    return editor.view.hasFocus() && $from.parent.type.name === 'heading' && $from.parent.textContent === text &&
      $from.parentOffset === 0 && top >= header && top < header + 120;
  }, text);
  await items.filter({hasText:'Section 5'}).click();
  await currentIs('Section 5', 'after Section 5');
  const clickNavigates = await landed('Section 5');

  // Keyboard: focus the first item, move down twice, press Enter.
  await items.first().focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  const arrowsMoveFocus = await page.evaluate(() => document.activeElement?.textContent) === 'Section 2';
  await page.keyboard.press('Enter');
  await currentIs('Section 2', 'after Section 2');
  const keyboardNavigates = await landed('Section 2');

  // Scrolling to the end makes the last section current. It re-renders the outline only: re-rendering
  // the editor re-applies its options (a new editor.options object), which can race native caret moves.
  await page.locator('[data-document-tab][data-active=true] .document-editor').evaluate(element => { window.outlineEditorOptions = element.editor.options; });
  // The fixture's ten headings fit the panel. Limit the list so the current mark has to move inside it.
  const limit = await page.addStyleTag({ content: '.document-outline-list { max-height: 80px; }' });
  await page.evaluate(() => document.querySelector('.document-scroll[data-active="true"]').scrollTo(0, document.querySelector('.document-scroll[data-active="true"]').scrollHeight));
  await currentIs('Detail 6', 'after Detail 6');
  const scrollFollowsSection = await current() === 'Detail 6';
  const scrollKeepsEditor = await page.locator('[data-document-tab][data-active=true] .document-editor').evaluate(element => element.editor.options === window.outlineEditorOptions);
  const currentStaysInView = await page.evaluate(() => {
    const list = document.querySelector('.document-outline-list');
    const item = document.querySelector('[data-testid="outline"] [aria-current="location"]');
    if (!(list instanceof HTMLElement) || !(item instanceof HTMLElement)) return false;
    const listBox = list.getBoundingClientRect();
    const itemBox = item.getBoundingClientRect();
    return item.textContent?.trim() === 'Detail 6' && list.scrollTop > 0
      && itemBox.top >= listBox.top - 1 && itemBox.bottom <= listBox.bottom + 1
      && document.querySelector('.document-scroll[data-active="true"]').scrollTop + window.innerHeight >= document.querySelector('.document-scroll[data-active="true"]').scrollHeight - 2;
  });
  const flushFrames = () => page.evaluate(() => new Promise(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve(undefined)));
  }));
  const outlineView = () => page.evaluate(() => {
    const list = document.querySelector('.document-outline-list');
    const item = document.querySelector('[data-testid="outline"] [aria-current="location"]');
    const editor = document.querySelector('[data-document-tab][data-active=true] .document-editor')?.editor;
    if (!(list instanceof HTMLElement) || !(item instanceof HTMLElement) || !editor) return null;
    const listBox = list.getBoundingClientRect();
    const itemBox = item.getBoundingClientRect();
    const { from, to } = editor.state.selection;
    return {
      scrollTop: list.scrollTop, clientHeight: list.clientHeight, scrollY: document.querySelector('.document-scroll[data-active="true"]').scrollTop, from, to,
      text: item.textContent?.trim() ?? '',
      visible: itemBox.height > 0 && itemBox.top >= listBox.top - 1 && itemBox.bottom <= listBox.bottom + 1,
      // Content below the viewport. The last heading has none, so a taller list clamps scrollTop.
      room: list.scrollHeight - list.clientHeight - list.scrollTop,
      options: editor.options === window.outlineEditorOptions,
    };
  });
  // A middle heading stays fully visible with outline content below it, so growing the list must not move it.
  await page.evaluate(() => {
    const heading = [...document.querySelectorAll('[data-document-tab][data-active=true] .document-editor :is(h1, h2, h3)')]
      .find(node => node.textContent === 'Section 4');
    const header = document.querySelector('.app-header')?.getBoundingClientRect().bottom ?? 0;
    if (!(heading instanceof HTMLElement)) return;
    document.querySelector('.document-scroll[data-active="true"]').scrollTo(0, heading.getBoundingClientRect().top + document.querySelector('.document-scroll[data-active="true"]').scrollTop - header - 8);
  });
  await page.waitForFunction(() => {
    const list = document.querySelector('.document-outline-list');
    const item = document.querySelector('[data-testid="outline"] [aria-current="location"]');
    if (!(list instanceof HTMLElement) || !(item instanceof HTMLElement)) return false;
    if (item.textContent?.trim() !== 'Section 4') return false;
    const listBox = list.getBoundingClientRect();
    const itemBox = item.getBoundingClientRect();
    return list.scrollTop > 0 && itemBox.top >= listBox.top - 1 && itemBox.bottom <= listBox.bottom + 1
      && list.scrollHeight - list.clientHeight - list.scrollTop >= 40;
  }, undefined, {timeout: 5000});
  const beforeTracking = await outlineView();
  const grown = await page.evaluate(() => {
    const list = document.querySelector('.document-outline-list');
    const before = list.scrollTop;
    const height = list.clientHeight;
    list.style.maxHeight = `${height + 24}px`;
    return { before, height };
  });
  await flushFrames();
  const grownView = await outlineView();
  const visibleSectionStaysPut = Boolean(beforeTracking && grownView && grownView.visible && grownView.text === 'Section 4'
    && beforeTracking.room >= 40 && grownView.clientHeight >= grown.height + 16
    && Math.abs(grownView.scrollTop - grown.before) < 1
    && Math.abs(grownView.scrollY - beforeTracking.scrollY) < 1 && grownView.from === beforeTracking.from && grownView.to === beforeTracking.to
    && grownView.options);
  const clipped = await page.evaluate(() => {
    const list = document.querySelector('.document-outline-list');
    list.style.maxHeight = '72px';
    list.scrollTop = 0;
    const item = document.querySelector('[data-testid="outline"] [aria-current="location"]');
    const listBox = list.getBoundingClientRect();
    const itemBox = item.getBoundingClientRect();
    return itemBox.bottom > listBox.bottom + 1 || itemBox.top < listBox.top - 1;
  });
  await page.waitForFunction(() => {
    const list = document.querySelector('.document-outline-list');
    const item = document.querySelector('[data-testid="outline"] [aria-current="location"]');
    if (!(list instanceof HTMLElement) || !(item instanceof HTMLElement)) return false;
    const listBox = list.getBoundingClientRect();
    const itemBox = item.getBoundingClientRect();
    return item.textContent?.trim() === 'Section 4' && list.scrollTop > 0
      && itemBox.top >= listBox.top - 1 && itemBox.bottom <= listBox.bottom + 1;
  });
  const restored = await outlineView();
  const resizeRestoresCurrent = Boolean(clipped && restored?.visible && restored.text === 'Section 4' && restored.scrollTop > 0
    && beforeTracking && Math.abs(restored.scrollY - beforeTracking.scrollY) < 1
    && restored.from === beforeTracking.from && restored.to === beforeTracking.to && restored.options);
  await page.evaluate(() => document.querySelector('[data-testid="outline"] button')?.focus());
  await page.keyboard.press('ArrowDown');
  await flushFrames();
  const arrowsDoNotSnapToCurrent = await page.evaluate(() => {
    const list = document.querySelector('.document-outline-list');
    const current = document.querySelector('[data-testid="outline"] [aria-current="location"]');
    const active = document.activeElement;
    if (!(list instanceof HTMLElement) || !(current instanceof HTMLElement) || !(active instanceof HTMLElement)) return false;
    const listBox = list.getBoundingClientRect();
    const shown = (node) => {
      const box = node.getBoundingClientRect();
      return box.top >= listBox.top - 1 && box.bottom <= listBox.bottom + 1;
    };
    return active.textContent?.trim() === 'Section 1' && current.textContent?.trim() === 'Section 4' && shown(active) && !shown(current);
  });
  await page.evaluate(() => document.querySelector('[aria-label="Outline"]')?.focus());
  await page.waitForFunction(() => {
    const list = document.querySelector('.document-outline-list');
    const item = document.querySelector('[data-testid="outline"] [aria-current="location"]');
    if (!(list instanceof HTMLElement) || !(item instanceof HTMLElement)) return false;
    const listBox = list.getBoundingClientRect();
    const itemBox = item.getBoundingClientRect();
    return item.textContent?.trim() === 'Section 4'
      && itemBox.top >= listBox.top - 1 && itemBox.bottom <= listBox.bottom + 1;
  });
  const exited = await outlineView();
  const focusExitRestoresCurrent = Boolean(exited?.visible && exited.text === 'Section 4'
    && await page.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Outline'));
  const trackingPreservesDocument = Boolean(beforeTracking && exited
    && Math.abs(exited.scrollY - beforeTracking.scrollY) < 1
    && exited.from === beforeTracking.from && exited.to === beforeTracking.to && exited.options);
  await page.evaluate(() => {
    const list = document.querySelector('.document-outline-list');
    if (list instanceof HTMLElement) list.style.maxHeight = '';
  });
  await limit.evaluate(node => node.remove());

  // Renaming, adding and deleting headings update the outline at once.
  await page.locator('[data-document-tab][data-active=true] .document-editor').evaluate(element => {
    const editor = element.editor;
    let position;
    editor.state.doc.descendants((node, pos) => { if (position === undefined && node.textContent === 'Section 3') position = pos + 1 + node.content.size; });
    editor.commands.setTextSelection(position);
    editor.view.focus();
  });
  await page.keyboard.type(' renamed');
  await page.keyboard.press('Enter');
  await page.keyboard.type('## Added section');
  await outline.getByRole('button', {name:'Added section'}).waitFor();
  const section6 = editor.locator('h2').filter({hasText:'Section 6'});
  await section6.hover();
  const blockIndex = await page.locator('[data-document-tab][data-active=true] .document-editor').evaluate(element => {
    let found = -1;
    element.editor.state.doc.forEach((node, _pos, index) => { if (found < 0 && node.textContent === 'Section 6') found = index; });
    return found + 1;
  });
  await page.getByRole('button', {name:`Move heading block ${blockIndex}`}).click();
  await page.getByRole('menuitem', {name:'Delete', exact:true}).click();
  await page.waitForFunction(() => ![...document.querySelectorAll('[data-testid="outline"] button')].some(button => button.textContent === 'Section 6'));
  const editsUpdate = JSON.stringify(await texts()) === JSON.stringify([
    'Outline guide', 'Section 1', 'Section 2', 'Detail 2', 'Section 3 renamed', 'Added section', 'Section 4', 'Detail 4', 'Section 5', 'Detail 6',
  ]);

  // From Source, an outline item returns to the Visual view at that heading.
  await page.getByTestId('view-source').click();
  await page.locator('[data-document-tab][data-active=true]').getByTestId('source-view').waitFor();
  await items.filter({hasText:'Detail 4'}).click();
  await page.locator('[data-document-tab][data-active=true]').getByTestId('source-view').waitFor({state:'detached'});
  await currentIs('Detail 4', 'after Detail 4');
  const sourceReturnsToVisual = await landed('Detail 4');

  // A heading's block menu moves its whole section past the next sibling and deletes a section,
  // as Core moveSection/removeSection do; the outline follows, and Save writes the result.
  const headingAction = async (text, item) => {
    const index = await page.locator('[data-document-tab][data-active=true] .document-editor').evaluate((element, text) => {
      let found = -1;
      element.editor.state.doc.forEach((node, _pos, at) => { if (found < 0 && node.textContent === text) found = at; });
      return found + 1;
    }, text);
    await editor.locator('h1, h2, h3').filter({hasText:new RegExp(`^${text}$`)}).hover();
    await page.getByRole("button", {name:`Move heading block ${index}`, exact:true}).click();
    await page.getByRole('menuitem', {name:item, exact:true}).click();
  };
  const afterEdits = ['Outline guide', 'Section 1', 'Section 2', 'Detail 2', 'Section 3 renamed', 'Added section', 'Section 4', 'Detail 4', 'Section 5', 'Detail 6'];
  const outlineIs = list => page.waitForFunction(list => JSON.stringify([...document.querySelectorAll('[data-testid="outline"] button')].map(button => button.textContent.trim())) === JSON.stringify(list), list, {timeout: 5000}).then(() => true, () => false);
  const sectionMoved = ['Outline guide', 'Section 2', 'Detail 2', 'Section 1', 'Section 3 renamed', 'Added section', 'Section 4', 'Detail 4', 'Section 5', 'Detail 6'];
  await headingAction('Section 1', 'Move section down');
  const sectionMoves = await outlineIs(sectionMoved);
  await page.keyboard.press('Control+z');
  const sectionUndo = await outlineIs(afterEdits);
  await page.keyboard.press('Control+Shift+z');
  const sectionRedo = await outlineIs(sectionMoved);
  await headingAction('Section 4', 'Delete section');
  const sectionDeleted = await outlineIs(sectionMoved.filter(text => !['Section 4', 'Detail 4'].includes(text)));
  await page.getByRole('button', {name:'Save', exact:true}).click();
  await page.locator('[data-testid="status"]:is([data-operation="saved"], [data-operation="save-failed"])').waitFor();
  const disk = await (await page.request.get(`${origin}/api/document?path=${encodeURIComponent(file)}`)).json();
  const sectionSaved = await page.getByTestId('status').getAttribute('data-operation') === 'saved' &&
    JSON.stringify(disk.document.blocks.filter(block => block.block === 'heading').map(block => block.text)) === JSON.stringify(sectionMoved.filter(text => !['Section 4', 'Detail 4'].includes(text)));

  const result = { listsHeadings, inDocumentPanel, indentsByLevel, clickNavigates, arrowsMoveFocus, keyboardNavigates, scrollFollowsSection, scrollKeepsEditor, currentStaysInView, visibleSectionStaysPut, resizeRestoresCurrent, arrowsDoNotSnapToCurrent, focusExitRestoresCurrent, trackingPreservesDocument, editsUpdate, sourceReturnsToVisual,
    sectionMoves, sectionUndo, sectionRedo, sectionDeleted, sectionSaved };
  // Numbering is a document setting and uses the same counters in the page and outline.
  await page.getByRole('button', {name:'Document settings', exact:true}).click();
  const toggle = page.getByRole('checkbox', {name:'Number headings', exact:true});
  await toggle.click();
  await page.waitForFunction(() => document.querySelector('[data-document-tab][data-active=true] .document-editor h2')?.getAttribute('data-heading-number') === '1' &&
    document.querySelectorAll('[data-testid="outline"] button')[1]?.textContent.startsWith('1 '));
  await page.keyboard.press('Escape');
  await page.getByRole('region', {name:'Document settings',exact:true}).locator('.display-settings').waitFor({state:'hidden'});
  result.headingNumbersApplied = await editor.locator('h1').getAttribute('data-heading-number') === null &&
    (await texts())[1].startsWith('1 ');
  await items.nth(1).click();
  await page.waitForFunction(() => document.querySelector('.document-outline-item[aria-current="location"]')?.textContent.startsWith('1 '));
  // Generated numbers share a document color; current navigation retains its selected color.
  const numberColors = () => page.evaluate(() => {
    const root = document.documentElement;
    const resolve = name => {
      const probe = document.createElement('span');
      probe.style.color = `var(${name})`;
      root.append(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    };
    const headings = [...document.querySelectorAll('[data-document-tab][data-active=true] [data-heading-number]')];
    const rows = [...document.querySelectorAll('.document-outline-item')];
    const numbered = rows.filter(row => row.querySelector('.document-outline-number'));
    return {
      variable: getComputedStyle(root).getPropertyValue('--id-color-document-heading-number').trim(),
      number: resolve('--id-color-document-heading-number'),
      text: resolve('--id-color-text'), outlineText: resolve('--id-color-text-muted'), selected: resolve('--id-color-text-selected'),
      headings: headings.map(heading => ({ number: getComputedStyle(heading, '::before').color, text: getComputedStyle(heading).color })),
      selectedSurface: resolve('--id-color-surface-selected'),
      outline: numbered.map(row => ({ current: row.hasAttribute('aria-current'), number: getComputedStyle(row.querySelector('.document-outline-number')).color, text: getComputedStyle(row).color,
        background:getComputedStyle(row).backgroundColor,marker:getComputedStyle(row,'::before').content,weight:Number(getComputedStyle(row).fontWeight) })),
    };
  });
  const checkNumberColors = colors => {
    expect(colors.variable).not.toBe('');
    expect(colors.headings.length).toBeGreaterThan(0);
    for (const heading of colors.headings) expect(heading).toEqual({ number: colors.number, text: colors.text });
    expect(colors.outline.some(row => row.current)).toBe(true);
    expect(colors.outline.some(row => !row.current)).toBe(true);
    expect(colors.outline).toHaveLength(colors.headings.length);
    for (const row of colors.outline) {
      expect(row.number).toBe(row.current ? colors.selected : colors.number);
      expect(row.text).toBe(row.current ? colors.selected : colors.outlineText);
      expect(row.weight).toBe(row.current ? 600 : 400);
      if(row.current) { expect(row.background).toBe(colors.selectedSurface); expect(row.marker).toBe('none'); }
    }
  };
  await page.mouse.move(0,0);
  const defaultColors = await numberColors();
  checkNumberColors(defaultColors);
  // Every preset reaches generated numbers without changing numbering or current-row semantics.
  for (const preset of ['violet', 'plum', 'teal', 'green', 'graphite']) {
    await page.evaluate(preset => { document.documentElement.dataset.accent = preset; }, preset);
    const colors = await numberColors();
    checkNumberColors(colors);
    expect(colors.number).not.toBe(defaultColors.number);
  }
  await page.evaluate(() => { document.documentElement.dataset.accent = 'blue'; });
  // A root override must reach both surfaces, while title text and selected rows stay unchanged.
  await page.evaluate(() => document.documentElement.style.setProperty('--id-color-document-heading-number', 'rebeccapurple'));
  try {
    const overridden = await numberColors();
    expect(overridden.number).not.toBe(defaultColors.number);
    checkNumberColors(overridden);
  } finally {
    await page.evaluate(() => document.documentElement.style.removeProperty('--id-color-document-heading-number'));
  }
  await expect(items.nth(1)).toHaveAccessibleName((await texts())[1]);
  await expect(outline).toHaveAccessibleName('Outline');
  result.headingNumberColors = true;
  await page.keyboard.press('Control+z');
  result.headingNumberingUndo = await editor.locator('h2').first().getAttribute('data-heading-number') === null;
  await page.keyboard.press('Control+Shift+z');
  result.headingNumberingRedo = await editor.locator('h2').first().getAttribute('data-heading-number') === '1';
  const acknowledgement = page.waitForResponse(response => response.request().method() === 'POST' && /\/api\/document(?:\?|$)/.test(response.url()));
  await page.getByRole('button', {name:'Save', exact:true}).click();
  await acknowledgement;
  await page.locator('[data-testid="status"][data-operation="saved"]').waitFor();
  const numbered = await (await page.request.get(`${origin}/api/document?path=${encodeURIComponent(file)}`)).json();
  result.headingNumberingSaved = numbered.source.includes('headings: true') && !numbered.source.includes('## 1');
  await reloadDocument(page);
  await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
  await page.getByRole('button', {name:'Document settings', exact:true}).click();
  result.headingNumberingReloaded = await toggle.isChecked() &&
    await editor.locator('h2').first().getAttribute('data-heading-number') === '1';
  await toggle.click();
  result.headingNumberingDisabled = await editor.locator('h2').first().getAttribute('data-heading-number') === null;
  await page.keyboard.press('Escape');
  await page.getByRole('region', {name:'Document settings',exact:true}).locator('.display-settings').waitFor({state:'hidden'});
  const offAck = page.waitForResponse(response => response.request().method() === 'POST' && /\/api\/document(?:\?|$)/.test(response.url()));
  await page.getByRole('button', {name:'Save', exact:true}).click();
  await offAck;
  result.headingNumberingOffSaved = (await (await page.request.get(`${origin}/api/document?path=${encodeURIComponent(file)}`)).json()).source.includes('headings: false');

  const failed = Object.entries(result).filter(([, value]) => value !== true);
  if (failed.length > 0) throw new Error(`Outline failed: ${JSON.stringify({result, texts: await texts()})}`);
  return result;
}
