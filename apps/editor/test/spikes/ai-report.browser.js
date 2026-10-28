// Manual live-model measurement, separate from the stable CI scenario inventory.
async (page, { openFolderPicker, openPath, waitForActivePath, aiReportRound2 = false }) => {
  const check = (ok, text) => { if (!ok) throw new Error(text); };
  await page.setViewportSize({ width: 1440, height: 1000 });
  const origin = page.url().split('/').slice(0, 3).join('/');
  const start = await (await page.request.get(origin + '/api/document')).json();
  const root = start.allowedRoots[0];
  const sep = root.includes('\\') ? '\\' : '/';
  const output = root + sep + (aiReportRound2 ? 'round2-reports' : 'reports');
  const captures = root + sep + '..' + sep + (aiReportRound2 ? '..' + sep + 'round2' + sep : '') + 'captures' + sep;
  await openFolderPicker(page);
  const picker = page.getByRole('dialog', { name: 'Open folder', exact: true });
  await picker.getByRole('region', { name: 'Server shared folders', exact: true }).getByTitle(root, { exact: true }).click();
  await picker.getByTestId('folder-open').click();
  await picker.waitFor({ state: 'detached' });
  await page.getByTestId('sidebar').getByRole('treeitem', { name: 'technical-document.md', exact: true }).click();
  await waitForActivePath(page, root + sep + 'technical-document.md');
  if (!aiReportRound2) await page.screenshot({ path: captures + 'before-1440.png' });
  await page.getByTestId('ai-toggle').click();
  await page.getByRole('textbox', { name: '출력 폴더', exact: true }).fill(output);
  const requests = [
    '이 폴더의 문서를 바탕으로 요약 보고서를 만들어줘. 핵심 수치 표, 관련 수식 하나, 구조를 보여주는 Mermaid 그림 하나를 넣고 본문에서 상호참조해. 표와 그림에 캡션을 달고 합성 자료임을 명시해.',
    '이번에는 THD 기준 충족 여부 중심의 검증 요약 보고서를 새로 만들어줘. 두 부하점의 핵심 수치 표, 기준 초과량을 계산하는 수식 하나, 검증 판단 흐름 Mermaid 그림 하나와 캡션을 넣고 본문에서 각각 상호참조해.',
    '이번에는 제어 설계 검토자를 위한 짧은 새 보고서를 만들어줘. 220 V에서 전력별 전류를 비교하는 표, 전력과 전류의 관계 수식 하나, 전력 명령에서 플랜트까지의 Mermaid 그림 하나와 캡션을 넣고 본문에서 상호참조해. 실측 자료가 아닌 샘플임을 밝혀줘.',
  ];
  const runs = [];
  for (let index = 0; index < requests.length; index++) {
    const beforeReports = await page.getByRole('button', { name: '검증된 보고서 열기', exact: true }).count();
    await page.getByRole('textbox', { name: 'AI 요청', exact: true }).fill(requests[index]);
    await page.getByRole('button', { name: '보내기', exact: true }).click();
    // Only wait for the user's request to finish; no reload or polling to mask an incorrect state.
    await page.getByRole('button', { name: '중지', exact: true }).waitFor({ state: 'detached', timeout: 600000 });
    const hasReport = await page.getByRole('button', { name: '검증된 보고서 열기', exact: true }).count() > beforeReports;
    const report = hasReport ? { path: await page.getByTestId('current-file').getAttribute('title') } : null;
    const visualProblems = [];
    if (report) {
      await waitForActivePath(page, report.path);
      const editor = page.locator('[data-document-tab][data-active=true] .document-editor');
      try {
        check(await editor.locator('table').count() > 0, 'Report table rendered');
        await editor.getByTestId('mermaid-preview').getByRole('img').waitFor();
        check(await editor.getByTestId('mermaid-preview').getByRole('img').evaluate(image => image.complete && image.naturalWidth > 0), 'Mermaid image decoded');
      } catch (error) {
        if (!aiReportRound2) throw error;
        // A model content failure is a measurement finding; still execute exactly three requests.
        visualProblems.push(String(error));
      }
    }
    const logText = await page.getByTestId('ai-messages').innerText();
    if (!aiReportRound2 || !report || visualProblems.length) await page.screenshot({ path: captures + 'run-' + (index + 1) + '-1440.png', fullPage: true });
    await page.getByTestId('sidebar').getByRole('treeitem', { name: 'converter-spec.md', exact: true }).click();
    await waitForActivePath(page, root + sep + 'converter-spec.md');
    check(await page.getByTestId('ai-messages').innerText() === logText, 'Conversation survives document tab changes');
    await page.getByRole('button', { name: 'AI 패널 닫기', exact: true }).click();
    await page.getByTestId('ai-toggle').click();
    check(await page.getByTestId('ai-messages').innerText() === logText, 'Conversation survives panel remount');
    check(await page.getByRole('textbox', { name: '출력 폴더', exact: true }).inputValue() === output, 'Output folder survives panel remount');
    if (report) { await page.getByRole('button', { name: '검증된 보고서 열기', exact: true }).last().click(); await waitForActivePath(page, report.path); }
    runs.push({ request: requests[index], report, logText, visualProblems });
  }
  await page.getByRole('button', { name: 'Codex 상태', exact: true }).click();
  await page.getByTestId('ai-settings').waitFor();
  if (!aiReportRound2) await page.screenshot({ path: captures + 'settings-1440.png' });
  await page.getByTestId('settings-back').click();
  if (!aiReportRound2) await page.locator('[data-document-tab][data-active=true]').getByTestId('mermaid-preview').getByRole('img').waitFor();
  await page.screenshot({ path: captures + 'report-and-chat-1440.png', fullPage: true });
  return { root, output, runs, captures };
}
