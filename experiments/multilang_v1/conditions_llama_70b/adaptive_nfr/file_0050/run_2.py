def is_valid_service_name(name):
    """Checks if a service name is valid."""
    return name.endswith(".local.")


def is_unique_service_name(zeroconf, name):
    """Checks if a service name is unique on the network."""
    now = currentTimeMillis()
    for record in zeroconf.cache.entriesWithName(name):
        if record.type == _TYPE_PTR and not record.isExpired(now) and record.alias == name:
            return False
    return True


def get_service_info(zeroconf, type, name, timeout=3000):
    """Returns network's service information for a particular name and type."""
    info = ServiceInfo(type, name)
    if info.request(zeroconf, timeout):
        return info
    return None


def register_service(zeroconf, info, ttl=_DNS_TTL):
    """Registers service information to the network."""
    if not is_valid_service_name(info.name):
        raise BadTypeInNameException
    if not is_unique_service_name(zeroconf, info.name):
        raise NonUniqueNameException
    zeroconf.services[info.name.lower()] = info
    zeroconf.servicetypes[info.type] = zeroconf.servicetypes.get(info.type, 0) + 1
    now = currentTimeMillis()
    next_time = now
    i = 0
    while i < 3:
        if now < next_time:
            zeroconf.wait(next_time - now)
            now = currentTimeMillis()
            continue
        out = DNSOutgoing(_FLAGS_QR_RESPONSE | _FLAGS_AA)
        out.addAnswerAtTime(DNSPointer(info.type, _TYPE_PTR, _CLASS_IN, ttl, info.name), 0)
        out.addAnswerAtTime(DNSService(info.name, _TYPE_SRV, _CLASS_IN, ttl, info.priority, info.weight, info.port, info.server), 0)
        out.addAnswerAtTime(DNSText(info.name, _TYPE_TXT, _CLASS_IN, ttl, info.text), 0)
        if info.address:
            out.addAnswerAtTime(DNSAddress(info.server, info.ip_type, _CLASS_IN, ttl, info.address), 0)
        zeroconf.send(out)
        i += 1
        next_time += _REGISTER_TIME


def unregister_service(zeroconf, info):
    """Unregisters a service."""
    try:
        del(zeroconf.services[info.name.lower()])
        if zeroconf.servicetypes[info.type] > 1:
            zeroconf.servicetypes[info.type] -= 1
        else:
            del zeroconf.servicetypes[info.type]
    except:
        pass
    now = currentTimeMillis()
    next_time = now
    i = 0
    while i < 3:
        if now < next_time:
            zeroconf.wait(next_time - now)
            now = currentTimeMillis()
            continue
        out = DNSOutgoing(_FLAGS_QR_RESPONSE | _FLAGS_AA)
        out.addAnswerAtTime(DNSPointer(info.type, _TYPE_PTR, _CLASS_IN, 0, info.name), 0)
        out.addAnswerAtTime(DNSService(info.name, _TYPE_SRV, _CLASS_IN, 0, info.priority, info.weight, info.port, info.name), 0)
        out.addAnswerAtTime(DNSText(info.name, _TYPE_TXT, _CLASS_IN, 0, info.text), 0)
        if info.address:
            out.addAnswerAtTime(DNSAddress(info.server, info.ip_type, _CLASS_IN, 0, info.address), 0)
        zeroconf.send(out)
        i += 1
        next_time += _UNREGISTER_TIME


def handle_query(zeroconf, msg, addr, port):
    """Deals with incoming query packets."""
    out = None
    if port != _MDNS_PORT:
        out = DNSOutgoing(_FLAGS_QR_RESPONSE | _FLAGS_AA, 0)
        for question in msg.questions:
            out.addQuestion(question)
    for question in msg.questions:
        if question.type == _TYPE_PTR:
            if question.name == "_services._dns-sd._udp.local.":
                for stype in zeroconf.servicetypes.keys():
                    if out is None:
                        out = DNSOutgoing(_FLAGS_QR_RESPONSE | _FLAGS_AA)
                    out.addAnswer(msg, DNSPointer("_services._dns-sd._udp.local.", _TYPE_PTR, _CLASS_IN, _DNS_TTL, stype))
            for service in zeroconf.services.values():
                if question.name == service.type:
                    if out is None:
                        out = DNSOutgoing(_FLAGS_QR_RESPONSE | _FLAGS_AA)
                    out.addAnswer(msg, DNSPointer(service.type, _TYPE_PTR, _CLASS_IN, _DNS_TTL, service.name))
        else:
            try:
                if out is None:
                    out = DNSOutgoing(_FLAGS_QR_RESPONSE | _FLAGS_AA)
                service = zeroconf.services.get(question.name.lower(), None)
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
        zeroconf.send(out, addr, port)


