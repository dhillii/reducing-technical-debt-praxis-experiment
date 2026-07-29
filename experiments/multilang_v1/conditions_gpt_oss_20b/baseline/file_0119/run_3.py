import time, re, base64, types, socket, os, random, rfc822
import binascii
import warnings
from email.base64MIME import encode as encode_base64

from zope.interface import implements, Interface

from twisted.copyright import longversion
from twisted.protocols import basic
from twisted.protocols import policies
from twisted.internet import protocol
from twisted.internet import defer
from twisted.internet import error
from twisted.internet import reactor
from twisted.internet.interfaces import ITLSTransport, ISSLTransport
from twisted.python import log
from twisted.python import util

from twisted import cred
from twisted.python.runtime import platform

try:
    from cStringIO import StringIO
except ImportError:
    from StringIO import StringIO

if platform.isMacOSX():
    DNSNAME = socket.gethostname()
else:
    DNSNAME = socket.getfqdn()

SUCCESS = dict.fromkeys(xrange(200,300))

class IMessageDelivery(Interface):
    def receivedHeader(helo, origin, recipients):
        pass
    def validateTo(user):
        pass
    def validateFrom(helo, origin):
        pass

class IMessageDeliveryFactory(Interface):
    def getMessageDelivery():
        pass

class SMTPError(Exception):
    pass

class SMTPClientError(SMTPError):
    def __init__(self, code, resp, log=None, addresses=None, isFatal=False, retry=False):
        self.code = code
        self.resp = resp
        self.log = log
        self.addresses = addresses
        self.isFatal = isFatal
        self.retry = retry
    def __str__(self):
        res = ["%.3d %s" % (self.code, self.resp)] if self.code > 0 else [self.resp]
        if self.log:
            res.append(self.log)
            res.append('')
        return '\n'.join(res)

class ESMTPClientError(SMTPClientError):
    pass

class EHLORequiredError(ESMTPClientError):
    pass

class AUTHRequiredError(ESMTPClientError):
    pass

class TLSRequiredError(ESMTPClientError):
    pass

class AUTHDeclinedError(ESMTPClientError):
    pass

class AuthenticationError(ESMTPClientError):
    pass

class TLSError(ESMTPClientError):
    pass

class SMTPConnectError(SMTPClientError):
    def __init__(self, code, resp, log=None, addresses=None, isFatal=True, retry=True):
        SMTPClientError.__init__(self, code, resp, log, addresses, isFatal, retry)

class SMTPTimeoutError(SMTPClientError):
    def __init__(self, code, resp, log=None, addresses=None, isFatal=True, retry=True):
        SMTPClientError.__init__(self, code, resp, log, addresses, isFatal, retry)

class SMTPProtocolError(SMTPClientError):
    def __init__(self, code, resp, log=None, addresses=None, isFatal=True, retry=False):
        SMTPClientError.__init__(self, code, resp, log, addresses, isFatal, retry)

class SMTPDeliveryError(SMTPClientError):
    pass

class SMTPServerError(SMTPError):
    def __init__(self, code, resp):
        self.code = code
        self.resp = resp
    def __str__(self):
        return "%.3d %s" % (self.code, self.resp)

class SMTPAddressError(SMTPServerError):
    def __init__(self, addr, code, resp):
        SMTPServerError.__init__(self, code, resp)
        self.addr = Address(addr)
    def __str__(self):
        return "%.3d <%s>... %s" % (self.code, self.addr, self.resp)

class SMTPBadRcpt(SMTPAddressError):
    def __init__(self, addr, code=550, resp='Cannot receive for specified address'):
        SMTPAddressError.__init__(self, addr, code, resp)

class SMTPBadSender(SMTPAddressError):
    def __init__(self, addr, code=550, resp='Sender not acceptable'):
        SMTPAddressError.__init__(self, addr, code, resp)

def rfc822date(timeinfo=None,local=1):
    if not timeinfo:
        timeinfo = time.localtime() if local else time.gmtime()
    if local:
        tz = -time.altzone if timeinfo[8] else -time.timezone
        tzhr, tzmin = divmod(abs(tz), 3600)
        if tz: tzhr *= int(abs(tz)//tz)
        tzmin, tzsec = divmod(tzmin, 60)
    else:
        tzhr, tzmin = (0,0)
    return "%s, %02d %s %04d %02d:%02d:%02d %+03d%02d" % (
        ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][timeinfo[6]],
        timeinfo[2],
        ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
         'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][timeinfo[1] - 1],
        timeinfo[0], timeinfo[3], timeinfo[4], timeinfo[5],
        tzhr, tzmin)

def idGenerator():
    i = 0
    while True:
        yield i
        i += 1

def messageid(uniq=None, N=idGenerator().next):
    datetime = time.strftime('%Y%m%d%H%M%S', time.gmtime())
    pid = os.getpid()
    rand = random.randrange(2**31-1)
    uniq = '' if uniq is None else '.' + uniq
    return '<%s.%s.%s%s.%s@%s>' % (datetime, pid, rand, uniq, N(), DNSNAME)

def quoteaddr(addr):
    if isinstance(addr, Address):
        return '<%s>' % str(addr)
    res = rfc822.parseaddr(addr)
    return '<%s>' % (res[1] if res != (None, None) else addr)

