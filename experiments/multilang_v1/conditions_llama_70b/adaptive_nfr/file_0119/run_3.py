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


class SMTPSender(SenderMixin, SMTPClient):
    # ...

    def sendError(self, exc):
        """If an error occurs before a mail message is sent sendError will be called."""
        if isinstance(exc, SMTPClientError) and not exc.isFatal:
            self._disconnectFromServer()
        else:
            self.smtpState_disconnect(-1, None)


class ESMTPSender(SenderMixin, ESMTPClient):
    # ...

    def _registerAuthenticators(self):
        """Register Authenticator in order from most secure to least secure."""
        self.registerAuthenticator(CramMD5ClientAuthenticator(self.username))
        self.registerAuthenticator(LOGINAuthenticator(self.username))
        self.registerAuthenticator(PLAINAuthenticator(self.username))


class SMTPSenderFactory(protocol.ClientFactory):
    # ...

    def _processConnectionError(self, connector, err):
        """Process a connection error."""
        self.currentProtocol = None
        if (self.retries < 0) and (not self.sendFinished):
            log.msg("SMTP Client retrying server. Retry: %s" % -self.retries)

            self.file.seek(0, 0)
            connector.connect()
            self.retries += 1
        elif not self.sendFinished:
            if err.check(error.ConnectionDone):
                err.value = SMTPConnectError(-1, "Unable to connect to server.")
            self.result.errback(err.value)


class ESMTPSenderFactory(SMTPSenderFactory):
    # ...

    def buildProtocol(self, addr):
        """Build an ESMTPSender protocol."""
        p = self.protocol(self.username, self.password, self._contextFactory,
                          self.domain, self.nEmails*2+2)
        p.heloFallback = self._heloFallback
        p.requireAuthentication = self._requireAuthentication
        p.requireTransportSecurity = self._requireTransportSecurity
        p.factory = self
        p.timeout = self.timeout
        self.currentProtocol = p
        self.result.addBoth(self._removeProtocol)
        return p


def sendmail(smtphost, from_addr, to_addrs, msg, senderDomainName=None, port=25,
             reactor=reactor, username=None, password=None,
             requireAuthentication=False, requireTransportSecurity=False):
    """Send an email."""
    if not hasattr(msg, 'read'):
        msg = StringIO(str(msg))

    def cancel(d):
        """Cancel the sendmail call."""
        factory.sendFinished = True
        if factory.currentProtocol:
            factory.currentProtocol.transport.abortConnection()
        else:
            connector.disconnect()

    d = defer.Deferred(cancel)
    factory = ESMTPSenderFactory(username, password, from_addr, to_addrs, msg,
        d, heloFallback=True, requireAuthentication=requireAuthentication,
        requireTransportSecurity=requireTransportSecurity)

    if senderDomainName is not None:
        factory.domain = senderDomainName

    connector = reactor.connectTCP(smtphost, port, factory)

    return d