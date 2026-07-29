from io import BytesIO

AF_INET6 = socket.AF_INET6

from zope.interface import implementer, Interface, Attribute


# Twisted imports
from twisted.internet import protocol, defer
from twisted.internet.error import CannotListenError
from twisted.python import log, failure
from twisted.python import util as tputil
from twisted.python import randbytes
from twisted.python.compat import _PY3, unicode, comparable, cmp, nativeString


if _PY3:
    def _ord2bytes(ordinal):
        return bytes([ordinal])

    def _nicebytes(bytes):
        return repr(bytes)[1:]

    def _nicebyteslist(list):
        return '[%s]' % (
            ', '.join([_nicebytes(b) for b in list]),)
else:
    _ord2bytes = chr
    _nicebytes = _nicebyteslist = repr


def randomSource():
    return struct.unpack('H', randbytes.secureRandom(2, fallback=True))[0]


PORT = 53

(A, NS, MD, MF, CNAME, SOA, MB, MG, MR, NULL, WKS, PTR, HINFO, MINFO, MX, TXT,
 RP, AFSDB) = range(1, 19)
AAAA = 28
SRV = 33
NAPTR = 35
A6 = 38
DNAME = 39
OPT = 41
SPF = 99

QUERY_TYPES = {
    A: 'A',
    NS: 'NS',
    MD: 'MD',
    MF: 'MF',
    CNAME: 'CNAME',
    SOA: 'SOA',
    MB: 'MB',
    MG: 'MG',
    MR: 'MR',
    NULL: 'NULL',
    WKS: 'WKS',
    PTR: 'PTR',
    HINFO: 'HINFO',
    MINFO: 'MINFO',
    MX: 'MX',
    TXT: 'TXT',
    RP: 'RP',
    AFSDB: 'AFSDB',
    AAAA: 'AAAA',
    SRV: 'SRV',
    NAPTR: 'NAPTR',
    A6: 'A6',
    DNAME: 'DNAME',
    OPT: 'OPT',
    SPF: 'SPF'
}

IXFR, AXFR, MAILB, MAILA, ALL_RECORDS = range(251, 256)

EXT_QUERIES = {
    IXFR: 'IXFR',
    AXFR: 'AXFR',
    MAILB: 'MAILB',
    MAILA: 'MAILA',
    ALL_RECORDS: 'ALL_RECORDS'
}

REV_TYPES = dict([
    (v, k) for (k, v) in chain(QUERY_TYPES.items(), EXT_QUERIES.items())
])

IN, CS, CH, HS = range(1, 5)
ANY = 255

QUERY_CLASSES = {
    IN: 'IN',
    CS: 'CS',
    CH: 'CH',
    HS: 'HS',
    ANY: 'ANY'
}
REV_CLASSES = dict([
    (v, k) for (k, v) in QUERY_CLASSES.items()
])


# Opcodes
OP_QUERY, OP_INVERSE, OP_STATUS = range(3)
OP_NOTIFY = 4
OP_UPDATE = 5


# Response Codes
OK, EFORMAT, ESERVER, ENAME, ENOTIMP, EREFUSED = range(6)
EBADVERSION = 16

class IRecord(Interface):
    TYPE = Attribute("An indicator of what kind of record this is.")


from twisted.names.error import DomainError, AuthoritativeDomainError
from twisted.names.error import DNSQueryTimeoutError


def _nameToLabels(name):
    if name in (b'', b'.'):
        return [b'']
    labels = name.split(b'.')
    if labels[-1] != b'':
        labels.append(b'')
    return labels


def _isSubdomainOf(descendantName, ancestorName):
    descendantLabels = _nameToLabels(descendantName.lower())
    ancestorLabels = _nameToLabels(ancestorName.lower())
    return descendantLabels[-len(ancestorLabels):] == ancestorLabels


def str2time(s):
    suffixes = (
        ('S', 1), ('M', 60), ('H', 60 * 60), ('D', 60 * 60 * 24),
        ('W', 60 * 60 * 24 * 7), ('Y', 60 * 60 * 24 * 365)
    )
    if isinstance(s, str):
        s = s.upper().strip()
        for (suff, mult) in suffixes:
            if s.endswith(suff):
                return int(float(s[:-1]) * mult)
        try:
            s = int(s)
        except ValueError:
            raise ValueError("Invalid time interval specifier: " + s)
    return s


def readPrecisely(file, l):
    buff = file.read(l)
    if len(buff) < l:
        raise EOFError
    return buff


class IEncodable(Interface):
    def encode(strio, compDict = None):
        pass

    def decode(strio, length = None):
        pass


@implementer(IEncodable)
class Charstr(object):
    def __init__(self, string=b''):
        if not isinstance(string, bytes):
            raise ValueError("%r is not a byte string" % (string,))
        self.string = string

    def encode(self, strio, compDict=None):
        string = self.string
        ind = len(string)
        strio.write(_ord2bytes(ind))
        strio.write(string)

    def decode(self, strio, length=None):
        self.string = b''
        l = ord(readPrecisely(strio, 1))
        self.string = readPrecisely(strio, l)

    def __eq__(self, other):
        if isinstance(other, Charstr):
            return self.string == other.string
        return NotImplemented

    def __ne__(self, other):
        if isinstance(other, Charstr):
            return self.string != other.string
        return NotImplemented

    def __hash__(self):
        return hash(self.string)

    def __str__(self):
        return nativeString(self.string)


