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

package org.apache.hadoop.fs.azure;
import static org.apache.hadoop.fs.azure.NativeAzureFileSystem.PATH_DELIMITER;

import java.io.BufferedInputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.UnsupportedEncodingException;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.security.InvalidKeyException;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Collections;
import java.util.Date;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedList;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import org.apache.commons.lang.StringUtils;
import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.apache.hadoop.classification.InterfaceAudience;
import org.apache.hadoop.conf.Configuration;
import org.apache.hadoop.fs.FileSystem;
import org.apache.hadoop.fs.azure.StorageInterface.CloudBlobContainerWrapper;
import org.apache.hadoop.fs.azure.StorageInterface.CloudBlobDirectoryWrapper;
import org.apache.hadoop.fs.azure.StorageInterface.CloudBlobWrapper;
import org.apache.hadoop.fs.azure.StorageInterface.CloudBlockBlobWrapper;
import org.apache.hadoop.fs.azure.StorageInterface.CloudPageBlobWrapper;
import org.apache.hadoop.fs.azure.StorageInterfaceImpl.CloudPageBlobWrapperImpl;
import org.apache.hadoop.fs.azure.metrics.AzureFileSystemInstrumentation;
import org.apache.hadoop.fs.azure.metrics.BandwidthGaugeUpdater;
import org.apache.hadoop.fs.azure.metrics.ErrorMetricUpdater;
import org.apache.hadoop.fs.azure.metrics.ResponseReceivedMetricUpdater;
import org.apache.hadoop.fs.permission.FsPermission;
import org.apache.hadoop.fs.permission.PermissionStatus;
import org.mortbay.util.ajax.JSON;

import com.google.common.annotations.VisibleForTesting;
import com.microsoft.azure.storage.CloudStorageAccount;
import com.microsoft.azure.storage.OperationContext;
import com.microsoft.azure.storage.RetryExponentialRetry;
import com.microsoft.azure.storage.RetryNoRetry;
import com.microsoft.azure.storage.StorageCredentials;
import com.microsoft.azure.storage.StorageCredentialsAccountAndKey;
import com.microsoft.azure.storage.StorageCredentialsSharedAccessSignature;
import com.microsoft.azure.storage.StorageErrorCode;
import com.microsoft.azure.storage.StorageException;
import com.microsoft.azure.storage.blob.BlobListingDetails;
import com.microsoft.azure.storage.blob.BlobProperties;
import com.microsoft.azure.storage.blob.BlobRequestOptions;
import com.microsoft.azure.storage.blob.CloudBlob;
import com.microsoft.azure.storage.blob.CopyStatus;
import com.microsoft.azure.storage.blob.DeleteSnapshotsOption;
import com.microsoft.azure.storage.blob.ListBlobItem;
import com.microsoft.azure.storage.core.Utility;

/**
 * Core implementation of Windows Azure Filesystem for Hadoop.
 * Provides the bridging logic between Hadoop's abstract filesystem and Azure Storage 
 *
 */
@InterfaceAudience.Private
@VisibleForTesting
public class AzureNativeFileSystemStore implements NativeFileSystemStore {
  
  /**
   * Configuration knob on whether we do block-level MD5 validation on
   * upload/download.
   */
  static final String KEY_CHECK_BLOCK_MD5 = "fs.azure.check.block.md5";
  /**
   * Configuration knob on whether we store blob-level MD5 on upload.
   */
  static final String KEY_STORE_BLOB_MD5 = "fs.azure.store.blob.md5";
  static final String DEFAULT_STORAGE_EMULATOR_ACCOUNT_NAME = "storageemulator";
  static final String STORAGE_EMULATOR_ACCOUNT_NAME_PROPERTY_NAME = "fs.azure.storage.emulator.account.name";

  public static final Log LOG = LogFactory
      .getLog(AzureNativeFileSystemStore.class);

  private StorageInterface storageInteractionLayer;
  private CloudBlobDirectoryWrapper rootDirectory;
  private CloudBlobContainerWrapper container;

  // Constants local to this class.
  //
  private static final String KEY_ACCOUNT_KEYPROVIDER_PREFIX = "fs.azure.account.keyprovider.";
  private static final String KEY_ACCOUNT_SAS_PREFIX = "fs.azure.sas.";

  // note: this value is not present in core-default.xml as our real default is
  // computed as min(2*cpu,8)
  private static final String KEY_CONCURRENT_CONNECTION_VALUE_OUT = "fs.azure.concurrentRequestCount.out";

  private static final String KEY_STREAM_MIN_READ_SIZE = "fs.azure.read.request.size";
  private static final String KEY_STORAGE_CONNECTION_TIMEOUT = "fs.azure.storage.timeout";
  private static final String KEY_WRITE_BLOCK_SIZE = "fs.azure.write.request.size";

  // Property controlling whether to allow reads on blob which are concurrently
  // appended out-of-band.
  private static final String KEY_READ_TOLERATE_CONCURRENT_APPEND = "fs.azure.io.read.tolerate.concurrent.append";

  // Configurable throttling parameter properties. These properties are located
  // in the core-site.xml configuration file.
  private static final String KEY_MIN_BACKOFF_INTERVAL = "fs.azure.io.retry.min.backoff.interval";
  private static final String KEY_MAX_BACKOFF_INTERVAL = "fs.azure.io.retry.max.backoff.interval";
  private static final String KEY_BACKOFF_INTERVAL = "fs.azure.io.retry.backoff.interval";
  private static final String KEY_MAX_IO_RETRIES = "fs.azure.io.retry.max.retries";
  
  private static final String KEY_COPYBLOB_MIN_BACKOFF_INTERVAL = 
    "fs.azure.io.copyblob.retry.min.backoff.interval";
  private static final String KEY_COPYBLOB_MAX_BACKOFF_INTERVAL = 
    "fs.azure.io.copyblob.retry.max.backoff.interval";
  private static final String KEY_COPYBLOB_BACKOFF_INTERVAL = 
    "fs.azure.io.copyblob.retry.backoff.interval";
  private static final String KEY_COPYBLOB_MAX_IO_RETRIES = 
    "fs.azure.io.copyblob.retry.max.retries";  

  private static final String KEY_SELF_THROTTLE_ENABLE = "fs.azure.selfthrottling.enable";
  private static final String KEY_SELF_THROTTLE_READ_FACTOR = "fs.azure.selfthrottling.read.factor";
  private static final String KEY_SELF_THROTTLE_WRITE_FACTOR = "fs.azure.selfthrottling.write.factor";

  private static final String PERMISSION_METADATA_KEY = "hdi_permission";
  private static final String OLD_PERMISSION_METADATA_KEY = "asv_permission";
  private static final String IS_FOLDER_METADATA_KEY = "hdi_isfolder";
  private static final String OLD_IS_FOLDER_METADATA_KEY = "asv_isfolder";
  static final String VERSION_METADATA_KEY = "hdi_version";
  static final String OLD_VERSION_METADATA_KEY = "asv_version";
  static final String FIRST_WASB_VERSION = "2013-01-01";
  static final String CURRENT_WASB_VERSION = "2013-09-01";
  static final String LINK_BACK_TO_UPLOAD_IN_PROGRESS_METADATA_KEY = "hdi_tmpupload";
  static final String OLD_LINK_BACK_TO_UPLOAD_IN_PROGRESS_METADATA_KEY = "asv_tmpupload";

  /**
   * Configuration key to indicate the set of directories in WASB where we
   * should store files as page blobs instead of block blobs.
   *
   * Entries should be plain directory names (i.e. not URIs) with no leading or
   * trailing slashes. Delimit the entries with commas.
   */
  public static final String KEY_PAGE_BLOB_DIRECTORIES =
      "fs.azure.page.blob.dir";
  /**
   * The set of directories where we should store files as page blobs.
   */
  private Set<String> pageBlobDirs;
  
  /**
   * Configuration key to indicate the set of directories in WASB where
   * we should do atomic folder rename synchronized with createNonRecursive.
   */
  public static final String KEY_ATOMIC_RENAME_DIRECTORIES =
      "fs.azure.atomic.rename.dir";

  /**
   * The set of directories where we should apply atomic folder rename
   * synchronized with createNonRecursive.
   */
  private Set<String> atomicRenameDirs;

  private static final String HTTP_SCHEME = "http";
  private static final String HTTPS_SCHEME = "https";
  private static final String WASB_AUTHORITY_DELIMITER = "@";
  private static final String AZURE_ROOT_CONTAINER = "$root";

  private static final int DEFAULT_CONCURRENT_WRITES = 8;

  // Concurrent reads reads of data written out of band are disable by default.
  //
  private static final boolean DEFAULT_READ_TOLERATE_CONCURRENT_APPEND = false;

  // Default block sizes
  public static final int DEFAULT_DOWNLOAD_BLOCK_SIZE = 4 * 1024 * 1024;
  public static final int DEFAULT_UPLOAD_BLOCK_SIZE = 4 * 1024 * 1024;

  // Retry parameter defaults.
  //

