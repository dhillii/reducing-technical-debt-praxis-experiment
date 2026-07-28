# -*- coding: utf-8 -*-
import datetime
from email.utils import parseaddr
import re

import django_otp
from django.conf import settings
from django.contrib.contenttypes.models import ContentType
from django.contrib.sites.models import Site
from django.http import HttpResponse, HttpRequest
from django.test import TestCase, override_settings
from django.utils.timezone import now as timezone_now
from django.core.exceptions import ValidationError
from two_factor.utils import default_device

from mock import patch, MagicMock
from zerver.lib.test_helpers import MockLDAP, get_test_image_file, avatar_disk_path

from confirmation.models import Confirmation, create_confirmation_link, MultiuseInvite, \
    generate_key, confirmation_url, get_object_from_key, ConfirmationKeyException
from confirmation import settings as confirmation_settings

from zerver.forms import HomepageForm, WRONG_SUBDOMAIN_ERROR, check_subdomain_available
from zerver.lib.actions import do_change_password
from zerver.decorator import do_two_factor_login
from zerver.views.auth import login_or_register_remote_user, \
    redirect_and_log_into_subdomain, start_two_factor_auth
from zerver.views.invite import get_invitee_emails_set
from zerver.views.registration import confirmation_key, \
    send_confirm_registration_email

from zerver.models import (
    get_realm, get_user, get_stream_recipient,
    PreregistrationUser, Realm, RealmDomain, Recipient, Message,
    ScheduledEmail, UserProfile, UserMessage,
    Stream, Subscription, flush_per_request_caches
)
from zerver.lib.actions import (
    set_default_streams,
    do_change_is_admin,
    get_stream,
    do_create_realm,
    do_create_default_stream_group,
    do_add_default_stream,
)
from zerver.lib.send_email import send_email, send_future_email, FromAddress
from zerver.lib.initial_password import initial_password
from zerver.lib.actions import (
    do_deactivate_realm,
    do_deactivate_user,
    do_set_realm_property,
    add_new_user_history,
)
from zerver.lib.avatar import avatar_url
from zerver.lib.mobile_auth_otp import xor_hex_strings, ascii_to_hex, \
    otp_encrypt_api_key, is_valid_otp, hex_to_ascii, otp_decrypt_api_key
from zerver.lib.notifications import enqueue_welcome_emails, \
    one_click_unsubscribe_link, followup_day2_email_delay
from zerver.lib.subdomains import is_root_domain_available
from zerver.lib.test_helpers import find_key_by_email, queries_captured, \
    HostRequestMock, load_subdomain_token
from zerver.lib.test_classes import (
    ZulipTestCase,
)
from zerver.lib.test_runner import slow
from zerver.lib.sessions import get_session_dict_user
from zerver.lib.name_restrictions import is_disposable_domain
from zerver.context_processors import common_context

from collections import defaultdict
import re
import smtplib
import ujson

from typing import Any, Dict, List, Optional, Set

import urllib
import os
import pytz

class RedirectAndLogIntoSubdomainTestCase(ZulipTestCase):
    def test_cookie_data(self) -> None:
        realm = Realm.objects.all().first()
        name = 'Hamlet'
        email = self.example_email("hamlet")
        response = redirect_and_log_into_subdomain(realm, name, email)
        data = load_subdomain_token(response)
        self.assertDictEqual(data, {'name': name, 'next': '',
                                    'email': email,
                                    'subdomain': realm.subdomain,
                                    'is_signup': False})

        response = redirect_and_log_into_subdomain(realm, name, email,
                                                   is_signup=True)
        data = load_subdomain_token(response)
        self.assertDictEqual(data, {'name': name, 'next': '',
                                    'email': email,
                                    'subdomain': realm.subdomain,
                                    'is_signup': True})

class DeactivationNoticeTestCase(ZulipTestCase):
    def test_redirection_for_deactivated_realm(self) -> None:
        realm = get_realm("zulip")
        realm.deactivated = True
        realm.save(update_fields=["deactivated"])

        for url in ('/register/', '/login/'):
            result = self.client_get(url)
            self.assertEqual(result.status_code, 302)
            self.assertIn('deactivated', result.url)

    def test_redirection_for_active_realm(self) -> None:
        for url in ('/register/', '/login/'):
            result = self.client_get(url)
            self.assertEqual(result.status_code, 200)

    def test_deactivation_notice_when_realm_is_active(self) -> None:
        result = self.client_get('/accounts/deactivated/')
        self.assertEqual(result.status_code, 302)
        self.assertIn('login', result.url)

    def test_deactivation_notice_when_deactivated(self) -> None:
        realm = get_realm("zulip")
        realm.deactivated = True
        realm.save(update_fields=["deactivated"])

        result = self.client_get('/accounts/deactivated/')
        self.assertIn("Zulip Dev, has been deactivated.", result.content.decode())

class AddNewUserHistoryTest(ZulipTestCase):
    def test_add_new_user_history_race(self) -> None:
        """Sends a message during user creation"""
        # Create a user who hasn't had historical messages added
        stream_dict = {
            "Denmark": {"description": "A Scandinavian country", "invite_only": False},
            "Verona": {"description": "A city in Italy", "invite_only": False}
        }  # type: Dict[str, Dict[str, Any]]
        realm = get_realm('zulip')
        set_default_streams(realm, stream_dict)
        with patch("zerver.lib.actions.add_new_user_history"):
            self.register(self.nonreg_email('test'), "test")
        user_profile = self.nonreg_user('test')

        subs = Subscription.objects.select_related("recipient").filter(
            user_profile=user_profile, recipient__type=Recipient.STREAM)
        streams = Stream.objects.filter(id__in=[sub.recipient.type_id for sub in subs])
        self.send_stream_message(self.example_email('hamlet'), streams[0].name, "test")
        add_new_user_history(user_profile, streams)

class InitialPasswordTest(ZulipTestCase):
    def test_none_initial_password_salt(self) -> None:
        with self.settings(INITIAL_PASSWORD_SALT=None):
            self.assertIsNone(initial_password('test@test.com'))

