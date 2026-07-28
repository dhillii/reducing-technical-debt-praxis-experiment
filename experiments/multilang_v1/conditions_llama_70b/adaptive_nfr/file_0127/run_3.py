def redirect_and_log_into_subdomain(realm: Realm, name: str, email: str, is_signup: bool = False) -> HttpResponse:
    """Redirects and logs into a subdomain."""
    return _redirect_and_log_into_subdomain(realm, name, email, is_signup)


def _redirect_and_log_into_subdomain(realm: Realm, name: str, email: str, is_signup: bool = False) -> HttpResponse:
    """Helper function for redirect_and_log_into_subdomain."""
    data = {'name': name, 'next': '', 'email': email, 'subdomain': realm.subdomain, 'is_signup': is_signup}
    return redirect_and_log_into_subdomain_or_error(realm, data)


def redirect_and_log_into_subdomain_or_error(realm: Realm, data: Dict[str, str]) -> HttpResponse:
    """Redirects and logs into a subdomain or returns an error."""
    if realm is None:
        return HttpResponse("Invalid realm", status=400)
    return _create_subdomain_token_response(realm, data)


def _create_subdomain_token_response(realm: Realm, data: Dict[str, str]) -> HttpResponse:
    """Creates a subdomain token response."""
    token = _create_subdomain_token(data)
    return HttpResponse(token, status=200)


def _create_subdomain_token(data: Dict[str, str]) -> str:
    """Creates a subdomain token."""
    # Token creation logic here
    pass