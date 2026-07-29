private long fetchLocatedBlocksAndGetLastBlockLength() throws IOException {
    LocatedBlocks newInfo = dfsClient.getLocatedBlocks(src, 0);
    logDebugNewInfo(newInfo);
    validateNewInfo(newInfo);
    compareBlockLists(locatedBlocks, newInfo);
    locatedBlocks = newInfo;
    long lastBlockLength = computeLastBlockLength();
    fileEncryptionInfo = locatedBlocks.getFileEncryptionInfo();
    return lastBlockLength;
}

private void logDebugNewInfo(LocatedBlocks newInfo) {
    if (DFSClient.LOG.isDebugEnabled()) {
        DFSClient.LOG.debug("newInfo = " + newInfo);
    }
}

private void validateNewInfo(LocatedBlocks newInfo) throws IOException {
    if (newInfo == null) {
        throw new IOException("Cannot open filename " + src);
    }
}

private void compareBlockLists(LocatedBlocks old, LocatedBlocks newInfo) throws IOException {
    if (old == null) {
        return;
    }
    Iterator<LocatedBlock> oldIter = old.getLocatedBlocks().iterator();
    Iterator<LocatedBlock> newIter = newInfo.getLocatedBlocks().iterator();
    while (oldIter.hasNext() && newIter.hasNext()) {
        if (!oldIter.next().getBlock().equals(newIter.next().getBlock())) {
            throw new IOException("Blocklist for " + src + " has changed!");
        }
    }
}

private long computeLastBlockLength() throws IOException {
    long lastBlockBeingWrittenLength = 0;
    if (!locatedBlocks.isLastBlockComplete()) {
        LocatedBlock last = locatedBlocks.getLastLocatedBlock();
        if (last != null) {
            if (last.getLocations().length == 0) {
                if (last.getBlockSize() == 0) {
                    return 0;
                }
                return -1;
            }
            long len = readBlockLength(last);
            last.getBlock().setNumBytes(len);
            lastBlockBeingWrittenLength = len;
        }
    }
    return lastBlockBeingWrittenLength;
}