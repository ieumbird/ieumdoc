// Run with pnpm browser:test block-selection-typing.
// A node-selected block must survive a printable key: typing must not replace it,
// and puts the character in a new paragraph below (same as Enter on a node-selected block).
// One undo restores the pre-typing document.
async (page, { openDocument }) => {
  await page.unrouteAll();
  await page.reload();
  await page.locator('[data-testid="status"][data-operation="Ready"]').waitFor({state:'attached'});
  const origin = page.url().split('/').slice(0, 3).join('/');
  const loaded = await (await page.request.get(`${origin}/api/document`)).json();
  const sep = loaded.path.includes('\\') ? '\\' : '/';
  const file = [...loaded.path.split(sep).slice(0, -4), 'tmp', 'block-selection-typing', 'blocks.md'].join(sep);
  await openDocument(page, file);
  await page.locator('[data-testid="status"][data-operation="Ready"]').waitFor({state:'attached'});
  await page.getByRole('dialog').waitFor({state:'detached'});

  const editor = page.locator('[data-document-tab][data-active=true] .document-editor');
  const check = (ok, message) => { if (!ok) throw new Error(message); };

  const targets = [
    { type: 'divider' },
    { type: 'figure', label: 'fig-empty' },
    { type: 'table', label: 'tbl-keep' },
    { type: 'admonition', variant: 'note' },
    { type: 'quote', text: 'Keep this quote.' },
    { type: 'heading', text: 'Keep this heading' },
    { type: 'codeBlock', textIncludes: 'const keep = 1;' },
    { type: 'equation', label: 'eq-keep' },
  ];

  const isTarget = (block, target) => {
    if (block.type !== target.type) return false;
    if (target.label && block.label !== target.label) return false;
    if (target.variant && block.variant !== target.variant) return false;
    if (target.text && block.text !== target.text) return false;
    if (target.textIncludes && !block.text.includes(target.textIncludes)) return false;
    return true;
  };

  const snapshot = () => editor.evaluate(el => {
    const blocks = [];
    el.editor.state.doc.forEach(node => {
      blocks.push({
        type: node.type.name,
        text: node.textContent,
        label: node.attrs.label ?? '',
        variant: node.attrs.variant ?? '',
        latex: node.attrs.latex ?? '',
        language: node.attrs.language ?? '',
        level: node.attrs.level ?? null,
      });
    });
    const { selection } = el.editor.state;
    return {
      blocks,
      selection: {
        kind: selection.constructor.name,
        from: selection.from,
        to: selection.to,
        empty: selection.empty,
        nodeType: selection.node?.type?.name ?? null,
        parentText: selection.$from?.parent?.textContent ?? '',
      },
    };
  });

  const selectTarget = target => editor.evaluate((el, opts) => {
    let pos;
    el.editor.state.doc.forEach((node, start) => {
      if (pos !== undefined) return;
      if (node.type.name !== opts.type) return;
      if (opts.label && node.attrs.label !== opts.label) return;
      if (opts.variant && node.attrs.variant !== opts.variant) return;
      if (opts.text && node.textContent !== opts.text) return;
      if (opts.textIncludes && !node.textContent.includes(opts.textIncludes)) return;
      pos = start;
    });
    if (pos === undefined) throw new Error(`block ${opts.type} not found`);
    el.editor.commands.setNodeSelection(pos);
    el.editor.view.focus();
  }, target);

  const waitNodeSelected = type => page.waitForFunction(typeName => {
    const ed = document.querySelector('[data-document-tab][data-active=true] .document-editor')?.editor;
    const selection = ed?.state.selection;
    return ed?.view.hasFocus() && selection?.constructor?.name === 'NodeSelection' &&
      selection.node?.type.name === typeName;
  }, type);

  await editor.waitFor();
  const initial = await snapshot();
  for (const target of targets) {
    check(initial.blocks.some(block => isTarget(block, target)),
      `Fixture missing ${target.type}: ${JSON.stringify(initial.blocks)}`);
  }

  for (const target of targets) {
    const before = await snapshot();
    const beforeBlock = before.blocks.find(block => isTarget(block, target));
    check(beforeBlock, `${target.type}: missing before typing`);

    await selectTarget(target);
    await waitNodeSelected(target.type);
    await page.keyboard.type('x');

    const after = await snapshot();
    const afterMatches = after.blocks.filter(block => isTarget(block, target));
    check(afterMatches.length === 1,
      `${target.type}: typing replaced or lost the block: ${JSON.stringify(after.blocks)}`);
    if (target.type === 'equation') {
      check(afterMatches[0].latex === beforeBlock.latex,
        `${target.type}: latex changed after typing`);
    }
    if (target.type === 'admonition' || target.type === 'quote' || target.type === 'heading' || target.type === 'codeBlock') {
      check(afterMatches[0].text === beforeBlock.text,
        `${target.type}: content changed after typing: ${afterMatches[0].text}`);
    }

    const blockIndex = after.blocks.findIndex(block => isTarget(block, target));
    const next = after.blocks[blockIndex + 1];
    check(next?.type === 'paragraph' && next.text === 'x',
      `${target.type}: expected paragraph "x" immediately below, got ${JSON.stringify(next)}`);

    check(after.selection.kind === 'TextSelection' && after.selection.empty &&
      after.selection.parentText === 'x',
      `${target.type}: cursor must be in the new paragraph "x", got ${JSON.stringify(after.selection)}`);

    await page.keyboard.press('Control+z');
    const undone = await snapshot();
    check(JSON.stringify(undone.blocks) === JSON.stringify(before.blocks),
      `${target.type}: one undo must restore the document; before=${JSON.stringify(before.blocks)} undone=${JSON.stringify(undone.blocks)}`);
  }
}
