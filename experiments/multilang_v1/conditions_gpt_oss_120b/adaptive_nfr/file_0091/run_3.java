/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package org.apache.hadoop.fs.swift.http;

import org.apache.commons.httpclient.DefaultHttpMethodRetryHandler;
import org.apache.commons.httpclient.Header;
import org.apache.commons.httpclient.HttpClient;
import org.apache.commons.httpclient.HttpHost;
import org.apache.commons.httpclient.HttpMethod;
import org.apache.commons.httpclient.HttpMethodBase;
import org.apache.commons.httpclient.HttpStatus;
import org.apache.commons.httpclient.methods.DeleteMethod;
import org.apache.commons.httpclient.methods.GetMethod;
import org.apache.commons.httpclient.methods.HeadMethod;
import org.apache.commons.httpclient.methods.InputStreamRequestEntity;
import org.apache.commons.httpclient.methods.PostMethod;
import org.apache.commons.httpclient.methods.PutMethod;
import org.apache.commons.httpclient.methods.StringRequestEntity;
import org.apache.commons.httpclient.params.HttpConnectionParams;
import org.apache.commons.httpclient.params.HttpMethodParams;
import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.apache.hadoop.conf.Configuration;
import org.apache.hadoop.fs.swift.auth.ApiKeyAuthenticationRequest;
import org.apache.hadoop.fs.swift.auth.ApiKeyCredentials;
import org.apache.hadoop.fs.swift.auth.AuthenticationRequest;
import org.apache.hadoop.fs.swift.auth.AuthenticationRequestWrapper;
import org.apache.hadoop.fs.swift.auth.AuthenticationResponse;
import org.apache.hadoop.fs.swift.auth.AuthenticationWrapper;
import org.apache.hadoop.fs.swift.auth.KeyStoneAuthRequest;
import org.apache.hadoop.fs.swift.auth.KeystoneApiKeyCredentials;
import org.apache.hadoop.fs.swift.auth.PasswordAuthenticationRequest;
import org.apache.hadoop.fs.swift.auth.PasswordCredentials;
import org.apache.hadoop.fs.swift.auth.entities.AccessToken;
import org.apache.hadoop.fs.swift.auth.entities.Catalog;
import org.apache.hadoop.fs.swift.auth.entities.Endpoint;
import org.apache.hadoop.fs.swift.exceptions.SwiftAuthenticationFailedException;
import org.apache.hadoop.fs.swift.exceptions.SwiftBadRequestException;
import org.apache.hadoop.fs.swift.exceptions.SwiftConfigurationException;
import org.apache.hadoop.fs.swift.exceptions.SwiftException;
import org.apache.hadoop.fs.swift.exceptions.SwiftInternalStateException;
import org.apache.hadoop.fs.swift.exceptions.SwiftInvalidResponseException;
import org.apache.hadoop.fs.swift.exceptions.SwiftThrottledRequestException;
import org.apache.hadoop.fs.swift.util.Duration;
import org.apache.hadoop.fs.swift.util.DurationStats;
import org.apache.hadoop.fs.swift.util.DurationStatsTable;
import org.apache.hadoop.fs.swift.util.JSONUtil;
import org.apache.hadoop.fs.swift.util.SwiftObjectPath;
import org.apache.hadoop.fs.swift.util.SwiftUtils;
import org.apache.hadoop.fs.swift.util.SwiftUtils;
import org.apache.http.conn.params.ConnRoutePNames;

import java.io.EOFException;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.InputStream;
import java.io.UnsupportedEncodingException;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.URLEncoder;
import java.util.List;
import java.util.Properties;

import static org.apache.commons.httpclient.HttpStatus.*;
import static org.apache.hadoop.fs.swift.http.SwiftProtocolConstants.*;

public final class SwiftRestClient {
  private static final Log LOG = LogFactory.getLog(SwiftRestClient.class);
  public static final Header NEWEST = new Header(SwiftProtocolConstants.X_NEWEST, "true");

  private final URI authUri;
  private final String region;
  private final String tenant;
  private final String username;
  private final String password;
  private final String apiKey;
  private final AuthenticationRequest authRequest;
  private AuthenticationRequest keystoneAuthRequest;
  private boolean useKeystoneAuthentication = false;
  private final String container;
  private final String serviceDescription;
  private AccessToken token;
  private URI endpointURI;
  private URI objectLocationURI;
  private final URI filesystemURI;
  private final String serviceProvider;
  private final boolean usePublicURL;
  private final int retryCount;
  private final int connectTimeout;
  private final int socketTimeout;
  private final int throttleDelay;
  private String proxyHost;
  private int proxyPort;
  private final boolean locationAware;
  private final int partSizeKB;
  private final int blocksizeKB;
  private final int bufferSizeKB;
  private final DurationStatsTable durationStats = new DurationStatsTable();

