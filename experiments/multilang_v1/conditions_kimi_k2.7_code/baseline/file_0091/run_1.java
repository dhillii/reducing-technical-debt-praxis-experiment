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

  /**
   * the authentication endpoint as supplied in the configuration
   */
  private final URI authUri;

  /**
   * Swift region. Some OpenStack installations has more than one region.
   * In this case user can specify the region with which Hadoop will be working
   */
  private final String region;

  /**
   * tenant name
   */
  private final String tenant;

  /**
   * username name
   */
  private final String username;

  /**
   * user password
   */
  private final String password;

  /**
   * user api key
   */
  private final String apiKey;

  /**
   * The authentication request used to authenticate with Swift
   */
  private final AuthenticationRequest authRequest;

  /**
   * This auth request is similar to @see authRequest,
   * with one difference: it has another json representation when
   * authRequest one is not applicable
   */
  private AuthenticationRequest keystoneAuthRequest;

  private boolean useKeystoneAuthentication = false;

    /**
   * The container this client is working with
   */
  private final String container;
  private final String serviceDescription;

  /**
   * Access token (Secret)
   */
  private AccessToken token;

  /**
   * Endpoint for swift operations, obtained after authentication
   */
  private URI endpointURI;

  /**
   * URI under which objects can be found.
   * This is set when the user is authenticated -the URI
   * is returned in the body of the success response.
   */
  private URI objectLocationURI;

  private final URI filesystemURI;

  /**
   * The name of the service provider
   */
  private final String serviceProvider;

  /**
   * Should the public swift endpoint be used, rather than the in-cluster one?
   */
  private final boolean usePublicURL;

  /**
   * Number of times to retry a connection
   */
  private final int retryCount;

  /**
   * How long (in milliseconds) should a connection be attempted
   */
  private final int connectTimeout;

  /**
   * How long (in milliseconds) should a connection be attempted
   */
  private final int socketTimeout;

  /**
   * How long (in milliseconds) between bulk operations
   */
  private final int throttleDelay;

  /**
  * the name of a proxy host (can be null, in which case there is no proxy)
   */
  private String proxyHost;

  /**
   * The port of a proxy. This is ignored if {@link #proxyHost} is null
   */
  private int proxyPort;

  /**
   * Flag to indicate whether or not the client should
   * query for file location data.
   */
  private final boolean locationAware;

  private final int partSizeKB;
  /**
   * The blocksize of this FS
   */
  private final int blocksizeKB;
  private final int bufferSizeKB;

  private final DurationStatsTable durationStats = new DurationStatsTable();
  /**
   * objects query endpoint. This is synchronized
   * to handle a simultaneous update of all auth data in one
   * go.
   */
  private synchronized URI getEndpointURI() {
    return endpointURI;
  }

  /**
   * object location endpoint
   */
  private synchronized URI getObjectLocationURI() {
    return objectLocationURI;
  }

  /**
   * token for Swift communication
   */
  private synchronized AccessToken getToken() {
    return token;
  }

  /**
   * Setter of authentication and endpoint details.
   * Being synchronized guarantees that all three fields are set up together.
   * It is up to the reader to read all three fields in their own
   * synchronized block to be sure that they are all consistent.
   *
   * @param endpoint endpoint URI
   * @param objectLocation object location URI
   * @param authToken auth token
   */
  private void setAuthDetails(URI endpoint,
                              URI objectLocation,
                              AccessToken authToken) {
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


  /**
   * Base class for all Swift REST operations
   *
   * @param <M> method
   * @param <R> result
   */
  private static abstract class HttpMethodProcessor<M extends HttpMethod, R> {
    public final M createMethod(String uri) throws IOException {
      final M method = doCreateMethod(uri);
      setup(method);
      return method;
    }

    /**
     * Override it to return some result after method is executed.
     */
    public abstract R extractResult(M method) throws IOException;

    /**
     * Factory method to create a REST method against the given URI
     *
     * @param uri target
     * @return method to invoke
     */
    protected abstract M doCreateMethod(String uri);

    /**
     * Override port to set up the method before it is executed.
     */
    protected void setup(M method) throws IOException {
    }

    /**
     * Override point: what are the status codes that this operation supports
     *
     * @return an array with the permitted status code(s)
     */
    protected int[] getAllowedStatusCodes() {
      return new int[]{
              SC_OK,
              SC_CREATED,
              SC_ACCEPTED,
              SC_NO_CONTENT,
              SC_PARTIAL_CONTENT,
      };
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

  /**
   * There's a special type for auth messages, so that low-level
   * message handlers can react to auth failures differently from everything
   * else.
   */
  private static class AuthPostMethod extends PostMethod {


    private AuthPostMethod(String uri) {
      super(uri);
    }
  }

  /**
   * Generate an auth message
   * @param <R> response
   */
  private static abstract class AuthMethodProcessor<R> extends
                                                       HttpMethodProcessor<AuthPostMethod, R> {
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

    /**
     * Override point: what are the status codes that this operation supports
     *
     * @return the list of status codes to accept
     */
    @Override
    protected int[] getAllowedStatusCodes() {
      return new int[]{
              SC_OK,
              SC_CREATED,
              SC_NO_CONTENT,
              SC_ACCEPTED,
      };
    }
  }

  /**
   * Create operation
   *
   * @param <R>
   */
  private static abstract class CopyMethodProcessor<R> extends HttpMethodProcessor<CopyMethod, R> {
    @Override
    protected final CopyMethod doCreateMethod(String uri) {
      return new CopyMethod(uri);
    }

    /**
     * The only allowed status code is 201:created
     * @return an array with the permitted status code(s)
     */
    @Override
    protected int[] getAllowedStatusCodes() {
      return new int[]{
              SC_CREATED
      };
    }
  }

  /**
   * Delete operation
   *
   * @param <R>
   */
  private static abstract class DeleteMethodProcessor<R> extends HttpMethodProcessor<DeleteMethod, R> {
    @Override
    protected final DeleteMethod doCreateMethod(String uri) {
      return new DeleteMethod(uri);
    }

    @Override
    protected int[] getAllowedStatusCodes() {
      return new int[]{
              SC_OK,
              SC_ACCEPTED,
              SC_NO_CONTENT,
              SC_NOT_FOUND
      };
    }
  }

  private static abstract class HeadMethodProcessor<R> extends HttpMethodProcessor<HeadMethod, R> {
    @Override
    protected final HeadMethod doCreateMethod(String uri) {
      return new HeadMethod(uri);
    }
  }

  /**
   * Immutable configuration data extracted from Hadoop configuration.
   */
  private static final class ClientConfig {
    final URI authUri;
    final String region;
    final String tenant;
    final String username;
    final String password;
    final String apiKey;
    final String container;
    final String serviceProvider;
    final boolean usePublicURL;
    final boolean locationAware;
    final int retryCount;
    final int connectTimeout;
    final int socketTimeout;
    final int throttleDelay;
    final String proxyHost;
    final int proxyPort;
    final int partSizeKB;
    final int blocksizeKB;
    final int bufferSizeKB;
    final String serviceDescription;

    private ClientConfig(URI authUri, String region, String tenant, String username,
                         String password, String apiKey, String container,
                         String serviceProvider, boolean usePublicURL,
                         boolean locationAware, int retryCount, int connectTimeout,
                         int socketTimeout, int throttleDelay, String proxyHost,
                         int proxyPort, int partSizeKB, int blocksizeKB,
                         int bufferSizeKB, String serviceDescription) {
      this.authUri = authUri;
      this.region = region;
      this.tenant = tenant;
      this.username = username;
      this.password = password;
      this.apiKey = apiKey;
      this.container = container;
      this.serviceProvider = serviceProvider;
      this.usePublicURL = usePublicURL;
      this.locationAware = locationAware;
      this.retryCount = retryCount;
      this.connectTimeout = connectTimeout;
      this.socketTimeout = socketTimeout;
      this.throttleDelay = throttleDelay;
      this.proxyHost = proxyHost;
      this.proxyPort = proxyPort;
      this.partSizeKB = partSizeKB;
      this.blocksizeKB = blocksizeKB;
      this.bufferSizeKB = bufferSizeKB;
      this.serviceDescription = serviceDescription;
    }

    static ClientConfig from(URI filesystemURI, Configuration conf)
        throws SwiftConfigurationException {
      Properties props = RestClientBindings.bind(filesystemURI, conf);
      String stringAuthUri = getOption(props, SWIFT_AUTH_PROPERTY);
      String username = getOption(props, SWIFT_USERNAME_PROPERTY);
      String password = props.getProperty(SWIFT_PASSWORD_PROPERTY);
      String apiKey = props.getProperty(SWIFT_APIKEY_PROPERTY);
      validateCredentials(filesystemURI, password, apiKey);

      String region = props.getProperty(SWIFT_REGION_PROPERTY);
      String tenant = props.getProperty(SWIFT_TENANT_PROPERTY);
      String serviceProvider = props.getProperty(SWIFT_SERVICE_PROPERTY);
      String container = props.getProperty(SWIFT_CONTAINER_PROPERTY);
      boolean usePublicURL = "true".equals(
          props.getProperty(SWIFT_PUBLIC_PROPERTY, "false"));
      boolean locationAware = "true".equals(
          props.getProperty(SWIFT_LOCATION_AWARE_PROPERTY, "false"));

      int retryCount = readInt(conf, SWIFT_RETRY_COUNT, DEFAULT_RETRY_COUNT);
      int connectTimeout = readInt(conf, SWIFT_CONNECTION_TIMEOUT,
                                   DEFAULT_CONNECT_TIMEOUT);
      int socketTimeout = readInt(conf, SWIFT_SOCKET_TIMEOUT,
                                  DEFAULT_SOCKET_TIMEOUT);
      int throttleDelay = readInt(conf, SWIFT_THROTTLE_DELAY,
                                  DEFAULT_THROTTLE_DELAY);

      String proxyHost = conf.get(SWIFT_PROXY_HOST_PROPERTY);
      int proxyPort = conf.getInt(SWIFT_PROXY_PORT_PROPERTY, 8080);

      int blocksizeKB = readPositiveInt(conf, SWIFT_BLOCKSIZE,
                                        DEFAULT_SWIFT_BLOCKSIZE);
      int partSizeKB = readPositiveInt(conf, SWIFT_PARTITION_SIZE,
                                       DEFAULT_SWIFT_PARTITION_SIZE);
      int bufferSizeKB = readPositiveInt(conf, SWIFT_REQUEST_SIZE,
                                         DEFAULT_SWIFT_REQUEST_SIZE);

      URI authUri = parseAuthUri(stringAuthUri);
      String serviceDescription = buildServiceDescription(
          serviceProvider, container, stringAuthUri, tenant, username, region,
          usePublicURL, locationAware, partSizeKB, bufferSizeKB, blocksizeKB,
          connectTimeout, retryCount, socketTimeout, throttleDelay);

      return new ClientConfig(authUri, region, tenant, username, password, apiKey,
          container, serviceProvider, usePublicURL, locationAware, retryCount,
          connectTimeout, socketTimeout, throttleDelay, proxyHost, proxyPort,
          partSizeKB, blocksizeKB, bufferSizeKB, serviceDescription);
    }
  }

  /**
   * Create a Swift Rest Client instance.
   *
   * @param filesystemURI filesystem URI
   * @param conf The configuration to use to extract the binding
   * @throws SwiftConfigurationException the configuration is not valid for
   * defining a rest client against the service
   */
  private SwiftRestClient(URI filesystemURI,
                          Configuration conf)
      throws SwiftConfigurationException {
    this.filesystemURI = filesystemURI;
    ClientConfig config = ClientConfig.from(filesystemURI, conf);
    this.authUri = config.authUri;
    this.region = config.region;
    this.tenant = config.tenant;
    this.username = config.username;
    this.password = config.password;
    this.apiKey = config.apiKey;
    this.container = config.container;
    this.serviceProvider = config.serviceProvider;
    this.usePublicURL = config.usePublicURL;
    this.authRequest = createAuthRequest(config);
    this.keystoneAuthRequest = createKeystoneAuthRequest(config);
    this.locationAware = config.locationAware;
    this.retryCount = config.retryCount;
    this.connectTimeout = config.connectTimeout;
    this.socketTimeout = config.socketTimeout;
    this.throttleDelay = config.throttleDelay;
    this.proxyHost = config.proxyHost;
    this.proxyPort = config.proxyPort;
    this.partSizeKB = config.partSizeKB;
    this.blocksizeKB = config.blocksizeKB;
    this.bufferSizeKB = config.bufferSizeKB;
    this.serviceDescription = config.serviceDescription;

    if (LOG.isDebugEnabled()) {
      LOG.debug(serviceDescription);
    }
  }

  private static AuthenticationRequest createAuthRequest(ClientConfig config) {
    if (config.password != null) {
      return new PasswordAuthenticationRequest(config.tenant,
              new PasswordCredentials(config.username, config.password));
    }
    return new ApiKeyAuthenticationRequest(config.tenant,
            new ApiKeyCredentials(config.username, config.apiKey));
  }

  private static AuthenticationRequest createKeystoneAuthRequest(ClientConfig config) {
    if (config.apiKey != null) {
      return new KeyStoneAuthRequest(config.tenant,
              new KeystoneApiKeyCredentials(config.username, config.apiKey));
    }
    return null;
  }

  private static void validateCredentials(URI filesystemURI,
                                          String password,
                                          String apiKey)
      throws SwiftConfigurationException {
    if (apiKey == null && password == null) {
      throw new SwiftConfigurationException(
              "Configuration for " + filesystemURI + " must contain either "
                      + SWIFT_PASSWORD_PROPERTY + " or "
                      + SWIFT_APIKEY_PROPERTY);
    }
  }

  private static int readInt(Configuration conf, String key, int defaultValue)
      throws SwiftConfigurationException {
    try {
      return conf.getInt(key, defaultValue);
    } catch (NumberFormatException e) {
      throw new SwiftConfigurationException(
          "Invalid integer for " + key + ": " + e, e);
    }
  }

  private static int readPositiveInt(Configuration conf, String key, int defaultValue)
      throws SwiftConfigurationException {
    int value = readInt(conf, key, defaultValue);
    if (value <= 0) {
      throw new SwiftConfigurationException(
          "Invalid value set in " + key + ": " + value);
    }
    return value;
  }

  private static URI parseAuthUri(String stringAuthUri)
      throws SwiftConfigurationException {
    try {
      return new URI(stringAuthUri);
    } catch (URISyntaxException e) {
      throw new SwiftConfigurationException("The " + SWIFT_AUTH_PROPERTY
              + " property was incorrect: "
              + stringAuthUri, e);
    }
  }

  private static String buildServiceDescription(String serviceProvider,
                                                String container,
                                                String stringAuthUri,
                                                String tenant,
                                                String username,
                                                String region,
                                                boolean usePublicURL,
                                                boolean locationAware,
                                                int partSizeKB,
                                                int bufferSizeKB,
                                                int blocksizeKB,
                                                int connectTimeout,
                                                int retryCount,
                                                int socketTimeout,
                                                int throttleDelay) {
    return String.format(
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
  }

  /**
   * Get a mandatory configuration option
   *
   * @param props property set
   * @param key   key
   * @return value of the configuration
   * @throws SwiftConfigurationException if there was no match for the key
   */
  private static String getOption(Properties props, String key) throws
          SwiftConfigurationException {
    String val = props.getProperty(key);
    if (val == null) {
      throw new SwiftConfigurationException("Undefined property: " + key);
    }
    return val;
  }

  /**
   * Make an HTTP GET request to Swift to get a range of data in the object.
   *
   * @param path   path to object
   * @param offset offset from file beginning
   * @param length file length
   * @return The input stream -which must be closed afterwards.
   * @throws IOException Problems
   * @throws SwiftException swift specific error
   * @throws FileNotFoundException path is not there
   */
  public HttpBodyContent getData(SwiftObjectPath path,
                                 long offset,
                                 long length) throws IOException {
    validateRange(offset, length, path);

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

  private static void validateRange(long offset, long length, SwiftObjectPath path)
      throws SwiftException {
    if (offset < 0) {
      throw new SwiftException("Invalid offset: " + offset
                            + " in getDataAsInputStream( path=" + path
                            + ", offset=" + offset
                            + ", length =" + length + ")");
    }
    if (length <= 0) {
      throw new SwiftException("Invalid length: " + length
                + " in getDataAsInputStream( path="+ path
                            + ", offset=" + offset
                            + ", length ="+ length + ")");
    }
  }

  /**
   * Returns object length
   *
   * @param uri file URI
   * @return object length
   * @throws SwiftException on swift-related issues
   * @throws IOException on network/IO problems
   */
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

  /**
   * Get the length of the remote object
   * @param path object to probe
   * @return the content length
   * @throws IOException on any failure
   */
  public long getContentLength(SwiftObjectPath path) throws IOException {
    return getContentLength(pathToURI(path));
  }

  /**
   * Get the path contents as an input stream.
   * <b>Warning:</b> this input stream must be closed to avoid
   * keeping Http connections open.
   *
   * @param path path to file
   * @param requestHeaders http headers
   * @return byte[] file data or null if the object was not found
   * @throws IOException on IO Faults
   * @throws FileNotFoundException if there is nothing at the path
   */
  public HttpBodyContent getData(SwiftObjectPath path,
                                 final Header... requestHeaders)
          throws IOException {
    preRemoteCommand("getData");
    return doGet(pathToURI(path),
            requestHeaders);
  }

  /**
   * Returns object location as byte[]
   *
   * @param path path to file
   * @param requestHeaders http headers
   * @return byte[] file data or null if the object was not found
   * @throws IOException on IO Faults
   */
  public byte[] getObjectLocation(SwiftObjectPath path,
                                  final Header... requestHeaders) throws IOException {
    if (!isLocationAware()) {
      //if the filesystem is not location aware, do not ask for this information
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
                public byte[] extractResult(GetMethod method) throws
                        IOException {

                  //TODO: remove SC_NO_CONTENT if it depends on Swift versions
                  int status = method.getStatusCode();
                  if (status == SC_NOT_FOUND
                      || status == SC_FORBIDDEN ||
                      status == SC_NO_CONTENT) {
                    return null;
                  }
                  final InputStream responseBodyAsStream = method.getResponseBodyAsStream();
                  if (responseBodyAsStream == null) {
                    return null;
                  }
                  final byte[] locationData = new byte[1024];

                  return responseBodyAsStream.read(locationData) > 0 ? locationData : null;
                }

                @Override
                     protected void setup(GetMethod method)
                       throws SwiftInternalStateException {
                  setHeaders(method, requestHeaders);
                }
              });
    } catch (IOException e) {
      LOG.warn("Failed to get the location of " + path + ": " + e, e);
      return null;
    }
  }

  /**
   * Create the URI needed to query the location of an object
   * @param path object path to retrieve information about
   * @return the URI for the location operation
   * @throws SwiftException if the URI could not be constructed
   */
  private URI pathToObjectLocation(SwiftObjectPath path) throws SwiftException {
    try {
      return new URI(SwiftUtils.joinPaths(objectLocationURI.toString(),
                                          path.toUriPath()));
    } catch (URISyntaxException e) {
      throw new SwiftException(e);
    }
  }

  /**
   * Find objects under a prefix
   *
   * @param path path prefix
   * @param requestHeaders optional request headers
   * @return byte[] file data or null if the object was not found
   * @throws IOException on IO Faults
   * @throws FileNotFoundException if nothing is at the end of the URI -that is,
   * the directory is empty
   */
  public byte[] findObjectsByPrefix(SwiftObjectPath path,
                                    final Header... requestHeaders) throws IOException {
    preRemoteCommand("findObjectsByPrefix");
    URI uri = buildPrefixQueryURI(getEndpointURI().toString(), path);

    return perform("findObjectsByPrefix", uri, new GetMethodProcessor<byte[]>() {
      @Override
      public byte[] extractResult(GetMethod method) throws IOException {
        if (method.getStatusCode() == SC_NOT_FOUND) {
          //no result
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
      protected void setup(GetMethod method) throws
                     SwiftInternalStateException {
        setHeaders(method, requestHeaders);
      }
    });
  }

  private static URI buildPrefixQueryURI(String endpoint, SwiftObjectPath path)
      throws SwiftException {
    String object = path.getObject();
    if (object.startsWith("/")) {
      object = object.substring(1);
    }
    object = encodeUrl(object);
    String dataLocationURI = endpoint.concat("/")
            .concat(path.getContainer())
            .concat("/?prefix=")
            .concat(object);
    try {
      return new URI(dataLocationURI);
    } catch (URISyntaxException e) {
      throw new SwiftException("Bad URI: " + dataLocationURI, e);
    }
  }

  /**
   * Find objects in a directory
   *
   * @param path path prefix
   * @param requestHeaders optional request headers
   * @return byte[] file data or null if the object was not found
   * @throws IOException on IO Faults
   * @throws FileNotFoundException if nothing is at the end of the URI -that is,
   * the directory is empty
   */
  public byte[] listDeepObjectsInDirectory(SwiftObjectPath path,
                                           boolean listDeep,
                                       final Header... requestHeaders)
          throws IOException {
    preRemoteCommand("listDeepObjectsInDirectory");

    String location = buildDirectoryQueryURI(getEndpointURI().toString(),
                                             path,
                                             listDeep);
    return findObjects(location, requestHeaders);
  }

  private static String buildDirectoryQueryURI(String endpoint,
                                               SwiftObjectPath path,
                                               boolean listDeep) {
    StringBuilder dataLocationURI = new StringBuilder(endpoint);
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

    dataLocationURI.append("/")
            .append(path.getContainer())
            .append("/?prefix=")
            .append(object)
            .append("&format=json");

    if (!listDeep) {
        dataLocationURI.append("&delimiter=/");
    }

    return dataLocationURI.toString();
  }

  /**
   * Find objects in a location
   * @param location URI
   * @param requestHeaders optional request headers
   * @return the body of te response
   * @throws IOException IO problems
   */
  private byte[] findObjects(String location, final Header[] requestHeaders) throws
          IOException {
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
          //no result
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
      protected void setup(GetMethod method)
        throws SwiftInternalStateException {
        setHeaders(method, requestHeaders);
      }
    });
  }

  /**
   * Copy an object. This is done by sending a COPY method to the filesystem
   * which is required to handle this WebDAV-level extension to the
   * base HTTP operations.
   *
   * @param src source path
   * @param dst destination path
   * @param headers any headers
   * @return true if the status code was considered successful
   * @throws IOException on IO Faults
   */
  public boolean copyObject(SwiftObjectPath src, final SwiftObjectPath dst,
                            final Header... headers) throws IOException {

    preRemoteCommand("copyObject");

    return perform("copy", pathToURI(src), new CopyMethodProcessor<Boolean>() {
      @Override
      public Boolean extractResult(CopyMethod method) throws IOException {
        return method.getStatusCode() != SC_NOT_FOUND;
      }

      @Override
      protected void setup(CopyMethod method) throws
                     SwiftInternalStateException {
        setHeaders(method, headers);
        method.addRequestHeader(HEADER_DESTINATION, dst.toUriPath());
      }
    });
  }

  /**
   * Uploads file as Input Stream to Swift.
   * The data stream will be closed after the request.
   *
   * @param path path to Swift
   * @param data object data
   * @param length length of data
   * @param requestHeaders http headers
   * @throws IOException on IO Faults
   */
  public void upload(SwiftObjectPath path,
                     final InputStream data,
                     final long length,
                     final Header... requestHeaders)
          throws IOException {
    preRemoteCommand("upload");

    try {
      perform("upload", pathToURI(path), new PutMethodProcessor<byte[]>() {
        @Override
        public byte[] extractResult(PutMethod method) throws IOException {
          return method.getResponseBody();
        }

        @Override
        protected void setup(PutMethod method) throws
                        SwiftInternalStateException {
          method.setRequestEntity(new InputStreamRequestEntity(data, length));
          setHeaders(method, requestHeaders);
        }
      });
    } finally {
      data.close();
    }

  }


  /**
   * Deletes object from swift.
   * The result is true if this operation did the deletion.
   *
   * @param path           path to file
   * @param requestHeaders http headers
   * @throws IOException on IO Faults
   */
  public boolean delete(SwiftObjectPath path, final Header... requestHeaders) throws IOException {
    preRemoteCommand("delete");

    return perform("", pathToURI(path), new DeleteMethodProcessor<Boolean>() {
      @Override
      public Boolean extractResult(DeleteMethod method) throws IOException {
        return method.getStatusCode() == SC_NO_CONTENT;
      }

      @Override
      protected void setup(DeleteMethod method) throws
                    SwiftInternalStateException {
        setHeaders(method, requestHeaders);
      }
    });
  }

  /**
   * Issue a head request
   * @param reason reason -used in logs
   * @param path path to query
   * @param requestHeaders request header
   * @return the response headers. This may be an empty list
   * @throws IOException IO problems
   * @throws FileNotFoundException if there is nothing at the end
   */
  public Header[] headRequest(String reason,
                              SwiftObjectPath path,
                              final Header... requestHeaders)
          throws IOException {

    preRemoteCommand("headRequest: "+ reason);
    return perform(reason, pathToURI(path), new HeadMethodProcessor<Header[]>() {
      @Override
      public Header[] extractResult(HeadMethod method) throws IOException {
        if (method.getStatusCode() == SC_NOT_FOUND) {
          throw new FileNotFoundException("Not Found " + method.getURI());
        }

        return method.getResponseHeaders();
      }

      @Override
      protected void setup(HeadMethod method) throws
                    SwiftInternalStateException {
        setHeaders(method, requestHeaders);
      }
    });
  }

  /**
   * Issue a put request
   * @param path path
   * @param requestHeaders optional headers
   * @return the HTTP response
   * @throws IOException any problem
   */
  public int putRequest(SwiftObjectPath path, final Header... requestHeaders)
          throws IOException {

    preRemoteCommand("putRequest");
    return perform(pathToURI(path), new PutMethodProcessor<Integer>() {

      @Override
      public Integer extractResult(PutMethod method) throws IOException {
        return method.getStatusCode();
      }

      @Override
      protected void setup(PutMethod method) throws
                    SwiftInternalStateException {
        setHeaders(method, requestHeaders);
      }
    });
  }

  /**
   * Authenticate to Openstack Keystone
   * As well as returning the access token, the member fields {@link #token},
   * {@link #endpointURI} and {@link #objectLocationURI} are set up for re-use.
   * <p>
   * This method is re-entrant -if more than one thread attempts to authenticate
   * neither will block -but the field values with have those of the last caller.
   *
   * @return authenticated access token
   */
  public AccessToken authenticate() throws IOException {
    final AuthenticationRequest authenticationRequest;
    if (useKeystoneAuthentication) {
      authenticationRequest = keystoneAuthRequest;
    } else {
      authenticationRequest = authRequest;
    }

    LOG.debug("started authentication");
    return perform("authentication",
                   authUri,
                   new AuthenticationPost(authenticationRequest));
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

    /**
     * specification says any of the 2xxs are OK, so list all
     * the standard ones
     * @return a set of 2XX status codes.
     */
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
        SC_UNAUTHORIZED //if request unauthorized, try another method
      };
    }

    @Override
    public AccessToken extractResult(AuthPostMethod method) throws IOException {
      //initial check for failure codes leading to authentication failures
      if (method.getStatusCode() == SC_BAD_REQUEST) {
        throw new SwiftAuthenticationFailedException(
          authenticationRequest.toString(), "POST", authUri, method);
      }

      final AuthenticationResponse access =
        JSONUtil.toObject(method.getResponseBodyAsString(),
                          AuthenticationWrapper.class).getAccess();
      final List<Catalog> serviceCatalog = access.getServiceCatalog();

      EndpointResolution resolved = findSwiftEndpoint(serviceCatalog);
      AccessToken accessToken = access.getToken();
      URI objectLocation = buildObjectLocationURI(resolved.endpointURI,
                                                  resolved.swiftEndpoint);

      setAuthDetails(resolved.endpointURI, objectLocation, accessToken);

      if (LOG.isDebugEnabled()) {
        LOG.debug("authenticated against " + resolved.endpointURI);
      }
      createDefaultContainer();
      return accessToken;
    }
  }

  private static final class EndpointResolution {
    final URI endpointURI;
    final Endpoint swiftEndpoint;

    EndpointResolution(URI endpointURI, Endpoint swiftEndpoint) {
      this.endpointURI = endpointURI;
      this.swiftEndpoint = swiftEndpoint;
    }
  }

  private EndpointResolution findSwiftEndpoint(List<Catalog> serviceCatalog)
      throws SwiftInvalidResponseException {
    StringBuilder catList = new StringBuilder();
    StringBuilder regionList = new StringBuilder();

    for (Catalog catalog : serviceCatalog) {
      String name = catalog.getName();
      String type = catalog.getType();
      String descr = String.format("[%s: %s]; ", name, type);
      catList.append(descr);
      if (LOG.isDebugEnabled()) {
        LOG.debug("Catalog entry " + descr);
      }
      if (isSwiftCatalog(name, type)) {
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
            URI chosenURI = usePublicURL ? publicURL : internalURL;
            return new EndpointResolution(chosenURI, endpoint);
          }
        }
      }
    }

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

  private static boolean isSwiftCatalog(String name, String type) {
    return name.equals(SERVICE_CATALOG_SWIFT)
        || name.equals(SERVICE_CATALOG_CLOUD_FILES)
        || type.equals(SERVICE_CATALOG_OBJECT_STORE);
  }

  private URI buildObjectLocationURI(URI endpointURI, Endpoint swiftEndpoint)
      throws SwiftException {
    String path = SWIFT_OBJECT_AUTH_ENDPOINT
                  + swiftEndpoint.getTenantId();
    String host = endpointURI.getHost();
    try {
      return new URI(endpointURI.getScheme(),
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
  }

  private StringRequestEntity getAuthenticationRequst(AuthenticationRequest authenticationRequest)
    throws IOException {
    final String data = JSONUtil.toJSON(new AuthenticationRequestWrapper(
            authenticationRequest));
    if (LOG.isDebugEnabled()) {
      LOG.debug("Authenticating with " + authenticationRequest);
    }
    return toJsonEntity(data);
  }

  /**
   * create default container if it doesn't exist for Hadoop Swift integration.
   * non-reentrant, as this should only be needed once.
   *
   * @throws IOException IO problems.
   */
  private synchronized void createDefaultContainer() throws IOException {
    createContainer(container);
  }

  /**
   * Create a container -if it already exists, do nothing
   *
   * @param containerName the container name
   * @throws IOException IO problems
   * @throws SwiftBadRequestException invalid container name
   * @throws SwiftInvalidResponseException error from the server
   */
  public void createContainer(String containerName) throws IOException {
    SwiftObjectPath objectPath = new SwiftObjectPath(containerName, "");
    try {
      //see if the data is there
      headRequest("createContainer", objectPath, NEWEST);
    } catch (FileNotFoundException ex) {
      int status = tryPutContainer(objectPath);
      validateContainerCreateStatus(status, containerName);
      throw ex;
    }
  }

  private int tryPutContainer(SwiftObjectPath objectPath) throws IOException {
    try {
      return putRequest(objectPath);
    } catch (FileNotFoundException e) {
      //triggered by a very bad container name.
      //re-insert the 404 result into the status
      return SC_NOT_FOUND;
    }
  }

  private void validateContainerCreateStatus(int status, String containerName)
      throws IOException {
    if (status == SC_BAD_REQUEST) {
      throw new SwiftBadRequestException(
        "Bad request -authentication failure or bad container name?",
        status,
        "PUT",
        null);
    }
    if (!isStatusCodeExpected(status,
            SC_OK,
            SC_CREATED,
            SC_ACCEPTED,
            SC_NO_CONTENT)) {
      throw new SwiftInvalidResponseException("Couldn't create container "
              + containerName +
              " for storing data in Swift." +
              " Try to create container " +
              containerName + " manually ",
              status,
              "PUT",
              null);
    }
  }

  /**
   * Trigger an initial auth operation if some of the needed
   * fields are missing
   *
   * @throws IOException on problems
   */
  private void authIfNeeded() throws IOException {
    if (getEndpointURI() == null) {
      authenticate();
    }
  }

  /**
   * Pre-execution actions to be performed by methods. Currently this
   * <ul>
   *   <li>Logs the operation at TRACE</li>
   *   <li>Authenticates the client -if needed</li>
   * </ul>
   * @throws IOException
   */
  private void preRemoteCommand(String operation) throws IOException {
    if (LOG.isTraceEnabled()) {
      LOG.trace("Executing " + operation);
    }
    authIfNeeded();
  }


  /**
   * Performs the HTTP request, validates the response code and returns
   * the received data. HTTP Status codes are converted into exceptions.
   *
   * @param uri URI to source
   * @param processor HttpMethodProcessor
   * @param <M> method
   * @param <R> result type
   * @return result of HTTP request
   * @throws IOException IO problems
   * @throws SwiftBadRequestException the status code indicated "Bad request"
   * @throws SwiftInvalidResponseException the status code is out of range
   * for the action (excluding 404 responses)
   * @throws SwiftInternalStateException the internal state of this client
   * is invalid
   * @throws FileNotFoundException a 404 response was returned
   */
  private <M extends HttpMethod, R> R perform(URI uri,
                      HttpMethodProcessor<M, R> processor)
    throws IOException,
           SwiftBadRequestException,
           SwiftInternalStateException,
           SwiftInvalidResponseException,
           FileNotFoundException {
    return perform("",uri, processor);
  }

  /**
   * Performs the HTTP request, validates the response code and returns
   * the received data. HTTP Status codes are converted into exceptions.
   * @param reason why is this operation taking place. Used for statistics
   * @param uri URI to source
   * @param processor HttpMethodProcessor
   * @param <M> method
   * @param <R> result type
   * @return result of HTTP request
   * @throws IOException IO problems
   * @throws SwiftBadRequestException the status code indicated "Bad request"
   * @throws SwiftInvalidResponseException the status code is out of range
   * for the action (excluding 404 responses)
   * @throws SwiftInternalStateException the internal state of this client
   * is invalid
   * @throws FileNotFoundException a 404 response was returned
   */
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

  /**
   * Build an exception from a failed operation. This can include generating
   * specific exceptions (e.g. FileNotFound), as well as the default
   * {@link SwiftInvalidResponseException}.
   *
   * @param uri URI for operation
   * @param method operation that failed
   * @param statusCode status code
   * @param <M> method type
   * @return an exception to throw
   */
  private <M extends HttpMethod> IOException buildException(URI uri,
                                                            M method,
                                                            int statusCode) {
    return ExceptionFactory.createException(uri, method, statusCode, getToken());
  }

  private static final class ExceptionFactory {
    static IOException createException(URI uri,
                                       HttpMethod method,
                                       int statusCode,
                                       AccessToken token) {
      String errorMessage = formatErrorMessage(uri, method, statusCode);
      if (LOG.isDebugEnabled()) {
        LOG.debug(errorMessage);
      }

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
          return buildRangeException(method);

        case SC_UNAUTHORIZED:
          //auth failure; should only happen on the second attempt
          return new SwiftAuthenticationFailedException(
                          "Operation not authorized- current access token ="
                              + token,
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
                  errorMessage,
                  method.getName(),
                  uri,
                  method);
      }
    }

    private static String formatErrorMessage(URI uri,
                                             HttpMethod method,
                                             int statusCode) {
      return String.format("Method %s on %s failed, status code: %d," +
              " status line: %s",
              method.getName(),
              uri,
              statusCode,
              method.getStatusLine()
      );
    }

    private static IOException buildRangeException(HttpMethod method) {
      StringBuilder errorText = new StringBuilder(method.getStatusText());
      //get the requested length
      Header requestContentLen = method.getRequestHeader(HEADER_CONTENT_LENGTH);
      if (requestContentLen != null) {
        errorText.append(" requested ").append(requestContentLen.getValue());
      }
      //and the result
      Header availableContentRange = method.getResponseHeader(
        HEADER_CONTENT_RANGE);
      if (availableContentRange != null) {
        errorText.append(" available ").append(availableContentRange.getValue());
      }
      return new EOFException(errorText.toString());
    }
  }

  /**
   * Exec a GET request and return the input stream of the response
   *
   * @param uri URI to GET
   * @param requestHeaders request headers
   * @return the input stream. This must be closed to avoid log errors
   * @throws IOException
   */
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
      protected void setup(GetMethod method) throws
                    SwiftInternalStateException {
        setHeaders(method, requestHeaders);
      }
    });
  }

  /**
   * Create an instance against a specific FS URI,
   *
   * @param filesystemURI filesystem to bond to
   * @param config source of configuration data
   * @return REST client instance
   * @throws IOException on instantiation problems
   */
  public static SwiftRestClient getInstance(URI filesystemURI,
                                            Configuration config) throws IOException {
    return new SwiftRestClient(filesystemURI, config);
  }


  /**
   * Convert the (JSON) data to a string request as UTF-8
   *
   * @param data data
   * @return the data
   * @throws SwiftException if for some very unexpected reason it's impossible
   * to convert the data to UTF-8.
   */
  private static StringRequestEntity toJsonEntity(String data) throws
          SwiftException {
    StringRequestEntity entity;
    try {
      entity = new StringRequestEntity(data, "application/json", "UTF-8");
    } catch (UnsupportedEncodingException e) {
      throw new SwiftException("Could not encode data as UTF-8", e);
    }
    return entity;
  }

  /**
   * Converts Swift path to URI to make request.
   * This is public for unit testing
   *
   * @param path path to object
   * @param endpointURI damain url e.g. http://domain.com
   * @return valid URI for object
   * @throws SwiftException
   */
  public static URI pathToURI(SwiftObjectPath path,
                              URI endpointURI) throws SwiftException {
    checkNotNull(endpointURI, "Null Endpoint -client is not authenticated");

    String dataLocationURI = endpointURI.toString();
    try {

      dataLocationURI = SwiftUtils.joinPaths(dataLocationURI, encodeUrl(path.toUriPath()));
      return new URI(dataLocationURI);
    } catch (URISyntaxException e) {
      throw new SwiftException("Failed to create URI from " + dataLocationURI, e);
    }
  }

  /**
   * Encode the URL. This extends {@link URLEncoder#encode(String, String)}
   * with a replacement of + with %20.
   * @param url URL string
   * @return an encoded string
   * @throws SwiftException if the URL cannot be encoded
   */
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

  /**
   * Convert a swift path to a URI relative to the current endpoint.
   *
   * @param path path
   * @return an path off the current endpoint URI.
   * @throws SwiftException
   */
  private URI pathToURI(SwiftObjectPath path) throws SwiftException {
    return pathToURI(path, getEndpointURI());
  }

  /**
   * Add the headers to the method, and the auth token (which must be set
   * @param method method to update
   * @param requestHeaders the list of headers
   * @throws SwiftInternalStateException not yet authenticated
   */
  private void setHeaders(HttpMethodBase method, Header[] requestHeaders)
      throws SwiftInternalStateException {
      for (Header header : requestHeaders) {
        method.addRequestHeader(header);
      }
    setAuthToken(method, getToken());
  }


  /**
   * Set the auth key header of the method to the token ID supplied
   *
   * @param method method
   * @param accessToken access token
   * @throws SwiftInternalStateException if the client is not yet authenticated
   */
  private void setAuthToken(HttpMethodBase method, AccessToken accessToken)
      throws SwiftInternalStateException {
    checkNotNull(accessToken,"Not authenticated");
    method.addRequestHeader(HEADER_AUTH_KEY, accessToken.getId());
  }

  /**
   * Execute a method in a new HttpClient instance.
   * If the auth failed, authenticate then retry the method.
   *
   * @param method methot to exec
   * @param <M> Method type
   * @return the status code
   * @throws IOException on any failure
   */
  private <M extends HttpMethod> int exec(M method) throws IOException {
    final HttpClient client = createHttpClient();
    int statusCode = execWithDebugOutput(method, client);
    statusCode = tryKeystoneAuthentication(method, statusCode, client);
    statusCode = reauthenticateIfUnauthorized(method, statusCode, client);
    return statusCode;
  }

  private HttpClient createHttpClient() {
    final HttpClient client = new HttpClient();
    if (proxyHost != null) {
      client.getParams().setParameter(ConnRoutePNames.DEFAULT_PROXY,
              new HttpHost(proxyHost, proxyPort));
    }
    return client;
  }

  private <M extends HttpMethod> int tryKeystoneAuthentication(M method,
                                                               int statusCode,
                                                               HttpClient client)
      throws IOException {
    if ((statusCode == HttpStatus.SC_UNAUTHORIZED
            || statusCode == HttpStatus.SC_BAD_REQUEST)
            && method instanceof AuthPostMethod
            && !useKeystoneAuthentication
            && keystoneAuthRequest != null) {
      if (LOG.isDebugEnabled()) {
        LOG.debug("Operation failed with status " + method.getStatusCode() +
                 " attempting keystone auth");
      }
      //if rackspace key authentication failed - try custom Keystone authentication
      useKeystoneAuthentication = true;
      final AuthPostMethod authentication = (AuthPostMethod) method;
      //replace rackspace auth with keystone one
      authentication.setRequestEntity(getAuthenticationRequst(keystoneAuthRequest));
      return execWithDebugOutput(method, client);
    }
    return statusCode;
  }

  private <M extends HttpMethod> int reauthenticateIfUnauthorized(M method,
                                                                int statusCode,
                                                                HttpClient client)
      throws IOException {
    if (statusCode == HttpStatus.SC_UNAUTHORIZED) {
      //unauthed -or the auth uri rejected it.

      if (method instanceof AuthPostMethod) {
          //unauth response from the AUTH URI itself.
          throw new SwiftAuthenticationFailedException(authRequest.toString(),
                                                       "auth",
                                                       authUri,
                                                       method);
      }
      //any other URL: try again
      if (LOG.isDebugEnabled()) {
        LOG.debug("Reauthenticating");
      }
      //re-auth, this may recurse into the same dir
      authenticate();
      if (LOG.isDebugEnabled()) {
        LOG.debug("Retrying original request");
      }
      return execWithDebugOutput(method, client);
    }
    return statusCode;
  }

  /**
   * Execute the request with the request and response logged at debug level
   * @param method method to execute
   * @param client client to use
   * @param <M> method type
   * @return the status code
   * @throws IOException any failure reported by the HTTP client.
   */
  private <M extends HttpMethod> int execWithDebugOutput(M method,
                                                         HttpClient client) throws
          IOException {
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

  /**
   * Ensures that an object reference passed as a parameter to the calling
   * method is not null.
   *
   * @param reference an object reference
   * @return the non-null reference that was validated
   * @throws NullPointerException if {@code reference} is null
   */
  private static <T> T checkNotNull(T reference) throws
            SwiftInternalStateException {
    return checkNotNull(reference, "Null Reference");
  }

  private static <T> T checkNotNull(T reference, String message) throws
            SwiftInternalStateException {
    if (reference == null) {
      throw new SwiftInternalStateException(message);
    }
    return reference;
  }

  /**
   * Check for a status code being expected -takes a list of expected values
   *
   * @param status received status
   * @param expected expected value
   * @return true iff status is an element of [expected]
   */
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

  /**
   * Get the region which this client is bound to
   * @return the region
   */
  public String getRegion() {
    return region;
  }

  /**
   * Get the tenant to which this client is bound
   * @return the tenant
   */
  public String getTenant() {
    return tenant;
  }

  /**
   * Get the username this client identifies itself as
   * @return the username
   */
  public String getUsername() {
    return username;
  }

  /**
   * Get the container to which this client is bound
   * @return the container
   */
  public String getContainer() {
    return container;
  }

  /**
   * Is this client bound to a location aware Swift blobstore
   * -that is, can you query for the location of partitions
   * @return true iff the location of multipart file uploads
   * can be determined.
   */
  public boolean isLocationAware() {
    return locationAware;
  }

  /**
   * Get the blocksize of this filesystem
   * @return a blocksize &gt; 0
   */
  public long getBlocksizeKB() {
    return blocksizeKB;
  }

  /**
   * Get the partition size in KB
   * @return the partition size
   */
  public int getPartSizeKB() {
    return partSizeKB;
  }

  /**
   * Get the buffer size in KB
   * @return the buffer size wanted for reads
   */
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

  /**
   * Get the current operation statistics
   * @return a snapshot of the statistics
   */

  public List<DurationStats> getOperationStatistics() {
    return durationStats.getDurationStatistics();
  }
}