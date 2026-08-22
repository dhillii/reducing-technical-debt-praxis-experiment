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
package org.apache.hadoop.hdfs.nfs.nfs3;

import java.io.File;
import java.io.FileNotFoundException;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.RandomAccessFile;
import java.nio.ByteBuffer;
import java.nio.channels.ClosedChannelException;
import java.util.EnumSet;
import java.util.Iterator;
import java.util.Map.Entry;
import java.util.concurrent.ConcurrentNavigableMap;
import java.util.concurrent.ConcurrentSkipListMap;
import java.util.concurrent.atomic.AtomicLong;

import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.apache.hadoop.fs.FSDataInputStream;
import org.apache.hadoop.hdfs.DFSClient;
import org.apache.hadoop.hdfs.client.HdfsDataOutputStream;
import org.apache.hadoop.hdfs.client.HdfsDataOutputStream.SyncFlag;
import org.apache.hadoop.hdfs.nfs.conf.NfsConfigKeys;
import org.apache.hadoop.hdfs.nfs.conf.NfsConfiguration;
import org.apache.hadoop.hdfs.nfs.nfs3.WriteCtx.DataState;
import org.apache.hadoop.io.BytesWritable.Comparator;
import org.apache.hadoop.io.IOUtils;
import org.apache.hadoop.nfs.nfs3.FileHandle;
import org.apache.hadoop.nfs.nfs3.Nfs3Constant;
import org.apache.hadoop.nfs.nfs3.Nfs3Constant.WriteStableHow;
import org.apache.hadoop.nfs.nfs3.Nfs3FileAttributes;
import org.apache.hadoop.nfs.nfs3.Nfs3Status;
import org.apache.hadoop.nfs.nfs3.request.WRITE3Request;
import org.apache.hadoop.nfs.nfs3.response.COMMIT3Response;
import org.apache.hadoop.nfs.nfs3.response.WRITE3Response;
import org.apache.hadoop.nfs.nfs3.response.WccAttr;
import org.apache.hadoop.nfs.nfs3.response.WccData;
import org.apache.hadoop.oncrpc.XDR;
import org.apache.hadoop.oncrpc.security.VerifierNone;
import org.apache.hadoop.security.IdMappingServiceProvider;
import org.apache.hadoop.util.Daemon;
import org.apache.hadoop.util.Time;
import org.jboss.netty.channel.Channel;

import com.google.common.annotations.VisibleForTesting;
import com.google.common.base.Preconditions;

/**
 * OpenFileCtx saves the context of one HDFS file output stream. Access to it is
 * synchronized by its member lock.
 */
class OpenFileCtx {
  public static final Log LOG = LogFactory.getLog(OpenFileCtx.class);
  
  // Pending writes water mark for dump, 1MB
  private static long DUMP_WRITE_WATER_MARK = 1024 * 1024;

  static enum COMMIT_STATUS {
    COMMIT_FINISHED,
    COMMIT_WAIT,
    COMMIT_INACTIVE_CTX,
    COMMIT_INACTIVE_WITH_PENDING_WRITE,
    COMMIT_ERROR,
    COMMIT_DO_SYNC,
    /**
     * Deferred COMMIT response could fail file uploading. The following two
     * status are introduced as a solution. 1. if client asks to commit
     * non-sequential trunk of data, NFS gateway return success with the hope
     * that client will send the prerequisite writes. 2. if client asks to
     * commit a sequential trunk(means it can be flushed to HDFS), NFS gateway
     * return a special error NFS3ERR_JUKEBOX indicating the client needs to
     * retry. Meanwhile, NFS gateway keeps flush data to HDFS and do sync
     * eventually.
     * 
     * The reason to let client wait is that, we want the client to wait for the
     * last commit. Otherwise, client thinks file upload finished (e.g., cp
     * command returns success) but NFS could be still flushing staged data to
     * HDFS. However, we don't know which one is the last commit. We make the
     * assumption that a commit after sequential writes may be the last.
     * Referring HDFS-7259 for more details.
     * */
    COMMIT_SPECIAL_WAIT, // scoped pending writes is sequential
    COMMIT_SPECIAL_SUCCESS;// scoped pending writes is not sequential 
  }

  private final DFSClient client;
  private final IdMappingServiceProvider iug;
  
  // The stream status. False means the stream is closed.
  private volatile boolean activeState;
  // The stream write-back status. True means one thread is doing write back.
  private volatile boolean asyncStatus;
  private volatile long asyncWriteBackStartOffset;

  /**
   * The current offset of the file in HDFS. All the content before this offset
   * has been written back to HDFS.
   */
  private AtomicLong nextOffset;
  private final HdfsDataOutputStream fos;
  private final boolean aixCompatMode;
  
  // It's updated after each sync to HDFS
  private Nfs3FileAttributes latestAttr;
  
  private final ConcurrentNavigableMap<OffsetRange, WriteCtx> pendingWrites;
  
  private final ConcurrentNavigableMap<Long, CommitCtx> pendingCommits;

  static class CommitCtx {
    private final long offset;
    private final Channel channel;
    private final int xid;
    private final Nfs3FileAttributes preOpAttr;
    
    public final long startTime;

    long getOffset() {
      return offset;
    }

    Channel getChannel() {
      return channel;
    }

    int getXid() {
      return xid;
    }

    Nfs3FileAttributes getPreOpAttr() {
      return preOpAttr;
    }

    long getStartTime() {
      return startTime;
    }

    CommitCtx(long offset, Channel channel, int xid,
        Nfs3FileAttributes preOpAttr) {
      this.offset = offset;
      this.channel = channel;
      this.xid = xid;
      this.preOpAttr = preOpAttr;
      this.startTime = System.nanoTime();
    }

    @Override
    public String toString() {
      return String.format("offset: %d xid: %d startTime: %d", offset, xid,
          startTime);
    }
  }

  /**
   * Parameter object that groups the related HDFS client and id mapping
   * dependencies used by write handling paths.
   */
  private static class ClientContext {
    private final DFSClient dfsClient;
    private final IdMappingServiceProvider iug;

    ClientContext(DFSClient dfsClient, IdMappingServiceProvider iug) {
      this.dfsClient = dfsClient;
      this.iug = iug;
    }

    DFSClient getDfsClient() {
      return dfsClient;
    }

    IdMappingServiceProvider getIug() {
      return iug;
    }
  }

  /**
   * Parameter object that groups a write request with its RPC response context.
   */
  private static class WriteRequestContext {
    private final WRITE3Request request;
    private final Channel channel;
    private final int xid;

    WriteRequestContext(WRITE3Request request, Channel channel, int xid) {
      this.request = request;
      this.channel = channel;
      this.xid = xid;
    }

    WRITE3Request getRequest() {
      return request;
    }

    Channel getChannel() {
      return channel;
    }

    int getXid() {
      return xid;
    }
  }

  /**
   * Parameter object describing a perfect overwrite request.
   */
  private static class PerfectOverwriteRequest {
    private final long offset;
    private final int count;
    private final WriteStableHow stableHow;
    private final byte[] data;
    private final String path;

    PerfectOverwriteRequest(long offset, int count, WriteStableHow stableHow,
        byte[] data, String path) {
      this.offset = offset;
      this.count = count;
      this.stableHow = stableHow;
      this.data = data;
      this.path = path;
    }

    long getOffset() {
      return offset;
    }

    int getCount() {
      return count;
    }

    WriteStableHow getStableHow() {
      return stableHow;
    }

    byte[] getData() {
      return data;
    }

    String getPath() {
      return path;
    }
  }

