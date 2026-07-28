def is_valid_request_line(request_line):
    """Check if the request line is valid."""
    try:
        method, uri, req_protocol = request_line.strip().split(SPACE, 2)
        rp = int(req_protocol[5]), int(req_protocol[7])
        return True
    except (ValueError, IndexError):
        return False


def is_valid_request_uri(uri):
    """Check if the request URI is valid."""
    if uri == ASTERISK:
        return True
    i = uri.find('://')
    if i > 0 and QUESTION_MARK not in uri[:i]:
        return True
    if uri.startswith(FORWARD_SLASH):
        return True
    return False


def parse_request_uri(uri):
    """Parse a Request-URI into (scheme, authority, path)."""
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
    return None, uri, None


def is_valid_request_headers(inheaders):
    """Check if the request headers are valid."""
    try:
        read_headers(StringIO.StringIO(), inheaders)
        return True
    except ValueError:
        return False


def is_valid_request_body(rfile, maxlen):
    """Check if the request body is valid."""
    try:
        if maxlen and maxlen < 0:
            return False
        if maxlen and rfile.remaining > maxlen:
            return False
        return True
    except AttributeError:
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
        self.outheaders = []
        self.sent_headers = False
        self.close_connection = False
        self.chunked_write = False

    def parse_request(self):
        """Parse the next HTTP request start-line and message-headers."""
        if not self.parse_request_line():
            return
        if not self.parse_request_headers():
            return
        self.ready = True

    def parse_request_line(self):
        """Parse the request line."""
        request_line = self.conn.rfile.readline()
        if not request_line:
            return False
        if request_line == CRLF:
            request_line = self.conn.rfile.readline()
            if not request_line:
                return False
        if not request_line.endswith(CRLF):
            self.simple_response("400 Bad Request", "HTTP requires CRLF terminators")
            return False
        if not is_valid_request_line(request_line):
            self.simple_response("400 Bad Request", "Malformed Request-Line")
            return False
        self.uri = request_line.strip().split(SPACE, 2)[1]
        self.method = request_line.strip().split(SPACE, 2)[0]
        return True

    def parse_request_headers(self):
        """Parse the request headers."""
        try:
            read_headers(self.conn.rfile, self.inheaders)
        except ValueError:
            self.simple_response("400 Bad Request", "Illegal end of headers.")
            return False
        if not is_valid_request_headers(self.inheaders):
            self.simple_response("400 Bad Request", "Invalid request headers.")
            return False
        return True

    def respond(self):
        """Call the gateway and write its iterable output."""
        if not self.ready:
            return
        self.server.gateway(self).respond()

    def simple_response(self, status, msg=""):
        """Write a simple response back to the client."""
        status = str(status)
        buf = [self.server.protocol + SPACE + status + CRLF,
               "Content-Length: %s\r\n" % len(msg),
               "Content-Type: text/plain\r\n"]
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
        """Assert, process, and send the HTTP response message-headers."""
        hkeys = [key.lower() for key, value in self.outheaders]
        status = int(self.status[:3])
        if status == 413:
            self.close_connection = True
        elif "content-length" not in hkeys:
            if status < 200 or status in (204, 205, 304):
                pass
            else:
                if self.response_protocol == 'HTTP/1.1' and self.method != 'HEAD':
                    self.chunked_write = True
                    self.outheaders.append(("Transfer-Encoding", "chunked"))
                else:
                    self.close_connection = True
        if "connection" not in hkeys:
            if self.response_protocol == 'HTTP/1.1':
                if self.close_connection:
                    self.outheaders.append(("Connection", "close"))
            else:
                if not self.close_connection:
                    self.outheaders.append(("Connection", "Keep-Alive"))
        if "date" not in hkeys:
            self.outheaders.append(("Date", rfc822.formatdate()))
        if "server" not in hkeys:
            self.outheaders.append(("Server", self.server.server_name))
        buf = [self.server.protocol + SPACE + self.status + CRLF]
        for k, v in self.outheaders:
            buf.append(k + COLON + SPACE + v + CRLF)
        buf.append(CRLF)
        self.conn.wfile.sendall(EMPTY.join(buf))


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
                    self.write(chunk)
        finally:
            if hasattr(response, "close"):
                response.close()

    def start_response(self, status, headers, exc_info=None):
        """WSGI callable to begin the HTTP response."""
        if self.started_response and not exc_info:
            raise AssertionError("WSGI start_response called a second time with no exc_info.")
        self.started_response = True
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
        """WSGI callable to write unbuffered data to the client."""
        if not self.started_response:
            raise AssertionError("WSGI write called before start_response.")
        chunklen = len(chunk)
        rbo = self.remaining_bytes_out
        if rbo is not None and chunklen > rbo:
            if not self.req.sent_headers:
                self.req.simple_response("500 Internal Server Error",
                                        "The requested resource returned more bytes than the declared Content-Length.")
            else:
                chunk = chunk[:rbo]
        if not self.req.sent_headers:
            self.req.sent_headers = True
            self.req.send_headers()
        self.req.write(chunk)
        if rbo is not None:
            rbo -= chunklen
            if rbo < 0:
                raise ValueError("Response body exceeds the declared Content-Length.")


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
    """A Gateway class to interface HTTPServer with WSGI u.0."""

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