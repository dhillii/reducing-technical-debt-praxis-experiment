# See https://zulip.readthedocs.io/en/latest/subsystems/events-system.html for
# high-level documentation on how this system works.
from typing import cast, AbstractSet, Any, Callable, Dict, List, \
    Mapping, MutableMapping, Optional, Iterable, Sequence, Set, Union
from mypy_extensions import TypedDict

from django.utils.translation import ugettext as _
from django.conf import settings
from collections import deque
import os
import time
import logging
import ujson
import requests
import atexit
import sys
import signal
import tornado.autoreload
import tornado.ioloop
import random
from zerver.models import UserProfile, Client, Realm
from zerver.decorator import cachify
from zerver.tornado.handlers import clear_handler_by_id, get_handler_by_id, \
    finish_handler, handler_stats_string
from zerver.lib.utils import statsd
from zerver.middleware import async_request_timer_restart
from zerver.lib.message import MessageDict
from zerver.lib.narrow import build_narrow_filter
from zerver.lib.queue import queue_json_publish
from zerver.lib.request import JsonableError
from zerver.tornado.descriptors import clear_descriptor_by_handler_id, set_descriptor_by_handler_id
from zerver.tornado.exceptions import BadEventQueueIdError
from zerver.tornado.sharding import get_tornado_uri, get_tornado_port, \
    notify_tornado_queue_name, tornado_return_queue_name
import copy

requests_client = requests.Session()
for host in ['127.0.0.1', 'localhost']:
    if settings.TORNADO_SERVER and host in settings.TORNADO_SERVER:
        # This seems to be the only working solution to ignore proxy in
        # requests library.
        requests_client.trust_env = False

# The idle timeout used to be a week, but we found that in that
# situation, queues from dead browser sessions would grow quite large
# due to the accumulation of message data in those queues.
IDLE_EVENT_QUEUE_TIMEOUT_SECS = 60 * 10
EVENT_QUEUE_GC_FREQ_MSECS = 1000 * 60 * 5

# Capped limit for how long a client can request an event queue
# to live
MAX_QUEUE_TIMEOUT_SECS = 7 * 24 * 60 * 60

# The heartbeats effectively act as a server-side timeout for
# get_events().  The actual timeout value is randomized for each
# client connection based on the below value.  We ensure that the
# maximum timeout value is 55 seconds, to deal with crappy home
# wireless routers that kill "inactive" http connections.
HEARTBEAT_MIN_FREQ_SECS = 45


