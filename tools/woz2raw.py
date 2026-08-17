#!/usr/bin/env python3
"""Convert a WOZ 2.0 file (3.5" 800K, 512-byte sectors) to a raw block image.

Mirrors gssquared's Woz (GCR 6&2 decode_track + decode_sector_62) but generalised
to 512-byte ProDOS sectors (the C++ decoder hardcodes 256-byte 5.25" sectors).

WOZ 2.0 layout (per gssquared woz.cpp):
  12-byte header (8 magic + 4 CRC)
  chunks from byte 12:  4-byte LE id + 4-byte LE size + payload
    INFO  0x4F464E49
    TMAP  0x50414D54   160 quarter-track entries (0xFF = empty)
    TRKS  0x50414D4B   array of 8-byte descriptors:
                          starting_block u16, block_count u16, bit_count u32
                       bit data lives at file_offset = starting_block * 512
    META  0x4D455441

Usage:  python woz2raw.py input.woz output.img [sector_size]
"""
import sys

# denibble_table: nibble (8-bit) -> 6-bit data value (mirror of woz_denibble_table).
DENIB = [
0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x01,0x00,0x00,0x02,0x03,0x00,0x04,0x05,0x06,
0x00,0x00,0x00,0x00,0x00,0x00,0x07,0x08,0x00,0x00,0x00,0x09,0x0A,0x0B,0x0C,0x0D,
0x00,0x00,0x0E,0x0F,0x10,0x11,0x12,0x13,0x00,0x14,0x15,0x16,0x17,0x18,0x19,0x1A,
0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x1B,0x00,0x1C,0x1D,0x1E,
0x00,0x00,0x00,0x1F,0x00,0x00,0x20,0x21,0x00,0x22,0x23,0x24,0x25,0x26,0x27,0x28,
0x00,0x00,0x00,0x00,0x00,0x29,0x2A,0x2B,0x00,0x2C,0x2D,0x2E,0x2F,0x30,0x31,0x32,
0x00,0x00,0x33,0x34,0x35,0x36,0x37,0x38,0x00,0x39,0x3A,0x3B,0x3C,0x3D,0x3E,0x3F,
]


class Cursor:
    """LSS-style bit cursor over a WOZ track bit-stream (wraps at bit_count)."""
    __slots__ = ("bits", "bit_count", "pos", "consumed")
    def __init__(self, bits, bit_count):
        self.bits = bits
        self.bit_count = bit_count
        self.pos = 0
        self.consumed = 0
    def read_bit(self):
        i = self.pos % self.bit_count
        self.pos += 1
        self.consumed += 1
        return (self.bits[i >> 3] >> (7 - (i & 7))) & 1
    def read_nibble(self):
        sh = 0
        while True:
            sh = ((sh << 1) | self.read_bit()) & 0xFF
            if sh & 0x80:
                return sh


def decode_sector(nbuf, sector_size):
    """POSTNB16 reassembly of 6&2 nibbles into `sector_size` bytes.

    gssquared layout for a 256-byte sector: nbuf[0..255] (nbuf1) + nbuf[256..341]
    (nbuf2, 86 nibbles). Byte y = nbuf1[y] with two LSB-first bits pulled from
    nbuf2. Generalised to any sector size S: first S nibbles are nbuf1, the
    remaining ceil(S*8/6)-S nibbles are nbuf2.
    """
    n_nib = (sector_size * 8 + 5) // 6
    nbuf2 = list(nbuf[sector_size:n_nib])
    out = bytearray(sector_size)
    xlen = len(nbuf2)
    if xlen == 0:
        for y in range(sector_size):
            out[y] = nbuf[y] & 0xFF
        return bytes(out)
    x = xlen - 1
    for y in range(sector_size):
        a = nbuf[y] & 0x3F
        c = nbuf2[x] & 1; nbuf2[x] >>= 1; a = (a << 1) | c
        c = nbuf2[x] & 1; nbuf2[x] >>= 1; a = (a << 1) | c
        out[y] = a & 0xFF
        x -= 1
        if x < 0:
            x = xlen - 1
    return bytes(out)


