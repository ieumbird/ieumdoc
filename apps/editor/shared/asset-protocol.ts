// Binary POST body is separate from the JSON document Save contract.
export type AssetResponse = { path: string; rollbackToken: string };
export type AssetRollbackRequest = AssetResponse & { documentPath: string };
/** An image chosen on the Host: linked where it is, or copied into assets/ with a rollback receipt. */
export type ImageChoiceRequest = { documentPath: string; source: string };
export type ImageChoiceResponse = { path: string; rollbackToken?: string };