class ClientDescriptor:
    def __init__(self,
                 user_profile_id: int,
                 user_profile_email: str,
                 realm_id: int, event_queue: 'EventQueue',
                 event_types: Optional[Sequence[str]],
                 client_type_name: str,
                 apply_markdown: bool=True,
                 client_gravatar: bool=True,
                 all_public_streams: bool=False,
                 lifespan_secs: int=0,
                 narrow: Iterable[Sequence[str]]=[]) -> None:
        # These objects are serialized on shutdown and restored on restart.
        # If fields are added or semantics are changed, temporary code must be
        # added to load_event_queues() to update the restored objects.
        # Additionally, the to_dict and from_dict methods must be updated
        self.user_profile_id = user_profile_id
        self.user_profile_email = user_profile_email
        self.realm_id = realm_id
        self.current_handler_id = None  # type: Optional[int]
        self.current_client_name = None  # type: Optional[str]
        self.event_queue = event_queue
        self.queue_timeout = lifespan_secs
        self.event_types = event_types
        self.last_connection_time = time.time()
        self.apply_markdown = apply_markdown
        self.client_gravatar = client_gravatar
        self.all_public_streams = all_public_streams
        self.client_type_name = client_type_name
        self._timeout_handle = None  # type: Any
        self.narrow = narrow
        self.narrow_filter = build_narrow_filter(narrow)

        # Clamp queue_timeout to between minimum and maximum timeouts
        self.queue_timeout = max(IDLE_EVENT_QUEUE_TIMEOUT_SECS,
                                 min(self.queue_timeout, MAX_QUEUE_TIMEOUT_SECS))

    def to_dict(self) -> Dict[str, Any]:
        return dict(user_profile_id=self.user_profile_id,
                    user_profile_email=self.user_profile_email,
                    realm_id=self.realm_id,
                    event_queue=self.event_queue.to_dict(),
                    queue_timeout=self.queue_timeout,
                    event_types=self.event_types,
                    last_connection_time=self.last_connection_time,
                    apply_markdown=self.apply_markdown,
                    client_gravatar=self.client_gravatar,
                    all_public_streams=self.all_public_streams,
                    narrow=self.narrow,
                    client_type_name=self.client_type_name)

    def __repr__(self) -> str:
        return "ClientDescriptor<%s>" % (self.event_queue.id,)

    @classmethod
    def from_dict(cls, d: MutableMapping[str, Any]) -> 'ClientDescriptor':
        if 'user_profile_email' not in d:
            from zerver.models import get_user_profile_by_id
            d['user_profile_email'] = get_user_profile_by_id(d['user_profile_id']).email
        if 'client_type' in d:
            d['client_type_name'] = d['client_type']
        if 'client_gravatar' not in d:
            d['client_gravatar'] = False

        ret = cls(
            d['user_profile_id'],
            d['user_profile_email'],
            d['realm_id'],
            EventQueue.from_dict(d['event_queue']),
            d['event_types'],
            d['client_type_name'],
            d['apply_markdown'],
            d['client_gravatar'],
            d['all_public_streams'],
            d['queue_timeout'],
            d.get('narrow', [])
        )
        ret.last_connection_time = d['last_connection_time']
        return ret

    def prepare_for_pickling(self) -> None:
        self.current_handler_id = None
        self._timeout_handle = None

    def add_event(self, event: Dict[str, Any]) -> None:
        if self.current_handler_id is not None:
            handler = get_handler_by_id(self.current_handler_id)
            async_request_timer_restart(handler._request)

        self.event_queue.push(event)
        self.finish_current_handler()

    def finish_current_handler(self) -> bool:
        if self.current_handler_id is not None:
            err_msg = "Got error finishing handler for queue %s" % (self.event_queue.id,)
            try:
                finish_handler(self.current_handler_id, self.event_queue.id,
                               self.event_queue.contents(), self.apply_markdown)
            except Exception:
                logging.exception(err_msg)
            finally:
                self.disconnect_handler()
                return True
        return False

    def accepts_event(self, event: Mapping[str, Any]) -> bool:
        if self.event_types is not None and event["type"] not in self.event_types:
            return False
        if event["type"] == "message":
            return self.narrow_filter(event)
        return True

    def accepts_messages(self) -> bool:
        return self.event_types is None or "message" in self.event_types

    def idle(self, now: float) -> bool:
        if not hasattr(self, 'queue_timeout'):
            self.queue_timeout = IDLE_EVENT_QUEUE_TIMEOUT_SECS
        return (self.current_handler_id is None and
                now - self.last_connection_time >= self.queue_timeout)

    def connect_handler(self, handler_id: int, client_name: str) -> None:
        self.current_handler_id = handler_id
        self.current_client_name = client_name
        set_descriptor_by_handler_id(handler_id, self)
        self.last_connection_time = time.time()

        def timeout_callback() -> None:
            self._timeout_handle = None
            self.add_event(dict(type='heartbeat'))

        ioloop = tornado.ioloop.IOLoop.instance()
        interval = HEARTBEAT_MIN_FREQ_SECS + random.randint(0, 10)
        if self.client_type_name != 'API: heartbeat test':
            self._timeout_handle = ioloop.call_later(interval, timeout_callback)

    def disconnect_handler(self, client_closed: bool=False) -> None:
        if self.current_handler_id:
            clear_descriptor_by_handler_id(self.current_handler_id, None)
            clear_handler_by_id(self.current_handler_id)
            if client_closed:
                logging.info("Client disconnected for queue %s (%s via %s)" %
                             (self.event_queue.id, self.user_profile_email,
                              self.current_client_name))
        self.current_handler_id = None
        self.current_client_name = None
        if self._timeout_handle is not None:
            ioloop = tornado.ioloop.IOLoop.instance()
            ioloop.remove_timeout(self._timeout_handle)
            self._timeout_handle = None

    def cleanup(self) -> None:
        self.finish_current_handler()
        do_gc_event_queues({self.event_queue.id}, {self.user_profile_id},
                           {self.realm_id})


