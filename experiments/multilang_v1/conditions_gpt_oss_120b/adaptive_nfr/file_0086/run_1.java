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

package org.apache.hadoop.mapreduce.v2.app.rm;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.LinkedList;
import java.util.List;
import java.util.Map;
import java.util.Map.Entry;
import java.util.Set;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.atomic.AtomicBoolean;

import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.apache.hadoop.classification.InterfaceAudience.Private;
import org.apache.hadoop.conf.Configuration;
import org.apache.hadoop.io.Text;
import org.apache.hadoop.mapreduce.JobCounter;
import org.apache.hadoop.mapreduce.MRJobConfig;
import org.apache.hadoop.mapreduce.jobhistory.JobHistoryEvent;
import org.apache.hadoop.mapreduce.jobhistory.NormalizedResourceEvent;
import org.apache.hadoop.mapreduce.v2.api.records.JobId;
import org.apache.hadoop.mapreduce.v2.api.records.TaskAttemptId;
import org.apache.hadoop.mapreduce.v2.api.records.TaskType;
import org.apache.hadoop.mapreduce.v2.app.AppContext;
import org.apache.hadoop.mapreduce.v2.app.client.ClientService;
import org.apache.hadoop.mapreduce.v2.app.job.event.JobCounterUpdateEvent;
import org.apache.hadoop.mapreduce.v2.app.job.event.JobDiagnosticsUpdateEvent;
import org.apache.hadoop.mapreduce.v2.app.job.event.JobEvent;
import org.apache.hadoop.mapreduce.v2.app.job.event.JobEventType;
import org.apache.hadoop.mapreduce.v2.app.job.event.JobUpdatedNodesEvent;
import org.apache.hadoop.mapreduce.v2.app.job.event.TaskAttemptContainerAssignedEvent;
import org.apache.hadoop.mapreduce.v2.app.job.event.TaskAttemptDiagnosticsUpdateEvent;
import org.apache.hadoop.mapreduce.v2.app.job.event.TaskAttemptEvent;
import org.apache.hadoop.mapreduce.v2.app.job.event.TaskAttemptEventType;
import org.apache.hadoop.mapreduce.v2.app.job.event.TaskAttemptKillEvent;
import org.apache.hadoop.security.UserGroupInformation;
import org.apache.hadoop.util.StringInterner;
import org.apache.hadoop.yarn.api.protocolrecords.AllocateResponse;
import org.apache.hadoop.yarn.api.records.Container;
import org.apache.hadoop.yarn.api.records.ContainerExitStatus;
import org.apache.hadoop.yarn.api.records.ContainerId;
import org.apache.hadoop.yarn.api.records.ContainerStatus;
import org.apache.hadoop.yarn.api.records.NMToken;
import org.apache.hadoop.yarn.api.records.NodeId;
import org.apache.hadoop.yarn.api.records.NodeReport;
import org.apache.hadoop.yarn.api.records.NodeState;
import org.apache.hadoop.yarn.api.records.Priority;
import org.apache.hadoop.yarn.api.records.Resource;
import org.apache.hadoop.yarn.api.records.Token;
import org.apache.hadoop.yarn.client.ClientRMProxy;
import org.apache.hadoop.yarn.client.api.NMTokenCache;
import org.apache.hadoop.yarn.exceptions.ApplicationAttemptNotFoundException;
import org.apache.hadoop.yarn.exceptions.ApplicationMasterNotRegisteredException;
import org.apache.hadoop.yarn.exceptions.YarnRuntimeException;
import org.apache.hadoop.yarn.factory.providers.RecordFactoryProvider;
import org.apache.hadoop.yarn.security.AMRMTokenIdentifier;
import org.apache.hadoop.yarn.util.Clock;
import org.apache.hadoop.yarn.util.RackResolver;
import org.apache.hadoop.yarn.util.resource.Resources;

import com.google.common.annotations.VisibleForTesting;

/**
 * Allocates the container from the ResourceManager scheduler.
 */
