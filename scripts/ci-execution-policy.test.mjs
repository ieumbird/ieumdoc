import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { load } from 'js-yaml';
import { executionPolicy, selectJobs, successfulQueueRun } from './ci-execution-policy.mjs';

const sha = 'a'.repeat(40);
const base = 'b'.repeat(40);
const event = { merge_group: { base_sha: base, head_sha: sha } };
const expected = (quality, browser, http, desktop, update, smartquotes = false) =>
  ({ quality, browser, http, desktop, update, smartquotes, reused: false });
const full = expected(true, true, true, true, true, true);

test('merge_group payloads apply the same path rules as PRs to the entire group diff', async () => {
  const cases = [
    [['docs/test/README.md'], expected(false, false, false, false, false)],
    [['apps/editor/src/App.tsx'], expected(true, true, true, true, false)],
    [['apps/desktop/installer/cli.nsh'], expected(true, false, false, true, true)],
    [['pnpm-lock.yaml'], full],
    // Multiple PRs in one group: take the union, including a deleted file.
    [['docs/test/README.md', 'apps/editor/src/App.tsx', 'apps/desktop/installer/cli.nsh'], expected(true, true, true, true, true)],
    [['packages/cli/src/cli.ts'], expected(true, false, true, true, false)],
    [['packages/docling/src/convert.ts'], expected(true, false, true, true, false)],
    [['unknown/config.json'], expected(true, true, true, true, true)],
    [['apps/editor/document/fixture.md'], expected(true, true, true, true, false)],
    [['apps/editor/shared/desktop-bridge.ts'], expected(true, true, true, true, true)],
  ];
  for (const [paths, jobs] of cases) {
    const git = args => {
      assert.deepEqual(args, ['diff', '--name-only', '--no-renames', '-z', `${base}..${sha}`]);
      return paths.join('\0') + '\0';
    };
    assert.deepEqual(await executionPolicy('merge_group', event, { git }), jobs);
    assert.deepEqual(selectJobs('pull_request', paths), selectJobs('merge_group', paths));
  }
  assert.deepEqual(await executionPolicy('merge_group', event, { git: () => { throw new Error('missing history'); } }), full);
  assert.deepEqual(await executionPolicy('merge_group', { merge_group: { base_sha: '--bad', head_sha: sha } }), full);
  assert.deepEqual(await executionPolicy('merge_group', event, { git: () => '' }), full);
});

