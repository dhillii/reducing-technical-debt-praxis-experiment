/** @return the last inode in the path. */
INode getINode(String path, boolean resolveLink)
    throws UnresolvedLinkException {
  return getINodesInPath(path, resolveLink).getLastINode();
}

// ...

/** @return the last inode in the path. */
INode getINode(String path, boolean resolveLink)
    throws UnresolvedLinkException {
  return getINodesInPath(path, resolveLink).getLastINode();
}

// Rename method "getINode" to prevent any misunderstanding/clash with method "getInode".
// Let's rename it to "getLastINodeInPath".

/** @return the last inode in the path. */
INode getLastINodeInPath(String path, boolean resolveLink)
    throws UnresolvedLinkException {
  return getINodesInPath(path, resolveLink).getLastINode();
}

// Replace all occurrences of "getINode" with "getLastINodeInPath".

// ...

/** @return the last inode in the path. */
INode getLastINodeInPath(String path, boolean resolveLink)
    throws UnresolvedLinkException {
  return getINodesInPath(path, resolveLink).getLastINode();
}

// ...

public INode getINode(String src) throws UnresolvedLinkException {
  return getINode(src, true);
}

// Replace with:

public INode getLastINodeInPath(String src) throws UnresolvedLinkException {
  return getLastINodeInPath(src, true);
}

// ...

public INode getINode4Write(String src) throws UnresolvedLinkException,
    SnapshotAccessControlException {
  return getINodesInPath4Write(src, true).getLastINode();
}

// Replace with:

public INode getLastINodeInPath4Write(String src) throws UnresolvedLinkException,
    SnapshotAccessControlException {
  return getINodesInPath4Write(src, true).getLastINode();
}