  /**
   * Parameter object describing a commit request.
   */
  private static class CommitRequestContext {
    private final long commitOffset;
    private final boolean fromRead;

    CommitRequestContext(long commitOffset, boolean fromRead) {
      this.commitOffset = commitOffset;
      this.fromRead = fromRead;
    }

    long getCommitOffset() {
      return commitOffset;
    }

    boolean isFromRead() {
      return fromRead;
    }
  }

  /**
   * Parameter object that groups the RPC response context for a commit request.
   */
  private static class CommitResponseContext {
    private final Channel channel;
    private final int xid;
    private final Nfs3FileAttributes preOpAttr;

    CommitResponseContext(Channel channel, int xid, Nfs3FileAttributes preOpAttr) {
      this.channel = channel;
      this.xid = xid;
      this.preOpAttr = preOpAttr;
    }

    Channel getChannel() {
      return channel;
    }

    int getXid() {
      return xid;
    }

    Nfs3FileAttributes getPreOpAttr() {
      return preOpAttr;
    }
  }

  /**
   * Parameter object used to construct an {@link OpenFileCtx}.
   */
  private static class OpenFileCtxParams {
    private final HdfsDataOutputStream fos;
    private final Nfs3FileAttributes latestAttr;
    private final String dumpFilePath;
    private final DFSClient client;
    private final IdMappingServiceProvider iug;
    private final boolean aixCompatMode;
    private final NfsConfiguration config;

    private OpenFileCtxParams(Builder builder) {
      this.fos = builder.fos;
      this.latestAttr = builder.latestAttr;
      this.dumpFilePath = builder.dumpFilePath;
      this.client = builder.client;
      this.iug = builder.iug;
      this.aixCompatMode = builder.aixCompatMode;
      this.config = builder.config;
    }

    HdfsDataOutputStream getFos() {
      return fos;
    }

    Nfs3FileAttributes getLatestAttr() {
      return latestAttr;
    }

    String getDumpFilePath() {
      return dumpFilePath;
    }

    DFSClient getClient() {
      return client;
    }

    IdMappingServiceProvider getIug() {
      return iug;
    }

    boolean isAixCompatMode() {
      return aixCompatMode;
    }

    NfsConfiguration getConfig() {
      return config;
    }

    /**
     * Builder for {@link OpenFileCtxParams}.
     */
    static class Builder {
      private HdfsDataOutputStream fos;
      private Nfs3FileAttributes latestAttr;
      private String dumpFilePath;
      private DFSClient client;
      private IdMappingServiceProvider iug;
      private boolean aixCompatMode;
      private NfsConfiguration config;

      Builder withFos(HdfsDataOutputStream fos) {
        this.fos = fos;
        return this;
      }

      Builder withLatestAttr(Nfs3FileAttributes latestAttr) {
        this.latestAttr = latestAttr;
        return this;
      }

      Builder withDumpFilePath(String dumpFilePath) {
        this.dumpFilePath = dumpFilePath;
        return this;
      }

      Builder withClient(DFSClient client) {
        this.client = client;
        return this;
      }

      Builder withIug(IdMappingServiceProvider iug) {
        this.iug = iug;
        return this;
      }

      Builder withAixCompatMode(boolean aixCompatMode) {
        this.aixCompatMode = aixCompatMode;
        return this;
      }

      Builder withConfig(NfsConfiguration config) {
        this.config = config;
        return this;
      }

      OpenFileCtxParams build() {
        Preconditions.checkNotNull(fos, "fos");
        Preconditions.checkNotNull(latestAttr, "latestAttr");
        Preconditions.checkNotNull(client, "client");
        Preconditions.checkNotNull(iug, "iug");
        if (config == null) {
          config = new NfsConfiguration();
        }
        return new OpenFileCtxParams(this);
      }
    }
  }
  
  // The last write, commit request or write-back event. Updating time to keep
  // output steam alive.
  private long lastAccessTime;
  
  private volatile boolean enabledDump;
  private FileOutputStream dumpOut;
  
  /** Tracks the data buffered in memory related to non sequential writes */
  private AtomicLong nonSequentialWriteInMemory;
  
  private RandomAccessFile raf;
  private final String dumpFilePath;
  private Daemon dumpThread;
  private final boolean uploadLargeFile;
  
  private void updateLastAccessTime() {
    lastAccessTime = Time.monotonicNow();
  }

  private boolean checkStreamTimeout(long streamTimeout) {
    return Time.monotonicNow() - lastAccessTime > streamTimeout;
  }
  
  long getLastAccessTime() {
    return lastAccessTime;  
  }
  
  public long getNextOffset() {
    return nextOffset.get();
  }
  
  boolean getActiveState() {
    return this.activeState;
  }
  
  boolean hasPendingWork() {
    return (pendingWrites.size() != 0 || pendingCommits.size() != 0);
  }
  
  /** Increase or decrease the memory occupation of non-sequential writes */
  private long updateNonSequentialWriteInMemory(long count) {
    long newValue = nonSequentialWriteInMemory.addAndGet(count);
    if (LOG.isDebugEnabled()) {
      LOG.debug("Update nonSequentialWriteInMemory by " + count + " new value: "
          + newValue);
    }

    Preconditions.checkState(newValue >= 0,
        "nonSequentialWriteInMemory is negative " + newValue
            + " after update with count " + count);
    return newValue;
  }
  
  OpenFileCtx(HdfsDataOutputStream fos, Nfs3FileAttributes latestAttr,
      String dumpFilePath, DFSClient client, IdMappingServiceProvider iug) {
    this(new OpenFileCtxParams.Builder()
        .withFos(fos)
        .withLatestAttr(latestAttr)
        .withDumpFilePath(dumpFilePath)
        .withClient(client)
        .withIug(iug)
        .build());
  }
  
  OpenFileCtx(HdfsDataOutputStream fos, Nfs3FileAttributes latestAttr,
      String dumpFilePath, DFSClient client, IdMappingServiceProvider iug,
      boolean aixCompatMode, NfsConfiguration config) {
    this(new OpenFileCtxParams.Builder()
        .withFos(fos)
        .withLatestAttr(latestAttr)
        .withDumpFilePath(dumpFilePath)
        .withClient(client)
        .withIug(iug)
        .withAixCompatMode(aixCompatMode)
        .withConfig(config)
        .build());
  }

  private OpenFileCtx(OpenFileCtxParams params) {
    this.fos = params.getFos();
    this.latestAttr = params.getLatestAttr();
    this.aixCompatMode = params.isAixCompatMode();
    // We use the ReverseComparatorOnMin as the comparator of the map. In this
    // way, we first dump the data with larger offset. In the meanwhile, we
    // retrieve the last element to write back to HDFS.
    pendingWrites = new ConcurrentSkipListMap<OffsetRange, WriteCtx>(
        OffsetRange.ReverseComparatorOnMin);
    
    pendingCommits = new ConcurrentSkipListMap<Long, CommitCtx>();
    
    updateLastAccessTime();
    activeState = true;
    asyncStatus = false;
    asyncWriteBackStartOffset = 0;
    dumpOut = null;
    raf = null;
    nonSequentialWriteInMemory = new AtomicLong(0);
  
    this.dumpFilePath = params.getDumpFilePath();  
    enabledDump = dumpFilePath != null;
    nextOffset = new AtomicLong();
    nextOffset.set(latestAttr.getSize());
    try {	
      assert(nextOffset.get() == this.fos.getPos());
    } catch (IOException e) {}
    dumpThread = null;
    this.client = params.getClient();
    this.iug = params.getIug();
    this.uploadLargeFile = params.getConfig().getBoolean(NfsConfigKeys.LARGE_FILE_UPLOAD,
        NfsConfigKeys.LARGE_FILE_UPLOAD_DEFAULT);
  }

