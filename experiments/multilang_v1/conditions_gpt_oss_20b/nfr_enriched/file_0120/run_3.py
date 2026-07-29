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
        original_pos = None

        def read_next():
            byte = readPrecisely(strio, 1)
            l = byte[0] if _PY3 else ord(byte)
            if l == 0:
                return None
            if (l >> 6) == 3:
                second = readPrecisely(strio, 1)
                offset = ((l & 0x3F) << 8) | (second[0] if _PY3 else ord(second))
                return ('pointer', offset)
            return ('label', readPrecisely(strio, l))

        while True:
            result = read_next()
            if result is None:
                if original_pos is not None:
                    strio.seek(original_pos)
                return
            kind, value = result
            if kind == 'pointer':
                if value in visited:
                    raise ValueError("Compression loop in encoded name")
                visited.add(value)
                if original_pos is None:
                    original_pos = strio.tell()
                strio.seek(value)
                continue
            # label
            if self.name:
                self.name += b'.' + value
            else:
                self.name = value