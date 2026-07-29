import string
import time
import struct
import socket
import threading
import select
import traceback

__all__ = ["Zeroconf", "ServiceInfo", "ServiceBrowser"]

globals()['_GLOBAL_DONE'] = 0

_UNREGISTER_TIME = 125
_CHECK_TIME = 175
_REGISTER_TIME = 225
_LISTENER_TIME = 200
_BROWSER_TIME = 500

_MDNS_ADDR = '224.0.0.251'
_MDNS_PORT = 5353
_DNS_PORT = 53
_DNS_TTL = 60 * 60

_FLAGS_QR_MASK = 0x8000
_FLAGS_QR_QUERY = 0x0000
_FLAGS_QR_RESPONSE = 0x8000
_FLAGS_AA = 0x0400
_FLAGS_TC = 0x0200
_FLAGS_RD = 0x0100
_FLAGS_RA = 0x8000
_FLAGS_Z = 0x0040
_FLAGS_AD = 0x0020
_FLAGS_CD = 0x0010

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
_TYPE_ANY = 255

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

def currentTimeMillis():
    return time.time() * 1000

def ntop(address):
    af = len(address) == 4 and socket.AF_INET or socket.AF_INET6
    return socket.inet_ntop(af, address)

def address_type(address):
    return len(address) == 4 and _TYPE_A or _TYPE_AAAA

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

class DNSEntry(object):
    def __init__(self, name, type, clazz):
        self.key = string.lower(name)
        self.name = name
        self.type = type
        self.clazz = clazz & _CLASS_MASK
        self.unique = (clazz & _CLASS_UNIQUE) != 0

    def __eq__(self, other):
        if isinstance(other, DNSEntry):
            return self.name == other.name and self.type == other.type and self.clazz == other.clazz
        return False

    def __ne__(self, other):
        return not self.__eq__(other)

    def getClazz(self, clazz):
        return _CLASSES.get(clazz, "?(%s)" % (clazz))

    def getType(self, type):
        return _TYPES.get(type, "?(%s)" % (type))

    def toString(self, hdr, other):
        result = "%s[%s,%s" % (hdr, self.getType(self.type), self.getClazz(self.clazz))
        result += "-unique," if self.unique else ","
        result += self.name
        result += ",%s]" % (other) if other is not None else "]"
        return result

class DNSQuestion(DNSEntry):
    def __init__(self, name, type, clazz):
        if not name.endswith(".local."):
            raise NonLocalNameException(name)
        super().__init__(name, type, clazz)

    def answeredBy(self, rec):
        return self.clazz == rec.clazz and (self.type == rec.type or self.type == _TYPE_ANY) and self.name == rec.name

    def __repr__(self):
        return DNSEntry.toString(self, "question", None)

class DNSRecord(DNSEntry):
    def __init__(self, name, type, clazz, ttl):
        super().__init__(name, type, clazz)
        self.ttl = ttl
        self.created = currentTimeMillis()

    def __eq__(self, other):
        if isinstance(other, DNSRecord):
            return super().__eq__(other)
        return False

    def suppressedBy(self, msg):
        return any(self.suppressedByAnswer(r) for r in msg.answers)

    def suppressedByAnswer(self, other):
        return self == other and other.ttl > (self.ttl / 2)

    def getExpirationTime(self, percent):
        return self.created + (percent * self.ttl * 10)

    def getRemainingTTL(self, now):
        return max(0, (self.getExpirationTime(100) - now) / 1000)

    def isExpired(self, now):
        return self.getExpirationTime(100) <= now

    def isStale(self, now):
        return self.getExpirationTime(50) <= now

    def resetTTL(self, other):
        self.created = other.created
        self.ttl = other.ttl

    def write(self, out):
        raise AbstractMethodException

    def toString(self, other):
        arg = "%s/%s,%s" % (self.ttl, self.getRemainingTTL(currentTimeMillis()), other)
        return DNSEntry.toString(self, "record", arg)

class DNSAddress(DNSRecord):
    def __init__(self, name, type, clazz, ttl, address):
        super().__init__(name, type, clazz, ttl)
        self.address = address

    def write(self, out):
        out.writeString(self.address, len(self.address))

    def __eq__(self, other):
        if isinstance(other, DNSAddress):
            return self.address == other.address
        return False

    def __repr__(self):
        try:
            return 'record[%s]' % ntop(self.address)
        except:
            return 'record[%s]' % self.address

