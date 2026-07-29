package org.apache.hadoop.fs.swift.http;

import org.apache.commons.httpclient.DefaultHttpMethodRetryHandler;
import org.apache.commons.httpclient.Header;
import org.apache.commons.httpclient.HttpClient;
import org.apache.commons.httpclient.HttpHost;
import org.apache.commons.httpclient.HttpMethod;
import org.apache.commons.httpclient.HttpMethodBase;
import org.apache.commons.httpclient.HttpMethodParams;
import org.apache.commons.httpclient.HttpStatus;
import org.apache.commons.httpclient.methods.CopyMethod;
import org.apache.commons.httpclient.methods.DeleteMethod;
import org.apache.commons.httpclient.methods.GetMethod;
import org.apache.commons.httpclient.methods.HeadMethod;
import org.apache.commons.httpclient.methods.InputStreamRequestEntity;
import org.apache.commons.httpclient.methods.PostMethod;
import org.apache.commons.httpclient.methods.PutMethod;
import org.apache.commons.httpclient.methods.StringRequestEntity;
import org.apache.commons.httpclient.params.HttpConnectionParams;
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
import org.apache.http.conn.params.ConnRoutePNames;

import java.io.EOFException;
import java.io.File;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.InputStream;
import java.io.UnsupportedEncodingException;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.URLEncoder;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Properties;
import java.util.stream.Collectors;

import static org.apache.commons.httpclient.HttpStatus.SC_ACCEPTED;
import static org.apache.commons.httpclient.HttpStatus.SC_BAD_REQUEST;
import static org.apache.commons.httpclient.HttpStatus.SC_CREATED;
import static org.apache.commons.httpclient.HttpStatus.SC_FORBIDDEN;
import static org.apache.commons.httpclient.HttpStatus.SC_MULTI_STATUS;
import static org.apache.commons.httpclient.HttpStatus.SC_NO_CONTENT;
import static org.apache.commons.httpclient.HttpStatus.SC_NOT_FOUND;
import static org.apache.commons.httpclient.HttpStatus.SC_OK;
import static org.apache.commons.httpclient.HttpStatus.SC_PARTIAL_CONTENT;
import static org.apache.commons.httpclient.HttpStatus.SC_RESET_CONTENT;
import static org.apache.commons.httpclient.HttpStatus.SC_UNAUTHORIZED;
import static org.apache.hadoop.fs.swift.http.SwiftProtocolConstants.HEADER_AUTH_KEY;
import static org.apache.hadoop.fs.swift.http.SwiftProtocolConstants.HEADER_CONTENT_LENGTH;
import static org.apache.hadoop.fs.swift.http.SwiftProtocolConstants.HEADER_CONTENT_RANGE;
import static org.apache.hadoop.fs.swift.http.SwiftProtocolConstants.HEADER_DESTINATION;
import static org.apache.hadoop.fs.swift.http.SwiftProtocolConstants.HEADER_RANGE;
import static org.apache.hadoop.fs.swift.http.SwiftProtocolConstants.HEADER_USER_AGENT;
import static org.apache.hadoop.fs.swift.http.SwiftProtocolConstants.NEWEST;
import static org.apache.hadoop.fs.swift.http.SwiftProtocolConstants.SC_THROTTLED_498;
import static org.apache.hadoop.fs.swift.http.SwiftProtocolConstants.SC_TOO_MANY_REQUESTS_429;
import static org.apache.hadoop.fs.swift.http.SwiftProtocolConstants.SERVICE_CATALOG_CLOUD_FILES;
import static org.apache.hadoop.fs.swift.http.SwiftProtocolConstants.SERVICE_CATALOG_OBJECT_STORE;
import static org.apache.hadoop.fs.swift.http.SwiftProtocolConstants.SERVICE_CATALOG_SWIFT;
import static org.apache.hadoop.fs.swift.http.SwiftProtocolConstants.SWIFT_APIKEY_PROPERTY;
import static org.apache.hadoop.fs.swift.http.SwiftProtocolConstants.SWIFT_AUTH_PROPERTY;
import static org.apache.hadoop.fs.swift.http.SwiftProtocolConstants.SWIFT_BLOCKSIZE;
import static org.apache.hadoop.fs.swift.http.SwiftProtocolConstants.SWIFT_CONNECTION_TIMEOUT;
import static org.apache.hadoop.fs.swift.http.SwiftProtocolConstants.SWIFT_CONTAINER_PROPERTY;
import static org.apache.hadoop.fs.swift.http.SwiftProtocolConstants.SWIFT_LOCATION_AWARE_PROPERTY;
import static org.apache.hadoop.fs.swift.http.SwiftProtocolConstants.SWIFT_PASSWORD_PROPERTY;
import static org.apache.hadoop.fs.swift.http.SwiftProtocolConstants.SWIFT_PARTITION_SIZE;
import static org.apache.hadoop.fs.swift.http.SwiftProtocolConstants.SWIFT_PUBLIC_PROPERTY;
import static org.apache.hadoop.fs.swift.http.SwiftProtocolConstants.SWIFT_PROXY_HOST_PROPERTY;
import static org.apache.hadoop.fs.swift.http.SwiftProtocolConstants.SWIFT_PROXY_PORT_PROPERTY;
import static org.apache.hadoop.fs.swift.http.SwiftProtocolConstants.SWIFT_REGION_PROPERTY;
import static org.apache.hadoop.fs.swift.http.SwiftProtocolConstants.SWIFT_REQUEST_SIZE;
import static org.apache.hadoop.fs.swift.http.SwiftProtocolConstants.SWIFT_RETRY_COUNT;
import static org.apache.hadoop.fs.swift.http.SwiftProtocolConstants.SWIFT_SERVICE_PROPERTY;
import static org.apache.hadoop.fs.swift.http.SwiftProtocolConstants.SWIFT_SOCKET_TIMEOUT;
import static org.apache.hadoop.fs.swift.http.SwiftProtocolConstants.SWIFT_TENANT_PROPERTY;
import static org.apache.hadoop.fs.swift.http.SwiftProtocolConstants.SWIFT_USER_AGENT;
import static org.apache.hadoop.fs.swift.http.SwiftProtocolConstants.SWIFT_OBJECT_AUTH_ENDPOINT;

