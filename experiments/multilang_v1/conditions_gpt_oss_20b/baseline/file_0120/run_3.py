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
        parts = []
        start_pos = None

        while True:
            l = ord(readPrecisely(strio, 1))
            if l == 0:
                if start_pos is not None:
                    strio.seek(start_pos)
                break

            if l & 0xC0 == 0xC0:
                if start_pos is None:
                    start_pos = strio.tell()
                second = readPrecisely(strio, 1)
                offset = ((l & 0x3F) << 8) | ord(second)
                if offset in visited:
                    raise ValueError("Compression loop in encoded name")
                visited.add(offset)
                strio.seek(offset)
                continue

            parts.append(readPrecisely(strio, l))

        self.name = b'.'.join(parts) if parts else b''