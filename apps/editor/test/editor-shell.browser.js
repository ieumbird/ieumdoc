// Run with playwright-cli run-code --filename=apps/editor/test/editor-shell.browser.js.
// Exercises the shell and block interactions. Every POST is mocked; no file is written.
async page => {
  await page.unroute('**/api/document');
  await page.reload();
  await page.getByText('Ready', {exact:true}).waitFor();
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
    result.sidebarCollapses = await page.getByRole('button',{name:'Open…'}).count() === 0;
    await page.getByRole('button',{name:'Expand sidebar'}).click();
    result.currentPath = (await page.getByTestId('current-file').innerText()).endsWith('technical-document.md');

    // Selection toolbar appears only for a paragraph text selection.
    const paragraph = page.getByText('The current reference is calculated from the active power command.', {exact:true});
    await paragraph.click();
    result.toolbarHiddenWithoutSelection = await page.getByTestId('selection-toolbar').count() === 0;
    await paragraph.dblclick();
    await page.getByTestId('selection-toolbar').waitFor();
    await page.getByTestId('selection-toolbar').getByRole('button',{name:'Bold'}).click();
    result.boldApplied = await page.locator('[data-source-path="8"] strong').count() === 1;
    await page.keyboard.press('Control+z');

    // Equation draft is shown inside the block and disables Save without a global warning.
    await page.getByRole('button',{name:'Edit',exact:true}).click();
    await page.getByTestId('equation-latex').fill('x + 1');
    result.equationDraftInBlock = await page.locator('[data-block="equation"] [data-testid="equation-draft-status"]').isVisible();
    await page.locator('.top-bar button:disabled', {hasText:'Save'}).waitFor();
    result.saveDisabledDuringDraft = true;
    result.noGlobalDraftWarning = await page.getByTestId('message-area').count() === 0;
    await page.getByTestId('equation-cancel').click();
    await page.locator('.top-bar button:enabled', {hasText:'Save'}).waitFor();
    result.saveEnabledAfterCancel = await page.getByTestId('equation-draft-status').count() === 0;

    // Figure properties open in a popover attached to the figure.
    await page.locator('[data-block="figure"] img').click();
    result.figurePopover = await page.locator('[data-block="figure"] [data-testid="figure-properties"]').isVisible();

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
    await page.getByRole('button',{name:'Edit',exact:true}).click();
    await page.getByTestId('equation-latex').fill('x + 2');
    await page.locator('[data-block="table"]').hover();
    await page.getByRole('button',{name:'Move table block 15'}).click();
    const blockMenu = page.getByRole('menu',{name:'Block actions'});
    result.blockMenuItems = await blockMenu.getByRole('menuitem').allInnerTexts();
    await blockMenu.getByRole('menuitem',{name:'Delete'}).click();
    result.tableDeleted = await page.locator('[data-block="table"]').count() === 0;
    result.draftSurvivesDelete = await page.getByTestId('equation-latex').inputValue() === 'x + 2';
    await page.getByTestId('equation-cancel').click();

    // A keyboard deletion stays blocked and produces an expiring notice.
    await page.locator('[data-block="figure"] img').click();
    await page.keyboard.press('Delete');
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
      inserts: request.inserts?.map(content => content.map(item => item.text).join('')),
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
    return result;
  } finally {
    await page.unroute('**/api/document');
  }
}
