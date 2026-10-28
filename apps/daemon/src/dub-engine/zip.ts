import { crc32, deflateRawSync } from 'node:zlib';

export type ZipEntry = {
  name: string;
  data: Buffer;
};

/**
 * Creates a standard PKZIP archive Buffer from an array of file entries.
 * Compatible with Windows Explorer, macOS Archive Utility, unzip, and 7-Zip.
 */
export function createZipArchive(entries: ZipEntry[]): Buffer {
  const localHeaders: Buffer[] = [];
  const centralHeaders: Buffer[] = [];
  let offset = 0;

  for (const { name, data } of entries) {
    const cleanName = name.replace(/\\/g, '/').replace(/^\/+/, '');
    const nameBuf = Buffer.from(cleanName, 'utf8');
    const checksum = crc32(data);
    const uncompressedSize = data.length;
    const deflated = deflateRawSync(data);
    const useDeflate = deflated.length < uncompressedSize;
    const compMethod = useDeflate ? 8 : 0;
    const compData = useDeflate ? deflated : data;
    const compSize = compData.length;

    // Local file header: 30 bytes + name
    const local = Buffer.alloc(30 + nameBuf.length);
    local.write('PK\x03\x04', 0);
    local.writeUInt16LE(20, 4);          // version needed to extract (2.0)
    local.writeUInt16LE(0, 6);           // general purpose bit flag
    local.writeUInt16LE(compMethod, 8);  // compression method
    local.writeUInt16LE(0, 10);          // last mod file time
    local.writeUInt16LE(0, 12);          // last mod file date
    local.writeUInt32LE(checksum, 14);   // crc-32
    local.writeUInt32LE(compSize, 18);   // compressed size
    local.writeUInt32LE(uncompressedSize, 22); // uncompressed size
    local.writeUInt16LE(nameBuf.length, 26);   // file name length
    local.writeUInt16LE(0, 28);          // extra field length
    nameBuf.copy(local, 30);

    localHeaders.push(local, compData);

    // Central directory file header: 46 bytes + name
    const central = Buffer.alloc(46 + nameBuf.length);
    central.write('PK\x01\x02', 0);
    central.writeUInt16LE(20, 4);         // version made by
    central.writeUInt16LE(20, 6);         // version needed to extract
    central.writeUInt16LE(0, 8);          // flags
    central.writeUInt16LE(compMethod, 10);// method
    central.writeUInt16LE(0, 12);         // mod time
    central.writeUInt16LE(0, 14);         // mod date
    central.writeUInt32LE(checksum, 16);  // crc-32
    central.writeUInt32LE(compSize, 20);  // compressed size
    central.writeUInt32LE(uncompressedSize, 24); // uncompressed size
    central.writeUInt16LE(nameBuf.length, 28);   // name length
    central.writeUInt16LE(0, 30);         // extra field length
    central.writeUInt16LE(0, 32);         // comment length
    central.writeUInt16LE(0, 34);         // disk number start
    central.writeUInt16LE(0, 36);         // internal file attributes
    central.writeUInt32LE(0, 38);         // external file attributes
    central.writeUInt32LE(offset, 42);    // relative offset of local header
    nameBuf.copy(central, 46);

    centralHeaders.push(central);
    offset += local.length + compData.length;
  }

  const centralDirOffset = offset;
  let centralDirSize = 0;
  for (const c of centralHeaders) {
    centralDirSize += c.length;
  }

  // End of central directory record (EOCD): 22 bytes
  const eocd = Buffer.alloc(22);
  eocd.write('PK\x05\x06', 0);
  eocd.writeUInt16LE(0, 4);                 // number of this disk
  eocd.writeUInt16LE(0, 6);                 // disk where central dir starts
  eocd.writeUInt16LE(entries.length, 8);    // total entries on this disk
  eocd.writeUInt16LE(entries.length, 10);   // total entries
  eocd.writeUInt32LE(centralDirSize, 12);   // size of central directory
  eocd.writeUInt32LE(centralDirOffset, 16); // offset of start of central directory
  eocd.writeUInt16LE(0, 20);                // zip file comment length

  return Buffer.concat([...localHeaders, ...centralHeaders, eocd]);
}
