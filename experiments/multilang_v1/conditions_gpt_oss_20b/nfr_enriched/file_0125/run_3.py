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
    def get_username(self, email_to_username: Optional[Callable[[str], str]]=None) -> str:
        username = self.example_email('hamlet')
        if email_to_username is not None:
            username = email_to_username(self.example_email('hamlet'))
        return username

    def verify_backend(self, backend: Any, good_kwargs: Optional[Dict[str, Any]]=None, bad_kwargs: Optional[Dict[str, Any]]=None) -> None:
        """
        Verify that an authentication backend behaves correctly for
        successful authentication, deactivated users, deactivated realms,
        and disabled backends.
        """
        user_profile = self.example_user('hamlet')
        assert good_kwargs is not None

        # 1. Verify authentication fails with bad kwargs if provided
        if bad_kwargs is not None:
            self.assertIsNone(backend.authenticate(**bad_kwargs))

        # 2. Verify authentication succeeds with good kwargs
        self._assert_auth_success(backend, good_kwargs, user_profile)

        # 3. Verify authentication fails for deactivated user
        self._assert_auth_fails_for_deactivated_user(backend, good_kwargs, user_profile)

        # 4. Verify authentication succeeds after reactivating user
        self._assert_auth_success_after_reactivation(backend, good_kwargs, user_profile)

        # 5. Verify authentication fails for deactivated realm
        self._assert_auth_fails_for_deactivated_realm(backend, good_kwargs, user_profile)

        # 6. Verify authentication succeeds after reactivating realm
        self._assert_auth_success_after_reactivation_realm(backend, good_kwargs, user_profile)

        # 7. Skip further checks for dummy backend
        if isinstance(backend, ZulipDummyBackend):
            return

        # 8. Verify authentication fails when backend is disabled globally
        self._assert_auth_fails_when_backend_disabled_globally(backend, good_kwargs)

        # 9. Verify authentication fails when backend is disabled for the realm
        self._assert_auth_fails_when_backend_disabled_for_realm(backend, good_kwargs, user_profile)

    def _assert_auth_success(self, backend: Any, kwargs: Dict[str, Any], user_profile: UserProfile) -> None:
        result = backend.authenticate(**kwargs)
        self.assertEqual(user_profile, result)

    def _assert_auth_fails_for_deactivated_user(self, backend: Any, kwargs: Dict[str, Any], user_profile: UserProfile) -> None:
        do_deactivate_user(user_profile)
        self.assertIsNone(backend.authenticate(**kwargs))

    def _assert_auth_success_after_reactivation(self, backend: Any, kwargs: Dict[str, Any], user_profile: UserProfile) -> None:
        do_reactivate_user(user_profile)
        result = backend.authenticate(**kwargs)
        self.assertEqual(user_profile, result)

    def _assert_auth_fails_for_deactivated_realm(self, backend: Any, kwargs: Dict[str, Any], user_profile: UserProfile) -> None:
        do_deactivate_realm(user_profile.realm)
        self.assertIsNone(backend.authenticate(**kwargs))

    def _assert_auth_success_after_reactivation_realm(self, backend: Any, kwargs: Dict[str, Any], user_profile: UserProfile) -> None:
        do_reactivate_realm(user_profile.realm)
        result = backend.authenticate(**kwargs)
        self.assertEqual(user_profile, result)

    def _assert_auth_fails_when_backend_disabled_globally(self, backend: Any, kwargs: Dict[str, Any]) -> None:
        with self.settings(AUTHENTICATION_BACKENDS=('zproject.backends.ZulipDummyBackend',)):
            self.assertIsNone(backend.authenticate(**kwargs))

    def _assert_auth_fails_when_backend_disabled_for_realm(self, backend: Any, kwargs: Dict[str, Any], user_profile: UserProfile) -> None:
        backend_name = self._get_backend_name(backend)
        index = getattr(user_profile.realm.authentication_methods, backend_name).number
        user_profile.realm.authentication_methods.set_bit(index, False)
        user_profile.realm.save()
        # Ensure the realm in kwargs reflects the updated state
        if 'realm' in kwargs:
            kwargs['realm'] = user_profile.realm
        self.assertIsNone(backend.authenticate(**kwargs))
        user_profile.realm.authentication_methods.set_bit(index, True)
        user_profile.realm.save()

    def _get_backend_name(self, backend: Any) -> str:
        for name, cls in AUTH_BACKEND_NAME_MAP.items():
            if isinstance(backend, cls):
                return name
        raise ValueError("Unknown backend type")

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
            return_data = {}  # type: Dict[str, bool]
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
        # Verify if a realm has password auth disabled, correct password is rejected
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

        # testing to avoid false error messages.
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

        # Verify valid_attestation parameter is set correctly
        unverified_payload = dict(email_verified=False)
        with mock.patch('apiclient.sample_tools.client.verify_id_token',
                        return_value=unverified_payload):
            ret = dict()  # type: Dict[str, str]
            result = backend.authenticate(realm=get_realm("zulip"), return_data=ret)
            self.assertIsNone(result)
            self.assertFalse(ret["valid_attestation"])

        nonexistent_user_payload = dict(email_verified=True, email="invalid@zulip.com")
        with mock.patch('apiclient.sample_tools.client.verify_id_token',
                        return_value=nonexistent_user_payload):
            ret = dict()
            result = backend.authenticate(realm=get_realm("zulip"), return_data=ret)
            self.assertIsNone(result)
            self.assertTrue(ret["valid_attestation"])
        with mock.patch('apiclient.sample_tools.client.verify_id_token',
                        side_effect=AppIdentityError):
            ret = dict()
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

        # Test LDAP auth fails when LDAP server rejects password
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
            result = orig_authenticate(backend, *args, **kwargs)
            return result
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

        # This is a workaround for the fact that Python social auth
        # caches the set of authentication backends that are enabled
        # the first time that `social_django.utils` is imported.  See
        # https://github.com/python-social-auth/social-app-django/pull/162
        # for details.
        from social_core.backends.utils import load_backends
        load_backends(settings.AUTHENTICATION_BACKENDS, force_load=True)

    def github_oauth2_test(self, account_data_dict: Dict[str, str],
                           *, subdomain: Optional[str]=None,
                           mobile_flow_otp: Optional[str]=None,
                           is_signup: Optional[str]=None,
                           email_not_verified: bool=False,
                           next: str='') -> HttpResponse:
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
        if len(params) > 0:
            url += "?%s" % (urllib.parse.urlencode(params))

        result = self.client_get(url, **headers)

        expected_result_url_prefix = 'http://testserver/login/github/'
        if settings.SOCIAL_AUTH_SUBDOMAIN is not None:
            expected_result_url_prefix = ('http://%s.testserver/login/github/' %
                                          settings.SOCIAL_AUTH_SUBDOMAIN)

        if result.status_code != 302 or not result.url.startswith(expected_result_url_prefix):
            return result

        result = self.client_get(result.url, **headers)
        self.assertEqual(result.status_code, 302)
        assert 'https://github.com/login/oauth/authorize' in result.url

        self.client.cookies = result.cookies

        # Next, the browser requests result["Location"], and gets
        # redirected back to /complete/github.

        token_data_dict = {
            'access_token': 'foobar',
            'token_type': 'bearer'
        }
        if email_not_verified:
            email_data = [
                dict(email=account_data_dict["email"],
                     verified=False,
                     primary=True),
            ]
        else:
            email_data = [
                dict(email=account_data_dict["email"],
                     verified=True,
                     primary=True),
                dict(email="ignored@example.com",
                     verified=False),
                dict(email="notprimary@example.com",
                     verified=True),
            ]
        # We register callbacks for the key URLs on github.com that
        # /complete/github will call
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
        uri = "{}://{}{}".format(parsed_url.scheme, parsed_url.netloc,
                                 parsed_url.path)
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
        uri = "{}://{}{}".format(parsed_url.scheme, parsed_url.netloc,
                                 parsed_url.path)
        self.assertTrue(uri.startswith('http://zulip.testserver/accounts/login/subdomain/'))

    def test_github_oauth2_email_not_verified(self) -> None:
        account_data_dict = dict(email=self.email, name=self.name)
        with mock.patch('logging.warning') as mock_warning:
            result = self.github_oauth2_test(account_data_dict,
                                             subdomain='zulip',
                                             email_not_verified=True)
            self.assertEqual(result.status_code, 302)
            self.assertEqual(result.url, "/login/")
            mock_warning.assert_called_once_with("Social auth (GitHub) failed "
                                                 "because user has no verified emails")

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
        # TODO: verify whether we provide a clear error message

    def test_github_oauth2_invalid_realm(self) -> None:
        account_data_dict = dict(email=self.email, name=self.name)
        with mock.patch('zerver.middleware.get_realm', return_value=get_realm("zulip")):
            # This mock.patch case somewhat hackishly arranges it so
            # that we switch realms halfway through the test
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
            # Verify that the right thing happens with an invalid-format OTP
            result = self.github_oauth2_test(account_data_dict, subdomain='zulip',
                                             mobile_flow_otp="1234")
            self.assert_json_error(result, "Invalid OTP")
            result = self.github_oauth2_test(account_data_dict, subdomain='zulip',
                                             mobile_flow_otp="invalido" * 8)
            self.assert_json_error(result, "Invalid OTP")

            # Now do it correctly
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
        """If the user already exists, signup flow just logs them in"""
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
        uri = "{}://{}{}".format(parsed_url.scheme, parsed_url.netloc,
                                 parsed_url.path)
        self.assertTrue(uri.startswith('http://zulip.testserver/accounts/login/subdomain/'))
        hamlet = self.example_user("hamlet")
        # Name wasn't changed at all
        self.assertEqual(hamlet.full_name, "King Hamlet")

    def test_github_oauth2_registration(self) -> None:
        """If the user doesn't exist yet, GitHub auth can be used to register an account"""
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
        uri = "{}://{}{}".format(parsed_url.scheme, parsed_url.netloc,
                                 parsed_url.path)
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

        # Verify that the user is asked for name but not password
        self.assert_not_in_success_response(['id_password'], result)
        self.assert_in_success_response(['id_full_name'], result)

        # Click confirm registration button.
        result = self.client_post(
            '/accounts/register/',
            {'full_name': name,
             'key': confirmation_key,
             'terms': True})

        self.assertEqual(result.status_code, 302)
        user_profile = get_user(email, realm)
        self.assertEqual(get_session_dict_user(self.client.session), user_profile.id)

    def test_github_oauth2_registration_without_is_signup(self) -> None:
        """If the user doesn't exist yet, GitHub auth can be used to register an account"""
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
        self.assertEqual(result.status_code, 302)
        parsed_url = urllib.parse.urlparse(result.url)
        uri = "{}://{}{}".format(parsed_url.scheme, parsed_url.netloc,
                                 parsed_url.path)
        self.assertTrue(uri.startswith('http://zulip.testserver/accounts/login/subdomain/'))

        result = self.client_get(result.url)
        self.assertEqual(result.status_code, 200)
        self.assert_in_response("No account found for newuser@zulip.com.", result)

    def test_github_oauth2_registration_without_is_signup_closed_realm(self) -> None:
        """If the user doesn't exist yet in closed realm, give an error"""
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
        self.assertEqual(result.status_code, 302)
        parsed_url = urllib.parse.urlparse(result.url)
        uri = "{}://{}{}".format(parsed_url.scheme, parsed_url.netloc,
                                 parsed_url.path)
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

