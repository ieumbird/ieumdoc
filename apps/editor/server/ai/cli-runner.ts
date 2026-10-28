// Spike command shim. Only the Codex child's environment points at this temporary shim.
// It delegates document semantics to the existing CLI; receipts are observation, not attestation.
export const CLI_RUNNER = String.raw`
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const args = process.argv.slice(2);
const command = args[0];
const inside = (root, file) => { const p = path.relative(root, file); return p !== '..' && !p.startsWith('..' + path.sep) && !path.isAbsolute(p); };
let file, revision;
let exitCode = 1;
(async () => {
try {
  const help = args.includes('--help') || args.includes('-h') || command === 'help' || command === '--version' || args.length === 0;
  if (!help) {
    if (!['create', 'apply-batch', 'check', 'inspect'].includes(command)) throw Error('Use create, apply-batch, check, inspect only.');
    file = path.resolve(args[1] || '');
    const actual = fs.existsSync(file) ? fs.realpathSync(file) : path.join(fs.realpathSync(path.dirname(file)), path.basename(file));
    if (['create', 'apply-batch'].includes(command)) {
      if (actual !== process.env.IEUMDOC_AI_TARGET) throw Error('Only the new report target may be written.');
    } else if (![process.env.IEUMDOC_AI_ROOT, process.env.IEUMDOC_AI_OUTPUT].some(root => inside(root, actual))) throw Error('Read is outside the selected folders.');
    if (command === 'apply-batch' && (!args.includes('--format') || args[args.indexOf('--format') + 1] !== 'json')) throw Error('apply-batch requires --format json for Host revision verification.');
  }
  const { runCli } = await import(pathToFileURL(process.env.IEUMDOC_CLI_ENTRY).href);
  let printed = '';
  const original = process.stdout.write;
  process.stdout.write = function(chunk, ...rest) { printed += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : chunk; return original.call(this, chunk, ...rest); };
  try { exitCode = runCli(args); } finally { process.stdout.write = original; }
  if (!exitCode && !args.includes('--dry-run') && ['create','apply-batch'].includes(command)) {
    revision = command === 'apply-batch' ? JSON.parse(printed).revision : crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  }
} catch (error) { exitCode = 1; process.stderr.write(error.message + '\n'); }
console.log('IEUMDOC_RECEIPT ' + JSON.stringify({ command, file, exitCode, revision, dryRun: args.includes('--dry-run') }));
process.exitCode = exitCode;
})();
`;
