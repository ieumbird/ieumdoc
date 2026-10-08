// Run with pnpm browser:test markdown-input.
// Types Markdown shortcuts with real keys: `## `, `- `, `3. `, a code fence and inline marks,
// and `$...$` inline math, checks that Undo right after a shortcut restores the typed text, that no shortcut applies inside
// code blocks while marks apply in table cells and headings, then saves a scratch Markdown file and reloads it.
async page => {
  await page.unrouteAll();
  await page.reload();
  await page.waitForFunction(() => document.querySelector('[data-testid="status"]')?.getAttribute('data-operation') === 'Ready');

  const origin = page.url().split('/').slice(0, 3).join('/');
  const defaultPath = (await (await page.request.get(`${origin}/api/document`)).json()).path;
  const separator = defaultPath.includes('\\') ? '\\' : '/';
  const root = defaultPath.split(separator).slice(0, -4).join(separator);
  const file = [root, 'tmp', 'markdown-input', 'markdown-input.md'].join(separator);
  const markdown = async () => {
    const response = await page.request.get(`${origin}/document/markdown-input.md?path=${encodeURIComponent(file)}`);
    if (response.status() !== 200) throw new Error(`Prepare ${file} first`);
    return (await response.text()).replaceAll('\r\n', '\n');
  };
  const fresh = '# Markdown input\n\nHeading target\n\nList target\n\nNumbered target\n\nCode target\n\nInline target\n\n| Cell |\n| ---- |\n| x    |\n';
  if (await markdown() !== fresh) throw new Error('Scratch document is not a fresh Markdown input fixture');

  const openScratch = async () => {
    await page.getByRole('button', {name:'Open file…'}).click();
    await page.getByTestId('file-path').fill(file);
    await page.getByRole('dialog').getByRole('button', {name:'Open', exact:true}).click();
    await page.waitForFunction(() =>
      document.querySelector('[data-testid="status"]')?.getAttribute('data-operation') === 'Ready' &&
      document.querySelector('[data-testid="current-file"]')?.getAttribute('title')?.includes('markdown-input'));
  };
  // Place the caret at the start or end of a text block's content; the keys that follow are real.
  const caret = async (text, atEnd) => page.locator('.document-editor').evaluate((element, [text, atEnd]) => {
    const editor = element.editor;
    let position;
    editor.state.doc.descendants((node, pos) => {
      if (position === undefined && node.isTextblock && node.textContent === text) position = pos + 1 + (atEnd ? node.content.size : 0);
    });
    if (position === undefined) throw new Error(`Missing text block ${text}`);
    editor.commands.setTextSelection(position);
    editor.view.focus();
  }, [text, atEnd]);

  await openScratch();
  const editor = page.getByTestId('document-editor');
  await editor.locator('h1').waitFor({state:'visible'});
  const paragraph = (text) => editor.locator('p[data-block="paragraph"]').filter({hasText:text});

  // `## ` makes a heading; Undo right away restores the typed characters; typing it again applies.
  await caret('Heading target', false);
  await page.keyboard.type('## ');
  const heading = editor.locator('h2').filter({hasText:'Heading target'});
  await heading.waitFor({state:'visible'});
  await page.keyboard.press('Control+z');
  await paragraph('## Heading target').waitFor({state:'visible'});
  const undoRestoredPrefix = await heading.count() === 0 &&
    await paragraph('Heading target').innerText() === '## Heading target';
  for (let i = 0; i < 3; i++) await page.keyboard.press('Backspace');
  await page.keyboard.type('## ');
  await heading.waitFor({state:'visible'});

  await caret('List target', false);
  await page.keyboard.type('- ');
  await editor.locator('ul[data-block="list"] > li').filter({hasText:'List target'}).waitFor({state:'visible'});
  await caret('Numbered target', false);
  await page.keyboard.type('3. ');
  await editor.locator('ol[data-block="list"]').filter({hasText:'Numbered target'}).waitFor({state:'visible'});

  // A fence makes a code block; Markdown typed inside the code stays literal.
  await caret('Code target', false);
  await page.keyboard.type('```js ');
  await caret('Code target', true);
  await page.keyboard.type(' ## **x**');
  const codeLiteral = await page.locator('.document-editor').evaluate(element => {
    let code;
    element.editor.state.doc.forEach(node => { if (node.type.name === 'codeBlock') code = [node.attrs.language, node.textContent]; });
    return JSON.stringify(code);
  }) === JSON.stringify(['js', 'Code target ## **x**']);

  // Inline marks; Undo right after one restores its delimiters.
  await caret('Inline target', true);
  await page.keyboard.type(' **bold**');
  const inline = paragraph('Inline target');
  await inline.locator('strong').filter({hasText:'bold'}).waitFor({state:'visible'});
  await page.keyboard.press('Control+z');
  const markUndone = await inline.locator('strong').count() === 0 && (await inline.innerText()).endsWith('**bold**');
  await page.keyboard.type(' _it_ `code`');
  await inline.locator('em').filter({hasText:'it'}).waitFor({state:'visible'});
  await inline.locator('code').filter({hasText:'code'}).waitFor({state:'visible'});
  // `$THD$` becomes inline math; a dollar with a space just inside stays text.
  await page.keyboard.type(' $THD$ and $5 and $6');
  await inline.getByTestId('inline-math').first().waitFor({state:'visible'});
  const inlineMath = await page.locator('.document-editor').evaluate(element => {
    const values = [];
    element.editor.state.doc.descendants(node => { if (node.type.name === 'inlineMath') values.push(node.attrs.value); });
    return JSON.stringify(values);
  }) === JSON.stringify(['THD']) && (await inline.innerText()).endsWith(' and $5 and $6');

  // Table cells and headings accept the same supported inline mark shortcuts.
  await caret('x', true);
  await page.keyboard.type(' **y**');
  await caret('Markdown input', true);
  await page.keyboard.type(' **z**');
  const cellMarkApplied = await editor.locator('td strong').filter({hasText:'y'}).count() === 1;
  const headingMarkApplied = await editor.locator('h1 strong').filter({hasText:'z'}).count() === 1;

  await page.getByRole('button', {name:'Save', exact:true}).click();
  await page.locator('[data-testid="status"]:is([data-operation="Saved"], [data-operation="Save failed"])').waitFor({state:'attached'});
  if (await page.getByTestId('status').getAttribute('data-operation') !== 'Saved') {
    throw new Error(`Save failed: ${await page.locator('body').innerText()}`);
  }
  const saved = await markdown();

  await page.reload();
  await page.waitForFunction(() => document.querySelector('[data-testid="status"]')?.getAttribute('data-operation') === 'Ready');
  await openScratch();
  const reloaded = page.getByTestId('document-editor');
  await reloaded.locator('h1').waitFor({state:'visible'});
  const reloadedInline = reloaded.locator('p[data-block="paragraph"]').filter({hasText:'Inline target'});
  const result = {
    undoRestoredPrefix,
    codeLiteral,
    markUndone,
    cellMarkApplied,
    inlineMath,
    headingMarkApplied,
    headingReloaded: await reloaded.locator('h2').filter({hasText:'Heading target'}).count() === 1,
    bulletListReloaded: await reloaded.locator('ul[data-block="list"] > li').filter({hasText:'List target'}).count() === 1,
    numberedListReloadedFromThree: await reloaded.locator('ol[data-block="list"]').getAttribute('start') === '3',
    codeReloaded: saved.includes('```js\nCode target ## **x**\n```'),
    inlineMarksReloaded: await reloadedInline.locator('strong').count() === 0 &&
      await reloadedInline.locator('em').filter({hasText:'it'}).count() === 1 &&
      await reloadedInline.locator('code').filter({hasText:'code'}).count() === 1 &&
      (await reloadedInline.innerText()).includes('**bold**'),
    inlineMathSaved: saved.includes('$THD$ and \\$5 and \\$6'),
    marksReloaded: await reloaded.locator('td strong').filter({hasText:'y'}).count() === 1 &&
      await reloaded.locator('h1 strong').filter({hasText:'z'}).count() === 1,
  };
  const failed = Object.entries(result).filter(([, value]) => value !== true);
  if (failed.length > 0) throw new Error(`Markdown input shortcuts failed: ${JSON.stringify({result, saved})}`);
  return result;
}