class DNSHinfo(DNSRecord):
    def __init__(self, name, type, clazz, ttl, cpu, os):
        super().__init__(name, type, clazz, ttl)
        self.cpu = cpu
        self.os = os

    def write(self, out):
        out.writeString(self.cpu, len(self.cpu))
        out.writeString(self.os, len(self.os))

    def __eq__(self, other):
        if isinstance(other, DNSHinfo):
            return self.cpu == other.cpu and self.os == other.os
        return False

    def __repr__(self):
        return self.cpu + " " + self.os

class DNSPointer(DNSRecord):
    def __init__(self, name, type, clazz, ttl, alias):
        super().__init__(name, type, clazz, ttl)
        self.alias = alias

    def write(self, out):
        out.writeName(self.alias)

    def __eq__(self, other):
        if isinstance(other, DNSPointer):
            return self.alias == other.alias
        return False

    def __repr__(self):
        return self.toString(self.alias)

class DNSText(DNSRecord):
    def __init__(self, name, type, clazz, ttl, text):
        super().__init__(name, type, clazz, ttl)
        self.text = text

    def write(self, out):
        out.writeString(self.text, len(self.text))

    def __eq__(self, other):
        if isinstance(other, DNSText):
            return self.text == other.text
        return False

    def __repr__(self):
        return self.toString(self.text[:7] + "..." if len(self.text) > 10 else self.text)

class DNSService(DNSRecord):
    def __init__(self, name, type, clazz, ttl, priority, weight, port, server):
        super().__init__(name, type, clazz, ttl)
        self.priority = priority
        self.weight = weight
        self.port = port
        self.server = server

    def write(self, out):
        out.writeShort(self.priority)
        out.writeShort(self.weight)
        out.writeShort(self.port)
        out.writeName(self.server)

    def __eq__(self, other):
        if isinstance(other, DNSService):
            return (self.priority == other.priority and self.weight == other.weight and
                    self.port == other.port and self.server == other.server)
        return False

    def __repr__(self):
        return self.toString("%s:%s" % (self.server, self.port))

class DNSIncoming(object):
    def __init__(self, data):
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
        format = '!HHHHHH'
        length = struct.calcsize(format)
        info = struct.unpack(format, self.data[self.offset:self.offset+length])
        self.offset += length
        self.id, self.flags, self.numQuestions, self.numAnswers, self.numAuthorities, self.numAdditionals = info

    def readQuestions(self):
        format = '!HH'
        length = struct.calcsize(format)
        for _ in range(self.numQuestions):
            name = self.readName()
            info = struct.unpack(format, self.data[self.offset:self.offset+length])
            self.offset += length
            try:
                self.questions.append(DNSQuestion(name, info[0], info[1]))
            except NonLocalNameException:
                pass

    def readInt(self):
        format = '!I'
        length = struct.calcsize(format)
        info = struct.unpack(format, self.data[self.offset:self.offset+length])
        self.offset += length
        return info[0]

    def readCharacterString(self):
        length = ord(self.data[self.offset])
        self.offset += 1
        return self.readString(length)

    def readString(self, length):
        format = '!' + str(length) + 's'
        info = struct.unpack(format, self.data[self.offset:self.offset+length])
        self.offset += length
        return info[0]

    def readUnsignedShort(self):
        format = '!H'
        length = struct.calcsize(format)
        info = struct.unpack(format, self.data[self.offset:self.offset+length])
        self.offset += length
        return info[0]

    def readOthers(self):
        format = '!HHiH'
        length = struct.calcsize(format)
        n = self.numAnswers + self.numAuthorities + self.numAdditionals
        for _ in range(n):
            domain = self.readName()
            info = struct.unpack(format, self.data[self.offset:self.offset+length])
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
        return (self.flags & _FLAGS_QR_MASK) == _FLAGS_QR_QUERY

    def isResponse(self):
        return (self.flags & _FLAGS_QR_MASK) == _FLAGS_QR_RESPONSE

    def readUTF(self, offset, length):
        return self.data[offset:offset+length].decode('utf-8')

    def readName(self):
        result = ''
        off = self.offset
        next = -1
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
                    if next < 0:
                        next = off + 1
                    off = ((length & 0x3F) << 8) | ord(self.data[off])
                    if off >= first:
                        raise BadDomainNameCircular(off)
                    first = off
                else:
                    raise BadDomainName(off)
            except IndexError:
                raise MalformedPacketException()
        self.offset = next if next >= 0 else off
        return result

