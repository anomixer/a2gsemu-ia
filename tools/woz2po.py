#!/usr/bin/env python3
"""Convert a WOZ2 3.5" 800K ProDOS disk to a raw 512-byte block image (.po).

For each track: latch the GCR bit-stream into nibbles (bit-7 latch), scan
every position for the data prologue D5 AA AD, read the following 683
6&2-encoded nibbles, decode to 512 bytes. Repeat 10x per track, concatenate.
"""
import sys

ENCODE = [
    0x96,0x97,0x9A,0x9B,0x9D,0x9E,0x9F,0xA6,0xA7,0xAB,0xAC,0xAD,0xAE,0xAF,
    0xB2,0xB3,0xB4,0xB5,0xB6,0xB7,0xB9,0xBA,0xBB,0xBC,0xBD,0xBE,0xBF,0xCB,
    0xCD,0xCE,0xCF,0xD3,0xD6,0xD7,0xD9,0xDA,0xDB,0xDC,0xDD,0xDE,0xDF,0xE5,
    0xE6,0xE7,0xE9,0xEA,0xEB,0xEC,0xED,0xEE,0xEF,0xF2,0xF3,0xF4,0xF5,0xF6,
    0xF7,0xF9,0xFA,0xFB,0xFC,0xFD,0xFE,0xFF,
]
DENIB = [0] * 256
for v, e in enumerate(ENCODE):
    DENIB[e] = v
VALID = set(ENCODE)

NIBBLES_PER_SECTOR = 683
SECTORS_PER_TRACK = 10
SECTOR_SIZE = 512


def load_tracks(path):
    data = open(path, "rb").read()
    assert data[:4] == b'WOZ2', "not WOZ2"
    pos = 12
    tmap = None
    trks = None
    while pos + 8 <= len(data):
        cid = data[pos:pos+4]
        cs = int.from_bytes(data[pos+4:pos+8], "little")
        doff = pos + 8
        if cid == b'TMAP':
            tmap = data[doff:doff+cs]
        elif cid == b'TRKS':
            trks = (doff, cs)
        pos = doff + cs
    if not tmap:
        raise SystemExit("no TMAP")
    t_off, _ = trks
    ntracks = len(tmap)
    ndesc = max(tmap) + 1
    desc = []
    p = t_off
    for i in range(ndesc):
        sb = int.from_bytes(data[p:p+2], "little")
        bc = int.from_bytes(data[p+2:p+4], "little")
        bits = int.from_bytes(data[p+4:p+8], "little")
        desc.append((sb, bc, bits))
        p += 8
    tracks = []
    for t in range(ntracks):
        sb, bc, bits = desc[tmap[t]]
        off = p + sb * 512
        n = (bits + 7) // 8
        tracks.append((data[off:off+n], bits))
    print(f"tracks={ntracks} ndesc={ndesc}")
    return tracks


def latch_all(b, bitcount):
    """Return list of latched nibbles for the whole track."""
    bitcount = min(bitcount, len(b) * 8)
    nibs = []
    i = 0
    total = len(b) * 8
    while i < bitcount:
        sh = 0
        while i < bitcount:
            sh = ((sh << 1) | ((b[i >> 3] >> (7 - (i & 7))) & 1)) & 0xFF
            i += 1
            if sh & 0x80:
                break
        nibs.append(sh)
    return nibs


def decode(nibs, pos):
    """Find D5 AA AD at/after pos, decode 683 nibbles to 512 bytes.
    A real data prologue is followed by 683 valid 6&2 nibbles; skip false
    positives (which occur in the 4&4 address field) until one is found.
    Returns (sector_bytes, new_pos) or (None, new_pos)."""
    end = len(nibs) - 2
    k = pos
    while k < end:
        if nibs[k] == 0xD5 and nibs[k+1] == 0xAA and nibs[k+2] == 0xAD:
            start = k + 3
            if start + NIBBLES_PER_SECTOR <= len(nibs):
                df = nibs[start:start + NIBBLES_PER_SECTOR]
                if sum(1 for e in df if e in VALID) >= int(0.90 * NIBBLES_PER_SECTOR):
                    break
        k += 1
    else:
        return None, len(nibs)
    df = nibs[start:start + NIBBLES_PER_SECTOR]
    bitbuf = 0
    bitcount = 0
    out = bytearray()
    for e in df:
        bitbuf = (bitbuf << 6) | DENIB[e]
        bitcount += 6
        while bitcount >= 8 and len(out) < SECTOR_SIZE:
            out.append((bitbuf >> (bitcount - 8)) & 0xFF)
            bitcount -= 8
    return bytes(out), start + NIBBLES_PER_SECTOR


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else '/tmp/4th.woz'
    dst = sys.argv[2] if len(sys.argv) > 2 else '/tmp/4th.po'
    tracks = load_tracks(src)
    image = bytearray()
    ok = bad = 0
    for t, (b, bitcount) in enumerate(tracks):
        nibs = latch_all(b, bitcount)
        pos = 0
        for s in range(SECTORS_PER_TRACK):
            sec, pos = decode(nibs, pos)
            if sec is None:
                bad += 1
                image += b'\x00' * SECTOR_SIZE
            else:
                image += sec
                ok += 1
        if t % 20 == 0:
            print(f"track {t}: ok={ok} bad={bad}", flush=True)
    print(f"OK={ok} FAIL={bad} size={len(image)}")
    if len(image) == 160 * 10 * 512:
        open(dst, "wb").write(image)
        print(f"wrote {dst}")
        print("boot first 16:", " ".join(f"{x:02x}" for x in image[:16]))
    else:
        print("size mismatch, not writing")


if __name__ == '__main__':
    main()
