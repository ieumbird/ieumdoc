#!/usr/bin/env node
// Print Litzio PR merge-queue states, or wait until one of them merges, closes or leaves the queue.
// Usage: node queue-watch.mjs [--wait] [--minutes <max, default 55>] <pr> [<pr> ...]
import { execFileSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const argv = process.argv.slice(2);
const wait = argv.includes('--wait');
const minutesIndex = argv.indexOf('--minutes');
const minutes = minutesIndex >= 0 ? Number(argv[minutesIndex + 1]) : 55;
const prs = argv.filter((value, index) => /^\d+$/.test(value) && (minutesIndex < 0 || index !== minutesIndex + 1)).map(Number);
if (!prs.length) throw new Error('Usage: queue-watch.mjs [--wait] [--minutes <max>] <pr> [<pr> ...]');

const remote = execFileSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8' }).trim();
if (!/github\.com[/:]litzio\/litzio(\.git)?$/.test(remote)) throw new Error('This script only runs inside the litzio/litzio repository');

const read = () => {
  const fields = prs.map(pr => `p${pr}:pullRequest(number:${pr}){number state isInMergeQueue mergeable}`).join(' ');
  const output = execFileSync('gh', ['api', 'graphql', '-f', `query={repository(owner:"litzio",name:"litzio"){${fields}}}`], { encoding: 'utf8' });
  return Object.values(JSON.parse(output).data.repository);
};
const label = pr => pr.state === 'MERGED' ? 'MERGED' : pr.state === 'CLOSED' ? 'CLOSED'
  : pr.isInMergeQueue ? 'QUEUED' : `OPEN (not queued, ${pr.mergeable})`;

let previous = read();
for (const pr of previous) console.log(`#${pr.number} ${label(pr)}`);
if (!wait) process.exit(0);

const deadline = Date.now() + minutes * 60_000;
while (Date.now() < deadline) {
  await sleep(60_000);
  let current;
  try { current = read(); } catch { continue; } // One failed poll must not end the watch.
  const events = current.filter((pr, i) => label(pr) !== label(previous[i]) &&
    (pr.state !== 'OPEN' || (previous[i].isInMergeQueue && !pr.isInMergeQueue)));
  if (events.length) {
    for (const pr of events) console.log(`EVENT #${pr.number} ${label(pr)}${pr.state === 'OPEN' ? ' — left the queue without merging' : ''}`);
    process.exit(0);
  }
  previous = current;
}
console.log(`TIMEOUT after ${minutes} minutes without a merge or queue exit`);
