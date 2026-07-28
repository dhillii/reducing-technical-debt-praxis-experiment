# -*- coding: utf-8 -*-
from django.db import IntegrityError
from django.db.models import Q, Max
from django.conf import settings
from django.http import HttpResponse
from django.test import TestCase, override_settings
from django.utils.timezone import now as timezone_now
from django.utils.timezone import utc as timezone_utc

from zerver.lib import bugdown
from zerver.decorator import JsonableError
from zerver.lib.test_runner import slow
from zerver.lib.cache import get_stream_cache_key, cache_delete
from zerver.lib.message import estimate_recent_messages

from zerver.lib.addressee import Addressee

from zerver.lib.actions import (
    check_message,
    check_send_stream_message,
    create_mirror_user_if_needed,
    do_add_alert_words,
    do_change_stream_invite_only,
    do_create_user,
    do_deactivate_user,
    do_send_messages,
    do_set_realm_property,
    extract_recipients,
    get_active_presence_idle_user_ids,
    get_client,
    get_last_message_id,
    get_user_info_for_message_updates,
    internal_prep_private_message,
    internal_prep_stream_message,
    internal_send_huddle_message,
    internal_send_message,
    internal_send_private_message,
    internal_send_stream_message,
    send_rate_limited_pm_notification_to_bot_owner,
)

from zerver.lib.create_user import (
    create_user_profile,
)

from zerver.lib.message import (
    MessageDict,
    bulk_access_messages,
    get_first_visible_message_id,
    get_raw_unread_data,
    maybe_update_first_visible_message_id,
    messages_for_ids,
    sew_messages_and_reactions,
    update_first_visible_message_id,
)

from zerver.lib.test_helpers import (
    get_user_messages,
    make_client,
    message_stream_count,
    most_recent_message,
    most_recent_usermessage,
    queries_captured,
    get_subscription,
)

from zerver.lib.test_classes import (
    ZulipTestCase,
)

from zerver.lib.soft_deactivation import (
    add_missing_messages,
    do_soft_activate_users,
    do_soft_deactivate_users,
    maybe_catch_up_soft_deactivated_user,
)

from zerver.models import (
    MAX_MESSAGE_LENGTH, MAX_SUBJECT_LENGTH,
    Message, Realm, Recipient, Stream, UserMessage, UserProfile, Attachment,
    RealmAuditLog, RealmDomain, get_realm, UserPresence, Subscription,
    get_stream, get_stream_recipient, get_system_bot, get_user, Reaction,
    flush_per_request_caches, ScheduledMessage
)


from zerver.lib.timestamp import convert_to_UTC, datetime_to_timestamp
from zerver.lib.timezone import get_timezone
from zerver.lib.upload import create_attachment
from zerver.lib.url_encoding import near_message_url

from zerver.views.messages import create_mirrored_message_users

from analytics.lib.counts import CountStat, LoggingCountStat, COUNT_STATS
from analytics.models import RealmCount

import datetime
import DNS
import mock
import time
import ujson
from typing import Any, Dict, List, Optional, Set

from collections import namedtuple

class MiscMessageTest(ZulipTestCase):
    def test_get_last_message_id(self) -> None:
        self.assertEqual(
            get_last_message_id(),
            Message.objects.latest('id').id
        )

        Message.objects.all().delete()

        self.assertEqual(get_last_message_id(), -1)

class TopicHistoryTest(ZulipTestCase):
    def test_topics_history_zephyr_mirror(self) -> None:
        user_profile = self.mit_user('sipbtest')
        stream_name = 'new_stream'

        # Send a message to this new stream from another user
        self.subscribe(self.mit_user("starnine"), stream_name)
        stream = get_stream(stream_name, user_profile.realm)
        self.send_stream_message(self.mit_email("starnine"), stream_name,
                                 topic_name="secret topic", sender_realm="zephyr")

        # Now subscribe this MIT user to the new stream and verify
        # that the new topic is not accessible
        self.login(user_profile.email, realm=user_profile.realm)
        self.subscribe(user_profile, stream_name)
        endpoint = '/json/users/me/%d/topics' % (stream.id,)
        result = self.client_get(endpoint, dict(), subdomain="zephyr")
        self.assert_json_success(result)
        history = result.json()['topics']
        self.assertEqual(history, [])

    def test_topics_history(self) -> None:
        user_profile = self.example_user('iago')
        email = user_profile.email
        stream_name = 'Verona'
        self.login(email)

        stream = get_stream(stream_name, user_profile.realm)
        recipient = get_stream_recipient(stream.id)

        def create_test_message(topic: str) -> int:
            hamlet = self.example_user('hamlet')
            message = Message.objects.create(
                sender=hamlet,
                recipient=recipient,
                subject=topic,
                content='whatever',
                pub_date=timezone_now(),
                sending_client=get_client('whatever'),
            )
            UserMessage.objects.create(
                user_profile=user_profile,
                message=message,
                flags=0,
            )
            return message.id

        # Create old messages with strange spellings.
        create_test_message('topic2')
        create_test_message('toPIc1')
        create_test_message('toPIc0')
        create_test_message('topic2')
        create_test_message('topic2')
        create_test_message('Topic2')

        # Create new messages
        topic2_msg_id = create_test_message('topic2')
        create_test_message('topic1')
        create_test_message('topic1')
        topic1_msg_id = create_test_message('topic1')
        topic0_msg_id = create_test_message('topic0')

        endpoint = '/json/users/me/%d/topics' % (stream.id,)
        result = self.client_get(endpoint, dict())
        self.assert_json_success(result)
        history = result.json()['topics']

        # We only look at the most recent three topics, because
        # the prior fixture data may be unreliable.
        history = history[:3]

        self.assertEqual([topic['name'] for topic in history], [
            'topic0',
            'topic1',
            'topic2',
        ])

        self.assertEqual([topic['max_id'] for topic in history], [
            topic0_msg_id,
            topic1_msg_id,
            topic2_msg_id,
        ])

        # Now try as cordelia, who we imagine as a totally new user in
        # that she doesn't have UserMessage rows.  We should see the
        # same results for a public stream.
        self.login(self.example_email("cordelia"))
        result = self.client_get(endpoint, dict())
        self.assert_json_success(result)
        history = result.json()['topics']

        # We only look at the most recent three topics, because
        # the prior fixture data may be unreliable.
        history = history[:3]

        self.assertEqual([topic['name'] for topic in history], [
            'topic0',
            'topic1',
            'topic2',
        ])
        self.assertIn('topic0', [topic['name'] for topic in history])

        self.assertEqual([topic['max_id'] for topic in history], [
            topic0_msg_id,
            topic1_msg_id,
            topic2_msg_id,
        ])

        # Now make stream private, but subscribe cordelia
        do_change_stream_invite_only(stream, True)
        self.subscribe(self.example_user("cordelia"), stream.name)

        result = self.client_get(endpoint, dict())
        self.assert_json_success(result)
        history = result.json()['topics']
        history = history[:3]

        # Cordelia doesn't have these recent history items when we
        # wasn't subscribed in her results.
        self.assertNotIn('topic0', [topic['name'] for topic in history])
        self.assertNotIn('topic1', [topic['name'] for topic in history])
        self.assertNotIn('topic2', [topic['name'] for topic in history])

    def test_bad_stream_id(self) -> None:
        email = self.example_email("iago")
        self.login(email)

        # non-sensible stream id
        endpoint = '/json/users/me/9999999999/topics'
        result = self.client_get(endpoint, dict())
        self.assert_json_error(result, 'Invalid stream id')

        # out of realm
        bad_stream = self.make_stream(
            'mit_stream',
            realm=get_realm('zephyr')
        )
        endpoint = '/json/users/me/%s/topics' % (bad_stream.id,)
        result = self.client_get(endpoint, dict())
        self.assert_json_error(result, 'Invalid stream id')

        # private stream to which I am not subscribed
        private_stream = self.make_stream(
            'private_stream',
            invite_only=True
        )
        endpoint = '/json/users/me/%s/topics' % (private_stream.id,)
        result = self.client_get(endpoint, dict())
        self.assert_json_error(result, 'Invalid stream id')


class TestCrossRealmPMs(ZulipTestCase):
    def make_realm(self, domain: str) -> Realm:
        realm = Realm.objects.create(string_id=domain, invite_required=False)
        RealmDomain.objects.create(realm=realm, domain=domain)
        return realm

    def create_user(self, email: str) -> UserProfile:
        subdomain = email.split("@")[1]
        self.register(email, 'test', subdomain=subdomain)
        return get_user(email, get_realm(subdomain))

    @slow("Sends a large number of messages")
    @override_settings(CROSS_REALM_BOT_EMAILS=['feedback@zulip.com',
                                               'welcome-bot@zulip.com',
                                               'support@3.example.com'])
    def test_realm_scenarios(self) -> None:
        self.make_realm('1.example.com')
        r2 = self.make_realm('2.example.com')
        self.make_realm('3.example.com')

        def assert_message_received(to_user: UserProfile, from_user: UserProfile) -> None:
            messages = get_user_messages(to_user)
            self.assertEqual(messages[-1].sender.id, from_user.id)

        def assert_invalid_email() -> Any:
            return self.assertRaisesRegex(
                JsonableError,
                'Invalid email ')

        user1_email = 'user1@1.example.com'
        user1a_email = 'user1a@1.example.com'
        user2_email = 'user2@2.example.com'
        user3_email = 'user3@3.example.com'
        feedback_email = 'feedback@zulip.com'
        support_email = 'support@3.example.com'  # note: not zulip.com

        user1 = self.create_user(user1_email)
        user1a = self.create_user(user1a_email)
        user2 = self.create_user(user2_email)
        self.create_user(user3_email)
        feedback_bot = get_system_bot(feedback_email)
        with self.settings(CROSS_REALM_BOT_EMAILS=['feedback@zulip.com', 'welcome-bot@zulip.com']):
            support_bot = self.create_user(support_email)

        # Users can PM themselves
        self.send_personal_message(user1_email, user1_email, sender_realm="1.example.com")
        assert_message_received(user1, user1)

        # Users on the same realm can PM each other
        self.send_personal_message(user1_email, user1a_email, sender_realm="1.example.com")
        assert_message_received(user1a, user1)

        # Cross-realm bots in the zulip.com realm can PM any realm
        internal_send_private_message(
            realm=r2,
            sender=get_system_bot(feedback_email),
            recipient_user=get_user(user2_email, r2),
            content='bla',
        )
        assert_message_received(user2, feedback_bot)

        # All users can PM cross-realm bots in the zulip.com realm
        self.send_personal_message(user1_email, feedback_email, sender_realm="1.example.com")
        assert_message_received(feedback_bot, user1)

        # Users can PM cross-realm bots on non-zulip realms.
        self.send_personal_message(user1_email, support_email, sender_realm="1.example.com")
        assert_message_received(support_bot, user1)

        # Allow sending PMs to two different cross-realm bots simultaneously.
        self.send_huddle_message(user1_email, [feedback_email, support_email],
                                 sender_realm="1.example.com")
        assert_message_received(feedback_bot, user1)
        assert_message_received(support_bot, user1)

        # Prevent old loophole where I could send PMs to other users as long
        # as I copied a cross-realm bot from the same realm.
        with assert_invalid_email():
            self.send_huddle_message(user1_email, [user3_email, support_email],
                                     sender_realm="1.example.com")

        # Users on three different realms can't PM each other,
        # even if one of the users is a cross-realm bot.
        with assert_invalid_email():
            self.send_huddle_message(user1_email, [user2_email, feedback_email],
                                     sender_realm="1.example.com")

        with assert_invalid_email():
            self.send_huddle_message(feedback_email, [user1_email, user2_email])

        # Users on the different realms cannot PM each other
        with assert_invalid_email():
            self.send_personal_message(user1_email, user2_email, sender_realm="1.example.com")

        # Users on non-zulip realms can't PM "ordinary" Zulip users
        with assert_invalid_email():
            self.send_personal_message(user1_email, "hamlet@zulip.com", sender_realm="1.example.com")

        # Users on three different realms cannot PM each other
        with assert_invalid_email():
            self.send_huddle_message(user1_email, [user2_email, user3_email],
                                     sender_realm="1.example.com")


