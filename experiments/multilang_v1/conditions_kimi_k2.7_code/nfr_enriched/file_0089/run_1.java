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

package org.apache.hadoop.fs.s3a;

import java.io.File;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import com.amazonaws.AmazonClientException;
import com.amazonaws.AmazonServiceException;
import com.amazonaws.ClientConfiguration;
import com.amazonaws.Protocol;
import com.amazonaws.auth.AWSCredentialsProviderChain;

import com.amazonaws.auth.InstanceProfileCredentialsProvider;
import com.amazonaws.services.s3.AmazonS3Client;
import com.amazonaws.services.s3.model.CannedAccessControlList;
import com.amazonaws.services.s3.model.DeleteObjectsRequest;
import com.amazonaws.services.s3.model.ListObjectsRequest;
import com.amazonaws.services.s3.model.ObjectListing;
import com.amazonaws.services.s3.model.ObjectMetadata;
import com.amazonaws.services.s3.model.PutObjectRequest;
import com.amazonaws.services.s3.model.CopyObjectRequest;
import com.amazonaws.services.s3.model.S3ObjectSummary;
import com.amazonaws.services.s3.transfer.Copy;
import com.amazonaws.services.s3.transfer.TransferManager;
import com.amazonaws.services.s3.transfer.TransferManagerConfiguration;
import com.amazonaws.services.s3.transfer.Upload;
import com.amazonaws.event.ProgressListener;
import com.amazonaws.event.ProgressEvent;

import com.google.common.annotations.VisibleForTesting;
import org.apache.commons.lang.StringUtils;

import org.apache.hadoop.conf.Configuration;
import org.apache.hadoop.fs.FSDataInputStream;
import org.apache.hadoop.fs.FSDataOutputStream;
import org.apache.hadoop.fs.FileAlreadyExistsException;
import org.apache.hadoop.fs.FileStatus;
import org.apache.hadoop.fs.FileSystem;
import org.apache.hadoop.fs.LocalFileSystem;
import org.apache.hadoop.fs.Path;
import org.apache.hadoop.fs.permission.FsPermission;
import org.apache.hadoop.util.Progressable;

