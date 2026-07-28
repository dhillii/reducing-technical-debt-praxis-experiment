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

  // Constants local to this class.
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
  private static final String VERSION_METADATA_KEY = "hdi_version";
  private static final String OLD_VERSION_METADATA_KEY = "asv_version";
  private static final String FIRST_WASB_VERSION = "2013-01-01";
  private static final String CURRENT_WASB_VERSION = "2013-09-01";
  private static final String LINK_BACK_TO_UPLOAD_IN_PROGRESS_METADATA_KEY = "hdi_tmpupload";
  private static final String OLD_LINK_BACK_TO_UPLOAD_IN_PROGRESS_METADATA_KEY = "asv_tmpupload";

  private static final String HTTP_SCHEME = "http";
  private static final String HTTPS_SCHEME = "https";
  private static final String WASB_AUTHORITY_DELIMITER = "@";
  private static final String AZURE_ROOT_CONTAINER = "$root";

  private static final int DEFAULT_CONCURRENT_WRITES = 8;
  private static final boolean DEFAULT_READ_TOLERATE_CONCURRENT_APPEND = false;
  private static final int DEFAULT_DOWNLOAD_BLOCK_SIZE = 4 * 1024 * 1024;
  private static final int DEFAULT_UPLOAD_BLOCK_SIZE = 4 * 1024 * 1024;
  private static final int DEFAULT_MIN_BACKOFF_INTERVAL = 1 * 1000; // 1s
  private static final int DEFAULT_MAX_BACKOFF_INTERVAL = 30 * 1000; // 30s
  private static final int DEFAULT_BACKOFF_INTERVAL = 1 * 1000; // 1s
  private static final int DEFAULT_MAX_RETRY_ATTEMPTS = 15;
  private static final int DEFAULT_COPYBLOB_MIN_BACKOFF_INTERVAL = 3 * 1000;
  private static final int DEFAULT_COPYBLOB_MAX_BACKOFF_INTERVAL = 90 * 1000;
  private static final int DEFAULT_COPYBLOB_BACKOFF_INTERVAL = 30 * 1000;
  private static final int DEFAULT_COPYBLOB_MAX_RETRY_ATTEMPTS = 15;
  private static final boolean DEFAULT_SELF_THROTTLE_ENABLE = true;
  private static final float DEFAULT_SELF_THROTTLE_READ_FACTOR = 1.0f;
  private static final float DEFAULT_SELF_THROTTLE_WRITE_FACTOR = 1.0f;
  private static final int STORAGE_CONNECTION_TIMEOUT_DEFAULT = 90;

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

  private int minBackoff; // the minimum back-off interval (ms) between retries.
  private int maxBackoff; // the maximum back-off interval (ms) between retries.
  private int deltaBackoff; // the back-off interval (ms) between retries.
  private int maxRetries; // the maximum number of retry attempts.

  private boolean selfThrottlingEnabled;
  private float selfThrottlingReadFactor;
  private float selfThrottlingWriteFactor;

  private TestHookOperationContext testHookOperationContext = null;

  private boolean isStorageEmulator = false;

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

  private static class PermissionStatusJsonSerializer implements JSON.Convertor {
    private static final String OWNER_TAG = "owner";
    private static final String GROUP_TAG = "group";
    private static final String PERMISSIONS_TAG = "permissions";

    @Override
    public void toJSON(Object obj, JSON.Output out) {
      PermissionStatus permissionStatus = (PermissionStatus) obj;
      out.add(OWNER_TAG, permissionStatus.getUserName());
      out.add(GROUP_TAG, permissionStatus.getGroupName() == null ? "" : permissionStatus.getGroupName());
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
      return new PermissionStatus((String) object.get(OWNER_TAG), (String) object.get(GROUP_TAG), FsPermission.valueOf("-" + (String) object.get(PERMISSIONS_TAG)));
    }
  }

  private static JSON createPermissionJsonSerializer() {
    JSON serializer = new JSON();
    serializer.addConvertor(PermissionStatus.class, new PermissionStatusJsonSerializer());
    return serializer;
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
  public void initialize(URI uri, Configuration conf, AzureFileSystemInstrumentation instrumentation) throws IllegalArgumentException, AzureException, IOException {
    if (null == instrumentation) {
      throw new IllegalArgumentException("Null instrumentation");
    }
    this.instrumentation = instrumentation;

    if (null == this.storageInteractionLayer) {
      this.storageInteractionLayer = new StorageInterfaceImpl();
    }

    if (null == uri) {
      throw new IllegalArgumentException("Cannot initialize WASB file system, URI is null");
    }

    if (null == conf) {
      throw new IllegalArgumentException("Cannot initialize WASB file system, conf is null");
    }

    if (!conf.getBoolean(NativeAzureFileSystem.SKIP_AZURE_METRICS_PROPERTY_NAME, false)) {
      this.bandwidthGaugeUpdater = new BandwidthGaugeUpdater(instrumentation);
    }

    sessionUri = uri;
    sessionConfiguration = conf;

    createAzureStorageSession();
  }

  private void createAzureStorageSession() throws AzureException, IOException {
    if (null == sessionUri || null == sessionConfiguration) {
      throw new AzureException("Filesystem object not initialized properly. Unable to start session with Azure Storage server.");
    }

    try {
      String accountName = getAccountFromAuthority(sessionUri);
      instrumentation.setAccountName(accountName);
      String containerName = getContainerFromAuthority(sessionUri);
      instrumentation.setContainerName(containerName);

      if (isStorageEmulatorAccount(accountName)) {
        connectUsingCredentials(accountName, null, containerName);
      } else {
        String propertyValue = sessionConfiguration.get(KEY_ACCOUNT_SAS_PREFIX + containerName + "." + accountName);
        if (propertyValue != null) {
          connectUsingSASCredentials(accountName, containerName, propertyValue);
        } else {
          propertyValue = getAccountKeyFromConfiguration(accountName, sessionConfiguration);
          if (propertyValue != null) {
            connectUsingConnectionStringCredentials(getAccountFromAuthority(sessionUri), getContainerFromAuthority(sessionUri), propertyValue);
          } else {
            connectUsingAnonymousCredentials(sessionUri);
          }
        }
      }
    } catch (Exception e) {
      throw new AzureException(e);
    }
  }

  private void connectUsingAnonymousCredentials(final URI uri) throws StorageException, IOException, URISyntaxException {
    String accountName = getAccountFromAuthority(uri);
    URI storageUri = new URI(getHTTPScheme() + ":" + PATH_DELIMITER + PATH_DELIMITER + accountName);
    storageInteractionLayer.createBlobClient(storageUri);
    suppressRetryPolicyInClientIfNeeded();

    String containerName = getContainerFromAuthority(uri);
    container = storageInteractionLayer.getContainerReference(containerName);
    rootDirectory = container.getDirectoryReference("");

    try {
      if (!container.exists(getInstrumentedContext())) {
        throw new AzureException("Container " + containerName + " in account " + accountName + " not found, and we can't create it using anonymous credentials.");
      }
    } catch (StorageException ex) {
      throw new AzureException("Unable to access container " + containerName + " in account " + accountName + " using anonymous credentials, and no credentials found for them in the configuration.", ex);
    }

    isAnonymousCredentials = true;
    configureAzureStorageSession();
  }

  private void connectUsingCredentials(String accountName, StorageCredentials credentials, String containerName) throws URISyntaxException, StorageException, AzureException {
    if (isStorageEmulatorAccount(accountName)) {
      isStorageEmulator = true;
      CloudStorageAccount account = CloudStorageAccount.getDevelopmentStorageAccount();
      storageInteractionLayer.createBlobClient(account);
    } else {
      URI blobEndPoint = new URI(getHTTPScheme() + "://" + accountName);
      storageInteractionLayer.createBlobClient(blobEndPoint, credentials);
    }
    suppressRetryPolicyInClientIfNeeded();

    container = storageInteractionLayer.getContainerReference(containerName);
    rootDirectory = container.getDirectoryReference("");

    canCreateOrModifyContainer = credentials instanceof StorageCredentialsAccountAndKey;

    configureAzureStorageSession();
  }

  private void connectUsingConnectionStringCredentials(final String accountName, final String containerName, final String accountKey) throws InvalidKeyException, StorageException, IOException, URISyntaxException {
    String rawAccountName = accountName.split("\\.")[0];
    StorageCredentials credentials = new StorageCredentialsAccountAndKey(rawAccountName, accountKey);
    connectUsingCredentials(accountName, credentials, containerName);
  }

  private void connectUsingSASCredentials(final String accountName, final String containerName, final String sas) throws InvalidKeyException, StorageException, IOException, URISyntaxException {
    StorageCredentials credentials = new StorageCredentialsSharedAccessSignature(sas);
    connectingUsingSAS = true;
    connectUsingCredentials(accountName, credentials, containerName);
  }

  private boolean isStorageEmulatorAccount(final String accountName) {
    return accountName.equalsIgnoreCase(sessionConfiguration.get(STORAGE_EMULATOR_ACCOUNT_NAME_PROPERTY_NAME, DEFAULT_STORAGE_EMULATOR_ACCOUNT_NAME));
  }

  private String getAccountFromAuthority(URI uri) throws URISyntaxException {
    String authority = uri.getRawAuthority();
    if (null == authority) {
      throw new URISyntaxException(uri.toString(), "Expected URI with a valid authority");
    }

    if (!authority.contains(WASB_AUTHORITY_DELIMITER)) {
      return authority;
    }

    String[] authorityParts = authority.split(WASB_AUTHORITY_DELIMITER, 2);
    if (authorityParts.length < 2 || "".equals(authorityParts[0])) {
      throw new IllegalArgumentException("URI '" + uri.toString() + "' has a malformed WASB authority, expected container name. Authority takes the form wasb://[<container name>@]<account name>");
    }

    return authorityParts[1];
  }

  private String getContainerFromAuthority(URI uri) throws URISyntaxException {
    String authority = uri.getRawAuthority();
    if (null == authority) {
      throw new URISyntaxException(uri.toString(), "Expected URI with a valid authority");
    }

    if (!authority.contains(WASB_AUTHORITY_DELIMITER)) {
      return AZURE_ROOT_CONTAINER;
    }

    String[] authorityParts = authority.split(WASB_AUTHORITY_DELIMITER, 2);
    if (authorityParts.length < 2 || "".equals(authorityParts[0])) {
      throw new IllegalArgumentException("URI '" + uri.toString() + "' has a malformed WASB authority, expected container name. Authority takes the form wasb://[<container name>@]<account name>");
    }

    return authorityParts[0];
  }

  private String getHTTPScheme() {
    String sessionScheme = sessionUri.getScheme();
    if (sessionScheme != null && (sessionScheme.equalsIgnoreCase("asvs") || sessionScheme.equalsIgnoreCase("wasbs"))) {
      return HTTPS_SCHEME;
    } else {
      return HTTP_SCHEME;
    }
  }

  private void configureAzureStorageSession() throws AzureException {
    tolerateOobAppends = sessionConfiguration.getBoolean(KEY_READ_TOLERATE_CONCURRENT_APPEND, DEFAULT_READ_TOLERATE_CONCURRENT_APPEND);

    downloadBlockSizeBytes = sessionConfiguration.getInt(KEY_STREAM_MIN_READ_SIZE, DEFAULT_DOWNLOAD_BLOCK_SIZE);
    uploadBlockSizeBytes = sessionConfiguration.getInt(KEY_WRITE_BLOCK_SIZE, DEFAULT_UPLOAD_BLOCK_SIZE);

    int storageConnectionTimeout = sessionConfiguration.getInt(KEY_STORAGE_CONNECTION_TIMEOUT, 0);
    if (0 < storageConnectionTimeout) {
      storageInteractionLayer.setTimeoutInMs(storageConnectionTimeout * 1000);
    }

    concurrentWrites = sessionConfiguration.getInt(KEY_CONCURRENT_CONNECTION_VALUE_OUT, Math.min(2 * Runtime.getRuntime().availableProcessors(), DEFAULT_CONCURRENT_WRITES));

    minBackoff = sessionConfiguration.getInt(KEY_MIN_BACKOFF_INTERVAL, DEFAULT_MIN_BACKOFF_INTERVAL);
    maxBackoff = sessionConfiguration.getInt(KEY_MAX_BACKOFF_INTERVAL, DEFAULT_MAX_BACKOFF_INTERVAL);
    deltaBackoff = sessionConfiguration.getInt(KEY_BACKOFF_INTERVAL, DEFAULT_BACKOFF_INTERVAL);
    maxRetries = sessionConfiguration.getInt(KEY_MAX_IO_RETRIES, DEFAULT_MAX_RETRY_ATTEMPTS);

    storageInteractionLayer.setRetryPolicyFactory(new RetryExponentialRetry(minBackoff, deltaBackoff, maxBackoff, maxRetries));

    selfThrottlingEnabled = sessionConfiguration.getBoolean(KEY_SELF_THROTTLE_ENABLE, DEFAULT_SELF_THROTTLE_ENABLE);
    selfThrottlingReadFactor = sessionConfiguration.getFloat(KEY_SELF_THROTTLE_READ_FACTOR, DEFAULT_SELF_THROTTLE_READ_FACTOR);
    selfThrottlingWriteFactor = sessionConfiguration.getFloat(KEY_SELF_THROTTLE_WRITE_FACTOR, DEFAULT_SELF_THROTTLE_WRITE_FACTOR);
  }

  private void suppressRetryPolicyInClientIfNeeded() {
    if (suppressRetryPolicy) {
      storageInteractionLayer.setRetryPolicyFactory(new RetryNoRetry());
    }
  }

  @Override
  public DataOutputStream storefile(String key, PermissionStatus permissionStatus) throws AzureException {
    try {
      if (null == storageInteractionLayer) {
        throw new AssertionError("Storage session expected for URI '" + sessionUri + "' but does not exist.");
      }

      if (!isAuthenticatedAccess()) {
        throw new AzureException("Uploads to public accounts using anonymous access is prohibited.");
      }

      checkContainer(ContainerAccessType.PureWrite);

      if (AZURE_ROOT_CONTAINER.equals(getContainerFromAuthority(sessionUri))) {
        throw new AzureException("Writes to '" + AZURE_ROOT_CONTAINER + "' container for URI '" + sessionUri.toString() + "' are prohibited, only updates on non-root containers permitted.");
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

  private OutputStream openOutputStream(final CloudBlobWrapper blob) throws StorageException {
    if (blob instanceof CloudPageBlobWrapperImpl) {
      return new PageBlobOutputStream((CloudPageBlobWrapper) blob, getInstrumentedContext(), sessionConfiguration);
    } else {
      return ((CloudBlockBlobWrapper) blob).openOutputStream(getUploadOptions(), getInstrumentedContext());
    }
  }

  private InputStream openInputStream(CloudBlobWrapper blob) throws StorageException, IOException {
    if (blob instanceof CloudBlockBlobWrapper) {
      return blob.openInputStream(getDownloadOptions(), getInstrumentedContext(isConcurrentOOBAppendAllowed()));
    } else {
      return new PageBlobInputStream((CloudPageBlobWrapper) blob, getInstrumentedContext(isConcurrentOOBAppendAllowed()));
    }
  }

  private static PermissionStatus defaultPermissionNoBlobMetadata() {
    return new PermissionStatus("", "", FsPermission.getDefault());
  }

  private static void storeMetadataAttribute(CloudBlobWrapper blob, String key, String value) {
    HashMap<String, String> metadata = blob.getMetadata();
    if (null == metadata) {
      metadata = new HashMap<String, String>();
    }
    metadata.put(key, value);
    blob.setMetadata(metadata);
  }

  private static String getMetadataAttribute(CloudBlobWrapper blob, String... keyAlternatives) {
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

  private static void removeMetadataAttribute(CloudBlobWrapper blob, String key) {
    HashMap<String, String> metadata = blob.getMetadata();
    if (metadata != null) {
      metadata.remove(key);
      blob.setMetadata(metadata);
    }
  }

  private static void storePermissionStatus(CloudBlobWrapper blob, PermissionStatus permissionStatus) {
    storeMetadataAttribute(blob, PERMISSION_METADATA_KEY, PERMISSION_JSON_SERIALIZER.toJSON(permissionStatus));
    removeMetadataAttribute(blob, OLD_PERMISSION_METADATA_KEY);
  }

  private PermissionStatus getPermissionStatus(CloudBlobWrapper blob) {
    String permissionMetadataValue = getMetadataAttribute(blob, PERMISSION_METADATA_KEY, OLD_PERMISSION_METADATA_KEY);
    if (permissionMetadataValue != null) {
      return PermissionStatusJsonSerializer.fromJSONString(permissionMetadataValue);
    } else {
      return defaultPermissionNoBlobMetadata();
    }
  }

  private static void storeFolderAttribute(CloudBlobWrapper blob) {
    storeMetadataAttribute(blob, IS_FOLDER_METADATA_KEY, "true");
    removeMetadataAttribute(blob, OLD_IS_FOLDER_METADATA_KEY);
  }

  private static void storeLinkAttribute(CloudBlobWrapper blob, String linkTarget) throws UnsupportedEncodingException {
    String encodedLinkTarget = null;
    if (linkTarget != null) {
      encodedLinkTarget = URLEncoder.encode(linkTarget, "UTF-8");
    }
    storeMetadataAttribute(blob, LINK_BACK_TO_UPLOAD_IN_PROGRESS_METADATA_KEY, encodedLinkTarget);
    removeMetadataAttribute(blob, OLD_LINK_BACK_TO_UPLOAD_IN_PROGRESS_METADATA_KEY);
  }

  private static String getLinkAttributeValue(CloudBlobWrapper blob) throws UnsupportedEncodingException {
    String encodedLinkTarget = getMetadataAttribute(blob, LINK_BACK_TO_UPLOAD_IN_PROGRESS_METADATA_KEY, OLD_LINK_BACK_TO_UPLOAD_IN_PROGRESS_METADATA_KEY);
    String linkTarget = null;
    if (encodedLinkTarget != null) {
      linkTarget = URLDecoder.decode(encodedLinkTarget, "UTF-8");
    }
    return linkTarget;
  }

  private static boolean retrieveFolderAttribute(CloudBlobWrapper blob) {
    HashMap<String, String> metadata = blob.getMetadata();
    return null != metadata && (metadata.containsKey(IS_FOLDER_METADATA_KEY) || metadata.containsKey(OLD_IS_FOLDER_METADATA_KEY));
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

  private static String retrieveVersionAttribute(CloudBlobContainerWrapper container) {
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
  public boolean isAtomicRenameKey(String key) {
    return isKeyForDirectorySet(key, atomicRenameDirs);
  }

  private boolean isKeyForDirectorySet(String key, Set<String> dirSet) {
    String defaultFS = FileSystem.getDefaultUri(sessionConfiguration).toString();
    for (String dir : dirSet) {
      if (dir.isEmpty() || key.startsWith(dir + "/")) {
        return true;
      }

      try {
        URI uriPageBlobDir = new URI(dir);
        if (null == uriPageBlobDir.getAuthority()) {
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

  private ContainerState checkContainer(ContainerAccessType accessType) throws StorageException, AzureException {
    synchronized (containerStateLock) {
      if (isOkContainerState(accessType)) {
        return currentKnownContainerState;
      }
      if (currentKnownContainerState == ContainerState.ExistsAtWrongVersion) {
        String containerVersion = retrieveVersionAttribute(container);
        throw wrongVersionException(containerVersion);
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
    return new AzureException("The container " + container.getName() + " is at an unsupported version: " + containerVersion + ". Current supported version: " + FIRST_WASB_VERSION);
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

  private OperationContext getInstrumentedContext() {
    return getInstrumentedContext(false);
  }

  private OperationContext getInstrumentedContext(boolean bindConcurrentOOBIo) {
    OperationContext operationContext = new OperationContext();

    if (selfThrottlingEnabled) {
      SelfThrottlingIntercept.hook(operationContext, selfThrottlingReadFactor, selfThrottlingWriteFactor);
    }

    if (bandwidthGaugeUpdater != null) {
      ResponseReceivedMetricUpdater.hook(operationContext, instrumentation, bandwidthGaugeUpdater);
    }

    if (bindConcurrentOOBIo) {
      SendRequestIntercept.bind(storageInteractionLayer.getCredentials(), operationContext, true);
    }

    if (testHookOperationContext != null) {
      operationContext = testHookOperationContext.modifyOperationContext(operationContext);
    }

    ErrorMetricUpdater.hook(operationContext, instrumentation);

    return operationContext;
  }

  @Override
  public FileMetadata retrieveMetadata(String key) throws IOException {
    try {
      if (null == storageInteractionLayer) {
        throw new AssertionError("Storage session expected for URI '" + sessionUri + "' but does not exist.");
      }

      if (checkContainer(ContainerAccessType.PureRead) == ContainerState.DoesntExist) {
        return null;
      }

      CloudBlobWrapper blob = getBlobReference(key);
      blob.downloadAttributes(getInstrumentedContext());

      if (retrieveFolderAttribute(blob)) {
        return new FileMetadata(key, blob.getProperties().getLastModified().getTime(), getPermissionStatus(blob), BlobMaterialization.Explicit);
      } else {
        return new FileMetadata(key, getDataLength(blob, blob.getProperties()), blob.getProperties().getLastModified().getTime(), getPermissionStatus(blob));
      }
    } catch (Exception e) {
      throw new AzureException(e);
    }
  }

  @Override
  public DataInputStream retrieve(String key) throws AzureException, IOException {
    try {
      if (null == storageInteractionLayer) {
        throw new AssertionError("Storage session expected for URI '" + sessionUri + "' but does not exist.");
      }

      checkContainer(ContainerAccessType.PureRead);

      CloudBlobWrapper blob = getBlobReference(key);
      BufferedInputStream inBufStream = new BufferedInputStream(openInputStream(blob));
      DataInputStream inDataStream = new DataInputStream(inBufStream);
      return inDataStream;
    } catch (Exception e) {
      throw new AzureException(e);
    }
  }

  @Override
  public DataInputStream retrieve(String key, long startByteOffset) throws AzureException, IOException {
    try {
      if (null == storageInteractionLayer) {
        throw new AssertionError("Storage session expected for URI '" + sessionUri + "' but does not exist.");
      }

      checkContainer(ContainerAccessType.PureRead);

      CloudBlobWrapper blob = getBlobReference(key);
      InputStream in = blob.openInputStream(getDownloadOptions(), getInstrumentedContext(isConcurrentOOBAppendAllowed()));
      DataInputStream inDataStream = new DataInputStream(in);
      inDataStream.skip(startByteOffset);
      return inDataStream;
    } catch (Exception e) {
      throw new AzureException(e);
    }
  }

  @Override
  public PartialListing list(String prefix, final int maxListingCount, final int maxListingDepth) throws IOException {
    return list(prefix, maxListingCount, maxListingDepth, null);
  }

  @Override
  public PartialListing list(String prefix, final int maxListingCount, final int maxListingDepth, String priorLastKey) throws IOException {
    return list(prefix, PATH_DELIMITER, maxListingCount, maxListingDepth, priorLastKey);
  }

  @Override
  public PartialListing listAll(String prefix, final int maxListingCount, final int maxListingDepth, String priorLastKey) throws IOException {
    return list(prefix, null, maxListingCount, maxListingDepth, priorLastKey);
  }

  private PartialListing list(String prefix, String delimiter, final int maxListingCount, final int maxListingDepth, String priorLastKey) throws IOException {
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
        if (0 < maxListingCount && fileMetadata.size() >= maxListingCount) {
          break;
        }

        if (blobItem instanceof CloudBlockBlobWrapper || blobItem instanceof CloudPageBlobWrapper) {
          String blobKey = null;
          CloudBlobWrapper blob = (CloudBlobWrapper) blobItem;
          BlobProperties properties = blob.getProperties();

          blobKey = normalizeKey(blob);

          FileMetadata metadata;
          if (retrieveFolderAttribute(blob)) {
            metadata = new FileMetadata(blobKey, properties.getLastModified().getTime(), getPermissionStatus(blob), BlobMaterialization.Explicit);
          } else {
            metadata = new FileMetadata(blobKey, getDataLength(blob, properties), properties.getLastModified().getTime(), getPermissionStatus(blob));
          }

          FileMetadata existing = getDirectoryInList(fileMetadata, blobKey);
          if (existing != null) {
            fileMetadata.remove(existing);
          }
          fileMetadata.add(metadata);
        } else if (blobItem instanceof CloudBlobDirectoryWrapper) {
          CloudBlobDirectoryWrapper directory = (CloudBlobDirectoryWrapper) blobItem;
          String dirKey = normalizeKey(directory);

          if (getDirectoryInList(fileMetadata, dirKey) == null) {
            FileMetadata directoryMetadata = new FileMetadata(dirKey, 0, defaultPermissionNoBlobMetadata(), BlobMaterialization.Implicit);
            fileMetadata.add(directoryMetadata);
          }

          buildUpList(directory, fileMetadata, maxListingCount, maxListingDepth - 1);
        }
      }
      priorLastKey = null;
      PartialListing listing = new PartialListing(priorLastKey, fileMetadata.toArray(new FileMetadata[] {}), 0 == fileMetadata.size() ? new String[] {} : new String[] { prefix });
      return listing;
    } catch (Exception e) {
      throw new AzureException(e);
    }
  }

  private void buildUpList(CloudBlobDirectoryWrapper aCloudBlobDirectory, ArrayList<FileMetadata> aFileMetadataList, final int maxListingCount, final int maxListingDepth) throws Exception {
    AzureLinkedStack<Iterator<ListBlobItem>> dirIteratorStack = new AzureLinkedStack<Iterator<ListBlobItem>>();

    Iterable<ListBlobItem> blobItems = aCloudBlobDirectory.listBlobs(null, false, EnumSet.noneOf(BlobListingDetails.class), null, getInstrumentedContext());
    Iterator<ListBlobItem> blobItemIterator = blobItems.iterator();

    if (0 == maxListingDepth || 0 == maxListingCount) {
      return;
    }

    int listingDepth = 1;

    while (null != blobItemIterator && (maxListingCount <= 0 || aFileMetadataList.size() < maxListingCount)) {
      while (blobItemIterator.hasNext()) {
        if (0 < maxListingCount && aFileMetadataList.size() >= maxListingCount) {
          break;
        }

        ListBlobItem blobItem = blobItemIterator.next();

        if (blobItem instanceof CloudBlockBlobWrapper || blobItem instanceof CloudPageBlobWrapper) {
          String blobKey = null;
          CloudBlobWrapper blob = (CloudBlobWrapper) blobItem;
          BlobProperties properties = blob.getProperties();

          blobKey = normalizeKey(blob);

          FileMetadata metadata;
          if (retrieveFolderAttribute(blob)) {
            metadata = new FileMetadata(blobKey, properties.getLastModified().getTime(), getPermissionStatus(blob), BlobMaterialization.Explicit);
          } else {
            metadata = new FileMetadata(blobKey, getDataLength(blob, properties), properties.getLastModified().getTime(), getPermissionStatus(blob));
          }

          FileMetadata existing = getDirectoryInList(aFileMetadataList, blobKey);
          if (existing != null) {
            aFileMetadataList.remove(existing);
          }
          aFileMetadataList.add(metadata);
        } else if (blobItem instanceof CloudBlobDirectoryWrapper) {
          CloudBlobDirectoryWrapper directory = (CloudBlobDirectoryWrapper) blobItem;

          if (maxListingDepth > listingDepth) {
            dirIteratorStack.push(blobItemIterator);
            ++listingDepth;

            blobItems = directory.listBlobs(null, false, EnumSet.noneOf(BlobListingDetails.class), null, getInstrumentedContext());
            blobItemIterator = blobItems.iterator();
          } else {
            String dirKey = normalizeKey(directory);

            if (getDirectoryInList(aFileMetadataList, dirKey) == null) {
              FileMetadata directoryMetadata = new FileMetadata(dirKey, 0, defaultPermissionNoBlobMetadata(), BlobMaterialization.Implicit);
              aFileMetadataList.add(directoryMetadata);
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

  private long getDataLength(CloudBlobWrapper blob, BlobProperties properties) throws AzureException {
    if (blob instanceof CloudPageBlobWrapper) {
      try {
        return PageBlobInputStream.getPageBlobSize((CloudPageBlobWrapper) blob, getInstrumentedContext(isConcurrentOOBAppendAllowed()));
      } catch (Exception e) {
        throw new AzureException("Unexpected exception getting page blob actual data size.", e);
      }
    }
    return properties.getLength();
  }

  private void safeDelete(CloudBlobWrapper blob, SelfRenewingLease lease) throws StorageException {
    OperationContext operationContext = getInstrumentedContext();
    try {
      blob.delete(operationContext, lease);
    } catch (StorageException e) {
      if (e.getErrorCode() != null && e.getErrorCode().equals("BlobNotFound") && operationContext.getRequestResults().size() > 1 && operationContext.getRequestResults().get(0).getException() != null) {
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
  public void rename(String srcKey, String dstKey, boolean acquireLease, SelfRenewingLease existingLease) throws IOException {
    if (acquireLease && existingLease != null) {
      throw new IOException("Cannot acquire new lease if one already exists.");
    }

    try {
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
      dstBlob.startCopyFromBlob(srcUri, null, getInstrumentedContext());
      waitForCopyToComplete(dstBlob, getInstrumentedContext());
      safeDelete(srcBlob, lease);
    } catch (StorageException e) {
      throw new AzureException(e);
    } catch (URISyntaxException e) {
      throw new AzureException(e);
    }
  }

  private void waitForCopyToComplete(CloudBlobWrapper blob, OperationContext opContext) {
    boolean copyInProgress = true;
    while (copyInProgress) {
      try {
        blob.downloadAttributes(opContext);
      } catch (StorageException se) {
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

  @Override
  public void changePermissionStatus(String key, PermissionStatus newPermission) throws AzureException {
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
      if (checkContainer(ContainerAccessType.ReadThenWrite) == ContainerState.DoesntExist) {
        return;
      }
      Iterable<ListBlobItem> objects = listRootBlobs(prefix, false);
      for (ListBlobItem blobItem : objects) {
        ((CloudBlob) blobItem).delete(DeleteSnapshotsOption.NONE, null, null, getInstrumentedContext());
      }
    } catch (Exception e) {
      throw new AzureException(e);
    }
  }

  @Override
  public SelfRenewingLease acquireLease(String key) throws AzureException {
    try {
      checkContainer(ContainerAccessType.ReadThenWrite);
      CloudBlobWrapper blob = getBlobReference(key);
      return blob.acquireLease();
    } catch (Exception e) {
      throw new AzureException(e);
    }
  }

  @Override
  public void updateFolderLastModifiedTime(String key, Date lastModified, SelfRenewingLease folderLease) throws AzureException {
    try {
      checkContainer(ContainerAccessType.ReadThenWrite);
      CloudBlobWrapper blob = getBlobReference(key);
      blob.uploadProperties(getInstrumentedContext(), folderLease);
    } catch (Exception e) {
      throw new AzureException(e);
    }
  }

  @Override
  public void updateFolderLastModifiedTime(String key, SelfRenewingLease folderLease) throws AzureException {
    final Calendar lastModifiedCalendar = Calendar.getInstance(Utility.LOCALE_US);
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