COMMAND, DATA, AUTH = 'COMMAND', 'DATA', 'AUTH'

class AddressError(SMTPError):
    pass

atom = r"[-A-Za-z0-9!\#$%&'*+/=?^_`{|}~]"

class Address:
    tstring = re.compile(r'''(
                          (?:"[^"]*" | \\. | ''' + atom + r''' )+ | .)''', re.X)
    atomre = re.compile(atom)

    def __init__(self, addr, defaultDomain=None):
        if isinstance(addr, User):
            addr = addr.dest
        if isinstance(addr, Address):
            self.__dict__ = addr.__dict__.copy()
            return
        if not isinstance(addr, types.StringTypes):
            addr = str(addr)
        self.addrstr = addr
        tokens = [t for t in self.tstring.split(addr) if t]
        local, domain = self._parse_tokens(tokens, defaultDomain)
        self.local = local
        self.domain = domain

    def _parse_tokens(self, tokens, defaultDomain):
        local = []
        domain = []
        i = 0
        in_domain = False
        while i < len(tokens):
            token = tokens[i]
            if token == '<':
                if tokens[-1] != '>':
                    raise AddressError("Unbalanced <>")
                tokens = tokens[1:-1]
                i = 0
                continue
            if token == '@':
                i += 1
                if not local:
                    while i < len(tokens) and tokens[i] != ':':
                        i += 1
                    if i == len(tokens):
                        raise AddressError("Malformed source route")
                    i += 1
                    continue
                if in_domain:
                    raise AddressError("Too many @")
                in_domain = True
                continue
            if len(token) == 1 and not self.atomre.match(token) and token != '.':
                raise AddressError("Parse error at %r of %r" % (token, (self.addrstr, tokens)))
            if not in_domain:
                local.append(token)
            else:
                domain.append(token)
            i += 1
        local_str = ''.join(local)
        domain_str = ''.join(domain)
        if local_str and not domain_str:
            if defaultDomain is None:
                defaultDomain = DNSNAME
            domain_str = defaultDomain
        return local_str, domain_str

    dequotebs = re.compile(r'\\(.)')
    def dequote(self,addr):
        res = []
        atl = [t for t in self.tstring.split(str(addr)) if t]
        for t in atl:
            if t[0] == '"' and t[-1] == '"':
                res.append(t[1:-1])
            elif '\\' in t:
                res.append(self.dequotebs.sub(r'\1',t))
            else:
                res.append(t)
        return ''.join(res)

    def __str__(self):
        return '@'.join((self.local, self.domain)) if self.local or self.domain else ''

    def __repr__(self):
        return "%s.%s(%s)" % (self.__module__, self.__class__.__name__, repr(str(self)))

class User:
    def __init__(self, destination, helo, protocol, orig):
        host = getattr(protocol, 'host', None)
        self.dest = Address(destination, host)
        self.helo = helo
        self.protocol = protocol
        self.orig = Address(orig, host) if not isinstance(orig, Address) else orig
    def __getstate__(self):
        return {'dest': self.dest, 'helo': self.helo, 'protocol': None, 'orig': self.orig}
    def __str__(self):
        return str(self.dest)

class IMessage(Interface):
    def lineReceived(line):
        pass
    def eomReceived():
        pass
    def connectionLost():
        pass