class InternalPrepTest(ZulipTestCase):

    def test_returns_for_internal_sends(self) -> None:
        bad_content = ''
        realm = get_realm('zulip')
        cordelia = self.example_user('cordelia')
        hamlet = self.example_user('hamlet')
        othello = self.example_user('othello')
        stream_name = 'Verona'

        with mock.patch('logging.exception') as m:
            internal_send_private_message(
                realm=realm,
                sender=cordelia,
                recipient_user=hamlet,
                content=bad_content,
            )
        arg = m.call_args_list[0][0][0]
        self.assertIn('Message must not be empty', arg)

        with mock.patch('logging.exception') as m:
            internal_send_huddle_message(
                realm=realm,
                sender=cordelia,
                emails=[hamlet.email, othello.email],
                content=bad_content,
            )
        arg = m.call_args_list[0][0][0]
        self.assertIn('Message must not be empty', arg)

        with mock.patch('logging.exception') as m:
            internal_send_stream_message(
                realm=realm,
                sender=cordelia,
                stream_name=stream_name,
                topic='whatever',
                content=bad_content,
            )
        arg = m.call_args_list[0][0][0]
        self.assertIn('Message must not be empty', arg)

        with mock.patch('logging.exception') as m:
            internal_send_message(
                realm=realm,
                sender_email=settings.ERROR_BOT,
                recipient_type_name='stream',
                recipients=stream_name,
                topic_name='whatever',
                content=bad_content,
            )
        arg = m.call_args_list[0][0][0]
        self.assertIn('Message must not be empty', arg)

    def test_error_handling(self) -> None:
        realm = get_realm('zulip')
        sender = self.example_user('cordelia')
        recipient_user = self.example_user('hamlet')
        content = 'x' * 15000

        result = internal_prep_private_message(
            realm=realm,
            sender=sender,
            recipient_user=recipient_user,
            content=content)
        message = result['message']
        self.assertIn('message was too long', message.content)

        with self.assertRaises(RuntimeError):
            internal_prep_private_message(
                realm=None,
                sender=sender,
                recipient_user=recipient_user,
                content=content)

        recipient_user = self.mit_user('starnine')
        with mock.patch('logging.exception') as logging_mock:
            result = internal_prep_private_message(
                realm=realm,
                sender=sender,
                recipient_user=recipient_user,
                content=content)
        arg = logging_mock.call_args_list[0][0][0]
        prefix = "Error queueing internal message by cordelia@zulip.com: You can't send private messages outside of your organization."
        self.assertTrue(arg.startswith(prefix))

    def test_ensure_stream_gets_called(self) -> None:
        realm = get_realm('zulip')
        sender = self.example_user('cordelia')
        stream_name = 'test_stream'
        topic = 'whatever'
        content = 'hello'

        internal_prep_stream_message(
            realm=realm,
            sender=sender,
            stream_name=stream_name,
            topic=topic,
            content=content)

        Stream.objects.get(name=stream_name, realm_id=realm.id)


class ExtractedRecipientsTest(TestCase):
    def test_extract_recipients(self) -> None:
        s = ujson.dumps([' alice@zulip.com ', ' bob@zulip.com ', '   ', 'bob@zulip.com'])
        self.assertEqual(sorted(extract_recipients(s)), ['alice@zulip.com', 'bob@zulip.com'])

        s = 'alice@zulip.com    '
        self.assertEqual(extract_recipients(s), ['alice@zulip.com'])

        s = '"alice@zulip.com"'
        self.assertEqual(extract_recipients(s), ['alice@zulip.com'])

        s = 'bob@zulip.com, alice@zulip.com'
        self.assertEqual(sorted(extract_recipients(s)), ['alice@zulip.com', 'bob@zulip.com'])

        s = '"bob@zulip.com,alice@zulip.com"'
        self.assertEqual(sorted(extract_recipients(s)), ['alice@zulip.com', 'bob@zulip.com'])

        s = ujson.dumps(dict(color='red'))
        with self.assertRaisesRegex(ValueError, 'Invalid data type for recipients'):
            extract_recipients(s)


class PersonalMessagesTest(ZulipTestCase):

    def test_near_pm_message_url(self) -> None:
        realm = get_realm('zulip')
        message = dict(
            type='personal',
            id=555,
            display_recipient=[
                dict(id=77),
                dict(id=80),
            ],
        )
        url = near_message_url(
            realm=realm,
            message=message,
        )
        self.assertEqual(url, 'http://zulip.testserver/#narrow/pm-with/77,80-pm/near/555')

    def test_is_private_flag_not_leaked(self) -> None:
        self.login(self.example_email("hamlet"))
        self.send_personal_message(self.example_email("hamlet"),
                                   self.example_email("cordelia"),
                                   "test")
        for msg in self.get_messages():
            self.assertNotIn('is_private', msg['flags'])

    def test_auto_subbed_to_personals(self) -> None:
        test_email = self.nonreg_email('test')
        self.register(test_email, "test")
        user_profile = self.nonreg_user('test')
        old_messages_count = message_stream_count(user_profile)
        self.send_personal_message(test_email, test_email)
        new_messages_count = message_stream_count(user_profile)
        self.assertEqual(new_messages_count, old_messages_count + 1)

        recipient = Recipient.objects.get(type_id=user_profile.id,
                                          type=Recipient.PERSONAL)
        message = most_recent_message(user_profile)
        self.assertEqual(message.recipient, recipient)

        with mock.patch('zerver.models.get_display_recipient', return_value='recip'):
            self.assertEqual(str(message),
                             '<Message: recip /  / '
                             '<UserProfile: test@zulip.com <Realm: zulip 1>>>')

            user_message = most_recent_usermessage(user_profile)
            self.assertEqual(str(user_message),
                             '<UserMessage: recip / test@zulip.com ([])>'
                             )

    @slow("checks several profiles")
    def test_personal_to_self(self) -> None:
        old_user_profiles = list(UserProfile.objects.all())
        test_email = self.nonreg_email('test1')
        self.register(test_email, "test1")

        old_messages = []
        for user_profile in old_user_profiles:
            old_messages.append(message_stream_count(user_profile))

        self.send_personal_message(test_email, test_email)

        new_messages = []
        for user_profile in old_user_profiles:
            new_messages.append(message_stream_count(user_profile))

        self.assertEqual(old_messages, new_messages)

        user_profile = self.nonreg_user('test1')
        recipient = Recipient.objects.get(type_id=user_profile.id, type=Recipient.PERSONAL)
        self.assertEqual(most_recent_message(user_profile).recipient, recipient)

    def assert_personal(self, sender_email: str, receiver_email: str, content: str="testcontent") -> None:
        realm = get_realm('zulip')
        sender = get_user(sender_email, realm)
        receiver = get_user(receiver_email, realm)

        sender_messages = message_stream_count(sender)
        receiver_messages = message_stream_count(receiver)

        other_user_profiles = UserProfile.objects.filter(~Q(email=sender_email) &
                                                         ~Q(email=receiver_email))
        old_other_messages = [message_stream_count(user_profile) for user_profile in other_user_profiles]

        self.send_personal_message(sender_email, receiver_email, content)

        new_other_messages = [message_stream_count(user_profile) for user_profile in other_user_profiles]
        self.assertEqual(old_other_messages, new_other_messages)

        self.assertEqual(message_stream_count(sender), sender_messages + 1)
        self.assertEqual(message_stream_count(receiver), receiver_messages + 1)

        recipient = Recipient.objects.get(type_id=receiver.id, type=Recipient.PERSONAL)
        self.assertEqual(most_recent_message(sender).recipient, recipient)
        self.assertEqual(most_recent_message(receiver).recipient, recipient)

    def test_personal(self) -> None:
        self.login(self.example_email("hamlet"))
        self.assert_personal(self.example_email("hamlet"), self.example_email("othello"))

    def test_non_ascii_personal(self) -> None:
        self.login(self.example_email("hamlet"))
        self.assert_personal(self.example_email("hamlet"), self.example_email("othello"), u"hümbüǵ")


