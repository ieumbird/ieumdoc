// The Desktop app's Editor UI with a stand-in for its bridge: Settings → About, the release channel,
// update notifications and the restart check the Desktop app asks before installing. The browser
// Editor without the bridge shows common recovery Settings only. Updater behavior itself is tested in apps/desktop.
// pnpm browser:test desktop-updates
async (page, { screenshots = false, openPath }) => {
  page.setDefaultTimeout(15000);
  const check = (value, message) => { if (!value) throw new Error(message); };
  const ready = () => page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
  check(await page.getByRole('button', {name:'Settings', exact:true}).count() === 1, 'Common recovery Settings is missing');
  await page.getByRole('button', {name:'Settings',exact:true}).click();
  check(await page.getByRole('button',{name:'About & updates',exact:true}).count() === 0, 'Browser exposes Desktop-only category');
  check(await page.getByTestId('cli-integration').count() === 0, 'Browser exposes Desktop CLI integration');
  check(await page.getByRole('button',{name:'Open log folder',exact:true}).count() === 0, 'Browser exposes Desktop logs');
  await page.getByRole('button',{name:'Saving & recovery',exact:true}).click();
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
    const info = {version:'0.2.0', channel:sessionStorage.getItem('update-channel') || 'stable', updatesSupported:true, update:{phase:'idle'}, seenUpdate:sessionStorage.getItem('update-seen')};
    const calls = JSON.parse(sessionStorage.getItem('update-calls') || '[]');
    window.__desktop = {calls, info, push(state) { info.update = state; for (const listener of listeners) listener(state); }};
    window.__cli = {state:{status:'off'}, calls:[], pending:false, fail:false};
    window.ieumdocDesktop = {
      setTheme: async theme => theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches),
      setWindowBackground: async (color, overlay) => { window.__desktop.appearance = { color, overlay }; },
      info: async () => ({...info}),
      cliIntegration: async () => ({...window.__cli.state}),
      setCliIntegration: async enabled => {
        const cli = window.__cli;
        cli.calls.push(enabled);
        if (cli.pending) await new Promise(resolve => cli.finish = resolve);
        if (cli.fail) { cli.state = {status:'broken'}; throw Error('Injected CLI registration failure'); }
        return cli.state = {status:enabled ? 'installed' : 'off'};
      },
      setChannel: async (channel) => { calls.push(['channel', channel]); info.channel = channel; return {...info}; },
      checkForUpdates: async () => { calls.push(['check']); },
      downloadUpdate: async () => { calls.push(['download']); },
      // The Desktop app asks the Editor's registered check before it restarts.
      installUpdate: async () => {
        const answer = restartCheck ? restartCheck() : {ok:false, reason:'no restart check'};
        calls.push(['install', answer]);
        return answer;
      },
      markUpdateSeen: async (version) => { calls.push(['seen', version]); info.seenUpdate = version; },
      openReleaseNotes: async (version) => { calls.push(['notes', version ?? null]); },
      openLogFolder: async (...args) => {
        calls.push(['logs', ...args]);
        await new Promise(resolve => window.__desktop.finishLogs = resolve);
        if (window.__desktop.failLogs) throw Error('OS failed');
      },
      onUpdateState(listener) { listeners.add(listener); return () => listeners.delete(listener); },
      onRestartCheck(check) { restartCheck = check; return () => { if (restartCheck === check) restartCheck = null; }; },
    };
  });
  await page.unrouteAll();
  await page.reload();
  await ready();
  // Browser bridge coverage: resolved roles, explicit/System changes and geometry only.
  // Real Window Controls Overlay/native window behavior is checked in packaged CI/manual review.
  for (const theme of ['light', 'dark', 'system']) {
    await page.getByRole('button', {name:'Settings', exact:true}).click();
    await page.getByTestId('theme').selectOption(theme);
    await page.waitForFunction(() => {
      const style = getComputedStyle(document.documentElement), actual = window.__desktop.appearance;
      return actual?.color === style.getPropertyValue('--id-color-canvas').trim() &&
        actual.overlay.color === style.getPropertyValue('--id-color-surface-subtle').trim() &&
        actual.overlay.symbolColor === style.getPropertyValue('--id-color-text').trim();
    });
    await page.keyboard.press('Escape');
    await page.getByTestId('settings-dialog').waitFor({state:'detached'});
  }
  // Real Settings controls; only OS integration is mocked. A completed promise must update the
  // direct DOM state, with no reload/poll hiding a stale status after the busy boundary.
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.getByRole('button',{name:'About & updates',exact:true}).click();
  const logs = page.getByRole('button',{name:'Open log folder',exact:true});
  await logs.click();
  check(await logs.isDisabled(), 'Log folder button accepts repeated calls while pending');
  check(JSON.stringify(await page.evaluate(() => window.__desktop.calls.at(-1))) === '["logs"]', 'Log action passed renderer arguments');
  await page.evaluate(() => { window.__desktop.failLogs = true; window.__desktop.finishLogs(); });
  await page.getByText('Could not open the log folder.',{exact:true}).waitFor();
  await logs.click();
  await page.evaluate(() => { window.__desktop.failLogs = false; window.__desktop.finishLogs(); });
  await page.waitForFunction(() => ![...document.querySelectorAll('button')].find(n => n.textContent === 'Open log folder')?.disabled);
  check(await page.getByText('Could not open the log folder.',{exact:true}).count() === 0, 'Successful retry retains stale log error');
  const cli = page.getByTestId('cli-integration');
  await cli.getByText('Off',{exact:true}).waitFor();
  await page.evaluate(() => window.__cli.pending = true);
  await cli.getByRole('button',{name:'Turn on',exact:true}).click();
  check(await cli.getByRole('button',{name:'Turn on',exact:true}).isDisabled(), 'CLI enable remains clickable while pending');
  await page.evaluate(() => { window.__cli.pending = false; window.__cli.finish(); });
  await page.locator('[data-testid="cli-integration"][aria-busy="false"]').waitFor();
  check(await page.getByTestId('cli-status').innerText() === 'Installed', 'CLI did not show completed installation');
  await cli.getByRole('button',{name:'Turn off',exact:true}).click();
  await page.locator('[data-testid="cli-integration"][aria-busy="false"]').waitFor();
  check(await page.getByTestId('cli-status').innerText() === 'Off', 'CLI did not show completed removal');
  await page.evaluate(() => window.__cli.fail = true);
  await cli.getByRole('button',{name:'Turn on',exact:true}).click();
  await page.getByTestId('cli-problem').waitFor();
  await page.locator('[data-testid="cli-integration"][aria-busy="false"]').waitFor();
  check(await page.getByTestId('cli-status').innerText() === 'Broken path', 'Partial failure did not expose repair');
  check(await cli.getByRole('button',{name:'Turn off',exact:true}).isEnabled(), 'Broken integration cannot be disabled');
  await page.evaluate(() => window.__cli.fail = false);
  await cli.getByRole('button',{name:'Repair',exact:true}).click();
  await page.locator('[data-testid="cli-integration"][aria-busy="false"]').waitFor();
  check(await page.getByTestId('cli-status').innerText() === 'Installed', 'Repair did not complete');
  await page.keyboard.press('Escape');
  await page.getByTestId('settings-dialog').waitFor({state:'detached'});
  await page.evaluate(() => window.__cli.state = {status:'off',conflict:'C:\\Another CLI\\ieumdoc.cmd'});
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.getByRole('button',{name:'About & updates',exact:true}).click();
  await cli.getByText(/Another command or file conflicts/).waitFor();
  check(await cli.getByRole('button',{name:'Turn on',exact:true}).isDisabled(), 'Foreign command can be overwritten');
  await page.evaluate(() => window.__cli.state = {status:'off'});
  await cli.getByRole('button',{name:'Refresh status',exact:true}).click();
  await page.locator('[data-testid="cli-integration"][aria-busy="false"]').waitFor();
  check(await cli.getByRole('button',{name:'Turn on',exact:true}).isEnabled(), 'Resolved conflict cannot be retried');
  await page.keyboard.press('Escape');
  await page.getByTestId('settings-dialog').waitFor({state:'detached'});
  const originalViewport = page.viewportSize();
  const origin = page.url().split('/').slice(0, 3).join('/');
  const defaultPath = (await (await page.request.get(`${origin}/api/document`)).json()).path;
  const sep = defaultPath.includes('\\') ? '\\' : '/';
  const root = defaultPath.split(sep).slice(0, -4);
  const longName = '긴파일이름' + 'unbrokendocumentname'.repeat(7) + '.md';
  await openPath(page, [...root, 'tmp', 'open-files', longName].join(sep));
  await page.getByRole('dialog').waitFor({state:'detached'});
  const captionFailures = [];
  const separatorGeometry = [];
  // #635: inspect the painted bottom-border spans, independent of which wrapper owns them.
  // This is representative geometry in Chrome, not a native Windows visual acceptance check.
  for (const width of [1440, 1424, 1423, 640]) {
    await page.setViewportSize({width, height:900});
    for (const theme of ['light', 'dark']) {
      await page.getByRole('button', {name:'Settings', exact:true}).click();
      await page.getByTestId('theme').selectOption(theme);
      await page.keyboard.press('Escape');
      await page.getByTestId('settings-dialog').waitFor({state:'detached'});
      for (const reserved of [0, 138]) {
        await page.evaluate(value => document.documentElement.style.setProperty('--window-controls-width', `${value}px`), reserved);
        for (const panelOpen of [false, true]) {
          const toggle = page.getByRole('button', {name:'Outline', exact:true});
          if (await toggle.getAttribute('aria-pressed') !== String(panelOpen)) await toggle.click();
          let expandedSettingsTop;
          for (const collapsed of [false, true]) {
            const sidebar = page.getByRole('button', {name:collapsed ? 'Collapse Explorer' : 'Expand Explorer', exact:true});
            if (await sidebar.isVisible()) await sidebar.click();
            // Wait for the measured header height used by overlay placement, not a fixed delay.
            await page.waitForFunction(() => {
              const shell = document.querySelector('.app-shell');
              return parseFloat(shell.style.getPropertyValue('--app-header-height')) === document.querySelector('.app-titlebar').offsetHeight + document.querySelector('.app-header').offsetHeight;
            });
            // Measure the Settings action in both states, independent of other footer entries.
            const geometry = await page.getByTestId('sidebar').getByRole('button', {name:'Settings', exact:true}).evaluate((settings, reserved) => {
              const header = document.querySelector('.app-titlebar').getBoundingClientRect();
              const bar = document.querySelector('.top-bar').getBoundingClientRect();
              const tabs = document.querySelector('.document-tab-row').getBoundingClientRect();
              const lines = [...document.querySelectorAll('.app-titlebar, .app-titlebar *')].flatMap(node => {
                const r = node.getBoundingClientRect(), style = getComputedStyle(node), thickness = parseFloat(style.borderBottomWidth);
                return thickness && style.borderBottomStyle === 'solid' && r.bottom >= bar.bottom && r.bottom <= tabs.top
                  ? [{left:r.left, right:r.right, bottom:r.bottom, thickness, color:style.borderBottomColor}] : [];
              });
              const borderColor = getComputedStyle(document.querySelector('.document-tab-row')).borderBottomColor;
              const continuous = Array.from({length:Math.ceil(header.width)}, (_, i) => header.left + i + 0.5)
                .filter(x => x < header.right).every(x => lines.filter(line => line.left <= x && line.right > x && line.bottom === tabs.top && line.thickness === 1 && line.color === borderColor).length === 1);
              const blocked = [...document.querySelectorAll('.app-titlebar button, .top-bar button, .document-tab-row button, .sidebar-header button, .sidebar-footer button, .document-panel-header button')].filter(node => {
                const r = node.getBoundingClientRect();
                // Preserve the former follow-up's checks even for hidden header controls.
                const checked = r.width || node.matches('.top-bar button, .document-tab-row button, .sidebar-header button');
                return checked && (r.right > innerWidth || (r.top < 40 && r.right > innerWidth - reserved) || getComputedStyle(node).getPropertyValue('app-region') !== 'no-drag');
              }).map(node => node.getAttribute('aria-label') || node.textContent);
              const panel = document.querySelector('.document-panel--overlay');
              const usableWidth = document.querySelector('.top-bar').getBoundingClientRect().width;
              const brand = document.querySelector('.app-brand');
              const sidebar = document.querySelector('.sidebar-header').getBoundingClientRect();
              const docked = document.querySelector('.document-panel:not(.document-panel--overlay) .document-panel-navigation')?.getBoundingClientRect();
              const aligned = sidebar.top === tabs.top && sidebar.bottom === tabs.bottom && (!docked || docked.top === tabs.top && docked.bottom === tabs.bottom);
              const branded = brand.querySelector('img').complete && !!brand.querySelector('span') === !document.querySelector('.sidebar--collapsed');
              const settingsBox = settings.getBoundingClientRect();
              const rail = document.querySelector('.sidebar').getBoundingClientRect();
              const settingsBounded = settingsBox.left >= rail.left && settingsBox.right <= rail.right && settingsBox.bottom <= innerHeight;
              return {settingsTop:settingsBox.top, settingsBounded, aligned, branded, continuous, singleLine:lines.every(line => line.bottom === tabs.top && line.thickness === 1), lines, blocked,
                rowHeight:header.height, usableWidth, barBottom:bar.bottom, tabsTop:tabs.top, headerBottom:document.querySelector('.app-header').getBoundingClientRect().bottom,
                overlayTop:panel?.getBoundingClientRect().top, drag:getComputedStyle(document.querySelector('.top-bar')).getPropertyValue('app-region')};
            }, reserved);
            if (!collapsed) expandedSettingsTop = geometry.settingsTop;
            check(geometry.settingsBounded && geometry.settingsTop === expandedSettingsTop, 'Rail Settings moved vertically or escaped the sidebar');
            if (collapsed && [1440,640].includes(width) && reserved === 138 && !panelOpen) {
              const settings = page.getByTestId('sidebar').getByRole('button',{name:'Settings',exact:true});
              await settings.click();
              await page.getByTestId('settings-back').waitFor();
              check(await page.getByRole('button',{name:'About & updates',exact:true}).isVisible(), 'Rail opened different Desktop Settings');
              if (theme === 'light') await page.getByTestId('settings-back').click();
              else await page.keyboard.press('Escape');
              await page.getByTestId('settings-dialog').waitFor({state:'detached'});
              check(await settings.evaluate(node => node === document.activeElement), 'Desktop Settings did not return focus to rail');
            }
            separatorGeometry.push({width, theme, reserved, panelOpen, collapsed, ...geometry});
            if (!geometry.aligned || !geometry.branded || !geometry.continuous || !geometry.singleLine || geometry.blocked.length || geometry.tabsTop - geometry.barBottom > 1 || geometry.drag !== 'drag' ||
                (geometry.rowHeight !== 40) ||
                (geometry.overlayTop !== undefined && geometry.overlayTop !== geometry.headerBottom))
              captionFailures.push({width, theme, reserved, panelOpen, collapsed, ...geometry});
            if ([1440, 640].includes(width))
              await capture(`titlebar-${theme}-${width}-${reserved}-${panelOpen}-${collapsed}`);
          }
          await page.getByRole('button', {name:'Expand Explorer', exact:true}).click();
        }
      }
    }
  }
  check(captionFailures.length === 0, `TopBar separator/geometry: ${JSON.stringify(captionFailures)}`);
  // Inspect modal backdrop boundaries and the direct header exclusion used by non-modal menus.
  const inspectOverlay = async (popup, label) => {
    await popup.waitFor();
    const regions = await popup.evaluate(node => {
      const portal = node.closest('[data-base-ui-portal]');
      const header = document.querySelector('.top-bar').getBoundingClientRect();
      const backdrop = document.elementFromPoint(header.left + 2, header.top + 2);
      return {popup:getComputedStyle(node).getPropertyValue('app-region'),
        positioner:getComputedStyle(node.parentElement).getPropertyValue('app-region'),
        backdrop:getComputedStyle(backdrop).getPropertyValue('app-region'),
        outsideHeader:!node.closest('.top-bar'), backdropCoversHeader:!!portal?.contains(backdrop),
        headersExcluded:[...document.querySelectorAll('.app-titlebar, .top-bar')].every(header => getComputedStyle(header).getPropertyValue('app-region') === 'no-drag')};
    });
    if (regions.popup !== 'no-drag' || regions.backdrop !== 'no-drag' || !regions.outsideHeader ||
        (label === 'menu' ? regions.positioner !== 'no-drag' || !regions.headersExcluded : !regions.backdropCoversHeader)) captionFailures.push({label, ...regions});
  };
  for (const width of [1440, 640]) {
    await page.setViewportSize({width, height:900});
    // Representative caption width; production uses the native CSS environment, never this value.
    await page.evaluate(() => document.documentElement.style.setProperty('--window-controls-width', '138px'));
    await page.getByRole('button', {name:'Settings', exact:true}).click();
    const settingsScreen = page.getByTestId('settings-dialog');
    await settingsScreen.waitFor();
    const geometry = await settingsScreen.evaluate(node => {
      const header = node.querySelector('.settings-topbar');
      const label = node.querySelector('.settings-document-name');
      const style = getComputedStyle(header);
      return {height:header.getBoundingClientRect().height, left:parseFloat(style.paddingLeft), right:parseFloat(style.paddingRight),
        labelRight:label.getBoundingClientRect().right, labelText:label.textContent,
        headerRegion:style.getPropertyValue('app-region'), screenRegion:getComputedStyle(node).getPropertyValue('app-region'),
        bodyRegion:getComputedStyle(node.querySelector('.settings-body')).getPropertyValue('app-region'),
        backRegion:getComputedStyle(node.querySelector('button')).getPropertyValue('app-region')};
    });
    if (geometry.height !== 40 || geometry.right !== geometry.left + 138 || geometry.labelRight > width - 138 || geometry.labelText !== longName ||
        geometry.headerRegion !== 'drag' || geometry.screenRegion !== 'no-drag' || geometry.bodyRegion !== 'no-drag' || geometry.backRegion !== 'no-drag')
      captionFailures.push({width, settings:geometry});
    await page.keyboard.press('Escape');
    await settingsScreen.waitFor({state:'detached'});
    // A short 640px window retains the single title row and reachable portal search (#695).
    await page.setViewportSize({width, height:480});
    await page.keyboard.press('Control+Slash');
    const center = page.getByRole('dialog', {name:'Command center', exact:true});
    await inspectOverlay(center, 'command-center');
    const search = center.getByRole('combobox');
    if (width === 640) {
      const placement = await search.evaluate(node => {
        const title = document.querySelector('.app-titlebar').getBoundingClientRect(), r = node.getBoundingClientRect();
        return {titleHeight:title.height, belowTitle:r.top>=title.bottom,
          reachable:node.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2))};
      });
      check(placement.titleHeight === 40 && placement.belowTitle && placement.reachable,
        'Narrow-window portal search must remain reachable below the fixed title row');
    }
    await search.click(); await search.fill('> settings');
    check(await search.inputValue() === '> settings', 'Portal search did not accept pointer focus and typing');
    const headerCorner = await page.locator('.top-bar').boundingBox();
    await page.mouse.click(headerCorner.x + 2, headerCorner.y + 2);
    await center.waitFor({state:'detached'});
    await page.getByRole('button', {name:'File actions', exact:true}).click();
    await inspectOverlay(page.getByRole('menu'), 'menu');
    await page.mouse.click(headerCorner.x + 2, headerCorner.y + 2);
    await page.getByRole('menu').waitFor({state:'hidden'});
    check(await page.locator('.top-bar').evaluate(node => getComputedStyle(node).getPropertyValue('app-region')) === 'drag',
      'Closing the menu must restore the header drag region');
  }
  check(captionFailures.length === 0, `Native caption/portal boundaries: ${JSON.stringify(captionFailures)}`);
  await page.getByRole('button', {name:`Close ${longName}`, exact:true}).click();
  await page.evaluate(() => document.documentElement.style.removeProperty('--window-controls-width'));
  await page.setViewportSize(originalViewport);
  await capture('desktop-after');
  const file = [...defaultPath.split(sep).slice(0, -4), 'tmp', 'desktop-updates', 'updates.md'].join(sep);
  await openPath(page, file);
  await page.getByRole('dialog').waitFor({state:'detached'});

  const calls = () => page.evaluate(() => window.__desktop.calls.map(call => call[0] === 'install' ? `install:${call[1].ok}` : call.join(':')));
  const push = state => page.evaluate(state => window.__desktop.push(state), state);
  const settings = page.getByTestId('sidebar').getByRole('button', {name:/^Settings/});
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
  await page.waitForFunction(() => document.activeElement?.textContent === 'Back to document', undefined, {timeout:5_000});
  await dialog.getByRole('button',{name:'About & updates',exact:true}).click();
  check(await page.getByTestId('app-version').innerText() === '0.2.0', 'About does not show the version');
  const stable = page.getByRole('radio', {name:/^Stable/});
  const beta = page.getByRole('radio', {name:/^Beta/});
  check(await stable.isChecked() && !await beta.isChecked(), 'Stable is not the default channel');
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

  // One Settings dot acknowledges the viewed version, across sidebar/rail and reloads.
  const dot = page.getByTestId('settings-update-dot');
  await push({phase:'available', version:'0.3.0-beta.1', prerelease:true});
  await dot.waitFor();
  check(await notice.count() === 0, 'Top update banner remains');
  check(await settings.getAttribute('aria-label') === 'Settings, new version available', 'Update cue has no accessible name');
  check(await settings.getAttribute('title') === 'New version 0.3.0-beta.1 available', 'Tooltip omits the offered version');
  for (const width of [1440,640]) {
    await page.setViewportSize({width,height:900});
    const geometry = await dot.evaluate(n => { const r=n.getBoundingClientRect(); return {width:r.width,height:r.height}; });
    check(geometry.width === 8 && geometry.height === 8, 'Update dot is not 8px');
    if (screenshots) await page.screenshot({path:`tmp/665/after-en-dark-${width}.png`});
  }
  await page.getByRole('button',{name:'Collapse Explorer',exact:true}).click();
  check(await dot.isVisible(), 'Collapsed rail lost the update dot');
  if (screenshots) await page.screenshot({path:'tmp/665/after-en-dark-640-rail.png'});
  await settings.click();
  await dialog.waitFor();
  await waitForStatus('IeumDoc 0.3.0-beta.1 (Beta) is available. You have 0.2.0.');
  check(await dialog.getByRole('button',{name:'About & updates',exact:true}).getAttribute('aria-current') === 'page', 'Dot did not open About');
  check((await page.getByTestId('settings-update-section').getAttribute('class')).includes('settings-update-highlight'), 'Update section is not highlighted');
  await dot.waitFor({state:'detached'});
  await capture('update-highlight-en-dark-640');
  await page.keyboard.press('Escape'); await dialog.waitFor({state:'detached'});
  check(await settings.evaluate(n => n === document.activeElement), 'Rail Settings lost return focus');
  await page.getByRole('button',{name:'Expand Explorer',exact:true}).click();
  await settings.click(); await dialog.waitFor();
  check(await dialog.getByRole('button',{name:'Appearance & language',exact:true}).getAttribute('aria-current') === 'page', 'Seen update changed default Settings category');
  await page.keyboard.press('Escape'); await dialog.waitFor({state:'detached'});
  // Reload re-reads the persisted acknowledgement; the mock Host preserves preferences.
  await page.evaluate(() => { sessionStorage.setItem('update-seen', window.__desktop.info.seenUpdate); sessionStorage.setItem('update-channel',window.__desktop.info.channel); sessionStorage.setItem('update-calls',JSON.stringify(window.__desktop.calls)); });
  await page.reload(); await ready();
  // Desktop startup supplies an explicit initial path, so reopen the scratch document after reload.
  await openPath(page, file);
  await push({phase:'available', version:'0.3.0-beta.1', prerelease:true});
  await settings.click(); await dialog.waitFor();
  await dialog.getByRole('button',{name:'About & updates',exact:true}).click();
  await waitForStatus('IeumDoc 0.3.0-beta.1 (Beta) is available. You have 0.2.0.');
  check(await dot.count() === 0, 'Viewed version notified after reload');
  await page.keyboard.press('Escape'); await dialog.waitFor({state:'detached'});
  await push({phase:'available', version:'0.3.0-beta.2', prerelease:true});
  await dot.waitFor();
  await settings.click(); await dialog.waitFor();
  await waitForStatus('IeumDoc 0.3.0-beta.2 (Beta) is available. You have 0.2.0.');
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
    await page.setViewportSize({width:640, height:812});
    await capture('about-downloaded-narrow');
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
  await settings.click(); await dialog.waitFor();
  await dialog.getByRole('button',{name:'About & updates',exact:true}).click();
  await restart.click();
  await page.getByTestId('update-problem').waitFor();
  check((await page.getByTestId('update-problem').innerText()).includes('Save your changes, then restart to update.'), 'Unsaved changes did not refuse the restart');
  await page.keyboard.press('Escape'); await dialog.waitFor({state:'detached'});
  await page.getByRole('tab', {name:'updates.md, Unsaved changes',exact:true}).click();
  check((await editor.innerText()).includes('Alpha. Unsaved'), 'Refusing the restart lost the edit');
  await page.getByRole('button', {name:'Save', exact:true}).click();
  await page.getByText('Saved', {exact:true}).filter({visible:true}).waitFor();
  const table = page.locator('[data-document-tab][data-active=true] [data-block="table"]');
  await table.hover();
  await table.getByRole('button', {name:'Edit table', exact:true}).click();
  await page.getByTestId('table-label').fill('unapplied-label');
  await page.getByRole('tab', {name:'technical-document.md',exact:true}).click();
  await settings.click();
  await dialog.waitFor();
  await dialog.getByRole('button',{name:'About & updates',exact:true}).click();
  await restart.click();
  await page.getByTestId('update-problem').waitFor();
  check((await page.getByTestId('update-problem').innerText()).includes('Apply or Cancel the open edits'), 'An unapplied edit did not refuse the restart');
  await page.keyboard.press('Escape');
  await dialog.waitFor({state:'detached'});
  await page.getByRole('tab', {name:'updates.md, Unsaved changes',exact:true}).click();
  check(await page.getByTestId('table-label').inputValue() === 'unapplied-label', 'Refusing the restart lost the draft');
  await page.getByTestId('table-cancel').click();

  // The same live guard covers in-flight Save and Source, even when the applied document is clean.
  const refused = async expected => {
    await settings.click(); await dialog.waitFor();
    await dialog.getByRole('button',{name:'About & updates',exact:true}).click();
    await restart.click();
    await page.getByTestId('update-problem').waitFor();
    check(expected.test(await page.getByTestId('update-problem').innerText()), 'The pending operation did not refuse the restart');
    await page.keyboard.press('Escape'); await dialog.waitFor({state:'detached'});
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
  await page.waitForFunction(() => typeof window.__savedUnloadPrevented === 'boolean');
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
  await settings.click(); await dialog.waitFor();
  await dialog.getByRole('button',{name:'About & updates',exact:true}).click();
  await restart.click();
  await page.waitForFunction(() => window.__desktop.calls.some(call => call[0] === 'install' && call[1].ok));
  const recorded = await calls();
  check(JSON.stringify(recorded) === JSON.stringify(['logs', 'logs', 'channel:beta', 'check', 'notes:', 'seen:0.3.0-beta.1', 'seen:0.3.0-beta.2', 'download', 'install:false', 'install:false', 'install:false', 'install:false', 'install:false', 'install:true']),
    `Unexpected Desktop calls ${JSON.stringify(recorded)}`);

  // Restore the baseline display state for the screen comparison (mock version 0.2.0,
  // Stable, idle, no records); the updater interaction assertions above are complete.
  await stable.check();
  await push({phase:'idle'});
  await waitForStatus('IeumDoc checks for updates automatically.');
  await page.keyboard.press('Escape'); await dialog.waitFor({state:'detached'});

  // Korean/light uses the same cue and direct destination, including a new offer while About is open.
  await settings.click(); await dialog.waitFor();
  await page.getByTestId('theme').selectOption('light');
  await page.getByTestId('ui-language').selectOption('ko');
  await page.keyboard.press('Escape'); await dialog.waitFor({state:'detached'});
  await push({phase:'available',version:'0.3.0-beta.3',prerelease:true});
  await dot.waitFor();
  const koreanSettings = page.getByTestId('sidebar').getByRole('button',{name:'설정, 새 버전 사용 가능',exact:true});
  check(await koreanSettings.getAttribute('title') === '새 버전 0.3.0-beta.3 사용 가능', 'Korean update tooltip is wrong');
  for (const width of [1440,640]) {
    await page.setViewportSize({width,height:900});
    if (screenshots) await page.screenshot({path:`tmp/665/after-ko-light-${width}.png`});
  }
  await koreanSettings.click(); await dialog.waitFor(); await dot.waitFor({state:'detached'});
  check(await dialog.getByRole('button',{name:'정보·업데이트',exact:true}).getAttribute('aria-current') === 'page', 'Korean cue did not open About');
  await capture('update-highlight-ko-light-640');
  await push({phase:'available',version:'0.3.0-beta.4',prerelease:true});
  await page.waitForFunction(() => window.__desktop.info.seenUpdate === '0.3.0-beta.4');
  await page.keyboard.press('Escape'); await dialog.waitFor({state:'detached'});
  check(await dot.count() === 0, 'Offer viewed in open About was not acknowledged');
  await push({phase:'up-to-date',latest:'0.3.0-beta.4'});
  await page.getByRole('button',{name:'설정',exact:true}).click();
  await page.getByTestId('theme').selectOption('dark');
  await page.getByTestId('ui-language').selectOption('en');
  await page.keyboard.press('Escape'); await dialog.waitFor({state:'detached'});

  // The actual screen stays bounded with every category and both languages, using the
  // same traversal for geometry assertions and optional manual-review captures.
  const screenResults = [];
  for (const language of ['en', 'ko']) {
    for (const width of [1440, 640]) {
      await page.setViewportSize({width, height:900});
      const expand = page.getByRole('button',{name:language === 'en' ? 'Expand Explorer' : '탐색기 펼치기',exact:true});
      if (await expand.isVisible()) await expand.click();
      await page.getByRole('button',{name:language === 'en' ? 'Settings' : '설정',exact:true}).click();
      await dialog.waitFor();
      check(await dialog.getByRole('button',{name:language === 'en' ? 'Open document settings' : '문서 설정 열기',exact:true}).count() === 0,
        'Settings offers the removed document settings entry');
      for (const [category, name] of language === 'en'
        ? [['appearance','Appearance & language'],['recovery','Saving & recovery'],['about','About & updates']]
        : [['appearance','표시·언어'],['recovery','저장·복구'],['about','정보·업데이트']]) {
        const entry = dialog.getByRole('button',{name,exact:true});
        await entry.click();
        check(await entry.getAttribute('aria-current') === 'page', 'Current category has no accessible cue');
        const geometry = await dialog.evaluate(n => {
          const box = n.getBoundingClientRect();
          const content = n.querySelector('.settings-content-inner').getBoundingClientRect();
          const nav = n.querySelector('.settings-navigation').getBoundingClientRect();
          const main = n.querySelector('.settings-content').getBoundingClientRect();
          return {x:box.x,y:box.y,width:box.width,height:box.height,
            overflow:n.scrollWidth > n.clientWidth || n.querySelector('.settings-body').scrollWidth > n.querySelector('.settings-body').clientWidth,
            bounded:content.width <= parseFloat(getComputedStyle(n.querySelector('.settings-content-inner')).maxWidth) + 1,
            stacked:main.top >= nav.bottom, dpr:devicePixelRatio, zoom:visualViewport.scale};
        });
        check(geometry.x === 0 && geometry.y === 0 && geometry.width === width && geometry.height === 900,
          `Settings does not cover the app: ${JSON.stringify(geometry)}`);
        check(!geometry.overflow && geometry.bounded && (width >= 768 || geometry.stacked),
          `Settings layout failed at ${language}/${width}/${category}: ${JSON.stringify(geometry)}`);
        const scrollState = await dialog.evaluate(n => ({
          scrollers:[n,...n.querySelectorAll('*')].filter(e => e.scrollTop).map(e => ({className:e.className,top:e.scrollTop})),
          note:n.querySelector('.settings-document-note').getBoundingClientRect().toJSON(),
          nav:n.querySelector('.settings-navigation').getBoundingClientRect().toJSON(),
        }));
        screenResults.push({language,width,category,...geometry,scrollState});
        await capture(`settings-${language}-${category}-${width}`);
        const lastControl = dialog.locator('main button, main select, main input').last();
        await lastControl.scrollIntoViewIfNeeded();
        check(await lastControl.isVisible(), `Last control unreachable at ${width}/${category}`);
        await dialog.locator('.settings-body').evaluate(n => n.scrollTop = 0);
      }
      // Resizing Settings keeps its Sidebar opener available at every supported width.
      await page.setViewportSize({width:width === 1440 ? 640 : 1440,height:900});
      await page.keyboard.press('Escape'); await dialog.waitFor({state:'detached'});
      await page.getByRole('button',{name:language === 'en' ? 'Settings' : '설정',exact:true})
        .and(page.locator(':focus')).waitFor();
      if (width === 1440) {
        // The remaining Command center entry reveals/focuses the inline block at supported widths.
        for (const closeWidth of [640, 1440]) {
          await page.setViewportSize({width:1440,height:900});
          await page.keyboard.press('Control+Slash');
          const center = page.getByRole('dialog',{name:language === 'en' ? 'Command center' : '커맨드 센터',exact:true});
          await center.getByRole('combobox').fill(language === 'en' ? '> Document settings' : '> 문서 설정');
          await page.setViewportSize({width:640,height:900});
          await center.getByRole('option',{name:language === 'en' ? 'Document settings…' : '문서 설정…',exact:true}).click();
          await center.waitFor({state:'detached'});
          const name = language === 'en' ? 'Document settings' : '문서 설정';
          const body = page.getByRole('region',{name,exact:true}).locator('.display-settings');
          const disclosure = page.getByRole('button',{name,exact:true});
          await body.waitFor();
          await disclosure.and(page.locator(':focus')).waitFor();
          await page.setViewportSize({width:closeWidth,height:900});
          await page.keyboard.press('Escape'); await body.waitFor({state:'hidden'});
          if (!await disclosure.evaluate(n=>n===document.activeElement)) throw Error('Inline settings lost focus after resize');
        }
      }
    }
    // Change through the actual preference control; never rewrite UI text in a capture.
    const expand = page.getByRole('button',{name:language === 'en' ? 'Expand Explorer' : '탐색기 펼치기',exact:true});
    if (await expand.isVisible()) await expand.click();
    await page.getByRole('button',{name:language === 'en' ? 'Settings' : '설정',exact:true}).click();
    await page.getByTestId('ui-language').selectOption(language === 'en' ? 'ko' : 'en');
    await page.keyboard.press('Escape'); await dialog.waitFor({state:'detached'});
  }
  await page.setViewportSize({width:1440,height:900});
  // Started without a document, nothing can be lost: the start allows the restart.
  // Close the saved tabs so navigation memory also deliberately starts empty (#383).
  for (const name of ['updates.md','technical-document.md']) await page.getByRole('button',{name:`Close ${name}`,exact:true}).click();
  const firstRequest = route => route.request().method() === 'GET' ? route.fulfill({json:{start:true}}) : route.continue();
  await page.route(/\/api\/document$/, firstRequest);
  try {
    await page.evaluate(() => { sessionStorage.removeItem('update-calls'); sessionStorage.removeItem('update-seen'); });
    await page.reload();
    await page.getByTestId('document-start').waitFor();
    await page.getByRole('button',{name:'Settings',exact:true}).click();
    check(await dialog.getByRole('button',{name:'Back to start',exact:true}).isVisible(), 'Settings has no start return');
    check(await dialog.getByRole('button',{name:'Open document settings',exact:true}).count() === 0, 'Start offers document settings');
    await dialog.getByRole('button',{name:'Back to start',exact:true}).click();
    await dialog.waitFor({state:'detached'});
    await push({phase:'downloaded', version:'0.3.0-beta.2', prerelease:true});
    await dot.waitFor();
    await settings.click(); await dialog.waitFor();
    await restart.click();
    await page.waitForFunction(() => window.__desktop.calls.some(call => call[0] === 'install'));
    check(JSON.stringify(await calls()) === JSON.stringify(['seen:0.3.0-beta.2','install:true']), `The start refused the restart: ${JSON.stringify(await calls())}`);
  } finally {
    await page.unroute(/\/api\/document$/, firstRequest);
  }
  return {calls: recorded, screenResults, separatorGeometry};
}
