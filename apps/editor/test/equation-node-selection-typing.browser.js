// Run with pnpm browser:test equation-node-selection-typing.
// A node-selected Equation must survive a printable key: typing must not replace the atom,
// and puts the character in a new paragraph below (same as Enter on a node-selected block).
async (page, { openDocument }) => {
  await page.unrouteAll();
  await page.reload();
  await page.locator('[data-testid="status"][data-operation="Ready"]').waitFor({state:'attached'});
  const origin = page.url().split('/').slice(0, 3).join('/');
  const loaded = await (await page.request.get(`${origin}/api/document`)).json();
  const sep = loaded.path.includes('\\') ? '\\' : '/';
  const file = [...loaded.path.split(sep).slice(0, -4), 'tmp', 'equation-node-selection-typing', 'power.md'].join(sep);
  await openDocument(page, file);
  await page.locator('[data-testid="status"][data-operation="Ready"]').waitFor({state:'attached'});
  await page.getByRole('dialog').waitFor({state:'detached'});

  const editor = page.locator('[data-document-tab][data-active=true] .document-editor');
  const equation = page.locator('[data-document-tab][data-active=true] [data-block="equation"]');
  const check = (ok, message) => { if (!ok) throw new Error(message); };

  const selectEquation = () => editor.evaluate(el => {
    const {editor} = el;
    let pos;
    editor.state.doc.forEach((node, start) => {
      if (node.type.name === 'equation' && node.attrs.label === 'eq-power' && pos === undefined) pos = start;
    });
    if (pos === undefined) throw new Error('eq-power Equation not found');
    editor.commands.setNodeSelection(pos);
    editor.view.focus();
  });

  const equationState = () => editor.evaluate(el => {
    let found;
    el.editor.state.doc.forEach(node => {
      if (node.type.name === 'equation' && node.attrs.label === 'eq-power') {
        found = {latex: node.attrs.latex, label: node.attrs.label};
      }
    });
    return found;
  });

  const nodeSelected = () => editor.evaluate(el => {
    const {selection} = el.editor.state;
    return el.editor.view.hasFocus() &&
      selection.constructor.name === 'NodeSelection' &&
      selection.node?.type.name === 'equation' &&
      selection.node.attrs.label === 'eq-power';
  });

  await equation.waitFor();
  const before = await equationState();
  check(before?.latex.includes('P = VI') && before.label === 'eq-power',
    `Expected labeled power Equation before typing, got ${JSON.stringify(before)}`);

  // Click the preview (not Edit) so the whole Equation is node-selected, then type.
  await equation.locator('[data-testid="equation-preview"]').click({position:{x:8,y:8}});
  await page.waitForFunction(() => {
    const editor = document.querySelector('[data-document-tab][data-active=true] .document-editor')?.editor;
    const selection = editor?.state.selection;
    return editor?.view.hasFocus() && selection?.constructor?.name === 'NodeSelection' &&
      selection.node?.type.name === 'equation' && selection.node.attrs.label === 'eq-power';
  });
  check(await nodeSelected(), 'Clicking the Equation preview must leave a node selection');
  check(await equation.getByRole('button', {name:'Edit', exact:true}).isVisible(),
    'Node-selected Equation must show its Edit button');

  await page.keyboard.type('Q');

  const after = await equationState();
  check(after?.latex === before.latex && after?.label === before.label,
    `Typing on a node-selected Equation replaced it: before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);
  check(await equation.count() === 1, 'Equation block count changed after typing');
  check(await equation.locator('[data-testid="equation-preview"]').count() === 1,
    'Equation preview was lost after typing');

  // Same convention as Enter on a node-selected block: a new paragraph below holds the text.
  const below = await editor.evaluate(el => {
    const {doc} = el.editor.state;
    let equationIndex = -1;
    const blocks = [];
    doc.forEach(node => {
      blocks.push({type: node.type.name, text: node.textContent, label: node.attrs.label ?? '', latex: node.attrs.latex ?? ''});
    });
    equationIndex = blocks.findIndex(block => block.type === 'equation' && block.label === 'eq-power');
    return {blocks, next: blocks[equationIndex + 1]};
  });
  check(below.next?.type === 'paragraph' && below.next.text === 'Q',
    `Expected a paragraph "Q" immediately below the Equation, got ${JSON.stringify(below.next)}`);

  // Restore node selection and confirm a second printable character still keeps the Equation.
  await selectEquation();
  await page.waitForFunction(() => {
    const editor = document.querySelector('[data-document-tab][data-active=true] .document-editor')?.editor;
    const selection = editor?.state.selection;
    return selection?.constructor?.name === 'NodeSelection' && selection.node?.attrs.label === 'eq-power';
  });
  await page.keyboard.type('R');
  const still = await equationState();
  check(still?.latex === before.latex && still?.label === before.label,
    `Second typed character replaced the Equation: ${JSON.stringify(still)}`);
  const afterSecond = await editor.evaluate(el => {
    const blocks = [];
    el.editor.state.doc.forEach(node => {
      blocks.push({type: node.type.name, text: node.textContent, label: node.attrs.label ?? ''});
    });
    const equationIndex = blocks.findIndex(block => block.type === 'equation' && block.label === 'eq-power');
    return blocks[equationIndex + 1];
  });
  check(afterSecond?.type === 'paragraph' && afterSecond.text === 'R',
    `Expected paragraph "R" below after the second type, got ${JSON.stringify(afterSecond)}`);
}
