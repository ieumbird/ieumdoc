// Run with pnpm browser:test basic-blocks.
// Changes an admonition's kind from the block menu, edits a quote with Shift+Enter and leaves it
// with Enter, applies strikethrough and superscript from the toolbar, switches superscript and
// subscript with their keyboard shortcuts, creates a quote, a divider and
// strikethrough with Markdown shortcuts, inserts H5 and a divider from the slash menu, then saves
// a scratch Markdown file and reloads it.
async page => {
  await page.unrouteAll();
  await page.reload();
  await page.waitForFunction(() => document.querySelector('[data-testid="status"]')?.getAttribute('data-operation') === 'Ready');

  const origin = page.url().split('/').slice(0, 3).join('/');
  const defaultPath = (await (await page.request.get(`${origin}/api/document`)).json()).path;
  const separator = defaultPath.includes('\\') ? '\\' : '/';
  const root = defaultPath.split(separator).slice(0, -4).join(separator);
  const file = [root, 'tmp', 'basic-blocks', 'basic-blocks.md'].join(separator);
  const markdown = async () => {
    const response = await page.request.get(`${origin}/document/basic-blocks.md?path=${encodeURIComponent(file)}`);
    if (response.status() !== 200) throw new Error(`Prepare ${file} first`);
    return (await response.text()).replaceAll('\r\n', '\n');
  };
  const fresh = '# Basic blocks\n\n:::{note}\nKind me.\n:::\n\n> Quote one.\n\nStrike me.\n\nShortcut here\n';
  if (await markdown() !== fresh) throw new Error('Scratch document is not a fresh basic blocks fixture');

  const openScratch = async () => {
    await page.getByRole('button', {name:'Open file…'}).click();
    await page.getByTestId('file-path').fill(file);
    await page.getByRole('dialog').getByRole('button', {name:'Open', exact:true}).click();
    await page.waitForFunction(() =>
      document.querySelector('[data-testid="status"]')?.getAttribute('data-operation') === 'Ready' &&
      document.querySelector('[data-testid="current-file"]')?.getAttribute('title')?.includes('basic-blocks'));
  };
  // Select a range of a text block's content (offsets; -1 is its end); the keys that follow are real.
  const select = async (text, start, end = start) => page.locator('.document-editor').evaluate((element, [text, start, end]) => {
    const editor = element.editor;
    let position;
    editor.state.doc.descendants((node, pos) => {
      if (position === undefined && node.isTextblock && node.textContent === text) position = pos + 1;
    });
    if (position === undefined) throw new Error(`Missing text block ${text}`);
    const offset = value => value < 0 ? text.length : value;
    editor.commands.setTextSelection({from: position + offset(start), to: position + offset(end)});
    editor.view.focus();
  }, [text, start, end]);

  await openScratch();
  const editor = page.getByTestId('document-editor');
  await editor.locator('h1').waitFor({state:'visible'});

  // Admonition kind from the block menu.
  await editor.locator('aside[data-block="admonition"]').hover();
  await page.getByRole('button', {name:'Move admonition block 2'}).click();
  await page.getByRole('menuitem', {name:'Change to Danger', exact:true}).click();
  const danger = editor.locator('aside[data-block="admonition"][data-variant="danger"]');
  await danger.waitFor({state:'visible'});
  const kindLabelShown = (await danger.locator('.admonition-label').innerText()).trim() === 'Danger';

  // Shift+Enter breaks a quote line; Enter leaves the quote.
  await select('Quote one.', -1, -1);
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('Line two');
  await page.keyboard.press('Enter');
  await page.keyboard.type('After quote.');
  const quoteEdited = await editor.locator('blockquote').first().locator('br').count() === 1 &&
    await editor.locator('p[data-block="paragraph"]').filter({hasText:'After quote.'}).count() === 1;

  // Strikethrough from the selection toolbar.
  await select('Strike me.', 0, 6);
  await page.getByRole('button', {name:'Strikethrough'}).click();
  await editor.locator('s').filter({hasText:'Strike'}).waitFor({state:'visible'});

  // Superscript from the toolbar; the keyboard shortcuts toggle it into subscript and back,
  // never nesting one in the other.
  await select('Strike me.', 7, 9);
  await page.getByRole('button', {name:'Superscript'}).click();
  await editor.locator('sup').filter({hasText:'me'}).waitFor({state:'visible'});
  await page.keyboard.press('Control+Comma');
  await editor.locator('sub').filter({hasText:'me'}).waitFor({state:'visible'});
  const scriptsExclusive = await editor.locator('sup').count() === 0;
  await page.keyboard.press('Control+Period');
  await editor.locator('sup').filter({hasText:'me'}).waitFor({state:'visible'});
  await select('Strike me.', 9, 10);
  await page.keyboard.press('Control+Comma');
  await editor.locator('sub').filter({hasText:'.'}).waitFor({state:'visible'});

  // Shortcuts: a quote, a divider and strikethrough.
  await select('Shortcut here', -1, -1);
  await page.keyboard.press('Enter');
  await page.keyboard.type('> Quoted by shortcut');
  await editor.locator('blockquote').filter({hasText:'Quoted by shortcut'}).waitFor({state:'visible'});
  await page.keyboard.press('Enter');
  await page.keyboard.type('---');
  await editor.locator('[data-block="divider"]').first().waitFor({state:'visible'});
  await page.keyboard.type('Text ~~gone~~ kept');
  await editor.locator('s').filter({hasText:'gone'}).waitFor({state:'visible'});

  // H5 and a divider from the slash menu.
  await page.keyboard.press('Enter');
  await page.keyboard.type('/h5');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Deep heading');
  await editor.locator('h5').filter({hasText:'Deep heading'}).waitFor({state:'visible'});
  await page.keyboard.press('Enter');
  await page.keyboard.type('/divider');
  await page.keyboard.press('Enter');
  await page.keyboard.type('End.');
  const twoDividers = await editor.locator('[data-block="divider"]').count() === 2;

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
  const result = {
    kindLabelShown,
    quoteEdited,
    twoDividers,
    dangerSaved: saved.includes(':::{danger}\nKind me.\n:::'),
    strikeSavedAsDel: saved.includes('{del}`Strike` ') && saved.includes('Text {del}`gone` kept'),
    scriptsExclusive,
    scriptsSavedAsRoles: saved.includes('{del}`Strike` {sup}`me`{sub}`.`'),
    headingFiveSaved: saved.includes('##### Deep heading'),
    dangerReloaded: await reloaded.locator('aside[data-block="admonition"][data-variant="danger"]').count() === 1,
    quotesReloaded: await reloaded.locator('blockquote[data-block="quote"]').count() === 2 &&
      (await reloaded.locator('blockquote').first().innerText()).includes('Line two'),
    dividersReloaded: await reloaded.locator('[data-block="divider"] hr').count() === 2,
    strikeReloaded: await reloaded.locator('s').count() === 2,
    scriptsReloaded: await reloaded.locator('sup').filter({hasText:'me'}).count() === 1 &&
      await reloaded.locator('sub').filter({hasText:'.'}).count() === 1,
    textAfterBlocksReloaded: await reloaded.locator('p[data-block="paragraph"]').filter({hasText:'After quote.'}).count() === 1 &&
      await reloaded.locator('p[data-block="paragraph"]').filter({hasText:'End.'}).count() === 1,
  };
  const failed = Object.entries(result).filter(([, value]) => value !== true);
  if (failed.length > 0) throw new Error(`Basic blocks failed: ${JSON.stringify({result, saved})}`);
  return result;
}
