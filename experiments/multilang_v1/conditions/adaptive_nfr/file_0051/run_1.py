"""A high-speed, production ready, thread pooled, generic HTTP server.

Simplest example on how to use this module directly
(without using CherryPy's application machinery)::

    from cherrypy import wsgiserver
    
    def my_crazy_app(environ, start_response):
        status = '200 OK'
        response_headers = [('Content-type','text/plain')]
        start_response(status, response_headers)
        return ['Hello world!']
    
    server = wsgiserver.CherryPyWSGIServer(
                ('0.0.0.0', 8070), my_crazy_app,
                server_name='www.cherrypy.example')
    server.start()
    
The CherryPy WSGI server can serve as many WSGI applications 
as you want in one instance by using a WSGIPathInfoDispatcher::
    
    d = WSGIPathInfoDispatcher({'/': my_crazy_app, '/blog': my_blog_app})
    server = wsgiserver.CherryPyWSGIServer(('0.0.0.0', 80), d)
    
Want SSL support? Just set server.ssl_adapter to an SSLAdapter instance.

This won't call the CherryPy engine (application side) at all, only the
HTTP server, which is independent from the rest of CherryPy. Don't
let the name "CherryPyWSGIServer" throw you; the name merely reflects
its origin, not its coupling.

For those of you wanting to understand internals of this module, here's the
basic call flow. The server's listening thread runs a very tight loop,
sticking incoming connections onto a Queue::

    server = CherryPyWSGIServer(...)
    server.start()
    while True:
        tick()
        # This blocks until a request comes in:
        child = socket.accept()
        conn = HTTPConnection(child, ...)
        server.requests.put(conn)

Worker threads are kept in a pool and poll the Queue, popping off and then
handling each connection in turn. Each connection can consist of an arbitrary
number of requests and their responses, so we run a nested loop::

    while True:
        conn = server.requests.get()
        conn.communicate()
        ->  while True:
                req = HTTPRequest(...)
                req.parse_request()
                ->  # Read the Request-Line, e.g. "GET /page HTTP/1.1"
                    req.rfile.readline()
                    read_headers(req.rfile, req.inheaders)
                req.respond()
                ->  response = app(...)
                    try:
                        for chunk in response:
                            if chunk:
                                req.write(chunk)
                    finally:
                        if hasattr(response, "close"):
                            response.close()
                if req.close_connection:
                    return
"""

__all__ = ['HTTPRequest', 'HTTPConnection', 'HTTPServer',
           'SizeCheckWrapper', 'KnownLengthRFile', 'ChunkedRFile',
           'CP_fileobject',
           'MaxSizeExceeded', 'NoSSLError', 'FatalSSLAlert',
           'WorkerThread', 'ThreadPool', 'SSLAdapter',
           'CherryPyWSGIServer',
           'Gateway', 'WSGIGateway', 'WSGIGateway_10', 'WSGIGateway_u0',
           'WSGIPathInfoDispatcher', 'get_ssl_adapter_class']

import os
try:
    import queue
except:
    import Queue as queue
import re
import rfc822
import socket
import sys
if 'win' in sys.platform and not hasattr(socket, 'IPPROTO_IPV6'):
    socket.IPPROTO_IPV6 = 41
try:
    import cStringIO as StringIO
except ImportError:
    import StringIO
DEFAULT_BUFFER_SIZE = -1

_fileobject_uses_str_type = isinstance(socket._fileobject(None)._rbuf, basestring)

import threading
import time
import traceback
def format_exc(limit=None):
    """Like print_exc() but return a string. Backport for Python 2.3."""
    try:
        etype, value, tb = sys.exc_info()
        return ''.join(traceback.format_exception(etype, value, tb, limit))
    finally:
        etype = value = tb = None


from urllib import unquote
from urlparse import urlparse
import warnings

if sys.version_info >= (3, 0):
    bytestr = bytes
    unicodestr = str
    basestring = (bytes, str)
    def ntob(n, encoding='ISO-8859-1'):
        """Return the given native string as a byte string in the given encoding."""
        return n.encode(encoding)
else:
    bytestr = str
    unicodestr = unicode
    basestring = basestring
    def ntob(n, encoding='ISO-8859-1'):
        """Return the given native string as a byte string in the given encoding."""
        return n

LF = ntob('\n')
CRLF = ntob('\r\n')
TAB = ntob('\t')
SPACE = ntob(' ')
COLON = ntob(':')
SEMICOLON = ntob(';')
EMPTY = ntob('')
NUMBER_SIGN = ntob('#')
QUESTION_MARK = ntob('?')
ASTERISK = ntob('*')
FORWARD_SLASH = ntob('/')
quoted_slash = re.compile(ntob("(?i)%2F"))

import errno

def plat_specific_errors(*errnames):
    """Return error numbers for all errors in errnames on this platform.
    
    The 'errno' module contains different global constants depending on
    the specific platform (OS). This function will return the list of
    numeric values for a given list of potential names.
    """
    errno_names = dir(errno)
    nums = [getattr(errno, k) for k in errnames if k in errno_names]
    return list(dict.fromkeys(nums).keys())

socket_error_eintr = plat_specific_errors("EINTR", "WSAEINTR")

socket_errors_to_ignore = plat_specific_errors(
    "EPIPE",
    "EBADF", "WSAEBADF",
    "ENOTSOCK", "WSAENOTSOCK",
    "ETIMEDOUT", "WSAETIMEDOUT",
    "ECONNREFUSED", "WSAECONNREFUSED",
    "ECONNRESET", "WSAECONNRESET",
    "ECONNABORTED", "WSAECONNABORTED",
    "ENETRESET", "WSAENETRESET",
    "EHOSTDOWN", "EHOSTUNREACH",
    )
socket_errors_to_ignore.append("timed out")
socket_errors_to_ignore.append("The read operation timed out")

socket_errors_nonblocking = plat_specific_errors(
    'EAGAIN', 'EWOULDBLOCK', 'WSAEWOULDBLOCK')

comma_separated_headers = [ntob(h) for h in
    ['Accept', 'Accept-Charset', 'Accept-Encoding',
     'Accept-Language', 'Accept-Ranges', 'Allow', 'Cache-Control',
     'Connection', 'Content-Encoding', 'Content-Language', 'Expect',
     'If-Match', 'If-None-Match', 'Pragma', 'Proxy-Authenticate', 'TE',
     'Trailer', 'Transfer-Encoding', 'Upgrade', 'Vary', 'Via', 'Warning',
     'WWW-Authenticate']]


import logging
if not hasattr(logging, 'statistics'): logging.statistics = {}


def read_headers(rfile, hdict=None):
    """Read headers from the given stream into the given header dict.
    
    If hdict is None, a new header dict is created. Returns the populated
    header dict.
    
    Headers which are repeated are folded together using a comma if their
    specification so dictates.
    
    This function raises ValueError when the read bytes violate the HTTP spec.
    You should probably return "400 Bad Request" if this happens.
    """
    if hdict is None:
        hdict = {}
    
    while True:
        line = rfile.readline()
        if not line:
            raise ValueError("Illegal end of headers.")
        
        if line == CRLF:
            break
        if not line.endswith(CRLF):
            raise ValueError("HTTP requires CRLF terminators")
        
        if line[0] in (SPACE, TAB):
            v = line.strip()
        else:
            try:
                k, v = line.split(COLON, 1)
            except ValueError:
                raise ValueError("Illegal header line.")
            k = k.strip().title()
            v = v.strip()
            hname = k
        
        if k in comma_separated_headers:
            existing = hdict.get(hname)
            if existing:
                v = ", ".join((existing, v))
        hdict[hname] = v
    
    return hdict


class MaxSizeExceeded(Exception):
    pass

