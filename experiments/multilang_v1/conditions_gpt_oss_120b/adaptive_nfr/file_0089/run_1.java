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
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
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

/**
 * S3AFileSystem implementation.
 */
public class S3AFileSystem extends FileSystem {
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
  private static final int MAX_ENTRIES_TO_DELETE = 1000;
  private static final AtomicInteger poolNumber = new AtomicInteger(1);

  public static ThreadFactory getNamedThreadFactory(final String prefix) {
    SecurityManager s = System.getSecurityManager();
    final ThreadGroup threadGroup = (s != null) ? s.getThreadGroup()
        : Thread.currentThread().getThreadGroup();

    return new ThreadFactory() {
      final AtomicInteger threadNumber = new AtomicInteger(1);
      private final int poolNum = poolNumber.getAndIncrement();
      final ThreadGroup group = threadGroup;

      @Override
      public Thread newThread(Runnable r) {
        final String name = prefix + "-pool" + poolNum + "-t"
            + threadNumber.getAndIncrement();
        return new Thread(group, r, name);
      }
    };
  }

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

  public void initialize(URI name, Configuration conf) throws IOException {
    super.initialize(name, conf);
    uri = URI.create(name.getScheme() + "://" + name.getAuthority());
    workingDir = new Path("/user", System.getProperty("user.name"))
        .makeQualified(this.uri, this.getWorkingDirectory());

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
        new AnonymousAWSCredentialsProvider());

    bucket = name.getHost();

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

    configureProxy(conf, awsConf, secureConnections);

    s3 = new AmazonS3Client(credentials, awsConf);
    configureEndpoint(conf);
    maxKeys = conf.getInt(MAX_PAGING_KEYS, DEFAULT_MAX_PAGING_KEYS);
    partSize = conf.getLong(MULTIPART_SIZE, DEFAULT_MULTIPART_SIZE);
    multiPartThreshold = conf.getInt(MIN_MULTIPART_THRESHOLD,
        DEFAULT_MIN_MULTIPART_THRESHOLD);
    enforceMinimumPartSize();
    enforceMinimumMultipartThreshold();

    configureThreadPool(conf);
    configureTransferManager();

    configureCannedACL(conf);
    verifyBucketExists();

