private boolean pinning;

BlockReceiver(final ExtendedBlock block, final StorageType storageType,
    final DataInputStream in,
    final String inAddr, final String myAddr,
    final BlockConstructionStage stage, 
    final long newGs, final long minBytesRcvd, final long maxBytesRcvd, 
    final String clientname, final DatanodeInfo srcDataNode,
    final DataNode datanode, DataChecksum requestedChecksum,
    CachingStrategy cachingStrategy,
    final boolean allowLazyPersist,
    final boolean pinning) throws IOException {
  try {
    this.block = block;
    this.in = in;
    this.inAddr = inAddr;
    this.myAddr = myAddr;
    this.srcDataNode = srcDataNode;
    this.datanode = datanode;

    this.clientname = clientname;
    this.isDatanode = clientname.length() == 0;
    this.isClient = !this.isDatanode;
    this.restartBudget = datanode.getDnConf().restartReplicaExpiry;
    this.datanodeSlowLogThresholdMs = datanode.getDnConf().datanodeSlowIoWarningThresholdMs;
    this.responseInterval = (long) (datanode.getDnConf().socketTimeout * 0.5);
    this.stage = stage;
    this.isTransfer = stage == BlockConstructionStage.TRANSFER_RBW
        || stage == BlockConstructionStage.TRANSFER_FINALIZED;

    this.pinning = pinning;
    if (LOG.isDebugEnabled()) {
      LOG.debug(getClass().getSimpleName() + ": " + block
          + "\n  isClient  =" + isClient + ", clientname=" + clientname
          + "\n  isDatanode=" + isDatanode + ", srcDataNode=" + srcDataNode
          + "\n  inAddr=" + inAddr + ", myAddr=" + myAddr
          + "\n  cachingStrategy = " + cachingStrategy
          + "\n  pinning=" + pinning
      );
    }

    initializeReplicaHandler(storageType, block, allowLazyPersist, newGs, minBytesRcvd, maxBytesRcvd);
    initializeChecksumAndStreams(requestedChecksum, cachingStrategy);
  } catch (ReplicaAlreadyExistsException bae) {
    throw bae;
  } catch (ReplicaNotFoundException bne) {
    throw bne;
  } catch (IOException ioe) {
    IOUtils.closeStream(this);
    cleanupBlock();

    IOException cause = DatanodeUtil.getCauseIfDiskError(ioe);
    DataNode.LOG.warn("IOException in BlockReceiver constructor. Cause is ", cause);

    if (cause != null) {
      ioe = cause;
      datanode.checkDiskErrorAsync();
    }

    throw ioe;
  }
}

private void initializeReplicaHandler(StorageType storageType, ExtendedBlock block, boolean allowLazyPersist, long newGs, long minBytesRcvd, long maxBytesRcvd) throws IOException {
  if (isDatanode) {
    replicaHandler = datanode.data.createTemporary(storageType, block);
  } else {
    switch (stage) {
      case PIPELINE_SETUP_CREATE:
        replicaHandler = datanode.data.createRbw(storageType, block, allowLazyPersist);
        datanode.notifyNamenodeReceivingBlock(block, replicaHandler.getReplica().getStorageUuid());
        break;
      case PIPELINE_SETUP_STREAMING_RECOVERY:
        replicaHandler = datanode.data.recoverRbw(block, newGs, minBytesRcvd, maxBytesRcvd);
        block.setGenerationStamp(newGs);
        break;
      case PIPELINE_SETUP_APPEND:
        replicaHandler = datanode.data.append(block, newGs, minBytesRcvd);
        block.setGenerationStamp(newGs);
        datanode.notifyNamenodeReceivingBlock(block, replicaHandler.getReplica().getStorageUuid());
        break;
      case PIPELINE_SETUP_APPEND_RECOVERY:
        replicaHandler = datanode.data.recoverAppend(block, newGs, minBytesRcvd);
        block.setGenerationStamp(newGs);
        datanode.notifyNamenodeReceivingBlock(block, replicaHandler.getReplica().getStorageUuid());
        break;
      case TRANSFER_RBW:
      case TRANSFER_FINALIZED:
        replicaHandler = datanode.data.createTemporary(storageType, block);
        break;
      default:
        throw new IOException("Unsupported stage " + stage + " while receiving block " + block + " from " + inAddr);
    }
  }
  replicaInfo = replicaHandler.getReplica();
  this.dropCacheBehindWrites = (cachingStrategy.getDropBehind() == null) ?
    datanode.getDnConf().dropCacheBehindWrites :
    cachingStrategy.getDropBehind();
  this.syncBehindWrites = datanode.getDnConf().syncBehindWrites;
  this.syncBehindWritesInBackground = datanode.getDnConf().syncBehindWritesInBackground;
}

private void initializeChecksumAndStreams(DataChecksum requestedChecksum, CachingStrategy cachingStrategy) throws IOException {
  streams = replicaInfo.createStreams(isDatanode || isTransfer || stage == BlockConstructionStage.PIPELINE_SETUP_CREATE, requestedChecksum);
  assert streams != null : "null streams!";

  clientChecksum = requestedChecksum;
  diskChecksum = streams.getChecksum();
  needsChecksumTranslation = !clientChecksum.equals(diskChecksum);
  bytesPerChecksum = diskChecksum.getBytesPerChecksum();
  checksumSize = diskChecksum.getChecksumSize();

  out = streams.getDataOut();
  if (out instanceof FileOutputStream) {
    outFd = ((FileOutputStream) out).getFD();
  } else {
    LOG.warn("Could not get file descriptor for outputstream of class " + out.getClass());
  }
  checksumOut = new DataOutputStream(new BufferedOutputStream(streams.getChecksumOut(), HdfsConstants.SMALL_BUFFER_SIZE));
  if (isDatanode || isTransfer || stage == BlockConstructionStage.PIPELINE_SETUP_CREATE) {
    BlockMetadataHeader.writeHeader(checksumOut, diskChecksum);
  }
}