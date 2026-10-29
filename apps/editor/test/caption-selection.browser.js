// Native triple clicks outside textblock contentDOM must not select a neighbor (#724, #735).
async (page, { openPath, expect, reloadDocument }) => {
  const origin = page.url().split('/').slice(0, 3).join('/');
  const initial = await (await page.request.get(origin + '/api/document')).json();
  const separator = initial.path.includes('\\') ? '\\' : '/';
  const root = initial.path.split(separator).slice(0, -4).join(separator);
  await openPath(page, [root, 'tmp', 'caption-selection', 'selection.md'].join(separator));
  const editor = page.locator('[data-document-tab][data-active=true] .document-editor');
  const failures = [];
  const cases = ['fig-a', 'fig-b', 'fig-single', 'tbl-a', 'fig-mermaid', 'fig-pending', 'code'];
  const restore = async () => {
    await reloadDocument(page);
    const discard = page.getByRole('button', {name:'Discard and reload', exact:true});
    if (await discard.count()) { await discard.click(); await page.getByRole('dialog').waitFor({state:'detached'}); }
  };
  const captionFor = label => label === 'code' ? editor.locator('.code-block pre') : label === 'tbl-a' ? editor.getByTestId('table-caption') :
    editor.locator('[data-block="figure"]').nth(cases.filter(value => value !== 'tbl-a').indexOf(label)).locator('figcaption');
  const snapshot = label => editor.evaluate((el, label) => {
    const e = el.editor, doc = e.getJSON();
    let from, to;
    e.state.doc.descendants((node, pos) => {
      if (node.attrs.label === label || (label === 'code' && node.type.name === 'codeBlock')) {
        if (node.type.name === 'table') {
          node.forEach((child, offset) => { if (child.type.name === 'tableCaption') { from = pos + offset + 2; to = from + child.content.size; } });
        } else { from = pos + 1; to = from + node.content.size; }
      }
    });
    let target = doc.content.find(node => node.attrs?.label === label || (label === 'code' && node.type === 'codeBlock'));
    if (target?.type === 'table') target = target.content.find(node => node.type === 'tableCaption');
    const text = target?.content?.map(node => node.text || '').join('') || '';
    if (target) target.content = [];
    return {doc, text, expected: {from, to}, selection: {from:e.state.selection.from, to:e.state.selection.to}};
  }, label);
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  // The two gaps target the editable wrapper, rather than the body contentDOM.
  for (const location of ['left-gap', 'actions-gap', 'text', 'body-right']) {
    for (const input of ['Z', 'Backspace', 'Delete', 'paste']) {
      await restore();
      const definition = editor.locator('[data-testid=footnote-definition][data-label=note-a]');
      await definition.getByTestId('endnote-edit').click();
      await expect(definition).toHaveAttribute('data-editing', 'true');
      const point = await definition.evaluate((el, location) => {
        const body = el.querySelector('.footnote-definition-body');
        const box = body.getBoundingClientRect();
        const range = document.createRange(); range.selectNodeContents(body);
        const text = range.getBoundingClientRect();
        const x = location === 'left-gap' ? box.left - 3 : location === 'actions-gap' ? box.right + 3 :
          location === 'text' ? text.left + 5 : box.right - 4;
        const y = text.top + text.height / 2;
        return {x, y, wrapper: document.elementFromPoint(x, y) === el};
      }, location);
      if (location.endsWith('gap')) expect(point.wrapper, `${location} hits editable wrapper`).toBe(true);
      const before = await snapshot('note-a');
      await page.mouse.click(point.x, point.y, {clickCount:3});
      const selected = await snapshot('note-a');
      const editingAfterClick = await definition.getAttribute('data-editing');
      if (input === 'paste') {
        await page.evaluate(() => navigator.clipboard.writeText('Pasted text'));
        await page.keyboard.press('Control+V');
      } else if (input === 'Z') await page.keyboard.type(input);
      else await page.keyboard.press(input);
      const after = await snapshot('note-a');
      try {
        expect(selected.selection, `${location}/${input} endnote selection`).toEqual(before.expected);
        expect(editingAfterClick, `${location}/${input} remains editing`).toBe('true');
        expect(after.text, `${location}/${input} endnote text`).toBe(input === 'paste' ? 'Pasted text' : input === 'Z' ? 'Z' : '');
        expect(after.doc, `${location}/${input} surrounding document`).toEqual(before.doc);
      } catch {
        failures.push({location, input, expected:before.expected, selected:selected.selection, editingAfterClick,
          text:after.text, surroundingUnchanged:JSON.stringify(after.doc) === JSON.stringify(before.doc)});
      }
    }
  }
  expect(failures, 'Endnote triple clicks must retain editing and preserve neighboring blocks').toEqual([]);
  for (const label of cases) {
    for (const location of ['text', 'after-text', 'right', label === 'code' ? 'padding' : 'number']) {
      for (const input of ['Z', 'Backspace', 'Delete']) {
        // Reload the scratch file: destructive pre-fix cases must not contaminate later clicks.
        await restore();
        const caption = captionFor(label);
        await caption.scrollIntoViewIfNeeded();
        const point = await caption.evaluate((el, location) => {
          const content = el.querySelector('[data-node-view-content-react]');
          const range = document.createRange(); range.selectNodeContents(content);
          const text = range.getBoundingClientRect(), box = el.getBoundingClientRect();
          // The prefix is generated inline before the text, including on centered Figures.
          const prefix = getComputedStyle(el, '::before');
          const canvas = document.createElement('canvas').getContext('2d');
          canvas.font = prefix.font;
          const prefixWidth = canvas.measureText(el.dataset.captionPrefix || '').width;
          return {x: location === 'text' ? text.left + 5 : location === 'after-text' ? text.right + 3 : location === 'right' ? box.right - 4 :
            location === 'number' ? text.left - prefixWidth / 2 : box.left + 4,
            y: text.top + text.height / 2};
        }, location);
        const before = await snapshot(label);
        await page.mouse.click(point.x, point.y, {clickCount:3});
        const selected = await snapshot(label);
        if (input === 'Z') await page.keyboard.type(input); else await page.keyboard.press(input);
        const after = await snapshot(label);
        try {
          expect(selected.selection, `${label}/${location}/${input} selection`).toEqual(before.expected);
          expect(after.text, `${label}/${location}/${input} caption`).toBe(input === 'Z' ? 'Z' : '');
          expect(after.doc, `${label}/${location}/${input} surrounding document`).toEqual(before.doc);
        } catch {
          failures.push({label, location, input, expected:before.expected, selected:selected.selection,
            text:after.text, surroundingUnchanged:JSON.stringify(after.doc) === JSON.stringify(before.doc)});
        }
      }
    }
  }
  // Native drag selection remains available for each caption NodeView.
  for (const label of ['fig-a', 'tbl-a', 'fig-mermaid', 'fig-pending']) {
    await restore();
    const caption = captionFor(label);
    await caption.scrollIntoViewIfNeeded();
    const points = await caption.evaluate(el => {
      const range = document.createRange(); range.selectNodeContents(el.querySelector('[data-node-view-content-react]'));
      const box = range.getBoundingClientRect();
      return {left:box.left, right:box.right, y:box.top + box.height / 2};
    });
    const before = await snapshot(label);
    await page.mouse.move(points.left, points.y);
    await page.mouse.down();
    await page.mouse.move(points.right, points.y, {steps:10});
    await page.mouse.up();
    expect((await snapshot(label)).selection, `${label} drag selection`).toEqual(before.expected);
    await page.keyboard.type('Z');
    const after = await snapshot(label);
    expect(after.text).toBe('Z');
    expect(after.doc).toEqual(before.doc);
  }
  // Ordinary paragraphs and table cells keep the engine's native triple-click selection.
  for (const selector of ['.paragraph', '[data-table-cell]']) {
    for (const location of ['text', 'right']) {
      await restore();
      const surface = editor.locator(selector).first();
      await surface.scrollIntoViewIfNeeded();
      const point = await surface.evaluate((el, location) => {
        const range = document.createRange(); range.selectNodeContents(el);
        const box = el.getBoundingClientRect(), text = range.getBoundingClientRect();
        return {x:location === 'text' ? text.left + 4 : box.right - 4, y:text.top + text.height / 2};
      }, location);
      await page.mouse.click(point.x, point.y, {clickCount:3});
      expect(await editor.evaluate(el => {
        const s = el.editor.state.selection;
        return s.$from.sameParent(s.$to) && s.from === s.$from.start() && s.to === s.$from.end();
      }), `${selector}/${location} triple click`).toBe(true);
    }
  }
  expect(failures, 'Every triple click must preserve neighboring blocks').toEqual([]);
}