  public Nfs3FileAttributes getLatestAttr() {
    return latestAttr;
  }
  
  // Get flushed offset. Note that flushed data may not be persisted.
  private long getFlushedOffset() throws IOException {
    return fos.getPos();
  }
  
  // Check if need to dump the new writes
  private void waitForDump() {
    if (!enabledDump) {
      if (LOG.isDebugEnabled()) {
        LOG.debug("Do nothing, dump is disabled.");
      }
      return;
    }

    if (nonSequentialWriteInMemory.get() < DUMP_WRITE_WATER_MARK) {
      return;
    }

    // wake up the dumper thread to dump the data
    synchronized (this) {
      if (nonSequentialWriteInMemory.get() >= DUMP_WRITE_WATER_MARK) {
        if (LOG.isDebugEnabled()) {
          LOG.debug("Asking dumper to dump...");
        }
        if (dumpThread == null) {
          dumpThread = new Daemon(new Dumper());
          dumpThread.start();
        } else {
          this.notifyAll();          
        }
      }
      
      while (nonSequentialWriteInMemory.get() >= DUMP_WRITE_WATER_MARK) {
        try {
          this.wait();
        } catch (InterruptedException ignored) {
        }
      }

    }
  }

  class Dumper implements Runnable {

    @Override
    public void run() {
      while (activeState && enabledDump) {
        try {
          if (nonSequentialWriteInMemory.get() >= DUMP_WRITE_WATER_MARK) {
            dump();
          }
          synchronized (OpenFileCtx.this) {
            if (nonSequentialWriteInMemory.get() < DUMP_WRITE_WATER_MARK) {
              OpenFileCtx.this.notifyAll();
              try {
                OpenFileCtx.this.wait();
                if (LOG.isDebugEnabled()) {
                  LOG.debug("Dumper woke up");
                }
              } catch (InterruptedException e) {
                LOG.info("Dumper is interrupted, dumpFilePath= "
                    + OpenFileCtx.this.dumpFilePath);
              }
            }
          }
          if (LOG.isDebugEnabled()) {
            LOG.debug("Dumper checking OpenFileCtx activeState: " + activeState
                + " enabledDump: " + enabledDump);
          }
        } catch (Throwable t) {
          // unblock threads with new request
          synchronized (OpenFileCtx.this) {
            OpenFileCtx.this.notifyAll();
          }
          LOG.info("Dumper get Throwable: " + t + ". dumpFilePath: "
              + OpenFileCtx.this.dumpFilePath, t);
          activeState = false;
        }
      }
    }

    /** Dump data into a file */
    private void dump() {
      if (!ensureDumpOutputStream()) {
        return;
      }
      if (!ensureRandomAccessFile()) {
        return;
      }
      dumpPendingWrites();
    }

    /**
     * Creates the dump output stream if it does not already exist.
     *
     * @return true if the dump output stream is available, false if dump
     *         should be disabled because creation failed.
     */
    private boolean ensureDumpOutputStream() {
      if (dumpOut != null) {
        return true;
      }
      LOG.info("Create dump file: " + dumpFilePath);
      File dumpFile = new File(dumpFilePath);
      try {
        synchronized (this) {
          // check if alive again
          Preconditions.checkState(dumpFile.createNewFile(),
              "The dump file should not exist: %s", dumpFilePath);
          dumpOut = new FileOutputStream(dumpFile);
        }
        return true;
      } catch (IOException e) {
        LOG.error("Got failure when creating dump stream " + dumpFilePath, e);
        enabledDump = false;
        if (dumpOut != null) {
          try {
            dumpOut.close();
          } catch (IOException e1) {
            LOG.error("Can't close dump stream " + dumpFilePath, e);
          }
        }
        return false;
      }
    }

    /**
     * Creates the random access file for the dump file if it does not
     * already exist.
     *
     * @return true if the random access file is available, false if dump
     *         should be disabled because creation failed.
     */
    private boolean ensureRandomAccessFile() {
      if (raf != null) {
        return true;
      }
      try {
        raf = new RandomAccessFile(dumpFilePath, "r");
        return true;
      } catch (FileNotFoundException e) {
        LOG.error("Can't get random access to file " + dumpFilePath);
        // Disable dump
        enabledDump = false;
        return false;
      }
    }

    /**
     * Iterates over the pending writes and dumps them to the dump file.
     */
    private void dumpPendingWrites() {
      if (LOG.isDebugEnabled()) {
        LOG.debug("Start dump. Before dump, nonSequentialWriteInMemory == "
            + nonSequentialWriteInMemory.get());
      }

      Iterator<OffsetRange> it = pendingWrites.keySet().iterator();
      while (activeState && it.hasNext()
          && nonSequentialWriteInMemory.get() > 0) {
        OffsetRange key = it.next();
        WriteCtx writeCtx = pendingWrites.get(key);
        if (writeCtx == null) {
          // This write was just deleted
          continue;
        }
        try {
          long dumpedDataSize = writeCtx.dumpData(dumpOut, raf);
          if (dumpedDataSize > 0) {
            updateNonSequentialWriteInMemory(-dumpedDataSize);
          }
        } catch (IOException e) {
          LOG.error("Dump data failed: " + writeCtx + " with error: " + e
              + " OpenFileCtx state: " + activeState);
          // Disable dump
          enabledDump = false;
          return;
        }
      }

      if (LOG.isDebugEnabled()) {
        LOG.debug("After dump, nonSequentialWriteInMemory == "
            + nonSequentialWriteInMemory.get());
      }
    }
  }
  
  private WriteCtx checkRepeatedWriteRequest(WriteRequestContext reqCtx) {
    WRITE3Request request = reqCtx.getRequest();
    OffsetRange range = new OffsetRange(request.getOffset(),
        request.getOffset() + request.getCount());
    WriteCtx writeCtx = pendingWrites.get(range);
    if (writeCtx== null) {
      return null;
    } else {
      if (reqCtx.getXid() != writeCtx.getXid()) {
        LOG.warn("Got a repeated request, same range, with a different xid: "
            + reqCtx.getXid() + " xid in old request: " + writeCtx.getXid());
        //TODO: better handling.
      }
      return writeCtx;  
    }
  }
  
  public void receivedNewWrite(DFSClient dfsClient, WRITE3Request request,
      Channel channel, int xid, AsyncDataService asyncDataService,
      IdMappingServiceProvider iug) {
    
    if (!activeState) {
      LOG.info("OpenFileCtx is inactive, fileId: "
          + request.getHandle().getFileId());
      WccData fileWcc = new WccData(latestAttr.getWccAttr(), latestAttr);
      WRITE3Response response = new WRITE3Response(Nfs3Status.NFS3ERR_IO,
          fileWcc, 0, request.getStableHow(), Nfs3Constant.WRITE_COMMIT_VERF);
      Nfs3Utils.writeChannel(channel,
          response.serialize(new XDR(), xid, new VerifierNone()),
          xid);
    } else {
      // Update the write time first
      updateLastAccessTime();
      
      // Handle repeated write requests (same xid or not).
      // If already replied, send reply again. If not replied, drop the
      // repeated request.
      WriteRequestContext reqCtx = new WriteRequestContext(request, channel, xid);
      WriteCtx existantWriteCtx = checkRepeatedWriteRequest(reqCtx);
      if (existantWriteCtx != null) {
        if (!existantWriteCtx.getReplied()) {
          if (LOG.isDebugEnabled()) {
            LOG.debug("Repeated write request which hasn't been served: xid="
                + reqCtx.getXid() + ", drop it.");
          }
        } else {
          if (LOG.isDebugEnabled()) {
            LOG.debug("Repeated write request which is already served: xid="
                + reqCtx.getXid() + ", resend response.");
          }
          WccData fileWcc = new WccData(latestAttr.getWccAttr(), latestAttr);
          WRITE3Response response = new WRITE3Response(Nfs3Status.NFS3_OK,
              fileWcc, request.getCount(), request.getStableHow(),
              Nfs3Constant.WRITE_COMMIT_VERF);
          Nfs3Utils.writeChannel(reqCtx.getChannel(), response.serialize(
              new XDR(), reqCtx.getXid(), new VerifierNone()), reqCtx.getXid());
        }
      } else {
        // not a repeated write request
        receivedNewWriteInternal(reqCtx, new ClientContext(dfsClient, iug),
            asyncDataService);
      }
    }
  }

