/** @return the last inode in the path. */
INode getINodeAtPath(String path, boolean resolveLink)
    throws UnresolvedLinkException {
  return getINodesInPath(path, resolveLink).getLastINode();
}