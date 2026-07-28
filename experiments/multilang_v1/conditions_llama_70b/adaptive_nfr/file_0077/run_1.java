/**
 * Get the last inode in the path.
 * 
 * @param pathInfo contains the path and whether to resolve the link
 * @return the last inode in the path
 * @throws UnresolvedLinkException
 */
INode getINode(PathInfo pathInfo) throws UnresolvedLinkException {
  return getINodesInPath(pathInfo.getPath(), pathInfo.isResolveLink()).getLastINode();
}

/**
 * Helper class to hold path and resolve link information.
 */
static class PathInfo {
  private final String path;
  private final boolean resolveLink;

  public PathInfo(String path, boolean resolveLink) {
    this.path = path;
    this.resolveLink = resolveLink;
  }

  public String getPath() {
    return path;
  }

  public boolean isResolveLink() {
    return resolveLink;
  }
}