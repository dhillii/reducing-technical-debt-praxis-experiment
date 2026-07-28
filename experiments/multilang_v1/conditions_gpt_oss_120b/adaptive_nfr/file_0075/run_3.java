/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package org.apache.hadoop.hdfs.server.blockmanagement;

import static org.apache.hadoop.util.Time.monotonicNow;

import com.google.common.annotations.VisibleForTesting;
import com.google.common.base.Preconditions;
import com.google.common.net.InetAddresses;
import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.apache.hadoop.HadoopIllegalArgumentException;
import org.apache.hadoop.classification.InterfaceAudience;
import org.apache.hadoop.classification.InterfaceStability;
import org.apache.hadoop.conf.Configuration;
import org.apache.hadoop.hdfs.DFSConfigKeys;
import org.apache.hadoop.hdfs.DFSUtil;
import org.apache.hadoop.hdfs.HdfsConfiguration;
import org.apache.hadoop.hdfs.protocol.*;
import org.apache.hadoop.hdfs.protocol.HdfsConstants.DatanodeReportType;
import org.apache.hadoop.hdfs.server.blockmanagement.DatanodeDescriptor.BlockTargetPair;
import org.apache.hadoop.hdfs.server.blockmanagement.DatanodeDescriptor.CachedBlocksList;
import org.apache.hadoop.hdfs.server.namenode.CachedBlock;
import org.apache.hadoop.hdfs.server.namenode.NameNode;
import org.apache.hadoop.hdfs.server.namenode.Namesystem;
import org.apache.hadoop.hdfs.server.protocol.*;
import org.apache.hadoop.hdfs.server.protocol.BlockRecoveryCommand.RecoveringBlock;
import org.apache.hadoop.hdfs.util.CyclicIteration;
import org.apache.hadoop.ipc.Server;
import org.apache.hadoop.net.*;
import org.apache.hadoop.net.NetworkTopology.InvalidTopologyException;
import org.apache.hadoop.util.ReflectionUtils;

import java.io.IOException;
import java.io.PrintWriter;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.UnknownHostException;
import java.util.*;

/**
 * Manage datanodes, include decommission and other activities.
 */
@InterfaceAudience.Private
@InterfaceStability.Evolving
public class DatanodeManager {
  static final Log LOG = LogFactory.getLog(DatanodeManager.class);

  private final Namesystem namesystem;
  private final BlockManager blockManager;
  private final DecommissionManager decomManager;
  private final HeartbeatManager heartbeatManager;
  private final FSClusterStats fsClusterStats;

  private final NavigableMap<String, DatanodeDescriptor> datanodeMap
      = new TreeMap<String, DatanodeDescriptor>();

  /** Cluster network topology */
  private final NetworkTopology networktopology;

  /** Host names to datanode descriptors mapping. */
  private final Host2NodesMap host2DatanodeMap = new Host2NodesMap();

  private final DNSToSwitchMapping dnsToSwitchMapping;
  private final boolean rejectUnresolvedTopologyDN;

  private final int defaultXferPort;
  
  private final int defaultInfoPort;

  private final int defaultInfoSecurePort;

  private final int defaultIpcPort;

  /** Read include/exclude files*/
  private final HostFileManager hostFileManager = new HostFileManager();

  /** The period to wait for datanode heartbeat.*/
  private long heartbeatExpireInterval;
  /** Ask Datanode only up to this many blocks to delete. */
  final int blockInvalidateLimit;

  /** The interval for judging stale DataNodes for read/write */
  private final long staleInterval;
  
  /** Whether or not to avoid using stale DataNodes for reading */
  private final boolean avoidStaleDataNodesForRead;

  /**
   * Whether or not to avoid using stale DataNodes for writing.
   * Note that, even if this is configured, the policy may be
   * temporarily disabled when a high percentage of the nodes
   * are marked as stale.
   */
  private final boolean avoidStaleDataNodesForWrite;

  /**
   * When the ratio of stale datanodes reaches this number, stop avoiding 
   * writing to stale datanodes, i.e., continue using stale nodes for writing.
   */
  private final float ratioUseStaleDataNodesForWrite;

  /** The number of stale DataNodes */
  private volatile int numStaleNodes;

  /** The number of stale storages */
  private volatile int numStaleStorages;

  /**
   * Number of blocks to check for each postponedMisreplicatedBlocks iteration
   */
  private final long blocksPerPostponedMisreplicatedBlocksRescan;

  /**
   * Whether this cluster has ever consisted of more than 1 rack,
   * according to the NetworkTopology.
   */
  private boolean hasClusterEverBeenMultiRack = false;

  private final boolean checkIpHostnameInRegistration;
  /**
   * Whether we should tell datanodes what to cache in replies to
   * heartbeat messages.
   */
  private boolean shouldSendCachingCommands = false;

  /**
   * The number of datanodes for each software version. This list should change
   * during rolling upgrades.
   * Software version -> Number of datanodes with this version
   */
  private HashMap<String, Integer> datanodesSoftwareVersions =
    new HashMap<String, Integer>(4, 0.75f);
  
  /**
   * The minimum time between resending caching directives to Datanodes,
   * in milliseconds.
   *
   * Note that when a rescan happens, we will send the new directives
   * as soon as possible.  This timeout only applies to resending 
   * directives that we've already sent.
   */
  private final long timeBetweenResendingCachingDirectivesMs;

