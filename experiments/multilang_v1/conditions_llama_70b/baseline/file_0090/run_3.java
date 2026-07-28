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
import java.util.Collections;
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

@InterfaceAudience.Private
@VisibleForTesting
public class AzureNativeFileSystemStore implements NativeFileSystemStore {

  private static final Log LOG = LogFactory.getLog(AzureNativeFileSystemStore.class);

  private StorageInterface storageInteractionLayer;
  private CloudBlobDirectoryWrapper rootDirectory;
  private CloudBlobContainerWrapper container;

  private URI sessionUri;
  private Configuration sessionConfiguration;
  private int concurrentWrites;
  private boolean isAnonymousCredentials;
  private boolean connectingUsingSAS;
  private AzureFileSystemInstrumentation instrumentation;
  private BandwidthGaugeUpdater bandwidthGaugeUpdater;
  private final static JSON PERMISSION_JSON_SERIALIZER = createPermissionJsonSerializer();

  private boolean suppressRetryPolicy;
  private boolean canCreateOrModifyContainer;
  private ContainerState currentKnownContainerState = ContainerState.Unknown;
  private final Object containerStateLock = new Object();

  private boolean tolerateOobAppends;
  private int downloadBlockSizeBytes;
  private int uploadBlockSizeBytes;

  private int minBackoff;
  private int maxBackoff;
  private int deltaBackoff;
  private int maxRetries;

  private boolean selfThrottlingEnabled;
  private float selfThrottlingReadFactor;
  private float selfThrottlingWriteFactor;

  private TestHookOperationContext testHookOperationContext = null;

  private boolean isStorageEmulator;

  private Set<String> pageBlobDirs;
  private Set<String> atomicRenameDirs;

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

  public AzureNativeFileSystemStore() {}

  @Override
  public void initialize(URI uri, Configuration conf, AzureFileSystemInstrumentation instrumentation)
      throws IllegalArgumentException, AzureException, IOException {
    this.instrumentation = instrumentation;
    this.storageInteractionLayer = new StorageInterfaceImpl();
    this.sessionUri = uri;
    this.sessionConfiguration = conf;
    this.pageBlobDirs = getDirectorySet("fs.azure.page.blob.dir");
    this.atomicRenameDirs = getDirectorySet("fs.azure.atomic.rename.dir");
    createAzureStorageSession();
  }

  private void createAzureStorageSession() throws AzureException, IOException {
    try {
      String accountName = getAccountFromAuthority(sessionUri);
      String containerName = getContainerFromAuthority(sessionUri);
      instrumentation.setAccountName(accountName);
      instrumentation.setContainerName(containerName);

      if (isStorageEmulatorAccount(accountName)) {
        isStorageEmulator = true;
        CloudStorageAccount account = CloudStorageAccount.getDevelopmentStorageAccount();
        storageInteractionLayer.createBlobClient(account);
      } else {
        URI blobEndPoint = new URI(getHTTPScheme() + "://" + accountName);
        storageInteractionLayer.createBlobClient(blobEndPoint, null);
      }
      suppressRetryPolicyInClientIfNeeded();

      container = storageInteractionLayer.getContainerReference(containerName);
      rootDirectory = container.getDirectoryReference("");

      canCreateOrModifyContainer = false;
      configureAzureStorageSession();
    } catch (Exception e) {
      throw new AzureException(e);
    }
  }

