# -*- test-case-name: twisted.names.test.test_dns -*-
# Copyright (c) Twisted Matrix Laboratories.
# See LICENSE for details.

"""
DNS protocol implementation.

Future Plans:
    - Get rid of some toplevels, maybe.
"""

from __future__ import division, absolute_import

__all__ = [
    'IEncodable', 'IRecord',

    'A', 'A6', 'AAAA', 'AFSDB', 'CNAME', 'DNAME', 'HINFO',
    'MAILA', 'MAILB', 'MB', 'MD', 'MF', 'MG', 'MINFO', 'MR', 'MX',
    'NAPTR', 'NS', 'NULL', 'OPT', 'PTR', 'RP', 'SOA', 'SPF', 'SRV', 'TXT',
    'WKS',

    'ANY', 'CH', 'CS', 'HS', 'IN',

    'ALL_RECORDS', 'AXFR', 'IXFR',

    'EFORMAT', 'ENAME', 'ENOTIMP', 'EREFUSED', 'ESERVER', 'EBADVERSION',

    'Record_A', 'Record_A6', 'Record_AAAA', 'Record_AFSDB', 'Record_CNAME',
    'Record_DNAME', 'Record_HINFO', 'Record_MB', 'Record_MD', 'Record_MF',
    'Record_MG', 'Record_MINFO', 'Record_MR', 'Record_MX', 'Record_NAPTR',
    'Record_NS', 'Record_NULL', 'Record_PTR', 'Record_RP', 'Record_SOA',
    'Record_SPF', 'Record_SRV', 'Record_TXT', 'Record_WKS', 'UnknownRecord',

    'QUERY_CLASSES', 'QUERY_TYPES', 'REV_CLASSES', 'REV_TYPES', 'EXT_QUERIES',

    'Charstr', 'Message', 'Name', 'Query', 'RRHeader', 'SimpleRecord',
    'DNSDatagramProtocol', 'DNSMixin', 'DNSProtocol',

    'OK', 'OP_INVERSE', 'OP_NOTIFY', 'OP_QUERY', 'OP_STATUS', 'OP_UPDATE',
    'PORT',

    'AuthoritativeDomainError', 'DNSQueryTimeoutError', 'DomainError',
    ]

# System imports
import inspect, struct, random, socket
from itertools import chain

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
        """
        Construct a bytes object representing a single byte with the given
        ordinal value.

        @type ordinal: C{int}
        @rtype: C{bytes}
        """
        return bytes([ordinal])


    def _nicebytes(bytes):
        """
        Represent a mostly textful bytes object in a way suitable for presentation
        to an end user.

        @param bytes: The bytes to represent.
        @rtype: C{str}
        """
        return repr(bytes)[1:]


    def _nicebyteslist(list):
        """
        Represent a list of mostly textful bytes objects in a way suitable for
        presentation to an end user.

        @param list: The list of bytes to represent.
        @rtype: C{str}
        """
        return '[%s]' % (
            ', '.join([_nicebytes(b) for b in list]),)
else:
    _ord2bytes = chr
    _nicebytes = _nicebyteslist = repr



def randomSource():
    """
    Wrapper around L{randbytes.secureRandom} to return 2 random chars.
    """
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


OP_QUERY, OP_INVERSE, OP_STATUS = range(3)
OP_NOTIFY = 4
OP_UPDATE = 5


OK, EFORMAT, ESERVER, ENAME, ENOTIMP, EREFUSED = range(6)
EBADVERSION = 16

class IRecord(Interface):
    """
    An single entry in a zone of authority.
    """

    TYPE = Attribute("An indicator of what kind of record this is.")


from twisted.names.error import DomainError, AuthoritativeDomainError
from twisted.names.error import DNSQueryTimeoutError



def _nameToLabels(name):
    """
    Split a domain name into its constituent labels.

    @type name: C{str}
    @param name: A fully qualified domain name (with or without a
        trailing dot).

    @return: A L{list} of labels ending with an empty label
        representing the DNS root zone.
    """
    if name in (b'', b'.'):
        return [b'']
    labels = name.split(b'.')
    if labels[-1] != b'':
        labels.append(b'')
    return labels



