import string
import time
import struct
import socket
import threading
import select
import traceback

__all__ = ["Zeroconf", "ServiceInfo", "ServiceBrowser"]

# hook for threads
_GLOBAL_DONE = 0

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
_MAX_MSG_TYPICAL = 1460  
_MAX_MSG_ABSOLUTE = 8972

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
_TYPE_ANY =  255

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
        return 0

    def __ne__(self, other):
        return not self.__eq__(other)

    def getClazz(self, clazz):
        try:
            return _CLASSES[clazz]
        except:
            return "?(%s)" % (clazz)

    def getType(self, type):
        try:
            return _TYPES[type]
        except:
            return "?(%s)" % (type)

    def toString(self, hdr, other):
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

    def __init__(self, name, type, clazz):
        if not name.endswith(".local."):
            raise NonLocalNameException(name)
        DNSEntry.__init__(self, name, type, clazz)

    def answeredBy(self, rec):
        return self.clazz == rec.clazz and (self.type == rec.type or self.type == _TYPE_ANY) and self.name == rec.name

    def __repr__(self):
        return DNSEntry.toString(self, "question", None)

class DNSRecord(DNSEntry):

    def __init__(self, name, type, clazz, ttl):
        DNSEntry.__init__(self, name, type, clazz)
        self.ttl = ttl
        self.created = currentTimeMillis()

    def __eq__(self, other):
        if isinstance(other, DNSRecord):
            return DNSEntry.__eq__(self, other)
        return 0

    def suppressedBy(self, msg):
        for record in msg.answers:
            if self.suppressedByAnswer(record):
                return 1
        return 0

    def suppressedByAnswer(self, other):
        if self == other and other.ttl > (self.ttl / 2):
            return 1
        return 0

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
        DNSRecord.__init__(self, name, type, clazz, ttl)
        self.address = address

    def write(self, out):
        out.writeString(self.address, len(self.address))

    def __eq__(self, other):
        if isinstance(other, DNSAddress):
            return self.address == other.address
        return 0

    def __repr__(self):
        try:
            return 'record[%s]' % ntop(self.address)
        except:
            return 'record[%s]' % self.address

class DNSHinfo(DNSRecord):

    def __init__(self, name, type, clazz, ttl, cpu, os):
        DNSRecord.__init__(self, name, type, clazz, ttl)
        self.cpu = cpu
        self.os = os

    def write(self, out):
        out.writeString(self.cpu, len(self.cpu))
        out.writeString(self.os, len(self.os))

    def __eq__(self, other):
        if isinstance(other, DNSHinfo):
            return self.cpu == other.cpu and self.os == other.os
        return 0

    def __repr__(self):
        return self.cpu + " " + self.os

class DNSPointer(DNSRecord):

    def __init__(self, name, type, clazz, ttl, alias):
        DNSRecord.__init__(self, name, type, clazz, ttl)
        self.alias = alias

    def write(self, out):
        out.writeName(self.alias)

    def __eq__(self, other):
        if isinstance(other, DNSPointer):
            return self.alias == other.alias
        return 0

    def __repr__(self):
        return self.toString(self.alias)

class DNSText(DNSRecord):

    def __init__(self, name, type, clazz, ttl, text):
        DNSRecord.__init__(self, name, type, clazz, ttl)
        self.text = text

    def write(self, out):
        out.writeString(self.text, len(self.text))

    def __eq__(self, other):
        if isinstance(other, DNSText):
            return self.text == other.text
        return 0

    def __repr__(self):
        if len(self.text) > 10:
            return self.toString(self.text[:7] + "...")
        else:
            return self.toString(self.text)

