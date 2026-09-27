// The ministry wants each request file "comprimido según el algoritmo ZIP y
// codificado en Base64": a ZIP archive with one entry. Written by hand (the
// format is small) with the runtime's deflate, so there is no dependency.

let table: Uint32Array | null = null;
function crc32(data: Uint8Array): number {
  if (!table) {
    table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const b of data) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart])
    .stream()
    .pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** A ZIP archive holding `content` as `name` (deflated). */
export async function zipSingle(name: string, content: string): Promise<Uint8Array> {
  const raw = new TextEncoder().encode(content);
  const fileName = new TextEncoder().encode(name);
  const packed = await deflateRaw(raw);
  const crc = crc32(raw);

  const local = new DataView(new ArrayBuffer(30));
  local.setUint32(0, 0x04034b50, true); // local file header
  local.setUint16(4, 20, true); // version needed (2.0: deflate)
  local.setUint16(6, 0x0800, true); // flags: UTF-8 names
  local.setUint16(8, 8, true); // method: deflate
  local.setUint16(10, 0, true); // time
  local.setUint16(12, 0x21, true); // date: 1980-01-01
  local.setUint32(14, crc, true);
  local.setUint32(18, packed.length, true);
  local.setUint32(22, raw.length, true);
  local.setUint16(26, fileName.length, true);
  local.setUint16(28, 0, true);

  const central = new DataView(new ArrayBuffer(46));
  central.setUint32(0, 0x02014b50, true); // central directory header
  central.setUint16(4, 20, true); // made by
  central.setUint16(6, 20, true); // needed
  central.setUint16(8, 0x0800, true);
  central.setUint16(10, 8, true);
  central.setUint16(12, 0, true);
  central.setUint16(14, 0x21, true);
  central.setUint32(16, crc, true);
  central.setUint32(20, packed.length, true);
  central.setUint32(24, raw.length, true);
  central.setUint16(28, fileName.length, true);
  // extra, comment, disk, internal and external attributes: 0
  central.setUint32(42, 0, true); // offset of the local header

  const localSize = 30 + fileName.length + packed.length;
  const centralSize = 46 + fileName.length;
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); // end of central directory
  end.setUint16(8, 1, true); // entries on this disk
  end.setUint16(10, 1, true); // entries
  end.setUint32(12, centralSize, true);
  end.setUint32(16, localSize, true);

  const out = new Uint8Array(localSize + centralSize + 22);
  let at = 0;
  for (const part of [
    new Uint8Array(local.buffer),
    fileName,
    packed,
    new Uint8Array(central.buffer),
    fileName,
    new Uint8Array(end.buffer),
  ]) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

export function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** What goes in <solicitud>: the XML zipped and in Base64. */
export async function packRequest(xml: string): Promise<string> {
  return toBase64(await zipSingle("solicitud.xml", xml));
}
