// Manual spike: exactly two live Luna requests, UI flow only, no report-quality scoring.
async (page, { expect, openFolderPicker, waitForActivePath }) => {
  const check = (ok, message) => { if (!ok) throw new Error(message); };
  await page.setViewportSize({ width: 1440, height: 1000 });
  const origin = page.url().split('/').slice(0, 3).join('/');
  const start = await (await page.request.get(origin + '/api/document')).json();
  const root = start.allowedRoots[0];
  const sep = root.includes('\\') ? '\\' : '/';
  const output = root + sep + 'round3-reports';
  const captures = root + sep + '..' + sep + '..' + sep + 'round3' + sep + 'captures' + sep;
  await openFolderPicker(page);
  const picker = page.getByRole('dialog', { name: 'Open folder', exact: true });
  await picker.getByRole('region', { name: 'Server shared folders', exact: true }).getByTitle(root, { exact: true }).click();
  await picker.getByTestId('folder-open').click();
  await picker.waitFor({ state: 'detached' });
  const sidebar = page.getByTestId('sidebar');
  await sidebar.getByRole('treeitem', { name: 'technical-document.md', exact: true }).click();
  await waitForActivePath(page, root + sep + 'technical-document.md');
  const entry = page.getByTestId('ai-toggle');
  const chatTab = page.getByRole('tab', { name: 'AI chat', exact: true });
  const openChat = async () => { await entry.click(); await page.getByTestId('ai-chat').waitFor(); };
  await openChat();
  await entry.click();
  check(await chatTab.count() === 1, 'Repeated entry reuses the single chat tab');
  check(await chatTab.evaluate(element => element === document.activeElement), 'Entry focuses the chat tab');
  const assertChatActions = async () => {
    check(!await page.getByTestId('save').isVisible(), 'Save is hidden on chat');
    check(!await page.getByTestId('view-source').isVisible(), 'Source is hidden on chat');
    check(!await page.getByRole('button', { name: 'File actions', exact: true }).isVisible(), 'File actions are hidden on chat');
    check(await page.locator('[data-document-tab][data-active=true]').count() === 0, 'Chat owns no active document editor');
  };
  await assertChatActions();
  // Shortcuts cannot save the inactive document while chat is active.
  let documentWrites = 0;
  const onRequest = request => { if (request.url().split('?')[0] === origin + '/api/document' && request.method() === 'POST') documentWrites++; };
  page.on('request', onRequest);
  await page.keyboard.press('Control+s');
  await page.getByRole('textbox', { name: '출력 폴더', exact: true }).fill(output);
  const requests = [
    '참고 폴더의 converter-spec.md를 읽고 정격 전력과 전압을 정리한 짧은 새 요약 보고서를 만들어줘. 합성 샘플임을 밝혀줘. 표 하나와 설명 한 문단이면 충분해.',
    '이번에는 test-results.md를 바탕으로 THD 기준과 두 부하점 결과를 정리한 짧은 새 보고서를 만들어줘. 합성 샘플임을 밝혀줘. 표 하나와 결론 한 문단이면 충분해.',
  ];
  const runs = [];
  for (let index = 0; index < requests.length; index++) {
    const beforeLog = await page.getByTestId('ai-messages').innerText();
    await page.getByRole('textbox', { name: 'AI 요청', exact: true }).fill(requests[index]);
    await page.getByRole('button', { name: '보내기', exact: true }).click();
    await page.locator('[data-testid=ai-toggle][aria-busy=true]').waitFor();
    if (index === 0) {
      // Closing a running tab only hides it. Reopen retains the request and scope.
      await page.getByRole('button', { name: 'Close AI chat', exact: true }).click();
      check(await chatTab.count() === 0, 'Chat closes while inference continues');
      await openChat();
      check((await page.getByTestId('ai-messages').innerText()).includes(requests[index]), 'Running request survives chat closure');
      await page.getByRole('tab', { name: 'technical-document.md', exact: true }).click();
      await openChat();
      check(await page.getByRole('textbox', { name: '출력 폴더', exact: true }).inputValue() === output, 'Scope survives tab changes');
    }
    // The always-mounted entry signals completion, even when the report activates another tab.
    await page.locator('[data-testid=ai-toggle][aria-busy=false]').waitFor({ timeout: 600000 });
    const report = await page.getByTestId('current-file').getAttribute('title');
    check(await chatTab.count() === 1, 'Chat remains alongside the generated report');
    const reportOpened = !!report && report.includes('round3-reports');
    if (reportOpened) {
      check(await page.getByTestId('save').isVisible(), 'Document actions return on the report');
      check(await page.locator('[data-document-tab][data-active=true]').count() === 1, 'A normal document editor owns the report');
    }
    await openChat();
    const log = await page.getByTestId('ai-messages').innerText();
    if (index > 0) check(log.startsWith(beforeLog), 'Conversation history remains continuous');
    const hostPassed = log.includes('검증 통과') && reportOpened;
    await assertChatActions();
    await page.getByRole('textbox', { name: 'AI 요청', exact: true }).fill('다음 요청 초안');
    await page.getByRole('button', { name: 'Close AI chat', exact: true }).click();
    await openChat();
    check(await page.getByTestId('ai-messages').innerText() === log, 'Completed conversation survives closing and reopening');
    check(await page.getByRole('textbox', { name: 'AI 요청', exact: true }).inputValue() === '다음 요청 초안', 'Draft survives closing and reopening');
    check(await page.getByRole('textbox', { name: '출력 폴더', exact: true }).inputValue() === output, 'Output survives closing and reopening');
    await page.getByRole('textbox', { name: 'AI 요청', exact: true }).fill('');
    runs.push({ request: requests[index], report, hostPassed, log });
  }
  check(documentWrites === 0, 'Chat actions never call the Editor save endpoint');
  page.off('request', onRequest);
  await page.screenshot({ path: captures + 'chat-expanded-1440.png' });
  await sidebar.getByRole('button', { name: 'Collapse sidebar', exact: true }).click();
  check(await entry.isVisible(), 'AI entry stays visible on the collapsed rail');
  await entry.click();
  check(await chatTab.count() === 1, 'Rail entry also reuses the same tab');
  await page.screenshot({ path: captures + 'chat-rail-1440.png' });
  if (runs[1].hostPassed) {
    await page.getByRole('button', { name: '검증된 보고서 열기', exact: true }).last().click();
    await waitForActivePath(page, runs[1].report);
    await page.screenshot({ path: captures + 'report-and-chat-tabs-1440.png' });
  }
  // Use the existing combined tab-row keyboard contract, including special tabs.
  await openChat();
  await chatTab.press('ArrowRight');
  check(await page.getByRole('tablist', { name: 'Documents', exact: true }).getByRole('tab', { selected: true }).getAttribute('id') !== 'tab-ai-chat', 'Arrow navigation enters the adjacent document');
  await page.getByRole('tablist', { name: 'Documents', exact: true }).getByRole('tab', { selected: true }).press('Home');
  check(await chatTab.getAttribute('aria-selected') === 'true', 'Home returns to the chat tab');
  // The AI tab is never serialized as an ordinary file or recovery record.
  const stored = await page.evaluate(() => JSON.stringify(localStorage));
  check(!stored.includes('ai-chat'), 'Special tab is excluded from file restoration');
  return { root, output, runs, captures, documentWrites, uiFlow: 'passed' };
}
