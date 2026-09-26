// Run with pnpm browser:test writeability-preflight (prepare is automatic).
// Opens a scratch document with front matter, which Core cannot write as canonical Markdown:
// the document is shown, the reason is visible at once, Save and Source stay blocked even after
// an edit, and the file is untouched. Opening a writable document then restores the normal
// Save flow, and reopening the first one brings the warning back. Scratch files live under the
// repository's ignored tmp/ directory.
async page => {
  await page.unrouteAll();
  await page.reload();
  await page.locator('[data-testid="status"][data-operation="Ready"]').waitFor({state:'attached'});

  const origin = page.url().split('/').slice(0, 3).join('/');
  const defaultPath = (await (await page.request.get(`${origin}/api/document`)).json()).path;
  const separator = defaultPath.includes('\\') ? '\\' : '/';
  const root = defaultPath.split(separator).slice(0, -4).join(separator);
  const scratch = name => [root, 'tmp', 'writeability-preflight', name].join(separator);
  const read = async name => {
    const response = await page.request.get(`${origin}/document/${name}?path=${encodeURIComponent(scratch(name))}`);
    if (response.status() !== 200) throw new Error(`Prepare ${scratch(name)} first`);
    return (await response.body()).toString('utf8');
  };
  const blockedSource = '---\ntitle: Example\n---\n\n# Front matter\n\nThis document has front matter.\n';
  const writableSource = '# Writable\n\nThis document can be saved.\n';
  if ((await read('front-matter.md')).replaceAll('\r\n', '\n') !== blockedSource ||
      (await read('writable.md')).replaceAll('\r\n', '\n') !== writableSource) {
    throw new Error('Scratch documents are not fresh copies');
  }
  const blockedBytes = await read('front-matter.md');

  // Every write or Source request; the listener is removed before returning (the page is reused).
  // It runs in the CLI daemon, where a throwing listener would end the session: plain string checks only.
  const saves = [];
  const recordWrites = request => {
    if (request.method() !== 'GET' && request.url().startsWith(`${origin}/api/document`)) saves.push(request.url());
  };
  const open = async name => {
    await page.getByRole('button', {name:'Open…'}).click();
    await page.getByTestId('file-path').fill(scratch(name));
    await page.getByRole('dialog').getByRole('button', {name:'Open', exact:true}).click();
    await page.locator('[data-testid="status"][data-operation="Ready"]').waitFor({state:'attached'});
    await page.getByRole('dialog').waitFor({state:'detached'});
    if (!(await page.getByTestId('current-file').getAttribute('title')).endsWith(name)) throw new Error(`${name} was not opened`);
  };
  const typeAtEnd = async (text, typed) => {
    await page.getByText(text, {exact:true}).click();
    await page.keyboard.press('End');
    await page.keyboard.type(typed);
  };
  const warning = page.getByTestId('writeability-warning');
  const status = page.getByTestId('status');
  const save = page.locator('.top-bar [data-testid="save"]');
  const result = {};
  let message = '';
  page.on('request', recordWrites);
  try {
    // 1-3. The unwritable document opens and shows its content and the reason before any edit.
    await open('front-matter.md');
    await warning.waitFor();
    message = await warning.innerText();
    result.documentShown = await page.getByRole('heading', {name:'Front matter'}).count() === 1 &&
      await page.getByText('This document has front matter.', {exact:true}).count() === 1 &&
      await page.locator('[data-block="unsupported"]', {hasText:'title: Example'}).count() === 1;
    result.reasonShownAtOpen = message.includes('cannot save it safely') && message.includes('front matter');
    result.statusCannotSave = await status.innerText() === 'Cannot save';
    result.openIsNotAnError = await page.getByTestId('error').count() === 0 &&
      await status.getAttribute('data-operation') === 'Ready';

    // 4. Editing is possible, but Save and Source stay blocked and nothing is posted.
    await typeAtEnd('This document has front matter.', ' Edited');
    result.editKeptBlocked = await status.innerText() === 'Cannot save' &&
      await save.getAttribute('aria-disabled') === 'true' &&
      await page.getByTestId('view-source').getAttribute('aria-disabled') === 'true';
    // Real click events bypass the disabled look; the handlers must still refuse. A Save would set
    // "Saving…" and send its request in the same task, so after the next frame both would show.
    await save.dispatchEvent('click');
    await page.getByTestId('view-source').dispatchEvent('click');
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    result.saveAndSourceNotRequested = saves.length === 0 && await status.getAttribute('data-operation') === 'Ready' &&
      await page.getByTestId('error').count() === 0 && await page.getByTestId('source-view').count() === 0 &&
      await warning.count() === 1;

    // 5. The file is byte-for-byte unchanged.
    result.fileUnchanged = await read('front-matter.md') === blockedBytes;

    // 6. Unsaveable edits do not trap the user; a writable document restores the normal flow.
    await open('writable.md');
    await warning.waitFor({state:'detached'});
    result.writableRestored = await status.innerText() === '' && await save.getAttribute('aria-disabled') === null &&
      await page.getByTestId('view-source').getAttribute('aria-disabled') === null;
    await typeAtEnd('This document can be saved.', ' Saved once.');
    await save.click();
    await page.locator('[data-testid="status"]:is([data-operation="Saved"], [data-operation="Save failed"])').waitFor({state:'attached'});
    result.writableSaves = await status.getAttribute('data-operation') === 'Saved' &&
      (await read('writable.md')).replaceAll('\r\n', '\n') === '# Writable\n\nThis document can be saved. Saved once.\n';

    // And back: reopening the unwritable document shows the warning again.
    await open('front-matter.md');
    await warning.waitFor();
    result.warningReturns = await status.innerText() === 'Cannot save' && await read('front-matter.md') === blockedBytes;
  } finally {
    page.off('request', recordWrites);
  }

  const failed = Object.entries(result).filter(([, value]) => value !== true);
  if (failed.length > 0) throw new Error(`Writeability preflight failed: ${JSON.stringify({result, message, saves})}`);
  return result;
}
