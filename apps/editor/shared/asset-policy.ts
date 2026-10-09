// Local Host v1 transport limits, shared with Browser preflight. No filesystem logic.
/** Image types the Host stores, with the extension of the file it writes. */
export const ASSET_TYPES = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" } as const;
export type AssetMime = keyof typeof ASSET_TYPES;
export const ASSET_FORMATS = "PNG, JPEG, GIF or WebP";
export const MAX_ASSET_BYTES = 10 * 1024 * 1024;

export function isAssetMime(mime: string): mime is AssetMime {
  return Object.hasOwn(ASSET_TYPES, mime);
}
