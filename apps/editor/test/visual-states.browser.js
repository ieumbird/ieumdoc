// Computed state combinations on the real UI; screenshot-only review stays outside this test.
async (page, { withBlockHover }) => {
  const check = (value, message) => { if (!value) throw Error(message); };
  const origin = page.url().split('/').slice(0, 3).join('/');
  const loaded = await (await page.request.get(`${origin}/api/document`)).json();
  const sep = loaded.path.includes('\\') ? '\\' : '/';
  const root = loaded.path.split(sep).slice(0, -4).join(sep);
  const folder = [root, 'tmp', 'quiet-document'].join(sep);
  const settle = async () => { await page.waitForTimeout(200); };
  const state = locator => locator.evaluate(async n => {
    // Compare settled states: CSS transitions advance per frame, so a fixed wait can still read a blend.
    for (let running; (running = n.getAnimations().filter(a => a instanceof CSSTransition)).length;)
      await Promise.allSettled(running.map(a => a.finished));
    const c = getComputedStyle(n), marker = getComputedStyle(n, '::before'), r = n.getBoundingClientRect();
    // Focus ring = the rendered inset box-shadow, composited over the row's effective surface.
    const ctx = document.createElement('canvas').getContext('2d', {willReadFrequently: true});
    const rgba = color => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1); return [...ctx.getImageData(0, 0, 1, 1).data]; };
    const over = (top, bottom) => { const a = top[3] / 255; return top.slice(0, 3).map((v, i) => v * a + bottom[i] * (1 - a)).concat(255); };
    const surface = node => { const layers = []; for (let e = node; e; e = e.parentElement) { const b = rgba(getComputedStyle(e).backgroundColor); if (b[3]) layers.push(b); if (b[3] === 255) break; }
      return layers.reverse().reduce((acc, b) => over(b, acc), [255, 255, 255, 255]); };
    const lum = v => v.slice(0, 3).map(x => { x /= 255; return x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4; }).reduce((s, x, i) => s + x * [.2126, .7152, .0722][i], 0);
    const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
    const inset = [...c.boxShadow.matchAll(/(rgba?\([^)]+\)) 0px 0px 0px ([\d.]+)px inset/g)].map(([, color, spread]) => ({color, spread: Number(spread)}))
      .filter(s => s.spread > 0).sort((a, b) => b.spread - a.spread)[0];
    const base = surface(n);
    const ringContrast = inset ? ratio(over(rgba(inset.color), base), base) : 0, ringWidth = inset ? inset.spread : 0;
    const resolve = (property, value) => { const probe = document.createElement('span'); probe.style.setProperty(property, value); n.append(probe);
      const result = getComputedStyle(probe).getPropertyValue(property); probe.remove(); return result; };
    const textRects = []; const walker = document.createTreeWalker(n, NodeFilter.SHOW_TEXT);
    for (let t; t = walker.nextNode();) if (t.textContent.trim()) { const range = document.createRange(); range.selectNodeContents(t); const r = range.getBoundingClientRect(); textRects.push([r.x,r.y,r.width,r.height]); }
    return { background: c.backgroundColor, color: c.color, border: c.borderColor, radius: c.borderRadius, opacity: c.opacity,
      outline: c.outlineStyle, outlineColor: c.outlineColor, outlineOffset: c.outlineOffset, ring: c.boxShadow,
      marker: marker.content, markerColor: marker.backgroundColor, markerWidth: parseFloat(marker.width),
      textRects, textContrast: ratio(rgba(c.color), base),
      selected: resolve('background-color','var(--id-color-surface-selected)'), selectedHover: resolve('background-color','var(--id-color-surface-selected-hover)'),
      selectedText: resolve('color','var(--id-color-text-selected)'), surface: resolve('background-color','var(--id-color-surface)'),
      track: resolve('background-color','var(--id-color-surface-pressed)'), text: resolve('color','var(--id-color-text)'), muted: resolve('color','var(--id-color-text-muted)'),
      segment: resolve('box-shadow','0 0 0 var(--border-width) var(--id-color-border), var(--shadow-segment)'),
      rect: [r.x, r.y, r.width, r.height], focused: n.matches(':focus-visible'), ringContrast, ringWidth, ringColor: inset?.color, active: document.activeElement === n };
  });
  await page.setViewportSize({width:1440, height:1000});
  await page.evaluate(() => {localStorage.clear(); sessionStorage.clear();});
  await page.reload();
  const openFolder = page.getByRole('button', {name:'Open folder…', exact:true});
  // One light theme: an OS dark preference must not gray out fields or outlined controls.
  const faces = async () => {
    await page.mouse.move(0,0);
    const button = (await state(openFolder)).background;
    await openFolder.click();
    const field = (await state(page.getByTestId('folder-path'))).background;
    await page.keyboard.press('Escape');
    return [button, field];
  };
  const lightFaces = await faces();
  await page.emulateMedia({colorScheme:'dark'});
  const darkFaces = await faces();
  await page.emulateMedia({colorScheme:'light'});
  check(JSON.stringify(darkFaces) === JSON.stringify(lightFaces), `OS dark preference changed control faces: ${JSON.stringify({lightFaces, darkFaces})}`);
  await openFolder.click();
  await page.getByTestId('folder-path').fill(folder);
  await page.getByTestId('folder-open').click();
  const currentFile = page.getByRole('treeitem', {name:'quiet-document.md', exact:true});
  await currentFile.click();
  // The previous document's Outline stays current while this file is still opening.
  // Wait for this row's state before measuring its surface; missing CSS must still fail below.
  await currentFile.and(page.locator('[aria-current="page"]')).waitFor();
  await page.locator('.document-outline-item[aria-current="location"]').waitFor();
  await page.evaluate(async () => {await document.fonts.ready; document.activeElement?.blur();});
  await page.mouse.move(0,0);
  const results = [];
  for (const [label, current, other, direction] of [
    ['file', currentFile, page.getByRole('treeitem', {name:'quiet-document-long.md', exact:true}), 'ArrowUp'],
    ['outline', page.locator('.document-outline-item').first(), page.locator('.document-outline-item').nth(1), 'ArrowDown'],
  ]) {
    const rest = await state(current), otherRest = await state(other);
    await other.hover(); const hover = await state(other);
    check(rest.background !== hover.background, `${label}: current and ordinary hover share a surface`);
    check(rest.background === rest.selected && rest.color === rest.selectedText && rest.textContrast >= 4.5 && rest.marker === 'none' && rest.ring === 'none',
      `${label}: current needs only selected background/text, without a marker ${JSON.stringify(rest)}`);
    await current.hover(); const currentHover = await state(current);
    check(currentHover.background === rest.selectedHover && currentHover.background !== rest.background && currentHover.background !== hover.background && currentHover.color === rest.color && currentHover.marker === 'none' && currentHover.textContrast >= 4.5,
      `${label}: hover must preserve the current treatment`);
    await current.focus(); await page.keyboard.press(direction); await page.mouse.move(0,0);
    const focus = await state(other);
    check(focus.focused && focus.active && focus.ringWidth >= 2 && focus.ringContrast >= 3,
      `${label}: separate keyboard focus needs a ring inside the scrollable row ${JSON.stringify(focus)}`);
    check(await current.getAttribute('aria-current') !== null && await other.getAttribute('aria-current') === null,
      `${label}: moving focus changed current`);
    check(JSON.stringify(rest.rect) === JSON.stringify((await state(current)).rect) &&
      JSON.stringify(otherRest.rect) === JSON.stringify(focus.rect) && JSON.stringify(rest.textRects) === JSON.stringify(currentHover.textRects) &&
      JSON.stringify(otherRest.textRects) === JSON.stringify(focus.textRects), `${label}: states shifted row or text geometry`);
    await page.keyboard.press(direction === 'ArrowUp' ? 'ArrowDown' : 'ArrowUp');
    const currentFocus = await state(current);
    check(currentFocus.focused && currentFocus.active && currentFocus.ringWidth >= 2 && currentFocus.ringContrast >= 3 && currentFocus.marker === rest.marker,
      `${label}: current and keyboard focus must coexist`);
    results.push({label, rest, hover, currentHover, focus, currentFocus});
    await page.evaluate(() => document.activeElement.blur());
  }
  check(results[0].rest.background === results[1].rest.background && results[0].rest.color === results[1].rest.color &&
    results[0].rest.markerColor === results[1].rest.markerColor, 'File and outline current rules differ');

  const ghost = page.getByRole('button', {name:'New file in folder', exact:true});
  await ghost.hover(); await settle(); const ghostHover = await state(ghost);
  check(ghostHover.background !== (await state(page.getByTestId('sidebar'))).background, 'Ghost hover disappears on panel');
  const menu = page.getByRole('button', {name:'More actions', exact:true});
  await menu.click(); await page.mouse.move(0,0); await settle(); const menuOpen = await state(menu);
  // An open menu keeps the neutral pressed face, distinct from hover, and draws no border box.
  check(menuOpen.background !== ghostHover.background && menuOpen.background !== (await state(page.getByTestId('sidebar'))).background &&
    menuOpen.border === 'rgba(0, 0, 0, 0)', `Menu open looks like hover or keeps a border box ${JSON.stringify(menuOpen)}`);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'More actions');
  check(await menu.evaluate(n => n === document.activeElement), 'Menu did not restore focus');
  const outline = page.getByRole('button', {name:'Outline', exact:true});
  await outline.click();
  await outline.hover(); await settle(); const toggleHover = await state(outline);
  await outline.click(); await page.mouse.move(0,0); await settle(); const pressed = await state(outline);
  // TopBar boolean toggles keep the selected face; tab groups use raised segments.
  const marker = locator => locator.evaluate(n => getComputedStyle(n, '::after').content);
  // An on Outline is a pressed toggle: the selected face, distinct from rest and from neutral hover, kept on hover.
  const rest = await state(page.getByRole('button', {name:'File actions', exact:true}));
  check(pressed.background !== toggleHover.background && pressed.background !== rest.background && await marker(outline) === 'none',
    `Pressed Outline needs its selected face without a marker ${JSON.stringify({pressed, toggleHover})}`);
  await outline.hover(); await settle();
  const pressedHover = await state(outline);
  check(pressedHover.background !== toggleHover.background && pressedHover.background !== rest.background && pressedHover.color === pressed.color,
    'Hover hides the pressed Outline face');
  // Visual/Source is a segmented control: the chosen view is a raised face, the other has none.
  const visual = page.getByTestId('view-visual'), source = page.getByTestId('view-source');
  await page.mouse.move(0,0); await settle();
  const active = await state(visual), inactiveRest = await state(source);
  check(active.background !== inactiveRest.background && active.ring !== 'none' && inactiveRest.ring === 'none' &&
    await marker(visual) === 'none' && await marker(source) === 'none', 'Chosen view lacks its raised segment');
  // Hovering the other view darkens its text without a face.
  await source.hover(); await settle();
  const inactiveHover = await state(source);
  check(inactiveHover.background === inactiveRest.background && inactiveHover.color !== inactiveRest.color,
    'Inactive view hover needs restrained feedback distinct from the chosen view');
  await visual.hover(); await settle();
  check(JSON.stringify((await state(visual)).background) === JSON.stringify(active.background), 'Hover changes the chosen view');
  const files = page.getByRole('button', {name:'Files',exact:true}), display = page.getByRole('button', {name:'Display',exact:true});
  await page.mouse.move(0,0);
  const filesRest = await state(files), displayRest = await state(display), track = await state(page.getByRole('group',{name:'Sidebar tools'}));
  check(track.background === filesRest.track && filesRest.background === filesRest.surface && filesRest.color === filesRest.text && filesRest.ring === filesRest.segment &&
    displayRest.color === displayRest.muted && await marker(files) === 'none', 'Sidebar tools must reuse the raised segment tokens');
  await display.hover(); const displayHover = await state(display);
  check(displayHover.background === displayRest.background && displayHover.color === displayHover.text, 'Inactive Sidebar tool hover must only darken text');
  await files.hover(); const filesHover = await state(files);
  check(filesHover.background === filesRest.background && filesHover.color === filesRest.color && filesHover.ring === filesRest.ring &&
    JSON.stringify(filesHover.textRects) === JSON.stringify(filesRest.textRects), 'Hover must preserve the raised current tool and text position');
  await files.focus(); await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab');
  const filesFocus = await state(files);
  check(filesFocus.focused && filesFocus.ringWidth >= 2 && filesFocus.ringContrast >= 3 && filesFocus.ring.includes(filesRest.ring) && filesFocus.background === filesRest.background &&
    JSON.stringify(filesFocus.textRects) === JSON.stringify(filesRest.textRects), 'Sidebar current and keyboard focus must coexist without text movement');
  await page.evaluate(() => document.activeElement.blur());
  await page.mouse.move(0,0); await settle();
  // A clean Save is an ordinary available ghost action, like File actions beside it.
  const cleanSave = await state(page.getByTestId('save')), actionsRest = await state(page.getByRole('button', {name:'File actions', exact:true}));
  check(!await page.getByTestId('save').isDisabled() && cleanSave.background === actionsRest.background && cleanSave.color === actionsRest.color &&
    cleanSave.opacity === '1', 'Clean Save must look like an available ghost action');

  await ghost.click();
  const input = page.getByTestId('new-file-name');
  const create = page.getByRole('button', {name:'Create', exact:true});
  check(await create.isDisabled() && Number((await state(create)).opacity) < 1, 'Unavailable Create needs its disabled appearance');
  await input.fill('../invalid'); await page.getByRole('button', {name:'Create', exact:true}).click();
  await page.getByTestId('new-error').waitFor();
  check(await input.getAttribute('aria-invalid') === 'true', 'Rejected name needs an invalid field');
  await input.focus(); await settle();
  const invalid = await state(input);
  check(invalid.border === (await state(page.getByTestId('new-error'))).color && results[0].focus.ringColor && invalid.ring.includes(results[0].focus.ringColor),
    'Error boundary must coexist with the interaction focus ring');
  await input.fill('valid');
  check(await input.getAttribute('aria-invalid') !== 'true', 'Correcting input did not clear invalid state');
  await page.getByRole('button', {name:'Cancel', exact:true}).focus(); await settle();
  const field = await state(input), secondary = await state(page.getByRole('button', {name:'Cancel', exact:true}));
  // The primary face shares the ring's blue; a white boundary keeps focus visible.
  await page.mouse.move(0,0); await input.focus();
  for (let i = 0; i < 4 && !await create.evaluate(n => n === document.activeElement); i++) await page.keyboard.press('Tab');
  await settle();
  const primaryFocus = await state(create);
  check(primaryFocus.focused && primaryFocus.border !== primaryFocus.background && primaryFocus.ring.includes(results[0].focus.ringColor),
    `Focused primary action hides its ring: ${JSON.stringify(primaryFocus)}`);
  await page.keyboard.press('Escape');

  // Both + and slash use this command menu; active is independent of keyboard focus.
  await page.locator('[data-document-tab][data-active=true] .document-editor').evaluate(n => {
    n.editor.commands.setTextSelection(n.editor.state.doc.firstChild.nodeSize+1); n.editor.view.focus();
  });
  await page.keyboard.type('/');
  const choice = page.locator('.command-menu-item.active'); await choice.waitFor();
  await page.mouse.move(0,0); const choiceRest = await state(choice);
  check(choiceRest.background === choiceRest.selected && choiceRest.color === choiceRest.selectedText && choiceRest.ring === 'none' && choiceRest.textContrast >= 4.5,
    'Command active choice must use only selected background/text');
  await choice.hover(); const choiceHover = await state(choice);
  check(choiceHover.background === choiceRest.selectedHover && choiceHover.color === choiceRest.color && choiceHover.textContrast >= 4.5 &&
    JSON.stringify(choiceHover.textRects) === JSON.stringify(choiceRest.textRects), 'Command active hover must preserve text and its selected-hover distinction');
  await page.keyboard.press('Escape');
  await page.locator('[data-document-tab][data-active=true] .document-editor').evaluate(n => n.editor.commands.undo());
  // Slash deliberately keeps editor focus; + opens the same rows with actual menu focus.
  let choiceFocus;
  await withBlockHover(page, async () => {
    await page.locator('[data-document-tab][data-active=true] .heading').first().hover();
    await page.getByRole('button',{name:'Insert block after heading block 1',exact:true}).click();
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowUp');
    choiceFocus = await state(page.locator('.command-menu-item').first());
    check(choiceFocus.focused && choiceFocus.ringWidth >= 2 && choiceFocus.ringContrast >= 3, 'Command choice needs independent keyboard focus');
    await page.keyboard.press('Escape');
  });
  await page.locator('[data-document-tab][data-active=true]').getByTestId('figure-image').click();
  await page.getByRole('button', {name:'Edit figure', exact:true}).click();
  const nativeCancel = page.getByTestId('figure-cancel');
  await nativeCancel.hover(); await page.mouse.move(0,0); await settle();
  const native = await state(nativeCancel);
  check(native.background === secondary.background && native.border === secondary.border && native.radius === secondary.radius,
    'Native and Base UI secondary controls disagree');
  await nativeCancel.click();

  // Preview layout must not override the Notice's error role.
  await page.locator('[data-document-tab][data-active=true] .equation').hover();
  await page.locator('[data-document-tab][data-active=true] .equation').getByRole('button', {name:'Edit', exact:true}).click();
  const preview = await state(page.getByTestId('equation-edit-preview'));
  await page.getByTestId('equation-latex').fill('\\frac{');
  const previewError = await state(page.getByTestId('equation-edit-preview-error'));
  check(previewError.color === invalid.border && previewError.border === invalid.border && previewError.background !== preview.background,
    'Equation preview layout hides the error role');
  await page.getByTestId('equation-cancel').click();

  await page.locator('[data-document-tab][data-active=true] .table [data-table-cell]').first().click();
  const tableActions = page.getByRole('button', {name:'Table actions', exact:true});
  await tableActions.click(); await page.mouse.move(0,0); await settle();
  const tableOpen = await state(tableActions);
  check(tableOpen.background === menuOpen.background && tableOpen.ring === 'none' && menuOpen.border === 'rgba(0, 0, 0, 0)',
    `Native table menu needs the shared persistent open face without a boundary box ${JSON.stringify(tableOpen)}`);
  await page.keyboard.press('Escape');

  // Progress remains visible while motion is optional; opening/closing overlays are static.
  for (const reducedMotion of ['no-preference', 'reduce']) {
    await page.emulateMedia({reducedMotion});
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    await page.route('**/api/document', async route => {
      if (route.request().method() !== 'POST') return route.continue();
      await gate;
      await route.fulfill({json:{revision:loaded.revision}});
    });
    try {
      await page.getByTestId('save').click();
      const spinner = page.locator('.top-bar-save-spinner');
      await spinner.waitFor();
      const progress = await spinner.evaluate(n => ({animation:getComputedStyle(n).animationName, busy:n.closest('button').getAttribute('aria-busy')}));
      check(progress.busy === 'true' && (reducedMotion === 'reduce' ? progress.animation === 'none' : progress.animation !== 'none'),
        `Save progress ignored motion preference: ${JSON.stringify(progress)}`);
      release();
      await spinner.waitFor({state:'detached'});
    } finally { release(); await page.unroute('**/api/document'); }
  }
  await page.emulateMedia({reducedMotion:'no-preference'});

  // Actual resolved product roles: thresholds apply to text, control boundaries and indicators,
  // not decorative separators or the small difference between rest and hover backgrounds.
  const contrasts = await page.evaluate(() => {
    const canvas = document.createElement('canvas'), context = canvas.getContext('2d');
    if (!context) throw Error('Missing contrast canvas');
    const rgb = token => {
      if (!getComputedStyle(document.documentElement).getPropertyValue(`--id-color-${token}`).trim()) throw Error(`Missing contrast token ${token}`);
      const probe = document.createElement('span'); probe.style.color = `var(--id-color-${token})`; document.body.append(probe);
      const color = getComputedStyle(probe).color; probe.remove();
      context.clearRect(0,0,1,1); context.fillStyle = color; context.fillRect(0,0,1,1);
      return [...context.getImageData(0,0,1,1).data].slice(0,3);
    };
    const lum = rgb => rgb.map(v => {v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;})
      .reduce((sum,v,i) => sum + v * [.2126,.7152,.0722][i],0);
    const pairs = [];
    for (const bg of ['surface','surface-subtle','surface-hover','surface-pressed'])
      for (const fg of ['text','text-muted','text-subtle']) pairs.push([fg,bg,4.5]);
    for (const bg of ['surface-selected','surface-selected-hover']) pairs.push(['text-selected',bg,4.5]);
    for (const [fg,bg] of [['text-on-accent','accent'],['text-on-accent','accent-hover'],['danger','surface-danger'],['info','surface-info'],['warning','surface-warning']]) pairs.push([fg,bg,4.5]);
    for (const bg of ['surface','surface-subtle','surface-hover','surface-pressed','surface-selected','surface-selected-hover']) pairs.push(['interaction',bg,3]);
    for (const bg of ['surface','surface-subtle','surface-pressed']) pairs.push(['border-control',bg,3]);
    return pairs.map(([fg,bg,min]) => {const a=lum(rgb(fg)),b=lum(rgb(bg)); return {fg,bg,min,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};});
  });
  check(contrasts.every(c => c.ratio >= c.min), `Contrast failure: ${JSON.stringify(contrasts.filter(c => c.ratio < c.min))}`);
  return {navigation:results, filesRest, filesFocus, choiceRest, choiceHover, choiceFocus, ghostHover, menuOpen, pressed, field, contrasts};
}
