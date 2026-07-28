// ...

static Map<String, Object> jsonParse(final HttpURLConnection c, final boolean useErrorStream) throws IOException {
    if (c.getContentLength() == 0) {
        return null;
    }
    final InputStream in = useErrorStream ? c.getErrorStream() : c.getInputStream();
    if (in == null) {
        throw new IOException("The " + (useErrorStream ? "error" : "input") + " stream is null.");
    }
    try {
        final String contentType = c.getContentType();
        if (contentType != null) {
            final MediaType parsed = MediaType.valueOf(contentType);
            if (!MediaType.APPLICATION_JSON_TYPE.isCompatible(parsed)) {
                throw new IOException("Content-Type \"" + contentType + "\" is incompatible with \"" + MediaType.APPLICATION_JSON + "\" (parsed=\"" + parsed + "\")");
            }
        }
        ObjectMapper mapper = new ObjectMapper();
        return mapper.reader(Map.class).readValue(in);
    } finally {
        in.close();
    }
}

// ...

private static Map<String, Object> validateResponse(final HttpOpParam.Op op, final HttpURLConnection conn, boolean unwrapException) throws IOException {
    final int code = conn.getResponseCode();
    // server is demanding an authentication we don't support
    if (code == HttpURLConnection.HTTP_UNAUTHORIZED) {
        // match hdfs/rpc exception
        throw new AccessControlException(conn.getResponseMessage());
    }
    if (code != op.getExpectedHttpResponseCode()) {
        final Map<String, Object> m;
        try {
            m = jsonParse(conn, true);
        } catch (Exception e) {
            throw new IOException("Unexpected HTTP response: code=" + code + " != " + op.getExpectedHttpResponseCode() + ", " + op.toQueryString() + ", message=" + conn.getResponseMessage(), e);
        }

        if (m == null) {
            throw new IOException("Unexpected HTTP response: code=" + code + " != " + op.getExpectedHttpResponseCode() + ", " + op.toQueryString() + ", message=" + conn.getResponseMessage());
        } else if (m.get(RemoteException.class.getSimpleName()) == null) {
            return m;
        }

        IOException re = JsonUtil.toRemoteException(m);
        // extract UGI-related exceptions and unwrap InvalidToken
        // the NN mangles these exceptions but the DN does not and may need
        // to re-fetch a token if either report the token is expired
        if (re.getMessage() != null && re.getMessage().startsWith(SecurityUtil.FAILED_TO_GET_UGI_MSG_HEADER)) {
            String[] parts = re.getMessage().split(":\\s+", 3);
            re = new RemoteException(parts[1], parts[2]);
            re = ((RemoteException) re).unwrapRemoteException(InvalidToken.class);
        }
        throw unwrapException ? toIOException(re) : re;
    }
    return null;
}

// ...

private synchronized InetSocketAddress getCurrentNNAddr() {
    return nnAddrs[currentNNAddrIndex];
}

// ...

private synchronized void resetStateToFailOver() {
    currentNNAddrIndex = (currentNNAddrIndex + 1) % nnAddrs.length;
}

// ...

private URL getNamenodeURL(String path, String query) throws IOException {
    InetSocketAddress nnAddr = getCurrentNNAddr();
    final URL url = new URL(getTransportScheme(), nnAddr.getHostName(), nnAddr.getPort(), path + '?' + query);
    if (LOG.isTraceEnabled()) {
        LOG.trace("url=" + url);
    }
    return url;
}

// ...

Param<String, Object>[] getAuthParameters(final HttpOpParam.Op op) throws IOException {
    List<Param<String, Object>> authParams = Lists.newArrayList();
    // Skip adding delegation token for token operations because these
    // operations require authentication.
    Token<?> token = null;
    if (!op.getRequireAuth()) {
        token = getDelegationToken();
    }
    if (token != null) {
        authParams.add(new DelegationParam(token.encodeToUrlString()));
    } else {
        UserGroupInformation userUgi = ugi;
        UserGroupInformation realUgi = userUgi.getRealUser();
        if (realUgi != null) { // proxy user
            authParams.add(new DoAsParam(userUgi.getShortUserName()));
            userUgi = realUgi;
        }
        authParams.add(new UserParam(userUgi.getShortUserName()));
    }
    return authParams.toArray(new Param[0]);
}

