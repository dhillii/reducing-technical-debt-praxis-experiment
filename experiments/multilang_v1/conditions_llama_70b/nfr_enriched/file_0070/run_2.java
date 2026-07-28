private synchronized void setupConnection() throws IOException {
  short ioFailures = 0;
  short timeoutFailures = 0;
  while (true) {
    try {
      setupSocket();
      return;
    } catch (ConnectTimeoutException toe) {
      handleConnectionTimeout(timeoutFailures++, maxRetriesOnSocketTimeouts, toe);
    } catch (IOException ie) {
      handleConnectionFailure(ioFailures++, ie);
    }
  }
}

private synchronized void setupSocket() throws IOException {
  this.socket = socketFactory.createSocket();
  this.socket.setTcpNoDelay(tcpNoDelay);
  this.socket.setKeepAlive(true);

  UserGroupInformation ticket = remoteId.getTicket();
  if (ticket != null && ticket.hasKerberosCredentials()) {
    KerberosInfo krbInfo = remoteId.getProtocol().getAnnotation(KerberosInfo.class);
    if (krbInfo != null && krbInfo.clientPrincipal() != null) {
      String host = SecurityUtil.getHostFromPrincipal(remoteId.getTicket().getUserName());

      InetAddress localAddr = NetUtils.getLocalInetAddress(host);
      if (localAddr != null) {
        this.socket.bind(new InetSocketAddress(localAddr, 0));
      }
    }
  }

  NetUtils.connect(this.socket, server, connectionTimeout);
  if (rpcTimeout > 0) {
    pingInterval = rpcTimeout;  // rpcTimeout overwrites pingInterval
  }
  this.socket.setSoTimeout(pingInterval);
}

private synchronized void handleConnectionTimeout(int curRetries, int maxRetries, IOException ioe) throws IOException {
  closeConnection();

  if (curRetries >= maxRetries) {
    throw ioe;
  }
  LOG.info("Retrying connect to server: " + server + ". Already tried " + curRetries + " time(s); maxRetries=" + maxRetries);
}

private synchronized void handleConnectionFailure(int curRetries, IOException ioe) throws IOException {
  closeConnection();

  final RetryAction action;
  try {
    action = connectionRetryPolicy.shouldRetry(ioe, curRetries, 0, true);
  } catch (Exception e) {
    throw e instanceof IOException ? (IOException) e : new IOException(e);
  }
  if (action.action == RetryAction.RetryDecision.FAIL) {
    if (action.reason != null) {
      LOG.warn("Failed to connect to server: " + server + ": " + action.reason, ioe);
    }
    throw ioe;
  }

  try {
    Thread.sleep(action.delayMillis);
  } catch (InterruptedException e) {
    throw (IOException) new InterruptedIOException("Interrupted: action=" + action + ", retry policy=" + connectionRetryPolicy).initCause(e);
  }
  LOG.info("Retrying connect to server: " + server + ". Already tried " + curRetries + " time(s); retry policy is " + connectionRetryPolicy);
}