class PassportNexus(HTTPClient):
    def handleResponse(self, r):
        """Handle the response from the server."""
        pass

class PassportLogin(HTTPClient):
    def handleResponse(self, r):
        """Handle the response from the server."""
        pass

class MSNEventBase(LineReceiver):
    def handleResponse(self, r):
        """Handle the response from the server."""
        pass

class DispatchClient(MSNEventBase):
    def handleResponse(self, r):
        """Handle the response from the server."""
        pass

class NotificationClient(MSNEventBase):
    def handleResponse(self, r):
        """Handle the response from the server."""
        pass

class SwitchboardClient(MSNEventBase):
    def handleResponse(self, r):
        """Handle the response from the server."""
        pass