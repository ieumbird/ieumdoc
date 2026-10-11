// Run with pnpm exec playwright-cli run-code --filename=apps/editor/test/editor-shell.browser.js.
// Exercises the shell and block interactions. Every POST is mocked; no file is written.
async page => {
  await page.unroute('**/api/document');
  await page.reload();
  await page.locator('[data-testid="status"][data-operation="Ready"]').waitFor({state:'attached'});
  const requests = [];
  let conflictNext = false;
  await page.route('**/api/document', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    requests.push(route.request().postDataJSON());
    if (conflictNext) {
      conflictNext = false;
      return route.fulfill({status:409,json:{error:'External change'}});
    }
    return route.fulfill({status:400,json:{error:'Mocked save rejected'}});
  });
  const article = page.getByRole('article');
  const result = {};
  try {
    // Shell: application UI stays outside the document.
    result.noLegacyUi = await page.locator('.file-picker, .format-bar, [data-testid="equation-draft-notice"]').count() === 0;
    result.appUiOutsideDocument = await article.locator('[data-testid="file-path"], [data-testid="status"], [data-testid="message-area"]').count() === 0;
    await page.getByRole('button',{name:'Collapse sidebar'}).click();
    result.sidebarCollapses = await page.getByRole('button',{name:'Open file…'}).count() === 0;
    await page.getByRole('button',{name:'Expand sidebar'}).click();
    result.currentPath = (await page.getByTestId('current-file').getAttribute('title')).endsWith('technical-document.md');

    // Open file… and Open folder… dialogs closed by Escape or Cancel return focus to their button.
    const isFocused = locator => locator.evaluate(node => node === document.activeElement);
    const dialog = page.getByRole('dialog');
    const openFolder = page.getByRole('button',{name:'Open folder…', exact:true});
    const openFile = page.getByRole('button',{name:'Open file…', exact:true});
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await page.getByTestId('file-path').waitFor();
    await page.keyboard.press('Escape');
    await dialog.waitFor({state:'detached'});
    result.openEscapeReturnsFocus = await isFocused(openFile);
    await page.keyboard.press('Enter');
    await page.getByTestId('file-path').waitFor();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await dialog.waitFor({state:'detached'});
    result.openCancelReturnsFocus = await isFocused(openFile);
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Enter');
    await page.getByTestId('folder-path').waitFor();
    await page.keyboard.press('Escape');
    await dialog.waitFor({state:'detached'});
    result.folderEscapeReturnsFocus = await isFocused(openFolder);

    // Selection toolbar appears only for a paragraph text selection.
    const paragraph = page.getByText('The current reference is calculated from the active power command.', {exact:true});
    await paragraph.click();
    result.toolbarHiddenWithoutSelection = await page.getByTestId('selection-toolbar').count() === 0;
    await paragraph.dblclick();
    await page.getByTestId('selection-toolbar').waitFor();
    await page.getByTestId('selection-toolbar').getByRole('button',{name:'Bold'}).click();
    result.boldApplied = await page.locator('[data-source-path="8"] strong').count() === 1;
    await page.keyboard.press('Control+z');

    // Keyboard: Tab from a text selection enters the toolbar. Moving through it, Shift+Tab and Escape
    // keep the selection, history and status; a toolbar key applies to the selection as one step.
    const toolbarButton = name => page.getByTestId('selection-toolbar').getByRole('button',{name, exact:true});
    const editorState = () => page.evaluate(() => {
      const {editor} = document.querySelector('.document-editor');
      const {from, to} = editor.state.selection;
      return JSON.stringify({from, to, undo: editor.can().undo(), redo: editor.can().redo(),
        status: document.querySelector('[data-testid="status"]').textContent, bold: document.querySelectorAll('[data-source-path="8"] strong').length});
    });
    const backInEditor = async () => {
      await page.waitForFunction(() => document.querySelector('.document-editor').editor.view.hasFocus());
      return editorState();
    };
    await paragraph.click();
    await page.keyboard.press('Home');
    await page.keyboard.press('Shift+End');
    await page.waitForFunction(() => document.querySelector('.document-editor').editor.state.selection.to -
      document.querySelector('.document-editor').editor.state.selection.from === 'The current reference is calculated from the active power command.'.length);
    await page.getByTestId('selection-toolbar').waitFor();
    const keyboardSelection = await editorState();
    await page.keyboard.press('Tab');
    result.toolbarTabEnters = await isFocused(toolbarButton('Bold')) && await editorState() === keyboardSelection;
    await page.keyboard.press('Tab');
    result.toolbarTabMoves = await isFocused(toolbarButton('Italic')) && await page.getByTestId('selection-toolbar').isVisible();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Shift+Tab');
    result.toolbarShiftTabReturns = await backInEditor() === keyboardSelection;
    await page.keyboard.press('Tab');
    await page.keyboard.press('Escape');
    result.toolbarEscapeReturns = await backInEditor() === keyboardSelection;
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    const bolded = JSON.parse(await backInEditor());
    await page.keyboard.press('Control+z');
    result.toolbarKeyAppliesOnce = bolded.bold === 1 && bolded.undo && await editorState() === keyboardSelection.replace('"redo":false', '"redo":true');

    // Drafts stay visible and explicitly separate from applied Save content.
    await page.getByRole('button',{name:'Edit',exact:true}).locator('..').hover({position:{x:4,y:4}});
    await page.getByRole('button',{name:'Edit',exact:true}).click();
    await page.getByTestId('equation-latex').fill('x + 1');
    result.equationDraftInBlock = await page.getByTestId('equation-draft-status').isVisible();
    result.saveAvailableDuringDraft = await page.getByTestId('save').isEnabled();
    result.draftScopeExplained = await page.getByTestId('draft-notice').isVisible();
    await page.getByTestId('equation-cancel').click();
    await page.locator('.top-bar [data-testid="save"]:not([aria-disabled="true"])').waitFor();
    result.saveEnabledAfterCancel = await page.getByTestId('equation-draft-status').count() === 0;

    // Selection ends at selection; only explicit Edit opens properties.
    await page.locator('[data-block="figure"] img').click();
    result.figureSelectionOnly = await page.getByTestId('figure-properties').count() === 0 &&
      await page.locator('[data-block="figure"]').getAttribute('data-selected') === 'true';
    await page.getByRole('button', {name:'Edit figure'}).click();
    result.figurePopover = await page.getByTestId('figure-editor').isVisible();
    await page.getByTestId('figure-cancel').click();

    // `+` inserts through the shared insert menu.
    await paragraph.hover();
    await page.getByRole('button',{name:'Insert block after paragraph block 9'}).click();
    const insertMenu = page.getByRole('menu',{name:'Insert block'});
    result.plusMenuItems = await insertMenu.getByRole('menuitem').allInnerTexts();
    await insertMenu.getByRole('menuitem',{name:'Paragraph'}).click();
    await page.keyboard.type('PLUS_INSERTED');

    // `/` opens the same menu; Escape dismisses it, Enter runs the command.
    await page.keyboard.type(' /');
    await insertMenu.waitFor();
    result.slashMenuItems = await insertMenu.getByRole('menuitem').allInnerTexts();
    await page.keyboard.press('Escape');
    result.slashEscape = await insertMenu.count() === 0;
    await page.keyboard.press('Backspace');
    await page.keyboard.type('/para');
    await page.keyboard.press('Enter');
    await page.keyboard.type('SLASH_INSERTED');
    const text = await article.innerText();
    result.slashQueryRemoved = text.includes('PLUS_INSERTED') && !text.includes('/para') && text.includes('SLASH_INSERTED');

    // Handle click opens the block menu; Delete removes the table block
    // without resetting another block's in-progress Equation draft.
    await page.getByRole('button',{name:'Edit',exact:true}).locator('..').hover({position:{x:4,y:4}});
    await page.getByRole('button',{name:'Edit',exact:true}).click();
    await page.getByTestId('equation-latex').fill('x + 2');
    await page.locator('[data-block="table"]').hover();
    await page.getByRole('button',{name:'Move table block 15'}).click();
    const blockMenu = page.getByRole('menu',{name:'Block actions'});
    result.blockMenuItems = await blockMenu.getByRole('menuitem').allInnerTexts();
    await blockMenu.getByRole('menuitem',{name:'Delete', exact:true}).click();
    result.tableDeleted = await page.locator('[data-block="table"]').count() === 0;
    result.draftSurvivesDelete = await page.getByTestId('equation-latex').inputValue() === 'x + 2';
    await page.getByTestId('equation-cancel').click();

    // Keyboard deletion uses engine history. Unsupported copying still produces an expiring notice.
    await page.locator('[data-block="figure"] img').click();
    await page.keyboard.press('Delete');
    result.figureDeletedByKeyboard = await page.locator('[data-block="figure"]').count() === 0;
    await page.keyboard.press('Control+z');
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Control+c');
    await page.getByTestId('notice').waitFor();
    result.noticeInMessageArea = await page.locator('[data-testid="message-area"] [data-testid="notice"]').count() === 1;
    result.figureKept = await page.locator('[data-block="figure"]').count() === 1;
    await page.getByTestId('notice').waitFor({state:'detached', timeout:8000});
    result.noticeExpired = true;

    // Save sends Core insert/delete edits; errors persist until dismissed.
    await page.getByRole('button',{name:'Save',exact:true}).click();
    await page.getByTestId('error').waitFor();
    const request = requests.at(-1);
    result.saveRequest = {
      inserts: request.inserts?.map(insert => insert.block === 'paragraph'
        ? insert.content.map(item => item.text).join('')
        : insert.text),
      deletes: request.deletes,
      orderLength: request.order?.length,
    };
    await page.waitForTimeout(6000);
    result.errorPersists = await page.getByTestId('error').isVisible();
    await page.getByRole('button',{name:'Dismiss error'}).click();
    result.errorDismissed = await page.getByTestId('error').count() === 0;
    conflictNext = true;
    await page.getByRole('button',{name:'Save',exact:true}).click();
    await page.getByText('Save conflict',{exact:true}).waitFor();
    result.conflictKeepsEdits = (await article.innerText()).includes('SLASH_INSERTED');
    result.editorCount = await page.locator('[data-testid="document-editor"] [contenteditable="true"]').count();
    for (const [name, passed] of Object.entries(result)) {
      if (passed === false) throw new Error(`Shell regression: ${name}`);
    }
    if (result.editorCount !== 1) throw new Error('Shell must retain one document editor');
    return result;
  } finally {
    await page.unroute('**/api/document');
  }
}
