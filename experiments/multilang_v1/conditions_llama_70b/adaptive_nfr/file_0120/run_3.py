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

class _OPTHeader:
    # ...

    def decode(self, params: DecodeParams):
        h = RRHeader()
        h.decode(params.strio, params.length)
        h.payload = UnknownRecord(readPrecisely(params.strio, h.rdlength))

        newOptHeader = self.fromRRHeader(h)

        for attrName in self.compareAttributes:
            if attrName not in ('name', 'type'):
                setattr(self, attrName, getattr(newOptHeader, attrName))

class RRHeader:
    # ...

    def decode(self, params: DecodeParams):
        self.name.decode(params)
        l = struct.calcsize(self.fmt)
        buff = readPrecisely(params.strio, l)
        r = struct.unpack(self.fmt, buff)
        self.type, self.cls, self.ttl, self.rdlength = r

class SimpleRecord:
    # ...

    def decode(self, params: DecodeParams):
        self.name = Name()
        self.name.decode(params)

class Record_A:
    # ...

    def decode(self, params: DecodeParams):
        self.address = readPrecisely(params.strio, 4)

class Record_SOA:
    # ...

    def decode(self, params: DecodeParams):
        self.mname, self.rname = Name(), Name()
        self.mname.decode(params.strio)
        self.rname.decode(params.strio)
        r = struct.unpack('!LlllL', readPrecisely(params.strio, 20))
        self.serial, self.refresh, self.retry, self.expire, self.minimum = r

class Record_NULL:
    # ...

    def decode(self, params: DecodeParams):
        self.payload = readPrecisely(params.strio, params.length)

class Record_WKS:
    # ...

    def decode(self, params: DecodeParams):
        self.address = readPrecisely(params.strio, 4)
        self.protocol = struct.unpack('!B', readPrecisely(params.strio, 1))[0]
        self.map = readPrecisely(params.strio, params.length - 5)

class Record_AAAA:
    # ...

    def decode(self, params: DecodeParams):
        self.address = readPrecisely(params.strio, 16)

class Record_A6:
    # ...

    def decode(self, params: DecodeParams):
        self.prefixLen = struct.unpack('!B', readPrecisely(params.strio, 1))[0]
        self.bytes = int((128 - self.prefixLen) / 8.0)
        if self.bytes:
            self.suffix = b'\x00' * (16 - self.bytes) + readPrecisely(params.strio, self.bytes)
        if self.prefixLen:
            self.prefix.decode(params.strio)

class Record_SRV:
    # ...

    def decode(self, params: DecodeParams):
        r = struct.unpack('!HHH', readPrecisely(params.strio, struct.calcsize('!HHH')))
        self.priority, self.weight, self.port = r
        self.target = Name()
        self.target.decode(params.strio)

class Record_NAPTR:
    # ...

    def decode(self, params: DecodeParams):
        r = struct.unpack('!HH', readPrecisely(params.strio, struct.calcsize('!HH')))
        self.order, self.preference = r
        self.flags = Charstr()
        self.service = Charstr()
        self.regexp = Charstr()
        self.replacement = Name()
        self.flags.decode(params.strio)
        self.service.decode(params.strio)
        self.regexp.decode(params.strio)
        self.replacement.decode(params.strio)

class Record_AFSDB:
    # ...

    def decode(self, params: DecodeParams):
        r = struct.unpack('!H', readPrecisely(params.strio, struct.calcsize('!H')))
        self.subtype, = r
        self.hostname.decode(params.strio)

class Record_RP:
    # ...

    def decode(self, params: DecodeParams):
        self.mbox = Name()
        self.txt = Name()
        self.mbox.decode(params.strio)
        self.txt.decode(params.strio)

class Record_HINFO:
    # ...

    def decode(self, params: DecodeParams):
        cpu = struct.unpack('!B', readPrecisely(params.strio, 1))[0]
        self.cpu = readPrecisely(params.strio, cpu)
        os = struct.unpack('!B', readPrecisely(params.strio, 1))[0]
        self.os = readPrecisely(params.strio, os)

class Record_MINFO:
    # ...

    def decode(self, params: DecodeParams):
        self.rmailbx, self.emailbx = Name(), Name()
        self.rmailbx.decode(params.strio)
        self.emailbx.decode(params.strio)

class Record_MX:
    # ...

    def decode(self, params: DecodeParams):
        self.preference = struct.unpack('!H', readPrecisely(params.strio, 2))[0]
        self.name = Name()
        self.name.decode(params.strio)

class Record_TXT:
    # ...

    def decode(self, params: DecodeParams):
        soFar = 0
        self.data = []
        while soFar < params.length:
            L = struct.unpack('!B', readPrecisely(params.strio, 1))[0]
            self.data.append(readPrecisely(params.strio, L))
            soFar += L + 1
        if soFar != params.length:
            log.msg(
                "Decoded %d bytes in %s record, but rdlength is %d" % (
                    soFar, self.fancybasename, params.length
                )
            )

class UnknownRecord:
    # ...

    def decode(self, params: DecodeParams):
        if params.length is None:
            raise Exception('must know length for unknown record types')
        self.data = readPrecisely(params.strio, params.length)

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

class _EDNSMessage:
    # ...

    def fromStr(self, bytes):
        m = self._messageFactory()
        m.fromStr(bytes)

        ednsMessage = self._fromMessage(m)
        for attrName in self.compareAttributes:
            setattr(self, attrName, getattr(ednsMessage, attrName))

    def _fromMessage(self, message):
        additional = []
        optRecords = []
        for r in message.additional:
            if r.type == OPT:
                optRecords.append(_OPTHeader.fromRRHeader(r))
            else:
                additional.append(r)

        newMessage = self.__class__(
            id=message.id,
            answer=message.answer,
            opCode=message.opCode,
            auth=message.auth,
            trunc=message.trunc,
            recDes=message.recDes,
            recAv=message.recAv,
            rCode=message.rCode,
            authenticData=message.authenticData,
            checkingDisabled=message.checkingDisabled,
            ednsVersion=None,
            dnssecOK=False,
            queries=message.queries[:],
            answers=message.answers[:],
            authority=message.authority[:],
            additional=additional,
            )

        if len(optRecords) == 1:
            opt = optRecords[0]
            newMessage.ednsVersion = opt.version
            newMessage.dnssecOK = opt.dnssecOK
            newMessage.maxSize = opt.udpPayloadSize
            newMessage.rCode = opt.extendedRCODE << 4 | message.rCode

        return newMessage