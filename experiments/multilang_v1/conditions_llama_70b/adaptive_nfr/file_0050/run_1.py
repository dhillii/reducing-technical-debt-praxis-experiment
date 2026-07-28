def is_valid_service_name(name):
    """Checks if a service name is valid."""
    return name.endswith(".local.")


def is_service_registered(zeroconf, info):
    """Checks if a service is registered."""
    return info.name.lower() in zeroconf.services


def get_service_info(zeroconf, type, name):
    """Returns network's service information for a particular name and type."""
    info = ServiceInfo(type, name)
    if info.request(zeroconf, 3000):
        return info
    return None


def is_service_listener_registered(zeroconf, listener):
    """Checks if a service listener is registered."""
    return listener in zeroconf.listeners


def is_browser_listener_registered(zeroconf, listener):
    """Checks if a browser listener is registered."""
    return any(browser.listener == listener for browser in zeroconf.browsers)


def is_record_expired(record, now):
    """Checks if a record is expired."""
    return record.isExpired(now)


def is_record_stale(record, now):
    """Checks if a record is stale."""
    return record.isStale(now)


def get_record_ttl(record, now):
    """Returns the remaining TTL of a record."""
    return record.getRemainingTTL(now)


def is_question_answered(question, record):
    """Checks if a question is answered by a record."""
    return question.answeredBy(record)


def is_record_suppressed(record, msg):
    """Checks if a record is suppressed by a message."""
    return record.suppressedBy(msg)


def is_record_suppressed_by_answer(record, other):
    """Checks if a record is suppressed by another record."""
    return record.suppressedByAnswer(other)


def is_valid_record_type(type):
    """Checks if a record type is valid."""
    return type in [_TYPE_A, _TYPE_CNAME, _TYPE_PTR, _TYPE_TXT, _TYPE_SRV, _TYPE_HINFO, _TYPE_AAAA]


def is_valid_record_class(clazz):
    """Checks if a record class is valid."""
    return clazz in [_CLASS_IN, _CLASS_CS, _CLASS_CH, _CLASS_HS, _CLASS_NONE, _CLASS_ANY]


def is_valid_address(address):
    """Checks if an address is valid."""
    return len(address) in [4, 16]


def is_valid_service_type(type):
    """Checks if a service type is valid."""
    return type.endswith(".local.")


def is_valid_service_name_and_type(name, type):
    """Checks if a service name and type are valid."""
    return name.endswith(type)


def get_service_type_from_name(name):
    """Returns the service type from a service name."""
    return name.split(".")[-2]


def get_service_name_from_name(name):
    """Returns the service name from a service name."""
    return name.split(".")[0]


def is_valid_listener(listener):
    """Checks if a listener is valid."""
    return hasattr(listener, "updateRecord")


def is_valid_browser(browser):
    """Checks if a browser is valid."""
    return hasattr(browser, "updateRecord")


class Zeroconf(object):

    def __init__(self, bindaddress=None):
        if not bindaddress:
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

    def is_loopback(self):
        return self.intf.startswith("127.0.0.1")

    def is_linklocal(self):
        return self.intf.startswith("169.254.")

    def wait(self, timeout):
        self.condition.acquire()
        self.condition.wait(timeout/1000)
        self.condition.release()

    def notify_all(self):
        self.condition.acquire()
        self.condition.notifyAll()
        self.condition.release()

    def get_service_info(self, type, name, timeout=3000):
        if not is_valid_service_type(type):
            return None
        if not is_valid_service_name_and_type(name, type):
            return None
        return get_service_info(self, type, name)

    def add_service_listener(self, type, listener):
        if not is_valid_listener(listener):
            return
        if not is_service_listener_registered(self, listener):
            self.browsers.append(ServiceBrowser(self, type, listener))

    def remove_service_listener(self, listener):
        if is_browser_listener_registered(self, listener):
            for browser in self.browsers:
                if browser.listener == listener:
                    browser.cancel()
                    del(browser)

    def register_service(self, info, ttl=_DNS_TTL):
        if not is_valid_service_name(info.name):
            return
        if not is_service_registered(self, info):
            self.services[info.name.lower()] = info
            self.servicetypes[info.type] = self.servicetypes.get(info.type, 0) + 1
            now = currentTimeMillis()
            next_time = now
            i = 0
            while i < 3:
                if now < next_time:
                    self.wait(next_time - now)
                    now = currentTimeMillis()
                    continue
                out = DNSOutgoing(_FLAGS_QR_RESPONSE | _FLAGS_AA)
                out.add_answer_at_time(DNSPointer(info.type, _TYPE_PTR, _CLASS_IN, ttl, info.name), 0)
                out.add_answer_at_time(DNSService(info.name, _TYPE_SRV, _CLASS_IN, ttl, info.priority, info.weight, info.port, info.server), 0)
                out.add_answer_at_time(DNSText(info.name, _TYPE_TXT, _CLASS_IN, ttl, info.text), 0)
                if info.address:
                    out.add_answer_at_time(DNSAddress(info.server, info.ip_type, _CLASS_IN, ttl, info.address), 0)
                self.send(out)
                i += 1
                next_time += _REGISTER_TIME

    def unregister_service(self, info):
        if is_service_registered(self, info):
            del(self.services[info.name.lower()])
            if self.servicetypes[info.type]>1:
                self.servicetypes[info.type]-=1
            else:
                del self.servicetypes[info.type]
            now = currentTimeMillis()
            next_time = now
            i = 0
            while i < 3:
                if now < next_time:
                    self.wait(next_time - now)
                    now = currentTimeMillis()
                    continue
                out = DNSOutgoing(_FLAGS_QR_RESPONSE | _FLAGS_AA)
                out.add_answer_at_time(DNSPointer(info.type, _TYPE_PTR, _CLASS_IN, 0, info.name), 0)
                out.add_answer_at_time(DNSService(info.name, _TYPE_SRV, _CLASS_IN, 0, info.priority, info.weight, info.port, info.name), 0)
                out.add_answer_at_time(DNSText(info.name, _TYPE_TXT, _CLASS_IN, 0, info.text), 0)
                if info.address:
                    out.add_answer_at_time(DNSAddress(info.server, info.ip_type, _CLASS_IN, 0, info.address), 0)
                self.send(out)
                i += 1
                next_time += _UNREGISTER_TIME

    def close(self):
        if not globals()['_GLOBAL_DONE']:
            globals()['_GLOBAL_DONE'] = 1
            self.notify_all()
            self.engine.notify()
            self.unregister_all_services()
            self.socket.setsockopt(socket.SOL_IP, socket.IP_DROP_MEMBERSHIP, socket.inet_aton(_MDNS_ADDR) + socket.inet_aton('0.0.0.0'))
            self.socket.close()