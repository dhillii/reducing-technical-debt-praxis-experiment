public INodeFile toCompleteFile(long mtime) {
    Preconditions.checkState(isUnderConstruction(), 
        Constants.FILE_NO_LONGER_UNDER_CONSTRUCTION);
    FileUnderConstructionFeature uc = getFileUnderConstructionFeature();
    if (uc != null) {
      assertAllBlocksComplete();
      removeFeature(uc);
      this.setModificationTime(mtime);
    }
    return this;
}

public INodeFile toUnderConstruction(String clientName, String clientMachine) {
    Preconditions.checkState(!isUnderConstruction(), 
        Constants.FILE_ALREADY_UNDER_CONSTRUCTION);
    FileUnderConstructionFeature uc = new FileUnderConstructionFeature(
        clientName, clientMachine);
    addFeature(uc);
    return this;
}

public BlockInfoContiguousUnderConstruction setLastBlock(
    BlockInfoContiguous lastBlock, DatanodeStorageInfo[] locations)
    throws IOException {
    Preconditions.checkState(isUnderConstruction(), 
        Constants.FILE_NO_LONGER_UNDER_CONSTRUCTION);

    if (numBlocks() == 0) {
      throw new IOException("Failed to set last block: File is empty.");
    }
    BlockInfoContiguousUnderConstruction ucBlock =
      lastBlock.convertToBlockUnderConstruction(
          BlockUCState.UNDER_CONSTRUCTION, locations);
    setBlock(numBlocks() - 1, ucBlock);
    return ucBlock;
}

public boolean removeLastBlock(Block oldblock) {
    Preconditions.checkState(isUnderConstruction(), 
        Constants.FILE_NO_LONGER_UNDER_CONSTRUCTION);
    if (blocks == null || blocks.length == 0) {
      return false;
    }
    int size_1 = blocks.length - 1;
    if (!blocks[size_1].equals(oldblock)) {
      return false;
    }

    //copy to a new list
    BlockInfoContiguous[] newlist = new BlockInfoContiguous[size_1];
    System.arraycopy(blocks, 0, newlist, 0, size_1);
    setBlocks(newlist);
    return true;
}

private static class Constants {
    public static final String FILE_NO_LONGER_UNDER_CONSTRUCTION = "file is no longer under construction";
    public static final String FILE_ALREADY_UNDER_CONSTRUCTION = "file is already under construction";
}