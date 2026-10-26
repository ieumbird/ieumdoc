// Independent property drafts keep dirty status, focus and discard protection.
async (page, { openPath }) => {
  await page.unrouteAll();
  await page.reload();
  const ready = () => page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
  await ready();
  const origin = page.url().split('/').slice(0,3).join('/');
  const initial = await (await page.request.get(`${origin}/api/document`)).json();
  const sep = initial.path.includes('\\') ? '\\' : '/';
  const file = [...initial.path.split(sep).slice(0,-4), 'tmp', 'property-drafts', 'drafts.md'].join(sep);
  await openPath(page, file);
  await page.getByRole('dialog').waitFor({state:'detached'});
  const editor = page.locator('[data-document-tab][data-active=true] .document-editor');
  const json = () => editor.evaluate(element => JSON.stringify(element.editor.getJSON()));
  const baseline = await json();
  const check = (ok, reason) => { if (!ok) throw Error(reason); };
  const dirty = async () => {
    await page.waitForFunction(() => document.querySelector('[data-testid="status"]').textContent === 'Unsaved changes');
    check(await page.getByTestId('status').innerText() === 'Unsaved changes', 'Draft was omitted from dirty status');
    check(await page.evaluate(() => {
      const event = new Event('beforeunload', {cancelable:true}); window.dispatchEvent(event); return event.defaultPrevented;
    }), 'Draft was omitted from beforeunload');
  };
  const activate = async button => { await button.focus(); await button.press("Enter"); };
  // Base UI moves focus into the properties after they open.
  const focused = testId => page.waitForFunction(id => document.activeElement?.getAttribute('data-testid') === id, testId, {timeout:2000})
    .then(() => true, () => false);
  // Closing a form returns keyboard focus to the editor at its block, without a document change.
  const focusedAfter = kind => editor.evaluate((element, kind) => {
    const {selection, doc} = element.editor.state;
    let end;
    doc.forEach((node, pos) => { if (node.type.name === kind) end = pos + node.nodeSize; });
    return element.editor.view.hasFocus() && selection.empty &&
      (selection.from === end || (selection.from === end + 1 && selection.$from.parent.isTextblock));
  }, kind);
  const table = page.locator('[data-document-tab][data-active=true] [data-block="table"]');
  const beginTable = async () => { await table.hover(); await activate(table.getByRole('button', {name:'Edit table', exact:true})); };


  for (const entry of ['double-click', 'Enter']) {
    await table.hover({position:{x:4,y:4}});
    const metadata = table.locator('.block-metadata');
    const before = await json();
    await metadata.click();
    check(await page.getByTestId('table-editor').count() === 0, 'Table click opened properties');
    if (entry === 'double-click') await metadata.dblclick();
    else await page.keyboard.press('Enter');
    check(await focused('table-label'), `${entry} did not focus table label`);
    await page.getByTestId('table-label').fill('preserved-table-draft');
    await metadata.dblclick();
    check(await page.getByTestId('table-label').inputValue() === 'preserved-table-draft', 'Table re-entry discarded input');
    await page.getByTestId('table-cancel').click();
    await page.getByTestId('table-editor').waitFor({state:'detached'});
    check(await json() === before, 'Table entry changed content/history');
  }

  await editor.locator('h2').hover();
  await page.locator('[data-document-tab][data-active=true]').getByTestId('label-target-edit').click();
  check(await focused('label-target-input'), 'Edit did not focus the section label');
  await page.getByTestId('label-target-input').fill('section-draft');
  await dirty();
  await page.getByRole('button', {name:'File actions', exact:true}).click();
  await page.getByRole('menuitem', {name:'Reload', exact:true}).click();
  await page.getByRole('dialog', {name:'Discard local changes?'}).waitFor();
  await page.getByRole('button', {name:'Keep editing', exact:true}).click();
  check(await page.getByTestId('label-target-input').inputValue() === 'section-draft', 'Reload discarded section draft');
  await beginTable();
  check(await focused('table-label'), 'Edit did not focus the table label');
  await page.getByTestId('table-label').fill('table-draft');
  await activate(page.getByTestId('label-target-cancel'));
  await dirty();
  check(await page.getByTestId('table-label').inputValue() === 'table-draft', 'Closing one kind lost another');
  await activate(page.getByTestId('table-cancel'));
  await page.getByTestId('draft-notice').waitFor({state:'detached'});
  check(await json() === baseline && await page.getByTestId('status').innerText() === '', 'Cancel changed document or leaked registration');
  check(await focusedAfter('table'), 'Cancel did not return a caret after the table');
  await beginTable();
  check(await focused('table-label'), 'Edit did not focus the table label');
  await page.keyboard.press('Escape');
  await page.getByTestId('table-editor').waitFor({state:'detached'});
  await editor.locator('h2').hover();
  await page.locator('[data-document-tab][data-active=true]').getByTestId('label-target-edit').click();
  check(await focused('label-target-input'), 'Edit did not focus the section label');
  await page.keyboard.press('Escape');
  await page.getByTestId('label-target-editor').waitFor({state:'detached'});
  check(await focusedAfter('labelTarget') && await json() === baseline && await page.getByTestId('status').innerText() === '',
    'Escape did not return focus to its block, or changed the document');

  await appliedTyping();
  return {multipleKinds:true, reload:true, beforeunload:true, focus:true, appliedTyping:true};

  async function appliedTyping() {
    const focusFile = file.replace('drafts.md', 'focus.md');
    const cases = [
      {kind:'figure', type:'figure', field:'figure-label', first:'figure-image-url', value:'fig-applied', label:'fig-applied'},
      {kind:'table', type:'table', field:'table-label', first:'table-label', value:'tbl-applied', label:'tbl-applied'},
      {kind:'label-target', type:'labelTarget', field:'label-target-input', first:'label-target-input', value:'SECTION-A', label:'SECTION-A'},
    ];
    for (const item of cases) for (const mode of ['click', 'enter']) {
      // Start with a caret outside the target: a cell/caption caret would hide this defect.
      await openPath(page, focusFile);
      await page.getByText('Before.', {exact:true}).filter({visible:true}).click();
      const target = page.locator(`[data-document-tab][data-active=true] [data-block="${item.kind}"]`);
      if (item.type === 'labelTarget') {
        await editor.locator('h2').hover();
        await page.locator('[data-document-tab][data-active=true]').getByTestId('label-target-edit').click();
      } else {
        await target.hover({position:{x:4,y:4}});
        await target.getByRole('button', {name:item.kind === 'figure' ? 'Edit figure' : 'Edit table', exact:true}).click();
      }
      check(await focused(item.first), `${item.kind}: first field did not receive focus`);
      await page.getByTestId(item.field).fill(item.value);
      if (mode === 'click') await page.getByTestId(`${item.kind}-apply`).click();
      else await page.getByTestId(item.field).press('Enter');
      // Figure Apply validates asynchronously. Type as soon as its form has closed,
      // with no click or focus command between Apply and keyboard input.
      await page.getByTestId(`${item.kind}-editor`).waitFor({state:'detached'});
      const applied = await editor.evaluate((element, type) => element.editor.getJSON().content.find(node => node.type === type), item.type);
      check(applied, `${item.kind}/${mode}: Apply lost the target`);
      await page.keyboard.type('TypedProperties275');
      const typed = await editor.evaluate((element, type) => element.editor.getJSON().content.find(node => node.type === type), item.type);
      check(JSON.stringify(typed) === JSON.stringify(applied), `${item.kind}/${mode}: typing replaced or changed the target`);
      const ref = page.locator('[data-document-tab][data-active=true]').getByTestId('cross-reference').and(page.locator(`[data-label="${item.label}"]`));
      check(await ref.getAttribute('data-resolved') === 'true', `${item.kind}/${mode}: reference no longer resolves`);
      if (item.type === 'figure') {
        check(await target.locator('figcaption').innerText() === 'Caption.' &&
          await page.getByText('TypedProperties275After figure.', {exact:true}).filter({visible:true}).count() === 1, 'Figure caption or following prose was lost');
      } else if (item.type === 'table') {
        check(await target.locator('td').allTextContents().then(cells => cells.join('|')) === 'Value|V' &&
          await target.getByTestId('table-caption').innerText() === 'Values', 'Table grid or existing caption was lost');
        // Unlike outside focus, a caret already in a cell stays there after metadata Apply.
        await target.locator('td').first().click(); await page.keyboard.press('End');
        await page.waitForFunction(() => {
          const {selection} = document.querySelector('[data-document-tab][data-active=true] .document-editor').editor.state;
          return selection.empty && selection.$from.parent.type.name === 'tableCell' &&
            selection.$from.parent.textContent === 'Value' && selection.$from.parentOffset === selection.$from.parent.content.size;
        });
        const cellSelection = await editor.evaluate(element => element.editor.state.selection.toJSON());
        await target.hover({position:{x:4,y:4}});
        await target.getByRole('button', {name:'Edit table', exact:true}).click();
        check(await focused(item.first), 'Table field did not receive focus');
        await page.getByTestId(item.field).fill('cell-metadata');
        await page.getByTestId('table-apply').click();
        const restored = await editor.evaluate(element => ({selection:element.editor.state.selection.toJSON(), focus:element.editor.view.hasFocus()}));
        check(restored.focus && JSON.stringify(restored.selection) === JSON.stringify(cellSelection), 'Table Apply moved the cell caret: ' + JSON.stringify({cellSelection, restored}));
        await page.keyboard.type('Cell');
        check(await target.locator('td').first().innerText() === 'ValueCell', 'Cell typing left the table');
      } else {
        // The target must still directly label its heading; text belongs in that heading,
        // not in an inserted paragraph between the label and heading.
        check(await editor.locator('h2').innerText() === 'TypedProperties275Section' &&
          (await ref.innerText()).includes('TypedProperties275Section'), 'Section label lost its heading or live reference title');
      }
      // Finish this case explicitly: page reload retains its applied recovery record.
      await page.getByRole('button', {name:'Close focus.md', exact:true}).click();
      await page.getByRole('dialog', {name:'Save changes?', exact:true}).getByRole('button', {name:"Don't save", exact:true}).click();
      await page.getByRole('button', {name:'Close focus.md', exact:true}).waitFor({state:'detached'});
    }
  }
}
