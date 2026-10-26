// Caret keys right after the editor regains focus (#144). ProseMirror restores its own selection
// after focus in two ways: a check 20ms after focus writes it back over a different DOM
// selection, and within 200ms a DOM caret at the document start is taken for a browser reset.
// Neither may undo a caret key pressed after focus. On a busy CI renderer the 20ms check ran
// after Control+End had moved the DOM caret but before the change was read. Here the check is
// held and run at the key's keyup, the order recorded on CI, so that race happens every time.
// Focus without a key, or with a modifier alone, must still restore the editor's caret.
async (page, { openPath }) => {
  page.setDefaultTimeout(10000);
  page.setDefaultNavigationTimeout(10000);
  await page.unrouteAll();
  await page.reload();
  const ready = () => page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached', timeout:10000});
  await ready();
  const origin = page.url().split('/').slice(0, 3).join('/');
  const defaultPath = (await (await page.request.get(`${origin}/api/document`)).json()).path;
  const sep = defaultPath.includes('\\') ? '\\' : '/';
  const root = defaultPath.split(sep).slice(0, -4).join(sep);
  const file = [root, 'tmp', 'focus-caret', 'focus.md'].join(sep);
  await openPath(page, file);
  await page.getByRole('dialog').waitFor({state:'detached'});
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const editor = page.locator('[data-document-tab][data-active=true] .document-editor');
  const texts = async () => (await editor.evaluate(el => { const out = []; el.editor.state.doc.forEach(node => out.push(node.textContent)); return out; })).join('|');
  const state = () => editor.evaluate(el => {
    const {from, to} = el.editor.state.selection;
    const dom = getSelection();
    return {from, to, end: el.editor.state.doc.content.size - 1, dom: `${dom.anchorNode?.textContent}@${dom.anchorOffset}`};
  });
  // The caret at `offset` in the top-level block whose text is `text`.
  const caret = (text, offset) => editor.evaluate((el, [text, offset]) => {
    let position;
    el.editor.state.doc.forEach((node, pos) => { if (node.textContent === text) position = pos + 1 + offset; });
    if (position === undefined) throw new Error(`Missing block ${text}`);
    el.editor.commands.setTextSelection(position);
    el.editor.view.focus();
  }, [text, offset]);
  const typed = async (char, expected, message) => {
    await page.keyboard.type(char);
    const now = await texts();
    assert(now === expected, `${message}: ${now}`);
  };

  // Hold the check ProseMirror schedules while focus is dispatched (its only 20ms timer then).
  await page.evaluate(() => {
    const schedule = window.setTimeout;
    const check = window.__focusCheck = {arm: false, held: null, ran: false};
    window.setTimeout = (callback, ms, ...args) => {
      if (check.arm && ms === 20) { check.arm = false; check.held = callback; return 0; }
      return schedule(callback, ms, ...args);
    };
    check.run = () => { const held = check.held; check.held = null; check.ran = true; held(); };
    // Run it at the keyup of the first key that is not a modifier alone, or of any key.
    check.onKeyup = anyKey => {
      const listener = event => {
        if (!anyKey && ['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) return;
        document.removeEventListener('keyup', listener, true);
        check.run();
      };
      document.addEventListener('keyup', listener, true);
    };
  });
  // Leave and regain focus through EditorView.focus, as the Editor does after its own controls.
  const refocus = hold => editor.evaluate((el, hold) => {
    const view = el.editor.view, check = window.__focusCheck;
    check.ran = false;
    view.dom.blur();
    check.arm = hold;
    view.focus();
    check.arm = false;
    if (hold && !check.held) throw new Error("ProseMirror's post-focus selection check was not scheduled; recheck the prosemirror-view patch");
  }, hold);
  // Tab from the final header control into the editor after selection has left it (as after a click elsewhere),
  // recording the browser caret before the engine handles focus.
  const tabIn = async () => {
    await editor.evaluate(el => el.addEventListener('focus', () => {
      const dom = getSelection();
      window.__focusDom = dom.anchorNode && el.contains(dom.anchorNode) ? el.editor.view.posAtDOM(dom.anchorNode, dom.anchorOffset) : null;
    }, {once: true, capture: true}));
    await page.getByRole('button', {name:'Close focus.md', exact:true}).focus();
    await page.evaluate(() => getSelection().removeAllRanges());
    await page.keyboard.press('Tab');
    assert(await editor.evaluate(el => el.editor.view.hasFocus()), 'Tab from the final tab control focuses the editor');
    const reset = await page.evaluate(() => window.__focusDom);
    assert(reset === 1, `The browser resets the DOM caret to the document start on focus: ${reset}`);
  };
  const settled = () => page.waitForFunction(() => window.__focusCheck.ran).then(() => page.waitForTimeout(100));

  // 1. The 20ms check runs after Control+End: the caret still reaches the document end.
  await caret('First paragraph.', 0);
  await refocus(true);
  await page.evaluate(() => window.__focusCheck.onKeyup(false));
  await page.keyboard.press('Control+End');
  await settled();
  const afterEnd = await state();
  assert(afterEnd.from === afterEnd.end && afterEnd.to === afterEnd.end, `Control+End after focus must reach the document end: ${JSON.stringify(afterEnd)}`);
  await typed('!', 'Focus|First paragraph.|Last paragraph.!', 'Typing after Control+End');

  // 2. Control+Home within 200ms of focus puts the caret at the document start by a key, not by a
  // browser reset, and stays there.
  await caret('First paragraph.', 5);
  await refocus(false);
  await page.keyboard.press('Control+Home');
  await page.waitForTimeout(250);
  await typed('^', '^Focus|First paragraph.|Last paragraph.!', 'Typing after Control+Home');

  // 3. Control: Tab from the final tab control lets the browser put the DOM caret at the document start;
  // the editor's caret is restored, and typing lands there.
  await caret('First paragraph.', 3);
  await tabIn();
  await page.waitForTimeout(250);
  await typed('X', '^Focus|FirXst paragraph.|Last paragraph.!', 'Typing after Tab focus');

  // 4. Control: a modifier pressed alone right after focus moves nothing, so focus still restores.
  await caret('FirXst paragraph.', 3);
  await tabIn();
  await page.keyboard.press('Shift');
  await page.waitForTimeout(250);
  await typed('Y', '^Focus|FirYXst paragraph.|Last paragraph.!', 'Typing after Tab focus and Shift');

  // 5. Control: the 20ms check still writes the editor's caret over a DOM caret that moved without
  // a key, also after a modifier alone. The change and the check share one task, so the check
  // runs before the change can be read.
  for (const [modifier, expected] of [[false, '^Focus|FirZYXst paragraph.|Last paragraph.!'], [true, '^Focus|FirWZYXst paragraph.|Last paragraph.!']]) {
    await caret((await texts()).split('|')[1], 3);
    await refocus(true);
    if (modifier) await page.keyboard.press('Shift');
    await editor.evaluate(el => {
      const text = [...el.editor.view.dom.querySelectorAll('p')].at(-1).firstChild;
      getSelection().collapse(text, text.length);
      window.__focusCheck.run();
    });
    await page.waitForTimeout(100);
    const restored = await state();
    assert(restored.dom.endsWith('@3') && restored.dom.startsWith('Fir'), `The focus check restores the editor caret${modifier ? ' after a modifier' : ''}: ${JSON.stringify(restored)}`);
    await typed(modifier ? 'W' : 'Z', expected, 'Typing after the focus check');
  }
  // #429: native document-end navigation stops inside a final caption/cell. Reuse the
  // delayed focus check above to cover the first shortcut immediately after refocus too.
  // Save the earlier focus probes so the later platform reload has no recovery prompt.
  await page.getByRole('button', {name:'Save', exact:true}).click();
  await page.locator('[data-testid="status"][data-operation="saved"]').waitFor({state:'attached'});
  const failures = [];
  for (const kind of ['figure', 'table']) {
    await openPath(page, file.replace('focus.md', `final-${kind}.md`));
    const original = await editor.evaluate(el => el.editor.state.doc.toJSON());
    await caret('First paragraph.', 0);
    const anchor = (await state()).from;
    await page.keyboard.press('Control+Shift+End');
    // Native selectionchange is asynchronous; wait for ProseMirror to read it.
    await page.waitForFunction(anchor => {
      const {selection} = document.querySelector('[data-document-tab][data-active=true] .document-editor').editor.state;
      return selection.from === anchor && selection.to > anchor;
    }, anchor, {timeout: 5000});
    const selected = await state();
    assert(selected.from === anchor && selected.to > anchor, `Control+Shift+End keeps native selection for ${kind}: ${JSON.stringify(selected)}`);
    assert(JSON.stringify(await editor.evaluate(el => el.editor.state.doc.toJSON())) === JSON.stringify(original), `Selection must not append prose after ${kind}`);
    await caret('First paragraph.', 0);
    await refocus(true);
    await page.evaluate(() => window.__focusCheck.onKeyup(false));
    await page.keyboard.press('Control+End');
    await settled();
    const reached = await editor.evaluate(el => {
      const {doc, selection} = el.editor.state;
      return {parent: selection.$from.parent.type.name, depth: selection.$from.depth,
        from: selection.from, to: selection.to, end: doc.content.size - 1};
    });
    if (reached.parent !== 'paragraph' || reached.depth !== 1 || reached.from !== reached.end || reached.to !== reached.end) {
      failures.push(`${kind}: ${JSON.stringify(reached)}`);
      continue;
    }
    await page.keyboard.press('Control+End');
    assert(await editor.evaluate(el => el.editor.state.doc.childCount) === original.content.length + 1, `Repeated Control+End reuses the final paragraph after ${kind}`);
    await page.keyboard.type('After block.');
    const changed = await editor.evaluate(el => el.editor.state.doc.toJSON());
    assert(JSON.stringify(changed.content.slice(0, -1)) === JSON.stringify(original.content), `Typing after ${kind} preserves the original blocks`);
    assert(changed.content.at(-1).type === 'paragraph' && changed.content.at(-1).content[0].text === 'After block.', `Typing lands after ${kind}`);
    await page.getByRole('button', {name:'Save', exact:true}).click();
    await page.locator('[data-testid="status"][data-operation="saved"]').waitFor({state:'attached', timeout:10000});
  }
  assert(!failures.length, `Control+End must leave final blocks after focus: ${failures.join('; ')}`);

  // Exercise the Apple keymap in the same persistent browser. This is platform
  // emulation on Chromium, not a native macOS keyboard/OS verification.
  await page.addInitScript(() => Object.defineProperty(navigator, 'platform', {configurable:true, get:() => 'MacIntel'}));
  await page.reload();
  await ready();
  for (const kind of ['figure', 'table']) {
    await openPath(page, file.replace('focus.md', `final-${kind}.md`));
    for (const key of ['Meta+End', 'Meta+ArrowDown']) {
      // Remove the test's trailing prose to make the original block final again.
      await editor.evaluate(el => {
        const {doc} = el.editor.state;
        if (doc.lastChild.type.name !== 'paragraph') throw new Error('Missing test prose');
        el.editor.commands.deleteRange({from: doc.content.size - doc.lastChild.nodeSize, to: doc.content.size});
      });
      await caret('First paragraph.', 0);
      await page.keyboard.press(key);
      const reached = await editor.evaluate(el => {
        const {doc, selection} = el.editor.state;
        return selection.empty && selection.$from.depth === 1 &&
          selection.$from.parent.type.name === 'paragraph' && selection.to === doc.content.size - 1;
      });
      assert(reached, `${key} reaches prose after the final ${kind} on the Apple keymap`);
    }
  }
  return {controlEndAfterFocusCheck: true, controlHomeAfterFocus: true, tabFocusRestores: true, modifierKeepsRestore: true, focusCheckRestores: true, finalBlockDocumentEnd: true, nativeShiftEnd: true, appleDocumentEndKeymap: true};
}
