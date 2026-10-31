import { metadataChanges, validateIssue } from './issue-policy.mjs';

const marker = '<!-- litzio-issue-policy -->';

/** Called by github-script with trusted checked-out code; issue text is always data. */
export async function checkIssueEvent({ github, context, core }) {
  const number = context.payload.issue?.number;
  if (!Number.isSafeInteger(number) || number <= 0) throw new Error('Issue event requires a valid issue number');
  const params = { ...context.repo, issue_number: number };
  // Read current content, not a stale event payload queued behind another edit.
  const { data: issue } = await github.rest.issues.get(params);
  if (issue.pull_request || issue.state !== 'open') return;
  const result = validateIssue(issue);
  const changes = metadataChanges(issue, result);
  if (changes.add.length) await github.rest.issues.addLabels({ ...params, labels: changes.add });
  for (const name of changes.remove) await github.rest.issues.removeLabel({ ...params, name });
  const comments = await github.paginate(github.rest.issues.listComments, params);
  const comment = comments.find(item => item.user?.login === 'github-actions[bot]' && item.body?.startsWith(marker));
  const body = result.errors.length
    ? `${marker}\n이슈 작성 정보의 보완이 필요합니다.\n\n${result.errors.map(error => `- ${error}`).join('\n')}\n\n[작성 규칙](https://github.com/${context.repo.owner}/${context.repo.repo}/blob/master/docs/contributing/issues.md). 관찰 내용은 보존하고, 모르는 정보는 미확인임을 적어주세요.`
    : `${marker}\n제목·유형·필수 항목 검사를 통과했습니다. 이 검사는 사실 여부나 구현 착수를 승인하지 않습니다.`;
  if (comment && comment.body !== body) await github.rest.issues.updateComment({ ...context.repo, comment_id: comment.id, body });
  else if (!comment && result.errors.length) await github.rest.issues.createComment({ ...params, body });
  core.info(result.errors.length ? `${number}: ${result.errors.join(' ')}` : `${number}: issue policy passed`);
}