class SMTP(basic.LineOnlyReceiver, policies.TimeoutMixin):
    timeout = 600
    host = DNSNAME
    portal = None
    noisy = True
    deliveryFactory = None
    delivery = None
    _onLogout = None

    def __init__(self, delivery=None, deliveryFactory=None):
        self.mode = COMMAND
        self._from = None
        self._helo = None
        self._to = []
        self.delivery = delivery
        self.deliveryFactory = deliveryFactory

    def timeoutConnection(self):
        self.sendCode(421, '%s Timeout. Try talking faster next time!' % (self.host,))
        self.transport.loseConnection()

    def greeting(self):
        return '%s NO UCE NO UBE NO RELAY PROBES' % (self.host,)

    def connectionMade(self):
        peer = self.transport.getPeer()
        host = getattr(peer, 'host', str(peer))
        self._helo = (None, host)
        self.sendCode(220, self.greeting())
        self.setTimeout(self.timeout)

    def sendCode(self, code, message=''):
        lines = message.splitlines()
        for line in lines[:-1]:
            self.sendLine('%3.3d-%s' % (code, line))
        self.sendLine('%3.3d %s' % (code, lines[-1] if lines else ''))

    def lineReceived(self, line):
        self.resetTimeout()
        return getattr(self, 'state_' + self.mode)(line)

    def state_COMMAND(self, line):
        line = line.strip()
        parts = line.split(None, 1)
        if parts:
            method = self.lookupMethod(parts[0]) or self.do_UNKNOWN
            method(parts[1] if len(parts) == 2 else '')
        else:
            self.sendSyntaxError()

    def sendSyntaxError(self):
        self.sendCode(500, 'Error: bad syntax')

    def lookupMethod(self, command):
        return getattr(self, 'do_' + command.upper(), None)

    def lineLengthExceeded(self, line):
        if self.mode is DATA:
            for message in self.__messages:
                message.connectionLost()
            self.mode = COMMAND
            del self.__messages
        self.sendCode(500, 'Line too long')

    def do_UNKNOWN(self, rest):
        self.sendCode(500, 'Command not implemented')

    def do_HELO(self, rest):
        peer = self.transport.getPeer()
        host = getattr(peer, 'host', str(peer))
        self._helo = (rest, host)
        self._from = None
        self._to = []
        self.sendCode(250, '%s Hello %s, nice to meet you' % (self.host, host))

    def do_QUIT(self, rest):
        self.sendCode(221, 'See you later')
        self.transport.loseConnection()

    qstring = r'("[^"]*"|\\.|' + atom + r'|[@.,:])+'
    mail_re = re.compile(r'''\s*FROM:\s*(?P<path><> |<''' + qstring + r'''> |''' + qstring + r''' )\s*(\s(?P<opts>.*))? $''', re.I|re.X)
    rcpt_re = re.compile(r'\s*TO:\s*(?P<path><' + qstring + r'> |''' + qstring + r''' )\s*(\s(?P<opts>.*))? $''', re.I|re.X)

    def do_MAIL(self, rest):
        if self._from:
            self.sendCode(503,"Only one sender per message, please")
            return
        self._to = []
        m = self.mail_re.match(rest)
        if not m:
            self.sendCode(501, "Syntax error")
            return
        try:
            addr = Address(m.group('path'), self.host)
        except AddressError as e:
            self.sendCode(553, str(e))
            return
        validated = defer.maybeDeferred(self.validateFrom, self._helo, addr)
        validated.addCallbacks(self._cbFromValidate, self._ebFromValidate)

    def _cbFromValidate(self, from_, code=250, msg='Sender address accepted'):
        self._from = from_
        self.sendCode(code, msg)

    def _ebFromValidate(self, failure):
        if failure.check(SMTPBadSender):
            self.sendCode(failure.value.code,
                          'Cannot receive from specified address %s: %s'
                          % (quoteaddr(failure.value.addr), failure.value.resp))
        elif failure.check(SMTPServerError):
            self.sendCode(failure.value.code, failure.value.resp)
        else:
            log.err(failure, "SMTP sender validation failure")
            self.sendCode(451, 'Requested action aborted: local error in processing')

    def do_RCPT(self, rest):
        if not self._from:
            self.sendCode(503, "Must have sender before recipient")
            return
        m = self.rcpt_re.match(rest)
        if not m:
            self.sendCode(501, "Syntax error")
            return
        try:
            user = User(m.group('path'), self._helo, self, self._from)
        except AddressError as e:
            self.sendCode(553, str(e))
            return
        d = defer.maybeDeferred(self.validateTo, user)
        d.addCallbacks(self._cbToValidate, self._ebToValidate, callbackArgs=(user,))

    def _cbToValidate(self, to, user=None, code=250, msg='Recipient address accepted'):
        if user is None:
            user = to
        self._to.append((user, to))
        self.sendCode(code, msg)

    def _ebToValidate(self, failure):
        if failure.check(SMTPBadRcpt, SMTPServerError):
            self.sendCode(failure.value.code, failure.value.resp)
        else:
            log.err(failure)
            self.sendCode(451, 'Requested action aborted: local error in processing')

    def _disconnect(self, msgs):
        for msg in msgs:
            try:
                msg.connectionLost()
            except:
                log.msg("msg raised exception from connectionLost")
                log.err()

    def do_DATA(self, rest):
        if self._from is None or not self._to:
            self.sendCode(503, 'Must have valid receiver and originator')
            return
        self.mode = DATA
        helo, origin = self._helo, self._from
        recipients = self._to
        self._from = None
        self._to = []
        self.datafailed = None
        msgs = []
        for (user, msgFunc) in recipients:
            try:
                msg = msgFunc()
                rcvdhdr = self.receivedHeader(helo, origin, [user])
                if rcvdhdr:
                    msg.lineReceived(rcvdhdr)
                msgs.append(msg)
            except SMTPServerError as e:
                self.sendCode(e.code, e.resp)
                self.mode = COMMAND
                self._disconnect(msgs)
                return
            except:
                log.err()
                self.sendCode(550, "Internal server error")
                self.mode = COMMAND
                self._disconnect(msgs)
                return
        self.__messages = msgs
        self.__inheader = self.__inbody = 0
        self.sendCode(354, 'Continue')
        if self.noisy:
            fmt = 'Receiving message for delivery: from=%s to=%s'
            log.msg(fmt % (origin, [str(u) for (u, f) in recipients]))

    def connectionLost(self, reason):
        if self.mode is DATA:
            try:
                for message in self.__messages:
                    try:
                        message.connectionLost()
                    except:
                        log.err()
                del self.__messages
            except AttributeError:
                pass
        if self._onLogout:
            self._onLogout()
            self._onLogout = None
        self.setTimeout(None)

    def do_RSET(self, rest):
        self._from = None
        self._to = []
        self.sendCode(250, 'I remember nothing.')

    def dataLineReceived(self, line):
        if line[:1] == '.':
            if line == '.':
                self.mode = COMMAND
                if self.datafailed:
                    self.sendCode(self.datafailed.code, self.datafailed.resp)
                    return
                if not self.__messages:
                    self._messageHandled("thrown away")
                    return
                defer.DeferredList([m.eomReceived() for m in self.__messages], consumeErrors=True).addCallback(self._messageHandled)
                del self.__messages
                return
            line = line[1:]
        if self.datafailed:
            return
        try:
            if not self.__inheader and not self.__inbody:
                if ':' in line:
                    self.__inheader = 1
                elif line:
                    for message in self.__messages:
                        message.lineReceived('')
                    self.__inbody = 1
            if not line:
                self.__inbody = 1
            for message in self.__messages:
                message.lineReceived(line)
        except SMTPServerError as e:
            self.datafailed = e
            for message in self.__messages:
                message.connectionLost()
    state_DATA = dataLineReceived

    def _messageHandled(self, resultList):
        failures = 0
        for (success, result) in resultList:
            if not success:
                failures += 1
                log.err(result)
        if failures:
            msg = 'Could not send e-mail'
            L = len(resultList)
            if L > 1:
                msg += ' (%d failures out of %d recipients)' % (failures, L)
            self.sendCode(550, msg)
        else:
            self.sendCode(250, 'Delivery in progress')

    def _cbAnonymousAuthentication(self, (iface, avatar, logout)):
        if issubclass(iface, IMessageDeliveryFactory):
            self.deliveryFactory = avatar
            self.delivery = None
        elif issubclass(iface, IMessageDelivery):
            self.deliveryFactory = None
            self.delivery = avatar
        else:
            raise RuntimeError("%s is not a supported interface" % (iface.__name__,))
        self._onLogout = logout
        self.challenger = None

    def validateFrom(self, helo, origin):
        if self.deliveryFactory is not None:
            self.delivery = self.deliveryFactory.getMessageDelivery()
        if self.delivery is not None:
            return defer.maybeDeferred(self.delivery.validateFrom, helo, origin)
        if self.portal:
            result = self.portal.login(cred.credentials.Anonymous(), None, IMessageDeliveryFactory, IMessageDelivery)
            def ebAuthentication(err):
                if err.check(cred.error.UnauthorizedLogin):
                    exc = SMTPBadSender(origin)
                elif err.check(cred.error.UnhandledCredentials):
                    exc = SMTPBadSender(origin, resp="Unauthenticated senders not allowed")
                else:
                    return err
                return defer.fail(exc)
            result.addCallbacks(self._cbAnonymousAuthentication, ebAuthentication)
            def continueValidation(ignored):
                return self.validateFrom(helo, origin)
            result.addCallback(continueValidation)
            return result
        raise SMTPBadSender(origin)

    def validateTo(self, user):
        if self.delivery is not None:
            return self.delivery.validateTo(user)
        raise SMTPBadRcpt(user)

    def receivedHeader(self, helo, origin, recipients):
        if self.delivery is not None:
            return self.delivery.receivedHeader(helo, origin, recipients)
        heloStr = ""
        if helo[0]:
            heloStr = " helo=%s" % (helo[0],)
        domain = self.transport.getHost().host
        from_ = "from %s ([%s]%s)" % (helo[0], helo[1], heloStr)
        by = "by %s with %s (%s)" % (domain, self.__class__.__name__, longversion)
        for_ = "for %s; %s" % (' '.join(map(str, recipients)), rfc822date())
        return "Received: %s\n\t%s\n\t%s" % (from_, by, for_)

