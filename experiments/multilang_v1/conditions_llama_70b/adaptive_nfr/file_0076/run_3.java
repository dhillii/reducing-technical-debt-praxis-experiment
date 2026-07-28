class BlockReceiver implements Closeable {
  // ...

  private BlockReceiverParameters params;

  BlockReceiver(BlockReceiverParameters params) throws IOException {
    this.params = params;
    // ...
  }

  // ...

  static class BlockReceiverParameters {
    private final ExtendedBlock block;
    private final StorageType storageType;
    private final DataInputStream in;
    private final String inAddr;
    private final String myAddr;
    private final BlockConstructionStage stage;
    private final long newGs;
    private final long minBytesRcvd;
    private final long maxBytesRcvd;
    private final String clientname;
    private final DatanodeInfo srcDataNode;
    private final DataNode datanode;
    private final DataChecksum requestedChecksum;
    private final CachingStrategy cachingStrategy;
    private final boolean allowLazyPersist;
    private final boolean pinning;

    public BlockReceiverParameters(ExtendedBlock block, StorageType storageType,
        DataInputStream in, String inAddr, String myAddr, BlockConstructionStage stage,
        long newGs, long minBytesRcvd, long maxBytesRcvd, String clientname,
        DatanodeInfo srcDataNode, DataNode datanode, DataChecksum requestedChecksum,
        CachingStrategy cachingStrategy, boolean allowLazyPersist, boolean pinning) {
      this.block = block;
      this.storageType = storageType;
      this.in = in;
      this.inAddr = inAddr;
      this.myAddr = myAddr;
      this.stage = stage;
      this.newGs = newGs;
      this.minBytesRcvd = minBytesRcvd;
      this.maxBytesRcvd = maxBytesRcvd;
      this.clientname = clientname;
      this.srcDataNode = srcDataNode;
      this.datanode = datanode;
      this.requestedChecksum = requestedChecksum;
      this.cachingStrategy = cachingStrategy;
      this.allowLazyPersist = allowLazyPersist;
      this.pinning = pinning;
    }

    // getters for the fields
    public ExtendedBlock getBlock() {
      return block;
    }

    public StorageType getStorageType() {
      return storageType;
    }

    public DataInputStream getIn() {
      return in;
    }

    public String getInAddr() {
      return inAddr;
    }

    public String getMyAddr() {
      return myAddr;
    }

    public BlockConstructionStage getStage() {
      return stage;
    }

    public long getNewGs() {
      return newGs;
    }

    public long getMinBytesRcvd() {
      return minBytesRcvd;
    }

    public long getMaxBytesRcvd() {
      return maxBytesRcvd;
    }

    public String getClientname() {
      return clientname;
    }

    public DatanodeInfo getSrcDataNode() {
      return srcDataNode;
    }

    public DataNode getDatanode() {
      return datanode;
    }

    public DataChecksum getRequestedChecksum() {
      return requestedChecksum;
    }

    public CachingStrategy getCachingStrategy() {
      return cachingStrategy;
    }

    public boolean isAllowLazyPersist() {
      return allowLazyPersist;
    }

    public boolean isPinning() {
      return pinning;
    }
  }

  // ...
}