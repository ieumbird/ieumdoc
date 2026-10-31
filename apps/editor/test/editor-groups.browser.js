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
  await page.getByTestId('equation-edit-source').click();
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
  // Review #718: a real selection at the first paragraph's right edge must expose
  // the entire toolbar inside its owning group, including its trailing actions.
  await surface(bid).locator('.document-editor').evaluate(n => {
    let range;
    n.editor.state.doc.descendants((node,pos) => {
      if (range || !node.isText || !node.text.includes('DC-link voltage')) return;
      const from = pos + node.text.indexOf('link'); range = {from,to:from+4};
    });
    if (!range) throw new Error('Toolbar reproduction text is missing');
    n.editor.view.focus(); n.editor.commands.setTextSelection(range);
  });
  const toolbar = surface(bid).getByTestId('selection-toolbar');
  const overlayBounds = async (overlay,label,allControls=false) => {
    await overlay.waitFor();
    const result = await overlay.evaluate(n => {
      const viewport=n.closest('.document-scroll'), group=viewport.getBoundingClientRect(), rect=n.getBoundingClientRect();
      const left=group.left+viewport.clientLeft, top=group.top+viewport.clientTop;
      return {group:{left,top,right:Math.min(group.right,left+viewport.clientWidth),bottom:Math.min(group.bottom,top+viewport.clientHeight)},
        overlay:{left:rect.left,top:rect.top,right:rect.right,bottom:rect.bottom,width:rect.width},
        // Hit-test interactive controls, excluding the combobox's hidden bookkeeping input.
        controls:[...n.querySelectorAll('button,input,select')].filter(control=>control.tabIndex>=0 && !control.disabled && control.getClientRects().length).map(control=>{
          const r=control.getBoundingClientRect();
          return {name:control.getAttribute('aria-label')??control.textContent,reachable:control.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};
        })};
    });
    check(result.overlay.left>=result.group.left && result.overlay.right<=result.group.right && result.overlay.top>=result.group.top && result.overlay.bottom<=result.group.bottom &&
      (!allControls || result.controls.every(control=>control.reachable)), `${label} is clipped: ${JSON.stringify(result)}`);
    return result;
  };
  await toolbar.waitFor();
  if (screenshots) await page.screenshot({path:'tmp/visual-refinement/groups-toolbar-1440.png'});
  const toolbarGeometry = await overlayBounds(toolbar,'Group toolbar',true);
  // Tab reaches every formatting action; Enter on the trailing action opens a usable form.
  const toolbarButtons=toolbar.getByRole('button');
  await page.keyboard.press('Tab');
  for (let index=0;index<await toolbarButtons.count();index++) {
    await expect(toolbarButtons.nth(index)).toBeFocused();
    if (index+1<await toolbarButtons.count()) await page.keyboard.press('Tab');
  }
  await page.keyboard.press('Enter');
  await overlayBounds(surface(bid).getByTestId('reference-form'),'Keyboard reference form',true);
  await page.keyboard.press('Escape');
  await toolbar.getByRole('button',{name:'Cross-reference',exact:true}).click();
  await overlayBounds(surface(bid).getByTestId('reference-form'),'Pointer reference form',true);
  await page.keyboard.press('Escape');
  await toolbar.getByRole('button',{name:'Link',exact:true}).click();
  await overlayBounds(surface(bid).getByTestId('link-form'),'Link form',true);
  await page.keyboard.press('Escape');
  await surface(bid).locator('.document-editor').evaluate(n=>{
    n.editor.commands.setTextSelection(n.editor.state.selection.to); n.editor.view.focus();
  });
  await command('Insert citation…');
  await overlayBounds(surface(bid).getByTestId('citation-form'),'Citation form',true);
  await page.keyboard.press('Escape');
  // #782: the other group's forms use its own content viewport as well.
  await surface(aid).locator('.document-editor').evaluate(n => {
    let range;
    n.editor.state.doc.descendants((node,pos) => {
      if (range || !node.isText || !node.text.includes('DC-link voltage')) return;
      const from=pos+node.text.indexOf('link'); range={from,to:from+4};
    });
    if (!range) throw Error('Right group reference text missing');
    n.editor.view.focus(); n.editor.commands.setTextSelection(range);
  });
  const rightToolbar=surface(aid).getByTestId('selection-toolbar');
  // This group is still scrolled to its equation draft: selecting text headlessly
  // does not reveal it. Offscreen tools must stay hidden until the anchor is shown.
  await expect(rightToolbar).toBeHidden();
  await surface(aid).locator('.document-editor').evaluate(n => n.editor.commands.scrollIntoView());
  await rightToolbar.getByRole('button',{name:'Cross-reference',exact:true}).click();
  await overlayBounds(surface(aid).getByTestId('reference-form'),'Right group reference form',true);
  await page.keyboard.press('Escape');
  await rightToolbar.getByRole('button',{name:'Link',exact:true}).click();
  await overlayBounds(surface(aid).getByTestId('link-form'),'Right group link form',true);
  await page.keyboard.press('Escape');
  // Restore the left caret for the existing slash/menu checks below.
  await surface(bid).locator('.document-editor').evaluate(n=>n.editor.view.focus());
  // A slash query at the same paragraph edge includes existing long reference labels.
  await page.keyboard.type(' /');
  const slashMenu=surface(bid).getByRole('menu',{name:'Insert block',exact:true});
  await overlayBounds(slashMenu,'Slash menu');
  await page.keyboard.press('ArrowDown');
  const activeSlash=slashMenu.locator('.active');
  check(await activeSlash.evaluate(n=>{
    const r=n.getBoundingClientRect(); return n.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));
  }), 'The active slash command is clipped');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Backspace'); await page.keyboard.press('Backspace');
  await surface(bid).locator('.paragraph').first().hover();
  await surface(bid).getByRole('button',{name:/^Move paragraph block /}).first().click();
  const blockMenu=surface(bid).getByRole('menu',{name:'Block actions',exact:true});
  await overlayBounds(blockMenu,'Block menu');
  await page.keyboard.press('ArrowUp');
  check(await blockMenu.evaluate(n=>{
    const focused=document.activeElement, r=focused.getBoundingClientRect();
    return n.contains(focused) && focused.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));
  }), 'The focused block command is clipped');
  await page.keyboard.press('Escape');
  check((await state(bid,'groupEditorB')).json===beforeB.json,'Overlay checks changed document content');
  await surface(bid).locator('.document-editor').evaluate((n,selection)=>n.editor.commands.setTextSelection(selection),beforeB.selection);
  await page.locator(`#tab-${aid}`).focus();
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
  await command('View: Source');
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
  return {geometry, toolbarGeometry, retainedEditors:true, independentSaveSourceOutline:true, narrowMerge:true};
}
