// Run with pnpm browser:test outline.
// Navigates a long scratch document from the sidebar outline with the mouse and the keyboard,
// follows the current section while scrolling, and checks that heading edits update the outline
// immediately. The outline itself is navigation only; heading block menu section moves and
// deletion are then saved to the scratch file.
async page => {
  await page.unrouteAll();
  await page.reload();
  await page.waitForFunction(() => document.querySelector('[data-testid="status"]')?.getAttribute('data-operation') === 'Ready');

  const origin = page.url().split('/').slice(0, 3).join('/');
  const defaultPath = (await (await page.request.get(`${origin}/api/document`)).json()).path;
  const separator = defaultPath.includes('\\') ? '\\' : '/';
  const root = defaultPath.split(separator).slice(0, -4).join(separator);
  const file = [root, 'tmp', 'outline', 'outline.md'].join(separator);

  await page.getByRole('button', {name:'Open…'}).click();
  await page.getByTestId('file-path').fill(file);
  await page.getByRole('dialog').getByRole('button', {name:'Open', exact:true}).click();
  await page.waitForFunction(() =>
    document.querySelector('[data-testid="status"]')?.getAttribute('data-operation') === 'Ready' &&
    document.querySelector('[data-testid="current-file"]')?.getAttribute('title')?.includes('outline.md'));

  const outline = page.getByTestId('outline');
  const items = outline.getByRole('button');
  const texts = async () => (await items.allInnerTexts()).map(text => text.trim());
  const editor = page.getByTestId('document-editor');
  const current = () => outline.locator('[aria-current="location"]').innerText();
  const currentIs = async (text, step) => {
    try {
      await page.waitForFunction(text => document.querySelector('[data-testid="outline"] [aria-current="location"]')?.textContent === text, text, {timeout: 5000});
    } catch {
      const state = await page.evaluate(() => ({ current: document.querySelector('[data-testid="outline"] [aria-current]')?.textContent, scrollY: window.scrollY, active: document.activeElement?.textContent?.slice(0, 40) }));
      throw new Error(`${step}: expected ${text} current, got ${JSON.stringify(state)}`);
    }
  };
  const expected = ['Outline guide', 'Section 1', 'Section 2', 'Detail 2', 'Section 3', 'Section 4', 'Detail 4', 'Section 5', 'Section 6', 'Detail 6'];
  await page.waitForFunction(count => document.querySelectorAll('[data-testid="outline"] button').length === count, expected.length);
  const listsHeadings = JSON.stringify(await texts()) === JSON.stringify(expected);
  const indentsByLevel = await items.nth(3).evaluate(element => getComputedStyle(element).paddingLeft) !==
    await items.nth(2).evaluate(element => getComputedStyle(element).paddingLeft);

  // The caret lands in the heading, which scrolls to the top of the view below the sticky header.
  const landed = async text => page.locator('.document-editor').evaluate((element, text) => {
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
  await page.locator('.document-editor').evaluate(element => { window.outlineEditorOptions = element.editor.options; });
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await currentIs('Detail 6', 'after Detail 6');
  const scrollFollowsSection = await current() === 'Detail 6';
  const scrollKeepsEditor = await page.locator('.document-editor').evaluate(element => element.editor.options === window.outlineEditorOptions);

  // Renaming, adding and deleting headings update the outline at once.
  await page.locator('.document-editor').evaluate(element => {
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
  const blockIndex = await page.locator('.document-editor').evaluate(element => {
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
  await page.getByTestId('source-view').waitFor();
  await items.filter({hasText:'Detail 4'}).click();
  await page.getByTestId('source-view').waitFor({state:'detached'});
  await currentIs('Detail 4', 'after Detail 4');
  const sourceReturnsToVisual = await landed('Detail 4');

  // A heading's block menu moves its whole section past the next sibling and deletes a section,
  // as Core moveSection/removeSection do; the outline follows, and Save writes the result.
  const headingAction = async (text, item) => {
    const index = await page.locator('.document-editor').evaluate((element, text) => {
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
  await page.locator('[data-testid="status"]:is([data-operation="Saved"], [data-operation="Save failed"])').waitFor();
  const disk = await (await page.request.get(`${origin}/api/document?path=${encodeURIComponent(file)}`)).json();
  const sectionSaved = await page.getByTestId('status').getAttribute('data-operation') === 'Saved' &&
    JSON.stringify(disk.document.blocks.filter(block => block.block === 'heading').map(block => block.text)) === JSON.stringify(sectionMoved.filter(text => !['Section 4', 'Detail 4'].includes(text)));

  const result = { listsHeadings, indentsByLevel, clickNavigates, arrowsMoveFocus, keyboardNavigates, scrollFollowsSection, scrollKeepsEditor, editsUpdate, sourceReturnsToVisual,
    sectionMoves, sectionUndo, sectionRedo, sectionDeleted, sectionSaved };
  // Numbering is a document setting and uses the same counters in the page and outline.
  const toggle = page.getByRole('button', {name:'Number headings', exact:true});
  await toggle.click();
  await page.waitForFunction(() => document.querySelector('.document-editor h2')?.getAttribute('data-heading-number') === '1' &&
    document.querySelectorAll('[data-testid="outline"] button')[1]?.textContent.startsWith('1 '));
  result.headingNumbersApplied = await editor.locator('h1').getAttribute('data-heading-number') === null &&
    (await texts())[1].startsWith('1 ');
  await editor.locator('h2').first().click();
  await page.keyboard.press('Control+z');
  result.headingNumberingUndo = await editor.locator('h2').first().getAttribute('data-heading-number') === null;
  await page.keyboard.press('Control+Shift+z');
  result.headingNumberingRedo = await editor.locator('h2').first().getAttribute('data-heading-number') === '1';
  const acknowledgement = page.waitForResponse(response => response.request().method() === 'POST' && /\/api\/document(?:\?|$)/.test(response.url()));
  await page.getByRole('button', {name:'Save', exact:true}).click();
  await acknowledgement;
  await page.locator('[data-testid="status"][data-operation="Saved"]').waitFor();
  const numbered = await (await page.request.get(`${origin}/api/document?path=${encodeURIComponent(file)}`)).json();
  result.headingNumberingSaved = numbered.source.includes('headings: true') && !numbered.source.includes('## 1');
  await page.getByRole('button', {name:'Open…'}).click();
  await page.getByTestId('file-path').fill(file);
  await page.getByRole('dialog').getByRole('button', {name:'Open', exact:true}).click();
  await page.locator('[data-testid="status"][data-operation="Ready"]').waitFor({state:'attached'});
  result.headingNumberingReloaded = await toggle.getAttribute('aria-pressed') === 'true' &&
    await editor.locator('h2').first().getAttribute('data-heading-number') === '1';
  await toggle.click();
  result.headingNumberingDisabled = await editor.locator('h2').first().getAttribute('data-heading-number') === null;
  const offAck = page.waitForResponse(response => response.request().method() === 'POST' && /\/api\/document(?:\?|$)/.test(response.url()));
  await page.getByRole('button', {name:'Save', exact:true}).click();
  await offAck;
  result.headingNumberingOffSaved = (await (await page.request.get(`${origin}/api/document?path=${encodeURIComponent(file)}`)).json()).source.includes('headings: false');

  const failed = Object.entries(result).filter(([, value]) => value !== true);
  if (failed.length > 0) throw new Error(`Outline failed: ${JSON.stringify({result, texts: await texts()})}`);
  return result;
}