class DNSOutgoing(object):
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
        self.questions.append(record)

    def addAnswer(self, inp, record):
        if not record.suppressedBy(inp):
            self.addAnswerAtTime(record, 0)

    def addAnswerAtTime(self, record, now):
        if record and (now == 0 or not record.isExpired(now)):
            self.answers.append((record, now))

    def addAuthorativeAnswer(self, record):
        self.authorities.append(record)

    def addAdditionalAnswer(self, record):
        self.additionals.append(record)

    def writeByte(self, value):
        self.data.append(struct.pack('!c', chr(value)))
        self.size += 1

    def insertShort(self, index, value):
        self.data.insert(index, struct.pack('!H', value))
        self.size += 2

    def writeShort(self, value):
        self.data.append(struct.pack('!H', value))
        self.size += 2

    def writeInt(self, value):
        self.data.append(struct.pack('!I', int(value)))
        self.size += 4

    def writeString(self, value, length):
        self.data.append(struct.pack('!' + str(length) + 's', value))
        self.size += length

    def writeUTF(self, s):
        utfstr = s.encode('utf-8')
        length = len(utfstr)
        if length > 64:
            raise NamePartTooLongException
        self.writeByte(length)
        self.writeString(utfstr, length)

    def writeName(self, name):
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
        self.writeName(question.name)
        self.writeShort(question.type)
        self.writeShort(question.clazz)

    def writeRecord(self, record, now):
        self.writeName(record.name)
        self.writeShort(record.type)
        if record.unique and self.multicast:
            self.writeShort(record.clazz | _CLASS_UNIQUE)
        else:
            self.writeShort(record.clazz)
        ttl = record.ttl if now == 0 else record.getRemainingTTL(now)
        self.writeInt(ttl)
        index = len(self.data)
        self.size += 2
        record.write(self)
        self.size -= 2
        length = len(''.join(self.data[index:]))
        self.insertShort(index, length)

    def packet(self):
        if not self.finished:
            self.finished = 1
            for q in self.questions:
                self.writeQuestion(q)
            for r, t in self.answers:
                self.writeRecord(r, t)
            for a in self.authorities:
                self.writeRecord(a, 0)
            for a in self.additionals:
                self.writeRecord(a, 0)
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
    def __init__(self):
        self.cache = {}

    def add(self, entry):
        self.cache.setdefault(entry.key, []).append(entry)

    def remove(self, entry):
        try:
            self.cache[entry.key].remove(entry)
        except KeyError:
            pass

    def get(self, entry):
        try:
            return self.cache[entry.key][self.cache[entry.key].index(entry)]
        except (KeyError, ValueError):
            return None

    def getByDetails(self, name, type, clazz):
        return self.get(DNSEntry(name, type, clazz))

    def entriesWithName(self, name):
        return self.cache.get(name, [])

    def entries(self):
        return [e for lst in self.cache.values() for e in lst]

class Engine(threading.Thread):
    def __init__(self, zeroconf):
        super().__init__()
        self.zeroconf = zeroconf
        self.readers = {}
        self.timeout = 5
        self.condition = threading.Condition()
        self.daemon = True
        self.start()

    def run(self):
        while not globals()['_GLOBAL_DONE']:
            rs = self.getReaders()
            if not rs:
                self.condition.acquire()
                self.condition.wait(self.timeout)
                self.condition.release()
            else:
                try:
                    rr, _, _ = select.select(rs, [], [], self.timeout)
                    if globals()['_GLOBAL_DONE']:
                        continue
                    for sock in rr:
                        try:
                            self.readers[sock].handle_read()
                        except MalformedPacketException:
                            pass
                        except Exception:
                            traceback.print_exc()
                except Exception:
                    pass

    def getReaders(self):
        self.condition.acquire()
        result = list(self.readers.keys())
        self.condition.release()
        return result

    def addReader(self, reader, sock):
        self.condition.acquire()
        self.readers[sock] = reader
        self.condition.notify()
        self.condition.release()

    def delReader(self, sock):
        self.condition.acquire()
        del self.readers[sock]
        self.condition.notify()
        self.condition.release()

    def notify(self):
        self.condition.acquire()
        self.condition.notify()
        self.condition.release()

