/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND,
 * either express or implied. See the License for the specific
 * language governing permissions and limitations under the License.
 */

package org.apache.hadoop.yarn.server.resourcemanager.scheduler.capacity;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Map.Entry;
import java.util.Random;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.apache.hadoop.classification.InterfaceAudience.LimitedPrivate;
import org.apache.hadoop.classification.InterfaceAudience.Private;
import org.apache.hadoop.classification.InterfaceStability.Evolving;
import org.apache.hadoop.conf.Configurable;
import org.apache.hadoop.conf.Configuration;
import org.apache.hadoop.security.AccessControlException;
import org.apache.hadoop.security.Groups;
import org.apache.hadoop.security.UserGroupInformation;
import org.apache.hadoop.yarn.api.records.ApplicationAttemptId;
import org.apache.hadoop.yarn.api.records.ApplicationId;
import org.apache.hadoop.yarn.api.records.Container;
import org.apache.hadoop.yarn.api.records.ContainerExitStatus;
import org.apache.hadoop.yarn.api.records.ContainerId;
import org.apache.hadoop.yarn.api.records.ContainerState;
import org.apache.hadoop.yarn.api.records.ContainerStatus;
import org.apache.hadoop.yarn.api.records.NodeId;
import org.apache.hadoop.yarn.api.records.QueueACL;
import org.apache.hadoop.yarn.api.records.QueueInfo;
import org.apache.hadoop.yarn.api.records.QueueUserACLInfo;
import org.apache.hadoop.yarn.api.records.ReservationId;
import org.apache.hadoop.yarn.api.records.Resource;
import org.apache.hadoop.yarn.api.records.ResourceOption;
import org.apache.hadoop.yarn.api.records.ResourceRequest;
import org.apache.hadoop.yarn.conf.YarnConfiguration;
import org.apache.hadoop.yarn.exceptions.YarnException;
import org.apache.hadoop.yarn.exceptions.YarnRuntimeException;
import org.apache.hadoop.yarn.proto.YarnServiceProtos.SchedulerResourceTypes;
import org.apache.hadoop.yarn.security.YarnAuthorizationProvider;
import org.apache.hadoop.yarn.server.resourcemanager.RMContext;
import org.apache.hadoop.yarn.server.resourcemanager.nodelabels.RMNodeLabelsManager;
import org.apache.hadoop.yarn.server.resourcemanager.recovery.RMStateStore.RMState;
import org.apache.hadoop.yarn.server.resourcemanager.reservation.ReservationConstants;
import org.apache.hadoop.yarn.server.resourcemanager.rmapp.RMApp;
import org.apache.hadoop.yarn.server.resourcemanager.rmapp.RMAppEvent;
import org.apache.hadoop.yarn.server.resourcemanager.rmapp.RMAppEventType;
import org.apache.hadoop.yarn.server.resourcemanager.rmapp.RMAppRejectedEvent;
import org.apache.hadoop.yarn.server.resourcemanager.rmapp.RMAppState;
import org.apache.hadoop.yarn.server.resourcemanager.rmapp.attempt.RMAppAttemptEvent;
import org.apache.hadoop.yarn.server.resourcemanager.rmapp.attempt.RMAppAttemptEventType;
import org.apache.hadoop.yarn.server.resourcemanager.rmapp.attempt.RMAppAttemptState;
import org.apache.hadoop.yarn.server.resourcemanager.rmcontainer.RMContainer;
import org.apache.hadoop.yarn.server.resourcemanager.rmcontainer.RMContainerEventType;
import org.apache.hadoop.yarn.server.resourcemanager.rmcontainer.RMContainerState;
import org.apache.hadoop.yarn.server.resourcemanager.rmnode.RMNode;
import org.apache.hadoop.yarn.server.resourcemanager.rmnode.UpdatedContainerInfo;
import org.apache.hadoop.yarn.server.resourcemanager.scheduler.AbstractYarnScheduler;
import org.apache.hadoop.yarn.server.resourcemanager.scheduler.Allocation;
import org.apache.hadoop.yarn.server.resourcemanager.scheduler.PreemptableResourceScheduler;
import org.apache.hadoop.yarn.server.resourcemanager.scheduler.Queue;
import org.apache.hadoop.yarn.server.resourcemanager.scheduler.QueueMetrics;
import org.apache.hadoop.yarn.server.resourcemanager.scheduler.QueueNotFoundException;
import org.apache.hadoop.yarn.server.resourcemanager.scheduler.ResourceLimits;
import org.apache.hadoop.yarn.server.resourcemanager.scheduler.SchedulerApplication;
import org.apache.hadoop.yarn.server.resourcemanager.scheduler.SchedulerDynamicEditException;
import org.apache.hadoop.yarn.server.resourcemanager.scheduler.SchedulerUtils;
import org.apache.hadoop.yarn.server.resourcemanager.scheduler.capacity.CapacitySchedulerConfiguration.QueueMapping;
import org.apache.hadoop.yarn.server.resourcemanager.scheduler.capacity.CapacitySchedulerConfiguration.QueueMapping.MappingType;
import org.apache.hadoop.yarn.server.resourcemanager.scheduler.common.QueueEntitlement;
import org.apache.hadoop.yarn.server.resourcemanager.scheduler.common.fica.FiCaSchedulerApp;
import org.apache.hadoop.yarn.server.resourcemanager.scheduler.common.fica.FiCaSchedulerNode;
import org.apache.hadoop.yarn.server.resourcemanager.scheduler.event.AppAddedSchedulerEvent;
import org.apache.hadoop.yarn.server.resourcemanager.scheduler.event.AppAttemptAddedSchedulerEvent;
import org.apache.hadoop.yarn.server.resourcemanager.scheduler.event.AppAttemptRemovedSchedulerEvent;
import org.apache.hadoop.yarn.server.resourcemanager.scheduler.event.AppRemovedSchedulerEvent;
import org.apache.hadoop.yarn.server.resourcemanager.scheduler.event.ContainerExpiredSchedulerEvent;
import org.apache.hadoop.yarn.server.resourcemanager.scheduler.event.NodeAddedSchedulerEvent;
import org.apache.hadoop.yarn.server.resourcemanager.scheduler.event.NodeLabelsUpdateSchedulerEvent;
import org.apache.hadoop.yarn.server.resourcemanager.scheduler.event.NodeRemovedSchedulerEvent;
import org.apache.hadoop.yarn.server.resourcemanager.scheduler.event.NodeResourceUpdateSchedulerEvent;
import org.apache.hadoop.yarn.server.resourcemanager.scheduler.event.NodeUpdateSchedulerEvent;
import org.apache.hadoop.yarn.server.resourcemanager.scheduler.event.SchedulerEvent;
import org.apache.hadoop.yarn.server.resourcemanager.security.RMContainerTokenSecretManager;
import org.apache.hadoop.yarn.server.utils.Lock;
import org.apache.hadoop.yarn.util.resource.DefaultResourceCalculator;
import org.apache.hadoop.yarn.util.resource.ResourceCalculator;
import org.apache.hadoop.yarn.util.resource.Resources;

import com.google.common.annotations.VisibleForTesting;
import com.google.common.base.Preconditions;

