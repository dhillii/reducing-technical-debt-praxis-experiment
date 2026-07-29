def connectionMade(self):
        # This method is intentionally left empty because HTTPClient
        # does not need to perform any action when the connection is
        # established. The base class LineReceiver handles the
        # necessary setup, and HTTPClient only sends data via
        # sendCommand/sendHeader/etc.  Keeping the method allows
        # subclasses to override it if needed without breaking
        # the interface.
        pass