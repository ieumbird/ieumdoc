// Native PNG clipboard, actual local Host assets, file drop and compensated insertion failure.
async (page, { openDocument }) => {
  await page.unrouteAll();
  await page.reload();
  await page.locator('[data-testid="status"][data-operation="Ready"]').waitFor({state:'attached'});
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  const origin = page.url().split('/').slice(0, 3).join('/');
  const defaultPath = (await (await page.request.get(`${origin}/api/document`)).json()).path;
  const separator = defaultPath.includes('\\') ? '\\' : '/';
  const root = defaultPath.split(separator).slice(0, -4).join(separator);
  const file = [root, 'tmp', 'image-assets', 'images.md'].join(separator);
  await openDocument(page, file);
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
  const blobScript = async (type = 'image/png') => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 8;
    canvas.getContext('2d').fillRect(0, 0, 8, 8);
    return new Promise(resolve => canvas.toBlob(resolve, type));
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
  // A dropped photo is a JPEG; the Host keeps its format and serves it as one.
  await select('typed Alpha.');
  const beta = page.locator('.document-editor > p').filter({hasText:'Beta.'});
  const box = await beta.boundingBox();
  await page.locator('.document-editor').evaluate(async (el, args) => {
    const jpeg = await (new Function(`return (${args.source})('image/jpeg')`))();
    const data = new DataTransfer(); data.items.add(new File([jpeg], 'photo.jpg', {type:'image/jpeg'}));
    el.dispatchEvent(new DragEvent('drop', {dataTransfer:data, clientX:args.x, clientY:args.y, bubbles:true, cancelable:true}));
  }, {source:blobSource, x:box.x + 25, y:box.y + box.height / 2});
  await page.waitForFunction(() => document.querySelectorAll('[data-block="figure"]').length === 2); await waitIdle(); await loaded();
  const dropped = (await documentJSON()).content;
  const droppedFigure = dropped[dropped.findIndex(node => node.content?.[0]?.text === 'Beta.') + 1];
  assert(droppedFigure?.type === 'figure', 'Drop lands after the pointer block');
  assert(/^\.\/assets\/image-[a-f0-9-]+\.jpg$/.test(droppedFigure.attrs.imageUrl), 'JPEG keeps its extension');
  assert((await page.request.get(media(droppedFigure.attrs.imageUrl))).headers()['content-type'] === 'image/jpeg', 'Host serves the saved JPEG');
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
  await page.getByRole('button', {name:'File actions', exact:true}).click();
  await page.getByRole('menuitem', {name:'Reload', exact:true}).click();
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

  // Choose… picks a Host image in the Open folder picker. One beside the document keeps its
  // relative path; one elsewhere is copied into assets/ and removed again if the form is cancelled.
  const outsidePhoto = [root, 'tmp', 'image-assets-outside', 'photo.png'].join(separator);
  const imageField = page.getByTestId('figure-image-url');
  const picker = page.getByRole('dialog', {name:'Choose image'});
  const pathField = picker.getByRole('combobox', {name:'Image path'});
  const editFigure = async index => {
    const edit = figures.nth(index).getByRole('button', {name:'Edit figure'});
    await edit.locator('..').hover({position:{x:4,y:4}}); await edit.click(); await imageField.waitFor();
  };
  const chooseOutside = async () => {
    await page.getByRole('button', {name:'Choose…', exact:true}).click();
    await pathField.fill(outsidePhoto);
    await picker.getByRole('option', {name:'photo.png', exact:true}).waitFor();
    await pathField.press('Enter');
    await picker.waitFor({state:'hidden', timeout:10000});
    return imageField.inputValue();
  };
  await editFigure(0);
  const before = await imageField.inputValue();
  await page.getByRole('button', {name:'Choose…', exact:true}).click();
  await picker.waitFor();
  await page.keyboard.press('Escape'); await picker.waitFor({state:'hidden', timeout:10000});
  assert(await imageField.inputValue() === before, 'Cancelling the picker keeps the Image field');
  await page.getByRole('button', {name:'Choose…', exact:true}).click();
  // A typed folder path is a place to look, never a choice; Enter enters it.
  await pathField.fill([root, 'tmp', 'image-assets', 'figures'].join(separator));
  await picker.getByRole('option', {name:'figures', exact:true}).waitFor();
  assert(await picker.getByTestId('folder-open').isDisabled(), 'A folder path cannot be used as the image');
  await pathField.press('Enter');
  await picker.getByRole('option', {name:'diagram.svg', exact:true}).click();
  await picker.getByRole('button', {name:'Use “diagram.svg”', exact:true}).click();
  await picker.waitFor({state:'hidden', timeout:10000});
  assert(await imageField.inputValue() === './figures/diagram.svg', 'An image beside the document is linked by its relative path');
  assert(await page.evaluate(() => document.activeElement?.textContent) === 'Choose…', 'Closing the picker returns focus to Choose…');
  await page.getByTestId('figure-apply').click(); await imageField.waitFor({state:'detached'});
  result.chooseLinksNearbyImage = true;

  await editFigure(1);
  const cancelled = await chooseOutside();
  assert(/^\.\/assets\/image-[a-f0-9-]+\.png$/.test(cancelled), 'An image elsewhere is copied into assets/');
  assert((await page.request.get(media(cancelled))).status() === 200, 'The copy exists while the form holds it');
  const removed = page.waitForResponse(response => response.url().endsWith('/api/asset') && response.request().method() === 'DELETE');
  await page.getByTestId('figure-cancel').click();
  assert((await removed).status() === 204 && (await page.request.get(media(cancelled))).status() === 404, 'Cancel removes the unused copy');
  await editFigure(1);
  const copied = await chooseOutside();
  await page.getByTestId('figure-apply').click(); await imageField.waitFor({state:'detached'});
  await page.getByRole('button', {name:'Save', exact:true}).click();
  await page.locator('[data-testid="status"][data-operation="Saved"]').waitFor();
  const chosen = (await (await page.request.get(`${origin}/api/document?path=${encodeURIComponent(file)}`)).json())
    .document.blocks.filter(block => block.block === 'figure').map(block => block.imageUrl);
  assert(chosen[0] === './figures/diagram.svg' && chosen[1] === copied, 'Save writes the chosen paths');
  assert((await page.request.get(media(copied))).status() === 200, 'An applied copy is kept');
  result.chooseCopiesOtherImage = true;

  // An unapplied copy is removed when its form goes away without Cancel: Reload, Figure deletion.
  const discarded = async leave => {
    await editFigure(0);
    const copy = await chooseOutside();
    const deleted = page.waitForResponse(response => response.url().endsWith('/api/asset') && response.request().method() === 'DELETE');
    await leave();
    assert((await deleted).status() === 204 && (await page.request.get(media(copy))).status() === 404, 'The unapplied copy is removed');
  };
  await discarded(async () => {
    await page.getByRole('button', {name:'File actions', exact:true}).click();
    await page.getByRole('menuitem', {name:'Reload', exact:true}).click();
    await page.getByRole('button', {name:'Discard and reload', exact:true}).click();
    await page.locator('[data-testid="status"][data-operation="Ready"]').waitFor({state:'attached'});
  });
  await discarded(() => page.locator('.document-editor').evaluate(el => {
    const {state, view} = el.editor;
    let from;
    state.doc.forEach((node, offset) => { if (from === undefined && node.type.name === 'figure') from = offset; });
    view.dispatch(state.tr.delete(from, from + state.doc.nodeAt(from).nodeSize));
  }));
  result.unappliedCopyRemoved = true;
  await page.getByRole('button', {name:'Save', exact:true}).click();
  await page.locator('[data-testid="status"][data-operation="Saved"]').waitFor();

  // Paste in a reserved caption and drop on a completely empty frame fill that Figure (#212).
  // Repeat each gesture on its completed Figure: the existing image must never be overwritten.
  const semanticJSON = value => JSON.stringify(value, (key, item) => key === 'sourcePath' ? undefined : item);
  const historyKey = async key => {
    await page.locator('.document-editor').evaluate(el => el.editor.view.focus());
    await page.keyboard.press(key);
  };
  for (const gesture of ['paste', 'drop']) {
    await page.getByText('typed Alpha.', {exact:true}).hover();
    await page.getByRole('button', {name:/Insert block after paragraph block/}).first().click();
    await page.getByRole('menuitem', {name:'Paragraph', exact:true}).click();
    await page.keyboard.type('/figure');
    await page.getByRole('menuitem', {name:'Figure', exact:true}).click();
    if (gesture === 'paste') {
      await editFigure(0);
      await page.getByTestId('figure-label').fill('fig-reserved');
      await page.getByTestId('figure-caption').fill('Reserved caption');
      await page.getByTestId('figure-apply').click(); await imageField.waitFor({state:'detached'});
    }
    const beforeFill = await documentJSON();
    const index = beforeFill.content.findIndex(node => node.type === 'figure' && !node.attrs.imageUrl);
    const target = figures.first();
    const sendImage = async () => {
      if (gesture === 'paste') {
        await target.getByTestId('figure-caption-content').click();
        await page.evaluate(async source => {
          const png = await (new Function(`return (${source})()`))();
          await navigator.clipboard.write([new ClipboardItem({'image/png':png})]);
        }, blobSource);
        await page.keyboard.press('Control+v');
      } else {
        await select('typed Alpha.');
        const surface = target.getByTestId(await target.getByTestId('figure-no-content').count() ? 'figure-no-content' : 'figure-image');
        await surface.scrollIntoViewIfNeeded();
        const box = await surface.boundingBox();
        await page.locator('.document-editor').evaluate(async (el, args) => {
          const png = await (new Function(`return (${args.source})()`))();
          const data = new DataTransfer(); data.items.add(new File([png], 'image.png', {type:'image/png'}));
          el.dispatchEvent(new DragEvent('drop', {dataTransfer:data, clientX:args.x, clientY:args.y, bubbles:true, cancelable:true}));
        }, {source:blobSource, x:box.x + box.width / 2, y:box.y + box.height / 2});
      }
    };
    const response = page.waitForResponse(response => response.url().includes('/api/asset?') && response.status() === 201);
    await sendImage(); await response; await waitIdle();
    await target.getByTestId('figure-image').waitFor();
    await page.waitForFunction(() => {
      const image = document.querySelector('[data-block="figure"] [data-testid="figure-image"]');
      return image?.complete && image.naturalWidth === 8;
    });
    const filled = await documentJSON();
    const expected = JSON.parse(JSON.stringify(beforeFill));
    expected.content[index].attrs.imageUrl = filled.content[index].attrs.imageUrl;
    assert(expected.content[index].attrs.imageUrl.startsWith('./assets/'), `${gesture} fills the reserved Figure`);
    assert(JSON.stringify(filled) === JSON.stringify(expected), `${gesture} preserves caption, label and position without inserting a Figure`);
    await historyKey('Control+z');
    assert(JSON.stringify(await documentJSON()) === JSON.stringify(beforeFill), `One Undo restores the empty Figure after ${gesture}`);
    await historyKey('Control+Shift+z');
    assert(JSON.stringify(await documentJSON()) === JSON.stringify(filled), `Redo restores the filled Figure after ${gesture}`);

    const second = page.waitForResponse(response => response.url().includes('/api/asset?') && response.status() === 201);
    await sendImage(); await second; await waitIdle();
    const inserted = (await documentJSON()).content;
    assert(inserted[index + 1]?.type === 'figure' && inserted[index + 1].attrs.imageUrl !== filled.content[index].attrs.imageUrl,
      `${gesture} on a completed Figure inserts a new image Figure after it`);
    inserted.splice(index + 1, 1);
    assert(JSON.stringify(inserted) === JSON.stringify(filled.content), `${gesture} retains the completed Figure and surrounding blocks`);
    await historyKey('Control+z');
    await page.getByRole('button', {name:'Save', exact:true}).click();
    await page.locator('[data-testid="status"][data-operation="Saved"]').waitFor();
    const saved = (await (await page.request.get(`${origin}/api/document?path=${encodeURIComponent(file)}`)).json()).document.blocks;
    const savedFigure = saved[index];
    assert(savedFigure?.block === 'figure' && savedFigure.imageUrl === filled.content[index].attrs.imageUrl &&
      savedFigure.label === beforeFill.content[index].attrs.label && savedFigure.caption.text === (gesture === 'paste' ? 'Reserved caption' : ''),
      `Save writes the filled Figure's image, caption, label and position after ${gesture}`);
    await page.getByRole('button', {name:'File actions', exact:true}).click();
    await page.getByRole('menuitem', {name:'Reload', exact:true}).click();
    await page.locator('[data-testid="status"][data-operation="Ready"]').waitFor({state:'attached'});
    assert(semanticJSON(await documentJSON()) === semanticJSON(filled), `Reload retains the filled Figure after ${gesture}`);
  }
  result.fillEmptyFigureAndKeepExistingImage = true;

  // Real document-relative loading, failure feedback and unchanged saved paths (#211).
  const pathsFile = [root, 'tmp', 'image-assets', 'paths.md'].join(separator);
  await openDocument(page, pathsFile);
  await page.waitForFunction(file => document.querySelector('[data-testid="current-file"]')?.getAttribute('title') === file, pathsFile, {timeout:5000});
  await page.locator('[data-testid="status"][data-operation="Ready"]').waitFor({state:'attached'});
  const pathsJSON = JSON.stringify(await documentJSON());
  const failure = figures.nth(2).getByRole('alert');
  const relativeLoaded = () => page.waitForFunction(() => {
    const images = [...document.querySelectorAll('[data-testid="figure-image"]')];
    return images.length === 3 && images.slice(0, 2).every(image => image.complete && image.naturalWidth > 0);
  }, null, {timeout:5000});
  await relativeLoaded();
  await failure.getByText('Image could not be loaded. Check the image path or URL.', {exact:true}).waitFor();
  assert(await figures.nth(2).getByTestId('figure-image').isHidden(), 'Hide the broken icon, retain the caption and failure notice');
  assert(JSON.stringify(await documentJSON()) === pathsJSON, 'Loading and failure feedback never change the document');
  assert(!(await page.getByTestId('status').innerText()).includes('Unsaved'), 'Load failure does not make the document dirty');
  await page.getByTestId('view-source').click({timeout:5000});
  const source = await page.getByTestId('source-view').locator('pre').textContent({timeout:5000});
  assert(source.includes(':::{figure} assets/diagram.svg') && source.includes(':::{figure} assets/missing.png') && !source.includes('Image could not be loaded'), 'Source contains the original paths and no display error');
  await page.getByTestId('view-visual').click({timeout:5000});
  await relativeLoaded(); await failure.waitFor();

  await figures.nth(1).getByTestId('figure-caption-content').click();
  await page.keyboard.press('End'); await page.keyboard.type(' Verified.');
  await page.getByRole('button', {name:'Save', exact:true}).click();
  await page.locator('[data-testid="status"][data-operation="Saved"]').waitFor();
  const expectedPaths = ['./assets/diagram.svg', 'assets/diagram.svg', 'assets/missing.png'];
  const savedPaths = (await (await page.request.get(`${origin}/api/document?path=${encodeURIComponent(pathsFile)}`)).json())
    .document.blocks.filter(block => block.block === 'figure').map(block => block.imageUrl);
  assert(JSON.stringify(savedPaths) === JSON.stringify(expectedPaths), 'Save retains typed image paths even when loading fails');
  await page.getByRole('button', {name:'File actions', exact:true}).click();
  await page.getByRole('menuitem', {name:'Reload', exact:true}).click();
  await page.locator('[data-testid="status"][data-operation="Ready"]').waitFor({state:'attached'});
  await relativeLoaded(); await failure.waitFor();
  assert(JSON.stringify((await documentJSON()).content.filter(node => node.type === 'figure').map(node => node.attrs.imageUrl)) === JSON.stringify(expectedPaths), 'Reload retains the original strings');

  // Fixing a failed source removes its notice and loads the replacement in the same NodeView.
  await editFigure(2); await imageField.fill('assets/diagram.svg');
  await page.getByTestId('figure-apply').click(); await imageField.waitFor({state:'detached'});
  await page.waitForFunction(() => [...document.querySelectorAll('[data-testid="figure-image"]')].every(image => image.complete && image.naturalWidth > 0));
  await failure.waitFor({state:'detached'});
  result.relativeSourcesAndLoadFailure = true;
  return result;
}
