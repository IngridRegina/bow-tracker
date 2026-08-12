import struct

class MP:
    """MessagePack decoder with switchable endianness for multi-byte fields."""

    def __init__(self, data, little=True, off=0):
        self.d = data
        self.i = off
        self.e = "<" if little else ">"

    def u(self, fmt):
        v = struct.unpack_from(self.e + fmt, self.d, self.i)[0]
        self.i += struct.calcsize(fmt)
        return v

    def read(self):
        b = self.d[self.i]
        self.i += 1
        if b <= 0x7F:
            return b
        if b >= 0xE0:
            return b - 256
        if 0x80 <= b <= 0x8F:
            return self.map(b & 0x0F)
        if 0x90 <= b <= 0x9F:
            return self.arr(b & 0x0F)
        if 0xA0 <= b <= 0xBF:
            return self.str(b & 0x1F)
        if b == 0xC0:
            return None
        if b == 0xC2:
            return False
        if b == 0xC3:
            return True
        if b == 0xC4:
            return self.bin(self.u("B"))
        if b == 0xC5:
            return self.bin(self.u("H"))
        if b == 0xC6:
            return self.bin(self.u("I"))
        if b == 0xCA:
            return self.u("f")
        if b == 0xCB:
            return self.u("d")
        if b == 0xCC:
            return self.u("B")
        if b == 0xCD:
            return self.u("H")
        if b == 0xCE:
            return self.u("I")
        if b == 0xCF:
            return self.u("Q")
        if b == 0xD0:
            return self.u("b")
        if b == 0xD1:
            return self.u("h")
        if b == 0xD2:
            return self.u("i")
        if b == 0xD3:
            return self.u("q")
        if b == 0xD9:
            return self.str(self.u("B"))
        if b == 0xDA:
            return self.str(self.u("H"))
        if b == 0xDB:
            return self.str(self.u("I"))
        if b == 0xDC:
            return self.arr(self.u("H"))
        if b == 0xDD:
            return self.arr(self.u("I"))
        if b == 0xDE:
            return self.map(self.u("H"))
        if b == 0xDF:
            return self.map(self.u("I"))
        raise ValueError("unknown byte 0x%02x at %d" % (b, self.i - 1))

    def str(self, n):
        s = self.d[self.i:self.i + n]
        self.i += n
        return s.decode("utf-8", "replace")

    def bin(self, n):
        s = self.d[self.i:self.i + n]
        self.i += n
        return s

    def arr(self, n):
        return [self.read() for _ in range(n)]

    def map(self, n):
        return {self.read(): self.read() for _ in range(n)}


def decode_all(data, little=True, off=0):
    m = MP(data, little, off)
    out = []
    while m.i < len(data):
        out.append(m.read())
    return out, m.i