class StreamMessagesTest(ZulipTestCase):

    def assert_stream_message(self, stream_name: str, topic_name: str="test topic",
                              content: str="test content") -> None:
        realm = get_realm('zulip')
        subscribers = self.users_subscribed_to_stream(stream_name, realm)

        subscribers = [subscriber for subscriber in subscribers
                       if subscriber.bot_type != UserProfile.OUTGOING_WEBHOOK_BOT]

        old_subscriber_messages = [message_stream_count(subscriber) for subscriber in subscribers]

        non_subscribers = [user_profile for user_profile in UserProfile.objects.all()
                           if user_profile not in subscribers]
        old_non_subscriber_messages = [message_stream_count(non_subscriber) for non_subscriber in non_subscribers]

        non_bot_subscribers = [user_profile for user_profile in subscribers
                               if not user_profile.is_bot]
        a_subscriber_email = non_bot_subscribers[0].email
        self.login(a_subscriber_email)
        self.send_stream_message(a_subscriber_email, stream_name,
                                 content=content, topic_name=topic_name)

        new_subscriber_messages = [message_stream_count(subscriber) for subscriber in subscribers]
        new_non_subscriber_messages = [message_stream_count(non_subscriber) for non_subscriber in non_subscribers]

        self.assertEqual(old_non_subscriber_messages, new_non_subscriber_messages)
        self.assertEqual(new_subscriber_messages, [elt + 1 for elt in old_subscriber_messages])

    def test_performance(self) -> None:
        num_messages = 2
        num_extra_users = 10

        sender = self.example_user('cordelia')
        realm = sender.realm
        message_content = 'whatever'
        stream = get_stream('Denmark', realm)
        subject = 'lunch'
        recipient = get_stream_recipient(stream.id)
        sending_client = make_client(name="test suite")

        for i in range(num_extra_users):
            long_term_idle = i % 2 > 0
            email = 'foo%d@example.com' % (i,)
            user = UserProfile.objects.create(
                realm=realm,
                email=email,
                pointer=0,
                long_term_idle=long_term_idle,
            )
            Subscription.objects.create(
                user_profile=user,
                recipient=recipient
            )

        def send_test_message() -> None:
            message = Message(
                sender=sender,
                recipient=recipient,
                subject=subject,
                content=message_content,
                pub_date=timezone_now(),
                sending_client=sending_client,
            )
            do_send_messages([dict(message=message)])

        before_um_count = UserMessage.objects.count()

        t = time.time()
        for i in range(num_messages):
            send_test_message()

        delay = time.time() - t
        assert(delay)
        after_um_count = UserMessage.objects.count()
        ums_created = after_um_count - before_um_count

        num_active_users = num_extra_users / 2
        self.assertTrue(ums_created > (num_active_users * num_messages))

    def test_not_too_many_queries(self) -> None:
        recipient_list = [self.example_user("hamlet"), self.example_user("iago"),
                          self.example_user("cordelia"), self.example_user("othello")]
        for user_profile in recipient_list:
            self.subscribe(user_profile, "Denmark")

        sender = self.example_user('hamlet')
        sending_client = make_client(name="test suite")
        stream_name = 'Denmark'
        topic_name = 'foo'
        content = 'whatever'
        realm = sender.realm

        flush_per_request_caches()
        cache_delete(get_stream_cache_key(stream_name, realm.id))
        with queries_captured() as queries:
            check_send_stream_message(
                sender=sender,
                client=sending_client,
                stream_name=stream_name,
                topic=topic_name,
                body=content,
            )
        self.assert_length(queries, 14)

    def test_stream_message_dict(self) -> None:
        user_profile = self.example_user('iago')
        self.subscribe(user_profile, "Denmark")
        self.send_stream_message(self.example_email("hamlet"), "Denmark",
                                 content="whatever", topic_name="my topic")
        message = most_recent_message(user_profile)
        row = MessageDict.get_raw_db_rows([message.id])[0]
        dct = MessageDict.build_dict_from_raw_db_row(row)
        MessageDict.post_process_dicts([dct], apply_markdown=True, client_gravatar=False)
        self.assertEqual(dct['display_recipient'], 'Denmark')

        stream = get_stream('Denmark', user_profile.realm)
        self.assertEqual(dct['stream_id'], stream.id)

    def test_stream_message_unicode(self) -> None:
        user_profile = self.example_user('iago')
        self.subscribe(user_profile, "Denmark")
        self.send_stream_message(self.example_email("hamlet"), "Denmark",
                                 content="whatever", topic_name="my topic")
        message = most_recent_message(user_profile)
        self.assertEqual(str(message),
                         u'<Message: Denmark / my topic / '
                         '<UserProfile: hamlet@zulip.com <Realm: zulip 1>>>')

    def test_message_mentions(self) -> None:
        user_profile = self.example_user('iago')
        self.subscribe(user_profile, "Denmark")
        self.send_stream_message(self.example_email("hamlet"), "Denmark",
                                 content="test @**Iago** rules")
        message = most_recent_message(user_profile)
        assert(UserMessage.objects.get(user_profile=user_profile, message=message).flags.mentioned.is_set)

    def test_is_private_flag(self) -> None:
        user_profile = self.example_user('iago')
        self.subscribe(user_profile, "Denmark")

        self.send_stream_message(self.example_email("hamlet"), "Denmark",
                                 content="test")
        message = most_recent_message(user_profile)
        self.assertFalse(UserMessage.objects.get(user_profile=user_profile, message=message).flags.is_private.is_set)

        self.send_personal_message(self.example_email("hamlet"), user_profile.email,
                                   content="test")
        message = most_recent_message(user_profile)
        self.assertTrue(UserMessage.objects.get(user_profile=user_profile, message=message).flags.is_private.is_set)

    def _send_stream_message(self, email: str, stream_name: str, content: str) -> Set[int]:
        with mock.patch('zerver.lib.actions.send_event') as m:
            self.send_stream_message(
                email,
                stream_name,
                content=content
            )
        self.assertEqual(m.call_count, 1)
        users = m.call_args[0][2]
        return {u['id'] for u in users}

    def test_unsub_mention(self) -> None:
        cordelia = self.example_user('cordelia')
        hamlet = self.example_user('hamlet')
        stream_name = 'Test Stream'

        self.subscribe(hamlet, stream_name)

        UserMessage.objects.filter(user_profile=cordelia).delete()

        def mention_cordelia() -> Set[int]:
            content = 'test @**Cordelia Lear** rules'
            return self._send_stream_message(email=hamlet.email,
                                              stream_name=stream_name,
                                              content=content)

        def num_cordelia_messages() -> int:
            return UserMessage.objects.filter(user_profile=cordelia).count()

        user_ids = mention_cordelia()
        self.assertEqual(0, num_cordelia_messages())
        self.assertNotIn(cordelia.id, user_ids)

        self.subscribe(cordelia, stream_name)
        user_ids = mention_cordelia()
        self.assertIn(cordelia.id, user_ids)
        self.assertEqual(1, num_cordelia_messages())

    def test_message_bot_mentions(self) -> None:
        cordelia = self.example_user('cordelia')
        hamlet = self.example_user('hamlet')
        realm = hamlet.realm
        stream_name = 'Test Stream'

        self.subscribe(hamlet, stream_name)

        normal_bot = do_create_user(
            email='normal-bot@zulip.com',
            password='',
            realm=realm,
            full_name='Normal Bot',
            short_name='',
            bot_type=UserProfile.DEFAULT_BOT,
            bot_owner=cordelia,
        )

        content = 'test @**Normal Bot** rules'

        user_ids = self._send_stream_message(email=hamlet.email,
                                             stream_name=stream_name,
                                             content=content)

        self.assertIn(normal_bot.id, user_ids)
        user_message = most_recent_usermessage(normal_bot)
        self.assertEqual(user_message.message.content, content)
        self.assertTrue(user_message.flags.mentioned)

    def test_stream_message_mirroring(self) -> None:
        from zerver.lib.actions import do_change_is_admin
        user_profile = self.example_user('iago')
        email = user_profile.email

        do_change_is_admin(user_profile, True, 'api_super_user')
        result = self.api_post(email, "/api/v1/messages", {"type": "stream",
                                                           "to": "Verona",
                                                           "sender": self.example_email("cordelia"),
                                                           "client": "test suite",
                                                           "subject": "announcement",
                                                           "content": "Everyone knows Iago rules",
                                                           "forged": "true"})
        self.assert_json_success(result)
        do_change_is_admin(user_profile, False, 'api_super_user')
        result = self.api_post(email, "/api/v1/messages", {"type": "stream",
                                                           "to": "Verona",
                                                           "sender": self.example_email("cordelia"),
                                                           "client": "test suite",
                                                           "subject": "announcement",
                                                           "content": "Everyone knows Iago rules",
                                                           "forged": "true"})
        self.assert_json_error(result, "User not authorized for this query")

    def test_message_to_stream(self) -> None:
        self.assert_stream_message("Scotland")

    def test_non_ascii_stream_message(self) -> None:
        self.login(self.example_email("hamlet"))
        non_ascii_stream_name = u"hümbüǵ"
        realm = get_realm("zulip")
        stream = self.make_stream(non_ascii_stream_name)
        for user_profile in UserProfile.objects.filter(is_active=True, is_bot=False,
                                                       realm=realm)[0:3]:
            self.subscribe(user_profile, stream.name)

        self.assert_stream_message(non_ascii_stream_name, topic_name=u"hümbüǵ",
                                   content=u"hümbüǵ")

    def test_get_raw_unread_data_for_huddle_messages(self) -> None:
        users = [
            self.example_user('hamlet'),
            self.example_user('cordelia'),
            self.example_user('iago'),
            self.example_user('prospero'),
            self.example_user('othello'),
        ]

        message1_id = self.send_huddle_message(users[0].email,
                                               [user.email for user in users],
                                               "test content 1")
        message2_id = self.send_huddle_message(users[0].email,
                                               [user.email for user in users],
                                               "test content 2")

        msg_data = get_raw_unread_data(users[1])

        self.assertIn(message1_id, msg_data["huddle_dict"].keys())
        self.assertIn(message2_id, msg_data["huddle_dict"].keys())
        self.assertEqual(len(msg_data["huddle_dict"].keys()), 2)


class MessageDictTest(ZulipTestCase):
    @slow('builds lots of messages')
    def test_bulk_message_fetching(self) -> None:
        sender = self.example_user('othello')
        receiver = self.example_user('hamlet')
        pm_recipient = Recipient.objects.get(type_id=receiver.id, type=Recipient.PERSONAL)
        stream_name = u'Çiğdem'
        stream = self.make_stream(stream_name)
        stream_recipient = Recipient.objects.get(type_id=stream.id, type=Recipient.STREAM)
        sending_client = make_client(name="test suite")

        ids = []
        for i in range(300):
            for recipient in [pm_recipient, stream_recipient]:
                message = Message(
                    sender=sender,
                    recipient=recipient,
                    subject='whatever',
                    content='whatever %d' % i,
                    rendered_content='DOES NOT MATTER',
                    rendered_content_version=bugdown.version,
                    pub_date=timezone_now(),
                    sending_client=sending_client,
                    last_edit_time=timezone_now(),
                    edit_history='[]'
                )
                message.save()
                ids.append(message.id)

                Reaction.objects.create(user_profile=sender, message=message,
                                        emoji_name='simple_smile')

        num_ids = len(ids)
        self.assertTrue(num_ids >= 600)

        flush_per_request_caches()
        t = time.time()
        with queries_captured() as queries:
            rows = list(MessageDict.get_raw_db_rows(ids))

            objs = [
                MessageDict.build_dict_from_raw_db_row(row)
                for row in rows
            ]
            MessageDict.post_process_dicts(objs, apply_markdown=False, client_gravatar=False)

        delay = time.time() - t
        error_msg = "Number of ids: {}. Time delay: {}".format(num_ids, delay)
        self.assertTrue(delay < 0.0015 * num_ids, error_msg)
        self.assert_length(queries, 7)
        self.assertEqual(len(rows), num_ids)

    def test_applying_markdown(self) -> None:
        sender = self.example_user('othello')
        receiver = self.example_user('hamlet')
        recipient = Recipient.objects.get(type_id=receiver.id, type=Recipient.PERSONAL)
        sending_client = make_client(name="test suite")
        message = Message(
            sender=sender,
            recipient=recipient,
            subject='whatever',
            content='hello **world**',
            pub_date=timezone_now(),
            sending_client=sending_client,
            last_edit_time=timezone_now(),
            edit_history='[]'
        )
        message.save()

        row = MessageDict.get_raw_db_rows([message.id])[0]
        dct = MessageDict.build_dict_from_raw_db_row(row)
        expected_content = '<p>hello <strong>world</strong></p>'
        self.assertEqual(dct['rendered_content'], expected_content)
        message = Message.objects.get(id=message.id)
        self.assertEqual(message.rendered_content, expected_content)
        self.assertEqual(message.rendered_content_version, bugdown.version)

    @mock.patch("zerver.lib.message.bugdown.convert")
    def test_applying_markdown_invalid_format(self, convert_mock: Any) -> None:
        convert_mock.return_value = None
        sender = self.example_user('othello')
        receiver = self.example_user('hamlet')
        recipient = Recipient.objects.get(type_id=receiver.id, type=Recipient.PERSONAL)
        sending_client = make_client(name="test suite")
        message = Message(
            sender=sender,
            recipient=recipient,
            subject='whatever',
            content='hello **world**',
            pub_date=timezone_now(),
            sending_client=sending_client,
            last_edit_time=timezone_now(),
            edit_history='[]'
        )
        message.save()

        row = MessageDict.get_raw_db_rows([message.id])[0]
        dct = MessageDict.build_dict_from_raw_db_row(row)
        error_content = '<p>[Zulip note: Sorry, we could not understand the formatting of your message]</p>'
        self.assertEqual(dct['rendered_content'], error_content)

    def test_reaction(self) -> None:
        sender = self.example_user('othello')
        receiver = self.example_user('hamlet')
        recipient = Recipient.objects.get(type_id=receiver.id, type=Recipient.PERSONAL)
        sending_client = make_client(name="test suite")
        message = Message(
            sender=sender,
            recipient=recipient,
            subject='whatever',
            content='hello **world**',
            pub_date=timezone_now(),
            sending_client=sending_client,
            last_edit_time=timezone_now(),
            edit_history='[]'
        )
        message.save()

        reaction = Reaction.objects.create(
            message=message, user_profile=sender,
            emoji_name='simple_smile')
        row = MessageDict.get_raw_db_rows([message.id])[0]
        msg_dict = MessageDict.build_dict_from_raw_db_row(row)
        self.assertEqual(msg_dict['reactions'][0]['emoji_name'],
                         reaction.emoji_name)
        self.assertEqual(msg_dict['reactions'][0]['user']['id'],
                         sender.id)
        self.assertEqual(msg_dict['reactions'][0]['user']['email'],
                         sender.email)
        self.assertEqual(msg_dict['reactions'][0]['user']['full_name'],
                         sender.full_name)

    def test_missing_anchor(self) -> None:
        self.login(self.example_email("hamlet"))
        result = self.client_get(
            '/json/messages?use_first_unread_anchor=false&num_before=1&num_after=1')
        self.assert_json_error(
            result, "Missing 'anchor' argument (or set 'use_first_unread_anchor'=True).")


