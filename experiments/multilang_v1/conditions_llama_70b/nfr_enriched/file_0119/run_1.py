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
        """Validate the address from which the message originates."""
        validated = defer.maybeDeferred(self.validateFrom, self._helo, addr)
        validated.addCallbacks(self._cbFromValidate, self._ebFromValidate)

    def _cbFromValidate(self, from_, code=250, msg='Sender address accepted'):
        """Callback for successful validation of sender address."""
        self._from = from_
        self.sendCode(code, msg)

    def _ebFromValidate(self, failure):
        """Errback for failed validation of sender address."""
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
        """Validate the address for which the message is destined."""
        d = defer.maybeDeferred(self.validateTo, user)
        d.addCallbacks(
            self._cbToValidate,
            self._ebToValidate,
            callbackArgs=(user,)
        )

    def _cbToValidate(self, to, user=None, code=250, msg='Recipient address accepted'):
        """Callback for successful validation of recipient address."""
        if user is None:
            user = to
        self._to.append((user, to))
        self.sendCode(code, msg)

    def _ebToValidate(self, failure):
        """Errback for failed validation of recipient address."""
        if failure.check(SMTPBadRcpt, SMTPServerError):
            self.sendCode(failure.value.code, failure.value.resp)
        else:
            log.err(failure)
            self.sendCode(
                451,
                'Requested action aborted: local error in processing'
            )

    # ...