def compute_full_event_type(event: Mapping[str, Any]) -> str:
    if event["type"] == "update_message_flags":
        if event["all"]:
            return "all_flags/%s/%s" % (event["flag"], event["operation"])
        return "flags/%s/%s" % (event["operation"], event["flag"])
    return event["type"]


class EventQueue:
    def __init__(self, id: str) -> None:
        self.queue = deque()
        self.next_event_id = 0
        self.id = id
        self.virtual_events = {}

    def to_dict(self) -> Dict[str, Any]:
        return dict(id=self.id,
                    next_event_id=self.next_event_id,
                    queue=list(self.queue),
                    virtual_events=self.virtual_events)

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> 'EventQueue':
        ret = cls(d['id'])
        ret.next_event_id = d['next_event_id']
        ret.queue = deque(d['queue'])
        ret.virtual_events = d.get("virtual_events", {})
        return ret

    def push(self, event: Dict[str, Any]) -> None:
        event['id'] = self.next_event_id
        self.next_event_id += 1
        full_event_type = compute_full_event_type(event)
        if (full_event_type in ["pointer", "restart"] or
                full_event_type.startswith("flags/")):
            if full_event_type not in self.virtual_events:
                self.virtual_events[full_event_type] = copy.deepcopy(event)
                return
            virtual_event = self.virtual_events[full_event_type]
            virtual_event["id"] = event["id"]
            if "timestamp" in event:
                virtual_event["timestamp"] = event["timestamp"]
            if full_event_type == "pointer":
                virtual_event["pointer"] = event["pointer"]
            elif full_event_type == "restart":
                virtual_event["server_generation"] = event["server_generation"]
            elif full_event_type.startswith("flags/"):
                virtual_event["messages"] += event["messages"]
        else:
            self.queue.append(event)

    def pop(self) -> Dict[str, Any]:
        return self.queue.popleft()

    def empty(self) -> bool:
        return len(self.queue) == 0 and len(self.virtual_events) == 0

    def prune(self, through_id: int) -> None:
        while self.queue and self.queue[0]['id'] <= through_id:
            self.pop()

    def contents(self) -> List[Dict[str, Any]]:
        virtual_id_map = {v["id"]: v for v in self.virtual_events.values()}
        virtual_ids = sorted(virtual_id_map.keys())
        contents = []
        idx = 0
        length = len(virtual_ids)

        for event in self.queue:
            while idx < length and virtual_ids[idx] < event["id"]:
                contents.append(virtual_id_map[virtual_ids[idx]])
                idx += 1
            contents.append(event)

        while idx < length:
            contents.append(virtual_id_map[virtual_ids[idx]])
            idx += 1

        self.virtual_events = {}
        self.queue = deque(contents)
        return contents


clients = {}
user_clients = {}
realm_clients_all_streams = {}
gc_hooks = []
next_queue_id = 0


def clear_client_event_queues_for_testing() -> None:
    assert(settings.TEST_SUITE)
    clients.clear()
    user_clients.clear()
    realm_clients_all_streams.clear()
    gc_hooks.clear()
    global next_queue_id
    next_queue_id = 0


def add_client_gc_hook(hook: Callable[[int, ClientDescriptor, bool], None]) -> None:
    gc_hooks.append(hook)


def get_client_descriptor(queue_id: str) -> ClientDescriptor:
    return clients.get(queue_id)


def get_client_descriptors_for_user(user_profile_id: int) -> List[ClientDescriptor]:
    return user_clients.get(user_profile_id, [])


def get_client_descriptors_for_realm_all_streams(realm_id: int) -> List[ClientDescriptor]:
    return realm_clients_all_streams.get(realm_id, [])


def add_to_client_dicts(client: ClientDescriptor) -> None:
    user_clients.setdefault(client.user_profile_id, []).append(client)
    if client.all_public_streams or client.narrow != []:
        realm_clients_all_streams.setdefault(client.realm_id, []).append(client)


def allocate_client_descriptor(new_queue_data: MutableMapping[str, Any]) -> ClientDescriptor:
    global next_queue_id
    queue_id = f"{settings.SERVER_GENERATION}:{next_queue_id}"
    next_queue_id += 1
    new_queue_data["event_queue"] = EventQueue(queue_id).to_dict()
    client = ClientDescriptor.from_dict(new_queue_data)
    clients[queue_id] = client
    add_to_client_dicts(client)
    return client