import static org.apache.hadoop.fs.s3a.Constants.*;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class S3AFileSystem extends FileSystem {
  /**
   * Default blocksize as used in blocksize and FS status queries
   */
  public static final int DEFAULT_BLOCKSIZE = 32 * 1024 * 1024;
  private URI uri;
  private Path workingDir;
  private AmazonS3Client s3;
  private String bucket;
  private int maxKeys;
  private long partSize;
  private TransferManager transfers;
  private ThreadPoolExecutor threadPoolExecutor;
  private int multiPartThreshold;
  public static final Logger LOG = LoggerFactory.getLogger(S3AFileSystem.class);
  private CannedAccessControlList cannedACL;
  private String serverSideEncryptionAlgorithm;

  // The maximum number of entries that can be deleted in any call to s3
  private static final int MAX_ENTRIES_TO_DELETE = 1000;

  private static final AtomicInteger poolNumber = new AtomicInteger(1);

  /**
   * Returns a {@link java.util.concurrent.ThreadFactory} that names each created thread uniquely,
   * with a common prefix.
   * @param prefix The prefix of every created Thread's name
   * @return a {@link java.util.concurrent.ThreadFactory} that names threads
   */
  public static ThreadFactory getNamedThreadFactory(final String prefix) {
    SecurityManager s = System.getSecurityManager();
    final ThreadGroup threadGroup = (s != null) ? s.getThreadGroup() : Thread.currentThread()
        .getThreadGroup();

    return new ThreadFactory() {
      final AtomicInteger threadNumber = new AtomicInteger(1);
      private final int poolNum = poolNumber.getAndIncrement();
      final ThreadGroup group = threadGroup;

      @Override
      public Thread newThread(Runnable r) {
        final String name = prefix + "-pool" + poolNum + "-t" + threadNumber.getAndIncrement();
        return new Thread(group, r, name);
      }
    };
  }

  /**
   * Get a named {@link ThreadFactory} that just builds daemon threads.
   * @param prefix name prefix for all threads created from the factory
   * @return a thread factory that creates named, daemon threads with
   *         the supplied exception handler and normal priority
   */
  private static ThreadFactory newDaemonThreadFactory(final String prefix) {
    final ThreadFactory namedFactory = getNamedThreadFactory(prefix);
    return new ThreadFactory() {
      @Override
      public Thread newThread(Runnable r) {
        Thread t = namedFactory.newThread(r);
        if (!t.isDaemon()) {
          t.setDaemon(true);
        }
        if (t.getPriority() != Thread.NORM_PRIORITY) {
          t.setPriority(Thread.NORM_PRIORITY);
        }
        return t;
      }

    };
  }

  /** Called after a new FileSystem instance is constructed.
   * @param name a uri whose authority section names the host, port, etc.
   *   for this FileSystem
   * @param conf the configuration
   */
  public void initialize(URI name, Configuration conf) throws IOException {
    super.initialize(name, conf);

    initUriAndWorkingDir(name);
    AWSCredentialsProviderChain credentials = createCredentials(name, conf);
    ClientConfiguration awsConf = createAwsConf(conf);
    s3 = createS3Client(credentials, awsConf, conf);

    initTransferManager(conf);
    initCannedAcl(conf);
    verifyBucketExists();
    purgeExistingMultipartUploads(conf);

    serverSideEncryptionAlgorithm = conf.get(SERVER_SIDE_ENCRYPTION_ALGORITHM);

    setConf(conf);
  }

  /**
   * Initialize the URI and working directory fields.
   * @param name the file system URI
   */
  private void initUriAndWorkingDir(URI name) {
    uri = URI.create(name.getScheme() + "://" + name.getAuthority());
    workingDir = new Path("/user", System.getProperty("user.name")).makeQualified(this.uri,
        this.getWorkingDirectory());
  }

  /**
   * Build the AWS credentials provider chain from configuration and URI user info.
   * @param name the file system URI, which may contain embedded credentials
   * @param conf the configuration
   * @return a credentials provider chain
   */
  private AWSCredentialsProviderChain createCredentials(URI name, Configuration conf) {
    String accessKey = conf.get(ACCESS_KEY, null);
    String secretKey = conf.get(SECRET_KEY, null);

    String userInfo = name.getUserInfo();
    if (userInfo != null) {
      int index = userInfo.indexOf(':');
      if (index != -1) {
        accessKey = userInfo.substring(0, index);
        secretKey = userInfo.substring(index + 1);
      } else {
        accessKey = userInfo;
      }
    }

    return new AWSCredentialsProviderChain(
        new BasicAWSCredentialsProvider(accessKey, secretKey),
        new InstanceProfileCredentialsProvider(),
        new AnonymousAWSCredentialsProvider()
    );
  }

  /**
   * Build the AWS client configuration from the Hadoop configuration.
   * @param conf the configuration
   * @return a configured {@link ClientConfiguration}
   */
  private ClientConfiguration createAwsConf(Configuration conf) {
    ClientConfiguration awsConf = new ClientConfiguration();
    awsConf.setMaxConnections(conf.getInt(MAXIMUM_CONNECTIONS,
      DEFAULT_MAXIMUM_CONNECTIONS));
    boolean secureConnections = conf.getBoolean(SECURE_CONNECTIONS,
        DEFAULT_SECURE_CONNECTIONS);
    awsConf.setProtocol(secureConnections ? Protocol.HTTPS : Protocol.HTTP);
    awsConf.setMaxErrorRetry(conf.getInt(MAX_ERROR_RETRIES,
      DEFAULT_MAX_ERROR_RETRIES));
    awsConf.setConnectionTimeout(conf.getInt(ESTABLISH_TIMEOUT,
        DEFAULT_ESTABLISH_TIMEOUT));
    awsConf.setSocketTimeout(conf.getInt(SOCKET_TIMEOUT,
      DEFAULT_SOCKET_TIMEOUT));

    applyProxySettings(awsConf, conf, secureConnections);

    return awsConf;
  }

  /**
   * Apply proxy settings to the AWS client configuration.
   * @param awsConf the AWS client configuration to update
   * @param conf the Hadoop configuration
   * @param secureConnections whether HTTPS is enabled
   */
  private void applyProxySettings(ClientConfiguration awsConf, Configuration conf,
      boolean secureConnections) {
    String proxyHost = conf.getTrimmed(PROXY_HOST, "");
    int proxyPort = conf.getInt(PROXY_PORT, -1);
    if (!proxyHost.isEmpty()) {
      awsConf.setProxyHost(proxyHost);
      awsConf.setProxyPort(resolveProxyPort(proxyPort, secureConnections));

      String proxyUsername = conf.getTrimmed(PROXY_USERNAME);
      String proxyPassword = conf.getTrimmed(PROXY_PASSWORD);
      validateProxyCredentials(proxyUsername, proxyPassword);

      awsConf.setProxyUsername(proxyUsername);
      awsConf.setProxyPassword(proxyPassword);
      awsConf.setProxyDomain(conf.getTrimmed(PROXY_DOMAIN));
      awsConf.setProxyWorkstation(conf.getTrimmed(PROXY_WORKSTATION));

      logProxySettings(awsConf);
    } else if (proxyPort >= 0) {
      String msg = "Proxy error: " + PROXY_PORT + " set without " + PROXY_HOST;
      LOG.error(msg);
      throw new IllegalArgumentException(msg);
    }
  }

  /**
   * Resolve the proxy port, using the configured value or a protocol default.
   * @param proxyPort the configured proxy port
   * @param secureConnections whether HTTPS is enabled
   * @return the proxy port to use
   */
  private int resolveProxyPort(int proxyPort, boolean secureConnections) {
    if (proxyPort >= 0) {
      return proxyPort;
    }
    if (secureConnections) {
      LOG.warn("Proxy host set without port. Using HTTPS default 443");
      return 443;
    }
    LOG.warn("Proxy host set without port. Using HTTP default 80");
    return 80;
  }

  /**
   * Validate that proxy credentials are either both set or both absent.
   * @param proxyUsername the proxy user name
   * @param proxyPassword the proxy password
   */
  private void validateProxyCredentials(String proxyUsername, String proxyPassword) {
    if ((proxyUsername == null) != (proxyPassword == null)) {
      String msg = "Proxy error: " + PROXY_USERNAME + " or " +
          PROXY_PASSWORD + " set without the other.";
      LOG.error(msg);
      throw new IllegalArgumentException(msg);
    }
  }

  /**
   * Log the configured proxy settings at debug level.
   * @param awsConf the AWS client configuration
   */
  private void logProxySettings(ClientConfiguration awsConf) {
    if (LOG.isDebugEnabled()) {
      LOG.debug("Using proxy server {}:{} as user {} with password {} on " +
              "domain {} as workstation {}", awsConf.getProxyHost(),
          awsConf.getProxyPort(), String.valueOf(awsConf.getProxyUsername()),
          awsConf.getProxyPassword(), awsConf.getProxyDomain(),
          awsConf.getProxyWorkstation());
    }
  }

  /**
   * Create the S3 client, applying any configured endpoint.
   * @param credentials the credentials provider chain
   * @param awsConf the AWS client configuration
   * @param conf the Hadoop configuration
   * @return the configured S3 client
   */
  private AmazonS3Client createS3Client(AWSCredentialsProviderChain credentials,
      ClientConfiguration awsConf, Configuration conf) {
    AmazonS3Client client = new AmazonS3Client(credentials, awsConf);
    String endPoint = conf.getTrimmed(ENDPOINT, "");
    if (!endPoint.isEmpty()) {
      try {
        client.setEndpoint(endPoint);
      } catch (IllegalArgumentException e) {
        String msg = "Incorrect endpoint: " + e.getMessage();
        LOG.error(msg);
        throw new IllegalArgumentException(msg, e);
      }
    }
    return client;
  }

  /**
   * Initialize the transfer manager, thread pool, and upload thresholds.
   * @param conf the Hadoop configuration
   */
  private void initTransferManager(Configuration conf) {
    maxKeys = conf.getInt(MAX_PAGING_KEYS, DEFAULT_MAX_PAGING_KEYS);
    partSize = conf.getLong(MULTIPART_SIZE, DEFAULT_MULTIPART_SIZE);
    multiPartThreshold = conf.getInt(MIN_MULTIPART_THRESHOLD,
      DEFAULT_MIN_MULTIPART_THRESHOLD);

    partSize = ensureMinimumPartSize(partSize, MULTIPART_SIZE);
    multiPartThreshold = (int) ensureMinimumPartSize(multiPartThreshold,
        MIN_MULTIPART_THRESHOLD);

    threadPoolExecutor = createThreadPoolExecutor(conf);

    TransferManagerConfiguration transferConfiguration = new TransferManagerConfiguration();
    transferConfiguration.setMinimumUploadPartSize(partSize);
    transferConfiguration.setMultipartUploadThreshold(multiPartThreshold);

    transfers = new TransferManager(s3, threadPoolExecutor);
    transfers.setConfiguration(transferConfiguration);
  }

  /**
   * Enforce the minimum allowed part size for multipart uploads.
   * @param size the configured size
   * @param setting the name of the setting being validated
   * @return the validated size
   */
  private long ensureMinimumPartSize(long size, String setting) {
    if (size < 5 * 1024 * 1024) {
      LOG.error(setting + " must be at least 5 MB");
      return 5 * 1024 * 1024;
    }
    return size;
  }

  /**
   * Create the thread pool used by the transfer manager.
   * @param conf the Hadoop configuration
   * @return the configured thread pool executor
   */
  private ThreadPoolExecutor createThreadPoolExecutor(Configuration conf) {
    int maxThreads = conf.getInt(MAX_THREADS, DEFAULT_MAX_THREADS);
    int coreThreads = conf.getInt(CORE_THREADS, DEFAULT_CORE_THREADS);
    if (maxThreads == 0) {
      maxThreads = Runtime.getRuntime().availableProcessors() * 8;
    }
    if (coreThreads == 0) {
      coreThreads = Runtime.getRuntime().availableProcessors() * 8;
    }
    long keepAliveTime = conf.getLong(KEEPALIVE_TIME, DEFAULT_KEEPALIVE_TIME);
    LinkedBlockingQueue<Runnable> workQueue =
      new LinkedBlockingQueue<>(maxThreads *
        conf.getInt(MAX_TOTAL_TASKS, DEFAULT_MAX_TOTAL_TASKS));
    ThreadPoolExecutor executor = new ThreadPoolExecutor(
        coreThreads,
        maxThreads,
        keepAliveTime,
        TimeUnit.SECONDS,
        workQueue,
        newDaemonThreadFactory("s3a-transfer-shared-"));
    executor.allowCoreThreadTimeOut(true);
    return executor;
  }

  /**
   * Initialize the canned ACL setting from configuration.
   * @param conf the Hadoop configuration
   */
  private void initCannedAcl(Configuration conf) {
    String cannedACLName = conf.get(CANNED_ACL, DEFAULT_CANNED_ACL);
    if (!cannedACLName.isEmpty()) {
      cannedACL = CannedAccessControlList.valueOf(cannedACLName);
    } else {
      cannedACL = null;
    }
  }

  /**
   * Verify that the configured bucket exists.
   * @throws IOException if the bucket does not exist
   */
  private void verifyBucketExists() throws IOException {
    if (!s3.doesBucketExist(bucket)) {
      throw new IOException("Bucket " + bucket + " does not exist");
    }
  }

  /**
   * Abort stale multipart uploads if configured to do so.
   * @param conf the Hadoop configuration
   */
  private void purgeExistingMultipartUploads(Configuration conf) {
    boolean purgeExistingMultipart = conf.getBoolean(PURGE_EXISTING_MULTIPART,
      DEFAULT_PURGE_EXISTING_MULTIPART);
    long purgeExistingMultipartAge = conf.getLong(PURGE_EXISTING_MULTIPART_AGE,
      DEFAULT_PURGE_EXISTING_MULTIPART_AGE);

    if (purgeExistingMultipart) {
      Date purgeBefore = new Date(new Date().getTime() - purgeExistingMultipartAge * 1000);
      transfers.abortMultipartUploads(bucket, purgeBefore);
    }
  }

  /**
   * Return the protocol scheme for the FileSystem.
   *
   * @return "s3a"
   */
  public String getScheme() {
    return "s3a";
  }

  /** Returns a URI whose scheme and authority identify this FileSystem.*/
  public URI getUri() {
    return uri;
  }

  /**
   * Returns the S3 client used by this filesystem.
   * @return AmazonS3Client
   */
  @VisibleForTesting
  AmazonS3Client getAmazonS3Client() {
    return s3;
  }

  public S3AFileSystem() {
    super();
  }

  /* Turns a path (relative or otherwise) into an S3 key
   */
  private String pathToKey(Path path) {
    if (!path.isAbsolute()) {
      path = new Path(workingDir, path);
    }

    if (path.toUri().getScheme() != null && path.toUri().getPath().isEmpty()) {
      return "";
    }

    return path.toUri().getPath().substring(1);
  }

  private Path keyToPath(String key) {
    return new Path("/" + key);
  }

  /**
   * Opens an FSDataInputStream at the indicated Path.
   * @param f the file name to open
   * @param bufferSize the size of the buffer to be used.
   */
  public FSDataInputStream open(Path f, int bufferSize)
      throws IOException {

    if (LOG.isDebugEnabled()) {
      LOG.debug("Opening '{}' for reading.", f);
    }
    final FileStatus fileStatus = getFileStatus(f);
    if (fileStatus.isDirectory()) {
      throw new FileNotFoundException("Can't open " + f + " because it is a directory");
    }

    return new FSDataInputStream(new S3AInputStream(bucket, pathToKey(f),
      fileStatus.getLen(), s3, statistics));
  }

  /**
   * Create an FSDataOutputStream at the indicated Path with write-progress
   * reporting.
   * @param f the file name to open
   * @param permission
   * @param overwrite if a file with this name already exists, then if true,
   *   the file will be overwritten, and if false an error will be thrown.
   * @param bufferSize the size of the buffer to be used.
   * @param replication required block replication for the file.
   * @param blockSize
   * @param progress
   * @throws IOException
   * @see #setPermission(Path, FsPermission)
   */
  public FSDataOutputStream create(Path f, FsPermission permission, boolean overwrite,
    int bufferSize, short replication, long blockSize, Progressable progress) throws IOException {
    String key = pathToKey(f);

    if (!overwrite && exists(f)) {
      throw new FileAlreadyExistsException(f + " already exists");
    }

    if (getConf().getBoolean(FAST_UPLOAD, DEFAULT_FAST_UPLOAD)) {
      return createFastOutputStream(key, progress);
    }
    return createNormalOutputStream(key, progress);
  }

  /**
   * Create a fast upload output stream.
   * @param key the S3 key
   * @param progress the progress reporter
   * @return the output stream
   * @throws IOException on failure
   */
  private FSDataOutputStream createFastOutputStream(String key, Progressable progress)
      throws IOException {
    return new FSDataOutputStream(new S3AFastOutputStream(s3, this, bucket,
        key, progress, statistics, cannedACL,
        serverSideEncryptionAlgorithm, partSize, (long) multiPartThreshold,
        threadPoolExecutor), statistics);
  }

  /**
   * Create a normal (buffered) upload output stream.
   * @param key the S3 key
   * @param progress the progress reporter
   * @return the output stream
   * @throws IOException on failure
   */
  private FSDataOutputStream createNormalOutputStream(String key, Progressable progress)
      throws IOException {
    // We pass null to FSDataOutputStream so it won't count writes that are being buffered to a file
    return new FSDataOutputStream(new S3AOutputStream(getConf(), transfers, this,
      bucket, key, progress, cannedACL, statistics,
      serverSideEncryptionAlgorithm), null);
  }

  /**
   * Append to an existing file (optional operation).
   * @param f the existing file to be appended.
   * @param bufferSize the size of the buffer to be used.
   * @param progress for reporting progress if it is not null.
   * @throws IOException
   */
  public FSDataOutputStream append(Path f, int bufferSize,
    Progressable progress) throws IOException {
    throw new IOException("Not supported");
  }


  /**
   * Renames Path src to Path dst.  Can take place on local fs
   * or remote DFS.
   *
   * Warning: S3 does not support renames. This method does a copy which can
   * take S3 some time to execute with large files and directories. Since
   * there is no Progressable passed in, this can time out jobs.
   *
   * Note: This implementation differs with other S3 drivers. Specifically:
   *       Fails if src is a file and dst is a directory.
   *       Fails if src is a directory and dst is a file.
   *       Fails if the parent of dst does not exist or is a file.
   *       Fails if dst is a directory that is not empty.
   *
   * @param src path to be renamed
   * @param dst new path after rename
   * @throws IOException on failure
   * @return true if rename is successful
   */
  public boolean rename(Path src, Path dst) throws IOException {
    logRename(src, dst);

    String srcKey = pathToKey(src);
    String dstKey = pathToKey(dst);

    if (!isValidRenamePath(srcKey) || !isValidRenamePath(dstKey)) {
      logDebug("rename: src or dst are empty");
      return false;
    }

    S3AFileStatus srcStatus = getSourceStatus(src);
    if (srcStatus == null) {
      return false;
    }

    if (srcKey.equals(dstKey)) {
      logDebug("rename: src and dst refer to the same file or directory");
      return srcStatus.isFile();
    }

    S3AFileStatus dstStatus = getDestinationStatus(dst);
    if (!isRenameAllowed(srcStatus, dstStatus)) {
      return false;
    }

    if (dstStatus == null && !ensureDestinationParentExists(dst)) {
      return false;
    }

    boolean renamed = performRename(src, srcKey, dstKey, srcStatus, dstStatus);
    if (renamed) {
      updateParentDirectories(src, dst);
    }
    return renamed;
  }

  /**
   * Log a rename operation at debug level.
   * @param src the source path
   * @param dst the destination path
   */
  private void logRename(Path src, Path dst) {
    if (LOG.isDebugEnabled()) {
      LOG.debug("Rename path {} to {}", src, dst);
    }
  }

  /**
   * Log a debug message when debug is enabled.
   * @param message the message to log
   */
  private void logDebug(String message) {
    if (LOG.isDebugEnabled()) {
      LOG.debug(message);
    }
  }

  /**
   * Check whether a key is acceptable as a rename source or destination.
   * @param key the S3 key
   * @return true if the key is non-empty
   */
  private boolean isValidRenamePath(String key) {
    return !key.isEmpty();
  }

  /**
   * Retrieve the source status for a rename, returning null if not found.
   * @param src the source path
   * @return the source status, or null if it does not exist
   * @throws IOException on other failures
   */
  private S3AFileStatus getSourceStatus(Path src) throws IOException {
    try {
      return getFileStatus(src);
    } catch (FileNotFoundException e) {
      LOG.error("rename: src not found {}", src);
      return null;
    }
  }

  /**
   * Retrieve the destination status for a rename, returning null if not found.
   * @param dst the destination path
   * @return the destination status, or null if it does not exist
   * @throws IOException on other failures
   */
  private S3AFileStatus getDestinationStatus(Path dst) throws IOException {
    try {
      return getFileStatus(dst);
    } catch (FileNotFoundException e) {
      return null;
    }
  }

  /**
   * Determine whether a rename is allowed given the source and destination statuses.
   * @param srcStatus the source status
   * @param dstStatus the destination status, or null if it does not exist
   * @return true if the rename may proceed
   */
  private boolean isRenameAllowed(S3AFileStatus srcStatus, S3AFileStatus dstStatus) {
    if (dstStatus == null) {
      return true;
    }
    if (srcStatus.isDirectory() && dstStatus.isFile()) {
      logDebug("rename: src is a directory and dst is a file");
      return false;
    }
    if (dstStatus.isDirectory() && !dstStatus.isEmptyDirectory()) {
      return false;
    }
    return true;
  }

  /**
   * Ensure the parent of the destination path exists and is a directory.
   * @param dst the destination path
   * @return true if the parent exists and is a directory
   * @throws IOException on other failures
   */
  private boolean ensureDestinationParentExists(Path dst) throws IOException {
    Path parent = dst.getParent();
    if (parent == null || pathToKey(parent).isEmpty()) {
      return true;
    }
    try {
      S3AFileStatus parentStatus = getFileStatus(parent);
      return parentStatus.isDirectory();
    } catch (FileNotFoundException e) {
      return false;
    }
  }

  /**
   * Perform the actual rename, copying and deleting as appropriate.
   * @param src the source path
   * @param srcKey the source S3 key
   * @param dstKey the destination S3 key
   * @param srcStatus the source status
   * @param dstStatus the destination status, or null
   * @return true if the rename succeeded
   * @throws IOException on failure
   */
  private boolean performRename(Path src, String srcKey, String dstKey,
      S3AFileStatus srcStatus, S3AFileStatus dstStatus) throws IOException {
    if (srcStatus.isFile()) {
      renameFile(src, srcKey, dstKey, dstStatus);
      return true;
    }
    return renameDirectory(srcKey, dstKey, dstStatus);
  }

  /**
   * Rename a file, optionally into an existing directory.
   * @param src the source path
   * @param srcKey the source S3 key
   * @param dstKey the destination S3 key
   * @param dstStatus the destination status, or null
   * @throws IOException on failure
   */
  private void renameFile(Path src, String srcKey, String dstKey,
      S3AFileStatus dstStatus) throws IOException {
    if (LOG.isDebugEnabled()) {
      LOG.debug("rename: renaming file " + src + " to " + dstKey);
    }

    if (dstStatus != null && dstStatus.isDirectory()) {
      String directoryKey = dstKey.endsWith("/") ? dstKey : dstKey + "/";
      String filename = srcKey.substring(pathToKey(src.getParent()).length() + 1);
      copyFile(srcKey, directoryKey + filename);
    } else {
      copyFile(srcKey, dstKey);
    }
    delete(src, false);
  }

  /**
   * Rename a directory to a destination directory.
   * @param srcKey the source S3 key
   * @param dstKey the destination S3 key
   * @param dstStatus the destination status, or null
   * @return true if the rename succeeded
   * @throws IOException on failure
   */
  private boolean renameDirectory(String srcKey, String dstKey, S3AFileStatus dstStatus)
      throws IOException {
    if (LOG.isDebugEnabled()) {
      LOG.debug("rename: renaming directory " + srcKey + " to " + dstKey);
    }

    String normalizedDstKey = dstKey.endsWith("/") ? dstKey : dstKey + "/";
    String normalizedSrcKey = srcKey.endsWith("/") ? srcKey : srcKey + "/";

    if (normalizedDstKey.startsWith(normalizedSrcKey)) {
      logDebug("cannot rename a directory to a subdirectory of self");
      return false;
    }

    List<DeleteObjectsRequest.KeyVersion> keysToDelete = new ArrayList<>();
    if (dstStatus != null && dstStatus.isEmptyDirectory()) {
      keysToDelete.add(new DeleteObjectsRequest.KeyVersion(dstKey));
    }

    copyDirectoryContents(normalizedSrcKey, normalizedDstKey, keysToDelete);
    return true;
  }

  /**
   * Copy the contents of a source directory to a destination directory.
   * @param srcKey the source directory key, ending in "/"
   * @param dstKey the destination directory key, ending in "/"
   * @param keysToDelete the accumulated keys to delete
   * @throws IOException on failure
   */
  private void copyDirectoryContents(String srcKey, String dstKey,
      List<DeleteObjectsRequest.KeyVersion> keysToDelete) throws IOException {
    ListObjectsRequest request = createListObjectsRequest(srcKey);
    ObjectListing objects = s3.listObjects(request);
    statistics.incrementReadOps(1);

    while (true) {
      for (S3ObjectSummary summary : objects.getObjectSummaries()) {
        keysToDelete.add(new DeleteObjectsRequest.KeyVersion(summary.getKey()));
        String newDstKey = dstKey + summary.getKey().substring(srcKey.length());
        copyFile(summary.getKey(), newDstKey);

        if (keysToDelete.size() == MAX_ENTRIES_TO_DELETE) {
          deleteKeys(keysToDelete);
          keysToDelete.clear();
        }
      }

      if (objects.isTruncated()) {
        objects = s3.listNextBatchOfObjects(objects);
        statistics.incrementReadOps(1);
      } else {
        deleteRemainingKeys(keysToDelete);
        break;
      }
    }
  }

  /**
   * Delete a batch of keys from S3.
   * @param keysToDelete the keys to delete
   */
  private void deleteKeys(List<DeleteObjectsRequest.KeyVersion> keysToDelete) {
    DeleteObjectsRequest deleteRequest =
        new DeleteObjectsRequest(bucket).withKeys(keysToDelete);
    s3.deleteObjects(deleteRequest);
    statistics.incrementWriteOps(1);
  }

  /**
   * Delete any remaining keys after a batch operation.
   * @param keysToDelete the remaining keys to delete
   */
  private void deleteRemainingKeys(List<DeleteObjectsRequest.KeyVersion> keysToDelete) {
    if (!keysToDelete.isEmpty()) {
      deleteKeys(keysToDelete);
    }
  }

  /**
   * Update parent directories after a rename.
   * @param src the source path
   * @param dst the destination path
   * @throws IOException on failure
   */
  private void updateParentDirectories(Path src, Path dst) throws IOException {
    if (src.getParent() != dst.getParent()) {
      deleteUnnecessaryFakeDirectories(dst.getParent());
      createFakeDirectoryIfNecessary(src.getParent());
    }
  }

  /** Delete a file.
   *
   * @param f the path to delete.
   * @param recursive if path is a directory and set to
   * true, the directory is deleted else throws an exception. In
   * case of a file the recursive can be set to either true or false.
   * @return  true if delete is successful else false.
   * @throws IOException
   */
  public boolean delete(Path f, boolean recursive) throws IOException {
    logDelete(f, recursive);

    S3AFileStatus status = getStatusForDelete(f);
    if (status == null) {
      return false;
    }

    String key = pathToKey(f);
    if (status.isDirectory()) {
      return deleteDirectory(f, key, status, recursive);
    }
    return deleteFile(f, key);
  }

  /**
   * Log a delete operation at debug level.
   * @param f the path being deleted
   * @param recursive whether the delete is recursive
   */
  private void logDelete(Path f, boolean recursive) {
    if (LOG.isDebugEnabled()) {
      LOG.debug("Delete path " + f + " - recursive " + recursive);
    }
  }

  /**
   * Retrieve the status of a path for deletion, returning null if not found.
   * @param f the path
   * @return the status, or null if the path does not exist
   * @throws IOException on other failures
   */
  private S3AFileStatus getStatusForDelete(Path f) throws IOException {
    try {
      return getFileStatus(f);
    } catch (FileNotFoundException e) {
      if (LOG.isDebugEnabled()) {
        LOG.debug("Couldn't delete " + f + " - does not exist");
      }
      return null;
    }
  }

  /**
   * Delete a directory and its contents.
   * @param f the path being deleted
   * @param key the S3 key
   * @param status the directory status
   * @param recursive whether to delete recursively
   * @return true if the delete succeeded
   * @throws IOException on failure
   */
  private boolean deleteDirectory(Path f, String key, S3AFileStatus status,
      boolean recursive) throws IOException {
    if (LOG.isDebugEnabled()) {
      LOG.debug("delete: Path is a directory");
    }

    if (!recursive && !status.isEmptyDirectory()) {
      throw new IOException("Path is a folder: " + f +
                            " and it is not an empty directory");
    }

    if (!key.endsWith("/")) {
      key = key + "/";
    }

    if (key.equals("/")) {
      LOG.info("s3a cannot delete the root directory");
      return false;
    }

    if (status.isEmptyDirectory()) {
      deleteEmptyDirectory(key);
    } else {
      deleteDirectoryContents(key);
    }

    createFakeDirectoryIfNecessary(f.getParent());
    return true;
  }

  /**
   * Delete a single empty directory marker.
   * @param key the S3 key of the empty directory
   */
  private void deleteEmptyDirectory(String key) {
    if (LOG.isDebugEnabled()) {
      LOG.debug("Deleting fake empty directory");
    }
    s3.deleteObject(bucket, key);
    statistics.incrementWriteOps(1);
  }

  /**
   * Delete all objects under a directory prefix.
   * @param key the directory key, ending in "/"
   */
  private void deleteDirectoryContents(String key) {
    if (LOG.isDebugEnabled()) {
      LOG.debug("Getting objects for directory prefix " + key + " to delete");
    }

    ListObjectsRequest request = createListObjectsRequest(key);
    request.setMaxKeys(maxKeys);

    List<DeleteObjectsRequest.KeyVersion> keys = new ArrayList<>();
    ObjectListing objects = s3.listObjects(request);
    statistics.incrementReadOps(1);
    while (true) {
      for (S3ObjectSummary summary : objects.getObjectSummaries()) {
        keys.add(new DeleteObjectsRequest.KeyVersion(summary.getKey()));
        if (LOG.isDebugEnabled()) {
          LOG.debug("Got object to delete " + summary.getKey());
        }

        if (keys.size() == MAX_ENTRIES_TO_DELETE) {
          deleteKeys(keys);
          keys.clear();
        }
      }

      if (objects.isTruncated()) {
        objects = s3.listNextBatchOfObjects(objects);
        statistics.incrementReadOps(1);
      } else {
        deleteRemainingKeys(keys);
        break;
      }
    }
  }

  /**
   * Delete a single file.
   * @param f the path being deleted
   * @param key the S3 key
   * @return true if the delete succeeded
   * @throws IOException on failure
   */
  private boolean deleteFile(Path f, String key) throws IOException {
    if (LOG.isDebugEnabled()) {
      LOG.debug("delete: Path is a file");
    }
    s3.deleteObject(bucket, key);
    statistics.incrementWriteOps(1);

    createFakeDirectoryIfNecessary(f.getParent());
    return true;
  }

  private void createFakeDirectoryIfNecessary(Path f) throws IOException {
    String key = pathToKey(f);
    if (!key.isEmpty() && !exists(f)) {
      if (LOG.isDebugEnabled()) {
        LOG.debug("Creating new fake directory at " + f);
      }
      createFakeDirectory(bucket, key);
    }
  }

  /**
   * List the statuses of the files/directories in the given path if the path is
   * a directory.
   *
   * @param f given path
   * @return the statuses of the files/directories in the given patch
   * @throws FileNotFoundException when the path does not exist;
   *         IOException see specific implementation
   */
  public FileStatus[] listStatus(Path f) throws FileNotFoundException,
      IOException {
    String key = pathToKey(f);
    if (LOG.isDebugEnabled()) {
      LOG.debug("List status for path: " + f);
    }

    final List<FileStatus> result = new ArrayList<FileStatus>();
    final FileStatus fileStatus = getFileStatus(f);

    if (fileStatus.isDirectory()) {
      listDirectoryStatus(f, key, result);
    } else {
      if (LOG.isDebugEnabled()) {
        LOG.debug("Adding: rd (not a dir): " + f);
      }
      result.add(fileStatus);
    }

    return result.toArray(new FileStatus[result.size()]);
  }

  /**
   * List the statuses of the children of a directory.
   * @param f the directory path
   * @param key the S3 key of the directory
   * @param result the list to populate
   * @throws IOException on failure
   */
  private void listDirectoryStatus(Path f, String key, List<FileStatus> result)
      throws IOException {
    String prefix = key.isEmpty() ? key : key + "/";
    ListObjectsRequest request = createListObjectsRequest(prefix, "/");

    if (LOG.isDebugEnabled()) {
      LOG.debug("listStatus: doing listObjects for directory " + prefix);
    }

    ObjectListing objects = s3.listObjects(request);
    statistics.incrementReadOps(1);

    while (true) {
      addObjectSummaries(f, objects, result);
      addCommonPrefixes(f, objects, result);

      if (objects.isTruncated()) {
        if (LOG.isDebugEnabled()) {
          LOG.debug("listStatus: list truncated - getting next batch");
        }
        objects = s3.listNextBatchOfObjects(objects);
        statistics.incrementReadOps(1);
      } else {
        break;
      }
    }
  }

  /**
   * Add file statuses from object summaries to the result list.
   * @param f the directory path
   * @param objects the current object listing
   * @param result the list to populate
   */
  private void addObjectSummaries(Path f, ObjectListing objects, List<FileStatus> result) {
    for (S3ObjectSummary summary : objects.getObjectSummaries()) {
      Path keyPath = keyToPath(summary.getKey()).makeQualified(uri, workingDir);
      // Skip over keys that are ourselves and old S3N _$folder$ files
      if (keyPath.equals(f) || summary.getKey().endsWith(S3N_FOLDER_SUFFIX)) {
        if (LOG.isDebugEnabled()) {
          LOG.debug("Ignoring: " + keyPath);
        }
        continue;
      }

      if (objectRepresentsDirectory(summary.getKey(), summary.getSize())) {
        result.add(new S3AFileStatus(true, true, keyPath));
        if (LOG.isDebugEnabled()) {
          LOG.debug("Adding: fd: " + keyPath);
        }
      } else {
        result.add(new S3AFileStatus(summary.getSize(),
            dateToLong(summary.getLastModified()), keyPath,
            getDefaultBlockSize(f.makeQualified(uri, workingDir))));
        if (LOG.isDebugEnabled()) {
          LOG.debug("Adding: fi: " + keyPath);
        }
      }
    }
  }

  /**
   * Add directory statuses from common prefixes to the result list.
   * @param f the directory path
   * @param objects the current object listing
   * @param result the list to populate
   */
  private void addCommonPrefixes(Path f, ObjectListing objects, List<FileStatus> result) {
    for (String prefix : objects.getCommonPrefixes()) {
      Path keyPath = keyToPath(prefix).makeQualified(uri, workingDir);
      if (keyPath.equals(f)) {
        continue;
      }
      result.add(new S3AFileStatus(true, false, keyPath));
      if (LOG.isDebugEnabled()) {
        LOG.debug("Adding: rd: " + keyPath);
      }
    }
  }

  /**
   * Create a {@link ListObjectsRequest} for the given prefix.
   * @param prefix the key prefix
   * @return the configured request
   */
  private ListObjectsRequest createListObjectsRequest(String prefix) {
    ListObjectsRequest request = new ListObjectsRequest();
    request.setBucketName(bucket);
    request.setPrefix(prefix);
    request.setMaxKeys(maxKeys);
    return request;
  }

  /**
   * Create a {@link ListObjectsRequest} for the given prefix and delimiter.
   * @param prefix the key prefix
   * @param delimiter the delimiter
   * @return the configured request
   */
  private ListObjectsRequest createListObjectsRequest(String prefix, String delimiter) {
    ListObjectsRequest request = createListObjectsRequest(prefix);
    request.setDelimiter(delimiter);
    return request;
  }

  /**
   * Set the current working directory for the given file system. All relative
   * paths will be resolved relative to it.
   *
   * @param new_dir
   */
  public void setWorkingDirectory(Path new_dir) {
    workingDir = new_dir;
  }

  /**
   * Get the current working directory for the given file system
   * @return the directory pathname
   */
  public Path getWorkingDirectory() {
    return workingDir;
  }

  /**
   * Make the given file and all non-existent parents into
   * directories. Has the semantics of Unix 'mkdir -p'.
   * Existence of the directory hierarchy is not an error.
   * @param f path to create
   * @param permission to apply to f
   */
  // TODO: If we have created an empty file at /foo/bar and we then call
  // mkdirs for /foo/bar/baz/roo what happens to the empty file /foo/bar/?
  public boolean mkdirs(Path f, FsPermission permission) throws IOException {
    if (LOG.isDebugEnabled()) {
      LOG.debug("Making directory: " + f);
    }

    try {
      FileStatus fileStatus = getFileStatus(f);
      return handleExistingPathForMkdirs(f, fileStatus);
    } catch (FileNotFoundException e) {
      ensureNoParentIsFile(f);
      createFakeDirectory(bucket, pathToKey(f));
      return true;
    }
  }

  /**
   * Handle an existing path during mkdirs.
   * @param f the path
   * @param fileStatus the existing status
   * @return true if the path is already a directory
   * @throws FileAlreadyExistsException if the path is a file
   */
  private boolean handleExistingPathForMkdirs(Path f, FileStatus fileStatus)
      throws FileAlreadyExistsException {
    if (fileStatus.isDirectory()) {
      return true;
    }
    throw new FileAlreadyExistsException("Path is a file: " + f);
  }

  /**
   * Ensure that no parent of the given path is an existing file.
   * @param f the path to check
   * @throws IOException if a parent is a file
   */
  private void ensureNoParentIsFile(Path f) throws IOException {
    Path fPart = f;
    do {
      try {
        FileStatus fileStatus = getFileStatus(fPart);
        if (fileStatus.isFile()) {
          throw new FileAlreadyExistsException(String.format(
              "Can't make directory for path '%s' since it is a file.",
              fPart));
        }
      } catch (FileNotFoundException fnfe) {
      }
      fPart = fPart.getParent();
    } while (fPart != null);
  }

  /**
   * Return a file status object that represents the path.
   * @param f The path we want information from
   * @return a FileStatus object
   * @throws java.io.FileNotFoundException when the path does not exist;
   *         IOException see specific implementation
   */
  public S3AFileStatus getFileStatus(Path f) throws IOException {
    String key = pathToKey(f);
    if (LOG.isDebugEnabled()) {
      LOG.debug("Getting path status for " + f + " (" + key + ")");
    }

    S3AFileStatus status = getFileStatusForExactKey(f, key);
    if (status != null) {
      return status;
    }

    status = getFileStatusForDirectoryKey(f, key);
    if (status != null) {
      return status;
    }

    status = getFileStatusByListing(f, key);
    if (status != null) {
      return status;
    }

    if (LOG.isDebugEnabled()) {
      LOG.debug("Not Found: " + f);
    }
    throw new FileNotFoundException("No such file or directory: " + f);
  }

  /**
   * Look up a path by its exact S3 key.
   * @param f the Hadoop path
   * @param key the S3 key
   * @return the status, or null if not found
   * @throws IOException on other failures
   */
  private S3AFileStatus getFileStatusForExactKey(Path f, String key) throws IOException {
    if (key.isEmpty()) {
      return null;
    }
    try {
      ObjectMetadata meta = s3.getObjectMetadata(bucket, key);
      statistics.incrementReadOps(1);
      return createStatusFromMetadata(f, key, meta);
    } catch (AmazonServiceException e) {
      handleS3ServiceException(e);
    } catch (AmazonClientException e) {
      handleS3ClientException(e);
    }
    return null;
  }

  /**
   * Build a {@link S3AFileStatus} from object metadata.
   * @param f the Hadoop path
   * @param key the S3 key
   * @param meta the object metadata
   * @return the file status
   */
  private S3AFileStatus createStatusFromMetadata(Path f, String key, ObjectMetadata meta) {
    if (objectRepresentsDirectory(key, meta.getContentLength())) {
      if (LOG.isDebugEnabled()) {
        LOG.debug("Found exact file: fake directory");
      }
      return new S3AFileStatus(true, true,
          f.makeQualified(uri, workingDir));
    }
    if (LOG.isDebugEnabled()) {
      LOG.debug("Found exact file: normal file");
    }
    return new S3AFileStatus(meta.getContentLength(),
        dateToLong(meta.getLastModified()),
        f.makeQualified(uri, workingDir),
        getDefaultBlockSize(f.makeQualified(uri, workingDir)));
  }

  /**
   * Look up a path by appending a trailing slash to the key.
   * @param f the Hadoop path
   * @param key the S3 key
   * @return the status, or null if not found
   * @throws IOException on other failures
   */
  private S3AFileStatus getFileStatusForDirectoryKey(Path f, String key) throws IOException {
    if (key.endsWith("/")) {
      return null;
    }
    try {
      String newKey = key + "/";
      ObjectMetadata meta = s3.getObjectMetadata(bucket, newKey);
      statistics.incrementReadOps(1);
      return createStatusFromMetadata(f, newKey, meta);
    } catch (AmazonServiceException e) {
      handleS3ServiceException(e);
    } catch (AmazonClientException e) {
      handleS3ClientException(e);
    }
    return null;
  }

  /**
   * Look up a path by listing its prefix.
   * @param f the Hadoop path
   * @param key the S3 key
   * @return the status, or null if not found
   * @throws IOException on other failures
   */
  private S3AFileStatus getFileStatusByListing(Path f, String key) throws IOException {
    try {
      String prefix = key;
      if (!prefix.isEmpty() && !prefix.endsWith("/")) {
        prefix = prefix + "/";
      }
      ListObjectsRequest request = createListObjectsRequest(prefix, "/");
      request.setMaxKeys(1);

      ObjectListing objects = s3.listObjects(request);
      statistics.incrementReadOps(1);

      if (!objects.getCommonPrefixes().isEmpty()
          || objects.getObjectSummaries().size() > 0) {
        logFoundAsDirectory(objects);
        return new S3AFileStatus(true, false,
            f.makeQualified(uri, workingDir));
      }
    } catch (AmazonServiceException e) {
      handleS3ServiceException(e);
    } catch (AmazonClientException e) {
      handleS3ClientException(e);
    }
    return null;
  }

  /**
   * Log the details of a directory found by listing.
   * @param objects the object listing
   */
  private void logFoundAsDirectory(ObjectListing objects) {
    if (LOG.isDebugEnabled()) {
      LOG.debug("Found path as directory (with /): " +
          objects.getCommonPrefixes().size() + "/" +
          objects.getObjectSummaries().size());

      for (S3ObjectSummary summary : objects.getObjectSummaries()) {
        LOG.debug("Summary: " + summary.getKey() + " " + summary.getSize());
      }
      for (String prefix : objects.getCommonPrefixes()) {
        LOG.debug("Prefix: " + prefix);
      }
    }
  }

  /**
   * Handle an AmazonServiceException, swallowing 404s and rethrowing others.
   * @param e the exception
   * @throws AmazonServiceException if the exception is not a 404
   */
  private void handleS3ServiceException(AmazonServiceException e) throws AmazonServiceException {
    if (e.getStatusCode() != 404) {
      printAmazonServiceException(e);
      throw e;
    }
  }

  /**
   * Handle an AmazonClientException by logging and rethrowing.
   * @param e the exception
   * @throws AmazonClientException always rethrown
   */
  private void handleS3ClientException(AmazonClientException e) throws AmazonClientException {
    printAmazonClientException(e);
    throw e;
  }

  /**
   * The src file is on the local disk.  Add it to FS at
   * the given dst name.
   *
   * This version doesn't need to create a temporary file to calculate the md5.
   * Sadly this doesn't seem to be used by the shell cp :(
   *
   * delSrc indicates if the source should be removed
   * @param delSrc whether to delete the src
   * @param overwrite whether to overwrite an existing file
   * @param src path
   * @param dst path
   */
  @Override
  public void copyFromLocalFile(boolean delSrc, boolean overwrite, Path src,
    Path dst) throws IOException {
    String key = pathToKey(dst);

    if (!overwrite && exists(dst)) {
      throw new IOException(dst + " already exists");
    }
    if (LOG.isDebugEnabled()) {
      LOG.debug("Copying local file from " + src + " to " + dst);
    }

    LocalFileSystem local = getLocal(getConf());
    File srcfile = local.pathToFile(src);

    PutObjectRequest putObjectRequest = createPutObjectRequest(key, srcfile);
    uploadAndWait(putObjectRequest);

    finishedWrite(key);

    if (delSrc) {
      local.delete(src, false);
    }
  }

  /**
   * Build a put object request for a local file upload.
   * @param key the S3 key
   * @param srcfile the local source file
   * @return the put object request
   */
  private PutObjectRequest createPutObjectRequest(String key, File srcfile) {
    final ObjectMetadata om = new ObjectMetadata();
    if (StringUtils.isNotBlank(serverSideEncryptionAlgorithm)) {
      om.setServerSideEncryption(serverSideEncryptionAlgorithm);
    }
    PutObjectRequest putObjectRequest = new PutObjectRequest(bucket, key, srcfile);
    putObjectRequest.setCannedAcl(cannedACL);
    putObjectRequest.setMetadata(om);
    return putObjectRequest;
  }

  /**
   * Upload a put object request and wait for completion.
   * @param putObjectRequest the request
   * @throws IOException on failure
   */
  private void uploadAndWait(PutObjectRequest putObjectRequest) throws IOException {
    Upload up = transfers.upload(putObjectRequest);
    up.addProgressListener(newPartCompletedProgressListener());
    try {
      up.waitForUploadResult();
      statistics.incrementWriteOps(1);
    } catch (InterruptedException e) {
      throw new IOException("Got interrupted, cancelling");
    }
  }

  /**
   * Build a progress listener that counts completed parts as write operations.
   * @return the progress listener
   */
  private ProgressListener newPartCompletedProgressListener() {
    return new ProgressListener() {
      public void progressChanged(ProgressEvent progressEvent) {
        if (progressEvent.getEventCode() == ProgressEvent.PART_COMPLETED_EVENT_CODE) {
          statistics.incrementWriteOps(1);
        }
      }
    };
  }

  @Override
  public void close() throws IOException {
    try {
      super.close();
    } finally {
      if (transfers != null) {
        transfers.shutdownNow(true);
        transfers = null;
      }
    }
  }

  /**
  * Override getCononicalServiceName because we don't support token in S3A
  */
  @Override
  public String getCanonicalServiceName() {
    // Does not support Token
    return null;
  }

  private void copyFile(String srcKey, String dstKey) throws IOException {
    if (LOG.isDebugEnabled()) {
      LOG.debug("copyFile " + srcKey + " -> " + dstKey);
    }

    ObjectMetadata srcom = s3.getObjectMetadata(bucket, srcKey);
    CopyObjectRequest copyObjectRequest = createCopyObjectRequest(srcKey, dstKey, srcom);
    copyAndWait(copyObjectRequest);
  }

  /**
   * Build a copy object request with the desired metadata and ACL.
   * @param srcKey the source S3 key
   * @param dstKey the destination S3 key
   * @param srcom the source object metadata
   * @return the copy object request
   */
  private CopyObjectRequest createCopyObjectRequest(String srcKey, String dstKey,
      ObjectMetadata srcom) {
    final ObjectMetadata dstom = srcom.clone();
    if (StringUtils.isNotBlank(serverSideEncryptionAlgorithm)) {
      dstom.setServerSideEncryption(serverSideEncryptionAlgorithm);
    }
    CopyObjectRequest copyObjectRequest = new CopyObjectRequest(bucket, srcKey, bucket, dstKey);
    copyObjectRequest.setCannedAccessControlList(cannedACL);
    copyObjectRequest.setNewObjectMetadata(dstom);
    return copyObjectRequest;
  }

  /**
   * Execute a copy request and wait for completion.
   * @param copyObjectRequest the copy request
   * @throws IOException on failure
   */
  private void copyAndWait(CopyObjectRequest copyObjectRequest) throws IOException {
    Copy copy = transfers.copy(copyObjectRequest);
    copy.addProgressListener(newPartCompletedProgressListener());
    try {
      copy.waitForCopyResult();
      statistics.incrementWriteOps(1);
    } catch (InterruptedException e) {
      throw new IOException("Got interrupted, cancelling");
    }
  }

  private boolean objectRepresentsDirectory(final String name, final long size) {
    return !name.isEmpty() && name.charAt(name.length() - 1) == '/' && size == 0L;
  }

  // Handles null Dates that can be returned by AWS
  private static long dateToLong(final Date date) {
    if (date == null) {
      return 0L;
    }

    return date.getTime();
  }

  public void finishedWrite(String key) throws IOException {
    deleteUnnecessaryFakeDirectories(keyToPath(key).getParent());
  }

  private void deleteUnnecessaryFakeDirectories(Path f) throws IOException {
    while (f != null && !f.isRoot()) {
      deleteFakeDirectoryIfEmpty(f);
      f = f.getParent();
    }
  }

  /**
   * Delete a fake directory marker if it represents an empty directory.
   * @param f the path to check
   * @throws IOException on non-404 failures
   */
  private void deleteFakeDirectoryIfEmpty(Path f) throws IOException {
    try {
      String key = pathToKey(f);
      if (key.isEmpty()) {
        return;
      }

      S3AFileStatus status = getFileStatus(f);

      if (status.isDirectory() && status.isEmptyDirectory()) {
        if (LOG.isDebugEnabled()) {
          LOG.debug("Deleting fake directory " + key + "/");
        }
        s3.deleteObject(bucket, key + "/");
        statistics.incrementWriteOps(1);
      }
    } catch (FileNotFoundException | AmazonServiceException e) {
    }
  }

  private void createFakeDirectory(final String bucketName, final String objectName)
      throws AmazonClientException, AmazonServiceException {
    if (!objectName.endsWith("/")) {
      createEmptyObject(bucketName, objectName + "/");
    } else {
      createEmptyObject(bucketName, objectName);
    }
  }

  // Used to create an empty file that represents an empty directory
  private void createEmptyObject(final String bucketName, final String objectName)
      throws AmazonClientException, AmazonServiceException {
    final InputStream im = new InputStream() {
      @Override
      public int read() throws IOException {
        return -1;
      }
    };

    final ObjectMetadata om = new ObjectMetadata();
    om.setContentLength(0L);
    if (StringUtils.isNotBlank(serverSideEncryptionAlgorithm)) {
      om.setServerSideEncryption(serverSideEncryptionAlgorithm);
    }
    PutObjectRequest putObjectRequest = new PutObjectRequest(bucketName, objectName, im, om);
    putObjectRequest.setCannedAcl(cannedACL);
    s3.putObject(putObjectRequest);
    statistics.incrementWriteOps(1);
  }

  /**
   * Return the number of bytes that large input files should be optimally
   * be split into to minimize i/o time.
   * @deprecated use {@link #getDefaultBlockSize(Path)} instead
   */
  @Deprecated
  public long getDefaultBlockSize() {
    // default to 32MB: large enough to minimize the impact of seeks
    return getConf().getLong(FS_S3A_BLOCK_SIZE, DEFAULT_BLOCKSIZE);
  }

  private void printAmazonServiceException(AmazonServiceException ase) {
    LOG.info("Caught an AmazonServiceException, which means your request made it " +
        "to Amazon S3, but was rejected with an error response for some reason.");
    LOG.info("Error Message: " + ase.getMessage());
    LOG.info("HTTP Status Code: " + ase.getStatusCode());
    LOG.info("AWS Error Code: " + ase.getErrorCode());
    LOG.info("Error Type: " + ase.getErrorType());
    LOG.info("Request ID: " + ase.getRequestId());
    LOG.info("Class Name: " + ase.getClass().getName());
  }

  private void printAmazonClientException(AmazonClientException ace) {
    LOG.info("Caught an AmazonClientException, which means the client encountered " +
        "a serious internal problem while trying to communicate with S3, " +
        "such as not being able to access the network.");
    LOG.info("Error Message: {}" + ace, ace);
  }
}