  private static final int DEFAULT_MIN_BACKOFF_INTERVAL = 1 * 1000; // 1s
  private static final int DEFAULT_MAX_BACKOFF_INTERVAL = 30 * 1000; // 30s
  private static final int DEFAULT_BACKOFF_INTERVAL = 1 * 1000; // 1s
  private static final int DEFAULT_MAX_RETRY_ATTEMPTS = 15;
  
  private static final int DEFAULT_COPYBLOB_MIN_BACKOFF_INTERVAL = 3  * 1000;
  private static final int DEFAULT_COPYBLOB_MAX_BACKOFF_INTERVAL = 90 * 1000;
  private static final int DEFAULT_COPYBLOB_BACKOFF_INTERVAL = 30 * 1000;
  private static final int DEFAULT_COPYBLOB_MAX_RETRY_ATTEMPTS = 15;  

  // Self-throttling defaults. Allowed range = (0,1.0]
  // Value of 1.0 means no self-throttling.
  // Value of x means process data at factor x of unrestricted rate
  private static final boolean DEFAULT_SELF_THROTTLE_ENABLE = true;
  private static final float DEFAULT_SELF_THROTTLE_READ_FACTOR = 1.0f;
  private static final float DEFAULT_SELF_THROTTLE_WRITE_FACTOR = 1.0f;

  private static final int STORAGE_CONNECTION_TIMEOUT_DEFAULT = 90;


  /**
   * MEMBER VARIABLES
   */

  private URI sessionUri;
  private Configuration sessionConfiguration;
  private int concurrentWrites = DEFAULT_CONCURRENT_WRITES;
  private boolean isAnonymousCredentials = false;
  // Set to true if we are connecting using shared access signatures.
  private boolean connectingUsingSAS = false;
  private AzureFileSystemInstrumentation instrumentation;
  private BandwidthGaugeUpdater bandwidthGaugeUpdater;
  private final static JSON PERMISSION_JSON_SERIALIZER = createPermissionJsonSerializer();

  private boolean suppressRetryPolicy = false;
  private boolean canCreateOrModifyContainer = false;
  private ContainerState currentKnownContainerState = ContainerState.Unknown;
  private final Object containerStateLock = new Object();

  private boolean tolerateOobAppends = DEFAULT_READ_TOLERATE_CONCURRENT_APPEND;

  private int downloadBlockSizeBytes = DEFAULT_DOWNLOAD_BLOCK_SIZE;
  private int uploadBlockSizeBytes = DEFAULT_UPLOAD_BLOCK_SIZE;

  // Bandwidth throttling exponential back-off parameters
  //
  private int minBackoff; // the minimum back-off interval (ms) between retries.
  private int maxBackoff; // the maximum back-off interval (ms) between retries.
  private int deltaBackoff; // the back-off interval (ms) between retries.
  private int maxRetries; // the maximum number of retry attempts.

  // Self-throttling parameters
  private boolean selfThrottlingEnabled;
  private float selfThrottlingReadFactor;
  private float selfThrottlingWriteFactor;

  private TestHookOperationContext testHookOperationContext = null;

  // Set if we're running against a storage emulator..
  private boolean isStorageEmulator = false;

  /**
   * A test hook interface that can modify the operation context we use for
   * Azure Storage operations, e.g. to inject errors.
   */
  @VisibleForTesting 
  interface TestHookOperationContext {
    OperationContext modifyOperationContext(OperationContext original);
  }

  /**
   * Suppress the default retry policy for the Storage, useful in unit tests to
   * test negative cases without waiting forever.
   */
  @VisibleForTesting
  void suppressRetryPolicy() {
    suppressRetryPolicy = true;
  }

  /**
   * Add a test hook to modify the operation context we use for Azure Storage
   * operations.
   * 
   * @param testHook
   *          The test hook, or null to unset previous hooks.
   */
  @VisibleForTesting 
  void addTestHookToOperationContext(TestHookOperationContext testHook) {
    this.testHookOperationContext = testHook;
  }

  /**
   * If we're asked by unit tests to not retry, set the retry policy factory in
   * the client accordingly.
   */
  private void suppressRetryPolicyInClientIfNeeded() {
    if (suppressRetryPolicy) {
      storageInteractionLayer.setRetryPolicyFactory(new RetryNoRetry());
    }
  }

  /**
   * Creates a JSON serializer that can serialize a PermissionStatus object into
   * the JSON string we want in the blob metadata.
   * 
   * @return The JSON serializer.
   */
  private static JSON createPermissionJsonSerializer() {
    JSON serializer = new JSON();
    serializer.addConvertor(PermissionStatus.class,
        new PermissionStatusJsonSerializer());
    return serializer;
  }

  /**
   * A converter for PermissionStatus to/from JSON as we want it in the blob
   * metadata.
   */
  private static class PermissionStatusJsonSerializer implements JSON.Convertor {
    private static final String OWNER_TAG = "owner";
    private static final String GROUP_TAG = "group";
    private static final String PERMISSIONS_TAG = "permissions";

    @Override
    public void toJSON(Object obj, JSON.Output out) {
      PermissionStatus permissionStatus = (PermissionStatus) obj;
      // Don't store group as null, just store it as empty string
      // (which is FileStatus behavior).
      String group = permissionStatus.getGroupName() == null ? ""
          : permissionStatus.getGroupName();
      out.add(OWNER_TAG, permissionStatus.getUserName());
      out.add(GROUP_TAG, group);
      out.add(PERMISSIONS_TAG, permissionStatus.getPermission().toString());
    }

    @Override
    public Object fromJSON(@SuppressWarnings("rawtypes") Map object) {
      return PermissionStatusJsonSerializer.fromJSONMap(object);
    }

    @SuppressWarnings("rawtypes")
    public static PermissionStatus fromJSONString(String jsonString) {
      // The JSON class can only find out about an object's class (and call me)
      // if we store the class name in the JSON string. Since I don't want to
      // do that (it's an implementation detail), I just deserialize as a
      // the default Map (JSON's default behavior) and parse that.
      return fromJSONMap((Map) PERMISSION_JSON_SERIALIZER.fromJSON(jsonString));
    }

    private static PermissionStatus fromJSONMap(
        @SuppressWarnings("rawtypes") Map object) {
      return new PermissionStatus((String) object.get(OWNER_TAG),
          (String) object.get(GROUP_TAG),
          // The initial - below is the Unix file type,
          // which FsPermission needs there but ignores.
          FsPermission.valueOf("-" + (String) object.get(PERMISSIONS_TAG)));
    }
  }

  @VisibleForTesting
  void setAzureStorageInteractionLayer(StorageInterface storageInteractionLayer) {
    this.storageInteractionLayer = storageInteractionLayer;
  }

  @VisibleForTesting
  public BandwidthGaugeUpdater getBandwidthGaugeUpdater() {
    return bandwidthGaugeUpdater;
  }

  /**
   * Check if concurrent reads and writes on the same blob are allowed.
   * 
   * @return true if concurrent reads and OOB writes has been configured, false
   *         otherwise.
   */
  private boolean isConcurrentOOBAppendAllowed() {
    return tolerateOobAppends;
  }

  /**
   * Method for the URI and configuration object necessary to create a storage
   * session with an Azure session. It parses the scheme to ensure it matches
   * the storage protocol supported by this file system.
   * 
   * @param uri - URI for target storage blob.
   * @param conf - reference to configuration object.
   * @param instrumentation - the metrics source that will keep track of operations here.
   * 
   * @throws IllegalArgumentException if URI or job object is null, or invalid scheme.
   */
  @Override
  public void initialize(URI uri, Configuration conf, AzureFileSystemInstrumentation instrumentation)
      throws IllegalArgumentException, AzureException, IOException  {
    
    validateInitializeParameters(uri, conf, instrumentation);
    createAzureStorageSession();
    pageBlobDirs = getDirectorySet(KEY_PAGE_BLOB_DIRECTORIES);
    LOG.debug("Page blob directories:  " + setToString(pageBlobDirs));
    atomicRenameDirs = getDirectorySet(KEY_ATOMIC_RENAME_DIRECTORIES);
    String hbaseRoot;
    try {
      hbaseRoot = verifyAndConvertToStandardFormat(
          sessionConfiguration.get("hbase.rootdir", "hbase"));
      atomicRenameDirs.add(hbaseRoot);
    } catch (URISyntaxException e) {
      LOG.warn("Unable to initialize HBase root as an atomic rename directory.");
    }
    LOG.debug("Atomic rename directories:  " + setToString(atomicRenameDirs));
  }

  /**
   * Helper to format a string for log output from Set<String>
   */
  private String setToString(Set<String> set) {
    StringBuilder sb = new StringBuilder();
    int i = 1;
    for (String s : set) {
      sb.append("/" + s);
      if (i != set.size()) {
        sb.append(", ");
      }
      i++;
    }
    return sb.toString();
  }

