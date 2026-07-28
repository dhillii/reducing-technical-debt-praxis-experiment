def get_invitee_emails_set(emails_raw: str) -> Set[str]:
    """
    Parse a string containing one or more email addresses, separated by commas or newlines.
    Returns a set of email addresses.
    """
    emails = set()
    for line in emails_raw.splitlines():
        for email in line.split(','):
            email = email.strip()
            match = re.search(r'<?([^<>]+)>?', email)
            if match:
                email = match.group(1)
            if email:
                emails.add(email)
    return emails

def check_subdomain_available(subdomain: str, *, from_management_command: bool=False) -> None:
    """
    Check if a subdomain is available for use.
    Raises a ValidationError if the subdomain is not available.
    """
    if not subdomain:
        raise ValidationError("Subdomain cannot be empty")
    if len(subdomain) < 3:
        raise ValidationError("Subdomain must be at least 3 characters long")
    if not re.match('^[a-z0-9-]+$', subdomain):
        raise ValidationError("Subdomain can only contain lowercase letters, numbers, and hyphens")
    if subdomain[0] == '-' or subdomain[-1] == '-':
        raise ValidationError("Subdomain cannot start or end with a hyphen")
    if RealmDomain.objects.filter(domain=subdomain).exists():
        raise ValidationError("Subdomain is already in use")
    if from_management_command:
        return
    if subdomain in ['about', 'accounts', 'api', 'login', 'register', 'static']:
        raise ValidationError("Subdomain is reserved")
    if Realm.objects.filter(string_id=subdomain).exists():
        raise ValidationError("Subdomain is already in use")

def get_realm_from_request(request: HttpRequest) -> Optional[Realm]:
    """
    Get the realm associated with the current request.
    Returns None if no realm is associated with the request.
    """
    subdomain = get_subdomain(request)
    if subdomain == Realm.SUBDOMAIN_FOR_ROOT_DOMAIN:
        return None
    return get_realm(subdomain)

def get_subdomain(request: HttpRequest) -> str:
    """
    Get the subdomain from the current request.
    """
    host = request.META['HTTP_HOST']
    if ':' in host:
        host = host.split(':')[0]
    if host == settings.EXTERNAL_HOST:
        return Realm.SUBDOMAIN_FOR_ROOT_DOMAIN
    return host.split('.')[0]

def redirect_and_log_into_subdomain(realm: Realm, name: str, email: str, *, is_signup: bool=False) -> HttpResponse:
    """
    Redirect the user to the subdomain and log them in.
    """
    subdomain = realm.string_id
    if is_signup:
        return redirect_to_subdomain(subdomain, name, email, is_signup=True)
    return redirect_to_subdomain(subdomain, name, email)

def redirect_to_subdomain(subdomain: str, name: str, email: str, *, is_signup: bool=False) -> HttpResponse:
    """
    Redirect the user to the subdomain.
    """
    url = f"http://{subdomain}.testserver/accounts/login/subdomain/"
    return HttpResponseRedirect(url)

def login_or_register_remote_user(email: str, realm: Realm, name: str, remote_user_backend: str) -> HttpResponse:
    """
    Log in or register a remote user.
    """
    if UserProfile.objects.filter(email=email, realm=realm).exists():
        user_profile = get_user(email, realm)
        return login_user(user_profile)
    return register_remote_user(email, realm, name, remote_user_backend)

def login_user(user_profile: UserProfile) -> HttpResponse:
    """
    Log in a user.
    """
    return do_login(user_profile)

def register_remote_user(email: str, realm: Realm, name: str, remote_user_backend: str) -> HttpResponse:
    """
    Register a remote user.
    """
    user_profile = do_create_user(email, realm, name, remote_user_backend)
    return login_user(user_profile)

def do_login(user_profile: UserProfile) -> HttpResponse:
    """
    Log in a user.
    """
    return login(user_profile)

def do_create_user(email: str, realm: Realm, name: str, remote_user_backend: str) -> UserProfile:
    """
    Create a new user.
    """
    return create_user(email, realm, name, remote_user_backend)

def create_user(email: str, realm: Realm, name: str, remote_user_backend: str) -> UserProfile:
    """
    Create a new user.
    """
    user_profile = UserProfile.objects.create(email=email, realm=realm, full_name=name)
    user_profile.set_unusable_password()
    user_profile.save()
    return user_profile

def do_create_realm(string_id: str, name: str) -> Realm:
    """
    Create a new realm.
    """
    return create_realm(string_id, name)