  private synchronized URI getEndpointURI() {
    return endpointURI;
  }

  private synchronized URI getObjectLocationURI() {
    return objectLocationURI;
  }

  private synchronized AccessToken getToken() {
    return token;
  }

  private void setAuthDetails(URI endpoint, URI objectLocation, AccessToken authToken) {
    if (LOG.isDebugEnabled()) {
      LOG.debug(String.format("setAuth: endpoint=%s; objectURI=%s; token=%s",
              endpoint, objectLocation, authToken));
    }
    synchronized (this) {
      endpointURI = endpoint;
      objectLocationURI = objectLocation;
      token = authToken;
    }
  }

  private static abstract class HttpMethodProcessor<M extends HttpMethod, R> {
    public final M createMethod(String uri) throws IOException {
      M method = doCreateMethod(uri);
      setup(method);
      return method;
    }

    public abstract R extractResult(M method) throws IOException;

    protected abstract M doCreateMethod(String uri);

    protected void setup(M method) throws IOException {
    }

    protected int[] getAllowedStatusCodes() {
      return new int[]{SC_OK, SC_CREATED, SC_ACCEPTED, SC_NO_CONTENT, SC_PARTIAL_CONTENT};
    }
  }

  private static abstract class GetMethodProcessor<R> extends HttpMethodProcessor<GetMethod, R> {
    @Override
    protected final GetMethod doCreateMethod(String uri) {
      return new GetMethod(uri);
    }
  }

  private static abstract class PostMethodProcessor<R> extends HttpMethodProcessor<PostMethod, R> {
    @Override
    protected final PostMethod doCreateMethod(String uri) {
      return new PostMethod(uri);
    }
  }

  private static class AuthPostMethod extends PostMethod {
    private AuthPostMethod(String uri) {
      super(uri);
    }
  }

  private static abstract class AuthMethodProcessor<R> extends HttpMethodProcessor<AuthPostMethod, R> {
    @Override
    protected final AuthPostMethod doCreateMethod(String uri) {
      return new AuthPostMethod(uri);
    }
  }

  private static abstract class PutMethodProcessor<R> extends HttpMethodProcessor<PutMethod, R> {
    @Override
    protected final PutMethod doCreateMethod(String uri) {
      return new PutMethod(uri);
    }

    @Override
    protected int[] getAllowedStatusCodes() {
      return new int[]{SC_OK, SC_CREATED, SC_NO_CONTENT, SC_ACCEPTED};
    }
  }

  private static abstract class CopyMethodProcessor<R> extends HttpMethodProcessor<CopyMethod, R> {
    @Override
    protected final CopyMethod doCreateMethod(String uri) {
      return new CopyMethod(uri);
    }

    @Override
    protected int[] getAllowedStatusCodes() {
      return new int[]{SC_CREATED};
    }
  }

  private static abstract class DeleteMethodProcessor<R> extends HttpMethodProcessor<DeleteMethod, R> {
    @Override
    protected final DeleteMethod doCreateMethod(String uri) {
      return new DeleteMethod(uri);
    }

    @Override
    protected int[] getAllowedStatusCodes() {
      return new int[]{SC_OK, SC_ACCEPTED, SC_NO_CONTENT, SC_NOT_FOUND};
    }
  }

  private static abstract class HeadMethodProcessor<R> extends HttpMethodProcessor<HeadMethod, R> {
    @Override
    protected final HeadMethod doCreateMethod(String uri) {
      return new HeadMethod(uri);
    }
  }

