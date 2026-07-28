""" Multicast DNS Service Discovery for Python
    Copyright (C) 2003, Paul Scott-Murphy
    Copyright (C) 2009, Alexander Solovyov

    This module provides a framework for the use of DNS Service Discovery
    using IP multicast.  It has been tested against the JRendezvous
    implementation from <a href="http://strangeberry.com">StrangeBerry</a>,
    against the mDNSResponder from Mac OS X 10.3.8, 10.5.6, and against
    Avahi library under various Linux distributions.

    This library is free software; you can redistribute it and/or
    modify it under the terms of the GNU Lesser General Public
    License as published by the Free Software Foundation; either
    version 2.1 of the License, or (at your option) any later version.

    This library is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
    Lesser General Public License for more details.

"""

"""0.13 update - fix IPv6 support
                 some cleanups in code"""

"""0.12 update - allow selection of binding interface
         typo fix - Thanks A. M. Kuchlingi
         removed all use of word 'Rendezvous' - this is an API change"""

"""0.11 update - correction to comments for addListener method
                 support for new record types seen from OS X
                  - IPv6 address
                  - hostinfo
                 ignore unknown DNS record types
                 fixes to name decoding
                 works alongside other processes using port 5353 (e.g. on Mac OS X)
                 tested against Mac OS X 10.3.2's mDNSResponder
                 corrections to removal of list entries for service browser"""

"""0.10 update - Jonathon Paisley contributed these corrections:
                 always multicast replies, even when query is unicast
                 correct a pointer encoding problem
                 can now write records in any order
                 traceback shown on failure
                 better TXT record parsing
                 server is now separate from name
                 can cancel a service browser

                 modified some unit tests to accommodate these changes"""

"""0.09 update - remove all records on service unregistration
                 fix DOS security problem with readName"""

"""0.08 update - changed licensing to LGPL"""

"""0.07 update - faster shutdown on engine
                 pointer encoding of outgoing names
                 ServiceBrowser now works
                 new unit tests"""

"""0.06 update - small improvements with unit tests
                 added defined exception types
                 new style objects
                 fixed hostname/interface problem
                 fixed socket timeout problem
                 fixed addServiceListener() typo bug
                 using select() for socket reads
                 tested on Debian unstable with Python 2.2.2"""

"""0.05 update - ensure case insensitivty on domain names
                 support for unicast DNS queries"""

"""0.04 update - added some unit tests
                 added __ne__ adjuncts where required
                 ensure names end in '.local.'
                 timeout on receiving socket for clean shutdown"""

__author__ = "Paul Scott-Murphy"
__email__ = "paul at scott dash murphy dot com"
__version__ = "0.12"

import string
import time
import struct
import socket
import threading
import select
import traceback

__all__ = ["Zeroconf", "ServiceInfo", "ServiceBrowser"]

# hook for threads

globals()['_GLOBAL_DONE'] = 0

# Some timing constants

_UNREGISTER_TIME = 125
_CHECK_TIME = 175
_REGISTER_TIME = 225
_LISTENER_TIME = 200
_BROWSER_TIME = 500

# Some DNS constants

_MDNS_ADDR = '224.0.0.251'
_MDNS_PORT = 5353
_DNS_PORT = 53
_DNS_TTL = 60 * 60
# one hour default TTL

_MAX_MSG_TYPICAL = 1460  # unused
_MAX_MSG_ABSOLUTE = 8972

_FLAGS_QR_MASK = 0x8000  # query response mask
_FLAGS_QR_QUERY = 0x0000  # query
_FLAGS_QR_RESPONSE = 0x8000  # response

_FLAGS_AA = 0x0400  # Authorative answer
_FLAGS_TC = 0x0200  # Truncated
_FLAGS_RD = 0x0100  # Recursion desired
_FLAGS_RA = 0x8000  # Recursion available

_FLAGS_Z = 0x0040  # Zero
_FLAGS_AD = 0x0020  # Authentic data
_FLAGS_CD = 0x0010  # Checking disabled

_CLASS_IN = 1
_CLASS_CS = 2
_CLASS_CH = 3
_CLASS_HS = 4
_CLASS_NONE = 254
_CLASS_ANY = 255
_CLASS_MASK = 0x7FFF
_CLASS_UNIQUE = 0x8000

_TYPE_A = 1
_TYPE_NS = 2
_TYPE_MD = 3
_TYPE_MF = 4
_TYPE_CNAME = 5
_TYPE_SOA = 6
_TYPE_MB = 7
_TYPE_MG = 8
_TYPE_MR = 9
_TYPE_NULL = 10
_TYPE_WKS = 11
_TYPE_PTR = 12
_TYPE_HINFO = 13
_TYPE_MINFO = 14
_TYPE_MX = 15
_TYPE_TXT = 16
_TYPE_AAAA = 28
_TYPE_SRV = 33
_TYPE_ANY =  255

# Mapping constants to names

_CLASSES = {_CLASS_IN : "in",
             _CLASS_CS : "cs",
             _CLASS_CH : "ch",
             _CLASS_HS : "hs",
             _CLASS_NONE : "none",
             _CLASS_ANY : "any"}

_TYPES = {_TYPE_A : "a",
           _TYPE_NS : "ns",
           _TYPE_MD : "md",
           _TYPE_MF : "mf",
           _TYPE_CNAME : "cname",
           _TYPE_SOA : "soa",
           _TYPE_MB : "mb",
           _TYPE_MG : "mg",
           _TYPE_MR : "mr",
           _TYPE_NULL : "null",
           _TYPE_WKS : "wks",
           _TYPE_PTR : "ptr",
           _TYPE_HINFO : "hinfo",
           _TYPE_MINFO : "minfo",
           _TYPE_MX : "mx",
           _TYPE_TXT : "txt",
           _TYPE_AAAA : "quada",
           _TYPE_SRV : "srv",
           _TYPE_ANY : "any"}

