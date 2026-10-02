// Binary POST body is separate from the JSON document Save contract.
export type AssetResponse = { path: string; rollbackToken: string };
export type AssetRollbackRequest = AssetResponse & { documentPath: string };