  DatanodeManager(final BlockManager blockManager, final Namesystem namesystem,
      final Configuration conf) throws IOException {
    this.namesystem = namesystem;
    this.blockManager = blockManager;
    
    this.heartbeatManager = new HeartbeatManager(namesystem, blockManager, conf);
    this.decomManager = new DecommissionManager(namesystem, blockManager,
        heartbeatManager);
    this.fsClusterStats = newFSClusterStats();

    networktopology = NetworkTopology.getInstance(conf);

    this.defaultXferPort = NetUtils.createSocketAddr(
          conf.getTrimmed(DFSConfigKeys.DFS_DATANODE_ADDRESS_KEY,
              DFSConfigKeys.DFS_DATANODE_ADDRESS_DEFAULT)).getPort();
    this.defaultInfoPort = NetUtils.createSocketAddr(
          conf.getTrimmed(DFSConfigKeys.DFS_DATANODE_HTTP_ADDRESS_KEY,
              DFSConfigKeys.DFS_DATANODE_HTTP_ADDRESS_DEFAULT)).getPort();
    this.defaultInfoSecurePort = NetUtils.createSocketAddr(
        conf.getTrimmed(DFSConfigKeys.DFS_DATANODE_HTTPS_ADDRESS_KEY,
            DFSConfigKeys.DFS_DATANODE_HTTPS_ADDRESS_DEFAULT)).getPort();
    this.defaultIpcPort = NetUtils.createSocketAddr(
          conf.getTrimmed(DFSConfigKeys.DFS_DATANODE_IPC_ADDRESS_KEY,
              DFSConfigKeys.DFS_DATANODE_IPC_ADDRESS_DEFAULT)).getPort();
    try {
      this.hostFileManager.refresh(conf.get(DFSConfigKeys.DFS_HOSTS, ""),
        conf.get(DFSConfigKeys.DFS_HOSTS_EXCLUDE, ""));
    } catch (IOException e) {
      LOG.error("error reading hosts files: ", e);
    }

    this.dnsToSwitchMapping = ReflectionUtils.newInstance(
        conf.getClass(DFSConfigKeys.NET_TOPOLOGY_NODE_SWITCH_MAPPING_IMPL_KEY, 
            ScriptBasedMapping.class, DNSToSwitchMapping.class), conf);
    
    this.rejectUnresolvedTopologyDN = conf.getBoolean(
        DFSConfigKeys.DFS_REJECT_UNRESOLVED_DN_TOPOLOGY_MAPPING_KEY,
        DFSConfigKeys.DFS_REJECT_UNRESOLVED_DN_TOPOLOGY_MAPPING_DEFAULT);
    
    if (dnsToSwitchMapping instanceof CachedDNSToSwitchMapping) {
      final ArrayList<String> locations = new ArrayList<String>();
      for (InetSocketAddress addr : hostFileManager.getIncludes()) {
        locations.add(addr.getAddress().getHostAddress());
      }
      dnsToSwitchMapping.resolve(locations);
    }

    final long heartbeatIntervalSeconds = conf.getLong(
        DFSConfigKeys.DFS_HEARTBEAT_INTERVAL_KEY,
        DFSConfigKeys.DFS_HEARTBEAT_INTERVAL_DEFAULT);
    final int heartbeatRecheckInterval = conf.getInt(
        DFSConfigKeys.DFS_NAMENODE_HEARTBEAT_RECHECK_INTERVAL_KEY, 
        DFSConfigKeys.DFS_NAMENODE_HEARTBEAT_RECHECK_INTERVAL_DEFAULT);
    this.heartbeatExpireInterval = 2 * heartbeatRecheckInterval
        + 10 * 1000 * heartbeatIntervalSeconds;
    final int blockInvalidateLimit = Math.max(20*(int)(heartbeatIntervalSeconds),
        DFSConfigKeys.DFS_BLOCK_INVALIDATE_LIMIT_DEFAULT);
    this.blockInvalidateLimit = conf.getInt(
        DFSConfigKeys.DFS_BLOCK_INVALIDATE_LIMIT_KEY, blockInvalidateLimit);
    LOG.info(DFSConfigKeys.DFS_BLOCK_INVALIDATE_LIMIT_KEY
        + "=" + this.blockInvalidateLimit);

    this.checkIpHostnameInRegistration = conf.getBoolean(
        DFSConfigKeys.DFS_NAMENODE_DATANODE_REGISTRATION_IP_HOSTNAME_CHECK_KEY,
        DFSConfigKeys.DFS_NAMENODE_DATANODE_REGISTRATION_IP_HOSTNAME_CHECK_DEFAULT);
    LOG.info(DFSConfigKeys.DFS_NAMENODE_DATANODE_REGISTRATION_IP_HOSTNAME_CHECK_KEY
        + "=" + checkIpHostnameInRegistration);

    this.avoidStaleDataNodesForRead = conf.getBoolean(
        DFSConfigKeys.DFS_NAMENODE_AVOID_STALE_DATANODE_FOR_READ_KEY,
        DFSConfigKeys.DFS_NAMENODE_AVOID_STALE_DATANODE_FOR_READ_DEFAULT);
    this.avoidStaleDataNodesForWrite = conf.getBoolean(
        DFSConfigKeys.DFS_NAMENODE_AVOID_STALE_DATANODE_FOR_WRITE_KEY,
        DFSConfigKeys.DFS_NAMENODE_AVOID_STALE_DATANODE_FOR_WRITE_DEFAULT);
    this.staleInterval = getStaleIntervalFromConf(conf, heartbeatExpireInterval);
    this.ratioUseStaleDataNodesForWrite = conf.getFloat(
        DFSConfigKeys.DFS_NAMENODE_USE_STALE_DATANODE_FOR_WRITE_RATIO_KEY,
        DFSConfigKeys.DFS_NAMENODE_USE_STALE_DATANODE_FOR_WRITE_RATIO_DEFAULT);
    Preconditions.checkArgument(
        (ratioUseStaleDataNodesForWrite > 0 && 
            ratioUseStaleDataNodesForWrite <= 1.0f),
        DFSConfigKeys.DFS_NAMENODE_USE_STALE_DATANODE_FOR_WRITE_RATIO_KEY +
        " = '" + ratioUseStaleDataNodesForWrite + "' is invalid. " +
        "It should be a positive non-zero float value, not greater than 1.0f.");
    this.timeBetweenResendingCachingDirectivesMs = conf.getLong(
        DFSConfigKeys.DFS_NAMENODE_PATH_BASED_CACHE_RETRY_INTERVAL_MS,
        DFSConfigKeys.DFS_NAMENODE_PATH_BASED_CACHE_RETRY_INTERVAL_MS_DEFAULT);
    this.blocksPerPostponedMisreplicatedBlocksRescan = conf.getLong(
        DFSConfigKeys.DFS_NAMENODE_BLOCKS_PER_POSTPONEDBLOCKS_RESCAN_KEY,
        DFSConfigKeys.DFS_NAMENODE_BLOCKS_PER_POSTPONEDBLOCKS_RESCAN_KEY_DEFAULT);
  }

  private static long getStaleIntervalFromConf(Configuration conf,
      long heartbeatExpireInterval) {
    long staleInterval = conf.getLong(
        DFSConfigKeys.DFS_NAMENODE_STALE_DATANODE_INTERVAL_KEY, 
        DFSConfigKeys.DFS_NAMENODE_STALE_DATANODE_INTERVAL_DEFAULT);
    Preconditions.checkArgument(staleInterval > 0,
        DFSConfigKeys.DFS_NAMENODE_STALE_DATANODE_INTERVAL_KEY +
        " = '" + staleInterval + "' is invalid. " +
        "It should be a positive non-zero value.");
    
    final long heartbeatIntervalSeconds = conf.getLong(
        DFSConfigKeys.DFS_HEARTBEAT_INTERVAL_KEY,
        DFSConfigKeys.DFS_HEARTBEAT_INTERVAL_DEFAULT);
    final long minStaleInterval = conf.getInt(
        DFSConfigKeys.DFS_NAMENODE_STALE_DATANODE_MINIMUM_INTERVAL_KEY,
        DFSConfigKeys.DFS_NAMENODE_STALE_DATANODE_MINIMUM_INTERVAL_DEFAULT)
        * heartbeatIntervalSeconds * 1000;
    if (staleInterval < minStaleInterval) {
      LOG.warn("The given interval for marking stale datanode = "
          + staleInterval + ", which is less than "
          + DFSConfigKeys.DFS_NAMENODE_STALE_DATANODE_MINIMUM_INTERVAL_DEFAULT
          + " heartbeat intervals. This may cause too frequent changes of " 
          + "stale states of DataNodes since a heartbeat msg may be missing " 
          + "due to temporary short-term failures. Reset stale interval to " 
          + minStaleInterval + ".");
      staleInterval = minStaleInterval;
    }
    if (staleInterval > heartbeatExpireInterval) {
      LOG.warn("The given interval for marking stale datanode = "
          + staleInterval + ", which is larger than heartbeat expire interval "
          + heartbeatExpireInterval + ".");
    }
    return staleInterval;
  }
  
