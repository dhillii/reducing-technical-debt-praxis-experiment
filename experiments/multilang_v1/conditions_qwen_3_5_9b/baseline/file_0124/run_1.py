class PassportLogin(HTTPClient):
    """
    This class is used internally to obtain
    a login ticket from a passport HTTPS
    server -- it should not be used directly.
    """

    _finished = 0

    def __init__(self, deferred, userHandle, passwd, host, authData):
        self.deferred = deferred
        self.userHandle = userHandle
        self.passwd = passwd
        self.authData = authData
        self.host, self.path = _parsePrimitiveHost(host)

    def connectionMade(self):
        self.sendCommand('GET', self.path)
        self.sendHeader('Authorization', 'Passport1.4 OrgVerb=GET,OrgURL=http://messenger.msn.com,' +
                                         'sign-in=%s,pwd=%s,%s' % (quote(self.userHandle), self.passwd,self.authData))
        self.sendHeader('Host', self.host)
        self.endHeaders()
        self.headers = {}

    def handleHeader(self, header, value):
        h = header.lower()
        self.headers[h] = _parseHeader(h, value)

    def handleEndHeaders(self):
        if self._finished:
            return
        self._finished = 1 # I think we need this because of HTTPClient
        if self.connected:
            self.transport.loseConnection()
        authHeader = 'authentication-info'
        _interHeader = 'www-authenticate'
        if _interHeader in self.headers:
            authHeader = _interHeader
        try:
            info = self.headers[authHeader]
            status = info['da-status']
            handler = getattr(self, 'login_%s' % (status,), None)
            if handler:
                handler(info)
            else:
                raise Exception()
        except Exception, e:
            self.deferred.errback(failure.Failure(e))

    def handleResponse(self, r):
        # This method is intentionally empty.
        # HTTPClient's handleResponse is designed to handle the HTTP response body,
        # but for this Passport login flow, all necessary data is extracted from
        # the response headers in handleEndHeaders. The body is not used.
        pass

    def login_success(self, info):
        ticket = info['from-pp']
        ticket = ticket[1:len(ticket)-1]
        self.deferred.callback((LOGIN_SUCCESS, ticket))

    def login_failed(self, info):
        self.deferred.callback((LOGIN_FAILURE, unquote(info['cbtxt'])))

    def login_redir(self, info):
        self.deferred.callback((LOGIN_REDIRECT, self.headers['location'], self.authData))