// Shared theme choice across the footer, Settings and localized commands.
async (page, { expect, screenshots = false }) => {
  const ready = () => page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
  const settings = () => page.locator('.sidebar-preferences button, .sidebar-footer button').filter({has:page.locator('.settings-entry-icon')});
  const mode = () => page.getByRole('button',{name:/^(Color mode|색상 모드)$/});
  const back = () => page.getByTestId('settings-back');
  const closeSettings = async () => { await back().click(); await page.getByTestId('settings-dialog').waitFor({state:'detached'}); };
  const configure = async (language, theme) => {
    await settings().click();
    await expect(back()).toBeFocused();
    await page.getByTestId('theme').selectOption(theme);
    await page.getByTestId('ui-language').selectOption(language);
    await closeSettings();
  };
  const menu = () => page.getByRole('menu',{name:/^(Color mode|색상 모드)$/});
  const capture = async name => { if (screenshots) { await page.evaluate(() => document.fonts.ready); await page.screenshot({path:`tmp/color-mode-798/${name}.png`}); } };
  await expect(mode()).toHaveCount(1);
  // Same viewport/language/theme states as the preserved clean-base captures.
  for (const [width, language, theme] of [[1440,'en','light'],[640,'ko','dark']]) {
    await page.setViewportSize({width,height:900});
    await configure(language,theme);
    await mode().click(); await menu().waitFor();
    await expect(menu().getByRole('menuitemradio',{checked:true})).toHaveCount(1);
    const bounds = await menu().boundingBox();
    expect(bounds.x >= 0 && bounds.y >= 0 && bounds.x+bounds.width <= width && bounds.y+bounds.height <= 900).toBe(true);
    const settingsBounds = await settings().boundingBox(), modeBounds = await mode().boundingBox();
    expect(Math.abs(settingsBounds.y+settingsBounds.height/2-modeBounds.y-modeBounds.height/2)).toBeLessThan(1);
    await capture(`after-${width}-expanded`);
    await page.keyboard.press('Escape');
    await page.getByRole('button',{name:/^(Collapse Explorer|탐색기 접기)$/}).click();
    await mode().click(); await menu().waitFor();
    await expect(menu().getByRole('menuitemradio',{checked:true})).toHaveCount(1);
    await capture(`after-${width}-rail`);
    await page.keyboard.press('Escape');
    await page.getByRole('button',{name:/^(Expand Explorer|탐색기 펼치기)$/}).click();
  }
  await expect(mode()).toHaveCount(1);
  await configure('en','system');
  const assertChoice = async value => {
    await expect.poll(() => page.evaluate(() => localStorage.getItem('ieumdoc.theme'))).toBe(value);
    await expect(page.locator('html')).toHaveAttribute('data-theme',value === 'system' ? 'light' : value);
  };
  await page.emulateMedia({colorScheme:'light'});
  // Keyboard open, current radio, arrow selection and focus return in expanded and rail states.
  for (const collapsed of [false,true]) {
    if (collapsed) await page.getByRole('button',{name:'Collapse Explorer',exact:true}).click();
    await settings().focus();
    await page.keyboard.press('Tab');
    await expect(mode()).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button',{name:'Find documents and commands',exact:true})).toBeFocused();
    await mode().focus();
    const system = menu().getByRole('menuitemradio',{name:'System',exact:true});
    const openKeyboardMenu = async () => {
      await page.keyboard.press('Enter');
      await expect(system).toHaveAttribute('aria-checked','true');
      // The popup mounts before Base UI's next-frame initial focus reaches its radio.
      await expect(system).toBeFocused();
    };
    if (collapsed) {
      // Hold the actual library focus call: mounting/current state must not signal readiness.
      await page.evaluate(() => {
        const original = HTMLElement.prototype.focus;
        const pending = [];
        window.__colorModeFocus = { pending, release() {
          HTMLElement.prototype.focus = original;
          for (const resume of pending) resume();
          delete window.__colorModeFocus;
        }};
        HTMLElement.prototype.focus = function(...args) {
          if (this.closest('[role="menu"][aria-label="Color mode"]')) pending.push(() => original.apply(this,args));
          else original.apply(this,args);
        };
      });
      let opened = false;
      const opening = openKeyboardMenu().then(() => { opened = true; });
      try {
        await page.waitForFunction(() => window.__colorModeFocus.pending.length > 0);
        await expect(system).toHaveAttribute('aria-checked','true');
        expect(opened, 'Keyboard readiness must wait for actual initial focus').toBe(false);
      } finally {
        await page.evaluate(() => window.__colorModeFocus.release());
        await opening;
      }
    } else await openKeyboardMenu();
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowDown');
    await expect(menu().getByRole('menuitemradio',{name:'Light',exact:true})).toBeFocused();
    await page.keyboard.press('Enter');
    await menu().waitFor({state:'detached'});
    await expect(mode()).toBeFocused();
    await assertChoice('light');
    await settings().click();
    await expect(page.getByTestId('theme')).toHaveValue('light');
    await page.getByTestId('theme').selectOption('dark');
    await closeSettings();
    await mode().click();
    await expect(menu().getByRole('menuitemradio',{name:'Dark',exact:true})).toHaveAttribute('aria-checked','true');
    await menu().getByRole('menuitemradio',{name:'System',exact:true}).click();
    await assertChoice('system');
  }
  // Same three commands in both languages, also searchable through the other language's aliases.
  for (const [language, labels] of [['en',['System','Light','Dark']],['ko',['시스템','라이트','다크']]]) {
    await configure(language,'system');
    for (const [index,value] of ['system','light','dark'].entries()) {
      await page.keyboard.press('Control+Slash');
      const input = page.getByRole('combobox');
      await expect(input).toBeFocused();
      await input.fill(`> ${language==='en'?'색상 모드':'color mode'} ${value}`);
      const option = page.getByRole('option',{name:`${language==='en'?'Color mode':'색상 모드'}: ${labels[index]}`,exact:true});
      await expect(option).toBeVisible();
      await page.keyboard.press('Enter');
      await option.waitFor({state:'detached'});
      await assertChoice(value);
      await settings().click();
      await expect(page.getByTestId('theme')).toHaveValue(value);
      await closeSettings();
    }
  }
  await page.reload(); await ready();
  await settings().click(); await expect(page.getByTestId('theme')).toHaveValue('dark'); await closeSettings();
  await mode().click(); await menu().getByRole('menuitemradio',{name:'시스템',exact:true}).click();
  await page.emulateMedia({colorScheme:'dark'});
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await mode().click(); await expect(menu().getByRole('menuitemradio',{name:'시스템',exact:true})).toHaveAttribute('aria-checked','true');
  await page.keyboard.press('Escape');
  // Storage refusal must preserve the live choice and expose the existing localized error.
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    window.__restoreThemeStorage = () => { Storage.prototype.setItem = original; };
    Storage.prototype.setItem = function(key, value) { if (key === 'ieumdoc.theme') throw Error('Storage refused'); return original.call(this,key,value); };
  });
  await mode().click(); await menu().getByRole('menuitemradio',{name:'라이트',exact:true}).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  await expect(page.getByText('테마를 저장하지 못했습니다. 이 페이지를 닫을 때까지 적용됩니다.',{exact:true})).toBeVisible();
  await settings().click();
  await expect(page.getByTestId('theme')).toHaveValue('light');
  await expect(page.getByRole('alert').filter({hasText:'테마를 저장하지 못했습니다.'})).toBeVisible();
  await closeSettings();
  await page.evaluate(() => window.__restoreThemeStorage());
  await mode().click(); await menu().getByRole('menuitemradio',{name:'다크',exact:true}).click();
  await expect(page.getByText('테마를 저장하지 못했습니다. 이 페이지를 닫을 때까지 적용됩니다.',{exact:true})).toHaveCount(0);
  // Existing update-dot geometry stays separate from the new control in both layouts.
  await page.addInitScript(() => {
    window.litzioDesktop = {
      info: async () => ({version:'0.1.0',channel:'beta',updatesSupported:true,update:{phase:'available',version:'0.2.0',prerelease:true}}),
      onUpdateState: () => () => {}, onRestartCheck: () => () => {},
      setTheme: async theme => theme==='dark' || (theme==='system' && matchMedia('(prefers-color-scheme: dark)').matches),
      setWindowBackground: async () => {},
    };
  });
  await page.reload(); await ready();
  // Sidebar expansion is page-local and resets on reload. Set each state explicitly.
  for (const collapsed of [true,false]) {
    const sidebar = page.getByTestId('sidebar');
    const isCollapsed = (await sidebar.getAttribute('class')).includes('sidebar--collapsed');
    if (isCollapsed !== collapsed) await sidebar.locator('.sidebar-collapse').click();
    const dot = page.getByTestId('settings-update-dot');
    await expect(dot).toBeVisible();
    const a = await dot.boundingBox(), b = await mode().boundingBox();
    expect(a.x+a.width <= b.x || b.x+b.width <= a.x || a.y+a.height <= b.y || b.y+b.height <= a.y).toBe(true);
    await mode().click();
    const bounds = await menu().boundingBox(), viewport = page.viewportSize();
    expect(bounds.x >= 0 && bounds.y >= 0 && bounds.x+bounds.width <= viewport.width && bounds.y+bounds.height <= viewport.height).toBe(true);
    await page.keyboard.press('Escape');
  }
}
