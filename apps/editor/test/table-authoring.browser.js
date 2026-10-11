// Run with pnpm browser:test table-authoring (prepare is automatic).
// Creates a table from the insert menu and adds a row and a column to an existing table from its
// block menu, types into the new cells, saves, then adds another row after that save and saves
// again. The file must hold exactly what was typed, and reopening shows it. The reopened table's
// rows and columns are then moved, realigned and removed from the block menu, and saved again. Finally, the caret
// leaves the document's final table by ArrowDown and by a click below the document. Scratch files live
// under the repository's ignored tmp/ directory; the scenario writes tables.md only.
async page => {
  // Rendering a caption must not rebuild a schema with duplicated extensions (Tiptap warns).
  const tiptapWarnings = [];
  const onConsole = message => { if (message.text().startsWith('[tiptap warn]')) tiptapWarnings.push(message.text()); };
  page.on('console', onConsole);
  await page.unrouteAll();
  await page.reload();
  await page.locator('[data-testid="status"][data-operation="Ready"]').waitFor({state:'attached'});

  const origin = page.url().split('/').slice(0, 3).join('/');
  const defaultPath = (await (await page.request.get(`${origin}/api/document`)).json()).path;
  const separator = defaultPath.includes('\\') ? '\\' : '/';
  const root = defaultPath.split(separator).slice(0, -4).join(separator);
  const file = [root, 'tmp', 'table-authoring', 'tables.md'].join(separator);
  const read = async () => {
    const response = await page.request.get(`${origin}/document/tables.md?path=${encodeURIComponent(file)}`);
    if (response.status() !== 200) throw new Error(`Prepare ${file} first`);
    return (await response.text()).replaceAll('\r\n', '\n');
  };
  const fresh = '# Tables\n\nIntro paragraph.\n\n| Name | Value |\n| ---- | ----- |\n| U    | AC    |\n';
  if (await read() !== fresh) throw new Error('Scratch document is not a fresh tables.md copy');
  const open = async () => {
    await page.getByRole('button', {name:'Open file…'}).click();
    await page.getByTestId('file-path').fill(file);
    await page.getByRole('dialog').getByRole('button', {name:'Open', exact:true}).click();
    await page.locator('[data-testid="status"][data-operation="Ready"]').waitFor({state:'attached'});
    await page.getByRole('dialog').waitFor({state:'detached'});
  };
  const save = async () => {
    await page.getByRole('button', {name:'Save', exact:true}).click();
    await page.locator('[data-testid="status"]:is([data-operation="Saved"], [data-operation="Save failed"])').waitFor({state:'attached'});
    return await page.getByTestId('status').getAttribute('data-operation') === 'Saved';
  };
  const tables = page.locator('[data-block="table"]');
  const grid = table => table.locator('tr').evaluateAll(rows => rows.map(row =>
    [...row.children].map(cell => (cell.tagName === 'TH' ? '#' : '') + cell.textContent)));
  // The pointer is over the table after clicking a cell, so its handle is shown; the caret stays in the cell.
  const blockMenu = async (index, item) => {
    await page.getByRole('button', {name:`Move table block ${index}`, exact:true}).click();
    const menu = page.getByRole('menu', {name:'Block actions'});
    await menu.waitFor();
    const items = await menu.getByRole('menuitem').allInnerTexts();
    await menu.getByRole('menuitem', {name:item, exact:true}).click();
    return items;
  };
  const result = {};
  await open();

  // Direct handles/append buttons preserve the native caret and history. The menu can
  // target B while the caret remains in A; its portal must not be clipped by local scroll.
  const initial = tables.first();
  await initial.locator('td', {hasText:/^U$/}).click();
  result.activeCell = await initial.locator('[data-current-cell="true"]').innerText() === 'U' &&
    await initial.getByRole('button', {name:'Row 2 actions', exact:true}).getAttribute('aria-pressed') === 'true' &&
    await initial.getByRole('button', {name:'Column A actions', exact:true}).getAttribute('aria-pressed') === 'true';
  result.toolsDoNotOverlapEdit = await initial.evaluate(block => block.querySelector('.table-edit').getBoundingClientRect().bottom <=
    block.querySelector('.table-column-handle').getBoundingClientRect().top);
  await initial.getByRole('button', {name:'Append row', exact:true}).click();
  result.appendRowFocus = (await grid(initial)).length === 3 && await page.evaluate(() => {
    const editor = document.querySelector('.document-editor').editor;
    return editor.view.hasFocus() && editor.state.selection.$from.index(1) === 2;
  });
  await initial.getByRole('button', {name:'Append column', exact:true}).click();
  result.appendColumnFocus = (await grid(initial))[0].length === 3 && await page.evaluate(() => {
    const editor = document.querySelector('.document-editor').editor;
    return editor.view.hasFocus() && editor.state.selection.$from.index(2) === 2;
  });
  await page.keyboard.press('Control+z');
  result.appendUndo = (await grid(initial))[0].length === 2 && (await grid(initial)).length === 3;
  await page.keyboard.press('Control+Shift+z');
  result.appendRedo = (await grid(initial))[0].length === 3;
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  result.appendUndoRestores = JSON.stringify(await grid(initial)) === JSON.stringify([['#Name', '#Value'], ['U', 'AC']]);
  await initial.locator('td', {hasText:/^U$/}).click();
  await initial.getByRole('button', {name:'Column B actions', exact:true}).click();
  const columnMenu = page.getByRole('menu', {name:'Column B actions', exact:true});
  await columnMenu.getByRole('menuitem', {name:'Align column right', exact:true}).click();
  result.handleTargetsColumn = await initial.locator('tr').evaluateAll(rows => rows.every(row => row.cells[1].style.textAlign === 'right' && row.cells[0].style.textAlign !== 'right'));
  await page.keyboard.press('Control+z');
  const headerHandle = initial.getByRole('button', {name:'Row 1 actions (header)', exact:true});
  await headerHandle.focus();
  await page.keyboard.press('Enter');
  const headerMenu = page.getByRole('menu', {name:'Row 1 actions', exact:true});
  result.headerProtected = await headerMenu.getByRole('menuitem', {name:'Delete row', exact:true}).isDisabled() &&
    await headerMenu.getByRole('menuitem', {name:'Move row down', exact:true}).isDisabled();
  await page.keyboard.press('Escape');
  result.keyboardMenuReturns = await headerHandle.evaluate(button => document.activeElement === button);
  await page.setViewportSize({width:768, height:720});
  await initial.hover();
  for (let i = 0; i < 5; i++) await initial.getByRole('button', {name:'Append column', exact:true}).click();
  await initial.locator('.table-scroll').evaluate(scroll => { scroll.scrollLeft = scroll.scrollWidth; });
  const last = initial.getByRole('button', {name:'Column G actions', exact:true});
  await last.click();
  result.narrowGeometry = await initial.evaluate(block => {
    const table = block.querySelector('table');
    const handles = [...block.querySelectorAll('.table-column-handle')];
    return block.querySelector('.table-scroll').scrollWidth > block.querySelector('.table-scroll').clientWidth &&
      handles.every((handle, i) => Math.abs(handle.getBoundingClientRect().left - table.rows[0].cells[i].getBoundingClientRect().left) < 1) &&
      document.documentElement.scrollWidth <= innerWidth;
  });
  result.menuWithinViewport = await page.getByRole('menu', {name:'Column G actions', exact:true}).evaluate(menu => {
    const r = menu.getBoundingClientRect();
    return r.left >= 0 && r.right <= innerWidth && r.top >= document.querySelector('.app-header').getBoundingClientRect().bottom && r.bottom <= innerHeight;
  });
  await page.keyboard.press('Escape');
  await initial.locator('td').first().click();
  for (let i = 0; i < 5; i++) await page.keyboard.press('Control+z');
  await page.setViewportSize({width:1280, height:720});
  result.toolsNeverPersist = !JSON.stringify(await page.evaluate(() => document.querySelector('.document-editor').editor.getJSON())).includes('data-current-cell');

  // 1. Insert menu → Table: a header row and two body rows of three columns, caret in the first cell.
  await page.getByText('Intro paragraph.', {exact:true}).hover();
  await page.getByRole('button', {name:'Insert block after paragraph block 2', exact:true}).click();
  await page.getByRole('menu', {name:'Insert block'}).getByRole('menuitem', {name:'Table', exact:true}).click();
  const created = tables.first();
  result.tableCreated = await tables.count() === 2 &&
    JSON.stringify(await grid(created)) === JSON.stringify([['#', '#', '#'], ['', '', ''], ['', '', '']]);
  await page.keyboard.type('Port');
  await created.locator('td').first().click();
  await page.keyboard.type('U');
  result.typedInNewTable = JSON.stringify(await grid(created)) === JSON.stringify([['#Port', '#', '#'], ['U', '', ''], ['', '', '']]);

  // 2. The existing table's block menu adds a row below the caret's row, then a column right of it.
  const existing = tables.last();
  await existing.locator('td', {hasText:/^U$/}).click();
  const items = await blockMenu(4, 'Add row below');
  result.menuOffersRowAndColumn = JSON.stringify(items) === JSON.stringify(['Add row below', 'Add column right', 'Move row up', 'Move row down',
    'Move column left', 'Move column right', 'Align column left', 'Align column center', 'Align column right', 'Clear column alignment',
    'Delete row', 'Delete column', 'Delete']);
  await page.keyboard.type('P');
  await blockMenu(4, 'Add column right');
  await page.keyboard.type('W');
  result.rowAndColumnAdded = JSON.stringify(await grid(existing)) ===
    JSON.stringify([['#Name', '#', '#Value'], ['U', '', 'AC'], ['P', 'W', '']]);
  result.firstSave = await save();
  result.firstFile = await read() === '# Tables\n\nIntro paragraph.\n\n' +
    '| Port |   |   |\n| ---- | - | - |\n| U    |   |   |\n|      |   |   |\n\n' +
    '| Name |   | Value |\n| ---- | - | ----- |\n| U    |   | AC    |\n| P    | W |       |\n';

  // 3. Rows added after a save are new again: the saved cells are no longer "added".
  await existing.locator('td', {hasText:/^AC$/}).click();
  await blockMenu(4, 'Add row below');
  await page.keyboard.type('Q');
  result.secondSave = await save();
  result.secondFile = (await read()).endsWith('| Name |   | Value |\n| ---- | - | ----- |\n| U    |   | AC    |\n|      |   | Q     |\n| P    | W |       |\n');

  // 4. Reopening shows the saved tables with editable new cells.
  await open();
  result.reopened = JSON.stringify(await grid(tables.last())) ===
    JSON.stringify([['#Name', '#', '#Value'], ['U', '', 'AC'], ['', '', 'Q'], ['P', 'W', '']]) &&
    await tables.last().locator('[data-readonly-cell]').count() === 0;

  // 5. In the reopened table, rows and columns move, a column is realigned and a row is removed at the
  // caret; Undo/Redo step through them, and Save writes the same grid.
  const reopened = tables.last();
  await reopened.locator('td', {hasText:/^P$/}).click();
  await reopened.getByRole('button', {name:'Row 4 actions', exact:true}).click();
  await page.getByRole('menu', {name:'Row 4 actions', exact:true}).getByRole('menuitem', {name:'Move row up', exact:true}).click();
  await reopened.locator('td', {hasText:/^W$/}).click();
  await reopened.getByRole('button', {name:'Column B actions', exact:true}).click();
  await page.getByRole('menu', {name:'Column B actions', exact:true}).getByRole('menuitem', {name:'Move column right', exact:true}).click();
  await reopened.getByRole('button', {name:'Column C actions', exact:true}).click();
  await page.getByRole('menu', {name:'Column C actions', exact:true}).getByRole('menuitem', {name:'Align column center', exact:true}).click();
  await reopened.locator('td', {hasText:/^Q$/}).click();
  await reopened.getByRole('button', {name:'Row 4 actions', exact:true}).click();
  await page.getByRole('menu', {name:'Row 4 actions', exact:true}).getByRole('menuitem', {name:'Delete row', exact:true}).click();
  const reshaped = [['#Name', '#Value', '#'], ['U', 'AC', ''], ['P', '', 'W']];
  result.reshaped = JSON.stringify(await grid(reopened)) === JSON.stringify(reshaped);
  await page.keyboard.press('Control+z');
  result.undoRestoresRow = (await grid(reopened)).length === 4;
  await page.keyboard.press('Control+Shift+z');
  result.redoRemovesRow = JSON.stringify(await grid(reopened)) === JSON.stringify(reshaped);
  result.thirdSave = await save();
  result.thirdFile = (await read()).endsWith('| Name | Value |     |\n| ---- | ----- | :-: |\n| U    | AC    |     |\n| P    |       |  W  |\n');
  // A later Save in the same session replays these changes against the opening snapshot.
  await reopened.locator('td', {hasText:/^W$/}).click();
  await blockMenu(4, 'Clear column alignment');
  result.fourthSave = await save();
  result.fourthFile = (await read()).endsWith('| Name | Value |   |\n| ---- | ----- | - |\n| U    | AC    |   |\n| P    |       | W |\n');
  await open();
  result.reshapedAfterReopen = JSON.stringify(await grid(tables.last())) === JSON.stringify(reshaped);

  // Caption and label use the shared properties form and survive subsequent grid edits.
  const table = tables.last();
  await table.hover();
  await table.getByRole('button', {name:'Table actions', exact:true}).click();
  await page.getByRole('menu', {name:'Table actions', exact:true}).getByRole('menuitem', {name:'Edit caption and label', exact:true}).click();
  await page.getByTestId('table-caption-input').fill('Cancelled caption');
  await page.getByTestId('table-cancel').click();
  result.captionCancelKeepsTable = await table.getByTestId('table-caption').count() === 0;
  await table.hover();
  await table.getByRole('button', {name:'Edit table'}).click();
  await page.getByTestId('table-caption-input').fill('Port values');
  await page.getByTestId('table-label').fill('tbl-ports');
  await page.getByTestId('table-apply').click();
  await page.getByTestId('table-editor').waitFor({state:'detached'});
  result.captionApplied = await table.getByTestId('table-caption').innerText() === 'Port values' &&
    await table.getByTestId('table-caption').getAttribute('data-number') === 'Table 1';
  result.captionSave = await save();
  result.captionWritten = (await read()).includes(':::{table} Port values\n:name: tbl-ports');
  await open();
  result.captionReloaded = await tables.last().getByTestId('table-caption').innerText() === 'Port values';
  result.captionWithoutTiptapWarning = tiptapWarnings.length === 0;
  await tables.last().locator('td', {hasText:/^W$/}).click();
  await page.keyboard.type('att');
  result.captionCellSave = await save();
  result.captionAndCellKept = (await read()).includes('Port values') && (await read()).includes('Watt');
  // The slash menu inserts a numbered Table reference; clicking it selects the target.
  await page.getByText('Intro paragraph.', {exact:true}).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' /tbl');
  await page.getByRole('menuitem', {name:'Table reference: tbl-ports'}).click();
  const ref = page.getByTestId('cross-reference').filter({hasText:'Table 1'});
  result.tableReferenceShown = await ref.count() === 1;
  await ref.locator('.cross-reference-chip').click();
  result.tableReferenceNavigates = await tables.last().getAttribute('data-selected') === 'true';
  result.referenceSave = await save();
  result.tableRoleWritten = (await read()).includes('{numref}`tbl-ports`');
  await open();
  result.tableReferenceReloaded = await page.getByTestId('cross-reference').filter({hasText:'Table 1'}).count() === 1;

  // Last-column protection and explicit table deletion remain undoable.
  const finalTable = tables.last();
  await finalTable.locator('td').first().click();
  for (const name of ['C', 'B']) {
    await finalTable.getByRole('button', {name:`Column ${name} actions`, exact:true}).click();
    await page.getByRole('menu', {name:`Column ${name} actions`, exact:true}).getByRole('menuitem', {name:'Delete column', exact:true}).click();
  }
  await finalTable.getByRole('button', {name:'Column A actions', exact:true}).click();
  result.lastColumnProtected = await page.getByRole('menu', {name:'Column A actions', exact:true}).getByRole('menuitem', {name:'Delete column', exact:true}).isDisabled();
  await page.keyboard.press('Escape');
  await finalTable.locator('td').first().click();
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  result.columnUndoKeepsCaption = (await grid(finalTable))[0].length === 3 && await finalTable.getByTestId('table-caption').innerText() === 'Port values';
  await finalTable.getByRole('button', {name:'Delete table', exact:true}).click();
  result.deleteTable = await tables.count() === 1;
  await page.keyboard.press('Control+z');
  result.undoTableDeletion = await tables.count() === 2 && await tables.last().getByTestId('table-caption').innerText() === 'Port values';

  // The document still ends with this table, which has no line below it. ArrowDown from its last row and
  // a click below the document both reach one empty paragraph after it; empty, it changes nothing to save.
  const caret = () => page.evaluate(() => {
    const {state} = document.querySelector('.document-editor').editor;
    return `${state.selection.$from.parent.type.name} ${state.selection.$from.index(0) + 1}/${state.doc.childCount}`;
  });
  const caretIn = text => page.waitForFunction(text =>
    document.querySelector('.document-editor').editor.state.selection.$from.parent.textContent === text, text);
  const status = await page.getByTestId('status').innerText();
  await tables.last().locator('td', {hasText:/^P$/}).click();
  await caretIn('P');
  await page.keyboard.press('ArrowDown');
  result.arrowLeavesFinalTable = await caret() === 'paragraph 5/5';
  await tables.last().locator('td', {hasText:/^U$/}).click();
  await caretIn('U');
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  const column = await page.locator('.document-column').boundingBox();
  await page.mouse.click(column.x + column.width / 2, Math.min(column.y + column.height, 720) - 8);
  result.clickBelowReachesEnd = await caret() === 'paragraph 5/5' &&
    await page.evaluate(() => document.querySelector('.document-editor').editor.view.hasFocus()) &&
    await page.getByTestId('status').innerText() === status;

  page.off('console', onConsole);
  const failed = Object.entries(result).filter(([, value]) => value !== true);
  if (failed.length > 0) throw new Error(`Table authoring failed: ${JSON.stringify({result, file: await read()})}`);
  return result;
}
