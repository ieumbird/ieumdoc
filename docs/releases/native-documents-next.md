# Native documents — next release notice

- Status: Draft
- Last verified: 2026-10-14 (compatibility notice for #232; no release published).
- Scope: next release after beta.3; [Native document support](../design/document-support-v1.md).

IeumDoc now accepts only native documents with numeric `ieumdoc: 1` in leading YAML frontmatter and a fully supported body. Earlier-version documents without this marker are rejected too. Migration and automatic marker insertion are not provided. Adding the marker alone does not make unsupported content valid.

Create a document through New file or `ieumdoc create <file>`. General Markdown partial editing, unsupported read-only opening and Edit source/`replace-block-source` have been removed. Whole-document Source remains an applied-content preview. Supported authoring, revision conflicts and Save → Reload remain available.

Desktop uses a new `sample-native-v1` sample directory, preserving earlier `sample` folders and user copies. This note does not change the published beta.3 release record or authorize release/update publication.
