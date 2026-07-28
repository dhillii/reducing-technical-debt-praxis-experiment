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
    COMMIT_SPECIAL_WAIT,
    COMMIT_SPECIAL_SUCCESS;
  }

  private final DFSClient client;
  private final IdMappingServiceProvider iug;
  
  private volatile boolean activeState;
  private volatile boolean asyncStatus;
  private volatile long asyncWriteBackStartOffset;

  private AtomicLong nextOffset;
  private final HdfsDataOutputStream fos;
  private final boolean aixCompatMode;
  
  private Nfs3FileAttributes latestAttr;
  
  private final ConcurrentNavigableMap<OffsetRange, WriteCtx> pendingWrites;
  
  private final ConcurrentNavigableMap<Long, CommitCtx> pendingCommits;

  static class CommitCtx {
    private final long offset;
    private final Channel channel;
    private final int xid;
    private final Nfs3FileAttributes preOpAttr;
    public final long startTime;

    long getOffset() { return offset; }
    Channel getChannel() { return channel; }
    int getXid() { return xid; }
    Nfs3FileAttributes getPreOpAttr() { return preOpAttr; }
    long getStartTime() { return startTime; }

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
  
  private long lastAccessTime;
  
  private volatile boolean enabledDump;
  private FileOutputStream dumpOut;
  
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
  
  private long getFlushedOffset() throws IOException {
    return fos.getPos();
  }
  
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
    /** Dump data into a file */
    private void dump() {
      if (!ensureDumpOutputStream()) {
        return;
      }
      if (!ensureRandomAccessFile()) {
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

    /** Ensure dumpOut is created; return false if dump disabled */
    private boolean ensureDumpOutputStream() {
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
      } catch (IOException e) {
        LOG.error("Got failure when creating dump stream " + dumpFilePath, e);
        enabledDump = false;
        closeDumpOutQuietly();
        return false;
      }
      return true;
    }

    /** Ensure raf is opened; return false if dump disabled */
    private boolean ensureRandomAccessFile() {
      if (raf != null) {
        return true;
      }
      try {
        raf = new RandomAccessFile(dumpFilePath, "r");
      } catch (FileNotFoundException e) {
        LOG.error("Can't get random access to file " + dumpFilePath);
        enabledDump = false;
        return false;
      }
      return true;
    }

    /** Dump pending writes and update memory counters */
    private void dumpPendingWrites() {
      Iterator<OffsetRange> it = pendingWrites.keySet().iterator();
      while (activeState && it.hasNext()
          && nonSequentialWriteInMemory.get() > 0) {
        OffsetRange key = it.next();
        WriteCtx writeCtx = pendingWrites.get(key);
        if (writeCtx == null) {
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
          enabledDump = false;
          return;
        }
      }
    }

    /** Close dumpOut quietly when creation fails */
    private void closeDumpOutQuietly() {
      if (dumpOut != null) {
        try {
          dumpOut.close();
        } catch (IOException e1) {
          LOG.error("Can't close dump stream " + dumpFilePath, e1);
        }
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
  
  private WriteCtx checkRepeatedWriteRequest(WRITE3Request request,
      Channel channel, int xid) {
    OffsetRange range = new OffsetRange(request.getOffset(),
        request.getOffset() + request.getCount());
    WriteCtx writeCtx = pendingWrites.get(range);
    if (writeCtx == null) {
      return null;
    }
    if (xid != writeCtx.getXid()) {
      LOG.warn("Got a repeated request, same range, with a different xid: "
          + xid + " xid in old request: " + writeCtx.getXid());
    }
    return writeCtx;  
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
      updateLastAccessTime();
      WriteCtx existantWriteCtx = checkRepeatedWriteRequest(request, channel,
          xid);
      if (existantWriteCtx != null) {
        if (!existantWriteCtx.getReplied()) {
          LOG.debug("Repeated write request which hasn't been served: xid="
              + xid + ", drop it.");
        } else {
          LOG.debug("Repeated write request which is already served: xid="
              + xid + ", resend response.");
          WccData fileWcc = new WccData(latestAttr.getWccAttr(), latestAttr);
          WRITE3Response response = new WRITE3Response(Nfs3Status.NFS3_OK,
              fileWcc, request.getCount(), request.getStableHow(),
              Nfs3Constant.WRITE_COMMIT_VERF);
          Nfs3Utils.writeChannel(channel, response.serialize(
              new XDR(), xid, new VerifierNone()), xid);
        }
      } else {
        receivedNewWriteInternal(dfsClient, request, channel, xid,
            asyncDataService, iug);
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
  
  private synchronized WriteCtx addWritesToCache(WRITE3Request request,
      Channel channel, int xid) {
    long offset = request.getOffset();
    int count = request.getCount();
    long cachedOffset = nextOffset.get();
    int originalCount = WriteCtx.INVALID_ORIGINAL_COUNT;
    
    if (LOG.isDebugEnabled()) {
      LOG.debug("requested offset=" + offset + " and current offset="
          + cachedOffset);
    }

    if ((offset < cachedOffset) && (offset + count > cachedOffset)) {
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
      originalCount = count;
      offset = request.getOffset();
      count = request.getCount();
    }
    
    if (offset < cachedOffset) {
      LOG.warn("(offset,count,nextOffset): " + "(" + offset + "," + count + ","
          + nextOffset + ")");
      return null;
    } else {
      DataState dataState = offset == cachedOffset ? WriteCtx.DataState.NO_DUMP
          : WriteCtx.DataState.ALLOW_DUMP;
      WriteCtx writeCtx = new WriteCtx(request.getHandle(),
          request.getOffset(), request.getCount(), originalCount,
          request.getStableHow(), request.getData(), channel, xid, false,
          dataState);
      if (LOG.isDebugEnabled()) {
        LOG.debug("Add new write to the list with nextOffset " + cachedOffset
            + " and requested offset=" + offset);
      }
      if (writeCtx.getDataState() == WriteCtx.DataState.ALLOW_DUMP) {
        updateNonSequentialWriteInMemory(count);
      }
      WriteCtx oldWriteCtx = checkRepeatedWriteRequest(request, channel, xid);
      if (oldWriteCtx == null) {
        pendingWrites.put(new OffsetRange(offset, offset + count), writeCtx);
        LOG.debug("New write buffered with xid " + xid + " nextOffset "
            + cachedOffset + " req offset=" + offset + " mapsize="
            + pendingWrites.size());
      } else {
        LOG.warn("Got a repeated request, same range, with xid: " + xid
            + " nextOffset " + +cachedOffset + " req offset=" + offset);
      }
      return writeCtx;
    }
  }
  
  private void processOverWrite(DFSClient dfsClient, WRITE3Request request,
      Channel channel, int xid, IdMappingServiceProvider iug) {
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
      LOG.debug("Process perfectOverWrite");
      response = processPerfectOverWrite(dfsClient, offset, count, stableHow,
          request.getData().array(),
          Nfs3Utils.getFileIdPath(request.getHandle()), wccData, iug);
    }
    updateLastAccessTime();
    Nfs3Utils.writeChannel(channel,
        response.serialize(new XDR(), xid, new VerifierNone()),
        xid);
  }
  
  private synchronized boolean checkAndStartWrite(
      AsyncDataService asyncDataService, WriteCtx writeCtx) {
    
    if (writeCtx.getOffset() == nextOffset.get()) {
      if (!asyncStatus) {
        LOG.debug("Trigger the write back task. Current nextOffset: "
            + nextOffset.get());
        asyncStatus = true;
        asyncWriteBackStartOffset = writeCtx.getOffset();
        asyncDataService.execute(new AsyncDataService.WriteBackTask(this));
      } else {
        LOG.debug("The write back thread is working.");
      }
      return true;
    } else {
      return false;
    }
  }

  private void receivedNewWriteInternal(DFSClient dfsClient,
      WRITE3Request request, Channel channel, int xid,
      AsyncDataService asyncDataService, IdMappingServiceProvider iug) {
    WriteStableHow stableHow = request.getStableHow();
    WccAttr preOpAttr = latestAttr.getWccAttr();
    int count = request.getCount();

    WriteCtx writeCtx = addWritesToCache(request, channel, xid);
    if (writeCtx == null) {
      processOverWrite(dfsClient, request, channel, xid, iug);
    } else {
      boolean startWriting = checkAndStartWrite(asyncDataService, writeCtx);
      if (!startWriting) {
        waitForDump();
        if (stableHow != WriteStableHow.UNSTABLE) {
          LOG.info("Have to change stable write to unstable write: "
              + request.getStableHow());
          stableHow = WriteStableHow.UNSTABLE;
        }

        LOG.debug("UNSTABLE write request, send response for offset: "
            + writeCtx.getOffset());
        WccData fileWcc = new WccData(preOpAttr, latestAttr);
        WRITE3Response response = new WRITE3Response(Nfs3Status.NFS3_OK,
            fileWcc, count, stableHow, Nfs3Constant.WRITE_COMMIT_VERF);
        RpcProgramNfs3.metrics.addWrite(Nfs3Utils
            .getElapsedTime(writeCtx.startTime));
        Nfs3Utils
            .writeChannel(channel, response.serialize(new XDR(),
                xid, new VerifierNone()), xid);
        writeCtx.setReplied(true);
      }
    }
  }
  
  private WRITE3Response processPerfectOverWrite(DFSClient dfsClient,
      long offset, int count, WriteStableHow stableHow, byte[] data,
      String path, WccData wccData, IdMappingServiceProvider iug) {
    WRITE3Response response;

    byte[] readbuffer = new byte[count];
    int readCount = 0;
    FSDataInputStream fis = null;
    try {
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
  
  public COMMIT_STATUS checkCommit(DFSClient dfsClient, long commitOffset,
      Channel channel, int xid, Nfs3FileAttributes preOpAttr, boolean fromRead) {
    if (!fromRead) {
      Preconditions.checkState(channel != null && preOpAttr != null);
      updateLastAccessTime();
    }
    Preconditions.checkState(commitOffset >= 0);

    COMMIT_STATUS ret = checkCommitInternal(commitOffset, channel, xid,
        preOpAttr, fromRead);
    if (LOG.isDebugEnabled()) {
      LOG.debug("Got commit status: " + ret.name());
    }
    if (ret == COMMIT_STATUS.COMMIT_DO_SYNC
        || ret == COMMIT_STATUS.COMMIT_FINISHED) {
      try {
        fos.hsync(EnumSet.of(SyncFlag.UPDATE_LENGTH));
        ret = COMMIT_STATUS.COMMIT_FINISHED;
      } catch (ClosedChannelException cce) {
        if (pendingWrites.isEmpty()) {
          ret = COMMIT_STATUS.COMMIT_FINISHED;
        } else {
          ret = COMMIT_STATUS.COMMIT_ERROR;
        }
      } catch (IOException e) {
        LOG.error("Got stream error during data sync: " + e);
        ret = COMMIT_STATUS.COMMIT_ERROR;
      }
    }
    return ret;
  }
  
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
        return false;
      }
      offset = range.getMax();
      if (offset > commitOffset) {
        return true;
      }
    }
    return false;
  }

  private COMMIT_STATUS handleSpecialWait(boolean fromRead, long commitOffset,
      Channel channel, int xid, Nfs3FileAttributes preOpAttr) {
    if (!fromRead) {
      CommitCtx commitCtx = new CommitCtx(commitOffset, channel, xid, preOpAttr);
      pendingCommits.put(commitOffset, commitCtx);
    }
    LOG.debug("return COMMIT_SPECIAL_WAIT");
    return COMMIT_STATUS.COMMIT_SPECIAL_WAIT;
  }
  
  @VisibleForTesting
  synchronized COMMIT_STATUS checkCommitInternal(long commitOffset,
      Channel channel, int xid, Nfs3FileAttributes preOpAttr, boolean fromRead) {
    if (!activeState) {
      if (pendingWrites.isEmpty()) {
        return COMMIT_STATUS.COMMIT_INACTIVE_CTX;
      } else {
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
    
    LOG.debug("getFlushedOffset=" + flushed + " commitOffset=" + commitOffset
        + "nextOffset=" + nextOffset.get());
    
    if (pendingWrites.isEmpty()) {
      if (aixCompatMode) {
        return COMMIT_STATUS.COMMIT_FINISHED;
      } else {
        if (flushed < nextOffset.get()) {
          LOG.debug("get commit while still writing to the requested offset,"
              + " with empty queue");
          return handleSpecialWait(fromRead, nextOffset.get(), channel, xid,
              preOpAttr);
        } else {
          return COMMIT_STATUS.COMMIT_FINISHED;
        }
      }
    }
    
    Preconditions.checkState(flushed <= nextOffset.get(), "flushed " + flushed
        + " is larger than nextOffset " + nextOffset.get());
    if (uploadLargeFile && !aixCompatMode) {
      long co = (commitOffset > 0) ? commitOffset : pendingWrites.firstEntry()
          .getKey().getMax() - 1;

      if (co <= flushed) {
        return COMMIT_STATUS.COMMIT_DO_SYNC;
      } else if (co < nextOffset.get()) {
        LOG.debug("get commit while still writing to the requested offset");
        return handleSpecialWait(fromRead, co, channel, xid, preOpAttr);
      } else {
        if (checkSequential(co, nextOffset.get())) {
          return handleSpecialWait(fromRead, co, channel, xid, preOpAttr);
        } else {
          LOG.debug("return COMMIT_SPECIAL_SUCCESS");
          return COMMIT_STATUS.COMMIT_SPECIAL_SUCCESS;
        }
      }
    }
    
    if (commitOffset > 0) {
      if (aixCompatMode) {
        if (commitOffset <= flushed) {
          return COMMIT_STATUS.COMMIT_DO_SYNC;
        }
      } else {
        if (commitOffset > flushed) {
          if (!fromRead) {
            CommitCtx commitCtx = new CommitCtx(commitOffset, channel, xid,
                preOpAttr);
            pendingCommits.put(commitOffset, commitCtx);
          }
          return COMMIT_STATUS.COMMIT_WAIT;
        } else {
          return COMMIT_STATUS.COMMIT_DO_SYNC;
        } 
      }
    }

    Entry<OffsetRange, WriteCtx> key = pendingWrites.firstEntry();
    if (!fromRead) {
      long maxOffset = key.getKey().getMax() - 1;
      Preconditions.checkState(maxOffset > 0);
      CommitCtx commitCtx = new CommitCtx(maxOffset, channel, xid, preOpAttr);
      pendingCommits.put(maxOffset, commitCtx);
    }
    return COMMIT_STATUS.COMMIT_WAIT;
  }
  
  public synchronized boolean streamCleanup(long fileId, long streamTimeout) {
    Preconditions
        .checkState(streamTimeout >= NfsConfigKeys.DFS_NFS_STREAM_TIMEOUT_MIN_DEFAULT);
    if (!activeState) {
      return true;
    }
    
    boolean flag = false;
    if (checkStreamTimeout(streamTimeout)) {
      LOG.debug("stream can be closed for fileId: " + fileId);
      flag = true;
    }
    return flag;
  }
  
  private synchronized WriteCtx offerNextToWrite() {
    if (pendingWrites.isEmpty()) {
      LOG.debug("The async write task has no pending writes, fileId: "
          + latestAttr.getFileId());
      processCommits(nextOffset.get());
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
      LOG.debug("The next sequential write has not arrived yet");
      processCommits(nextOffset.get());
      this.asyncStatus = false;
    } else if (range.getMin() < offset && range.getMax() > offset) {
      LOG.warn("Got an overlapping write (" + range.getMin() + ", "
          + range.getMax() + "), nextOffset=" + offset
          + ". Silently drop it now");
      pendingWrites.remove(range);
      processCommits(nextOffset.get());
    } else {
      LOG.debug("Remove write(" + range.getMin() + "-" + range.getMax()
          + ") from the list");
      pendingWrites.remove(range);
      nextOffset.addAndGet(toWrite.getCount());
      LOG.debug("Change nextOffset to " + nextOffset.get());
      return toWrite;
    }
    
    return null;
  }
  
  void executeWriteBack() {
    Preconditions.checkState(asyncStatus,
        "openFileCtx has false asyncStatus, fileId: " + latestAttr.getFileId());
    final long startOffset = asyncWriteBackStartOffset;  
    try {
      while (activeState) {
        WriteCtx toWrite = offerNextToWrite();
        if (toWrite != null) {
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
      status = Nfs3Status.NFS3ERR_IO;
    }

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
      
      LOG.debug("FileId: " + latestAttr.getFileId() + " Service time: "
          + Nfs3Utils.getElapsedTime(commit.startTime)
          + "ns. Sent response for commit: " + commit);
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
    LOG.debug("do write, fileId: " + handle.getFileId() + " offset: "
        + offset + " length: " + count + " stableHow: " + stableHow.name());

    try {
      writeCtx.writeData(fos);
      RpcProgramNfs3.metrics.incrBytesWritten(writeCtx.getCount());
      
      long flushedOffset = getFlushedOffset();
      if (flushedOffset != (offset + count)) {
        throw new IOException("output stream is out of sync, pos="
            + flushedOffset + " and nextOffset should be"
            + (offset + count));
      }
      
      if (writeCtx.getDataState() == WriteCtx.DataState.ALLOW_DUMP) {
        synchronized (writeCtx) {
          if (writeCtx.getDataState() == WriteCtx.DataState.ALLOW_DUMP) {
            writeCtx.setDataState(WriteCtx.DataState.NO_DUMP);
            updateNonSequentialWriteInMemory(-count);
            LOG.debug("After writing " + handle.getFileId() + " at offset "
                + offset + ", updated the memory count, new value: "
                + nonSequentialWriteInMemory.get());
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
      
      processCommits(writeCtx.getOffset() + writeCtx.getCount());
     
    } catch (IOException e) {
      LOG.error("Error writing to fileId " + handle.getFileId() + " at offset "
          + offset + " and length " + count, e);
      if (!writeCtx.getReplied()) {
        WRITE3Response response = new WRITE3Response(Nfs3Status.NFS3ERR_IO);
        Nfs3Utils.writeChannel(channel, response.serialize(
            new XDR(), xid, new VerifierNone()), xid);
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

    if (dumpThread != null && dumpThread.isAlive()) {
      dumpThread.interrupt();
      try {
        dumpThread.join(3000);
      } catch (InterruptedException ignored) {
      }
    }
    
    try {
      if (fos != null) {
        fos.close();
      }
    } catch (IOException e) {
      LOG.info("Can't close stream for fileId: " + latestAttr.getFileId()
          + ", error: " + e);
    }
    
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