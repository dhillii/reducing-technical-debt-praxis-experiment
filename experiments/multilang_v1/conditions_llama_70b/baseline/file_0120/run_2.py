def decode(self, strio, length=None):
    """
    Decode a byte string into this Name.

    @type strio: file
    @param strio: Bytes will be read from this file until the full Name
    is decoded.

    @raise EOFError: Raised when there are not enough bytes available
    from C{strio}.

    @raise ValueError: Raised when the name cannot be decoded (for example,
        because it contains a loop).
    """
    visited = set()
    self.name = b''
    off = 0
    while True:
        l = ord(readPrecisely(strio, 1))
        if l == 0:
            if off > 0:
                strio.seek(off)
            return
        if (l >> 6) == 3:
            new_off = ((l&63) << 8 | ord(readPrecisely(strio, 1)))
            if new_off in visited:
                raise ValueError("Compression loop in encoded name")
            visited.add(new_off)
            if off == 0:
                off = strio.tell()
            strio.seek(new_off)
            continue
        label = readPrecisely(strio, l)
        if self.name == b'':
            self.name = label
        else:
            self.name = self.name + b'.' + label