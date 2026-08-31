import java.io.IOException;
import java.net.InetSocketAddress;
import java.util.AbstractMap;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Map.Entry;
import java.util.Set;
import java.util.concurrent.Callable;
import java.util.concurrent.CancellationException;
import java.util.concurrent.CompletionService;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorCompletionService;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

import org.apache.commons.io.IOUtils;
import org.apache.hadoop.classification.InterfaceAudience;
import org.apache.hadoop.fs.ByteBufferReadable;
import org.apache.hadoop.fs.ByteBufferUtil;
import org.apache.hadoop.fs.CanSetDropBehind;
import org.apache.hadoop.fs.CanSetReadahead;
import org.apache.hadoop.fs.CanUnbuffer;
import org.apache.hadoop.fs.ChecksumException;
import org.apache.hadoop.fs.FSInputStream;
import org.apache.hadoop.fs.HasEnhancedByteBufferAccess;
import org.apache.hadoop.fs.ReadOption;
import org.apache.hadoop.fs.StorageType;
import org.apache.hadoop.fs.UnresolvedLinkException;
import org.apache.hadoop.hdfs.protocol.ClientDatanodeProtocol;
import org.apache.hadoop.hdfs.protocol.DatanodeInfo;
import org.apache.hadoop.hdfs.protocol.ExtendedBlock;
import org.apache.hadoop.fs.FileEncryptionInfo;
import org.apache.hadoop.hdfs.protocol.LocatedBlock;
import org.apache.hadoop.hdfs.protocol.LocatedBlocks;
import org.apache.hadoop.hdfs.protocol.datatransfer.InvalidEncryptionKeyException;
import org.apache.hadoop.hdfs.security.token.block.BlockTokenIdentifier;
import org.apache.hadoop.hdfs.security.token.block.InvalidBlockTokenException;
import org.apache.hadoop.hdfs.server.datanode.CachingStrategy;
import org.apache.hadoop.hdfs.server.datanode.ReplicaNotFoundException;
import org.apache.hadoop.hdfs.shortcircuit.ClientMmap;
import org.apache.hadoop.io.ByteBufferPool;
import org.apache.hadoop.ipc.RPC;
import org.apache.hadoop.ipc.RemoteException;
import org.apache.hadoop.net.NetUtils;
import org.apache.hadoop.security.token.SecretManager.InvalidToken;
import org.apache.hadoop.security.token.Token;
import org.apache.hadoop.util.IdentityHashStore;
import org.apache.htrace.Span;
import org.apache.htrace.Trace;
import org.apache.htrace.TraceScope;

import com.google.common.annotations.VisibleForTesting;

/**
 * DFSInputStream provides bytes from a named file. It handles
 * negotiation of the namenode and various datanodes as necessary.
 */
