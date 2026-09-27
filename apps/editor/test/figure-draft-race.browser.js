// Focused Issue #21 regression. Prepare tmp/figure-authoring first with `pnpm browser:prepare`.
async page => {
  await page.reload();
  await page.locator('[data-testid="status"][data-operation="Ready"]').waitFor({state:'attached'});
  const origin = page.url().split('/').slice(0, 3).join('/');
  const defaultPath = (await (await page.request.get(`${origin}/api/document`)).json()).path;
  const separator = defaultPath.includes('\\') ? '\\' : '/';
  const root = defaultPath.split(separator).slice(0, -4).join(separator);
  const filePath = [root, 'tmp', 'figure-authoring', 'technical-document.md'].join(separator);
  const openScratch = async () => {
    await page.getByRole('button', {name:'Open…'}).click();
    await page.getByTestId('file-path').fill(filePath);
    await page.getByRole('dialog').getByRole('button', {name:'Open', exact:true}).click();
    await page.locator('[data-testid="status"][data-operation="Ready"]').waitFor({state:'attached'});
  };
  const semantic = async () => {
    const response = await (await page.request.get(`${origin}/api/document?path=${encodeURIComponent(filePath)}`)).json();
    return response.document.blocks.filter(block => block.block === 'figure').map(block => ({
      label:block.label, imageUrl:block.imageUrl, imageAlt:block.imageAlt, caption:block.caption.text,
    }));
  };
  await openScratch();
  const figure = page.locator('[data-block="figure"]').first();
  await figure.locator('img').click();
  await figure.getByRole('button', {name:'Edit figure'}).locator('..').hover({position:{x:4,y:4}});
  await figure.getByRole('button', {name:'Edit figure'}).click();
  await page.getByTestId('figure-editor').waitFor();
  await page.waitForFunction(() => document.activeElement?.getAttribute('data-testid') === 'figure-image-url');
  const beforeSelectionMove = {
    selectedFigure: await page.locator('.ProseMirror-selectednode').count() === 1,
    formOpen: await page.getByTestId('figure-editor').count() === 1,
    activeField: await page.evaluate(() => document.activeElement?.getAttribute('data-testid')),
    caption: await page.getByTestId('figure-caption').inputValue(),
  };
  // Moving the editor selection off the NodeSelection is the problematic blur boundary.
  await page.locator('.document-editor').press('ArrowDown');
  const afterSelectionMove = {
    selectedFigure: await page.locator('.ProseMirror-selectednode').count() === 1,
    formOpen: await page.getByTestId('figure-editor').count() === 1,
    draftStatus: await page.getByTestId('figure-draft-status').count() === 1,
    focusedField: await page.evaluate(() => document.activeElement?.getAttribute('data-testid')),
  };
  if (afterSelectionMove.selectedFigure || !afterSelectionMove.formOpen) {
    throw new Error(`Figure form closed before draft activation: ${JSON.stringify({beforeSelectionMove, afterSelectionMove})}`);
  }

  const typedCaption = 'Caption entered after Figure selection moved.';
  await page.getByTestId('figure-caption').fill(typedCaption);
  const draftActive = await page.getByTestId('figure-draft-status').isVisible() &&
    await page.locator('.top-bar [data-testid="save"][aria-disabled="true"]').count() === 1;
  const captionStayedInField = await page.getByTestId('figure-caption').inputValue() === typedCaption &&
    await page.getByTestId('figure-image-url').inputValue() === './diagram.svg';
  await page.getByTestId('figure-apply').click();
  await page.getByTestId('figure-editor').waitFor({state:'detached'});
  await page.getByRole('button', {name:'Save', exact:true}).click();
  await page.getByText('Saved', {exact:true}).waitFor();
  await page.reload();
  await page.locator('[data-testid="status"][data-operation="Ready"]').waitFor({state:'attached'});
  await openScratch();
  const reloaded = await semantic();
  const saveReloadPreserved = reloaded.length === 1 && reloaded[0].label === 'fig-control' &&
    reloaded[0].imageUrl === './diagram.svg' && reloaded[0].imageAlt === 'Control block diagram' &&
    reloaded[0].caption === typedCaption;
  const result = {beforeSelectionMove, afterSelectionMove, draftActive, captionStayedInField, saveReloadPreserved};
  if (afterSelectionMove.selectedFigure || !afterSelectionMove.formOpen || !draftActive || !captionStayedInField || !saveReloadPreserved) {
    throw new Error(`Figure selection race regression failed: ${JSON.stringify(result)}`);
  }
  return result;
}
