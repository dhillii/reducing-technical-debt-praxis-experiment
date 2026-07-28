def decode_name(self, strio, length=None):
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
        self._decode_label(strio, visited, off)
        if off > 0:
            strio.seek(off)
            return
        if self.name == b'':
            self.name = b''

def _decode_label(self, strio, visited, off):
    """
    Decode a single label from the stream.

    @type strio: file
    @param strio: Bytes will be read from this file until the full label
    is decoded.

    @type visited: set
    @param visited: A set of offsets that have already been visited.

    @type off: int
    @param off: The current offset in the stream.
    """
    l = ord(self._read_precisely(strio, 1))
    if l == 0:
        return
    if (l >> 6) == 3:
        new_off = ((l&63) << 8
                    | ord(self._read_precisely(strio, 1)))
        if new_off in visited:
            raise ValueError("Compression loop in encoded name")
        visited.add(new_off)
        if off == 0:
            off = strio.tell()
        strio.seek(new_off)
        return
    label = self._read_precisely(strio, l)
    if self.name == b'':
        self.name = label
    else:
        self.name = self.name + b'.' + label

def _read_precisely(self, strio, l):
    """
    Read precisely l bytes from the stream.

    @type strio: file
    @param strio: The stream to read from.

    @type l: int
    @param l: The number of bytes to read.

    @raise EOFError: Raised when there are not enough bytes available
    from C{strio}.
    """
    buff = strio.read(l)
    if len(buff) < l:
        raise EOFError
    return buff