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
        status_message = message

        if status_code == 200:
            self.handle_ok(version, status_message)
        elif status_code == 404:
            self.handle_not_found(version, status_message)
        elif status_code == 500:
            self.handle_internal_server_error(version, status_message)
        else:
            self.handle_unknown_status(version, status_code, status_message)

    def handle_ok(self, version, status_message):
        # Handle OK status
        pass

    def handle_not_found(self, version, status_message):
        # Handle Not Found status
        pass

    def handle_internal_server_error(self, version, status_message):
        # Handle Internal Server Error status
        pass

    def handle_unknown_status(self, version, status_code, status_message):
        # Handle unknown status
        pass