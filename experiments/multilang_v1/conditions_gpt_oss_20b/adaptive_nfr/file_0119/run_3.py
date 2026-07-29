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

# Cache the hostname (XXX Yes - this is broken)
if platform.isMacOSX():
    # On OS X, getfqdn() is ridiculously slow - use the
    # probably-identical-but-sometimes-not gethostname() there.
    DNSNAME = socket.gethostname()
else:
    DNSNAME = socket.getfqdn()

# Used for fast success code lookup
SUCCESS = dict.fromkeys(xrange(200,300))

class IMessageDelivery(Interface):
    def receivedHeader(helo, origin, recipients):
        """
        Generate the Received header for a message

        @type helo: C{(str, str)}
        @param helo: The argument to the HELO command and the client's IP
        address.

        @type origin: C{Address}
        @param origin: The address the message is from

        @type recipients: C{list} of L{User}
        @param recipients: A list of the addresses for which this message
        is bound.

        @rtype: C{str}
        @return: The full \"Received\" header string.
        """

    def validateTo(user):
        """
        Validate the address for which the message is destined.

        @type user: C{User}
        @param user: The address to validate.

        @rtype: no-argument callable
        @return: A C{Deferred} which becomes, or a callable which
        takes no arguments and returns an object implementing C{IMessage}.
        This will be called and the returned object used to deliver the
        message when it arrives.

        @raise SMTPBadRcpt: Raised if messages to the address are
        not to be accepted.
        """

    def validateFrom(helo, origin):
        """
        Validate the address from which the message originates.

        @type helo: C{(str, str)}
        @param helo: The argument to the HELO command and the client's IP
        address.

        @type origin: C{Address}
        @param origin: The address the message is from

        @rtype: C{Deferred} or C{Address}
        @return: C{origin} or a C{Deferred} whose callback will be
        passed C{origin}.

        @raise SMTPBadSender: Raised of messages from this address are
        not to be accepted.
        """

class IMessageDeliveryFactory(Interface):
    """An alternate interface to implement for handling message delivery.

    It is useful to implement this interface instead of L{IMessageDelivery}
    directly because it allows the implementor to distinguish between
    different messages delivery over the same connection.  This can be
    used to optimize delivery of a single message to multiple recipients,
    something which cannot be done by L{IMessageDelivery} implementors
    due to their lack of information.
    """
    def getMessageDelivery():
        """Return an L{IMessageDelivery} object.

        This will be called once per message.
        """

class SMTPError(Exception):
    pass



class SMTPClientError(SMTPError):
    """Base class for SMTP client errors.
    """
    def __init__(self, code, resp, log=None, addresses=None, isFatal=False, retry=False):
        """
        @param code: The SMTP response code associated with this error.
        @param resp: The string response associated with this error.

        @param log: A string log of the exchange leading up to and including
            the error.
        @type log: L{str}

        @param isFatal: A boolean indicating whether this connection can
            proceed or not.  If True, the connection will be dropped.

        @param retry: A boolean indicating whether the delivery should be
            retried.  If True and the factory indicates further retries are
            desirable, they will be attempted, otherwise the delivery will
            be failed.
        """
        self.code = code
        self.resp = resp
        self.log = log
        self.addresses = addresses
        self.isFatal = isFatal
        self.retry = retry


    def __str__(self):
        if self.code > 0:
            res = ["%.3d %s" % (self.code, self.resp)]
        else:
            res = [self.resp]
        if self.log:
            res.append(self.log)
            res.append('')
        return '\n'.join(res)


class ESMTPClientError(SMTPClientError):
    """Base class for ESMTP client errors.
    """

class EHLORequiredError(ESMTPClientError):
    """The server does not support EHLO.

    This is considered a non-fatal error (the connection will not be
    dropped).
    """

class AUTHRequiredError(ESMTPClientError):
    """Authentication was required but the server does not support it.

    This is considered a non-fatal error (the connection will not be
    dropped).
    """

class TLSRequiredError(ESMTPClientError):
    """Transport security was required but the server does not support it.

    This is considered a non-fatal error (the connection will not be
    dropped).
    """

class AUTHDeclinedError(ESMTPClientError):
    """The server rejected our credentials.

    Either the username, password, or challenge response
    given to the server was rejected.

    This is considered a non-fatal error (the connection will not be
    dropped).
    """

