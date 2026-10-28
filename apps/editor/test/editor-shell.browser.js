// Run with pnpm exec playwright-cli run-code --filename=apps/editor/test/editor-shell.browser.js.
// Exercises the shell and block interactions. Every POST is mocked; no file is written.
async page => {
  await page.unroute('**/api/document');
  await page.reload();
  await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
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
    result.appUiOutsideDocument = await article.locator('[data-testid="folder-path"], [data-testid="status"], [data-testid="message-area"]').count() === 0;
    await page.getByRole('button',{name:'Collapse sidebar'}).click();
    result.sidebarCollapses = await page.getByRole('button',{name:'Open folder…'}).count() === 0;
    await page.getByRole('button',{name:'Expand sidebar'}).click();
    result.currentPath = (await page.getByTestId('current-file').getAttribute('title')).endsWith('technical-document.md');

    // Folder entry is the only general Open action; Escape and Cancel return focus to it.
    const isFocused = locator => locator.evaluate(node => node === document.activeElement);
    const dialog = page.getByRole('dialog');
    const openFolder = page.getByRole('button',{name:'Open folder…', exact:true});
    result.folderOnlyEntry = await page.getByRole('button',{name:'Open file…', exact:true}).count() === 0;
    await openFolder.focus();
    await page.keyboard.press('Shift+Tab');
    result.headerTabToCollapse = await isFocused(page.getByRole('button', {name:'Collapse sidebar', exact:true}));
    await page.keyboard.press('Tab');
    result.headerReverseTab = await isFocused(openFolder);
    await openFolder.focus();
    await page.keyboard.press('Enter');
    await page.getByTestId('folder-path').waitFor();
    await page.keyboard.press('Escape');
    await dialog.waitFor({state:'detached'});
    result.folderEscapeReturnsFocus = await isFocused(openFolder);
    await page.keyboard.press('Enter');
    await page.getByTestId('folder-path').waitFor();
    await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
    await dialog.waitFor({state:'detached'});
    result.folderCancelReturnsFocus = await isFocused(openFolder);

    // Document settings stays outside ProseMirror and preserves the mounted editor.
    const settings = page.getByRole('button', {name:'Document settings', exact:true});
    const settingsDialog = page.getByRole('region', {name:'Document settings',exact:true}).locator('.display-settings');
    const editorHandle = await page.locator('[data-document-tab][data-active=true] .document-editor').evaluateHandle(n => n.editor);
    await settings.focus(); await page.keyboard.press('Enter');
    await settingsDialog.waitFor();
    result.documentSettingsTarget = await settingsDialog.locator('input[type=checkbox]').count() === 1;
    result.settingsOutsideContent = await page.locator('.ProseMirror .document-settings').count() === 0;
    result.noTopBarSettings = await page.locator('.top-bar').getByRole('button',{name:'Document settings',exact:true}).count() === 0;
    await page.keyboard.press('Tab');
    result.documentSettingsKeyboardEntry = await isFocused(page.getByRole('checkbox', {name:'Number headings', exact:true}));
    await page.keyboard.press('Escape'); await settingsDialog.waitFor({state:'hidden'});
    result.documentSettingsEscapeReturnsFocus = await isFocused(settings);
    await page.getByRole('button',{name:'Collapse sidebar'}).click();
    result.railOnlyReopensFiles = await page.getByTestId('sidebar').getByRole('button').count() === 1;
    await page.getByRole('button',{name:'Expand sidebar'}).click();
    result.settingsKeepsEditor = await page.locator('[data-document-tab][data-active=true] .document-editor').evaluate((n, original) => n.editor === original, editorHandle);
    await editorHandle.dispose();

    const fileActions = page.getByRole('button', {name:'File actions', exact:true});
    await fileActions.focus();
    await page.keyboard.press('Enter');
    await page.getByRole('menuitem', {name:'Reload', exact:true}).waitFor();
    await page.keyboard.press('Escape');
    // Base UI returns focus after the popup's asynchronous close/unmount completes.
    await page.getByRole('menu').waitFor({state:'detached', timeout:2000});
    await fileActions.and(page.locator(':focus')).waitFor({state:'attached', timeout:2000});
    result.fileMenuEscapeReturnsFocus = await isFocused(fileActions);
    // Without the Clipboard API (a non-HTTPS remote origin), Copy path explains instead of throwing.
    await page.evaluate(() => {
      window.__clipboard = Object.getOwnPropertyDescriptor(Navigator.prototype, 'clipboard');
      Object.defineProperty(Navigator.prototype, 'clipboard', {configurable: true, get: () => undefined});
    });
    try {
      await fileActions.click();
      await page.getByRole('menuitem', {name:'Copy path', exact:true}).click();
      await page.getByTestId('error').filter({hasText:'Copy path needs clipboard access'}).waitFor({timeout:2000});
      result.copyPathWithoutClipboard = true;
      await page.getByRole('button', {name:'Dismiss error'}).click();
    } finally {
      await page.evaluate(() => { Object.defineProperty(Navigator.prototype, 'clipboard', window.__clipboard); delete window.__clipboard; });
    }

    // Selection toolbar appears only for a paragraph text selection.
    const paragraph = page.getByText('The current reference is calculated from the active power command.', {exact:true}).filter({visible:true});
    await paragraph.click();
    result.toolbarHiddenWithoutSelection = await page.getByTestId('selection-toolbar').count() === 0;
    await paragraph.dblclick();
    await page.getByTestId('selection-toolbar').waitFor();
    await page.getByTestId('selection-toolbar').getByRole('button',{name:'Bold'}).click();
    result.boldApplied = await page.locator('[data-source-path="9"] strong').count() === 1;
    await page.keyboard.press('Control+z');

    // Keyboard: Tab from a text selection enters the toolbar. Moving through it, Shift+Tab and Escape
    // keep the selection, history and status; a toolbar key applies to the selection as one step.
    const toolbarButton = name => page.getByTestId('selection-toolbar').getByRole('button',{name, exact:true});
    const editorState = () => page.evaluate(() => {
      const {editor} = document.querySelector('[data-document-tab][data-active=true] .document-editor');
      const {from, to} = editor.state.selection;
      return JSON.stringify({from, to, undo: editor.can().undo(), redo: editor.can().redo(),
        status: document.querySelector('[data-testid="status"]').textContent, bold: document.querySelectorAll('[data-source-path="9"] strong').length});
    });
    const backInEditor = async () => {
      await page.waitForFunction(() => document.querySelector('[data-document-tab][data-active=true] .document-editor').editor.view.hasFocus());
      return editorState();
    };
    await paragraph.click();
    await page.keyboard.press('Home');
    await page.keyboard.press('Shift+End');
    await page.waitForFunction(() => document.querySelector('[data-document-tab][data-active=true] .document-editor').editor.state.selection.to -
      document.querySelector('[data-document-tab][data-active=true] .document-editor').editor.state.selection.from === 'The current reference is calculated from the active power command.'.length);
    await page.getByTestId('selection-toolbar').waitFor();
    const keyboardSelection = await editorState();
    await settings.click();
    await page.keyboard.press('Escape'); await settingsDialog.waitFor({state:'hidden'});
    result.settingsKeepsSelectionAndHistory = await editorState() === keyboardSelection;
    await page.locator('[data-document-tab][data-active=true] .document-editor').focus();
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
    result.equationDraftInBlock = await page.locator('[data-document-tab][data-active=true]').getByTestId('equation-draft-status').isVisible();
    result.saveAvailableDuringDraft = await page.getByTestId('save').isEnabled();
    result.draftScopeExplained = await page.getByTestId('draft-notice').isVisible();
    await settings.click();
    await page.keyboard.press('Escape'); await settingsDialog.waitFor({state:'hidden'});
    result.settingsKeepsEquationDraft = await page.getByTestId('equation-latex').inputValue() === 'x + 1' &&
      await page.getByTestId('draft-notice').isVisible();
    await fileActions.click();
    await page.getByRole('menuitem', {name:'Reload', exact:true}).click();
    await page.getByRole('dialog', {name:'Discard local changes?', exact:true}).waitFor();
    await page.getByRole('button', {name:'Keep editing', exact:true}).click();
    await page.getByRole('dialog', {name:'Discard local changes?', exact:true}).waitFor({state:'detached'});
    result.reloadCancelKeepsDraftAndFocus = await page.getByTestId('equation-latex').inputValue() === 'x + 1' && await isFocused(fileActions);
    await page.getByTestId('equation-cancel').click();
    await page.locator('.top-bar [data-testid="save"]:not([aria-disabled="true"])').waitFor();
    result.saveEnabledAfterCancel = await page.locator('[data-document-tab][data-active=true]').getByTestId('equation-draft-status').count() === 0;

    // Selection ends at selection; only explicit Edit opens properties.
    await page.locator('[data-document-tab][data-active=true] [data-block="figure"] img').click();
    result.figureSelectionOnly = await page.getByTestId('figure-properties').count() === 0 &&
      await page.locator('[data-document-tab][data-active=true] [data-block="figure"]').getAttribute('data-selected') === 'true';
    await page.getByRole('button', {name:'Edit figure'}).click();
    result.figurePopover = await page.getByTestId('figure-editor').isVisible();
    await settings.click();
    await page.keyboard.press('Escape'); await settingsDialog.waitFor({state:'hidden'});
    result.settingsKeepsFigureForm = await page.getByTestId('figure-editor').isVisible();
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
    // Hover the table while the Equation draft remains open.
    await page.locator('[data-document-tab][data-active=true] [data-block="table"]').hover({position:{x:8,y:8}});
    await page.getByRole('button',{name:'Move table block 15'}).click();
    const blockMenu = page.getByRole('menu',{name:'Block actions'});
    result.blockMenuItems = await blockMenu.getByRole('menuitem').allInnerTexts();
    await blockMenu.getByRole('menuitem',{name:'Delete', exact:true}).click();
    result.tableDeleted = await page.locator('[data-document-tab][data-active=true] [data-block="table"]').count() === 0;
    result.draftSurvivesDelete = await page.getByTestId('equation-latex').inputValue() === 'x + 2';
    await page.getByTestId('equation-cancel').click();

    // Keyboard deletion uses engine history. Unsupported external paste produces an expiring notice.
    await page.locator('[data-document-tab][data-active=true] [data-block="figure"] img').click();
    await page.keyboard.press('Delete');
    result.figureDeletedByKeyboard = await page.locator('[data-document-tab][data-active=true] [data-block="figure"]').count() === 0;
    await page.keyboard.press('Control+z');
    await paragraph.click();
    await page.locator('[data-document-tab][data-active=true] .document-editor').evaluate(el => {
      const data = new DataTransfer();
      data.setData('text/html', '<table><tr><td colspan="2">Merged cell</td></tr></table>');
      el.dispatchEvent(new ClipboardEvent('paste', {clipboardData:data, bubbles:true, cancelable:true}));
    });
    await page.getByTestId('notice').waitFor();
    result.noticeInMessageArea = await page.locator('[data-testid="message-area"] [data-testid="notice"]').count() === 1;
    result.figureKept = await page.locator('[data-document-tab][data-active=true] [data-block="figure"]').count() === 1;
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
    await page.getByText('Save conflict',{exact:true}).filter({visible:true}).waitFor();
    result.conflictKeepsEdits = (await article.innerText()).includes('SLASH_INSERTED');
    result.editorCount = await page.locator('[data-document-tab][data-active=true] [data-testid="document-editor"] [contenteditable="true"]').count();
    for (const [name, passed] of Object.entries(result)) {
      if (passed === false) throw new Error(`Shell regression: ${name}`);
    }
    if (result.editorCount !== 1) throw new Error('Shell must retain one document editor');
    return result;
  } finally {
    await page.unroute('**/api/document');
  }
}