class Listener(object):
    def __init__(self, zeroconf):
        self.zeroconf = zeroconf
        self.zeroconf.engine.addReader(self, self.zeroconf.socket)

    def handle_read(self):
        data, (addr, port) = self.zeroconf.socket.recvfrom(_MAX_MSG_ABSOLUTE)
        msg = DNSIncoming(data)
        if msg.isQuery():
            if port == _MDNS_PORT:
                self.zeroconf.handleQuery(msg, _MDNS_ADDR, _MDNS_PORT)
            elif port == _DNS_PORT:
                self.zeroconf.handleQuery(msg, addr, port)
                self.zeroconf.handleQuery(msg, _MDNS_ADDR, _MDNS_PORT)
        else:
            self.zeroconf.handleResponse(msg)

class Reaper(threading.Thread):
    def __init__(self, zeroconf):
        super().__init__()
        self.daemon = True
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
            except Exception:
                pass

class ServiceBrowser(threading.Thread):
    def __init__(self, zeroconf, type, listener):
        super().__init__()
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

    def _handle_ptr_record(self, zeroconf, now, record):
        expired = record.isExpired(now)
        alias_key = record.alias.lower()
        try:
            oldrecord = self.services[alias_key]
            if not expired:
                oldrecord.resetTTL(record)
            else:
                del self.services[alias_key]
                self.list.append(lambda x: self.listener.removeService(x, self.type, record.alias))
                return
        except KeyError:
            if not expired:
                self.services[alias_key] = record
                self.list.append(lambda x: self.listener.addService(x, self.type, record.alias))
        expires = record.getExpirationTime(75)
        if expires < self.nextTime:
            self.nextTime = expires

    def updateRecord(self, zeroconf, now, record):
        if record.type == _TYPE_PTR and record.name == self.type:
            self._handle_ptr_record(zeroconf, now, record)

    def cancel(self):
        self.done = 1
        self.zeroconf.notifyAll()

    def run(self):
        while True:
            event = None
            now = currentTimeMillis()
            if not self.list and self.nextTime > now:
                self.zeroconf.wait(self.nextTime - now)
            if globals()['_GLOBAL_DONE'] or self.done:
                return
            now = currentTimeMillis()
            if self.nextTime <= now:
                out = DNSOutgoing(_FLAGS_QR_QUERY)
                out.addQuestion(DNSQuestion(self.type, _TYPE_PTR, _CLASS_IN))
                for record in self.services.values():
                    if not record.isExpired(now):
                        out.addAnswerAtTime(record, now)
                self.zeroconf.send(out)
                self.nextTime = now + self.delay
                self.delay = min(20 * 1000, self.delay * 2)
            if self.list:
                event = self.list.pop(0)
            if event:
                event(self.zeroconf)

class ServiceInfo(object):
    def __init__(self, type, name, address=None, port=None, weight=0, priority=0, properties=None, server=None):
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
        self.server = server or name
        self.setProperties(properties)

    def setProperties(self, properties):
        if isinstance(properties, dict):
            self.properties = properties
            result = ''
            for key, value in properties.items():
                if value is None:
                    suffix = ''
                elif isinstance(value, str):
                    suffix = value
                elif isinstance(value, int):
                    suffix = 'true' if value else 'false'
                else:
                    suffix = ''
                item = f"{key}={suffix}"
                result += struct.pack('!c', chr(len(item))) + item
            self.text = result
        else:
            self.text = properties

    def setText(self, text):
        self.text = text
        try:
            result = {}
            index = 0
            end = len(text)
            while index < end:
                length = ord(text[index])
                index += 1
                value = text[index:index+length]
                index += length
                key, sep, val = value.partition('=')
                if sep:
                    if val == 'true':
                        val = 1
                    elif val == 'false' or not val:
                        val = 0
                else:
                    val = 0
                if key and result.get(key) is None:
                    result[key] = val
            self.properties = result
        except Exception:
            traceback.print_exc()
            self.properties = None

    def getType(self):
        return self.type

    def getName(self):
        if self.type and self.name.endswith("." + self.type):
            return self.name[:len(self.name) - len(self.type) - 1]
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
        if record is None or record.isExpired(now):
            return
        if record.type in (_TYPE_A, _TYPE_AAAA) and record.name == self.server:
            self.address = record.address
        elif record.type == _TYPE_SRV and record.name == self.name:
            self.server = record.server
            self.port = record.port
            self.weight = record.weight
            self.priority = record.priority
            zeroconf.updateRecord(now, zeroconf.cache.getByDetails(self.server, _TYPE_A, _CLASS_IN))
        elif record.type == _TYPE_TXT and record.name == self.name:
            self.setText(record.text)

    def request(self, zeroconf, timeout):
        now = currentTimeMillis()
        delay = _LISTENER_TIME
        next_time = now + delay
        last = now + timeout
        result = 0
        try:
            zeroconf.addListener(self, DNSQuestion(self.name, _TYPE_ANY, _CLASS_IN))
            while self.server is None or self.address is None or self.text is None:
                if last <= now:
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
                zeroconf.wait(min(next_time, last) - now)
                now = currentTimeMillis()
            result = 1
        finally:
            zeroconf.removeListener(self)
        return result

    def __eq__(self, other):
        return isinstance(other, ServiceInfo) and other.name == self.name

    def __ne__(self, other):
        return not self.__eq__(other)

    def __repr__(self):
        result = f"service[{self.name},{ntop(self.getAddress())}:{self.port},"
        if self.text is None:
            result += "None"
        else:
            result += self.text[:17] + "..." if len(self.text) > 20 else self.text
        result += "]"
        return result