// ...

URL toUrl(final HttpOpParam.Op op, final Path fspath, final Param<String, Object>... parameters) throws IOException {
    // initialize URI path and query
    final String path = PATH_PREFIX + (fspath == null ? "/" : makeQualified(fspath).toUri().getRawPath());
    final String query = op.toQueryString() + Param.toSortedString("&", getAuthParameters(op)) + Param.toSortedString("&", parameters);
    final URL url = getNamenodeURL(path, query);
    if (LOG.isTraceEnabled()) {
        LOG.trace("url=" + url);
    }
    return url;
}

// ...

abstract class AbstractRunner<T> {
    abstract protected URL getUrl() throws IOException;

    protected final HttpOpParam.Op op;
    private final boolean redirected;
    protected ExcludeDatanodesParam excludeDatanodes = new ExcludeDatanodesParam("");

    private boolean checkRetry;

    protected AbstractRunner(final HttpOpParam.Op op, boolean redirected) {
        this.op = op;
        this.redirected = redirected;
    }

    T run() throws IOException {
        UserGroupInformation connectUgi = ugi.getRealUser();
        if (connectUgi == null) {
            connectUgi = ugi;
        }
        if (op.getRequireAuth()) {
            connectUgi.checkTGTAndReloginFromKeytab();
        }
        try {
            // the entire lifecycle of the connection must be run inside the
            // doAs to ensure authentication is performed correctly
            return connectUgi.doAs(new PrivilegedExceptionAction<T>() {
                @Override
                public T run() throws IOException {
                    return runWithRetry();
                }
            });
        } catch (InterruptedException e) {
            throw new IOException(e);
        }
    }

    // ...
}

// ...

private FsPermission applyUMask(FsPermission permission) {
    if (permission == null) {
        permission = FsPermission.getDefault();
    }
    return permission.applyUMask(FsPermission.getUMask(getConf()));
}

// ...

private HdfsFileStatus getHdfsFileStatus(Path f) throws IOException {
    final HttpOpParam.Op op = GetOpParam.Op.GETFILESTATUS;
    HdfsFileStatus status = new FsPathResponseRunner<HdfsFileStatus>(op, f) {
        @Override
        HdfsFileStatus decodeResponse(Map<String, Object> json) {
            return JsonUtil.toFileStatus(json, true);
        }
    }.run();
    if (status == null) {
        throw new FileNotFoundException("File does not exist: " + f);
    }
    return status;
}

// ...

@Override
public FileStatus getFileStatus(Path f) throws IOException {
    statistics.incrementReadOps(1);
    return makeQualified(getHdfsFileStatus(f), f);
}

// ...

private FileStatus makeQualified(HdfsFileStatus f, Path parent) {
    return new FileStatus(f.getLen(), f.isDir(), f.getReplication(), f.getBlockSize(), f.getModificationTime(), f.getAccessTime(), f.getPermission(), f.getOwner(), f.getGroup(), f.isSymlink() ? new Path(f.getSymlink()) : null, f.getFullPath(parent).makeQualified(getUri(), getWorkingDirectory()));
}

// ...

@Override
public AclStatus getAclStatus(Path f) throws IOException {
    final HttpOpParam.Op op = GetOpParam.Op.GETACLSTATUS;
    AclStatus status = new FsPathResponseRunner<AclStatus>(op, f) {
        @Override
        AclStatus decodeResponse(Map<String, Object> json) {
            return JsonUtil.toAclStatus(json);
        }
    }.run();
    if (status == null) {
        throw new FileNotFoundException("File does not exist: " + f);
    }
    return status;
}

// ...

@Override
public boolean mkdirs(Path f, FsPermission permission) throws IOException {
    statistics.incrementWriteOps(1);
    final HttpOpParam.Op op = PutOpParam.Op.MKDIRS;
    return new FsPathBooleanRunner(op, f, new PermissionParam(applyUMask(permission))).run();
}

