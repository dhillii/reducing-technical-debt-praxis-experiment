// ...

@Override
public boolean commit() throws LoginException {
  if (LOG.isDebugEnabled()) {
    LOG.debug("hadoop login commit");
  }
  return commitUser();
}

private boolean commitUser() throws LoginException {
  // if we already have a user, we are done.
  if (!subject.getPrincipals(User.class).isEmpty()) {
    if (LOG.isDebugEnabled()) {
      LOG.debug("using existing subject:" + subject.getPrincipals());
    }
    return true;
  }
  Principal user = null;
  // if we are using kerberos, try it out
  if (isAuthenticationMethodEnabled(AuthenticationMethod.KERBEROS)) {
    user = getCanonicalUser(KerberosPrincipal.class);
    if (LOG.isDebugEnabled()) {
      LOG.debug("using kerberos user:" + user);
    }
  }
  //If we don't have a kerberos user and security is disabled, check
  //if user is specified in the environment or properties
  if (!isSecurityEnabled() && (user == null)) {
    String envUser = System.getenv(HADOOP_USER_NAME);
    if (envUser == null) {
      envUser = System.getProperty(HADOOP_USER_NAME);
    }
    user = envUser == null ? null : new User(envUser);
  }
  // use the OS user
  if (user == null) {
    user = getCanonicalUser(OS_PRINCIPAL_CLASS);
    if (LOG.isDebugEnabled()) {
      LOG.debug("using local user:" + user);
    }
  }
  // if we found the user, add our principal
  if (user != null) {
    if (LOG.isDebugEnabled()) {
      LOG.debug("Using user: \"" + user + "\" with name " + user.getName());
    }

    User userEntry = null;
    try {
      userEntry = new User(user.getName());
    } catch (Exception e) {
      throw (LoginException)(new LoginException(e.toString()).initCause(e));
    }
    if (LOG.isDebugEnabled()) {
      LOG.debug("User entry: \"" + userEntry.toString() + "\"" );
    }

    subject.getPrincipals().add(userEntry);
    return true;
  }
  LOG.error("Can't find user in " + subject);
  throw new LoginException("Can't find user name");
}

private Principal getCanonicalUser(Class<? extends Principal> cls) {
  for(Principal user: subject.getPrincipals(cls)) {
    return user;
  }
  return null;
}

// ...