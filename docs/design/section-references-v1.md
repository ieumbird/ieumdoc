# Section references v1

Equations, Figures and Tables could be referenced; sections could not. A `{ref}` reference or a `(label)=` target kept its paragraph or block read-only, so authors had to write both by hand. Section references close that gap with MyST's own syntax.

## Representation

MyST labels a section with a `(label)=` target line directly before its heading and references it with `{ref}`label``. myst-parser 1.7.4 has no in-heading label syntax (`# Title {#id}` stays text). So a section label is its own top-level block, and Core projects it as `{ block: "target", label }`.

Core's section rule already counts targets before a heading as part of that section. Moving or deleting a section therefore carries its label. No persistent identity is introduced (ADR-0003): a label is document text, as for Equations, Figures and Tables.

## Core

- `insertTarget(document, index, label)` inserts a target.
- `updateLabel` renames one. A target cannot be emptied; remove it with `removeBlock`.
- Labels follow the existing rules: `labelError`, a MyST identifier, addressable by `{ref}`, and not taken by another target.
- MyST reads a target line only for 1-100 of `[a-zA-Z0-9|@<>*./_\-+:]`. Other labels, Korean included, would reload as a paragraph. `targetLabelError` restates that rule without the MyST dependency so the Editor can apply it before Save; a Core test pins it to the parser.
- `{ref}` without display text joins `{eq}` and `{numref}` as editable inline content. Display-text forms (`{ref}`Text <label>``) stay read-only.

## Editor

- A target shows as a `§ label` line above its heading. Its Edit form renames it and reports rule or duplicate errors before Save. Deleting the line removes the label.
- The slash menu lists labeled sections and unlabeled headings. Picking an unlabeled heading inserts a `sec-<slug>` target and the reference in one transaction, so one Undo step removes both. The slug uses the heading's ASCII letters and digits; otherwise the label is a numbered `sec-n`.
- A heading's block menu adds a label without a reference.
- A reference chip shows `§` and the heading text, as MyST renders `{ref}`, and goes to the heading.
- Save expresses labels with the existing insert, delete, order and label edits. A target is renamed, never cleared first, so one Save cannot swap a target's label with another block's.

## Scope

- Renaming a label does not rename its references, as for other labels.
- `[](#label)` links stay ordinary links and read-only: Core does not promote links to references.
- References to targets before blocks other than headings, numbered section references (`{numref}` to a section), display text, and links to other documents are not authored.

## CLI

`ieumdoc insert-target <file> --at <index> --label <label>` inserts a target. `update-label` renames a target. `inspect` shows `target label="…"`. References use `--content` with `{"kind":"reference","role":"ref","label":"…"}`.
