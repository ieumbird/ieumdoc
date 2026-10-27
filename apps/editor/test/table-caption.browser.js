// Rich caption editing must preserve every untouched inline element (#555).
async (page, { openPath, expect, reloadDocument, screenshots }) => {
  const origin = page.url().split('/').slice(0,3).join('/');
  const initial = await (await page.request.get(`${origin}/api/document`)).json();
  const separator = initial.path.includes('\\') ? '\\' : '/';
  const root = initial.path.split(separator).slice(0, -4).join(separator);
  const path = [root, 'tmp', 'table-caption', 'caption.md'].join(separator);
  const table = page.locator('[data-document-tab][data-active=true] [data-block="table"]');
  const caption = table.getByTestId('table-caption');
  const editor = page.locator('[data-document-tab][data-active=true] .document-editor');
  const tableJSON = () => editor.evaluate(element => {
    const table = JSON.parse(JSON.stringify(element.editor.getJSON().content.find(node => node.type === 'table')));
    if (table) delete table.attrs.sourcePath; // Opening-snapshot locators change when a moved document is reopened.
    return table;
  });
  const selectCaption = () => editor.evaluate(element => {
    const instance = element.editor;
    instance.state.doc.descendants((node,pos) => {
      if (node.type.name === 'tableCaption') instance.commands.setTextSelection({from:pos+1,to:pos+node.nodeSize-1});
    });
    instance.view.focus();
  });
  const save = async () => {
    await page.getByRole('button', {name:'Save',exact:true}).click();
    await page.getByText('Saved',{exact:true}).filter({visible:true}).waitFor();
    return (await (await page.request.get(`${origin}/document/caption.md?path=${encodeURIComponent(path)}`)).text()).replaceAll('\r\n','\n');
  };
  if (screenshots) {
    // Manual comparison only; the normal scenario below owns behavioral assertions.
    await openPath(page, [root, 'tmp', 'table-authoring', 'tables.md'].join(separator));
    const emptyTable = page.locator('[data-document-tab][data-active=true] [data-block="table"]').first();
    for (const width of [1440,640]) {
      await page.setViewportSize({width,height:900});
      await emptyTable.scrollIntoViewIfNeeded();
      await page.mouse.move(width-2,2);
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({path:`tmp/table-caption-577/after-${width}.png`});
    }
    return {manualCaptures:true};
  }
  await openPath(page, path);
  await table.hover();
  await table.getByRole('button', {name:'Edit table',exact:true}).click();
  const original = await tableJSON();
  // Baseline reproduction uses its actual property field; the fixed UI edits the same word in place.
  if (await page.getByTestId('table-caption-input').count()) {
    await page.getByTestId('table-caption-input').fill('Updated with fig-a, alpha and x^2');
    await page.getByTestId('table-apply').click();
  } else {
    expect(await page.getByTestId('table-editor').getByRole('textbox').count()).toBe(1);
    await page.getByTestId('table-cancel').click();
    await page.evaluate(() => {
      const editor = document.querySelector('[data-document-tab][data-active=true] .document-editor').editor;
      let range;
      editor.state.doc.descendants((node, pos) => {
        if (node.isText && node.text === 'Results') range = {from:pos,to:pos+node.nodeSize};
      });
      editor.commands.setTextSelection(range);
      editor.view.focus();
    });
    await page.keyboard.type('Updated');
    const updated = await tableJSON();
    await page.keyboard.press('ControlOrMeta+z');
    expect(await tableJSON(), 'Undo restores the complete rich caption').toEqual(original);
    await page.keyboard.press('ControlOrMeta+Shift+z');
    expect(await tableJSON(), 'Redo preserves inline atoms and formatting').toEqual(updated);
  }
  const saved = await save();
  expect(saved, 'Editing one caption word must preserve emphasis, reference, citation and math').toContain(
    '**Updated** with {numref}`fig-a`, {cite:p}`alpha` and $x^2$');
  expect(await page.getByTestId('table-caption-input').count(), 'Caption editing belongs in the document').toBe(0);
  await reloadDocument(page);
  expect(await caption.locator('strong').innerText()).toBe('Updated');
  expect(await caption.getByTestId('cross-reference').getAttribute('data-resolved')).toBe('true');
  expect(await caption.locator('.citation').count()).toBe(1);
  expect(await caption.locator('.katex').count()).toBe(1);
  // Native keys enter the caption from the final grid row, return to the grid, then leave the table.
  await table.locator('td').last().click();
  await page.waitForFunction(() => document.querySelector('[data-document-tab][data-active=true] .document-editor').editor.state.selection.$from.parent.type.name === 'tableCell');
  await page.keyboard.press('End');
  await page.keyboard.press('ArrowDown');
  const parent = () => editor.evaluate(element => element.editor.state.selection.$from.parent.type.name);
  expect(await parent()).toBe('tableCaption');
  await page.keyboard.press('ArrowUp');
  expect(await parent()).toBe('tableCell');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  expect(await parent()).toBe('paragraph');

  // Selection and slash authoring share the body's existing rich inline controls.
  await selectCaption();
  await page.getByTestId('selection-toolbar').waitFor();
  expect(await page.getByTestId('selection-toolbar').getByRole('button',{name:/^Bold/}).isVisible()).toBe(true);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.type(' /fig');
  await page.getByRole('menuitem',{name:/^Figure.*fig-a$/}).click();
  expect(await caption.getByTestId('cross-reference').count()).toBe(2);
  // Restore the saved snapshot before testing whole-table operations.
  await reloadDocument(page);
  await page.getByRole('button',{name:'Discard and reload',exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'detached'});
  const rich = await tableJSON();
  const index = await editor.evaluate(element => element.editor.getJSON().content.findIndex(node => node.type === 'table'));
  await page.locator('[data-document-tab][data-active=true] .block-handle').nth(index).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('menuitem',{name:'Move down',exact:true}).click();
  expect(await tableJSON(), 'Moving the table keeps its caption attached').toEqual(rich);
  const movedFile = await save();
  expect(movedFile.indexOf('After.')).toBeLessThan(movedFile.indexOf(':::{table}'));
  await reloadDocument(page);
  expect(await tableJSON()).toEqual(rich);
  await table.hover();
  await table.getByRole('button',{name:'Delete table',exact:true}).click();
  expect(await caption.count()).toBe(0);
  await page.keyboard.press('ControlOrMeta+z');
  expect(await tableJSON(), 'One Undo restores the table and rich caption').toEqual(rich);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  expect(await table.count()).toBe(0);
  await page.keyboard.press('ControlOrMeta+z');

  // Empty captions remain directly editable through Save/Reload, without a discovery action.
  await selectCaption();
  await page.keyboard.press('Backspace');
  await page.keyboard.press('ControlOrMeta+z');
  expect(await tableJSON(), 'Clearing the caption is undoable without changing the grid').toEqual(rich);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await table.getByLabel('Table caption',{exact:true}).click();
  expect(await caption.count(), 'An empty caption keeps its caret surface').toBe(1);
  const cleared = await save();
  expect(cleared).toContain(':::{table}\n:name: tbl-a');
  expect(cleared).not.toContain('**Updated**');
  await reloadDocument(page);
  expect(await caption.count()).toBe(1);
  expect(await caption.getAttribute('data-number')).toBe('Table 1');
  await table.hover();
  await table.getByRole('button',{name:'Edit table',exact:true}).click();
  await page.getByTestId('table-label').fill('');
  await page.getByTestId('table-apply').click();
  expect(await table.locator('.block-kind').textContent()).toBe('Table 1');
  expect(await caption.getAttribute('data-number'), 'Clearing the label keeps the official number immediately').toBe('Table 1');
  expect(await save()).toContain(':::{table}\n\n');
  await reloadDocument(page);
  expect(await caption.getAttribute('data-number'), 'Every table keeps its official number after Reload').toBe('Table 1');
  expect(await table.getByRole('button',{name:'Add caption',exact:true}).count()).toBe(0);
  const empty = await tableJSON();
  expect(await editor.evaluate(element => element.editor.can().undo()), 'Opening an empty caption creates no history').toBe(false);
  expect(await page.getByRole('tab',{selected:true}).getAttribute('aria-label')).not.toContain('Unsaved changes');
  await editor.evaluate(element => element.editor.setEditable(false));
  await expect(table.getByLabel('Table caption',{exact:true})).not.toHaveAttribute('data-placeholder');
  await editor.evaluate(element => element.editor.setEditable(true));
  await expect(table.getByLabel('Table caption',{exact:true})).toHaveAttribute('data-placeholder','Table caption');
  expect(await tableJSON(), 'Editable transitions preserve document content').toEqual(empty);
  expect(await editor.evaluate(element => element.editor.can().undo()), 'Editable transitions create no history').toBe(false);
  await table.locator('td').last().click();
  await page.waitForFunction(() => document.querySelector('[data-document-tab][data-active=true] .document-editor').editor.state.selection.$from.parent.type.name === 'tableCell');
  await page.keyboard.press('End');
  await page.keyboard.press('ArrowDown');
  expect(await parent(), 'ArrowDown also enters an empty caption').toBe('tableCaption');
  await page.keyboard.press('ArrowUp');
  expect(await parent()).toBe('tableCell');
  await table.getByLabel('Table caption',{exact:true}).click();
  expect(await parent(), 'Clicking the empty surface places the engine caret immediately').toBe('tableCaption');
  await page.keyboard.press('Shift+Enter');
  expect(await tableJSON(), 'Captions refuse line breaks').toEqual(empty);
  await page.keyboard.type('Restored caption');
  expect(await caption.getAttribute('data-number')).toBe('Table 1');
  const restored = await tableJSON();
  await page.keyboard.press('ControlOrMeta+z');
  expect(await tableJSON(), 'One Undo returns to the original empty surface').toEqual(empty);
  expect(await caption.getAttribute('data-number'), 'Undoing caption entry does not remove the number').toBe('Table 1');
  await page.keyboard.press('ControlOrMeta+Shift+z');
  expect(await tableJSON()).toEqual(restored);
  expect(await save()).toContain(':::{table} Restored caption');
  await reloadDocument(page);
  expect(await caption.innerText()).toBe('Restored caption');
  return {richCaptionPreserved:true,history:true,keyboard:true,moveDelete:true,removeAdd:true,saveReload:true};
}