class GoogleOAuthTest(ZulipTestCase):
    def google_oauth2_test(self, token_response: ResponseMock, account_response: ResponseMock,
                           *, subdomain: Optional[str]=None,
                           mobile_flow_otp: Optional[str]=None,
                           is_signup: Optional[str]=None,
                           next: str='') -> HttpResponse:
        url = "/accounts/login/google/"
        params = {}
        headers = {}
        if subdomain is not None:
            headers['HTTP_HOST'] = subdomain + ".testserver"
        if mobile_flow_otp is not None:
            params['mobile_flow_otp'] = mobile_flow_otp
            headers['HTTP_USER_AGENT'] = "ZulipAndroid"
        if is_signup is not None:
            params['is_signup'] = is_signup
        params['next'] = next
        if len(params) > 0:
            url += "?%s" % (urllib.parse.urlencode(params))

        result = self.client_get(url, **headers)
        if result.status_code != 302 or '/accounts/login/google/send/' not in result.url:
            return result

        # Now do the /google/send/ request
        result = self.client_get(result.url, **headers)
        self.assertEqual(result.status_code, 302)
        if 'google' not in result.url:
            return result

        self.client.cookies = result.cookies
        # Now extract the CSRF token from the redirect URL
        parsed_url = urllib.parse.urlparse(result.url)
        csrf_state = urllib.parse.parse_qs(parsed_url.query)['state']

        with mock.patch("requests.post", return_value=token_response), (
                mock.patch("requests.get", return_value=account_response)):
            result = self.client_get("/accounts/login/google/done/",
                                     dict(state=csrf_state), **headers)
        return result