  private SwiftRestClient(URI filesystemURI, Configuration conf) throws SwiftConfigurationException {
    this.filesystemURI = filesystemURI;
    Properties props = RestClientBindings.bind(filesystemURI, conf);
    String stringAuthUri = getOption(props, SWIFT_AUTH_PROPERTY);
    username = getOption(props, SWIFT_USERNAME_PROPERTY);
    password = props.getProperty(SWIFT_PASSWORD_PROPERTY);
    apiKey = props.getProperty(SWIFT_APIKEY_PROPERTY);
    region = props.getProperty(SWIFT_REGION_PROPERTY);
    tenant = props.getProperty(SWIFT_TENANT_PROPERTY);
    serviceProvider = props.getProperty(SWIFT_SERVICE_PROPERTY);
    container = props.getProperty(SWIFT_CONTAINER_PROPERTY);
    usePublicURL = "true".equals(props.getProperty(SWIFT_PUBLIC_PROPERTY, "false"));

    if (apiKey == null && password == null) {
      throw new SwiftConfigurationException(
              "Configuration for " + filesystemURI + " must contain either "
                      + SWIFT_PASSWORD_PROPERTY + " or "
                      + SWIFT_APIKEY_PROPERTY);
    }

    if (password != null) {
      authRequest = new PasswordAuthenticationRequest(tenant,
              new PasswordCredentials(username, password));
    } else {
      authRequest = new ApiKeyAuthenticationRequest(tenant,
              new ApiKeyCredentials(username, apiKey));
      keystoneAuthRequest = new KeyStoneAuthRequest(tenant,
              new KeystoneApiKeyCredentials(username, apiKey));
    }

    locationAware = "true".equals(props.getProperty(SWIFT_LOCATION_AWARE_PROPERTY, "false"));

    try {
      retryCount = conf.getInt(SWIFT_RETRY_COUNT, DEFAULT_RETRY_COUNT);
      connectTimeout = conf.getInt(SWIFT_CONNECTION_TIMEOUT, DEFAULT_CONNECT_TIMEOUT);
      socketTimeout = conf.getInt(SWIFT_SOCKET_TIMEOUT, DEFAULT_SOCKET_TIMEOUT);
      throttleDelay = conf.getInt(SWIFT_THROTTLE_DELAY, DEFAULT_THROTTLE_DELAY);
      proxyHost = conf.get(SWIFT_PROXY_HOST_PROPERTY);
      proxyPort = conf.getInt(SWIFT_PROXY_PORT_PROPERTY, 8080);
      blocksizeKB = conf.getInt(SWIFT_BLOCKSIZE, DEFAULT_SWIFT_BLOCKSIZE);
      validatePositive(blocksizeKB, SWIFT_BLOCKSIZE);
      partSizeKB = conf.getInt(SWIFT_PARTITION_SIZE, DEFAULT_SWIFT_PARTITION_SIZE);
      validatePositive(partSizeKB, SWIFT_PARTITION_SIZE);
      bufferSizeKB = conf.getInt(SWIFT_REQUEST_SIZE, DEFAULT_SWIFT_REQUEST_SIZE);
      validatePositive(bufferSizeKB, SWIFT_REQUEST_SIZE);
    } catch (NumberFormatException e) {
      throw new SwiftConfigurationException(e.toString(), e);
    }

    serviceDescription = buildServiceDescription(stringAuthUri);
    if (LOG.isDebugEnabled()) {
      LOG.debug(serviceDescription);
    }

    try {
      this.authUri = new URI(stringAuthUri);
    } catch (URISyntaxException e) {
      throw new SwiftConfigurationException("The " + SWIFT_AUTH_PROPERTY
              + " property was incorrect: " + stringAuthUri, e);
    }
  }

  private static void validatePositive(int value, String name) throws SwiftConfigurationException {
    if (value <= 0) {
      throw new SwiftConfigurationException("Invalid " + name + " set in configuration: " + value);
    }
  }

  private static String buildServiceDescription(String authUri) {
    return String.format(
            "Service={%s} container={%s} uri={%s} tenant={%s} user={%s} region={%s} publicURL={%b} location aware={%b} "
                    + "partition size={%d KB}, buffer size={%d KB} block size={%d KB} connect timeout={%d}, retry count={%d} "
                    + "socket timeout={%d} throttle delay={%d}",
            serviceProvider, container, authUri, tenant, username,
            region != null ? region : "(none)", usePublicURL, locationAware,
            partSizeKB, bufferSizeKB, blocksizeKB, connectTimeout,
            retryCount, socketTimeout, throttleDelay);
  }

  private static String getOption(Properties props, String key) throws SwiftConfigurationException {
    String val = props.getProperty(key);
    if (val == null) {
      throw new SwiftConfigurationException("Undefined property: " + key);
    }
    return val;
  }

  public HttpBodyContent getData(SwiftObjectPath path, long offset, long length) throws IOException {
    if (offset < 0) {
      throw new SwiftException("Invalid offset: " + offset + " in getDataAsInputStream( path=" + path
              + ", offset=" + offset + ", length =" + length + ")");
    }
    if (length <= 0) {
      throw new SwiftException("Invalid length: " + length + " in getDataAsInputStream( path=" + path
              + ", offset=" + offset + ", length =" + length + ")");
    }
    String range = String.format(SWIFT_RANGE_HEADER_FORMAT_PATTERN, offset, offset + length - 1);
    if (LOG.isDebugEnabled()) {
      LOG.debug("getData:" + range);
    }
    return getData(path, new Header(HEADER_RANGE, range), NEWEST);
  }

  public long getContentLength(URI uri) throws IOException {
    preRemoteCommand("getContentLength");
    return perform("getContentLength", uri, new HeadMethodProcessor<Long>() {
      @Override
      public Long extractResult(HeadMethod method) {
        return method.getResponseContentLength();
      }

      @Override
      protected void setup(HeadMethod method) throws SwiftInternalStateException {
        super.setup(method);
        method.addRequestHeader(NEWEST);
      }
    });
  }