/**
 * This implements the client-side of the Swift REST API
 *
 * The core actions put, get and query data in the Swift object store,
 * after authenticationg the client.
 *
 * <b>Logging:</b>
 *
 * Logging at DEBUG level displays detail about the actions of this
 * client, including HTTP requests and responses -excluding authentication
 * details.
 */
public final class SwiftRestClient {
  private static final Log LOG = LogFactory.getLog(SwiftRestClient.class);

  /**
   * Header that says "use newest version" -ensures that
   * the query doesn't pick up older versions served by
   * an eventually consistent filesystem (except in the special case
   * of a network partition, at which point no guarantees about
   * consistency can be made.
   */
  public static final Header NEWEST =
          new Header(SwiftProtocolConstants.X_NEWEST, "true");

  private final URI authUri;
  private final String region;
  private final String tenant;
  private final String username;
  private final String password;
  private final String apiKey;
  private final AuthenticationRequest authRequest;
  private final AuthenticationRequest keystoneAuthRequest;
  private final boolean useKeystoneAuthentication;
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
    String isPubProp = props.getProperty(SWIFT_PUBLIC_PROPERTY, "false");
    usePublicURL = "true".equals(isPubProp);

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
    locationAware = "true".equals(
      props.getProperty(SWIFT_LOCATION_AWARE_PROPERTY, "false"));

