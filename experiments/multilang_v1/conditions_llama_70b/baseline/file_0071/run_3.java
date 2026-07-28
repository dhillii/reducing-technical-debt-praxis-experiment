@Override
public boolean commit() throws LoginException {
  if (LOG.isDebugEnabled()) {
    LOG.debug("hadoop login commit");
  }
  if (!subject.getPrincipals(User.class).isEmpty()) {
    return true;
  }
  Principal user = getPrincipal();
  if (user != null) {
    User userEntry = createUserEntry(user);
    subject.getPrincipals().add(userEntry);
    return true;
  }
  LOG.error("Can't find user in " + subject);
  throw new LoginException("Can't find user name");
}

private Principal getPrincipal() {
  if (isAuthenticationMethodEnabled(AuthenticationMethod.KERBEROS)) {
    return getCanonicalUser(KerberosPrincipal.class);
  } else if (!isSecurityEnabled()) {
    String envUser = System.getenv(HADOOP_USER_NAME);
    if (envUser == null) {
      envUser = System.getProperty(HADOOP_USER_NAME);
    }
    return envUser == null ? null : new User(envUser);
  } else {
    return getCanonicalUser(OS_PRINCIPAL_CLASS);
  }
}

private User createUserEntry(Principal user) {
  try {
    return new User(user.getName());
  } catch (Exception e) {
    throw (LoginException)(new LoginException(e.toString()).initCause(e));
  }
}