class SewMessageAndReactionTest(ZulipTestCase):
    def test_sew_messages_and_reaction(self) -> None:
        sender = self.example_user('othello')
        receiver = self.example_user('hamlet')
        pm_recipient = Recipient.objects.get(type_id=receiver.id, type=Recipient.PERSONAL)
        stream_name = u'Çiğdem'
        stream = self.make_stream(stream_name)
        stream_recipient = Recipient.objects.get(type_id=stream.id, type=Recipient.STREAM)
        sending_client = make_client(name="test suite")

        needed_ids = []
        for i in range(5):
            for recipient in [pm_recipient, stream_recipient]:
                message = Message(
                    sender=sender,
                    recipient=recipient,
                    subject='whatever',
                    content='whatever %d' % i,
                    pub_date=timezone_now(),
                    sending_client=sending_client,
                    last_edit_time=timezone_now(),
                    edit_history='[]'
                )
                message.save()
                needed_ids.append(message.id)
                reaction = Reaction(user_profile=sender, message=message,
                                    emoji_name='simple_smile')
                reaction.save()

        messages = Message.objects.filter(id__in=needed_ids).values(
            *['id', 'content'])
        reactions = Reaction.get_raw_db_rows(needed_ids)
        tied_data = sew_messages_and_reactions(messages, reactions)
        for data in tied_data:
            self.assertEqual(len(data['reactions']), 1)
            self.assertEqual(data['reactions'][0]['emoji_name'],
                             'simple_smile')
            self.assertTrue(data['id'])
            self.assertTrue(data['content'])


class MessagePOSTTest(ZulipTestCase):

    def test_message_to_self(self) -> None:
        self.login(self.example_email("hamlet"))
        result = self.client_post("/json/messages", {"type": "stream",
                                                     "to": "Verona",
                                                     "client": "test suite",
                                                     "content": "Test message",
                                                     "subject": "Test subject"})
        self.assert_json_success(result)

    def test_api_message_to_self(self) -> None:
        email = self.example_email("hamlet")
        result = self.api_post(email, "/api/v1/messages", {"type": "stream",
                                                           "to": "Verona",
                                                           "client": "test suite",
                                                           "content": "Test message",
                                                           "subject": "Test subject"})
        self.assert_json_success(result)

    def test_message_to_announce(self) -> None:
        user_profile = self.example_user("iago")
        self.login(user_profile.email)

        stream_name = "Verona"
        stream = get_stream(stream_name, user_profile.realm)
        stream.is_announcement_only = True
        stream.save()
        result = self.client_post("/json/messages", {"type": "stream",
                                                     "to": stream_name,
                                                     "client": "test suite",
                                                     "content": "Test message",
                                                     "subject": "Test subject"})
        self.assert_json_success(result)

        notification_bot = get_system_bot("notification-bot@zulip.com")
        result = self.api_post(notification_bot.email,
                               "/json/messages", {"type": "stream",
                                                  "to": stream_name,
                                                  "client": "test suite",
                                                  "content": "Test message",
                                                  "subject": "Test subject"})
        self.assert_json_success(result)

    def test_message_fail_to_announce(self) -> None:
        user_profile = self.example_user("hamlet")
        self.login(user_profile.email)

        stream_name = "Verona"
        stream = get_stream(stream_name, user_profile.realm)
        stream.is_announcement_only = True
        stream.save()
        result = self.client_post("/json/messages", {"type": "stream",
                                                     "to": stream_name,
                                                     "client": "test suite",
                                                     "content": "Test message",
                                                     "subject": "Test subject"})
        self.assert_json_error(result, "Only organization administrators can send to this stream.")

    def test_api_message_with_default_to(self) -> None:
        user_profile = self.example_user('hamlet')
        email = user_profile.email
        user_profile.default_sending_stream_id = get_stream('Verona', user_profile.realm).id
        user_profile.save()
        result = self.api_post(email, "/api/v1/messages", {"type": "stream",
                                                           "client": "test suite",
                                                           "content": "Test message no to",
                                                           "subject": "Test subject"})
        self.assert_json_success(result)

        sent_message = self.get_last_message()
        self.assertEqual(sent_message.content, "Test message no to")

    def test_message_to_nonexistent_stream(self) -> None:
        self.login(self.example_email("hamlet"))
        self.assertFalse(Stream.objects.filter(name="nonexistent_stream"))
        result = self.client_post("/json/messages", {"type": "stream",
                                                     "to": "nonexistent_stream",
                                                     "client": "test suite",
                                                     "content": "Test message",
                                                     "subject": "Test subject"})
        self.assert_json_error(result, "Stream 'nonexistent_stream' does not exist")

    def test_message_to_nonexistent_stream_with_bad_characters(self) -> None:
        self.login(self.example_email("hamlet"))
        self.assertFalse(Stream.objects.filter(name="""&<"'><non-existent>"""))
        result = self.client_post("/json/messages", {"type": "stream",
                                                     "to": """&<"'><non-existent>""",
                                                     "client": "test suite",
                                                     "content": "Test message",
                                                     "subject": "Test subject"})
        self.assert_json_error(result, "Stream '&amp;&lt;&quot;&#39;&gt;&lt;non-existent&gt;' does not exist")

    def test_personal_message(self) -> None:
        self.login(self.example_email("hamlet"))
        result = self.client_post("/json/messages", {"type": "private",
                                                     "content": "Test message",
                                                     "client": "test suite",
                                                     "to": self.example_email("othello")})
        self.assert_json_success(result)

    def test_personal_message_copying_self(self) -> None:
        self.login(self.example_email("hamlet"))
        result = self.client_post("/json/messages", {
            "type": "private",
            "content": "Test message",
            "client": "test suite",
            "to": ujson.dumps([self.example_email("othello"),
                               self.example_email("hamlet")])})
        self.assert_json_success(result)
        msg = self.get_last_message()
        self.assertNotIn("Hamlet", str(msg.recipient))

    def test_personal_message_to_nonexistent_user(self) -> None:
        self.login(self.example_email("hamlet"))
        result = self.client_post("/json/messages", {"type": "private",
                                                     "content": "Test message",
                                                     "client": "test suite",
                                                     "to": "nonexistent"})
        self.assert_json_error(result, "Invalid email 'nonexistent'")

    def test_personal_message_to_deactivated_user(self) -> None:
        target_user_profile = self.example_user("othello")
        do_deactivate_user(target_user_profile)
        self.login(self.example_email("hamlet"))
        result = self.client_post("/json/messages", {
            "type": "private",
            "content": "Test message",
            "client": "test suite",
            "to": self.example_email("othello")})
        self.assert_json_error(result, "'othello@zulip.com' is no longer using Zulip.")

        result = self.client_post("/json/messages", {
            "type": "private",
            "content": "Test message",
            "client": "test suite",
            "to": ujson.dumps([self.example_email("othello"),
                               self.example_email("cordelia")])})
        self.assert_json_error(result, "'othello@zulip.com' is no longer using Zulip.")

    def test_invalid_type(self) -> None:
        self.login(self.example_email("hamlet"))
        result = self.client_post("/json/messages", {"type": "invalid type",
                                                     "content": "Test message",
                                                     "client": "test suite",
                                                     "to": self.example_email("othello")})
        self.assert_json_error(result, "Invalid message type")

    def test_empty_message(self) -> None:
        self.login(self.example_email("hamlet"))
        result = self.client_post("/json/messages", {"type": "private",
                                                     "content": " ",
                                                     "client": "test suite",
                                                     "to": self.example_email("othello")})
        self.assert_json_error(result, "Message must not be empty")

    def test_empty_string_topic(self) -> None:
        self.login(self.example_email("hamlet"))
        result = self.client_post("/json/messages", {"type": "stream",
                                                     "to": "Verona",
                                                     "client": "test suite",
                                                     "content": "Test message",
                                                     "subject": ""})
        self.assert_json_error(result, "Topic can't be empty")

    def test_missing_topic(self) -> None:
        self.login(self.example_email("hamlet"))
        result = self.client_post("/json/messages", {"type": "stream",
                                                     "to": "Verona",
                                                     "client": "test suite",
                                                     "content": "Test message"})
        self.assert_json_error(result, "Missing topic")

    def test_invalid_message_type(self) -> None:
        self.login(self.example_email("hamlet"))
        result = self.client_post("/json/messages", {"type": "invalid",
                                                     "to": "Verona",
                                                     "client": "test suite",
                                                     "content": "Test message",
                                                     "subject": "Test subject"})
        self.assert_json_error(result, "Invalid message type")

    def test_private_message_without_recipients(self) -> None:
        self.login(self.example_email("hamlet"))
        result = self.client_post("/json/messages", {"type": "private",
                                                     "content": "Test content",
                                                     "client": "test suite",
                                                     "to": ""})
        self.assert_json_error(result, "Message must have recipients")

    def test_mirrored_huddle(self) -> None:
        self.login(self.mit_email("starnine"), realm=get_realm("zephyr"))
        result = self.client_post("/json/messages", {"type": "private",
                                                     "sender": self.mit_email("sipbtest"),
                                                     "content": "Test message",
                                                     "client": "zephyr_mirror",
                                                     "to": ujson.dumps([self.mit_email("starnine"),
                                                                        self.mit_email("espuser")])},
                                  subdomain="zephyr")
        self.assert_json_success(result)

    def test_mirrored_personal(self) -> None:
        self.login(self.mit_email("starnine"), realm=get_realm("zephyr"))
        result = self.client_post("/json/messages", {"type": "private",
                                                     "sender": self.mit_email("sipbtest"),
                                                     "content": "Test message",
                                                     "client": "zephyr_mirror",
                                                     "to": self.mit_email("starnine")},
                                  subdomain="zephyr")
        self.assert_json_success(result)

    def test_mirrored_personal_to_someone_else(self) -> None:
        self.login(self.mit_email("starnine"), realm=get_realm("zephyr"))
        result = self.client_post("/json/messages", {"type": "private",
                                                     "sender": self.mit_email("sipbtest"),
                                                     "content": "Test message",
                                                     "client": "zephyr_mirror",
                                                     "to": self.mit_email("espuser")},
                                  subdomain="zephyr")
        self.assert_json_error(result, "User not authorized for this query")

    def test_duplicated_mirrored_huddle(self) -> None:
        msg = {"type": "private",
               "sender": self.mit_email("sipbtest"),
               "content": "Test message",
               "client": "zephyr_mirror",
               "to": ujson.dumps([self.mit_email("espuser"),
                                  self.mit_email("starnine")])}

        with mock.patch('DNS.dnslookup', return_value=[['starnine:*:84233:101:Athena Consulting Exchange User,,,:/mit/starnine:/bin/bash']]):
            self.login(self.mit_email("starnine"), realm=get_realm("zephyr"))
            result1 = self.client_post("/json/messages", msg,
                                       subdomain="zephyr")
        with mock.patch('DNS.dnslookup', return_value=[['espuser:*:95494:101:Esp Classroom,,,:/mit/espuser:/bin/athena/bash']]):
            self.login(self.mit_email("espuser"), realm=get_realm("zephyr"))
            result2 = self.client_post("/json/messages", msg,
                                       subdomain="zephyr")
        self.assertEqual(ujson.loads(result1.content)['id'],
                         ujson.loads(result2.content)['id'])

    def test_message_with_null_bytes(self) -> None:
        self.login(self.example_email("hamlet"))
        post_data = {"type": "stream", "to": "Verona", "client": "test suite",
                     "content": u"  I like null bytes \x00 in my content", "subject": "Test subject"}
        result = self.client_post("/json/messages", post_data)
        self.assert_json_error(result, "Message must not contain null bytes")

    def test_strip_message(self) -> None:
        self.login(self.example_email("hamlet"))
        post_data = {"type": "stream", "to": "Verona", "client": "test suite",
                     "content": "  I like whitespace at the end! \n\n \n", "subject": "Test subject"}
        result = self.client_post("/json/messages", post_data)
        self.assert_json_success(result)
        sent_message = self.get_last_message()
        self.assertEqual(sent_message.content, "  I like whitespace at the end!")

    def test_long_message(self) -> None:
        self.login(self.example_email("hamlet"))
        long_message = "A" * (MAX_MESSAGE_LENGTH + 1)
        post_data = {"type": "stream", "to": "Verona", "client": "test suite",
                     "content": long_message, "subject": "Test subject"}
        result = self.client_post("/json/messages", post_data)
        self.assert_json_success(result)

        sent_message = self.get_last_message()
        self.assertEqual(sent_message.content,
                         "A" * (MAX_MESSAGE_LENGTH - 3) + "...")

    def test_long_topic(self) -> None:
        self.login(self.example_email("hamlet"))
        long_topic = "A" * (MAX_SUBJECT_LENGTH + 1)
        post_data = {"type": "stream", "to": "Verona", "client": "test suite",
                     "content": "test content", "subject": long_topic}
        result = self.client_post("/json/messages", post_data)
        self.assert_json_success(result)

        sent_message = self.get_last_message()
        self.assertEqual(sent_message.topic_name(),
                         "A" * (MAX_SUBJECT_LENGTH - 3) + "...")

    def test_send_forged_message_as_not_superuser(self) -> None:
        self.login(self.example_email("hamlet"))
        result = self.client_post("/json/messages", {"type": "stream",
                                                     "to": "Verona",
                                                     "client": "test suite",
                                                     "content": "Test message",
                                                     "subject": "Test subject",
                                                     "forged": True})
        self.assert_json_error(result, "User not authorized for this query")

    def test_send_message_as_not_superuser_to_different_domain(self) -> None:
        self.login(self.example_email("hamlet"))
        result = self.client_post("/json/messages", {"type": "stream",
                                                     "to": "Verona",
                                                     "client": "test suite",
                                                     "content": "Test message",
                                                     "subject": "Test subject",
                                                     "realm_str": "mit"})
        self.assert_json_error(result, "User not authorized for this query")

    def test_send_message_as_superuser_to_domain_that_dont_exist(self) -> None:
        user = get_system_bot(settings.EMAIL_GATEWAY_BOT)
        password = "test_password"
        user.set_password(password)
        user.is_api_super_user = True
        user.save()
        self.login(user.email, password)
        result = self.client_post("/json/messages", {"type": "stream",
                                                     "to": "Verona",
                                                     "client": "test suite",
                                                     "content": "Test message",
                                                     "subject": "Test subject",
                                                     "realm_str": "non-existing"})
        user.is_api_super_user = False
        user.save()
        self.assert_json_error(result, "Unknown organization 'non-existing'")

    def test_send_message_when_sender_is_not_set(self) -> None:
        self.login(self.mit_email("starnine"), realm=get_realm("zephyr"))
        result = self.client_post("/json/messages", {"type": "private",
                                                     "content": "Test message",
                                                     "client": "zephyr_mirror",
                                                     "to": self.mit_email("starnine")},
                                  subdomain="zephyr")
        self.assert_json_error(result, "Missing sender")

    def test_send_message_as_not_superuser_when_type_is_not_private(self) -> None:
        self.login(self.mit_email("starnine"), realm=get_realm("zephyr"))
        result = self.client_post("/json/messages", {"type": "not-private",
                                                     "sender": self.mit_email("sipbtest"),
                                                     "content": "Test message",
                                                     "client": "zephyr_mirror",
                                                     "to": self.mit_email("starnine")},
                                  subdomain="zephyr")
        self.assert_json_error(result, "User not authorized for this query")

    @mock.patch("zerver.views.messages.create_mirrored_message_users")
    def test_send_message_create_mirrored_message_user_returns_invalid_input(
            self, create_mirrored_message_users_mock: Any) -> None:
        create_mirrored_message_users_mock.return_value = (False, True)
        self.login(self.mit_email("starnine"), realm=get_realm("zephyr"))
        result = self.client_post("/json/messages", {"type": "private",
                                                     "sender": self.mit_email("sipbtest"),
                                                     "content": "Test message",
                                                     "client": "zephyr_mirror",
                                                     "to": self.mit_email("starnine")},
                                  subdomain="zephyr")
        self.assert_json_error(result, "Invalid mirrored message")

    @mock.patch("zerver.views.messages.create_mirrored_message_users")
    def test_send_message_when_client_is_zephyr_mirror_but_string_id_is_not_zephyr(
            self, create_mirrored_message_users_mock: Any) -> None:
        create_mirrored_message_users_mock.return_value = (True, True)
        user = self.mit_user("starnine")
        email = user.email
        user.realm.string_id = 'notzephyr'
        user.realm.save()
        self.login(email, realm=get_realm("notzephyr"))
        result = self.client_post("/json/messages", {"type": "private",
                                                     "sender": self.mit_email("sipbtest"),
                                                     "content": "Test message",
                                                     "client": "zephyr_mirror",
                                                     "to": email},
                                  subdomain="notzephyr")
        self.assert_json_error(result, "Zephyr mirroring is not allowed in this organization")

    def test_send_message_irc_mirror(self) -> None:
        self.login(self.example_email('hamlet'))
        bot_info = {
            'full_name': 'IRC bot',
            'short_name': 'irc',
        }
        result = self.client_post("/json/bots", bot_info)
        self.assert_json_success(result)

        email = "irc-bot@zulip.testserver"
        user = get_user(email, get_realm('zulip'))
        user.is_api_super_user = True
        user.save()
        self.subscribe(user, "IRCland")

        fake_pub_date = timezone_now() - datetime.timedelta(minutes=37)
        fake_pub_time = datetime_to_timestamp(fake_pub_date)

        result = self.api_post(email, "/api/v1/messages", {"type": "stream",
                                                           "forged": "true",
                                                           "time": fake_pub_time,
                                                           "sender": "irc-user@irc.zulip.com",
                                                           "content": "Test message",
                                                           "client": "irc_mirror",
                                                           "subject": "from irc",
                                                           "to": "IRCLand"})
        self.assert_json_success(result)

        msg = self.get_last_message()
        self.assertEqual(int(datetime_to_timestamp(msg.pub_date)), int(fake_pub_time))

    def test_unsubscribed_api_super_user(self) -> None:
        cordelia = self.example_user('cordelia')
        stream_name = 'private_stream'
        self.make_stream(stream_name, invite_only=True)

        self.unsubscribe(cordelia, stream_name)

        def test_with(sender_email: str, client: str, forged: bool) ->None:
            payload = dict(
                type="stream",
                to=stream_name,
                sender=sender_email,
                client=client,
                subject='whatever',
                content='whatever',
                forged=ujson.dumps(forged),
            )

            cordelia.is_api_super_user = False
            cordelia.save()
            result = self.api_post(cordelia.email, "/api/v1/messages", payload)
            self.assert_json_error_contains(result, 'authorized')

            cordelia.is_api_super_user = True
            cordelia.save()
            result = self.api_post(cordelia.email, "/api/v1/messages", payload)
            self.assert_json_success(result)

        test_with(
            sender_email=cordelia.email,
            client='test suite',
            forged=False,
        )

        test_with(
            sender_email='irc_person@zulip.com',
            client='irc_mirror',
            forged=True,
        )

    def test_bot_can_send_to_owner_stream(self) -> None:
        cordelia = self.example_user('cordelia')
        bot = self.create_test_bot(
            short_name='whatever',
            user_profile=cordelia,
        )

        stream_name = 'private_stream'
        self.make_stream(stream_name, invite_only=True)

        payload = dict(
            type="stream",
            to=stream_name,
            sender=bot.email,
            client='test suite',
            subject='whatever',
            content='whatever',
        )

        result = self.api_post(bot.email, "/api/v1/messages", payload)
        self.assert_json_error_contains(result, 'Not authorized to send')

        self.subscribe(bot.bot_owner, stream_name)

        result = self.api_post(bot.email, "/api/v1/messages", payload)
        self.assert_json_success(result)

    def test_notification_bot(self) -> None:
        sender = self.notification_bot()

        stream_name = 'private_stream'
        self.make_stream(stream_name, invite_only=True)

        payload = dict(
            type="stream",
            to=stream_name,
            sender=sender.email,
            client='test suite',
            subject='whatever',
            content='whatever',
        )

        result = self.api_post(sender.email, "/api/v1/messages", payload)
        self.assert_json_success(result)

    def test_create_mirror_user_despite_race(self) -> None:
        realm = get_realm('zulip')
        email = 'fred@example.com'
        email_to_full_name = lambda email: 'fred'

        def create_user(**kwargs: Any) -> UserProfile:
            self.assertEqual(kwargs['full_name'], 'fred')
            self.assertEqual(kwargs['email'], email)
            self.assertEqual(kwargs['active'], False)
            self.assertEqual(kwargs['is_mirror_dummy'], True)
            kwargs['bot_type'] = None
            kwargs['bot_owner'] = None
            kwargs['tos_version'] = None
            kwargs['timezone'] = timezone_now()
            create_user_profile(**kwargs).save()
            raise IntegrityError()

        with mock.patch('zerver.lib.actions.create_user',
                        side_effect=create_user) as m:
            mirror_fred_user = create_mirror_user_if_needed(
                realm,
                email,
                email_to_full_name,
            )
        self.assertEqual(mirror_fred_user.email, email)
        m.assert_called()

    def test_guest_user(self) -> None:
        sender = self.example_user('polonius')
        stream_name = 'public stream'
        self.make_stream(stream_name, invite_only=False)
        payload = dict(
            type="stream",
            to=stream_name,
            sender=sender.email,
            client='test suite',
            subject='whatever',
            content='whatever',
        )

        result = self.api_post(sender.email, "/api/v1/messages", payload)
        self.assert_json_error(result, "Not authorized to send to stream 'public stream'")

        self.subscribe(sender, stream_name)
        result = self.api_post(sender.email, "/api/v1/messages", payload)
        self.assert_json_success(result)


