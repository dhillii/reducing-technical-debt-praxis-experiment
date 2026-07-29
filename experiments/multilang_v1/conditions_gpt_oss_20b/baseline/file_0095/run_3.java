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
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package org.apache.hadoop.yarn.server.resourcemanager.scheduler.fair;

import java.io.IOException;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.apache.hadoop.classification.InterfaceAudience.LimitedPrivate;
import org.apache.hadoop.classification.InterfaceStability.Unstable;
import org.apache.hadoop.conf.Configuration;
import org.apache.hadoop.security.UserGroupInformation;
import org.apache.hadoop.yarn.api.records.ApplicationAttemptId;
import org.apache.hadoop.yarn.api.records.ApplicationId;
import org.apache.hadoop.yarn.api.records.Container;
import org.apache.hadoop.yarn.api.records.ContainerId;
import org.apache.hadoop.yarn.api.records.ContainerStatus;
import org.apache.hadoop.yarn.api.records.NodeId;
import org.apache.hadoop.yarn.api.records.Priority;
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
import org.apache.hadoop.yarn.server.resourcemanager.RMContext;
import org.apache.hadoop.yarn.server.resourcemanager.recovery.RMStateStore.RMState;
import org.apache.hadoop.yarn.server.resourcemanager.reservation.ReservationConstants;
import org.apache.hadoop.yarn.server.resourcemanager.resource.ResourceWeights;
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
import org.apache.hadoop.yarn.server.resourcemanager.scheduler.ActiveUsersManager;
import org.apache.hadoop.yarn.server.resourcemanager.scheduler.Allocation;
import org.apache.hadoop.yarn.server.resourcemanager.scheduler.QueueMetrics;
import org.apache.hadoop.yarn.server.resourcemanager.scheduler.SchedulerApplication;
import org.apache.hadoop.yarn.server.resourcemanager.scheduler.SchedulerApplicationAttempt.ContainersAndNMTokensAllocation;
import org.apache.hadoop.yarn.server.resourcemanager.scheduler.SchedulerUtils;
import org.apache.hadoop.yarn.server.resourcemanager.scheduler.common.QueueEntitlement;
import org.apache.hadoop.yarn.server.resourcemanager.scheduler.event.AppAddedSchedulerEvent;
import org.apache.hadoop.yarn.server.resourcemanager.scheduler.event.AppAttemptAddedSchedulerEvent;
import org.apache.hadoop.yarn.server.resourcemanager.scheduler.event.AppAttemptRemovedSchedulerEvent;
import org.apache.hadoop.yarn.server.resourcemanager.scheduler.event.AppRemovedSchedulerEvent;
import org.apache.hadoop.yarn.server.resourcemanager.scheduler.event.ContainerExpiredSchedulerEvent;
import org.apache.hadoop.yarn.server.resourcemanager.scheduler.event.NodeAddedSchedulerEvent;
import org.apache.hadoop.yarn.server.resourcemanager.scheduler.event.NodeRemovedSchedulerEvent;
import org.apache.hadoop.yarn.server.resourcemanager.scheduler.event.NodeResourceUpdateSchedulerEvent;
import org.apache.hadoop.yarn.server.resourcemanager.scheduler.event.NodeUpdateSchedulerEvent;
import org.apache.hadoop.yarn.server.resourcemanager.scheduler.event.SchedulerEvent;
import org.apache.hadoop.yarn.server.resourcemanager.security.RMContainerTokenSecretManager;
import org.apache.hadoop.yarn.util.Clock;
import org.apache.hadoop.yarn.util.SystemClock;
import org.apache.hadoop.yarn.util.resource.DefaultResourceCalculator;
import org.apache.hadoop.yarn.util.resource.DominantResourceCalculator;
import org.apache.hadoop.yarn.util.resource.ResourceCalculator;
import org.apache.hadoop.yarn.util.resource.Resources;

import com.google.common.annotations.VisibleForTesting;
import com.google.common.base.Preconditions;

/**
 * A scheduler that schedules resources between a set of queues. The scheduler
 * keeps track of the resources used by each queue, and attempts to maintain
 * fairness by scheduling tasks at queues whose allocations are farthest below
 * an ideal fair distribution.
 *
 * The fair scheduler supports hierarchical queues. All queues descend from a
 * queue named "root". Available resources are distributed among the children
 * of the root queue in the typical fair scheduling fashion. Then, the children
 * distribute the resources assigned to them to their children in the same
 * fashion.  Applications may only be scheduled on leaf queues. Queues can be
 * specified as children of other queues by placing them as sub-elements of their
 * parents in the fair scheduler configuration file.
 *
 * A queue's name starts with the names of its parents, with periods as
 * separators.  So a queue named "queue1" under the root named, would be
 * referred to as "root.queue1", and a queue named "queue2" under a queue
 * named "parent1" would be referred to as "root.parent1.queue2".
 */