  @VisibleForTesting
  public static void alterWriteRequest(WRITE3Request request, long cachedOffset) {
    long offset = request.getOffset();
    int count = request.getCount();
    long smallerCount = offset + count - cachedOffset;
    if (LOG.isDebugEnabled()) {
      LOG.debug(String.format("Got overwrite with appended data (%d-%d),"
          + " current offset %d," + " drop the overlapped section (%d-%d)"
          + " and append new data (%d-%d).", offset, (offset + count - 1),
          cachedOffset, offset, (cachedOffset - 1), cachedOffset, (offset
              + count - 1)));
    }
    
    ByteBuffer data = request.getData();
    Preconditions.checkState(data.position() == 0,
        "The write request data has non-zero position");
    data.position((int) (cachedOffset - offset));
    Preconditions.checkState(data.limit() - data.position() == smallerCount,
        "The write request buffer has wrong limit/position regarding count");
    
    request.setOffset(cachedOffset);
    request.setCount((int) smallerCount);
  }
  
  /**
   * Creates and adds a WriteCtx into the pendingWrites map. This is a
   * synchronized method to handle concurrent writes.
   * 
   * @return A non-null {@link WriteCtx} instance if the incoming write
   *         request's offset >= nextOffset. Otherwise null.
   */
  private synchronized WriteCtx addWritesToCache(WriteRequestContext reqCtx) {
    WRITE3Request request = reqCtx.getRequest();
    long offset = request.getOffset();
    int count = request.getCount();
    long cachedOffset = nextOffset.get();
    int originalCount = WriteCtx.INVALID_ORIGINAL_COUNT;
    
    if (LOG.isDebugEnabled()) {
      LOG.debug("requested offset=" + offset + " and current offset="
          + cachedOffset);
    }

    // Handle a special case first
    if ((offset < cachedOffset) && (offset + count > cachedOffset)) {
      // One Linux client behavior: after a file is closed and reopened to
      // write, the client sometimes combines previous written data(could still
      // be in kernel buffer) with newly appended data in one write. This is
      // usually the first write after file reopened. In this
      // case, we log the event and drop the overlapped section.
      LOG.warn(String.format("Got overwrite with appended data (%d-%d),"
          + " current offset %d," + " drop the overlapped section (%d-%d)"
          + " and append new data (%d-%d).", offset, (offset + count - 1),
          cachedOffset, offset, (cachedOffset - 1), cachedOffset, (offset
              + count - 1)));

      if (!pendingWrites.isEmpty()) {
        LOG.warn("There are other pending writes, fail this jumbo write");
        return null;
      }
      
      LOG.warn("Modify this write to write only the appended data");
      alterWriteRequest(request, cachedOffset);

      // Update local variable
      originalCount = count;
      offset = request.getOffset();
      count = request.getCount();
    }
    
    // Fail non-append call
    if (offset < cachedOffset) {
      LOG.warn("(offset,count,nextOffset): " + "(" + offset + "," + count + ","
          + nextOffset + ")");
      return null;
    } else {
      DataState dataState = offset == cachedOffset ? WriteCtx.DataState.NO_DUMP
          : WriteCtx.DataState.ALLOW_DUMP;
      WriteCtx writeCtx = new WriteCtx(request.getHandle(),
          request.getOffset(), request.getCount(), originalCount,
          request.getStableHow(), request.getData(), reqCtx.getChannel(),
          reqCtx.getXid(), false, dataState);
      if (LOG.isDebugEnabled()) {
        LOG.debug("Add new write to the list with nextOffset " + cachedOffset
            + " and requested offset=" + offset);
      }
      if (writeCtx.getDataState() == WriteCtx.DataState.ALLOW_DUMP) {
        // update the memory size
        updateNonSequentialWriteInMemory(count);
      }
      // check if there is a WriteCtx with the same range in pendingWrites
      WriteCtx oldWriteCtx = checkRepeatedWriteRequest(reqCtx);
      if (oldWriteCtx == null) {
        pendingWrites.put(new OffsetRange(offset, offset + count), writeCtx);
        if (LOG.isDebugEnabled()) {
          LOG.debug("New write buffered with xid " + reqCtx.getXid()
              + " nextOffset " + cachedOffset + " req offset=" + offset
              + " mapsize=" + pendingWrites.size());
        }
      } else {
        LOG.warn("Got a repeated request, same range, with xid: " + reqCtx.getXid()
            + " nextOffset " + +cachedOffset + " req offset=" + offset);
      }
      return writeCtx;
    }
  }
  
  /** Process an overwrite write request */
  private void processOverWrite(WriteRequestContext reqCtx,
      ClientContext clientCtx) {
    WRITE3Request request = reqCtx.getRequest();
    WccData wccData = new WccData(latestAttr.getWccAttr(), null);
    long offset = request.getOffset();
    int count = request.getCount();
    WriteStableHow stableHow = request.getStableHow();
    WRITE3Response response;
    long cachedOffset = nextOffset.get();
    if (offset + count > cachedOffset) {
      LOG.warn("Treat this jumbo write as a real random write, no support.");
      response = new WRITE3Response(Nfs3Status.NFS3ERR_INVAL, wccData, 0,
          WriteStableHow.UNSTABLE, Nfs3Constant.WRITE_COMMIT_VERF);
    } else {
      if (LOG.isDebugEnabled()) {
        LOG.debug("Process perfectOverWrite");
      }
      // TODO: let executor handle perfect overwrite
      response = processPerfectOverWrite(new PerfectOverwriteRequest(offset,
          count, stableHow, request.getData().array(),
          Nfs3Utils.getFileIdPath(request.getHandle())), wccData, clientCtx);
    }
    updateLastAccessTime();
    Nfs3Utils.writeChannel(reqCtx.getChannel(),
        response.serialize(new XDR(), reqCtx.getXid(), new VerifierNone()),
        reqCtx.getXid());
  }
  
  /**
   * Check if we can start the write (back to HDFS) now. If there is no hole for
   * writing, and there is no other threads writing (i.e., asyncStatus is
   * false), start the writing and set asyncStatus to true.
   * 
   * @return True if the new write is sequential and we can start writing
   *         (including the case that there is already a thread writing).
   */
  private synchronized boolean checkAndStartWrite(
      AsyncDataService asyncDataService, WriteCtx writeCtx) {
    
    if (writeCtx.getOffset() == nextOffset.get()) {
      if (!asyncStatus) {
        if (LOG.isDebugEnabled()) {
          LOG.debug("Trigger the write back task. Current nextOffset: "
              + nextOffset.get());
        }
        asyncStatus = true;
        asyncWriteBackStartOffset = writeCtx.getOffset();
        asyncDataService.execute(new AsyncDataService.WriteBackTask(this));
      } else {
        if (LOG.isDebugEnabled()) {
          LOG.debug("The write back thread is working.");
        }
      }
      return true;
    } else {
      return false;
    }
  }

