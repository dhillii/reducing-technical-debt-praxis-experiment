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
    return getDatanodeDescriptor(dnId);
}

/**
 * Given DatanodeID, returns the DatanodeDescriptor for the same, or if it
 * doesn't find the datanode, it looks for a machine local and then rack local
 * datanode, if a rack local datanode is not possible either, it returns the
 * DatanodeDescriptor of any random node in the cluster.
 *
 * @param dnId DatanodeID
 * @return the best match for the given datanode
 */
private DatanodeDescriptor getDatanodeDescriptor(DatanodeID dnId) {
    String host = dnId.getIpAddr();
    int xferPort = dnId.getXferPort();
    DatanodeDescriptor node = getDatanodeByXferAddr(host, xferPort);
    if (node == null) {
        node = getDatanodeByHost(host);
    }
    if (node == null) {
        String networkLocation = resolveNetworkLocationWithFallBackToDefaultLocation(dnId);

        // If the current cluster doesn't contain the node, fallback to
        // something machine local and then rack local.
        List<Node> rackNodes = getNetworkTopology().getDatanodesInRack(networkLocation);
        if (rackNodes != null) {
            // Try something machine local.
            for (Node rackNode : rackNodes) {
                if (((DatanodeDescriptor) rackNode).getIpAddr().equals(host)) {
                    node = (DatanodeDescriptor) rackNode;
                    break;
                }
            }

            // Try something rack local.
            if (node == null && !rackNodes.isEmpty()) {
                node = (DatanodeDescriptor) (rackNodes.get(DFSUtil.getRandom().nextInt(rackNodes.size())));
            }
        }

        // If we can't even choose rack local, just choose any node in the
        // cluster.
        if (node == null) {
            node = (DatanodeDescriptor) getNetworkTopology().chooseRandom(NodeBase.ROOT);
        }
    }
    return node;
}