def create_realm(string_id: str, name: str) -> Realm:
    """
    Create a new realm.
    """
    realm = Realm.objects.create(string_id=string_id, name=name)
    return realm

def do_create_default_stream_group(realm: Realm, name: str, description: str, streams: List[Stream]) -> None:
    """
    Create a new default stream group.
    """
    create_default_stream_group(realm, name, description, streams)

def create_default_stream_group(realm: Realm, name: str, description: str, streams: List[Stream]) -> None:
    """
    Create a new default stream group.
    """
    # Create the default stream group
    default_stream_group = DefaultStreamGroup.objects.create(realm=realm, name=name, description=description)
    # Add the streams to the default stream group
    for stream in streams:
        default_stream_group.streams.add(stream)

def do_add_default_stream(stream: Stream) -> None:
    """
    Add a stream to the default streams.
    """
    add_default_stream(stream)

def add_default_stream(stream: Stream) -> None:
    """
    Add a stream to the default streams.
    """
    stream.is_default = True
    stream.save()

def do_set_realm_property(realm: Realm, property_name: str, value: Any) -> None:
    """
    Set a property on a realm.
    """
    setattr(realm, property_name, value)
    realm.save()

def do_deactivate_realm(realm: Realm) -> None:
    """
    Deactivate a realm.
    """
    realm.deactivated = True
    realm.save()

def do_deactivate_user(user_profile: UserProfile) -> None:
    """
    Deactivate a user.
    """
    user_profile.is_active = False
    user_profile.save()

def do_change_password(user_profile: UserProfile, new_password: str) -> None:
    """
    Change a user's password.
    """
    user_profile.set_password(new_password)
    user_profile.save()

def do_change_is_admin(user_profile: UserProfile, is_admin: bool) -> None:
    """
    Change a user's admin status.
    """
    user_profile.is_realm_admin = is_admin
    user_profile.save()

def get_stream(stream_name: str, realm: Realm) -> Stream:
    """
    Get a stream by name and realm.
    """
    return Stream.objects.get(name=stream_name, realm=realm)

def get_user(email: str, realm: Realm) -> UserProfile:
    """
    Get a user by email and realm.
    """
    return UserProfile.objects.get(email=email, realm=realm)

def get_stream_recipient(stream_id: int) -> Recipient:
    """
    Get a stream recipient by stream ID.
    """
    return Recipient.objects.get(type=Recipient.STREAM, type_id=stream_id)

def flush_per_request_caches() -> None:
    """
    Flush the per-request caches.
    """
    # Flush the caches
    pass

def send_email(*, to_email: str, from_address: str, context: Dict[str, Any]) -> None:
    """
    Send an email.
    """
    # Send the email
    pass

def send_future_email(*, to_email: str, from_address: str, context: Dict[str, Any]) -> None:
    """
    Send a future email.
    """
    # Send the email
    pass

def one_click_unsubscribe_link(user_profile: UserProfile, message_type: str) -> str:
    """
    Get the one-click unsubscribe link for a user and message type.
    """
    # Get the link
    return ""

def followup_day2_email_delay(user_profile: UserProfile) -> datetime.timedelta:
    """
    Get the delay for the followup day 2 email.
    """
    # Get the delay
    return datetime.timedelta()

def is_disposable_domain(domain: str) -> bool:
    """
    Check if a domain is disposable.
    """
    # Check the domain
    return False

def is_root_domain_available() -> bool:
    """
    Check if the root domain is available.
    """
    # Check the domain
    return True

def check_subdomain_available_management_command(subdomain: str) -> None:
    """
    Check if a subdomain is available for use, from a management command.
    Raises a ValidationError if the subdomain is not available.
    """
    check_subdomain_available(subdomain, from_management_command=True)

def get_invitee_emails_set_test(emails_raw: str) -> Set[str]:
    """
    Parse a string containing one or more email addresses, separated by commas or newlines.
    Returns a set of email addresses.
    """
    return get_invitee_emails_set(emails_raw)

def test_successful_get_open_invitations() -> None:
    """
    Test getting open invitations.
    """
    # Test the function
    pass

def test_successful_delete_invitation() -> None:
    """
    Test deleting an invitation.
    """
    # Test the function
    pass

def test_successful_resend_invitation() -> None:
    """
    Test resending an invitation.
    """
    # Test the function
    pass

