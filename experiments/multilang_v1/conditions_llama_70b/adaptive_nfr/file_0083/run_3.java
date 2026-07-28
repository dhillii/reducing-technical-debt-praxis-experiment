// Refactored jsonParse method to avoid using generic wildcard type
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

// Refactored validateResponse method to reduce cyclomatic complexity
private static Map<String, Object> validateResponse(final HttpOpParam.Op op, final HttpURLConnection conn, boolean unwrapException) throws IOException {
    final int code = conn.getResponseCode();
    if (code == HttpURLConnection.HTTP_UNAUTHORIZED) {
        throw new AccessControlException(conn.getResponseMessage());
    }
    if (code != op.getExpectedHttpResponseCode()) {
        return handleErrorResponse(op, conn, unwrapException);
    }
    return null;
}

// Extracted handleErrorResponse method to reduce cyclomatic complexity
private static Map<String, Object> handleErrorResponse(final HttpOpParam.Op op, final HttpURLConnection conn, boolean unwrapException) throws IOException {
    final Map<String, Object> m;
    try {
        m = jsonParse(conn, true);
    } catch (Exception e) {
        throw new IOException("Unexpected HTTP response: code=" + conn.getResponseCode() + " != " + op.getExpectedHttpResponseCode() + ", " + op.toQueryString() + ", message=" + conn.getResponseMessage(), e);
    }

    if (m == null) {
        throw new IOException("Unexpected HTTP response: code=" + conn.getResponseCode() + " != " + op.getExpectedHttpResponseCode() + ", " + op.toQueryString() + ", message=" + conn.getResponseMessage());
    } else if (m.get(RemoteException.class.getSimpleName()) == null) {
        return m;
    }

    IOException re = JsonUtil.toRemoteException(m);
    if (re.getMessage() != null && re.getMessage().startsWith(SecurityUtil.FAILED_TO_GET_UGI_MSG_HEADER)) {
        String[] parts = re.getMessage().split(":\\s+", 3);
        re = new RemoteException(parts[1], parts[2]);
        re = ((RemoteException) re).unwrapRemoteException(InvalidToken.class);
    }
    throw unwrapException ? toIOException(re) : re;
}

// Refactored toIOException method to reduce cyclomatic complexity
private static IOException toIOException(Exception e) {
    if (!(e instanceof IOException)) {
        return new IOException(e);
    }

    final IOException ioe = (IOException) e;
    if (!(ioe instanceof RemoteException)) {
        return ioe;
    }

    return ((RemoteException) ioe).unwrapRemoteException();
}

// Refactored shouldRetry method to reduce cyclomatic complexity
private void shouldRetry(final IOException ioe, final int retry) throws IOException {
    InetSocketAddress nnAddr = getCurrentNNAddr();
    if (checkRetry) {
        RetryPolicy.RetryAction a = retryPolicy.shouldRetry(ioe, retry, 0, true);
        if (a.action == RetryPolicy.RetryAction.RetryDecision.RETRY || a.action == RetryPolicy.RetryAction.RetryDecision.FAILOVER_AND_RETRY) {
            handleRetry(ioe, retry, a, nnAddr);
        } else {
            throw toIOException(ioe);
        }
    } else {
        throw toIOException(ioe);
    }
}

// Extracted handleRetry method to reduce cyclomatic complexity
private void handleRetry(final IOException ioe, final int retry, RetryPolicy.RetryAction a, InetSocketAddress nnAddr) throws IOException {
    LOG.info("Retrying connect to namenode: " + nnAddr + ". Already tried " + retry + " time(s); retry policy is " + retryPolicy + ", delay " + a.delayMillis + "ms.");
    if (a.action == RetryPolicy.RetryAction.RetryDecision.FAILOVER_AND_RETRY) {
        resetStateToFailOver();
    }
    Thread.sleep(a.delayMillis);
}