import { deflateSync } from 'node:zlib';

const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const width = 256;
const height = 256;
const letterScale = 12;
const digitScale = 8;

const glyphs: Record<string, readonly string[]> = {
  0: ['111', '101', '101', '101', '111'],
  1: ['010', '110', '010', '010', '111'],
  2: ['111', '001', '111', '100', '111'],
  3: ['111', '001', '111', '001', '111'],
  4: ['101', '101', '111', '001', '001'],
  5: ['111', '100', '111', '001', '111'],
  6: ['111', '100', '111', '101', '111'],
  7: ['111', '001', '010', '010', '010'],
  8: ['111', '101', '111', '101', '111'],
  9: ['111', '101', '111', '001', '111'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
};

export interface DemoImageSpec {
  readonly initials?: unknown;
  readonly shirtNumber?: unknown;
  readonly primaryColor?: unknown;
  readonly secondaryColor?: unknown;
}

interface NormalizedDemoImageSpec {
  readonly initials: string;
  readonly shirtNumber: number | null;
  readonly primaryColor: string;
  readonly secondaryColor: string;
}

interface RgbColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export function generateDemoPng(spec: DemoImageSpec): Buffer {
  const normalized = normalizeSpec(spec);
  const background = hexToRgb(normalized.primaryColor);
  const foreground = hexToRgb(normalized.secondaryColor);
  const accent = mix(background, foreground, 0.18);
  const pixels = Buffer.alloc(width * height * 4);

  fill(pixels, background);
  drawBorder(pixels, foreground, 10);
  drawBand(pixels, accent, 176, 42);
  drawCenteredText(pixels, normalized.initials, 52, letterScale, foreground);

  if (normalized.shirtNumber !== null) {
    drawCenteredText(pixels, `#${normalized.shirtNumber}`, 182, digitScale, foreground);
  } else {
    drawCenteredText(pixels, 'STAFF', 186, 5, foreground);
  }

  return encodePng(width, height, pixels);
}

export function normalizeSpec(spec: unknown): NormalizedDemoImageSpec {
  if (typeof spec !== 'object' || spec === null) {
    throw new Error('Demo image spec must be an object.');
  }

  const candidate = spec as DemoImageSpec;
  const initials = String(candidate.initials ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 2);
  if (initials.length === 0) {
    throw new Error('Demo image spec requires initials.');
  }

  const shirtNumber =
    candidate.shirtNumber === null || candidate.shirtNumber === undefined
      ? null
      : Number(candidate.shirtNumber);
  if (
    shirtNumber !== null &&
    (!Number.isInteger(shirtNumber) || shirtNumber < 0 || shirtNumber > 99)
  ) {
    throw new Error('Demo image shirtNumber must be an integer between 0 and 99 or null.');
  }

  return {
    initials,
    shirtNumber,
    primaryColor: normalizeHexColor(candidate.primaryColor ?? '#1d4ed8', 'primaryColor'),
    secondaryColor: normalizeHexColor(candidate.secondaryColor ?? '#ffffff', 'secondaryColor'),
  };
}

function encodePng(imageWidth: number, imageHeight: number, rgbaPixels: Buffer): Buffer {
  const scanlineLength = imageWidth * 4 + 1;
  const raw = Buffer.alloc(scanlineLength * imageHeight);

  for (let y = 0; y < imageHeight; y += 1) {
    const rawOffset = y * scanlineLength;
    const pixelOffset = y * imageWidth * 4;
    raw[rawOffset] = 0;
    rgbaPixels.copy(raw, rawOffset + 1, pixelOffset, pixelOffset + imageWidth * 4);
  }

  return Buffer.concat([
    pngSignature,
    chunk('IHDR', ihdr(imageWidth, imageHeight)),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function ihdr(imageWidth: number, imageHeight: number): Buffer {
  const data = Buffer.alloc(13);
  data.writeUInt32BE(imageWidth, 0);
  data.writeUInt32BE(imageHeight, 4);
  data[8] = 8;
  data[9] = 6;
  data[10] = 0;
  data[11] = 0;
  data[12] = 0;
  return data;
}

function chunk(type: string, data: Buffer): Buffer {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function fill(pixels: Buffer, color: RgbColor): void {
  for (let offset = 0; offset < pixels.length; offset += 4) {
    pixels[offset] = color.r;
    pixels[offset + 1] = color.g;
    pixels[offset + 2] = color.b;
    pixels[offset + 3] = 255;
  }
}

function drawBorder(pixels: Buffer, color: RgbColor, thickness: number): void {
  drawRect(pixels, color, 0, 0, width, thickness);
  drawRect(pixels, color, 0, height - thickness, width, thickness);
  drawRect(pixels, color, 0, 0, thickness, height);
  drawRect(pixels, color, width - thickness, 0, thickness, height);
}

function drawBand(pixels: Buffer, color: RgbColor, y: number, bandHeight: number): void {
  drawRect(pixels, color, 10, y, width - 20, bandHeight);
}

function drawCenteredText(
  pixels: Buffer,
  text: string,
  y: number,
  scale: number,
  color: RgbColor,
): void {
  const printable = String(text).toUpperCase();
  const glyphRuns = [...printable]
    .map((character) => glyphs[character] ?? null)
    .filter((glyph) => glyph !== null);
  if (glyphRuns.length === 0) return;

  const totalWidth =
    glyphRuns.reduce((sum, glyph) => sum + glyph[0].length * scale, 0) +
    (glyphRuns.length - 1) * scale;
  let x = Math.floor((width - totalWidth) / 2);

  for (const glyph of glyphRuns) {
    drawGlyph(pixels, glyph, x, y, scale, color);
    x += glyph[0].length * scale + scale;
  }
}

function drawGlyph(
  pixels: Buffer,
  glyph: readonly string[],
  originX: number,
  originY: number,
  scale: number,
  color: RgbColor,
): void {
  for (let row = 0; row < glyph.length; row += 1) {
    for (let column = 0; column < glyph[row].length; column += 1) {
      if (glyph[row][column] === '1') {
        drawRect(pixels, color, originX + column * scale, originY + row * scale, scale, scale);
      }
    }
  }
}

function drawRect(
  pixels: Buffer,
  color: RgbColor,
  x: number,
  y: number,
  rectWidth: number,
  rectHeight: number,
): void {
  const startX = Math.max(0, x);
  const startY = Math.max(0, y);
  const endX = Math.min(width, x + rectWidth);
  const endY = Math.min(height, y + rectHeight);

  for (let pixelY = startY; pixelY < endY; pixelY += 1) {
    for (let pixelX = startX; pixelX < endX; pixelX += 1) {
      const offset = (pixelY * width + pixelX) * 4;
      pixels[offset] = color.r;
      pixels[offset + 1] = color.g;
      pixels[offset + 2] = color.b;
      pixels[offset + 3] = 255;
    }
  }
}

function normalizeHexColor(value: unknown, fieldName: string): string {
  const color = String(value);
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
    throw new Error(`Demo image ${fieldName} must use #RRGGBB format.`);
  }
  return color.toLowerCase();
}

function hexToRgb(color: string): RgbColor {
  return {
    r: Number.parseInt(color.slice(1, 3), 16),
    g: Number.parseInt(color.slice(3, 5), 16),
    b: Number.parseInt(color.slice(5, 7), 16),
  };
}

function mix(left: RgbColor, right: RgbColor, rightWeight: number): RgbColor {
  const leftWeight = 1 - rightWeight;
  return {
    r: Math.round(left.r * leftWeight + right.r * rightWeight),
    g: Math.round(left.g * leftWeight + right.g * rightWeight),
    b: Math.round(left.b * leftWeight + right.b * rightWeight),
  };
}

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let c = index;
  for (let k = 0; k < 8; k += 1) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return c >>> 0;
});

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const spec = process.argv[2] === undefined ? {} : (JSON.parse(process.argv[2]) as unknown);
  process.stdout.write(generateDemoPng(spec as DemoImageSpec));
}
