// Real keyboard boundary matrix; all mutations are undone before the next case.
async (page, { openDocument, reloadDocument }) => {
  await page.unrouteAll();
  await page.reload();
  await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
  const loaded = await (await page.request.get(page.url().split('/').slice(0,3).join('/') + '/api/document')).json();
  const sep = loaded.path.includes('\\') ? '\\' : '/';
  const file = [...loaded.path.split(sep).slice(0,-4), 'tmp', 'atom-boundaries', 'boundaries.md'].join(sep);
  await openDocument(page, file);
  const editor = page.locator('[data-document-tab][data-active=true] .document-editor');
  await editor.locator('h1').filter({hasText:'Atom boundaries'}).waitFor();
  const check = (ok, message) => { if (!ok) throw new Error(message); };
  const snapshot = () => editor.evaluate(el => JSON.stringify(el.editor.getJSON()));
  const original = await snapshot();
  const matrix = [];
  for (const [i, kind] of ['equation','figure','table','code','divider','admonition'].entries()) {
    for (const [j, current] of ['heading','paragraph','list','quote'].entries()) {
      for (const key of ['Backspace','Delete']) {
        const marker = `Boundary ${i}-${j}-${key}`;
        await editor.evaluate((el, {marker,key}) => {
          const e = el.editor;
          e.state.doc.descendants((node,pos) => {
            if (node.isTextblock && node.textContent === marker) {
              e.commands.setTextSelection(pos + 1 + (key === 'Delete' ? node.content.size : 0));
              return false;
            }
          });
          e.view.focus();
        }, {marker,key});
        await page.keyboard.press(key);
        const result = await editor.evaluate(el => {
          const e = el.editor, s = e.state.selection;
          return { selected:s.node?.type.name ?? null, document:JSON.stringify(e.getJSON()), parent:s.$from.parent.type.name };
        });
        const changed = result.document !== original;
        const shouldSelect = current !== 'quote' && current !== 'list' && ['equation','divider','figure','table','admonition'].includes(kind) ||
          current === 'list' && key === 'Delete' && kind !== 'code';
        const shouldChange = current === 'list' && key === 'Backspace' || current !== 'quote' && kind === 'code';
        check(result.selected === (shouldSelect ? kind : null) && changed === shouldChange,
          `Boundary behavior: ${JSON.stringify({kind,current,key,...result})}`);
        matrix.push({kind,current,key,selected:result.selected,changed,parent:result.parent});
        if (changed) {
          await editor.evaluate(el => el.editor.commands.undo());
          check(await snapshot() === original, `Undo failed: ${marker}`);
        }
      }
    }
  }
  await editor.evaluate(el => { el.editor.commands.setTextSelection(1); el.editor.view.focus(); });
  await page.keyboard.press('Backspace');
  check(await snapshot() === original, 'Backspace at document start must do nothing');
  // Selection is visible, second key deletes, and Save preserves Undo/Redo and Reload.
  for (const key of ['Backspace','Delete']) {
    await editor.evaluate((el,key) => {
      const e = el.editor;
      e.state.doc.descendants((n,p) => {
        if (n.isTextblock && n.textContent === `Boundary 0-0-${key}`) e.commands.setTextSelection(p + 1 + (key === 'Delete' ? n.content.size : 0));
      });
      e.view.focus();
    },key);
    await page.keyboard.press(key);
    const selected = editor.locator('[data-selected="true"][data-block="equation"]');
    await selected.waitFor({state:'visible',timeout:10000});
    check(await selected.getByRole('button',{name:'Edit',exact:true}).isVisible(), 'Selected atom must expose Edit');
    check(await snapshot() === original, 'Selecting must leave document unchanged');
    await page.keyboard.press(key);
    const deleted = await snapshot();
    check(deleted !== original, 'Second key must delete');
    await editor.evaluate(el => el.editor.commands.undo());
    check(await snapshot() === original, `${key} Undo must restore atom`);
    await editor.evaluate(el => el.editor.commands.redo());
    check(await snapshot() === deleted, `${key} Redo must remove atom`);
    if (key === 'Backspace') {
      await editor.evaluate(el => el.editor.commands.undo());
      continue;
    }
    const response = page.waitForResponse(r => r.request().method() === 'POST' && /\/api\/document(?:\?|$)/.test(r.url()));
    await page.getByTestId('save').click();
    check((await response).status() === 200, 'Disk Save failed');
    await page.getByText('Saved',{exact:true}).filter({visible:true}).waitFor();
    await editor.evaluate(el => el.editor.commands.undo());
    check(await snapshot() === original, 'Undo after Save must restore atom');
    await editor.evaluate(el => el.editor.commands.redo());
    check(await snapshot() === deleted, 'Redo must delete atom again');
    const previousEditor = await editor.elementHandle();
    await reloadDocument(page);
    await page.waitForFunction(el => !el.isConnected, previousEditor);
    await page.waitForFunction(() => !!document.querySelector('[data-document-tab][data-active=true] .document-editor')?.editor);
    const count = await editor.evaluate(el => el.editor.getJSON().content.filter(n => n.type === 'equation').length);
    check(count === 7, 'Reload must retain the saved deletion');
  }
  const saved = await snapshot();
  for (const key of ['Backspace','Delete']) {
    await editor.evaluate((el,key) => {
      const e = el.editor;
      let boundary;
      e.state.doc.forEach((n,p) => {
        if (boundary === undefined && n.type.name === 'equation') boundary = key === 'Backspace' ? p + n.nodeSize : p;
      });
      e.commands.insertContentAt(boundary, {type:'paragraph'});
      e.commands.setTextSelection(boundary + 1);
      e.view.focus();
    },key);
    await page.keyboard.press(key);
    check(await snapshot() === saved, `${key} must still remove an empty paragraph beside an atom`);
  }
  return matrix;
}
