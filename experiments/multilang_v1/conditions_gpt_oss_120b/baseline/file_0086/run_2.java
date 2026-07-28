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
* software distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
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
  
  public static final 
  float DEFAULT_COMPLETED_MAPS_PERCENT_FOR_REDUCE_SLOWSTART = 0.05f;
  
  static final Priority PRIORITY_FAST_FAIL_MAP;
  static final Priority PRIORITY_REDUCE;
  static final Priority PRIORITY_MAP;

  @VisibleForTesting
  public static final String RAMPDOWN_DIAGNOSTIC = "Reducer preempted "
      + "to make room for pending map attempts";

  private Thread eventHandlingThread;
  private final AtomicBoolean stopped;

  static {
    PRIORITY_FAST_FAIL_MAP = RecordFactoryProvider.getRecordFactory(null).newRecordInstance(Priority.class);
    PRIORITY_FAST_FAIL_MAP.setPriority(5);
    PRIORITY_REDUCE = RecordFactoryProvider.getRecordFactory(null).newRecordInstance(Priority.class);
    PRIORITY_REDUCE.setPriority(10);
    PRIORITY_MAP = RecordFactoryProvider.getRecordFactory(null).newRecordInstance(Priority.class);
    PRIORITY_MAP.setPriority(20);
  }
  
  //reduces which are not yet scheduled
  private final LinkedList<ContainerRequest> pendingReduces = 
    new LinkedList<ContainerRequest>();

  //holds information about the assigned containers to task attempts
  private final AssignedRequests assignedRequests = new AssignedRequests();
  
  //holds scheduled requests to be fulfilled by RM
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
  protected BlockingQueue<ContainerAllocatorEvent> eventQueue
    = new LinkedBlockingQueue<ContainerAllocatorEvent>();

  private ScheduleStats scheduleStats = new ScheduleStats();

  public RMContainerAllocator(ClientService clientService, AppContext context) {
    super(clientService, context);
    this.stopped = new AtomicBoolean(false);
    this.clock = context.getClock();
  }

  @Override
  protected void serviceInit(Configuration conf) throws Exception {
    super.serviceInit(conf);
    reduceSlowStart = conf.getFloat(
        MRJobConfig.COMPLETED_MAPS_FOR_REDUCE_SLOWSTART, 
        DEFAULT_COMPLETED_MAPS_PERCENT_FOR_REDUCE_SLOWSTART);
    maxReduceRampupLimit = conf.getFloat(
        MRJobConfig.MR_AM_JOB_REDUCE_RAMPUP_UP_LIMIT, 
        MRJobConfig.DEFAULT_MR_AM_JOB_REDUCE_RAMP_UP_LIMIT);
    maxReducePreemptionLimit = conf.getFloat(
        MRJobConfig.MR_AM_JOB_REDUCE_PREEMPTION_LIMIT,
        MRJobConfig.DEFAULT_MR_AM_JOB_REDUCE_PREEMPTION_LIMIT);
    allocationDelayThresholdMs = conf.getInt(
        MRJobConfig.MR_JOB_REDUCER_PREEMPT_DELAY_SEC,
        MRJobConfig.DEFAULT_MR_JOB_REDUCER_PREEMPT_DELAY_SEC) * 1000;//sec -> ms
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

        ContainerAllocatorEvent event;

        while (!stopped.get() && !Thread.currentThread().isInterrupted()) {
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
            LOG.error("Error in handling event type " + event.getType()
                + " to the ContainreAllocator", t);
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
    List<Container> allocatedContainers = getResources();
    if (allocatedContainers != null && !allocatedContainers.isEmpty()) {
      scheduledRequests.assign(allocatedContainers);
    }

    int completedMaps = getJob().getCompletedMaps();
    int completedTasks = completedMaps + getJob().getCompletedReduces();
    if ((lastCompletedTasks != completedTasks) ||
          (scheduledRequests.maps.size() > 0)) {
      lastCompletedTasks = completedTasks;
      recalculateReduceSchedule = true;
    }

    if (recalculateReduceSchedule) {
      preemptReducesIfNeeded();
      scheduleReduces(
          getJob().getTotalMaps(), completedMaps,
          scheduledRequests.maps.size(), scheduledRequests.reduces.size(), 
          assignedRequests.maps.size(), assignedRequests.reduces.size(),
          mapResourceRequest, reduceResourceRequest,
          pendingReduces.size(), 
          maxReduceRampupLimit, reduceSlowStart);
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
      LOG.warn("Very low remaining capacity in the event-queue "
          + "of RMContainerAllocator: " + remCapacity);
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
    switch (event.getType()) {
      case CONTAINER_REQ:
        handleContainerRequest((ContainerRequestEvent) event);
        break;
      case CONTAINER_DEALLOCATE:
        handleContainerDeallocate(event);
        break;
      case CONTAINER_FAILED:
        handleContainerFailed((ContainerFailedEvent) event);
        break;
      default:
        LOG.warn("Unhandled event type: " + event.getType());
    }
  }

  private void handleContainerRequest(ContainerRequestEvent reqEvent) {
    JobId jobId = getJob().getID();
    Resource supportedMaxContainerCapability = getMaxContainerCapability();

    if (reqEvent.getAttemptID().getTaskId().getTaskType().equals(TaskType.MAP)) {
      if (mapResourceRequest.equals(Resources.none())) {
        mapResourceRequest = reqEvent.getCapability();
        eventHandler.handle(new JobHistoryEvent(jobId,
          new NormalizedResourceEvent(
            org.apache.hadoop.mapreduce.TaskType.MAP, mapResourceRequest.getMemory())));
        LOG.info("mapResourceRequest:" + mapResourceRequest);
        validateResourceCapability(mapResourceRequest, supportedMaxContainerCapability, jobId);
      }
      reqEvent.getCapability().setMemory(mapResourceRequest.getMemory());
      reqEvent.getCapability().setVirtualCores(mapResourceRequest.getVirtualCores());
      scheduledRequests.addMap(reqEvent);
    } else {
      if (reduceResourceRequest.equals(Resources.none())) {
        reduceResourceRequest = reqEvent.getCapability();
        eventHandler.handle(new JobHistoryEvent(jobId,
          new NormalizedResourceEvent(
            org.apache.hadoop.mapreduce.TaskType.REDUCE,
            reduceResourceRequest.getMemory())));
        LOG.info("reduceResourceRequest:" + reduceResourceRequest);
        validateResourceCapability(reduceResourceRequest, supportedMaxContainerCapability, jobId);
      }
      reqEvent.getCapability().setMemory(reduceResourceRequest.getMemory());
      reqEvent.getCapability().setVirtualCores(reduceResourceRequest.getVirtualCores());
      if (reqEvent.getEarlierAttemptFailed()) {
        pendingReduces.addFirst(new ContainerRequest(reqEvent, PRIORITY_REDUCE));
      } else {
        pendingReduces.add(new ContainerRequest(reqEvent, PRIORITY_REDUCE));
      }
    }
  }

  private void validateResourceCapability(Resource request, Resource maxCapability, JobId jobId) {
    if (request.getMemory() > maxCapability.getMemory()
        || request.getVirtualCores() > maxCapability.getVirtualCores()) {
      String diagMsg = "Capability required (" + request + ") exceeds max container capability ("
          + maxCapability + "). Killing the Job.";
      LOG.info(diagMsg);
      eventHandler.handle(new JobDiagnosticsUpdateEvent(jobId, diagMsg));
      eventHandler.handle(new JobEvent(jobId, JobEventType.JOB_KILL));
    }
  }

  private void handleContainerDeallocate(ContainerAllocatorEvent event) {
    LOG.info("Processing the event " + event.toString());
    TaskAttemptId aId = event.getAttemptID();

    boolean removed = scheduledRequests.remove(aId);
    if (!removed) {
      ContainerId containerId = assignedRequests.get(aId);
      if (containerId != null) {
        removed = true;
        assignedRequests.remove(aId);
        containersReleased++;
        pendingRelease.add(containerId);
        release(containerId);
      }
    }
    if (!removed) {
      LOG.error("Could not deallocate container for task attemptId " + aId);
    }
  }

  private void handleContainerFailed(ContainerFailedEvent fEv) {
    String host = getHost(fEv.getContMgrAddress());
    containerFailedOnHost(host);
  }

  private static String getHost(String contMgrAddress) {
    String host = contMgrAddress;
    String[] hostport = host.split(":");
    if (hostport.length == 2) {
      host = hostport[0];
    }
    return host;
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
    if (scheduledRequests.maps.size() > 0) {
      Resource resourceLimit = getResourceLimit();
      Resource availableForMap = Resources.subtract(
          resourceLimit,
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

        int hangingMaps = getNumOfHangingRequests(scheduledRequests.maps);
        if (hangingMaps > 0) {
          int preemptOneMap = ResourceCalculatorUtils.divideAndCeilContainers(
              mapResourceRequest, reduceResourceRequest, getSchedulerResourceTypes());
          int preemptLimit = ResourceCalculatorUtils.divideAndCeilContainers(
              Resources.multiply(resourceLimit, maxReducePreemptionLimit),
              reduceResourceRequest, getSchedulerResourceTypes());
          int preemptAllMaps = ResourceCalculatorUtils.divideAndCeilContainers(
              Resources.multiply(mapResourceRequest, hangingMaps),
              reduceResourceRequest, getSchedulerResourceTypes());
          int toPreempt = Math.min(Math.max(preemptOneMap, preemptLimit), preemptAllMaps);
          LOG.info("Going to preempt " + toPreempt + " due to lack of space for maps");
          assignedRequests.preemptReduce(toPreempt);
        }
      }
    }
  }

  private int getNumOfHangingRequests(Map<TaskAttemptId, ContainerRequest> requestMap) {
    if (allocationDelayThresholdMs <= 0) {
      return requestMap.size();
    }
    int hanging = 0;
    long now = clock.getTime();
    for (ContainerRequest req : requestMap.values()) {
      if (now - req.requestTimeMs > allocationDelayThresholdMs) {
        hanging++;
      }
    }
    return hanging;
  }

  @Private
  public void scheduleReduces(
      int totalMaps, int completedMaps,
      int scheduledMaps, int scheduledReduces,
      int assignedMaps, int assignedReduces,
      Resource mapRes, Resource reduceRes,
      int pendingReducesCount,
      float maxRampup, float slowStart) {

    if (pendingReducesCount == 0) {
      return;
    }

    Resource headRoom = getAvailableResources();
    if (headRoom == null) {
      headRoom = Resources.none();
    }

    LOG.info("Recalculating schedule, headroom=" + headRoom);
    if (!reduceStarted) {
      if (!checkAndStartReduce(completedMaps, totalMaps, slowStart)) {
        return;
      }
    }

    if (scheduledMaps == 0) {
      LOG.info("All maps assigned. Ramping up all remaining reduces:" + pendingReducesCount);
      scheduleAllReduces();
      return;
    }

    computeAndApplyRamp(pendingReducesCount, totalMaps, completedMaps,
        scheduledMaps, scheduledReduces, assignedMaps, assignedReduces,
        mapRes, reduceRes, maxRampup);
  }

  private boolean checkAndStartReduce(int completedMaps, int totalMaps, float slowStart) {
    int threshold = (int) Math.ceil(slowStart * totalMaps);
    if (completedMaps < threshold) {
      LOG.info("Reduce slow start threshold not met. completedMapsForReduceSlowstart " + threshold);
      return false;
    }
    LOG.info("Reduce slow start threshold reached. Scheduling reduces.");
    setIsReduceStarted(true);
    return true;
  }

  private void computeAndApplyRamp(int pendingReducesCount, int totalMaps, int completedMaps,
      int scheduledMaps, int scheduledReduces, int assignedMaps, int assignedReduces,
      Resource mapRes, Resource reduceRes, float maxRampup) {

    float completedMapPercent = totalMaps == 0 ? 1f : (float) completedMaps / totalMaps;

    Resource netMap = Resources.multiply(mapRes, scheduledMaps + assignedMaps);
    Resource netReduce = Resources.multiply(reduceRes, scheduledReduces + assignedReduces);
    Resource totalLimit = getResourceLimit();

    Resource idealReduce = Resources.multiply(totalLimit,
        Math.min(completedMapPercent, maxRampup));
    Resource idealMap = Resources.subtract(totalLimit, idealReduce);

    Resource finalMap;
    Resource finalReduce;

    if (ResourceCalculatorUtils.computeAvailableContainers(idealMap, mapRes,
        getSchedulerResourceTypes()) >= (scheduledMaps + assignedMaps)) {
      Resource unusedMap = Resources.subtract(idealMap, netMap);
      finalReduce = Resources.add(idealReduce, unusedMap);
      finalMap = Resources.subtract(totalLimit, finalReduce);
    } else {
      finalMap = idealMap;
      finalReduce = idealReduce;
    }

    LOG.info("completedMapPercent " + completedMapPercent
        + " totalResourceLimit:" + totalLimit
        + " finalMapResourceLimit:" + finalMap
        + " finalReduceResourceLimit:" + finalReduce
        + " netScheduledMapResource:" + netMap
        + " netScheduledReduceResource:" + netReduce);

    int ramp = ResourceCalculatorUtils.computeAvailableContainers(
        Resources.subtract(finalReduce, netReduce), reduceRes, getSchedulerResourceTypes());

    if (ramp > 0) {
      ramp = Math.min(ramp, pendingReducesCount);
      LOG.info("Ramping up " + ramp);
      rampUpReduces(ramp);
    } else if (ramp < 0) {
      int rampDown = Math.min(-ramp, scheduledReduces);
      LOG.info("Ramping down " + rampDown);
      rampDownReduces(rampDown);
    }
  }

  @Private
  public void scheduleAllReduces() {
    for (ContainerRequest req : pendingReduces) {
      scheduledRequests.addReduce(req);
    }
    pendingReduces.clear();
  }
  
  @Private
  public void rampUpReduces(int rampUp) {
    for (int i = 0; i < rampUp; i++) {
      ContainerRequest request = pendingReduces.removeFirst();
      scheduledRequests.addReduce(request);
    }
  }
  
  @Private
  public void rampDownReduces(int rampDown) {
    for (int i = 0; i < rampDown; i++) {
      ContainerRequest request = scheduledRequests.removeReduce();
      pendingReduces.add(request);
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
      eventHandler.handle(new JobEvent(this.getJob().getID(),
        JobEventType.JOB_AM_REBOOT));
      throw new YarnRuntimeException(
        "Resource Manager doesn't recognize AttemptId: "
            + this.getContext().getApplicationAttemptId(), e);
    } catch (ApplicationMasterNotRegisteredException e) {
      LOG.info("ApplicationMaster out of sync with RM, resyncing.");
      lastResponseID = 0;
      register();
      addOutstandingRequestOnResync();
      return null;
    } catch (Exception e) {
      if (System.currentTimeMillis() - retrystartTime >= retryInterval) {
        LOG.error("Could not contact RM after " + retryInterval + " ms.");
        eventHandler.handle(new JobEvent(this.getJob().getID(),
                                         JobEventType.JOB_AM_REBOOT));
        throw new YarnRuntimeException("Could not contact RM after " +
                                retryInterval + " ms.");
      }
      throw e;
    }

    Resource newHeadRoom = getAvailableResources() == null ? Resources.none()
        : getAvailableResources();
    List<Container> newContainers = response.getAllocatedContainers();

    if (response.getNMTokens() != null) {
      for (NMToken nmToken : response.getNMTokens()) {
        NMTokenCache.setNMToken(nmToken.getNodeId().toString(),
            nmToken.getToken());
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

    for (ContainerStatus cont : finished) {
      LOG.info("Received completed container " + cont.getContainerId());
      TaskAttemptId attemptID = assignedRequests.get(cont.getContainerId());
      if (attemptID == null) {
        LOG.error("Container complete event for unknown container id "
            + cont.getContainerId());
      } else {
        pendingRelease.remove(cont.getContainerId());
        assignedRequests.remove(attemptID);
        eventHandler.handle(createContainerFinishedEvent(cont, attemptID));
        String diagnostics = StringInterner.weakIntern(cont.getDiagnostics());
        eventHandler.handle(new TaskAttemptDiagnosticsUpdateEvent(attemptID,
            diagnostics));
      }
    }
    return newContainers;
  }

  private void applyConcurrentTaskLimits() {
    int scheduledMaps = scheduledRequests.maps.size();
    if (maxRunningMaps > 0 && scheduledMaps > 0) {
      int maxRequestedMaps = Math.max(0,
          maxRunningMaps - assignedRequests.maps.size());
      int scheduledFailed = scheduledRequests.earlierFailedMaps.size();
      int failLimit = Math.min(maxRequestedMaps, scheduledFailed);
      int normalLimit = Math.min(maxRequestedMaps - failLimit,
          scheduledMaps - scheduledFailed);
      setRequestLimit(PRIORITY_FAST_FAIL_MAP, mapResourceRequest, failLimit);
      setRequestLimit(PRIORITY_MAP, mapResourceRequest, normalLimit);
    }

    int scheduledReduces = scheduledRequests.reduces.size();
    if (maxRunningReduces > 0 && scheduledReduces > 0) {
      int maxRequestedReduces = Math.max(0,
          maxRunningReduces - assignedRequests.reduces.size());
      int limit = Math.min(maxRequestedReduces, scheduledReduces);
      setRequestLimit(PRIORITY_REDUCE, reduceResourceRequest, limit);
    }
  }

  private boolean canAssignMaps() {
    return maxRunningMaps <= 0 || assignedRequests.maps.size() < maxRunningMaps;
  }

  private boolean canAssignReduces() {
    return maxRunningReduces <= 0 || assignedRequests.reduces.size() < maxRunningReduces;
  }

  private void updateAMRMToken(Token token) throws IOException {
    org.apache.hadoop.security.token.Token<AMRMTokenIdentifier> amrmToken =
        new org.apache.hadoop.security.token.Token<AMRMTokenIdentifier>(token
          .getIdentifier().array(), token.getPassword().array(), new Text(
          token.getKind()), new Text(token.getService()));
    UserGroupInformation currentUGI = UserGroupInformation.getCurrentUser();
    currentUGI.addToken(amrmToken);
    amrmToken.setService(ClientRMProxy.getAMRMTokenService(getConfig()));
  }

  @VisibleForTesting
  public TaskAttemptEvent createContainerFinishedEvent(ContainerStatus cont,
      TaskAttemptId attemptID) {
    if (cont.getExitStatus() == ContainerExitStatus.ABORTED
        || cont.getExitStatus() == ContainerExitStatus.PREEMPTED) {
      return new TaskAttemptEvent(attemptID,
          TaskAttemptEventType.TA_KILL);
    } else {
      return new TaskAttemptEvent(attemptID,
          TaskAttemptEventType.TA_CONTAINER_COMPLETED);
    }
  }
  
  @SuppressWarnings("unchecked")
  private void handleUpdatedNodes(AllocateResponse response) {
    List<NodeReport> updatedNodes = response.getUpdatedNodes();
    if (updatedNodes.isEmpty()) {
      return;
    }

    eventHandler.handle(new JobUpdatedNodesEvent(getJob().getID(),
        updatedNodes));

    HashSet<NodeId> unusable = new HashSet<NodeId>();
    for (NodeReport nr : updatedNodes) {
      if (nr.getNodeState().isUnusable()) {
        unusable.add(nr.getNodeId());
      }
    }

    for (int i = 0; i < 2; ++i) {
      Map<TaskAttemptId, Container> taskSet = i == 0 ? assignedRequests.maps
          : assignedRequests.reduces;
      for (Entry<TaskAttemptId, Container> entry : taskSet.entrySet()) {
        TaskAttemptId tid = entry.getKey();
        NodeId nodeId = entry.getValue().getNodeId();
        if (unusable.contains(nodeId)) {
          LOG.info("Killing taskAttempt:" + tid
              + " because it is running on unusable node:" + nodeId);
          eventHandler.handle(new TaskAttemptKillEvent(tid,
              "TaskAttempt killed because it ran on unusable node"
                  + nodeId));
        }
      }
    }
  }

  @Private
  public Resource getResourceLimit() {
    Resource headRoom = getAvailableResources();
    if (headRoom == null) {
      headRoom = Resources.none();
    }
    Resource assignedMap = Resources.multiply(mapResourceRequest,
        assignedRequests.maps.size());
    Resource assignedReduce = Resources.multiply(reduceResourceRequest,
        assignedRequests.reduces.size());
    return Resources.add(headRoom,
        Resources.add(assignedMap, assignedReduce));
  }

  @Private
  @VisibleForTesting
  class ScheduledRequests {
    
    private final LinkedList<TaskAttemptId> earlierFailedMaps = 
      new LinkedList<TaskAttemptId>();
    
    private final Map<String, LinkedList<TaskAttemptId>> mapsHostMapping = 
      new HashMap<String, LinkedList<TaskAttemptId>>();
    private final Map<String, LinkedList<TaskAttemptId>> mapsRackMapping = 
      new HashMap<String, LinkedList<TaskAttemptId>>();
    @VisibleForTesting
    final Map<TaskAttemptId, ContainerRequest> maps =
      new LinkedHashMap<TaskAttemptId, ContainerRequest>();
    
    private final LinkedHashMap<TaskAttemptId, ContainerRequest> reduces = 
      new LinkedHashMap<TaskAttemptId, ContainerRequest>();
    
    boolean remove(TaskAttemptId tId) {
      ContainerRequest req = null;
      if (tId.getTaskId().getTaskType().equals(TaskType.MAP)) {
        req = maps.remove(tId);
      } else {
        req = reduces.remove(tId);
      }
      
      if (req == null) {
        return false;
      } else {
        decContainerReq(req);
        return true;
      }
    }
    
    ContainerRequest removeReduce() {
      Iterator<Entry<TaskAttemptId, ContainerRequest>> it = reduces.entrySet().iterator();
      if (it.hasNext()) {
        Entry<TaskAttemptId, ContainerRequest> entry = it.next();
        it.remove();
        decContainerReq(entry.getValue());
        return entry.getValue();
      }
      return null;
    }
    
    void addMap(ContainerRequestEvent event) {
      ContainerRequest request;
      if (event.getEarlierAttemptFailed()) {
        earlierFailedMaps.add(event.getAttemptID());
        request = new ContainerRequest(event, PRIORITY_FAST_FAIL_MAP);
        LOG.info("Added "+event.getAttemptID()+" to list of failed maps");
      } else {
        for (String host : event.getHosts()) {
          mapsHostMapping.computeIfAbsent(host, k -> new LinkedList<>())
              .add(event.getAttemptID());
          if (LOG.isDebugEnabled()) {
            LOG.debug("Added attempt req to host " + host);
          }
        }
        for (String rack : event.getRacks()) {
          mapsRackMapping.computeIfAbsent(rack, k -> new LinkedList<>())
              .add(event.getAttemptID());
          if (LOG.isDebugEnabled()) {
            LOG.debug("Added attempt req to rack " + rack);
          }
        }
        request = new ContainerRequest(event, PRIORITY_MAP);
      }
      maps.put(event.getAttemptID(), request);
      addContainerReq(request);
    }
    
    void addReduce(ContainerRequest req) {
      reduces.put(req.attemptID, req);
      addContainerReq(req);
    }
    
    private void assign(List<Container> allocatedContainers) {
      Iterator<Container> it = allocatedContainers.iterator();
      LOG.info("Got allocated containers " + allocatedContainers.size());
      containersAllocated += allocatedContainers.size();
      while (it.hasNext()) {
        Container allocated = it.next();
        if (LOG.isDebugEnabled()) {
          LOG.debug("Assigning container " + allocated.getId()
              + " with priority " + allocated.getPriority() + " to NM "
              + allocated.getNodeId());
        }
        if (!isContainerAssignable(allocated)) {
          containerNotAssigned(allocated);
          it.remove();
          continue;
        }
        if (isNodeBlacklisted(allocated.getNodeId().getHost())) {
          handleBlacklistedContainer(allocated);
          it.remove();
          continue;
        }
      }
      assignContainers(allocatedContainers);
       
      it = allocatedContainers.iterator();
      while (it.hasNext()) {
        Container allocated = it.next();
        LOG.info("Releasing unassigned container " + allocated);
        containerNotAssigned(allocated);
      }
    }

    private boolean isContainerAssignable(Container allocated) {
      Priority priority = allocated.getPriority();
      Resource allocatedRes = allocated.getResource();
      if (PRIORITY_FAST_FAIL_MAP.equals(priority) || PRIORITY_MAP.equals(priority)) {
        return ResourceCalculatorUtils.computeAvailableContainers(allocatedRes,
            mapResourceRequest, getSchedulerResourceTypes()) > 0 && !maps.isEmpty();
      } else if (PRIORITY_REDUCE.equals(priority)) {
        return ResourceCalculatorUtils.computeAvailableContainers(allocatedRes,
            reduceResourceRequest, getSchedulerResourceTypes()) > 0 && !reduces.isEmpty();
      } else {
        LOG.warn("Container allocated at unwanted priority: " + priority 
            + ". Returning to RM...");
        return false;
      }
    }

    private void handleBlacklistedContainer(Container allocated) {
      LOG.info("Got allocated container on a blacklisted host "
          + allocated.getNodeId().getHost()
          + ". Releasing container " + allocated);
      ContainerRequest toReplace = getContainerReqToReplace(allocated);
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
        LOG.info("Could not map allocated container to a valid request."
            + " Releasing allocated container " + allocated);
      }
      containerNotAssigned(allocated);
    }

    @SuppressWarnings("unchecked")
    private void containerAssigned(Container allocated, 
                                    ContainerRequest assigned) {
      decContainerReq(assigned);
      eventHandler.handle(new TaskAttemptContainerAssignedEvent(
          assigned.attemptID, allocated, applicationACLs));
      assignedRequests.add(allocated, assigned.attemptID);
      if (LOG.isDebugEnabled()) {
        LOG.info("Assigned container (" + allocated + ") "
            + " to task " + assigned.attemptID + " on node "
            + allocated.getNodeId().toString());
      }
    }
    
    private void containerNotAssigned(Container allocated) {
      containersReleased++;
      pendingRelease.add(allocated.getId());
      release(allocated.getId());      
    }
    
    private ContainerRequest assignWithoutLocality(Container allocated) {
      Priority priority = allocated.getPriority();
      if (PRIORITY_FAST_FAIL_MAP.equals(priority)) {
        LOG.info("Assigning container " + allocated + " to fast fail map");
        return assignToFailedMap(allocated);
      } else if (PRIORITY_REDUCE.equals(priority)) {
        if (LOG.isDebugEnabled()) {
          LOG.debug("Assigning container " + allocated + " to reduce");
        }
        return assignToReduce(allocated);
      }
      return null;
    }
        
    private void assignContainers(List<Container> allocatedContainers) {
      Iterator<Container> it = allocatedContainers.iterator();
      while (it.hasNext()) {
        Container allocated = it.next();
        ContainerRequest assigned = assignWithoutLocality(allocated);
        if (assigned != null) {
          containerAssigned(allocated, assigned);
          it.remove();
        }
      }
      assignMapsWithLocality(allocatedContainers);
    }
    
    private ContainerRequest getContainerReqToReplace(Container allocated) {
      LOG.info("Finding containerReq for allocated container: " + allocated);
      Priority priority = allocated.getPriority();
      if (PRIORITY_FAST_FAIL_MAP.equals(priority)) {
        LOG.info("Replacing FAST_FAIL_MAP container " + allocated.getId());
        for (TaskAttemptId tId : earlierFailedMaps) {
          ContainerRequest cr = maps.get(tId);
          if (cr != null) {
            earlierFailedMaps.remove(tId);
            return maps.remove(tId);
          }
        }
      } else if (PRIORITY_MAP.equals(priority)) {
        LOG.info("Replacing MAP container " + allocated.getId());
        String host = allocated.getNodeId().getHost();
        LinkedList<TaskAttemptId> list = mapsHostMapping.get(host);
        if (list != null && !list.isEmpty()) {
          TaskAttemptId tId = list.removeLast();
          if (maps.containsKey(tId)) {
            return maps.remove(tId);
          }
        }
        if (!maps.isEmpty()) {
          TaskAttemptId tId = maps.keySet().iterator().next();
          return maps.remove(tId);
        }
      } else if (PRIORITY_REDUCE.equals(priority)) {
        if (!reduces.isEmpty()) {
          TaskAttemptId tId = reduces.keySet().iterator().next();
          return reduces.remove(tId);
        }
      }
      LOG.info("Found replacement: null");
      return null;
    }
    
    private ContainerRequest assignToFailedMap(Container allocated) {
      while (!earlierFailedMaps.isEmpty() && canAssignMaps()) {
        TaskAttemptId tId = earlierFailedMaps.removeFirst();      
        if (maps.containsKey(tId)) {
          ContainerRequest assigned = maps.remove(tId);
          JobCounterUpdateEvent jce =
            new JobCounterUpdateEvent(assigned.attemptID.getTaskId().getJobId());
          jce.addCounterUpdate(JobCounter.OTHER_LOCAL_MAPS, 1);
          eventHandler.handle(jce);
          LOG.info("Assigned from earlierFailedMaps");
          return assigned;
        }
      }
      return null;
    }
    
    private ContainerRequest assignToReduce(Container allocated) {
      if (!reduces.isEmpty() && canAssignReduces()) {
        TaskAttemptId tId = reduces.keySet().iterator().next();
        ContainerRequest assigned = reduces.remove(tId);
        LOG.info("Assigned to reduce");
        return assigned;
      }
      return null;
    }
    
    @SuppressWarnings("unchecked")
    private void assignMapsWithLocality(List<Container> allocatedContainers) {
      Iterator<Container> it = allocatedContainers.iterator();
      while (it.hasNext() && !maps.isEmpty() && canAssignMaps()) {
        Container allocated = it.next();        
        String host = allocated.getNodeId().getHost();
        LinkedList<TaskAttemptId> list = mapsHostMapping.get(host);
        while (list != null && !list.isEmpty()) {
          TaskAttemptId tId = list.removeFirst();
          if (maps.containsKey(tId)) {
            ContainerRequest assigned = maps.remove(tId);
            containerAssigned(allocated, assigned);
            it.remove();
            JobCounterUpdateEvent jce =
              new JobCounterUpdateEvent(assigned.attemptID.getTaskId().getJobId());
            jce.addCounterUpdate(JobCounter.DATA_LOCAL_MAPS, 1);
            eventHandler.handle(jce);
            hostLocalAssigned++;
            break;
          }
        }
      }
      
      it = allocatedContainers.iterator();
      while (it.hasNext() && !maps.isEmpty() && canAssignMaps()) {
        Container allocated = it.next();
        String host = allocated.getNodeId().getHost();
        String rack = RackResolver.resolve(host).getNetworkLocation();
        LinkedList<TaskAttemptId> list = mapsRackMapping.get(rack);
        while (list != null && !list.isEmpty()) {
          TaskAttemptId tId = list.removeFirst();
          if (maps.containsKey(tId)) {
            ContainerRequest assigned = maps.remove(tId);
            containerAssigned(allocated, assigned);
            it.remove();
            JobCounterUpdateEvent jce =
              new JobCounterUpdateEvent(assigned.attemptID.getTaskId().getJobId());
            jce.addCounterUpdate(JobCounter.RACK_LOCAL_MAPS, 1);
            eventHandler.handle(jce);
            rackLocalAssigned++;
            break;
          }
        }
      }
      
      it = allocatedContainers.iterator();
      while (it.hasNext() && !maps.isEmpty() && canAssignMaps()) {
        Container allocated = it.next();
        TaskAttemptId tId = maps.keySet().iterator().next();
        ContainerRequest assigned = maps.remove(tId);
        containerAssigned(allocated, assigned);
        it.remove();
        JobCounterUpdateEvent jce =
          new JobCounterUpdateEvent(assigned.attemptID.getTaskId().getJobId());
        jce.addCounterUpdate(JobCounter.OTHER_LOCAL_MAPS, 1);
        eventHandler.handle(jce);
      }
    }
  }

  @Private
  @VisibleForTesting
  class AssignedRequests {
    private final Map<ContainerId, TaskAttemptId> containerToAttemptMap =
      new HashMap<ContainerId, TaskAttemptId>();
    private final LinkedHashMap<TaskAttemptId, Container> maps = 
      new LinkedHashMap<TaskAttemptId, Container>();
    @VisibleForTesting
    final LinkedHashMap<TaskAttemptId, Container> reduces =
      new LinkedHashMap<TaskAttemptId, Container>();
    @VisibleForTesting
    final Set<TaskAttemptId> preemptionWaitingReduces =
      new HashSet<TaskAttemptId>();
    
    void add(Container container, TaskAttemptId tId) {
      LOG.info("Assigned container " + container.getId().toString() + " to " + tId);
      containerToAttemptMap.put(container.getId(), tId);
      if (tId.getTaskId().getTaskType().equals(TaskType.MAP)) {
        maps.put(tId, container);
      } else {
        reduces.put(tId, container);
      }
    }

    void preemptReduce(int toPreempt) {
      List<TaskAttemptId> reduceList = new ArrayList<>(reduces.keySet());
      Collections.sort(reduceList, new Comparator<TaskAttemptId>() {
        @Override
        public int compare(TaskAttemptId o1, TaskAttemptId o2) {
          return Float.compare(
              getJob().getTask(o1.getTaskId()).getAttempt(o1).getProgress(),
              getJob().getTask(o2.getTaskId()).getAttempt(o2).getProgress());
        }
      });
      
      for (int i = 0; i < toPreempt && !reduceList.isEmpty(); i++) {
        TaskAttemptId id = reduceList.remove(0);
        LOG.info("Preempting " + id);
        preemptionWaitingReduces.add(id);
        eventHandler.handle(new TaskAttemptKillEvent(id, RAMPDOWN_DIAGNOSTIC));
      }
    }
    
    boolean remove(TaskAttemptId tId) {
      ContainerId containerId = null;
      if (tId.getTaskId().getTaskType().equals(TaskType.MAP)) {
        Container c = maps.remove(tId);
        if (c != null) {
          containerId = c.getId();
        }
      } else {
        Container c = reduces.remove(tId);
        if (c != null) {
          containerId = c.getId();
        }
        if (containerId != null) {
          boolean preempted = preemptionWaitingReduces.remove(tId);
          if (preempted) {
            LOG.info("Reduce preemption successful " + tId);
          }
        }
      }
      
      if (containerId != null) {
        containerToAttemptMap.remove(containerId);
        return true;
      }
      return false;
    }
    
    TaskAttemptId get(ContainerId cId) {
      return containerToAttemptMap.get(cId);
    }

    ContainerId get(TaskAttemptId tId) {
      Container c = tId.getTaskId().getTaskType().equals(TaskType.MAP) ? maps.get(tId) : reduces.get(tId);
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

    public void updateAndLogIfChanged(String msgPrefix) {
      boolean changed = false;
      synchronized (RMContainerAllocator.this) {
        changed |= (numPendingReduces != pendingReduces.size());
        numPendingReduces = pendingReduces.size();
        changed |= (numScheduledMaps != scheduledRequests.maps.size());
        numScheduledMaps = scheduledRequests.maps.size();
        changed |= (numScheduledReduces != scheduledRequests.reduces.size());
        numScheduledReduces = scheduledRequests.reduces.size();
        changed |= (numAssignedMaps != assignedRequests.maps.size());
        numAssignedMaps = assignedRequests.maps.size();
        changed |= (numAssignedReduces != assignedRequests.reduces.size());
        numAssignedReduces = assignedRequests.reduces.size();
        changed |= (numCompletedMaps != getJob().getCompletedMaps());
        numCompletedMaps = getJob().getCompletedMaps();
        changed |= (numCompletedReduces != getJob().getCompletedReduces());
        numCompletedReduces = getJob().getCompletedReduces();
        changed |= (numContainersAllocated != containersAllocated);
        numContainersAllocated = containersAllocated;
        changed |= (numContainersReleased != containersReleased);
        numContainersReleased = containersReleased;
      }
      if (changed) {
        log(msgPrefix);
      }
    }

    public void log(String msgPrefix) {
        LOG.info(msgPrefix + "PendingReds:" + numPendingReduces +
        " ScheduledMaps:" + numScheduledMaps +
        " ScheduledReds:" + numScheduledReduces +
        " AssignedMaps:" + numAssignedMaps +
        " AssignedReds:" + numAssignedReduces +
        " CompletedMaps:" + numCompletedMaps +
        " CompletedReds:" + numCompletedReduces +
        " ContAlloc:" + numContainersAllocated +
        " ContRel:" + numContainersReleased +
        " HostLocal:" + hostLocalAssigned +
        " RackLocal:" + rackLocalAssigned);
    }
  }
}