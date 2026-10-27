// Choose a folder, expand it as a tree in the sidebar and open its documents; unsaved work blocks switching.
async (page, { openFolderPicker, waitForActivePath, screenshots = false } = {}) => {
  await page.unrouteAll();
  await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
  await page.evaluate(() => localStorage.removeItem('ieumdoc.recentFolders'));
  await page.reload();
  const ready = () => page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
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

  const sidebar = page.getByTestId('sidebar');
  const openFolder = sidebar.getByRole('button', {name:'Open folder…', exact:true});
  const headerPositions = new Map();
  const captureMetadata = [];
  const checkSidebarEntry = async state => {
    for (const width of [1440, 1024, 640]) {
      await page.setViewportSize({width, height:812});
      const expand = page.getByRole('button', {name:'Expand sidebar', exact:true});
      if (await expand.isVisible()) await expand.click();
      await sidebar.getByRole('button', {name:'Collapse sidebar', exact:true}).waitFor();
      const header = sidebar.locator('.sidebar-header');
      assert(await header.getByRole('button').count() === 1 && await header.innerText() === 'Files',
        `Sidebar header contains only Files and collapse: ${state}, ${width}px`);
      const entry = state === 'empty' ? openFolder : section.first().getByRole('button', {name:'More actions', exact:true});
      const collapse = header.getByRole('button', {name:'Collapse sidebar', exact:true});
      const geometry = await collapse.evaluate(button => {
        const rect = button.getBoundingClientRect();
        const header = button.closest('.sidebar-header').getBoundingClientRect();
        const style = getComputedStyle(document.documentElement);
        const rem = parseFloat(style.fontSize);
        return {x:rect.x - header.x, y:rect.y - header.y, width:rect.width, height:rect.height,
          target:parseFloat(style.getPropertyValue('--size-control-compact')) * rem,
          icon:button.querySelector('svg').getBoundingClientRect().width,
          iconTarget:parseFloat(style.getPropertyValue('--size-icon-slot')) * rem,
          reachable:button.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)),
          overflow:document.documentElement.scrollWidth > innerWidth};
      });
      assert(geometry.reachable && !geometry.overflow && geometry.width === geometry.target && geometry.height === geometry.target && geometry.icon === geometry.iconTarget,
        `Header control must fit and remain reachable: ${JSON.stringify(geometry)}`);
      const previous = headerPositions.get(width);
      assert(!previous || JSON.stringify(previous) === JSON.stringify(geometry), `Folder count moved the header entry at ${width}px`);
      headerPositions.set(width, geometry);
      if (screenshots && width !== 1024) {
        const sectionToggle = section.first().getByRole('button', {name:/^(Collapse|Expand) folder /});
        const wasCollapsed = state !== 'empty' && await sectionToggle.getAttribute('aria-expanded') === 'false';
        if (wasCollapsed) await sectionToggle.click();
        const environment = await page.evaluate(async () => {
          await document.fonts.ready; window.scrollTo(0, 0); document.activeElement?.blur();
          return {viewport:[innerWidth, innerHeight], dpr:devicePixelRatio, zoom:visualViewport.scale,
            cssZoom:getComputedStyle(document.documentElement).zoom, font:getComputedStyle(document.querySelector('.product')).fontFamily,
            scroll:[scrollX, scrollY], language:document.documentElement.lang,
            rootNameWidth:document.querySelector('.sidebar-folder-name .sidebar-tree-name')?.getBoundingClientRect().width};
        });
        await page.mouse.move(width - 2, 2);
        await page.screenshot({path:`tmp/picker-capture/sidebar-after-${state}-${width}.png`});
        captureMetadata.push({state, ...environment});
        if (state !== 'empty') {
          await sectionToggle.click();
          await page.evaluate(() => document.activeElement?.blur());
          await page.mouse.move(width - 2, 2);
          await page.screenshot({path:`tmp/picker-capture/sidebar-collapsed-${state}-${width}.png`});
          if (!wasCollapsed) await sectionToggle.click();
        }
      }
      if (state !== 'empty') {
        const disclosure = section.first().getByRole('button', {name:/^(Collapse|Expand) folder /});
        const collapsedForComparison = await disclosure.getAttribute('aria-expanded') === 'false';
        if (collapsedForComparison) await disclosure.click();
        const headings = await section.evaluateAll(sections => sections.map((element, index) => {
          const header = element.querySelector('.sidebar-folder-header').getBoundingClientRect();
          const toggle = element.querySelector('.sidebar-folder-toggle').getBoundingClientRect();
          const actions = element.querySelector('.sidebar-folder-actions').getBoundingClientRect();
          const root = element.querySelector('.sidebar-folder-name');
          const child = sections.flatMap(section => [...section.querySelectorAll('.sidebar-tree-item[aria-expanded]')])[0];
          const ownChild = element.querySelector('.sidebar-tree-item');
          const rootStyle = getComputedStyle(root), childStyle = getComputedStyle(child);
          const indent = parseFloat(rootStyle.getPropertyValue('--space-sidebar-tree-indent')) * parseFloat(getComputedStyle(document.documentElement).fontSize);
          return {sameRow:Math.abs(toggle.top - actions.top) < 1, rightAligned:Math.abs(actions.right - header.right) < 1,
            noHeadingGap:!ownChild || !ownChild.getBoundingClientRect().height || ownChild.getBoundingClientRect().top === header.bottom,
            noSectionGap:index === 0 || element.getBoundingClientRect().top === sections[index - 1].getBoundingClientRect().bottom,
            sameTypography:['fontSize', 'fontWeight', 'lineHeight', 'color'].every(key => rootStyle[key] === childStyle[key]),
            sameHeight:root.getBoundingClientRect().height === child.getBoundingClientRect().height,
            childIndent:child.querySelector('.sidebar-tree-chevron').getBoundingClientRect().left - root.querySelector('.sidebar-tree-chevron').getBoundingClientRect().left === indent,
            folderIconsAbsent:!root.querySelector('.sidebar-tree-icon') && sections.every(section => !section.querySelector('.sidebar-tree-item[aria-expanded] .sidebar-tree-icon')),
            sameIconSize:root.querySelector('.sidebar-tree-chevron svg').getBoundingClientRect().width === child.querySelector('.sidebar-tree-chevron svg').getBoundingClientRect().width};
        }));
        assert(headings.every(heading => heading.sameRow && heading.rightAligned && heading.noHeadingGap && heading.noSectionGap && heading.sameTypography && heading.sameHeight && heading.childIndent && heading.folderIconsAbsent && heading.sameIconSize),
          `Folder identity and actions must share the first row: ${state}/${width}px ${JSON.stringify(headings)}`);
        if (collapsedForComparison) await disclosure.click();
        assert(await openFolder.count() === 0, 'Opened folders use their menu instead of a second Open entry');
        assert(await section.first().getByRole('button', {name:'New document…', exact:true}).getAttribute('title') === 'New document…', 'New document has one consistent name');
      }
      await entry.focus();
      await page.keyboard.press('Enter');
      if (state !== 'empty') {
        await page.getByRole('menuitem', {name:'Open folder…', exact:true}).focus();
        await page.keyboard.press('Enter');
      }
      await field.waitFor();
      if (state === 'one' && width === 640) {
        await field.fill(folder);
        await open.click();
      } else if (width === 1024) {
        await dialog.getByRole('button', {name:'Cancel', exact:true}).click();
      } else {
        await field.press('Escape');
      }
      await dialog.waitFor({state:'detached'});
      assert(await entry.evaluate(node => node === document.activeElement), `Folder picker must restore focus at ${width}px`);
    }
    await page.setViewportSize({width:1280, height:720});
    // Each menu acts only on its own folder, and Escape returns to its surviving trigger.
    for (const more of await section.getByRole('button', {name:'More actions', exact:true}).all()) {
      await more.click();
      await page.getByRole('menuitem', {name:'Close folder', exact:true}).waitFor();
      if (screenshots && state === 'one') await page.screenshot({path:'tmp/picker-capture/folder-refresh-menu.png'});
      assert(JSON.stringify(await page.getByRole('menuitem').allInnerTexts()) === JSON.stringify(['New folder…', 'Open folder…', 'Refresh', 'Close folder']), 'Folder menu must order creation before folder management');
      await page.keyboard.press('Escape');
      await page.getByRole('menu').waitFor({state:'detached'});
      assert(await more.evaluate(node => node === document.activeElement), 'Folder menu Escape must restore focus');
    }
    if (state === 'several') for (const width of [1440, 640]) {
      await page.setViewportSize({width, height:720});
      // Docking changes the TopBar's width after the media-query state update. Do not
      // cache coordinates from the preceding layout for the one-physical-click check.
      await page.getByTestId('document-panel').waitFor({state:width >= 1424 ? 'visible' : 'hidden'});
      // One physical click must switch open menus; an overlay must not consume it.
      const first = section.first().getByRole('button', {name:'More actions', exact:true, includeHidden:true});
      const second = section.nth(1).getByRole('button', {name:'More actions', exact:true, includeHidden:true});
      const fileMenu = page.getByRole('button', {name:'File actions', exact:true, includeHidden:true});
      const fileTarget = await fileMenu.boundingBox(), secondTarget = await second.boundingBox();
      await first.click(); await page.getByRole('menuitem', {name:'New folder…', exact:true}).waitFor();
      // These targets remain visibly outside the preceding popup, not underneath its menu items.
      await page.mouse.click(fileTarget.x + fileTarget.width / 2, fileTarget.y + fileTarget.height / 2);
      await page.getByRole('menuitem', {name:'Reload', exact:true}).waitFor();
      assert(await fileMenu.getAttribute('aria-expanded') === 'true' && await first.getAttribute('aria-expanded') === 'false',
        'A single click switches from a folder menu to File actions');
      await page.mouse.click(secondTarget.x + secondTarget.width / 2, secondTarget.y + secondTarget.height / 2);
      await page.getByRole('menuitem', {name:'New folder…', exact:true}).waitFor();
      assert(await second.getAttribute('aria-expanded') === 'true' && await fileMenu.getAttribute('aria-expanded') === 'false',
        'A single click switches from File actions to the other folder menu');
      assert(await page.getByRole('menu').count() === 1, 'Menu switching leaves exactly the requested menu open');
      await page.keyboard.press('Escape'); await page.getByRole('menu').waitFor({state:'hidden'});
    }
    await page.setViewportSize({width:1280, height:720});
  };
  await checkSidebarEntry('empty');

  // Folder browsing never changes the sidebar or the open document until Open.
  await openFolderPicker(page);
  const home = dialog.getByRole('button', {name:'Home', exact:true});
  await home.waitFor();
  const homePath = await home.getAttribute('title');
  await home.click();
  assert(await field.inputValue() === (homePath.endsWith(sep) ? homePath : homePath + sep), 'Home starts at the Host home folder');
  result.startsFromHostPlace = true;
  await enterFolder(folder);
  await option('guides').waitFor();
  assert(!/Markdown file/.test(await page.getByTestId('folder-picker-meta').innerText()), 'Folder picker must not count documents absent from its folder-only list');
  assert(await dialog.getByText('Sub-folders · click to navigate', {exact:true}).count() === 1 &&
    await dialog.getByText('Choose documents in the sidebar after opening a folder.', {exact:true}).count() === 1,
    'Folder navigation and document opening must be explained separately');
  const newFolderHeader = await dialog.getByRole('button', {name:'New folder', exact:true}).evaluate(button => {
    const heading = [...button.parentElement.children].find(node => node.textContent === 'Sub-folders · click to navigate');
    return Boolean(heading) && Math.abs(heading.getBoundingClientRect().top - button.getBoundingClientRect().top) < button.clientHeight;
  });
  assert(newFolderHeader, 'New folder belongs beside the child-folder heading');
  const shortcuts = dialog.getByRole('region', {name:'Shortcuts', exact:true});
  assert(await shortcuts.count() === 1 && await shortcuts.evaluate(element => Boolean(element.compareDocumentPosition(document.querySelector('#folder-path')) & Node.DOCUMENT_POSITION_FOLLOWING)),
    'Shortcuts must precede the path in the single-column reading order');
  await option('guides').click();
  await page.getByTestId('folder-picker-meta').getByText(/No sub-folders/).waitFor();
  await dialog.getByRole('button', {name:'Up', exact:true}).click();
  await option('guides').waitFor();
  await option('guides').click();
  await dialog.getByRole('navigation', {name:'Folder location'}).getByRole('button', {name:'folder-navigation', exact:true}).click();
  await option('guides').waitFor();
  await dialog.getByRole('button', {name:'Cancel', exact:true}).click();
  await dialog.waitFor({state:'detached'});
  result.cancelKeepsDocument = await section.count() === 0 && await current() === 'technical-document.md';

  await openFolderPicker(page);
  await field.fill([folder, 'g'].join(sep));
  await option('guides').waitFor();
  assert(await dialog.getByRole('option').count() === 1, 'Partial path must filter the folders');
  await field.press('Tab');
  await page.getByTestId('folder-picker-meta').getByText(/No sub-folders/).waitFor();
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
  assert(await sidebar.getByRole("button", {name:"Collapse sidebar", exact:true}).evaluate(node => node === document.activeElement), 'Successful folder Open returns focus to header');
  await checkSidebarEntry('one');
  const sectionToggle = target => target.getByRole('button', {name:/^(Collapse|Expand) folder /});
  const firstSection = section.first();
  const toggle = sectionToggle(firstSection);
  assert(await toggle.count() === 1 && await toggle.getAttribute('aria-expanded') === 'true',
    'Opened folder section must expose an expanded toggle button');
  assert(await toggle.getAttribute('aria-controls') === await firstSection.getByRole('tree').getAttribute('id'),
    'Section toggle must control its tree');
  await toggle.focus();
  await page.keyboard.press('Enter');
  assert(await toggle.getAttribute('aria-expanded') === 'false' && !await firstSection.getByRole('tree').isVisible(),
    'Enter must collapse the whole section');
  await item('New document…').click();
  await page.getByTestId('new-file-name').waitFor();
  await page.keyboard.press('Escape');
  await dialog.waitFor({state:'detached'});
  assert(await toggle.getAttribute('aria-expanded') === 'false', 'Cancelled New must keep the section collapsed');
  result.enterOpensTypedFolder = await section.getByTitle(folder, {exact:true}).count() === 1;
  const refreshed = page.waitForResponse(response => response.url().includes('/api/folder-browse?') &&
    requestedFolder(response.url()) === folder + sep);
  await openFolderPicker(page);
  await refreshed;
  await option('guides').waitFor();
  await field.press('Escape');
  await dialog.waitFor({state:'detached'});
  result.refreshesOnReopen = await section.getByTitle(folder, {exact:true}).count() === 1;

  // Open adds another folder as its own section; Reload lists the opened folders again in order;
  // Close folder removes only its own section.
  const guides = [folder, 'guides'].join(sep);
  const roots = () => section.evaluateAll(sections => sections.map(element => element.dataset.root));
  await openFolderPicker(page);
  await enterFolder(guides);
  await page.getByTestId('folder-picker-meta').getByText(/No sub-folders/).waitFor();
  await open.click();
  await dialog.waitFor({state:'detached'});
  await section.nth(1).waitFor();
  assert(await toggle.getAttribute('aria-expanded') === 'false', 'Opening another folder must keep section collapse');
  await checkSidebarEntry('several');
  assert(await toggle.getAttribute('aria-expanded') === 'false', 'Relisting and tool/layout changes must keep section collapse');
  assert(JSON.stringify(await roots()) === JSON.stringify([folder, guides]), 'Open adds a folder after the opened ones');
  await page.reload();
  await ready();
  await section.nth(1).waitFor();
  assert(await toggle.getAttribute('aria-expanded') === 'false' && !await firstSection.getByRole('tree').isVisible(),
    'Reload must restore the remembered section collapse');
  assert(JSON.stringify(await roots()) === JSON.stringify([folder, guides]), 'Reload lists the opened folders again in order');
  if (screenshots) {
    for (const width of [1440, 640]) {
      await page.setViewportSize({width, height:812});
      await sidebar.getByRole('button', {name:'Collapse sidebar', exact:true}).waitFor();
      const environment = await page.evaluate(async () => {
        await document.fonts.ready; document.activeElement?.blur(); window.scrollTo(0, 0);
        return {viewport:[innerWidth, innerHeight], dpr:devicePixelRatio, zoom:visualViewport.scale,
          cssZoom:getComputedStyle(document.documentElement).zoom, font:getComputedStyle(document.querySelector('.product')).fontFamily,
          scroll:[scrollX, scrollY], language:document.documentElement.lang,
            rootNameWidth:document.querySelector('.sidebar-folder-name .sidebar-tree-name')?.getBoundingClientRect().width};
      });
      await page.mouse.move(width - 2, 2);
      await page.screenshot({path:`tmp/picker-capture/sidebar-restored-collapsed-${width}.png`});
      captureMetadata.push({state:'restored-collapsed', ...environment});
    }
    await page.setViewportSize({width:1280, height:720});
  }
  await section.nth(1).getByRole('button', {name:'More actions', exact:true}).click();
  await page.getByRole('menuitem', {name:'Close folder', exact:true}).click();
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="folder"]').length === 1);
  result.opensSeveralFolders = JSON.stringify(await roots()) === JSON.stringify([folder]);
  assert(await toggle.getAttribute('aria-expanded') === 'false', 'Closing another folder must retain section collapse');

  await folderMenu('Close folder');
  await page.reload();
  await ready();
  assert(await section.count() === 0, 'Reload restores no folder after the last one is closed');
  await openFolderPicker(page);
  const recent = dialog.getByRole('region', {name:'Recent folders'});
  await recent.getByRole('button', {name:folder, exact:true}).click();
  await option('guides').waitFor();
  result.remembersRecent = await field.inputValue() === folder + sep;
  await field.fill([folder, '자'].join(sep));
  await option('자료').waitFor();
  await field.press('ArrowRight');
  await page.getByTestId('folder-picker-meta').getByText(/No sub-folders/).waitFor();
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
  await page.setViewportSize({width:640, height:812});
  await field.fill(folder + sep + 'long-folder-name-'.repeat(12));
  const bounds = await dialog.boundingBox();
  const buttonBounds = await open.boundingBox();
  assert(bounds.x >= 0 && bounds.x + bounds.width <= 640 && bounds.y >= 0 && bounds.y + bounds.height <= 812, 'Dialog fits the viewport');
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
  await toggle.focus();
  await page.keyboard.press('Space');
  assert(await toggle.getAttribute('aria-expanded') === 'false' && !await tree.isVisible() && await current() === 'install.md',
    'Space must hide even the current document without changing it');
  await page.keyboard.press('Tab');
  assert(await item('New document…').evaluate(node => node === document.activeElement), 'Tab follows the visual order from disclosure to creation');
  await page.keyboard.press('Shift+Tab');
  assert(await toggle.evaluate(node => node === document.activeElement), 'Reverse Tab returns to the section toggle');
  await page.keyboard.press('Space');
  assert(await row('guides').getAttribute('aria-expanded') === 'true' && await row('install.md').getAttribute('aria-current') === 'page' &&
    JSON.stringify(await treeState()) === JSON.stringify(retained) && folderRequests.length === requestsBeforeSwitch,
    'Expanding section must retain child expansion, current marker, scroll and keyboard stop without relisting');
  for (const action of ['New document…', 'More actions']) {
    await page.keyboard.press('Tab');
    assert(await item(action).evaluate(node => node === document.activeElement), `Tab reaches ${action} in visual order`);
  }
  await page.keyboard.press('Tab');
  assert(await tree.locator('[tabindex="0"]').evaluate(node => node === document.activeElement), 'Tab enters the retained tree stop');
  await page.getByRole('button', {name:'Document settings', exact:true}).click();
  assert(await section.locator('[role="tree"]').isVisible(), 'Document settings must retain the mounted file navigation while expanded');
  await page.keyboard.press('Escape');
  await page.getByRole('region', {name:'Document settings',exact:true}).locator('.display-settings').waitFor({state:'hidden'});
  assert(JSON.stringify(await treeState()) === JSON.stringify(retained), 'Settings reset tree scroll or keyboard stop');
  await page.getByRole('button', {name:'Collapse sidebar', exact:true}).click();
  await page.getByRole('button', {name:'Expand sidebar', exact:true}).click();
  assert(JSON.stringify(await treeState()) === JSON.stringify(retained) && await row('guides').getAttribute('aria-expanded') === 'true' &&
    folderRequests.length === requestsBeforeSwitch, 'Reopening Files reset the tree or reloaded its folder');
  await page.setViewportSize(viewport);
  result.settingsPreservesTree = true;

  // #494: manual refresh updates cached children without scanning unknown folders or touching tabs.
  const tabsBeforeRefresh = await page.getByRole('tab').allTextContents();
  const editorBeforeRefresh = await page.locator('[data-document-tab][data-active=true] .document-editor').evaluate(n => ({doc:n.editor.getJSON(), selection:n.editor.state.selection.toJSON()}));
  const preferencesBeforeRefresh = await page.evaluate(() => [localStorage.getItem('ieumdoc.openFolders'), localStorage.getItem('ieumdoc.collapsedFolderSections')]);
  const refreshRoute = async route => {
    const response = await route.fetch();
    const listing = await response.json();
    if (listing.path === folder || listing.path === guidesPath) {
      listing.entries = listing.entries.filter(entry => entry.name !== 'index.md');
      listing.entries.push({name:'refresh-added.md', path:listing.path + sep + 'refresh-added.md', kind:'document', native:true});
    }
    await route.fulfill({response, json:listing});
  };
  await page.route('**/api/folder?*', refreshRoute);
  folderRequests.length = 0;
  await folderMenu('Refresh');
  await row('refresh-added.md').last().waitFor();
  assert(await row('refresh-added.md').count() === 2 && await row('index.md').count() === 0, 'Refresh must update root and loaded child additions/removals');
  assert(JSON.stringify([...folderRequests].sort()) === JSON.stringify([folder, guidesPath].sort()), 'Refresh reads only loaded reachable folders');
  assert(await row('guides').getAttribute('aria-expanded') === 'true' && await row('install.md').getAttribute('aria-current') === 'page', 'Refresh retains expansion and active selection');
  assert(JSON.stringify(await page.getByRole('tab').allTextContents()) === JSON.stringify(tabsBeforeRefresh) && await current() === 'install.md', 'Refresh retains tabs including removed files');
  assert(JSON.stringify(await page.locator('[data-document-tab][data-active=true] .document-editor').evaluate(n => ({doc:n.editor.getJSON(), selection:n.editor.state.selection.toJSON()}))) === JSON.stringify(editorBeforeRefresh), 'Refresh preserves editor content and selection');
  await page.unroute('**/api/folder?*', refreshRoute);
  // The center uses the same root handler even with the entire section hidden.
  await toggle.click();
  folderRequests.length = 0;
  await page.keyboard.press('Control+Slash');
  const refreshCenter = page.getByRole('dialog', {name:'Command center', exact:true});
  await refreshCenter.getByRole('combobox').fill('> refresh folder');
  await page.keyboard.press('Enter');
  await refreshCenter.waitFor({state:'detached'});
  await page.waitForFunction(() => ![...document.querySelectorAll('.sidebar-tree-name')].some(n => n.textContent === 'refresh-added.md'));
  assert(await toggle.getAttribute('aria-expanded') === 'false', 'Center refresh retains collapsed section');
  assert(JSON.stringify([...folderRequests].sort()) === JSON.stringify([folder, guidesPath].sort()), 'Center refresh reuses the loaded-list handler');
  await toggle.click();
  assert(JSON.stringify(await items()) === JSON.stringify(expandedTree), 'Refresh restores actual Host listing');
  assert(JSON.stringify(await page.evaluate(() => [localStorage.getItem('ieumdoc.openFolders'), localStorage.getItem('ieumdoc.collapsedFolderSections')])) === JSON.stringify(preferencesBeforeRefresh), 'Refresh itself must not write preferences');
  result.refreshLoadedFolders = true;

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

  // Unsaved work stays in its tab while another tree document opens.
  await page.locator('[data-document-tab][data-active=true] .document-editor > .paragraph').first().click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Draft.');
  await row('notes.md').click();
  await waitForActivePath(page, [folder, 'notes.md'].join(sep)); await ready();
  await page.getByRole('tab', {name:'install.md, Unsaved changes',exact:true}).click();
  result.keepsUnsavedWork = await current() === 'install.md' &&
    (await page.locator('[data-document-tab][data-active=true] .document-editor > .paragraph').first().innerText()).endsWith('Draft.');
  await item('New document…').click();
  assert(await page.getByTestId('new-file-directory').inputValue() === guidesPath, 'New starts in the open document\'s folder');
  await page.getByTestId('new-file-name').fill('blocked');
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
  await page.setViewportSize({width:640, height:812});
  await toggle.click();
  await item('New document…').click();
  const filename = page.getByTestId('new-file-name');
  assert(await page.getByTestId('new-file-directory').inputValue() === folder, 'Root folder is the creation destination');
  await filename.fill('cancelled');
  await filename.press('Escape');
  await dialog.waitFor({state:'detached'});
  await item('New document…').click();
  assert(await filename.inputValue() === '', 'Reopening clears the cancelled name');
  await filename.fill('cancelled-again');
  await dialog.getByRole('button', {name:'Cancel', exact:true}).click();
  await dialog.waitFor({state:'detached'});
  assert(createRequests === 0 && await current() === 'index.md', 'Cancel and Escape do not create or switch documents');
  result.folderNewCancels = true;

  await item('New document…').click();
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
  assert(newBounds.x >= 0 && newBounds.x + newBounds.width <= 640 && newBounds.y >= 0 && newBounds.y + newBounds.height <= 812, 'New dialog fits the narrow viewport');
  assert(createBounds.x >= newBounds.x && createBounds.x + createBounds.width <= newBounds.x + newBounds.width, 'Create remains reachable');
  if (screenshots) await page.screenshot({path:'tmp/picker-capture/06-new-file.png'});
  await filename.press('Enter');
  await dialog.waitFor({state:'detached'});
  // Creating a document keeps its folder and newly listed file visible.
  await row('added.md').waitFor();
  result.listsCreated = await row('added.md').getAttribute('aria-current') === 'page';
  assert(await page.getByTestId('current-file').getAttribute('title') === [folder, 'added.md'].join(sep), 'Omitted extension creates a Markdown file in the chosen folder');
  await page.setViewportSize({width:1280, height:720});

  const existingPath = [folder, 'index.md'].join(sep);
  const read = async path => (await page.request.get(`${origin}/api/document?path=${encodeURIComponent(path)}`)).json();
  const beforeExisting = await read(existingPath);
  await item('New document…').click();
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
  await item('New document…').click();
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
  const editor = page.locator('[data-document-tab][data-active=true] [data-testid="document-editor"] [contenteditable="true"]');
  // The empty paragraph, not the Add a title place above it (#255).
  await editor.locator('> p').first().click();
  await page.keyboard.type('Created in the displayed folder.');
  await page.getByRole('button', {name:'Save', exact:true}).click();
  await page.getByText('Saved', {exact:true}).filter({visible:true}).waitFor();
  await page.getByRole('button', {name:'File actions', exact:true}).click();
  await page.getByRole('menuitem', {name:'Reload', exact:true}).click();
  await ready();
  assert(await current() === '추가.md' && (await editor.innerText()).includes('Created in the displayed folder.') &&
    (await read(createdPath)).source.includes('Created in the displayed folder.'), 'Save and Reload preserve the actual new file');
  result.createsInSubFolderAndPersists = true;

  // Sidebar New folder starts at the open document's folder; a collapsed destination is expanded
  // to show the folder, which can take a new file at once. The open document stays.
  if (await row('guides').getAttribute('aria-expanded') === 'true') await row('guides').click();
  await toggle.click();
  await folderMenu('New folder…');
  await dialog.getByRole('button', {name:'Cancel', exact:true}).click();
  await dialog.waitFor({state:'detached'});
  assert(await item('More actions').evaluate(node => node === document.activeElement) && await toggle.getAttribute('aria-expanded') === 'false',
    'Cancelling menu New folder returns to More actions and keeps section collapse');
  await folderMenu('New folder…');
  const folderDestination = page.getByTestId('new-folder-directory');
  assert(await folderDestination.inputValue() === subFolder, "New folder starts in the open document's folder");
  await folderDestination.selectOption(guidesPath);
  await page.getByTestId('new-folder-name').fill('chapter');
  await page.getByTestId('new-folder-name').press('Enter');
  await dialog.waitFor({state:'detached'});
  await row('chapter').waitFor();
  assert(await row('guides').getAttribute('aria-expanded') === 'true' && await row('chapter').getAttribute('aria-level') === '2' &&
    await current() === '추가.md' && await item('More actions').evaluate(node => node === document.activeElement), 'Sidebar New folder shows the created folder');
  if (screenshots) await page.screenshot({path:'tmp/picker-capture/08-sidebar-new-folder.png'});
  await item('New document…').click();
  const chapterPath = [guidesPath, 'chapter'].join(sep);
  assert((await destination.evaluate(select => [...select.options].map(option => option.value))).includes(chapterPath), 'A created folder is a New file destination');
  await page.keyboard.press('Escape');
  await dialog.waitFor({state:'detached'});
  result.sidebarCreatesFolder = true;

  // A folder created while choosing appears in the sidebar folder already listed; the second
  // Escape closes the picker without opening anything.
  await openFolderPicker(page);
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

  // The general picker returns focus to its surviving folder-menu trigger, including Cancel.
  await openFolderPicker(page);
  await field.waitFor();
  await dialog.getByRole('button', {name:'Cancel', exact:true}).click();
  await dialog.waitFor({state:'detached'});
  result.opensFolderFromMenu = await current() === '추가.md' && await section.getByRole("button", {name:"More actions", exact:true}).evaluate(node => node === document.activeElement);
  const more = section.getByRole('button', {name:'More actions', exact:true});
  await more.focus();
  await page.keyboard.press('Enter');
  await page.getByRole('menuitem', {name:'Close folder', exact:true}).waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('menuitem', {name:'Close folder', exact:true}).waitFor({state:'hidden'});
  result.menuKeyboard = await more.evaluate(node => node === document.activeElement) && await section.count() === 1;

  await toggle.click();
  await openFolderPicker(page);
  await field.fill(folder);
  await open.click();
  await dialog.waitFor({state:'detached'});
  assert(await toggle.getAttribute('aria-expanded') === 'false', 'Relisting the active document root must respect manual section collapse');
  await folderMenu('Close folder');
  result.closes = await section.count() === 0 && await current() === '추가.md';

  // Choosing the folder again opens it down to the open document; nothing else is expanded.
  await openFolderPicker(page);
  await field.fill(folder);
  await open.click();
  await dialog.waitFor({state:'detached'});
  await row('추가.md').waitFor();
  result.revealsOpenDocument = await row('자료').getAttribute('aria-expanded') === 'true' &&
    await row('추가.md').getAttribute('aria-current') === 'page' && await row('guides').getAttribute('aria-expanded') === 'false';
  await folderMenu('Close folder');

  // Root identity uses the same compact row as child folders; long names ellipsize with the full path available.
  for (const name of ['a', '한글 English 프로젝트 문서와 설계 자료를 모아둔 아주 긴 폴더 이름 Long Folder Name 2026', 'UnbrokenFolderName'.repeat(7)]) {
    await openFolderPicker(page);
    await enterFolder(folder);
    await option('guides').waitFor();
    await newFolder.click();
    await newFolderName.fill(name);
    await newFolderName.press('Enter');
    await page.getByTestId('folder-picker-meta').getByText(/No sub-folders/).waitFor();
    await open.click();
    await dialog.waitFor({state:'detached'});
    await section.getByTitle([folder, name].join(sep), {exact:true}).waitFor();
    for (const width of [1440, 1024, 640]) {
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
        const label = heading.querySelector('.sidebar-tree-name');
        const bounds = header.getBoundingClientRect();
        const icon = heading.querySelector('.sidebar-tree-chevron svg').getBoundingClientRect();
        const actions = required('.sidebar-folder-actions').getBoundingClientRect();
        const labelBounds = label.getBoundingClientRect();
        const toggle = required('.sidebar-folder-toggle');
        const buttons = [...required('.sidebar-folder-actions').querySelectorAll('button'), toggle];
        const rootStyle = getComputedStyle(document.documentElement);
        return {
          text: label.textContent,
          fullPath: heading.title,
          ellipsis: getComputedStyle(label).textOverflow === 'ellipsis' && getComputedStyle(label).whiteSpace === 'nowrap',
          truncated: label.scrollWidth > label.clientWidth,
          clipped: labelBounds.width <= 0 || labelBounds.left < icon.right || labelBounds.right > actions.left,
          overflow: header.scrollWidth > header.clientWidth || document.documentElement.scrollWidth > innerWidth,
          actionsAtTop: Math.abs(actions.top - bounds.top) < 0.5,
          sameFirstRow: Math.abs(toggle.getBoundingClientRect().top - actions.top) < 0.5,
          iconAtFirstLine: Math.abs(icon.top + icon.height / 2 - labelBounds.top - labelBounds.height / 2) < 0.5,
          reachable: buttons.every(button => {
            const rect = button.getBoundingClientRect();
            return rect.left >= bounds.left && rect.right <= bounds.right + 0.5 &&
              button.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2));
          }),
          toggleTarget: toggle.getBoundingClientRect().width === parseFloat(rootStyle.getPropertyValue('--size-control-compact')) * parseFloat(rootStyle.fontSize) &&
            toggle.getBoundingClientRect().height === parseFloat(rootStyle.getPropertyValue('--size-control-compact')) * parseFloat(rootStyle.fontSize),
          toggleNeutral: getComputedStyle(toggle).backgroundColor === 'rgba(0, 0, 0, 0)',
          compact: Math.abs(bounds.height - actions.height) < 0.5 && Math.abs(icon.top + icon.height / 2 - actions.top - actions.height / 2) < 0.5,
          labelGap: labelBounds.left - icon.right,
          expectedGap: parseFloat(rootStyle.getPropertyValue('--space-2')) * parseFloat(rootStyle.fontSize),
        };
      }, name);
      assert(geometry.text === name && geometry.fullPath === [folder, name].join(sep) && geometry.ellipsis && !geometry.clipped && !geometry.overflow && geometry.actionsAtTop && geometry.sameFirstRow && geometry.iconAtFirstLine && geometry.reachable && geometry.toggleTarget && geometry.toggleNeutral,
        `Root folder name must remain accessible with reachable actions at ${width}px: ${JSON.stringify(geometry)}`);
      assert(geometry.compact && Math.abs(geometry.labelGap - geometry.expectedGap) < 0.5 && geometry.truncated === (name !== 'a'),
        `Compact root row / long name ellipsis at ${width}px: ${JSON.stringify(geometry)}`);
      const empty = section.getByText('No files or folders', {exact:true});
      await toggle.click();
      assert(!await empty.isVisible() && !await section.getByRole('tree').isVisible(), 'Empty help must collapse with the tree');
      await toggle.click();
      assert(await empty.isVisible(), 'Expanding an empty section restores its help');
    }
    await folderMenu('Close folder');
  }
  result.folderNamesReadable = true;
  // Presentation stress uses only read-only browse fixtures; no folder/document is opened.
  const longName = '한글 English 프로젝트 문서와 설계 자료를 모아둔 아주 긴 폴더 이름 '.repeat(3).trim();
  const browseEntries = Array.from({length:30}, (_, index) => ({name:`${index} ${longName}`, path:folder + sep + index, kind:'folder'}));
  await page.route('**/api/folder-browse?*', route => route.fulfill({json:{path:folder, crumbs:[{name:'folder-navigation', path:folder}], entries:browseEntries}}));
  await page.route('**/api/folder-places', route => route.fulfill({json:{places:[{name:longName, path:folder, kind:'root'}]}}));
  await openFolderPicker(page);
  await field.fill(folder + sep);
  await option(browseEntries[0].name).waitFor();
  await dialog.getByTitle(folder, {exact:true}).first().waitFor();
  for (const width of [1440, 640]) {
    await page.setViewportSize({width, height:667});
    // A same-value fill does not dispatch a user edit, so explicitly reset the active entry.
    await field.fill('');
    await field.fill(folder + sep);
    await option(browseEntries[0].name).waitFor();
    await dialog.evaluate(async element => { await document.fonts.ready; await Promise.all(element.getAnimations().map(animation => animation.finished)); });
    const bounds = await dialog.evaluate(element => {
      const list = element.querySelector('[role=listbox]');
      return {overflow:element.scrollWidth > element.clientWidth, pageOverflow:document.documentElement.scrollWidth > innerWidth,
        listScrollable:list.scrollHeight > list.clientHeight, listHeight:list.clientHeight, rowHeight:list.firstElementChild.clientHeight};
    });
    assert(!bounds.overflow && !bounds.pageOverflow && bounds.listScrollable && bounds.listHeight >= bounds.rowHeight,
      `Long names and a long child list must stay within the usable scrollable picker at ${width}px: ${JSON.stringify(bounds)}`);
    await field.focus();
    await field.press('ArrowUp');
    const lastId = await field.getAttribute('aria-activedescendant');
    assert(lastId && await page.locator(`[id="${lastId}"]`).innerText() === browseEntries.at(-1).name,
      'Keyboard navigation must reach the last child with a long name');
    await open.scrollIntoViewIfNeeded();
    const reachable = await open.evaluate(button => {
      const rect = button.getBoundingClientRect();
      return button.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
    });
    assert(reachable, 'Open stays reachable by dialog scrolling with long shortcut names');
  }
  await field.press('Escape');
  await dialog.waitFor({state:'detached'});
  await page.unrouteAll();
  result.longPickerNamesAndScroll = true;
  for (const [name, passed] of Object.entries(result)) assert(passed, `${name} failed`);
  return {...result, captureMetadata};
}
