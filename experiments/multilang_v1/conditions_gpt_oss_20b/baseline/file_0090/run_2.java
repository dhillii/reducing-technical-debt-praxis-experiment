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

  /* Configuration keys */
  static final String KEY_CHECK_BLOCK_MD5 = "fs.azure.check.block.md5";
  static final String KEY_STORE_BLOB_MD5 = "fs.azure.store.blob.md5";
  static final String DEFAULT_STORAGE_EMULATOR_ACCOUNT_NAME = "storageemulator";
  static final String STORAGE_EMULATOR_ACCOUNT_NAME_PROPERTY_NAME = "fs.azure.storage.emulator.account.name";
  private static final String KEY_ACCOUNT_KEYPROVIDER_PREFIX = "fs.azure.account.keyprovider.";
  private static final String KEY_ACCOUNT_SAS_PREFIX = "fs.azure.sas.";
  private static final String KEY_CONCURRENT_CONNECTION_VALUE_OUT = "fs.azure.concurrentRequestCount.out";
  private static final String KEY_STREAM_MIN_READ_SIZE = "fs.azure.read.request.size";
  private static final String KEY_STORAGE_CONNECTION_TIMEOUT = "fs.azure.storage.timeout";
  private static final String KEY_WRITE_BLOCK_SIZE = "fs.azure.write.request.size";
  private static final String KEY_READ_TOLERATE_CONCURRENT_APPEND = "fs.azure.io.read.tolerate.concurrent.append";
  private static final String KEY_MIN_BACKOFF_INTERVAL = "fs.azure.io.retry.min.backoff.interval";
  private static final String KEY_MAX_BACKOFF_INTERVAL = "fs.azure.io.retry.max.backoff.interval";
  private static final String KEY_BACKOFF_INTERVAL = "fs.azure.io.retry.backoff.interval";
  private static final String KEY_MAX_IO_RETRIES = "fs.azure.io.retry.max.retries";
  private static final String KEY_COPYBLOB_MIN_BACKOFF_INTERVAL = "fs.azure.io.copyblob.retry.min.backoff.interval";
  private static final String KEY_COPYBLOB_MAX_BACKOFF_INTERVAL = "fs.azure.io.copyblob.retry.max.backoff.interval";
  private static final String KEY_COPYBLOB_BACKOFF_INTERVAL = "fs.azure.io.copyblob.retry.backoff.interval";
  private static final String KEY_COPYBLOB_MAX_IO_RETRIES = "fs.azure.io.copyblob.retry.max.retries";
  private static final String KEY_SELF_THROTTLE_ENABLE = "fs.azure.selfthrottling.enable";
  private static final String KEY_SELF_THROTTLE_READ_FACTOR = "fs.azure.selfthrottling.read.factor";
  private static final String KEY_SELF_THROTTLE_WRITE_FACTOR = "fs.azure.selfthrottling.write.factor";
  public static final String KEY_PAGE_BLOB_DIRECTORIES = "fs.azure.page.blob.dir";
  public static final String KEY_ATOMIC_RENAME_DIRECTORIES = "fs.azure.atomic.rename.dir";

  /* Constants */
  private static final String HTTP_SCHEME = "http";
  private static final String HTTPS_SCHEME = "https";
  private static final String WASB_AUTHORITY_DELIMITER = "@";
  private static final String AZURE_ROOT_CONTAINER = "$root";
  private static final int DEFAULT_CONCURRENT_WRITES = 8;
  private static final boolean DEFAULT_READ_TOLERATE_CONCURRENT_APPEND = false;
  public static final int DEFAULT_DOWNLOAD_BLOCK_SIZE = 4 * 1024 * 1024;
  public static final int DEFAULT_UPLOAD_BLOCK_SIZE = 4 * 1024 * 1024;
  private static final int DEFAULT_MIN_BACKOFF_INTERVAL = 1 * 1000;
  private static final int DEFAULT_MAX_BACKOFF_INTERVAL = 30 * 1000;
  private static final int DEFAULT_BACKOFF_INTERVAL = 1 * 1000;
  private static final int DEFAULT_MAX_RETRY_ATTEMPTS = 15;
  private static final int DEFAULT_COPYBLOB_MIN_BACKOFF_INTERVAL = 3 * 1000;
  private static final int DEFAULT_COPYBLOB_MAX_BACKOFF_INTERVAL = 90 * 1000;
  private static final int DEFAULT_COPYBLOB_BACKOFF_INTERVAL = 30 * 1000;
  private static final int DEFAULT_COPYBLOB_MAX_RETRY_ATTEMPTS = 15;
  private static final boolean DEFAULT_SELF_THROTTLE_ENABLE = true;
  private static final float DEFAULT_SELF_THROTTLE_READ_FACTOR = 1.0f;
  private static final float DEFAULT_SELF_THROTTLE_WRITE_FACTOR = 1.0f;
  private static final int STORAGE_CONNECTION_TIMEOUT_DEFAULT = 90;

  /* Metadata keys */
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

  /* Logging */
  public static final Log LOG = LogFactory.getLog(AzureNativeFileSystemStore.class);

  /* State */
  private StorageInterface storageInteractionLayer;
  private CloudBlobDirectoryWrapper rootDirectory;
  private CloudBlobContainerWrapper container;
  private URI sessionUri;
  private Configuration sessionConfiguration;
  private int concurrentWrites = DEFAULT_CONCURRENT_WRITES;
  private boolean isAnonymousCredentials = false;
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
  private int minBackoff;
  private int maxBackoff;
  private int deltaBackoff;
  private int maxRetries;
  private boolean selfThrottlingEnabled;
  private float selfThrottlingReadFactor;
  private float selfThrottlingWriteFactor;
  private TestHookOperationContext testHookOperationContext = null;
  private boolean isStorageEmulator = false;
  private Set<String> pageBlobDirs;
  private Set<String> atomicRenameDirs;

  /* Test hook interface */
  @VisibleForTesting
  interface TestHookOperationContext {
    OperationContext modifyOperationContext(OperationContext original);
  }

  /* Helper to create JSON serializer for PermissionStatus */
  private static JSON createPermissionJsonSerializer() {
    JSON serializer = new JSON();
    serializer.addConvertor(PermissionStatus.class, new PermissionStatusJsonSerializer());
    return serializer;
  }

  /* PermissionStatus JSON serializer */
  private static class PermissionStatusJsonSerializer implements JSON.Convertor {
    private static final String OWNER_TAG = "owner";
    private static final String GROUP_TAG = "group";
    private static final String PERMISSIONS_TAG = "permissions";

    @Override
    public void toJSON(Object obj, JSON.Output out) {
      PermissionStatus permissionStatus = (PermissionStatus) obj;
      String group = permissionStatus.getGroupName() == null ? "" : permissionStatus.getGroupName();
      out.add(OWNER_TAG, permissionStatus.getUserName());
      out.add(GROUP_TAG, group);
      out.add(PERMISSIONS_TAG, permissionStatus.getPermission().toString());
    }

    @Override
    public Object fromJSON(@SuppressWarnings("rawtypes") Map object) {
      return fromJSONMap(object);
    }

    @SuppressWarnings("rawtypes")
    public static PermissionStatus fromJSONString(String jsonString) {
      return fromJSONMap((Map) PERMISSION_JSON_SERIALIZER.fromJSON(jsonString));
    }

    private static PermissionStatus fromJSONMap(@SuppressWarnings("rawtypes") Map object) {
      return new PermissionStatus((String) object.get(OWNER_TAG),
          (String) object.get(GROUP_TAG),
          FsPermission.valueOf("-" + (String) object.get(PERMISSIONS_TAG)));
    }
  }

  /* Set the storage interaction layer (used for testing) */
  @VisibleForTesting
  void setAzureStorageInteractionLayer(StorageInterface storageInteractionLayer) {
    this.storageInteractionLayer = storageInteractionLayer;
  }

  @VisibleForTesting
  public BandwidthGaugeUpdater getBandwidthGaugeUpdater() {
    return bandwidthGaugeUpdater;
  }

  /* Suppress retry policy for tests */
  @VisibleForTesting
  void suppressRetryPolicy() {
    suppressRetryPolicy = true;
  }

  /* Add test hook to modify operation context */
  @VisibleForTesting
  void addTestHookToOperationContext(TestHookOperationContext testHook) {
    this.testHookOperationContext = testHook;
  }

  /* Apply suppress retry policy if needed */
  private void suppressRetryPolicyInClientIfNeeded() {
    if (suppressRetryPolicy) {
      storageInteractionLayer.setRetryPolicyFactory(new RetryNoRetry());
    }
  }

  /* Check if concurrent OOB append is allowed */
  private boolean isConcurrentOOBAppendAllowed() {
    return tolerateOobAppends;
  }

  /* Initialize the file system store */
  @Override
  public void initialize(URI uri, Configuration conf, AzureFileSystemInstrumentation instrumentation)
      throws IllegalArgumentException, AzureException, IOException {
    if (instrumentation == null) {
      throw new IllegalArgumentException("Null instrumentation");
    }
    this.instrumentation = instrumentation;

    if (storageInteractionLayer == null) {
      storageInteractionLayer = new StorageInterfaceImpl();
    }

    if (uri == null) {
      throw new IllegalArgumentException("Cannot initialize WASB file system, URI is null");
    }
    if (conf == null) {
      throw new IllegalArgumentException("Cannot initialize WASB file system, conf is null");
    }

    if (!conf.getBoolean(NativeAzureFileSystem.SKIP_AZURE_METRICS_PROPERTY_NAME, false)) {
      this.bandwidthGaugeUpdater = new BandwidthGaugeUpdater(instrumentation);
    }

    sessionUri = uri;
    sessionConfiguration = conf;

    createAzureStorageSession();

    pageBlobDirs = getDirectorySet(KEY_PAGE_BLOB_DIRECTORIES);
    LOG.debug("Page blob directories:  " + setToString(pageBlobDirs));

    atomicRenameDirs = getDirectorySet(KEY_ATOMIC_RENAME_DIRECTORIES);
    try {
      String hbaseRoot = verifyAndConvertToStandardFormat(
          sessionConfiguration.get("hbase.rootdir", "hbase"));
      atomicRenameDirs.add(hbaseRoot);
    } catch (URISyntaxException e) {
      LOG.warn("Unable to initialize HBase root as an atomic rename directory.");
    }
    LOG.debug("Atomic rename directories:  " + setToString(atomicRenameDirs));
  }

  /* Convert set to string for logging */
  private String setToString(Set<String> set) {
    StringBuilder sb = new StringBuilder();
    int i = 1;
    for (String s : set) {
      sb.append("/").append(s);
      if (i != set.size()) {
        sb.append(", ");
      }
      i++;
    }
    return sb.toString();
  }

  /* Get account name from URI authority */
  private String getAccountFromAuthority(URI uri) throws URISyntaxException {
    String authority = uri.getRawAuthority();
    if (authority == null) {
      throw new URISyntaxException(uri.toString(), "Expected URI with a valid authority");
    }
    if (!authority.contains(WASB_AUTHORITY_DELIMITER)) {
      return authority;
    }
    String[] parts = authority.split(WASB_AUTHORITY_DELIMITER, 2);
    if (parts.length < 2 || parts[0].isEmpty()) {
      throw new IllegalArgumentException(String.format(
          "URI '%s' has a malformed WASB authority, expected container name. "
              + "Authority takes the form wasb://[<container name>@]<account name>", uri));
    }
    return parts[1];
  }

  /* Get container name from URI authority */
  private String getContainerFromAuthority(URI uri) throws URISyntaxException {
    String authority = uri.getRawAuthority();
    if (authority == null) {
      throw new URISyntaxException(uri.toString(), "Expected URI with a valid authority");
    }
    if (!authority.contains(WASB_AUTHORITY_DELIMITER)) {
      return AZURE_ROOT_CONTAINER;
    }
    String[] parts = authority.split(WASB_AUTHORITY_DELIMITER, 2);
    if (parts.length < 2 || parts[0].isEmpty()) {
      throw new IllegalArgumentException(String.format(
          "URI '%s' has a malformed WASB authority, expected container name."
              + "Authority takes the form wasb://[<container name>@]<account name>", uri));
    }
    return parts[0];
  }

  /* Determine HTTPS scheme based on URI */
  private String getHTTPScheme() {
    String scheme = sessionUri.getScheme();
    if (scheme != null && (scheme.equalsIgnoreCase("asvs") || scheme.equalsIgnoreCase("wasbs"))) {
      return HTTPS_SCHEME;
    }
    return HTTP_SCHEME;
  }

  /* Configure Azure storage session */
  private void configureAzureStorageSession() throws AzureException {
    if (sessionUri == null) {
      throw new AssertionError("Expected a non-null session URI when configuring storage session");
    }
    if (storageInteractionLayer == null) {
      throw new AssertionError(String.format(
          "Cannot configure storage session for URI '%s' if storage session has not been established.", sessionUri));
    }

    tolerateOobAppends = sessionConfiguration.getBoolean(KEY_READ_TOLERATE_CONCURRENT_APPEND, DEFAULT_READ_TOLERATE_CONCURRENT_APPEND);
    downloadBlockSizeBytes = sessionConfiguration.getInt(KEY_STREAM_MIN_READ_SIZE, DEFAULT_DOWNLOAD_BLOCK_SIZE);
    uploadBlockSizeBytes = sessionConfiguration.getInt(KEY_WRITE_BLOCK_SIZE, DEFAULT_UPLOAD_BLOCK_SIZE);

    int storageConnectionTimeout = sessionConfiguration.getInt(KEY_STORAGE_CONNECTION_TIMEOUT, 0);
    if (storageConnectionTimeout > 0) {
      storageInteractionLayer.setTimeoutInMs(storageConnectionTimeout * 1000);
    }

    int cpuCores = 2 * Runtime.getRuntime().availableProcessors();
    concurrentWrites = sessionConfiguration.getInt(KEY_CONCURRENT_CONNECTION_VALUE_OUT, Math.min(cpuCores, DEFAULT_CONCURRENT_WRITES));

    minBackoff = sessionConfiguration.getInt(KEY_MIN_BACKOFF_INTERVAL, DEFAULT_MIN_BACKOFF_INTERVAL);
    maxBackoff = sessionConfiguration.getInt(KEY_MAX_BACKOFF_INTERVAL, DEFAULT_MAX_BACKOFF_INTERVAL);
    deltaBackoff = sessionConfiguration.getInt(KEY_BACKOFF_INTERVAL, DEFAULT_BACKOFF_INTERVAL);
    maxRetries = sessionConfiguration.getInt(KEY_MAX_IO_RETRIES, DEFAULT_MAX_RETRY_ATTEMPTS);

    storageInteractionLayer.setRetryPolicyFactory(
        new RetryExponentialRetry(minBackoff, deltaBackoff, maxBackoff, maxRetries));

    selfThrottlingEnabled = sessionConfiguration.getBoolean(KEY_SELF_THROTTLE_ENABLE, DEFAULT_SELF_THROTTLE_ENABLE);
    selfThrottlingReadFactor = sessionConfiguration.getFloat(KEY_SELF_THROTTLE_READ_FACTOR, DEFAULT_SELF_THROTTLE_READ_FACTOR);
    selfThrottlingWriteFactor = sessionConfiguration.getFloat(KEY_SELF_THROTTLE_WRITE_FACTOR, DEFAULT_SELF_THROTTLE_WRITE_FACTOR);

    if (LOG.isDebugEnabled()) {
      LOG.debug(String.format(
          "AzureNativeFileSystemStore init. Settings=%d,%b,%d,{%d,%d,%d,%d},{%b,%f,%f}",
          concurrentWrites, tolerateOobAppends,
          ((storageConnectionTimeout > 0) ? storageConnectionTimeout : STORAGE_CONNECTION_TIMEOUT_DEFAULT),
          minBackoff, deltaBackoff, maxBackoff, maxRetries,
          selfThrottlingEnabled, selfThrottlingReadFactor, selfThrottlingWriteFactor));
    }
  }

  /* Connect using anonymous credentials */
  private void connectUsingAnonymousCredentials(final URI uri)
      throws StorageException, IOException, URISyntaxException {
    String accountName = getAccountFromAuthority(uri);
    URI storageUri = new URI(getHTTPScheme() + "://" + PATH_DELIMITER + PATH_DELIMITER + accountName);
    String containerName = getContainerFromAuthority(uri);
    storageInteractionLayer.createBlobClient(storageUri);
    suppressRetryPolicyInClientIfNeeded();
    container = storageInteractionLayer.getContainerReference(containerName);
    rootDirectory = container.getDirectoryReference("");
    try {
      if (!container.exists(getInstrumentedContext())) {
        throw new AzureException("Container " + containerName + " in account "
            + accountName + " not found, and we can't create it using anonymous credentials.");
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

  /* Connect using credentials */
  private void connectUsingCredentials(String accountName,
      StorageCredentials credentials, String containerName)
      throws URISyntaxException, StorageException, AzureException {
    URI blobEndPoint;
    if (isStorageEmulatorAccount(accountName)) {
      isStorageEmulator = true;
      CloudStorageAccount account = CloudStorageAccount.getDevelopmentStorageAccount();
      storageInteractionLayer.createBlobClient(account);
    } else {
      blobEndPoint = new URI(getHTTPScheme() + "://" + accountName);
      storageInteractionLayer.createBlobClient(blobEndPoint, credentials);
    }
    suppressRetryPolicyInClientIfNeeded();
    container = storageInteractionLayer.getContainerReference(containerName);
    rootDirectory = container.getDirectoryReference("");
    canCreateOrModifyContainer = credentials instanceof StorageCredentialsAccountAndKey;
    configureAzureStorageSession();
  }

  /* Connect using account key credentials */
  private void connectUsingConnectionStringCredentials(
      final String accountName, final String containerName,
      final String accountKey) throws InvalidKeyException, StorageException,
      IOException, URISyntaxException {
    String rawAccountName = accountName.split("\\.")[0];
    StorageCredentials credentials = new StorageCredentialsAccountAndKey(rawAccountName, accountKey);
    connectUsingCredentials(accountName, credentials, containerName);
  }

  /* Connect using SAS credentials */
  private void connectUsingSASCredentials(final String accountName,
      final String containerName, final String sas) throws InvalidKeyException,
      StorageException, IOException, URISyntaxException {
    StorageCredentials credentials = new StorageCredentialsSharedAccessSignature(sas);
    connectingUsingSAS = true;
    connectUsingCredentials(accountName, credentials, containerName);
  }

  /* Check if account is emulator */
  private boolean isStorageEmulatorAccount(final String accountName) {
    return accountName.equalsIgnoreCase(sessionConfiguration.get(
        STORAGE_EMULATOR_ACCOUNT_NAME_PROPERTY_NAME,
        DEFAULT_STORAGE_EMULATOR_ACCOUNT_NAME));
  }

  /* Get account key from configuration */
  @VisibleForTesting
  public static String getAccountKeyFromConfiguration(String accountName,
      Configuration conf) throws KeyProviderException {
    String keyProviderClass = conf.get(KEY_ACCOUNT_KEYPROVIDER_PREFIX + accountName);
    KeyProvider keyProvider;
    if (keyProviderClass == null) {
      keyProvider = new SimpleKeyProvider();
    } else {
      try {
        Class<?> clazz = conf.getClassByName(keyProviderClass);
        Object obj = clazz.newInstance();
        if (!(obj instanceof KeyProvider)) {
          throw new KeyProviderException(keyProviderClass
              + " specified in config is not a valid KeyProvider class.");
        }
        keyProvider = (KeyProvider) obj;
      } catch (Exception e) {
        throw new KeyProviderException("Unable to load key provider class.", e);
      }
    }
    return keyProvider.getStorageAccountKey(accountName, conf);
  }

  /* Create Azure storage session */
  private void createAzureStorageSession()
      throws AzureException, IOException {
    if (sessionUri == null || sessionConfiguration == null) {
      throw new AzureException("Filesystem object not initialized properly."
          + "Unable to start session with Azure Storage server.");
    }
    try {
      if (getContainerFromAuthority(sessionUri) == null) {
        throw new AssertionError(String.format(
            "Non-null container expected from session URI: %s.", sessionUri));
      }
      String accountName = getAccountFromAuthority(sessionUri);
      if (accountName == null) {
        throw new AzureException(String.format(
            "Cannot load WASB file system account name not specified in URI: %s.", sessionUri));
      }
      instrumentation.setAccountName(accountName);
      String containerName = getContainerFromAuthority(sessionUri);
      instrumentation.setContainerName(containerName);

      if (isStorageEmulatorAccount(accountName)) {
        connectUsingCredentials(accountName, null, containerName);
        return;
      }

      String sas = sessionConfiguration.get(KEY_ACCOUNT_SAS_PREFIX + containerName + "." + accountName);
      if (sas != null) {
        connectUsingSASCredentials(accountName, containerName, sas);
        return;
      }

      String key = getAccountKeyFromConfiguration(accountName, sessionConfiguration);
      if (key != null) {
        connectUsingConnectionStringCredentials(accountName, containerName, key);
        return;
      }

      connectUsingAnonymousCredentials(sessionUri);
    } catch (Exception e) {
      throw new AzureException(e);
    }
  }

  /* Container state enum */
  private enum ContainerState {
    Unknown, DoesntExist, ExistsNoVersion, ExistsAtWrongVersion, ExistsAtRightVersion
  }

  /* Container access type enum */
  private enum ContainerAccessType {
    PureRead, PureWrite, ReadThenWrite
  }

  /* Trim prefix/suffix */
  private static String trim(String s, String toTrim) {
    return StringUtils.removeEnd(StringUtils.removeStart(s, toTrim), toTrim);
  }

  /* Verify and convert directory to standard format */
  private String verifyAndConvertToStandardFormat(String rawDir) throws URISyntaxException {
    URI asUri = new URI(rawDir);
    if (asUri.getAuthority() == null
        || asUri.getAuthority().toLowerCase(Locale.ENGLISH).equalsIgnoreCase(
            sessionUri.getAuthority().toLowerCase(Locale.ENGLISH))) {
      return trim(asUri.getPath(), "/");
    }
    return null;
  }

  /* Get directory set from config */
  private Set<String> getDirectorySet(final String configVar)
      throws AzureException {
    String[] rawDirs = sessionConfiguration.getStrings(configVar, new String[0]);
    Set<String> directorySet = new HashSet<>();
    for (String currentDir : rawDirs) {
      String myDir;
      try {
        myDir = verifyAndConvertToStandardFormat(currentDir);
      } catch (URISyntaxException ex) {
        throw new AzureException(String.format(
            "The directory %s specified in the configuration entry %s is not a valid URI.", currentDir, configVar));
      }
      if (myDir != null) {
        directorySet.add(myDir);
      }
    }
    return directorySet;
  }

  /* Check if key is page blob */
  public boolean isPageBlobKey(String key) {
    return isKeyForDirectorySet(key, pageBlobDirs);
  }

  /* Check if key is atomic rename */
  @Override
  public boolean isAtomicRenameKey(String key) {
    return isKeyForDirectorySet(key, atomicRenameDirs);
  }

  /* Check if key is in directory set */
  public boolean isKeyForDirectorySet(String key, Set<String> dirSet) {
    String defaultFS = FileSystem.getDefaultUri(sessionConfiguration).toString();
    for (String dir : dirSet) {
      if (dir.isEmpty() || key.startsWith(dir + "/")) {
        return true;
      }
      try {
        URI uriPageBlobDir = new URI(dir);
        if (uriPageBlobDir.getAuthority() == null) {
          if (key.startsWith(trim(defaultFS, "/") + "/" + dir + "/")) {
            return true;
          }
        }
      } catch (URISyntaxException e) {
        LOG.info(String.format("URI syntax error creating URI for %s", dir));
      }
    }
    return false;
  }

  /* Check container state */
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
      if (currentKnownContainerState == ContainerState.ExistsAtRightVersion) {
        throw new AssertionError("Unexpected state: " + currentKnownContainerState);
      }

      try {
        container.downloadAttributes(getInstrumentedContext());
        currentKnownContainerState = ContainerState.Unknown;
      } catch (StorageException ex) {
        if (ex.getErrorCode().equals(StorageErrorCode.RESOURCE_NOT_FOUND.toString())) {
          currentKnownContainerState = ContainerState.DoesntExist;
        } else {
          throw ex;
        }
      }

      if (currentKnownContainerState == ContainerState.DoesntExist) {
        if (needToCreateContainer(accessType)) {
          storeVersionAttribute(container);
          container.create(getInstrumentedContext());
          currentKnownContainerState = ContainerState.ExistsAtRightVersion;
        }
      } else {
        String containerVersion = retrieveVersionAttribute(container);
        if (containerVersion != null) {
          if (containerVersion.equals(FIRST_WASB_VERSION)) {
            if (needToStampVersion(accessType)) {
              storeVersionAttribute(container);
              container.uploadMetadata(getInstrumentedContext());
            }
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
      return currentKnownContainerState;
    }
  }

  private AzureException wrongVersionException(String containerVersion) {
    return new AzureException("The container " + container.getName()
        + " is at an unsupported version: " + containerVersion
        + ". Current supported version: " + FIRST_WASB_VERSION);
  }

  private boolean needToStampVersion(ContainerAccessType accessType) {
    return accessType != ContainerAccessType.PureRead && canCreateOrModifyContainer;
  }

  private static boolean needToCreateContainer(ContainerAccessType accessType) {
    return accessType == ContainerAccessType.PureWrite;
  }

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

  /* Get transactional MD5 usage */
  private boolean getUseTransactionalContentMD5() {
    return sessionConfiguration.getBoolean(KEY_CHECK_BLOCK_MD5, true);
  }

  /* Get upload options */
  private BlobRequestOptions getUploadOptions() {
    BlobRequestOptions options = new BlobRequestOptions();
    options.setStoreBlobContentMD5(sessionConfiguration.getBoolean(KEY_STORE_BLOB_MD5, false));
    options.setUseTransactionalContentMD5(getUseTransactionalContentMD5());
    options.setConcurrentRequestCount(concurrentWrites);
    options.setRetryPolicyFactory(new RetryExponentialRetry(minBackoff, deltaBackoff, maxBackoff, maxRetries));
    return options;
  }

  /* Get download options */
  private BlobRequestOptions getDownloadOptions() {
    BlobRequestOptions options = new BlobRequestOptions();
    options.setRetryPolicyFactory(new RetryExponentialRetry(minBackoff, deltaBackoff, maxBackoff, maxRetries));
    options.setUseTransactionalContentMD5(getUseTransactionalContentMD5());
    return options;
  }

  /* Store file */
  @Override
  public DataOutputStream storefile(String key, PermissionStatus permissionStatus)
      throws AzureException {
    try {
      if (storageInteractionLayer == null) {
        throw new AzureException(String.format(
            "Storage session expected for URI '%s' but does not exist.", sessionUri));
      }
      if (!isAuthenticatedAccess()) {
        throw new AzureException(new IOException(
            "Uploads to public accounts using anonymous access is prohibited."));
      }
      checkContainer(ContainerAccessType.PureWrite);
      if (AZURE_ROOT_CONTAINER.equals(getContainerFromAuthority(sessionUri))) {
        throw new AzureException(String.format(
            "Writes to '%s' container for URI '%s' are prohibited, only updates on non-root containers permitted.",
            AZURE_ROOT_CONTAINER, sessionUri));
      }
      CloudBlobWrapper blob = getBlobReference(key);
      storePermissionStatus(blob, permissionStatus);
      OutputStream outputStream = openOutputStream(blob);
      return new SyncableDataOutputStream(outputStream);
    } catch (Exception e) {
      throw new AzureException(e);
    }
  }

  /* Open output stream */
  private OutputStream openOutputStream(final CloudBlobWrapper blob)
      throws StorageException {
    if (blob instanceof CloudPageBlobWrapperImpl) {
      return new PageBlobOutputStream(
          (CloudPageBlobWrapper) blob, getInstrumentedContext(), sessionConfiguration);
    } else {
      return ((CloudBlockBlobWrapper) blob).openOutputStream(getUploadOptions(),
          getInstrumentedContext());
    }
  }

  /* Open input stream */
  private InputStream openInputStream(CloudBlobWrapper blob)
      throws StorageException, IOException {
    if (blob instanceof CloudBlockBlobWrapper) {
      return blob.openInputStream(getDownloadOptions(),
          getInstrumentedContext(isConcurrentOOBAppendAllowed()));
    } else {
      return new PageBlobInputStream(
          (CloudPageBlobWrapper) blob, getInstrumentedContext(isConcurrentOOBAppendAllowed()));
    }
  }

  /* Default permission */
  private static PermissionStatus defaultPermissionNoBlobMetadata() {
    return new PermissionStatus("", "", FsPermission.getDefault());
  }

  /* Store metadata attribute */
  private static void storeMetadataAttribute(CloudBlobWrapper blob,
      String key, String value) {
    HashMap<String, String> metadata = blob.getMetadata();
    if (metadata == null) {
      metadata = new HashMap<>();
    }
    metadata.put(key, value);
    blob.setMetadata(metadata);
  }

  /* Get metadata attribute */
  private static String getMetadataAttribute(CloudBlobWrapper blob,
      String... keyAlternatives) {
    HashMap<String, String> metadata = blob.getMetadata();
    if (metadata == null) {
      return null;
    }
    for (String key : keyAlternatives) {
      if (metadata.containsKey(key)) {
        return metadata.get(key);
      }
    }
    return null;
  }

  /* Remove metadata attribute */
  private static void removeMetadataAttribute(CloudBlobWrapper blob,
      String key) {
    HashMap<String, String> metadata = blob.getMetadata();
    if (metadata != null) {
      metadata.remove(key);
      blob.setMetadata(metadata);
    }
  }

  /* Store permission status */
  private static void storePermissionStatus(CloudBlobWrapper blob,
      PermissionStatus permissionStatus) {
    storeMetadataAttribute(blob, PERMISSION_METADATA_KEY,
        PERMISSION_JSON_SERIALIZER.toJSON(permissionStatus));
    removeMetadataAttribute(blob, OLD_PERMISSION_METADATA_KEY);
  }

  /* Get permission status */
  private PermissionStatus getPermissionStatus(CloudBlobWrapper blob) {
    String permissionMetadataValue = getMetadataAttribute(blob,
        PERMISSION_METADATA_KEY, OLD_PERMISSION_METADATA_KEY);
    if (permissionMetadataValue != null) {
      return PermissionStatusJsonSerializer.fromJSONString(permissionMetadataValue);
    } else {
      return defaultPermissionNoBlobMetadata();
    }
  }

  /* Store folder attribute */
  private static void storeFolderAttribute(CloudBlobWrapper blob) {
    storeMetadataAttribute(blob, IS_FOLDER_METADATA_KEY, "true");
    removeMetadataAttribute(blob, OLD_IS_FOLDER_METADATA_KEY);
  }

  /* Store link attribute */
  private static void storeLinkAttribute(CloudBlobWrapper blob,
      String linkTarget) throws UnsupportedEncodingException {
    String encodedLinkTarget = linkTarget != null ? URLEncoder.encode(linkTarget, "UTF-8") : null;
    storeMetadataAttribute(blob,
        LINK_BACK_TO_UPLOAD_IN_PROGRESS_METADATA_KEY,
        encodedLinkTarget);
    removeMetadataAttribute(blob,
        OLD_LINK_BACK_TO_UPLOAD_IN_PROGRESS_METADATA_KEY);
  }

  /* Get link attribute value */
  private static String getLinkAttributeValue(CloudBlobWrapper blob)
      throws UnsupportedEncodingException {
    String encodedLinkTarget = getMetadataAttribute(blob,
        LINK_BACK_TO_UPLOAD_IN_PROGRESS_METADATA_KEY,
        OLD_LINK_BACK_TO_UPLOAD_IN_PROGRESS_METADATA_KEY);
    return encodedLinkTarget != null ? URLDecoder.decode(encodedLinkTarget, "UTF-8") : null;
  }

  /* Retrieve folder attribute */
  private static boolean retrieveFolderAttribute(CloudBlobWrapper blob) {
    HashMap<String, String> metadata = blob.getMetadata();
    return metadata != null && (metadata.containsKey(IS_FOLDER_METADATA_KEY) || metadata.containsKey(OLD_IS_FOLDER_METADATA_KEY));
  }

  /* Store version attribute */
  private static void storeVersionAttribute(CloudBlobContainerWrapper container) {
    HashMap<String, String> metadata = container.getMetadata();
    if (metadata == null) {
      metadata = new HashMap<>();
    }
    metadata.put(VERSION_METADATA_KEY, CURRENT_WASB_VERSION);
    metadata.remove(OLD_VERSION_METADATA_KEY);
    container.setMetadata(metadata);
  }

  /* Retrieve version attribute */
  private static String retrieveVersionAttribute(
      CloudBlobContainerWrapper container) {
    HashMap<String, String> metadata = container.getMetadata();
    if (metadata == null) {
      return null;
    }
    if (metadata.containsKey(VERSION_METADATA_KEY)) {
      return metadata.get(VERSION_METADATA_KEY);
    }
    if (metadata.containsKey(OLD_VERSION_METADATA_KEY)) {
      return metadata.get(OLD_VERSION_METADATA_KEY);
    }
    return null;
  }

  /* Store empty folder */
  @Override
  public void storeEmptyFolder(String key, PermissionStatus permissionStatus)
      throws AzureException {
    if (storageInteractionLayer == null) {
      throw new AssertionError(String.format(
          "Storage session expected for URI '%s' but does not exist.", sessionUri));
    }
    if (!isAuthenticatedAccess()) {
      throw new AzureException("Uploads to public accounts using anonymous access is prohibited.");
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

  /* Store empty link file */
  @Override
  public void storeEmptyLinkFile(String key, String tempBlobKey,
      PermissionStatus permissionStatus) throws AzureException {
    if (storageInteractionLayer == null) {
      throw new AssertionError(String.format(
          "Storage session expected for URI '%s' but does not exist.", sessionUri));
    }
    if (!isAuthenticatedAccess()) {
      throw new AzureException("Uploads to public accounts using anonymous access is prohibited.");
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

  /* Get link in file metadata */
  @Override
  public String getLinkInFileMetadata(String key) throws AzureException {
    if (storageInteractionLayer == null) {
      throw new AssertionError(String.format(
          "Storage session expected for URI '%s' but does not exist.", sessionUri));
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

  /* Check authenticated access */
  private boolean isAuthenticatedAccess() throws AzureException {
    return !isAnonymousCredentials;
  }

  /* List root blobs */
  private Iterable<ListBlobItem> listRootBlobs(boolean includeMetadata)
      throws StorageException, URISyntaxException {
    return rootDirectory.listBlobs(
        null, false,
        includeMetadata ? EnumSet.of(BlobListingDetails.METADATA) : EnumSet.noneOf(BlobListingDetails.class),
        null,
        getInstrumentedContext());
  }

  /* List root blobs with prefix */
  private Iterable<ListBlobItem> listRootBlobs(String aPrefix,
      boolean includeMetadata) throws StorageException, URISyntaxException {
    return rootDirectory.listBlobs(aPrefix,
        false,
        includeMetadata ? EnumSet.of(BlobListingDetails.METADATA) : EnumSet.noneOf(BlobListingDetails.class),
        null,
        getInstrumentedContext());
  }

  /* List root blobs with details */
  private Iterable<ListBlobItem> listRootBlobs(String aPrefix, boolean useFlatBlobListing,
      EnumSet<BlobListingDetails> listingDetails, BlobRequestOptions options,
      OperationContext opContext) throws StorageException, URISyntaxException {
    CloudBlobDirectoryWrapper directory = container.getDirectoryReference(aPrefix);
    return directory.listBlobs(
        null,
        useFlatBlobListing,
        listingDetails,
        options,
        opContext);
  }

  /* Get blob reference */
  private CloudBlobWrapper getBlobReference(String aKey)
      throws StorageException, URISyntaxException {
    CloudBlobWrapper blob;
    if (isPageBlobKey(aKey)) {
      blob = container.getPageBlobReference(aKey);
    } else {
      blob = container.getBlockBlobReference(aKey);
      blob.setStreamMinimumReadSizeInBytes(downloadBlockSizeBytes);
      blob.setWriteBlockSizeInBytes(uploadBlockSizeBytes);
    }
    return blob;
  }

  /* Normalize key from URI */
  private String normalizeKey(URI keyUri) {
    int parts = isStorageEmulator ? 4 : 3;
    return keyUri.getPath().split("/", parts)[parts - 1];
  }

  /* Normalize key from blob */
  private String normalizeKey(CloudBlobWrapper blob) {
    return normalizeKey(blob.getUri());
  }

  /* Normalize key from directory */
  private String normalizeKey(CloudBlobDirectoryWrapper directory) {
    String dirKey = normalizeKey(directory.getUri());
    if (dirKey.endsWith(PATH_DELIMITER)) {
      dirKey = dirKey.substring(0, dirKey.length() - 1);
    }
    return dirKey;
  }

  /* Get instrumented context */
  private OperationContext getInstrumentedContext() {
    return getInstrumentedContext(false);
  }

  /* Get instrumented context with optional binding */
  private OperationContext getInstrumentedContext(boolean bindConcurrentOOBIo) {
    OperationContext operationContext = new OperationContext();
    if (selfThrottlingEnabled) {
      SelfThrottlingIntercept.hook(operationContext, selfThrottlingReadFactor,
          selfThrottlingWriteFactor);
    }
    if (bandwidthGaugeUpdater != null) {
      ResponseReceivedMetricUpdater.hook(operationContext, instrumentation, bandwidthGaugeUpdater);
    }
    if (bindConcurrentOOBIo) {
      SendRequestIntercept.bind(storageInteractionLayer.getCredentials(),
          operationContext, true);
    }
    if (testHookOperationContext != null) {
      operationContext = testHookOperationContext.modifyOperationContext(operationContext);
    }
    ErrorMetricUpdater.hook(operationContext, instrumentation);
    return operationContext;
  }

  /* Retrieve metadata */
  @Override
  public FileMetadata retrieveMetadata(String key) throws IOException {
    if (storageInteractionLayer == null) {
      throw new AssertionError(String.format(
          "Storage session expected for URI '%s' but does not exist.", sessionUri));
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
      if (blob != null && blob.exists(getInstrumentedContext())) {
        blob.downloadAttributes(getInstrumentedContext());
        BlobProperties properties = blob.getProperties();
        if (retrieveFolderAttribute(blob)) {
          return new FileMetadata(key, properties.getLastModified().getTime(),
              getPermissionStatus(blob), BlobMaterialization.Explicit);
        } else {
          return new FileMetadata(
              key,
              getDataLength(blob, properties),
              properties.getLastModified().getTime(),
              getPermissionStatus(blob));
        }
      }
      Iterable<ListBlobItem> objects = listRootBlobs(
          key, true, EnumSet.of(BlobListingDetails.METADATA), null,
          getInstrumentedContext());
      for (ListBlobItem blobItem : objects) {
        if (blobItem instanceof CloudBlockBlobWrapper || blobItem instanceof CloudPageBlobWrapper) {
          CloudBlobWrapper b = (CloudBlobWrapper) blobItem;
          BlobProperties properties = b.getProperties();
          return new FileMetadata(key, properties.getLastModified().getTime(),
              getPermissionStatus(b), BlobMaterialization.Implicit);
        }
      }
      return null;
    } catch (Exception e) {
      throw new AzureException(e);
    }
  }

  /* Retrieve data input stream */
  @Override
  public DataInputStream retrieve(String key) throws AzureException, IOException {
    try {
      if (storageInteractionLayer == null) {
        throw new AssertionError(String.format(
            "Storage session expected for URI '%s' but does not exist.", sessionUri));
      }
      checkContainer(ContainerAccessType.PureRead);
      CloudBlobWrapper blob = getBlobReference(key);
      BufferedInputStream inBufStream = new BufferedInputStream(
          openInputStream(blob));
      return new DataInputStream(inBufStream);
    } catch (Exception e) {
      throw new AzureException(e);
    }
  }

  /* Retrieve data input stream with offset */
  @Override
  public DataInputStream retrieve(String key, long startByteOffset)
      throws AzureException, IOException {
    try {
      if (storageInteractionLayer == null) {
        throw new AssertionError(String.format(
            "Storage session expected for URI '%s' but does not exist.", sessionUri));
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

  /* List methods */
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

  /* Helper to find directory in list */
  private static FileMetadata getDirectoryInList(
      final Iterable<FileMetadata> list, String key) {
    for (FileMetadata current : list) {
      if (current.isDir() && current.getKey().equals(key)) {
        return current;
      }
    }
    return null;
  }

  /* Main list implementation */
  private PartialListing list(String prefix, String delimiter,
      final int maxListingCount, final int maxListingDepth, String priorLastKey)
      throws IOException {
    try {
      checkContainer(ContainerAccessType.PureRead);
      if (prefix.length() > 0 && !prefix.endsWith(PATH_DELIMITER)) {
        prefix += PATH_DELIMITER;
      }
      Iterable<ListBlobItem> objects;
      if (prefix.equals("/")) {
        objects = listRootBlobs(true);
      } else {
        objects = listRootBlobs(prefix, true);
      }
      ArrayList<FileMetadata> fileMetadata = new ArrayList<>();
      for (ListBlobItem blobItem : objects) {
        if (fileMetadata.size() >= maxListingCount && maxListingCount > 0) {
          break;
        }
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
          FileMetadata existing = getDirectoryInList(fileMetadata, blobKey);
          if (existing != null) {
            fileMetadata.remove(existing);
          }
          fileMetadata.add(metadata);
        } else if (blobItem instanceof CloudBlobDirectoryWrapper) {
          CloudBlobDirectoryWrapper directory = (CloudBlobDirectoryWrapper) blobItem;
          String dirKey = normalizeKey(directory);
          if (dirKey.endsWith(PATH_DELIMITER)) {
            dirKey = dirKey.substring(0, dirKey.length() - 1);
          }
          FileMetadata directoryMetadata = new FileMetadata(dirKey, 0,
              defaultPermissionNoBlobMetadata(), BlobMaterialization.Implicit);
          if (getDirectoryInList(fileMetadata, dirKey) == null) {
            fileMetadata.add(directoryMetadata);
          }
          buildUpList(directory, fileMetadata, maxListingCount,
              maxListingDepth - 1);
        }
      }
      priorLastKey = null;
      PartialListing listing = new PartialListing(priorLastKey,
          fileMetadata.toArray(new FileMetadata[0]),
          prefix.isEmpty() ? new String[0] : new String[] { prefix });
      return listing;
    } catch (Exception e) {
      throw new AzureException(e);
    }
  }

  /* Build up list recursively */
  private void buildUpList(CloudBlobDirectoryWrapper aCloudBlobDirectory,
      ArrayList<FileMetadata> aFileMetadataList, final int maxListingCount,
      final int maxListingDepth) throws Exception {
    AzureLinkedStack<Iterator<ListBlobItem>> dirIteratorStack =
        new AzureLinkedStack<>();
    Iterable<ListBlobItem> blobItems = aCloudBlobDirectory.listBlobs(null,
        false, EnumSet.of(BlobListingDetails.METADATA), null,
        getInstrumentedContext());
    Iterator<ListBlobItem> blobItemIterator = blobItems.iterator();
    if (maxListingDepth <= 0 || maxListingCount <= 0) {
      return;
    }
    final boolean isUnboundedDepth = maxListingDepth < 0;
    int listingDepth = 1;
    while (blobItemIterator != null
        && (maxListingCount <= 0 || aFileMetadataList.size() < maxListingCount)) {
      while (blobItemIterator.hasNext()) {
        if (maxListingCount > 0 && aFileMetadataList.size() >= maxListingCount) {
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
          if (existing != null) {
            aFileMetadataList.remove(existing);
          }
          aFileMetadataList.add(metadata);
        } else if (blobItem instanceof CloudBlobDirectoryWrapper) {
          CloudBlobDirectoryWrapper directory = (CloudBlobDirectoryWrapper) blobItem;
          if (isUnboundedDepth || maxListingDepth > listingDepth) {
            dirIteratorStack.push(blobItemIterator);
            listingDepth++;
            Iterable<ListBlobItem> subItems = directory.listBlobs(null, false,
                EnumSet.noneOf(BlobListingDetails.class), null,
                getInstrumentedContext());
            blobItemIterator = subItems.iterator();
          } else {
            String dirKey = normalizeKey(directory);
            if (getDirectoryInList(aFileMetadataList, dirKey) == null) {
              FileMetadata directoryMetadata = new FileMetadata(dirKey,
                  0,
                  defaultPermissionNoBlobMetadata(),
                  BlobMaterialization.Implicit);
              aFileMetadataList.add(directoryMetadata);
            }
          }
        }
      }
      if (dirIteratorStack.isEmpty()) {
        blobItemIterator = null;
      } else {
        blobItemIterator = dirIteratorStack.pop();
        listingDepth--;
        if (listingDepth < 0) {
          throw new AssertionError("Non-negative listing depth expected");
        }
      }
    }
  }

  /* Get data length */
  private long getDataLength(CloudBlobWrapper blob, BlobProperties properties)
      throws AzureException {
    if (blob instanceof CloudPageBlobWrapper) {
      try {
        return PageBlobInputStream.getPageBlobSize((CloudPageBlobWrapper) blob,
            getInstrumentedContext(isConcurrentOOBAppendAllowed()));
      } catch (Exception e) {
        throw new AzureException(
            "Unexpected exception getting page blob actual data size.", e);
      }
    }
    return properties.getLength();
  }

  /* Safe delete */
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

  /* Delete */
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

  /* Rename */
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
      if (storageInteractionLayer == null) {
        throw new AssertionError(String.format(
            "Storage session expected for URI '%s' but does not exist.", sessionUri));
      }
      checkContainer(ContainerAccessType.ReadThenWrite);
      CloudBlobWrapper srcBlob = getBlobReference(srcKey);
      if (!srcBlob.exists(getInstrumentedContext())) {
        throw new AzureException("Source blob " + srcKey + " does not exist.");
      }
      SelfRenewingLease lease = null;
      if (acquireLease) {
        lease = srcBlob.acquireLease();
      } else if (existingLease != null) {
        lease = existingLease;
      }
      CloudBlobWrapper dstBlob = getBlobReference(dstKey);
      URI srcUri = new URI(srcBlob.getUri().toASCIIString());
      try {
        dstBlob.startCopyFromBlob(srcUri, null, getInstrumentedContext());
      } catch (StorageException se) {
        if (se.getErrorCode().equals(StorageErrorCode.SERVER_BUSY.toString())) {
          int copyBlobMinBackoff = sessionConfiguration.getInt(
              KEY_COPYBLOB_MIN_BACKOFF_INTERVAL, DEFAULT_COPYBLOB_MIN_BACKOFF_INTERVAL);
          int copyBlobMaxBackoff = sessionConfiguration.getInt(
              KEY_COPYBLOB_MAX_BACKOFF_INTERVAL, DEFAULT_COPYBLOB_MAX_BACKOFF_INTERVAL);
          int copyBlobDeltaBackoff = sessionConfiguration.getInt(
              KEY_COPYBLOB_BACKOFF_INTERVAL, DEFAULT_COPYBLOB_BACKOFF_INTERVAL);
          int copyBlobMaxRetries = sessionConfiguration.getInt(
              KEY_COPYBLOB_MAX_IO_RETRIES, DEFAULT_COPYBLOB_MAX_RETRY_ATTEMPTS);
          BlobRequestOptions options = new BlobRequestOptions();
          options.setRetryPolicyFactory(new RetryExponentialRetry(
              copyBlobMinBackoff, copyBlobDeltaBackoff, copyBlobMaxBackoff,
              copyBlobMaxRetries));
          dstBlob.startCopyFromBlob(srcUri, options, getInstrumentedContext());
        } else {
          throw se;
        }
      }
      waitForCopyToComplete(dstBlob, getInstrumentedContext());
      safeDelete(srcBlob, lease);
    } catch (StorageException | URISyntaxException e) {
      throw new AzureException(e);
    }
  }

  /* Wait for copy to complete */
  private void waitForCopyToComplete(CloudBlobWrapper blob, OperationContext opContext) {
    boolean copyInProgress = true;
    while (copyInProgress) {
      try {
        blob.downloadAttributes(opContext);
      } catch (StorageException se) {
        // ignore
      }
      copyInProgress = (blob.getCopyState() != null && blob.getCopyState().getStatus() == CopyStatus.PENDING);
      if (copyInProgress) {
        try {
          Thread.sleep(1000);
        } catch (InterruptedException ie) {
          // ignore
        }
      }
    }
  }

  /* Change permission status */
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

  /* Purge */
  @Override
  public void purge(String prefix) throws IOException {
    try {
      if (storageInteractionLayer == null) {
        throw new AssertionError(String.format(
            "Storage session expected for URI '%s' but does not exist.", sessionUri));
      }
      if (checkContainer(ContainerAccessType.ReadThenWrite) == ContainerState.DoesntExist) {
        return;
      }
      Iterable<ListBlobItem> objects = listRootBlobs(prefix, false);
      for (ListBlobItem blobItem : objects) {
        ((CloudBlob) blobItem).delete(DeleteSnapshotsOption.NONE, null, null,
            getInstrumentedContext());
      }
    } catch (Exception e) {
      throw new AzureException(e);
    }
  }

  /* Acquire lease */
  @Override
  public SelfRenewingLease acquireLease(String key) throws AzureException {
    LOG.debug("acquiring lease on " + key);
    try {
      checkContainer(ContainerAccessType.ReadThenWrite);
      CloudBlobWrapper blob = getBlobReference(key);
      return blob.acquireLease();
    } catch (Exception e) {
      throw new AzureException(e);
    }
  }

  /* Update folder last modified time */
  @Override
  public void updateFolderLastModifiedTime(String key, Date lastModified,
      SelfRenewingLease folderLease) throws AzureException {
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
    Calendar lastModifiedCalendar = Calendar.getInstance(Utility.LOCALE_US);
    lastModifiedCalendar.setTimeZone(Utility.UTC_ZONE);
    Date lastModified = lastModifiedCalendar.getTime();
    updateFolderLastModifiedTime(key, lastModified, folderLease);
  }

  @Override
  public void dump() throws IOException {
  }

  @Override
  public void close() {
    if (bandwidthGaugeUpdater != null) {
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