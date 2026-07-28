class OpenFileCtx {
  // ...

  private synchronized WriteCtx addWritesToCache(WRITE3Request request, Channel channel, int xid) {
    // Handle a special case first
    if ((request.getOffset() < nextOffset.get()) && (request.getOffset() + request.getCount() > nextOffset.get())) {
      return handleOverlappingWrite(request, channel, xid);
    }

    // Fail non-append call
    if (request.getOffset() < nextOffset.get()) {
      return null;
    }

    DataState dataState = request.getOffset() == nextOffset.get() ? WriteCtx.DataState.NO_DUMP : WriteCtx.DataState.ALLOW_DUMP;
    WriteCtx writeCtx = new WriteCtx(request.getHandle(), request.getOffset(), request.getCount(), request.getOriginalCount(), request.getStableHow(), request.getData(), channel, xid, false, dataState);

    // check if there is a WriteCtx with the same range in pendingWrites
    WriteCtx oldWriteCtx = checkRepeatedWriteRequest(request, channel, xid);
    if (oldWriteCtx == null) {
      pendingWrites.put(new OffsetRange(request.getOffset(), request.getOffset() + request.getCount()), writeCtx);
    } else {
      LOG.warn("Got a repeated request, same range, with xid: " + xid + " nextOffset " + nextOffset.get() + " req offset=" + request.getOffset());
    }
    return writeCtx;
  }

  private WriteCtx handleOverlappingWrite(WRITE3Request request, Channel channel, int xid) {
    LOG.warn(String.format("Got overwrite with appended data (%d-%d)," + " current offset %d," + " drop the overlapped section (%d-%d)" + " and append new data (%d-%d).", request.getOffset(), (request.getOffset() + request.getCount() - 1), nextOffset.get(), request.getOffset(), (nextOffset.get() - 1), nextOffset.get(), (request.getOffset() + request.getCount() - 1)));

    if (!pendingWrites.isEmpty()) {
      LOG.warn("There are other pending writes, fail this jumbo write");
      return null;
    }

    LOG.warn("Modify this write to write only the appended data");
    alterWriteRequest(request, nextOffset.get());

    // Update local variable
    int originalCount = request.getCount();
    long offset = request.getOffset();
    int count = request.getCount();

    DataState dataState = WriteCtx.DataState.ALLOW_DUMP;
    WriteCtx writeCtx = new WriteCtx(request.getHandle(), offset, count, originalCount, request.getStableHow(), request.getData(), channel, xid, false, dataState);

    pendingWrites.put(new OffsetRange(offset, offset + count), writeCtx);
    return writeCtx;
  }

  // ...

  private void receivedNewWriteInternal(DFSClient dfsClient, WRITE3Request request, Channel channel, int xid, AsyncDataService asyncDataService, IdMappingServiceProvider iug) {
    WriteStableHow stableHow = request.getStableHow();
    WccAttr preOpAttr = latestAttr.getWccAttr();
    int count = request.getCount();

    WriteCtx writeCtx = addWritesToCache(request, channel, xid);
    if (writeCtx == null) {
      processOverWrite(dfsClient, request, channel, xid, iug);
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
          LOG.info("Have to change stable write to unstable write: " + request.getStableHow());
          stableHow = WriteStableHow.UNSTABLE;
        }

        if (LOG.isDebugEnabled()) {
          LOG.debug("UNSTABLE write request, send response for offset: " + writeCtx.getOffset());
        }
        WccData fileWcc = new WccData(preOpAttr, latestAttr);
        WRITE3Response response = new WRITE3Response(Nfs3Status.NFS3_OK, fileWcc, count, stableHow, Nfs3Constant.WRITE_COMMIT_VERF);
        RpcProgramNfs3.metrics.addWrite(Nfs3Utils.getElapsedTime(writeCtx.startTime));
        Nfs3Utils.writeChannel(channel, response.serialize(new XDR(), xid, new VerifierNone()), xid);
        writeCtx.setReplied(true);
      }
    }
  }

  // ...

  private COMMIT_STATUS checkCommitInternal(long commitOffset, Channel channel, int xid, Nfs3FileAttributes preOpAttr, boolean fromRead) {
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

    if (pendingWrites.isEmpty()) {
      if (aixCompatMode) {
        return COMMIT_STATUS.COMMIT_FINISHED;
      } else {
        if (flushed < nextOffset.get()) {
          return handleSpecialWait(fromRead, nextOffset.get(), channel, xid, preOpAttr);
        } else {
          return COMMIT_STATUS.COMMIT_FINISHED;
        }
      }
    }

    // Handle large file upload
    if (uploadLargeFile && !aixCompatMode) {
      long co = (commitOffset > 0) ? commitOffset : pendingWrites.firstEntry().getKey().getMax() - 1;

      if (co <= flushed) {
        return COMMIT_STATUS.COMMIT_DO_SYNC;
      } else if (co < nextOffset.get()) {
        return handleSpecialWait(fromRead, co, channel, xid, preOpAttr);
      } else {
        if (checkSequential(co, nextOffset.get())) {
          return handleSpecialWait(fromRead, co, channel, xid, preOpAttr);
        } else {
          return COMMIT_STATUS.COMMIT_SPECIAL_SUCCESS;
        }
      }
    }

    // ...
  }

  private COMMIT_STATUS handleSpecialWait(boolean fromRead, long commitOffset, Channel channel, int xid, Nfs3FileAttributes preOpAttr) {
    if (!fromRead) {
      CommitCtx commitCtx = new CommitCtx(commitOffset, channel, xid, preOpAttr);
      pendingCommits.put(commitOffset, commitCtx);
    }
    return COMMIT_STATUS.COMMIT_SPECIAL_WAIT;
  }

  // ...
}