class ScheduledMessageTest(ZulipTestCase):

    def last_scheduled_message(self) -> ScheduledMessage:
        return ScheduledMessage.objects.all().order_by('-id')[0]

    def do_schedule_message(self, msg_type: str, to: str, msg: str,
                            defer_until: str='', tz_guess: str='',
                            delivery_type: str='send_later',
                            realm_str: str='zulip') -> HttpResponse:
        self.login(self.example_email("hamlet"))

        subject = ''
        if msg_type == 'stream':
            subject = 'Test subject'

        payload = {"type": msg_type,
                   "to": to,
                   "client": "test suite",
                   "content": msg,
                   "subject": subject,
                   "realm_str": realm_str,
                   "delivery_type": delivery_type,
                   "tz_guess": tz_guess}
        if defer_until:
            payload["deliver_at"] = defer_until

        return self.client_post("/json/messages", payload)

    def test_schedule_message(self) -> None:
        content = "Test message"
        defer_until = timezone_now().replace(tzinfo=None) + datetime.timedelta(days=1)
        defer_until_str = str(defer_until)

        result = self.do_schedule_message('stream', 'Verona',
                                          content + ' 1', defer_until_str)
        message = self.last_scheduled_message()
        self.assert_json_success(result)
        self.assertEqual(message.content, 'Test message 1')
        self.assertEqual(message.scheduled_timestamp, convert_to_UTC(defer_until))
        self.assertEqual(message.delivery_type, ScheduledMessage.SEND_LATER)

        result = self.do_schedule_message('stream', 'Verona',
                                          content + ' 2', defer_until_str,
                                          delivery_type='remind')
        message = self.last_scheduled_message()
        self.assert_json_success(result)
        self.assertEqual(message.delivery_type, ScheduledMessage.REMIND)

        result = self.do_schedule_message('private', self.example_email("othello"),
                                          content + ' 3', defer_until_str)
        message = self.last_scheduled_message()
        self.assert_json_success(result)
        self.assertEqual(message.content, 'Test message 3')
        self.assertEqual(message.scheduled_timestamp, convert_to_UTC(defer_until))
        self.assertEqual(message.delivery_type, ScheduledMessage.SEND_LATER)

        result = self.do_schedule_message('private', self.example_email("othello"),
                                          content + ' 4', defer_until_str,
                                          delivery_type='remind')
        message = self.last_scheduled_message()
        self.assert_json_success(result)
        self.assertEqual(message.delivery_type, ScheduledMessage.REMIND)

        tz_guess = 'Asia/Kolkata'
        result = self.do_schedule_message('stream', 'Verona', content + ' 5',
                                          defer_until_str, tz_guess=tz_guess)
        message = self.last_scheduled_message()
        self.assert_json_success(result)
        self.assertEqual(message.content, 'Test message 5')
        local_tz = get_timezone(tz_guess)
        utz_defer_until = local_tz.normalize(local_tz.localize(defer_until))  # type: ignore
        self.assertEqual(message.scheduled_timestamp,
                         convert_to_UTC(utz_defer_until))
        self.assertEqual(message.delivery_type, ScheduledMessage.SEND_LATER)

        user = self.example_user("hamlet")
        user.timezone = 'US/Pacific'
        user.save(update_fields=['timezone'])
        result = self.do_schedule_message('stream', 'Verona',
                                          content + ' 6', defer_until_str)
        message = self.last_scheduled_message()
        self.assert_json_success(result)
        self.assertEqual(message.content, 'Test message 6')
        local_tz = get_timezone(user.timezone)
        utz_defer_until = local_tz.normalize(local_tz.localize(defer_until))  # type: ignore
        self.assertEqual(message.scheduled_timestamp,
                         convert_to_UTC(utz_defer_until))
        self.assertEqual(message.delivery_type, ScheduledMessage.SEND_LATER)

    def test_scheduling_in_past(self) -> None:
        content = "Test message"
        defer_until = timezone_now()
        defer_until_str = str(defer_until)

        result = self.do_schedule_message('stream', 'Verona',
                                          content + ' 1', defer_until_str)
        self.assert_json_error(result, 'Time must be in the future.')

    def test_invalid_timestamp(self) -> None:
        content = "Test message"
        defer_until = 'Missed the timestamp'

        result = self.do_schedule_message('stream', 'Verona',
                                          content + ' 1', defer_until)
        self.assert_json_error(result, 'Invalid time format')

    def test_missing_deliver_at(self) -> None:
        content = "Test message"

        result = self.do_schedule_message('stream', 'Verona',
                                          content + ' 1')
        self.assert_json_error(result, 'Missing deliver_at in a request for delayed message delivery')


