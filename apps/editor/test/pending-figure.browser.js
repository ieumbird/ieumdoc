// Real user session regression: empty → pending with caption/label → image → pending,
// including Source, native history and edits made during a real-file Save.
async (page, { openPath }) => {
  await page.unrouteAll();
  await page.reload();
  const ready = () => page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
  await ready();
  const origin = page.url().split('/').slice(0, 3).join('/');
  const defaultPath = (await (await page.request.get(`${origin}/api/document`)).json()).path;
  const separator = defaultPath.includes('\\') ? '\\' : '/';
  const root = defaultPath.split(separator).slice(0, -4).join(separator);
  const file = [root, 'tmp', 'pending-figure', 'pending.md'].join(separator);
  const read = async () => {
    const response = await page.request.get(`${origin}/document/pending.md?path=${encodeURIComponent(file)}`);
    if (response.status() !== 200) throw Error(`Prepare ${file} first`);
    return (await response.text()).replaceAll('\r\n', '\n');
  };
  const model = async () => (await (await page.request.get(`${origin}/api/document?path=${encodeURIComponent(file)}`)).json()).document;
  const diskFigures = async () => (await model()).blocks.filter(block => block.block === 'figure');
  const open = async () => {
    await page.reload();
    await ready();
    await openPath(page, file);
  };
  const save = async () => {
    await page.getByTestId('save').click();
    await page.locator('[data-testid="status"][data-operation^="saved"]').waitFor({state:'attached'});
  };
  const source = async () => {
    await page.getByTestId('view-source').click();
    await page.locator('[data-document-tab][data-active=true]').getByTestId('source-view').waitFor();
    const value = await page.locator('[data-document-tab][data-active=true]').getByTestId('source-view').locator('pre').textContent();
    await page.getByTestId('view-visual').click();
    await page.locator('[data-document-tab][data-active=true]').getByTestId('document-editor').waitFor();
    return value;
  };
  const figures = page.locator('[data-document-tab][data-active=true] [data-block="figure"]');
  const reference = page.locator('[data-testid="cross-reference"][data-label="fig-pfc-control"]').first();
  const form = page.getByTestId('figure-editor');
  const edit = async figure => {
    const action = figure.getByRole('button', {name:'Edit figure'});
    await action.locator('..').hover({position:{x:4,y:4}});
    await action.click();
    await form.waitFor();
  };
  const apply = async () => {
    await page.getByTestId('figure-apply').click();
    await form.waitFor({state:'detached'});
  };
  const historyKey = async key => {
    await page.locator('[data-document-tab][data-active=true] .document-editor').evaluate(element => element.editor.view.focus());
    await page.keyboard.press(key);
  };
  const insert = async () => {
    await page.getByText('Intro.', {exact:true}).filter({visible:true}).hover();
    await page.getByRole('button', {name:/Insert block after paragraph block/}).first().click();
    await page.getByRole('menuitem', {name:'Paragraph', exact:true}).click();
    await page.keyboard.type('/figure');
    await page.getByRole('menuitem', {name:'Figure', exact:true}).click();
  };
  const check = (ok, message) => { if (!ok) throw Error(message); };
  let release = () => {};
  try {
    await open();
    // An inserted Figure is a document block at once: no form opens, the caret is in its caption.
    await insert();
    check(await figures.count() === 1 && await form.count() === 0, 'Figure insertion opened its form');
    check(await page.locator('[data-document-tab][data-active=true] .document-editor').evaluate(element => element.editor.state.selection.$from.parent.type.name) === 'figure',
      'Figure insertion did not place the caret in its caption');
    check(await figures.first().getByTestId('figure-no-content').innerText() === 'No content yet', 'Empty state is invisible');
    check(await page.getByTestId('status').innerText() === 'Unsaved changes', 'Insertion did not mark the Figure dirty');
    check((await source()).includes(':::{figure}\n:::'), 'Empty Figure omitted from Source');
    await save();
    let empty = (await diskFigures())[0];
    check(empty?.contentKind === 'none' && empty.label === '' && empty.caption.text === '' &&
      await page.getByTestId('status').innerText() === 'Saved', 'Empty Figure was not saved or acknowledged');

    await edit(figures.first());
    await page.getByTestId('figure-label').fill('fig-pfc-control');
    await page.getByTestId('figure-caption').fill('PFC Current Control Architecture');
    await apply();
    check(await figures.first().getByTestId('figure-no-content').innerText() === 'No content yet', 'Pending state is invisible');
    check((await source()).includes(':name: fig-pfc-control'), 'Applied pending Figure omitted from Source');
    check(await page.getByTestId('status').innerText() === 'Unsaved changes', 'Apply did not mark the Figure dirty');
    await save();
    check((await diskFigures())[0]?.label === 'fig-pfc-control' &&
      await page.getByTestId('status').innerText() === 'Saved', 'Applied Figure was omitted or not acknowledged');

    // Save must preserve history. Undo a previously saved Apply, save the empty Figure
    // against the opening snapshot/savedEdits checkpoint, then redo and save again.
    await historyKey('ControlOrMeta+z');
    check(!(await source()).includes(':name: fig-pfc-control'), 'Undo of Apply kept the label');
    check(await reference.getAttribute('data-resolved') === 'false', 'Undone target still resolves');
    check(await page.getByTestId('status').innerText() === 'Unsaved changes', 'Undo of saved Apply did not become dirty');
    await save();
    empty = (await diskFigures())[0];
    check(empty?.label === '' && empty.caption.text === '' && await page.getByTestId('status').innerText() === 'Saved',
      'Undo of Apply did not save the empty Figure');
    await historyKey('ControlOrMeta+Shift+z');
    check((await source()).includes(':name: fig-pfc-control'), 'Redo of Apply lost the Figure');
    check(await page.getByTestId('status').innerText() === 'Unsaved changes', 'Redo after Save did not become dirty');
    check(await form.count() === 0, 'Undo or Redo opened the Figure form');
    await save();
    check((await diskFigures())[0]?.label === 'fig-pfc-control' &&
      await page.getByTestId('status').innerText() === 'Saved', 'Redo/Save failed to restore the Figure');
    await open();
    check(await figures.count() === 1 && (await diskFigures())[0]?.caption.text === 'PFC Current Control Architecture',
      'Save/Undo/Save/Redo/Save/Reload lost the applied Figure');

    // The slash picker must resolve the persisted pending target.
    await page.getByText('After.', {exact:true}).filter({visible:true}).click();
    await page.keyboard.press('End');
    await page.keyboard.type(' /fig');
    await page.getByRole('menuitem', {name:'Figure\u00a01 · PFC Current Control Architecture', exact:true}).click();
    const referenceState = {resolved:await reference.getAttribute('data-resolved'), text:await reference.locator('.cross-reference-chip').innerText()};
    check(referenceState.resolved === 'true' && referenceState.text === 'Figure\u00a01',
      `Pending target is not numbered/resolved: ${JSON.stringify(referenceState)}`);
    await save();
    await open();
    let pending = (await diskFigures())[0];
    const position = pending.path;
    check(pending.contentKind === 'none' && pending.label === 'fig-pfc-control' &&
      pending.caption.text === 'PFC Current Control Architecture' && await figures.count() === 1,
      'Applied pending Figure lost on Reload');
    check((await read()).includes('[Figure](#fig-pfc-control)') && await reference.getAttribute('data-resolved') === 'true',
      'Reload lost the link or numbered reference');
    await figures.first().getByTestId('figure-no-content').click();
    check(await page.getByTestId('figure-properties').count() === 0 && await figures.first().getAttribute('data-selected') === 'true',
      'Pending Figure selection opened properties');

    // Real file Save held in flight; a second Apply remains unsaved after acknowledgement.
    let posted;
    const requested = new Promise(resolve => { posted = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    let held = false;
    await page.route('**/api/document**', async route => {
      if (route.request().method() !== 'POST' || held) return route.continue();
      held = true;
      posted();
      await gate;
      return route.continue();
    });
    await page.getByTestId('save').click();
    await requested;
    await edit(figures.first());
    await page.getByTestId('figure-image-url').fill('./diagram.svg');
    await page.getByTestId('figure-alt').fill('PFC current control diagram');
    await apply();
    release();
    await page.locator('[data-testid="status"][data-operation^="saved"]').waitFor({state:'attached'});
    check(await page.getByTestId('status').innerText() === 'Unsaved changes' &&
      (await diskFigures())[0].contentKind === 'none', 'Late image Apply was lost or wrongly acknowledged');
    await page.unroute('**/api/document**');
    await save();
    await open();
    const image = (await diskFigures())[0];
    check(image.contentKind === 'image' && image.imageUrl === './diagram.svg' && image.imageAlt === 'PFC current control diagram' &&
      image.label === pending.label && image.caption.text === pending.caption.text && JSON.stringify(image.path) === JSON.stringify(position),
      'Connecting the image changed Figure identity, caption or position');
    await page.waitForFunction(() => {
      const image = document.querySelector('[data-document-tab][data-active=true] [data-testid="figure-image"]');
      return image?.complete && image.naturalWidth > 0;
    });
    check(await reference.getAttribute('data-resolved') === 'true' &&
      await figures.first().locator('figcaption').getAttribute('data-number') === 'Figure 1', 'Image connection lost numbering/reference');

    await edit(figures.first());
    await page.getByTestId('figure-image-url').fill('');
    await page.getByTestId('figure-alt').fill('');
    await apply();
    await save();
    await open();
    pending = (await diskFigures())[0];
    check(pending.contentKind === 'none' && pending.label === image.label && pending.caption.text === image.caption.text,
      'Removing the image lost the pending Figure');

    // User deletion and native Undo restore the pending Figure and both references.
    await figures.first().hover({position:{x:4,y:4}});
    await page.getByRole('button', {name:/Move figure block/}).click();
    await page.getByRole('menu', {name:'Block actions'}).getByRole('menuitem', {name:'Delete', exact:true}).click();
    check(await figures.count() === 0, 'Figure deletion failed');
    await save();
    check((await diskFigures()).length === 0 && await reference.getAttribute('data-resolved') === 'false' &&
      await page.getByTestId('status').innerText() === 'Saved', 'Saved deletion left a Figure or resolved reference');
    await historyKey('ControlOrMeta+z');
    check(await figures.count() === 1 && await figures.first().getByTestId('figure-no-content').count() === 1,
      'Undo did not restore pending Figure');
    check(await page.getByTestId('status').innerText() === 'Unsaved changes', 'Undo of saved deletion did not become dirty');
    await save();
    check((await diskFigures())[0]?.label === 'fig-pfc-control', 'Undo/Save did not restore the opening-snapshot Figure');
    await historyKey('ControlOrMeta+Shift+z');
    await save();
    check((await diskFigures()).length === 0, 'Redo/Save did not delete the opening-snapshot Figure');
    await historyKey('ControlOrMeta+z');
    await save();
    await open();
    check((await diskFigures())[0].label === 'fig-pfc-control' && await reference.getAttribute('data-resolved') === 'true',
      'Undo/Save/Reload lost pending attributes or reference');

    // A caption typed at the inserted caret and a label-only Apply persist, as does an untouched insert.
    await insert();
    await page.keyboard.type('Caption only');
    await insert();
    await edit(figures.first());
    await page.getByTestId('figure-label').fill('fig-label-only');
    await apply();
    await insert();
    await save();
    await open();
    const final = await diskFigures();
    check(final.length === 4 && final.some(f => f.label === 'fig-label-only' && f.caption.text === '') &&
      final.some(f => f.label === '' && f.caption.text === 'Caption only') &&
      final.some(f => f.label === '' && f.caption.text === '' && f.contentKind === 'none'),
      'Typed caption, label-only Apply or empty Figure did not persist');
    return {emptySaved:true, pendingReloaded:true, historyPayload:true, referencesPreserved:true,
      lateApplyRetained:true, imageConnectedAndRemoved:true, deletionUndone:true, captionLabelAndEmpty:true};
  } finally {
    release();
    await page.unroute('**/api/document**');
  }
}