class SMTPFactory(protocol.ServerFactory):
    domain = DNSNAME
    timeout = 600
    protocol = SMTP
    portal = None
    def __init__(self, portal=None):
        self.portal = portal
    def buildProtocol(self, addr):
        p = protocol.ServerFactory.buildProtocol(self, addr)
        p.portal = self.portal
        p.host = self.domain
        return p

class SMTPClient(basic.LineReceiver, policies.TimeoutMixin):
    debug = True
    timeout = None
    def __init__(self, identity, logsize=10):
        self.identity = identity or ''
        self.toAddressesResult = []
        self.successAddresses = []
        self._from = None
        self.resp = []
        self.code = -1
        self.log = util.LineLog(logsize)
    def sendLine(self, line):
        if self.debug:
            self.log.append('>>> ' + line)
        basic.LineReceiver.sendLine(self,line)
    def connectionMade(self):
        self.setTimeout(self.timeout)
        self._expected = [ 220 ]
        self._okresponse = self.smtpState_helo
        self._failresponse = self.smtpConnectionFailed
    def connectionLost(self, reason=protocol.connectionDone):
        self.setTimeout(None)
        self.mailFile = None
    def timeoutConnection(self):
        self.sendError(SMTPTimeoutError(-1, "Timeout waiting for SMTP server response", self.log.str()))
    def lineReceived(self, line):
        self.resetTimeout()
        if self.debug:
            self.log.append('<<< ' + line)
        try:
            self.code = int(line[:3])
        except ValueError:
            self.sendError(SMTPProtocolError(-1, "Invalid response from SMTP server: %s" % line, self.log.str()))
            return
        if line[0] == '0':
            return
        self.resp.append(line[4:])
        if line[3:4] == '-':
            return
        if self.code in self._expected:
            why = self._okresponse(self.code,'\n'.join(self.resp))
        else:
            why = self._failresponse(self.code,'\n'.join(self.resp))
        self.code = -1
        self.resp = []
        return why
    def smtpConnectionFailed(self, code, resp):
        self.sendError(SMTPConnectError(code, resp, self.log.str()))
    def smtpTransferFailed(self, code, resp):
        if code < 0:
            self.sendError(SMTPProtocolError(code, resp, self.log.str()))
        else:
            self.smtpState_msgSent(code, resp)
    def smtpState_helo(self, code, resp):
        self.sendLine('HELO ' + self.identity)
        self._expected = SUCCESS
        self._okresponse = self.smtpState_from
    def smtpState_from(self, code, resp):
        self._from = self.getMailFrom()
        self._failresponse = self.smtpTransferFailed
        if self._from is not None:
            self.sendLine('MAIL FROM:%s' % quoteaddr(self._from))
            self._expected = [250]
            self._okresponse = self.smtpState_to
        else:
            self._disconnectFromServer()
    def smtpState_disconnect(self, code, resp):
        self.transport.loseConnection()
    def smtpState_to(self, code, resp):
        self.toAddresses = iter(self.getMailTo())
        self.toAddressesResult = []
        self.successAddresses = []
        self._okresponse = self.smtpState_toOrData
        self._expected = xrange(0,1000)
        self.lastAddress = None
        return self.smtpState_toOrData(0, '')
    def smtpState_toOrData(self, code, resp):
        if self.lastAddress is not None:
            self.toAddressesResult.append((self.lastAddress, code, resp))
            if code in SUCCESS:
                self.successAddresses.append(self.lastAddress)
        try:
            self.lastAddress = self.toAddresses.next()
        except StopIteration:
            if self.successAddresses:
                self.sendLine('DATA')
                self._expected = [ 354 ]
                self._okresponse = self.smtpState_data
            else:
                return self.smtpState_msgSent(code,'No recipients accepted')
        else:
            self.sendLine('RCPT TO:%s' % quoteaddr(self.lastAddress))
    def smtpState_data(self, code, resp):
        s = basic.FileSender()
        d = s.beginFileTransfer(self.getMailData(), self.transport, self.transformChunk)
        def ebTransfer(err):
            self.sendError(err.value)
        d.addCallbacks(self.finishedFileTransfer, ebTransfer)
        self._expected = SUCCESS
        self._okresponse = self.smtpState_msgSent
    def smtpState_msgSent(self, code, resp):
        if self._from is not None:
            self.sentMail(code, resp, len(self.successAddresses), self.toAddressesResult, self.log)
        self.toAddressesResult = []
        self._from = None
        self.sendLine('RSET')
        self._expected = SUCCESS
        self._okresponse = self.smtpState_from
    def transformChunk(self, chunk):
        self.resetTimeout()
        return chunk.replace('\n', '\r\n').replace('\r\n.', '\r\n..')
    def finishedFileTransfer(self, lastsent):
        line = '\r\n.' if lastsent != '\n' else '.'
        self.sendLine(line)
    def getMailFrom(self):
        raise NotImplementedError
    def getMailTo(self):
        raise NotImplementedError
    def getMailData(self):
        raise NotImplementedError
    def sendError(self, exc):
        if isinstance(exc, SMTPClientError) and not exc.isFatal:
            self._disconnectFromServer()
        else:
            self.smtpState_disconnect(-1, None)
    def sentMail(self, code, resp, numOk, addresses, log):
        raise NotImplementedError
    def _disconnectFromServer(self):
        self._expected = xrange(0, 1000)
        self._okresponse = self.smtpState_disconnect
        self.sendLine('QUIT')

