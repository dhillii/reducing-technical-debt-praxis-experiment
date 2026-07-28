class HTTPRequest(object):
    """An HTTP Request (and response).
    
    A single HTTP connection may consist of multiple request/response pairs.
    """
    
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
        self.close_connection = False
        self.chunked_read = False
        self.chunked_write = False
    
    def _parse_request_line(self):
        """Parse the next HTTP request start-line."""
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
            self.simple_response("400 Bad Request", "HTTP requires CRLF terminators")
            return False
        
        try:
            method, uri, req_protocol = request_line.strip().split(" ", 2)
            rp = int(req_protocol[5]), int(req_protocol[7])
        except (ValueError, IndexError):
            self.simple_response("400 Bad Request", "Malformed Request-Line")
            return False
        
        self.uri = uri
        self.method = method
        
        # uri may be an abs_path (including "http://host.domain.tld");
        scheme, authority, path = self._parse_request_uri(uri)
        if "#" in path:
            self.simple_response("400 Bad Request",
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
            atoms = [unquote(x) for x in re.compile("(?i)%2F").split(path)]
        except ValueError:
            ex = sys.exc_info()[1]
            self.simple_response("400 Bad Request", ex.args[0])
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
            self.simple_response("505 HTTP Version Not Supported")
            return False

        self.request_protocol = req_protocol
        self.response_protocol = "HTTP/%s.%s" % min(rp, sp)

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

    def _read_request_headers(self):
        """Read self.rfile into self.inheaders. Return success."""
        
        # then all the http headers
        try:
            read_headers(self.conn.rfile, self.inheaders)
        except ValueError:
            ex = sys.exc_info()[1]
            self.simple_response("400 Bad Request", ex.args[0])
            return False
        
        mrbs = self.server.max_request_body_size
        if mrbs and int(self.inheaders.get("Content-Length", 0)) > mrbs:
            self.simple_response("413 Request Entity Too Large",
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
                    self.simple_response("501 Unimplemented")
                    self.close_connection = True
                    return False
        
        return True

    def parse_request(self):
        """Parse the next HTTP request start-line and message-headers."""
        self.rfile = SizeCheckWrapper(self.conn.rfile,
                                      self.server.max_request_header_size)
        try:
            success = self._parse_request_line()
        except MaxSizeExceeded:
            self.simple_response("414 Request-URI Too Long",
                "The Request-URI sent with the request exceeds the maximum "
                "allowed bytes.")
            return
        else:
            if not success:
                return
        
        try:
            success = self._read_request_headers()
        except MaxSizeExceeded:
            self.simple_response("413 Request Entity Too Large",
                "The headers sent with the request exceed the maximum "
                "allowed bytes.")
            return
        else:
            if not success:
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
            remaining = getattr(self.rfile, 'remaining', 0)
            if remaining > 0:
                self.rfile.read(remaining)
        
        if "date" not in hkeys:
            self.outheaders.append(("Date", rfc822.formatdate()))
        
        if "server" not in hkeys:
            self.outheaders.append(("Server", self.server.server_name))
        
        buf = [self.server.protocol + " " + self.status + "\r\n"]
        for k, v in self.outheaders:
            buf.append(k + ": " + v + "\r\n")
        buf.append("\r\n")
        self.conn.wfile.sendall("".join(buf))

class HTTPConnection(object):
    """An HTTP connection (active socket).
    
    server: the Server object which received this connection.
    socket: the raw socket object (usually TCP) for this connection.
    makefile: a fileobject class for reading from the socket.
    """
    
    def communicate(self):
        """Read each request and respond appropriately."""
        request_seen = False
        try:
            while True:
                # (re)set req to None so that if something goes wrong in
                # the RequestHandlerClass constructor, the error doesn't
                # get written to the previous request.
                req = None
                req = self.RequestHandlerClass(self.server, self)
                
                # This order of operations should guarantee correct pipelining.
                req.parse_request()
                if self.server.stats['Enabled']:
                    self.requests_seen += 1
                if not req.ready:
                    # Something went wrong in the parsing (and the server has
                    # probably already made a simple_response). Return and
                    # let the conn close.
                    return
                
                request_seen = True
                req.respond()
                if req.close_connection:
                    return
        except socket.error:
            e = sys.exc_info()[1]
            errnum = e.args[0]
            # sadly SSL sockets return a different (longer) time out string
            if errnum == 'timed out' or errnum == 'The read operation timed out':
                # Don't error if we're between requests; only error
                # if 1) no request has been started at all, or 2) we're
                # in the middle of a request.
                # See http://www.cherrypy.org/ticket/853
                if (not request_seen) or (req and req.started_request):
                    # Don't bother writing the 408 if the response
                    # has already started being written.
                    if req and not req.sent_headers:
                        try:
                            req.simple_response("408 Request Timeout")
                        except FatalSSLAlert:
                            # Close the connection.
                            return
            elif errnum not in socket_errors_to_ignore:
                self.server.error_log("socket.error %s" % repr(errnum),
                                      level=logging.WARNING, traceback=True)
                if req and not req.sent_headers:
                    try:
                        req.simple_response("500 Internal Server Error")
                    except FatalSSLAlert:
                        # Close the connection.
                        return
            return
        except (KeyboardInterrupt, SystemExit):
            raise
        except FatalSSLAlert:
            # Close the connection.
            return
        except NoSSLError:
            if req and not req.sent_headers:
                # Unwrap our wfile
                self.wfile = CP_fileobject(self.socket._sock, "wb", self.wbufsize)
                req.simple_response("400 Bad Request",
                    "The client sent a plain HTTP request, but "
                    "this server only speaks HTTPS on this port.")
                self.linger = True
        except Exception:
            e = sys.exc_info()[1]
            self.server.error_log(repr(e), level=logging.ERROR, traceback=True)
            if req and not req.sent_headers:
                try:
                    req.simple_response("500 Internal Server Error")
                except FatalSSLAlert:
                    # Close the connection.
                    return
    
    def close(self):
        """Close the socket underlying this connection."""
        self.rfile.close()
        
        if not self.linger:
            # Python's socket module does NOT call close on the kernel socket
            # when you call socket.close(). We do so manually here because we
            # want this server to send a FIN TCP segment immediately. Note this
            # must be called *before* calling socket.close(), because the latter
            # drops its reference to the kernel socket.
            if hasattr(self.socket, '_sock'):
                self.socket._sock.close()
            self.socket.close()
        else:
            # On the other hand, sometimes we want to hang around for a bit
            # to make sure the client has a chance to read our entire
            # response. Skipping the close() calls here delays the FIN
            # packet until the socket object is garbage-collected later.
            # Someday, perhaps, we'll do the full lingering_close that
            # Apache does, but not today.
            pass

class HTTPServer(object):
    """An HTTP server."""
    
    def start(self):
        """Run the server forever."""
        # We don't have to trap KeyboardInterrupt or SystemExit here,
        # because cherrpy.server already does so, calling self.stop() for us.
        # If you're using this server with another framework, you should
        # trap those exceptions in whatever code block calls start().
        self._interrupt = None
        
        if self.software is None:
            self.software = "%s Server" % self.version
        
        # SSL backward compatibility
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
        
        # Select the appropriate socket
        if isinstance(self.bind_addr, basestring):
            # AF_UNIX socket
            
            # So we can reuse the socket...
            try: os.unlink(self.bind_addr)
            except: pass
            
            # So everyone can access the socket...
            try: os.chmod(self.bind_addr, 511) # 0777
            except: pass
            
            info = [(socket.AF_UNIX, socket.SOCK_STREAM, 0, "", self.bind_addr)]
        else:
            # AF_INET or AF_INET6 socket
            # Get the correct address family for our host (allows IPv6 addresses)
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
        
        # Timeout so KeyboardInterrupt can be caught on Win32
        self.socket.settimeout(1)
        self.socket.listen(self.request_queue_size)
        
        # Create worker threads
        self.requests.start()
        
        self.ready = True
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
                    # Wait for self.stop() to complete. See _set_interrupt.
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
            
            makefile = CP_fileobject
            ssl_env = {}
            # if ssl cert and key are set, we try to be a secure HTTP server
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
                        wfile.sendall("".join(buf))
                    except socket.error:
                        x = sys.exc_info()[1]
                        if x.args[0] not in socket_errors_to_ignore:
                            raise
                    return
                if not s:
                    return
                makefile = self.ssl_adapter.makefile
                # Re-apply our timeout since we may have a new socket object
                if hasattr(s, 'settimeout'):
                    s.settimeout(self.timeout)
            
            conn = self.ConnectionClass(self, s, makefile)
            
            if not isinstance(self.bind_addr, basestring):
                # optional values
                # Until we do DNS lookups, omit REMOTE_HOST
                if addr is None: # sometimes this can happen
                    # figure out if AF_INET or AF_INET6.
                    if len(s.getsockname()) == 2:
                        # AF_INET
                        addr = ('0.0.0.0', 0)
                    else:
                        # AF_INET6
                        addr = ('::', 0)
                conn.remote_addr = addr[0]
                conn.remote_port = addr[1]
            
            conn.ssl_env = ssl_env
            
            self.requests.put(conn)
        except socket.timeout:
            # The only reason for the timeout in start() is so we can
            # notice keyboard interrupts on Win32, which don't interrupt
            # accept() by default
            return
        except socket.error:
            x = sys.exc_info()[1]
            if self.stats['Enabled']:
                self.stats['Socket Errors'] += 1
            if x.args[0] in socket_error_eintr:
                # I *think* this is right. EINTR should occur when a signal
                # is received during the accept() call; all docs say retry
                # the call, and I *think* I'm reading it right that Python
                # will then go ahead and poll for and handle the signal
                # elsewhere. See http://www.cherrypy.org/ticket/707.
                return
            if x.args[0] in socket_errors_nonblocking:
                # Just try again. See http://www.cherrypy.org/ticket/479.
                return
            if x.args[0] in socket_errors_to_ignore:
                # Our socket was closed.
                # See http://www.cherrypy.org/ticket/686.
                return
            raise
    
    def stop(self):
        """Gracefully shutdown a server that is serving forever."""
        self.ready = False
        if self._start_time is not None:
            self._run_time += (time.time() - self._start_time)
        self._start_time = None
        
        sock = getattr(self, "socket", None)
        if sock:
            if not isinstance(self.bind_addr, basestring):
                # Touch our own socket to make accept() return immediately.
                try:
                    host, port = sock.getsockname()[:2]
                except socket.error:
                    x = sys.exc_info()[1]
                    if x.args[0] not in socket_errors_to_ignore:
                        # Changed to use error code and not message
                        # See http://www.cherrypy.org/ticket/860.
                        raise
                else:
                    # Note that we're explicitly NOT using AI_PASSIVE,
                    # here, because we want an actual IP to touch.
                    # localhost won't work if we've bound to a public IP,
                    # but it will if we bound to '0.0.0.0' (INADDR_ANY).
                    for res in socket.getaddrinfo(host, port, socket.AF_UNSPEC,
                                                  socket.SOCK_STREAM):
                        af, socktype, proto, canonname, sa = res
                        s = None
                        try:
                            s = socket.socket(af, socktype, proto)
                            # See http://groups.google.com/group/cherrypy-users/
                            #        browse_frm/thread/bbfe5eb39c904fe0
                            s.settimeout(1.0)
                            s.connect((host, port))
                            s.close()
                        except socket.error:
                            if s:
                                s.close()
            if hasattr(sock, "close"):
                sock.close()
            self.socket = None
        
        self.requests.stop(self.shutdown_timeout)

class CherryPyWSGIServer(HTTPServer):
    """A subclass of HTTPServer which calls a WSGI application."""
    
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
                # "The start_response callable must not actually transmit
                # the response headers. Instead, it must store them for the
                # server or gateway to transmit only after the first
                # iteration of the application return value that yields
                # a NON-EMPTY string, or upon the application's first
                # invocation of the write() callable." (PEP 333)
                if chunk:
                    if isinstance(chunk, str):
                        chunk = chunk.encode('ISO-8859-1')
                    self.write(chunk)
        finally:
            if hasattr(response, "close"):
                response.close()
    
    def start_response(self, status, headers, exc_info = None):
        """WSGI callable to begin the HTTP response."""
        # "The application may call start_response more than once,
        # if and only if the exc_info argument is provided."
        if self.started_response and not exc_info:
            raise AssertionError("WSGI start_response called a second "
                                 "time with no exc_info.")
        self.started_response = True
        
        # "if exc_info is provided, and the HTTP headers have already been
        # sent, start_response must raise an error, and should raise the
        # exc_info tuple."
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
                # Whew. We can send a 500 to the client.
                self.req.simple_response("500 Internal Server Error",
                    "The requested resource returned more bytes than the "
                    "declared Content-Length.")
            else:
                # Dang. We have probably already sent data. Truncate the chunk
                # to fit (so the client doesn't hang) and raise an error later.
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
            # set a non-standard environ entry so the WSGI app can know what
            # the *real* server protocol is (and what features to support).
            # See http://www.faqs.org/rfcs/rfc2145.html.
            'ACTUAL_SERVER_PROTOCOL': req.server.protocol,
            'PATH_INFO': req.path,
            'QUERY_STRING': req.qs,
            'REMOTE_ADDR': req.conn.remote_addr or '',
            'REMOTE_PORT': str(req.conn.remote_port or ''),
            'REQUEST_METHOD': req.method,
            'REQUEST_URI': req.uri,
            'SCRIPT_NAME': '',
            'SERVER_NAME': req.server.server_name,
            # Bah. "SERVER_PROTOCOL" is actually the REQUEST protocol.
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
            # AF_UNIX. This isn't really allowed by WSGI, which doesn't
            # address unix domain sockets. But it's better than nothing.
            env["SERVER_PORT"] = ""
        else:
            env["SERVER_PORT"] = str(req.server.bind_addr[1])
        
        # Request headers
        for k, v in req.inheaders.iteritems():
            env["HTTP_" + k.upper().replace("-", "_")] = v
        
        # CONTENT_TYPE/CONTENT_LENGTH
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
        
        # Request-URI
        env.setdefault(u'wsgi.url_encoding', u'utf-8')
        try:
            for key in [u"PATH_INFO", u"SCRIPT_NAME", u"QUERY_STRING"]:
                env[key] = env_10[str(key)].decode(env[u'wsgi.url_encoding'])
        except UnicodeDecodeError:
            # Fall back to latin 1 so apps can transcode if needed.
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
        
        # Sort the apps by len(path), descending
        apps.sort(cmp=lambda x,y: cmp(len(x[0]), len(y[0])))
        apps.reverse()
        
        # The path_prefix strings must start, but not end, with a slash.
        # Use "" instead of "/".
        self.apps = [(p.rstrip("/"), a) for p, a in apps]
    
    def __call__(self, environ, start_response):
        path = environ["PATH_INFO"] or "/"
        for p, app in self.apps:
            # The apps list should be sorted by length, descending.
            if path.startswith(p + "/") or path == p:
                environ = environ.copy()
                environ["SCRIPT_NAME"] = environ["SCRIPT_NAME"] + p
                environ["PATH_INFO"] = path[len(p):]
                return app(environ, start_response)
        
        start_response('404 Not Found', [('Content-Type', 'text/plain'),
                                         ('Content-Length', '0')])
        return ['']

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
            # The last [''] is important.
            mod = __import__(mod_path, globals(), locals(), [''])
        
        # Let an AttributeError propagate outward.
        try:
            adapter = getattr(mod, attr_name)
        except AttributeError:
            raise AttributeError("'%s' object has no attribute '%s'"
                                 % (mod_path, attr_name))
    
    return adapter