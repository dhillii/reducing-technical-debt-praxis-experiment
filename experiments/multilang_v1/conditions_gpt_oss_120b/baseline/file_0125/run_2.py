# -*- coding: utf-8 -*-
from django.conf import settings
from django.core import mail
from django.http import HttpResponse
from django.test import override_settings
from django_auth_ldap.backend import _LDAPUser
from django.contrib.auth import authenticate
from django.test.client import RequestFactory
from django.utils.timezone import now as timezone_now
from typing import Any, Callable, Dict, List, Optional, Tuple
from builtins import object
from oauth2client.crypt import AppIdentityError
from django.core import signing
from django.urls import reverse
import httpretty
import os
import sys

import jwt
import mock
import re
import time
import datetime

from zerver.forms import HomepageForm
from zerver.lib.actions import (
    do_deactivate_realm,
    do_deactivate_user,
    do_reactivate_realm,
    do_reactivate_user,
    do_set_realm_authentication_methods,
    ensure_stream,
    validate_email,
)
from zerver.lib.mobile_auth_otp import otp_decrypt_api_key
from zerver.lib.validator import validate_login_email, \
    check_bool, check_dict_only, check_string, Validator
from zerver.lib.request import JsonableError
from zerver.lib.users import get_all_api_keys
from zerver.lib.initial_password import initial_password
from zerver.lib.sessions import get_session_dict_user
from zerver.lib.test_classes import (
    ZulipTestCase,
)
from zerver.lib.test_helpers import POSTRequestMock, HostRequestMock
from zerver.models import \
    get_realm, email_to_username, UserProfile, \
    PreregistrationUser, Realm, get_user, MultiuseInvite
from zerver.signals import JUST_CREATED_THRESHOLD

from confirmation.models import Confirmation, confirmation_url, create_confirmation_link

from zproject.backends import ZulipDummyBackend, EmailAuthBackend, \
    GoogleMobileOauth2Backend, ZulipRemoteUserBackend, ZulipLDAPAuthBackend, \
    ZulipLDAPUserPopulator, DevAuthBackend, GitHubAuthBackend, ZulipAuthMixin, \
    dev_auth_enabled, password_auth_enabled, github_auth_enabled, \
    require_email_format_usernames, AUTH_BACKEND_NAME_MAP, \
    ZulipLDAPConfigurationError, generate_dev_ldap_dir

from zerver.views.auth import (maybe_send_to_registration,
                               login_or_register_remote_user,
                               _subdomain_token_salt)
from version import ZULIP_VERSION

from social_core.exceptions import AuthFailed, AuthStateForbidden
from social_django.strategy import DjangoStrategy
from social_django.storage import BaseDjangoStorage
from social_core.backends.github import GithubOrganizationOAuth2, GithubTeamOAuth2, \
    GithubOAuth2

import json
import urllib
from http.cookies import SimpleCookie
import ujson
from zerver.lib.test_helpers import MockLDAP, load_subdomain_token


