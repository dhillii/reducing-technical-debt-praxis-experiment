private long fetchLocatedBlocksAndGetLastBlockLength() throws IOException {
  return fetchLocatedBlocksInternal();
}

private long fetchLocatedBlocksInternal() throws IOException {
  final LocatedBlocks newInfo = dfsClient.getLocatedBlocks(src, 0);
  if (DFSClient.LOG.isDebugEnabled()) {
    DFSClient.LOG.debug("newInfo = " + newInfo);
  }
  if (newInfo == null) {
    throw new IOException("Cannot open filename " + src);
  }

  validateBlockList(newInfo);
  updateLocatedBlocks(newInfo);
  return getLastBlockBeingWrittenLength();
}

private void validateBlockList(LocatedBlocks newInfo) throws IOException {
  if (locatedBlocks != null) {
    Iterator<LocatedBlock> oldIter = locatedBlocks.getLocatedBlocks().iterator();
    Iterator<LocatedBlock> newIter = newInfo.getLocatedBlocks().iterator();
    while (oldIter.hasNext() && newIter.hasNext()) {
      if (!oldIter.next().getBlock().equals(newIter.next().getBlock())) {
        throw new IOException("Blocklist for " + src + " has changed!");
      }
    }
  }
}

private void updateLocatedBlocks(LocatedBlocks newInfo) {
  locatedBlocks = newInfo;
  fileEncryptionInfo = locatedBlocks.getFileEncryptionInfo();
}

private long getLastBlockBeingWrittenLength() {
  long lastBlockBeingWrittenLength = 0;
  if (!locatedBlocks.isLastBlockComplete()) {
    final LocatedBlock last = locatedBlocks.getLastLocatedBlock();
    if (last != null) {
      if (last.getLocations().length == 0) {
        if (last.getBlockSize() == 0) {
          return 0;
        }
        return -1;
      }
      lastBlockBeingWrittenLength = readBlockLength(last);
      last.getBlock().setNumBytes(lastBlockBeingWrittenLength);
    }
  }
  return lastBlockBeingWrittenLength;
}

private long readBlockLength(LocatedBlock locatedblock) throws IOException {
  // Read the block length from one of the datanodes.
  return readBlockLengthInternal(locatedblock);
}

private long readBlockLengthInternal(LocatedBlock locatedblock) throws IOException {
  int replicaNotFoundCount = locatedblock.getLocations().length;
  for (DatanodeInfo datanode : locatedblock.getLocations()) {
    try {
      ClientDatanodeProtocol cdp = createClientDatanodeProtocolProxy(datanode);
      final long n = cdp.getReplicaVisibleLength(locatedblock.getBlock());
      if (n >= 0) {
        return n;
      }
    } catch (IOException ioe) {
      handleIOException(ioe, locatedblock, replicaNotFoundCount);
    }
  }
  throw new IOException("Cannot obtain block length for " + locatedblock);
}

private ClientDatanodeProtocol createClientDatanodeProtocolProxy(DatanodeInfo datanode) throws IOException {
  return DFSUtil.createClientDatanodeProtocolProxy(datanode, dfsClient.getConfiguration(), dfsClient.getConf().socketTimeout, dfsClient.getConf().connectToDnViaHostname, null);
}

private void handleIOException(IOException ioe, LocatedBlock locatedblock, int replicaNotFoundCount) {
  if (ioe instanceof RemoteException && ((RemoteException) ioe).unwrapRemoteException() instanceof ReplicaNotFoundException) {
    replicaNotFoundCount--;
  }
  if (DFSClient.LOG.isDebugEnabled()) {
    DFSClient.LOG.debug("Failed to getReplicaVisibleLength from datanode " + locatedblock.getLocations()[0] + " for block " + locatedblock.getBlock(), ioe);
  }
}