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

  private void finalizeBlock(long startTime) throws IOException {
    long endTime = 0;
    // Hold a volume reference to finalize block.
    try (ReplicaHandler handler = claimReplicaHandler()) {
      BlockReceiver.this.close();
      endTime = ClientTraceLog.isInfoEnabled() ? System.nanoTime() : 0;
      block.setNumBytes(replicaInfo.getNumBytes());
      datanode.data.finalizeBlock(block);
    }

    if (pinning) {
      datanode.data.setPinning(block);
    }
    
    datanode.closeBlock(
        block, DataNode.EMPTY_DEL_HINT, replicaInfo.getStorageUuid());
    if (ClientTraceLog.isInfoEnabled() && isClient) {
      long offset = 0;
      DatanodeRegistration dnR = datanode.getDNRegistrationForBP(block
          .getBlockPoolId());
      ClientTraceLog.info(String.format(DN_CLIENTTRACE_FORMAT, inAddr,
          myAddr, block.getNumBytes(), "HDFS_WRITE", clientname, offset,
          dnR.getDatanodeUuid(), block, endTime - startTime));
    } else {
      LOG.info("Received " + block + " size " + block.getNumBytes()
          + " from " + inAddr);
    }
  }

  // ...

  private void receiveBlockInternal(
      DataOutputStream mirrOut, 
      DataInputStream mirrIn, 
      DataOutputStream replyOut, 
      String mirrAddr, 
      DataTransferThrottler throttlerArg,
      DatanodeInfo[] downstreams,
      boolean isReplaceBlock) throws IOException {
    syncOnClose = datanode.getDnConf().syncOnClose;
    boolean responderClosed = false;
    mirrorOut = mirrOut;
    mirrorAddr = mirrAddr;
    throttler = throttlerArg;

    this.replyOut = replyOut;
    this.isReplaceBlock = isReplaceBlock;

    try {
      if (isClient && !isTransfer) {
        responder = new Daemon(datanode.threadGroup, 
            new PacketResponder(replyOut, mirrIn, downstreams));
        responder.start(); // start thread to processes responses
      }

      while (receivePacket() >= 0) { /* Receive until the last packet */ }

      // wait for all outstanding packet responses. And then
      // indicate responder to gracefully shutdown.
      // Mark that responder has been closed for future processing
      if (responder != null) {
        ((PacketResponder)responder.getRunnable()).close();
        responderClosed = true;
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
        // Do not throw if shutting down for restart. Otherwise, it will cause
        // premature termination of responder.
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
      if (!responderClosed) { // Data transfer was not complete.
        if (responder != null) {
          // In case this datanode is shutting down for quick restart,
          // send a special ack upstream.
          if (datanode.isRestarting() && isClient && !isTransfer) {
            File blockFile = ((ReplicaInPipeline)replicaInfo).getBlockFile();
            File restartMeta = new File(blockFile.getParent()  + 
                File.pathSeparator + "." + blockFile.getName() + ".restart");
            if (restartMeta.exists() && !restartMeta.delete()) {
              LOG.warn("Failed to delete restart meta file: " +
                  restartMeta.getPath());
            }
            try (Writer out = new OutputStreamWriter(
                new FileOutputStream(restartMeta), "UTF-8")) {
              // write out the current time.
              out.write(Long.toString(Time.now() + restartBudget));
              out.flush();
            } catch (IOException ioe) {
              // The worst case is not recovering this RBW replica. 
              // Client will fall back to regular pipeline recovery.
            } finally {
              IOUtils.cleanup(LOG, out);
            }
            try {              
              // Even if the connection is closed after the ack packet is
              // flushed, the client can react to the connection closure 
              // first. Insert a delay to lower the chance of client 
              // missing the OOB ack.
              Thread.sleep(1000);
            } catch (InterruptedException ie) {
              // It is already going down. Ignore this.
            }
          }
          responder.interrupt();
        }
        IOUtils.closeStream(this);
        cleanupBlock();
      }
      if (responder != null) {
        try {
          responder.interrupt();
          // join() on the responder should timeout a bit earlier than the
          // configured deadline. Otherwise, the join() on this thread will
          // likely timeout as well.
          long joinTimeout = datanode.getDnConf().getXceiverStopTimeout();
          joinTimeout = joinTimeout > 1  ? joinTimeout*8/10 : joinTimeout;
          responder.join(joinTimeout);
          if (responder.isAlive()) {
            String msg = "Join on responder thread " + responder
                + " timed out";
            LOG.warn(msg + "\n" + StringUtils.getStackTrace(responder));
            throw new IOException(msg);
          }
        } catch (InterruptedException e) {
          responder.interrupt();
          // do not throw if shutting down for restart.
          if (!datanode.isRestarting()) {
            throw new IOException("Interrupted receiveBlock");
          }
        }
        responder = null;
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
    receiveBlockInternal(mirrOut, mirrIn, replyOut, mirrAddr, throttlerArg, downstreams, isReplaceBlock);
  }

  // ...
}