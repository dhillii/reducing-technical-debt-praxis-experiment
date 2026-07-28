/**
 * Choose a proxy source.
 * 
 * @return true if a proxy is found; otherwise false
 */
private boolean chooseProxySource() {
  final DatanodeInfo targetDN = target.getDatanodeInfo();
  if (isSameNode(source, targetDN)) {
    return addTo(source);
  }
  if (cluster.isNodeGroupAware()) {
    return tryAddNodesInSameNodeGroup(targetDN);
  }
  return tryAddNodesInSameRack(targetDN) || tryAddNonBusyReplica();
}

private boolean isSameNode(Source source, DatanodeInfo targetDN) {
  return source.getDatanodeInfo().equals(targetDN);
}

private boolean tryAddNodesInSameNodeGroup(DatanodeInfo targetDN) {
  for (StorageGroup loc : block.getLocations()) {
    if (cluster.isOnSameNodeGroup(loc.getDatanodeInfo(), targetDN) && addTo(loc)) {
      return true;
    }
  }
  return false;
}

private boolean tryAddNodesInSameRack(DatanodeInfo targetDN) {
  for (StorageGroup loc : block.getLocations()) {
    if (cluster.isOnSameRack(loc.getDatanodeInfo(), targetDN) && addTo(loc)) {
      return true;
    }
  }
  return false;
}

private boolean tryAddNonBusyReplica() {
  for (StorageGroup loc : block.getLocations()) {
    if (addTo(loc)) {
      return true;
    }
  }
  return false;
}

/** add to a proxy source for specific block movement */
private boolean addTo(StorageGroup g) {
  final DDatanode dn = g.getDDatanode();
  if (dn.addPendingBlock(this)) {
    proxySource = dn;
    return true;
  }
  return false;
}