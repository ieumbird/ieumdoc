// Run with pnpm exec playwright-cli run-code --filename=apps/editor/test/save-during-edit.browser.js.
// Uses the technical-document fixture and mocks every POST; never writes the document.
async page => {
  await page.unroute('**/api/document');
  await page.reload();
  await page.getByText('Ready', {exact:true}).waitFor();
  const loaded = await (await page.request.get(page.url().split('/').slice(0, 3).join('/') + '/api/document')).json();
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const requests = [];
  await page.route('**/api/document', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    const request = route.request().postDataJSON();
    requests.push(request);
    if (requests.length === 1) {
      await gate;
      return route.fulfill({json:{...loaded, revision:'saved-revision'}});
    }
    if (requests.length === 2) {
      const response = JSON.parse(JSON.stringify(loaded));
      const paragraph = response.document.blocks.find(block => block.path[0] === 8);
      paragraph.content = request.paragraphs.find(edit => edit.path[0] === 8).content;
      paragraph.text = paragraph.content.map(item => item.text).join('');
      return route.fulfill({json:{...response,revision:'second-revision'}});
    }
    return route.fulfill({status:409,json:{error:'External change'}});
  });
  try {
    await page.getByRole('button',{name:'Save',exact:true}).click();
    await page.getByText('The current reference is calculated from the active power command.',{exact:true}).click();
    await page.keyboard.press('End');
    await page.keyboard.type(' PENDING_INPUT');
    const before = (await page.getByRole('article').innerText()).includes('PENDING_INPUT');
    release();
    await page.getByText('Saved; newer edits pending',{exact:true}).waitFor();
    const after = (await page.getByRole('article').innerText()).includes('PENDING_INPUT');
    if (!before || !after) throw new Error('Pending input was lost');
    await page.getByRole('button',{name:'Save',exact:true}).click();
    await page.getByText('Saved',{exact:true}).waitFor();
    if(requests[1].revision !== 'saved-revision') throw new Error('Stale revision reused');
    if(!JSON.stringify(requests[1].paragraphs).includes('PENDING_INPUT')) throw new Error('Pending edits omitted from next save');
    const retained = (await page.getByRole('article').innerText()).includes('PENDING_INPUT');
    await page.getByRole('button',{name:'Save',exact:true}).click();
    await page.getByText('Save conflict',{exact:true}).waitFor();
    const conflictRetained = (await page.getByRole('article').innerText()).includes('PENDING_INPUT');
    const editorCount = await page.locator('[data-testid="document-editor"] [contenteditable="true"]').count();
    if(!retained || !conflictRetained || editorCount !== 1) throw new Error('Save or single editor invariant failed');
    return {before,after,retained,conflictRetained,editorCount,nextRevision:requests[1].revision};
  } finally { await page.unroute('**/api/document'); }
}
