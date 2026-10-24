// The Desktop app's Editor UI with a stand-in for its bridge: Settings → About, the release channel,
// update notifications and the restart check the Desktop app asks before installing. The browser
// Editor without the bridge shows common recovery Settings only. Updater behavior itself is tested in apps/desktop.
// pnpm browser:test desktop-updates
async (page, { screenshots = false, openPath }) => {
  page.setDefaultTimeout(15000);
  const check = (value, message) => { if (!value) throw new Error(message); };
  const ready = () => page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
  check(await page.getByRole('button', {name:'Settings'}).count() === 1, 'Common recovery Settings is missing');
  await page.getByRole('button', {name:'Settings',exact:true}).click();
  check(await page.getByRole('heading',{name:'Local recovery',exact:true}).isVisible() && !await page.getByTestId('app-version').count(), 'Browser settings mixed recovery with Desktop-only information');
  await page.keyboard.press('Escape');
  const capture = async name => {
    if (!screenshots) return;
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map(image => image.decode().catch(() => {})));
    });
    await page.screenshot({path:`tmp/desktop-visual/${name}.png`});
  };
  if (screenshots) await page.setViewportSize({width:1440, height:1000});
  await capture('browser-before');

  await page.addInitScript(() => {
    const listeners = new Set();
    let restartCheck = null;
    const info = {version:'0.2.0', channel:'stable', updatesSupported:true, update:{phase:'idle'}, postponed:null};
    const calls = [];
    window.__desktop = {calls, push(state) { info.update = state; for (const listener of listeners) listener(state); }};
    window.ieumdocDesktop = {
      info: async () => ({...info}),
      setChannel: async (channel) => { calls.push(['channel', channel]); info.channel = channel; return {...info}; },
      checkForUpdates: async () => { calls.push(['check']); },
      downloadUpdate: async () => { calls.push(['download']); },
      // The Desktop app asks the Editor's registered check before it restarts.
      installUpdate: async () => {
        const answer = restartCheck ? restartCheck() : {ok:false, reason:'no restart check'};
        calls.push(['install', answer]);
        return answer;
      },
      postponeUpdate: async (version) => { calls.push(['postpone', version]); info.postponed = version; },
      openReleaseNotes: async (version) => { calls.push(['notes', version ?? null]); },
      onUpdateState(listener) { listeners.add(listener); return () => listeners.delete(listener); },
      onRestartCheck(check) { restartCheck = check; return () => { if (restartCheck === check) restartCheck = null; }; },
    };
  });
  await page.unrouteAll();
  await page.reload();
  await ready();
  await capture('desktop-after');
  const origin = page.url().split('/').slice(0, 3).join('/');
  const defaultPath = (await (await page.request.get(`${origin}/api/document`)).json()).path;
  const sep = defaultPath.includes('\\') ? '\\' : '/';
  const file = [...defaultPath.split(sep).slice(0, -4), 'tmp', 'desktop-updates', 'updates.md'].join(sep);
  await openPath(page, file);
  await page.getByRole('dialog').waitFor({state:'detached'});

  const calls = () => page.evaluate(() => window.__desktop.calls.map(call => call[0] === 'install' ? `install:${call[1].ok}` : call.join(':')));
  const push = state => page.evaluate(state => window.__desktop.push(state), state);
  const settings = page.getByRole('button', {name:'Settings', exact:true});
  const dialog = page.getByTestId('settings-dialog');
  const status = () => page.getByTestId('update-status').innerText();
  // Bridge callbacks schedule React work; delivery is not a rendered-state acknowledgement.
  const waitForStatus = expected => page.waitForFunction(text =>
    document.querySelector('[data-testid="update-status"]')?.textContent === text, expected, {timeout:5000});
  const notice = page.getByTestId('update-notice');

  // Settings → About, by keyboard: version, the Stable default, a channel change, and focus back.
  await page.keyboard.press('Tab');
  check(await settings.evaluate(node => node === document.activeElement), 'Tab from Open file did not reach Settings');
  await page.keyboard.press('Enter');
  await dialog.waitFor();
  check(await page.getByTestId('app-version').innerText() === '0.2.0', 'About does not show the version');
  const stable = page.getByRole('radio', {name:/^Stable/});
  const beta = page.getByRole('radio', {name:/^Beta/});
  check(await stable.isChecked() && !await beta.isChecked(), 'Stable is not the default channel');
  // Base UI queues initial focus on an animation frame; visible is not yet focus-ready.
  // Observe real focus without moving it, so missing initial focus still fails.
  await page.waitForFunction(() => document.activeElement?.matches('[data-testid="ui-language"]'), undefined, {timeout:5_000});
  await stable.focus();
  await push({phase:'no-stable-release'});
  await waitForStatus('No Stable release has been published yet.');
  check(await status() === 'No Stable release has been published yet.', 'Stable absence is not explained');
  check(await notice.count() === 0, 'Stable absence displayed an update notification');
  check(await page.getByRole('button', {name:'Check for updates'}).isEnabled(), 'Stable absence disabled checking');
  await page.keyboard.press('ArrowDown');
  await page.waitForFunction(() => window.__desktop.calls.some(call => call[0] === 'channel'));
  await beta.and(page.locator(':checked')).waitFor({state:'attached', timeout:5000});
  check(await beta.isChecked() && (await calls()).includes('channel:beta'), 'The channel change did not reach the Desktop app');
  await page.getByRole('button', {name:'Check for updates'}).click();
  await page.getByRole('button', {name:'Release notes'}).click();
  await page.keyboard.press('Escape');
  await dialog.waitFor({state:'detached'});
  check(await settings.evaluate(node => node === document.activeElement), 'Closing Settings did not return focus to Settings');

  // A found update is announced once per version; Later keeps it quiet until a newer one.
  await push({phase:'available', version:'0.3.0-beta.1', prerelease:true});
  await notice.waitFor();
  check((await notice.innerText()).includes('IeumDoc 0.3.0-beta.1 (Beta) is available.'), 'The notice does not name the update');
  await notice.getByRole('button', {name:'Later'}).click();
  await notice.waitFor({state:'detached'});
  // Observe each committed phase before checking that a postponed version stays quiet.
  await settings.click();
  await dialog.waitFor();
  await push({phase:'checking'});
  await page.locator('[data-testid="update-status"][data-phase="checking"]').waitFor({state:'attached', timeout:5000});
  await push({phase:'available', version:'0.3.0-beta.1', prerelease:true});
  await waitForStatus('IeumDoc 0.3.0-beta.1 (Beta) is available. You have 0.2.0.');
  check(await notice.count() === 0, 'A postponed version notified again');
  await page.keyboard.press('Escape');
  await dialog.waitFor({state:'detached'});
  await push({phase:'available', version:'0.3.0-beta.2', prerelease:true});
  await notice.waitFor();
  await notice.getByRole('button', {name:'View'}).click();
  await dialog.waitFor();
  await waitForStatus('IeumDoc 0.3.0-beta.2 (Beta) is available. You have 0.2.0.');
  check((await status()).includes('0.3.0-beta.2 (Beta) is available. You have 0.2.0.'), 'About does not describe the update');
  await page.getByRole('button', {name:'Download update'}).click();
  await push({phase:'downloading', version:'0.3.0-beta.2', prerelease:true, percent:42.5, transferred:425, total:1000});
  await page.getByRole('progressbar', {name:'Update download'}).and(page.locator('[value="42.5"]')).waitFor({state:'attached', timeout:5000});
  await beta.and(page.locator(':disabled')).waitFor({state:'attached', timeout:5000});
  check(await page.getByRole('progressbar', {name:'Update download'}).getAttribute('value') === '42.5', 'Download progress is not shown');
  check(!await beta.isEnabled(), 'The channel can change during a download');
  await push({phase:'downloaded', version:'0.3.0-beta.2', prerelease:true});
  const restart = page.getByRole('button', {name:'Restart to update'});
  await restart.waitFor();
  if (screenshots) {
    await capture('about-downloaded-wide');
    await page.setViewportSize({width:375, height:812});
    await capture('about-downloaded-phone');
    await page.setViewportSize({width:1440, height:1000});
  }

  // Unsaved changes and unapplied block edits refuse the restart; the work stays.
  await page.keyboard.press('Escape');
  await dialog.waitFor({state:'detached'});
  const editor = page.locator('[data-document-tab][data-active=true] .document-editor');
  await page.getByText('Alpha.', {exact:true}).filter({visible:true}).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Unsaved');
  await page.getByRole('tab', {name:'technical-document.md',exact:true}).click();
  const unloadProtected = await page.evaluate(() => {
    const event = new Event('beforeunload', {cancelable:true});
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
  check(unloadProtected, 'Hidden dirty tab did not protect browser unload');
  await notice.getByRole('button', {name:'Restart to update'}).click();
  await page.getByTestId('error').waitFor();
  check((await page.getByTestId('error').innerText()).includes('Save your changes, then restart to update.'), 'Unsaved changes did not refuse the restart');
  await page.getByRole('button', {name:'Dismiss error'}).click();
  await page.getByRole('tab', {name:'updates.md, Unsaved changes',exact:true}).click();
  check((await editor.innerText()).includes('Alpha. Unsaved'), 'Refusing the restart lost the edit');
  await page.getByRole('button', {name:'Save', exact:true}).click();
  await page.getByText('Saved', {exact:true}).filter({visible:true}).waitFor();
  const table = page.locator('[data-document-tab][data-active=true] [data-block="table"]');
  await table.hover();
  await table.getByRole('button', {name:'Edit table', exact:true}).click();
  await page.getByTestId('table-caption-input').fill('Unapplied caption');
  await page.getByRole('tab', {name:'technical-document.md',exact:true}).click();
  await settings.click();
  await dialog.waitFor();
  await restart.click();
  await page.getByTestId('update-problem').waitFor();
  check((await page.getByTestId('update-problem').innerText()).includes('Apply or Cancel the open edits'), 'An unapplied edit did not refuse the restart');
  await page.keyboard.press('Escape');
  await dialog.waitFor({state:'detached'});
  await page.getByRole('tab', {name:'updates.md, Unsaved changes',exact:true}).click();
  check(await page.getByTestId('table-caption-input').inputValue() === 'Unapplied caption', 'Refusing the restart lost the draft');
  await page.getByTestId('table-cancel').click();

  // The same live guard covers in-flight Save and Source, even when the applied document is clean.
  const refused = async expected => {
    await notice.getByRole('button', {name:'Restart to update'}).click();
    await page.getByTestId('error').waitFor();
    check(expected.test(await page.getByTestId('error').innerText()), 'The pending operation did not refuse the restart');
    await page.getByRole('button', {name:'Dismiss error'}).click();
  };
  await page.getByText('Alpha. Unsaved', {exact:true}).filter({visible:true}).click();
  await page.keyboard.press('End');
  // Prepare a paragraph edit for the restart guard. Chromium can move its DOM caret before
  // ProseMirror receives selectionchange; typing then would replace the still-selected table.
  await page.waitForFunction(() => {
    const selection = document.querySelector('[data-document-tab][data-active=true] .document-editor').editor.state.selection;
    return selection.empty && selection.$from.parent.type.name === 'paragraph' &&
      selection.$from.parent.textContent === 'Alpha. Unsaved' &&
      selection.$from.parentOffset === selection.$from.parent.content.size;
  });
  await page.keyboard.type(' Saved');
  let releaseSave;
  const saveGate = new Promise(resolve => { releaseSave = resolve; });
  const holdSave = async route => { if (route.request().method() === 'POST') await saveGate; await route.continue(); };
  await page.route('**/api/document', holdSave);
  try {
    await page.getByRole('button', {name:'Save', exact:true}).click();
    await page.locator('[data-operation="saving"]').waitFor({state:'attached'});
    await refused(/A save is in progress/);
    // Observe this held Save's first Saved commit, after the prior Save/draft UI settled.
    await page.evaluate(() => {
      delete window.__savedUnloadPrevented;
      const observer = new MutationObserver(() => {
        if (document.querySelector('[data-testid="status"]')?.textContent !== 'Saved') return;
        const event = new Event('beforeunload', {cancelable:true});
        window.dispatchEvent(event);
        window.__savedUnloadPrevented = event.defaultPrevented;
        observer.disconnect();
      });
      observer.observe(document.querySelector('[data-testid="status"]'), {childList:true, characterData:true, subtree:true});
    });
  } finally { releaseSave(); }
  await page.getByText('Saved', {exact:true}).filter({visible:true}).waitFor();
  await page.waitForFunction(() => typeof window.__savedUnloadPrevented === 'boolean', undefined, {timeout:30_000});
  const savedUnloadPrevented = await page.evaluate(() => window.__savedUnloadPrevented);
  check(savedUnloadPrevented === false, `The first completed Save commit blocks unload: ${savedUnloadPrevented}`);
  await page.unroute('**/api/document', holdSave);

  let releaseSource;
  const sourceGate = new Promise(resolve => { releaseSource = resolve; });
  const holdSource = async route => { await sourceGate; await route.continue(); };
  await page.route('**/api/document-source', holdSource);
  try {
    await page.getByRole('button', {name:'Source', exact:true}).click();
    await refused(/still working on the document/);
  } finally { releaseSource(); }
  await page.locator('[data-document-tab][data-active=true]').getByTestId('source-view').waitFor();
  await page.unroute('**/api/document-source', holdSource);
  await page.getByRole('button', {name:'Visual', exact:true}).click();

  let releaseAsset;
  const assetGate = new Promise(resolve => { releaseAsset = resolve; });
  const holdAsset = async route => { if (route.request().method() === 'POST') await assetGate; await route.continue(); };
  await page.route('**/api/asset?*', holdAsset);
  try {
    await page.getByText('Alpha. Unsaved Saved', {exact:true}).filter({visible:true}).click();
    await page.keyboard.press('End');
    await editor.evaluate(async element => {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 8;
      const png = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      const data = new DataTransfer(); data.items.add(new File([png], 'update-test.png', {type:'image/png'}));
      element.dispatchEvent(new ClipboardEvent('paste', {clipboardData:data, bubbles:true, cancelable:true}));
    });
    await page.locator('[data-operation="adding-image"]').waitFor({state:'attached'});
    await refused(/An image is still being added/);
  } finally { releaseAsset(); }
  await page.locator('[data-document-tab][data-active=true] [data-block="figure"]').waitFor();
  await page.waitForFunction(() => document.querySelector('[data-testid="status"]')?.getAttribute('data-operation') !== 'adding-image');
  await page.unroute('**/api/asset?*', holdAsset);
  await page.getByRole('button', {name:'Save', exact:true}).click();
  await page.getByText('Saved', {exact:true}).filter({visible:true}).waitFor();

  // With everything saved, the Editor allows the restart.
  await notice.getByRole('button', {name:'Restart to update'}).click();
  await page.waitForFunction(() => window.__desktop.calls.some(call => call[0] === 'install' && call[1].ok));
  const recorded = await calls();
  check(JSON.stringify(recorded) === JSON.stringify(['channel:beta', 'check', 'notes:', 'postpone:0.3.0-beta.1', 'download', 'install:false', 'install:false', 'install:false', 'install:false', 'install:false', 'install:true']),
    `Unexpected Desktop calls ${JSON.stringify(recorded)}`);

  // Started without a document, nothing can be lost: the start allows the restart.
  // Close the saved tabs so navigation memory also deliberately starts empty (#383).
  for (const name of ['updates.md','technical-document.md']) await page.getByRole('button',{name:`Close ${name}`,exact:true}).click();
  const firstRequest = route => route.request().method() === 'GET' ? route.fulfill({json:{start:true}}) : route.continue();
  await page.route(/\/api\/document$/, firstRequest);
  try {
    await page.reload();
    await page.getByTestId('document-start').waitFor();
    await push({phase:'downloaded', version:'0.3.0-beta.2', prerelease:true});
    await notice.getByRole('button', {name:'Restart to update'}).click();
    await page.waitForFunction(() => window.__desktop.calls.some(call => call[0] === 'install'));
    check(JSON.stringify(await calls()) === JSON.stringify(['install:true']), `The start refused the restart: ${JSON.stringify(await calls())}`);
  } finally {
    await page.unroute(/\/api\/document$/, firstRequest);
  }
  return {calls: recorded};
}
