// Run with pnpm exec playwright-cli run-code --filename=apps/editor/test/open-files.browser.js.
// Mocks two selected Markdown files while exercising the real Editor state flow.
async page => {
  await page.unroute('**/api/document');
  await page.unrouteAll();
  await page.reload();
  await page.getByText('Ready', {exact:true}).waitFor();
  const origin = page.url().split('/').slice(0, 3).join('/');
  const loaded = await (await page.request.get(`${origin}/api/document`)).json();
  const pathA = 'C:\\tmp\\ieumdoc-a.md';
  const pathB = 'C:\\tmp\\ieumdoc-b.md';
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

  // Match selected-file GETs (?path=...) as well.
  await page.route('**/api/document**', async route => {
    const request = route.request();
    if (request.method() === 'GET') {
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
    await page.reload();
    await page.getByText('Ready', {exact:true}).waitFor();
    if (!(await page.getByTestId('current-file').textContent()).includes(pathA)) throw new Error('File A was not opened');

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
    if (!(await page.getByTestId('current-file').textContent()).includes(pathA)) throw new Error('Unsaved File A was discarded');
    if (!(await page.getByRole('article').innerText()).includes('FILE_A_PENDING')) throw new Error('Pending File A edit was lost');

    await page.getByRole('button',{name:'Save',exact:true}).click();
    await page.getByText('Saved',{exact:true}).waitFor();
    await openPath(page, pathB);
    await page.getByText('Ready',{exact:true}).waitFor();
    if (!(await page.getByTestId('current-file').textContent()).includes(pathB)) throw new Error('File B was not opened');
    if ((await page.getByRole('article').innerText()).includes('FILE_A_PENDING')) throw new Error('File A state leaked into File B');

    await editParagraph(page, ' FILE_B');
    await page.getByRole('button',{name:'Save',exact:true}).click();
    await page.getByText('Saved',{exact:true}).waitFor();
    if (requests[2].path !== pathB || !JSON.stringify(requests[2].paragraphs).includes('FILE_B')) {
      throw new Error('File B save used the wrong path or omitted the edit');
    }

    await openPath(page, pathA);
    await page.getByText('Ready',{exact:true}).waitFor();
    const reloadedA = await page.getByRole('article').innerText();
    if (!reloadedA.includes('FILE_A_PENDING') || reloadedA.includes('FILE_B')) throw new Error('File A/B state was mixed');

    await editParagraph(page, ' STALE');
    conflictNext = true;
    await page.getByRole('button',{name:'Save',exact:true}).click();
    await page.getByText('Save conflict',{exact:true}).waitFor();
    if (!(await page.getByRole('article').innerText()).includes('STALE')) throw new Error('Stale edit was discarded');
    return {fileA:true, fileB:true, unsavedSwitchGuarded:true, conflictRetained:true};
  } finally {
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
    await page.getByRole('button',{name:'Open…',exact:true}).click();
    await page.getByTestId('file-path').fill(path);
    await page.getByRole('dialog').getByRole('button',{name:'Open',exact:true}).click();
  }

  async function editParagraph(page, suffix) {
    await page.getByText(/The current reference is calculated from the active power command\.|Document B/).click();
    await page.keyboard.press('End');
    await page.keyboard.type(suffix);
  }
}