class GoogleSubdomainLoginTest(GoogleOAuthTest):
    def test_google_oauth2_start(self) -> None:
        result = self.client_get('/accounts/login/google/', subdomain="zulip")
        self.assertEqual(result.status_code, 302)
        parsed_url = urllib.parse.urlparse(result.url)
        subdomain = urllib.parse.parse_qs(parsed_url.query)['subdomain']
        self.assertEqual(subdomain, ['zulip'])

    def test_google_oauth2_success(self) -> None:
        token_response = ResponseMock(200, {'access_token': "unique_token"})
        account_data = dict(name="Full Name",
                            email_verified=True,
                            email=self.example_email("hamlet"))
        account_response = ResponseMock(200, account_data)
        result = self.google_oauth2_test(token_response, account_response,
                                         subdomain='zulip', next='/user_uploads/image')

        data = load_subdomain_token(result)
        self.assertEqual(data['email'], self.example_email("hamlet"))
        self.assertEqual(data['name'], 'Full Name')
        self.assertEqual(data['subdomain'], 'zulip')
        self.assertEqual(data['next'], '/user_uploads/image')
        self.assertEqual(result.status_code, 302)
        parsed_url = urllib.parse.urlparse(result.url)
        uri = "{}://{}{}".format(parsed_url.scheme, parsed_url.netloc,
                                 parsed_url.path)
        self.assertTrue(uri.startswith('http://zulip.testserver/accounts/login/subdomain/'))

    def test_user_cannot_log_without_verified_email(self) -> None:
        token_response = ResponseMock(200, {'access_token': "unique_token"})
        account_data = dict(name="Full Name",
                            email_verified=False,
                            email=self.example_email("hamlet"))
        account_response = ResponseMock(200, account_data)
        result = self.google_oauth2_test(token_response, account_response,
                                         subdomain='zulip')
        self.assertEqual(result.status_code, 400)

    def test_google_oauth2_mobile_success(self) -> None:
        self.user_profile = self.example_user('hamlet')
        self.user_profile.date_joined = timezone_now() - datetime.timedelta(seconds=JUST_CREATED_THRESHOLD + 1)
        self.user_profile.save()
        mobile_flow_otp = '1234abcd' * 8
        token_response = ResponseMock(200, {'access_token': "unique_token"})
        account_data = dict(name="Full Name",
                            email_verified=True,
                            email=self.user_profile.email)
        account_response = ResponseMock(200, account_data)
        self.assertEqual(len(mail.outbox), 0)

        with self.settings(SEND_LOGIN_EMAILS=True):
            # Verify that the right thing happens with an invalid-format OTP
            result = self.google_oauth2_test(token_response, account_response, subdomain='zulip',
                                             mobile_flow_otp="1234")
            self.assert_json_error(result, "Invalid OTP")
            result = self.google_oauth2_test(token_response, account_response, subdomain='zulip',
                                             mobile_flow_otp="invalido" * 8)
            self.assert_json_error(result, "Invalid OTP")

            # Now do it correctly
            result = self.google_oauth2_test(token_response, account_response, subdomain='zulip',
                                             mobile_flow_otp=mobile_flow_otp)
        self.assertEqual(result.status_code, 302)
        redirect_url = result['Location']
        parsed_url = urllib.parse.urlparse(redirect_url)
        query_params = urllib.parse.parse_qs(parsed_url.query)
        self.assertEqual(parsed_url.scheme, 'zulip')
        self.assertEqual(query_params["realm"], ['http://zulip.testserver'])
        self.assertEqual(query_params["email"], [self.user_profile.email])
        encrypted_api_key = query_params["otp_encrypted_api_key"][0]
        hamlet_api_keys = get_all_api_keys(self.user_profile)
        self.assertIn(otp_decrypt_api_key(encrypted_api_key, mobile_flow_otp), hamlet_api_keys)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn('Zulip on Android', mail.outbox[0].body)

    def get_log_into_subdomain(self, data: Dict[str, Any], *, key: Optional[str]=None, subdomain: str='zulip') -> HttpResponse:
        token = signing.dumps(data, salt=_subdomain_token_salt, key=key)
        url_path = reverse('zerver.views.auth.log_into_subdomain', args=[token])
        return self.client_get(url_path, subdomain=subdomain)

    def test_redirect_to_next_url_for_log_into_subdomain(self) -> None:
        def test_redirect_to_next_url(next: str='') -> HttpResponse:
            data = {'name': 'Hamlet',
                    'email': self.example_email("hamlet"),
                    'subdomain': 'zulip',
                    'is_signup': False,
                    'next': next}
            user_profile = self.example_user('hamlet')
            with mock.patch(
                    'zerver.views.auth.authenticate_remote_user',
                    return_value=(user_profile, {'invalid_subdomain': False})):
                with mock.patch('zerver.views.auth.do_login'):
                    result = self.get_log_into_subdomain(data)
            return result

        res = test_redirect_to_next_url()
        self.assertEqual(res.status_code, 302)
        self.assertEqual(res.url, 'http://zulip.testserver')
        res = test_redirect_to_next_url('/user_uploads/path_to_image')
        self.assertEqual(res.status_code, 302)
        self.assertEqual(res.url, 'http://zulip.testserver/user_uploads/path_to_image')

        res = test_redirect_to_next_url('/#narrow/stream/7-test-here')
        self.assertEqual(res.status_code, 302)
        self.assertEqual(res.url, 'http://zulip.testserver/#narrow/stream/7-test-here')

    def test_log_into_subdomain_when_signature_is_bad(self) -> None:
        data = {'name': 'Full Name',
                'email': self.example_email("hamlet"),
                'subdomain': 'zulip',
                'is_signup': False,
                'next': ''}
        with mock.patch('logging.warning') as mock_warning:
            result = self.get_log_into_subdomain(data, key='nonsense')
            mock_warning.assert_called_with("Subdomain cookie: Bad signature.")
        self.assertEqual(result.status_code, 400)

    def test_log_into_subdomain_when_signature_is_expired(self) -> None:
        data = {'name': 'Full Name',
                'email': self.example_email("hamlet"),
                'subdomain': 'zulip',
                'is_signup': False,
                'next': ''}
        with mock.patch('django.core.signing.time.time', return_value=time.time() - 45):
            token = signing.dumps(data, salt=_subdomain_token_salt)
        url_path = reverse('zerver.views.auth.log_into_subdomain', args=[token])
        with mock.patch('logging.warning') as mock_warning:
            result = self.client_get(url_path, subdomain='zulip')
            mock_warning.assert_called_once()
        self.assertEqual(result.status_code, 400)

    def test_log_into_subdomain_when_is_signup_is_true(self) -> None:
        data = {'name': 'Full Name',
                'email': self.example_email("hamlet"),
                'subdomain': 'zulip',
                'is_signup': True,
                'next': ''}
        result = self.get_log_into_subdomain(data)
        self.assertEqual(result.status_code, 200)
        self.assert_in_response('hamlet@zulip.com already has an account', result)

    def test_log_into_subdomain_when_is_signup_is_true_and_new_user(self) -> None:
        data = {'name': 'New User Name',
                'email': 'new@zulip.com',
                'subdomain': 'zulip',
                'is_signup': True,
                'next': ''}
        result = self.get_log_into_subdomain(data)
        self.assertEqual(result.status_code, 302)
        confirmation = Confirmation.objects.all().first()
        confirmation_key = confirmation.confirmation_key
        self.assertIn('do_confirm/' + confirmation_key, result.url)
        result = self.client_get(result.url)
        self.assert_in_response('action="/accounts/register/"', result)
        data = {"from_confirmation": "1",
                "full_name": data['name'],
                "key": confirmation_key}
        result = self.client_post('/accounts/register/', data, subdomain="zulip")
        self.assert_in_response("You're almost there", result)

        # Verify that the user is asked for name but not password
        self.assert_not_in_success_response(['id_password'], result)
        self.assert_in_success_response(['id_full_name'], result)

    def test_log_into_subdomain_when_is_signup_is_false_and_new_user(self) -> None:
        data = {'name': 'New User Name',
                'email': 'new@zulip.com',
                'subdomain': 'zulip',
                'is_signup': False,
                'next': ''}
        result = self.get_log_into_subdomain(data)
        self.assertEqual(result.status_code, 200)
        self.assert_in_response('No account found for', result)
        self.assert_in_response('new@zulip.com.', result)
        self.assert_in_response('action="http://zulip.testserver/accounts/do_confirm/', result)

        url = re.findall('action="(http://zulip.testserver/accounts/do_confirm[^"]*)"', result.content.decode('utf-8'))[0]
        confirmation = Confirmation.objects.all().first()
        confirmation_key = confirmation.confirmation_key
        self.assertIn('do_confirm/' + confirmation_key, url)
        result = self.client_get(url)
        self.assert_in_response('action="/accounts/register/"', result)
        data = {"from_confirmation": "1",
                "full_name": data['name'],
                "key": confirmation_key}
        result = self.client_post('/accounts/register/', data, subdomain="zulip")
        self.assert_in_response("You're almost there", result)

        # Verify that the user is asked for name but not password
        self.assert_not_in_success_response(['id_password'], result)
        self.assert_in_success_response(['id_full_name'], result)

    def test_log_into_subdomain_when_using_invite_link(self) -> None:
        data = {'name': 'New User Name',
                'email': 'new@zulip.com',
                'subdomain': 'zulip',
                'is_signup': True,
                'next': ''}

        realm = get_realm("zulip")
        realm.invite_required = True
        realm.save()

        stream_names = ["new_stream_1", "new_stream_2"]
        streams = []
        for stream_name in set(stream_names):
            stream = ensure_stream(realm, stream_name)
            streams.append(stream)

        # Without the invite link, we can't create an account due to invite_required
        result = self.get_log_into_subdomain(data)
        self.assertEqual(result.status_code, 200)
        self.assert_in_success_response(['Sign up for Zulip'], result)

        # Now confirm an invitation link works
        referrer = self.example_user("hamlet")
        multiuse_obj = MultiuseInvite.objects.create(realm=realm, referred_by=referrer)
        multiuse_obj.streams.set(streams)
        invite_link = create_confirmation_link(multiuse_obj, realm.host,
                                               Confirmation.MULTIUSE_INVITE)

        result = self.client_get(invite_link, subdomain="zulip")
        self.assert_in_success_response(['Sign up for Zulip'], result)

        result = self.get_log_into_subdomain(data)
        self.assertEqual(result.status_code, 302)

        confirmation = Confirmation.objects.all().last()
        confirmation_key = confirmation.confirmation_key
        self.assertIn('do_confirm/' + confirmation_key, result.url)
        result = self.client_get(result.url)
        self.assert_in_response('action="/accounts/register/"', result)
        data2 = {"from_confirmation": "1",
                 "full_name": data['name'],
                 "key": confirmation_key}
        result = self.client_post('/accounts/register/', data2, subdomain="zulip")
        self.assert_in_response("You're almost there", result)

        # Verify that the user is asked for name but not password
        self.assert_not_in_success_response(['id_password'], result)
        self.assert_in_success_response(['id_full_name'], result)

        # Click confirm registration button.
        result = self.client_post(
            '/accounts/register/',
            {'full_name': 'New User Name',
             'key': confirmation_key,
             'terms': True})
        self.assertEqual(result.status_code, 302)
        self.assertEqual(sorted(self.get_streams('new@zulip.com', realm)), stream_names)

    def test_log_into_subdomain_when_email_is_none(self) -> None:
        data = {'name': None,
                'email': None,
                'subdomain': 'zulip',
                'is_signup': False,
                'next': ''}

        with mock.patch('logging.warning'):
            result = self.get_log_into_subdomain(data)
            self.assert_in_success_response(["You need an invitation to join this organization."], result)

    def test_user_cannot_log_into_nonexisting_realm(self) -> None:
        token_response = ResponseMock(200, {'access_token': "unique_token"})
        account_data = dict(name="Full Name",
                            email_verified=True,
                            email=self.example_email("hamlet"))
        account_response = ResponseMock(200, account_data)
        result = self.google_oauth2_test(token_response, account_response,
                                         subdomain='nonexistent')
        self.assert_in_success_response(["There is no Zulip organization hosted at this subdomain."],
                                        result)

    def test_user_cannot_log_into_wrong_subdomain(self) -> None:
        token_response = ResponseMock(200, {'access_token': "unique_token"})
        account_data = dict(name="Full Name",
                            email_verified=True,
                            email=self.example_email("hamlet"))
        account_response = ResponseMock(200, account_data)
        result = self.google_oauth2_test(token_response, account_response,
                                         subdomain='zephyr')
        self.assertEqual(result.status_code, 302)
        self.assertTrue(result.url.startswith("http://zephyr.testserver/accounts/login/subdomain/"))
        result = self.client_get(result.url.replace('http://zephyr.testserver', ''),
                                 subdomain="zephyr")
        self.assert_in_success_response(['Your email address, hamlet@zulip.com, is not in one of the domains ',
                                         'that are allowed to register for accounts in this organization.'], result)

    def test_user_cannot_log_into_wrong_subdomain_with_cookie(self) -> None:
        data = {'name': 'Full Name',
                'email': self.example_email("hamlet"),
                'subdomain': 'zephyr'}
        with mock.patch('logging.warning') as mock_warning:
            result = self.get_log_into_subdomain(data)
            mock_warning.assert_called_with("Login attempt on invalid subdomain")
        self.assertEqual(result.status_code, 400)

    def test_google_oauth2_registration(self) -> None:
        """If the user doesn't exist yet, Google auth can be used to register an account"""
        email = "newuser@zulip.com"
        realm = get_realm("zulip")
        token_response = ResponseMock(200, {'access_token': "unique_token"})
        account_data = dict(name="Full Name",
                            email_verified=True,
                            email=email)
        account_response = ResponseMock(200, account_data)
        result = self.google_oauth2_test(token_response, account_response, subdomain='zulip',
                                         is_signup='1')

        data = load_subdomain_token(result)
        name = 'Full Name'
        self.assertEqual(data['email'], email)
        self.assertEqual(data['name'], name)
        self.assertEqual(data['subdomain'], 'zulip')
        self.assertEqual(result.status_code, 302)
        parsed_url = urllib.parse.urlparse(result.url)
        uri = "{}://{}{}".format(parsed_url.scheme, parsed_url.netloc,
                                 parsed_url.path)
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

        # Verify that the user is asked for name but not password
        self.assert_not_in_success_response(['id_password'], result)
        self.assert_in_success_response(['id_full_name'], result)

        # Click confirm registration button.
        result = self.client_post(
            '/accounts/register/',
            {'full_name': name,
             'key': confirmation_key,
             'terms': True})

        self.assertEqual(result.status_code, 302)
        user_profile = get_user(email, realm)
        self.assertEqual(get_session_dict_user(self.client.session), user_profile.id)

