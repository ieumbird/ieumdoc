// Run with pnpm browser:test equation-node-selection-typing.
// CDP sends the initial IME keydown and Chromium composition/DOM updates;
// this is not a real Windows Korean OS IME or a keydown-less input method.
async (page, { openDocument, reloadDocument }) => {
  await page.unrouteAll();
  const ready = () => page.locator('[data-testid="status"][data-operation="Ready"]').waitFor({state:'attached'});
  await page.reload();
  await ready();
  const origin = page.url().split('/').slice(0,3).join('/');
  const loaded = await (await page.request.get(`${origin}/api/document`)).json();
  const sep = loaded.path.includes('\\') ? '\\' : '/';
  const file = [...loaded.path.split(sep).slice(0, -4), 'tmp', 'equation-node-selection-typing', 'power.md'].join(sep);
  await openDocument(page, file);
  await ready();
  await page.getByRole('dialog').waitFor({state:'detached'});
  const editor = page.locator('[data-document-tab][data-active=true] .document-editor');
  const equation = page.locator('[data-document-tab][data-active=true] [data-block="equation"]');
  const check = (ok, message) => { if (!ok) throw new Error(message); };
  const snapshot = () => editor.evaluate(el => el.editor.getJSON());
  const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
  const text = node => (node.content ?? []).map(n => n.type === 'hardBreak' ? '\n' : n.text ?? '').join('');
  const selectEquation = async () => {
    await equation.locator('[data-testid="equation-preview"]').click({position:{x:8,y:8}});
    await page.waitForFunction(() => {
      const e = document.querySelector('[data-document-tab][data-active=true] .document-editor')?.editor;
      return e?.view.hasFocus() && e.state.selection.constructor.name === 'NodeSelection' && e.state.selection.node?.attrs.label === 'eq-power';
    });
    check(await equation.getByRole('button', {name:'Edit', exact:true}).isVisible(), 'Selected Equation must show Edit');
  };
  const source = async () => {
    await page.getByTestId('view-source').click();
    const pre = page.locator('[data-document-tab][data-active=true]').getByTestId('source-view').locator('pre');
    await pre.waitFor();
    const result = (await pre.textContent()).replaceAll('\r\n','\n');
    await page.getByTestId('view-visual').click();
    return result;
  };
  const emptyPaste = async () => {
    const result = await editor.evaluate(el => {
      const e = el.editor;
      e.state.doc.forEach((node,pos) => {
        if (node.type.name === 'equation') e.commands.setNodeSelection(pos);
      });
      e.view.focus();
      const state = () => ({document:e.getJSON(), selection:e.state.selection.toJSON(),
        undo:e.can().undo(), redo:e.can().redo(), focused:e.view.hasFocus()});
      const before = state();
      // Real parsing/transform/handlePaste/default-paste pipeline: non-null empty Slice.
      const handled = e.view.pasteHTML('<!-- data-ieumdoc-type="paragraph" -->');
      return {before, after:state(), handled};
    });
    check(result.handled && same(result.before,result.after),
      `Empty HTML paste must preserve Equation/label, selection and history: ${JSON.stringify(result)}`);
  };
  const saveReload = async (expected, before) => {
    const preview = await source();
    const response = page.waitForResponse(r => r.request().method() === 'POST' && /\/api\/document(?:\?|$)/.test(r.url()));
    await page.getByTestId('save').click();
    check((await response).status() === 200, 'Real disk Save failed');
    await page.getByText('Saved', {exact:true}).filter({visible:true}).waitFor();
    const disk = await page.request.get(`${origin}/document/power.md?path=${encodeURIComponent(file)}`);
    check(disk.status() === 200 && (await disk.text()).replaceAll('\r\n','\n') === preview, 'Disk differs from Source');
    check(same(await snapshot(), expected), 'Save changed editor content');
    await editor.evaluate(el => el.editor.commands.undo());
    check(same(await snapshot(), before), 'Save lost Undo history');
    await editor.evaluate(el => el.editor.commands.redo());
    check(same(await snapshot(), expected), 'Redo after Save changed content');
    await reloadDocument(page);
    await ready();
    check(await source() === preview, 'Actual Reload changed saved content');
    check(await equation.count() === 1, 'Reload lost Equation');
  };
  await equation.waitFor();
  const original = (await snapshot()).content.find(n => n.type === 'equation');
  check(original.attrs.label === 'eq-power' && original.attrs.latex.includes('P = VI'), 'Missing original Equation');
  await page.context().grantPermissions(['clipboard-read','clipboard-write']);
  const cdp = await page.context().newCDPSession(page);
  const compose = text => cdp.send('Input.imeSetComposition', {text, selectionStart:text.length, selectionEnd:text.length});
  try {
    for (const mode of ['typing', 'typing-again', 'paste', 'paste-lines', 'composition']) {
      const before = await snapshot();
      const index = before.content.findIndex(n => n.type === 'equation');
      await selectEquation();
      if (mode === 'typing') await page.keyboard.type('QR');
      if (mode === 'typing-again') await page.keyboard.type('R');
      if (mode.startsWith('paste')) {
        await page.evaluate(value => navigator.clipboard.writeText(value), mode === 'paste' ? 'Paste314' : 'First314\nSecond314');
        await page.keyboard.press('Control+v');
      }
      if (mode === 'composition') {
        await cdp.send('Input.dispatchKeyEvent', {type:'rawKeyDown', key:'Process', windowsVirtualKeyCode:229, nativeVirtualKeyCode:229});
        await compose('ㅎ');
        await compose('하');
        // Subsequent IME keydowns must not create more paragraphs or reset composition.
        await cdp.send('Input.dispatchKeyEvent', {type:'rawKeyDown', key:'Process', windowsVirtualKeyCode:229, nativeVirtualKeyCode:229});
        await compose('한');
        await compose('한ㄱ');
        await compose('한글');
        await cdp.send('Input.insertText', {text:'한글'});
        await page.waitForFunction(() => !document.querySelector('[data-document-tab][data-active=true] .document-editor').editor.view.composing);
      }
      const after = await snapshot();
      const added = after.content.slice(index + 1, after.content.length - before.content.length + index + 1);
      const expected = mode === 'typing' ? ['QR'] : mode === 'typing-again' ? ['R'] : mode === 'paste' ? ['Paste314'] : mode === 'paste-lines' ? ['First314','Second314'] : ['한글'];
      check(same(added.map(text), expected) && added.every(n => n.type === 'paragraph'), `${mode}: expected adjacent text exactly once, got ${JSON.stringify(after)}`);
      const retained = {...after, content:after.content.filter((_,i) => i <= index || i > index + added.length)};
      check(same(retained,before), `${mode}: changed Equation/label or surrounding content`);
      if (mode === 'typing') await emptyPaste();
      await page.keyboard.press('Control+z');
      check(same(await snapshot(),before), `${mode}: one Undo must restore the original document`);
      if (mode === 'typing') await emptyPaste();
      await page.keyboard.press('Control+Shift+z');
      check(same(await snapshot(),after), `${mode}: Redo must restore input exactly once`);
      await saveReload(after, before);
    }

    // Redirecting paste must still reject a duplicate target label, without even adding space.
    await selectEquation();
    const beforeRejectedPaste = await snapshot();
    await page.keyboard.press('Control+c');
    await page.keyboard.press('Control+v');
    await page.getByText('Pasting would duplicate a Figure or Equation label.', {exact:false}).waitFor();
    check(same(await snapshot(),beforeRejectedPaste), 'Rejected paste changed Equation or inserted a paragraph');

    // Cancellation leaves only the empty session paragraph created by the initial IME keydown.
    const beforeCancel = await snapshot();
    const index = beforeCancel.content.findIndex(n => n.type === 'equation');
    await selectEquation();
    await cdp.send('Input.dispatchKeyEvent', {type:'rawKeyDown', key:'Process', windowsVirtualKeyCode:229, nativeVirtualKeyCode:229});
    await compose('ㅎ');
    await compose('');
    await page.waitForFunction(() => !document.querySelector('[data-document-tab][data-active=true] .document-editor').editor.view.composing);
    const cancelled = await snapshot();
    check(cancelled.content[index + 1].type === 'paragraph' && text(cancelled.content[index + 1]) === '', 'Cancelled composition retained text');
    check(same({...cancelled,content:cancelled.content.filter((_,i) => i !== index + 1)},beforeCancel), 'Cancellation changed existing content');
    await page.keyboard.press('Control+z');
    check(same(await snapshot(),beforeCancel), 'Undo cancellation must remove only empty session space');

    // Ordinary paragraph composition still uses the engine caret and replaces the active range.
    await editor.evaluate(el => {
      let pos;
      el.editor.state.doc.forEach((n,start) => { if (n.textContent === 'Before the equation.') pos=start+n.nodeSize-1; });
      el.editor.commands.setTextSelection(pos); el.editor.view.focus();
    });
    await compose('ㄱ'); await compose('글');
    await cdp.send('Input.insertText', {text:'글'});
    await page.waitForFunction(() => !document.querySelector('[data-document-tab][data-active=true] .document-editor').editor.view.composing);
    const ordinary = await snapshot();
    const expectedOrdinary = JSON.parse(JSON.stringify(beforeCancel));
    expectedOrdinary.content.find(n => text(n) === 'Before the equation.').content[0].text += '글';
    check(same(ordinary,expectedOrdinary), 'Ordinary paragraph composition changed other content or duplicated input');
    await page.keyboard.press('Control+z');
    check(same(await snapshot(),beforeCancel), 'Ordinary composition Undo failed');

    // Explicit removal remains an engine operation, unlike typing/paste.
    for (const key of ['Backspace','Delete']) {
      await editor.evaluate(el => {
        el.editor.state.doc.forEach((n,pos) => {
          if (n.type.name === 'equation') el.editor.commands.setNodeSelection(pos);
        });
        el.editor.view.focus();
      });
      await page.keyboard.press(key);
      check(!(await snapshot()).content.some(n => n.type === 'equation'), `${key} must remove selected Equation`);
      await page.keyboard.press('Control+z');
      check(same(await snapshot(),beforeCancel), `${key} Undo must restore Equation/label`);
    }
  } finally { await cdp.detach(); }
}