@LimitedPrivate("yarn")
@Evolving
@SuppressWarnings("unchecked")
public class CapacityScheduler extends
    AbstractYarnScheduler<FiCaSchedulerApp, FiCaSchedulerNode> implements
    PreemptableResourceScheduler, CapacitySchedulerContext, Configurable {

  private static final Log LOG = LogFactory.getLog(CapacityScheduler.class);
  private YarnAuthorizationProvider authorizer;

  private CSQueue root;
  protected final long THREAD_JOIN_TIMEOUT_MS = 1000;

  static final Comparator<CSQueue> queueComparator = new Comparator<CSQueue>() {
    @Override
    public int compare(CSQueue q1, CSQueue q2) {
      if (q1.getUsedCapacity() < q2.getUsedCapacity()) {
        return -1;
      } else if (q1.getUsedCapacity() > q2.getUsedCapacity()) {
        return 1;
      }
      return q1.getQueuePath().compareTo(q2.getQueuePath());
    }
  };

  static final Comparator<FiCaSchedulerApp> applicationComparator =
    new Comparator<FiCaSchedulerApp>() {
    @Override
    public int compare(FiCaSchedulerApp a1, FiCaSchedulerApp a2) {
      return a1.getApplicationId().compareTo(a2.getApplicationId());
    }
  };

  @Override
  public void setConf(Configuration conf) {
    yarnConf = conf;
  }

  private void validateConf(Configuration conf) {
    int minMem = conf.getInt(
      YarnConfiguration.RM_SCHEDULER_MINIMUM_ALLOCATION_MB,
      YarnConfiguration.DEFAULT_RM_SCHEDULER_MINIMUM_ALLOCATION_MB);
    int maxMem = conf.getInt(
      YarnConfiguration.RM_SCHEDULER_MAXIMUM_ALLOCATION_MB,
      YarnConfiguration.DEFAULT_RM_SCHEDULER_MAXIMUM_ALLOCATION_MB);
    if (minMem <= 0 || minMem > maxMem) {
      throw new YarnRuntimeException("Invalid resource scheduler memory"
        + " allocation configuration"
        + ", " + YarnConfiguration.RM_SCHEDULER_MINIMUM_ALLOCATION_MB
        + "=" + minMem
        + ", " + YarnConfiguration.RM_SCHEDULER_MAXIMUM_ALLOCATION_MB
        + "=" + maxMem + ", min and max should be greater than 0"
        + ", max should be no smaller than min.");
    }
    int minVcores = conf.getInt(
      YarnConfiguration.RM_SCHEDULER_MINIMUM_ALLOCATION_VCORES,
      YarnConfiguration.DEFAULT_RM_SCHEDULER_MINIMUM_ALLOCATION_VCORES);
    int maxVcores = conf.getInt(
      YarnConfiguration.RM_SCHEDULER_MAXIMUM_ALLOCATION_VCORES,
      YarnConfiguration.DEFAULT_RM_SCHEDULER_MAXIMUM_ALLOCATION_VCORES);
    if (minVcores <= 0 || minVcores > maxVcores) {
      throw new YarnRuntimeException("Invalid resource scheduler vcores"
        + " allocation configuration"
        + ", " + YarnConfiguration.RM_SCHEDULER_MINIMUM_ALLOCATION_VCORES
        + "=" + minVcores
        + ", " + YarnConfiguration.RM_SCHEDULER_MAXIMUM_ALLOCATION_VCORES
        + "=" + maxVcores + ", min and max should be greater than 0"
        + ", max should be no smaller than min.");
    }
  }

  @Override
  public Configuration getConf() {
    return yarnConf;
  }

  private CapacitySchedulerConfiguration conf;
  private Configuration yarnConf;

  private Map<String, CSQueue> queues = new ConcurrentHashMap<String, CSQueue>();

  private AtomicInteger numNodeManagers = new AtomicInteger(0);

  private ResourceCalculator calculator;
  private boolean usePortForNodeName;

  private boolean scheduleAsynchronously;
  private AsyncScheduleThread asyncSchedulerThread;
  private RMNodeLabelsManager labelManager;

  private long asyncScheduleInterval;
  private static final String ASYNC_SCHEDULER_INTERVAL =
      CapacitySchedulerConfiguration.SCHEDULE_ASYNCHRONOUSLY_PREFIX
          + ".scheduling-interval-ms";
  private static final long DEFAULT_ASYNC_SCHEDULER_INTERVAL = 5;

  private boolean overrideWithQueueMappings = false;
  private List<QueueMapping> mappings = null;
  private Groups groups;

  @VisibleForTesting
  public synchronized String getMappedQueueForTest(String user)
      throws IOException {
    return getMappedQueue(user);
  }

  public CapacityScheduler() {
    super(CapacityScheduler.class.getName());
  }

  @Override
  public QueueMetrics getRootQueueMetrics() {
    return root.getMetrics();
  }

  public CSQueue getRootQueue() {
    return root;
  }

  @Override
  public CapacitySchedulerConfiguration getConfiguration() {
    return conf;
  }

  @Override
  public synchronized RMContainerTokenSecretManager getContainerTokenSecretManager() {
    return this.rmContext.getContainerTokenSecretManager();
  }

  @Override
  public Comparator<FiCaSchedulerApp> getApplicationComparator() {
    return applicationComparator;
  }

  @Override
  public ResourceCalculator getResourceCalculator() {
    return calculator;
  }

  @Override
  public Comparator<CSQueue> getQueueComparator() {
    return queueComparator;
  }

  @Override
  public int getNumClusterNodes() {
    return numNodeManagers.get();
  }

  @Override
  public synchronized RMContext getRMContext() {
    return this.rmContext;
  }

  @Override
  public synchronized void setRMContext(RMContext rmContext) {
    this.rmContext = rmContext;
  }

  private synchronized void initScheduler(Configuration configuration) throws IOException {
    this.conf = loadCapacitySchedulerConfiguration(configuration);
    validateConf(this.conf);
    this.minimumAllocation = this.conf.getMinimumAllocation();
    initMaximumResourceCapability(this.conf.getMaximumAllocation());
    this.calculator = this.conf.getResourceCalculator();
    this.usePortForNodeName = this.conf.getUsePortForNodeName();
    this.applications =
        new ConcurrentHashMap<ApplicationId,
            SchedulerApplication<FiCaSchedulerApp>>();
    this.labelManager = rmContext.getNodeLabelManager();
    authorizer = YarnAuthorizationProvider.getInstance(yarnConf);
    initializeQueues(this.conf);
    scheduleAsynchronously = this.conf.getScheduleAynschronously();
    asyncScheduleInterval =
        this.conf.getLong(ASYNC_SCHEDULER_INTERVAL,
            DEFAULT_ASYNC_SCHEDULER_INTERVAL);
    if (scheduleAsynchronously) {
      asyncSchedulerThread = new AsyncScheduleThread(this);
    }
    LOG.info("Initialized CapacityScheduler with " +
        "calculator=" + getResourceCalculator().getClass() + ", " +
        "minimumAllocation=<" + getMinimumResourceCapability() + ">, " +
        "maximumAllocation=<" + getMaximumResourceCapability() + ">, " +
        "asynchronousScheduling=" + scheduleAsynchronously + ", " +
        "asyncScheduleInterval=" + asyncScheduleInterval + "ms");
  }

  private synchronized void startSchedulerThreads() {
    if (scheduleAsynchronously) {
      Preconditions.checkNotNull(asyncSchedulerThread,
          "asyncSchedulerThread is null");
      asyncSchedulerThread.start();
    }
  }

  @Override
  public void serviceInit(Configuration conf) throws Exception {
    Configuration configuration = new Configuration(conf);
    super.serviceInit(conf);
    initScheduler(configuration);
  }

  @Override
  public void serviceStart() throws Exception {
    startSchedulerThreads();
    super.serviceStart();
  }

  @Override
  public void serviceStop() throws Exception {
    synchronized (this) {
      if (scheduleAsynchronously && asyncSchedulerThread != null) {
        asyncSchedulerThread.interrupt();
        asyncSchedulerThread.join(THREAD_JOIN_TIMEOUT_MS);
      }
    }
    super.serviceStop();
  }

  @Override
  public synchronized void reinitialize(Configuration conf, RMContext rmContext) throws IOException {
    Configuration configuration = new Configuration(conf);
    CapacitySchedulerConfiguration oldConf = this.conf;
    this.conf = loadCapacitySchedulerConfiguration(configuration);
    validateConf(this.conf);
    try {
      LOG.info("Re-initializing queues...");
      refreshMaximumAllocation(this.conf.getMaximumAllocation());
      reinitializeQueues(this.conf);
    } catch (Throwable t) {
      this.conf = oldConf;
      refreshMaximumAllocation(this.conf.getMaximumAllocation());
      throw new IOException("Failed to re-init queues", t);
    }
  }

  long getAsyncScheduleInterval() {
    return asyncScheduleInterval;
  }

  private static final Random random = new Random(System.currentTimeMillis());

  static void schedule(CapacityScheduler cs) {
    int current = 0;
    Collection<FiCaSchedulerNode> nodes = cs.getAllNodes().values();
    int start = random.nextInt(nodes.size());
    for (FiCaSchedulerNode node : nodes) {
      if (current++ >= start) {
        cs.allocateContainersToNode(node);
      }
    }
    for (FiCaSchedulerNode node : nodes) {
      cs.allocateContainersToNode(node);
    }
    try {
      Thread.sleep(cs.getAsyncScheduleInterval());
    } catch (InterruptedException e) {
      // ignore
    }
  }

  static class AsyncScheduleThread extends Thread {
    private final CapacityScheduler cs;
    private AtomicBoolean runSchedules = new AtomicBoolean(false);

    public AsyncScheduleThread(CapacityScheduler cs) {
      this.cs = cs;
      setDaemon(true);
    }

    @Override
    public void run() {
      while (true) {
        if (!runSchedules.get()) {
          try {
            Thread.sleep(100);
          } catch (InterruptedException ie) {
            // ignore
          }
        } else {
          schedule(cs);
        }
      }
    }

    public void beginSchedule() {
      runSchedules.set(true);
    }

    public void suspendSchedule() {
      runSchedules.set(false);
    }
  }

  public static final String ROOT_QUEUE =
    CapacitySchedulerConfiguration.PREFIX + CapacitySchedulerConfiguration.ROOT;

  static class QueueHook {
    public CSQueue hook(CSQueue queue) {
      return queue;
    }
  }

  private static final QueueHook noop = new QueueHook();

  private void initializeQueueMappings() throws IOException {
    overrideWithQueueMappings = conf.getOverrideWithQueueMappings();
    LOG.info("Initialized queue mappings, override: " + overrideWithQueueMappings);
    List<QueueMapping> newMappings = conf.getQueueMappings();
    for (QueueMapping mapping : newMappings) {
      if (!mapping.queue.equals(CURRENT_USER_MAPPING) &&
          !mapping.queue.equals(PRIMARY_GROUP_MAPPING)) {
        CSQueue queue = queues.get(mapping.queue);
        if (queue == null || !(queue instanceof LeafQueue)) {
          throw new IOException(
              "mapping contains invalid or non-leaf queue " + mapping.queue);
        }
      }
    }
    mappings = newMappings;
    if (mappings.size() > 0) {
      groups = new Groups(conf);
    }
  }

  @Lock(CapacityScheduler.class)
  private void initializeQueues(CapacitySchedulerConfiguration conf) throws IOException {
    root = parseQueue(this, conf, null,
        CapacitySchedulerConfiguration.ROOT, queues, queues, noop);
    labelManager.reinitializeQueueLabels(getQueueToLabels());
    LOG.info("Initialized root queue " + root);
    initializeQueueMappings();
    setQueueAcls(authorizer, queues);
  }

  @Lock(CapacityScheduler.class)
  private void reinitializeQueues(CapacitySchedulerConfiguration conf) throws IOException {
    Map<String, CSQueue> newQueues = new HashMap<String, CSQueue>();
    CSQueue newRoot = parseQueue(this, conf, null,
        CapacitySchedulerConfiguration.ROOT, newQueues, queues, noop);
    validateExistingQueues(queues, newQueues);
    addNewQueues(queues, newQueues);
    root.reinitialize(newRoot, clusterResource);
    initializeQueueMappings();
    root.updateClusterResource(clusterResource, new ResourceLimits(clusterResource));
    labelManager.reinitializeQueueLabels(getQueueToLabels());
    setQueueAcls(authorizer, queues);
  }

  @VisibleForTesting
  public static void setQueueAcls(YarnAuthorizationProvider authorizer,
      Map<String, CSQueue> queues) throws IOException {
    for (CSQueue queue : queues.values()) {
      AbstractCSQueue csQueue = (AbstractCSQueue) queue;
      authorizer.setPermission(csQueue.getPrivilegedEntity(),
        csQueue.getACLs(), UserGroupInformation.getCurrentUser());
    }
  }

  private Map<String, Set<String>> getQueueToLabels() {
    Map<String, Set<String>> queueToLabels = new HashMap<String, Set<String>>();
    for (CSQueue queue : queues.values()) {
      queueToLabels.put(queue.getQueueName(), queue.getAccessibleNodeLabels());
    }
    return queueToLabels;
  }

  @Lock(CapacityScheduler.class)
  private void validateExistingQueues(
      Map<String, CSQueue> queues, Map<String, CSQueue> newQueues) throws IOException {
    for (Entry<String, CSQueue> e : queues.entrySet()) {
      if (!(e.getValue() instanceof ReservationQueue)) {
        String queueName = e.getKey();
        CSQueue oldQueue = e.getValue();
        CSQueue newQueue = newQueues.get(queueName);
        if (newQueue == null) {
          throw new IOException(queueName + " cannot be found during refresh!");
        } else if (!oldQueue.getQueuePath().equals(newQueue.getQueuePath())) {
          throw new IOException(queueName + " is moved from:"
              + oldQueue.getQueuePath() + " to:" + newQueue.getQueuePath()
              + " after refresh, which is not allowed.");
        }
      }
    }
  }

  @Lock(CapacityScheduler.class)
  private void addNewQueues(
      Map<String, CSQueue> queues, Map<String, CSQueue> newQueues) {
    for (Entry<String, CSQueue> e : newQueues.entrySet()) {
      String queueName = e.getKey();
      CSQueue queue = e.getValue();
      if (!queues.containsKey(queueName)) {
        queues.put(queueName, queue);
      }
    }
  }

  @Lock(CapacityScheduler.class)
  static CSQueue parseQueue(
      CapacitySchedulerContext csContext,
      CapacitySchedulerConfiguration conf,
      CSQueue parent, String queueName, Map<String, CSQueue> queues,
      Map<String, CSQueue> oldQueues,
      QueueHook hook) throws IOException {
    CSQueue queue;
    String fullQueueName = (parent == null) ? queueName
        : (parent.getQueuePath() + "." + queueName);
    String[] childQueueNames = conf.getQueues(fullQueueName);
    boolean isReservableQueue = conf.isReservable(fullQueueName);
    if (childQueueNames == null || childQueueNames.length == 0) {
      if (parent == null) {
        throw new IllegalStateException(
            "Queue configuration missing child queue names for " + queueName);
      }
      if (isReservableQueue) {
        queue = new PlanQueue(csContext, queueName, parent,
            oldQueues.get(queueName));
      } else {
        queue = new LeafQueue(csContext, queueName, parent,
            oldQueues.get(queueName));
        queue = hook.hook(queue);
      }
    } else {
      if (isReservableQueue) {
        throw new IllegalStateException(
            "Only Leaf Queues can be reservable for " + queueName);
      }
      ParentQueue parentQueue =
        new ParentQueue(csContext, queueName, parent, oldQueues.get(queueName));
      queue = hook.hook(parentQueue);
      List<CSQueue> childQueues = new ArrayList<CSQueue>();
      for (String childQueueName : childQueueNames) {
        CSQueue childQueue = parseQueue(csContext, conf, queue,
            childQueueName, queues, oldQueues, hook);
        childQueues.add(childQueue);
      }
      parentQueue.setChildQueues(childQueues);
    }
    if (queue instanceof LeafQueue && queues.containsKey(queueName)
        && queues.get(queueName) instanceof LeafQueue) {
      throw new IOException("Two leaf queues were named " + queueName
        + ". Leaf queue names must be distinct");
    }
    queues.put(queueName, queue);
    LOG.info("Initialized queue: " + queue);
    return queue;
  }

  public CSQueue getQueue(String queueName) {
    if (queueName == null) {
      return null;
    }
    return queues.get(queueName);
  }

  private static final String CURRENT_USER_MAPPING = "%user";

  private static final String PRIMARY_GROUP_MAPPING = "%primary_group";

  private String getMappedQueue(String user) throws IOException {
    for (QueueMapping mapping : mappings) {
      if (mapping.type == MappingType.USER) {
        if (mapping.source.equals(CURRENT_USER_MAPPING)) {
          if (mapping.queue.equals(CURRENT_USER_MAPPING)) {
            return user;
          } else if (mapping.queue.equals(PRIMARY_GROUP_MAPPING)) {
            return groups.getGroups(user).get(0);
          } else {
            return mapping.queue;
          }
        }
        if (user.equals(mapping.source)) {
          return mapping.queue;
        }
      }
      if (mapping.type == MappingType.GROUP) {
        for (String userGroups : groups.getGroups(user)) {
          if (userGroups.equals(mapping.source)) {
            return mapping.queue;
          }
        }
      }
    }
    return null;
  }

  private synchronized void addApplication(ApplicationId applicationId,
    String queueName, String user, boolean isAppRecovering) {
    try {
      queueName = resolveQueueNameWithMapping(queueName, user, applicationId);
    } catch (IOException ioex) {
      rejectApplication(applicationId, user, ioex);
      return;
    }
    CSQueue queue = getQueue(queueName);
    if (!validateQueueForApplication(queue, applicationId, user, isAppRecovering)) {
      return;
    }
    submitApplicationToQueue(queue, applicationId, user, queueName, isAppRecovering);
  }

  private String resolveQueueNameWithMapping(String queueName, String user,
      ApplicationId appId) throws IOException {
    if (mappings != null && !mappings.isEmpty()) {
      String mappedQueue = getMappedQueue(user);
      if (mappedQueue != null) {
        if (queueName.equals(YarnConfiguration.DEFAULT_QUEUE_NAME)
            || overrideWithQueueMappings) {
          LOG.info("Application " + appId + " user " + user
              + " mapping [" + queueName + "] to [" + mappedQueue
              + "] override " + overrideWithQueueMappings);
          queueName = mappedQueue;
          RMApp rmApp = rmContext.getRMApps().get(appId);
          rmApp.setQueue(queueName);
        }
      }
    }
    return queueName;
  }

  private void rejectApplication(ApplicationId appId, String user, IOException ioex) {
    String message = "Failed to submit application " + appId +
        " submitted by user " + user + " reason: " + ioex.getMessage();
    this.rmContext.getDispatcher().getEventHandler()
        .handle(new RMAppRejectedEvent(appId, message));
  }

  private boolean validateQueueForApplication(CSQueue queue,
      ApplicationId appId, String user, boolean isRecovering) {
    if (queue == null) {
      if (isRecovering) {
        String err = "Queue named " + queue + " missing during application recovery."
            + " Queue removal during recovery is not presently supported by the"
            + " capacity scheduler, please restart with all queues configured"
            + " which were present before shutdown/restart.";
        LOG.fatal(err);
        throw new QueueNotFoundException(err);
      }
      String msg = "Application " + appId +
          " submitted by user " + user + " to unknown queue: " + queue;
      this.rmContext.getDispatcher().getEventHandler()
          .handle(new RMAppRejectedEvent(appId, msg));
      return false;
    }
    if (!(queue instanceof LeafQueue)) {
      String msg = "Application " + appId +
          " submitted by user " + user + " to non-leaf queue: " + queue;
      this.rmContext.getDispatcher().getEventHandler()
          .handle(new RMAppRejectedEvent(appId, msg));
      return false;
    }
    return true;
  }

  private void submitApplicationToQueue(CSQueue queue, ApplicationId appId,
      String user, String queueName, boolean isRecovering) {
    try {
      queue.submitApplication(appId, user, queueName);
    } catch (AccessControlException ace) {
      if (!isRecovering) {
        LOG.info("Failed to submit application " + appId + " to queue "
            + queueName + " from user " + user, ace);
        this.rmContext.getDispatcher().getEventHandler()
            .handle(new RMAppRejectedEvent(appId, ace.toString()));
        return;
      }
    }
    queue.getMetrics().submitApp(user);
    SchedulerApplication<FiCaSchedulerApp> application =
        new SchedulerApplication<FiCaSchedulerApp>(queue, user);
    applications.put(appId, application);
    LOG.info("Accepted application " + appId + " from user: " + user
        + ", in queue: " + queueName);
    if (!isRecovering) {
      rmContext.getDispatcher().getEventHandler()
        .handle(new RMAppEvent(appId, RMAppEventType.APP_ACCEPTED));
    } else if (LOG.isDebugEnabled()) {
      LOG.debug(appId + " is recovering. Skip notifying APP_ACCEPTED");
    }
  }

  private synchronized void addApplicationAttempt(
      ApplicationAttemptId applicationAttemptId,
      boolean transferStateFromPreviousAttempt,
      boolean isAttemptRecovering) {
    SchedulerApplication<FiCaSchedulerApp> application =
        applications.get(applicationAttemptId.getApplicationId());
    CSQueue queue = (CSQueue) application.getQueue();
    FiCaSchedulerApp attempt = new FiCaSchedulerApp(applicationAttemptId,
        application.getUser(), queue, queue.getActiveUsersManager(), rmContext);
    if (transferStateFromPreviousAttempt) {
      attempt.transferStateFromPreviousAttempt(application.getCurrentAppAttempt());
    }
    application.setCurrentAppAttempt(attempt);
    queue.submitApplicationAttempt(attempt, application.getUser());
    LOG.info("Added Application Attempt " + applicationAttemptId
        + " to scheduler from user " + application.getUser() + " in queue "
        + queue.getQueueName());
    if (!isAttemptRecovering) {
      rmContext.getDispatcher().getEventHandler().handle(
        new RMAppAttemptEvent(applicationAttemptId,
            RMAppAttemptEventType.ATTEMPT_ADDED));
    } else if (LOG.isDebugEnabled()) {
      LOG.debug(applicationAttemptId
          + " is recovering. Skipping notifying ATTEMPT_ADDED");
    }
  }

  private synchronized void doneApplication(ApplicationId applicationId,
      RMAppState finalState) {
    SchedulerApplication<FiCaSchedulerApp> application =
        applications.get(applicationId);
    if (application == null) {
      LOG.warn("Couldn't find application " + applicationId);
      return;
    }
    CSQueue queue = (CSQueue) application.getQueue();
    if (queue instanceof LeafQueue) {
      queue.finishApplication(applicationId, application.getUser());
    } else {
      LOG.error("Cannot finish application from non-leaf queue: "
          + queue.getQueueName());
    }
    application.stop(finalState);
    applications.remove(applicationId);
  }

  private synchronized void doneApplicationAttempt(
      ApplicationAttemptId applicationAttemptId,
      RMAppAttemptState rmAppAttemptFinalState, boolean keepContainers) {
    LOG.info("Application Attempt " + applicationAttemptId + " is done."
        + " finalState=" + rmAppAttemptFinalState);
    FiCaSchedulerApp attempt = getApplicationAttempt(applicationAttemptId);
    SchedulerApplication<FiCaSchedulerApp> application =
        applications.get(applicationAttemptId.getApplicationId());
    if (application == null || attempt == null) {
      LOG.info("Unknown application " + applicationAttemptId + " has completed!");
      return;
    }
    releaseLiveContainers(attempt, keepContainers);
    releaseReservedContainers(attempt);
    attempt.stop(rmAppAttemptFinalState);
    String queueName = attempt.getQueue().getQueueName();
    CSQueue queue = queues.get(queueName);
    if (queue instanceof LeafQueue) {
      queue.finishApplicationAttempt(attempt, queue.getQueueName());
    } else {
      LOG.error("Cannot finish application from non-leaf queue: " + queueName);
    }
  }

  private void releaseLiveContainers(FiCaSchedulerApp attempt, boolean keepContainers) {
    for (RMContainer rmContainer : attempt.getLiveContainers()) {
      if (keepContainers && rmContainer.getState().equals(RMContainerState.RUNNING)) {
        LOG.info("Skip killing " + rmContainer.getContainerId());
        continue;
      }
      completedContainer(rmContainer,
          SchedulerUtils.createAbnormalContainerStatus(
            rmContainer.getContainerId(), SchedulerUtils.COMPLETED_APPLICATION),
          RMContainerEventType.KILL);
    }
  }

  private void releaseReservedContainers(FiCaSchedulerApp attempt) {
    for (RMContainer rmContainer : attempt.getReservedContainers()) {
      completedContainer(rmContainer,
          SchedulerUtils.createAbnormalContainerStatus(
            rmContainer.getContainerId(), "Application Complete"),
          RMContainerEventType.KILL);
    }
  }

  @Override
  @Lock(Lock.NoLock.class)
  public Allocation allocate(ApplicationAttemptId applicationAttemptId,
      List<ResourceRequest> ask, List<ContainerId> release,
      List<String> blacklistAdditions, List<String> blacklistRemovals) {
    FiCaSchedulerApp application = getApplicationAttempt(applicationAttemptId);
    if (application == null) {
      LOG.info("Calling allocate on removed or non existant application " + applicationAttemptId);
      return EMPTY_ALLOCATION;
    }
    SchedulerUtils.normalizeRequests(
        ask, getResourceCalculator(), getClusterResource(),
        getMinimumResourceCapability(), getMaximumResourceCapability());
    releaseContainers(release, application);
    synchronized (application) {
      if (application.isStopped()) {
        LOG.info("Calling allocate on a stopped application " + applicationAttemptId);
        return EMPTY_ALLOCATION;
      }
      if (!ask.isEmpty()) {
        if (LOG.isDebugEnabled()) {
          LOG.debug("allocate: pre-update applicationAttemptId=" + applicationAttemptId
              + " application=" + application);
        }
        application.showRequests();
        application.updateResourceRequests(ask);
        LOG.debug("allocate: post-update");
        application.showRequests();
      }
      if (LOG.isDebugEnabled()) {
        LOG.debug("allocate: applicationAttemptId=" + applicationAttemptId
            + " #ask=" + ask.size());
      }
      application.updateBlacklist(blacklistAdditions, blacklistRemovals);
      return application.getAllocation(getResourceCalculator(),
          clusterResource, getMinimumResourceCapability());
    }
  }

  @Override
  @Lock(Lock.NoLock.class)
  public QueueInfo getQueueInfo(String queueName,
      boolean includeChildQueues, boolean recursive) throws IOException {
    CSQueue queue = this.queues.get(queueName);
    if (queue == null) {
      throw new IOException("Unknown queue: " + queueName);
    }
    return queue.getQueueInfo(includeChildQueues, recursive);
  }

  @Override
  @Lock(Lock.NoLock.class)
  public List<QueueUserACLInfo> getQueueUserAclInfo() {
    UserGroupInformation user;
    try {
      user = UserGroupInformation.getCurrentUser();
    } catch (IOException ioe) {
      return new ArrayList<QueueUserACLInfo>();
    }
    return root.getQueueUserAclInfo(user);
  }

  private synchronized void nodeUpdate(RMNode nm) {
    if (LOG.isDebugEnabled()) {
      LOG.debug("nodeUpdate: " + nm + " clusterResources: " + clusterResource);
    }
    FiCaSchedulerNode node = getNode(nm.getNodeID());
    List<UpdatedContainerInfo> containerInfoList = nm.pullContainerUpdates();
    List<ContainerStatus> newlyLaunched = new ArrayList<ContainerStatus>();
    List<ContainerStatus> completed = new ArrayList<ContainerStatus>();
    for (UpdatedContainerInfo info : containerInfoList) {
      newlyLaunched.addAll(info.getNewlyLaunchedContainers());
      completed.addAll(info.getCompletedContainers());
    }
    for (ContainerStatus launched : newlyLaunched) {
      containerLaunchedOnNode(launched.getContainerId(), node);
    }
    for (ContainerStatus comp : completed) {
      ContainerId containerId = comp.getContainerId();
      LOG.debug("Container FINISHED: " + containerId);
      completedContainer(getRMContainer(containerId), comp,
          RMContainerEventType.FINISHED);
    }
    if (LOG.isDebugEnabled()) {
      LOG.debug("Node being looked for scheduling " + nm
          + " availableResource: " + node.getAvailableResource());
    }
  }

  private synchronized void updateNodeAndQueueResource(RMNode nm,
      ResourceOption resourceOption) {
    updateNodeResource(nm, resourceOption);
    root.updateClusterResource(clusterResource, new ResourceLimits(clusterResource));
  }

  private synchronized void updateLabelsOnNode(NodeId nodeId,
      Set<String> newLabels) {
    FiCaSchedulerNode node = nodes.get(nodeId);
    if (node == null) {
      return;
    }
    if (node.getLabels().size() == newLabels.size()
        && node.getLabels().containsAll(newLabels)) {
      return;
    }
    for (RMContainer rmContainer : node.getRunningContainers()) {
      ContainerId containerId = rmContainer.getContainerId();
      completedContainer(rmContainer,
          ContainerStatus.newInstance(containerId,
              ContainerState.COMPLETE,
              String.format(
                  "Container=%s killed since labels on the node=%s changed",
                  containerId.toString(), nodeId.toString()),
              ContainerExitStatus.KILLED_BY_RESOURCEMANAGER),
          RMContainerEventType.KILL);
    }
    RMContainer reserved = node.getReservedContainer();
    if (reserved != null) {
      dropContainerReservation(reserved);
    }
    node.updateLabels(newLabels);
  }

  private synchronized void allocateContainersToNode(FiCaSchedulerNode node) {
    if (rmContext.isWorkPreservingRecoveryEnabled()
        && !rmContext.isSchedulerReadyForAllocatingContainers()) {
      return;
    }
    RMContainer reserved = node.getReservedContainer();
    if (reserved != null) {
      FiCaSchedulerApp reservedApp = getCurrentAttemptForContainer(reserved.getContainerId());
      LOG.info("Trying to fulfill reservation for application " +
          reservedApp.getApplicationId() + " on node: " + node.getNodeID());
      LeafQueue queue = ((LeafQueue) reservedApp.getQueue());
      CSAssignment assignment = queue.assignContainers(
          clusterResource,
          node,
          new ResourceLimits(labelManager.getResourceByLabel(
              RMNodeLabelsManager.NO_LABEL, clusterResource)));
      RMContainer excess = assignment.getExcessReservation();
      if (excess != null) {
        Container container = excess.getContainer();
        queue.completedContainer(
            clusterResource, assignment.getApplication(), node,
            excess,
            SchedulerUtils.createAbnormalContainerStatus(
                container.getId(),
                SchedulerUtils.UNRESERVED_CONTAINER),
            RMContainerEventType.RELEASED, null, true);
      }
    }
    if (node.getReservedContainer() == null) {
      if (calculator.computeAvailableContainers(node.getAvailableResource(),
          minimumAllocation) > 0) {
        if (LOG.isDebugEnabled()) {
          LOG.debug("Trying to schedule on node: " + node.getNodeName()
              + ", available: " + node.getAvailableResource());
        }
        root.assignContainers(
            clusterResource,
            node,
            new ResourceLimits(labelManager.getResourceByLabel(
                RMNodeLabelsManager.NO_LABEL, clusterResource)));
      }
    } else {
      LOG.info("Skipping scheduling since node " + node.getNodeID()
          + " is reserved by application "
          + node.getReservedContainer().getContainerId().getApplicationAttemptId());
    }
  }

  @Override
  public void handle(SchedulerEvent event) {
    switch (event.getType()) {
      case NODE_ADDED:
        handleNodeAdded((NodeAddedSchedulerEvent) event);
        break;
      case NODE_REMOVED:
        handleNodeRemoved((NodeRemovedSchedulerEvent) event);
        break;
      case NODE_RESOURCE_UPDATE:
        handleNodeResourceUpdate((NodeResourceUpdateSchedulerEvent) event);
        break;
      case NODE_LABELS_UPDATE:
        handleNodeLabelsUpdate((NodeLabelsUpdateSchedulerEvent) event);
        break;
      case NODE_UPDATE:
        handleNodeUpdate((NodeUpdateSchedulerEvent) event);
        break;
      case APP_ADDED:
        handleAppAdded((AppAddedSchedulerEvent) event);
        break;
      case APP_REMOVED:
        handleAppRemoved((AppRemovedSchedulerEvent) event);
        break;
      case APP_ATTEMPT_ADDED:
        handleAppAttemptAdded((AppAttemptAddedSchedulerEvent) event);
        break;
      case APP_ATTEMPT_REMOVED:
        handleAppAttemptRemoved((AppAttemptRemovedSchedulerEvent) event);
        break;
      case CONTAINER_EXPIRED:
        handleContainerExpired((ContainerExpiredSchedulerEvent) event);
        break;
      default:
        LOG.error("Invalid eventtype " + event.getType() + ". Ignoring!");
    }
  }

  private void handleNodeAdded(NodeAddedSchedulerEvent event) {
    addNode(event.getAddedRMNode());
    recoverContainersOnNode(event.getContainerReports(),
        event.getAddedRMNode());
  }

  private void handleNodeRemoved(NodeRemovedSchedulerEvent event) {
    removeNode(event.getRemovedRMNode());
  }

  private void handleNodeResourceUpdate(NodeResourceUpdateSchedulerEvent event) {
    updateNodeAndQueueResource(event.getRMNode(),
        event.getResourceOption());
  }

  private void handleNodeLabelsUpdate(NodeLabelsUpdateSchedulerEvent event) {
    for (Entry<NodeId, Set<String>> entry : event.getUpdatedNodeToLabels().entrySet()) {
      updateLabelsOnNode(entry.getKey(), entry.getValue());
    }
  }

  private void handleNodeUpdate(NodeUpdateSchedulerEvent event) {
    RMNode node = event.getRMNode();
    nodeUpdate(node);
    if (!scheduleAsynchronously) {
      allocateContainersToNode(getNode(node.getNodeID()));
    }
  }

  private void handleAppAdded(AppAddedSchedulerEvent event) {
    String queueName = resolveReservationQueueName(event.getQueue(),
        event.getApplicationId(),
        event.getReservationID());
    if (queueName != null) {
      addApplication(event.getApplicationId(),
          queueName,
          event.getUser(),
          event.getIsAppRecovering());
    }
  }

  private void handleAppRemoved(AppRemovedSchedulerEvent event) {
    doneApplication(event.getApplicationID(),
        event.getFinalState());
  }

  private void handleAppAttemptAdded(AppAttemptAddedSchedulerEvent event) {
    addApplicationAttempt(event.getApplicationAttemptId(),
        event.getTransferStateFromPreviousAttempt(),
        event.getIsAttemptRecovering());
  }

  private void handleAppAttemptRemoved(AppAttemptRemovedSchedulerEvent event) {
    doneApplicationAttempt(event.getApplicationAttemptID(),
        event.getFinalAttemptState(),
        event.getKeepContainersAcrossAppAttempts());
  }

  private void handleContainerExpired(ContainerExpiredSchedulerEvent event) {
    ContainerId containerId = event.getContainerId();
    completedContainer(getRMContainer(containerId),
        SchedulerUtils.createAbnormalContainerStatus(
            containerId,
            SchedulerUtils.EXPIRED_CONTAINER),
        RMContainerEventType.EXPIRE);
  }

  private synchronized void addNode(RMNode nodeManager) {
    FiCaSchedulerNode schedulerNode = new FiCaSchedulerNode(nodeManager,
        usePortForNodeName, nodeManager.getNodeLabels());
    this.nodes.put(nodeManager.getNodeID(), schedulerNode);
    Resources.addTo(clusterResource, nodeManager.getTotalCapability());
    if (labelManager != null) {
      labelManager.activateNode(nodeManager.getNodeID(),
          nodeManager.getTotalCapability());
    }
    root.updateClusterResource(clusterResource, new ResourceLimits(clusterResource));
    int numNodes = numNodeManagers.incrementAndGet();
    updateMaximumAllocation(schedulerNode, true);
    LOG.info("Added node " + nodeManager.getNodeAddress()
        + " clusterResource: " + clusterResource);
    if (scheduleAsynchronously && numNodes == 1) {
      asyncSchedulerThread.beginSchedule();
    }
  }

  private synchronized void removeNode(RMNode nodeInfo) {
    if (labelManager != null) {
      labelManager.deactivateNode(nodeInfo.getNodeID());
    }
    FiCaSchedulerNode node = nodes.get(nodeInfo.getNodeID());
    if (node == null) {
      return;
    }
    Resources.subtractFrom(clusterResource,
        node.getRMNode().getTotalCapability());
    root.updateClusterResource(clusterResource, new ResourceLimits(clusterResource));
    int numNodes = numNodeManagers.decrementAndGet();
    if (scheduleAsynchronously && numNodes == 0) {
      asyncSchedulerThread.suspendSchedule();
    }
    for (RMContainer container : node.getRunningContainers()) {
      completedContainer(container,
          SchedulerUtils.createAbnormalContainerStatus(
              container.getContainerId(),
              SchedulerUtils.LOST_CONTAINER),
          RMContainerEventType.KILL);
    }
    RMContainer reserved = node.getReservedContainer();
    if (reserved != null) {
      completedContainer(reserved,
          SchedulerUtils.createAbnormalContainerStatus(
              reserved.getContainerId(),
              SchedulerUtils.LOST_CONTAINER),
          RMContainerEventType.KILL);
    }
    this.nodes.remove(nodeInfo.getNodeID());
    updateMaximumAllocation(node, false);
    LOG.info("Removed node " + nodeInfo.getNodeAddress()
        + " clusterResource: " + clusterResource);
  }

  @Lock(CapacityScheduler.class)
  @Override
  protected synchronized void completedContainer(RMContainer rmContainer,
      ContainerStatus containerStatus, RMContainerEventType event) {
    if (rmContainer == null) {
      LOG.info("Null container completed...");
      return;
    }
    Container container = rmContainer.getContainer();
    FiCaSchedulerApp application = getCurrentAttemptForContainer(container.getId());
    ApplicationId appId = container.getId().getApplicationAttemptId().getApplicationId();
    if (application == null) {
      LOG.info("Container " + container + " of unknown application "
          + appId + " completed with event " + event);
      return;
    }
    FiCaSchedulerNode node = getNode(container.getNodeId());
    LeafQueue queue = (LeafQueue) application.getQueue();
    queue.completedContainer(clusterResource, application, node,
        rmContainer, containerStatus, event, null, true);
    LOG.info("Application attempt " + application.getApplicationAttemptId()
        + " released container " + container.getId() + " on node: " + node
        + " with event: " + event);
  }

  @Lock(Lock.NoLock.class)
  @VisibleForTesting
  @Override
  public FiCaSchedulerApp getApplicationAttempt(
      ApplicationAttemptId applicationAttemptId) {
    return super.getApplicationAttempt(applicationAttemptId);
  }

  @Lock(Lock.NoLock.class)
  public FiCaSchedulerNode getNode(NodeId nodeId) {
    return nodes.get(nodeId);
  }

  @Lock(Lock.NoLock.class)
  Map<NodeId, FiCaSchedulerNode> getAllNodes() {
    return nodes;
  }

  @Override
  @Lock(Lock.NoLock.class)
  public void recover(RMState state) throws Exception {
    // NOT IMPLEMENTED
  }

  @Override
  public void dropContainerReservation(RMContainer container) {
    if (LOG.isDebugEnabled()) {
      LOG.debug("DROP_RESERVATION:" + container.toString());
    }
    completedContainer(container,
        SchedulerUtils.createAbnormalContainerStatus(
            container.getContainerId(),
            SchedulerUtils.UNRESERVED_CONTAINER),
        RMContainerEventType.KILL);
  }

  @Override
  public void preemptContainer(ApplicationAttemptId aid, RMContainer cont) {
    if (LOG.isDebugEnabled()) {
      LOG.debug("PREEMPT_CONTAINER: application:" + aid.toString()
          + " container: " + cont.toString());
    }
    FiCaSchedulerApp app = getApplicationAttempt(aid);
    if (app != null) {
      app.addPreemptContainer(cont.getContainerId());
    }
  }

  @Override
  public void killContainer(RMContainer cont) {
    if (LOG.isDebugEnabled()) {
      LOG.debug("KILL_CONTAINER: container" + cont.toString());
    }
    recoverResourceRequestForContainer(cont);
    completedContainer(cont, SchedulerUtils.createPreemptedContainerStatus(
        cont.getContainerId(), SchedulerUtils.PREEMPTED_CONTAINER),
        RMContainerEventType.KILL);
  }

  @Override
  public synchronized boolean checkAccess(UserGroupInformation callerUGI,
      QueueACL acl, String queueName) {
    CSQueue queue = getQueue(queueName);
    if (queue == null) {
      if (LOG.isDebugEnabled()) {
        LOG.debug("ACL not found for queue access-type " + acl
            + " for queue " + queueName);
      }
      return false;
    }
    return queue.hasAccess(acl, callerUGI);
  }

  @Override
  public List<ApplicationAttemptId> getAppsInQueue(String queueName) {
    CSQueue queue = queues.get(queueName);
    if (queue == null) {
      return null;
    }
    List<ApplicationAttemptId> apps = new ArrayList<ApplicationAttemptId>();
    queue.collectSchedulerApplications(apps);
    return apps;
  }

  private CapacitySchedulerConfiguration loadCapacitySchedulerConfiguration(
      Configuration configuration) throws IOException {
    try {
      InputStream csStream = this.rmContext.getConfigurationProvider()
          .getConfigurationInputStream(configuration,
              YarnConfiguration.CS_CONFIGURATION_FILE);
      if (csStream != null) {
        configuration.addResource(csStream);
        return new CapacitySchedulerConfiguration(configuration, false);
      }
      return new CapacitySchedulerConfiguration(configuration, true);
    } catch (Exception e) {
      throw new IOException(e);
    }
  }

  private synchronized String resolveReservationQueueName(String queueName,
      ApplicationId applicationId, ReservationId reservationID) {
    CSQueue queue = getQueue(queueName);
    if ((queue == null) || !(queue instanceof PlanQueue)) {
      return queueName;
    }
    if (reservationID != null) {
      String resQName = reservationID.toString();
      queue = getQueue(resQName);
      if (queue == null) {
        String msg = "Application " + applicationId
            + " submitted to a reservation which is not yet currently active: "
            + resQName;
        this.rmContext.getDispatcher().getEventHandler()
            .handle(new RMAppRejectedEvent(applicationId, msg));
        return null;
      }
      if (!queue.getParent().getQueueName().equals(queueName)) {
        String msg = "Application: " + applicationId + " submitted to a reservation "
            + resQName + " which does not belong to the specified queue: "
            + queueName;
        this.rmContext.getDispatcher().getEventHandler()
            .handle(new RMAppRejectedEvent(applicationId, msg));
        return null;
      }
      queueName = resQName;
    } else {
      queueName = queueName + ReservationConstants.DEFAULT_QUEUE_SUFFIX;
    }
    return queueName;
  }

  @Override
  public synchronized void removeQueue(String queueName)
      throws SchedulerDynamicEditException {
    LOG.info("Removing queue: " + queueName);
    CSQueue q = this.getQueue(queueName);
    if (!(q instanceof ReservationQueue)) {
      throw new SchedulerDynamicEditException("The queue that we are asked "
          + "to remove (" + queueName + ") is not a ReservationQueue");
    }
    ReservationQueue disposableLeafQueue = (ReservationQueue) q;
    if (disposableLeafQueue.getNumApplications() > 0) {
      throw new SchedulerDynamicEditException("The queue " + queueName
          + " is not empty " + disposableLeafQueue.getApplications().size()
          + " active apps " + disposableLeafQueue.pendingApplications.size()
          + " pending apps");
    }
    ((PlanQueue) disposableLeafQueue.getParent()).removeChildQueue(q);
    this.queues.remove(queueName);
    LOG.info("Removal of ReservationQueue " + queueName + " has succeeded");
  }

  @Override
  public synchronized void addQueue(Queue queue)
      throws SchedulerDynamicEditException {
    if (!(queue instanceof ReservationQueue)) {
      throw new SchedulerDynamicEditException("Queue " + queue.getQueueName()
          + " is not a ReservationQueue");
    }
    ReservationQueue newQueue = (ReservationQueue) queue;
    if (newQueue.getParent() == null
        || !(newQueue.getParent() instanceof PlanQueue)) {
      throw new SchedulerDynamicEditException("ParentQueue for "
          + newQueue.getQueueName()
          + " is not properly set (should be set and be a PlanQueue)");
    }
    PlanQueue parentPlan = (PlanQueue) newQueue.getParent();
    String queuename = newQueue.getQueueName();
    parentPlan.addChildQueue(newQueue);
    this.queues.put(queuename, newQueue);
    LOG.info("Creation of ReservationQueue " + newQueue + " succeeded");
  }

  @Override
  public synchronized void setEntitlement(String inQueue,
      QueueEntitlement entitlement) throws SchedulerDynamicEditException,
      YarnException {
    LeafQueue queue = getAndCheckLeafQueue(inQueue);
    ParentQueue parent = (ParentQueue) queue.getParent();
    if (!(queue instanceof ReservationQueue)) {
      throw new SchedulerDynamicEditException("Entitlement can not be"
          + " modified dynamically since queue " + inQueue
          + " is not a ReservationQueue");
    }
    if (!(parent instanceof PlanQueue)) {
      throw new SchedulerDynamicEditException("The parent of ReservationQueue "
          + inQueue + " must be an PlanQueue");
    }
    ReservationQueue newQueue = (ReservationQueue) queue;
    float sumChilds = ((PlanQueue) parent).sumOfChildCapacities();
    float newChildCap = sumChilds - queue.getCapacity() + entitlement.getCapacity();
    if (newChildCap >= 0 && newChildCap < 1.0f + CSQueueUtils.EPSILON) {
      if (Math.abs(entitlement.getCapacity() - queue.getCapacity()) == 0
          && Math.abs(entitlement.getMaxCapacity() - queue.getMaximumCapacity()) == 0) {
        return;
      }
      newQueue.setEntitlement(entitlement);
    } else {
      throw new SchedulerDynamicEditException(
          "Sum of child queues would exceed 100% for PlanQueue: "
              + parent.getQueueName());
    }
    LOG.info("Set entitlement for ReservationQueue " + inQueue + "  to "
        + queue.getCapacity() + " request was (" + entitlement.getCapacity() + ")");
  }

  @Override
  public synchronized String moveApplication(ApplicationId appId,
      String targetQueueName) throws YarnException {
    FiCaSchedulerApp app =
        getApplicationAttempt(ApplicationAttemptId.newInstance(appId, 0));
    String sourceQueueName = app.getQueue().getQueueName();
    LeafQueue source = getAndCheckLeafQueue(sourceQueueName);
    String destQueueName = handleMoveToPlanQueue(targetQueueName);
    LeafQueue dest = getAndCheckLeafQueue(destQueueName);
    String user = app.getUser();
    try {
      dest.submitApplication(appId, user, destQueueName);
    } catch (AccessControlException e) {
      throw new YarnException(e);
    }
    for (RMContainer rmContainer : app.getLiveContainers()) {
      source.detachContainer(clusterResource, app, rmContainer);
      dest.attachContainer(clusterResource, app, rmContainer);
    }
    source.finishApplicationAttempt(app, sourceQueueName);
    source.getParent().finishApplication(appId, app.getUser());
    app.move(dest);
    dest.submitApplicationAttempt(app, user);
    applications.get(appId).setQueue(dest);
    LOG.info("App: " + app.getApplicationId() + " successfully moved from "
        + sourceQueueName + " to: " + destQueueName);
    return targetQueueName;
  }

  private LeafQueue getAndCheckLeafQueue(String queue) throws YarnException {
    CSQueue ret = this.getQueue(queue);
    if (ret == null) {
      throw new YarnException("The specified Queue: " + queue
          + " doesn't exist");
    }
    if (!(ret instanceof LeafQueue)) {
      throw new YarnException("The specified Queue: " + queue
          + " is not a Leaf Queue. Move is supported only for Leaf Queues.");
    }
    return (LeafQueue) ret;
  }

  @Override
  public EnumSet<SchedulerResourceTypes> getSchedulingResourceTypes() {
    if (calculator.getClass().getName()
        .equals(DefaultResourceCalculator.class.getName())) {
      return EnumSet.of(SchedulerResourceTypes.MEMORY);
    }
    return EnumSet.of(SchedulerResourceTypes.MEMORY, SchedulerResourceTypes.CPU);
  }

  @Override
  public Resource getMaximumResourceCapability(String queueName) {
    CSQueue queue = getQueue(queueName);
    if (queue == null) {
      LOG.error("Unknown queue: " + queueName);
      return getMaximumResourceCapability();
    }
    if (!(queue instanceof LeafQueue)) {
      LOG.error("queue " + queueName + " is not an leaf queue");
      return getMaximumResourceCapability();
    }
    return ((LeafQueue) queue).getMaximumAllocation();
  }

  private String handleMoveToPlanQueue(String targetQueueName) {
    CSQueue dest = getQueue(targetQueueName);
    if (dest instanceof PlanQueue) {
      targetQueueName = targetQueueName + ReservationConstants.DEFAULT_QUEUE_SUFFIX;
    }
    return targetQueueName;
  }

  @Override
  public Set<String> getPlanQueues() {
    Set<String> ret = new HashSet<String>();
    for (Entry<String, CSQueue> entry : queues.entrySet()) {
      if (entry.getValue() instanceof PlanQueue) {
        ret.add(entry.getKey());
      }
    }
    return ret;
  }
}