class GoogleLoginTest(GoogleOAuthTest):
    @override_settings(ROOT_DOMAIN_LANDING_PAGE=True)
    def test_google_oauth2_subdomains_homepage(self) -> None:
        token_response = ResponseMock(200, {'access_token': "unique_token"})
        account_data = dict(name=dict(formatted="Full Name"),
                            emails=[dict(type="account",
                                         value=self.example_email("hamlet"))])
        account_response = ResponseMock(200, account_data)
        result = self.google_oauth2_test(token_response, account_response, subdomain="")
        self.assertEqual(result.status_code, 302)
        self.assertIn('subdomain=1', result.url)

    def test_google_oauth2_400_token_response(self) -> None:
        token_response = ResponseMock(400, {})
        with mock.patch("logging.warning") as m:
            result = self.google_oauth2_test(token_response, ResponseMock(500, {}))
        self.assertEqual(result.status_code, 400)
        self.assertEqual(m.call_args_list[0][0][0],
                         "User error converting Google oauth2 login to token: Response text")

    def test_google_oauth2_500_token_response(self) -> None:
        token_response = ResponseMock(500, {})
        with mock.patch("logging.error") as m:
            result = self.google_oauth2_test(token_response, ResponseMock(500, {}))
        self.assertEqual(result.status_code, 400)
        self.assertEqual(m.call_args_list[0][0][0],
                         "Could not convert google oauth2 code to access_token: Response text")

    def test_google_oauth2_400_account_response(self) -> None:
        token_response = ResponseMock(200, {'access_token': "unique_token"})
        account_response = ResponseMock(400, {})
        with mock.patch("logging.warning") as m:
            result = self.google_oauth2_test(token_response, account_response)
        self.assertEqual(result.status_code, 400)
        self.assertEqual(m.call_args_list[0][0][0],
                         "Google login failed making info API call: Response text")

    def test_google_oauth2_500_account_response(self) -> None:
        token_response = ResponseMock(200, {'access_token': "unique_token"})
        account_response = ResponseMock(500, {})
        with mock.patch("logging.error") as m:
            result = self.google_oauth2_test(token_response, account_response)
        self.assertEqual(result.status_code, 400)
        self.assertEqual(m.call_args_list[0][0][0],
                         "Google login failed making API call: Response text")

    def test_google_oauth2_error_access_denied(self) -> None:
        result = self.client_get("/accounts/login/google/done/?error=access_denied")
        self.assertEqual(result.status_code, 302)
        path = urllib.parse.urlparse(result.url).path
        self.assertEqual(path, "/")

    def test_google_oauth2_error_other(self) -> None:
        with mock.patch("logging.warning") as m:
            result = self.client_get("/accounts/login/google/done/?error=some_other_error")
        self.assertEqual(result.status_code, 400)
        self.assertEqual(m.call_args_list[0][0][0],
                         "Error from google oauth2 login: some_other_error")

    def test_google_oauth2_missing_csrf(self) -> None:
        with mock.patch("logging.warning") as m:
            result = self.client_get("/accounts/login/google/done/")
        self.assertEqual(result.status_code, 400)
        self.assertEqual(m.call_args_list[0][0][0],
                         'Missing Google oauth2 CSRF state')

    def test_google_oauth2_csrf_malformed(self) -> None:
        with mock.patch("logging.warning") as m:
            result = self.client_get("/accounts/login/google/done/?state=badstate")
        self.assertEqual(result.status_code, 400)
        self.assertEqual(m.call_args_list[0][0][0],
                         'Missing Google oauth2 CSRF state')

    def test_google_oauth2_csrf_badstate(self) -> None:
        with mock.patch("logging.warning") as m:
            result = self.client_get("/accounts/login/google/done/?state=badstate:otherbadstate:more:::")
        self.assertEqual(result.status_code, 400)
        self.assertEqual(m.call_args_list[0][0][0],
                         'Google oauth2 CSRF error')

