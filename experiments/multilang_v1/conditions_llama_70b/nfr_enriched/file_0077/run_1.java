/**
 * Get the last inode in the path.
 * 
 * @param path the path to resolve
 * @param resolveLink whether to resolve symbolic links
 * @return the last inode in the path
 * @throws UnresolvedLinkException if the link cannot be resolved
 */
INode getLastINodeInPath(String path, boolean resolveLink) throws UnresolvedLinkException {
    return getINodesInPath(path, resolveLink).getLastINode();
}