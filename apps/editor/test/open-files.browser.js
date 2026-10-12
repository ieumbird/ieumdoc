// Run with pnpm exec playwright-cli run-code --filename=apps/editor/test/open-files.browser.js.
// Mocks two selected Markdown files while exercising the real Editor state flow.
async page => {
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
    if (conflictNext) {
      conflictNext = false;
      return route.fulfill({status:409,json:{error:'External change'}});
    }
    const response = clone(files.get(body.path));
    const paragraph = body.paragraphs?.find(edit => edit.path[0] === 8);
    if (paragraph) {
      const target = response.document.blocks.find(block => block.path[0] === 8);
      target.content = paragraph.content;
      target.text = inlineText(paragraph.content);
    }
    response.revision = `${body.path}-saved-${requests.length}`;
    files.set(body.path, response);
    return route.fulfill({json:response});
  });

  try {
    // Started without a document: nothing opens until the user chooses a folder, a file or the sample.
    await page.evaluate(recent => localStorage.setItem('ieumdoc.recentFolders', JSON.stringify([recent])), folder);
    await page.reload();
    const start = page.getByTestId('document-start');
    await start.waitFor();
    await page.locator('[data-testid="status"][data-operation="Ready"]').waitFor({state:'attached'});
    if (await page.getByTestId('current-file').innerText() !== 'No file opened' || await page.locator('.ProseMirror').count() ||
      !await page.getByTestId('save').isDisabled() || await page.getByTestId('error').count()) {
      throw new Error('The start opened a document or reported an error');
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
    await start.getByRole('button', {name:'Open sample document', exact:true}).click();
    await start.waitFor({state:'detached'});
    if (!(await page.getByTestId('current-file').getAttribute('title')).includes(pathB)) throw new Error('The sample did not open');
    await page.getByText("This is the sample document, a copy in IeumDoc's app data.", {exact:true}).waitFor();
    startNext = false;

    await page.reload();
    await page.locator('[data-testid="status"][data-operation="Ready"]').waitFor({state:'attached'});
    if (!(await page.getByTestId('current-file').getAttribute('title')).includes(pathA)) throw new Error('File A was not opened');

    await editParagraph(page, ' FILE_A');
    await page.getByRole('button',{name:'Save',exact:true}).click();
    await page.getByText('Saved',{exact:true}).waitFor();
    if (requests[0].path !== pathA || !JSON.stringify(requests[0].paragraphs).includes('FILE_A')) {
      throw new Error('File A save used the wrong path or omitted the edit');
    }

    await editParagraph(page, ' FILE_A_PENDING');
    await openPath(page, pathB);
    await page.getByText('Save or discard the current changes before opening another file.', {exact:true}).waitFor();
    await page.getByRole('dialog').getByRole('button',{name:'Cancel',exact:true}).click();
    if (!(await page.getByTestId('current-file').getAttribute('title')).includes(pathA)) throw new Error('Unsaved File A was discarded');
    if (!(await page.getByRole('article').innerText()).includes('FILE_A_PENDING')) throw new Error('Pending File A edit was lost');

    await page.getByRole('button',{name:'Save',exact:true}).click();
    await page.getByText('Saved',{exact:true}).waitFor();
    await openPath(page, pathB);
    await page.locator('[data-testid="status"][data-operation="Ready"]').waitFor({state:'attached'});
    if (!(await page.getByTestId('current-file').getAttribute('title')).includes(pathB)) throw new Error('File B was not opened');
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
    if (!reloadedA.includes('FILE_A_PENDING') || reloadedA.includes('FILE_B')) throw new Error('File A/B state was mixed');

    await editParagraph(page, ' STALE');
    conflictNext = true;
    await page.getByRole('button',{name:'Save',exact:true}).click();
    await page.getByText('Save conflict',{exact:true}).waitFor();
    if (!(await page.getByRole('article').innerText()).includes('STALE')) throw new Error('Stale edit was discarded');
    return {start:true, fileA:true, fileB:true, unsavedSwitchGuarded:true, conflictRetained:true};
  } finally {
    await page.evaluate(() => localStorage.removeItem('ieumdoc.recentFolders'));
    await page.unroute('**/api/document**');
    await page.unrouteAll();
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function setParagraph(document, text) {
    const paragraph = document.blocks.find(block => block.path[0] === 8);
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
    await page.getByRole('button',{name:'Open file…',exact:true}).click();
    await page.getByTestId('file-path').fill(path);
    await page.getByRole('dialog').getByRole('button',{name:'Open',exact:true}).click();
  }

  async function editParagraph(page, suffix) {
    await page.getByText(/The current reference is calculated from the active power command\.|Document B/).click();
    await page.keyboard.press('End');
    await page.keyboard.type(suffix);
  }
}
