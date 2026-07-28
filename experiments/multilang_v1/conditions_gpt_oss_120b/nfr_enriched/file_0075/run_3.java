/**
   * Given datanode address or host name, returns the DatanodeDescriptor for the
   * same, or if it doesn't find the datanode, it looks for a machine local and
   * then rack local datanode, if a rack local datanode is not possible either,
   * it returns the DatanodeDescriptor of any random node in the cluster.
   *
   * @param address hostaddress:transfer address
   * @return the best match for the given datanode
   */
  DatanodeDescriptor getDatanodeDescriptor(String address) {
    DatanodeID dnId = parseDNFromHostsEntry(address);
    String host = dnId.getIpAddr();
    int xferPort = dnId.getXferPort();

    DatanodeDescriptor node = getDatanodeByXferAddr(host, xferPort);
    if (node == null) {
      node = getDatanodeByHost(host);
    }
    if (node == null) {
      node = selectFallbackNode(host, dnId);
    }
    return node;
  }

  /**
   * Select a fallback DatanodeDescriptor when direct lookup fails.
   *
   * @param host the IP address of the requested datanode
   * @param dnId the parsed DatanodeID
   * @return a suitable DatanodeDescriptor, possibly random
   */
  private DatanodeDescriptor selectFallbackNode(String host, DatanodeID dnId) {
    String networkLocation = resolveNetworkLocationWithFallBackToDefaultLocation(dnId);
    List<Node> rackNodes = getNetworkTopology().getDatanodesInRack(networkLocation);
    if (rackNodes != null) {
      DatanodeDescriptor machineLocal = findMachineLocalNode(rackNodes, host);
      if (machineLocal != null) {
        return machineLocal;
      }
      DatanodeDescriptor rackLocal = pickRandomRackNode(rackNodes);
      if (rackLocal != null) {
        return rackLocal;
      }
    }
    return (DatanodeDescriptor) getNetworkTopology().chooseRandom(NodeBase.ROOT);
  }

  /**
   * Find a node in the given rack that matches the requested host IP.
   *
   * @param rackNodes list of nodes in the rack
   * @param host the IP address to match
   * @return matching DatanodeDescriptor or null
   */
  private DatanodeDescriptor findMachineLocalNode(List<Node> rackNodes, String host) {
    for (Node rackNode : rackNodes) {
      DatanodeDescriptor dn = (DatanodeDescriptor) rackNode;
      if (dn.getIpAddr().equals(host)) {
        return dn;
      }
    }
    return null;
  }

  /**
   * Pick a random node from the rack nodes list.
   *
   * @param rackNodes list of nodes in the rack
   * @return a random DatanodeDescriptor or null if the list is empty
   */
  private DatanodeDescriptor pickRandomRackNode(List<Node> rackNodes) {
    if (rackNodes.isEmpty()) {
      return null;
    }
    int idx = DFSUtil.getRandom().nextInt(rackNodes.size());
    return (DatanodeDescriptor) rackNodes.get(idx);
  }