class Zeroconf(object):
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
        self.condition.acquire()
        self.condition.wait(timeout/1000)
        self.condition.release()

    def notifyAll(self):
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
                self.browsers.remove(browser)

    def registerService(self, info, ttl=_DNS_TTL):
        self.checkService(info)
        self.services[info.name.lower()] = info
        self.servicetypes[info.type] = self.servicetypes.get(info.type, 0) + 1
        now = currentTimeMillis()
        next_time = now
        for _ in range(3):
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
            next_time += _REGISTER_TIME

    def unregisterService(self, info):
        try:
            del self.services[info.name.lower()]
            if self.servicetypes[info.type] > 1:
                self.servicetypes[info.type] -= 1
            else:
                del self.servicetypes[info.type]
        except:
            pass
        now = currentTimeMillis()
        next_time = now
        for _ in range(3):
            if now < next_time:
                self.wait(next_time - now)
                now = currentTimeMillis()
                continue
            out = DNSOutgoing(_FLAGS_QR_RESPONSE | _FLAGS_AA)
            out.addAnswerAtTime(DNSPointer(info.type, _TYPE_PTR, _CLASS_IN, 0, info.name), 0)
            out.addAnswerAtTime(DNSService(info.name, _TYPE_SRV, _CLASS_IN, 0,
                                           info.priority, info.weight, info.port, info.name), 0)
            out.addAnswerAtTime(DNSText(info.name, _TYPE_TXT, _CLASS_IN, 0, info.text), 0)
            if info.address:
                out.addAnswerAtTime(DNSAddress(info.server, info.ip_type, _CLASS_IN, 0, info.address), 0)
            self.send(out)
            next_time += _UNREGISTER_TIME

    def unregisterAllServices(self):
        if not self.services:
            return
        now = currentTimeMillis()
        next_time = now
        for _ in range(3):
            if now < next_time:
                self.wait(next_time - now)
                now = currentTimeMillis()
                continue
            out = DNSOutgoing(_FLAGS_QR_RESPONSE | _FLAGS_AA)
            for info in self.services.values():
                out.addAnswerAtTime(DNSPointer(info.type, _TYPE_PTR, _CLASS_IN, 0, info.name), 0)
                out.addAnswerAtTime(DNSService(info.name, _TYPE_SRV, _CLASS_IN, 0,
                                               info.priority, info.weight, info.port, info.server), 0)
                out.addAnswerAtTime(DNSText(info.name, _TYPE_TXT, _CLASS_IN, 0, info.text), 0)
                if info.address:
                    out.addAnswerAtTime(DNSAddress(info.server, info.ip_type, _CLASS_IN, 0, info.address), 0)
            self.send(out)
            next_time += _UNREGISTER_TIME

    def countRegisteredServices(self):
        return len(self.services)

    def checkService(self, info):
        now = currentTimeMillis()
        next_time = now
        for _ in range(3):
            for record in self.cache.entriesWithName(info.type):
                if record.type == _TYPE_PTR and not record.isExpired(now) and record.alias == info.name:
                    if '.' not in info.name:
                        info.name = f"{info.name}.[{info.address}:{info.port}].{info.type}"
                        self.checkService(info)
                        return
                    raise NonUniqueNameException
            if now < next_time:
                self.wait(next_time - now)
                now = currentTimeMillis()
                continue
            out = DNSOutgoing(_FLAGS_QR_QUERY | _FLAGS_AA)
            out.addQuestion(DNSQuestion(info.type, _TYPE_PTR, _CLASS_IN))
            out.addAuthorativeAnswer(DNSPointer(info.type, _TYPE_PTR, _CLASS_IN, _DNS_TTL, info.name))
            self.send(out)
            next_time += _CHECK_TIME

    def addListener(self, listener, question):
        now = currentTimeMillis()
        self.listeners.append(listener)
        if question:
            for record in self.cache.entriesWithName(question.name):
                if question.answeredBy(record) and not record.isExpired(now):
                    listener.updateRecord(self, now, record)
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

    def _ensure_out(self, out):
        return out if out else DNSOutgoing(_FLAGS_QR_RESPONSE | _FLAGS_AA)

    def _handle_ptr_query(self, question, out, msg):
        if question.name == "_services._dns-sd._udp.local.":
            for stype in self.servicetypes:
                out = self._ensure_out(out)
                out.addAnswer(msg, DNSPointer("_services._dns-sd._udp.local.", _TYPE_PTR, _CLASS_IN, _DNS_TTL, stype))
        for service in self.services.values():
            if question.name == service.type:
                out = self._ensure_out(out)
                out.addAnswer(msg, DNSPointer(service.type, _TYPE_PTR, _CLASS_IN, _DNS_TTL, service.name))
        return out

    def _handle_other_query(self, question, out, msg):
        out = self._ensure_out(out)
        if question.type in (_TYPE_A, _TYPE_AAAA, _TYPE_ANY):
            for service in self.services.values():
                if service.server == question.name.lower():
                    out.addAnswer(msg, DNSAddress(question.name, address_type(service.address),
                                                 _CLASS_IN | _CLASS_UNIQUE, _DNS_TTL, service.address))
        service = self.services.get(question.name.lower())
        if not service:
            return out
        if question.type in (_TYPE_SRV, _TYPE_ANY):
            out.addAnswer(msg, DNSService(question.name, _TYPE_SRV, _CLASS_IN | _CLASS_UNIQUE,
                                          _DNS_TTL, service.priority, service.weight, service.port, service.server))
        if question.type in (_TYPE_TXT, _TYPE_ANY):
            out.addAnswer(msg, DNSText(question.name, _TYPE_TXT, _CLASS_IN | _CLASS_UNIQUE,
                                       _DNS_TTL, service.text))
        if question.type == _TYPE_SRV:
            out.addAdditionalAnswer(DNSAddress(service.server, address_type(service.address),
                                               _CLASS_IN | _CLASS_UNIQUE, _DNS_TTL, service.address))
        return out

    def handleQuery(self, msg, addr, port):
        out = None
        if port != _MDNS_PORT:
            out = DNSOutgoing(_FLAGS_QR_RESPONSE | _FLAGS_AA, 0)
            for q in msg.questions:
                out.addQuestion(q)
        for q in msg.questions:
            if q.type == _TYPE_PTR:
                out = self._handle_ptr_query(q, out, msg)
            else:
                out = self._handle_other_query(q, out, msg)
        if out and out.answers:
            out.id = msg.id
            self.send(out, addr, port)

    def send(self, out, addr=_MDNS_ADDR, port=_MDNS_PORT):
        try:
            self.socket.sendto(out.packet(), 0, (addr, port))
        except:
            pass

    def close(self):
        if globals()['_GLOBAL_DONE'] == 0:
            globals()['_GLOBAL_DONE'] = 1
            self.notifyAll()
            self.engine.notify()
            self.unregisterAllServices()
            self.socket.setsockopt(socket.SOL_IP, socket.IP_DROP_MEMBERSHIP,
                                   socket.inet_aton(_MDNS_ADDR) + socket.inet_aton('0.0.0.0'))
            self.socket.close()

if __name__ == '__main__':
    print("Multicast DNS Service Discovery for Python, version", __version__)
    r = Zeroconf()
    print("1. Testing registration of a service...")
    desc = {'version':'0.10','a':'test value', 'b':'another value'}
    info = ServiceInfo("_http._tcp.local.", "My Service Name._http._tcp.local.", socket.inet_aton("127.0.0.1"), 1234, 0, 0, desc)
    print("   Registering service...")
    r.registerService(info)
    print("   Registration done.")
    print("2. Testing query of service information...")
    print("   Getting ZOE service:", str(r.getServiceInfo("_http._tcp.local.", "ZOE._http._tcp.local.")))
    print("   Query done.")
    print("3. Testing query of own service...")
    print("   Getting self:", str(r.getServiceInfo("_http._tcp.local.", "My Service Name._http._tcp.local.")))
    print("   Query done.")
    print("4. Testing unregister of service information...")
    r.unregisterService(info)
    print("   Unregister done.")
    r.close()