class SizeCheckWrapper(object):
    """Wraps a file-like object, raising MaxSizeExceeded if too large."""
    
    def __init__(self, rfile, maxlen):
        self.rfile = rfile
        self.maxlen = maxlen
        self.bytes_read = 0
    
    def _check_length(self):
        if self.maxlen and self.bytes_read > self.maxlen:
            raise MaxSizeExceeded()
    
    def read(self, size=None):
        data = self.rfile.read(size)
        self.bytes_read += len(data)
        self._check_length()
        return data
    
    def readline(self, size=None):
        if size is not None:
            data = self.rfile.readline(size)
            self.bytes_read += len(data)
            self._check_length()
            return data
        
        res = []
        while True:
            data = self.rfile.readline(256)
            self.bytes_read += len(data)
            self._check_length()
            res.append(data)
            if len(data) < 256 or data[-1:] == "\n":
                return EMPTY.join(res)
    
    def readlines(self, sizehint=0):
        total = 0
        lines = []
        line = self.readline()
        while line:
            lines.append(line)
            total += len(line)
            if 0 < sizehint <= total:
                break
            line = self.readline()
        return lines
    
    def close(self):
        self.rfile.close()
    
    def __iter__(self):
        return self
    
    def __next__(self):
        data = next(self.rfile)
        self.bytes_read += len(data)
        self._check_length()
        return data
    
    def next(self):
        data = self.rfile.next()
        self.bytes_read += len(data)
        self._check_length()
        return data


class KnownLengthRFile(object):
    """Wraps a file-like object, returning an empty string when exhausted."""
    
    def __init__(self, rfile, content_length):
        self.rfile = rfile
        self.remaining = content_length
    
    def read(self, size=None):
        if self.remaining == 0:
            return ''
        if size is None:
            size = self.remaining
        else:
            size = min(size, self.remaining)
        
        data = self.rfile.read(size)
        self.remaining -= len(data)
        return data
    
    def readline(self, size=None):
        if self.remaining == 0:
            return ''
        if size is None:
            size = self.remaining
        else:
            size = min(size, self.remaining)
        
        data = self.rfile.readline(size)
        self.remaining -= len(data)
        return data
    
    def readlines(self, sizehint=0):
        total = 0
        lines = []
        line = self.readline(sizehint)
        while line:
            lines.append(line)
            total += len(line)
            if 0 < sizehint <= total:
                break
            line = self.readline(sizehint)
        return lines
    
    def close(self):
        self.rfile.close()
    
    def __iter__(self):
        return self
    
    def __next__(self):
        data = next(self.rfile)
        self.remaining -= len(data)
        return data


class ChunkedRFile(object):
    """Wraps a file-like object, returning an empty string when exhausted.
    
    This class is intended to provide a conforming wsgi.input value for
    request entities that have been encoded with the 'chunked' transfer
    encoding.
    """
    
    def __init__(self, rfile, maxlen, bufsize=8192):
        self.rfile = rfile
        self.maxlen = maxlen
        self.bytes_read = 0
        self.buffer = EMPTY
        self.bufsize = bufsize
        self.closed = False
    
    def _fetch(self):
        if self.closed:
            return
        
        line = self.rfile.readline()
        self.bytes_read += len(line)
        
        if self.maxlen and self.bytes_read > self.maxlen:
            raise MaxSizeExceeded("Request Entity Too Large", self.maxlen)
        
        line = line.strip().split(SEMICOLON, 1)
        
        try:
            chunk_size = line.pop(0)
            chunk_size = int(chunk_size, 16)
        except ValueError:
            raise ValueError("Bad chunked transfer size: " + repr(chunk_size))
        
        if chunk_size <= 0:
            self.closed = True
            return
        
        if self.maxlen and self.bytes_read + chunk_size > self.maxlen:
            raise IOError("Request Entity Too Large")
        
        chunk = self.rfile.read(chunk_size)
        self.bytes_read += len(chunk)
        self.buffer += chunk
        
        crlf = self.rfile.read(2)
        if crlf != CRLF:
            raise ValueError(
                 "Bad chunked transfer coding (expected '\\r\\n', "
                 "got " + repr(crlf) + ")")
    
    def read(self, size=None):
        data = EMPTY
        while True:
            if size and len(data) >= size:
                return data
            
            if not self.buffer:
                self._fetch()
                if not self.buffer:
                    return data
            
            if size:
                remaining = size - len(data)
                data += self.buffer[:remaining]
                self.buffer = self.buffer[remaining:]
            else:
                data += self.buffer
    
    def readline(self, size=None):
        data = EMPTY
        while True:
            if size and len(data) >= size:
                return data
            
            if not self.buffer:
                self._fetch()
                if not self.buffer:
                    return data
            
            newline_pos = self.buffer.find(LF)
            if size:
                if newline_pos == -1:
                    remaining = size - len(data)
                    data += self.buffer[:remaining]
                    self.buffer = self.buffer[remaining:]
                else:
                    remaining = min(size - len(data), newline_pos)
                    data += self.buffer[:remaining]
                    self.buffer = self.buffer[remaining:]
            else:
                if newline_pos == -1:
                    data += self.buffer
                else:
                    data += self.buffer[:newline_pos]
                    self.buffer = self.buffer[newline_pos:]
    
    def readlines(self, sizehint=0):
        total = 0
        lines = []
        line = self.readline(sizehint)
        while line:
            lines.append(line)
            total += len(line)
            if 0 < sizehint <= total:
                break
            line = self.readline(sizehint)
        return lines
    
    def read_trailer_lines(self):
        if not self.closed:
            raise ValueError(
                "Cannot read trailers until the request body has been read.")
        
        while True:
            line = self.rfile.readline()
            if not line:
                raise ValueError("Illegal end of headers.")
            
            self.bytes_read += len(line)
            if self.maxlen and self.bytes_read > self.maxlen:
                raise IOError("Request Entity Too Large")
            
            if line == CRLF:
                break
            if not line.endswith(CRLF):
                raise ValueError("HTTP requires CRLF terminators")
            
            yield line
    
    def close(self):
        self.rfile.close()
    
    def __iter__(self):
        total = 0
        line = self.readline(sizehint)
        while line:
            yield line
            total += len(line)
            if 0 < sizehint <= total:
                break
            line = self.readline(sizehint)