class PasswordResetTest(ZulipTestCase):
    """
    Log in, reset password, log out, log in with new password.
    """

    def test_password_reset(self) -> None:
        email = self.example_email("hamlet")
        old_password = initial_password(email)

        self.login(email)

        # test password reset template
        result = self.client_get('/accounts/password/reset/')
        self.assert_in_response('Reset your password', result)

        # start the password reset process by supplying an email address
        result = self.client_post('/accounts/password/reset/', {'email': email})

        # check the redirect link telling you to check mail for password reset link
        self.assertEqual(result.status_code, 302)
        self.assertTrue(result["Location"].endswith(
            "/accounts/password/reset/done/"))
        result = self.client_get(result["Location"])

        self.assert_in_response("Check your email in a few minutes to finish the process.", result)

        # Check that the password reset email is from a noreply address.
        from django.core.mail import outbox
        from_email = outbox[0].from_email
        self.assertIn("Zulip Account Security", from_email)
        tokenized_no_reply_email = parseaddr(from_email)[1]
        self.assertTrue(re.search(self.TOKENIZED_NOREPLY_REGEX, tokenized_no_reply_email))
        self.assertIn("Psst. Word on the street is that you", outbox[0].body)

        # Visit the password reset link.
        password_reset_url = self.get_confirmation_url_from_outbox(
            email, url_pattern=settings.EXTERNAL_HOST + r"(\S+)")
        result = self.client_get(password_reset_url)
        self.assertEqual(result.status_code, 200)

        # Reset your password
        result = self.client_post(password_reset_url,
                                  {'new_password1': 'new_password',
                                   'new_password2': 'new_password'})

        # password reset succeeded
        self.assertEqual(result.status_code, 302)
        self.assertTrue(result["Location"].endswith("/password/done/"))

        # log back in with new password
        self.login(email, password='new_password')
        user_profile = self.example_user('hamlet')
        self.assertEqual(get_session_dict_user(self.client.session), user_profile.id)

        # make sure old password no longer works
        self.login(email, password=old_password, fails=True)

    def test_password_reset_for_non_existent_user(self) -> None:
        email = 'nonexisting@mars.com'

        # start the password reset process by supplying an email address
        result = self.client_post('/accounts/password/reset/', {'email': email})

        # check the redirect link telling you to check mail for password reset link
        self.assertEqual(result.status_code, 302)
        self.assertTrue(result["Location"].endswith(
            "/accounts/password/reset/done/"))
        result = self.client_get(result["Location"])

        self.assert_in_response("Check your email in a few minutes to finish the process.", result)

        # Check that the password reset email is from a noreply address.
        from django.core.mail import outbox
        from_email = outbox[0].from_email
        self.assertIn("Zulip Account Security", from_email)
        tokenized_no_reply_email = parseaddr(from_email)[1]
        self.assertTrue(re.search(self.TOKENIZED_NOREPLY_REGEX, tokenized_no_reply_email))
        self.assertIn('Someone (possibly you) requested a password',
                      outbox[0].body)
        self.assertNotIn('does have an active account in the zulip.testserver',
                         outbox[0].body)

    def test_password_reset_for_deactivated_user(self) -> None:
        user_profile = self.example_user("hamlet")
        email = user_profile.email
        do_deactivate_user(user_profile)

        # start the password reset process by supplying an email address
        result = self.client_post('/accounts/password/reset/', {'email': email})

        # check the redirect link telling you to check mail for password reset link
        self.assertEqual(result.status_code, 302)
        self.assertTrue(result["Location"].endswith(
            "/accounts/password/reset/done/"))
        result = self.client_get(result["Location"])

        self.assert_in_response("Check your email in a few minutes to finish the process.", result)

        # Check that the password reset email is from a noreply address.
        from django.core.mail import outbox
        from_email = outbox[0].from_email
        self.assertIn("Zulip Account Security", from_email)
        tokenized_no_reply_email = parseaddr(from_email)[1]
        self.assertTrue(re.search(self.TOKENIZED_NOREPLY_REGEX, tokenized_no_reply_email))
        self.assertIn('Someone (possibly you) requested a password',
                      outbox[0].body)
        self.assertNotIn('does have an active account in the zulip.testserver',
                         outbox[0].body)
        self.assertIn('but your account has been deactivated',
                      outbox[0].body)

    def test_password_reset_with_deactivated_realm(self) -> None:
        user_profile = self.example_user("hamlet")
        email = user_profile.email
        do_deactivate_realm(user_profile.realm)

        # start the password reset process by supplying an email address
        with patch('logging.info') as mock_logging:
            result = self.client_post('/accounts/password/reset/', {'email': email})
            mock_logging.assert_called_once()

        # check the redirect link telling you to check mail for password reset link
        self.assertEqual(result.status_code, 302)
        self.assertTrue(result["Location"].endswith(
            "/accounts/password/reset/done/"))
        result = self.client_get(result["Location"])

        self.assert_in_response("Check your email in a few minutes to finish the process.", result)

        # Check that the password reset email is from a noreply address.
        from django.core.mail import outbox
        self.assertEqual(len(outbox), 0)

    def test_wrong_subdomain(self) -> None:
        email = self.example_email("hamlet")

        # start the password reset process by supplying an email address
        result = self.client_post(
            '/accounts/password/reset/', {'email': email},
            subdomain="zephyr")

        # check the redirect link telling you to check mail for password reset link
        self.assertEqual(result.status_code, 302)
        self.assertTrue(result["Location"].endswith(
            "/accounts/password/reset/done/"))
        result = self.client_get(result["Location"])

        self.assert_in_response("Check your email in a few minutes to finish the process.", result)

        from django.core.mail import outbox
        self.assertEqual(len(outbox), 1)
        message = outbox.pop()
        tokenized_no_reply_email = parseaddr(message.from_email)[1]
        self.assertTrue(re.search(self.TOKENIZED_NOREPLY_REGEX, tokenized_no_reply_email))
        self.assertIn('Someone (possibly you) requested a password reset email for',
                      message.body)
        self.assertIn("but you do not have an account in that organization",
                      message.body)
        self.assertIn("You do have active accounts in the following organization(s).\nhttp://zulip.testserver",
                      message.body)

    def test_invalid_subdomain(self) -> None:
        email = self.example_email("hamlet")

        # start the password reset process by supplying an email address
        result = self.client_post(
            '/accounts/password/reset/', {'email': email},
            subdomain="invalid")

        # check the redirect link telling you to check mail for password reset link
        self.assertEqual(result.status_code, 200)
        self.assert_in_success_response(["There is no Zulip organization hosted at this subdomain."],
                                        result)

        from django.core.mail import outbox
        self.assertEqual(len(outbox), 0)

    @override_settings(AUTHENTICATION_BACKENDS=('zproject.backends.ZulipLDAPAuthBackend',
                                                'zproject.backends.ZulipDummyBackend'))
    def test_ldap_auth_only(self) -> None:
        """If the email auth backend is not enabled, password reset should do nothing"""
        email = self.example_email("hamlet")
        with patch('logging.info') as mock_logging:
            result = self.client_post('/accounts/password/reset/', {'email': email})
            mock_logging.assert_called_once()

        # check the redirect link telling you to check mail for password reset link
        self.assertEqual(result.status_code, 302)
        self.assertTrue(result["Location"].endswith(
            "/accounts/password/reset/done/"))
        result = self.client_get(result["Location"])

        self.assert_in_response("Check your email in a few minutes to finish the process.", result)

        from django.core.mail import outbox
        self.assertEqual(len(outbox), 0)

    @override_settings(AUTHENTICATION_BACKENDS=('zproject.backends.ZulipLDAPAuthBackend',
                                                'zproject.backends.EmailAuthBackend',
                                                'zproject.backends.ZulipDummyBackend'))
    def test_ldap_and_email_auth(self) -> None:
        """If both email and ldap auth backends are enabled, limit password
           reset to users outside the LDAP domain"""
        # If the domain matches, we don't generate an email
        with self.settings(LDAP_APPEND_DOMAIN="zulip.com"):
            email = self.example_email("hamlet")
            with patch('logging.info') as mock_logging:
                result = self.client_post('/accounts/password/reset/', {'email': email})
                mock_logging.assert_called_once_with("Password reset not allowed for user in LDAP domain")
        from django.core.mail import outbox
        self.assertEqual(len(outbox), 0)

        # If the domain doesn't match, we do generate an email
        with self.settings(LDAP_APPEND_DOMAIN="example.com"):
            email = self.example_email("hamlet")
            with patch('logging.info') as mock_logging:
                result = self.client_post('/accounts/password/reset/', {'email': email})
                self.assertEqual(result.status_code, 302)
                self.assertTrue(result["Location"].endswith(
                    "/accounts/password/reset/done/"))
                result = self.client_get(result["Location"])

        self.assertEqual(len(outbox), 1)
        message = outbox.pop()
        tokenized_no_reply_email = parseaddr(message.from_email)[1]
        self.assertTrue(re.search(self.TOKENIZED_NOREPLY_REGEX, tokenized_no_reply_email))
        self.assertIn('Psst. Word on the street is that you need a new password',
                      message.body)

    def test_redirect_endpoints(self) -> None:
        '''
        These tests are mostly designed to give us 100% URL coverage
        in our URL coverage reports.  Our mechanism for finding URL
        coverage doesn't handle redirects, so we just have a few quick
        tests here.
        '''
        result = self.client_get('/accounts/password/reset/done/')
        self.assert_in_success_response(["Check your email"], result)

        result = self.client_get('/accounts/password/done/')
        self.assert_in_success_response(["We've reset your password!"], result)

        result = self.client_get('/accounts/send_confirm/alice@example.com')
        self.assert_in_success_response(["/accounts/home/"], result)

        result = self.client_get('/accounts/new/send_confirm/alice@example.com')
        self.assert_in_success_response(["/new/"], result)

