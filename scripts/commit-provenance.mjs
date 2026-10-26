import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const git = (args, options = {}) => execFileSync('git', args, { encoding: 'utf8', ...options });

// Git owns trailer parsing; source matches only detect misplaced/duplicate metadata.
export function validateMessage(message, cwd = process.cwd()) {
  const normalized = message.replace(/\r\n/g, '\n');
  const source = [...normalized.matchAll(/^[\t ]*AI-(?:Agent|Model)[\t ]*:/gim)];
  if (!source.length) return;
  const parsed = git(['interpret-trailers', '--parse'], { cwd, input: normalized });
  const finalBlock = normalized.trimEnd().split(/\n[\t ]*\n/).at(-1);
  for (const key of ['AI-Agent', 'AI-Model']) {
    const mentions = source.filter(match => match[0].trim().toLowerCase().startsWith(key.toLowerCase()));
    const entries = parsed.split('\n').filter(line => line.toLowerCase().startsWith(`${key.toLowerCase()}:`));
    if (mentions.length !== 1 || entries.length !== 1) {
      throw new Error(`${key} must occur exactly once and be readable by Git in the final contiguous trailer block`);
    }
    const line = normalized.split('\n').find(line => line.startsWith(`${key}: `));
    if (!line || !finalBlock.split('\n').includes(line) || line !== entries[0] || !line.slice(key.length + 2).trim()) {
      throw new Error(`${key} must have a nonempty value in the final contiguous trailer block (no blank lines between trailers)`);
    }
    if (key === 'AI-Model' && !/^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._/-]*$/.test(line.slice(key.length + 2))) {
      throw new Error('AI-Model must be a canonical <provider>/<model> identifier');
    }
  }
}

export function validateRange(base, head, cwd = process.cwd()) {
  // Only object IDs: event data never becomes shell code or Git options.
  for (const sha of [base, head]) {
    if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(sha)) throw new Error('Expected full base/head commit SHAs');
    git(['cat-file', '-e', `${sha}^{commit}`], { cwd });
  }
  // Includes authored merge commits; excludes every commit reachable from base.
  const commits = git(['rev-list', `${base}..${head}`], { cwd }).trim().split('\n').filter(Boolean);
  const failures = [];
  for (const sha of commits) {
    try {
      validateMessage(git(['show', '-s', '--format=%B', sha], { cwd }), cwd);
    } catch (error) {
      failures.push(`${sha}: ${error.message}`);
    }
  }
  if (failures.length) throw new Error(failures.join('\n'));
  return commits;
}

export function validatePullRequestEvent(event, cwd = process.cwd()) {
  return validateRange(event.pull_request?.base?.sha, event.pull_request?.head?.sha, cwd);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [command, file] = process.argv.slice(2);
    if (command === 'message' && file) validateMessage(readFileSync(file, 'utf8'));
    else if (command === 'pr-event' && file) {
      const commits = validatePullRequestEvent(JSON.parse(readFileSync(file, 'utf8')));
      console.log(`AI provenance: checked ${commits.length} PR-only commits (including authored merges).`);
    } else throw new Error('Usage: commit-provenance.mjs message <file> | pr-event <event.json>');
  } catch (error) {
    console.error(`AI provenance: ${error.message}`);
    process.exitCode = 1;
  }
}
