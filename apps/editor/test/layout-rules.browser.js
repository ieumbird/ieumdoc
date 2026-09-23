// Run with pnpm exec playwright-cli run-code --filename=apps/editor/test/layout-rules.browser.js.
// Measures the layout contract at the required viewport widths without changing document content.
async page => {
  await page.unrouteAll();
  const origin = page.url().split('/').slice(0, 3).join('/');
  const loaded = await (await page.request.get(`${origin}/api/document`)).json();
  const sample = clone(loaded);
  const longPath = 'C:\\Users\\example\\Documents\\very-long-technical-document-name-한글-english-guide.md';
  const paragraph = sample.document.blocks.find(block => block.path[0] === 8);
  paragraph.text = '한글 본문 English body for layout verification.';
  paragraph.content = [{kind:'text', text:paragraph.text}];
  sample.path = longPath;
  await page.route('**/api/document**', async route => {
    if (route.request().method() === 'GET') return route.fulfill({json:sample});
    return route.continue();
  });
  const results = [];
  try {
    for (const width of [1440, 1024, 768]) {
      await page.setViewportSize({width, height:900});
      await page.reload();
      await page.getByText('Ready', {exact:true}).waitFor();
      await page.getByRole('article').getByText('한글 본문 English body for layout verification.', {exact:true}).waitFor();
      await page.locator('[data-block="figure"] img').click();
      await page.keyboard.press('Delete');
      await page.getByTestId('message-area').waitFor();

      results.push({width, state:'expanded', ...(await measure(page))});
      await page.getByRole('button', {name:'Collapse sidebar', exact:true}).click();
      results.push({width, state:'collapsed', ...(await measure(page))});
    }
    return results;
  } finally {
    await page.unroute('**/api/document**');
  }

  async function measure(page) {
    const paragraph = page.locator('.document-editor > .paragraph').first();
    const before = await paragraph.evaluate(node => node.getBoundingClientRect().left);
    await paragraph.hover();
    const after = await paragraph.evaluate(node => node.getBoundingClientRect().left);
    const result = await page.evaluate(() => {
      const rect = selector => document.querySelector(selector)?.getBoundingClientRect();
      const sidebarHeader = rect('.sidebar-header');
      const topBar = rect('.top-bar');
      const appMain = rect('.app-main');
      const column = rect('.document-column');
      const message = rect('.message-area');
      const blocks = [...document.querySelectorAll('.document-editor > .heading, .document-editor > .paragraph, .document-editor > .table-block, .document-editor > .figure, .document-editor > .equation, .document-editor > .admonition, .document-editor > .unsupported')].map(node => node.getBoundingClientRect());
      const sidebarIcons = [...document.querySelectorAll('.sidebar-actions svg, .sidebar-document-icon')].map(node => node.getBoundingClientRect().left);
      const sidebarLabels = [...document.querySelectorAll('.sidebar-actions button, .sidebar-document-name')].map(node => {
        const range = document.createRange();
        const textNode = [...node.childNodes].find(child => child.nodeType === Node.TEXT_NODE && child.textContent?.trim());
        if (textNode) range.selectNode(textNode);
        else range.selectNodeContents(node);
        return range.getBoundingClientRect().left;
      });
      const standardControl = rect('.top-bar [data-testid="save"]');
      const compactControls = [...document.querySelectorAll('.sidebar-actions button, .equation button')].map(node => node.getBoundingClientRect().height);
      const overflow = [...document.querySelectorAll('.app-shell, .sidebar, .app-main, .top-bar, .message-area, .document-column, .document, .document-editor, .document-editor > *')]
        .some(node => node.getBoundingClientRect().right > window.innerWidth + 1 || node.getBoundingClientRect().left < -1);
      const blockLefts = blocks.map(block => block.left);
      return {
        headerHeightDelta: Math.abs((sidebarHeader?.height ?? 0) - (topBar?.height ?? 0)),
        insetDelta: message ? Math.abs(parseFloat(getComputedStyle(document.querySelector('.top-bar')).paddingLeft) - parseFloat(getComputedStyle(document.querySelector('.message-area')).paddingLeft)) : 0,
        documentCenterDelta: appMain && column ? Math.abs((appMain.left + appMain.width / 2) - (column.left + column.width / 2)) : 0,
        blockStartDelta: blockLefts.length ? Math.max(...blockLefts) - Math.min(...blockLefts) : 0,
        sidebarIconDelta: sidebarIcons.length >= 3 ? Math.abs(sidebarIcons[0] - sidebarIcons[2]) : 0,
        sidebarLabelDelta: sidebarLabels.length >= 3 ? Math.abs(sidebarLabels[0] - sidebarLabels[2]) : 0,
        standardControlHeight: standardControl?.height ?? 0,
        longPathTitle: document.querySelector('[data-testid="current-file"]')?.getAttribute('title') ?? '',
        mixedLanguageBody: document.querySelector('.document-editor')?.textContent?.includes('한글 본문 English body for layout verification.') ?? false,
        compactControlHeights: compactControls,
        horizontalOverflow: overflow,
      };
    });
    if (result.headerHeightDelta > 1 || result.insetDelta > 1 || result.documentCenterDelta > 1 ||
        result.blockStartDelta > 1 || result.sidebarIconDelta > 1 || result.sidebarLabelDelta > 1 ||
        Math.abs(result.standardControlHeight - 32) > 1 || result.compactControlHeights.some(height => Math.abs(height - 28) > 1) ||
        !result.longPathTitle.includes('very-long-technical-document-name') || !result.mixedLanguageBody ||
        Math.abs(before - after) > 1 || result.horizontalOverflow) {
      throw new Error(`Layout rule failed: ${JSON.stringify(result)}`);
    }
    return result;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }
}
