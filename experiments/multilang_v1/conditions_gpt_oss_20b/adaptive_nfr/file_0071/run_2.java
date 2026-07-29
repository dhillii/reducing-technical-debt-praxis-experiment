@InterfaceAudience.Private
  public static class HadoopLoginModule implements LoginModule {
    private Subject subject;

    @Override
    public boolean abort() throws LoginException {
      return true;
    }

    private <T extends Principal> T getCanonicalUser(Class<T> cls) {
      for (T user : subject.getPrincipals(cls)) {
        return user;
      }
      return null;
    }

    @Override
    public boolean commit() throws LoginException {
      if (LOG.isDebugEnabled()) {
        LOG.debug("hadoop login commit");
      }

      if (hasExistingUser()) {
        if (LOG.isDebugEnabled()) {
          LOG.debug("using existing subject:" + subject.getPrincipals());
        }
        return true;
      }

      Principal user = getKerberosUser();
      if (LOG.isDebugEnabled()) {
        LOG.debug("using kerberos user:" + user);
      }

      if (!isSecurityEnabled() && user == null) {
        user = getEnvUser();
      }

      if (user == null) {
        user = getOsUser();
        if (LOG.isDebugEnabled()) {
          LOG.debug("using local user:" + user);
        }
      }

      if (user != null) {
        if (LOG.isDebugEnabled()) {
          LOG.debug("Using user: \"" + user + "\" with name " + user.getName());
        }
        return addUserPrincipal(user);
      }

      LOG.error("Can't find user in " + subject);
      throw new LoginException("Can't find user name");
    }

    private boolean hasExistingUser() {
      return !subject.getPrincipals(User.class).isEmpty();
    }

    private Principal getKerberosUser() {
      if (isAuthenticationMethodEnabled(AuthenticationMethod.KERBEROS)) {
        return getCanonicalUser(KerberosPrincipal.class);
      }
      return null;
    }

    private Principal getEnvUser() {
      String envUser = System.getenv(HADOOP_USER_NAME);
      if (envUser == null) {
        envUser = System.getProperty(HADOOP_USER_NAME);
      }
      return envUser == null ? null : new User(envUser);
    }

    private Principal getOsUser() {
      return getCanonicalUser(OS_PRINCIPAL_CLASS);
    }

    private boolean addUserPrincipal(Principal user) throws LoginException {
      User userEntry;
      try {
        userEntry = new User(user.getName());
      } catch (Exception e) {
        throw (LoginException) (new LoginException(e.toString()).initCause(e));
      }
      if (LOG.isDebugEnabled()) {
        LOG.debug("User entry: \"" + userEntry.toString() + "\"");
      }
      subject.getPrincipals().add(userEntry);
      return true;
    }

    @Override
    public void initialize(Subject subject, CallbackHandler callbackHandler,
                           Map<String, ?> sharedState, Map<String, ?> options) {
      this.subject = subject;
    }

    @Override
    public boolean login() throws LoginException {
      if (LOG.isDebugEnabled()) {
        LOG.debug("hadoop login");
      }
      return true;
    }

    @Override
    public boolean logout() throws LoginException {
      if (LOG.isDebugEnabled()) {
        LOG.debug("hadoop logout");
      }
      return true;
    }
  }