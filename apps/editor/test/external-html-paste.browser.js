// External (web, Notion, Word) HTML clipboard normalized to supported blocks: the OS clipboard
// with notice, one Undo/Redo, Save/Reload and canonical Markdown; representative sources; refusals.
async page => {
  await page.unrouteAll();
  await page.reload();
  await page.locator('[data-testid="status"][data-operation="Ready"]').waitFor({state:'attached'});
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  const origin = page.url().split('/').slice(0, 3).join('/');
  const defaultPath = (await (await page.request.get(`${origin}/api/document`)).json()).path;
  const separator = defaultPath.includes('\\') ? '\\' : '/';
  const root = defaultPath.split(separator).slice(0, -4).join(separator);
  const file = [root, 'tmp', 'external-html-paste', 'external.md'].join(separator);
  await page.getByRole('button', { name: 'Open file…' }).click();
  await page.getByTestId('file-path').fill(file);
  await page.getByRole('dialog').getByRole('button', { name: 'Open', exact: true }).click();
  await page.locator('[data-testid="status"][data-operation="Ready"]').waitFor({state:'attached'});
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const editor = page.locator('.document-editor');
  const state = () => editor.evaluate(el => ({
    doc: JSON.stringify(el.editor.getJSON(), (key, value) => ['sourcePath', 'original', 'sourceCell'].includes(key) ? undefined : value),
    selection: [el.editor.state.selection.from, el.editor.state.selection.to],
  }));
  const select = (text, whole = false) => editor.evaluate((el, args) => {
    const editor = el.editor;
    let from;
    editor.state.doc.forEach((node, pos) => { if (node.textContent === args.text) from = pos + 1; });
    if (from === undefined) throw new Error(`Missing ${args.text}`);
    editor.commands.setTextSelection({from, to: args.whole ? from + args.text.length : from}); editor.view.focus();
  }, {text, whole});
  const notice = page.getByTestId('notice');
  const syntheticPaste = html => editor.evaluate((el, html) => {
    const data = new DataTransfer();
    data.setData('text/html', html); data.setData('text/plain', 'Plain fallback');
    el.dispatchEvent(new ClipboardEvent('paste', {clipboardData:data, bubbles:true, cancelable:true}));
  }, html);
  const source = async marker => {
    await page.getByTestId('view-source').click();
    await page.waitForFunction(marker => document.querySelector('[data-testid="source-view"] pre')?.textContent.includes(marker), marker);
    const text = (await page.getByTestId('source-view').locator('pre').textContent()).replaceAll('\r\n', '\n');
    await page.getByTestId('view-visual').click();
    return text;
  };
  const result = {};

  // A. The OS clipboard: a single paste transaction, its notice, one Undo/Redo, Save and Reload.
  const web = '<meta charset="utf-8"><h2>Web <em>heading</em></h2>' +
    '<p>Text with <strong>bold <em>both</em></strong>, <s>gone</s>, <code>x = 1</code> and <a href="https://example.com/a" title="Example">a link</a>.</p>' +
    '<ul><li>One<ul><li>Nested</li></ul></li><li>Two</li></ul><ol start="3"><li>Third</li></ol>' +
    '<blockquote><p>Quoted <span style="color:#c00">red</span> text.</p></blockquote>' +
    // Inline semantics IeumDoc cannot express keep their text, with a notice.
    '<p>Press <kbd>Ctrl+C</kbd> and see <cite>Example</cite>.</p>' +
    '<pre><code class="language-python">def f():\n    return 1\n</code></pre><hr>' +
    '<table><thead><tr><th align="right">Key</th><th>Value</th></tr></thead><tbody><tr><td align="right">a</td><td>1</td></tr></tbody></table>';
  await select('Alpha.', true);
  const before = await state();
  await page.evaluate(async html => navigator.clipboard.write([new ClipboardItem({
    'text/html': new Blob([html], {type:'text/html'}), 'text/plain': new Blob(['Web heading'], {type:'text/plain'}),
  })]), web);
  await page.keyboard.press('Control+v');
  await notice.filter({hasText:'Pasted with normalization: unsupported semantic formatting became plain text; unsupported visual styles were removed.'}).waitFor();
  const pasted = await state();
  assert(pasted.doc !== before.doc, 'External HTML must paste');
  await page.keyboard.press('Control+z');
  const undone = await state();
  assert(undone.doc === before.doc && undone.selection.join() === before.selection.join(), `One Undo must restore content and selection: ${JSON.stringify({before, undone})}`);
  await page.keyboard.press('Control+Shift+z');
  assert((await state()).doc === pasted.doc, 'Redo must restore the whole paste');
  result.osClipboardHistory = true;
  const preview = await source('def f():');
  await page.getByRole('button', {name:'Save', exact:true}).click();
  await page.locator('[data-testid="status"]:is([data-operation="Saved"], [data-operation="Save failed"])').waitFor();
  assert(await page.getByTestId('status').getAttribute('data-operation') === 'Saved', `Save failed: ${await page.locator('body').innerText()}`);
  const disk = (await (await page.request.get(`${origin}/api/document?path=${encodeURIComponent(file)}`)).json()).source.replaceAll('\r\n', '\n');
  const saved = '# External\n\n## Web *heading*\n\n' +
    'Text with **bold *both***, {del}`gone`, `x = 1` and [a link](https://example.com/a "Example").\n\n' +
    '*   One\n\n    *   Nested\n*   Two\n\n3.  Third\n\n> Quoted red text.\n\nPress Ctrl+C and see Example.\n\n' +
    '```python\ndef f():\n    return 1\n```\n\n---\n\n| Key | Value |\n| --: | ----- |\n|   a | 1     |\n\nOmega.\n';
  assert(disk === preview && disk === saved, `Save writes the canonical Markdown Source showed: ${JSON.stringify(disk)}`);
  await page.getByRole('button', {name:'Reload', exact:true}).click();
  await page.locator('[data-testid="status"][data-operation="Ready"]').waitFor({state:'attached'});
  assert((await state()).doc === pasted.doc, 'Reload must retain the pasted structure');
  result.saveReload = true;

  // B. Representative sources, pasted before "Omega." and undone; Source shows Core's Markdown.
  const cases = {
    // Vendor wrappers, classes, ids, data attributes and layout styles are noise: no notice.
    noisy: ['<div class="post" data-v-1a2b><section id="s"><p class="lead" data-track="x" style="margin:0;line-height:1.6"><span class="a"><span>Noisy <b class="k">bold</b> text</span></span></p></section></div>',
      'Noisy **bold** textOmega.\n', ''],
    notion: ['<meta charset="utf-8"><h3 id="1f" class="">Notion heading</h3><p id="2a" class=""><span class="notranslate">Plain <strong>strong</strong> <code>code</code></span></p>' +
      '<ul id="3b" class="bulleted-list"><li style="list-style-type:disc"><div>Item</div><ul class="bulleted-list"><li style="list-style-type:circle">Child</li></ul></li></ul>' +
      '<pre id="4c" class="code"><code class="language-JavaScript">const a = 1;\n\n  a++;</code></pre>',
      // A trailing code block stays whole rather than absorbing the paragraph after the caret.
      '### Notion heading\n\nPlain **strong** `code`\n\n*   Item\n\n    *   Child\n\n```JavaScript\nconst a = 1;\n\n  a++;\n```\n\nOmega.\n', ''],
    word: ['<html xmlns:o="urn:schemas-microsoft-com:office:office"><body><!--StartFragment-->' +
      `<h1><a name="_Toc1"></a><span style='font-family:"Calibri Light"'>Word heading</span></h1>` +
      `<p class=MsoListParagraphCxSpFirst style='text-indent:-18.0pt;mso-list:l0 level1 lfo1'><![if !supportLists]><span style='font-family:Symbol'><span style='mso-list:Ignore'>·<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp; </span></span></span><![endif]>First<o:p></o:p></p>` +
      `<p class=MsoListParagraphCxSpLast style='margin-left:72.0pt;mso-list:l0 level2 lfo1'><![if !supportLists]><span style='font-family:"Courier New"'><span style='mso-list:Ignore'>o<span>&nbsp; </span></span></span><![endif]>Second<o:p></o:p></p>` +
      `<p class=MsoNormal><o:p>&nbsp;</o:p></p>` +
      `<table class=MsoTableGrid border=1><tr><td width=200 valign=top><p class=MsoNormal><b>Name</b><o:p></o:p></p></td><td><p class=MsoNormal>Size</p></td></tr><tr><td><p class=MsoNormal>A</p></td><td><p class=MsoNormal>1</p></td></tr></table><!--EndFragment--></body></html>`,
      '# Word heading\n\n*   First\n\n    *   Second\n\n| **Name** | Size |\n| -------- | ---- |\n| A        | 1    |\n\nOmega.\n',
      'Pasted with normalization: unsupported visual styles were removed; table headers now use the first row only.'],
    // A fragment link stays an ordinary link, never a cross-reference. Sub/superscript tags
    // and Word's vertical-align spans are kept.
    styled: ['<p><span style="font-family:Georgia;color:rgb(200,0,0)">Styled</span> x<sup>2</sup> H<span style="vertical-align:sub">2</span>O <a href="javascript:alert(1)">unsafe</a> <a href="#local">local</a></p>',
      'Styled x{sup}`2` H{sub}`2`O unsafe [local](#local)Omega.\n',
      'Pasted with normalization: unsupported visual styles were removed; unsupported links became plain text.'],
    // The visible text survives; the expansion and machine-readable date do not, so they are reported.
    metadata: ['<p><abbr title="Alternating Current">AC</abbr> since <time datetime="2026-10-02">today</time></p>',
      'AC since todayOmega.\n', 'Pasted with normalization: unsupported semantic formatting became plain text.'],
  };
  for (const [name, [html, expected, message]] of Object.entries(cases)) {
    await select('Omega.');
    const before = await state();
    await notice.waitFor({state:'detached', timeout:10000});
    await syntheticPaste(html);
    const markdown = (await source('Omega.')).slice(saved.length - 'Omega.\n'.length);
    const shown = await notice.count() ? await notice.innerText() : '';
    assert(markdown === expected && shown === message, `${name}: ${JSON.stringify({markdown, shown})}`);
    await editor.evaluate(el => el.editor.commands.undo());
    assert((await state()).doc === before.doc, `${name}: one Undo restores the document`);
    result[name] = true;
  }

  // C. Structure IeumDoc cannot represent refuses the whole paste; document and selection stay.
  const refused = {
    'merged table cells are not supported': '<table><tr><th colspan="2">Merged</th></tr><tr><td>a</td><td>b</td></tr></table>',
    'nested tables are not supported': '<table><tr><th><table><tr><td>x</td></tr></table></th></tr></table>',
    'embedded media and objects are not supported': '<p>Clip</p><iframe src="about:blank"></iframe>',
    'form controls and task lists are not supported': '<ul><li><input type="checkbox" checked> Done</li></ul>',
    'a list item holds one paragraph, optionally followed by one nested list': '<ul><li><p>One</p><p>Two</p></li></ul>',
    'a heading holds one line of inline content': '<h2>Line<br>break</h2>',
    'ruby annotations cannot become plain text': '<p><ruby>漢<rt>kan</rt></ruby></p>',
    // Word level 1 → level 3 has no exact nested-list form; it is not lowered to level 2.
    'a Word list skips a nesting level or goes above its first item':
      `<p class=MsoListParagraph style='mso-list:l0 level1 lfo1'><span style='mso-list:Ignore'>·</span>Top</p>` +
      `<p class=MsoListParagraph style='mso-list:l0 level3 lfo1'><span style='mso-list:Ignore'>§</span>Deep</p>`,
    'images can be added only as PNG files': '<p><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw="></p>',
  };
  for (const [reason, html] of Object.entries(refused)) {
    await select('Omega.', true);
    const before = await state();
    await syntheticPaste(html);
    await notice.filter({hasText:`Nothing was pasted: ${reason}. The clipboard and your selection are kept.`}).waitFor();
    const after = await state();
    assert(after.doc === before.doc && after.selection.join() === before.selection.join(), `${reason}: document and selection must stay`);
  }
  // Dropped external HTML goes through the same normalization and refusal.
  const target = await page.locator('.document-editor > p').filter({hasText:'Omega.'}).boundingBox();
  const beforeDrop = await state();
  await editor.evaluate((el, args) => {
    const data = new DataTransfer();
    data.setData('text/html', args.html); data.setData('text/plain', 'Merged');
    el.dispatchEvent(new DragEvent('drop', {dataTransfer:data, clientX:args.x, clientY:args.y, bubbles:true, cancelable:true}));
  }, {html:refused['merged table cells are not supported'], x:target.x + 5, y:target.y + target.height / 2});
  await notice.filter({hasText:'Nothing was pasted: merged table cells are not supported.'}).waitFor();
  assert((await state()).doc === beforeDrop.doc, 'A refused drop must keep the document');
  result.refused = true;
  return result;
}
