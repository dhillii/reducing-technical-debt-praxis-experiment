def get_invitee_emails_set(emails_raw: str) -> Set[str]:
    """
    Parse a string of emails and return a set of email addresses.
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

def check_subdomain_available(subdomain: str, from_management_command: bool=False) -> None:
    """
    Check if a subdomain is available.
    """
    if not subdomain:
        raise ValidationError("Subdomain cannot be empty")
    if len(subdomain) < 3:
        raise ValidationError("Subdomain must be at least 3 characters long")
    if not re.match('^[a-z0-9-]+$', subdomain):
        raise ValidationError("Subdomain can only contain lowercase letters, numbers, and hyphens")
    if subdomain.startswith('-') or subdomain.endswith('-'):
        raise ValidationError("Subdomain cannot start or end with a hyphen")
    if Realm.objects.filter(string_id=subdomain).exists():
        raise ValidationError("Subdomain is already taken")
    if from_management_command:
        return
    if subdomain in ['about', 'accounts', 'login', 'register', 'forgot', 'reset', 'confirm', 'invite', 'join']:
        raise ValidationError("Subdomain is reserved")
    if subdomain in ['stream', 'streams', 'topic', 'topics', 'message', 'messages', 'user', 'users', 'realm', 'realms']:
        raise ValidationError("Subdomain is reserved")

def is_root_domain_available() -> bool:
    """
    Check if the root domain is available.
    """
    if Realm.objects.filter(string_id=Realm.SUBDOMAIN_FOR_ROOT_DOMAIN).exists():
        return False
    if settings.ROOT_DOMAIN_LANDING_PAGE:
        return False
    return True

def get_realm_from_request(request: HttpRequest) -> Optional[Realm]:
    """
    Get the realm from a request.
    """
    subdomain = get_subdomain(request)
    if subdomain == Realm.SUBDOMAIN_FOR_ROOT_DOMAIN:
        return None
    return get_realm(subdomain)

def get_subdomain(request: HttpRequest) -> str:
    """
    Get the subdomain from a request.
    """
    host = request.META['HTTP_HOST']
    if host == settings.EXTERNAL_HOST:
        return Realm.SUBDOMAIN_FOR_ROOT_DOMAIN
    return host.split('.')[0]

def get_invitee_emails(emails_raw: str) -> List[str]:
    """
    Parse a string of emails and return a list of email addresses.
    """
    return list(get_invitee_emails_set(emails_raw))

def get_object_from_key(key: str, type: int) -> Any:
    """
    Get an object from a confirmation key.
    """
    try:
        confirmation = Confirmation.objects.get(confirmation_key=key, type=type)
        return confirmation.content_object
    except Confirmation.DoesNotExist:
        raise ConfirmationKeyException(ConfirmationKeyException.DOES_NOT_EXIST)

def create_confirmation_link(obj: Any, host: str, type: int) -> str:
    """
    Create a confirmation link.
    """
    key = generate_key()
    Confirmation.objects.create(content_object=obj, date_sent=timezone_now(), confirmation_key=key, type=type)
    return confirmation_url(key, host, type)

def confirmation_url(key: str, host: str, type: int) -> str:
    """
    Get the confirmation URL.
    """
    return f"{settings.EXTERNAL_HOST}/{type}/{key}"

def generate_key() -> str:
    """
    Generate a random key.
    """
    return secrets.token_urlsafe(32)

def send_confirm_registration_email(realm: Realm, to_email: str) -> None:
    """
    Send a confirmation email.
    """
    context = {'realm': realm, 'to_email': to_email}
    send_email('zerver/emails/confirm_registration', to_email, context)

def send_future_email(template_name: str, realm: Realm, to_email: str=None, to_user_id: int=None, context: Dict[str, Any]={}) -> None:
    """
    Send a future email.
    """
    if to_email:
        context['to_email'] = to_email
    if to_user_id:
        context['to_user_id'] = to_user_id
    context['realm'] = realm
    ScheduledEmail.objects.create(
        type=ScheduledEmail.CONFIRM_REGISTRATION,
        scheduled_timestamp=timezone_now() + datetime.timedelta(days=1),
        data=ujson.dumps(context).encode('utf-8')
    )

def one_click_unsubscribe_link(user_profile: UserProfile, type: str) -> str:
    """
    Get the one-click unsubscribe link.
    """
    key = generate_key()
    Confirmation.objects.create(content_object=user_profile, date_sent=timezone_now(), confirmation_key=key, type=type)
    return f"{settings.EXTERNAL_HOST}/accounts/unsubscribe/{type}/{key}"

def followup_day2_email_delay(user_profile: UserProfile) -> datetime.timedelta:
    """
    Get the delay for the followup day 2 email.
    """
    date_joined = user_profile.date_joined
    if date_joined.weekday() in [5, 6]:  # Saturday or Sunday
        return datetime.timedelta(days=2, hours=-1)
    else:
        return datetime.timedelta(days=1, hours=-1)

def xor_hex_strings(hex_string1: str, hex_string2: str) -> str:
    """
    XOR two hex strings.
    """
    if len(hex_string1) != len(hex_string2):
        raise AssertionError("Hex strings must be the same length")
    result = []
    for i in range(len(hex_string1)):
        result.append(hex(int(hex_string1[i], 16) ^ int(hex_string2[i], 16))[2:])
    return ''.join(result)

def is_valid_otp(otp: str) -> bool:
    """
    Check if an OTP is valid.
    """
    return bool(re.match('^[0-9a-fA-F]{32}$', otp))

def ascii_to_hex(ascii_string: str) -> str:
    """
    Convert an ASCII string to a hex string.
    """
    return ''.join(format(ord(c), '02x') for c in ascii_string)

def hex_to_ascii(hex_string: str) -> str:
    """
    Convert a hex string to an ASCII string.
    """
    return ''.join(chr(int(hex_string[i*2:i*2+2], 16)) for i in range(len(hex_string)//2))

def otp_encrypt_api_key(api_key: str, otp: str) -> str:
    """
    Encrypt an API key with an OTP.
    """
    return xor_hex_strings(api_key, otp)

def otp_decrypt_api_key(encrypted_api_key: str, otp: str) -> str:
    """
    Decrypt an API key with an OTP.
    """
    return xor_hex_strings(encrypted_api_key, otp)