class DNSService(DNSRecord):

    def __init__(self, name, type, clazz, ttl, priority, weight, port, server):
        DNSRecord.__init__(self, name, type, clazz, ttl)
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
            return self.priority == other.priority and self.weight == other.weight and self.port == other.port and self.server == other.server
        return 0

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

        self.id = info[0]
        self.flags = info[1]
        self.numQuestions = info[2]
        self.numAnswers = info[3]
        self.numAuthorities = info[4]
        self.numAdditionals = info[5]

    def readQuestions(self):
        format = '!HH'
        length = struct.calcsize(format)
        for i in range(0, self.numQuestions):
            name = self.readName()
            info = struct.unpack(format, self.data[self.offset:self.offset+length])
            self.offset += length

            try:
                question = DNSQuestion(name, info[0], info[1])
                self.questions.append(question)
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

    def readString(self, len):
        format = '!' + str(len) + 's'
        length =  struct.calcsize(format)
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
        for i in range(0, n):
            domain = self.readName()
            info = struct.unpack(format, self.data[self.offset:self.offset+length])
            self.offset += length

            rec = None
            if info[0] == _TYPE_A:
                rec = DNSAddress(domain, info[0], info[1], info[2], self.readString(4))
            elif info[0] == _TYPE_CNAME or info[0] == _TYPE_PTR:
                rec = DNSPointer(domain, info[0], info[1], info[2], self.readName())
            elif info[0] == _TYPE_TXT:
                rec = DNSText(domain, info[0], info[1], info[2], self.readString(info[3]))
            elif info[0] == _TYPE_SRV:
                rec = DNSService(domain, info[0], info[1], info[2], self.readUnsignedShort(),
                                 self.readUnsignedShort(), self.readUnsignedShort(), self.readName())
            elif info[0] == _TYPE_HINFO:
                rec = DNSHinfo(domain, info[0], info[1], info[2], self.readCharacterString(), self.readCharacterString())
            elif info[0] == _TYPE_AAAA:
                rec = DNSAddress(domain, info[0], info[1], info[2], self.readString(16))
            else:
                self.offset += info[3]

            if rec is not None:
                self.answers.append(rec)

    def isQuery(self):
        return (self.flags & _FLAGS_QR_MASK) == _FLAGS_QR_QUERY

    def isResponse(self):
        return (self.flags & _FLAGS_QR_MASK) == _FLAGS_QR_RESPONSE

    def readUTF(self, offset, len):
        return self.data[offset:offset+len].decode('utf-8')

    def readName(self):
        result = ''
        off = self.offset
        next = -1
        first = off

        while 1:
            try:
                len = ord(self.data[off])
                off += 1
                if len == 0:
                    break
                t = len & 0xC0
                if t == 0x00:
                    result = ''.join((result, self.readUTF(off, len) + '.'))
                    off += len
                elif t == 0xC0:
                    if next < 0:
                        next = off + 1
                    off = ((len & 0x3F) << 8) | ord(self.data[off])
                    if off >= first:
                        raise BadDomainNameCircular(off)
                    first = off
                else:
                    raise BadDomainName(off)
            except IndexError:
                raise MalformedPacketException()

        if next >= 0:
            self.offset = next
        else:
            self.offset = off

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
        if record is not None:
            if now == 0 or not record.isExpired(now):
                self.answers.append((record, now))

    def addAuthorativeAnswer(self, record):
        self.authorities.append(record)

    def addAdditionalAnswer(self, record):
        self.additionals.append(record)

    def writeByte(self, value):
        format = '!c'
        self.data.append(struct.pack(format, chr(value)))
        self.size += 1

    def insertShort(self, index, value):
        format = '!H'
        self.data.insert(index, struct.pack(format, value))
        self.size += 2

    def writeShort(self, value):
        format = '!H'
        self.data.append(struct.pack(format, value))
        self.size += 2

    def writeInt(self, value):
        format = '!I'
        self.data.append(struct.pack(format, int(value)))
        self.size += 4

    def writeString(self, value, length):
        format = '!' + str(length) + 's'
        self.data.append(struct.pack(format, value))
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
        if now == 0:
            self.writeInt(record.ttl)
        else:
            self.writeInt(record.getRemainingTTL(now))
        index = len(self.data)
        self.size += 2
        record.write(self)
        self.size -= 2

        length = len(''.join(self.data[index:]))
        self.insertShort(index, length)  

    def packet(self):
        if not self.finished:
            self.finished = 1
            for question in self.questions:
                self.writeQuestion(question)
            for answer, atime in self.answers:
                self.writeRecord(answer, atime)
            for authority in self.authorities:
                self.writeRecord(authority, 0)
            for additional in self.additionals:
                self.writeRecord(additional, 0)

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
        try:
            list = self.cache[entry.key]
        except:
            list = self.cache[entry.key] = []
        list.append(entry)

    def remove(self, entry):
        try:
            list = self.cache[entry.key]
            list.remove(entry)
        except:
            pass

    def get(self, entry):
        try:
            list = self.cache[entry.key]
            return list[list.index(entry)]
        except:
            return None

    def getByDetails(self, name, type, clazz):
        entry = DNSEntry(name, type, clazz)
        return self.get(entry)

    def entriesWithName(self, name):
        try:
            return self.cache[name]
        except:
            return []

    def entries(self):
        def add(x, y):
            return x+y
        try:
            return reduce(add, self.cache.values())
        except:
            return []

