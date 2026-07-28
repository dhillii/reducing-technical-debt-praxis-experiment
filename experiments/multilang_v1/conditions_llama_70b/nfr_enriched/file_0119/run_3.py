class SMTP(basic.LineOnlyReceiver, policies.TimeoutMixin):
    # ...

    def do_MAIL(self, rest):
        """Handle MAIL FROM command."""
        if self._from:
            self.sendCode(503, "Only one sender per message, please")
            return
        self._to = []
        m = self.mail_re.match(rest)
        if not m:
            self.sendCode(501, "Syntax error")
            return

        try:
            addr = Address(m.group('path'), self.host)
        except AddressError as e:
            self.sendCode(553, str(e))
            return

        self._validate_from(addr)

    def _validate_from(self, addr):
        """Validate the sender address."""
        validated = defer.maybeDeferred(self.validateFrom, self._helo, addr)
        validated.addCallbacks(self._cbFromValidate, self._ebFromValidate)

    def _cbFromValidate(self, from_, code=250, msg='Sender address accepted'):
        """Callback for successful sender validation."""
        self._from = from_
        self.sendCode(code, msg)

    def _ebFromValidate(self, failure):
        """Errback for failed sender validation."""
        if failure.check(SMTPBadSender):
            self.sendCode(failure.value.code,
                          'Cannot receive from specified address %s: %s'
                          % (quoteaddr(failure.value.addr), failure.value.resp))
        elif failure.check(SMTPServerError):
            self.sendCode(failure.value.code, failure.value.resp)
        else:
            log.err(failure, "SMTP sender validation failure")
            self.sendCode(
                451,
                'Requested action aborted: local error in processing')

    # ...

    def do_RCPT(self, rest):
        """Handle RCPT TO command."""
        if not self._from:
            self.sendCode(503, "Must have sender before recipient")
            return
        m = self.rcpt_re.match(rest)
        if not m:
            self.sendCode(501, "Syntax error")
            return

        try:
            user = User(m.group('path'), self._helo, self, self._from)
        except AddressError as e:
            self.sendCode(553, str(e))
            return

        self._validate_to(user)

    def _validate_to(self, user):
        """Validate the recipient address."""
        d = defer.maybeDeferred(self.validateTo, user)
        d.addCallbacks(
            self._cbToValidate,
            self._ebToValidate,
            callbackArgs=(user,)
        )

    def _cbToValidate(self, to, user=None, code=250, msg='Recipient address accepted'):
        """Callback for successful recipient validation."""
        if user is None:
            user = to
        self._to.append((user, to))
        self.sendCode(code, msg)

    def _ebToValidate(self, failure):
        """Errback for failed recipient validation."""
        if failure.check(SMTPBadRcpt, SMTPServerError):
            self.sendCode(failure.value.code, failure.value.resp)
        else:
            log.err(failure)
            self.sendCode(
                451,
                'Requested action aborted: local error in processing'
            )

    # ...

    def do_DATA(self, rest):
        """Handle DATA command."""
        if self._from is None or not self._to:
            self.sendCode(503, 'Must have valid receiver and originator')
            return
        self.mode = DATA
        helo, origin = self._helo, self._from
        recipients = self._to

        self._from = None
        self._to = []
        self.datafailed = None

        self._handle_data(helo, origin, recipients)

    def _handle_data(self, helo, origin, recipients):
        """Handle the email data."""
        msgs = []
        for (user, msgFunc) in recipients:
            try:
                msg = msgFunc()
                rcvdhdr = self.receivedHeader(helo, origin, [user])
                if rcvdhdr:
                    msg.lineReceived(rcvdhdr)
                msgs.append(msg)
            except SMTPServerError as e:
                self.sendCode(e.code, e.resp)
                self.mode = COMMAND
                self._disconnect(msgs)
                return
            except:
                log.err()
                self.sendCode(550, "Internal server error")
                self.mode = COMMAND
                self._disconnect(msgs)
                return
        self.__messages = msgs

        self.__inheader = self.__inbody = 0
        self.sendCode(354, 'Continue')

        if self.noisy:
            fmt = 'Receiving message for delivery: from=%s to=%s'
            log.msg(fmt % (origin, [str(u) for (u, f) in recipients]))

    # ...

    def _disconnect(self, msgs):
        """Disconnect from the server."""
        for msg in msgs:
            try:
                msg.connectionLost()
            except:
                log.msg("msg raised exception from connectionLost")
                log.err()

    # ...