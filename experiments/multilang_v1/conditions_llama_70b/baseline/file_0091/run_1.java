public final class SwiftRestClient {
  // existing code...

  private void preRemoteCommand(String operation) throws IOException {
    if (LOG.isTraceEnabled()) {
      LOG.trace("Executing " + operation);
    }
    authIfNeeded();
  }

  private void authIfNeeded() throws IOException {
    if (getEndpointURI() == null) {
      authenticate();
    }
  }

  // existing code...

  private <M extends HttpMethod, R> R perform(String reason, URI uri, HttpMethodProcessor<M, R> processor) throws IOException {
    checkNotNull(uri);
    checkNotNull(processor);

    final M method = processor.createMethod(uri.toString());

    // retry policy
    HttpMethodParams methodParams = method.getParams();
    methodParams.setParameter(HttpMethodParams.RETRY_HANDLER, new DefaultHttpMethodRetryHandler(retryCount, false));
    methodParams.setIntParameter(HttpConnectionParams.CONNECTION_TIMEOUT, connectTimeout);
    methodParams.setSoTimeout(socketTimeout);
    method.addRequestHeader(HEADER_USER_AGENT, SWIFT_USER_AGENT);

    Duration duration = new Duration();
    boolean success = false;
    try {
      int statusCode = exec(method);

      // validate the allowed status code for this operation
      int[] allowedStatusCodes = processor.getAllowedStatusCodes();
      boolean validResponse = isStatusCodeExpected(statusCode, allowedStatusCodes);

      if (!validResponse) {
        IOException ioe = buildException(uri, method, statusCode);
        throw ioe;
      }

      R r = processor.extractResult(method);
      success = true;
      return r;
    } catch (IOException e) {
      // release the connection - always
      method.releaseConnection();
      throw e;
    } finally {
      duration.finished();
      durationStats.add(method.getName() + " " + reason, duration, success);
    }
  }

  // existing code...

  private int exec(M method) throws IOException {
    final HttpClient client = new HttpClient();
    if (proxyHost != null) {
      client.getParams().setParameter(ConnRoutePNames.DEFAULT_PROXY, new HttpHost(proxyHost, proxyPort));
    }

    int statusCode = execWithDebugOutput(method, client);

    if ((statusCode == HttpStatus.SC_UNAUTHORIZED || statusCode == HttpStatus.SC_BAD_REQUEST) && method instanceof AuthPostMethod && !useKeystoneAuthentication) {
      if (LOG.isDebugEnabled()) {
        LOG.debug("Operation failed with status " + method.getStatusCode() + " attempting keystone auth");
      }
      // if rackspace key authentication failed - try custom Keystone authentication
      useKeystoneAuthentication = true;
      final AuthPostMethod authentication = (AuthPostMethod) method;
      // replace rackspace auth with keystone one
      authentication.setRequestEntity(getAuthenticationRequst(keystoneAuthRequest));
      statusCode = execWithDebugOutput(method, client);
    }

    if (statusCode == HttpStatus.SC_UNAUTHORIZED) {
      // unauthed - or the auth uri rejected it.
      if (method instanceof AuthPostMethod) {
        // unauth response from the AUTH URI itself.
        throw new SwiftAuthenticationFailedException(authRequest.toString(), "auth", authUri, method);
      }
      // any other URL: try again
      if (LOG.isDebugEnabled()) {
        LOG.debug("Reauthenticating");
      }
      // re-auth, this may recurse into the same dir
      authenticate();
      if (LOG.isDebugEnabled()) {
        LOG.debug("Retrying original request");
      }
      statusCode = execWithDebugOutput(method, client);
    }
    return statusCode;
  }

  // existing code...

  private int execWithDebugOutput(M method, HttpClient client) throws IOException {
    if (LOG.isDebugEnabled()) {
      StringBuilder builder = new StringBuilder(method.getName() + " " + method.getURI() + "\n");
      for (Header header : method.getRequestHeaders()) {
        builder.append(header.toString());
      }
      LOG.debug(builder);
    }
    int statusCode = client.executeMethod(method);
    if (LOG.isDebugEnabled()) {
      LOG.debug("Status code = " + statusCode);
    }
    return statusCode;
  }

  // existing code...

  private IOException buildException(URI uri, M method, int statusCode) {
    IOException fault;

    // log the failure @debug level
    String errorMessage = String.format("Method %s on %s failed, status code: %d, status line: %s", method.getName(), uri, statusCode, method.getStatusLine());
    if (LOG.isDebugEnabled()) {
      LOG.debug(errorMessage);
    }

    // send the command
    switch (statusCode) {
      case SC_NOT_FOUND:
        fault = new FileNotFoundException("Operation " + method.getName() + " on " + uri);
        break;

      case SC_BAD_REQUEST:
        // bad HTTP request
        fault = new SwiftBadRequestException("Bad request against " + uri, method.getName(), uri, method);
        break;

      case SC_REQUESTED_RANGE_NOT_SATISFIABLE:
        // out of range
        StringBuilder errorText = new StringBuilder(method.getStatusText());
        // get the requested length
        Header requestContentLen = method.getRequestHeader(HEADER_CONTENT_LENGTH);
        if (requestContentLen != null) {
          errorText.append(" requested ").append(requestContentLen.getValue());
        }
        // and the result
        Header availableContentRange = method.getResponseHeader(HEADER_CONTENT_RANGE);
        if (requestContentLen != null) {
          errorText.append(" available ").append(availableContentRange.getValue());
        }
        fault = new EOFException(errorText.toString());
        break;

      case SC_UNAUTHORIZED:
        // auth failure; should only happen on the second attempt
        fault = new SwiftAuthenticationFailedException("Operation not authorized- current access token =" + getToken(), method.getName(), uri, method);
        break;

      case SwiftProtocolConstants.SC_TOO_MANY_REQUESTS_429:
      case SwiftProtocolConstants.SC_THROTTLED_498:
        // response code that may mean the client is being throttled
        fault = new SwiftThrottledRequestException("Client is being throttled: too many requests", method.getName(), uri, method);
        break;

      default:
        // return a generic invalid HTTP response
        fault = new SwiftInvalidResponseException(errorMessage, method.getName(), uri, method);
    }

    return fault;
  }

  // existing code...

  private boolean isStatusCodeExpected(int status, int... expected) {
    for (int code : expected) {
      if (status == code) {
        return true;
      }
    }
    return false;
  }

  // existing code...
}

