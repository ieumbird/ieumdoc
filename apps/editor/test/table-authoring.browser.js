// Run with pnpm browser:test table-authoring (prepare is automatic).
// Creates a table from the insert menu and adds a row and a column to an existing table from its
// block menu, types into the new cells, saves, then adds another row after that save and saves
// again. The file must hold exactly what was typed, and reopening shows it. The reopened table's
// rows and columns are then moved, realigned and removed from the block menu, and saved again. Scratch files live
// under the repository's ignored tmp/ directory; the scenario writes tables.md only.
async page => {
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
    await page.getByRole('button', {name:'Open…'}).click();
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
  await blockMenu(4, 'Move row up');
  await reopened.locator('td', {hasText:/^W$/}).click();
  await blockMenu(4, 'Move column right');
  await blockMenu(4, 'Align column center');
  await reopened.locator('td', {hasText:/^Q$/}).click();
  await blockMenu(4, 'Delete row');
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
  await table.getByRole('button', {name:'Edit table'}).click();
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

  const failed = Object.entries(result).filter(([, value]) => value !== true);
  if (failed.length > 0) throw new Error(`Table authoring failed: ${JSON.stringify({result, file: await read()})}`);
  return result;
}