class LoginTest(ZulipTestCase):
    """
    Logging in, registration, and logging out.
    """

    def test_login(self) -> None:
        self.login(self.example_email("hamlet"))
        user_profile = self.example_user('hamlet')
        self.assertEqual(get_session_dict_user(self.client.session), user_profile.id)

    def test_login_deactivated_user(self) -> None:
        user_profile = self.example_user('hamlet')
        do_deactivate_user(user_profile)
        result = self.login_with_return(self.example_email("hamlet"), "xxx")
        self.assertEqual(result.status_code, 200)
        self.assert_in_response("Your account is no longer active.", result)
        self.assertIsNone(get_session_dict_user(self.client.session))

    def test_login_bad_password(self) -> None:
        email = self.example_email("hamlet")
        result = self.login_with_return(email, password="wrongpassword")
        self.assert_in_success_response([email], result)
        self.assertIsNone(get_session_dict_user(self.client.session))

    def test_login_nonexist_user(self) -> None:
        result = self.login_with_return("xxx@zulip.com", "xxx")
        self.assertEqual(result.status_code, 200)
        self.assert_in_response("Please enter a correct email and password", result)
        self.assertIsNone(get_session_dict_user(self.client.session))

    def test_login_wrong_subdomain(self) -> None:
        with patch("logging.warning") as mock_warning:
            result = self.login_with_return(self.mit_email("sipbtest"), "xxx")
            mock_warning.assert_called_once()
        self.assertEqual(result.status_code, 200)
        self.assert_in_response("Your Zulip account is not a member of the "
                                "organization associated with this subdomain.", result)
        self.assertIsNone(get_session_dict_user(self.client.session))

    def test_login_invalid_subdomain(self) -> None:
        result = self.login_with_return(self.example_email("hamlet"), "xxx",
                                        subdomain="invalid")
        self.assertEqual(result.status_code, 200)
        self.assert_in_response("There is no Zulip organization hosted at this subdomain.", result)
        self.assertIsNone(get_session_dict_user(self.client.session))

    def test_register(self) -> None:
        self._execute_register_flow()

    def _execute_register_flow(self) -> None:
        """Orchestrates the registration flow for a new user."""
        realm = get_realm("zulip")
        stream_dict = {"stream_"+str(i): {"description": "stream_%s_description" % i, "invite_only": False}
                       for i in range(40)}  # type: Dict[str, Dict[str, Any]]
        for stream_name in stream_dict.keys():
            self.make_stream(stream_name, realm=realm)

        set_default_streams(realm, stream_dict)
        self._clear_caches()
        with queries_captured() as queries:
            self.register(self.nonreg_email('test'), "test")
        self._assert_query_count(queries, 78)
        user_profile = self.nonreg_user('test')
        self.assertEqual(get_session_dict_user(self.client.session), user_profile.id)
        self.assertFalse(user_profile.enable_stream_desktop_notifications)

    def _clear_caches(self) -> None:
        """Clears per-request and global caches."""
        flush_per_request_caches()
        ContentType.objects.clear_cache()
        Site.objects.clear_cache()

    def _assert_query_count(self, queries, expected) -> None:
        """Asserts that the number of captured queries matches expectation."""
        self.assert_length(queries, expected)

    def test_register_deactivated(self) -> None:
        """
        If you try to register for a deactivated realm, you get a clear error
        page.
        """
        realm = get_realm("zulip")
        realm.deactivated = True
        realm.save(update_fields=["deactivated"])

        result = self.client_post('/accounts/home/', {'email': self.nonreg_email('test')},
                                  subdomain="zulip")
        self.assertEqual(result.status_code, 302)
        self.assertEqual('/accounts/deactivated/', result.url)

        with self.assertRaises(UserProfile.DoesNotExist):
            self.nonreg_user('test')

    def test_register_deactivated_partway_through(self) -> None:
        """
        If you try to register for a deactivated realm, you get a clear error
        page.
        """
        email = self.nonreg_email('test')
        result = self.client_post('/accounts/home/', {'email': email},
                                  subdomain="zulip")
        self.assertEqual(result.status_code, 302)
        self.assertNotIn('deactivated', result.url)

        realm = get_realm("zulip")
        realm.deactivated = True
        realm.save(update_fields=["deactivated"])

        result = self.submit_reg_form_for_user(email, "abcd1234", subdomain="zulip")
        self.assertEqual(result.status_code, 302)
        self.assertEqual('/accounts/deactivated/', result.url)

        with self.assertRaises(UserProfile.DoesNotExist):
            self.nonreg_user('test')

    def test_login_deactivated_realm(self) -> None:
        """
        If you try to log in to a deactivated realm, you get a clear error page.
        """
        realm = get_realm("zulip")
        realm.deactivated = True
        realm.save(update_fields=["deactivated"])

        result = self.login_with_return(self.example_email("hamlet"), subdomain="zulip")
        self.assertEqual(result.status_code, 302)
        self.assertEqual('/accounts/deactivated/', result.url)

    def test_logout(self) -> None:
        self.login(self.example_email("hamlet"))
        # We use the logout API, not self.logout, to make sure we test
        # the actual logout code path.
        self.client_post('/accounts/logout/')
        self.assertIsNone(get_session_dict_user(self.client.session))

    def test_non_ascii_login(self) -> None:
        """
        You can log in even if your password contain non-ASCII characters.
        """
        email = self.nonreg_email('test')
        password = u"hÃ¼mbÃ¼Çµ"

        # Registering succeeds.
        self.register(email, password)
        user_profile = self.nonreg_user('test')
        self.assertEqual(get_session_dict_user(self.client.session), user_profile.id)
        self.logout()
        self.assertIsNone(get_session_dict_user(self.client.session))

        # Logging in succeeds.
        self.logout()
        self.login(email, password)
        self.assertEqual(get_session_dict_user(self.client.session), user_profile.id)

    @override_settings(TWO_FACTOR_AUTHENTICATION_ENABLED=False)
    def test_login_page_redirects_logged_in_user(self) -> None:
        """You will be redirected to the app's main page if you land on the
        login page when already logged in.
        """
        self.login(self.example_email("cordelia"))
        response = self.client_get("/login/")
        self.assertEqual(response["Location"], "http://zulip.testserver")

    def test_options_request_to_login_page(self) -> None:
        response = self.client_options('/login/')
        self.assertEqual(response.status_code, 200)

    @override_settings(TWO_FACTOR_AUTHENTICATION_ENABLED=True)
    def test_login_page_redirects_logged_in_user_under_2fa(self) -> None:
        """You will be redirected to the app's main page if you land on the
        login page when already logged in.
        """
        user_profile = self.example_user("cordelia")
        self.create_default_device(user_profile)

        self.login(self.example_email("cordelia"))
        self.login_2fa(user_profile)

        response = self.client_get("/login/")
        self.assertEqual(response["Location"], "http://zulip.testserver")

    def test_start_two_factor_auth(self) -> None:
        request = MagicMock(POST=dict())
        with patch('zerver.views.auth.TwoFactorLoginView') as mock_view:
            mock_view.as_view.return_value = lambda *a, **k: HttpResponse()
            response = start_two_factor_auth(request)
            self.assertTrue(isinstance(response, HttpResponse))

    def test_do_two_factor_login(self) -> None:
        user_profile = self.example_user('hamlet')
        self.create_default_device(user_profile)
        request = MagicMock()
        with patch('zerver.decorator.django_otp.login') as mock_login:
            do_two_factor_login(request, user_profile)
            mock_login.assert_called_once()

