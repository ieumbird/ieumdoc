// Production bundle, real HTTP and two independent allowed roots. No mocked file API.
async (page, { openDocument, reloadDocument, bibliographyFixture, screenshots }) => {
  page.setDefaultTimeout(15000);
  const check = (ok, message) => { if (!ok) throw new Error(message); };
  const ready = () => page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
  const origin = page.url().split('/').slice(0, 3).join('/');
  const start = await (await page.request.get(origin + '/api/document')).json();
  check(start.start && start.allowedRoots?.length === 2 && !start.sample, 'Production HTTP must start without a sample and with two roots');
  const [a, b] = start.allowedRoots;
  const sep = a.includes('\\') ? '\\' : '/';
  const join = (...parts) => parts.join(sep);
  const fileA = join(a, 'fixture', 'a.md'), fileB = join(b, 'fixture', 'b.md');
  const stale = a + '-outside';
  await page.evaluate(({stale, valid}) => localStorage.setItem('ieumdoc.recentFolders', JSON.stringify([stale, valid])), {stale, valid:join(a, 'fixture')});
  await page.reload(); await ready();
  check(await page.getByText(stale, {exact:true}).filter({visible:true}).count() === 0, 'Stale outside Recent must be hidden');
  const sidebar = page.getByTestId('sidebar');
  const picker = page.getByRole('dialog', {name:'Open folder', exact:true});
  const openPicker = async () => {
    if (await sidebar.getByTestId('folder').count()) {
      await sidebar.getByRole('button', {name:'More actions', exact:true}).click();
      await page.getByRole('menuitem', {name:'Open folder…', exact:true}).click();
    } else await sidebar.getByRole('button', {name:'Open folder…', exact:true}).click();
    await picker.waitFor();
  };
  await openPicker();
  await picker.getByRole('region', {name:'Start from'}).getByTitle(a, {exact:true}).click();
  await picker.getByRole('option', {name:'fixture', exact:true}).waitFor();
  check(await picker.getByRole('button', {name:'Up', exact:true}).isDisabled(), 'Up is disabled at an allowed root');
  check(await picker.getByRole('navigation', {name:'Folder location'}).getByRole('button').count() === 1, 'Breadcrumb begins at the allowed root');
  check(await picker.getByRole('region', {name:'Start from'}).getByRole('button').count() === 2, 'Only allowed roots are starting places');
  await page.setViewportSize({width:1440, height:900});
  if (screenshots) await page.screenshot({path:'tmp/http-host-capture/roots-wide.png'});
  await page.setViewportSize({width:375, height:812});
  const box = await picker.boundingBox();
  check(box.x >= 0 && box.x + box.width <= 375 && box.y >= 0 && box.y + box.height <= 812, 'Restricted picker fits a narrow viewport');
  if (screenshots) await page.screenshot({path:'tmp/http-host-capture/roots-narrow.png'});
  await page.setViewportSize({width:1280, height:720});
  // A typed outside path reaches the real Host and leaves the current selection intact.
  await page.getByTestId('folder-path').fill(stale + sep);
  await page.getByTestId('folder-picker-meta').getByText('Path is outside the allowed folders.', {exact:true}).waitFor();
  await picker.getByRole('region', {name:'Start from'}).getByTitle(a, {exact:true}).click();
  await picker.getByRole('option', {name:'fixture', exact:true}).click();
  await page.getByTestId('folder-open').click(); await picker.waitFor({state:'detached'});
  await sidebar.getByRole('treeitem', {name:'a.md', exact:true}).click(); await ready();
  const editor = page.locator('[data-document-tab][data-active=true] .document-editor');
  const save = async () => {
    await page.getByRole('button', {name:'Save', exact:true}).click();
    await page.locator('[data-testid="status"][data-operation="saved"]').waitFor({state:'attached'});
  };
  await editor.locator('p').filter({hasText:'Alpha.'}).click();
  await page.keyboard.press('End'); await page.keyboard.type(' HTTP saved.');
  // Cross-root Open retains A; single-tab close owns the work-loss dialog.
  await openDocument(page, fileB); await ready();
  await page.getByRole('tab', {name:'a.md, Unsaved changes',exact:true}).click();
  check((await editor.innerText()).includes('HTTP saved.'), 'Cross-root Open lost A');
  await page.getByRole('button', {name:'Close a.md',exact:true}).click();
  await page.getByRole('dialog', {name:'Save changes?',exact:true}).getByRole('button', {name:'Cancel',exact:true}).click();
  await page.getByRole('dialog', {name:'Save changes?',exact:true}).waitFor({state:'detached'});
  check(await page.getByTestId('current-file').getAttribute('title') === fileA, 'Close Cancel lost the dirty session');
  await page.getByRole('button', {name:'Close a.md',exact:true}).click();
  await page.getByRole('dialog', {name:'Save changes?',exact:true}).getByRole('button', {name:'Save',exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'detached'}); await ready();
  check(await page.getByTestId('current-file').getAttribute('title') === fileB, 'Close Save did not select the neighbour');
  await openDocument(page, fileA); await ready();
  check((await editor.innerText()).includes('HTTP saved.'), 'Close Save did not persist through the real Host');
  await editor.locator('p').filter({hasText:'Alpha.'}).click(); await page.keyboard.press('End');
  await page.keyboard.insertText(' 한글 😀 �'); await save();
  await page.getByRole('button', {name:'File actions', exact:true}).click();
  await page.getByRole('menuitem', {name:'Reload', exact:true}).click(); await ready();
  check((await editor.innerText()).includes('HTTP saved.'), 'Root A Save survives Reload');
  check((await editor.innerText()).includes('한글 😀 �'), 'Valid Unicode survives repeated Save and Reload');
  await openDocument(page, fileB); await ready();
  check((await editor.innerText()).includes('Beta.'), 'Root B opens independently');
  await sidebar.getByRole('button', {name:'New folder', exact:true}).click();
  await page.getByRole('dialog', {name:'New folder', exact:true}).getByRole('textbox', {name:'New folder name'}).fill('created');
  await page.getByRole('dialog', {name:'New folder', exact:true}).getByRole('button', {name:'Create', exact:true}).click();
  await page.getByRole('dialog', {name:'New folder', exact:true}).waitFor({state:'detached'});
  await sidebar.getByRole('treeitem', {name:'created', exact:true}).waitFor();
  await sidebar.getByRole('button', {name:'New file in folder', exact:true}).click();
  await page.getByTestId('new-file-name').fill('fresh');
  await page.getByRole('dialog', {name:'New Markdown file'}).getByRole('button', {name:'Create', exact:true}).click();
  await ready(); await page.getByRole('dialog', {name:'New Markdown file'}).waitFor({state:'detached'});
  await editor.click(); await page.keyboard.type('Created over HTTP.');
  // Paste a genuine PNG file through the existing asset/insert path, without clipboard permissions.
  await editor.evaluate(async element => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 8;
    canvas.getContext('2d').fillRect(0, 0, 8, 8);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    const data = new DataTransfer(); data.items.add(new File([blob], 'pasted.png', {type:'image/png'}));
    element.dispatchEvent(new ClipboardEvent('paste', {clipboardData:data, bubbles:true, cancelable:true}));
  });
  await page.locator('[data-document-tab][data-active=true]').getByTestId('figure-image').waitFor();
  await page.waitForFunction(() => { const image = document.querySelector('[data-document-tab][data-active=true] [data-testid="figure-image"]'); return image?.complete && image.naturalWidth === 8; });
  await save(); await page.getByRole('button', {name:'File actions', exact:true}).click();
  await page.getByRole('menuitem', {name:'Reload', exact:true}).click(); await ready();
  await page.waitForFunction(() => { const image = document.querySelector('[data-document-tab][data-active=true] [data-testid="figure-image"]'); return image?.complete && image.naturalWidth === 8; });
  const fresh = await page.getByTestId('current-file').getAttribute('title');
  const disk = await (await page.request.get(`${origin}/api/document?path=${encodeURIComponent(fresh)}`)).json();
  check(disk.source.includes('Created over HTTP.') && disk.source.includes('./assets/image-'), 'Root B new file and portable image are on disk');
  const figure = page.locator('[data-document-tab][data-active=true] [data-block="figure"]');
  await figure.hover(); await figure.getByRole('button', {name:'Edit figure', exact:true}).click();
  await page.getByTestId('figure-caption').fill('Unapplied HTTP draft');
  await openDocument(page, fileA);
  await page.getByRole('tab', {name:'fresh.md, Unsaved changes',exact:true}).click();
  check(await page.getByTestId('figure-caption').inputValue() === 'Unapplied HTTP draft', 'Cross-root switching lost a property draft');
  check(await page.getByTestId('current-file').getAttribute('title') === fresh, 'Draft tab was replaced');
  await page.getByTestId('figure-cancel').click();
  await openDocument(page, fileA); await ready();
  // Another client commits using the same real API; the Editor's stale baseline must get 409.
  const loaded = await (await page.request.get(`${origin}/api/document?path=${encodeURIComponent(fileA)}`)).json();
  const external = await page.request.post(origin + '/api/document', { headers:{Origin:origin}, data:{
    path:fileA, revision:loaded.revision, base:{source:loaded.source}, paragraphs:[{path:[2], content:[{kind:'text', text:'Changed elsewhere.'}]}],
  } });
  check(external.status() === 200, 'Concurrent writer commits');
  await editor.locator('p').filter({hasText:'Alpha.'}).click(); await page.keyboard.press('End'); await page.keyboard.type(' Kept local.');
  await page.getByRole('button', {name:'Save', exact:true}).click();
  await page.locator('[data-testid="status"][data-operation="save-conflict"]').waitFor({state:'attached'});
  check((await editor.innerText()).includes('Kept local.'), '409 keeps local input');
  check((await (await page.request.get(`${origin}/api/document?path=${encodeURIComponent(fileA)}`)).json()).source.includes('Changed elsewhere.'), '409 preserves the other writer');
  await page.getByRole('button', {name:'File actions', exact:true}).click();
  await page.getByRole('menuitem', {name:'Reload', exact:true}).click();
  await page.getByRole('button', {name:'Discard and reload', exact:true}).click(); await ready();
  // The media CSP also works in a real browser when an SVG is opened as a document.
  const media = await page.context().newPage();
  try {
    await media.goto(`${origin}/document/unsafe.svg?path=${encodeURIComponent(fileA)}`);
    check(await media.evaluate(() => window.__ieumdocSVG) !== true, 'A directly opened SVG cannot execute with app authority');
  } finally { await media.close(); }
  // A narrow sidebar does not narrow the server's fixed Root union for declared resources.
  const bibFile = join(a, 'fixture', 'bibliography.md');
  await openDocument(page, bibFile); await ready();
  const refs = page.locator('[data-document-tab][data-active=true]').getByTestId('bibliography');
  const readBibDocument = async () => (await (await page.request.get(`${origin}/api/document?path=${encodeURIComponent(bibFile)}`)).json()).source;
  const bibSource = await readBibDocument(), bibHash = bibliographyFixture.hash();
  const expected = bibliographyFixture.report(bibSource, bibliographyFixture.read()).references.map(r => r.text);
  const actual = await refs.locator('li[data-key]').evaluateAll(rows => rows.map(row => `${row.querySelector('.bibliography-number').textContent} ${row.querySelector('div > span').textContent}`));
  check(JSON.stringify(actual) === JSON.stringify(expected), 'Production bundle and Node share bibliography output');
  await save();
  check(bibliographyFixture.hash() === bibHash && !(await readBibDocument()).includes('Control Study'), 'HTTP Save leaves bibliography unchanged and derived output absent');
  bibliographyFixture.change('updated');
  check((await refs.innerText()).includes('Control Study'), 'HTTP open snapshot remains stable');
  await reloadDocument(page); await ready();
  check((await refs.innerText()).includes('Updated Study'), 'HTTP Reload sees external bibliography changes');
  bibliographyFixture.change('restore');
  if (screenshots) await page.screenshot({path:'tmp/http-host-capture/saved-document.png'});
  return {twoRoots:true, sourceSaveReload:true, newFileAndFolder:true, imageSaveReload:true, draftProtection:true, realConflict:true, mediaSandbox:true};
}
