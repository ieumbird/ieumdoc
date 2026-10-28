import { DiffBudgetError, recoveryDiff, type RecoveryDiffReply } from "./recovery-diff.ts";

self.onmessage = (event: MessageEvent<{ before: string; after: string }>) => {
  let reply: RecoveryDiffReply;
  try { reply = { diff: recoveryDiff(event.data.before, event.data.after) }; }
  catch (error) { reply = { error: error instanceof DiffBudgetError ? "budget" : "failed" }; }
  self.postMessage(reply);
};