def decode_track(bits, bit_count, sector_size, max_sector=64):
    """Walk one track; return {logical_sector: sector_bytes}."""
    c = Cursor(bits, bit_count)
    max_bits = bit_count * 2
    found = {}
    n0 = n1 = n2 = 0
    while c.consumed < max_bits and len(found) < max_sector:
        n2 = n1; n1 = n0; n0 = c.read_nibble()
        if not (n2 == 0xD5 and n1 == 0xAA and n0 == 0x96):
            continue
        e = [c.read_nibble() for _ in range(8)]
        # 4&4 address field: gssquared decodes vol/trk/sec/csum as
        #   ((e[2k] & 0x55) << 1) | (e[2k+1] & 0x55)
        vol  = ((e[0] & 0x55) << 1) | (e[1] & 0x55)
        trk  = ((e[2] & 0x55) << 1) | (e[3] & 0x55)
        sec  = ((e[4] & 0x55) << 1) | (e[5] & 0x55)
        csum = ((e[6] & 0x55) << 1) | (e[7] & 0x55)
        if csum != (vol ^ trk ^ sec):
            n0 = n1 = n2 = 0; continue
        if sec >= max_sector:
            n0 = n1 = n2 = 0; continue
        c.read_nibble(); c.read_nibble(); c.read_nibble()  # addr epilogue DE AA EB
        d0 = d1 = d2 = 0
        hunt = c.consumed + 64 * 8
        got = False
        while c.consumed < hunt:
            d2 = d1; d1 = d0; d0 = c.read_nibble()
            if d2 == 0xD5 and d1 == 0xAA and d0 == 0xAD:
                got = True; break
        if not got:
            n0 = n1 = n2 = 0; continue
        n_nib = (sector_size * 8 + 5) // 6
        nbuf = [0] * (n_nib + 1)
        csum = 0
        for i in range(n_nib):
            nbuf[i] = csum ^ DENIB[c.read_nibble()]
            csum = nbuf[i]
        tail = DENIB[c.read_nibble()]
        if (csum ^ tail) != 0:
            n0 = n1 = n2 = 0; continue
        found[sec] = decode_sector(nbuf, sector_size)
        n0 = n1 = n2 = 0
    return found


def main():
    if len(sys.argv) < 3:
        print(__doc__); sys.exit(1)
    inp, outp = sys.argv[1], sys.argv[2]
    sector_size = int(sys.argv[3]) if len(sys.argv) > 3 else 512
    data = open(inp, "rb").read()
    if data[:4] not in (b"WOZ2", b"WOZ1"):
        print("not a WOZ file", file=sys.stderr); sys.exit(2)

    tmap = None
    trks_payload = None   # raw TRKS chunk payload (array of 8-byte descriptors)
    trks_data_off = None  # file offset of TRKS payload
    pos = 12
    while pos + 8 <= len(data):
        cid = int.from_bytes(data[pos:pos+4], "little")
        csize = int.from_bytes(data[pos+4:pos+8], "little")
        d_off = pos + 8
        if d_off + csize > len(data):
            break
        if cid == 0x50414D54:      # TMAP
            tmap = list(data[d_off:d_off+csize])
        elif cid == 0x534B5254:   # TRKS
            trks_payload = data[d_off:d_off+csize]
            trks_data_off = d_off
        elif cid == 0x4F464E49:   # INFO
            pass
        pos = d_off + csize

    if not tmap:
        print("no TMAP chunk", file=sys.stderr); sys.exit(3)
    if not trks_payload:
        print("no TRKS chunk", file=sys.stderr); sys.exit(3)

    # TMAP: 160 quarter-track entries. Build quarter-track -> track-index map.
    present_trk = set()
    for q in range(min(160, len(tmap))):
        if tmap[q] != 0xFF:
            present_trk.add(tmap[q])
    if not present_trk:
        print("TMAP all empty", file=sys.stderr); sys.exit(4)
    max_trk = max(present_trk)
    print(f"TMAP: tracks {sorted(present_trk)} (max {max_trk})", file=sys.stderr)

    image = bytearray()
    total_secs = 0
    for trk in sorted(present_trk):
        if trk > len(trks_payload) // 8 - 1:
            print(f"  track {trk}: no TRK descriptor", file=sys.stderr)
            continue
        e = trks_payload[trk*8:trk*8+8]
        starting_block = int.from_bytes(e[0:2], "little")
        bit_count = int.from_bytes(e[4:8], "little")
        if starting_block == 0 and bit_count == 0:
            print(f"  track {trk}: empty descriptor", file=sys.stderr)
            continue
        byte_offset = starting_block * 512
        byte_count = (bit_count + 7) // 8
        if byte_offset + byte_count > len(data):
            print(f"  track {trk}: data out of bounds", file=sys.stderr)
            continue
        bits = data[byte_offset:byte_offset+byte_count]
        secs = decode_track(bits, bit_count, sector_size)
        n = (max(secs.keys()) + 1) if secs else 0
        for s in range(n):
            image += secs.get(s, b"\x00" * sector_size)
        total_secs += len(secs)
        print(f"  track {trk}: {len(secs)} sectors ({bit_count} bits)", file=sys.stderr)

    print(f"Total: {len(image)} bytes ({len(image)//1024} KB), {total_secs} sectors",
          file=sys.stderr)
    open(outp, "wb").write(image)
    print(f"Wrote {outp}", file=sys.stderr)


if __name__ == "__main__":
    main()
