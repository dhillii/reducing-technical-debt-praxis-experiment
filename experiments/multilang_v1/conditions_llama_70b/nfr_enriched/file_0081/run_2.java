private static final String FILE_NO_LONGER_UNDER_CONSTRUCTION = "file is no longer under construction";

// ...

public INodeFile toCompleteFile(long mtime) {
    Preconditions.checkState(isUnderConstruction(), FILE_NO_LONGER_UNDER_CONSTRUCTION);
    FileUnderConstructionFeature uc = getFileUnderConstructionFeature();
    if (uc != null) {
        assertAllBlocksComplete();
        removeFeature(uc);
        this.setModificationTime(mtime);
    }
    return this;
}

// ...

public INodeFile setLastBlock(BlockInfoContiguous lastBlock, DatanodeStorageInfo[] locations) throws IOException {
    Preconditions.checkState(isUnderConstruction(), FILE_NO_LONGER_UNDER_CONSTRUCTION);
    // ...
}

public boolean removeLastBlock(Block oldblock) {
    Preconditions.checkState(isUnderConstruction(), FILE_NO_LONGER_UNDER_CONSTRUCTION);
    // ...
}