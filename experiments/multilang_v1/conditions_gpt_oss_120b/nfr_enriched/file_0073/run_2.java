/**
 * Grab the open-file info from namenode
 */
void openInfo() throws IOException, UnresolvedLinkException {
  synchronized (infoLock) {
    lastBlockBeingWrittenLength = fetchLocatedBlocksAndGetLastBlockLength();
    int retriesForLastBlockLength = dfsClient.getConf().retryTimesForGetLastBlockLength;
    while (retriesForLastBlockLength > 0) {
      // Getting last block length as -1 is a special case. When cluster
      // restarts, DNs may not report immediately. At this time partial block
      // locations will not be available with NN for getting the length. Lets
      // retry for 3 times to get the length.
      if (lastBlockBeingWrittenLength == -1) {
        DFSClient.LOG.warn("Last block locations not available. "
            + "Datanodes might not have reported blocks completely."
            + " Will retry for " + retriesForLastBlockLength + " times");
        waitFor(dfsClient.getConf().retryIntervalForGetLastBlockLength);
        lastBlockBeingWrittenLength = fetchLocatedBlocksAndGetLastBlockLength();
      } else {
        break;
      }
      retriesForLastBlockLength--;
    }
    if (retriesForLastBlockLength == 0) {
      throw new IOException("Could not obtain the last block locations.");
    }
  }
}

/**
 * Fetch located blocks from the NameNode and compute the length of the last
 * block that may still be under construction.
 *
 * @return length of the last block being written, or 0 if none.
 * @throws IOException if block list changes or other I/O errors occur.
 */
private long fetchLocatedBlocksAndGetLastBlockLength() throws IOException {
  final LocatedBlocks newInfo = dfsClient.getLocatedBlocks(src, 0);
  if (DFSClient.LOG.isDebugEnabled()) {
    DFSClient.LOG.debug("newInfo = " + newInfo);
  }
  if (newInfo == null) {
    throw new IOException("Cannot open filename " + src);
  }

  validateBlocklistUnchanged(newInfo);
  locatedBlocks = newInfo;

  long lastBlockLength = computeLastBlockLength();
  fileEncryptionInfo = locatedBlocks.getFileEncryptionInfo();
  return lastBlockLength;
}

/**
 * Ensure that the block list has not changed between successive fetches.
 *
 * @param newInfo newly fetched block information.
 * @throws IOException if the block list has changed.
 */
private void validateBlocklistUnchanged(LocatedBlocks newInfo) throws IOException {
  if (locatedBlocks == null) {
    return;
  }
  Iterator<LocatedBlock> oldIter = locatedBlocks.getLocatedBlocks().iterator();
  Iterator<LocatedBlock> newIter = newInfo.getLocatedBlocks().iterator();
  while (oldIter.hasNext() && newIter.hasNext()) {
    if (!oldIter.next().getBlock().equals(newIter.next().getBlock())) {
      throw new IOException("Blocklist for " + src + " has changed!");
    }
  }
}

/**
 * Compute the length of the last block if it is not yet complete.
 *
 * @return length of the last block being written, 0 if none, or -1 if length
 *         is unknown.
 * @throws IOException if block length cannot be obtained.
 */
private long computeLastBlockLength() throws IOException {
  if (locatedBlocks.isLastBlockComplete()) {
    return 0;
  }
  final LocatedBlock last = locatedBlocks.getLastLocatedBlock();
  if (last == null) {
    return 0;
  }
  if (last.getLocations().length == 0) {
    if (last.getBlockSize() == 0) {
      // No data has been written to datanode.
      return 0;
    }
    return -1;
  }
  final long len = readBlockLength(last);
  last.getBlock().setNumBytes(len);
  return len;
}