class Engine(threading.Thread):

    def __init__(self, zeroconf):
        threading.Thread.__init__(self)
        self.zeroconf = zeroconf
        self.readers = {}  
        self.timeout = 5
        self.condition = threading.Condition()
        self.setDaemon(True)  
        self.start()

    def run(self):
        while not _GLOBAL_DONE:
            rs = self.getReaders()
            if len(rs) == 0:
                self.condition.acquire()
                self.condition.wait(self.timeout)
                self.condition.release()
            else:
                try:
                    rr, wr, er = select.select(rs, [], [], self.timeout)
                    if _GLOBAL_DONE:
                        continue
                    for sock in rr:
                        try:
                            self.readers[sock].handle_read()
                        except MalformedPacketException:
                            pass
                        except:
                            traceback.print_exc()
                except:
                    pass

    def getReaders(self):
        self.condition.acquire()
        result = self.readers.keys()
        self.condition.release()
        return result

    def addReader(self, reader, socket):
        self.condition.acquire()
        self.readers[socket] = reader
        self.condition.notify()
        self.condition.release()

    def delReader(self, socket):
        self.condition.acquire()
        del(self.readers[socket])
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
        self.data = data
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
        threading.Thread.__init__(self)
        self.setDaemon(True)  
        self.zeroconf = zeroconf
        self.start()

    def run(self):
        while 1:
            try:
                self.zeroconf.wait(10 * 1000)
            except TypeError:  
                _GLOBAL_DONE = 1
                return
            if _GLOBAL_DONE:
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
        if record.type == _TYPE_PTR and record.name == self.type:
            expired = record.isExpired(now)
            try:
                oldrecord = self.services[record.alias.lower()]
                if not expired:
                    oldrecord.resetTTL(record)
                else:
                    del(self.services[record.alias.lower()])
                    callback = lambda x: self.listener.removeService(x, self.type, record.alias)
                    self.list.append(callback)
                    return
            except:
                if not expired:
                    self.services[record.alias.lower()] = record
                    callback = lambda x: self.listener.addService(x, self.type, record.alias)
                    self.list.append(callback)

            expires = record.getExpirationTime(75)
            if expires < self.nextTime:
                self.nextTime = expires

    def cancel(self):
        self.done = 1
        self.zeroconf.notifyAll()

    def run(self):
        while 1:
            event = None
            now = currentTimeMillis()
            if len(self.list) == 0 and self.nextTime > now:
                self.zeroconf.wait(self.nextTime - now)
            if _GLOBAL_DONE or self.done:
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

            if len(self.list) > 0:
                event = self.list.pop(0)

            if event is not None:
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
        if server:
            self.server = server
        else:
            self.server = name
        self.setProperties(properties)

    def setProperties(self, properties):
        if isinstance(properties, dict):
            self.properties = properties
            list = []
            result = ''
            for key in properties:
                value = properties[key]
                if value is None:
                    suffix = ''
                elif isinstance(value, str):
                    suffix = value
                elif isinstance(value, int):
                    suffix = value and 'true' or 'false'
                else:
                    suffix = ''
                list.append('='.join((key, suffix)))
            for item in list:
                result = ''.join((result, struct.pack('!c', chr(len(item))), item))
            self.text = result
        else:
            self.text = properties

    def setText(self, text):
        self.text = text
        try:
            result = {}
            end = len(text)
            index = 0
            strs = []
            while index < end:
                length = ord(text[index])
                index += 1
                strs.append(text[index:index+length])
                index += length

            for s in strs:
                eindex = s.find('=')
                if eindex == -1:
                    key = s
                    value = 0
                else:
                    key = s[:eindex]
                    value = s[eindex+1:]
                    if value == 'true':
                        value = 1
                    elif value == 'false' or not value:
                        value = 0

                if key and result.get(key) == None:  
                    result[key] = value

            self.properties = result
        except:
            traceback.print_exc()
            self.properties = None

    def getType(self):
        return self.type

    def getName(self):
        if self.type is not None and self.name.endswith("." + self.type):
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
        if (record.type in (_TYPE_A, _TYPE_AAAA) and
            record.name == self.server):
            self.address = record.address
        elif record.type == _TYPE_SRV and record.name == self.name:
            self.server = record.server
            self.port = record.port
            self.weight = record.weight
            self.priority = record.priority
            self.updateRecord(zeroconf, now, zeroconf.cache.getByDetails(self.server, _TYPE_A, _CLASS_IN))
        elif record.type == _TYPE_TXT and record.name == self.name:
            self.setText(record.text)

    def request(self, zeroconf, timeout):
        now = currentTimeMillis()
        delay = _LISTENER_TIME
        next = now + delay
        last = now + timeout
        result = 0
        try:
            zeroconf.addListener(self, DNSQuestion(self.name, _TYPE_ANY, _CLASS_IN))
            while self.server is None or self.address is None or self.text is None:
                if last <= now:
                    return 0
                if next <= now:
                    out = DNSOutgoing(_FLAGS_QR_QUERY)
                    out.addQuestion(DNSQuestion(self.name, _TYPE_SRV, _CLASS_IN))
                    out.addAnswerAtTime(zeroconf.cache.getByDetails(self.name, _TYPE_SRV, _CLASS_IN), now)
                    out.addQuestion(DNSQuestion(self.name, _TYPE_TXT, _CLASS_IN))
                    out.addAnswerAtTime(zeroconf.cache.getByDetails(self.name, _TYPE_TXT, _CLASS_IN), now)
                    if self.server is not None:
                        out.addQuestion(DNSQuestion(self.server, _TYPE_A, _CLASS_IN))
                        out.addAnswerAtTime(zeroconf.cache.getByDetails(self.server, _TYPE_A, _CLASS_IN), now)
                    zeroconf.send(out)
                    next = now + delay
                    delay = delay * 2

                zeroconf.wait(min(next, last) - now)
                now = currentTimeMillis()
            result = 1
        finally:
            zeroconf.removeListener(self)

        return result

    def __eq__(self, other):
        if isinstance(other, ServiceInfo):
            return other.name == self.name
        return 0

    def __ne__(self, other):
        return not self.__eq__(other)

    def __repr__(self):
        result = "service[%s,%s:%s," % (self.name, ntop(self.getAddress()), self.port)
        if self.text is None:
            result += "None"
        else:
            if len(self.text) < 20:
                result += self.text
            else:
                result += self.text[:17] + "..."
        result += "]"
        return result