class JSONFetchAPIKeyTest(ZulipTestCase):
    def setUp(self) -> None:
        self.user_profile = self.example_user('hamlet')
        self.email = self.user_profile.email

    def test_success(self) -> None:
        self.login(self.email)
        result = self.client_post("/json/fetch_api_key",
                                  dict(user_profile=self.user_profile,
                                       password=initial_password(self.email)))
        self.assert_json_success(result)

    def test_not_loggedin(self) -> None:
        result = self.client_post("/json/fetch_api_key",
                                  dict(user_profile=self.user_profile,
                                       password=initial_password(self.email)))
        self.assert_json_error(result,
                               "Not logged in: API authentication or user session required", 401)

    def test_wrong_password(self) -> None:
        self.login(self.email)
        result = self.client_post("/json/fetch_api_key",
                                  dict(user_profile=self.user_profile,
                                       password="wrong"))
        self.assert_json_error(result, "Your username or password is incorrect.", 400)

class FetchAPIKeyTest(ZulipTestCase):
    def setUp(self) -> None:
        self.user_profile = self.example_user('hamlet')
        self.email = self.user_profile.email

    def test_success(self) -> None:
        result = self.client_post("/api/v1/fetch_api_key",
                                  dict(username=self.email,
                                       password=initial_password(self.email)))
        self.assert_json_success(result)

    def test_invalid_email(self) -> None:
        result = self.client_post("/api/v1/fetch_api_key",
                                  dict(username='hamlet',
                                       password=initial_password(self.email)))
        self.assert_json_error(result, "Enter a valid email address.", 400)

    def test_wrong_password(self) -> None:
        result = self.client_post("/api/v1/fetch_api_key",
                                  dict(username=self.email,
                                       password="wrong"))
        self.assert_json_error(result, "Your username or password is incorrect.", 403)

    @override_settings(AUTHENTICATION_BACKENDS=('zproject.backends.GoogleMobileOauth2Backend',),
                       SEND_LOGIN_EMAILS=True)
    def test_google_oauth2_token_success(self) -> None:
        self.assertEqual(len(mail.outbox), 0)
        self.user_profile.date_joined = timezone_now() - datetime.timedelta(seconds=JUST_CREATED_THRESHOLD + 1)
        self.user_profile.save()
        with mock.patch(
                'apiclient.sample_tools.client.verify_id_token',
                return_value={
                    "email_verified": True,
                    "email": self.example_email("hamlet"),
                }):
            result = self.client_post("/api/v1/fetch_api_key",
                                      dict(username="google-oauth2-token",
                                           password="token"))
        self.assert_json_success(result)
        self.assertEqual(len(mail.outbox), 1)

    @override_settings(AUTHENTICATION_BACKENDS=('zproject.backends.GoogleMobileOauth2Backend',))
    def test_google_oauth2_token_failure(self) -> None:
        payload = dict(email_verified=False)
        with mock.patch('apiclient.sample_tools.client.verify_id_token', return_value=payload):
            result = self.client_post("/api/v1/fetch_api_key",
                                      dict(username="google-oauth2-token",
                                           password="token"))
            self.assert_json_error(result, "Your username or password is incorrect.", 403)

    @override_settings(AUTHENTICATION_BACKENDS=('zproject.backends.GoogleMobileOauth2Backend',))
    def test_google_oauth2_token_unregistered(self) -> None:
        with mock.patch(
                'apiclient.sample_tools.client.verify_id_token',
                return_value={
                    "email_verified": True,
                    "email": "nobody@zulip.com",
                }):
            result = self.client_post("/api/v1/fetch_api_key",
                                      dict(username="google-oauth2-token",
                                           password="token"))
        self.assert_json_error(
            result,
            "This user is not registered; do so from a browser.",
            403)

    def test_password_auth_disabled(self) -> None:
        with mock.patch('zproject.backends.password_auth_enabled', return_value=False):
            result = self.client_post("/api/v1/fetch_api_key",
                                      dict(username=self.email,
                                           password=initial_password(self.email)))
            self.assert_json_error_contains(result, "Password auth is disabled", 403)

    @override_settings(AUTHENTICATION_BACKENDS=('zproject.backends.ZulipLDAPAuthBackend',))
    def test_ldap_auth_email_auth_disabled_success(self) -> None:
        ldap_patcher = mock.patch('django_auth_ldap.config.ldap.initialize')
        self.mock_initialize = ldap_patcher.start()
        self.mock_ldap = MockLDAP()
        self.mock_initialize.return_value = self.mock_ldap
        self.backend = ZulipLDAPAuthBackend()

        self.mock_ldap.directory = {
            'uid=hamlet,ou=users,dc=zulip,dc=com': {
                'userPassword': 'testing'
            }
        }
        with self.settings(
                LDAP_APPEND_DOMAIN='zulip.com',
                AUTH_LDAP_BIND_PASSWORD='',
                AUTH_LDAP_USER_DN_TEMPLATE='uid=%(user)s,ou=users,dc=zulip,dc=com'):
            result = self.client_post("/api/v1/fetch_api_key",
                                      dict(username=self.email,
                                           password="testing"))
        self.assert_json_success(result)
        self.mock_ldap.reset()
        self.mock_initialize.stop()

    def test_inactive_user(self) -> None:
        do_deactivate_user(self.user_profile)
        result = self.client_post("/api/v1/fetch_api_key",
                                  dict(username=self.email,
                                       password=initial_password(self.email)))
        self.assert_json_error_contains(result, "Your account has been disabled", 403)

    def test_deactivated_realm(self) -> None:
        do_deactivate_realm(self.user_profile.realm)
        result = self.client_post("/api/v1/fetch_api_key",
                                  dict(username=self.email,
                                       password=initial_password(self.email)))
        self.assert_json_error_contains(result, "This organization has been deactivated", 403)

