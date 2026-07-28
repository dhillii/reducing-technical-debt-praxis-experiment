class EventProcessor:
    def __init__(self, event: Mapping[str, Any], users: Iterable[Mapping[str, Any]]) -> None:
        self.event = event
        self.users = users

    def process(self) -> None:
        if self.event['type'] == "message":
            self.process_message_event()
        elif self.event['type'] == "update_message":
            self.process_message_update_event()
        elif self.event['type'] == "delete_message":
            self.process_userdata_event()
        else:
            self.process_event()

    def process_message_event(self) -> None:
        send_to_clients = self.get_client_info_for_message_event()
        presence_idle_user_ids = self.event.get('presence_idle_user_ids', [])
        wide_dict = self.event['message_dict']

        sender_id = wide_dict['sender_id']
        message_id = wide_dict['id']
        message_type = wide_dict['type']
        sending_client = wide_dict['client']

        @cachify
        def get_client_payload(apply_markdown: bool, client_gravatar: bool) -> Dict[str, Any]:
            dct = copy.deepcopy(wide_dict)
            MessageDict.finalize_payload(dct, apply_markdown, client_gravatar)
            return dct

        extra_user_data = {}

        for user_data in self.users:
            user_profile_id = user_data['id']
            flags = user_data.get('flags', [])

            private_message = message_type == "private" and user_profile_id != sender_id
            mentioned = 'mentioned' in flags and 'read' not in flags
            stream_push_notify = user_data.get('stream_push_notify', False)
            stream_email_notify = user_data.get('stream_email_notify', False)

            idle = receiver_is_off_zulip(user_profile_id) or (user_profile_id in presence_idle_user_ids)
            always_push_notify = user_data.get('always_push_notify', False)
            stream_name = self.event.get('stream_name')
            result = maybe_enqueue_notifications(user_profile_id, message_id, private_message,
                                                 mentioned, stream_push_notify, stream_email_notify,
                                                 stream_name, always_push_notify, idle, {})
            result['stream_push_notify'] = stream_push_notify
            result['stream_email_notify'] = stream_email_notify
            extra_user_data[user_profile_id] = result

        for client_data in send_to_clients.values():
            client = client_data['client']
            flags = client_data['flags']
            is_sender = client_data.get('is_sender', False)

            if not client.accepts_messages():
                continue

            message_dict = get_client_payload(client.apply_markdown, client.client_gravatar)

            user_event = dict(type='message', message=message_dict, flags=flags)
            if extra_user_data.get(client.user_profile_id) is not None:
                user_event.update(extra_user_data[client.user_profile_id])

            if is_sender:
                local_message_id = self.event.get('local_id', None)
                if local_message_id is not None:
                    user_event["local_message_id"] = local_message_id

            if not client.accepts_event(user_event):
                continue

            client.add_event(user_event)

    def process_message_update_event(self) -> None:
        prior_mention_user_ids = set(self.event.get('prior_mention_user_ids', []))
        mention_user_ids = set(self.event.get('mention_user_ids', []))
        presence_idle_user_ids = set(self.event.get('presence_idle_user_ids', []))
        stream_push_user_ids = set(self.event.get('stream_push_user_ids', []))
        stream_email_user_ids = set(self.event.get('stream_email_user_ids', []))
        push_notify_user_ids = set(self.event.get('push_notify_user_ids', []))

        stream_name = self.event.get('stream_name')
        message_id = self.event['message_id']

        for user_data in self.users:
            user_profile_id = user_data['id']
            user_event = dict(self.event)
            for key in user_data.keys():
                if key != "id":
                    user_event[key] = user_data[key]

            maybe_enqueue_notifications_for_message_update(
                user_profile_id=user_profile_id,
                message_id=message_id,
                stream_name=stream_name,
                prior_mention_user_ids=prior_mention_user_ids,
                mention_user_ids=mention_user_ids,
                presence_idle_user_ids=presence_idle_user_ids,
                stream_push_user_ids=stream_push_user_ids,
                stream_email_user_ids=stream_email_user_ids,
                push_notify_user_ids=push_notify_user_ids,
            )

            for client in get_client_descriptors_for_user(user_profile_id):
                if client.accepts_event(user_event):
                    client.add_event(user_event)

    def process_userdata_event(self) -> None:
        for user_data in self.users:
            user_profile_id = user_data['id']
            user_event = dict(self.event)
            for key in user_data.keys():
                if key != "id":
                    user_event[key] = user_data[key]

            for client in get_client_descriptors_for_user(user_profile_id):
                if client.accepts_event(user_event):
                    client.add_event(user_event)

    def process_event(self) -> None:
        for user_profile_id in self.users:
            for client in get_client_descriptors_for_user(user_profile_id):
                if client.accepts_event(self.event):
                    client.add_event(dict(self.event))

    def get_client_info_for_message_event(self) -> Dict[str, ClientInfo]:
        send_to_clients = {}
        sender_queue_id = self.event.get('sender_queue_id', None)

        def is_sender_client(client: ClientDescriptor) -> bool:
            return (sender_queue_id is not None) and client.event_queue.id == sender_queue_id

        if 'stream_name' in self.event and not self.event.get("invite_only"):
            realm_id = self.event['realm_id']
            for client in get_client_descriptors_for_realm_all_streams(realm_id):
                send_to_clients[client.event_queue.id] = dict(
                    client=client,
                    flags=[],
                    is_sender=is_sender_client(client)
                )

        for user_data in self.users:
            user_profile_id = user_data['id']
            flags = user_data.get('flags', [])

            for client in get_client_descriptors_for_user(user_profile_id):
                send_to_clients[client.event_queue.id] = dict(
                    client=client,
                    flags=flags,
                    is_sender=is_sender_client(client)
                )

        return send_to_clients


def process_notification(notice: Mapping[str, Any]) -> None:
    event = notice['event']
    users = notice['users']
    start_time = time.time()
    processor = EventProcessor(event, users)
    processor.process()
    logging.debug("Tornado: Event %s for %s users took %sms" % (
        event['type'], len(users), int(1000 * (time.time() - start_time))))