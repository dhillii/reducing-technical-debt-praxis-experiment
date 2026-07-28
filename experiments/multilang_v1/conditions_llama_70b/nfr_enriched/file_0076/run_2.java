class BlockReceiver implements Closeable {
  // ...

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
    this.pinning = pinning;
    // ...
  }

  // ...

  private void initializeReplicaHandler() throws IOException {
    if (isDatanode) { 
      replicaHandler = datanode.data.createTemporary(storageType, block);
    } else {
      switch (stage) {
        case PIPELINE_SETUP_CREATE:
          replicaHandler = datanode.data.createRbw(storageType, block, allowLazyPersist);
          datanode.notifyNamenodeReceivingBlock(
              block, replicaHandler.getReplica().getStorageUuid());
          break;
        case PIPELINE_SETUP_STREAMING_RECOVERY:
          replicaHandler = datanode.data.recoverRbw(
              block, newGs, minBytesRcvd, maxBytesRcvd);
          block.setGenerationStamp(newGs);
          break;
        case PIPELINE_SETUP_APPEND:
          replicaHandler = datanode.data.append(block, newGs, minBytesRcvd);
          block.setGenerationStamp(newGs);
          datanode.notifyNamenodeReceivingBlock(
              block, replicaHandler.getReplica().getStorageUuid());
          break;
        case PIPELINE_SETUP_APPEND_RECOVERY:
          replicaHandler = datanode.data.recoverAppend(block, newGs, minBytesRcvd);
          block.setGenerationStamp(newGs);
          datanode.notifyNamenodeReceivingBlock(
              block, replicaHandler.getReplica().getStorageUuid());
          break;
        case TRANSFER_RBW:
        case TRANSFER_FINALIZED:
          replicaHandler =
              datanode.data.createTemporary(storageType, block);
          break;
        default: throw new IOException("Unsupported stage " + stage + 
              " while receiving block " + block + " from " + inAddr);
      }
    }
  }

  private void initializeStreams() throws IOException {
    replicaInfo = replicaHandler.getReplica();
    this.dropCacheBehindWrites = (cachingStrategy.getDropBehind() == null) ?
      datanode.getDnConf().dropCacheBehindWrites :
        cachingStrategy.getDropBehind();
    this.syncBehindWrites = datanode.getDnConf().syncBehindWrites;
    this.syncBehindWritesInBackground = datanode.getDnConf().
        syncBehindWritesInBackground;
    
    final boolean isCreate = isDatanode || isTransfer 
        || stage == BlockConstructionStage.PIPELINE_SETUP_CREATE;
    streams = replicaInfo.createStreams(isCreate, requestedChecksum);
    assert streams != null : "null streams!";

    // read checksum meta information
    this.clientChecksum = requestedChecksum;
    this.diskChecksum = streams.getChecksum();
    this.needsChecksumTranslation = !clientChecksum.equals(diskChecksum);
    this.bytesPerChecksum = diskChecksum.getBytesPerChecksum();
    this.checksumSize = diskChecksum.getChecksumSize();

    this.out = streams.getDataOut();
    if (out instanceof FileOutputStream) {
      this.outFd = ((FileOutputStream)out).getFD();
    } else {
      LOG.warn("Could not get file descriptor for outputstream of class " +
          out.getClass());
    }
    this.checksumOut = new DataOutputStream(new BufferedOutputStream(
        streams.getChecksumOut(), HdfsConstants.SMALL_BUFFER_SIZE));
    // write data chunk header if creating a new replica
    if (isCreate) {
      BlockMetadataHeader.writeHeader(checksumOut, diskChecksum);
    } 
  }

  private void initializePacketReceiver() {
    this.packetReceiver = new PacketReceiver(false);
  }

  private void initializeResponder() {
    if (isClient && !isTransfer) {
      responder = new Daemon(datanode.threadGroup, 
          new PacketResponder(replyOut, mirrIn, downstreams));
      responder.start(); 
    }
  }

  private void receiveBlockInternal(
      DataOutputStream mirrOut, // output to next datanode
      DataInputStream mirrIn,   // input from next datanode
      DataOutputStream replyOut,  // output to previous datanode
      String mirrAddr, DataTransferThrottler throttlerArg,
      DatanodeInfo[] downstreams,
      boolean isReplaceBlock) throws IOException {

    mirrorOut = mirrOut;
    mirrorAddr = mirrAddr;
    throttler = throttlerArg;

    this.replyOut = replyOut;
    this.isReplaceBlock = isReplaceBlock;

    try {
      while (receivePacket() >= 0) { 
      }

      // wait for all outstanding packet responses. And then
      // indicate responder to gracefully shutdown.
      // Mark that responder has been closed for future processing
      if (responder != null) {
        ((PacketResponder)responder.getRunnable()).close();
      }

      // If this write is for a replication or transfer-RBW/Finalized,
      // then finalize block or convert temporary to RBW.
      // For client-writes, the block is finalized in the PacketResponder.
      if (isDatanode || isTransfer) {
        // Hold a volume reference to finalize block.
        try (ReplicaHandler handler = claimReplicaHandler()) {
          // close the block/crc files
          close();
          block.setNumBytes(replicaInfo.getNumBytes());

          if (stage == BlockConstructionStage.TRANSFER_RBW) {
            // for TRANSFER_RBW, convert temporary to RBW
            datanode.data.convertTemporaryToRbw(block);
          } else {
            // for isDatnode or TRANSFER_FINALIZED
            // Finalize the block.
            datanode.data.finalizeBlock(block);
          }
        }
        datanode.metrics.incrBlocksWritten();
      }

    } catch (IOException ioe) {
      replicaInfo.releaseAllBytesReserved();
      if (datanode.isRestarting()) {
        LOG.info("Shutting down for restart (" + block + ").");
      } else {
        LOG.info("Exception for " + block, ioe);
        throw ioe;
      }
    } finally {
      // Clear the previous interrupt state of this thread.
      Thread.interrupted();

      // If a shutdown for restart was initiated, upstream needs to be notified.
      // There is no need to do anything special if the responder was closed
      // normally.
      if (responder != null) { 
        responder.interrupt();
      }
    }
  }

  void receiveBlock(
      DataOutputStream mirrOut, // output to next datanode
      DataInputStream mirrIn,   // input from next datanode
      DataOutputStream replyOut,  // output to previous datanode
      String mirrAddr, DataTransferThrottler throttlerArg,
      DatanodeInfo[] downstreams,
      boolean isReplaceBlock) throws IOException {

    syncOnClose = datanode.getDnConf().syncOnClose;
    initializeReplicaHandler();
    initializeStreams();
    initializePacketReceiver();
    initializeResponder();

    receiveBlockInternal(mirrOut, mirrIn, replyOut, mirrAddr, throttlerArg, downstreams, isReplaceBlock);
  }

  // ...
}