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
    // Upgrade only the storage protocol; preserve records and reject old unbounded-ticket clients.
    await new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(RECOVERY_DB); request.onsuccess = resolve; request.onerror = () => reject(request.error);
    });
    const oldDb = await new Promise((resolve, reject) => {
      const request = indexedDB.open(RECOVERY_DB, 1);
      request.onupgradeneeded = () => { request.result.createObjectStore('records', {keyPath:'id'}); request.result.createObjectStore('barriers'); };
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    await new Promise(resolve => {
      const tx = oldDb.transaction(['records','barriers'], 'readwrite');
      tx.objectStore('records').put({id:'existing',version:1,path:'/test.md',recordedAt:Date.now(),recoveryText:'preserved',snapshot:snapshot('preserved')});
      tx.objectStore('barriers').put(3, ['session','old-session']); tx.oncomplete = resolve;
    });
    oldDb.close();
    check((await list())[0]?.recoveryText === 'preserved', 'Storage upgrade changed an existing recovery record');
    const oldRefused = await new Promise(resolve => { const request=indexedDB.open(RECOVERY_DB,1); request.onerror=()=>resolve(request.error.name==='VersionError'); request.onsuccess=()=>{request.result.close();resolve(false);}; });
    check(oldRefused, 'Old unbounded ticket protocol can still open the database');
    const fallback = snapshot('Applied text');
    fallback.editor.editorDocument.content[0].marks = [{type:'link',attrs:{href:'https://example.com/kept'}}];
    fallback.editor.editorDocument.content[0].attrs = {caption:[{kind:'text',text:'Caption retained'}]};
    check(recoveryText(fallback).includes('Caption retained') && recoveryText(fallback).includes('https://example.com/kept'), 'Plaintext fallback omitted applied caption or link properties');
    await store.delete();
    const originalTransaction = IDBDatabase.prototype.transaction;
    const ticketTransactions = [];
    IDBDatabase.prototype.transaction = function(names, mode, ...args) {
      ticketTransactions.push({names:Array.from(typeof names === 'string' ? [names] : names),mode});
      return originalTransaction.call(this,names,mode,...args);
    };
    try { await store.ticket('read-only-probe'); } finally { IDBDatabase.prototype.transaction = originalTransaction; }
    check(ticketTransactions.length === 1 && ticketTransactions[0].mode === 'readonly' && ticketTransactions[0].names.join() === 'barriers', 'Ticket acquisition locks records or uses a write transaction');
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

    recorder.edit();
    const cleared = store.delete();
    live = snapshot('edit immediately after clear request'); recorder.edit();
    await cleared; await wait();
    check((await list())[0]?.recoveryText === 'edit immediately after clear request', 'Latest edit reused its pre-clear ticket or lost the next checkpoint');

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

    // Wall-clock expiry, with real IDB transactions. No wall-clock performance threshold.
    const realNow = Date.now;
    let now = realNow();
    Date.now = () => now;
    const lifetime = 10 * 86400000;
    const metadata = async () => {
      const db = await new Promise(resolve => { const request=indexedDB.open(RECOVERY_DB); request.onsuccess=()=>resolve(request.result); });
      const keys = await new Promise(resolve => { const request=db.transaction('barriers').objectStore('barriers').getAllKeys();request.onsuccess=()=>resolve(request.result); });
      db.close(); return keys.filter(Array.isArray);
    };
    try {
      await store.delete();
      const ancient = await store.ticket('collected');
      for (let i=0;i<40;i++) await createRecoveryRecorder('never-edited-'+i,()=>null,()=>{}).discard();
      check(!(await metadata()).length, 'Never-edited session cleanup leaves metadata');
      for (let i=0;i<40;i++) { await record('closed-'+i); await store.delete('closed-'+i); }
      await store.delete('collected');
      now += lifetime - 1;
      const afterDeletion = await store.ticket('collected');
      const unrelated = await store.ticket('unrelated-live');
      now++;
      await list();
      check(!(await metadata()).length, 'Deleted session metadata survives its retention boundary');
      const captureRecord = id => () => ({id,version:1,path:'/test.md',recordedAt:now,recoveryText:id,snapshot:snapshot(id)});
      check(!await store.write('collected',ancient,captureRecord('collected')), 'Ancient ticket resurrected a record after metadata GC');
      // Test rollback while metadata is absent, so only the persisted expiry watermark protects it.
      now -= lifetime;
      check(!await store.write('collected',ancient,captureRecord('collected')), 'Clock rollback revived a collected ticket');
      now += lifetime;
      check(await store.write('collected',afterDeletion,captureRecord('collected')), 'GC invalidated a still-valid post-deletion edit');
      check(await store.write('unrelated-live',unrelated,captureRecord('unrelated-live')), 'GC invalidated another session pending edit');
      await store.delete('collected');
      check(!await store.write('collected',afterDeletion,captureRecord('collected')), 'Reused generation after GC matched an old ticket');
      const resumed = await store.ticket('collected');
      check(await store.write('collected',resumed,captureRecord('collected')), 'Next edit cannot resume after GC and another deletion');
      now += lifetime;
      await list(); now += lifetime; await list();
      check(!(await metadata()).length, 'Expired records leave permanent metadata');
    } finally { Date.now = realNow; await store.delete(); }

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
      acknowledgedRevision:true, sessionIsolation:true, expiration:true, staleRestoreRefused:true, quotaFailure:true,
      readonlyTickets:true, protocolUpgrade:true, boundedMetadata:true, staleTicketAfterGC:true, postGCPendingEdit:true };
  } finally { recorder.cancel(); await store.delete(); }
})
