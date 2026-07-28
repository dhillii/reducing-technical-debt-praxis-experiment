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
        self.server = server
        self.conn = conn
        
        self.ready = False
        self.started_request = False
        self.scheme = "http"
        if self.server.ssl_adapter is not None:
            self.scheme = "https"
        # Use the lowest-common protocol in case read_request_line errors.
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
        self._parse_request_line()
        self._parse_request_headers()
        self.ready = True
    
    def _parse_request_line(self):
        try:
            request_line = self.conn.rfile.readline()
            if not request_line:
                return False
            if request_line == "\r\n":
                request_line = self.conn.rfile.readline()
                if not request_line:
                    return False
            if not request_line.endswith("\r\n"):
                self.simple_response("400 Bad Request", "HTTP requires CRLF terminators")
                return False
            method, uri, req_protocol = request_line.strip().split(" ", 2)
            rp = int(req_protocol[5:6]), int(req_protocol[7:8])
        except ValueError:
            self.simple_response("400 Bad Request", "Malformed Request-Line")
            return False
        
        self.uri = uri
        self.method = method
        
        scheme, authority, path = self._parse_request_uri(uri)
        if "#" in path:
            self.simple_response("400 Bad Request", "Illegal #fragment in Request-URI.")
            return False
        
        if scheme:
            self.scheme = scheme
        
        qs = ""
        if "?" in path:
            path, qs = path.split("?", 1)
        
        self.path = path
        self.qs = qs
        
        sp = int(self.server.protocol[5:6]), int(self.server.protocol[7:8])
        
        if sp[0] != rp[0]:
            self.simple_response("505 HTTP Version Not Supported")
            return False

        self.request_protocol = req_protocol
        self.response_protocol = "HTTP/%s.%s" % min(rp, sp)
        return True

    def _parse_request_headers(self):
        try:
            read_headers(self.conn.rfile, self.inheaders)
        except ValueError:
            ex = sys.exc_info()[1]
            self.simple_response("400 Bad Request", ex.args[0])
            return False
        
        mrbs = self.server.max_request_body_size
        if mrbs and int(self.inheaders.get("Content-Length", 0)) > mrbs:
            self.simple_response("413 Request Entity Too Large", "The entity sent with the request exceeds the maximum allowed bytes.")
            return False
        
        if self.response_protocol == "HTTP/1.1":
            if self.inheaders.get("Connection", "") == "close":
                self.close_connection = True
        else:
            if self.inheaders.get("Connection", "") != "Keep-Alive":
                self.close_connection = True
        
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
    
    def _parse_request_uri(self, uri):
        if uri == "*":
            return None, None, uri

        scheme, sep, remainder = uri.partition("://")
        if sep and "?" not in scheme:
            authority, path_a, path_b = remainder.partition("/")
            return scheme.lower(), authority, path_a+path_b

        if uri.startswith("/"):
            return None, None, uri
        else:
            return None, uri, None
    
    def respond(self):
        """Call the gateway and write its iterable output."""
        mrbs = self.server.max_request_body_size
        if self.chunked_read:
            self.conn.rfile = ChunkedRFile(self.conn.rfile, mrbs)
        else:
            cl = int(self.inheaders.get("Content-Length", 0))
            if mrbs and mrbs < cl:
                if not self.sent_headers:
                    self.simple_response("413 Request Entity Too Large", "The entity sent with the request exceeds the maximum allowed bytes.")
                return
            self.conn.rfile = KnownLengthRFile(self.conn.rfile, cl)
        
        self.server.gateway(self).respond()
        
        if self.ready and not self.sent_headers:
            self.sent_headers = True
            self.send_headers()
        if self.chunked_write:
            self.conn.wfile.write("0\r\n\r\n")
    
    def simple_response(self, status, msg=""):
        """Write a simple response back to the client."""
        status = str(status)
        buf = [self.server.protocol.encode('ascii') + " " + status + "\r\n",
               "Content-Length: %s\r\n" % len(msg),
               "Content-Type: text/plain\r\n"]
        
        if status[:3] in ("413", "414"):
            self.close_connection = True
            if self.response_protocol == 'HTTP/1.1':
                buf.append("Connection: close\r\n")
            else:
                status = "400 Bad Request"
        
        buf.append("\r\n")
        if msg:
            if isinstance(msg, str):
                msg = msg.encode("ISO-8859-1")
            buf.append(msg)
        
        try:
            self.conn.wfile.write("".join(buf))
        except socket.error:
            x = sys.exc_info()[1]
            if x.args[0] not in socket_errors_to_ignore:
                raise
    
    def write(self, chunk):
        """Write unbuffered data to the client."""
        if self.chunked_write and chunk:
            buf = [hex(len(chunk))[2:], "\r\n", chunk, "\r\n"]
            self.conn.wfile.write("".join(buf))
        else:
            self.conn.wfile.write(chunk)
    
    def send_headers(self):
        """Assert, process, and send the HTTP response message-headers.
        
        You must set self.status, and self.outheaders before calling this.
        """
        hkeys = [key.lower() for key, value in self.outheaders]
        status = int(self.status[:3])
        
        if status == 413:
            self.close_connection = True
        elif "content-length" not in hkeys:
            if status < 200 or status in (204, 205, 304):
                pass
            else:
                if self.response_protocol == 'HTTP/1.1' and self.method != "HEAD":
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
        
        if not self.close_connection and not self.chunked_read:
            remaining = getattr(self.conn.rfile, 'remaining', 0)
            if remaining > 0:
                self.conn.rfile.read(remaining)
        
        if "date" not in hkeys:
            self.outheaders.append(("Date", email.utils.formatdate(usegmt=True)))
        
        if "server" not in hkeys:
            self.outheaders.append(("Server", self.server.server_name))
        
        buf = [self.server.protocol.encode('ascii') + " " + self.status + "\r\n"]
        for k, v in self.outheaders:
            buf.append(k + ": " + v + "\r\n")
        buf.append("\r\n")
        self.conn.wfile.write("".join(buf))