// ...

@Override
public void createSymlink(Path destination, Path f, boolean createParent) throws IOException {
    statistics.incrementWriteOps(1);
    final HttpOpParam.Op op = PutOpParam.Op.CREATESYMLINK;
    new FsPathRunner(op, f, new DestinationParam(makeQualified(destination).toUri().getPath()), new CreateParentParam(createParent)).run();
}

// ...

@Override
public boolean rename(final Path src, final Path dst) throws IOException {
    statistics.incrementWriteOps(1);
    final HttpOpParam.Op op = PutOpParam.Op.RENAME;
    return new FsPathBooleanRunner(op, src, new DestinationParam(makeQualified(dst).toUri().getPath())).run();
}

// ...

@Override
public void setXAttr(Path p, String name, byte[] value, EnumSet<XAttrSetFlag> flag) throws IOException {
    statistics.incrementWriteOps(1);
    final HttpOpParam.Op op = PutOpParam.Op.SETXATTR;
    if (value != null) {
        new FsPathRunner(op, p, new XAttrNameParam(name), new XAttrValueParam(XAttrCodec.encodeValue(value, XAttrCodec.HEX)), new XAttrSetFlagParam(flag)).run();
    } else {
        new FsPathRunner(op, p, new XAttrNameParam(name), new XAttrSetFlagParam(flag)).run();
    }
}

// ...

@Override
public byte[] getXAttr(Path p, final String name) throws IOException {
    final HttpOpParam.Op op = GetOpParam.Op.GETXATTRS;
    return new FsPathResponseRunner<byte[]>(op, p, new XAttrNameParam(name), new XAttrEncodingParam(XAttrCodec.HEX)) {
        @Override
        byte[] decodeResponse(Map<String, Object> json) throws IOException {
            return JsonUtil.getXAttr(json, name);
        }
    }.run();
}

// ...

@Override
public Map<String, byte[]> getXAttrs(Path p) throws IOException {
    final HttpOpParam.Op op = GetOpParam.Op.GETXATTRS;
    return new FsPathResponseRunner<Map<String, byte[]>>(op, p, new XAttrEncodingParam(XAttrCodec.HEX)) {
        @Override
        Map<String, byte[]> decodeResponse(Map<String, Object> json) throws IOException {
            return JsonUtil.toXAttrs(json);
        }
    }.run();
}

// ...

@Override
public Map<String, byte[]> getXAttrs(Path p, final List<String> names) throws IOException {
    Preconditions.checkArgument(names != null && !names.isEmpty(), "XAttr names cannot be null or empty.");
    Param<String, Object>[] parameters = new Param[names.size() + 1];
    for (int i = 0; i < parameters.length - 1; i++) {
        parameters[i] = new XAttrNameParam(names.get(i));
    }
    parameters[parameters.length - 1] = new XAttrEncodingParam(XAttrCodec.HEX);

    final HttpOpParam.Op op = GetOpParam.Op.GETXATTRS;
    return new FsPathResponseRunner<Map<String, byte[]>>(op, parameters, p) {
        @Override
        Map<String, byte[]> decodeResponse(Map<String, Object> json) throws IOException {
            return JsonUtil.toXAttrs(json);
        }
    }.run();
}

// ...

@Override
public List<String> listXAttrs(Path p) throws IOException {
    final HttpOpParam.Op op = GetOpParam.Op.LISTXATTRS;
    return new FsPathResponseRunner<List<String>>(op, p) {
        @Override
        List<String> decodeResponse(Map<String, Object> json) throws IOException {
            return JsonUtil.toXAttrNames(json);
        }
    }.run();
}

// ...

@Override
public void removeXAttr(Path p, String name) throws IOException {
    statistics.incrementWriteOps(1);
    final HttpOpParam.Op op = PutOpParam.Op.REMOVEXATTR;
    new FsPathRunner(op, p, new XAttrNameParam(name)).run();
}

// ...

