import sys
sys.path.insert(0, '.')
from woz2raw import Cursor, DENIB

path = sys.argv[1] if len(sys.argv) > 1 else '/tmp/4th.woz'
data = open(path, "rb").read()
pos = 12
trks = None
while pos + 8 <= len(data):
    cid = int.from_bytes(data[pos:pos+4], "little")
    csize = int.from_bytes(data[pos+4:pos+8], "little")
    d_off = pos + 8
    if cid == 0x534B5254:
        trks = (d_off, csize); break
    pos = d_off + csize
d_off, csize = trks
e = data[d_off:d_off+8]
sb = int.from_bytes(e[0:2], "little")
bc = int.from_bytes(e[4:8], "little")
byte_offset = sb * 512
byte_count = (bc + 7) // 8
bits = data[byte_offset:byte_offset+byte_count]

# find first D5 AA 96
c = Cursor(bits, bc)
while True:
    n2 = c.read_nibble(); n1 = c.read_nibble(); n0 = c.read_nibble()
    if n2 == 0xD5 and n1 == 0xAA and n0 == 0x96:
        break
# read 8 nibbles of address field
addr = [c.read_nibble() for _ in range(8)]
print("address nibbles:", [hex(a) for a in addr])

# Method 1: gssquared ((e[0]&0x55)<<1)|(e[1]&0x55)
def m1(a):
    vol  = ((addr[0] & 0x55) << 1) | (addr[1] & 0x55)
    trk  = ((addr[2] & 0x55) << 1) | (addr[3] & 0x55)
    sec  = ((addr[4] & 0x55) << 1) | (addr[5] & 0x55)
    csum = ((addr[6] & 0x55) << 1) | (addr[7] & 0x55)
    return vol, trk, sec, csum

# Method 2: lower nibble (e[i]&0x0F), vol = a[0]|(a[1]<<4)
def m2(a):
    vol  = (addr[0] & 0x0F) | ((addr[1] & 0x0F) << 4)
    trk  = (addr[2] & 0x0F) | ((addr[3] & 0x0F) << 4)
    sec  = (addr[4] & 0x0F) | ((addr[5] & 0x0F) << 4)
    csum = (addr[6] & 0x0F) | ((addr[7] & 0x0F) << 4)
    return vol, trk, sec, csum

# Method 3: denib then 4&4 (denib gives 6-bit value, take lower 4)
def m3(a):
    d = [DENIB[x] for x in addr]
    vol  = (d[0] & 0x0F) | ((d[1] & 0x0F) << 4)
    trk  = (d[2] & 0x0F) | ((d[3] & 0x0F) << 4)
    sec  = (d[4] & 0x0F) | ((d[5] & 0x0F) << 4)
    csum = (d[6] & 0x0F) | ((d[7] & 0x0F) << 4)
    return vol, trk, sec, csum

for name, fn in [("m1 gssquared", m1), ("m2 low-nibble", m2), ("m3 denib", m3)]:
    vol, trk, sec, csum = fn(addr)
    ok = "OK" if csum == (vol ^ trk ^ sec) else "BAD"
    print(f"{name}: vol={vol} trk={trk} sec={sec} csum={csum} "
          f"(vol^trk^sec={vol^trk^sec}) [{ok}]")