  public long getContentLength(SwiftObjectPath path) throws IOException {
    return getContentLength(pathToURI(path));
  }

  public HttpBodyContent getData(SwiftObjectPath path, Header... requestHeaders) throws IOException {
    preRemoteCommand("getData");
    return doGet(pathToURI(path), requestHeaders);
  }

  public byte[] getObjectLocation(SwiftObjectPath path, Header... requestHeaders) throws IOException {
    if (!isLocationAware()) {
      return null;
    }
    preRemoteCommand("getObjectLocation");
    try {
      return perform("getObjectLocation", pathToObjectLocation(path), new GetMethodProcessor<byte[]>() {
        @Override
        protected int[] getAllowedStatusCodes() {
          return new int[]{SC_OK, SC_FORBIDDEN, SC_NO_CONTENT};
        }

        @Override
        public byte[] extractResult(GetMethod method) throws IOException {
          if (method.getStatusCode() == SC_NOT_FOUND || method.getStatusCode() == SC_FORBIDDEN
                  || method.getStatusCode() == SC_NO_CONTENT || method.getResponseBodyAsStream() == null) {
            return null;
          }
          InputStream in = method.getResponseBodyAsStream();
          byte[] buf = new byte[1024];
          return in.read(buf) > 0 ? buf : null;
        }

        @Override
        protected void setup(GetMethod method) throws SwiftInternalStateException {
          setHeaders(method, requestHeaders);
        }
      });
    } catch (IOException e) {
      LOG.warn("Failed to get the location of " + path + ": " + e, e);
      return null;
    }
  }

  private URI pathToObjectLocation(SwiftObjectPath path) throws SwiftException {
    String base = objectLocationURI.toString();
    String suffix = path.toString().startsWith("/") ? path.toUriPath() : "/" + path.toUriPath();
    try {
      return new URI(base + suffix);
    } catch (URISyntaxException e) {
      throw new SwiftException(e);
    }
  }

  public byte[] findObjectsByPrefix(SwiftObjectPath path, Header... requestHeaders) throws IOException {
    preRemoteCommand("findObjectsByPrefix");
    String endpoint = getEndpointURI().toString();
    String object = encodeUrl(trimLeadingSlash(path.getObject()));
    String uriStr = endpoint + "/" + path.getContainer() + "/?prefix=" + object;
    URI uri = toUri(uriStr);
    return perform("findObjectsByPrefix", uri, new GetMethodProcessor<byte[]>() {
      @Override
      public byte[] extractResult(GetMethod method) throws IOException {
        if (method.getStatusCode() == SC_NOT_FOUND) {
          throw new FileNotFoundException("Not found " + method.getURI());
        }
        return method.getResponseBody();
      }

      @Override
      protected int[] getAllowedStatusCodes() {
        return new int[]{SC_OK, SC_NOT_FOUND};
      }

      @Override
      protected void setup(GetMethod method) throws SwiftInternalStateException {
        setHeaders(method, requestHeaders);
      }
    });
  }

  public byte[] listDeepObjectsInDirectory(SwiftObjectPath path, boolean listDeep, Header... requestHeaders) throws IOException {
    preRemoteCommand("listDeepObjectsInDirectory");
    String endpoint = getEndpointURI().toString();
    String object = normalizeObjectPath(path.getObject());
    StringBuilder sb = new StringBuilder(endpoint)
            .append("/")
            .append(path.getContainer())
            .append("/?prefix=")
            .append(object)
            .append("&format=json");
    if (!listDeep) {
      sb.append("&delimiter=/");
    }
    return findObjects(sb.toString(), requestHeaders);
  }

  private byte[] findObjects(String location, Header[] requestHeaders) throws IOException {
    preRemoteCommand("findObjects");
    URI uri = toUri(location);
    return perform("findObjects", uri, new GetMethodProcessor<byte[]>() {
      @Override
      public byte[] extractResult(GetMethod method) throws IOException {
        if (method.getStatusCode() == SC_NOT_FOUND) {
          throw new FileNotFoundException("Not found " + method.getURI());
        }
        return method.getResponseBody();
      }

      @Override
      protected int[] getAllowedStatusCodes() {
        return new int[]{SC_OK, SC_NOT_FOUND};
      }

      @Override
      protected void setup(GetMethod method) throws SwiftInternalStateException {
        setHeaders(method, requestHeaders);
      }
    });
  }