class InviteUserBase(ZulipTestCase):
    def check_sent_emails(self, correct_recipients: List[str],
                          custom_from_name: Optional[str]=None) -> None:
        from django.core.mail import outbox
        self.assertEqual(len(outbox), len(correct_recipients))
        email_recipients = [email.recipients()[0] for email in outbox]
        self.assertEqual(sorted(email_recipients), sorted(correct_recipients))
        if len(outbox) == 0:
            return

        if custom_from_name is not None:
            self.assertIn(custom_from_name, outbox[0].from_email)

        tokenized_no_reply_email = parseaddr(outbox[0].from_email)[1]
        self.assertTrue(re.search(self.TOKENIZED_NOREPLY_REGEX, tokenized_no_reply_email))

    def invite(self, users: str, streams: List[str], body: str='',
               invite_as_admin: str="false") -> HttpResponse:
        """
        Invites the specified users to Zulip with the specified streams.

        users should be a string containing the users to invite, comma or
            newline separated.

        streams should be a list of strings.
        """

        return self.client_post("/json/invites",
                                {"invitee_emails": users,
                                 "stream": streams,
                                 "invite_as_admin": invite_as_admin})

class InviteUserTest(InviteUserBase):
    def test_successful_invite_user(self) -> None:
        """
        A call to /json/invites with valid parameters causes an invitation
        email to be sent.
        """
        self.login(self.example_email("hamlet"))
        invitee = "alice-test@zulip.com"
        self.assert_json_success(self.invite(invitee, ["Denmark"]))
        self.assertTrue(find_key_by_email(invitee))
        self.check_sent_emails([invitee], custom_from_name="Hamlet")

    def test_newbie_restrictions(self) -> None:
        user_profile = self.example_user('hamlet')
        invitee = "alice-test@zulip.com"
        stream_name = 'Denmark'

        self.login(user_profile.email)

        result = self.invite(invitee, [stream_name])
        self.assert_json_success(result)

        user_profile.date_joined = timezone_now() - datetime.timedelta(days=10)
        user_profile.save()

        with self.settings(INVITES_MIN_USER_AGE_DAYS=5):
            result = self.invite(invitee, [stream_name])
            self.assert_json_success(result)

        with self.settings(INVITES_MIN_USER_AGE_DAYS=15):
            result = self.invite(invitee, [stream_name])
            self.assert_json_error_contains(result, "Your account is too new")

    def test_invite_limits(self) -> None:
        user_profile = self.example_user('hamlet')
        realm = user_profile.realm
        stream_name = 'Denmark'

        # These constants only need to be in descending order
        # for this test to trigger an InvitationError based
        # on max daily counts.
        site_max = 50
        realm_max = 40
        num_invitees = 30
        max_daily_count = 20

        daily_counts = [(1, max_daily_count)]

        invite_emails = [
            'foo-%02d@zulip.com' % (i,)
            for i in range(num_invitees)
        ]
        invitees = ','.join(invite_emails)

        self.login(user_profile.email)

        realm.max_invites = realm_max
        realm.date_created = timezone_now()
        realm.save()

        def try_invite() -> HttpResponse:
            with self.settings(OPEN_REALM_CREATION=True,
                               INVITES_DEFAULT_REALM_DAILY_MAX=site_max,
                               INVITES_NEW_REALM_LIMIT_DAYS=daily_counts):
                result = self.invite(invitees, [stream_name])
                return result

        result = try_invite()
        self.assert_json_error_contains(result, 'enough remaining invites')

        # Next show that aggregate limits expire once the realm is old
        # enough.

        realm.date_created = timezone_now() - datetime.timedelta(days=8)
        realm.save()

        result = try_invite()
        self.assert_json_success(result)

        # Next get line coverage on bumping a realm's max_invites.
        realm.date_created = timezone_now()
        realm.max_invites = site_max + 10
        realm.save()

        result = try_invite()
        self.assert_json_success(result)

        # Finally get coverage on the case that OPEN_REALM_CREATION is False.

        with self.settings(OPEN_REALM_CREATION=False):
            result = self.invite(invitees, [stream_name])

        self.assert_json_success(result)

    def test_successful_invite_user_as_admin_from_admin_account(self) -> None:
        """
        Test that a new user invited to a stream receives some initial
        history but only from public streams.
        """
        self.login(self.example_email('iago'))
        invitee = self.nonreg_email('alice')
        self.assert_json_success(self.invite(invitee, ["Denmark"], invite_as_admin="true"))
        self.assertTrue(find_key_by_email(invitee))

        self.submit_reg_form_for_user(invitee, "password")
        invitee_profile = self.nonreg_user('alice')
        self.assertTrue(invitee_profile.is_realm_admin)

    def test_invite_user_as_admin_from_normal_account(self) -> None:
        """
        Test that a new user invited to a stream receives some initial
        history but only from public streams.
        """
        self.login(self.example_email('hamlet'))
        invitee = self.nonreg_email('alice')
        response = self.invite(invitee, ["Denmark"], invite_as_admin="true")
        self.assert_json_error(response, "Must be an organization administrator")

    def test_successful_invite_user_with_name(self) -> None:
        """
        A call to /json/invites with valid parameters causes an invitation
        email to be sent.
        """
        self.login(self.example_email("hamlet"))
        email = "alice-test@zulip.com"
        invitee = "Alice Test <{}>".format(email)
        self.assert_json_success(self.invite(invitee, ["Denmark"]))
        self.assertTrue(find_key_by_email(email))
        self.check_sent_emails([email], custom_from_name="Hamlet")

    def test_successful_invite_user_with_name_and_normal_one(self) -> None:
        """
        A call to /json/invites with valid parameters causes an invitation
        email to be sent.
        """
        self.login(self.example_email("hamlet"))
        email = "alice-test@zulip.com"
        email2 = "bob-test@zulip.com"
        invitee = "Alice Test <{}>, {}".format(email, email2)
        self.assert_json_success(self.invite(invitee, ["Denmark"]))
        self.assertTrue(find_key_by_email(email))
        self.assertTrue(find_key_by_email(email2))
        self.check_sent_emails([email, email2], custom_from_name="Hamlet")

    def test_require_realm_admin(self) -> None:
        """
        The invite_by_admins_only realm setting works properly.
        """
        realm = get_realm('zulip')
        realm.invite_by_admins_only = True
        realm.save()

        self.login("hamlet@zulip.com")
        email = "alice-test@zulip.com"
        email2 = "bob-test@zulip.com"
        invitee = "Alice Test <{}>, {}".format(email, email2)
        self.assert_json_error(self.invite(invitee, ["Denmark"]),
                               "Must be an organization administrator")

        # Now verify an administrator can do it
        self.login("iago@zulip.com")
        self.assert_json_success(self.invite(invitee, ["Denmark"]))
        self.assertTrue(find_key_by_email(email))
        self.assertTrue(find_key_by_email(email2))
        self.check_sent_emails([email, email2])

    def test_successful_invite_user_with_notifications_stream(self) -> None:
        """
        A call to /json/invites with valid parameters unconditionally
        subscribes the invitee to the notifications stream if it exists and is
        public.
        """
        realm = get_realm('zulip')
        notifications_stream = get_stream('Verona', realm)
        realm.notifications_stream_id = notifications_stream.id
        realm.save()

        self.login(self.example_email("hamlet"))
        invitee = 'alice-test@zulip.com'
        self.assert_json_success(self.invite(invitee, ['Denmark']))
        self.assertTrue(find_key_by_email(invitee))
        self.check_sent_emails([invitee])

        prereg_user = PreregistrationUser.objects.get(email=invitee)
        stream_ids = [stream.id for stream in prereg_user.streams.all()]
        self.assertTrue(notifications_stream.id in stream_ids)

    def test_invite_user_signup_initial_history(self) -> None:
        """
        Test that a new user invited to a stream receives some initial
        history but only from public streams.
        """
        self.login(self.example_email('hamlet'))
        user_profile = self.example_user('hamlet')
        private_stream_name = "Secret"
        self.make_stream(private_stream_name, invite_only=True)
        self.subscribe(user_profile, private_stream_name)
        public_msg_id = self.send_stream_message(
            self.example_email("hamlet"),
            "Denmark",
            topic_name="Public topic",
            content="Public message",
        )
        secret_msg_id = self.send_stream_message(
            self.example_email("hamlet"),
            private_stream_name,
            topic_name="Secret topic",
            content="Secret message",
        )
        invitee = self.nonreg_email('alice')
        self.assert_json_success(self.invite(invitee, [private_stream_name, "Denmark"]))
        self.assertTrue(find_key_by_email(invitee))

        self.submit_reg_form_for_user(invitee, "password")
        invitee_profile = self.nonreg_user('alice')
        invitee_msg_ids = [um.message_id for um in
                           UserMessage.objects.filter(user_profile=invitee_profile)]
        self.assertTrue(public_msg_id in invitee_msg_ids)
        self.assertFalse(secret_msg_id in invitee_msg_ids)
        self.assertFalse(invitee_profile.is_realm_admin)
        # Test that exactly 2 new Zulip messages were sent, both notifications.
        last_3_messages = list(reversed(list(Message.objects.all().order_by("-id")[0:3])))
        first_msg = last_3_messages[0]
        self.assertEqual(first_msg.id, secret_msg_id)

        # The first, from notification-bot to the user who invited the new user.
        second_msg = last_3_messages[1]
        self.assertEqual(second_msg.sender.email, "notification-bot@zulip.com")
        self.assertTrue(second_msg.content.startswith("alice_zulip.com <`alice@zulip.com`> accepted your"))

        # The second, from welcome-bot to the user who was invited.
        third_msg = last_3_messages[2]
        self.assertEqual(third_msg.sender.email, "welcome-bot@zulip.com")
        self.assertTrue(third_msg.content.startswith("Hello, and welcome to Zulip!"))

    def test_multi_user_invite(self) -> None:
        """
        Invites multiple users with a variety of delimiters.
        """
        self.login(self.example_email("hamlet"))
        # Intentionally use a weird string.
        self.assert_json_success(self.invite(
            """bob-test@zulip.com,     carol-test@zulip.com,
            dave-test@zulip.com


earl-test@zulip.com""", ["Denmark"]))
        for user in ("bob", "carol", "dave", "earl"):
            self.assertTrue(find_key_by_email("%s-test@zulip.com" % (user,)))
        self.check_sent_emails(["bob-test@zulip.com", "carol-test@zulip.com",
                                "dave-test@zulip.com", "earl-test@zulip.com"])

    def test_max_invites_model(self) -> None:
        realm = get_realm("zulip")
        self.assertEqual(realm.max_invites, settings.INVITES_DEFAULT_REALM_DAILY_MAX)
        realm.max_invites = 3
        realm.save()
        self.assertEqual(get_realm("zulip").max_invites, 3)
        realm.max_invites = settings.INVITES_DEFAULT_REALM_DAILY_MAX
        realm.save()

    def test_invite_too_many_users(self) -> None:
        # Only a light test of this pathway; e.g. doesn't test that
        # the limit gets reset after 24 hours
        self.login(self.example_email("iago"))
        self.client_post("/json/invites",
                         {"invitee_emails": "1@zulip.com, 2@zulip.com",
                          "stream": ["Denmark"]}),

        self.assert_json_error(
            self.client_post("/json/invites",
                             {"invitee_emails": ", ".join(
                                 [str(i) for i in range(get_realm("zulip").max_invites - 1)]),
                              "stream": ["Denmark"]}),
            "You do not have enough remaining invites. "
            "Please contact zulip-admin@example.com to have your limit raised. "
            "No invitations were sent.")

    def test_missing_or_invalid_params(self) -> None:
        """
        Tests inviting with various missing or invalid parameters.
        """
        self.login(self.example_email("hamlet"))
        self.assert_json_error(
            self.client_post("/json/invites",
                             {"invitee_emails": "foo@zulip.com"}),
            "You must specify at least one stream for invitees to join.")

    def test_invalid_stream(self) -> None:
        """
        Tests inviting to a non-existent stream.
        """
        self.login(self.example_email("hamlet"))
        self.assert_json_error(self.invite("iago-test@zulip.com", ["NotARealStream"]),
                               "Stream does not exist: NotARealStream. No invites were sent.")
        self.check_sent_emails([])

    def test_invite_existing_user(self) -> None:
        """
        If you invite an address already using Zulip, no invitation is sent.
        """
        self.login(self.example_email("hamlet"))
        self.assert_json_error(
            self.client_post("/json/invites",
                             {"invitee_emails": self.example_email("hamlet"),
                              "stream": ["Denmark"]}),
            "We weren't able to invite anyone.")
        self.assertRaises(PreregistrationUser.DoesNotExist,
                          lambda: PreregistrationUser.objects.get(
                              email=self.example_email("hamlet")))
        self.check_sent_emails([])

    def test_invite_some_existing_some_new(self) -> None:
        """
        If you invite a mix of already existing and new users, invitations are
        only sent to the new users.
        """
        self.login(self.example_email("hamlet"))
        existing = [self.example_email("hamlet"), u"othello@zulip.com"]
        new = [u"foo-test@zulip.com", u"bar-test@zulip.com"]

        result = self.client_post("/json/invites",
                                  {"invitee_emails": "\n".join(existing + new),
                                   "stream": ["Denmark"]})
        self.assert_json_error(result,
                               "Some of those addresses are already using Zulip, \
so we didn't send them an invitation. We did send invitations to everyone else!")

        # We only created accounts for the new users.
        for email in existing:
            self.assertRaises(PreregistrationUser.DoesNotExist,
                              lambda: PreregistrationUser.objects.get(
                                  email=email))
        for email in new:
            self.assertTrue(PreregistrationUser.objects.get(email=email))

        # We only sent emails to the new users.
        self.check_sent_emails(new)

        prereg_user = PreregistrationUser.objects.get(email='foo-test@zulip.com')
        self.assertEqual(prereg_user.email, 'foo-test@zulip.com')

    def test_invite_outside_domain_in_closed_realm(self) -> None:
        """
        In a realm with `emails_restricted_to_domains = True`, you can't invite people
        with a different domain from that of the realm or your e-mail address.
        """
        zulip_realm = get_realm("zulip")
        zulip_realm.emails_restricted_to_domains = True
        zulip_realm.save()

        self.login(self.example_email("hamlet"))
        external_address = "foo@example.com"

        self.assert_json_error(
            self.invite(external_address, ["Denmark"]),
            "Some emails did not validate, so we didn't send any invitations.")

    def test_invite_using_disposable_email(self) -> None:
        """
        In a realm with `disallow_disposable_email_addresses = True`, you can't invite
        people with a disposable domain.
        """
        zulip_realm = get_realm("zulip")
        zulip_realm.emails_restricted_to_domains = False
        zulip_realm.disallow_disposable_email_addresses = True
        zulip_realm.save()

        self.login(self.example_email("hamlet"))
        external_address = "foo@mailnator.com"

        self.assert_json_error(
            self.invite(external_address, ["Denmark"]),
            "Some emails did not validate, so we didn't send any invitations.")

    def test_invite_outside_domain_in_open_realm(self) -> None:
        """
        In a realm with `emails_restricted_to_domains = False`, you can invite people
        with a different domain from that of the realm or your e-mail address.
        """
        zulip_realm = get_realm("zulip")
        zulip_realm.emails_restricted_to_domains = False
        zulip_realm.save()

        self.login(self.example_email("hamlet"))
        external_address = "foo@example.com"

        self.assert_json_success(self.invite(external_address, ["Denmark"]))
        self.check_sent_emails([external_address])

    def test_invite_outside_domain_before_closing(self) -> None:
        """
        If you invite someone with a different domain from that of the realm
        when `emails_restricted_to_domains = False`, but `emails_restricted_to_domains`
        later changes to true, the invitation should succeed but the invitee's signup
        attempt should fail.
        """
        zulip_realm = get_realm("zulip")
        zulip_realm.emails_restricted_to_domains = False
        zulip_realm.save()

        self.login(self.example_email("hamlet"))
        external_address = "foo@example.com"

        self.assert_json_success(self.invite(external_address, ["Denmark"]))
        self.check_sent_emails([external_address])

        zulip_realm.emails_restricted_to_domains = True
        zulip_realm.save()

        result = self.submit_reg_form_for_user("foo@example.com", "password")
        self.assertEqual(result.status_code, 200)
        self.assert_in_response("only allows users with email addresses", result)

    def test_disposable_emails_before_closing(self) -> None:
        """
        If you invite someone with a disposable email when
        `disallow_disposable_email_addresses = False`, but
        later changes to true, the invitation should succeed
        but the invitee's signup attempt should fail.
        """
        zulip_realm = get_realm("zulip")
        zulip_realm.emails_restricted_to_domains = False
        zulip_realm.disallow_disposable_email_addresses = False
        zulip_realm.save()

        self.login(self.example_email("hamlet"))
        external_address = "foo@mailnator.com"

        self.assert_json_success(self.invite(external_address, ["Denmark"]))
        self.check_sent_emails([external_address])

        zulip_realm.disallow_disposable_email_addresses = True
        zulip_realm.save()

        result = self.submit_reg_form_for_user("foo@mailnator.com", "password")
        self.assertEqual(result.status_code, 200)
        self.assert_in_response("Please sign up using a real email address.", result)

    def test_invite_with_email_containing_plus_before_closing(self) -> None:
        """
        If you invite someone with an email containing plus when
        `emails_restricted_to_domains = False`, but later change
        `emails_restricted_to_domains = True`, the invitation should
        succeed but the invitee's signup attempt should fail as
        users are not allowed to signup using email containing +
        when the realm is restricted to domain.
        """
        zulip_realm = get_realm("zulip")
        zulip_realm.emails_restricted_to_domains = False
        zulip_realm.save()

        self.login(self.example_email("hamlet"))
        external_address = "foo+label@zulip.com"

        self.assert_json_success(self.invite(external_address, ["Denmark"]))
        self.check_sent_emails([external_address])

        zulip_realm.emails_restricted_to_domains = True
        zulip_realm.save()

        result = self.submit_reg_form_for_user(external_address, "password")
        self.assertEqual(result.status_code, 200)
        self.assert_in_response("Zulip Dev, does not allow signups using emails\n        that contains +", result)

    def test_invalid_email_check_after_confirming_email(self) -> None:
        self.login(self.example_email("hamlet"))
        email = "test@zulip.com"

        self.assert_json_success(self.invite(email, ["Denmark"]))

        obj = Confirmation.objects.get(confirmation_key=find_key_by_email(email))
        prereg_user = obj.content_object
        prereg_user.email = "invalid.email"
        prereg_user.save()

        result = self.submit_reg_form_for_user(email, "password")
        self.assertEqual(result.status_code, 200)
        self.assert_in_response("The email address you are trying to sign up with is not valid", result)

    def test_invite_with_non_ascii_streams(self) -> None:
        """
        Inviting someone to streams with non-ASCII characters succeeds.
        """
        self.login(self.example_email("hamlet"))
        invitee = "alice-test@zulip.com"

        stream_name = u"hÃ¼mbÃ¼Çµ"

        # Make sure we're subscribed before inviting someone.
        self.subscribe(self.example_user("hamlet"), stream_name)

        self.assert_json_success(self.invite(invitee, [stream_name]))

    def test_invitation_reminder_email(self) -> None:
        from django.core.mail import outbox

        # All users belong to zulip realm
        referrer_user = 'hamlet'
        current_user_email = self.example_email(referrer_user)
        self.login(current_user_email)
        invitee_email = self.nonreg_email('alice')
        self.assert_json_success(self.invite(invitee_email, ["Denmark"]))
        self.assertTrue(find_key_by_email(invitee_email))
        self.check_sent_emails([invitee_email])

        data = {"email": invitee_email, "referrer_email": current_user_email}
        invitee = PreregistrationUser.objects.get(email=data["email"])
        referrer = self.example_user(referrer_user)
        link = create_confirmation_link(invitee, referrer.realm.host, Confirmation.INVITATION)
        context = common_context(referrer)
        context.update({
            'activate_url': link,
            'referrer_name': referrer.full_name,
            'referrer_email': referrer.email,
            'referrer_realm_name': referrer.realm.name,
        })
        with self.settings(EMAIL_BACKEND='django.core.mail.backends.console.EmailBackend'):
            send_future_email(
                "zerver/emails/invitation_reminder", referrer.realm, to_email=data["email"],
                from_address=FromAddress.NOREPLY, context=context)
        email_jobs_to_deliver = ScheduledEmail.objects.filter(
            scheduled_timestamp__lte=timezone_now())
        self.assertEqual(len(email_jobs_to_deliver), 1)
        email_count = len(outbox)
        for job in email_jobs_to_deliver:
            send_email(**ujson.loads(job.data))
        self.assertEqual(len(outbox), email_count + 1)
        self.assertIn(FromAddress.NOREPLY, outbox[-1].from_email)

        # Now verify that signing up clears invite_reminder emails
        email_jobs_to_deliver = ScheduledEmail.objects.filter(
            scheduled_timestamp__lte=timezone_now(), type=ScheduledEmail.INVITATION_REMINDER)
        self.assertEqual(len(email_jobs_to_deliver), 1)

        self.register(invitee_email, "test")
        email_jobs_to_deliver = ScheduledEmail.objects.filter(
            scheduled_timestamp__lte=timezone_now(), type=ScheduledEmail.INVITATION_REMINDER)
        self.assertEqual(len(email_jobs_to_deliver), 0)

    # make sure users can't take a valid confirmation key from another
    # pathway and use it with the invitation url route
    def test_confirmation_key_of_wrong_type(self) -> None:
        user = self.example_user('hamlet')
        url = create_confirmation_link(user, 'host', Confirmation.USER_REGISTRATION)
        registration_key = url.split('/')[-1]

        # Mainly a test of get_object_from_key, rather than of the invitation pathway
        with self.assertRaises(ConfirmationKeyException) as cm:
            get_object_from_key(registration_key, Confirmation.INVITATION)
        self.assertEqual(cm.exception.error_type, ConfirmationKeyException.DOES_NOT_EXIST)

        # Verify that using the wrong type doesn't work in the main confirm code path
        email_change_url = create_confirmation_link(user, 'host', Confirmation.EMAIL_CHANGE)
        email_change_key = email_change_url.split('/')[-1]
        url = '/accounts/do_confirm/' + email_change_key
        result = self.client_get(url)
        self.assert_in_success_response(["Whoops. We couldn't find your "
                                         "confirmation link in the system."], result)

    def test_confirmation_expired(self) -> None:
        user = self.example_user('hamlet')
        url = create_confirmation_link(user, 'host', Confirmation.USER_REGISTRATION)
        registration_key = url.split('/')[-1]

        conf = Confirmation.objects.filter(confirmation_key=registration_key).first()
        conf.date_sent -= datetime.timedelta(weeks=3)
        conf.save()

        target_url = '/' + url.split('/', 3)[3]
        result = self.client_get(target_url)
        self.assert_in_success_response(["Whoops. The confirmation link has expired "
                                         "or been deactivated."], result)

