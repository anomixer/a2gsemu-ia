import sys
sys.path.insert(0, '.')

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

# dump first 96 raw bits (MSB first, as stored)
rawbits = ""
for i in range(96):
    b = (bits[i >> 3] >> (7 - (i & 7))) & 1
    rawbits += str(b)
print("RAW BITS (MSB-first, 96):")
print(rawbits)

# group into bytes (8 bits each, MSB first)
print("\nAs 8-bit bytes (MSB first):")
bs = []
for i in range(0, 96, 8):
    v = 0
    for k in range(8):
        v = (v << 1) | ((bits[(i+k) >> 3] >> (7 - ((i+k) & 7))) & 1)
    bs.append(v)
print(" ".join(f"{x:02x}" for x in bs))

# Now bit-7 latching
def read_bit(i):
    return (bits[i >> 3] >> (7 - (i & 7))) & 1
i = 0
nibs = []
for _ in range(12):
    sh = 0
    while True:
        sh = ((sh << 1) | read_bit(i)) & 0xFF
        i += 1
        if sh & 0x80:
            break
    nibs.append(sh)
print("\nBit-7 latched nibbles (12):")
print(" ".join(f"{x:02x}" for x in nibs))
print(f"consumed {i} bits for 12 nibbles")