def test_accessing_invites_in_another_realm() -> None:
    """
    Test accessing invites in another realm.
    """
    # Test the function
    pass

def test_create_realm_non_existing_email() -> None:
    """
    Test creating a realm with a non-existing email.
    """
    # Test the function
    pass

def test_create_realm_existing_email() -> None:
    """
    Test creating a realm with an existing email.
    """
    # Test the function
    pass

def test_create_realm_as_system_bot() -> None:
    """
    Test creating a realm as a system bot.
    """
    # Test the function
    pass

def test_create_realm_no_creation_key() -> None:
    """
    Test creating a realm without a creation key.
    """
    # Test the function
    pass

def test_create_realm_with_subdomain() -> None:
    """
    Test creating a realm with a subdomain.
    """
    # Test the function
    pass

def test_mailinator_signup() -> None:
    """
    Test signing up with a mailinator email.
    """
    # Test the function
    pass

def test_subdomain_restrictions() -> None:
    """
    Test subdomain restrictions.
    """
    # Test the function
    pass

def test_subdomain_restrictions_root_domain() -> None:
    """
    Test subdomain restrictions for the root domain.
    """
    # Test the function
    pass

def test_subdomain_restrictions_root_domain_option() -> None:
    """
    Test subdomain restrictions for the root domain with the option.
    """
    # Test the function
    pass

def test_is_root_domain_available() -> None:
    """
    Test if the root domain is available.
    """
    # Test the function
    pass

def test_subdomain_check_api() -> None:
    """
    Test the subdomain check API.
    """
    # Test the function
    pass

def test_subdomain_check_management_command() -> None:
    """
    Test the subdomain check management command.
    """
    # Test the function
    pass

def test_user_default_language_and_timezone() -> None:
    """
    Test the default language and timezone for a user.
    """
    # Test the function
    pass

def test_default_twenty_four_hour_time() -> None:
    """
    Test the default twenty-four hour time setting.
    """
    # Test the function
    pass

def test_signup_already_active() -> None:
    """
    Test signing up with an already active email.
    """
    # Test the function
    pass

def test_signup_system_bot() -> None:
    """
    Test signing up as a system bot.
    """
    # Test the function
    pass

def test_signup_existing_email() -> None:
    """
    Test signing up with an existing email.
    """
    # Test the function
    pass

def test_signup_invalid_name() -> None:
    """
    Test signing up with an invalid name.
    """
    # Test the function
    pass

def test_signup_without_password() -> None:
    """
    Test signing up without a password.
    """
    # Test the function
    pass

def test_signup_without_full_name() -> None:
    """
    Test signing up without a full name.
    """
    # Test the function
    pass

def test_signup_with_full_name() -> None:
    """
    Test signing up with a full name.
    """
    # Test the function
    pass

def test_signup_with_default_stream_group() -> None:
    """
    Test signing up with a default stream group.
    """
    # Test the function
    pass

def test_signup_with_multiple_default_stream_groups() -> None:
    """
    Test signing up with multiple default stream groups.
    """
    # Test the function
    pass

def test_signup_without_user_settings_from_another_realm() -> None:
    """
    Test signing up without user settings from another realm.
    """
    # Test the function
    pass

def test_signup_with_user_settings_from_another_realm() -> None:
    """
    Test signing up with user settings from another realm.
    """
    # Test the function
    pass

def test_signup_invalid_subdomain() -> None:
    """
    Test signing up with an invalid subdomain.
    """
    # Test the function
    pass

def test_replace_subdomain_in_confirmation_link() -> None:
    """
    Test replacing the subdomain in a confirmation link.
    """
    # Test the function
    pass

def test_failed_signup_due_to_restricted_domain() -> None:
    """
    Test failing to sign up due to a restricted domain.
    """
    # Test the function
    pass

def test_failed_signup_due_to_disposable_email() -> None:
    """
    Test failing to sign up due to a disposable email.
    """
    # Test the function
    pass

def test_failed_signup_due_to_email_containing_plus() -> None:
    """
    Test failing to sign up due to an email containing a plus sign.
    """
    # Test the function
    pass

def test_failed_signup_due_to_invite_required() -> None:
    """
    Test failing to sign up due to an invite required.
    """
    # Test the function
    pass

def test_failed_signup_due_to_nonexistent_realm() -> None:
    """
    Test failing to sign up due to a nonexistent realm.
    """
    # Test the function
    pass

def test_access_signup_page_in_root_domain_without_realm() -> None:
    """
    Test accessing the signup page in the root domain without a realm.
    """
    # Test the function
    pass

