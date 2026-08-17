import sys
sys.path.insert(0, '.')
from woz2raw import Cursor

path = sys.argv[1] if len(sys.argv) > 1 else '/tmp/4th.woz'
data = open(path, "rb").read()
print(f"file size: {len(data)}")

pos = 12
trks = None
while pos + 8 <= len(data):
    cid = int.from_bytes(data[pos:pos+4], "little")
    csize = int.from_bytes(data[pos+4:pos+8], "little")
    d_off = pos + 8
    if cid == 0x534B5254:
        trks = (d_off, csize)
        break
    pos = d_off + csize
d_off, csize = trks
print(f"TRKS payload at {d_off}, {csize} bytes = {csize//8} descriptors")

e = data[d_off:d_off+8]
sb = int.from_bytes(e[0:2], "little")
bc = int.from_bytes(e[4:8], "little")
print(f"track0: starting_block={sb} bit_count={bc}")
byte_offset = sb * 512
byte_count = (bc + 7) // 8
bits = data[byte_offset:byte_offset+byte_count]
print(f"track0 bits: {byte_count} bytes = {bc} bits, offset={byte_offset}")

# read first 30 nibbles
c = Cursor(bits, bc)
nibs = [c.read_nibble() for _ in range(30)]
print("first 30 nibbles:", [hex(n) for n in nibs])

# search for D5 AA 96 (addr prologue) and D5 AA AD (data prologue)
c2 = Cursor(bits, bc)
addr_found = 0
data_found = 0
i = 0
while addr_found < 5 and data_found < 5 and i < 3000:
    n0 = c2.read_nibble()
    if n0 == 0xD5:
        n1 = c2.read_nibble()
        if n1 == 0xAA:
            n2 = c2.read_nibble()
            if n2 == 0x96:
                print(f"  ADDR prologue D5 AA 96 at nibble {i}")
                addr_found += 1
            elif n2 == 0xAD:
                print(f"  DATA prologue D5 AA AD at nibble {i}")
                data_found += 1
    i += 1
print(f"addr_found={addr_found} data_found={data_found}")
