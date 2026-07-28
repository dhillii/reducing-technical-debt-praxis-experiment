private long fetchLocatedBlocksAndGetLastBlockLength() throws IOException {
    final LocatedBlocks newInfo = dfsClient.getLocatedBlocks(src, 0);
    if (DFSClient.LOG.isDebugEnabled()) {
        DFSClient.LOG.debug("newInfo = " + newInfo);
    }
    if (newInfo == null) {
        throw new IOException("Cannot open filename " + src);
    }

    validateBlockList(newInfo);

    locatedBlocks = newInfo;
    long lastBlockBeingWrittenLength = 0;
    if (!locatedBlocks.isLastBlockComplete()) {
        final LocatedBlock last = locatedBlocks.getLastLocatedBlock();
        if (last != null) {
            lastBlockBeingWrittenLength = readBlockLength(last);
            last.getBlock().setNumBytes(lastBlockBeingWrittenLength);
        }
    }

    fileEncryptionInfo = locatedBlocks.getFileEncryptionInfo();

    return lastBlockBeingWrittenLength;
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