    try {
      retryCount = conf.getInt(SWIFT_RETRY_COUNT, DEFAULT_RETRY_COUNT);
      connectTimeout = conf.getInt(SWIFT_CONNECTION_TIMEOUT, DEFAULT_CONNECT_TIMEOUT);
      socketTimeout = conf.getInt(SWIFT_SOCKET_TIMEOUT, DEFAULT_SOCKET_TIMEOUT);
      throttleDelay = conf.getInt(SWIFT_THROTTLE_DELAY, DEFAULT_THROTTLE_DELAY);
      proxyHost = conf.get(SWIFT_PROXY_HOST_PROPERTY);
      proxyPort = conf.getInt(SWIFT_PROXY_PORT_PROPERTY, 8080);
      blocksizeKB = conf.getInt(SWIFT_BLOCKSIZE, DEFAULT_SWIFT_BLOCKSIZE);
      if (blocksizeKB <= 0) {
        throw new SwiftConfigurationException("Invalid blocksize set in "
                + SWIFT_BLOCKSIZE + ": " + blocksizeKB);
      }
      partSizeKB = conf.getInt(SWIFT_PARTITION_SIZE, DEFAULT_SWIFT_PARTITION_SIZE);
      if (partSizeKB <= 0) {
        throw new SwiftConfigurationException("Invalid partition size set in "
                + SWIFT_PARTITION_SIZE + ": " + partSizeKB);
      }
      bufferSizeKB = conf.getInt(SWIFT_REQUEST_SIZE, DEFAULT_SWIFT_REQUEST_SIZE);
      if (bufferSizeKB <= 0) {
        throw new SwiftConfigurationException("Invalid buffer size set in "
                + SWIFT_REQUEST_SIZE + ": " + bufferSizeKB);
      }
    } catch (NumberFormatException e) {
      throw new SwiftConfigurationException(e.toString(), e);
    }

