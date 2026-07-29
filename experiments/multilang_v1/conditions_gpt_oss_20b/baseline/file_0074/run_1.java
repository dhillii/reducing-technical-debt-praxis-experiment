private boolean chooseProxySource() {
  final DatanodeInfo targetDN = target.getDatanodeInfo();
  if (source.getDatanodeInfo().equals(targetDN) && addTo(source)) {
    return true;
  }
  for (StorageGroup loc : block.getLocations()) {
    if (cluster.isNodeGroupAware() && cluster.isOnSameNodeGroup(loc.getDatanodeInfo(), targetDN)) {
      if (addTo(loc)) {
        return true;
      }
    }
    if (cluster.isOnSameRack(loc.getDatanodeInfo(), targetDN)) {
      if (addTo(loc)) {
        return true;
      }
    }
    if (addTo(loc)) {
      return true;
    }
  }
  return false;
}