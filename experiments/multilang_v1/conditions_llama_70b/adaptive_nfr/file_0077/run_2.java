/**
 * Get the last inode in the path.
 * 
 * @return the last inode in the path.
 */
INode getINode(String path, boolean resolveLink) throws UnresolvedLinkException {
    return getINodesInPath(path, resolveLink).getLastINode();
}

// Refactored method to prevent any misunderstanding/clash with method "getInode"
INode getLastINodeInPath(String path, boolean resolveLink) throws UnresolvedLinkException {
    return getINodesInPath(path, resolveLink).getLastINode();
}

// Update the original method to use the new refactored method
INode getINode(String path, boolean resolveLink) throws UnresolvedLinkException {
    return getLastINodeInPath(path, resolveLink);
}