public class RMContainerAllocator extends RMContainerRequestor
    implements ContainerAllocator {

  static final Log LOG = LogFactory.getLog(RMContainerAllocator.class);

  public static final float DEFAULT_COMPLETED_MAPS_PERCENT_FOR_REDUCE_SLOWSTART = 0.05f;

  static final Priority PRIORITY_FAST_FAIL_MAP;
  static final Priority PRIORITY_REDUCE;
  static final Priority PRIORITY_MAP;

  @VisibleForTesting
  public static final String RAMPDOWN_DIAGNOSTIC = "Reducer preempted "
      + "to make room for pending map attempts";

  private Thread eventHandlingThread;
  private final AtomicBoolean stopped;

  static {
    PRIORITY_FAST_FAIL_MAP = RecordFactoryProvider.getRecordFactory(null)
        .newRecordInstance(Priority.class);
    PRIORITY_FAST_FAIL_MAP.setPriority(5);
    PRIORITY_REDUCE = RecordFactoryProvider.getRecordFactory(null)
        .newRecordInstance(Priority.class);
    PRIORITY_REDUCE.setPriority(10);
    PRIORITY_MAP = RecordFactoryProvider.getRecordFactory(null)
        .newRecordInstance(Priority.class);
    PRIORITY_MAP.setPriority(20);
  }

  // reduces which are not yet scheduled
  private final LinkedList<ContainerRequest> pendingReduces = new LinkedList<>();

  // holds information about the assigned containers to task attempts
  private final AssignedRequests assignedRequests = new AssignedRequests();

  // holds scheduled requests to be fulfilled by RM
  private final ScheduledRequests scheduledRequests = new ScheduledRequests();

  private int containersAllocated = 0;
  private int containersReleased = 0;
  private int hostLocalAssigned = 0;
  private int rackLocalAssigned = 0;
  private int lastCompletedTasks = 0;

  private boolean recalculateReduceSchedule = false;
  private Resource mapResourceRequest = Resources.none();
  private Resource reduceResourceRequest = Resources.none();

  private boolean reduceStarted = false;
  private float maxReduceRampupLimit = 0;
  private float maxReducePreemptionLimit = 0;
  private long allocationDelayThresholdMs = 0;
  private float reduceSlowStart = 0;
  private int maxRunningMaps = 0;
  private int maxRunningReduces = 0;
  private long retryInterval;
  private long retrystartTime;
  private Clock clock;

  @VisibleForTesting
  protected BlockingQueue<ContainerAllocatorEvent> eventQueue = new LinkedBlockingQueue<>();

  private ScheduleStats scheduleStats = new ScheduleStats();

  public RMContainerAllocator(ClientService clientService, AppContext context) {
    super(clientService, context);
    this.stopped = new AtomicBoolean(false);
    this.clock = context.getClock();
  }

  @Override
  protected void serviceInit(Configuration conf) throws Exception {
    super.serviceInit(conf);
    reduceSlowStart = conf.getFloat(MRJobConfig.COMPLETED_MAPS_FOR_REDUCE_SLOWSTART,
        DEFAULT_COMPLETED_MAPS_PERCENT_FOR_REDUCE_SLOWSTART);
    maxReduceRampupLimit = conf.getFloat(MRJobConfig.MR_AM_JOB_REDUCE_RAMPUP_UP_LIMIT,
        MRJobConfig.DEFAULT_MR_AM_JOB_REDUCE_RAMP_UP_LIMIT);
    maxReducePreemptionLimit = conf.getFloat(MRJobConfig.MR_AM_JOB_REDUCE_PREEMPTION_LIMIT,
        MRJobConfig.DEFAULT_MR_AM_JOB_REDUCE_PREEMPTION_LIMIT);
    allocationDelayThresholdMs = conf.getInt(MRJobConfig.MR_JOB_REDUCER_PREEMPT_DELAY_SEC,
        MRJobConfig.DEFAULT_MR_JOB_REDUCER_PREEMPT_DELAY_SEC) * 1000;
    maxRunningMaps = conf.getInt(MRJobConfig.JOB_RUNNING_MAP_LIMIT,
        MRJobConfig.DEFAULT_JOB_RUNNING_MAP_LIMIT);
    maxRunningReduces = conf.getInt(MRJobConfig.JOB_RUNNING_REDUCE_LIMIT,
        MRJobConfig.DEFAULT_JOB_RUNNING_REDUCE_LIMIT);
    RackResolver.init(conf);
    retryInterval = getConfig().getLong(MRJobConfig.MR_AM_TO_RM_WAIT_INTERVAL_MS,
        MRJobConfig.DEFAULT_MR_AM_TO_RM_WAIT_INTERVAL_MS);
    retrystartTime = System.currentTimeMillis();
  }

  @Override
  protected void serviceStart() throws Exception {
    this.eventHandlingThread = new Thread() {
      @SuppressWarnings("unchecked")
      @Override
      public void run() {
        while (!stopped.get() && !Thread.currentThread().isInterrupted()) {
          ContainerAllocatorEvent event;
          try {
            event = RMContainerAllocator.this.eventQueue.take();
          } catch (InterruptedException e) {
            if (!stopped.get()) {
              LOG.error("Returning, interrupted : " + e);
            }
            return;
          }
          try {
            handleEvent(event);
          } catch (Throwable t) {
            LOG.error("Error handling event " + event.getType(), t);
            eventHandler.handle(new JobEvent(getJob().getID(),
                JobEventType.INTERNAL_ERROR));
            return;
          }
        }
      }
    };
    this.eventHandlingThread.start();
    super.serviceStart();
  }

  @Override
  protected synchronized void heartbeat() throws Exception {
    scheduleStats.updateAndLogIfChanged("Before Scheduling: ");
    List<Container> allocated = getResources();
    if (allocated != null && !allocated.isEmpty()) {
      scheduledRequests.assign(allocated);
    }

    int completedMaps = getJob().getCompletedMaps();
    int completedTasks = completedMaps + getJob().getCompletedReduces();
    if (lastCompletedTasks != completedTasks || !scheduledRequests.maps.isEmpty()) {
      lastCompletedTasks = completedTasks;
      recalculateReduceSchedule = true;
    }

    if (recalculateReduceSchedule) {
      preemptReducesIfNeeded();
      scheduleReduces(getJob().getTotalMaps(), completedMaps,
          scheduledRequests.maps.size(), scheduledRequests.reduces.size(),
          assignedRequests.maps.size(), assignedRequests.reduces.size(),
          mapResourceRequest, reduceResourceRequest,
          pendingReduces.size(), maxReduceRampupLimit, reduceSlowStart);
      recalculateReduceSchedule = false;
    }

    scheduleStats.updateAndLogIfChanged("After Scheduling: ");
  }

  @Override
  protected void serviceStop() throws Exception {
    if (stopped.getAndSet(true)) {
      return;
    }
    if (eventHandlingThread != null) {
      eventHandlingThread.interrupt();
    }
    super.serviceStop();
    scheduleStats.log("Final Stats: ");
  }

  @Private
  @VisibleForTesting
  AssignedRequests getAssignedRequests() {
    return assignedRequests;
  }

  @Private
  @VisibleForTesting
  ScheduledRequests getScheduledRequests() {
    return scheduledRequests;
  }

  public boolean getIsReduceStarted() {
    return reduceStarted;
  }

  public void setIsReduceStarted(boolean reduceStarted) {
    this.reduceStarted = reduceStarted;
  }

  @Override
  public void handle(ContainerAllocatorEvent event) {
    int qSize = eventQueue.size();
    if (qSize != 0 && qSize % 1000 == 0) {
      LOG.info("Size of event-queue in RMContainerAllocator is " + qSize);
    }
    int remCapacity = eventQueue.remainingCapacity();
    if (remCapacity < 1000) {
      LOG.warn("Very low remaining capacity in the event-queue of RMContainerAllocator: "
          + remCapacity);
    }
    try {
      eventQueue.put(event);
    } catch (InterruptedException e) {
      throw new YarnRuntimeException(e);
    }
  }

  @SuppressWarnings({ "unchecked" })
  protected synchronized void handleEvent(ContainerAllocatorEvent event) {
    recalculateReduceSchedule = true;
    if (event.getType() == ContainerAllocator.EventType.CONTAINER_REQ) {
      handleContainerRequest((ContainerRequestEvent) event);
    } else if (event.getType() == ContainerAllocator.EventType.CONTAINER_DEALLOCATE) {
      handleContainerDeallocate(event);
    } else if (event.getType() == ContainerAllocator.EventType.CONTAINER_FAILED) {
      handleContainerFailed((ContainerFailedEvent) event);
    }
  }

  private void handleContainerRequest(ContainerRequestEvent reqEvent) {
    JobId jobId = getJob().getID();
    Resource maxCap = getMaxContainerCapability();

    if (isMapTask(reqEvent)) {
      handleMapRequest(reqEvent, jobId, maxCap);
    } else {
      handleReduceRequest(reqEvent, jobId, maxCap);
    }
  }

  private boolean isMapTask(ContainerRequestEvent ev) {
    return ev.getAttemptID().getTaskId().getTaskType().equals(TaskType.MAP);
  }

  private void handleMapRequest(ContainerRequestEvent ev, JobId jobId,
      Resource maxCap) {
    if (mapResourceRequest.equals(Resources.none())) {
      mapResourceRequest = ev.getCapability();
      eventHandler.handle(new JobHistoryEvent(jobId,
          new NormalizedResourceEvent(org.apache.hadoop.mapreduce.TaskType.MAP,
              mapResourceRequest.getMemory())));
      LOG.info("mapResourceRequest:" + mapResourceRequest);
      if (exceedsCapability(mapResourceRequest, maxCap)) {
        killJobForCapabilityOverflow(jobId, mapResourceRequest, maxCap, "MAP");
        return;
      }
    }
    ev.getCapability().setMemory(mapResourceRequest.getMemory());
    ev.getCapability().setVirtualCores(mapResourceRequest.getVirtualCores());
    scheduledRequests.addMap(ev);
  }

  private void handleReduceRequest(ContainerRequestEvent ev, JobId jobId,
      Resource maxCap) {
    if (reduceResourceRequest.equals(Resources.none())) {
      reduceResourceRequest = ev.getCapability();
      eventHandler.handle(new JobHistoryEvent(jobId,
          new NormalizedResourceEvent(org.apache.hadoop.mapreduce.TaskType.REDUCE,
              reduceResourceRequest.getMemory())));
      LOG.info("reduceResourceRequest:" + reduceResourceRequest);
      if (exceedsCapability(reduceResourceRequest, maxCap)) {
        killJobForCapabilityOverflow(jobId, reduceResourceRequest, maxCap, "REDUCE");
        return;
      }
    }
    ev.getCapability().setMemory(reduceResourceRequest.getMemory());
    ev.getCapability().setVirtualCores(reduceResourceRequest.getVirtualCores());

    if (ev.getEarlierAttemptFailed()) {
      pendingReduces.addFirst(new ContainerRequest(ev, PRIORITY_REDUCE));
    } else {
      pendingReduces.add(new ContainerRequest(ev, PRIORITY_REDUCE));
    }
  }

  private boolean exceedsCapability(Resource req, Resource max) {
    return req.getMemory() > max.getMemory()
        || req.getVirtualCores() > max.getVirtualCores();
  }

  private void killJobForCapabilityOverflow(JobId jobId, Resource req,
      Resource max, String type) {
    String diag = type + " capability required is more than the supported max container capability in the cluster. Killing the Job. "
        + type.toLowerCase() + "ResourceRequest: " + req + " maxContainerCapability:" + max;
    LOG.info(diag);
    eventHandler.handle(new JobDiagnosticsUpdateEvent(jobId, diag));
    eventHandler.handle(new JobEvent(jobId, JobEventType.JOB_KILL));
  }

  private void handleContainerDeallocate(ContainerAllocatorEvent event) {
    LOG.info("Processing the event " + event);
    TaskAttemptId aId = event.getAttemptID();
    boolean removed = scheduledRequests.remove(aId);
    if (!removed) {
      ContainerId cid = assignedRequests.get(aId);
      if (cid != null) {
        assignedRequests.remove(aId);
        containersReleased++;
        pendingRelease.add(cid);
        release(cid);
        removed = true;
      }
    }
    if (!removed) {
      LOG.error("Could not deallocate container for task attemptId " + aId);
    }
  }

  private void handleContainerFailed(ContainerFailedEvent ev) {
    String host = getHost(ev.getContMgrAddress());
    containerFailedOnHost(host);
  }

  private static String getHost(String contMgrAddress) {
    String[] parts = contMgrAddress.split(":");
    return parts.length == 2 ? parts[0] : contMgrAddress;
  }

  @Private
  @VisibleForTesting
  synchronized void setReduceResourceRequest(Resource res) {
    this.reduceResourceRequest = res;
  }

  @Private
  @VisibleForTesting
  synchronized void setMapResourceRequest(Resource res) {
    this.mapResourceRequest = res;
  }

  @Private
  void preemptReducesIfNeeded() {
    if (reduceResourceRequest.equals(Resources.none())) {
      return;
    }
    if (scheduledRequests.maps.isEmpty()) {
      return;
    }
    Resource limit = getResourceLimit();
    Resource availableForMap = Resources.subtract(limit,
        Resources.multiply(reduceResourceRequest,
            assignedRequests.reduces.size()
                - assignedRequests.preemptionWaitingReduces.size()));
    if (ResourceCalculatorUtils.computeAvailableContainers(availableForMap,
        mapResourceRequest, getSchedulerResourceTypes()) <= 0) {
      LOG.info("Ramping down all scheduled reduces:" + scheduledRequests.reduces.size());
      for (ContainerRequest req : scheduledRequests.reduces.values()) {
        pendingReduces.add(req);
      }
      scheduledRequests.reduces.clear();

      int hanging = getNumOfHangingRequests(scheduledRequests.maps);
      if (hanging > 0) {
        int perMap = ResourceCalculatorUtils.divideAndCeilContainers(
            mapResourceRequest, reduceResourceRequest, getSchedulerResourceTypes());
        int perLimit = ResourceCalculatorUtils.divideAndCeilContainers(
            Resources.multiply(limit, maxReducePreemptionLimit),
            reduceResourceRequest, getSchedulerResourceTypes());
        int perAllMaps = ResourceCalculatorUtils.divideAndCeilContainers(
            Resources.multiply(mapResourceRequest, hanging),
            reduceResourceRequest, getSchedulerResourceTypes());
        int toPreempt = Math.min(Math.max(perMap, perLimit), perAllMaps);
        LOG.info("Going to preempt " + toPreempt + " due to lack of space for maps");
        assignedRequests.preemptReduce(toPreempt);
      }
    }
  }

  private int getNumOfHangingRequests(Map<TaskAttemptId, ContainerRequest> map) {
    if (allocationDelayThresholdMs <= 0) {
      return map.size();
    }
    int hanging = 0;
    long now = clock.getTime();
    for (ContainerRequest req : map.values()) {
      if (now - req.requestTimeMs > allocationDelayThresholdMs) {
        hanging++;
      }
    }
    return hanging;
  }

  @Private
  public void scheduleReduces(int totalMaps, int completedMaps,
      int scheduledMaps, int scheduledReduces, int assignedMaps,
      int assignedReduces, Resource mapRes, Resource reduceRes,
      int pendingReducesCount, float maxRampup, float slowStart) {
    if (pendingReducesCount == 0) {
      return;
    }
    Resource headRoom = getAvailableResources();
    if (headRoom == null) {
      headRoom = Resources.none();
    }
    LOG.info("Recalculating schedule, headroom=" + headRoom);

    if (!reduceStarted) {
      if (!reduceSlowStartMet(completedMaps, totalMaps, slowStart)) {
        return;
      }
      setIsReduceStarted(true);
    }

    if (scheduledMaps == 0) {
      LOG.info("All maps assigned. Ramping up all remaining reduces:" + pendingReducesCount);
      scheduleAllReduces();
      return;
    }

    float completedMapPct = totalMaps == 0 ? 1f
        : (float) completedMaps / totalMaps;

    Resource totalLimit = getResourceLimit();
    Resource idealReduce = Resources.multiply(totalLimit,
        Math.min(completedMapPct, maxRampup));
    Resource idealMap = Resources.subtract(totalLimit, idealReduce);

    Resource netMap = Resources.multiply(mapRes, scheduledMaps + assignedMaps);
    Resource netReduce = Resources.multiply(reduceRes,
        scheduledReduces + assignedReduces);

    Resource finalMap;
    Resource finalReduce;
    if (ResourceCalculatorUtils.computeAvailableContainers(idealMap, mapRes,
        getSchedulerResourceTypes()) >= (scheduledMaps + assignedMaps)) {
      Resource unused = Resources.subtract(idealMap, netMap);
      finalReduce = Resources.add(idealReduce, unused);
      finalMap = Resources.subtract(totalLimit, finalReduce);
    } else {
      finalMap = idealMap;
      finalReduce = idealReduce;
    }

    LOG.info("completedMapPercent " + completedMapPct
        + " totalResourceLimit:" + totalLimit
        + " finalMapResourceLimit:" + finalMap
        + " finalReduceResourceLimit:" + finalReduce
        + " netScheduledMapResource:" + netMap
        + " netScheduledReduceResource:" + netReduce);

    int ramp = ResourceCalculatorUtils.computeAvailableContainers(
        Resources.subtract(finalReduce, netReduce), reduceRes,
        getSchedulerResourceTypes());

    if (ramp > 0) {
      ramp = Math.min(ramp, pendingReducesCount);
      LOG.info("Ramping up " + ramp);
      rampUpReduces(ramp);
    } else if (ramp < 0) {
      int down = Math.min(-ramp, scheduledReduces);
      LOG.info("Ramping down " + down);
      rampDownReduces(down);
    }
  }

  private boolean reduceSlowStartMet(int completedMaps, int totalMaps,
      float slowStart) {
    int threshold = (int) Math.ceil(slowStart * totalMaps);
    if (completedMaps < threshold) {
      LOG.info("Reduce slow start threshold not met. completedMapsForReduceSlowstart "
          + threshold);
      return false;
    }
    LOG.info("Reduce slow start threshold reached. Scheduling reduces.");
    return true;
  }

  @Private
  public void scheduleAllReduces() {
    for (ContainerRequest req : pendingReduces) {
      scheduledRequests.addReduce(req);
    }
    pendingReduces.clear();
  }

  @Private
  public void rampUpReduces(int count) {
    for (int i = 0; i < count; i++) {
      ContainerRequest req = pendingReduces.removeFirst();
      scheduledRequests.addReduce(req);
    }
  }

  @Private
  public void rampDownReduces(int count) {
    for (int i = 0; i < count; i++) {
      ContainerRequest req = scheduledRequests.removeReduce();
      pendingReduces.add(req);
    }
  }

  @SuppressWarnings("unchecked")
  private List<Container> getResources() throws Exception {
    applyConcurrentTaskLimits();

    Resource headRoom = getAvailableResources() == null ? Resources.none()
        : Resources.clone(getAvailableResources());
    AllocateResponse response;
    try {
      response = makeRemoteRequest();
      retrystartTime = System.currentTimeMillis();
    } catch (ApplicationAttemptNotFoundException e) {
      eventHandler.handle(new JobEvent(getJob().getID(),
          JobEventType.JOB_AM_REBOOT));
      throw new YarnRuntimeException(
          "Resource Manager doesn't recognize AttemptId: "
              + getContext().getApplicationAttemptId(), e);
    } catch (ApplicationMasterNotRegisteredException e) {
      LOG.info("ApplicationMaster out of sync with RM, resyncing.");
      lastResponseID = 0;
      register();
      addOutstandingRequestOnResync();
      return null;
    } catch (Exception e) {
      if (System.currentTimeMillis() - retrystartTime >= retryInterval) {
        LOG.error("Could not contact RM after " + retryInterval + " ms.");
        eventHandler.handle(new JobEvent(getJob().getID(),
            JobEventType.JOB_AM_REBOOT));
        throw new YarnRuntimeException("Could not contact RM after "
            + retryInterval + " ms.");
      }
      throw e;
    }

    Resource newHeadRoom = getAvailableResources() == null ? Resources.none()
        : getAvailableResources();
    List<Container> newContainers = response.getAllocatedContainers();

    if (response.getNMTokens() != null) {
      for (NMToken token : response.getNMTokens()) {
        NMTokenCache.setNMToken(token.getNodeId().toString(),
            token.getToken());
      }
    }
    if (response.getAMRMToken() != null) {
      updateAMRMToken(response.getAMRMToken());
    }

    List<ContainerStatus> finished = response.getCompletedContainersStatuses();
    if (!newContainers.isEmpty() || !finished.isEmpty()
        || !headRoom.equals(newHeadRoom)) {
      recalculateReduceSchedule = true;
      if (LOG.isDebugEnabled() && !headRoom.equals(newHeadRoom)) {
        LOG.debug("headroom=" + newHeadRoom);
      }
    }

    if (LOG.isDebugEnabled()) {
      for (Container c : newContainers) {
        LOG.debug("Received new Container :" + c);
      }
    }

    computeIgnoreBlacklisting();
    handleUpdatedNodes(response);

    for (ContainerStatus cs : finished) {
      LOG.info("Received completed container " + cs.getContainerId());
      TaskAttemptId attempt = assignedRequests.get(cs.getContainerId());
      if (attempt == null) {
        LOG.error("Container complete event for unknown container id "
            + cs.getContainerId());
        continue;
      }
      pendingRelease.remove(cs.getContainerId());
      assignedRequests.remove(attempt);
      eventHandler.handle(createContainerFinishedEvent(cs, attempt));
      String diag = StringInterner.weakIntern(cs.getDiagnostics());
      eventHandler.handle(new TaskAttemptDiagnosticsUpdateEvent(attempt,
          diag));
    }
    return newContainers;
  }

  private void applyConcurrentTaskLimits() {
    int scheduledMaps = scheduledRequests.maps.size();
    if (maxRunningMaps > 0 && scheduledMaps > 0) {
      int maxReq = Math.max(0, maxRunningMaps - assignedRequests.maps.size());
      int failMaps = scheduledRequests.earlierFailedMaps.size();
      int failLimit = Math.min(maxReq, failMaps);
      int normalLimit = Math.min(maxReq - failLimit,
          scheduledMaps - failMaps);
      setRequestLimit(PRIORITY_FAST_FAIL_MAP, mapResourceRequest, failLimit);
      setRequestLimit(PRIORITY_MAP, mapResourceRequest, normalLimit);
    }

    int scheduledReduces = scheduledRequests.reduces.size();
    if (maxRunningReduces > 0 && scheduledReduces > 0) {
      int maxReq = Math.max(0,
          maxRunningReduces - assignedRequests.reduces.size());
      int limit = Math.min(maxReq, scheduledReduces);
      setRequestLimit(PRIORITY_REDUCE, reduceResourceRequest, limit);
    }
  }

  private boolean canAssignMaps() {
    return maxRunningMaps <= 0
        || assignedRequests.maps.size() < maxRunningMaps;
  }

  private boolean canAssignReduces() {
    return maxRunningReduces <= 0
        || assignedRequests.reduces.size() < maxRunningReduces;
  }

  private void updateAMRMToken(Token token) throws IOException {
    org.apache.hadoop.security.token.Token<AMRMTokenIdentifier> amrmToken =
        new org.apache.hadoop.security.token.Token<AMRMTokenIdentifier>(token
            .getIdentifier().array(), token.getPassword().array(),
            new Text(token.getKind()), new Text(token.getService()));
    UserGroupInformation.getCurrentUser().addToken(amrmToken);
    amrmToken.setService(ClientRMProxy.getAMRMTokenService(getConfig()));
  }

  @VisibleForTesting
  public TaskAttemptEvent createContainerFinishedEvent(ContainerStatus cont,
      TaskAttemptId attemptID) {
    if (cont.getExitStatus() == ContainerExitStatus.ABORTED
        || cont.getExitStatus() == ContainerExitStatus.PREEMPTED) {
      return new TaskAttemptEvent(attemptID, TaskAttemptEventType.TA_KILL);
    }
    return new TaskAttemptEvent(attemptID,
        TaskAttemptEventType.TA_CONTAINER_COMPLETED);
  }

  @SuppressWarnings("unchecked")
  private void handleUpdatedNodes(AllocateResponse response) {
    List<NodeReport> updated = response.getUpdatedNodes();
    if (updated.isEmpty()) {
      return;
    }
    eventHandler.handle(new JobUpdatedNodesEvent(getJob().getID(), updated));

    Set<NodeId> unusable = new HashSet<>();
    for (NodeReport nr : updated) {
      if (nr.getNodeState().isUnusable()) {
        unusable.add(nr.getNodeId());
      }
    }
    for (int i = 0; i < 2; ++i) {
      Map<TaskAttemptId, Container> tasks = i == 0 ? assignedRequests.maps
          : assignedRequests.reduces;
      for (Entry<TaskAttemptId, Container> e : tasks.entrySet()) {
        if (unusable.contains(e.getValue().getNodeId())) {
          LOG.info("Killing taskAttempt:" + e.getKey()
              + " because it is running on unusable node:" + e.getValue()
                  .getNodeId());
          eventHandler.handle(new TaskAttemptKillEvent(e.getKey(),
              "TaskAttempt killed because it ran on unusable node"
                  + e.getValue().getNodeId()));
        }
      }
    }
  }

  @Private
  public Resource getResourceLimit() {
    Resource head = getAvailableResources();
    if (head == null) {
      head = Resources.none();
    }
    Resource mapRes = Resources.multiply(mapResourceRequest,
        assignedRequests.maps.size());
    Resource redRes = Resources.multiply(reduceResourceRequest,
        assignedRequests.reduces.size());
    return Resources.add(head, Resources.add(mapRes, redRes));
  }

  @Private
  @VisibleForTesting
  class ScheduledRequests {
    private final LinkedList<TaskAttemptId> earlierFailedMaps = new LinkedList<>();

    private final Map<String, LinkedList<TaskAttemptId>> mapsHostMapping = new HashMap<>();
    private final Map<String, LinkedList<TaskAttemptId>> mapsRackMapping = new HashMap<>();

    @VisibleForTesting
    final Map<TaskAttemptId, ContainerRequest> maps = new LinkedHashMap<>();

    private final LinkedHashMap<TaskAttemptId, ContainerRequest> reduces = new LinkedHashMap<>();

    boolean remove(TaskAttemptId tId) {
      ContainerRequest req = tId.getTaskId().getTaskType().equals(TaskType.MAP)
          ? maps.remove(tId) : reduces.remove(tId);
      if (req == null) {
        return false;
      }
      decContainerReq(req);
      return true;
    }

    ContainerRequest removeReduce() {
      Iterator<Entry<TaskAttemptId, ContainerRequest>> it = reduces.entrySet()
          .iterator();
      if (!it.hasNext()) {
        return null;
      }
      Entry<TaskAttemptId, ContainerRequest> e = it.next();
      it.remove();
      decContainerReq(e.getValue());
      return e.getValue();
    }

    void addMap(ContainerRequestEvent ev) {
      ContainerRequest req;
      if (ev.getEarlierAttemptFailed()) {
        earlierFailedMaps.add(ev.getAttemptID());
        req = new ContainerRequest(ev, PRIORITY_FAST_FAIL_MAP);
        LOG.info("Added " + ev.getAttemptID() + " to list of failed maps");
      } else {
        for (String host : ev.getHosts()) {
          mapsHostMapping.computeIfAbsent(host, k -> new LinkedList<>())
              .add(ev.getAttemptID());
        }
        for (String rack : ev.getRacks()) {
          mapsRackMapping.computeIfAbsent(rack, k -> new LinkedList<>())
              .add(ev.getAttemptID());
        }
        req = new ContainerRequest(ev, PRIORITY_MAP);
      }
      maps.put(ev.getAttemptID(), req);
      addContainerReq(req);
    }

    void addReduce(ContainerRequest req) {
      reduces.put(req.attemptID, req);
      addContainerReq(req);
    }

    void assign(List<Container> allocated) {
      Iterator<Container> it = allocated.iterator();
      LOG.info("Got allocated containers " + allocated.size());
      containersAllocated += allocated.size();
      while (it.hasNext()) {
        Container c = it.next();
        if (!isContainerAssignable(c)) {
          containerNotAssigned(c);
          it.remove();
          continue;
        }
        if (isNodeBlacklisted(c.getNodeId().getHost())) {
          handleBlacklistedContainer(c);
          containerNotAssigned(c);
          it.remove();
        }
      }
      assignContainers(allocated);
      releaseUnassigned(allocated);
    }

    private boolean isContainerAssignable(Container c) {
      Priority p = c.getPriority();
      Resource r = c.getResource();
      if (PRIORITY_FAST_FAIL_MAP.equals(p) || PRIORITY_MAP.equals(p)) {
        return ResourceCalculatorUtils.computeAvailableContainers(r,
            mapResourceRequest, getSchedulerResourceTypes()) > 0 && !maps.isEmpty();
      }
      if (PRIORITY_REDUCE.equals(p)) {
        return ResourceCalculatorUtils.computeAvailableContainers(r,
            reduceResourceRequest, getSchedulerResourceTypes()) > 0 && !reduces.isEmpty();
      }
      LOG.warn("Container allocated at unwanted priority: " + p);
      return false;
    }

    private void handleBlacklistedContainer(Container c) {
      LOG.info("Got allocated container on a blacklisted host " + c.getNodeId()
          + ". Releasing container " + c);
      ContainerRequest toReplace = getContainerReqToReplace(c);
      if (toReplace != null) {
        LOG.info("Placing a new container request for task attempt "
            + toReplace.attemptID);
        ContainerRequest newReq = getFilteredContainerRequest(toReplace);
        decContainerReq(toReplace);
        if (toReplace.attemptID.getTaskId().getTaskType() == TaskType.MAP) {
          maps.put(newReq.attemptID, newReq);
        } else {
          reduces.put(newReq.attemptID, newReq);
        }
        addContainerReq(newReq);
      } else {
        LOG.info("Could not map allocated container to a valid request. Releasing "
            + c);
      }
    }

    private void assignContainers(List<Container> allocated) {
      Iterator<Container> it = allocated.iterator();
      while (it.hasNext()) {
        Container c = it.next();
        ContainerRequest assigned = assignWithoutLocality(c);
        if (assigned != null) {
          containerAssigned(c, assigned);
          it.remove();
        }
      }
      assignMapsWithLocality(allocated);
    }

    private ContainerRequest assignWithoutLocality(Container c) {
      Priority p = c.getPriority();
      if (PRIORITY_FAST_FAIL_MAP.equals(p)) {
        LOG.info("Assigning container " + c + " to fast fail map");
        return assignToFailedMap(c);
      }
      if (PRIORITY_REDUCE.equals(p)) {
        LOG.debug("Assigning container " + c + " to reduce");
        return assignToReduce(c);
      }
      return null;
    }

    private void assignMapsWithLocality(List<Container> allocated) {
      assignHostLocal(allocated);
      assignRackLocal(allocated);
      assignAny(allocated);
    }

    private void assignHostLocal(List<Container> allocated) {
      Iterator<Container> it = allocated.iterator();
      while (it.hasNext() && !maps.isEmpty() && canAssignMaps()) {
        Container c = it.next();
        String host = c.getNodeId().getHost();
        LinkedList<TaskAttemptId> list = mapsHostMapping.get(host);
        while (list != null && !list.isEmpty()) {
          TaskAttemptId tId = list.removeFirst();
          if (maps.containsKey(tId)) {
            ContainerRequest assigned = maps.remove(tId);
            containerAssigned(c, assigned);
            it.remove();
            JobCounterUpdateEvent jce = new JobCounterUpdateEvent(
                assigned.attemptID.getTaskId().getJobId());
            jce.addCounterUpdate(JobCounter.DATA_LOCAL_MAPS, 1);
            eventHandler.handle(jce);
            hostLocalAssigned++;
            LOG.debug("Assigned based on host match " + host);
            break;
          }
        }
      }
    }

    private void assignRackLocal(List<Container> allocated) {
      Iterator<Container> it = allocated.iterator();
      while (it.hasNext() && !maps.isEmpty() && canAssignMaps()) {
        Container c = it.next();
        String host = c.getNodeId().getHost();
        String rack = RackResolver.resolve(host).getNetworkLocation();
        LinkedList<TaskAttemptId> list = mapsRackMapping.get(rack);
        while (list != null && !list.isEmpty()) {
          TaskAttemptId tId = list.removeFirst();
          if (maps.containsKey(tId)) {
            ContainerRequest assigned = maps.remove(tId);
            containerAssigned(c, assigned);
            it.remove();
            JobCounterUpdateEvent jce = new JobCounterUpdateEvent(
                assigned.attemptID.getTaskId().getJobId());
            jce.addCounterUpdate(JobCounter.RACK_LOCAL_MAPS, 1);
            eventHandler.handle(jce);
            rackLocalAssigned++;
            LOG.debug("Assigned based on rack match " + rack);
            break;
          }
        }
      }
    }

    private void assignAny(List<Container> allocated) {
      Iterator<Container> it = allocated.iterator();
      while (it.hasNext() && !maps.isEmpty() && canAssignMaps()) {
        Container c = it.next();
        TaskAttemptId tId = maps.keySet().iterator().next();
        ContainerRequest assigned = maps.remove(tId);
        containerAssigned(c, assigned);
        it.remove();
        JobCounterUpdateEvent jce = new JobCounterUpdateEvent(
            assigned.attemptID.getTaskId().getJobId());
        jce.addCounterUpdate(JobCounter.OTHER_LOCAL_MAPS, 1);
        eventHandler.handle(jce);
        LOG.debug("Assigned based on * match");
      }
    }

    private ContainerRequest assignToFailedMap(Container c) {
      while (!earlierFailedMaps.isEmpty() && canAssignMaps()) {
        TaskAttemptId tId = earlierFailedMaps.removeFirst();
        if (maps.containsKey(tId)) {
          ContainerRequest assigned = maps.remove(tId);
          JobCounterUpdateEvent jce = new JobCounterUpdateEvent(
              assigned.attemptID.getTaskId().getJobId());
          jce.addCounterUpdate(JobCounter.OTHER_LOCAL_MAPS, 1);
          eventHandler.handle(jce);
          LOG.info("Assigned from earlierFailedMaps");
          return assigned;
        }
      }
      return null;
    }

    private ContainerRequest assignToReduce(Container c) {
      if (!reduces.isEmpty() && canAssignReduces()) {
        TaskAttemptId tId = reduces.keySet().iterator().next();
        ContainerRequest assigned = reduces.remove(tId);
        LOG.info("Assigned to reduce");
        return assigned;
      }
      return null;
    }

    private void containerAssigned(Container allocated,
        ContainerRequest assigned) {
      decContainerReq(assigned);
      eventHandler.handle(new TaskAttemptContainerAssignedEvent(
          assigned.attemptID, allocated, applicationACLs));
      assignedRequests.add(allocated, assigned.attemptID);
      LOG.debug("Assigned container (" + allocated + ") to task "
          + assigned.attemptID + " on node " + allocated.getNodeId());
    }

    private void containerNotAssigned(Container c) {
      containersReleased++;
      pendingRelease.add(c.getId());
      release(c.getId());
    }

    private void releaseUnassigned(List<Container> allocated) {
      for (Container c : allocated) {
        LOG.info("Releasing unassigned container " + c);
        containerNotAssigned(c);
      }
    }
  }

  @Private
  @VisibleForTesting
  class AssignedRequests {
    private final Map<ContainerId, TaskAttemptId> containerToAttemptMap = new HashMap<>();
    private final LinkedHashMap<TaskAttemptId, Container> maps = new LinkedHashMap<>();
    @VisibleForTesting
    final LinkedHashMap<TaskAttemptId, Container> reduces = new LinkedHashMap<>();
    @VisibleForTesting
    final Set<TaskAttemptId> preemptionWaitingReduces = new HashSet<>();

    void add(Container container, TaskAttemptId tId) {
      LOG.info("Assigned container " + container.getId() + " to " + tId);
      containerToAttemptMap.put(container.getId(), tId);
      if (tId.getTaskId().getTaskType().equals(TaskType.MAP)) {
        maps.put(tId, container);
      } else {
        reduces.put(tId, container);
      }
    }

    void preemptReduce(int toPreempt) {
      List<TaskAttemptId> list = new ArrayList<>(reduces.keySet());
      list.sort(Comparator.comparingDouble(o -> getJob()
          .getTask(o.getTaskId()).getAttempt(o).getProgress()));
      for (int i = 0; i < toPreempt && !list.isEmpty(); i++) {
        TaskAttemptId id = list.remove(0);
        LOG.info("Preempting " + id);
        preemptionWaitingReduces.add(id);
        eventHandler.handle(new TaskAttemptKillEvent(id, RAMPDOWN_DIAGNOSTIC));
      }
    }

    boolean remove(TaskAttemptId tId) {
      ContainerId cid = null;
      if (tId.getTaskId().getTaskType().equals(TaskType.MAP)) {
        cid = maps.remove(tId).getId();
      } else {
        cid = reduces.remove(tId).getId();
        if (cid != null) {
          if (preemptionWaitingReduces.remove(tId)) {
            LOG.info("Reduce preemption successful " + tId);
          }
        }
      }
      if (cid != null) {
        containerToAttemptMap.remove(cid);
        return true;
      }
      return false;
    }

    TaskAttemptId get(ContainerId cId) {
      return containerToAttemptMap.get(cId);
    }

    ContainerId get(TaskAttemptId tId) {
      Container c = tId.getTaskId().getTaskType().equals(TaskType.MAP)
          ? maps.get(tId) : reduces.get(tId);
      return c == null ? null : c.getId();
    }
  }

  private class ScheduleStats {
    int numPendingReduces;
    int numScheduledMaps;
    int numScheduledReduces;
    int numAssignedMaps;
    int numAssignedReduces;
    int numCompletedMaps;
    int numCompletedReduces;
    int numContainersAllocated;
    int numContainersReleased;

    public void updateAndLogIfChanged(String prefix) {
      boolean changed = false;
      synchronized (RMContainerAllocator.this) {
        changed |= numPendingReduces != pendingReduces.size();
        numPendingReduces = pendingReduces.size();
        changed |= numScheduledMaps != scheduledRequests.maps.size();
        numScheduledMaps = scheduledRequests.maps.size();
        changed |= numScheduledReduces != scheduledRequests.reduces.size();
        numScheduledReduces = scheduledRequests.reduces.size();
        changed |= numAssignedMaps != assignedRequests.maps.size();
        numAssignedMaps = assignedRequests.maps.size();
        changed |= numAssignedReduces != assignedRequests.reduces.size();
        numAssignedReduces = assignedRequests.reduces.size();
        changed |= numCompletedMaps != getJob().getCompletedMaps();
        numCompletedMaps = getJob().getCompletedMaps();
        changed |= numCompletedReduces != getJob().getCompletedReduces();
        numCompletedReduces = getJob().getCompletedReduces();
        changed |= numContainersAllocated != containersAllocated;
        numContainersAllocated = containersAllocated;
        changed |= numContainersReleased != containersReleased;
        numContainersReleased = containersReleased;
      }
      if (changed) {
        log(prefix);
      }
    }

    public void log(String prefix) {
      LOG.info(prefix + "PendingReds:" + numPendingReduces
          + " ScheduledMaps:" + numScheduledMaps
          + " ScheduledReds:" + numScheduledReduces
          + " AssignedMaps:" + numAssignedMaps
          + " AssignedReds:" + numAssignedReduces
          + " CompletedMaps:" + numCompletedMaps
          + " CompletedReds:" + numCompletedReduces
          + " ContAlloc:" + numContainersAllocated
          + " ContRel:" + numContainersReleased
          + " HostLocal:" + hostLocalAssigned
          + " RackLocal:" + rackLocalAssigned);
    }
  }
}