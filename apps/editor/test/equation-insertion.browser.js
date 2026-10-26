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
    await documentEditor.locator('p.paragraph').first().click();
    await page.keyboard.press('End');
    await page.keyboard.type(' History probe.');
    const withProbe = await snapshot();
    const existingEquation = documentEditor.locator('[data-block="equation"]').first();
    const existingPath = await existingEquation.getAttribute('data-source-path');
    const preview = existingEquation.getByTestId('equation-preview');
    for (const close of ['cancel', 'escape']) {
      let editFocus;
      for (const entry of ['Edit', 'double-click']) {
        if (entry === 'Edit') {
          await preview.click({position:{x:8,y:8}});
          await existingEquation.getByRole('button', {name:'Edit', exact:true}).click();
        } else await preview.dblclick({position:{x:8,y:8}});
        await expect(page.getByTestId('equation-latex'), `${entry} focuses LaTeX`).toBeFocused();
        expect(await snapshot(), `${entry} leaves document unchanged`).toEqual(withProbe);
        if (entry === 'double-click') {
          await page.getByTestId('equation-latex').fill('Unapplied double-click');
          await preview.dblclick({position:{x:8,y:8}});
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
    const afterCancel = await page.locator('[data-document-tab][data-active=true] [data-block="equation"]').count();
    const noEmptyParagraphAfterSlash = await page.locator('[data-document-tab][data-active=true] [data-block="paragraph"]').count() === baselineParagraphCount;
    await page.getByTestId('equation-latex').fill('Unapplied');
    await page.getByTestId('save').click();
    await page.locator('[data-testid="status"][data-operation^="saved"]').waitFor({state:'attached'});
    const placeholderSaveKeepsDraft = !requests.at(-1)?.inserts?.some(item => item.block === 'equation') &&
      await page.getByTestId('equation-latex').inputValue() === 'Unapplied' &&
      await page.getByTestId('status').innerText() === 'Unsaved changes';
    await page.getByTestId('equation-cancel').click();
    const cancelRemoved = await page.locator('[data-document-tab][data-active=true] [data-block="equation"]').count() === baselineEquationCount;
    // A caret where the Equation was, never a selection of the next block.
    const cancelReturnsCaret = (await editorFocus()).caret === true;

    await page.locator('[data-document-tab][data-active=true] .document-editor > .heading').first().hover();
    await insertButton.hover();
    await insertButton.click();
    await page.getByRole('menu', {name:'Insert block'}).getByRole('menuitem', {name:'Equation', exact:true}).click();
    await page.getByTestId('equation-latex').fill('x');
    const saveAvailableBeforeApply = await page.getByTestId("save").isEnabled();
    await page.getByTestId('equation-apply').click();
    const newEquation = page.locator('[data-document-tab][data-active=true] [data-block="equation"][data-source-path^="new:"]');
    const newPath = await newEquation.getAttribute('data-source-path');
    const applyReturnsFocus = await page.evaluate(caretAfterEquation, newPath);
    await newEquation.getByRole('button', {name:'Edit', exact:true}).locator('..').hover({position:{x:4,y:4}});
    await newEquation.getByRole('button', {name:'Edit', exact:true}).click();
    await page.getByTestId('equation-latex').fill('x + 1');
    await page.getByTestId('equation-cancel').click();
    const appliedCancelKeepsBlock = await newEquation.count() === 1;
    const appliedCancelRestoresLatex = await newEquation.locator('[data-testid="equation-preview"]').count() === 1;
    // The returned caret no longer selects the Equation; reveal its tools before Edit.
    await newEquation.hover({position:{x:4,y:4}});
    await newEquation.getByRole('button', {name:'Edit', exact:true}).click();
    await page.getByTestId('equation-latex').press('Escape');
    await page.getByTestId('equation-editor').waitFor({state:'detached'});
    // Closing the properties panel and handing focus back are separate browser tasks.
    await page.waitForFunction(caretAfterEquation, newPath);
    const escapeReturnsFocus = await page.evaluate(caretAfterEquation, newPath);
    await page.locator('.top-bar [data-testid="save"]:not([aria-disabled="true"])').waitFor();
    await page.getByRole('button', {name:'Save', exact:true}).click();
    await page.getByText('Saved', {exact:true}).filter({visible:true}).waitFor();
    const insert = requests.at(-1)?.inserts?.find(item => item.block === 'equation');
    await page.reload();
    await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
    const reloaded = await page.locator('[data-document-tab][data-active=true] [data-block="equation"]').count();
    const reloadedEquation = page.locator('[data-document-tab][data-active=true] [data-block="equation"]').last();
    await reloadedEquation.getByRole('button', {name:'Edit', exact:true}).locator('..').hover({position:{x:4,y:4}});
    await reloadedEquation.getByRole('button', {name:'Edit', exact:true}).click();
    const reloadedLatex = await page.getByTestId('equation-latex').inputValue();
    await page.getByTestId('equation-cancel').click();
    const result = {
      menuHasEquation: true,
      enteredEditor: afterCancel === baselineEquationCount + 1,
      noEmptyParagraphAfterSlash,
      placeholderSaveKeepsDraft,
      cancelRemoved,
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