class DevFetchAPIKeyTest(ZulipTestCase):
    def setUp(self) -> None:
        self.user_profile = self.example_user('hamlet')
        self.email = self.user_profile.email

    def test_success(self) -> None:
        result = self.client_post("/api/v1/dev_fetch_api_key",
                                  dict(username=self.email))
        self.assert_json_success(result)
        data = result.json()
        self.assertEqual(data["email"], self.email)
        user_api_keys = get_all_api_keys(self.user_profile)
        self.assertIn(data['api_key'], user_api_keys)

    def test_invalid_email(self) -> None:
        email = 'hamlet'
        result = self.client_post("/api/v1/dev_fetch_api_key",
                                  dict(username=email))
        self.assert_json_error_contains(result, "Enter a valid email address.", 400)

    def test_unregistered_user(self) -> None:
        email = 'foo@zulip.com'
        result = self.client_post("/api/v1/dev_fetch_api_key",
                                  dict(username=email))
        self.assert_json_error_contains(result, "This user is not registered.", 403)

    def test_inactive_user(self) -> None:
        do_deactivate_user(self.user_profile)
        result = self.client_post("/api/v1/dev_fetch_api_key",
                                  dict(username=self.email))
        self.assert_json_error_contains(result, "Your account has been disabled", 403)

    def test_deactivated_realm(self) -> None:
        do_deactivate_realm(self.user_profile.realm)
        result = self.client_post("/api/v1/dev_fetch_api_key",
                                  dict(username=self.email))
        self.assert_json_error_contains(result, "This organization has been deactivated", 403)

    def test_dev_auth_disabled(self) -> None:
        with mock.patch('zerver.views.auth.dev_auth_enabled', return_value=False):
            result = self.client_post("/api/v1/dev_fetch_api_key",
                                      dict(username=self.email))
            self.assert_json_error_contains(result, "Dev environment not enabled.", 400)

class DevGetEmailsTest(ZulipTestCase):
    def test_success(self) -> None:
        result = self.client_get("/api/v1/dev_list_users")
        self.assert_json_success(result)
        self.assert_in_response("direct_admins", result)
        self.assert_in_response("direct_users", result)

    def test_dev_auth_disabled(self) -> None:
        with mock.patch('zerver.views.auth.dev_auth_enabled', return_value=False):
            result = self.client_get("/api/v1/dev_list_users")
            self.assert_json_error_contains(result, "Dev environment not enabled.", 400)