class AuthBackendTest(ZulipTestCase):
    def get_username(self, email_to_username: Optional[Callable[[str], str]] = None) -> str:
        username = self.example_email('hamlet')
        if email_to_username is not None:
            username = email_to_username(self.example_email('hamlet'))
        return username

    def _assert_auth_success(self, backend: Any, kwargs: Dict[str, Any], expected_user: UserProfile) -> None:
        result = backend.authenticate(**kwargs)
        self.assertEqual(expected_user, result)

    def _assert_auth_failure(self, backend: Any, kwargs: Dict[str, Any]) -> None:
        self.assertIsNone(backend.authenticate(**kwargs))

    def _find_backend_name(self, backend: Any) -> str:
        for name, cls in AUTH_BACKEND_NAME_MAP.items():
            if isinstance(backend, cls):
                return name
        raise AssertionError("Backend name not found")

    def verify_backend(self, backend: Any, good_kwargs: Optional[Dict[str, Any]] = None,
                       bad_kwargs: Optional[Dict[str, Any]] = None) -> None:
        user_profile = self.example_user('hamlet')
        assert good_kwargs is not None

        if bad_kwargs is not None:
            self._assert_auth_failure(backend, bad_kwargs)

        self._assert_auth_success(backend, good_kwargs, user_profile)

        do_deactivate_user(user_profile)
        self._assert_auth_failure(backend, good_kwargs)
        do_reactivate_user(user_profile)
        self._assert_auth_success(backend, good_kwargs, user_profile)

        do_deactivate_realm(user_profile.realm)
        self._assert_auth_failure(backend, good_kwargs)
        do_reactivate_realm(user_profile.realm)
        self._assert_auth_success(backend, good_kwargs, user_profile)

        if isinstance(backend, ZulipDummyBackend):
            return

        with self.settings(AUTHENTICATION_BACKENDS=('zproject.backends.ZulipDummyBackend',)):
            self._assert_auth_failure(backend, good_kwargs)

        backend_name = self._find_backend_name(backend)
        index = getattr(user_profile.realm.authentication_methods, backend_name).number
        user_profile.realm.authentication_methods.set_bit(index, False)
        user_profile.realm.save()
        if 'realm' in good_kwargs:
            good_kwargs['realm'] = user_profile.realm
        self._assert_auth_failure(backend, good_kwargs)
        user_profile.realm.authentication_methods.set_bit(index, True)
        user_profile.realm.save()

    def test_dummy_backend(self) -> None:
        realm = get_realm("zulip")
        username = self.get_username()
        self.verify_backend(ZulipDummyBackend(),
                            good_kwargs=dict(username=username,
                                             realm=realm,
                                             use_dummy_backend=True),
                            bad_kwargs=dict(username=username,
                                            realm=realm,
                                            use_dummy_backend=False))

    def setup_subdomain(self, user_profile: UserProfile) -> None:
        realm = user_profile.realm
        realm.string_id = 'zulip'
        realm.save()

    def test_email_auth_backend(self) -> None:
        username = self.get_username()
        user_profile = self.example_user('hamlet')
        password = "testpassword"
        user_profile.set_password(password)
        user_profile.save()

        with mock.patch('zproject.backends.email_auth_enabled',
                        return_value=False), \
                mock.patch('zproject.backends.password_auth_enabled',
                           return_value=True):
            return_data = {}
            user = EmailAuthBackend().authenticate(self.example_email('hamlet'),
                                                   realm=get_realm("zulip"),
                                                   password=password,
                                                   return_data=return_data)
            self.assertEqual(user, None)
            self.assertTrue(return_data['email_auth_disabled'])

        self.verify_backend(EmailAuthBackend(),
                            good_kwargs=dict(password=password,
                                             username=username,
                                             realm=get_realm('zulip'),
                                             return_data=dict()),
                            bad_kwargs=dict(password=password,
                                            username=username,
                                            realm=get_realm('zephyr'),
                                            return_data=dict()))
        self.verify_backend(EmailAuthBackend(),
                            good_kwargs=dict(password=password,
                                             username=username,
                                             realm=get_realm('zulip'),
                                             return_data=dict()),
                            bad_kwargs=dict(password=password,
                                            username=username,
                                            realm=None,
                                            return_data=dict()))

    def test_email_auth_backend_disabled_password_auth(self) -> None:
        user_profile = self.example_user('hamlet')
        password = "testpassword"
        user_profile.set_password(password)
        user_profile.save()
        with mock.patch('zproject.backends.password_auth_enabled', return_value=False):
            self.assertIsNone(EmailAuthBackend().authenticate(self.example_email('hamlet'),
                                                              password,
                                                              realm=get_realm("zulip")))

    @override_settings(AUTHENTICATION_BACKENDS=('zproject.backends.ZulipDummyBackend',))
    def test_no_backend_enabled(self) -> None:
        result = self.client_get('/login/')
        self.assert_in_success_response(["No authentication backends are enabled"], result)

        result = self.client_get('/register/')
        self.assert_in_success_response(["No authentication backends are enabled"], result)

    @override_settings(AUTHENTICATION_BACKENDS=('zproject.backends.GoogleMobileOauth2Backend',))
    def test_any_backend_enabled(self) -> None:
        result = self.client_get('/login/')
        self.assert_not_in_success_response(["No authentication backends are enabled"], result)

        result = self.client_get('/register/')
        self.assert_not_in_success_response(["No authentication backends are enabled"], result)

    @override_settings(AUTHENTICATION_BACKENDS=('zproject.backends.GoogleMobileOauth2Backend',))
    def test_google_backend(self) -> None:
        user_profile = self.example_user('hamlet')
        email = user_profile.email
        backend = GoogleMobileOauth2Backend()
        payload = dict(email_verified=True,
                       email=email)

        with mock.patch('apiclient.sample_tools.client.verify_id_token', return_value=payload):
            self.verify_backend(backend,
                                good_kwargs=dict(realm=get_realm("zulip")),
                                bad_kwargs=dict(realm=get_realm('invalid')))

        unverified_payload = dict(email_verified=False)
        with mock.patch('apiclient.sample_tools.client.verify_id_token',
                        return_value=unverified_payload):
            ret = {}
            result = backend.authenticate(realm=get_realm("zulip"), return_data=ret)
            self.assertIsNone(result)
            self.assertFalse(ret["valid_attestation"])

        nonexistent_user_payload = dict(email_verified=True, email="invalid@zulip.com")
        with mock.patch('apiclient.sample_tools.client.verify_id_token',
                        return_value=nonexistent_user_payload):
            ret = {}
            result = backend.authenticate(realm=get_realm("zulip"), return_data=ret)
            self.assertIsNone(result)
            self.assertTrue(ret["valid_attestation"])
        with mock.patch('apiclient.sample_tools.client.verify_id_token',
                        side_effect=AppIdentityError):
            ret = {}
            result = backend.authenticate(realm=get_realm("zulip"), return_data=ret)
            self.assertIsNone(result)

    @override_settings(AUTHENTICATION_BACKENDS=('zproject.backends.ZulipLDAPAuthBackend',))
    def test_ldap_backend(self) -> None:
        user_profile = self.example_user('hamlet')
        email = user_profile.email
        password = "test_password"
        self.setup_subdomain(user_profile)

        username = self.get_username()
        backend = ZulipLDAPAuthBackend()

        with mock.patch('django_auth_ldap.backend._LDAPUser._authenticate_user_dn',
                        side_effect=_LDAPUser.AuthenticationFailed("Failed")), (
            mock.patch('django_auth_ldap.backend._LDAPUser._check_requirements')), (
            mock.patch('django_auth_ldap.backend._LDAPUser.attrs',
                       return_value=dict(full_name=['Hamlet']))):
            self.assertIsNone(backend.authenticate(email, password, realm=get_realm("zulip")))

        with mock.patch('django_auth_ldap.backend._LDAPUser._authenticate_user_dn'), (
            mock.patch('django_auth_ldap.backend._LDAPUser._check_requirements')), (
            mock.patch('django_auth_ldap.backend._LDAPUser.attrs',
                       return_value=dict(full_name=['Hamlet']))):
            self.verify_backend(backend,
                                bad_kwargs=dict(username=username,
                                                password=password,
                                                realm=get_realm('zephyr')),
                                good_kwargs=dict(username=username,
                                                 password=password,
                                                 realm=get_realm('zulip')))
            self.verify_backend(backend,
                                bad_kwargs=dict(username=username,
                                                password=password,
                                                realm=get_realm('acme')),
                                good_kwargs=dict(username=username,
                                                 password=password,
                                                 realm=get_realm('zulip')))

    def test_devauth_backend(self) -> None:
        self.verify_backend(DevAuthBackend(),
                            good_kwargs=dict(dev_auth_username=self.get_username(),
                                             realm=get_realm("zulip")),
                            bad_kwargs=dict(dev_auth_username=self.get_username(),
                                            realm=get_realm("invalid")))

    @override_settings(AUTHENTICATION_BACKENDS=('zproject.backends.ZulipRemoteUserBackend',))
    def test_remote_user_backend(self) -> None:
        username = self.get_username()
        self.verify_backend(ZulipRemoteUserBackend(),
                            good_kwargs=dict(remote_user=username,
                                             realm=get_realm('zulip')),
                            bad_kwargs=dict(remote_user=username,
                                            realm=get_realm('zephyr')))

    @override_settings(AUTHENTICATION_BACKENDS=('zproject.backends.ZulipRemoteUserBackend',))
    def test_remote_user_backend_invalid_realm(self) -> None:
        username = self.get_username()
        self.verify_backend(ZulipRemoteUserBackend(),
                            good_kwargs=dict(remote_user=username,
                                             realm=get_realm('zulip')),
                            bad_kwargs=dict(remote_user=username,
                                            realm=None))

    @override_settings(AUTHENTICATION_BACKENDS=('zproject.backends.ZulipRemoteUserBackend',))
    @override_settings(SSO_APPEND_DOMAIN='zulip.com')
    def test_remote_user_backend_sso_append_domain(self) -> None:
        username = self.get_username(email_to_username)
        self.verify_backend(ZulipRemoteUserBackend(),
                            good_kwargs=dict(remote_user=username,
                                             realm=get_realm("zulip")),
                            bad_kwargs=dict(remote_user=username,
                                            realm=get_realm('zephyr')))

    @override_settings(AUTHENTICATION_BACKENDS=('zproject.backends.GitHubAuthBackend',))
    def test_github_backend(self) -> None:
        user = self.example_user('hamlet')
        token_data_dict = {
            'access_token': 'foobar',
            'token_type': 'bearer'
        }
        account_data_dict = dict(email=user.email, name=user.full_name)
        email_data = [
            dict(email=account_data_dict["email"],
                 verified=True,
                 primary=True),
            dict(email="nonprimary@example.com",
                 verified=True),
            dict(email="ignored@example.com",
                 verified=False),
        ]
        httpretty.enable()
        httpretty.register_uri(
            httpretty.POST,
            "https://github.com/login/oauth/access_token",
            match_querystring=False,
            status=200,
            body=json.dumps(token_data_dict))
        httpretty.register_uri(
            httpretty.GET,
            "https://api.github.com/user",
            status=200,
            body=json.dumps(account_data_dict)
        )
        httpretty.register_uri(
            httpretty.GET,
            "https://api.github.com/user/emails",
            status=200,
            body=json.dumps(email_data)
        )

        backend = GitHubAuthBackend()
        backend.strategy = DjangoStrategy(storage=BaseDjangoStorage())
        orig_authenticate = GitHubAuthBackend.authenticate

        def patched_authenticate(*args: Any, **kwargs: Any) -> Any:
            if 'subdomain' in kwargs:
                backend.strategy.session_set("subdomain", kwargs["subdomain"])
                del kwargs['subdomain']
            return orig_authenticate(backend, *args, **kwargs)

        backend.authenticate = patched_authenticate
        good_kwargs = dict(backend=backend, strategy=backend.strategy,
                           storage=backend.strategy.storage,
                           response=token_data_dict,
                           subdomain='zulip')
        bad_kwargs = dict(subdomain='acme')
        with mock.patch('zerver.views.auth.redirect_and_log_into_subdomain',
                        return_value=user):
            self.verify_backend(backend,
                                good_kwargs=good_kwargs,
                                bad_kwargs=bad_kwargs)
            bad_kwargs['subdomain'] = "zephyr"
            self.verify_backend(backend,
                                good_kwargs=good_kwargs,
                                bad_kwargs=bad_kwargs)
        backend.authenticate = orig_authenticate
        httpretty.disable()