  private void receivedNewWriteInternal(WriteRequestContext reqCtx,
      ClientContext clientCtx, AsyncDataService asyncDataService) {
    WRITE3Request request = reqCtx.getRequest();
    WriteStableHow stableHow = request.getStableHow();
    WccAttr preOpAttr = latestAttr.getWccAttr();
    int count = request.getCount();

    WriteCtx writeCtx = addWritesToCache(reqCtx);
    if (writeCtx == null) {
      // offset < nextOffset
      processOverWrite(reqCtx, clientCtx);
    } else {
      // The write is added to pendingWrites.
      // Check and start writing back if necessary
      boolean startWriting = checkAndStartWrite(asyncDataService, writeCtx);
      if (!startWriting) {
        // offset > nextOffset. check if we need to dump data
        waitForDump();
        
        // In test, noticed some Linux client sends a batch (e.g., 1MB)
        // of reordered writes and won't send more writes until it gets
        // responses of the previous batch. So here send response immediately
        // for unstable non-sequential write
        if (stableHow != WriteStableHow.UNSTABLE) {
          LOG.info("Have to change stable write to unstable write: "
              + request.getStableHow());
          stableHow = WriteStableHow.UNSTABLE;
        }

        if (LOG.isDebugEnabled()) {
          LOG.debug("UNSTABLE write request, send response for offset: "
              + writeCtx.getOffset());
        }
        WccData fileWcc = new WccData(preOpAttr, latestAttr);
        WRITE3Response response = new WRITE3Response(Nfs3Status.NFS3_OK,
            fileWcc, count, stableHow, Nfs3Constant.WRITE_COMMIT_VERF);
        RpcProgramNfs3.metrics.addWrite(Nfs3Utils
            .getElapsedTime(writeCtx.startTime));
        Nfs3Utils
            .writeChannel(reqCtx.getChannel(), response.serialize(new XDR(),
                reqCtx.getXid(), new VerifierNone()), reqCtx.getXid());
        writeCtx.setReplied(true);
      }
    }
  }
  
  /**
   * Honor 2 kinds of overwrites: 1). support some application like touch(write
   * the same content back to change mtime), 2) client somehow sends the same
   * write again in a different RPC.
   */
  private WRITE3Response processPerfectOverWrite(PerfectOverwriteRequest req,
      WccData wccData, ClientContext clientCtx) {
    WRITE3Response response;

    // Read the content back
    byte[] readbuffer = new byte[req.getCount()];

    int readCount = 0;
    FSDataInputStream fis = null;
    try {
      // Sync file data and length to avoid partial read failure
      fos.hsync(EnumSet.of(SyncFlag.UPDATE_LENGTH));
    } catch (ClosedChannelException closedException) {
      LOG.info("The FSDataOutputStream has been closed. "
          + "Continue processing the perfect overwrite.");
    } catch (IOException e) {
      LOG.info("hsync failed when processing possible perfect overwrite, path="
          + req.getPath() + " error: " + e);
      return new WRITE3Response(Nfs3Status.NFS3ERR_IO, wccData, 0,
          req.getStableHow(), Nfs3Constant.WRITE_COMMIT_VERF);
    }
    
    try {
      fis = clientCtx.getDfsClient().createWrappedInputStream(
          clientCtx.getDfsClient().open(req.getPath()));
      readCount = fis.read(req.getOffset(), readbuffer, 0, req.getCount());
      if (readCount < req.getCount()) {
        LOG.error("Can't read back " + req.getCount()
            + " bytes, partial read size: " + readCount);
        return new WRITE3Response(Nfs3Status.NFS3ERR_IO, wccData, 0,
            req.getStableHow(), Nfs3Constant.WRITE_COMMIT_VERF);
      }
    } catch (IOException e) {
      LOG.info("Read failed when processing possible perfect overwrite, path="
          + req.getPath(), e);
      return new WRITE3Response(Nfs3Status.NFS3ERR_IO, wccData, 0,
          req.getStableHow(), Nfs3Constant.WRITE_COMMIT_VERF);
    } finally {
      IOUtils.cleanup(LOG, fis);
    }

    // Compare with the request
    Comparator comparator = new Comparator();
    if (comparator.compare(readbuffer, 0, readCount, req.getData(), 0,
        req.getCount()) != 0) {
      LOG.info("Perfect overwrite has different content");
      response = new WRITE3Response(Nfs3Status.NFS3ERR_INVAL, wccData, 0,
          req.getStableHow(), Nfs3Constant.WRITE_COMMIT_VERF);
    } else {
      LOG.info("Perfect overwrite has same content,"
          + " updating the mtime, then return success");
      Nfs3FileAttributes postOpAttr = null;
      try {
        clientCtx.getDfsClient().setTimes(req.getPath(), Time.monotonicNow(), -1);
        postOpAttr = Nfs3Utils.getFileAttr(clientCtx.getDfsClient(),
            req.getPath(), clientCtx.getIug());
      } catch (IOException e) {
        LOG.info("Got error when processing perfect overwrite, path="
            + req.getPath() + " error: " + e);
        return new WRITE3Response(Nfs3Status.NFS3ERR_IO, wccData, 0,
            req.getStableHow(), Nfs3Constant.WRITE_COMMIT_VERF);
      }

      wccData.setPostOpAttr(postOpAttr);
      response = new WRITE3Response(Nfs3Status.NFS3_OK, wccData,
          req.getCount(), req.getStableHow(), Nfs3Constant.WRITE_COMMIT_VERF);
    }
    return response;
  }
  
  /**
   * Check the commit status with the given offset
   * @param commitOffset the offset to commit
   * @param channel the channel to return response
   * @param xid the xid of the commit request
   * @param preOpAttr the preOp attribute
   * @param fromRead whether the commit is triggered from read request
   * @return one commit status: COMMIT_FINISHED, COMMIT_WAIT,
   * COMMIT_INACTIVE_CTX, COMMIT_INACTIVE_WITH_PENDING_WRITE, COMMIT_ERROR
   */
  public COMMIT_STATUS checkCommit(DFSClient dfsClient, long commitOffset,
      Channel channel, int xid, Nfs3FileAttributes preOpAttr, boolean fromRead) {
    if (!fromRead) {
      Preconditions.checkState(channel != null && preOpAttr != null);
      // Keep stream active
      updateLastAccessTime();
    }
    Preconditions.checkState(commitOffset >= 0);

    COMMIT_STATUS ret = checkCommitInternal(commitOffset, channel, xid,
        preOpAttr, fromRead);
    if (LOG.isDebugEnabled()) {
      LOG.debug("Got commit status: " + ret.name());
    }
    // Do the sync outside the lock
    if (ret == COMMIT_STATUS.COMMIT_DO_SYNC
        || ret == COMMIT_STATUS.COMMIT_FINISHED) {
      try {
        // Sync file data and length
        fos.hsync(EnumSet.of(SyncFlag.UPDATE_LENGTH));
        ret = COMMIT_STATUS.COMMIT_FINISHED; // Remove COMMIT_DO_SYNC status 
        // Nothing to do for metadata since attr related change is pass-through
      } catch (ClosedChannelException cce) {
        if (pendingWrites.isEmpty()) {
          ret = COMMIT_STATUS.COMMIT_FINISHED;
        } else {
          ret = COMMIT_STATUS.COMMIT_ERROR;
        }
      } catch (IOException e) {
        LOG.error("Got stream error during data sync: " + e);
        // Do nothing. Stream will be closed eventually by StreamMonitor.
        // status = Nfs3Status.NFS3ERR_IO;
        ret = COMMIT_STATUS.COMMIT_ERROR;
      }
    }
    return ret;
  }
  
