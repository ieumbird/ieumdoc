// Run with playwright-cli run-code --filename=apps/editor/test/new-document.browser.js.
// Exercises New -> type -> Save -> Reload with the real Editor projection and save flow.
// Host responses are mocked so this scenario does not leave a test file in the repository.
async page => {
  await page.unrouteAll();
  await page.reload();
  await page.getByText('Ready', {exact:true}).waitFor();

  const origin = page.url().split('/').slice(0, 3).join('/');
  const initial = await (await page.request.get(`${origin}/api/document`)).json();
  const newPath = 'C:\\tmp\\ieumdoc-browser-new.md';
  const empty = {path:newPath, document:{blocks:[]}, revision:'empty-revision'};
  let stored = clone(empty);
  const requests = [];

  await page.route('**/api/document**', async route => {
    const request = route.request();
    if (request.method() === 'GET') {
      const requestedPath = queryPath(request.url());
      return route.fulfill({json: requestedPath && requestedPath !== newPath ? initial : stored});
    }

    const body = request.postDataJSON();
    requests.push({method:request.method(), body});
    if (request.method() === 'PUT') {
      if (body.path !== newPath) throw new Error('New request used the wrong path');
      stored = clone(empty);
      return route.fulfill({status:201, json:stored});
    }
    if (request.method() !== 'POST') return route.continue();

    const text = body.inserts?.[0]?.map(item => item.text ?? '').join('') ?? '';
    if (!text) throw new Error('New document text was not sent through inserts');
    stored = {
      path:newPath,
      document:{blocks:[{
        block:'paragraph',
        path:[0],
        text,
        editable:true,
        content:[{kind:'text', text}],
      }]},
      revision:'saved-revision',
    };
    return route.fulfill({json:stored});
  });

  try {
    await page.reload();
    await page.getByText('Ready', {exact:true}).waitFor();
    await page.getByRole('button', {name:'New', exact:true}).click();
    await page.getByTestId('new-file-path').fill(newPath);
    await page.getByRole('dialog').getByRole('button', {name:'Create', exact:true}).click();
    await page.getByText('Ready', {exact:true}).waitFor();
    if (!(await page.getByTestId('current-file').innerText()).includes(newPath)) {
      throw new Error('Created document was not opened');
    }

    const editor = page.locator('[data-testid="document-editor"] [contenteditable="true"]');
    await editor.click();
    await page.keyboard.type('Browser-created paragraph');
    if (!(await page.getByRole('article').innerText()).includes('Browser-created paragraph')) {
      throw new Error('Empty document was not editable');
    }

    await page.getByRole('button', {name:'Save', exact:true}).click();
    await page.getByText('Saved', {exact:true}).waitFor();
    const saveRequest = requests.find(request => request.method === 'POST');
    if (!saveRequest?.body.inserts?.length) throw new Error('Save did not use Core insert edits');

    await page.reload();
    await page.getByText('Ready', {exact:true}).waitFor();
    if (!(await page.getByRole('article').innerText()).includes('Browser-created paragraph')) {
      throw new Error('Saved paragraph was not present after reload');
    }
    return {created:true, typed:true, saved:true, reloaded:true};
  } finally {
    await page.unroute('**/api/document**');
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function queryPath(url) {
    const query = url.split('?')[1] || '';
    const value = query.split('&').find(part => part.startsWith('path='));
    return value ? decodeURIComponent(value.slice('path='.length)) : '';
  }
}