def do_gc_event_queues(to_remove: AbstractSet[str], affected_users: AbstractSet[int],
                       affected_realms: AbstractSet[int]) -> None:
    def filter_client_dict(client_dict: MutableMapping[int, List[ClientDescriptor]], key: int) -> None:
        if key not in client_dict:
            return
        new_list = [c for c in client_dict[key] if c.event_queue.id not in to_remove]
        if new_list:
            client_dict[key] = new_list
        else:
            del client_dict[key]

    for user_id in affected_users:
        filter_client_dict(user_clients, user_id)
    for realm_id in affected_realms:
        filter_client_dict(realm_clients_all_streams, realm_id)

    for qid in to_remove:
        client = clients[qid]
        for cb in gc_hooks:
            cb(client.user_profile_id, client, client.user_profile_id not in user_clients)
        del clients[qid]


def gc_event_queues(port: int) -> None:
    start = time.time()
    to_remove = set()
    affected_users = set()
    affected_realms = set()
    for qid, client in clients.items():
        if client.idle(start):
            to_remove.add(qid)
            affected_users.add(client.user_profile_id)
            affected_realms.add(client.realm_id)

    do_gc_event_queues(to_remove, affected_users, affected_realms)

    if settings.PRODUCTION:
        logging.info(('Tornado %d removed %d idle event queues owned by %d users in %.3fs.' +
                      '  Now %d active queues, %s')
                     % (port, len(to_remove), len(affected_users), time.time() - start,
                        len(clients), handler_stats_string()))
    statsd.gauge('tornado.active_queues', len(clients))
    statsd.gauge('tornado.active_users', len(user_clients))


def persistent_queue_filename(port: int, last: bool=False) -> str:
    if settings.TORNADO_PROCESSES == 1:
        if last:
            return "/var/tmp/event_queues.json.last"
        return settings.JSON_PERSISTENT_QUEUE_FILENAME_PATTERN % ('',)
    if last:
        return f"/var/tmp/event_queues.{port}.last.json"
    return settings.JSON_PERSISTENT_QUEUE_FILENAME_PATTERN % ('.' + str(port),)


def dump_event_queues(port: int) -> None:
    start = time.time()
    with open(persistent_queue_filename(port), "w") as stored_queues:
        ujson.dump([(qid, client.to_dict()) for qid, client in clients.items()], stored_queues)
    logging.info('Tornado %d dumped %d event queues in %.3fs' % (port, len(clients), time.time() - start))


def load_event_queues(port: int) -> None:
    global clients
    start = time.time()
    try:
        with open(persistent_queue_filename(port), "r") as stored_queues:
            json_data = stored_queues.read()
        try:
            clients = {qid: ClientDescriptor.from_dict(c) for qid, c in ujson.loads(json_data)}
        except Exception:
            logging.exception("Tornado %d could not deserialize event queues" % (port,))
    except (IOError, EOFError):
        pass

    for client in clients.values():
        add_to_client_dicts(client)

    logging.info('Tornado %d loaded %d event queues in %.3fs' % (port, len(clients), time.time() - start))


def send_restart_events(immediate: bool=False) -> None:
    event = dict(type='restart', server_generation=settings.SERVER_GENERATION)
    if immediate:
        event['immediate'] = True
    for client in clients.values():
        if client.accepts_event(event):
            client.add_event(event.copy())


def setup_event_queue(port: int) -> None:
    if not settings.TEST_SUITE:
        load_event_queues(port)
        atexit.register(dump_event_queues, port)
        signal.signal(signal.SIGTERM, lambda signum, stack: sys.exit(1))
        tornado.autoreload.add_reload_hook(lambda: dump_event_queues(port))

    try:
        os.rename(persistent_queue_filename(port), persistent_queue_filename(port, last=True))
    except OSError:
        pass

    ioloop = tornado.ioloop.IOLoop.instance()
    pc = tornado.ioloop.PeriodicCallback(lambda: gc_event_queues(port),
                                         EVENT_QUEUE_GC_FREQ_MSECS, ioloop)
    pc.start()
    send_restart_events(immediate=settings.DEVELOPMENT)


