import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// An allowlist: fixtures, tooling Markdown and unknown paths retain full quality.
export function isDocumentationOnly(eventName, paths) {
  return eventName === 'pull_request' && paths.length > 0 && paths.every(path =>
    /^[^/]+\.md$/.test(path) ||
    /^\.github\/[^/]+\.md$/.test(path) ||
    /^docs\/.+\.(md|png|jpg|jpeg|gif|svg|webp|ico|pdf|json)$/.test(path));
}

export function qualityMode(eventName, eventPath) {
  if (eventName !== 'pull_request') {
    execFileSync('git', ['show', '--format=', '--check', 'HEAD'], { stdio: 'pipe' });
    return false;
  }
  const { pull_request: pr } = JSON.parse(readFileSync(eventPath, 'utf8'));
  const base = pr?.base?.sha;
  const head = pr?.head?.sha;
  if (![base, head].every(sha => typeof sha === 'string' && /^[a-f0-9]{40}$/.test(sha))) {
    throw new Error('Expected PR base/head commit SHAs.');
  }
  // Merge-base diff matches PR changes. Disable rename detection so both the
  // removed and added paths must be documentation before a rename can skip tests.
  const range = `${base}...${head}`;
  const paths = execFileSync('git', ['diff', '--name-only', '--no-renames', '-z', range], { encoding: 'utf8' })
    .split('\0').filter(Boolean);
  execFileSync('git', ['diff', '--check', range], { stdio: 'pipe' });
  return isDocumentationOnly(eventName, paths);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const docsOnly = qualityMode(process.argv[2], process.argv[3]);
  const output = `docs_only=${docsOnly}\n`;
  console.log(output.trim());
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, output);
}
