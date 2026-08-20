/**
 * Minimal ZIP reader — enough of the format to open an .xlsx.
 *
 * An xlsx is a ZIP of XML parts. Reading one needs the central directory and
 * DEFLATE, which avoids a third-party spreadsheet dependency for a format we
 * only ever read.
 *
 * Inflation goes through DecompressionStream rather than node:zlib so the same
 * code runs in the browser, where the upload actually happens. That makes the
 * reader async; the caller is async anyway, since it starts from File.text().
 */

/** DEFLATE via the platform, present in both Node 18+ and modern browsers. */
async function inflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Node exposes Buffer; the browser does not. Read bytes without depending on it. */
function view(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  throw new TypeError('Expected an ArrayBuffer or a typed array.');
}

const EOCD_SIG = 0x06054b50;
const EOCD64_LOCATOR_SIG = 0x07064b50;
const EOCD64_SIG = 0x06064b50;
const CENTRAL_SIG = 0x02014b50;

/** Scan backwards for the end-of-central-directory record. */
function findEOCD(dv, length) {
  const max = Math.min(length, 0xffff + 22);
  for (let i = 22; i <= max; i += 1) {
    const pos = length - i;
    if (pos < 0) break;
    if (dv.getUint32(pos, true) === EOCD_SIG) return pos;
  }
  return -1;
}

const decoder = new TextDecoder('utf-8');

/**
 * Read every file entry into a Map of name -> Uint8Array.
 * Throws on anything it cannot honestly decode rather than returning partial data.
 */
export async function readZip(input) {
  const bytes = view(input);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEOCD(dv, bytes.length);
  if (eocd < 0) throw new Error('Not a ZIP archive: no end-of-central-directory record.');

  let entryCount = dv.getUint16(eocd + 10, true);
  let centralOffset = dv.getUint32(eocd + 16, true);

  // ZIP64: a large or many-entry archive stores the real values elsewhere.
  const locator = eocd - 20;
  if (locator >= 0 && dv.getUint32(locator, true) === EOCD64_LOCATOR_SIG) {
    const eocd64 = Number(dv.getBigUint64(locator + 8, true));
    if (eocd64 >= 0 && eocd64 + 56 <= bytes.length && dv.getUint32(eocd64, true) === EOCD64_SIG) {
      entryCount = Number(dv.getBigUint64(eocd64 + 32, true));
      centralOffset = Number(dv.getBigUint64(eocd64 + 48, true));
    }
  }

  const files = new Map();
  let p = centralOffset;

  for (let i = 0; i < entryCount; i += 1) {
    if (p + 46 > bytes.length || dv.getUint32(p, true) !== CENTRAL_SIG) break;

    const method = dv.getUint16(p + 10, true);
    const compressedSize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const localOffset = dv.getUint32(p + 42, true);
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen));

    if (!name.endsWith('/')) {
      // The local header repeats the name and extra fields at its own lengths.
      const localNameLen = dv.getUint16(localOffset + 26, true);
      const localExtraLen = dv.getUint16(localOffset + 28, true);
      const dataStart = localOffset + 30 + localNameLen + localExtraLen;
      const raw = bytes.subarray(dataStart, dataStart + compressedSize);

      if (method === 0) files.set(name, raw);
      else if (method === 8) files.set(name, await inflateRaw(raw));
      else throw new Error(`Unsupported ZIP compression method ${method} for ${name}`);
    }

    p += 46 + nameLen + extraLen + commentLen;
  }

  return files;
}
