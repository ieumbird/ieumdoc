import { Plugin } from "@tiptap/pm/state";

/** Even engine commands and NodeView event handlers cannot change a comparison snapshot. */
export function readOnlyDocumentPlugin(): Plugin {
  return new Plugin({ filterTransaction: transaction => !transaction.docChanged });
}