def _isSubdomainOf(descendantName, ancestorName):
    """
    Test whether C{descendantName} is equal to or is a I{subdomain} of
    C{ancestorName}.

    The names are compared case-insensitively.

    The names are treated as byte strings containing one or more
    DNS labels separated by B{.}.

    C{descendantName} is considered equal if its sequence of labels
    exactly matches the labels of C{ancestorName}.

    C{descendantName} is considered a I{subdomain} if its sequence of
    labels ends with the labels of C{ancestorName}.

    @type descendantName: C{bytes}
    @param descendantName: The DNS subdomain name.

    @type ancestorName: C{bytes}
    @param ancestorName: The DNS parent or ancestor domain name.

    @return: C{True} if C{descendantName} is equal to or if it is a
        subdomain of C{ancestorName}. Otherwise returns C{False}.
    """
    descendantLabels = _nameToLabels(descendantName.lower())
    ancestorLabels = _nameToLabels(ancestorName.lower())
    return descendantLabels[-len(ancestorLabels):] == ancestorLabels



def str2time(s):
    """
    Parse a string description of an interval into an integer number of seconds.

    @param s: An interval definition constructed as an interval duration
        followed by an interval unit.  An interval duration is a base ten
        representation of an integer.  An interval unit is one of the following
        letters: S (seconds), M (minutes), H (hours), D (days), W (weeks), or Y
        (years).  For example: C{"3S"} indicates an interval of three seconds;
        C{"5D"} indicates an interval of five days.  Alternatively, C{s} may be
        any non-string and it will be returned unmodified.
    @type s: text string (C{str}) for parsing; anything else for passthrough.

    @return: an C{int} giving the interval represented by the string C{s}, or
        whatever C{s} is if it is not a string.
    """
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
    """
    Interface for something which can be encoded to and decoded
    from a file object.
    """

    def encode(strio, compDict = None):
        """
        Write a representation of this object to the given
        file object.

        @type strio: File-like object
        @param strio: The stream to which to write bytes

        @type compDict: C{dict} or C{None}
        @param compDict: A dictionary of backreference addresses that have
            already been written to this stream and that may be used for
            compression.
        """

    def decode(strio, length = None):
        """
        Reconstruct an object from data read from the given
        file object.

        @type strio: File-like object
        @param strio: The stream from which bytes may be read

        @type length: C{int} or C{None}
        @param length: The number of bytes in this RDATA field.  Most
            implementations can ignore this value.  Only in the case of
            records similar to TXT where the total length is in no way
            encoded in the data is it necessary.
        """



@implementer(IEncodable)
class Charstr(object):

    def __init__(self, string=b''):
        if not isinstance(string, bytes):
            raise ValueError("%r is not a byte string" % (string,))
        self.string = string


    def encode(self, strio, compDict=None):
        """
        Encode this Character string into the appropriate byte format.

        @type strio: file
        @param strio: The byte representation of this Charstr will be written
            to this file.
        """
        string = self.string
        ind = len(string)
        strio.write(_ord2bytes(ind))
        strio.write(string)


    def decode(self, strio, length=None):
        """
        Decode a byte string into this Charstr.

        @type strio: file
        @param strio: Bytes will be read from this file until the full string
            is decoded.

        @raise EOFError: Raised when there are not enough bytes available from
            C{strio}.
        """
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
        """
        Represent this L{Charstr} instance by its string value.
        """
        return nativeString(self.string)



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
                self._handle_pointer(strio, l, visited, off)
                continue
            self._append_label(strio, l)

    def _handle_pointer(self, strio, first_byte, visited, off):
        """
        Process a compression pointer.

        @param strio: Stream to read from.
        @type first_byte: C{int}
        @param visited: Set of offsets already visited.
        @type visited: C{set}
        @param off: Offset to return to after following the pointer.
        @type off: C{int}
        """
        new_off = ((first_byte & 63) << 8) | ord(readPrecisely(strio, 1))
        if new_off in visited:
            raise ValueError("Compression loop in encoded name")
        visited.add(new_off)
        if off == 0:
            off = strio.tell()
        strio.seek(new_off)
        # Continue decoding from the pointer location
        # The loop in decode will handle subsequent bytes
        # Store the return offset for later restoration
        self._pointer_return = off

    def _append_label(self, strio, length):
        """
        Append a label of the given length to the name.

        @param strio: Stream to read from.
        @type length: C{int}
        """
        label = readPrecisely(strio, length)
        if self.name:
            self.name = self.name + b'.' + label
        else:
            self.name = label
        # If we arrived via a pointer, restore original position
        if hasattr(self, '_pointer_return'):
            strio.seek(self._pointer_return)
            del self._pointer_return


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