class Zeroconf(object):

    def __init__(self, bindaddress=None):
        _GLOBAL_DONE = 0
        if bindaddress is None:
            self.intf = socket.gethostbyname(socket.gethostname())
        else:
            self.intf = bindaddress
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
        self.socket.setsockopt(socket.SOL_IP, socket.IP_ADD_MEMBERSHIP, socket.inet_aton(_MDNS_ADDR) + socket.inet_aton('0.0.0.0'))

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
        if info.request(self, timeout):
            return info
        return None

    def addServiceListener(self, type, listener):
        self.removeServiceListener(listener)
        self.browsers.append(ServiceBrowser(self, type, listener))

    def removeServiceListener(self, listener):
        for browser in self.browsers:
            if browser.listener == listener:
                browser.cancel()
                del(browser)

    def registerService(self, info, ttl=_DNS_TTL):
        self.checkService(info)
        self.services[info.name.lower()] = info
        self.servicetypes[info.type] = self.servicetypes.get(info.type, 0) + 1
        now = currentTimeMillis()
        nextTime = now
        i = 0
        while i < 3:
            if now < nextTime:
                self.wait(nextTime - now)
                now = currentTimeMillis()
                continue
            out = DNSOutgoing(_FLAGS_QR_RESPONSE | _FLAGS_AA)
            out.addAnswerAtTime(DNSPointer(info.type, _TYPE_PTR, _CLASS_IN, ttl, info.name), 0)
            out.addAnswerAtTime(DNSService(info.name, _TYPE_SRV, _CLASS_IN, ttl, info.priority, info.weight, info.port, info.server), 0)
            out.addAnswerAtTime(DNSText(info.name, _TYPE_TXT, _CLASS_IN, ttl, info.text), 0)
            if info.address:
                out.addAnswerAtTime(DNSAddress(info.server, info.ip_type, _CLASS_IN, ttl, info.address), 0)
            self.send(out)
            i += 1
            nextTime += _REGISTER_TIME

    def unregisterService(self, info):
        try:
            del(self.services[info.name.lower()])
            if self.servicetypes[info.type]>1:
                self.servicetypes[info.type]-=1
            else:
                del self.servicetypes[info.type]
        except:
            pass
        now = currentTimeMillis()
        nextTime = now
        i = 0
        while i < 3:
            if now < nextTime:
                self.wait(nextTime - now)
                now = currentTimeMillis()
                continue
            out = DNSOutgoing(_FLAGS_QR_RESPONSE | _FLAGS_AA)
            out.addAnswerAtTime(DNSPointer(info.type, _TYPE_PTR, _CLASS_IN, 0, info.name), 0)
            out.addAnswerAtTime(DNSService(info.name, _TYPE_SRV, _CLASS_IN, 0, info.priority, info.weight, info.port, info.name), 0)
            out.addAnswerAtTime(DNSText(info.name, _TYPE_TXT, _CLASS_IN, 0, info.text), 0)
            if info.address:
                out.addAnswerAtTime(DNSAddress(info.server, info.ip_type, _CLASS_IN, 0, info.address), 0)
            self.send(out)
            i += 1
            nextTime += _UNREGISTER_TIME

    def unregisterAllServices(self):
        if not self.services:
            return
        now = currentTimeMillis()
        nextTime = now
        i = 0
        while i < 3:
            if now < nextTime:
                self.wait(nextTime - now)
                now = currentTimeMillis()
                continue
            out = DNSOutgoing(_FLAGS_QR_RESPONSE | _FLAGS_AA)
            for info in self.services.values():
                out.addAnswerAtTime(DNSPointer(info.type, _TYPE_PTR, _CLASS_IN, 0, info.name), 0)
                out.addAnswerAtTime(DNSService(info.name, _TYPE_SRV, _CLASS_IN, 0, info.priority, info.weight, info.port, info.server), 0)
                out.addAnswerAtTime(DNSText(info.name, _TYPE_TXT, _CLASS_IN, 0, info.text), 0)
                if info.address:
                    out.addAnswerAtTime(DNSAddress(info.server, info.ip_type, _CLASS_IN, 0, info.address), 0)
            self.send(out)
            i += 1
            nextTime += _UNREGISTER_TIME

    def countRegisteredServices(self):
        return len(self.services)

    def checkService(self, info):
        now = currentTimeMillis()
        nextTime = now
        i = 0
        while i < 3:
            for record in self.cache.entriesWithName(info.type):
                if record.type == _TYPE_PTR and not record.isExpired(now) and record.alias == info.name:
                    if (info.name.find('.') < 0):
                        info.name = info.name + ".[" + info.address + ":" + info.port + "]." + info.type
                        self.checkService(info)
                        return
                    raise NonUniqueNameException
            if now < nextTime:
                self.wait(nextTime - now)
                now = currentTimeMillis()
                continue
            out = DNSOutgoing(_FLAGS_QR_QUERY | _FLAGS_AA)
            out.addQuestion(DNSQuestion(info.type, _TYPE_PTR, _CLASS_IN))
            out.addAuthorativeAnswer(DNSPointer(info.type, _TYPE_PTR, _CLASS_IN, _DNS_TTL, info.name))
            self.send(out)
            i += 1
            nextTime += _CHECK_TIME

    def addListener(self, listener, question):
        now = currentTimeMillis()
        self.listeners.append(listener)
        if question is not None:
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
                    if entry is not None:
                        entry.resetTTL(record)
                        record = entry
            else:
                self.cache.add(record)

            self.updateRecord(now, record)

    def handleQuery(self, msg, addr, port):
        out = None
        if port != _MDNS_PORT:
            out = DNSOutgoing(_FLAGS_QR_RESPONSE | _FLAGS_AA, 0)
            for question in msg.questions:
                out.addQuestion(question)

        for question in msg.questions:
            if question.type == _TYPE_PTR:
                if question.name == "_services._dns-sd._udp.local.":
                    for stype in self.servicetypes.keys():
                        if out is None:
                            out = DNSOutgoing(_FLAGS_QR_RESPONSE | _FLAGS_AA)
                        out.addAnswer(msg, DNSPointer("_services._dns-sd._udp.local.", _TYPE_PTR, _CLASS_IN, _DNS_TTL, stype))
                for service in self.services.values():
                    if question.name == service.type:
                        if out is None:
                            out = DNSOutgoing(_FLAGS_QR_RESPONSE | _FLAGS_AA)
                        out.addAnswer(msg, DNSPointer(service.type, _TYPE_PTR, _CLASS_IN, _DNS_TTL, service.name))
            else:
                try:
                    if out is None:
                        out = DNSOutgoing(_FLAGS_QR_RESPONSE | _FLAGS_AA)

                    if question.type in (_TYPE_A, _TYPE_AAAA, _TYPE_ANY):
                        for service in self.services.values():
                            if service.server == question.name.lower():
                                out.addAnswer(
                                    msg, DNSAddress(question.name, address_type(service.address), _CLASS_IN | _CLASS_UNIQUE, _DNS_TTL, service.address))

                    service = self.services.get(question.name.lower(), None)
                    if not service:
                        continue

                    if question.type == _TYPE_SRV or question.type == _TYPE_ANY:
                        out.addAnswer(msg, DNSService(question.name, _TYPE_SRV, _CLASS_IN | _CLASS_UNIQUE,
                                      _DNS_TTL, service.priority, service.weight, service.port, service.server))
                    if question.type == _TYPE_TXT or question.type == _TYPE_ANY:
                        out.addAnswer(msg, DNSText(question.name, _TYPE_TXT, _CLASS_IN | _CLASS_UNIQUE, _DNS_TTL, service.text))
                    if question.type == _TYPE_SRV:
                        out.addAdditionalAnswer(DNSAddress(service.server, address_type(service.address), _CLASS_IN | _CLASS_UNIQUE, _DNS_TTL, service.address))
                except:
                    traceback.print_exc()

        if out is not None and out.answers:
            out.id = msg.id
            self.send(out, addr, port)

    def send(self, out, addr=_MDNS_ADDR, port=_MDNS_PORT):
        try:
            self.socket.sendto(out.packet(), 0, (addr, port))
        except:
            pass

    def close(self):
        if _GLOBAL_DONE == 0:
            _GLOBAL_DONE = 1
            self.notifyAll()
            self.engine.notify()
            self.unregisterAllServices()
            self.socket.setsockopt(socket.SOL_IP, socket.IP_DROP_MEMBERSHIP, socket.inet_aton(_MDNS_ADDR) + socket.inet_aton('0.0.0.0'))
            self.socket.close()

if __name__ == '__main__':
    print("Multicast DNS Service Discovery for Python, version", "0.12")
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