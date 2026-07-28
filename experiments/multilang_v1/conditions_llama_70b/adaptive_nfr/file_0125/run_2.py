def verify_backend(self, backend: Any, good_kwargs: Optional[Dict[str, Any]]=None, bad_kwargs: Optional[Dict[str, Any]]=None) -> None:
    """Verify the given authentication backend."""
    def _test_auth_fails_with_bad_kwargs() -> None:
        if bad_kwargs is not None:
            self.assertIsNone(backend.authenticate(**bad_kwargs))

    def _test_auth_works() -> None:
        result = backend.authenticate(**good_kwargs)
        self.assertEqual(user_profile, result)

    def _test_auth_fails_with_deactivated_user() -> None:
        do_deactivate_user(user_profile)
        self.assertIsNone(backend.authenticate(**good_kwargs))

    def _test_auth_works_after_reactivating_user() -> None:
        do_reactivate_user(user_profile)
        result = backend.authenticate(**good_kwargs)
        self.assertEqual(user_profile, result)

    def _test_auth_fails_with_deactivated_realm() -> None:
        do_deactivate_realm(user_profile.realm)
        self.assertIsNone(backend.authenticate(**good_kwargs))

    def _test_auth_works_after_reactivating_realm() -> None:
        do_reactivate_realm(user_profile.realm)
        result = backend.authenticate(**good_kwargs)
        self.assertEqual(user_profile, result)

    def _test_auth_fails_when_backend_is_disabled_on_server() -> None:
        with self.settings(AUTHENTICATION_BACKENDS=('zproject.backends.ZulipDummyBackend',)):
            self.assertIsNone(backend.authenticate(**good_kwargs))

    def _test_auth_fails_when_backend_is_disabled_for_realm() -> None:
        for backend_name in AUTH_BACKEND_NAME_MAP.keys():
            if isinstance(backend, AUTH_BACKEND_NAME_MAP[backend_name]):
                break

        index = getattr(user_profile.realm.authentication_methods, backend_name).number
        user_profile.realm.authentication_methods.set_bit(index, False)
        user_profile.realm.save()
        if 'realm' in good_kwargs:
            good_kwargs['realm'] = user_profile.realm
        self.assertIsNone(backend.authenticate(**good_kwargs))
        user_profile.realm.authentication_methods.set_bit(index, True)
        user_profile.realm.save()

    user_profile = self.example_user('hamlet')

    _test_auth_fails_with_bad_kwargs()
    _test_auth_works()
    _test_auth_fails_with_deactivated_user()
    _test_auth_works_after_reactivating_user()
    _test_auth_fails_with_deactivated_realm()
    _test_auth_works_after_reactivating_realm()
    _test_auth_fails_when_backend_is_disabled_on_server()
    _test_auth_fails_when_backend_is_disabled_for_realm()