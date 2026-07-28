private boolean chooseProxySource() {
  final DatanodeInfo targetDN = target.getDatanodeInfo();
  if (isSameNode(source, targetDN)) {
    return true;
  }
  return findProxySource(targetDN);
}

private boolean isSameNode(Source source, DatanodeInfo targetDN) {
  return source.getDatanodeInfo().equals(targetDN) && addTo(source);
}

private boolean findProxySource(DatanodeInfo targetDN) {
  if (cluster.isNodeGroupAware()) {
    return findProxyInNodeGroup(targetDN);
  }
  return findProxyInRackOrAnyReplica(targetDN);
}

private boolean findProxyInNodeGroup(DatanodeInfo targetDN) {
  for (StorageGroup loc : block.getLocations()) {
    if (cluster.isOnSameNodeGroup(loc.getDatanodeInfo(), targetDN) && addTo(loc)) {
      return true;
    }
  }
  return false;
}

private boolean findProxyInRackOrAnyReplica(DatanodeInfo targetDN) {
  for (StorageGroup loc : block.getLocations()) {
    if (cluster.isOnSameRack(loc.getDatanodeInfo(), targetDN) && addTo(loc)) {
      return true;
    }
  }
  for (StorageGroup loc : block.getLocations()) {
    if (addTo(loc)) {
      return true;
    }
  }
  return false;
}

private boolean addTo(StorageGroup g) {
  final DDatanode dn = g.getDDatanode();
  if (dn.addPendingBlock(this)) {
    proxySource = dn;
    return true;
  }
  return false;
}