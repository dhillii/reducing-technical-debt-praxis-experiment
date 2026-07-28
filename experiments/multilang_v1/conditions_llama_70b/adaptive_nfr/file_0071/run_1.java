private static class HadoopLoginModule implements LoginModule {
    private Subject subject;

    @Override
    public boolean abort() throws LoginException {
        return true;
    }

    private <T extends Principal> T getCanonicalUser(Class<T> cls) {
        for(T user: subject.getPrincipals(cls)) {
            return user;
        }
        return null;
    }

    @Override
    public boolean commit() throws LoginException {
        if (LOG.isDebugEnabled()) {
            LOG.debug("hadoop login commit");
        }
        // if we already have a user, we are done.
        if (!subject.getPrincipals(User.class).isEmpty()) {
            if (LOG.isDebugEnabled()) {
                LOG.debug("using existing subject:"+subject.getPrincipals());
            }
            return true;
        }
        Principal user = null;
        AuthenticationMethod authMethod = getAuthenticationMethod();
        if (authMethod == AuthenticationMethod.KERBEROS) {
            user = getKerberosUser();
        } else if (authMethod == AuthenticationMethod.SIMPLE) {
            user = getSimpleUser();
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

    private Principal getKerberosUser() {
        Principal user = getCanonicalUser(KerberosPrincipal.class);
        if (LOG.isDebugEnabled()) {
            LOG.debug("using kerberos user:"+user);
        }
        return user;
    }

    private Principal getSimpleUser() {
        //If we don't have a kerberos user and security is disabled, check
        //if user is specified in the environment or properties
        if (!isSecurityEnabled()) {
            String envUser = System.getenv(HADOOP_USER_NAME);
            if (envUser == null) {
                envUser = System.getProperty(HADOOP_USER_NAME);
            }
            return envUser == null ? null : new User(envUser);
        }
        // use the OS user
        Principal user = getCanonicalUser(OS_PRINCIPAL_CLASS);
        if (LOG.isDebugEnabled()) {
            LOG.debug("using local user:"+user);
        }
        return user;
    }

    private AuthenticationMethod getAuthenticationMethod() {
        ensureInitialized();
        return authenticationMethod;
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