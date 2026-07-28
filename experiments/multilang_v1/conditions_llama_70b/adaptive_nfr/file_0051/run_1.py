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
    try:
        atoms = [unquote(x) for x in quoted_slash.split(path)]
    except ValueError:
        return False
    return True


def get_request_protocol(request_line):
    """Get the request protocol from the request line."""
    try:
        method, uri, req_protocol = request_line.strip().split(SPACE, 2)
        rp = int(req_protocol[5]), int(req_protocol[7])
        return req_protocol
    except (ValueError, IndexError):
        return None


def get_response_protocol(server_protocol, request_protocol):
    """Get the response protocol based on the server and request protocols."""
    sp = int(server_protocol[5]), int(server_protocol[7])
    rp = int(request_protocol[5]), int(request_protocol[7])
    return "HTTP/%s.%s" % min(rp, sp)


def is_valid_header_line(line):
    """Check if the header line is valid."""
    if not line.endswith(CRLF):
        return False
    try:
        k, v = line.split(COLON, 1)
    except ValueError:
        return False
    return True


def read_headers(rfile, hdict=None):
    """Read headers from the given stream into the given header dict."""
    if hdict is None:
        hdict = {}
    
    while True:
        line = rfile.readline()
        if not line:
            # No more data--illegal end of headers
            raise ValueError("Illegal end of headers.")
        
        if line == CRLF:
            # Normal end of headers
            break
        
        if not is_valid_header_line(line):
            raise ValueError("HTTP requires CRLF terminators")
        
        try:
            k, v = line.split(COLON, 1)
        except ValueError:
            raise ValueError("Illegal header line.")
        
        k = k.strip().title()
        v = v.strip()
        
        if k in comma_separated_headers:
            existing = hdict.get(k)
            if existing:
                v = ", ".join((existing, v))
        hdict[k] = v
    
    return hdict


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
        self.chunked_write = self.__class__.chunked_write
    
    def parse_request(self):
        """Parse the next HTTP request start-line and message-headers."""
        self.rfile = SizeCheckWrapper(self.conn.rfile,
                                      self.server.max_request_header_size)
        try:
            request_line = self.rfile.readline()
        except MaxSizeExceeded:
            self.simple_response("414 Request-URI Too Long",
                "The Request-URI sent with the request exceeds the maximum "
                "allowed bytes.")
            return
        
        if not request_line:
            return
        
        if not is_valid_request_line(request_line):
            self.simple_response("400 Bad Request", "Malformed Request-Line")
            return
        
        method, uri, req_protocol = request_line.strip().split(SPACE, 2)
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
        
        self.response_protocol = get_response_protocol(self.server.protocol, req_protocol)
        
        try:
            read_headers(self.rfile, self.inheaders)
        except ValueError:
            ex = sys.exc_info()[1]
            self.simple_response("400 Bad Request", ex.args[0])
            return
        
        mrbs = self.server.max_request_body_size
        if mrbs and int(self.inheaders.get("Content-Length", 0)) > mrbs:
            self.simple_response("413 Request Entity Too Large",
                "The entity sent with the request exceeds the maximum "
                "allowed bytes.")
            return
        
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
            # Request Entity Too Large / Request-URI Too Long
            self.close_connection = True
            if self.response_protocol == 'HTTP/1.1':
                # This will not be true for 414, since read_request_line
                # usually raises 414 before reading the whole line, and we
                # therefore cannot know the proper response_protocol.
                buf.append("Connection: close\r\n")
            else:
                # HTTP/1.0 had no 413/414 status nor Connection header.
                # Emit 400 instead and trust the message body is enough.
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
            # Request Entity Too Large. Close conn to avoid garbage.
            self.close_connection = True
        elif "content-length" not in hkeys:
            # "All 1xx (informational), 204 (no content),
            # and 304 (not modified) responses MUST NOT
            # include a message-body." So no point chunking.
            if status < 200 or status in (204, 205, 304):
                pass
            else:
                if (self.response_protocol == 'HTTP/1.1'
                    and self.method != 'HEAD'):
                    # Use the chunked transfer-coding
                    self.chunked_write = True
                    self.outheaders.append(("Transfer-Encoding", "chunked"))
                else:
                    # Closing the conn is the only way to determine len.
                    self.close_connection = True
        
        if "connection" not in hkeys:
            if self.response_protocol == 'HTTP/1.1':
                # Both server and client are HTTP/1.1 or better
                if self.close_connection:
                    self.outheaders.append(("Connection", "close"))
            else:
                # Server and/or client are HTTP/1.0
                if not self.close_connection:
                    self.outheaders.append(("Connection", "Keep-Alive"))
        
        if (not self.close_connection) and (not self.chunked_read):
            # Read any remaining request body data on the socket.
            # "If an origin server receives a request that does not include an
            # Expect request-header field with the "100-continue" expectation,
            # the request includes a request body, and the server responds
            # with a final status code before reading the entire request body
            # from the transport connection, then the server SHOULD NOT close
            # the transport connection until it has read the entire request,
            # or until the client closes the connection. Otherwise, the client
            # might not reliably receive the response message. However, this
            # requirement is not be construed as preventing a server from
            # defending itself against denial-of-service attacks, or from
            # badly broken client implementations."
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