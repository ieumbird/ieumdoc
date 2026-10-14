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

  // New folder creates inside the listed folder and moves into it; nothing opens. Escape leaves
  // the name row before the dialog; rejected names create nothing.
  const newFolder = dialog.getByRole('button', {name:'New folder', exact:true});
  const newFolderName = page.getByTestId('new-folder-name');
  const newFolderError = text => dialog.getByTestId('new-error').getByText(text, {exact:true}).waitFor();
  await newFolder.click();
  await newFolderName.fill('..');
  await newFolderName.press('Enter');
  await newFolderError('Enter a folder name without a directory path.');
  await newFolderName.fill('CON');
  await newFolderName.press('Enter');
  await newFolderError('folder name is reserved on Windows');
  await newFolderName.fill('guides');
  await newFolderName.press('Enter');
  await newFolderError('a file or folder with that name already exists');
  if (screenshots) await page.screenshot({path:'tmp/picker-capture/07-picker-new-folder.png'});
  await newFolderName.press('Escape');
  await newFolderName.waitFor({state:'detached'});
  assert(await dialog.isVisible() && await newFolder.evaluate(node => node === document.activeElement), 'Escape leaves only the name row');
  await newFolder.click();
  await newFolderName.fill('picked');
  await newFolderName.press('Enter');
  await page.getByTestId('folder-picker-meta').getByText(/No sub-folders/).waitFor();
  assert(await field.inputValue() === [folder, 'picked', ''].join(sep) && (await open.innerText()).includes('picked') &&
    await field.evaluate(node => node === document.activeElement), 'New folder moves into the created folder');
  await field.press('Backspace');
  await option('picked').waitFor();
  result.pickerCreatesFolder = await section.count() === 0 && await option('guides').count() === 1;

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
  // The Host's name order depends on the platform; guides' own entry follows it.
  const expandedTree = hostItems.flatMap(name => (name === 'guides' ? [name, 'install.md'] : [name]));
  assert(JSON.stringify(await items()) === JSON.stringify(expandedTree), 'Expanded tree: ' + JSON.stringify(await items()));
  assert(JSON.stringify(folderRequests) === JSON.stringify([guidesPath]), 'Expanding lists only that folder: ' + JSON.stringify(folderRequests));
  result.expandsInPlace = await row('guides').getAttribute('aria-expanded') === 'true' && await row('install.md').getAttribute('aria-level') === '2' &&
    await row(/^Up to/).count() === 0;
  await row('install.md').click();
  await page.waitForFunction(() => document.querySelector('[data-testid="current-file"]')?.title.endsWith('install.md'));
  await ready();

  // Tool switches retain the tree's expansion, scroll and last keyboard stop without listing again.
  const viewport = page.viewportSize();
  await page.setViewportSize({width:1280, height:300});
  await row('install.md').focus();
  await page.keyboard.press('End');
  const tree = section.getByRole('tree');
  const treeState = () => tree.evaluate(node => ({scroll:node.scrollTop, stop:node.querySelector('[tabindex="0"]')?.textContent}));
  const retained = await treeState();
  assert(retained.scroll > 0, 'Short window must exercise a scrolled tree');
  const requestsBeforeSwitch = folderRequests.length;
  await page.getByRole('button', {name:'Display', exact:true}).click();
  assert(!await tree.isVisible(), 'Files must not remain exposed under Display');
  await page.getByRole('button', {name:'Files', exact:true}).click();
  assert(JSON.stringify(await treeState()) === JSON.stringify(retained), 'Tool switch reset tree scroll or keyboard stop');
  await page.getByRole('button', {name:'Collapse sidebar', exact:true}).click();
  await page.getByRole('button', {name:'Files', exact:true}).click();
  assert(JSON.stringify(await treeState()) === JSON.stringify(retained) && await row('guides').getAttribute('aria-expanded') === 'true' &&
    folderRequests.length === requestsBeforeSwitch, 'Reopening Files reset the tree or reloaded its folder');
  await page.setViewportSize(viewport);
  result.toolSwitchPreservesTree = true;

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
  assert(await focusedRow() === expandedTree.at(-1), 'End moves to the last visible item');
  await page.keyboard.press('Home');
  assert(await focusedRow() === expandedTree[0], 'Home moves to the first visible item');
  await page.keyboard.press('ArrowDown');
  assert(await focusedRow() === expandedTree[1], 'Down moves to the next visible item');
  await row('guides').focus();
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
  assert(await page.getByTestId('new-file-directory').inputValue() === guidesPath, 'New starts in the open document\'s folder');
  await page.getByTestId('new-file-name').fill('blocked');
  await dialog.getByRole('button', {name:'Create', exact:true}).click();
  await page.getByTestId('new-error').getByText(/Save or discard the current changes/).waitFor();
  assert(createRequests === 0 && await current() === 'install.md', 'Folder New preserves unsaved work without creating a file');
  await dialog.getByRole('button', {name:'Cancel', exact:true}).click();
  result.folderNewKeepsUnsavedWork = true;
  await page.getByRole('button', {name:'File actions', exact:true}).click();
  await page.getByRole('menuitem', {name:'Reload', exact:true}).click();
  await page.getByRole('button', {name:'Discard and reload', exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'detached'});
  await ready();

  // New starts in the open document's folder; with index.md that is the chosen folder itself,
  // including at a narrow viewport.
  await row('index.md').click();
  await page.waitForFunction(() => document.querySelector('[data-testid="current-file"]')?.title.endsWith('index.md'));
  await ready();
  await page.setViewportSize({width:375, height:812});
  await item('New file in folder').click();
  const filename = page.getByTestId('new-file-name');
  assert(await page.getByTestId('new-file-directory').inputValue() === folder, 'Root folder is the creation destination');
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

  // The destination is chosen in the dialog, never from what was expanded: toggling a folder
  // leaves the default at the open document's folder, and a collapsed sub-folder can be chosen.
  await row('guides').click();
  assert(await row('자료').getAttribute('aria-expanded') === 'false', 'The Korean sub-folder is collapsed');
  await item('New file in folder').click();
  const destination = page.getByTestId('new-file-directory');
  assert(await destination.inputValue() === folder, 'Toggling a folder does not change the destination');
  const subFolder = [folder, '자료'].join(sep);
  await destination.selectOption(subFolder);
  assert(await destination.locator('option:checked').innerText() === ['folder-navigation', '자료'].join(sep), 'The destination is named from the chosen folder');
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
  await page.getByRole('button', {name:'File actions', exact:true}).click();
  await page.getByRole('menuitem', {name:'Reload', exact:true}).click();
  await ready();
  assert(await current() === '추가.md' && (await editor.innerText()).includes('Created in the displayed folder.') &&
    (await read(createdPath)).source.includes('Created in the displayed folder.'), 'Save and Reload preserve the actual new file');
  result.createsInSubFolderAndPersists = true;

  // Sidebar New folder starts at the open document's folder; a collapsed destination is expanded
  // to show the folder, which can take a new file at once. The open document stays.
  if (await row('guides').getAttribute('aria-expanded') === 'true') await row('guides').click();
  await item('New folder').click();
  const folderDestination = page.getByTestId('new-folder-directory');
  assert(await folderDestination.inputValue() === subFolder, "New folder starts in the open document's folder");
  await folderDestination.selectOption(guidesPath);
  await page.getByTestId('new-folder-name').fill('chapter');
  await page.getByTestId('new-folder-name').press('Enter');
  await dialog.waitFor({state:'detached'});
  await row('chapter').waitFor();
  assert(await row('guides').getAttribute('aria-expanded') === 'true' && await row('chapter').getAttribute('aria-level') === '2' &&
    await current() === '추가.md' && await item('New folder').evaluate(node => node === document.activeElement), 'Sidebar New folder shows the created folder');
  if (screenshots) await page.screenshot({path:'tmp/picker-capture/08-sidebar-new-folder.png'});
  await item('New file in folder').click();
  const chapterPath = [guidesPath, 'chapter'].join(sep);
  assert((await destination.evaluate(select => [...select.options].map(option => option.value))).includes(chapterPath), 'A created folder is a New file destination');
  await page.keyboard.press('Escape');
  await dialog.waitFor({state:'detached'});
  result.sidebarCreatesFolder = true;

  // A folder created while choosing appears in the sidebar folder already listed; the second
  // Escape closes the picker without opening anything.
  await folderMenu('Open folder…');
  await option('guides').waitFor();
  await newFolder.click();
  await newFolderName.fill('later');
  await newFolderName.press('Enter');
  await page.getByTestId('folder-picker-meta').getByText(/No sub-folders/).waitFor();
  await field.press('Escape');
  await dialog.waitFor({state:'detached'});
  await row('later').waitFor();
  result.pickerFolderListedInSidebar = await row('later').getAttribute('aria-level') === '1' && await current() === '추가.md' &&
    await section.getByTitle(folder, {exact:true}).count() === 1;

  // Only folder navigation remains in the menu; its dialog returns focus to `⋯`.
  await section.getByRole('button', {name:'More actions', exact:true}).click();
  result.noOpenFileEntry = await page.getByRole('menuitem', {name:'Open file…', exact:true}).count() === 0;
  await page.getByRole('menuitem', {name:'Open folder…', exact:true}).click();
  await field.waitFor();
  await dialog.getByRole('button', {name:'Cancel', exact:true}).click();
  await dialog.waitFor({state:'detached'});
  const more = section.getByRole('button', {name:'More actions', exact:true});
  // The menu item is gone; the dialog returns focus to `⋯`.
  result.opensFolderFromMenu = await current() === '추가.md' && await more.evaluate(node => node === document.activeElement);
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

  // Identity is readable without hover, including an unbroken name; short names retain alignment.
  for (const name of ['a', '한글 English 프로젝트 문서와 설계 자료를 모아둔 아주 긴 폴더 이름 Long Folder Name 2026', 'UnbrokenFolderName'.repeat(7)]) {
    await page.getByRole('button', {name:'Open folder…', exact:true}).click();
    await enterFolder(folder);
    await option('guides').waitFor();
    await newFolder.click();
    await newFolderName.fill(name);
    await newFolderName.press('Enter');
    await page.getByTestId('folder-picker-meta').getByText(/No sub-folders/).waitFor();
    await open.click();
    await dialog.waitFor({state:'detached'});
    await section.getByTitle([folder, name].join(sep), {exact:true}).waitFor();
    for (const width of [1440, 1024, 375]) {
      await page.setViewportSize({width, height:812});
      await page.mouse.move(width - 2, 2);
      const geometry = await section.evaluate(async (element, name) => {
        await document.fonts.ready;
        const required = selector => {
          const node = element.querySelector(selector);
          if (!node) throw Error(`Missing folder header element: ${selector}`);
          return node;
        };
        const header = required('.sidebar-folder-header');
        const heading = required('.sidebar-folder-name');
        const label = heading.querySelector('span');
        const bounds = header.getBoundingClientRect();
        const icon = heading.querySelector('svg').getBoundingClientRect();
        const actions = required('.sidebar-folder-actions').getBoundingClientRect();
        const range = document.createRange();
        const glyphs = [];
        const textNodes = document.createTreeWalker(label, NodeFilter.SHOW_TEXT);
        for (let text = textNodes.nextNode(); text; text = textNodes.nextNode()) {
          for (let index = 0; index < text.length; index++) {
            if (/\s/.test(text.data[index])) continue;
            range.setStart(text, index);
            range.setEnd(text, index + 1);
            glyphs.push(...range.getClientRects());
          }
        }
        const buttons = [...required('.sidebar-folder-actions').querySelectorAll('button')];
        const rootStyle = getComputedStyle(document.documentElement);
        return {
          text: label.textContent,
          lines: new Set(glyphs.map(rect => rect.top)).size,
          clipped: glyphs.some(rect => rect.width <= 0 || rect.left < bounds.left || rect.right > bounds.right + 0.5 ||
            rect.top < bounds.top || rect.bottom > bounds.bottom + 0.5 ||
            (rect.left < actions.right && rect.right > actions.left && rect.top < actions.bottom && rect.bottom > actions.top)),
          overflow: header.scrollWidth > header.clientWidth || document.documentElement.scrollWidth > innerWidth,
          actionsAtTop: Math.abs(actions.top - bounds.top) < 0.5,
          iconAtFirstLine: Math.abs(icon.top + icon.height / 2 - glyphs[0].top - glyphs[0].height / 2) < 0.5,
          reachable: buttons.every(button => {
            const rect = button.getBoundingClientRect();
            return rect.left >= bounds.left && rect.right <= bounds.right + 0.5 &&
              button.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2));
          }),
          compact: Math.abs(bounds.height - actions.height) < 0.5 && Math.abs(icon.top + icon.height / 2 - actions.top - actions.height / 2) < 0.5,
          labelGap: glyphs[0].left - icon.right,
          expectedGap: parseFloat(rootStyle.getPropertyValue('--space-2')) * parseFloat(rootStyle.fontSize),
        };
      }, name);
      assert(geometry.text === name && !geometry.clipped && !geometry.overflow && geometry.actionsAtTop && geometry.iconAtFirstLine && geometry.reachable,
        `Folder name must be fully visible with reachable actions at ${width}px: ${JSON.stringify(geometry)}`);
      assert(name === 'a' ? geometry.lines === 1 && geometry.compact && Math.abs(geometry.labelGap - geometry.expectedGap) < 0.5 : geometry.lines > 1,
        `Short folder alignment / long folder wrapping at ${width}px: ${JSON.stringify(geometry)}`);
    }
    await folderMenu('Close folder');
  }
  result.folderNamesReadable = true;
  for (const [name, passed] of Object.entries(result)) assert(passed, `${name} failed`);
  return result;
}
