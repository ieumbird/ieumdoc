// Run with pnpm exec playwright-cli run-code --filename=apps/editor/test/table-cell-editing.browser.js.
// Edits header and body cells of a Markdown table, saves and reloads a real file, and checks that
// Enter/Bold cannot change the table and that read-only cells stay unchanged.
// Files are scratch copies under the repository's ignored tmp/ directory; prepare them first
// (see docs/test/TEST_GUIDE.md). The scenario writes those copies only.
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
  const dir = [root, 'tmp', 'table-cell-editing'].join(separator);
  const technical = [dir, 'technical-document.md'].join(separator);
  const mixed = [dir, 'mixed-table.md'].join(separator);
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
  const table = page.locator('[data-block="table"]');
  const cell = text => table.locator('[data-table-cell]', {hasText: new RegExp(`^${text}$`)});
  const typeAtEnd = async (text, suffix) => {
    await cell(text).click();
    await page.keyboard.press('End');
    await page.keyboard.type(suffix);
  };

  const before = await markdown(technical, 'technical-document.md');
  if (!before.includes('| Port | Type |') || before.includes('Port name')) {
    throw new Error('Scratch document is not a fresh technical-document.md copy');
  }
  const result = {};
  await open(technical);
  const rows = await table.locator('tr').count();
  await typeAtEnd('Port', ' name');
  await typeAtEnd('AC', '-side');
  await page.keyboard.press('Enter');
  await page.keyboard.press('ControlOrMeta+b');
  await page.keyboard.type('!');
  result.structureUnchanged = await table.locator('tr').count() === rows &&
    await table.locator('[data-table-cell] strong').count() === 0;
  result.typedInCells = await cell('Port name').count() === 1 && await cell('AC-side!').count() === 1;
  await page.getByRole('button', {name:'Save', exact:true}).click();
  await page.getByText('Saved', {exact:true}).waitFor();

  await open(technical);
  const saved = await markdown(technical, 'technical-document.md');
  result.savedAndReloaded = await cell('Port name').count() === 1 && await cell('AC-side!').count() === 1;
  result.canonicalMarkdown = /\| Port name \| Type +\|\n\| -+ \| -+ \|\n\| U +\| AC-side! \|\n\| P +\| DC +\|\n$/.test(saved);
  result.otherSemanticsKept = saved.includes('See [](#fig-control) and {eq}`eq-current`.') &&
    saved.includes(':label: eq-current') && saved.includes(':name: fig-control');
  result.headerCellsStayHeaders = await table.locator('th[data-table-cell]').count() === 2;

  await open(mixed);
  const readonly = table.locator('[data-readonly-cell]');
  result.readonlyCellShown = await readonly.count() === 1 && (await readonly.innerText()) === 'bold';
  await readonly.click();
  await page.keyboard.type('x');
  result.readonlyCellUnchanged = (await readonly.innerText()) === 'bold';
  result.consoleErrors = problems;
  const failed = Object.entries(result).filter(([key, value]) => key !== 'consoleErrors' && value !== true);
  if (failed.length > 0 || problems.length > 0) throw new Error(`Table cell editing failed: ${JSON.stringify(result)}`);
  return result;
}