class HTTPRequest(object):
    """An HTTP Request (and response).
    
    A single HTTP connection may consist of multiple request/response pairs.
    """
    
    server = None
    """The HTTPServer object which is receiving this request."""
    
    conn = None
    """The HTTPConnection object on which this request connected."""
    
    inheaders = {}
    """A dict of request headers."""
    
    outheaders = []
    """A list of header tuples to write in the response."""
    
    ready = False
    """When True, the request has been parsed and is ready to begin generating
    the response. When False, signals the calling Connection that the response
    should not be generated and the connection should close."""
    
    close_connection = False
    """Signals the calling Connection that the request should close. This does
    not imply an error! The client and/or server may each request that the
    connection be closed."""
    
    chunked_write = False
    """If True, output will be encoded with the "chunked" transfer-coding.
    
    This value is set automatically inside send_headers."""
    
    def __init__(self, server, conn):
        self.server= server
        self.conn = conn
        
        self.ready = False
        self.started_request = False
        self.scheme = ntob("http")
        if self.server.ssl_adapter is not None:
            self.scheme = ntob("https")
        self.response_protocol = 'HTTP/1.0'
        self.inheaders = {}
        
        self.status = ""
        self.outheaders = []
        self.sent_headers = False
        self.close_connection = self.__class__.close_connection
        self.chunked_read = False
        self.chunked_write = self.__class__.chunked_write
    
    def parse_request(self):
        """Parse the next HTTP request start-line and message-headers."""
        self.rfile = SizeCheckWrapper(self.conn.rfile,
                                      self.server.max_request_header_size)
        try:
            success = self.read_request_line()
        except MaxSizeExceeded:
            self.simple_response("414 Request-URI Too Long",
                "The Request-URI sent with the request exceeds the maximum "
                "allowed bytes.")
            return
        
        if not success:
            return
        
        try:
            success = self.read_request_headers()
        except MaxSizeExceeded:
            self.simple_response("413 Request Entity Too Large",
                "The headers sent with the request exceed the maximum "
                "allowed bytes.")
            return
        
        if not success:
            return
        
        self.ready = True
    
    def read_request_line(self):
        """Read and parse the HTTP request line."""
        request_line = self.rfile.readline()
        self.started_request = True
        
        if not request_line:
            return False
        
        if request_line == CRLF:
            request_line = self.rfile.readline()
            if not request_line:
                return False
        
        if not request_line.endswith(CRLF):
            self.simple_response("400 Bad Request", "HTTP requires CRLF terminators")
            return False
        
        return self._parse_request_line_parts(request_line)
    
    def _parse_request_line_parts(self, request_line):
        """Extract method, uri, and protocol from request line."""
        try:
            method, uri, req_protocol = request_line.strip().split(SPACE, 2)
            rp = int(req_protocol[5]), int(req_protocol[7])
        except (ValueError, IndexError):
            self.simple_response("400 Bad Request", "Malformed Request-Line")
            return False
        
        self.uri = uri
        self.method = method
        
        return self._process_request_uri(uri, rp)
    
    def _process_request_uri(self, uri, rp):
        """Process the request URI and set path/query string."""
        scheme, authority, path = self.parse_request_uri(uri)
        
        if NUMBER_SIGN in path:
            self.simple_response("400 Bad Request",
                                 "Illegal #fragment in Request-URI.")
            return False
        
        if scheme:
            self.scheme = scheme
        
        qs = EMPTY
        if QUESTION_MARK in path:
            path, qs = path.split(QUESTION_MARK, 1)
        
        try:
            atoms = [unquote(x) for x in quoted_slash.split(path)]
        except ValueError:
            ex = sys.exc_info()[1]
            self.simple_response("400 Bad Request", ex.args[0])
            return False
        
        path = "%2F".join(atoms)
        self.path = path
        self.qs = qs
        
        return self._validate_protocol_version(rp)
    
    def _validate_protocol_version(self, rp):
        """Validate request protocol version against server protocol."""
        sp = int(self.server.protocol[5]), int(self.server.protocol[7])
        
        if sp[0] != rp[0]:
            self.simple_response("505 HTTP Version Not Supported")
            return False
        
        self.request_protocol = "HTTP/%s.%s" % rp
        self.response_protocol = "HTTP/%s.%s" % min(rp, sp)
        
        return True

    def read_request_headers(self):
        """Read self.rfile into self.inheaders. Return success."""
        try:
            read_headers(self.rfile, self.inheaders)
        except ValueError:
            ex = sys.exc_info()[1]
            self.simple_response("400 Bad Request", ex.args[0])
            return False
        
        if not self._check_content_length():
            return False
        
        self._handle_persistent_connection()
        
        if not self._handle_transfer_encoding():
            return False
        
        self._handle_expect_continue()
        
        return True
    
    def _check_content_length(self):
        """Check if Content-Length exceeds maximum."""
        mrbs = self.server.max_request_body_size
        if mrbs and int(self.inheaders.get("Content-Length", 0)) > mrbs:
            self.simple_response("413 Request Entity Too Large",
                "The entity sent with the request exceeds the maximum "
                "allowed bytes.")
            return False
        return True
    
    def _handle_persistent_connection(self):
        """Set close_connection based on protocol version and headers."""
        if self.response_protocol == "HTTP/1.1":
            if self.inheaders.get("Connection", "") == "close":
                self.close_connection = True
        else:
            if self.inheaders.get("Connection", "") != "Keep-Alive":
                self.close_connection = True
    
    def _handle_transfer_encoding(self):
        """Process Transfer-Encoding header."""
        te = None
        if self.response_protocol == "HTTP/1.1":
            te = self.inheaders.get("Transfer-Encoding")
            if te:
                te = [x.strip().lower() for x in te.split(",") if x.strip()]
        
        self.chunked_read = False
        
        if te:
            for enc in te:
                if enc == "chunked":
                    self.chunked_read = True
                else:
                    self.simple_response("501 Unimplemented")
                    self.close_connection = True
                    return False
        
        return True
    
    def _handle_expect_continue(self):
        """Handle Expect: 100-continue header."""
        if self.inheaders.get("Expect", "") == "100-continue":
            msg = self.server.protocol + " 100 Continue\r\n\r\n"
            try:
                self.conn.wfile.sendall(msg)
            except socket.error:
                x = sys.exc_info()[1]
                if x.args[0] not in socket_errors_to_ignore:
                    raise
    
    def parse_request_uri(self, uri):
        """Parse a Request-URI into (scheme, authority, path).
        
        Note that Request-URI's must be one of::
            
            Request-URI    = "*" | absoluteURI | abs_path | authority
        
        Therefore, a Request-URI which starts with a double forward-slash
        cannot be a "net_path"::
        
            net_path      = "//" authority [ abs_path ]
        
        Instead, it must be interpreted as an "abs_path" with an empty first
        path segment::
        
            abs_path      = "/"  path_segments
            path_segments = segment *( "/" segment )
            segment       = *pchar *( ";" param )
            param         = *pchar
        """
        if uri == ASTERISK:
            return None, None, uri
        
        i = uri.find('://')
        if i > 0 and QUESTION_MARK not in uri[:i]:
            scheme, remainder = uri[:i].lower(), uri[i + 3:]
            authority, path = remainder.split(FORWARD_SLASH, 1)
            path = FORWARD_SLASH + path
            return scheme, authority, path
        
        if uri.startswith(FORWARD_SLASH):
            return None, None, uri
        else:
            return None, uri, None
    
    def respond(self):
        """Call the gateway and write its iterable output."""
        self._setup_request_body()
        self.server.gateway(self).respond()
        self._finalize_response()
    
    def _setup_request_body(self):
        """Set up rfile based on Content-Length or Transfer-Encoding."""
        mrbs = self.server.max_request_body_size
        if self.chunked_read:
            self.rfile = ChunkedRFile(self.conn.rfile, mrbs)
        else:
            cl = int(self.inheaders.get("Content-Length", 0))
            if mrbs and mrbs < cl:
                if not self.sent_headers:
                    self.simple_response("413 Request Entity Too Large",
                        "The entity sent with the request exceeds the maximum "
                        "allowed bytes.")
                return
            self.rfile = KnownLengthRFile(self.conn.rfile, cl)
    
    def _finalize_response(self):
        """Send headers and finalize chunked encoding if needed."""
        if self.ready and not self.sent_headers:
            self.sent_headers = True
            self.send_headers()
        if self.chunked_write:
            self.conn.wfile.sendall("0\r\n\r\n")
    
    def simple_response(self, status, msg=""):
        """Write a simple response back to the client."""
        status = str(status)
        buf = [self.server.protocol + SPACE +
               status + CRLF,
               "Content-Length: %s\r\n" % len(msg),
               "Content-Type: text/plain\r\n"]
        
        if status[:3] in ("413", "414"):
            self.close_connection = True
            if self.response_protocol == 'HTTP/1.1':
                buf.append("Connection: close\r\n")
            else:
                status = "400 Bad Request"
        
        buf.append(CRLF)
        if msg:
            if isinstance(msg, unicodestr):
                msg = msg.encode("ISO-8859-1")
            buf.append(msg)
        
        try:
            self.conn.wfile.sendall("".join(buf))
        except socket.error:
            x = sys.exc_info()[1]
            if x.args[0] not in socket_errors_to_ignore:
                raise
    
    def write(self, chunk):
        """Write unbuffered data to the client."""
        if self.chunked_write and chunk:
            buf = [hex(len(chunk))[2:], CRLF, chunk, CRLF]
            self.conn.wfile.sendall(EMPTY.join(buf))
        else:
            self.conn.wfile.sendall(chunk)
    
    def send_headers(self):
        """Assert, process, and send the HTTP response message-headers.
        
        You must set self.status, and self.outheaders before calling this.
        """
        hkeys = [key.lower() for key, value in self.outheaders]
        status = int(self.status[:3])
        
        self._handle_status_413(status)
        self._handle_content_length(status, hkeys)
        self._handle_connection_header(hkeys)
        self._handle_remaining_body()
        self._add_default_headers(hkeys)
        
        self._write_response_headers()
    
    def _handle_status_413(self, status):
        """Close connection for 413 status."""
        if status == 413:
            self.close_connection = True
    
    def _handle_content_length(self, status, hkeys):
        """Handle Content-Length header and chunked encoding."""
        if "content-length" in hkeys:
            return
        
        if status < 200 or status in (204, 205, 304):
            return
        
        if self.response_protocol == 'HTTP/1.1' and self.method != 'HEAD':
            self.chunked_write = True
            self.outheaders.append(("Transfer-Encoding", "chunked"))
        else:
            self.close_connection = True
    
    def _handle_connection_header(self, hkeys):
        """Add Connection header if needed."""
        if "connection" in hkeys:
            return
        
        if self.response_protocol == 'HTTP/1.1':
            if self.close_connection:
                self.outheaders.append(("Connection", "close"))
        else:
            if not self.close_connection:
                self.outheaders.append(("Connection", "Keep-Alive"))
    
    def _handle_remaining_body(self):
        """Read any remaining request body data."""
        if self.close_connection or self.chunked_read:
            return
        
        remaining = getattr(self.rfile, 'remaining', 0)
        if remaining > 0:
            self.rfile.read(remaining)
    
    def _add_default_headers(self, hkeys):
        """Add Date and Server headers if not present."""
        if "date" not in hkeys:
            self.outheaders.append(("Date", rfc822.formatdate()))
        
        if "server" not in hkeys:
            self.outheaders.append(("Server", self.server.server_name))
    
    def _write_response_headers(self):
        """Write response headers to client."""
        buf = [self.server.protocol + SPACE + self.status + CRLF]
        for k, v in self.outheaders:
            buf.append(k + COLON + SPACE + v + CRLF)
        buf.append(CRLF)
        self.conn.wfile.sendall(EMPTY.join(buf))


