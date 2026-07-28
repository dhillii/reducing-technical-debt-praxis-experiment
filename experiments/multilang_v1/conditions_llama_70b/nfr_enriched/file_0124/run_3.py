class PassportNexus(HTTPClient):
    # ...

    def handleResponse(self, r):
        """Handle the response from the server."""
        if self.connected:
            self.transport.loseConnection()
        if 'passporturls' not in self.headers or 'dalogin' not in self.headers['passporturls']:
            self.deferred.errback(failure.Failure(failure.DefaultException("Invalid Nexus Reply")))
        self.deferred.callback('https://' + self.headers['passporturls']['dalogin'])

class PassportLogin(HTTPClient):
    # ...

    def handleResponse(self, r):
        """Handle the response from the server."""
        if self._finished:
            return
        self._finished = 1 
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