@Override
public void setOwner(final Path p, final String owner, final String group) throws IOException {
    if (owner == null && group == null) {
        throw new IOException("owner == null && group == null");
    }

    statistics.incrementWriteOps(1);
    final HttpOpParam.Op op = PutOpParam.Op.SETOWNER;
    new FsPathRunner(op, p, new OwnerParam(owner), new GroupParam(group)).run();
}

// ...

@Override
public void setPermission(final Path p, final FsPermission permission) throws IOException {
    statistics.incrementWriteOps(1);
    final HttpOpParam.Op op = PutOpParam.Op.SETPERMISSION;
    new FsPathRunner(op, p, new PermissionParam(permission)).run();
}

// ...

@Override
public void modifyAclEntries(Path path, List<AclEntry> aclSpec) throws IOException {
    statistics.incrementWriteOps(1);
    final HttpOpParam.Op op = PutOpParam.Op.MODIFYACLENTRIES;
    new FsPathRunner(op, path, new AclPermissionParam(aclSpec)).run();
}

// ...

@Override
public void removeAclEntries(Path path, List<AclEntry> aclSpec) throws IOException {
    statistics.incrementWriteOps(1);
    final HttpOpParam.Op op = PutOpParam.Op.REMOVEACLENTRIES;
    new FsPathRunner(op, path, new AclPermissionParam(aclSpec)).run();
}

// ...

@Override
public void removeDefaultAcl(Path path) throws IOException {
    statistics.incrementWriteOps(1);
    final HttpOpParam.Op op = PutOpParam.Op.REMOVEDEFAULTACL;
    new FsPathRunner(op, path).run();
}

// ...

@Override
public void removeAcl(Path path) throws IOException {
    statistics.incrementWriteOps(1);
    final HttpOpParam.Op op = PutOpParam.Op.REMOVEACL;
    new FsPathRunner(op, path).run();
}

// ...

@Override
public void setAcl(final Path p, final List<AclEntry> aclSpec) throws IOException {
    statistics.incrementWriteOps(1);
    final HttpOpParam.Op op = PutOpParam.Op.SETACL;
    new FsPathRunner(op, p, new AclPermissionParam(aclSpec)).run();
}

// ...

@Override
public Path createSnapshot(final Path path, final String snapshotName) throws IOException {
    statistics.incrementWriteOps(1);
    final HttpOpParam.Op op = PutOpParam.Op.CREATESNAPSHOT;
    Path spath = new FsPathResponseRunner<Path>(op, path, new SnapshotNameParam(snapshotName)) {
        @Override
        Path decodeResponse(Map<String, Object> json) {
            return new Path((String) json.get(Path.class.getSimpleName()));
        }
    }.run();
    return spath;
}

// ...

@Override
public void deleteSnapshot(final Path path, final String snapshotName) throws IOException {
    statistics.incrementWriteOps(1);
    final HttpOpParam.Op op = DeleteOpParam.Op.DELETESNAPSHOT;
    new FsPathRunner(op, path, new SnapshotNameParam(snapshotName)).run();
}

// ...

@Override
public void renameSnapshot(final Path path, final String snapshotOldName, final String snapshotNewName) throws IOException {
    statistics.incrementWriteOps(1);
    final HttpOpParam.Op op = PutOpParam.Op.RENAMESNAPSHOT;
    new FsPathRunner(op, path, new OldSnapshotNameParam(snapshotOldName), new SnapshotNameParam(snapshotNewName)).run();
}

// ...

@Override
public boolean setReplication(final Path p, final short replication) throws IOException {
    statistics.incrementWriteOps(1);
    final HttpOpParam.Op op = PutOpParam.Op.SETREPLICATION;
    return new FsPathBooleanRunner(op, p, new ReplicationParam(replication)).run();
}

// ...

@Override
public void setTimes(final Path p, final long mtime, final long atime) throws IOException {
    statistics.incrementWriteOps(1);
    final HttpOpParam.Op op = PutOpParam.Op.SETTIMES;
    new FsPathRunner(op, p, new ModificationTimeParam(mtime), new AccessTimeParam(atime)).run();
}

