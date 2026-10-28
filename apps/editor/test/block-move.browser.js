// Run with pnpm browser:test block-move (prepare is automatic).
// Drags real block handles in a scratch copy of technical-document.md: while dragging, the moved
// block is tinted and one line marks the gap it will land in (none where it would stay in place);
// a moved Equation or Figure is not opened for editing; undo/redo keep that; and a block with an
// unapplied draft cannot be moved, so the draft is not lost. Menu moves use the same path,
// with boundary protection, one-step Undo and Save/Reload. Scratch files live
// under the repository's ignored tmp/ directory.
async (page, { openPath, withBlockHover }) => {
  await page.unrouteAll();
  // The whole document fits, so nothing scrolls under the pointer mid-drag.
  await page.setViewportSize({width: 1280, height: 1600});
  await page.reload();
  await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});

  const origin = page.url().split('/').slice(0, 3).join('/');
  const defaultPath = (await (await page.request.get(`${origin}/api/document`)).json()).path;
  const separator = defaultPath.includes('\\') ? '\\' : '/';
  const root = defaultPath.split(separator).slice(0, -4).join(separator);
  const file = [root, 'tmp', 'block-move', 'technical-document.md'].join(separator);
  const read = async () => {
    const response = await page.request.get(`${origin}/document/technical-document.md?path=${encodeURIComponent(file)}`);
    if (response.status() !== 200) throw new Error(`Prepare ${file} first`);
    return (await response.body()).toString('utf8');
  };
  const before = await read();
  if (!before.includes('```{math}') || !before.includes(':::{figure}')) throw new Error('Scratch document is not a fresh technical-document.md copy');

  // Delay the opening frame, as a busy renderer can, while a user opens another surface.
  // Release the real callbacks only after the menu owns focus; inspect immediately afterwards.
  for (const [folder, document, blockSelector, editName, fieldId, cancelId, draft] of [
    ['block-move', 'draft-boundaries.md', '[data-block="equation"]', 'Edit', 'equation-latex', 'equation-cancel', 'x + DeferredFocusDraft'],
    ['mermaid-authoring', 'diagram.md', '[data-block="figure"]', 'Edit figure', 'mermaid-source', 'mermaid-cancel', 'graph TD\n  Draft --> Preserved'],
    ['block-move', 'technical-document.md', '[data-block="figure"]', 'Edit figure', 'figure-image-url', 'figure-cancel', 'draft-image.svg'],
  ]) {
    await openPath(page, [root, 'tmp', folder, document].join(separator));
    await page.getByRole('dialog').waitFor({state:'detached'});
    const block = page.locator(`[data-document-tab][data-active=true] ${blockSelector}`).first();
    await block.hover();
    await page.evaluate(() => {
      const native = window.requestAnimationFrame;
      const cancel = window.cancelAnimationFrame;
      const callbacks = new Map();
      window.requestAnimationFrame = callback => {
        const id = native.call(window, () => {});
        callbacks.set(id, callback);
        return id;
      };
      window.cancelAnimationFrame = id => {
        callbacks.delete(id);
        cancel.call(window, id);
      };
      window.releaseOpeningFrames = () => {
        window.requestAnimationFrame = native;
        window.cancelAnimationFrame = cancel;
        delete window.releaseOpeningFrames;
        callbacks.forEach(callback => callback(performance.now()));
        return callbacks.size;
      };
    });
    try {
      await block.getByRole('button', {name:editName, exact:true}).click();
      await page.getByTestId(fieldId).fill(draft);
      await page.getByRole('button', {name: /^Move (equation|figure) block/}).first().click();
      const menu = page.getByRole('menu', {name:'Block actions', exact:true});
      await page.waitForFunction(() => document.querySelector('[role="menu"][aria-label="Block actions"]')?.contains(document.activeElement));
      if (!await page.evaluate(() => window.releaseOpeningFrames())) throw new Error('Opening frame was not held');
      if (!await menu.evaluate(node => node.contains(document.activeElement))) throw new Error(`${fieldId} stole menu focus after its delayed opening frame`);
      await page.keyboard.press('Escape');
      if (await menu.count() || await page.getByTestId(fieldId).inputValue() !== draft) throw new Error('Menu Escape discarded the property draft');
      await page.getByTestId(cancelId).click();
    } finally {
      await page.evaluate(() => window.releaseOpeningFrames?.());
    }
  }

  await openPath(page, file);
  await page.getByRole('dialog').waitFor({state:'detached'});

  const editor = page.locator('[data-document-tab][data-active=true] .document-editor');
  const order = () => editor.evaluate(node => { const names = []; node.editor.state.doc.forEach(child => names.push(child.type.name)); return names.join(' '); });
  const equation = page.locator('[data-document-tab][data-active=true] [data-block="equation"]');
  const figure = page.locator('[data-document-tab][data-active=true] [data-block="figure"]');
  const target = page.getByRole('heading', {name:'Control Structure', exact:true});
  const line = page.getByTestId('block-drop-line');
  const tint = page.getByTestId('block-drag-source');
  const middle = box => box.y + box.height / 2;
  const grab = async (block, name) => {
    await block.hover({position:{x:4, y:4}});
    const handle = await page.getByRole('button', {name}).boundingBox();
    await page.mouse.move(handle.x + handle.width / 2, middle(handle));
    await page.mouse.down();
  };
  // Browsers repeat dragover while the pointer rests; the emulated drag does not, and the page only
  // renders the last one when the next arrives. A second, 1px move stands in for that repeat.
  const pointAt = async y => {
    await page.mouse.move(700, y, {steps:5});
    await page.mouse.move(701, y);
  };
  const original = await order();
  const result = {};
  const openBlockMenu = async (index, label = 'Block actions') => {
    const handle = page.locator('[data-document-tab][data-active=true] .block-handle').nth(index);
    await handle.focus();
    await page.keyboard.press('Enter');
    const menu = page.getByRole('menu', {name:label, exact:true});
    await menu.and(page.locator(':focus-within')).waitFor();
    return menu;
  };
  const titleMenu = await openBlockMenu(0);
  for (const name of ['Move up', 'Move down']) {
    const item = titleMenu.getByRole('menuitem', {name, exact:true});
    if (!await item.count() || !await item.isDisabled()) throw new Error(`Title menu must disable ${name}`);
  }
  await page.keyboard.press('Escape');
  const firstBody = await openBlockMenu(1);
  if (!await firstBody.getByRole('menuitem', {name:'Move up', exact:true}).isDisabled()) throw new Error('Nothing moves above the title');
  const boundaryReason = async item => ({ tooltip: await item.getAttribute('title'), description: await item.getAttribute('aria-description') });
  const firstReason = await boundaryReason(firstBody.getByRole('menuitem', {name:'Move up', exact:true}));
  await page.keyboard.press('Escape');
  const lastIndex = await editor.evaluate(node => node.editor.state.doc.childCount - 1);
  const lastMenu = await openBlockMenu(lastIndex);
  if (!await lastMenu.getByRole('menuitem', {name:'Move down', exact:true}).isDisabled()) throw new Error('Last block cannot move down');
  const lastReason = await boundaryReason(lastMenu.getByRole('menuitem', {name:'Move down', exact:true}));
  if (firstReason.tooltip !== 'There is no body block above this one.' || firstReason.description !== firstReason.tooltip ||
      lastReason.tooltip !== 'There is no body block below this one.' || lastReason.description !== lastReason.tooltip) {
    throw new Error(`Boundary moves need direction-specific tooltip and accessible reasons: ${JSON.stringify({firstReason, lastReason})}`);
  }
  // Keyboard arrows skip disabled rows but retain the menu role/focus owner.
  await page.keyboard.press('ArrowDown');
  if (!await lastMenu.evaluate(menu => menu.contains(document.activeElement) && !document.activeElement.disabled)) throw new Error('Menu navigation focused a disabled action');
  await page.keyboard.press('Escape');
  // The same disabled reasons are available in Korean without changing document state.
  await page.getByRole('button', {name:'Settings', exact:true}).click();
  await page.getByTestId('ui-language').selectOption('ko');
  await page.keyboard.press('Escape');
  await page.getByTestId('settings-dialog').waitFor({state:'detached'});
  for (const [index, name, expected] of [[1, '위로 이동', '위로 이동할 본문 블록이 없습니다.'],
    [lastIndex, '아래로 이동', '아래로 이동할 본문 블록이 없습니다.']]) {
    const menu = await openBlockMenu(index, '블록 작업');
    const item = menu.getByRole('menuitem', {name, exact:true});
    const reason = await boundaryReason(item);
    if (!await item.isDisabled() || reason.tooltip !== expected || reason.description !== expected) {
      throw new Error(`Korean boundary move needs its direction-specific reason: ${JSON.stringify(reason)}`);
    }
    await page.keyboard.press('Escape');
  }
  await page.getByRole('button', {name:'설정', exact:true}).click();
  await page.getByTestId('ui-language').selectOption('en');
  await page.keyboard.press('Escape');
  await page.getByTestId('settings-dialog').waitFor({state:'detached'});

  const menuOffset = async () => {
    await equation.hover({position:{x:4, y:4}});
    await page.getByRole('button', {name:/^Move equation block \d+$/}).click();
    const menu = page.getByRole('menu', {name:'Block actions', exact:true});
    await menu.and(page.locator(':focus-within')).waitFor();
    const offset = (await menu.boundingBox()).y - (await equation.boundingBox()).y;
    await page.keyboard.press('Escape');
    await menu.waitFor({state:'detached'});
    return offset;
  };
  const anchorOffset = await menuOffset();
  // Wrapping and resizing shift every later handle. A memoized control must use its new
  // coordinates for both its menu and the real drag-source outline checked below.
  const paragraph = editor.locator(':scope > p').first();
  const paragraphBefore = await paragraph.boundingBox();
  await paragraph.click();
  await page.keyboard.press('End');
  await page.keyboard.insertText(' Wrapping moves the following controls.'.repeat(8));
  await page.setViewportSize({width:1100, height:1600});
  result.paragraphWrapped = (await paragraph.boundingBox()).height > paragraphBefore.height;
  result.menuFollowsWrapAndResize = Math.abs(await menuOffset() - anchorOffset) <= 1;

  // 1. While dragging the Equation: it is tinted, and the line sits centred in the gap above the target.
  const equationBox = await equation.boundingBox();
  const movedOrder = await withBlockHover(page, async () => {
    await grab(equation, /^Move equation block \d+$/);
    // A visible extent before dragging makes the suppression assertion non-vacuous.
    await page.getByTestId('block-hover-outline').waitFor();
    const targetBox = await target.boundingBox();
    await pointAt(targetBox.y + 3);
    await line.waitFor();
    result.hoverHiddenDuringDrag = !await page.getByTestId('block-hover-outline').isVisible();
    const gap = await target.evaluate(node => ({top: node.previousElementSibling.getBoundingClientRect().bottom, bottom: node.getBoundingClientRect().top}));
    const tintBox = await tint.boundingBox();
    result.movedBlockTinted = Math.abs(tintBox.y - equationBox.y) <= 1 && Math.abs(tintBox.height - equationBox.height) <= 1;
    result.lineCentredInGap = Math.abs(middle(await line.boundingBox()) - (gap.top + gap.bottom) / 2) <= 1;

    // 2. Over its own position there is no line, and nothing else is shown as a destination.
    await pointAt(middle(equationBox));
    await line.waitFor({state:'detached'});
    result.noLineInPlace = await line.count() === 0 && await tint.count() === 1;

    // 3. Dropping moves it without opening the Equation editor.
    await pointAt(targetBox.y + 3);
    await line.waitFor();
    await page.mouse.up();
    await tint.waitFor({state:'detached'});
    const movedOrder = await order();
    result.equationMoved = movedOrder !== original &&
      await target.evaluate(node => node.previousElementSibling.querySelector('[data-block="equation"]') !== null);
    result.equationNotEditing = await equation.getAttribute('data-editing') === 'false' &&
      await page.getByTestId('equation-editor').count() === 0 && await line.count() === 0;
    result.saveStillAvailable = await page.getByTestId('status').innerText() === 'Unsaved changes' &&
      await page.locator('.top-bar [data-testid="save"]').getAttribute('aria-disabled') === null;
    return movedOrder;
  });

  // 4. The next drag starts right after a drop, and a moved Figure is not selected either, so its
  // properties do not open.
  // Nothing lands above the leading title (#255): no line there, and a drop changes nothing.
  const first = await editor.locator(':scope > *').first().boundingBox();
  const second = await editor.locator(':scope > *').nth(1).boundingBox();
  await grab(figure, /^Move figure block \d+$/);
  await pointAt(first.y + 2);
  result.noLineAboveTitle = await line.count() === 0;
  await pointAt(second.y + 2);
  await line.waitFor();
  await page.mouse.up();
  await tint.waitFor({state:'detached'});
  result.figureMovedFirst = (await order()).startsWith('heading figure ');
  result.figureNotOpened = await figure.getAttribute('data-selected') === 'false' &&
    await page.getByTestId('figure-properties').count() === 0;

  // 5. Undo and redo restore the order without opening an editor.
  await page.keyboard.press('ControlOrMeta+z');
  await page.keyboard.press('ControlOrMeta+z');
  result.undoRestores = await order() === original;
  await page.keyboard.press('ControlOrMeta+Shift+z');
  result.redoMovesWithoutEditing = await order() === movedOrder && await equation.getAttribute('data-editing') === 'false' &&
    await page.getByTestId('equation-editor').count() === 0;
  result.menuFollowsReorder = Math.abs(await menuOffset() - anchorOffset) <= 1;

  // 6. An unapplied Equation draft pins its block: the handle says why, a drag does nothing, and the draft stays.
  await equation.getByRole('button', {name:'Edit', exact:true}).locator('..').hover({position:{x:4, y:4}});
  await equation.getByRole('button', {name:'Edit', exact:true}).click();
  await page.getByTestId('equation-latex').fill('x + BlockMoveDraft');
  // The draft is reported from an effect, so the handle follows it a render later.
  const handle = page.getByRole('button', {name:/^Move equation block \d+$/});
  // The title's handle never drags (#255); wait for the Equation's own.
  await page.locator('.block-handle[draggable="false"][aria-label^="Move equation block"]').waitFor({state:'attached'});
  result.draftHandleExplains = await handle.getAttribute('draggable') === 'false' &&
    await handle.getAttribute('title') === 'Apply or Cancel the Equation edit before moving it.';
  const draftMenu = await openBlockMenu(await editor.evaluate(node => {
    let found; node.editor.state.doc.forEach((child, _, index) => { if (child.type.name === 'equation') found = index; }); return found;
  }));
  result.draftMenuProtected = await draftMenu.getByRole('menuitem', {name:'Move up', exact:true}).isDisabled() &&
    await draftMenu.getByRole('menuitem', {name:'Move down', exact:true}).isDisabled();
  await page.keyboard.press('Escape');
  await grab(equation, /^Move equation block \d+$/);
  await pointAt(first.y + 2);
  await page.mouse.up();
  result.draftBlockNotMoved = await order() === movedOrder && await line.count() === 0 && await tint.count() === 0 &&
    await page.getByTestId('equation-latex').inputValue() === 'x + BlockMoveDraft';
  await page.getByTestId('equation-cancel').click();
  await page.locator('.block-handle[draggable="false"][aria-label^="Move equation block"]').waitFor({state:'detached'});
  result.cancelReleasesHandle = await handle.getAttribute('draggable') === 'true' &&
    await handle.getAttribute('title') === 'Drag to move, click for block actions';

  result.fileUnchanged = await read() === before;
  // Menu movement uses the drag reorder bridge: exactly one adjacent swap, one Undo,
  // and real Save/Reload. Heading content must stay put when just its block moves.
  const snapshot = () => editor.evaluate(node => {
    const blocks = []; node.editor.state.doc.forEach(child => blocks.push(child.toJSON())); return blocks;
  });
  const beforeMenuMove = await snapshot();
  const bodyHeading = beforeMenuMove.findIndex((node, index) => index > 0 && node.type === 'heading');
  for (const [from, by, name] of [[1, 1, 'Move down'], [2, -1, 'Move up'], [bodyHeading, 1, 'Move down']]) {
    const menu = await openBlockMenu(from);
    await menu.getByRole('menuitem', {name, exact:true}).click();
    const expected = [...beforeMenuMove];
    [expected[from], expected[from + by]] = [expected[from + by], expected[from]];
    if (JSON.stringify(await snapshot()) !== JSON.stringify(expected)) throw new Error(`${name} must swap one block`);
    await page.keyboard.press('ControlOrMeta+z');
    if (JSON.stringify(await snapshot()) !== JSON.stringify(beforeMenuMove)) throw new Error(`${name} needs one-step Undo`);
  }
  await (await openBlockMenu(1)).getByRole('menuitem', {name:'Move down', exact:true}).click();
  const persistedOrder = await order();
  const contentOrder = () => editor.evaluate(node => {
    const blocks = []; node.editor.state.doc.forEach(child => blocks.push([child.type.name, child.textContent])); return blocks;
  });
  const persistedContent = await contentOrder();
  await page.getByRole('button', {name:'Save', exact:true}).click();
  await page.locator('[data-testid="status"]:is([data-operation="saved"], [data-operation="save-failed"])').waitFor({state:'attached'});
  if (await page.getByTestId('status').getAttribute('data-operation') !== 'saved') throw new Error('Moved blocks failed Save');
  await page.reload();
  await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
  result.menuOrderReloaded = await order() === persistedOrder && JSON.stringify(await contentOrder()) === JSON.stringify(persistedContent);
  // A draft at either body boundary needs an actionable reason before the boundary reason.
  await openPath(page, [root, 'tmp', 'block-move', 'draft-boundaries.md'].join(separator));
  await page.getByRole('dialog').waitFor({state:'detached'});
  const boundaryDraftReasons = [];
  for (const name of ['Move up', 'Move down']) {
    const equations = page.locator('[data-document-tab][data-active=true] [data-block="equation"]');
    const block = name === 'Move up' ? equations.first() : equations.last();
    await block.hover();
    await block.getByRole('button', {name:'Edit', exact:true}).click();
    await page.getByTestId('equation-latex').fill('x + BoundaryDraft');
    const index = name === 'Move up' ? 1 : await editor.evaluate(node => node.editor.state.doc.childCount - 1);
    const menu = await openBlockMenu(index);
    const item = menu.getByRole('menuitem', {name, exact:true});
    boundaryDraftReasons.push({name, disabled: await item.isDisabled(), ...await boundaryReason(item)});
    await page.keyboard.press('Escape');
    await page.getByTestId('equation-cancel').click();
  }
  const draftReason = 'Apply or Cancel the Equation edit before moving it.';
  if (boundaryDraftReasons.some(item => !item.disabled || item.tooltip !== draftReason || item.description !== draftReason)) {
    throw new Error(`Draft reasons must precede both boundary reasons: ${JSON.stringify(boundaryDraftReasons)}`);
  }
  const failed = Object.entries(result).filter(([, value]) => value !== true);
  if (failed.length > 0) throw new Error(`Block move failed: ${JSON.stringify(result)}`);
  return result;
}
