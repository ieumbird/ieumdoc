// Real user session regression: transient → applied pending → image → pending,
// including Source, native history and edits made during a real-file Save.
async page => {
  await page.unrouteAll();
  await page.reload();
  const ready = () => page.locator('[data-testid="status"][data-operation="Ready"]').waitFor({state:'attached'});
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
    await page.getByRole('button', {name:'Open file…'}).click();
    await page.getByTestId('file-path').fill(file);
    await page.getByRole('dialog').getByRole('button', {name:'Open', exact:true}).click();
    await ready();
  };
  const save = async () => {
    await page.getByTestId('save').click();
    await page.locator('[data-testid="status"][data-operation^="Saved"]').waitFor({state:'attached'});
  };
  const source = async () => {
    await page.getByTestId('view-source').click();
    await page.getByTestId('source-view').waitFor();
    const value = await page.getByTestId('source-view').locator('pre').textContent();
    await page.getByTestId('view-visual').click();
    await page.getByTestId('document-editor').waitFor();
    return value;
  };
  const figures = page.locator('[data-block="figure"]');
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
    await page.locator('.document-editor').evaluate(element => element.editor.view.focus());
    await page.keyboard.press(key);
  };
  const insert = async () => {
    await page.getByText('Intro.', {exact:true}).hover();
    await page.getByRole('button', {name:/Insert block after paragraph block/}).first().click();
    await page.getByRole('menuitem', {name:'Paragraph', exact:true}).click();
    await page.keyboard.type('/figure');
    await page.getByRole('menuitem', {name:'Figure', exact:true}).click();
    await form.waitFor();
  };
  const check = (ok, message) => { if (!ok) throw Error(message); };
  let release = () => {};
  try {
    await open();
    await insert();
    await page.getByTestId('figure-apply').click();
    await form.getByText('A Figure needs an image, a caption or a label.').waitFor();
    await page.getByTestId('figure-label').fill('fig-pfc-control');
    await page.getByTestId('figure-caption').fill('PFC Current Control Architecture');
    check(!(await source()).includes(':::{figure}'), 'Transient Figure entered Source');
    await save();
    check((await diskFigures()).length === 0 && await figures.count() === 1,
      'Saving a transient Figure wrote it or removed the session draft');
    check(await page.getByTestId('figure-caption').inputValue() === 'PFC Current Control Architecture',
      'Save or Source discarded the draft fields');
    await apply();
    check(await figures.first().getByTestId('figure-no-content').innerText() === 'No content yet', 'Pending state is invisible');
    check((await source()).includes(':name: fig-pfc-control'), 'Applied pending Figure omitted from Source');

    // Native Undo/Redo restores the explicit Apply state, including what the real Save writes.
    await historyKey('ControlOrMeta+z');
    check(!(await source()).includes(':::{figure}'), 'Undo of Apply still serializes the Figure');
    await save();
    check((await diskFigures()).length === 0, 'Undo of Apply left a Figure on disk');
    await historyKey('ControlOrMeta+Shift+z');
    check((await source()).includes(':name: fig-pfc-control'), 'Redo of Apply lost the Figure');
    // Undo selected the transient node and reopened its form. Redo restores the applied
    // document; Cancel dismisses any still-open form without removing that Figure.
    if (await form.isVisible()) await page.getByTestId('figure-cancel').click();

    // The slash picker must see the new pending target before it is saved.
    await page.getByText('After.', {exact:true}).click();
    await page.keyboard.press('End');
    await page.keyboard.type(' /fig');
    await page.getByRole('menuitem', {name:'Figure reference: fig-pfc-control', exact:true}).click();
    const reference = page.locator('[data-testid="cross-reference"][data-label="fig-pfc-control"]');
    const referenceState = {resolved:await reference.getAttribute('data-resolved'), text:await reference.locator('.cross-reference-chip').innerText()};
    check(referenceState.resolved === 'true' && referenceState.text === 'Fig. 1',
      `Pending target is not numbered/resolved: ${JSON.stringify(referenceState)}`);
    await save();
    await open();
    let pending = (await diskFigures())[0];
    const position = pending.path;
    check(pending.contentKind === 'none' && pending.label === 'fig-pfc-control' &&
      pending.caption.text === 'PFC Current Control Architecture' && await figures.count() === 1,
      'Applied pending Figure lost on Reload');
    check((await read()).includes('[](#fig-pfc-control)') && await reference.getAttribute('data-resolved') === 'true',
      'Reload lost the link or numbered reference');
    await figures.first().getByTestId('figure-no-content').click();
    await page.getByTestId('figure-properties').waitFor();

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
    await page.locator('[data-testid="status"][data-operation^="Saved"]').waitFor({state:'attached'});
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
      const image = document.querySelector('[data-testid="figure-image"]');
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
    await historyKey('ControlOrMeta+z');
    check(await figures.count() === 1 && await figures.first().getByTestId('figure-no-content').count() === 1,
      'Undo did not restore pending Figure');
    await save();
    await open();
    check((await diskFigures())[0].label === 'fig-pfc-control' && await reference.getAttribute('data-resolved') === 'true',
      'Undo/Save/Reload lost pending attributes or reference');

    // The actual form supports label-only and caption-only Apply, then persists both.
    for (const [label, caption] of [['fig-label-only', ''], ['', 'Caption only']]) {
      await insert();
      await page.getByTestId('figure-label').fill(label);
      await page.getByTestId('figure-caption').fill(caption);
      await apply();
    }
    await save();
    await open();
    const final = await diskFigures();
    check(final.some(f => f.label === 'fig-label-only' && f.caption.text === '') &&
      final.some(f => f.label === '' && f.caption.text === 'Caption only'), 'Label-only or caption-only Apply did not persist');
    return {transientExcluded:true, pendingReloaded:true, historyPayload:true, referencesPreserved:true,
      lateApplyRetained:true, imageConnectedAndRemoved:true, deletionUndone:true, labelAndCaptionOnly:true};
  } finally {
    release();
    await page.unroute('**/api/document**');
  }
}
