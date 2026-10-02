// Native keyboard and system clipboard, Core Save/Reload, and Chromium composition lifecycle.
async page => {
  await page.unrouteAll();
  await page.reload();
  await page.waitForFunction(() => document.querySelector('[data-testid="status"]')?.getAttribute('data-operation') === 'Ready');
  const origin = page.url().split('/').slice(0, 3).join('/');
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  const defaultPath = (await (await page.request.get(`${origin}/api/document`)).json()).path;
  const separator = defaultPath.includes('\\') ? '\\' : '/';
  const root = defaultPath.split(separator).slice(0, -4).join(separator);
  const file = [root, 'tmp', 'continuous-editing', 'continuous-editing.md'].join(separator);
  await page.getByRole('button', { name: 'Open…' }).click();
  await page.getByTestId('file-path').fill(file);
  await page.getByRole('dialog').getByRole('button', { name: 'Open', exact: true }).click();
  await page.locator('.document-editor h2').filter({hasText:'Heading'}).waitFor();
  const doc = () => page.locator('.document-editor').evaluate(el => el.editor.getJSON());
  const semantic = value => JSON.stringify(value, (key, item) => ['sourcePath', 'original', 'added'].includes(key) ? undefined : item);
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const select = async (start, end = start) => page.locator('.document-editor').evaluate((el, args) => {
    const editor = el.editor;
    const blocks = [];
    editor.state.doc.forEach((node, pos) => blocks.push({node, pos}));
    const locate = ([text, offset]) => {
      const block = blocks.find(({node}) => node.textContent === text);
      if (!block) throw new Error(`Missing selection block ${text}`);
      return block.pos + 1 + offset;
    };
    editor.commands.setTextSelection({from: locate(args[0]), to: locate(args[1])});
    editor.view.focus();
  }, [start, end]);
  const end = async () => {
    await page.keyboard.press('Control+End');
    await page.waitForFunction(() => { const e = document.querySelector('.document-editor').editor; return e.state.selection.empty && e.state.selection.to === e.state.doc.content.size - 1; });
  };
  const save = async () => {
    await page.getByRole('button', {name:'Save', exact:true}).click();
    await page.locator('[data-testid="status"]:is([data-operation="Saved"], [data-operation="Save failed"])').waitFor();
    assert(await page.getByTestId('status').getAttribute('data-operation') === 'Saved', `Save failed: ${await page.locator('body').innerText()}`);
    await page.locator('.document-editor').evaluate(el => el.editor.view.focus());
  };
  const disk = async () => (await (await page.request.get(`${origin}/api/document?path=${encodeURIComponent(file)}`)).json());
  const model = data => JSON.stringify(data.document.blocks.map(({path, original, ...block}) => block), (key, value) => key === 'path' ? undefined : value);

  await select(['Heading', 3]);
  await page.keyboard.press('Enter');
  assert((await doc()).content.filter(node => node.type === 'heading').map(node => node.content?.[0]?.text).join('|') === 'Boundaries|Hea|ding', 'Enter inside a heading must retain its two parts');
  await save();
  await page.keyboard.press('Control+z');
  await save();
  await select(['Heading', 0]);
  await page.keyboard.press('Enter');
  await page.keyboard.type('Before');
  await save();
  await select(['Before', 3], ['Heading', 3]);
  await page.keyboard.press('Backspace');
  assert((await doc()).content.some(node => node.type === 'paragraph' && node.content?.[0]?.text === 'Befding'), 'Cross-block deletion must preserve both unselected ends');
  await save();
  await page.keyboard.press('Control+z');
  await save();

  await select(['Heading', 7]);
  await page.keyboard.press('Enter');
  await page.keyboard.type('After heading');
  let current = await doc();
  assert(current.content.some(node => node.type === 'paragraph' && node.content?.[0]?.text === 'After heading'), 'Heading Enter must create a paragraph');
  await select(['After heading', 0]);
  await page.keyboard.press('Backspace');
  assert((await doc()).content.some(node => node.type === 'heading' && node.content?.[0]?.text === 'HeadingAfter heading'), 'Backspace must join plain heading/prose');
  await page.keyboard.press('Control+z');
  assert((await doc()).content.some(node => node.type === 'paragraph' && node.content?.[0]?.text === 'After heading'), 'Undo must restore the split');
  await page.keyboard.press('Control+Shift+z');
  await page.keyboard.press('Control+z');
  await save();

  // Cut across two text blocks, preserving strong and inline math through the real clipboard.
  await select(['Alpha bold and .', 0], ['Beta plain.', 11]);
  await page.keyboard.press('Control+x');
  assert(!(await doc()).content.some(node => node.content?.some(child => child.type === 'inlineMath')), 'Cut must remove the selected inline math');
  await end();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Control+v');
  current = await doc();
  assert(current.content.some(node => node.content?.some(child => child.type === 'inlineMath' && child.attrs.value === 'x')), 'Paste must restore inline math source');
  assert(current.content.some(node => node.content?.some(child => child.text === 'bold' && child.marks?.some(mark => mark.type === 'bold'))), 'Paste must retain bold marks');
  await save();

  // A whole-document clipboard slice must retain typed atoms, Note content and aligned tables.
  await select(['Beta plain.', 11]);
  await page.keyboard.press('Control+a');
  await page.waitForFunction(() => { const e = document.querySelector('.document-editor').editor; return e.state.selection.from <= 1 && e.state.selection.to >= e.state.doc.content.size - 1; });
  await page.keyboard.press('Control+c');
  const copied = await doc();
  await end();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Control+v');
  current = await doc();
  for (const type of ['equation', 'figure', 'table', 'admonition']) {
    const originals = copied.content.filter(node => node.type === type);
    const pasted = current.content.filter(node => node.type === type);
    assert(semantic(pasted) === semantic([...originals, ...originals]), `${type} clipboard content changed: ${JSON.stringify({originals,pasted})} ${await page.locator("body").innerText()}`);
  }
  await save();
  const twice = model(await disk());
  await page.keyboard.press('Control+z');
  await save();
  assert(model(await disk()) !== twice, 'Undo across Save must remove the pasted slice');
  await page.keyboard.press('Control+Shift+z');
  await save();
  assert(model(await disk()) === twice, 'Redo across Save must restore the pasted slice');

  const firstCell = page.locator('.document-editor th').first();
  await firstCell.click();
  await page.waitForFunction(() => document.querySelector('.document-editor').editor.state.selection.$from.parent.type.name === 'tableCell');
  await page.keyboard.press('Tab');
  assert(await page.locator('.document-editor').evaluate(el => el.editor.state.selection.$from.parent.textContent) === 'Right', 'Tab must move to next cell');
  await page.keyboard.press('Shift+Tab');
  assert(await page.locator('.document-editor').evaluate(el => el.editor.state.selection.$from.parent.textContent) === 'Left', 'Shift+Tab must move back');

  await select(['End paragraph.', 0], ['End paragraph.', 3]);
  const beforeRejected = semantic(await doc());
  await page.evaluate(async () => navigator.clipboard.write([new ClipboardItem({
    'text/html': new Blob(['<table><tr><td colspan="2">Unsupported list</td></tr></table>'], {type:'text/html'}),
    'text/plain': new Blob(['Unsupported list'], {type:'text/plain'}),
  })]));
  await page.keyboard.press('Control+v');
  assert(semantic(await doc()) === beforeRejected, 'Unsupported paste must keep selected content');
  assert((await page.locator('body').innerText()).includes('Nothing was pasted'), 'Unsupported paste needs a visible reason');
  assert((await page.evaluate(() => navigator.clipboard.readText())) === 'Unsupported list', 'Rejected clipboard must remain available');
  await page.evaluate(async () => navigator.clipboard.write([new ClipboardItem({
    'text/html': new Blob(['<a href="https://example.com"><h2>Unsupported list</h2></a>'], {type:'text/html'}),
    'text/plain': new Blob(['Unsupported list'], {type:'text/plain'}),
  })]));
  await page.keyboard.press('Control+v');
  assert(semantic(await doc()) === beforeRejected, 'A heading wrapped in a link must not silently lose its link');
  await page.keyboard.press('Control+Shift+v');
  assert((await page.locator('.document-editor').innerText()).includes('Unsupported list paragraph.'), 'Explicit plain-text paste must remain available');
  await page.keyboard.press('Control+z');

  // CDP drives actual composition events/DOM updates; it does not emulate an OS Korean keyboard.
  await select(['End paragraph.', 14]);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.imeSetComposition', {text:'ㅎ', selectionStart:1, selectionEnd:1});
  await cdp.send('Input.imeSetComposition', {text:'한글', selectionStart:2, selectionEnd:2});
  await cdp.send('Input.insertText', {text:'한글'});
  await cdp.detach();
  await page.waitForFunction(() => document.querySelector('.document-editor').editor.state.doc.textContent.includes('End paragraph.한글'));
  await save();
  const saved = model(await disk());
  await page.getByRole('button', {name:'Reload', exact:true}).click();
  await page.waitForFunction(() => document.querySelector('[data-testid="status"]')?.getAttribute('data-operation') === 'Ready');
  assert(model(await disk()) === saved, 'Reload must retain the saved semantic model');
  assert((await page.locator('.document-editor').innerText()).includes('한글'), 'Committed Korean text must survive Reload');

  // Engine gap cursors must make both document edges around a sole atom reachable.
  const openSibling = async name => {
    await page.getByRole('button', { name: 'Open…' }).click();
    await page.getByTestId('file-path').fill(file.replace('continuous-editing.md', name));
    await page.getByRole('dialog').getByRole('button', { name: 'Open', exact: true }).click();
    await page.waitForFunction(name => document.querySelector('[data-testid="current-file"]')?.getAttribute('title')?.endsWith(name), name);
  };
  const selectEquation = () => page.locator('.document-editor').evaluate(el => {
    const editor = el.editor;
    let pos;
    editor.state.doc.forEach((node, start) => { if (node.type.name === 'equation' && pos === undefined) pos = start; });
    editor.commands.setNodeSelection(pos); editor.view.focus();
  });
  await openSibling('edge-equation.md');
  await page.locator('.document-editor').evaluate(el => { el.editor.commands.selectAll(); el.editor.view.focus(); });
  await page.keyboard.press('Control+x');
  assert((await doc()).content.every(node => node.type !== 'equation'), 'An atom-only AllSelection must reach the engine clipboard handler');
  await page.keyboard.press('Control+v');
  assert((await doc()).content.some(node => node.type === 'equation' && node.attrs.latex === 'x'), 'Atom-only clipboard must restore its source');
  await selectEquation();
  await page.keyboard.press('ArrowLeft');
  await page.waitForFunction(() => document.querySelector('.document-editor').editor.state.selection.from === 0);
  await page.keyboard.type('Before');
  await selectEquation();
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => { const e = document.querySelector('.document-editor').editor; return e.state.selection.from === e.state.doc.content.size; });
  await page.keyboard.type('After');
  await save();
  const edge = await (await page.request.get(`${origin}/api/document?path=${encodeURIComponent(file.replace('continuous-editing.md', 'edge-equation.md'))}`)).json();
  assert(edge.document.blocks.map(node => node.block).join('|') === 'paragraph|equation|paragraph', 'Typing beside an atom must create prose without converting it');
  assert(edge.document.blocks[0].text === 'Before' && edge.document.blocks[2].text === 'After', 'Both edge inputs must persist');

  await selectEquation();
  await page.locator('[data-block="equation"]').getByRole('button', {name:'Edit', exact:true}).click();
  await page.getByTestId('equation-label').fill('eq-move');
  await page.getByTestId('equation-apply').click();
  await save();
  await selectEquation();
  await page.keyboard.press('Control+c');
  await end();
  await page.keyboard.press('Enter');
  const beforeDuplicate = semantic(await doc());
  await page.keyboard.press('Control+v');
  assert(semantic(await doc()) === beforeDuplicate, 'Duplicate label paste must preserve the existing document');
  assert((await page.locator('body').innerText()).includes('duplicate a Figure or Equation label'), 'Duplicate label needs an explicit restriction');
  await selectEquation();
  await page.keyboard.press('Control+x');
  await end();
  await page.keyboard.press('Control+v');
  await save();
  const moved = await (await page.request.get(`${origin}/api/document?path=${encodeURIComponent(file.replace('continuous-editing.md', 'edge-equation.md'))}`)).json();
  assert(moved.document.blocks.at(-1).block === 'equation' && moved.document.blocks.at(-1).label === 'eq-move', 'Cut/paste must preserve the equation and its label at the new position');

  // Formatted headings, Figure captions and table cells keep every supported inline kind through the typed clipboard.
  await openSibling('formatted-clipboard.md');
  const formattedBlocks = value => ['heading', 'figure', 'table'].map(type => semantic(value.content.filter(node => node.type === type)));
  const twiceBlocks = blocks => blocks.map(json => JSON.stringify([...JSON.parse(json), ...JSON.parse(json)]));
  await select(['After.', 0]);
  await page.keyboard.press('Control+a');
  await page.waitForFunction(() => { const e = document.querySelector('.document-editor').editor; return e.state.selection.from === 0 && e.state.selection.to === e.state.doc.content.size; });
  await page.keyboard.press('Control+c');
  const formatted = formattedBlocks(await doc());
  await end();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Control+v');
  const formattedTwice = formattedBlocks(await doc());
  assert(formattedTwice.join() === twiceBlocks(formatted).join(), `Typed clipboard must keep formatted heading, caption and cells: ${formattedTwice}`);
  await page.keyboard.press('Control+z');
  assert(formattedBlocks(await doc()).join() === formatted.join(), 'Undo must remove the formatted paste');
  await page.keyboard.press('Control+Shift+z');
  assert(formattedBlocks(await doc()).join() === formattedTwice.join(), 'Redo must restore the formatted paste');
  await save();
  await page.getByRole('button', {name:'Reload', exact:true}).click();
  await page.waitForFunction(() => document.querySelector('[data-testid="status"]')?.getAttribute('data-operation') === 'Ready');
  assert(formattedBlocks(await doc()).join() === formattedTwice.join(), 'Formatted paste must survive Save and Reload');
  // A line break is still not heading content, even in typed clipboard HTML.
  await select(['After.', 0]);
  const beforeBreak = semantic(await doc());
  await page.locator('.document-editor').evaluate(el => {
    const data = new DataTransfer();
    data.setData('text/html', '<h2 data-ieumdoc-type="heading" data-ieumdoc-attrs="{&quot;level&quot;:2}">A<br data-ieumdoc-type="hardBreak" data-ieumdoc-attrs="{}">B</h2>');
    el.dispatchEvent(new ClipboardEvent('paste', {clipboardData:data, bubbles:true, cancelable:true}));
  });
  assert(semantic(await doc()) === beforeBreak, 'A heading with a line break must not be pasted');
  assert((await page.locator('body').innerText()).includes('unsupported structure or formatting'), 'A refused heading line break needs a visible reason');

  // Read-only source is never replaced by a lossy cut, including ordinary Markdown images.
  await openSibling('preserved-markdown.md');
  await select(['Editable body.', 0]);
  await page.keyboard.press('Control+a');
  await page.waitForFunction(() => { const e = document.querySelector('.document-editor').editor; return e.state.selection.from === 0 && e.state.selection.to === e.state.doc.content.size; });
  const readonlyBefore = semantic(await doc());
  const clipboardBefore = await page.evaluate(() => navigator.clipboard.readText());
  await page.keyboard.press('Control+x');
  assert(semantic(await doc()) === readonlyBefore, 'Unsupported cut must keep the original document');
  assert((await page.locator('body').innerText()).includes('Nothing was removed'), `Unsupported cut must explain its restriction: ${await page.locator('body').innerText()}`);
  assert(await page.evaluate(() => navigator.clipboard.readText()) === clipboardBefore, 'Unsupported cut must keep the prior clipboard');
  return {headingBoundary:true, crossBlockDeletion:true, cutPasteRichText:true, typedBlockClipboard:true, formattedTypedClipboard:true, undoRedoAcrossSave:true, tableNavigation:true, rejectedPasteRetainsInput:true, compositionSaveReload:true, atomEdges:true, readonlyCutRetained:true};
}
