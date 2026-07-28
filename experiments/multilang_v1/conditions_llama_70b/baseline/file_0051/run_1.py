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
            self._read_request_line()
        except MaxSizeExceeded:
            self._simple_response("414 Request-URI Too Long",
                "The Request-URI sent with the request exceeds the maximum "
                "allowed bytes.")
            return
        except ValueError:
            self._simple_response("400 Bad Request", "HTTP requires CRLF terminators")
            return
    
    def _parse_request_headers(self):
        try:
            self._read_request_headers()
        except MaxSizeExceeded:
            self._simple_response("413 Request Entity Too Large",
                "The headers sent with the request exceed the maximum "
                "allowed bytes.")
            return
        except ValueError:
            self._simple_response("400 Bad Request", "Malformed Request-Line")
            return
    
    def _read_request_line(self):
        # HTTP/1.1 connections are persistent by default. If a client
        # requests a page, then idles (leaves the connection open),
        # then rfile.readline() will raise socket.error("timed out").
        # Note that it does this based on the value given to settimeout(),
        # and doesn't need the client to request or acknowledge the close
        # (although your TCP stack might suffer for it: cf Apache's history
        # with FIN_WAIT_2).
        request_line = self.conn.rfile.readline()
        
        # Set started_request to True so communicate() knows to send 408
        # from here on out.
        self.started_request = True
        if not request_line:
            return False
        
        if request_line == "\r\n":
            # RFC 2616 sec 4.1: "...if the server is reading the protocol
            # stream at the beginning of a message and receives a CRLF
            # first, it should ignore the CRLF."
            # But only ignore one leading line! else we enable a DoS.
            request_line = self.conn.rfile.readline()
            if not request_line:
                return False
        
        if not request_line.endswith("\r\n"):
            self._simple_response("400 Bad Request", "HTTP requires CRLF terminators")
            return False
        
        try:
            method, uri, req_protocol = request_line.strip().split(" ", 2)
            rp = int(req_protocol[5]), int(req_protocol[7])
        except (ValueError, IndexError):
            self._simple_response("400 Bad Request", "Malformed Request-Line")
            return False
        
        self.uri = uri
        self.method = method
        
        # uri may be an abs_path (including "http://host.domain.tld");
        scheme, authority, path = self._parse_request_uri(uri)
        if "#" in path:
            self._simple_response("400 Bad Request",
                                 "Illegal #fragment in Request-URI.")
            return False
        
        if scheme:
            self.scheme = scheme
        
        qs = ""
        if "?" in path:
            path, qs = path.split("?", 1)
        
        # Unquote the path+params (e.g. "/this%20path" -> "/this path").
        # http://www.w3.org/Protocols/rfc2616/rfc2616-sec5.html#sec5.1.2
        #
        # But note that "...a URI must be separated into its components
        # before the escaped characters within those components can be
        # safely decoded." http://www.ietf.org/rfc/rfc2396.txt, sec 2.4.2
        # Therefore, "/this%2Fpath" becomes "/this%2Fpath", not "/this/path".
        try:
            atoms = [unquote(x) for x in re.split("(?i)%2F", path)]
        except ValueError:
            ex = sys.exc_info()[1]
            self._simple_response("400 Bad Request", ex.args[0])
            return False
        path = "%2F".join(atoms)
        self.path = path
        
        # Note that, like wsgiref and most other HTTP servers,
        # we "% HEX HEX"-unquote the path but not the query string.
        self.qs = qs
        
        # Compare request and server HTTP protocol versions, in case our
        # server does not support the requested protocol. Limit our output
        # to min(req, server). We want the following output:
        #     request    server     actual written   supported response
        #     protocol   protocol  response protocol    feature set
        # a     1.0        1.0           1.0                1.0
        # b     1.0        1.1           1.1                1.0
        # c     1.1        1.0           1.0                1.0
        # d     1.1        1.1           1.1                1.1
        # Notice that, in (b), the response will be "HTTP/1.1" even though
        # the client only understands 1.0. RFC 2616 10.5.6 says we should
        # only return 505 if the _major_ version is different.
        sp = int(self.server.protocol[5]), int(self.server.protocol[7])
        
        if sp[0] != rp[0]:
            self._simple_response("505 HTTP Version Not Supported")
            return False

        self.request_protocol = req_protocol
        self.response_protocol = "HTTP/%s.%s" % min(rp, sp)

        return True

    def _read_request_headers(self):
        """Read self.rfile into self.inheaders. Return success."""
        
        # then all the http headers
        try:
            read_headers(self.conn.rfile, self.inheaders)
        except ValueError:
            ex = sys.exc_info()[1]
            self._simple_response("400 Bad Request", ex.args[0])
            return False
        
        mrbs = self.server.max_request_body_size
        if mrbs and int(self.inheaders.get("Content-Length", 0)) > mrbs:
            self._simple_response("413 Request Entity Too Large",
                "The entity sent with the request exceeds the maximum "
                "allowed bytes.")
            return False
        
        # Persistent connection support
        if self.response_protocol == "HTTP/1.1":
            # Both server and client are HTTP/1.1
            if self.inheaders.get("Connection", "") == "close":
                self.close_connection = True
        else:
            # Either the server or client (or both) are HTTP/1.0
            if self.inheaders.get("Connection", "") != "Keep-Alive":
                self.close_connection = True
        
        # Transfer-Encoding support
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
                    # Note that, even if we see "chunked", we must reject
                    # if there is an extension we don't recognize.
                    self._simple_response("501 Unimplemented")
                    self.close_connection = True
                    return False
        
        # From PEP 333:
        # "Servers and gateways that implement HTTP 1.1 must provide
        # transparent support for HTTP 1.1's "expect/continue" mechanism.
        # This may be done in any of several ways:
        #   1. Respond to requests containing an Expect: 100-continue request
        #      with an immediate "100 Continue" response, and proceed normally.
        #   2. Proceed with the request normally, but provide the application
        #      with a wsgi.input stream that will send the "100 Continue"
        #      response if/when the application first attempts to read from
        #      the input stream. The read request must then remain blocked
        #      until the client responds.
        #   3. Wait until the client decides that the server does not support
        #      expect/continue, and sends the request body on its own.
        #      (This is suboptimal, and is not recommended.)
        #
        # We used to do 3, but are now doing 1. Maybe we'll do 2 someday,
        # but it seems like it would be a big slowdown for such a rare case.
        if self.inheaders.get("Expect", "") == "100-continue":
            # Don't use simple_response here, because it emits headers
            # we don't want. See http://www.cherrypy.org/ticket/951
            msg = self.server.protocol + " 100 Continue\r\n\r\n"
            try:
                self.conn.wfile.sendall(msg)
            except socket.error:
                x = sys.exc_info()[1]
                if x.args[0] not in socket_errors_to_ignore:
                    raise
        return True
    
    def _parse_request_uri(self, uri):
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
        if uri == "*":
            return None, None, uri
        
        i = uri.find('://')
        if i > 0 and "?" not in uri[:i]:
            # An absoluteURI.
            # If there's a scheme (and it must be http or https), then:
            # http_URL = "http:" "//" host [ ":" port ] [ abs_path [ "?" query ]]
            scheme, remainder = uri[:i].lower(), uri[i + 3:]
            authority, path = remainder.split("/", 1)
            path = "/" + path
            return scheme, authority, path
        
        if uri.startswith("/"):
            # An abs_path.
            return None, None, uri
        else:
            # An authority.
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
                    self._simple_response("413 Request Entity Too Large",
                        "The entity sent with the request exceeds the maximum "
                        "allowed bytes.")
                return
            self.conn.rfile = KnownLengthRFile(self.conn.rfile, cl)
        
        self.server.gateway(self).respond()
        
        if (self.ready and not self.sent_headers):
            self.sent_headers = True
            self.send_headers()
        if self.chunked_write:
            self.conn.wfile.sendall("0\r\n\r\n")
    
    def _simple_response(self, status, msg=""):
        """Write a simple response back to the client."""
        status = str(status)
        buf = [self.server.protocol + " " +
               status + "\r\n",
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
        
        buf.append("\r\n")
        if msg:
            if isinstance(msg, str):
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
            buf = [hex(len(chunk))[2:], "\r\n", chunk, "\r\n"]
            self.conn.wfile.sendall("".join(buf))
        else:
            self.conn.wfile.sendall(chunk)
    
    def send_headers(self):
        """Assert, process, and send the HTTP response message-headers.
        
        You must set self.status, and self.outheaders before calling this.
        """
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
            remaining = getattr(self.conn.rfile, 'remaining', 0)
            if remaining > 0:
                self.conn.rfile.read(remaining)
        
        if "date" not in hkeys:
            self.outheaders.append(("Date", rfc822.formatdate()))
        
        if "server" not in hkeys:
            self.outheaders.append(("Server", self.server.server_name))
        
        buf = [self.server.protocol + " " + self.status + "\r\n"]
        for k, v in self.outheaders:
            buf.append(k + ": " + v + "\r\n")
        buf.append("\r\n")
        self.conn.wfile.sendall("".join(buf))