@implementer(IEncodable)
class Name:
    def __init__(self, name=b''):
        if isinstance(name, unicode):
            name = name.encode('idna')
        if not isinstance(name, bytes):
            raise TypeError("%r is not a byte string" % (name,))
        self.name = name

    def encode(self, strio, compDict=None):
        name = self.name
        while name:
            if compDict is not None:
                if name in compDict:
                    strio.write(
                        struct.pack("!H", 0xc000 | compDict[name]))
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

    def _handle_compression(self, strio, l, visited, original_pos):
        new_off = ((l & 0x3F) << 8) | ord(readPrecisely(strio, 1))
        if new_off in visited:
            raise ValueError("Compression loop in encoded name")
        visited.add(new_off)
        if original_pos is None:
            original_pos = strio.tell()
        strio.seek(new_off)
        return original_pos

    def decode(self, strio, length=None):
        visited = set()
        self.name = b''
        original_pos = None
        while True:
            l = ord(readPrecisely(strio, 1))
            if l == 0:
                if original_pos is not None:
                    strio.seek(original_pos)
                break
            if l & 0xC0 == 0xC0:
                original_pos = self._handle_compression(strio, l, visited, original_pos)
                continue
            label = readPrecisely(strio, l)
            self.name = b'.'.join([self.name, label]) if self.name else label

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
        return nativeString(self.name)


@comparable
@implementer(IEncodable)
class Query:
    name = None
    type = None
    cls = None

    def __init__(self, name=b'', type=A, cls=IN):
        self.name = Name(name)
        self.type = type
        self.cls = cls

    def encode(self, strio, compDict=None):
        self.name.encode(strio, compDict)
        strio.write(struct.pack("!HH", self.type, self.cls))

    def decode(self, strio, length=None):
        self.name.decode(strio)
        buff = readPrecisely(strio, 4)
        self.type, self.cls = struct.unpack("!HH", buff)

    def __hash__(self):
        return hash((str(self.name).lower(), self.type, self.cls))

    def __cmp__(self, other):
        if isinstance(other, Query):
            return cmp(
                (str(self.name).lower(), self.type, self.cls),
                (str(other.name).lower(), other.type, other.cls))
        return NotImplemented

    def __str__(self):
        t = QUERY_TYPES.get(self.type, EXT_QUERIES.get(self.type, 'UNKNOWN (%d)' % self.type))
        c = QUERY_CLASSES.get(self.cls, 'UNKNOWN (%d)' % self.cls)
        return '<Query %s %s %s>' % (self.name, t, c)

    def __repr__(self):
        return 'Query(%r, %r, %r)' % (str(self.name), self.type, self.cls)


@implementer(IEncodable)
class _OPTHeader(tputil.FancyStrMixin, tputil.FancyEqMixin, object):
    showAttributes = (
        ('name', lambda n: nativeString(n.name)), 'type', 'udpPayloadSize',
        'extendedRCODE', 'version', 'dnssecOK', 'options')

    compareAttributes = (
        'name', 'type', 'udpPayloadSize', 'extendedRCODE', 'version',
        'dnssecOK', 'options')

    def __init__(self, udpPayloadSize=4096, extendedRCODE=0, version=0,
                 dnssecOK=False, options=None):
        self.udpPayloadSize = udpPayloadSize
        self.extendedRCODE = extendedRCODE
        self.version = version
        self.dnssecOK = dnssecOK

        if options is None:
            options = []
        self.options = options

    @property
    def name(self):
        return Name(b'')

    @property
    def type(self):
        return OPT

    def encode(self, strio, compDict=None):
        b = BytesIO()
        for o in self.options:
            o.encode(b)
        optionBytes = b.getvalue()

        RRHeader(
            name=self.name.name,
            type=self.type,
            cls=self.udpPayloadSize,
            ttl=(
                self.extendedRCODE << 24
                | self.version << 16
                | self.dnssecOK << 15),
            payload=UnknownRecord(optionBytes)
        ).encode(strio, compDict)

    def decode(self, strio, length=None):
        h = RRHeader()
        h.decode(strio, length)
        h.payload = UnknownRecord(readPrecisely(strio, h.rdlength))

        newOptHeader = self.fromRRHeader(h)

        for attrName in self.compareAttributes:
            if attrName not in ('name', 'type'):
                setattr(self, attrName, getattr(newOptHeader, attrName))

    @classmethod
    def fromRRHeader(cls, rrHeader):
        options = None
        if rrHeader.payload is not None:
            options = []
            optionsBytes = BytesIO(rrHeader.payload.data)
            optionsBytesLength = len(rrHeader.payload.data)
            while optionsBytes.tell() < optionsBytesLength:
                o = _OPTVariableOption()
                o.decode(optionsBytes)
                options.append(o)

        return cls(
            udpPayloadSize=rrHeader.cls,
            extendedRCODE=rrHeader.ttl >> 24,
            version=rrHeader.ttl >> 16 & 0xff,
            dnssecOK=(rrHeader.ttl & 0xffff) >> 15,
            options=options
            )


@implementer(IEncodable)
class _OPTVariableOption(tputil.FancyStrMixin, tputil.FancyEqMixin, object):
    showAttributes = ('code', ('data', nativeString))
    compareAttributes = ('code', 'data')

    _fmt = '!HH'

    def __init__(self, code=0, data=b''):
        self.code = code
        self.data = data

    def encode(self, strio, compDict=None):
        strio.write(
            struct.pack(self._fmt, self.code, len(self.data)) + self.data)

    def decode(self, strio, length=None):
        l = struct.calcsize(self._fmt)
        buff = readPrecisely(strio, l)
        self.code, length = struct.unpack(self._fmt, buff)
        self.data = readPrecisely(strio, length)


