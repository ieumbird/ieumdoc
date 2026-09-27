// Run with pnpm browser:test structural-block-authoring.
// Inserts a Warning, changes an existing H2 to H4, saves a scratch Markdown file, and reloads it.
async page => {
  await page.unrouteAll();
  await page.reload();
  await page.waitForFunction(() => document.querySelector('[data-testid="status"]')?.getAttribute('data-operation') === 'Ready');

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
  const fresh = '# Structural authoring\n\nIntro paragraph.\n\n## Existing heading\n\nKeep this paragraph.\n';
  if (await markdown() !== fresh) throw new Error('Scratch document is not a fresh structural authoring fixture');

  const openScratch = async () => {
    await page.getByRole('button', {name:'Open…'}).click();
    await page.getByTestId('file-path').fill(file);
    await page.getByRole('dialog').getByRole('button', {name:'Open', exact:true}).click();
    await page.waitForFunction(() =>
      document.querySelector('[data-testid="status"]')?.getAttribute('data-operation') === 'Ready' &&
      document.querySelector('[data-testid="current-file"]')?.getAttribute('title')?.includes('structural-block-authoring'));
  };

  await openScratch();
  const editor = page.getByTestId('document-editor');
  const heading = editor.locator('h2').filter({hasText:'Existing heading'});
  await heading.waitFor({state:'visible'});
  if (await heading.innerText() !== 'Existing heading') throw new Error('Expected the existing H2 before editing');

  await heading.hover();
  await page.getByRole('button', {name:'Insert block after heading block 3'}).click();
  await page.getByRole('menu', {name:'Insert block'}).getByRole('menuitem', {name:'Warning', exact:true}).click();
  const warning = editor.locator('aside[data-block="admonition"][data-variant="warning"]');
  const warningBody = warning.getByTestId('admonition-body');
  await warningBody.waitFor({state:'visible'});
  await warningBody.fill('Check current limit.');

  const existingHeading = editor.locator('h2').filter({hasText:'Existing heading'});
  await existingHeading.waitFor({state:'visible'});
  await existingHeading.hover();
  await page.getByRole('button', {name:'Move heading block 3'}).click();
  await page.getByRole('menuitem', {name:'Change to Heading 4', exact:true}).click();
  const changedHeading = editor.locator('h4').filter({hasText:'Existing heading'});
  await changedHeading.waitFor({state:'visible'});
  if (await changedHeading.innerText() !== 'Existing heading') throw new Error('Heading level change altered its text');
  await page.waitForFunction(() => document.querySelector('[data-testid="status"]')?.textContent?.trim() === 'Unsaved changes');

  await page.getByRole('button', {name:'Save', exact:true}).click();
  await page.locator('[data-testid="status"]:is([data-operation="Saved"], [data-operation="Save failed"])').waitFor({state:'attached'});
  if (await page.getByTestId('status').getAttribute('data-operation') !== 'Saved') {
    throw new Error(`Save failed: ${await page.locator('body').innerText()}`);
  }
  const saved = await markdown();
  const expected = [
    '# Structural authoring',
    '',
    'Intro paragraph.',
    '',
    '#### Existing heading',
    '',
    ':::{warning}',
    'Check current limit.',
    ':::',
    '',
    'Keep this paragraph.',
    '',
  ].join('\n');
  if (saved !== expected) throw new Error(`Unexpected canonical Markdown after Save:\n${saved}`);

  const savedStatus = await page.getByTestId('status').getAttribute('data-operation');
  await page.reload();
  await page.waitForFunction(() => document.querySelector('[data-testid="status"]')?.getAttribute('data-operation') === 'Ready');
  await openScratch();
  const reloadedEditor = page.getByTestId('document-editor');
  const reloadedHeading = reloadedEditor.locator('h4').filter({hasText:'Existing heading'});
  const reloadedWarning = reloadedEditor.locator('aside[data-block="admonition"][data-variant="warning"]');
  await reloadedHeading.waitFor({state:'visible'});
  await reloadedWarning.waitFor({state:'visible'});
  const result = {
    existingH2WasConfirmed: true,
    warningSavedAsCanonicalMarkdown: saved === expected,
    saveCompleted: savedStatus === 'Saved',
    reloadReady: await page.getByTestId('status').getAttribute('data-operation') === 'Ready',
    headingReloadedAtH4WithText: await reloadedHeading.innerText() === 'Existing heading',
    warningReloadedWithBody: await reloadedWarning.getByTestId('admonition-body').innerText() === 'Check current limit.',
    surroundingContentPreserved: await reloadedEditor.locator('p', {hasText:'Intro paragraph.'}).count() === 1 &&
      await reloadedEditor.locator('p', {hasText:'Keep this paragraph.'}).count() === 1,
  };
  const failed = Object.entries(result).filter(([, value]) => value !== true);
  if (failed.length > 0) throw new Error(`Structural block Save/Reload failed: ${JSON.stringify({result, saved})}`);
  return result;
}
