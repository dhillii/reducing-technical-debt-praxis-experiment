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
        String networkLocation = resolveNetworkLocationWithFallBackToDefaultLocation(dnId);
        List<Node> rackNodes = getNetworkTopology().getDatanodesInRack(networkLocation);

        if (rackNodes != null) {
            for (Node rackNode : rackNodes) {
                if (((DatanodeDescriptor) rackNode).getIpAddr().equals(host)) {
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