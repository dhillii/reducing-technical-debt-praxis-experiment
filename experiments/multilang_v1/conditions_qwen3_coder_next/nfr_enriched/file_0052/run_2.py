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
    
    def __init__(self, server, sock, makefile=CP_makefile):
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
                req = self._create_request_handler()
                if not self._process_request(req, request_seen):
                    return
                request_seen = True
                self._handle_request_response(req)
                if req.close_connection:
                    return
        except socket.error:
            self._handle_socket_error(request_seen)
        except (KeyboardInterrupt, SystemExit):
            raise
        except FatalSSLAlert:
            return
        except NoSSLError:
            self._handle_no_ssl_error()
        except Exception:
            self._handle_generic_exception()

    def _create_request_handler(self):
        """Create and return a fresh HTTPRequest instance."""
        return self.RequestHandlerClass(self.server, self)

    def _process_request(self, req, request_seen):
        """Parse the request and return whether parsing succeeded."""
        req.parse_request()
        if self.server.stats['Enabled']:
            self.requests_seen += 1
        return req.ready

    def _handle_request_response(self, req):
        """Handle a single HTTP request-response cycle."""
        req.respond()
        if getattr(req, 'ready', False) and not getattr(req, 'sent_headers', False):
            req.sent_headers = True
            req.send_headers()
        if getattr(req, 'chunked_write', False):
            self.wfile.write(b"0\r\n\r\n")

    def _handle_socket_error(self, request_seen):
        """Handle socket errors during request processing."""
        e = sys.exc_info()[1]
        errnum = e.args[0]
        timeout_error = errnum == 'timed out' or errnum == 'The read operation timed out'
        if timeout_error:
            # Don't error if we're between requests
            if (not request_seen) or (hasattr(self, 'req') and self.req and getattr(self.req, 'started_request', False)):
                self._write_timeout_response(request_seen)
        elif errnum not in socket_errors_to_ignore:
            self.server.error_log("socket.error %s" % repr(errnum),
                                  level=logging.WARNING, traceback=True)
            req = getattr(self, 'req', None)
            self._write_500_if_needed(req)
        return

    def _write_timeout_response(self, request_seen):
        """Write a 408 Timeout response if possible."""
        req = getattr(self, 'req', None)
        if req and not getattr(req, 'sent_headers', False):
            try:
                req.simple_response("408 Request Timeout")
            except FatalSSLAlert:
                return

    def _handle_generic_exception(self):
        """Handle generic exceptions and emit 500 response if needed."""
        e = sys.exc_info()[1]
        self.server.error_log(repr(e), level=logging.ERROR, traceback=True)
        req = getattr(self, 'req', None)
        self._write_500_if_needed(req)

    def _write_500_if_needed(self, req):
        """Write a 500 Internal Server Error if headers haven't been sent."""
        if req and not getattr(req, 'sent_headers', False):
            try:
                req.simple_response("500 Internal Server Error")
            except FatalSSLAlert:
                pass

    def _handle_no_ssl_error(self):
        """Handle case where client sends plain HTTP to HTTPS port."""
        req = getattr(self, 'req', None)
        if req and not getattr(req, 'sent_headers', False):
            self.wfile = CP_makefile(self.socket._sock, "wb", self.wbufsize)
            req.simple_response("400 Bad Request",
                "The client sent a plain HTTP request, but "
                "this server only speaks HTTPS on this port.")
            self.linger = True

    linger = False
    
    def close(self):
        """Close the socket underlying this connection."""
        self.rfile.close()
        
        if not self.linger:
            self.socket.close()
        else:
            pass


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
        # Grow/shrink the pool if necessary.
        # Remove any dead threads from our list
        for t in self._threads:
            if not t.isAlive():
                self._threads.remove(t)
                amount -= 1
        
        if amount > 0:
            for i in range(min(amount, len(self._threads) - self.min)):
                self._queue.put(_SHUTDOWNREQUEST)
    
    def stop(self, timeout=5):
        # Must shut down threads here so the code that calls
        # this method can know when all threads are stopped.
        for worker in self._threads:
            self._queue.put(_SHUTDOWNREQUEST)
        
        # Don't join currentThread (when stop is called inside a request).
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
                            # We exhausted the timeout.
                            # Forcibly shut down the socket.
                            c = worker.conn
                            if c and not c.rfile.closed:
                                try:
                                    c.socket.shutdown(socket.SHUT_RD)
                                except TypeError:
                                    # pyOpenSSL sockets don't take an arg
                                    c.socket.shutdown()
                            worker.join()
                except (AssertionError,
                        # Ignore repeated Ctrl-C.
                        # See http://www.cherrypy.org/ticket/691.
                        KeyboardInterrupt):
                    pass
    
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
            # Despite the socket module docs, using '' does not
            # allow AI_PASSIVE to work. Passing None instead
            # returns '0.0.0.0' like we want. In other words:
            #     host    AI_PASSIVE     result
            #      ''         Y         192.168.x.y
            #      ''         N         192.168.x.y
            #     None        Y         0.0.0.0
            #     None        N         127.0.0.1
            # But since you can get the same effect with an explicit
            # '0.0.0.0', we deny both the empty string and None as values.
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
        # We don't have to trap KeyboardInterrupt or SystemExit here,
        # because cherrpy.server already does so, calling self.stop() for us.
        # If you're using this server with another framework, you should
        # trap those exceptions in whatever code block calls start().
        self._interrupt = None
        
        if self.software is None:
            self.software = "%s Server" % self.version
        
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

    def error_log(self, msg="", level=20, traceback=False):
        # Override this in subclasses as desired
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
        
        # If listening on the IPV6 any address ('::' = IN6ADDR_ANY),
        # activate dual-stack. See http://www.cherrypy.org/ticket/871.
        if (hasattr(socket, 'AF_INET6') and family == socket.AF_INET6
            and self.bind_addr[0] in ('::', '::0', '::0.0.0.0')):
            try:
                self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
            except (AttributeError, socket.error):
                # Apparently, the socket option is not available in
                # this machine's TCP stack
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
            
            makefile = CP_makefile
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
                        wfile.write("".join(buf).encode('ISO-8859-1'))
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