  /**
   * Validate parameters for initialize.
   */
  private void validateInitializeParameters(URI uri, Configuration conf,
      AzureFileSystemInstrumentation instrumentation) {
    if (null == instrumentation) {
      throw new IllegalArgumentException("Null instrumentation");
    }
    this.instrumentation = instrumentation;

    if (null == this.storageInteractionLayer) {
      this.storageInteractionLayer = new StorageInterfaceImpl();
    }
    
    if (null == uri) {
      throw new IllegalArgumentException(
          "Cannot initialize WASB file system, URI is null");
    }

    if (null == conf) {
      throw new IllegalArgumentException(
          "Cannot initialize WASB file system, conf is null");
    }

    if(!conf.getBoolean(
        NativeAzureFileSystem.SKIP_AZURE_METRICS_PROPERTY_NAME, false)) {
      this.bandwidthGaugeUpdater = new BandwidthGaugeUpdater(instrumentation);
    }

    sessionUri = uri;
    sessionConfiguration = conf;
  }

  /**
   * Method to extract the account name from an Azure URI.
   * 
   * @param uri
   *          -- WASB blob URI
   * @returns accountName -- the account name for the URI.
   * @throws URISyntaxException
   *           if the URI does not have an authority it is badly formed.
   */
  private String getAccountFromAuthority(URI uri) throws URISyntaxException {

    String authority = uri.getRawAuthority();
    if (null == authority) {
      throw new URISyntaxException(uri.toString(),
          "Expected URI with a valid authority");
    }

    if (!authority.contains(WASB_AUTHORITY_DELIMITER)) {
      return authority;
    }

    String[] authorityParts = authority.split(WASB_AUTHORITY_DELIMITER, 2);

    if (authorityParts.length < 2 || "".equals(authorityParts[0])) {
      final String errMsg = String
          .format(
              "URI '%s' has a malformed WASB authority, expected container name. "
                  + "Authority takes the form wasb://[<container name>@]<account name>",
              uri.toString());
      throw new IllegalArgumentException(errMsg);
    }

    return authorityParts[1];
  }

  /**
   * Method to extract the container name from an Azure URI.
   * 
   * @param uri
   *          -- WASB blob URI
   * @returns containerName -- the container name for the URI. May be null.
   * @throws URISyntaxException
   *           if the uri does not have an authority it is badly formed.
   */
  private String getContainerFromAuthority(URI uri) throws URISyntaxException {

    String authority = uri.getRawAuthority();
    if (null == authority) {
      throw new URISyntaxException(uri.toString(),
          "Expected URI with a valid authority");
    }

    if (!authority.contains(WASB_AUTHORITY_DELIMITER)) {
      return AZURE_ROOT_CONTAINER;
    }

    String[] authorityParts = authority.split(WASB_AUTHORITY_DELIMITER, 2);

    if (authorityParts.length < 2 || "".equals(authorityParts[0])) {
      final String errMsg = String
          .format(
              "URI '%s' has a malformed WASB authority, expected container name."
                  + "Authority takes the form wasb://[<container name>@]<account name>",
              uri.toString());
      throw new IllegalArgumentException(errMsg);
    }

    return authorityParts[0];
  }

  /**
   * Get the appropriate return the appropriate scheme for communicating with
   * Azure depending on whether wasb or wasbs is specified in the target URI.
   * 
   * return scheme - HTTPS or HTTP as appropriate.
   */
  private String getHTTPScheme() {
    String sessionScheme = sessionUri.getScheme();
    if (sessionScheme != null &&
        (sessionScheme.equalsIgnoreCase("asvs") ||
         sessionScheme.equalsIgnoreCase("wasbs"))) {
      return HTTPS_SCHEME;
    } else {
      return HTTP_SCHEME;
    }
  }

  /**
   * Set the configuration parameters for this client storage session with
   * Azure.
   * 
   * @throws AzureException
   */
  private void configureAzureStorageSession() throws AzureException {

    if (sessionUri == null) {
      throw new AssertionError(
          "Expected a non-null session URI when configuring storage session");
    }

    if (storageInteractionLayer == null) {
      throw new AssertionError(String.format(
          "Cannot configure storage session for URI '%s' "
              + "if storage session has not been established.",
          sessionUri.toString()));
    }

    tolerateOobAppends = sessionConfiguration.getBoolean(
        KEY_READ_TOLERATE_CONCURRENT_APPEND,
        DEFAULT_READ_TOLERATE_CONCURRENT_APPEND);

    this.downloadBlockSizeBytes = sessionConfiguration.getInt(
        KEY_STREAM_MIN_READ_SIZE, DEFAULT_DOWNLOAD_BLOCK_SIZE);
    this.uploadBlockSizeBytes = sessionConfiguration.getInt(
        KEY_WRITE_BLOCK_SIZE, DEFAULT_UPLOAD_BLOCK_SIZE);

    int storageConnectionTimeout = sessionConfiguration.getInt(
        KEY_STORAGE_CONNECTION_TIMEOUT, 0);

    if (0 < storageConnectionTimeout) {
      storageInteractionLayer.setTimeoutInMs(storageConnectionTimeout * 1000);
    }

    int cpuCores = 2 * Runtime.getRuntime().availableProcessors();

    concurrentWrites = sessionConfiguration.getInt(
        KEY_CONCURRENT_CONNECTION_VALUE_OUT,
        Math.min(cpuCores, DEFAULT_CONCURRENT_WRITES));

    minBackoff = sessionConfiguration.getInt(
        KEY_MIN_BACKOFF_INTERVAL, DEFAULT_MIN_BACKOFF_INTERVAL);

    maxBackoff = sessionConfiguration.getInt(
        KEY_MAX_BACKOFF_INTERVAL, DEFAULT_MAX_BACKOFF_INTERVAL);

    deltaBackoff = sessionConfiguration.getInt(
        KEY_BACKOFF_INTERVAL, DEFAULT_BACKOFF_INTERVAL);

    maxRetries = sessionConfiguration.getInt(
        KEY_MAX_IO_RETRIES, DEFAULT_MAX_RETRY_ATTEMPTS);

    storageInteractionLayer.setRetryPolicyFactory(
          new RetryExponentialRetry(minBackoff, deltaBackoff, maxBackoff, maxRetries));

    selfThrottlingEnabled = sessionConfiguration.getBoolean(
        KEY_SELF_THROTTLE_ENABLE, DEFAULT_SELF_THROTTLE_ENABLE);

    selfThrottlingReadFactor = sessionConfiguration.getFloat(
        KEY_SELF_THROTTLE_READ_FACTOR, DEFAULT_SELF_THROTTLE_READ_FACTOR);

    selfThrottlingWriteFactor = sessionConfiguration.getFloat(
        KEY_SELF_THROTTLE_WRITE_FACTOR, DEFAULT_SELF_THROTTLE_WRITE_FACTOR);

    if (LOG.isDebugEnabled()) {
      LOG.debug(String
          .format(
              "AzureNativeFileSystemStore init. Settings=%d,%b,%d,{%d,%d,%d,%d},{%b,%f,%f}",
              concurrentWrites, tolerateOobAppends,
              ((storageConnectionTimeout > 0) ? storageConnectionTimeout
                  : STORAGE_CONNECTION_TIMEOUT_DEFAULT), minBackoff,
              deltaBackoff, maxBackoff, maxRetries, selfThrottlingEnabled,
              selfThrottlingReadFactor, selfThrottlingWriteFactor));
    }
  }

  /**
   * Connect to Azure storage using anonymous credentials.
   * 
   * @param uri
   *          - URI to target blob (R/O access to public blob)
   * 
   * @throws StorageException
   *           raised on errors communicating with Azure storage.
   * @throws IOException
   *           raised on errors performing I/O or setting up the session.
   * @throws URISyntaxException
   *           raised on creating mal-formed URI's.
   */
  private void connectUsingAnonymousCredentials(final URI uri)
      throws StorageException, IOException, URISyntaxException {
    String accountName = getAccountFromAuthority(uri);
    URI storageUri = new URI(getHTTPScheme() + ":" + PATH_DELIMITER
        + PATH_DELIMITER + accountName);

    String containerName = getContainerFromAuthority(uri);
    storageInteractionLayer.createBlobClient(storageUri);
    suppressRetryPolicyInClientIfNeeded();

    container = storageInteractionLayer.getContainerReference(containerName);
    rootDirectory = container.getDirectoryReference("");

    try {
      if (!container.exists(getInstrumentedContext())) {
        throw new AzureException("Container " + containerName + " in account "
            + accountName + " not found, and we can't create "
            + " it using anoynomous credentials.");
      }
    } catch (StorageException ex) {
      throw new AzureException("Unable to access container " + containerName
          + " in account " + accountName
          + " using anonymous credentials, and no credentials found for them "
          + " in the configuration.", ex);
    }

    isAnonymousCredentials = true;
    configureAzureStorageSession();
  }

  private void connectUsingCredentials(String accountName,
      StorageCredentials credentials, String containerName)
      throws URISyntaxException, StorageException, AzureException {

    URI blobEndPoint;
    if (isStorageEmulatorAccount(accountName)) {
      isStorageEmulator = true;
      CloudStorageAccount account =
          CloudStorageAccount.getDevelopmentStorageAccount();
      storageInteractionLayer.createBlobClient(account);
    } else {
      blobEndPoint = new URI(getHTTPScheme() + "://" +
          accountName);
      storageInteractionLayer.createBlobClient(blobEndPoint, credentials);
    }
    suppressRetryPolicyInClientIfNeeded();

    container = storageInteractionLayer.getContainerReference(containerName);
    rootDirectory = container.getDirectoryReference("");

    canCreateOrModifyContainer = credentials instanceof StorageCredentialsAccountAndKey;
    configureAzureStorageSession();
  }

