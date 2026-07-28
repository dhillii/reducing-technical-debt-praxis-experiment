def is_valid_request_line(request_line):
    """Check if the request line is valid."""
    return request_line and request_line.endswith(CRLF)

def parse_request_line(request_line):
    """Parse the request line into method, uri, and request protocol."""
    try:
        method, uri, req_protocol = request_line.strip().split(SPACE, 2)
        rp = int(req_protocol[5:6]), int(req_protocol[7:8])
        return method, uri, rp
    except ValueError:
        return None, None, None

def is_valid_request_uri(uri):
    """Check if the request URI is valid."""
    return uri and NUMBER_SIGN not in uri

def parse_request_uri(uri):
    """Parse the request URI into scheme, authority, and path."""
    scheme, sep, remainder = uri.partition(b'://')
    if sep and QUESTION_MARK not in scheme:
        authority, path_a, path_b = remainder.partition(FORWARD_SLASH)
        return scheme.lower(), authority, path_a+path_b
    elif uri.startswith(FORWARD_SLASH):
        return None, None, uri
    else:
        return None, uri, None

def is_valid_request_headers(inheaders):
    """Check if the request headers are valid."""
    return inheaders and b"Content-Length" in inheaders

def parse_request_headers(inheaders):
    """Parse the request headers."""
    try:
        read_headers(inheaders)
        return True
    except ValueError:
        return False

def is_valid_request_body(rfile, maxlen):
    """Check if the request body is valid."""
    return rfile and maxlen and rfile.remaining <= maxlen

def parse_request_body(rfile, maxlen):
    """Parse the request body."""
    try:
        rfile.read()
        return True
    except MaxSizeExceeded:
        return False

class HTTPRequest(object):
    """An HTTP Request (and response)."""
    
    def __init__(self, server, conn):
        self.server = server
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
        self.close_connection = False
        self.chunked_read = False
        self.chunked_write = False
    
    def parse_request(self):
        """Parse the next HTTP request start-line and message-headers."""
        if not self.parse_request_line():
            return
        if not self.parse_request_uri():
            return
        if not self.parse_request_headers():
            return
        self.ready = True
    
    def parse_request_line(self):
        """Parse the request line."""
        request_line = self.conn.rfile.readline()
        if not is_valid_request_line(request_line):
            self.simple_response("400 Bad Request", "HTTP requires CRLF terminators")
            return False
        method, uri, rp = parse_request_line(request_line)
        if not method or not uri or not rp:
            self.simple_response("400 Bad Request", "Malformed Request-Line")
            return False
        self.uri = uri
        self.method = method
        self.response_protocol = "HTTP/%s.%s" % min(rp, (1, 1))
        return True
    
    def parse_request_uri(self):
        """Parse the request URI."""
        if not is_valid_request_uri(self.uri):
            self.simple_response("400 Bad Request", "Illegal #fragment in Request-URI.")
            return False
        scheme, authority, path = parse_request_uri(self.uri)
        if scheme:
            self.scheme = scheme
        qs = EMPTY
        if QUESTION_MARK in path:
            path, qs = path.split(QUESTION_MARK, 1)
        self.path = path
        self.qs = qs
        return True
    
    def parse_request_headers(self):
        """Parse the request headers."""
        try:
            read_headers(self.conn.rfile, self.inheaders)
        except ValueError:
            self.simple_response("400 Bad Request", "HTTP requires CRLF terminators")
            return False
        if not is_valid_request_headers(self.inheaders):
            self.simple_response("413 Request Entity Too Large", "The entity sent with the request exceeds the maximum allowed bytes.")
            return False
        return True
    
    def respond(self):
        """Call the gateway and write its iterable output."""
        self.server.gateway(self).respond()
        if self.ready and not self.sent_headers:
            self.sent_headers = True
            self.send_headers()
        if self.chunked_write:
            self.conn.wfile.write(b"0\r\n\r\n")
    
    def simple_response(self, status, msg=""):
        """Write a simple response back to the client."""
        status = str(status)
        buf = [bytes(self.server.protocol, "ascii") + SPACE +
               bytes(status, "ISO-8859-1") + CRLF,
               bytes("Content-Length: %s\r\n" % len(msg), "ISO-8859-1"),
               b"Content-Type: text/plain\r\n"]
        if status[:3] in ("413", "414"):
            buf.append(b"Connection: close\r\n")
        buf.append(CRLF)
        if msg:
            if isinstance(msg, unicodestr):
                msg = msg.encode("ISO-8859-1")
            buf.append(msg)
        try:
            self.conn.wfile.write(b"".join(buf))
        except socket.error:
            x = sys.exc_info()[1]
            if x.args[0] not in socket_errors_to_ignore:
                raise
    
    def send_headers(self):
        """Assert, process, and send the HTTP response message-headers."""
        hkeys = [key.lower() for key, value in self.outheaders]
        status = int(self.status[:3])
        if status == 413:
            self.close_connection = True
        elif b"content-length" not in hkeys:
            if status < 200 or status in (204, 205, 304):
                pass
            else:
                if self.response_protocol == 'HTTP/1.1' and self.method != b'HEAD':
                    self.chunked_write = True
                    self.outheaders.append((b"Transfer-Encoding", b"chunked"))
                else:
                    self.close_connection = True
        if b"connection" not in hkeys:
            if self.response_protocol == 'HTTP/1.1':
                if self.close_connection:
                    self.outheaders.append((b"Connection", b"close"))
            else:
                if not self.close_connection:
                    self.outheaders.append((b"Connection", b"Keep-Alive"))
        if not self.close_connection and not self.chunked_read:
            remaining = getattr(self.rfile, 'remaining', 0)
            if remaining > 0:
                self.rfile.read(remaining)
        if b"date" not in hkeys:
            self.outheaders.append(
                (b"Date", email.utils.formatdate(usegmt=True).encode('ISO-8859-1')))
        if b"server" not in hkeys:
            self.outheaders.append(
                (b"Server", self.server.server_name.encode('ISO-8859-1')))
        buf = [self.server.protocol.encode('ascii') + SPACE + self.status + CRLF]
        for k, v in self.outheaders:
            buf.append(k + COLON + SPACE + v + CRLF)
        buf.append(CRLF)
        self.conn.wfile.write(EMPTY.join(buf))