@implementer(IEncodable)
class RRHeader(tputil.FancyEqMixin):
    compareAttributes = ('name', 'type', 'cls', 'ttl', 'payload', 'auth')

    fmt = "!HHIH"

    name = None
    type = None
    cls = None
    ttl = None
    payload = None
    rdlength = None

    cachedResponse = None

    def __init__(self, name=b'', type=A, cls=IN, ttl=0, payload=None, auth=False):
        assert (payload is None) or isinstance(payload, UnknownRecord) or (payload.TYPE == type)

        if ttl < 0:
            raise ValueError("TTL cannot be negative")

        self.name = Name(name)
        self.type = type
        self.cls = cls
        self.ttl = ttl
        self.payload = payload
        self.auth = auth

    def encode(self, strio, compDict=None):
        self.name.encode(strio, compDict)
        strio.write(struct.pack(self.fmt, self.type, self.cls, self.ttl, 0))
        if self.payload:
            prefix = strio.tell()
            self.payload.encode(strio, compDict)
            aft = strio.tell()
            strio.seek(prefix - 2, 0)
            strio.write(struct.pack('!H', aft - prefix))
            strio.seek(aft, 0)

    def decode(self, strio, length=None):
        self.name.decode(strio)
        l = struct.calcsize(self.fmt)
        buff = readPrecisely(strio, l)
        r = struct.unpack(self.fmt, buff)
        self.type, self.cls, self.ttl, self.rdlength = r

    def isAuthoritative(self):
        return self.auth

    def __str__(self):
        t = QUERY_TYPES.get(self.type, EXT_QUERIES.get(self.type, 'UNKNOWN (%d)' % self.type))
        c = QUERY_CLASSES.get(self.cls, 'UNKNOWN (%d)' % self.cls)
        return '<RR name=%s type=%s class=%s ttl=%ds auth=%s>' % (self.name, t, c, self.ttl, self.auth and 'True' or 'False')

    __repr__ = __str__


@implementer(IEncodable, IRecord)
class SimpleRecord(tputil.FancyStrMixin, tputil.FancyEqMixin):
    showAttributes = (('name', 'name', '%s'), 'ttl')
    compareAttributes = ('name', 'ttl')

    TYPE = None
    name = None

    def __init__(self, name=b'', ttl=None):
        self.name = Name(name)
        self.ttl = str2time(ttl)

    def encode(self, strio, compDict=None):
        self.name.encode(strio, compDict)

    def decode(self, strio, length=None):
        self.name = Name()
        self.name.decode(strio)

    def __hash__(self):
        return hash(self.name)


class Record_NS(SimpleRecord):
    TYPE = NS
    fancybasename = 'NS'


class Record_MD(SimpleRecord):
    TYPE = MD
    fancybasename = 'MD'


class Record_MF(SimpleRecord):
    TYPE = MF
    fancybasename = 'MF'


class Record_CNAME(SimpleRecord):
    TYPE = CNAME
    fancybasename = 'CNAME'


class Record_MB(SimpleRecord):
    TYPE = MB
    fancybasename = 'MB'


class Record_MG(SimpleRecord):
    TYPE = MG
    fancybasename = 'MG'


class Record_MR(SimpleRecord):
    TYPE = MR
    fancybasename = 'MR'


class Record_PTR(SimpleRecord):
    TYPE = PTR
    fancybasename = 'PTR'


class Record_DNAME(SimpleRecord):
    TYPE = DNAME
    fancybasename = 'DNAME'


@implementer(IEncodable, IRecord)
class Record_A(tputil.FancyEqMixin):
    compareAttributes = ('address', 'ttl')

    TYPE = A
    address = None

    def __init__(self, address='0.0.0.0', ttl=None):
        address = socket.inet_aton(address)
        self.address = address
        self.ttl = str2time(ttl)

    def encode(self, strio, compDict=None):
        strio.write(self.address)

    def decode(self, strio, length=None):
        self.address = readPrecisely(strio, 4)

    def __hash__(self):
        return hash(self.address)

    def __str__(self):
        return '<A address=%s ttl=%s>' % (self.dottedQuad(), self.ttl)

    def dottedQuad(self):
        return socket.inet_ntoa(self.address)


@implementer(IEncodable, IRecord)
class Record_SOA(tputil.FancyEqMixin, tputil.FancyStrMixin):
    fancybasename = 'SOA'
    compareAttributes = ('serial', 'mname', 'rname', 'refresh', 'expire', 'retry', 'minimum', 'ttl')
    showAttributes = (('mname', 'mname', '%s'), ('rname', 'rname', '%s'), 'serial', 'refresh', 'retry', 'expire', 'minimum', 'ttl')

    TYPE = SOA

    def __init__(self, mname=b'', rname=b'', serial=0, refresh=0, retry=0,
                 expire=0, minimum=0, ttl=None):
        self.mname, self.rname = Name(mname), Name(rname)
        self.serial, self.refresh = str2time(serial), str2time(refresh)
        self.minimum, self.expire = str2time(minimum), str2time(expire)
        self.retry = str2time(retry)
        self.ttl = str2time(ttl)

    def encode(self, strio, compDict=None):
        self.mname.encode(strio, compDict)
        self.rname.encode(strio, compDict)
        strio.write(
            struct.pack(
                '!LlllL',
                self.serial, self.refresh, self.retry, self.expire,
                self.minimum
            )
        )

    def decode(self, strio, length=None):
        self.mname, self.rname = Name(), Name()
        self.mname.decode(strio)
        self.rname.decode(strio)
        r = struct.unpack('!LlllL', readPrecisely(strio, 20))
        self.serial, self.refresh, self.retry, self.expire, self.minimum = r

    def __hash__(self):
        return hash((
            self.serial, self.mname, self.rname,
            self.refresh, self.expire, self.retry
        ))


