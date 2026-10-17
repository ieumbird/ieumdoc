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
      const request = indexedDB.open(RECOVERY_DB, 2);
      request.onupgradeneeded = () => { request.result.createObjectStore('records', {keyPath:'id'}); request.result.createObjectStore('barriers'); };
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    await new Promise(resolve => {
      const tx = oldDb.transaction(['records','barriers'], 'readwrite');
      tx.objectStore('records').put({id:'existing',version:1,path:'/test.md',recordedAt:Date.now(),recoveryText:'preserved',snapshot:snapshot('preserved')});
      tx.objectStore('barriers').put(3, ['session','old-session']); tx.oncomplete = resolve;
    });
    let oldClosed = false; oldDb.onversionchange = () => { oldClosed = true; oldDb.close(); };
    check((await list())[0]?.recoveryText === 'preserved', 'Storage upgrade changed an existing recovery record');
    const oldRefused = await new Promise(resolve => { const request=indexedDB.open(RECOVERY_DB,2); request.onerror=()=>resolve(request.error.name==='VersionError'); request.onsuccess=()=>{request.result.close();resolve(false);}; });
    check(oldRefused && oldClosed, 'Old unbounded ticket protocol can still open the database');
    let oldWriteRefused = false;
    try { oldDb.transaction(['records','barriers'], 'readwrite'); } catch (error) { oldWriteRefused = error.name === 'InvalidStateError'; }
    check(oldWriteRefused, 'An upgraded-out readonly-protocol connection can still write');
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
    try { await store.ticket('registered-probe'); } finally { IDBDatabase.prototype.transaction = originalTransaction; }
    check(ticketTransactions.length === 1 && ticketTransactions[0].mode === 'readwrite' && ticketTransactions[0].names.join() === 'barriers', 'Ticket acquisition does not register permission in barriers-only readwrite');
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
      now = 10 * 60 * 60 * 1000;
      const validBeforeCorrection = await store.ticket('negative-age-direct');
      const correctionFailures = [];
      const correctionRecorder = createRecoveryRecorder('negative-age-recorder', () => snapshot('one edit before clock correction'), error => correctionFailures.push(String(error)));
      try {
        correctionRecorder.edit();
        // IDB transaction ordering ensures the recorder ticket is acquired at 10:00.
        await store.ticket('acquisition-fence');
        now -= 500;
        const directRecorded = await store.write('negative-age-direct', validBeforeCorrection, () => ({
          id:'negative-age-direct',version:1,path:'/test.md',recordedAt:now,recoveryText:'valid negative age',snapshot:snapshot('valid negative age'),
        }));
        await wait(); // Let the actual 500ms recorder turn run; no subsequent edit/checkpoint.
        const scheduledRecorded = (await list()).some(record => record.id === 'negative-age-recorder' && record.recoveryText.includes('one edit before clock correction'));
        check(directRecorded && scheduledRecorded && !correctionFailures.length,
          `Valid ticket at 10:00 refused at 09:59:59.500: ${JSON.stringify({directRecorded,scheduledRecorded,correctionFailures})}`);
      } finally { correctionRecorder.cancel(); }
      await store.delete('negative-age-direct');
      check(!await store.write('negative-age-direct',validBeforeCorrection,() => { throw new Error('Deleted negative-age ticket captured'); }), 'Negative age bypassed deletion');
      // Keep the nonce alive with a later edit: upper expiry must reject the older
      // ticket independently of registration GC or deletion.
      await store.delete();
      now = 10 * 60 * 60 * 1000;
      const upperBound = await store.ticket('upper-bound');
      now += lifetime - 1;
      await store.ticket('upper-bound');
      now++;
      check(!await store.write('upper-bound',upperBound,() => { throw new Error('Expired ticket captured'); }), '10-day upper bound was weakened');
      await store.delete();
      now = 60 * 60 * 1000;
      const beforeClockRollback = await store.ticket('rollback-before-delete');
      now = 0;
      await store.delete('rollback-before-delete');
      now = lifetime;
      await list();
      check(!(await metadata()).length, 'Exact rollback reproduction did not collect the barrier');
      now += 60 * 1000;
      const resurrected = await store.write('rollback-before-delete', beforeClockRollback, () => ({
        id:'rollback-before-delete',version:1,path:'/test.md',recordedAt:now,recoveryText:'must not return',snapshot:snapshot('must not return'),
      }));
      check(!resurrected, 'Ticket at 1h resurrected after rollback-to-0 deletion, GC at 10d, write at 10d+1m');
      now = realNow();
      await store.delete();
      for (let i=0;i<40;i++) await createRecoveryRecorder('never-edited-'+i,()=>null,()=>{}).discard();
      check(!(await metadata()).length, 'Never-edited session cleanup leaves metadata');
      for (let i=0;i<40;i++) { await record('closed-'+i); await store.delete('closed-'+i); }
      check(!(await metadata()).length, 'Recorded cleanup leaves tombstones');
      const ancient = await store.ticket('collected');
      await store.delete('collected');
      const idle = await store.ticket('idle-for-GC');
      now += lifetime - 1;
      const afterDeletion = await store.ticket('collected');
      const unrelated = await store.ticket('unrelated-live');
      now++;
      await list();
      check(!(await metadata()).some(key => key[1] === 'idle-for-GC'), 'Idle registration survives expiry');
      const captureRecord = id => () => ({id,version:1,path:'/test.md',recordedAt:now,recoveryText:id,snapshot:snapshot(id)});
      check(!await store.write('collected',ancient,captureRecord('collected')), 'Ancient ticket resurrected a record after metadata GC');
      // Collected permission stays invalid even if the clock returns to its issuance time.
      now -= lifetime;
      check(!await store.write('collected',ancient,captureRecord('collected')), 'Clock rollback revived a collected ticket');
      check(!await store.write('idle-for-GC',idle,captureRecord('idle-for-GC')), 'Clock rollback revived a GC-collected nonce');
      const afterGC = await store.ticket('idle-for-GC');
      check(await store.write('idle-for-GC',afterGC,captureRecord('idle-for-GC')), 'Fresh edit after GC cannot record');
      check(!await store.write('idle-for-GC',idle,captureRecord('idle-for-GC')), 'Fresh registration reused the GC-collected nonce');
      now += lifetime;
      check(await store.write('collected',afterDeletion,captureRecord('collected')), 'GC invalidated a still-valid post-deletion edit');
      check(await store.write('unrelated-live',unrelated,captureRecord('unrelated-live')), 'GC invalidated another session pending edit');
      await store.delete('collected');
      check(!await store.write('collected',afterDeletion,captureRecord('collected')), 'Reused generation after GC matched an old ticket');
      const resumed = await store.ticket('collected');
      check(await store.write('collected',resumed,captureRecord('collected')), 'Next edit cannot resume after GC and another deletion');
      const beforeRenewalRollback = await store.ticket('renewal-rollback');
      now -= 3600000;
      await store.ticket('renewal-rollback');
      now += lifetime;
      await list();
      check(await store.write('renewal-rollback',beforeRenewalRollback,captureRecord('renewal-rollback')), 'Rollback renewal shortened an unexpired pending registration');
      now += lifetime; await list();
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
      registeredTickets:true, protocolUpgrade:true, boundedMetadata:true, staleTicketAfterGC:true, postGCPendingEdit:true,
      negativeAgeDirect:true, negativeAgeScheduled:true, ticketUpperExpiry:true };
  } finally { recorder.cancel(); await store.delete(); }
})
