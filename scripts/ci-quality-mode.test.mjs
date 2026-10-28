import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { load, loadAll } from 'js-yaml';
import { isDocumentationOnly } from './ci-quality-mode.mjs';

test('only explicit documentation paths skip product quality on PRs', () => {
  const docs = ['README.md', 'AGENTS.md', '.github/pull_request_template.md',
    'docs/test/README.md', 'docs/design/assets/screenshot.png', 'docs/reviews/evidence.json'];
  assert.equal(isDocumentationOnly('pull_request', docs), true);
  assert.equal(isDocumentationOnly('push', docs), false, 'master pushes always run full quality');
  assert.equal(isDocumentationOnly('merge_group', docs), false, 'queue builds always run full quality');
  assert.equal(isDocumentationOnly('workflow_dispatch', docs), false);
  assert.equal(isDocumentationOnly('pull_request', []), false);
  for (const other of ['apps/editor/src/App.tsx', 'apps/editor/document/fixture.md',
    'packages/core/test/fixture.md', 'packages/new/README.md', 'apps/new/README.md',
    'scripts/README.md', 'patches/README.md', '.githooks/README.md',
    '.github/workflows/ci.yml', '.github/ISSUE_TEMPLATE/task.yml', 'pnpm-lock.yaml',
    'unknown/README.md', 'unknown.txt', 'docs/tool.ts', 'docs/build.sh']) {
    assert.equal(isDocumentationOnly('pull_request', [...docs, other]), false, other);
  }
});

