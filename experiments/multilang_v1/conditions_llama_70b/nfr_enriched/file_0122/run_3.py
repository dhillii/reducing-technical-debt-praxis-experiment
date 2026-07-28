class HTTPClient(basic.LineReceiver):
    # ...

    def connectionMade(self):
        """Initialize the connection."""
        self.__buffer = StringIO()
        self.firstLine = True
        self._header = b""

    # ...


class Request:
    # ...

    def connectionLost(self, reason):
        """Handle connection loss."""
        self._disconnected = True
        self.channel = None
        if self.content is not None:
            self.content.close()
        for d in self.notifications:
            d.errback(reason)
        self.notifications = []

    # ...


class HTTPChannel(basic.LineReceiver, policies.TimeoutMixin):
    # ...

    def connectionMade(self):
        """Initialize the connection."""
        self.setTimeout(self.timeOut)
        self.requests = []
        self._transferDecoder = None

    # ...

    def connectionLost(self, reason):
        """Handle connection loss."""
        self.setTimeout(None)
        for request in self.requests:
            request.connectionLost(reason)

    # ...