  /**
   * Connect to Azure storage using account key credentials.
   */
  private void connectUsingConnectionStringCredentials(
      final String accountName, final String containerName,
      final String accountKey) throws InvalidKeyException, StorageException,
      IOException, URISyntaxException {
    String rawAccountName = accountName.split("\\.")[0];
    StorageCredentials credentials = new StorageCredentialsAccountAndKey(
        rawAccountName, accountKey);
    connectUsingCredentials(accountName, credentials, containerName);
  }

  /**
   * Connect to Azure storage using shared access signature credentials.
   */
  private void connectUsingSASCredentials(final String accountName,
      final String containerName, final String sas) throws InvalidKeyException,
      StorageException, IOException, URISyntaxException {
    StorageCredentials credentials = new StorageCredentialsSharedAccessSignature(
        sas);
    connectingUsingSAS = true;
    connectUsingCredentials(accountName, credentials, containerName);
  }

  private boolean isStorageEmulatorAccount(final String accountName) {
    return accountName.equalsIgnoreCase(sessionConfiguration.get(
        STORAGE_EMULATOR_ACCOUNT_NAME_PROPERTY_NAME,
        DEFAULT_STORAGE_EMULATOR_ACCOUNT_NAME));
  }
  
  @VisibleForTesting
  public static String getAccountKeyFromConfiguration(String accountName,
      Configuration conf) throws KeyProviderException {
    String key = null;
    String keyProviderClass = conf.get(KEY_ACCOUNT_KEYPROVIDER_PREFIX
        + accountName);
    KeyProvider keyProvider = null;

    if (keyProviderClass == null) {
      keyProvider = new SimpleKeyProvider();
    } else {
      Object keyProviderObject = null;
      try {
        Class<?> clazz = conf.getClassByName(keyProviderClass);
        keyProviderObject = clazz.newInstance();
      } catch (Exception e) {
        throw new KeyProviderException("Unable to load key provider class.", e);
      }
      if (!(keyProviderObject instanceof KeyProvider)) {
        throw new KeyProviderException(keyProviderClass
            + " specified in config is not a valid KeyProvider class.");
      }
      keyProvider = (KeyProvider) keyProviderObject;
    }
    key = keyProvider.getStorageAccountKey(accountName, conf);

    return key;
  }

  /**
   * Establish a session with Azure blob storage based on the target URI. The
   * method determines whether or not the URI target contains an explicit
   * account or an implicit default cluster-wide account.
   * 
   * @throws AzureException
   * @throws IOException
   */
  private void createAzureStorageSession ()
      throws AzureException, IOException {

    if (null == sessionUri || null == sessionConfiguration) {
      throw new AzureException("Filesystem object not initialized properly."
          + "Unable to start session with Azure Storage server.");
    }

    try {
      String accountName = getAccountFromAuthority(sessionUri);
      if (null == accountName) {
        throw new AzureException("Cannot load WASB file system account name not"
            + " specified in URI: " + sessionUri.toString());
      }

      instrumentation.setAccountName(accountName);
      String containerName = getContainerFromAuthority(sessionUri);
      instrumentation.setContainerName(containerName);
      
      if (isStorageEmulatorAccount(accountName)) {
        handleEmulatorConnection(accountName, containerName);
        return;
      }

      String sas = sessionConfiguration.get(KEY_ACCOUNT_SAS_PREFIX
          + containerName + "." + accountName);
      if (sas != null) {
        handleSASConnection(accountName, containerName, sas);
        return;
      }

      String key = getAccountKeyFromConfiguration(accountName,
          sessionConfiguration);
      if (key != null) {
        handleAccountKeyConnection(accountName, containerName, key);
        return;
      }

      handleAnonymousConnection(sessionUri);
    } catch (Exception e) {
      throw new AzureException(e);
    }
  }

  /**
   * Handle emulator connection.
   */
  private void handleEmulatorConnection(String accountName, String containerName)
      throws StorageException, IOException, URISyntaxException {
    isStorageEmulator = true;
    CloudStorageAccount account =
        CloudStorageAccount.getDevelopmentStorageAccount();
    storageInteractionLayer.createBlobClient(account);
    suppressRetryPolicyInClientIfNeeded();
    container = storageInteractionLayer.getContainerReference(containerName);
    rootDirectory = container.getDirectoryReference("");
    canCreateOrModifyContainer = true;
    configureAzureStorageSession();
  }

  /**
   * Handle SAS connection.
   */
  private void handleSASConnection(String accountName, String containerName,
      String sas) throws StorageException, IOException, URISyntaxException {
    StorageCredentials credentials = new StorageCredentialsSharedAccessSignature(
        sas);
    connectingUsingSAS = true;
    connectUsingCredentials(accountName, credentials, containerName);
  }

  /**
   * Handle account key connection.
   */
  private void handleAccountKeyConnection(String accountName,
      String containerName, String key) throws StorageException, IOException,
      URISyntaxException {
    connectUsingConnectionStringCredentials(accountName, containerName, key);
  }

  /**
   * Handle anonymous connection.
   */
  private void handleAnonymousConnection(URI uri)
      throws StorageException, IOException, URISyntaxException {
    connectUsingAnonymousCredentials(uri);
  }

  private enum ContainerState {
    Unknown,
    DoesntExist,
    ExistsNoVersion,
    ExistsAtWrongVersion,
    ExistsAtRightVersion
  }

  private enum ContainerAccessType {
    PureRead,
    PureWrite,
    ReadThenWrite
  }

  /**
   * Trims a suffix/prefix from the given string. For example if
   * s is given as "/xy" and toTrim is "/", this method returns "xy"
   */
  private static String trim(String s, String toTrim) {
    return StringUtils.removeEnd(StringUtils.removeStart(s, toTrim),
        toTrim);
  }

  /**
   * Checks if the given rawDir belongs to this account/container, and
   * if so returns the canonicalized path for it. Otherwise return null.
   */
  private String verifyAndConvertToStandardFormat(String rawDir) throws URISyntaxException {
    URI asUri = new URI(rawDir);
    if (asUri.getAuthority() == null 
        || asUri.getAuthority().toLowerCase(Locale.ENGLISH).equalsIgnoreCase(
      sessionUri.getAuthority().toLowerCase(Locale.ENGLISH))) {
      return trim(asUri.getPath(), "/");
    } else {
      return null;
    }
  }

  /**
   * Take a comma-separated list of directories from a configuration variable
   * and transform it to a set of directories.
   */
  private Set<String> getDirectorySet(final String configVar)
      throws AzureException {
    String[] rawDirs = sessionConfiguration.getStrings(configVar, new String[0]);
    Set<String> directorySet = new HashSet<String>();
    for (String currentDir : rawDirs) {
      String myDir;
      try {
        myDir = verifyAndConvertToStandardFormat(currentDir);
      } catch (URISyntaxException ex) {
        throw new AzureException(String.format(
            "The directory %s specified in the configuration entry %s is not" +
            " a valid URI.",
            currentDir, configVar));
      }
      if (myDir != null) {
        directorySet.add(myDir);
      }
    }
    return directorySet;
  }

  /**
   * Checks if the given key in Azure Storage should be stored as a page
   * blob instead of block blob.
   */
  public boolean isPageBlobKey(String key) {
    return isKeyForDirectorySet(key, pageBlobDirs);
  }

  /**
   * Checks if the given key in Azure storage should have synchronized
   * atomic folder rename createNonRecursive implemented.
   */
  @Override
  public boolean isAtomicRenameKey(String key) {
    return isKeyForDirectorySet(key, atomicRenameDirs);
  }

  public boolean isKeyForDirectorySet(String key, Set<String> dirSet) {
    String defaultFS = FileSystem.getDefaultUri(sessionConfiguration).toString();
    for (String dir : dirSet) {
      if (dir.isEmpty() ||
          key.startsWith(dir + "/")) {
        return true;
      }

      try {
        URI uriPageBlobDir = new URI (dir);
        if (null == uriPageBlobDir.getAuthority()) {
          if (key.startsWith(trim(defaultFS, "/") + "/" + dir + "/")){
            return true;
          }
        }
      } catch (URISyntaxException e) {
        LOG.info(String.format(
                   "URI syntax error creating URI for %s", dir));
      }
    }
    return false;
  }

  /**
   * This should be called from any method that does any modifications to the
   * underlying container: it makes sure to put the WASB current version in the
   * container's metadata if it's not already there.
   */
  private ContainerState checkContainer(ContainerAccessType accessType)
      throws StorageException, AzureException {
    synchronized (containerStateLock) {
      if (isOkContainerState(accessType)) {
        return currentKnownContainerState;
      }
      if (currentKnownContainerState == ContainerState.ExistsAtWrongVersion) {
        String containerVersion = retrieveVersionAttribute(container);
        throw wrongVersionException(containerVersion);
      }
      refreshContainerState(accessType);
      return currentKnownContainerState;
    }
  }

