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
            user = getOSUser();
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
        return getCanonicalUser(KerberosPrincipal.class);
    }

    private Principal getSimpleUser() {
        String envUser = System.getenv(HADOOP_USER_NAME);
        if (envUser == null) {
            envUser = System.getProperty(HADOOP_USER_NAME);
        }
        return envUser == null ? null : new User(envUser);
    }

    private Principal getOSUser() {
        return getCanonicalUser(OS_PRINCIPAL_CLASS);
    }

    // ...
}