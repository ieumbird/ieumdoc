// Run with pnpm browser:test reference-save-reload.
// Edits an unrelated paragraph, saves and reloads a real file, then checks that the {eq} role
// stays a semantic reference and `[](#...)` fragment links stay ordinary links (issue #12).
// The file is a scratch copy under the repository's ignored tmp/ directory; prepare it first
// (see docs/test/TEST_GUIDE.md). The scenario writes that copy only.
async (page, { openPath, openDocument }) => {
  await page.unrouteAll();
  await page.reload();
  await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});

  const origin = page.url().split('/').slice(0, 3).join('/');
  const defaultPath = (await (await page.request.get(`${origin}/api/document`)).json()).path;
  const separator = defaultPath.includes('\\') ? '\\' : '/';
  const root = defaultPath.split(separator).slice(0, -4).join(separator);
  const filePath = [root, 'tmp', 'reference-save-reload', 'technical-document.md'].join(separator);
  const markdown = async () => {
    const response = await page.request.get(`${origin}/document/technical-document.md?path=${encodeURIComponent(filePath)}`);
    if (response.status() !== 200) throw new Error(`Prepare ${filePath} first`);
    return (await response.text()).replaceAll('\r\n', '\n');
  };
  const reference = 'See [Figure](#fig-control) and {eq}`eq-current`.';
  const link = 'The rated current follows from [Equation](#eq-current).';
  const before = await markdown();
  if (!before.includes(reference) || !before.includes(link) || before.includes('ReferenceSaveMarker')) {
    throw new Error('Scratch document is not a fresh technical-document.md copy');
  }

  await openDocument(page, filePath);
  await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
  if (!(await page.getByTestId('current-file').getAttribute('title')).includes('reference-save-reload')) {
    throw new Error('Scratch file was not opened');
  }
  await page.getByText('The current reference is calculated from the active power command.', {exact:true}).filter({visible:true}).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' ReferenceSaveMarker');
  await page.getByRole('button', {name:'Save', exact:true}).click();
  await page.getByText('Saved', {exact:true}).filter({visible:true}).waitFor();

  await page.reload();
  await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
  await openPath(page, filePath);
  const article = await page.getByRole('article').innerText();
  const saved = await markdown();
  const result = {
    editSavedAndReloaded: article.includes('ReferenceSaveMarker') && saved.includes('ReferenceSaveMarker'),
    semanticReferenceKept: saved.includes(reference),
    fragmentLinkKept: saved.includes(link),
    referenceNotFlattened: !saved.includes('[Figure](#fig-control) and [Equation](#eq-current)'),
    referenceParagraphEditable: await page.locator('[data-document-tab][data-active=true] p.paragraph').filter({hasText:'See Figure'}).count() === 1,
  };
  const failed = Object.entries(result).filter(([, value]) => value !== true);
  if (failed.length > 0) throw new Error(`Reference Save/Reload failed: ${JSON.stringify(result)}`);
  return result;
}