class AuthPostMethod extends PostMethod {
  private AuthPostMethod(String uri) {
    super(uri);
  }
}

class AuthenticationPost extends AuthMethodProcessor<AccessToken> {
  final AuthenticationRequest authenticationRequest;

  private AuthenticationPost(AuthenticationRequest authenticationRequest) {
    this.authenticationRequest = authenticationRequest;
  }

  @Override
  protected void setup(AuthPostMethod method) throws IOException {
    method.setRequestEntity(getAuthenticationRequst(authenticationRequest));
  }

  @Override
  protected int[] getAllowedStatusCodes() {
    return new int[]{SC_OK, SC_BAD_REQUEST, SC_CREATED, SC_ACCEPTED, SC_NON_AUTHORITATIVE_INFORMATION, SC_NO_CONTENT, SC_RESET_CONTENT, SC_PARTIAL_CONTENT, SC_MULTI_STATUS, SC_UNAUTHORIZED};
  }

  @Override
  public AccessToken extractResult(AuthPostMethod method) throws IOException {
    // initial check for failure codes leading to authentication failures
    if (method.getStatusCode() == SC_BAD_REQUEST) {
      throw new SwiftAuthenticationFailedException(authenticationRequest.toString(), "POST", authUri, method);
    }

    final AuthenticationResponse access = JSONUtil.toObject(method.getResponseBodyAsString(), AuthenticationWrapper.class).getAccess();
    final List<Catalog> serviceCatalog = access.getServiceCatalog();
    // locate the specific service catalog that defines Swift; variations in the name of this add complexity to the search
    boolean catalogMatch = false;
    StringBuilder catList = new StringBuilder();
    StringBuilder regionList = new StringBuilder();

    // these fields are all set together at the end of the operation
    URI endpointURI = null;
    URI objectLocation;
    Endpoint swiftEndpoint = null;
    AccessToken accessToken;

    for (Catalog catalog : serviceCatalog) {
      String name = catalog.getName();
      String type = catalog.getType();
      String descr = String.format("[%s: %s]; ", name, type);
      catList.append(descr);
      if (LOG.isDebugEnabled()) {
        LOG.debug("Catalog entry " + descr);
      }
      if (name.equals(SERVICE_CATALOG_SWIFT) || name.equals(SERVICE_CATALOG_CLOUD_FILES) || type.equals(SERVICE_CATALOG_OBJECT_STORE)) {
        // swift is found
        if (LOG.isDebugEnabled()) {
          LOG.debug("Found swift catalog as " + name + " => " + type);
        }
        // now go through the endpoints
        for (Endpoint endpoint : catalog.getEndpoints()) {
          String endpointRegion = endpoint.getRegion();
          URI publicURL = endpoint.getPublicURL();
          URI internalURL = endpoint.getInternalURL();
          descr = String.format("[%s => %s / %s]; ", endpointRegion, publicURL, internalURL);
          regionList.append(descr);
          if (LOG.isDebugEnabled()) {
            LOG.debug("Endpoint " + descr);
          }
          if (region == null || endpointRegion.equals(region)) {
            endpointURI = usePublicURL ? publicURL : internalURL;
            swiftEndpoint = endpoint;
            break;
          }
        }
      }
    }
    if (endpointURI == null) {
      String message = "Could not find swift service from auth URL " + authUri + " and region '" + region + "'. " + "Categories: " + catList + ((regionList.length() > 0) ? ("regions: " + regionList) : "No regions");
      throw new SwiftInvalidResponseException(message, SC_OK, "authenticating", authUri);
    }

    accessToken = access.getToken();
    String path = SWIFT_OBJECT_AUTH_ENDPOINT + swiftEndpoint.getTenantId();
    String host = endpointURI.getHost();
    try {
      objectLocation = new URI(endpointURI.getScheme(), null, host, endpointURI.getPort(), path, null, null);
    } catch (URISyntaxException e) {
      throw new SwiftException("object endpoint URI is incorrect: " + endpointURI + " + " + path, e);
    }
    setAuthDetails(endpointURI, objectLocation, accessToken);

    if (LOG.isDebugEnabled()) {
      LOG.debug("authenticated against " + endpointURI);
    }
    createDefaultContainer();
    return accessToken;
  }
}

// existing code...