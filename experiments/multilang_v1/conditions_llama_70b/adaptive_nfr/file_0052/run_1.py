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
    mrbs = 0
    if b"Content-Length" in inheaders:
        mrbs = int(inheaders.get(b"Content-Length", 0))
    return mrbs

def is_valid_response_protocol(response_protocol):
    """Check if the response protocol is valid."""
    return response_protocol and response_protocol == "HTTP/1.1"

def parse_response_protocol(response_protocol):
    """Parse the response protocol."""
    sp = int(response_protocol[5:6]), int(response_protocol[7:8])
    return sp

def is_valid_request_body_size(max_request_body_size, content_length):
    """Check if the request body size is valid."""
    return max_request_body_size == 0 or content_length <= max_request_body_size

def is_valid_chunked_transfer_encoding(te):
    """Check if the chunked transfer encoding is valid."""
    return te and b"chunked" in te

def parse_chunked_transfer_encoding(te):
    """Parse the chunked transfer encoding."""
    chunked_read = False
    for enc in te:
        if enc == b"chunked":
            chunked_read = True
        else:
            return False
    return chunked_read

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
        self.rfile = SizeCheckWrapper(self.conn.rfile,
                                      self.server.max_request_header_size)
        request_line = self.rfile.readline()
        if not is_valid_request_line(request_line):
            self.simple_response("400 Bad Request", "HTTP requires CRLF terminators")
            return
        
        method, uri, rp = parse_request_line(request_line)
        if not method or not uri or not rp:
            self.simple_response("400 Bad Request", "Malformed Request-Line")
            return
        
        if not is_valid_request_uri(uri):
            self.simple_response("400 Bad Request",
                                 "Illegal #fragment in Request-URI.")
            return
        
        scheme, authority, path = parse_request_uri(uri)
        if scheme:
            self.scheme = scheme
        
        qs = EMPTY
        if QUESTION_MARK in path:
            path, qs = path.split(QUESTION_MARK, 1)
        
        self.path = path
        self.qs = qs
        
        try:
            read_headers(self.rfile, self.inheaders)
        except ValueError:
            ex = sys.exc_info()[1]
            self.simple_response("400 Bad Request", ex.args[0])
            return
        
        mrbs = parse_request_headers(self.inheaders)
        if mrbs and self.server.max_request_body_size and mrbs > self.server.max_request_body_size:
            self.simple_response("413 Request Entity Too Large",
                "The entity sent with the request exceeds the maximum "
                "allowed bytes.")
            return
        
        if not is_valid_response_protocol(self.response_protocol):
            self.simple_response("505 HTTP Version Not Supported")
            return
        
        sp = parse_response_protocol(self.response_protocol)
        if sp[0] != rp[0]:
            self.simple_response("505 HTTP Version Not Supported")
            return
        
        self.response_protocol = "HTTP/%s.%s" % min(rp, sp)
        
        self.ready = True
    
    def respond(self):
        """Call the gateway and write its iterable output."""
        mrbs = self.server.max_request_body_size
        if self.chunked_read:
            self.rfile = ChunkedRFile(self.conn.rfile, mrbs)
        else:
            cl = int(self.inheaders.get(b"Content-Length", 0))
            if mrbs and mrbs < cl:
                if not self.sent_headers:
                    self.simple_response("413 Request Entity Too Large",
                        "The entity sent with the request exceeds the maximum "
                        "allowed bytes.")
                return
            self.rfile = KnownLengthRFile(self.conn.rfile, cl)
        
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
            self.close_connection = True
            if self.response_protocol == 'HTTP/1.1':
                buf.append(b"Connection: close\r\n")
            else:
                status = "400 Bad Request"
        
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
    
    def write(self, chunk):
        """Write unbuffered data to the client."""
        if self.chunked_write and chunk:
            buf = [bytes(hex(len(chunk)), 'ASCII')[2:], CRLF, chunk, CRLF]
            self.conn.wfile.write(EMPTY.join(buf))
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
    
    def close(self):
        """Close the socket underlying this connection."""
        self.rfile.close()
        if not self.linger:
            self.socket.close()
        else:
            pass