@InterfaceAudience.Private
public class DFSInputStream extends FSInputStream
    implements ByteBufferReadable, CanSetDropBehind, CanSetReadahead,
    HasEnhancedByteBufferAccess, CanUnbuffer {
  @VisibleForTesting
  public static boolean tcpReadsDisabledForTesting = false;
  private long hedgedReadOpsLoopNumForTesting = 0;
  private final DFSClient dfsClient;
  private AtomicBoolean closed = new AtomicBoolean(false);
  private final String src;
  private final boolean verifyChecksum;

  // state by stateful read only:
  // (protected by lock on this)
  /////
  private DatanodeInfo currentNode = null;
  private LocatedBlock currentLocatedBlock = null;
  private long pos = 0;
  private long blockEnd = -1;
  private BlockReader blockReader = null;
  ////

  // state shared by stateful and positional read:
  // (protected by lock on infoLock)
  ////
  private LocatedBlocks locatedBlocks = null;
  private long lastBlockBeingWrittenLength = 0;
  private FileEncryptionInfo fileEncryptionInfo = null;
  private CachingStrategy cachingStrategy;
  ////

  private final ReadStatistics readStatistics = new ReadStatistics();
  // lock for state shared between read and pread
  // Note: Never acquire a lock on <this> with this lock held to avoid deadlocks
  //       (it's OK to acquire this lock when the lock on <this> is held)
  private final Object infoLock = new Object();

  /**
   * Track the ByteBuffers that we have handed out to readers.
   * 
   * The value type can be either ByteBufferPool or ClientMmap, depending on
   * whether we this is a memory-mapped buffer or not.
   */
  private IdentityHashStore<ByteBuffer, Object> extendedReadBuffers;

  private synchronized IdentityHashStore<ByteBuffer, Object> getExtendedReadBuffers() {
    if (extendedReadBuffers == null) {
      extendedReadBuffers = new IdentityHashStore<ByteBuffer, Object>(0);
    }
    return extendedReadBuffers;
  }

  public static class ReadStatistics {
    public ReadStatistics() {
      clear();
    }

    public ReadStatistics(ReadStatistics rhs) {
      this.totalBytesRead = rhs.getTotalBytesRead();
      this.totalLocalBytesRead = rhs.getTotalLocalBytesRead();
      this.totalShortCircuitBytesRead = rhs.getTotalShortCircuitBytesRead();
      this.totalZeroCopyBytesRead = rhs.getTotalZeroCopyBytesRead();
    }

    /**
     * @return The total bytes read. This will always be at least as
     * high as the other numbers, since it includes all of them.
     */
    public long getTotalBytesRead() {
      return totalBytesRead;
    }

    /**
     * @return The total local bytes read. This will always be at least
     * as high as totalShortCircuitBytesRead, since all short-circuit
     * reads are also local.
     */
    public long getTotalLocalBytesRead() {
      return totalLocalBytesRead;
    }

    /**
     * @return The total short-circuit local bytes read.
     */
    public long getTotalShortCircuitBytesRead() {
      return totalShortCircuitBytesRead;
    }

    /**
     * @return The total number of zero-copy bytes read.
     */
    public long getTotalZeroCopyBytesRead() {
      return totalZeroCopyBytesRead;
    }

    /**
     * @return The total number of bytes read which were not local.
     */
    public long getRemoteBytesRead() {
      return totalBytesRead - totalLocalBytesRead;
    }

    void addRemoteBytes(long amt) {
      this.totalBytesRead += amt;
    }

    void addLocalBytes(long amt) {
      this.totalBytesRead += amt;
      this.totalLocalBytesRead += amt;
    }

    void addShortCircuitBytes(long amt) {
      this.totalBytesRead += amt;
      this.totalLocalBytesRead += amt;
      this.totalShortCircuitBytesRead += amt;
    }

    void addZeroCopyBytes(long amt) {
      this.totalBytesRead += amt;
      this.totalLocalBytesRead += amt;
      this.totalShortCircuitBytesRead += amt;
      this.totalZeroCopyBytesRead += amt;
    }

    void clear() {
      this.totalBytesRead = 0;
      this.totalLocalBytesRead = 0;
      this.totalShortCircuitBytesRead = 0;
      this.totalZeroCopyBytesRead = 0;
    }

    private long totalBytesRead;
    private long totalLocalBytesRead;
    private long totalShortCircuitBytesRead;
    private long totalZeroCopyBytesRead;
  }

  /**
   * This variable tracks the number of failures since the start of the
   * most recent user-facing operation. That is to say, it should be reset
   * whenever the user makes a call on this stream, and if at any point
   * during the retry logic, the failure count exceeds a threshold,
   * the errors will be thrown back to the operation.
   *
   * Specifically this counts the number of times the client has gone
   * back to the namenode to get a new list of block locations, and is
   * capped at maxBlockAcquireFailures
   */
  private int failures = 0;

  /* XXX Use of CocurrentHashMap is temp fix. Need to fix
   * parallel accesses to DFSInputStream (through ptreads) properly */
  private final ConcurrentHashMap<DatanodeInfo, DatanodeInfo> deadNodes =
      new ConcurrentHashMap<DatanodeInfo, DatanodeInfo>();

  private byte[] oneByteBuf; // used for 'int read()'

  void addToDeadNodes(DatanodeInfo dnInfo) {
    deadNodes.put(dnInfo, dnInfo);
  }

  DFSInputStream(DFSClient dfsClient, String src, boolean verifyChecksum) throws IOException, UnresolvedLinkException {
    this.dfsClient = dfsClient;
    this.verifyChecksum = verifyChecksum;
    this.src = src;
    synchronized (infoLock) {
      this.cachingStrategy = dfsClient.getDefaultReadCachingStrategy();
    }
    openInfo();
  }

  /**
   * Grab the open-file info from namenode
   */
  void openInfo() throws IOException, UnresolvedLinkException {
    synchronized (infoLock) {
      lastBlockBeingWrittenLength = retryFetchingLastBlockLength();
    }
  }

  private long retryFetchingLastBlockLength() throws IOException {
    long lastBlockBeingWrittenLength = fetchLocatedBlocksAndGetLastBlockLength();
    int retriesForLastBlockLength = dfsClient.getConf().retryTimesForGetLastBlockLength;
    while (retriesForLastBlockLength > 0 && lastBlockBeingWrittenLength == -1) {
      DFSClient.LOG.warn("Last block locations not available. "
          + "Datanodes might not have reported blocks completely."
          + " Will retry for " + retriesForLastBlockLength + " times");
      waitFor(dfsClient.getConf().retryIntervalForGetLastBlockLength);
      lastBlockBeingWrittenLength = fetchLocatedBlocksAndGetLastBlockLength();
      retriesForLastBlockLength--;
    }
    if (retriesForLastBlockLength == 0) {
      throw new IOException("Could not obtain the last block locations.");
    }
    return lastBlockBeingWrittenLength;
  }

  private void waitFor(int waitTime) throws IOException {
    try {
      Thread.sleep(waitTime);
    } catch (InterruptedException e) {
      throw new IOException("Interrupted while getting the last block length.");
    }
  }

  private long fetchLocatedBlocksAndGetLastBlockLength() throws IOException {
    final LocatedBlocks newInfo = dfsClient.getLocatedBlocks(src, 0);
    if (DFSClient.LOG.isDebugEnabled()) {
      DFSClient.LOG.debug("newInfo = " + newInfo);
    }
    if (newInfo == null) {
      throw new IOException("Cannot open filename " + src);
    }

    if (locatedBlocks != null) {
      validateBlocklistChange(locatedBlocks, newInfo);
    }
    locatedBlocks = newInfo;
    return computeLastBlockBeingWrittenLength();
  }

  private void validateBlocklistChange(LocatedBlocks oldInfo, LocatedBlocks newInfo) {
    Iterator<LocatedBlock> oldIter = oldInfo.getLocatedBlocks().iterator();
    Iterator<LocatedBlock> newIter = newInfo.getLocatedBlocks().iterator();
    while (oldIter.hasNext() && newIter.hasNext()) {
      if (!oldIter.next().getBlock().equals(newIter.next().getBlock())) {
        throw new IOException("Blocklist for " + src + " has changed!");
      }
    }
  }

  private long computeLastBlockBeingWrittenLength() throws IOException {
    if (locatedBlocks.isLastBlockComplete()) {
      return 0;
    }

    final LocatedBlock last = locatedBlocks.getLastLocatedBlock();
    if (last == null) {
      return 0;
    }

    if (last.getLocations().length == 0) {
      return last.getBlockSize() == 0 ? 0 : -1;
    }

    final long len = readBlockLength(last);
    last.getBlock().setNumBytes(len);
    return len;
  }

  /** Read the block length from one of the datanodes. */
  private long readBlockLength(LocatedBlock locatedblock) throws IOException {
    assert locatedblock != null : "LocatedBlock cannot be null";
    int replicaNotFoundCount = locatedblock.getLocations().length;

    for (DatanodeInfo datanode : locatedblock.getLocations()) {
      ClientDatanodeProtocol cdp = null;
      try {
        cdp = DFSUtil.createClientDatanodeProtocolProxy(datanode,
            dfsClient.getConfiguration(), dfsClient.getConf().socketTimeout,
            dfsClient.getConf().connectToDnViaHostname, locatedblock);

        final long n = cdp.getReplicaVisibleLength(locatedblock.getBlock());
        if (n >= 0) {
          return n;
        }
      } catch (IOException ioe) {
        if (ioe instanceof RemoteException &&
            ((RemoteException) ioe).unwrapRemoteException() instanceof ReplicaNotFoundException) {
          replicaNotFoundCount--;
        }

        if (DFSClient.LOG.isDebugEnabled()) {
          DFSClient.LOG.debug("Failed to getReplicaVisibleLength from datanode "
              + datanode + " for block " + locatedblock.getBlock(), ioe);
        }
      } finally {
        if (cdp != null) {
          RPC.stopProxy(cdp);
        }
      }
    }

    // See HDFS-4871: all replicas reported NotFound, assume race and return 0
    if (replicaNotFoundCount == 0) {
      return 0;
    }

    throw new IOException("Cannot obtain block length for " + locatedblock);
  }

  public long getFileLength() {
    synchronized (infoLock) {
      return locatedBlocks == null ? 0 :
          locatedBlocks.getFileLength() + lastBlockBeingWrittenLength;
    }
  }

  // Short circuit local reads are forbidden for files that are
  // under construction. See HDFS-2757.
  boolean shortCircuitForbidden() {
    synchronized (infoLock) {
      return locatedBlocks.isUnderConstruction();
    }
  }

  /**
   * Returns the datanode from which the stream is currently reading.
   */
  public synchronized DatanodeInfo getCurrentDatanode() {
    return currentNode;
  }

  /**
   * Returns the block containing the target position.
   */
  synchronized public ExtendedBlock getCurrentBlock() {
    return currentLocatedBlock == null ? null : currentLocatedBlock.getBlock();
  }

  /**
   * Return collection of blocks that has already been located.
   */
  public List<LocatedBlock> getAllBlocks() throws IOException {
    return getBlockRange(0, getFileLength());
  }

  /**
   * Get block at the specified position.
   * Fetch it from the namenode if not cached.
   *
   * @param offset block corresponding to this offset in file is returned
   * @return located block
   * @throws IOException
   */
  private LocatedBlock getBlockAt(long offset) throws IOException {
    synchronized (infoLock) {
      assert locatedBlocks != null : "locatedBlocks is null";

      if (offset < 0 || offset >= getFileLength()) {
        throw new IOException("offset < 0 || offset >= getFileLength(), offset="
            + offset + ", locatedBlocks=" + locatedBlocks);
      } else if (offset >= locatedBlocks.getFileLength()) {
        return locatedBlocks.getLastLocatedBlock();
      } else {
        int targetBlockIdx = locatedBlocks.findBlock(offset);
        if (targetBlockIdx < 0) {
          targetBlockIdx = LocatedBlocks.getInsertIndex(targetBlockIdx);
          final LocatedBlocks newBlocks = dfsClient.getLocatedBlocks(src, offset);
          assert newBlocks != null : "Could not find target position " + offset;
          locatedBlocks.insertRange(targetBlockIdx, newBlocks.getLocatedBlocks());
        }
        return locatedBlocks.get(targetBlockIdx);
      }
    }
  }

  /** Fetch a block from namenode and cache it */
  private void fetchBlockAt(long offset) throws IOException {
    synchronized (infoLock) {
      int targetBlockIdx = locatedBlocks.findBlock(offset);
      if (targetBlockIdx < 0) {
        targetBlockIdx = LocatedBlocks.getInsertIndex(targetBlockIdx);
      }
      final LocatedBlocks newBlocks = dfsClient.getLocatedBlocks(src, offset);
      if (newBlocks == null) {
        throw new IOException("Could not find target position " + offset);
      }
      locatedBlocks.insertRange(targetBlockIdx, newBlocks.getLocatedBlocks());
    }
  }

  /**
   * Get blocks in the specified range.
   * Fetch them from the namenode if not cached. This function
   * will not get a read request beyond the EOF.
   * @param offset starting offset in file
   * @param length length of data
   * @return consequent segment of located blocks
   * @throws IOException
   */
  private List<LocatedBlock> getBlockRange(long offset,
      long length) throws IOException {
    if (offset >= getFileLength()) {
      throw new IOException("Offset: " + offset +
          " exceeds file length: " + getFileLength());
    }
    synchronized (infoLock) {
      final List<LocatedBlock> blocks = new ArrayList<>();
      final long lengthOfCompleteBlk = locatedBlocks.getFileLength();
      final boolean readOffsetWithinCompleteBlk = offset < lengthOfCompleteBlk;
      final boolean readLengthPastCompleteBlk = offset + length > lengthOfCompleteBlk;

      if (readOffsetWithinCompleteBlk) {
        blocks.addAll(getFinalizedBlockRange(offset,
            Math.min(length, lengthOfCompleteBlk - offset)));
      }

      if (readLengthPastCompleteBlk) {
        blocks.add(locatedBlocks.getLastLocatedBlock());
      }

      return blocks;
    }
  }

  /**
   * Get blocks in the specified range.
   * Includes only the complete blocks.
   * Fetch them from the namenode if not cached.
   */
  private List<LocatedBlock> getFinalizedBlockRange(long offset, long length) throws IOException {
    synchronized (infoLock) {
      assert locatedBlocks != null : "locatedBlocks is null";
      List<LocatedBlock> blockRange = new ArrayList<>();
      int blockIdx = locatedBlocks.findBlock(offset);
      if (blockIdx < 0) {
        blockIdx = LocatedBlocks.getInsertIndex(blockIdx);
      }
      long remaining = length;
      long curOff = offset;
      while (remaining > 0) {
        LocatedBlock blk = null;
        if (blockIdx < locatedBlocks.locatedBlockCount()) {
          blk = locatedBlocks.get(blockIdx);
        }
        if (blk == null || curOff < blk.getStartOffset()) {
          LocatedBlocks newBlocks = dfsClient.getLocatedBlocks(src, curOff, remaining);
          locatedBlocks.insertRange(blockIdx, newBlocks.getLocatedBlocks());
          continue;
        }
        assert curOff >= blk.getStartOffset() : "Block not found";
        blockRange.add(blk);
        long bytesRead = blk.getStartOffset() + blk.getBlockSize() - curOff;
        remaining -= bytesRead;
        curOff += bytesRead;
        blockIdx++;
      }
      return blockRange;
    }
  }

  /**
   * Open a DataInputStream to a DataNode so that it can be read from.
   * We get block ID and the IDs of the destinations at startup, from the namenode.
   */
  private synchronized DatanodeInfo blockSeekTo(long target) throws IOException {
    if (target >= getFileLength()) {
      throw new IOException("Attempted to read past end of file");
    }

    closeCurrentBlockReader();

    DatanodeInfo chosenNode = null;
    int refetchToken = 1;
    int refetchEncryptionKey = 1;
    boolean connectFailedOnce = false;

    while (true) {
      LocatedBlock targetBlock = getBlockAt(target);

      this.pos = target;
      this.blockEnd = targetBlock.getStartOffset() + targetBlock.getBlockSize() - 1;
      this.currentLocatedBlock = targetBlock;

      assert target == pos : "Wrong postion " + pos + " expect " + target;
      long offsetIntoBlock = target - targetBlock.getStartOffset();

      DNAddrPair retval = chooseDataNode(targetBlock, null);
      chosenNode = retval.info;
      InetSocketAddress targetAddr = retval.addr;
      StorageType storageType = retval.storageType;

      try {
        ExtendedBlock blk = targetBlock.getBlock();
        Token<BlockTokenIdentifier> accessToken = targetBlock.getBlockToken();
        CachingStrategy curCachingStrategy;
        boolean shortCircuitForbidden;
        synchronized (infoLock) {
          curCachingStrategy = cachingStrategy;
          shortCircuitForbidden = shortCircuitForbidden();
        }
        blockReader = new BlockReaderFactory(dfsClient.getConf())
            .setInetSocketAddress(targetAddr)
            .setRemotePeerFactory(dfsClient)
            .setDatanodeInfo(chosenNode)
            .setStorageType(storageType)
            .setFileName(src)
            .setBlock(blk)
            .setBlockToken(accessToken)
            .setStartOffset(offsetIntoBlock)
            .setVerifyChecksum(verifyChecksum)
            .setClientName(dfsClient.clientName)
            .setLength(blk.getNumBytes() - offsetIntoBlock)
            .setCachingStrategy(curCachingStrategy)
            .setAllowShortCircuitLocalReads(!shortCircuitForbidden)
            .setClientCacheContext(dfsClient.getClientContext())
            .setUserGroupInformation(dfsClient.ugi)
            .setConfiguration(dfsClient.getConfiguration())
            .build();
        if (connectFailedOnce) {
          DFSClient.LOG.info("Successfully connected to " + targetAddr + " for " + blk);
        }
        return chosenNode;
      } catch (IOException ex) {
        if (ex instanceof InvalidEncryptionKeyException && refetchEncryptionKey > 0) {
          DFSClient.LOG.info("Will fetch a new encryption key and retry, "
              + "encryption key was invalid when connecting to " + targetAddr + " : " + ex);
          refetchEncryptionKey--;
          dfsClient.clearDataEncryptionKey();
        } else if (refetchToken > 0 && tokenRefetchNeeded(ex, targetAddr)) {
          refetchToken--;
          fetchBlockAt(target);
        } else {
          connectFailedOnce = true;
          DFSClient.LOG.warn("Failed to connect to " + targetAddr + " for block"
              + ", add to deadNodes and continue. " + ex, ex);
          addToDeadNodes(chosenNode);
        }
      }
    }
  }

  /**
   * Close it down!
   */
  @Override
  public synchronized void close() throws IOException {
    if (!closed.compareAndSet(false, true)) {
      DFSClient.LOG.warn("DFSInputStream has been closed already");
      return;
    }
    dfsClient.checkOpen();

    if ((extendedReadBuffers != null) && (!extendedReadBuffers.isEmpty())) {
      final StringBuilder builder = new StringBuilder();
      extendedReadBuffers.visitAll(new IdentityHashStore.Visitor<ByteBuffer, Object>() {
        private String prefix = "";
        @Override
        public void accept(ByteBuffer k, Object v) {
          builder.append(prefix).append(k);
          prefix = ", ";
        }
      });
      DFSClient.LOG.warn("closing file " + src + ", but there are still "
          + "unreleased ByteBuffers allocated by read(). Please release " + builder.toString() + ".");
    }
    closeCurrentBlockReader();
    super.close();
  }

  @Override
  public synchronized int read() throws IOException {
    if (oneByteBuf == null) {
      oneByteBuf = new byte[1];
    }
    int ret = read(oneByteBuf, 0, 1);
    return (ret <= 0) ? -1 : (oneByteBuf[0] & 0xff);
  }

  /**
   * Wraps different possible read implementations so that readBuffer can be
   * strategy-agnostic.
   */
  private interface ReaderStrategy {
    public int doRead(BlockReader blockReader, int off, int len)
        throws ChecksumException, IOException;
  }

  private void updateReadStatistics(ReadStatistics readStatistics, int nRead, BlockReader blockReader) {
    if (nRead <= 0) return;
    synchronized (infoLock) {
      if (blockReader.isShortCircuit()) {
        readStatistics.addShortCircuitBytes(nRead);
      } else if (blockReader.isLocal()) {
        readStatistics.addLocalBytes(nRead);
      } else {
        readStatistics.addRemoteBytes(nRead);
      }
    }
  }

  /**
   * Used to read bytes into a byte[]
   */
  private class ByteArrayStrategy implements ReaderStrategy {
    final byte[] buf;

    public ByteArrayStrategy(byte[] buf) {
      this.buf = buf;
    }

    @Override
    public int doRead(BlockReader blockReader, int off, int len)
        throws ChecksumException, IOException {
      int nRead = blockReader.read(buf, off, len);
      updateReadStatistics(readStatistics, nRead, blockReader);
      return nRead;
    }
  }

  /**
   * Used to read bytes into a user-supplied ByteBuffer
   */
  private class ByteBufferStrategy implements ReaderStrategy {
    final ByteBuffer buf;

    ByteBufferStrategy(ByteBuffer buf) {
      this.buf = buf;
    }

    @Override
    public int doRead(BlockReader blockReader, int off, int len)
        throws ChecksumException, IOException {
      int oldpos = buf.position();
      int oldlimit = buf.limit();
      boolean success = false;
      try {
        int ret = blockReader.read(buf);
        success = true;
        updateReadStatistics(readStatistics, ret, blockReader);
        return ret;
      } finally {
        if (!success) {
          buf.position(oldpos);
          buf.limit(oldlimit);
        }
      }
    }
  }

  /* This is used by regular read() and handles ChecksumExceptions.
   * name readBuffer() is chosen to imply similarity to readBuffer() in
   * ChecksumFileSystem
   */
  private synchronized int readBuffer(ReaderStrategy reader, int off, int len,
      Map<ExtendedBlock, Set<DatanodeInfo>> corruptedBlockMap)
      throws IOException {
    IOException ioe;
    boolean retryCurrentNode = true;

    while (true) {
      try {
        return reader.doRead(blockReader, off, len);
      } catch (ChecksumException ce) {
        DFSClient.LOG.warn("Found Checksum error for "
            + getCurrentBlock() + " from " + currentNode + " at " + ce.getPos());
        ioe = ce;
        retryCurrentNode = false;
        addIntoCorruptedBlockMap(getCurrentBlock(), currentNode, corruptedBlockMap);
      } catch (IOException e) {
        if (!retryCurrentNode) {
          DFSClient.LOG.warn("Exception while reading from "
              + getCurrentBlock() + " of " + src + " from " + currentNode, e);
        }
        ioe = e;
      }

      boolean sourceFound = retryCurrentNode
          ? seekToBlockSource(pos)
          : (addToDeadNodesAndSeek(pos));

      if (!sourceFound) {
        throw ioe;
      }
      retryCurrentNode = false;
    }
  }

  private boolean addToDeadNodesAndSeek(long position) throws IOException {
    addToDeadNodes(currentNode);
    return seekToNewSource(position);
  }

  private synchronized int readWithStrategy(ReaderStrategy strategy, int off, int len) throws IOException {
    dfsClient.checkOpen();
    if (closed.get()) {
      throw new IOException("Stream closed");
    }
    Map<ExtendedBlock, Set<DatanodeInfo>> corruptedBlockMap = new HashMap<>();
    failures = 0;
    if (pos < getFileLength()) {
      int retries = 2;
      while (retries > 0) {
        try {
          if (pos > blockEnd || currentNode == null) {
            currentNode = blockSeekTo(pos);
          }
          int realLen = (int) Math.min(len, (blockEnd - pos + 1L));
          synchronized (infoLock) {
            if (locatedBlocks.isLastBlockComplete()) {
              realLen = (int) Math.min(realLen, locatedBlocks.getFileLength() - pos);
            }
          }
          int result = readBuffer(strategy, off, realLen, corruptedBlockMap);

          if (result >= 0) {
            pos += result;
          } else {
            throw new IOException("Unexpected EOS from the reader");
          }
          if (dfsClient.stats != null) {
            dfsClient.stats.incrementBytesRead(result);
          }
          return result;
        } catch (ChecksumException ce) {
          throw ce;
        } catch (IOException e) {
          if (retries == 1) {
            DFSClient.LOG.warn("DFS Read", e);
          }
          blockEnd = -1;
          if (currentNode != null) {
            addToDeadNodes(currentNode);
          }
          if (--retries == 0) {
            throw e;
          }
        } finally {
          reportCheckSumFailure(corruptedBlockMap, currentLocatedBlock != null
              ? currentLocatedBlock.getLocations().length : 0);
        }
      }
    }
    return -1;
  }

  /**
   * Read the entire buffer.
   */
  @Override
  public synchronized int read(final byte buf[], int off, int len) throws IOException {
    ReaderStrategy byteArrayReader = new ByteArrayStrategy(buf);
    TraceScope scope = dfsClient.getPathTraceScope("DFSInputStream#byteArrayRead", src);
    try {
      return readWithStrategy(byteArrayReader, off, len);
    } finally {
      scope.close();
    }
  }

  @Override
  public synchronized int read(final ByteBuffer buf) throws IOException {
    ReaderStrategy byteBufferReader = new ByteBufferStrategy(buf);
    TraceScope scope = dfsClient.getPathTraceScope("DFSInputStream#byteBufferRead", src);
    try {
      return readWithStrategy(byteBufferReader, 0, buf.remaining());
    } finally {
      scope.close();
    }
  }

  /**
   * Add corrupted block replica into map.
   */
  private void addIntoCorruptedBlockMap(ExtendedBlock blk, DatanodeInfo node,
      Map<ExtendedBlock, Set<DatanodeInfo>> corruptedBlockMap) {
    Set<DatanodeInfo> dnSet = corruptedBlockMap.computeIfAbsent(blk, k -> new HashSet<>());
    if (dnSet.add(node)) {
      corruptedBlockMap.put(blk, dnSet);
    }
  }

  private DNAddrPair chooseDataNode(LocatedBlock block,
      Collection<DatanodeInfo> ignoredNodes) throws IOException {
    while (true) {
      try {
        return getBestNodeDNAddrPair(block, ignoredNodes);
      } catch (IOException ie) {
        String errMsg = getBestNodeDNAddrPairErrorString(block.getLocations(), deadNodes, ignoredNodes);
        String blockInfo = block.getBlock() + " file=" + src;
        if (failures >= dfsClient.getMaxBlockAcquireFailures()) {
          String description = "Could not obtain block: " + blockInfo;
          DFSClient.LOG.warn(description + errMsg + ". Throwing a BlockMissingException");
          throw new BlockMissingException(src, description, block.getStartOffset());
        }

        DatanodeInfo[] nodes = block.getLocations();
        if (nodes == null || nodes.length == 0) {
          DFSClient.LOG.info("No node available for " + blockInfo);
        }
        DFSClient.LOG.info("Could not obtain " + block.getBlock() + " from any node: " + ie + errMsg
            + ". Will get new block locations from namenode and retry...");
        try {
          final int timeWindow = dfsClient.getConf().timeWindow;
          double waitTime = timeWindow * failures + timeWindow * (failures + 1)
              * DFSUtil.getRandom().nextDouble();
          DFSClient.LOG.warn("DFS chooseDataNode: got # " + (failures + 1) + " IOException, will wait for "
              + waitTime + " msec.");
          Thread.sleep((long) waitTime);
        } catch (InterruptedException iex) {
        }
        deadNodes.clear();
        openInfo();
        block = getBlockAt(block.getStartOffset());
        failures++;
        continue;
      }
    }
  }

  /**
   * Get the best node from which to stream the data.
   * @param block LocatedBlock, containing nodes in priority order.
   * @param ignoredNodesDo not choose nodes in this array (may be null)
   * @return The DNAddrPair of the best node.
   * @throws IOException
   */
  private DNAddrPair getBestNodeDNAddrPair(LocatedBlock block,
      Collection<DatanodeInfo> ignoredNodes) throws IOException {
    DatanodeInfo[] nodes = block.getLocations();
    StorageType[] storageTypes = block.getStorageTypes();
    DatanodeInfo chosenNode = null;
    StorageType storageType = null;
    if (nodes != null) {
      for (int i = 0; i < nodes.length; i++) {
        if (!deadNodes.containsKey(nodes[i]) &&
            (ignoredNodes == null || !ignoredNodes.contains(nodes[i]))) {
          chosenNode = nodes[i];
          if (storageTypes != null && i < storageTypes.length) {
            storageType = storageTypes[i];
          }
          break;
        }
      }
    }
    if (chosenNode == null) {
      throw new IOException("No live nodes contain block " + block.getBlock() +
          " after checking nodes = " + Arrays.toString(nodes) +
          ", ignoredNodes = " + ignoredNodes);
    }
    final String dnAddr = chosenNode.getXferAddr(dfsClient.getConf().connectToDnViaHostname);
    if (DFSClient.LOG.isDebugEnabled()) {
      DFSClient.LOG.debug("Connecting to datanode " + dnAddr);
    }
    InetSocketAddress targetAddr = NetUtils.createSocketAddr(dnAddr);
    return new DNAddrPair(chosenNode, targetAddr, storageType);
  }

  private static String getBestNodeDNAddrPairErrorString(
      DatanodeInfo nodes[], AbstractMap<DatanodeInfo, DatanodeInfo> deadNodes,
      Collection<DatanodeInfo> ignoredNodes) {
    StringBuilder errMsgr = new StringBuilder(" No live nodes contain current block ");
    errMsgr.append("Block locations:");
    for (DatanodeInfo datanode : nodes) {
      errMsgr.append(" ").append(datanode.toString());
    }
    errMsgr.append(" Dead nodes: ");
    for (DatanodeInfo datanode : deadNodes.keySet()) {
      errMsgr.append(" ").append(datanode.toString());
    }
    if (ignoredNodes != null) {
      errMsgr.append(" Ignored nodes: ");
      for (DatanodeInfo datanode : ignoredNodes) {
        errMsgr.append(" ").append(datanode.toString());
      }
    }
    return errMsgr.toString();
  }

  private void fetchBlockByteRange(LocatedBlock block, long start, long end,
      byte[] buf, int offset, Map<ExtendedBlock, Set<DatanodeInfo>> corruptedBlockMap)
      throws IOException {
    block = getBlockAt(block.getStartOffset());
    while (true) {
      DNAddrPair addressPair = chooseDataNode(block, null);
      try {
        actualGetFromOneDataNode(addressPair, block, start, end, buf, offset, corruptedBlockMap);
        return;
      } catch (IOException e) {
        // Ignore. Already processed inside the function.
        // Loop through to try the next node.
      }
    }
  }

  private Callable<ByteBuffer> getFromOneDataNode(final DNAddrPair datanode,
      final LocatedBlock block, final long start, final long end,
      final ByteBuffer bb,
      final Map<ExtendedBlock, Set<DatanodeInfo>> corruptedBlockMap,
      final int hedgedReadId) {
    final Span parentSpan = Trace.currentSpan();
    return new Callable<ByteBuffer>() {
      @Override
      public ByteBuffer call() throws Exception {
        byte[] buf = bb.array();
        int offset = bb.position();
        TraceScope scope = Trace.startSpan("hedgedRead" + hedgedReadId, parentSpan);
        try {
          actualGetFromOneDataNode(datanode, block, start, end, buf, offset, corruptedBlockMap);
          return bb;
        } finally {
          scope.close();
        }
      }
    };
  }

  private void actualGetFromOneDataNode(final DNAddrPair datanode,
      LocatedBlock block, final long start, final long end, byte[] buf,
      int offset, Map<ExtendedBlock, Set<DatanodeInfo>> corruptedBlockMap)
      throws IOException {
    DFSClientFaultInjector.get().startFetchFromDatanode();
    int refetchToken = 1;
    int refetchEncryptionKey = 1;

    while (true) {
      CachingStrategy curCachingStrategy;
      boolean allowShortCircuitLocalReads;
      block = getBlockAt(block.getStartOffset());
      synchronized (infoLock) {
        curCachingStrategy = cachingStrategy;
        allowShortCircuitLocalReads = !shortCircuitForbidden();
      }
      DatanodeInfo chosenNode = datanode.info;
      InetSocketAddress targetAddr = datanode.addr;
      StorageType storageType = datanode.storageType;
      BlockReader reader = null;

      try {
        DFSClientFaultInjector.get().fetchFromDatanodeException();
        Token<BlockTokenIdentifier> blockToken = block.getBlockToken();
        int len = (int) (end - start + 1);
        reader = new BlockReaderFactory(dfsClient.getConf())
            .setInetSocketAddress(targetAddr)
            .setRemotePeerFactory(dfsClient)
            .setDatanodeInfo(chosenNode)
            .setStorageType(storageType)
            .setFileName(src)
            .setBlock(block.getBlock())
            .setBlockToken(blockToken)
            .setStartOffset(start)
            .setVerifyChecksum(verifyChecksum)
            .setClientName(dfsClient.clientName)
            .setLength(len)
            .setCachingStrategy(curCachingStrategy)
            .setAllowShortCircuitLocalReads(allowShortCircuitLocalReads)
            .setClientCacheContext(dfsClient.getClientContext())
            .setUserGroupInformation(dfsClient.ugi)
            .setConfiguration(dfsClient.getConfiguration())
            .build();
        int nread = reader.readAll(buf, offset, len);
        updateReadStatistics(readStatistics, nread, reader);

        if (nread != len) {
          throw new IOException("truncated return from reader.read(): expected " + len + ", got " + nread);
        }
        DFSClientFaultInjector.get().readFromDatanodeDelay();
        return;
      } catch (ChecksumException e) {
        String msg = "fetchBlockByteRange(). Got a checksum exception for " + src + " at "
            + block.getBlock() + ":" + e.getPos() + " from " + chosenNode;
        DFSClient.LOG.warn(msg);
        addIntoCorruptedBlockMap(block.getBlock(), chosenNode, corruptedBlockMap);
        addToDeadNodes(chosenNode);
        throw new IOException(msg);
      } catch (IOException e) {
        if (e instanceof InvalidEncryptionKeyException && refetchEncryptionKey > 0) {
          DFSClient.LOG.info("Will fetch a new encryption key and retry, "
              + "encryption key was invalid when connecting to " + targetAddr + " : " + e);
          refetchEncryptionKey--;
          dfsClient.clearDataEncryptionKey();
          continue;
        } else if (refetchToken > 0 && tokenRefetchNeeded(e, targetAddr)) {
          refetchToken--;
          try {
            fetchBlockAt(block.getStartOffset());
          } catch (IOException fbae) {
            // ignore IOE, since we can retry it later in a loop
          }
          continue;
        } else {
          String msg = "Failed to connect to " + targetAddr + " for file "
              + src + " for block " + block.getBlock() + ":" + e;
          DFSClient.LOG.warn("Connection failure: " + msg, e);
          addToDeadNodes(chosenNode);
          throw new IOException(msg);
        }
      } finally {
        if (reader != null) {
          reader.close();
        }
      }
    }
  }

  /**
   * Like {@link #fetchBlockByteRange(LocatedBlock, long, long, byte[],
   * int, Map)} except we start up a second, parallel, 'hedged' read
   * if the first read is taking longer than configured amount of
   * time. We then wait on which ever read returns first.
   */
  private void hedgedFetchBlockByteRange(LocatedBlock block, long start,
      long end, byte[] buf, int offset,
      Map<ExtendedBlock, Set<DatanodeInfo>> corruptedBlockMap)
      throws IOException {
    ArrayList<Future<ByteBuffer>> futures = new ArrayList<>();
    CompletionService<ByteBuffer> hedgedService = new ExecutorCompletionService<>(
        dfsClient.getHedgedReadsThreadPool());
    ArrayList<DatanodeInfo> ignored = new ArrayList<>();
    ByteBuffer bb = null;
    int len = (int) (end - start + 1);
    int hedgedReadId = 0;
    block = getBlockAt(block.getStartOffset());
    while (true) {
      hedgedReadOpsLoopNumForTesting++;
      DNAddrPair chosenNode = null;
      if (futures.isEmpty()) {
        chosenNode = chooseDataNode(block, ignored);
        bb = ByteBuffer.wrap(buf, offset, len);
        Callable<ByteBuffer> getFromDataNodeCallable = getFromOneDataNode(
            chosenNode, block, start, end, bb, corruptedBlockMap, hedgedReadId++);
        Future<ByteBuffer> firstRequest = hedgedService.submit(getFromDataNodeCallable);
        futures.add(firstRequest);
        try {
          Future<ByteBuffer> future = hedgedService.poll(
              dfsClient.getHedgedReadTimeout(), TimeUnit.MILLISECONDS);
          if (future != null) {
            future.get();
            return;
          }
          if (DFSClient.LOG.isDebugEnabled()) {
            DFSClient.LOG.debug("Waited " + dfsClient.getHedgedReadTimeout()
                + "ms to read from " + chosenNode.info + "; spawning hedged read");
          }
          ignored.add(chosenNode.info);
          dfsClient.getHedgedReadMetrics().incHedgedReadOps();
          continue;
        } catch (InterruptedException e) {
          // Ignore
        } catch (ExecutionException e) {
          // Ignore already logged in the call.
        }
      } else {
        try {
          try {
            chosenNode = getBestNodeDNAddrPair(block, ignored);
          } catch (IOException ioe) {
            chosenNode = chooseDataNode(block, ignored);
          }
          bb = ByteBuffer.allocate(len);
          Callable<ByteBuffer> getFromDataNodeCallable = getFromOneDataNode(
              chosenNode, block, start, end, bb, corruptedBlockMap, hedgedReadId++);
          Future<ByteBuffer> oneMoreRequest = hedgedService.submit(getFromDataNodeCallable);
          futures.add(oneMoreRequest);
        } catch (IOException ioe) {
          if (DFSClient.LOG.isDebugEnabled()) {
            DFSClient.LOG.debug("Failed getting node for hedged read: " + ioe.getMessage());
          }
        }
        try {
          ByteBuffer result = getFirstToComplete(hedgedService, futures);
          cancelAll(futures);
          if (result.array() != buf) {
            dfsClient.getHedgedReadMetrics().incHedgedReadWins();
            System.arraycopy(result.array(), result.position(), buf, offset, len);
          } else {
            dfsClient.getHedgedReadMetrics().incHedgedReadOps();
          }
          return;
        } catch (InterruptedException ie) {
          // Ignore and retry
        }
        if (chosenNode != null && chosenNode.info != null) {
          ignored.add(chosenNode.info);
        }
      }
    }
  }

  @VisibleForTesting
  public long getHedgedReadOpsLoopNumForTesting() {
    return hedgedReadOpsLoopNumForTesting;
  }

  private ByteBuffer getFirstToComplete(
      CompletionService<ByteBuffer> hedgedService,
      ArrayList<Future<ByteBuffer>> futures) throws InterruptedException {
    if (futures.isEmpty()) {
      throw new InterruptedException("let's retry");
    }
    Future<ByteBuffer> future = null;
    try {
      future = hedgedService.take();
      ByteBuffer bb = future.get();
      futures.remove(future);
      return bb;
    } catch (ExecutionException e) {
      futures.remove(future);
    } catch (CancellationException ce) {
      futures.remove(future);
    }

    throw new InterruptedException("let's retry");
  }

  private void cancelAll(List<Future<ByteBuffer>> futures) {
    for (Future<ByteBuffer> future : futures) {
      future.cancel(false);
    }
  }

  /**
   * Should the block access token be refetched on an exception
   *
   * @param ex Exception received
   * @param targetAddr Target datanode address from where exception was received
   * @return true if block access token has expired or invalid and it should be
   *         refetched
   */
  private static boolean tokenRefetchNeeded(IOException ex,
      InetSocketAddress targetAddr) {
    if (ex instanceof InvalidBlockTokenException || ex instanceof InvalidToken) {
      DFSClient.LOG.info("Access token was invalid when connecting to "
          + targetAddr + " : " + ex);
      return true;
    }
    return false;
  }

  /**
   * Read bytes starting from the specified position.
   *
   * @param position start read from this position
   * @param buffer read buffer
   * @param offset offset into buffer
   * @param length number of bytes to read
   *
   * @return actual number of bytes read
   */
  @Override
  public int read(long position, byte[] buffer, int offset, int length)
      throws IOException {
    TraceScope scope = dfsClient.getPathTraceScope("DFSInputStream#byteArrayPread", src);
    try {
      return pread(position, buffer, offset, length);
    } finally {
      scope.close();
    }
  }

  private int pread(long position, byte[] buffer, int offset, int length)
      throws IOException {
    dfsClient.checkOpen();
    if (closed.get()) {
      throw new IOException("Stream closed");
    }
    failures = 0;
    long filelen = getFileLength();
    if ((position < 0) || (position >= filelen)) {
      return -1;
    }
    int realLen = length;
    if ((position + length) > filelen) {
      realLen = (int) (filelen - position);
    }

    List<LocatedBlock> blockRange = getBlockRange(position, realLen);
    int remaining = realLen;
    Map<ExtendedBlock, Set<DatanodeInfo>> corruptedBlockMap = new HashMap<>();
    for (LocatedBlock blk : blockRange) {
      long targetStart = position - blk.getStartOffset();
      long bytesToRead = Math.min(remaining, blk.getBlockSize() - targetStart);
      try {
        if (dfsClient.isHedgedReadsEnabled()) {
          hedgedFetchBlockByteRange(blk, targetStart, targetStart + bytesToRead - 1,
              buffer, offset, corruptedBlockMap);
        } else {
          fetchBlockByteRange(blk, targetStart, targetStart + bytesToRead - 1,
              buffer, offset, corruptedBlockMap);
        }
      } finally {
        reportCheckSumFailure(corruptedBlockMap, blk.getLocations().length);
      }

      remaining -= bytesToRead;
      position += bytesToRead;
      offset += bytesToRead;
    }
    assert remaining == 0 : "Wrong number of bytes read.";
    if (dfsClient.stats != null) {
      dfsClient.stats.incrementBytesRead(realLen);
    }
    return realLen;
  }

  /**
   * DFSInputStream reports checksum failure.
   * Case I : client has tried multiple data nodes and at least one of the
   * attempts has succeeded. We report the other failures as corrupted block to
   * namenode.
   * Case II: client has tried out all data nodes, but all failed. We
   * only report if the total number of replica is 1. We do not
   * report otherwise since this maybe due to the client is a handicapped client
   * (who can not read).
   * @param corruptedBlockMap map of corrupted blocks
   * @param dataNodeCount number of data nodes who contains the block replicas
   */
  private void reportCheckSumFailure(
      Map<ExtendedBlock, Set<DatanodeInfo>> corruptedBlockMap,
      int dataNodeCount) {
    if (corruptedBlockMap.isEmpty()) {
      return;
    }
    Iterator<Entry<ExtendedBlock, Set<DatanodeInfo>>> it = corruptedBlockMap.entrySet().iterator();
    Entry<ExtendedBlock, Set<DatanodeInfo>> entry = it.next();
    ExtendedBlock blk = entry.getKey();
    Set<DatanodeInfo> dnSet = entry.getValue();
    if (((dnSet.size() < dataNodeCount) && (dnSet.size() > 0))
        || ((dataNodeCount == 1) && (dnSet.size() == dataNodeCount))) {
      DatanodeInfo[] locs = new DatanodeInfo[dnSet.size()];
      int i = 0;
      for (DatanodeInfo dn : dnSet) {
        locs[i++] = dn;
      }
      LocatedBlock[] lblocks = {new LocatedBlock(blk, locs)};
      dfsClient.reportChecksumFailure(src, lblocks);
    }
    corruptedBlockMap.clear();
  }

  @Override
  public long skip(long n) throws IOException {
    if (n > 0) {
      long curPos = getPos();
      long fileLen = getFileLength();
      if (n + curPos > fileLen) {
        n = fileLen - curPos;
      }
      seek(curPos + n);
      return n;
    }
    return n < 0 ? -1 : 0;
  }

  /**
   * Seek to a new arbitrary location
   */
  @Override
  public synchronized void seek(long targetPos) throws IOException {
    if (targetPos > getFileLength()) {
      throw new EOFException("Cannot seek after EOF");
    }
    if (targetPos < 0) {
      throw new EOFException("Cannot seek to negative offset");
    }
    if (closed.get()) {
      throw new IOException("Stream is closed!");
    }
    boolean done = false;
    if (pos <= targetPos && targetPos <= blockEnd) {
      int diff = (int) (targetPos - pos);
      if (diff <= blockReader.available()) {
        try {
          pos += blockReader.skip(diff);
          if (pos == targetPos) {
            done = true;
          } else {
            String errMsg = "BlockReader failed to seek to " + targetPos
                + ". Instead, it seeked to " + pos + ".";
            DFSClient.LOG.warn(errMsg);
            throw new IOException(errMsg);
          }
        } catch (IOException e) {
          if (DFSClient.LOG.isDebugEnabled()) {
            DFSClient.LOG.debug("Exception while seek to " + targetPos
                + " from " + getCurrentBlock() + " of " + src + " from " + currentNode, e);
          }
        }
      }
    }
    if (!done) {
      pos = targetPos;
      blockEnd = -1;
    }
  }

  /**
   * Same as {@link #seekToNewSource(long)} except that it does not exclude
   * the current datanode and might connect to the same node.
   */
  private boolean seekToBlockSource(long targetPos) throws IOException {
    currentNode = blockSeekTo(targetPos);
    return true;
  }

  /**
   * Seek to given position on a node other than the current node. If
   * a node other than the current node is found, then returns true.
   * If another node could not be found, then returns false.
   */
  @Override
  public synchronized boolean seekToNewSource(long targetPos) throws IOException {
    boolean markedDead = deadNodes.containsKey(currentNode);
    addToDeadNodes(currentNode);
    DatanodeInfo oldNode = currentNode;
    DatanodeInfo newNode = blockSeekTo(targetPos);
    if (!markedDead) {
      deadNodes.remove(oldNode);
    }
    if (!oldNode.getDatanodeUuid().equals(newNode.getDatanodeUuid())) {
      currentNode = newNode;
      return true;
    } else {
      return false;
    }
  }

  /**
   */
  @Override
  public synchronized long getPos() throws IOException {
    return pos;
  }

  /** Return the size of the remaining available bytes
   * if the size is less than or equal to {@link Integer#MAX_VALUE},
   * otherwise, return {@link Integer#MAX_VALUE}.
   */
  @Override
  public synchronized int available() throws IOException {
    if (closed.get()) {
      throw new IOException("Stream closed");
    }

    final long remaining = getFileLength() - pos;
    return remaining <= Integer.MAX_VALUE ? (int) remaining : Integer.MAX_VALUE;
  }

  /**
   * We definitely don't support marks
   */
  @Override
  public boolean markSupported() {
    return false;
  }

  @Override
  public void mark(int readLimit) {
  }

  @Override
  public void reset() throws IOException {
    throw new IOException("Mark/reset not supported");
  }

  /** Utility class to encapsulate data node info and its address. */
  private static final class DNAddrPair {
    final DatanodeInfo info;
    final InetSocketAddress addr;
    final StorageType storageType;

    DNAddrPair(DatanodeInfo info, InetSocketAddress addr,
        StorageType storageType) {
      this.info = info;
      this.addr = addr;
      this.storageType = storageType;
    }
  }

  /**
   * Get statistics about the reads which this DFSInputStream has done.
   */
  public ReadStatistics getReadStatistics() {
    synchronized (infoLock) {
      return new ReadStatistics(readStatistics);
    }
  }

  /**
   * Clear statistics about the reads which this DFSInputStream has done.
   */
  public void clearReadStatistics() {
    synchronized (infoLock) {
      readStatistics.clear();
    }
  }

  public FileEncryptionInfo getFileEncryptionInfo() {
    synchronized (infoLock) {
      return fileEncryptionInfo;
    }
  }

  private void closeCurrentBlockReader() {
    if (blockReader == null) return;
    try {
      blockReader.close();
    } catch (IOException e) {
      DFSClient.LOG.error("error closing blockReader", e);
    }
    blockReader = null;
    blockEnd = -1;
  }

  @Override
  public synchronized void setReadahead(Long readahead) throws IOException {
    synchronized (infoLock) {
      this.cachingStrategy = new CachingStrategy.Builder(this.cachingStrategy).setReadahead(readahead).build();
    }
    closeCurrentBlockReader();
  }

  @Override
  public synchronized void setDropBehind(Boolean dropBehind) throws IOException {
    synchronized (infoLock) {
      this.cachingStrategy = new CachingStrategy.Builder(this.cachingStrategy).setDropBehind(dropBehind).build();
    }
    closeCurrentBlockReader();
  }

  /**
   * The immutable empty buffer we return when we reach EOF when doing a
   * zero-copy read.
   */
  private static final ByteBuffer EMPTY_BUFFER =
      ByteBuffer.allocateDirect(0).asReadOnlyBuffer();

  @Override
  public synchronized ByteBuffer read(ByteBufferPool bufferPool,
      int maxLength, EnumSet<ReadOption> opts) throws IOException, UnsupportedOperationException {
    if (maxLength == 0) {
      return EMPTY_BUFFER;
    } else if (maxLength < 0) {
      throw new IllegalArgumentException("can't read a negative number of bytes.");
    }
    if ((blockReader == null) || (blockEnd == -1)) {
      if (pos >= getFileLength()) {
        return null;
      }
      if ((!seekToBlockSource(pos)) || (blockReader == null)) {
        throw new IOException("failed to allocate new BlockReader at position " + pos);
      }
    }
    ByteBuffer buffer = null;
    if (dfsClient.getConf().shortCircuitMmapEnabled) {
      buffer = tryReadZeroCopy(maxLength, opts);
    }
    if (buffer != null) {
      return buffer;
    }
    buffer = ByteBufferUtil.fallbackRead(this, bufferPool, maxLength);
    if (buffer != null) {
      getExtendedReadBuffers().put(buffer, bufferPool);
    }
    return buffer;
  }

  private synchronized ByteBuffer tryReadZeroCopy(int maxLength,
      EnumSet<ReadOption> opts) throws IOException {
    final long curPos = pos;
    final long curEnd = blockEnd;
    final long blockStartInFile = currentLocatedBlock.getStartOffset();
    final long blockPos = curPos - blockStartInFile;

    long length63;
    if ((curPos + maxLength) <= (curEnd + 1)) {
      length63 = maxLength;
    } else {
      length63 = 1 + curEnd - curPos;
      if (length63 <= 0) {
        if (DFSClient.LOG.isDebugEnabled()) {
          DFSClient.LOG.debug("Unable to perform a zero-copy read from offset " +
              curPos + " of " + src + "; " + length63 + " bytes left in block.");
        }
        return null;
      }
      if (DFSClient.LOG.isDebugEnabled()) {
        DFSClient.LOG.debug("Reducing read length from " + maxLength +
            " to " + length63 + " to avoid going more than one byte past the end of the block.");
      }
    }

    int length;
    if (blockPos + length63 <= Integer.MAX_VALUE) {
      length = (int) length63;
    } else {
      long length31 = Integer.MAX_VALUE - blockPos;
      if (length31 <= 0) {
        if (DFSClient.LOG.isDebugEnabled()) {
          DFSClient.LOG.debug("Unable to perform a zero-copy read from offset " +
              curPos + " of " + src + "; 31-bit MappedByteBuffer limit exceeded.");
        }
        return null;
      }
      length = (int) length31;
      if (DFSClient.LOG.isDebugEnabled()) {
        DFSClient.LOG.debug("Reducing read length from " + maxLength +
            " to " + length + " to avoid 31-bit limit.");
      }
    }

    final ClientMmap clientMmap = blockReader.getClientMmap(opts);
    if (clientMmap == null) {
      if (DFSClient.LOG.isDebugEnabled()) {
        DFSClient.LOG.debug("unable to perform a zero-copy read from offset " +
            curPos + " of " + src + "; BlockReader#getClientMmap returned null.");
      }
      return null;
    }

    boolean success = false;
    ByteBuffer buffer;
    try {
      seek(curPos + length);
      buffer = clientMmap.getMappedByteBuffer().asReadOnlyBuffer();
      buffer.position((int) blockPos);
      buffer.limit((int) (blockPos + length));
      getExtendedReadBuffers().put(buffer, clientMmap);
      synchronized (infoLock) {
        readStatistics.addZeroCopyBytes(length);
      }
      if (DFSClient.LOG.isDebugEnabled()) {
        DFSClient.LOG.debug("readZeroCopy read " + length + " bytes from offset " +
            curPos + " via the zero-copy read path.");
      }
      success = true;
    } finally {
      if (!success) {
        IOUtils.closeQuietly(clientMmap);
      }
    }
    return buffer;
  }

  @Override
  public synchronized void releaseBuffer(ByteBuffer buffer) {
    if (buffer == EMPTY_BUFFER) return;
    Object val = getExtendedReadBuffers().remove(buffer);
    if (val == null) {
      throw new IllegalArgumentException("tried to release a buffer "
          + "that was not created by this stream, " + buffer);
    }
    if (val instanceof ClientMmap) {
      IOUtils.closeQuietly((ClientMmap) val);
    } else if (val instanceof ByteBufferPool) {
      ((ByteBufferPool) val).putBuffer(buffer);
    }
  }

  @Override
  public synchronized void unbuffer() {
    closeCurrentBlockReader();
  }
}