@comparable
@implementer(IEncodable)
class Query:
    """
    Represent a single DNS query.

    @ivar name: The name about which this query is requesting information.
    @ivar type: The query type.
    @ivar cls: The query class.
    """
    name = None
    type = None
    cls = None

    def __init__(self, name=b'', type=A, cls=IN):
        """
        @type name: C{bytes}
        @param name: The name about which to request information.

        @type type: C{int}
        @param type: The query type.

        @type cls: C{int}
        @param cls: The query class.
        """
        self.name = Name(name)
        self.type = type
        self.cls = cls


    def encode(self, strio, compDict=None):
        self.name.encode(strio, compDict)
        strio.write(struct.pack("!HH", self.type, self.cls))


    def decode(self, strio, length = None):
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
    """
    An OPT record header.

    @ivar name: The DNS name associated with this record. Since this
        is a pseudo record, the name is always an L{Name} instance
        with value b'', which represents the DNS root zone. This
        attribute is a readonly property.

    @ivar type: The DNS record type. This is a fixed value of 41
        (C{dns.OPT} for OPT Record. This attribute is a readonly
        property.

    @see: L{_OPTHeader.__init__} for documentation of other public
        instance attributes.

    @see: L{https://tools.ietf.org/html/rfc6891#section-6.1.2}

    @since: 13.2
    """
    showAttributes = (
        ('name', lambda n: nativeString(n.name)), 'type', 'udpPayloadSize',
        'extendedRCODE', 'version', 'dnssecOK', 'options')

    compareAttributes = (
        'name', 'type', 'udpPayloadSize', 'extendedRCODE', 'version',
        'dnssecOK', 'options')

    def __init__(self, udpPayloadSize=4096, extendedRCODE=0, version=0,
                 dnssecOK=False, options=None):
        """
        @type udpPayloadSize: L{int}
        @param payload: The number of octets of the largest UDP
            payload that can be reassembled and delivered in the
            requestor's network stack.

        @type extendedRCODE: L{int}
        @param extendedRCODE: Forms the upper 8 bits of extended
            12-bit RCODE (together with the 4 bits defined in
            [RFC1035].  Note that EXTENDED-RCODE value 0 indicates
            that an unextended RCODE is in use (values 0 through 15).

        @type version: L{int}
        @param version: Indicates the implementation level of the
            setter.  Full conformance with this specification is
            indicated by version C{0}.

        @type dnssecOK: L{bool}
        @param dnssecOK: DNSSEC OK bit as defined by [RFC3225].

        @type options: L{list}
        @param options: A L{list} of 0 or more L{_OPTVariableOption}
            instances.
        """
        self.udpPayloadSize = udpPayloadSize
        self.extendedRCODE = extendedRCODE
        self.version = version
        self.dnssecOK = dnssecOK

        if options is None:
            options = []
        self.options = options


    @property
    def name(self):
        """
        A readonly property for accessing the C{name} attribute of
        this record.

        @return: The DNS name associated with this record. Since this
            is a pseudo record, the name is always an L{Name} instance
            with value b'', which represents the DNS root zone.
        """
        return Name(b'')


    @property
    def type(self):
        """
        A readonly property for accessing the C{type} attribute of
        this record.

        @return: The DNS record type. This is a fixed value of 41
            (C{dns.OPT} for OPT Record.
        """
        return OPT


    def encode(self, strio, compDict=None):
        """
        Encode this L{_OPTHeader} instance to bytes.

        @type strio: L{file}
        @param strio: the byte representation of this L{_OPTHeader}
            will be written to this file.

        @type compDict: L{dict} or L{None}
        @param compDict: A dictionary of backreference addresses that
            have already been written to this stream and that may
            be used for DNS name compression.
        """
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
        """
        Decode bytes into an L{_OPTHeader} instance.

        @type strio: L{file}
        @param strio: Bytes will be read from this file until the full
            L{_OPTHeader} is decoded.

        @type length: L{int} or L{None}
        @param length: Not used.
        """

        h = RRHeader()
        h.decode(strio, length)
        h.payload = UnknownRecord(readPrecisely(strio, h.rdlength))

        newOptHeader = self.fromRRHeader(h)

        for attrName in self.compareAttributes:
            if attrName not in ('name', 'type'):
                setattr(self, attrName, getattr(newOptHeader, attrName))


    @classmethod
    def fromRRHeader(cls, rrHeader):
        """
        A classmethod for constructing a new L{_OPTHeader} from the
        attributes and payload of an existing L{RRHeader} instance.

        @type rrHeader: L{RRHeader}
        @param rrHeader: An L{RRHeader} instance containing an
            L{UnknownRecord} payload.

        @return: An instance of L{_OPTHeader}.
        @rtype: L{_OPTHeader}
        """
        options = None
        if rrHeader.payload is not None:
            options = []
            optionsBytes = BytesIO(rrHeader.payload.data)
            optionsBytesLength = len(rrHeader.payload.data)
            while optionsBytes.tell() < optionsBytesLength:
                o = _OPTVariableOption()
                o.decode(optionsBytes)
                options.append(o)

        # Decode variable options if present
        return cls(
            udpPayloadSize=rrHeader.cls,
            extendedRCODE=rrHeader.ttl >> 24,
            version=rrHeader.ttl >> 16 & 0xff,
            dnssecOK=(rrHeader.ttl & 0xffff) >> 15,
            options=options
            )



