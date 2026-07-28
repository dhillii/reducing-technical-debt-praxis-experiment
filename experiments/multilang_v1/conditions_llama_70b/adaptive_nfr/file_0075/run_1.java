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
    DatanodeDescriptor node = getDatanodeByXferAddr(dnId.getIpAddr(), dnId.getXferPort());
    if (node == null) {
        node = getDatanodeByHost(dnId.getIpAddr());
    }
    if (node == null) {
        String networkLocation = resolveNetworkLocationWithFallBackToDefaultLocation(dnId);
        List<Node> rackNodes = getNetworkTopology().getDatanodesInRack(networkLocation);
        if (rackNodes != null) {
            for (Node rackNode : rackNodes) {
                if (((DatanodeDescriptor) rackNode).getIpAddr().equals(dnId.getIpAddr())) {
                    node = (DatanodeDescriptor) rackNode;
                    break;
                }
            }
            if (node == null && !rackNodes.isEmpty()) {
                node = (DatanodeDescriptor) (rackNodes.get(DFSUtil.getRandom().nextInt(rackNodes.size())));
            }
        }
        if (node == null) {
            node = (DatanodeDescriptor) getNetworkTopology().chooseRandom(NodeBase.ROOT);
        }
    }
    return node;
}

// Extracted method to reduce parameter count
private DatanodeDescriptor getDatanodeByXferAddr(DatanodeID dnId) {
    return getDatanodeByXferAddr(dnId.getIpAddr(), dnId.getXferPort());
}

// Extracted method to reduce parameter count
private DatanodeDescriptor getDatanodeByHost(DatanodeID dnId) {
    return getDatanodeByHost(dnId.getIpAddr());
}

// Extracted method to reduce parameter count
private String resolveNetworkLocationWithFallBackToDefaultLocation(DatanodeID dnId) {
    return resolveNetworkLocationWithFallBackToDefaultLocation(dnId);
}