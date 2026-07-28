def is_valid_request_line(request_line):
    """Check if the request line is valid."""
    try:
        method, uri, req_protocol = request_line.strip().split(SPACE, 2)
        rp = int(req_protocol[5]), int(req_protocol[7])
        return True
    except (ValueError, IndexError):
        return False


def parse_request_uri(uri):
    """Parse a Request-URI into (scheme, authority, path)."""
    if uri == ASTERISK:
        return None, None, uri

    i = uri.find('://')
    if i > 0 and QUESTION_MARK not in uri[:i]:
        # An absoluteURI.
        scheme, remainder = uri[:i].lower(), uri[i + 3:]
        authority, path = remainder.split(FORWARD_SLASH, 1)
        path = FORWARD_SLASH + path
        return scheme, authority, path

    if uri.startswith(FORWARD_SLASH):
        # An abs_path.
        return None, None, uri
    else:
        # An authority.
        return None, uri, None


def is_valid_path(path):
    """Check if the path is valid."""
    if NUMBER_SIGN in path:
        return False
    return True


def parse_request_headers(inheaders):
    """Parse the request headers."""
    try:
        read_headers(inheaders.rfile, inheaders.inheaders)
        return True
    except ValueError:
        return False


def is_valid_content_length(inheaders):
    """Check if the content length is valid."""
    mrbs = inheaders.server.max_request_body_size
    if mrbs and int(inheaders.inheaders.get("Content-Length", 0)) > mrbs:
        return False
    return True


def is_valid_transfer_encoding(inheaders):
    """Check if the transfer encoding is valid."""
    te = inheaders.inheaders.get("Transfer-Encoding")
    if te:
        te = [x.strip().lower() for x in te.split(",") if x.strip()]
        for enc in te:
            if enc == "chunked":
                inheaders.chunked_read = True
            else:
                return False
    return True


def is_valid_expect_header(inheaders):
    """Check if the expect header is valid."""
    if inheaders.inheaders.get("Expect", "") == "100-continue":
        return True
    return False


def send_100_continue_response(conn):
    """Send a 100 Continue response."""
    msg = conn.server.protocol + " 100 Continue\r\n\r\n"
    try:
        conn.wfile.sendall(msg)
    except socket.error:
        x = sys.exc_info()[1]
        if x.args[0] not in socket_errors_to_ignore:
            raise


def send_408_timeout_response(req):
    """Send a 408 Request Timeout response."""
    try:
        req.simple_response("408 Request Timeout")
    except FatalSSLAlert:
        # Close the connection.
        return


def send_500_internal_server_error_response(req):
    """Send a 500 Internal Server Error response."""
    try:
        req.simple_response("500 Internal Server Error")
    except FatalSSLAlert:
        # Close the connection.
        return


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
        self.close_connection = self.__class__.close_connection
        self.chunked_read = False
        self.chunked_write = self.__class__.chunked_write

    def parse_request(self):
        """Parse the next HTTP request start-line and message-headers."""
        self.rfile = SizeCheckWrapper(self.conn.rfile,
                                      self.server.max_request_header_size)
        request_line = self.rfile.readline()
        if not request_line:
            return

        if not is_valid_request_line(request_line):
            self.simple_response("400 Bad Request", "Malformed Request-Line")
            return

        method, uri, req_protocol = request_line.strip().split(SPACE, 2)
        rp = int(req_protocol[5]), int(req_protocol[7])
        self.uri = uri
        self.method = method

        scheme, authority, path = parse_request_uri(uri)
        if not is_valid_path(path):
            self.simple_response("400 Bad Request",
                                 "Illegal #fragment in Request-URI.")
            return

        if scheme:
            self.scheme = scheme

        qs = EMPTY
        if QUESTION_MARK in path:
            path, qs = path.split(QUESTION_MARK, 1)

        self.path = path
        self.qs = qs

        if not parse_request_headers(self):
            self.simple_response("400 Bad Request", "Invalid request headers")
            return

        if not is_valid_content_length(self):
            self.simple_response("413 Request Entity Too Large",
                "The entity sent with the request exceeds the maximum "
                "allowed bytes.")
            return

        if not is_valid_transfer_encoding(self):
            self.simple_response("501 Unimplemented")
            self.close_connection = True
            return

        if is_valid_expect_header(self):
            send_100_continue_response(self.conn)

        self.ready = True

    def respond(self):
        """Call the gateway and write its iterable output."""
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

        self.server.gateway(self).respond()

        if (self.ready and not self.sent_headers):
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
        """Assert, process, and send the HTTP response message-headers."""
        hkeys = [key.lower() for key, value in self.outheaders]
        status = int(self.status[:3])
        if status == 413:
            self.close_connection = True
        elif "content-length" not in hkeys:
            if status < 200 or status in (204, 205, 304):
                pass
            else:
                if (self.response_protocol == 'HTTP/1.1'
                    and self.method != 'HEAD'):
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
        if (not self.close_connection) and (not self.chunked_read):
            remaining = getattr(self.rfile, 'remaining', 0)
            if remaining > 0:
                self.rfile.read(remaining)
        if "date" not in hkeys:
            self.outheaders.append(("Date", rfc822.formatdate()))
        if "server" not in hkeys:
            self.outheaders.append(("Server", self.server.server_name))
        buf = [self.server.protocol + SPACE + self.status + CRLF]
        for k, v in self.outheaders:
            buf.append(k + COLON + SPACE + v + CRLF)
        buf.append(CRLF)
        self.conn.wfile.sendall(EMPTY.join(buf))


class HTTPConnection(object):
    """An HTTP connection (active socket)."""

    def communicate(self):
        """Read each request and respond appropriately."""
        request_seen = False
        try:
            while True:
                req = self.RequestHandlerClass(self.server, self)
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
                if (not request_seen) or (req and req.started_request):
                    if req and not req.sent_headers:
                        send_408_timeout_response(req)
            elif errnum not in socket_errors_to_ignore:
                self.server.error_log("socket.error %s" % repr(errnum),
                                      level=logging.WARNING, traceback=True)
                if req and not req.sent_headers:
                    send_500_internal_server_error_response(req)
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
                send_500_internal_server_error_response(req)