@implementer(IEncodable)
class _OPTVariableOption(tputil.FancyStrMixin, tputil.FancyEqMixin, object):
    """
    A class to represent OPT record variable options.

    @see: L{_OPTVariableOption.__init__} for documentation of public
        instance attributes.

    @see: L{https://tools.ietf.org/html/rfc6891#section-6.1.2}

    @since: 13.2
    """
    showAttributes = ('code', ('data', nativeString))
    compareAttributes = ('code', 'data')

    _fmt = '!HH'

    def __init__(self, code=0, data=b''):
        """
        @type code: L{int}
        @param code: The option code

        @type data: L{bytes}
        @param data: The option data
        """
        self.code = code
        self.data = data


    def encode(self, strio, compDict=None):
        """
        Encode this L{_OPTVariableOption} to bytes.

        @type strio: L{file}
        @param strio: the byte representation of this
            L{_OPTVariableOption} will be written to this file.

        @type compDict: L{dict} or L{None}
        @param compDict: A dictionary of backreference addresses that
            have already been written to this stream and that may
            be used for DNS name compression.
        """
        strio.write(
            struct.pack(self._fmt, self.code, len(self.data)) + self.data)


    def decode(self, strio, length=None):
        """
        Decode bytes into an L{_OPTVariableOption} instance.

        @type strio: L{file}
        @param strio: Bytes will be read from this file until the full
            L{_OPTVariableOption} is decoded.

        @type length: L{int} or L{None}
        @param length: Not used.
        """
        l = struct.calcsize(self._fmt)
        buff = readPrecisely(strio, l)
        self.code, length = struct.unpack(self._fmt, buff)
        self.data = readPrecisely(strio, length)



@implementer(IEncodable)
class RRHeader(tputil.FancyEqMixin):
    """
    A resource record header.

    @cvar fmt: C{str} specifying the byte format of an RR.

    @ivar name: The name about which this reply contains information.
    @ivar type: The query type of the original request.
    @ivar cls: The query class of the original request.
    @ivar ttl: The time-to-live for this record.
    @ivar payload: An object that implements the IEncodable interface

    @ivar auth: A C{bool} indicating whether this C{RRHeader} was parsed from an
        authoritative message.
    """
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
        """
        @type name: C{bytes}
        @param name: The name about which this reply contains information.

        @type type: C{int}
        @param type: The query type.

        @type cls: C{int}
        @param cls: The query class.

        @type ttl: C{int}
        @param ttl: Time to live for this record.

        @type payload: An object implementing C{IEncodable}
        @param payload: A Query Type specific data object.

        @raises ValueError: if the ttl is negative.
        """
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


    def decode(self, strio, length = None):
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
    """
    A Resource Record which consists of a single RFC 1035 domain-name.

    @type name: L{Name}
    @ivar name: The name associated with this record.

    @type ttl: C{int}
    @ivar ttl: The maximum number of seconds which this record should be
        cached.
    """
    showAttributes = (('name', 'name', '%s'), 'ttl')
    compareAttributes = ('name', 'ttl')

    TYPE = None
    name = None

    def __init__(self, name=b'', ttl=None):
        self.name = Name(name)
        self.ttl = str2time(ttl)


    def encode(self, strio, compDict = None):
        self.name.encode(strio, compDict)


    def decode(self, strio, length = None):
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
    """
    An IPv4 host address.

    @type address: C{str}
    @ivar address: The packed network-order representation of the IPv4 address
        associated with this record.

    @type ttl: C{int}
    @ivar ttl: The maximum number of seconds which this record should be
        cached.
    """
    compareAttributes = ('address', 'ttl')

    TYPE = A
    address = None

    def __init__(self, address='0.0.0.0', ttl=None):
        address = socket.inet_aton(address)
        self.address = address
        self.ttl = str2time(ttl)


    def encode(self, strio, compDict = None):
        strio.write(self.address)


    def decode(self, strio, length = None):
        self.address = readPrecisely(strio, 4)


    def __hash__(self):
        return hash(self.address)


    def __str__(self):
        return '<A address=%s ttl=%s>' % (self.dottedQuad(), self.ttl)
    __repr__ = __str__


    def dottedQuad(self):
        return socket.inet_ntoa(self.address)