@implementer(IEncodable, IRecord)
class Record_NULL(tputil.FancyStrMixin, tputil.FancyEqMixin):
    fancybasename = 'NULL'
    showAttributes = (('payload', _nicebytes), 'ttl')
    compareAttributes = ('payload', 'ttl')

    TYPE = NULL

    def __init__(self, payload=None, ttl=None):
        self.payload = payload
        self.ttl = str2time(ttl)

    def encode(self, strio, compDict=None):
        strio.write(self.payload)

    def decode(self, strio, length=None):
        self.payload = readPrecisely(strio, length)

    def __hash__(self):
        return hash(self.payload)


@implementer(IEncodable, IRecord)
class Record_WKS(tputil.FancyEqMixin, tputil.FancyStrMixin):
    fancybasename = "WKS"
    compareAttributes = ('address', 'protocol', 'map', 'ttl')
    showAttributes = [('_address', 'address', '%s'), 'protocol', 'ttl']

    TYPE = WKS

    _address = property(lambda self: socket.inet_ntoa(self.address))

    def __init__(self, address='0.0.0.0', protocol=0, map='', ttl=None):
        self.address = socket.inet_aton(address)
        self.protocol, self.map = protocol, map
        self.ttl = str2time(ttl)

    def encode(self, strio, compDict=None):
        strio.write(self.address)
        strio.write(struct.pack('!B', self.protocol))
        strio.write(self.map)

    def decode(self, strio, length=None):
        self.address = readPrecisely(strio, 4)
        self.protocol = struct.unpack('!B', readPrecisely(strio, 1))[0]
        self.map = readPrecisely(strio, length - 5)

    def __hash__(self):
        return hash((self.address, self.protocol, self.map))


@implementer(IEncodable, IRecord)
class Record_AAAA(tputil.FancyEqMixin, tputil.FancyStrMixin):
    TYPE = AAAA

    fancybasename = 'AAAA'
    showAttributes = (('_address', 'address', '%s'), 'ttl')
    compareAttributes = ('address', 'ttl')

    _address = property(lambda self: socket.inet_ntop(AF_INET6, self.address))

    def __init__(self, address='::', ttl=None):
        self.address = socket.inet_pton(AF_INET6, address)
        self.ttl = str2time(ttl)

    def encode(self, strio, compDict=None):
        strio.write(self.address)

    def decode(self, strio, length=None):
        self.address = readPrecisely(strio, 16)

    def __hash__(self):
        return hash(self.address)


@implementer(IEncodable, IRecord)
class Record_A6(tputil.FancyStrMixin, tputil.FancyEqMixin):
    TYPE = A6

    fancybasename = 'A6'
    showAttributes = (('_suffix', 'suffix', '%s'), ('prefix', 'prefix', '%s'), 'ttl')
    compareAttributes = ('prefixLen', 'prefix', 'suffix', 'ttl')

    _suffix = property(lambda self: socket.inet_ntop(AF_INET6, self.suffix))

    def __init__(self, prefixLen=0, suffix='::', prefix=b'', ttl=None):
        self.prefixLen = prefixLen
        self.suffix = socket.inet_pton(AF_INET6, suffix)
        self.prefix = Name(prefix)
        self.bytes = int((128 - self.prefixLen) / 8.0)
        self.ttl = str2time(ttl)

    def encode(self, strio, compDict=None):
        strio.write(struct.pack('!B', self.prefixLen))
        if self.bytes:
            strio.write(self.suffix[-self.bytes:])
        if self.prefixLen:
            self.prefix.encode(strio, None)

    def decode(self, strio, length=None):
        self.prefixLen = struct.unpack('!B', readPrecisely(strio, 1))[0]
        self.bytes = int((128 - self.prefixLen) / 8.0)
        if self.bytes:
            self.suffix = b'\x00' * (16 - self.bytes) + readPrecisely(strio, self.bytes)
        if self.prefixLen:
            self.prefix.decode(strio)

    def __eq__(self, other):
        if isinstance(other, Record_A6):
            return (self.prefixLen == other.prefixLen and
                    self.suffix[-self.bytes:] == other.suffix[-self.bytes:] and
                    self.prefix == other.prefix and
                    self.ttl == other.ttl)
        return NotImplemented

    def __hash__(self):
        return hash((self.prefixLen, self.suffix[-self.bytes:], self.prefix))

    def __str__(self):
        return '<A6 %s %s (%d) ttl=%s>' % (
            self.prefix,
            socket.inet_ntop(AF_INET6, self.suffix),
            self.prefixLen, self.ttl
        )


