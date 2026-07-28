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
  return findProxySource(targetDN);
}

private boolean isSameNode(Source source, DatanodeInfo targetDN) {
  return source.getDatanodeInfo().equals(targetDN);
}

private boolean findProxySource(DatanodeInfo targetDN) {
  if (cluster.isNodeGroupAware()) {
    for (StorageGroup loc : block.getLocations()) {
      if (cluster.isOnSameNodeGroup(loc.getDatanodeInfo(), targetDN)
          && addTo(loc)) {
        return true;
      }
    }
  }
  // check if there is replica which is on the same rack with the target
  for (StorageGroup loc : block.getLocations()) {
    if (cluster.isOnSameRack(loc.getDatanodeInfo(), targetDN) && addTo(loc)) {
      return true;
    }
  }
  // find out a non-busy replica
  for (StorageGroup loc : block.getLocations()) {
    if (addTo(loc)) {
      return true;
    }
  }
  return false;
}