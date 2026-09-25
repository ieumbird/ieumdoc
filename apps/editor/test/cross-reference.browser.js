// Run with pnpm exec playwright-cli run-code --filename=apps/editor/test/cross-reference.browser.js.
// Inserts {eq}/{numref} references from a selection and from the slash menu, retargets and removes
// references, edits text around them, and checks resolved/unresolved display, Source View and
// Save/Reload against a real file. The file is a scratch copy under the repository's ignored tmp/
// directory; prepare it first (see docs/test/TEST_GUIDE.md, "Local cross-reference authoring v1").
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
  const filePath = [root, 'tmp', 'cross-reference', 'refs.md'].join(separator);
  const markdown = async () => {
    const response = await page.request.get(`${origin}/document/refs.md?path=${encodeURIComponent(filePath)}`);
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
  const sourceText = async () => {
    await page.getByTestId('view-source').click();
    await page.getByTestId('source-view').waitFor();
    const text = (await page.getByTestId('source-view').locator('pre').textContent()).replaceAll('\r\n', '\n');
    await page.getByTestId('view-visual').click();
    await page.getByTestId('document-editor').waitFor();
    return text;
  };
  const paragraph = index => page.locator('.document-editor > p').nth(index);
  const chip = (scope, text) => scope.locator('[data-testid="cross-reference"]', {hasText: text});
  // Select through the editor's own TextSelection, then wait for the toolbar that selection shows.
  const selectText = async needle => {
    await page.evaluate(needle => {
      const instance = document.querySelector('.ProseMirror').editor;
      let range;
      instance.state.doc.descendants((node, position) => {
        if (range || !node.isText) return;
        const index = node.text.indexOf(needle);
        if (index >= 0) range = { from: position + index, to: position + index + needle.length };
      });
      if (!range) throw new Error(`text not found: ${needle}`);
      instance.commands.setTextSelection(range);
      instance.view.focus();
    }, needle);
    await page.getByTestId('selection-toolbar').waitFor();
  };

  const fresh = await markdown();
  if (!fresh.includes('{eq}`eq-a` and [details](#eq-a)') || fresh.includes('{eq}`eq-c`')) {
    throw new Error('Scratch document is not a fresh refs.md copy');
  }
  const result = {};
  await open();

  // A. Reference paragraphs are editable; resolved and unresolved references look different.
  result.referenceParagraphsEditable = await page.locator('[data-readonly-paragraph]').count() === 0 &&
    await chip(paragraph(1), 'Eq. eq-a').count() === 1;
  result.resolvedShown = await chip(paragraph(1), 'Eq. eq-a').getAttribute('data-resolved') === 'true';
  const broken = chip(paragraph(2), 'Fig. missing-fig');
  result.unresolvedShown = await broken.getAttribute('data-resolved') === 'false' &&
    (await broken.locator('.cross-reference-chip').getAttribute('title')).startsWith('Unresolved');
  result.fragmentLinkStaysLink = await paragraph(1).locator('a', {hasText: 'details'}).count() === 1;

  // B. Selected text becomes an Equation reference through the selection toolbar.
  await selectText('control law');
  await page.getByRole('button', {name:'Cross-reference'}).click();
  await page.getByTestId('reference-target').selectOption('reference:eq:eq-b');
  await page.getByTestId('reference-apply').click();
  result.insertedFromSelection = await chip(paragraph(0), 'Eq. eq-b').count() === 1 &&
    !(await paragraph(0).innerText()).includes('control law');

  // C. A Figure reference at the caret from the slash menu.
  await paragraph(0).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' /fig');
  await page.getByRole('menuitem', {name:'Figure reference: fig-a'}).click();
  result.insertedAtCaret = await chip(paragraph(0), 'Fig. fig-a').count() === 1 && !(await paragraph(0).innerText()).includes('/fig');

  // D. Retarget an existing reference; E. remove one back to plain text.
  await chip(paragraph(1), 'Eq. eq-a').locator('.cross-reference-chip').click();
  await page.getByTestId('reference-target').selectOption('reference:eq:eq-b');
  await page.getByTestId('reference-apply').click();
  result.retargeted = await chip(paragraph(1), 'Eq. eq-b').count() === 1 && await chip(paragraph(1), 'Eq. eq-a').count() === 0;
  await chip(paragraph(2), 'Eq. eq-a').locator('.cross-reference-chip').click();
  await page.getByTestId('reference-remove').click();
  result.removedToText = await chip(paragraph(2), 'Eq. eq-a').count() === 0 && (await paragraph(2).innerText()).includes('later and eq-a.');

  // F. Text around references stays editable.
  await paragraph(1).click();
  await page.keyboard.press('Home');
  await page.keyboard.type('Now ');

  // G. Renaming a label leaves references as written and shows them unresolved at once.
  const equationB = page.locator('[data-block="equation"]').nth(1);
  await equationB.getByRole('button', {name:'Edit', exact:true}).click();
  await page.getByTestId('equation-label').fill('eq-c');
  await page.getByTestId('equation-apply').click();
  await page.getByTestId('equation-editor').waitFor({state:'detached'});
  result.renamedTargetShowsUnresolved = await chip(paragraph(1), 'Eq. eq-b').getAttribute('data-resolved') === 'false';

  // H. Source shows the unsaved result; Save writes exactly that; Reload keeps kinds and targets.
  const preview = await sourceText();
  const expectedLines = [
    'The current is set by the {eq}`eq-b` and shown in the diagram. {numref}`fig-a`',
    'Now See {eq}`eq-b` and [details](#eq-a) with **bold** and {math}`x`.',
    'See {numref}`missing-fig` for later and eq-a.',
    '```{math}\n:label: eq-a\n\na = b\n```',
    '```{math}\n:label: eq-c\n\nc = d\n```',
    ':::{figure} ./diagram.svg\n:name: fig-a\n:::',
  ];
  result.sourceShowsUnsavedReferences = expectedLines.every(line => preview.includes(line));
  result.fileUntouchedBeforeSave = await markdown() === fresh;
  await page.getByRole('button', {name:'Save', exact:true}).click();
  await page.getByText('Saved', {exact:true}).waitFor();
  result.saveMatchesSource = await markdown() === preview;
  await open();
  result.reloadedReferences = await chip(paragraph(0), 'Eq. eq-b').count() === 1 && await chip(paragraph(0), 'Fig. fig-a').count() === 1 &&
    await chip(paragraph(1), 'Eq. eq-b').getAttribute('data-resolved') === 'false' &&
    await chip(paragraph(2), 'Fig. missing-fig').getAttribute('data-resolved') === 'false' &&
    await chip(paragraph(0), 'Fig. fig-a').getAttribute('data-resolved') === 'true';
  result.reloadedSourceMatchesFile = await sourceText() === await markdown();

  const failed = Object.entries(result).filter(([, value]) => value !== true);
  if (failed.length > 0 || problems.length > 0) {
    throw new Error(`Cross-reference authoring failed: ${JSON.stringify({result, consoleErrors: problems})}`);
  }
  return {...result, consoleErrors: problems};
}
