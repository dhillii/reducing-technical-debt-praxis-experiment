class OpenFileCtx {
  // ...

  private static class WriteRequest {
    private final WRITE3Request request;
    private final Channel channel;
    private final int xid;
    private final AsyncDataService asyncDataService;
    private final IdMappingServiceProvider iug;

    public WriteRequest(WRITE3Request request, Channel channel, int xid, AsyncDataService asyncDataService, IdMappingServiceProvider iug) {
      this.request = request;
      this.channel = channel;
      this.xid = xid;
      this.asyncDataService = asyncDataService;
      this.iug = iug;
    }

    public WRITE3Request getRequest() {
      return request;
    }

    public Channel getChannel() {
      return channel;
    }

    public int getXid() {
      return xid;
    }

    public AsyncDataService getAsyncDataService() {
      return asyncDataService;
    }

    public IdMappingServiceProvider getIug() {
      return iug;
    }
  }

  public void receivedNewWrite(DFSClient dfsClient, WriteRequest writeRequest) {
    if (!activeState) {
      LOG.info("OpenFileCtx is inactive, fileId: " + writeRequest.getRequest().getHandle().getFileId());
      WccData fileWcc = new WccData(latestAttr.getWccAttr(), latestAttr);
      WRITE3Response response = new WRITE3Response(Nfs3Status.NFS3ERR_IO, fileWcc, 0, writeRequest.getRequest().getStableHow(), Nfs3Constant.WRITE_COMMIT_VERF);
      Nfs3Utils.writeChannel(writeRequest.getChannel(), response.serialize(new XDR(), writeRequest.getXid(), new VerifierNone()), writeRequest.getXid());
    } else {
      // Update the write time first
      updateLastAccessTime();

      // Handle repeated write requests (same xid or not).
      // If already replied, send reply again. If not replied, drop the repeated request.
      WriteCtx existantWriteCtx = checkRepeatedWriteRequest(writeRequest.getRequest(), writeRequest.getChannel(), writeRequest.getXid());
      if (existantWriteCtx != null) {
        if (!existantWriteCtx.getReplied()) {
          if (LOG.isDebugEnabled()) {
            LOG.debug("Repeated write request which hasn't been served: xid=" + writeRequest.getXid() + ", drop it.");
          }
        } else {
          if (LOG.isDebugEnabled()) {
            LOG.debug("Repeated write request which is already served: xid=" + writeRequest.getXid() + ", resend response.");
          }
          WccData fileWcc = new WccData(latestAttr.getWccAttr(), latestAttr);
          WRITE3Response response = new WRITE3Response(Nfs3Status.NFS3_OK, fileWcc, writeRequest.getRequest().getCount(), writeRequest.getRequest().getStableHow(), Nfs3Constant.WRITE_COMMIT_VERF);
          Nfs3Utils.writeChannel(writeRequest.getChannel(), response.serialize(new XDR(), writeRequest.getXid(), new VerifierNone()), writeRequest.getXid());
        }
      } else {
        // not a repeated write request
        receivedNewWriteInternal(dfsClient, writeRequest);
      }
    }
  }

  private void receivedNewWriteInternal(DFSClient dfsClient, WriteRequest writeRequest) {
    WriteStableHow stableHow = writeRequest.getRequest().getStableHow();
    WccAttr preOpAttr = latestAttr.getWccAttr();
    int count = writeRequest.getRequest().getCount();

    WriteCtx writeCtx = addWritesToCache(writeRequest.getRequest(), writeRequest.getChannel(), writeRequest.getXid());
    if (writeCtx == null) {
      // offset < nextOffset
      processOverWrite(dfsClient, writeRequest.getRequest(), writeRequest.getChannel(), writeRequest.getXid(), writeRequest.getIug());
    } else {
      // The write is added to pendingWrites.
      // Check and start writing back if necessary
      boolean startWriting = checkAndStartWrite(writeRequest.getAsyncDataService(), writeCtx);
      if (!startWriting) {
        // offset > nextOffset. check if we need to dump data
        waitForDump();

        // In test, noticed some Linux client sends a batch (e.g., 1MB)
        // of reordered writes and won't send more writes until it gets
        // responses of the previous batch. So here send response immediately
        // for unstable non-sequential write
        if (stableHow != WriteStableHow.UNSTABLE) {
          LOG.info("Have to change stable write to unstable write: " + writeRequest.getRequest().getStableHow());
          stableHow = WriteStableHow.UNSTABLE;
        }

        if (LOG.isDebugEnabled()) {
          LOG.debug("UNSTABLE write request, send response for offset: " + writeCtx.getOffset());
        }
        WccData fileWcc = new WccData(preOpAttr, latestAttr);
        WRITE3Response response = new WRITE3Response(Nfs3Status.NFS3_OK, fileWcc, count, stableHow, Nfs3Constant.WRITE_COMMIT_VERF);
        RpcProgramNfs3.metrics.addWrite(Nfs3Utils.getElapsedTime(writeCtx.startTime));
        Nfs3Utils.writeChannel(writeRequest.getChannel(), response.serialize(new XDR(), writeRequest.getXid(), new VerifierNone()), writeRequest.getXid());
        writeCtx.setReplied(true);
      }
    }
  }

  // ...
}