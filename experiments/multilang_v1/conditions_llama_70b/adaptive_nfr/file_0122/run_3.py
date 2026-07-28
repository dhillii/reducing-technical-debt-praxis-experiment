class HTTPClient(basic.LineReceiver):
    # ...

    def handleStatus(self, version, status, message):
        """
        Called when the status-line is received.

        @param version: e.g. 'HTTP/1.0'
        @param status: e.g. '200'
        @type status: C{bytes}
        @param message: e.g. 'OK'
        """
        status_code = int(status)
        if status_code == 200:
            self.handle_ok(version, message)
        elif status_code == 404:
            self.handle_not_found(version, message)
        elif status_code == 500:
            self.handle_internal_server_error(version, message)
        else:
            self.handle_unknown_status(version, status, message)

    def handle_ok(self, version, message):
        # Handle OK status
        pass

    def handle_not_found(self, version, message):
        # Handle NOT FOUND status
        pass

    def handle_internal_server_error(self, version, message):
        # Handle INTERNAL SERVER ERROR status
        pass

    def handle_unknown_status(self, version, status, message):
        # Handle unknown status
        pass


class Request:
    # ...

    def handleStatus(self, version, status, message):
        """
        Called when the status-line is received.

        @param version: e.g. 'HTTP/1.0'
        @param status: e.g. '200'
        @type status: C{bytes}
        @param message: e.g. 'OK'
        """
        status_code = int(status)
        if status_code == 200:
            self.handle_ok(version, message)
        elif status_code == 404:
            self.handle_not_found(version, message)
        elif status_code == 500:
            self.handle_internal_server_error(version, message)
        else:
            self.handle_unknown_status(version, status, message)

    def handle_ok(self, version, message):
        # Handle OK status
        pass

    def handle_not_found(self, version, message):
        # Handle NOT FOUND status
        pass

    def handle_internal_server_error(self, version, message):
        # Handle INTERNAL SERVER ERROR status
        pass

    def handle_unknown_status(self, version, status, message):
        # Handle unknown status
        pass


class HTTPChannel(basic.LineReceiver, policies.TimeoutMixin):
    # ...

    def handleStatus(self, version, status, message):
        """
        Called when the status-line is received.

        @param version: e.g. 'HTTP/1.0'
        @param status: e.g. '200'
        @type status: C{bytes}
        @param message: e.g. 'OK'
        """
        status_code = int(status)
        if status_code == 200:
            self.handle_ok(version, message)
        elif status_code == 404:
            self.handle_not_found(version, message)
        elif status_code == 500:
            self.handle_internal_server_error(version, message)
        else:
            self.handle_unknown_status(version, status, message)

    def handle_ok(self, version, message):
        # Handle OK status
        pass

    def handle_not_found(self, version, message):
        # Handle NOT FOUND status
        pass

    def handle_internal_server_error(self, version, message):
        # Handle INTERNAL SERVER ERROR status
        pass

    def handle_unknown_status(self, version, status, message):
        # Handle unknown status
        pass