class Gateway(object):
    """A base class to interface HTTPServer with other systems, such as WSGI."""
    
    def __init__(self, req):
        self.req = req
    
    def respond(self):
        """Process the current request. Must be overridden in a subclass."""
        raise NotImplemented


# These may either be wsgiserver.SSLAdapter subclasses or the string names
# of such classes (in which case they will be lazily loaded).
ssl_adapters = {
    'builtin': 'cherrypy.wsgiserver.ssl_builtin.BuiltinSSLAdapter',
    }

def get_ssl_adapter_class(name='builtin'):
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

# -------------------------------- WSGI Stuff -------------------------------- #


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
                # "The start_response callable must not actually transmit
                # the response headers. Instead, it must store them for the
                # server or gateway to transmit only after the first
                # iteration of the application return value that yields
                # a NON-EMPTY string, or upon the application's first
                # invocation of the write() callable." (PEP 333)
                if chunk:
                    if isinstance(chunk, unicodestr):
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
                raise exc_info[0](exc_info[1]).with_traceback(exc_info[2])
            finally:
                exc_info = None

        # According to PEP 3333, when using Python 3, the response status
        # and headers must be bytes masquerading as unicode; that is, they
        # must be of type "str" but are restricted to code points in the
        # "latin-1" set.
        if not isinstance(status, str):
            raise TypeError("WSGI response status is not of type str.")
        self.req.status = status.encode('ISO-8859-1')

        for k, v in headers:
            if not isinstance(k, str):
                raise TypeError("WSGI response header key %r is not of type str." % k)
            if not isinstance(v, str):
                raise TypeError("WSGI response header value %r is not of type str." % v)
            if k.lower() == 'content-length':
                self.remaining_bytes_out = int(v)
            self.req.outheaders.append((k.encode('ISO-8859-1'), v.encode('ISO-8859-1')))
        
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
            'PATH_INFO': req.path.decode('ISO-8859-1'),
            'QUERY_STRING': req.qs.decode('ISO-8859-1'),
            'REMOTE_ADDR': req.conn.remote_addr or '',
            'REMOTE_PORT': str(req.conn.remote_port or ''),
            'REQUEST_METHOD': req.method.decode('ISO-8859-1'),
            'REQUEST_URI': req.uri,
            'SCRIPT_NAME': '',
            'SERVER_NAME': req.server.server_name,
            # Bah. "SERVER_PROTOCOL" is actually the REQUEST protocol.
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
            # AF_UNIX. This isn't really allowed by WSGI, which doesn't
            # address unix domain sockets. But it's better than nothing.
            env["SERVER_PORT"] = ""
        else:
            env["SERVER_PORT"] = str(req.server.bind_addr[1])
        
        # Request headers
        for k, v in req.inheaders.items():
            k = k.decode('ISO-8859-1').upper().replace("-", "_")
            env["HTTP_" + k] = v.decode('ISO-8859-1')
        
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
        env = env_10.copy()
        env['wsgi.version'] = ('u', 0)
        
        # Request-URI
        env.setdefault('wsgi.url_encoding', 'utf-8')
        try:
            # SCRIPT_NAME is the empty string, who cares what encoding it is?
            env["PATH_INFO"] = req.path.decode(env['wsgi.url_encoding'])
            env["QUERY_STRING"] = req.qs.decode(env['wsgi.url_encoding'])
        except UnicodeDecodeError:
            # Fall back to latin 1 so apps can transcode if needed.
            env['wsgi.url_encoding'] = 'ISO-8859-1'
            env["PATH_INFO"] = env_10["PATH_INFO"]
            env["QUERY_STRING"] = env_10["QUERY_STRING"]
        
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
        apps.sort()
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