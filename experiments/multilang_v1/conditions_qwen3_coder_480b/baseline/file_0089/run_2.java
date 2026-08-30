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
    initUri(name);
    initWorkingDir();
    initCredentials(conf, name);
    initS3Client(conf, name);
    initTransferManager(conf);
    initBucket();
    initPurgeMultipart(conf);
    initServerSideEncryption(conf);
    setConf(conf);
  }

  private void initUri(URI name) {
    uri = URI.create(name.getScheme() + "://" + name.getAuthority());
  }

  private void initWorkingDir() {
    workingDir = new Path("/user", System.getProperty("user.name")).makeQualified(this.uri,
        this.getWorkingDirectory());
  }

  private void initCredentials(Configuration conf, URI name) {
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

    AWSCredentialsProviderChain credentials = new AWSCredentialsProviderChain(
        new BasicAWSCredentialsProvider(accessKey, secretKey),
        new InstanceProfileCredentialsProvider(),
        new AnonymousAWSCredentialsProvider()
    );
  }

  private void initS3Client(Configuration conf, URI name) {
    AWSCredentialsProviderChain credentials = buildCredentialsProviderChain(conf, name);
    ClientConfiguration awsConf = buildClientConfiguration(conf);
    s3 = new AmazonS3Client(credentials, awsConf);
    configureEndpoint(conf);
  }

  private AWSCredentialsProviderChain buildCredentialsProviderChain(Configuration conf, URI name) {
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

  private ClientConfiguration buildClientConfiguration(Configuration conf) {
    ClientConfiguration awsConf = new ClientConfiguration();
    awsConf.setMaxConnections(conf.getInt(MAXIMUM_CONNECTIONS, 
      DEFAULT_MAXIMUM_CONNECTIONS));
    boolean secureConnections = conf.getBoolean(SECURE_CONNECTIONS,
        DEFAULT_SECURE_CONNECTIONS);
    awsConf.setProtocol(secureConnections ?  Protocol.HTTPS : Protocol.HTTP);
    awsConf.setMaxErrorRetry(conf.getInt(MAX_ERROR_RETRIES, 
      DEFAULT_MAX_ERROR_RETRIES));
    awsConf.setConnectionTimeout(conf.getInt(ESTABLISH_TIMEOUT,
        DEFAULT_ESTABLISH_TIMEOUT));
    awsConf.setSocketTimeout(conf.getInt(SOCKET_TIMEOUT, 
      DEFAULT_SOCKET_TIMEOUT));
    
    configureProxy(conf, awsConf, secureConnections);
    return awsConf;
  }

  private void configureProxy(Configuration conf, ClientConfiguration awsConf, boolean secureConnections) {
    String proxyHost = conf.getTrimmed(PROXY_HOST,"");
    int proxyPort = conf.getInt(PROXY_PORT, -1);
    if (!proxyHost.isEmpty()) {
      awsConf.setProxyHost(proxyHost);
      if (proxyPort >= 0) {
        awsConf.setProxyPort(proxyPort);
      } else {
        if (secureConnections) {
          LOG.warn("Proxy host set without port. Using HTTPS default 443");
          awsConf.setProxyPort(443);
        } else {
          LOG.warn("Proxy host set without port. Using HTTP default 80");
          awsConf.setProxyPort(80);
        }
      }
      String proxyUsername = conf.getTrimmed(PROXY_USERNAME);
      String proxyPassword = conf.getTrimmed(PROXY_PASSWORD);
      validateProxyCredentials(proxyUsername, proxyPassword);
      awsConf.setProxyUsername(proxyUsername);
      awsConf.setProxyPassword(proxyPassword);
      awsConf.setProxyDomain(conf.getTrimmed(PROXY_DOMAIN));
      awsConf.setProxyWorkstation(conf.getTrimmed(PROXY_WORKSTATION));
      logProxyConfiguration(awsConf);
    } else if (proxyPort >= 0) {
      String msg = "Proxy error: " + PROXY_PORT + " set without " + PROXY_HOST;
      LOG.error(msg);
      throw new IllegalArgumentException(msg);
    }
  }

  private void validateProxyCredentials(String proxyUsername, String proxyPassword) {
    if ((proxyUsername == null) != (proxyPassword == null)) {
      String msg = "Proxy error: " + PROXY_USERNAME + " or " +
          PROXY_PASSWORD + " set without the other.";
      LOG.error(msg);
      throw new IllegalArgumentException(msg);
    }
  }

  private void logProxyConfiguration(ClientConfiguration awsConf) {
    if (LOG.isDebugEnabled()) {
      LOG.debug("Using proxy server {}:{} as user {} with password {} on " +
              "domain {} as workstation {}", awsConf.getProxyHost(),
          awsConf.getProxyPort(), String.valueOf(awsConf.getProxyUsername()),
          awsConf.getProxyPassword(), awsConf.getProxyDomain(),
          awsConf.getProxyWorkstation());
    }
  }

  private void configureEndpoint(Configuration conf) {
    String endPoint = conf.getTrimmed(ENDPOINT,"");
    if (!endPoint.isEmpty()) {
      try {
        s3.setEndpoint(endPoint);
      } catch (IllegalArgumentException e) {
        String msg = "Incorrect endpoint: "  + e.getMessage();
        LOG.error(msg);
        throw new IllegalArgumentException(msg, e);
      }
    }
  }

  private void initTransferManager(Configuration conf) {
    maxKeys = conf.getInt(MAX_PAGING_KEYS, DEFAULT_MAX_PAGING_KEYS);
    partSize = conf.getLong(MULTIPART_SIZE, DEFAULT_MULTIPART_SIZE);
    multiPartThreshold = conf.getInt(MIN_MULTIPART_THRESHOLD,
      DEFAULT_MIN_MULTIPART_THRESHOLD);

    validatePartSize();
    validateMultiPartThreshold();

    int maxThreads = conf.getInt(MAX_THREADS, DEFAULT_MAX_THREADS);
    int coreThreads = conf.getInt(CORE_THREADS, DEFAULT_CORE_THREADS);
    configureThreadPoolSizes(maxThreads, coreThreads);
    
    long keepAliveTime = conf.getLong(KEEPALIVE_TIME, DEFAULT_KEEPALIVE_TIME);
    LinkedBlockingQueue<Runnable> workQueue =
      new LinkedBlockingQueue<>(maxThreads *
        conf.getInt(MAX_TOTAL_TASKS, DEFAULT_MAX_TOTAL_TASKS));
    threadPoolExecutor = new ThreadPoolExecutor(
        coreThreads,
        maxThreads,
        keepAliveTime,
        TimeUnit.SECONDS,
        workQueue,
        newDaemonThreadFactory("s3a-transfer-shared-"));
    threadPoolExecutor.allowCoreThreadTimeOut(true);

    TransferManagerConfiguration transferConfiguration = new TransferManagerConfiguration();
    transferConfiguration.setMinimumUploadPartSize(partSize);
    transferConfiguration.setMultipartUploadThreshold(multiPartThreshold);

    transfers = new TransferManager(s3, threadPoolExecutor);
    transfers.setConfiguration(transferConfiguration);
  }

  private void validatePartSize() {
    if (partSize < 5 * 1024 * 1024) {
      LOG.error(MULTIPART_SIZE + " must be at least 5 MB");
      partSize = 5 * 1024 * 1024;
    }
  }

  private void validateMultiPartThreshold() {
    if (multiPartThreshold < 5 * 1024 * 1024) {
      LOG.error(MIN_MULTIPART_THRESHOLD + " must be at least 5 MB");
      multiPartThreshold = 5 * 1024 * 1024;
    }
  }

  private void configureThreadPoolSizes(int maxThreads, int coreThreads) {
    if (maxThreads == 0) {
      maxThreads = Runtime.getRuntime().availableProcessors() * 8;
    }
    if (coreThreads == 0) {
      coreThreads = Runtime.getRuntime().availableProcessors() * 8;
    }
  }

  private void initBucket() throws IOException {
    String cannedACLName = conf.get(CANNED_ACL, DEFAULT_CANNED_ACL);
    if (!cannedACLName.isEmpty()) {
      cannedACL = CannedAccessControlList.valueOf(cannedACLName);
    } else {
      cannedACL = null;
    }

    if (!s3.doesBucketExist(bucket)) {
      throw new IOException("Bucket " + bucket + " does not exist");
    }
  }

  private void initPurgeMultipart(Configuration conf) throws IOException {
    boolean purgeExistingMultipart = conf.getBoolean(PURGE_EXISTING_MULTIPART, 
      DEFAULT_PURGE_EXISTING_MULTIPART);
    long purgeExistingMultipartAge = conf.getLong(PURGE_EXISTING_MULTIPART_AGE, 
      DEFAULT_PURGE_EXISTING_MULTIPART_AGE);

    if (purgeExistingMultipart) {
      Date purgeBefore = new Date(new Date().getTime() - purgeExistingMultipartAge*1000);
      transfers.abortMultipartUploads(bucket, purgeBefore);
    }
  }

  private void initServerSideEncryption(Configuration conf) {
    serverSideEncryptionAlgorithm = conf.get(SERVER_SIDE_ENCRYPTION_ALGORITHM);
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
      return new FSDataOutputStream(new S3AFastOutputStream(s3, this, bucket,
          key, progress, statistics, cannedACL,
          serverSideEncryptionAlgorithm, partSize, (long)multiPartThreshold,
          threadPoolExecutor), statistics);
    }
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
    if (LOG.isDebugEnabled()) {
      LOG.debug("Rename path {} to {}", src, dst);
    }

    String srcKey = pathToKey(src);
    String dstKey = pathToKey(dst);

    if (isInvalidRename(srcKey, dstKey)) {
      return false;
    }

    S3AFileStatus srcStatus = getSourceStatus(src);
    if (srcStatus == null) {
      return false;
    }

    if (srcKey.equals(dstKey)) {
      return handleSameSourceDestination(srcStatus);
    }

    S3AFileStatus dstStatus = getDestinationStatus(dst);
    
    if (!validateRenameConditions(srcStatus, dstStatus, dst)) {
      return false;
    }

    return performRename(src, dst, srcKey, dstKey, srcStatus, dstStatus);
  }

  private boolean isInvalidRename(String srcKey, String dstKey) {
    if (srcKey.isEmpty() || dstKey.isEmpty()) {
      if (LOG.isDebugEnabled()) {
        LOG.debug("rename: src or dst are empty");
      }
      return true;
    }
    return false;
  }

  private S3AFileStatus getSourceStatus(Path src) {
    try {
      return getFileStatus(src);
    } catch (FileNotFoundException e) {
      LOG.error("rename: src not found {}", src);
      return null;
    }
  }

  private boolean handleSameSourceDestination(S3AFileStatus srcStatus) {
    if (LOG.isDebugEnabled()) {
      LOG.debug("rename: src and dst refer to the same file or directory");
    }
    return srcStatus.isFile();
  }

  private S3AFileStatus getDestinationStatus(Path dst) {
    try {
      return getFileStatus(dst);
    } catch (FileNotFoundException e) {
      return null;
    }
  }

  private boolean validateRenameConditions(S3AFileStatus srcStatus, S3AFileStatus dstStatus, Path dst) {
    if (dstStatus != null) {
      if (srcStatus.isDirectory() && dstStatus.isFile()) {
        if (LOG.isDebugEnabled()) {
          LOG.debug("rename: src is a directory and dst is a file");
        }
        return false;
      }

      if (dstStatus.isDirectory() && !dstStatus.isEmptyDirectory()) {
        return false;
      }
    } else {
      // Parent must exist
      Path parent = dst.getParent();
      if (!pathToKey(parent).isEmpty()) {
        return validateParentExists(parent);
      }
    }
    return true;
  }

  private boolean validateParentExists(Path parent) {
    try {
      S3AFileStatus dstParentStatus = getFileStatus(parent);
      if (!dstParentStatus.isDirectory()) {
        return false;
      }
    } catch (FileNotFoundException e2) {
      return false;
    }
    return true;
  }

  private boolean performRename(Path src, Path dst, String srcKey, String dstKey, 
                               S3AFileStatus srcStatus, S3AFileStatus dstStatus) throws IOException {
    if (srcStatus.isFile()) {
      return performFileRename(srcKey, dstKey, dstStatus);
    } else {
      return performDirectoryRename(src, dst, srcKey, dstKey, dstStatus);
    }
  }

  private boolean performFileRename(String srcKey, String dstKey, S3AFileStatus dstStatus) throws IOException {
    if (LOG.isDebugEnabled()) {
      LOG.debug("rename: renaming file " + srcKey + " to " + dstKey);
    }
    if (dstStatus != null && dstStatus.isDirectory()) {
      String newDstKey = buildDirectoryDestinationKey(dstKey, srcKey);
      copyFile(srcKey, newDstKey);
    } else {
      copyFile(srcKey, dstKey);
    }
    delete(new Path("/" + srcKey), false);
    return true;
  }

  private String buildDirectoryDestinationKey(String dstKey, String srcKey) {
    String newDstKey = dstKey;
    if (!newDstKey.endsWith("/")) {
      newDstKey = newDstKey + "/";
    }
    String filename = srcKey.substring(srcKey.lastIndexOf("/") + 1);
    return newDstKey + filename;
  }

  private boolean performDirectoryRename(Path src, Path dst, String srcKey, String dstKey, 
                                       S3AFileStatus dstStatus) throws IOException {
    if (LOG.isDebugEnabled()) {
      LOG.debug("rename: renaming directory " + src + " to " + dst);
    }

    String finalDstKey = ensureTrailingSlash(dstKey);
    String finalSrcKey = ensureTrailingSlash(srcKey);

    if (isSubdirectoryRename(finalDstKey, finalSrcKey)) {
      return false;
    }

    List<DeleteObjectsRequest.KeyVersion> keysToDelete = prepareInitialKeysToDelete(dstStatus, finalDstKey);
    
    return processDirectoryRename(finalSrcKey, finalDstKey, keysToDelete);
  }

  private String ensureTrailingSlash(String key) {
    return key.endsWith("/") ? key : key + "/";
  }

  private boolean isSubdirectoryRename(String dstKey, String srcKey) {
    if (dstKey.startsWith(srcKey)) {
      if (LOG.isDebugEnabled()) {
        LOG.debug("cannot rename a directory to a subdirectory of self");
      }
      return true;
    }
    return false;
  }

  private List<DeleteObjectsRequest.KeyVersion> prepareInitialKeysToDelete(S3AFileStatus dstStatus, String dstKey) {
    List<DeleteObjectsRequest.KeyVersion> keysToDelete = new ArrayList<>();
    if (dstStatus != null && dstStatus.isEmptyDirectory()) {
      keysToDelete.add(new DeleteObjectsRequest.KeyVersion(dstKey));
    }
    return keysToDelete;
  }

  private boolean processDirectoryRename(String srcKey, String dstKey, 
                                       List<DeleteObjectsRequest.KeyVersion> keysToDelete) throws IOException {
    ListObjectsRequest request = new ListObjectsRequest();
    request.setBucketName(bucket);
    request.setPrefix(srcKey);
    request.setMaxKeys(maxKeys);

    ObjectListing objects = s3.listObjects(request);
    statistics.incrementReadOps(1);

    while (true) {
      processObjectBatch(objects, srcKey, dstKey, keysToDelete);
      
      if (objects.isTruncated()) {
        objects = s3.listNextBatchOfObjects(objects);
        statistics.incrementReadOps(1);
      } else {
        cleanupRemainingKeys(keysToDelete);
        break;
      }
    }

    return true;
  }

  private void processObjectBatch(ObjectListing objects, String srcKey, String dstKey, 
                                 List<DeleteObjectsRequest.KeyVersion> keysToDelete) throws IOException {
    for (S3ObjectSummary summary : objects.getObjectSummaries()) {
      keysToDelete.add(new DeleteObjectsRequest.KeyVersion(summary.getKey()));
      String newDstKey = dstKey + summary.getKey().substring(srcKey.length());
      copyFile(summary.getKey(), newDstKey);

      if (keysToDelete.size() == MAX_ENTRIES_TO_DELETE) {
        deleteBatchOfObjects(keysToDelete);
        keysToDelete.clear();
      }
    }
  }

  private void deleteBatchOfObjects(List<DeleteObjectsRequest.KeyVersion> keysToDelete) {
    DeleteObjectsRequest deleteRequest = new DeleteObjectsRequest(bucket).withKeys(keysToDelete);
    s3.deleteObjects(deleteRequest);
    statistics.incrementWriteOps(1);
  }

  private void cleanupRemainingKeys(List<DeleteObjectsRequest.KeyVersion> keysToDelete) {
    if (keysToDelete.size() > 0) {
      deleteBatchOfObjects(keysToDelete);
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
    if (LOG.isDebugEnabled()) {
      LOG.debug("Delete path " + f + " - recursive " + recursive);
    }
    
    S3AFileStatus status = getFileStatusSafe(f);
    if (status == null) {
      return false;
    }

    String key = pathToKey(f);
    boolean result = performDelete(status, key, recursive);
    
    if (result) {
      createFakeDirectoryIfNecessary(f.getParent());
    }
    
    return result;
  }

  private S3AFileStatus getFileStatusSafe(Path f) {
    try {
      return getFileStatus(f);
    } catch (FileNotFoundException e) {
      if (LOG.isDebugEnabled()) {
        LOG.debug("Couldn't delete " + f + " - does not exist");
      }
      return null;
    }
  }

  private boolean performDelete(S3AFileStatus status, String key, boolean recursive) throws IOException {
    if (status.isDirectory()) {
      return deleteDirectory(key, recursive, status);
    } else {
      return deleteFile(key);
    }
  }

  private boolean deleteDirectory(String key, boolean recursive, S3AFileStatus status) throws IOException {
    if (LOG.isDebugEnabled()) {
      LOG.debug("delete: Path is a directory");
    }

    if (!recursive && !status.isEmptyDirectory()) {
      throw new IOException("Path is a folder: " + key + " and it is not an empty directory");
    }

    String directoryKey = ensureTrailingSlashForDirectory(key);
    
    if (directoryKey.equals("/")) {
      LOG.info("s3a cannot delete the root directory");
      return false;
    }

    return deleteDirectoryContents(directoryKey, status);
  }

  private String ensureTrailingSlashForDirectory(String key) {
    return key.endsWith("/") ? key : key + "/";
  }

  private boolean deleteDirectoryContents(String key, S3AFileStatus status) throws IOException {
    if (status.isEmptyDirectory()) {
      return deleteEmptyDirectory(key);
    } else {
      return deleteNonEmptyDirectory(key);
    }
  }

  private boolean deleteEmptyDirectory(String key) throws IOException {
    if (LOG.isDebugEnabled()) {
      LOG.debug("Deleting fake empty directory");
    }
    s3.deleteObject(bucket, key);
    statistics.incrementWriteOps(1);
    return true;
  }

  private boolean deleteNonEmptyDirectory(String key) throws IOException {
    if (LOG.isDebugEnabled()) {
      LOG.debug("Getting objects for directory prefix " + key + " to delete");
    }

    ListObjectsRequest request = new ListObjectsRequest();
    request.setBucketName(bucket);
    request.setPrefix(key);
    request.setMaxKeys(maxKeys);

    return processDirectoryDeletion(request);
  }

  private boolean processDirectoryDeletion(ListObjectsRequest request) throws IOException {
    List<DeleteObjectsRequest.KeyVersion> keys = new ArrayList<>();
    ObjectListing objects = s3.listObjects(request);
    statistics.incrementReadOps(1);
    
    while (true) {
      collectObjectsToDelete(objects, keys);
      
      if (objects.isTruncated()) {
        objects = s3.listNextBatchOfObjects(objects);
        statistics.incrementReadOps(1);
      } else {
        cleanupRemainingDeletionKeys(keys);
        break;
      }
    }
    
    return true;
  }

  private void collectObjectsToDelete(ObjectListing objects, List<DeleteObjectsRequest.KeyVersion> keys) {
    for (S3ObjectSummary summary : objects.getObjectSummaries()) {
      keys.add(new DeleteObjectsRequest.KeyVersion(summary.getKey()));
      if (LOG.isDebugEnabled()) {
        LOG.debug("Got object to delete " + summary.getKey());
      }

      if (keys.size() == MAX_ENTRIES_TO_DELETE) {
        deleteBatchOfObjects(keys);
        keys.clear();
      }
    }
  }

  private void cleanupRemainingDeletionKeys(List<DeleteObjectsRequest.KeyVersion> keys) {
    if (!keys.isEmpty()) {
      deleteBatchOfObjects(keys);
    }
  }

  private boolean deleteFile(String key) throws IOException {
    if (LOG.isDebugEnabled()) {
      LOG.debug("delete: Path is a file");
    }
    s3.deleteObject(bucket, key);
    statistics.incrementWriteOps(1);
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
    final FileStatus fileStatus =  getFileStatus(f);

    if (fileStatus.isDirectory()) {
      processDirectoryListing(key, result, f);
    } else {
      if (LOG.isDebugEnabled()) {
        LOG.debug("Adding: rd (not a dir): " + f);
      }
      result.add(fileStatus);
    }

    return result.toArray(new FileStatus[result.size()]);
  }

  private void processDirectoryListing(String key, List<FileStatus> result, Path f) throws IOException {
    String directoryKey = key.isEmpty() ? "" : key + "/";

    ListObjectsRequest request = new ListObjectsRequest();
    request.setBucketName(bucket);
    request.setPrefix(directoryKey);
    request.setDelimiter("/");
    request.setMaxKeys(maxKeys);

    if (LOG.isDebugEnabled()) {
      LOG.debug("listStatus: doing listObjects for directory " + directoryKey);
    }

    ObjectListing objects = s3.listObjects(request);
    statistics.incrementReadOps(1);

    processObjectListing(objects, result, f, directoryKey);
  }

  private void processObjectListing(ObjectListing objects, List<FileStatus> result, Path f, String directoryKey) throws IOException {
    while (true) {
      processCurrentBatch(objects, result, f, directoryKey);
      
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

  private void processCurrentBatch(ObjectListing objects, List<FileStatus> result, Path f, String directoryKey) {
    processObjectSummaries(objects.getObjectSummaries(), result, f);
    processCommonPrefixes(objects.getCommonPrefixes(), result, f);
  }

  private void processObjectSummaries(List<S3ObjectSummary> summaries, List<FileStatus> result, Path f) {
    for (S3ObjectSummary summary : summaries) {
      Path keyPath = keyToPath(summary.getKey()).makeQualified(uri, workingDir);
      if (shouldIgnoreObject(keyPath, f, summary)) {
        continue;
      }

      addFileStatus(result, summary, keyPath);
    }
  }

  private boolean shouldIgnoreObject(Path keyPath, Path f, S3ObjectSummary summary) {
    return keyPath.equals(f) || summary.getKey().endsWith(S3N_FOLDER_SUFFIX);
  }

  private void addFileStatus(List<FileStatus> result, S3ObjectSummary summary, Path keyPath) {
    if (objectRepresentsDirectory(summary.getKey(), summary.getSize())) {
      result.add(new S3AFileStatus(true, true, keyPath));
      if (LOG.isDebugEnabled()) {
        LOG.debug("Adding: fd: " + keyPath);
      }
    } else {
      result.add(new S3AFileStatus(summary.getSize(), 
          dateToLong(summary.getLastModified()), keyPath,
          getDefaultBlockSize(keyPath.makeQualified(uri, workingDir))));
      if (LOG.isDebugEnabled()) {
        LOG.debug("Adding: fi: " + keyPath);
      }
    }
  }

  private void processCommonPrefixes(List<String> prefixes, List<FileStatus> result, Path f) {
    for (String prefix : prefixes) {
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

    return performMkdirs(f);
  }

  private boolean performMkdirs(Path f) throws IOException {
    try {
      FileStatus fileStatus = getFileStatus(f);
      return handleExistingPath(fileStatus);
    } catch (FileNotFoundException e) {
      return handleMissingPath(f);
    }
  }

  private boolean handleExistingPath(FileStatus fileStatus) throws IOException {
    if (fileStatus.isDirectory()) {
      return true;
    } else {
      throw new FileAlreadyExistsException("Path is a file: " + fileStatus.getPath());
    }
  }

  private boolean handleMissingPath(Path f) throws IOException {
    if (!validateParentPaths(f)) {
      return false;
    }

    String key = pathToKey(f);
    createFakeDirectory(bucket, key);
    return true;
  }

  private boolean validateParentPaths(Path f) throws IOException {
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
    return true;
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

    if (!key.isEmpty()) {
      S3AFileStatus exactMatchStatus = checkExactMatch(key, f);
      if (exactMatchStatus != null) {
        return exactMatchStatus;
      }
      
      S3AFileStatus slashMatchStatus = checkSlashMatch(key, f);
      if (slashMatchStatus != null) {
        return slashMatchStatus;
      }
    }

    return checkDirectoryMatch(key, f);
  }

  private S3AFileStatus checkExactMatch(String key, Path f) throws IOException {
    try {
      ObjectMetadata meta = s3.getObjectMetadata(bucket, key);
      statistics.incrementReadOps(1);
      return createFileStatusFromMetadata(key, meta, f, true);
    } catch (AmazonServiceException e) {
      if (e.getStatusCode() != 404) {
        printAmazonServiceException(e);
        throw e;
      }
    } catch (AmazonClientException e) {
      printAmazonClientException(e);
      throw e;
    }
    return null;
  }

  private S3AFileStatus checkSlashMatch(String key, Path f) throws IOException {
    if (!key.endsWith("/")) {
      try {
        String newKey = key + "/";
        ObjectMetadata meta = s3.getObjectMetadata(bucket, newKey);
        statistics.incrementReadOps(1);
        return createFileStatusFromMetadata(newKey, meta, f, false);
      } catch (AmazonServiceException e) {
        if (e.getStatusCode() != 404) {
          printAmazonServiceException(e);
          throw e;
        }
      } catch (AmazonClientException e) {
        printAmazonClientException(e);
        throw e;
      }
    }
    return null;
  }

  private S3AFileStatus createFileStatusFromMetadata(String key, ObjectMetadata meta, Path f, boolean isExact) throws IOException {
    if (objectRepresentsDirectory(key, meta.getContentLength())) {
      if (LOG.isDebugEnabled()) {
        LOG.debug("Found exact file: fake directory");
      }
      return new S3AFileStatus(true, true, f.makeQualified(uri, workingDir));
    } else {
      if (LOG.isDebugEnabled()) {
        LOG.debug("Found exact file: normal file");
      }
      return new S3AFileStatus(meta.getContentLength(),
          dateToLong(meta.getLastModified()),
          f.makeQualified(uri, workingDir),
          getDefaultBlockSize(f.makeQualified(uri, workingDir)));
    }
  }

  private S3AFileStatus checkDirectoryMatch(String key, Path f) throws IOException {
    try {
      String directoryKey = key.isEmpty() ? "" : (key.endsWith("/") ? key : key + "/");
      ListObjectsRequest request = new ListObjectsRequest();
      request.setBucketName(bucket);
      request.setPrefix(directoryKey);
      request.setDelimiter("/");
      request.setMaxKeys(1);

      ObjectListing objects = s3.listObjects(request);
      statistics.incrementReadOps(1);

      if (!objects.getCommonPrefixes().isEmpty() || objects.getObjectSummaries().size() > 0) {
        logDirectoryMatchDetails(objects);
        return new S3AFileStatus(true, false, f.makeQualified(uri, workingDir));
      }
    } catch (AmazonServiceException e) {
      if (e.getStatusCode() != 404) {
        printAmazonServiceException(e);
        throw e;
      }
    } catch (AmazonClientException e) {
      printAmazonClientException(e);
      throw e;
    }

    if (LOG.isDebugEnabled()) {
      LOG.debug("Not Found: " + f);
    }
    throw new FileNotFoundException("No such file or directory: " + f);
  }

  private void logDirectoryMatchDetails(ObjectListing objects) {
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

    PutObjectRequest putObjectRequest = buildPutObjectRequest(key, srcfile);
    ProgressListener progressListener = createProgressListener();

    Upload up = transfers.upload(putObjectRequest);
    up.addProgressListener(progressListener);
    waitForUploadCompletion(up);

    finishedWrite(key);

    if (delSrc) {
      local.delete(src, false);
    }
  }

  private PutObjectRequest buildPutObjectRequest(String key, File srcfile) {
    final ObjectMetadata om = new ObjectMetadata();
    if (StringUtils.isNotBlank(serverSideEncryptionAlgorithm)) {
      om.setServerSideEncryption(serverSideEncryptionAlgorithm);
    }
    PutObjectRequest putObjectRequest = new PutObjectRequest(bucket, key, srcfile);
    putObjectRequest.setCannedAcl(cannedACL);
    putObjectRequest.setMetadata(om);
    return putObjectRequest;
  }

  private ProgressListener createProgressListener() {
    return new ProgressListener() {
      public void progressChanged(ProgressEvent progressEvent) {
        switch (progressEvent.getEventCode()) {
          case ProgressEvent.PART_COMPLETED_EVENT_CODE:
            statistics.incrementWriteOps(1);
            break;
          default:
            break;
        }
      }
    };
  }

  private void waitForUploadCompletion(Upload up) throws IOException {
    try {
      up.waitForUploadResult();
      statistics.incrementWriteOps(1);
    } catch (InterruptedException e) {
      throw new IOException("Got interrupted, cancelling");
    }
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
    final ObjectMetadata dstom = srcom.clone();
    if (StringUtils.isNotBlank(serverSideEncryptionAlgorithm)) {
      dstom.setServerSideEncryption(serverSideEncryptionAlgorithm);
    }
    CopyObjectRequest copyObjectRequest = new CopyObjectRequest(bucket, srcKey, bucket, dstKey);
    copyObjectRequest.setCannedAccessControlList(cannedACL);
    copyObjectRequest.setNewObjectMetadata(dstom);

    ProgressListener progressListener = new ProgressListener() {
      public void progressChanged(ProgressEvent progressEvent) {
        switch (progressEvent.getEventCode()) {
          case ProgressEvent.PART_COMPLETED_EVENT_CODE:
            statistics.incrementWriteOps(1);
            break;
          default:
            break;
        }
      }
    };

    Copy copy = transfers.copy(copyObjectRequest);
    copy.addProgressListener(progressListener);
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
    while (true) {
      try {
        String key = pathToKey(f);
        if (key.isEmpty()) {
          break;
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

      if (f.isRoot()) {
        break;
      }

      f = f.getParent();
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