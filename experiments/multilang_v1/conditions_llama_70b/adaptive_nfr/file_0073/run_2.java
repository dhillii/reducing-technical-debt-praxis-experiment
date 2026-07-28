private long fetchLocatedBlocksAndGetLastBlockLength() throws IOException {
  LocatedBlocks newInfo = dfsClient.getLocatedBlocks(src, 0);
  if (newInfo == null) {
    throw new IOException("Cannot open filename " + src);
  }
  return processLocatedBlocks(newInfo);
}

private long processLocatedBlocks(LocatedBlocks newInfo) throws IOException {
  if (locatedBlocks != null) {
    checkBlockListConsistency(newInfo);
  }
  locatedBlocks = newInfo;
  long lastBlockBeingWrittenLength = 0;
  if (!locatedBlocks.isLastBlockComplete()) {
    lastBlockBeingWrittenLength = processLastBlock(newInfo);
  }
  fileEncryptionInfo = locatedBlocks.getFileEncryptionInfo();
  return lastBlockBeingWrittenLength;
}

private void checkBlockListConsistency(LocatedBlocks newInfo) throws IOException {
  Iterator<LocatedBlock> oldIter = locatedBlocks.getLocatedBlocks().iterator();
  Iterator<LocatedBlock> newIter = newInfo.getLocatedBlocks().iterator();
  while (oldIter.hasNext() && newIter.hasNext()) {
    if (!oldIter.next().getBlock().equals(newIter.next().getBlock())) {
      throw new IOException("Blocklist for " + src + " has changed!");
    }
  }
}

private long processLastBlock(LocatedBlocks newInfo) throws IOException {
  LocatedBlock last = newInfo.getLastLocatedBlock();
  if (last != null) {
    if (last.getLocations().length == 0) {
      if (last.getBlockSize() == 0) {
        return 0;
      }
      return -1;
    }
    return readBlockLength(last);
  }
  return 0;
}

private long readBlockLength(LocatedBlock locatedblock) throws IOException {
  int replicaNotFoundCount = locatedblock.getLocations().length;
  for (DatanodeInfo datanode : locatedblock.getLocations()) {
    try {
      ClientDatanodeProtocol cdp = createClientDatanodeProtocolProxy(datanode, locatedblock);
      long n = cdp.getReplicaVisibleLength(locatedblock.getBlock());
      if (n >= 0) {
        return n;
      }
    } catch (IOException ioe) {
      handleIOException(ioe, replicaNotFoundCount, locatedblock);
    }
  }
  throw new IOException("Cannot obtain block length for " + locatedblock);
}

private ClientDatanodeProtocol createClientDatanodeProtocolProxy(DatanodeInfo datanode, LocatedBlock locatedblock) throws IOException {
  return DFSUtil.createClientDatanodeProtocolProxy(datanode, dfsClient.getConfiguration(), dfsClient.getConf().socketTimeout, dfsClient.getConf().connectToDnViaHostname, locatedblock);
}

private void handleIOException(IOException ioe, int replicaNotFoundCount, LocatedBlock locatedblock) {
  if (ioe instanceof RemoteException && ((RemoteException) ioe).unwrapRemoteException() instanceof ReplicaNotFoundException) {
    replicaNotFoundCount--;
  }
  if (DFSClient.LOG.isDebugEnabled()) {
    DFSClient.LOG.debug("Failed to getReplicaVisibleLength from datanode " + locatedblock.getLocations()[0] + " for block " + locatedblock.getBlock(), ioe);
  }
}