# utility functions


def currentTimeMillis():
    """Current system time in milliseconds"""
    return time.time() * 1000


def ntop(address):
    """Convert address to its string representation"""
    af = len(address) == 4 and socket.AF_INET or socket.AF_INET6
    return socket.inet_ntop(af, address)


def address_type(address):
    """Return appropriate record type for an address"""
    return len(address) == 4 and _TYPE_A or _TYPE_AAAA

# Exceptions


class MalformedPacketException(Exception):
    pass


class NonLocalNameException(Exception):
    pass


class NonUniqueNameException(Exception):
    pass


class NamePartTooLongException(Exception):
    pass


class AbstractMethodException(Exception):
    pass


class BadTypeInNameException(Exception):
    pass


class BadDomainName(Exception):

    def __init__(self, pos):
        Exception.__init__(self, "at position " + str(pos))


class BadDomainNameCircular(BadDomainName):
    pass

# implementation classes


class DNSEntry(object):

    """A DNS entry"""

    def __init__(self, name, type, clazz):
        self.key = string.lower(name)
        self.name = name
        self.type = type
        self.clazz = clazz & _CLASS_MASK
        self.unique = (clazz & _CLASS_UNIQUE) != 0

    def __eq__(self, other):
        """Equality test on name, type, and class"""
        if isinstance(other, DNSEntry):
            return self.name == other.name and self.type == other.type and self.clazz == other.clazz
        return 0

    def __ne__(self, other):
        """Non-equality test"""
        return not self.__eq__(other)

    def getClazz(self, clazz):
        """Class accessor"""
        try:
            return _CLASSES[clazz]
        except:
            return "?(%s)" % (clazz)

    def getType(self, type):
        """Type accessor"""
        try:
            return _TYPES[type]
        except:
            return "?(%s)" % (type)

    def toString(self, hdr, other):
        """String representation with additional information"""
        result = "%s[%s,%s" % (hdr, self.getType(self.type), self.getClazz(self.clazz))
        if self.unique:
            result += "-unique,"
        else:
            result += ","
        result += self.name
        if other is not None:
            result += ",%s]" % (other)
        else:
            result += "]"
        return result


class DNSQuestion(DNSEntry):

    """A DNS question entry"""

    def __init__(self, name, type, clazz):
        if not name.endswith(".local."):
            raise NonLocalNameException(name)
        DNSEntry.__init__(self, name, type, clazz)

    def answeredBy(self, rec):
        """Returns true if the question is answered by the record"""
        return self.clazz == rec.clazz and (self.type == rec.type or self.type == _TYPE_ANY) and self.name == rec.name

    def __repr__(self):
        """String representation"""
        return DNSEntry.toString(self, "question", None)


class DNSRecord(DNSEntry):

    """A DNS record - like a DNS entry, but has a TTL"""

    def __init__(self, name, type, clazz, ttl):
        DNSEntry.__init__(self, name, type, clazz)
        self.ttl = ttl
        self.created = currentTimeMillis()

    def __eq__(self, other):
        """Tests equality as per DNSRecord"""
        if isinstance(other, DNSRecord):
            return DNSEntry.__eq__(self, other)
        return 0

    def suppressedBy(self, msg):
        """Returns true if any answer in a message can suffice for the
        information held in this record."""
        for record in msg.answers:
            if self.suppressedByAnswer(record):
                return 1
        return 0

    def suppressedByAnswer(self, other):
        """Returns true if another record has same name, type and class,
        and if its TTL is at least half of this record's."""
        if self == other and other.ttl > (self.ttl / 2):
            return 1
        return 0

    def getExpirationTime(self, percent):
        """Returns the time at which this record will have expired
        by a certain percentage."""
        return self.created + (percent * self.ttl * 10)

    def getRemainingTTL(self, now):
        """Returns the remaining TTL in seconds."""
        return max(0, (self.getExpirationTime(100) - now) / 1000)

    def isExpired(self, now):
        """Returns true if this record has expired."""
        return self.getExpirationTime(100) <= now

    def isStale(self, now):
        """Returns true if this record is at least half way expired."""
        return self.getExpirationTime(50) <= now

    def resetTTL(self, other):
        """Sets this record's TTL and created time to that of
        another record."""
        self.created = other.created
        self.ttl = other.ttl

    def write(self, out):
        """Abstract method"""
        raise AbstractMethodException

    def toString(self, other):
        """String representation with addtional information"""
        arg = "%s/%s,%s" % (self.ttl, self.getRemainingTTL(currentTimeMillis()), other)
        return DNSEntry.toString(self, "record", arg)


class DNSAddress(DNSRecord):

    """A DNS address record"""

    def __init__(self, name, type, clazz, ttl, address):
        DNSRecord.__init__(self, name, type, clazz, ttl)
        self.address = address

    def write(self, out):
        """Used in constructing an outgoing packet"""
        out.writeString(self.address, len(self.address))

    def __eq__(self, other):
        """Tests equality on address"""
        if isinstance(other, DNSAddress):
            return self.address == other.address
        return 0

    def __repr__(self):
        """String representation"""
        try:
            return 'record[%s]' % ntop(self.address)
        except:
            return 'record[%s]' % self.address


