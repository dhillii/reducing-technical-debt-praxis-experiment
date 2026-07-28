class SMTP(basic.LineOnlyReceiver, policies.TimeoutMixin):
    # ...

    def validateFrom(self, helo, origin):
        """Validate the address from which the message originates."""
        if self.deliveryFactory is not None:
            self.delivery = self.deliveryFactory.getMessageDelivery()

        if self.delivery is not None:
            return defer.maybeDeferred(self.delivery.validateFrom, helo, origin)

        if self.portal:
            return self._attempt_anonymous_login(helo, origin)

        raise SMTPBadSender(origin)

    def _attempt_anonymous_login(self, helo, origin):
        """Attempt an anonymous login and then invoke validateFrom again."""
        result = self.portal.login(
            cred.credentials.Anonymous(),
            None,
            IMessageDeliveryFactory, IMessageDelivery)

        def continue_validation(ignored):
            """Re-attempt from address validation."""
            return self.validateFrom(helo, origin)

        result.addCallbacks(
            self._cbAnonymousAuthentication, self._ebAnonymousAuthentication)
        result.addCallback(continue_validation)
        return result

    def _cbAnonymousAuthentication(self, loginInfo):
        """Save the state resulting from a successful anonymous cred login."""
        if issubclass(loginInfo[0], IMessageDeliveryFactory):
            self.deliveryFactory = loginInfo[1]
            self.delivery = None
        elif issubclass(loginInfo[0], IMessageDelivery):
            self.deliveryFactory = None
            self.delivery = loginInfo[1]
        else:
            raise RuntimeError("%s is not a supported interface" % (loginInfo[0].__name__,))
        self._onLogout = loginInfo[2]
        self.challenger = None

    def _ebAnonymousAuthentication(self, failure):
        """Handle cred login errors."""
        if failure.check(cred.error.UnauthorizedLogin):
            exc = SMTPBadSender(origin)
        elif failure.check(cred.error.UnhandledCredentials):
            exc = SMTPBadSender(origin, resp="Unauthenticated senders not allowed")
        else:
            return failure
        return defer.fail(exc)