class EditMessageTest(ZulipTestCase):
    def check_message(self, msg_id: int, subject: Optional[str]=None,
                      content: Optional[str]=None) -> Message:
        msg = Message.objects.get(id=msg_id)
        cached = MessageDict.wide_dict(msg)
        MessageDict.finalize_payload(cached, apply_markdown=False, client_gravatar=False)

        uncached = MessageDict.to_dict_uncached_helper(msg)
        MessageDict.post_process_dicts([uncached], apply_markdown=False, client_gravatar=False)
        self.assertEqual(cached, uncached)
        if subject:
            self.assertEqual(msg.topic_name(), subject)
        if content:
            self.assertEqual(msg.content, content)
        return msg

    def test_save_message(self) -> None:
        self.login(self.example_email("hamlet"))
        msg_id = self.send_stream_message(self.example_email("hamlet"), "Scotland",
                                          topic_name="editing", content="before edit")
        result = self.client_patch("/json/messages/" + str(msg_id), {
            'message_id': msg_id,
            'content': 'after edit'
        })
        self.assert_json_success(result)
        self.check_message(msg_id, content="after edit")

        result = self.client_patch("/json/messages/" + str(msg_id), {
            'message_id': msg_id,
            'subject': 'edited'
        })
        self.assert_json_success(result)
        self.check_message(msg_id, subject="edited")

    def test_fetch_raw_message(self) -> None:
        self.login(self.example_email("hamlet"))
        msg_id = self.send_personal_message(
            from_email=self.example_email("hamlet"),
            to_email=self.example_email("cordelia"),
            content="**before** edit",
        )
        result = self.client_get('/json/messages/' + str(msg_id))
        self.assert_json_success(result)
        self.assertEqual(result.json()['raw_content'], '**before** edit')

        result = self.client_get('/json/messages/999999')
        self.assert_json_error(result, 'Invalid message(s)')

        self.login(self.example_email("cordelia"))
        result = self.client_get('/json/messages/' + str(msg_id))
        self.assert_json_success(result)

        self.login(self.example_email("othello"))
        result = self.client_get('/json/messages/' + str(msg_id))
        self.assert_json_error(result, 'Invalid message(s)')

    def test_fetch_raw_message_stream_wrong_realm(self) -> None:
        user_profile = self.example_user("hamlet")
        self.login(user_profile.email)
        stream = self.make_stream('public_stream')
        self.subscribe(user_profile, stream.name)
        msg_id = self.send_stream_message(user_profile.email, stream.name,
                                          topic_name="test", content="test")
        result = self.client_get('/json/messages/' + str(msg_id))
        self.assert_json_success(result)

        self.login(self.mit_email("sipbtest"), realm=get_realm("zephyr"))
        result = self.client_get('/json/messages/' + str(msg_id), subdomain="zephyr")
        self.assert_json_error(result, 'Invalid message(s)')

    def test_fetch_raw_message_private_stream(self) -> None:
        user_profile = self.example_user("hamlet")
        self.login(user_profile.email)
        stream = self.make_stream('private_stream', invite_only=True)
        self.subscribe(user_profile, stream.name)
        msg_id = self.send_stream_message(user_profile.email, stream.name,
                                          topic_name="test", content="test")
        result = self.client_get('/json/messages/' + str(msg_id))
        self.assert_json_success(result)
        self.login(self.example_email("othello"))
        result = self.client_get('/json/messages/' + str(msg_id))
        self.assert_json_error(result, 'Invalid message(s)')

    def test_edit_message_no_permission(self) -> None:
        self.login(self.example_email("hamlet"))
        msg_id = self.send_stream_message(self.example_email("iago"), "Scotland",
                                          topic_name="editing", content="before edit")
        result = self.client_patch("/json/messages/" + str(msg_id), {
            'message_id': msg_id,
            'content': 'content after edit',
        })
        self.assert_json_error(result, "You don't have permission to edit this message")

    def test_edit_message_no_changes(self) -> None:
        self.login(self.example_email("hamlet"))
        msg_id = self.send_stream_message(self.example_email("hamlet"), "Scotland",
                                          topic_name="editing", content="before edit")
        result = self.client_patch("/json/messages/" + str(msg_id), {
            'message_id': msg_id,
        })
        self.assert_json_error(result, "Nothing to change")

    def test_edit_message_no_topic(self) -> None:
        self.login(self.example_email("hamlet"))
        msg_id = self.send_stream_message(self.example_email("hamlet"), "Scotland",
                                          topic_name="editing", content="before edit")
        result = self.client_patch("/json/messages/" + str(msg_id), {
            'message_id': msg_id,
            'subject': ' '
        })
        self.assert_json_error(result, "Topic can't be empty")

    def test_edit_message_no_content(self) -> None:
        self.login(self.example_email("hamlet"))
        msg_id = self.send_stream_message(self.example_email("hamlet"), "Scotland",
                                          topic_name="editing", content="before edit")
        result = self.client_patch("/json/messages/" + str(msg_id), {
            'message_id': msg_id,
            'content': ' '
        })
        self.assert_json_success(result)
        content = Message.objects.filter(id=msg_id).values_list('content', flat=True)[0]
        self.assertEqual(content, "(deleted)")

    def test_edit_message_history_disabled(self) -> None:
        user_profile = self.example_user("hamlet")
        do_set_realm_property(user_profile.realm, "allow_edit_history", False)
        self.login(self.example_email("hamlet"))

        msg_id_1 = self.send_stream_message(self.example_email("hamlet"),
                                            "Denmark",
                                            topic_name="editing",
                                            content="content before edit")
        new_content_1 = 'content after edit'
        result_1 = self.client_patch("/json/messages/" + str(msg_id_1), {
            'message_id': msg_id_1, 'content': new_content_1
        })
        self.assert_json_success(result_1)

        result = self.client_get(
            "/json/messages/" + str(msg_id_1) + "/history")
        self.assert_json_error(result, "Message edit history is disabled in this organization")

        messages_result = self.client_get("/json/messages",
                                          {"anchor": msg_id_1, "num_before": 0, "num_after": 10})
        self.assert_json_success(messages_result)
        json_messages = ujson.loads(
            messages_result.content.decode('utf-8'))
        for msg in json_messages['messages']:
            self.assertNotIn("edit_history", msg)

    def test_edit_message_history(self) -> None:
        self.login(self.example_email("hamlet"))
        msg_id_1 = self.send_stream_message(
            self.example_email("hamlet"),
            "Scotland",
            topic_name="editing",
            content="content before edit")
        new_content_1 = 'content after edit'
        result_1 = self.client_patch("/json/messages/" + str(msg_id_1), {
            'message_id': msg_id_1, 'content': new_content_1
        })
        self.assert_json_success(result_1)

        message_edit_history_1 = self.client_get(
            "/json/messages/" + str(msg_id_1) + "/history")
        json_response_1 = ujson.loads(
            message_edit_history_1.content.decode('utf-8'))
        message_history_1 = json_response_1['message_history']

        self.assertEqual(message_history_1[0]['rendered_content'],
                         '<p>content before edit</p>')
        self.assertEqual(message_history_1[1]['rendered_content'],
                         '<p>content after edit</p>')
        self.assertEqual(message_history_1[1]['content_html_diff'],
                         ('<p>content '
                          '<span class="highlight_text_inserted">after</span> '
                          '<span class="highlight_text_deleted">before</span>'
                          ' edit</p>'))
        self.assertEqual(message_history_1[1]['prev_rendered_content'],
                         '<p>content before edit</p>')

        msg_id_2 = self.send_stream_message(
            self.example_email("hamlet"),
            "Scotland",
            topic_name="editing",
            content=('content before edit, line 1\n'
                     '\n'
                     'content before edit, line 3'))
        new_content_2 = ('content before edit, line 1\n'
                         'content after edit, line 2\n'
                         'content before edit, line 3')
        result_2 = self.client_patch("/json/messages/" + str(msg_id_2), {
            'message_id': msg_id_2, 'content': new_content_2
        })
        self.assert_json_success(result_2)

        message_edit_history_2 = self.client_get(
            "/json/messages/" + str(msg_id_2) + "/history")
        json_response_2 = ujson.loads(
            message_edit_history_2.content.decode('utf-8'))
        message_history_2 = json_response_2['message_history']

        self.assertEqual(message_history_2[0]['rendered_content'],
                         ('<p>content before edit, line 1</p>\n'
                          '<p>content before edit, line 3</p>'))
        self.assertEqual(message_history_2[1]['rendered_content'],
                         ('<p>content before edit, line 1<br>\n'
                          'content after edit, line 2<br>\n'
                          'content before edit, line 3</p>'))
        self.assertEqual(message_history_2[1]['content_html_diff'],
                         ('<p>content before edit, line 1<br> '
                          'content <span class="highlight_text_inserted">after edit, line 2<br> '
                          'content</span> before edit, line 3</p>'))
        self.assertEqual(message_history_2[1]['prev_rendered_content'],
                         ('<p>content before edit, line 1</p>\n'
                          '<p>content before edit, line 3</p>'))

    def test_edit_link(self) -> None:
        self.login(self.example_email("hamlet"))
        msg_id_1 = self.send_stream_message(
            self.example_email("hamlet"),
            "Scotland",
            topic_name="editing",
            content="Here is a link to [zulip](www.zulip.org).")
        new_content_1 = 'Here is a link to [zulip](www.zulipchat.com).'
        result_1 = self.client_patch("/json/messages/" + str(msg_id_1), {
            'message_id': msg_id_1, 'content': new_content_1
        })
        self.assert_json_success(result_1)

        message_edit_history_1 = self.client_get(
            "/json/messages/" + str(msg_id_1) + "/history")
        json_response_1 = ujson.loads(
            message_edit_history_1.content.decode('utf-8'))
        message_history_1 = json_response_1['message_history']

        self.assertEqual(message_history_1[0]['rendered_content'],
                         '<p>Here is a link to '
                         '<a href="http://www.zulip.org" target="_blank" title="http://www.zulip.org">zulip</a>.</p>')
        self.assertEqual(message_history_1[1]['rendered_content'],
                         '<p>Here is a link to '
                         '<a href="http://www.zulipchat.com" target="_blank" title="http://www.zulipchat.com">zulip</a>.</p>')
        self.assertEqual(message_history_1[1]['content_html_diff'],
                         ('<p>Here is a link to <a href="http://www.zulipchat.com" '
                          'target="_blank" title="http://www.zulipchat.com">zulip '
                          '<span class="highlight_text_inserted"> Link: http://www.zulipchat.com .'
                          '</span> <span class="highlight_text_deleted"> Link: http://www.zulip.org .'
                          '</span> </a></p>'))

    def test_edit_history_unedited(self) -> None:
        self.login(self.example_email('hamlet'))
        msg_id = self.send_stream_message(
            self.example_email('hamlet'),
            'Scotland',
            topic_name='editing',
            content='This message has not been edited.')

        result = self.client_get('/json/messages/{}/history'.format(msg_id))
        self.assert_json_success(result)

        message_history = result.json()['message_history']
        self.assert_length(message_history, 1)

    def test_edit_message_content_limit(self) -> None:
        self._set_message_editing_params(True, 240, False)
        self._do_edit_message_assert_success(self._msg_id, 'A')
        self._set_message_editing_params(True, 120, False)
        self._do_edit_message_assert_success(self._msg_id, 'B', topic_only=True)
        self._do_edit_message_assert_error(self._msg_id, 'C', "The time limit for editing this message has passed")
        self._set_message_editing_params(True, 0, False)
        self._do_edit_message_assert_success(self._msg_id, 'D')
        self._set_message_editing_params(False, 240, False)
        self._do_edit_message_assert_error(self._msg_id, 'E', "Your organization has turned off message editing", True)
        self._set_message_editing_params(False, 120, False)
        self._do_edit_message_assert_error(self._msg_id, 'F', "Your organization has turned off message editing", True)
        self._set_message_editing_params(False, 0, False)
        self._do_edit_message_assert_error(self._msg_id, 'G', "Your organization has turned off message editing", True)

    def _set_message_editing_params(self, allow_message_editing: bool,
                                    message_content_edit_limit_seconds: int,
                                    allow_community_topic_editing: bool) -> None:
        result = self.client_patch("/json/realm", {
            'allow_message_editing': ujson.dumps(allow_message_editing),
            'message_content_edit_limit_seconds': message_content_edit_limit_seconds,
            'allow_community_topic_editing': ujson.dumps(allow_community_topic_editing),
        })
        self.assert_json_success(result)

    def _do_edit_message_assert_success(self, msg_id: int, unique_str: str, topic_only: bool=False) -> None:
        new_subject = 'subject' + unique_str
        new_content = 'content' + unique_str
        params_dict = {'message_id': msg_id, 'subject': new_subject}
        if not topic_only:
            params_dict['content'] = new_content
        result = self.client_patch("/json/messages/" + str(msg_id), params_dict)
        self.assert_json_success(result)
        if topic_only:
            self.check_message(msg_id, subject=new_subject)
        else:
            self.check_message(msg_id, subject=new_subject, content=new_content)

    def _do_edit_message_assert_error(self, msg_id: int, unique_str: str, error: str,
                                      topic_only: bool=False) -> None:
        message = Message.objects.get(id=msg_id)
        old_subject = message.topic_name()
        old_content = message.content
        new_subject = 'subject' + unique_str
        new_content = 'content' + unique_str
        params_dict = {'message_id': msg_id, 'subject': new_subject}
        if not topic_only:
            params_dict['content'] = new_content
        result = self.client_patch("/json/messages/" + str(msg_id), params_dict)
        self.assert_json_error(result, error)
        self.check_message(msg_id, subject=old_subject, content=old_content)

    def setUp(self) -> None:
        super().setUp()
        self._msg_id = self.send_stream_message(self.example_email("iago"), "Scotland",
                                                content="content", topic_name="subject")
        self._msg_id = Message.objects.get(id=self._msg_id).id

    def test_allow_community_topic_editing(self) -> None:
        self._set_message_editing_params(True, 0, True)
        self.login(self.example_email("cordelia"))
        self._do_edit_message_assert_success(self._msg_id, 'A')

        self._set_message_editing_params(True, 0, False)
        self.login(self.example_email("iago"))
        self._do_edit_message_assert_success(self._msg_id, 'B')
        self.login(self.example_email("cordelia"))
        self._do_edit_message_assert_error(self._msg_id, 'C', "You don't have permission to edit this message")

        self._set_message_editing_params(False, 0, True)
        self.login(self.example_email("cordelia"))
        self._do_edit_message_assert_error(self._msg_id, 'D', "Your organization has turned off message editing")

        self.login(self.example_email("iago"))
        message = Message.objects.get(id=self._msg_id)
        message.pub_date = message.pub_date - datetime.timedelta(seconds=90000)
        message.save()
        self._set_message_editing_params(True, 0, True)
        self._do_edit_message_assert_success(self._msg_id, 'E')
        self.login(self.example_email("cordelia"))
        self._do_edit_message_assert_error(self._msg_id, 'F', "The time limit for editing this message has passed")

        message.pub_date = message.pub_date - datetime.timedelta(seconds=90000)
        message.save()
        self.login(self.example_email("cordelia"))
        self._do_edit_message_assert_success(self._msg_id, 'D')

    def test_propagate_topic_forward(self) -> None:
        self.login(self.example_email("hamlet"))
        id1 = self.send_stream_message(self.example_email("hamlet"), "Scotland",
                                       topic_name="topic1")
        id2 = self.send_stream_message(self.example_email("iago"), "Scotland",
                                       topic_name="topic1")
        id3 = self.send_stream_message(self.example_email("iago"), "Rome",
                                       topic_name="topic1")
        id4 = self.send_stream_message(self.example_email("hamlet"), "Scotland",
                                       topic_name="topic2")
        id5 = self.send_stream_message(self.example_email("iago"), "Scotland",
                                       topic_name="topic1")

        result = self.client_patch("/json/messages/" + str(id1), {
            'message_id': id1,
            'subject': 'edited',
            'propagate_mode': 'change_later'
        })
        self.assert_json_success(result)

        self.check_message(id1, subject="edited")
        self.check_message(id2, subject="edited")
        self.check_message(id3, subject="topic1")
        self.check_message(id4, subject="topic2")
        self.check_message(id5, subject="edited")

    def test_propagate_all_topics(self) -> None:
        self.login(self.example_email("hamlet"))
        id1 = self.send_stream_message(self.example_email("hamlet"), "Scotland",
                                       topic_name="topic1")
        id2 = self.send_stream_message(self.example_email("hamlet"), "Scotland",
                                       topic_name="topic1")
        id3 = self.send_stream_message(self.example_email("iago"), "Rome",
                                       topic_name="topic1")
        id4 = self.send_stream_message(self.example_email("hamlet"), "Scotland",
                                       topic_name="topic2")
        id5 = self.send_stream_message(self.example_email("iago"), "Scotland",
                                       topic_name="topic1")
        id6 = self.send_stream_message(self.example_email("iago"), "Scotland",
                                       topic_name="topic3")

        result = self.client_patch("/json/messages/" + str(id2), {
            'message_id': id2,
            'subject': 'edited',
            'propagate_mode': 'change_all'
        })
        self.assert_json_success(result)

        self.check_message(id1, subject="edited")
        self.check_message(id2, subject="edited")
        self.check_message(id3, subject="topic1")
        self.check_message(id4, subject="topic2")
        self.check_message(id5, subject="edited")
        self.check_message(id6, subject="topic3")


