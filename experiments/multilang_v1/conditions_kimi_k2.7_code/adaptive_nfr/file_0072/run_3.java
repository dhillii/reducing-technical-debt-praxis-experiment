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
   * Holds the parameters that always travel together for a write request.
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
   * Holds the service dependencies used when processing writes.
   */
  private static class WriteServicesContext {
    private final DFSClient dfsClient;
    private final IdMappingServiceProvider iug;
    private final AsyncDataService asyncDataService;

    private WriteServicesContext(Builder builder) {
      this.dfsClient = builder.dfsClient;
      this.iug = builder.iug;
      this.asyncDataService = builder.asyncDataService;
    }

    DFSClient getDfsClient() {
      return dfsClient;
    }

    IdMappingServiceProvider getIug() {
      return iug;
    }

    AsyncDataService getAsyncDataService() {
      return asyncDataService;
    }

    /**
     * Builder for {@link WriteServicesContext}.
     */
    static class Builder {
      private final DFSClient dfsClient;
      private final IdMappingServiceProvider iug;
      private AsyncDataService asyncDataService;

      Builder(DFSClient dfsClient, IdMappingServiceProvider iug) {
        this.dfsClient = dfsClient;
        this.iug = iug;
      }

      Builder asyncDataService(AsyncDataService asyncDataService) {
        this.asyncDataService = asyncDataService;
        return this;
      }

      WriteServicesContext build() {
        return new WriteServicesContext(this);
      }
    }
  }

  /**
   * Holds the parameters that always travel together for a commit request.
   */
  private static class CommitRequestContext {
    private final long commitOffset;
    private final Channel channel;
    private final int xid;
    private final Nfs3FileAttributes preOpAttr;
    private final boolean fromRead;

    CommitRequestContext(long commitOffset, Channel channel, int xid,
        Nfs3FileAttributes preOpAttr, boolean fromRead) {
      this.commitOffset = commitOffset;
      this.channel = channel;
      this.xid = xid;
      this.preOpAttr = preOpAttr;
      this.fromRead = fromRead;
    }

    long getCommitOffset() {
      return commitOffset;
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

    boolean isFromRead() {
      return fromRead;
    }
  }

  /**
   * Holds the data-related parameters for a perfect overwrite check.
   */
  private static class WriteDataParams {
    private final long offset;
    private final int count;
    private final WriteStableHow stableHow;
    private final byte[] data;

    WriteDataParams(long offset, int count, WriteStableHow stableHow,
        byte[] data) {
      this.offset = offset;
      this.count = count;
      this.stableHow = stableHow;
      this.data = data;
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
  }

  /**
   * Holds the service dependencies used when processing a perfect overwrite.
   */
  private static class OverwriteServicesContext {
    private final DFSClient dfsClient;
    private final String path;
    private final IdMappingServiceProvider iug;

    OverwriteServicesContext(DFSClient dfsClient, String path,
        IdMappingServiceProvider iug) {
      this.dfsClient = dfsClient;
      this.path = path;
      this.iug = iug;
    }

    DFSClient getDfsClient() {
      return dfsClient;
    }

    String getPath() {
      return path;
    }

    IdMappingServiceProvider getIug() {
      return iug;
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
    this(fos, latestAttr, dumpFilePath, client, iug, false,
        new NfsConfiguration());
  }
  
  OpenFileCtx(HdfsDataOutputStream fos, Nfs3FileAttributes latestAttr,
      String dumpFilePath, DFSClient client, IdMappingServiceProvider iug,
      boolean aixCompatMode, NfsConfiguration config) {
    this.fos = fos;
    this.latestAttr = latestAttr;
    this.aixCompatMode = aixCompatMode;
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
  
    this.dumpFilePath = dumpFilePath;  
    enabledDump = dumpFilePath != null;
    nextOffset = new AtomicLong();
    nextOffset.set(latestAttr.getSize());
    try {	
      assert(nextOffset.get() == this.fos.getPos());
    } catch (IOException e) {}
    dumpThread = null;
    this.client = client;
    this.iug = iug;
    this.uploadLargeFile = config.getBoolean(NfsConfigKeys.LARGE_FILE_UPLOAD,
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

    /**
     * Creates the dump output stream if it has not been created yet.
     *
     * @return true if the dump output stream is ready to use
     */
    private boolean initializeDumpOutput() {
      if (dumpOut != null) {
        return true;
      }
      LOG.info("Create dump file: " + dumpFilePath);
      File dumpFile = new File(dumpFilePath);
      try {
        synchronized (this) {
          Preconditions.checkState(dumpFile.createNewFile(),
              "The dump file should not exist: %s", dumpFilePath);
          dumpOut = new FileOutputStream(dumpFile);
        }
        return true;
      } catch (IOException e) {
        LOG.error("Got failure when creating dump stream " + dumpFilePath, e);
        disableDump();
        return false;
      }
    }

    /**
     * Creates the random access file for reading dump data if needed.
     *
     * @return true if the reader is ready to use
     */
    private boolean initializeDumpReader() {
      if (raf != null) {
        return true;
      }
      try {
        raf = new RandomAccessFile(dumpFilePath, "r");
        return true;
      } catch (FileNotFoundException e) {
        LOG.error("Can't get random access to file " + dumpFilePath);
        disableDump();
        return false;
      }
    }

    /**
     * Dumps pending non-sequential writes to the dump file.
     */
    private void dumpPendingWrites() {
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
          disableDump();
          return;
        }
      }
    }

    /**
     * Disables further dump operations.
     */
    private void disableDump() {
      enabledDump = false;
    }

    /** Dump data into a file */
    private void dump() {
      if (!initializeDumpOutput()) {
        return;
      }

      if (!initializeDumpReader()) {
        return;
      }

      if (LOG.isDebugEnabled()) {
        LOG.debug("Start dump. Before dump, nonSequentialWriteInMemory == "
            + nonSequentialWriteInMemory.get());
      }

      dumpPendingWrites();

      if (LOG.isDebugEnabled()) {
        LOG.debug("After dump, nonSequentialWriteInMemory == "
            + nonSequentialWriteInMemory.get());
      }
    }

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
  }
  
  private WriteCtx checkRepeatedWriteRequest(WriteRequestContext writeRequest) {
    WRITE3Request request = writeRequest.getRequest();
    OffsetRange range = new OffsetRange(request.getOffset(),
        request.getOffset() + request.getCount());
    WriteCtx writeCtx = pendingWrites.get(range);
    if (writeCtx == null) {
      return null;
    }
    if (writeRequest.getXid() != writeCtx.getXid()) {
      LOG.warn("Got a repeated request, same range, with a different xid: "
          + writeRequest.getXid() + " xid in old request: " + writeCtx.getXid());
      //TODO: better handling.
    }
    return writeCtx;
  }
  
  public void receivedNewWrite(DFSClient dfsClient, WRITE3Request request,
      Channel channel, int xid, AsyncDataService asyncDataService,
      IdMappingServiceProvider iug) {
    WriteRequestContext writeRequest = new WriteRequestContext(request, channel,
        xid);
    WriteServicesContext services = new WriteServicesContext.Builder(dfsClient,
        iug).asyncDataService(asyncDataService).build();
    receivedNewWrite(writeRequest, services);
  }

  /**
   * Processes a new write request that has been bundled into a
   * {@link WriteRequestContext}.
   */
  private void receivedNewWrite(WriteRequestContext writeRequest,
      WriteServicesContext services) {
    WRITE3Request request = writeRequest.getRequest();
    Channel channel = writeRequest.getChannel();
    int xid = writeRequest.getXid();

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
      WriteCtx existantWriteCtx = checkRepeatedWriteRequest(writeRequest);
      if (existantWriteCtx != null) {
        if (!existantWriteCtx.getReplied()) {
          if (LOG.isDebugEnabled()) {
            LOG.debug("Repeated write request which hasn't been served: xid="
                + xid + ", drop it.");
          }
        } else {
          if (LOG.isDebugEnabled()) {
            LOG.debug("Repeated write request which is already served: xid="
                + xid + ", resend response.");
          }
          WccData fileWcc = new WccData(latestAttr.getWccAttr(), latestAttr);
          WRITE3Response response = new WRITE3Response(Nfs3Status.NFS3_OK,
              fileWcc, request.getCount(), request.getStableHow(),
              Nfs3Constant.WRITE_COMMIT_VERF);
          Nfs3Utils.writeChannel(channel, response.serialize(
              new XDR(), xid, new VerifierNone()), xid);
        }
      } else {
        // not a repeated write request
        receivedNewWriteInternal(writeRequest, services);
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
   * Creates a {@link WriteCtx} from the supplied request context.
   */
  private WriteCtx createWriteCtx(WriteRequestContext writeRequest,
      int originalCount, DataState dataState) {
    WRITE3Request request = writeRequest.getRequest();
    return new WriteCtx(request.getHandle(), request.getOffset(),
        request.getCount(), originalCount, request.getStableHow(),
        request.getData(), writeRequest.getChannel(), writeRequest.getXid(),
        false, dataState);
  }

  /**
   * Creates and adds a WriteCtx into the pendingWrites map. This is a
   * synchronized method to handle concurrent writes.
   * 
   * @return A non-null {@link WriteCtx} instance if the incoming write
   *         request's offset >= nextOffset. Otherwise null.
   */
  private synchronized WriteCtx addWritesToCache(WriteRequestContext writeRequest) {
    WRITE3Request request = writeRequest.getRequest();
    Channel channel = writeRequest.getChannel();
    int xid = writeRequest.getXid();
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
    }

    DataState dataState = offset == cachedOffset ? WriteCtx.DataState.NO_DUMP
        : WriteCtx.DataState.ALLOW_DUMP;
    WriteCtx writeCtx = createWriteCtx(writeRequest, originalCount, dataState);
    if (LOG.isDebugEnabled()) {
      LOG.debug("Add new write to the list with nextOffset " + cachedOffset
          + " and requested offset=" + offset);
    }
    if (writeCtx.getDataState() == WriteCtx.DataState.ALLOW_DUMP) {
      // update the memory size
      updateNonSequentialWriteInMemory(count);
    }
    // check if there is a WriteCtx with the same range in pendingWrites
    WriteCtx oldWriteCtx = checkRepeatedWriteRequest(writeRequest);
    if (oldWriteCtx == null) {
      pendingWrites.put(new OffsetRange(offset, offset + count), writeCtx);
      if (LOG.isDebugEnabled()) {
        LOG.debug("New write buffered with xid " + xid + " nextOffset "
            + cachedOffset + " req offset=" + offset + " mapsize="
            + pendingWrites.size());
      }
    } else {
      LOG.warn("Got a repeated request, same range, with xid: " + xid
          + " nextOffset " + +cachedOffset + " req offset=" + offset);
    }
    return writeCtx;
  }
  
  /** Process an overwrite write request */
  private void processOverWrite(WriteRequestContext writeRequest,
      WriteServicesContext services) {
    WRITE3Request request = writeRequest.getRequest();
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
      WriteDataParams dataParams = new WriteDataParams(offset, count,
          stableHow, request.getData().array());
      OverwriteServicesContext overwriteServices = new OverwriteServicesContext(
          services.getDfsClient(),
          Nfs3Utils.getFileIdPath(request.getHandle()),
          services.getIug());
      response = processPerfectOverWrite(dataParams, overwriteServices,
          wccData);
    }
    updateLastAccessTime();
    Nfs3Utils.writeChannel(writeRequest.getChannel(),
        response.serialize(new XDR(), writeRequest.getXid(),
            new VerifierNone()),
        writeRequest.getXid());
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

  private void receivedNewWriteInternal(WriteRequestContext writeRequest,
      WriteServicesContext services) {
    WRITE3Request request = writeRequest.getRequest();
    WriteStableHow stableHow = request.getStableHow();
    WccAttr preOpAttr = latestAttr.getWccAttr();
    int count = request.getCount();

    WriteCtx writeCtx = addWritesToCache(writeRequest);
    if (writeCtx == null) {
      // offset < nextOffset
      processOverWrite(writeRequest, services);
    } else {
      // The write is added to pendingWrites.
      // Check and start writing back if necessary
      boolean startWriting = checkAndStartWrite(services.getAsyncDataService(),
          writeCtx);
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
            .writeChannel(writeRequest.getChannel(), response.serialize(new XDR(),
                writeRequest.getXid(), new VerifierNone()),
                writeRequest.getXid());
        writeCtx.setReplied(true);
      }
    }
  }
  
  /**
   * Honor 2 kinds of overwrites: 1). support some application like touch(write
   * the same content back to change mtime), 2) client somehow sends the same
   * write again in a different RPC.
   */
  private WRITE3Response processPerfectOverWrite(WriteDataParams dataParams,
      OverwriteServicesContext services, WccData wccData) {
    WRITE3Response response;

    long offset = dataParams.getOffset();
    int count = dataParams.getCount();
    WriteStableHow stableHow = dataParams.getStableHow();
    byte[] data = dataParams.getData();
    String path = services.getPath();
    DFSClient dfsClient = services.getDfsClient();
    IdMappingServiceProvider iug = services.getIug();

    // Read the content back
    byte[] readbuffer = new byte[count];

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
          + path + " error: " + e);
      return new WRITE3Response(Nfs3Status.NFS3ERR_IO, wccData, 0, stableHow,
          Nfs3Constant.WRITE_COMMIT_VERF);
    }
    
    try {
      fis = dfsClient.createWrappedInputStream(dfsClient.open(path));
      readCount = fis.read(offset, readbuffer, 0, count);
      if (readCount < count) {
        LOG.error("Can't read back " + count + " bytes, partial read size: "
            + readCount);
        return new WRITE3Response(Nfs3Status.NFS3ERR_IO, wccData, 0, stableHow,
            Nfs3Constant.WRITE_COMMIT_VERF);
      }
    } catch (IOException e) {
      LOG.info("Read failed when processing possible perfect overwrite, path="
          + path, e);
      return new WRITE3Response(Nfs3Status.NFS3ERR_IO, wccData, 0, stableHow,
          Nfs3Constant.WRITE_COMMIT_VERF);
    } finally {
      IOUtils.cleanup(LOG, fis);
    }

    // Compare with the request
    Comparator comparator = new Comparator();
    if (comparator.compare(readbuffer, 0, readCount, data, 0, count) != 0) {
      LOG.info("Perfect overwrite has different content");
      response = new WRITE3Response(Nfs3Status.NFS3ERR_INVAL, wccData, 0,
          stableHow, Nfs3Constant.WRITE_COMMIT_VERF);
    } else {
      LOG.info("Perfect overwrite has same content,"
          + " updating the mtime, then return success");
      Nfs3FileAttributes postOpAttr = null;
      try {
        dfsClient.setTimes(path, Time.monotonicNow(), -1);
        postOpAttr = Nfs3Utils.getFileAttr(dfsClient, path, iug);
      } catch (IOException e) {
        LOG.info("Got error when processing perfect overwrite, path=" + path
            + " error: " + e);
        return new WRITE3Response(Nfs3Status.NFS3ERR_IO, wccData, 0, stableHow,
            Nfs3Constant.WRITE_COMMIT_VERF);
      }

      wccData.setPostOpAttr(postOpAttr);
      response = new WRITE3Response(Nfs3Status.NFS3_OK, wccData, count,
          stableHow, Nfs3Constant.WRITE_COMMIT_VERF);
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
    CommitRequestContext commitRequest = new CommitRequestContext(commitOffset,
        channel, xid, preOpAttr, fromRead);
    return checkCommit(commitRequest);
  }

  /**
   * Internal commit check using a bundled {@link CommitRequestContext}.
   */
  private COMMIT_STATUS checkCommit(CommitRequestContext commitRequest) {
    if (!commitRequest.isFromRead()) {
      Preconditions.checkState(commitRequest.getChannel() != null
          && commitRequest.getPreOpAttr() != null);
      // Keep stream active
      updateLastAccessTime();
    }
    Preconditions.checkState(commitRequest.getCommitOffset() >= 0);

    COMMIT_STATUS ret = checkCommitInternal(commitRequest);
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

  /**
   * Backward-compatible test hook that delegates to the refactored internal
   * commit check.
   */
  @VisibleForTesting
  synchronized COMMIT_STATUS checkCommitInternal(long commitOffset,
      Channel channel, int xid, Nfs3FileAttributes preOpAttr, boolean fromRead) {
    return checkCommitInternal(new CommitRequestContext(commitOffset, channel,
        xid, preOpAttr, fromRead));
  }

  /**
   * Records a pending commit for a non-read commit request.
   */
  private COMMIT_STATUS handleSpecialWait(CommitRequestContext ctx) {
    return handleSpecialWait(ctx, ctx.getCommitOffset());
  }

  /**
   * Records a pending commit for the supplied effective commit offset.
   */
  private COMMIT_STATUS handleSpecialWait(CommitRequestContext ctx,
      long commitOffset) {
    if (!ctx.isFromRead()) {
      CommitCtx commitCtx = new CommitCtx(commitOffset, ctx.getChannel(),
          ctx.getXid(), ctx.getPreOpAttr());
      pendingCommits.put(commitOffset, commitCtx);
    }
    if (LOG.isDebugEnabled()) {
      LOG.debug("return COMMIT_SPECIAL_WAIT");
    }
    return COMMIT_STATUS.COMMIT_SPECIAL_WAIT;
  }

  /**
   * Determines the commit status when there are no pending writes.
   */
  private COMMIT_STATUS commitStatusForEmptyPendingWrites(
      CommitRequestContext ctx, long flushed) {
    if (aixCompatMode) {
      // Note that, there is no guarantee data is synced. Caller should still
      // do a sync here though the output stream might be closed.
      return COMMIT_STATUS.COMMIT_FINISHED;
    }
    if (flushed < nextOffset.get()) {
      if (LOG.isDebugEnabled()) {
        LOG.debug("get commit while still writing to the requested offset,"
            + " with empty queue");
      }
      return handleSpecialWait(ctx, nextOffset.get());
    }
    return COMMIT_STATUS.COMMIT_FINISHED;
  }

  /**
   * Determines the commit status for large file uploads.
   */
  private COMMIT_STATUS commitStatusForLargeFile(CommitRequestContext ctx,
      long flushed) {
    long co = (ctx.getCommitOffset() > 0) ? ctx.getCommitOffset()
        : pendingWrites.firstEntry().getKey().getMax() - 1;

    if (co <= flushed) {
      return COMMIT_STATUS.COMMIT_DO_SYNC;
    } else if (co < nextOffset.get()) {
      if (LOG.isDebugEnabled()) {
        LOG.debug("get commit while still writing to the requested offset");
      }
      return handleSpecialWait(ctx, co);
    } else {
      // co >= nextOffset
      if (checkSequential(co, nextOffset.get())) {
        return handleSpecialWait(ctx, co);
      } else {
        if (LOG.isDebugEnabled()) {
          LOG.debug("return COMMIT_SPECIAL_SUCCESS");
        }
        return COMMIT_STATUS.COMMIT_SPECIAL_SUCCESS;
      }
    }
  }

  /**
   * Determines the commit status for a non-AIX client with an explicit
   * commit offset.
   */
  private COMMIT_STATUS handleNonAixExplicitCommit(CommitRequestContext ctx,
      long flushed) {
    if (ctx.getCommitOffset() > flushed) {
      if (!ctx.isFromRead()) {
        CommitCtx commitCtx = new CommitCtx(ctx.getCommitOffset(),
            ctx.getChannel(), ctx.getXid(), ctx.getPreOpAttr());
        pendingCommits.put(ctx.getCommitOffset(), commitCtx);
      }
      return COMMIT_STATUS.COMMIT_WAIT;
    }
    return COMMIT_STATUS.COMMIT_DO_SYNC;
  }

  /**
   * Determines the commit status when committing the whole file.
   */
  private COMMIT_STATUS handleWholeFileCommit(CommitRequestContext ctx) {
    if (!ctx.isFromRead()) {
      Entry<OffsetRange, WriteCtx> key = pendingWrites.firstEntry();
      long maxOffset = key.getKey().getMax() - 1;
      Preconditions.checkState(maxOffset > 0);
      CommitCtx commitCtx = new CommitCtx(maxOffset, ctx.getChannel(),
          ctx.getXid(), ctx.getPreOpAttr());
      pendingCommits.put(maxOffset, commitCtx);
    }
    return COMMIT_STATUS.COMMIT_WAIT;
  }

  /**
   * Returns the flushed offset or -1 if it cannot be retrieved.
   */
  private long getFlushedOffsetOrError() {
    try {
      return getFlushedOffset();
    } catch (IOException e) {
      LOG.error("Can't get flushed offset, error:" + e);
      return -1;
    }
  }
  
  private synchronized COMMIT_STATUS checkCommitInternal(
      CommitRequestContext ctx) {
    if (!activeState) {
      if (pendingWrites.isEmpty()) {
        return COMMIT_STATUS.COMMIT_INACTIVE_CTX;
      } else {
        // TODO: return success if already committed
        return COMMIT_STATUS.COMMIT_INACTIVE_WITH_PENDING_WRITE;
      }
    }

    long flushed = getFlushedOffsetOrError();
    if (flushed < 0) {
      return COMMIT_STATUS.COMMIT_ERROR;
    }
    
    if (LOG.isDebugEnabled()) {
      LOG.debug("getFlushedOffset=" + flushed + " commitOffset=" + ctx.getCommitOffset()
          + "nextOffset=" + nextOffset.get());
    }
    
    if (pendingWrites.isEmpty()) {
      return commitStatusForEmptyPendingWrites(ctx, flushed);
    }
    
    Preconditions.checkState(flushed <= nextOffset.get(), "flushed " + flushed
        + " is larger than nextOffset " + nextOffset.get());

    if (uploadLargeFile && !aixCompatMode) {
      return commitStatusForLargeFile(ctx, flushed);
    }
    
    if (ctx.getCommitOffset() > 0) {
      if (aixCompatMode) {
        // The AIX NFS client misinterprets RFC-1813 and will always send 4096
        // for the commitOffset even if fewer bytes than that have ever (or will
        // ever) be sent by the client. So, if in AIX compatibility mode, we
        // will always DO_SYNC if the number of bytes to commit have already all
        // been flushed, else we will fall through to the logic below which
        // checks for pending writes in the case that we're being asked to
        // commit more bytes than have so far been flushed. See HDFS-6549 for
        // more info.
        if (ctx.getCommitOffset() <= flushed) {
          return COMMIT_STATUS.COMMIT_DO_SYNC;
        }
      } else {
        return handleNonAixExplicitCommit(ctx, flushed);
      }
    }

    return handleWholeFileCommit(ctx);
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