    configurePurgeMultipart(conf);
    serverSideEncryptionAlgorithm = conf.get(SERVER_SIDE_ENCRYPTION_ALGORITHM);
    setConf(conf);
  }

  private void configureProxy(Configuration conf, ClientConfiguration awsConf,
      boolean secureConnections) {
    String proxyHost = conf.getTrimmed(PROXY_HOST, "");
    int proxyPort = conf.getInt(PROXY_PORT, -1);
    if (!proxyHost.isEmpty()) {
      awsConf.setProxyHost(proxyHost);
      if (proxyPort >= 0) {
        awsConf.setProxyPort(proxyPort);
      } else {
        int defaultPort = secureConnections ? 443 : 80;
        LOG.warn("Proxy host set without port. Using default {}", defaultPort);
        awsConf.setProxyPort(defaultPort);
      }
      String proxyUsername = conf.getTrimmed(PROXY_USERNAME);
      String proxyPassword = conf.getTrimmed(PROXY_PASSWORD);
      if ((proxyUsername == null) != (proxyPassword == null)) {
        String msg = "Proxy error: " + PROXY_USERNAME + " or " + PROXY_PASSWORD
            + " set without the other.";
        LOG.error(msg);
        throw new IllegalArgumentException(msg);
      }
      awsConf.setProxyUsername(proxyUsername);
      awsConf.setProxyPassword(proxyPassword);
      awsConf.setProxyDomain(conf.getTrimmed(PROXY_DOMAIN));
      awsConf.setProxyWorkstation(conf.getTrimmed(PROXY_WORKSTATION));
      if (LOG.isDebugEnabled()) {
        LOG.debug("Using proxy server {}:{} as user {} with password {} on domain {} as workstation {}",
            awsConf.getProxyHost(), awsConf.getProxyPort(),
            String.valueOf(awsConf.getProxyUsername()),
            awsConf.getProxyPassword(), awsConf.getProxyDomain(),
            awsConf.getProxyWorkstation());
      }
    } else if (proxyPort >= 0) {
      String msg = "Proxy error: " + PROXY_PORT + " set without " + PROXY_HOST;
      LOG.error(msg);
      throw new IllegalArgumentException(msg);
    }
  }

  private void configureEndpoint(Configuration conf) {
    String endPoint = conf.getTrimmed(ENDPOINT, "");
    if (!endPoint.isEmpty()) {
      try {
        s3.setEndpoint(endPoint);
      } catch (IllegalArgumentException e) {
        String msg = "Incorrect endpoint: " + e.getMessage();
        LOG.error(msg);
        throw new IllegalArgumentException(msg, e);
      }
    }
  }

  private void enforceMinimumPartSize() {
    if (partSize < 5 * 1024 * 1024) {
      LOG.error(MULTIPART_SIZE + " must be at least 5 MB");
      partSize = 5 * 1024 * 1024;
    }
  }

  private void enforceMinimumMultipartThreshold() {
    if (multiPartThreshold < 5 * 1024 * 1024) {
      LOG.error(MIN_MULTIPART_THRESHOLD + " must be at least 5 MB");
      multiPartThreshold = 5 * 1024 * 1024;
    }
  }

  private void configureThreadPool(Configuration conf) {
    int maxThreads = conf.getInt(MAX_THREADS, DEFAULT_MAX_THREADS);
    int coreThreads = conf.getInt(CORE_THREADS, DEFAULT_CORE_THREADS);
    if (maxThreads == 0) {
      maxThreads = Runtime.getRuntime().availableProcessors() * 8;
    }
    if (coreThreads == 0) {
      coreThreads = Runtime.getRuntime().availableProcessors() * 8;
    }
    long keepAliveTime = conf.getLong(KEEPALIVE_TIME, DEFAULT_KEEPALIVE_TIME);
    LinkedBlockingQueue<Runnable> workQueue = new LinkedBlockingQueue<>(
        maxThreads * conf.getInt(MAX_TOTAL_TASKS, DEFAULT_MAX_TOTAL_TASKS));
    threadPoolExecutor = new ThreadPoolExecutor(coreThreads, maxThreads,
        keepAliveTime, TimeUnit.SECONDS, workQueue,
        newDaemonThreadFactory("s3a-transfer-shared-"));
    threadPoolExecutor.allowCoreThreadTimeOut(true);
  }

  private void configureTransferManager() {
    TransferManagerConfiguration transferConfiguration = new TransferManagerConfiguration();
    transferConfiguration.setMinimumUploadPartSize(partSize);
    transferConfiguration.setMultipartUploadThreshold(multiPartThreshold);
    transfers = new TransferManager(s3, threadPoolExecutor);
    transfers.setConfiguration(transferConfiguration);
  }

  private void configureCannedACL(Configuration conf) {
    String cannedACLName = conf.get(CANNED_ACL, DEFAULT_CANNED_ACL);
    if (!cannedACLName.isEmpty()) {
      cannedACL = CannedAccessControlList.valueOf(cannedACLName);
    } else {
      cannedACL = null;
    }
  }

  private void verifyBucketExists() throws IOException {
    if (!s3.doesBucketExist(bucket)) {
      throw new IOException("Bucket " + bucket + " does not exist");
    }
  }

  private void configurePurgeMultipart(Configuration conf) {
    boolean purgeExistingMultipart = conf.getBoolean(PURGE_EXISTING_MULTIPART,
        DEFAULT_PURGE_EXISTING_MULTIPART);
    long purgeExistingMultipartAge = conf.getLong(PURGE_EXISTING_MULTIPART_AGE,
        DEFAULT_PURGE_EXISTING_MULTIPART_AGE);
    if (purgeExistingMultipart) {
      Date purgeBefore = new Date(new Date().getTime()
          - purgeExistingMultipartAge * 1000);
      transfers.abortMultipartUploads(bucket, purgeBefore);
    }
  }

  public String getScheme() {
    return "s3a";
  }

  public URI getUri() {
    return uri;
  }

  @VisibleForTesting
  AmazonS3Client getAmazonS3Client() {
    return s3;
  }

  public S3AFileSystem() {
    super();
  }

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

  public FSDataInputStream open(Path f, int bufferSize) throws IOException {
    if (LOG.isDebugEnabled()) {
      LOG.debug("Opening '{}' for reading.", f);
    }
    FileStatus fileStatus = getFileStatus(f);
    if (fileStatus.isDirectory()) {
      throw new FileNotFoundException("Can't open " + f + " because it is a directory");
    }
    return new FSDataInputStream(
        new S3AInputStream(bucket, pathToKey(f), fileStatus.getLen(), s3,
            statistics));
  }

  public FSDataOutputStream create(Path f, FsPermission permission,
      boolean overwrite, int bufferSize, short replication, long blockSize,
      Progressable progress) throws IOException {
    String key = pathToKey(f);
    if (!overwrite && exists(f)) {
      throw new FileAlreadyExistsException(f + " already exists");
    }
    if (getConf().getBoolean(FAST_UPLOAD, DEFAULT_FAST_UPLOAD)) {
      return new FSDataOutputStream(
          new S3AFastOutputStream(s3, this, bucket, key, progress,
              statistics, cannedACL, serverSideEncryptionAlgorithm,
              partSize, (long) multiPartThreshold, threadPoolExecutor),
          statistics);
    }
    return new FSDataOutputStream(
        new S3AOutputStream(getConf(), transfers, this, bucket, key,
            progress, cannedACL, statistics, serverSideEncryptionAlgorithm),
        null);
  }

  public FSDataOutputStream append(Path f, int bufferSize,
      Progressable progress) throws IOException {
    throw new IOException("Not supported");
  }

  public boolean rename(Path src, Path dst) throws IOException {
    if (LOG.isDebugEnabled()) {
      LOG.debug("Rename path {} to {}", src, dst);
    }
    String srcKey = pathToKey(src);
    String dstKey = pathToKey(dst);
    if (isEmptyKey(srcKey, dstKey)) {
      return false;
    }
    S3AFileStatus srcStatus = getFileStatusOrNull(src);
    if (srcStatus == null) {
      LOG.error("rename: src not found {}", src);
      return false;
    }
    if (srcKey.equals(dstKey)) {
      return srcStatus.isFile();
    }
    S3AFileStatus dstStatus = getFileStatusIfExists(dst);
    if (dstStatus != null && isInvalidRename(srcStatus, dstStatus)) {
      return false;
    }
    if (dstStatus == null && !parentExists(dst)) {
      return false;
    }
    if (srcStatus.isFile()) {
      renameFile(srcKey, dstKey, dstStatus);
    } else {
      renameDirectory(srcKey, dstKey, dstStatus);
    }
    postRenameCleanup(src, dst);
    return true;
  }

  private boolean isEmptyKey(String srcKey, String dstKey) {
    if (srcKey.isEmpty() || dstKey.isEmpty()) {
      if (LOG.isDebugEnabled()) {
        LOG.debug("rename: src or dst are empty");
      }
      return true;
    }
    return false;
  }

  private S3AFileStatus getFileStatusOrNull(Path p) {
    try {
      return getFileStatus(p);
    } catch (FileNotFoundException e) {
      return null;
    } catch (IOException e) {
      LOG.error("Error retrieving status for {}", p, e);
      return null;
    }
  }

  private S3AFileStatus getFileStatusIfExists(Path p) {
    try {
      return getFileStatus(p);
    } catch (FileNotFoundException e) {
      return null;
    } catch (IOException e) {
      LOG.error("Error retrieving status for {}", p, e);
      return null;
    }
  }

  private boolean isInvalidRename(S3AFileStatus src, S3AFileStatus dst) {
    if (src.isDirectory() && dst.isFile()) {
      if (LOG.isDebugEnabled()) {
        LOG.debug("rename: src is a directory and dst is a file");
      }
      return true;
    }
    if (dst.isDirectory() && !dst.isEmptyDirectory()) {
      return true;
    }
    return false;
  }

  private boolean parentExists(Path p) {
    Path parent = p.getParent();
    if (parent == null) {
      return false;
    }
    String parentKey = pathToKey(parent);
    if (parentKey.isEmpty()) {
      return false;
    }
    try {
      S3AFileStatus parentStatus = getFileStatus(parent);
      return parentStatus.isDirectory();
    } catch (IOException e) {
      return false;
    }
  }

  private void renameFile(String srcKey, String dstKey, S3AFileStatus dstStatus)
      throws IOException {
    if (LOG.isDebugEnabled()) {
      LOG.debug("rename: renaming file {} to {}", srcKey, dstKey);
    }
    if (dstStatus != null && dstStatus.isDirectory()) {
      String newDstKey = ensureTrailingSlash(dstKey);
      String filename = srcKey.substring(pathToKey(new Path(srcKey).getParent()).length() + 1);
      newDstKey = newDstKey + filename;
      copyFile(srcKey, newDstKey);
    } else {
      copyFile(srcKey, dstKey);
    }
    delete(new Path(srcKey), false);
  }

  private void renameDirectory(String srcKey, String dstKey,
      S3AFileStatus dstStatus) throws IOException {
    if (LOG.isDebugEnabled()) {
      LOG.debug("rename: renaming directory {} to {}", srcKey, dstKey);
    }
    String srcPrefix = ensureTrailingSlash(srcKey);
    String dstPrefix = ensureTrailingSlash(dstKey);
    if (dstPrefix.startsWith(srcPrefix)) {
      if (LOG.isDebugEnabled()) {
        LOG.debug("cannot rename a directory to a subdirectory of self");
      }
      return;
    }
    List<DeleteObjectsRequest.KeyVersion> keysToDelete = new ArrayList<>();
    if (dstStatus != null && dstStatus.isEmptyDirectory()) {
      keysToDelete.add(new DeleteObjectsRequest.KeyVersion(dstPrefix));
    }
    ListObjectsRequest request = new ListObjectsRequest();
    request.setBucketName(bucket);
    request.setPrefix(srcPrefix);
    request.setMaxKeys(maxKeys);
    ObjectListing objects = s3.listObjects(request);
    statistics.incrementReadOps(1);
    while (true) {
      for (S3ObjectSummary summary : objects.getObjectSummaries()) {
        keysToDelete.add(new DeleteObjectsRequest.KeyVersion(summary.getKey()));
        String newDstKey = dstPrefix + summary.getKey().substring(srcPrefix.length());
        copyFile(summary.getKey(), newDstKey);
        if (keysToDelete.size() == MAX_ENTRIES_TO_DELETE) {
          deleteBatch(keysToDelete);
        }
      }
      if (objects.isTruncated()) {
        objects = s3.listNextBatchOfObjects(objects);
        statistics.incrementReadOps(1);
      } else {
        if (!keysToDelete.isEmpty()) {
          deleteBatch(keysToDelete);
        }
        break;
      }
    }
  }

  private void deleteBatch(List<DeleteObjectsRequest.KeyVersion> batch) {
    DeleteObjectsRequest deleteRequest = new DeleteObjectsRequest(bucket)
        .withKeys(batch);
    s3.deleteObjects(deleteRequest);
    statistics.incrementWriteOps(1);
    batch.clear();
  }

  private String ensureTrailingSlash(String key) {
    return key.endsWith("/") ? key : key + "/";
  }

  private void postRenameCleanup(Path src, Path dst) throws IOException {
    if (!src.getParent().equals(dst.getParent())) {
      deleteUnnecessaryFakeDirectories(dst.getParent());
      createFakeDirectoryIfNecessary(src.getParent());
    }
  }

  public boolean delete(Path f, boolean recursive) throws IOException {
    if (LOG.isDebugEnabled()) {
      LOG.debug("Delete path {} - recursive {}", f, recursive);
    }
    S3AFileStatus status = getFileStatusOrNull(f);
    if (status == null) {
      if (LOG.isDebugEnabled()) {
        LOG.debug("Couldn't delete {} - does not exist", f);
      }
      return false;
    }
    String key = pathToKey(f);
    if (status.isDirectory()) {
      return deleteDirectory(f, key, recursive);
    } else {
      s3.deleteObject(bucket, key);
      statistics.incrementWriteOps(1);
    }
    createFakeDirectoryIfNecessary(f.getParent());
    return true;
  }

  private boolean deleteDirectory(Path f, String key, boolean recursive)
      throws IOException {
    if (!recursive && !isEmptyDirectory(key)) {
      throw new IOException("Path is a folder: " + f
          + " and it is not an empty directory");
    }
    String normalizedKey = ensureTrailingSlash(key);
    if (normalizedKey.equals("/")) {
      LOG.info("s3a cannot delete the root directory");
      return false;
    }
    if (isEmptyDirectory(normalizedKey)) {
      s3.deleteObject(bucket, normalizedKey);
      statistics.incrementWriteOps(1);
    } else {
      deleteObjectsWithPrefix(normalizedKey);
    }
    return true;
  }

  private boolean isEmptyDirectory(String key) {
    return key.endsWith("/") && key.length() > 1 && key.equals(key);
  }

  private void deleteObjectsWithPrefix(String prefix) throws IOException {
    ListObjectsRequest request = new ListObjectsRequest();
    request.setBucketName(bucket);
    request.setPrefix(prefix);
    request.setMaxKeys(maxKeys);
    List<DeleteObjectsRequest.KeyVersion> keys = new ArrayList<>();
    ObjectListing objects = s3.listObjects(request);
    statistics.incrementReadOps(1);
    while (true) {
      for (S3ObjectSummary summary : objects.getObjectSummaries()) {
        keys.add(new DeleteObjectsRequest.KeyVersion(summary.getKey()));
        if (keys.size() == MAX_ENTRIES_TO_DELETE) {
          deleteBatch(keys);
        }
      }
      if (objects.isTruncated()) {
        objects = s3.listNextBatchOfObjects(objects);
        statistics.incrementReadOps(1);
      } else {
        if (!keys.isEmpty()) {
          deleteBatch(keys);
        }
        break;
      }
    }
  }

  private void createFakeDirectoryIfNecessary(Path f) throws IOException {
    String key = pathToKey(f);
    if (!key.isEmpty() && !exists(f)) {
      if (LOG.isDebugEnabled()) {
        LOG.debug("Creating new fake directory at {}", f);
      }
      createFakeDirectory(bucket, key);
    }
  }

  public FileStatus[] listStatus(Path f) throws FileNotFoundException,
      IOException {
    String key = pathToKey(f);
    if (LOG.isDebugEnabled()) {
      LOG.debug("List status for path: {}", f);
    }
    List<FileStatus> result = new ArrayList<>();
    FileStatus fileStatus = getFileStatus(f);
    if (!fileStatus.isDirectory()) {
      result.add(fileStatus);
      return result.toArray(new FileStatus[0]);
    }
    if (!key.isEmpty()) {
      key = ensureTrailingSlash(key);
    }
    ListObjectsRequest request = new ListObjectsRequest();
    request.setBucketName(bucket);
    request.setPrefix(key);
    request.setDelimiter("/");
    request.setMaxKeys(maxKeys);
    ObjectListing objects = s3.listObjects(request);
    statistics.incrementReadOps(1);
    while (true) {
      processListingObjects(objects, key, f, result);
      if (objects.isTruncated()) {
        objects = s3.listNextBatchOfObjects(objects);
        statistics.incrementReadOps(1);
      } else {
        break;
      }
    }
    return result.toArray(new FileStatus[result.size()]);
  }

  private void processListingObjects(ObjectListing objects, String prefix,
      Path parentPath, List<FileStatus> result) {
    for (S3ObjectSummary summary : objects.getObjectSummaries()) {
      Path keyPath = keyToPath(summary.getKey())
          .makeQualified(uri, workingDir);
      if (keyPath.equals(parentPath)
          || summary.getKey().endsWith(S3N_FOLDER_SUFFIX)) {
        continue;
      }
      if (objectRepresentsDirectory(summary.getKey(),
          summary.getSize())) {
        result.add(new S3AFileStatus(true, true, keyPath));
      } else {
        result.add(new S3AFileStatus(summary.getSize(),
            dateToLong(summary.getLastModified()), keyPath,
            getDefaultBlockSize(parentPath.makeQualified(uri, workingDir))));
      }
    }
    for (String commonPrefix : objects.getCommonPrefixes()) {
      Path keyPath = keyToPath(commonPrefix).makeQualified(uri, workingDir);
      if (!keyPath.equals(parentPath)) {
        result.add(new S3AFileStatus(true, false, keyPath));
      }
    }
  }

  public void setWorkingDirectory(Path new_dir) {
    workingDir = new_dir;
  }

  public Path getWorkingDirectory() {
    return workingDir;
  }

  public boolean mkdirs(Path f, FsPermission permission) throws IOException {
    if (LOG.isDebugEnabled()) {
      LOG.debug("Making directory: {}", f);
    }
    try {
      FileStatus fileStatus = getFileStatus(f);
      if (fileStatus.isDirectory()) {
        return true;
      }
      throw new FileAlreadyExistsException("Path is a file: " + f);
    } catch (FileNotFoundException e) {
      if (hasFileInPath(f)) {
        return false;
      }
      String key = pathToKey(f);
      createFakeDirectory(bucket, key);
      return true;
    }
  }

  private boolean hasFileInPath(Path f) throws IOException {
    Path current = f;
    while (current != null) {
      try {
        FileStatus status = getFileStatus(current);
        if (status.isFile()) {
          throw new FileAlreadyExistsException(
              String.format("Can't make directory for path '%s' since it is a file.", current));
        }
      } catch (FileNotFoundException ignored) {
      }
      current = current.getParent();
    }
    return false;
  }

  public S3AFileStatus getFileStatus(Path f) throws IOException {
    String key = pathToKey(f);
    if (LOG.isDebugEnabled()) {
      LOG.debug("Getting path status for {} ({})", f, key);
    }
    if (!key.isEmpty()) {
      try {
        ObjectMetadata meta = s3.getObjectMetadata(bucket, key);
        statistics.incrementReadOps(1);
        if (objectRepresentsDirectory(key, meta.getContentLength())) {
          return new S3AFileStatus(true, true,
              f.makeQualified(uri, workingDir));
        }
        return new S3AFileStatus(meta.getContentLength(),
            dateToLong(meta.getLastModified()),
            f.makeQualified(uri, workingDir),
            getDefaultBlockSize(f.makeQualified(uri, workingDir)));
      } catch (AmazonServiceException e) {
        if (e.getStatusCode() != 404) {
          printAmazonServiceException(e);
          throw e;
        }
      } catch (AmazonClientException e) {
        printAmazonClientException(e);
        throw e;
      }
      if (!key.endsWith("/")) {
        return getFileStatusForKeyWithSlash(key, f);
      }
    }
    return getFileStatusByListing(key, f);
  }

  private S3AFileStatus getFileStatusForKeyWithSlash(String key, Path f)
      throws IOException {
    try {
      String newKey = key + "/";
      ObjectMetadata meta = s3.getObjectMetadata(bucket, newKey);
      statistics.incrementReadOps(1);
      if (objectRepresentsDirectory(newKey, meta.getContentLength())) {
        return new S3AFileStatus(true, true,
            f.makeQualified(uri, workingDir));
      }
      LOG.warn("Found file (with /): real file? should not happen: {}", key);
      return new S3AFileStatus(meta.getContentLength(),
          dateToLong(meta.getLastModified()),
          f.makeQualified(uri, workingDir),
          getDefaultBlockSize(f.makeQualified(uri, workingDir)));
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

  private S3AFileStatus getFileStatusByListing(String key, Path f)
      throws IOException {
    try {
      String prefix = key.isEmpty() ? "" : key + "/";
      ListObjectsRequest request = new ListObjectsRequest();
      request.setBucketName(bucket);
      request.setPrefix(prefix);
      request.setDelimiter("/");
      request.setMaxKeys(1);
      ObjectListing objects = s3.listObjects(request);
      statistics.incrementReadOps(1);
      if (!objects.getCommonPrefixes().isEmpty()
          || !objects.getObjectSummaries().isEmpty()) {
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
    LOG.debug("Not Found: {}", f);
    throw new FileNotFoundException("No such file or directory: " + f);
  }

  @Override
  public void copyFromLocalFile(boolean delSrc, boolean overwrite, Path src,
      Path dst) throws IOException {
    String key = pathToKey(dst);
    if (!overwrite && exists(dst)) {
      throw new IOException(dst + " already exists");
    }
    if (LOG.isDebugEnabled()) {
      LOG.debug("Copying local file from {} to {}", src, dst);
    }
    LocalFileSystem local = getLocal(getConf());
    File srcfile = local.pathToFile(src);
    ObjectMetadata om = new ObjectMetadata();
    if (StringUtils.isNotBlank(serverSideEncryptionAlgorithm)) {
      om.setServerSideEncryption(serverSideEncryptionAlgorithm);
    }
    PutObjectRequest putObjectRequest = new PutObjectRequest(bucket, key,
        srcfile);
    putObjectRequest.setCannedAcl(cannedACL);
    putObjectRequest.setMetadata(om);
    ProgressListener progressListener = new ProgressListener() {
      public void progressChanged(ProgressEvent progressEvent) {
        if (progressEvent.getEventCode()
            == ProgressEvent.PART_COMPLETED_EVENT_CODE) {
          statistics.incrementWriteOps(1);
        }
      }
    };
    Upload up = transfers.upload(putObjectRequest);
    up.addProgressListener(progressListener);
    try {
      up.waitForUploadResult();
      statistics.incrementWriteOps(1);
    } catch (InterruptedException e) {
      throw new IOException("Got interrupted, cancelling");
    }
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

  @Override
  public String getCanonicalServiceName() {
    return null;
  }

  private void copyFile(String srcKey, String dstKey) throws IOException {
    if (LOG.isDebugEnabled()) {
      LOG.debug("copyFile {} -> {}", srcKey, dstKey);
    }
    ObjectMetadata srcMeta = s3.getObjectMetadata(bucket, srcKey);
    ObjectMetadata dstMeta = srcMeta.clone();
    if (StringUtils.isNotBlank(serverSideEncryptionAlgorithm)) {
      dstMeta.setServerSideEncryption(serverSideEncryptionAlgorithm);
    }
    CopyObjectRequest copyRequest = new CopyObjectRequest(bucket, srcKey,
        bucket, dstKey);
    copyRequest.setCannedAccessControlList(cannedACL);
    copyRequest.setNewObjectMetadata(dstMeta);
    ProgressListener progressListener = new ProgressListener() {
      public void progressChanged(ProgressEvent progressEvent) {
        if (progressEvent.getEventCode()
            == ProgressEvent.PART_COMPLETED_EVENT_CODE) {
          statistics.incrementWriteOps(1);
        }
      }
    };
    Copy copy = transfers.copy(copyRequest);
    copy.addProgressListener(progressListener);
    try {
      copy.waitForCopyResult();
      statistics.incrementWriteOps(1);
    } catch (InterruptedException e) {
      throw new IOException("Got interrupted, cancelling");
    }
  }

  private boolean objectRepresentsDirectory(final String name,
      final long size) {
    return !name.isEmpty() && name.charAt(name.length() - 1) == '/' && size == 0L;
  }

  private static long dateToLong(final Date date) {
    return date == null ? 0L : date.getTime();
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
            LOG.debug("Deleting fake directory {}/", key);
          }
          s3.deleteObject(bucket, key + "/");
          statistics.incrementWriteOps(1);
        }
      } catch (FileNotFoundException | AmazonServiceException ignored) {
      }
      if (f.isRoot()) {
        break;
      }
      f = f.getParent();
    }
  }

  private void createFakeDirectory(final String bucketName,
      final String objectName) throws AmazonClientException,
      AmazonServiceException {
    if (!objectName.endsWith("/")) {
      createEmptyObject(bucketName, objectName + "/");
    } else {
      createEmptyObject(bucketName, objectName);
    }
  }

  private void createEmptyObject(final String bucketName,
      final String objectName) throws AmazonClientException,
      AmazonServiceException {
    InputStream im = new InputStream() {
      @Override
      public int read() {
        return -1;
      }
    };
    ObjectMetadata om = new ObjectMetadata();
    om.setContentLength(0L);
    if (StringUtils.isNotBlank(serverSideEncryptionAlgorithm)) {
      om.setServerSideEncryption(serverSideEncryptionAlgorithm);
    }
    PutObjectRequest putObjectRequest = new PutObjectRequest(bucketName,
        objectName, im, om);
    putObjectRequest.setCannedAcl(cannedACL);
    s3.putObject(putObjectRequest);
    statistics.incrementWriteOps(1);
  }

  @Deprecated
  public long getDefaultBlockSize() {
    return getConf().getLong(FS_S3A_BLOCK_SIZE, DEFAULT_BLOCKSIZE);
  }

  private void printAmazonServiceException(AmazonServiceException ase) {
    LOG.info("Caught an AmazonServiceException, which means your request made it to Amazon S3, but was rejected with an error response for some reason.");
    LOG.info("Error Message: {}", ase.getMessage());
    LOG.info("HTTP Status Code: {}", ase.getStatusCode());
    LOG.info("AWS Error Code: {}", ase.getErrorCode());
    LOG.info("Error Type: {}", ase.getErrorType());
    LOG.info("Request ID: {}", ase.getRequestId());
    LOG.info("Class Name: {}", ase.getClass().getName());
  }

  private void printAmazonClientException(AmazonClientException ace) {
    LOG.info("Caught an AmazonClientException, which means the client encountered a serious internal problem while trying to communicate with S3, such as not being able to access the network.");
    LOG.info("Error Message: {}", ace.getMessage());
  }
}