class MirroredMessageUsersTest(ZulipTestCase):
    def test_invalid_sender(self) -> None:
        user = self.example_user('hamlet')
        recipients = []  # type: List[str]

        Request = namedtuple('Request', ['POST'])
        request = Request(POST=dict())  # no sender

        (valid_input, mirror_sender) = \
            create_mirrored_message_users(request, user, recipients)

        self.assertEqual(valid_input, False)
        self.assertEqual(mirror_sender, None)

    def test_invalid_client(self) -> None:
        client = get_client(name='banned_mirror')  # Invalid!!!

        user = self.example_user('hamlet')
        sender = user

        recipients = []  # type: List[str]

        Request = namedtuple('Request', ['POST', 'client'])
        request = Request(POST = dict(sender=sender.email, type='private'),
                          client = client)

        (valid_input, mirror_sender) = \
            create_mirrored_message_users(request, user, recipients)

        self.assertEqual(valid_input, False)
        self.assertEqual(mirror_sender, None)

    def test_invalid_email(self) -> None:
        invalid_email = 'alice AT example.com'
        recipients = [invalid_email]

        user = self.mit_user('starnine')
        sender = user

        Request = namedtuple('Request', ['POST', 'client'])

        for client_name in ['zephyr_mirror', 'irc_mirror', 'jabber_mirror']:
            client = get_client(name=client_name)

            request = Request(POST = dict(sender=sender.email, type='private'),
                              client = client)

            (valid_input, mirror_sender) = \
                create_mirrored_message_users(request, user, recipients)

            self.assertEqual(valid_input, False)
            self.assertEqual(mirror_sender, None)

    @mock.patch('DNS.dnslookup', return_value=[['sipbtest:*:20922:101:Fred Sipb,,,:/mit/sipbtest:/bin/athena/tcsh']])
    def test_zephyr_mirror_new_recipient(self, ignored: Any) -> None:
        client = get_client(name='zephyr_mirror')
        user = self.mit_user('starnine')
        sender = self.mit_user('sipbtest')
        new_user_email = 'bob_the_new_user@mit.edu'
        new_user_realm = get_realm("zephyr")
        recipients = [user.email, new_user_email]

        Request = namedtuple('Request', ['POST', 'client'])
        request = Request(POST = dict(sender=sender.email, type='private'),
                          client = client)

        (valid_input, mirror_sender) = \
            create_mirrored_message_users(request, user, recipients)

        self.assertTrue(valid_input)
        self.assertEqual(mirror_sender, sender)

        realm_users = UserProfile.objects.filter(realm=sender.realm)
        realm_emails = {user.email for user in realm_users}
        self.assertIn(user.email, realm_emails)
        self.assertIn(new_user_email, realm_emails)

        bob = get_user(new_user_email, new_user_realm)
        self.assertTrue(bob.is_mirror_dummy)

    @mock.patch('DNS.dnslookup', return_value=[['sipbtest:*:20922:101:Fred Sipb,,,:/mit/sipbtest:/bin/athena/tcsh']])
    def test_zephyr_mirror_new_sender(self, ignored: Any) -> None:
        client = get_client(name='zephyr_mirror')
        user = self.mit_user('starnine')
        sender_email = 'new_sender@mit.edu'
        recipients = ['stream_name']

        Request = namedtuple('Request', ['POST', 'client'])
        request = Request(POST = dict(sender=sender_email, type='stream'),
                          client = client)

        (valid_input, mirror_sender) = \
            create_mirrored_message_users(request, user, recipients)

        self.assertTrue(valid_input)
        self.assertEqual(mirror_sender.email, sender_email)
        self.assertTrue(mirror_sender.is_mirror_dummy)

    def test_irc_mirror(self) -> None:
        client = get_client(name='irc_mirror')
        sender = self.example_user('hamlet')
        user = sender
        recipients = [self.nonreg_email('alice'), 'bob@irc.zulip.com', self.nonreg_email('cordelia')]

        Request = namedtuple('Request', ['POST', 'client'])
        request = Request(POST = dict(sender=sender.email, type='private'),
                          client = client)

        (valid_input, mirror_sender) = \
            create_mirrored_message_users(request, user, recipients)

        self.assertEqual(valid_input, True)
        self.assertEqual(mirror_sender, sender)

        realm_users = UserProfile.objects.filter(realm=sender.realm)
        realm_emails = {user.email for user in realm_users}
        self.assertIn(self.nonreg_email('alice'), realm_emails)
        self.assertIn('bob@irc.zulip.com', realm_emails)

        bob = get_user('bob@irc.zulip.com', sender.realm)
        self.assertTrue(bob.is_mirror_dummy)

    def test_jabber_mirror(self) -> None:
        client = get_client(name='jabber_mirror')
        sender = self.example_user('hamlet')
        user = sender
        recipients = [self.nonreg_email('alice'), self.nonreg_email('bob'), self.nonreg_email('cordelia')]

        Request = namedtuple('Request', ['POST', 'client'])
        request = Request(POST = dict(sender=sender.email, type='private'),
                          client = client)

        (valid_input, mirror_sender) = \
            create_mirrored_message_users(request, user, recipients)

        self.assertEqual(valid_input, True)
        self.assertEqual(mirror_sender, sender)

        realm_users = UserProfile.objects.filter(realm=sender.realm)
        realm_emails = {user.email for user in realm_users}
        self.assertIn(self.nonreg_email('alice'), realm_emails)
        self.assertIn(self.nonreg_email('bob'), realm_emails)

        bob = get_user(self.nonreg_email('bob'), sender.realm)
        self.assertTrue(bob.is_mirror_dummy)


