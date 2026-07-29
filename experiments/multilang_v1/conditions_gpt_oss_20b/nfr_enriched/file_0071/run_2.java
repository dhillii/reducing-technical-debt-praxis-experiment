@Override
  public boolean commit() throws LoginException {
    if (LOG.isDebugEnabled()) {
      LOG.debug("hadoop login commit");
    }
    // if we already have a user, we are done.
    if (!subject.getPrincipals(User.class).isEmpty()) {
      if (LOG.isDebugEnabled()) {
        LOG.debug("using existing subject:" + subject.getPrincipals());
      }
      return true;
    }
    Principal user = findUserPrincipal();
    if (user != null) {
      if (LOG.isDebugEnabled()) {
        LOG.debug("Using user: \"" + user + "\" with name " + user.getName());
      }
      User userEntry = createUserEntry(user);
      subject.getPrincipals().add(userEntry);
      return true;
    }
    LOG.error("Can't find user in " + subject);
    throw new LoginException("Can't find user name");
  }

  /**
   * Find the principal to use for the current login.
   * @return the principal or {@code null} if none could be found
   */
  private Principal findUserPrincipal() {
    // Try Kerberos first
    if (isAuthenticationMethodEnabled(AuthenticationMethod.KERBEROS)) {
      Principal p = getCanonicalUser(KerberosPrincipal.class);
      if (LOG.isDebugEnabled()) {
        LOG.debug("using kerberos user:" + p);
      }
      if (p != null) {
        return p;
      }
    }
    // If security is disabled, check environment or system properties
    if (!isSecurityEnabled()) {
      String envUser = System.getenv(HADOOP_USER_NAME);
      if (envUser == null) {
        envUser = System.getProperty(HADOOP_USER_NAME);
      }
      if (envUser != null) {
        if (LOG.isDebugEnabled()) {
          LOG.debug("using env user:" + envUser);
        }
        return new User(envUser);
      }
    }
    // Fallback to the local OS user
    Principal p = getCanonicalUser(OS_PRINCIPAL_CLASS);
    if (LOG.isDebugEnabled()) {
      LOG.debug("using local user:" + p);
    }
    return p;
  }

  /**
   * Create a {@link User} instance from the given principal.
   * @param principal the principal to convert
   * @return a {@link User} instance
   * @throws LoginException if the user name cannot be created
   */
  private User createUserEntry(Principal principal) throws LoginException {
    try {
      return new User(principal.getName());
    } catch (Exception e) {
      throw (LoginException) (new LoginException(e.toString()).initCause(e));
    }
  }