/** @return the last inode in the path. */
INode getLastINodeInPath(String path, boolean resolveLink)
    throws UnresolvedLinkException {
  return getINodesInPath(path, resolveLink).getLastINode();
}