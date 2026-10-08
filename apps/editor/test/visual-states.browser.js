// Computed state combinations on the real UI; screenshot-only review stays outside this test.
async page => {
  const check = (value, message) => { if (!value) throw Error(message); };
  const origin = page.url().split('/').slice(0, 3).join('/');
  const loaded = await (await page.request.get(`${origin}/api/document`)).json();
  const sep = loaded.path.includes('\\') ? '\\' : '/';
  const root = loaded.path.split(sep).slice(0, -4).join(sep);
  const folder = [root, 'tmp', 'quiet-document'].join(sep);
  const settle = async () => { await page.waitForTimeout(200); };
  const state = locator => locator.evaluate(n => {
    const c = getComputedStyle(n), marker = getComputedStyle(n, '::before'), r = n.getBoundingClientRect();
    return { background: c.backgroundColor, color: c.color, border: c.borderColor, radius: c.borderRadius, opacity: c.opacity,
      outline: c.outlineStyle, outlineColor: c.outlineColor, outlineOffset: c.outlineOffset, ring: c.boxShadow,
      marker: marker.content, markerColor: marker.backgroundColor, markerWidth: parseFloat(marker.width),
      rect: [r.x, r.y, r.width, r.height], focused: n.matches(':focus-visible') };
  });
  await page.setViewportSize({width:1440, height:1000});
  await page.evaluate(() => {localStorage.clear(); sessionStorage.clear();});
  await page.reload();
  await page.getByRole('button', {name:'Open folder…', exact:true}).click();
  await page.getByTestId('folder-path').fill(folder);
  await page.getByTestId('folder-open').click();
  const currentFile = page.getByRole('treeitem', {name:'quiet-document.md', exact:true});
  await currentFile.click();
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
    check(rest.marker === '""' && rest.markerWidth > 0, `${label}: current needs a non-color marker`);
    await current.hover(); const currentHover = await state(current);
    check(currentHover.background !== hover.background && currentHover.color === rest.color && currentHover.marker === rest.marker,
      `${label}: hover must preserve the current treatment`);
    await current.focus(); await page.keyboard.press(direction); await page.mouse.move(0,0);
    const focus = await state(other);
    check(focus.focused && focus.outline === 'solid' && parseFloat(focus.outlineOffset) <= -2,
      `${label}: separate keyboard focus needs a ring inside the scrollable row`);
    check(await current.getAttribute('aria-current') !== null && await other.getAttribute('aria-current') === null,
      `${label}: moving focus changed current`);
    check(JSON.stringify(rest.rect) === JSON.stringify((await state(current)).rect) &&
      JSON.stringify(otherRest.rect) === JSON.stringify(focus.rect), `${label}: states shifted row geometry`);
    await page.keyboard.press(direction === 'ArrowUp' ? 'ArrowDown' : 'ArrowUp');
    const currentFocus = await state(current);
    check(currentFocus.focused && currentFocus.outline === 'solid' && currentFocus.marker === rest.marker,
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
  check(menuOpen.background !== ghostHover.background && menuOpen.border !== 'rgba(0, 0, 0, 0)', 'Menu open looks like hover');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'More actions');
  check(await menu.evaluate(n => n === document.activeElement), 'Menu did not restore focus');
  const wide = page.getByRole('button', {name:'Wide document', exact:true});
  await wide.hover(); await settle(); const toggleHover = await state(wide);
  await wide.click(); await page.mouse.move(0,0); await settle(); const pressed = await state(wide);
  check(pressed.background !== toggleHover.background && pressed.border !== 'rgba(0, 0, 0, 0)', 'Pressed toggle looks like hover');
  await wide.hover(); await settle(); check((await state(wide)).border === pressed.border, 'Hover hides pressed boundary');
  await wide.click();
  const activeView = await state(page.getByTestId('view-visual')), inactiveView = await state(page.getByTestId('view-source'));
  check(activeView.background !== inactiveView.background && activeView.border !== inactiveView.border, 'View segment lacks active face/boundary');

  await ghost.click();
  const input = page.getByTestId('new-file-name');
  const create = page.getByRole('button', {name:'Create', exact:true});
  check(await create.isDisabled() && Number((await state(create)).opacity) < 1, 'Unavailable Create needs its disabled appearance');
  await input.fill('../invalid'); await page.getByRole('button', {name:'Create', exact:true}).click();
  await page.getByTestId('new-error').waitFor();
  check(await input.getAttribute('aria-invalid') === 'true', 'Rejected name needs an invalid field');
  await input.focus(); await settle();
  const invalid = await state(input);
  check(invalid.border === (await state(page.getByTestId('new-error'))).color && invalid.ring.includes(results[0].focus.outlineColor),
    'Error boundary must coexist with the interaction focus ring');
  await input.fill('valid');
  check(await input.getAttribute('aria-invalid') !== 'true', 'Correcting input did not clear invalid state');
  await page.getByRole('button', {name:'Cancel', exact:true}).focus(); await settle();
  const field = await state(input), secondary = await state(page.getByRole('button', {name:'Cancel', exact:true}));
  await page.keyboard.press('Escape');
  await page.getByTestId('figure-image').click();
  await page.getByRole('button', {name:'Edit figure', exact:true}).click();
  const nativeCancel = page.getByTestId('figure-cancel');
  await nativeCancel.hover(); await page.mouse.move(0,0); await settle();
  const native = await state(nativeCancel);
  check(native.background === secondary.background && native.border === secondary.border && native.radius === secondary.radius,
    'Native and Base UI secondary controls disagree');
  await nativeCancel.click();

  // Preview layout must not override the Notice's error role.
  await page.locator('.equation').hover();
  await page.locator('.equation').getByRole('button', {name:'Edit', exact:true}).click();
  const preview = await state(page.getByTestId('equation-edit-preview'));
  await page.getByTestId('equation-latex').fill('\\frac{');
  const previewError = await state(page.getByTestId('equation-edit-preview-error'));
  check(previewError.color === invalid.border && previewError.border === invalid.border && previewError.background !== preview.background,
    'Equation preview layout hides the error role');
  await page.getByTestId('equation-cancel').click();

  await page.locator('.table [data-table-cell]').first().click();
  const tableActions = page.getByRole('button', {name:'Table actions', exact:true});
  await tableActions.click(); await page.mouse.move(0,0); await settle();
  const tableOpen = await state(tableActions);
  check(tableOpen.background === menuOpen.background && tableOpen.ring.includes(menuOpen.border),
    'Native table menu needs the shared persistent open face and boundary');
  await page.keyboard.press('Escape');

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
  return {navigation:results, ghostHover, menuOpen, pressed, field, contrasts};
}