@LimitedPrivate("yarn")
@Unstable
@SuppressWarnings("unchecked")
public class FairScheduler extends
    AbstractYarnScheduler<FSAppAttempt, FSSchedulerNode> {
  private FairSchedulerConfiguration conf;

  private Resource incrAllocation;
  private QueueManager queueMgr;
  private volatile Clock clock;
  private boolean usePortForNodeName;

  private static final Log LOG = LogFactory.getLog(FairScheduler.class);

  private static final ResourceCalculator RESOURCE_CALCULATOR =
      new DefaultResourceCalculator();
  private static final ResourceCalculator DOMINANT_RESOURCE_CALCULATOR =
      new DominantResourceCalculator();

  // Value that container assignment methods return when a container is
  // reserved
  public static final Resource CONTAINER_RESERVED = Resources.createResource(-1);

  // How often fair shares are re-calculated (ms)
  protected long updateInterval;
  private final int UPDATE_DEBUG_FREQUENCY = 5;
  private int updatesToSkipForDebug = UPDATE_DEBUG_FREQUENCY;

  @VisibleForTesting
  Thread updateThread;

  @VisibleForTesting
  Thread schedulingThread;
  // timeout to join when we stop this service
  protected final long THREAD_JOIN_TIMEOUT_MS = 1000;

  // Aggregate metrics
  FSQueueMetrics rootMetrics;
  FSOpDurations fsOpDurations;

  // Time when we last updated preemption vars
  protected long lastPreemptionUpdateTime;
  // Time we last ran preemptTasksIfNecessary
  private long lastPreemptCheckTime;

  // Preemption related variables
  protected boolean preemptionEnabled;
  protected float preemptionUtilizationThreshold;

  // How often tasks are preempted
  protected long preemptionInterval;

  // ms to wait before force killing stuff (must be longer than a couple
  // of heartbeats to give task-kill commands a chance to act).
  protected long waitTimeBeforeKill;

  // Containers whose AMs have been warned that they will be preempted soon.
  private List<RMContainer> warnedContainers = new ArrayList<RMContainer>();

  protected boolean sizeBasedWeight; // Give larger weights to larger jobs
  protected WeightAdjuster weightAdjuster; // Can be null for no weight adjuster
  protected boolean continuousSchedulingEnabled; // Continuous Scheduling enabled or not
  protected int continuousSchedulingSleepMs; // Sleep time for each pass in continuous scheduling
  private Comparator<NodeId> nodeAvailableResourceComparator =
          new NodeAvailableResourceComparator(); // Node available resource comparator
  protected double nodeLocalityThreshold; // Cluster threshold for node locality
  protected double rackLocalityThreshold; // Cluster threshold for rack locality
  protected long nodeLocalityDelayMs; // Delay for node locality
  protected long rackLocalityDelayMs; // Delay for rack locality
  private FairSchedulerEventLog eventLog; // Machine-readable event log
  protected boolean assignMultiple; // Allocate multiple containers per
                                    // heartbeat
  protected int maxAssign; // Max containers to assign per heartbeat

  @VisibleForTesting
  final MaxRunningAppsEnforcer maxRunningEnforcer;

  private AllocationFileLoaderService allocsLoader;
  @VisibleForTesting
  AllocationConfiguration allocConf;

  public FairScheduler() {
    super(FairScheduler.class.getName());
    clock = new SystemClock();
    allocsLoader = new AllocationFileLoaderService();
    queueMgr = new QueueManager(this);
    maxRunningEnforcer = new MaxRunningAppsEnforcer(this);
  }

  private void validateConf(Configuration conf) {
    int minMem = conf.getInt(
        YarnConfiguration.RM_SCHEDULER_MINIMUM_ALLOCATION_MB,
        YarnConfiguration.DEFAULT_RM_SCHEDULER_MINIMUM_ALLOCATION_MB);
    int maxMem = conf.getInt(
        YarnConfiguration.RM_SCHEDULER_MAXIMUM_ALLOCATION_MB,
        YarnConfiguration.DEFAULT_RM_SCHEDULER_MAXIMUM_ALLOCATION_MB);

    if (minMem < 0 || minMem > maxMem) {
      throw new YarnRuntimeException("Invalid resource scheduler memory"
          + " allocation configuration"
          + ", " + YarnConfiguration.RM_SCHEDULER_MINIMUM_ALLOCATION_MB
          + "=" + minMem
          + ", " + YarnConfiguration.RM_SCHEDULER_MAXIMUM_ALLOCATION_MB
          + "=" + maxMem + ", min should equal greater than 0"
          + ", max should be no smaller than min.");
    }

    int minVcores = conf.getInt(
        YarnConfiguration.RM_SCHEDULER_MINIMUM_ALLOCATION_VCORES,
        YarnConfiguration.DEFAULT_RM_SCHEDULER_MINIMUM_ALLOCATION_VCORES);
    int maxVcores = conf.getInt(
        YarnConfiguration.RM_SCHEDULER_MAXIMUM_ALLOCATION_VCORES,
        YarnConfiguration.DEFAULT_RM_SCHEDULER_MAXIMUM_ALLOCATION_VCORES);

    if (minVcores < 0 || minVcores > maxVcores) {
      throw new YarnRuntimeException("Invalid resource scheduler vcores"
          + " allocation configuration"
          + ", " + YarnConfiguration.RM_SCHEDULER_MINIMUM_ALLOCATION_VCORES
          + "=" + minVcores
          + ", " + YarnConfiguration.RM_SCHEDULER_MAXIMUM_ALLOCATION_VCORES
          + "=" + maxVcores + ", min should equal greater than 0"
          + ", max should be no smaller than min.");
    }
  }

  public FairSchedulerConfiguration getConf() {
    return conf;
  }

  public QueueManager getQueueManager() {
    return queueMgr;
  }

  private class UpdateThread extends Thread {
    @Override
    public void run() {
      while (!Thread.currentThread().isInterrupted()) {
        try {
          Thread.sleep(updateInterval);
          long start = getClock().getTime();
          update();
          preemptTasksIfNecessary();
          long duration = getClock().getTime() - start;
          fsOpDurations.addUpdateThreadRunDuration(duration);
        } catch (InterruptedException ie) {
          LOG.warn("Update thread interrupted. Exiting.");
          return;
        } catch (Exception e) {
          LOG.error("Exception in fair scheduler UpdateThread", e);
        }
      }
    }
  }

  private class ContinuousSchedulingThread extends Thread {
    @Override
    public void run() {
      while (!Thread.currentThread().isInterrupted()) {
        try {
          continuousSchedulingAttempt();
          Thread.sleep(getContinuousSchedulingSleepMs());
        } catch (InterruptedException e) {
          LOG.warn("Continuous scheduling thread interrupted. Exiting.", e);
          return;
        }
      }
    }
  }

  protected synchronized void update() {
    long start = getClock().getTime();
    updateStarvationStats();
    FSQueue rootQueue = queueMgr.getRootQueue();
    rootQueue.updateDemand();
    rootQueue.setFairShare(clusterResource);
    rootQueue.recomputeShares();
    updateRootQueueMetrics();
    logDebugUpdateInfo();
    long duration = getClock().getTime() - start;
    fsOpDurations.addUpdateCallDuration(duration);
  }

  private void logDebugUpdateInfo() {
    if (LOG.isDebugEnabled()) {
      if (--updatesToSkipForDebug < 0) {
        updatesToSkipForDebug = UPDATE_DEBUG_FREQUENCY;
        LOG.debug("Cluster Capacity: " + clusterResource +
            "  Allocations: " + rootMetrics.getAllocatedResources() +
            "  Availability: " + Resource.newInstance(
            rootMetrics.getAvailableMB(),
            rootMetrics.getAvailableVirtualCores()) +
            "  Demand: " + queueMgr.getRootQueue().getDemand());
      }
    }
  }

  private void updateStarvationStats() {
    lastPreemptionUpdateTime = clock.getTime();
    for (FSLeafQueue sched : queueMgr.getLeafQueues()) {
      sched.updateStarvationStats();
    }
  }

  protected synchronized void preemptTasksIfNecessary() {
    if (!shouldAttemptPreemption()) {
      return;
    }

    long curTime = getClock().getTime();
    if (curTime - lastPreemptCheckTime < preemptionInterval) {
      return;
    }
    lastPreemptCheckTime = curTime;

    Resource resToPreempt = Resources.clone(Resources.none());
    for (FSLeafQueue sched : queueMgr.getLeafQueues()) {
      Resources.addTo(resToPreempt, resToPreempt(sched, curTime));
    }
    if (Resources.greaterThan(RESOURCE_CALCULATOR, clusterResource, resToPreempt,
        Resources.none())) {
      preemptResources(resToPreempt);
    }
  }

  protected void preemptResources(Resource toPreempt) {
    long start = getClock().getTime();
    if (Resources.equals(toPreempt, Resources.none())) {
      return;
    }

    handleWarnedContainers(toPreempt);
    resetPreemptedResources();

    try {
      performPreemptionLoop(toPreempt);
    } finally {
      clearPreemptedResources();
    }

    long duration = getClock().getTime() - start;
    fsOpDurations.addPreemptCallDuration(duration);
  }

  private void handleWarnedContainers(Resource toPreempt) {
    Iterator<RMContainer> warnedIter = warnedContainers.iterator();
    while (warnedIter.hasNext()) {
      RMContainer container = warnedIter.next();
      if ((container.getState() == RMContainerState.RUNNING ||
              container.getState() == RMContainerState.ALLOCATED) &&
          Resources.greaterThan(RESOURCE_CALCULATOR, clusterResource,
              toPreempt, Resources.none())) {
        warnOrKillContainer(container);
        Resources.subtractFrom(toPreempt, container.getContainer().getResource());
      } else {
        warnedIter.remove();
      }
    }
  }

  private void resetPreemptedResources() {
    for (FSLeafQueue queue : getQueueManager().getLeafQueues()) {
      queue.resetPreemptedResources();
    }
  }

  private void performPreemptionLoop(Resource toPreempt) {
    while (Resources.greaterThan(RESOURCE_CALCULATOR, clusterResource,
        toPreempt, Resources.none())) {
      RMContainer container =
          getQueueManager().getRootQueue().preemptContainer();
      if (container == null) {
        break;
      }
      warnOrKillContainer(container);
      warnedContainers.add(container);
      Resources.subtractFrom(
          toPreempt, container.getContainer().getResource());
    }
  }

  private void clearPreemptedResources() {
    for (FSLeafQueue queue : getQueueManager().getLeafQueues()) {
      queue.clearPreemptedResources();
    }
  }

  protected void warnOrKillContainer(RMContainer container) {
    ApplicationAttemptId appAttemptId = container.getApplicationAttemptId();
    FSAppAttempt app = getSchedulerApp(appAttemptId);
    FSLeafQueue queue = app.getQueue();
    LOG.info("Preempting container (prio=" + container.getContainer().getPriority() +
        "res=" + container.getContainer().getResource() +
        ") from queue " + queue.getName());

    Long time = app.getContainerPreemptionTime(container);

    if (time != null) {
      if (time + waitTimeBeforeKill < getClock().getTime()) {
        ContainerStatus status =
          SchedulerUtils.createPreemptedContainerStatus(
            container.getContainerId(), SchedulerUtils.PREEMPTED_CONTAINER);

        recoverResourceRequestForContainer(container);
        completedContainer(container, status, RMContainerEventType.KILL);
        LOG.info("Killing container" + container +
            " (after waiting for premption for " +
            (getClock().getTime() - time) + "ms)");
      }
    } else {
      app.addPreemption(container, getClock().getTime());
    }
  }

  protected Resource resToPreempt(FSLeafQueue sched, long curTime) {
    long minShareTimeout = sched.getMinSharePreemptionTimeout();
    long fairShareTimeout = sched.getFairSharePreemptionTimeout();
    Resource resDueToMinShare = Resources.none();
    Resource resDueToFairShare = Resources.none();
    if (curTime - sched.getLastTimeAtMinShare() > minShareTimeout) {
      Resource target = Resources.min(RESOURCE_CALCULATOR, clusterResource,
          sched.getMinShare(), sched.getDemand());
      resDueToMinShare = Resources.max(RESOURCE_CALCULATOR, clusterResource,
          Resources.none(), Resources.subtract(target, sched.getResourceUsage()));
    }
    if (curTime - sched.getLastTimeAtFairShareThreshold() > fairShareTimeout) {
      Resource target = Resources.min(RESOURCE_CALCULATOR, clusterResource,
          sched.getFairShare(), sched.getDemand());
      resDueToFairShare = Resources.max(RESOURCE_CALCULATOR, clusterResource,
          Resources.none(), Resources.subtract(target, sched.getResourceUsage()));
    }
    Resource resToPreempt = Resources.max(RESOURCE_CALCULATOR, clusterResource,
        resDueToMinShare, resDueToFairShare);
    if (Resources.greaterThan(RESOURCE_CALCULATOR, clusterResource,
        resToPreempt, Resources.none())) {
      String message = "Should preempt " + resToPreempt + " res for queue "
          + sched.getName() + ": resDueToMinShare = " + resDueToMinShare
          + ", resDueToFairShare = " + resDueToFairShare;
      LOG.info(message);
    }
    return resToPreempt;
  }

  public synchronized RMContainerTokenSecretManager
      getContainerTokenSecretManager() {
    return rmContext.getContainerTokenSecretManager();
  }

  public synchronized ResourceWeights getAppWeight(FSAppAttempt app) {
    double weight = 1.0;
    if (sizeBasedWeight) {
      weight = Math.log1p(app.getDemand().getMemory()) / Math.log(2);
    }
    weight *= app.getPriority().getPriority();
    if (weightAdjuster != null) {
      weight = weightAdjuster.adjustWeight(app, weight);
    }
    ResourceWeights resourceWeights = app.getResourceWeights();
    resourceWeights.setWeight((float)weight);
    return resourceWeights;
  }

  public Resource getIncrementResourceCapability() {
    return incrAllocation;
  }

  private FSSchedulerNode getFSSchedulerNode(NodeId nodeId) {
    return nodes.get(nodeId);
  }

  public double getNodeLocalityThreshold() {
    return nodeLocalityThreshold;
  }

  public double getRackLocalityThreshold() {
    return rackLocalityThreshold;
  }

  public long getNodeLocalityDelayMs() {
    return nodeLocalityDelayMs;
  }

  public long getRackLocalityDelayMs() {
    return rackLocalityDelayMs;
  }

  public boolean isContinuousSchedulingEnabled() {
    return continuousSchedulingEnabled;
  }

  public synchronized int getContinuousSchedulingSleepMs() {
    return continuousSchedulingSleepMs;
  }

  public Clock getClock() {
    return clock;
  }

  @VisibleForTesting
  void setClock(Clock clock) {
    this.clock = clock;
  }

  public FairSchedulerEventLog getEventLog() {
    return eventLog;
  }

  protected synchronized void addApplication(ApplicationId applicationId,
      String queueName, String user, boolean isAppRecovering) {
    if (queueName == null || queueName.isEmpty()) {
      String message = "Reject application " + applicationId +
              " submitted by user " + user + " with an empty queue name.";
      LOG.info(message);
      rmContext.getDispatcher().getEventHandler()
          .handle(new RMAppRejectedEvent(applicationId, message));
      return;
    }

    if (queueName.startsWith(".") || queueName.endsWith(".")) {
      String message = "Reject application " + applicationId
          + " submitted by user " + user + " with an illegal queue name "
          + queueName + ". "
          + "The queue name cannot start/end with period.";
      LOG.info(message);
      rmContext.getDispatcher().getEventHandler()
          .handle(new RMAppRejectedEvent(applicationId, message));
      return;
    }

    RMApp rmApp = rmContext.getRMApps().get(applicationId);
    FSLeafQueue queue = assignToQueue(rmApp, queueName, user);
    if (queue == null) {
      return;
    }

    UserGroupInformation userUgi = UserGroupInformation.createRemoteUser(user);

    if (!queue.hasAccess(QueueACL.SUBMIT_APPLICATIONS, userUgi)
        && !queue.hasAccess(QueueACL.ADMINISTER_QUEUE, userUgi)) {
      String msg = "User " + userUgi.getUserName() +
              " cannot submit applications to queue " + queue.getName();
      LOG.info(msg);
      rmContext.getDispatcher().getEventHandler()
          .handle(new RMAppRejectedEvent(applicationId, msg));
      return;
    }

    SchedulerApplication<FSAppAttempt> application =
        new SchedulerApplication<FSAppAttempt>(queue, user);
    applications.put(applicationId, application);
    queue.getMetrics().submitApp(user);

    LOG.info("Accepted application " + applicationId + " from user: " + user
        + ", in queue: " + queueName + ", currently num of applications: "
        + applications.size());
    if (isAppRecovering) {
      if (LOG.isDebugEnabled()) {
        LOG.debug(applicationId + " is recovering. Skip notifying APP_ACCEPTED");
      }
    } else {
      rmContext.getDispatcher().getEventHandler()
        .handle(new RMAppEvent(applicationId, RMAppEventType.APP_ACCEPTED));
    }
  }

  protected synchronized void addApplicationAttempt(
      ApplicationAttemptId applicationAttemptId,
      boolean transferStateFromPreviousAttempt,
      boolean isAttemptRecovering) {
    SchedulerApplication<FSAppAttempt> application =
        applications.get(applicationAttemptId.getApplicationId());
    String user = application.getUser();
    FSLeafQueue queue = (FSLeafQueue) application.getQueue();

    FSAppAttempt attempt =
        new FSAppAttempt(this, applicationAttemptId, user,
            queue, new ActiveUsersManager(getRootQueueMetrics()),
            rmContext);
    if (transferStateFromPreviousAttempt) {
      attempt.transferStateFromPreviousAttempt(application
          .getCurrentAppAttempt());
    }
    application.setCurrentAppAttempt(attempt);

    boolean runnable = maxRunningEnforcer.canAppBeRunnable(queue, user);
    queue.addApp(attempt, runnable);
    if (runnable) {
      maxRunningEnforcer.trackRunnableApp(attempt);
    } else {
      maxRunningEnforcer.trackNonRunnableApp(attempt);
    }

    queue.getMetrics().submitAppAttempt(user);

    LOG.info("Added Application Attempt " + applicationAttemptId
        + " to scheduler from user: " + user);

    if (isAttemptRecovering) {
      if (LOG.isDebugEnabled()) {
        LOG.debug(applicationAttemptId
            + " is recovering. Skipping notifying ATTEMPT_ADDED");
      }
    } else {
      rmContext.getDispatcher().getEventHandler().handle(
        new RMAppAttemptEvent(applicationAttemptId,
            RMAppAttemptEventType.ATTEMPT_ADDED));
    }
  }

  @VisibleForTesting
  FSLeafQueue assignToQueue(RMApp rmApp, String queueName, String user) {
    FSLeafQueue queue = null;
    String appRejectMsg = null;

    try {
      QueuePlacementPolicy placementPolicy = allocConf.getPlacementPolicy();
      queueName = placementPolicy.assignAppToQueue(queueName, user);
      if (queueName == null) {
        appRejectMsg = "Application rejected by queue placement policy";
      } else {
        queue = queueMgr.getLeafQueue(queueName, true);
        if (queue == null) {
          appRejectMsg = queueName + " is not a leaf queue";
        }
      }
    } catch (IOException ioe) {
      appRejectMsg = "Error assigning app to queue " + queueName;
    }

    if (appRejectMsg != null && rmApp != null) {
      LOG.error(appRejectMsg);
      rmContext.getDispatcher().getEventHandler().handle(
          new RMAppRejectedEvent(rmApp.getApplicationId(), appRejectMsg));
      return null;
    }

    if (rmApp != null) {
      rmApp.setQueue(queue.getName());
    } else {
      LOG.error("Couldn't find RM app to set queue name on");
    }
    return queue;
  }

  private synchronized void removeApplication(ApplicationId applicationId,
      RMAppState finalState) {
    SchedulerApplication<FSAppAttempt> application =
        applications.get(applicationId);
    if (application == null){
      LOG.warn("Couldn't find application " + applicationId);
      return;
    }
    application.stop(finalState);
    applications.remove(applicationId);
  }

  private synchronized void removeApplicationAttempt(
      ApplicationAttemptId applicationAttemptId,
      RMAppAttemptState rmAppAttemptFinalState, boolean keepContainers) {
    LOG.info("Application " + applicationAttemptId + " is done." +
        " finalState=" + rmAppAttemptFinalState);
    SchedulerApplication<FSAppAttempt> application =
        applications.get(applicationAttemptId.getApplicationId());
    FSAppAttempt attempt = getSchedulerApp(applicationAttemptId);

    if (attempt == null || application == null) {
      LOG.info("Unknown application " + applicationAttemptId + " has completed!");
      return;
    }

    for (RMContainer rmContainer : attempt.getLiveContainers()) {
      if (keepContainers
          && rmContainer.getState().equals(RMContainerState.RUNNING)) {
        LOG.info("Skip killing " + rmContainer.getContainerId());
        continue;
      }
      completedContainer(rmContainer,
          SchedulerUtils.createAbnormalContainerStatus(
              rmContainer.getContainerId(),
              SchedulerUtils.COMPLETED_APPLICATION),
              RMContainerEventType.KILL);
    }

    for (RMContainer rmContainer : attempt.getReservedContainers()) {
      completedContainer(rmContainer,
          SchedulerUtils.createAbnormalContainerStatus(
              rmContainer.getContainerId(),
              "Application Complete"),
              RMContainerEventType.KILL);
    }
    attempt.stop(rmAppAttemptFinalState);

    FSLeafQueue queue = queueMgr.getLeafQueue(attempt.getQueue()
        .getQueueName(), false);
    boolean wasRunnable = queue.removeApp(attempt);

    if (wasRunnable) {
      maxRunningEnforcer.untrackRunnableApp(attempt);
      maxRunningEnforcer.updateRunnabilityOnAppRemoval(attempt,
          attempt.getQueue());
    } else {
      maxRunningEnforcer.untrackNonRunnableApp(attempt);
    }
  }

  @Override
  protected synchronized void completedContainer(RMContainer rmContainer,
      ContainerStatus containerStatus, RMContainerEventType event) {
    if (rmContainer == null) {
      LOG.info("Null container completed...");
      return;
    }

    Container container = rmContainer.getContainer();

    FSAppAttempt application =
        getCurrentAttemptForContainer(container.getId());
    ApplicationId appId =
        container.getId().getApplicationAttemptId().getApplicationId();
    if (application == null) {
      LOG.info("Container " + container + " of" +
          " unknown application attempt " + appId +
          " completed with event " + event);
      return;
    }

    FSSchedulerNode node = getFSSchedulerNode(container.getNodeId());

    if (rmContainer.getState() == RMContainerState.RESERVED) {
      application.unreserve(rmContainer.getReservedPriority(), node);
    } else {
      application.containerCompleted(rmContainer, containerStatus, event);
      node.releaseContainer(container);
      updateRootQueueMetrics();
    }

    LOG.info("Application attempt " + application.getApplicationAttemptId()
        + " released container " + container.getId() + " on node: " + node
        + " with event: " + event);
  }

  private synchronized void addNode(RMNode node) {
    FSSchedulerNode schedulerNode = new FSSchedulerNode(node, usePortForNodeName);
    nodes.put(node.getNodeID(), schedulerNode);
    Resources.addTo(clusterResource, node.getTotalCapability());
    updateRootQueueMetrics();
    updateMaximumAllocation(schedulerNode, true);

    queueMgr.getRootQueue().setSteadyFairShare(clusterResource);
    queueMgr.getRootQueue().recomputeSteadyShares();
    LOG.info("Added node " + node.getNodeAddress() +
        " cluster capacity: " + clusterResource);
  }

  private synchronized void removeNode(RMNode rmNode) {
    FSSchedulerNode node = getFSSchedulerNode(rmNode.getNodeID());
    if (node == null) {
      return;
    }
    Resources.subtractFrom(clusterResource, rmNode.getTotalCapability());
    updateRootQueueMetrics();

    List<RMContainer> runningContainers = node.getRunningContainers();
    for (RMContainer container : runningContainers) {
      completedContainer(container,
          SchedulerUtils.createAbnormalContainerStatus(
              container.getContainerId(),
              SchedulerUtils.LOST_CONTAINER),
          RMContainerEventType.KILL);
    }

    RMContainer reservedContainer = node.getReservedContainer();
    if (reservedContainer != null) {
      completedContainer(reservedContainer,
          SchedulerUtils.createAbnormalContainerStatus(
              reservedContainer.getContainerId(),
              SchedulerUtils.LOST_CONTAINER),
          RMContainerEventType.KILL);
    }

    nodes.remove(rmNode.getNodeID());
    queueMgr.getRootQueue().setSteadyFairShare(clusterResource);
    queueMgr.getRootQueue().recomputeSteadyShares();
    updateMaximumAllocation(node, false);
    LOG.info("Removed node " + rmNode.getNodeAddress() +
        " cluster capacity: " + clusterResource);
  }

  @Override
  public Allocation allocate(ApplicationAttemptId appAttemptId,
      List<ResourceRequest> ask, List<ContainerId> release,
      List<String> blacklistAdditions, List<String> blacklistRemovals) {

    FSAppAttempt application = getSchedulerApp(appAttemptId);
    if (application == null) {
      LOG.info("Calling allocate on removed " +
          "or non existant application " + appAttemptId);
      return EMPTY_ALLOCATION;
    }

    SchedulerUtils.normalizeRequests(ask, DOMINANT_RESOURCE_CALCULATOR,
        clusterResource, minimumAllocation, getMaximumResourceCapability(),
        incrAllocation);

    if (!application.getUnmanagedAM() && ask.size() == 1
        && application.getLiveContainers().isEmpty()) {
      application.setAMResource(ask.get(0).getCapability());
    }

    releaseContainers(release, application);

    synchronized (application) {
      if (!ask.isEmpty()) {
        if (LOG.isDebugEnabled()) {
          LOG.debug("allocate: pre-update" +
              " applicationAttemptId=" + appAttemptId +
              " application=" + application.getApplicationId());
        }
        application.showRequests();

        application.updateResourceRequests(ask);

        application.showRequests();
      }

      if (LOG.isDebugEnabled()) {
        LOG.debug("allocate: post-update" +
            " applicationAttemptId=" + appAttemptId +
            " #ask=" + ask.size() +
            " reservation= " + application.getCurrentReservation());

        LOG.debug("Preempting " + application.getPreemptionContainers().size()
            + " container(s)");
      }

      Set<ContainerId> preemptionContainerIds = new HashSet<ContainerId>();
      for (RMContainer container : application.getPreemptionContainers()) {
        preemptionContainerIds.add(container.getContainerId());
      }

      application.updateBlacklist(blacklistAdditions, blacklistRemovals);
      ContainersAndNMTokensAllocation allocation =
          application.pullNewlyAllocatedContainersAndNMTokens();
      Resource headroom = application.getHeadroom();
      application.setApplicationHeadroomForMetrics(headroom);
      return new Allocation(allocation.getContainerList(), headroom,
          preemptionContainerIds, null, null, allocation.getNMTokenList());
    }
  }

  private synchronized void nodeUpdate(RMNode nm) {
    long start = getClock().getTime();
    if (LOG.isDebugEnabled()) {
      LOG.debug("nodeUpdate: " + nm + " cluster capacity: " + clusterResource);
    }
    eventLog.log("HEARTBEAT", nm.getHostName());
    FSSchedulerNode node = getFSSchedulerNode(nm.getNodeID());

    List<UpdatedContainerInfo> containerInfoList = nm.pullContainerUpdates();
    List<ContainerStatus> newlyLaunchedContainers = new ArrayList<ContainerStatus>();
    List<ContainerStatus> completedContainers = new ArrayList<ContainerStatus>();
    for(UpdatedContainerInfo containerInfo : containerInfoList) {
      newlyLaunchedContainers.addAll(containerInfo.getNewlyLaunchedContainers());
      completedContainers.addAll(containerInfo.getCompletedContainers());
    }

    for (ContainerStatus launchedContainer : newlyLaunchedContainers) {
      containerLaunchedOnNode(launchedContainer.getContainerId(), node);
    }

    for (ContainerStatus completedContainer : completedContainers) {
      ContainerId containerId = completedContainer.getContainerId();
      LOG.debug("Container FINISHED: " + containerId);
      completedContainer(getRMContainer(containerId),
          completedContainer, RMContainerEventType.FINISHED);
    }

    if (continuousSchedulingEnabled) {
      if (!completedContainers.isEmpty()) {
        attemptScheduling(node);
      }
    } else {
      attemptScheduling(node);
    }

    long duration = getClock().getTime() - start;
    fsOpDurations.addNodeUpdateDuration(duration);
  }

  void continuousSchedulingAttempt() throws InterruptedException {
    long start = getClock().getTime();
    List<NodeId> nodeIdList = new ArrayList<NodeId>(nodes.keySet());
    synchronized (this) {
      Collections.sort(nodeIdList, nodeAvailableResourceComparator);
    }

    for (NodeId nodeId : nodeIdList) {
      FSSchedulerNode node = getFSSchedulerNode(nodeId);
      try {
        if (node != null && Resources.fitsIn(minimumAllocation,
            node.getAvailableResource())) {
          attemptScheduling(node);
        }
      } catch (Throwable ex) {
        LOG.error("Error while attempting scheduling for node " + node +
            ": " + ex.toString(), ex);
      }
    }

    long duration = getClock().getTime() - start;
    fsOpDurations.addContinuousSchedulingRunDuration(duration);
  }

  private class NodeAvailableResourceComparator implements Comparator<NodeId> {
    @Override
    public int compare(NodeId n1, NodeId n2) {
      if (!nodes.containsKey(n1)) {
        return 1;
      }
      if (!nodes.containsKey(n2)) {
        return -1;
      }
      return RESOURCE_CALCULATOR.compare(clusterResource,
              nodes.get(n2).getAvailableResource(),
              nodes.get(n1).getAvailableResource());
    }
  }

  @VisibleForTesting
  synchronized void attemptScheduling(FSSchedulerNode node) {
    if (rmContext.isWorkPreservingRecoveryEnabled()
        && !rmContext.isSchedulerReadyForAllocatingContainers()) {
      return;
    }

    final NodeId nodeID = node.getNodeID();
    if (!nodes.containsKey(nodeID)) {
      LOG.info("Skipping scheduling as the node " + nodeID +
          " has been removed");
      return;
    }

    handleReservation(node);
    if (node.getReservedContainer() == null) {
      scheduleWithoutReservation(node);
    }
    updateRootQueueMetrics();
  }

  private void handleReservation(FSSchedulerNode node) {
    FSAppAttempt reservedAppSchedulable = node.getReservedAppSchedulable();
    if (reservedAppSchedulable != null) {
      Priority reservedPriority = node.getReservedContainer().getReservedPriority();
      FSQueue queue = reservedAppSchedulable.getQueue();

      if (!reservedAppSchedulable.hasContainerForNode(reservedPriority, node)
          || !fitsInMaxShare(queue,
          node.getReservedContainer().getReservedResource())) {
        LOG.info("Releasing reservation that cannot be satisfied for application "
            + reservedAppSchedulable.getApplicationAttemptId()
            + " on node " + node);
        reservedAppSchedulable.unreserve(reservedPriority, node);
        reservedAppSchedulable = null;
      } else {
        if (LOG.isDebugEnabled()) {
          LOG.debug("Trying to fulfill reservation for application "
              + reservedAppSchedulable.getApplicationAttemptId()
              + " on node: " + node);
        }
        node.getReservedAppSchedulable().assignReservedContainer(node);
      }
    }
  }

  private void scheduleWithoutReservation(FSSchedulerNode node) {
    int assignedContainers = 0;
    while (node.getReservedContainer() == null) {
      boolean assignedContainer = false;
      if (!queueMgr.getRootQueue().assignContainer(node).equals(
          Resources.none())) {
        assignedContainers++;
        assignedContainer = true;
      }
      if (!assignedContainer) { break; }
      if (!assignMultiple) { break; }
      if ((assignedContainers >= maxAssign) && (maxAssign > 0)) { break; }
    }
  }

  static boolean fitsInMaxShare(FSQueue queue, Resource
      additionalResource) {
    Resource usagePlusAddition =
        Resources.add(queue.getResourceUsage(), additionalResource);

    if (!Resources.fitsIn(usagePlusAddition, queue.getMaxShare())) {
      return false;
    }

    FSQueue parentQueue = queue.getParent();
    if (parentQueue != null) {
      return fitsInMaxShare(parentQueue, additionalResource);
    }
    return true;
  }

  public FSAppAttempt getSchedulerApp(ApplicationAttemptId appAttemptId) {
    return super.getApplicationAttempt(appAttemptId);
  }

  @Override
  public ResourceCalculator getResourceCalculator() {
    return RESOURCE_CALCULATOR;
  }

  private void updateRootQueueMetrics() {
    rootMetrics.setAvailableResourcesToQueue(
        Resources.subtract(
            clusterResource, rootMetrics.getAllocatedResources()));
  }

  private boolean shouldAttemptPreemption() {
    if (preemptionEnabled) {
      return (preemptionUtilizationThreshold < Math.max(
          (float) rootMetrics.getAllocatedMB() / clusterResource.getMemory(),
          (float) rootMetrics.getAllocatedVirtualCores() /
              clusterResource.getVirtualCores()));
    }
    return false;
  }

  @Override
  public QueueMetrics getRootQueueMetrics() {
    return rootMetrics;
  }

  @Override
  public void handle(SchedulerEvent event) {
    switch (event.getType()) {
    case NODE_ADDED:
      handleNodeAdded((NodeAddedSchedulerEvent)event);
      break;
    case NODE_REMOVED:
      handleNodeRemoved((NodeRemovedSchedulerEvent)event);
      break;
    case NODE_UPDATE:
      handleNodeUpdate((NodeUpdateSchedulerEvent)event);
      break;
    case APP_ADDED:
      handleAppAdded((AppAddedSchedulerEvent) event);
      break;
    case APP_REMOVED:
      handleAppRemoved((AppRemovedSchedulerEvent)event);
      break;
    case NODE_RESOURCE_UPDATE:
      handleNodeResourceUpdate((NodeResourceUpdateSchedulerEvent)event);
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
      LOG.error("Unknown event arrived at FairScheduler: " + event.toString());
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

  private void handleNodeUpdate(NodeUpdateSchedulerEvent event) {
    nodeUpdate(event.getRMNode());
  }

  private void handleAppAdded(AppAddedSchedulerEvent event) {
    String queueName =
        resolveReservationQueueName(event.getQueue(),
            event.getApplicationId(),
            event.getReservationID());
    if (queueName != null) {
      addApplication(event.getApplicationId(),
          queueName, event.getUser(),
          event.getIsAppRecovering());
    }
  }

  private void handleAppRemoved(AppRemovedSchedulerEvent event) {
    removeApplication(event.getApplicationID(),
      event.getFinalState());
  }

  private void handleNodeResourceUpdate(NodeResourceUpdateSchedulerEvent event) {
    updateNodeResource(event.getRMNode(),
          event.getResourceOption());
  }

  private void handleAppAttemptAdded(AppAttemptAddedSchedulerEvent event) {
    addApplicationAttempt(event.getApplicationAttemptId(),
      event.getTransferStateFromPreviousAttempt(),
      event.getIsAttemptRecovering());
  }

  private void handleAppAttemptRemoved(AppAttemptRemovedSchedulerEvent event) {
    removeApplicationAttempt(
        event.getApplicationAttemptID(),
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

  private synchronized String resolveReservationQueueName(String queueName,
      ApplicationId applicationId, ReservationId reservationID) {
    FSQueue queue = queueMgr.getQueue(queueName);
    if ((queue == null) || !allocConf.isReservable(queue.getQueueName())) {
      return queueName;
    }
    queueName = queue.getQueueName();
    if (reservationID != null) {
      String resQName = queueName + "." + reservationID.toString();
      queue = queueMgr.getQueue(resQName);
      if (queue == null) {
        String message =
            "Application "
                + applicationId
                + " submitted to a reservation which is not yet currently active: "
                + resQName;
        this.rmContext.getDispatcher().getEventHandler()
            .handle(new RMAppRejectedEvent(applicationId, message));
        return null;
      }
      if (!queue.getParent().getQueueName().equals(queueName)) {
        String message =
            "Application: " + applicationId + " submitted to a reservation "
                + resQName + " which does not belong to the specified queue: "
                + queueName;
        this.rmContext.getDispatcher().getEventHandler()
            .handle(new RMAppRejectedEvent(applicationId, message));
        return null;
      }
      queueName = resQName;
    } else {
      queueName = getDefaultQueueForPlanQueue(queueName);
    }
    return queueName;
  }

  private String getDefaultQueueForPlanQueue(String queueName) {
    String planName = queueName.substring(queueName.lastIndexOf(".") + 1);
    queueName = queueName + "." + planName + ReservationConstants.DEFAULT_QUEUE_SUFFIX;
    return queueName;
  }

  @Override
  public void recover(RMState state) throws Exception {
    // NOT IMPLEMENTED
  }

  public synchronized void setRMContext(RMContext rmContext) {
    this.rmContext = rmContext;
  }

  private void initScheduler(Configuration conf) throws IOException {
    synchronized (this) {
      this.conf = new FairSchedulerConfiguration(conf);
      validateConf(this.conf);
      minimumAllocation = this.conf.getMinimumAllocation();
      initMaximumResourceCapability(this.conf.getMaximumAllocation());
      incrAllocation = this.conf.getIncrementAllocation();
      continuousSchedulingEnabled = this.conf.isContinuousSchedulingEnabled();
      continuousSchedulingSleepMs =
          this.conf.getContinuousSchedulingSleepMs();
      nodeLocalityThreshold = this.conf.getLocalityThresholdNode();
      rackLocalityThreshold = this.conf.getLocalityThresholdRack();
      nodeLocalityDelayMs = this.conf.getLocalityDelayNodeMs();
      rackLocalityDelayMs = this.conf.getLocalityDelayRackMs();
      preemptionEnabled = this.conf.getPreemptionEnabled();
      preemptionUtilizationThreshold =
          this.conf.getPreemptionUtilizationThreshold();
      assignMultiple = this.conf.getAssignMultiple();
      maxAssign = this.conf.getMaxAssign();
      sizeBasedWeight = this.conf.getSizeBasedWeight();
      preemptionInterval = this.conf.getPreemptionInterval();
      waitTimeBeforeKill = this.conf.getWaitTimeBeforeKill();
      usePortForNodeName = this.conf.getUsePortForNodeName();

      updateInterval = this.conf.getUpdateInterval();
      if (updateInterval < 0) {
        updateInterval = FairSchedulerConfiguration.DEFAULT_UPDATE_INTERVAL_MS;
        LOG.warn(FairSchedulerConfiguration.UPDATE_INTERVAL_MS
            + " is invalid, so using default value " +
            +FairSchedulerConfiguration.DEFAULT_UPDATE_INTERVAL_MS
            + " ms instead");
      }

      rootMetrics = FSQueueMetrics.forQueue("root", null, true, conf);
      fsOpDurations = FSOpDurations.getInstance(true);

      this.applications = new ConcurrentHashMap<
          ApplicationId, SchedulerApplication<FSAppAttempt>>();
      this.eventLog = new FairSchedulerEventLog();
      eventLog.init(this.conf);

      allocConf = new AllocationConfiguration(conf);
      try {
        queueMgr.initialize(conf);
      } catch (Exception e) {
        throw new IOException("Failed to start FairScheduler", e);
      }

      updateThread = new UpdateThread();
      updateThread.setName("FairSchedulerUpdateThread");
      updateThread.setDaemon(true);

      if (continuousSchedulingEnabled) {
        schedulingThread = new ContinuousSchedulingThread();
        schedulingThread.setName("FairSchedulerContinuousScheduling");
        schedulingThread.setDaemon(true);
      }
    }

    allocsLoader.init(conf);
    allocsLoader.setReloadListener(new AllocationReloadListener());
    try {
      allocsLoader.reloadAllocations();
    } catch (Exception e) {
      throw new IOException("Failed to initialize FairScheduler", e);
    }
  }

  private synchronized void startSchedulerThreads() {
    Preconditions.checkNotNull(updateThread, "updateThread is null");
    Preconditions.checkNotNull(allocsLoader, "allocsLoader is null");
    updateThread.start();
    if (continuousSchedulingEnabled) {
      Preconditions.checkNotNull(schedulingThread, "schedulingThread is null");
      schedulingThread.start();
    }
    allocsLoader.start();
  }

  @Override
  public void serviceInit(Configuration conf) throws Exception {
    initScheduler(conf);
    super.serviceInit(conf);
  }

  @Override
  public void serviceStart() throws Exception {
    startSchedulerThreads();
    super.serviceStart();
  }

  @Override
  public void serviceStop() throws Exception {
    synchronized (this) {
      if (updateThread != null) {
        updateThread.interrupt();
        updateThread.join(THREAD_JOIN_TIMEOUT_MS);
      }
      if (continuousSchedulingEnabled) {
        if (schedulingThread != null) {
          schedulingThread.interrupt();
          schedulingThread.join(THREAD_JOIN_TIMEOUT_MS);
        }
      }
      if (allocsLoader != null) {
        allocsLoader.stop();
      }
    }

    super.serviceStop();
  }

  @Override
  public void reinitialize(Configuration conf, RMContext rmContext)
      throws IOException {
    try {
      allocsLoader.reloadAllocations();
    } catch (Exception e) {
      LOG.error("Failed to reload allocations file", e);
    }
  }

  @Override
  public QueueInfo getQueueInfo(String queueName, boolean includeChildQueues,
      boolean recursive) throws IOException {
    if (!queueMgr.exists(queueName)) {
      throw new IOException("queue " + queueName + " does not exist");
    }
    return queueMgr.getQueue(queueName).getQueueInfo(includeChildQueues,
        recursive);
  }

  @Override
  public List<QueueUserACLInfo> getQueueUserAclInfo() {
    UserGroupInformation user;
    try {
      user = UserGroupInformation.getCurrentUser();
    } catch (IOException ioe) {
      return new ArrayList<QueueUserACLInfo>();
    }

    return queueMgr.getRootQueue().getQueueUserAclInfo(user);
  }

  @Override
  public int getNumClusterNodes() {
    return nodes.size();
  }

  @Override
  public synchronized boolean checkAccess(UserGroupInformation callerUGI,
      QueueACL acl, String queueName) {
    FSQueue queue = getQueueManager().getQueue(queueName);
    if (queue == null) {
      if (LOG.isDebugEnabled()) {
        LOG.debug("ACL not found for queue access-type " + acl
            + " for queue " + queueName);
      }
      return false;
    }
    return queue.hasAccess(acl, callerUGI);
  }

  public AllocationConfiguration getAllocationConfiguration() {
    return allocConf;
  }

  private class AllocationReloadListener implements
      AllocationFileLoaderService.Listener {

    @Override
    public void onReload(AllocationConfiguration queueInfo) {
      synchronized (FairScheduler.this) {
        allocConf = queueInfo;
        allocConf.getDefaultSchedulingPolicy().initialize(clusterResource);
        queueMgr.updateAllocationConfiguration(allocConf);
        maxRunningEnforcer.updateRunnabilityOnReload();
      }
    }
  }

  @Override
  public List<ApplicationAttemptId> getAppsInQueue(String queueName) {
    FSQueue queue = queueMgr.getQueue(queueName);
    if (queue == null) {
      return null;
    }
    List<ApplicationAttemptId> apps = new ArrayList<ApplicationAttemptId>();
    queue.collectSchedulerApplications(apps);
    return apps;
  }

  @Override
  public synchronized String moveApplication(ApplicationId appId,
      String queueName) throws YarnException {
    SchedulerApplication<FSAppAttempt> app = applications.get(appId);
    if (app == null) {
      throw new YarnException("App to be moved " + appId + " not found.");
    }
    FSAppAttempt attempt = (FSAppAttempt) app.getCurrentAppAttempt();
    synchronized (attempt) {
      FSLeafQueue oldQueue = (FSLeafQueue) app.getQueue();
      String destQueueName = handleMoveToPlanQueue(queueName);
      FSLeafQueue targetQueue = queueMgr.getLeafQueue(destQueueName, false);
      if (targetQueue == null) {
        throw new YarnException("Target queue " + queueName
            + " not found or is not a leaf queue.");
      }
      if (targetQueue == oldQueue) {
        return oldQueue.getQueueName();
      }

      if (oldQueue.isRunnableApp(attempt)) {
        verifyMoveDoesNotViolateConstraints(attempt, oldQueue, targetQueue);
      }

      executeMove(app, attempt, oldQueue, targetQueue);
      return targetQueue.getQueueName();
    }
  }

  private void verifyMoveDoesNotViolateConstraints(FSAppAttempt app,
      FSLeafQueue oldQueue, FSLeafQueue targetQueue) throws YarnException {
    String queueName = targetQueue.getQueueName();
    ApplicationAttemptId appAttId = app.getApplicationAttemptId();
    FSQueue lowestCommonAncestor = findLowestCommonAncestorQueue(oldQueue,
        targetQueue);
    Resource consumption = app.getCurrentConsumption();

    FSQueue cur = targetQueue;
    while (cur != lowestCommonAncestor) {
      if (cur.getNumRunnableApps() == allocConf.getQueueMaxApps(cur.getQueueName())) {
        throw new YarnException("Moving app attempt " + appAttId + " to queue "
            + queueName + " would violate queue maxRunningApps constraints on"
            + " queue " + cur.getQueueName());
      }

      if (!Resources.fitsIn(Resources.add(cur.getResourceUsage(), consumption),
          cur.getMaxShare())) {
        throw new YarnException("Moving app attempt " + appAttId + " to queue "
            + queueName + " would violate queue maxShare constraints on"
            + " queue " + cur.getQueueName());
      }

      cur = cur.getParent();
    }
  }

  private void executeMove(SchedulerApplication<FSAppAttempt> app,
      FSAppAttempt attempt, FSLeafQueue oldQueue, FSLeafQueue newQueue) {
    boolean wasRunnable = oldQueue.removeApp(attempt);
    boolean nowRunnable = maxRunningEnforcer.canAppBeRunnable(newQueue,
        attempt.getUser());
    if (wasRunnable && !nowRunnable) {
      throw new IllegalStateException("Should have already verified that app "
          + attempt.getApplicationId() + " would be runnable in new queue");
    }

    if (wasRunnable) {
      maxRunningEnforcer.untrackRunnableApp(attempt);
    } else if (nowRunnable) {
      maxRunningEnforcer.untrackNonRunnableApp(attempt);
    }

    attempt.move(newQueue);
    app.setQueue(newQueue);
    newQueue.addApp(attempt, nowRunnable);

    if (nowRunnable) {
      maxRunningEnforcer.trackRunnableApp(attempt);
    }
    if (wasRunnable) {
      maxRunningEnforcer.updateRunnabilityOnAppRemoval(attempt, oldQueue);
    }
  }

  @VisibleForTesting
  FSQueue findLowestCommonAncestorQueue(FSQueue queue1, FSQueue queue2) {
    String name1 = queue1.getName();
    String name2 = queue2.getName();
    int lastPeriodIndex = -1;
    for (int i = 0; i < Math.max(name1.length(), name2.length()); i++) {
      if (name1.length() <= i || name2.length() <= i ||
          name1.charAt(i) != name2.charAt(i)) {
        return queueMgr.getQueue(name1.substring(0, lastPeriodIndex));
      } else if (name1.charAt(i) == '.') {
        lastPeriodIndex = i;
      }
    }
    return queue1;
  }

  @Override
  public synchronized void updateNodeResource(RMNode nm,
      ResourceOption resourceOption) {
    super.updateNodeResource(nm, resourceOption);
    updateRootQueueMetrics();
    queueMgr.getRootQueue().setSteadyFairShare(clusterResource);
    queueMgr.getRootQueue().recomputeSteadyShares();
  }

  @Override
  public EnumSet<SchedulerResourceTypes> getSchedulingResourceTypes() {
    return EnumSet
      .of(SchedulerResourceTypes.MEMORY, SchedulerResourceTypes.CPU);
  }

  @Override
  public Set<String> getPlanQueues() throws YarnException {
    Set<String> planQueues = new HashSet<String>();
    for (FSQueue fsQueue : queueMgr.getQueues()) {
      String queueName = fsQueue.getName();
      if (allocConf.isReservable(queueName)) {
        planQueues.add(queueName);
      }
    }
    return planQueues;
  }

  @Override
  public void setEntitlement(String queueName,
      QueueEntitlement entitlement) throws YarnException {

    FSLeafQueue reservationQueue = queueMgr.getLeafQueue(queueName, false);
    if (reservationQueue == null) {
      throw new YarnException("Target queue " + queueName
          + " not found or is not a leaf queue.");
    }

    reservationQueue.setWeights(entitlement.getCapacity());
  }

  @Override
  public void removeQueue(String queueName) throws YarnException {
    FSLeafQueue reservationQueue = queueMgr.getLeafQueue(queueName, false);
    if (reservationQueue != null) {
      if (!queueMgr.removeLeafQueue(queueName)) {
        throw new YarnException("Could not remove queue " + queueName + " as " +
            "its either not a leaf queue or its not empty");
      }
    }
  }

  private String handleMoveToPlanQueue(String targetQueueName) {
    FSQueue dest = queueMgr.getQueue(targetQueueName);
    if (dest != null && allocConf.isReservable(dest.getQueueName())) {
      targetQueueName = getDefaultQueueForPlanQueue(targetQueueName);
    }
    return targetQueueName;
  }
}