private long fetchLocatedBlocksAndGetLastBlockLength() throws IOException {
  // Extracted method to reduce complexity
  LocatedBlocks newInfo = getLocatedBlocksFromDfsClient();
  return processLocatedBlocks(newInfo);
}

private LocatedBlocks getLocatedBlocksFromDfsClient() throws IOException {
  final LocatedBlocks newInfo = dfsClient.getLocatedBlocks(src, 0);
  if (DFSClient.LOG.isDebugEnabled()) {
    DFSClient.LOG.debug("newInfo = " + newInfo);
  }
  if (newInfo == null) {
    throw new IOException("Cannot open filename " + src);
  }
  return newInfo;
}

private long processLocatedBlocks(LocatedBlocks newInfo) throws IOException {
  // Check if block list has changed
  if (locatedBlocks != null) {
    Iterator<LocatedBlock> oldIter = locatedBlocks.getLocatedBlocks().iterator();
    Iterator<LocatedBlock> newIter = newInfo.getLocatedBlocks().iterator();
    while (oldIter.hasNext() && newIter.hasNext()) {
      if (!oldIter.next().getBlock().equals(newIter.next().getBlock())) {
        throw new IOException("Blocklist for " + src + " has changed!");
      }
    }
  }
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
      final long len = readBlockLength(last);
      last.getBlock().setNumBytes(len);
      lastBlockBeingWrittenLength = len; 
    }
  }
  fileEncryptionInfo = locatedBlocks.getFileEncryptionInfo();
  return lastBlockBeingWrittenLength;
}