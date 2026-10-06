// Choose a folder, move through it in the sidebar and open its documents; unsaved work blocks switching.
async page => {
  await page.unrouteAll();
  await page.reload();
  const ready = () => page.locator('[data-testid="status"][data-operation="Ready"]').waitFor({state:'attached'});
  await ready();
  const origin = page.url().split('/').slice(0, 3).join('/');
  const defaultPath = (await (await page.request.get(`${origin}/api/document`)).json()).path;
  const sep = defaultPath.includes('\\') ? '\\' : '/';
  const root = defaultPath.split(sep).slice(0, -4).join(sep);
  const folder = [root, 'tmp', 'folder-navigation'].join(sep);
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const section = page.getByTestId('folder');
  const items = () => section.locator('.sidebar-folder-item').allInnerTexts();
  const item = name => section.getByRole('button', {name, exact:true});
  const current = async () => (await page.getByTestId('current-file').getAttribute('title')).split(sep).pop();
  const result = {};

  // A file is not a folder: the dialog says so and nothing is listed.
  await page.getByRole('button', {name:'Open folder…'}).click();
  await page.getByTestId('folder-path').fill([folder, 'index.md'].join(sep));
  await page.getByRole('dialog').getByRole('button', {name:'Open', exact:true}).click();
  await page.getByRole('dialog').getByText('folder path must point to a directory').waitFor();
  result.rejectsFile = await section.count() === 0;

  // The chosen folder lists sub-folders first, then Markdown files, without opening any.
  await page.getByTestId('folder-path').fill(folder);
  await page.getByRole('dialog').getByRole('button', {name:'Open', exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'detached'});
  await section.waitFor();
  assert(JSON.stringify(await items()) === JSON.stringify(['guides', 'index.md', 'notes.md']), 'Folder listing: ' + JSON.stringify(await items()));
  result.listsFolder = await current() === 'technical-document.md';

  await item('index.md').click();
  await page.waitForFunction(() => document.querySelector('[data-testid="current-file"]')?.title.endsWith('index.md'));
  await ready();
  result.opensDocument = await item('index.md').getAttribute('aria-current') === 'page';

  // Into a sub-folder and back up; the chosen folder is the top.
  await item('guides').click();
  await item('install.md').waitFor();
  assert(JSON.stringify(await items()) === JSON.stringify(['folder-navigation', 'install.md']), 'Sub-folder listing: ' + JSON.stringify(await items()));
  await item('install.md').click();
  await page.waitForFunction(() => document.querySelector('[data-testid="current-file"]')?.title.endsWith('install.md'));
  await ready();
  await item('Up to folder-navigation').click();
  await item('notes.md').waitFor();
  result.browsesWithin = await item(/^Up to/).count() === 0;

  // Unsaved work stays: another document does not open until it is saved or discarded.
  await page.locator('.document-editor > .paragraph').first().click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Draft.');
  await item('notes.md').click();
  await page.getByTestId('error').getByText(/Save or discard the current changes/).waitFor();
  result.keepsUnsavedWork = await current() === 'install.md' &&
    (await page.locator('.document-editor > .paragraph').first().innerText()).endsWith('Draft.');
  await page.getByRole('button', {name:'Reload', exact:true}).click();
  await page.getByRole('button', {name:'Discard and reload', exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'detached'});
  await ready();

  // A document created inside the folder shows up without a watch.
  await page.getByRole('button', {name:'New', exact:true}).click();
  await page.getByTestId('new-file-path').fill([folder, 'added.md'].join(sep));
  await page.getByRole('dialog').getByRole('button', {name:'Create', exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'detached'});
  await item('added.md').waitFor();
  result.listsCreated = await item('added.md').getAttribute('aria-current') === 'page';

  await page.getByRole('button', {name:'Close folder', exact:true}).click();
  result.closes = await section.count() === 0;
  for (const [name, passed] of Object.entries(result)) assert(passed, `${name} failed`);
  return result;
}
