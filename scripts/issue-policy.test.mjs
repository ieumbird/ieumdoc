import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { load } from 'js-yaml';
import { areas, createIssue, issueForm, labelDefinitions, metadataChanges, types, validateIssue } from './issue-policy.mjs';
import { checkIssueEvent } from './check-issue-event.mjs';

const proposal = { type: 'enhancement', area: 'Editor', summary: '입력 필드의 상태를 명확히 개선', fields: {
  problem: '회색 입력란이 비활성처럼 보인다는 사용자 보고.', experience: '입력 가능 여부를 쉽게 구분할 수 있다.',
} };

test('forms, CLI and checks share required fields, area choices and existing label definitions', () => {
  for (const [type, definition] of Object.entries(types)) {
    assert.deepEqual(load(readFileSync(new URL(`../.github/ISSUE_TEMPLATE/${type}.yml`, import.meta.url), 'utf8')), issueForm(type));
    const fields = Object.fromEntries(definition.fields.filter(item => item.required).map(item => [item.id, item.options?.[0] ?? '확인한 사용자 문제 또는 원하는 결과.']));
    for (const area of areas) {
      const issue = createIssue({ type, area, summary: '구체적인 사용자 문제', fields });
      assert.deepEqual(validateIssue(issue).errors, []);
      assert.ok(issue.labels.every(name => labelDefinitions.some(label => label.name === name)));
      assert.deepEqual(validateIssue({ ...issue, body: issue.body.replace(/^## /gm, '### '), labels: [{ name: `type:${type}` }] }).errors, []);
    }
  }
});

test('unknown reproduction is valid evidence; missing or placeholder content cannot be published', () => {
  const input = { type: 'bug', area: 'Desktop', summary: '일반 실행 시 샘플이 열림', fields: {
    problem: '선택하지 않은 문서가 열린다.', occurrence: '사용자 보고이며 직접 재현하지 않았다.', expected: '사용자가 작업 대상을 선택한다.',
  } };
  assert.deepEqual(validateIssue(createIssue(input)).errors, []);
  for (const occurrence of ['', '_No response_', 'TODO', '미정']) assert.throws(() => createIssue({ ...input, fields: { ...input.fields, occurrence } }), /발생 상황/);
});

test('code and comments cannot forge headings, while logs remain valid evidence', () => {
  const issue = createIssue(proposal);
  const body = '```md\n## 문제\n가짜\n## 기대하는 사용 경험\n가짜\n```\n<!--\n## 문제\n가짜\n-->';
  assert.equal(validateIssue({ ...issue, body }).errors.length, 2);
  const bug = createIssue({ type: 'bug', area: 'CLI', summary: '명령 오류', fields: {
    problem: '명령 실행 중 오류.', occurrence: '```text\nerror: failed\n```', expected: '알려진 입력을 처리한다.',
  } });
  assert.deepEqual(validateIssue(bug).errors, []);
});

test('title and selected area must agree, with exactly one known type and no invented fields', () => {
  const issue = createIssue(proposal);
  assert.match(validateIssue({ ...issue, title: '[UX] 입력란 개선' }).errors.join(), /제목/);
  assert.match(validateIssue({ ...issue, title: 'Desktop: 입력란 개선' }).errors.join(), /서로 다릅니다/);
  for (const labels of [['bug'], ['type:bug', 'type:enhancement'], ['type:constructor'], ['type:toString']]) assert.match(validateIssue({ ...issue, labels }).errors.join(), /type:/);
  assert.throws(() => createIssue({ ...proposal, type: 'constructor' }), /type must be/);
  assert.throws(() => createIssue({ ...proposal, fields: { ...proposal.fields, implementation: '추정 구현' } }), /Unknown field/);
  assert.throws(() => createIssue({ ...proposal, summary: '제목\n다른 제목' }), /single line/);
});

test('deferred decisions keep their status, without disturbing unrelated labels', () => {
  const issue = createIssue({ type: 'decision', area: 'Product', summary: 'Git 지원 여부 검토', fields: {
    background: '비개발자의 원격 문서 관리 요구.', questions: '사용 경험을 분석하고 지원 여부를 정한다.', state: '향후 검토',
  } });
  assert.ok(issue.labels.includes('status:deferred'));
  const prior = { ...issue, labels: ['type:decision', 'area:editor', 'status:needs-decision', 'status:needs-info', 'help wanted'] };
  assert.deepEqual(metadataChanges(prior), { add: ['area:product', 'status:deferred'], remove: ['area:editor', 'status:needs-decision', 'status:needs-info'] });
});

function fakeGitHub(issue, comments = []) {
  const calls = [], api = {};
  for (const name of ['addLabels', 'removeLabel', 'updateComment', 'createComment']) api[name] = async value => { calls.push({ name, value }); };
  api.get = async () => ({ data: issue }); api.listComments = () => {};
  return { calls, github: { rest: { issues: api }, paginate: async () => comments } };
}
const context = { repo: { owner: 'example', repo: 'fixture' }, payload: { issue: { number: 123, title: 'stale payload' } } };
const core = { info() {} };

test('events read the latest issue, deduplicate guidance and clear the repair status after correction', async () => {
  const issue = { ...createIssue(proposal), body: '## 영역\n\nEditor\n\n## 문제\n\n사용자 보고', state: 'open' };
  const first = fakeGitHub(issue);
  await checkIssueEvent({ ...first, context, core });
  assert.ok(first.calls.some(call => call.name === 'addLabels' && call.value.labels.includes('status:needs-info')));
  const comment = first.calls.find(call => call.name === 'createComment').value;
  const comments = [{ id: 5, body: comment.body, user: { login: 'github-actions[bot]' } }];
  const repeated = fakeGitHub(issue, comments);
  await checkIssueEvent({ ...repeated, context, core });
  assert.equal(repeated.calls.filter(call => call.name.includes('Comment')).length, 0);
  const fixed = fakeGitHub({ ...createIssue(proposal), labels: ['type:enhancement', 'area:editor', 'status:needs-info'], state: 'open' }, comments);
  await checkIssueEvent({ ...fixed, context, core });
  assert.ok(fixed.calls.some(call => call.name === 'removeLabel' && call.value.name === 'status:needs-info'));
  assert.equal(fixed.calls.filter(call => call.name === 'updateComment').length, 1);
  assert.ok([...first.calls, ...repeated.calls, ...fixed.calls].every(call => !('title' in call.value)));
  const closed = fakeGitHub({ ...issue, state: 'closed' });
  await checkIssueEvent({ ...closed, context, core });
  assert.deepEqual(closed.calls, []);
});

test('CLI previews offline by default and rejects missing fields before a publish request', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'ieumdoc-issue-cli-'));
  try {
    const file = path.join(directory, 'issue.json'), command = fileURLToPath(new URL('./issues.mjs', import.meta.url));
    writeFileSync(file, JSON.stringify(proposal));
    const preview = spawnSync(process.execPath, [command, 'create', '--input', file], { encoding: 'utf8' });
    assert.equal(preview.status, 0, preview.stderr);
    assert.deepEqual(JSON.parse(preview.stdout), createIssue(proposal));
    writeFileSync(file, JSON.stringify({ ...proposal, fields: { problem: '사용자 보고' } }));
    const rejected = spawnSync(process.execPath, [command, 'create', '--input', file, '--publish'], { encoding: 'utf8' });
    assert.equal(rejected.status, 1);
    assert.match(rejected.stderr, /기대하는 사용 경험/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('the checked-in workflow entry executes the shared checker without a dependency install', async () => {
  const workflow = load(readFileSync(new URL('../.github/workflows/issue-policy.yml', import.meta.url), 'utf8'));
  const script = workflow.jobs.check.steps.find(step => step.with?.script).with.script;
  const run = new (Object.getPrototypeOf(async function () {}).constructor)('github', 'context', 'core', script);
  const fake = fakeGitHub({ ...createIssue(proposal), labels: ['type:enhancement'], state: 'open' });
  const previous = process.env.GITHUB_WORKSPACE;
  try {
    process.env.GITHUB_WORKSPACE = fileURLToPath(new URL('../', import.meta.url));
    await run(fake.github, context, core);
    assert.deepEqual(fake.calls, [{ name: 'addLabels', value: { ...context.repo, issue_number: 123, labels: ['area:editor'] } }]);
  } finally {
    if (previous === undefined) delete process.env.GITHUB_WORKSPACE;
    else process.env.GITHUB_WORKSPACE = previous;
  }
});
