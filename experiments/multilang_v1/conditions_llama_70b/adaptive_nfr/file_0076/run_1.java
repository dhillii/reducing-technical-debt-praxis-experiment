class BlockReceiver implements Closeable {
  // ...

  private static class BlockReceiverConfig {
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

    public BlockReceiverConfig(ExtendedBlock block, StorageType storageType,
        DataInputStream in, String inAddr, String myAddr,
        BlockConstructionStage stage, long newGs, long minBytesRcvd,
        long maxBytesRcvd, String clientname, DatanodeInfo srcDataNode,
        DataNode datanode, DataChecksum requestedChecksum,
        CachingStrategy cachingStrategy, boolean allowLazyPersist,
        boolean pinning) {
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

  BlockReceiver(BlockReceiverConfig config) throws IOException {
    try {
      this.block = config.getBlock();
      this.in = config.getIn();
      this.inAddr = config.getInAddr();
      this.myAddr = config.getMyAddr();
      this.srcDataNode = config.getSrcDataNode();
      this.datanode = config.getDatanode();

      this.clientname = config.getClientname();
      this.isDatanode = config.getClientname().length() == 0;
      this.isClient = !this.isDatanode;
      this.restartBudget = datanode.getDnConf().restartReplicaExpiry;
      this.datanodeSlowLogThresholdMs = datanode.getDnConf().datanodeSlowIoWarningThresholdMs;
      // For replaceBlock() calls response should be sent to avoid socketTimeout
      // at clients. So sending with the interval of 0.5 * socketTimeout
      this.responseInterval = (long) (datanode.getDnConf().socketTimeout * 0.5);
      // for datanode, we have
      // 1: clientName.length() == 0, and
      // 2: stage == null or PIPELINE_SETUP_CREATE
      this.stage = config.getStage();
      this.isTransfer = stage == BlockConstructionStage.TRANSFER_RBW
          || stage == BlockConstructionStage.TRANSFER_FINALIZED;

      this.pinning = config.isPinning();
      if (LOG.isDebugEnabled()) {
        LOG.debug(getClass().getSimpleName() + ": " + block
            + "\n  isClient  =" + isClient + ", clientname=" + clientname
            + "\n  isDatanode=" + isDatanode + ", srcDataNode=" + srcDataNode
            + "\n  inAddr=" + inAddr + ", myAddr=" + myAddr
            + "\n  cachingStrategy = " + config.getCachingStrategy()
            + "\n  pinning=" + pinning
        );
      }

      // ...
    } catch (ReplicaAlreadyExistsException bae) {
      throw bae;
    } catch (ReplicaNotFoundException bne) {
      throw bne;
    } catch (IOException ioe) {
      IOUtils.closeStream(this);
      cleanupBlock();

      // check if there is a disk error
      IOException cause = DatanodeUtil.getCauseIfDiskError(ioe);
      DataNode.LOG.warn("IOException in BlockReceiver constructor. Cause is ",
          cause);

      if (cause != null) { // possible disk error
        ioe = cause;
        datanode.checkDiskErrorAsync();
      }

      throw ioe;
    }
  }

  // ...
}