// ...

@Override
public long getDefaultBlockSize() {
    return getConf().getLongBytes(DFSConfigKeys.DFS_BLOCK_SIZE_KEY, DFSConfigKeys.DFS_BLOCK_SIZE_DEFAULT);
}

// ...

@Override
public short getDefaultReplication() {
    return (short) getConf().getInt(DFSConfigKeys.DFS_REPLICATION_KEY, DFSConfigKeys.DFS_REPLICATION_DEFAULT);
}

// ...

@Override
public void concat(final Path trg, final Path[] srcs) throws IOException {
    statistics.incrementWriteOps(1);
    final HttpOpParam.Op op = PostOpParam.Op.CONCAT;
    new FsPathRunner(op, trg, new ConcatSourcesParam(srcs)).run();
}

// ...

@Override
public FSDataOutputStream create(final Path f, final FsPermission permission, final boolean overwrite, final int bufferSize, final short replication, final long blockSize, final Progressable progress) throws IOException {
    statistics.incrementWriteOps(1);

    final HttpOpParam.Op op = PutOpParam.Op.CREATE;
    return new FsPathOutputStreamRunner(op, f, bufferSize, new PermissionParam(applyUMask(permission)), new OverwriteParam(overwrite), new BufferSizeParam(bufferSize), new ReplicationParam(replication), new BlockSizeParam(blockSize)).run();
}

// ...

@Override
public FSDataOutputStream append(final Path f, final int bufferSize, final Progressable progress) throws IOException {
    statistics.incrementWriteOps(1);

    final HttpOpParam.Op op = PostOpParam.Op.APPEND;
    return new FsPathOutputStreamRunner(op, f, bufferSize, new BufferSizeParam(bufferSize)).run();
}

// ...

@Override
public boolean truncate(Path f, long newLength) throws IOException {
    statistics.incrementWriteOps(1);

    final HttpOpParam.Op op = PostOpParam.Op.TRUNCATE;
    return new FsPathBooleanRunner(op, f, new NewLengthParam(newLength)).run();
}

// ...

@Override
public boolean delete(Path f, boolean recursive) throws IOException {
    final HttpOpParam.Op op = DeleteOpParam.Op.DELETE;
    return new FsPathBooleanRunner(op, f, new RecursiveParam(recursive)).run();
}

// ...

@Override
public FSDataInputStream open(final Path f, final int buffersize) throws IOException {
    statistics.incrementReadOps(1);
    final HttpOpParam.Op op = GetOpParam.Op.OPEN;
    // use a runner so the open can recover from an invalid token
    FsPathConnectionRunner runner = new FsPathConnectionRunner(op, f, new BufferSizeParam(buffersize));
    return new FSDataInputStream(new OffsetUrlInputStream(new UnresolvedUrlOpener(runner), new OffsetUrlOpener(null)));
}

// ...

@Override
public synchronized void close() throws IOException {
    try {
        if (canRefreshDelegationToken && delegationToken != null) {
            cancelDelegationToken(delegationToken);
        }
    } catch (IOException ioe) {
        LOG.debug("Token cancel failed: " + ioe);
    } finally {
        super.close();
    }
}

// ...

class UnresolvedUrlOpener extends ByteRangeInputStream.URLOpener {
    private final FsPathConnectionRunner runner;

    UnresolvedUrlOpener(FsPathConnectionRunner runner) {
        super(null);
        this.runner = runner;
    }

    @Override
    protected HttpURLConnection connect(long offset, boolean resolved) throws IOException {
        assert offset == 0;
        HttpURLConnection conn = runner.run();
        setURL(conn.getURL());
        return conn;
    }
}

// ...

class OffsetUrlOpener extends ByteRangeInputStream.URLOpener {
    OffsetUrlOpener(final URL url) {
        super(url);
    }

    /** Setup offset url and connect. */
    @Override
    protected HttpURLConnection connect(final long offset, final boolean resolved) throws IOException {
        final URL offsetUrl = offset == 0L ? url : new URL(url + "&" + new OffsetParam(offset));
        return new URLRunner(GetOpParam.Op.OPEN, offsetUrl, resolved).run();
    }
}

