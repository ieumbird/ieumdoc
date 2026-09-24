// Run with pnpm exec playwright-cli run-code --filename=apps/editor/test/figure-authoring.browser.js.
// Exercises Figure editing, insertion, Apply/Cancel, Save and Reload against a real file.
// The file is a scratch copy under the repository's ignored tmp/ directory; prepare it first
// (see docs/test/TEST_GUIDE.md, "Figure authoring v1"). The scenario writes that copy only.
async page => {
  const problems = [];
  const onConsole = message => {
    if (message.type() === 'error' || message.type() === 'warning') problems.push(`${message.type()}: ${message.text()}`);
  };
  const onPageError = error => problems.push(`pageerror: ${error.message}`);
  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  await page.unrouteAll();
  await page.reload();
  await page.getByText('Ready', {exact:true}).waitFor();

  const origin = page.url().split('/').slice(0, 3).join('/');
  const defaultPath = (await (await page.request.get(`${origin}/api/document`)).json()).path;
  const separator = defaultPath.includes('\\') ? '\\' : '/';
  const root = defaultPath.split(separator).slice(0, -4).join(separator);
  const filePath = [root, 'tmp', 'figure-authoring', 'technical-document.md'].join(separator);
  const media = name => `${origin}/document/${name}?path=${encodeURIComponent(filePath)}`;
  for (const name of ['diagram.svg', 'diagram-v2.svg']) {
    if ((await page.request.get(media(name))).status() !== 200) {
      throw new Error(`Prepare ${filePath} with diagram.svg and diagram-v2.svg first`);
    }
  }
  const semantic = async () => {
    const response = await (await page.request.get(`${origin}/api/document?path=${encodeURIComponent(filePath)}`)).json();
    return response.document.blocks.filter(block => block.block === 'figure').map(block => ({
      label: block.label, imageUrl: block.imageUrl, imageAlt: block.imageAlt, caption: block.caption.text,
    }));
  };
  const initial = await semantic();
  if (initial.length !== 1 || initial[0].label !== 'fig-control' || initial[0].imageUrl !== './diagram.svg') {
    throw new Error(`Scratch document is not a fresh technical-document.md copy: ${JSON.stringify(initial)}`);
  }

  const result = {};
  const figures = page.locator('[data-block="figure"]');
  const saveEnabled = page.locator('.top-bar [data-testid="save"]:not([aria-disabled="true"])');
  const saveDisabled = page.locator('.top-bar [data-testid="save"][aria-disabled="true"]');
  const imageLoaded = figure => figure.locator('[data-testid="figure-image"]').evaluate(async image => {
    if (!image.complete) await new Promise(resolve => { image.onload = image.onerror = resolve; });
    return image.naturalWidth > 0 && image.getAttribute('src');
  });
  const openScratch = async () => {
    await page.reload();
    await page.getByText('Ready', {exact:true}).waitFor();
    await page.getByRole('button', {name:'Open…'}).click();
    await page.getByTestId('file-path').fill(filePath);
    await page.getByRole('dialog').getByRole('button', {name:'Open', exact:true}).click();
    await page.getByText('Ready', {exact:true}).waitFor();
    if (!(await page.getByTestId('current-file').innerText()).includes('figure-authoring')) throw new Error('Scratch file was not opened');
  };
  const save = async () => {
    await saveEnabled.waitFor();
    await page.getByRole('button', {name:'Save', exact:true}).click();
    await page.getByText('Saved', {exact:true}).waitFor();
  };
  const insertAfterParagraph = async name => {
    const paragraph = page.getByText('The current reference is calculated from the active power command.', {exact:true});
    await paragraph.hover();
    await page.getByRole('button', {name:'Insert block after paragraph block 9'}).click();
    await page.getByRole('menu', {name:'Insert block'}).getByRole('menuitem', {name, exact:true}).click();
  };
  const editor = page.getByTestId('figure-editor');
  const imageFocused = () => page.waitForFunction(() => document.activeElement?.getAttribute('data-testid') === 'figure-image-url', null, {timeout:2000})
    .then(() => true, () => false);

  try {
    await openScratch();
    const baselineParagraphs = await page.locator('[data-block="paragraph"]').count();

    // A. Existing Figure: select shows properties, Edit opens the form; Apply, Save, Reload.
    await figures.first().locator('img').click();
    await page.getByTestId('figure-properties').waitFor();
    result.selectShowsSummaryOnly = await editor.count() === 0 &&
      await page.evaluate(() => document.activeElement?.closest('.document-editor') !== null);
    await figures.first().getByRole('button', {name:'Edit figure'}).click();
    await editor.waitFor();
    result.editFocusesImage = await imageFocused();
    result.existingLabelInForm = await page.getByTestId('figure-label').inputValue() === 'fig-control' &&
      await editor.locator('input').count() === 4;
    await page.getByTestId('figure-image-url').fill('./diagram-v2.svg');
    await page.getByTestId('figure-alt').fill('Updated block diagram');
    await page.getByTestId('figure-caption').fill('Updated converter control diagram.');
    await saveDisabled.waitFor();
    result.existingDraftBlocksSave = await figures.first().getByTestId('figure-draft-status').isVisible();
    await page.getByTestId('figure-apply').click();
    await editor.waitFor({state:'detached'});
    result.existingPreviewAfterApply = String(await imageLoaded(figures.first())).startsWith('/document/diagram-v2.svg?path=');
    await save();
    await openScratch();
    const reloadedExisting = (await semantic())[0];
    result.existingSavedAndReloaded = JSON.stringify(reloadedExisting) === JSON.stringify({
      label: 'fig-control', imageUrl: './diagram-v2.svg', imageAlt: 'Updated block diagram', caption: 'Updated converter control diagram.',
    });
    result.existingReloadedPreview = String(await imageLoaded(figures.first())).startsWith('/document/diagram-v2.svg?path=');
    result.existingReloadedCaption = await figures.first().locator('figcaption').innerText() === 'Updated converter control diagram.';

    // A2. Apply asks Core: a caption MyST would reinterpret keeps the form open and never becomes applied state.
    const appliedCaption = 'Updated converter control diagram.';
    await figures.first().getByRole('button', {name:'Edit figure'}).click();
    await editor.waitFor();
    await page.getByTestId('figure-caption').fill('cost $5 and $x$');
    await page.getByTestId('figure-apply').click();
    const coreError = editor.getByText(/canonical round-trip|not canonical/);
    await coreError.waitFor();
    result.invalidApplyKeepsForm = await editor.isVisible() &&
      await page.getByTestId('figure-caption').inputValue() === 'cost $5 and $x$';
    result.invalidApplyShowsCoreError = await coreError.isVisible();
    result.invalidApplyKeepsAppliedValue = await figures.first().locator('figcaption').innerText() === appliedCaption;
    result.invalidApplyKeepsSaveBlocked = await saveDisabled.count() === 1;
    await page.getByTestId('figure-caption').fill('Cost is 5 units.');
    await page.getByTestId('figure-apply').click();
    await editor.waitFor({state:'detached'});
    result.validApplyAfterError = await figures.first().locator('figcaption').innerText() === 'Cost is 5 units.';
    await save();
    await openScratch();
    const revalidated = (await semantic())[0];
    result.validCaptionSavedAndReloaded = revalidated.caption === 'Cost is 5 units.' && revalidated.label === 'fig-control' &&
      await figures.first().locator('figcaption').innerText() === 'Cost is 5 units.';

    // C1. A new Figure canceled before any Apply is removed.
    await insertAfterParagraph('Figure');
    await editor.waitFor();
    result.newFigureFocusesImage = await imageFocused();
    await saveDisabled.waitFor();
    result.newFigureBlocksSave = true;
    await page.getByTestId('figure-cancel').click();
    await editor.waitFor({state:'detached'});
    result.unappliedCancelRemoves = await figures.count() === 1 && await saveDisabled.count() === 0;

    // B. `/figure` from a transient paragraph, then Apply, Save, Reload.
    await insertAfterParagraph('Paragraph');
    await page.keyboard.type('/figure');
    await page.getByRole('menu', {name:'Insert block'}).getByRole('menuitem', {name:'Figure', exact:true}).click();
    await editor.waitFor();
    result.slashReplacesTransientParagraph = await page.locator('[data-block="paragraph"]').count() === baselineParagraphs;
    result.newLabelEmpty = await page.getByTestId('figure-label').inputValue() === '';
    await page.getByTestId('figure-image-url').fill('');
    await page.getByTestId('figure-apply').click();
    result.emptyImageRejected = await editor.getByText('Figure image URL is required.').isVisible();
    await page.getByTestId('figure-image-url').fill('./diagram.svg');
    await page.getByTestId('figure-alt').fill('New figure alt');
    await page.getByTestId('figure-caption').fill('New figure caption.');
    await page.getByTestId('figure-apply').click();
    await editor.waitFor({state:'detached'});
    const created = figures.nth(1);
    result.newPreviewAfterApply = String(await imageLoaded(created)).startsWith('/document/diagram.svg?path=');

    // C2. Apply, Edit, change, Cancel keeps the block and restores the applied value.
    await created.getByRole('button', {name:'Edit figure'}).click();
    await editor.waitFor();
    await page.getByTestId('figure-caption').fill('Discarded caption.');
    await page.getByTestId('figure-cancel').click();
    result.appliedCancelKeepsBlock = await figures.count() === 2;
    result.appliedCancelRestores = await created.locator('figcaption').innerText() === 'New figure caption.';
    await save();
    await openScratch();
    const reloaded = await semantic();
    result.newSavedAndReloaded = JSON.stringify(reloaded[1]) === JSON.stringify({
      label: '', imageUrl: './diagram.svg', imageAlt: 'New figure alt', caption: 'New figure caption.',
    });
    result.labelUnchanged = reloaded[0].label === 'fig-control';
    result.reloadedFigureCount = await figures.count() === 2;
    result.noEmptyParagraphSaved = await page.locator('[data-block="paragraph"]').count() === baselineParagraphs;
    result.newReloadedPreview = String(await imageLoaded(figures.nth(1))).startsWith('/document/diagram.svg?path=');

    // Escape cancels an existing Figure draft without removing it.
    await figures.first().getByRole('button', {name:'Edit figure'}).click();
    await editor.waitFor();
    await page.getByTestId('figure-alt').fill('Escaped');
    await page.getByTestId('figure-alt').press('Escape');
    await editor.waitFor({state:'detached'});
    result.escapeCancels = await figures.count() === 2 && await saveDisabled.count() === 0 &&
      await figures.first().locator('img').getAttribute('alt') === 'Updated block diagram';

    // A Figure draft typed while a Save is in flight survives the response and is not saved until applied.
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const posted = [];
    await page.route('**/api/document**', async route => {
      if (route.request().method() !== 'POST') return route.continue();
      posted.push(route.request().postDataJSON());
      if (posted.length === 1) await gate;
      return route.continue();
    });
    await page.getByRole('button', {name:'Save', exact:true}).click();
    await figures.first().getByRole('button', {name:'Edit figure'}).click();
    await editor.waitFor();
    await page.getByTestId('figure-caption').fill('Caption typed during save.');
    release();
    await page.getByText('Saved; newer edits pending', {exact:true}).waitFor();
    result.delayedSaveKeepsDraft = await page.getByTestId('figure-caption').inputValue() === 'Caption typed during save.' &&
      !posted[0].figures?.length;
    await page.getByTestId('figure-apply').click();
    await save();
    await page.unroute('**/api/document**');
    result.delayedDraftAppliedAndSaved = posted[1]?.figures?.[0]?.to?.caption === 'Caption typed during save.' &&
      (await semantic())[0].caption === 'Caption typed during save.' && (await semantic())[0].label === 'fig-control';

    // Canceling a never-applied Figure that is the only block restores the empty-document paragraph.
    const emptyPath = filePath.replace('technical-document.md', `empty-${Date.now()}.md`);
    await page.getByRole('button', {name:'New', exact:true}).click();
    await page.getByTestId('new-file-path').fill(emptyPath);
    await page.getByRole('dialog').getByRole('button', {name:'Create', exact:true}).click();
    await page.getByText('Ready', {exact:true}).waitFor();
    await page.locator('[data-testid="document-editor"] [contenteditable="true"]').click();
    await page.keyboard.type('/figure');
    await page.getByRole('menu', {name:'Insert block'}).getByRole('menuitem', {name:'Figure', exact:true}).click();
    await editor.waitFor();
    await page.getByTestId('figure-cancel').click();
    await editor.waitFor({state:'detached'});
    result.onlyBlockCancelRestoresEmptyParagraph = await figures.count() === 0 &&
      await page.locator('.document-editor > p[data-block="paragraph"]').count() === 1 && await saveDisabled.count() === 0;
    await save();
    result.onlyBlockCancelSavesEmpty = (await (await page.request.get(`${origin}/api/document?path=${encodeURIComponent(emptyPath)}`)).json())
      .document.blocks.length === 0;

    result.consoleProblems = problems;
    const failed = Object.entries(result).filter(([key, value]) => key !== 'consoleProblems' && value !== true);
    if (failed.length || problems.length) throw new Error(`Figure authoring failed: ${JSON.stringify(result)}`);
    return result;
  } finally {
    await page.unrouteAll();
    page.off('console', onConsole);
    page.off('pageerror', onPageError);
  }
}
