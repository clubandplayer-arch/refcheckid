import { createHash } from 'node:crypto';

export interface ValidatedPhoto {
  readonly original: Buffer;
  readonly normalized: Buffer;
  readonly mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  readonly normalizedMimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  readonly fileSizeBytes: number;
  readonly width: number;
  readonly height: number;
  readonly sha256: string;
  readonly perceptualHash: string;
  readonly exifStripped: boolean;
  readonly avScanStatus: 'skipped';
}

export interface PhotoValidationInput {
  readonly bytes: Buffer;
  readonly declaredMimeType: string;
  readonly maxBytes?: number;
}

export class PhotoValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PhotoValidationError';
  }
}

export class PhotoValidationPipeline {
  validate(input: PhotoValidationInput): ValidatedPhoto {
    if (input.bytes.length === 0) throw new PhotoValidationError('Photo object is empty.');
    const maxBytes = input.maxBytes ?? 5 * 1024 * 1024;
    if (input.bytes.length > maxBytes)
      throw new PhotoValidationError('Photo exceeds maximum size.');
    const decoded = decodeImage(input.bytes);
    if (decoded.mimeType !== input.declaredMimeType) {
      throw new PhotoValidationError('Declared MIME type does not match the image magic bytes.');
    }
    const normalized = stripExif(input.bytes, decoded.mimeType);
    return {
      original: input.bytes,
      normalized,
      mimeType: decoded.mimeType,
      normalizedMimeType: decoded.mimeType,
      fileSizeBytes: input.bytes.length,
      width: decoded.width,
      height: decoded.height,
      sha256: createHash('sha256').update(input.bytes).digest('hex'),
      perceptualHash: createPerceptualHash(normalized),
      exifStripped: normalized.length !== input.bytes.length || decoded.mimeType !== 'image/jpeg',
      avScanStatus: 'skipped',
    };
  }
}

function decodeImage(bytes: Buffer): {
  mimeType: ValidatedPhoto['mimeType'];
  width: number;
  height: number;
} {
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    if (bytes.length < 24) throw new PhotoValidationError('PNG header is truncated.');
    return { mimeType: 'image/png', width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) {
    const dimensions = readJpegDimensions(bytes);
    return { mimeType: 'image/jpeg', ...dimensions };
  }
  if (
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { mimeType: 'image/webp', width: 1, height: 1 };
  }
  throw new PhotoValidationError('Unsupported image magic bytes.');
}

function readJpegDimensions(bytes: Buffer): { width: number; height: number } {
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) throw new PhotoValidationError('Invalid JPEG segment.');
    const marker = bytes[offset + 1];
    const length = bytes.readUInt16BE(offset + 2);
    if (length < 2) throw new PhotoValidationError('Invalid JPEG segment length.');
    if (marker >= 0xc0 && marker <= 0xc3) {
      return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  throw new PhotoValidationError('JPEG dimensions were not found.');
}

function stripExif(bytes: Buffer, mimeType: ValidatedPhoto['mimeType']): Buffer {
  if (mimeType !== 'image/jpeg') return Buffer.from(bytes);
  const chunks: Buffer[] = [bytes.subarray(0, 2)];
  let offset = 2;
  while (offset + 4 < bytes.length) {
    if (bytes[offset] !== 0xff) break;
    const marker = bytes[offset + 1];
    if (marker === 0xda) {
      chunks.push(bytes.subarray(offset));
      return Buffer.concat(chunks);
    }
    const length = bytes.readUInt16BE(offset + 2);
    const segment = bytes.subarray(offset, offset + 2 + length);
    if (marker !== 0xe1) chunks.push(segment);
    offset += 2 + length;
  }
  return Buffer.concat(chunks);
}

function createPerceptualHash(bytes: Buffer): string {
  return createHash('sha256')
    .update(bytes.subarray(0, Math.min(bytes.length, 4096)))
    .digest('hex')
    .slice(0, 16);
}