test('event CLI checks actual PR diffs, renames and whitespace, and emits the workflow output', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ieumdoc-ci-mode-'));
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
  const script = fileURLToPath(new URL('./ci-quality-mode.mjs', import.meta.url));
  const event = path.join(dir, 'event.json');
  const output = path.join(dir, 'output.txt');
  const run = (eventName, base, head) => {
    writeFileSync(event, JSON.stringify({ pull_request: { base: { sha: base }, head: { sha: head } } }));
    writeFileSync(output, '');
    return spawnSync(process.execPath, [script, eventName, event], {
      cwd: dir, encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: output },
    });
  };
  try {
    git('init', '-q');
    git('config', 'user.name', 'CI test');
    git('config', 'user.email', 'ci@example.invalid');
    writeFileSync(path.join(dir, 'README.md'), 'initial\n');
    writeFileSync(path.join(dir, 'product.txt'), 'product\n');
    git('add', 'README.md', 'product.txt');
    git('commit', '-qm', 'base');
    const base = git('rev-parse', 'HEAD');
    writeFileSync(path.join(dir, 'README.md'), 'changed\n');
    git('commit', '-qam', 'docs');
    const docsHead = git('rev-parse', 'HEAD');
    assert.equal(run('pull_request', base, docsHead).status, 0);
    assert.equal(readFileSync(output, 'utf8'), 'docs_only=true\n');
    assert.equal(run('push', base, docsHead).status, 0);
    assert.equal(readFileSync(output, 'utf8'), 'docs_only=false\n');
    assert.equal(run('merge_group', base, docsHead).status, 0);
    assert.equal(readFileSync(output, 'utf8'), 'docs_only=false\n');
    git('mv', 'product.txt', 'PRODUCT.md');
    git('commit', '-qm', 'rename product to markdown');
    assert.equal(run('pull_request', base, git('rev-parse', 'HEAD')).status, 0);
    assert.equal(readFileSync(output, 'utf8'), 'docs_only=false\n');
    writeFileSync(path.join(dir, 'README.md'), 'bad whitespace  \n');
    git('commit', '-qam', 'whitespace');
    assert.notEqual(run('pull_request', base, git('rev-parse', 'HEAD')).status, 0);
    assert.equal(readFileSync(output, 'utf8'), '', 'failed checks cannot emit docs-only success');
    assert.notEqual(run('pull_request', '--invalid', docsHead).status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CI keeps policy checks in both modes and gates only product quality steps', () => {
  const workflow = load(readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8'));
  const steps = workflow.jobs.quality.steps;
  const mode = steps.find(step => step.id === 'mode');
  assert.match(mode.run, /node scripts\/ci-quality-mode.mjs "\$GITHUB_EVENT_NAME" "\$GITHUB_EVENT_PATH"/);
  assert.equal(mode.if, undefined);
  for (const run of ['pnpm typecheck', 'pnpm test', 'pnpm --filter @ieumdoc/editor build']) {
    assert.equal(steps.find(step => step.run === run).if, "steps.mode.outputs.docs_only != 'true'");
  }
  for (const name of ['Documentation checks', 'Issue forms and registration checks',
    'AI commit provenance regressions', 'CI quality path classification regressions']) {
    assert.equal(steps.find(step => step.name === name).if, undefined, name);
  }
  const provenance = steps.find(step => step.name === 'Check event commit provenance');
  assert.equal(provenance.if, "github.event_name == 'pull_request' || github.event_name == 'merge_group'");
  assert.equal(provenance.run, 'node scripts/commit-provenance.mjs event "$GITHUB_EVENT_NAME" "$GITHUB_EVENT_PATH"');
  assert.equal(workflow.jobs['quality-and-browser'].name, 'Core, CLI, Editor, and browser regressions');
  assert.ok(workflow.jobs['quality-and-browser'].needs.includes('quality'));
});

test('Linux browser container tags match the locked Playwright base version', () => {
  const workflow = load(readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8'));
  const release = load(readFileSync(new URL('../.github/workflows/desktop-release.yml', import.meta.url), 'utf8'));
  const lockfile = loadAll(readFileSync(new URL('../pnpm-lock.yaml', import.meta.url), 'utf8'))
    .find(doc => doc?.importers?.['.']?.devDependencies?.['@playwright/test']);
  const version = lockfile?.importers['.'].devDependencies['@playwright/test'].version;
  const baseVersion = /^(\d+\.\d+\.\d+)(?:-|$)/.exec(version)?.[1];
  assert.ok(baseVersion, `Unrecognized locked Playwright version: ${version}`);
  const httpLinux = workflow.jobs.http.strategy.matrix.include.find(entry => entry.os === 'ubuntu-latest');
  for (const [name, container] of [['browser', workflow.jobs.browser.container], ['http Linux', httpLinux?.container],
    ['release browser', release.jobs.browser.container]]) {
    assert.equal(container?.image, `mcr.microsoft.com/playwright:v${baseVersion}-noble`,
      `${name}: image OS dependencies must match locked Playwright base ${baseVersion} (${version})`);
  }
});

test('release browser shards match CI while preserving trusted checkout and publication gates', () => {
  const ci = load(readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8'));
  const release = load(readFileSync(new URL('../.github/workflows/desktop-release.yml', import.meta.url), 'utf8'));
  const { browser, publish } = release.jobs;
  assert.deepEqual(browser.strategy.matrix.shard, [1, 2, 3, 4]);
  assert.equal(browser.strategy['fail-fast'], false);
  assert.deepEqual(browser.container, ci.jobs.browser.container);
  assert.equal(browser['runs-on'], ci.jobs.browser['runs-on']);
  assert.equal(browser['timeout-minutes'], ci.jobs.browser['timeout-minutes']);
  assert.deepEqual(browser.env, ci.jobs.browser.env);
  for (const name of ['Cache Playwright browsers', 'Install pinned Chromium']) {
    assert.deepEqual(browser.steps.find(step => step.name === name), ci.jobs.browser.steps.find(step => step.name === name));
  }
  const run = browser.steps.find(step => step.run?.startsWith('pnpm browser:test'));
  const ciRun = ci.jobs.browser.steps.find(step => step.run?.startsWith('pnpm browser:test'));
  assert.equal(run.run, ciRun.run);
  assert.deepEqual(run.env, ciRun.env);
  assert.equal(browser.needs, 'preflight');
  assert.deepEqual(browser.steps.find(step => step.uses?.startsWith('actions/checkout@')).with,
    { ref: '${{ needs.preflight.outputs.commit }}', 'persist-credentials': false });
  assert.deepEqual(release.permissions, { contents: 'read' });
  assert.equal(browser.permissions, undefined);
  const diagnostics = browser.steps.find(step => step.uses?.startsWith('actions/upload-artifact@'));
  assert.equal(diagnostics.if, 'failure()');
  assert.ok(diagnostics.with.name.includes('${{ matrix.shard }}'));
  assert.equal(diagnostics.with.path, ci.jobs.browser.steps.find(step => step.uses?.startsWith('actions/upload-artifact@')).with.path);
  assert.deepEqual(publish.needs, ['preflight', 'browser', 'build']);
  // No status function overrides Actions' implicit success() gate for all matrix jobs.
  assert.equal(publish.if, "inputs.mode != 'verify' && github.ref == 'refs/heads/master'");
});

// These expressions use the JS-compatible subset of Actions expressions.
const evaluate = (expression, context) => runInNewContext(expression.replace(/^\$\{\{|\}\}$/g, '').trim(), context);
const github = (eventName, sha, number, queueSha = sha) => ({
  event_name: eventName, sha,
  event: { pull_request: { number }, merge_group: { head_sha: queueSha } },
});

test('merge_group requests full quality, all browser shards, both HTTP OSes and Desktop update', () => {
  const workflow = load(readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8'));
  assert.deepEqual(workflow.on.merge_group.types, ['checks_requested']);
  const { changes, quality, browser, http, desktop, 'quality-and-browser': aggregate } = workflow.jobs;
  for (const eventName of ['merge_group', 'push', 'pull_request']) {
    // No paths selected: a docs PR skips optional jobs; queue/push must select all.
    const context = { github: github(eventName, 'a'.repeat(40), 537), steps: { filter: { outputs: {} } } };
    const selected = {};
    for (const [name, expression] of Object.entries(changes.outputs)) {
      selected[name] = String(evaluate(expression, context));
      assert.equal(selected[name], String(eventName !== 'pull_request'), `${eventName}: ${name}`);
    }
    assert.equal(evaluate(changes.steps.find(step => step.id === 'filter').if, context), eventName === 'pull_request');
    context.needs = { changes: { outputs: selected } };
    for (const job of [browser, http, desktop]) {
      assert.equal(evaluate(job.if, context), eventName !== 'pull_request', job.name);
    }
    const updateSteps = desktop.steps.filter(step => step.run === 'pnpm --filter @ieumdoc/desktop test:update');
    const release = load(readFileSync(new URL('../.github/workflows/desktop-release.yml', import.meta.url), 'utf8'));
    const releaseUpdateSteps = release.jobs.build.steps.filter(step => step.run === 'pnpm --filter @ieumdoc/desktop test:update');
    assert.deepEqual(updateSteps.map(step => step.env?.IEUMDOC_TEST_UPDATE_CHANNEL ?? 'stable'), ['stable', 'beta'],
      'Stable must clean up before Beta starts on the same runner');
    assert.deepEqual(updateSteps.map(step => step.env), releaseUpdateSteps.map(step => step.env),
      'PR CI must preserve the release workflow channel order');
    for (const step of updateSteps) assert.equal(evaluate(step.if, context), eventName !== 'pull_request');
  }
  assert.equal(quality.if, undefined);
  assert.deepEqual(browser.strategy.matrix.shard, [1, 2, 3, 4]);
  assert.deepEqual(http.strategy.matrix.os, ['ubuntu-latest', 'windows-latest']);
  assert.equal(aggregate.name, 'Core, CLI, Editor, and browser regressions');
  assert.deepEqual(new Set(aggregate.needs), new Set(['changes', 'quality', 'browser', 'http', 'desktop']));
  assert.equal(aggregate.if, '${{ always() }}');
});

test('queue concurrency isolates group SHAs while only newer PR runs cancel older runs', () => {
  const { concurrency } = load(readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8'));
  const group = context => concurrency.group.replace(/\$\{\{(.*?)\}\}/g, (_, expression) => evaluate(expression, context));
  const first = { github: github('merge_group', 'fallback', undefined, 'a'.repeat(40)) };
  const second = { github: github('merge_group', 'fallback', undefined, 'b'.repeat(40)) };
  assert.notEqual(group(first), group(second), 'queue group SHA must identify the run');
  assert.equal(evaluate(concurrency['cancel-in-progress'], first), false);
  const pr = { github: github('pull_request', 'a'.repeat(40), 537) };
  const newerPr = { github: github('pull_request', 'b'.repeat(40), 537) };
  assert.equal(group(pr), group(newerPr));
  assert.equal(evaluate(concurrency['cancel-in-progress'], pr), true);
  const push = { github: github('push', 'a'.repeat(40)) };
  assert.notEqual(group(first), group(push), 'queue and push events must not share a group');
  assert.equal(evaluate(concurrency['cancel-in-progress'], push), false);
});
