# DoclingDocument schema

`docling-document-1.10.0.json` is the unmodified official schema from
[docling-core v2.93.0](https://github.com/docling-project/docling-core/blob/v2.93.0/docs/DoclingDocument.json),
retrieved 2026-10-30. Document version 1.10.0 and package version 2.93.0 are
different version domains. The upstream MIT license is retained in `LICENSE`.
The converter uses this schema through Ajv's 2020-12 validator (including tuple
`prefixItems`; Python `(?P<name>` named groups are
translated to equivalent JavaScript `(?<name>` groups on an in-memory copy;
Pydantic's `path` annotation accepts a path string, with resource access checked
separately by the file adapter) and separately checks version,
references and reading-order graph integrity. It does not reimplement Docling.