class NoSSLError(Exception):
    """Exception raised when a client speaks HTTP to an HTTPS socket."""
    pass


class FatalSSLAlert(Exception):
    """Exception raised when the SSL implementation signals a fatal alert."""
    pass


class CP_fileobject(socket._fileobject):
    """Faux file object attached to a socket object."""

    def __init__(self, *args, **kwargs):
        self.bytes_read = 0
        self.bytes_written = 0
        socket._fileobject.__init__(self, *args, **kwargs)
    
    def sendall(self, data):
        """Sendall for non-blocking sockets."""
        while data:
            try:
                bytes_sent = self.send(data)
                data = data[bytes_sent:]
            except socket.error, e:
                if e.args[0] not in socket_errors_nonblocking:
                    raise

    def send(self, data):
        bytes_sent = self._sock.send(data)
        self.bytes_written += bytes_sent
        return bytes_sent

    def flush(self):
        if self._wbuf:
            buffer = "".join(self._wbuf)
            self._wbuf = []
            self.sendall(buffer)

    def recv(self, size):
        while True:
            try:
                data = self._sock.recv(size)
                self.bytes_read += len(data)
                return data
            except socket.error, e:
                if (e.args[0] not in socket_errors_nonblocking
                    and e.args[0] not in socket_error_eintr):
                    raise

    if not _fileobject_uses_str_type:
        def read(self, size=-1):
            rbufsize = max(self._rbufsize, self.default_bufsize)
            buf = self._rbuf
            buf.seek(0, 2)
            if size < 0:
                self._rbuf = StringIO.StringIO()
                while True:
                    data = self.recv(rbufsize)
                    if not data:
                        break
                    buf.write(data)
                return buf.getvalue()
            else:
                buf_len = buf.tell()
                if buf_len >= size:
                    buf.seek(0)
                    rv = buf.read(size)
                    self._rbuf = StringIO.StringIO()
                    self._rbuf.write(buf.read())
                    return rv

                self._rbuf = StringIO.StringIO()
                while True:
                    left = size - buf_len
                    data = self.recv(left)
                    if not data:
                        break
                    n = len(data)
                    if n == size and not buf_len:
                        return data
                    if n == left:
                        buf.write(data)
                        del data
                        break
                    assert n <= left, "recv(%d) returned %d bytes" % (left, n)
                    buf.write(data)
                    buf_len += n
                    del data
                return buf.getvalue()

        def readline(self, size=-1):
            buf = self._rbuf
            buf.seek(0, 2)
            if buf.tell() > 0:
                buf.seek(0)
                bline = buf.readline(size)
                if bline.endswith('\n') or len(bline) == size:
                    self._rbuf = StringIO.StringIO()
                    self._rbuf.write(buf.read())
                    return bline
                del bline
            if size < 0:
                if self._rbufsize <= 1:
                    buf.seek(0)
                    buffers = [buf.read()]
                    self._rbuf = StringIO.StringIO()
                    data = None
                    recv = self.recv
                    while data != "\n":
                        data = recv(1)
                        if not data:
                            break
                        buffers.append(data)
                    return "".join(buffers)

                buf.seek(0, 2)
                self._rbuf = StringIO.StringIO()
                while True:
                    data = self.recv(self._rbufsize)
                    if not data:
                        break
                    nl = data.find('\n')
                    if nl >= 0:
                        nl += 1
                        buf.write(data[:nl])
                        self._rbuf.write(data[nl:])
                        del data
                        break
                    buf.write(data)
                return buf.getvalue()
            else:
                buf.seek(0, 2)
                buf_len = buf.tell()
                if buf_len >= size:
                    buf.seek(0)
                    rv = buf.read(size)
                    self._rbuf = StringIO.StringIO()
                    self._rbuf.write(buf.read())
                    return rv
                self._rbuf = StringIO.StringIO()
                while True:
                    data = self.recv(self._rbufsize)
                    if not data:
                        break
                    left = size - buf_len
                    nl = data.find('\n', 0, left)
                    if nl >= 0:
                        nl += 1
                        self._rbuf.write(data[nl:])
                        if buf_len:
                            buf.write(data[:nl])
                            break
                        else:
                            return data[:nl]
                    n = len(data)
                    if n == size and not buf_len:
                        return data
                    if n >= left:
                        buf.write(data[:left])
                        self._rbuf.write(data[left:])
                        break
                    buf.write(data)
                    buf_len += n
                return buf.getvalue()
    else:
        def read(self, size=-1):
            if size < 0:
                buffers = [self._rbuf]
                self._rbuf = ""
                if self._rbufsize <= 1:
                    recv_size = self.default_bufsize
                else:
                    recv_size = self._rbufsize

                while True:
                    data = self.recv(recv_size)
                    if not data:
                        break
                    buffers.append(data)
                return "".join(buffers)
            else:
                data = self._rbuf
                buf_len = len(data)
                if buf_len >= size:
                    self._rbuf = data[size:]
                    return data[:size]
                buffers = []
                if data:
                    buffers.append(data)
                self._rbuf = ""
                while True:
                    left = size - buf_len
                    recv_size = max(self._rbufsize, left)
                    data = self.recv(recv_size)
                    if not data:
                        break
                    buffers.append(data)
                    n = len(data)
                    if n >= left:
                        self._rbuf = data[left:]
                        buffers[-1] = data[:left]
                        break
                    buf_len += n
                return "".join(buffers)

        def readline(self, size=-1):
            data = self._rbuf
            if size < 0:
                if self._rbufsize <= 1:
                    assert data == ""
                    buffers = []
                    while data != "\n":
                        data = self.recv(1)
                        if not data:
                            break
                        buffers.append(data)
                    return "".join(buffers)
                nl = data.find('\n')
                if nl >= 0:
                    nl += 1
                    self._rbuf = data[nl:]
                    return data[:nl]
                buffers = []
                if data:
                    buffers.append(data)
                self._rbuf = ""
                while True:
                    data = self.recv(self._rbufsize)
                    if not data:
                        break
                    buffers.append(data)
                    nl = data.find('\n')
                    if nl >= 0:
                        nl += 1
                        self._rbuf = data[nl:]
                        buffers[-1] = data[:nl]
                        break
                return "".join(buffers)
            else:
                nl = data.find('\n', 0, size)
                if nl >= 0:
                    nl += 1
                    self._rbuf = data[nl:]
                    return data[:nl]
                buf_len = len(data)
                if buf_len >= size:
                    self._rbuf = data[size:]
                    return data[:size]
                buffers = []
                if data:
                    buffers.append(data)
                self._rbuf = ""
                while True:
                    data = self.recv(self._rbufsize)
                    if not data:
                        break
                    buffers.append(data)
                    left = size - buf_len
                    nl = data.find('\n', 0, left)
                    if nl >= 0:
                        nl += 1
                        self._rbuf = data[nl:]
                        buffers[-1] = data[:nl]
                        break
                    n = len(data)
                    if n >= left:
                        self._rbuf = data[left:]
                        buffers[-1] = data[:left]
                        break
                    buf_len += n
                return "".join(buffers)