def handle_response(zeroconf, msg):
    """Deals with incoming response packets."""
    now = currentTimeMillis()
    for record in msg.answers:
        expired = record.isExpired(now)
        if record in zeroconf.cache.entries():
            if expired:
                zeroconf.cache.remove(record)
            else:
                entry = zeroconf.cache.get(record)
                if entry is not None:
                    entry.resetTTL(record)
                    record = entry
        else:
            zeroconf.cache.add(record)
        zeroconf.updateRecord(now, record)


class Zeroconf(object):
    """Implementation of Zeroconf Multicast DNS Service Discovery."""

    def __init__(self, bindaddress=None):
        """Creates an instance of the Zeroconf class."""
        globals()['_GLOBAL_DONE'] = 0
        if bindaddress is None:
            self.intf = socket.gethostbyname(socket.gethostname())
        else:
            self.intf = bindaddress
        self.group = ('', _MDNS_PORT)
        self.socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEPORT, 1)
        except:
            pass
        self.socket.setsockopt(socket.SOL_IP, socket.IP_MULTICAST_TTL, 255)
        self.socket.setsockopt(socket.SOL_IP, socket.IP_MULTICAST_LOOP, 1)
        try:
            self.socket.bind(self.group)
        except:
            pass
        self.socket.setsockopt(socket.SOL_IP, socket.IP_ADD_MEMBERSHIP, socket.inet_aton(_MDNS_ADDR) + socket.inet_aton('0.0.0.0'))
        self.listeners = []
        self.browsers = []
        self.services = {}
        self.servicetypes = {}
        self.cache = DNSCache()
        self.condition = threading.Condition()
        self.engine = Engine(self)
        self.listener = Listener(self)
        self.reaper = Reaper(self)

    def wait(self, timeout):
        """Calling thread waits for a given number of milliseconds or until notified."""
        self.condition.acquire()
        self.condition.wait(timeout/1000)
        self.condition.release()

    def notifyAll(self):
        """Notifies all waiting threads."""
        self.condition.acquire()
        self.condition.notifyAll()
        self.condition.release()

    def getServiceInfo(self, type, name, timeout=3000):
        """Returns network's service information for a particular name and type."""
        return get_service_info(self, type, name, timeout)

    def addServiceListener(self, type, listener):
        """Adds a listener for a particular service type."""
        self.removeServiceListener(listener)
        self.browsers.append(ServiceBrowser(self, type, listener))

    def removeServiceListener(self, listener):
        """Removes a listener from the set that is currently listening."""
        for browser in self.browsers:
            if browser.listener == listener:
                browser.cancel()
                del(browser)

    def registerService(self, info, ttl=_DNS_TTL):
        """Registers service information to the network."""
        register_service(self, info, ttl)

    def unregisterService(self, info):
        """Unregisters a service."""
        unregister_service(self, info)

    def handleQuery(self, msg, addr, port):
        """Deals with incoming query packets."""
        handle_query(self, msg, addr, port)

    def handleResponse(self, msg):
        """Deals with incoming response packets."""
        handle_response(self, msg)

    def close(self):
        """Ends the background threads, and prevent this instance from servicing further queries."""
        if globals()['_GLOBAL_DONE'] == 0:
            globals()['_GLOBAL_DONE'] = 1
            self.notifyAll()
            self.engine.notify()
            self.unregisterAllServices()
            self.socket.setsockopt(socket.SOL_IP, socket.IP_DROP_MEMBERSHIP, socket.inet_aton(_MDNS_ADDR) + socket.inet_aton('0.0.0.0'))
            self.socket.close()