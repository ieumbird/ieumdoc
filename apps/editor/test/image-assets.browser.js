// Native PNG clipboard, actual local Host assets, file drop and compensated insertion failure.
async page => {
  await page.unrouteAll();
  await page.reload();
  await page.locator('[data-testid="status"][data-operation="Ready"]').waitFor({state:'attached'});
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  const origin = page.url().split('/').slice(0, 3).join('/');
  const defaultPath = (await (await page.request.get(`${origin}/api/document`)).json()).path;
  const separator = defaultPath.includes('\\') ? '\\' : '/';
  const root = defaultPath.split(separator).slice(0, -4).join(separator);
  const file = [root, 'tmp', 'image-assets', 'images.md'].join(separator);
  await page.getByRole('button', { name: 'Open file…' }).click();
  await page.getByTestId('file-path').fill(file);
  await page.getByRole('dialog').getByRole('button', { name: 'Open', exact: true }).click();
  await page.locator('[data-testid="status"][data-operation="Ready"]').waitFor({state:'attached'});
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const result = {};
  const figures = page.locator('[data-block="figure"]');
  const documentJSON = () => page.locator('.document-editor').evaluate(el => el.editor.getJSON());
  const select = async text => page.locator('.document-editor').evaluate((el, text) => {
    const editor = el.editor;
    let position;
    editor.state.doc.forEach((node, pos) => { if (node.textContent === text) position = pos + 1; });
    if (position === undefined) throw new Error(`Missing ${text}`);
    editor.commands.setTextSelection(position); editor.view.focus();
  }, text);
  const blobScript = async () => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 8;
    canvas.getContext('2d').fillRect(0, 0, 8, 8);
    return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  };
  const blobSource = blobScript.toString();
  const media = relative => `${origin}/document/${relative.slice(2)}?path=${encodeURIComponent(file)}`;
  const loaded = async () => {
    await page.waitForFunction(() => [...document.querySelectorAll('[data-testid="figure-image"]')].every(image => image.complete && image.naturalWidth === 8));
  };
  const syntheticPaste = async html => page.locator('.document-editor').evaluate(async (el, args) => {
    const png = await (new Function(`return (${args.source})()`))();
    const data = new DataTransfer(); data.items.add(new File([png], '../../filename-injection.svg', {type:'image/png'}));
    data.setData('text/plain', 'Ignored external text'); data.setData('text/html', args.html);
    el.dispatchEvent(new ClipboardEvent('paste', {clipboardData:data, bubbles:true, cancelable:true}));
  }, {source:blobSource, html});
  const waitIdle = () => page.waitForFunction(() => document.querySelector('[data-testid="status"]')?.getAttribute('data-operation') !== 'Adding image…');
  const dismiss = async () => { const button = page.getByRole('button', {name:'Dismiss error'}); if (await button.count()) await button.click(); };

  // Native OS clipboard screenshot paste. A single Undo keeps prior text edits intact.
  await select('Alpha.');
  await page.keyboard.type('typed ');
  await page.evaluate(async source => {
    const png = await (new Function(`return (${source})()`))();
    await navigator.clipboard.write([new ClipboardItem({'image/png':png})]);
  }, blobSource);
  await page.keyboard.press('Control+v');
  await figures.first().waitFor(); await waitIdle(); await loaded();
  const pasted = (await documentJSON()).content.find(node => node.type === 'figure').attrs.imageUrl;
  assert(/^\.\/assets\/image-[a-f0-9-]+\.png$/.test(pasted), 'PNG path must be portable and generated');
  assert((await page.request.get(media(pasted))).headers()['content-type'] === 'image/png', 'Host serves the saved PNG');
  await page.keyboard.press('Control+z');
  assert(await figures.count() === 0 && (await documentJSON()).content.some(node => node.content?.[0]?.text === 'typed Alpha.'), 'One Undo removes Figure only');
  await page.keyboard.press('Control+Shift+z'); await figures.first().waitFor();
  result.nativePasteAndUndo = true;

  // Real File drop uses the pointer's block rather than the unrelated current selection.
  await select('typed Alpha.');
  const beta = page.locator('.document-editor > p').filter({hasText:'Beta.'});
  const box = await beta.boundingBox();
  await page.locator('.document-editor').evaluate(async (el, args) => {
    const png = await (new Function(`return (${args.source})()`))();
    const data = new DataTransfer(); data.items.add(new File([png], 'drop.png', {type:'image/png'}));
    el.dispatchEvent(new DragEvent('drop', {dataTransfer:data, clientX:args.x, clientY:args.y, bubbles:true, cancelable:true}));
  }, {source:blobSource, x:box.x + 25, y:box.y + box.height / 2});
  await page.waitForFunction(() => document.querySelectorAll('[data-block="figure"]').length === 2); await waitIdle();
  const dropped = (await documentJSON()).content;
  assert(dropped[dropped.findIndex(node => node.content?.[0]?.text === 'Beta.') + 1]?.type === 'figure', 'Drop lands after the pointer block');
  result.fileDrop = true;

  await select('typed Alpha.');
  await syntheticPaste('<p><strong>Ignored external HTML</strong></p>');
  await page.waitForFunction(() => document.querySelectorAll('[data-block="figure"]').length === 3); await waitIdle();
  assert(!(await page.locator('.document-editor').innerText()).includes('Ignored external'), 'Image takes priority over external text/HTML');
  result.mixedClipboardPriority = true;

  // Typed internal rich paste wins over the OS image flavor and stays lossless.
  await select('Beta.');
  await syntheticPaste('<p data-ieumdoc-type="paragraph" data-ieumdoc-attrs="{}"><strong>Internal rich </strong></p>');
  assert(await figures.count() === 3 && await page.locator('.document-editor strong').filter({hasText:'Internal rich'}).count() === 1, 'Internal rich clipboard must bypass asset upload');
  result.internalClipboard = true;

  // Actual Save/Reload reuses Core Figure semantics and resolves every saved image from disk.
  await loaded();
  await page.getByRole('button', {name:'Save', exact:true}).click();
  await page.locator('[data-testid="status"][data-operation="Saved"]').waitFor();
  const disk = await (await page.request.get(`${origin}/api/document?path=${encodeURIComponent(file)}`)).json();
  const paths = disk.document.blocks.filter(block => block.block === 'figure').map(block => block.imageUrl);
  assert(paths.length === 3 && paths.every(path => path.startsWith('./assets/')), 'Save retains all Figure paths');
  await page.getByRole('button', {name:'Reload', exact:true}).click();
  await page.locator('[data-testid="status"][data-operation="Ready"]').waitFor({state:'attached'}); await loaded();
  assert((await documentJSON()).content.filter(node => node.type === 'figure').map(node => node.attrs.imageUrl).join('|') === paths.join('|'), 'Reload retains relative paths');
  result.saveReloadAndImageLoad = true;

  // Host failure leaves the Editor unchanged. No successful asset request is made.
  const beforeFailure = JSON.stringify(await documentJSON());
  await page.route('**/api/asset?*', route => route.fulfill({status:400, json:{error:'Host disk denied'}}));
  await select('typed Alpha.'); await syntheticPaste('');
  await page.getByText('Image could not be inserted: Host disk denied', {exact:true}).waitFor(); await waitIdle();
  assert(JSON.stringify(await documentJSON()) === beforeFailure, 'Host error must retain document');
  await page.unroute('**/api/asset?*'); await dismiss();
  result.hostFailure = true;

  // Simulate a rejected command after the real Host has created an asset.
  const rejectInsertion = () => page.locator('.document-editor').evaluate(el => {
    const view = el.editor.view;
    view.__assetOriginalDispatch = view.dispatch;
    view.dispatch = tr => { if (!tr.getMeta('blockCommand')) view.__assetOriginalDispatch(tr); };
  });
  const restoreInsertion = () => page.locator('.document-editor').evaluate(el => {
    const view = el.editor.view; view.dispatch = view.__assetOriginalDispatch; delete view.__assetOriginalDispatch;
  });
  await rejectInsertion();
  const responsePromise = page.waitForResponse(response => response.url().includes('/api/asset?') && response.status() === 201);
  await syntheticPaste('');
  const receipt = await (await responsePromise).json();
  await page.getByText('Image could not be inserted: The Figure insertion was rejected; your document is unchanged.', {exact:true}).waitFor(); await waitIdle();
  assert((await page.request.get(media(receipt.path))).status() === 404, 'Rejected insertion must rollback the exact created asset');
  assert(JSON.stringify(await documentJSON()) === beforeFailure, 'Rejected insertion retains document');
  await restoreInsertion(); await dismiss();
  result.rollback = true;

  // A failed compensation is a persistent error with the surviving path, never success.
  await page.route('**/api/asset', route => route.fulfill({status:403, json:{error:'Rollback denied'}}));
  await rejectInsertion();
  const failedResponse = page.waitForResponse(response => response.url().includes('/api/asset?') && response.status() === 201);
  await syntheticPaste('');
  const failedReceipt = await (await failedResponse).json();
  await page.getByText(new RegExp(`Rollback failed; asset remains at`)).waitFor(); await waitIdle();
  assert((await page.locator('body').innerText()).includes(failedReceipt.path), 'Rollback failure exposes remaining path');
  assert((await page.request.get(media(failedReceipt.path))).status() === 200, 'Failure fixture still exists before cleanup');
  assert(JSON.stringify(await documentJSON()) === beforeFailure, 'Rollback failure does not insert a Figure');
  await restoreInsertion(); await page.unroute('**/api/asset');
  const cleaned = await page.request.delete(`${origin}/api/asset`, {data:{documentPath:file, ...failedReceipt}});
  assert(cleaned.status() === 204, 'Clean up only the failed request asset with its receipt');
  result.rollbackFailureVisible = true;
  await dismiss(); await page.unrouteAll();
  return result;
}
