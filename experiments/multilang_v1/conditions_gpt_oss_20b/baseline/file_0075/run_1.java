DatanodeDescriptor getDatanodeDescriptor(String address) {
    DatanodeID dnId = parseDNFromHostsEntry(address);
    String host = dnId.getIpAddr();
    int xferPort = dnId.getXferPort();
    DatanodeDescriptor node = getDatanodeByXferAddr(host, xferPort);
    if (node == null) {
      node = getDatanodeByHost(host);
    }
    if (node == null) {
      node = findBestMatch(dnId);
    }
    return node;
  }

  private DatanodeDescriptor findBestMatch(DatanodeID dnId) {
    String host = dnId.getIpAddr();
    String networkLocation = resolveNetworkLocationWithFallBackToDefaultLocation(dnId);
    List<Node> rackNodes = getNetworkTopology().getDatanodesInRack(networkLocation);
    if (rackNodes != null && !rackNodes.isEmpty()) {
      for (Node rackNode : rackNodes) {
        DatanodeDescriptor dd = (DatanodeDescriptor) rackNode;
        if (dd.getIpAddr().equals(host)) {
          return dd;
        }
      }
      return (DatanodeDescriptor) rackNodes.get(DFSUtil.getRandom().nextInt(rackNodes.size()));
    }
    return (DatanodeDescriptor) getNetworkTopology().chooseRandom(NodeBase.ROOT);
  }