class HTTPClient(basic.LineReceiver):
    """
    A client for HTTP 1.0.

    Notes:
    You probably want to send a 'Host' header with the name of the site you're
    connecting to, in order to not break name based virtual hosting.

    @ivar length: The length of the request body in bytes.
    @type length: C{int}

    @ivar firstLine: Are we waiting for the first header line?
    @type firstLine: C{bool}

    @ivar __buffer: The buffer that stores the response to the HTTP request.
    @type __buffer: A C{StringIO} object.

    @ivar _header: Part or all of an HTTP request header.
    @type _header: C{bytes}
    """
    length = None
    firstLine = True
    __buffer = None
    _header = b""

    def sendCommand(self, command, path):
        self.transport.writeSequence([command, b' ', path, b' HTTP/1.0\r\n'])

    def sendHeader(self, name, value):
        if not isinstance(value, bytes):
            # XXX Deprecate this case
            value = networkString(str(value))
        self.transport.writeSequence([name, b': ', value, b'\r\n'])

    def endHeaders(self):
        self.transport.write(b'\r\n')

    def extractHeader(self, header):
        """
        Given a complete HTTP header, extract the field name and value and
        process the header.

        @param header: a complete HTTP request header of the form
            'field-name: value'.
        @type header: C{bytes}
        """
        key, val = header.split(b':', 1)
        val = val.lstrip()
        self.handleHeader(key, val)
        if key.lower() == b'content-length':
            self.length = int(val)

    def lineReceived(self, line):
        """
        Parse the status line and headers for an HTTP request.

        @param line: Part of an HTTP request header. Request bodies are parsed
            in L{rawDataReceived}.
        @type line: C{bytes}
        """
        if self.firstLine:
            self.firstLine = False
            l = line.split(None, 2)
            version = l[0]
            status = l[1]
            try:
                message = l[2]
            except IndexError:
                # sometimes there is no message
                message = b""
            self.handleStatus(version, status, message)
            return
        if not line:
            if self._header != b"":
                # Only extract headers if there are any
                self.extractHeader(self._header)
            self.__buffer = StringIO()
            self.handleEndHeaders()
            self.setRawMode()
            return

        if line.startswith(b'\t') or line.startswith(b' '):
            # This line is part of a multiline header. According to RFC 822, in
            # "unfolding" multiline headers you do not strip the leading
            # whitespace on the continuing line.
            self._header = self._header + line
        elif self._header:
            # This line starts a new header, so process the previous one.
            self.extractHeader(self._header)
            self._header = line
        else: # First header
            self._header = line

    def connectionLost(self, reason):
        self.handleResponseEnd()

    def handleResponseEnd(self):
        """
        The response has been completely received.

        This callback may be invoked more than once per request.
        """
        if self.__buffer is not None:
            b = self.__buffer.getvalue()
            self.__buffer = None
            self.handleResponse(b)

    def handleResponsePart(self, data):
        self.__buffer.write(data)

    def connectionMade(self):
        """
        Called when the connection is established.  No action is required
        for the base HTTPClient; subclasses may override this method if
        they need to perform initialization when the connection is made.
        """
        pass

    def handleStatus(self, version, status, message):
        """
        Called when the status-line is received.

        @param version: e.g. 'HTTP/1.0'
        @param status: e.g. '200'
        @type status: C{bytes}
        @param message: e.g. 'OK'
        """
        pass

    def handleHeader(self, key, val):
        """
        Called every time a header is received.
        """
        pass

    def handleEndHeaders(self):
        """
        Called when all headers have been received.
        """
        pass

    def rawDataReceived(self, data):
        if self.length is not None:
            data, rest = data[:self.length], data[self.length:]
            self.length -= len(data)
        else:
            rest = b''
        self.handleResponsePart(data)
        if self.length == 0:
            self.handleResponseEnd()
            self.setLineMode(rest)