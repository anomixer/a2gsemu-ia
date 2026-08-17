import sys

path = sys.argv[1] if len(sys.argv) > 1 else '/tmp/4th.woz'
data = open(path, "rb").read()

magic = data[0:8]
print(f"magic: {magic!r} = {magic[:4].decode()}")

# walk chunks
pos = 12
while pos + 8 <= len(data):
    cid = data[pos:pos+4]
    csize = int.from_bytes(data[pos+4:pos+8], "little")
    d_off = pos + 8
    print(f"\nchunk {cid!r} ({cid.decode(errors='replace')}) size={csize} at {pos}")
    if cid == b'INFO':
        d = data[d_off:d_off+csize]
        # INFO layout: disk_type(1) boot_sector(1) blocks(1) tracks(1)
        # then track data...
        print(f"  disk_type={d[0]} boot_sector={d[1]} blocks_per_track={d[2]} tracks={d[3]}")
        print(f"  raw: {' '.join(f'{b:02x}' for b in d[:16])}")
    elif cid == b'TMAP':
        tmap = data[d_off:d_off+csize]
        print(f"  tmap entries: {len(tmap)//4}, first 8: {[int.from_bytes(tmap[i:i+4],'little') for i in range(0,32,4)]}")
    pos = d_off + csize
