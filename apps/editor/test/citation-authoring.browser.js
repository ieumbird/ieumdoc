// Citation authoring: slash search and insertion, the citation form's key group and role,
// Cancel/Apply/Remove, Undo/Redo and Save → Reload. The external BibTeX file is never written.
async (page, { openFolderPicker, openPath, waitForActivePath, reloadDocument, waitForEditorFocus, bibliographyFixture }) => {
  page.setDefaultTimeout(15000);
  const assert = (ok, message) => { if (!ok) throw Error(message); };
  const ready = () => page.locator('[data-testid="status"][data-operation="ready"]').waitFor({ state: 'attached' });
  const origin = page.url().split('/').slice(0, 3).join('/');
  const initial = await (await page.request.get(origin + '/api/document')).json();
  const sep = initial.path.includes('\\') ? '\\' : '/';
  const root = [...initial.path.split(sep).slice(0, -4), 'tmp', 'bibliography'].join(sep);
  const file = [root, 'chapters', 'authoring.md'].join(sep);
  const readSource = async () => (await (await page.request.get(`${origin}/api/document?path=${encodeURIComponent(file)}`)).json()).source;
  const bibHash = bibliographyFixture.hash();
  // Reopen from the common folder so the tab may read ../refs.bib (the chapter folder alone may not).
  await openPath(page, file);
  const sidebar = page.getByTestId('sidebar');
  const expand = page.getByRole('button', { name: 'Expand Explorer', exact: true });
  if (await expand.isVisible()) await expand.click();
  await openFolderPicker(page);
  await page.getByTestId('folder-path').fill(root);
  await page.getByTestId('folder-open').click();
  await page.getByRole('dialog', { name: 'Open folder', exact: true }).waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Close authoring.md', exact: true }).click();
  // The chapter folder opened first stays open too; use the common folder's own tree.
  const common = sidebar.locator(`[data-testid="folder"][data-root=${JSON.stringify(root)}]`);
  const chapters = common.getByRole('treeitem', { name: 'chapters', exact: true });
  if (await chapters.getAttribute('aria-expanded') !== 'true') await chapters.click();
  await common.getByRole('treeitem', { name: 'authoring.md', exact: true }).click();
  await waitForActivePath(page, file); await ready();
  const editor = page.locator('[data-document-tab][data-active=true] .document-editor');
  const form = page.getByTestId('citation-form');
  const citations = () => editor.evaluate(element => {
    const found = [];
    element.editor.state.doc.descendants(node => { if (node.type.name === 'citation') found.push(`${node.attrs.role}:${node.attrs.keys.join(',')}`); });
    return JSON.stringify(found);
  });
  const chip = keys => editor.locator(`[data-citation][data-keys='${JSON.stringify(keys)}']`);
  const edit = async keys => {
    await chip(keys).hover();
    await chip(keys).getByTestId('citation-edit').click();
    await form.waitFor();
  };
  // Focus synchronously: Tiptap's focus command waits for an animation frame.
  await page.evaluate(() => {
    const instance = document.querySelector('[data-document-tab][data-active=true] .document-editor').editor;
    let end;
    instance.state.doc.forEach((node, position) => { if (node.textContent === 'Write here.') end = position + node.nodeSize - 1; });
    instance.commands.setTextSelection(end);
    instance.view.focus();
    if (!instance.view.hasFocus()) throw Error('Editor did not take focus');
  });

  // Slash search lists matching readable entries and inserts the chosen one as cite:p.
  await page.keyboard.type(' /feedb');
  await page.getByRole('menuitem', { name: /^conference · M\. Kim, “Feedback,”/ }).waitFor();
  await page.keyboard.press('Enter');
  assert(await citations() === JSON.stringify(['cite:p:article', 'cite:p:conference']), 'Slash search inserts the chosen entry as cite:p');
  assert(await chip(['conference']).locator('.cross-reference-chip').textContent() === '[2]', 'The new citation takes the next first-occurrence number');
  assert(!(await editor.innerText()).includes('/feedb'), 'The slash query is replaced');

  // The form refuses invalid keys, keeps typed keys the bibliography lacks, and Core canonicalizes the role.
  await page.keyboard.type(' /cite');
  await page.getByRole('menuitem', { name: 'Citation…', exact: true }).click();
  await form.waitFor();
  const keyInput = page.getByTestId('citation-key');
  const choices = form.getByRole('listbox', { name: 'Citation keys', exact: true });
  assert(await keyInput.getAttribute('role') === 'combobox' && await keyInput.getAttribute('aria-expanded') === 'true', 'Key search exposes an expanded combobox');
  assert(await keyInput.getAttribute('aria-controls') === await choices.getAttribute('id'), 'Combobox controls the bibliography list');
  assert(await choices.getByRole('option', { name: /article.*W\. Zhang.*Control Study/ }).count() === 1, 'Candidates show their key, author and title');
  await page.setViewportSize({ width: 640, height: 812 });
  // setViewportSize can return before the resize handler fits the overlay.
  // Wait for its actual placement; keep the overflow assertions below independent.
  await page.waitForFunction(() => {
    const form = document.querySelector('[data-testid="citation-form"]');
    if (!form) return false;
    const rect = form.getBoundingClientRect();
    return rect.left >= 0 && rect.right <= window.innerWidth;
  });
  const narrow = await form.evaluate(element => {
    const list = element.querySelector('[role="listbox"]');
    const rect = element.getBoundingClientRect();
    return { left: rect.left, right: rect.right, width: element.clientWidth, scroll: element.scrollWidth,
      listWidth: list.clientWidth, listScroll: list.scrollWidth, pageWidth: document.documentElement.scrollWidth };
  });
  assert(narrow.left >= 0 && narrow.right <= 640 && narrow.scroll <= narrow.width && narrow.listScroll <= narrow.listWidth && narrow.pageWidth <= 640,
    'Narrow candidate list stays within its form and viewport: ' + JSON.stringify(narrow));
  await page.setViewportSize({ width: 1280, height: 720 });
  await keyInput.fill('feedb');
  assert(await choices.getByRole('option').count() === 1, 'Title filters the loaded entries');
  await keyInput.press('ArrowDown');
  const active = await keyInput.getAttribute('aria-activedescendant');
  assert(active && await choices.getByRole('option').getAttribute('id') === active, 'Arrow navigation exposes the active candidate');
  await keyInput.press('Enter');
  assert(await form.getByTestId('citation-keys').locator('[data-key="conference"]').count() === 1, 'Enter adds the selected candidate without submitting the form');
  assert(await keyInput.evaluate(input => input === document.activeElement), 'Selection keeps input focus');
  await form.getByRole('button', { name: 'Remove key conference', exact: true }).click();
  await keyInput.fill('zhang');
  assert(await choices.getByRole('option').count() === 1, 'Author filters the loaded entries');
  await choices.getByRole('option').click();
  await form.getByRole('button', { name: 'Remove key article', exact: true }).click();
  await keyInput.fill('');
  await keyInput.press('ArrowDown');
  const first = await keyInput.getAttribute('aria-activedescendant');
  await keyInput.press('ArrowDown');
  assert(await keyInput.getAttribute('aria-activedescendant') !== first, 'Down moves to the next candidate');
  await keyInput.press('ArrowUp');
  assert(await keyInput.getAttribute('aria-activedescendant') === first, 'Up returns to the previous candidate');
  // Browser-dispatched composition events exercise both native isComposing and legacy 229 paths.
  await keyInput.dispatchEvent('compositionstart', { data: '한' });
  for (const key of ['ArrowDown', 'ArrowUp', 'Enter', 'Escape']) {
    await keyInput.dispatchEvent('keydown', { key, code: key, isComposing: true });
    assert(await keyInput.getAttribute('aria-activedescendant') === first, `IME ${key} does not navigate or select`);
  }
  assert(await form.getByTestId('citation-keys').count() === 0 && await form.isVisible(), 'Composition does not add keys or apply/cancel the form');
  await keyInput.dispatchEvent('compositionend', { data: '한' });
  await keyInput.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 229 });
  assert(await form.getByTestId('citation-keys').count() === 0 && await form.isVisible(), 'Legacy IME Enter cannot add a highlighted candidate or submit');
  await keyInput.fill('한글');
  assert(await choices.getByRole('option', { name: /unicode.*한글/ }).count() === 1, 'Committed Korean text filters candidates');
  for (const arrow of ['ArrowDown', 'ArrowUp']) {
    await keyInput.press('Escape');
    assert(await keyInput.getAttribute('aria-expanded') === 'false' && await form.isVisible() && await keyInput.inputValue() === '한글', 'Escape closes suggestions and preserves the draft');
    assert(!await choices.isVisible() && !await keyInput.getAttribute('aria-activedescendant'), 'A dismissed list exposes no active candidate');
    await keyInput.press(arrow);
    const reopened = await keyInput.getAttribute('aria-activedescendant');
    assert(await choices.isVisible() && reopened && reopened === await choices.getByRole('option').getAttribute('id'), `${arrow} reopens the list with the matching candidate active`);
  }
  await keyInput.press('Enter');
  assert(await form.getByTestId('citation-keys').locator('[data-key="unicode"]').count() === 1, 'Enter after reopening adds the candidate key, not the search text');
  await form.getByRole('button', { name: 'Remove key unicode', exact: true }).click();
  await page.getByTestId('citation-key').fill('bad key');
  await page.getByTestId('citation-add').click();
  assert(await form.getByRole('alert').isVisible(), 'An invalid key is refused in the form');
  await page.getByTestId('citation-key').fill('missing-key');
  await page.getByTestId('citation-key').press('Enter');
  await page.getByTestId('citation-key').fill('book');
  await page.getByTestId('citation-role').selectOption('cite');
  await page.getByTestId('citation-apply').click();
  await form.waitFor({ state: 'detached' });
  const inserted = JSON.stringify(['cite:p:article', 'cite:p:conference', 'cite:t:missing-key,book']);
  assert(await citations() === inserted, 'A pending typed key joins the group and multi-key cite becomes cite:t');
  assert(await chip(['missing-key', 'book']).getAttribute('data-readiness') === 'unresolved', 'A key absent from the bibliography stays citable and unresolved');
  assert(!(await editor.innerText()).includes('/cite'), 'The slash query is consumed by the form');

  // Cancel changes nothing; Apply replaces role and keys; Remove deletes the atom only.
  await edit(['article']);
  // B1's retained inline exception: no enlarged invisible target over adjacent text/keys.
  const tiny = await page.locator('[data-citation] .cross-reference-edit').first().evaluate(edit => {
    const remove=document.querySelector('.citation-key-remove');
    if(!remove)throw Error('Missing citation key remove control');
    const probe=document.createElement('span');probe.style.borderRadius='var(--id-radius-sm)';document.body.append(probe);
    const radius=getComputedStyle(probe).borderRadius;probe.remove();
    return [edit,remove].map(n=>{const r=n.getBoundingClientRect(),s=getComputedStyle(n);
      return {width:r.width,height:r.height,line:s.lineHeight,radius:s.borderRadius,expectedRadius:radius};});
  });
  assert(tiny.every((m,i)=>m.width===(i?16:18)&&m.height===(i?16:18)&&m.line==='0px'&&m.radius===m.expectedRadius),
    `Inline control exception changed: ${JSON.stringify(tiny)}`);
  await page.getByTestId('citation-role').selectOption('cite:t');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await form.waitFor({ state: 'detached' });
  assert(await citations() === inserted, 'Escape cancels the form without changes');
  await edit(['article']);
  assert(await page.getByTestId('citation-role').inputValue() === 'cite:p', 'The form opens with the stored role');
  await form.getByRole('button', { name: 'Remove key article', exact: true }).click();
  await page.getByTestId('citation-key').fill('standard');
  await page.getByTestId('citation-apply').click();
  await form.waitFor({ state: 'detached' });
  assert(await citations() === JSON.stringify(['cite:p:standard', 'cite:p:conference', 'cite:t:missing-key,book']), 'Apply replaces the key group');
  await edit(['conference']);
  await page.getByTestId('citation-remove').click();
  const removed = JSON.stringify(['cite:p:standard', 'cite:t:missing-key,book']);
  assert(await citations() === removed, 'Remove deletes the citation atom');
  assert((await editor.innerText()).includes('Write here.'), 'Surrounding text remains');
  await waitForEditorFocus(page);

  await page.keyboard.press('Control+z');
  assert(JSON.parse(await citations()).includes('cite:p:conference'), 'Undo restores the removed citation');
  await page.keyboard.press('Control+Shift+z');
  assert(await citations() === removed, 'Redo removes it again');

  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.locator('[data-testid="status"][data-operation="saved"]').waitFor({ state: 'attached' });
  const saved = await readSource();
  assert(saved.includes('{cite:p}`standard`') && saved.includes('{cite:t}`missing-key,book`') && !saved.includes('conference'), 'Save writes explicit roles and key groups');
  assert(bibliographyFixture.hash() === bibHash, 'Authoring never writes the BibTeX file');
  await reloadDocument(page); await ready();
  assert(await citations() === removed, 'Save → Reload keeps roles and key groups');
  // Exercise the same insertion paths on every supported inline surface, then persist them.
  const nestedFile = [root, 'chapters', 'nested.md'].join(sep);
  await openPath(page, nestedFile);
  // #542: real code click -> immediate shortcut -> Escape -> typing, including a
  // held engine post-focus check. Observe restoration within the focus event,
  // before a later selectionchange or timer could hide a missing synchronous write.
  const codeFocusCases = [];
  for (const holdCheck of [false, true]) {
    await editor.evaluate(element => {
      const probe = window.codeFocusProbe = { events: new AbortController() };
      element.addEventListener('pointerdown', () => { probe.clicked = performance.now(); }, { signal: probe.events.signal });
      element.addEventListener('keydown', event => {
        if ((event.ctrlKey || event.metaKey) && event.key === '/') probe.openClickAge = performance.now() - probe.clicked;
      }, { signal: probe.events.signal });
    });
    await editor.locator('pre').filter({ hasText: 'Code.' }).click();
    await page.waitForFunction(() => {
      const e = document.querySelector('[data-document-tab][data-active=true] .document-editor').editor;
      const native = getSelection();
      return e.state.selection.$from.parent.type.name === 'codeBlock' && native.isCollapsed &&
        e.view.dom.contains(native.anchorNode) && e.view.posAtDOM(native.anchorNode, native.anchorOffset) === e.state.selection.from;
    });
    const clickedCaret = await editor.evaluate(element => element.editor.state.selection.from);
    await page.keyboard.press('ControlOrMeta+/');
    const codeCenter = page.getByRole('dialog', { name: 'Command center', exact: true });
    await codeCenter.getByRole('combobox').waitFor();
    await editor.evaluate(element => {
      const view = element.editor.view, probe = window.codeFocusProbe;
      const snapshot = () => {
        const native = getSelection(), selection = view.state.selection;
        return { from: selection.from, to: selection.to, parent: selection.$from.parent.type.name,
          native: native.isCollapsed && view.dom.contains(native.anchorNode)
            ? view.posAtDOM(native.anchorNode, native.anchorOffset) : null };
      };
      let focusEvent;
      // ProseMirror registered its non-capture listener when creating this view.
      // Capture precedes it; our later non-capture listener follows it at the same target.
      view.dom.addEventListener('focus', event => {
        focusEvent = event;
        probe.beforeFocus = snapshot();
      }, { capture: true, once: true, signal: probe.events.signal });
      view.dom.addEventListener('focus', event => {
        probe.sameFocusEvent = event === focusEvent;
        probe.afterFocus = snapshot();
      }, { once: true, signal: probe.events.signal });
    });
    if (holdCheck) await page.evaluate(() => {
      const schedule = window.setTimeout;
      window.codeFocusProbe.restore = () => { window.setTimeout = schedule; };
      window.setTimeout = (callback, ms, ...args) => {
        if (ms === 20 && String(callback).includes('selectionToDOM')) {
          window.codeFocusProbe.check = callback;
          return 0;
        }
        return schedule(callback, ms, ...args);
      };
    });
    try {
      await page.keyboard.press('Escape');
      await codeCenter.waitFor({ state: 'detached' });
      await waitForEditorFocus(page);
      const returned = await editor.evaluate((element, clickedCaret) => {
        const e = element.editor, native = getSelection();
        const probe = window.codeFocusProbe;
        return { openClickAge: probe.openClickAge, clickedCaret,
          beforeFocus: probe.beforeFocus, afterFocus: probe.afterFocus, sameFocusEvent: probe.sameFocusEvent,
          retained: e.state.selection.from === clickedCaret && native.isCollapsed &&
            e.view.dom.contains(native.anchorNode) && e.view.posAtDOM(native.anchorNode, native.anchorOffset) === clickedCaret,
          checkHeld: typeof window.codeFocusProbe.check === 'function' };
      }, clickedCaret);
      await page.keyboard.type(' /');
      const typed = await editor.evaluate(element => ({
        parent: element.editor.state.selection.$from.parent.type.name,
        text: element.editor.state.selection.$from.parent.textContent,
      }));
      const menus = await page.getByRole('menu', { name: 'Insert block', exact: true }).count();
      codeFocusCases.push({ holdCheck, ...returned, ...typed, menus });
    } finally {
      await page.evaluate(() => {
        const probe = window.codeFocusProbe;
        probe.events.abort();
        probe.restore?.();
        probe.check?.();
      });
    }
    await page.keyboard.press('Escape');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
  }
  for (const { holdCheck, openClickAge } of codeFocusCases) {
    assert(Number.isFinite(openClickAge) && openClickAge < 300,
      `Code focus regression missed the upstream 300ms click window: pointerdown -> Ctrl+/ took ${openClickAge}ms (held check: ${holdCheck})`);
  }
  assert(codeFocusCases.every(c => c.sameFocusEvent && c.beforeFocus?.native === 1 &&
    c.beforeFocus.parent === 'codeBlock' && c.beforeFocus.from === c.clickedCaret && c.beforeFocus.to === c.clickedCaret),
    'Focus must actually encounter a native document-start reset with the retained code caret: ' + JSON.stringify(codeFocusCases));
  assert(codeFocusCases.every(c => c.afterFocus?.native === c.clickedCaret &&
    c.afterFocus.parent === 'codeBlock' && c.afterFocus.from === c.clickedCaret && c.afterFocus.to === c.clickedCaret),
    'The same focus event must synchronously restore native/engine code-caret agreement: ' + JSON.stringify(codeFocusCases));
  assert(codeFocusCases.every(c => c.retained && c.parent === 'codeBlock' && c.text === 'Code. /' &&
    c.menus === 0 && (!c.holdCheck || c.checkHeld)),
    'A recent real code click survives Command center Escape: ' + JSON.stringify(codeFocusCases));
  const caret = async (text, replace = false) => editor.evaluate((element, { text, replace }) => {
    const instance = element.editor;
    let range;
    instance.state.doc.descendants((node, pos) => {
      if (node.isTextblock && node.textContent === text) range = { from: pos + 1, to: pos + node.nodeSize - 1 };
    });
    if (!range) throw Error(`Missing inline surface ${text}`);
    instance.commands.setTextSelection(replace ? range : range.to);
    instance.view.focus();
  }, { text, replace });
  const menu = page.getByRole('menu', { name: 'Insert block', exact: true });
  await caret('Only citation', true);
  await page.keyboard.type('/');
  await menu.waitFor();
  const insertArticle = async () => {
    await page.keyboard.type('article');
    await menu.getByRole('menuitem', { name: /^article ·/ }).waitFor();
    await page.keyboard.press('Enter');
  };
  await insertArticle();
  const citationOnly = () => editor.evaluate(element => {
    let found = false;
    element.editor.state.doc.descendants(node => {
      if (node.type.name === 'listItem' && node.firstChild?.childCount === 1 && node.firstChild.firstChild.type.name === 'citation') found = true;
    });
    return found;
  });
  assert(await citationOnly(), 'A list item may contain only a citation');
  const checkInsertionAvailability = async (allowed, location) => {
    const caretBefore = await editor.evaluate(element => element.editor.state.selection.from);
    await page.keyboard.press('ControlOrMeta+/');
    const center = page.getByRole('dialog', { name: 'Command center', exact: true });
    await center.getByRole('combobox').fill('> insert');
    for (const name of ['Insert citation…', 'Insert cross-reference…']) {
      assert((await center.getByRole('option', { name, exact: true }).getAttribute('aria-disabled') !== 'true') === allowed,
        `${location}: ${name} follows inline caret eligibility`);
    }
    if (allowed) {
      await center.getByRole('option', { name: 'Insert citation…', exact: true }).click();
      await center.waitFor({ state: 'detached' });
      await form.waitFor();
      await form.and(page.locator(':focus-within')).waitFor();
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      await form.waitFor({ state: 'detached' });
    } else {
      await page.keyboard.press('Escape');
      await center.waitFor({ state: 'detached' });
    }
    await waitForEditorFocus(page);
    if (location === 'Definition.') {
      assert(await editor.evaluate(element => element.editor.state.selection.node?.type.name) === 'footnoteDefinition', 'Leaving an endnote for Command center returns to its read-only selection');
    } else {
      assert(await editor.evaluate(element => element.editor.state.selection.from) === caretBefore, `${location}: center dismissal retains caret`);
    }
  };
  const surfaces = ['Item.', 'Nested item.', 'Quote.', 'Callout.', 'Header', 'Cell.', 'Caption.', 'Heading.', 'Nested inline', 'Definition.'];
  for (const text of surfaces) {
    if (text === 'Definition.') await editor.getByTestId('footnote-definition').filter({hasText: text}).locator('p').dblclick();
    await caret(text);
    await checkInsertionAvailability(true, text);
    if (text === 'Definition.') {
      await editor.getByTestId('footnote-definition').filter({hasText: text}).locator('p').dblclick();
      await caret(text, true);
      await page.keyboard.press('Tab');
      const toolbar = page.getByTestId('selection-toolbar');
      await toolbar.getByRole('button', {name: 'Bold', exact: true}).focus();
      await page.keyboard.press('Enter');
      assert(await editor.getByTestId('footnote-definition').filter({hasText: text}).getAttribute('aria-readonly') === 'false', 'Formatting toolbar retains the endnote edit session');
      assert(await editor.getByTestId('footnote-definition').filter({hasText: text}).locator('strong').count() === 1, 'Formatting applies inside the endnote');
      await caret(text);
    }
    await page.keyboard.type(' /');
    await menu.waitFor();
    const names = await menu.getByRole('menuitem').allTextContents();
    assert(names.every(name => /^(Endnote|Citation…|Section reference:)/.test(name.trim())), `${text}: only inline commands are offered: ${names}`);
    assert(await menu.getByRole('menuitem', { name: 'Endnote', exact: true }).count() === (text === 'Definition.' ? 0 : 1), `${text}: Endnote follows the Core definition restriction`);
    await insertArticle();
    if (text === 'Definition.') {
      await page.keyboard.type(' /cite');
      await menu.getByRole('menuitem', {name: 'Citation…', exact: true}).click();
      await form.waitFor();
      assert(await editor.getByTestId('footnote-definition').filter({hasText: text}).getAttribute('aria-readonly') === 'false', 'Citation form retains its endnote edit session');
      await page.getByTestId('citation-key').fill('article');
      await page.getByTestId('citation-apply').click();
      await form.waitFor({state: 'detached'});
      assert(await editor.getByTestId('footnote-definition').filter({hasText: text}).getAttribute('aria-readonly') === 'false', 'Citation Apply returns to the same endnote');
      await page.keyboard.type(' /cite');
      await menu.getByRole('menuitem', {name: 'Citation…', exact: true}).click();
      await form.waitFor();
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      await form.waitFor({state: 'detached'});
      assert(await editor.getByTestId('footnote-definition').filter({hasText: text}).getAttribute('aria-readonly') === 'false', 'Closing the citation form does not close the endnote');
    }
    await page.keyboard.type(' /reference');
    await menu.getByRole('menuitem', { name: 'Section reference: Target', exact: true }).click();
    if (text !== 'Definition.') {
      await page.keyboard.type(' /endnote');
      await menu.getByRole('menuitem', { name: 'Endnote', exact: true }).waitFor();
      await page.keyboard.press('Enter');
      await page.keyboard.type(`Note for ${text}`);
    }
  }
  await caret('Body.');
  await checkInsertionAvailability(true, 'Ordinary paragraph caret');
  await caret('Body.', true);
  await checkInsertionAvailability(false, 'Ordinary paragraph text selection');
  await caret('Code.');
  await checkInsertionAvailability(false, 'Code');
  await page.keyboard.type(' /');
  assert(await menu.count() === 0, 'Code keeps literal slash input');
  assert(await editor.evaluate(element => {
    const { $from } = element.editor.state.selection;
    return $from.parent.type.name === 'codeBlock' && $from.parent.textContent === 'Code. /';
  }), 'The literal slash is inserted in Code');
  // Code edits with newly added endnotes hit a pre-existing, separate Core count check.
  // Restore this literal probe; this scenario persists the supported inline insertions above.
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  const saveResponse = page.waitForResponse(response => response.url().endsWith('/api/document') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const response = await saveResponse;
  assert(response.ok(), `Nested Save failed: ${await response.text()}`);
  await page.locator('[data-testid="status"][data-operation="saved"]').waitFor({ state: 'attached' });
  const nestedSaved = (await (await page.request.get(`${origin}/api/document?path=${encodeURIComponent(nestedFile)}`)).json()).source;
  assert(nestedSaved.includes('{cite:p}`article`') && !nestedSaved.includes('Only citation'), 'Save writes the explicit citation and removes the replaced list text');
  const inlineContent = () => editor.evaluate(element => {
    const blocks = [];
    element.editor.state.doc.descendants(node => {
      if (node.isTextblock) blocks.push({ type: node.type.name, content: node.content.toJSON() });
    });
    return JSON.stringify(blocks);
  });
  const nestedContent = await inlineContent();
  await reloadDocument(page); await ready();
  assert(await citationOnly(), 'Save → Reload retains the citation-only list item');
  assert(await inlineContent() === nestedContent, 'Save → Reload retains exact inline content on every supported surface, including new endnote definitions');
  const readonlyNote = editor.getByTestId('footnote-definition').filter({hasText: 'Definition.'});
  assert(await readonlyNote.getAttribute('aria-readonly') === 'true', 'Reloaded definition is read-only');
  const readonlyCitation = readonlyNote.locator('[data-citation]').first();
  await readonlyCitation.hover();
  assert(await readonlyCitation.getByTestId('citation-edit').count() === 0, 'A read-only citation has no edit entry point');
  assert(await readonlyNote.getByTestId('cross-reference-edit').count() === 0, 'Read-only references have no edit entry points');
  const unresolved = readonlyNote.locator('[data-testid="cross-reference"][data-label="missing"]');
  assert(await unresolved.getAttribute('data-resolved') === 'false', 'Unresolved reference retains its reading status');
  await unresolved.locator('.cross-reference-chip').click();
  assert(await page.getByTestId('reference-form').count() === 0, 'An unresolved reference does not open an editor in a read-only definition');
  assert(await inlineContent() === nestedContent, 'Read-only inline controls do not change content');
  // The paragraph center can be a citation chip; enter through its definition text.
  await readonlyNote.locator('p').dblclick({position: {x: 8, y: 10}});
  await page.waitForFunction(() => document.querySelector('[data-document-tab][data-active=true] [data-testid="footnote-definition"][data-label="n"]')?.getAttribute('aria-readonly') === 'false');
  assert(await readonlyCitation.getByTestId('citation-edit').count() === 1, 'Citation editing becomes available in the active definition');
  await unresolved.locator('.cross-reference-chip').click();
  await page.getByTestId('reference-form').waitFor();
  await page.keyboard.press('Escape');
  await page.getByTestId('reference-form').waitFor({state: 'detached'});
  assert(await readonlyNote.getAttribute('aria-readonly') === 'false', 'Closing a reference form preserves the definition edit session');
  await page.keyboard.press('Escape');
  assert(await readonlyNote.getAttribute('aria-readonly') === 'true', 'A subsequent Escape exits the definition');
  await readonlyNote.locator('[data-testid="cross-reference"][data-label="section"] .cross-reference-chip').click();
  assert(await editor.evaluate(element => element.editor.state.selection.$from.parent.textContent.startsWith('Target')), 'Reference inside a read-only endnote still navigates');
  assert(await inlineContent() === nestedContent, 'Navigation in a read-only endnote does not edit content');
  // #374 + #377: these references came from the real nested slash menu, including
  // the document title, a heading and the Figure caption. Rename through the property form.
  const references = editor.getByTestId('cross-reference');
  const beforeRename = await inlineContent();
  const referenceCount = await references.count();
  assert(await editor.locator('h1 [data-testid="cross-reference"]').count() === 1 &&
    await editor.locator('figcaption [data-testid="cross-reference"]').count() === 1,
    'Nested slash references must be present in the title and Figure caption');
  await editor.locator('h2').filter({ hasText: /^Target$/ }).hover();
  await page.locator('[data-document-tab][data-active=true]').getByTestId('label-target-edit').click();
  await page.getByTestId('label-target-input').fill('section-renamed');
  await page.getByTestId('label-target-apply').click();
  await page.getByTestId('label-target-editor').waitFor({ state: 'detached' });
  const referencesFollow = async () => await references.count() === referenceCount && referenceCount > 0 &&
    await references.evaluateAll(nodes => nodes.filter(node => node.dataset.label === 'missing' && node.dataset.resolved === 'false').length === 1 &&
      nodes.filter(node => node.dataset.label !== 'missing').every(node => node.dataset.label === 'section-renamed' && node.dataset.resolved === 'true'));
  assert(await referencesFollow(), 'All slash-inserted references follow the renamed section');
  await page.keyboard.press('ControlOrMeta+z');
  assert(await inlineContent() === beforeRename && await page.getByTestId('label-target').getAttribute('data-label') === 'section',
    'One Undo restores the section label and all nested inline references');
  await page.keyboard.press('ControlOrMeta+Shift+z');
  assert(await referencesFollow(), 'Redo reapplies the nested reference rename');
  const renamedContent = await inlineContent();
  const renameSave = page.waitForResponse(response => response.url().endsWith('/api/document') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  assert((await renameSave).ok(), 'Save accepts the nested reference rename');
  await page.locator('[data-testid="status"][data-operation="saved"]').waitFor({ state: 'attached' });
  await reloadDocument(page); await ready();
  assert(await referencesFollow() && await inlineContent() === renamedContent,
    'Save → Reload retains the renamed title, caption and other nested references');
  assert(bibliographyFixture.hash() === bibHash, 'Nested authoring never writes the BibTeX file');
  // #439: no slash or whitespace is needed after Korean text.
  const center = page.getByRole('dialog', { name: 'Command center', exact: true });
  const openInsert = async label => {
    await page.keyboard.press('ControlOrMeta+/');
    await center.getByRole('combobox').fill(label);
    await center.getByRole('option', { name: label, exact: true }).click();
    await center.waitFor({ state: 'detached' });
  };
  const snapshot = () => editor.evaluate(element => JSON.stringify(element.editor.state.doc.toJSON()));
  const position = () => editor.evaluate(element => element.editor.state.selection.from);
  const hasFocus = () => editor.evaluate(element => element.editor.view.hasFocus());
  await editor.evaluate(element => {
    const instance = element.editor;
    let bodyEnd;
    instance.state.doc.forEach((node, pos) => { if (node.type.name === 'paragraph') bodyEnd = pos + node.nodeSize - 1; });
    if (bodyEnd === undefined) throw Error('Missing body paragraph');
    instance.commands.setTextSelection(bodyEnd);
    instance.view.focus();
  });
  await page.keyboard.insertText('한글문장계속');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.type('/');
  assert(await menu.count() === 0, 'Slash after Korean text keeps its existing literal trigger rule');
  await page.keyboard.press('Backspace');
  const beforeInsert = await snapshot();
  const insertionCaret = await position();
  // A form button must not expose the retained body caret as an insertion destination.
  await openInsert('Insert citation…');
  await page.getByTestId('citation-key').press('Tab');
  assert(await page.getByTestId('citation-add').evaluate(button => button === document.activeElement),
    'Tab moves from the citation key to its Add button');
  await page.keyboard.press('ControlOrMeta+/');
  await center.getByRole('combobox').fill('> insert');
  for (const name of ['Insert citation…', 'Insert cross-reference…']) {
    assert(await center.getByRole('option', { name, exact: true }).getAttribute('aria-disabled') === 'true',
      `${name}: citation form button focus cannot insert at the leftover body caret`);
  }
  await page.keyboard.press('Enter');
  assert(await center.isVisible() && await snapshot() === beforeInsert, 'Disabled form-origin commands cannot change the document');
  await page.keyboard.press('Escape');
  await center.waitFor({ state: 'detached' });
  await editor.evaluate(element => element.editor.view.focus());
  for (const [label, testId] of [['Insert citation…', 'citation-form'], ['Insert cross-reference…', 'reference-form']]) {
    await openInsert(label);
    await page.getByTestId(testId).waitFor();
    if (testId === 'citation-form') await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.getByTestId(testId).waitFor({ state: 'detached' });
    assert(await hasFocus() && await position() === insertionCaret && await snapshot() === beforeInsert,
      `${label}: Escape preserves content, caret and editor focus`);
    await openInsert(label);
    await page.getByTestId(testId).waitFor();
    if (testId === 'citation-form') await page.getByTestId('citation-key').fill('article');
    await page.getByTestId(testId === 'citation-form' ? 'citation-apply' : 'reference-apply').click();
    assert(await hasFocus() && await position() === insertionCaret + 1, `${label}: insert at retained caret and return focus`);
    const applied = await snapshot();
    await page.keyboard.press('ControlOrMeta+z');
    assert(await snapshot() === beforeInsert, `${label}: one Undo removes only the insertion`);
    await page.keyboard.press('ControlOrMeta+Shift+z');
    assert(await snapshot() === applied, `${label}: Redo restores insertion`);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.locator('[data-testid="status"][data-operation="saved"]').waitFor({ state: 'attached' });
    await reloadDocument(page); await ready();
    assert(await snapshot() === applied, `${label}: Save → Reload retains exact content`);
    await editor.evaluate((element, pos) => {
      element.editor.commands.setTextSelection({ from: pos, to: pos + 1 });
      element.editor.commands.deleteSelection();
      element.editor.view.focus();
    }, insertionCaret);
    assert(await snapshot() === beforeInsert, 'Remove only the persisted probe atom');
  }
  try {
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByTestId('ui-language').selectOption('ko');
    await page.keyboard.press('Escape');
    await page.getByTestId('settings-dialog').waitFor({ state: 'detached' });
    await editor.evaluate((element, pos) => {
      element.editor.commands.setTextSelection(pos);
      element.editor.view.focus();
    }, insertionCaret);
    await page.keyboard.press('ControlOrMeta+/');
    const koreanCenter = page.getByRole('dialog', { name: '커맨드 센터', exact: true });
    await koreanCenter.getByRole('combobox').fill('삽입');
    for (const name of ['인용 삽입…', '상호 참조 삽입…']) {
      assert(await koreanCenter.getByRole('option', { name, exact: true }).isVisible(), `${name}: Korean insertion command is searchable`);
    }
    await page.keyboard.press('Escape');
    await koreanCenter.waitFor({ state: 'detached' });
  } finally {
    await page.evaluate(() => localStorage.setItem('ieumdoc.uiLanguage', 'en'));
  }
  return { codeFocusCases, commandInsertion: true, slashInsert: true, formInsert: true, editRemove: true, undoRedo: true, saveReload: true, nestedInline: true, citationOnlyList: true, nestedReferenceRename: true, bibHash };
}