class WorkerThread(threading.Thread):
    """Thread which continuously polls a Queue for Connection objects."""
    
    def run(self):
        self.server.stats['Worker Threads'][self.getName()] = self.stats
        try:
            while True:
                conn = self.server.requests.get()
                if conn is _SHUTDOWNREQUEST:
                    return
                
                self.conn = conn
                try:
                    conn.communicate()
                finally:
                    conn.close()
                    self.conn = None
        except (KeyboardInterrupt, SystemExit):
            exc = sys.exc_info()[1]
            self.server.interrupt = exc

class ThreadPool(object):
    """A Request Queue for an HTTPServer which pools threads."""
    
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
                    if timeout is None or timeout < 0:
                        worker.join()
                    else:
                        remaining_time = endtime - time.time()
                        if remaining_time > 0:
                            worker.join(remaining_time)
                        if worker.isAlive():
                            worker.join()
                except (AssertionError,
                        KeyboardInterrupt):
                    pass
    
    def _get_qsize(self):
        return self._queue.qsize()
    qsize = property(_get_qsize)

class HTTPServer(object):
    """An HTTP server."""
    
    def start(self):
        """Run the server forever."""
        self._interrupt = None
        
        if self.software is None:
            self.software = "%s Server" % self.version
        
        info = [(socket.AF_UNIX, socket.SOCK_STREAM, 0, "", self.bind_addr)]
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
        
        self.socket.settimeout(1)
        self.socket.listen(self.request_queue_size)
        
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
    
    def stop(self):
        """Gracefully shutdown a server that is serving forever."""
        self.ready = False
        if self._start_time is not None:
            self._run_time += (time.time() - self._start_time)
        self._start_time = None
        
        sock = getattr(self, "socket", None)
        if sock:
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

class WSGIGateway_10(WSGIGateway):
    """A Gateway class to interface HTTPServer with WSGI 1.0.x."""
    
    def get_environ(self):
        """Return a new environ dict targeting the given wsgi.version"""
        req = self.req
        env = {
            'ACTUAL_SERVER_PROTOCOL': req.server.protocol,
            'PATH_INFO': req.path.decode('ISO-8859-1'),
            'QUERY_STRING': req.qs.decode('ISO-8859-1'),
            'REMOTE_ADDR': req.conn.remote_addr or '',
            'REMOTE_PORT': str(req.conn.remote_port or ''),
            'REQUEST_METHOD': req.method.decode('ISO-8859-1'),
            'REQUEST_URI': req.uri,
            'SCRIPT_NAME': '',
            'SERVER_NAME': req.server.server_name,
            'SERVER_PROTOCOL': req.request_protocol.decode('ISO-8859-1'),
            'SERVER_SOFTWARE': req.server.software,
            'wsgi.errors': sys.stderr,
            'wsgi.input': req.rfile,
            'wsgi.multiprocess': False,
            'wsgi.multithread': True,
            'wsgi.run_once': False,
            'wsgi.url_scheme': req.scheme.decode('ISO-8859-1'),
            'wsgi.version': (1, 0),
            }
        
        if isinstance(req.server.bind_addr, basestring):
            env["SERVER_PORT"] = ""
        else:
            env["SERVER_PORT"] = str(req.server.bind_addr[1])
        
        for k, v in req.inheaders.items():
            k = k.decode('ISO-8859-1').upper().replace("-", "_")
            env["HTTP_" + k] = v.decode('ISO-8859-1')
        
        ct = env.pop("HTTP_CONTENT_TYPE", None)
        if ct is not None:
            env["CONTENT_TYPE"] = ct
        cl = env.pop("HTTP_CONTENT_LENGTH", None)
        if cl is not None:
            env["CONTENT_LENGTH"] = cl
        
        if req.conn.ssl_env:
            env.update(req.conn.ssl_env)
        
        return env

wsgi_gateways = {
    (1, 0): WSGIGateway_10,
}

class WSGIPathInfoDispatcher(object):
    """A WSGI dispatcher for dispatch based on the PATH_INFO."""
    
    def __init__(self, apps):
        try:
            apps = list(apps.items())
        except AttributeError:
            pass
        
        apps.sort()
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