class OpenFileCtx {
  // ...

  private synchronized WriteCtx addWritesToCache(WRITE3Request request, Channel channel, int xid) {
    // ...
  }

  private void receivedNewWriteInternal(DFSClient dfsClient, WRITE3Request request, Channel channel, int xid, AsyncDataService asyncDataService, IdMappingServiceProvider iug) {
    // ...
  }

  private synchronized boolean checkAndStartWrite(AsyncDataService asyncDataService, WriteCtx writeCtx) {
    // ...
  }

  private void processOverWrite(DFSClient dfsClient, WRITE3Request request, Channel channel, int xid, IdMappingServiceProvider iug) {
    // ...
  }

  private WRITE3Response processPerfectOverWrite(DFSClient dfsClient, long offset, int count, WriteStableHow stableHow, byte[] data, String path, WccData wccData, IdMappingServiceProvider iug) {
    // ...
  }

  private COMMIT_STATUS checkCommitInternal(long commitOffset, Channel channel, int xid, Nfs3FileAttributes preOpAttr, boolean fromRead) {
    // ...
  }

  private synchronized boolean checkSequential(final long commitOffset, final long nextOffset) {
    // ...
  }

  private COMMIT_STATUS handleSpecialWait(boolean fromRead, long commitOffset, Channel channel, int xid, Nfs3FileAttributes preOpAttr) {
    // ...
  }

  private synchronized WriteCtx offerNextToWrite() {
    // ...
  }

  private void processCommits(long offset) {
    // ...
  }

  private void doSingleWrite(final WriteCtx writeCtx) {
    // ...
  }

  private void cleanup() {
    // ...
  }

  // Extracted methods

  /**
   * Checks if the write request is a repeated request.
   * 
   * @param request the write request
   * @param channel the channel
   * @param xid the xid
   * @return the existing WriteCtx if it's a repeated request, null otherwise
   */
  private WriteCtx checkRepeatedWriteRequest(WRITE3Request request, Channel channel, int xid) {
    OffsetRange range = new OffsetRange(request.getOffset(), request.getOffset() + request.getCount());
    WriteCtx writeCtx = pendingWrites.get(range);
    if (writeCtx == null) {
      return null;
    } else {
      if (xid != writeCtx.getXid()) {
        LOG.warn("Got a repeated request, same range, with a different xid: " + xid + " xid in old request: " + writeCtx.getXid());
      }
      return writeCtx;
    }
  }

  /**
   * Updates the last access time.
   */
  private void updateLastAccessTime() {
    lastAccessTime = Time.monotonicNow();
  }

  /**
   * Checks if the stream has timed out.
   * 
   * @param streamTimeout the stream timeout
   * @return true if the stream has timed out, false otherwise
   */
  private boolean checkStreamTimeout(long streamTimeout) {
    return Time.monotonicNow() - lastAccessTime > streamTimeout;
  }

  /**
   * Gets the flushed offset.
   * 
   * @return the flushed offset
   * @throws IOException if an I/O error occurs
   */
  private long getFlushedOffset() throws IOException {
    return fos.getPos();
  }

  /**
   * Waits for the dump to complete.
   */
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

  /**
   * Processes a commit request.
   * 
   * @param dfsClient the DFS client
   * @param commitOffset the commit offset
   * @param channel the channel
   * @param xid the xid
   * @param preOpAttr the pre-op attribute
   * @param fromRead whether the commit is triggered from a read request
   * @return the commit status
   */
  public COMMIT_STATUS checkCommit(DFSClient dfsClient, long commitOffset, Channel channel, int xid, Nfs3FileAttributes preOpAttr, boolean fromRead) {
    if (!fromRead) {
      Preconditions.checkState(channel != null && preOpAttr != null);
      // Keep stream active
      updateLastAccessTime();
    }
    Preconditions.checkState(commitOffset >= 0);

    COMMIT_STATUS ret = checkCommitInternal(commitOffset, channel, xid, preOpAttr, fromRead);
    if (LOG.isDebugEnabled()) {
      LOG.debug("Got commit status: " + ret.name());
    }
    // Do the sync outside the lock
    if (ret == COMMIT_STATUS.COMMIT_DO_SYNC || ret == COMMIT_STATUS.COMMIT_FINISHED) {
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

  // ...
}