// Run with pnpm browser:test open-files.
// Mocks two selected Markdown files while exercising the real Editor state flow.
async (page, { openDocument, screenshots = false }) => {
  await page.unroute('**/api/document');
  await page.unrouteAll();
  await page.reload();
  await page.locator('[data-testid="status"][data-operation="Ready"]').waitFor({state:'attached'});
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
  let pendingOpen;
  let releaseOpen;
  // The Desktop Host's first answer when the app was started without a document.
  let startNext = true;

  // Match selected-file GETs (?path=...) as well.
  await page.route('**/api/document**', async route => {
    const request = route.request();
    if (request.method() === 'GET') {
      if (!queryPath(request.url()) && startNext) return route.fulfill({json:{start:true, sample:pathB}});
      const requestedPath = queryPath(request.url()) || pathA;
      if (requestedPath === pathB && pendingOpen) await pendingOpen;
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
    if (await page.getByRole('button', {name:'Open file…', exact:true}).count() || await page.getByTestId('file-path').count()) {
      throw new Error('A direct file-path entry remains');
    }
    await page.locator('[data-testid="status"][data-operation="Ready"]').waitFor({state:'attached'});
    if (await page.getByTestId('current-file').innerText() !== 'No file opened' || await page.locator('.ProseMirror').count() ||
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
    await start.waitFor();
    await start.getByRole('button', {name:'Open sample document', exact:true}).click();
    await start.waitFor({state:'detached'});
    if (!(await page.getByTestId('current-file').getAttribute('title')).includes(pathB)) throw new Error('The sample did not open');
    await page.getByText("This is the sample document, a copy in IeumDoc's app data.", {exact:true}).waitFor();
    startNext = false;

    await page.reload();
    await page.locator('[data-testid="status"][data-operation="Ready"]').waitFor({state:'attached'});
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
    await page.locator('[data-testid="status"][data-operation="Saving…"]').waitFor();
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
    await page.getByText('Saved',{exact:true}).waitFor();
    if (requests[0].path !== pathA || !JSON.stringify(requests[0].paragraphs).includes('FILE_A')) {
      throw new Error('File A save used the wrong path or omitted the edit');
    }
    await page.getByRole('button', {name:'Dismiss error',exact:true}).click();

    await editParagraph(page, ' FILE_A_PENDING');
    await openPath(page, pathB);
    const confirmation = page.getByRole('dialog', {name:'Save changes?', exact:true});
    await confirmation.waitFor();
    if (!await confirmation.getByRole('button',{name:'Cancel',exact:true}).evaluate(el => el === document.activeElement)) throw new Error('Confirmation did not initially focus Cancel');
    await page.keyboard.press('Shift+Tab');
    await page.waitForFunction(() => document.querySelector('[role="dialog"]')?.contains(document.activeElement), undefined, {timeout:5000});
    if (!(await page.getByTestId('current-file').getAttribute('title')).includes(pathA)) throw new Error('Unsaved File A was discarded');
    if (!(await page.locator('.document-editor').innerText()).includes('FILE_A_PENDING')) throw new Error('Pending File A edit was lost');
    await capture('no-drafts');
    const beforeCancel = await snapshot();
    const writesBeforeCancel = requests.length;
    for (const cancel of ['Cancel', 'Escape']) {
      if (cancel === 'Escape') await chooseB();
      if (cancel === 'Cancel') await confirmation.getByRole('button', {name:'Cancel',exact:true}).click();
      else await page.keyboard.press('Escape');
      await confirmation.waitFor({state:'detached'});
      if (await snapshot() !== beforeCancel || requests.length !== writesBeforeCancel || await page.getByTestId('error').count()) throw new Error('Cancel changed local work, wrote or left a refusal error');
      if (!await page.getByRole('treeitem', {name:'ieumdoc-b.md',exact:true}).evaluate(el => el === document.activeElement)) throw new Error('Cancel did not restore the invoking file');
    }
    await chooseB();
    await page.keyboard.press('Control+s');
    if (requests.length !== writesBeforeCancel) throw new Error('Save shortcut bypassed the modal');
    pendingSave = new Promise(resolve => { releaseSave = resolve; });
    pendingOpen = new Promise(resolve => { releaseOpen = resolve; });
    await confirmation.getByRole('button',{name:'Save',exact:true}).click();
    await page.locator('[data-testid="status"][data-operation="Saving…"]').waitFor();
    for (const name of ['Save', "Don't save", 'Cancel']) {
      if (!await confirmation.getByRole('button',{name,exact:true}).isDisabled()) throw new Error('Pending confirmation actions remain enabled');
    }
    await page.keyboard.press('Escape');
    if (!await confirmation.isVisible() || await page.getByTestId('current-file').getAttribute('title') !== pathA) throw new Error('Pending Save dismissed or switched early');
    releaseSave(); pendingSave = undefined;
    await page.locator('[data-testid="status"][data-operation="Opening…"]').waitFor();
    await page.keyboard.press('Escape');
    if (!await confirmation.isVisible() || !await confirmation.getByRole('button',{name:'Cancel',exact:true}).isDisabled() || await page.getByTestId('current-file').getAttribute('title') !== pathA) throw new Error('Pending Open lost its modal boundary');
    releaseOpen(); pendingOpen = undefined;
    await confirmation.waitFor({state:'detached'});
    await page.locator('[data-testid="status"][data-operation="Ready"]').waitFor({state:'attached'});
    if (!(await page.getByTestId('current-file').getAttribute('title')).includes(pathB)) throw new Error('File B was not opened');
    if (!await page.locator('.document-editor').evaluate(el => el === document.activeElement)) throw new Error('Successful switch did not focus the document');
    if ((await page.getByRole('article').innerText()).includes('FILE_A_PENDING')) throw new Error('File A state leaked into File B');

    await editParagraph(page, ' FILE_B');
    await page.getByRole('button',{name:'Save',exact:true}).click();
    await page.getByText('Saved',{exact:true}).waitFor();
    if (requests[2].path !== pathB || !JSON.stringify(requests[2].paragraphs).includes('FILE_B')) {
      throw new Error('File B save used the wrong path or omitted the edit');
    }

    await openPath(page, pathA);
    await page.locator('[data-testid="status"][data-operation="Ready"]').waitFor({state:'attached'});
    const reloadedA = await page.getByRole('article').innerText();
    if (!reloadedA.includes('FILE_A_PENDING') || reloadedA.includes('FILE_B')) {
      throw new Error(`File A/B state was mixed: ${JSON.stringify({text:reloadedA.match(/.*(?:FILE_|reference).*/g), saves:requests.map(({path, paragraphs}) => ({path, paragraphs}))})}`);
    }

    await editParagraph(page, ' STALE');
    conflictNext = true;
    await chooseB();
    await confirmation.getByRole('button',{name:'Save',exact:true}).click();
    await page.getByText('Save conflict',{exact:true}).waitFor();
    await confirmation.waitFor({state:'detached'});
    if (!(await page.getByRole('article').innerText()).includes('STALE')) throw new Error('Stale edit was discarded');
    if (await page.getByTestId('current-file').getAttribute('title') !== pathA) throw new Error('Conflict opened another document');
    failNext = true;
    await chooseB();
    await confirmation.getByRole('button',{name:'Save',exact:true}).click();
    await page.getByText('Save failed',{exact:true}).waitFor();
    await confirmation.waitFor({state:'detached'});
    if (!(await page.getByRole('article').innerText()).includes('STALE') || await page.getByTestId('current-file').getAttribute('title') !== pathA) throw new Error('Save failure discarded the session');
    await page.getByTestId('error').getByText(/Cannot save this content/).waitFor();
    const writesBeforeDiscard = requests.length;
    await chooseB();
    await confirmation.getByRole('button',{name:"Don't save",exact:true}).click();
    await confirmation.waitFor({state:'detached'});
    if (await page.getByTestId('current-file').getAttribute('title') !== pathB || requests.length !== writesBeforeDiscard) throw new Error('Discard did not switch without writing');
    await openPath(page, pathA);
    await page.locator('[data-testid="status"][data-operation="Ready"]').waitFor({state:'attached'});
    if ((await page.getByRole('article').innerText()).includes('STALE')) throw new Error('Discard wrote the rejected edit');

    // Start clean so this refusal proves the property draft alone guards the tree switch.
    await page.reload();
    await page.locator('[data-testid="status"][data-operation="Ready"]').waitFor({state:'attached'});
    const equation = page.locator('[data-block="equation"]').first();
    await equation.hover();
    await equation.getByRole('button', {name:'Edit', exact:true}).click();
    await page.getByTestId('equation-latex').fill('x + draftSwitch');
    await openPath(page, pathB);
    await confirmation.getByText(/Unapplied property drafts will be lost with both Save and Don't save/).waitFor();
    await capture('drafts');
    await page.keyboard.press('Escape');
    await confirmation.waitFor({state:'detached'});
    if (await page.getByTestId('current-file').getAttribute('title') !== pathA ||
      await page.getByTestId('equation-latex').inputValue() !== 'x + draftSwitch') throw new Error('A refused tree switch lost the property draft');
    if (await page.getByTestId('error').count()) throw new Error('Draft switch Cancel left a red refusal bar');
    failNext = true;
    const draftBeforeFailure = await snapshot();
    await chooseB();
    await confirmation.getByRole('button',{name:'Save',exact:true}).click();
    await page.getByText('Save failed',{exact:true}).waitFor();
    await confirmation.waitFor({state:'detached'});
    if (await snapshot() !== draftBeforeFailure || await page.getByTestId('equation-latex').inputValue() !== 'x + draftSwitch' || await page.getByTestId('current-file').getAttribute('title') !== pathA) throw new Error('Failed Save lost a property draft');
    await chooseB();
    await confirmation.getByRole('button',{name:'Save',exact:true}).click();
    await confirmation.waitFor({state:'detached'});
    if (await page.getByTestId('current-file').getAttribute('title') !== pathB || JSON.stringify(requests.at(-1)).includes('draftSwitch')) throw new Error('Save applied a draft or failed to switch');
    await openPath(page, pathA);
    await page.locator('[data-testid="status"][data-operation="Ready"]').waitFor({state:'attached'});
    await equation.hover();
    await equation.getByRole('button',{name:'Edit',exact:true}).click();
    await page.getByTestId('equation-latex').fill('draftDiscard');
    const draftWrites = requests.length;
    await chooseB();
    await confirmation.getByRole('button',{name:"Don't save",exact:true}).click();
    await confirmation.waitFor({state:'detached'});
    if (requests.length !== draftWrites || await page.getByTestId('equation-latex').count() || await page.getByTestId('current-file').getAttribute('title') !== pathB) throw new Error('Draft discard wrote or retained the old session');

    // A modal cannot prevent asynchronous editor transactions. Save acknowledges its snapshot
    // only: newer applied edits must stop both Open and New, even alongside a discardable draft.
    await openPath(page, pathA);
    await page.locator('[data-testid="status"][data-operation="Ready"]').waitFor({state:'attached'});
    await equation.hover();
    await equation.getByRole('button',{name:'Edit',exact:true}).click();
    await page.getByTestId('equation-latex').fill('keepThisDraft');
    for (const action of ['open', 'new']) {
      const trigger = action === 'open' ? page.getByRole('treeitem',{name:'ieumdoc-b.md',exact:true})
        : page.getByRole('button',{name:'New file in folder',exact:true});
      await trigger.click();
      pendingSave = new Promise(resolve => { releaseSave = resolve; });
      await confirmation.getByRole('button',{name:'Save',exact:true}).click();
      await page.locator('[data-testid="status"][data-operation="Saving…"]').waitFor();
      const newer = ` NEWER_${action}`;
      await page.locator('.document-editor').evaluate((element, text) => {
        const editor = element.editor;
        let end;
        editor.state.doc.forEach((node, offset) => {
          if (node.type.name === 'paragraph' && node.textContent.startsWith('The current reference')) end = offset + node.nodeSize - 1;
        });
        if (end === undefined) throw new Error('Missing transaction target');
        editor.view.dispatch(editor.state.tr.insertText(text, end));
      }, newer);
      releaseSave(); pendingSave = undefined;
      await confirmation.waitFor({state:'detached'});
      if (await page.getByTestId('current-file').getAttribute('title') !== pathA || await page.getByTestId('new-file-name').count()) throw new Error(`${action} continued with newer applied edits`);
      if (!(await page.locator('.document-editor').innerText()).includes(newer) || JSON.stringify(requests.at(-1)).includes(newer) || JSON.stringify(files.get(pathA)).includes(newer)) throw new Error('Save lost the newer transaction or included it in the earlier snapshot');
      if (await page.getByTestId('equation-latex').inputValue() !== 'keepThisDraft') throw new Error('Stopped continuation lost its draft');
      if (await page.getByTestId('status').innerText() !== 'Saved; newer edits pending' || await page.getByTestId('save').isDisabled()) throw new Error('Newer applied edits did not remain visibly saveable');
      if (!await trigger.evaluate(el => el === document.activeElement)) throw new Error('Stopped continuation lost return focus');
    }
    // Undoing just the newer applied edit leaves only the draft; redo restores the pending status.
    await page.locator('.document-editor').evaluate(el => el.editor.commands.undo());
    await page.getByTestId('status').getByText('Unsaved changes',{exact:true}).waitFor();
    if (await page.getByTestId('equation-latex').inputValue() !== 'keepThisDraft') throw new Error('Undo lost the unapplied draft');
    await page.locator('.document-editor').evaluate(el => el.editor.commands.redo());
    await page.getByTestId('status').getByText('Saved; newer edits pending',{exact:true}).waitFor();
    // Retry saves the retained edits and continues despite the still-unapplied draft.
    await chooseB();
    await confirmation.getByRole('button',{name:'Save',exact:true}).click();
    await confirmation.waitFor({state:'detached'});
    if (await page.getByTestId('current-file').getAttribute('title') !== pathB || !JSON.stringify(files.get(pathA)).includes('NEWER_new') || JSON.stringify(requests.at(-1)).includes('keepThisDraft')) throw new Error('Retry did not save newer applied edits and discard only the agreed draft');
    return {start:true, fileA:true, fileB:true, savingSwitchGuarded:true, draftSwitchGuarded:true, unsavedSwitchGuarded:true, conflictRetained:true};
  } finally {
    releaseSave?.();
    releaseOpen?.();
    await page.evaluate(() => localStorage.removeItem('ieumdoc.recentFolders'));
    await page.unroute('**/api/document**');
    await page.unrouteAll();
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  async function chooseB() {
    await page.getByRole('treeitem',{name:'ieumdoc-b.md',exact:true}).click();
    await page.getByRole('dialog',{name:'Save changes?',exact:true}).waitFor();
  }

  async function snapshot() {
    return page.locator('.document-editor').evaluate(el => JSON.stringify({doc:el.editor.getJSON(), selection:el.editor.state.selection.toJSON(), undo:el.editor.can().undo()}));
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
  }

  async function editParagraph(page, suffix) {
    await page.getByText(/The current reference is calculated from the active power command\.|Document B/).click();
    await page.keyboard.press('End');
    await page.keyboard.type(suffix);
  }
}
