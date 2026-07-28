class HTTPPageGetter(http.HTTPClient):
    # ...

    def handleStatus_200(self):
        pass

    def handleStatus_201(self):
        self.handleStatus_200()

    def handleStatus_202(self):
        self.handleStatus_200()

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

    # ...

    def handleEndHeaders(self):
        self.factory.gotHeaders(self.headers)
        status_handler = {
            b'200': self.handleStatus_200,
            b'201': self.handleStatus_201,
            b'202': self.handleStatus_202,
            b'301': self.handleStatus_301,
            b'302': self.handleStatus_302,
            b'303': self.handleStatus_303,
        }.get(self.status, self.handleStatusDefault)
        status_handler()