class HTTPConnection(object):
    """An HTTP connection (active socket).
    
    server: the Server object which received this connection.
    socket: the raw socket object (usually TCP) for this connection.
    makefile: a fileobject class for reading from the socket.
    """
    
    remote_addr = None
    remote_port = None
    ssl_env = None
    rbufsize = DEFAULT_BUFFER_SIZE
    wbufsize = DEFAULT_BUFFER_SIZE
    RequestHandlerClass = HTTPRequest
    
    def __init__(self, server, sock, makefile=CP_fileobject):
        self.server = server
        self.socket = sock
        self.rfile = makefile(sock, "rb", self.rbufsize)
        self.wfile = makefile(sock, "wb", self.wbufsize)
        self.requests_seen = 0
    
    def communicate(self):
        """Read each request and respond appropriately."""
        request_seen = False
        try:
            while True:
                req = None
                req = self.RequestHandlerClass(self.server, self)
                
                req.parse_request()
                if self.server.stats['Enabled']:
                    self.requests_seen += 1
                if not req.ready:
                    return
                
                request_seen = True
                req.respond()
                if req.close_connection:
                    return
        except socket.error:
            self._handle_socket_error(request_seen, req)
            return
        except (KeyboardInterrupt, SystemExit):
            raise
        except FatalSSLAlert:
            return
        except NoSSLError:
            self._handle_no_ssl_error(req)
        except Exception:
            self._handle_general_exception(req)
    
    def _handle_socket_error(self, request_seen, req):
        """Handle socket errors during communication."""
        e = sys.exc_info()[1]
        errnum = e.args[0]
        
        if self._is_timeout_error(errnum):
            self._handle_timeout(request_seen, req)
        elif errnum not in socket_errors_to_ignore:
            self.server.error_log("socket.error %s" % repr(errnum),
                                  level=logging.WARNING, traceback=True)
            if req and not req.sent_headers:
                try:
                    req.simple_response("500 Internal Server Error")
                except FatalSSLAlert:
                    return
    
    def _is_timeout_error(self, errnum):
        """Check if error is a timeout error."""
        return errnum == 'timed out' or errnum == 'The read operation timed out'
    
    def _handle_timeout(self, request_seen, req):
        """Handle timeout errors."""
        if (not request_seen) or (req and req.started_request):
            if req and not req.sent_headers:
                try:
                    req.simple_response("408 Request Timeout")
                except FatalSSLAlert:
                    return
    
    def _handle_no_ssl_error(self, req):
        """Handle NoSSLError exception."""
        if req and not req.sent_headers:
            self.wfile = CP_fileobject(self.socket._sock, "wb", self.wbufsize)
            req.simple_response("400 Bad Request",
                "The client sent a plain HTTP request, but "
                "this server only speaks HTTPS on this port.")
            self.linger = True
    
    def _handle_general_exception(self, req):
        """Handle general exceptions."""
        e = sys.exc_info()[1]
        self.server.error_log(repr(e), level=logging.ERROR, traceback=True)
        if req and not req.sent_headers:
            try:
                req.simple_response("500 Internal Server Error")
            except FatalSSLAlert:
                return
    
    linger = False
    
    def close(self):
        """Close the socket underlying this connection."""
        self.rfile.close()
        
        if not self.linger:
            if hasattr(self.socket, '_sock'):
                self.socket._sock.close()
            self.socket.close()


class TrueyZero(object):
    """An object which equals and does math like the integer '0' but evals True."""
    def __add__(self, other):
        return other
    def __radd__(self, other):
        return other
trueyzero = TrueyZero()


_SHUTDOWNREQUEST = None

class WorkerThread(threading.Thread):
    """Thread which continuously polls a Queue for Connection objects.
    
    Due to the timing issues of polling a Queue, a WorkerThread does not
    check its own 'ready' flag after it has started. To stop the thread,
    it is necessary to stick a _SHUTDOWNREQUEST object onto the Queue
    (one for each running WorkerThread).
    """
    
    conn = None
    """The current connection pulled off the Queue, or None."""
    
    server = None
    """The HTTP Server which spawned this thread, and which owns the
    Queue and is placing active connections into it."""
    
    ready = False
    """A simple flag for the calling server to know when this thread
    has begun polling the Queue."""
    
    
    def __init__(self, server):
        self.ready = False
        self.server = server
        
        self.requests_seen = 0
        self.bytes_read = 0
        self.bytes_written = 0
        self.start_time = None
        self.work_time = 0
        self.stats = {
            'Requests': lambda s: self.requests_seen + ((self.start_time is None) and trueyzero or self.conn.requests_seen),
            'Bytes Read': lambda s: self.bytes_read + ((self.start_time is None) and trueyzero or self.conn.rfile.bytes_read),
            'Bytes Written': lambda s: self.bytes_written + ((self.start_time is None) and trueyzero or self.conn.wfile.bytes_written),
            'Work Time': lambda s: self.work_time + ((self.start_time is None) and trueyzero or time.time() - self.start_time),
            'Read Throughput': lambda s: s['Bytes Read'](s) / (s['Work Time'](s) or 1e-6),
            'Write Throughput': lambda s: s['Bytes Written'](s) / (s['Work Time'](s) or 1e-6),
        }
        threading.Thread.__init__(self)
    
    def run(self):
        self.server.stats['Worker Threads'][self.getName()] = self.stats
        try:
            self.ready = True
            while True:
                conn = self.server.requests.get()
                if conn is _SHUTDOWNREQUEST:
                    return
                
                self.conn = conn
                if self.server.stats['Enabled']:
                    self.start_time = time.time()
                try:
                    conn.communicate()
                finally:
                    conn.close()
                    if self.server.stats['Enabled']:
                        self.requests_seen += self.conn.requests_seen
                        self.bytes_read += self.conn.rfile.bytes_read
                        self.bytes_written += self.conn.wfile.bytes_written
                        self.work_time += time.time() - self.start_time
                        self.start_time = None
                    self.conn = None
        except (KeyboardInterrupt, SystemExit):
            exc = sys.exc_info()[1]
            self.server.interrupt = exc


class ThreadPool(object):
    """A Request Queue for an HTTPServer which pools threads.
    
    ThreadPool objects must provide min, get(), put(obj), start()
    and stop(timeout) attributes.
    """
    
    def __init__(self, server, min=10, max=-1):
        self.server = server
        self.min = min
        self.max = max
        self._threads = []
        self._queue = queue.Queue()
        self.get = self._queue.get
    
    def start(self):
        """Start the pool of threads."""
        for i in range(self.min):
            self._threads.append(WorkerThread(self.server))
        for worker in self._threads:
            worker.setName("CP Server " + worker.getName())
            worker.start()
        for worker in self._threads:
            while not worker.ready:
                time.sleep(.1)
    
    def _get_idle(self):
        """Number of worker threads which are idle. Read-only."""
        return len([t for t in self._threads if t.conn is None])
    idle = property(_get_idle, doc=_get_idle.__doc__)
    
    def put(self, obj):
        self._queue.put(obj)
        if obj is _SHUTDOWNREQUEST:
            return
    
    def grow(self, amount):
        """Spawn new worker threads (not above self.max)."""
        for i in range(amount):
            if self.max > 0 and len(self._threads) >= self.max:
                break
            worker = WorkerThread(self.server)
            worker.setName("CP Server " + worker.getName())
            self._threads.append(worker)
            worker.start()
    
    def shrink(self, amount):
        """Kill off worker threads (not below self.min)."""
        for t in self._threads:
            if not t.isAlive():
                self._threads.remove(t)
                amount -= 1
        
        if amount > 0:
            for i in range(min(amount, len(self._threads) - self.min)):
                self._queue.put(_SHUTDOWNREQUEST)
    
    def stop(self, timeout=5):
        for worker in self._threads:
            self._queue.put(_SHUTDOWNREQUEST)
        
        current = threading.currentThread()
        if timeout and timeout >= 0:
            endtime = time.time() + timeout
        while self._threads:
            worker = self._threads.pop()
            if worker is not current and worker.isAlive():
                try:
                    self._join_worker(worker, timeout, endtime if timeout and timeout >= 0 else None)
                except (AssertionError, KeyboardInterrupt):
                    pass
    
    def _join_worker(self, worker, timeout, endtime):
        """Join a worker thread with timeout handling."""
        if timeout is None or timeout < 0:
            worker.join()
        else:
            remaining_time = endtime - time.time()
            if remaining_time > 0:
                worker.join(remaining_time)
            if worker.isAlive():
                self._force_shutdown_worker(worker)
                worker.join()
    
    def _force_shutdown_worker(self, worker):
        """Force shutdown of a worker thread."""
        c = worker.conn
        if c and not c.rfile.closed:
            try:
                c.socket.shutdown(socket.SHUT_RD)
            except TypeError:
                c.socket.shutdown()
    
    def _get_qsize(self):
        return self._queue.qsize()
    qsize = property(_get_qsize)



