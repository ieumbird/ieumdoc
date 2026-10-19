// Run with pnpm exec playwright-cli run-code --filename=apps/editor/test/equation-save-during-edit.browser.js.
// Delayed-save drafts, then real scratch-file Apply/typing/history/Source/Save/Reload.
async (page, { openDocument }) => {
  await page.unroute('**/api/document');
  await page.reload();
  await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
  const origin = page.url().split('/').slice(0, 3).join('/');
  const loaded = await (await page.request.get(`${origin}/api/document`)).json();
  const originalLatex = loaded.document.blocks.find(block => block.block === 'equation').latex;
  let current = clone(loaded);
  let requests = [];
  let release;
  let gate;
  const resetCycle = () => {
    requests = [];
    current = clone(loaded);
    gate = new Promise(resolve => { release = resolve; });
  };
  resetCycle();
  await page.route('**/api/document', async route => {
    if (route.request().method() === 'GET') return route.fulfill({json: current});
    const request = route.request().postDataJSON();
    requests.push(request);
    if (requests.length === 1) {
      await gate;
      return route.fulfill({json: current});
    }
    if (requests.length === 2) {
      const equation = request.equations?.[0];
      if (equation) {
        current = clone(loaded);
        current.document.blocks.find(block => block.path[0] === equation.path[0]).latex = equation.to;
        current.revision = 'equation-saved-revision';
      }
      return route.fulfill({json: current});
    }
    return route.fulfill({status:409,json:{error:'Unexpected save'}});
  });

  const changedLatex = `${originalLatex} + 1`;
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await page.getByRole('button',{name:'Edit',exact:true}).locator('..').hover({position:{x:4,y:4}});
  await page.getByRole('button',{name:'Edit',exact:true}).click();
  await page.getByTestId('equation-latex').fill(changedLatex);
  const beforeResponse = await page.getByTestId('equation-latex').inputValue();
  release();
  await page.getByText('Unsaved changes',{exact:true}).filter({visible:true}).waitFor();
  const afterResponse = await page.getByTestId('equation-latex').inputValue();
  const editorDuringDraft = await page.getByTestId('equation-editor').count();
  if (beforeResponse !== changedLatex || afterResponse !== changedLatex || editorDuringDraft !== 1) {
    throw new Error('Equation draft or editing state was lost after the delayed save');
  }

  await page.getByTestId('equation-apply').click();
  if (!requests[0] || requests[0].equations?.length) throw new Error('Initial save unexpectedly included the draft');
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await page.getByText('Saved',{exact:true}).filter({visible:true}).waitFor();
  if (requests[1].equations?.[0]?.to !== changedLatex) throw new Error('Applied Equation was omitted from the next save');
  await page.reload();
  await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
  await page.getByRole('button',{name:'Edit',exact:true}).locator('..').hover({position:{x:4,y:4}});
  await page.getByRole('button',{name:'Edit',exact:true}).click();
  if (await page.getByTestId('equation-latex').inputValue() !== changedLatex) {
    throw new Error('Applied Equation was not reflected after reload');
  }

  resetCycle();
  await page.reload();
  await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
  const canceledLatex = `${originalLatex} + 2`;
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await page.getByRole('button',{name:'Edit',exact:true}).locator('..').hover({position:{x:4,y:4}});
  await page.getByRole('button',{name:'Edit',exact:true}).click();
  await page.getByTestId('equation-latex').fill(canceledLatex);
  release();
  await page.getByText('Unsaved changes',{exact:true}).filter({visible:true}).waitFor();
  if (await page.getByTestId('equation-latex').inputValue() !== canceledLatex) {
    throw new Error('Canceled draft was lost before Cancel');
  }
  await page.getByTestId('equation-cancel').click();
  if (await page.getByTestId('equation-editor').count() !== 0) throw new Error('Equation editor remained open after Cancel');
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await page.getByText('Saved',{exact:true}).filter({visible:true}).waitFor();
  if (requests[1].equations?.length) throw new Error('Canceled Equation was included in the next save');
  await page.reload();
  await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
  await page.getByRole('button',{name:'Edit',exact:true}).locator('..').hover({position:{x:4,y:4}});
  await page.getByRole('button',{name:'Edit',exact:true}).click();
  const reloadedCanceled = await page.getByTestId('equation-latex').inputValue();
  if (reloadedCanceled !== originalLatex) throw new Error('Cancel did not preserve the original Equation');

  await page.unroute('**/api/document');
  await appliedTyping();
  return {
    draftRetained: afterResponse === changedLatex,
    editUiRetained: editorDuringDraft === 1,
    appliedAndReloaded: true,
    canceledAndReloaded: reloadedCanceled === originalLatex,
    appliedTypingAndPersistence: true,
  };

  async function appliedTyping() {
    const sep = loaded.path.includes('\\') ? '\\' : '/';
    const root = loaded.path.split(sep).slice(0, -4).join(sep);
    const snapshot = () => page.locator('[data-document-tab][data-active=true] .document-editor').evaluate(element => element.editor.getJSON());
    const source = async () => {
      await page.getByTestId('view-source').click();
      await page.locator('[data-document-tab][data-active=true]').getByTestId('source-view').waitFor();
      const text = (await page.locator('[data-document-tab][data-active=true]').getByTestId('source-view').locator('pre').textContent()).replaceAll('\r\n', '\n');
      await page.getByTestId('view-visual').click();
      return text;
    };
    for (const {file, mode, label} of [
      {file:'math.md', mode:'click', label:'eq-a'},
      {file:'middle.md', mode:'label-enter', label:'EQ-A'},
      {file:'only.md', mode:'button-enter', label:'eq-a'},
    ]) {
      await page.reload();
      await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
      const path = [root, 'tmp', 'equation-editing', file].join(sep);
      await openDocument(page, path);
      await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
      const initial = await snapshot();
      const equation = page.locator('[data-document-tab][data-active=true] [data-block="equation"]').first();
      const reference = page.locator('[data-document-tab][data-active=true]').getByTestId('cross-reference');
      const assertContent = async expected => {
        const actual = await snapshot();
        if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${file}: equation, reference or surrounding content changed`);
        if (file !== 'only.md' && await reference.getAttribute('data-resolved') !== 'true') {
          throw new Error(`${file}: equation reference no longer resolves`);
        }
      };
      await equation.hover();
      await equation.getByRole('button', {name:'Edit', exact:true}).click();
      await page.waitForFunction(() => document.activeElement?.getAttribute('data-testid') === 'equation-latex');
      await page.getByTestId('equation-latex').fill('x + 1');
      await page.getByTestId('equation-label').fill(label);
      const applied = clone(initial);
      Object.assign(applied.content.find(node => node.type === 'equation').attrs, {latex:'x + 1', label});
      if (mode === 'click') await page.getByTestId('equation-apply').click();
      else await page.getByTestId(mode === 'label-enter' ? 'equation-label' : 'equation-apply').press('Enter');
      await assertContent(applied);
      const caret = await page.locator('[data-document-tab][data-active=true] .document-editor').evaluate(element => {
        const {editor} = element;
        return editor.view.hasFocus() && editor.state.selection.empty;
      });
      if (!caret) throw new Error(`${file}: Apply did not return an editor caret`);
      // No click/refocus between Apply and real keyboard input. A selection of the atom
      // would replace it; a gap cursor also covers a final or sole Equation.
      await page.keyboard.type('Typed275');
      const typed = await snapshot();
      if (typed.content.find(node => node.type === 'equation')?.attrs.latex !== 'x + 1') {
        throw new Error(`${file}: typing immediately after Apply replaced the equation`);
      }
      if (file === 'middle.md') {
        const after = applied.content.at(-1);
        after.content[0].text = 'Typed275' + after.content[0].text;
      } else {
        applied.content.push(clone(typed.content.at(-1)));
        if (typed.content.at(-1).type !== 'paragraph' || typed.content.at(-1).content?.[0]?.text !== 'Typed275') {
          throw new Error(`${file}: typing did not create prose after the equation`);
        }
      }
      await assertContent(applied);
      await page.keyboard.press('Control+z');
      const undone = await snapshot();
      if (!undone.content.some(node => node.type === 'equation') || JSON.stringify(undone).includes('Typed275')) {
        throw new Error(`${file}: Undo did not retain the equation and remove typing`);
      }
      await page.keyboard.press('Control+Shift+z');
      await assertContent(typed);
      const preview = await source();
      if (!preview.includes(':label: ' + label) || !preview.includes('x + 1') || !preview.includes('Typed275') ||
          (file !== 'only.md' && !preview.includes('{eq}`eq-a`'))) throw new Error(`${file}: Source lost applied content`);
      const response = page.waitForResponse(response => response.request().method() === 'POST' && /\/api\/document(?:\?|$)/.test(response.url()));
      await page.getByTestId('save').click();
      if ((await response).status() !== 200) throw new Error(`${file}: real Save failed`);
      await page.getByText('Saved', {exact:true}).filter({visible:true}).waitFor();
      const disk = await page.request.get(`${origin}/document/${file}?path=${encodeURIComponent(path)}`);
      if (disk.status() !== 200 || (await disk.text()).replaceAll('\r\n', '\n') !== preview) {
        throw new Error(`${file}: Save differs from Source`);
      }
      // Save must retain native history as well as the applied equation.
      await page.locator('[data-document-tab][data-active=true] .document-editor').evaluate(element => element.editor.commands.undo());
      if (JSON.stringify(await snapshot()).includes('Typed275')) throw new Error(`${file}: Save lost Undo history`);
      await page.locator('[data-document-tab][data-active=true] .document-editor').evaluate(element => element.editor.commands.redo());
      await assertContent(typed);
      await page.reload();
      await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
      await openDocument(page, path);
      await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
      if (await source() !== preview || await equation.count() !== 1 ||
          (file !== 'only.md' && await reference.getAttribute('data-resolved') !== 'true')) {
        throw new Error(`${file}: Reload lost equation, prose or reference`);
      }
    }
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }
}