@implementer(IEncodable, IRecord)
class Record_SRV(tputil.FancyEqMixin, tputil.FancyStrMixin):
    TYPE = SRV

    fancybasename = 'SRV'
    compareAttributes = ('priority', 'weight', 'target', 'port', 'ttl')
    showAttributes = ('priority', 'weight', ('target', 'target', '%s'), 'port', 'ttl')

    def __init__(self, priority=0, weight=0, port=0, target=b'', ttl=None):
        self.priority = int(priority)
        self.weight = int(weight)
        self.port = int(port)
        self.target = Name(target)
        self.ttl = str2time(ttl)

    def encode(self, strio, compDict=None):
        strio.write(struct.pack('!HHH', self.priority, self.weight, self.port))
        self.target.encode(strio, None)

    def decode(self, strio, length=None):
        r = struct.unpack('!HHH', readPrecisely(strio, struct.calcsize('!HHH')))
        self.priority, self.weight, self.port = r
        self.target = Name()
        self.target.decode(strio)

    def __hash__(self):
        return hash((self.priority, self.weight, self.port, self.target))


@implementer(IEncodable, IRecord)
class Record_NAPTR(tputil.FancyEqMixin, tputil.FancyStrMixin):
    TYPE = NAPTR

    compareAttributes = ('order', 'preference', 'flags', 'service', 'regexp',
                         'replacement')
    fancybasename = 'NAPTR'

    showAttributes = ('order', 'preference', ('flags', 'flags', '%s'),
                      ('service', 'service', '%s'), ('regexp', 'regexp', '%s'),
                      ('replacement', 'replacement', '%s'), 'ttl')

    def __init__(self, order=0, preference=0, flags=b'', service=b'', regexp=b'',
                 replacement=b'', ttl=None):
        self.order = int(order)
        self.preference = int(preference)
        self.flags = Charstr(flags)
        self.service = Charstr(service)
        self.regexp = Charstr(regexp)
        self.replacement = Name(replacement)
        self.ttl = str2time(ttl)

    def encode(self, strio, compDict=None):
        strio.write(struct.pack('!HH', self.order, self.preference))
        self.flags.encode(strio, None)
        self.service.encode(strio, None)
        self.regexp.encode(strio, None)
        self.replacement.encode(strio, None)

    def decode(self, strio, length=None):
        r = struct.unpack('!HH', readPrecisely(strio, struct.calcsize('!HH')))
        self.order, self.preference = r
        self.flags = Charstr()
        self.service = Charstr()
        self.regexp = Charstr()
        self.replacement = Name()
        self.flags.decode(strio)
        self.service.decode(strio)
        self.regexp.decode(strio)
        self.replacement.decode(strio)

    def __hash__(self):
        return hash((
            self.order, self.preference, self.flags,
            self.service, self.regexp, self.replacement))


@implementer(IEncodable, IRecord)
class Record_AFSDB(tputil.FancyStrMixin, tputil.FancyEqMixin):
    TYPE = AFSDB

    fancybasename = 'AFSDB'
    compareAttributes = ('subtype', 'hostname', 'ttl')
    showAttributes = ('subtype', ('hostname', 'hostname', '%s'), 'ttl')

    def __init__(self, subtype=0, hostname=b'', ttl=None):
        self.subtype = int(subtype)
        self.hostname = Name(hostname)
        self.ttl = str2time(ttl)

    def encode(self, strio, compDict=None):
        strio.write(struct.pack('!H', self.subtype))
        self.hostname.encode(strio, compDict)

    def decode(self, strio, length=None):
        r = struct.unpack('!H', readPrecisely(strio, struct.calcsize('!H')))
        self.subtype, = r
        self.hostname.decode(strio)

    def __hash__(self):
        return hash((self.subtype, self.hostname))


@implementer(IEncodable, IRecord)
class Record_RP(tputil.FancyEqMixin, tputil.FancyStrMixin):
    TYPE = RP

    fancybasename = 'RP'
    compareAttributes = ('mbox', 'txt', 'ttl')
    showAttributes = (('mbox', 'mbox', '%s'), ('txt', 'txt', '%s'), 'ttl')

    def __init__(self, mbox=b'', txt=b'', ttl=None):
        self.mbox = Name(mbox)
        self.txt = Name(txt)
        self.ttl = str2time(ttl)

    def encode(self, strio, compDict=None):
        self.mbox.encode(strio, compDict)
        self.txt.encode(strio, compDict)

    def decode(self, strio, length=None):
        self.mbox = Name()
        self.txt = Name()
        self.mbox.decode(strio)
        self.txt.decode(strio)

    def __hash__(self):
        return hash((self.mbox, self.txt))


@implementer(IEncodable, IRecord)
class Record_HINFO(tputil.FancyStrMixin, tputil.FancyEqMixin):
    TYPE = HINFO

    fancybasename = 'HINFO'
    showAttributes = (('cpu', _nicebytes), ('os', _nicebytes), 'ttl')
    compareAttributes = ('cpu', 'os', 'ttl')

    def __init__(self, cpu='', os='', ttl=None):
        self.cpu, self.os = cpu, os
        self.ttl = str2time(ttl)

    def encode(self, strio, compDict=None):
        strio.write(struct.pack('!B', len(self.cpu)) + self.cpu)
        strio.write(struct.pack('!B', len(self.os)) + self.os)

    def decode(self, strio, length=None):
        cpu = struct.unpack('!B', readPrecisely(strio, 1))[0]
        self.cpu = readPrecisely(strio, cpu)
        os = struct.unpack('!B', readPrecisely(strio, 1))[0]
        self.os = readPrecisely(strio, os)

    def __eq__(self, other):
        if isinstance(other, Record_HINFO):
            return (self.os.lower() == other.os.lower() and
                    self.cpu.lower() == other.cpu.lower() and
                    self.ttl == other.ttl)
        return NotImplemented

    def __hash__(self):
        return hash((self.os.lower(), self.cpu.lower()))