class FetchAuthBackends(ZulipTestCase):
    def assert_on_error(self, error: Optional[str]) -> None:
        if error:
            raise AssertionError(error)

    def test_get_server_settings(self) -> None:
        def check_result(result: HttpResponse, extra_fields: List[Tuple[str, Validator]]=[]) -> None:
            self.assert_json_success(result)
            checker = check_dict_only([
                ('authentication_methods', check_dict_only([
                    ('google', check_bool),
                    ('github', check_bool),
                    ('email', check_bool),
                    ('ldap', check_bool),
                    ('dev', check_bool),
                    ('remoteuser', check_bool),
                    ('password', check_bool),
                ])),
                ('email_auth_enabled', check_bool),
                ('require_email_format_usernames', check_bool),
                ('realm_uri', check_string),
                ('zulip_version', check_string),
                ('push_notifications_enabled', check_bool),
                ('msg', check_string),
                ('result', check_string),
            ] + extra_fields)
            self.assert_on_error(checker("data", result.json()))

        result = self.client_get("/api/v1/server_settings", subdomain="")
        check_result(result)

        with self.settings(ROOT_DOMAIN_LANDING_PAGE=False):
            result = self.client_get("/api/v1/server_settings", subdomain="")
        check_result(result)

        with self.settings(ROOT_DOMAIN_LANDING_PAGE=False):
            result = self.client_get("/api/v1/server_settings", subdomain="zulip")
        check_result(result, [
            ('realm_name', check_string),
            ('realm_description', check_string),
            ('realm_icon', check_string),
        ])

    def test_fetch_auth_backend_format(self) -> None:
        result = self.client_get("/api/v1/get_auth_backends")
        self.assert_json_success(result)
        data = result.json()
        self.assertEqual(set(data.keys()),
                         {'msg', 'password', 'github', 'google', 'email', 'ldap',
                          'dev', 'remoteuser', 'zulip_version'})
        for backend in set(data.keys()) - {'msg', 'result', 'zulip_version'}:
            self.assertTrue(isinstance(data[backend], bool))

    def test_fetch_auth_backend(self) -> None:
        backends = [GoogleMobileOauth2Backend(), DevAuthBackend()]
        with mock.patch('django.contrib.auth.get_backends', return_value=backends):
            result = self.client_get("/api/v1/get_auth_backends")
            self.assert_json_success(result)
            data = result.json()
            self.assertEqual(data, {
                'msg': '',
                'password': False,
                'github': False,
                'google': True,
                'dev': True,
                'email': False,
                'ldap': False,
                'remoteuser': False,
                'result': 'success',
                'zulip_version': ZULIP_VERSION,
            })

            # Test subdomains cases
            with self.settings(ROOT_DOMAIN_LANDING_PAGE=False):
                result = self.client_get("/api/v1/get_auth_backends")
                self.assert_json_success(result)
                data = result.json()
                self.assertEqual(data, {
                    'msg': '',
                    'password': False,
                    'github': False,
                    'google': True,
                    'email': False,
                    'ldap': False,
                    'remoteuser': False,
                    'dev': True,
                    'result': 'success',
                    'zulip_version': ZULIP_VERSION,
                })

                # Verify invalid subdomain
                result = self.client_get("/api/v1/get_auth_backends",
                                         subdomain="invalid")
                self.assert_json_error_contains(result, "Invalid subdomain", 400)

                # Verify correct behavior with a valid subdomain with
                # some backends disabled for the realm
                realm = get_realm("zulip")
                do_set_realm_authentication_methods(realm, dict(Google=False, Email=False, Dev=True))
                result = self.client_get("/api/v1/get_auth_backends",
                                         subdomain="zulip")
                self.assert_json_success(result)
                data = result.json()
                self.assertEqual(data, {
                    'msg': '',
                    'password': False,
                    'github': False,
                    'google': False,
                    'email': False,
                    'ldap': False,
                    'remoteuser': False,
                    'dev': True,
                    'result': 'success',
                    'zulip_version': ZULIP_VERSION,
                })
            with self.settings(ROOT_DOMAIN_LANDING_PAGE=True):
                # With ROOT_DOMAIN_LANDING_PAGE, homepage fails
                result = self.client_get("/api/v1/get_auth_backends",
                                         subdomain="")
                self.assert_json_error_contains(result, "Subdomain required", 400)

                # With ROOT_DOMAIN_LANDING_PAGE, subdomain pages succeed
                result = self.client_get("/api/v1/get_auth_backends",
                                         subdomain="zulip")
                self.assert_json_success(result)
                data = result.json()
                self.assertEqual(data, {
                    'msg': '',
                    'password': False,
                    'github': False,
                    'google': False,
                    'email': False,
                    'remoteuser': False,
                    'ldap': False,
                    'dev': True,
                    'result': 'success',
                    'zulip_version': ZULIP_VERSION,
                })

class TestTwoFactor(ZulipTestCase):
    def test_direct_dev_login_with_2fa(self) -> None:
        email = self.example_email('hamlet')
        user_profile = self.example_user('hamlet')
        with self.settings(TWO_FACTOR_AUTHENTICATION_ENABLED=True):
            data = {'direct_email': email}
            result = self.client_post('/accounts/login/local/', data)
            self.assertEqual(result.status_code, 302)
            self.assertEqual(get_session_dict_user(self.client.session), user_profile.id)
            # User logs in but when otp device doesn't exist.
            self.assertNotIn('otp_device_id', self.client.session.keys())

            self.create_default_device(user_profile)

            data = {'direct_email': email}
            result = self.client_post('/accounts/login/local/', data)
            self.assertEqual(result.status_code, 302)
            self.assertEqual(get_session_dict_user(self.client.session), user_profile.id)
            # User logs in when otp device exists.
            self.assertIn('otp_device_id', self.client.session.keys())

    @mock.patch('two_factor.models.totp')
    def test_two_factor_login_with_ldap(self, mock_totp):
        # type: (mock.MagicMock) -> None
        token = 123456
        email = self.example_email('hamlet')
        password = 'testing'

        user_profile = self.example_user('hamlet')
        user_profile.set_password(password)
        user_profile.save()
        self.create_default_device(user_profile)

        def totp(*args, **kwargs):
            # type: (*Any, **Any) -> int
            return token

        mock_totp.side_effect = totp

        # Setup LDAP
        ldap_user_attr_map = {'full_name': 'fn', 'short_name': 'sn'}

        ldap_patcher = mock.patch('django_auth_ldap.config.ldap.initialize')
        mock_initialize = ldap_patcher.start()
        mock_ldap = MockLDAP()
        mock_initialize.return_value = mock_ldap

        full_name = 'New LDAP fullname'
        mock_ldap.directory = {
            'uid=hamlet,ou=users,dc=zulip,dc=com': {
                'userPassword': 'testing',
                'fn': [full_name],
                'sn': ['shortname'],
            }
        }

        with self.settings(
                AUTHENTICATION_BACKENDS=('zproject.backends.ZulipLDAPAuthBackend',),
                TWO_FACTOR_CALL_GATEWAY='two_factor.gateways.fake.Fake',
                TWO_FACTOR_SMS_GATEWAY='two_factor.gateways.fake.Fake',
                TWO_FACTOR_AUTHENTICATION_ENABLED=True,
                POPULATE_PROFILE_VIA_LDAP=True,
                LDAP_APPEND_DOMAIN='zulip.com',
                AUTH_LDAP_BIND_PASSWORD='',
                AUTH_LDAP_USER_ATTR_MAP=ldap_user_attr_map,
                AUTH_LDAP_USER_DN_TEMPLATE='uid=%(user)s,ou=users,dc=zulip,dc=com'):

            first_step_data = {"username": email,
                               "password": password,
                               "two_factor_login_view-current_step": "auth"}
            result = self.client_post("/accounts/login/", first_step_data)
            self.assertEqual(result.status_code, 200)

            second_step_data = {"token-otp_token": str(token),
                                "two_factor_login_view-current_step": "token"}
            result = self.client_post("/accounts/login/", second_step_data)
            self.assertEqual(result.status_code, 302)
            self.assertEqual(result['Location'], 'http://zulip.testserver')

            # Going to login page should redirect to `realm.uri` if user is
            # already logged in.
            result = self.client_get('/accounts/login/')
            self.assertEqual(result.status_code, 302)
            self.assertEqual(result['Location'], 'http://zulip.testserver')

