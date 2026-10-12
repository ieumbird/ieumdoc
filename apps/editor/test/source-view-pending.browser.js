// Run with pnpm browser:test source-view-pending.
// Holds a Source preview for document A in flight, tries Open and folder New for other documents, and
// checks that neither switches the document, so the late preview can only show A's Markdown.
// Uses the scratch files prepared for source-view.browser.js (see docs/test/TEST_GUIDE.md);
// the scenario writes nothing.
async (page, { openDocument }) => {
  const problems = [];
  page.on('console', message => { if (message.type() === 'error') problems.push(message.text()); });
  await page.unrouteAll();
  await page.reload();
  await page.locator('[data-testid="status"][data-operation="Ready"]').waitFor({state:'attached'});

  const origin = page.url().split('/').slice(0, 3).join('/');
  const defaultPath = (await (await page.request.get(`${origin}/api/document`)).json()).path;
  const separator = defaultPath.includes('\\') ? '\\' : '/';
  const root = defaultPath.split(separator).slice(0, -4).join(separator);
  const dir = [root, 'tmp', 'source-view'].join(separator);
  const documentA = [dir, 'technical-document.md'].join(separator);
  const documentB = [dir, 'keyboard.md'].join(separator);
  const created = [dir, 'created-during-preview.md'].join(separator);
  const exists = async (file, name) =>
    (await page.request.get(`${origin}/document/${name}?path=${encodeURIComponent(file)}`)).status() === 200;
  if (!await exists(documentA, 'technical-document.md') || !await exists(documentB, 'keyboard.md')) {
    throw new Error(`Prepare ${dir} first`);
  }
  if (await exists(created, 'created-during-preview.md')) throw new Error(`Remove ${created} first`);

  await openDocument(page, documentA);
  await page.locator('[data-testid="status"][data-operation="Ready"]').waitFor({state:'attached'});
  // New creates in the displayed sidebar folder, so the scratch folder is opened first.
  await page.getByRole('button', {name:'More actions', exact:true}).click();
  await page.getByRole('menuitem', {name:'Open folder…', exact:true}).click();
  await page.getByTestId('folder-path').fill(dir);
  await page.getByTestId('folder-open').click();
  await page.getByRole('dialog').waitFor({state:'detached'});
  await page.getByTestId('folder').waitFor();
  const otherDocument = page.getByTestId('folder').getByRole('treeitem', {name:'keyboard.md', exact:true});

  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let previewRequested;
  const requested = new Promise(resolve => { previewRequested = resolve; });
  await page.route('**/api/document-source', async route => {
    previewRequested();
    await gate;
    await route.continue();
  });
  const currentFile = () => page.getByTestId('current-file').getAttribute('title');
  // Submits the form directly as well, so the App guard is exercised even if the controls are disabled.
  const trySubmit = async (open, input, submit, path) => {
    await open();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    const controlsDisabled = await dialog.getByTestId(input).isDisabled() &&
      await dialog.getByRole('button', {name:submit, exact:true}).isDisabled();
    await dialog.getByTestId(input).evaluate((node, value) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(node, value);
      node.dispatchEvent(new Event('input', {bubbles:true}));
      node.form.requestSubmit();
    }, path);
    await page.waitForTimeout(300);
    const stillOnA = await currentFile() === documentA;
    if (await dialog.isVisible()) {
      await dialog.getByRole('button', {name:'Cancel', exact:true}).click();
      await dialog.waitFor({state:'detached'});
    }
    return controlsDisabled && stillOnA;
  };

  const result = {};
  try {
    await page.getByTestId('view-source').click();
    await requested;
    await otherDocument.click();
    await page.getByTestId('error').getByText('Wait for the current operation to finish.', {exact:true}).waitFor();
    result.openBlockedWhilePending = await currentFile() === documentA;
    result.newBlockedWhilePending = await trySubmit(() => page.getByRole('button', {name:'New file in folder', exact:true}).click(),
      'new-file-name', 'Create', 'created-during-preview');
    result.newFileNotCreated = !await exists(created, 'created-during-preview.md');
  } finally {
    release();
  }
  await page.getByTestId('source-view').waitFor();
  const source = await page.getByTestId('source-view').locator('pre').textContent();
  result.identityStillA = await currentFile() === documentA;
  result.sourceIsA = source.includes('# Converter Control') && !source.includes('Editable paragraph.');
  await page.unroute('**/api/document-source');

  // Once the preview is done, Open works again and returns to Visual.
  await otherDocument.click();
  await page.locator('[data-testid="status"][data-operation="Ready"]').waitFor({state:'attached'});
  result.openAfterPreview = await currentFile() === documentB &&
    await page.getByTestId('view-visual').getAttribute('aria-pressed') === 'true';

  const failed = Object.entries(result).filter(([, value]) => value !== true);
  if (failed.length > 0 || problems.length > 0) {
    throw new Error(`Pending Source preview failed: ${JSON.stringify({result, consoleErrors: problems})}`);
  }
  return {...result, consoleErrors: problems};
}