class DNSHinfo(DNSRecord):

    """A DNS host information record"""

    def __init__(self, name, type, clazz, ttl, cpu, os):
        DNSRecord.__init__(self, name, type, clazz, ttl)
        self.cpu = cpu
        self.os = os

    def write(self, out):
        """Used in constructing an outgoing packet"""
        out.writeString(self.cpu, len(self.cpu))
        out.writeString(self.os, len(self.os))

    def __eq__(self, other):
        """Tests equality on cpu and os"""
        if isinstance(other, DNSHinfo):
            return self.cpu == other.cpu and self.os == other.os
        return 0

    def __repr__(self):
        """String representation"""
        return self.cpu + " " + self.os


class DNSPointer(DNSRecord):

    """A DNS pointer record"""

    def __init__(self, name, type, clazz, ttl, alias):
        DNSRecord.__init__(self, name, type, clazz, ttl)
        self.alias = alias

    def write(self, out):
        """Used in constructing an outgoing packet"""
        out.writeName(self.alias)

    def __eq__(self, other):
        """Tests equality on alias"""
        if isinstance(other, DNSPointer):
            return self.alias == other.alias
        return 0

    def __repr__(self):
        """String representation"""
        return self.toString(self.alias)


class DNSText(DNSRecord):

    """A DNS text record"""

    def __init__(self, name, type, clazz, ttl, text):
        DNSRecord.__init__(self, name, type, clazz, ttl)
        self.text = text

    def write(self, out):
        """Used in constructing an outgoing packet"""
        out.writeString(self.text, len(self.text))

    def __eq__(self, other):
        """Tests equality on text"""
        if isinstance(other, DNSText):
            return self.text == other.text
        return 0

    def __repr__(self):
        """String representation"""
        if len(self.text) > 10:
            return self.toString(self.text[:7] + "...")
        else:
            return self.toString(self.text)


class DNSService(DNSRecord):

    """A DNS service record"""

    def __init__(self, name, type, clazz, ttl, priority, weight, port, server):
        DNSRecord.__init__(self, name, type, clazz, ttl)
        self.priority = priority
        self.weight = weight
        self.port = port
        self.server = server

    def write(self, out):
        """Used in constructing an outgoing packet"""
        out.writeShort(self.priority)
        out.writeShort(self.weight)
        out.writeShort(self.port)
        out.writeName(self.server)

    def __eq__(self, other):
        """Tests equality on priority, weight, port and server"""
        if isinstance(other, DNSService):
            return (self.priority == other.priority and self.weight == other.weight and
                    self.port == other.port and self.server == other.server)
        return 0

    def __repr__(self):
        """String representation"""
        return self.toString("%s:%s" % (self.server, self.port))


class DNSIncoming(object):

    """Object representation of an incoming DNS packet"""

    def __init__(self, data):
        """Constructor from string holding bytes of packet"""
        self.offset = 0
        self.data = data
        self.questions = []
        self.answers = []
        self.numQuestions = 0
        self.numAnswers = 0
        self.numAuthorities = 0
        self.numAdditionals = 0

        self.readHeader()
        self.readQuestions()
        self.readOthers()

    def readHeader(self):
        """Reads header portion of packet"""
        fmt = '!HHHHHH'
        length = struct.calcsize(fmt)
        info = struct.unpack(fmt, self.data[self.offset:self.offset+length])
        self.offset += length

        self.id = info[0]
        self.flags = info[1]
        self.numQuestions = info[2]
        self.numAnswers = info[3]
        self.numAuthorities = info[4]
        self.numAdditionals = info[5]

    def readQuestions(self):
        """Reads questions section of packet"""
        fmt = '!HH'
        length = struct.calcsize(fmt)
        for _ in range(self.numQuestions):
            name = self.readName()
            info = struct.unpack(fmt, self.data[self.offset:self.offset+length])
            self.offset += length
            try:
                q = DNSQuestion(name, info[0], info[1])
                self.questions.append(q)
            except NonLocalNameException:
                pass

    def readInt(self):
        """Reads an integer from the packet"""
        fmt = '!I'
        length = struct.calcsize(fmt)
        info = struct.unpack(fmt, self.data[self.offset:self.offset+length])
        self.offset += length
        return info[0]

    def readCharacterString(self):
        """Reads a character string from the packet"""
        length = ord(self.data[self.offset])
        self.offset += 1
        return self.readString(length)

    def readString(self, length):
        """Reads a string of a given length from the packet"""
        fmt = '!' + str(length) + 's'
        size = struct.calcsize(fmt)
        info = struct.unpack(fmt, self.data[self.offset:self.offset+size])
        self.offset += size
        return info[0]

    def readUnsignedShort(self):
        """Reads an unsigned short from the packet"""
        fmt = '!H'
        length = struct.calcsize(fmt)
        info = struct.unpack(fmt, self.data[self.offset:self.offset+length])
        self.offset += length
        return info[0]

    def readOthers(self):
        """Reads the answers, authorities and additionals section of the packet"""
        fmt = '!HHiH'
        length = struct.calcsize(fmt)
        n = self.numAnswers + self.numAuthorities + self.numAdditionals
        for _ in range(n):
            domain = self.readName()
            info = struct.unpack(fmt, self.data[self.offset:self.offset+length])
            self.offset += length

            rec = None
            if info[0] == _TYPE_A:
                rec = DNSAddress(domain, info[0], info[1], info[2], self.readString(4))
            elif info[0] in (_TYPE_CNAME, _TYPE_PTR):
                rec = DNSPointer(domain, info[0], info[1], info[2], self.readName())
            elif info[0] == _TYPE_TXT:
                rec = DNSText(domain, info[0], info[1], info[2], self.readString(info[3]))
            elif info[0] == _TYPE_SRV:
                rec = DNSService(domain, info[0], info[1], info[2],
                                 self.readUnsignedShort(),
                                 self.readUnsignedShort(),
                                 self.readUnsignedShort(),
                                 self.readName())
            elif info[0] == _TYPE_HINFO:
                rec = DNSHinfo(domain, info[0], info[1], info[2],
                               self.readCharacterString(),
                               self.readCharacterString())
            elif info[0] == _TYPE_AAAA:
                rec = DNSAddress(domain, info[0], info[1], info[2], self.readString(16))
            else:
                self.offset += info[3]

            if rec:
                self.answers.append(rec)

    def isQuery(self):
        """Returns true if this is a query"""
        return (self.flags & _FLAGS_QR_MASK) == _FLAGS_QR_QUERY

    def isResponse(self):
        """Returns true if this is a response"""
        return (self.flags & _FLAGS_QR_MASK) == _FLAGS_QR_RESPONSE

    def readUTF(self, offset, length):
        """Reads a UTF-8 string of a given length from the packet"""
        return self.data[offset:offset+length].decode('utf-8')

    def readName(self):
        """Reads a domain name from the packet"""
        result = ''
        off = self.offset
        next_ptr = -1
        first = off

        while True:
            try:
                length = ord(self.data[off])
                off += 1
                if length == 0:
                    break
                t = length & 0xC0
                if t == 0x00:
                    result += self.readUTF(off, length) + '.'
                    off += length
                elif t == 0xC0:
                    if next_ptr < 0:
                        next_ptr = off + 1
                    off = ((length & 0x3F) << 8) | ord(self.data[off])
                    if off >= first:
                        raise BadDomainNameCircular(off)
                    first = off
                else:
                    raise BadDomainName(off)
            except IndexError:
                raise MalformedPacketException()

        self.offset = next_ptr if next_ptr >= 0 else off
        return result


