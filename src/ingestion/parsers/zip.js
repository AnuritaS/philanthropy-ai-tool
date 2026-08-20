/**
 * Minimal ZIP reader — enough of the format to open an .xlsx.
 *
 * An xlsx is a ZIP of XML parts. Reading one needs the central directory and
 * DEFLATE, both of which Node already provides through zlib, so this avoids a
 * third-party spreadsheet dependency for a format we only ever read.
 */

import { inflateRawSync } from 'node:zlib';

const EOCD_SIG = 0x06054b50;
const EOCD64_LOCATOR_SIG = 0x07064b50;
const EOCD64_SIG = 0x06064b50;
const CENTRAL_SIG = 0x02014b50;

/** Scan backwards for the end-of-central-directory record. */
function findEOCD(buf) {
  const max = Math.min(buf.length, 0xffff + 22);
  for (let i = 22; i <= max; i += 1) {
    const pos = buf.length - i;
    if (pos < 0) break;
    if (buf.readUInt32LE(pos) === EOCD_SIG) return pos;
  }
  return -1;
}

/**
 * Read every file entry into a Map of name -> Buffer.
 * Throws on anything it cannot honestly decode rather than returning partial data.
 */
export function readZip(buffer) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const eocd = findEOCD(buf);
  if (eocd < 0) throw new Error('Not a ZIP archive: no end-of-central-directory record.');

  let entryCount = buf.readUInt16LE(eocd + 10);
  let centralOffset = buf.readUInt32LE(eocd + 16);

  // ZIP64: a large or many-entry archive stores the real values elsewhere.
  const locator = eocd - 20;
  if (locator >= 0 && buf.readUInt32LE(locator) === EOCD64_LOCATOR_SIG) {
    const eocd64 = Number(buf.readBigUInt64LE(locator + 8));
    if (eocd64 >= 0 && eocd64 + 56 <= buf.length && buf.readUInt32LE(eocd64) === EOCD64_SIG) {
      entryCount = Number(buf.readBigUInt64LE(eocd64 + 32));
      centralOffset = Number(buf.readBigUInt64LE(eocd64 + 48));
    }
  }

  const files = new Map();
  let p = centralOffset;

  for (let i = 0; i < entryCount; i += 1) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== CENTRAL_SIG) break;

    const method = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);

    if (!name.endsWith('/')) {
      // The local header repeats the name and extra fields at its own lengths.
      const localNameLen = buf.readUInt16LE(localOffset + 26);
      const localExtraLen = buf.readUInt16LE(localOffset + 28);
      const dataStart = localOffset + 30 + localNameLen + localExtraLen;
      const raw = buf.subarray(dataStart, dataStart + compressedSize);

      if (method === 0) files.set(name, Buffer.from(raw));
      else if (method === 8) files.set(name, inflateRawSync(raw));
      else throw new Error(`Unsupported ZIP compression method ${method} for ${name}`);
    }

    p += 46 + nameLen + extraLen + commentLen;
  }

  return files;
}