  public boolean copyObject(SwiftObjectPath src, SwiftObjectPath dst, Header... headers) throws IOException {
    preRemoteCommand("copyObject");
    return perform("copy", pathToURI(src), new CopyMethodProcessor<Boolean>() {
      @Override
      public Boolean extractResult(CopyMethod method) {
        return method.getStatusCode() != SC_NOT_FOUND;
      }

      @Override
      protected void setup(CopyMethod method) throws SwiftInternalStateException {
        setHeaders(method, headers);
        method.addRequestHeader(HEADER_DESTINATION, dst.toUriPath());
      }
    });
  }

  public void upload(SwiftObjectPath path, InputStream data, long length, Header... requestHeaders) throws IOException {
    preRemoteCommand("upload");
    try {
      perform("upload", pathToURI(path), new PutMethodProcessor<byte[]>() {
        @Override
        public byte[] extractResult(PutMethod method) throws IOException {
          return method.getResponseBody();
        }

        @Override
        protected void setup(PutMethod method) throws SwiftInternalStateException {
          method.setRequestEntity(new InputStreamRequestEntity(data, length));
          setHeaders(method, requestHeaders);
        }
      });
    } finally {
      data.close();
    }
  }

  public boolean delete(SwiftObjectPath path, Header... requestHeaders) throws IOException {
    preRemoteCommand("delete");
    return perform("", pathToURI(path), new DeleteMethodProcessor<Boolean>() {
      @Override
      public Boolean extractResult(DeleteMethod method) {
        return method.getStatusCode() == SC_NO_CONTENT;
      }

      @Override
      protected void setup(DeleteMethod method) throws SwiftInternalStateException {
        setHeaders(method, requestHeaders);
      }
    });
  }

  public Header[] headRequest(String reason, SwiftObjectPath path, Header... requestHeaders) throws IOException {
    preRemoteCommand("headRequest: " + reason);
    return perform(reason, pathToURI(path), new HeadMethodProcessor<Header[]>() {
      @Override
      public Header[] extractResult(HeadMethod method) throws IOException {
        if (method.getStatusCode() == SC_NOT_FOUND) {
          throw new FileNotFoundException("Not Found " + method.getURI());
        }
        return method.getResponseHeaders();
      }

      @Override
      protected void setup(HeadMethod method) throws SwiftInternalStateException {
        setHeaders(method, requestHeaders);
      }
    });
  }

  public int putRequest(SwiftObjectPath path, Header... requestHeaders) throws IOException {
    preRemoteCommand("putRequest");
    return perform(pathToURI(path), new PutMethodProcessor<Integer>() {
      @Override
      public Integer extractResult(PutMethod method) {
        return method.getStatusCode();
      }

      @Override
      protected void setup(PutMethod method) throws SwiftInternalStateException {
        setHeaders(method, requestHeaders);
      }
    });
  }

  public AccessToken authenticate() throws IOException {
    AuthenticationRequest request = useKeystoneAuthentication ? keystoneAuthRequest : authRequest;
    LOG.debug("started authentication");
    return perform("authentication", authUri, new AuthenticationPost(request));
  }

  private class AuthenticationPost extends AuthMethodProcessor<AccessToken> {
    private final AuthenticationRequest authenticationRequest;

    private AuthenticationPost(AuthenticationRequest authenticationRequest) {
      this.authenticationRequest = authenticationRequest;
    }

    @Override
    protected void setup(AuthPostMethod method) throws IOException {
      method.setRequestEntity(getAuthenticationRequst(authenticationRequest));
    }

    @Override
    protected int[] getAllowedStatusCodes() {
      return new int[]{SC_OK, SC_BAD_REQUEST, SC_CREATED, SC_ACCEPTED,
              SC_NON_AUTHORITATIVE_INFORMATION, SC_NO_CONTENT, SC_RESET_CONTENT,
              SC_PARTIAL_CONTENT, SC_MULTI_STATUS, SC_UNAUTHORIZED};
    }

    @Override
    public AccessToken extractResult(AuthPostMethod method) throws IOException {
      if (method.getStatusCode() == SC_BAD_REQUEST) {
        throw new SwiftAuthenticationFailedException(authenticationRequest.toString(),
                "POST", authUri, method);
      }
      AuthenticationResponse access = JSONUtil.toObject(method.getResponseBodyAsString(),
              AuthenticationWrapper.class).getAccess();
      return processCatalogs(access);
    }

