# ADR-0011: Code module boundary

- Status: Accepted
- Decision date: 2026-10-30
- Last verified: 2026-10-30 (Docling module and CLI implementation; package boundary tests).
- Authority: owner decisions in [Discussion #766](https://github.com/ieumbird/ieumdoc/discussions/766) and [Discussion #767](https://github.com/ieumbird/ieumdoc/discussions/767), under [AGENTS.md](../../AGENTS.md).

## Decision

The first code module lives in `packages/docling` (`@ieumdoc/docling`), alongside
the existing workspace packages. It depends on the public `@ieumdoc/core` API;
Core neither imports the module nor knows its source format or data. Document
meaning, validation and canonical writing remain in Core, under
[ADR-0002](0002-document-persistence-semantic-ownership.md).

Docling interpretation, conversion policy and correspondence data belong to the
module. Correspondence is a versioned JSON sidecar outside the native document.
Removing the module and its sidecar leaves a complete native MyST document and
its ordinary image assets. Snapshot paths have the lifetime defined by
[ADR-0003](0003-document-addressing-identity-boundary.md); the document hash binds
each new sidecar to exactly one generated document.

The CLI offers thin `ieumdoc docling convert` and `convert-pdf` commands that
delegate conversion, external REST service access and file output to the module.
It does not implement Docling interpretation,
MyST syntax or document semantics. The implemented policy and sidecar contract
are in [Docling conversion](../design/docling-conversion-v1.md).

## Scope and consequences

This records the package, dependency direction, external module data and CLI
boundary demonstrated by the first module. No registration framework, dynamic
loading, marketplace, database or compatibility infrastructure is introduced.
Editor extension points and Host integration will be decided with
[#769](https://github.com/ieumbird/ieumdoc/issues/769); this ADR does not establish
those interfaces. Unsupported source meaning must be reported explicitly by the
converter rather than silently claimed as preserved native meaning.
