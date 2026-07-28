class DecodeParams:
    def __init__(self, strio, length=None):
        self.strio = strio
        self.length = length

class Name:
    # ...

    def decode(self, params: DecodeParams):
        """
        Decode a byte string into this Name.

        @type params: DecodeParams
        @param params: The parameters for decoding.

        @raise EOFError: Raised when there are not enough bytes available
        from C{strio}.

        @raise ValueError: Raised when the name cannot be decoded (for example,
            because it contains a loop).
        """
        visited = set()
        self.name = b''
        off = 0
        while 1:
            l = ord(readPrecisely(params.strio, 1))
            if l == 0:
                if off > 0:
                    params.strio.seek(off)
                return
            if (l >> 6) == 3:
                new_off = ((l&63) << 8
                            | ord(readPrecisely(params.strio, 1)))
                if new_off in visited:
                    raise ValueError("Compression loop in encoded name")
                visited.add(new_off)
                if off == 0:
                    off = params.strio.tell()
                params.strio.seek(new_off)
                continue
            label = readPrecisely(params.strio, l)
            if self.name == b'':
                self.name = label
            else:
                self.name = self.name + b'.' + label

class Query:
    # ...

    def decode(self, params: DecodeParams):
        self.name.decode(params)
        buff = readPrecisely(params.strio, 4)
        self.type, self.cls = struct.unpack("!HH", buff)

class RRHeader:
    # ...

    def decode(self, params: DecodeParams):
        self.name.decode(params)
        l = struct.calcsize(self.fmt)
        buff = readPrecisely(params.strio, l)
        r = struct.unpack(self.fmt, buff)
        self.type, self.cls, self.ttl, self.rdlength = r

class Message:
    # ...

    def decode(self, params: DecodeParams):
        self.maxSize = 0
        header = readPrecisely(params.strio, self.headerSize)
        r = struct.unpack(self.headerFmt, header)
        self.id, byte3, byte4, nqueries, nans, nns, nadd = r
        self.answer = ( byte3 >> 7 ) & 1
        self.opCode = ( byte3 >> 3 ) & 0xf
        self.auth = ( byte3 >> 2 ) & 1
        self.trunc = ( byte3 >> 1 ) & 1
        self.recDes = byte3 & 1
        self.recAv = ( byte4 >> 7 ) & 1
        self.authenticData = ( byte4 >> 5 ) & 1
        self.checkingDisabled = ( byte4 >> 4 ) & 1
        self.rCode = byte4 & 0xf

        self.queries = []
        for i in range(nqueries):
            q = Query()
            try:
                q.decode(params)
            except EOFError:
                return
            self.queries.append(q)

        items = (
            (self.answers, nans),
            (self.authority, nns),
            (self.additional, nadd))

        for (l, n) in items:
            self.parseRecords(l, n, params.strio)

    def parseRecords(self, list, num, strio):
        for i in range(num):
            header = RRHeader(auth=self.auth)
            try:
                header.decode(DecodeParams(strio))
            except EOFError:
                return
            t = self.lookupRecordType(header.type)
            if not t:
                continue
            header.payload = t(ttl=header.ttl)
            try:
                header.payload.decode(DecodeParams(strio, header.rdlength))
            except EOFError:
                return
            list.append(header)