  // Check if the to-commit range is sequential
  @VisibleForTesting
  synchronized boolean checkSequential(final long commitOffset,
      final long nextOffset) {
    Preconditions.checkState(commitOffset >= nextOffset, "commitOffset "
        + commitOffset + " less than nextOffset " + nextOffset);
    long offset = nextOffset;
    Iterator<OffsetRange> it = pendingWrites.descendingKeySet().iterator();
    while (it.hasNext()) {
      OffsetRange range = it.next();
      if (range.getMin() != offset) {
        // got a hole
        return false;
      }
      offset = range.getMax();
      if (offset > commitOffset) {
        return true;
      }
    }
    // there is gap between the last pending write and commitOffset
    return false;
  }

  private COMMIT_STATUS handleSpecialWait(CommitRequestContext reqCtx,
      CommitResponseContext respCtx) {
    if (!reqCtx.isFromRead()) {
      // let client retry the same request, add pending commit to sync later
      CommitCtx commitCtx = new CommitCtx(reqCtx.getCommitOffset(),
          respCtx.getChannel(), respCtx.getXid(), respCtx.getPreOpAttr());
      pendingCommits.put(reqCtx.getCommitOffset(), commitCtx);
    }
    if (LOG.isDebugEnabled()) {
      LOG.debug("return COMMIT_SPECIAL_WAIT");
    }
    return COMMIT_STATUS.COMMIT_SPECIAL_WAIT;
  }
  
  @VisibleForTesting
  synchronized COMMIT_STATUS checkCommitInternal(long commitOffset,
      Channel channel, int xid, Nfs3FileAttributes preOpAttr, boolean fromRead) {
    return evaluateCommitStatus(
        new CommitRequestContext(commitOffset, fromRead),
        new CommitResponseContext(channel, xid, preOpAttr));
  }

  /**
   * Evaluates the commit status for the given request and response context.
   */
  private COMMIT_STATUS evaluateCommitStatus(CommitRequestContext reqCtx,
      CommitResponseContext respCtx) {
    if (!activeState) {
      if (pendingWrites.isEmpty()) {
        return COMMIT_STATUS.COMMIT_INACTIVE_CTX;
      } else {
        // TODO: return success if already committed
        return COMMIT_STATUS.COMMIT_INACTIVE_WITH_PENDING_WRITE;
      }
    }

    long flushed = 0;
    try {
      flushed = getFlushedOffset();
    } catch (IOException e) {
      LOG.error("Can't get flushed offset, error:" + e);
      return COMMIT_STATUS.COMMIT_ERROR;
    }
    
    if (LOG.isDebugEnabled()) {
      LOG.debug("getFlushedOffset=" + flushed + " commitOffset="
          + reqCtx.getCommitOffset() + "nextOffset=" + nextOffset.get());
    }
    
    Preconditions.checkState(flushed <= nextOffset.get(), "flushed " + flushed
        + " is larger than nextOffset " + nextOffset.get());

    if (pendingWrites.isEmpty()) {
      return evaluateEmptyPendingWrites(reqCtx, respCtx, flushed);
    }

    // Handle large file upload
    if (uploadLargeFile && !aixCompatMode) {
      return evaluateLargeFileUploadCommit(reqCtx, respCtx, flushed);
    }

    if (reqCtx.getCommitOffset() > 0) {
      COMMIT_STATUS status = evaluateNonZeroCommitOffset(reqCtx, respCtx,
          flushed);
      if (status != null) {
        return status;
      }
    }

    return evaluateWholeFileCommit(reqCtx, respCtx);
  }

  /**
   * Determines the commit status when there are no pending writes.
   */
  private COMMIT_STATUS evaluateEmptyPendingWrites(CommitRequestContext reqCtx,
      CommitResponseContext respCtx, long flushed) {
    if (aixCompatMode) {
      // Note that, there is no guarantee data is synced. Caller should still
      // do a sync here though the output stream might be closed.
      return COMMIT_STATUS.COMMIT_FINISHED;
    } else {
      if (flushed < nextOffset.get()) {
        if (LOG.isDebugEnabled()) {
          LOG.debug("get commit while still writing to the requested offset,"
              + " with empty queue");
        }
        return handleSpecialWait(
            new CommitRequestContext(nextOffset.get(), reqCtx.isFromRead()),
            respCtx);
      } else {
        return COMMIT_STATUS.COMMIT_FINISHED;
      }
    }
  }

  /**
   * Determines the commit status for a large file upload request.
   */
  private COMMIT_STATUS evaluateLargeFileUploadCommit(
      CommitRequestContext reqCtx, CommitResponseContext respCtx, long flushed) {
    long co = (reqCtx.getCommitOffset() > 0) ? reqCtx.getCommitOffset()
        : pendingWrites.firstEntry().getKey().getMax() - 1;

    if (co <= flushed) {
      return COMMIT_STATUS.COMMIT_DO_SYNC;
    } else if (co < nextOffset.get()) {
      if (LOG.isDebugEnabled()) {
        LOG.debug("get commit while still writing to the requested offset");
      }
      return handleSpecialWait(new CommitRequestContext(co, reqCtx.isFromRead()),
          respCtx);
    } else {
      // co >= nextOffset
      if (checkSequential(co, nextOffset.get())) {
        return handleSpecialWait(new CommitRequestContext(co, reqCtx.isFromRead()),
            respCtx);
      } else {
        if (LOG.isDebugEnabled()) {
          LOG.debug("return COMMIT_SPECIAL_SUCCESS");
        }
        return COMMIT_STATUS.COMMIT_SPECIAL_SUCCESS;
      }
    }
  }

  /**
   * Determines the commit status when the requested commit offset is greater
   * than zero. Returns {@code null} when the caller should fall through to
   * whole-file commit handling.
   */
  private COMMIT_STATUS evaluateNonZeroCommitOffset(
      CommitRequestContext reqCtx, CommitResponseContext respCtx, long flushed) {
    if (aixCompatMode) {
      // The AIX NFS client misinterprets RFC-1813 and will always send 4096
      // for the commitOffset even if fewer bytes than that have ever (or will
      // ever) be sent by the client. So, if in AIX compatibility mode, we
      // will always DO_SYNC if the number of bytes to commit have already all
      // been flushed, else we will fall through to the logic below which
      // checks for pending writes in the case that we're being asked to
      // commit more bytes than have so far been flushed. See HDFS-6549 for
      // more info.
      if (reqCtx.getCommitOffset() <= flushed) {
        return COMMIT_STATUS.COMMIT_DO_SYNC;
      }
      return null;
    } else {
      if (reqCtx.getCommitOffset() > flushed) {
        if (!reqCtx.isFromRead()) {
          CommitCtx commitCtx = new CommitCtx(reqCtx.getCommitOffset(),
              respCtx.getChannel(), respCtx.getXid(), respCtx.getPreOpAttr());
          pendingCommits.put(reqCtx.getCommitOffset(), commitCtx);
        }
        return COMMIT_STATUS.COMMIT_WAIT;
      } else {
        return COMMIT_STATUS.COMMIT_DO_SYNC;
      } 
    }
  }

