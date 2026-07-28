def is_valid_service_name(name):
    """Checks if a service name is valid."""
    return name.endswith(".local.")


def is_unique_service_name(self, info):
    """Checks if a service name is unique."""
    now = currentTimeMillis()
    for record in self.cache.entriesWithName(info.type):
        if record.type == _TYPE_PTR and not record.isExpired(now) and record.alias == info.name:
            return False
    return True


def get_service_info(self, type, name, timeout=3000):
    """Returns network's service information for a particular name and type."""
    info = ServiceInfo(type, name)
    if info.request(self, timeout):
        return info
    return None


def register_service(self, info, ttl=_DNS_TTL):
    """Registers service information to the network."""
    if not is_valid_service_name(info.name):
        raise BadTypeInNameException
    if not is_unique_service_name(self, info):
        raise NonUniqueNameException
    self.services[info.name.lower()] = info
    self.servicetypes[info.type] = self.servicetypes.get(info.type, 0) + 1
    self.send_service_registration(info, ttl)


def send_service_registration(self, info, ttl):
    """Sends service registration to the network."""
    out = DNSOutgoing(_FLAGS_QR_RESPONSE | _FLAGS_AA)
    out.addAnswerAtTime(DNSPointer(info.type, _TYPE_PTR, _CLASS_IN, ttl, info.name), 0)
    out.addAnswerAtTime(DNSService(info.name, _TYPE_SRV, _CLASS_IN, ttl, info.priority, info.weight, info.port, info.server), 0)
    out.addAnswerAtTime(DNSText(info.name, _TYPE_TXT, _CLASS_IN, ttl, info.text), 0)
    if info.address:
        out.addAnswerAtTime(DNSAddress(info.server, info.ip_type, _CLASS_IN, ttl, info.address), 0)
    self.send(out)


def unregister_service(self, info):
    """Unregisters a service."""
    try:
        del(self.services[info.name.lower()])
        if self.servicetypes[info.type]>1:
            self.servicetypes[info.type]-=1
        else:
            del self.servicetypes[info.type]
    except:
        pass
    self.send_service_unregistration(info)


def send_service_unregistration(self, info):
    """Sends service unregistration to the network."""
    out = DNSOutgoing(_FLAGS_QR_RESPONSE | _FLAGS_AA)
    out.addAnswerAtTime(DNSPointer(info.type, _TYPE_PTR, _CLASS_IN, 0, info.name), 0)
    out.addAnswerAtTime(DNSService(info.name, _TYPE_SRV, _CLASS_IN, 0, info.priority, info.weight, info.port, info.server), 0)
    out.addAnswerAtTime(DNSText(info.name, _TYPE_TXT, _CLASS_IN, 0, info.text), 0)
    if info.address:
        out.addAnswerAtTime(DNSAddress(info.server, info.ip_type, _CLASS_IN, 0, info.address), 0)
    self.send(out)


def handle_query(self, msg, addr, port):
    """Handles incoming query packets."""
    out = None
    if port != _MDNS_PORT:
        out = DNSOutgoing(_FLAGS_QR_RESPONSE | _FLAGS_AA, 0)
        for question in msg.questions:
            out.addQuestion(question)
    for question in msg.questions:
        if question.type == _TYPE_PTR:
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
        else:
            try:
                if out is None:
                    out = DNSOutgoing(_FLAGS_QR_RESPONSE | _FLAGS_AA)
                service = self.services.get(question.name.lower(), None)
                if not service:
                    continue
                if question.type == _TYPE_SRV or question.type == _TYPE_ANY:
                    out.addAnswer(msg, DNSService(question.name, _TYPE_SRV, _CLASS_IN | _CLASS_UNIQUE, _DNS_TTL, service.priority, service.weight, service.port, service.server))
                if question.type == _TYPE_TXT or question.type == _TYPE_ANY:
                    out.addAnswer(msg, DNSText(question.name, _TYPE_TXT, _CLASS_IN | _CLASS_UNIQUE, _DNS_TTL, service.text))
                if question.type == _TYPE_SRV:
                    out.addAdditionalAnswer(DNSAddress(service.server, address_type(service.address), _CLASS_IN | _CLASS_UNIQUE, _DNS_TTL, service.address))
            except:
                traceback.print_exc()
    if out is not None and out.answers:
        out.id = msg.id
        self.send(out, addr, port)


class Zeroconf(object):
    # ...

    def registerService(self, info, ttl=_DNS_TTL):
        register_service(self, info, ttl)

    def unregisterService(self, info):
        unregister_service(self, info)

    def handleQuery(self, msg, addr, port):
        handle_query(self, msg, addr, port)