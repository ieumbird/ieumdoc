// Two independent visible documents; moving changes navigation, never editor identity.
async (page, { openPath, activeDocument, expect, screenshots = false }) => {
  const check = (value, message) => { if (!value) throw new Error(message); };
  const origin = page.url().split('/').slice(0,3).join('/');
  const loaded = await (await page.request.get(`${origin}/api/document`)).json();
  const sep = loaded.path.includes('\\') ? '\\' : '/';
  const root = loaded.path.split(sep).slice(0, -4).join(sep);
  const file = name => [root, 'tmp', 'document-tabs', name].join(sep);
  const a = file('technical-1.md'), b = file('technical-2.md');
  const read = async path => (await page.request.get(`${origin}/api/document?path=${encodeURIComponent(path)}`)).json();
  const groups = () => page.locator('[data-editor-group]');
  const surface = id => page.locator(`[data-document-tab="${id}"]`);
  const rowOf = async id => page.locator('[data-editor-group]').filter({ has: page.locator(`#tab-${id}`) });
  const context = async (id, label) => {
    await page.locator(`#tab-${id}`).click({button:'right'});
    await page.getByRole('menuitem',{name:label,exact:true}).click();
    await page.getByRole('menu').waitFor({state:'detached'});
  };
  const command = async name => {
    await page.keyboard.press('Control+Slash');
    const dialog = page.getByRole('dialog',{name:'Command center',exact:true});
    await dialog.getByRole('combobox').fill(`> ${name}`);
    await dialog.getByRole('option',{name,exact:true}).click();
    await dialog.waitFor({state:'detached'});
  };
  await page.setViewportSize({width:1440,height:900});
  await page.getByRole('button',{name:'Close technical-document.md',exact:true}).click();
  await openPath(page,a);
  const aid = await activeDocument(page).getAttribute('data-document-tab');
  await surface(aid).locator('.document-editor').evaluate(n => {
    window.groupEditorA = n.editor;
    n.editor.commands.insertContentAt(1,'Group A ');
  });
  const equation = surface(aid).locator('[data-block="equation"]');
  await equation.hover(); await equation.getByRole('button',{name:'Edit',exact:true}).click();
  await surface(aid).getByTestId('equation-latex').fill('Group A property draft');
  await openPath(page,b);
  const bid = await activeDocument(page).getAttribute('data-document-tab');
  await surface(bid).locator('.document-editor').evaluate(n => {
    window.groupEditorB = n.editor;
    n.editor.commands.insertContentAt(1,'Group B ');
  });
  const state = async (id, key) => surface(id).locator('.document-editor').evaluate((n,key) => ({
    same:n.editor === window[key], json:JSON.stringify(n.editor.getJSON()), selection:n.editor.state.selection.toJSON(),
  }),key);
  const beforeA = await state(aid,'groupEditorA'), beforeB = await state(bid,'groupEditorB');
  let loads = 0;
  const count = request => {
    if (request.method() === 'GET' && [a,b].includes(decodeURIComponent(request.url().split('?path=')[1] ?? '').split('&')[0])) loads++;
  };
  page.on('request',count);
  await context(aid,'Open to the right');
  await expect(groups()).toHaveCount(2);
  check(await surface(aid).isVisible() && await surface(bid).isVisible(), 'Both group documents must be visible');
  check(JSON.stringify(await state(aid,'groupEditorA')) === JSON.stringify(beforeA) &&
    JSON.stringify(await state(bid,'groupEditorB')) === JSON.stringify(beforeB), 'Splitting recreated an editor or changed selection/content');
  check(await surface(aid).getByTestId('equation-latex').inputValue() === 'Group A property draft', 'Splitting lost the property draft');
  const geometry = await page.evaluate(() => [...document.querySelectorAll('.document-scroll[data-visible="true"]')].map(n => {
    const r = n.getBoundingClientRect(); return {x:r.x,right:r.right,width:r.width,top:r.top,bottom:r.bottom};
  }));
  const sorted = [...geometry].sort((a,b)=>a.x-b.x);
  check(sorted.every(r=>r.width>=440 && r.bottom===900) && Math.abs(sorted[1].x-sorted[0].right-1)<1,
    `Group viewports are not bounded independent columns: ${JSON.stringify(geometry)}`);
  const left = await rowOf(bid), right = await rowOf(aid);
  // A user can focus the other visible editor while an Explorer Open is waiting for the Host.
  const waitingPath = file('technical-3.md');
  let release, arrived;
  const gate = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { arrived = resolve; });
  const hold = async route => {
    if (decodeURIComponent(route.request().url().split('?path=')[1] ?? '').split('&')[0] !== waitingPath) return route.continue();
    arrived(); await gate; await route.continue();
  };
  await page.route('**/api/document?path=*',hold);
  await page.getByTestId('sidebar').locator(`[role="treeitem"][data-path=${JSON.stringify(waitingPath)}]`).click();
  await started;
  try {
    await surface(bid).locator('.document-editor').focus();
    check(await surface(bid).getAttribute('data-active') === 'true', 'Focus stayed in the opening group after the user focused the other visible editor');
  } finally { release(); }
  await expect(page).toHaveTitle('technical-3.md — IeumDoc');
  await page.unroute('**/api/document?path=*',hold);
  await page.getByRole('button',{name:'Close technical-3.md',exact:true}).click();
  await expect(surface(aid)).toBeVisible();
  // Click the nonfocused group's Save. It must use its own active session, not the old focus.
  await left.getByTestId('save').click();
  await expect(left.getByTestId('status')).toHaveAttribute('data-operation','saved');
  check((await read(b)).source.includes('Group B ') && !(await read(a)).source.includes('Group A '), 'Group Save wrote the wrong file');
  await surface(bid).locator('.document-editor').focus();
  await surface(bid).locator('.document-editor').evaluate(n => n.editor.commands.insertContentAt(1,'Shortcut B '));
  await page.keyboard.press('Control+s');
  await expect(left.getByTestId('status')).toHaveAttribute('data-operation','saved');
  check((await read(b)).source.includes('Shortcut B ') && !(await read(a)).source.includes('Group A '), 'Save shortcut ignored the focused group');
  await right.getByTestId('view-source').click();
  await expect(surface(aid).getByTestId('source-view')).toBeVisible();
  check(await surface(bid).locator('.document-editor').isVisible(), 'Source changed the other group');
  await right.getByTestId('view-visual').click();
  await surface(aid).getByTestId('equation-cancel').click();
  // Command Center and Outline use focus, including a move from the other visible editor.
  await surface(bid).locator('.document-editor').focus();
  await expect(page.getByTestId('outline').getByRole('button').first()).toContainText('Group B');
  await command('Source');
  await expect(surface(bid).getByTestId('source-view')).toBeVisible();
  check(await surface(aid).locator('.document-editor').isVisible(), 'Command Center used another group');
  await left.getByTestId('view-visual').click();
  await surface(aid).locator('.document-editor').focus();
  await expect(page.getByTestId('outline').getByRole('button').first()).toContainText('Group A');
  await surface(bid).evaluate(n=>n.scrollTop=180);
  await surface(aid).evaluate(n=>n.scrollTop=420);
  check(await surface(bid).evaluate(n=>n.scrollTop) === 180 && await surface(aid).evaluate(n=>n.scrollTop) === 420, 'Group scrolling was coupled');
  // Reopening A through the existing Explorer entry moves its original tab into B's group.
  await page.locator(`#tab-${bid}`).click();
  await page.getByTestId('sidebar').locator(`[role="treeitem"][data-path=${JSON.stringify(a)}]`).click();
  await expect(groups()).toHaveCount(1);
  check(await page.locator(`#tab-${aid}`).count() === 1 && (await state(aid,'groupEditorA')).same, 'Ordinary Open duplicated an editor instead of moving it');
  check(loads === 0, 'Moving an open document reread it');
  page.off('request',count);
  await context(aid,'Open to the right');
  await expect(groups()).toHaveCount(2);
  if (screenshots) {
    await page.evaluate(()=>document.fonts.ready);
    await page.mouse.move(1439,899);
    await page.screenshot({path:'tmp/visual-refinement/groups-1440.png'});
  }
  // Resize below the minimum: keep both sessions and the focused A, then stay merged on widening.
  await page.setViewportSize({width:640,height:900});
  await expect(groups()).toHaveCount(1);
  check(await activeDocument(page).getAttribute('data-document-tab') === aid &&
    (await state(aid,'groupEditorA')).same && (await state(bid,'groupEditorB')).same, 'Narrow merge lost focus or editor identity');
  check((await surface(aid).locator('.document-editor').innerText()).includes('Group A '), 'Narrow merge lost unsaved content');
  await page.locator(`#tab-${aid}`).click({button:'right'});
  await expect(page.getByRole('menuitem',{name:'Open to the right',exact:true})).toHaveAttribute('aria-disabled','true');
  await page.keyboard.press('Escape');
  if (screenshots) await page.screenshot({path:'tmp/visual-refinement/groups-640.png'});
  await page.setViewportSize({width:1440,height:900});
  await expect(groups()).toHaveCount(1);
  await command('Open to the right');
  await expect(groups()).toHaveCount(2);
  await command('Undo');
  check(!(await surface(aid).locator('.document-editor').innerText()).includes('Group A ') &&
    (await surface(bid).locator('.document-editor').innerText()).includes('Shortcut B Group B '), 'Moving lost per-document Undo history');
  await command('Redo');
  check((await surface(aid).locator('.document-editor').innerText()).includes('Group A '), 'Moving lost per-document Redo history');
  await context(aid,'Move to other group');
  await expect(groups()).toHaveCount(1);
  await command('Open to the right');
  await expect(groups()).toHaveCount(2);
  // Each group closes through the ordinary dirty confirmation; cancellation retains both.
  await page.getByRole('button',{name:'Close technical-1.md',exact:true}).click();
  const unsaved = page.getByRole('dialog',{name:'Save changes?',exact:true});
  await unsaved.getByRole('button',{name:'Cancel',exact:true}).click();
  check(await groups().count() === 2 && (await state(aid,'groupEditorA')).same, 'Cancel closed a dirty group');
  await page.getByRole('button',{name:'Close technical-1.md',exact:true}).click();
  await unsaved.getByRole('button',{name:"Don't save",exact:true}).click();
  await expect(groups()).toHaveCount(1);
  check(await activeDocument(page).getAttribute('data-document-tab') === bid && (await state(bid,'groupEditorB')).same, 'Empty-group close lost the surviving session');
  // The existing Explorer document menu also opens a previously unopened file to the right.
  const c = file('technical-3.md');
  await page.getByTestId('sidebar').locator(`[role="treeitem"][data-path=${JSON.stringify(c)}]`).click({button:'right'});
  await page.getByRole('menuitem',{name:'Open to the right',exact:true}).click();
  await expect(groups()).toHaveCount(2);
  await expect(page).toHaveTitle('technical-3.md — IeumDoc');
  // Selecting an opened Command Center document focuses its owner instead of moving it.
  await page.keyboard.press('Control+Slash');
  const center = page.getByRole('dialog',{name:'Command center',exact:true});
  await center.getByRole('combobox').fill('technical-2.md');
  await center.getByRole('option',{name:'technical-2.md',exact:true}).click();
  await center.waitFor({state:'detached'});
  check(await groups().count() === 2 && await activeDocument(page).getAttribute('data-document-tab') === bid,
    'Command Center moved an opened tab instead of focusing its group');
  // Existing navigation-only persistence is unchanged; split reload restores both in one group.
  await page.reload();
  await expect(page.getByTestId('status')).toHaveAttribute('data-operation','ready');
  check(await groups().count() === 1 && await page.getByRole('tablist',{name:'Documents',exact:true}).getByRole('tab').count() === 2,
    'Reload changed tab memory or restored an empty group');
  check((await activeDocument(page).locator('.document-editor').innerText()).includes('Shortcut B Group B '), 'Reload did not reopen the explicitly saved file');
  return {geometry, retainedEditors:true, independentSaveSourceOutline:true, narrowMerge:true};
}