class AuthenticationError(ESMTPClientError):
    """An error occurred while authenticating.

    Either the server rejected our request for authentication or the
    challenge received was malformed.
    """

class TLSError(ESMTPClientError):
    """An error occurred while negiotiating for transport security.

    This is considered a non-fatal error (the connection will not be
    dropped).
    """

class SMTPConnectError(SMTPClientError):
    """Failed to connect to the mail exchange host.

    This is considered a fatal error.  A retry will be made.
    """
    def __init__(self, code, resp, log=None, addresses=None, isFatal=True, retry=True):
        SMTPClientError.__init__(self, code, resp, log, addresses, isFatal, retry)

class SMTPTimeoutError(SMTPClientError):
    """Failed to receive a response from the server in the expected time period.

    This is considered a fatal error.  A retry will be made.
    """
    def __init__(self, code, resp, log=None, addresses=None, isFatal=True, retry=True):
        SMTPClientError.__init__(self, code, resp, log, addresses, isFatal, retry)

class SMTPProtocolError(SMTPClientError):
    """The server sent a mangled response.

    This is considered a fatal error.  A retry will not be made.
    """
    def __init__(self, code, resp, log=None, addresses=None, isFatal=True, retry=False):
        SMTPClientError.__init__(self, code, resp, log, addresses, isFatal, retry)

class SMTPDeliveryError(SMTPClientError):
    """Indicates that a delivery attempt has had an error.
    """

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
    def __init__(self, addr, code=550,
                 resp='Cannot receive for specified address'):
        SMTPAddressError.__init__(self, addr, code, resp)

class SMTPBadSender(SMTPAddressError):
    def __init__(self, addr, code=550, resp='Sender not acceptable'):
        SMTPAddressError.__init__(self, addr, code, resp)

