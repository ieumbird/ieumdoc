// Run with pnpm browser:test figure-authoring.
// Exercises Figure editing, insertion, Apply/Cancel, Save and Reload against a real file.
// The file is a scratch copy under the repository's ignored tmp/ directory; prepare it first
// (see docs/test/TEST_GUIDE.md). The scenario writes that copy only.
async (page, { openFolderPicker, openDocument, waitForEditorFocus, expect, screenshots }) => {
  const problems = [];
  const onConsole = message => {
    if (message.type() === 'error' || message.type() === 'warning') problems.push(`${message.type()}: ${message.text()}`);
  };
  const onPageError = error => problems.push(`pageerror: ${error.message}`);
  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  await page.unrouteAll();
  // Keep the compact before/after fixture independent of earlier scenarios' recent folders.
  await page.evaluate(() => localStorage.removeItem('ieumdoc.recentFolders'));
  await page.reload();
  await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});

  const origin = page.url().split('/').slice(0, 3).join('/');
  const defaultPath = (await (await page.request.get(`${origin}/api/document`)).json()).path;
  const separator = defaultPath.includes('\\') ? '\\' : '/';
  const root = defaultPath.split(separator).slice(0, -4).join(separator);
  const filePath = [root, 'tmp', 'figure-authoring', 'technical-document.md'].join(separator);
  const media = name => `${origin}/document/${name}?path=${encodeURIComponent(filePath)}`;
  for (const name of ['diagram.svg', 'diagram-v2.svg']) {
    if ((await page.request.get(media(name))).status() !== 200) {
      throw new Error(`Prepare ${filePath} with diagram.svg and diagram-v2.svg first`);
    }
  }
  const semantic = async () => {
    const response = await (await page.request.get(`${origin}/api/document?path=${encodeURIComponent(filePath)}`)).json();
    return response.document.blocks.filter(block => block.block === 'figure').map(block => ({
      label: block.label, imageUrl: block.imageUrl, imageAlt: block.imageAlt, caption: block.caption.text,
    }));
  };
  const initial = await semantic();
  if (initial.length !== 1 || initial[0].label !== 'fig-control' || initial[0].imageUrl !== './diagram.svg') {
    throw new Error(`Scratch document is not a fresh technical-document.md copy: ${JSON.stringify(initial)}`);
  }

  const result = {};
  const figures = page.locator('[data-document-tab][data-active=true] [data-block="figure"]');
  const saveEnabled = page.locator('.document-tab-row [data-testid="save"]:not([aria-disabled="true"])');
  const saveDisabled = page.locator('.document-tab-row [data-testid="save"][aria-disabled="true"]');
  const imageLoaded = figure => figure.locator('[data-testid="figure-image"]').evaluate(async image => {
    if (!image.complete) await new Promise(resolve => { image.onload = image.onerror = resolve; });
    return image.naturalWidth > 0 && image.getAttribute('src');
  });
  const openScratch = async () => {
    await page.reload();
    await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
    await openDocument(page, filePath);
    await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
    if (!(await page.getByTestId('current-file').getAttribute('title')).includes('figure-authoring')) throw new Error('Scratch file was not opened');
  };
  const save = async () => {
    await saveEnabled.waitFor();
    await page.getByRole('button', {name:'Save', exact:true}).click();
    await page.getByText('Saved', {exact:true}).filter({visible:true}).waitFor();
  };
  // Where closing a form leaves keyboard focus: the editor and the top-level block of its selection.
  const editorFocus = () => page.evaluate(() => {
    const {editor} = document.querySelector('[data-document-tab][data-active=true] .document-editor');
    const {selection} = editor.state;
    const block = selection.node ?? selection.$from.node(1);
    return editor.view.hasFocus() && {block: block?.type.name, path: block?.attrs.sourcePath, from: selection.from, to: selection.to,
      empty: selection.empty, text: selection.$from.parent.textContent};
  });
  const insertAfterParagraph = async name => {
    const paragraph = page.getByText('The current reference is calculated from the active power command.', {exact:true}).filter({visible:true});
    await paragraph.hover();
    await page.getByRole('button', {name:'Insert block after paragraph block 9'}).click();
    await page.getByRole('menu', {name:'Insert block'}).getByRole('menuitem', {name, exact:true}).click();
  };
  const editor = page.getByTestId('figure-editor');
  const imageFocused = () => page.waitForFunction(() => document.activeElement?.getAttribute('data-testid') === 'figure-replace', null, {timeout:2000})
    .then(() => true, () => false);

  try {
    await openScratch();
    if (screenshots) {
      await figures.first().getByTestId('figure-image').dblclick();
      for (const width of [1440, 640]) {
        await page.setViewportSize({width, height:900});
        await page.getByTestId('figure-editor').waitFor();
        await page.screenshot({path:`tmp/image-names-652/after-${width}.png`, animations:'disabled'});
      }
      await page.getByTestId('figure-alt').press('Escape');
      await page.setViewportSize({width:1440, height:900});
    }
    const baselineParagraphs = await page.locator('[data-document-tab][data-active=true] [data-block="paragraph"]').count();

    const snapshot = () => page.locator('[data-document-tab][data-active=true] .document-editor').evaluate(element => element.editor.getJSON());
    // #470: native caption word selection remains text editing, not a properties shortcut.
    const shortcutCaption = figures.first().getByTestId('figure-caption-content');
    await shortcutCaption.scrollIntoViewIfNeeded();
    const word = await shortcutCaption.evaluate(element => {
      const text = document.createTreeWalker(element, NodeFilter.SHOW_TEXT).nextNode();
      const range = document.createRange();
      range.setStart(text, 0);
      range.setEnd(text, 'Control'.length);
      const rect = range.getBoundingClientRect();
      return {x:rect.x + rect.width / 2, y:rect.y + rect.height / 2};
    });
    await page.mouse.dblclick(word.x, word.y);
    expect(await page.evaluate(() => window.getSelection().toString().trim())).toBe('Control');
    expect(await editor.count(), 'Caption double-click must not open properties').toBe(0);

    const beforeShortcut = await snapshot();
    await shortcutCaption.click();
    await page.keyboard.press('End');
    await page.keyboard.type(' History probe.');
    const withProbe = await snapshot();
    const image = figures.first().getByTestId('figure-image');
    for (const close of ['escape']) {
      let editFocus;
      for (const entry of ['Edit', 'double-click', 'Enter']) {
        if (entry === 'Edit') {
          await image.click({position:{x:80,y:140}, timeout:5000});
          await figures.first().getByRole('button', {name:'Edit figure'}).click();
        } else if (entry === 'Enter') {
          await image.click({position:{x:80,y:140}, timeout:5000});
          await page.keyboard.press('Enter');
        } else await image.dblclick({position:{x:80,y:140}, timeout:5000});
        await expect(page.getByTestId('figure-replace'), `${entry} focuses Replace`).toBeFocused();
        expect(await snapshot(), `${entry} leaves document unchanged`).toEqual(withProbe);
        if (entry === 'double-click') {
          if (!await page.getByTestId('figure-image-url').isVisible()) await page.getByTestId('figure-replace').click();
          await page.getByTestId('figure-image-url').fill('./unapplied.svg');
          await image.evaluate(el => el.closest('[data-node-view-wrapper]').dispatchEvent(new Event('ieumdoc-edit-properties', {cancelable:true})));
          expect(await page.getByTestId('figure-image-url').inputValue(), 'Already editing keeps the draft').toBe('./unapplied.svg');
        }
        await page.getByTestId('figure-alt').press('Escape');
        await editor.waitFor({state:'detached'});
        const focus = await editorFocus();
        expect(Boolean(focus), `${entry} returns editor focus on ${close}`).toBe(true);
        if (entry === 'Edit') editFocus = focus;
        else expect(focus, `${close} restores the same caret as Edit`).toEqual(editFocus);
        expect(await snapshot()).toEqual(withProbe);
      }
    }
    await page.keyboard.press('ControlOrMeta+z');
    expect(await snapshot(), 'Opening/closing properties adds no Undo step').toEqual(beforeShortcut);
    await page.keyboard.press('ControlOrMeta+Shift+z');
    expect(await snapshot(), 'Opening properties preserves Redo').toEqual(withProbe);
    await page.keyboard.press('ControlOrMeta+z');

    // #757: one completion action, conditional number input, explicit file rename and outside apply.
    await image.dblclick();
    await expect(editor.getByRole('button', {name:'Done',exact:true})).toBeVisible();
    await expect(editor.getByRole('button', {name:'Cancel',exact:true})).toHaveCount(0);
    await expect(page.getByTestId('figure-image-url')).toHaveCount(0);
    await expect(page.getByTestId('figure-enumerator')).toHaveCount(0);
    await editor.getByRole('button', {name:'Fixed',exact:true}).click();
    await page.getByTestId('figure-enumerator').fill('A.2');
    await editor.getByRole('button', {name:'Automatic',exact:true}).click();
    await expect(page.getByTestId('figure-enumerator')).toHaveCount(0);
    await expect(page.getByTestId('figure-file-name')).toBeHidden();
    await editor.getByText('Advanced', {exact:true}).click();
    await page.getByTestId('figure-file-name').fill('Pending filename');
    await page.getByTestId('figure-apply').click();
    await expect(editor).toHaveCount(0);
    expect(await image.getAttribute('src')).toContain('diagram.svg');
    await expect(page.getByTestId('draft-notice')).toBeVisible();
    await image.dblclick();
    await expect(page.getByTestId('figure-file-name')).toBeVisible();
    expect(await page.getByTestId('figure-file-name').inputValue()).toBe('Pending filename');
    await page.getByTestId('figure-alt').press('Escape');
    expect(await snapshot()).toEqual(beforeShortcut);
    await image.dblclick();
    await expect(page.getByTestId('figure-file-name')).toBeHidden();
    await page.getByTestId('figure-alt').fill('Outside applied alt');
    const outside = page.getByText('The current reference is calculated from the active power command.', {exact:true}).filter({visible:true});
    let releaseOutside, receivedOutside;
    const outsideGate=new Promise(resolve => releaseOutside=resolve), outsideStarted=new Promise(resolve => receivedOutside=resolve);
    const holdOutside=async route => { receivedOutside(); await outsideGate; await route.continue(); };
    await page.route('**/api/figure-validation',holdOutside);
    await outside.click(); await outsideStarted;
    // The existing preview input guard can retain NodeSelection on the first prose click.
    // Completion must preserve the actual outside focus owner, without forcing a new caret.
    const outsideFocus=await page.evaluateHandle(() => document.activeElement);
    releaseOutside(); await expect(editor).toHaveCount(0);
    await page.unroute('**/api/figure-validation',holdOutside);
    expect(await image.getAttribute('alt')).toBe('Outside applied alt');
    expect(await page.evaluate(element => document.activeElement===element,outsideFocus)).toBe(true);
    await outsideFocus.dispose();
    await page.keyboard.press('ControlOrMeta+z');
    expect(await snapshot()).toEqual(beforeShortcut);
    // Bounds exclude the single-group Sidebar/Outline insets and the native scrollbar.
    for (const width of [1440,640]) {
      await page.setViewportSize({width,height:900});
      for (const side of ['bottom','top']) {
        await image.scrollIntoViewIfNeeded();
        await image.evaluate((el,side) => {
          const figure=el.closest('figure'), viewport=el.closest('.document-scroll');
          const rect=figure.getBoundingClientRect();
          viewport.scrollTop += rect.top - (side==='bottom'?120:850-rect.height);
        },side);
        await image.dblclick();
        const popup=page.getByTestId('figure-properties');
        await expect(popup).toHaveAttribute('data-side',side);
        const geometry=await popup.evaluate(el => {
          const figure=document.querySelector('[data-document-tab][data-active=true] figure'), viewport=figure.closest('.document-scroll');
          const r=viewport.getBoundingClientRect(), s=getComputedStyle(viewport), p=el.getBoundingClientRect(), f=figure.getBoundingClientRect();
          return {left:r.left+parseFloat(s.paddingLeft), right:r.left+viewport.clientWidth-parseFloat(s.paddingRight), top:r.top,bottom:r.bottom,
            p:{left:p.left,right:p.right,top:p.top,bottom:p.bottom},f:{top:f.top,bottom:f.bottom}};
        });
        expect(geometry.p.left).toBeGreaterThanOrEqual(geometry.left);
        expect(geometry.p.right).toBeLessThanOrEqual(geometry.right);
        expect(geometry.p.top).toBeGreaterThanOrEqual(geometry.top);
        expect(geometry.p.bottom).toBeLessThanOrEqual(geometry.bottom);
        expect(geometry.p.top>=geometry.f.bottom || geometry.p.bottom<=geometry.f.top, JSON.stringify(geometry)).toBe(true);
        await page.getByTestId('figure-alt').press('Escape');
      }
    }
    await page.setViewportSize({width:1280,height:720});

    // #427: real keyboard deletion/Undo must restore the entire engine document and Figure DOM.
    const beforeDelete = await snapshot();
    for (const key of ['Backspace', 'Delete']) {
      await page.getByText('The current reference is calculated from the active power command.', {exact:true}).filter({visible:true}).click();
      // Undo restores AllSelection; wait for the real click's caret before sending Select all.
      await page.waitForFunction(() => {
        const {editor} = document.querySelector('[data-document-tab][data-active=true] .document-editor');
        return editor.view.hasFocus() && editor.state.selection.empty && editor.state.selection.$from.parent.type.name === 'paragraph';
      });
      await page.keyboard.press('ControlOrMeta+a');
      await page.keyboard.press('ControlOrMeta+a');
      await page.keyboard.press(key);
      expect(await figures.count(), 'Select all deletes the Figure').toBe(0);
      await page.keyboard.press('ControlOrMeta+z');
      expect(await snapshot(), 'One Undo restores the exact document').toEqual(beforeDelete);
      await page.keyboard.press('ControlOrMeta+Shift+z');
      expect(await figures.count(), 'Redo deletes the document again').toBe(0);
      await page.keyboard.press('ControlOrMeta+z');
      expect(await snapshot()).toEqual(beforeDelete);
    }
    expect(await figures.first().locator('img').getAttribute('alt')).toBe(initial[0].imageAlt);
    expect(await figures.first().locator('figcaption').innerText()).toBe(initial[0].caption);
    expect(Boolean(await imageLoaded(figures.first()))).toBe(true);

    // A. Existing Figure: selection opens no properties; explicit Edit, Apply, Save, Reload.
    await figures.first().locator('img').click();
    result.selectionOnly = await page.getByTestId('figure-properties').count() === 0 && await editor.count() === 0 &&
      await page.evaluate(() => document.activeElement?.closest('[data-document-tab][data-active=true] .document-editor') !== null);
    await figures.first().getByRole('button', {name:'Edit figure'}).locator('..').hover({position:{x:4,y:4}});
    await figures.first().getByRole('button', {name:'Edit figure'}).click();
    await editor.waitFor();
    result.editFocusesImage = await imageFocused();
    // #461: a clicked image is selected without hiding its siblings; editing resumes filtering.
    const picker = page.getByRole('dialog', {name:'Choose image'});
    const pathField = picker.getByRole('combobox', {name:'Image path'});
    const imageNames = ['diagram-v2.svg', 'diagram.svg'];
    const listedImages = async () => (await picker.getByRole('option').allTextContents()).filter(name => imageNames.includes(name)).sort();
    if (!await page.getByRole('button', {name:'Choose…', exact:true}).isVisible()) await page.getByTestId('figure-replace').click();
    await page.getByRole('button', {name:'Choose…', exact:true}).click();
    await picker.getByRole('option', {name:'diagram-v2.svg', exact:true}).waitFor();
    expect(await listedImages()).toEqual(imageNames);
    await picker.getByRole('option', {name:'diagram.svg', exact:true}).click();
    expect(await listedImages(), 'Selecting an image keeps sibling images listed (#461)').toEqual(imageNames);
    expect(await picker.getByRole('option', {name:'diagram.svg', exact:true}).getAttribute('aria-selected')).toBe('true');
    expect(await pathField.inputValue()).toBe(filePath.replace('technical-document.md', 'diagram.svg'));
    // Manual same-state comparison only; these images are not automated visual assertions.
    if (screenshots) {
      const viewport = page.viewportSize();
      await page.mouse.move(0, 0);
      await page.evaluate(() => document.fonts.ready);
      const image = picker.getByRole('region', {name:'Read-only image preview'}).locator('img');
      if (await image.count()) await image.evaluate(async image => {
        if (!image.complete) await new Promise(resolve => { image.addEventListener('load', resolve, {once:true}); image.addEventListener('error', resolve, {once:true}); });
      });
      for (const width of [1440, 640]) {
        await page.setViewportSize({width, height:1000});
        await picker.screenshot({path:`tmp/image-picker-preview/selected-${width}.png`, animations:'disabled'});
      }
      await page.setViewportSize({width:640, height:667});
      await picker.screenshot({path:'tmp/image-picker-preview/compact-640-667.png', animations:'disabled'});
      await page.setViewportSize({width:1366, height:768});
      await picker.screenshot({path:'tmp/image-picker-preview/desktop-1366-768.png', animations:'disabled'});
      await page.setViewportSize(viewport);
    }
    const preview = picker.getByRole('region', {name:'Read-only image preview'});
    const previewImage = preview.getByRole('img', {name:'diagram.svg', exact:true});
    await expect(previewImage, 'The clicked image has a preview before Use (#480)').toBeVisible();
    await expect.poll(() => previewImage.evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
    expect(await pathField.inputValue()).toBe(filePath.replace('technical-document.md', 'diagram.svg'));
    await expect(pathField).toBeFocused();
    await pathField.press('End');
    await pathField.press('Backspace');
    expect(await listedImages(), 'Editing the clicked path resumes filtering').toEqual(['diagram.svg']);
    expect(await picker.getByRole('option', {selected:true}).count()).toBe(0);
    await pathField.fill(filePath.replace('technical-document.md', 'diagram-v'));
    expect(await listedImages(), 'Typed path prefixes still filter').toEqual(['diagram-v2.svg']);
    await pathField.press('Tab');
    expect(await pathField.inputValue()).toBe(filePath.replace('technical-document.md', 'diagram-v2.svg'));
    expect(await listedImages(), 'Keyboard completion keeps path filtering').toEqual(['diagram-v2.svg']);
    await pathField.fill(filePath.slice(0, -'technical-document.md'.length));
    expect(await listedImages()).toEqual(imageNames);
    await picker.getByRole('option', {name:'diagram-v2.svg', exact:true}).click();
    expect(await listedImages()).toEqual(imageNames);
    expect(await picker.getByRole('option', {name:'diagram-v2.svg', exact:true}).getAttribute('aria-selected')).toBe('true');
    await picker.getByRole('button', {name:'Use “diagram-v2.svg”', exact:true}).click();
    await picker.waitFor({state:'hidden'});
    expect(await page.getByTestId('figure-image-url').inputValue()).toBe('./diagram-v2.svg');
    if (!await page.getByRole('button', {name:'Choose…', exact:true}).isVisible()) await page.getByTestId('figure-replace').click();
    await page.getByRole('button', {name:'Choose…', exact:true}).click();
    await picker.getByRole('option', {name:'diagram-v2.svg', exact:true}).waitFor();
    expect(await listedImages()).toEqual(imageNames);
    expect(await picker.getByRole('option', {selected:true}).count()).toBe(0);
    await picker.getByRole('button', {name:'Cancel', exact:true}).click();
    await picker.waitFor({state:'hidden'});
    // A case-sensitive Host can list both names, even when this test runs on Windows.
    const caseSensitiveListing = async route => {
      const response = await route.fetch();
      const listing = await response.json();
      const original = listing.entries.find(entry => entry.name === 'diagram.svg');
      if (!original) return route.fulfill({response});
      const other = {...original, name:'Diagram.svg', path:original.path.replace(/diagram\.svg$/, 'Diagram.svg')};
      await route.fulfill({response, json:{...listing, entries:[other, ...listing.entries]}});
    };
    await page.route('**/api/folder-browse?*', caseSensitiveListing);
    try {
      if (!await page.getByRole('button', {name:'Choose…', exact:true}).isVisible()) await page.getByTestId('figure-replace').click();
    await page.getByRole('button', {name:'Choose…', exact:true}).click();
      const upper = picker.getByRole('option', {name:'Diagram.svg', exact:true});
      const lower = picker.getByRole('option', {name:'diagram.svg', exact:true});
      await upper.waitFor();
      for (const key of ['Tab', 'ArrowRight']) {
        await pathField.fill(filePath.slice(0, -'technical-document.md'.length));
        await lower.click();
        expect(await lower.getAttribute('aria-selected'), 'Click selects the exact Host path, including case').toBe('true');
        expect(await upper.getAttribute('aria-selected')).toBe('false');
        expect(await pathField.getAttribute('aria-activedescendant')).toBe(await lower.getAttribute('id'));
        await pathField.press('End');
        await pathField.press(key);
        expect(await pathField.inputValue(), `${key} preserves the clicked file's exact path`).toBe(filePath.replace('technical-document.md', 'diagram.svg'));
      }
      await picker.getByRole('button', {name:'Cancel', exact:true}).click();
      await picker.waitFor({state:'hidden'});
    } finally {
      await page.unroute('**/api/folder-browse?*', caseSensitiveListing);
    }
    // #480: only the active entry loads; an older response cannot replace a newer preview.
    const previewRequests = [];
    let releasePreview;
    let previewWaiting = false;
    const previewGate = new Promise(resolve => { releasePreview = resolve; });
    let delayedFinished = false;
    const imageListing = async route => {
      const response = await route.fetch();
      const listing = await response.json();
      const path = name => filePath.replace('technical-document.md', name);
      // Equivalent root spelling gives these requests fresh URLs: decoded images from the
      // preceding click tests must not bypass the controlled response order via browser reuse.
      await route.fulfill({response, json:{...listing, path:listing.path + separator, crumbs:listing.crumbs.slice(-1), entries:[
        {name:'subfolder', kind:'folder', path:path('subfolder')},
        ...['diagram.svg', 'diagram-v2.svg'].map(name => listing.entries.find(entry => entry.name === name)),
        {name:'broken.svg', kind:'image', path:path('broken.svg')},
      ]}});
    };
    const previewRoute = async route => {
      const path = decodeURIComponent(route.request().url().match(/[?&]path=([^&]*)/)[1].replace(/\+/g, ' '));
      previewRequests.push(path);
      if (path.endsWith('broken.svg')) return route.fulfill({contentType:'image/svg+xml', body:'not an image'});
      const response = await route.fetch();
      if (path.endsWith('diagram.svg')) {
        previewWaiting = true;
        await previewGate;
        await route.fulfill({response});
        delayedFinished = true;
      } else await route.fulfill({response});
    };
    // A root-bounded Host layout leaves the pre-preview actions visible in a short window.
    const imagePlaces = route => route.fulfill({json:{places:[{kind:'root', name:'Images', path:filePath.slice(0, -'technical-document.md'.length)}]}});
    await page.route('**/api/folder-browse?*', imageListing);
    await page.route('**/api/file-preview?*', previewRoute);
    await page.route('**/api/folder-places', imagePlaces);
    try {
      if (!await page.getByRole('button', {name:'Choose…', exact:true}).isVisible()) await page.getByTestId('figure-replace').click();
    await page.getByRole('button', {name:'Choose…', exact:true}).click();
      await picker.getByRole('option', {name:'subfolder', exact:true}).waitFor();
      await expect(pathField).toBeFocused();
      const typedPath = await pathField.inputValue();
      expect(previewRequests, 'Listing does not preload thumbnails').toEqual([]);
      await pathField.press('ArrowDown');
      expect(await preview.count(), 'A keyboard-active folder has no preview').toBe(0);
      expect(previewRequests).toEqual([]);
      const entries = await picker.getByRole('option').allTextContents();
      const moveTo = async name => {
        for (let i = 0; i < entries.length; i++) {
          await pathField.press('ArrowDown');
          if (await picker.getByRole('option', {name, exact:true}).getAttribute('aria-selected') === 'true') return;
        }
        throw new Error(`Could not activate ${name}`);
      };
      await moveTo('diagram.svg');
      await expect.poll(() => previewWaiting).toBe(true);
      await moveTo('diagram-v2.svg');
      const current = preview.getByRole('img', {name:'diagram-v2.svg', exact:true});
      await expect(current).toBeVisible();
      await expect.poll(() => current.evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
      releasePreview();
      await expect.poll(() => delayedFinished).toBe(true);
      // Give the retired image's event a render turn; no reload or polling can hide a stale frame.
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      expect(await preview.getByRole('img').getAttribute('alt')).toBe('diagram-v2.svg');
      expect(previewRequests.map(path => path.split(/[\\/]/).at(-1))).toEqual(['diagram.svg', 'diagram-v2.svg']);
      expect(await pathField.inputValue(), 'Keyboard preview does not choose an image').toBe(typedPath);
      expect(await page.getByTestId('figure-image-url').inputValue()).toBe('./diagram-v2.svg');
      await expect(pathField).toBeFocused();
      expect(await pathField.getAttribute('aria-activedescendant')).toBe(await picker.getByRole('option', {name:'diagram-v2.svg', exact:true}).getAttribute('id'));
      for (const [width, height] of [[1440, 1000], [1366, 768], [640, 667]]) {
        await page.setViewportSize({width, height});
        // Browser viewport emulation completes before responsive layout/scroll-lock updates.
        // Keep the no-overflow requirement, but measure the rendered resized document.
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          {message:`${width}px resized document has no horizontal overflow`}).toBe(true);
        const layout = await picker.evaluate(dialog => ({
          client:dialog.clientWidth, scroll:dialog.scrollWidth,
          children:[...dialog.children].map(element => ({tag:element.tagName, class:element.className,
            width:element.getBoundingClientRect().width, client:element.clientWidth, scroll:element.scrollWidth})),
        }));
        expect(layout.scroll, `${width}px dialog has no horizontal overflow: ${JSON.stringify(layout)}`).toBeLessThanOrEqual(layout.client);
        expect(await picker.evaluate(dialog => { const box = dialog.getBoundingClientRect(); return box.left >= 0 && box.right <= innerWidth; })).toBe(true);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
          await expect(current, `${width}×${height} retains the preview`).toBeVisible();
          const fits = await current.evaluate(image => {
            const box = image.getBoundingClientRect(), parent = image.parentElement.getBoundingClientRect();
            return box.width <= parent.width && box.height <= parent.height && Math.abs(box.width / box.height - image.naturalWidth / image.naturalHeight) < 0.01;
          });
          expect(fits, 'Preview fits without distorting the image').toBe(true);
      }
      await page.setViewportSize({width:1280, height:720});
      await moveTo('broken.svg');
      await expect(preview.getByText('The image could not be previewed. It may be unavailable, damaged, unsupported, or larger than 10 MiB.')).toBeVisible();
      expect(await preview.getByRole('img').isVisible()).toBe(false);
      expect(await preview.getByRole('alert').count(), 'Preview failure is quiet').toBe(0);
      await expect(pathField).toBeFocused();
      expect(await pathField.inputValue()).toBe(typedPath);
      await moveTo('subfolder');
      expect(await preview.count()).toBe(0);
      await picker.getByRole('button', {name:'Cancel', exact:true}).click();
      await picker.waitFor({state:'hidden'});
    } finally {
      releasePreview();
      await page.unroute('**/api/file-preview?*', previewRoute);
      await page.unroute('**/api/folder-browse?*', imageListing);
      await page.unroute('**/api/folder-places', imagePlaces);
    }
    await page.setViewportSize({width:1280, height:720});
    result.existingLabelInForm = await page.getByTestId('figure-label').inputValue() === 'fig-control' &&
      await page.getByTestId('figure-caption').count() === 0;
    if (!await page.getByTestId('figure-image-url').isVisible()) await page.getByTestId('figure-replace').click();
    await page.getByTestId('figure-image-url').fill('./diagram-v2.svg');
    await page.getByTestId('figure-alt').fill('Updated block diagram');
    await figures.first().getByTestId('figure-caption-content').evaluate(element => {
      const editor = element.closest('.document-editor').editor;
      const path = element.closest('[data-block="figure"]').getAttribute('data-source-path');
      editor.state.doc.forEach((node, pos) => {
        if (node.type.name === 'figure' && node.attrs.sourcePath === path)
          editor.commands.setTextSelection({from:pos + 1,to:pos + node.nodeSize - 1});
      });
      editor.view.focus();
      if (!editor.view.hasFocus()) throw Error("Caption input requires editor focus");
    });
    await page.keyboard.type('Updated converter control diagram.');
    expect(await figures.first().locator('figcaption').innerText(), 'Direct caption edit before property Apply').toBe('Updated converter control diagram.');
    expect((await snapshot()).content.find(n => n.type === 'figure').content.map(n => n.text ?? '').join(''), 'Direct caption is in the engine before Apply').toBe('Updated converter control diagram.');
    await page.locator('[data-document-tab][data-active=true]').getByTestId("figure-draft-status").waitFor();
    result.existingDraftMarkedUnsaved = await figures.first().getByTestId('figure-draft-status').isVisible();
    await page.getByTestId('figure-apply').click();
    await editor.waitFor({state:'detached'});
    expect(await figures.first().locator('figcaption').innerText(), 'Properties preserve the live direct caption').toBe('Updated converter control diagram.');
    const appliedBeforeDelete = await snapshot();
    await page.getByText('The current reference is calculated from the active power command.', {exact:true}).filter({visible:true}).click();
    await page.waitForFunction(() => {
      const {selection} = document.querySelector('[data-document-tab][data-active=true] .document-editor').editor.state;
      return selection.empty && selection.$from.parent.type.name === 'paragraph' &&
        selection.$from.parent.textContent === 'The current reference is calculated from the active power command.';
    });
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Backspace');
    expect(await figures.count()).toBe(0);
    await page.keyboard.press('ControlOrMeta+z');
    expect(await snapshot(), 'Undo after Apply restores applied Figure properties').toEqual(appliedBeforeDelete);
    result.existingPreviewAfterApply = String(await imageLoaded(figures.first())).startsWith('/document/diagram-v2.svg?path=');
    const captionSave = page.waitForRequest(r => r.method() === 'POST' && r.url().includes('/api/document'));
    await save();
    const captionPayload = (await captionSave).postDataJSON();
    expect(captionPayload.figures?.[0]?.to?.caption, 'Save submits the directly edited caption').toBe('Updated converter control diagram.');
    await openScratch();
    const reloadedExisting = (await semantic())[0];
    result.existingSavedAndReloaded = JSON.stringify(reloadedExisting) === JSON.stringify({
      label: 'fig-control', imageUrl: './diagram-v2.svg', imageAlt: 'Updated block diagram', caption: 'Updated converter control diagram.',
    });
    expect(reloadedExisting, 'Image properties and direct caption survive Save/Reload').toEqual({
      label:'fig-control',imageUrl:'./diagram-v2.svg',imageAlt:'Updated block diagram',caption:'Updated converter control diagram.'});
    result.existingReloadedPreview = String(await imageLoaded(figures.first())).startsWith('/document/diagram-v2.svg?path=');
    result.existingReloadedCaption = await figures.first().locator('figcaption').innerText() === 'Updated converter control diagram.';

    // A2. Core-shared property validation keeps invalid alt text unapplied and the form open.
    const appliedCaption = 'Updated converter control diagram.';
    await figures.first().getByRole('button', {name:'Edit figure'}).locator('..').hover({position:{x:4,y:4}});
    await figures.first().getByRole('button', {name:'Edit figure'}).click();
    await editor.waitFor();
    await page.getByTestId('figure-alt').fill(' invalid alt');
    await page.getByTestId('figure-apply').click();
    const coreError = editor.getByText(/alt text cannot/);
    await coreError.waitFor();
    result.invalidApplyKeepsForm = await editor.isVisible() &&
      await page.getByTestId('figure-alt').inputValue() === ' invalid alt';
    result.invalidApplyShowsCoreError = await coreError.isVisible();
    result.invalidApplyKeepsAppliedValue = await figures.first().locator('figcaption').innerText() === appliedCaption;
    result.invalidApplyAllowsAppliedSave = await saveEnabled.count() === 1;
    await figures.first().getByTestId('figure-image').dblclick({position:{x:80,y:140}, timeout:5000});
    expect(await coreError.isVisible(), 'Double-click while invalid preserves validation and draft').toBe(true);
    expect(await page.getByTestId('figure-alt').inputValue()).toBe(' invalid alt');
    await page.getByTestId('figure-alt').fill('Cost is 5 units.');
    await page.getByTestId('figure-apply').click();
    await editor.waitFor({state:'detached'});
    result.validApplyAfterError = await figures.first().locator('img').getAttribute('alt') === 'Cost is 5 units.';
    await save();
    await openScratch();
    const revalidated = (await semantic())[0];
    result.validCaptionSavedAndReloaded = revalidated.imageAlt === 'Cost is 5 units.' && revalidated.label === 'fig-control' &&
      await figures.first().locator('figcaption').innerText() === appliedCaption;

    // C1. A new Figure is a document block at once: no form opens, the caret is in its caption,
    // and Undo removes it.
    await insertAfterParagraph('Figure');
    await figures.nth(1).waitFor();
    result.newFigureOpensNoForm = await editor.count() === 0;
    const inserted = await editorFocus();
    result.newFigureCaretInCaption = inserted !== false && inserted.block === 'figure' && inserted.empty && inserted.text === '';
    result.newFigureIsUnsaved = await saveEnabled.count() === 1;
    await figures.nth(1).getByTestId('figure-no-content').dblclick({position:{x:80,y:20}, timeout:5000});
    await expect(page.getByTestId('figure-replace'), 'Pending Figure double-click uses Edit').toBeFocused();
    await page.getByTestId('figure-alt').press('Escape');
    await editor.waitFor({state:'detached'});
    await page.keyboard.press('ControlOrMeta+z');
    result.newFigureUndoRemoves = await figures.count() === 1;
    expect(result.newFigureUndoRemoves).toBe(true);
    expect(await figures.first().locator('figcaption').innerText(), 'Undoing insertion preserves the existing caption').toBe(appliedCaption);

    // B. `/figure` from a transient paragraph, a caption typed at the caret, an image set by Edit, Save, Reload.
    await insertAfterParagraph('Paragraph');
    await page.keyboard.type('/figure');
    await page.getByRole('menu', {name:'Insert block'}).getByRole('menuitem', {name:'Figure', exact:true}).click();
    result.slashReplacesTransientParagraph = await page.locator('[data-document-tab][data-active=true] [data-block="paragraph"]').count() === baselineParagraphs &&
      await figures.count() === 2 && await editor.count() === 0;
    const created = figures.nth(1);
    await page.keyboard.type('New figure caption.');
    result.newCaptionTypedAtCaret = await created.locator('figcaption').innerText() === 'New figure caption.';
    await created.getByRole('button', {name:'Edit figure'}).locator('..').hover({position:{x:4,y:4}});
    await created.getByRole('button', {name:'Edit figure'}).click();
    await editor.waitFor();
    result.newLabelEmpty = await page.getByTestId('figure-label').inputValue() === '';
    if (!await page.getByTestId('figure-image-url').isVisible()) await page.getByTestId('figure-replace').click();
    await page.getByTestId('figure-image-url').fill('./diagram.svg');
    await page.getByTestId('figure-alt').fill('New figure alt');
    await page.getByTestId('figure-apply').click();
    await editor.waitFor({state:'detached'});
    const newBeforeDelete = await snapshot();
    await page.getByText('The current reference is calculated from the active power command.', {exact:true}).filter({visible:true}).click();
    await page.waitForFunction(() => {
      const {selection} = document.querySelector('[data-document-tab][data-active=true] .document-editor').editor.state;
      return selection.empty && selection.$from.parent.type.name === 'paragraph' &&
        selection.$from.parent.textContent === 'The current reference is calculated from the active power command.';
    });
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Backspace');
    expect(await figures.count()).toBe(0);
    await page.keyboard.press('ControlOrMeta+z');
    expect(await snapshot(), 'Undo keeps the newly filled Figure image, alt text and caption').toEqual(newBeforeDelete);
    result.newPreviewAfterApply = String(await imageLoaded(created)).startsWith('/document/diagram.svg?path=');

    // C2. Apply, Edit, change, Cancel keeps the block and restores the applied value.
    await created.getByRole('button', {name:'Edit figure'}).locator('..').hover({position:{x:4,y:4}});
    await created.getByRole('button', {name:'Edit figure'}).click();
    await editor.waitFor();
    await page.getByTestId('figure-alt').fill('Discarded caption.');
    await page.getByTestId('figure-alt').press('Escape');
    result.appliedCancelKeepsBlock = await figures.count() === 2;
    result.appliedCancelRestores = await created.locator('figcaption').innerText() === 'New figure caption.' &&
      await created.locator('img').getAttribute('alt') === 'New figure alt';
    await save();
    await openScratch();
    const reloaded = await semantic();
    result.newSavedAndReloaded = JSON.stringify(reloaded[1]) === JSON.stringify({
      label: '', imageUrl: './diagram.svg', imageAlt: 'New figure alt', caption: 'New figure caption.',
    });
    result.labelUnchanged = reloaded[0].label === 'fig-control';
    result.reloadedFigureCount = await figures.count() === 2;
    result.noEmptyParagraphSaved = await page.locator('[data-document-tab][data-active=true] [data-block="paragraph"]').count() === baselineParagraphs;
    result.newReloadedPreview = String(await imageLoaded(figures.nth(1))).startsWith('/document/diagram.svg?path=');

    // Escape cancels an existing Figure draft without removing it.
    await figures.first().getByRole('button', {name:'Edit figure'}).locator('..').hover({position:{x:4,y:4}});
    await figures.first().getByRole('button', {name:'Edit figure'}).click();
    await editor.waitFor();
    await page.getByTestId('figure-alt').fill('Escaped');
    await page.getByTestId('figure-alt').press('Escape');
    await editor.waitFor({state:'detached'});
    result.escapeCancels = await figures.count() === 2 && await saveDisabled.count() === 0 &&
      await figures.first().locator('img').getAttribute('alt') === 'Cost is 5 units.';
    const firstPath = await figures.first().getAttribute('data-source-path');
    const afterEscape = await editorFocus();
    result.escapeReturnsCaret = afterEscape.empty && await page.evaluate(path => {
      const {selection, doc} = document.querySelector('[data-document-tab][data-active=true] .document-editor').editor.state;
      let end;
      doc.forEach((node, pos) => { if (node.attrs.sourcePath === path) end = pos + node.nodeSize; });
      return selection.from === end || selection.from === end + 1;
    }, firstPath);

    // Validation that finishes after the user has moved on applies without taking focus back.
    let releaseValidation;
    const validationGate = new Promise(resolve => { releaseValidation = resolve; });
    await page.route('**/api/figure-validation', async route => { await validationGate; return route.continue(); });
    await figures.first().getByRole('button', {name:'Edit figure'}).locator('..').hover({position:{x:4,y:4}});
    await figures.first().getByRole('button', {name:'Edit figure'}).click();
    await editor.waitFor();
    await page.getByTestId('figure-alt').fill('Validated later');
    await page.getByTestId('figure-apply').click();
    await page.getByText('The current reference is calculated from the active power command.', {exact:true}).filter({visible:true}).click();
    await page.keyboard.press('End');
    await page.waitForFunction(() => {
      const {$from, empty} = document.querySelector('[data-document-tab][data-active=true] .document-editor').editor.state.selection;
      return empty && $from.parent.type.name === 'paragraph' && $from.parentOffset === $from.parent.content.size;
    });
    const movedOn = await editorFocus();
    releaseValidation();
    await editor.waitFor({state:'detached'});
    await page.unroute('**/api/figure-validation');
    result.lateValidationKeepsFocus = await figures.first().locator('img').getAttribute('alt') === 'Validated later' &&
      movedOn.block === 'paragraph' && JSON.stringify(await editorFocus()) === JSON.stringify(movedOn);
    await save();
    await openScratch();

    // A Figure draft typed while a Save is in flight survives the response and is not saved until applied.
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const posted = [];
    await page.route('**/api/document**', async route => {
      if (route.request().method() !== 'POST') return route.continue();
      posted.push(route.request().postDataJSON());
      if (posted.length === 1) await gate;
      return route.continue();
    });
    await page.getByRole('button', {name:'Save', exact:true}).click();
    await figures.first().getByRole('button', {name:'Edit figure'}).locator('..').hover({position:{x:4,y:4}});
    await figures.first().getByRole('button', {name:'Edit figure'}).click();
    await editor.waitFor();
    await page.waitForFunction(() => document.activeElement?.getAttribute('data-testid') === 'figure-replace');
    await page.getByTestId('figure-alt').fill('Caption typed during save.');
    release();
    await page.getByText('Unsaved changes', {exact:true}).filter({visible:true}).waitFor();
    result.delayedSaveKeepsDraft = await page.getByTestId('figure-alt').inputValue() === 'Caption typed during save.' &&
      !posted[0].figures?.length;
    await page.getByTestId('figure-apply').click();
    await save();
    await page.unroute('**/api/document**');
    result.delayedDraftAppliedAndSaved = posted[1]?.figures?.[0]?.to?.imageAlt === 'Caption typed during save.' &&
      (await semantic())[0].imageAlt === 'Caption typed during save.' && (await semantic())[0].label === 'fig-control';

    // #58: captions live in the same editor state as prose. Native formatting,
    // rich clipboard input, edits to existing formatting, Undo/Redo and Reload keep it.
    const caption = figures.first().getByTestId('figure-caption-content');
    const selectCaption = async text => {
      await caption.click();
      await page.keyboard.press('End');
      await page.keyboard.press('Shift+Home');
      await page.waitForFunction(text => {
        const e = document.querySelector('[data-document-tab][data-active=true] .document-editor').editor;
        const s = e.state.selection;
        return s.$from.parent.type.name === 'figure' && e.state.doc.textBetween(s.from, s.to) === text;
      }, text);
    };
    await selectCaption(appliedCaption);
    await page.keyboard.type('Caption rich');
    await selectCaption('Caption rich');
    await page.keyboard.press('ControlOrMeta+b');
    result.captionBoldApplied = await caption.locator('strong').innerText() === 'Caption rich';
    await save();
    await openScratch();
    result.captionFormattingReloaded = await caption.locator('strong').innerText() === 'Caption rich';
    await caption.click();
    await page.keyboard.press('End');
    await page.keyboard.type(' revised');
    result.formattedCaptionTextEdited = await caption.locator('strong').innerText() === 'Caption rich revised';
    await save();
    await openScratch();
    result.captionTextAndFormattingReloaded = await caption.locator('strong').innerText() === 'Caption rich revised';
    await selectCaption('Caption rich revised');
    await page.keyboard.press('ControlOrMeta+b');
    result.captionBoldRemoved = await caption.locator('strong').count() === 0;
    await page.keyboard.press('ControlOrMeta+z');
    result.captionUndoKeepsFormatting = await caption.locator('strong').count() === 1;
    await page.keyboard.press('ControlOrMeta+Shift+z');
    result.captionRedoRemovesFormatting = await caption.locator('strong').count() === 0;
    await save();
    await openScratch();
    result.captionRemovalReloaded = await caption.locator('strong').count() === 0;
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    const copySource = page.locator('[data-document-tab][data-active=true] .document-editor strong', {hasText:'DC-link voltage'});
    // Match user selection: focus the editable source before assigning its native range.
    await copySource.click();
    await waitForEditorFocus(page);
    await copySource.evaluate(element => {
      const range = document.createRange(); range.selectNodeContents(element);
      getSelection().removeAllRanges(); getSelection().addRange(range);
    });
    await page.waitForFunction(() => {
      const e = document.querySelector('[data-document-tab][data-active=true] .document-editor').editor;
      return e.state.doc.textBetween(e.state.selection.from, e.state.selection.to) === 'DC-link voltage';
    });
    await page.keyboard.press('ControlOrMeta+c');
    await selectCaption('Caption rich revised');
    await page.keyboard.press('ControlOrMeta+v');
    result.captionRichPaste = await caption.locator('strong').innerText() === 'DC-link voltage';
    await save();
    await openScratch();
    result.captionRichPasteReloaded = await caption.locator('strong').innerText() === 'DC-link voltage';
    // Updating metadata never flattens a formatted caption or replaces its text caret (#275).
    await caption.click();
    await page.keyboard.press('End');
    await page.waitForFunction(() => {
      const {selection} = document.querySelector('[data-document-tab][data-active=true] .document-editor').editor.state;
      return selection.empty && selection.$from.parent.type.name === 'figure' &&
        selection.$from.parentOffset === selection.$from.parent.content.size;
    });
    const captionSelection = await page.evaluate(() => document.querySelector('[data-document-tab][data-active=true] .document-editor').editor.state.selection.toJSON());
    await figures.first().getByRole('button', {name:'Edit figure'}).locator('..').hover({position:{x:4,y:4}});
    await figures.first().getByRole('button', {name:'Edit figure'}).click();
    await editor.waitFor();
    await page.getByTestId('figure-alt').fill('Rich caption image');
    await page.getByTestId('figure-apply').click();
    await editor.waitFor({state:'detached'});
    const restoredCaption = await page.evaluate(() => {
      const {editor} = document.querySelector('[data-document-tab][data-active=true] .document-editor');
      return {selection:editor.state.selection.toJSON(), focus:editor.view.hasFocus()};
    });
    result.metadataKeepsCaptionCaret = restoredCaption.focus && JSON.stringify(restoredCaption.selection) === JSON.stringify(captionSelection);
    await page.keyboard.type(' CaptionCaret275');
    result.typingKeepsFigure = await caption.innerText() === 'DC-link voltage CaptionCaret275' && await figures.count() === 2;
    await save();
    await openScratch();
    result.metadataKeepsCaptionFormatting = (await caption.locator('strong').innerText()).startsWith('DC-link voltage') &&
      await caption.innerText() === 'DC-link voltage CaptionCaret275' &&
      (await semantic())[0].imageAlt === 'Rich caption image' && (await semantic())[0].label === 'fig-control';

    // In a new empty document, `/figure` makes the only block an empty Figure that saves.
    const emptyName = `empty-${Date.now()}.md`;
    const emptyPath = filePath.replace('technical-document.md', emptyName);
    await openFolderPicker(page);
    await page.getByTestId('folder-path').fill(filePath.slice(0, -'technical-document.md'.length));
    await page.getByTestId('folder-open').click();
    await page.getByRole('dialog').waitFor({state:'detached'});
    await page.getByRole('button', {name:'New document…', exact:true}).click();
    await page.getByTestId('new-file-name').fill(emptyName);
    await page.getByRole('dialog').getByRole('button', {name:'Create', exact:true}).click();
    await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
    await page.locator('[data-document-tab][data-active=true] [data-testid="document-editor"] [contenteditable="true"]').click();
    await page.keyboard.type('/figure');
    await page.getByRole('menu', {name:'Insert block'}).getByRole('menuitem', {name:'Figure', exact:true}).click();
    result.onlyBlockFigureOpensNoForm = await figures.count() === 1 && await editor.count() === 0;
    await save();
    const onlyBlocks = (await (await page.request.get(`${origin}/api/document?path=${encodeURIComponent(emptyPath)}`)).json()).document.blocks;
    result.onlyBlockFigureSaved = onlyBlocks.length === 1 && onlyBlocks[0].block === 'figure' && onlyBlocks[0].contentKind === 'none';

    result.consoleProblems = problems;
    const failed = Object.entries(result).filter(([key, value]) => key !== 'consoleProblems' && value !== true);
    if (failed.length || problems.length) throw new Error(`Figure authoring failed: ${JSON.stringify(result)}`);
    return result;
  } finally {
    await page.unrouteAll();
    page.off('console', onConsole);
    page.off('pageerror', onPageError);
  }
}
