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
    return new NamedThreadFactory(prefix);
  }

  /**
   * Get a named {@link ThreadFactory} that just builds daemon threads.
   * @param prefix name prefix for all threads created from the factory
   * @return a thread factory that creates named, daemon threads with
   *         the supplied exception handler and normal priority
   */
  private static ThreadFactory newDaemonThreadFactory(final String prefix) {
    final ThreadFactory namedFactory = getNamedThreadFactory(prefix);
    return new DaemonThreadFactory(namedFactory);
  }

  /** Called after a new FileSystem instance is constructed.
   * @param name a uri whose authority section names the host, port, etc.
   *   for this FileSystem
   * @param conf the configuration
   */
  public void initialize(URI name, Configuration conf) throws IOException {
    super.initialize(name, conf);

    uri = URI.create(name.getScheme() + "://" + name.getAuthority());
    workingDir = new Path("/user", System.getProperty("user.name")).makeQualified(this.uri,
        this.getWorkingDirectory());

    String accessKey = conf.get(ACCESS_KEY, null);
    String secretKey = conf.get(SECRET_KEY, null);
    String[] userCreds = extractUserCredentials(name, accessKey, secretKey);

    AWSCredentialsProviderChain credentials = createCredentialsProvider(
        userCreds[0], userCreds[1]);

    bucket = name.getHost();

    ClientConfiguration awsConf = createClientConfiguration(conf);

    s3 = new AmazonS3Client(credentials, awsConf);
    configureEndpoint(conf);

    maxKeys = conf.getInt(MAX_PAGING_KEYS, DEFAULT_MAX_PAGING_KEYS);
    partSize = conf.getLong(MULTIPART_SIZE, DEFAULT_MULTIPART_SIZE);
    multiPartThreshold = conf.getInt(MIN_MULTIPART_THRESHOLD,
        DEFAULT_MIN_MULTIPART_THRESHOLD);

    partSize = ensureMinimumPartSize(partSize);
    multiPartThreshold = ensureMinimumMultipartThreshold(multiPartThreshold);

    initThreadPool(conf);
    initTransferManager();
    initCannedAcl(conf);
    verifyBucketExists();
    purgeExistingMultipartUploads(conf);

    serverSideEncryptionAlgorithm = conf.get(SERVER_SIDE_ENCRYPTION_ALGORITHM);

    setConf(conf);
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

    if (wouldCreateWithoutOverwrite(f, overwrite)) {
      throw new FileAlreadyExistsException(f + " already exists");
    }

    if (isFastUploadEnabled()) {
      return new FSDataOutputStream(new S3AFastOutputStream(s3, this, bucket,
          key, progress, statistics, cannedACL,
          serverSideEncryptionAlgorithm, partSize, (long) multiPartThreshold,
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

    if (isEmptyKey(srcKey)) {
      if (LOG.isDebugEnabled()) {
        LOG.debug("rename: src or dst are empty");
      }
      return false;
    }

    if (isEmptyKey(dstKey)) {
      if (LOG.isDebugEnabled()) {
        LOG.debug("rename: src or dst are empty");
      }
      return false;
    }

    S3AFileStatus srcStatus = getStatusOrNull(src);
    if (srcStatus == null) {
      LOG.error("rename: src not found {}", src);
      return false;
    }

    if (srcKey.equals(dstKey)) {
      if (LOG.isDebugEnabled()) {
        LOG.debug("rename: src and dst refer to the same file or directory");
      }
      return srcStatus.isFile();
    }

    S3AFileStatus dstStatus = getStatusOrNull(dst);
    if (dstStatus != null && !renameTypesAllowed(srcStatus, dstStatus)) {
      return false;
    }

    if (dstStatus == null && !parentOfDstIsValidDirectory(dst)) {
      return false;
    }

    if (srcStatus.isFile()) {
      renameFile(src, srcKey, dstKey, dstStatus);
    } else {
      if (!canRenameDirectory(srcKey, dstKey)) {
        return false;
      }
      renameDirectory(srcKey, dstKey, dstStatus);
    }

    if (!haveSameParent(src, dst)) {
      deleteUnnecessaryFakeDirectories(dst.getParent());
      createFakeDirectoryIfNecessary(src.getParent());
    }
    return true;
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
    S3AFileStatus status = getStatusOrNull(f);
    if (status == null) {
      if (LOG.isDebugEnabled()) {
        LOG.debug("Couldn't delete " + f + " - does not exist");
      }
      return false;
    }

    String key = pathToKey(f);

    if (status.isDirectory()) {
      return deleteDirectory(f, key, status, recursive);
    }

    return deleteFile(key);
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

    if (!fileStatus.isDirectory()) {
      if (LOG.isDebugEnabled()) {
        LOG.debug("Adding: rd (not a dir): " + f);
      }
      result.add(fileStatus);
      return result.toArray(new FileStatus[result.size()]);
    }

    listDirectoryStatus(f, key, result);
    return result.toArray(new FileStatus[result.size()]);
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

    S3AFileStatus status = getStatusOrNull(f);
    if (status != null) {
      return handleExistingPathForMkdirs(f, status);
    }

    ensureNoFileAncestors(f);

    String key = pathToKey(f);
    createFakeDirectory(bucket, key);
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

    if (isEmptyKey(key)) {
      return statusForPrefix(f, key);
    }

    S3AFileStatus status = statusForExactKey(f, key);
    if (status != null) {
      return status;
    }

    if (!key.endsWith("/")) {
      status = statusForKeyWithSlash(f, key);
      if (status != null) {
        return status;
      }
    }

    return statusForPrefix(f, key);
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

    if (wouldCreateWithoutOverwrite(dst, overwrite)) {
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

    Copy copy = transfers.copy(copyObjectRequest);
    copy.addProgressListener(new WriteOpsProgressListener(statistics));
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
      String key = pathToKey(f);
      if (isEmptyKey(key)) {
        break;
      }

      deleteFakeDirectoryIfEmpty(f, key);

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
    ObjectMetadata om = emptyObjectMetadata();
    PutObjectRequest putObjectRequest = new PutObjectRequest(bucketName, objectName,
        new EmptyInputStream(), om);
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

  // ------------------------------------------------------------------------
  // New helper methods and inner classes introduced to reduce complexity.
  // ------------------------------------------------------------------------

  /**
   * Extracts credentials embedded in the URI user info.
   */
  private static String[] extractUserCredentials(URI name, String accessKey, String secretKey) {
    String userInfo = name.getUserInfo();
    if (userInfo == null) {
      return new String[]{accessKey, secretKey};
    }

    int index = userInfo.indexOf(':');
    if (index == -1) {
      return new String[]{userInfo, secretKey};
    }

    return new String[]{userInfo.substring(0, index), userInfo.substring(index + 1)};
  }

  /**
   * Builds the AWS credentials provider chain.
   */
  private static AWSCredentialsProviderChain createCredentialsProvider(
      String accessKey, String secretKey) {
    return new AWSCredentialsProviderChain(
        new BasicAWSCredentialsProvider(accessKey, secretKey),
        new InstanceProfileCredentialsProvider(),
        new AnonymousAWSCredentialsProvider());
  }

  /**
   * Creates the AWS client configuration from the Hadoop configuration.
   */
  private ClientConfiguration createClientConfiguration(Configuration conf) {
    ClientConfiguration awsConf = new ClientConfiguration();
    awsConf.setMaxConnections(conf.getInt(MAXIMUM_CONNECTIONS,
        DEFAULT_MAXIMUM_CONNECTIONS));
    boolean secureConnections = conf.getBoolean(SECURE_CONNECTIONS,
        DEFAULT_SECURE_CONNECTIONS);
    awsConf.setProtocol(protocolFor(secureConnections));
    awsConf.setMaxErrorRetry(conf.getInt(MAX_ERROR_RETRIES,
        DEFAULT_MAX_ERROR_RETRIES));
    awsConf.setConnectionTimeout(conf.getInt(ESTABLISH_TIMEOUT,
        DEFAULT_ESTABLISH_TIMEOUT));
    awsConf.setSocketTimeout(conf.getInt(SOCKET_TIMEOUT,
        DEFAULT_SOCKET_TIMEOUT));

    configureProxy(conf, awsConf, secureConnections);
    return awsConf;
  }

  /**
   * Returns the protocol to use based on the secure-connections setting.
   */
  private static Protocol protocolFor(boolean secureConnections) {
    if (secureConnections) {
      return Protocol.HTTPS;
    }
    return Protocol.HTTP;
  }

  /**
   * Configures proxy settings on the AWS client configuration.
   */
  private void configureProxy(Configuration conf, ClientConfiguration awsConf,
      boolean secureConnections) {
    String proxyHost = conf.getTrimmed(PROXY_HOST, "");
    int proxyPort = conf.getInt(PROXY_PORT, -1);

    if (isEmptyKey(proxyHost)) {
      rejectProxyPortWithoutHost(proxyPort);
      return;
    }

    awsConf.setProxyHost(proxyHost);
    awsConf.setProxyPort(resolveProxyPort(proxyPort, secureConnections));

    String proxyUsername = conf.getTrimmed(PROXY_USERNAME);
    String proxyPassword = conf.getTrimmed(PROXY_PASSWORD);
    rejectMismatchedProxyCredentials(proxyUsername, proxyPassword);

    awsConf.setProxyUsername(proxyUsername);
    awsConf.setProxyPassword(proxyPassword);
    awsConf.setProxyDomain(conf.getTrimmed(PROXY_DOMAIN));
    awsConf.setProxyWorkstation(conf.getTrimmed(PROXY_WORKSTATION));

    logProxyConfiguration(awsConf);
  }

  /**
   * Resolves the proxy port when only the host is configured.
   */
  private static int resolveProxyPort(int proxyPort, boolean secureConnections) {
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
   * Throws if only one of the proxy credentials is set.
   */
  private static void rejectMismatchedProxyCredentials(String proxyUsername,
      String proxyPassword) {
    if (proxyCredentialsMismatched(proxyUsername, proxyPassword)) {
      String msg = "Proxy error: " + PROXY_USERNAME + " or " +
          PROXY_PASSWORD + " set without the other.";
      LOG.error(msg);
      throw new IllegalArgumentException(msg);
    }
  }

  /**
   * Predicate that detects mismatched proxy credentials.
   */
  private static boolean proxyCredentialsMismatched(String proxyUsername,
      String proxyPassword) {
    boolean usernameMissing = proxyUsername == null;
    boolean passwordMissing = proxyPassword == null;
    return usernameMissing != passwordMissing;
  }

  /**
   * Throws if a proxy port is set without a proxy host.
   */
  private static void rejectProxyPortWithoutHost(int proxyPort) {
    if (proxyPort < 0) {
      return;
    }

    String msg = "Proxy error: " + PROXY_PORT + " set without " + PROXY_HOST;
    LOG.error(msg);
    throw new IllegalArgumentException(msg);
  }

  /**
   * Logs the effective proxy configuration at debug level.
   */
  private void logProxyConfiguration(ClientConfiguration awsConf) {
    if (LOG.isDebugEnabled()) {
      LOG.debug("Using proxy server {}:{} as user {} with password {} on " +
              "domain {} as workstation {}", awsConf.getProxyHost(),
          awsConf.getProxyPort(), String.valueOf(awsConf.getProxyUsername()),
          awsConf.getProxyPassword(), awsConf.getProxyDomain(),
          awsConf.getProxyWorkstation());
    }
  }

  /**
   * Configures a custom S3 endpoint if one is supplied.
   */
  private void configureEndpoint(Configuration conf) {
    String endPoint = conf.getTrimmed(ENDPOINT, "");
    if (isEmptyKey(endPoint)) {
      return;
    }

    try {
      s3.setEndpoint(endPoint);
    } catch (IllegalArgumentException e) {
      String msg = "Incorrect endpoint: " + e.getMessage();
      LOG.error(msg);
      throw new IllegalArgumentException(msg, e);
    }
  }

  /**
   * Enforces the minimum allowed multipart part size.
   */
  private long ensureMinimumPartSize(long size) {
    if (size < 5 * 1024 * 1024) {
      LOG.error(MULTIPART_SIZE + " must be at least 5 MB");
      return 5 * 1024 * 1024;
    }
    return size;
  }

  /**
   * Enforces the minimum allowed multipart threshold.
   */
  private int ensureMinimumMultipartThreshold(int threshold) {
    if (threshold < 5 * 1024 * 1024) {
      LOG.error(MIN_MULTIPART_THRESHOLD + " must be at least 5 MB");
      return 5 * 1024 * 1024;
    }
    return threshold;
  }

  /**
   * Initializes the shared transfer thread pool.
   */
  private void initThreadPool(Configuration conf) {
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
  }

  /**
   * Initializes the S3 transfer manager.
   */
  private void initTransferManager() {
    TransferManagerConfiguration transferConfiguration = new TransferManagerConfiguration();
    transferConfiguration.setMinimumUploadPartSize(partSize);
    transferConfiguration.setMultipartUploadThreshold(multiPartThreshold);

    transfers = new TransferManager(s3, threadPoolExecutor);
    transfers.setConfiguration(transferConfiguration);
  }

  /**
   * Initializes the canned ACL setting.
   */
  private void initCannedAcl(Configuration conf) {
    String cannedACLName = conf.get(CANNED_ACL, DEFAULT_CANNED_ACL);
    if (isEmptyKey(cannedACLName)) {
      cannedACL = null;
    } else {
      cannedACL = CannedAccessControlList.valueOf(cannedACLName);
    }
  }

  /**
   * Verifies that the configured bucket exists.
   */
  private void verifyBucketExists() throws IOException {
    if (!s3.doesBucketExist(bucket)) {
      throw new IOException("Bucket " + bucket + " does not exist");
    }
  }

  /**
   * Aborts stale multipart uploads when configured to do so.
   */
  private void purgeExistingMultipartUploads(Configuration conf) {
    boolean purgeExistingMultipart = conf.getBoolean(PURGE_EXISTING_MULTIPART,
        DEFAULT_PURGE_EXISTING_MULTIPART);
    if (!purgeExistingMultipart) {
      return;
    }

    long purgeExistingMultipartAge = conf.getLong(PURGE_EXISTING_MULTIPART_AGE,
        DEFAULT_PURGE_EXISTING_MULTIPART_AGE);
    Date purgeBefore = new Date(new Date().getTime() - purgeExistingMultipartAge * 1000);

    transfers.abortMultipartUploads(bucket, purgeBefore);
  }

  /**
   * Predicate: true when the supplied key string is empty.
   */
  private static boolean isEmptyKey(String key) {
    return key.isEmpty();
  }

  /**
   * Predicate: true when the supplied key represents the root path.
   */
  private static boolean isRootKey(String key) {
    return "/".equals(key);
  }

  /**
   * Predicate: true when the path resolves to the root key.
   */
  private boolean isRootPath(Path path) {
    return isEmptyKey(pathToKey(path));
  }

  /**
   * Predicate: true when the two paths have the same parent instance.
   */
  private static boolean haveSameParent(Path src, Path dst) {
    return src.getParent() == dst.getParent();
  }

  /**
   * Appends a trailing slash to a key when one is missing.
   */
  private static String maybeAppendSlash(String key) {
    if (key.endsWith("/")) {
      return key;
    }
    return key + "/";
  }

  /**
   * Computes the directory-listing prefix for a key.
   */
  private static String directoryPrefix(String key) {
    if (isEmptyKey(key)) {
      return key;
    }
    if (key.endsWith("/")) {
      return key;
    }
    return key + "/";
  }

  /**
   * Predicate: true when a create would overwrite an existing path without permission.
   */
  private boolean wouldCreateWithoutOverwrite(Path f, boolean overwrite) throws IOException {
    if (overwrite) {
      return false;
    }
    return exists(f);
  }

  /**
   * Predicate: true when the fast-upload configuration is enabled.
   */
  private boolean isFastUploadEnabled() {
    return getConf().getBoolean(FAST_UPLOAD, DEFAULT_FAST_UPLOAD);
  }

  /**
   * Returns the file status for a path, or null when it does not exist.
   */
  private S3AFileStatus getStatusOrNull(Path f) throws IOException {
    try {
      return getFileStatus(f);
    } catch (FileNotFoundException e) {
      return null;
    }
  }

  /**
   * Predicate: true when the destination represents an existing directory.
   */
  private static boolean isExistingDirectory(S3AFileStatus status) {
    if (status == null) {
      return false;
    }
    return status.isDirectory();
  }

  /**
   * Predicate: true when the destination parent is a valid directory for a rename.
   */
  private boolean parentOfDstIsValidDirectory(Path dst) throws IOException {
    Path parent = dst.getParent();
    if (isRootPath(parent)) {
      return true;
    }
    return isExistingDirectory(getStatusOrNull(parent));
  }

  /**
   * Predicate: true when the rename is allowed based on the source and destination types.
   */
  private boolean renameTypesAllowed(S3AFileStatus srcStatus, S3AFileStatus dstStatus) {
    if (isDirectoryToFileRename(srcStatus, dstStatus)) {
      if (LOG.isDebugEnabled()) {
        LOG.debug("rename: src is a directory and dst is a file");
      }
      return false;
    }

    return !isNonEmptyDirectory(dstStatus);
  }

  /**
   * Predicate: true when the source is a directory and the destination is a file.
   */
  private static boolean isDirectoryToFileRename(S3AFileStatus srcStatus,
      S3AFileStatus dstStatus) {
    if (!srcStatus.isDirectory()) {
      return false;
    }
    return dstStatus.isFile();
  }

  /**
   * Predicate: true when the status represents a non-empty directory.
   */
  private static boolean isNonEmptyDirectory(S3AFileStatus status) {
    if (!status.isDirectory()) {
      return false;
    }
    return !status.isEmptyDirectory();
  }

  /**
   * Renames a file to the destination path.
   */
  private void renameFile(Path src, String srcKey, String dstKey,
      S3AFileStatus dstStatus) throws IOException {
    if (LOG.isDebugEnabled()) {
      LOG.debug("rename: renaming file " + src + " to " + dstKey);
    }

    String targetKey = dstKey;
    if (dstStatus != null && dstStatus.isDirectory()) {
      targetKey = childKey(dstKey, srcKey, pathToKey(src.getParent()));
    }

    copyFile(srcKey, targetKey);
    delete(src, false);
  }

  /**
   * Computes the destination key for a file being moved into a directory.
   */
  private static String childKey(String dstKey, String srcKey, String parentKey) {
    String directoryKey = maybeAppendSlash(dstKey);
    String filename = srcKey.substring(parentKey.length() + 1);
    return directoryKey + filename;
  }

  /**
   * Predicate: true when a directory rename to the given destination is valid.
   */
  private boolean canRenameDirectory(String srcKey, String dstKey) {
    String normalizedSrc = maybeAppendSlash(srcKey);
    String normalizedDst = maybeAppendSlash(dstKey);

    if (normalizedDst.startsWith(normalizedSrc)) {
      if (LOG.isDebugEnabled()) {
        LOG.debug("cannot rename a directory to a subdirectory of self");
      }
      return false;
    }
    return true;
  }

  /**
   * Renames a directory and all of its contents.
   */
  private void renameDirectory(String srcKey, String dstKey, S3AFileStatus dstStatus)
      throws IOException {
    if (LOG.isDebugEnabled()) {
      LOG.debug("rename: renaming directory " + srcKey + " to " + dstKey);
    }

    String normalizedSrc = maybeAppendSlash(srcKey);
    String normalizedDst = maybeAppendSlash(dstKey);

    List<DeleteObjectsRequest.KeyVersion> keysToDelete = new ArrayList<>();
    if (dstStatus != null && dstStatus.isEmptyDirectory()) {
      keysToDelete.add(new DeleteObjectsRequest.KeyVersion(normalizedDst));
    }

    copyDirectoryContents(normalizedSrc, normalizedDst, keysToDelete);
  }

  /**
   * Copies all objects under a source prefix to a destination prefix.
   */
  private void copyDirectoryContents(String srcKey, String dstKey,
      List<DeleteObjectsRequest.KeyVersion> keysToDelete) throws IOException {
    ListObjectsRequest request = new ListObjectsRequest();
    request.setBucketName(bucket);
    request.setPrefix(srcKey);
    request.setMaxKeys(maxKeys);

    ObjectListing objects = s3.listObjects(request);
    statistics.incrementReadOps(1);

    while (true) {
      processObjectListing(objects, srcKey, dstKey, keysToDelete);

      if (!objects.isTruncated()) {
        flushDeletions(keysToDelete);
        break;
      }

      objects = s3.listNextBatchOfObjects(objects);
      statistics.incrementReadOps(1);
    }
  }

  /**
   * Processes one page of a directory listing during a rename.
   */
  private void processObjectListing(ObjectListing objects, String srcKey, String dstKey,
      List<DeleteObjectsRequest.KeyVersion> keysToDelete) throws IOException {
    for (S3ObjectSummary summary : objects.getObjectSummaries()) {
      keysToDelete.add(new DeleteObjectsRequest.KeyVersion(summary.getKey()));
      String newDstKey = dstKey + summary.getKey().substring(srcKey.length());
      copyFile(summary.getKey(), newDstKey);

      if (keysToDelete.size() == MAX_ENTRIES_TO_DELETE) {
        deleteKeys(keysToDelete);
      }
    }
  }

  /**
   * Deletes any remaining keys collected during a bulk operation.
   */
  private void flushDeletions(List<DeleteObjectsRequest.KeyVersion> keysToDelete) {
    if (!keysToDelete.isEmpty()) {
      deleteKeys(keysToDelete);
    }
  }

  /**
   * Deletes a batch of keys from S3.
   */
  private void deleteKeys(List<DeleteObjectsRequest.KeyVersion> keysToDelete) {
    DeleteObjectsRequest deleteRequest =
        new DeleteObjectsRequest(bucket).withKeys(keysToDelete);
    s3.deleteObjects(deleteRequest);
    statistics.incrementWriteOps(1);
    keysToDelete.clear();
  }

  /**
   * Deletes a directory and its contents.
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

    String normalizedKey = maybeAppendSlash(key);
    if (isRootKey(normalizedKey)) {
      LOG.info("s3a cannot delete the root directory");
      return false;
    }

    if (status.isEmptyDirectory()) {
      deleteEmptyDirectory(normalizedKey);
    } else {
      deleteDirectoryContents(normalizedKey);
    }

    createFakeDirectoryIfNecessary(f.getParent());
    return true;
  }

  /**
   * Deletes a single file.
   */
  private boolean deleteFile(String key) throws IOException {
    if (LOG.isDebugEnabled()) {
      LOG.debug("delete: Path is a file");
    }
    s3.deleteObject(bucket, key);
    statistics.incrementWriteOps(1);
    createFakeDirectoryIfNecessary(keyToPath(key).getParent());
    return true;
  }

  /**
   * Deletes the contents of a directory prefix.
   */
  private void deleteDirectoryContents(String key) throws IOException {
    if (LOG.isDebugEnabled()) {
      LOG.debug("Getting objects for directory prefix " + key + " to delete");
    }

    ListObjectsRequest request = new ListObjectsRequest();
    request.setBucketName(bucket);
    request.setPrefix(key);
    request.setMaxKeys(maxKeys);

    List<DeleteObjectsRequest.KeyVersion> keys = new ArrayList<>();
    ObjectListing objects = s3.listObjects(request);
    statistics.incrementReadOps(1);

    while (true) {
      collectKeysToDelete(objects, keys);

      if (!objects.isTruncated()) {
        flushDeletions(keys);
        break;
      }

      objects = s3.listNextBatchOfObjects(objects);
      statistics.incrementReadOps(1);
    }
  }

  /**
   * Collects keys from one page of a directory listing for deletion.
   */
  private void collectKeysToDelete(ObjectListing objects,
      List<DeleteObjectsRequest.KeyVersion> keys) {
    for (S3ObjectSummary summary : objects.getObjectSummaries()) {
      keys.add(new DeleteObjectsRequest.KeyVersion(summary.getKey()));
      if (LOG.isDebugEnabled()) {
        LOG.debug("Got object to delete " + summary.getKey());
      }

      if (keys.size() == MAX_ENTRIES_TO_DELETE) {
        deleteKeys(keys);
      }
    }
  }

  /**
   * Deletes a single fake empty directory marker.
   */
  private void deleteEmptyDirectory(String key) {
    if (LOG.isDebugEnabled()) {
      LOG.debug("Deleting fake empty directory");
    }
    s3.deleteObject(bucket, key);
    statistics.incrementWriteOps(1);
  }

  /**
   * Lists the contents of a directory into the supplied result list.
   */
  private void listDirectoryStatus(Path f, String key, List<FileStatus> result)
      throws IOException {
    String prefix = directoryPrefix(key);

    ListObjectsRequest request = new ListObjectsRequest();
    request.setBucketName(bucket);
    request.setPrefix(prefix);
    request.setDelimiter("/");
    request.setMaxKeys(maxKeys);

    if (LOG.isDebugEnabled()) {
      LOG.debug("listStatus: doing listObjects for directory " + prefix);
    }

    ObjectListing objects = s3.listObjects(request);
    statistics.incrementReadOps(1);

    while (true) {
      addListingToResult(f, objects, result);

      if (!objects.isTruncated()) {
        break;
      }

      if (LOG.isDebugEnabled()) {
        LOG.debug("listStatus: list truncated - getting next batch");
      }
      objects = s3.listNextBatchOfObjects(objects);
      statistics.incrementReadOps(1);
    }
  }

  /**
   * Adds one page of listing entries to the result list.
   */
  private void addListingToResult(Path f, ObjectListing objects, List<FileStatus> result) {
    for (S3ObjectSummary summary : objects.getObjectSummaries()) {
      addObjectSummary(f, summary, result);
    }

    for (String prefix : objects.getCommonPrefixes()) {
      addCommonPrefix(f, prefix, result);
    }
  }

  /**
   * Adds a single object summary to the result list.
   */
  private void addObjectSummary(Path f, S3ObjectSummary summary, List<FileStatus> result) {
    Path keyPath = keyToPath(summary.getKey()).makeQualified(uri, workingDir);

    if (shouldIgnoreListingEntry(keyPath, f, summary.getKey())) {
      if (LOG.isDebugEnabled()) {
        LOG.debug("Ignoring: " + keyPath);
      }
      return;
    }

    if (objectRepresentsDirectory(summary.getKey(), summary.getSize())) {
      result.add(new S3AFileStatus(true, true, keyPath));
      if (LOG.isDebugEnabled()) {
        LOG.debug("Adding: fd: " + keyPath);
      }
      return;
    }

    result.add(new S3AFileStatus(summary.getSize(),
        dateToLong(summary.getLastModified()), keyPath,
        getDefaultBlockSize(f.makeQualified(uri, workingDir))));
    if (LOG.isDebugEnabled()) {
      LOG.debug("Adding: fi: " + keyPath);
    }
  }

  /**
   * Predicate: true when a listing entry should be skipped.
   */
  private boolean shouldIgnoreListingEntry(Path keyPath, Path f, String key) {
    if (keyPath.equals(f)) {
      return true;
    }
    return key.endsWith(S3N_FOLDER_SUFFIX);
  }

  /**
   * Adds a single common prefix (subdirectory) to the result list.
   */
  private void addCommonPrefix(Path f, String prefix, List<FileStatus> result) {
    Path keyPath = keyToPath(prefix).makeQualified(uri, workingDir);
    if (keyPath.equals(f)) {
      return;
    }
    result.add(new S3AFileStatus(true, false, keyPath));
    if (LOG.isDebugEnabled()) {
      LOG.debug("Adding: rd: " + keyPath);
    }
  }

  /**
   * Handles the case where the mkdirs target already exists.
   */
  private boolean handleExistingPathForMkdirs(Path f, S3AFileStatus status)
      throws IOException {
    if (status.isDirectory()) {
      return true;
    }
    throw new FileAlreadyExistsException("Path is a file: " + f);
  }

  /**
   * Ensures that no ancestor of the target path is a file.
   */
  private void ensureNoFileAncestors(Path f) throws IOException {
    Path current = f;
    while (current != null) {
      S3AFileStatus status = getStatusOrNull(current);
      if (status != null && status.isFile()) {
        throw new FileAlreadyExistsException(String.format(
            "Can't make directory for path '%s' since it is a file.",
            current));
      }
      current = current.getParent();
    }
  }

  /**
   * Resolves the status for an exact key lookup.
   */
  private S3AFileStatus statusForExactKey(Path f, String key) throws IOException {
    try {
      ObjectMetadata meta = s3.getObjectMetadata(bucket, key);
      statistics.incrementReadOps(1);
      return fileStatusFromMetadata(f, key, meta);
    } catch (AmazonServiceException e) {
      if (e.getStatusCode() != 404) {
        logAndThrowAmazonServiceException(e);
      }
    } catch (AmazonClientException e) {
      logAndThrowAmazonClientException(e);
    }
    return null;
  }

  /**
   * Builds a file status from object metadata for an exact key.
   */
  private S3AFileStatus fileStatusFromMetadata(Path f, String key, ObjectMetadata meta) {
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
   * Resolves the status for a key with a trailing slash appended.
   */
  private S3AFileStatus statusForKeyWithSlash(Path f, String key) throws IOException {
    try {
      String newKey = key + "/";
      ObjectMetadata meta = s3.getObjectMetadata(bucket, newKey);
      statistics.incrementReadOps(1);
      return fileStatusWithSlashFromMetadata(f, newKey, meta);
    } catch (AmazonServiceException e) {
      if (e.getStatusCode() != 404) {
        logAndThrowAmazonServiceException(e);
      }
    } catch (AmazonClientException e) {
      logAndThrowAmazonClientException(e);
    }
    return null;
  }

  /**
   * Builds a file status from object metadata for a slash-suffixed key.
   */
  private S3AFileStatus fileStatusWithSlashFromMetadata(Path f, String newKey,
      ObjectMetadata meta) {
    if (objectRepresentsDirectory(newKey, meta.getContentLength())) {
      if (LOG.isDebugEnabled()) {
        LOG.debug("Found file (with /): fake directory");
      }
      return new S3AFileStatus(true, true, f.makeQualified(uri, workingDir));
    }

    LOG.warn("Found file (with /): real file? should not happen: {}", newKey);
    return new S3AFileStatus(meta.getContentLength(),
        dateToLong(meta.getLastModified()),
        f.makeQualified(uri, workingDir),
        getDefaultBlockSize(f.makeQualified(uri, workingDir)));
  }

  /**
   * Resolves the status by listing the key prefix.
   */
  private S3AFileStatus statusForPrefix(Path f, String key) throws IOException {
    try {
      String prefix = directoryPrefix(key);

      ListObjectsRequest request = new ListObjectsRequest();
      request.setBucketName(bucket);
      request.setPrefix(prefix);
      request.setDelimiter("/");
      request.setMaxKeys(1);

      ObjectListing objects = s3.listObjects(request);
      statistics.incrementReadOps(1);

      if (hasAnyPrefixOrObject(objects)) {
        logDirectoryFound(f, objects);
        return new S3AFileStatus(true, false,
            f.makeQualified(uri, workingDir));
      }
    } catch (AmazonServiceException e) {
      if (e.getStatusCode() != 404) {
        logAndThrowAmazonServiceException(e);
      }
    } catch (AmazonClientException e) {
      logAndThrowAmazonClientException(e);
    }

    if (LOG.isDebugEnabled()) {
      LOG.debug("Not Found: " + f);
    }
    throw new FileNotFoundException("No such file or directory: " + f);
  }

  /**
   * Predicate: true when the listing contains at least one prefix or object.
   */
  private static boolean hasAnyPrefixOrObject(ObjectListing objects) {
    if (!objects.getCommonPrefixes().isEmpty()) {
      return true;
    }
    return objects.getObjectSummaries().size() > 0;
  }

  /**
   * Logs the directory listing result at debug level.
   */
  private void logDirectoryFound(Path f, ObjectListing objects) {
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
   * Logs and rethrows an AmazonServiceException.
   */
  private void logAndThrowAmazonServiceException(AmazonServiceException e)
      throws AmazonServiceException {
    printAmazonServiceException(e);
    throw e;
  }

  /**
   * Logs and rethrows an AmazonClientException.
   */
  private void logAndThrowAmazonClientException(AmazonClientException e)
      throws AmazonClientException {
    printAmazonClientException(e);
    throw e;
  }

  /**
   * Builds a put-object request for a local file upload.
   */
  private PutObjectRequest createPutObjectRequest(String key, File srcfile) {
    ObjectMetadata om = new ObjectMetadata();
    if (StringUtils.isNotBlank(serverSideEncryptionAlgorithm)) {
      om.setServerSideEncryption(serverSideEncryptionAlgorithm);
    }
    PutObjectRequest putObjectRequest = new PutObjectRequest(bucket, key, srcfile);
    putObjectRequest.setCannedAcl(cannedACL);
    putObjectRequest.setMetadata(om);
    return putObjectRequest;
  }

  /**
   * Uploads a put-object request and waits for completion.
   */
  private void uploadAndWait(PutObjectRequest putObjectRequest) throws IOException {
    Upload up = transfers.upload(putObjectRequest);
    up.addProgressListener(new WriteOpsProgressListener(statistics));
    try {
      up.waitForUploadResult();
      statistics.incrementWriteOps(1);
    } catch (InterruptedException e) {
      throw new IOException("Got interrupted, cancelling");
    }
  }

  /**
   * Builds a copy-object request.
   */
  private CopyObjectRequest createCopyObjectRequest(String srcKey, String dstKey,
      ObjectMetadata srcom) {
    ObjectMetadata dstom = srcom.clone();
    if (StringUtils.isNotBlank(serverSideEncryptionAlgorithm)) {
      dstom.setServerSideEncryption(serverSideEncryptionAlgorithm);
    }
    CopyObjectRequest copyObjectRequest = new CopyObjectRequest(bucket, srcKey, bucket, dstKey);
    copyObjectRequest.setCannedAccessControlList(cannedACL);
    copyObjectRequest.setNewObjectMetadata(dstom);
    return copyObjectRequest;
  }

  /**
   * Builds the metadata for a zero-byte object.
   */
  private ObjectMetadata emptyObjectMetadata() {
    ObjectMetadata om = new ObjectMetadata();
    om.setContentLength(0L);
    if (StringUtils.isNotBlank(serverSideEncryptionAlgorithm)) {
      om.setServerSideEncryption(serverSideEncryptionAlgorithm);
    }
    return om;
  }

  /**
   * Deletes a fake directory marker when it is empty.
   */
  private void deleteFakeDirectoryIfEmpty(Path f, String key) throws IOException {
    try {
      S3AFileStatus status = getFileStatus(f);
      if (isEmptyFakeDirectory(status)) {
        if (LOG.isDebugEnabled()) {
          LOG.debug("Deleting fake directory " + key + "/");
        }
        s3.deleteObject(bucket, key + "/");
        statistics.incrementWriteOps(1);
      }
    } catch (FileNotFoundException | AmazonServiceException e) {
      // ignore
    }
  }

  /**
   * Predicate: true when the status represents an empty fake directory.
   */
  private static boolean isEmptyFakeDirectory(S3AFileStatus status) {
    if (!status.isDirectory()) {
      return false;
    }
    return status.isEmptyDirectory();
  }

  /**
   * Thread factory that names each created thread uniquely.
   */
  private static final class NamedThreadFactory implements ThreadFactory {
    private final AtomicInteger threadNumber = new AtomicInteger(1);
    private final int poolNum;
    private final ThreadGroup group;
    private final String prefix;

    NamedThreadFactory(String prefix) {
      this.prefix = prefix;
      this.poolNum = poolNumber.getAndIncrement();
      SecurityManager s = System.getSecurityManager();
      ThreadGroup threadGroup;
      if (s != null) {
        threadGroup = s.getThreadGroup();
      } else {
        threadGroup = Thread.currentThread().getThreadGroup();
      }
      this.group = threadGroup;
    }

    @Override
    public Thread newThread(Runnable r) {
      String name = prefix + "-pool" + poolNum + "-t" + threadNumber.getAndIncrement();
      return new Thread(group, r, name);
    }
  }

  /**
   * Thread factory that wraps another factory and ensures daemon threads.
   */
  private static final class DaemonThreadFactory implements ThreadFactory {
    private final ThreadFactory namedFactory;

    DaemonThreadFactory(ThreadFactory namedFactory) {
      this.namedFactory = namedFactory;
    }

    @Override
    public Thread newThread(Runnable r) {
      Thread t = namedFactory.newThread(r);
      if (t.isDaemon()) {
        return t;
      }
      t.setDaemon(true);

      if (t.getPriority() == Thread.NORM_PRIORITY) {
        return t;
      }
      t.setPriority(Thread.NORM_PRIORITY);
      return t;
    }
  }

  /**
   * Progress listener that increments write operations on part completion.
   */
  private static final class WriteOpsProgressListener implements ProgressListener {
    private final FileSystem.Statistics stats;

    WriteOpsProgressListener(FileSystem.Statistics stats) {
      this.stats = stats;
    }

    @Override
    public void progressChanged(ProgressEvent progressEvent) {
      if (progressEvent.getEventCode() == ProgressEvent.PART_COMPLETED_EVENT_CODE) {
        stats.incrementWriteOps(1);
      }
    }
  }

  /**
   * Input stream that reports end-of-stream immediately.
   */
  private static final class EmptyInputStream extends InputStream {
    @Override
    public int read() throws IOException {
      return -1;
    }
  }
}