class DNSOutgoing(object):

    """Object representation of an outgoing packet"""

    def __init__(self, flags, multicast=1):
        self.finished = 0
        self.id = 0
        self.multicast = multicast
        self.flags = flags
        self.names = {}
        self.data = []
        self.size = 12

        self.questions = []
        self.answers = []
        self.authorities = []
        self.additionals = []

    def addQuestion(self, record):
        """Adds a question"""
        self.questions.append(record)

    def addAnswer(self, inp, record):
        """Adds an answer"""
        if not record.suppressedBy(inp):
            self.addAnswerAtTime(record, 0)

    def addAnswerAtTime(self, record, now):
        """Adds an answer if it does not expire by a certain time"""
        if record and (now == 0 or not record.isExpired(now)):
            self.answers.append((record, now))

    def addAuthorativeAnswer(self, record):
        """Adds an authoritative answer"""
        self.authorities.append(record)

    def addAdditionalAnswer(self, record):
        """Adds an additional answer"""
        self.additionals.append(record)

    def writeByte(self, value):
        """Writes a single byte to the packet"""
        self.data.append(struct.pack('!c', chr(value)))
        self.size += 1

    def insertShort(self, index, value):
        """Inserts an unsigned short in a certain position in the packet"""
        self.data.insert(index, struct.pack('!H', value))
        self.size += 2

    def writeShort(self, value):
        """Writes an unsigned short to the packet"""
        self.data.append(struct.pack('!H', value))
        self.size += 2

    def writeInt(self, value):
        """Writes an unsigned integer to the packet"""
        self.data.append(struct.pack('!I', int(value)))
        self.size += 4

    def writeString(self, value, length):
        """Writes a string to the packet"""
        self.data.append(struct.pack('!' + str(length) + 's', value))
        self.size += length

    def writeUTF(self, s):
        """Writes a UTF-8 string of a given length to the packet"""
        utf = s.encode('utf-8')
        if len(utf) > 64:
            raise NamePartTooLongException
        self.writeByte(len(utf))
        self.writeString(utf, len(utf))

    def writeName(self, name):
        """Writes a domain name to the packet"""
        try:
            index = self.names[name]
        except KeyError:
            self.names[name] = self.size
            parts = name.split('.')
            if parts[-1] == '':
                parts = parts[:-1]
            for part in parts:
                self.writeUTF(part)
            self.writeByte(0)
            return

        self.writeByte((index >> 8) | 0xC0)
        self.writeByte(index)

    def writeQuestion(self, question):
        """Writes a question to the packet"""
        self.writeName(question.name)
        self.writeShort(question.type)
        self.writeShort(question.clazz)

    def writeRecord(self, record, now):
        """Writes a record (answer, authoritative answer, additional) to the packet"""
        self.writeName(record.name)
        self.writeShort(record.type)
        if record.unique and self.multicast:
            self.writeShort(record.clazz | _CLASS_UNIQUE)
        else:
            self.writeShort(record.clazz)
        self.writeInt(record.ttl if now == 0 else record.getRemainingTTL(now))
        index = len(self.data)
        self.size += 2
        record.write(self)
        self.size -= 2
        length = len(''.join(self.data[index:]))
        self.insertShort(index, length)

    def packet(self):
        """Returns a string containing the packet's bytes"""
        if not self.finished:
            self.finished = 1
            for q in self.questions:
                self.writeQuestion(q)
            for ans, atime in self.answers:
                self.writeRecord(ans, atime)
            for auth in self.authorities:
                self.writeRecord(auth, 0)
            for add in self.additionals:
                self.writeRecord(add, 0)

            self.insertShort(0, len(self.additionals))
            self.insertShort(0, len(self.authorities))
            self.insertShort(0, len(self.answers))
            self.insertShort(0, len(self.questions))
            self.insertShort(0, self.flags)
            if self.multicast:
                self.insertShort(0, 0)
            else:
                self.insertShort(0, self.id)
        return ''.join(self.data)


