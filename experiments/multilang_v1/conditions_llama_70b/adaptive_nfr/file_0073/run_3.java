private long fetchLocatedBlocksAndGetLastBlockLength() throws IOException {
    if (isLocatedBlocksNull()) {
        throw new IOException("Cannot open filename " + src);
    }
    final LocatedBlocks newInfo = dfsClient.getLocatedBlocks(src, 0);
    if (DFSClient.LOG.isDebugEnabled()) {
        DFSClient.LOG.debug("newInfo = " + newInfo);
    }
    return processLocatedBlocks(newInfo);
}

private boolean isLocatedBlocksNull() {
    synchronized (infoLock) {
        return locatedBlocks == null;
    }
}

private long processLocatedBlocks(LocatedBlocks newInfo) throws IOException {
    if (newInfo == null) {
        throw new IOException("Cannot open filename " + src);
    }
    if (locatedBlocks != null) {
        checkBlockListConsistency(newInfo);
    }
    locatedBlocks = newInfo;
    return processLastBlock(newInfo);
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

private long processLastBlock(LocatedBlocks newInfo) {
    long lastBlockBeingWrittenLength = 0;
    if (!newInfo.isLastBlockComplete()) {
        final LocatedBlock last = newInfo.getLastLocatedBlock();
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
    fileEncryptionInfo = newInfo.getFileEncryptionInfo();
    return lastBlockBeingWrittenLength;
}

private long readBlockLength(LocatedBlock locatedblock) throws IOException {
    assert locatedblock != null : "LocatedBlock cannot be null";
    int replicaNotFoundCount = locatedblock.getLocations().length;
    for (DatanodeInfo datanode : locatedblock.getLocations()) {
        try {
            ClientDatanodeProtocol cdp = createClientDatanodeProtocolProxy(datanode);
            final long n = cdp.getReplicaVisibleLength(locatedblock.getBlock());
            if (n >= 0) {
                return n;
            }
        } catch (IOException ioe) {
            handleIOException(ioe, replicaNotFoundCount, locatedblock);
        }
    }
    throw new IOException("Cannot obtain block length for " + locatedblock);
}

private ClientDatanodeProtocol createClientDatanodeProtocolProxy(DatanodeInfo datanode) throws IOException {
    return DFSUtil.createClientDatanodeProtocolProxy(datanode, dfsClient.getConfiguration(), dfsClient.getConf().socketTimeout, dfsClient.getConf().connectToDnViaHostname, null);
}

private void handleIOException(IOException ioe, int replicaNotFoundCount, LocatedBlock locatedblock) {
    if (ioe instanceof RemoteException && ((RemoteException) ioe).unwrapRemoteException() instanceof ReplicaNotFoundException) {
        replicaNotFoundCount--;
    }
    if (DFSClient.LOG.isDebugEnabled()) {
        DFSClient.LOG.debug("Failed to getReplicaVisibleLength from datanode " + locatedblock.getLocations()[0] + " for block " + locatedblock.getBlock(), ioe);
    }
}