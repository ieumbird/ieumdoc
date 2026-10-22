import { ASSET_FORMATS, isAssetMime, MAX_ASSET_BYTES, type AssetMime } from "../shared/asset-policy.ts";

export class ImageValidationError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}
const UNSUPPORTED = `Only ${ASSET_FORMATS} images are supported.`;

/** MIME plus the complete container of that format; no SVG, decoder, or image transformation. */
export function validateImage(mime: string, bytes: Buffer): asserts mime is AssetMime {
  if (!isAssetMime(mime)) throw new ImageValidationError(UNSUPPORTED);
  if (bytes.length === 0) throw new ImageValidationError("The image is empty.");
  if (bytes.length > MAX_ASSET_BYTES) throw new ImageValidationError(`Image exceeds the ${MAX_ASSET_BYTES / 1024 / 1024} MiB limit.`, 413);
  const format = FORMATS[mime];
  if (!format.complete(bytes)) throw new ImageValidationError(`The image is not a complete ${format.name} file.`);
}

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const JPEG_EOI = Buffer.from([0xff, 0xd9]);

const FORMATS: Record<AssetMime, { name: string; complete(bytes: Buffer): boolean }> = {
  // Signature, IHDR first, image data, and IEND exactly at the end.
  "image/png": { name: "PNG", complete(bytes) {
    if (!bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return false;
    let at = 8, imageData = false;
    while (at + 12 <= bytes.length) {
      const size = bytes.readUInt32BE(at);
      const type = bytes.toString("ascii", at + 4, at + 8);
      if (size > bytes.length - at - 12) return false;
      if (at === 8 && (type !== "IHDR" || size !== 13 || !bytes.readUInt32BE(at + 8) || !bytes.readUInt32BE(at + 12))) return false;
      if (type === "IDAT" && size > 0) imageData = true;
      at += size + 12;
      if (type === "IEND") return size === 0 && imageData && at === bytes.length;
    }
    return false;
  } },
  // SOI, length-framed segments with a frame header before the first scan, and EOI after it.
  // Bytes after EOI, which some cameras append, are kept: viewers ignore them.
  "image/jpeg": { name: "JPEG", complete(bytes) {
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return false;
    let at = 2, frame = false;
    while (at + 4 <= bytes.length) {
      if (bytes[at] !== 0xff) return false;
      const marker = bytes[at + 1];
      if (marker === 0xff) { at++; continue; } // Fill byte.
      const size = bytes.readUInt16BE(at + 2);
      if (size < 2 || size > bytes.length - at - 2) return false;
      // SOF0–SOF15 with a non-zero width; DHT, JPG and DAC share the range.
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) frame = size >= 8 && bytes.readUInt16BE(at + 7) > 0;
      // Scan data escapes 0xFF, so the first FF D9 after a scan header is EOI.
      if (marker === 0xda) return frame && bytes.indexOf(JPEG_EOI, at + 2 + size) !== -1;
      at += 2 + size;
    }
    return false;
  } },
  // Header and screen size, then extension and image blocks of sub-blocks, up to the trailer.
  "image/gif": { name: "GIF", complete(bytes) {
    const header = bytes.toString("ascii", 0, 6);
    if ((header !== "GIF87a" && header !== "GIF89a") || bytes.length < 13 || !bytes.readUInt16LE(6) || !bytes.readUInt16LE(8)) return false;
    const colorTable = (flags: number) => flags & 0x80 ? 3 << ((flags & 7) + 1) : 0;
    const subBlocks = (from: number) => {
      let at = from;
      while (at < bytes.length && bytes[at] !== 0) at += bytes[at] + 1;
      return at + 1;
    };
    let at = 13 + colorTable(bytes[10]), image = false;
    while (at < bytes.length) {
      if (bytes[at] === 0x3b) return image;
      if (bytes[at] === 0x21) at = subBlocks(at + 2);
      // Descriptor, local color table and LZW code size, then the data.
      else if (bytes[at] === 0x2c && at + 10 <= bytes.length) { at = subBlocks(at + 10 + colorTable(bytes[at + 9]) + 1); image = true; }
      else return false;
    }
    return false;
  } },
  // A RIFF WEBP container as long as the file, of whole chunks holding image data.
  "image/webp": { name: "WebP", complete(bytes) {
    if (bytes.length < 20 || bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WEBP" || bytes.readUInt32LE(4) !== bytes.length - 8) return false;
    let at = 12, image = false;
    while (at + 8 <= bytes.length) {
      const type = bytes.toString("ascii", at, at + 4), size = bytes.readUInt32LE(at + 4);
      if (size > bytes.length - at - 8) return false;
      if ((type === "VP8 " || type === "VP8L" || type === "ANMF") && size > 0) image = true;
      at += 8 + size + (size & 1);
    }
    return image && at === bytes.length;
  } },
};