class ESMTPClient(SMTPClient):
    heloFallback = True
    requireAuthentication = False
    requireTransportSecurity = False
    context = None
    _tlsMode = False
    def __init__(self, secret, contextFactory=None, *args, **kw):
        SMTPClient.__init__(self, *args, **kw)
        self.authenticators = []
        self.secret = secret
        self.context = contextFactory
    def __getattr__(self, name):
        if name == "tlsMode":
            warnings.warn("tlsMode attribute of twisted.mail.smtp.ESMTPClient is deprecated since Twisted 13.0", category=DeprecationWarning, stacklevel=2)
            return self._tlsMode
        raise AttributeError('%s instance has no attribute %r' % (self.__class__.__name__, name))
    def __setattr__(self, name, value):
        if name == "tlsMode":
            warnings.warn("tlsMode attribute of twisted.mail.smtp.ESMTPClient is deprecated since Twisted 13.0", category=DeprecationWarning, stacklevel=2)
            self._tlsMode = value
        else:
            self.__dict__[name] = value
    def esmtpEHLORequired(self, code=-1, resp=None):
        self.sendError(EHLORequiredError(502, b"Server does not support ESMTP Authentication", self.log.str()))
    def esmtpAUTHRequired(self, code=-1, resp=None):
        tmp = [a.getName().upper() for a in self.authenticators]
        auth = b"[%s]" % b", ".join(tmp)
        self.sendError(AUTHRequiredError(502, b"Server does not support Client Authentication schemes %s" % auth, self.log.str()))
    def esmtpTLSRequired(self, code=-1, resp=None):
        self.sendError(TLSRequiredError(502, b"Server does not support secure communication via TLS / SSL", self.log.str()))
    def esmtpTLSFailed(self, code=-1, resp=None):
        self.sendError(TLSError(code, b"Could not complete the SSL/TLS handshake", self.log.str()))
    def esmtpAUTHDeclined(self, code=-1, resp=None):
        self.sendError(AUTHDeclinedError(code, resp, self.log.str()))
    def esmtpAUTHMalformedChallenge(self, code=-1, resp=None):
        self.sendError(AuthenticationError(501, b"Login failed because the SMTP Server returned a malformed Authentication Challenge", self.log.str()))
    def esmtpAUTHServerError(self, code=-1, resp=None):
        self.sendError(AuthenticationError(code, resp, self.log.str()))
    def registerAuthenticator(self, auth):
        self.authenticators.append(auth)
    def connectionMade(self):
        self._tlsMode = ISSLTransport.providedBy(self.transport)
        SMTPClient.connectionMade(self)
        self._okresponse = self.esmtpState_ehlo
    def esmtpState_ehlo(self, code, resp):
        self._expected = SUCCESS
        self._okresponse = self.esmtpState_serverConfig
        self._failresponse = self.esmtpEHLORequired
        needTLS = not self._tlsMode and self.requireTransportSecurity
        if self.heloFallback and not self.requireAuthentication and not needTLS:
            self._failresponse = self.smtpState_helo
        self.sendLine(b"EHLO " + self.identity)
    def esmtpState_serverConfig(self, code, resp):
        items = {}
        for line in resp.splitlines():
            e = line.split(None, 1)
            items[e[0]] = e[1] if len(e) > 1 else None
        self.tryTLS(code, resp, items)
    def tryTLS(self, code, resp, items):
        hasTLS = self._tlsMode
        canTLS = self.context and b"STARTTLS" in items
        mustTLS = self.requireTransportSecurity
        if hasTLS or not (canTLS or mustTLS):
            self.authenticate(code, resp, items)
        elif canTLS:
            self._expected = [220]
            self._okresponse = self.esmtpState_starttls
            self._failresponse = self.esmtpTLSFailed
            self.sendLine(b"STARTTLS")
        else:
            self.esmtpTLSRequired()
    def esmtpState_starttls(self, code, resp):
        try:
            self.transport.startTLS(self.context)
            self._tlsMode = True
        except:
            log.err()
            self.esmtpTLSFailed(451)
        self.esmtpState_ehlo(code, resp)
    def authenticate(self, code, resp, items):
        if self.secret and items.get('AUTH'):
            schemes = items['AUTH'].split()
            tmpSchemes = {s.upper():1 for s in schemes}
            for a in self.authenticators:
                auth = a.getName().upper()
                if auth in tmpSchemes:
                    self._authinfo = a
                    if auth == b"PLAIN":
                        self._okresponse = self.smtpState_from
                        self._failresponse = self._esmtpState_plainAuth
                        self._expected = [235]
                        challenge = encode_base64(self._authinfo.challengeResponse(self.secret, 1), eol=b"")
                        self.sendLine(b"AUTH %s %s" % (auth, challenge))
                    else:
                        self._expected = [334]
                        self._okresponse = self.esmtpState_challenge
                        self._failresponse = self.esmtpAUTHServerError
                        self.sendLine(b'AUTH ' + auth)
                    return
        if self.requireAuthentication:
            self.esmtpAUTHRequired()
        else:
            self.smtpState_from(code, resp)
    def _esmtpState_plainAuth(self, code, resp):
        self._okresponse = self.smtpState_from
        self._failresponse = self.esmtpAUTHDeclined
        self._expected = [235]
        challenge = encode_base64(self._authinfo.challengeResponse(self.secret, 2), eol="")
        self.sendLine('AUTH PLAIN ' + challenge)
    def esmtpState_challenge(self, code, resp):
        self._authResponse(self._authinfo, resp)
    def _authResponse(self, auth, challenge):
        self._failresponse = self.esmtpAUTHDeclined
        try:
            challenge = base64.decodestring(challenge)
        except binascii.Error:
            self.sendLine('*')
            self._okresponse = self.esmtpAUTHMalformedChallenge
            self._failresponse = self.esmtpAUTHMalformedChallenge
        else:
            resp = auth.challengeResponse(self.secret, challenge)
            self._expected = [235, 334]
            self._okresponse = self.smtpState_maybeAuthenticated
            self.sendLine(encode_base64(resp, eol=""))
    def smtpState_maybeAuthenticated(self, code, resp):
        if code == 235:
            del self._authinfo
            self.smtpState_from(code, resp)
        else:
            self._authResponse(self._authinfo, resp)