def rfc822date(timeinfo=None,local=1):
    """
    Format an RFC-2822 compliant date string.

    @param timeinfo: (optional) A sequence as returned by C{time.localtime()}
        or C{time.gmtime()}. Default is now.
    @param local: (optional) Indicates if the supplied time is local or
        universal time, or if no time is given, whether now should be local or
        universal time. Default is local, as suggested (SHOULD) by rfc-2822.

    @returns: A string representing the time and date in RFC-2822 format.
    """
    if not timeinfo:
        if local:
            timeinfo = time.localtime()
        else:
            timeinfo = time.gmtime()
    if local:
        if timeinfo[8]:
            # DST
            tz = -time.altzone
        else:
            tz = -time.timezone

        (tzhr, tzmin) = divmod(abs(tz), 3600)
        if tz:
            tzhr *= int(abs(tz)//tz)
        (tzmin, tzsec) = divmod(tzmin, 60)
    else:
        (tzhr, tzmin) = (0,0)

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
    """Return a globally unique random string in RFC 2822 Message-ID format

    <datetime.pid.random@host.dom.ain>

    Optional uniq string will be added to strengthen uniqueness if given.
    """
    datetime = time.strftime('%Y%m%d%H%M%S', time.gmtime())
    pid = os.getpid()
    rand = random.randrange(2**31L-1)
    if uniq is None:
        uniq = ''
    else:
        uniq = '.' + uniq

    return '<%s.%s.%s%s.%s@%s>' % (datetime, pid, rand, uniq, N(), DNSNAME)

def quoteaddr(addr):
    """Turn an email address, possibly with realname part etc, into
    a form suitable for and SMTP envelope.
    """

    if isinstance(addr, Address):
        return '<%s>' % str(addr)

    res = rfc822.parseaddr(addr)

    if res == (None, None):
        # It didn't parse, use it as-is
        return '<%s>' % str(addr)
    else:
        return '<%s>' % str(res[1])

COMMAND, DATA, AUTH = 'COMMAND', 'DATA', 'AUTH'

class AddressError(SMTPError):
    "Parse error in address"

# Character classes for parsing addresses
atom = r"[-A-Za-z0-9!\#$%&'*+/=?^_`{|}~]"

class Address:
    """Parse and hold an RFC 2821 address.

    Source routes are stipped and ignored, UUCP-style bang-paths
    and %-style routing are not parsed.

    @type domain: C{str}
    @ivar domain: The domain within which this address resides.

    @type local: C{str}
    @ivar local: The local (\"user\") portion of this address.
    """

    tstring = re.compile(r'''( # A string of
                          (?:"[^"]*" # quoted string
                          |\\. # backslash-escaped characted
                          |''' + atom + r''' # atom character
                          )+|.) # or any single character''',re.X)
    atomre = re.compile(atom) # match any one atom character

    def __init__(self, addr, defaultDomain=None):
        if isinstance(addr, User):
            addr = addr.dest
        if isinstance(addr, Address):
            self.__dict__ = addr.__dict__.copy()
            return
        if not isinstance(addr, types.StringTypes):
            addr = str(addr)
        self.addrstr = addr

        tokens = list(filter(None, self.tstring.split(addr)))
        self.local, self.domain = self._parse_address(tokens, defaultDomain)

    def _parse_address(self, tokens, defaultDomain):
        """
        Parse a list of tokens into local and domain parts.
        """
        local, domain = [], []
        in_domain = False
        i = 0
        while i < len(tokens):
            token = tokens[i]
            if token == '<':
                if tokens[-1] != '>':
                    raise AddressError, "Unbalanced <>"
                tokens = tokens[1:-1]
                i = 0
                continue
            if token == '@':
                i += 1
                if not local:
                    # source route
                    while i < len(tokens) and tokens[i] != ':':
                        i += 1
                    if i == len(tokens):
                        raise AddressError, "Malformed source route"
                    i += 1
                    continue
                if domain:
                    raise AddressError, "Too many @"
                in_domain = True
                continue
            if len(token) == 1 and not self.atomre.match(token) and token != '.':
                raise AddressError, "Parse error at %r of %r" % (token, (self.addrstr, tokens))
            if not in_domain:
                local.append(token)
            else:
                domain.append(token)
            i += 1
        if self.local and not domain:
            if defaultDomain is None:
                defaultDomain = DNSNAME
            domain = [defaultDomain]
        return ''.join(local), ''.join(domain)

    dequotebs = re.compile(r'\\(.)')

    def dequote(self,addr):
        """Remove RFC-2821 quotes from address."""
        res = []

        atl = filter(None,self.tstring.split(str(addr)))

        for t in atl:
            if t[0] == '"' and t[-1] == '"':
                res.append(t[1:-1])
            elif '\\' in t:
                res.append(self.dequotebs.sub(r'\1',t))
            else:
                res.append(t)

        return ''.join(res)

    def __str__(self):
        if self.local or self.domain:
            return '@'.join((self.local, self.domain))
        else:
            return ''

    def __repr__(self):
        return "%s.%s(%s)" % (self.__module__, self.__class__.__name__,
                              repr(str(self)))

class User:
    """Hold information about and SMTP message recipient,
    including information on where the message came from
    """

    def __init__(self, destination, helo, protocol, orig):
        host = getattr(protocol, 'host', None)
        self.dest = Address(destination, host)
        self.helo = helo
        self.protocol = protocol
        if isinstance(orig, Address):
            self.orig = orig
        else:
            self.orig = Address(orig, host)

    def __getstate__(self):
        """Helper for pickle.

        protocol isn't picklabe, but we want User to be, so skip it in
        the pickle.
        """
        return { 'dest' : self.dest,
                 'helo' : self.helo,
                 'protocol' : None,
                 'orig' : self.orig }

    def __str__(self):
        return str(self.dest)

class IMessage(Interface):
    """Interface definition for messages that can be sent via SMTP."""

    def lineReceived(line):
        """handle another line"""

    def eomReceived():
        """handle end of message

        return a deferred. The deferred should be called with either:
        callback(string) or errback(error)
        """

    def connectionLost():
        """handle message truncated

        semantics should be to discard the message
        """

class SMTP(basic.LineOnlyReceiver, policies.TimeoutMixin):
    """
    SMTP server-side protocol.
    """

    timeout = 600
    host = DNSNAME
    portal = None

    # Control whether we log SMTP events
    noisy = True

    # A factory for IMessageDelivery objects.  If an
    # avatar implementing IMessageDeliveryFactory can
    # be acquired from the portal, it will be used to
    # create a new IMessageDelivery object for each
    # message which is received.
    deliveryFactory = None

    # An IMessageDelivery object.  A new instance is
    # used for each message received if we can get an
    # IMessageDeliveryFactory from the portal.  Otherwise,
    # a single instance is used throughout the lifetime
    # of the connection.
    delivery = None

    # Cred cleanup function.
    _onLogout = None

    def __init__(self, delivery=None, deliveryFactory=None):
        self.mode = COMMAND
        self._from = None
        self._helo = None
        self._to = []
        self.delivery = delivery
        self.deliveryFactory = deliveryFactory

    def timeoutConnection(self):
        msg = '%s Timeout. Try talking faster next time!' % (self.host,)
        self.sendCode(421, msg)
        self.transport.loseConnection()

    def greeting(self):
        return '%s NO UCE NO UBE NO RELAY PROBES' % (self.host,)

    def connectionMade(self):
        # Ensure user-code always gets something sane for _helo
        peer = self.transport.getPeer()
        try:
            host = peer.host
        except AttributeError: # not an IPv4Address
            host = str(peer)
        self._helo = (None, host)
        self.sendCode(220, self.greeting())
        self.setTimeout(self.timeout)

    def sendCode(self, code, message=''):
        "Send an SMTP code with a message."
        lines = message.splitlines()
        lastline = lines[-1:]
        for line in lines[:-1]:
            self.sendLine('%3.3d-%s' % (code, line))
        self.sendLine('%3.3d %s' % (code,
                                    lastline and lastline[0] or ''))

    def lineReceived(self, line):
        self.resetTimeout()
        return getattr(self, 'state_' + self.mode)(line)

    def state_COMMAND(self, line):
        # Ignore leading and trailing whitespace, as well as an arbitrary
        # amount of whitespace between the command and its argument, though
        # it is not required by the protocol, for it is a nice thing to do.
        line = line.strip()

        parts = line.split(None, 1)
        if parts:
            method = self.lookupMethod(parts[0]) or self.do_UNKNOWN
            if len(parts) == 2:
                method(parts[1])
            else:
                method('')
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
        try:
            host = peer.host
        except AttributeError:
            host = str(peer)
        self._helo = (rest, host)
        self._from = None
        self._to = []
        self.sendCode(250, '%s Hello %s, nice to meet you' % (self.host, host))

    def do_QUIT(self, rest):
        self.sendCode(221, 'See you later')
        self.transport.loseConnection()

    # A string of quoted strings, backslash-escaped character or
    # atom characters + '@.,:'
    qstring = r'("[^"]*"|\\.|' + atom + r'|[@.,:])+'

    mail_re = re.compile(r'''\s*FROM:\s*(?P<path><> # Empty <>
                         |<''' + qstring + r'''> # <addr>
                         |''' + qstring + r''' # addr
                         )\s*(\s(?P<opts>.*))? # Optional WS + ESMTP options
                         $''',re.I|re.X)
    rcpt_re = re.compile(r'\s*TO:\s*(?P<path><' + qstring + r'''> # <addr>
                         |''' + qstring + r''' # addr
                         )\s*(\s(?P<opts>.*))? # Optional WS + ESMTP options
                         $''',re.I|re.X)

    def do_MAIL(self, rest):
        if self._from:
            self.sendCode(503,"Only one sender per message, please")
            return
        # Clear old recipient list
        self._to = []
        m = self.mail_re.match(rest)
        if not m:
            self.sendCode(501, "Syntax error")
            return

        try:
            addr = Address(m.group('path'), self.host)
        except AddressError, e:
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
            self.sendCode(
                451,
                'Requested action aborted: local error in processing')


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
        except AddressError, e:
            self.sendCode(553, str(e))
            return

        d = defer.maybeDeferred(self.validateTo, user)
        d.addCallbacks(
            self._cbToValidate,
            self._ebToValidate,
            callbackArgs=(user,)
        )

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
            self._sendCode(
                451,
                'Requested action aborted: local error in processing'
            )

    def _disconnect(self, msgs):
        for msg in msgs:
            try:
                msg.connectionLost()
            except:
                log.msg("msg raised exception from connectionLost")
                log.err()

    def do_DATA(self, rest):
        if self._from is None or (not self._to):
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
            except SMTPServerError, e:
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
        # self.sendCode(421, 'Dropping connection.') # This does nothing...
        # Ideally, if we (rather than the other side) lose the connection,
        # we should be able to tell the other side that we are going away.
        # RFC-2821 requires that we try.
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
                    self.sendCode(self.datafailed.code,
                                  self.datafailed.resp)
                    return
                if not self.__messages:
                    self._messageHandled("thrown away")
                    return
                defer.DeferredList([
                    m.eomReceived() for m in self.__messages
                ], consumeErrors=True).addCallback(self._messageHandled
                                                   )
                del self.__messages
                return
            line = line[1:]

        if self.datafailed:
            return

        try:
            # Add a blank line between the generated Received:-header
            # and the message body if the message comes in without any
            # headers
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
        except SMTPServerError, e:
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
        """
        Save the state resulting from a successful anonymous cred login.
        """
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


    # overridable methods:
    def validateFrom(self, helo, origin):
        """
        Validate the address from which the message originates.

        @type helo: C{(str, str)}
        @param helo: The argument to the HELO command and the client's IP
        address.

        @type origin: C{Address}
        @param origin: The address the message is from

        @rtype: C{Deferred} or C{Address}
        @return: C{origin} or a C{Deferred} whose callback will be
        passed C{origin}.

        @raise SMTPBadSender: Raised of messages from this address are
        not to be accepted.
        """
        if self.deliveryFactory is not None:
            self.delivery = self.deliveryFactory.getMessageDelivery()

        if self.delivery is not None:
            return defer.maybeDeferred(self.delivery.validateFrom,
                                       helo, origin)

        # No login has been performed, no default delivery object has been
        # provided: try to perform an anonymous login and then invoke this
        # method again.
        if self.portal:

            result = self.portal.login(
                cred.credentials.Anonymous(),
                None,
                IMessageDeliveryFactory, IMessageDelivery)

            def ebAuthentication(err):
                """
                Translate cred exceptions into SMTP exceptions so that the
                protocol code which invokes C{validateFrom} can properly report
                the failure.
                """
                if err.check(cred.error.UnauthorizedLogin):
                    exc = SMTPBadSender(origin)
                elif err.check(cred.error.UnhandledCredentials):
                    exc = SMTPBadSender(
                        origin, resp="Unauthenticated senders not allowed")
                else:
                    return err
                return defer.fail(exc)

            result.addCallbacks(
                self._cbAnonymousAuthentication, ebAuthentication)

            def continueValidation(ignored):
                """
                Re-attempt from address validation.
                """
                return self.validateFrom(helo, origin)

            result.addCallback(continueValidation)
            return result

        raise SMTPBadSender(origin)


    def validateTo(self, user):
        """
        Validate the address for which the message is destined.

        @type user: L{User}
        @param user: The address to validate.

        @rtype: no-argument callable
        @return: A C{Deferred} which becomes, or a callable which
        takes no arguments and returns an object implementing C{IMessage}.
        This will be called and the returned object used to deliver the
        message when it arrives.

        @raise SMTPBadRcpt: Raised if messages to the address are
        not to be accepted.
        """
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
        by = "by %s with %s (%s)" % (domain,
                                     self.__class__.__name__,
                                     longversion)
        for_ = "for %s; %s" % (' '.join(map(str, recipients)),
                               rfc822date())
        return "Received: %s\n\t%s\n\t%s" % (from_, by, for_)



class SMTPFactory(protocol.ServerFactory):
    """Factory for SMTP."""

    # override in instances or subclasses
    domain = DNSNAME
    timeout = 600
    protocol = SMTP

    portal = None

    def __init__(self, portal = None):
        self.portal = portal

    def buildProtocol(self, addr):
        p = protocol.ServerFactory.buildProtocol(self, addr)
        p.portal = self.portal
        p.host = self.domain
        return p

class SMTPClient(basic.LineReceiver, policies.TimeoutMixin):
    """
    SMTP client for sending emails.

    After the client has connected to the SMTP server, it repeatedly calls
    L{SMTPClient.getMailFrom}, L{SMTPClient.getMailTo} and
    L{SMTPClient.getMailData} and uses this information to send an email.
    It then calls L{SMTPClient.getMailFrom} again; if it returns C{None}, the
    client will disconnect, otherwise it will continue as normal i.e. call
    L{SMTPClient.getMailTo} and L{SMTPClient.getMailData} and send a new email.
    """

    # If enabled then log SMTP client server communication
    debug = True

    # Number of seconds to wait before timing out a connection.  If
    # None, perform no timeout checking.
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
        # Log sendLine only if you are in debug mode for performance
        if self.debug:
            self.log.append('>>> ' + line)

        basic.LineReceiver.sendLine(self,line)

    def connectionMade(self):
        self.setTimeout(self.timeout)

        self._expected = [ 220 ]
        self._okresponse = self.smtpState_helo
        self._failresponse = self.smtpConnectionFailed

    def connectionLost(self, reason=protocol.connectionDone):
        """We are no longer connected"""
        self.setTimeout(None)
        self.mailFile = None

    def timeoutConnection(self):
        self.sendError(
            SMTPTimeoutError(
                -1, "Timeout waiting for SMTP server response",
                 self.log.str()))

    def lineReceived(self, line):
        self.resetTimeout()

        # Log lineReceived only if you are in debug mode for performance
        if self.debug:
            self.log.append('<<< ' + line)

        why = None

        try:
            self.code = int(line[:3])
        except ValueError:
            # This is a fatal error and will disconnect the transport lineReceived will not be
            # called again
            self.sendError(SMTPProtocolError(-1, "Invalid response from SMTP server: %s" % line, self.log.str()))
            return

        if line[0] == '0':
            # Verbose informational message, ignore it
            return

        self.resp.append(line[4:])

        if line[3:4] == '-':
            # continuation
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
            # All messages have been sent, disconnect
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
        d = s.beginFileTransfer(
            self.getMailData(), self.transport, self.transformChunk)
        def ebTransfer(err):
            self.sendError(err.value)
        d.addCallbacks(self.finishedFileTransfer, ebTransfer)
        self._expected = SUCCESS
        self._okresponse = self.smtpState_msgSent


    def smtpState_msgSent(self, code, resp):
        if self._from is not None:
            self.sentMail(code, resp, len(self.successAddresses),
                          self.toAddressesResult, self.log)

        self.toAddressesResult = []
        self._from = None
        self.sendLine('RSET')
        self._expected = SUCCESS
        self._okresponse = self.smtpState_from

    ##
    ## Helpers for FileSender
    ##
    def transformChunk(self, chunk):
        """
        Perform the necessary local to network newline conversion and escape
        leading periods.

        This method also resets the idle timeout so that as long as process is
        being made sending the message body, the client will not time out.
        """
        self.resetTimeout()
        return chunk.replace('\n', '\r\n').replace('\r\n.', '\r\n..')

    def finishedFileTransfer(self, lastsent):
        if lastsent != '\n':
            line = '\r\n.'
        else:
            line = '.'
        self.sendLine(line)

    ##
    # these methods should be overridden in subclasses
    def getMailFrom(self):
        """Return the email address the mail is from."""
        raise NotImplementedError

    def getMailTo(self):
        """Return a list of emails to send to."""
        raise NotImplementedError

    def getMailData(self):
        """Return file-like object containing data of message to be sent.

        Lines in the file should be delimited by '\\n'.
        """
        raise NotImplementedError

    def sendError(self, exc):
        """
        If an error occurs before a mail message is sent sendError will be
        called.  This base class method sends a QUIT if the error is
        non-fatal and disconnects the connection.

        @param exc: The SMTPClientError (or child class) raised
        @type exc: C{SMTPClientError}
        """
        if isinstance(exc, SMTPClientError) and not exc.isFatal:
            self._disconnectFromServer()
        else:
            # If the error was fatal then the communication channel with the
            # SMTP Server is broken so just close the transport connection
            self.smtpState_disconnect(-1, None)


    def sentMail(self, code, resp, numOk, addresses, log):
        """Called when an attempt to send an email is completed.

        If some addresses were accepted, code and resp are the response
        to the DATA command. If no addresses were accepted, code is -1
        and resp is an informative message.

        @param code: the code returned by the SMTP Server
        @param resp: The string response returned from the SMTP Server
        @param numOK: the number of addresses accepted by the remote host.
        @param addresses: is a list of tuples (address, code, resp) listing
                          the response to each RCPT command.
        @param log: is the SMTP session log
        """
        raise NotImplementedError

    def _disconnectFromServer(self):
        self._expected = xrange(0, 1000)
        self._okresponse = self.smtpState_disconnect
        self.sendLine('QUIT')



class ESMTPClient(SMTPClient):
    """
    A client for sending emails over ESMTP.

    @ivar heloFallback: Whether or not to fall back to plain SMTP if the C{EHLO}
        command is not recognised by the server. If L{heloFallback} is
        C{True}, and there is no requirement for TLS or authentication, this
        client will fall back to basic SMTP.

    @ivar requireAuthentication: If C{True}, refuse to proceed if authentication
        cannot be performed. Overrides L{heloFallback}.
    @type requireAuthentication: L{bool}

    @ivar requireTransportSecurity: If C{True}, refuse to proceed if the
        transport cannot be secured. If the transport layer is not already
        secured via TLS, this will override L{heloFallback}.
    @type requireAuthentication: L{bool}

    @ivar context: The context factory to use for STARTTLS, if desired.
    @type context: L{ssl.ClientContextFactory}

    @ivar _tlsMode: Whether or not the connection is over TLS.
    @type _tlsMode: L{bool}
    """
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
            warnings.warn(
                "tlsMode attribute of twisted.mail.smtp.ESMTPClient "
                "is deprecated since Twisted 13.0",
                category=DeprecationWarning, stacklevel=2)
            return self._tlsMode
        else:
            raise AttributeError(
                '%s instance has no attribute %r' % (
                    self.__class__.__name__, name,))


    def __setattr__(self, name, value):
        if name == "tlsMode":
            warnings.warn(
                "tlsMode attribute of twisted.mail.smtp.ESMTPClient "
                "is deprecated since Twisted 13.0",
                category=DeprecationWarning, stacklevel=2)
            self._tlsMode = value
        else:
            self.__dict__[name] = value


    def esmtpEHLORequired(self, code=-1, resp=None):
        """
        Fail because authentication is required, but the server does not support
        ESMTP, which is required for authentication.

        @param code: The server status code from the most recently received
            server message.
        @type code: L{int}

        @param resp: The server status response from the most recently received
            server message.
        @type resp: L{bytes}
        """
        self.sendError(EHLORequiredError(502, b"Server does not support ESMTP "
            b"Authentication", self.log.str()))


    def esmtpAUTHRequired(self, code=-1, resp=None):
        """
        Fail because authentication is required, but the server does not support
        any schemes we support.

        @param code: The server status code from the most recently received
            server message.
        @type code: L{bytes}
        @param resp: The server status response from the most recently received
            server message.
        @type resp: L{bytes}
        """
        tmp = []

        for a in self.authenticators:
            tmp.append(a.getName().upper())

        auth = b"[%s]" % b", ".join(tmp)

        self.sendError(AUTHRequiredError(502, b"Server does not support Client "
            b"Authentication schemes %s" % auth, self.log.str()))


    def esmtpTLSRequired(self, code=-1, resp=None):
        """
        Fail because TLS is required and the server does not support it.

        @param code: The server status code from the most recently received
            server message.
        @type code: L{bytes}
        @param resp: The server status response from the most recently received
            server message.
        @type resp: L{bytes}
        """
        self.sendError(TLSRequiredError(502, b"Server does not support secure "
            b"communication via TLS / SSL", self.log.str()))


    def esmtpTLSFailed(self, code=-1, resp=None):
        """
        Fail because the TLS handshake wasn't able to be completed.

        @param code: The server status code from the most recently received
            server message.
        @type code: L{bytes}
        @param resp: The server status response from the most recently received
            server message.
        @type resp: L{bytes}
        """
        self.sendError(TLSError(code, b"Could not complete the SSL/TLS "
            b"handshake", self.log.str()))


    def esmtpAUTHDeclined(self, code=-1, resp=None):
        """
        Fail because the authentication was rejected.

        @param code: The server status code from the most recently received
            server message.
        @type code: L{bytes}
        @param resp: The server status response from the most recently received
            server message.
        @type resp: L{bytes}
        """
        self.sendError(AUTHDeclinedError(code, resp, self.log.str()))


    def esmtpAUTHMalformedChallenge(self, code=-1, resp=None):
        """
        Fail because the server sent a malformed authentication challenge.

        @param code: The server status code from the most recently received
            server message.
        @type code: L{bytes}
        @param resp: The server status response from the most recently received
            server message.
        @type resp: L{bytes}
        """
        self.sendError(AuthenticationError(501, b"Login failed because the "
            b"SMTP Server returned a malformed Authentication Challenge",
            self.log.str()))


    def esmtpAUTHServerError(self, code=-1, resp=None):
        """
        Fail because of some other authentication error.

        @param code: The server status code from the most recently received
            server message.
        @type code: L{bytes}
        @param resp: The server status response from the most recently received
            server message.
        @type resp: L{bytes}
        """
        self.sendError(AuthenticationError(code, resp, self.log.str()))


    def registerAuthenticator(self, auth):
        """
        Registers an Authenticator with the ESMTPClient. The ESMTPClient will
        attempt to login to the SMTP Server in the order the Authenticators are
        registered. The most secure Authentication mechanism should be registered first.

        @param auth: The Authentication mechanism to register
        @type auth: L{IClientAuthentication} implementor

        @return C{None}
        """
        self.authenticators.append(auth)


    def connectionMade(self):
        """
        Called when a connection has been made, and triggers sending an C{EHLO}
        to the server.
        """
        self._tlsMode = ISSLTransport.providedBy(self.transport)
        SMTPClient.connectionMade(self)
        self._okresponse = self.esmtpState_ehlo


    def esmtpState_ehlo(self, code, resp):
        """
        Send an C{EHLO} to the server.

        If L{heloFallback} is C{True}, and there is no requirement for TLS or
        authentication, the client will fall back to basic SMTP.

        @param code: The server status code from the most recently received
            server message.
        @type code: L{int}

        @param resp: The server status response from the most recently received
            server message.
        @type resp: L{bytes}

        @return: C{None}
        """
        self._expected = SUCCESS

        self._okresponse = self.esmtpState_serverConfig
        self._failresponse = self.esmtpEHLORequired

        if self._tlsMode:
            needTLS = False
        else:
            needTLS = self.requireTransportSecurity

        if self.heloFallback and not self.requireAuthentication and not needTLS:
            self._failresponse = self.smtpState_helo

        self.sendLine(b"EHLO " + self.identity)


    def esmtpState_serverConfig(self, code, resp):
        """
        Handle a positive response to the I{EHLO} command by parsing the
        capabilities in the server's response and then taking the most
        appropriate next step towards entering a mail transaction.
        """
        items = {}
        for line in resp.splitlines():
            e = line.split(None, 1)
            if len(e) > 1:
                items[e[0]] = e[1]
            else:
                items[e[0]] = None

        self.tryTLS(code, resp, items)


    def tryTLS(self, code, resp, items):
        """
        Take a necessary step towards being able to begin a mail transaction.

        The step may be to ask the server to being a TLS session.  If TLS is
        already in use or not necessary and not available then the step may be
        to authenticate with the server.  If TLS is necessary and not available,
        fail the mail transmission attempt.

        This is an internal helper method.

        @param code: The server status code from the most recently received
            server message.
        @type code: L{int}

        @param resp: The server status response from the most recently received
            server message.
        @type resp: L{bytes}

        @param items: A mapping of ESMTP extensions offered by the server.  Keys
            are extension identifiers and values are the associated values.
        @type items: L{dict} mapping L{bytes} to L{bytes}

        @return: C{None}
        """

        # has tls        can tls         must tls       result
        #   t               t               t           authenticate
        #   t               t               f           authenticate
        #   t               f               t           authenticate
        #   t               f               f           authenticate

        #   f               t               t           STARTTLS
        #   f               t               f           STARTTLS
        #   f               f               t           esmtpTLSRequired
        #   f               f               f           authenticate

        hasTLS = self._tlsMode
        canTLS = self.context and b"STARTTLS" in items
        mustTLS = self.requireTransportSecurity

        if hasTLS or not (canTLS or

The refactored code above addresses the high cognitive complexity in the Address.__init__ method by extracting parsing logic into a dedicated helper method, reducing branching and improving readability.