// ...

private static final String OFFSET_PARAM_PREFIX = OffsetParam.NAME + "=";

/** Remove offset parameter, if there is any, from the url */
static URL removeOffsetParam(final URL url) throws MalformedURLException {
    String query = url.getQuery();
    if (query == null) {
        return url;
    }
    final String lower = StringUtils.toLowerCase(query);
    if (!lower.startsWith(OFFSET_PARAM_PREFIX) && !lower.contains("&" + OFFSET_PARAM_PREFIX)) {
        return url;
    }

    // rebuild query
    StringBuilder b = null;
    for (final StringTokenizer st = new StringTokenizer(query, "&"); st.hasMoreTokens(); ) {
        final String token = st.nextToken();
        if (!StringUtils.toLowerCase(token).startsWith(OFFSET_PARAM_PREFIX)) {
            if (b == null) {
                b = new StringBuilder("?").append(token);
            } else {
                b.append('&').append(token);
            }
        }
    }
    query = b == null ? "" : b.toString();

    final String urlStr = url.toString();
    return new URL(urlStr.substring(0, urlStr.indexOf('?')) + query);
}

// ...

static class OffsetUrlInputStream extends ByteRangeInputStream {
    OffsetUrlInputStream(UnresolvedUrlOpener o, OffsetUrlOpener r) throws IOException {
        super(o, r);
    }

    /** Remove offset parameter before returning the resolved url. */
    @Override
    protected URL getResolvedUrl(final HttpURLConnection connection) throws MalformedURLException {
        return removeOffsetParam(connection.getURL());
    }
}

// ...

@Override
public FileStatus[] listStatus(final Path f) throws IOException {
    statistics.incrementReadOps(1);

    final HttpOpParam.Op op = GetOpParam.Op.LISTSTATUS;
    return new FsPathResponseRunner<FileStatus[]>(op, f) {
        @Override
        FileStatus[] decodeResponse(Map<String, Object> json) {
            final Map<String, Object> rootmap = (Map<String, Object>) json.get(FileStatus.class.getSimpleName() + "es");
            final List<?> array = JsonUtil.getList(rootmap, FileStatus.class.getSimpleName());

            // convert FileStatus
            final FileStatus[] statuses = new FileStatus[array.size()];
            int i = 0;
            for (Object object : array) {
                final Map<String, Object> m = (Map<String, Object>) object;
                statuses[i++] = makeQualified(JsonUtil.toFileStatus(m, false), f);
            }
            return statuses;
        }
    }.run();
}

// ...

@Override
public Token<DelegationTokenIdentifier> getDelegationToken(final String renewer) throws IOException {
    final HttpOpParam.Op op = GetOpParam.Op.GETDELEGATIONTOKEN;
    Token<DelegationTokenIdentifier> token = new FsPathResponseRunner<Token<DelegationTokenIdentifier>>(op, null, new RenewerParam(renewer)) {
        @Override
        Token<DelegationTokenIdentifier> decodeResponse(Map<String, Object> json) throws IOException {
            return JsonUtil.toDelegationToken(json);
        }
    }.run();
    if (token != null) {
        token.setService(tokenServiceName);
    } else {
        if (disallowFallbackToInsecureCluster) {
            throw new AccessControlException(CANT_FALLBACK_TO_INSECURE_MSG);
        }
    }
    return token;
}

// ...

@Override
public synchronized Token<?> getRenewToken() {
    return delegationToken;
}

// ...

@Override
public <T extends TokenIdentifier> void setDelegationToken(final Token<T> token) {
    synchronized (this) {
        delegationToken = token;
    }
}

// ...

@Override
public synchronized long renewDelegationToken(final Token<?> token) throws IOException {
    final HttpOpParam.Op op = PutOpParam.Op.RENEWDELEGATIONTOKEN;
    return new FsPathResponseRunner<Long>(op, null, new TokenArgumentParam(token.encodeToUrlString())) {
        @Override
        Long decodeResponse(Map<String, Object> json) throws IOException {
            return ((Number) json.get("long")).longValue();
        }
    }.run();
}

