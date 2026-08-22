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
import java.util.Objects;
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
    AWSCredentialsProviderChain credentials = initCredentials(name, conf);
    bucket = name.getHost();

    ClientConfiguration awsConf = initClientConfiguration(conf);
    s3 = new AmazonS3Client(credentials, awsConf);
    initEndpoint(conf);

    initMultipartSettings(conf);
    initTransferManager(conf);
    initCannedACL(conf);

    verifyBucket();

    purgeExistingMultipartUploads(conf);

    serverSideEncryptionAlgorithm = conf.get(SERVER_SIDE_ENCRYPTION_ALGORITHM);

    setConf(conf);
  }

  private void initUriAndWorkingDir(URI name) {
    uri = URI.create(name.getScheme() + "://" + name.getAuthority());
    workingDir = new Path("/user", System.getProperty("user.name")).makeQualified(this.uri,
        this.getWorkingDirectory());
  }

  private AWSCredentialsProviderChain initCredentials(URI name, Configuration conf) {
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

  private ClientConfiguration initClientConfiguration(Configuration conf) {
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

    applyProxySettings(awsConf, conf, secureConnections);
    return awsConf;
  }

  private void applyProxySettings(ClientConfiguration awsConf, Configuration conf,
      boolean secureConnections) {
    String proxyHost = conf.getTrimmed(PROXY_HOST,"");
    int proxyPort = conf.getInt(PROXY_PORT, -1);
    if (!proxyHost.isEmpty()) {
      awsConf.setProxyHost(proxyHost);
      if (proxyPort >= 0) {
        awsConf.setProxyPort(proxyPort);
      } else {
        setDefaultProxyPort(awsConf, secureConnections);
      }
      applyProxyAuthentication(awsConf, conf);
      if (LOG.isDebugEnabled()) {
        LOG.debug("Using proxy server {}:{} as user {} with password {} on " +
                "domain {} as workstation {}", awsConf.getProxyHost(),
            awsConf.getProxyPort(), String.valueOf(awsConf.getProxyUsername()),
            awsConf.getProxyPassword(), awsConf.getProxyDomain(),
            awsConf.getProxyWorkstation());
      }
    } else if (proxyPort >= 0) {
      String msg = "Proxy error: " + PROXY_PORT + " set without " + PROXY_HOST;
      LOG.error(msg);
      throw new IllegalArgumentException(msg);
    }
  }

  private void setDefaultProxyPort(ClientConfiguration awsConf, boolean secureConnections) {
    if (secureConnections) {
      LOG.warn("Proxy host set without port. Using HTTPS default 443");
      awsConf.setProxyPort(443);
    } else {
      LOG.warn("Proxy host set without port. Using HTTP default 80");
      awsConf.setProxyPort(80);
    }
  }

  private void applyProxyAuthentication(ClientConfiguration awsConf, Configuration conf) {
    String proxyUsername = conf.getTrimmed(PROXY_USERNAME);
    String proxyPassword = conf.getTrimmed(PROXY_PASSWORD);
    if ((proxyUsername == null) != (proxyPassword == null)) {
      String msg = "Proxy error: " + PROXY_USERNAME + " or " +
          PROXY_PASSWORD + " set without the other.";
      LOG.error(msg);
      throw new IllegalArgumentException(msg);
    }
    awsConf.setProxyUsername(proxyUsername);
    awsConf.setProxyPassword(proxyPassword);
    awsConf.setProxyDomain(conf.getTrimmed(PROXY_DOMAIN));
    awsConf.setProxyWorkstation(conf.getTrimmed(PROXY_WORKSTATION));
  }

  private void initEndpoint(Configuration conf) {
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

  private void initMultipartSettings(Configuration conf) {
    maxKeys = conf.getInt(MAX_PAGING_KEYS, DEFAULT_MAX_PAGING_KEYS);
    partSize = conf.getLong(MULTIPART_SIZE, DEFAULT_MULTIPART_SIZE);
    multiPartThreshold = conf.getInt(MIN_MULTIPART_THRESHOLD,
      DEFAULT_MIN_MULTIPART_THRESHOLD);

    if (partSize < 5 * 1024 * 1024) {
      LOG.error(MULTIPART_SIZE + " must be at least 5 MB");
      partSize = 5 * 1024 * 1024;
    }

    if (multiPartThreshold < 5 * 1024 * 1024) {
      LOG.error(MIN_MULTIPART_THRESHOLD + " must be at least 5 MB");
      multiPartThreshold = 5 * 1024 * 1024;
    }
  }

  private void initTransferManager(Configuration conf) {
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

  private void initCannedACL(Configuration conf) {
    String cannedACLName = conf.get(CANNED_ACL, DEFAULT_CANNED_ACL);
    if (!cannedACLName.isEmpty()) {
      cannedACL = CannedAccessControlList.valueOf(cannedACLName);
    } else {
      cannedACL = null;
    }
  }

  private void verifyBucket() throws IOException {
    if (!s3.doesBucketExist(bucket)) {
      throw new IOException("Bucket " + bucket + " does not exist");
    }
  }

  private void purgeExistingMultipartUploads(Configuration conf) {
    boolean purgeExistingMultipart = conf.getBoolean(PURGE_EXISTING_MULTIPART,
      DEFAULT_PURGE_EXISTING_MULTIPART);
    long purgeExistingMultipartAge = conf.getLong(PURGE_EXISTING_MULTIPART_AGE,
      DEFAULT_PURGE_EXISTING_MULTIPART_AGE);

    if (purgeExistingMultipart) {
      Date purgeBefore = new Date(new Date().getTime() - purgeExistingMultipartAge*1000);
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

    if (srcKey.isEmpty() || dstKey.isEmpty()) {
      debug("rename: src or dst are empty");
      return false;
    }

    S3AFileStatus srcStatus = getStatusOrNull(src);
    if (srcStatus == null) {
      LOG.error("rename: src not found {}", src);
      return false;
    }

    if (srcKey.equals(dstKey)) {
      debug("rename: src and dst refer to the same file or directory");
      return srcStatus.isFile();
    }

    S3AFileStatus dstStatus = getStatusOrNull(dst);
    if (!canRename(src, dst, srcStatus, dstStatus)) {
      return false;
    }

    if (srcStatus.isFile()) {
      renameFile(src, srcKey, dstKey, dstStatus);
    } else {
      if (!renameDirectory(srcKey, dstKey, dstStatus)) {
        return false;
      }
    }

    if (!Objects.equals(src.getParent(), dst.getParent())) {
      deleteUnnecessaryFakeDirectories(dst.getParent());
      createFakeDirectoryIfNecessary(src.getParent());
    }
    return true;
  }

  private S3AFileStatus getStatusOrNull(Path f) {
    try {
      return getFileStatus(f);
    } catch (FileNotFoundException e) {
      return null;
    } catch (IOException e) {
      return null;
    }
  }

  private boolean canRename(Path src, Path dst, S3AFileStatus srcStatus,
      S3AFileStatus dstStatus) throws IOException {
    if (srcStatus.isDirectory() && dstStatus != null && dstStatus.isFile()) {
      debug("rename: src is a directory and dst is a file");
      return false;
    }

    if (dstStatus != null && dstStatus.isDirectory() && !dstStatus.isEmptyDirectory()) {
      return false;
    }

    if (dstStatus == null && !isValidDestinationParent(dst)) {
      return false;
    }

    return true;
  }

  private boolean isValidDestinationParent(Path dst) throws IOException {
    Path parent = dst.getParent();
    String parentKey = pathToKey(parent);
    if (parentKey.isEmpty()) {
      return true;
    }

    S3AFileStatus dstParentStatus = getStatusOrNull(parent);
    return dstParentStatus != null && dstParentStatus.isDirectory();
  }

  private void renameFile(Path src, String srcKey, String dstKey,
      S3AFileStatus dstStatus) throws IOException {
    debug("rename: renaming file " + src + " to " + dstKey);
    String targetKey = dstKey;
    if (dstStatus != null && dstStatus.isDirectory()) {
      targetKey = ensureTrailingSlash(dstKey) + filename(srcKey, src.getParent());
    }
    copyFile(srcKey, targetKey);
    delete(src, false);
  }

  private boolean renameDirectory(String srcKey, String dstKey,
      S3AFileStatus dstStatus) throws IOException {
    debug("rename: renaming directory " + srcKey + " to " + dstKey);

    String srcDirKey = ensureTrailingSlash(srcKey);
    String dstDirKey = ensureTrailingSlash(dstKey);

    if (dstDirKey.startsWith(srcDirKey)) {
      debug("cannot rename a directory to a subdirectory of self");
      return false;
    }

    List<DeleteObjectsRequest.KeyVersion> keysToDelete = new ArrayList<>();
    if (dstStatus != null && dstStatus.isEmptyDirectory()) {
      keysToDelete.add(new DeleteObjectsRequest.KeyVersion(dstDirKey));
    }

    ListObjectsRequest request = new ListObjectsRequest();
    request.setBucketName(bucket);
    request.setPrefix(srcDirKey);
    request.setMaxKeys(maxKeys);

    ObjectListing objects = s3.listObjects(request);
    statistics.incrementReadOps(1);

    while (true) {
      for (S3ObjectSummary summary : objects.getObjectSummaries()) {
        keysToDelete.add(new DeleteObjectsRequest.KeyVersion(summary.getKey()));
        String newDstKey = dstDirKey + summary.getKey().substring(srcDirKey.length());
        copyFile(summary.getKey(), newDstKey);

        if (keysToDelete.size() == MAX_ENTRIES_TO_DELETE) {
          deleteKeys(keysToDelete);
        }
      }

      if (objects.isTruncated()) {
        objects = s3.listNextBatchOfObjects(objects);
        statistics.incrementReadOps(1);
      } else {
        deleteKeys(keysToDelete);
        break;
      }
    }
    return true;
  }

  private String ensureTrailingSlash(String key) {
    return key.endsWith("/") ? key : key + "/";
  }

  private String filename(String srcKey, Path parent) {
    return srcKey.substring(pathToKey(parent).length() + 1);
  }

  private void deleteKeys(List<DeleteObjectsRequest.KeyVersion> keys) {
    if (keys.isEmpty()) {
      return;
    }
    DeleteObjectsRequest deleteRequest =
        new DeleteObjectsRequest(bucket).withKeys(keys);
    s3.deleteObjects(deleteRequest);
    statistics.incrementWriteOps(1);
    keys.clear();
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
    S3AFileStatus status;
    try {
      status = getFileStatus(f);
    } catch (FileNotFoundException e) {
      debug("Couldn't delete " + f + " - does not exist");
      return false;
    }

    String key = pathToKey(f);

    if (status.isDirectory()) {
      deleteDirectory(f, key, status, recursive);
    } else {
      debug("delete: Path is a file");
      s3.deleteObject(bucket, key);
      statistics.incrementWriteOps(1);
    }

    createFakeDirectoryIfNecessary(f.getParent());

    return true;
  }

  private void deleteDirectory(Path f, String key, S3AFileStatus status,
      boolean recursive) throws IOException {
    debug("delete: Path is a directory");

    if (!recursive && !status.isEmptyDirectory()) {
      throw new IOException("Path is a folder: " + f +
                            " and it is not an empty directory");
    }

    String dirKey = ensureTrailingSlash(key);

    if (dirKey.equals("/")) {
      LOG.info("s3a cannot delete the root directory");
      return;
    }

    if (status.isEmptyDirectory()) {
      debug("Deleting fake empty directory");
      s3.deleteObject(bucket, dirKey);
      statistics.incrementWriteOps(1);
    } else {
      deleteDirectoryContents(dirKey);
    }
  }

  private void deleteDirectoryContents(String dirKey) {
    debug("Getting objects for directory prefix " + dirKey + " to delete");

    ListObjectsRequest request = new ListObjectsRequest();
    request.setBucketName(bucket);
    request.setPrefix(dirKey);
    request.setMaxKeys(maxKeys);

    List<DeleteObjectsRequest.KeyVersion> keys = new ArrayList<>();
    ObjectListing objects = s3.listObjects(request);
    statistics.incrementReadOps(1);
    while (true) {
      for (S3ObjectSummary summary : objects.getObjectSummaries()) {
        keys.add(new DeleteObjectsRequest.KeyVersion(summary.getKey()));
        debug("Got object to delete " + summary.getKey());

        if (keys.size() == MAX_ENTRIES_TO_DELETE) {
          deleteKeys(keys);
        }
      }

      if (objects.isTruncated()) {
        objects = s3.listNextBatchOfObjects(objects);
        statistics.incrementReadOps(1);
      } else {
        deleteKeys(keys);
        break;
      }
    }
  }

  private void createFakeDirectoryIfNecessary(Path f) throws IOException {
    String key = pathToKey(f);
    if (!key.isEmpty() && !exists(f)) {
      debug("Creating new fake directory at " + f);
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
    debug("List status for path: " + f);

    final List<FileStatus> result = new ArrayList<FileStatus>();
    final FileStatus fileStatus =  getFileStatus(f);

    if (fileStatus.isDirectory()) {
      listDirectoryStatus(f, key, result);
    } else {
      debug("Adding: rd (not a dir): " + f);
      result.add(fileStatus);
    }

    return result.toArray(new FileStatus[result.size()]);
  }

  private void listDirectoryStatus(Path f, String key, List<FileStatus> result)
      throws IOException {
    String prefix = key.isEmpty() ? key : key + "/";

    ListObjectsRequest request = new ListObjectsRequest();
    request.setBucketName(bucket);
    request.setPrefix(prefix);
    request.setDelimiter("/");
    request.setMaxKeys(maxKeys);

    debug("listStatus: doing listObjects for directory " + prefix);

    ObjectListing objects = s3.listObjects(request);
    statistics.incrementReadOps(1);

    while (true) {
      addSummaries(f, objects, result);
      addPrefixes(f, objects, result);

      if (objects.isTruncated()) {
        debug("listStatus: list truncated - getting next batch");
        objects = s3.listNextBatchOfObjects(objects);
        statistics.incrementReadOps(1);
      } else {
        break;
      }
    }
  }

  private void addSummaries(Path f, ObjectListing objects, List<FileStatus> result) {
    for (S3ObjectSummary summary : objects.getObjectSummaries()) {
      Path keyPath = keyToPath(summary.getKey()).makeQualified(uri, workingDir);
      if (keyPath.equals(f) || summary.getKey().endsWith(S3N_FOLDER_SUFFIX)) {
        debug("Ignoring: " + keyPath);
        continue;
      }

      if (objectRepresentsDirectory(summary.getKey(), summary.getSize())) {
        result.add(new S3AFileStatus(true, true, keyPath));
        debug("Adding: fd: " + keyPath);
      } else {
        result.add(new S3AFileStatus(summary.getSize(),
            dateToLong(summary.getLastModified()), keyPath,
            getDefaultBlockSize(f.makeQualified(uri, workingDir))));
        debug("Adding: fi: " + keyPath);
      }
    }
  }

  private void addPrefixes(Path f, ObjectListing objects, List<FileStatus> result) {
    for (String prefix : objects.getCommonPrefixes()) {
      Path keyPath = keyToPath(prefix).makeQualified(uri, workingDir);
      if (keyPath.equals(f)) {
        continue;
      }
      result.add(new S3AFileStatus(true, false, keyPath));
      debug("Adding: rd: " + keyPath);
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
    debug("Making directory: " + f);

    try {
      FileStatus fileStatus = getFileStatus(f);

      if (fileStatus.isDirectory()) {
        return true;
      } else {
        throw new FileAlreadyExistsException("Path is a file: " + f);
      }
    } catch (FileNotFoundException e) {
      ensureParentsAreDirectories(f);

      String key = pathToKey(f);
      createFakeDirectory(bucket, key);
      return true;
    }
  }

  private void ensureParentsAreDirectories(Path f) throws IOException {
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
    debug("Getting path status for " + f + " (" + key + ")");

    if (!key.isEmpty()) {
      S3AFileStatus status = statusFromExactKey(f, key);
      if (status != null) {
        return status;
      }

      if (!key.endsWith("/")) {
        status = statusFromExactKey(f, key + "/");
        if (status != null) {
          return status;
        }
      }
    }

    S3AFileStatus status = statusFromListing(f, key);
    if (status != null) {
      return status;
    }

    debug("Not Found: " + f);
    throw new FileNotFoundException("No such file or directory: " + f);
  }

  private S3AFileStatus statusFromExactKey(Path f, String key) throws IOException {
    ObjectMetadata meta = getObjectMetadataOrNull(bucket, key);
    if (meta == null) {
      return null;
    }

    if (objectRepresentsDirectory(key, meta.getContentLength())) {
      debug("Found exact file: fake directory");
      return new S3AFileStatus(true, true, f.makeQualified(uri, workingDir));
    } else {
      debug("Found exact file: normal file");
      return new S3AFileStatus(meta.getContentLength(),
          dateToLong(meta.getLastModified()),
          f.makeQualified(uri, workingDir),
          getDefaultBlockSize(f.makeQualified(uri, workingDir)));
    }
  }

  private ObjectMetadata getObjectMetadataOrNull(String bucketName, String key)
      throws IOException {
    try {
      ObjectMetadata meta = s3.getObjectMetadata(bucketName, key);
      statistics.incrementReadOps(1);
      return meta;
    } catch (AmazonServiceException e) {
      if (e.getStatusCode() != 404) {
        printAmazonServiceException(e);
        throw e;
      }
      return null;
    } catch (AmazonClientException e) {
      printAmazonClientException(e);
      throw e;
    }
  }

  private S3AFileStatus statusFromListing(Path f, String key) throws IOException {
    String prefix = key;
    if (!key.isEmpty() && !key.endsWith("/")) {
      prefix = key + "/";
    }

    ListObjectsRequest request = new ListObjectsRequest();
    request.setBucketName(bucket);
    request.setPrefix(prefix);
    request.setDelimiter("/");
    request.setMaxKeys(1);

    try {
      ObjectListing objects = s3.listObjects(request);
      statistics.incrementReadOps(1);

      if (!objects.getCommonPrefixes().isEmpty()
          || objects.getObjectSummaries().size() > 0) {
        debug("Found path as directory (with /): " +
          objects.getCommonPrefixes().size() + "/" +
          objects.getObjectSummaries().size());

        for (S3ObjectSummary summary : objects.getObjectSummaries()) {
          debug("Summary: " + summary.getKey() + " " + summary.getSize());
        }
        for (String p : objects.getCommonPrefixes()) {
          debug("Prefix: " + p);
        }

        return new S3AFileStatus(true, false,
            f.makeQualified(uri, workingDir));
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

    return null;
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

    // Since we have a local file, we don't need to stream into a temporary file
    LocalFileSystem local = getLocal(getConf());
    File srcfile = local.pathToFile(src);

    final ObjectMetadata om = new ObjectMetadata();
    if (StringUtils.isNotBlank(serverSideEncryptionAlgorithm)) {
      om.setServerSideEncryption(serverSideEncryptionAlgorithm);
    }
    PutObjectRequest putObjectRequest = new PutObjectRequest(bucket, key, srcfile);
    putObjectRequest.setCannedAcl(cannedACL);
    putObjectRequest.setMetadata(om);

    Upload up = transfers.upload(putObjectRequest);
    up.addProgressListener(newWriteProgressListener());
    try {
      up.waitForUploadResult();
      statistics.incrementWriteOps(1);
    } catch (InterruptedException e) {
      throw new IOException("Got interrupted, cancelling");
    }

    // This will delete unnecessary fake parent directories
    finishedWrite(key);

    if (delSrc) {
      local.delete(src, false);
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

    Copy copy = transfers.copy(copyObjectRequest);
    copy.addProgressListener(newWriteProgressListener());
    try {
      copy.waitForCopyResult();
      statistics.incrementWriteOps(1);
    } catch (InterruptedException e) {
      throw new IOException("Got interrupted, cancelling");
    }
  }

  private ProgressListener newWriteProgressListener() {
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
          debug("Deleting fake directory " + key + "/");
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

  private void debug(String message) {
    if (LOG.isDebugEnabled()) {
      LOG.debug(message);
    }
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