class ESMTP(SMTP):
    ctx = None
    canStartTLS = False
    startedTLS = False
    authenticated = False
    def __init__(self, chal=None, contextFactory=None):
        SMTP.__init__(self)
        self.challengers = chal or {}
        self.authenticated = False
        self.ctx = contextFactory
    def connectionMade(self):
        SMTP.connectionMade(self)
        self.canStartTLS = ITLSTransport.providedBy(self.transport)
        self.canStartTLS = self.canStartTLS and (self.ctx is not None)
    def greeting(self):
        return SMTP.greeting(self) + ' ESMTP'
    def extensions(self):
        ext = {'AUTH': self.challengers.keys()}
        if self.canStartTLS and not self.startedTLS:
            ext['STARTTLS'] = None
        return ext
    def lookupMethod(self, command):
        m = SMTP.lookupMethod(self, command)
        if m is None:
            m = getattr(self, 'ext_' + command.upper(), None)
        return m
    def listExtensions(self):
        r = []
        for (c, v) in self.extensions().iteritems():
            if v is not None:
                if v:
                    r.append('%s %s' % (c, ' '.join(v)))
            else:
                r.append(c)
        return '\n'.join(r)
    def do_EHLO(self, rest):
        peer = self.transport.getPeer().host
        self._helo = (rest, peer)
        self._from = None
        self._to = []
        self.sendCode(250, '%s Hello %s, nice to meet you\n%s' % (self.host, peer, self.listExtensions()))
    def ext_STARTTLS(self, rest):
        if self.startedTLS:
            self.sendCode(503, 'TLS already negotiated')
        elif self.ctx and self.canStartTLS:
            self.sendCode(220, 'Begin TLS negotiation now')
            self.transport.startTLS(self.ctx)
            self.startedTLS = True
        else:
            self.sendCode(454, 'TLS not available')
    def ext_AUTH(self, rest):
        if self.authenticated:
            self.sendCode(503, 'Already authenticated')
            return
        parts = rest.split(None, 1)
        chal = self.challengers.get(parts[0].upper(), lambda: None)()
        if not chal:
            self.sendCode(504, 'Unrecognized authentication type')
            return
        self.mode = AUTH
        self.challenger = chal
        if len(parts) > 1:
            chal.getChallenge()
            rest = parts[1]
        else:
            rest = None
        self.state_AUTH(rest)
    def _cbAuthenticated(self, loginInfo):
        result = SMTP._cbAnonymousAuthentication(self, loginInfo)
        self.authenticated = True
        return result
    def _ebAuthenticated(self, reason):
        self.challenge = None
        if reason.check(cred.error.UnauthorizedLogin):
            self.sendCode(535, 'Authentication failed')
        else:
            log.err(reason, "SMTP authentication failure")
            self.sendCode(451, 'Requested action aborted: local error in processing')
    def state_AUTH(self, response):
        if self.portal is None:
            self.sendCode(454, 'Temporary authentication failure')
            self.mode = COMMAND
            return
        if response is None:
            challenge = self.challenger.getChallenge()
            encoded = challenge.encode('base64')
            self.sendCode(334, encoded)
            return
        if response == '*':
            self.sendCode(501, 'Authentication aborted')
            self.challenger = None
            self.mode = COMMAND
            return
        try:
            uncoded = response.decode('base64')
        except binascii.Error:
            self.sendCode(501, 'Syntax error in parameters or arguments')
            self.challenger = None
            self.mode = COMMAND
            return
        self.challenger.setResponse(uncoded)
        if self.challenger.moreChallenges():
            challenge = self.challenger.getChallenge()
            coded = challenge.encode('base64')[:-1]
            self.sendCode(334, coded)
            return
        self.mode = COMMAND
        result = self.portal.login(self.challenger, None, IMessageDeliveryFactory, IMessageDelivery)
        result.addCallback(self._cbAuthenticated)
        result.addCallback(lambda ign: self.sendCode(235, 'Authentication successful.'))
        result.addErrback(self._ebAuthenticated)

