class Zeroconf(object):
    # ...

    def handleQuery(self, msg, addr, port):
        """Deal with incoming query packets.  Provides a response if possible."""
        out = None

        # Support unicast client responses
        if port != _MDNS_PORT:
            out = DNSOutgoing(_FLAGS_QR_RESPONSE | _FLAGS_AA, 0)
            for question in msg.questions:
                out.addQuestion(question)

        for question in msg.questions:
            self._handle_question(out, question, msg)

        if out is not None and out.answers:
            out.id = msg.id
            self.send(out, addr, port)

    def _handle_question(self, out, question, msg):
        """Handle a single question in a query packet."""
        if question.type == _TYPE_PTR:
            self._handle_ptr_question(out, question, msg)
        else:
            self._handle_other_question(out, question, msg)

    def _handle_ptr_question(self, out, question, msg):
        """Handle a PTR question."""
        if question.name == "_services._dns-sd._udp.local.":
            for stype in self.servicetypes.keys():
                if out is None:
                    out = DNSOutgoing(_FLAGS_QR_RESPONSE | _FLAGS_AA)
                out.addAnswer(msg, DNSPointer("_services._dns-sd._udp.local.", _TYPE_PTR, _CLASS_IN, _DNS_TTL, stype))
        for service in self.services.values():
            if question.name == service.type:
                if out is None:
                    out = DNSOutgoing(_FLAGS_QR_RESPONSE | _FLAGS_AA)
                out.addAnswer(msg, DNSPointer(service.type, _TYPE_PTR, _CLASS_IN, _DNS_TTL, service.name))

    def _handle_other_question(self, out, question, msg):
        """Handle a non-PTR question."""
        try:
            if out is None:
                out = DNSOutgoing(_FLAGS_QR_RESPONSE | _FLAGS_AA)

            # Answer A record queries for any service addresses we know
            if question.type in (_TYPE_A, _TYPE_AAAA, _TYPE_ANY):
                for service in self.services.values():
                    if service.server == question.name.lower():
                        out.addAnswer(
                            msg, DNSAddress(question.name, address_type(service.address), _CLASS_IN | _CLASS_UNIQUE, _DNS_TTL, service.address))

            service = self.services.get(question.name.lower(), None)
            if not service:
                return

            if question.type == _TYPE_SRV or question.type == _TYPE_ANY:
                out.addAnswer(msg, DNSService(question.name, _TYPE_SRV, _CLASS_IN | _CLASS_UNIQUE,
                                      _DNS_TTL, service.priority, service.weight, service.port, service.server))
            if question.type == _TYPE_TXT or question.type == _TYPE_ANY:
                out.addAnswer(msg, DNSText(question.name, _TYPE_TXT, _CLASS_IN | _CLASS_UNIQUE, _DNS_TTL, service.text))
            if question.type == _TYPE_SRV:
                out.addAdditionalAnswer(DNSAddress(service.server, address_type(service.address), _CLASS_IN | _CLASS_UNIQUE, _DNS_TTL, service.address))
        except:
            traceback.print_exc()