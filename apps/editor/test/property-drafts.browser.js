// Independent property drafts keep dirty status, focus and discard protection.
async (page, { openPath, expect }) => {
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
  const beginTable = async () => {
    // Another retained popover can cover Table's pointer entry. Select through the
    // public engine command, then use its supported keyboard property entry.
    await editor.evaluate(element => {
      element.editor.state.doc.forEach((node, pos) => {
        if (node.type.name === 'table') element.editor.commands.setNodeSelection(pos);
      });
      element.editor.view.focus();
    });
    await page.keyboard.press('Enter');
  };


  for (const entry of ['double-click', 'Enter']) {
    await table.hover({position:{x:4,y:4}});
    const metadata = table.locator('.block-metadata');
    const before = await json();
    await metadata.click({position:{x:1,y:4}});
    check(await page.getByTestId('table-editor').count() === 0, 'Table number click opened properties');
    if (entry === 'double-click') await metadata.dblclick({position:{x:1,y:4}});
    else await page.keyboard.press('Enter');
    check(await focused('table-label'), `${entry} did not focus table label`);
    await page.getByTestId('table-label').fill('preserved-table-draft');
    await editor.focus();
    await page.keyboard.press("Enter");
    check(await page.getByTestId('table-label').inputValue() === 'preserved-table-draft', 'Table re-entry discarded input');
    await page.getByTestId('table-label').press('Escape');
    await page.getByTestId('table-editor').waitFor({state:'detached'});
    check(await json() === before, 'Table entry changed content/history');
  }

  await editor.locator('h2').hover();
  await page.locator('[data-document-tab][data-active=true]').getByTestId('label-target-edit').click();
  check(await focused('label-target-input'), 'Edit did not focus the section label');
  await page.getByTestId('label-target-input').fill('section-draft');
  await dirty();
  await activate(page.getByRole('button', {name:'File actions', exact:true}));
  await activate(page.getByRole('menuitem', {name:'Reload', exact:true}));
  await page.getByRole('dialog', {name:'Discard local changes?'}).waitFor();
  await activate(page.getByRole('button', {name:'Keep editing', exact:true}));
  await page.getByRole('dialog', {name:'Discard local changes?'}).waitFor({state:'detached'});
  await page.getByRole('button', {name:'File actions', exact:true}).and(page.locator(':focus')).waitFor();
  check(await page.getByTestId('label-target-input').inputValue() === 'section-draft', 'Reload discarded section draft');
  await beginTable();
  check(await focused('table-label'), 'Edit did not focus the table label');
  await page.getByTestId('table-label').fill('table-draft');
  await page.getByTestId('label-target-input').press('Escape');
  await dirty();
  check(await page.getByTestId('table-label').inputValue() === 'table-draft', 'Closing one kind lost another');
  await page.getByTestId('table-label').press('Escape');
  await page.getByTestId('draft-indicator').waitFor({state:'detached'});
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

  await dialogDrafts();
  await metadataCompletion();
  await appliedTyping();
  return {multipleKinds:true, reload:true, beforeunload:true, focus:true, appliedTyping:true};

  async function dialogDrafts() {
    const focusFile = file.replace('drafts.md', 'focus.md');
    for (const [kind, field, first] of [['figure','figure-label','figure-replace'], ['table','table-label','table-label'], ['label-target','label-target-input','label-target-input'], ['equation-property','equation-property-label','equation-property-label']]) {
      await openPath(page, focusFile);
      const active = page.locator('[data-document-tab][data-active=true]');
      const target = active.locator(`[data-block="${kind === 'equation-property' ? 'equation' : kind}"]`);
      const before = await json();
      if (kind === 'label-target') {
        await editor.locator('h2').hover();
        await active.getByTestId('label-target-edit').click();
      } else {
        await target.hover({position:{x:4,y:4}});
        await target.getByRole('button',{name:kind === 'figure' ? 'Edit figure' : kind === 'table' ? 'Edit table' : 'Edit',exact:true}).click();
      }
      check(await focused(first), `${kind}: opening dialog draft focus`);
      const draft = `${kind}-dialog-draft`;
      await page.getByTestId(field).fill(draft);
      const retained = async action => {
        expect(await json(), `${kind}/${action}: dialog click changed applied content or references`).toBe(before);
        expect(await page.getByTestId(`${kind}-editor`).count(), `${kind}/${action}: dialog click closed metadata`).toBe(1);
        expect(await page.getByTestId(field).inputValue(), `${kind}/${action}: dialog click lost the draft`).toBe(draft);
      };
      const tab = page.getByRole('tab',{selected:true});
      await tab.focus(); await tab.press('Delete');
      const closeDialog = page.getByRole('dialog',{name:'Save changes?',exact:true});
      await closeDialog.getByRole('button',{name:'Cancel',exact:true}).click();
      await closeDialog.waitFor({state:'detached'});
      await tab.and(page.locator(':focus')).waitFor();
      await retained('close Cancel');

      const fileActions = page.getByRole('button',{name:'File actions',exact:true});
      await activate(fileActions);
      await activate(page.getByRole('menuitem',{name:'Reload',exact:true}));
      const reloadDialog = page.getByRole('dialog',{name:'Discard local changes?',exact:true});
      await reloadDialog.getByRole('button',{name:'Keep editing',exact:true}).click();
      await reloadDialog.waitFor({state:'detached'});
      await fileActions.and(page.locator(':focus')).waitFor();
      await retained('Reload Keep editing');

      await activate(page.getByRole('button',{name:'Settings',exact:true}));
      const settings = page.getByTestId('settings-dialog');
      await page.getByTestId('settings-back').and(page.locator(':focus')).waitFor();
      await settings.getByRole('button',{name:'Saving & recovery',exact:true}).click();
      await retained('Settings category');
      await settings.getByTestId('settings-back').click();
      await settings.waitFor({state:'detached'});
      await page.getByRole('button',{name:'Settings',exact:true}).and(page.locator(':focus')).waitFor();
      await retained('Settings Back to document');

      await page.getByTestId(field).press('Escape');
      await page.getByTestId(`${kind}-editor`).waitFor({state:'detached'});
      expect(await json()).toBe(before);
      await page.getByRole('button',{name:'Close focus.md',exact:true}).click();
      await page.getByRole('button',{name:'Close focus.md',exact:true}).waitFor({state:'detached'});
    }
  }

  async function metadataCompletion() {
    const focusFile = file.replace('drafts.md', 'focus.md');
    for (const [kind, type, field] of [['table','table','table-label'], ['label-target','labelTarget','label-target-input'], ['equation-property','equation','equation-property-label']]) {
      await openPath(page, focusFile);
      const active = page.locator('[data-document-tab][data-active=true]');
      const target = active.locator(`[data-block="${type === 'equation' ? 'equation' : kind}"]`);
      const attrs = () => editor.evaluate((element, type) => element.editor.getJSON().content.find(node => node.type === type).attrs, type);
      const original = await attrs();
      const begin = async () => {
        if (kind === 'table' || type === 'equation') {
          await target.hover({position:{x:4,y:4}});
          await activate(target.getByRole('button', {name:kind === 'table' ? 'Edit table' : 'Edit',exact:true}));
        } else {
          await editor.locator('h2').hover();
          await activate(active.getByTestId('label-target-edit'));
        }
        check(await focused(field), `${kind}: opening focus`);
      };
      await begin();
      await expect(page.getByTestId(`${kind}-apply`)).toHaveText('Done');
      await expect(page.getByTestId(`${kind}-cancel`)).toHaveCount(0);
      await page.getByTestId(field).fill(' bad-label');
      await page.getByText('Before.', {exact:true}).filter({visible:true}).click({position:{x:20,y:12}});
      await expect(page.getByTestId(field)).toHaveAttribute('aria-invalid','true');
      expect(await page.getByTestId(field).inputValue()).toBe(' bad-label');
      expect(await attrs()).toEqual(original);
      // A Core rename collision follows the same retained-draft path.
      await page.getByTestId(field).fill('fig-a');
      await page.getByTestId(`${kind}-apply`).click();
      await expect(page.getByTestId(field)).toHaveAttribute('aria-invalid','true');
      expect(await attrs()).toEqual(original);
      await page.getByTestId(field).fill(`${kind}-done`);
      if (kind === 'table' || type === 'equation') {
        await page.getByTestId(`${kind}-editor`).getByRole('button',{name:'Fixed',exact:true}).click();
        await page.getByText('Before.', {exact:true}).filter({visible:true}).click({position:{x:20,y:12}});
        await expect(page.getByTestId(`${kind}-enumerator`)).toHaveAttribute('aria-invalid','true');
        expect(await attrs()).toEqual(original);
        await page.getByTestId(`${kind}-editor`).getByRole('button',{name:'Automatic',exact:true}).click();
        if (type === 'equation') {
          await page.getByTestId(`${kind}-editor`).getByRole('button',{name:'Fixed',exact:true}).click();
          await page.getByTestId(`${kind}-enumerator`).fill('E.8');
        }
      }
      await page.getByTestId(`${kind}-apply`).click();
      await page.getByTestId(`${kind}-editor`).waitFor({state:'detached'});
      expect((await attrs()).label).toBe(`${kind}-done`);
      if (type === 'equation') expect(await attrs()).toEqual({...original, label:`${kind}-done`, enumerator:'E.8'});
      await begin();
      await page.getByTestId(field).fill(`${kind}-keyboard-draft`);
      // Keyboard Save saves only applied state and leaves the metadata draft open.
      const saved = page.waitForResponse(response => response.url().includes('/api/document') && response.request().method() === 'POST');
      await activate(page.getByRole('button',{name:'Save',exact:true}));
      expect((await saved).ok()).toBe(true);
      expect((await attrs()).label).toBe(`${kind}-done`);
      expect(await page.getByTestId(field).inputValue()).toBe(`${kind}-keyboard-draft`);
      const disk = await (await page.request.get(`${origin}/document/focus.md?path=${encodeURIComponent(focusFile)}`)).text();
      expect(disk).toContain(`${kind}-done`);
      if (type === 'equation') {
        expect(disk).toContain(':enumerator: E.8');
        expect(disk).toContain('{eq}`equation-property-done`');
      }
      expect(disk).not.toContain(`${kind}-keyboard-draft`);
      await page.getByTestId(field).press('Escape');
      expect((await attrs()).label).toBe(`${kind}-done`);
      await begin();
      await page.getByTestId(field).fill(`${kind}-outside`);
      await page.getByText('Before.', {exact:true}).filter({visible:true}).click({position:{x:20,y:12}});
      await page.getByTestId(`${kind}-editor`).waitFor({state:'detached'});
      expect((await attrs()).label).toBe(`${kind}-outside`);
      check(await editor.evaluate(element => element.editor.view.hasFocus() && element.editor.state.selection.$from.parent.textContent === 'Before.'),
        `${kind}: pointer completion stole the native prose caret`);
      await page.keyboard.press('End');
      await page.keyboard.type(' Native791');
      expect(await page.getByText('Before. Native791',{exact:true}).filter({visible:true}).count()).toBe(1);
      await begin();
      await page.getByTestId(field).fill(`${kind}-pointer-tab`);
      const panelId = await active.getAttribute('data-document-tab');
      const ownedPanel = page.locator(`[data-document-tab="${panelId}"]`);
      await page.getByRole('tab',{name:'drafts.md',exact:true}).click();
      // Pointer completion must finish even when that click hides its document.
      await expect(ownedPanel.locator(`[data-block="${type === 'equation' ? 'equation' : kind}"]`)).toHaveAttribute('data-editing','false');
      expect(await ownedPanel.locator('.document-editor').evaluate((element, type) => element.editor.getJSON().content.find(node => node.type === type).attrs.label, type)).toBe(`${kind}-pointer-tab`);
      await activate(page.getByRole('tab',{name:'focus.md, Unsaved changes',exact:true}));
      expect(await page.getByTestId(`${kind}-editor`).count()).toBe(0);
      await page.getByRole('button',{name:'Close focus.md',exact:true}).click();
      await page.getByRole('dialog',{name:'Save changes?',exact:true}).getByRole('button',{name:"Don't save",exact:true}).click();
      await page.getByRole('button',{name:'Close focus.md',exact:true}).waitFor({state:'detached'});
    }
  }

  async function appliedTyping() {
    const focusFile = file.replace('drafts.md', 'focus.md');
    const cases = [
      {kind:'figure', type:'figure', field:'figure-label', first:'figure-replace', value:'fig-applied', label:'fig-applied'},
      {kind:'table', type:'table', field:'table-label', first:'table-label', value:'tbl-applied', label:'tbl-applied'},
      {kind:'label-target', type:'labelTarget', field:'label-target-input', first:'label-target-input', value:'SECTION-A', label:'SECTION-A'},
    ];
    for (const item of cases) for (const mode of ['click', 'enter', 'shortcut']) {
      // Start with a caret outside the target: a cell/caption caret would hide this defect.
      await openPath(page, focusFile);
      await page.getByText('Before.', {exact:true}).filter({visible:true}).click({position:{x:20,y:12}});
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
      if (mode === 'shortcut' && item.kind === 'figure') {
        let release, requested;
        let validations = 0;
        const gate = new Promise(resolve => { release = resolve; });
        const started = new Promise(resolve => { requested = resolve; });
        const hold = async route => { validations++; requested(); await gate; await route.continue(); };
        await page.route('**/api/figure-validation', hold);
        try {
          await page.getByTestId(item.field).press('Control+Enter');
          await started;
          check(await page.getByTestId('figure-apply').isDisabled(), 'Figure Apply is not busy');
          await page.getByTestId(item.field).press('Control+Enter');
          check(validations === 1, 'Busy shortcut submitted another validation');
        } finally { release(); }
        await page.getByTestId('figure-editor').waitFor({state:'detached'});
        await page.unroute('**/api/figure-validation', hold);
      } else if (mode === 'click') await page.getByTestId(`${item.kind}-apply`).click();
      else await page.getByTestId(item.field).press(mode === 'shortcut' ? 'Control+Enter' : 'Enter');
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