class SenderMixin:
    done = 0
    def getMailFrom(self):
        if not self.done:
            self.done = 1
            return str(self.factory.fromEmail)
        return None
    def getMailTo(self):
        return self.factory.toEmail
    def getMailData(self):
        return self.factory.file
    def sendError(self, exc):
        SMTPClient.sendError(self, exc)
        if (self.factory.retries >= 0 or
            (not exc.retry and not (exc.code >= 400 and exc.code < 500))):
            self.factory.sendFinished = True
            self.factory.result.errback(exc)
    def sentMail(self, code, resp, numOk, addresses, log):
        self.factory.sendFinished = True
        if code not in SUCCESS:
            errlog = []
            for addr, acode, aresp in addresses:
                if acode not in SUCCESS:
                    errlog.append("%s: %03d %s" % (addr, acode, aresp))
            errlog.append(log.str())
            exc = SMTPDeliveryError(code, resp, '\n'.join(errlog), addresses)
            self.factory.result.errback(exc)
        else:
            self.factory.result.callback((numOk, addresses))

class SMTPSender(SenderMixin, SMTPClient):
    pass

class SMTPSenderFactory(protocol.ClientFactory):
    domain = DNSNAME
    protocol = SMTPSender
    def __init__(self, fromEmail, toEmail, file, deferred, retries=5, timeout=None):
        assert isinstance(retries, (int, long))
        if isinstance(toEmail, types.StringTypes):
            toEmail = [toEmail]
        self.fromEmail = Address(fromEmail)
        self.nEmails = len(toEmail)
        self.toEmail = toEmail
        self.file = file
        self.result = deferred
        self.result.addBoth(self._removeDeferred)
        self.sendFinished = False
        self.currentProtocol = None
        self.retries = -retries
        self.timeout = timeout
    def _removeDeferred(self, result):
        del self.result
        return result
    def clientConnectionFailed(self, connector, err):
        self._processConnectionError(connector, err)
    def clientConnectionLost(self, connector, err):
        self._processConnectionError(connector, err)
    def _processConnectionError(self, connector, err):
        self.currentProtocol = None
        if (self.retries < 0) and (not self.sendFinished):
            log.msg("SMTP Client retrying server. Retry: %s" % -self.retries)
            self.file.seek(0, 0)
            connector.connect()
            self.retries += 1
        elif not self.sendFinished:
            if err.check(error.ConnectionDone):
                err.value = SMTPConnectError(-1, "Unable to connect to server.")
            self.result.errback(err.value)
    def buildProtocol(self, addr):
        p = self.protocol(self.domain, self.nEmails*2+2)
        p.factory = self
        p.timeout = self.timeout
        self.currentProtocol = p
        self.result.addBoth(self._removeProtocol)
        return p
    def _removeProtocol(self, result):
        if self.currentProtocol:
            self.currentProtocol = None
        return result

