// Real Core-backed insertion, empty Save/Reload and localized display-only guidance.
// --screenshots is a separate manual capture pass, usable before and after #574.
async (page, { openPath, reloadDocument, expect, screenshots }) => {
  const origin = page.url().split('/').slice(0,3).join('/');
  const initial = await (await page.request.get(`${origin}/api/document`)).json();
  const separator = initial.path.includes('\\') ? '\\' : '/';
  const root = initial.path.split(separator).slice(0,-4).join(separator);
  const file = [root,'tmp','empty-elements','empty.md'].join(separator);
  await openPath(page, file);
  const editor = page.locator('[data-document-tab][data-active=true] .document-editor');
  await editor.evaluate(async element => {
    const { INSERT_COMMANDS } = await import('/src/block-commands.ts');
    const e = element.editor;
    // Empty the existing equation, then use exactly the commands behind the insertion menu.
    e.state.doc.forEach((node,pos) => {
      if (node.type.name === 'equation') e.view.dispatch(e.state.tr.setNodeAttribute(pos,'latex',''));
    });
    for (const id of ['note','quote','bulleted-list','numbered-list']) {
      e.view.dispatch(INSERT_COMMANDS.find(command => command.id === id).run(e.state, e.state.doc.childCount-1));
    }
    e.view.focus();
  });
  if (screenshots) {
    const stage = await editor.getByTestId('equation-empty').count() ? 'after' : 'before';
    for (const width of [1440,640]) {
      await page.setViewportSize({width,height:900});
      await editor.locator('h1').scrollIntoViewIfNeeded();
      await page.mouse.move(width-2,2);
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({path:`tmp/empty-elements-574/${stage}-${width}.png`});
    }
    return {manualCaptures:stage};
  }
  const snapshot = () => editor.evaluate(el => {
    const json = JSON.parse(JSON.stringify(el.editor.getJSON()));
    const clean = node => { if (node.attrs) delete node.attrs.sourcePath; node.content?.forEach(clean); };
    clean(json); return json;
  });
  const empty = await snapshot();
  const prompts = async (equation,note,quote,item) => {
    expect(await editor.getByTestId('equation-empty').innerText()).toBe(equation);
    expect(await editor.locator('.admonition-body').getAttribute('data-empty-prompt')).toBe(note);
    expect(await editor.locator('.quote').getAttribute('data-empty-prompt')).toBe(quote);
    expect(await editor.locator('li > p[data-empty-prompt]').evaluateAll(nodes => nodes.map(n=>n.getAttribute('data-empty-prompt')))).toEqual([item,item]);
  };
  await prompts('Enter an equation','Enter admonition text','Enter a quote','Enter a list item');
  const read = async () => (await (await page.request.get(`${origin}/document/empty.md?path=${encodeURIComponent(file)}`)).text()).replaceAll('\r\n','\n');
  const save = async () => {
    await page.getByTestId('save').click();
    await page.locator('[data-testid="status"]:is([data-operation="saved"],[data-operation="save-failed"])').waitFor({state:'attached'});
    expect(await page.getByTestId('status').getAttribute('data-operation')).toBe('saved');
  };
  await save();
  const stored = await read();
  expect(stored).not.toMatch(/Enter an|Enter a|Enter admonition/);
  expect(stored).toContain('$$\n$$');
  expect(stored).toContain(':::{note}\n:::');
  expect(await snapshot()).toEqual(empty); // Save acknowledgement must not replace the engine state.
  await reloadDocument(page);
  expect(await snapshot()).toEqual(empty);
  expect(await editor.getByTestId('equation-number').innerText()).toBe('(1)');
  // Direct typing removes only the prompt; Undo restores it and the original empty structure.
  await editor.evaluate(el => {
    const e=el.editor; let position;
    e.state.doc.forEach((node,pos) => { if(node.type.name==='quote') position=pos+1; });
    e.commands.setTextSelection(position); e.view.focus();
  });
  await page.keyboard.type('Quoted text');
  expect(await editor.locator('.quote').getAttribute('data-empty-prompt')).toBe(null);
  await page.keyboard.press('ControlOrMeta+z');
  expect(await snapshot()).toEqual(empty);
  await prompts('Enter an equation','Enter admonition text','Enter a quote','Enter a list item');
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.getByTestId('ui-language').selectOption('ko');
  await page.getByRole('button',{name:'문서로 돌아가기',exact:true}).click();
  await prompts('수식을 입력하세요','안내 내용을 입력하세요','인용문을 입력하세요','목록 항목을 입력하세요');
  expect(await snapshot()).toEqual(empty);
  expect(await read()).toBe(stored);
  return {emptySaveReload:true, displayOnlyGuidance:true, languageSwitch:true, typingUndo:true};
}