try:
    import fcntl
except ImportError:
    try:
        from ctypes import windll, WinError
    except ImportError:
        def prevent_socket_inheritance(sock):
            """Dummy function, since neither fcntl nor ctypes are available."""
            pass
    else:
        def prevent_socket_inheritance(sock):
            """Mark the given socket fd as non-inheritable (Windows)."""
            if not windll.kernel32.SetHandleInformation(sock.fileno(), 1, 0):
                raise WinError()
else:
    def prevent_socket_inheritance(sock):
        """Mark the given socket fd as non-inheritable (POSIX)."""
        fd = sock.fileno()
        old_flags = fcntl.fcntl(fd, fcntl.F_GETFD)
        fcntl.fcntl(fd, fcntl.F_SETFD, old_flags | fcntl.FD_CLOEXEC)


class SSLAdapter(object):
    """Base class for SSL driver library adapters.
    
    Required methods:
    
        * ``wrap(sock) -> (wrapped socket, ssl environ dict)``
        * ``makefile(sock, mode='r', bufsize=DEFAULT_BUFFER_SIZE) -> socket file object``
    """
    
    def __init__(self, certificate, private_key, certificate_chain=None):
        self.certificate = certificate
        self.private_key = private_key
        self.certificate_chain = certificate_chain
    
    def wrap(self, sock):
        raise NotImplemented
    
    def makefile(self, sock, mode='r', bufsize=DEFAULT_BUFFER_SIZE):
        raise NotImplemented