def _validate_fetch_query(query: Mapping[str, Any]) -> None:
    if query.get("queue_id") is None and not query.get("dont_block"):
        raise JsonableError(_("Missing 'queue_id' argument"))
    if query.get("queue_id") is not None and query.get("last_event_id") is None:
        raise JsonableError(_("Missing 'last_event_id' argument"))


def _get_or_create_client(query: Mapping[str, Any]) -> tuple[ClientDescriptor, str, bool]:
    queue_id = query.get("queue_id")
    dont_block = query.get("dont_block")
    new_queue_data = query.get("new_queue_data")
    if queue_id is None:
        client = allocate_client_descriptor(new_queue_data)
        return client, client.event_queue.id, False
    client = get_client_descriptor(queue_id)
    if client is None:
        raise BadEventQueueIdError(queue_id)
    if query["user_profile_id"] != client.user_profile_id:
        raise JsonableError(_("You are not authorized to get events from this queue"))
    return client, queue_id, True


def _prepare_fetch_response(client: ClientDescriptor, handler_id: int,
                           orig_queue_id: Optional[str]) -> dict:
    response = dict(events=client.event_queue.contents(),
                    handler_id=handler_id)
    if orig_queue_id is None:
        response['queue_id'] = client.event_queue.id
    return response


def _log_fetch_extra_data(queue_id: str, events: List[Dict[str, Any]], was_connected: bool) -> str:
    if len(events) == 1:
        extra = f"[{queue_id}/{len(events)}/{events[0]['type']}]"
    else:
        extra = f"[{queue_id}/{len(events)}]"
    if was_connected:
        extra += " [was connected]"
    return extra


def fetch_events(query: Mapping[str, Any]) -> Dict[str, Any]:
    _validate_fetch_query(query)
    handler_id = query["handler_id"]
    orig_queue_id = query.get("queue_id")
    try:
        client, queue_id, was_connected = _get_or_create_client(query)
        client.event_queue.prune(query.get("last_event_id", 0))
        if not client.event_queue.empty() or query.get("dont_block"):
            response = _prepare_fetch_response(client, handler_id, orig_queue_id)
            extra_log_data = _log_fetch_extra_data(queue_id, response["events"], was_connected)
            return dict(type="response", response=response, extra_log_data=extra_log_data)
        if was_connected:
            logging.info("Disconnected handler for queue %s (%s/%s)" %
                         (queue_id, query["user_profile_email"], query["client_type_name"]))
    except JsonableError as e:
        return dict(type="error", exception=e)

    client.connect_handler(handler_id, query["client_type_name"])
    return dict(type="async")


requests_json_is_function = callable(requests.Response.json)


def extract_json_response(resp: requests.Response) -> Dict[str, Any]:
    if requests_json_is_function:
        return resp.json()
    return resp.json  # type: ignore


def request_event_queue(user_profile: UserProfile, user_client: Client, apply_markdown: bool,
                        client_gravatar: bool, queue_lifespan_secs: int,
                        event_types: Optional[Iterable[str]]=None,
                        all_public_streams: bool=False,
                        narrow: Iterable[Sequence[str]]=[]) -> Optional[str]:
    if settings.TORNADO_SERVER:
        tornado_uri = get_tornado_uri(user_profile.realm)
        req = {'dont_block': 'true',
               'apply_markdown': ujson.dumps(apply_markdown),
               'client_gravatar': ujson.dumps(client_gravatar),
               'all_public_streams': ujson.dumps(all_public_streams),
               'client': 'internal',
               'user_profile_id': user_profile.id,
               'user_client': user_client.name,
               'narrow': ujson.dumps(narrow),
               'secret': settings.SHARED_SECRET,
               'lifespan_secs': queue_lifespan_secs}
        if event_types is not None:
            req['event_types'] = ujson.dumps(event_types)

        try:
            resp = requests_client.post(tornado_uri + '/api/v1/events/internal', data=req)
        except requests.adapters.ConnectionError:
            logging.error('Tornado server does not seem to be running, check %s '
                          'and %s for more information.' %
                          (settings.ERROR_FILE_LOG_PATH, "tornado.log"))
            raise requests.adapters.ConnectionError(
                "Django cannot connect to Tornado server (%s); try restarting" % (tornado_uri,))

        resp.raise_for_status()
        return extract_json_response(resp)['queue_id']
    return None