test('actual group diff includes successive PR commits, removed paths and both sides of renames', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'litzio-queue-policy-'));
  const git = args => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  const commit = message => {
    git(['add', '-A']); git(['commit', '-qm', message]);
    return git(['rev-parse', 'HEAD']).trim();
  };
  const policy = (base_sha, head_sha) => executionPolicy('merge_group', { merge_group: { base_sha, head_sha } }, { git });
  try {
    git(['init', '-q']); git(['config', 'user.name', 'CI test']); git(['config', 'user.email', 'ci@example.invalid']);
    mkdirSync(path.join(dir, 'apps/editor/src'), { recursive: true });
    writeFileSync(path.join(dir, 'apps/editor/src/App.tsx'), 'editor\n');
    writeFileSync(path.join(dir, 'README.md'), 'docs\n');
    const initial = commit('base');
    writeFileSync(path.join(dir, 'README.md'), 'docs PR\n');
    const docs = commit('docs PR');
    assert.deepEqual(await policy(initial, docs), expected(false, false, false, false, false));
    git(['mv', 'apps/editor/src/App.tsx', 'EDITOR.md']);
    const group = commit('second PR renames product file');
    assert.deepEqual(await policy(initial, group), expected(true, true, true, true, false));
    assert.deepEqual(await policy(docs, group), expected(true, true, true, true, false));
    assert.deepEqual(await policy('f'.repeat(40), group), full);
    // With divergent trees, base..head includes a removed installer that a
    // merge-base diff would omit. Queue policy must use the supplied base tree.
    git(['checkout', '-qb', 'base-branch', initial]);
    mkdirSync(path.join(dir, 'apps/desktop'), { recursive: true });
    writeFileSync(path.join(dir, 'apps/desktop/installer.nsh'), 'installer\n');
    const divergent = commit('base tree includes installer');
    assert.deepEqual(await policy(divergent, docs), expected(true, false, false, true, true));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

const successful = { event: 'merge_group', head_sha: sha, conclusion: 'success', status: 'completed',
  html_url: 'https://github.com/ieumbird/ieumdoc/actions/runs/123' };
const apiInputs = { repository: 'ieumbird/ieumdoc', sha, token: 'test-token' };
const response = runs => async (url, options) => {
  assert.match(url, /\/actions\/workflows\/ci.yml\/runs\?event=merge_group&head_sha=a{40}&status=success/);
  assert.equal(options.headers.Authorization, 'Bearer test-token');
  return { ok: true, json: async () => ({ workflow_runs: runs }) };
};

test('only a successful same-SHA merge_group run in this workflow permits master push reuse', async () => {
  assert.deepEqual(await successfulQueueRun({ ...apiInputs, fetchRuns: response([successful]) }), successful);
  const result = await executionPolicy('push', { ref: 'refs/heads/master' }, { ...apiInputs, fetchRuns: response([successful]) });
  assert.deepEqual(result, { quality: false, browser: false, http: false, desktop: false, update: false, smartquotes: false, reused: true });
  for (const candidate of [null, { ...successful, event: 'pull_request' }, { ...successful, head_sha: base },
    { ...successful, conclusion: 'failure' }, { ...successful, conclusion: 'cancelled' },
    { ...successful, status: 'in_progress' }, { ...successful, html_url: undefined }]) {
    assert.deepEqual(await executionPolicy('push', { ref: 'refs/heads/master' }, {
      ...apiInputs, fetchRuns: response(candidate ? [candidate] : []),
    }), full);
  }
  for (const fetchRuns of [async () => { throw new Error('API unavailable'); },
    async () => ({ ok: false, status: 403 }), async () => ({ ok: true, json: async () => ({}) })]) {
    assert.deepEqual(await executionPolicy('push', { ref: 'refs/heads/master' }, { ...apiInputs, fetchRuns }), full);
  }
  assert.deepEqual(await executionPolicy('push', { ref: 'refs/heads/master' }), full, 'missing token fails safe');
  assert.deepEqual(await executionPolicy('push', { ref: 'refs/heads/other' }, {
    ...apiInputs, fetchRuns: () => assert.fail('non-master push must not reuse queue CI'),
  }), full);
});

test('smartquotes runs for dependency, patch and parser configuration changes, outside default Core tests', () => {
  for (const file of ['package.json', 'packages/core/package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml',
    'patches/markdown-it@13.0.2.patch', 'patches/linkify-it@4.0.1.patch', 'packages/core/src/myst/parse.ts',
    'packages/core/src/myst/serialize.ts', 'packages/core/src/myst/footnote.ts',
    'packages/core/src/myst/literal-syntax.ts', 'packages/core/test/smartquotes-patch.test.ts']) {
    assert.equal(selectJobs('merge_group', [file]).smartquotes, true, file);
  }
  for (const file of ['docs/README.md', 'apps/editor/src/App.tsx', 'packages/core/src/index.ts',
    'packages/core/src/myst/figure.ts', 'packages/core/src/myst/table.ts',
    'packages/core/test/myst-regression.test.ts', 'scripts/ci-quality-mode.test.mjs']) {
    assert.equal(selectJobs('merge_group', [file]).smartquotes, false, file);
  }
  const { scripts } = JSON.parse(readFileSync(new URL('../packages/core/package.json', import.meta.url), 'utf8'));
  assert.ok(!scripts.test.includes('smartquotes'));
  assert.equal(scripts['test:smartquotes'], 'tsx --test test/smartquotes-patch.test.ts');
});

const workflow = () => load(readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8'));
test('cache-only master runs preserve pnpm OS stores and the exact Linux browser cache path and key', () => {
  const { jobs } = workflow();
  const warm = jobs['cache-warm'];
  assert.equal(warm.if, "needs.changes.outputs.reused == 'true'");
  assert.deepEqual(warm.strategy.matrix.os, jobs.http.strategy.matrix.os);
  assert.deepEqual(warm.strategy.matrix.include, jobs.http.strategy.matrix.include);
  const setup = warm.steps.find(step => step.uses?.startsWith('pnpm/action-setup@'));
  assert.deepEqual(setup, jobs.http.steps.find(step => step.uses?.startsWith('pnpm/action-setup@')));
  for (const name of ['Cache Playwright browsers', 'Install pinned Chromium']) {
    assert.deepEqual(warm.steps.find(step => step.name === name), jobs.http.steps.find(step => step.name === name));
  }
  assert.ok(warm.steps.some(step => step.run === 'pnpm install --frozen-lockfile'));
  assert.ok(!warm.steps.some(step => /test|package|build/.test(step.run ?? '')), 'cache warming must not repeat product validation');
});

test('aggregate accepts unselected skips but rejects failed, cancelled or skipped selected jobs', () => {
  const aggregate = workflow().jobs['quality-and-browser'];
  const script = aggregate.steps.find(step => step.name === 'Require all checks to pass').run;
  const bash = process.platform === 'win32' ? path.join(process.env.ProgramFiles, 'Git/bin/bash.exe') : 'bash';
  const defaults = { CHANGES_RESULT: 'success', QUALITY_RESULT: 'success', BROWSER_SELECTED: 'false', BROWSER_RESULT: 'skipped',
    HTTP_SELECTED: 'false', HTTP_RESULT: 'skipped', DESKTOP_SELECTED: 'false', DESKTOP_RESULT: 'skipped',
    CACHE_SELECTED: 'false', CACHE_RESULT: 'skipped' };
  const run = env => spawnSync(bash, ['-c', script], { env: { ...process.env, ...defaults, ...env }, encoding: 'utf8' });
  assert.equal(run({}).status, 0, 'docs group');
  assert.equal(run({ CACHE_SELECTED: 'true', CACHE_RESULT: 'success' }).status, 0, 'reused push');
  for (const name of ['BROWSER', 'HTTP', 'DESKTOP', 'CACHE']) {
    assert.equal(run({ [`${name}_SELECTED`]: 'true', [`${name}_RESULT`]: 'success' }).status, 0);
    for (const result of ['failure', 'cancelled', 'skipped']) {
      assert.equal(run({ [`${name}_SELECTED`]: 'true', [`${name}_RESULT`]: result }).status, 1, `${name}: ${result}`);
    }
    assert.equal(run({ [`${name}_RESULT`]: 'failure' }).status, 1);
  }
  assert.equal(run({ QUALITY_RESULT: 'skipped' }).status, 1);
  assert.equal(run({ CHANGES_RESULT: 'failure' }).status, 1);
  assert.equal(aggregate.steps.find(step => step.name === 'Reject a cancelled workflow').if, '${{ cancelled() }}');
});