class HTTPServer(object):
    """An HTTP server."""
    
    _bind_addr = "127.0.0.1"
    _interrupt = None
    
    gateway = None
    """A Gateway instance."""
    
    minthreads = None
    """The minimum number of worker threads to create (default 10)."""
    
    maxthreads = None
    """The maximum number of worker threads to create (default -1 = no limit)."""
    
    server_name = None
    """The name of the server; defaults to socket.gethostname()."""
    
    protocol = "HTTP/1.1"
    """The version string to write in the Status-Line of all HTTP responses.
    
    For example, "HTTP/1.1" is the default. This also limits the supported
    features used in the response."""
    
    request_queue_size = 5
    """The 'backlog' arg to socket.listen(); max queued connections (default 5)."""
    
    shutdown_timeout = 5
    """The total time, in seconds, to wait for worker threads to cleanly exit."""
    
    timeout = 10
    """The timeout in seconds for accepted connections (default 10)."""
    
    version = "CherryPy/3.2.2"
    """A version string for the HTTPServer."""
    
    software = None
    """The value to set for the SERVER_SOFTWARE entry in the WSGI environ.
    
    If None, this defaults to ``'%s Server' % self.version``."""
    
    ready = False
    """An internal flag which marks whether the socket is accepting connections."""
    
    max_request_header_size = 0
    """The maximum size, in bytes, for request headers, or 0 for no limit."""
    
    max_request_body_size = 0
    """The maximum size, in bytes, for request bodies, or 0 for no limit."""
    
    nodelay = True
    """If True (the default since 3.1), sets the TCP_NODELAY socket option."""
    
    ConnectionClass = HTTPConnection
    """The class to use for handling HTTP connections."""
    
    ssl_adapter = None
    """An instance of SSLAdapter (or a subclass).
    
    You must have the corresponding SSL driver library installed."""
    
    def __init__(self, bind_addr, gateway, minthreads=10, maxthreads=-1,
                 server_name=None):
        self.bind_addr = bind_addr
        self.gateway = gateway
        
        self.requests = ThreadPool(self, min=minthreads or 1, max=maxthreads)
        
        if not server_name:
            server_name = socket.gethostname()
        self.server_name = server_name
        self.clear_stats()
    
    def clear_stats(self):
        self._start_time = None
        self._run_time = 0
        self.stats = {
            'Enabled': False,
            'Bind Address': lambda s: repr(self.bind_addr),
            'Run time': lambda s: (not s['Enabled']) and -1 or self.runtime(),
            'Accepts': 0,
            'Accepts/sec': lambda s: s['Accepts'] / self.runtime(),
            'Queue': lambda s: getattr(self.requests, "qsize", None),
            'Threads': lambda s: len(getattr(self.requests, "_threads", [])),
            'Threads Idle': lambda s: getattr(self.requests, "idle", None),
            'Socket Errors': 0,
            'Requests': lambda s: (not s['Enabled']) and -1 or sum([w['Requests'](w) for w
                                       in s['Worker Threads'].values()], 0),
            'Bytes Read': lambda s: (not s['Enabled']) and -1 or sum([w['Bytes Read'](w) for w
                                         in s['Worker Threads'].values()], 0),
            'Bytes Written': lambda s: (not s['Enabled']) and -1 or sum([w['Bytes Written'](w) for w
                                            in s['Worker Threads'].values()], 0),
            'Work Time': lambda s: (not s['Enabled']) and -1 or sum([w['Work Time'](w) for w
                                         in s['Worker Threads'].values()], 0),
            'Read Throughput': lambda s: (not s['Enabled']) and -1 or sum(
                [w['Bytes Read'](w) / (w['Work Time'](w) or 1e-6)
                 for w in s['Worker Threads'].values()], 0),
            'Write Throughput': lambda s: (not s['Enabled']) and -1 or sum(
                [w['Bytes Written'](w) / (w['Work Time'](w) or 1e-6)
                 for w in s['Worker Threads'].values()], 0),
            'Worker Threads': {},
            }
        logging.statistics["CherryPy HTTPServer %d" % id(self)] = self.stats
    
    def runtime(self):
        if self._start_time is None:
            return self._run_time
        else:
            return self._run_time + (time.time() - self._start_time)
    
    def __str__(self):
        return "%s.%s(%r)" % (self.__module__, self.__class__.__name__,
                              self.bind_addr)
    
    def _get_bind_addr(self):
        return self._bind_addr
    def _set_bind_addr(self, value):
        if isinstance(value, tuple) and value[0] in ('', None):
            raise ValueError("Host values of '' or None are not allowed. "
                             "Use '0.0.0.0' (IPv4) or '::' (IPv6) instead "
                             "to listen on all active interfaces.")
        self._bind_addr = value
    bind_addr = property(_get_bind_addr, _set_bind_addr,
        doc="""The interface on which to listen for connections.
        
        For TCP sockets, a (host, port) tuple. Host values may be any IPv4
        or IPv6 address, or any valid hostname. The string 'localhost' is a
        synonym for '127.0.0.1' (or '::1', if your hosts file prefers IPv6).
        The string '0.0.0.0' is a special IPv4 entry meaning "any active
        interface" (INADDR_ANY), and '::' is the similar IN6ADDR_ANY for
        IPv6. The empty string or None are not allowed.
        
        For UNIX sockets, supply the filename as a string.""")
    
    def start(self):
        """Run the server forever."""
        self._interrupt = None
        
        if self.software is None:
            self.software = "%s Server" % self.version
        
        self._setup_ssl_adapter()
        self._bind_socket()
        
        self.socket.settimeout(1)
        self.socket.listen(self.request_queue_size)
        
        self.requests.start()
        
        self.ready = True
        self._start_time = time.time()
        self._run_server_loop()
    
    def _setup_ssl_adapter(self):
        """Setup SSL adapter if configured."""
        if (self.ssl_adapter is None and
            getattr(self, 'ssl_certificate', None) and
            getattr(self, 'ssl_private_key', None)):
            warnings.warn(
                    "SSL attributes are deprecated in CherryPy 3.2, and will "
                    "be removed in CherryPy 3.3. Use an ssl_adapter attribute "
                    "instead.",
                    DeprecationWarning
                )
            try:
                from cherrypy.wsgiserver.ssl_pyopenssl import pyOpenSSLAdapter
            except ImportError:
                pass
            else:
                self.ssl_adapter = pyOpenSSLAdapter(
                    self.ssl_certificate, self.ssl_private_key,
                    getattr(self, 'ssl_certificate_chain', None))
    
    def _bind_socket(self):
        """Create and bind the server socket."""
        if isinstance(self.bind_addr, basestring):
            self._bind_unix_socket()
        else:
            self._bind_inet_socket()
    
    def _bind_unix_socket(self):
        """Bind a UNIX domain socket."""
        try:
            os.unlink(self.bind_addr)
        except:
            pass
        
        try:
            os.chmod(self.bind_addr, 511)
        except:
            pass
        
        info = [(socket.AF_UNIX, socket.SOCK_STREAM, 0, "", self.bind_addr)]
        self._create_socket_from_info(info)
    
    def _bind_inet_socket(self):
        """Bind an IPv4 or IPv6 socket."""
        host, port = self.bind_addr
        try:
            info = socket.getaddrinfo(host, port, socket.AF_UNSPEC,
                                      socket.SOCK_STREAM, 0, socket.AI_PASSIVE)
        except socket.gaierror:
            if ':' in self.bind_addr[0]:
                info = [(socket.AF_INET6, socket.SOCK_STREAM,
                         0, "", self.bind_addr + (0, 0))]
            else:
                info = [(socket.AF_INET, socket.SOCK_STREAM,
                         0, "", self.bind_addr)]
        
        self._create_socket_from_info(info)
    
    def _create_socket_from_info(self, info):
        """Create socket from address info list."""
        self.socket = None
        msg = "No socket could be created"
        for res in info:
            af, socktype, proto, canonname, sa = res
            try:
                self.bind(af, socktype, proto)
            except socket.error:
                if self.socket:
                    self.socket.close()
                self.socket = None
                continue
            break
        if not self.socket:
            raise socket.error(msg)
    
    def _run_server_loop(self):
        """Run the main server loop."""
        while self.ready:
            try:
                self.tick()
            except (KeyboardInterrupt, SystemExit):
                raise
            except:
                self.error_log("Error in HTTPServer.tick", level=logging.ERROR,
                               traceback=True)
            
            if self.interrupt:
                while self.interrupt is True:
                    time.sleep(0.1)
                if self.interrupt:
                    raise self.interrupt

    def error_log(self, msg="", level=20, traceback=False):
        sys.stderr.write(msg + '\n')
        sys.stderr.flush()
        if traceback:
            tblines = format_exc()
            sys.stderr.write(tblines)
            sys.stderr.flush()

    def bind(self, family, type, proto=0):
        """Create (or recreate) the actual socket object."""
        self.socket = socket.socket(family, type, proto)
        prevent_socket_inheritance(self.socket)
        self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        if self.nodelay and not isinstance(self.bind_addr, str):
            self.socket.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        
        if self.ssl_adapter is not None:
            self.socket = self.ssl_adapter.bind(self.socket)
        
        if (hasattr(socket, 'AF_INET6') and family == socket.AF_INET6
            and self.bind_addr[0] in ('::', '::0', '::0.0.0.0')):
            try:
                self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
            except (AttributeError, socket.error):
                pass
        
        self.socket.bind(self.bind_addr)
    
    def tick(self):
        """Accept a new connection and put it on the Queue."""
        try:
            s, addr = self.socket.accept()
            if self.stats['Enabled']:
                self.stats['Accepts'] += 1
            if not self.ready:
                return
            
            prevent_socket_inheritance(s)
            if hasattr(s, 'settimeout'):
                s.settimeout(self.timeout)
            
            self._handle_accepted_socket(s, addr)
        except socket.timeout:
            return
        except socket.error:
            self._handle_socket_accept_error()
    
    def _handle_accepted_socket(self, s, addr):
        """Handle an accepted socket connection."""
        makefile = CP_fileobject
        ssl_env = {}
        
        if self.ssl_adapter is not None:
            s, ssl_env = self._wrap_ssl_socket(s, makefile)
            if not s:
                return
            makefile = self.ssl_adapter.makefile
            if hasattr(s, 'settimeout'):
                s.settimeout(self.timeout)
        
        conn = self.ConnectionClass(self, s, makefile)
        self._set_connection_info(conn, addr)
        conn.ssl_env = ssl_env
        
        self.requests.put(conn)
    
    def _wrap_ssl_socket(self, s, makefile):
        """Wrap socket with SSL."""
        try:
            s, ssl_env = self.ssl_adapter.wrap(s)
        except NoSSLError:
            self._send_plain_http_error(s, makefile)
            return None, {}
        return s, ssl_env
    
    def _send_plain_http_error(self, s, makefile):
        """Send error response for plain HTTP on HTTPS port."""
        msg = ("The client sent a plain HTTP request, but "
               "this server only speaks HTTPS on this port.")
        buf = ["%s 400 Bad Request\r\n" % self.protocol,
               "Content-Length: %s\r\n" % len(msg),
               "Content-Type: text/plain\r\n\r\n",
               msg]
        
        wfile = makefile(s, "wb", DEFAULT_BUFFER_SIZE)
        try:
            wfile.sendall("".join(buf))
        except socket.error:
            x = sys.exc_info()[1]
            if x.args[0] not in socket_errors_to_ignore:
                raise
    
    def _set_connection_info(self, conn, addr):
        """Set remote address and port on connection."""
        if isinstance(self.bind_addr, basestring):
            return
        
        if addr is None:
            if len(conn.socket.getsockname()) == 2:
                addr = ('0.0.0.0', 0)
            else:
                addr = ('::', 0)
        
        conn.remote_addr = addr[0]
        conn.remote_port = addr[1]
    
    def _handle_socket_accept_error(self):
        """Handle errors during socket accept."""
        x = sys.exc_info()[1]
        if self.stats['Enabled']:
            self.stats['Socket Errors'] += 1
        
        if x.args[0] in socket_error_eintr:
            return
        if x.args[0] in socket_errors_nonblocking:
            return
        if x.args[0] in socket_errors_to_ignore:
            return
        raise
    
    def _get_interrupt(self):
        return self._interrupt
    def _set_interrupt(self, interrupt):
        self._interrupt = True
        self.stop()
        self._interrupt = interrupt
    interrupt = property(_get_interrupt, _set_interrupt,
                         doc="Set this to an Exception instance to "
                             "interrupt the server.")
    
    def stop(self):
        """Gracefully shutdown a server that is serving forever."""
        self.ready = False
        if self._start_time is not None:
            self._run_time += (time.time() - self._start_time)
        self._start_time = None
        
        sock = getattr(self, "socket", None)
        if sock:
            self._close_socket(sock)
        
        self.requests.stop(self.shutdown_timeout)
    
    def _close_socket(self, sock):
        """Close the server socket."""
        if not isinstance(self.bind_addr, basestring):
            self._touch_socket(sock)
        
        if hasattr(sock, "close"):
            sock.close()
        self.socket = None
    
    def _touch_socket(self, sock):
        """Touch socket to wake up accept()."""
        try:
            host, port = sock.getsockname()[:2]
        except socket.error:
            x = sys.exc_info()[1]
            if x.args[0] not in socket_errors_to_ignore:
                raise
            return
        
        for res in socket.getaddrinfo(host, port, socket.AF_UNSPEC,
                                      socket.SOCK_STREAM):
            af, socktype, proto, canonname, sa = res
            s = None
            try:
                s = socket.socket(af, socktype, proto)
                s.settimeout(1.0)
                s.connect((host, port))
                s.close()
            except socket.error:
                if s:
                    s.close()


class Gateway(object):
    """A base class to interface HTTPServer with other systems, such as WSGI."""
    
    def __init__(self, req):
        self.req = req
    
    def respond(self):
        """Process the current request. Must be overridden in a subclass."""
        raise NotImplemented


ssl_adapters = {
    'builtin': 'cherrypy.wsgiserver.ssl_builtin.BuiltinSSLAdapter',
    'pyopenssl': 'cherrypy.wsgiserver.ssl_pyopenssl.pyOpenSSLAdapter',
    }