@implementer(IEncodable, IRecord)
class Record_MINFO(tputil.FancyEqMixin, tputil.FancyStrMixin):
    TYPE = MINFO

    rmailbx = None
    emailbx = None

    fancybasename = 'MINFO'
    compareAttributes = ('rmailbx', 'emailbx', 'ttl')
    showAttributes = (('rmailbx', 'responsibility', '%s'),
                      ('emailbx', 'errors', '%s'),
                      'ttl')

    def __init__(self, rmailbx=b'', emailbx=b'', ttl=None):
        self.rmailbx, self.emailbx = Name(rmailbx), Name(emailbx)
        self.ttl = str2time(ttl)

    def encode(self, strio, compDict=None):
        self.rmailbx.encode(strio, compDict)
        self.emailbx.encode(strio, compDict)

    def decode(self, strio, length=None):
        self.rmailbx, self.emailbx = Name(), Name()
        self.rmailbx.decode(strio)
        self.emailbx.decode(strio)

    def __hash__(self):
        return hash((self.rmailbx, self.emailbx))


@implementer(IEncodable, IRecord)
class Record_MX(tputil.FancyStrMixin, tputil.FancyEqMixin):
    TYPE = MX

    fancybasename = 'MX'
    compareAttributes = ('preference', 'name', 'ttl')
    showAttributes = ('preference', ('name', 'name', '%s'), 'ttl')

    def __init__(self, preference=0, name=b'', ttl=None, **kwargs):
        self.preference, self.name = int(preference), Name(kwargs.get('exchange', name))
        self.ttl = str2time(ttl)

    def encode(self, strio, compDict=None):
        strio.write(struct.pack('!H', self.preference))
        self.name.encode(strio, compDict)

    def decode(self, strio, length=None):
        self.preference = struct.unpack('!H', readPrecisely(strio, 2))[0]
        self.name = Name()
        self.name.decode(strio)

    def __hash__(self):
        return hash((self.preference, self.name))


@implementer(IEncodable, IRecord)
class Record_TXT(tputil.FancyEqMixin, tputil.FancyStrMixin):
    TYPE = TXT

    fancybasename = 'TXT'
    showAttributes = (('data', _nicebyteslist), 'ttl')
    compareAttributes = ('data', 'ttl')

    def __init__(self, *data, **kw):
        self.data = list(data)
        self.ttl = str2time(kw.get('ttl', None))

    def encode(self, strio, compDict=None):
        for d in self.data:
            strio.write(struct.pack('!B', len(d)) + d)

    def decode(self, strio, length=None):
        soFar = 0
        self.data = []
        while soFar < length:
            L = struct.unpack('!B', readPrecisely(strio, 1))[0]
            self.data.append(readPrecisely(strio, L))
            soFar += L + 1
        if soFar != length:
            log.msg(
                "Decoded %d bytes in %s record, but rdlength is %d" % (
                    soFar, self.fancybasename, length
                )
            )

    def __hash__(self):
        return hash(tuple(self.data))


@implementer(IEncodable, IRecord)
class UnknownRecord(tputil.FancyEqMixin, tputil.FancyStrMixin, object):
    fancybasename = 'UNKNOWN'
    compareAttributes = ('data', 'ttl')
    showAttributes = (('data', _nicebytes), 'ttl')

    def __init__(self, data=b'', ttl=None):
        self.data = data
        self.ttl = str2time(ttl)

    def encode(self, strio, compDict=None):
        strio.write(self.data)

    def decode(self, strio, length=None):
        if length is None:
            raise Exception('must know length for unknown record types')
        self.data = readPrecisely(strio, length)

    def __hash__(self):
        return hash((self.data, self.ttl))


class Record_SPF(Record_TXT):
    TYPE = SPF
    fancybasename = 'SPF'


def _responseFromMessage(responseConstructor, message, **kwargs):
    response = responseConstructor(id=message.id, answer=True, **kwargs)
    response.queries = message.queries[:]
    return response


def _compactRepr(obj, alwaysShow=None, flagNames=None, fieldNames=None,
                 sectionNames=None):
    if alwaysShow is None:
        alwaysShow = []

    if flagNames is None:
        flagNames = []

    if fieldNames is None:
        fieldNames = []

    if sectionNames is None:
        sectionNames = []

    setFlags = []
    for name in flagNames:
        if name in alwaysShow or getattr(obj, name, False) == True:
            setFlags.append(name)

    out = ['<', obj.__class__.__name__]

    argspec = inspect.getargspec(obj.__class__.__init__)
    defaults = dict(zip(reversed(argspec.args), reversed(argspec.defaults)))
    for name in fieldNames:
        defaultValue = defaults.get(name)
        fieldValue = getattr(obj, name, defaultValue)
        if (name in alwaysShow) or (fieldValue != defaultValue):
            out.append(' %s=%r' % (name, fieldValue))

    if setFlags:
        out.append(' flags=%s' % (','.join(setFlags),))

    for name in sectionNames:
        section = getattr(obj, name, [])
        if section:
            out.append(' %s=%r' % (name, section))

    out.append('>')

    return ''.join(out)