  private void refreshContainerState(ContainerAccessType accessType)
      throws StorageException, AzureException {
    if (currentKnownContainerState == ContainerState.ExistsAtRightVersion) {
      return;
    }
    try {
      container.downloadAttributes(getInstrumentedContext());
      currentKnownContainerState = ContainerState.Unknown;
    } catch (StorageException ex) {
      if (ex.getErrorCode().equals(
          StorageErrorCode.RESOURCE_NOT_FOUND.toString())) {
        currentKnownContainerState = ContainerState.DoesntExist;
      } else {
        throw ex;
      }
    }

    if (currentKnownContainerState == ContainerState.DoesntExist) {
      handleDoesntExist(accessType);
    } else {
      handleExists(accessType);
    }
  }

  private void handleDoesntExist(ContainerAccessType accessType)
      throws StorageException {
    if (needToCreateContainer(accessType)) {
      storeVersionAttribute(container);
      container.create(getInstrumentedContext());
      currentKnownContainerState = ContainerState.ExistsAtRightVersion;
    }
  }

  private void handleExists(ContainerAccessType accessType)
      throws StorageException, AzureException {
    String containerVersion = retrieveVersionAttribute(container);
    if (containerVersion != null) {
      if (containerVersion.equals(FIRST_WASB_VERSION)) {
        if (needToStampVersion(accessType)) {
          storeVersionAttribute(container);
          container.uploadMetadata(getInstrumentedContext());
        }
        currentKnownContainerState = ContainerState.ExistsAtRightVersion;
      } else if (!containerVersion.equals(CURRENT_WASB_VERSION)) {
        currentKnownContainerState = ContainerState.ExistsAtWrongVersion;
        throw wrongVersionException(containerVersion);
      } else {
        currentKnownContainerState = ContainerState.ExistsAtRightVersion;
      }
    } else {
      currentKnownContainerState = ContainerState.ExistsNoVersion;
      if (needToStampVersion(accessType)) {
        storeVersionAttribute(container);
        container.uploadMetadata(getInstrumentedContext());
        currentKnownContainerState = ContainerState.ExistsAtRightVersion;
      }
    }
  }

  private AzureException wrongVersionException(String containerVersion) {
    return new AzureException("The container " + container.getName()
        + " is at an unsupported version: " + containerVersion
        + ". Current supported version: " + FIRST_WASB_VERSION);
  }

  private boolean needToStampVersion(ContainerAccessType accessType) {
    return accessType != ContainerAccessType.PureRead
        && canCreateOrModifyContainer;
  }

  private static boolean needToCreateContainer(ContainerAccessType accessType) {
    return accessType == ContainerAccessType.PureWrite;
  }

  // Determines whether we have to pull the container information again
  // or we can work based off what we already have.
  private boolean isOkContainerState(ContainerAccessType accessType) {
    switch (currentKnownContainerState) {
    case Unknown:
      return connectingUsingSAS;
    case DoesntExist:
      return false;
    case ExistsAtRightVersion:
      return true;
    case ExistsAtWrongVersion:
      return false;
    case ExistsNoVersion:
      return !needToStampVersion(accessType);
    default:
      throw new AssertionError("Unknown access type: " + accessType);
    }
  }

  private boolean getUseTransactionalContentMD5() {
    return sessionConfiguration.getBoolean(KEY_CHECK_BLOCK_MD5, true);
  }

  private BlobRequestOptions getUploadOptions() {
    BlobRequestOptions options = new BlobRequestOptions();
    options.setStoreBlobContentMD5(sessionConfiguration.getBoolean(
        KEY_STORE_BLOB_MD5, false));
    options.setUseTransactionalContentMD5(getUseTransactionalContentMD5());
    options.setConcurrentRequestCount(concurrentWrites);

    options.setRetryPolicyFactory(new RetryExponentialRetry(minBackoff,
        deltaBackoff, maxBackoff, maxRetries));

    return options;
  }

  private BlobRequestOptions getDownloadOptions() {
    BlobRequestOptions options = new BlobRequestOptions();
    options.setRetryPolicyFactory(
          new RetryExponentialRetry(minBackoff, deltaBackoff, maxBackoff, maxRetries));
    options.setUseTransactionalContentMD5(getUseTransactionalContentMD5());
    return options;
  }

  @Override
  public DataOutputStream storefile(String key, PermissionStatus permissionStatus)
      throws AzureException {
    try {
      if (null == storageInteractionLayer) {
        final String errMsg = String.format(
            "Storage session expected for URI '%s' but does not exist.",
            sessionUri);
        throw new AzureException(errMsg);
      }

      if (!isAuthenticatedAccess()) {
        throw new AzureException(new IOException(
            "Uploads to public accounts using anonymous "
                + "access is prohibited."));
      }

      checkContainer(ContainerAccessType.PureWrite);

      if (AZURE_ROOT_CONTAINER.equals(getContainerFromAuthority(sessionUri))) {
        final String errMsg = String.format(
            "Writes to '%s' container for URI '%s' are prohibited, "
                + "only updates on non-root containers permitted.",
            AZURE_ROOT_CONTAINER, sessionUri.toString());
        throw new AzureException(errMsg);
      }

      CloudBlobWrapper blob = getBlobReference(key);
      storePermissionStatus(blob, permissionStatus);

      OutputStream outputStream = openOutputStream(blob);
      DataOutputStream dataOutStream = new SyncableDataOutputStream(outputStream);
      return dataOutStream;
    } catch (Exception e) {
      throw new AzureException(e);
    }
  }

  /**
   * Opens a new output stream to the given blob (page or block blob)
   * to populate it from scratch with data.
   */
  private OutputStream openOutputStream(final CloudBlobWrapper blob)
      throws StorageException {
    if (blob instanceof CloudPageBlobWrapperImpl){
      return new PageBlobOutputStream(
          (CloudPageBlobWrapper)blob, getInstrumentedContext(), sessionConfiguration);
    } else {
      return ((CloudBlockBlobWrapper) blob).openOutputStream(getUploadOptions(),
                getInstrumentedContext());
    }
  }

  /**
   * Opens a new input stream for the given blob (page or block blob)
   * to read its data.
   */
  private InputStream openInputStream(CloudBlobWrapper blob)
      throws StorageException, IOException {
    if (blob instanceof CloudBlockBlobWrapper) {
      return blob.openInputStream(getDownloadOptions(),
          getInstrumentedContext(isConcurrentOOBAppendAllowed()));
    } else {
      return new PageBlobInputStream(
          (CloudPageBlobWrapper) blob, getInstrumentedContext(
              isConcurrentOOBAppendAllowed()));
    }
  }

  /**
   * Default permission to use when no permission metadata is found.
   * 
   * @return The default permission to use.
   */
  private static PermissionStatus defaultPermissionNoBlobMetadata() {
    return new PermissionStatus("", "", FsPermission.getDefault());
  }

  private static void storeMetadataAttribute(CloudBlobWrapper blob,
      String key, String value) {
    HashMap<String, String> metadata = blob.getMetadata();
    if (null == metadata) {
      metadata = new HashMap<String, String>();
    }
    metadata.put(key, value);
    blob.setMetadata(metadata);
  }

  private static String getMetadataAttribute(CloudBlobWrapper blob,
      String... keyAlternatives) {
    HashMap<String, String> metadata = blob.getMetadata();
    if (null == metadata) {
      return null;
    }
    for (String key : keyAlternatives) {
      if (metadata.containsKey(key)) {
        return metadata.get(key);
      }
    }
    return null;
  }

  private static void removeMetadataAttribute(CloudBlobWrapper blob,
      String key) {
    HashMap<String, String> metadata = blob.getMetadata();
    if (metadata != null) {
      metadata.remove(key);
      blob.setMetadata(metadata);
    }
  }

  private static void storePermissionStatus(CloudBlobWrapper blob,
      PermissionStatus permissionStatus) {
    storeMetadataAttribute(blob, PERMISSION_METADATA_KEY,
        PERMISSION_JSON_SERIALIZER.toJSON(permissionStatus));
    removeMetadataAttribute(blob, OLD_PERMISSION_METADATA_KEY);
  }

  private PermissionStatus getPermissionStatus(CloudBlobWrapper blob) {
    String permissionMetadataValue = getMetadataAttribute(blob,
        PERMISSION_METADATA_KEY, OLD_PERMISSION_METADATA_KEY);
    if (permissionMetadataValue != null) {
      return PermissionStatusJsonSerializer.fromJSONString(
          permissionMetadataValue);
    } else {
      return defaultPermissionNoBlobMetadata();
    }
  }

  private static void storeFolderAttribute(CloudBlobWrapper blob) {
    storeMetadataAttribute(blob, IS_FOLDER_METADATA_KEY, "true");
    removeMetadataAttribute(blob, OLD_IS_FOLDER_METADATA_KEY);
  }

  private static void storeLinkAttribute(CloudBlobWrapper blob,
      String linkTarget) throws UnsupportedEncodingException {
    String encodedLinkTarget = null;
    if (linkTarget != null) {
      encodedLinkTarget = URLEncoder.encode(linkTarget, "UTF-8");
    }
    storeMetadataAttribute(blob,
        LINK_BACK_TO_UPLOAD_IN_PROGRESS_METADATA_KEY,
        encodedLinkTarget);
    removeMetadataAttribute(blob,
        OLD_LINK_BACK_TO_UPLOAD_IN_PROGRESS_METADATA_KEY);
  }