class InvitationsTestCase(InviteUserBase):
    def test_successful_get_open_invitations(self) -> None:
        """
        A GET call to /json/invites returns all unexpired invitations.
        """

        days_to_activate = getattr(settings, 'ACCOUNT_ACTIVATION_DAYS', "Wrong")
        active_value = getattr(confirmation_settings, 'STATUS_ACTIVE', "Wrong")
        self.assertNotEqual(days_to_activate, "Wrong")
        self.assertNotEqual(active_value, "Wrong")

        self.login(self.example_email("iago"))
        user_profile = self.example_user("iago")

        prereg_user_one = PreregistrationUser(email="TestOne@zulip.com", referred_by=user_profile)
        prereg_user_one.save()
        expired_datetime = timezone_now() - datetime.timedelta(days=(days_to_activate+1))
        prereg_user_two = PreregistrationUser(email="TestTwo@zulip.com", referred_by=user_profile)
        prereg_user_two.save()
        PreregistrationUser.objects.filter(id=prereg_user_two.id).update(invited_at=expired_datetime)
        prereg_user_three = PreregistrationUser(email="TestThree@zulip.com",
                                                referred_by=user_profile, status=active_value)
        prereg_user_three.save()

        result = self.client_get("/json/invites")
        self.assertEqual(result.status_code, 200)
        self.assert_in_success_response(["TestOne@zulip.com"], result)
        self.assert_not_in_success_response(["TestTwo@zulip.com", "TestThree@zulip.com"], result)

    def test_successful_delete_invitation(self) -> None:
        """
        A DELETE call to /json/invites/<ID> should delete the invite and
        any scheduled invitation reminder emails.
        """
        self.login(self.example_email("iago"))

        invitee = "DeleteMe@zulip.com"
        self.assert_json_success(self.invite(invitee, ['Denmark']))
        prereg_user = PreregistrationUser.objects.get(email=invitee)

        # Verify that the scheduled email exists.
        ScheduledEmail.objects.get(address__iexact=invitee,
                                   type=ScheduledEmail.INVITATION_REMINDER)

        result = self.client_delete('/json/invites/' + str(prereg_user.id))
        self.assertEqual(result.status_code, 200)
        error_result = self.client_delete('/json/invites/' + str(prereg_user.id))
        self.assert_json_error(error_result, "No such invitation")

        self.assertRaises(ScheduledEmail.DoesNotExist,
                          lambda: ScheduledEmail.objects.get(address__iexact=invitee,
                                                             type=ScheduledEmail.INVITATION_REMINDER))

    def test_successful_resend_invitation(self) -> None:
        """
        A POST call to /json/invites/<ID>/resend should send an invitation reminder email
        and delete any scheduled invitation reminder email.
        """
        self.login(self.example_email("iago"))
        invitee = "resend_me@zulip.com"

        self.assert_json_success(self.invite(invitee, ['Denmark']))
        prereg_user = PreregistrationUser.objects.get(email=invitee)

        # Verify and then clear from the outbox the original invite email
        self.check_sent_emails([invitee], custom_from_name="Zulip")
        from django.core.mail import outbox
        outbox.pop()

        # Verify that the scheduled email exists.
        scheduledemail_filter = ScheduledEmail.objects.filter(
            address=invitee, type=ScheduledEmail.INVITATION_REMINDER)
        self.assertEqual(scheduledemail_filter.count(), 1)
        original_timestamp = scheduledemail_filter.values_list('scheduled_timestamp', flat=True)

        # Resend invite
        result = self.client_post('/json/invites/' + str(prereg_user.id) + '/resend')
        self.assertEqual(ScheduledEmail.objects.filter(
            address=invitee, type=ScheduledEmail.INVITATION_REMINDER).count(), 1)

        # Check that we have exactly one scheduled email, and that it is different
        self.assertEqual(scheduledemail_filter.count(), 1)
        self.assertNotEqual(original_timestamp,
                            scheduledemail_filter.values_list('scheduled_timestamp', flat=True))

        self.assertEqual(result.status_code, 200)
        error_result = self.client_post('/json/invites/' + str(9999) + '/resend')
        self.assert_json_error(error_result, "No such invitation")

        self.check_sent_emails([invitee], custom_from_name="Zulip")

    def test_accessing_invites_in_another_realm(self) -> None:
        invitor = UserProfile.objects.exclude(realm=get_realm('zulip')).first()
        prereg_user = PreregistrationUser.objects.create(
            email='email', referred_by=invitor, realm=invitor.realm)
        self.login(self.example_email("iago"))
        error_result = self.client_post('/json/invites/' + str(prereg_user.id) + '/resend')
        self.assert_json_error(error_result, "No such invitation")
        error_result = self.client_delete('/json/invites/' + str(prereg_user.id))
        self.assert_json_error(error_result, "No such invitation")