// ...

@Override
public synchronized void cancelDelegationToken(final Token<?> token) throws IOException {
    final HttpOpParam.Op op = PutOpParam.Op.CANCELDELEGATIONTOKEN;
    new FsPathRunner(op, null, new TokenArgumentParam(token.encodeToUrlString())).run();
}

// ...

@Override
public BlockLocation[] getFileBlockLocations(final FileStatus status, final long offset, final long length) throws IOException {
    if (status == null) {
        return null;
    }
    return getFileBlockLocations(status.getPath(), offset, length);
}

// ...

@Override
public BlockLocation[] getFileBlockLocations(final Path p, final long offset, final long length) throws IOException {
    statistics.incrementReadOps(1);

    final HttpOpParam.Op op = GetOpParam.Op.GET_BLOCK_LOCATIONS;
    return new FsPathResponseRunner<BlockLocation[]>(op, p, new OffsetParam(offset), new LengthParam(length)) {
        @Override
        BlockLocation[] decodeResponse(Map<String, Object> json) throws IOException {
            return DFSUtil.locatedBlocks2Locations(JsonUtil.toLocatedBlocks(json));
        }
    }.run();
}

// ...

@Override
public void access(final Path path, final FsAction mode) throws IOException {
    final HttpOpParam.Op op = GetOpParam.Op.CHECKACCESS;
    new FsPathRunner(op, path, new FsActionParam(mode)).run();
}

// ...

@Override
public ContentSummary getContentSummary(final Path p) throws IOException {
    statistics.incrementReadOps(1);

    final HttpOpParam.Op op = GetOpParam.Op.GETCONTENTSUMMARY;
    return new FsPathResponseRunner<ContentSummary>(op, p) {
        @Override
        ContentSummary decodeResponse(Map<String, Object> json) {
            return JsonUtil.toContentSummary(json);
        }
    }.run();
}

// ...

@Override
public MD5MD5CRC32FileChecksum getFileChecksum(final Path p) throws IOException {
    statistics.incrementReadOps(1);

    final HttpOpParam.Op op = GetOpParam.Op.GETFILECHECKSUM;
    return new FsPathResponseRunner<MD5MD5CRC32FileChecksum>(op, p) {
        @Override
        MD5MD5CRC32FileChecksum decodeResponse(Map<String, Object> json) throws IOException {
            return JsonUtil.toMD5MD5CRC32FileChecksum(json);
        }
    }.run();
}

// ...

/**
 * Resolve an HDFS URL into real INetSocketAddress. It works like a DNS
 * resolver when the URL points to an non-HA cluster. When the URL points to
 * an HA cluster with its logical name, the resolver further resolves the
 * logical name(i.e., the authority in the URL) into real namenode addresses.
 */
private InetSocketAddress[] resolveNNAddr() throws IOException {
    Configuration conf = getConf();
    final String scheme = uri.getScheme();

    ArrayList<InetSocketAddress> ret = new ArrayList<InetSocketAddress>();

    if (!HAUtil.isLogicalUri(conf, uri)) {
        InetSocketAddress addr = NetUtils.createSocketAddr(uri.getAuthority(), getDefaultPort());
        ret.add(addr);

    } else {
        Map<String, Map<String, InetSocketAddress>> addresses = DFSUtil.getHaNnWebHdfsAddresses(conf, scheme);

        // Extract the entry corresponding to the logical name.
        Map<String, InetSocketAddress> addrs = addresses.get(uri.getHost());
        for (InetSocketAddress addr : addrs.values()) {
            ret.add(addr);
        }
    }

    InetSocketAddress[] r = new InetSocketAddress[ret.size()];
    return ret.toArray(r);
}

// ...

@Override
public String getCanonicalServiceName() {
    return tokenServiceName == null ? super.getCanonicalServiceName() : tokenServiceName.toString();
}

// ...

@VisibleForTesting
InetSocketAddress[] getResolvedNNAddr() {
    return nnAddrs;
}