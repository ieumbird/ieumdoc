// Actual IndexedDB transactions and recorder scheduling; no in-memory database substitute.
async page => page.evaluate(async () => {
  const { recoveryStorage: store, createRecoveryRecorder, recoveryText, RECOVERY_DB } = await import('/src/recovery-storage.ts');
  const check = (ok, why) => { if (!ok) throw new Error(why); };
  const wait = () => new Promise(resolve => setTimeout(resolve, 650));
  const snapshot = text => ({ file: { path: '/test.md', revision: 'a'.repeat(64), source: 'opening' },
    editor: { editorDocument: { type: 'doc', content: [{type:'paragraph',content:[{type:'text',text}]}] }, savedDocument: {type:'doc'} } });
  let live = snapshot('first');
  let errors = [];
  const recorder = createRecoveryRecorder('a', () => live, error => errors.push(String(error)));
  const list = () => store.list();
  const record = async (id, time = Date.now()) => {
    const token = await store.ticket(id);
    await store.write(id, token, () => ({id, version:1, path:'/test.md',recordedAt:time,recoveryText:id,snapshot: snapshot(id)}));
  };
  try {
    const fallback = snapshot('Applied text');
    fallback.editor.editorDocument.content[0].marks = [{type:'link',attrs:{href:'https://example.com/kept'}}];
    fallback.editor.editorDocument.content[0].attrs = {caption:[{kind:'text',text:'Caption retained'}]};
    check(recoveryText(fallback).includes('Caption retained') && recoveryText(fallback).includes('https://example.com/kept'), 'Plaintext fallback omitted applied caption or link properties');
    await store.delete();
    recorder.edit();
    live = snapshot('latest at write turn');
    await wait();
    check((await list())[0]?.recoveryText === 'latest at write turn', 'Recorder captured an old scheduled snapshot');
    live = snapshot('not yet recorded'); recorder.edit(); recorder.cancel(); await wait();
    check((await list())[0]?.recoveryText === 'latest at write turn', 'Ordinary disposal removed the last successful record');

    recorder.edit(); live = null;
    await wait();
    check(!(await list()).length, 'Applied dirty was not rechecked at the write turn');

    live = snapshot('pending'); recorder.edit();
    recorder.discard(); await wait();
    check(!(await list()).length, 'A queued write resurrected a discarded record');

    recorder.edit();
    await store.delete(); // simulates clear from another window; no local cancellation callback
    recorder.checkpoint(); await wait();
    check(!(await list()).length, 'Clear all failed to invalidate pending writes/checkpoints');
    recorder.checkpoint(); await wait();
    check(!(await list()).length, 'A Save checkpoint resumed recording without an applied edit');
    live = snapshot('next edit'); recorder.edit(); await wait();
    check((await list())[0]?.recoveryText === 'next edit', 'Next applied edit did not resume recording');

    // IDB writer held behind another transaction: capture must happen only when its turn starts.
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(RECOVERY_DB); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    let release = false;
    const blocking = db.transaction(['records','barriers'], 'readwrite');
    const barriers = blocking.objectStore('barriers');
    const spin = () => { const request = barriers.get('all'); request.onsuccess = () => { if (!release) spin(); }; }; spin();
    const tokenPromise = store.ticket('a');
    const writing = tokenPromise.then(token => store.write('a', token, () => ({id:'a',version:1,path:'/test.md',recordedAt:Date.now(),recoveryText:live.file.revision,snapshot:live})));
    live = { ...snapshot('newer applied edits after Save'), file: { ...snapshot('').file, revision:'b'.repeat(64) } };
    release = true; await writing; db.close();
    check((await list())[0].snapshot.file.revision === 'b'.repeat(64), 'Write did not use the latest acknowledged revision');

    await record('other-window'); await store.delete('a');
    check((await list()).map(r => r.id).join() === 'other-window', 'One session deleted another session record');
    // Even malformed/future record identifiers cannot turn one Delete into Clear all.
    const otherTicket = await store.ticket('other-window');
    await record(''); await record('all');
    await store.delete(''); await store.delete('all');
    let retainedTicket = false;
    await store.write('other-window',otherTicket,() => { retainedTicket = true; return undefined; });
    check(retainedTicket && (await list()).map(r => r.id).join() === 'other-window', 'Malformed record deletion cleared or invalidated other sessions');
    await record('expired', Date.now() - 10*86400000);
    const expiredTicket = await store.ticket('expired');
    await record('fresh', Date.now() - 10*86400000 + 60000);
    check(!(await list()).some(r => r.id === 'expired') && (await list()).some(r => r.id === 'fresh'), '10-day boundary incorrect');
    let expiredCaptured = false;
    await store.write('expired',expiredTicket,() => { expiredCaptured = true; return undefined; });
    check(!expiredCaptured, 'An expired session retained permission to resurrect its old scheduled record');

    // A stale restore UI must not resurrect a record deleted or updated elsewhere.
    const stale = (await list())[0]; await store.delete(stale.id);
    let refused = false; try { await store.restore(stale, 'restored'); } catch { refused = true; }
    check(refused && !(await list()).some(r => r.id === 'restored'), 'Stale restore resurrected deleted work');

    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(...args) {
      if (this.name === 'records') throw new DOMException('Test quota exhausted', 'QuotaExceededError');
      return original.apply(this,args);
    };
    try { recorder.edit(); await wait(); } finally { IDBObjectStore.prototype.put = original; }
    check(errors.some(error => error.includes('quota')), 'Quota failure was swallowed');
    errors = []; recorder.edit(); await wait();
    check(!errors.length && (await list()).some(r => r.id === 'a'), 'Recording did not recover on a later edit');
    const originalDelete = IDBObjectStore.prototype.delete;
    IDBObjectStore.prototype.delete = function(...args) {
      if (this.name === 'records') throw new DOMException('Test deletion denied', 'UnknownError');
      return originalDelete.apply(this,args);
    };
    try { check(await recorder.discard() === false, 'Deletion failure was reported as success'); }
    finally { IDBObjectStore.prototype.delete = originalDelete; }
    check((await list()).some(r => r.id === 'a') && errors.some(error => error.includes('deletion denied')), 'Failed deletion hid the retained record');
    return { liveCapture:true, dirtyRecheck:true, deleteBarrier:true, clearBarrier:true, nextEditResumes:true,
      acknowledgedRevision:true, sessionIsolation:true, expiration:true, staleRestoreRefused:true, quotaFailure:true };
  } finally { recorder.cancel(); await store.delete(); }
})
