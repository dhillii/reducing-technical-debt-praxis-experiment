private boolean chooseProxySource() {
  final DatanodeInfo targetDN = target.getDatanodeInfo();
  if (source.getDatanodeInfo().equals(targetDN) && addTo(source)) {
    return true;
  }
  return chooseProxySourceFromLocations(targetDN);
}

private boolean chooseProxySourceFromLocations(DatanodeInfo targetDN) {
  if (cluster.isNodeGroupAware()) {
    return chooseProxySourceFromSameNodeGroup(targetDN);
  }
  if (chooseProxySourceFromSameRack(targetDN)) {
    return true;
  }
  return chooseProxySourceFromAnyLocation(targetDN);
}

private boolean chooseProxySourceFromSameNodeGroup(DatanodeInfo targetDN) {
  for (StorageGroup loc : block.getLocations()) {
    if (cluster.isOnSameNodeGroup(loc.getDatanodeInfo(), targetDN) && addTo(loc)) {
      return true;
    }
  }
  return false;
}

private boolean chooseProxySourceFromSameRack(DatanodeInfo targetDN) {
  for (StorageGroup loc : block.getLocations()) {
    if (cluster.isOnSameRack(loc.getDatanodeInfo(), targetDN) && addTo(loc)) {
      return true;
    }
  }
  return false;
}

private boolean chooseProxySourceFromAnyLocation(DatanodeInfo targetDN) {
  for (StorageGroup loc : block.getLocations()) {
    if (addTo(loc)) {
      return true;
    }
  }
  return false;
}