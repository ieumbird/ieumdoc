// Real scratch files: preservation, read-only diagnostics, original source, and repair → Reload.
async page => {
  await page.unrouteAll();
  await page.reload();
  const ready = () => page.locator('[data-testid="status"][data-operation="Ready"]').waitFor({state:'attached'});
  await ready();
  const origin = page.url().split('/').slice(0, 3).join('/');
  const defaultPath = (await (await page.request.get(`${origin}/api/document`)).json()).path;
  const sep = defaultPath.includes('\\') ? '\\' : '/';
  const root = defaultPath.split(sep).slice(0, -4).join(sep);
  const path = name => [root, 'tmp', 'writeability-preflight', name].join(sep);
  const read = async name => (await (await page.request.get(`${origin}/api/document?path=${encodeURIComponent(path(name))}`)).json());
  const open = async name => {
    await page.getByRole('button', {name:'Open…'}).click();
    await page.getByTestId('file-path').fill(path(name));
    await page.getByRole('dialog').getByRole('button', {name:'Open', exact:true}).click();
    await ready();
    await page.getByRole('dialog').waitFor({state:'detached'});
  };
  const reload = async () => { await page.getByRole('button', {name:'Reload',exact:true}).click(); await ready(); };
  const save = page.locator('.top-bar [data-testid="save"]');
  const source = page.getByTestId('view-source');
  const editor = page.locator('.document-editor');
  const warning = page.getByTestId('writeability-warning');
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const typeEnd = async (text, added) => {
    await page.getByText(text, {exact:true}).click();
    // Native click selection reaches ProseMirror asynchronously after leaving an atom.
    await page.waitForFunction(expected => {
      const editor = document.querySelector('.document-editor').editor;
      return editor.state.selection.empty && editor.state.selection.$from.parent.textContent === expected;
    }, text);
    await page.keyboard.press('End');
    await page.keyboard.type(added);
  };
  const result = {};
  await open('preserved-markdown.md');
  assert(await warning.count() === 0 && await editor.getAttribute('contenteditable') === 'true', 'Preservable document must allow body editing');
  const originals = page.locator('.original-content');
  await originals.filter({hasText:'Front matter'}).locator('summary').click();
  await originals.filter({hasText:'Markdown image'}).locator('summary').click();
  assert(await originals.filter({hasText:'Front matter'}).locator('pre').innerText().then(t => t.includes("name: 'Kim'")), 'Metadata original missing');
  assert(await originals.filter({hasText:'Markdown image'}).locator('pre').innerText().then(t => t.includes('![Diagram alt](./diagram.svg "Diagram title")')), 'Image original missing');
  assert(await originals.filter({hasText:'paragraph (image)'}).count() === 1, 'Inline image must not silently flatten');
  const alignments = async () => page.locator('.table tr').first().locator('th').evaluateAll(cells => cells.map(cell => getComputedStyle(cell).textAlign));
  assert(JSON.stringify(await alignments()) === JSON.stringify(['left','center','right']), 'Visual table alignment differs');
  await typeEnd('Editable body.', ' Saved.');
  await typeEnd('alpha', ' edited');
  assert(await editor.innerText().then(t => t.includes('Editable body. Saved.') && t.includes('alpha edited')), 'Typing was rejected: ' + await editor.innerText() + ' | ' + await page.locator('.app-header').innerText());
  await save.click();
  await page.locator('[data-testid="status"][data-operation="Saved"]').waitFor({state:'attached'});
  const saved = await read('preserved-markdown.md');
  assert(saved.source.startsWith("---\ntitle: Example\n# Preserve YAML spelling and comments\nauthors:\n  - name: 'Kim'\n---\n"), 'Front matter changed');
  assert(saved.source.includes('![Diagram alt](./diagram.svg "Diagram title")') && saved.source.includes('Inline ![Inline alt](./diagram.svg) image.'), 'Image meaning changed');
  await reload();
  assert(await page.getByText('Editable body. Saved.',{exact:true}).count() === 1 && await page.getByText('alpha edited',{exact:true}).count() === 1, 'Edits did not persist: ' + JSON.stringify({saved:saved.source,text:await editor.innerText()}));
  assert(JSON.stringify(await alignments()) === JSON.stringify(['left','center','right']), 'Alignment lost after Reload');
  result.preservedSaveReload = true;

  await open('blocked-markdown.md');
  const before = await read('blocked-markdown.md');
  const message = await warning.innerText();
  assert(message.includes('Read-only:') && message.includes('Block 2') && message.includes('checked') && message.includes('then Reload'), 'Missing location, reason or recovery path');
  assert(await editor.getAttribute('contenteditable') === 'false', 'Blocked document accepts typing');
  await page.getByText('Editable after repair.', {exact:true}).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' MUST NOT APPEAR');
  assert(!await editor.innerText().then(t => t.includes('MUST NOT APPEAR')), 'Unsaveable input accepted');
  assert(await page.locator('.block-gutter').count() === 0, 'Read-only document exposes structural controls');
  // Like a Figure, a read-only Equation offers no Edit.
  assert(await page.locator('[data-block="equation"]').getByRole('button',{name:'Edit',exact:true}).count() === 0, 'Equation edit bypasses read-only');
  await page.getByTestId('inline-math').locator('.inline-math-rendered').click();
  assert(await page.getByTestId('inline-math-form').count() === 0, 'Inline math edit bypasses read-only');
  await save.dispatchEvent('click');
  assert((await read('blocked-markdown.md')).source === before.source, 'Blocked file changed');
  await source.click();
  assert(await page.getByTestId('source-view').locator('pre').textContent() === before.source, 'Original Source unavailable');
  result.blockedReadOnlyAndOriginal = true;

  // A second Core-backed client repairs the disk file through existing removeBlock semantics.
  // The current UI must not assume the opening verdict still applies after Reload.
  const repair = await page.request.post(`${origin}/api/document`, {data:{path:path('blocked-markdown.md'),revision:before.revision,deletes:[[1]],order:before.document.blocks.filter(block => block.path[0] !== 1).map(block => ({path:block.path,part:0}))}});
  assert(repair.ok(), `External Core repair failed: ${await repair.text()}`);
  await reload();
  assert(await warning.count() === 0 && await editor.getAttribute('contenteditable') === 'true', 'Repaired file was not reevaluated');
  await typeEnd('Editable after repair.', ' Recovered.');
  await save.click();
  await page.locator('[data-testid="status"][data-operation="Saved"]').waitFor({state:'attached'});
  await reload();
  assert(await page.getByText('Editable after repair. Recovered.',{exact:true}).count() === 1, 'Repaired file cannot save');
  result.repairReevaluated = true;
  return result;
}
