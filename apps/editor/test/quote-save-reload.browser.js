// Run with pnpm browser:test quote-save-reload (prepare is automatic).
// Types an apostrophe and straight double quotes into paragraphs of a real scratch file, saves,
// reloads and reopens it, and checks that the file and the Editor keep the text exactly as typed
// (no typographic quotes). The file is a scratch copy under the repository's ignored tmp/ directory.
async page => {
  await page.unrouteAll();
  await page.reload();
  await page.locator('[data-testid="status"][data-operation="Ready"]').waitFor({state:'attached'});

  const origin = page.url().split('/').slice(0, 3).join('/');
  const defaultPath = (await (await page.request.get(`${origin}/api/document`)).json()).path;
  const separator = defaultPath.includes('\\') ? '\\' : '/';
  const root = defaultPath.split(separator).slice(0, -4).join(separator);
  const filePath = [root, 'tmp', 'quote-save-reload', 'quotes.md'].join(separator);
  const markdown = async () => {
    const response = await page.request.get(`${origin}/document/quotes.md?path=${encodeURIComponent(filePath)}`);
    if (response.status() !== 200) throw new Error(`Prepare ${filePath} first`);
    return (await response.text()).replaceAll('\r\n', '\n');
  };
  const apostrophe = "The first paragraph. Don't panic.";
  const quoted = 'The second paragraph. The state is "READY".';
  if (await markdown() !== '# Quote save reload\n\nThe first paragraph.\n\nThe second paragraph.\n') {
    throw new Error('Scratch document is not a fresh quotes.md copy');
  }
  const open = async () => {
    await page.getByRole('button', {name:'Open…'}).click();
    await page.getByTestId('file-path').fill(filePath);
    await page.getByRole('dialog').getByRole('button', {name:'Open', exact:true}).click();
    await page.locator('[data-testid="status"][data-operation="Ready"]').waitFor({state:'attached'});
    if (!(await page.getByTestId('current-file').getAttribute('title')).includes('quote-save-reload')) {
      throw new Error('Scratch file was not opened');
    }
  };
  const typeAtEnd = async (text, typed) => {
    await page.getByText(text, {exact:true}).click();
    await page.keyboard.press('End');
    await page.keyboard.type(typed);
  };

  await open();
  await typeAtEnd('The first paragraph.', " Don't panic.");
  await typeAtEnd('The second paragraph.', ' The state is "READY".');
  await page.getByRole('button', {name:'Save', exact:true}).click();
  const status = page.getByTestId('status');
  await page.locator('[data-testid="status"]:is([data-operation="Saved"], [data-operation="Save failed"])').waitFor({state:'attached'});
  if (await status.getAttribute('data-operation') !== 'Saved') {
    throw new Error(`Save failed: ${await page.locator('body').innerText()}`);
  }
  const saved = await markdown();

  await page.reload();
  await page.locator('[data-testid="status"][data-operation="Ready"]').waitFor({state:'attached'});
  await open();
  const paragraphs = await page.locator('[data-testid="document-editor"] [data-block="paragraph"]').allInnerTexts();
  const result = {
    savedAsTyped: saved === `# Quote save reload\n\n${apostrophe}\n\n${quoted}\n`,
    reloadedAsTyped: JSON.stringify(paragraphs) === JSON.stringify([apostrophe, quoted]),
    noTypographicQuotes: !/[‘’“”]/.test(saved + paragraphs.join('')),
  };
  const failed = Object.entries(result).filter(([, value]) => value !== true);
  if (failed.length > 0) throw new Error(`Quote Save/Reload failed: ${JSON.stringify({result, saved, paragraphs})}`);
  return result;
}
