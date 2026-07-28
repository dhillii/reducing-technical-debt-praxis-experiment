def verify_backend(self, backend: Any, good_kwargs: Optional[Dict[str, Any]]=None, bad_kwargs: Optional[Dict[str, Any]]=None) -> None:
    """Verify the given authentication backend."""
    def _test_auth_fails_with_bad_kwargs() -> None:
        if bad_kwargs is not None:
            self.assertIsNone(backend.authenticate(**bad_kwargs))

    def _test_auth_succeeds() -> None:
        result = backend.authenticate(**good_kwargs)
        self.assertEqual(self.example_user('hamlet'), result)

    def _test_auth_fails_with_deactivated_user() -> None:
        do_deactivate_user(self.example_user('hamlet'))
        self.assertIsNone(backend.authenticate(**good_kwargs))

    def _test_auth_succeeds_after_reactivating_user() -> None:
        do_reactivate_user(self.example_user('hamlet'))
        result = backend.authenticate(**good_kwargs)
        self.assertEqual(self.example_user('hamlet'), result)

    def _test_auth_fails_with_deactivated_realm() -> None:
        do_deactivate_realm(self.example_user('hamlet').realm)
        self.assertIsNone(backend.authenticate(**good_kwargs))

    def _test_auth_succeeds_after_reactivating_realm() -> None:
        do_reactivate_realm(self.example_user('hamlet').realm)
        result = backend.authenticate(**good_kwargs)
        self.assertEqual(self.example_user('hamlet'), result)

    def _test_auth_fails_when_backend_is_disabled_on_server() -> None:
        with self.settings(AUTHENTICATION_BACKENDS=('zproject.backends.ZulipDummyBackend',)):
            self.assertIsNone(backend.authenticate(**good_kwargs))

    def _test_auth_fails_when_backend_is_disabled_for_realm() -> None:
        for backend_name in AUTH_BACKEND_NAME_MAP.keys():
            if isinstance(backend, AUTH_BACKEND_NAME_MAP[backend_name]):
                break

        index = getattr(self.example_user('hamlet').realm.authentication_methods, backend_name).number
        self.example_user('hamlet').realm.authentication_methods.set_bit(index, False)
        self.example_user('hamlet').realm.save()
        if 'realm' in good_kwargs:
            good_kwargs['realm'] = self.example_user('hamlet').realm
        self.assertIsNone(backend.authenticate(**good_kwargs))
        self.example_user('hamlet').realm.authentication_methods.set_bit(index, True)
        self.example_user('hamlet').realm.save()

    _test_auth_fails_with_bad_kwargs()
    _test_auth_succeeds()
    _test_auth_fails_with_deactivated_user()
    _test_auth_succeeds_after_reactivating_user()
    _test_auth_fails_with_deactivated_realm()
    _test_auth_succeeds_after_reactivating_realm()
    _test_auth_fails_when_backend_is_disabled_on_server()
    _test_auth_fails_when_backend_is_disabled_for_realm()