    serviceDescription = String.format(
      "Service={%s} container={%s} uri={%s}"
      + " tenant={%s} user={%s} region={%s}"
      + " publicURL={%b}"
      + " location aware={%b}"
      + " partition size={%d KB}, buffer size={%d KB}"
      + " block size={%d KB}"
      + " connect timeout={%d}, retry count={%d}"
      + " socket timeout={%d}"
      + " throttle delay={%d}"
      ,
      serviceProvider,
      container,
      stringAuthUri,
      tenant,
      username,
      region != null ? region : "(none)",
      usePublicURL,
      locationAware,
      partSizeKB,
      bufferSizeKB,
      blocksizeKB,
      connectTimeout,
      retryCount,
      socketTimeout,
      throttleDelay
      );
    if (LOG.isDebugEnabled()) {
      LOG.debug(serviceDescription);
    }
    try {
      this.authUri = new URI(stringAuthUri);
    } catch (URISyntaxException e) {
      throw new SwiftConfigurationException("The " + SWIFT_AUTH_PROPERTY
              + " property was incorrect: "
              + stringAuthUri, e);
    }
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
      throw new SwiftException("Invalid offset: " + offset
              + " in getDataAsInputStream( path=" + path
              + ", offset=" + offset
              + ", length =" + length + ")");
    }
    if (length <= 0) {
      throw new SwiftException("Invalid length: " + length
              + " in getDataAsInputStream( path=" + path
              + ", offset=" + offset
              + ", length ="+ length + ")");
    }

    final String range = String.format(SWIFT_RANGE_HEADER_FORMAT_PATTERN,
            offset,
            offset + length - 1);
    if (LOG.isDebugEnabled()) {
      LOG.debug("getData:" + range);
    }

    return getData(path,
                   new Header(HEADER_RANGE, range),
                   SwiftRestClient.NEWEST);
  }

  public long getContentLength(URI uri) throws IOException {
    preRemoteCommand("getContentLength");
    return perform("getContentLength", uri, new HeadMethodProcessor<Long>() {
      @Override
      public Long extractResult(HeadMethod method) throws IOException {
        return method.getResponseContentLength();
      }

      @Override
      protected void setup(HeadMethod method) throws IOException {
        super.setup(method);
        method.addRequestHeader(NEWEST);
      }
    });
  }

  public long getContentLength(SwiftObjectPath path) throws IOException {
    return getContentLength(pathToURI(path));
  }

  public HttpBodyContent getData(SwiftObjectPath path, final Header... requestHeaders) throws IOException {
    preRemoteCommand("getData");
    return doGet(pathToURI(path), requestHeaders);
  }

  public byte[] getObjectLocation(SwiftObjectPath path, final Header... requestHeaders) throws IOException {
    if (!isLocationAware()) {
      return null;
    }
    preRemoteCommand("getObjectLocation");
    try {
      return perform("getObjectLocation", pathToObjectLocation(path),
              new GetMethodProcessor<byte[]>() {
                @Override
                protected int[] getAllowedStatusCodes() {
                  return new int[]{
                    SC_OK,
                    SC_FORBIDDEN,
                    SC_NO_CONTENT
                  };
                }

                @Override
                public byte[] extractResult(GetMethod method) throws IOException {
                  if (method.getStatusCode() == SC_NOT_FOUND
                      || method.getStatusCode() == SC_FORBIDDEN ||
                          method.getStatusCode() == SC_NO_CONTENT ||
                          method.getResponseBodyAsStream() == null) {
                    return null;
                  }
                  final InputStream responseBodyAsStream = method.getResponseBodyAsStream();
                  final byte[] locationData = new byte[1024];
                  return responseBodyAsStream.read(locationData) > 0 ? locationData : null;
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
    URI uri;
    String dataLocationURI = objectLocationURI.toString();
    try {
      if (path.toString().startsWith("/")) {
        dataLocationURI = dataLocationURI.concat(path.toUriPath());
      } else {
        dataLocationURI = dataLocationURI.concat("/").concat(path.toUriPath());
      }
      uri = new URI(dataLocationURI);
    } catch (URISyntaxException e) {
      throw new SwiftException(e);
    }
    return uri;
  }

  public byte[] findObjectsByPrefix(SwiftObjectPath path, final Header... requestHeaders) throws IOException {
    preRemoteCommand("findObjectsByPrefix");
    URI uri;
    String dataLocationURI = getEndpointURI().toString();
    try {
      String object = path.getObject();
      if (object.startsWith("/")) {
        object = object.substring(1);
      }
      object = encodeUrl(object);
      dataLocationURI = dataLocationURI.concat("/")
              .concat(path.getContainer())
              .concat("/?prefix=")
              .concat(object);
      uri = new URI(dataLocationURI);
    } catch (URISyntaxException e) {
      throw new SwiftException("Bad URI: " + dataLocationURI, e);
    }

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
        return new int[]{
                SC_OK,
                SC_NOT_FOUND
        };
      }

      @Override
      protected void setup(GetMethod method) throws SwiftInternalStateException {
        setHeaders(method, requestHeaders);
      }
    });
  }

  public byte[] listDeepObjectsInDirectory(SwiftObjectPath path, boolean listDeep, final Header... requestHeaders) throws IOException {
    preRemoteCommand("listDeepObjectsInDirectory");

    String endpoint = getEndpointURI().toString();
    StringBuilder dataLocationURI = new StringBuilder();
    dataLocationURI.append(endpoint);
    String object = path.getObject();
    if (object.startsWith("/")) {
      object = object.substring(1);
    }
    if (!object.endsWith("/")) {
      object = object.concat("/");
    }

    if (object.equals("/")) {
      object = "";
    }

    dataLocationURI = dataLocationURI.append("/")
            .append(path.getContainer())
            .append("/?prefix=")
            .append(object)
            .append("&format=json");

    if (!listDeep) {
      dataLocationURI.append("&delimiter=/");
    }

    return findObjects(dataLocationURI.toString(), requestHeaders);
  }

  private byte[] findObjects(String location, final Header[] requestHeaders) throws IOException {
    URI uri;
    preRemoteCommand("findObjects");
    try {
      uri = new URI(location);
    } catch (URISyntaxException e) {
      throw new SwiftException("Bad URI: " + location, e);
    }

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
        return new int[]{
                SC_OK,
                SC_NOT_FOUND
        };
      }

      @Override
      protected void setup(GetMethod method) throws SwiftInternalStateException {
        setHeaders(method, requestHeaders);
      }
    });
  }

  public boolean copyObject(SwiftObjectPath src, final SwiftObjectPath dst, final Header... headers) throws IOException {
    preRemoteCommand("copyObject");

    return perform("copy", pathToURI(src), new CopyMethodProcessor<Boolean>() {
      @Override
      public Boolean extractResult(CopyMethod method) throws IOException {
        return method.getStatusCode() != SC_NOT_FOUND;
      }

      @Override
      protected void setup(CopyMethod method) throws SwiftInternalStateException {
        setHeaders(method, headers);
        method.addRequestHeader(HEADER_DESTINATION, dst.toUriPath());
      }
    });
  }

  public void upload(SwiftObjectPath path, final InputStream data, final long length, final Header... requestHeaders) throws IOException {
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

  public boolean delete(SwiftObjectPath path, final Header... requestHeaders) throws IOException {
    preRemoteCommand("delete");

    return perform("", pathToURI(path), new DeleteMethodProcessor<Boolean>() {
      @Override
      public Boolean extractResult(DeleteMethod method) throws IOException {
        return method.getStatusCode() == SC_NO_CONTENT;
      }

      @Override
      protected void setup(DeleteMethod method) throws SwiftInternalStateException {
        setHeaders(method, requestHeaders);
      }
    });
  }

  public Header[] headRequest(String reason, SwiftObjectPath path, final Header... requestHeaders) throws IOException {
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

  public int putRequest(SwiftObjectPath path, final Header... requestHeaders) throws IOException {
    preRemoteCommand("putRequest");
    return perform(pathToURI(path), new PutMethodProcessor<Integer>() {
      @Override
      public Integer extractResult(PutMethod method) throws IOException {
        return method.getStatusCode();
      }

      @Override
      protected void setup(PutMethod method) throws SwiftInternalStateException {
        setHeaders(method, requestHeaders);
      }
    });
  }

  public AccessToken authenticate() throws IOException {
    final AuthenticationRequest authenticationRequest = useKeystoneAuthentication ? keystoneAuthRequest : authRequest;

    LOG.debug("started authentication");
    return perform("authentication", authUri, new AuthenticationPost(authenticationRequest));
  }

  private class AuthenticationPost extends AuthMethodProcessor<AccessToken> {
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
      return new int[]{
        SC_OK,
        SC_BAD_REQUEST,
        SC_CREATED,
        SC_ACCEPTED,
        SC_NON_AUTHORITATIVE_INFORMATION,
        SC_NO_CONTENT,
        SC_RESET_CONTENT,
        SC_PARTIAL_CONTENT,
        SC_MULTI_STATUS,
        SC_UNAUTHORIZED
      };
    }

    @Override
    public AccessToken extractResult(AuthPostMethod method) throws IOException {
      if (method.getStatusCode() == SC_BAD_REQUEST) {
        throw new SwiftAuthenticationFailedException(
          authenticationRequest.toString(), "POST", authUri, method);
      }

      final AuthenticationResponse access =
        JSONUtil.toObject(method.getResponseBodyAsString(),
                          AuthenticationWrapper.class).getAccess();
      final List<Catalog> serviceCatalog = access.getServiceCatalog();
      boolean catalogMatch = false;
      StringBuilder catList = new StringBuilder();
      StringBuilder regionList = new StringBuilder();

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
        if (name.equals(SERVICE_CATALOG_SWIFT)
            || name.equals(SERVICE_CATALOG_CLOUD_FILES)
            || type.equals(SERVICE_CATALOG_OBJECT_STORE)) {
          if (LOG.isDebugEnabled()) {
            LOG.debug("Found swift catalog as " + name + " => " + type);
          }
          for (Endpoint endpoint : catalog.getEndpoints()) {
            String endpointRegion = endpoint.getRegion();
            URI publicURL = endpoint.getPublicURL();
            URI internalURL = endpoint.getInternalURL();
            descr = String.format("[%s => %s / %s]; ",
                                  endpointRegion,
                                  publicURL,
                                  internalURL);
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
        String message = "Could not find swift service from auth URL "
                         + authUri
                         + " and region '" + region + "'. "
                         + "Categories: " + catList
                         + ((regionList.length() > 0) ?
                            ("regions: " + regionList)
                                                      : "No regions");
        throw new SwiftInvalidResponseException(message,
                                                SC_OK,
                                                "authenticating",
                                                authUri);
      }

      accessToken = access.getToken();
      String path = SWIFT_OBJECT_AUTH_ENDPOINT + swiftEndpoint.getTenantId();
      String host = endpointURI.getHost();
      try {
        objectLocation = new URI(endpointURI.getScheme(),
                                 null,
                                 host,
                                 endpointURI.getPort(),
                                 path,
                                 null,
                                 null);
      } catch (URISyntaxException e) {
        throw new SwiftException("object endpoint URI is incorrect: "
                                 + endpointURI
                                 + " + " + path,
                                 e);
      }
      setAuthDetails(endpointURI, objectLocation, accessToken);

      if (LOG.isDebugEnabled()) {
        LOG.debug("authenticated against " + endpointURI);
      }
      createDefaultContainer();
      return accessToken;
    }
  }

  private StringRequestEntity getAuthenticationRequst(AuthenticationRequest authenticationRequest) throws IOException {
    final String data = JSONUtil.toJSON(new AuthenticationRequestWrapper(authenticationRequest));
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
      int status = 0;
      try {
        status = putRequest(objectPath);
      } catch (FileNotFoundException e) {
        status = SC_NOT_FOUND;
      }
      if (status == SC_BAD_REQUEST) {
        throw new SwiftBadRequestException(
          "Bad request -authentication failure or bad container name?",
          status,
          "PUT",
          null);
      }
      if (!isStatusCodeExpected(status, SC_OK, SC_CREATED, SC_ACCEPTED, SC_NO_CONTENT)) {
        throw new SwiftInvalidResponseException("Couldn't create container "
                + containerName +
                " for storing data in Swift." +
                " Try to create container " +
                containerName + " manually ",
                status,
                "PUT",
                null);
      } else {
        throw ex;
      }
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

  private <M extends HttpMethod, R> R perform(URI uri, HttpMethodProcessor<M, R> processor) throws IOException, SwiftBadRequestException, SwiftInternalStateException, SwiftInvalidResponseException, FileNotFoundException {
    return perform("", uri, processor);
  }

  private <M extends HttpMethod, R> R perform(String reason, URI uri, HttpMethodProcessor<M, R> processor) throws IOException, SwiftBadRequestException, SwiftInternalStateException, SwiftInvalidResponseException, FileNotFoundException {
    checkNotNull(uri);
    checkNotNull(processor);

    final M method = processor.createMethod(uri.toString());

    HttpMethodParams methodParams = method.getParams();
    methodParams.setParameter(HttpMethodParams.RETRY_HANDLER,
            new DefaultHttpMethodRetryHandler(retryCount, false));
    methodParams.setIntParameter(HttpConnectionParams.CONNECTION_TIMEOUT, connectTimeout);
    methodParams.setSoTimeout(socketTimeout);
    method.addRequestHeader(HEADER_USER_AGENT, SWIFT_USER_AGENT);
    Duration duration = new Duration();
    boolean success = false;
    try {
      int statusCode = 0;
      try {
        statusCode = exec(method);
      } catch (IOException e) {
        throw ExceptionDiags.wrapException(uri.toString(), method.getName(), e);
      }

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
      method.releaseConnection();
      throw e;
    } finally {
      duration.finished();
      durationStats.add(method.getName() + " " + reason, duration, success);
    }
  }

  private <M extends HttpMethod> IOException buildException(URI uri, M method, int statusCode) {
    IOException fault;

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

    switch (statusCode) {
      case SC_NOT_FOUND:
        fault = new FileNotFoundException("Operation " + method.getName() + " on " + uri);
        break;

      case SC_BAD_REQUEST:
        fault = new SwiftBadRequestException(
          "Bad request against " + uri,
          method.getName(),
          uri,
          method);
        break;

      case SC_REQUESTED_RANGE_NOT_SATISFIABLE:
        StringBuilder errorText = new StringBuilder(method.getStatusText());
        Header requestContentLen = method.getRequestHeader(HEADER_CONTENT_LENGTH);
        if (requestContentLen != null) {
          errorText.append(" requested ").append(requestContentLen.getValue());
        }
        Header availableContentRange = method.getResponseHeader(HEADER_CONTENT_RANGE);
        if (requestContentLen != null) {
          errorText.append(" available ").append(availableContentRange.getValue());
        }
        fault = new EOFException(errorText.toString());
        break;

      case SC_UNAUTHORIZED:
        fault = new SwiftAuthenticationFailedException(
                        "Operation not authorized- current access token ="
                            + getToken(),
                        method.getName(),
                        uri,
                        method);
        break;

      case SC_TOO_MANY_REQUESTS_429:
      case SC_THROTTLED_498:
        fault = new SwiftThrottledRequestException(
                        "Client is being throttled: too many requests",
                        method.getName(),
                        uri,
                        method);
        break;

      default:
        fault = new SwiftInvalidResponseException(
                errorMessage,
                method.getName(),
                uri,
                method);
    }

    return fault;
  }

  private HttpBodyContent doGet(final URI uri, final Header... requestHeaders) throws IOException {
    return perform("", uri, new GetMethodProcessor<HttpBodyContent>() {
      @Override
      public HttpBodyContent extractResult(GetMethod method) throws IOException {
        return
          new HttpBodyContent(
            new HttpInputStreamWithRelease(uri, method), method.getResponseContentLength()
          );
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
    StringRequestEntity entity;
    try {
      entity = new StringRequestEntity(data, "application/json", "UTF-8");
    } catch (UnsupportedEncodingException e) {
      throw new SwiftException("Could not encode data as UTF-8", e);
    }
    return entity;
  }

  public static URI pathToURI(SwiftObjectPath path, URI endpointURI) throws SwiftException {
    checkNotNull(endpointURI, "Null Endpoint -client is not authenticated");

    String dataLocationURI = endpointURI.toString();
    try {
      dataLocationURI = SwiftUtils.joinPaths(dataLocationURI, encodeUrl(path.toUriPath()));
      return new URI(dataLocationURI);
    } catch (URISyntaxException e) {
      throw new SwiftException("Failed to create URI from " + dataLocationURI, e);
    }
  }

  private static String encodeUrl(String url) throws SwiftException {
    if (url.matches(".*\\s+.*")) {
      try {
        url = URLEncoder.encode(url, "UTF-8");
        url = url.replace("+", "%20");
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

  private void setAuthToken(HttpMethodBase method, AccessToken accessToken) throws SwiftInternalStateException {
    checkNotNull(accessToken, "Not authenticated");
    method.addRequestHeader(HEADER_AUTH_KEY, accessToken.getId());
  }

  private <M extends HttpMethod> int exec(M method) throws IOException {
    final HttpClient client = new HttpClient();
    if (proxyHost != null) {
      client.getParams().setParameter(ConnRoutePNames.DEFAULT_PROXY,
              new HttpHost(proxyHost, proxyPort));
    }

    int statusCode = execWithDebugOutput(method, client);

    if ((statusCode == HttpStatus.SC_UNAUTHORIZED || statusCode == HttpStatus.SC_BAD_REQUEST)
            && method instanceof AuthPostMethod
            && !useKeystoneAuthentication) {
      if (LOG.isDebugEnabled()) {
        LOG.debug("Operation failed with status " + method.getStatusCode() +
                 " attempting keystone auth");
      }
      useKeystoneAuthentication = true;
      final AuthPostMethod authentication = (AuthPostMethod) method;
      authentication.setRequestEntity(getAuthenticationRequst(keystoneAuthRequest));
      statusCode = execWithDebugOutput(method, client);
    }

    if (statusCode == HttpStatus.SC_UNAUTHORIZED) {
      if (method instanceof AuthPostMethod) {
        throw new SwiftAuthenticationFailedException(authRequest.toString(),
                                                       "auth",
                                                       authUri,
                                                       method);
      }
      if (LOG.isDebugEnabled()) {
        LOG.debug("Reauthenticating");
      }
      authenticate();
      if (LOG.isDebugEnabled()) {
        LOG.debug("Retrying original request");
      }
      statusCode = execWithDebugOutput(method, client);
    }
    return statusCode;
  }

  private <M extends HttpMethod> int execWithDebugOutput(M method, HttpClient client) throws IOException {
    if (LOG.isDebugEnabled()) {
      StringBuilder builder = new StringBuilder(
              method.getName() + " " + method.getURI() + "\n");
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

  private static final int DEFAULT_RETRY_COUNT = 3;
  private static final int DEFAULT_CONNECT_TIMEOUT = 10000;
  private static final int DEFAULT_SOCKET_TIMEOUT = 60000;
  private static final int DEFAULT_THROTTLE_DELAY = 1000;
  private static final int DEFAULT_SWIFT_BLOCKSIZE = 65536;
  private static final int DEFAULT_SWIFT_PARTITION_SIZE = 4096;
  private static final int DEFAULT_SWIFT_REQUEST_SIZE = 1024;
}