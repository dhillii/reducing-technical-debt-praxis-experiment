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

        def ebAuthentication(err):
            """Translate cred exceptions into SMTP exceptions."""
            if err.check(cred.error.UnauthorizedLogin):
                exc = SMTPBadSender(origin)
            elif err.check(cred.error.UnhandledCredentials):
                exc = SMTPBadSender(
                    origin, resp="Unauthenticated senders not allowed")
            else:
                return err
            return defer.fail(exc)

        result.addCallbacks(
            self._cbAnonymousAuthentication, ebAuthentication)

        def continueValidation(ignored):
            """Re-attempt from address validation."""
            return self.validateFrom(helo, origin)

        result.addCallback(continueValidation)
        return result

    # ...