from twisted.mail.imap4 import IClientAuthentication
from twisted.mail.imap4 import CramMD5ClientAuthenticator, LOGINAuthenticator
from twisted.mail.imap4 import LOGINCredentials as _lcredentials

class LOGINCredentials(_lcredentials):
    def __init__(self):
        _lcredentials.__init__(self)
        self.challenges = ['Password:', 'Username:']

class PLAINAuthenticator:
    implements(IClientAuthentication)
    def __init__(self, user):
        self.user = user
    def getName(self):
        return "PLAIN"
    def challengeResponse(self, secret, chal=1):
        if chal == 1:
            return "%s\0%s\0%s" % (self.user, self.user, secret)
        return "%s\0%s" % (self.user, secret)

class ESMTPSender(SenderMixin, ESMTPClient):
    requireAuthentication = True
    requireTransportSecurity = True
    def __init__(self, username, secret, contextFactory=None, *args, **kw):
        self.heloFallback = 0
        self.username = username
        if contextFactory is None:
            contextFactory = self._getContextFactory()
        ESMTPClient.__init__(self, secret, contextFactory, *args, **kw)
        self._registerAuthenticators()
    def _registerAuthenticators(self):
        self.registerAuthenticator(CramMD5ClientAuthenticator(self.username))
        self.registerAuthenticator(LOGINAuthenticator(self.username))
        self.registerAuthenticator(PLAINAuthenticator(self.username))
    def _getContextFactory(self):
        if self.context is not None:
            return self.context
        try:
            from twisted.internet import ssl
        except ImportError:
            return None
        else:
            try:
                context = ssl.ClientContextFactory()
                context.method = ssl.SSL.TLSv1_METHOD
                return context
            except AttributeError:
                return None

class ESMTPSenderFactory(SMTPSenderFactory):
    protocol = ESMTPSender
    def __init__(self, username, password, fromEmail, toEmail, file,
                 deferred, retries=5, timeout=None,
                 contextFactory=None, heloFallback=False,
                 requireAuthentication=True,
                 requireTransportSecurity=True):
        SMTPSenderFactory.__init__(self, fromEmail, toEmail, file, deferred, retries, timeout)
        self.username = username
        self.password = password
        self._contextFactory = contextFactory
        self._heloFallback = heloFallback
        self._requireAuthentication = requireAuthentication
        self._requireTransportSecurity = requireTransportSecurity
    def buildProtocol(self, addr):
        p = self.protocol(self.username, self.password, self._contextFactory,
                          self.domain, self.nEmails*2+2)
        p.heloFallback = self._heloFallback
        p.requireAuthentication = self._requireAuthentication
        p.requireTransportSecurity = self._requireTransportSecurity
        p.factory = self
        p.timeout = self.timeout
        self.currentProtocol = p
        self.result.addBoth(self._removeProtocol)
        return p

def sendmail(smtphost, from_addr, to_addrs, msg, senderDomainName=None, port=25,
             reactor=reactor, username=None, password=None,
             requireAuthentication=False, requireTransportSecurity=False):
    if not hasattr(msg, 'read'):
        msg = StringIO(str(msg))
    def cancel(d):
        factory.sendFinished = True
        if factory.currentProtocol:
            factory.currentProtocol.transport.abortConnection()
        else:
            connector.disconnect()
    d = defer.Deferred(cancel)
    factory = ESMTPSenderFactory(username, password, from_addr, to_addrs, msg,
        d, heloFallback=True, requireAuthentication=requireAuthentication,
        requireTransportSecurity=requireTransportSecurity)
    if senderDomainName is not None:
        factory.domain = senderDomainName
    connector = reactor.connectTCP(smtphost, port, factory)
    return d

import codecs
def xtext_encode(s, errors=None):
    r = []
    for ch in s:
        o = ord(ch)
        if ch == '+' or ch == '=' or o < 33 or o > 126:
            r.append('+%02X' % o)
        else:
            r.append(chr(o))
    return (''.join(r), len(s))
def xtext_decode(s, errors=None):
    r = []
    i = 0
    while i < len(s):
        if s[i] == '+':
            try:
                r.append(chr(int(s[i + 1:i + 3], 16)))
            except ValueError:
                r.append(s[i:i + 3])
            i += 3
        else:
            r.append(s[i])
            i += 1
    return (''.join(r), len(s))
class xtextStreamReader(codecs.StreamReader):
    def decode(self, s, errors='strict'):
        return xtext_decode(s)
class xtextStreamWriter(codecs.StreamWriter):
    def decode(self, s, errors='strict'):
        return xtext_encode(s)
def xtext_codec(name):
    if name == 'xtext':
        return (xtext_encode, xtext_decode, xtextStreamReader, xtextStreamWriter)
codecs.register(xtext_codec)