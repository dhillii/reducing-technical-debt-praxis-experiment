// ...

static Map<String, Object> jsonParse(final HttpURLConnection c, final boolean useErrorStream) throws IOException {
    if (c.getContentLength() == 0) {
        return null;
    }
    final InputStream in = useErrorStream ? c.getErrorStream() : c.getInputStream();
    if (in == null) {
        throw new IOException("The " + (useErrorStream ? "error" : "input") + " stream is null.");
    }
    try {
        final String contentType = c.getContentType();
        if (contentType != null) {
            final MediaType parsed = MediaType.valueOf(contentType);
            if (!MediaType.APPLICATION_JSON_TYPE.isCompatible(parsed)) {
                throw new IOException("Content-Type \"" + contentType + "\" is incompatible with \"" + MediaType.APPLICATION_JSON + "\" (parsed=\"" + parsed + "\")");
            }
        }
        ObjectMapper mapper = new ObjectMapper();
        return mapper.reader(Map.class).readValue(in);
    } finally {
        in.close();
    }
}

// ...

private static Map<String, Object> validateResponse(final HttpOpParam.Op op, final HttpURLConnection conn, boolean unwrapException) throws IOException {
    final int code = conn.getResponseCode();
    // server is demanding an authentication we don't support
    if (code == HttpURLConnection.HTTP_UNAUTHORIZED) {
        // match hdfs/rpc exception
        throw new AccessControlException(conn.getResponseMessage());
    }
    if (code != op.getExpectedHttpResponseCode()) {
        final Map<String, Object> m;
        try {
            m = jsonParse(conn, true);
        } catch (Exception e) {
            throw new IOException("Unexpected HTTP response: code=" + code + " != " + op.getExpectedHttpResponseCode() + ", " + op.toQueryString() + ", message=" + conn.getResponseMessage(), e);
        }

        if (m == null) {
            throw new IOException("Unexpected HTTP response: code=" + code + " != " + op.getExpectedHttpResponseCode() + ", " + op.toQueryString() + ", message=" + conn.getResponseMessage());
        } else if (m.get(RemoteException.class.getSimpleName()) == null) {
            return m;
        }

        IOException re = JsonUtil.toRemoteException(m);
        // extract UGI-related exceptions and unwrap InvalidToken
        // the NN mangles these exceptions but the DN does not and may need
        // to re-fetch a token if either report the token is expired
        if (re.getMessage() != null && re.getMessage().startsWith(SecurityUtil.FAILED_TO_GET_UGI_MSG_HEADER)) {
            String[] parts = re.getMessage().split(":\\s+", 3);
            re = new RemoteException(parts[1], parts[2]);
            re = ((RemoteException) re).unwrapRemoteException(InvalidToken.class);
        }
        throw unwrapException ? toIOException(re) : re;
    }
    return null;
}

// ...

private Param<String, Object>[] getAuthParameters(final HttpOpParam.Op op) throws IOException {
    List<Param<String, Object>> authParams = Lists.newArrayList();
    // Skip adding delegation token for token operations because these
    // operations require authentication.
    Token<?> token = null;
    if (!op.getRequireAuth()) {
        token = getDelegationToken();
    }
    if (token != null) {
        authParams.add(new DelegationParam(token.encodeToUrlString()));
    } else {
        UserGroupInformation userUgi = ugi;
        UserGroupInformation realUgi = userUgi.getRealUser();
        if (realUgi != null) { // proxy user
            authParams.add(new DoAsParam(userUgi.getShortUserName()));
            userUgi = realUgi;
        }
        authParams.add(new UserParam(userUgi.getShortUserName()));
    }
    return authParams.toArray(new Param<String, Object>[0]);
}

// ...