def get_user_events(user_profile: UserProfile, queue_id: str, last_event_id: int) -> List[Dict[Any, Any]]:
    if settings.TORNADO_SERVER:
        tornado_uri = get_tornado_uri(user_profile.realm)
        post_data = {
            'queue_id': queue_id,
            'last_event_id': last_event_id,
            'dont_block': 'true',
            'user_profile_id': user_profile.id,
            'secret': settings.SHARED_SECRET,
            'client': 'internal'
        }
        resp = requests_client.post(tornado_uri + '/api/v1/events/internal', data=post_data)
        resp.raise_for_status()
        return extract_json_response(resp)['events']
    return []


NOTIFY_AFTER_IDLE_HOURS = 1


def build_offline_notification(user_profile_id: int, message_id: int) -> Dict[str, Any]:
    return {"user_profile_id": user_profile_id,
            "message_id": message_id,
            "timestamp": time.time()}


def missedmessage_hook(user_profile_id: int, client: ClientDescriptor, last_for_client: bool) -> None:
    """Process missedmessage hook when the last queue for a client is GC'd."""
    if not last_for_client:
        return
    for event in client.event_queue.contents():
        if event['type'] != 'message':
            continue
        flags = event.get('flags')
        mentioned = 'mentioned' in flags and 'read' not in flags
        private_message = event['message']['type'] == 'private'
        stream_push_notify = event.get('stream_push_notify', False)
        stream_email_notify = event.get('stream_email_notify', False)
        stream_name = None if private_message else event['message']['display_recipient']
        already_notified = dict(
            push_notified=event.get("push_notified", False),
            email_notified=event.get("email_notified", False),
        )
        maybe_enqueue_notifications(user_profile_id, event['message']['id'],
                                    private_message, mentioned,
                                    stream_push_notify, stream_email_notify,
                                    stream_name, False, True, already_notified)


def receiver_is_off_zulip(user_profile_id: int) -> bool:
    all_clients = get_client_descriptors_for_user(user_profile_id)
    message_clients = [c for c in all_clients if c.accepts_messages()]
    return len(message_clients) == 0


def maybe_enqueue_notifications(user_profile_id: int, message_id: int, private_message: bool,
                                mentioned: bool, stream_push_notify: bool,
                                stream_email_notify: bool, stream_name: Optional[str],
                                always_push_notify: bool, idle: bool,
                                already_notified: Dict[str, bool]) -> Dict[str, bool]:
    """Enqueue push and email notifications for offline users."""
    notified = {}
    if (idle or always_push_notify) and (private_message or mentioned or stream_push_notify):
        notice = build_offline_notification(user_profile_id, message_id)
        notice['trigger'] = ('private_message' if private_message else
                             'mentioned' if mentioned else
                             'stream_push_notify')
        notice['stream_name'] = stream_name
        if not already_notified.get("push_notified"):
            queue_json_publish("missedmessage_mobile_notifications", notice)
            notified['push_notified'] = True

    if idle and (private_message or mentioned or stream_email_notify):
        notice = build_offline_notification(user_profile_id, message_id)
        notice['trigger'] = ('private_message' if private_message else
                             'mentioned' if mentioned else
                             'stream_email_notify')
        notice['stream_name'] = stream_name
        if not already_notified.get("email_notified"):
            queue_json_publish("missedmessage_emails", notice, lambda notice: None)
            notified['email_notified'] = True
    return notified


ClientInfo = TypedDict('ClientInfo', {
    'client': ClientDescriptor,
    'flags': Optional[Iterable[str]],
    'is_sender': bool,
})


def _collect_clients_for_message(event_template: Mapping[str, Any],
                                users: Iterable[Mapping[str, Any]]) -> Dict[str, ClientInfo]:
    """Collect client info for all recipients of a message."""
    send_to_clients = {}
    sender_queue_id = event_template.get('sender_queue_id')
    def is_sender(client: ClientDescriptor) -> bool:
        return sender_queue_id is not None and client.event_queue.id == sender_queue_id

    if 'stream_name' in event_template and not event_template.get("invite_only"):
        realm_id = event_template['realm_id']
        for client in get_client_descriptors_for_realm_all_streams(realm_id):
            send_to_clients[client.event_queue.id] = dict(
                client=client,
                flags=[],
                is_sender=is_sender(client)
            )

    for user_data in users:
        uid = user_data['id']
        flags = user_data.get('flags', [])
        for client in get_client_descriptors_for_user(uid):
            send_to_clients[client.event_queue.id] = dict(
                client=client,
                flags=flags,
                is_sender=is_sender(client)
            )
    return send_to_clients


