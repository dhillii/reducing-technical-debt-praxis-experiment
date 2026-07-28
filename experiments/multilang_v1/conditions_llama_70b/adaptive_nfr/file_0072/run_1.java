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
    // ...
  }

  private void receivedNewWriteInternal(DFSClient dfsClient, WriteRequest writeRequest) {
    // ...
  }

  // ...
}

class Dumper implements Runnable {
  // ...

  private void dump() {
    // ...
  }

  @Override
  public void run() {
    // ...
  }
}

class CommitRequest {
  private final long commitOffset;
  private final Channel channel;
  private final int xid;
  private final Nfs3FileAttributes preOpAttr;
  private final boolean fromRead;

  public CommitRequest(long commitOffset, Channel channel, int xid, Nfs3FileAttributes preOpAttr, boolean fromRead) {
    this.commitOffset = commitOffset;
    this.channel = channel;
    this.xid = xid;
    this.preOpAttr = preOpAttr;
    this.fromRead = fromRead;
  }

  public long getCommitOffset() {
    return commitOffset;
  }

  public Channel getChannel() {
    return channel;
  }

  public int getXid() {
    return xid;
  }

  public Nfs3FileAttributes getPreOpAttr() {
    return preOpAttr;
  }

  public boolean isFromRead() {
    return fromRead;
  }
}

public COMMIT_STATUS checkCommit(DFSClient dfsClient, CommitRequest commitRequest) {
  // ...
}