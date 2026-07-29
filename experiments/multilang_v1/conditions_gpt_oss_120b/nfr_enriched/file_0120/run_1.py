def _read_length(strio):
    """
    Read a single length byte from the stream.
    """
    return ord(readPrecisely(strio, 1))


def _pointer_offset(first_byte, strio):
    """
    Compute the offset for a compression pointer.
    """
    second_byte = ord(readPrecisely(strio, 1))
    return ((first_byte & 0x3F) << 8) | second_byte


def _process_pointer(new_off, visited, base_offset, strio):
    """
    Follow a compression pointer, handling loops and updating the stream
    position.

    @param new_off: The target offset indicated by the pointer.
    @type new_off: C{int}
    @param visited: Set of offsets already visited to detect loops.
    @type visited: C{set}
    @param base_offset: The offset to return to after following the pointer.
    @type base_offset: C{int}
    @param strio: Stream being read.
    @type strio: file-like object
    @raise ValueError: If a compression loop is detected.
    """
    if new_off in visited:
        raise ValueError("Compression loop in encoded name")
    visited.add(new_off)
    if base_offset == 0:
        base_offset = strio.tell()
    strio.seek(new_off)
    return base_offset


def _add_label(name_obj, label):
    """
    Append a label to the Name object's byte string.
    """
    if name_obj.name == b'':
        name_obj.name = label
    else:
        name_obj.name = name_obj.name + b'.' + label


@implementer(IEncodable)
class Name:
    """
    A name in the domain name system, made up of multiple labels.  For example,
    I{twistedmatrix.com}.

    @ivar name: A byte string giving the name.
    @type name: C{bytes}
    """
    def __init__(self, name=b''):
        if isinstance(name, unicode):
            name = name.encode('idna')
        if not isinstance(name, bytes):
            raise TypeError("%r is not a byte string" % (name,))
        self.name = name

    def encode(self, strio, compDict=None):
        """
        Encode this Name into the appropriate byte format.

        @type strio: file
        @param strio: The byte representation of this Name will be written to
        this file.

        @type compDict: dict
        @param compDict: dictionary of Names that have already been encoded
        and whose addresses may be backreferenced by this Name (for the purpose
        of reducing the message size).
        """
        name = self.name
        while name:
            if compDict is not None:
                if name in compDict:
                    strio.write(struct.pack("!H", 0xc000 | compDict[name]))
                    return
                else:
                    compDict[name] = strio.tell() + Message.headerSize
            ind = name.find(b'.')
            if ind > 0:
                label, name = name[:ind], name[ind + 1:]
            else:
                label = name
                name = None
                ind = len(label)
            strio.write(_ord2bytes(ind))
            strio.write(label)
        strio.write(b'\x00')

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
        base_offset = 0
        while True:
            length_byte = _read_length(strio)
            if length_byte == 0:
                if base_offset > 0:
                    strio.seek(base_offset)
                break
            if (length_byte >> 6) == 3:
                new_off = _pointer_offset(length_byte, strio)
                base_offset = _process_pointer(new_off, visited, base_offset, strio)
                continue
            label = readPrecisely(strio, length_byte)
            _add_label(self, label)

    def __eq__(self, other):
        if isinstance(other, Name):
            return self.name == other.name
        return NotImplemented

    def __ne__(self, other):
        if isinstance(other, Name):
            return self.name != other.name
        return NotImplemented

    def __hash__(self):
        return hash(self.name)

    def __str__(self):
        """
        Represent this L{Name} instance by its string name.
        """
        return nativeString(self.name)