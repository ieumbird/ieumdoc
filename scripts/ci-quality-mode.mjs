import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// An allowlist: fixtures, tooling Markdown and unknown paths retain full quality.
export function isDocumentationOnly(eventName, paths) {
  return ['pull_request', 'merge_group'].includes(eventName) && paths.length > 0 && paths.every(path =>
    /^[^/]+\.md$/.test(path) ||
    /^\.github\/[^/]+\.md$/.test(path) ||
    /^docs\/.+\.(md|png|jpg|jpeg|gif|svg|webp|ico|pdf|json)$/.test(path));
}

export function eventRange(eventName, event) {
  const base = eventName === 'merge_group' ? event.merge_group?.base_sha : event.pull_request?.base?.sha;
  const head = eventName === 'merge_group' ? event.merge_group?.head_sha : event.pull_request?.head?.sha;
  if (!['pull_request', 'merge_group'].includes(eventName)) return null;
  if (![base, head].every(sha => typeof sha === 'string' && /^[a-f0-9]{40}$/.test(sha))) {
    throw new Error('Expected event base/head commit SHAs.');
  }
  // Merge-base diff matches PR changes. Disable rename detection so both the
  // removed and added paths must be documentation before a rename can skip tests.
  // A queue group uses its entire base..head tree diff, including every PR.
  return `${base}${eventName === 'merge_group' ? '..' : '...'}${head}`;
}

export function eventDiff(eventName, event, git = args => execFileSync('git', args, { encoding: 'utf8' })) {
  try {
    const range = eventRange(eventName, event);
    if (!range) return null;
    return { range, paths: git(['diff', '--name-only', '--no-renames', '-z', range]).split('\0').filter(Boolean) };
  } catch (error) {
    console.log(`Cannot calculate ${eventName} diff; using full CI: ${error.message}`);
    return null;
  }
}

export function qualityMode(eventName, eventPath) {
  const event = JSON.parse(readFileSync(eventPath, 'utf8'));
  const diff = eventDiff(eventName, event);
  // A whitespace failure is an error, never a reason to emit docs-only success.
  execFileSync('git', diff ? ['diff', '--check', diff.range] : ['show', '--format=', '--check', 'HEAD'], { stdio: 'pipe' });
  return diff ? isDocumentationOnly(eventName, diff.paths) : false;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const docsOnly = qualityMode(process.argv[2], process.argv[3]);
  const output = `docs_only=${docsOnly}\n`;
  console.log(output.trim());
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, output);
}