class InviteeEmailsParserTests(TestCase):
    def setUp(self) -> None:
        self.email1 = "email1@zulip.com"
        self.email2 = "email2@zulip.com"
        self.email3 = "email3@zulip.com"

    def test_if_emails_separated_by_commas_are_parsed_and_striped_correctly(self) -> None:
        emails_raw = "{} ,{}, {}".format(self.email1, self.email2, self.email3)
        expected_set = {self.email1, self.email2, self.email3}
        self.assertEqual(get_invitee_emails_set(emails_raw), expected_set)

    def test_if_emails_separated_by_newlines_are_parsed_and_striped_correctly(self) -> None:
        emails_raw = "{}\n {}\n {} ".format(self.email1, self.email2, self.email3)
        expected_set = {self.email1, self.email2, self.email3}
        self.assertEqual(get_invitee_emails_set(emails_raw), expected_set)

    def test_if_emails_from_email_client_separated_by_newlines_are_parsed_correctly(self) -> None:
        emails_raw = "Email One <{}>\nEmailTwo<{}>\nEmail Three<{}>".format(self.email1, self.email2, self.email3)
        expected_set = {self.email1, self.email2, self.email3}
        self.assertEqual(get_invitee_emails_set(emails_raw), expected_set)

    def test_if_emails_in_mixed_style_are_parsed_correctly(self) -> None:
        emails_raw = "Email One <{}>,EmailTwo<{}>\n{}".format(self.email1, self.email2, self.email3)
        expected_set = {self.email1, self.email2, self.email3}
        self.assertEqual(get_invitee_emails_set(emails_raw), expected_set)