@implementer(IEncodable, IRecord)
class Record_SOA(tputil.FancyEqMixin, tputil.FancyStrMixin):
    """
    Marks the start of a zone of authority.

    This record describes parameters which are shared by all records within a
    particular zone.

    @type mname: L{Name}
    @ivar mname: The domain-name of the name server that was the original or
        primary source of data for this zone.

    @type rname: L{Name}
    @ivar rname: A domain-name which specifies the mailbox of the person
        responsible for this zone.

    @type serial: C{int}
    @ivar serial: The unsigned 32 bit version number of the original copy of
        the zone.  Zone transfers preserve this value.  This value wraps and
        should be compared using sequence space arithmetic.

    @type refresh: C{int}
    @ivar refresh: A 32 bit time interval before the zone should be refreshed.

    @type minimum: C{int}
    @ivar minimum: The unsigned 32 bit minimum TTL field that should be
        exported with any RR from this zone.

    @type expire: C{int}
    @ivar expire: A 32 bit time value that specifies the upper limit on the
        time interval that can elapse before the zone is no longer
        authoritative.

    @type retry: C{int}
    @ivar retry: A 32 bit time interval that should elapse before a failed
        refresh should be retried.

    @type ttl: C{int}
    @ivar ttl: The default TTL to use for records served from this zone.
    """
    fancybasename = 'SOA'
    compareAttributes = ('serial', 'mname', 'rname', 'refresh', 'expire', 'retry', 'minimum', 'ttl')
    showAttributes = (('mname', 'mname', '%s'), ('rname', 'rname', '%s'), 'serial', 'refresh', 'retry', 'expire', 'minimum', 'ttl')

    TYPE = SOA

    def __init__(self, *args, **kwargs):
        """
        Accept positional arguments in the original order or keyword arguments.
        """
        param_names = ('mname', 'rname', 'serial', 'refresh', 'retry',
                       'expire', 'minimum', 'ttl')
        values = {}
        for name, value in zip(param_names, args):
            values[name] = value
        values.update(kwargs)
        self.mname = Name(values.get('mname', b''))
        self.rname = Name(values.get('rname', b''))
        self.serial = str2time(values.get('serial', 0))
        self.refresh = str2time(values.get('refresh', 0))
        self.retry = str2time(values.get('retry', 0))
        self.expire = str2time(values.get('expire', 0))
        self.minimum = str2time(values.get('minimum', 0))
        self.ttl = str2time(values.get('ttl'))


    def encode(self, strio, compDict = None):
        self.mname.encode(strio, compDict)
        self.rname.encode(strio, compDict)
        strio.write(
            struct.pack(
                '!LlllL',
                self.serial, self.refresh, self.retry, self.expire,
                self.minimum
            )
        )


    def decode(self, strio, length = None):
        self.mname = Name()
        self.rname = Name()
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


    def encode(self, strio, compDict = None):
        strio.write(self.payload)


    def decode(self, strio, length = None):
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


    def encode(self, strio, compDict = None):
        strio.write(self.address)
        strio.write(struct.pack('!B', self.protocol))
        strio.write(self.map)


    def decode(self, strio, length = None):
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


    def encode(self, strio, compDict = None):
        strio.write(self.address)


    def decode(self, strio, length = None):
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


    def encode(self, strio, compDict = None):
        strio.write(struct.pack('!B', self.prefixLen))
        if self.bytes:
            strio.write(self.suffix[-self.bytes:])
        if self.prefixLen:
            self.prefix.encode(strio, None)


    def decode(self, strio, length = None):
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

    def __init__(self, *args, **kwargs):
        """
        Accept positional arguments in the original order or keyword arguments.
        """
        param_names = ('priority', 'weight', 'port', 'target', 'ttl')
        values = {}
        for name, value in zip(param_names, args):
            values[name] = value
        values.update(kwargs)
        self.priority = int(values.get('priority', 0))
        self.weight = int(values.get('weight', 0))
        self.port = int(values.get('port', 0))
        self.target = Name(values.get('target', b''))
        self.ttl = str2time(values.get('ttl'))


    def encode(self, strio, compDict = None):
        strio.write(struct.pack('!HHH', self.priority, self.weight, self.port))
        self.target.encode(strio, None)


    def decode(self, strio, length = None):
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

    def __init__(self, *args, **kwargs):
        """
        Accept positional arguments in the original order or keyword arguments.
        """
        param_names = ('order', 'preference', 'flags', 'service',
                       'regexp', 'replacement', 'ttl')
        values = {}
        for name, value in zip(param_names, args):
            values[name] = value
        values.update(kwargs)
        self.order = int(values.get('order', 0))
        self.preference = int(values.get('preference', 0))
        self.flags = Charstr(values.get('flags', b''))
        self.service = Charstr(values.get('service', b''))
        self.regexp = Charstr(values.get('regexp', b''))
        self.replacement = Name(values.get('replacement', b''))
        self.ttl = str2time(values.get('ttl'))


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


    def encode(self, strio, compDict = None):
        strio.write(struct.pack('!H', self.subtype))
        self.hostname.encode(strio, compDict)


    def decode(self, strio, length = None):
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


    def encode(self, strio, compDict = None):
        self.mbox.encode(strio, compDict)
        self.txt.encode(strio, compDict)


    def decode(self, strio, length = None):
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


    def encode(self, strio, compDict = None):
        strio.write(struct.pack('!B', len(self.cpu)) + self.cpu)
        strio.write(struct.pack('!B', len(self.os)) + self.os)


    def decode(self, strio, length = None):
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


    def encode(self, strio, compDict = None):
        self.rmailbx.encode(strio, compDict)
        self.emailbx.encode(strio, compDict)


    def decode(self, strio, length = None):
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

    def encode(self, strio, compDict = None):
        strio.write(struct.pack('!H', self.preference))
        self.name.encode(strio, compDict)


    def decode(self, strio, length = None):
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

    def __init__(self, *args, **kwargs):
        """
        Accept positional arguments in the original order or keyword arguments.
        """
        param_names = ('id', 'answer', 'opCode', 'recDes', 'recAv',
                       'auth', 'rCode', 'trunc', 'maxSize',
                       'authenticData', 'checkingDisabled')
        values = {}
        for name, value in zip(param_names, args):
            values[name] = value
        values.update(kwargs)

        self.maxSize = values.get('maxSize', 512)
        self.id = values.get('id', 0)
        self.answer = values.get('answer', 0)
        self.opCode = values.get('opCode', 0)
        self.auth = values.get('auth', 0)
        self.trunc = values.get('trunc', 0)
        self.recDes = values.get('recDes', 0)
        self.recAv = values.get('recAv', 0)
        self.rCode = values.get('rCode', OK)
        self.authenticData = values.get('authenticData', 0)
        self.checkingDisabled = values.get('checkingDisabled', 0)

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

    def __init__(self, *args, **kwargs):
        """
        Accept positional arguments in the original order or keyword arguments.
        """
        param_names = ('id', 'answer', 'opCode', 'auth', 'trunc',
                       'recDes', 'recAv', 'rCode', 'ednsVersion',
                       'dnssecOK', 'authenticData', 'checkingDisabled',
                       'maxSize', 'queries', 'answers', 'authority',
                       'additional')
        values = {}
        for name, value in zip(param_names, args):
            values[name] = value
        values.update(kwargs)

        self.id = values.get('id', 0)
        self.answer = values.get('answer', False)
        self.opCode = values.get('opCode', OP_QUERY)
        self.auth = values.get('auth', False)
        self.trunc = values.get('trunc', False)
        self.recDes = values.get('recDes', False)
        self.recAv = values.get('recAv', False)
        self.rCode = values.get('rCode', 0)
        self.ednsVersion = values.get('ednsVersion', 0)
        self.dnssecOK = values.get('dnssecOK', False)
        self.authenticData = values.get('authenticData', False)
        self.checkingDisabled = values.get('checkingDisabled', False)
        self.maxSize = values.get('maxSize', 512)

        self.queries = values.get('queries', [])
        self.answers = values.get('answers', [])
        self.authority = values.get('authority', [])
        self.additional = values.get('additional', [])


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