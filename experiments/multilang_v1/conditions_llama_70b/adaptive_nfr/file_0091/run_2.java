public final class SwiftRestClient {
  // ...

  private <M extends HttpMethod, R> R perform(URI uri,
                      HttpMethodProcessor<M, R> processor)
    throws IOException,
           SwiftBadRequestException,
           SwiftInternalStateException,
           SwiftInvalidResponseException,
           FileNotFoundException {
    return perform("",uri, processor);
  }

  private <M extends HttpMethod, R> R perform(String reason,
                                              URI uri,
                                              HttpMethodProcessor<M, R> processor)
      throws IOException, SwiftBadRequestException, SwiftInternalStateException,
            SwiftInvalidResponseException, FileNotFoundException {
    checkNotNull(uri);
    checkNotNull(processor);

    final M method = processor.createMethod(uri.toString());

    //retry policy
    HttpMethodParams methodParams = method.getParams();
    methodParams.setParameter(HttpMethodParams.RETRY_HANDLER,
            new DefaultHttpMethodRetryHandler(
                    retryCount, false));
    methodParams.setIntParameter(HttpConnectionParams.CONNECTION_TIMEOUT,
                                 connectTimeout);
    methodParams.setSoTimeout(socketTimeout);
    method.addRequestHeader(HEADER_USER_AGENT, SWIFT_USER_AGENT);
    Duration duration = new Duration();
    boolean success = false;
    try {
      int statusCode = 0;
      try {
        statusCode = exec(method);
      } catch (IOException e) {
        //rethrow with extra diagnostics and wiki links
        throw ExceptionDiags.wrapException(uri.toString(), method.getName(), e);
      }

      //look at the response and see if it was valid or not.
      //Valid is more than a simple 200; even 404 "not found" is considered
      //valid -which it is for many methods.

      //validate the allowed status code for this operation
      int[] allowedStatusCodes = processor.getAllowedStatusCodes();
      boolean validResponse = isStatusCodeExpected(statusCode,
              allowedStatusCodes);

      if (!validResponse) {
        IOException ioe = buildException(uri, method, statusCode);
        throw ioe;
      }

      R r = processor.extractResult(method);
      success = true;
      return r;
    } catch (IOException e) {
      //release the connection -always
      method.releaseConnection();
      throw e;
    } finally {
      duration.finished();
      durationStats.add(method.getName()+" " + reason, duration, success);
    }
  }

  // ...

  private IOException buildException(URI uri,
                                    HttpMethod method,
                                    int statusCode) {
    IOException fault;

    //log the failure @debug level
    String errorMessage = String.format("Method %s on %s failed, status code: %d," +
            " status line: %s",
            method.getName(),
            uri,
            statusCode,
            method.getStatusLine()
    );
    if (LOG.isDebugEnabled()) {
      LOG.debug(errorMessage);
    }
    //send the command
    return buildExceptionByStatusCode(uri, method, statusCode);
  }

  private IOException buildExceptionByStatusCode(URI uri,
                                                HttpMethod method,
                                                int statusCode) {
    switch (statusCode) {
      case SC_NOT_FOUND:
        return new FileNotFoundException("Operation " + method.getName()
                + " on " + uri);
      case SC_BAD_REQUEST:
        //bad HTTP request
        return new SwiftBadRequestException(
                "Bad request against " + uri,
                method.getName(),
                uri,
                method);
      case SC_REQUESTED_RANGE_NOT_SATISFIABLE:
        //out of range
        StringBuilder errorText = new StringBuilder(method.getStatusText());
        //get the requested length
        Header requestContentLen = method.getRequestHeader(HEADER_CONTENT_LENGTH);
        if (requestContentLen!=null) {
          errorText.append(" requested ").append(requestContentLen.getValue());
        }
        //and the result
        Header availableContentRange = method.getResponseHeader(
                HEADER_CONTENT_RANGE);
        if (requestContentLen!=null) {
          errorText.append(" available ").append(availableContentRange.getValue());
        }
        return new EOFException(errorText.toString());
      case SC_UNAUTHORIZED:
        //auth failure; should only happen on the second attempt
        return new SwiftAuthenticationFailedException(
                "Operation not authorized- current access token ="
                        + getToken(),
                method.getName(),
                uri,
                method);
      case SwiftProtocolConstants.SC_TOO_MANY_REQUESTS_429:
      case SwiftProtocolConstants.SC_THROTTLED_498:
        //response code that may mean the client is being throttled
        return new SwiftThrottledRequestException(
                "Client is being throttled: too many requests",
                method.getName(),
                uri,
                method);
      default:
        //return a generic invalid HTTP response
        return new SwiftInvalidResponseException(
                String.format("Method %s on %s failed, status code: %d," +
                        " status line: %s",
                        method.getName(),
                        uri,
                        statusCode,
                        method.getStatusLine()
                ),
                method.getName(),
                uri,
                method);
    }
  }

  // ...
}