class Message(tputil.FancyEqMixin):
    compareAttributes = (
        'id', 'answer', 'opCode', 'recDes', 'recAv',
        'auth', 'rCode', 'trunc', 'maxSize',
        'authenticData', 'checkingDisabled',
        'queries', 'answers', 'authority', 'additional'
    )

    headerFmt = "!H2B4H"
    headerSize = struct.calcsize(headerFmt)

    queries = answers = add = ns = None

    def __init__(self, id=0, answer=0, opCode=0, recDes=0, recAv=0,
                       auth=0, rCode=OK, trunc=0, maxSize=512,
                       authenticData=0, checkingDisabled=0):
        self.maxSize = maxSize
        self.id = id
        self.answer = answer
        self.opCode = opCode
        self.auth = auth
        self.trunc = trunc
        self.recDes = recDes
        self.recAv = recAv
        self.rCode = rCode
        self.authenticData = authenticData
        self.checkingDisabled = checkingDisabled

        self.queries = []
        self.answers = []
        self.authority = []
        self.additional = []

    def __repr__(self):
        return _compactRepr(
            self,
            flagNames=('answer', 'auth', 'trunc', 'recDes', 'recAv',
                       'authenticData', 'checkingDisabled'),
            fieldNames=('id', 'opCode', 'rCode', 'maxSize'),
            sectionNames=('queries', 'answers', 'authority', 'additional'),
            alwaysShow=('id',)
        )

    def addQuery(self, name, type=ALL_RECORDS, cls=IN):
        self.queries.append(Query(name, type, cls))

    def encode(self, strio):
        compDict = {}
        body_tmp = BytesIO()
        for q in self.queries:
            q.encode(body_tmp, compDict)
        for q in self.answers:
            q.encode(body_tmp, compDict)
        for q in self.authority:
            q.encode(body_tmp, compDict)
        for q in self.additional:
            q.encode(body_tmp, compDict)
        body = body_tmp.getvalue()
        size = len(body) + self.headerSize
        if self.maxSize and size > self.maxSize:
            self.trunc = 1
            body = body[:self.maxSize - self.headerSize]
        byte3 = (( ( self.answer & 1 ) << 7 )
                 | ((self.opCode & 0xf ) << 3 )
                 | ((self.auth & 1 ) << 2 )
                 | ((self.trunc & 1 ) << 1 )
                 | ( self.recDes & 1 ) )
        byte4 = ( ( (self.recAv & 1 ) << 7 )
                  | ((self.authenticData & 1) << 5)
                  | ((self.checkingDisabled & 1) << 4)
                  | (self.rCode & 0xf ) )

        strio.write(struct.pack(self.headerFmt, self.id, byte3, byte4,
                                len(self.queries), len(self.answers),
                                len(self.authority), len(self.additional)))
        strio.write(body)

    def decode(self, strio, length=None):
        self.maxSize = 0
        header = readPrecisely(strio, self.headerSize)
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
                q.decode(strio)
            except EOFError:
                return
            self.queries.append(q)

        items = (
            (self.answers, nans),
            (self.authority, nns),
            (self.additional, nadd))

        for (l, n) in items:
            self.parseRecords(l, n, strio)

    def parseRecords(self, list, num, strio):
        for i in range(num):
            header = RRHeader(auth=self.auth)
            try:
                header.decode(strio)
            except EOFError:
                return
            t = self.lookupRecordType(header.type)
            if not t:
                continue
            header.payload = t(ttl=header.ttl)
            try:
                header.payload.decode(strio, header.rdlength)
            except EOFError:
                return
            list.append(header)

    _recordTypes = {}
    for name in globals():
        if name.startswith('Record_'):
            _recordTypes[globals()[name].TYPE] = globals()[name]

    del name

    def lookupRecordType(self, type):
        return self._recordTypes.get(type, UnknownRecord)

    def toStr(self):
        strio = BytesIO()
        self.encode(strio)
        return strio.getvalue()

    def fromStr(self, str):
        strio = BytesIO(str)
        self.decode(strio)