    private AccessToken processCatalogs(AuthenticationResponse access) throws SwiftException {
      List<Catalog> catalogs = access.getServiceCatalog();
      StringBuilder catList = new StringBuilder();
      StringBuilder regionList = new StringBuilder();
      URI endpoint = null;
      Endpoint swiftEndpoint = null;

      for (Catalog catalog : catalogs) {
        catList.append(String.format("[%s: %s]; ", catalog.getName(), catalog.getType()));
        if (isSwiftCatalog(catalog)) {
          for (Endpoint ep : catalog.getEndpoints()) {
            regionList.append(String.format("[%s => %s / %s]; ",
                    ep.getRegion(), ep.getPublicURL(), ep.getInternalURL()));
            if (region == null || ep.getRegion().equals(region)) {
              endpoint = usePublicURL ? ep.getPublicURL() : ep.getInternalURL();
              swiftEndpoint = ep;
              break;
            }
          }
        }
      }

      if (endpoint == null) {
        throw new SwiftInvalidResponseException(buildCatalogErrorMessage(catList, regionList),
                SC_OK, "authenticating", authUri);
      }

      AccessToken token = access.getToken();
      URI objectLocation = buildObjectLocation(endpoint, swiftEndpoint);
      setAuthDetails(endpoint, objectLocation, token);
      if (LOG.isDebugEnabled()) {
        LOG.debug("authenticated against " + endpoint);
      }
      createDefaultContainer();
      return token;
    }

    private boolean isSwiftCatalog(Catalog catalog) {
      String name = catalog.getName();
      String type = catalog.getType();
      return name.equals(SERVICE_CATALOG_SWIFT) || name.equals(SERVICE_CATALOG_CLOUD_FILES)
              || type.equals(SERVICE_CATALOG_OBJECT_STORE);
    }

    private String buildCatalogErrorMessage(StringBuilder catList, StringBuilder regionList) {
      return "Could not find swift service from auth URL " + authUri + " and region '" + region + "'. "
              + "Categories: " + catList + (regionList.length() > 0 ? ("regions: " + regionList) : "No regions");
    }

    private URI buildObjectLocation(URI endpointURI, Endpoint swiftEndpoint) throws SwiftException {
      String path = SWIFT_OBJECT_AUTH_ENDPOINT + swiftEndpoint.getTenantId();
      try {
        return new URI(endpointURI.getScheme(), null, endpointURI.getHost(),
                endpointURI.getPort(), path, null, null);
      } catch (URISyntaxException e) {
        throw new SwiftException("object endpoint URI is incorrect: " + endpointURI + " + " + path, e);
      }
    }
  }

  private StringRequestEntity getAuthenticationRequst(AuthenticationRequest authenticationRequest) throws IOException {
    String data = JSONUtil.toJSON(new AuthenticationRequestWrapper(authenticationRequest));
    if (LOG.isDebugEnabled()) {
      LOG.debug("Authenticating with " + authenticationRequest);
    }
    return toJsonEntity(data);
  }

  private synchronized void createDefaultContainer() throws IOException {
    createContainer(container);
  }

  public void createContainer(String containerName) throws IOException {
    SwiftObjectPath objectPath = new SwiftObjectPath(containerName, "");
    try {
      headRequest("createContainer", objectPath, NEWEST);
    } catch (FileNotFoundException ex) {
      int status = attemptCreateContainer(objectPath);
      if (status == SC_BAD_REQUEST) {
        throw new SwiftBadRequestException("Bad request -authentication failure or bad container name?",
                status, "PUT", null);
      }
      if (!isStatusCodeExpected(status, SC_OK, SC_CREATED, SC_ACCEPTED, SC_NO_CONTENT)) {
        throw new SwiftInvalidResponseException("Couldn't create container " + containerName,
                status, "PUT", null);
      } else {
        throw ex;
      }
    }
  }

  private int attemptCreateContainer(SwiftObjectPath objectPath) throws IOException {
    try {
      return putRequest(objectPath);
    } catch (FileNotFoundException e) {
      return SC_NOT_FOUND;
    }
  }

  private void authIfNeeded() throws IOException {
    if (getEndpointURI() == null) {
      authenticate();
    }
  }

  private void preRemoteCommand(String operation) throws IOException {
    if (LOG.isTraceEnabled()) {
      LOG.trace("Executing " + operation);
    }
    authIfNeeded();
  }

  private <M extends HttpMethod, R> R perform(URI uri, HttpMethodProcessor<M, R> processor)
          throws IOException, SwiftBadRequestException, SwiftInternalStateException,
          SwiftInvalidResponseException, FileNotFoundException {
    return perform("", uri, processor);
  }

  private <M extends HttpMethod, R> R perform(String reason, URI uri, HttpMethodProcessor<M, R> processor)
          throws IOException, SwiftBadRequestException, SwiftInternalStateException,
          SwiftInvalidResponseException, FileNotFoundException {
    checkNotNull(uri);
    checkNotNull(processor);
    M method = processor.createMethod(uri.toString());
    configureMethod(method);
    Duration duration = new Duration();
    boolean success = false;
    try {
      int status = execWithRetry(method);
      validateStatus(uri, method, status, processor.getAllowedStatusCodes());
      R result = processor.extractResult(method);
      success = true;
      return result;
    } finally {
      duration.finished();
      durationStats.add(method.getName() + " " + reason, duration, success);
      method.releaseConnection();
    }
  }

