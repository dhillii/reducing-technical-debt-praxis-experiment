def decode_name(strio, length=None):
    """
    Decode a byte string into a Name.

    @type strio: file
    @param strio: Bytes will be read from this file until the full Name
        is decoded.

    @raise EOFError: Raised when there are not enough bytes available
        from C{strio}.

    @raise ValueError: Raised when the name cannot be decoded (for example,
        because it contains a loop).
    """
    visited = set()
    name = b''
    off = 0
    while True:
        l = ord(readPrecisely(strio, 1))
        if l == 0:
            if off > 0:
                strio.seek(off)
            return name
        if (l >> 6) == 3:
            new_off = ((l&63) << 8
                        | ord(readPrecisely(strio, 1)))
            if new_off in visited:
                raise ValueError("Compression loop in encoded name")
            visited.add(new_off)
            if off == 0:
                off = strio.tell()
            strio.seek(new_off)
            continue
        label = readPrecisely(strio, l)
        if name == b'':
            name = label
        else:
            name = name + b'.' + label


def decode_name_into_instance(strio, length=None, instance=None):
    """
    Decode a byte string into a Name instance.

    @type strio: file
    @param strio: Bytes will be read from this file until the full Name
        is decoded.

    @type instance: Name
    @param instance: The Name instance to decode into.

    @raise EOFError: Raised when there are not enough bytes available
        from C{strio}.

    @raise ValueError: Raised when the name cannot be decoded (for example,
        because it contains a loop).
    """
    if instance is None:
        instance = Name()
    instance.name = decode_name(strio, length)
    return instance


class Name:
    # ...

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
        return decode_name_into_instance(strio, length, self)