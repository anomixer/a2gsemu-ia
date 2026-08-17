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

# find first D5 AA 96, then print 40 nibbles
c = Cursor(bits, bc)
start = -1
i = 0
while i < 5000:
    n2 = c.read_nibble(); n1 = c.read_nibble(); n0 = c.read_nibble()
    if n2 == 0xD5 and n1 == 0xAA and n0 == 0x96:
        start = i
        break
    i += 1
print(f"prologue at nibble {start}")
# rewind: read from start (start is group index, each group = 3 nibbles)
c = Cursor(bits, bc)
for _ in range(start * 3):
    c.read_nibble()
nibs = [c.read_nibble() for _ in range(40)]
print("nibbles from prologue:")
for j in range(0, 40, 8):
    print(f"  [{j:2d}] " + " ".join(f"{nibs[j+k]:02x}" for k in range(min(8, 40-j))))

# try: prologue=D5 AA 96, then 8 addr nibbles, decode 4&4, check csum
def dec44(a, b):
    return ((a & 0x55) << 1) | (b & 0x55)

addr = nibs[3:11]  # after prologue (3 nibbles)
vol  = dec44(addr[0], addr[1])
trk  = dec44(addr[2], addr[3])
sec  = dec44(addr[4], addr[5])
csum = dec44(addr[6], addr[7])
print(f"prologue=3: vol={vol} trk={trk} sec={sec} csum={csum} xor={vol^trk^sec} "
      f"[{'OK' if csum==vol^trk^sec else 'BAD'}]")

# try: prologue=D5 AA (2 nibbles), then 8 addr nibbles
addr = nibs[2:10]
vol  = dec44(addr[0], addr[1])
trk  = dec44(addr[2], addr[3])
sec  = dec44(addr[4], addr[5])
csum = dec44(addr[6], addr[7])
print(f"prologue=2: vol={vol} trk={trk} sec={sec} csum={csum} xor={vol^trk^sec} "
      f"[{'OK' if csum==vol^trk^sec else 'BAD'}]")

# try: prologue=D5 AA 96 96 (4 nibbles), then 8 addr nibbles
addr = nibs[4:12]
vol  = dec44(addr[0], addr[1])
trk  = dec44(addr[2], addr[3])
sec  = dec44(addr[4], addr[5])
csum = dec44(addr[6], addr[7])
print(f"prologue=4: vol={vol} trk={trk} sec={sec} csum={csum} xor={vol^trk^sec} "
      f"[{'OK' if csum==vol^trk^sec else 'BAD'}]")
