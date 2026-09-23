// Run with playwright-cli run-code --filename=apps/editor/test/equation-insertion.browser.js.
// Exercises new Equation insertion, draft guard, Cancel, Apply, Save, and reload.
async page => {
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
        path: [next.length],
        latex: inserted.latex,
        label: '',
        editable: true,
      });
      saved.document.blocks = next;
      saved.revision = `equation-${requests.length}`;
    }
    return route.fulfill({json:saved});
  });

  try {
    await page.reload();
    await page.getByText('Ready', {exact:true}).waitFor();
    // Create an empty transient paragraph with `+`, then use `/equation`.
    const insertButton = page.locator('button[aria-label^="Insert block after"]').first();
    await insertButton.hover();
    await insertButton.click();
    await page.getByRole('menu', {name:'Insert block'}).getByRole('menuitem', {name:'Paragraph'}).click();
    await page.keyboard.type('/equation');
    await page.getByRole('menu', {name:'Insert block'}).getByRole('menuitem', {name:'Equation'}).click();
    await page.getByTestId('equation-editor').waitFor();
    const afterCancel = await page.locator('[data-block="equation"]').count();
    const noEmptyParagraphAfterSlash = await page.locator('[data-block="paragraph"]').count() === baselineParagraphCount;
    await page.getByTestId('equation-cancel').click();
    const cancelRemoved = await page.locator('[data-block="equation"]').count() === baselineEquationCount;

    await insertButton.hover();
    await insertButton.click();
    await page.getByRole('menu', {name:'Insert block'}).getByRole('menuitem', {name:'Equation'}).click();
    await page.getByTestId('equation-latex').fill('x');
    const saveBlockedBeforeApply = await page.locator('.top-bar [data-testid="save"][aria-disabled="true"]').count() === 1;
    await page.getByTestId('equation-apply').click();
    const newEquation = page.locator('[data-block="equation"][data-source-path^="new:"]');
    await newEquation.getByRole('button', {name:'Edit', exact:true}).click();
    await page.getByTestId('equation-latex').fill('x + 1');
    await page.getByTestId('equation-cancel').click();
    const appliedCancelKeepsBlock = await newEquation.count() === 1;
    const appliedCancelRestoresLatex = await newEquation.locator('[data-testid="equation-preview"]').count() === 1;
    await page.locator('.top-bar [data-testid="save"]:not([aria-disabled="true"])').waitFor();
    await page.getByRole('button', {name:'Save', exact:true}).click();
    await page.getByText('Saved', {exact:true}).waitFor();
    const insert = requests.at(-1)?.inserts?.find(item => item.block === 'equation');
    await page.reload();
    await page.getByText('Ready', {exact:true}).waitFor();
    const reloaded = await page.locator('[data-block="equation"]').count();
    const reloadedEquation = page.locator('[data-block="equation"]').last();
    await reloadedEquation.getByRole('button', {name:'Edit', exact:true}).click();
    const reloadedLatex = await page.getByTestId('equation-latex').inputValue();
    await page.getByTestId('equation-cancel').click();
    return {
      menuHasEquation: true,
      enteredEditor: afterCancel === baselineEquationCount + 1,
      noEmptyParagraphAfterSlash,
      cancelRemoved,
      saveBlockedBeforeApply,
      appliedCancelKeepsBlock,
      appliedCancelRestoresLatex,
      appliedAndSaved: insert?.latex === 'x',
      reloadKeptEquation: reloaded === baselineEquationCount + 1 && reloadedLatex === 'x',
    };
  } finally {
    await page.unroute('**/api/document**');
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }
}