class DNSCache(object):

    """A cache of DNS entries"""

    def __init__(self):
        self.cache = {}

    def add(self, entry):
        """Adds an entry"""
        self.cache.setdefault(entry.key, []).append(entry)

    def remove(self, entry):
        """Removes an entry"""
        try:
            self.cache[entry.key].remove(entry)
        except:
            pass

    def get(self, entry):
        """Gets an entry by key."""
        try:
            lst = self.cache[entry.key]
            return lst[lst.index(entry)]
        except:
            return None

    def getByDetails(self, name, type, clazz):
        """Gets an entry by details."""
        return self.get(DNSEntry(name, type, clazz))

    def entriesWithName(self, name):
        """Returns a list of entries whose key matches the name."""
        return self.cache.get(name, [])

    def entries(self):
        """Returns a list of all entries"""
        try:
            return reduce(lambda x, y: x + y, self.cache.values())
        except:
            return []


class Engine(threading.Thread):

    """An engine wraps read access to sockets, allowing objects that
    need to receive data from sockets to be called back when the
    sockets are ready.
    """

    def __init__(self, zeroconf):
        threading.Thread.__init__(self)
        self.zeroconf = zeroconf
        self.readers = {}
        self.timeout = 5
        self.condition = threading.Condition()
        self.setDaemon(True)
        self.start()

    def run(self):
        while not globals()['_GLOBAL_DONE']:
            rs = self.getReaders()
            if not rs:
                self.condition.acquire()
                self.condition.wait(self.timeout)
                self.condition.release()
                continue
            from calibre.constants import DEBUG
            try:
                rr, _, _ = select.select(rs, [], [], self.timeout)
                if globals()['_GLOBAL_DONE']:
                    continue
                for sock in rr:
                    try:
                        self.readers[sock].handle_read()
                    except MalformedPacketException:
                        pass
                    except:
                        if DEBUG:
                            traceback.print_exc()
            except:
                pass

    def getReaders(self):
        self.condition.acquire()
        result = list(self.readers.keys())
        self.condition.release()
        return result

    def addReader(self, reader, socket):
        self.condition.acquire()
        self.readers[socket] = reader
        self.condition.notify()
        self.condition.release()

    def delReader(self, socket):
        self.condition.acquire()
        del self.readers[socket]
        self.condition.notify()
        self.condition.release()

    def notify(self):
        self.condition.acquire()
        self.condition.notify()
        self.condition.release()


class Listener(object):

    """A Listener is used by this module to listen on the multicast
    group to which DNS messages are sent, allowing the implementation
    to cache information as it arrives.
    """

    def __init__(self, zeroconf):
        self.zeroconf = zeroconf
        self.zeroconf.engine.addReader(self, self.zeroconf.socket)

    def handle_read(self):
        data, (addr, port) = self.zeroconf.socket.recvfrom(_MAX_MSG_ABSOLUTE)
        msg = DNSIncoming(data)
        if msg.isQuery():
            if port == _MDNS_PORT:
                self.zeroconf.handleQuery(msg, _MDNS_ADDR, _MDNS_PORT)
            else:
                self.zeroconf.handleQuery(msg, addr, port)
                self.zeroconf.handleQuery(msg, _MDNS_ADDR, _MDNS_PORT)
        else:
            self.zeroconf.handleResponse(msg)


class Reaper(threading.Thread):

    """A Reaper is used by this module to remove cache entries that
    have expired.
    """

    def __init__(self, zeroconf):
        threading.Thread.__init__(self)
        self.setDaemon(True)
        self.zeroconf = zeroconf
        self.start()

    def run(self):
        while True:
            try:
                self.zeroconf.wait(10 * 1000)
            except TypeError:
                globals()['_GLOBAL_DONE'] = 1
                return
            if globals()['_GLOBAL_DONE']:
                return
            try:
                now = currentTimeMillis()
                for record in self.zeroconf.cache.entries():
                    if record.isExpired(now):
                        self.zeroconf.updateRecord(now, record)
                        self.zeroconf.cache.remove(record)
            except:
                pass


class ServiceBrowser(threading.Thread):

    """Used to browse for a service of a specific type."""

    def __init__(self, zeroconf, type, listener):
        threading.Thread.__init__(self)
        self.zeroconf = zeroconf
        self.type = type
        self.listener = listener
        self.services = {}
        self.nextTime = currentTimeMillis()
        self.delay = _BROWSER_TIME
        self.list = []
        self.done = 0

        self.zeroconf.addListener(self, DNSQuestion(self.type, _TYPE_PTR, _CLASS_IN))
        self.start()

    def updateRecord(self, zeroconf, now, record):
        """Callback invoked by Zeroconf when new information arrives."""
        if record.type == _TYPE_PTR and record.name == self.type:
            expired = record.isExpired(now)
            try:
                old = self.services[record.alias.lower()]
                if not expired:
                    old.resetTTL(record)
                else:
                    del self.services[record.alias.lower()]
                    self.list.append(lambda _: self.listener.removeService(_, self.type, record.alias))
                    return
            except KeyError:
                if not expired:
                    self.services[record.alias.lower()] = record
                    self.list.append(lambda _: self.listener.addService(_, self.type, record.alias))

            expires = record.getExpirationTime(75)
            if expires < self.nextTime:
                self.nextTime = expires

    def cancel(self):
        self.done = 1
        self.zeroconf.notifyAll()

    def run(self):
        while True:
            now = currentTimeMillis()
            if not self.list and self.nextTime > now:
                self.zeroconf.wait(self.nextTime - now)
            if globals()['_GLOBAL_DONE'] or self.done:
                return
            now = currentTimeMillis()
            if self.nextTime <= now:
                self._send_query()
                self.nextTime = now + self.delay
                self.delay = min(20 * 1000, self.delay * 2)

            if self.list:
                event = self.list.pop(0)
                event(self.zeroconf)

    def _send_query(self):
        out = DNSOutgoing(_FLAGS_QR_QUERY)
        out.addQuestion(DNSQuestion(self.type, _TYPE_PTR, _CLASS_IN))
        for rec in self.services.values():
            if not rec.isExpired(currentTimeMillis()):
                out.addAnswerAtTime(rec, currentTimeMillis())
        self.zeroconf.send(out)


