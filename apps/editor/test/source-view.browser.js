// Run with pnpm exec playwright-cli run-code --filename=apps/editor/test/source-view.browser.js.
// Switches between Visual and the read-only Source view, checks that Source is the canonical
// Markdown Save would write (including unsaved Visual edits), that the file is only written by
// Save, that Equation/Figure drafts block Source, and that unwritable documents keep Source blocked.
// Files are scratch copies under the repository's ignored tmp/ directory; prepare them first
// (see docs/test/TEST_GUIDE.md). The scenario writes technical-document.md only.
async page => {
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
  const technical = [dir, 'technical-document.md'].join(separator);
  const lossy = [dir, 'keyboard.md'].join(separator);
  const markdown = async (file, name) => {
    const response = await page.request.get(`${origin}/document/${name}?path=${encodeURIComponent(file)}`);
    if (response.status() !== 200) throw new Error(`Prepare ${file} first`);
    return (await response.text()).replaceAll('\r\n', '\n');
  };
  const open = async file => {
    await page.reload();
    await page.locator('[data-testid="status"][data-operation="Ready"]').waitFor({state:'attached'});
    await page.getByRole('button', {name:'Open…'}).click();
    await page.getByTestId('file-path').fill(file);
    await page.getByRole('dialog').getByRole('button', {name:'Open', exact:true}).click();
    await page.locator('[data-testid="status"][data-operation="Ready"]').waitFor({state:'attached'});
  };
  const visual = page.getByTestId('view-visual');
  const source = page.getByTestId('view-source');
  const sourceView = page.getByTestId('source-view');
  const editor = page.getByTestId('document-editor');
  const sourceText = async () => (await sourceView.locator('pre').textContent()).replaceAll('\r\n', '\n');
  const showSource = async () => { await source.click(); await sourceView.waitFor(); };
  const showVisual = async () => { await visual.click(); await editor.waitFor(); };
  const paragraph = 'The current reference is calculated from the active power command.';
  const cell = text => page.locator('[data-block="table"] [data-table-cell]', {hasText: new RegExp(`^${text}$`)});

  const fresh = await markdown(technical, 'technical-document.md');
  const expected = await markdown([dir, 'expected.md'].join(separator), 'expected.md');
  const lossyBefore = await markdown(lossy, 'keyboard.md');
  if (fresh.includes('SourceMarker') || !fresh.includes('| Port | Type |')) {
    throw new Error('Scratch document is not a fresh technical-document.md copy');
  }
  const result = {};
  await open(technical);

  // Order in the top bar: path … [Visual | Source] status Save.
  const x = async locator => (await locator.boundingBox()).x;
  result.toggleLeftOfStatusAndSave = await x(source) < await x(page.getByTestId('save')) && await page.getByTestId('status').textContent() === ''; // Clean idle status is intentionally absent.
  result.visualInitiallyPressed = await visual.getAttribute('aria-pressed') === 'true';

  // A. Unchanged document: Source equals the CLI's canonical format of the same file.
  await showSource();
  result.sourcePressed = await source.getAttribute('aria-pressed') === 'true' && !(await editor.isVisible());
  result.sourceMatchesCanonical = await sourceText() === expected;
  result.sourceReadOnly = await sourceView.locator('[contenteditable="true"], textarea, input').count() === 0;
  result.sourceSameColumn = await sourceView.evaluate(node => node.parentElement.classList.contains('document-column'));

  // B. Unsaved paragraph and table cell edits appear in Source; the file is not written.
  await showVisual();
  await page.getByText(paragraph, {exact:true}).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' SourceMarker');
  await cell('Port').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' name');
  await showSource();
  const unsaved = await sourceText();
  result.unsavedEditsInSource = unsaved.includes(`${paragraph} SourceMarker`) && unsaved.includes('| Port name | Type |');
  result.fileNotWrittenByPreview = await markdown(technical, 'technical-document.md') === fresh;
  result.statusUnchangedByPreview = await page.getByTestId('status').innerText() === 'Unsaved changes';

  // C. Visual keeps the unsaved editor state, including undo history.
  await showVisual();
  result.visualKeepsEdits = await page.getByText(`${paragraph} SourceMarker`, {exact:true}).count() === 1 &&
    await cell('Port name').count() === 1;
  result.singleEditor = await page.locator('[data-testid="document-editor"] [contenteditable="true"]').count() === 1;
  await page.getByText(`${paragraph} SourceMarker`, {exact:true}).click();
  await page.keyboard.press('ControlOrMeta+z');
  result.undoHistoryKept = await cell('Port').count() === 1;
  await page.keyboard.press('ControlOrMeta+Shift+z');
  result.redoRestores = await cell('Port name').count() === 1;

  // D. Save while viewing Source writes exactly the previewed Markdown.
  await showSource();
  const previewed = await sourceText();
  await page.getByRole('button', {name:'Save', exact:true}).click();
  await page.getByText('Saved', {exact:true}).waitFor();
  result.saveFromSourceWritesPreview = await markdown(technical, 'technical-document.md') === previewed;
  result.staysInSourceAfterSave = await sourceView.isVisible();

  // E. After Reload, Source equals the saved canonical Markdown.
  await open(technical);
  result.reloadOpensVisual = await visual.getAttribute('aria-pressed') === 'true';
  await showSource();
  result.reloadedSourceMatchesFile = await sourceText() === await markdown(technical, 'technical-document.md');
  await showVisual();

  // F. Unapplied Equation and Figure drafts block Source, with the reason in a tooltip.
  const equation = page.locator('[data-block="equation"]').first();
  await equation.getByRole('button', {name:'Edit', exact:true}).locator('..').hover({position:{x:4,y:4}});
  await equation.getByRole('button', {name:'Edit', exact:true}).click();
  await page.getByTestId('equation-latex').fill('x + SourceDraft');
  await source.hover();
  result.equationDraftBlocksSource = await source.getAttribute('aria-disabled') === 'true' &&
    await page.getByText('Apply or Cancel the Equation edit before viewing Source.').isVisible();
  await source.click({force:true});
  result.equationDraftStaysVisual = await sourceView.count() === 0;
  await page.getByTestId('equation-cancel').click();
  const figure = page.locator('[data-block="figure"]').first();
  await figure.locator('img').click();
  await figure.getByRole('button', {name:'Edit figure'}).locator('..').hover({position:{x:4,y:4}});
  await figure.getByRole('button', {name:'Edit figure'}).click();
  await page.getByTestId('figure-caption').fill('Draft caption.');
  await source.hover();
  result.figureDraftBlocksSource = await source.getAttribute('aria-disabled') === 'true' &&
    await page.getByText('Apply or Cancel the Figure edit before viewing Source.').isVisible();
  await page.getByTestId('figure-cancel').click();
  await page.getByTestId('figure-editor').waitFor({state:'detached'});
  await showSource();
  result.sourceAvailableAfterCancel = await sourceView.isVisible();
  await showVisual();

  // G. A document Core cannot write canonically has no Source: the open-time writeability warning
  // already names the reason, Source stays disabled with a hint, nothing is requested, and the
  // file is unchanged.
  await open(lossy);
  await page.getByTestId('writeability-warning').waitFor();
  await page.getByText('Editable paragraph.', {exact:true}).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Changed');
  await source.hover();
  result.unpreservableSourceBlocked = await source.getAttribute('aria-disabled') === 'true' &&
    await page.getByText('IeumDoc cannot write this document as canonical Markdown, so there is no Source to show.').isVisible() &&
    /cannot be preserved in canonical Markdown: .*keyboard/.test(await page.getByTestId('writeability-warning').innerText());
  await source.dispatchEvent('click');
  result.unpreservableStaysVisual = await sourceView.count() === 0 && await editor.isVisible() &&
    await page.getByTestId('error').count() === 0;
  result.unpreservableFileUnchanged = await markdown(lossy, 'keyboard.md') === lossyBefore;
  result.unpreservableEditKept = await page.getByText('Editable paragraph. Changed', {exact:true}).count() === 1;

  const failed = Object.entries(result).filter(([, value]) => value !== true);
  if (failed.length > 0 || problems.length > 0) {
    throw new Error(`Source view failed: ${JSON.stringify({result, consoleErrors: problems})}`);
  }
  return {...result, consoleErrors: problems};
}
