private synchronized void setupConnection() throws IOException {
  short ioFailures = 0;
  short timeoutFailures = 0;
  while (true) {
    try {
      Socket s = socketFactory.createSocket();
      configureSocket(s);
      bindIfKerberos(s);
      connectSocket(s);
      this.socket = s;
      return;
    } catch (ConnectTimeoutException toe) {
      if (updateAddress()) {
        timeoutFailures = ioFailures = 0;
      }
      handleConnectionTimeout(timeoutFailures++, maxRetriesOnSocketTimeouts, toe);
    } catch (IOException ie) {
      if (updateAddress()) {
        timeoutFailures = ioFailures = 0;
      }
      handleConnectionFailure(ioFailures++, ie);
    }
  }
}

private void configureSocket(Socket s) throws IOException {
  s.setTcpNoDelay(tcpNoDelay);
  s.setKeepAlive(true);
}

private void bindIfKerberos(Socket s) throws IOException {
  UserGroupInformation ticket = remoteId.getTicket();
  if (ticket != null && ticket.hasKerberosCredentials()) {
    KerberosInfo krbInfo = remoteId.getProtocol().getAnnotation(KerberosInfo.class);
    if (krbInfo != null && krbInfo.clientPrincipal() != null) {
      String host = SecurityUtil.getHostFromPrincipal(remoteId.getTicket().getUserName());
      InetAddress localAddr = NetUtils.getLocalInetAddress(host);
      if (localAddr != null) {
        s.bind(new InetSocketAddress(localAddr, 0));
      }
    }
  }
}

private void connectSocket(Socket s) throws IOException {
  NetUtils.connect(s, server, connectionTimeout);
  if (rpcTimeout > 0) {
    pingInterval = rpcTimeout;
  }
  s.setSoTimeout(pingInterval);
}