  /**
   * Handles a whole-file commit request by inserting a pending commit and
   * returning {@link COMMIT_STATUS#COMMIT_WAIT}.
   */
  private COMMIT_STATUS evaluateWholeFileCommit(CommitRequestContext reqCtx,
      CommitResponseContext respCtx) {
    if (!reqCtx.isFromRead()) {
      // Insert commit
      Entry<OffsetRange, WriteCtx> key = pendingWrites.firstEntry();
      long maxOffset = key.getKey().getMax() - 1;
      Preconditions.checkState(maxOffset > 0);
      CommitCtx commitCtx = new CommitCtx(maxOffset, respCtx.getChannel(),
          respCtx.getXid(), respCtx.getPreOpAttr());
      pendingCommits.put(maxOffset, commitCtx);
    }
    return COMMIT_STATUS.COMMIT_WAIT;
  }
  
  /**
   * Check stream status to decide if it should be closed
   * @return true, remove stream; false, keep stream
   */
  public synchronized boolean streamCleanup(long fileId, long streamTimeout) {
    Preconditions
        .checkState(streamTimeout >= NfsConfigKeys.DFS_NFS_STREAM_TIMEOUT_MIN_DEFAULT);
    if (!activeState) {
      return true;
    }
    
    boolean flag = false;
    // Check the stream timeout
    if (checkStreamTimeout(streamTimeout)) {
      if (LOG.isDebugEnabled()) {
        LOG.debug("stream can be closed for fileId: " + fileId);
      }
      flag = true;
    }
    return flag;
  }
  
  /**
   * Get (and remove) the next WriteCtx from {@link #pendingWrites} if possible.
   * 
   * @return Null if {@link #pendingWrites} is null, or the next WriteCtx's
   *         offset is larger than nextOffSet.
   */
  private synchronized WriteCtx offerNextToWrite() {
    if (pendingWrites.isEmpty()) {
      if (LOG.isDebugEnabled()) {
        LOG.debug("The async write task has no pending writes, fileId: "
            + latestAttr.getFileId());
      }
      // process pending commit again to handle this race: a commit is added
      // to pendingCommits map just after the last doSingleWrite returns.
      // There is no pending write and the commit should be handled by the
      // last doSingleWrite. Due to the race, the commit is left along and
      // can't be processed until cleanup. Therefore, we should do another
      // processCommits to fix the race issue.
      processCommits(nextOffset.get()); // nextOffset has same value as
                                        // flushedOffset
      this.asyncStatus = false;
      return null;
    } 
    
      Entry<OffsetRange, WriteCtx> lastEntry = pendingWrites.lastEntry();
      OffsetRange range = lastEntry.getKey();
      WriteCtx toWrite = lastEntry.getValue();
      
      if (LOG.isTraceEnabled()) {
        LOG.trace("range.getMin()=" + range.getMin() + " nextOffset="
            + nextOffset);
      }
      
      long offset = nextOffset.get();
      if (range.getMin() > offset) {
        if (LOG.isDebugEnabled()) {
          LOG.debug("The next sequential write has not arrived yet");
        }
        processCommits(nextOffset.get()); // handle race
        this.asyncStatus = false;
      } else if (range.getMin() < offset && range.getMax() > offset) {
        // shouldn't happen since we do sync for overlapped concurrent writers
        LOG.warn("Got an overlapping write (" + range.getMin() + ", "
            + range.getMax() + "), nextOffset=" + offset
            + ". Silently drop it now");
        pendingWrites.remove(range);
        processCommits(nextOffset.get()); // handle race
      } else {
        if (LOG.isDebugEnabled()) {
          LOG.debug("Remove write(" + range.getMin() + "-" + range.getMax()
              + ") from the list");
        }
        // after writing, remove the WriteCtx from cache 
        pendingWrites.remove(range);
        // update nextOffset
        nextOffset.addAndGet(toWrite.getCount());
        if (LOG.isDebugEnabled()) {
          LOG.debug("Change nextOffset to " + nextOffset.get());
        }
        return toWrite;
      }
    
    return null;
  }
  
  /** Invoked by AsyncDataService to write back to HDFS */
  void executeWriteBack() {
    Preconditions.checkState(asyncStatus,
        "openFileCtx has false asyncStatus, fileId: " + latestAttr.getFileId());
    final long startOffset = asyncWriteBackStartOffset;  
    try {
      while (activeState) {
        // asyncStatus could be changed to false in offerNextToWrite()
        WriteCtx toWrite = offerNextToWrite();
        if (toWrite != null) {
          // Do the write
          doSingleWrite(toWrite);
          updateLastAccessTime();
        } else {
          break;
        }
      }
      
      if (!activeState && LOG.isDebugEnabled()) {
        LOG.debug("The openFileCtx is not active anymore, fileId: "
            + latestAttr.getFileId());
      }
    } finally {
      // Make sure to reset asyncStatus to false unless a race happens
      synchronized (this) {
        if (startOffset == asyncWriteBackStartOffset) {
          asyncStatus = false;
        } else {
          LOG.info("Another async task is already started before this one"
              + " is finalized. fileId: " + latestAttr.getFileId()
              + " asyncStatus: " + asyncStatus + " original startOffset: "
              + startOffset + " new startOffset: " + asyncWriteBackStartOffset
              + ". Won't change asyncStatus here.");
        }
      }
    }
  }

  private void processCommits(long offset) {
    Preconditions.checkState(offset > 0);
    long flushedOffset = 0;
    Entry<Long, CommitCtx> entry = null;

    int status = Nfs3Status.NFS3ERR_IO;
    try {
      flushedOffset = getFlushedOffset();
      entry = pendingCommits.firstEntry();
      if (entry == null || entry.getValue().offset > flushedOffset) {
        return;
      }

      // Now do sync for the ready commits
      // Sync file data and length
      fos.hsync(EnumSet.of(SyncFlag.UPDATE_LENGTH));
      status = Nfs3Status.NFS3_OK;
    } catch (ClosedChannelException cce) {
      if (!pendingWrites.isEmpty()) {
        LOG.error("Can't sync for fileId: " + latestAttr.getFileId()
            + ". Channel closed with writes pending.", cce);
      }
      status = Nfs3Status.NFS3ERR_IO;
    } catch (IOException e) {
      LOG.error("Got stream error during data sync: ", e);
      // Do nothing. Stream will be closed eventually by StreamMonitor.
      status = Nfs3Status.NFS3ERR_IO;
    }

    // Update latestAttr
    try {
      latestAttr = Nfs3Utils.getFileAttr(client,
          Nfs3Utils.getFileIdPath(latestAttr.getFileId()), iug);
    } catch (IOException e) {
      LOG.error("Can't get new file attr, fileId: " + latestAttr.getFileId(), e);
      status = Nfs3Status.NFS3ERR_IO;
    }

    if (latestAttr.getSize() != offset) {
      LOG.error("After sync, the expect file size: " + offset
          + ", however actual file size is: " + latestAttr.getSize());
      status = Nfs3Status.NFS3ERR_IO;
    }
    WccData wccData = new WccData(Nfs3Utils.getWccAttr(latestAttr), latestAttr);

    // Send response for the ready commits
    while (entry != null && entry.getValue().offset <= flushedOffset) {
      pendingCommits.remove(entry.getKey());
      CommitCtx commit = entry.getValue();

      COMMIT3Response response = new COMMIT3Response(status, wccData,
          Nfs3Constant.WRITE_COMMIT_VERF);
      RpcProgramNfs3.metrics.addCommit(Nfs3Utils
          .getElapsedTime(commit.startTime));
      Nfs3Utils.writeChannelCommit(commit.getChannel(), response
          .serialize(new XDR(), commit.getXid(),
              new VerifierNone()), commit.getXid());
      
      if (LOG.isDebugEnabled()) {
        LOG.debug("FileId: " + latestAttr.getFileId() + " Service time: "
            + Nfs3Utils.getElapsedTime(commit.startTime)
            + "ns. Sent response for commit: " + commit);
      }
      entry = pendingCommits.firstEntry();
    }
  }
  