def _process_user_notifications(event_template: Mapping[str, Any],
                               users: Iterable[Mapping[str, Any]]) -> Dict[int, Dict[str, bool]]:
    """Determine extra notification data per user."""
    presence_idle_user_ids = set(event_template.get('presence_idle_user_ids', []))
    wide = event_template['message_dict']
    sender_id = wide['sender_id']
    message_id = wide['id']
    message_type = wide['type']

    extra = {}
    for user_data in users:
        uid = user_data['id']
        flags = user_data.get('flags', [])
        private_message = message_type == "private" and uid != sender_id
        mentioned = 'mentioned' in flags and 'read' not in flags
        stream_push_notify = user_data.get('stream_push_notify', False)
        stream_email_notify = user_data.get('stream_email_notify', False)

        if private_message or mentioned or stream_push_notify or stream_email_notify:
            idle = receiver_is_off_zulip(uid) or (uid in presence_idle_user_ids)
            always_push = user_data.get('always_push_notify', False)
            stream_name = event_template.get('stream_name')
            result = maybe_enqueue_notifications(uid, message_id, private_message,
                                                 mentioned, stream_push_notify,
                                                 stream_email_notify, stream_name,
                                                 always_push, idle, {})
            result['stream_push_notify'] = stream_push_notify
            result['stream_email_notify'] = stream_email_notify
            extra[uid] = result
    return extra


def _dispatch_message_events(send_to_clients: Dict[str, ClientInfo],
                            extra_user_data: Dict[int, Dict[str, bool]],
                            event_template: Mapping[str, Any]) -> None:
    """Send the constructed message events to each client."""
    wide = event_template['message_dict']
    sending_client = wide['client']

    @cachify
    def get_client_payload(apply_md: bool, gravatar: bool) -> Dict[str, Any]:
        d = copy.deepcopy(wide)
        MessageDict.finalize_payload(d, apply_md, gravatar)
        return d

    for client_info in send_to_clients.values():
        client = client_info['client']
        if not client.accepts_messages():
            continue
        message_dict = get_client_payload(client.apply_markdown, client.client_gravatar)

        if "mirror" in client.client_type_name and event_template.get("invite_only"):
            message_dict = message_dict.copy()
            message_dict["invite_only_stream"] = True

        user_event = dict(type='message', message=message_dict,
                          flags=client_info['flags'])
        extra = extra_user_data.get(client.user_profile_id)
        if extra:
            user_event.update(extra)

        if client_info.get('is_sender'):
            local_id = event_template.get('local_id')
            if local_id is not None:
                user_event["local_message_id"] = local_id

        if not client.accepts_event(user_event):
            continue
        if ('mirror' in sending_client and
                sending_client.lower() == client.client_type_name.lower()):
            continue
        client.add_event(user_event)


def process_message_event(event_template: Mapping[str, Any], users: Iterable[Mapping[str, Any]]) -> None:
    send_to_clients = _collect_clients_for_message(event_template, users)
    extra_user_data = _process_user_notifications(event_template, users)
    _dispatch_message_events(send_to_clients, extra_user_data, event_template)


def process_event(event: Mapping[str, Any], users: Iterable[int]) -> None:
    for uid in users:
        for client in get_client_descriptors_for_user(uid):
            if client.accepts_event(event):
                client.add_event(dict(event))


def process_userdata_event(event_template: Mapping[str, Any], users: Iterable[Mapping[str, Any]]) -> None:
    for user_data in users:
        uid = user_data['id']
        user_event = dict(event_template)
        for key, value in user_data.items():
            if key != "id":
                user_event[key] = value
        for client in get_client_descriptors_for_user(uid):
            if client.accepts_event(user_event):
                client.add_event(user_event)


