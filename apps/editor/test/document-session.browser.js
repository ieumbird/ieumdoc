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
    window.sessionHarness = await mountDocumentSessionHarness();
  });
  const ready = path => page.waitForFunction(path => {
    const session = window.sessionHarness.current;
    return session?.status === 'ready' && session.editorRef.current && (!path || session.openedPath === path);
  }, path);
  const snapshot = () => page.evaluate(() => {
    const session = window.sessionHarness.current;
    return {path: session.openedPath, status: session.status, error: session.error, view: session.view,
      source: session.sourceMarkdown, busy: session.busy,
      dirty: session.editorRef.current.hasUnsavedChanges(), document: session.editorRef.current.getDocument()};
  });
  const result = {};
  try {
    await ready();
    result.sharedCurrentSerialization = await page.evaluate(() => {
      const engine = window.sessionHarness.host.querySelector('.document-editor').editor;
      const stringify = JSON.stringify;
      const marker = 'SharedAppliedProjection319';
      let currentSerializations = 0;
      JSON.stringify = function(value, ...args) {
        const text = stringify.call(this, value, ...args);
        if (value?.type === 'doc' && text.includes(marker)) currentSerializations++;
        return text;
      };
      try { engine.commands.insertContentAt(1, marker); } finally { JSON.stringify = stringify; }
      // Explicit performance contract: dirty and applied-change notification share this value.
      if (currentSerializations !== 1) throw new Error(`One applied update serialized current document ${currentSerializations} times`);
      return true;
    });
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
        if (before.busy || after.busy || !before.dirty || JSON.stringify(before) !== JSON.stringify(after) || !old.destroyed || old.finishes) {
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
  // Recovery preparation uses the real hook and DocumentEditor, not a detached JSON round trip.
  const mount = snapshot => page.evaluate(async snapshot => {
    const { mountDocumentSessionHarness } = await import('/test/helpers/document-session-harness.ts');
    window.sessionHarness = await mountDocumentSessionHarness(snapshot);
  }, snapshot);
  const capture = () => page.evaluate(() => window.sessionHarness.current.getSnapshot());
  const restore = async snapshot => {
    await page.evaluate(() => window.sessionHarness.destroy());
    await mount(snapshot);
    await ready(snapshot.file.path);
  };
  await mount();
  try {
    await ready();
    await page.evaluate(path => window.sessionHarness.current.load(path), pathB);
    await ready(pathB);
    await page.evaluate(async () => {
      const { deleteBlock, insertFigureAfter } = await import('/src/block-commands.ts');
      const editor = window.sessionHarness.host.querySelector('.document-editor').editor;
      editor.view.dispatch(deleteBlock(editor.state, 0));
      editor.view.dispatch(insertFigureAfter(editor.state, 0));
    });
    const first = await capture();
    await restore(first);
    const afterFirst = await capture();
    if (JSON.stringify(first) !== JSON.stringify(afterFirst) || !(await snapshot()).dirty ||
        !afterFirst.editor.editorDocument.attrs.deletedPaths.length ||
        !afterFirst.editor.editorDocument.content.some(node => node.type === 'figure')) {
      throw new Error('Restored deletion/pending Figure or dirty baseline was lost');
    }
    if (!await page.evaluate(() => window.sessionHarness.current.save())) throw new Error('Restored deletion Save failed');
    const acknowledged = await capture();
    if ((await snapshot()).dirty || !acknowledged.savedEdits) throw new Error('Save did not acknowledge restored snapshot');
    await page.evaluate(() => window.sessionHarness.host.querySelector('.document-editor').editor.commands.insertContentAt(1, 'After prior save. '));
    const checkpoint = await capture();
    await restore(checkpoint);
    if (JSON.stringify(checkpoint) !== JSON.stringify(await capture()) || !(await snapshot()).dirty) {
      throw new Error('Prior savedDocument/revision/replay baseline was not restored');
    }
    let request, releaseSave, saveStarted, responseRevision;
    const saveGate = new Promise(resolve => { releaseSave = resolve; });
    const startedSave = new Promise(resolve => { saveStarted = resolve; });
    await page.route('**/api/document', async route => {
      if (route.request().method() !== 'POST') return route.continue();
      request = route.request().postDataJSON();
      const response = await route.fetch();
      responseRevision = (await response.json()).revision;
      saveStarted();
      await saveGate;
      return route.fulfill({ response });
    });
    try {
      await page.evaluate(() => {
        const session = window.sessionHarness.current;
        window.recoverySave = session.save().then(ok => ({ ok, snapshot: session.getSnapshot() }));
      });
      await startedSave;
      await page.evaluate(() => window.sessionHarness.host.querySelector('.document-editor').editor.commands.insertContentAt(1, 'During Save. '));
      const during = await capture();
      if (during.file.revision !== checkpoint.file.revision ||
          JSON.stringify(during.editor.savedDocument) !== JSON.stringify(checkpoint.editor.savedDocument)) {
        throw new Error('Pending Save advanced the recovery acknowledgement');
      }
      releaseSave();
      const completed = await page.evaluate(() => window.recoverySave);
      if (!completed.ok || completed.snapshot.file.revision !== responseRevision ||
          JSON.stringify(completed.snapshot.editor.savedDocument) !== JSON.stringify(checkpoint.editor.editorDocument) ||
          JSON.stringify(completed.snapshot.editor.editorDocument) !== JSON.stringify(during.editor.editorDocument) || !(await snapshot()).dirty) {
        throw new Error('Save completion snapshot mixed revisions or acknowledged newer input');
      }
    } finally { releaseSave(); await page.unroute('**/api/document'); }
    if (request.revision !== checkpoint.file.revision || request.base.source !== checkpoint.file.source ||
        JSON.stringify(request.base.savedEdits) !== JSON.stringify(checkpoint.savedEdits)) throw new Error('Replay checkpoint changed');
    if (!await page.evaluate(() => window.sessionHarness.current.save())) throw new Error('Newer restored edits failed Save');
    await page.evaluate(() => window.sessionHarness.current.showSource());
    const markdown = (await snapshot()).source;
    const disk = await (await page.request.get(`${origin}/api/document?path=${encodeURIComponent(pathB)}`)).json();
    if (disk.source !== markdown || !markdown.includes('After prior save. ') || markdown.includes('# Writable')) {
      throw new Error('Restored Save did not persist exactly the Source preview');
    }
    const clean = await capture();
    await restore(clean);
    if ((await snapshot()).dirty) throw new Error('A restored acknowledged document is dirty');
    await page.evaluate(() => window.sessionHarness.current.reloadFromDisk());
    await ready(pathB);
    if (!(await snapshot()).document.content.some(node => node.type === 'figure') || (await snapshot()).dirty) {
      throw new Error('Save/Reload lost the pending Figure or clean state');
    }
    result.recoverySaveReplay = true;

    // Reserve all allocation namespaces, including locators found only in savedDocument.
    const locators = await capture();
    const paragraph = (sourcePath, text) => ({ type: 'paragraph', attrs: { sourcePath }, content: [{ type: 'text', text }] });
    locators.editor.savedDocument.content.push(paragraph('new:910000', 'Saved only'), paragraph('new:split:910000', 'Saved split'));
    locators.editor.editorDocument.content.push(paragraph('new:engine:910000', 'Current engine'));
    await restore(locators);
    const allocated = await page.evaluate(async () => {
      const { insertFigureAfter } = await import('/src/block-commands.ts');
      const editor = window.sessionHarness.host.querySelector('.document-editor').editor;
      editor.view.dispatch(insertFigureAfter(editor.state, editor.state.doc.childCount - 1));
      const command = editor.state.doc.lastChild.attrs.sourcePath;
      editor.commands.insertContentAt(editor.state.doc.content.size, { type: 'paragraph', content: [{ type: 'text', text: 'Engine inserted' }] });
      const engine = editor.state.doc.lastChild.attrs.sourcePath;
      editor.commands.setTextSelection(editor.state.doc.content.size - 1);
      editor.view.focus();
      return { command, engine };
    });
    await page.keyboard.press('Enter');
    allocated.split = await page.evaluate(() => window.sessionHarness.host.querySelector('.document-editor').editor.state.doc.lastChild.attrs.sourcePath);
    for (const [kind, path] of Object.entries(allocated)) {
      const prefix = kind === 'command' ? 'new:' : `new:${kind}:`;
      if (!path.startsWith(prefix) || Number(path.split(':').at(-1)) <= 910000) throw new Error(`Locator collision: ${JSON.stringify(allocated)}`);
    }
    result.recoveryLocatorReservation = true;

    // Empty headings must reach the real Editor unchanged and remain refused by Save.
    const invalid = clean;
    invalid.editor.editorDocument.content.push({ type: 'heading', attrs: { sourcePath: 'new:920000', level: 2 } });
    await restore(invalid);
    const beforeRefusal = await capture();
    if (!(await snapshot()).dirty || !beforeRefusal.editor.editorDocument.content.some(node => node.type === 'heading' && !node.content)) {
      throw new Error('Unsaveable applied heading was lost at initialization');
    }
    if (await page.evaluate(() => window.sessionHarness.current.save())) throw new Error('Unsaveable restored heading was saved');
    if (!/empty heading/.test((await snapshot()).error) || JSON.stringify(beforeRefusal) !== JSON.stringify(await capture())) {
      throw new Error('Failed Save altered the recovered snapshots');
    }
    result.recoveryUnsaveableContent = true;
  } finally {
    await page.evaluate(() => window.sessionHarness.destroy());
  }
  return result;
}