class ServiceInfo(object):

    """Service information"""

    def __init__(self, type, name, address=None, port=None, weight=0,
                 priority=0, properties=None, server=None):
        """Create a service description."""
        if not name.endswith(type):
            raise BadTypeInNameException
        self.type = type
        self.name = name
        self.address = address
        if address:
            self.ip_type = address_type(address)
        self.port = port
        self.weight = weight
        self.priority = priority
        self.server = server if server else name
        self.setProperties(properties)

    def setProperties(self, properties):
        """Sets properties and text of this info from a dictionary"""
        if isinstance(properties, dict):
            self.properties = properties
            parts = []
            for key, value in properties.items():
                if value is None:
                    suffix = ''
                elif isinstance(value, str):
                    suffix = value
                elif isinstance(value, int):
                    suffix = 'true' if value else 'false'
                else:
                    suffix = ''
                parts.append('='.join((key, suffix)))
            self.text = ''.join(struct.pack('!c', chr(len(p))) + p for p in parts)
        else:
            self.text = properties

    def setText(self, text):
        """Sets properties and text given a text field"""
        self.text = text
        try:
            result = {}
            i = 0
            while i < len(text):
                length = ord(text[i])
                i += 1
                s = text[i:i+length]
                i += length
                if '=' in s:
                    k, v = s.split('=', 1)
                    if v == 'true':
                        v = 1
                    elif v == 'false' or not v:
                        v = 0
                else:
                    k, v = s, 0
                if k and k not in result:
                    result[k] = v
            self.properties = result
        except:
            traceback.print_exc()
            self.properties = None

    def getType(self):
        return self.type

    def getName(self):
        if self.type and self.name.endswith("." + self.type):
            return self.name[:-len(self.type)-1]
        return self.name

    def getAddress(self):
        return self.address

    def getPort(self):
        return self.port

    def getPriority(self):
        return self.priority

    def getWeight(self):
        return self.weight

    def getProperties(self):
        return self.properties

    def getText(self):
        return self.text

    def getServer(self):
        return self.server

    def updateRecord(self, zeroconf, now, record):
        """Updates service information from a DNS record"""
        if not record or record.isExpired(now):
            return
        if record.type in (_TYPE_A, _TYPE_AAAA) and record.name == self.server:
            self.address = record.address
        elif record.type == _TYPE_SRV and record.name == self.name:
            self.server = record.server
            self.port = record.port
            self.weight = record.weight
            self.priority = record.priority
            self.updateRecord(zeroconf, now,
                              zeroconf.cache.getByDetails(self.server, _TYPE_A, _CLASS_IN))
        elif record.type == _TYPE_TXT and record.name == self.name:
            self.setText(record.text)

    def request(self, zeroconf, timeout):
        """Attempts to discover the service within timeout."""
        now = currentTimeMillis()
        delay = _LISTENER_TIME
        next_time = now + delay
        deadline = now + timeout
        try:
            zeroconf.addListener(self, DNSQuestion(self.name, _TYPE_ANY, _CLASS_IN))
            while not (self.server and self.address and self.text):
                if deadline <= now:
                    return 0
                if next_time <= now:
                    out = DNSOutgoing(_FLAGS_QR_QUERY)
                    out.addQuestion(DNSQuestion(self.name, _TYPE_SRV, _CLASS_IN))
                    out.addAnswerAtTime(zeroconf.cache.getByDetails(self.name, _TYPE_SRV, _CLASS_IN), now)
                    out.addQuestion(DNSQuestion(self.name, _TYPE_TXT, _CLASS_IN))
                    out.addAnswerAtTime(zeroconf.cache.getByDetails(self.name, _TYPE_TXT, _CLASS_IN), now)
                    if self.server:
                        out.addQuestion(DNSQuestion(self.server, _TYPE_A, _CLASS_IN))
                        out.addAnswerAtTime(zeroconf.cache.getByDetails(self.server, _TYPE_A, _CLASS_IN), now)
                    zeroconf.send(out)
                    next_time = now + delay
                    delay *= 2
                zeroconf.wait(min(next_time, deadline) - now)
                now = currentTimeMillis()
            return 1
        finally:
            zeroconf.removeListener(self)

    def __eq__(self, other):
        return isinstance(other, ServiceInfo) and other.name == self.name

    def __ne__(self, other):
        return not self.__eq__(other)

    def __repr__(self):
        txt = 'None' if self.text is None else (self.text if len(self.text) < 20 else self.text[:17] + "...")
        return "service[%s,%s:%s,%s]" % (self.name, ntop(self.getAddress()), self.port, txt)


