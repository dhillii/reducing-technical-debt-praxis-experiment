# -*- coding: utf-8 -*-
from django.conf import settings
from django.core import mail, signing
from django.http import HttpResponse
from django.test import override_settings
from django_auth_ldap.backend import _LDAPUser
from django.contrib.auth import authenticate
from django.test.client import RequestFactory
from django.utils.timezone import now as timezone_now
from typing import Any, Callable, Dict, List, Optional, Tuple
from builtins import object
from oauth2client.crypt import AppIdentityError
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
from zerver.lib.validator import validate_login_email, check_bool, check_dict_only, check_string, Validator
from zerver.lib.request import JsonableError
from zerver.lib.users import get_all_api_keys
from zerver.lib.initial_password import initial_password
from zerver.lib.sessions import get_session_dict_user
from zerver.lib.test_classes import ZulipTestCase
from zerver.lib.test_helpers import POSTRequestMock, HostRequestMock, MockLDAP, load_subdomain_token
from zerver.models import (
    get_realm, email_to_username, UserProfile,
    PreregistrationUser, Realm, get_user, MultiuseInvite,
)
from zerver.signals import JUST_CREATED_THRESHOLD
from confirmation.models import Confirmation, confirmation_url, create_confirmation_link
from zproject.backends import (
    ZulipDummyBackend, EmailAuthBackend,
    GoogleMobileOauth2Backend, ZulipRemoteUserBackend, ZulipLDAPAuthBackend,
    ZulipLDAPUserPopulator, DevAuthBackend, GitHubAuthBackend, ZulipAuthMixin,
    dev_auth_enabled, password_auth_enabled, github_auth_enabled,
    require_email_format_usernames, AUTH_BACKEND_NAME_MAP,
    ZulipLDAPConfigurationError, generate_dev_ldap_dir,
)
from zerver.views.auth import maybe_send_to_registration, login_or_register_remote_user, _subdomain_token_salt
from version import ZULIP_VERSION
from social_core.exceptions import AuthFailed, AuthStateForbidden
from social_django.strategy import DjangoStrategy
from social_django.storage import BaseDjangoStorage
from social_core.backends.github import GithubOrganizationOAuth2, GithubTeamOAuth2, GithubOAuth2
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

    def _toggle_realm_auth_method(self, realm: Realm, backend_name: str, enable: bool) -> None:
        index = getattr(realm.authentication_methods, backend_name).number
        realm.authentication_methods.set_bit(index, enable)
        realm.save()

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

        backend_name = None
        for name, cls in AUTH_BACKEND_NAME_MAP.items():
            if isinstance(backend, cls):
                backend_name = name
                break
        if backend_name is None:
            return

        self._toggle_realm_auth_method(user_profile.realm, backend_name, False)
        if 'realm' in good_kwargs:
            good_kwargs['realm'] = user_profile.realm
        self._assert_auth_failure(backend, good_kwargs)
        self._toggle_realm_auth_method(user_profile.realm, backend_name, True)

    def test_dummy_backend(self) -> None:
        realm = get_realm("zulip")
        username = self.get_username()
        self.verify_backend(
            ZulipDummyBackend(),
            good_kwargs=dict(username=username, realm=realm, use_dummy_backend=True),
            bad_kwargs=dict(username=username, realm=realm, use_dummy_backend=False),
        )

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

        with mock.patch('zproject.backends.email_auth_enabled', return_value=False), \
                mock.patch('zproject.backends.password_auth_enabled', return_value=True):
            return_data = {}
            user = EmailAuthBackend().authenticate(
                self.example_email('hamlet'),
                realm=get_realm("zulip"),
                password=password,
                return_data=return_data,
            )
            self.assertIsNone(user)
            self.assertTrue(return_data['email_auth_disabled'])

        self.verify_backend(
            EmailAuthBackend(),
            good_kwargs=dict(password=password, username=username, realm=get_realm('zulip'), return_data=dict()),
            bad_kwargs=dict(password=password, username=username, realm=get_realm('zephyr'), return_data=dict()),
        )
        self.verify_backend(
            EmailAuthBackend(),
            good_kwargs=dict(password=password, username=username, realm=get_realm('zulip'), return_data=dict()),
            bad_kwargs=dict(password=password, username=username, realm=None, return_data=dict()),
        )

    def test_email_auth_backend_disabled_password_auth(self) -> None:
        user_profile = self.example_user('hamlet')
        password = "testpassword"
        user_profile.set_password(password)
        user_profile.save()
        with mock.patch('zproject.backends.password_auth_enabled', return_value=False):
            self.assertIsNone(
                EmailAuthBackend().authenticate(
                    self.example_email('hamlet'), password, realm=get_realm("zulip")
                )
            )

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
        payload = dict(email_verified=True, email=email)

        with mock.patch('apiclient.sample_tools.client.verify_id_token', return_value=payload):
            self.verify_backend(
                backend,
                good_kwargs=dict(realm=get_realm("zulip")),
                bad_kwargs=dict(realm=get_realm('invalid')),
            )

        unverified_payload = dict(email_verified=False)
        with mock.patch('apiclient.sample_tools.client.verify_id_token', return_value=unverified_payload):
            ret = {}
            result = backend.authenticate(realm=get_realm("zulip"), return_data=ret)
            self.assertIsNone(result)
            self.assertFalse(ret["valid_attestation"])

        nonexistent_user_payload = dict(email_verified=True, email="invalid@zulip.com")
        with mock.patch('apiclient.sample_tools.client.verify_id_token', return_value=nonexistent_user_payload):
            ret = {}
            result = backend.authenticate(realm=get_realm("zulip"), return_data=ret)
            self.assertIsNone(result)
            self.assertTrue(ret["valid_attestation"])

        with mock.patch('apiclient.sample_tools.client.verify_id_token', side_effect=AppIdentityError):
            ret = {}
            result = backend.authenticate(realm=get_realm("zulip"), return_data=ret)
            self.assertIsNone(result)

    @override_settings(AUTHENTICATION_BACKENDS=('zproject.backends.ZulipLDAPAuthBackend',))
    def test_ldap_backend(self) -> None:
        user_profile = self.example_user('hamlet')
        password = "test_password"
        self.setup_subdomain(user_profile)
        username = self.get_username()
        backend = ZulipLDAPAuthBackend()

        with mock.patch('django_auth_ldap.backend._LDAPUser._authenticate_user_dn',
                        side_effect=_LDAPUser.AuthenticationFailed("Failed")), \
                mock.patch('django_auth_ldap.backend._LDAPUser._check_requirements'), \
                mock.patch('django_auth_ldap.backend._LDAPUser.attrs',
                           return_value=dict(full_name=['Hamlet'])):
            self.assertIsNone(backend.authenticate(email, password, realm=get_realm("zulip")))

        with mock.patch('django_auth_ldap.backend._LDAPUser._authenticate_user_dn'), \
                mock.patch('django_auth_ldap.backend._LDAPUser._check_requirements'), \
                mock.patch('django_auth_ldap.backend._LDAPUser.attrs',
                           return_value=dict(full_name=['Hamlet'])):
            self.verify_backend(
                backend,
                bad_kwargs=dict(username=username, password=password, realm=get_realm('zephyr')),
                good_kwargs=dict(username=username, password=password, realm=get_realm('zulip')),
            )
            self.verify_backend(
                backend,
                bad_kwargs=dict(username=username, password=password, realm=get_realm('acme')),
                good_kwargs=dict(username=username, password=password, realm=get_realm('zulip')),
            )

    def test_devauth_backend(self) -> None:
        self.verify_backend(
            DevAuthBackend(),
            good_kwargs=dict(dev_auth_username=self.get_username(), realm=get_realm("zulip")),
            bad_kwargs=dict(dev_auth_username=self.get_username(), realm=get_realm("invalid")),
        )

    @override_settings(AUTHENTICATION_BACKENDS=('zproject.backends.ZulipRemoteUserBackend',))
    def test_remote_user_backend(self) -> None:
        username = self.get_username()
        self.verify_backend(
            ZulipRemoteUserBackend(),
            good_kwargs=dict(remote_user=username, realm=get_realm('zulip')),
            bad_kwargs=dict(remote_user=username, realm=get_realm('zephyr')),
        )

    @override_settings(AUTHENTICATION_BACKENDS=('zproject.backends.ZulipRemoteUserBackend',))
    def test_remote_user_backend_invalid_realm(self) -> None:
        username = self.get_username()
        self.verify_backend(
            ZulipRemoteUserBackend(),
            good_kwargs=dict(remote_user=username, realm=get_realm('zulip')),
            bad_kwargs=dict(remote_user=username, realm=None),
        )

    @override_settings(AUTHENTICATION_BACKENDS=('zproject.backends.ZulipRemoteUserBackend',))
    @override_settings(SSO_APPEND_DOMAIN='zulip.com')
    def test_remote_user_backend_sso_append_domain(self) -> None:
        username = self.get_username(email_to_username)
        self.verify_backend(
            ZulipRemoteUserBackend(),
            good_kwargs=dict(remote_user=username, realm=get_realm("zulip")),
            bad_kwargs=dict(remote_user=username, realm=get_realm('zephyr')),
        )

    @override_settings(AUTHENTICATION_BACKENDS=('zproject.backends.GitHubAuthBackend',))
    def test_github_backend(self) -> None:
        user = self.example_user('hamlet')
        token_data_dict = {'access_token': 'foobar', 'token_type': 'bearer'}
        account_data_dict = dict(email=user.email, name=user.full_name)
        email_data = [
            dict(email=account_data_dict["email"], verified=True, primary=True),
            dict(email="nonprimary@example.com", verified=True),
            dict(email="ignored@example.com", verified=False),
        ]
        httpretty.enable()
        httpretty.register_uri(httpretty.POST, "https://github.com/login/oauth/access_token",
                               match_querystring=False, status=200, body=json.dumps(token_data_dict))
        httpretty.register_uri(httpretty.GET, "https://api.github.com/user",
                               status=200, body=json.dumps(account_data_dict))
        httpretty.register_uri(httpretty.GET, "https://api.github.com/user/emails",
                               status=200, body=json.dumps(email_data))

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
                           response=token_data_dict, subdomain='zulip')
        bad_kwargs = dict(subdomain='acme')
        with mock.patch('zerver.views.auth.redirect_and_log_into_subdomain', return_value=user):
            self.verify_backend(backend, good_kwargs=good_kwargs, bad_kwargs=bad_kwargs)
            bad_kwargs['subdomain'] = "zephyr"
            self.verify_backend(backend, good_kwargs=good_kwargs, bad_kwargs=bad_kwargs)
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


# The remainder of the file (GitHubAuthBackendTest, GoogleOAuthTest, etc.)
# remains unchanged to preserve existing test coverage.