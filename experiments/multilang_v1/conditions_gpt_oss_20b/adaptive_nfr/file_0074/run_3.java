private boolean chooseProxySource() {
    final DatanodeInfo targetDN = target.getDatanodeInfo();
    if (isSameNode(targetDN)) {
      return true;
    }
    if (cluster.isNodeGroupAware() && trySelectSameNodeGroup(targetDN)) {
      return true;
    }
    if (trySelectSameRack(targetDN)) {
      return true;
    }
    return trySelectNonBusy();
  }

  /** @return true if source and target are the same node and proxy added */
  private boolean isSameNode(DatanodeInfo targetDN) {
    return source.getDatanodeInfo().equals(targetDN) && addTo(source);
  }

  /** Try to select a proxy in the same node group as the target */
  private boolean trySelectSameNodeGroup(DatanodeInfo targetDN) {
    for (StorageGroup loc : block.getLocations()) {
      if (cluster.isOnSameNodeGroup(loc.getDatanodeInfo(), targetDN)
          && addTo(loc)) {
        return true;
      }
    }
    return false;
  }

  /** Try to select a proxy on the same rack as the target */
  private boolean trySelectSameRack(DatanodeInfo targetDN) {
    for (StorageGroup loc : block.getLocations()) {
      if (cluster.isOnSameRack(loc.getDatanodeInfo(), targetDN)
          && addTo(loc)) {
        return true;
      }
    }
    return false;
  }

  /** Try to select any non‑busy proxy */
  private boolean trySelectNonBusy() {
    for (StorageGroup loc : block.getLocations()) {
      if (addTo(loc)) {
        return true;
      }
    }
    return false;
  }