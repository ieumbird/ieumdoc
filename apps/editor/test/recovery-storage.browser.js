// Actual IndexedDB transactions and recorder scheduling; no in-memory database substitute.
async page => {
  // A second window has acquired permission but has never persisted its first record.
  // File operations must invalidate that permission for both deletion and rename.
  const other = await page.context().newPage();
  const results = [];
  try {
    await other.goto(page.url());
    for (const next of [null, '/renamed-pending.md']) {
      await page.evaluate(async () => { const { recoveryStorage } = await import('/src/recovery-storage.ts'); await recoveryStorage.delete(); });
      await other.evaluate(async () => {
        const { recoveryStorage } = await import('/src/recovery-storage.ts');
        window.pendingFileTicket = await recoveryStorage.ticket('unrecorded-other-window', '/pending.md');
        window.unrelatedFileTicket = await recoveryStorage.ticket('unrelated-window', '/unrelated.md');
      });
      await page.evaluate(async next => { const { recoveryStorage } = await import('/src/recovery-storage.ts'); await recoveryStorage.changePath('/pending.md', next); }, next);
      results.push(await other.evaluate(async next => {
        const { recoveryStorage } = await import('/src/recovery-storage.ts');
        const record = (id, path) => ({ id,version:1,path,recordedAt:Date.now(),recoveryText:'delayed first write',snapshot:{file:{path}} });
        const written = await recoveryStorage.write('unrecorded-other-window', window.pendingFileTicket, () => ({
          id:'unrecorded-other-window',version:1,path:'/pending.md',recordedAt:Date.now(),recoveryText:'delayed first write',
          snapshot:{file:{path:'/pending.md'}},
        }));
        const count = (await recoveryStorage.list()).filter(record => record.path === '/pending.md').length;
        const unrelated = await recoveryStorage.write('unrelated-window', window.unrelatedFileTicket, () => record('unrelated-window', '/unrelated.md'));
        const path = next ?? '/pending.md';
        const fresh = await recoveryStorage.write('unrecorded-other-window', await recoveryStorage.ticket('unrecorded-other-window', path), () => record('unrecorded-other-window', path));
        return { written, count, unrelated, fresh };
      }, next));
    }
    if (results.some(result => result.written || result.count !== 0 || !result.unrelated || !result.fresh)) throw new Error(`File operation recovery permission mismatch: ${JSON.stringify(results)}`);
  } finally { await other.close(); }
  return page.evaluate(async () => {
  const { recoveryStorage: store, createRecoveryRecorder, recoveryText, RECOVERY_DB } = await import('/src/recovery-storage.ts');
  const check = (ok, why) => { if (!ok) throw new Error(why); };
  const wait = () => new Promise(resolve => setTimeout(resolve, 650));
  const snapshot = text => ({ file: { path: '/test.md', revision: 'a'.repeat(64), source: 'opening' },
    editor: { editorDocument: { type: 'doc', content: [{type:'paragraph',content:[{type:'text',text}]}] }, savedDocument: {type:'doc'} } });
  let live = snapshot('first');
  let errors = [];
  const recorder = createRecoveryRecorder('a', () => '/test.md', () => live, error => errors.push(String(error)));
  const list = () => store.list();
  const record = async (id, time = Date.now()) => {
    const token = await store.ticket(id, '/test.md');
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
    localStorage.setItem('ieumdoc.recoveryClean.v1.existing', '0');
    check((await list())[0]?.recoveryText === 'preserved', 'Clean metadata deleted a legacy record without a recording generation');
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
    try { await store.ticket('registered-probe', '/test.md'); } finally { IDBDatabase.prototype.transaction = originalTransaction; }
    check(ticketTransactions.length === 1 && ticketTransactions[0].mode === 'readwrite' && ticketTransactions[0].names.join() === 'barriers', 'Ticket acquisition does not register permission in barriers-only readwrite');
    recorder.edit();
    live = snapshot('latest at write turn');
    await wait();
    check((await list())[0]?.recoveryText === 'latest at write turn', 'Recorder captured an old scheduled snapshot');
    live = snapshot('not yet recorded'); recorder.edit(); recorder.cancel(); await wait();
    check((await list())[0]?.recoveryText === 'latest at write turn', 'Ordinary disposal removed the last successful record');

    // Clean acknowledgement survives disposal before the 500ms write. It applies
    // only to this session, even when another window has the same document path.
    await record('other-clean-window');
    live = null; recorder.edit(false); recorder.cancel();
    check((await list()).map(record => record.id).join() === 'other-clean-window', 'Immediate clean acknowledgement lost or deleted another session');
    await store.delete('other-clean-window');
    live = snapshot('dirty after acknowledged clean'); recorder.edit(); await wait();
    check((await list())[0]?.recoveryText === 'dirty after acknowledged clean', 'A new applied edit remained hidden behind clean acknowledgement');

    // A process crash may persist IndexedDB but revert localStorage independently.
    // Reappearing old clean metadata must never erase a newer committed dirty record.
    live = null; recorder.edit(false);
    const cleanKey = 'ieumdoc.recoveryClean.v1.a';
    const staleClean = localStorage.getItem(cleanKey);
    live = snapshot('dirty committed after the old clean acknowledgement'); recorder.edit(); await wait();
    localStorage.setItem(cleanKey, staleClean);
    check((await list())[0]?.recoveryText === 'dirty committed after the old clean acknowledgement', 'Reappearing clean metadata deleted newer committed work');

    live = null; recorder.edit(false);
    live = snapshot('Redo not committed yet'); recorder.edit();
    live = null; recorder.edit(false); recorder.cancel();
    check(!(await list()).length, 'Rapid Undo/Redo/Undo left an older dirty generation recoverable');

    // An in-flight Save can change the saved baseline after clean Undo, without a
    // further applied edit. Cleanup must preserve its ticket for that live checkpoint.
    live = null; recorder.edit(false); await list();
    live = snapshot('dirty against newer Save acknowledgement'); recorder.checkpoint(); await wait();
    check((await list())[0]?.recoveryText === 'dirty against newer Save acknowledgement', 'Clean listing invalidated the live Save checkpoint');

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
    // A clean Undo can queue cleanup, then Redo/new input can arrive while IndexedDB
    // is busy. The cleanup must capture the newer dirty work, never blindly delete it.
    let recorded;
    const completed = new Promise(resolve => { recorded = resolve; });
    const rapid = createRecoveryRecorder('rapid', () => '/test.md', () => live, error => errors.push(String(error)), () => recorded());
    live = null; rapid.edit(false);
    live = snapshot('Redo after clean Undo'); rapid.edit();
    const tokenPromise = store.ticket('a', '/test.md');
    const writing = tokenPromise.then(token => store.write('a', token, () => ({id:'a',version:1,path:'/test.md',recordedAt:Date.now(),recoveryText:live.file.revision,snapshot:live})));
    live = { ...snapshot('newer applied edits after Save'), file: { ...snapshot('').file, revision:'b'.repeat(64) } };
    release = true; await writing; await completed; rapid.cancel(); db.close();
    check((await list()).find(record => record.id === 'rapid')?.recoveryText === 'newer applied edits after Save', 'Queued clean cleanup deleted newer dirty work');
    check((await list()).find(record => record.id === 'a')?.snapshot.file.revision === 'b'.repeat(64), 'Write did not use the latest acknowledged revision');
    await store.delete('rapid');

    await record('other-window'); await store.delete('a');
    check((await list()).map(r => r.id).join() === 'other-window', 'One session deleted another session record');
    // Even malformed/future record identifiers cannot turn one Delete into Clear all.
    const otherTicket = await store.ticket('other-window', '/test.md');
    await record(''); await record('all');
    await store.delete(''); await store.delete('all');
    let retainedTicket = false;
    await store.write('other-window',otherTicket,() => { retainedTicket = true; return undefined; });
    check(retainedTicket && (await list()).map(r => r.id).join() === 'other-window', 'Malformed record deletion cleared or invalidated other sessions');
    await record('expired', Date.now() - 10*86400000);
    const expiredTicket = await store.ticket('expired', '/test.md');
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
      const validBeforeCorrection = await store.ticket('negative-age-direct', '/test.md');
      const correctionFailures = [];
      const correctionRecorder = createRecoveryRecorder('negative-age-recorder', () => '/test.md', () => snapshot('one edit before clock correction'), error => correctionFailures.push(String(error)));
      try {
        correctionRecorder.edit();
        // IDB transaction ordering ensures the recorder ticket is acquired at 10:00.
        await store.ticket('acquisition-fence', '/test.md');
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
      const upperBound = await store.ticket('upper-bound', '/test.md');
      now += lifetime - 1;
      await store.ticket('upper-bound', '/test.md');
      now++;
      check(!await store.write('upper-bound',upperBound,() => { throw new Error('Expired ticket captured'); }), '10-day upper bound was weakened');
      await store.delete();
      now = 60 * 60 * 1000;
      const beforeClockRollback = await store.ticket('rollback-before-delete', '/test.md');
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
      for (let i=0;i<40;i++) await createRecoveryRecorder('never-edited-'+i, () => '/test.md',()=>null,()=>{}).discard();
      check(!(await metadata()).length, 'Never-edited session cleanup leaves metadata');
      for (let i=0;i<40;i++) { await record('closed-'+i); await store.delete('closed-'+i); }
      check(!(await metadata()).length, 'Recorded cleanup leaves tombstones');
      const ancient = await store.ticket('collected', '/test.md');
      await store.delete('collected');
      const idle = await store.ticket('idle-for-GC', '/test.md');
      now += lifetime - 1;
      const afterDeletion = await store.ticket('collected', '/test.md');
      const unrelated = await store.ticket('unrelated-live', '/test.md');
      now++;
      await list();
      check(!(await metadata()).some(key => key[1] === 'idle-for-GC'), 'Idle registration survives expiry');
      const captureRecord = id => () => ({id,version:1,path:'/test.md',recordedAt:now,recoveryText:id,snapshot:snapshot(id)});
      check(!await store.write('collected',ancient,captureRecord('collected')), 'Ancient ticket resurrected a record after metadata GC');
      // Collected permission stays invalid even if the clock returns to its issuance time.
      now -= lifetime;
      check(!await store.write('collected',ancient,captureRecord('collected')), 'Clock rollback revived a collected ticket');
      check(!await store.write('idle-for-GC',idle,captureRecord('idle-for-GC')), 'Clock rollback revived a GC-collected nonce');
      const afterGC = await store.ticket('idle-for-GC', '/test.md');
      check(await store.write('idle-for-GC',afterGC,captureRecord('idle-for-GC')), 'Fresh edit after GC cannot record');
      check(!await store.write('idle-for-GC',idle,captureRecord('idle-for-GC')), 'Fresh registration reused the GC-collected nonce');
      now += lifetime;
      check(await store.write('collected',afterDeletion,captureRecord('collected')), 'GC invalidated a still-valid post-deletion edit');
      check(await store.write('unrelated-live',unrelated,captureRecord('unrelated-live')), 'GC invalidated another session pending edit');
      await store.delete('collected');
      check(!await store.write('collected',afterDeletion,captureRecord('collected')), 'Reused generation after GC matched an old ticket');
      const resumed = await store.ticket('collected', '/test.md');
      check(await store.write('collected',resumed,captureRecord('collected')), 'Next edit cannot resume after GC and another deletion');
      const beforeRenewalRollback = await store.ticket('renewal-rollback', '/test.md');
      now -= 3600000;
      await store.ticket('renewal-rollback', '/test.md');
      now += lifetime;
      await list();
      check(await store.write('renewal-rollback',beforeRenewalRollback,captureRecord('renewal-rollback')), 'Rollback renewal shortened an unexpired pending registration');
      now += lifetime; await list();
      check(!(await metadata()).length, 'Expired records leave permanent metadata');
    } finally { Date.now = realNow; await store.delete(); }

    // Synchronous acknowledgement access can fail independently of IndexedDB.
    // Fail closed for new writes, keeping the last committed dirty record visible.
    live = snapshot('record before acknowledgement failure'); recorder.edit(); await wait();
    const beforeAcknowledgementFailure = await list();
    const removeItem = Storage.prototype.removeItem;
    Storage.prototype.removeItem = () => { throw new DOMException('Test acknowledgement denied','SecurityError'); };
    try {
      live = snapshot('unrecorded while acknowledgement denied'); recorder.edit();
      check(errors.some(error => error.includes('acknowledgement denied')), 'Acknowledgement failure was swallowed');
      check(JSON.stringify(await list()) === JSON.stringify(beforeAcknowledgementFailure), 'Acknowledgement failure deleted or overwrote recorded work');
    } finally { Storage.prototype.removeItem = removeItem; }
    errors = []; recorder.edit(); await wait();
    check(!errors.length && (await list()).some(record => record.recoveryText === 'unrecorded while acknowledgement denied'), 'Recording did not resume after acknowledgement access recovered');

    const beforeUnreadableAcknowledgement = await list();
    live = null; recorder.edit(false); recorder.cancel();
    const storageKey = Storage.prototype.key;
    Storage.prototype.key = () => { throw new DOMException('Test acknowledgement unreadable','SecurityError'); };
    try { check(JSON.stringify(await list()) === JSON.stringify(beforeUnreadableAcknowledgement), 'Unreadable acknowledgement authorized deletion'); }
    finally { Storage.prototype.key = storageKey; }
    check(!(await list()).length, 'Readable clean acknowledgement did not resume cleanup');
    live = snapshot('resumed after unreadable acknowledgement');

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
      negativeAgeDirect:true, negativeAgeScheduled:true, ticketUpperExpiry:true,
      cleanAcknowledgement:true, dirtyAfterClean:true, acknowledgementFailureRetainsRecord:true, queuedCleanRetainsNewInput:true };
  } finally { recorder.cancel(); await store.delete(); }
});
}
