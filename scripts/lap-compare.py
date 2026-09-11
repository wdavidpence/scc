import zlib, struct, sys

def read_png(p):
    d = open(p, 'rb').read()
    pos = 8; idat = b''; W = H = 0; ct = 6
    while pos < len(d):
        ln = struct.unpack('>I', d[pos:pos+4])[0]
        typ = d[pos+4:pos+8]; data = d[pos+8:pos+8+ln]; pos += 12 + ln
        if typ == b'IHDR':
            W, H, bd, ct = struct.unpack('>IIBB', data[:10])
        elif typ == b'IDAT':
            idat += data
        elif typ == b'IEND':
            break
    raw = zlib.decompress(idat)
    bpp = 3 if ct == 2 else 4
    out = bytearray(W*H*bpp); prev = bytearray(W*bpp); i = 0
    for y in range(H):
        f = raw[i]; i += 1
        line = bytearray(raw[i:i+W*bpp]); i += W*bpp
        for x in range(W*bpp):
            a = line[x-bpp] if x >= bpp else 0
            b = prev[x]
            c = prev[x-bpp] if x >= bpp else 0
            if f == 1: line[x] = (line[x]+a) & 255
            elif f == 2: line[x] = (line[x]+b) & 255
            elif f == 3: line[x] = (line[x]+(a+b)//2) & 255
            elif f == 4:
                pp = a+b-c; pa = abs(pp-a); pb = abs(pp-b); pc = abs(pp-c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[x] = (line[x]+pr) & 255
        out[y*W*bpp:(y+1)*W*bpp] = line; prev = line
    return W, H, bpp, bytes(out)

def lap(W, H, bpp, buf, x0, y0, x1, y1):
    s = 0.0; s2 = 0.0; n = 0
    for y in range(max(1, y0), min(H-1, y1)):
        for x in range(max(1, x0), min(W-1, x1)):
            i = (y*W+x)*bpp
            g = lambda ii: 0.299*buf[ii] + 0.587*buf[ii+1] + 0.114*buf[ii+2]
            l = 4*g(i) - g(i-bpp) - g(i+bpp) - g(i-W*bpp) - g(i+W*bpp)
            s += l; s2 += l*l; n += 1
    return round(s2/n - (s/n)**2)

for f in sys.argv[1:]:
    W, H, bpp, buf = read_png(f)
    cx0, cx1 = int(W*0.30), int(W*0.72)
    cy0, cy1 = int(H*0.32), int(H*0.62)
    print(f.split('/')[-1], W, H, 'center_lap=', lap(W, H, bpp, buf, cx0, cy0, cx1, cy1))