class MessageAccessTests(ZulipTestCase):
    def test_update_invalid_flags(self) -> None:
        message = self.send_personal_message(
            self.example_email("cordelia"),
            self.example_email("hamlet"),
            "hello",
        )

        self.login(self.example_email("hamlet"))
        result = self.client_post("/json/messages/flags",
                                  {"messages": ujson.dumps([message]),
                                   "op": "add",
                                   "flag": "invalid"})
        self.assert_json_error(result, "Invalid flag: 'invalid'")

        result = self.client_post("/json/messages/flags",
                                  {"messages": ujson.dumps([message]),
                                   "op": "add",
                                   "flag": "is_private"})
        self.assert_json_error(result, "Invalid flag: 'is_private'")

        result = self.client_post("/json/messages/flags",
                                  {"messages": ujson.dumps([message]),
                                   "op": "add",
                                   "flag": "active_mobile_push_notification"})
        self.assert_json_error(result, "Invalid flag: 'active_mobile_push_notification'")

    def change_star(self, messages: List[int], add: bool=True, **kwargs: Any) -> HttpResponse:
        return self.client_post("/json/messages/flags",
                                {"messages": ujson.dumps(messages),
                                 "op": "add" if add else "remove",
                                 "flag": "starred"},
                                **kwargs)

    def test_change_star(self) -> None:
        self.login(self.example_email("hamlet"))
        message_ids = [self.send_personal_message(self.example_email("hamlet"),
                                                  self.example_email("hamlet"),
                                                  "test")]

        result = self.change_star(message_ids)
        self.assert_json_success(result)

        for msg in self.get_messages():
            if msg['id'] in message_ids:
                self.assertEqual(msg['flags'], ['starred'])
            else:
                self.assertEqual(msg['flags'], ['read'])

        result = self.change_star(message_ids, False)
        self.assert_json_success(result)

        for msg in self.get_messages():
            if msg['id'] in message_ids:
                self.assertEqual(msg['flags'], [])

    def test_change_star_public_stream_historical(self) -> None:
        stream_name = "new_stream"
        self.subscribe(self.example_user("hamlet"), stream_name)
        self.login(self.example_email("hamlet"))
        message_ids = [
            self.send_stream_message(self.example_email("hamlet"), stream_name, "test"),
        ]
        other_message_ids = [
            self.send_stream_message(self.example_email("hamlet"), stream_name, "test_unused"),
        ]
        received_message_ids = [
            self.send_personal_message(
                self.example_email("hamlet"),
                self.example_email("cordelia"),
                "test_received"
            ),
        ]

        self.login(self.example_email("cordelia"))
        sent_message_ids = [
            self.send_personal_message(
                self.example_email("cordelia"),
                self.example_email("cordelia"),
                "test_read_message",
            ),
        ]
        result = self.client_post("/json/messages/flags",
                                  {"messages": ujson.dumps(sent_message_ids),
                                   "op": "add",
                                   "flag": "read"})

        result = self.client_post("/json/messages/flags",
                                  {"messages": ujson.dumps(message_ids),
                                   "op": "add",
                                   "flag": "read"})
        self.assert_json_error(result, 'Invalid message(s)')

        result = self.change_star(message_ids * 2)
        self.assert_json_error(result, 'Invalid message(s)')

        result = self.change_star(message_ids)
        self.assert_json_success(result)

        for msg in self.get_messages():
            if msg['id'] in message_ids:
                self.assertEqual(set(msg['flags']), {'starred', 'historical', 'read'})
            elif msg['id'] in received_message_ids:
                self.assertEqual(msg['flags'], [])
            else:
                self.assertEqual(msg['flags'], ['read'])
            self.assertNotIn(msg['id'], other_message_ids)

        result = self.change_star(message_ids, False)
        self.assert_json_success(result)

        self.login(self.mit_email("sipbtest"), realm=get_realm("zephyr"))
        result = self.change_star(message_ids, subdomain="zephyr")
        self.assert_json_error(result, 'Invalid message(s)')

    def test_change_star_private_message_security(self) -> None:
        self.login(self.example_email("hamlet"))
        message_ids = [
            self.send_personal_message(
                self.example_email("hamlet"),
                self.example_email("hamlet"),
                "test",
            ),
        ]

        self.login(self.example_email("cordelia"))
        result = self.change_star(message_ids)
        self.assert_json_error(result, 'Invalid message(s)')

    def test_change_star_private_stream_security(self) -> None:
        stream_name = "private_stream"
        self.make_stream(stream_name, invite_only=True)
        self.subscribe(self.example_user("hamlet"), stream_name)
        self.login(self.example_email("hamlet"))
        message_ids = [
            self.send_stream_message(self.example_email("hamlet"), stream_name, "test"),
        ]

        result = self.change_star(message_ids)
        self.assert_json_success(result)

        self.login(self.example_email("cordelia"))
        result = self.change_star(message_ids)
        self.assert_json_error(result, 'Invalid message(s)')

        stream_name = "private_stream_2"
        self.make_stream(stream_name, invite_only=True,
                         history_public_to_subscribers=True)
        self.subscribe(self.example_user("hamlet"), stream_name)
        self.login(self.example_email("hamlet"))
        message_ids = [
            self.send_stream_message(self.example_email("hamlet"), stream_name, "test"),
        ]

        self.login(self.example_email("cordelia"))
        result = self.change_star(message_ids)
        self.assert_json_error(result, 'Invalid message(s)')

        self.subscribe(self.example_user("cordelia"), stream_name)
        result = self.change_star(message_ids)
        self.assert_json_success(result)

    def test_new_message(self) -> None:
        test_email = self.example_email('hamlet')
        self.login(test_email)
        content = "Test message for star"
        self.send_stream_message(test_email, "Verona",
                                 content=content)

        sent_message = UserMessage.objects.filter(
            user_profile=self.example_user('hamlet')
        ).order_by("id").reverse()[0]
        self.assertEqual(sent_message.message.content, content)
        self.assertFalse(sent_message.flags.starred)

    def test_change_star_public_stream_security_for_guest_user(self) -> None:
        normal_user = self.example_user("hamlet")
        stream_name = "public_stream"
        self.make_stream(stream_name)
        self.subscribe(normal_user, stream_name)
        self.login(normal_user.email)

        message_id = [
            self.send_stream_message(normal_user.email, stream_name, "test 1")
        ]

        guest_user = self.example_user('polonius')
        self.login(guest_user.email)
        result = self.change_star(message_id)
        self.assert_json_error(result, 'Invalid message(s)')

        self.subscribe(guest_user, stream_name)
        result = self.change_star(message_id)
        self.assert_json_success(result)

        self.login(normal_user.email)
        message_id = [
            self.send_stream_message(normal_user.email, stream_name, "test 2")
        ]
        self.login(guest_user.email)
        result = self.change_star(message_id)
        self.assert_json_success(result)

    def test_change_star_private_stream_security_for_guest_user(self) -> None:
        normal_user = self.example_user("hamlet")
        stream_name = "private_stream"
        stream = self.make_stream(stream_name, invite_only=True)
        self.subscribe(normal_user, stream_name)
        self.login(normal_user.email)

        message_id = [
            self.send_stream_message(normal_user.email, stream_name, "test 1")
        ]

        guest_user = self.example_user('polonius')
        self.login(guest_user.email)
        result = self.change_star(message_id)
        self.assert_json_error(result, 'Invalid message(s)')

        self.subscribe(guest_user, stream_name)
        result = self.change_star(message_id)
        self.assert_json_error(result, 'Invalid message(s)')

        do_change_stream_invite_only(stream, True, history_public_to_subscribers=True)
        result = self.change_star(message_id)
        self.assert_json_success(result)

        do_change_stream_invite_only(stream, True, history_public_to_subscribers=False)
        self.login(normal_user.email)
        message_id = [
            self.send_stream_message(normal_user.email, stream_name, "test 2")
        ]
        self.login(guest_user.email)
        result = self.change_star(message_id)
        self.assert_json_success(result)


class MessageVisibilityTest(ZulipTestCase):
    def test_update_first_visible_message_id(self) -> None:
        Message.objects.all().delete()
        message_ids = [self.send_stream_message(self.example_email("othello"), "Scotland") for i in range(15)]

        realm = get_realm("zulip")
        realm.message_visibility_limit = 10
        realm.save()
        expected_message_id = message_ids[5]
        update_first_visible_message_id(realm)
        self.assertEqual(get_first_visible_message_id(realm), expected_message_id)

        realm.message_visibility_limit = 50
        realm.save()
        update_first_visible_message_id(realm)
        self.assertEqual(get_first_visible_message_id(realm), 0)

    def test_maybe_update_first_visible_message_id(self) -> None:
        realm = get_realm("zulip")
        lookback_hours = 30

        realm.message_visibility_limit = None
        realm.save()

        end_time = timezone_now() - datetime.timedelta(hours=lookback_hours - 5)
        stat = COUNT_STATS['messages_sent:is_bot:hour']

        RealmCount.objects.create(realm=realm, property=stat.property,
                                  end_time=end_time, value=5)
        with mock.patch("zerver.lib.message.update_first_visible_message_id") as m:
            maybe_update_first_visible_message_id(realm, lookback_hours)
        m.assert_not_called()

        realm.message_visibility_limit = 10
        realm.save()
        RealmCount.objects.all().delete()
        with mock.patch("zerver.lib.message.update_first_visible_message_id") as m:
            maybe_update_first_visible_message_id(realm, lookback_hours)
        m.assert_called_once_with(realm)

        with mock.patch('zerver.lib.message.cache_get', return_value=True), \
                mock.patch("zerver.lib.message.update_first_visible_message_id") as m:
            maybe_update_first_visible_message_id(realm, lookback_hours)
        m.assert_not_called()

        RealmCount.objects.create(realm=realm, property=stat.property,
                                  end_time=end_time, value=5)
        with mock.patch('zerver.lib.message.cache_get', return_value=True), \
                mock.patch("zerver.lib.message.update_first_visible_message_id") as m:
            maybe_update_first_visible_message_id(realm, lookback_hours)
        m.assert_called_once_with(realm)