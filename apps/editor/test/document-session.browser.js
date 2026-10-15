// Actual hook/editor integration. The shell's pending-operation refusal is tested by open-files
// and source-view-pending; this harness directly replaces the session to test late attribution.
async page => {
  const origin = page.url().split('/').slice(0, 3).join('/');
  const loaded = await (await page.request.get(`${origin}/api/document`)).json();
  const separator = loaded.path.includes('\\') ? '\\' : '/';
  const root = loaded.path.split(separator).slice(0, -4).join(separator);
  const pathA = [root, 'tmp', 'source-view', 'technical-document.md'].join(separator);
  const pathB = [root, 'tmp', 'source-view', 'writable.md'].join(separator);
  const fileB = await (await page.request.get(`${origin}/api/document?path=${encodeURIComponent(pathB)}`)).json();
  await page.evaluate(async () => {
    const {mountDocumentSessionHarness} = await import('/test/helpers/document-session-harness.ts');
    window.sessionHarness = mountDocumentSessionHarness();
  });
  const ready = path => page.waitForFunction(path => {
    const session = window.sessionHarness.current;
    return session?.status === 'Ready' && session.editorRef.current && (!path || session.openedPath === path);
  }, path);
  const snapshot = () => page.evaluate(() => {
    const session = window.sessionHarness.current;
    return {path: session.openedPath, status: session.status, error: session.error, view: session.view,
      source: session.sourceMarkdown, sourcePending: session.sourcePending,
      dirty: session.editorRef.current.hasUnsavedChanges(), document: session.editorRef.current.getDocument()};
  });
  const result = {};
  try {
    await ready();
    for (const operation of ['save', 'showSource']) {
      await page.evaluate(path => window.sessionHarness.current.load(path), pathA);
      await ready(pathA);
      let release, requested;
      const gate = new Promise(resolve => { release = resolve; });
      const started = new Promise(resolve => { requested = resolve; });
      const endpoint = operation === 'save' ? '**/api/document' : '**/api/document-source';
      const requests = [];
      await page.route(endpoint, async route => {
        if (route.request().method() !== 'POST') return route.continue();
        const body = route.request().postDataJSON();
        requests.push(body);
        if (body.path === pathA) { requested(); await gate; }
        await route.fulfill({json: operation === 'save' ? {revision:'late-a-revision'} : {markdown:'Source from A'}});
      });
      try {
        await page.evaluate(operation => {
          const {current: session, host} = window.sessionHarness;
          const handle = session.editorRef.current;
          const finishSave = handle.finishSave.bind(handle);
          window.oldSession = {editor: host.querySelector('.document-editor').editor, finishes: 0};
          handle.finishSave = (...args) => { window.oldSession.finishes++; return finishSave(...args); };
          window.pendingSessionOperation = session[operation]();
        }, operation);
        await started;
        await page.evaluate(path => window.sessionHarness.current.load(path), pathB);
        await ready(pathB);
        await page.evaluate(() => window.sessionHarness.host.querySelector('.document-editor').editor.commands.insertContentAt(1, 'B edit. '));
        const before = await snapshot();
        release();
        await page.evaluate(() => window.pendingSessionOperation);
        const after = await snapshot();
        const old = await page.evaluate(() => ({destroyed: window.oldSession.editor.isDestroyed, finishes: window.oldSession.finishes}));
        if (!before.dirty || JSON.stringify(before) !== JSON.stringify(after) || !old.destroyed || old.finishes) {
          throw new Error(`${operation} changed a replaced session: ${JSON.stringify({before, after, old})}`);
        }
        result[`${operation}IgnoredAfterReplacement`] = true;
      } finally {
        release();
        await page.unroute(endpoint);
      }
      // Inspect B's next real Save payload too: A must not overwrite B's revision or base.
      let savedB;
      await page.route('**/api/document', async route => {
        if (route.request().method() !== 'POST') return route.continue();
        savedB = route.request().postDataJSON();
        await route.fulfill({json:{revision:'b-saved'}});
      });
      try {
        await page.evaluate(() => window.sessionHarness.current.save());
        if (requests.length !== 1 || requests[0].path !== pathA || savedB?.path !== pathB ||
            savedB.revision !== fileB.revision || savedB.base.source !== fileB.source || savedB.base.savedEdits !== undefined) {
          throw new Error(`${operation} leaked A's Save baseline into B: ${JSON.stringify(savedB)}`);
        }
      } finally {
        await page.unroute('**/api/document');
      }
    }
  } finally {
    await page.evaluate(() => window.sessionHarness.destroy());
  }
  return result;
}
