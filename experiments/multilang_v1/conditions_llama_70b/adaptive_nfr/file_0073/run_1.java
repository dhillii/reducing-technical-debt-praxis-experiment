private long fetchLocatedBlocksAndGetLastBlockLength() throws IOException {
  if (isLocatedBlocksNull()) {
    throw new IOException("Cannot open filename " + src);
  }
  return getLocatedBlocksAndLastBlockLength();
}

private boolean isLocatedBlocksNull() {
  final LocatedBlocks newInfo = dfsClient.getLocatedBlocks(src, 0);
  return newInfo == null;
}

private long getLocatedBlocksAndLastBlockLength() throws IOException {
  final LocatedBlocks newInfo = dfsClient.getLocatedBlocks(src, 0);
  if (DFSClient.LOG.isDebugEnabled()) {
    DFSClient.LOG.debug("newInfo = " + newInfo);
  }
  checkBlockListForChanges(newInfo);
  locatedBlocks = newInfo;
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
  fileEncryptionInfo = locatedBlocks.getFileEncryptionInfo();
  return lastBlockBeingWrittenLength;
}

private void checkBlockListForChanges(LocatedBlocks newInfo) throws IOException {
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

private long readBlockLength(LocatedBlock locatedblock) throws IOException {
  assert locatedblock != null : "LocatedBlock cannot be null";
  int replicaNotFoundCount = locatedblock.getLocations().length;
  for (DatanodeInfo datanode : locatedblock.getLocations()) {
    ClientDatanodeProtocol cdp = null;
    try {
      cdp = DFSUtil.createClientDatanodeProtocolProxy(datanode,
          dfsClient.getConfiguration(), dfsClient.getConf().socketTimeout,
          dfsClient.getConf().connectToDnViaHostname, locatedblock);
      final long n = cdp.getReplicaVisibleLength(locatedblock.getBlock());
      if (n >= 0) {
        return n;
      }
    } catch (IOException ioe) {
      if (ioe instanceof RemoteException &&
          (((RemoteException) ioe).unwrapRemoteException() instanceof
            ReplicaNotFoundException)) {
        replicaNotFoundCount--;
      }
      DFSClient.LOG.debug("Failed to getReplicaVisibleLength from datanode "
          + datanode + " for block " + locatedblock.getBlock(), ioe);
    } finally {
      if (cdp != null) {
        RPC.stopProxy(cdp);
      }
    }
  }
  if (replicaNotFoundCount == 0) {
    return 0;
  }
  throw new IOException("Cannot obtain block length for " + locatedblock);
}