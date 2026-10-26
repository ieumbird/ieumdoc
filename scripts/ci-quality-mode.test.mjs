import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';
import { isDocumentationOnly } from './ci-quality-mode.mjs';

test('only explicit documentation paths skip product quality on PRs', () => {
  const docs = ['README.md', 'AGENTS.md', '.github/pull_request_template.md',
    'docs/test/README.md', 'docs/design/assets/screenshot.png', 'docs/reviews/evidence.json'];
  assert.equal(isDocumentationOnly('pull_request', docs), true);
  assert.equal(isDocumentationOnly('push', docs), false, 'master pushes always run full quality');
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
  assert.equal(steps.find(step => step.name === 'Check real PR commit provenance').if,
    "github.event_name == 'pull_request'");
  assert.equal(workflow.jobs['quality-and-browser'].name, 'Core, CLI, Editor, and browser regressions');
  assert.ok(workflow.jobs['quality-and-browser'].needs.includes('quality'));
});
