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
  return getBestMatchDatanode(dnId);
}

/**
 * Finds the best match datanode based on the given DatanodeID.
 *
 * @param dnId DatanodeID to find the best match for
 * @return the best match DatanodeDescriptor
 */
private DatanodeDescriptor getBestMatchDatanode(DatanodeID dnId) {
  String host = dnId.getIpAddr();
  int xferPort = dnId.getXferPort();
  DatanodeDescriptor node = getDatanodeByXferAddr(host, xferPort);
  if (node == null) {
    node = getDatanodeByHost(host);
  }
  if (node == null) {
    node = getRackLocalDatanode(dnId);
  }
  if (node == null) {
    node = getRandomDatanode();
  }
  return node;
}

/**
 * Finds a rack local datanode based on the given DatanodeID.
 *
 * @param dnId DatanodeID to find a rack local datanode for
 * @return a rack local DatanodeDescriptor, or null if not found
 */
private DatanodeDescriptor getRackLocalDatanode(DatanodeID dnId) {
  String networkLocation = resolveNetworkLocationWithFallBackToDefaultLocation(dnId);
  List<Node> rackNodes = getNetworkTopology().getDatanodesInRack(networkLocation);
  if (rackNodes != null) {
    for (Node rackNode : rackNodes) {
      if (((DatanodeDescriptor) rackNode).getIpAddr().equals(dnId.getIpAddr())) {
        return (DatanodeDescriptor) rackNode;
      }
    }
    if (!rackNodes.isEmpty()) {
      return (DatanodeDescriptor) (rackNodes.get(DFSUtil.getRandom().nextInt(rackNodes.size())));
    }
  }
  return null;
}

/**
 * Returns a random DatanodeDescriptor from the cluster.
 *
 * @return a random DatanodeDescriptor
 */
private DatanodeDescriptor getRandomDatanode() {
  return (DatanodeDescriptor) getNetworkTopology().chooseRandom(NodeBase.ROOT);
}