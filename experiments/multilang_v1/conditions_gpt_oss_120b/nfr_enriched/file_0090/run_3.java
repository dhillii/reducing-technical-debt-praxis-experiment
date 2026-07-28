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
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an "AS IS" BASIS,
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
  
  static final String KEY_CHECK_BLOCK_MD5 = "fs.azure.check.block.md5";
  static final String KEY_STORE_BLOB_MD5 = "fs.azure.store.blob.md5";
  static final String DEFAULT_STORAGE_EMULATOR_ACCOUNT_NAME = "storageemulator";
  static final String STORAGE_EMULATOR_ACCOUNT_NAME_PROPERTY_NAME = "fs.azure.storage.emulator.account.name";

  public static final Log LOG = LogFactory.getLog(AzureNativeFileSystemStore.class);

  private StorageInterface storageInteractionLayer;
  private CloudBlobDirectoryWrapper rootDirectory;
  private CloudBlobContainerWrapper container;

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

  public static final String KEY_PAGE_BLOB_DIRECTORIES = "fs.azure.page.blob.dir";
  private Set<String> pageBlobDirs;
  public static final String KEY_ATOMIC_RENAME_DIRECTORIES = "fs.azure.atomic.rename.dir";
  private Set<String> atomicRenameDirs;

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
  private static final int DEFAULT_COPYBLOB_MIN_BACKOFF_INTERVAL = 3  * 1000;
  private static final int DEFAULT_COPYBLOB_MAX_BACKOFF_INTERVAL = 90 * 1000;
  private static final int DEFAULT_COPYBLOB_BACKOFF_INTERVAL = 30 * 1000;
  private static final int DEFAULT_COPYBLOB_MAX_RETRY_ATTEMPTS = 15;  
  private static final boolean DEFAULT_SELF_THROTTLE_ENABLE = true;
  private static final float DEFAULT_SELF_THROTTLE_READ_FACTOR = 1.0f;
  private static final float DEFAULT_SELF_THROTTLE_WRITE_FACTOR = 1.0f;
  private static final int STORAGE_CONNECTION_TIMEOUT_DEFAULT = 90;

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

  @VisibleForTesting 
  interface TestHookOperationContext {
    OperationContext modifyOperationContext(OperationContext original);
  }

  @VisibleForTesting
  void suppressRetryPolicy() {
    suppressRetryPolicy = true;
  }

  @VisibleForTesting 
  void addTestHookToOperationContext(TestHookOperationContext testHook) {
    this.testHookOperationContext = testHook;
  }

  private void suppressRetryPolicyInClientIfNeeded() {
    if (suppressRetryPolicy) {
      storageInteractionLayer.setRetryPolicyFactory(new RetryNoRetry());
    }
  }

  private static JSON createPermissionJsonSerializer() {
    JSON serializer = new JSON();
    serializer.addConvertor(PermissionStatus.class,
        new PermissionStatusJsonSerializer());
    return serializer;
  }

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
      return PermissionStatusJsonSerializer.fromJSONMap(object);
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

  @VisibleForTesting
  void setAzureStorageInteractionLayer(StorageInterface storageInteractionLayer) {
    this.storageInteractionLayer = storageInteractionLayer;
  }

  @VisibleForTesting
  public BandwidthGaugeUpdater getBandwidthGaugeUpdater() {
    return bandwidthGaugeUpdater;
  }

  private boolean isConcurrentOOBAppendAllowed() {
    return tolerateOobAppends;
  }

  @Override
  public void initialize(URI uri, Configuration conf,
      AzureFileSystemInstrumentation instrumentation)
      throws IllegalArgumentException, AzureException, IOException {
    validateInstrumentation(instrumentation);
    this.instrumentation = instrumentation;
    ensureStorageLayerInitialized();

    validateUri(uri);
    validateConfiguration(conf);
    maybeCreateBandwidthUpdater(conf);

    sessionUri = uri;
    sessionConfiguration = conf;

    createAzureStorageSession();

    pageBlobDirs = getDirectorySet(KEY_PAGE_BLOB_DIRECTORIES);
    LOG.debug("Page blob directories:  " + setToString(pageBlobDirs));

    atomicRenameDirs = getDirectorySet(KEY_ATOMIC_RENAME_DIRECTORIES);
    addHBaseRootToAtomicRenameDirs();
    LOG.debug("Atomic rename directories:  " + setToString(atomicRenameDirs));
  }

  private void validateInstrumentation(AzureFileSystemInstrumentation instr) {
    if (instr == null) {
      throw new IllegalArgumentException("Null instrumentation");
    }
  }

  private void ensureStorageLayerInitialized() {
    if (this.storageInteractionLayer == null) {
      this.storageInteractionLayer = new StorageInterfaceImpl();
    }
  }

  private void validateUri(URI uri) {
    if (uri == null) {
      throw new IllegalArgumentException("Cannot initialize WASB file system, URI is null");
    }
  }

  private void validateConfiguration(Configuration conf) {
    if (conf == null) {
      throw new IllegalArgumentException("Cannot initialize WASB file system, conf is null");
    }
  }

  private void maybeCreateBandwidthUpdater(Configuration conf) {
    if (!conf.getBoolean(NativeAzureFileSystem.SKIP_AZURE_METRICS_PROPERTY_NAME, false)) {
      this.bandwidthGaugeUpdater = new BandwidthGaugeUpdater(instrumentation);
    }
  }

  private void addHBaseRootToAtomicRenameDirs() {
    try {
      String hbaseRoot = verifyAndConvertToStandardFormat(
          sessionConfiguration.get("hbase.rootdir", "hbase"));
      atomicRenameDirs.add(hbaseRoot);
    } catch (URISyntaxException e) {
      LOG.warn("Unable to initialize HBase root as an atomic rename directory.");
    }
  }

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

  private String getAccountFromAuthority(URI uri) throws URISyntaxException {
    String authority = uri.getRawAuthority();
    if (authority == null) {
      throw new URISyntaxException(uri.toString(), "Expected URI with a valid authority");
    }
    if (!authority.contains(WASB_AUTHORITY_DELIMITER)) {
      return authority;
    }
    String[] parts = authority.split(WASB_AUTHORITY_DELIMITER, 2);
    if (parts.length < 2 || "".equals(parts[0])) {
      throw new IllegalArgumentException(String.format(
          "URI '%s' has a malformed WASB authority, expected container name. "
              + "Authority takes the form wasb://[<container name>@]<account name>",
          uri.toString()));
    }
    return parts[1];
  }

  private String getContainerFromAuthority(URI uri) throws URISyntaxException {
    String authority = uri.getRawAuthority();
    if (authority == null) {
      throw new URISyntaxException(uri.toString(), "Expected URI with a valid authority");
    }
    if (!authority.contains(WASB_AUTHORITY_DELIMITER)) {
      return AZURE_ROOT_CONTAINER;
    }
    String[] parts = authority.split(WASB_AUTHORITY_DELIMITER, 2);
    if (parts.length < 2 || "".equals(parts[0])) {
      throw new IllegalArgumentException(String.format(
          "URI '%s' has a malformed WASB authority, expected container name."
              + "Authority takes the form wasb://[<container name>@]<account name>",
          uri.toString()));
    }
    return parts[0];
  }

  private String getHTTPScheme() {
    String scheme = sessionUri.getScheme();
    if (scheme != null && (scheme.equalsIgnoreCase("asvs") || scheme.equalsIgnoreCase("wasbs"))) {
      return HTTPS_SCHEME;
    }
    return HTTP_SCHEME;
  }

  private void configureAzureStorageSession() throws AzureException {
    ensureSessionUriPresent();
    ensureStorageLayerPresent();

    tolerateOobAppends = sessionConfiguration.getBoolean(
        KEY_READ_TOLERATE_CONCURRENT_APPEND,
        DEFAULT_READ_TOLERATE_CONCURRENT_APPEND);

    downloadBlockSizeBytes = sessionConfiguration.getInt(
        KEY_STREAM_MIN_READ_SIZE, DEFAULT_DOWNLOAD_BLOCK_SIZE);
    uploadBlockSizeBytes = sessionConfiguration.getInt(
        KEY_WRITE_BLOCK_SIZE, DEFAULT_UPLOAD_BLOCK_SIZE);

    configureTimeout();
    configureConcurrency();
    configureRetryPolicy();
    configureSelfThrottling();

    if (LOG.isDebugEnabled()) {
      LOG.debug(String.format(
          "AzureNativeFileSystemStore init. Settings=%d,%b,%d,{%d,%d,%d,%d},{%b,%f,%f}",
          concurrentWrites, tolerateOobAppends,
          (sessionConfiguration.getInt(KEY_STORAGE_CONNECTION_TIMEOUT, 0) > 0
              ? sessionConfiguration.getInt(KEY_STORAGE_CONNECTION_TIMEOUT, 0)
              : STORAGE_CONNECTION_TIMEOUT_DEFAULT),
          minBackoff, deltaBackoff, maxBackoff, maxRetries,
          selfThrottlingEnabled, selfThrottlingReadFactor, selfThrottlingWriteFactor));
    }
  }

  private void ensureSessionUriPresent() {
    if (sessionUri == null) {
      throw new AssertionError("Expected a non-null session URI when configuring storage session");
    }
  }

  private void ensureStorageLayerPresent() {
    if (storageInteractionLayer == null) {
      throw new AssertionError(String.format(
          "Cannot configure storage session for URI '%s' if storage session has not been established.",
          sessionUri.toString()));
    }
  }

  private void configureTimeout() {
    int timeout = sessionConfiguration.getInt(KEY_STORAGE_CONNECTION_TIMEOUT, 0);
    if (timeout > 0) {
      storageInteractionLayer.setTimeoutInMs(timeout * 1000);
    }
  }

  private void configureConcurrency() {
    int cpuCores = 2 * Runtime.getRuntime().availableProcessors();
    concurrentWrites = sessionConfiguration.getInt(
        KEY_CONCURRENT_CONNECTION_VALUE_OUT,
        Math.min(cpuCores, DEFAULT_CONCURRENT_WRITES));
  }

  private void configureRetryPolicy() {
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
  }

  private void configureSelfThrottling() {
    selfThrottlingEnabled = sessionConfiguration.getBoolean(
        KEY_SELF_THROTTLE_ENABLE, DEFAULT_SELF_THROTTLE_ENABLE);
    selfThrottlingReadFactor = sessionConfiguration.getFloat(
        KEY_SELF_THROTTLE_READ_FACTOR, DEFAULT_SELF_THROTTLE_READ_FACTOR);
    selfThrottlingWriteFactor = sessionConfiguration.getFloat(
        KEY_SELF_THROTTLE_WRITE_FACTOR, DEFAULT_SELF_THROTTLE_WRITE_FACTOR);
  }

  private void connectUsingAnonymousCredentials(final URI uri)
      throws StorageException, IOException, URISyntaxException {
    String accountName = getAccountFromAuthority(uri);
    URI storageUri = new URI(getHTTPScheme() + ":" + PATH_DELIMITER + PATH_DELIMITER + accountName);
    String containerName = getContainerFromAuthority(uri);
    storageInteractionLayer.createBlobClient(storageUri);
    suppressRetryPolicyInClientIfNeeded();
    container = storageInteractionLayer.getContainerReference(containerName);
    rootDirectory = container.getDirectoryReference("");
    verifyAnonymousContainerAccess(containerName, accountName);
    isAnonymousCredentials = true;
    configureAzureStorageSession();
  }

  private void verifyAnonymousContainerAccess(String containerName, String accountName) throws AzureException, StorageException {
    if (!container.exists(getInstrumentedContext())) {
      throw new AzureException("Container " + containerName + " in account "
          + accountName + " not found, and we can't create it using anonymous credentials.");
    }
  }

  private void connectUsingCredentials(String accountName,
      StorageCredentials credentials, String containerName)
      throws URISyntaxException, StorageException, AzureException {
    if (isStorageEmulatorAccount(accountName)) {
      isStorageEmulator = true;
      CloudStorageAccount account = CloudStorageAccount.getDevelopmentStorageAccount();
      storageInteractionLayer.createBlobClient(account);
    } else {
      URI endpoint = new URI(getHTTPScheme() + "://" + accountName);
      storageInteractionLayer.createBlobClient(endpoint, credentials);
    }
    suppressRetryPolicyInClientIfNeeded();
    container = storageInteractionLayer.getContainerReference(containerName);
    rootDirectory = container.getDirectoryReference("");
    canCreateOrModifyContainer = credentials instanceof StorageCredentialsAccountAndKey;
    configureAzureStorageSession();
  }

  private void connectUsingConnectionStringCredentials(
      final String accountName, final String containerName,
      final String accountKey) throws InvalidKeyException, StorageException,
      IOException, URISyntaxException {
    String rawAccountName = accountName.split("\\.")[0];
    StorageCredentials credentials = new StorageCredentialsAccountAndKey(
        rawAccountName, accountKey);
    connectUsingCredentials(accountName, credentials, containerName);
  }

  private void connectUsingSASCredentials(final String accountName,
      final String containerName, final String sas) throws InvalidKeyException,
      StorageException, IOException, URISyntaxException {
    StorageCredentials credentials = new StorageCredentialsSharedAccessSignature(sas);
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
    String keyProviderClass = conf.get(KEY_ACCOUNT_KEYPROVIDER_PREFIX + accountName);
    KeyProvider keyProvider = (keyProviderClass == null) ? new SimpleKeyProvider()
        : instantiateKeyProvider(keyProviderClass);
    return keyProvider.getStorageAccountKey(accountName, conf);
  }

  private static KeyProvider instantiateKeyProvider(String className) throws KeyProviderException {
    try {
      Class<?> clazz = Class.forName(className);
      Object instance = clazz.newInstance();
      if (!(instance instanceof KeyProvider)) {
        throw new KeyProviderException(className + " is not a valid KeyProvider class.");
      }
      return (KeyProvider) instance;
    } catch (Exception e) {
      throw new KeyProviderException("Unable to load key provider class.", e);
    }
  }

  private void createAzureStorageSession() throws AzureException, IOException {
    ensureSessionInitialized();
    try {
      String accountName = getAccountFromAuthority(sessionUri);
      String containerName = getContainerFromAuthority(sessionUri);
      instrumentation.setAccountName(accountName);
      instrumentation.setContainerName(containerName);

      if (isStorageEmulatorAccount(accountName)) {
        connectUsingCredentials(accountName, null, containerName);
        return;
      }

      String sasProp = sessionConfiguration.get(KEY_ACCOUNT_SAS_PREFIX + containerName + "." + accountName);
      if (sasProp != null) {
        connectUsingSASCredentials(accountName, containerName, sasProp);
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

  private void ensureSessionInitialized() {
    if (sessionUri == null || sessionConfiguration == null) {
      throw new AzureException("Filesystem object not initialized properly."
          + "Unable to start session with Azure Storage server.");
    }
  }

  private enum ContainerState {
    Unknown, DoesntExist, ExistsNoVersion, ExistsAtWrongVersion, ExistsAtRightVersion
  }

  private enum ContainerAccessType {
    PureRead, PureWrite, ReadThenWrite
  }

  private static String trim(String s, String toTrim) {
    return StringUtils.removeEnd(StringUtils.removeStart(s, toTrim), toTrim);
  }

  private String verifyAndConvertToStandardFormat(String rawDir) throws URISyntaxException {
    URI uri = new URI(rawDir);
    if (uri.getAuthority() == null ||
        uri.getAuthority().equalsIgnoreCase(sessionUri.getAuthority())) {
      return trim(uri.getPath(), "/");
    }
    return null;
  }

  private Set<String> getDirectorySet(final String configVar) throws AzureException {
    String[] rawDirs = sessionConfiguration.getStrings(configVar, new String[0]);
    Set<String> dirSet = new HashSet<String>();
    for (String dir : rawDirs) {
      try {
        String normalized = verifyAndConvertToStandardFormat(dir);
        if (normalized != null) {
          dirSet.add(normalized);
        }
      } catch (URISyntaxException e) {
        throw new AzureException(String.format(
            "The directory %s specified in the configuration entry %s is not a valid URI.",
            dir, configVar));
      }
    }
    return dirSet;
  }

  public boolean isPageBlobKey(String key) {
    return isKeyForDirectorySet(key, pageBlobDirs);
  }

  @Override
  public boolean isAtomicRenameKey(String key) {
    return isKeyForDirectorySet(key, atomicRenameDirs);
  }

  public boolean isKeyForDirectorySet(String key, Set<String> dirSet) {
    String defaultFS = FileSystem.getDefaultUri(sessionConfiguration).toString();
    for (String dir : dirSet) {
      if (dir.isEmpty() || key.startsWith(dir + "/")) {
        return true;
      }
      try {
        URI dirUri = new URI(dir);
        if (dirUri.getAuthority() == null) {
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

  private ContainerState checkContainer(ContainerAccessType accessType)
      throws StorageException, AzureException {
    synchronized (containerStateLock) {
      if (isOkContainerState(accessType)) {
        return currentKnownContainerState;
      }
      if (currentKnownContainerState == ContainerState.ExistsAtWrongVersion) {
        String version = retrieveVersionAttribute(container);
        throw wrongVersionException(version);
      }

      downloadContainerAttributes();

      if (currentKnownContainerState == ContainerState.DoesntExist) {
        if (needToCreateContainer(accessType)) {
          storeVersionAttribute(container);
          container.create(getInstrumentedContext());
          currentKnownContainerState = ContainerState.ExistsAtRightVersion;
        }
      } else {
        evaluateContainerVersion(accessType);
      }
      return currentKnownContainerState;
    }
  }

  private void downloadContainerAttributes() throws StorageException {
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
  }

  private void evaluateContainerVersion(ContainerAccessType accessType) throws StorageException {
    String version = retrieveVersionAttribute(container);
    if (version != null) {
      if (version.equals(FIRST_WASB_VERSION)) {
        if (needToStampVersion(accessType)) {
          storeVersionAttribute(container);
          container.uploadMetadata(getInstrumentedContext());
        }
        currentKnownContainerState = ContainerState.ExistsAtRightVersion;
      } else if (!version.equals(CURRENT_WASB_VERSION)) {
        currentKnownContainerState = ContainerState.ExistsAtWrongVersion;
        throw wrongVersionException(version);
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
        throw new AssertionError("Unknown container state");
    }
  }

  private boolean getUseTransactionalContentMD5() {
    return sessionConfiguration.getBoolean(KEY_CHECK_BLOCK_MD5, true);
  }

  private BlobRequestOptions getUploadOptions() {
    BlobRequestOptions options = new BlobRequestOptions();
    options.setStoreBlobContentMD5(sessionConfiguration.getBoolean(KEY_STORE_BLOB_MD5, false));
    options.setUseTransactionalContentMD5(getUseTransactionalContentMD5());
    options.setConcurrentRequestCount(concurrentWrites);
    options.setRetryPolicyFactory(new RetryExponentialRetry(minBackoff, deltaBackoff, maxBackoff, maxRetries));
    return options;
  }

  private BlobRequestOptions getDownloadOptions() {
    BlobRequestOptions options = new BlobRequestOptions();
    options.setRetryPolicyFactory(new RetryExponentialRetry(minBackoff, deltaBackoff, maxBackoff, maxRetries));
    options.setUseTransactionalContentMD5(getUseTransactionalContentMD5());
    return options;
  }

  @Override
  public DataOutputStream storefile(String key, PermissionStatus permissionStatus)
      throws AzureException {
    try {
      ensureSessionExists();
      ensureAuthenticatedAccess();
      checkContainer(ContainerAccessType.PureWrite);
      ensureNotRootContainerWrite();

      CloudBlobWrapper blob = getBlobReference(key);
      storePermissionStatus(blob, permissionStatus);
      OutputStream out = openOutputStream(blob);
      return new SyncableDataOutputStream(out);
    } catch (Exception e) {
      throw new AzureException(e);
    }
  }

  private void ensureSessionExists() {
    if (storageInteractionLayer == null) {
      throw new AzureException(String.format(
          "Storage session expected for URI '%s' but does not exist.", sessionUri));
    }
  }

  private void ensureAuthenticatedAccess() throws AzureException {
    if (!isAuthenticatedAccess()) {
      throw new AzureException(new IOException(
          "Uploads to public accounts using anonymous access is prohibited."));
    }
  }

  private void ensureNotRootContainerWrite() throws AzureException {
    if (AZURE_ROOT_CONTAINER.equals(getContainerFromAuthority(sessionUri))) {
      throw new AzureException(String.format(
          "Writes to '%s' container for URI '%s' are prohibited, only updates on non-root containers permitted.",
          AZURE_ROOT_CONTAINER, sessionUri.toString()));
    }
  }

  private OutputStream openOutputStream(final CloudBlobWrapper blob)
      throws StorageException {
    if (blob instanceof CloudPageBlobWrapperImpl) {
      return new PageBlobOutputStream((CloudPageBlobWrapper) blob,
          getInstrumentedContext(), sessionConfiguration);
    }
    return ((CloudBlockBlobWrapper) blob).openOutputStream(getUploadOptions(),
        getInstrumentedContext());
  }

  private InputStream openInputStream(CloudBlobWrapper blob)
      throws StorageException, IOException {
    if (blob instanceof CloudBlockBlobWrapper) {
      return blob.openInputStream(getDownloadOptions(),
          getInstrumentedContext(isConcurrentOOBAppendAllowed()));
    }
    return new PageBlobInputStream((CloudPageBlobWrapper) blob,
        getInstrumentedContext(isConcurrentOOBAppendAllowed()));
  }

  private static PermissionStatus defaultPermissionNoBlobMetadata() {
    return new PermissionStatus("", "", FsPermission.getDefault());
  }

  private static void storeMetadataAttribute(CloudBlobWrapper blob,
      String key, String value) {
    HashMap<String, String> metadata = blob.getMetadata();
    if (metadata == null) {
      metadata = new HashMap<String, String>();
    }
    metadata.put(key, value);
    blob.setMetadata(metadata);
  }

  private static String getMetadataAttribute(CloudBlobWrapper blob,
      String... keys) {
    HashMap<String, String> metadata = blob.getMetadata();
    if (metadata == null) {
      return null;
    }
    for (String k : keys) {
      if (metadata.containsKey(k)) {
        return metadata.get(k);
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
    String value = getMetadataAttribute(blob, PERMISSION_METADATA_KEY, OLD_PERMISSION_METADATA_KEY);
    if (value != null) {
      return PermissionStatusJsonSerializer.fromJSONString(value);
    }
    return defaultPermissionNoBlobMetadata();
  }

  private static void storeFolderAttribute(CloudBlobWrapper blob) {
    storeMetadataAttribute(blob, IS_FOLDER_METADATA_KEY, "true");
    removeMetadataAttribute(blob, OLD_IS_FOLDER_METADATA_KEY);
  }

  private static void storeLinkAttribute(CloudBlobWrapper blob,
      String linkTarget) throws UnsupportedEncodingException {
    String encoded = (linkTarget != null) ? URLEncoder.encode(linkTarget, "UTF-8") : null;
    storeMetadataAttribute(blob, LINK_BACK_TO_UPLOAD_IN_PROGRESS_METADATA_KEY, encoded);
    removeMetadataAttribute(blob, OLD_LINK_BACK_TO_UPLOAD_IN_PROGRESS_METADATA_KEY);
  }

  private static String getLinkAttributeValue(CloudBlobWrapper blob)
      throws UnsupportedEncodingException {
    String encoded = getMetadataAttribute(blob,
        LINK_BACK_TO_UPLOAD_IN_PROGRESS_METADATA_KEY,
        OLD_LINK_BACK_TO_UPLOAD_IN_PROGRESS_METADATA_KEY);
    return (encoded != null) ? URLDecoder.decode(encoded, "UTF-8") : null;
  }

  private static boolean retrieveFolderAttribute(CloudBlobWrapper blob) {
    HashMap<String, String> metadata = blob.getMetadata();
    return metadata != null && (metadata.containsKey(IS_FOLDER_METADATA_KEY)
        || metadata.containsKey(OLD_IS_FOLDER_METADATA_KEY));
  }

  private static void storeVersionAttribute(CloudBlobContainerWrapper container) {
    HashMap<String, String> metadata = container.getMetadata();
    if (metadata == null) {
      metadata = new HashMap<String, String>();
    }
    metadata.put(VERSION_METADATA_KEY, CURRENT_WASB_VERSION);
    metadata.remove(OLD_VERSION_METADATA_KEY);
    container.setMetadata(metadata);
  }

  private static String retrieveVersionAttribute(
      CloudBlobContainerWrapper container) {
    HashMap<String, String> metadata = container.getMetadata();
    if (metadata == null) {
      return null;
    }
    if (metadata.containsKey(VERSION_METADATA_KEY)) {
      return metadata.get(VERSION_METADATA_KEY);
    }
    return metadata.get(OLD_VERSION_METADATA_KEY);
  }

  @Override
  public void storeEmptyFolder(String key, PermissionStatus permissionStatus)
      throws AzureException {
    ensureSessionExists();
    ensureAuthenticatedAccess();
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
    ensureSessionExists();
    ensureAuthenticatedAccess();
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
    ensureSessionExists();
    try {
      checkContainer(ContainerAccessType.PureRead);
      CloudBlobWrapper blob = getBlobReference(key);
      blob.downloadAttributes(getInstrumentedContext());
      return getLinkAttributeValue(blob);
    } catch (Exception e) {
      throw new AzureException(e);
    }
  }

  private boolean isAuthenticatedAccess() {
    return !isAnonymousCredentials;
  }

  private Iterable<ListBlobItem> listRootBlobs(boolean includeMetadata)
      throws StorageException, URISyntaxException {
    return rootDirectory.listBlobs(null, false,
        includeMetadata ? EnumSet.of(BlobListingDetails.METADATA)
            : EnumSet.noneOf(BlobListingDetails.class),
        null, getInstrumentedContext());
  }

  private Iterable<ListBlobItem> listRootBlobs(String prefix,
      boolean includeMetadata) throws StorageException, URISyntaxException {
    return rootDirectory.listBlobs(prefix, false,
        includeMetadata ? EnumSet.of(BlobListingDetails.METADATA)
            : EnumSet.noneOf(BlobListingDetails.class),
        null, getInstrumentedContext());
  }

  private Iterable<ListBlobItem> listRootBlobs(String prefix, boolean flat,
      EnumSet<BlobListingDetails> details, BlobRequestOptions options,
      OperationContext ctx) throws StorageException, URISyntaxException {
    CloudBlobDirectoryWrapper dir = container.getDirectoryReference(prefix);
    return dir.listBlobs(null, flat, details, options, ctx);
  }

  private CloudBlobWrapper getBlobReference(String key)
      throws StorageException, URISyntaxException {
    CloudBlobWrapper blob = isPageBlobKey(key)
        ? container.getPageBlobReference(key)
        : container.getBlockBlobReference(key);
    blob.setStreamMinimumReadSizeInBytes(downloadBlockSizeBytes);
    blob.setWriteBlockSizeInBytes(uploadBlockSizeBytes);
    return blob;
  }

  private String normalizeKey(URI keyUri) {
    int parts = isStorageEmulator ? 4 : 3;
    return keyUri.getPath().split("/", parts)[parts - 1];
  }

  private String normalizeKey(CloudBlobWrapper blob) {
    return normalizeKey(blob.getUri());
  }

  private String normalizeKey(CloudBlobDirectoryWrapper directory) {
    String key = normalizeKey(directory.getUri());
    return key.endsWith(PATH_DELIMITER) ? key.substring(0, key.length() - 1) : key;
  }

  private OperationContext getInstrumentedContext() {
    return getInstrumentedContext(false);
  }

  private OperationContext getInstrumentedContext(boolean bindConcurrentOOBIo) {
    OperationContext ctx = new OperationContext();
    if (selfThrottlingEnabled) {
      SelfThrottlingIntercept.hook(ctx, selfThrottlingReadFactor, selfThrottlingWriteFactor);
    }
    if (bandwidthGaugeUpdater != null) {
      ResponseReceivedMetricUpdater.hook(ctx, instrumentation, bandwidthGaugeUpdater);
    }
    if (bindConcurrentOOBIo) {
      SendRequestIntercept.bind(storageInteractionLayer.getCredentials(),
          ctx, true);
    }
    if (testHookOperationContext != null) {
      ctx = testHookOperationContext.modifyOperationContext(ctx);
    }
    ErrorMetricUpdater.hook(ctx, instrumentation);
    return ctx;
  }

  @Override
  public FileMetadata retrieveMetadata(String key) throws IOException {
    ensureSessionExists();
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
      if (blob.exists(getInstrumentedContext())) {
        blob.downloadAttributes(getInstrumentedContext());
        BlobProperties props = blob.getProperties();
        if (retrieveFolderAttribute(blob)) {
          return new FileMetadata(key, props.getLastModified().getTime(),
              getPermissionStatus(blob), BlobMaterialization.Explicit);
        }
        return new FileMetadata(key, getDataLength(blob, props),
            props.getLastModified().getTime(), getPermissionStatus(blob));
      }
      return findImplicitDirectoryMetadata(key);
    } catch (Exception e) {
      throw new AzureException(e);
    }
  }

  private FileMetadata findImplicitDirectoryMetadata(String key)
      throws StorageException, URISyntaxException {
    Iterable<ListBlobItem> items = listRootBlobs(key, true,
        EnumSet.of(BlobListingDetails.METADATA), null, getInstrumentedContext());
    for (ListBlobItem item : items) {
      if (item instanceof CloudBlockBlobWrapper || item instanceof CloudPageBlobWrapper) {
        CloudBlobWrapper blob = (CloudBlobWrapper) item;
        BlobProperties props = blob.getProperties();
        return new FileMetadata(key, props.getLastModified().getTime(),
            getPermissionStatus(blob), BlobMaterialization.Implicit);
      }
    }
    return null;
  }

  @Override
  public DataInputStream retrieve(String key) throws AzureException, IOException {
    ensureSessionExists();
    try {
      checkContainer(ContainerAccessType.PureRead);
      CloudBlobWrapper blob = getBlobReference(key);
      BufferedInputStream buf = new BufferedInputStream(openInputStream(blob));
      return new DataInputStream(buf);
    } catch (Exception e) {
      throw new AzureException(e);
    }
  }

  @Override
  public DataInputStream retrieve(String key, long startByteOffset)
      throws AzureException, IOException {
    ensureSessionExists();
    try {
      checkContainer(ContainerAccessType.PureRead);
      CloudBlobWrapper blob = getBlobReference(key);
      InputStream in = blob.openInputStream(getDownloadOptions(),
          getInstrumentedContext(isConcurrentOOBAppendAllowed()));
      DataInputStream dataIn = new DataInputStream(in);
      dataIn.skip(startByteOffset);
      return dataIn;
    } catch (Exception e) {
      throw new AzureException(e);
    }
  }

  @Override
  public PartialListing list(String prefix, final int maxListingCount,
      final int maxListingDepth) throws IOException {
    return list(prefix, PATH_DELIMITER, maxListingCount, maxListingDepth, null);
  }

  @Override
  public PartialListing list(String prefix, final int maxListingCount,
      final int maxListingDepth, String priorLastKey) throws IOException {
    return list(prefix, PATH_DELIMITER, maxListingCount, maxListingDepth, priorLastKey);
  }

  @Override
  public PartialListing listAll(String prefix, final int maxListingCount,
      final int maxListingDepth, String priorLastKey) throws IOException {
    return list(prefix, null, maxListingCount, maxListingDepth, priorLastKey);
  }

  private static FileMetadata getDirectoryInList(
      final Iterable<FileMetadata> list, String key) {
    for (FileMetadata fm : list) {
      if (fm.isDir() && fm.getKey().equals(key)) {
        return fm;
      }
    }
    return null;
  }

  private PartialListing list(String prefix, String delimiter,
      final int maxListingCount, final int maxListingDepth, String priorLastKey)
      throws IOException {
    try {
      checkContainer(ContainerAccessType.PureRead);
      String normalizedPrefix = normalizePrefix(prefix);
      Iterable<ListBlobItem> items = fetchRootItems(normalizedPrefix);
      ArrayList<FileMetadata> metadataList = new ArrayList<FileMetadata>();
      for (ListBlobItem item : items) {
        if (metadataList.size() >= maxListingCount && maxListingCount > 0) {
          break;
        }
        processListItem(item, metadataList);
      }
      priorLastKey = null;
      return new PartialListing(priorLastKey,
          metadataList.toArray(new FileMetadata[0]),
          metadataList.isEmpty() ? new String[0] : new String[] { prefix });
    } catch (Exception e) {
      throw new AzureException(e);
    }
  }

  private String normalizePrefix(String prefix) {
    if (prefix.length() > 0 && !prefix.endsWith(PATH_DELIMITER)) {
      return prefix + PATH_DELIMITER;
    }
    return prefix;
  }

  private Iterable<ListBlobItem> fetchRootItems(String prefix) throws StorageException, URISyntaxException {
    if ("/".equals(prefix)) {
      return listRootBlobs(true);
    }
    return listRootBlobs(prefix, true);
  }

  private void processListItem(ListBlobItem item, ArrayList<FileMetadata> list)
      throws StorageException, URISyntaxException {
    if (item instanceof CloudBlockBlobWrapper || item instanceof CloudPageBlobWrapper) {
      CloudBlobWrapper blob = (CloudBlobWrapper) item;
      BlobProperties props = blob.getProperties();
      String key = normalizeKey(blob);
      FileMetadata meta = retrieveFolderAttribute(blob)
          ? new FileMetadata(key, props.getLastModified().getTime(),
              getPermissionStatus(blob), BlobMaterialization.Explicit)
          : new FileMetadata(key, getDataLength(blob, props),
              props.getLastModified().getTime(), getPermissionStatus(blob));
      replaceIfDirectoryExists(list, key, meta);
    } else if (item instanceof CloudBlobDirectoryWrapper) {
      CloudBlobDirectoryWrapper dir = (CloudBlobDirectoryWrapper) item;
      String dirKey = normalizeKey(dir);
      if (dirKey.endsWith(PATH_DELIMITER)) {
        dirKey = dirKey.substring(0, dirKey.length() - 1);
      }
      if (getDirectoryInList(list, dirKey) == null) {
        list.add(new FileMetadata(dirKey, 0,
            defaultPermissionNoBlobMetadata(), BlobMaterialization.Implicit));
      }
      buildUpList(dir, list, Integer.MAX_VALUE, Integer.MAX_VALUE);
    }
  }

  private void replaceIfDirectoryExists(ArrayList<FileMetadata> list,
      String key, FileMetadata newMeta) {
    FileMetadata existing = getDirectoryInList(list, key);
    if (existing != null) {
      list.remove(existing);
    }
    list.add(newMeta);
  }

  private void buildUpList(CloudBlobDirectoryWrapper dir,
      ArrayList<FileMetadata> list, final int maxListingCount,
      final int maxListingDepth) throws Exception {
    AzureLinkedStack<Iterator<ListBlobItem>> stack = new AzureLinkedStack<Iterator<ListBlobItem>>();
    Iterator<ListBlobItem> iterator = dir.listBlobs(null, false,
        EnumSet.of(BlobListingDetails.METADATA), null,
        getInstrumentedContext()).iterator();

    if (maxListingDepth == 0 || maxListingCount == 0) {
      return;
    }
    boolean unbounded = maxListingDepth < 0;
    int depth = 1;

    while (iterator != null && (maxListingCount <= 0 || list.size() < maxListingCount)) {
      while (iterator.hasNext()) {
        if (maxListingCount > 0 && list.size() >= maxListingCount) {
          break;
        }
        ListBlobItem item = iterator.next();
        if (item instanceof CloudBlockBlobWrapper || item instanceof CloudPageBlobWrapper) {
          CloudBlobWrapper blob = (CloudBlobWrapper) item;
          BlobProperties props = blob.getProperties();
          String key = normalizeKey(blob);
          FileMetadata meta = retrieveFolderAttribute(blob)
              ? new FileMetadata(key, props.getLastModified().getTime(),
                  getPermissionStatus(blob), BlobMaterialization.Explicit)
              : new FileMetadata(key, getDataLength(blob, props),
                  props.getLastModified().getTime(), getPermissionStatus(blob));
          replaceIfDirectoryExists(list, key, meta);
        } else if (item instanceof CloudBlobDirectoryWrapper) {
          CloudBlobDirectoryWrapper subDir = (CloudBlobDirectoryWrapper) item;
          if (unbounded || maxListingDepth > depth) {
            stack.push(iterator);
            depth++;
            iterator = subDir.listBlobs(null, false,
                EnumSet.noneOf(BlobListingDetails.class), null,
                getInstrumentedContext()).iterator();
          } else {
            String dirKey = normalizeKey(subDir);
            if (getDirectoryInList(list, dirKey) == null) {
              list.add(new FileMetadata(dirKey, 0,
                  defaultPermissionNoBlobMetadata(), BlobMaterialization.Implicit));
            }
          }
        }
      }
      if (stack.isEmpty()) {
        iterator = null;
      } else {
        iterator = stack.pop();
        depth--;
        if (depth < 0) {
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
            getInstrumentedContext(isConcurrentOOBAppendAllowed()));
      } catch (Exception e) {
        throw new AzureException("Unexpected exception getting page blob actual data size.", e);
      }
    }
    return properties.getLength();
  }

  private void safeDelete(CloudBlobWrapper blob, SelfRenewingLease lease) throws StorageException {
    OperationContext ctx = getInstrumentedContext();
    try {
      blob.delete(ctx, lease);
    } catch (StorageException e) {
      if (isBlobNotFoundAfterRetry(e, ctx)) {
        LOG.debug("Swallowing delete exception on retry: " + e.getMessage());
        return;
      }
      throw e;
    } finally {
      if (lease != null) {
        lease.free();
      }
    }
  }

  private boolean isBlobNotFoundAfterRetry(StorageException e, OperationContext ctx) {
    return e.getErrorCode() != null && e.getErrorCode().equals("BlobNotFound")
        && ctx.getRequestResults().size() > 1
        && ctx.getRequestResults().get(0).getException() != null;
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
      ensureSessionExists();
      checkContainer(ContainerAccessType.ReadThenWrite);
      CloudBlobWrapper srcBlob = getBlobReference(srcKey);
      if (!srcBlob.exists(getInstrumentedContext())) {
        throw new AzureException("Source blob " + srcKey + " does not exist.");
      }
      SelfRenewingLease lease = acquireLease ? srcBlob.acquireLease() : existingLease;
      CloudBlobWrapper dstBlob = getBlobReference(dstKey);
      URI srcUri = new URI(srcBlob.getUri().toASCIIString());
      tryCopyBlob(srcUri, dstBlob);
      waitForCopyToComplete(dstBlob, getInstrumentedContext());
      safeDelete(srcBlob, lease);
    } catch (Exception e) {
      throw new AzureException(e);
    }
  }

  private void tryCopyBlob(URI srcUri, CloudBlobWrapper dstBlob) throws StorageException, URISyntaxException {
    try {
      dstBlob.startCopyFromBlob(srcUri, null, getInstrumentedContext());
    } catch (StorageException se) {
      if (se.getErrorCode().equals(StorageErrorCode.SERVER_BUSY.toString())) {
        BlobRequestOptions options = createCopyBlobRetryOptions();
        dstBlob.startCopyFromBlob(srcUri, options, getInstrumentedContext());
      } else {
        throw se;
      }
    }
  }

  private BlobRequestOptions createCopyBlobRetryOptions() {
    int min = sessionConfiguration.getInt(KEY_COPYBLOB_MIN_BACKOFF_INTERVAL,
        DEFAULT_COPYBLOB_MIN_BACKOFF_INTERVAL);
    int max = sessionConfiguration.getInt(KEY_COPYBLOB_MAX_BACKOFF_INTERVAL,
        DEFAULT_COPYBLOB_MAX_BACKOFF_INTERVAL);
    int delta = sessionConfiguration.getInt(KEY_COPYBLOB_BACKOFF_INTERVAL,
        DEFAULT_COPYBLOB_BACKOFF_INTERVAL);
    int retries = sessionConfiguration.getInt(KEY_COPYBLOB_MAX_IO_RETRIES,
        DEFAULT_COPYBLOB_MAX_RETRY_ATTEMPTS);
    BlobRequestOptions options = new BlobRequestOptions();
    options.setRetryPolicyFactory(new RetryExponentialRetry(min, delta, max, retries));
    return options;
  }

  private void waitForCopyToComplete(CloudBlobWrapper blob, OperationContext ctx) {
    while (true) {
      try {
        blob.downloadAttributes(ctx);
      } catch (StorageException ignored) {
      }
      if (blob.getCopyState() == null || blob.getCopyState().getStatus() != CopyStatus.PENDING) {
        break;
      }
      try {
        Thread.sleep(1000);
      } catch (InterruptedException ignored) {
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
      ensureSessionExists();
      if (checkContainer(ContainerAccessType.ReadThenWrite) == ContainerState.DoesntExist) {
        return;
      }
      Iterable<ListBlobItem> items = listRootBlobs(prefix, false);
      for (ListBlobItem item : items) {
        ((CloudBlob) item).delete(DeleteSnapshotsOption.NONE, null, null,
            getInstrumentedContext());
      }
    } catch (Exception e) {
      throw new AzureException(e);
    }
  }

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
    Calendar cal = Calendar.getInstance(Utility.LOCALE_US);
    cal.setTimeZone(Utility.UTC_ZONE);
    updateFolderLastModifiedTime(key, cal.getTime(), folderLease);
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