class MultiuseInviteTest(ZulipTestCase):
    def setUp(self) -> None:
        self.realm = get_realm('zulip')
        self.realm.invite_required = True
        self.realm.save()

    def generate_multiuse_invite_link(self, streams: List[Stream]=None,
                                      date_sent: Optional[datetime.datetime]=None) -> str:
        invite = MultiuseInvite(realm=self.realm, referred_by=self.example_user("iago"))
        invite.save()

        if streams is not None:
            invite.streams.set(streams)

        if date_sent is None:
            date_sent = timezone_now()
        key = generate_key()
        Confirmation.objects.create(content_object=invite, date_sent=date_sent,
                                    confirmation_key=key, type=Confirmation.MULTIUSE_INVITE)

        return confirmation_url(key, self.realm.host, Confirmation.MULTIUSE_INVITE)

    def check_user_able_to_register(self, email: str, invite_link: str) -> None:
        password = "password"

        result = self.client_post(invite_link, {'email': email})
        self.assertEqual(result.status_code, 302)
        self.assertTrue(result["Location"].endswith(
            "/accounts/send_confirm/%s" % (email,)))
        result = self.client_get(result["Location"])
        self.assert_in_response("Check your email so we can get started.", result)

        confirmation_url = self.get_confirmation_url_from_outbox(email)
        result = self.client_get(confirmation_url)
        self.assertEqual(result.status_code, 200)

        result = self.submit_reg_form_for_user(email, password)
        self.assertEqual(result.status_code, 302)

        from django.core.mail import outbox
        outbox.pop()

    def test_valid_multiuse_link(self) -> None:
        email1 = self.nonreg_email("test")
        email2 = self.nonreg_email("test1")
        email3 = self.nonreg_email("alice")

        date_sent = timezone_now() - datetime.timedelta(days=settings.INVITATION_LINK_VALIDITY_DAYS - 1)
        invite_link = self.generate_multiuse_invite_link(date_sent=date_sent)

        self.check_user_able_to_register(email1, invite_link)
        self.check_user_able_to_register(email2, invite_link)
        self.check_user_able_to_register(email3, invite_link)

    def test_expired_multiuse_link(self) -> None:
        email = self.nonreg_email('newuser')
        date_sent = timezone_now() - datetime.timedelta(days=settings.INVITATION_LINK_VALIDITY_DAYS)
        invite_link = self.generate_multiuse_invite_link(date_sent=date_sent)
        result = self.client_post(invite_link, {'email': email})

        self.assertEqual(result.status_code, 200)
        self.assert_in_response("The confirmation link has expired or been deactivated.", result)

    def test_invalid_multiuse_link(self) -> None:
        email = self.nonreg_email('newuser')
        invite_link = "/join/invalid_key/"
        result = self.client_post(invite_link, {'email': email})

        self.assertEqual(result.status_code, 200)
        self.assert_in_response("Whoops. The confirmation link is malformed.", result)

    def test_invalid_multiuse_link_in_open_realm(self) -> None:
        self.realm.invite_required = False
        self.realm.save()

    def test_multiuse_link_with_specified_streams(self) -> None:
        name1 = "newuser"
        name2 = "bob"
        email1 = self.nonreg_email(name1)