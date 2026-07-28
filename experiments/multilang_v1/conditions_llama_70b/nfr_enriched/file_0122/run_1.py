class HTTPClient(basic.LineReceiver):
    # ...

    def connectionMade(self):
        """Initialize the connection."""
        self.__buffer = StringIO()
        self.firstLine = True
        self._header = b""

    # ...