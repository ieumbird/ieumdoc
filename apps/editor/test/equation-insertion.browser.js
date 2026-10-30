// Run with pnpm browser:test equation-insertion.
// Exercises new Equation insertion, draft guard, Cancel, Apply, Save, and reload.
async (page, { expect }) => {
  await page.unrouteAll();
  const origin = page.url().split('/').slice(0, 3).join('/');
  const loaded = await (await page.request.get(`${origin}/api/document`)).json();
  const saved = clone(loaded);
  const baselineEquationCount = saved.document.blocks.filter(block => block.block === 'equation').length;
  const baselineParagraphCount = saved.document.blocks.filter(block => block.block === 'paragraph' && block.editable).length;
  const requests = [];
  await page.route('**/api/document**', async route => {
    const request = route.request();
    if (request.method() === 'GET') return route.fulfill({json:saved});
    const body = request.postDataJSON();
    requests.push(body);
    const inserted = body.inserts?.find(insert => insert.block === 'equation');
    if (inserted) {
      const next = clone(saved.document.blocks);
      next.push({
        block: 'equation',
        path: [next.length + 1],
        latex: inserted.latex,
        label: '',
        editable: true,
      });
      saved.document.blocks = next;
      saved.revision = `equation-${requests.length}`;
    }
    return route.fulfill({json:saved});
  });

  // Where closing the form leaves keyboard focus: the editor and the top-level block of its selection.
  const editorFocus = () => page.evaluate(() => {
    const {editor} = document.querySelector('[data-document-tab][data-active=true] .document-editor');
    const {selection} = editor.state;
    const block = selection.node ?? selection.$from.node(1);
    return editor.view.hasFocus() && {block: block?.type.name, path: block?.attrs.sourcePath, caret: selection.empty && selection.$from.parent.isTextblock};
  });
  const caretAfterEquation = path => {
    const {editor} = document.querySelector('[data-document-tab][data-active=true] .document-editor');
    const {selection, doc} = editor.state;
    let end;
    doc.forEach((node, pos) => { if (node.type.name === 'equation' && node.attrs.sourcePath === path) end = pos + node.nodeSize; });
    return editor.view.hasFocus() && selection.empty &&
      (selection.from === end || (selection.from === end + 1 && selection.$from.parent.isTextblock));
  };

  try {
    await page.reload();
    await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
    // #470: rendered display math shares Edit's form, focus, dismissal and history.
    const documentEditor = page.locator('[data-document-tab][data-active=true] .document-editor');
    const snapshot = () => documentEditor.evaluate(element => element.editor.getJSON());
    const beforeShortcut = await snapshot();
    const prose = documentEditor.locator('p.paragraph').first();
    const prosePath = await prose.getAttribute('data-source-path');
    await prose.click();
    // #416 is a separate selection-sync limitation; establish the engine caret before
    // testing the body binding, rather than exercising click-to-key timing here.
    await page.waitForFunction(path => {
      const {selection} = document.querySelector('[data-document-tab][data-active=true] .document-editor').editor.state;
      return selection.empty && selection.$from.parent.type.name === 'paragraph' && selection.$from.parent.attrs.sourcePath === path;
    }, prosePath);
    await page.keyboard.press('End');
    await page.waitForFunction(path => {
      const {selection} = document.querySelector('[data-document-tab][data-active=true] .document-editor').editor.state;
      return selection.empty && selection.$from.parent.attrs.sourcePath === path && selection.$from.parentOffset === selection.$from.parent.content.size;
    }, prosePath);
    await page.keyboard.press('Control+Enter');
    expect(await documentEditor.evaluate(el => el.editor.state.selection.$from.nodeBefore?.type.name),
      'Prose Mod-Enter retains its hard break').toBe('hardBreak');
    await page.keyboard.press('ControlOrMeta+z');
    expect(await snapshot(), 'Hard break Undo restores the original document').toEqual(beforeShortcut);
    await page.keyboard.type(' History probe.');
    const withProbe = await snapshot();
    const existingEquation = documentEditor.locator('[data-block="equation"]').first();
    const existingPath = await existingEquation.getAttribute('data-source-path');
    const preview = existingEquation.getByTestId('equation-preview');
    await existingEquation.hover();
    await existingEquation.getByRole('button', {name:'Edit', exact:true}).click();
    expect(await page.getByTestId('equation-latex').count(), 'Metadata entry must not open the source form').toBe(0);
    await expect(page.getByTestId('equation-property-label')).toBeFocused();
    await page.getByTestId('equation-property-label').fill(' bad-label');
    await page.getByTestId('equation-edit-source').click();
    await expect(page.getByTestId('equation-property-label')).toHaveAttribute('aria-invalid','true');
    expect(await page.getByTestId('equation-latex').count(), 'Invalid metadata cannot open source').toBe(0);
    // Keyboard re-entry must not replace the metadata draft or clear its error.
    await preview.click({position:{x:8,y:8}});
    await page.keyboard.press('Enter');
    expect(await page.getByTestId('equation-property-label').inputValue()).toBe(' bad-label');
    expect(await snapshot()).toEqual(withProbe);
    await page.getByTestId('equation-property-label').press('Escape');
    await existingEquation.hover();
    await existingEquation.getByRole('button', {name:'Edit', exact:true}).click();
    await page.getByTestId('equation-property-label').fill('eq-pointer-source');
    // Finish metadata with the outside pointer, then use direct source entry.
    await preview.click({position:{x:8,y:8}});
    await page.getByTestId('equation-property-editor').waitFor({state:'detached'});
    await preview.dblclick({position:{x:8,y:8}});
    await expect(page.getByTestId('equation-latex')).toBeFocused();
    expect(await page.getByTestId('equation-label').inputValue(), 'Outside metadata completion precedes direct source entry').toBe('eq-pointer-source');
    await page.getByTestId('equation-cancel').click();
    await page.keyboard.press('ControlOrMeta+z');
    expect(await snapshot()).toEqual(withProbe);
    await existingEquation.hover();
    await existingEquation.getByRole('button', {name:'Edit', exact:true}).click();
    await page.getByTestId('equation-property-label').fill('eq-entry');
    await page.getByTestId('equation-property-editor').getByRole('button', {name:'Fixed',exact:true}).click();
    await page.getByTestId('equation-property-enumerator').fill('A.1');
    await page.getByTestId('equation-edit-source').click();
    await expect(page.getByTestId('equation-latex')).toBeFocused();
    expect(await page.getByTestId('equation-property-editor').count()).toBe(0);
    expect(await page.getByTestId('equation-label').inputValue()).toBe('eq-entry');
    const appliedMetadata = await snapshot();
    await page.getByTestId('equation-property-editor').waitFor({state:'detached'});
    const sourceNumber = page.getByTestId('equation-enumerator');
    await sourceNumber.fill('');
    await page.getByTestId('equation-apply').click();
    expect(await sourceNumber.getAttribute('aria-invalid'), 'Empty fixed number blocks source Apply').toBe('true');
    expect(await sourceNumber.evaluate(input => input === document.activeElement), 'Source Apply focuses the empty fixed number after metadata transition').toBe(true);
    expect(await snapshot(), 'Rejected source Apply preserves the applied metadata').toEqual(appliedMetadata);
    await sourceNumber.fill('A.1');
    await page.getByTestId('equation-latex').fill('Unapplied source');
    await page.getByTestId('equation-label').fill('unapplied-source-label');
    await prose.click();
    expect(await page.getByTestId('equation-latex').inputValue(), 'Outside pointer retains source draft').toBe('Unapplied source');
    expect(await existingEquation.getByRole('button', {name:'Edit',exact:true}).count(), 'Source edit hides metadata entry').toBe(0);
    await page.getByTestId('equation-cancel').click();
    expect(await snapshot(), 'Source Cancel keeps the preceding metadata Apply').toEqual(appliedMetadata);
    await page.keyboard.press('ControlOrMeta+z');
    expect(await snapshot(), 'Metadata and source use separate Apply boundaries').toEqual(withProbe);
    for (const close of ['cancel', 'escape']) {
      let editFocus;
      for (const entry of ['Edit', 'double-click', 'Enter']) {
        if (entry === 'Edit') {
          await preview.click({position:{x:8,y:8}});
          await existingEquation.getByRole('button', {name:'Edit', exact:true}).click();
          await page.getByTestId('equation-edit-source').click();
        } else if (entry === 'Enter') {
          await preview.click({position:{x:8,y:8}});
          await page.keyboard.press('Enter');
        } else await preview.dblclick({position:{x:8,y:8}});
        await expect(page.getByTestId('equation-latex'), `${entry} focuses LaTeX`).toBeFocused();
        expect(await snapshot(), `${entry} leaves document unchanged`).toEqual(withProbe);
        if (entry === 'double-click') {
          await page.getByTestId('equation-latex').fill('Unapplied double-click');
          await existingEquation.getByTestId('equation-edit-preview').dblclick({position:{x:8,y:8}});
          expect(await page.getByTestId('equation-latex').inputValue(), 'Already editing keeps the draft').toBe('Unapplied double-click');
        }
        if (close === 'cancel') await page.getByTestId('equation-cancel').click();
        else await page.getByTestId('equation-latex').press('Escape');
        await page.getByTestId('equation-editor').waitFor({state:'detached'});
        expect(await page.evaluate(caretAfterEquation, existingPath), `${entry} restores caret after Equation`).toBe(true);
        const focus = await editorFocus();
        if (entry === 'Edit') editFocus = focus;
        else expect(focus, `${close} restores the same caret as Edit`).toEqual(editFocus);
        expect(await snapshot()).toEqual(withProbe);
      }
    }
    await page.keyboard.press('ControlOrMeta+z');
    expect(await snapshot(), 'Opening/closing properties adds no Undo step').toEqual(beforeShortcut);
    await page.keyboard.press('ControlOrMeta+Shift+z');
    expect(await snapshot(), 'Opening properties preserves Redo').toEqual(withProbe);
    await page.keyboard.press('ControlOrMeta+z');

    // Create an empty transient paragraph with `+`, then use `/equation`.
    const insertButton = page.locator('button[aria-label^="Insert block after"]').first();
    await page.locator('[data-document-tab][data-active=true] .document-editor > .heading').first().hover();
    await insertButton.hover();
    await insertButton.click();
    await page.getByRole('menu', {name:'Insert block'}).getByRole('menuitem', {name:'Paragraph', exact:true}).click();
    await page.keyboard.type('/equation');
    await page.getByRole('menu', {name:'Insert block'}).getByRole('menuitem', {name:'Equation', exact:true}).click();
    await page.getByTestId('equation-editor').waitFor();
    await expect(page.getByTestId('equation-latex')).toBeFocused();
    const afterCancel = await page.locator('[data-document-tab][data-active=true] [data-block="equation"]').count();
    const noEmptyParagraphAfterSlash = await page.locator('[data-document-tab][data-active=true] [data-block="paragraph"]').count() === baselineParagraphCount;
    await page.getByTestId('equation-latex').fill('Unapplied');
    await page.getByTestId('save').click();
    await page.locator('[data-testid="status"][data-operation^="saved"]').waitFor({state:'attached'});
    const emptySaveKeepsDraft = requests.at(-1)?.inserts?.some(item => item.block === 'equation' && item.latex === '') &&
      await page.getByTestId('equation-latex').inputValue() === 'Unapplied' &&
      await page.getByTestId('status').innerText() === 'Unsaved changes';
    await page.getByTestId('equation-cancel').click();
    const cancelKeepsEmpty = await page.locator('[data-document-tab][data-active=true] [data-block="equation"]').count() === baselineEquationCount + 1;
    // Cancel keeps the saved empty structure and returns a caret after it.
    const cancelReturnsCaret = (await editorFocus()).caret === true;
    // Reset this mocked server fixture for the independent Apply/keyboard checks.
    saved.document.blocks = clone(loaded.document.blocks);
    saved.revision = loaded.revision;
    await page.reload();
    await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});

    await page.locator('[data-document-tab][data-active=true] .document-editor > .heading').first().hover();
    await insertButton.hover();
    await insertButton.click();
    await page.getByRole('menu', {name:'Insert block'}).getByRole('menuitem', {name:'Equation', exact:true}).click();
    const latex = page.getByTestId('equation-latex');
    await expect(latex).toBeFocused();
    await latex.fill('');
    await latex.press('Control+Enter');
    await page.getByTestId('equation-editor').waitFor({state:'detached'});
    const emptyEquation = page.locator('[data-document-tab][data-active=true] [data-block="equation"][data-source-path^="new:"]');
    expect(await emptyEquation.getByTestId('equation-empty').innerText()).toBe('Enter an equation');
    await emptyEquation.hover();
    await emptyEquation.getByRole('button',{name:'Edit',exact:true}).click();
    await page.getByTestId('equation-edit-source').click();
    await latex.fill('x');
    for (const key of ['Enter', 'Control+Shift+Enter', 'Control+Alt+Enter']) {
      await latex.press(key);
      expect(await page.getByTestId('equation-editor').count(), `${key} must not Apply`).toBe(1);
    }
    expect(await latex.inputValue(), 'Plain Enter remains a newline').toContain('\n');
    await latex.fill('x');
    await latex.dispatchEvent('keydown', {key:'Enter', code:'Enter', ctrlKey:true, isComposing:true});
    expect(await page.getByTestId('equation-editor').count(), 'Composition must not Apply').toBe(1);
    const saveAvailableBeforeApply = await page.getByTestId("save").isEnabled();
    await latex.press('Control+Enter');
    const newEquation = page.locator('[data-document-tab][data-active=true] [data-block="equation"][data-source-path^="new:"]');
    const newPath = await newEquation.getAttribute('data-source-path');
    const applyReturnsFocus = await page.evaluate(caretAfterEquation, newPath);
    // Clearing an applied new equation must close Apply and keep the empty block.
    await newEquation.hover();
    await newEquation.getByRole('button',{name:'Edit',exact:true}).click();
    await page.getByTestId('equation-edit-source').click();
    await page.getByTestId('equation-latex').fill('');
    await page.getByTestId('equation-apply').click();
    await page.getByTestId('equation-editor').waitFor({state:'detached'});
    expect(await newEquation.getByTestId('equation-empty').innerText()).toBe('Enter an equation');
    await newEquation.hover();
    await newEquation.getByRole('button',{name:'Edit',exact:true}).click();
    await page.getByTestId('equation-edit-source').click();
    await page.getByTestId('equation-latex').fill('x');
    await page.getByTestId('equation-apply').click();
    await newEquation.getByRole('button', {name:'Edit', exact:true}).locator('..').hover({position:{x:4,y:4}});
    await newEquation.getByRole('button', {name:'Edit', exact:true}).click();
    await page.getByTestId('equation-edit-source').click();
    await page.getByTestId('equation-latex').fill('x + 1');
    await page.getByTestId('equation-cancel').click();
    const appliedCancelKeepsBlock = await newEquation.count() === 1;
    const appliedCancelRestoresLatex = await newEquation.locator('[data-testid="equation-preview"]').count() === 1;
    // The returned caret no longer selects the Equation; reveal its tools before Edit.
    await newEquation.hover({position:{x:4,y:4}});
    await newEquation.getByRole('button', {name:'Edit', exact:true}).click();
    await page.getByTestId('equation-edit-source').click();
    await page.getByTestId('equation-latex').press('Escape');
    await page.getByTestId('equation-editor').waitFor({state:'detached'});
    // Closing the properties panel and handing focus back are separate browser tasks.
    await page.waitForFunction(caretAfterEquation, newPath);
    const escapeReturnsFocus = await page.evaluate(caretAfterEquation, newPath);
    await page.locator('.document-tab-row [data-testid="save"]:not([aria-disabled="true"])').waitFor();
    await page.getByRole('button', {name:'Save', exact:true}).click();
    await page.getByText('Saved', {exact:true}).filter({visible:true}).waitFor();
    const insert = requests.at(-1)?.inserts?.find(item => item.block === 'equation');
    await page.reload();
    await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
    const reloaded = await page.locator('[data-document-tab][data-active=true] [data-block="equation"]').count();
    const reloadedEquation = page.locator('[data-document-tab][data-active=true] [data-block="equation"]').last();
    await reloadedEquation.getByRole('button', {name:'Edit', exact:true}).locator('..').hover({position:{x:4,y:4}});
    await reloadedEquation.getByRole('button', {name:'Edit', exact:true}).click();
    await page.getByTestId('equation-edit-source').click();
    const reloadedLatex = await page.getByTestId('equation-latex').inputValue();
    await page.getByTestId('equation-cancel').click();
    const result = {
      menuHasEquation: true,
      enteredEditor: afterCancel === baselineEquationCount + 1,
      noEmptyParagraphAfterSlash,
      emptySaveKeepsDraft,
      cancelKeepsEmpty,
      cancelReturnsCaret,
      applyReturnsFocus,
      escapeReturnsFocus,
      saveAvailableBeforeApply,
      appliedCancelKeepsBlock,
      appliedCancelRestoresLatex,
      appliedAndSaved: insert?.latex === 'x',
      reloadKeptEquation: reloaded === baselineEquationCount + 1 && reloadedLatex === 'x',
    };
    for (const [name, passed] of Object.entries(result)) {
      if (!passed) throw new Error(`Equation insertion regression: ${name}`);
    }
    return result;
  } finally {
    await page.unroute('**/api/document**');
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }
}