  private void configureAzureStorageSession() throws AzureException {
    tolerateOobAppends = sessionConfiguration.getBoolean("fs.azure.io.read.tolerate.concurrent.append", false);
    downloadBlockSizeBytes = sessionConfiguration.getInt("fs.azure.read.request.size", 4 * 1024 * 1024);
    uploadBlockSizeBytes = sessionConfiguration.getInt("fs.azure.write.request.size", 4 * 1024 * 1024);

    minBackoff = sessionConfiguration.getInt("fs.azure.io.retry.min.backoff.interval", 1 * 1000);
    maxBackoff = sessionConfiguration.getInt("fs.azure.io.retry.max.backoff.interval", 30 * 1000);
    deltaBackoff = sessionConfiguration.getInt("fs.azure.io.retry.backoff.interval", 1 * 1000);
    maxRetries = sessionConfiguration.getInt("fs.azure.io.retry.max.retries", 15);

    storageInteractionLayer.setRetryPolicyFactory(new RetryExponentialRetry(minBackoff, deltaBackoff, maxBackoff, maxRetries));

    selfThrottlingEnabled = sessionConfiguration.getBoolean("fs.azure.selfthrottling.enable", true);
    selfThrottlingReadFactor = sessionConfiguration.getFloat("fs.azure.selfthrottling.read.factor", 1.0f);
    selfThrottlingWriteFactor = sessionConfiguration.getFloat("fs.azure.selfthrottling.write.factor", 1.0f);
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
          if (containerVersion.equals("2013-01-01")) {
            if (needToStampVersion(accessType)) {
              storeVersionAttribute(container);
              container.uploadMetadata(getInstrumentedContext());
            }
          } else if (!containerVersion.equals("2013-09-01")) {
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
    return new AzureException("The container " + container.getName() + " is at an unsupported version: " + containerVersion + ". Current supported version: 2013-09-01");
  }

  private boolean needToStampVersion(ContainerAccessType accessType) {
    return accessType != ContainerAccessType.PureRead && canCreateOrModifyContainer;
  }

  private boolean needToCreateContainer(ContainerAccessType accessType) {
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
  public DataOutputStream storefile(String key, PermissionStatus permissionStatus) throws AzureException {
    try {
      checkContainer(ContainerAccessType.PureWrite);

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

  private BlobRequestOptions getUploadOptions() {
    BlobRequestOptions options = new BlobRequestOptions();
    options.setStoreBlobContentMD5(sessionConfiguration.getBoolean("fs.azure.check.block.md5", true));
    options.setUseTransactionalContentMD5(getUseTransactionalContentMD5());
    options.setConcurrentRequestCount(concurrentWrites);

    options.setRetryPolicyFactory(new RetryExponentialRetry(minBackoff, deltaBackoff, maxBackoff, maxRetries));

    return options;
  }

  private boolean getUseTransactionalContentMD5() {
    return sessionConfiguration.getBoolean("fs.azure.check.block.md5", true);
  }

  @Override
  public void storeEmptyFolder(String key, PermissionStatus permissionStatus) throws AzureException {
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

  private static void storePermissionStatus(CloudBlobWrapper blob, PermissionStatus permissionStatus) {
    HashMap<String, String> metadata = blob.getMetadata();
    if (null == metadata) {
      metadata = new HashMap<String, String>();
    }
    metadata.put("hdi_permission", PERMISSION_JSON_SERIALIZER.toJSON(permissionStatus));
    blob.setMetadata(metadata);
  }

  private static void storeFolderAttribute(CloudBlobWrapper blob) {
    HashMap<String, String> metadata = blob.getMetadata();
    if (null == metadata) {
      metadata = new HashMap<String, String>();
    }
    metadata.put("hdi_isfolder", "true");
    blob.setMetadata(metadata);
  }

  @Override
  public FileMetadata retrieveMetadata(String key) throws IOException {
    try {
      checkContainer(ContainerAccessType.PureRead);

      CloudBlobWrapper blob = getBlobReference(key);
      blob.downloadAttributes(getInstrumentedContext());

      if (retrieveFolderAttribute(blob)) {
        return new FileMetadata(key, blob.getProperties().getLastModified().getTime(), getPermissionStatus(blob), BlobMaterialization.Explicit);
      } else {
        return new FileMetadata(key, blob.getProperties().getLength(), blob.getProperties().getLastModified().getTime(), getPermissionStatus(blob));
      }
    } catch (Exception e) {
      throw new AzureException(e);
    }
  }

  private PermissionStatus getPermissionStatus(CloudBlobWrapper blob) {
    String permissionMetadataValue = getMetadataAttribute(blob, "hdi_permission");
    if (permissionMetadataValue != null) {
      return PermissionStatusJsonSerializer.fromJSONString(permissionMetadataValue);
    } else {
      return defaultPermissionNoBlobMetadata();
    }
  }

  private static PermissionStatus defaultPermissionNoBlobMetadata() {
    return new PermissionStatus("", "", FsPermission.getDefault());
  }

  private static String getMetadataAttribute(CloudBlobWrapper blob, String key) {
    HashMap<String, String> metadata = blob.getMetadata();
    if (null == metadata) {
      return null;
    }
    return metadata.get(key);
  }

  private static boolean retrieveFolderAttribute(CloudBlobWrapper blob) {
    HashMap<String, String> metadata = blob.getMetadata();
    return null != metadata && metadata.containsKey("hdi_isfolder");
  }

  @Override
  public DataInputStream retrieve(String key) throws AzureException, IOException {
    try {
      checkContainer(ContainerAccessType.PureRead);

      CloudBlobWrapper blob = getBlobReference(key);
      BufferedInputStream inBufStream = new BufferedInputStream(openInputStream(blob));
      DataInputStream inDataStream = new DataInputStream(inBufStream);
      return inDataStream;
    } catch (Exception e) {
      throw new AzureException(e);
    }
  }

  private InputStream openInputStream(CloudBlobWrapper blob) throws StorageException, IOException {
    if (blob instanceof CloudBlockBlobWrapper) {
      return blob.openInputStream(getDownloadOptions(), getInstrumentedContext(isConcurrentOOBAppendAllowed()));
    } else {
      return new PageBlobInputStream((CloudPageBlobWrapper) blob, getInstrumentedContext(isConcurrentOOBAppendAllowed()));
    }
  }

  private BlobRequestOptions getDownloadOptions() {
    BlobRequestOptions options = new BlobRequestOptions();
    options.setRetryPolicyFactory(new RetryExponentialRetry(minBackoff, deltaBackoff, maxBackoff, maxRetries));
    options.setUseTransactionalContentMD5(getUseTransactionalContentMD5());
    return options;
  }

  @Override
  public PartialListing list(String prefix, final int maxListingCount, final int maxListingDepth) throws IOException {
    return list(prefix, PATH_DELIMITER, maxListingCount, maxListingDepth, null);
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
        if (blobItem instanceof CloudBlockBlobWrapper || blobItem instanceof CloudPageBlobWrapper) {
          String blobKey = normalizeKey(blobItem.getUri());
          FileMetadata metadata;
          if (retrieveFolderAttribute((CloudBlobWrapper) blobItem)) {
            metadata = new FileMetadata(blobKey, ((CloudBlobWrapper) blobItem).getProperties().getLastModified().getTime(), getPermissionStatus((CloudBlobWrapper) blobItem), BlobMaterialization.Explicit);
          } else {
            metadata = new FileMetadata(blobKey, ((CloudBlobWrapper) blobItem).getProperties().getLength(), ((CloudBlobWrapper) blobItem).getProperties().getLastModified().getTime(), getPermissionStatus((CloudBlobWrapper) blobItem));
          }
          fileMetadata.add(metadata);
        } else if (blobItem instanceof CloudBlobDirectoryWrapper) {
          CloudBlobDirectoryWrapper directory = (CloudBlobDirectoryWrapper) blobItem;
          String dirKey = normalizeKey(directory.getUri());
          if (dirKey.endsWith(PATH_DELIMITER)) {
            dirKey = dirKey.substring(0, dirKey.length() - 1);
          }
          FileMetadata directoryMetadata = new FileMetadata(dirKey, 0, defaultPermissionNoBlobMetadata(), BlobMaterialization.Implicit);
          fileMetadata.add(directoryMetadata);
        }
      }
      PartialListing listing = new PartialListing(priorLastKey, fileMetadata.toArray(new FileMetadata[] {}), 0 == fileMetadata.size() ? new String[] {} : new String[] { prefix });
      return listing;
    } catch (Exception e) {
      throw new AzureException(e);
    }
  }

  private Iterable<ListBlobItem> listRootBlobs(boolean includeMetadata) throws StorageException, URISyntaxException {
    return rootDirectory.listBlobs(null, false, includeMetadata ? EnumSet.of(BlobListingDetails.METADATA) : EnumSet.noneOf(BlobListingDetails.class), null, getInstrumentedContext());
  }

  private Iterable<ListBlobItem> listRootBlobs(String aPrefix, boolean includeMetadata) throws StorageException, URISyntaxException {
    return rootDirectory.listBlobs(aPrefix, false, includeMetadata ? EnumSet.of(BlobListingDetails.METADATA) : EnumSet.noneOf(BlobListingDetails.class), null, getInstrumentedContext());
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

  @Override
  public void delete(String key, SelfRenewingLease lease) throws IOException {
    try {
      checkContainer(ContainerAccessType.ReadThenWrite);
      CloudBlobWrapper blob = getBlobReference(key);
      safeDelete(blob, lease);
    } catch (Exception e) {
      throw new AzureException(e);
    }
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
  public void rename(String srcKey, String dstKey) throws IOException {
    rename(srcKey, dstKey, false, null);
  }

  @Override
  public void rename(String srcKey, String dstKey, boolean acquireLease, SelfRenewingLease existingLease) throws IOException {
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
      checkContainer(ContainerAccessType.ReadThenWrite);
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

  private CloudBlobWrapper getBlobReference(String aKey) throws StorageException, URISyntaxException {
    CloudBlobWrapper blob = null;
    if (isPageBlobKey(aKey)) {
      blob = container.getPageBlobReference(aKey);
    } else {
      blob = container.getBlockBlobReference(aKey);
      blob.setStreamMinimumReadSizeInBytes(downloadBlockSizeBytes);
      blob.setWriteBlockSizeInBytes(uploadBlockSizeBytes);
    }
    return blob;
  }

  private boolean isPageBlobKey(String key) {
    return isKeyForDirectorySet(key, pageBlobDirs);
  }

  private boolean isKeyForDirectorySet(String key, Set<String> dirSet) {
    for (String dir : dirSet) {
      if (dir.isEmpty() || key.startsWith(dir + "/")) {
        return true;
      }
    }
    return false;
  }

  private Set<String> getDirectorySet(String configVar) {
    String[] rawDirs = sessionConfiguration.getStrings(configVar, new String[0]);
    Set<String> directorySet = new HashSet<String>();
    for (String currentDir : rawDirs) {
      try {
        String myDir = verifyAndConvertToStandardFormat(currentDir);
        if (myDir != null) {
          directorySet.add(myDir);
        }
      } catch (URISyntaxException ex) {
        throw new AzureException(String.format("The directory %s specified in the configuration entry %s is not a valid URI.", currentDir, configVar));
      }
    }
    return directorySet;
  }

  private String verifyAndConvertToStandardFormat(String rawDir) throws URISyntaxException {
    URI asUri = new URI(rawDir);
    if (asUri.getAuthority() == null || asUri.getAuthority().toLowerCase(Locale.ENGLISH).equalsIgnoreCase(sessionUri.getAuthority().toLowerCase(Locale.ENGLISH))) {
      return trim(asUri.getPath(), "/");
    } else {
      return null;
    }
  }

  private String trim(String s, String toTrim) {
    return StringUtils.removeEnd(StringUtils.removeStart(s, toTrim), toTrim);
  }

  private boolean isStorageEmulatorAccount(final String accountName) {
    return accountName.equalsIgnoreCase(sessionConfiguration.get("fs.azure.storage.emulator.account.name", "storageemulator"));
  }
}