  void activate(final Configuration conf) {
    decomManager.activate(conf);
    heartbeatManager.activate(conf);
  }

  void close() {
    decomManager.close();
    heartbeatManager.close();
  }

  /** @return the network topology. */
  public NetworkTopology getNetworkTopology() {
    return networktopology;
  }

  /** @return the heartbeat manager. */
  HeartbeatManager getHeartbeatManager() {
    return heartbeatManager;
  }

  @VisibleForTesting
  public DecommissionManager getDecomManager() {
    return decomManager;
  }

  HostFileManager getHostFileManager() {
    return hostFileManager;
  }

  @VisibleForTesting
  public void setHeartbeatExpireInterval(long expiryMs) {
    this.heartbeatExpireInterval = expiryMs;
  }

  @VisibleForTesting
  public FSClusterStats getFSClusterStats() {
    return fsClusterStats;
  }

  /** @return the datanode statistics. */
  public DatanodeStatistics getDatanodeStatistics() {
    return heartbeatManager;
  }

  private boolean isInactive(DatanodeInfo datanode) {
    if (datanode.isDecommissioned()) {
      return true;
    }

    if (avoidStaleDataNodesForRead) {
      return datanode.isStale(staleInterval);
    }
      
    return false;
  }
  
  /** Sort the located blocks by the distance to the target host. */
  public void sortLocatedBlocks(final String targethost,
      final List<LocatedBlock> locatedblocks) {
    Node client = getDatanodeByHost(targethost);
    if (client == null) {
      List<String> hosts = new ArrayList<String>(1);
      hosts.add(targethost);
      String rName = dnsToSwitchMapping.resolve(hosts).get(0);
      if (rName != null)
        client = new NodeBase(rName + NodeBase.PATH_SEPARATOR_STR + targethost);
    }
    
    Comparator<DatanodeInfo> comparator = avoidStaleDataNodesForRead ?
        new DFSUtil.DecomStaleComparator(staleInterval) : 
        DFSUtil.DECOM_COMPARATOR;
        
    for (LocatedBlock b : locatedblocks) {
      DatanodeInfo[] di = b.getLocations();
      Arrays.sort(di, comparator);
      
      int lastActiveIndex = di.length - 1;
      while (lastActiveIndex > 0 && isInactive(di[lastActiveIndex])) {
          --lastActiveIndex;
      }
      int activeLen = lastActiveIndex + 1;      
      networktopology.sortByDistance(client, b.getLocations(), activeLen);
      b.updateCachedStorageInfo();
    }
  }
  
  CyclicIteration<String, DatanodeDescriptor> getDatanodeCyclicIteration(
      final String firstkey) {
    return new CyclicIteration<String, DatanodeDescriptor>(
        datanodeMap, firstkey);
  }

  /** @return the datanode descriptor for the host. */
  public DatanodeDescriptor getDatanodeByHost(final String host) {
    return host2DatanodeMap.getDatanodeByHost(host);
  }

  /** @return the datanode descriptor for the host. */
  public DatanodeDescriptor getDatanodeByXferAddr(String host, int xferPort) {
    return host2DatanodeMap.getDatanodeByXferAddr(host, xferPort);
  }