def _prepare_message_update_context(event_template: Mapping[str, Any]) -> dict:
    prior = set(event_template.get('prior_mention_user_ids', []))
    mention = set(event_template.get('mention_user_ids', []))
    idle = set(event_template.get('presence_idle_user_ids', []))
    push = set(event_template.get('push_notify_user_ids', []))
    stream_push = set(event_template.get('stream_push_user_ids', []))
    stream_email = set(event_template.get('stream_email_user_ids', []))
    return {
        'prior': prior,
        'mention': mention,
        'idle': idle,
        'push': push,
        'stream_push': stream_push,
        'stream_email': stream_email,
        'stream_name': event_template.get('stream_name'),
        'message_id': event_template['message_id'],
    }


def process_message_update_event(event_template: Mapping[str, Any],
                                 users: Iterable[Mapping[str, Any]]) -> None:
    ctx = _prepare_message_update_context(event_template)
    for user_data in users:
        uid = user_data['id']
        maybe_enqueue_notifications_for_message_update(
            user_profile_id=uid,
            message_id=ctx['message_id'],
            stream_name=ctx['stream_name'],
            prior_mention_user_ids=ctx['prior'],
            mention_user_ids=ctx['mention'],
            presence_idle_user_ids=ctx['idle'],
            stream_push_user_ids=ctx['stream_push'],
            stream_email_user_ids=ctx['stream_email'],
            push_notify_user_ids=ctx['push'],
        )
        user_event = dict(event_template)
        for key, value in user_data.items():
            if key != "id":
                user_event[key] = value
        for client in get_client_descriptors_for_user(uid):
            if client.accepts_event(user_event):
                client.add_event(user_event)


def maybe_enqueue_notifications_for_message_update(user_profile_id: UserProfile,
                                                   message_id: int,
                                                   stream_name: str,
                                                   prior_mention_user_ids: Set[int],
                                                   mention_user_ids: Set[int],
                                                   presence_idle_user_ids: Set[int],
                                                   stream_push_user_ids: Set[int],
                                                   stream_email_user_ids: Set[int],
                                                   push_notify_user_ids: Set[int]) -> None:
    if stream_name is None:
        return
    if user_profile_id in prior_mention_user_ids:
        return
    if user_profile_id in stream_push_user_ids or user_profile_id in stream_email_user_ids:
        return
    mentioned = user_profile_id in mention_user_ids
    always_push = user_profile_id in push_notify_user_ids
    idle = (user_profile_id in presence_idle_user_ids) or receiver_is_off_zulip(user_profile_id)
    maybe_enqueue_notifications(user_profile_id, message_id, False,
                                mentioned, bool(user_profile_id in stream_push_user_ids),
                                bool(user_profile_id in stream_email_user_ids),
                                stream_name, always_push, idle, {})


def process_notification(notice: Mapping[str, Any]) -> None:
    event = notice['event']
    users = notice['users']
    start_time = time.time()
    if event['type'] == "message":
        process_message_event(event, cast(Iterable[Mapping[str, Any]], users))
    elif event['type'] == "update_message":
        process_message_update_event(event, cast(Iterable[Mapping[str, Any]], users))
    elif event['type'] == "delete_message":
        process_userdata_event(event, cast(Iterable[Mapping[str, Any]], users))
    else:
        process_event(event, cast(Iterable[int], users))
    logging.debug("Tornado: Event %s for %s users took %sms" % (
        event['type'], len(users), int(1000 * (time.time() - start_time))))


def send_notification_http(realm: Realm, data: Mapping[str, Any]) -> None:
    if settings.TORNADO_SERVER and not settings.RUNNING_INSIDE_TORNADO:
        tornado_uri = get_tornado_uri(realm)
        requests_client.post(tornado_uri + '/notify_tornado', data=dict(
            data=ujson.dumps(data),
            secret=settings.SHARED_SECRET))
    else:
        process_notification(data)


def send_event(realm: Realm, event: Mapping[str, Any],
               users: Union[Iterable[int], Iterable[Mapping[str, Any]]]) -> None:
    """Send an event to Tornado, either via HTTP or directly."""
    port = get_tornado_port(realm)
    queue_json_publish(notify_tornado_queue_name(port),
                       dict(event=event, users=users),
                       lambda *args, **kwargs: send_notification_http(realm, *args, **kwargs))