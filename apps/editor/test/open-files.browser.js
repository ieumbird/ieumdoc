// Run with pnpm browser:test open-files.
// Mocks two selected Markdown files while exercising the real Editor state flow.
async (page, { openDocument, screenshots = false }) => {
  page.setDefaultTimeout(15000);
  await page.unroute('**/api/document');
  await page.unrouteAll();
  await page.reload();
  await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
  const origin = page.url().split('/').slice(0, 3).join('/');
  const loaded = await (await page.request.get(`${origin}/api/document`)).json();
  const separator = loaded.path.includes('\\') ? '\\' : '/';
  const root = loaded.path.split(separator).slice(0, -4).join(separator);
  // A prepared empty directory makes the absent diagram a real 404 on every OS.
  const folder = [root, 'tmp', 'open-files'].join(separator);
  const pathA = [folder, 'ieumdoc-a.md'].join(separator);
  const pathB = [folder, 'ieumdoc-b.md'].join(separator);
  const fileA = clone(loaded);
  const fileB = clone(loaded);
  fileA.path = pathA;
  fileA.revision = 'a-initial';
  fileB.path = pathB;
  fileB.revision = 'b-initial';
  setParagraph(fileB.document, 'Document B');
  const files = new Map([[pathA, fileA], [pathB, fileB]]);
  const requests = [];
  let conflictNext = false;
  let failNext = false;
  let pendingSave;
  let releaseSave;
  // The Desktop Host's first answer when the app was started without a document.
  let startNext = true;

  // Match selected-file GETs (?path=...) as well.
  await page.route('**/api/document**', async route => {
    const request = route.request();
    if (request.method() === 'GET') {
      if (!queryPath(request.url()) && startNext) return route.fulfill({json:{start:true, sample:pathB}});
      const requestedPath = queryPath(request.url()) || pathA;
      const response = files.get(requestedPath);
      if (!response) return route.fulfill({status:400,json:{error:'unknown test file'}});
      return route.fulfill({json:response});
    }
    const body = request.postDataJSON();
    requests.push(body);
    if (pendingSave) await pendingSave;
    if (failNext) {
      failNext = false;
      return route.fulfill({status:400,json:{error:'Cannot save this content'}});
    }
    if (conflictNext) {
      conflictNext = false;
      return route.fulfill({status:409,json:{error:'External change'}});
    }
    const response = clone(files.get(body.path));
    const paragraph = body.paragraphs?.find(edit => edit.path[0] === 9);
    if (paragraph) {
      const target = response.document.blocks.find(block => block.path[0] === 9);
      target.content = paragraph.content;
      target.text = inlineText(paragraph.content);
    }
    response.revision = `${body.path}-saved-${requests.length}`;
    files.set(body.path, response);
    return route.fulfill({json:response});
  });

  try {
    // Started without a document: choose a folder, then a tree file; the sample remains explicit.
    await page.evaluate(recent => localStorage.setItem('ieumdoc.recentFolders', JSON.stringify([recent])), folder);
    await page.reload();
    const start = page.getByTestId('document-start');
    await start.waitFor();
    // The start is the app's, not a document: no paper, and the product mark above its title (#298).
    if (await start.evaluate(n => n.closest('.document') !== null || getComputedStyle(n).backgroundColor !== 'rgba(0, 0, 0, 0)' ||
      getComputedStyle(n).boxShadow !== 'none') || !await start.locator('.document-start-mark').isVisible()) {
      throw new Error('The start looks like an open document');
    }
    if (await page.getByRole('button', {name:'Open file…', exact:true}).count() || await page.getByTestId('file-path').count()) {
      throw new Error('A direct file-path entry remains');
    }
    await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
    if (await page.getByTestId('current-file').innerText() !== 'No file opened' || await page.locator('[data-document-tab][data-active=true] .ProseMirror').count() ||
      !await page.getByTestId('save').isDisabled() || await page.getByTestId('error').count()) {
      throw new Error('The start opened a document or reported an error');
    }
    await page.getByRole('button', {name:'Display', exact:true}).click();
    if (!await page.getByRole('checkbox', {name:'Number headings', exact:true}).isDisabled() ||
      !await page.getByRole('checkbox', {name:'Wide document', exact:true}).isEnabled() ||
      !await page.getByRole('button', {name:'File actions', exact:true}).isDisabled()) {
      throw new Error('Display or File actions ignore the no-document state');
    }
    await page.getByRole('button', {name:'Files', exact:true}).click();
    if (screenshots) {
      for (const width of [1440, 768, 375]) {
        await page.setViewportSize({width, height:800});
        await page.screenshot({path:`tmp/visual-refinement/after-${width}-document-start.png`});
      }
    }
    await start.getByRole('button', {name:'Open folder…', exact:true}).click();
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({state:'detached'});
    if (!await start.getByRole('button', {name:'Open folder…', exact:true}).evaluate(node => node === document.activeElement)) {
      throw new Error('Canceling folder selection did not return focus to the start');
    }
    await page.setViewportSize({width:375, height:800});
    const overflow = await start.evaluate(paper => {
      const edge = paper.getBoundingClientRect().right;
      return [...paper.querySelectorAll('h1, h2, p, button')].filter(node => node.getBoundingClientRect().right > edge + 0.5).map(node => node.textContent);
    });
    await page.setViewportSize({width:1280, height:720});
    if (overflow.length) throw new Error(`The start leaves the paper at 375px: ${JSON.stringify(overflow)}`);
    await start.getByRole('button', {name:/^open-files/}).click();
    await page.getByRole('region', {name:'open-files', exact:true}).waitFor();
    if (!await start.isVisible()) throw new Error('Opening a recent folder opened a document');
    await page.getByTestId('folder').getByRole('treeitem', {name:'ieumdoc-a.md', exact:true}).click();
    await start.waitFor({state:'detached'});
    if (await page.getByTestId('current-file').getAttribute('title') !== pathA) throw new Error('Choosing a tree file did not leave the start');
    await page.reload();
    await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
    if (await page.getByTestId('current-file').getAttribute('title') !== pathA) throw new Error('Reload did not restore the chosen document');
    await page.getByRole('button',{name:'Close ieumdoc-a.md',exact:true}).click();
    await start.waitFor();
    await start.getByRole('button', {name:'Open sample document', exact:true}).click();
    await start.waitFor({state:'detached'});
    if (!(await page.getByTestId('current-file').getAttribute('title')).includes(pathB)) throw new Error('The sample did not open');
    await page.getByText("This is the sample document, a copy in IeumDoc's app data.", {exact:true}).filter({visible:true}).waitFor();
    await page.getByRole('button', {name:'Close ieumdoc-b.md',exact:true}).click();
    await start.waitFor();
    if (!await start.getByRole('button', {name:'Open sample document',exact:true}).isVisible()) throw new Error('Last close lost the Host sample information');
    startNext = false;

    // Exercise the existing Host default when there is no navigation preference. A remembered
    // empty list instead deliberately keeps the start screen after the last close (#383).
    await page.evaluate(() => localStorage.removeItem('ieumdoc.openTabs'));
    await page.reload();
    await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
    if (!(await page.getByTestId('current-file').getAttribute('title')).includes(pathA)) throw new Error('File A was not opened');
    await openDocument(page, pathA);
    if (screenshots) {
      await page.getByRole('button', {name:'More actions', exact:true}).click();
      await page.screenshot({path:'tmp/visual-refinement/after-folder-menu.png'});
      await page.keyboard.press('Escape');
    }

    await editParagraph(page, ' FILE_A');
    pendingSave = new Promise(resolve => { releaseSave = resolve; });
    await page.getByRole('button',{name:'Save',exact:true}).click();
    await page.locator('[data-testid="status"][data-operation="saving"]').waitFor();
    await page.getByRole('button', {name:'Display', exact:true}).click();
    if (!await page.getByRole('checkbox', {name:'Number headings', exact:true}).isDisabled() ||
      !await page.getByRole('button', {name:'File actions', exact:true}).isDisabled()) {
      throw new Error('Saving allowed a numbering change or Reload');
    }
    await page.getByRole('button', {name:'Files', exact:true}).click();
    await page.getByTestId('folder').getByRole('treeitem', {name:'ieumdoc-b.md', exact:true}).click();
    await page.getByTestId('error').getByText('Wait for the current operation to finish.', {exact:true}).waitFor();
    if (await page.getByTestId('current-file').getAttribute('title') !== pathA) throw new Error('Saving allowed a document switch');
    releaseSave();
    pendingSave = undefined;
    await page.getByText('Saved',{exact:true}).filter({visible:true}).waitFor();
    if (requests[0].path !== pathA || !JSON.stringify(requests[0].paragraphs).includes('FILE_A')) {
      throw new Error('File A save used the wrong path or omitted the edit');
    }
    await page.getByRole('button', {name:'Dismiss error',exact:true}).click();

    await editParagraph(page, ' FILE_A_PENDING');
    await openPath(page, pathB);
    await page.getByRole('tab', {name:'ieumdoc-b.md',exact:true}).waitFor();
    if (await page.getByRole('dialog').count()) throw new Error('Opening with dirty work asked to discard it');
    await page.getByRole('tab', {name:'ieumdoc-a.md, Unsaved changes',exact:true}).click();
    const confirmation = page.getByRole('dialog', {name:'Save changes?', exact:true});
    await closeA();
    await confirmation.getByRole('button',{name:'Cancel',exact:true}).and(page.locator(':focus')).waitFor({state:'attached', timeout:5000});
    if (!await confirmation.getByRole('button',{name:'Cancel',exact:true}).evaluate(el => el === document.activeElement)) throw new Error('Confirmation did not initially focus Cancel');
    await page.keyboard.press('Shift+Tab');
    await page.waitForFunction(() => document.querySelector('[role="dialog"]')?.contains(document.activeElement));
    const beforeCancel = await snapshot();
    const writesBeforeCancel = requests.length;
    await capture('no-drafts');
    for (const cancel of ['Cancel', 'Escape']) {
      if (cancel === 'Escape') await closeA();
      if (cancel === 'Cancel') await confirmation.getByRole('button', {name:'Cancel',exact:true}).click();
      else await page.keyboard.press('Escape');
      await confirmation.waitFor({state:'detached'});
      if (await snapshot() !== beforeCancel || requests.length !== writesBeforeCancel) throw new Error('Close Cancel changed work or wrote');
      if (!await page.getByRole('button', {name:'Close ieumdoc-a.md',exact:true}).evaluate(el => el === document.activeElement)) throw new Error('Cancel did not restore the close control');
    }
    await closeA();
    await page.keyboard.press('Control+s');
    if (requests.length !== writesBeforeCancel) throw new Error('Save shortcut bypassed the modal');
    pendingSave = new Promise(resolve => { releaseSave = resolve; });
    await confirmation.getByRole('button',{name:'Save',exact:true}).click();
    await page.locator('[data-testid="status"][data-operation="saving"]').waitFor();
    for (const name of ['Save', "Don't save", 'Cancel']) {
      if (!await confirmation.getByRole('button',{name,exact:true}).isDisabled()) throw new Error('Pending close actions remain enabled');
    }
    await page.keyboard.press('Escape');
    if (!await confirmation.isVisible()) throw new Error('Pending Save dismissed the close dialog');
    // The acknowledged snapshot must not discard an edit arriving while Save was in flight.
    await page.locator('[data-document-tab][data-active=true] .document-editor').evaluate(el => el.editor.commands.insertContentAt(1, 'NEWER '));
    releaseSave(); pendingSave = undefined;
    await confirmation.waitFor({state:'detached'});
    if (await page.getByTestId('current-file').getAttribute('title') !== pathA || !(await snapshot()).includes('NEWER')) throw new Error('Close discarded newer applied edits');
    await closeA();
    await confirmation.getByRole('button',{name:'Save',exact:true}).click();
    await confirmation.waitFor({state:'detached'});
    await page.getByRole('tab', {name:'ieumdoc-b.md',exact:true}).waitFor();
    if (await page.getByTestId('current-file').getAttribute('title') !== pathB || await page.getByRole('button',{name:'Close ieumdoc-a.md',exact:true}).count()) throw new Error('Successful Save did not close A and select B');
    if (!await page.getByRole('tab',{name:'ieumdoc-b.md',exact:true}).evaluate(el => el === document.activeElement)) throw new Error('Closing did not focus the neighbour tab');

    await editParagraph(page, ' FILE_B');
    await page.getByTestId('save').click();
    await page.getByText('Saved',{exact:true}).filter({visible:true}).waitFor();
    if (requests.at(-1).path !== pathB || !JSON.stringify(requests.at(-1).paragraphs).includes('FILE_B')) throw new Error('B Save used another session');
    await openPath(page, pathA);
    await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
    if (!(await snapshot()).includes('FILE_A_PENDING') || (await snapshot()).includes('FILE_B')) throw new Error('Save mixed document sessions');

    await editParagraph(page, ' STALE');
    for (const failure of ['conflict', 'failure']) {
      conflictNext = failure === 'conflict'; failNext = failure === 'failure';
      await closeA();
      await confirmation.getByRole('button',{name:'Save',exact:true}).click();
      await page.getByText(failure === 'conflict' ? 'Save conflict' : 'Save failed',{exact:true}).filter({visible:true}).waitFor();
      await confirmation.waitFor({state:'detached'});
      if (!(await snapshot()).includes('STALE') || await page.getByTestId('current-file').getAttribute('title') !== pathA) throw new Error('Failed Save closed or changed the tab');
    }
    const writesBeforeDiscard = requests.length;
    await closeA();
    await confirmation.getByRole('button',{name:"Don't save",exact:true}).click();
    await confirmation.waitFor({state:'detached'});
    if (await page.getByTestId('current-file').getAttribute('title') !== pathB || requests.length !== writesBeforeDiscard) throw new Error('Discard wrote or chose the wrong neighbour');
    await openPath(page, pathA);
    await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
    if ((await snapshot()).includes('STALE')) throw new Error('Discard wrote rejected content');

    const equation = page.locator('[data-document-tab][data-active=true] [data-block="equation"]');
    await equation.hover();
    await equation.getByRole('button', {name:'Edit',exact:true}).click();
    await page.getByTestId('equation-latex').fill('x + draftClose');
    await closeA();
    await confirmation.getByText(/Unapplied property drafts will be lost with both Save and Don't save/).waitFor();
    await capture('drafts');
    await page.keyboard.press('Escape');
    await confirmation.waitFor({state:'detached'});
    if (await page.getByTestId('equation-latex').inputValue() !== 'x + draftClose') throw new Error('Close Cancel lost the draft');
    failNext = true;
    const beforeFailure = await snapshot();
    await closeA();
    await confirmation.getByRole('button',{name:'Save',exact:true}).click();
    await page.getByText('Save failed',{exact:true}).filter({visible:true}).waitFor();
    await confirmation.waitFor({state:'detached'});
    if (await snapshot() !== beforeFailure || await page.getByTestId('equation-latex').inputValue() !== 'x + draftClose') throw new Error('Failed Save lost a draft');
    await closeA();
    await confirmation.getByRole('button',{name:'Save',exact:true}).click();
    await confirmation.waitFor({state:'detached'});
    if (await page.getByTestId('current-file').getAttribute('title') !== pathB || JSON.stringify(requests.at(-1)).includes('draftClose')) throw new Error('Close Save applied a draft');

    // Closing a hidden dirty tab keeps B active, including Cancel and draft discard.
    await openPath(page, pathA);
    await equation.hover(); await equation.getByRole('button',{name:'Edit',exact:true}).click();
    await page.getByTestId('equation-latex').fill('hiddenDraft');
    await page.getByRole('tab',{name:'ieumdoc-b.md',exact:true}).click();
    await closeA();
    await confirmation.getByRole('button',{name:'Cancel',exact:true}).click();
    await confirmation.waitFor({state:'detached'});
    if (await page.getByTestId('current-file').getAttribute('title') !== pathB) throw new Error('Inactive close Cancel changed the active tab');
    failNext = true;
    await closeA();
    await confirmation.getByRole('button',{name:'Save',exact:true}).click();
    await confirmation.waitFor({state:'detached'});
    await page.getByTestId('error').filter({hasText:'Could not save “ieumdoc-a.md”'}).waitFor();
    if (await page.getByTestId('current-file').getAttribute('title') !== pathB || await page.getByRole('tab',{name:'ieumdoc-a.md, Unsaved changes',exact:true}).count() !== 1) throw new Error('Inactive Save failure changed B or removed A');
    const draftWrites = requests.length;
    await closeA();
    await confirmation.getByRole('button',{name:"Don't save",exact:true}).click();
    await confirmation.waitFor({state:'detached'});
    if (await page.getByTestId('current-file').getAttribute('title') !== pathB || requests.length !== draftWrites) throw new Error('Inactive discard changed B or wrote a draft');
    await page.evaluate(() => localStorage.removeItem('ieumdoc.recentFolders'));
    return {start:true, independentSaves:true, savingSwitchGuarded:true, closeCancel:true, closeSave:true, closeDiscard:true, failureRetained:true, conflictRetained:true, newerEditsRetained:true, inactiveClose:true};
  } finally {
    // The page fixture closes the page and its routes. Do not evaluate in a timed-out page:
    // that cleanup error would hide the action that originally failed.
    releaseSave?.();
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  async function closeA() {
    await page.getByRole('button',{name:'Close ieumdoc-a.md',exact:true}).click();
    await page.getByRole('dialog',{name:'Save changes?',exact:true}).waitFor();
  }

  async function snapshot() {
    return page.locator('[data-document-tab][data-active=true] .document-editor').evaluate(el => JSON.stringify({doc:el.editor.getJSON(), selection:el.editor.state.selection.toJSON(), undo:el.editor.can().undo()}));
  }

  async function capture(state) {
    if (!screenshots) return;
    for (const width of [1440, 375]) {
      await page.setViewportSize({width,height:800});
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({path:`tmp/291-dialog-${width}-${state}.png`});
    }
    await page.setViewportSize({width:1280,height:720});
  }

  function setParagraph(document, text) {
    const paragraph = document.blocks.find(block => block.path[0] === 9);
    paragraph.content = [{kind:'text',text}];
    paragraph.text = text;
  }

  function inlineText(content) {
    return content.map(item => item.kind === 'text' ? item.text : item.kind === 'break' ? '\n' : inlineText(item.children)).join('');
  }

  function queryPath(url) {
    const query = url.split('?')[1] || '';
    const value = query.split('&').find(part => part.startsWith('path='));
    return value ? decodeURIComponent(value.slice('path='.length)) : '';
  }

  async function openPath(page, path) {
    await openDocument(page, path);
    // A click completes before the Host response activates A. Otherwise a locator action
    // can retain B's mounted element and wait forever once that tab becomes hidden.
    await page.waitForFunction(path => document.querySelector('[data-testid="current-file"]')?.getAttribute('title') === path, path);
    await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
  }

  async function editParagraph(page, suffix) {
    await page.locator('[data-document-tab][data-active=true]').getByText(/The current reference is calculated from the active power command\.|Document B/).click();
    await page.keyboard.press('End');
    await page.keyboard.type(suffix);
  }
}