class HTTPConnection(object):
    """An HTTP connection (active socket)."""
    
    def communicate(self):
        """Read each request and respond appropriately."""
        request_seen = False
        try:
            while True:
                req = HTTPRequest(self.server, self)
                req.parse_request()
                if not req.ready:
                    return
                request_seen = True
                req.respond()
                if req.close_connection:
                    return
        except socket.error:
            e = sys.exc_info()[1]
            errnum = e.args[0]
            if errnum == 'timed out' or errnum == 'The read operation timed out':
                if not request_seen or req.started_request:
                    if req and not req.sent_headers:
                        req.simple_response("408 Request Timeout")
            elif errnum not in socket_errors_to_ignore:
                self.server.error_log("socket.error %s" % repr(errnum),
                                      level=logging.WARNING, traceback=True)
                if req and not req.sent_headers:
                    req.simple_response("500 Internal Server Error")
            return
        except (KeyboardInterrupt, SystemExit):
            raise
        except FatalSSLAlert:
            return
        except NoSSLError:
            if req and not req.sent_headers:
                req.simple_response("400 Bad Request",
                    "The client sent a plain HTTP request, but "
                    "this server only speaks HTTPS on this port.")
            self.linger = True
        except Exception:
            e = sys.exc_info()[1]
            self.server.error_log(repr(e), level=logging.ERROR, traceback=True)
            if req and not req.sent_headers:
                req.simple_response("500 Internal Server Error")
            return
    
    def close(self):
        """Close the socket underlying this connection."""
        self.rfile.close()
        if not self.linger:
            self.socket.close()
        else:
            pass

class HTTPServer(object):
    """An HTTP server."""
    
    def start(self):
        """Run the server forever."""
        self._interrupt = None
        self.software = "%s Server" % self.version
        self.socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self.socket.bind(self.bind_addr)
        self.socket.listen(self.request_queue_size)
        self.requests.start()
        self._start_time = time.time()
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
            makefile = CP_makefile
            ssl_env = {}
            if self.ssl_adapter is not None:
                try:
                    s, ssl_env = self.ssl_adapter.wrap(s)
                except NoSSLError:
                    msg = ("The client sent a plain HTTP request, but "
                           "this server only speaks HTTPS on this port.")
                    buf = ["%s 400 Bad Request\r\n" % self.protocol,
                           "Content-Length: %s\r\n" % len(msg),
                           "Content-Type: text/plain\r\n\r\n",
                           msg]
                    wfile = makefile(s, "wb", DEFAULT_BUFFER_SIZE)
                    try:
                        wfile.write("".join(buf).encode('ISO-8859-1'))
                    except socket.error:
                        x = sys.exc_info()[1]
                        if x.args[0] not in socket_errors_to_ignore:
                            raise
                    return
                if not s:
                    return
                makefile = self.ssl_adapter.makefile
                if hasattr(s, 'settimeout'):
                    s.settimeout(self.timeout)
            conn = self.ConnectionClass(self, s, makefile)
            conn.remote_addr = addr[0]
            conn.remote_port = addr[1]
            conn.ssl_env = ssl_env
            self.requests.put(conn)
        except socket.timeout:
            return
        except socket.error:
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
        self.req.status = status.encode('ISO-8859-1')
        for k, v in headers:
            self.req.outheaders.append((k.encode('ISO-8859-1'), v.encode('ISO-8859-1')))
        return self.write
    
    def write(self, chunk):
        """WSGI callable to write unbuffered data to the client."""
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