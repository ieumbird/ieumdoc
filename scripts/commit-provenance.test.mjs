import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { validateEvent, validateMessage, validatePullRequestEvent } from './commit-provenance.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const valid = 'AI-Agent: Codex\nAI-Model: openai/gpt-6.1-sol';
const broken = valid.replace('\n', '\n\n');

function repo(t) {
  const cwd = mkdtempSync(path.join(os.tmpdir(), 'litzio-provenance-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  function git(...args) {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  }
  git('init', '--initial-branch=master');
  git('config', 'user.name', 'Provenance test');
  git('config', 'user.email', 'provenance@example.invalid');
  git('config', 'core.hooksPath', path.join(root, '.githooks').replaceAll('\\', '/'));
  mkdirSync(path.join(cwd, 'scripts'));
  copyFileSync(path.join(root, 'scripts/commit-provenance.mjs'), path.join(cwd, 'scripts/commit-provenance.mjs'));
  return { cwd, git };
}

test('commit-msg rejects the PR #529 blank-line defect that Git cannot fully parse', t => {
  const { cwd } = repo(t);
  const message = `Fix recurrence\n\n${broken}\n`;
  const parsed = spawnSync('git', ['interpret-trailers', '--parse'], { cwd, input: message, encoding: 'utf8' });
  assert.equal(parsed.stdout.trim(), 'AI-Model: openai/gpt-6.1-sol');
  const commit = spawnSync('git', ['commit', '--allow-empty', '--file=-'], { cwd, input: message, encoding: 'utf8' });
  assert.notEqual(commit.status, 0, 'hook accepted provenance that Git only partly reads');
  assert.match(commit.stderr, /AI-Agent|trailer/);
});

test('commit-msg accepts actual valid and human commits', t => {
  const { git } = repo(t);
  git('commit', '--allow-empty', '-m', `Valid\n\n${valid}`);
  assert.equal(git('show', '-s', '--format=%(trailers:only)'), valid);
  git('commit', '--allow-empty', '-m', 'Human commit without attribution');
});

for (const [name, message] of [
  ['LF', `Subject\n\nBody.\n\n${valid}\n`],
  ['CRLF', `Subject\n\n${valid}\n`.replaceAll('\n', '\r\n')],
  ['optional review and other trailers', `Subject\n\nAI-Reviewed-By: openai/gpt-6-astra\n${valid}\nSigned-off-by: Human <a@example.invalid>\nRefs: #532\n`],
  ['model first', `Subject\n\nAI-Model: xai/grok-4.6\nAI-Agent: Grok\n`],
  ['human with other trailers', 'Human\n\nSigned-off-by: Human <a@example.invalid>\n'],
  ['review alone is optional', 'Human implementation\n\nAI-Reviewed-By: openai/gpt-6-astra\n'],
]) {
  test(`accepts ${name}`, () => assert.doesNotThrow(() => validateMessage(message)));
}

for (const [name, message] of [
  ['blank line between keys', `Subject\n\n${broken}`],
  ['whitespace blank line', `Subject\n\n${valid.replace('\n', '\n \t\n')}`],
  ['metadata before later prose', `Subject\n\n${valid}\n\nMore body text.`],
  ['missing block separator', `Subject\n${valid}`],
  ['metadata in subject', `AI-Agent: Codex\n\nAI-Model: openai/gpt-6.1-sol`],
  ['missing model', 'Subject\n\nAI-Agent: Codex'],
  ['missing agent', 'Subject\n\nAI-Model: openai/gpt-6.1-sol'],
  ['duplicate agent', `Subject\n\n${valid}\nAI-Agent: Codex`],
  ['duplicate model outside block', `Subject\n\nAI-Model: xai/grok-4.6\n\n${valid}`],
  ['case-variant duplicate', `Subject\n\n${valid}\nai-agent: Codex`],
  ['indented metadata outside block', `Subject\n\n  AI-Agent: Codex\n\nAI-Model: openai/gpt-6.1-sol`],
  ['empty agent', 'Subject\n\nAI-Agent: \t\nAI-Model: openai/gpt-6.1-sol'],
  ['empty model', 'Subject\n\nAI-Agent: Codex\nAI-Model: '],
  ['display model name', 'Subject\n\nAI-Agent: Codex\nAI-Model: GPT 6.1 Sol'],
  ['missing provider', 'Subject\n\nAI-Agent: Codex\nAI-Model: /gpt-6.1-sol'],
  ['missing model segment', 'Subject\n\nAI-Agent: Codex\nAI-Model: openai/'],
  ['multiline agent value', `Subject\n\n${valid.replace('AI-Agent: Codex', 'AI-Agent: Codex\n  extra attribution')}`],
]) {
  test(`rejects ${name}`, () => assert.throws(() => validateMessage(message), /AI-Agent|AI-Model/));
}

function event(base, head) {
  return { pull_request: { base: { sha: base }, head: { sha: head } } };
}

// commit-tree deliberately creates unvalidated fixtures without disabling hooks.
function commitObject(git, message, parents = []) {
  const tree = git('mktree');
  return git('commit-tree', tree, ...parents.flatMap(sha => ['-p', sha]), '-m', message);
}

test('PR event range excludes inherited master history and the checked-out synthetic merge', t => {
  const { cwd, git } = repo(t);
  const inherited = commitObject(git, `Old history\n\n${broken}`);
  const head = commitObject(git, `PR valid\n\n${valid}`, [inherited]);
  const base = commitObject(git, `Master advanced\n\n${broken}`, [inherited]);
  const synthetic = commitObject(git, `Synthetic merge\n\n${broken}`, [base, head]);
  git('update-ref', 'refs/heads/master', base);
  git('checkout', '--detach', synthetic);
  assert.deepEqual(validatePullRequestEvent(event(base, head), cwd), [head]);
  assert.deepEqual(validatePullRequestEvent(event(base, base), cwd), []);
});

test('PR range rejects malformed commits even when a later head has valid provenance', t => {
  const { cwd, git } = repo(t);
  const base = commitObject(git, 'Human base');
  const bad = commitObject(git, `Malformed PR\n\n${broken}`, [base]);
  const head = commitObject(git, `Fixed later\n\n${valid}`, [bad]);
  assert.throws(() => validatePullRequestEvent(event(base, head), cwd), error => error.message.includes(bad));
});

test('PR range validates authored merges including merges that import master', t => {
  const { cwd, git } = repo(t);
  const common = commitObject(git, 'Common base');
  const base = commitObject(git, `Master history\n\n${broken}`, [common]);
  const feature = commitObject(git, `Feature\n\n${valid}`, [common]);
  const badMerge = commitObject(git, `Merge master\n\n${broken}`, [feature, base]);
  assert.throws(() => validatePullRequestEvent(event(base, badMerge), cwd), error => error.message.includes(badMerge));
  const goodMerge = commitObject(git, `Merge master\n\n${valid}`, [feature, base]);
  assert.deepEqual(new Set(validatePullRequestEvent(event(base, goodMerge), cwd)), new Set([feature, goodMerge]));
});

test('CLI reads event JSON as data and rejects missing or hostile SHAs', t => {
  const { cwd, git } = repo(t);
  const base = commitObject(git, 'Base');
  const head = commitObject(git, `Feature\n\n${valid}`, [base]);
  const file = path.join(cwd, 'event.json');
  const run = input => {
    writeFileSync(file, JSON.stringify(input));
    return spawnSync(process.execPath, [path.join(root, 'scripts/commit-provenance.mjs'), 'pr-event', file], { cwd, encoding: 'utf8' });
  };
  const success = run(event(base, head));
  assert.equal(success.status, 0, success.stderr);
  assert.match(success.stdout, /checked 1 PR-only commits/);
  for (const input of [{}, event('--all', head), event(base, '$(echo injected)'), event(base, '0'.repeat(40))]) {
    assert.notEqual(run(input).status, 0);
  }
});

test('merge_group skips GitHub queue merges while PR events still validate authored commits', t => {
  const { cwd, git } = repo(t);
  const base = commitObject(git, 'Base');
  const feature = commitObject(git, `PR implementation\n\n${valid}`, [base]);
  const queueMerge = commitObject(git, 'GitHub-generated queue merge without AI trailers', [base, feature]);
  git('checkout', '--detach', queueMerge);
  const queueEvent = { merge_group: { base_sha: base, head_sha: queueMerge } };
  assert.equal(validateEvent('merge_group', queueEvent, cwd), null);
  assert.deepEqual(validateEvent('pull_request', event(base, feature), cwd), [feature]);
  const authoredMerge = commitObject(git, `Agent-authored merge\n\n${broken}`, [feature, base]);
  assert.throws(() => validateEvent('pull_request', event(base, authoredMerge), cwd), /AI-Agent/);
  assert.throws(() => validateEvent('unexpected', queueEvent, cwd), /Unsupported provenance event/);

  const file = path.join(cwd, 'queue-event.json');
  writeFileSync(file, JSON.stringify(queueEvent));
  const result = spawnSync(process.execPath, [path.join(root, 'scripts/commit-provenance.mjs'),
    'event', 'merge_group', file], { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /skipping GitHub-generated queue merges/);
  writeFileSync(file, JSON.stringify(event(base, feature)));
  const accepted = spawnSync(process.execPath, [path.join(root, 'scripts/commit-provenance.mjs'),
    'event', 'pull_request', file], { cwd, encoding: 'utf8' });
  assert.equal(accepted.status, 0, accepted.stderr);
  assert.match(accepted.stdout, /checked 1 PR-only commits/);
  writeFileSync(file, JSON.stringify(event(base, authoredMerge)));
  const rejected = spawnSync(process.execPath, [path.join(root, 'scripts/commit-provenance.mjs'),
    'event', 'pull_request', file], { cwd, encoding: 'utf8' });
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /AI-Agent/);
});
