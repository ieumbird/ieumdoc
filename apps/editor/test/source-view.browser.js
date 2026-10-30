// Run with pnpm browser:test source-view.
// Switches between Visual and the read-only Source view, checks that Source is the canonical
// Markdown Save would write (including unsaved Visual edits), that the file is only written by
// Save, that Equation/Figure drafts survive Source.
// Files are scratch copies under the repository's ignored tmp/ directory; prepare them first
// (see docs/test/TEST_GUIDE.md). The scenario writes technical-document.md only.
async (page, { openPath, screenshots }) => {
  const problems = [];
  page.on('console', message => { if (message.type() === 'error') problems.push(message.text()); });
  await page.unrouteAll();
  await page.reload();
  await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});

  const origin = page.url().split('/').slice(0, 3).join('/');
  const defaultPath = (await (await page.request.get(`${origin}/api/document`)).json()).path;
  const separator = defaultPath.includes('\\') ? '\\' : '/';
  const root = defaultPath.split(separator).slice(0, -4).join(separator);
  const dir = [root, 'tmp', 'source-view'].join(separator);
  const technical = [dir, 'technical-document.md'].join(separator);
  const markdown = async (file, name) => {
    const response = await page.request.get(`${origin}/document/${name}?path=${encodeURIComponent(file)}`);
    if (response.status() !== 200) throw new Error(`Prepare ${file} first`);
    return (await response.text()).replaceAll('\r\n', '\n');
  };
  const open = async file => {
    await page.reload();
    await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
    await openPath(page, file);
  };
  const visual = page.getByTestId('view-visual');
  const source = page.getByTestId('view-source');
  const sourceView = page.locator('[data-document-tab][data-active=true]').getByTestId('source-view');
  const editor = page.locator('[data-document-tab][data-active=true]').getByTestId('document-editor');
  const sourceText = async () => (await sourceView.locator('pre').textContent()).replaceAll('\r\n', '\n');
  const showSource = async () => { await source.focus(); await page.keyboard.press('Enter'); await sourceView.waitFor(); };
  const showVisual = async () => { await visual.focus(); await page.keyboard.press('Enter'); await editor.waitFor(); };
  const paragraph = 'The current reference is calculated from the active power command.';
  const cell = text => page.locator('[data-document-tab][data-active=true] [data-block="table"] [data-table-cell]', {hasText: new RegExp(`^${text}$`)});

  const fresh = await markdown(technical, 'technical-document.md');
  const expected = await markdown([dir, 'expected.md'].join(separator), 'expected.md');
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
  result.sourceSameColumn = await sourceView.evaluate(node => node.closest('.document-column') !== null);

  // B. Unsaved paragraph and table cell edits appear in Source; the file is not written.
  await showVisual();
  await page.getByText(paragraph, {exact:true}).filter({visible:true}).click();
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
  result.visualKeepsEdits = await page.getByText(`${paragraph} SourceMarker`, {exact:true}).filter({visible:true}).count() === 1 &&
    await cell('Port name').count() === 1;
  result.singleEditor = await page.locator('[data-document-tab][data-active=true] [data-testid="document-editor"] [contenteditable="true"]').count() === 1;
  await page.getByText(`${paragraph} SourceMarker`, {exact:true}).filter({visible:true}).click();
  await page.keyboard.press('ControlOrMeta+z');
  result.undoHistoryKept = await cell('Port').count() === 1;
  await page.keyboard.press('ControlOrMeta+Shift+z');
  result.redoRestores = await cell('Port name').count() === 1;

  // D. Save while viewing Source writes exactly the previewed Markdown.
  await showSource();
  const previewed = await sourceText();
  await page.getByRole('button', {name:'Save', exact:true}).click();
  await page.getByText('Saved', {exact:true}).filter({visible:true}).waitFor();
  result.saveFromSourceWritesPreview = await markdown(technical, 'technical-document.md') === previewed;
  result.staysInSourceAfterSave = await sourceView.isVisible();

  // E. After Reload, Source equals the saved canonical Markdown.
  await open(technical);
  result.reloadOpensVisual = await visual.getAttribute('aria-pressed') === 'true';
  await showSource();
  result.reloadedSourceMatchesFile = await sourceText() === await markdown(technical, 'technical-document.md');
  await showVisual();

  // F. Source contains applied content; returning to Visual preserves each unapplied draft.
  const equation = page.locator('[data-document-tab][data-active=true] [data-block="equation"]').first();
  await equation.getByRole('button', {name:'Edit', exact:true}).locator('..').hover({position:{x:4,y:4}});
  await equation.getByRole('button', {name:'Edit', exact:true}).click();
  await page.getByTestId('equation-latex').fill('x + SourceDraft');
  await showSource();
  result.sourceExcludesEquationDraft = !(await sourceText()).includes('SourceDraft') && await page.getByTestId('draft-notice').count() === 1;
  await showVisual();
  result.equationDraftRetained = await page.getByTestId('equation-latex').inputValue() === 'x + SourceDraft';
  await page.getByTestId('equation-cancel').click();
  const figure = page.locator('[data-document-tab][data-active=true] [data-block="figure"]').first();
  await figure.locator('img').click();
  await figure.getByRole('button', {name:'Edit figure'}).locator('..').hover({position:{x:4,y:4}});
  await figure.getByRole('button', {name:'Edit figure'}).click();
  await page.getByTestId('figure-alt').fill('Draft caption.');
  await showSource();
  result.sourceExcludesFigureDraft = !(await sourceText()).includes('Draft caption.');
  await showVisual();
  result.figureDraftRetained = await page.getByTestId('figure-alt').inputValue() === 'Draft caption.';
  await page.getByTestId('figure-alt').press('Escape');
  await page.getByTestId('figure-editor').waitFor({state:'detached'});

  // G. Soft wrapping is visual: source lines, indentation, selection and native Copy stay exact.
  const wrappingPath = [dir, 'wrapping.md'].join(separator);
  const wrappingSource = await markdown(wrappingPath, 'wrapping.md');
  await open(wrappingPath);
  await showSource();
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  const renderedNumbers = async () => {
    const session = await page.context().newCDPSession(page);
    try {
      const {root} = await session.send('DOM.getDocument');
      const {nodeId} = await session.send('DOM.querySelector', {nodeId:root.nodeId,
        selector:'[data-document-tab][data-active=true] [data-testid="source-view"] pre'});
      const {node:pre} = await session.send('DOM.describeNode', {nodeId, depth:1});
      const {documents, strings} = await session.send('DOMSnapshot.captureSnapshot', {computedStyles:[]});
      const {nodes, layout} = documents[0];
      const pseudos = new Set(nodes.pseudoType.index);
      // Computed CSS returns counter(...); the layout snapshot contains the actual painted digits.
      // Each direct element is one SourceLines line, in document order (including blank lines).
      return pre.children.filter(line => line.nodeType === 1).map(line => {
        const lineIndex = nodes.backendNodeId.indexOf(line.backendNodeId);
        return layout.nodeIndex.flatMap((index, position) => {
          const text = strings[layout.text[position]];
          return pseudos.has(index) && nodes.parentIndex[index] === lineIndex && text ? [text] : [];
        });
      });
    } finally { await session.detach(); }
  };
  const wrapping = [];
  for (const width of [1440, 640]) {
    await page.setViewportSize({width, height:900});
    await page.evaluate(async () => {
      await document.fonts.ready;
      document.activeElement?.blur();
      window.getSelection()?.removeAllRanges();
      document.querySelector('.document-scroll[data-active="true"]').scrollTo(0, 0);
    });
    await page.mouse.move(width - 2, 2);
    const geometry = await sourceView.locator('pre').evaluate(pre => {
      const lines = [...pre.querySelectorAll('.source-line')];
      const longLines = lines.filter(line => line.textContent.startsWith('A long paragraph') || line.textContent.startsWith('<https://'));
      return {
        clientWidth:pre.clientWidth, scrollWidth:pre.scrollWidth,
        pageWidth:document.documentElement.clientWidth, pageScrollWidth:document.documentElement.scrollWidth,
        lineCount:lines.length,
        longLines:longLines.map(line => {
          const range = document.createRange(); range.selectNodeContents(line);
          // pre-wrap can return a separate rectangle for a row's hanging trailing space.
          const rows = new Map();
          for (const rect of range.getClientRects()) {
            const top = Math.round(rect.top);
            rows.set(top, Math.min(rows.get(top) ?? Infinity, rect.left));
          }
          const starts = [...rows.values()];
          return {rows:rows.size, aligned:starts.every(left => Math.abs(left - starts[0]) <= 1)};
        }),
        dpr:devicePixelRatio, scale:visualViewport.scale, zoom:getComputedStyle(document.documentElement).zoom,
      };
    });
    const numbers = await renderedNumbers();
    wrapping.push({width, ...geometry, numbers});
    result[`sourceLineNumbersConsecutive${width}`] = numbers.length === wrappingSource.trimEnd().split('\n').length &&
      numbers.every((labels, index) => labels.length === 1 && labels[0] === String(index + 1));
    result[`sourceFits${width}`] = geometry.scrollWidth <= geometry.clientWidth && geometry.pageScrollWidth <= geometry.pageWidth;
    result[`wrappedLinesKeepNumberAndTextAxis${width}`] = geometry.lineCount === wrappingSource.trimEnd().split('\n').length &&
      geometry.longLines.length === 2 && geometry.longLines.every(line => line.rows > 1 && line.aligned);
    result[`wrappingPreservesSource${width}`] = await sourceText() === wrappingSource;
    if (screenshots) await page.screenshot({path:`tmp/source-wrap-captures/wrapping-${width}.png`});
    const selected = await sourceView.locator('pre').evaluate(pre => {
      const range = document.createRange(); range.selectNodeContents(pre);
      const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
      return selection.toString();
    });
    // Chromium's native preformatted selection omits the terminal newline (as in footnotes).
    result[`selectedSourceExact${width}`] = selected === wrappingSource.replace(/\n$/, '');
    await page.keyboard.press('ControlOrMeta+c');
    const copied = (await page.evaluate(() => navigator.clipboard.readText())).replaceAll('\r\n', '\n');
    result[`copiedSourceExact${width}`] = copied === selected;
  }
  result.wrappingDoesNotWrite = await markdown(wrappingPath, 'wrapping.md') === wrappingSource &&
    await page.getByTestId('status').innerText() === '';
  await page.evaluate(() => window.getSelection()?.removeAllRanges());

  const failed = Object.entries(result).filter(([, value]) => value !== true);
  if (failed.length > 0 || problems.length > 0) {
    throw new Error(`Source view failed: ${JSON.stringify({result, wrapping, consoleErrors: problems})}`);
  }
  return {...result, wrapping, consoleErrors: problems};
}
