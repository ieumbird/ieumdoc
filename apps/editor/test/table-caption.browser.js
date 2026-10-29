// Rich caption editing must preserve every untouched inline element (#555).
async (page, { openPath, expect, reloadDocument, screenshots }) => {
  const origin = page.url().split('/').slice(0,3).join('/');
  const initial = await (await page.request.get(`${origin}/api/document`)).json();
  const separator = initial.path.includes('\\') ? '\\' : '/';
  const root = initial.path.split(separator).slice(0, -4).join(separator);
  const path = [root, 'tmp', 'table-caption', 'caption.md'].join(separator);
  const table = page.locator('[data-document-tab][data-active=true] [data-block="table"]');
  const caption = table.getByTestId('table-caption');
  const editor = page.locator('[data-document-tab][data-active=true] .document-editor');
  const tableJSON = () => editor.evaluate(element => {
    const table = JSON.parse(JSON.stringify(element.editor.getJSON().content.find(node => node.type === 'table')));
    if (table) delete table.attrs.sourcePath; // Opening-snapshot locators change when a moved document is reopened.
    return table;
  });
  const selectCaption = () => editor.evaluate(element => {
    const instance = element.editor;
    instance.state.doc.descendants((node,pos) => {
      if (node.type.name === 'tableCaption') instance.commands.setTextSelection({from:pos+1,to:pos+node.nodeSize-1});
    });
    instance.view.focus();
  });
  const save = async () => {
    await page.getByRole('button', {name:'Save',exact:true}).click();
    await page.getByText('Saved',{exact:true}).filter({visible:true}).waitFor();
    return (await (await page.request.get(`${origin}/document/caption.md?path=${encodeURIComponent(path)}`)).text()).replaceAll('\r\n','\n');
  };
  if (screenshots) {
    // Same scratch document and interaction state before and after the visual change.
    await openPath(page, [root, 'tmp', 'caption-placeholder', 'captions.md'].join(separator));
    for (const width of [1440, 640]) {
      await page.setViewportSize({width, height:1000});
      await page.evaluate(() => document.fonts.ready);
      const figures = page.locator('[data-document-tab][data-active=true] [data-block="figure"]');
      await figures.nth(2).locator('.mermaid-preview img').waitFor();
      await figures.locator('img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
      await table.hover();
      await page.screenshot({path:`tmp/caption-gap-721/comparison-${width}.png`});
    }
    const cases = [
      {selector:'[data-block="table"]', index:0, name:'table', width:1440, language:'en', theme:'light'},
      {selector:'[data-block="figure"]', index:0, name:'image', width:640, language:'ko', theme:'dark'},
      {selector:'[data-block="figure"]', index:1, name:'pending', width:1440, language:'ko', theme:'light'},
      {selector:'[data-block="figure"]', index:2, name:'mermaid', width:640, language:'en', theme:'dark'},
    ];
    for (const {selector,index,name,width,language,theme} of cases) {
      await page.setViewportSize({width,height:900});
      await page.evaluate(async ({language,theme}) => {
        await (await import('/src/i18n.ts')).i18n.changeLanguage(language);
        (await import('/src/theme.ts')).applyTheme(theme);
      }, {language,theme});
      await page.locator(`[data-document-tab][data-active=true] ${selector}`).nth(index).scrollIntoViewIfNeeded();
      await page.mouse.move(width-2,2);
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({path:`tmp/caption-placeholder-${name}.png`});
    }
  }
  // One shared rule covers table, image, pending and Mermaid captions.
  await openPath(page, [root, 'tmp', 'caption-placeholder', 'captions.md'].join(separator));
  const imageFigure = page.locator('[data-document-tab][data-active=true] [data-block="figure"]').first();
  await imageFigure.locator('img').evaluate(image => image.decode());
  // Compare relationships, including a changed public tuning value, rather than freezing pixels.
  for (const width of [1440, 640]) {
    await page.setViewportSize({width, height:1000});
    for (const gap of ['', 'var(--space-4)']) {
      await editor.evaluate((element, gap) => element.style.setProperty('--space-document-caption', gap), gap);
      await table.hover();
      await expect.poll(() => table.evaluate(block => {
        const rect = selector => block.querySelector(selector).getBoundingClientRect();
        const native = block.querySelector('table');
        const row = native.rows[native.rows.length - 1].getBoundingClientRect();
        const caption = rect('.table-caption .caption');
        const figure = block.closest('.document-editor').querySelector('[data-block="figure"]');
        const figureGap = figure.querySelector('figcaption').getBoundingClientRect().top - figure.querySelector('img').getBoundingClientRect().bottom;
        const actions = rect('.table-action-bar'), append = rect('[aria-label="Append row"]');
        const scroll = rect('.table-scroll');
        return Math.abs(caption.top - row.bottom - figureGap) < 1 && figureGap > 0 &&
          actions.top >= caption.bottom && append.top >= caption.bottom &&
          Math.abs(actions.top - append.top) < 1 && actions.bottom <= scroll.bottom &&
          scroll.right <= innerWidth && document.documentElement.scrollWidth <= innerWidth;
      }), `Shared caption gap and unobscured bottom tools at ${width}px (${gap || 'default'})`).toBe(true);
    }
  }
  await editor.evaluate(element => element.style.removeProperty('--space-document-caption'));
  await page.setViewportSize({width:1280, height:720});
  const surfaces = [
    page.locator('[data-document-tab][data-active=true] [data-block="table"] [data-testid="table-caption"] [data-node-view-content]'),
    ...[0,1,2].map(index => page.locator('[data-document-tab][data-active=true] [data-block="figure"]').nth(index).getByTestId('figure-caption-content')),
  ];
  const setCaret = index => editor.evaluate((element, index) => {
    const instance = element.editor;
    let found = 0;
    instance.state.doc.descendants((node, pos) => {
      if (node.type.name === (index === 0 ? 'tableCaption' : 'figure')) {
        if (found++ === (index === 0 ? 0 : index - 1)) instance.commands.setTextSelection(pos + 1);
      }
    });
  }, index);
  const leave = () => editor.evaluate(element => element.editor.commands.setTextSelection(1));
  // Exercise native character deletion independently for every caption kind. Keep going
  // after a failure so the pre-fix run records all four cases on fresh document state.
  const deletionFailures = [];
  for (let index = 0; index < surfaces.length; index++) {
    const name = ['table', 'image', 'pending', 'mermaid'][index];
    const surface = surfaces[index];
    try {
      await leave();
      const snapshot = () => editor.evaluate((element, index) => {
        const instance = element.editor, json = instance.getJSON();
        const block = index === 0 ? json.content.find(node => node.type === 'table') :
          json.content.filter(node => node.type === 'figure')[index - 1];
        const target = index === 0 ? block.content.find(node => node.type === 'tableCaption') : block;
        const text = (target.content || []).map(node => node.text || '').join('');
        target.content = [];
        return { text, other: json, offset: instance.state.selection.$head.parentOffset };
      }, index);
      const original = await snapshot();
      await surface.click();
      await surface.evaluate(element => {
        window.__captionMutations = [];
        window.__captionObserver?.disconnect();
        window.__captionObserver = new MutationObserver(records => {
          for (const record of records) for (const node of record.removedNodes) {
            window.__captionMutations.push({target:record.target.nodeName, removed:node.outerHTML || node.textContent});
          }
        });
        window.__captionObserver.observe(element.parentElement, {subtree:true, childList:true, characterData:true});
      });
      await page.keyboard.type('Temporary');
      await expect(surface).toHaveText('Temporary');
      expect((await snapshot()).text).toBe('Temporary');
      expect((await snapshot()).offset).toBe(9);
      // ProseMirror history's normal grouping timeout separates insertion from deletion.
      await page.waitForTimeout(600);
      for (let key = 1; key <= 12; key++) {
        await page.keyboard.press('Backspace');
        const expected = 'Temporary'.slice(0, Math.max(0, 9 - key));
        const state = await snapshot();
        const dom = await surface.count() ? await surface.evaluate(element => ({
          text:element.textContent, connected:!!element.querySelector('[data-node-view-content-react]')?.isConnected,
        })) : null;
        if (!dom || !dom.connected || dom.text !== expected || state.text !== expected || JSON.stringify(state.other) !== JSON.stringify(original.other)) {
          const mutations = await page.evaluate(() => window.__captionMutations);
          throw new Error(`${name} Backspace ${key}: expected=${JSON.stringify(expected)}, DOM=${JSON.stringify(dom)}, model=${JSON.stringify(state.text)}, surrounding=${JSON.stringify(state.other) === JSON.stringify(original.other)}, mutations=${JSON.stringify(mutations)}`);
        }
      }
      await page.keyboard.press('ControlOrMeta+z');
      await expect(surface).toHaveText('Temporary');
      expect((await snapshot()).text).toBe('Temporary');
      await page.keyboard.press('ControlOrMeta+Shift+z');
      await expect(surface).toHaveText('');
      expect((await snapshot()).text).toBe('');
      await leave();
      await expect(surface).toHaveAttribute('data-placeholder', index ? 'Enter a figure caption…' : 'Enter a table caption…');
      expect((await snapshot()).other).toEqual(original.other);
    } catch (error) {
      deletionFailures.push(`${name}: ${error.message}`);
    }
    await page.evaluate(() => window.__captionObserver?.disconnect());
    await reloadDocument(page);
    const discard = page.getByRole('button', {name:'Discard and reload', exact:true});
    if (await discard.count()) { await discard.click(); await page.getByRole('dialog').waitFor({state:'detached'}); }
  }
  expect(deletionFailures, 'Native repeated Backspace must retain every caption and surrounding content').toEqual([]);
  // Word deletion and native cut exercise different browser input paths from Backspace.
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  const wordFailures = [];
  for (let index = 0; index < surfaces.length; index++) {
    for (const mode of ['word-backward', 'word-forward', 'cut']) {
      const name = ['table', 'image', 'pending', 'mermaid'][index];
      const surface = surfaces[index];
      try {
        const state = () => editor.evaluate((element, index) => {
          const instance = element.editor, json = instance.getJSON();
          const block = index === 0 ? json.content.find(node => node.type === 'table') :
            json.content.filter(node => node.type === 'figure')[index - 1];
          const target = index === 0 ? block.content.find(node => node.type === 'tableCaption') : block;
          const text = (target.content || []).map(node => node.text || '').join('');
          target.content = [];
          return {text, other:json};
        }, index);
        await leave();
        const original = await state();
        await surface.click();
        await surface.evaluate(element => {
          window.__deletionEvents = [];
          element.closest('.document-editor').addEventListener('beforeinput', event => {
            if (!event.inputType.startsWith('delete')) return;
            const view = element.closest('.document-editor').editor.view;
            window.__deletionEvents.push({type:event.inputType, ranges:[...event.getTargetRanges()].map(range => {
              try { return [view.posAtDOM(range.startContainer,range.startOffset),view.posAtDOM(range.endContainer,range.endOffset)]; }
              catch { return null; }
            })});
          }, {capture:true, once:false, signal: (window.__deletionAbort = new AbortController()).signal});
        });
        await page.keyboard.type('alpha beta');
        await expect(surface).toHaveText('alpha beta');
        expect((await state()).text).toBe('alpha beta');
        await page.waitForTimeout(600);
        const undoTexts = ['alpha beta'];
        if (mode === 'word-forward') {
          await setCaret(index);
          await editor.evaluate(element => element.editor.view.focus());
        }
        if (mode === 'cut') {
          await surface.evaluate(element => {
            const instance = element.closest('.document-editor').editor;
            const from = instance.view.posAtDOM(element, 0);
            instance.commands.setTextSelection({from,to:from + instance.state.doc.resolve(from).parent.content.size});
            instance.view.focus();
          });
          await page.keyboard.press('ControlOrMeta+x');
          expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('alpha beta');
        } else {
          await page.keyboard.press(mode === 'word-backward' ? 'Control+Backspace' : 'Control+Delete');
          const intermediate = await state();
          expect(intermediate.text).not.toBe('');
          expect(intermediate.text).not.toBe('alpha beta');
          expect(await surface.textContent()).toBe(intermediate.text);
          undoTexts.push(intermediate.text);
          await page.keyboard.press(mode === 'word-backward' ? 'Control+Backspace' : 'Control+Delete');
        }
        const final = await state();
        const dom = await surface.count() ? await surface.evaluate(element => ({text:element.textContent,
          connected:!!element.querySelector('[data-node-view-content-react]')?.isConnected})) : null;
        if (!dom || !dom.connected || dom.text !== '' || final.text !== '' || JSON.stringify(final.other) !== JSON.stringify(original.other)) {
          const events = await page.evaluate(() => window.__deletionEvents);
          throw new Error(`${name} ${mode}: DOM=${JSON.stringify(dom)}, model=${JSON.stringify(final.text)}, surrounding=${JSON.stringify(final.other) === JSON.stringify(original.other)}, events=${JSON.stringify(events)}`);
        }
        await page.keyboard.press('ControlOrMeta+z');
        const undone = await state();
        expect(undoTexts).toContain(undone.text);
        expect(undone.other).toEqual(original.other);
        expect(await surface.textContent()).toBe(undone.text);
        await page.keyboard.press('ControlOrMeta+Shift+z');
        const redone = await state();
        expect(redone.text).toBe('');
        expect(redone.other).toEqual(original.other);
        await expect(surface).toHaveText('');
        await leave();
        await expect(surface).toHaveAttribute('data-placeholder', index ? 'Enter a figure caption…' : 'Enter a table caption…');
        expect((await state()).other).toEqual(original.other);
      } catch (error) {
        wordFailures.push(`${name} ${mode}: ${error.message}`);
      }
      await page.evaluate(() => window.__deletionAbort?.abort());
      await reloadDocument(page);
      const discard = page.getByRole('button', {name:'Discard and reload', exact:true});
      if (await discard.count()) { await discard.click(); await page.getByRole('dialog').waitFor({state:'detached'}); }
    }
  }
  expect(wordFailures, 'Word deletion and cut must preserve every caption and surrounding content').toEqual([]);
  // Preserve partial/selected edits, paste and actual Chromium composition on each surface.
  for (let index = 0; index < surfaces.length; index++) {
    const surface = surfaces[index];
    const modelText = () => editor.evaluate((element, index) => {
      const nodes = element.editor.getJSON().content;
      const block = index === 0 ? nodes.find(node => node.type === 'table').content.find(node => node.type === 'tableCaption') :
        nodes.filter(node => node.type === 'figure')[index - 1];
      return (block.content || []).map(node => node.text || '').join('');
    }, index);
    const range = (start, end = start) => surface.evaluate((element, {start,end}) => {
      const instance = element.closest('.document-editor').editor;
      const from = instance.view.posAtDOM(element, 0);
      instance.commands.setTextSelection({from:from + start,to:from + end});
      instance.view.focus();
    }, {start,end});
    const matches = async text => {
      await expect(surface).toHaveText(text);
      expect(await modelText()).toBe(text);
      expect(await surface.locator('[data-node-view-content-react]').count()).toBe(1);
    };
    await surface.click();
    await page.keyboard.type('abcde');
    await range(3);
    await page.keyboard.press('Backspace');
    await matches('abde');
    await page.keyboard.press('Delete');
    await matches('abe');
    await range(1,2);
    await page.keyboard.press('Backspace');
    await matches('ae');
    await page.evaluate(() => navigator.clipboard.writeText('X'));
    await range(2);
    await page.keyboard.press('ControlOrMeta+v');
    await matches('aeX');
    await page.keyboard.press('Backspace');
    await matches('ae');
    await range(0,2);
    await page.keyboard.press('Delete');
    await matches('');
    const cdp = await page.context().newCDPSession(page);
    try {
      await cdp.send('Input.dispatchKeyEvent', {type:'rawKeyDown', key:'Process', windowsVirtualKeyCode:229, nativeVirtualKeyCode:229});
      for (const text of ['한','하','ㅎ']) {
        await cdp.send('Input.imeSetComposition', {text,selectionStart:text.length,selectionEnd:text.length});
        expect(await editor.evaluate(element => element.editor.view.composing)).toBe(true);
        expect(await surface.locator('[data-node-view-content-react]').count()).toBe(1);
      }
      await cdp.send('Input.dispatchKeyEvent', {type:'rawKeyDown',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:229,nativeVirtualKeyCode:229});
      await cdp.send('Input.imeSetComposition', {text:'ㅎ',selectionStart:1,selectionEnd:1});
      await cdp.send('Input.insertText', {text:'ㅎ'});
      await page.waitForFunction(() => !document.querySelector('[data-document-tab][data-active=true] .document-editor').editor.view.composing);
    } finally { await cdp.detach(); }
    await matches('ㅎ');
    await reloadDocument(page);
    const discard = page.getByRole('button', {name:'Discard and reload',exact:true});
    if (await discard.count()) { await discard.click(); await page.getByRole('dialog').waitFor({state:'detached'}); }
  }
  await leave();
  for (const language of ['en', 'ko']) {
    await page.evaluate(async language => (await import('/src/i18n.ts')).i18n.changeLanguage(language), language);
    for (let index = 0; index < surfaces.length; index++) {
      const surface = surfaces[index];
      const hint = language === 'en' ? (index ? 'Enter a figure caption…' : 'Enter a table caption…') :
        (index ? '그림 캡션을 입력하세요...' : '표 캡션을 입력하세요...');
      await expect(surface).toHaveAttribute('data-placeholder', hint);
      await expect(surface).toHaveAccessibleName(language === 'en' ? (index ? 'Figure caption' : 'Table caption') : (index ? '그림 캡션' : '표 캡션'));
      expect(await surface.evaluate(element => getComputedStyle(element, '::before').fontStyle)).toBe('italic');
      await setCaret(index); // No DOM focus change: selection alone controls the hint.
      await expect(surface).not.toHaveAttribute('data-placeholder');
      await leave();
      await expect(surface).toHaveAttribute('data-placeholder', hint);
      await surface.click();
      await expect(surface).not.toHaveAttribute('data-placeholder');
      await page.keyboard.type('Temporary');
      await expect(surface).toHaveText('Temporary');
      await surface.evaluate(element => {
        const instance = element.closest('.document-editor').editor;
        const dom = instance.view.posAtDOM(element, 0);
        const parent = instance.state.doc.resolve(dom).parent;
        instance.commands.setTextSelection({from:dom, to:dom + parent.content.size});
        instance.view.focus();
      });
      await page.keyboard.press('Backspace');
      await expect(surface).not.toHaveAttribute('data-placeholder');
      await leave();
      await expect(surface).toHaveAttribute('data-placeholder', hint);
    }
  }
  await page.evaluate(async () => (await import('/src/i18n.ts')).i18n.changeLanguage('en'));
  await editor.evaluate(element => element.editor.setEditable(false));
  for (const surface of surfaces) await expect(surface).not.toHaveAttribute('data-placeholder');
  await editor.evaluate(element => element.editor.setEditable(true));
  for (const surface of surfaces) await expect(surface).toHaveAttribute('data-placeholder');
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await editor.evaluate(element => { element.editor.commands.selectAll(); element.editor.view.focus(); });
  await page.keyboard.press('ControlOrMeta+c');
  const copied = await page.evaluate(async () => {
    const items = await navigator.clipboard.read();
    return Promise.all(items.flatMap(item => item.types.filter(type => type === 'text/plain' || type === 'text/html')
      .map(async type => (await item.getType(type)).text())));
  });
  expect(copied.length).toBeGreaterThan(0);
  for (const text of copied) expect(text).not.toContain('Enter a');
  await leave();
  await page.getByTestId('view-source').click();
  expect(await page.getByTestId('source-view').innerText()).not.toContain('Enter a');
  await page.getByTestId('view-visual').click();
  await page.getByRole('button', {name:'Save',exact:true}).click();
  await page.getByText('Saved',{exact:true}).filter({visible:true}).waitFor();
  const fixturePath = [root, 'tmp', 'caption-placeholder', 'captions.md'].join(separator);
  const fixtureSource = await (await page.request.get(`${origin}/document/captions.md?path=${encodeURIComponent(fixturePath)}`)).text();
  expect(fixtureSource).not.toContain('Enter a');
  await openPath(page, path);
  await table.hover();
  await table.getByRole('button', {name:'Edit table',exact:true}).click();
  const original = await tableJSON();
  // Baseline reproduction uses its actual property field; the fixed UI edits the same word in place.
  if (await page.getByTestId('table-caption-input').count()) {
    await page.getByTestId('table-caption-input').fill('Updated with fig-a, alpha and x^2');
    await page.getByTestId('table-apply').click();
  } else {
    await expect(page.getByTestId('table-editor').getByRole('textbox', {name:'Label', exact:true})).toBeVisible();
    await expect(page.getByTestId('table-editor').getByRole('textbox', {name:'Number', exact:true})).toBeVisible();
    await page.getByTestId('table-cancel').click();
    await page.evaluate(() => {
      const editor = document.querySelector('[data-document-tab][data-active=true] .document-editor').editor;
      let range;
      editor.state.doc.descendants((node, pos) => {
        if (node.isText && node.text === 'Results') range = {from:pos,to:pos+node.nodeSize};
      });
      editor.commands.setTextSelection(range);
      editor.view.focus();
    });
    await page.keyboard.type('Updated');
    const updated = await tableJSON();
    await page.keyboard.press('ControlOrMeta+z');
    expect(await tableJSON(), 'Undo restores the complete rich caption').toEqual(original);
    await page.keyboard.press('ControlOrMeta+Shift+z');
    expect(await tableJSON(), 'Redo preserves inline atoms and formatting').toEqual(updated);
  }
  const saved = await save();
  expect(saved, 'Editing one caption word must preserve emphasis, reference, citation and math').toContain(
    '**Updated** with {numref}`fig-a`, {cite:p}`alpha` and $x^2$');
  expect(await page.getByTestId('table-caption-input').count(), 'Caption editing belongs in the document').toBe(0);
  await reloadDocument(page);
  expect(await caption.locator('strong').innerText()).toBe('Updated');
  expect(await caption.getByTestId('cross-reference').getAttribute('data-resolved')).toBe('true');
  expect(await caption.locator('.citation').count()).toBe(1);
  expect(await caption.locator('.katex').count()).toBe(1);
  // Native keys enter the caption from the final grid row, return to the grid, then leave the table.
  await table.locator('td').last().click();
  await page.waitForFunction(() => document.querySelector('[data-document-tab][data-active=true] .document-editor').editor.state.selection.$from.parent.type.name === 'tableCell');
  await page.keyboard.press('End');
  await page.keyboard.press('ArrowDown');
  const parent = () => editor.evaluate(element => element.editor.state.selection.$from.parent.type.name);
  expect(await parent()).toBe('tableCaption');
  await page.keyboard.press('ArrowUp');
  expect(await parent()).toBe('tableCell');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  expect(await parent()).toBe('paragraph');

  // Selection and slash authoring share the body's existing rich inline controls.
  await selectCaption();
  await page.getByTestId('selection-toolbar').waitFor();
  expect(await page.getByTestId('selection-toolbar').getByRole('button',{name:/^Bold/}).isVisible()).toBe(true);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.type(' /fig');
  await page.getByRole('menuitem',{name:/^Figure.*fig-a$/}).click();
  expect(await caption.getByTestId('cross-reference').count()).toBe(2);
  // Restore the saved snapshot before testing whole-table operations.
  await reloadDocument(page);
  await page.getByRole('button',{name:'Discard and reload',exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'detached'});
  const rich = await tableJSON();
  const index = await editor.evaluate(element => element.editor.getJSON().content.findIndex(node => node.type === 'table'));
  await page.locator('[data-document-tab][data-active=true] .block-handle').nth(index).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('menuitem',{name:'Move down',exact:true}).click();
  expect(await tableJSON(), 'Moving the table keeps its caption attached').toEqual(rich);
  const movedFile = await save();
  expect(movedFile.indexOf('After.')).toBeLessThan(movedFile.indexOf(':::{table}'));
  await reloadDocument(page);
  expect(await tableJSON()).toEqual(rich);
  await table.hover();
  await table.getByRole('button',{name:'Delete table',exact:true}).click();
  expect(await caption.count()).toBe(0);
  await page.keyboard.press('ControlOrMeta+z');
  expect(await tableJSON(), 'One Undo restores the table and rich caption').toEqual(rich);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  expect(await table.count()).toBe(0);
  await page.keyboard.press('ControlOrMeta+z');

  // Empty captions remain directly editable through Save/Reload, without a discovery action.
  await selectCaption();
  await page.keyboard.press('Backspace');
  await page.keyboard.press('ControlOrMeta+z');
  expect(await tableJSON(), 'Clearing the caption is undoable without changing the grid').toEqual(rich);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await table.getByLabel('Table caption',{exact:true}).click();
  expect(await caption.count(), 'An empty caption keeps its caret surface').toBe(1);
  const cleared = await save();
  expect(cleared).toContain(':::{table}\n:name: tbl-a');
  expect(cleared).not.toContain('**Updated**');
  await reloadDocument(page);
  expect(await caption.count()).toBe(1);
  expect(await caption.getAttribute('data-number')).toBe('Table 1');
  await table.hover();
  await table.getByRole('button',{name:'Edit table',exact:true}).click();
  await page.getByTestId('table-label').fill('');
  await page.getByTestId('table-apply').click();
  expect(await table.locator('.block-kind').textContent()).toBe('Table 1');
  expect(await caption.getAttribute('data-number'), 'Clearing the label keeps the official number immediately').toBe('Table 1');
  expect(await save()).toContain(':::{table}\n\n');
  await reloadDocument(page);
  expect(await caption.getAttribute('data-number'), 'Every table keeps its official number after Reload').toBe('Table 1');
  expect(await table.getByRole('button',{name:'Add caption',exact:true}).count()).toBe(0);
  const empty = await tableJSON();
  expect(await editor.evaluate(element => element.editor.can().undo()), 'Opening an empty caption creates no history').toBe(false);
  expect(await page.getByRole('tab',{selected:true}).getAttribute('aria-label')).not.toContain('Unsaved changes');
  await editor.evaluate(element => element.editor.setEditable(false));
  await expect(table.getByLabel('Table caption',{exact:true})).not.toHaveAttribute('data-placeholder');
  await editor.evaluate(element => element.editor.setEditable(true));
  await expect(table.getByLabel('Table caption',{exact:true})).toHaveAttribute('data-placeholder','Enter a table caption…');
  expect(await tableJSON(), 'Editable transitions preserve document content').toEqual(empty);
  expect(await editor.evaluate(element => element.editor.can().undo()), 'Editable transitions create no history').toBe(false);
  await table.locator('td').last().click();
  await page.waitForFunction(() => document.querySelector('[data-document-tab][data-active=true] .document-editor').editor.state.selection.$from.parent.type.name === 'tableCell');
  await page.keyboard.press('End');
  await page.keyboard.press('ArrowDown');
  expect(await parent(), 'ArrowDown also enters an empty caption').toBe('tableCaption');
  await expect(table.getByLabel('Table caption',{exact:true})).not.toHaveAttribute('data-placeholder');
  await page.keyboard.press('ArrowUp');
  expect(await parent()).toBe('tableCell');
  await expect(table.getByLabel('Table caption',{exact:true})).toHaveAttribute('data-placeholder','Enter a table caption…');
  await table.getByLabel('Table caption',{exact:true}).click();
  expect(await parent(), 'Clicking the empty surface places the engine caret immediately').toBe('tableCaption');
  await page.keyboard.press('Shift+Enter');
  expect(await tableJSON(), 'Captions refuse line breaks').toEqual(empty);
  await page.keyboard.type('Restored caption');
  expect(await caption.getAttribute('data-number')).toBe('Table 1');
  const restored = await tableJSON();
  await page.keyboard.press('ControlOrMeta+z');
  expect(await tableJSON(), 'One Undo returns to the original empty surface').toEqual(empty);
  expect(await caption.getAttribute('data-number'), 'Undoing caption entry does not remove the number').toBe('Table 1');
  await page.keyboard.press('ControlOrMeta+Shift+z');
  expect(await tableJSON()).toEqual(restored);
  expect(await save()).toContain(':::{table} Restored caption');
  await reloadDocument(page);
  expect(await caption.innerText()).toBe('Restored caption');
  return {richCaptionPreserved:true,history:true,keyboard:true,moveDelete:true,removeAdd:true,saveReload:true};
}
