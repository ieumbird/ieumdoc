#!/usr/bin/env node
// Check that an IeumDoc PR can enter the merge queue; optionally comment and enqueue it.
// Usage: node pr-gate.mjs --pr <N> [--enqueue --note-file <file>]
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = 'ieumbird/ieumdoc';
const run = (command, args, options = {}) => execFileSync(command, args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...options }).trim();
const gh = args => run('gh', args);
const git = args => run('git', args);

const argv = process.argv.slice(2);
const option = name => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const pr = Number(option('--pr'));
const enqueue = argv.includes('--enqueue');
const noteFile = option('--note-file');
if (!Number.isInteger(pr) || pr <= 0) throw new Error('Usage: pr-gate.mjs --pr <N> [--enqueue --note-file <file>]');
if (enqueue && !noteFile) throw new Error('--enqueue requires --note-file with the orchestrator record');

if (!/github\.com[/:]ieumbird\/ieumdoc(\.git)?$/.test(git(['remote', 'get-url', 'origin']))) {
  throw new Error('This script only runs inside the ieumbird/ieumdoc repository');
}
const root = git(['rev-parse', '--show-toplevel']);

const view = JSON.parse(gh(['pr', 'view', String(pr), '--repo', REPO, '--json',
  'id,state,isDraft,headRefName,headRefOid,baseRefName,mergeable,statusCheckRollup']));
const problems = [];
if (view.state !== 'OPEN') problems.push(`PR is ${view.state}`);
if (view.baseRefName !== 'master') problems.push(`base is ${view.baseRefName}, not master`);
if (view.isDraft) problems.push('PR is a draft (run `gh pr ready` first)');
if (view.mergeable === 'CONFLICTING') problems.push('PR conflicts with master');

const checks = view.statusCheckRollup ?? [];
const state = check => check.conclusion || check.state || check.status || '';
const pending = checks.filter(check => !state(check) || ['PENDING', 'QUEUED', 'IN_PROGRESS', 'EXPECTED'].includes(state(check)));
const failed = checks.filter(check => state(check) && !pending.includes(check) && !['SUCCESS', 'SKIPPED', 'NEUTRAL'].includes(state(check)));
if (!checks.length) problems.push('no CI checks reported for the head');
if (pending.length) problems.push(`checks pending: ${pending.map(check => check.name ?? check.context).join(', ')}`);
if (failed.length) problems.push(`checks failed: ${failed.map(check => `${check.name ?? check.context}=${state(check)}`).join(', ')}`);

const threads = JSON.parse(gh(['api', 'graphql', '-f',
  `query={repository(owner:"ieumbird",name:"ieumdoc"){pullRequest(number:${pr}){reviewThreads(first:100){nodes{isResolved}}}}}`]))
  .data.repository.pullRequest.reviewThreads.nodes;
const unresolved = threads.filter(thread => !thread.isResolved).length;
if (unresolved) problems.push(`${unresolved} unresolved review thread(s)`);

if (view.state !== 'OPEN') {
  console.log(JSON.stringify({ pr, head: view.headRefOid, problems }, null, 2));
  process.exit(1);
}
git(['fetch', '-q', 'origin', 'master', view.headRefName]);
const fetched = git(['rev-parse', `refs/remotes/origin/${view.headRefName}`]);
if (fetched !== view.headRefOid) problems.push(`remote branch ${fetched} differs from PR head ${view.headRefOid}`);
else {
  // Reuse the repository's own provenance validator instead of re-implementing trailer rules.
  const { validateRange } = await import(pathToFileURL(path.join(root, 'scripts', 'commit-provenance.mjs')).href);
  const base = git(['merge-base', 'refs/remotes/origin/master', view.headRefOid]);
  try { validateRange(base, view.headRefOid, root); } catch (error) { problems.push(`provenance: ${error.message}`); }
}

console.log(JSON.stringify({ pr, head: view.headRefOid, checks: checks.length, unresolved, problems }, null, 2));
if (problems.length) process.exit(1);
if (!enqueue) process.exit(0);

gh(['pr', 'comment', String(pr), '--repo', REPO, '--body-file', noteFile]);
const result = JSON.parse(gh(['api', 'graphql', '-f',
  'query=mutation($id:ID!,$oid:GitObjectID!){enqueuePullRequest(input:{pullRequestId:$id,expectedHeadOid:$oid}){mergeQueueEntry{position state}}}',
  '-f', `id=${view.id}`, '-f', `oid=${view.headRefOid}`]));
console.log(JSON.stringify(result.data.enqueuePullRequest.mergeQueueEntry));
