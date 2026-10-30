// Run with pnpm browser:test label-authoring.
// Adds, changes and removes Equation and Figure labels, labels new blocks, checks Source View and
// Save/Reload against a real file, and checks that duplicate and invalid labels never write.
// The file is a scratch copy under the repository's ignored tmp/ directory; prepare it first
// (see docs/test/TEST_GUIDE.md). The scenario writes that copy only.
async (page, { openPath }) => {
  const problems = [];
  page.on('console', message => { if (message.type() === 'error') problems.push(message.text()); });
  await page.unrouteAll();
  await page.reload();
  await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});

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
    await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
    await openPath(page, filePath);
  };
  const equation = page.locator('[data-document-tab][data-active=true] [data-block="equation"]').first();
  const figure = page.locator('[data-document-tab][data-active=true] [data-block="figure"]').first();
  const saveEnabled = page.locator('.document-tab-row [data-testid="save"]:not([aria-disabled="true"])');
  const save = async () => {
    await saveEnabled.waitFor();
    // A previous save can still show "Saved" until React handles this click. Wait
    // for this request's acknowledgement before checking the status or disk.
    const response = page.waitForResponse(response => response.request().method() === 'POST' &&
      /\/api\/document(?:\?|$)/.test(response.url()));
    await page.getByRole('button', {name:'Save', exact:true}).click();
    if ((await response).status() !== 200) throw new Error('Label save was rejected');
    await page.getByText('Saved', {exact:true}).filter({visible:true}).waitFor();
  };
  const sourceText = async () => {
    await page.getByTestId('view-source').click();
    await page.locator('[data-document-tab][data-active=true]').getByTestId('source-view').waitFor();
    const text = (await page.locator('[data-document-tab][data-active=true]').getByTestId('source-view').locator('pre').textContent()).replaceAll('\r\n', '\n');
    await page.getByTestId('view-visual').click();
    await page.locator('[data-document-tab][data-active=true]').getByTestId('document-editor').waitFor();
    return text;
  };
  const setEquationLabel = async (block, label) => {
    await block.getByRole('button', {name:'Edit', exact:true}).locator('..').hover({position:{x:4,y:4}});
    await block.getByRole('button', {name:'Edit', exact:true}).click();
    await page.getByTestId('equation-edit-source').click();
    await page.getByTestId('equation-label').fill(label);
    await page.getByTestId('equation-apply').click();
    await page.getByTestId('equation-editor').waitFor({state:'detached'});
  };
  // The Figure form moves focus to its Image field on the next animation frame after it opens.
  // Wait for that intended autofocus before typing, as a user would, so no input lands elsewhere.
  const figureFormReady = async () => {
    await page.getByTestId('figure-editor').waitFor();
    await page.waitForFunction(() => document.activeElement?.getAttribute('data-testid') === 'figure-replace');
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
    // After Apply, the equation summary can flip over the paragraph's centre when it scrolls.
    // Approach the gutter from the paragraph's exposed start, outside that floating panel.
    await page.getByText('The current reference is calculated from the active power command.', {exact:true}).filter({visible:true}).hover({position:{x:4,y:4}});
    await page.getByRole('button', {name:'Insert block after paragraph block 9'}).click();
    await page.getByRole('menu', {name:'Insert block'}).getByRole('menuitem', {name, exact:true}).click();
  };
  const reference = 'See [Figure](#fig-diagram) and {eq}`eq-reference`.';
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
  await page.getByTestId('equation-edit-source').click();
  result.equationFormShowsLabel = await page.getByTestId('equation-label').inputValue() === 'eq-current';
  await page.getByTestId('equation-label').fill('eq-reference');
  // The draft reaches the top bar through a React effect after the input event; wait for it.
  result.labelDraftMarkedUnsaved = await page.getByTestId("draft-indicator")
    .waitFor({state:'visible', timeout:5000}).then(() => true, () => false);
  await page.getByTestId('equation-apply').click();
  await page.getByTestId('equation-editor').waitFor({state:'detached'});
  await setFigureLabel(figure, 'fig-diagram');
  result.kindsShowLabels = await equation.locator('.block-kind').textContent() === 'Equation (1) · eq-reference' &&
    await figure.locator('.block-kind').textContent() === 'Figure 1 · fig-diagram';
  const preview = await sourceText();
  result.sourceShowsUnsavedLabels = preview.includes(`\`\`\`{math}\n:label: eq-reference\n\n${latex}\n\`\`\``) &&
    preview.includes(':::{figure} ./diagram.svg\n:name: fig-diagram\n:alt: Control block diagram\n\nControl block diagram of the grid-connected converter.\n:::');
  result.referencesRenamed = preview.includes(reference);
  result.screenReferencesRenamed = await page.locator('[data-document-tab][data-active=true] [data-testid="cross-reference"][data-label="eq-reference"]').getAttribute('data-resolved') === 'true' &&
    await page.locator('[data-document-tab][data-active=true] .document-editor a[href="#fig-diagram"]').count() === 1;
  result.fileUntouchedBeforeSave = await markdown() === fresh;

  // B. Save writes exactly what Source showed; Reload keeps labels and content.
  await save();
  result.saveMatchesSource = await markdown() === preview;
  await open();
  result.reloadedLabels = await equation.locator('.block-kind').textContent() === 'Equation (1) · eq-reference' &&
    await figure.locator('.block-kind').textContent() === 'Figure 1 · fig-diagram';
  result.reloadedSourceMatchesFile = await sourceText() === await markdown();

  // C. Core refuses a conflicting rename at Apply, retaining the form and applied state.
  const beforeDuplicate = await markdown();
  await equation.getByRole('button', {name:'Edit', exact:true}).locator('..').hover({position:{x:4,y:4}});
  await equation.getByRole('button', {name:'Edit', exact:true}).click();
  await page.getByTestId('equation-edit-source').click();
  await page.getByTestId('equation-label').fill('FIG-Diagram');
  await page.getByTestId('equation-apply').click();
  await page.getByTestId('equation-editor').getByText(/already names another target/).waitFor();
  result.duplicateApplyRejected = (await equation.locator('.block-kind').textContent()).includes('eq-reference');
  result.duplicateNotWritten = await markdown() === beforeDuplicate;
  await page.getByTestId('equation-cancel').click();

  // D. A label with surrounding spaces is refused at Apply and keeps the form open.
  await equation.getByRole('button', {name:'Edit', exact:true}).locator('..').hover({position:{x:4,y:4}});
  await equation.getByRole('button', {name:'Edit', exact:true}).click();
  await page.getByTestId('equation-edit-source').click();
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
  // A new Figure opens no form; its properties are an explicit Edit.
  const newFigure = page.locator('[data-document-tab][data-active=true] [data-block="figure"]').filter({has:page.getByTestId('figure-no-content')});
  await newFigure.getByRole('button', {name:'Edit figure'}).locator('..').hover({position:{x:4,y:4}});
  await newFigure.getByRole('button', {name:'Edit figure'}).click();
  await figureFormReady();
  if (!await page.getByTestId('figure-image-url').isVisible()) await page.getByTestId('figure-replace').click();
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
  result.newBlocksReloaded = await page.locator('[data-document-tab][data-active=true] [data-block="equation"] .block-kind', {hasText:/^Equation \([0-9]+\) · eq-new$/}).count() === 1 &&
    await page.locator('[data-document-tab][data-active=true] [data-block="figure"] .block-kind', {hasText:/^Figure [0-9]+ · fig-new$/}).count() === 1;

  const failed = Object.entries(result).filter(([, value]) => value !== true);
  if (failed.length > 0 || problems.length > 0) {
    throw new Error(`Label authoring failed: ${JSON.stringify({result, removed, consoleErrors: problems})}`);
  }
  return {...result, consoleErrors: problems};
}