  private static String getLinkAttributeValue(CloudBlobWrapper blob)
      throws UnsupportedEncodingException {
    String encodedLinkTarget = getMetadataAttribute(blob,
        LINK_BACK_TO_UPLOAD_IN_PROGRESS_METADATA_KEY,
        OLD_LINK_BACK_TO_UPLOAD_IN_PROGRESS_METADATA_KEY);
    String linkTarget = null;
    if (encodedLinkTarget != null) {
      linkTarget = URLDecoder.decode(encodedLinkTarget, "UTF-8");
    }
    return linkTarget;
  }

  private static boolean retrieveFolderAttribute(CloudBlobWrapper blob) {
    HashMap<String, String> metadata = blob.getMetadata();
    return null != metadata
        && (metadata.containsKey(IS_FOLDER_METADATA_KEY) || metadata
            .containsKey(OLD_IS_FOLDER_METADATA_KEY));
  }

  private static void storeVersionAttribute(CloudBlobContainerWrapper container) {
    HashMap<String, String> metadata = container.getMetadata();
    if (null == metadata) {
      metadata = new HashMap<String, String>();
    }
    metadata.put(VERSION_METADATA_KEY, CURRENT_WASB_VERSION);
    if (metadata.containsKey(OLD_VERSION_METADATA_KEY)) {
      metadata.remove(OLD_VERSION_METADATA_KEY);
    }
    container.setMetadata(metadata);
  }

  private static String retrieveVersionAttribute(
      CloudBlobContainerWrapper container) {
    HashMap<String, String> metadata = container.getMetadata();
    if (metadata == null) {
      return null;
    } else if (metadata.containsKey(VERSION_METADATA_KEY)) {
      return metadata.get(VERSION_METADATA_KEY);
    } else if (metadata.containsKey(OLD_VERSION_METADATA_KEY)) {
      return metadata.get(OLD_VERSION_METADATA_KEY);
    } else {
      return null;
    }
  }

  @Override
  public void storeEmptyFolder(String key, PermissionStatus permissionStatus)
      throws AzureException {

    if (null == storageInteractionLayer) {
      final String errMsg = String.format(
          "Storage session expected for URI '%s' but does not exist.",
          sessionUri);
      throw new AssertionError(errMsg);
    }

    if (!isAuthenticatedAccess()) {
      throw new AzureException(
          "Uploads to to public accounts using anonymous access is prohibited.");
    }

    try {
      checkContainer(ContainerAccessType.PureWrite);

      CloudBlobWrapper blob = getBlobReference(key);
      storePermissionStatus(blob, permissionStatus);
      storeFolderAttribute(blob);
      openOutputStream(blob).close();
    } catch (Exception e) {
      throw new AzureException(e);
    }
  }

  @Override
  public void storeEmptyLinkFile(String key, String tempBlobKey,
      PermissionStatus permissionStatus) throws AzureException {
    if (null == storageInteractionLayer) {
      final String errMsg = String.format(
          "Storage session expected for URI '%s' but does not exist.",
          sessionUri);
      throw new AssertionError(errMsg);
    }
    if (!isAuthenticatedAccess()) {
      throw new AzureException(
          "Uploads to to public accounts using anonymous access is prohibited.");
    }

    try {
      checkContainer(ContainerAccessType.PureWrite);

      CloudBlobWrapper blob = getBlobReference(key);
      storePermissionStatus(blob, permissionStatus);
      storeLinkAttribute(blob, tempBlobKey);
      openOutputStream(blob).close();
    } catch (Exception e) {
      throw new AzureException(e);
    }
  }

  @Override
  public String getLinkInFileMetadata(String key) throws AzureException {
    if (null == storageInteractionLayer) {
      final String errMsg = String.format(
          "Storage session expected for URI '%s' but does not exist.",
          sessionUri);
      throw new AssertionError(errMsg);
    }

    try {
      checkContainer(ContainerAccessType.PureRead);

      CloudBlobWrapper blob = getBlobReference(key);
      blob.downloadAttributes(getInstrumentedContext());
      return getLinkAttributeValue(blob);
    } catch (Exception e) {
      throw new AzureException(e);
    }
  }

  /**
   * Private method to check for authenticated access.
   * 
   * @ returns boolean -- true if access is credentialed and authenticated and
   * false otherwise.
   */
  private boolean isAuthenticatedAccess() throws AzureException {

    if (isAnonymousCredentials) {
      return false;
    }
    return true;
  }

  private Iterable<ListBlobItem> listRootBlobs(boolean includeMetadata)
      throws StorageException, URISyntaxException {
    return rootDirectory.listBlobs(
        null, false,
        includeMetadata ?
            EnumSet.of(BlobListingDetails.METADATA) :
              EnumSet.noneOf(BlobListingDetails.class),
        null,
              getInstrumentedContext());
  }

  private Iterable<ListBlobItem> listRootBlobs(String aPrefix,
      boolean includeMetadata) throws StorageException, URISyntaxException {

    Iterable<ListBlobItem> list = rootDirectory.listBlobs(aPrefix,
        false,
        includeMetadata ?
            EnumSet.of(BlobListingDetails.METADATA) :
              EnumSet.noneOf(BlobListingDetails.class),
              null,
              getInstrumentedContext());
    return list;
  }

  private Iterable<ListBlobItem> listRootBlobs(String aPrefix, boolean useFlatBlobListing,
      EnumSet<BlobListingDetails> listingDetails, BlobRequestOptions options,
      OperationContext opContext) throws StorageException, URISyntaxException {

    CloudBlobDirectoryWrapper directory =  this.container.getDirectoryReference(aPrefix);
    return directory.listBlobs(
        null,
        useFlatBlobListing,
        listingDetails,
        options,
        opContext);
  }

  private CloudBlobWrapper getBlobReference(String aKey)
      throws StorageException, URISyntaxException {

    CloudBlobWrapper blob = null;
    if (isPageBlobKey(aKey)) {
      blob = this.container.getPageBlobReference(aKey);
    } else {
      blob = this.container.getBlockBlobReference(aKey);
      blob.setStreamMinimumReadSizeInBytes(downloadBlockSizeBytes);
      blob.setWriteBlockSizeInBytes(uploadBlockSizeBytes);
    }

    return blob;
  }

  private String normalizeKey(URI keyUri) {
    String normKey;
    int parts = isStorageEmulator ? 4 : 3;
    normKey = keyUri.getPath().split("/", parts)[(parts - 1)];
    return normKey;
  }

  private String normalizeKey(CloudBlobWrapper blob) {
    return normalizeKey(blob.getUri());
  }

  private String normalizeKey(CloudBlobDirectoryWrapper directory) {
    String dirKey = normalizeKey(directory.getUri());
    if (dirKey.endsWith(PATH_DELIMITER)) {
      dirKey = dirKey.substring(0, dirKey.length() - 1);
    }
    return dirKey;
  }

  private OperationContext getInstrumentedContext() {
    return getInstrumentedContext(false);
  }

  private OperationContext getInstrumentedContext(boolean bindConcurrentOOBIo) {

    OperationContext operationContext = new OperationContext();

    if (selfThrottlingEnabled) {
      SelfThrottlingIntercept.hook(operationContext, selfThrottlingReadFactor,
          selfThrottlingWriteFactor);
    }

    if(bandwidthGaugeUpdater != null) {
      ResponseReceivedMetricUpdater.hook(
         operationContext,
         instrumentation,
         bandwidthGaugeUpdater);
    }

    if (bindConcurrentOOBIo) {
      SendRequestIntercept.bind(storageInteractionLayer.getCredentials(),
          operationContext, true);
    }

    if (testHookOperationContext != null) {
      operationContext =
          testHookOperationContext.modifyOperationContext(operationContext);
    }

    ErrorMetricUpdater.hook(operationContext, instrumentation);

    return operationContext;
  }

