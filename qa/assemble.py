from pathlib import Path
import base64, gzip, hashlib, json, struct
root = Path('data')
old = root / '7f7b5af33a67827c30b5/gps-postal.bin'
points = gzip.decompress(old.read_bytes())
supplement = gzip.decompress(b''.join(base64.b64decode(p.read_text()) for p in sorted(Path('qa').glob('geo-*.txt'))))
n = len(points) // 12
buf = bytearray(struct.pack('<4sI', b'GPS2', n))
for i in range(n):
    buf.extend(points[i*12:(i+1)*12])
    buf.extend(supplement[i*4:(i+1)*4])
buf.extend(supplement[n*4:])
packed = bytearray(gzip.compress(buf, compresslevel=6, mtime=0))
packed[9] = 3
assert hashlib.sha256(packed).hexdigest() == '625208167a699de8076821180cf299e9648615c591b728a4314b9163025a067e'
dest = root / 'e25df9dc3c8ab20788ae/gps-postal.bin'
dest.parent.mkdir(exist_ok=True)
dest.write_bytes(packed)
# Test with the previous shell while its versioned postal requests are blocked.
Path('assets/7f7b5af33a67827c30b5/developer-gps.js').write_bytes(Path('qa/picker.js').read_bytes())
