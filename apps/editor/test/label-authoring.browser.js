// Run with pnpm exec playwright-cli run-code --filename=apps/editor/test/label-authoring.browser.js.
// Adds, changes and removes Equation and Figure labels, labels new blocks, checks Source View and
// Save/Reload against a real file, and checks that duplicate and invalid labels never write.
// The file is a scratch copy under the repository's ignored tmp/ directory; prepare it first
// (see docs/test/TEST_GUIDE.md, "Equation / Figure label authoring v1"). The scenario writes that copy only.
async page => {
  const problems = [];
  page.on('console', message => { if (message.type() === 'error') problems.push(message.text()); });
  await page.unrouteAll();
  await page.reload();
  await page.getByText('Ready', {exact:true}).waitFor();

  const origin = page.url().split('/').slice(0, 3).join('/');
  const defaultPath = (await (await page.request.get(`${origin}/api/document`)).json()).path;
  const separator = defaultPath.includes('\\') ? '\\' : '/';
  const root = defaultPath.split(separator).slice(0, -4).join(separator);
  const filePath = [root, 'tmp', 'label-authoring', 'technical-document.md'].join(separator);
  const markdown = async () => {
    const response = await page.request.get(`${origin}/document/technical-document.md?path=${encodeURIComponent(filePath)}`);
    if (response.status() !== 200) throw new Error(`Prepare ${filePath} first`);
    return (await response.text()).replaceAll('\r\n', '\n');
  };
  const open = async () => {
    await page.reload();
    await page.getByText('Ready', {exact:true}).waitFor();
    await page.getByRole('button', {name:'Open…'}).click();
    await page.getByTestId('file-path').fill(filePath);
    await page.getByRole('dialog').getByRole('button', {name:'Open', exact:true}).click();
    await page.getByText('Ready', {exact:true}).waitFor();
  };
  const equation = page.locator('[data-block="equation"]').first();
  const figure = page.locator('[data-block="figure"]').first();
  const saveEnabled = page.locator('.top-bar [data-testid="save"]:not([aria-disabled="true"])');
  const save = async () => {
    await saveEnabled.waitFor();
    await page.getByRole('button', {name:'Save', exact:true}).click();
    await page.getByText('Saved', {exact:true}).waitFor();
  };
  const sourceText = async () => {
    await page.getByTestId('view-source').click();
    await page.getByTestId('source-view').waitFor();
    const text = (await page.getByTestId('source-view').locator('pre').textContent()).replaceAll('\r\n', '\n');
    await page.getByTestId('view-visual').click();
    await page.getByTestId('document-editor').waitFor();
    return text;
  };
  const setEquationLabel = async (block, label) => {
    await block.getByRole('button', {name:'Edit', exact:true}).locator('..').hover({position:{x:4,y:4}});
    await block.getByRole('button', {name:'Edit', exact:true}).click();
    await page.getByTestId('equation-label').fill(label);
    await page.getByTestId('equation-apply').click();
    await page.getByTestId('equation-editor').waitFor({state:'detached'});
  };
  // The Figure form moves focus to its Image field on the next animation frame after it opens.
  // Wait for that intended autofocus before typing, as a user would, so no input lands elsewhere.
  const figureFormReady = async () => {
    await page.getByTestId('figure-editor').waitFor();
    await page.waitForFunction(() => document.activeElement?.getAttribute('data-testid') === 'figure-image-url');
  };
  const setFigureLabel = async (block, label) => {
    await block.locator('img').click();
    await block.getByRole('button', {name:'Edit figure'}).locator('..').hover({position:{x:4,y:4}});
    await block.getByRole('button', {name:'Edit figure'}).click();
    await figureFormReady();
    await page.getByTestId('figure-label').fill(label);
    await page.getByTestId('figure-apply').click();
    await page.getByTestId('figure-editor').waitFor({state:'detached'});
  };
  const insertAfterParagraph = async name => {
    await page.getByText('The current reference is calculated from the active power command.', {exact:true}).hover();
    await page.getByRole('button', {name:'Insert block after paragraph block 9'}).click();
    await page.getByRole('menu', {name:'Insert block'}).getByRole('menuitem', {name, exact:true}).click();
  };
  const reference = 'See [](#fig-control) and {eq}`eq-current`.';
  const latex = 'i^{\\ast} = \\frac{P^{\\ast}}{V_{\\mathrm{rms}}}';

  const fresh = await markdown();
  if (!fresh.includes(':label: eq-current') || !fresh.includes(':label: fig-control')) {
    throw new Error('Scratch document is not a fresh technical-document.md copy');
  }
  const result = {};
  await open();

  // A. Change both labels in the editor forms; Source shows them before Save; the file is untouched.
  await equation.getByRole('button', {name:'Edit', exact:true}).locator('..').hover({position:{x:4,y:4}});
  await equation.getByRole('button', {name:'Edit', exact:true}).click();
  result.equationFormShowsLabel = await page.getByTestId('equation-label').inputValue() === 'eq-current';
  await page.getByTestId('equation-label').fill('eq-reference');
  result.labelDraftBlocksSave = await page.locator('.top-bar [data-testid="save"][aria-disabled="true"]').count() === 1;
  await page.getByTestId('equation-apply').click();
  await page.getByTestId('equation-editor').waitFor({state:'detached'});
  await setFigureLabel(figure, 'fig-diagram');
  result.kindsShowLabels = await equation.locator('.block-kind').textContent() === 'Equation · eq-reference' &&
    await figure.locator('.block-kind').textContent() === 'Figure · fig-diagram';
  const preview = await sourceText();
  result.sourceShowsUnsavedLabels = preview.includes(`\`\`\`{math}\n:label: eq-reference\n\n${latex}\n\`\`\``) &&
    preview.includes(':::{figure} ./diagram.svg\n:name: fig-diagram\n:alt: Control block diagram\n\nControl block diagram of the grid-connected converter.\n:::');
  result.referencesNotRenamed = preview.includes(reference);
  result.fileUntouchedBeforeSave = await markdown() === fresh;

  // B. Save writes exactly what Source showed; Reload keeps labels and content.
  await save();
  result.saveMatchesSource = await markdown() === preview;
  await open();
  result.reloadedLabels = await equation.locator('.block-kind').textContent() === 'Equation · eq-reference' &&
    await figure.locator('.block-kind').textContent() === 'Figure · fig-diagram';
  result.reloadedSourceMatchesFile = await sourceText() === await markdown();

  // C. A duplicate (compared like MyST identifiers) fails Save and Source without writing.
  const beforeDuplicate = await markdown();
  const errorsBefore = problems.length;
  await setEquationLabel(equation, 'FIG-Diagram');
  await page.getByRole('button', {name:'Save', exact:true}).click();
  await page.getByText('Save failed', {exact:true}).waitFor();
  result.duplicateSaveRejected = /already names another target/.test(await page.getByTestId('error').innerText());
  await page.getByTestId('view-source').click();
  await page.getByText(/Source view unavailable: .*already names another target/).waitFor();
  result.duplicateSourceRejected = await page.getByTestId('source-view').count() === 0;
  result.duplicateNotWritten = await markdown() === beforeDuplicate;
  result.duplicateRequestsLogged = problems.splice(errorsBefore).every(text => text.includes('400 (Bad Request)'));

  // D. A label with surrounding spaces is refused at Apply and keeps the form open.
  await equation.getByRole('button', {name:'Edit', exact:true}).locator('..').hover({position:{x:4,y:4}});
  await equation.getByRole('button', {name:'Edit', exact:true}).click();
  await page.getByTestId('equation-label').fill(' eq-x');
  await page.getByTestId('equation-apply').click();
  result.invalidLabelRefusedAtApply = await page.getByTestId('equation-editor').getByText('Label cannot have leading or trailing spaces.').isVisible();
  await page.getByTestId('equation-cancel').click();

  // E. Remove both labels; LaTeX, image, alt and caption stay.
  await setEquationLabel(equation, '');
  await setFigureLabel(figure, '');
  await save();
  const removed = await markdown();
  result.labelsRemovedContentKept = removed.includes(`\`\`\`{math}\n${latex}\n\`\`\``) &&
    removed.includes(':::{figure} ./diagram.svg\n:alt: Control block diagram\n\nControl block diagram of the grid-connected converter.\n:::') &&
    !removed.includes(':label:') && !removed.includes(':name:') && removed.includes(reference);

  // F. New Equation and Figure blocks save their labels.
  await insertAfterParagraph('Equation');
  await page.getByTestId('equation-latex').fill('y = 1');
  await page.getByTestId('equation-label').fill('eq-new');
  await page.getByTestId('equation-apply').click();
  await page.getByTestId('equation-editor').waitFor({state:'detached'});
  await insertAfterParagraph('Figure');
  await figureFormReady();
  await page.getByTestId('figure-image-url').fill('./diagram.svg');
  await page.getByTestId('figure-label').fill('fig-new');
  await page.getByTestId('figure-apply').click();
  await page.getByTestId('figure-editor').waitFor({state:'detached'});
  const newPreview = await sourceText();
  await save();
  const withNew = await markdown();
  result.newBlocksSaved = withNew === newPreview && withNew.includes('```{math}\n:label: eq-new\n\ny = 1\n```') &&
    withNew.includes(':::{figure} ./diagram.svg\n:name: fig-new\n:::');
  await open();
  result.newBlocksReloaded = await page.locator('[data-block="equation"] .block-kind', {hasText:'Equation · eq-new'}).count() === 1 &&
    await page.locator('[data-block="figure"] .block-kind', {hasText:'Figure · fig-new'}).count() === 1;

  const failed = Object.entries(result).filter(([, value]) => value !== true);
  if (failed.length > 0 || problems.length > 0) {
    throw new Error(`Label authoring failed: ${JSON.stringify({result, consoleErrors: problems})}`);
  }
  return {...result, consoleErrors: problems};
}
