// Run with pnpm browser:test table-authoring (prepare is automatic).
// Creates a table from the insert menu and adds a row and a column to an existing table from its
// block menu, types into the new cells, saves, then adds another row after that save and saves
// again. The file must hold exactly what was typed, and reopening shows it. The reopened table's
// rows and columns are then moved, realigned and removed from the block menu, and saved again. Finally, the caret
// leaves the document's final table by ArrowDown and by a click below the document. Scratch files live
// under the repository's ignored tmp/ directory; the scenario writes tables.md only.
async (page, { openPath, reloadDocument }) => {
  page.setDefaultTimeout(15000);
  // Rendering a caption must not rebuild a schema with duplicated extensions (Tiptap warns).
  const tiptapWarnings = [];
  const onConsole = message => { if (message.text().startsWith('[tiptap warn]')) tiptapWarnings.push(message.text()); };
  page.on('console', onConsole);
  await page.unrouteAll();
  await page.reload();
  await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});

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
  const fresh = '---\nieumdoc: 1\n---\n\n# Tables\n\nIntro paragraph.\n\n| Name | Value |\n| ---- | ----- |\n| U    | AC    |\n';
  if (await read() !== fresh) throw new Error('Scratch document is not a fresh tables.md copy');
  const open = async () => {
    await openPath(page, file);
    await page.getByRole('dialog').waitFor({state:'detached'});
  };
  const save = async () => {
    await page.getByRole('button', {name:'Save', exact:true}).click();
    await page.locator('[data-testid="status"]:is([data-operation="saved"], [data-operation="save-failed"])').waitFor({state:'attached'});
    return await page.getByTestId('status').getAttribute('data-operation') === 'saved';
  };
  const tables = page.locator('[data-document-tab][data-active=true] [data-block="table"]');
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
  await initial.hover();
  const lightHandles = await initial.locator('.table-row-handle, .table-column-handle').evaluateAll(handles => handles.map(button => {
    const rect = button.getBoundingClientRect();
    return { name: button.getAttribute('aria-label'), title: button.title, text: button.textContent.trim(),
      icon: !!button.querySelector('svg[aria-hidden="true"]'), width: rect.width, height: rect.height,
      background: getComputedStyle(button).backgroundColor };
  }));
  if (!lightHandles.length || lightHandles.some(handle => handle.text || !handle.icon || handle.title !== handle.name || handle.width < 28 || handle.height !== 28 || handle.background !== 'rgba(0, 0, 0, 0)')) {
    throw new Error(`Light table handles need an icon without visible address text, matching localized name/tooltip, transparent rest and 28px targets: ${JSON.stringify(lightHandles)}`);
  }
  const handleVisibility = handles => handles.map(button => {
    const rect = button.getBoundingClientRect(), ancestors = [];
    for (let node = button; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      ancestors.push({element:node.className || node.tagName, display:style.display, visibility:style.visibility, opacity:style.opacity});
    }
    return {name:button.getAttribute('aria-label'), row:button.matches('.table-row-handle'), focused:document.activeElement === button,
      width:rect.width, height:rect.height, pointerEvents:getComputedStyle(button).pointerEvents, ancestors,
      visible:button.checkVisibility({checkOpacity:true, checkVisibilityCSS:true}) &&
        ancestors.every(style => style.display !== 'none' && style.visibility === 'visible' && style.opacity === '1')};
  });
  const assertVisibleHandles = async (table, state, focused = false) => {
    const handles = await table.locator('.table-row-handle, .table-column-handle').evaluateAll(handleVisibility);
    if (!handles.some(handle => handle.row) || !handles.some(handle => !handle.row) ||
      handles.some(handle => !handle.visible || handle.width < 28 || handle.height < 28 || handle.pointerEvents !== 'auto') ||
      focused && handles.filter(handle => handle.focused).length !== 1) {
      throw new Error(`${state}: actual row/column handles must be visible and usable, with opaque visible ancestors and nonzero 28px targets: ${JSON.stringify(handles)}`);
    }
  };
  const noHoverPage = await page.context().newPage();
  try {
    await noHoverPage.goto(page.url());
    await noHoverPage.locator('[data-operation="ready"]').waitFor({state:'attached'});
    await openPath(noHoverPage, file);
    await noHoverPage.locator('[data-document-tab][data-active=true] .table-row-handle').first().waitFor({state:'attached'});
    const touch = await page.context().newCDPSession(noHoverPage);
    await touch.send('Emulation.setTouchEmulationEnabled', {enabled:true});
    await noHoverPage.mouse.move(0,0);
    const touchTable = noHoverPage.locator('[data-document-tab][data-active=true] .table-block').first();
    const touchState = await touchTable.evaluate(block => {
      const tools = [...block.querySelectorAll('.table-tools')];
      return {noHover:matchMedia('(hover: none)').matches, pointerAway:!block.matches(':hover'),
        focusOutside:!block.contains(document.activeElement), noCurrentCell:!block.querySelector('[data-current-cell="true"]'),
        noActiveTools:!block.querySelector('.table-tools[data-active="true"]'), containersVisible:tools.length > 0 && tools.every(n => {
        const s = getComputedStyle(n);
        return s.visibility === 'visible' && s.opacity === '1';
      })};
    });
    if (Object.values(touchState).some(value => !value)) throw new Error(`No-hover probe must be pointer-away, unfocused and without a current table cell: ${JSON.stringify(touchState)}`);
    await assertVisibleHandles(touchTable, 'No-hover fallback');
    result.touchHandlesVisible = true;
  } finally { await noHoverPage.close(); }
  // From prose, Tab discovers the table's native button stops without pointer hover.
  // Tab inside a cell is still the engine's cell navigation (covered below).
  const prose = page.getByText('Intro paragraph.', {exact:true}).filter({visible:true});
  // Click completion can precede ProseMirror's native selectionchange acknowledgement.
  // Subscribe before clicking, then verify the actual native and engine prose caret.
  await prose.evaluate(n => {
    const editor = n.closest('.document-editor').editor, start = editor.view.posAtDOM(n, 0);
    let accept;
    const ready = new Promise(resolve => { accept = resolve; });
    const updated = () => {
      const {selection} = editor.state;
      if (editor.view.hasFocus() && selection.empty && selection.$from.parent.type.name === 'paragraph' && selection.$from.start() === start) accept();
    };
    editor.on('selectionUpdate', updated);
    n.tableProseSelection = {ready, document:editor.state.doc, cleanup:() => editor.off('selectionUpdate', updated)};
  });
  let keyboardDocument;
  try {
    await prose.click();
    keyboardDocument = await prose.evaluate(async n => {
      const editor = n.closest('.document-editor').editor, gate = n.tableProseSelection;
      const native = window.getSelection(), {anchorNode, anchorOffset, focusNode, focusOffset} = native;
      if (!native.isCollapsed || !n.contains(anchorNode) || !n.contains(focusNode)) throw new Error('Keyboard discovery needs the native caret in Intro prose');
      const from = editor.view.posAtDOM(anchorNode, anchorOffset), to = editor.view.posAtDOM(focusNode, focusOffset);
      let timeout;
      try {
        await Promise.race([gate.ready, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Intro prose selectionUpdate missing')), 1000); })]);
      } finally { clearTimeout(timeout); }
      const {selection} = editor.state;
      if (!editor.view.hasFocus() || selection.from !== from || selection.to !== to || selection.$from.parent.type.name !== 'paragraph' ||
        editor.state.doc !== gate.document || native.anchorNode !== anchorNode || native.anchorOffset !== anchorOffset || native.focusNode !== focusNode || native.focusOffset !== focusOffset) {
        throw new Error(`Intro native/engine caret must converge without changing the document: ${JSON.stringify({from,to,engine:selection.toJSON()})}`);
      }
      return JSON.stringify(editor.getJSON());
    });
    result.keyboardProseSelectionReady = true;
  } finally {
    await prose.evaluate(n => { n.tableProseSelection?.cleanup(); delete n.tableProseSelection; });
  }
  await page.mouse.move(0, 0);
  await page.keyboard.press('Tab');
  const discovered = await initial.locator('.table-row-handle:focus, .table-column-handle:focus').count();
  if (discovered !== 1) throw new Error('Tab from preceding prose must discover a table handle without hovering the table');
  await assertVisibleHandles(initial, 'Keyboard Tab discovery', true);
  result.keyboardHandlesVisible = true;
  await page.keyboard.press('Enter');
  await page.getByRole('menu').waitFor();
  await page.keyboard.press('Escape');
  if (await initial.locator('.table-row-handle:focus, .table-column-handle:focus').count() !== 1) throw new Error('Escape must return keyboard focus to the discovered handle');
  await assertVisibleHandles(initial, 'Keyboard Escape return', true);
  result.keyboardReturnHandlesVisible = true;
  result.keyboardDiscoveryKeepsDocument = await page.locator('[data-document-tab][data-active=true] .document-editor').evaluate(n => JSON.stringify(n.editor.getJSON())) === keyboardDocument;
  await initial.locator('td', {hasText:/^U$/}).click();
  result.activeCell = await initial.locator('[data-current-cell="true"]').innerText() === 'U' &&
    await initial.getByRole('button', {name:'Row 2 actions', exact:true}).getAttribute('aria-pressed') === 'true' &&
    await initial.getByRole('button', {name:'Column A actions', exact:true}).getAttribute('aria-pressed') === 'true';
  // Edit (caption and label) sits in the action bar below the table; the table starts on the text
  // axis and its row handles stay left of it, clear of the gutter's block handle.
  result.toolsDoNotOverlapEdit = await initial.evaluate(block => {
    const edit = block.querySelector('[aria-label="Edit table"]').getBoundingClientRect();
    const table = block.querySelector('table').getBoundingClientRect();
    const row = block.querySelector('.table-row-handle').getBoundingClientRect();
    const handle = document.querySelector('.block-controls.visible .block-handle')?.getBoundingClientRect();
    return edit.top >= table.bottom && Math.abs(table.left - block.getBoundingClientRect().left) < 0.5 && row.right <= table.left &&
      (!handle || handle.bottom <= row.top || row.bottom <= handle.top || handle.right <= row.left);
  });
  await initial.locator('th').first().click();
  await initial.getByRole('button', {name:'Row 2 actions', exact:true}).click();
  await page.getByRole('menu', {name:'Row 2 actions', exact:true}).getByRole('menuitem', {name:'Add row below', exact:true}).click();
  result.handleTargetsRow = JSON.stringify(await grid(initial)) === JSON.stringify([['#Name', '#Value'], ['U', 'AC'], ['', '']]);
  await page.keyboard.press('Control+z');
  await initial.getByRole('button', {name:'Append row', exact:true}).click();
  result.appendRowFocus = (await grid(initial)).length === 3 && await page.evaluate(() => {
    const editor = document.querySelector('[data-document-tab][data-active=true] .document-editor').editor;
    return editor.view.hasFocus() && editor.state.selection.$from.index(1) === 2;
  });
  await initial.getByRole('button', {name:'Append column', exact:true}).click();
  result.appendColumnFocus = (await grid(initial))[0].length === 3 && await page.evaluate(() => {
    const editor = document.querySelector('[data-document-tab][data-active=true] .document-editor').editor;
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
  const menuFormat = async menu => menu.evaluate(menu => [...menu.querySelectorAll('[role="menuitem"]')].every(item =>
    item.querySelector('svg')?.getBoundingClientRect().width === 16));
  if (!await menuFormat(columnMenu)) throw new Error('Column menu needs 16px action icons');
  const dangerRow = columnMenu.getByRole('menuitem', {name:'Delete column', exact:true});
  await dangerRow.hover();
  if (!await dangerRow.evaluate(item => {
    const probe = document.createElement('span');
    probe.style.cssText = 'color:var(--id-color-danger);background:var(--id-color-surface-danger)';
    item.append(probe);
    const actual = getComputedStyle(item), expected = getComputedStyle(probe);
    const matches = actual.color === expected.color && actual.backgroundColor === expected.backgroundColor;
    probe.remove();
    return matches;
  })) throw new Error('Destructive table row needs danger text and hover tokens');
  await columnMenu.getByRole('menuitem', {name:'Align column right', exact:true}).click();
  result.handleTargetsColumn = await initial.locator('tr').evaluateAll(rows => rows.every(row => row.cells[1].style.textAlign === 'right' && row.cells[0].style.textAlign !== 'right'));
  await page.keyboard.press('Control+z');
  const headerHandle = initial.getByRole('button', {name:'Row 1 actions (header)', exact:true});
  await headerHandle.focus();
  await page.keyboard.press('Enter');
  const headerMenu = page.getByRole('menu', {name:'Row 1 actions', exact:true});
  if (!await menuFormat(headerMenu)) throw new Error('Row menu needs 16px action icons');
  result.headerProtected = await headerMenu.getByRole('menuitem', {name:'Delete row', exact:true}).isDisabled() &&
    await headerMenu.getByRole('menuitem', {name:'Move row down', exact:true}).isDisabled();
  await page.keyboard.press('Escape');
  result.keyboardMenuReturns = await headerHandle.evaluate(button => document.activeElement === button);
  await initial.getByRole('button', {name:'Table actions', exact:true}).click();
  const tableActions = page.getByRole('menu', {name:'Table actions', exact:true});
  if (!await menuFormat(tableActions)) throw new Error('Whole-table menu needs 16px action icons');
  if (!await tableActions.getByRole('menuitem', {name:'Delete table', exact:true}).evaluate(item => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--id-color-danger)'; item.append(probe);
    const matches = getComputedStyle(item).color === getComputedStyle(probe).color;
    probe.remove(); return matches;
  })) throw new Error('Delete table needs the danger token');
  await page.keyboard.press('Escape');
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
      [...block.querySelectorAll('.table-row-handle')].every((handle, i) => {
        const r = handle.getBoundingClientRect(), row = table.rows[i].getBoundingClientRect();
        return r.width === 28 && r.height === 28 && r.right <= block.getBoundingClientRect().left &&
          Math.abs(r.top + r.height / 2 - row.top - row.height / 2) < 1;
      }) &&
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
  result.toolsNeverPersist = !JSON.stringify(await page.evaluate(() => document.querySelector('[data-document-tab][data-active=true] .document-editor').editor.getJSON())).includes('data-current-cell');

  // 1. Insert menu → Table: a header row and two body rows of three columns, caret in the first cell.
  await page.getByText('Intro paragraph.', {exact:true}).filter({visible:true}).hover();
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
  result.menuOffersRowAndColumn = ['Add row below', 'Add column right', 'Move row up', 'Move row down',
    'Move column left', 'Move column right', 'Align column left', 'Align column center', 'Align column right', 'Clear column alignment',
    'Delete row', 'Delete column', 'Delete'].every(label => items.includes(label));
  await page.keyboard.type('P');
  await blockMenu(4, 'Add column right');
  await page.keyboard.type('W');
  result.rowAndColumnAdded = JSON.stringify(await grid(existing)) ===
    JSON.stringify([['#Name', '#', '#Value'], ['U', '', 'AC'], ['P', 'W', '']]);
  result.firstSave = await save();
  result.firstFile = await read() === '---\nieumdoc: 1\n---\n\n# Tables\n\nIntro paragraph.\n\n' +
    '| Port |   |   |\n| ---- | - | - |\n| U    |   |   |\n|      |   |   |\n\n' +
    '| Name |   | Value |\n| ---- | - | ----- |\n| U    |   | AC    |\n| P    | W |       |\n';

  // 3. Rows added after a save are new again: the saved cells are no longer "added".
  await existing.locator('td', {hasText:/^AC$/}).click();
  await blockMenu(4, 'Add row below');
  await page.keyboard.type('Q');
  result.secondSave = await save();
  result.secondFile = (await read()).endsWith('| Name |   | Value |\n| ---- | - | ----- |\n| U    |   | AC    |\n|      |   | Q     |\n| P    | W |       |\n');

  // 4. Reopening shows the saved tables with editable new cells.
  await reloadDocument(page);
  await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
  await page.getByRole('dialog').waitFor({state:'detached'});
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
  await reloadDocument(page);
  await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
  await page.getByRole('dialog').waitFor({state:'detached'});
  result.reshapedAfterReopen = JSON.stringify(await grid(tables.last())) === JSON.stringify(reshaped);

  // Caption and label use the shared properties form and survive subsequent grid edits.
  const table = tables.last();
  await table.hover();
  await table.getByRole('button', {name:'Table actions', exact:true}).click();
  await page.getByRole('menu', {name:'Table actions', exact:true}).getByRole('menuitem', {name:'Edit label', exact:true}).click();
  await page.getByTestId('table-label').fill('cancelled-label');
  await page.getByTestId('table-cancel').click();
  result.captionCancelKeepsTable = await table.getByTestId('table-caption').count() === 0;
  await table.hover();
  await table.getByRole('button', {name:'Edit table'}).click();
  await page.getByTestId('table-cancel').click();
  await table.getByRole('button',{name:'Add caption',exact:true}).click();
  await page.keyboard.type('Port values');
  await table.hover();
  await table.getByRole('button', {name:'Edit table'}).click();
  await page.getByTestId('table-label').fill('tbl-ports');
  await page.getByTestId('table-apply').click();
  await page.getByTestId('table-editor').waitFor({state:'detached'});
  result.captionApplied = await table.getByTestId('table-caption').innerText() === 'Port values' &&
    await table.getByTestId('table-caption').getAttribute('data-number') === 'Table 1';
  result.captionSave = await save();
  result.captionWritten = (await read()).includes(':::{table} Port values\n:name: tbl-ports');
  await reloadDocument(page);
  await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
  await page.getByRole('dialog').waitFor({state:'detached'});
  result.captionReloaded = await tables.last().getByTestId('table-caption').innerText() === 'Port values';
  result.captionWithoutTiptapWarning = tiptapWarnings.length === 0;
  await tables.last().locator('td', {hasText:/^W$/}).click();
  await page.keyboard.type('att');
  result.captionCellSave = await save();
  result.captionAndCellKept = (await read()).includes('Port values') && (await read()).includes('Watt');
  // The slash menu inserts a numbered Table reference; clicking it selects the target.
  await page.getByText('Intro paragraph.', {exact:true}).filter({visible:true}).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' /tbl');
  await page.getByRole('menuitem', {name:'Table 1 · Port values', exact:true}).click();
  const ref = page.locator('[data-document-tab][data-active=true]').getByTestId('cross-reference').filter({hasText:'Table 1'});
  result.tableReferenceShown = await ref.count() === 1;
  await ref.locator('.cross-reference-chip').click();
  result.tableReferenceNavigates = await tables.last().getAttribute('data-selected') === 'true';
  result.referenceSave = await save();
  result.tableRoleWritten = (await read()).includes('{numref}`tbl-ports`');
  await reloadDocument(page);
  await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
  await page.getByRole('dialog').waitFor({state:'detached'});
  result.tableReferenceReloaded = await page.locator('[data-document-tab][data-active=true]').getByTestId('cross-reference').filter({hasText:'Table 1'}).count() === 1;

  await tables.last().hover({position:{x:4,y:4}});
  await tables.last().getByRole('button', {name:'Edit table', exact:true}).click();
  await page.getByTestId('table-label').fill('tbl-renamed');
  await page.getByTestId('table-apply').click();
  await page.getByTestId('table-editor').waitFor({state:'detached'});
  result.tableRenameKeepsReference = await ref.getAttribute('data-label') === 'tbl-renamed' && await ref.getAttribute('data-resolved') === 'true';
  await page.keyboard.press('ControlOrMeta+z');
  await tables.last().locator('.block-kind').filter({hasText:'tbl-ports'}).waitFor({state:'attached', timeout:5000});
  result.tableRenameUndo = await ref.getAttribute('data-label') === 'tbl-ports' && (await tables.last().locator('.block-kind').textContent()).includes('tbl-ports');
  await page.keyboard.press('ControlOrMeta+Shift+z');
  result.tableRenameSaved = await save() && (await read()).includes('{numref}`tbl-renamed`');
  await reloadDocument(page);
  await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
  result.tableRenameReloaded = await ref.getAttribute('data-label') === 'tbl-renamed' && await ref.getAttribute('data-resolved') === 'true';

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
  const beforeDelete = await grid(finalTable);
  const editorFocused = () => page.evaluate(() => document.querySelector('[data-document-tab][data-active=true] .document-editor').editor.view.hasFocus());
  const notice = page.getByTestId('notice');
  const assertDeletionNotice = async () => {
    const noticeCount = await notice.count();
    const text = noticeCount === 1 ? await notice.innerText() : '';
    const undoCount = await notice.getByRole('button', {name:'Undo', exact:true}).count();
    const focused = await editorFocused();
    if (noticeCount !== 1 || !text.includes('Table deleted') || undoCount !== 1 || !focused) {
      const caret = await page.evaluate(() => {
        const editor = document.querySelector('[data-document-tab][data-active=true] .document-editor').editor;
        return {selection:editor.state.selection.toJSON(), parent:editor.state.selection.$from.parent.type.name,
          tableCount:document.querySelectorAll('[data-document-tab][data-active=true] [data-block="table"]').length};
      });
      throw new Error('Table deletion must show Table deleted / Undo without taking editor focus: '+
        JSON.stringify({noticeCount,text,undoCount,focused,...caret}));
    }
    result.deleteNoticePolite = await notice.getAttribute('role') === 'status';
  };
  await page.getByRole('button', {name:'File actions', exact:true}).click();
  await page.getByRole('menuitem', {name:'Copy path', exact:true}).click();
  await notice.filter({hasText:'Copied the file path.'}).waitFor();
  await finalTable.locator('td').first().click();
  await finalTable.getByRole('button', {name:'Delete table', exact:true}).click();
  result.deleteTable = await tables.count() === 1;
  await assertDeletionNotice();
  await notice.getByRole('button', {name:'Undo', exact:true}).click();
  result.undoTableDeletion = await tables.count() === 2 && JSON.stringify(await grid(tables.last())) === JSON.stringify(beforeDelete) &&
    await tables.last().getByTestId('table-caption').innerText() === 'Port values' && await editorFocused() && await notice.count() === 0;
  result.deleteUndoSave = await save();
  await reloadDocument(page);
  result.deleteUndoReload = JSON.stringify(await grid(tables.last())) === JSON.stringify(beforeDelete) &&
    await tables.last().getByTestId('table-caption').innerText() === 'Port values';

  // The gutter menu and table menu share the explicit deletion command.
  await tables.last().locator('td').first().click();
  await blockMenu(4, 'Delete');
  await assertDeletionNotice();
  await notice.getByRole('button', {name:'Undo', exact:true}).click();
  result.blockDeleteUndo = JSON.stringify(await grid(tables.last())) === JSON.stringify(beforeDelete);
  await tables.last().hover();
  await tables.last().getByRole('button', {name:'Table actions', exact:true}).click();
  await page.getByRole('menu', {name:'Table actions', exact:true}).getByRole('menuitem', {name:'Delete table', exact:true}).click();
  await assertDeletionNotice();
  await page.keyboard.type('x');
  result.typingClosesDeleteNotice = await notice.count() === 0 && await tables.count() === 1;
  await page.keyboard.press('Control+z');
  result.typingUndoKeepsDeletion = await tables.count() === 1;
  await page.keyboard.press('Control+z');
  result.deletionRemainsOneStep = JSON.stringify(await grid(tables.last())) === JSON.stringify(beforeDelete);

  // Reference navigation selects the whole table; both native deletion keys offer the same Undo.
  for (const key of ['Delete', 'Backspace']) {
    await ref.locator('.cross-reference-chip').click();
    await page.keyboard.press(key);
    await assertDeletionNotice();
    await notice.getByRole('button', {name:'Undo', exact:true}).click();
    result[`selectedTable${key}Undo`] = JSON.stringify(await grid(tables.last())) === JSON.stringify(beforeDelete) && await editorFocused();
  }

  // Saving, even a cancelled Reload, switching tabs and expiry revoke the action.
  const deleteLastTable = async () => {
    await tables.last().locator('td').first().click();
    await tables.last().getByRole('button', {name:'Delete table', exact:true}).click();
    await assertDeletionNotice();
  };
  const restoreWithKeyboard = async () => {
    await page.locator('[data-document-tab][data-active=true] .document-editor').click({position:{x:5,y:5}});
    await page.keyboard.press('Control+z');
    if (JSON.stringify(await grid(tables.last())) !== JSON.stringify(beforeDelete)) throw new Error('Keyboard Undo must restore the deleted table');
  };
  // Command history uses the keyboard keymap; it must also revoke the guarded notice action.
  const historyCommand = async name => {
    await page.keyboard.press('Control+Slash');
    const center = page.getByRole('dialog', {name:'Command center',exact:true});
    await center.getByRole('combobox').fill(`> ${name}`);
    await page.keyboard.press('Enter');
    await center.waitFor({state:'detached'});
  };
  await deleteLastTable();
  await historyCommand('Undo');
  result.commandUndoRestoresTableAndRevokesNotice = JSON.stringify(await grid(tables.last())) === JSON.stringify(beforeDelete) &&
    await editorFocused() && await notice.count() === 0;
  await historyCommand('Redo');
  result.commandRedoDoesNotReviveNoticeAction = await tables.count() === 1 && await editorFocused() &&
    await notice.getByRole('button', {name:'Undo',exact:true}).count() === 0;
  result.commandRedoKeepsReferenceWarning = (await notice.innerText()).includes('Deleting this target broke a reference.');
  await restoreWithKeyboard();
  await deleteLastTable();
  let releaseSource, sourceRequested;
  const sourceGate = new Promise(resolve => { releaseSource = resolve; });
  const sourceStarted = new Promise(resolve => { sourceRequested = resolve; });
  await page.route('**/api/document-source', async route => {
    sourceRequested();
    await sourceGate;
    await route.continue();
  });
  try {
    await page.getByTestId('view-source').click();
    await sourceStarted;
    result.sourcePendingClosesDeleteNotice = await notice.count() === 0;
  } finally {
    releaseSource();
    await page.locator('[data-document-tab][data-active=true]').getByTestId('source-view').waitFor();
    await page.unroute('**/api/document-source');
  }
  result.sourceClosesDeleteNotice = await notice.count() === 0;
  await page.getByTestId('view-visual').click();
  result.visualDoesNotReviveDeleteNotice = await notice.count() === 0 && await tables.count() === 1;
  if (!result.sourcePendingClosesDeleteNotice || !result.sourceClosesDeleteNotice || !result.visualDoesNotReviveDeleteNotice) {
    throw new Error(`Source must revoke table deletion Undo, including pending requests: ${JSON.stringify(result)}`);
  }
  await restoreWithKeyboard();
  await deleteLastTable();
  await reloadDocument(page);
  result.reloadClosesDeleteNotice = await notice.count() === 0;
  await page.getByRole('button', {name:'Keep editing', exact:true}).click();
  await restoreWithKeyboard();
  await deleteLastTable();
  result.saveDeletedTable = await save();
  result.saveClosesDeleteNotice = await notice.count() === 0;
  await restoreWithKeyboard();
  result.saveRestoredTable = await save();
  await deleteLastTable();
  const tableTab = page.getByRole('tab', {name:/^tables\.md/});
  await page.getByRole('tab').first().click();
  result.tabSwitchClosesDeleteNotice = await notice.count() === 0;
  await tableTab.click();
  result.returnDoesNotReviveDeleteNotice = await notice.count() === 0 && await tables.count() === 1;
  await restoreWithKeyboard();
  await deleteLastTable();
  await notice.waitFor({state:'detached', timeout:6500});
  result.deleteNoticeExpires = await tables.count() === 1;
  await restoreWithKeyboard();

  // The document still ends with this table, which has no line below it. ArrowDown from its last row and
  // a click below the document both reach one empty paragraph after it; empty, it changes nothing to save.
  const caret = () => page.evaluate(() => {
    const {state} = document.querySelector('[data-document-tab][data-active=true] .document-editor').editor;
    return `${state.selection.$from.parent.type.name} ${state.selection.$from.index(0) + 1}/${state.doc.childCount}`;
  });
  const caretIn = text => page.waitForFunction(text =>
    document.querySelector('[data-document-tab][data-active=true] .document-editor').editor.state.selection.$from.parent.textContent === text, text);
  const status = await page.getByTestId('status').innerText();
  await tables.last().locator('td', {hasText:/^P$/}).click();
  await caretIn('P');
  await page.keyboard.press('ArrowDown');
  result.arrowEntersCaption = (await caret()).startsWith('tableCaption ');
  await page.keyboard.press('End');
  await page.keyboard.press('ArrowDown');
  result.arrowLeavesFinalTable = await caret() === 'paragraph 5/5';
  await tables.last().locator('td', {hasText:/^U$/}).click();
  await caretIn('U');
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  const column = await page.locator('.document-column').boundingBox();
  await page.mouse.click(column.x + column.width / 2, Math.min(column.y + column.height, 720) - 8);
  result.clickBelowReachesEnd = await caret() === 'paragraph 5/5' &&
    await page.evaluate(() => document.querySelector('[data-document-tab][data-active=true] .document-editor').editor.view.hasFocus()) &&
    await page.getByTestId('status').innerText() === status;

  // Last-cell Tab reuses row authoring, including its history boundary and Save mapping.
  const beforeTab = await grid(tables.last());
  await tables.last().locator('td').last().click();
  await page.waitForFunction(() => {
    const {$from} = document.querySelector('[data-document-tab][data-active=true] .document-editor').editor.state.selection;
    return $from.parent.type.name === 'tableCell' && $from.index(1) === $from.node(1).childCount - ($from.node(1).lastChild.type.name === "tableCaption" ? 2 : 1) &&
      $from.index(2) === $from.node(2).childCount - 1;
  });
  await page.keyboard.press('Tab');
  result.lastTabAddsRow = (await grid(tables.last())).length === beforeTab.length + 1;
  if (!result.lastTabAddsRow) throw new Error('Last-cell Tab must add a table row');
  result.lastTabFocus = await page.evaluate(() => {
    const {view, state} = document.querySelector('[data-document-tab][data-active=true] .document-editor').editor;
    const {$from} = state.selection;
    return view.hasFocus() && $from.parent.type.name === 'tableCell' &&
      $from.index(1) === $from.node(1).childCount - ($from.node(1).lastChild.type.name === "tableCaption" ? 2 : 1) && $from.index(2) === 0;
  });
  await page.keyboard.type('Tab row');
  result.lastTabTyping = JSON.stringify((await grid(tables.last())).at(-1)) === JSON.stringify(['Tab row', '', '']);
  await page.keyboard.press('Control+z');
  result.lastTabOneUndo = JSON.stringify(await grid(tables.last())) === JSON.stringify(beforeTab);
  await page.keyboard.press('Control+Shift+z');
  const afterTab = await grid(tables.last());
  result.lastTabRedo = JSON.stringify(afterTab) === JSON.stringify([...beforeTab, ['Tab row', '', '']]);
  result.lastTabSave = await save();
  result.lastTabWritten = (await read()).includes('| Tab row |');
  await reloadDocument(page);
  await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
  result.lastTabReload = JSON.stringify(await grid(tables.last())) === JSON.stringify(afterTab);
  await tables.first().locator('th').first().click();
  await caretIn('Port');
  await page.keyboard.press('Shift+Tab');
  result.firstShiftTabLeavesTable = await page.evaluate(() =>
    document.querySelector('[data-document-tab][data-active=true] .document-editor').editor.state.selection.$from.parent.type.name !== 'tableCell');
  await tables.last().locator('td', {hasText:/^Tab row$/}).click();
  await caretIn('Tab row');
  await page.keyboard.press('Enter');
  result.enterLeavesTable = await caret() === 'paragraph 5/5' && JSON.stringify(await grid(tables.last())) === JSON.stringify(afterTab);

  page.off('console', onConsole);
  const failed = Object.entries(result).filter(([, value]) => value !== true);
  if (failed.length > 0) throw new Error(`Table authoring failed: ${JSON.stringify({result, file: await read()})}`);
  return result;
}