  @Override
  public FileMetadata retrieveMetadata(String key) throws IOException {

    if (null == storageInteractionLayer) {
      final String errMsg = String.format(
          "Storage session expected for URI '%s' but does not exist.",
          sessionUri);
      throw new AssertionError(errMsg);
    }

    if (LOG.isDebugEnabled()) {
      LOG.debug("Retrieving metadata for " + key);
    }

    try {
      if (checkContainer(ContainerAccessType.PureRead) == ContainerState.DoesntExist) {
        return null;
      }

      if (key.equals("/")) {
        return new FileMetadata(key, 0, defaultPermissionNoBlobMetadata(),
            BlobMaterialization.Implicit);
      }

      CloudBlobWrapper blob = getBlobReference(key);

      if (null != blob && blob.exists(getInstrumentedContext())) {

        if (LOG.isDebugEnabled()) {
          LOG.debug("Found " + key
              + " as an explicit blob. Checking if it's a file or folder.");
        }

        blob.downloadAttributes(getInstrumentedContext());
        BlobProperties properties = blob.getProperties();

        if (retrieveFolderAttribute(blob)) {
          if (LOG.isDebugEnabled()) {
            LOG.debug(key + " is a folder blob.");
          }
          return new FileMetadata(key, properties.getLastModified().getTime(),
              getPermissionStatus(blob), BlobMaterialization.Explicit);
        } else {
          if (LOG.isDebugEnabled()) {
            LOG.debug(key + " is a normal blob.");
          }

          return new FileMetadata(
              key,
              getDataLength(blob, properties),
              properties.getLastModified().getTime(),
              getPermissionStatus(blob));
        }
      }

      Iterable<ListBlobItem> objects =
          listRootBlobs(
              key,
              true,
              EnumSet.of(BlobListingDetails.METADATA),
              null,
          getInstrumentedContext());

      for (ListBlobItem blobItem : objects) {
        if (blobItem instanceof CloudBlockBlobWrapper
            || blobItem instanceof CloudPageBlobWrapper) {
          LOG.debug("Found blob as a directory-using this file under it to infer its properties "
              + blobItem.getUri());

          blob = (CloudBlobWrapper) blobItem;
          BlobProperties properties = blob.getProperties();

          return new FileMetadata(key, properties.getLastModified().getTime(),
              getPermissionStatus(blob), BlobMaterialization.Implicit);
        }
      }

      return null;

    } catch (Exception e) {
      throw new AzureException(e);
    }
  }

  @Override
  public DataInputStream retrieve(String key) throws AzureException, IOException {
      try {
        if (null == storageInteractionLayer) {
          final String errMsg = String.format(
              "Storage session expected for URI '%s' but does not exist.",
              sessionUri);
          throw new AssertionError(errMsg);
        }
        checkContainer(ContainerAccessType.PureRead);

        CloudBlobWrapper blob = getBlobReference(key);
      BufferedInputStream inBufStream = new BufferedInputStream(
          openInputStream(blob));

        DataInputStream inDataStream = new DataInputStream(inBufStream);
        return inDataStream;
    } catch (Exception e) {
      throw new AzureException(e);
    }
  }

  @Override
  public DataInputStream retrieve(String key, long startByteOffset)
      throws AzureException, IOException {
      try {
        if (null == storageInteractionLayer) {
          final String errMsg = String.format(
              "Storage session expected for URI '%s' but does not exist.",
              sessionUri);
          throw new AssertionError(errMsg);
        }
        checkContainer(ContainerAccessType.PureRead);

        CloudBlobWrapper blob = getBlobReference(key);

        InputStream in = blob.openInputStream(
          getDownloadOptions(), getInstrumentedContext(isConcurrentOOBAppendAllowed()));

        DataInputStream inDataStream = new DataInputStream(in);
        inDataStream.skip(startByteOffset);
        return inDataStream;
    } catch (Exception e) {
      throw new AzureException(e);
    }
  }

  @Override
  public PartialListing list(String prefix, final int maxListingCount,
      final int maxListingDepth) throws IOException {
    return list(prefix, maxListingCount, maxListingDepth, null);
  }

  @Override
  public PartialListing list(String prefix, final int maxListingCount,
      final int maxListingDepth, String priorLastKey) throws IOException {
    return list(prefix, PATH_DELIMITER, maxListingCount, maxListingDepth,
        priorLastKey);
  }

  @Override
  public PartialListing listAll(String prefix, final int maxListingCount,
      final int maxListingDepth, String priorLastKey) throws IOException {
    return list(prefix, null, maxListingCount, maxListingDepth, priorLastKey);
  }

  private static FileMetadata getDirectoryInList(
      final Iterable<FileMetadata> list, String key) {
    for (FileMetadata current : list) {
      if (current.isDir() && current.getKey().equals(key)) {
        return current;
      }
    }
    return null;
  }

  private PartialListing list(String prefix, String delimiter,
      final int maxListingCount, final int maxListingDepth, String priorLastKey)
      throws IOException {
    try {
      checkContainer(ContainerAccessType.PureRead);

      if (0 < prefix.length() && !prefix.endsWith(PATH_DELIMITER)) {
        prefix += PATH_DELIMITER;
      }

      Iterable<ListBlobItem> objects;
      if (prefix.equals("/")) {
        objects = listRootBlobs(true);
      } else {
        objects = listRootBlobs(prefix, true);
      }

      ArrayList<FileMetadata> fileMetadata = new ArrayList<FileMetadata>();
      for (ListBlobItem blobItem : objects) {
        if (fileMetadata.size() >= maxListingCount) {
          break;
        }
        processBlobItem(blobItem, fileMetadata, maxListingDepth);
      }
      priorLastKey = null;
      PartialListing listing = new PartialListing(priorLastKey,
          fileMetadata.toArray(new FileMetadata[] {}),
          fileMetadata.isEmpty() ? new String[] {}
      : new String[] { prefix });
      return listing;
    } catch (Exception e) {
      throw new AzureException(e);
    }
  }

  private void processBlobItem(ListBlobItem blobItem,
      ArrayList<FileMetadata> list, int maxListingDepth) throws Exception {
    if (blobItem instanceof CloudBlockBlobWrapper || blobItem instanceof CloudPageBlobWrapper) {
      CloudBlobWrapper blob = (CloudBlobWrapper) blobItem;
      BlobProperties properties = blob.getProperties();
      String blobKey = normalizeKey(blob);
      FileMetadata metadata;
      if (retrieveFolderAttribute(blob)) {
        metadata = new FileMetadata(blobKey,
            properties.getLastModified().getTime(),
            getPermissionStatus(blob),
            BlobMaterialization.Explicit);
      } else {
        metadata = new FileMetadata(
            blobKey,
            getDataLength(blob, properties),
            properties.getLastModified().getTime(),
            getPermissionStatus(blob));
      }
      FileMetadata existing = getDirectoryInList(list, blobKey);
      if (existing != null) list.remove(existing);
      list.add(metadata);
    } else if (blobItem instanceof CloudBlobDirectoryWrapper) {
      CloudBlobDirectoryWrapper directory = (CloudBlobDirectoryWrapper) blobItem;
      String dirKey = normalizeKey(directory);
      if (dirKey.endsWith(PATH_DELIMITER)) {
        dirKey = dirKey.substring(0, dirKey.length() - 1);
      }
      if (getDirectoryInList(list, dirKey) == null) {
        list.add(new FileMetadata(dirKey, 0,
            defaultPermissionNoBlobMetadata(), BlobMaterialization.Implicit));
      }
      buildUpList(directory, list, maxListingCount, maxListingDepth - 1);
    }
  }

  private void buildUpList(CloudBlobDirectoryWrapper aCloudBlobDirectory,
      ArrayList<FileMetadata> aFileMetadataList, final int maxListingCount,
      final int maxListingDepth) throws Exception {

    AzureLinkedStack<Iterator<ListBlobItem>> dirIteratorStack =
        new AzureLinkedStack<Iterator<ListBlobItem>>();

    Iterable<ListBlobItem> blobItems = aCloudBlobDirectory.listBlobs(null,
        false, EnumSet.of(BlobListingDetails.METADATA), null,
        getInstrumentedContext());
    Iterator<ListBlobItem> blobItemIterator = blobItems.iterator();

    if (0 == maxListingDepth || 0 == maxListingCount) {
      return;
    }

    final boolean isUnboundedDepth = (maxListingDepth < 0);
    int listingDepth = 1;

    while (blobItemIterator
        && (maxListingCount <= 0 || aFileMetadataList.size() < maxListingCount)) {
      while (blobItemIterator.hasNext()) {
        if (fileMetadata.size() >= maxListingCount) {
          break;
        }

        ListBlobItem blobItem = blobItemIterator.next();

        if (blobItem instanceof CloudBlockBlobWrapper || blobItem instanceof CloudPageBlobWrapper) {
          CloudBlobWrapper blob = (CloudBlobWrapper) blobItem;
          BlobProperties properties = blob.getProperties();
          String blobKey = normalizeKey(blob);
          FileMetadata metadata;
          if (retrieveFolderAttribute(blob)) {
            metadata = new FileMetadata(blobKey,
                properties.getLastModified().getTime(),
                getPermissionStatus(blob),
                BlobMaterialization.Explicit);
          } else {
            metadata = new FileMetadata(
                blobKey,
                getDataLength(blob, properties),
                properties.getLastModified().getTime(),
                getPermissionStatus(blob));
          }
          FileMetadata existing = getDirectoryInList(aFileMetadataList, blobKey);
          if (existing != null) aFileMetadataList.remove(existing);
          aFileMetadataList.add(metadata);
        } else if (blobItem instanceof CloudBlobDirectoryWrapper) {
          CloudBlobDirectoryWrapper directory = (CloudBlobDirectoryWrapper) blobItem;

          if (isUnboundedDepth || maxListingDepth > listingDepth) {
            dirIteratorStack.push(blobItemIterator);
            ++listingDepth;

            Iterable<ListBlobItem> subItems = directory.listBlobs(null, false,
                EnumSet.noneOf(BlobListingDetails.class), null,
                getInstrumentedContext());
            blobItemIterator = subItems.iterator();
          } else {
            String dirKey = normalizeKey(directory);
            if (getDirectoryInList(aFileMetadataList, dirKey) == null) {
              aFileMetadataList.add(new FileMetadata(dirKey,
                  0,
                  defaultPermissionNoBlobMetadata(),
                  BlobMaterialization.Implicit));
            }
          }
        }
      }

      if (dirIteratorStack.isEmpty()) {
        blobItemIterator = null;
      } else {
        blobItemIterator = dirIteratorStack.pop();
        --listingDepth;
        if (listingDepth < 0) {
          throw new AssertionError("Non-negative listing depth expected");
        }
      }
    }
  }

