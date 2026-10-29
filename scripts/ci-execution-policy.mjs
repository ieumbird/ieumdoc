import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { eventDiff, isDocumentationOnly } from './ci-quality-mode.mjs';

const allJobs = () => ({ quality: true, browser: true, http: true, desktop: true, update: true, smartquotes: true });
const inPackage = (path, name) => path.startsWith(`${name}/`);
const editorUpdate = path => ['apps/editor/shared/desktop-bridge.ts',
  'apps/editor/src/shell/SettingsDialog.tsx', 'apps/editor/src/shell/MessageArea.tsx'].includes(path);
const shared = path => ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml'].includes(path) ||
  /^(patches\/|tsconfig[^/]*$|\.github\/workflows\/|scripts\/)/.test(path);
const product = path => ['packages/cli', 'apps/editor', 'packages/core', 'packages/file-commit', 'apps/desktop']
  .some(name => inPackage(path, name));
const known = path => product(path) || shared(path) || path.startsWith('docs/') ||
  path.endsWith('.md') || path.startsWith('.github/ISSUE_TEMPLATE/');
// These files create/configure the parser and diagnostic/footnote tokenizers.
const parserSettings = ['parse.ts', 'serialize.ts', 'footnote.ts', 'literal-syntax.ts']
  .map(name => `packages/core/src/myst/${name}`);

export function selectJobs(eventName, paths) {
  if (!['pull_request', 'merge_group'].includes(eventName) || !paths?.length) return allJobs();
  const full = paths.some(path => shared(path) || !known(path));
  const browser = full || paths.some(path => ['apps/editor', 'packages/core', 'packages/file-commit']
    .some(name => inPackage(path, name)));
  const http = browser || paths.some(path => inPackage(path, 'packages/cli'));
  return {
    quality: !isDocumentationOnly(eventName, paths),
    browser, http,
    desktop: http || paths.some(path => inPackage(path, 'apps/desktop')),
    update: full || paths.some(path => inPackage(path, 'apps/desktop') || editorUpdate(path)),
    // Package manifests cover MyST/markdown-it version declarations; the lockfile
    // covers transitive updates. Keep the installed patch probe separate from Core.
    smartquotes: paths.some(path => ['package.json', 'packages/core/package.json', 'pnpm-lock.yaml',
      'pnpm-workspace.yaml', 'packages/core/test/smartquotes-patch.test.ts'].includes(path) ||
      path.startsWith('patches/') || parserSettings.includes(path)),
  };
}

export async function successfulQueueRun({ repository, sha, token, apiUrl = 'https://api.github.com', fetchRuns = fetch }) {
  if (!token || !/^[a-f0-9]{40}$/.test(sha) || !/^[\w.-]+\/[\w.-]+$/.test(repository)) {
    throw new Error('Missing or invalid GitHub API inputs');
  }
  // Limit the lookup to this CI workflow, not another successful queue workflow.
  const url = `${apiUrl}/repos/${repository}/actions/workflows/ci.yml/runs?event=merge_group&head_sha=${sha}&status=success&per_page=100`;
  const response = await fetchRuns(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Workflow runs API returned ${response.status}`);
  const data = await response.json();
  if (!Array.isArray(data.workflow_runs)) throw new Error('Workflow runs API response has no runs array');
  return data.workflow_runs.find(run => run.event === 'merge_group' && run.head_sha === sha &&
    run.conclusion === 'success' && run.status === 'completed' && typeof run.html_url === 'string' &&
    run.html_url.startsWith('https://')) ?? null;
}

export async function executionPolicy(eventName, event, { sha, repository, token, apiUrl, fetchRuns, git } = {}) {
  if (eventName === 'push' && event.ref === 'refs/heads/master') {
    try {
      const run = await successfulQueueRun({ sha, repository, token, apiUrl, fetchRuns });
      if (run) {
        console.log(`Reusing successful merge_group CI for ${sha}: ${run.html_url}`);
        return { ...Object.fromEntries(Object.keys(allJobs()).map(name => [name, false])), reused: true };
      }
      console.log(`No successful merge_group CI for ${sha}; using full CI.`);
    } catch (error) {
      console.log(`Cannot verify successful merge_group CI; using full CI: ${error.message}`);
    }
    return { ...allJobs(), reused: false };
  }
  const diff = eventDiff(eventName, event, git);
  if (diff) console.log(`Classifying ${eventName} ${diff.range}: ${JSON.stringify(diff.paths)}`);
  return { ...selectJobs(eventName, diff?.paths), reused: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await executionPolicy(process.argv[2], JSON.parse(readFileSync(process.argv[3], 'utf8')), {
    sha: process.env.GITHUB_SHA, repository: process.env.GITHUB_REPOSITORY,
    token: process.env.GITHUB_TOKEN, apiUrl: process.env.GITHUB_API_URL,
  });
  const output = Object.entries(result).map(([name, value]) => `${name}=${value}\n`).join('');
  console.log(output.trim());
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, output);
}
