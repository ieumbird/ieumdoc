// Run with playwright-cli run-code --filename=apps/editor/test/equation-save-during-edit.browser.js.
// Mocks delayed saves and subsequent reloads without writing the document.
async page => {
  await page.unroute('**/api/document');
  await page.reload();
  await page.getByText('Ready', {exact:true}).waitFor();
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
  await page.getByRole('button',{name:'Edit',exact:true}).click();
  await page.getByTestId('equation-latex').fill(changedLatex);
  const beforeResponse = await page.getByTestId('equation-latex').inputValue();
  release();
  await page.getByText('Saved; newer edits pending',{exact:true}).waitFor();
  const afterResponse = await page.getByTestId('equation-latex').inputValue();
  const editorDuringDraft = await page.getByTestId('equation-editor').count();
  if (beforeResponse !== changedLatex || afterResponse !== changedLatex || editorDuringDraft !== 1) {
    throw new Error('Equation draft or editing state was lost after the delayed save');
  }

  await page.getByTestId('equation-apply').click();
  if (!requests[0] || requests[0].equations?.length) throw new Error('Initial save unexpectedly included the draft');
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await page.getByText('Saved',{exact:true}).waitFor();
  if (requests[1].equations?.[0]?.to !== changedLatex) throw new Error('Applied Equation was omitted from the next save');
  await page.reload();
  await page.getByText('Ready',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Edit',exact:true}).click();
  if (await page.getByTestId('equation-latex').inputValue() !== changedLatex) {
    throw new Error('Applied Equation was not reflected after reload');
  }

  resetCycle();
  await page.reload();
  await page.getByText('Ready',{exact:true}).waitFor();
  const canceledLatex = `${originalLatex} + 2`;
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await page.getByRole('button',{name:'Edit',exact:true}).click();
  await page.getByTestId('equation-latex').fill(canceledLatex);
  release();
  await page.getByText('Saved; newer edits pending',{exact:true}).waitFor();
  if (await page.getByTestId('equation-latex').inputValue() !== canceledLatex) {
    throw new Error('Canceled draft was lost before Cancel');
  }
  await page.getByTestId('equation-cancel').click();
  if (await page.getByTestId('equation-editor').count() !== 0) throw new Error('Equation editor remained open after Cancel');
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await page.getByText('Saved',{exact:true}).waitFor();
  if (requests[1].equations?.length) throw new Error('Canceled Equation was included in the next save');
  await page.reload();
  await page.getByText('Ready',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Edit',exact:true}).click();
  const reloadedCanceled = await page.getByTestId('equation-latex').inputValue();
  if (reloadedCanceled !== originalLatex) throw new Error('Cancel did not preserve the original Equation');

  await page.unroute('**/api/document');
  return {
    draftRetained: afterResponse === changedLatex,
    editUiRetained: editorDuringDraft === 1,
    appliedAndReloaded: true,
    canceledAndReloaded: reloadedCanceled === originalLatex,
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }
}
