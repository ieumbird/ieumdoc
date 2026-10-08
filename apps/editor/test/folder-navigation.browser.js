// Choose a folder, expand it as a tree in the sidebar and open its documents; unsaved work blocks switching.
async (page, {screenshots = false} = {}) => {
  await page.unrouteAll();
  await page.locator('[data-testid="status"][data-operation="Ready"]').waitFor({state:'attached'});
  await page.evaluate(() => localStorage.removeItem('ieumdoc.recentFolders'));
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
  const items = () => section.locator('.sidebar-tree-item').allInnerTexts();
  const item = name => section.getByRole('button', {name, exact:true});
  const row = name => section.getByRole('treeitem', {name, exact:true});
  const focusedRow = () => page.evaluate(() => document.activeElement?.querySelector('.sidebar-tree-name')?.textContent);
  const folderMenu = async name => {
    await item('More actions').click();
    await page.getByRole('menuitem', {name, exact:true}).click();
  };
  const current = async () => (await page.getByTestId('current-file').getAttribute('title')).split(sep).pop();
  const result = {};
  let createRequests = 0;
  const folderRequests = [];
  page.on('request', request => {
    if (request.method() === 'PUT' && request.url().split('?')[0] === `${origin}/api/document`) createRequests++;
    if (request.url().startsWith(`${origin}/api/folder?`)) folderRequests.push(queryPath(request.url()));
  });
  const dialog = page.getByRole('dialog');
  const field = page.getByTestId('folder-path');
  const open = page.getByTestId('folder-open');
  const option = name => dialog.getByRole('option', {name, exact:true});
  const enterFolder = path => field.fill(path + sep);
  const requestedFolder = url => decodeURIComponent((url.split('?path=')[1] ?? '').replace(/\+/g, ' '));
  // The `path` query parameter of a Host request (the scenario runs without the URL global).
  const queryPath = url => {
    const part = (url.split('?')[1] ?? '').split('&').find(item => item.startsWith('path='));
    return part === undefined ? null : decodeURIComponent(part.slice('path='.length).replace(/\+/g, ' '));
  };

  // Folder browsing never changes the sidebar or the open document until Open.
  await page.getByRole('button', {name:'Open folder…'}).click();
  const home = dialog.getByRole('button', {name:'Home', exact:true});
  await home.waitFor();
  const homePath = await home.getAttribute('title');
  await home.click();
  assert(await field.inputValue() === (homePath.endsWith(sep) ? homePath : homePath + sep), 'Home starts at the Host home folder');
  result.startsFromHostPlace = true;
  await enterFolder(folder);
  await option('guides').waitFor();
  await option('guides').click();
  await page.getByTestId('folder-picker-meta').getByText(/1 Markdown file here/).waitFor();
  await dialog.getByRole('button', {name:'Up', exact:true}).click();
  await option('guides').waitFor();
  await option('guides').click();
  await dialog.getByRole('navigation', {name:'Folder location'}).getByRole('button', {name:'folder-navigation', exact:true}).click();
  await option('guides').waitFor();
  await dialog.getByRole('button', {name:'Cancel', exact:true}).click();
  await dialog.waitFor({state:'detached'});
  result.cancelKeepsDocument = await section.count() === 0 && await current() === 'technical-document.md';

  await page.getByRole('button', {name:'Open folder…'}).click();
  await field.fill([folder, 'g'].join(sep));
  await option('guides').waitFor();
  assert(await dialog.getByRole('option').count() === 1, 'Partial path must filter the folders');
  await field.press('Tab');
  await page.getByTestId('folder-picker-meta').getByText(/1 Markdown file here/).waitFor();
  assert(await field.inputValue() === [folder, 'guides', ''].join(sep), 'Tab completes into the folder');
  await field.press('Backspace');
  await option('guides').waitFor();
  assert(await field.inputValue() === folder + sep, 'Backspace returns to the parent');
  result.completesAndGoesUp = true;

  // A late answer for a previous directory cannot replace the current list.
  let release;
  let markStarted;
  const held = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { markStarted = resolve; });
  const delayedPath = [folder, 'guides'].join(sep);
  const handler = async route => {
    const requested = requestedFolder(route.request().url()).replace(/[\\/]+$/, '');
    if (requested !== delayedPath) return route.continue();
    const response = await route.fetch();
    markStarted();
    await held;
    await route.fulfill({response});
  };
  await page.route('**/api/folder-browse?*', handler);
  try {
    await enterFolder(delayedPath);
    await started;
    await enterFolder(folder);
    await option('guides').waitFor();
    const answered = page.waitForResponse(response => requestedFolder(response.url()) === delayedPath + sep);
    release();
    await answered;
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    result.keepsNewerListing = await option('guides').count() === 1 && await field.inputValue() === folder + sep;
  } finally {
    release();
    await page.unroute('**/api/folder-browse?*', handler);
  }

  // Highlight is completion focus; Enter always opens the typed path, not its highlighted child.
  await field.press('ArrowDown');
  assert(await dialog.getByRole('option', {selected:true}).count() === 1, 'ArrowDown highlights a folder');
  await field.press('Enter');
  await dialog.waitFor({state:'detached'});
  await section.waitFor();
  result.enterOpensTypedFolder = await section.getByTitle(folder, {exact:true}).count() === 1;
  const refreshed = page.waitForResponse(response => response.url().includes('/api/folder-browse?') &&
    requestedFolder(response.url()) === folder + sep);
  await folderMenu('Open folder…');
  await refreshed;
  await option('guides').waitFor();
  await field.press('Escape');
  await dialog.waitFor({state:'detached'});
  result.refreshesOnReopen = await section.getByTitle(folder, {exact:true}).count() === 1;
  await folderMenu('Close folder');
  await page.reload();
  await ready();
  assert(await section.count() === 0, 'Reload does not restore a chosen sidebar folder');
  await page.getByRole('button', {name:'Open folder…'}).click();
  const recent = dialog.getByRole('region', {name:'Recent folders'});
  await recent.getByRole('button', {name:folder, exact:true}).click();
  await option('guides').waitFor();
  result.remembersRecent = await field.inputValue() === folder + sep;
  await field.fill([folder, '자'].join(sep));
  await option('자료').waitFor();
  await field.press('ArrowRight');
  await page.getByTestId('folder-picker-meta').getByText(/1 Markdown file here/).waitFor();
  assert(await field.inputValue() === [folder, '자료', ''].join(sep), 'Right completes a Korean folder path');
  await field.press('Backspace');
  await option('guides').waitFor();
  result.completesKoreanPath = true;

  // The dialog remains inside both desktop and narrow viewports; Open/Cancel stay reachable.
  await page.setViewportSize({width:1440, height:1000});
  if (screenshots) await page.screenshot({path: 'tmp/picker-capture/04-final.png'});
  await page.setViewportSize({width:375, height:812});
  await field.fill(folder + sep + 'long-folder-name-'.repeat(12));
  const bounds = await dialog.boundingBox();
  const buttonBounds = await open.boundingBox();
  assert(bounds.x >= 0 && bounds.x + bounds.width <= 375 && bounds.y >= 0 && bounds.y + bounds.height <= 812, 'Dialog fits the viewport');
  assert(buttonBounds.x >= bounds.x && buttonBounds.x + buttonBounds.width <= bounds.x + bounds.width, 'Long Open label fits the dialog');
  assert(await dialog.getByRole('button', {name:'Cancel', exact:true}).isVisible(), 'Cancel remains reachable');
  if (screenshots) await page.screenshot({path: 'tmp/picker-capture/05-narrow.png'});
  await page.setViewportSize({width:1280, height:720});
  result.fitsViewport = true;

  await enterFolder([folder, 'missing'].join(sep));
  await page.getByTestId('folder-picker-meta').getByText('folder does not exist', {exact:true}).waitFor();
  await open.click();
  await dialog.getByRole('alert').getByText('folder does not exist', {exact:true}).waitFor();
  result.keepsInvalidPath = await field.inputValue() === [folder, 'missing', ''].join(sep) && await section.count() === 0;

  // A file is not a folder: the dialog says so and nothing is listed.
  await page.getByTestId('folder-path').fill([folder, 'index.md'].join(sep));
  await open.click();
  await page.getByRole('dialog').getByText('folder path must point to a directory').waitFor();
  result.rejectsFile = await section.count() === 0;

  // The chosen folder lists sub-folders first, then Markdown files, without opening any.
  await page.getByTestId('folder-path').fill(`"${folder}"`);
  await open.click();
  await page.getByRole('dialog').waitFor({state:'detached'});
  await section.waitFor();
  const hostItems = (await (await page.request.get(`${origin}/api/folder?root=${encodeURIComponent(folder)}`)).json()).entries.map(entry => entry.name);
  assert(JSON.stringify(await items()) === JSON.stringify(hostItems), 'The sidebar keeps the Host listing order: ' + JSON.stringify(await items()));
  result.listsFolder = await current() === 'technical-document.md';

  await row('index.md').click();
  await page.waitForFunction(() => document.querySelector('[data-testid="current-file"]')?.title.endsWith('index.md'));
  await ready();
  result.opensDocument = await row('index.md').getAttribute('aria-current') === 'page';

  // A folder expands in place and only it is listed; its entries sit one level deeper.
  const guidesPath = [folder, 'guides'].join(sep);
  folderRequests.length = 0;
  await row('guides').click();
  await row('install.md').waitFor();
  assert(JSON.stringify(await items()) === JSON.stringify(['자료', 'guides', 'install.md', 'index.md', 'notes.md']), 'Expanded tree: ' + JSON.stringify(await items()));
  assert(JSON.stringify(folderRequests) === JSON.stringify([guidesPath]), 'Expanding lists only that folder: ' + JSON.stringify(folderRequests));
  result.expandsInPlace = await row('guides').getAttribute('aria-expanded') === 'true' && await row('install.md').getAttribute('aria-level') === '2' &&
    await row(/^Up to/).count() === 0;
  await row('install.md').click();
  await page.waitForFunction(() => document.querySelector('[data-testid="current-file"]')?.title.endsWith('install.md'));
  await ready();

  // Keyboard: Left goes to the parent and then collapses; Right expands and then enters;
  // Home, End and the arrows move through visible items; Enter toggles a folder.
  await row('install.md').focus();
  await page.keyboard.press('ArrowLeft');
  assert(await focusedRow() === 'guides', 'Left moves to the parent folder');
  await page.keyboard.press('ArrowLeft');
  await row('install.md').waitFor({state:'detached'});
  await page.keyboard.press('ArrowRight');
  await row('install.md').waitFor();
  await page.keyboard.press('ArrowRight');
  assert(await focusedRow() === 'install.md', 'Right on an expanded folder moves to its first entry');
  await page.keyboard.press('End');
  assert(await focusedRow() === 'notes.md', 'End moves to the last visible item');
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowDown');
  assert(await focusedRow() === 'guides', 'Home and Down move through visible items');
  await page.keyboard.press('Enter');
  await row('install.md').waitFor({state:'detached'});
  result.treeKeyboard = await current() === 'install.md' && await focusedRow() === 'guides';

  // A listing that answers after its folder was collapsed again neither reopens it nor moves focus.
  let releaseListing;
  let markListing;
  const heldListing = new Promise(resolve => { releaseListing = resolve; });
  const listingStarted = new Promise(resolve => { markListing = resolve; });
  const heldPath = [folder, '자료'].join(sep);
  const holdListing = async route => {
    if (queryPath(route.request().url()) !== heldPath) return route.continue();
    const response = await route.fetch();
    markListing();
    await heldListing;
    await route.fulfill({response});
  };
  await page.route('**/api/folder?*', holdListing);
  try {
    await row('자료').click();
    await listingStarted;
    await row('자료').click();
    await row('guides').click();
    await row('install.md').waitFor();
    const answered = page.waitForResponse(response => response.url().startsWith(`${origin}/api/folder?`) &&
      queryPath(response.url()) === heldPath);
    releaseListing();
    await answered;
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    result.lateListingKeepsTree = await row('자료').getAttribute('aria-expanded') === 'false' && await row('메모.md').count() === 0 &&
      await focusedRow() === 'guides';
  } finally {
    releaseListing();
    await page.unroute('**/api/folder?*', holdListing);
  }

  // Unsaved work stays: another document does not open until it is saved or discarded.
  await page.locator('.document-editor > .paragraph').first().click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Draft.');
  await row('notes.md').click();
  await page.getByTestId('error').getByText(/Save or discard the current changes/).waitFor();
  result.keepsUnsavedWork = await current() === 'install.md' &&
    (await page.locator('.document-editor > .paragraph').first().innerText()).endsWith('Draft.');
  await item('New file in folder').click();
  await page.getByTestId('new-file-name').fill('blocked');
  await dialog.getByRole('button', {name:'Create', exact:true}).click();
  await page.getByTestId('new-error').getByText(/Save or discard the current changes/).waitFor();
  assert(createRequests === 0 && await current() === 'install.md', 'Folder New preserves unsaved work without creating a file');
  await dialog.getByRole('button', {name:'Cancel', exact:true}).click();
  result.folderNewKeepsUnsavedWork = true;
  await page.getByRole('button', {name:'Reload', exact:true}).click();
  await page.getByRole('button', {name:'Discard and reload', exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'detached'});
  await ready();

  // New creates in the folder last expanded or collapsed, else in the open document's folder.
  // Opening index.md makes that the chosen folder itself, including at a narrow viewport.
  await row('index.md').click();
  await page.waitForFunction(() => document.querySelector('[data-testid="current-file"]')?.title.endsWith('index.md'));
  await ready();
  await page.setViewportSize({width:375, height:812});
  await item('New file in folder').click();
  const filename = page.getByTestId('new-file-name');
  assert(await page.getByTestId('new-file-directory').innerText() === folder, 'Root folder is the creation destination');
  await filename.fill('cancelled');
  await filename.press('Escape');
  await dialog.waitFor({state:'detached'});
  await item('New file in folder').click();
  assert(await filename.inputValue() === '', 'Reopening clears the cancelled name');
  await filename.fill('cancelled-again');
  await dialog.getByRole('button', {name:'Cancel', exact:true}).click();
  await dialog.waitFor({state:'detached'});
  assert(createRequests === 0 && await current() === 'index.md', 'Cancel and Escape do not create or switch documents');
  result.folderNewCancels = true;

  await item('New file in folder').click();
  for (const invalid of ['.', '..', '../outside.md', 'guides/nested.md', 'guides\\nested.md']) {
    await filename.fill(invalid);
    await filename.press('Enter');
    await page.getByTestId('new-error').getByText('Enter a file name without a directory path.', {exact:true}).waitFor();
  }
  assert(createRequests === 0, 'Rejected names never reach file creation');
  result.folderNewRejectsPaths = true;
  await filename.fill('added');
  await dialog.evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished)));
  const newBounds = await dialog.boundingBox();
  const createBounds = await dialog.getByRole('button', {name:'Create', exact:true}).boundingBox();
  assert(newBounds.x >= 0 && newBounds.x + newBounds.width <= 375 && newBounds.y >= 0 && newBounds.y + newBounds.height <= 812, 'New dialog fits the narrow viewport');
  assert(createBounds.x >= newBounds.x && createBounds.x + createBounds.width <= newBounds.x + newBounds.width, 'Create remains reachable');
  if (screenshots) await page.screenshot({path:'tmp/picker-capture/06-new-file.png'});
  await filename.press('Enter');
  await dialog.waitFor({state:'detached'});
  await row('added.md').waitFor();
  result.listsCreated = await row('added.md').getAttribute('aria-current') === 'page';
  assert(await page.getByTestId('current-file').getAttribute('title') === [folder, 'added.md'].join(sep), 'Omitted extension creates a Markdown file in the chosen folder');
  await page.setViewportSize({width:1280, height:720});

  const existingPath = [folder, 'index.md'].join(sep);
  const read = async path => (await page.request.get(`${origin}/api/document?path=${encodeURIComponent(path)}`)).json();
  const beforeExisting = await read(existingPath);
  await item('New file in folder').click();
  await filename.fill('index.md');
  await filename.press('Enter');
  await page.getByTestId('new-error').getByText('file already exists', {exact:true}).waitFor();
  assert((await read(existingPath)).revision === beforeExisting.revision && await current() === 'added.md', 'Existing file and current document survive a rejected creation');
  await dialog.getByRole('button', {name:'Cancel', exact:true}).click();
  result.folderNewKeepsExistingFile = true;

  // Creating in an expanded Korean sub-folder does not fall back to the chosen root.
  await row('자료').click();
  await row('메모.md').waitFor();
  await item('New file in folder').click();
  const subFolder = [folder, '자료'].join(sep);
  assert(await page.getByTestId('new-file-directory').innerText() === subFolder, 'The expanded sub-folder is the creation destination');
  await filename.fill('추가.md');
  await filename.press('Enter');
  await dialog.waitFor({state:'detached'});
  await row('추가.md').waitFor();
  const createdPath = [subFolder, '추가.md'].join(sep);
  assert(await page.getByTestId('current-file').getAttribute('title') === createdPath, 'The supplied .md extension is preserved');
  const editor = page.locator('[data-testid="document-editor"] [contenteditable="true"]');
  await editor.click();
  await page.keyboard.type('Created in the displayed folder.');
  await page.getByRole('button', {name:'Save', exact:true}).click();
  await page.getByText('Saved', {exact:true}).waitFor();
  await page.getByRole('button', {name:'Reload', exact:true}).click();
  await ready();
  assert(await current() === '추가.md' && (await editor.innerText()).includes('Created in the displayed folder.') &&
    (await read(createdPath)).source.includes('Created in the displayed folder.'), 'Save and Reload preserve the actual new file');
  result.createsInSubFolderAndPersists = true;

  // With a folder shown, Open file is in the folder's menu, which the keyboard opens and leaves.
  await folderMenu('Open file…');
  await page.getByTestId('file-path').waitFor();
  await dialog.getByRole('button', {name:'Cancel', exact:true}).click();
  await dialog.waitFor({state:'detached'});
  result.opensFileFromMenu = await current() === '추가.md';
  const more = section.getByRole('button', {name:'More actions', exact:true});
  await more.focus();
  await page.keyboard.press('Enter');
  await page.getByRole('menuitem', {name:'Close folder', exact:true}).waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('menuitem', {name:'Close folder', exact:true}).waitFor({state:'hidden'});
  result.menuKeyboard = await more.evaluate(node => node === document.activeElement) && await section.count() === 1;

  await folderMenu('Close folder');
  result.closes = await section.count() === 0 && await current() === '추가.md';

  // Choosing the folder again opens it down to the open document; nothing else is expanded.
  await page.getByRole('button', {name:'Open folder…', exact:true}).click();
  await field.fill(folder);
  await open.click();
  await dialog.waitFor({state:'detached'});
  await row('추가.md').waitFor();
  result.revealsOpenDocument = await row('자료').getAttribute('aria-expanded') === 'true' &&
    await row('추가.md').getAttribute('aria-current') === 'page' && await row('guides').getAttribute('aria-expanded') === 'false';
  await folderMenu('Close folder');
  for (const [name, passed] of Object.entries(result)) assert(passed, `${name} failed`);
  return result;
}