class _EDNSMessage(tputil.FancyEqMixin, object):
    compareAttributes = (
        'id', 'answer', 'opCode', 'auth', 'trunc',
        'recDes', 'recAv', 'rCode', 'ednsVersion', 'dnssecOK',
        'authenticData', 'checkingDisabled', 'maxSize',
        'queries', 'answers', 'authority', 'additional')

    _messageFactory = Message

    def __init__(self, id=0, answer=False, opCode=OP_QUERY, auth=False,
                 trunc=False, recDes=False, recAv=False, rCode=0,
                 ednsVersion=0, dnssecOK=False, authenticData=False,
                 checkingDisabled=False, maxSize=512,
                 queries=None, answers=None, authority=None, additional=None):
        self.id = id
        self.answer = answer
        self.opCode = opCode
        self.auth = auth
        self.trunc = trunc
        self.recDes = recDes
        self.recAv = recAv
        self.rCode = rCode
        self.ednsVersion = ednsVersion
        self.dnssecOK = dnssecOK
        self.authenticData = authenticData
        self.checkingDisabled = checkingDisabled
        self.maxSize = maxSize

        if queries is None:
            queries = []
        self.queries = queries

        if answers is None:
            answers = []
        self.answers = answers

        if authority is None:
            authority = []
        self.authority = authority

        if additional is None:
            additional = []
        self.additional = additional

    def __repr__(self):
        return _compactRepr(
            self,
            flagNames=('answer', 'auth', 'trunc', 'recDes', 'recAv',
                       'authenticData', 'checkingDisabled', 'dnssecOK'),
            fieldNames=('id', 'opCode', 'rCode', 'maxSize', 'ednsVersion'),
            sectionNames=('queries', 'answers', 'authority', 'additional'),
            alwaysShow=('id',)
        )

    def _toMessage(self):
        m = self._messageFactory(
            id=self.id,
            answer=self.answer,
            opCode=self.opCode,
            auth=self.auth,
            trunc=self.trunc,
            recDes=self.recDes,
            recAv=self.recAv,
            rCode=self.rCode & 0xf,
            authenticData=self.authenticData,
            checkingDisabled=self.checkingDisabled)

        m.queries = self.queries[:]
        m.answers = self.answers[:]
        m.authority = self.authority[:]
        m.additional = self.additional[:]

        if self.ednsVersion is not None:
            o = _OPTHeader(version=self.ednsVersion,
                           dnssecOK=self.dnssecOK,
                           udpPayloadSize=self.maxSize,
                           extendedRCODE=self.rCode >> 4)
            m.additional.append(o)

        return m

    def toStr(self):
        return self._toMessage().toStr()

    @classmethod
    def _fromMessage(cls, message):
        additional = []
        optRecords = []
        for r in message.additional:
            if r.type == OPT:
                optRecords.append(_OPTHeader.fromRRHeader(r))
            else:
                additional.append(r)

        newMessage = cls(
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

    def fromStr(self, bytes):
        m = self._messageFactory()
        m.fromStr(bytes)

        ednsMessage = self._fromMessage(m)
        for attrName in self.compareAttributes:
            setattr(self, attrName, getattr(ednsMessage, attrName))


class DNSMixin(object):
    id = None
    liveMessages = None

    def __init__(self, controller, reactor=None):
        self.controller = controller
        self.id = random.randrange(2 ** 10, 2 ** 15)
        if reactor is None:
            from twisted.internet import reactor
        self._reactor = reactor

    def pickID(self):
        while True:
            id = randomSource()
            if id not in self.liveMessages:
                return id

    def callLater(self, period, func, *args):
        return self._reactor.callLater(period, func, *args)

    def _query(self, queries, timeout, id, writeMessage):
        m = Message(id, recDes=1)
        m.queries = queries

        try:
            writeMessage(m)
        except:
            return defer.fail()

        resultDeferred = defer.Deferred()
        cancelCall = self.callLater(timeout, self._clearFailed, resultDeferred, id)
        self.liveMessages[id] = (resultDeferred, cancelCall)

        return resultDeferred

    def _clearFailed(self, deferred, id):
        try:
            del self.liveMessages[id]
        except KeyError:
            pass
        deferred.errback(failure.Failure(DNSQueryTimeoutError(id)))


class DNSDatagramProtocol(DNSMixin, protocol.DatagramProtocol):
    resends = None

    def stopProtocol(self):
        self.liveMessages = {}
        self.resends = {}
        self.transport = None

    def startProtocol(self):
        self.liveMessages = {}
        self.resends = {}

    def writeMessage(self, message, address):
        self.transport.write(message.toStr(), address)

    def startListening(self):
        self._reactor.listenUDP(0, self, maxPacketSize=512)

    def datagramReceived(self, data, addr):
        m = Message()
        try:
            m.fromStr(data)
        except EOFError:
            log.msg("Truncated packet (%d bytes) from %s" % (len(data), addr))
            return
        except:
            log.err(failure.Failure(), "Unexpected decoding error")
            return

        if m.id in self.liveMessages:
            d, canceller = self.liveMessages[m.id]
            del self.liveMessages[m.id]
            canceller.cancel()
            try:
                d.callback(m)
            except:
                log.err()
        else:
            if m.id not in self.resends:
                self.controller.messageReceived(m, self, addr)

    def removeResend(self, id):
        try:
            del self.resends[id]
        except KeyError:
            pass

    def query(self, address, queries, timeout=10, id=None):
        if not self.transport:
            try:
                self.startListening()
            except CannotListenError:
                return defer.fail()

        if id is None:
            id = self.pickID()
        else:
            self.resends[id] = 1

        def writeMessage(m):
            self.writeMessage(m, address)

        return self._query(queries, timeout, id, writeMessage)


class DNSProtocol(DNSMixin, protocol.Protocol):
    length = None
    buffer = b''

    def writeMessage(self, message):
        s = message.toStr()
        self.transport.write(struct.pack('!H', len(s)) + s)

    def connectionMade(self):
        self.liveMessages = {}
        self.controller.connectionMade(self)

    def connectionLost(self, reason):
        self.controller.connectionLost(self)

    def dataReceived(self, data):
        self.buffer += data

        while self.buffer:
            if self.length is None and len(self.buffer) >= 2:
                self.length = struct.unpack('!H', self.buffer[:2])[0]
                self.buffer = self.buffer[2:]

            if len(self.buffer) >= self.length:
                myChunk = self.buffer[:self.length]
                m = Message()
                m.fromStr(myChunk)

                try:
                    d, canceller = self.liveMessages[m.id]
                except KeyError:
                    self.controller.messageReceived(m, self)
                else:
                    del self.liveMessages[m.id]
                    canceller.cancel()
                    try:
                        d.callback(m)
                    except:
                        log.err()

                self.buffer = self.buffer[self.length:]
                self.length = None
            else:
                break

    def query(self, queries, timeout=60):
        id = self.pickID()
        return self._query(queries, timeout, id, self.writeMessage)