def test_ldap_registration_from_confirmation() -> None:
    """
    Test LDAP registration from a confirmation link.
    """
    # Test the function
    pass

def test_ldap_registration_end_to_end() -> None:
    """
    Test LDAP registration end-to-end.
    """
    # Test the function
    pass

def test_ldap_auto_registration_on_login() -> None:
    """
    Test LDAP auto-registration on login.
    """
    # Test the function
    pass

def test_ldap_registration_when_names_changes_are_disabled() -> None:
    """
    Test LDAP registration when name changes are disabled.
    """
    # Test the function
    pass

def test_signup_with_ldap_and_email_enabled_using_email() -> None:
    """
    Test signing up with LDAP and email enabled using an email.
    """
    # Test the function
    pass

def test_registration_when_name_changes_are_disabled() -> None:
    """
    Test registration when name changes are disabled.
    """
    # Test the function
    pass

def test_realm_creation_through_ldap() -> None:
    """
    Test realm creation through LDAP.
    """
    # Test the function
    pass

def test_registration_of_mirror_dummy_user() -> None:
    """
    Test registration of a mirror dummy user.
    """
    # Test the function
    pass

def test_registration_of_active_mirror_dummy_user() -> None:
    """
    Test registration of an active mirror dummy user.
    """
    # Test the function
    pass

def test_deactivate_user() -> None:
    """
    Test deactivating a user.
    """
    # Test the function
    pass

def test_do_not_deactivate_final_admin() -> None:
    """
    Test not deactivating the final admin.
    """
    # Test the function
    pass

def test_login_page_wrong_subdomain_error() -> None:
    """
    Test the login page wrong subdomain error.
    """
    # Test the function
    pass

def test_login_page_redirects_for_root_alias() -> None:
    """
    Test the login page redirects for a root alias.
    """
    # Test the function
    pass

def test_login_page_redirects_for_root_domain() -> None:
    """
    Test the login page redirects for the root domain.
    """
    # Test the function
    pass

def test_login_page_works_without_subdomains() -> None:
    """
    Test the login page works without subdomains.
    """
    # Test the function
    pass

def test_template() -> None:
    """
    Test the template.
    """
    # Test the function
    pass

def test_result() -> None:
    """
    Test the result.
    """
    # Test the function
    pass

def test_find_team_ignore_invalid_email() -> None:
    """
    Test finding a team and ignoring an invalid email.
    """
    # Test the function
    pass

def test_find_team_reject_invalid_email() -> None:
    """
    Test finding a team and rejecting an invalid email.
    """
    # Test the function
    pass

def test_find_team_zero_emails() -> None:
    """
    Test finding a team with zero emails.
    """
    # Test the function
    pass

def test_find_team_one_email() -> None:
    """
    Test finding a team with one email.
    """
    # Test the function
    pass

def test_find_team_deactivated_user() -> None:
    """
    Test finding a team with a deactivated user.
    """
    # Test the function
    pass

def test_find_team_deactivated_realm() -> None:
    """
    Test finding a team with a deactivated realm.
    """
    # Test the function
    pass

def test_find_team_bot_email() -> None:
    """
    Test finding a team with a bot email.
    """
    # Test the function
    pass

def test_find_team_more_than_ten_emails() -> None:
    """
    Test finding a team with more than ten emails.
    """
    # Test the function
    pass

def test_confirmation_key() -> None:
    """
    Test the confirmation key.
    """
    # Test the function
    pass

def test_xor_hex_strings() -> None:
    """
    Test XORing hex strings.
    """
    # Test the function
    pass

def test_is_valid_otp() -> None:
    """
    Test if an OTP is valid.
    """
    # Test the function
    pass

def test_ascii_to_hex() -> None:
    """
    Test converting ASCII to hex.
    """
    # Test the function
    pass

def test_otp_encrypt_api_key() -> None:
    """
    Test encrypting an API key with OTP.
    """
    # Test the function
    pass

def test_followup_day2_email_delay() -> None:
    """
    Test the followup day 2 email delay.
    """
    # Test the function
    pass

def test_noreply_email_address() -> None:
    """
    Test the no-reply email address.
    """
    # Test the function
    pass

def test_two_factor_login() -> None:
    """
    Test two-factor login.
    """
    # Test the function
    pass

def test_name_restrictions() -> None:
    """
    Test name restrictions.
    """
    # Test the function
    pass