  private long getDataLength(CloudBlobWrapper blob, BlobProperties properties)
    throws AzureException {
    if (blob instanceof CloudPageBlobWrapper) {
      try {
        return PageBlobInputStream.getPageBlobSize((CloudPageBlobWrapper) blob,
            getInstrumentedContext(
                isConcurrentOOBAppendAllowed()));
      } catch (Exception e) {
        throw new AzureException(
            "Unexpected exception getting page blob actual data size.", e);
      }
    }
    return properties.getLength();
  }

  private void safeDelete(CloudBlobWrapper blob, SelfRenewingLease lease) throws StorageException {
    OperationContext operationContext = getInstrumentedContext();
    try {
      blob.delete(operationContext, lease);
    } catch (StorageException e) {
      if (e.getErrorCode() != null &&
          e.getErrorCode().equals("BlobNotFound") &&
          operationContext.getRequestResults().size() > 1 &&
          operationContext.getRequestResults().get(0).getException() != null) {
        if (LOG.isDebugEnabled()) {
          LOG.debug("Swallowing delete exception on retry: " + e.getMessage());
        }
        return;
      } else {
        throw e;
      }
    } finally {
      if (lease != null) {
        lease.free();
      }
    }
  }

  @Override
  public void delete(String key, SelfRenewingLease lease) throws IOException {
    try {
      if (checkContainer(ContainerAccessType.ReadThenWrite) == ContainerState.DoesntExist) {
        return;
      }

      CloudBlobWrapper blob = getBlobReference(key);
      if (blob.exists(getInstrumentedContext())) {
        safeDelete(blob, lease);
      }
    } catch (Exception e) {
      throw new AzureException(e);
    }
  }

  @Override
  public void delete(String key) throws IOException {
    delete(key, null);
  }

  @Override
  public void rename(String srcKey, String dstKey) throws IOException {
    rename(srcKey, dstKey, false, null);
  }

  @Override
  public void rename(String srcKey, String dstKey, boolean acquireLease,
      SelfRenewingLease existingLease) throws IOException {

    if (LOG.isDebugEnabled()) {
      LOG.debug("Moving " + srcKey + " to " + dstKey);
    }

    if (acquireLease && existingLease != null) {
      throw new IOException("Cannot acquire new lease if one already exists.");
    }

    try {
      if (null == storageInteractionLayer) {
        final String errMsg = String.format(
            "Storage session expected for URI '%s' but does not exist.",
            sessionUri);
        throw new AssertionError(errMsg);
      }

      checkContainer(ContainerAccessType.ReadThenWrite);
      CloudBlobWrapper srcBlob = getBlobReference(srcKey);

      if (!srcBlob.exists(getInstrumentedContext())) {
        throw new AzureException ("Source blob " + srcKey +
            " does not exist.");
      }

      SelfRenewingLease lease = null;
      if (acquireLease) {
        lease = srcBlob.acquireLease();
      } else if (existingLease != null) {
        lease = existingLease;
      }

      CloudBlobWrapper dstBlob = getBlobReference(dstKey);

      URI srcUri = new URI(srcBlob.getUri().toASCIIString());

      copyBlobWithRetry(dstBlob, srcUri);
      waitForCopyToComplete(dstBlob, getInstrumentedContext());
      safeDelete(srcBlob, lease);
    } catch (StorageException e) {
      throw new AzureException(e);
    } catch (URISyntaxException e) {
      throw new AzureException(e);
    }
  }

  private void copyBlobWithRetry(CloudBlobWrapper dstBlob, URI srcUri)
      throws StorageException, URISyntaxException {
    try {
      dstBlob.startCopyFromBlob(srcUri, null, getInstrumentedContext());
    } catch (StorageException se) {
      if (se.getErrorCode().equals(
          StorageErrorCode.SERVER_BUSY.toString())) {
        int copyBlobMinBackoff = sessionConfiguration.getInt(
            KEY_COPYBLOB_MIN_BACKOFF_INTERVAL,
            DEFAULT_COPYBLOB_MIN_BACKOFF_INTERVAL);

        int copyBlobMaxBackoff = sessionConfiguration.getInt(
            KEY_COPYBLOB_MAX_BACKOFF_INTERVAL,
            DEFAULT_COPYBLOB_MAX_BACKOFF_INTERVAL);

        int copyBlobDeltaBackoff = sessionConfiguration.getInt(
            KEY_COPYBLOB_BACKOFF_INTERVAL,
            DEFAULT_COPYBLOB_BACKOFF_INTERVAL);

        int copyBlobMaxRetries = sessionConfiguration.getInt(
            KEY_COPYBLOB_MAX_IO_RETRIES,
            DEFAULT_COPYBLOB_MAX_RETRY_ATTEMPTS);

        BlobRequestOptions options = new BlobRequestOptions();
        options.setRetryPolicyFactory(new RetryExponentialRetry(
            copyBlobMinBackoff, copyBlobDeltaBackoff, copyBlobMaxBackoff, 
            copyBlobMaxRetries));
        dstBlob.startCopyFromBlob(srcUri, options, getInstrumentedContext());
      } else {
        throw se;
      }
    }
  }

  private void waitForCopyToComplete(CloudBlobWrapper blob, OperationContext opContext){
    boolean copyInProgress = true;
    while (copyInProgress) {
      try {
        blob.downloadAttributes(opContext);
        }
      catch (StorageException se){
      }

      copyInProgress = (blob.getCopyState() != null && blob.getCopyState().getStatus() == CopyStatus.PENDING);
      if (copyInProgress) {
        try {
          Thread.sleep(1000);
          }
          catch (InterruptedException ie){
            //ignore
        }
      }
    }
  }

  @Override
  public void changePermissionStatus(String key, PermissionStatus newPermission)
      throws AzureException {
    try {
      checkContainer(ContainerAccessType.ReadThenWrite);
      CloudBlobWrapper blob = getBlobReference(key);
      blob.downloadAttributes(getInstrumentedContext());
      storePermissionStatus(blob, newPermission);
      blob.uploadMetadata(getInstrumentedContext());
    } catch (Exception e) {
      throw new AzureException(e);
    }
  }

  @Override
  public void purge(String prefix) throws IOException {
    try {
      if (null == storageInteractionLayer) {
        final String errMsg = String.format(
            "Storage session expected for URI '%s' but does not exist.",
            sessionUri);
        throw new AssertionError(errMsg);
      }

      if (checkContainer(ContainerAccessType.ReadThenWrite) == ContainerState.DoesntExist) {
        return;
      }
      Iterable<ListBlobItem> objects = listRootBlobs(prefix, false);
      purgeBlobs(objects);
    } catch (Exception e) {
      throw new AzureException(e);
    }
  }

  private void purgeBlobs(Iterable<ListBlobItem> objects) throws StorageException {
    for (ListBlobItem blobItem : objects) {
      ((CloudBlob) blobItem).delete(DeleteSnapshotsOption.NONE, null, null,
          getInstrumentedContext());
    }
  }

  @Override
  public SelfRenewingLease acquireLease(String key) throws AzureException {
    LOG.debug("acquiring lease on " + key);
    try {
      checkContainer(ContainerAccessType.ReadThenWrite);
      CloudBlobWrapper blob = getBlobReference(key);
      return blob.acquireLease();
    }
    catch (Exception e) {
      throw new AzureException(e);
    }
  }

  @Override
  public void updateFolderLastModifiedTime(String key, Date lastModified,
      SelfRenewingLease folderLease)
      throws AzureException {
    try {
      checkContainer(ContainerAccessType.ReadThenWrite);
      CloudBlobWrapper blob = getBlobReference(key);
      blob.uploadProperties(getInstrumentedContext(), folderLease);
    } catch (Exception e) {
      throw new AzureException(e);
    }
  }

  @Override
  public void updateFolderLastModifiedTime(String key,
      SelfRenewingLease folderLease) throws AzureException {
    final Calendar lastModifiedCalendar = Calendar
        .getInstance(Utility.LOCALE_US);
    lastModifiedCalendar.setTimeZone(Utility.UTC_ZONE);
    Date lastModified = lastModifiedCalendar.getTime();
    updateFolderLastModifiedTime(key, lastModified, folderLease);
  }

  @Override
  public void dump() throws IOException {
  }

  @Override
  public void close() {
    if(bandwidthGaugeUpdater != null) {
      bandwidthGaugeUpdater.close();
      bandwidthGaugeUpdater = null;
    }
  }
  
  @Override
  protected void finalize() throws Throwable {
    LOG.debug("finalize() called");
    close();
    super.finalize();
  }
}