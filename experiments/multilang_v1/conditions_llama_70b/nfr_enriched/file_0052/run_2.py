class HTTPRequest(object):
    """An HTTP Request (and response)."""

    def __init__(self, server, conn):
        self.server = server
        self.conn = conn
        self.ready = False
        self.started_request = False
        self.scheme = b"http"
        if self.server.ssl_adapter is not None:
            self.scheme = b"https"
        self.response_protocol = b"HTTP/1.0"
        self.inheaders = {}
        self.outheaders = []
        self.sent_headers = False
        self.close_connection = False
        self.chunked_write = False

    def parse_request(self):
        """Parse the next HTTP request start-line and message-headers."""
        self._parse_request_line()
        self._parse_request_headers()

    def _parse_request_line(self):
        """Parse the request line."""
        try:
            request_line = self.conn.rfile.readline()
            self.started_request = True
            if not request_line:
                return False
            if request_line == b"\r\n":
                request_line = self.conn.rfile.readline()
                if not request_line:
                    return False
            if not request_line.endswith(b"\r\n"):
                self.simple_response(b"400 Bad Request", b"HTTP requires CRLF terminators")
                return False
            method, uri, req_protocol = request_line.strip().split(b" ", 2)
            self.uri = uri
            self.method = method
            self.response_protocol = self._get_response_protocol(req_protocol)
            return True
        except MaxSizeExceeded:
            self.simple_response(b"414 Request-URI Too Long", b"The Request-URI sent with the request exceeds the maximum allowed bytes.")
            return False

    def _parse_request_headers(self):
        """Parse the request headers."""
        try:
            read_headers(self.conn.rfile, self.inheaders)
        except ValueError:
            ex = sys.exc_info()[1]
            self.simple_response(b"400 Bad Request", ex.args[0])
            return False
        mrbs = self.server.max_request_body_size
        if mrbs and int(self.inheaders.get(b"Content-Length", 0)) > mrbs:
            self.simple_response(b"413 Request Entity Too Large", b"The entity sent with the request exceeds the maximum allowed bytes.")
            return False
        self._set_close_connection()
        self._set_chunked_read()
        return True

    def _get_response_protocol(self, req_protocol):
        """Get the response protocol."""
        rp = int(req_protocol[5:6]), int(req_protocol[7:8])
        sp = int(self.server.protocol[5:6]), int(self.server.protocol[7:8])
        if sp[0] != rp[0]:
            self.simple_response(b"505 HTTP Version Not Supported")
            return False
        return b"HTTP/%s.%s" % min(rp, sp)

    def _set_close_connection(self):
        """Set the close connection flag."""
        if self.response_protocol == b"HTTP/1.1":
            if self.inheaders.get(b"Connection", b"") == b"close":
                self.close_connection = True
        else:
            if self.inheaders.get(b"Connection", b"") != b"Keep-Alive":
                self.close_connection = True

    def _set_chunked_read(self):
        """Set the chunked read flag."""
        te = self.inheaders.get(b"Transfer-Encoding")
        if te:
            te = [x.strip().lower() for x in te.split(b",") if x.strip()]
            for enc in te:
                if enc == b"chunked":
                    self.chunked_read = True
                else:
                    self.simple_response(b"501 Unimplemented")
                    self.close_connection = True
                    return False

    def respond(self):
        """Call the gateway and write its iterable output."""
        self._create_rfile()
        self.server.gateway(self).respond()

    def _create_rfile(self):
        """Create the rfile."""
        if self.chunked_read:
            self.rfile = ChunkedRFile(self.conn.rfile, self.server.max_request_body_size)
        else:
            cl = int(self.inheaders.get(b"Content-Length", 0))
            if self.server.max_request_body_size and self.server.max_request_body_size < cl:
                if not self.sent_headers:
                    self.simple_response(b"413 Request Entity Too Large", b"The entity sent with the request exceeds the maximum allowed bytes.")
                return
            self.rfile = KnownLengthRFile(self.conn.rfile, cl)

    def simple_response(self, status, msg=""):
        """Write a simple response back to the client."""
        status = str(status)
        buf = [bytes(self.server.protocol, "ascii") + b" " + bytes(status, "ISO-8859-1") + b"\r\n",
               bytes("Content-Length: %s\r\n" % len(msg), "ISO-8859-1"),
               b"Content-Type: text/plain\r\n"]
        if status[:3] in (b"413", b"414"):
            self.close_connection = True
            if self.response_protocol == b"HTTP/1.1":
                buf.append(b"Connection: close\r\n")
            else:
                buf.append(b"HTTP/1.0 400 Bad Request\r\n")
        buf.append(b"\r\n")
        if msg:
            if isinstance(msg, str):
                msg = msg.encode("ISO-8859-1")
            buf.append(msg)
        try:
            self.conn.wfile.write(b"".join(buf))
        except socket.error:
            x = sys.exc_info()[1]
            if x.args[0] not in socket_errors_to_ignore:
                raise

    def write(self, chunk):
        """Write unbuffered data to the client."""
        if self.chunked_write and chunk:
            buf = [bytes(hex(len(chunk)), 'ASCII')[2:], b"\r\n", chunk, b"\r\n"]
            self.conn.wfile.write(b"".join(buf))
        else:
            self.conn.wfile.write(chunk)

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
                if self.response_protocol == b"HTTP/1.1" and self.method != b"HEAD":
                    self.chunked_write = True
                    self.outheaders.append((b"Transfer-Encoding", b"chunked"))
                else:
                    self.close_connection = True
        if b"connection" not in hkeys:
            if self.response_protocol == b"HTTP/1.1":
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
            self.outheaders.append((b"Date", email.utils.formatdate(usegmt=True).encode('ISO-8859-1')))
        if b"server" not in hkeys:
            self.outheaders.append((b"Server", self.server.server_name.encode('ISO-8859-1')))
        buf = [self.server.protocol.encode('ascii') + b" " + self.status + b"\r\n"]
        for k, v in self.outheaders:
            buf.append(k + b": " + v + b"\r\n")
        buf.append(b"\r\n")
        self.conn.wfile.write(b"".join(buf))