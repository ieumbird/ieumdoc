// Run with pnpm browser:test structural-block-authoring.
// Inserts a Warning, changes an existing H2 to H4, converts a paragraph and a heading into each
// other (with one-step Undo/Redo), keeps bold in a converted heading and italicizes it from the toolbar,
// checks heading Tab/Shift+Tab, boundaries and selection-toolbar access, rejects a heading conversion
// with a line break visibly, saves a scratch Markdown file, and reloads it.
async (page, { showNotifications, openDocument }) => {
  await page.unrouteAll();
  await page.reload();
  await page.waitForFunction(() => document.querySelector('[data-testid="status"]')?.getAttribute('data-operation') === 'ready');

  const origin = page.url().split('/').slice(0, 3).join('/');
  const defaultPath = (await (await page.request.get(`${origin}/api/document`)).json()).path;
  const separator = defaultPath.includes('\\') ? '\\' : '/';
  const root = defaultPath.split(separator).slice(0, -4).join(separator);
  const file = [root, 'tmp', 'structural-block-authoring', 'structural-block-authoring.md'].join(separator);
  const markdown = async () => {
    const response = await page.request.get(`${origin}/document/structural-block-authoring.md?path=${encodeURIComponent(file)}`);
    if (response.status() !== 200) throw new Error(`Prepare ${file} first`);
    return (await response.text()).replaceAll('\r\n', '\n');
  };
  const fresh = '---\nlitzio: 1\n---\n\n# Structural authoring\n\nIntro paragraph.\n\n## Existing heading\n\nKeep this paragraph.\n\n## Demote me\n\nSome **bold** text.\n\nLine one\\\nline two.\n\n# Existing body H1\n';
  if (await markdown() !== fresh) throw new Error('Scratch document is not a fresh structural authoring fixture');

  const openScratch = async () => {
    await openDocument(page, file);
    await page.waitForFunction(() =>
      document.querySelector('[data-testid="status"]')?.getAttribute('data-operation') === 'ready' &&
      document.querySelector('[data-testid="current-file"]')?.getAttribute('title')?.includes('structural-block-authoring'));
  };

  await openScratch();
  const editor = page.locator('[data-document-tab][data-active=true]').getByTestId('document-editor');
  if (await markdown() !== fresh || await page.getByTestId('status').getAttribute('data-operation') !== 'ready') throw new Error('Opening legacy body H1 rewrote or dirtied the file');
  const heading = editor.locator('h2').filter({hasText:'Existing heading'});
  await heading.waitFor({state:'visible'});
  if (await heading.innerText() !== 'Existing heading') throw new Error('Expected the existing H2 before editing');

  const engine = page.locator('[data-document-tab][data-active=true] .document-editor');
  const selectHeading = (text, from = 1, to = from) => engine.evaluate((element, {text, from, to}) => {
    const instance = element.editor;
    let start;
    instance.state.doc.forEach((node, pos) => {
      if (node.type.name === 'heading' && node.textContent === text) start = pos + 1;
    });
    if (start === undefined) throw new Error(`Missing heading: ${text}`);
    instance.commands.setTextSelection({from: start + from, to: start + to});
    instance.view.focus();
  }, {text, from, to});
  const expectHeadingCaret = async (text, level) => {
    await editor.locator(`h${level}`).filter({hasText:text}).waitFor({state:'visible', timeout:10000});
    const kept = await engine.evaluate((element, {text, level}) => {
      const {selection} = element.editor.state;
      return element.editor.view.hasFocus() && selection.empty && selection.$from.parent.textContent === text &&
        selection.$from.parent.attrs.level === level && selection.$from.parentOffset === 1;
    }, {text, level});
    if (!kept) throw new Error(`Heading ${level} change lost its caret or text: ${text}`);
  };
  await selectHeading('Existing heading');
  await page.keyboard.press('Tab');
  await expectHeadingCaret('Existing heading', 3);
  await page.keyboard.press('Tab');
  await expectHeadingCaret('Existing heading', 4);
  await page.keyboard.press('Control+z');
  await expectHeadingCaret('Existing heading', 3);
  await page.keyboard.press('Control+z');
  await expectHeadingCaret('Existing heading', 2);
  await page.keyboard.press('Control+Shift+z');
  await expectHeadingCaret('Existing heading', 3);
  await page.keyboard.press('Shift+Tab');
  await expectHeadingCaret('Existing heading', 2);
  await page.keyboard.press('Shift+Tab');
  await expectHeadingCaret('Existing heading', 1);
  await page.keyboard.press('Tab');
  await expectHeadingCaret('Existing heading', 2);

  await selectHeading('Structural authoring');
  await page.keyboard.press('Shift+Tab');
  await expectHeadingCaret('Structural authoring', 1);
  await page.keyboard.press('Tab');
  await expectHeadingCaret('Structural authoring', 2);
  await page.keyboard.press('Control+z');
  await expectHeadingCaret('Structural authoring', 1);
  await selectHeading('Existing heading');
  for (let level = 3; level <= 6; level++) {
    await page.keyboard.press('Tab');
    await expectHeadingCaret('Existing heading', level);
  }
  await page.keyboard.press('Tab');
  await expectHeadingCaret('Existing heading', 6);
  for (let level = 5; level >= 2; level--) {
    await page.keyboard.press('Shift+Tab');
    await expectHeadingCaret('Existing heading', level);
  }

  await heading.hover();
  await page.getByRole('button', {name:'Insert block after heading block 3'}).click();
  if (!await page.getByRole('menu', {name:'Insert block'}).evaluate(menu => {
    const probe = document.createElement('span');
    probe.style.borderRadius = 'var(--id-radius-md)';
    menu.append(probe);
    const radius = getComputedStyle(probe).borderRadius;
    probe.remove();
    return [...menu.querySelectorAll('[role="menuitem"]')].every(item => {
      const icon = item.querySelector('svg');
      return icon && icon.getBoundingClientRect().width === 16 &&
        getComputedStyle(item).borderRadius === radius;
    });
  })) throw new Error('Insert menu needs its 16px action icons and shared 6px control radius');
  if (await page.getByRole('menuitem', {name:'Heading 1', exact:true}).count() !== 1) throw new Error('Body insert menu must offer H1');
  await page.getByRole('menu', {name:'Insert block'}).getByRole('menuitem', {name:'Warning', exact:true}).click();
  const warning = editor.locator('aside[data-block="admonition"][data-variant="warning"]');
  const warningBody = warning.getByTestId('admonition-body');
  await warningBody.waitFor({state:'visible'});
  await warningBody.fill('Check current limit.');

  const existingHeading = editor.locator('h2').filter({hasText:'Existing heading'});
  await existingHeading.waitFor({state:'visible'});
  await existingHeading.hover();
  await page.getByRole('button', {name:'Move heading block 3'}).click();
  const blockFormat = await page.getByRole('menu', {name:'Block actions'}).evaluate(menu => {
    const items = [...menu.querySelectorAll('[role="menuitem"]')];
    const danger = document.createElement('span');
    danger.style.color = 'var(--id-color-danger)';
    danger.style.borderRadius = 'var(--id-radius-md)';
    menu.append(danger);
    const color = getComputedStyle(danger).color;
    const radius = getComputedStyle(danger).borderRadius;
    danger.remove();
    return items.every(item => item.querySelector('svg')?.getBoundingClientRect().width === 16 && getComputedStyle(item).borderRadius === radius) &&
      items.filter(item => item.getAttribute('aria-label').startsWith('Delete')).every(item => getComputedStyle(item).color === color);
  });
  if (!blockFormat) throw new Error('Block menu needs action icons, the shared control radius and token-colored destructive rows');
  if (await page.getByRole('menuitem', {name:'Change to Heading 2', exact:true}).count()) throw new Error('Current heading level must not be offered');
  if (await page.getByRole('menuitem', {name:'Change to Heading 1', exact:true}).count() !== 1) throw new Error('Body heading menu must offer H1');
  await page.getByRole('menuitem', {name:'Change to Heading 4', exact:true}).click();
  const changedHeading = editor.locator('h4').filter({hasText:'Existing heading'});
  await changedHeading.waitFor({state:'visible'});
  if (await changedHeading.innerText() !== 'Existing heading') throw new Error('Heading level change altered its text');
  await page.waitForFunction(() => document.querySelector('[data-testid="status"]')?.textContent?.trim() === 'Unsaved changes');

  // Block order now: title, intro, H4, Warning, keep, "Demote me", bold paragraph, two-line paragraph.
  const blockAction = async (block, name, action) => {
    await block.hover();
    await page.getByRole('button', {name}).click();
    if (await page.getByRole('menuitem', {name:'Change to Heading 1', exact:true}).count() !== 1) throw new Error('Body block menu must offer H1');
    await page.getByRole('menuitem', {name:action, exact:true}).click();
  };
  const intro = editor.locator('p').filter({hasText:'Intro paragraph.'});
  const introHeading = editor.locator('h2').filter({hasText:'Intro paragraph.'});
  await blockAction(intro, 'Move paragraph block 2', 'Change to Heading 2');
  await introHeading.waitFor({state:'visible'});
  await page.keyboard.press('Control+z');
  await intro.waitFor({state:'visible'});
  const undoRestoredParagraph = await introHeading.count() === 0;
  await page.keyboard.press('Control+Shift+z');
  await introHeading.waitFor({state:'visible'});

  const demoted = editor.locator('p').filter({hasText:'Demote me'});
  await blockAction(editor.locator('h2').filter({hasText:'Demote me'}), 'Move heading block 6', 'Change to Paragraph');
  await demoted.waitFor({state:'visible'});

  // A formatted paragraph becomes a heading that keeps its bold; the toolbar works in headings.
  const boldHeading = editor.locator('h2').filter({hasText:'Some bold text.'});
  await blockAction(editor.locator('p').filter({hasText:'Some bold text.'}), 'Move paragraph block 7', 'Change to Heading 2');
  await boldHeading.locator('strong').filter({hasText:'bold'}).waitFor({state:'visible'});
  await page.locator('[data-document-tab][data-active=true] .document-editor').evaluate(element => {
    const editor = element.editor;
    let from;
    editor.state.doc.descendants((node, pos) => { if (from === undefined && node.isText && node.text === ' text.') from = pos + 1; });
    editor.commands.setTextSelection({from, to: from + 4});
    editor.view.focus();
  });
  await page.getByRole('toolbar', {name:'Text formatting'}).getByRole('button', {name:'Italic'}).click();
  const formattedHeadingEdited = await boldHeading.locator('em').filter({hasText:'text'}).count() === 1;

  await selectHeading('Some bold text.', 1, 4);
  await page.keyboard.press('Tab');
  const toolbarButton = page.getByRole('toolbar', {name:'Text formatting'}).getByRole('button', {name:'Bold', exact:true});
  if (!await toolbarButton.evaluate(element => element === document.activeElement)) throw new Error('Tab from selected heading text must enter its formatting toolbar');
  await page.keyboard.press('Shift+Tab');
  await page.waitForFunction(() => document.querySelector('[data-document-tab][data-active=true] .document-editor').editor.view.hasFocus());
  const selectedText = await engine.evaluate(element => {
    const {doc, selection} = element.editor.state;
    return element.editor.view.hasFocus() && doc.textBetween(selection.from, selection.to) === 'ome' && selection.$from.parent.attrs.level === 2;
  });
  if (!selectedText) throw new Error('Returning from the toolbar must keep the heading selection and level');
  await selectHeading('Some bold text.');
  await page.keyboard.press('Tab');
  await expectHeadingCaret('Some bold text.', 3);

  // A line break cannot go into a heading: the reason is shown and nothing changes.
  const twoLines = editor.locator('p').filter({hasText:'Line one'});
  await blockAction(twoLines, 'Move paragraph block 8', 'Change to Heading 2');
  await showNotifications(page);
  await page.getByTestId('notice').filter({hasText:'line breaks'}).waitFor({state:'visible'});
  const lineBreakConversionRejected = await twoLines.count() === 1 && await twoLines.locator('br').count() === 1;

  // Legacy body H1 remains editable; inspect its normal conversions, then leave its level intact.
  await selectHeading('Existing body H1');
  await page.keyboard.press('Shift+Tab');
  await expectHeadingCaret('Existing body H1', 1);
  const legacy = editor.locator('h1').filter({hasText:'Existing body H1'});
  await legacy.hover();
  await page.getByRole('button', {name:'Move heading block 9', exact:true}).click();
  if (await page.getByRole('menuitem', {name:'Change to Heading 1', exact:true}).count()) throw new Error('Legacy body H1 menu offers H1');
  for (const level of [2, 3, 4, 5, 6]) await page.getByRole('menuitem', {name:`Change to Heading ${level}`, exact:true}).waitFor();
  await page.getByRole('menuitem', {name:'Change to Paragraph', exact:true}).waitFor();
  await page.getByRole('menu', {name:'Block actions', exact:true}).and(page.locator(':focus-within')).waitFor();
  await page.keyboard.press('Escape');
  await selectHeading('Existing body H1', 'Existing body H1'.length);
  await page.keyboard.type('!');
  await page.keyboard.press('Backspace');

  await page.getByRole('button', {name:'Save', exact:true}).click();
  await page.locator('[data-testid="status"]:is([data-operation="saved"], [data-operation="save-failed"])').waitFor({state:'attached'});
  if (await page.getByTestId('status').getAttribute('data-operation') !== 'saved') {
    throw new Error(`Save failed: ${await page.locator('body').innerText()}`);
  }
  const saved = await markdown();
  const expected = [
    '---', 'litzio: 1', '---', '',
    '# Structural authoring',
    '',
    '## Intro paragraph.',
    '',
    '#### Existing heading',
    '',
    ':::{warning}',
    'Check current limit.',
    ':::',
    '',
    'Keep this paragraph.',
    '',
    'Demote me',
    '',
    '### Some **bold** *text*.',
    '',
    'Line one\\',
    'line two.',
    '',
    '# Existing body H1',
    '',
  ].join('\n');
  if (saved !== expected) throw new Error(`Unexpected canonical Markdown after Save:\n${saved}`);

  const savedStatus = await page.getByTestId('status').getAttribute('data-operation');
  await page.reload();
  await page.waitForFunction(() => document.querySelector('[data-testid="status"]')?.getAttribute('data-operation') === 'ready');
  await openScratch();
  const reloadedEditor = page.locator('[data-document-tab][data-active=true]').getByTestId('document-editor');
  const reloadedHeading = reloadedEditor.locator('h4').filter({hasText:'Existing heading'});
  const reloadedWarning = reloadedEditor.locator('aside[data-block="admonition"][data-variant="warning"]');
  await reloadedHeading.waitFor({state:'visible'});
  await reloadedWarning.waitFor({state:'visible'});
  const result = {
    existingH2WasConfirmed: true,
    existingBodyH1Reloaded: await reloadedEditor.locator('h1').filter({hasText:'Existing body H1'}).innerText() === 'Existing body H1',
    warningSavedAsCanonicalMarkdown: saved === expected,
    saveCompleted: savedStatus === 'saved',
    reloadReady: await page.getByTestId('status').getAttribute('data-operation') === 'ready',
    headingReloadedAtH4WithText: await reloadedHeading.innerText() === 'Existing heading',
    warningReloadedWithBody: await reloadedWarning.getByTestId('admonition-body').innerText() === 'Check current limit.',
    undoRestoredParagraph,
    formattedHeadingEdited,
    lineBreakConversionRejected,
    formattedHeadingReloaded: await reloadedEditor.locator('h3').filter({hasText:'Some bold text.'}).locator('strong, em').count() === 2,
    conversionsReloaded: await reloadedEditor.locator('h2', {hasText:'Intro paragraph.'}).count() === 1 &&
      await reloadedEditor.locator('p', {hasText:'Demote me'}).count() === 1,
    surroundingContentPreserved: await reloadedEditor.locator('p', {hasText:'Keep this paragraph.'}).count() === 1,
  };
  const failed = Object.entries(result).filter(([, value]) => value !== true);
  if (failed.length > 0) throw new Error(`Structural block Save/Reload failed: ${JSON.stringify({result, saved})}`);
  return result;
}
