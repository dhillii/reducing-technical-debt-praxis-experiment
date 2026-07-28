class HTTPPageGetter(http.HTTPClient):
    """
    Gets a resource via HTTP, then quits.

    Typically used with L{HTTPClientFactory}.  Note that this class does not, by
    itself, do anything with the response.  If you want to download a resource
    into a file, use L{HTTPPageDownloader} instead.

    @ivar _completelyDone: A boolean indicating whether any further requests are
        necessary after this one completes in order to provide a result to
        C{self.factory.deferred}.  If it is C{False}, then a redirect is going
        to be followed.  Otherwise, this protocol's connection is the last one
        before firing the result Deferred.  This is used to make sure the result
        Deferred is only fired after the connection is cleaned up.
    """

    quietLoss = 0
    followRedirect = True
    failed = 0

    _completelyDone = True

    _specialHeaders = set((b'host', b'user-agent', b'cookie', b'content-length'))

    def connectionMade(self):
        method = getattr(self.factory, 'method', b'GET')
        self.sendCommand(method, self.factory.path)
        if self.factory.scheme == b'http' and self.factory.port != 80:
            host = self.factory.host + b':' + intToBytes(self.factory.port)
        elif self.factory.scheme == b'https' and self.factory.port != 443:
            host = self.factory.host + b':' + intToBytes(self.factory.port)
        else:
            host = self.factory.host
        self.sendHeader(b'Host', self.factory.headers.get(b"host", host))
        self.sendHeader(b'User-Agent', self.factory.agent)
        data = getattr(self.factory, 'postdata', None)
        if data is not None:
            self.sendHeader(b"Content-Length", intToBytes(len(data)))

        cookieData = []
        for (key, value) in self.factory.headers.items():
            if key.lower() not in self._specialHeaders:
                # we calculated it on our own
                self.sendHeader(key, value)
            if key.lower() == b'cookie':
                cookieData.append(value)
        for cookie, cookval in self.factory.cookies.items():
            cookieData.append(cookie + b'=' + cookval)
        if cookieData:
            self.sendHeader(b'Cookie', b'; '.join(cookieData))
        self.endHeaders()
        self.headers = {}

        if data is not None:
            self.transport.write(data)

    def handleHeader(self, key, value):
        """
        Called every time a header is received. Stores the header information
        as key-value pairs in the C{headers} attribute.

        @type key: C{str}
        @param key: An HTTP header field name.

        @type value: C{str}
        @param value: An HTTP header field value.
        """
        key = key.lower()
        l = self.headers.setdefault(key, [])
        l.append(value)

    def handleStatus(self, version, status, message):
        self.version, self.status, self.message = version, status, message
        self.factory.gotStatus(version, status, message)

    def handleEndHeaders(self):
        self.factory.gotHeaders(self.headers)
        m = getattr(self, 'handleStatus_' + nativeString(self.status),
                    self.handleStatusDefault)
        m()

    def _handleStatus200(self):
        """Handle HTTP status 200."""
        pass

    def _handleStatus201(self):
        """Handle HTTP status 201."""
        self._handleStatus200()

    def _handleStatus202(self):
        """Handle HTTP status 202."""
        self._handleStatus200()

    def handleStatusDefault(self):
        self.failed = 1

    def handleStatus_301(self):
        l = self.headers.get(b'location')
        if not l:
            self.handleStatusDefault()
            return
        url = l[0]
        if self.followRedirect:
            self.factory._redirectCount += 1
            if self.factory._redirectCount >= self.factory.redirectLimit:
                err = error.InfiniteRedirection(
                    self.status,
                    'Infinite redirection detected',
                    location=url)
                self.factory.noPage(Failure(err))
                self.quietLoss = True
                self.transport.loseConnection()
                return

            self._completelyDone = False
            self.factory.setURL(url)

            if self.factory.scheme == b'https':
                from twisted.internet import ssl
                contextFactory = ssl.ClientContextFactory()
                reactor.connectSSL(nativeString(self.factory.host),
                                   self.factory.port,
                                   self.factory, contextFactory)
            else:
                reactor.connectTCP(nativeString(self.factory.host),
                                   self.factory.port,
                                   self.factory)
        else:
            self.handleStatusDefault()
            self.factory.noPage(
                Failure(
                    error.PageRedirect(
                        self.status, self.message, location = url)))
        self.quietLoss = True
        self.transport.loseConnection()

    def handleStatus_302(self):
        if self.afterFoundGet:
            self.handleStatus_303()
        else:
            self.handleStatus_301()


    def handleStatus_303(self):
        self.factory.method = b'GET'
        self.handleStatus_301()


    def connectionLost(self, reason):
        """
        When the connection used to issue the HTTP request is closed, notify the
        factory if we have not already, so it can produce a result.
        """
        if not self.quietLoss:
            http.HTTPClient.connectionLost(self, reason)
            self.factory.noPage(reason)
        if self._completelyDone:
            # Only if we think we're completely done do we tell the factory that
            # we're "disconnected".  This way when we're following redirects,
            # only the last protocol used will fire the _disconnectedDeferred.
            self.factory._disconnectedDeferred.callback(None)


    def handleResponse(self, response):
        if self.quietLoss:
            return
        if self.failed:
            self.factory.noPage(
                Failure(
                    error.Error(
                        self.status, self.message, response)))
        if self.factory.method == b'HEAD':
            # Callback with empty string, since there is never a response
            # body for HEAD requests.
            self.factory.page(b'')
        elif self.length != None and self.length != 0:
            self.factory.noPage(Failure(
                PartialDownloadError(self.status, self.message, response)))
        else:
            self.factory.page(response)
        # server might be stupid and not close connection. admittedly
        # the fact we do only one request per connection is also
        # stupid...
        self.transport.loseConnection()

    def timeout(self):
        self.quietLoss = True
        self.transport.loseConnection()
        self.factory.noPage(defer.TimeoutError("Getting %s took longer than %s seconds." % (self.factory.url, self.factory.timeout)))

    handleStatus_200 = _handleStatus200
    handleStatus_201 = _handleStatus201
    handleStatus_202 = _handleStatus202