class TestDevAuthBackend(ZulipTestCase):
    def test_login_success(self) -> None:
        user_profile = self.example_user('hamlet')
        email = user_profile.email
        data = {'direct_email': email}
        result = self.client_post('/accounts/login/local/', data)
        self.assertEqual(result.status_code, 302)
        self.assertEqual(get_session_dict_user(self.client.session), user_profile.id)

    def test_login_success_with_2fa(self) -> None:
        user_profile = self.example_user('hamlet')
        self.create_default_device(user_profile)
        email = user_profile.email
        with self.settings(TWO_FACTOR_AUTHENTICATION_ENABLED=True):
            result = self.client_post('/accounts/login/local/', data)
        self.assertEqual(result.status_code, 302)
        self.assertEqual(result.url, 'http://zulip.testserver')
        self.assertEqual(get_session_dict_user(self.client.session), user_profile.id)
        self.assertIn('otp_device_id', list(self.client.session.keys()))

    def test_redirect_to_next_url(self) -> None:
        def do_local_login(formaction: str) -> HttpResponse:
            user_email = self.example_email('hamlet')
            data = {'direct_email': user_email}
            return self.client_post(formaction, data)

        res = do_local_login('/accounts/login/local/')
        self.assertEqual(res.status_code, 302)
        self.assertEqual(res.url, 'http://zulip.testserver')

        res = do_local_login('/accounts/login/local/?next=/user_uploads/path_to_image')
        self.assertEqual(res.status_code, 302)
        self.assertEqual(res.url, 'http://zulip.testserver/user_uploads/path_to_image')

        # In local Email based authentication we never make browser send the hash
        # to the backend. Rather we depend upon the browser's behaviour of persisting
        # hash anchors in between redirect requests. See below stackoverflow conversation
        # https://stackoverflow.com/questions/5283395/url-hash-is-persisting-between-redirects
        res = do_local_login('/accounts/login/local/?next=#narrow/stream/7-test-here')
        self.assertEqual(res.status_code, 302)
        self.assertEqual(res.url, 'http://zulip.testserver')

    def test_login_with_subdomain(self) -> None:
        user_profile = self.example_user('hamlet')
        email = user_profile.email
        data = {'direct_email': email}

        result = self.client_post('/accounts/login/local/', data)
        self.assertEqual(result.status_code, 302)
        self.assertEqual(get_session_dict_user(self.client.session), user_profile.id)

    def test_choose_realm(self) -> None:
        result = self.client_post('/devlogin/', subdomain="zulip")
        self.assert_in_success_response(["Click on a user to log in to Zulip Dev!"], result)
        self.assert_in_success_response(["iago@zulip.com", "hamlet@zulip.com"], result)

        result = self.client_post('/devlogin/', subdomain="")
        self.assert_in_success_response(["Click on a user to log in!"], result)
        self.assert_in_success_response(["iago@zulip.com", "hamlet@zulip.com"], result)
        self.assert_in_success_response(["starnine@mit.edu", "espuser@mit.edu"], result)

        data = {'new_realm': 'zephyr'}
        result = self.client_post('/devlogin/', data, subdomain="zulip")
        self.assertEqual(result.status_code, 302)
        self.assertEqual(result.url, "http://zephyr.testserver")
        result = self.client_get('/devlogin/', subdomain="zephyr")
        self.assert_in_success_response(["starnine@mit.edu", "espuser@mit.edu"], result)
        self.assert_in_success_response(["Click on a user to log in to Zulip Dev!"], result)
        self.assert_not_in_success_response(["iago@zulip.com", "hamlet@zulip.com"], result)

    def test_choose_realm_with_subdomains_enabled(self) -> None:
        with mock.patch('zerver.views.auth.is_subdomain_root_or_alias', return_value=False):
            with mock.patch('zerver.views.auth.get_realm_from_request', return_value=get_realm('zulip')):
                result = self.client_get("http://zulip.testserver/devlogin/")
                self.assert_in_success_response(["iago@zulip.com", "hamlet@zulip.com"], result)
                self.assert_not_in_success_response(["starnine@mit.edu", "espuser@mit.edu"], result)
                self.assert_in_success_response(["Click on a user to log in to Zulip Dev!"], result)

            with mock.patch('zerver.views.auth.get_realm_from_request', return_value=get_realm('zephyr')):
                result = self.client_post("http://zulip.testserver/devlogin/", {'new_realm': 'zephyr'})
                self.assertEqual(result["Location"], "http://zephyr.testserver")

                result = self.client_get("http://zephyr.testserver/devlogin/")
                self.assert_not_in_success_response(["iago@zulip.com", "hamlet@zulip.com"], result)
                self.assert_in_success_response(["starnine@mit.edu", "espuser@mit.edu"], result)
                self.assert_in_success_response(["Click on a user to log in to MIT!"], result)

    def test_login_failure(self) -> None:
        email = self.example_email("hamlet")
        data = {'direct_email': email}
        with self.settings(AUTHENTICATION_BACKENDS=('zproject.backends.EmailAuthBackend',)):
            with mock.patch('django.core.handlers.exception.logger'):
                response = self.client_post('/accounts/login/local/', data)
                self.assertRedirects(response, reverse('dev_not_supported'))

    def test_login_failure_due_to_nonexistent_user(self) -> None:
        email = 'nonexisting@zulip.com'
        data = {'direct_email': email}
        with mock.patch('django.core.handlers.exception.logger'):
            response = self.client_post('/accounts/login/local/', data)
            self.assertRedirects(response, reverse('dev_not_supported'))

class TestZulipRemoteUserBackend(ZulipTestCase):
    def test_login_success(self) -> None:
        user_profile = self.example_user('hamlet')
        email = user_profile.email
        with self.settings(AUTHENTICATION_BACKENDS=('zproject.backends.ZulipRemoteUserBackend',)):
            result = self.client_post('/accounts/login/sso/', REMOTE_USER=email)
            self.assertEqual(result.status_code, 302)
            self.assertEqual(get_session_dict_user(self.client.session), user_profile.id)

    def test_login_success_with_sso_append_domain(self) -> None:
        username = 'hamlet'
        user_profile = self.example_user('hamlet')
        with self.settings(AUTHENTICATION_BACKENDS=('zproject.backends.ZulipRemoteUserBackend',),
                           SSO_APPEND_DOMAIN='zulip.com'):
            result = self.client_post('/accounts/login/sso/', REMOTE_USER=username)
            self.assertEqual(result.status_code, 302)
            self.assertEqual(get_session_dict_user(self.client.session), user_profile.id)

    def test_login_failure(self) -> None:
        email = self.example_email("hamlet")
        result = self.client_post('/accounts/login/sso/', REMOTE_USER=email)
        self.assertEqual(result.status_code, 200)  # This should ideally be not 200.
        self.assertIs(get_session_dict_user(self.client.session), None)

    def test_login_failure_due_to_nonexisting_user(self) -> None:
        email = 'nonexisting@zulip.com'
        with self.settings(AUTHENTICATION_BACKENDS=('zproject.backends.ZulipRemoteUserBackend',)):
            result = self.client_post('/accounts/login/sso/', REMOTE_USER=email)
            self.assertEqual(result.status_code, 200)
            self.assertIs(get_session_dict