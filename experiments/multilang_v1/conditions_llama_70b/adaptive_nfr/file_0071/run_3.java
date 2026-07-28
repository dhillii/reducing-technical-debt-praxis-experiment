private static class HadoopLoginModule implements LoginModule {
    // ...

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
        Principal user = null;
        AuthenticationMethod authMethod = getAuthenticationMethod();
        if (authMethod == AuthenticationMethod.KERBEROS) {
            user = getKerberosUser();
        } else if (authMethod == AuthenticationMethod.SIMPLE) {
            user = getSimpleUser();
        } else {
            LOG.error("Unsupported authentication method: " + authMethod);
            throw new LoginException("Unsupported authentication method: " + authMethod);
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
                throw (LoginException) (new LoginException(e.toString()).initCause(e));
            }
            if (LOG.isDebugEnabled()) {
                LOG.debug("User entry: \"" + userEntry.toString() + "\"");
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
            LOG.debug("using kerberos user:" + user);
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
            LOG.debug("using local user:" + user);
        }
        return user;
    }

    // ...
}