class Zeroconf(object):

    """Implementation of Zeroconf Multicast DNS Service Discovery"""

    def __init__(self, bindaddress=None):
        globals()['_GLOBAL_DONE'] = 0
        self.intf = socket.gethostbyname(socket.gethostname()) if bindaddress is None else bindaddress
        self.group = ('', _MDNS_PORT)
        self.socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEPORT, 1)
        except:
            pass
        self.socket.setsockopt(socket.SOL_IP, socket.IP_MULTICAST_TTL, 255)
        self.socket.setsockopt(socket.SOL_IP, socket.IP_MULTICAST_LOOP, 1)
        try:
            self.socket.bind(self.group)
        except:
            pass
        self.socket.setsockopt(socket.SOL_IP, socket.IP_ADD_MEMBERSHIP,
                               socket.inet_aton(_MDNS_ADDR) + socket.inet_aton('0.0.0.0'))

        self.listeners = []
        self.browsers = []
        self.services = {}
        self.servicetypes = {}
        self.cache = DNSCache()
        self.condition = threading.Condition()
        self.engine = Engine(self)
        self.listener = Listener(self)
        self.reaper = Reaper(self)

    def isLoopback(self):
        return self.intf.startswith("127.0.0.1")

    def isLinklocal(self):
        return self.intf.startswith("169.254.")

    def wait(self, timeout):
        """Wait for a given number of milliseconds."""
        self.condition.acquire()
        self.condition.wait(timeout / 1000.0)
        self.condition.release()

    def notifyAll(self):
        """Notify all waiting threads."""
        self.condition.acquire()
        self.condition.notifyAll()
        self.condition.release()

    def getServiceInfo(self, type, name, timeout=3000):
        info = ServiceInfo(type, name)
        return info if info.request(self, timeout) else None

    def addServiceListener(self, type, listener):
        self.removeServiceListener(listener)
        self.browsers.append(ServiceBrowser(self, type, listener))

    def removeServiceListener(self, listener):
        for browser in self.browsers:
            if browser.listener == listener:
                browser.cancel()
                del browser

    def registerService(self, info, ttl=_DNS_TTL):
        self.checkService(info)
        self.services[info.name.lower()] = info
        self.servicetypes[info.type] = self.servicetypes.get(info.type, 0) + 1
        self._announce_service(info, ttl, repeat=3, interval=_REGISTER_TIME)

    def unregisterService(self, info):
        self.services.pop(info.name.lower(), None)
        count = self.servicetypes.get(info.type, 0)
        if count > 1:
            self.servicetypes[info.type] = count - 1
        else:
            self.servicetypes.pop(info.type, None)
        self._announce_service(info, 0, repeat=3, interval=_UNREGISTER_TIME)

    def unregisterAllServices(self):
        if not self.services:
            return
        self._announce_multiple(self.services.values(), ttl=0, repeat=3, interval=_UNREGISTER_TIME)

    def countRegisteredServices(self):
        return len(self.services)

    def checkService(self, info):
        """Ensures the service name is unique on the network."""
        now = currentTimeMillis()
        for _ in range(3):
            for rec in self.cache.entriesWithName(info.type):
                if rec.type == _TYPE_PTR and not rec.isExpired(now) and rec.alias == info.name:
                    if '.' not in info.name:
                        info.name = "%s.[%s:%s].%s" % (info.name, info.address, info.port, info.type)
                        self.checkService(info)
                        return
                    raise NonUniqueNameException
            out = DNSOutgoing(_FLAGS_QR_QUERY | _FLAGS_AA)
            out.addQuestion(DNSQuestion(info.type, _TYPE_PTR, _CLASS_IN))
            out.addAuthorativeAnswer(DNSPointer(info.type, _TYPE_PTR, _CLASS_IN, _DNS_TTL, info.name))
            self.send(out)
            now = currentTimeMillis()
            self.wait(_CHECK_TIME)

    def addListener(self, listener, question):
        now = currentTimeMillis()
        self.listeners.append(listener)
        if question:
            for rec in self.cache.entriesWithName(question.name):
                if question.answeredBy(rec) and not rec.isExpired(now):
                    listener.updateRecord(self, now, rec)
        self.notifyAll()

    def removeListener(self, listener):
        try:
            self.listeners.remove(listener)
            self.notifyAll()
        except:
            pass

    def updateRecord(self, now, rec):
        for listener in self.listeners:
            listener.updateRecord(self, now, rec)
        self.notifyAll()

    def handleResponse(self, msg):
        now = currentTimeMillis()
        for record in msg.answers:
            expired = record.isExpired(now)
            if record in self.cache.entries():
                if expired:
                    self.cache.remove(record)
                else:
                    entry = self.cache.get(record)
                    if entry:
                        entry.resetTTL(record)
                        record = entry
            else:
                self.cache.add(record)
            self.updateRecord(now, record)

    def handleQuery(self, msg, addr, port):
        out = self._prepare_unicast_response(port) if port != _MDNS_PORT else None
        for question in msg.questions:
            out = self._process_question(question, out, msg)
        if out and out.answers:
            out.id = msg.id
            self.send(out, addr, port)

    def _prepare_unicast_response(self, port):
        """Create a DNSOutgoing for unicast responses."""
        return DNSOutgoing(_FLAGS_QR_RESPONSE | _FLAGS_AA, multicast=0)

    def _process_question(self, question, out, msg):
        """Process a single DNS question and add appropriate answers."""
        if question.type == _TYPE_PTR:
            out = self._handle_ptr_question(question, out, msg)
        else:
            out = self._handle_general_question(question, out, msg)
        return out

    def _handle_ptr_question(self, question, out, msg):
        """Handle PTR type questions."""
        if question.name == "_services._dns-sd._udp.local.":
            for stype in self.servicetypes.keys():
                out = out or DNSOutgoing(_FLAGS_QR_RESPONSE | _FLAGS_AA)
                out.addAnswer(msg, DNSPointer("_services._dns-sd._udp.local.", _TYPE_PTR,
                                             _CLASS_IN, _DNS_TTL, stype))
        for service in self.services.values():
            if question.name == service.type:
                out = out or DNSOutgoing(_FLAGS_QR_RESPONSE | _FLAGS_AA)
                out.addAnswer(msg, DNSPointer(service.type, _TYPE_PTR, _CLASS_IN,
                                             _DNS_TTL, service.name))
        return out

    def _handle_general_question(self, question, out, msg):
        """Handle non-PTR questions."""
        out = out or DNSOutgoing(_FLAGS_QR_RESPONSE | _FLAGS_AA)
        if question.type in (_TYPE_A, _TYPE_AAAA, _TYPE_ANY):
            for service in self.services.values():
                if service.server == question.name.lower():
                    out.addAnswer(msg, DNSAddress(question.name,
                                                  address_type(service.address),
                                                  _CLASS_IN | _CLASS_UNIQUE,
                                                  _DNS_TTL, service.address))
        service = self.services.get(question.name.lower())
        if not service:
            return out
        if question.type in (_TYPE_SRV, _TYPE_ANY):
            out.addAnswer(msg, DNSService(question.name, _TYPE_SRV,
                                          _CLASS_IN | _CLASS_UNIQUE, _DNS_TTL,
                                          service.priority, service.weight,
                                          service.port, service.server))
        if question.type in (_TYPE_TXT, _TYPE_ANY):
            out.addAnswer(msg, DNSText(question.name, _TYPE_TXT,
                                      _CLASS_IN | _CLASS_UNIQUE, _DNS_TTL,
                                      service.text))
        if question.type == _TYPE_SRV:
            out.addAdditionalAnswer(DNSAddress(service.server,
                                               address_type(service.address),
                                               _CLASS_IN | _CLASS_UNIQUE,
                                               _DNS_TTL, service.address))
        return out

    def _announce_service(self, info, ttl, repeat, interval):
        """Send service announcements repeatedly."""
        now = currentTimeMillis()
        next_time = now
        for _ in range(repeat):
            if now < next_time:
                self.wait(next_time - now)
                now = currentTimeMillis()
                continue
            out = DNSOutgoing(_FLAGS_QR_RESPONSE | _FLAGS_AA)
            out.addAnswerAtTime(DNSPointer(info.type, _TYPE_PTR, _CLASS_IN, ttl, info.name), 0)
            out.addAnswerAtTime(DNSService(info.name, _TYPE_SRV, _CLASS_IN, ttl,
                                           info.priority, info.weight, info.port, info.server), 0)
            out.addAnswerAtTime(DNSText(info.name, _TYPE_TXT, _CLASS_IN, ttl, info.text), 0)
            if info.address:
                out.addAnswerAtTime(DNSAddress(info.server, info.ip_type, _CLASS_IN, ttl, info.address), 0)
            self.send(out)
            next_time += interval

    def _announce_multiple(self, infos, ttl, repeat, interval):
        """Announce multiple services (used for unregisterAll)."""
        now = currentTimeMillis()
        next_time = now
        for _ in range(repeat):
            if now < next_time:
                self.wait(next_time - now)
                now = currentTimeMillis()
                continue
            out = DNSOutgoing(_FLAGS_QR_RESPONSE | _FLAGS_AA)
            for info in infos:
                out.addAnswerAtTime(DNSPointer(info.type, _TYPE_PTR, _CLASS_IN, ttl, info.name), 0)
                out.addAnswerAtTime(DNSService(info.name, _TYPE_SRV, _CLASS_IN, ttl,
                                               info.priority, info.weight, info.port, info.server), 0)
                out.addAnswerAtTime(DNSText(info.name, _TYPE_TXT, _CLASS_IN, ttl, info.text), 0)
                if info.address:
                    out.addAnswerAtTime(DNSAddress(info.server, info.ip_type, _CLASS_IN, ttl, info.address), 0)
            self.send(out)
            next_time += interval

    def send(self, out, addr=_MDNS_ADDR, port=_MDNS_PORT):
        """Sends an outgoing packet."""
        try:
            self.socket.sendto(out.packet(), 0, (addr, port))
        except:
            pass

    def close(self):
        """Ends background threads and stops servicing."""
        if globals()['_GLOBAL_DONE'] == 0:
            globals()['_GLOBAL_DONE'] = 1
            self.notifyAll()
            self.engine.notify()
            self.unregisterAllServices()
            self.socket.setsockopt(socket.SOL_IP, socket.IP_DROP_MEMBERSHIP,
                                   socket.inet_aton(_MDNS_ADDR) + socket.inet_aton('0.0.0.0'))
            self.socket.close()


if __name__ == '__main__':
    print "Multicast DNS Service Discovery for Python, version", __version__
    r = Zeroconf()
    print "1. Testing registration of a service..."
    desc = {'version':'0.10','a':'test value', 'b':'another value'}
    info = ServiceInfo("_http._tcp.local.", "My Service Name._http._tcp.local.",
                       socket.inet_aton("127.0.0.1"), 1234, 0, 0, desc)
    print "   Registering service..."
    r.registerService(info)
    print "   Registration done."
    print "2. Testing query of service information..."
    print "   Getting ZOE service:", str(r.getServiceInfo("_http._tcp.local.", "ZOE._http._tcp.local."))
    print "   Query done."
    print "3. Testing query of own service..."
    print "   Getting self:", str(r.getServiceInfo("_http._tcp.local.", "My Service Name._http._tcp.local."))
    print "   Query done."
    print "4. Testing unregister of service information..."
    r.unregisterService(info)
    print "   Unregister done."
    r.close()