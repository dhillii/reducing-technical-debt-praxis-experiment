private long fetchLocatedBlocksAndGetLastBlockLength() throws IOException {
    final LocatedBlocks newInfo = dfsClient.getLocatedBlocks(src, 0);
    if (DFSClient.LOG.isDebugEnabled()) {
      DFSClient.LOG.debug("newInfo = " + newInfo);
    }
    if (newInfo == null) {
      throw new IOException("Cannot open filename " + src);
    }

    validateBlockListConsistency(newInfo);
    locatedBlocks = newInfo;
    
    long lastBlockBeingWrittenLength = getLastBlockLength();
    fileEncryptionInfo = locatedBlocks.getFileEncryptionInfo();

    return lastBlockBeingWrittenLength;
  }

  private void validateBlockListConsistency(LocatedBlocks newInfo) throws IOException {
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

  private long getLastBlockLength() throws IOException {
    if (locatedBlocks.isLastBlockComplete()) {
      return 0;
    }
    
    final LocatedBlock last = locatedBlocks.getLastLocatedBlock();
    if (last == null) {
      return 0;
    }
    
    return processLastBlock(last);
  }

  private long processLastBlock(LocatedBlock last) throws IOException {
    if (last.getLocations().length == 0) {
      return last.getBlockSize() == 0 ? 0 : -1;
    }
    
    final long len = readBlockLength(last);
    last.getBlock().setNumBytes(len);
    return len;
  }