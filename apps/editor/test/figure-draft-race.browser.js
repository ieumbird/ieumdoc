// Focused Issue #21 regression. Prepare tmp/figure-authoring first with `pnpm browser:prepare`.
async (page, { openPath, expect, reloadDocument }) => {
  await page.reload();
  await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
  const origin = page.url().split('/').slice(0, 3).join('/');
  const defaultPath = (await (await page.request.get(`${origin}/api/document`)).json()).path;
  const separator = defaultPath.includes('\\') ? '\\' : '/';
  const root = defaultPath.split(separator).slice(0, -4).join(separator);
  const filePath = [root, 'tmp', 'figure-authoring', 'technical-document.md'].join(separator);
  const openScratch = async () => {
    await openPath(page, filePath);
  };
  const semantic = async () => {
    const response = await (await page.request.get(`${origin}/api/document?path=${encodeURIComponent(filePath)}`)).json();
    return response.document.blocks.filter(block => block.block === 'figure').map(block => ({
      label:block.label, imageUrl:block.imageUrl, imageAlt:block.imageAlt, caption:block.caption.text,
    }));
  };
  await openScratch();
  const initialCaption = (await semantic())[0].caption;
  const figure = page.locator('[data-document-tab][data-active=true] [data-block="figure"]').first();
  await figure.locator('img').click();
  await figure.getByRole('button', {name:'Edit figure'}).locator('..').hover({position:{x:4,y:4}});
  await figure.getByRole('button', {name:'Edit figure'}).click();
  await page.getByTestId('figure-editor').waitFor();
  await page.waitForFunction(() => document.activeElement?.getAttribute('data-testid') === 'figure-replace');
  const beforeSelectionMove = {
    selectedFigure: await page.locator('[data-document-tab][data-active=true] .ProseMirror-selectednode').count() === 1,
    formOpen: await page.getByTestId('figure-editor').count() === 1,
    activeField: await page.evaluate(() => document.activeElement?.getAttribute('data-testid')),
    alt: await page.getByTestId('figure-alt').inputValue(),
  };
  // Moving the editor selection off the NodeSelection is the problematic blur boundary.
  await page.locator('[data-document-tab][data-active=true] .document-editor').press('ArrowDown');
  const afterSelectionMove = {
    selectedFigure: await page.locator('[data-document-tab][data-active=true] .ProseMirror-selectednode').count() === 1,
    formOpen: await page.getByTestId('figure-editor').count() === 1,
    draftStatus: await page.locator('[data-document-tab][data-active=true]').getByTestId('figure-draft-status').count() === 1,
    focusedField: await page.evaluate(() => document.activeElement?.getAttribute('data-testid')),
  };
  if (afterSelectionMove.selectedFigure || !afterSelectionMove.formOpen) {
    throw new Error(`Figure form closed before draft activation: ${JSON.stringify({beforeSelectionMove, afterSelectionMove})}`);
  }

  const typedAlt = 'Alt text entered after Figure selection moved.';
  await page.getByTestId('figure-alt').fill(typedAlt);
  const draftActive = await page.locator('[data-document-tab][data-active=true]').getByTestId('figure-draft-status').isVisible() &&
    await page.getByTestId("draft-notice").isVisible();
  const altStayedInField = await page.getByTestId('figure-alt').inputValue() === typedAlt &&
    await figure.getByTestId('figure-image').getAttribute('alt') !== typedAlt;
  await page.getByTestId('figure-apply').click();
  await page.getByTestId('figure-editor').waitFor({state:'detached'});
  await page.getByRole('button', {name:'Save', exact:true}).click();
  await page.getByText('Saved', {exact:true}).filter({visible:true}).waitFor();
  await page.reload();
  await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
  await openScratch();
  const reloaded = await semantic();
  const saveReloadPreserved = reloaded.length === 1 && reloaded[0].label === 'fig-control' &&
    reloaded[0].imageUrl === './diagram.svg' && reloaded[0].imageAlt === typedAlt &&
    reloaded[0].caption === initialCaption;
  const result = {beforeSelectionMove, afterSelectionMove, draftActive, altStayedInField, saveReloadPreserved};
  if (afterSelectionMove.selectedFigure || !afterSelectionMove.formOpen || !draftActive || !altStayedInField || !saveReloadPreserved) {
    throw new Error(`Figure selection race regression failed: ${JSON.stringify(result)}`);
  }
  // Figure validation is local to the form: explicit tab close can discard its draft.
  // Observe the real React NodeView rather than a fake lifetime token. Deleting only the Figure
  // also matters: its editor remains alive, so an editor-destroyed check alone is insufficient.
  for (const leave of ['close', 'delete']) {
    await openScratch();
    await page.locator('[data-document-tab][data-active=true] .document-editor').evaluate(el => {
      const editor = el.editor;
      const view = editor.view;
      const probe = window.figureLifetime = {editor, destroyed: 0, latePositionReads: 0, lateDispatches: 0};
      const factory = view.props.nodeViews.figure;
      view.setProps({nodeViews: {...view.props.nodeViews, figure: (...args) => {
        const nodeView = factory(...args);
        let destroyed = false;
        const getPos = nodeView.getPos.bind(nodeView);
        nodeView.getPos = () => { if (destroyed) probe.latePositionReads++; return getPos(); };
        const destroy = nodeView.destroy.bind(nodeView);
        nodeView.destroy = () => { destroy(); destroyed = true; probe.destroyed++; };
        return nodeView;
      }}});
      const dispatch = view.dispatch.bind(view);
      view.dispatch = transaction => { if (view.isDestroyed) probe.lateDispatches++; dispatch(transaction); };
    });
    const edit = page.locator('[data-document-tab][data-active=true] [data-block="figure"]').first().getByRole('button', {name:'Edit figure'});
    await edit.locator('..').hover({position:{x:4,y:4}});
    await edit.click();
    await page.getByTestId('figure-alt').fill(`Late validation after ${leave}`);
    let release, requested;
    const gate = new Promise(resolve => { release = resolve; });
    const started = new Promise(resolve => { requested = resolve; });
    await page.route('**/api/figure-validation', async route => {
      requested();
      await gate;
      await route.continue();
    });
    try {
      await page.getByTestId('figure-apply').click();
      await started;
      if (!await page.getByTestId('draft-notice').isVisible()) throw new Error('Validation lost the draft guard');
      if (leave === 'delete') {
        await page.locator('[data-document-tab][data-active=true] .document-editor').evaluate(el => {
          const {state, view} = el.editor;
          let position;
          state.doc.forEach((node, offset) => { if (node.type.name === 'figure') position = offset; });
          view.dispatch(state.tr.delete(position, position + state.doc.nodeAt(position).nodeSize));
        });
      } else {
        const currentTab = page.getByRole('tab', {selected:true});
        await currentTab.focus();
        await page.keyboard.press('Delete');
        const confirmation = page.getByRole('dialog', {name:'Save changes?', exact:true});
        await confirmation.getByText(/Unapplied property drafts will be lost/).waitFor();
        await confirmation.getByRole('button', {name:"Don't save", exact:true}).click();
        await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
      }
      await page.waitForFunction(() => window.figureLifetime.destroyed > 0);
      await page.getByTestId('figure-editor').waitFor({state:'detached'});
      const before = await page.locator('[data-document-tab][data-active=true] .document-editor').evaluate(el => JSON.stringify(el.editor.getJSON()));
      // Teardown itself may notify position subscribers; count only the late response below.
      await page.evaluate(() => { window.figureLifetime.latePositionReads = 0; window.figureLifetime.lateDispatches = 0; });
      const response = page.waitForResponse('**/api/figure-validation');
      release();
      await (await response).finished();
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const probe = await page.evaluate(() => {
        const {editor, ...counts} = window.figureLifetime;
        return {...counts, editorDestroyed: editor.isDestroyed};
      });
      const after = await page.locator('[data-document-tab][data-active=true] .document-editor').evaluate(el => JSON.stringify(el.editor.getJSON()));
      if (probe.latePositionReads || probe.lateDispatches || before !== after || probe.editorDestroyed !== (leave !== 'delete')) {
        throw new Error(`Late Figure validation after ${leave}: ${JSON.stringify(probe)}`);
      }
      result[`validationIgnoredAfter${leave}`] = true;
    } finally {
      release();
      await page.unroute('**/api/figure-validation');
    }
    // Deletion was an applied edit; Reload discards it before the next scenario ends.
    if (leave === 'delete') {
      await page.getByRole('button', {name:'File actions', exact:true}).click();
      await page.getByRole('menuitem', {name:'Reload', exact:true}).click();
      await page.getByRole('button', {name:'Discard and reload', exact:true}).click();
      await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
    }
  }
  // A retained hidden session still owns a successful validation, but never B's focus or content.
  await openScratch();
  const ownerId = await page.getByRole('tab', {selected:true}).getAttribute('id');
  const otherTab = page.getByRole('tab').and(page.locator(`:not([id="${ownerId}"])`));
  await page.locator('[data-document-tab][data-active=true] .document-editor').evaluate(n => { window.hiddenFigureEditor = n.editor; });
  await figure.hover(); await figure.getByRole('button', {name:'Edit figure'}).click();
  await page.getByTestId('figure-alt').fill('Applied in hidden owner');
  let releaseHidden, requestHidden;
  const gateHidden = new Promise(resolve => { releaseHidden = resolve; });
  const startedHidden = new Promise(resolve => { requestHidden = resolve; });
  await page.route('**/api/figure-validation', async route => { requestHidden(); await gateHidden; await route.continue(); });
  try {
    await page.getByTestId('figure-apply').click(); await startedHidden;
    await otherTab.click();
    const active = page.locator('[data-document-tab][data-active=true] .document-editor');
    const before = await active.evaluate(n => JSON.stringify(n.editor.getJSON()));
    const focusedTab = await page.evaluate(() => document.activeElement?.id);
    const response = page.waitForResponse('**/api/figure-validation');
    releaseHidden(); await (await response).finished();
    await page.waitForFunction(() => window.hiddenFigureEditor.state.doc.content.content.some(n => n.attrs.imageAlt === 'Applied in hidden owner'));
    if (await active.evaluate(n => JSON.stringify(n.editor.getJSON())) !== before ||
        await page.evaluate(() => document.activeElement?.id) !== focusedTab ||
        await page.getByTestId('figure-editor').count() !== 0) throw new Error('Hidden Figure completion changed the active tab or stole focus');
    await page.locator(`#${ownerId}`).click();
    if (await figure.locator('img').getAttribute('alt') !== 'Applied in hidden owner') throw new Error('Figure completion was lost by its retained owner');
    result.hiddenValidationRetainsOwnerAndFocus = true;
  } finally { releaseHidden(); await page.unroute('**/api/figure-validation'); }
  // #760: focus from properties must not re-disable the native typing surface
  // between mousedown and the browser placing its caret. Use one physical click,
  // then immediate input at an interior text offset, with no polling or focus fixup.
  const pointerFile = [root, 'tmp', 'figure-authoring', 'pointer.md'].join(separator);
  await openPath(page, pointerFile);
  await page.setViewportSize({width:1440,height:1200});
  const active = page.locator('[data-document-tab][data-active=true]');
  const engine = active.locator('.document-editor');
  const prose = engine.locator('p.paragraph').filter({hasText:'target paragraph.'});
  const snapshot = () => engine.evaluate(el => el.editor.getJSON());
  const image = active.locator('figure:not([data-content-kind="mermaid"])');
  const diagram = active.locator('[data-content-kind="mermaid"]');
  const equation = active.locator('[data-block="equation"]');
  const table = active.locator('[data-block="table"]');
  const note = active.getByTestId('footnote-definition');
  result.pointerCases = [];
  for (const kind of ['image', 'mermaid', 'equation', 'table', 'endnote']) {
    const before = await snapshot();
    const beforeText = await prose.textContent();
    const prefix = kind === 'image' ? 'figure' : 'mermaid-property';
    let release, started;
    const gate = new Promise(resolve => { release = resolve; });
    const requested = new Promise(resolve => { started = resolve; });
    const hold = async route => { started(); await gate; await route.continue(); };
    if (kind === 'image' || kind === 'mermaid') {
      await (kind === 'image' ? image.getByTestId('figure-image') : diagram.getByTestId('mermaid-preview')).dblclick();
      await page.getByTestId(`${prefix}-label`).fill(`pointer-${kind}`);
      await page.route('**/api/figure-validation', hold);
    } else if (kind === 'equation') {
      await equation.getByTestId('equation-preview').dblclick();
      await page.getByTestId('equation-latex').fill('x=2');
    } else if (kind === 'table') {
      await table.hover(); await table.getByRole('button', {name:'Edit table',exact:true}).click();
      await page.getByTestId('table-label').fill('pointer-table');
    } else {
      await note.hover(); await note.getByTestId('endnote-edit').click();
    }
    try {
      await prose.scrollIntoViewIfNeeded();
      const point = await prose.evaluate(el => {
        const text = el.firstChild, range = document.createRange();
        range.setStart(text, 7); range.setEnd(text, 8);
        const rect = range.getBoundingClientRect();
        return {x:rect.left, y:rect.top+rect.height/2, pos:el.closest('.document-editor').editor.view.posAtDOM(text,7)};
      });
      expect(await prose.evaluate((el,p) => el.contains(document.elementFromPoint(p.x,p.y)),point), `${kind}: click must hit the prose, clear of its overlay`).toBe(true);
      await page.mouse.click(point.x, point.y);
      const caret = await engine.evaluate(el => ({selection:el.editor.state.selection.toJSON(),focus:el.editor.view.hasFocus()}));
      expect(caret, `${kind}: first click must place the exact interior caret`).toEqual({selection:{type:'text',anchor:point.pos,head:point.pos},focus:true});
      const typed = `Typed${kind}`;
      await page.keyboard.type(typed);
      expect(await prose.textContent()).toBe(beforeText.slice(0,7)+typed+beforeText.slice(7));
      if (kind === 'image' || kind === 'mermaid') {
        await requested;
        release();
        await page.getByTestId(`${prefix}-editor`).waitFor({state:'detached'});
        await page.unroute('**/api/figure-validation', hold);
        const after = await snapshot();
        // Metadata applies after the input; each remains its own Undo step.
        await page.keyboard.press('ControlOrMeta+z');
        expect(await prose.textContent()).toContain(typed);
        await page.keyboard.press('ControlOrMeta+z');
        expect(await snapshot()).toEqual(before);
        await page.keyboard.press('ControlOrMeta+Shift+z');
        await page.keyboard.press('ControlOrMeta+Shift+z');
        expect(await snapshot()).toEqual(after);
      } else if (kind !== 'endnote') {
        // These explicit forms retain their draft on outside interaction.
        expect(await page.getByTestId(`${kind}-editor`).count()).toBe(1);
        await page.getByTestId(`${kind}-cancel`).click();
      } else expect(await note.getAttribute('aria-readonly')).toBe('true');
      result.pointerCases.push(kind);
    } finally { release(); await page.unroute('**/api/figure-validation', hold); }
  }
  const final = await snapshot();
  const saved = page.waitForResponse(r => r.request().method() === 'POST' && /\/api\/document(?:\?|$)/.test(r.url()));
  await page.getByTestId('save').click(); expect((await saved).status()).toBe(200);
  await reloadDocument(page);
  expect(await snapshot()).toEqual(final);
  result.pointerSaveReload = true;
  return result;
}