  private void doSingleWrite(final WriteCtx writeCtx) {
    Channel channel = writeCtx.getChannel();
    int xid = writeCtx.getXid();

    long offset = writeCtx.getOffset();
    int count = writeCtx.getCount();
    WriteStableHow stableHow = writeCtx.getStableHow();
    
    FileHandle handle = writeCtx.getHandle();
    if (LOG.isDebugEnabled()) {
      LOG.debug("do write, fileId: " + handle.getFileId() + " offset: "
          + offset + " length: " + count + " stableHow: " + stableHow.name());
    }

    try {
      // The write is not protected by lock. asyncState is used to make sure
      // there is one thread doing write back at any time    
      writeCtx.writeData(fos);
      RpcProgramNfs3.metrics.incrBytesWritten(writeCtx.getCount());
      
      long flushedOffset = getFlushedOffset();
      if (flushedOffset != (offset + count)) {
        throw new IOException("output stream is out of sync, pos="
            + flushedOffset + " and nextOffset should be"
            + (offset + count));
      }
      

      // Reduce memory occupation size if request was allowed dumped
      if (writeCtx.getDataState() == WriteCtx.DataState.ALLOW_DUMP) {
        synchronized (writeCtx) {
          if (writeCtx.getDataState() == WriteCtx.DataState.ALLOW_DUMP) {
            writeCtx.setDataState(WriteCtx.DataState.NO_DUMP);
            updateNonSequentialWriteInMemory(-count);
            if (LOG.isDebugEnabled()) {
              LOG.debug("After writing " + handle.getFileId() + " at offset "
                  + offset + ", updated the memory count, new value: "
                  + nonSequentialWriteInMemory.get());
            }
          }
        }
      }
      
      if (!writeCtx.getReplied()) {
        if (stableHow != WriteStableHow.UNSTABLE) {
          LOG.info("Do sync for stable write: " + writeCtx);
          try {
            if (stableHow == WriteStableHow.DATA_SYNC) {
              fos.hsync();
            } else {
              Preconditions.checkState(stableHow == WriteStableHow.FILE_SYNC,
                  "Unknown WriteStableHow: " + stableHow);
              // Sync file data and length
              fos.hsync(EnumSet.of(SyncFlag.UPDATE_LENGTH));
            }
          } catch (IOException e) {
            LOG.error("hsync failed with writeCtx: " + writeCtx, e);
            throw e;
          }
        }
        
        WccAttr preOpAttr = latestAttr.getWccAttr();
        WccData fileWcc = new WccData(preOpAttr, latestAttr);
        if (writeCtx.getOriginalCount() != WriteCtx.INVALID_ORIGINAL_COUNT) {
          LOG.warn("Return original count: " + writeCtx.getOriginalCount()
              + " instead of real data count: " + count);
          count = writeCtx.getOriginalCount();
        }
        WRITE3Response response = new WRITE3Response(Nfs3Status.NFS3_OK,
            fileWcc, count, stableHow, Nfs3Constant.WRITE_COMMIT_VERF);
        RpcProgramNfs3.metrics.addWrite(Nfs3Utils.getElapsedTime(writeCtx.startTime));
        Nfs3Utils.writeChannel(channel, response.serialize(
            new XDR(), xid, new VerifierNone()), xid);
      }
      
      // Handle the waiting commits without holding any lock
      processCommits(writeCtx.getOffset() + writeCtx.getCount());
     
    } catch (IOException e) {
      LOG.error("Error writing to fileId " + handle.getFileId() + " at offset "
          + offset + " and length " + count, e);
      if (!writeCtx.getReplied()) {
        WRITE3Response response = new WRITE3Response(Nfs3Status.NFS3ERR_IO);
        Nfs3Utils.writeChannel(channel, response.serialize(
            new XDR(), xid, new VerifierNone()), xid);
        // Keep stream open. Either client retries or SteamMonitor closes it.
      }

      LOG.info("Clean up open file context for fileId: "
          + latestAttr.getFileId());
      cleanup();
    }
  }

  synchronized void cleanup() {
    if (!activeState) {
      LOG.info("Current OpenFileCtx is already inactive, no need to cleanup.");
      return;
    }
    activeState = false;

    // stop the dump thread
    if (dumpThread != null && dumpThread.isAlive()) {
      dumpThread.interrupt();
      try {
        dumpThread.join(3000);
      } catch (InterruptedException ignored) {
      }
    }
    
    // Close stream
    try {
      if (fos != null) {
        fos.close();
      }
    } catch (IOException e) {
      LOG.info("Can't close stream for fileId: " + latestAttr.getFileId()
          + ", error: " + e);
    }
    
    // Reply error for pending writes
    LOG.info("There are " + pendingWrites.size() + " pending writes.");
    WccAttr preOpAttr = latestAttr.getWccAttr();
    while (!pendingWrites.isEmpty()) {
      OffsetRange key = pendingWrites.firstKey();
      LOG.info("Fail pending write: (" + key.getMin() + ", " + key.getMax()
          + "), nextOffset=" + nextOffset.get());
      
      WriteCtx writeCtx = pendingWrites.remove(key);
      if (!writeCtx.getReplied()) {
        WccData fileWcc = new WccData(preOpAttr, latestAttr);
        WRITE3Response response = new WRITE3Response(Nfs3Status.NFS3ERR_IO,
            fileWcc, 0, writeCtx.getStableHow(), Nfs3Constant.WRITE_COMMIT_VERF);
        Nfs3Utils.writeChannel(writeCtx.getChannel(), response
            .serialize(new XDR(), writeCtx.getXid(),
                new VerifierNone()), writeCtx.getXid());
      }
    }
    
    // Cleanup dump file
    if (dumpOut != null) {
      try {
        dumpOut.close();
      } catch (IOException e) {
        LOG.error("Failed to close outputstream of dump file" + dumpFilePath, e);
      }
      File dumpFile = new File(dumpFilePath);
      if (dumpFile.exists() && !dumpFile.delete()) {
        LOG.error("Failed to delete dumpfile: " + dumpFile);
      }
    }
    if (raf != null) {
      try {
        raf.close();
      } catch (IOException e) {
        LOG.error("Got exception when closing input stream of dump file.", e);
      }
    }
  }
  
  @VisibleForTesting
  ConcurrentNavigableMap<OffsetRange, WriteCtx> getPendingWritesForTest(){
    return pendingWrites;
  }
  
  @VisibleForTesting
  ConcurrentNavigableMap<Long, CommitCtx> getPendingCommitsForTest(){
    return pendingCommits;
  }
  
  @VisibleForTesting
  long getNextOffsetForTest() {
    return nextOffset.get();
  }
  
  @VisibleForTesting
  void setNextOffsetForTest(long newValue) {
    nextOffset.set(newValue);
  }
  
  @VisibleForTesting
  void setActiveStatusForTest(boolean activeState) {
    this.activeState = activeState;
  }
  
  @Override
  public String toString() {
    return String.format("activeState: %b asyncStatus: %b nextOffset: %d",
        activeState, asyncStatus, nextOffset.get());
  }
}