  /** @return the Host2NodesMap */
  public Host2NodesMap getHost2DatanodeMap() {
    return this.host2DatanodeMap;
  }

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
    DatanodeAddressInfo addrInfo = parseAddress(address);
    DatanodeDescriptor node = findNodeByXferOrHost(addrInfo);
    if (node != null) {
      return node;
    }
    String networkLocation = resolveNetworkLocationWithFallBackToDefaultLocation(
        addrInfo.getDatanodeID());
    node = findNodeInRack(addrInfo.getHost(), networkLocation);
    if (node != null) {
      return node;
    }
    return chooseRandomNode();
  }

  private DatanodeDescriptor findNodeByXferOrHost(DatanodeAddressInfo info) {
    DatanodeDescriptor node = getDatanodeByXferAddr(info.getHost(),
        info.getXferPort());
    if (node == null) {
      node = getDatanodeByHost(info.getHost());
    }
    return node;
  }

  private DatanodeDescriptor findNodeInRack(String host,
      String networkLocation) {
    List<Node> rackNodes = getNetworkTopology()
        .getDatanodesInRack(networkLocation);
    if (rackNodes == null) {
      return null;
    }
    for (Node rackNode : rackNodes) {
      if (((DatanodeDescriptor) rackNode).getIpAddr().equals(host)) {
        return (DatanodeDescriptor) rackNode;
      }
    }
    if (!rackNodes.isEmpty()) {
      return (DatanodeDescriptor) rackNodes
          .get(DFSUtil.getRandom().nextInt(rackNodes.size()));
    }
    return null;
  }

  private DatanodeDescriptor chooseRandomNode() {
    return (DatanodeDescriptor) getNetworkTopology()
        .chooseRandom(NodeBase.ROOT);
  }

  private DatanodeAddressInfo parseAddress(String address) {
    DatanodeID dnId = parseDNFromHostsEntry(address);
    return new DatanodeAddressInfo(dnId);
  }

  /** Get a datanode descriptor given corresponding DatanodeUUID */
  DatanodeDescriptor getDatanode(final String datanodeUuid) {
    if (datanodeUuid == null) {
      return null;
    }

    return datanodeMap.get(datanodeUuid);
  }

  /**
   * Get data node by datanode ID.
   * 
   * @param nodeID datanode ID
   * @return DatanodeDescriptor or null if the node is not found.
   * @throws UnregisteredNodeException
   */
  public DatanodeDescriptor getDatanode(DatanodeID nodeID
      ) throws UnregisteredNodeException {
    final DatanodeDescriptor node = getDatanode(nodeID.getDatanodeUuid());
    if (node == null) 
      return null;
    if (!node.getXferAddr().equals(nodeID.getXferAddr())) {
      final UnregisteredNodeException e = new UnregisteredNodeException(
          nodeID, node);
      NameNode.stateChangeLog.error("BLOCK* NameSystem.getDatanode: "
                                    + e.getLocalizedMessage());
      throw e;
    }
    return node;
  }

  public DatanodeStorageInfo[] getDatanodeStorageInfos(
      DatanodeID[] datanodeID, String[] storageIDs)
          throws UnregisteredNodeException {
    if (datanodeID.length == 0) {
      return null;
    }
    final DatanodeStorageInfo[] storages = new DatanodeStorageInfo[datanodeID.length];
    for(int i = 0; i < datanodeID.length; i++) {
      final DatanodeDescriptor dd = getDatanode(datanodeID[i]);
      storages[i] = dd.getStorageInfo(storageIDs[i]);
    }
    return storages; 
  }

  /** Prints information about all datanodes. */
  void datanodeDump(final PrintWriter out) {
    synchronized (datanodeMap) {
      out.println("Metasave: Number of datanodes: " + datanodeMap.size());
      for(Iterator<DatanodeDescriptor> it = datanodeMap.values().iterator(); it.hasNext();) {
        DatanodeDescriptor node = it.next();
        out.println(node.dumpDatanode());
      }
    }
  }

  /**
   * Remove a datanode descriptor.
   * @param nodeInfo datanode descriptor.
   */
  private void removeDatanode(DatanodeDescriptor nodeInfo) {
    assert namesystem.hasWriteLock();
    heartbeatManager.removeDatanode(nodeInfo);
    blockManager.removeBlocksAssociatedTo(nodeInfo);
    networktopology.remove(nodeInfo);
    decrementVersionCount(nodeInfo.getSoftwareVersion());

    if (LOG.isDebugEnabled()) {
      LOG.debug("remove datanode " + nodeInfo);
    }
    namesystem.checkSafeMode();
  }

  /**
   * Remove a datanode
   * @throws UnregisteredNodeException 
   */
  public void removeDatanode(final DatanodeID node
      ) throws UnregisteredNodeException {
    namesystem.writeLock();
    try {
      final DatanodeDescriptor descriptor = getDatanode(node);
      if (descriptor != null) {
        removeDatanode(descriptor);
      } else {
        NameNode.stateChangeLog.warn("BLOCK* removeDatanode: "
                                     + node + " does not exist");
      }
    } finally {
      namesystem.writeUnlock();
    }
  }

  /** Remove a dead datanode. */
  void removeDeadDatanode(final DatanodeID nodeID) {
      synchronized(datanodeMap) {
        DatanodeDescriptor d;
        try {
          d = getDatanode(nodeID);
        } catch(IOException e) {
          d = null;
        }
        if (d != null && isDatanodeDead(d)) {
          NameNode.stateChangeLog.info(
              "BLOCK* removeDeadDatanode: lost heartbeat from " + d);
          removeDatanode(d);
        }
      }
  }

  /** Is the datanode dead? */
  boolean isDatanodeDead(DatanodeDescriptor node) {
    return (node.getLastUpdateMonotonic() <
            (monotonicNow() - heartbeatExpireInterval));
  }

  /** Add a datanode. */
  void addDatanode(final DatanodeDescriptor node) {
    synchronized(datanodeMap) {
      host2DatanodeMap.remove(datanodeMap.put(node.getDatanodeUuid(), node));
    }

    networktopology.add(node);
    host2DatanodeMap.add(node);
    checkIfClusterIsNowMultiRack(node);

    if (LOG.isDebugEnabled()) {
      LOG.debug(getClass().getSimpleName() + ".addDatanode: "
          + "node " + node + " is added to datanodeMap.");
    }
  }

  /** Physically remove node from datanodeMap. */
  private void wipeDatanode(final DatanodeID node) {
    final String key = node.getDatanodeUuid();
    synchronized (datanodeMap) {
      host2DatanodeMap.remove(datanodeMap.remove(key));
    }
    blockManager.removeFromInvalidates(new DatanodeInfo(node));
    if (LOG.isDebugEnabled()) {
      LOG.debug(getClass().getSimpleName() + ".wipeDatanode("
          + node + "): storage " + key 
          + " is removed from datanodeMap.");
    }
  }

  private void incrementVersionCount(String version) {
    if (version == null) {
      return;
    }
    synchronized(datanodeMap) {
      Integer count = this.datanodesSoftwareVersions.get(version);
      count = count == null ? 1 : count + 1;
      this.datanodesSoftwareVersions.put(version, count);
    }
  }

  private void decrementVersionCount(String version) {
    if (version == null) {
      return;
    }
    synchronized(datanodeMap) {
      Integer count = this.datanodesSoftwareVersions.get(version);
      if(count != null) {
        if(count > 1) {
          this.datanodesSoftwareVersions.put(version, count-1);
        } else {
          this.datanodesSoftwareVersions.remove(version);
        }
      }
    }
  }

  private boolean shouldCountVersion(DatanodeDescriptor node) {
    return node.getSoftwareVersion() != null && node.isAlive &&
      !isDatanodeDead(node);
  }

  private void countSoftwareVersions() {
    synchronized(datanodeMap) {
      HashMap<String, Integer> versionCount = new HashMap<String, Integer>();
      for(DatanodeDescriptor dn: datanodeMap.values()) {
        if(shouldCountVersion(dn))
        {
          Integer num = versionCount.get(dn.getSoftwareVersion());
          num = num == null ? 1 : num+1;
          versionCount.put(dn.getSoftwareVersion(), num);
        }
      }
      this.datanodesSoftwareVersions = versionCount;
    }
  }

  public HashMap<String, Integer> getDatanodesSoftwareVersions() {
    synchronized(datanodeMap) {
      return new HashMap<String, Integer> (this.datanodesSoftwareVersions);
    }
  }
  
  /**
   *  Resolve a node's network location. If the DNS to switch mapping fails 
   *  then this method guarantees default rack location. 
   *  @param node to resolve to network location
   *  @return network location path
   */
  private String resolveNetworkLocationWithFallBackToDefaultLocation (
      DatanodeID node) {
    String networkLocation;
    try {
      networkLocation = resolveNetworkLocation(node);
    } catch (UnresolvedTopologyException e) {
      LOG.error("Unresolved topology mapping. Using " +
          NetworkTopology.DEFAULT_RACK + " for host " + node.getHostName());
      networkLocation = NetworkTopology.DEFAULT_RACK;
    }
    return networkLocation;
  }
  
  /**
   * Resolve a node's network location. If the DNS to switch mapping fails, 
   * then this method throws UnresolvedTopologyException. 
   * @param node to resolve to network location
   * @return network location path.
   * @throws UnresolvedTopologyException if the DNS to switch mapping fails 
   *    to resolve network location.
   */
  private String resolveNetworkLocation (DatanodeID node) 
      throws UnresolvedTopologyException {
    List<String> names = new ArrayList<String>(1);
    if (dnsToSwitchMapping instanceof CachedDNSToSwitchMapping) {
      names.add(node.getIpAddr());
    } else {
      names.add(node.getHostName());
    }
    
    List<String> rName = resolveNetworkLocation(names);
    if (rName == null) {
      LOG.error("The resolve call returned null!");
        throw new UnresolvedTopologyException(
            "Unresolved topology mapping for host " + node.getHostName());
    }
    return rName.get(0);
  }

  /**
   * Resolve network locations for specified hosts
   *
   * @param names
   * @return Network locations if available, Else returns null
   */
  public List<String> resolveNetworkLocation(List<String> names) {
    List<String> rName = dnsToSwitchMapping.resolve(names);
    return rName;
  }

  /**
   * Resolve a node's dependencies in the network. If the DNS to switch 
   * mapping fails then this method returns empty list of dependencies 
   * @param node to get dependencies for
   * @return List of dependent host names
   */
  private List<String> getNetworkDependenciesWithDefault(DatanodeInfo node) {
    List<String> dependencies;
    try {
      dependencies = getNetworkDependencies(node);
    } catch (UnresolvedTopologyException e) {
      LOG.error("Unresolved dependency mapping for host " + 
          node.getHostName() +". Continuing with an empty dependency list");
      dependencies = Collections.emptyList();
    }
    return dependencies;
  }
  
  /**
   * Resolves a node's dependencies in the network. If the DNS to switch 
   * mapping fails to get dependencies, then this method throws 
   * UnresolvedTopologyException. 
   * @param node to get dependencies for
   * @return List of dependent host names 
   * @throws UnresolvedTopologyException if the DNS to switch mapping fails
   */
  private List<String> getNetworkDependencies(DatanodeInfo node)
      throws UnresolvedTopologyException {
    List<String> dependencies = Collections.emptyList();

    if (dnsToSwitchMapping instanceof DNSToSwitchMappingWithDependency) {
      dependencies = 
          ((DNSToSwitchMappingWithDependency)dnsToSwitchMapping).getDependency(
              node.getHostName());
      if(dependencies == null) {
        LOG.error("The dependency call returned null for host " + 
            node.getHostName());
        throw new UnresolvedTopologyException("The dependency call returned " + 
            "null for host " + node.getHostName());
      }
    }

    return dependencies;
  }

  /**
   * Remove an already decommissioned data node who is neither in include nor
   * exclude hosts lists from the the list of live or dead nodes.  This is used
   * to not display an already decommssioned data node to the operators.
   * The operation procedure of making a already decommissioned data node not
   * to be displayed is as following:
   * <ol>
   *   <li> 
   *   Host must have been in the include hosts list and the include hosts list
   *   must not be empty.
   *   </li>
   *   <li>
   *   Host is decommissioned by remaining in the include hosts list and added
   *   into the exclude hosts list. Name node is updated with the new 
   *   information by issuing dfsadmin -refreshNodes command.
   *   </li>
   *   <li>
   *   Host is removed from both include hosts and exclude hosts lists.  Name 
   *   node is updated with the new informationby issuing dfsamin -refreshNodes 
   *   command.
   *   <li>
   * </ol>
   * 
   * @param nodeList
   *          , array list of live or dead nodes.
   */
  private void removeDecomNodeFromList(final List<DatanodeDescriptor> nodeList) {
    if (!hostFileManager.hasIncludes()) {
      return;
    }

    for (Iterator<DatanodeDescriptor> it = nodeList.iterator(); it.hasNext();) {
      DatanodeDescriptor node = it.next();
      if ((!hostFileManager.isIncluded(node)) && (!hostFileManager.isExcluded(node))
          && node.isDecommissioned()) {
        it.remove();
      }
    }
  }

  /**
   * Decommission the node if it is in the host exclude list.
   *
   * @param nodeReg datanode
   */
  void startDecommissioningIfExcluded(DatanodeDescriptor nodeReg) {
    if (getHostFileManager().isExcluded(nodeReg)) {
      decomManager.startDecommission(nodeReg);
    }
  }

  /**
   * Register the given datanode with the namenode. NB: the given
   * registration is mutated and given back to the datanode.
   *
   * @param nodeReg the datanode registration
   * @throws DisallowedDatanodeException if the registration request is
   *    denied because the datanode does not match includes/excludes
   * @throws UnresolvedTopologyException if the registration request is 
   *    denied because resolving datanode network location fails.
   */
  public void registerDatanode(DatanodeRegistration nodeReg)
      throws DisallowedDatanodeException, UnresolvedTopologyException {
    InetAddress dnAddress = Server.getRemoteIp();
    if (dnAddress != null) {
      String hostname = dnAddress.getHostName();
      String ip = dnAddress.getHostAddress();
      if (checkIpHostnameInRegistration && !isNameResolved(dnAddress)) {
        final String message = "hostname cannot be resolved (ip="
            + ip + ", hostname=" + hostname + ")";
        LOG.warn("Unresolved datanode registration: " + message);
        throw new DisallowedDatanodeException(nodeReg, message);
      }
      nodeReg.setIpAddr(ip);
      nodeReg.setPeerHostName(hostname);
    }
    
    try {
      nodeReg.setExportedKeys(blockManager.getBlockKeys());
  
      if (!hostFileManager.isIncluded(nodeReg)) {
        throw new DisallowedDatanodeException(nodeReg);
      }
        
      NameNode.stateChangeLog.info("BLOCK* registerDatanode: from "
          + nodeReg + " storage " + nodeReg.getDatanodeUuid());
  
      DatanodeDescriptor nodeS = getDatanode(nodeReg.getDatanodeUuid());
      DatanodeDescriptor nodeN = host2DatanodeMap.getDatanodeByXferAddr(
          nodeReg.getIpAddr(), nodeReg.getXferPort());
        
      if (nodeN != null && nodeN != nodeS) {
        NameNode.LOG.info("BLOCK* registerDatanode: " + nodeN);
        removeDatanode(nodeN);
        wipeDatanode(nodeN);
        nodeN = null;
      }
  
      if (nodeS != null) {
        if (nodeN == nodeS) {
          if(NameNode.stateChangeLog.isDebugEnabled()) {
            NameNode.stateChangeLog.debug("BLOCK* registerDatanode: "
                + "node restarted.");
          }
        } else {
          NameNode.stateChangeLog.info("BLOCK* registerDatanode: " + nodeS
              + " is replaced by " + nodeReg + " with the same storageID "
              + nodeReg.getDatanodeUuid());
        }
        
        boolean success = false;
        try {
          getNetworkTopology().remove(nodeS);
          if(shouldCountVersion(nodeS)) {
            decrementVersionCount(nodeS.getSoftwareVersion());
          }
          nodeS.updateRegInfo(nodeReg);

          nodeS.setSoftwareVersion(nodeReg.getSoftwareVersion());
          nodeS.setDisallowed(false);

          if(this.rejectUnresolvedTopologyDN) {
            nodeS.setNetworkLocation(resolveNetworkLocation(nodeS));
            nodeS.setDependentHostNames(getNetworkDependencies(nodeS));
          } else {
            nodeS.setNetworkLocation(
                resolveNetworkLocationWithFallBackToDefaultLocation(nodeS));
            nodeS.setDependentHostNames(
                getNetworkDependenciesWithDefault(nodeS));
          }
          getNetworkTopology().add(nodeS);
          heartbeatManager.register(nodeS);
          incrementVersionCount(nodeS.getSoftwareVersion());
          startDecommissioningIfExcluded(nodeS);
          success = true;
        } finally {
          if (!success) {
            removeDatanode(nodeS);
            wipeDatanode(nodeS);
            countSoftwareVersions();
          }
        }
        return;
      }

      DatanodeDescriptor nodeDescr 
        = new DatanodeDescriptor(nodeReg, NetworkTopology.DEFAULT_RACK);
      boolean success = false;
      try {
        if(this.rejectUnresolvedTopologyDN) {
          nodeDescr.setNetworkLocation(resolveNetworkLocation(nodeDescr));
          nodeDescr.setDependentHostNames(getNetworkDependencies(nodeDescr));
        } else {
          nodeDescr.setNetworkLocation(
              resolveNetworkLocationWithFallBackToDefaultLocation(nodeDescr));
          nodeDescr.setDependentHostNames(
              getNetworkDependenciesWithDefault(nodeDescr));
        }
        networktopology.add(nodeDescr);
        nodeDescr.setSoftwareVersion(nodeReg.getSoftwareVersion());
        addDatanode(nodeDescr);
        heartbeatManager.addDatanode(nodeDescr);
        incrementVersionCount(nodeReg.getSoftwareVersion());
        startDecommissioningIfExcluded(nodeDescr);
        success = true;
      } finally {
        if (!success) {
          removeDatanode(nodeDescr);
          wipeDatanode(nodeDescr);
          countSoftwareVersions();
        }
      }
    } catch (InvalidTopologyException e) {
      List<String> invalidNodeNames = new ArrayList<String>(3);
      invalidNodeNames.add(nodeReg.getIpAddr());
      invalidNodeNames.add(nodeReg.getHostName());
      invalidNodeNames.add(nodeReg.getPeerHostName());
      dnsToSwitchMapping.reloadCachedMappings(invalidNodeNames);
      throw e;
    }
  }

  /**
   * Rereads conf to get hosts and exclude list file names.
   * Rereads the files to update the hosts and exclude lists.  It
   * checks if any of the hosts have changed states:
   */
  public void refreshNodes(final Configuration conf) throws IOException {
    refreshHostsReader(conf);
    namesystem.writeLock();
    try {
      refreshDatanodes();
      countSoftwareVersions();
    } finally {
      namesystem.writeUnlock();
    }
  }

  /** Reread include/exclude files. */
  private void refreshHostsReader(Configuration conf) throws IOException {
    if (conf == null) {
      conf = new HdfsConfiguration();
    }
    this.hostFileManager.refresh(conf.get(DFSConfigKeys.DFS_HOSTS, ""),
      conf.get(DFSConfigKeys.DFS_HOSTS_EXCLUDE, ""));
  }
  
  /**
   * 1. Added to hosts  --> no further work needed here.
   * 2. Removed from hosts --> mark AdminState as decommissioned. 
   * 3. Added to exclude --> start decommission.
   * 4. Removed from exclude --> stop decommission.
   */
  private void refreshDatanodes() {
    for(DatanodeDescriptor node : datanodeMap.values()) {
      if (!hostFileManager.isIncluded(node)) {
        node.setDisallowed(true);
      } else {
        if (hostFileManager.isExcluded(node)) {
          decomManager.startDecommission(node);
        } else {
          decomManager.stopDecommission(node);
        }
      }
    }
  }

  /** @return the number of live datanodes. */
  public int getNumLiveDataNodes() {
    int numLive = 0;
    synchronized (datanodeMap) {
      for(DatanodeDescriptor dn : datanodeMap.values()) {
        if (!isDatanodeDead(dn) ) {
          numLive++;
        }
      }
    }
    return numLive;
  }

  /** @return the number of dead datanodes. */
  public int getNumDeadDataNodes() {
    return getDatanodeListForReport(DatanodeReportType.DEAD).size();
  }

  /** @return list of datanodes where decommissioning is in progress. */
  public List<DatanodeDescriptor> getDecommissioningNodes() {
    return getDatanodeListForReport(DatanodeReportType.DECOMMISSIONING);
  }
  
  /**
   * Whether stale datanodes should be avoided as targets on the write path.
   * The result of this function may change if the number of stale datanodes
   * eclipses a configurable threshold.
   * 
   * @return whether stale datanodes should be avoided on the write path
   */
  public boolean shouldAvoidStaleDataNodesForWrite() {
    return avoidStaleDataNodesForWrite &&
        (numStaleNodes <= heartbeatManager.getLiveDatanodeCount()
            * ratioUseStaleDataNodesForWrite);
  }

  public long getBlocksPerPostponedMisreplicatedBlocksRescan() {
    return blocksPerPostponedMisreplicatedBlocksRescan;
  }

  /**
   * @return The time interval used to mark DataNodes as stale.
   */
  long getStaleInterval() {
    return staleInterval;
  }

  /**
   * Set the number of current stale DataNodes. The HeartbeatManager got this
   * number based on DataNodes' heartbeats.
   * 
   * @param numStaleNodes
   *          The number of stale DataNodes to be set.
   */
  void setNumStaleNodes(int numStaleNodes) {
    this.numStaleNodes = numStaleNodes;
  }
  
  /**
   * @return Return the current number of stale DataNodes (detected by
   * HeartbeatManager). 
   */
  public int getNumStaleNodes() {
    return this.numStaleNodes;
  }

  /**
   * Get the number of content stale storages.
   */
  public int getNumStaleStorages() {
    return numStaleStorages;
  }

  /**
   * Set the number of content stale storages.
   *
   * @param numStaleStorages The number of content stale storages.
   */
  void setNumStaleStorages(int numStaleStorages) {
    this.numStaleStorages = numStaleStorages;
  }

  /** Fetch live and dead datanodes. */
  public void fetchDatanodes(final List<DatanodeDescriptor> live, 
      final List<DatanodeDescriptor> dead, final boolean removeDecommissionNode) {
    if (live == null && dead == null) {
      throw new HadoopIllegalArgumentException("Both live and dead lists are null");
    }

    final List<DatanodeDescriptor> results =
        getDatanodeListForReport(DatanodeReportType.ALL);
    for(DatanodeDescriptor node : results) {
      if (isDatanodeDead(node)) {
        if (dead != null) {
          dead.add(node);
        }
      } else {
        if (live != null) {
          live.add(node);
        }
      }
    }
    
    if (removeDecommissionNode) {
      if (live != null) {
        removeDecomNodeFromList(live);
      }
      if (dead != null) {
        removeDecomNodeFromList(dead);
      }
    }
  }

  /**
   * @return true if this cluster has ever consisted of multiple racks, even if
   *         it is not now a multi-rack cluster.
   */
  boolean hasClusterEverBeenMultiRack() {
    return hasClusterEverBeenMultiRack;
  }

  /**
   * Check if the cluster now consists of multiple racks. If it does, and this
   * is the first time it's consisted of multiple racks, then process blocks
   * that may now be misreplicated.
   * 
   * @param node DN which caused cluster to become multi-rack. Used for logging.
   */
  @VisibleForTesting
  void checkIfClusterIsNowMultiRack(DatanodeDescriptor node) {
    if (!hasClusterEverBeenMultiRack && networktopology.getNumOfRacks() > 1) {
      String message = "DN " + node + " joining cluster has expanded a formerly " +
          "single-rack cluster to be multi-rack. ";
      if (namesystem.isPopulatingReplQueues()) {
        message += "Re-checking all blocks for replication, since they should " +
            "now be replicated cross-rack";
        LOG.info(message);
      } else {
        message += "Not checking for mis-replicated blocks because this NN is " +
            "not yet processing repl queues.";
        LOG.debug(message);
      }
      hasClusterEverBeenMultiRack = true;
      if (namesystem.isPopulatingReplQueues()) {
        blockManager.processMisReplicatedBlocks();
      }
    }
  }

  /**
   * Parse a DatanodeID from a hosts file entry
   * @param hostLine of form [hostname|ip][:port]?
   * @return DatanodeID constructed from the given string
   */
  private DatanodeID parseDNFromHostsEntry(String hostLine) {
    DatanodeID dnId;
    String hostStr;
    int port;
    int idx = hostLine.indexOf(':');

    if (-1 == idx) {
      hostStr = hostLine;
      port = DFSConfigKeys.DFS_DATANODE_DEFAULT_PORT;
    } else {
      hostStr = hostLine.substring(0, idx);
      port = Integer.parseInt(hostLine.substring(idx+1));
    }

    if (InetAddresses.isInetAddress(hostStr)) {
      dnId = new DatanodeID(hostStr, "", "", port,
          DFSConfigKeys.DFS_DATANODE_HTTP_DEFAULT_PORT,
          DFSConfigKeys.DFS_DATANODE_HTTPS_DEFAULT_PORT,
          DFSConfigKeys.DFS_DATANODE_IPC_DEFAULT_PORT);
    } else {
      String ipAddr = "";
      try {
        ipAddr = InetAddress.getByName(hostStr).getHostAddress();
      } catch (UnknownHostException e) {
        LOG.warn("Invalid hostname " + hostStr + " in hosts file");
      }
      dnId = new DatanodeID(ipAddr, hostStr, "", port,
          DFSConfigKeys.DFS_DATANODE_HTTP_DEFAULT_PORT,
          DFSConfigKeys.DFS_DATANODE_HTTPS_DEFAULT_PORT,
          DFSConfigKeys.DFS_DATANODE_IPC_DEFAULT_PORT);
    }
    return dnId;
  }

  /** For generating datanode reports */
  public List<DatanodeDescriptor> getDatanodeListForReport(
      final DatanodeReportType type) {
    final boolean listLiveNodes =
        type == DatanodeReportType.ALL ||
        type == DatanodeReportType.LIVE;
    final boolean listDeadNodes =
        type == DatanodeReportType.ALL ||
        type == DatanodeReportType.DEAD;
    final boolean listDecommissioningNodes =
        type == DatanodeReportType.ALL ||
        type == DatanodeReportType.DECOMMISSIONING;

    ArrayList<DatanodeDescriptor> nodes;
    final HostFileManager.HostSet foundNodes = new HostFileManager.HostSet();
    final HostFileManager.HostSet includedNodes = hostFileManager.getIncludes();
    final HostFileManager.HostSet excludedNodes = hostFileManager.getExcludes();

    synchronized(datanodeMap) {
      nodes = new ArrayList<DatanodeDescriptor>(datanodeMap.size());
      for (DatanodeDescriptor dn : datanodeMap.values()) {
        final boolean isDead = isDatanodeDead(dn);
        final boolean isDecommissioning = dn.isDecommissionInProgress();
        if ((listLiveNodes && !isDead) ||
            (listDeadNodes && isDead) ||
            (listDecommissioningNodes && isDecommissioning)) {
            nodes.add(dn);
        }
        foundNodes.add(HostFileManager.resolvedAddressFromDatanodeID(dn));
      }
    }

    if (listDeadNodes) {
      for (InetSocketAddress addr : includedNodes) {
        if (foundNodes.matchedBy(addr) || excludedNodes.match(addr)) {
          continue;
        }
        DatanodeDescriptor dn = new DatanodeDescriptor(new DatanodeID(addr
                .getAddress().getHostAddress(), addr.getHostName(), "",
                addr.getPort() == 0 ? defaultXferPort : addr.getPort(),
                defaultInfoPort, defaultInfoSecurePort, defaultIpcPort));
        setDatanodeDead(dn);
        nodes.add(dn);
      }
    }

    if (LOG.isDebugEnabled()) {
      LOG.debug("getDatanodeListForReport with " +
          "includedNodes = " + hostFileManager.getIncludes() +
          ", excludedNodes = " + hostFileManager.getExcludes() +
          ", foundNodes = " + foundNodes +
          ", nodes = " + nodes);
    }
    return nodes;
  }
  
  /**
   * Checks if name resolution was successful for the given address.  If IP
   * address and host name are the same, then it means name resolution has
   * failed.  As a special case, local addresses are also considered
   * acceptable.  This is particularly important on Windows, where 127.0.0.1 does
   * not resolve to "localhost".
   *
   * @param address InetAddress to check
   * @return boolean true if name resolution successful or address is local
   */
  private static boolean isNameResolved(InetAddress address) {
    String hostname = address.getHostName();
    String ip = address.getHostAddress();
    return !hostname.equals(ip) || NetUtils.isLocalAddress(address);
  }
  
  private void setDatanodeDead(DatanodeDescriptor node) {
    node.setLastUpdate(0);
    node.setLastUpdateMonotonic(0);
  }

  /** Handle heartbeat from datanodes. */
  public DatanodeCommand[] handleHeartbeat(DatanodeRegistration nodeReg,
      StorageReport[] reports, final String blockPoolId,
      long cacheCapacity, long cacheUsed, int xceiverCount, 
      int maxTransfers, int failedVolumes,
      VolumeFailureSummary volumeFailureSummary) throws IOException {
    synchronized (heartbeatManager) {
      synchronized (datanodeMap) {
        DatanodeDescriptor nodeinfo = null;
        try {
          nodeinfo = getDatanode(nodeReg);
        } catch(UnregisteredNodeException e) {
          return new DatanodeCommand[]{RegisterCommand.REGISTER};
        }
        
        if (nodeinfo != null && nodeinfo.isDisallowed()) {
          setDatanodeDead(nodeinfo);
          throw new DisallowedDatanodeException(nodeinfo);
        }

        if (nodeinfo == null || !nodeinfo.isAlive) {
          return new DatanodeCommand[]{RegisterCommand.REGISTER};
        }

        heartbeatManager.updateHeartbeat(nodeinfo, reports,
                                         cacheCapacity, cacheUsed,
                                         xceiverCount, failedVolumes,
                                         volumeFailureSummary);

        if(namesystem.isInSafeMode()) {
          return new DatanodeCommand[0];
        }

        BlockInfoContiguousUnderConstruction[] blocks = nodeinfo
            .getLeaseRecoveryCommand(Integer.MAX_VALUE);
        if (blocks != null) {
          BlockRecoveryCommand brCommand = new BlockRecoveryCommand(
              blocks.length);
          for (BlockInfoContiguousUnderConstruction b : blocks) {
            final DatanodeStorageInfo[] storages = b.getExpectedStorageLocations();
            final List<DatanodeStorageInfo> recoveryLocations =
                new ArrayList<DatanodeStorageInfo>(storages.length);
            for (int i = 0; i < storages.length; i++) {
              if (!storages[i].getDatanodeDescriptor().isStale(staleInterval)) {
                recoveryLocations.add(storages[i]);
              }
            }
            boolean truncateRecovery = b.getTruncateBlock() != null;
            boolean copyOnTruncateRecovery = truncateRecovery &&
                b.getTruncateBlock().getBlockId() != b.getBlockId();
            ExtendedBlock primaryBlock = (copyOnTruncateRecovery) ?
                new ExtendedBlock(blockPoolId, b.getTruncateBlock()) :
                new ExtendedBlock(blockPoolId, b);
            DatanodeInfo[] recoveryInfos;
            if (recoveryLocations.size() > 1) {
              if (recoveryLocations.size() != storages.length) {
                LOG.info("Skipped stale nodes for recovery : " +
                    (storages.length - recoveryLocations.size()));
              }
              recoveryInfos =
                  DatanodeStorageInfo.toDatanodeInfos(recoveryLocations);
            } else {
              recoveryInfos = DatanodeStorageInfo.toDatanodeInfos(storages);
            }
            if(truncateRecovery) {
              Block recoveryBlock = (copyOnTruncateRecovery) ? b :
                  b.getTruncateBlock();
              brCommand.add(new RecoveringBlock(primaryBlock, recoveryInfos,
                                                recoveryBlock));
            } else {
              brCommand.add(new RecoveringBlock(primaryBlock, recoveryInfos,
                                                b.getBlockRecoveryId()));
            }
          }
          return new DatanodeCommand[] { brCommand };
        }

        final List<DatanodeCommand> cmds = new ArrayList<DatanodeCommand>();
        List<BlockTargetPair> pendingList = nodeinfo.getReplicationCommand(
              maxTransfers);
        if (pendingList != null) {
          cmds.add(new BlockCommand(DatanodeProtocol.DNA_TRANSFER, blockPoolId,
              pendingList));
        }
        Block[] blks = nodeinfo.getInvalidateBlocks(blockInvalidateLimit);
        if (blks != null) {
          cmds.add(new BlockCommand(DatanodeProtocol.DNA_INVALIDATE,
              blockPoolId, blks));
        }
        boolean sendingCachingCommands = false;
        long nowMs = monotonicNow();
        if (shouldSendCachingCommands && 
            ((nowMs - nodeinfo.getLastCachingDirectiveSentTimeMs()) >=
                timeBetweenResendingCachingDirectivesMs)) {
          DatanodeCommand pendingCacheCommand =
              getCacheCommand(nodeinfo.getPendingCached(), nodeinfo,
                DatanodeProtocol.DNA_CACHE, blockPoolId);
          if (pendingCacheCommand != null) {
            cmds.add(pendingCacheCommand);
            sendingCachingCommands = true;
          }
          DatanodeCommand pendingUncacheCommand =
              getCacheCommand(nodeinfo.getPendingUncached(), nodeinfo,
                DatanodeProtocol.DNA_UNCACHE, blockPoolId);
          if (pendingUncacheCommand != null) {
            cmds.add(pendingUncacheCommand);
            sendingCachingCommands = true;
          }
          if (sendingCachingCommands) {
            nodeinfo.setLastCachingDirectiveSentTimeMs(nowMs);
          }
        }

        blockManager.addKeyUpdateCommand(cmds, nodeinfo);

        if (nodeinfo.getBalancerBandwidth() > 0) {
          cmds.add(new BalancerBandwidthCommand(nodeinfo.getBalancerBandwidth()));
          nodeinfo.setBalancerBandwidth(0);
        }

        if (!cmds.isEmpty()) {
          return cmds.toArray(new DatanodeCommand[cmds.size()]);
        }
      }
    }

    return new DatanodeCommand[0];
  }

  /**
   * Convert a CachedBlockList into a DatanodeCommand with a list of blocks.
   *
   * @param list       The {@link CachedBlocksList}.  This function 
   *                   clears the list.
   * @param datanode   The datanode.
   * @param action     The action to perform in the command.
   * @param poolId     The block pool id.
   * @return           A DatanodeCommand to be sent back to the DN, or null if
   *                   there is nothing to be done.
   */
  private DatanodeCommand getCacheCommand(CachedBlocksList list,
      DatanodeDescriptor datanode, int action, String poolId) {
    int length = list.size();
    if (length == 0) {
      return null;
    }
    long[] blockIds = new long[length];
    int i = 0;
    for (Iterator<CachedBlock> iter = list.iterator(); iter.hasNext(); ) {
      CachedBlock cachedBlock = iter.next();
      blockIds[i++] = cachedBlock.getBlockId();
    }
    return new BlockIdCommand(action, poolId, blockIds);
  }

  /**
   * Tell all datanodes to use a new, non-persistent bandwidth value for
   * dfs.balance.bandwidthPerSec.
   *
   * @param bandwidth Blanacer bandwidth in bytes per second for all datanodes.
   * @throws IOException
   */
  public void setBalancerBandwidth(long bandwidth) throws IOException {
    synchronized(datanodeMap) {
      for (DatanodeDescriptor nodeInfo : datanodeMap.values()) {
        nodeInfo.setBalancerBandwidth(bandwidth);
      }
    }
  }
  
  public void markAllDatanodesStale() {
    LOG.info("Marking all datandoes as stale");
    synchronized (datanodeMap) {
      for (DatanodeDescriptor dn : datanodeMap.values()) {
        for(DatanodeStorageInfo storage : dn.getStorageInfos()) {
          storage.markStaleAfterFailover();
        }
      }
    }
  }

  /**
   * Clear any actions that are queued up to be sent to the DNs
   * on their next heartbeats. This includes block invalidations,
   * recoveries, and replication requests.
   */
  public void clearPendingQueues() {
    synchronized (datanodeMap) {
      for (DatanodeDescriptor dn : datanodeMap.values()) {
        dn.clearBlockQueues();
      }
    }
  }

  /**
   * Reset the lastCachingDirectiveSentTimeMs field of all the DataNodes we
   * know about.
   */
  public void resetLastCachingDirectiveSentTime() {
    synchronized (datanodeMap) {
      for (DatanodeDescriptor dn : datanodeMap.values()) {
        dn.setLastCachingDirectiveSentTimeMs(0L);
      }
    }
  }

  @Override
  public String toString() {
    return getClass().getSimpleName() + ": " + host2DatanodeMap;
  }

  public void clearPendingCachingCommands() {
    for (DatanodeDescriptor dn : datanodeMap.values()) {
      dn.getPendingCached().clear();
      dn.getPendingUncached().clear();
    }
  }

  public void setShouldSendCachingCommands(boolean shouldSendCachingCommands) {
    this.shouldSendCachingCommands = shouldSendCachingCommands;
  }

  FSClusterStats newFSClusterStats() {
    return new FSClusterStats() {
      @Override
      public int getTotalLoad() {
        return heartbeatManager.getXceiverCount();
      }

      @Override
      public boolean isAvoidingStaleDataNodesForWrite() {
        return shouldAvoidStaleDataNodesForWrite();
      }

      @Override
      public int getNumDatanodesInService() {
        return heartbeatManager.getNumDatanodesInService();
      }

      @Override
      public double getInServiceXceiverAverage() {
        double avgLoad = 0;
        final int nodes = getNumDatanodesInService();
        if (nodes != 0) {
          final int xceivers = heartbeatManager
            .getInServiceXceiverCount();
          avgLoad = (double)xceivers/nodes;
        }
        return avgLoad;
      }
    };
  }

  /**
   * Simple holder for host and transfer port extracted from a hosts entry.
   */
  private static class DatanodeAddressInfo {
    private final String host;
    private final int xferPort;
    private final DatanodeID datanodeID;

    DatanodeAddressInfo(DatanodeID dnId) {
      this.host = dnId.getIpAddr();
      this.xferPort = dnId.getXferPort();
      this.datanodeID = dnId;
    }

    String getHost() {
      return host;
    }

    int getXferPort() {
      return xferPort;
    }

    DatanodeID getDatanodeID() {
      return datanodeID;
    }
  }
}