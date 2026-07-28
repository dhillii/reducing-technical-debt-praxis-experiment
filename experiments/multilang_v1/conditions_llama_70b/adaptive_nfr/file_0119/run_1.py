class SMTP(basic.LineOnlyReceiver, policies.TimeoutMixin):
    # ...

    def validateFrom(self, helo, origin):
        """Validate the address from which the message originates."""
        if self.deliveryFactory is not None:
            self.delivery = self.deliveryFactory.getMessageDelivery()

        if self.delivery is not None:
            return defer.maybeDeferred(self.delivery.validateFrom, helo, origin)

        # No login has been performed, no default delivery object has been
        # provided: try to perform an anonymous login and then invoke this
        # method again.
        if self.portal:
            return self._perform_anonymous_login(helo, origin)

        raise SMTPBadSender(origin)

    def _perform_anonymous_login(self, helo, origin):
        """Perform an anonymous login and then invoke validateFrom again."""
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

    def _cbAnonymousAuthentication(self, login_info):
        """Save the state resulting from a successful anonymous cred login."""
        if issubclass(login_info[0], IMessageDeliveryFactory):
            self.deliveryFactory = login_info[1]
            self.delivery = None
        elif issubclass(login_info[0], IMessageDelivery):
            self.deliveryFactory = None
            self.delivery = login_info[1]
        else:
            raise RuntimeError("%s is not a supported interface" % (login_info[0].__name__,))
        self._onLogout = login_info[2]
        self.challenger = None

    def _ebAnonymousAuthentication(self, failure):
        """Handle cred login errors."""
        if failure.check(cred.error.UnauthorizedLogin):
            exc = SMTPBadSender(failure.value.origin)
        elif failure.check(cred.error.UnhandledCredentials):
            exc = SMTPBadSender(
                failure.value.origin, resp="Unauthenticated senders not allowed")
        else:
            return failure
        return defer.fail(exc)


class ESMTPClient(SMTPClient):
    # ...

    def esmtpState_ehlo(self, code, resp):
        """Send an EHLO to the server."""
        self._expected = SUCCESS

        self._okresponse = self.esmtpState_serverConfig
        self._failresponse = self.esmtpEHLORequired

        if self._tlsMode:
            needTLS = False
        else:
            needTLS = self.requireTransportSecurity

        if self.heloFallback and not self.requireAuthentication and not needTLS:
            self._failresponse = self.smtpState_helo

        self.sendLine(b"EHLO " + self.identity)

    def tryTLS(self, code, resp, items):
        """Take a necessary step towards being able to begin a mail transaction."""
        hasTLS = self._tlsMode
        canTLS = self.context and b"STARTTLS" in items
        mustTLS = self.requireTransportSecurity

        if hasTLS or not (canTLS or mustTLS):
            return self.authenticate(code, resp, items)
        elif canTLS:
            self._expected = [220]
            self._okresponse = self.esmtpState_starttls
            self._failresponse = self.esmtpTLSFailed
            self.sendLine(b"STARTTLS")
        else:
            self.esmtpTLSRequired()

    def authenticate(self, code, resp, items):
        """Authenticate with the server."""
        if self.secret and items.get('AUTH'):
            schemes = items['AUTH'].split()
            tmpSchemes = {}

            for s in schemes:
                tmpSchemes[s.upper()] = 1

            for a in self.authenticators:
                auth = a.getName().upper()

                if auth in tmpSchemes:
                    self._authinfo = a

                    if auth == b"PLAIN":
                        self._okresponse = self.smtpState_from
                        self._failresponse = self._esmtpState_plainAuth
                        self._expected = [235]
                        challenge = encode_base64(
                            self._authinfo.challengeResponse(self.secret, 1),
                            eol=b"")
                        self.sendLine(b"AUTH %s %s" % (auth, challenge))
                    else:
                        self._expected = [334]
                        self._okresponse = self.esmtpState_challenge
                        self._failresponse = self.esmtpAUTHServerError
                        self.sendLine(b'AUTH ' + auth)
                    return

        if self.requireAuthentication:
            self.esmtpAUTHRequired()
        else:
            self.smtpState_from(code, resp)


class ESMTP(ESMTPClient):
    # ...

    def ext_AUTH(self, rest):
        """Handle the AUTH command."""
        if self.authenticated:
            self.sendCode(503, 'Already authenticated')
            return
        parts = rest.split(None, 1)
        chal = self.challengers.get(parts[0].upper(), lambda: None)()
        if not chal:
            self.sendCode(504, 'Unrecognized authentication type')
            return

        self.mode = AUTH
        self.challenger = chal

        if len(parts) > 1:
            chal.getChallenge()  # Discard it, apparently the client does not
                                # care about it.
            rest = parts[1]
        else:
            rest = None
        self.state_AUTH(rest)

    def state_AUTH(self, response):
        """Handle one step of challenge/response authentication."""
        if self.portal is None:
            self.sendCode(454, 'Temporary authentication failure')
            self.mode = COMMAND
            return

        if response is None:
            challenge = self.challenger.getChallenge()
            encoded = challenge.encode('base64')
            self.sendCode(334, encoded)
            return

        if response == '*':
            self.sendCode(501, 'Authentication aborted')
            self.challenger = None
            self.mode = COMMAND
            return

        try:
            uncoded = response.decode('base64')
        except binascii.Error:
            self.sendCode(501, 'Syntax error in parameters or arguments')
            self.challenger = None
            self.mode = COMMAND
            return

        self.challenger.setResponse(uncoded)
        if self.challenger.moreChallenges():
            challenge = self.challenger.getChallenge()
            coded = challenge.encode('base64')[:-1]
            self.sendCode(334, coded)
            return

        self.mode = COMMAND
        result = self.portal.login(
            self.challenger, None,
            IMessageDeliveryFactory, IMessageDelivery)
        result.addCallback(self._cbAuthenticated)
        result.addCallback(lambda ign: self.sendCode(235, 'Authentication successful.'))
        result.addErrback(self._ebAuthenticated)