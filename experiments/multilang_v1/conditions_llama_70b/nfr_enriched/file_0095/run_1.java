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

@LimitedPrivate("yarn")
@Unstable
@SuppressWarnings("unchecked")
public class FairScheduler extends
    AbstractYarnScheduler<FSAppAttempt, FSSchedulerNode> {

  // ... existing fields and methods

  private void validateConf(Configuration conf) {
    validateMemoryAllocation(conf);
    validateVcoresAllocation(conf);
  }

  private void validateMemoryAllocation(Configuration conf) {
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
  }

  private void validateVcoresAllocation(Configuration conf) {
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

  // ... existing methods

  private synchronized void updateStarvationStats() {
    lastPreemptionUpdateTime = clock.getTime();
    updateStarvationStatsForLeafQueues();
  }

  private void updateStarvationStatsForLeafQueues() {
    for (FSLeafQueue sched : queueMgr.getLeafQueues()) {
      sched.updateStarvationStats();
    }
  }

  // ... existing methods

  private synchronized void preemptTasksIfNecessary() {
    if (!shouldAttemptPreemption()) {
      return;
    }

    long curTime = getClock().getTime();
    if (curTime - lastPreemptCheckTime < preemptionInterval) {
      return;
    }
    lastPreemptCheckTime = curTime;

    Resource resToPreempt = calculateResourcesToPreempt();
    if (Resources.greaterThan(RESOURCE_CALCULATOR, clusterResource, resToPreempt,
        Resources.none())) {
      preemptResources(resToPreempt);
    }
  }

  private Resource calculateResourcesToPreempt() {
    Resource resToPreempt = Resources.clone(Resources.none());
    for (FSLeafQueue sched : queueMgr.getLeafQueues()) {
      Resources.addTo(resToPreempt, resToPreempt(sched, getClock().getTime()));
    }
    return resToPreempt;
  }

  // ... existing methods

  private synchronized void addApplication(ApplicationId applicationId,
      String queueName, String user, boolean isAppRecovering) {
    if (queueName == null || queueName.isEmpty()) {
      rejectApplication(applicationId, user, "empty queue name");
      return;
    }

    if (queueName.startsWith(".") || queueName.endsWith(".")) {
      rejectApplication(applicationId, user, "illegal queue name");
      return;
    }

    FSLeafQueue queue = assignToQueue(applicationId, queueName, user);
    if (queue == null) {
      return;
    }

    // Enforce ACLs
    UserGroupInformation userUgi = UserGroupInformation.createRemoteUser(user);

    if (!queue.hasAccess(QueueACL.SUBMIT_APPLICATIONS, userUgi)
        && !queue.hasAccess(QueueACL.ADMINISTER_QUEUE, userUgi)) {
      rejectApplication(applicationId, user, "no access to queue");
      return;
    }

    // ... existing code
  }

  private void rejectApplication(ApplicationId applicationId, String user, String reason) {
    String message = "Reject application " + applicationId +
            " submitted by user " + user + " with " + reason + ".";
    LOG.info(message);
    rmContext.getDispatcher().getEventHandler()
            .handle(new RMAppRejectedEvent(applicationId, message));
  }

  // ... existing methods

  private synchronized void removeApplicationAttempt(
      ApplicationAttemptId applicationAttemptId,
      RMAppAttemptState rmAppAttemptFinalState, boolean keepContainers) {
    // ... existing code
  }

  private void cleanupApplicationAttempt(FSAppAttempt attempt) {
    // Release all the running containers
    for (RMContainer rmContainer : attempt.getLiveContainers()) {
      if (keepContainers
              && rmContainer.getState().equals(RMContainerState.RUNNING)) {
        // do not kill the running container in the case of work-preserving AM
        // restart.
        LOG.info("Skip killing " + rmContainer.getContainerId());
        continue;
      }
      completedContainer(rmContainer,
              SchedulerUtils.createAbnormalContainerStatus(
                      rmContainer.getContainerId(),
                      SchedulerUtils.COMPLETED_APPLICATION),
              RMContainerEventType.KILL);
    }

    // Release all reserved containers
    for (RMContainer rmContainer : attempt.getReservedContainers()) {
      completedContainer(rmContainer,
              SchedulerUtils.createAbnormalContainerStatus(
                      rmContainer.getContainerId(),
                      "Application Complete"),
              RMContainerEventType.KILL);
    }
    // Clean up pending requests, metrics etc.
    attempt.stop(rmAppAttemptFinalState);
  }

  // ... existing methods

  private synchronized void nodeUpdate(RMNode nm) {
    long start = getClock().getTime();
    if (LOG.isDebugEnabled()) {
      LOG.debug("nodeUpdate: " + nm + " cluster capacity: " + clusterResource);
    }
    eventLog.log("HEARTBEAT", nm.getHostName());
    FSSchedulerNode node = getFSSchedulerNode(nm.getNodeID());

    // ... existing code
  }

  private void processContainerUpdates(List<UpdatedContainerInfo> containerInfoList) {
    List<ContainerStatus> newlyLaunchedContainers = new ArrayList<ContainerStatus>();
    List<ContainerStatus> completedContainers = new ArrayList<ContainerStatus>();
    for(UpdatedContainerInfo containerInfo : containerInfoList) {
      newlyLaunchedContainers.addAll(containerInfo.getNewlyLaunchedContainers());
      completedContainers.addAll(containerInfo.getCompletedContainers());
    }
    processNewlyLaunchedContainers(newlyLaunchedContainers);
    processCompletedContainers(completedContainers);
  }

  private void processNewlyLaunchedContainers(List<ContainerStatus> newlyLaunchedContainers) {
    for (ContainerStatus launchedContainer : newlyLaunchedContainers) {
      containerLaunchedOnNode(launchedContainer.getContainerId(), getFSSchedulerNode(launchedContainer.getContainerId().getNodeId()));
    }
  }

  private void processCompletedContainers(List<ContainerStatus> completedContainers) {
    for (ContainerStatus completedContainer : completedContainers) {
      ContainerId containerId = completedContainer.getContainerId();
      LOG.debug("Container FINISHED: " + containerId);
      completedContainer(getRMContainer(containerId),
              completedContainer, RMContainerEventType.FINISHED);
    }
  }

  // ... existing methods

  private synchronized void attemptScheduling(FSSchedulerNode node) {
    if (rmContext.isWorkPreservingRecoveryEnabled()
            && !rmContext.isSchedulerReadyForAllocatingContainers()) {
      return;
    }

    // ... existing code
  }

  private void assignNewContainers(FSSchedulerNode node) {
    // Assign new containers...
    // 1. Check for reserved applications
    // 2. Schedule if there are no reservations

    FSAppAttempt reservedAppSchedulable = node.getReservedAppSchedulable();
    if (reservedAppSchedulable != null) {
      Priority reservedPriority = node.getReservedContainer().getReservedPriority();
      FSQueue queue = reservedAppSchedulable.getQueue();

      if (!reservedAppSchedulable.hasContainerForNode(reservedPriority, node)
              || !fitsInMaxShare(queue,
              node.getReservedContainer().getReservedResource())) {
        // Don't hold the reservation if app can no longer use it
        LOG.info("Releasing reservation that cannot be satisfied for application "
                + reservedAppSchedulable.getApplicationAttemptId()
                + " on node " + node);
        reservedAppSchedulable.unreserve(reservedPriority, node);
        reservedAppSchedulable = null;
      } else {
        // Reservation exists; try to fulfill the reservation
        if (LOG.isDebugEnabled()) {
          LOG.debug("Trying to fulfill reservation for application "
                  + reservedAppSchedulable.getApplicationAttemptId()
                  + " on node: " + node);
        }
        node.getReservedAppSchedulable().assignReservedContainer(node);
      }
    }
    if (reservedAppSchedulable == null) {
      // No reservation, schedule at queue which is farthest below fair share
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
    updateRootQueueMetrics();
  }

  // ... existing methods

  private synchronized String resolveReservationQueueName(String queueName,
      ApplicationId applicationId, ReservationId reservationID) {
    // ... existing code
  }

  private String getDefaultQueueForPlanQueue(String queueName) {
    String planName = queueName.substring(queueName.lastIndexOf(".") + 1);
    queueName = queueName + "." + planName + ReservationConstants.DEFAULT_QUEUE_SUFFIX;
    return queueName;
  }

  // ... existing methods

  private synchronized void initScheduler(Configuration conf) throws IOException {
    // ... existing code
  }

  private void initializeSchedulerConfiguration(Configuration conf) throws IOException {
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
              FairSchedulerConfiguration.DEFAULT_UPDATE_INTERVAL_MS
              + " ms instead");
    }

    rootMetrics = FSQueueMetrics.forQueue("root", null, true, conf);
    fsOpDurations = FSOpDurations.getInstance(true);

    // This stores per-application scheduling information
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
      // start continuous scheduling thread
      schedulingThread = new ContinuousSchedulingThread();
      schedulingThread.setName("FairSchedulerContinuousScheduling");
      schedulingThread.setDaemon(true);
    }
  }

  // ... existing methods
}