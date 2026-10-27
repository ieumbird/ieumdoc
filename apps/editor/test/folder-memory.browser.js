// Startup restoration competes with user navigation; inspect the Sidebar, preferences and Reload.
async (page, { openFolderPicker, openPath, waitForActivePath }) => {
  const ready = (target = page) => target.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
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
  const roots = (target = page) => target.locator('[data-testid="folder"] .sidebar-folder-name').evaluateAll(nodes => nodes.map(node => node.title));
  const remembered = () => page.evaluate(() => JSON.parse(localStorage.getItem('ieumdoc.openFolders') ?? '[]'));
  const waitRoots = (expected, target = page) => target.waitForFunction(expected => JSON.stringify([...document.querySelectorAll('[data-testid="folder"] .sidebar-folder-name')].map(node => node.title)) === JSON.stringify(expected), expected, {timeout:15000});
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
  const seed = async (saved, collapsed = []) => {
    await page.evaluate(({saved, collapsed}) => {
      localStorage.setItem('ieumdoc.openFolders', JSON.stringify(saved));
      localStorage.setItem('ieumdoc.collapsedFolderSections', JSON.stringify(collapsed));
      localStorage.removeItem('ieumdoc.openTabs');
    }, {saved, collapsed});
    await page.reload();
    await ready();
  };
  const section = (path, target = page) => target.getByTestId('folder').filter({has:target.locator('.sidebar-folder-name').getByText(path.split(sep).pop(), {exact:true})});
  const menu = async (path, name, target = page) => {
    await section(path, target).getByRole('button', {name:'More actions', exact:true}).click();
    await target.getByRole('menuitem', {name, exact:true}).click();
  };
  const startOpen = async (path, target = page) => {
    await openFolderPicker(target);
    await target.getByTestId('folder-path').fill(path);
    await target.getByTestId('folder-open').click();
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

  const toggle = (path, target = page) => section(path, target).getByRole('button', {name:/^(Collapse|Expand) folder /});
  const collapsed = () => page.evaluate(() => JSON.parse(localStorage.getItem('ieumdoc.collapsedFolderSections') ?? '[]'));
  const checkCollapsed = async (expected, context) => {
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    check(same(await collapsed(), expected), `${context}: collapsed preference ${JSON.stringify(await collapsed())}, expected ${JSON.stringify(expected)}`);
  };
  // Only root section visibility survives Reload; the initial document reveal must respect it.
  await page.addInitScript(() => {
    window.sectionPreferenceWrites = 0;
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === 'ieumdoc.collapsedFolderSections') window.sectionPreferenceWrites++;
      return setItem.call(this, key, value);
    };
  });
  await seed([a]);
  await waitRoots([a]);
  await openPath(page, [a, 'index.md'].join(sep));
  await toggle(a).click();
  await checkCollapsed([a], 'Collapse remembers the root');
  await reload([a]);
  await waitForActivePath(page, [a, 'index.md'].join(sep));
  check(await toggle(a).getAttribute('aria-expanded') === 'false', 'Reload must restore the active document section collapsed');
  check(await page.evaluate(() => window.sectionPreferenceWrites) === 0, 'Startup folder/tab restoration must not write collapse preferences');
  if (failures.length) throw new Error(failures.join('\n'));
  await toggle(a).click();
  await reload([a]);
  check(await toggle(a).getAttribute('aria-expanded') === 'true', 'Expanded section survives Reload');
  await toggle(a).click();
  await startOpen(a);
  await page.getByRole('dialog').waitFor({state:'detached'});
  check(await toggle(a).getAttribute('aria-expanded') === 'false', 'Same-root Open relists without resetting remembered collapse');
  await menu(a, 'Close folder');
  await checkCollapsed([], 'Close removes collapse memory');
  await startOpen(a);
  await page.getByRole('dialog').waitFor({state:'detached'});
  check(await toggle(a).getAttribute('aria-expanded') === 'true', 'Close then Open starts expanded');

  // Restoration only filters applicability. Prune stale records on the next explicit write.
  const absent = [a, 'missing-folder'].join(sep);
  await seed([a, absent], [a, absent, c]);
  await waitRoots([a]);
  await ready();
  await checkCollapsed([a, absent, c], 'Restoration alone never rewrites collapse memory');
  check(await page.evaluate(() => window.sectionPreferenceWrites) === 0, 'Failed restoration must not write collapse preferences');
  await toggle(a).click();
  await checkCollapsed([], 'User change prunes missing and no-longer-open roots');

  // User section changes before a later restored root answers must not lose either state.
  for (const initiallyCollapsed of [false, true]) {
    const pendingSection = await hold(b);
    try {
      const saved = initiallyCollapsed ? [a, b] : [b];
      await seed([a, b], saved);
      await pendingSection.requested();
      await waitRoots([a]);
      await toggle(a).click();
      await checkCollapsed(saved, 'Section persistence waits for folder restoration');
      pendingSection.release();
      await waitRoots([a, b]);
      await ready();
      await checkCollapsed(initiallyCollapsed ? [b] : [a, b], 'Deferred write uses the complete restored list');
      check(await toggle(a).getAttribute('aria-expanded') === String(initiallyCollapsed) && await toggle(b).getAttribute('aria-expanded') === 'false',
        'Restoration preserves the user section change and the pending root collapse');
      await reload([a, b]);
    } finally { await pendingSection.dispose(); }
  }

  // #370: another tab overwrites a value this tab wrote before. Same-value reveal must write again.
  await seed([a]);
  await waitRoots([a]);
  const otherSectionTab = await page.context().newPage();
  try {
    await otherSectionTab.goto(page.url());
    await ready(otherSectionTab); await waitRoots([a], otherSectionTab);
    await toggle(a).click(); await toggle(a).click();
    await checkCollapsed([], 'First tab writes expanded');
    await toggle(a, otherSectionTab).click();
    await checkCollapsed([a], 'Second tab writes collapsed');
    check(await toggle(a).getAttribute('aria-expanded') === 'true', 'Other tabs do not change the live section');
    await openPath(page, [a, 'notes.md'].join(sep));
    await waitForActivePath(page, [a, 'notes.md'].join(sep));
    await checkCollapsed([], 'Reveal writes current expansion even when this tab last wrote the same value');
    await reload([a]);
    check(await toggle(a).getAttribute('aria-expanded') === 'true', 'Reveal expansion survives Reload');
    await toggle(a, otherSectionTab).click(); // expanded in tab two
    await toggle(a, otherSectionTab).click(); // collapsed again
    await toggle(a).click(); await toggle(a).click();
    await checkCollapsed([], 'Explicit expand overwrites the other tab collapse');
  } finally { await otherSectionTab.close(); }

  // Explicit Opens share their starting render but must retain both successful completions.
  const startScreen = route => route.fulfill({json:{start:true}});
  await page.route('**/api/document', startScreen);
  try {
    for (const [reverse, storageBlocked] of [[false, false], [true, false], [false, true], [true, true]]) {
      await page.evaluate(saved => localStorage.setItem('ieumdoc.recentFolders', JSON.stringify(saved)), [a, c]);
      await seed([]);
      if (storageBlocked) await page.evaluate(() => {
        const setItem = Storage.prototype.setItem;
        Storage.prototype.setItem = function(key, value) {
          if (key === 'ieumdoc.recentFolders') throw new Error('Preference storage disabled');
          return setItem.call(this, key, value);
        };
      });
      const openingB = await hold(b);
      const openingC = await hold(c);
      try {
        const recent = page.getByTestId('document-start');
        await recent.getByTitle(c, {exact:true}).click();
        await openingC.requested();
        await startOpen(b);
        await openingB.requested();
        const first = reverse ? c : b;
        const last = reverse ? b : c;
        (reverse ? openingC : openingB).release();
        await waitRoots([first]);
        (reverse ? openingB : openingC).release();
        await waitRoots([first, last]);
        await page.getByRole('dialog').waitFor({state:'detached'});
        const expected = [last, first, a];
        const checkRecent = async context => {
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('ieumdoc.recentFolders') ?? '[]'));
          const shown = await page.getByTestId('document-start').locator('button[title]').evaluateAll(nodes => nodes.map(node => node.title));
          const expectedSaved = storageBlocked ? [a, c] : expected;
          check(same(saved, expectedSaved), `${context}: recent stored ${JSON.stringify(saved)}, expected ${JSON.stringify(expectedSaved)}`);
          check(same(shown, expected), `${context}: recent displayed ${JSON.stringify(shown)}, expected ${JSON.stringify(expected)}`);
        };
        await checkRecent('Concurrent Open');
        if (!storageBlocked) {
          await reload([first, last]);
          await checkRecent('Concurrent Open after Reload');
        }
      } finally {
        await openingB.dispose();
        await openingC.dispose();
        if (storageBlocked) { await page.reload(); await ready(); }
      }
    }
  } finally { await page.unroute('**/api/document', startScreen); }

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
    await seed([a], [a]);
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
    await checkCollapsed([], 'Same-path Close clears remembered collapse despite the late restoration');
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

  // Two browser tabs share preferences, while their live Sidebar lists remain independent.
  await seed([a]);
  await waitRoots([a]);
  const other = await page.context().newPage();
  try {
    await other.goto(page.url());
    await ready(other);
    await waitRoots([a], other);
    await startOpen(b, other);
    await waitRoots([a, b], other);
    await other.getByRole('dialog').waitFor({state:'detached'});
    await menu(a, 'Close folder', other);
    await waitRoots([b], other);
    await checkMemory([b], 'The second tab remembers B after closing A');
    check(same(await roots(), [a]), 'Another tab must not change this tab\'s live Sidebar');

    await startOpen(a);
    await page.getByRole('dialog').waitFor({state:'detached'});
    await checkMemory([a], 'Explicit same-path Open must replace another tab\'s preference');

    // Let the second tab write B again after this tab has already performed a user Open.
    await menu(b, 'Close folder', other);
    await waitRoots([], other);
    await startOpen(b, other);
    await waitRoots([b], other);
    await other.getByRole('dialog').waitFor({state:'detached'});
    await checkMemory([b], 'The most recent user operation remembers its own tab\'s list');
    await section(a).getByRole('treeitem', {name:'guides', exact:true}).click();
    await section(a).getByRole('treeitem', {name:'install.md', exact:true}).waitFor();
    await section(a).getByRole('treeitem', {name:'guides', exact:true}).click();
    await section(a).getByRole('treeitem', {name:'install.md', exact:true}).waitFor({state:'detached'});
    await checkMemory([b], 'Tree-only updates must leave another tab\'s preference intact');

    await startOpen(a);
    await page.getByRole('dialog').waitFor({state:'detached'});
    await checkMemory([a], 'The last explicit Open remembers the current Sidebar list');
    await reload([a]);
  } finally { await other.close(); }

  // Tree-only updates never rewrite an unchanged path list; explicit user Open still remembers it.
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
  const sectionToggle = section(a).getByRole('button', {name:/^(Collapse|Expand) folder /});
  await sectionToggle.click();
  check(!await section(a).getByRole('tree').isVisible(), 'Section collapse hides the tree');
  await checkMemory([a, c], 'Tree-only changes preserve the remembered list');
  check(await page.evaluate(() => window.folderPreferenceWrites) === 0,
    'Expansion, listing and collapse rewrote an unchanged path preference');
  await startOpen(a);
  await page.getByRole('dialog').waitFor({state:'detached'});
  check(await sectionToggle.getAttribute('aria-expanded') === 'false', 'Explicit same-root relist preserves section collapse');
  await checkMemory([a, c], 'An explicit same-list Open still remembers the current paths');
  check(await page.evaluate(() => window.folderPreferenceWrites) > 0,
    'An explicit same-list Open did not write the current paths');

  // Overlapping trees keep separate Sidebar sections, but each New destination appears once.
  // The first opened tree supplies the label, regardless of whether it is the parent or child.
  for (const saved of [[a, b], [b, a]]) {
    await seed(saved);
    await waitRoots(saved);
    for (const kind of ['file', 'folder']) {
      await section(a).getByRole('button', {name:kind === 'file' ? 'New document…' : 'More actions', exact:true}).click();
      if (kind === 'folder') await page.getByRole('menuitem', {name:'New folder…', exact:true}).click();
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
    concurrentRecentOpens:true, recentStorageUnavailable:true, treeUpdatesDoNotWrite:true, explicitOpenRemembers:true, crossTabPreference:true,
    failedRestoration:true, reload:true, uniqueDestinations:true};
}