  private void configureMethod(HttpMethod method) {
    HttpMethodParams params = method.getParams();
    params.setParameter(HttpMethodParams.RETRY_HANDLER,
            new DefaultHttpMethodRetryHandler(retryCount, false));
    params.setIntParameter(HttpConnectionParams.CONNECTION_TIMEOUT, connectTimeout);
    params.setSoTimeout(socketTimeout);
    method.addRequestHeader(HEADER_USER_AGENT, SWIFT_USER_AGENT);
  }

  private int execWithRetry(HttpMethod method) throws IOException {
    int status = exec(method);
    if (shouldRetryWithKeystone(status, method)) {
      status = exec(method);
    }
    if (status == HttpStatus.SC_UNAUTHORIZED) {
      status = handleUnauthorized(method);
    }
    return status;
  }

  private boolean shouldRetryWithKeystone(int status, HttpMethod method) {
    return (status == HttpStatus.SC_UNAUTHORIZED || status == HttpStatus.SC_BAD_REQUEST)
            && method instanceof AuthPostMethod && !useKeystoneAuthentication;
  }

  private int handleUnauthorized(HttpMethod method) throws IOException {
    if (method instanceof AuthPostMethod) {
      throw new SwiftAuthenticationFailedException(authRequest.toString(),
              "auth", authUri, method);
    }
    if (LOG.isDebugEnabled()) {
      LOG.debug("Reauthenticating");
    }
    authenticate();
    if (LOG.isDebugEnabled()) {
      LOG.debug("Retrying original request");
    }
    return exec(method);
  }

  private void validateStatus(URI uri, HttpMethod method, int status, int[] allowed) throws IOException {
    if (!isStatusCodeExpected(status, allowed)) {
      throw buildException(uri, method, status);
    }
  }

  private <M extends HttpMethod> IOException buildException(URI uri, M method, int statusCode) {
    String msg = String.format("Method %s on %s failed, status code: %d, status line: %s",
            method.getName(), uri, statusCode, method.getStatusLine());
    if (LOG.isDebugEnabled()) {
      LOG.debug(msg);
    }
    switch (statusCode) {
      case SC_NOT_FOUND:
        return new FileNotFoundException("Operation " + method.getName() + " on " + uri);
      case SC_BAD_REQUEST:
        return new SwiftBadRequestException("Bad request against " + uri,
                method.getName(), uri, method);
      case SC_REQUESTED_RANGE_NOT_SATISFIABLE:
        return buildRangeException(method);
      case SC_UNAUTHORIZED:
        return new SwiftAuthenticationFailedException(
                "Operation not authorized- current access token =" + getToken(),
                method.getName(), uri, method);
      case SwiftProtocolConstants.SC_TOO_MANY_REQUESTS_429:
      case SwiftProtocolConstants.SC_THROTTLED_498:
        return new SwiftThrottledRequestException(
                "Client is being throttled: too many requests",
                method.getName(), uri, method);
      default:
        return new SwiftInvalidResponseException(msg, method.getName(), uri, method);
    }
  }

  private IOException buildRangeException(HttpMethod method) {
    StringBuilder error = new StringBuilder(method.getStatusText());
    Header reqLen = method.getRequestHeader(HEADER_CONTENT_LENGTH);
    if (reqLen != null) {
      error.append(" requested ").append(reqLen.getValue());
    }
    Header avail = method.getResponseHeader(HEADER_CONTENT_RANGE);
    if (avail != null) {
      error.append(" available ").append(avail.getValue());
    }
    return new EOFException(error.toString());
  }

  private HttpBodyContent doGet(URI uri, Header... requestHeaders) throws IOException {
    return perform("", uri, new GetMethodProcessor<HttpBodyContent>() {
      @Override
      public HttpBodyContent extractResult(GetMethod method) {
        return new HttpBodyContent(new HttpInputStreamWithRelease(uri, method),
                method.getResponseContentLength());
      }

      @Override
      protected void setup(GetMethod method) throws SwiftInternalStateException {
        setHeaders(method, requestHeaders);
      }
    });
  }

  public static SwiftRestClient getInstance(URI filesystemURI, Configuration config) throws IOException {
    return new SwiftRestClient(filesystemURI, config);
  }

  private static StringRequestEntity toJsonEntity(String data) throws SwiftException {
    try {
      return new StringRequestEntity(data, "application/json", "UTF-8");
    } catch (UnsupportedEncodingException e) {
      throw new SwiftException("Could not encode data as UTF-8", e);
    }
  }

