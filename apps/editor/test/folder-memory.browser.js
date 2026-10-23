// Startup restoration competes with user navigation; inspect the Sidebar, preferences and Reload.
async (page) => {
  const ready = () => page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
  const origin = page.url().split('/').slice(0, 3).join('/');
  const defaultPath = (await (await page.request.get(`${origin}/api/document`)).json()).path;
  const sep = defaultPath.includes('\\') ? '\\' : '/';
  const root = defaultPath.split(sep).slice(0, -4).join(sep);
  const a = [root, 'tmp', 'folder-navigation'].join(sep);
  const b = [a, 'guides'].join(sep);
  const c = [a, '자료'].join(sep);
  const failures = [];
  const check = (condition, message) => { if (!condition) failures.push(message); };
  const same = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected);
  const roots = () => page.locator('[data-testid="folder"] .sidebar-folder-name').evaluateAll(nodes => nodes.map(node => node.title));
  const remembered = () => page.evaluate(() => JSON.parse(localStorage.getItem('ieumdoc.openFolders') ?? '[]'));
  const waitRoots = expected => page.waitForFunction(expected => JSON.stringify([...document.querySelectorAll('[data-testid="folder"] .sidebar-folder-name')].map(node => node.title)) === JSON.stringify(expected), expected, {timeout:15000});
  const checkMemory = async (expected, context) => {
    // Let the render and its persistence effect finish before observing browser preferences.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const actual = await remembered();
    check(same(actual, expected), `${context}: remembered ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  };
  const reload = async expected => {
    const stored = await remembered();
    await page.reload();
    await ready();
    await waitRoots(stored);
    check(same(await roots(), expected), `Reload restored ${JSON.stringify(await roots())}, expected ${JSON.stringify(expected)}`);
  };
  const seed = async saved => {
    await page.evaluate(saved => localStorage.setItem('ieumdoc.openFolders', JSON.stringify(saved)), saved);
    await page.reload();
    await ready();
  };
  const section = path => page.getByTestId('folder').filter({has:page.locator('.sidebar-folder-name').getByText(path.split(sep).pop(), {exact:true})});
  const menu = async (path, name) => {
    await section(path).getByRole('button', {name:'More actions', exact:true}).click();
    await page.getByRole('menuitem', {name, exact:true}).click();
  };
  const startOpen = async path => {
    if (await page.getByTestId('folder').count()) await menu(a, 'Open folder…');
    else await page.getByRole('button', {name:'Open folder…', exact:true}).click();
    await page.getByTestId('folder-path').fill(path);
    await page.getByTestId('folder-open').click();
  };
  const hold = async path => {
    let release, started;
    let holdNewRequests = true;
    const gate = new Promise(resolve => { release = resolve; });
    const requested = new Promise(resolve => { started = resolve; });
    const handler = async route => {
      const query = Object.fromEntries(route.request().url().split('?')[1].split('&').map(part => part.split('=').map(value => decodeURIComponent(value.replaceAll('+', ' ')))));
      if (query.root !== path || query.path !== undefined || !holdNewRequests) return route.fallback();
      const response = await route.fetch();
      started();
      await gate;
      await route.fulfill({response});
    };
    await page.route('**/api/folder?*', handler);
    return {requested:() => Promise.race([requested, page.waitForTimeout(15000).then(() => { throw new Error(`Listing did not start: ${path}`); })]),
      allowNewRequests:() => { holdNewRequests = false; },
      release, dispose:async () => { release(); await page.unroute('**/api/folder?*', handler); }};
  };

  // Both response orders: the Open handler starts before the remembered folder is available.
  for (const openFirst of [false, true]) {
    const restoring = await hold(a);
    const opening = await hold(c);
    try {
      await seed([a]);
      await restoring.requested();
      await startOpen(c);
      await opening.requested();
      if (openFirst) {
        opening.release();
        await waitRoots([c]);
        await page.getByRole('dialog').waitFor({state:'detached'});
        await checkMemory([a], 'Open before restoration finishes must preserve the pending preference');
        restoring.release();
      } else {
        restoring.release();
        await waitRoots([a]);
        opening.release();
      }
      const expected = openFirst ? [c, a] : [a, c];
      await waitRoots(expected);
      await page.getByRole('dialog').waitFor({state:'detached'});
      await checkMemory(expected, `Open ${openFirst ? 'before' : 'after'} restoration`);
      await reload(expected);
    } finally {
      await restoring.dispose();
      await opening.dispose();
    }
  }

  // Closing the first restored folder must not erase a second folder still being restored.
  const restoring = await hold(b);
  try {
    await seed([a, b]);
    await restoring.requested();
    await waitRoots([a]);
    await menu(a, 'Close folder');
    await waitRoots([]);
    await checkMemory([a, b], 'Close before restoration finishes');
    restoring.release();
    await waitRoots([b]);
    await checkMemory([b], 'Close followed by the last restored folder');
    await reload([b]);
  } finally { await restoring.dispose(); }

  // Open starts with [A], restoration adds B, Close removes A, then Open completes with C.
  const restoringB = await hold(b);
  const openingC = await hold(c);
  const startWithoutDocument = route => route.fulfill({json:{start:true}});
  await page.route('**/api/document', startWithoutDocument);
  await page.evaluate(c => localStorage.setItem('ieumdoc.recentFolders', JSON.stringify([c])), c);
  try {
    await seed([a, b]);
    await restoringB.requested();
    await waitRoots([a]);
    await page.getByTestId('document-start').getByTitle(c, {exact:true}).click();
    await openingC.requested();
    restoringB.release();
    await waitRoots([a, b]);
    await menu(a, 'Close folder');
    openingC.release();
    await waitRoots([b, c]);
    await checkMemory([b, c], 'Close overlaps a pending Open');
    await reload([b, c]);
  } finally {
    await restoringB.dispose();
    await openingC.dispose();
    await page.unroute('**/api/document', startWithoutDocument);
  }

  // The user opens and closes the same path while its older startup listing is still pending.
  const restoringA = await hold(a);
  try {
    await seed([a]);
    await restoringA.requested();
    restoringA.allowNewRequests();
    await startOpen(a);
    await waitRoots([a]);
    await page.getByRole('dialog').waitFor({state:'detached'});
    await menu(a, 'Close folder');
    await waitRoots([]);
    await checkMemory([a], 'Same-path Close still defers persistence until restoration completes');
    const answered = page.waitForResponse(response => response.url().startsWith(`${origin}/api/folder?`) &&
      response.url().includes(`root=${encodeURIComponent(a)}`));
    restoringA.release();
    await answered;
    await checkMemory([], 'Late restoration must retain the same-path user Close');
    check(same(await roots(), []), 'Late restoration reopened a folder the user explicitly closed');
    await reload([]);
  } finally { await restoringA.dispose(); }

  // A failed restoration is quiet and does not rewrite preferences until the user navigates.
  const missing = [a, 'missing-folder'].join(sep);
  await seed([a, missing, b]);
  await waitRoots([a, b]);
  await checkMemory([a, missing, b], 'Restoration alone leaves failed paths remembered');
  check(!await page.getByRole('alert').count(), 'Failed restoration must remain quiet');
  await menu(a, 'Close folder');
  await waitRoots([b]);
  await checkMemory([b], 'User navigation removes failed restoration paths');
  await reload([b]);

  // Preference writes depend on the path list, not expansion, listings or reopening an existing root.
  await seed([a]);
  await waitRoots([a]);
  await startOpen(c);
  await waitRoots([a, c]);
  await page.getByRole('dialog').waitFor({state:'detached'});
  await checkMemory([a, c], 'An explicit Open remembers the changed path list');
  await page.evaluate(() => {
    window.folderPreferenceWrites = 0;
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === 'ieumdoc.openFolders') window.folderPreferenceWrites++;
      return setItem.call(this, key, value);
    };
  });
  const guides = section(a).getByRole('treeitem', {name:'guides', exact:true});
  const install = section(a).getByRole('treeitem', {name:'install.md', exact:true});
  await guides.click();
  await install.waitFor();
  await guides.click();
  await install.waitFor({state:'detached'});
  await startOpen(a);
  await page.getByRole('dialog').waitFor({state:'detached'});
  await checkMemory([a, c], 'Tree-only changes preserve the remembered list');
  check(await page.evaluate(() => window.folderPreferenceWrites) === 0,
    'Expansion, listing, collapse and reopening rewrote an unchanged path preference');

  // Overlapping trees keep separate Sidebar sections, but each New destination appears once.
  // The first opened tree supplies the label, regardless of whether it is the parent or child.
  for (const saved of [[a, b], [b, a]]) {
    await seed(saved);
    await waitRoots(saved);
    for (const kind of ['file', 'folder']) {
      await section(a).getByRole('button', {name:kind === 'file' ? 'New file in folder' : 'New folder', exact:true}).click();
      const select = page.getByTestId(`new-${kind}-directory`);
      const options = await select.locator('option').evaluateAll(nodes => nodes.map(node => ({path:node.value, label:node.textContent})));
      check(new Set(options.map(option => option.path)).size === options.length, `New ${kind} has duplicate destinations: ${JSON.stringify(options)}`);
      const expectedLabel = saved[0] === a ? ['folder-navigation', 'guides'].join(sep) : 'guides';
      check(options.find(option => option.path === b)?.label === expectedLabel, `New ${kind} must retain the first tree's label`);
      await select.selectOption(b);
      check(await select.inputValue() === b, `New ${kind} must select the unique nested destination`);
      await page.getByRole('dialog').getByRole('button', {name:'Cancel', exact:true}).click();
      await page.getByRole('dialog').waitFor({state:'detached'});
    }
  }
  if (failures.length) throw new Error(failures.join('\n'));
  return {responseOrders:true, closeDuringRestoration:true, closeDuringOpen:true, samePathCloseWins:true,
    writesOnlyChangedPaths:true, failedRestoration:true, reload:true, uniqueDestinations:true};
}
