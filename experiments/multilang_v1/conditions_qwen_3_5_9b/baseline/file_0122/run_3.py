def handleResponsePart(self, data):
    """
    Write the received data to the response buffer.

    This method accumulates the response body data in the internal buffer
    until the response is complete, at which point handleResponseEnd is
    called to process the full response.
    """
    self.__buffer.write(data)

    def connectionMade(self):
        pass

    def handleStatus(self, version, status, message):