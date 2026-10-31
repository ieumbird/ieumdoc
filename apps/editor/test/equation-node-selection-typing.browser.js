// Run with pnpm browser:test equation-node-selection-typing.
// CDP exercises native composition with and without an initial IME keydown;
// this does not emulate a real Windows Korean OS IME.
async (page, { showNotifications, openPath, reloadDocument }) => {
  await page.unrouteAll();
  const ready = () => page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
  await page.reload();
  await ready();
  const origin = page.url().split('/').slice(0,3).join('/');
  const loaded = await (await page.request.get(`${origin}/api/document`)).json();
  const sep = loaded.path.includes('\\') ? '\\' : '/';
  const file = [...loaded.path.split(sep).slice(0, -4), 'tmp', 'equation-node-selection-typing', 'power.md'].join(sep);
  await openPath(page, file);
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
      const handled = e.view.pasteHTML('<!-- data-litzio-type="paragraph" -->');
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
    for (const mode of ['typing', 'typing-again', 'composition', 'composition-no-key', 'composition-cancel', 'composition-cancel-escape', 'composition-cancel-escape-no-key', 'typing-after-composition', 'typing-again-after-composition', 'typing-again-after-focus']) {
      const before = await snapshot();
      if (mode === 'typing-again-after-focus') await page.getByRole('button',{name:'Settings',exact:true}).focus();
      await selectEquation();
      const beforeHistory = await editor.evaluate(el => [el.editor.can().undo(),el.editor.can().redo()]);
      const beforeRendered = await equation.getByTestId('equation-preview').innerText();
      const nativeBefore = await editor.evaluate(el => {
        const s=getSelection(),e=el.editor;
        const point=(node,offset)=>{try{return e.view.posAtDOM(node,offset);}catch{return null;}};
        return {engine:e.state.selection.toJSON(),native:s?{from:point(s.anchorNode,s.anchorOffset),to:point(s.focusNode,s.focusOffset)}:null,focus:e.view.hasFocus(),editable:el.isContentEditable};
      });
      check(nativeBefore.engine.type==='node', `${mode}: preview selection drifted before input: ${JSON.stringify(nativeBefore)}`);
      if (mode.startsWith('typing')) await page.keyboard.type(mode.includes('again')?'R':'QR');
      if (mode.startsWith('composition')) {
        if (!mode.includes('no-key')) await cdp.send('Input.dispatchKeyEvent', {type:'rawKeyDown', key:'Process', windowsVirtualKeyCode:229, nativeVirtualKeyCode:229});
        await compose('ㅎ');
        await compose('하');
        if (mode === 'composition') await cdp.send('Input.dispatchKeyEvent', {type:'rawKeyDown', key:'Process', windowsVirtualKeyCode:229, nativeVirtualKeyCode:229});
        await compose('한');
        await compose('한ㄱ');
        await compose('한글');
        if (mode.includes('cancel-escape')) {
          await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
          await cdp.send('Input.dispatchKeyEvent', {type:'rawKeyDown',key:'Escape',windowsVirtualKeyCode:27,nativeVirtualKeyCode:27});
          await compose('');
          await cdp.send('Input.dispatchKeyEvent', {type:'keyUp',key:'Escape',windowsVirtualKeyCode:27,nativeVirtualKeyCode:27});
          await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
        } else if (mode === 'composition-cancel') await compose('');
        else await cdp.send('Input.insertText', {text:'한글'});
        await page.waitForFunction(() => {
          const el=document.querySelector('[data-document-tab][data-active=true] .document-editor');
          return el.editor.view.editable && el.editor.view.hasFocus() && !el.editor.view.composing;
        });
      }
      await page.keyboard.type('Z');
      check(same(await snapshot(),before), `${mode}: ignored input must preserve the entire document and add no paragraph; before=${JSON.stringify(nativeBefore)}`);
      check(await equation.getByTestId('equation-preview').innerText() === beforeRendered, `${mode}: composition left stale rendered text`);
      check(same(await editor.evaluate(el => [el.editor.can().undo(),el.editor.can().redo()]),beforeHistory), `${mode}: ignored input changed history`);
    }

    // Native range extension is still delegated to the engine/browser navigation.
    for (const key of ['Shift+ArrowDown','Shift+ArrowUp','Shift+Home','Shift+End']) {
      const before = await snapshot();
      // Start a separate pointer sequence instead of double-clicking the preview.
      await editor.locator('p.paragraph', {hasText:'Before the equation.'}).click();
      await selectEquation();
      await page.keyboard.press(key);
      await page.waitForFunction(() => {
        const s=document.querySelector('[data-document-tab][data-active=true] .document-editor').editor.state.selection;
        return s.toJSON().type==='text' && !s.empty;
      });
      const range = await editor.evaluate(el => {
        let equation=false;
        el.editor.state.selection.content().content.descendants(node => { if (node.type.name==='equation') equation=true; });
        const s=el.editor.state.selection;
        return {equation,text:el.editor.state.doc.textBetween(s.from,s.to)};
      });
      check(key==='Shift+ArrowUp' ? range.text==='Before the equation.' : range.equation,
        `${key}: native range must retain the existing selection behavior: ${JSON.stringify(range)}`);
      check(same(await snapshot(),before), `${key}: navigation changed the document`);
    }

    // Navigation remains explicit, even when followed by a late native cancellation.
    await editor.locator('p.paragraph', {hasText:'Before the equation.'}).click();
    await selectEquation();
    const beforeNavigation = await snapshot();
    await compose('ㅎ');
    await page.keyboard.press('ArrowDown');
    await compose('');
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    check(same(await snapshot(),beforeNavigation), 'Late cancellation after navigation changed the document');

    // A real click elsewhere restores ordinary composition and English typing.
    const beforeOrdinary = await snapshot();
    await editor.locator('p.paragraph', {hasText:'Before the equation.'}).click();
    await page.waitForFunction(() => {
      const s=document.querySelector('[data-document-tab][data-active=true] .document-editor').editor.state.selection;
      return s.empty && s.$from.parent.textContent==='Before the equation.';
    });
    await page.keyboard.press('End');
    await page.waitForFunction(() => {
      const {$from}=document.querySelector('[data-document-tab][data-active=true] .document-editor').editor.state.selection;
      return $from.parentOffset===$from.parent.content.size;
    });
    await compose('ㄱ'); await compose('글');
    await cdp.send('Input.insertText', {text:'글'});
    await page.waitForFunction(() => !document.querySelector('[data-document-tab][data-active=true] .document-editor').editor.view.composing);
    await page.keyboard.type('Z');
    const ordinary = await snapshot();
    const expectedOrdinary = JSON.parse(JSON.stringify(beforeOrdinary));
    expectedOrdinary.content.find(n => text(n) === 'Before the equation.').content[0].text += '글Z';
    check(same(ordinary,expectedOrdinary), 'Body input after ignored composition changed other content or duplicated input');
    await saveReload(ordinary,beforeOrdinary);

    // Accepted paste keeps its existing adjacent-paragraph, history and real Save/Reload path.
    for (const mode of ['paste', 'paste-lines']) {
      const before = await snapshot();
      const index = before.content.findIndex(n => n.type === 'equation');
      await selectEquation();
      if (mode === 'paste') {
        // The native menu/API paste path has no keyboard event to release composition rejection.
        await compose('ㅎ'); await cdp.send('Input.insertText', {text:'한'});
        await page.waitForFunction(() => {
          const el=document.querySelector('[data-document-tab][data-active=true] .document-editor');
          return el.editor.view.editable && el.editor.view.hasFocus() && !el.editor.view.composing;
        });
        check(await editor.evaluate(el=>el.editor.view.pasteText('Paste314')), 'Accepted menu/API paste must be handled');
      } else {
        await page.evaluate(() => navigator.clipboard.writeText('First314\nSecond314'));
        await page.keyboard.press('Control+v');
      }
      const after = await snapshot();
      const added = after.content.slice(index + 1, after.content.length - before.content.length + index + 1);
      const expected = mode === 'paste' ? ['Paste314'] : ['First314','Second314'];
      check(same(added.map(text), expected) && added.every(n => n.type === 'paragraph'), `${mode}: expected adjacent text exactly once, got ${JSON.stringify(after)}`);
      const retained = {...after, content:after.content.filter((_,i) => i <= index || i > index + added.length)};
      check(same(retained,before), `${mode}: changed Equation/label or surrounding content`);
      check(await editor.evaluate(el=>el.editor.state.selection.empty && el.editor.state.selection.$from.parent.type.name==='paragraph'), `${mode}: paste must keep its following text caret`);
      if (mode === 'paste') await emptyPaste();
      await page.keyboard.press('Control+z');
      check(same(await snapshot(),before), `${mode}: one Undo must restore the original document`);
      if (mode === 'paste') await emptyPaste();
      await page.keyboard.press('Control+Shift+z');
      check(same(await snapshot(),after), `${mode}: Redo must restore input exactly once`);
      await saveReload(after, before);
    }

    // Redirecting paste must still reject a duplicate target label, without even adding space.
    await selectEquation();
    const beforeRejectedPaste = await snapshot();
    await page.keyboard.press('Control+c');
    await page.keyboard.press('Control+v');
    await showNotifications(page);
    await page.getByText('Pasting would duplicate a Figure or Equation label.', {exact:false}).waitFor();
    check(same(await snapshot(),beforeRejectedPaste), 'Rejected paste changed Equation or inserted a paragraph');

    // Explicit removal remains an engine operation, unlike typing/paste.
    const beforeRemoval = await snapshot();
    for (const key of ['Backspace','Delete']) {
      await selectEquation();
      await cdp.send('Input.dispatchKeyEvent', {type:'rawKeyDown', key:'Process', windowsVirtualKeyCode:229, nativeVirtualKeyCode:229});
      await compose('ㅎ'); await cdp.send('Input.insertText', {text:'한'});
      await page.waitForFunction(() => {
        const el=document.querySelector('[data-document-tab][data-active=true] .document-editor');
        return el.editor.view.editable && el.editor.view.hasFocus() && !el.editor.view.composing;
      });
      check(same(await snapshot(),beforeRemoval), `${key}: ignored composition changed the document before explicit removal`);
      await page.keyboard.press(key);
      check(!(await snapshot()).content.some(n => n.type === 'equation'), `${key} must remove selected Equation`);
      await page.keyboard.press('Control+z');
      check(same(await snapshot(),beforeRemoval), `${key} Undo must restore Equation/label`);
    }
  } finally { await cdp.detach(); }
}