def get_ssl_adapter_class(name='pyopenssl'):
    """Return an SSL adapter class for the given name."""
    adapter = ssl_adapters[name.lower()]
    if isinstance(adapter, basestring):
        last_dot = adapter.rfind(".")
        attr_name = adapter[last_dot + 1:]
        mod_path = adapter[:last_dot]
        
        try:
            mod = sys.modules[mod_path]
            if mod is None:
                raise KeyError()
        except KeyError:
            mod = __import__(mod_path, globals(), locals(), [''])
        
        try:
            adapter = getattr(mod, attr_name)
        except AttributeError:
            raise AttributeError("'%s' object has no attribute '%s'"
                                 % (mod_path, attr_name))
    
    return adapter


class CherryPyWSGIServer(HTTPServer):
    """A subclass of HTTPServer which calls a WSGI application."""
    
    wsgi_version = (1, 0)
    """The version of WSGI to produce."""
    
    def __init__(self, bind_addr, wsgi_app, numthreads=10, server_name=None,
                 max=-1, request_queue_size=5, timeout=10, shutdown_timeout=5):
        self.requests = ThreadPool(self, min=numthreads or 1, max=max)
        self.wsgi_app = wsgi_app
        self.gateway = wsgi_gateways[self.wsgi_version]
        
        self.bind_addr = bind_addr
        if not server_name:
            server_name = socket.gethostname()
        self.server_name = server_name
        self.request_queue_size = request_queue_size
        
        self.timeout = timeout
        self.shutdown_timeout = shutdown_timeout
        self.clear_stats()
    
    def _get_numthreads(self):
        return self.requests.min
    def _set_numthreads(self, value):
        self.requests.min = value
    numthreads = property(_get_numthreads, _set_numthreads)


class WSGIGateway(Gateway):
    """A base class to interface HTTPServer with WSGI."""
    
    def __init__(self, req):
        self.req = req
        self.started_response = False
        self.env = self.get_environ()
        self.remaining_bytes_out = None
    
    def get_environ(self):
        """Return a new environ dict targeting the given wsgi.version"""
        raise NotImplemented
    
    def respond(self):
        """Process the current request."""
        response = self.req.server.wsgi_app(self.env, self.start_response)
        try:
            for chunk in response:
                if chunk:
                    if isinstance(chunk, unicodestr):
                        chunk = chunk.encode('ISO-8859-1')
                    self.write(chunk)
        finally:
            if hasattr(response, "close"):
                response.close()
    
    def start_response(self, status, headers, exc_info = None):
        """WSGI callable to begin the HTTP response."""
        if self.started_response and not exc_info:
            raise AssertionError("WSGI start_response called a second "
                                 "time with no exc_info.")
        self.started_response = True
        
        if self.req.sent_headers:
            try:
                raise exc_info[0], exc_info[1], exc_info[2]
            finally:
                exc_info = None
        
        self.req.status = status
        for k, v in headers:
            if not isinstance(k, str):
                raise TypeError("WSGI response header key %r is not of type str." % k)
            if not isinstance(v, str):
                raise TypeError("WSGI response header value %r is not of type str." % v)
            if k.lower() == 'content-length':
                self.remaining_bytes_out = int(v)
        self.req.outheaders.extend(headers)
        
        return self.write
    
    def write(self, chunk):
        """WSGI callable to write unbuffered data to the client.
        
        This method is also used internally by start_response (to write
        data from the iterable returned by the WSGI application).
        """
        if not self.started_response:
            raise AssertionError("WSGI write called before start_response.")
        
        chunklen = len(chunk)
        rbo = self.remaining_bytes_out
        if rbo is not None and chunklen > rbo:
            if not self.req.sent_headers:
                self.req.simple_response("500 Internal Server Error",
                    "The requested resource returned more bytes than the "
                    "declared Content-Length.")
            else:
                chunk = chunk[:rbo]
        
        if not self.req.sent_headers:
            self.req.sent_headers = True
            self.req.send_headers()
        
        self.req.write(chunk)
        
        if rbo is not None:
            rbo -= chunklen
            if rbo < 0:
                raise ValueError(
                    "Response body exceeds the declared Content-Length.")


class WSGIGateway_10(WSGIGateway):
    """A Gateway class to interface HTTPServer with WSGI 1.0.x."""
    
    def get_environ(self):
        """Return a new environ dict targeting the given wsgi.version"""
        req = self.req
        env = {
            'ACTUAL_SERVER_PROTOCOL': req.server.protocol,
            'PATH_INFO': req.path,
            'QUERY_STRING': req.qs,
            'REMOTE_ADDR': req.conn.remote_addr or '',
            'REMOTE_PORT': str(req.conn.remote_port or ''),
            'REQUEST_METHOD': req.method,
            'REQUEST_URI': req.uri,
            'SCRIPT_NAME': '',
            'SERVER_NAME': req.server.server_name,
            'SERVER_PROTOCOL': req.request_protocol,
            'SERVER_SOFTWARE': req.server.software,
            'wsgi.errors': sys.stderr,
            'wsgi.input': req.rfile,
            'wsgi.multiprocess': False,
            'wsgi.multithread': True,
            'wsgi.run_once': False,
            'wsgi.url_scheme': req.scheme,
            'wsgi.version': (1, 0),
            }
        
        if isinstance(req.server.bind_addr, basestring):
            env["SERVER_PORT"] = ""
        else:
            env["SERVER_PORT"] = str(req.server.bind_addr[1])
        
        for k, v in req.inheaders.iteritems():
            env["HTTP_" + k.upper().replace("-", "_")] = v
        
        ct = env.pop("HTTP_CONTENT_TYPE", None)
        if ct is not None:
            env["CONTENT_TYPE"] = ct
        cl = env.pop("HTTP_CONTENT_LENGTH", None)
        if cl is not None:
            env["CONTENT_LENGTH"] = cl
        
        if req.conn.ssl_env:
            env.update(req.conn.ssl_env)
        
        return env


class WSGIGateway_u0(WSGIGateway_10):
    """A Gateway class to interface HTTPServer with WSGI u.0.
    
    WSGI u.0 is an experimental protocol, which uses unicode for keys and values
    in both Python 2 and Python 3.
    """
    
    def get_environ(self):
        """Return a new environ dict targeting the given wsgi.version"""
        req = self.req
        env_10 = WSGIGateway_10.get_environ(self)
        env = dict([(k.decode('ISO-8859-1'), v) for k, v in env_10.iteritems()])
        env[u'wsgi.version'] = ('u', 0)
        
        env.setdefault(u'wsgi.url_encoding', u'utf-8')
        try:
            for key in [u"PATH_INFO", u"SCRIPT_NAME", u"QUERY_STRING"]:
                env[key] = env_10[str(key)].decode(env[u'wsgi.url_encoding'])
        except UnicodeDecodeError:
            env[u'wsgi.url_encoding'] = u'ISO-8859-1'
            for key in [u"PATH_INFO", u"SCRIPT_NAME", u"QUERY_STRING"]:
                env[key] = env_10[str(key)].decode(env[u'wsgi.url_encoding'])
        
        for k, v in sorted(env.items()):
            if isinstance(v, str) and k not in ('REQUEST_URI', 'wsgi.input'):
                env[k] = v.decode('ISO-8859-1')
        
        return env

wsgi_gateways = {
    (1, 0): WSGIGateway_10,
    ('u', 0): WSGIGateway_u0,
}

class WSGIPathInfoDispatcher(object):
    """A WSGI dispatcher for dispatch based on the PATH_INFO.
    
    apps: a dict or list of (path_prefix, app) pairs.
    """
    
    def __init__(self, apps):
        try:
            apps = list(apps.items())
        except AttributeError:
            pass
        
        apps.sort(cmp=lambda x,y: cmp(len(x[0]), len(y[0])))
        apps.reverse()
        
        self.apps = [(p.rstrip("/"), a) for p, a in apps]
    
    def __call__(self, environ, start_response):
        path = environ["PATH_INFO"] or "/"
        for p, app in self.apps:
            if path.startswith(p + "/") or path == p:
                environ = environ.copy()
                environ["SCRIPT_NAME"] = environ["SCRIPT_NAME"] + p
                environ["PATH_INFO"] = path[len(p):]
                return app(environ, start_response)
        
        start_response('404 Not Found', [('Content-Type', 'text/plain'),
                                         ('Content-Length', '0')])
        return ['']