class ResponseMock:
    def __init__(self, status_code: int, data: Any) -> None:
        self.status_code = status_code
        self.data = data

    def json(self) -> str:
        return self.data

    @property
    def text(self) -> str:
        return "Response text"


class GitHubAuthBackendTest(ZulipTestCase):
    def setUp(self) -> None:
        self.user_profile = self.example_user('hamlet')
        self.email = self.user_profile.email
        self.name = 'Hamlet'
        self.backend = GitHubAuthBackend()
        self.backend.strategy = DjangoStrategy(storage=BaseDjangoStorage())
        self.user_profile.backend = self.backend
        from social_core.backends.utils import load_backends
        load_backends(settings.AUTHENTICATION_BACKENDS, force_load=True)

    def github_oauth2_test(self, account_data_dict: Dict[str, str],
                           *, subdomain: Optional[str] = None,
                           mobile_flow_otp: Optional[str] = None,
                           is_signup: Optional[str] = None,
                           email_not_verified: bool = False,
                           next: str = '') -> HttpResponse:
        url = "/accounts/login/social/github"
        params = {}
        headers = {}
        if subdomain is not None:
            headers['HTTP_HOST'] = subdomain + ".testserver"
        if mobile_flow_otp is not None:
            params['mobile_flow_otp'] = mobile_flow_otp
            headers['HTTP_USER_AGENT'] = "ZulipAndroid"
        if is_signup is not None:
            url = "/accounts/register/social/github"
        params['next'] = next
        if params:
            url += "?%s" % urllib.parse.urlencode(params)

        result = self.client_get(url, **headers)

        expected_result_url_prefix = 'http://testserver/login/github/'
        if settings.SOCIAL_AUTH_SUBDOMAIN is not None:
            expected_result_url_prefix = f'http://{settings.SOCIAL_AUTH_SUBDOMAIN}.testserver/login/github/'

        if result.status_code != 302 or not result.url.startswith(expected_result_url_prefix):
            return result

        result = self.client_get(result.url, **headers)
        self.assertEqual(result.status_code, 302)
        assert 'https://github.com/login/oauth/authorize' in result.url

        self.client.cookies = result.cookies

        token_data_dict = {
            'access_token': 'foobar',
            'token_type': 'bearer'
        }
        if email_not_verified:
            email_data = [dict(email=account_data_dict["email"], verified=False, primary=True)]
        else:
            email_data = [
                dict(email=account_data_dict["email"], verified=True, primary=True),
                dict(email="ignored@example.com", verified=False),
                dict(email="notprimary@example.com", verified=True),
            ]
        httpretty.enable()
        httpretty.register_uri(
            httpretty.POST,
            "https://github.com/login/oauth/access_token",
            match_querystring=False,
            status=200,
            body=json.dumps(token_data_dict))
        httpretty.register_uri(
            httpretty.GET,
            "https://api.github.com/user",
            status=200,
            body=json.dumps(account_data_dict)
        )
        httpretty.register_uri(
            httpretty.GET,
            "https://api.github.com/user/emails",
            status=200,
            body=json.dumps(email_data)
        )

        parsed_url = urllib.parse.urlparse(result.url)
        csrf_state = urllib.parse.parse_qs(parsed_url.query)['state']
        result = self.client_get("/complete/github/",
                                 dict(state=csrf_state), **headers)
        httpretty.disable()
        return result

    @override_settings(SOCIAL_AUTH_GITHUB_KEY=None)
    def test_github_oauth2_no_key(self) -> None:
        account_data_dict = dict(email=self.email, name=self.name)
        result = self.github_oauth2_test(account_data_dict,
                                         subdomain='zulip', next='/user_uploads/image')
        self.assertEqual(result.status_code, 302)
        self.assertEqual(result.url, "/config-error/github")

    def test_github_oauth2_success(self) -> None:
        account_data_dict = dict(email=self.email, name=self.name)
        result = self.github_oauth2_test(account_data_dict,
                                         subdomain='zulip', next='/user_uploads/image')
        data = load_subdomain_token(result)
        self.assertEqual(data['email'], self.example_email("hamlet"))
        self.assertEqual(data['name'], 'Hamlet')
        self.assertEqual(data['subdomain'], 'zulip')
        self.assertEqual(data['next'], '/user_uploads/image')
        self.assertEqual(result.status_code, 302)
        parsed_url = urllib.parse.urlparse(result.url)
        uri = f"{parsed_url.scheme}://{parsed_url.netloc}{parsed_url.path}"
        self.assertTrue(uri.startswith('http://zulip.testserver/accounts/login/subdomain/'))

    @override_settings(SOCIAL_AUTH_SUBDOMAIN=None)
    def test_github_when_social_auth_subdomain_is_not_set(self) -> None:
        account_data_dict = dict(email=self.email, name=self.name)
        result = self.github_oauth2_test(account_data_dict,
                                         subdomain='zulip', next='/user_uploads/image')
        data = load_subdomain_token(result)
        self.assertEqual(data['email'], self.example_email("hamlet"))
        self.assertEqual(data['name'], 'Hamlet')
        self.assertEqual(data['subdomain'], 'zulip')
        self.assertEqual(data['next'], '/user_uploads/image')
        self.assertEqual(result.status_code, 302)
        parsed_url = urllib.parse.urlparse(result.url)
        uri = f"{parsed_url.scheme}://{parsed_url.netloc}{parsed_url.path}"
        self.assertTrue(uri.startswith('http://zulip.testserver/accounts/login/subdomain/'))

    def test_github_oauth2_email_not_verified(self) -> None:
        account_data_dict = dict(email=self.email, name=self.name)
        with mock.patch('logging.warning') as mock_warning:
            result = self.github_oauth2_test(account_data_dict,
                                             subdomain='zulip',
                                             email_not_verified=True)
            self.assertEqual(result.status_code, 302)
            self.assertEqual(result.url, "/login/")
            mock_warning.assert_called_once_with("Social auth (GitHub) failed because user has no verified emails")

    @override_settings(SOCIAL_AUTH_GITHUB_TEAM_ID='zulip-webapp')
    def test_github_oauth2_github_team_not_member_failed(self) -> None:
        account_data_dict = dict(email=self.email, name=self.name)
        with mock.patch('social_core.backends.github.GithubTeamOAuth2.user_data',
                        side_effect=AuthFailed('Not found')), \
                mock.patch('logging.info') as mock_info:
            result = self.github_oauth2_test(account_data_dict,
                                             subdomain='zulip')
            self.assertEqual(result.status_code, 302)
            self.assertEqual(result.url, "/login/")
            mock_info.assert_called_once_with("GitHub user is not member of required team")

    @override_settings(SOCIAL_AUTH_GITHUB_TEAM_ID='zulip-webapp')
    def test_github_oauth2_github_team_member_success(self) -> None:
        account_data_dict = dict(email=self.email, name=self.name)
        with mock.patch('social_core.backends.github.GithubTeamOAuth2.user_data',
                        return_value=account_data_dict):
            result = self.github_oauth2_test(account_data_dict,
                                             subdomain='zulip')
        data = load_subdomain_token(result)
        self.assertEqual(data['email'], self.example_email("hamlet"))
        self.assertEqual(data['name'], 'Hamlet')
        self.assertEqual(data['subdomain'], 'zulip')

    @override_settings(SOCIAL_AUTH_GITHUB_ORG_NAME='Zulip')
    def test_github_oauth2_github_organization_not_member_failed(self) -> None:
        account_data_dict = dict(email=self.email, name=self.name)
        with mock.patch('social_core.backends.github.GithubOrganizationOAuth2.user_data',
                        side_effect=AuthFailed('Not found')), \
                mock.patch('logging.info') as mock_info:
            result = self.github_oauth2_test(account_data_dict,
                                             subdomain='zulip')
            self.assertEqual(result.status_code, 302)
            self.assertEqual(result.url, "/login/")
            mock_info.assert_called_once_with("GitHub user is not member of required organization")

    @override_settings(SOCIAL_AUTH_GITHUB_ORG_NAME='Zulip')
    def test_github_oauth2_github_organization_member_success(self) -> None:
        account_data_dict = dict(email=self.email, name=self.name)
        with mock.patch('social_core.backends.github.GithubOrganizationOAuth2.user_data',
                        return_value=account_data_dict):
            result = self.github_oauth2_test(account_data_dict,
                                             subdomain='zulip')
        data = load_subdomain_token(result)
        self.assertEqual(data['email'], self.example_email("hamlet"))
        self.assertEqual(data['name'], 'Hamlet')
        self.assertEqual(data['subdomain'], 'zulip')

    def test_github_oauth2_deactivated_user(self) -> None:
        user_profile = self.example_user("hamlet")
        do_deactivate_user(user_profile)
        account_data_dict = dict(email=self.email, name=self.name)
        result = self.github_oauth2_test(account_data_dict,
                                         subdomain='zulip')
        self.assertEqual(result.status_code, 302)
        self.assertEqual(result.url, "/login/")

    def test_github_oauth2_invalid_realm(self) -> None:
        account_data_dict = dict(email=self.email, name=self.name)
        with mock.patch('zerver.middleware.get_realm', return_value=get_realm("zulip")):
            result = self.github_oauth2_test(account_data_dict,
                                             subdomain='invalid', next='/user_uploads/image')
        self.assertEqual(result.status_code, 302)
        self.assertEqual(result.url, "/accounts/login/?subdomain=1")

    def test_github_oauth2_invalid_email(self) -> None:
        account_data_dict = dict(email="invalid", name=self.name)
        result = self.github_oauth2_test(account_data_dict,
                                         subdomain='zulip', next='/user_uploads/image')
        self.assertEqual(result.status_code, 302)
        self.assertEqual(result.url, "/login/?next=/user_uploads/image")

    def test_user_cannot_log_into_nonexisting_realm(self) -> None:
        account_data_dict = dict(email=self.email, name=self.name)
        result = self.github_oauth2_test(account_data_dict,
                                         subdomain='nonexistent')
        self.assert_in_success_response(["There is no Zulip organization hosted at this subdomain."],
                                        result)

    def test_user_cannot_log_into_wrong_subdomain(self) -> None:
        account_data_dict = dict(email=self.email, name=self.name)
        result = self.github_oauth2_test(account_data_dict,
                                         subdomain='zephyr')
        self.assertTrue(result.url.startswith("http://zephyr.testserver/accounts/login/subdomain/"))
        result = self.client_get(result.url.replace('http://zephyr.testserver', ''),
                                 subdomain="zephyr")
        self.assert_in_success_response(['Your email address, hamlet@zulip.com, is not in one of the domains ',
                                         'that are allowed to register for accounts in this organization.'], result)

    def test_github_oauth2_mobile_success(self) -> None:
        mobile_flow_otp = '1234abcd' * 8
        account_data_dict = dict(email=self.email, name='Full Name')
        self.assertEqual(len(mail.outbox), 0)
        self.user_profile.date_joined = timezone_now() - datetime.timedelta(seconds=JUST_CREATED_THRESHOLD + 1)
        self.user_profile.save()

        with self.settings(SEND_LOGIN_EMAILS=True):
            result = self.github_oauth2_test(account_data_dict, subdomain='zulip',
                                             mobile_flow_otp="1234")
            self.assert_json_error(result, "Invalid OTP")
            result = self.github_oauth2_test(account_data_dict, subdomain='zulip',
                                             mobile_flow_otp="invalido" * 8)
            self.assert_json_error(result, "Invalid OTP")
            result = self.github_oauth2_test(account_data_dict, subdomain='zulip',
                                             mobile_flow_otp=mobile_flow_otp)
        self.assertEqual(result.status_code, 302)
        redirect_url = result['Location']
        parsed_url = urllib.parse.urlparse(redirect_url)
        query_params = urllib.parse.parse_qs(parsed_url.query)
        self.assertEqual(parsed_url.scheme, 'zulip')
        self.assertEqual(query_params["realm"], ['http://zulip.testserver'])
        self.assertEqual(query_params["email"], [self.example_email("hamlet")])
        encrypted_api_key = query_params["otp_encrypted_api_key"][0]
        hamlet_api_keys = get_all_api_keys(self.example_user('hamlet'))
        self.assertIn(otp_decrypt_api_key(encrypted_api_key, mobile_flow_otp), hamlet_api_keys)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn('Zulip on Android', mail.outbox[0].body)

    def test_github_oauth2_registration_existing_account(self) -> None:
        email = "hamlet@zulip.com"
        name = 'Full Name'
        account_data_dict = dict(email=email, name=name)
        result = self.github_oauth2_test(account_data_dict,
                                         subdomain='zulip', is_signup='1')
        data = load_subdomain_token(result)
        self.assertEqual(data['email'], self.example_email("hamlet"))
        self.assertEqual(data['name'], 'Full Name')
        self.assertEqual(data['subdomain'], 'zulip')
        self.assertEqual(result.status_code, 302)
        parsed_url = urllib.parse.urlparse(result.url)
        uri = f"{parsed_url.scheme}://{parsed_url.netloc}{parsed_url.path}"
        self.assertTrue(uri.startswith('http://zulip.testserver/accounts/login/subdomain/'))
        hamlet = self.example_user("hamlet")
        self.assertEqual(hamlet.full_name, "King Hamlet")

    def test_github_oauth2_registration(self) -> None:
        email = "newuser@zulip.com"
        name = 'Full Name'
        realm = get_realm("zulip")
        account_data_dict = dict(email=email, name=name)
        result = self.github_oauth2_test(account_data_dict,
                                         subdomain='zulip', is_signup='1')
        data = load_subdomain_token(result)
        self.assertEqual(data['email'], email)
        self.assertEqual(data['name'], name)
        self.assertEqual(data['subdomain'], 'zulip')
        self.assertEqual(result.status_code, 302)
        parsed_url = urllib.parse.urlparse(result.url)
        uri = f"{parsed_url.scheme}://{parsed_url.netloc}{parsed_url.path}"
        self.assertTrue(uri.startswith('http://zulip.testserver/accounts/login/subdomain/'))

        result = self.client_get(result.url)
        self.assertEqual(result.status_code, 302)
        confirmation = Confirmation.objects.all().first()
        confirmation_key = confirmation.confirmation_key
        self.assertIn('do_confirm/' + confirmation_key, result.url)
        result = self.client_get(result.url)
        self.assert_in_response('action="/accounts/register/"', result)
        data = {"from_confirmation": "1",
                "full_name": name,
                "key": confirmation_key}
        result = self.client_post('/accounts/register/', data)
        self.assert_in_response("You're almost there", result)
        self.assert_not_in_success_response(['id_password'], result)
        self.assert_in_success_response(['id_full_name'], result)
        result = self.client_post(
            '/accounts/register/',
            {'full_name': name,
             'key': confirmation_key,
             'terms': True})
        self.assertEqual(result.status_code, 302)
        user_profile = get_user(email, realm)
        self.assertEqual(get_session_dict_user(self.client.session), user_profile.id)

    def test_github_oauth2_registration_without_is_signup(self) -> None:
        email = "newuser@zulip.com"
        name = 'Full Name'
        account_data_dict = dict(email=email, name=name)
        result = self.github_oauth2_test(account_data_dict,
                                         subdomain='zulip')
        self.assertEqual(result.status_code, 302)
        data = load_subdomain_token(result)
        self.assertEqual(data['email'], email)
        self.assertEqual(data['name'], name)
        self.assertEqual(data['subdomain'], 'zulip')
        parsed_url = urllib.parse.urlparse(result.url)
        uri = f"{parsed_url.scheme}://{parsed_url.netloc}{parsed_url.path}"
        self.assertTrue(uri.startswith('http://zulip.testserver/accounts/login/subdomain/'))
        result = self.client_get(result.url)
        self.assertEqual(result.status_code, 200)
        self.assert_in_response("No account found for newuser@zulip.com.", result)

    def test_github_oauth2_registration_without_is_signup_closed_realm(self) -> None:
        email = "nonexisting@phantom.com"
        name = 'Full Name'
        account_data_dict = dict(email=email, name=name)
        result = self.github_oauth2_test(account_data_dict,
                                         subdomain='zulip')
        self.assertEqual(result.status_code, 302)
        data = load_subdomain_token(result)
        self.assertEqual(data['email'], email)
        self.assertEqual(data['name'], name)
        self.assertEqual(data['subdomain'], 'zulip')
        parsed_url = urllib.parse.urlparse(result.url)
        uri = f"{parsed_url.scheme}://{parsed_url.netloc}{parsed_url.path}"
        self.assertTrue(uri.startswith('http://zulip.testserver/accounts/login/subdomain/'))
        result = self.client_get(result.url)
        self.assertEqual(result.status_code, 200)
        self.assert_in_response('action="/register/"', result)
        self.assert_in_response('Your email address, {}, is not '
                                'in one of the domains that are allowed to register '
                                'for accounts in this organization.'.format(email), result)

    def test_github_complete(self) -> None:
        with mock.patch('social_core.backends.oauth.BaseOAuth2.process_error',
                        side_effect=AuthFailed('Not found')):
            result = self.client_get(reverse('social:complete', args=['github']))
            self.assertEqual(result.status_code, 302)
            self.assertIn('login', result.url)

    def test_github_complete_when_base_exc_is_raised(self) -> None:
        with mock.patch('social_core.backends.oauth.BaseOAuth2.auth_complete',
                        side_effect=AuthStateForbidden('State forbidden')), \
                mock.patch('zproject.backends.logging.warning'):
            result = self.client_get(reverse('social:complete', args=['github']))
            self.assertEqual(result.status_code, 302)
            self.assertIn('login', result.url)

    def test_github_auth_enabled(self) -> None:
        with self.settings(AUTHENTICATION_BACKENDS=('zproject.backends.GitHubAuthBackend',)):
            self.assertTrue(github_auth_enabled())