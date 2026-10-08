// Run with pnpm browser:test block-move (prepare is automatic).
// Drags real block handles in a scratch copy of technical-document.md: while dragging, the moved
// block is tinted and one line marks the gap it will land in (none where it would stay in place);
// a moved Equation or Figure is not opened for editing; undo/redo keep that; and a block with an
// unapplied draft cannot be moved, so the draft is not lost. Nothing is saved. Scratch files live
// under the repository's ignored tmp/ directory.
async page => {
  await page.unrouteAll();
  // The whole document fits, so nothing scrolls under the pointer mid-drag.
  await page.setViewportSize({width: 1280, height: 1600});
  await page.reload();
  await page.locator('[data-testid="status"][data-operation="Ready"]').waitFor({state:'attached'});

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

  await page.getByRole('button', {name:'Open file…'}).click();
  await page.getByTestId('file-path').fill(file);
  await page.getByRole('dialog').getByRole('button', {name:'Open', exact:true}).click();
  await page.locator('[data-testid="status"][data-operation="Ready"]').waitFor({state:'attached'});
  await page.getByRole('dialog').waitFor({state:'detached'});

  const editor = page.locator('.document-editor');
  const order = () => editor.evaluate(node => { const names = []; node.editor.state.doc.forEach(child => names.push(child.type.name)); return names.join(' '); });
  const equation = page.locator('[data-block="equation"]');
  const figure = page.locator('[data-block="figure"]');
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

  // 1. While dragging the Equation: it is tinted, and the line sits centred in the gap above the target.
  const equationBox = await equation.boundingBox();
  await grab(equation, /^Move equation block \d+$/);
  const targetBox = await target.boundingBox();
  await pointAt(targetBox.y + 3);
  await line.waitFor();
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

  // 4. The next drag starts right after a drop, and a moved Figure is not selected either, so its
  // properties do not open.
  const first = await editor.locator(':scope > *').first().boundingBox();
  await grab(figure, /^Move figure block \d+$/);
  await pointAt(first.y + 2);
  await line.waitFor();
  await page.mouse.up();
  await tint.waitFor({state:'detached'});
  result.figureMovedFirst = (await order()).startsWith('figure ');
  result.figureNotOpened = await figure.getAttribute('data-selected') === 'false' &&
    await page.getByTestId('figure-properties').count() === 0;

  // 5. Undo and redo restore the order without opening an editor.
  await page.keyboard.press('ControlOrMeta+z');
  await page.keyboard.press('ControlOrMeta+z');
  result.undoRestores = await order() === original;
  await page.keyboard.press('ControlOrMeta+Shift+z');
  result.redoMovesWithoutEditing = await order() === movedOrder && await equation.getAttribute('data-editing') === 'false' &&
    await page.getByTestId('equation-editor').count() === 0;

  // 6. An unapplied Equation draft pins its block: the handle says why, a drag does nothing, and the draft stays.
  await equation.getByRole('button', {name:'Edit', exact:true}).locator('..').hover({position:{x:4, y:4}});
  await equation.getByRole('button', {name:'Edit', exact:true}).click();
  await page.getByTestId('equation-latex').fill('x + BlockMoveDraft');
  // The draft is reported from an effect, so the handle follows it a render later.
  const handle = page.getByRole('button', {name:/^Move equation block \d+$/});
  await page.locator('.block-handle[draggable="false"]').waitFor({state:'attached'});
  result.draftHandleExplains = await handle.getAttribute('draggable') === 'false' &&
    await handle.getAttribute('title') === 'Apply or Cancel the Equation edit before moving it.';
  await grab(equation, /^Move equation block \d+$/);
  await pointAt(first.y + 2);
  await page.mouse.up();
  result.draftBlockNotMoved = await order() === movedOrder && await line.count() === 0 && await tint.count() === 0 &&
    await page.getByTestId('equation-latex').inputValue() === 'x + BlockMoveDraft';
  await page.getByTestId('equation-cancel').click();
  await page.locator('.block-handle[draggable="false"]').waitFor({state:'detached'});
  result.cancelReleasesHandle = await handle.getAttribute('draggable') === 'true' &&
    await handle.getAttribute('title') === 'Drag to move, click for block actions';

  result.fileUnchanged = await read() === before;
  const failed = Object.entries(result).filter(([, value]) => value !== true);
  if (failed.length > 0) throw new Error(`Block move failed: ${JSON.stringify(result)}`);
  return result;
}