  public static URI pathToURI(SwiftObjectPath path, URI endpointURI) throws SwiftException {
    checkNotNull(endpointURI, "Null Endpoint -client is not authenticated");
    try {
      String uriStr = SwiftUtils.joinPaths(endpointURI.toString(), encodeUrl(path.toUriPath()));
      return new URI(uriStr);
    } catch (URISyntaxException e) {
      throw new SwiftException("Failed to create URI from " + endpointURI, e);
    }
  }

  private static String encodeUrl(String url) throws SwiftException {
    if (url.matches(".*\\s+.*")) {
      try {
        url = URLEncoder.encode(url, "UTF-8").replace("+", "%20");
      } catch (UnsupportedEncodingException e) {
        throw new SwiftException("failed to encode URI", e);
      }
    }
    return url;
  }

  private URI pathToURI(SwiftObjectPath path) throws SwiftException {
    return pathToURI(path, getEndpointURI());
  }

  private void setHeaders(HttpMethodBase method, Header[] requestHeaders) throws SwiftInternalStateException {
    for (Header header : requestHeaders) {
      method.addRequestHeader(header);
    }
    setAuthToken(method, getToken());
  }

  private void setAuthToken(HttpMethodBase method, AccessToken token) throws SwiftInternalStateException {
    checkNotNull(token, "Not authenticated");
    method.addRequestHeader(HEADER_AUTH_KEY, token.getId());
  }

  private <M extends HttpMethod> int exec(M method) throws IOException {
    HttpClient client = new HttpClient();
    if (proxyHost != null) {
      client.getParams().setParameter(ConnRoutePNames.DEFAULT_PROXY,
              new HttpHost(proxyHost, proxyPort));
    }
    int status = execWithDebugOutput(method, client);
    if (shouldRetryWithKeystone(status, method)) {
      useKeystoneAuthentication = true;
      ((AuthPostMethod) method).setRequestEntity(getAuthenticationRequst(keystoneAuthRequest));
      status = execWithDebugOutput(method, client);
    }
    return status;
  }

  private <M extends HttpMethod> int execWithDebugOutput(M method, HttpClient client) throws IOException {
    if (LOG.isDebugEnabled()) {
      StringBuilder sb = new StringBuilder(method.getName() + " " + method.getURI() + "\n");
      for (Header h : method.getRequestHeaders()) {
        sb.append(h.toString());
      }
      LOG.debug(sb);
    }
    int status = client.executeMethod(method);
    if (LOG.isDebugEnabled()) {
      LOG.debug("Status code = " + status);
    }
    return status;
  }

  private static <T> T checkNotNull(T reference) throws SwiftInternalStateException {
    return checkNotNull(reference, "Null Reference");
  }

  private static <T> T checkNotNull(T reference, String message) throws SwiftInternalStateException {
    if (reference == null) {
      throw new SwiftInternalStateException(message);
    }
    return reference;
  }

  private boolean isStatusCodeExpected(int status, int... expected) {
    for (int code : expected) {
      if (status == code) {
        return true;
      }
    }
    return false;
  }

  @Override
  public String toString() {
    return "Swift client: " + serviceDescription;
  }

  public String getRegion() {
    return region;
  }

  public String getTenant() {
    return tenant;
  }

  public String getUsername() {
    return username;
  }

  public String getContainer() {
    return container;
  }

  public boolean isLocationAware() {
    return locationAware;
  }

  public long getBlocksizeKB() {
    return blocksizeKB;
  }

  public int getPartSizeKB() {
    return partSizeKB;
  }

  public int getBufferSizeKB() {
    return bufferSizeKB;
  }

  public int getProxyPort() {
    return proxyPort;
  }

  public String getProxyHost() {
    return proxyHost;
  }

  public int getRetryCount() {
    return retryCount;
  }

  public int getConnectTimeout() {
    return connectTimeout;
  }

  public boolean isUsePublicURL() {
    return usePublicURL;
  }

  public int getThrottleDelay() {
    return throttleDelay;
  }

  public List<DurationStats> getOperationStatistics() {
    return durationStats.getDurationStatistics();
  }

  private static String trimLeadingSlash(String s) {
    return s.startsWith("/") ? s.substring(1) : s;
  }

  private static String normalizeObjectPath(String s) {
    String obj = trimLeadingSlash(s);
    if (!obj.endsWith("/")) {
      obj = obj + "/";
    }
    return obj.equals("/") ? "" : obj;
  }

  private static URI toUri(String s) throws SwiftException {
    try {
      return new URI(s);
    } catch (URISyntaxException e) {
      throw new SwiftException("Bad URI: " + s, e);
    }
  }
}