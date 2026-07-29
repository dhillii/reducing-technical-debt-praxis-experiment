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
  
  /*
  Vocabulary Used: 
  pending -> requests which are NOT yet sent to RM
  scheduled -> requests which are sent to RM but not yet assigned
  assigned -> requests which are assigned to a container
  completed -> request corresponding to which container has completed
  
  Lifecycle of map
  scheduled->assigned->completed
  
  Lifecycle of reduce
  pending->scheduled->assigned->completed
  
  Maps are scheduled as soon as their requests are received. Reduces are 
  added to the pending and are ramped up (added to scheduled) based 
  on completed maps and current availability in the cluster.
  */
  
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
  /**
   * after this threshold, if the container request is not allocated, it is
   * considered delayed.
   */
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
    // Init startTime to current time. If all goes well, it will be reset after
    // first attempt to contact RM.
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
            // Kill the AM
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
    if (allocatedContainers != null && allocatedContainers.size() > 0) {
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
      // return if already stopped
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
    Resource supportedMaxContainerCapability = getMaxContainerCapability();
    
    if (isMapRequest(reqEvent)) {
      handleMapRequest(reqEvent, jobId, supportedMaxContainerCapability);
    } else {
      handleReduceRequest(reqEvent, jobId, supportedMaxContainerCapability);
    }
  }

  private boolean isMapRequest(ContainerRequestEvent reqEvent) {
    return reqEvent.getAttemptID().getTaskId().getTaskType().equals(TaskType.MAP);
  }

  private void handleMapRequest(ContainerRequestEvent reqEvent, JobId jobId, 
      Resource supportedMaxContainerCapability) {
    if (mapResourceRequest.equals(Resources.none())) {
      mapResourceRequest = reqEvent.getCapability();
      eventHandler.handle(new JobHistoryEvent(jobId,
        new NormalizedResourceEvent(
          org.apache.hadoop.mapreduce.TaskType.MAP, mapResourceRequest
            .getMemory())));
      LOG.info("mapResourceRequest:" + mapResourceRequest);
      
      if (isResourceExceedsCapability(mapResourceRequest, supportedMaxContainerCapability)) {
        handleResourceExceedsCapability("MAP", mapResourceRequest, 
            supportedMaxContainerCapability, jobId);
        return;
      }
    }
    
    reqEvent.getCapability().setMemory(mapResourceRequest.getMemory());
    reqEvent.getCapability().setVirtualCores(mapResourceRequest.getVirtualCores());
    scheduledRequests.addMap(reqEvent);
  }

  private void handleReduceRequest(ContainerRequestEvent reqEvent, JobId jobId,
      Resource supportedMaxContainerCapability) {
    if (reduceResourceRequest.equals(Resources.none())) {
      reduceResourceRequest = reqEvent.getCapability();
      eventHandler.handle(new JobHistoryEvent(jobId,
        new NormalizedResourceEvent(
          org.apache.hadoop.mapreduce.TaskType.REDUCE,
          reduceResourceRequest.getMemory())));
      LOG.info("reduceResourceRequest:" + reduceResourceRequest);
      
      if (isResourceExceedsCapability(reduceResourceRequest, supportedMaxContainerCapability)) {
        handleResourceExceedsCapability("REDUCE", reduceResourceRequest,
            supportedMaxContainerCapability, jobId);
        return;
      }
    }
    
    reqEvent.getCapability().setMemory(reduceResourceRequest.getMemory());
    reqEvent.getCapability().setVirtualCores(reduceResourceRequest.getVirtualCores());
    
    if (reqEvent.getEarlierAttemptFailed()) {
      pendingReduces.addFirst(new ContainerRequest(reqEvent, PRIORITY_REDUCE));
    } else {
      pendingReduces.add(new ContainerRequest(reqEvent, PRIORITY_REDUCE));
    }
  }

  private boolean isResourceExceedsCapability(Resource requested, Resource max) {
    return requested.getMemory() > max.getMemory()
        || requested.getVirtualCores() > max.getVirtualCores();
  }

  private void handleResourceExceedsCapability(String taskType, Resource requested,
      Resource max, JobId jobId) {
    String diagMsg = taskType + " capability required is more than the "
        + "supported max container capability in the cluster. Killing the Job. "
        + taskType + "ResourceRequest: " + requested + " maxContainerCapability: " + max;
    LOG.info(diagMsg);
    eventHandler.handle(new JobDiagnosticsUpdateEvent(jobId, diagMsg));
    eventHandler.handle(new JobEvent(jobId, JobEventType.JOB_KILL));
  }

  private void handleContainerDeallocate(ContainerAllocatorEvent event) {
    LOG.info("Processing the event " + event.toString());
    TaskAttemptId aId = event.getAttemptID();
    
    boolean removed = scheduledRequests.remove(aId);
    if (removed) {
      return;
    }
    
    ContainerId containerId = assignedRequests.get(aId);
    if (containerId != null) {
      assignedRequests.remove(aId);
      containersReleased++;
      pendingRelease.add(containerId);
      release(containerId);
      return;
    }
    
    LOG.error("Could not deallocate container for task attemptId " + aId);
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
  @VisibleForTesting
  void preemptReducesIfNeeded() {
    if (reduceResourceRequest.equals(Resources.none())) {
      return;
    }
    
    if (scheduledRequests.maps.size() == 0) {
      return;
    }
    
    performPreemptionIfNeeded();
  }

  private void performPreemptionIfNeeded() {
    Resource resourceLimit = getResourceLimit();
    Resource availableResourceForMap = calculateAvailableResourceForMap(resourceLimit);
    
    if (hasInsufficientMapResources(availableResourceForMap)) {
      rampDownScheduledReduces();
      performReducePreemption(resourceLimit);
    }
  }

  private Resource calculateAvailableResourceForMap(Resource resourceLimit) {
    return Resources.subtract(
        resourceLimit,
        Resources.multiply(reduceResourceRequest,
          assignedRequests.reduces.size()
              - assignedRequests.preemptionWaitingReduces.size()));
  }

  private boolean hasInsufficientMapResources(Resource availableResourceForMap) {
    return ResourceCalculatorUtils.computeAvailableContainers(availableResourceForMap,
        mapResourceRequest, getSchedulerResourceTypes()) <= 0;
  }

  private void rampDownScheduledReduces() {
    LOG.info("Ramping down all scheduled reduces:" + scheduledRequests.reduces.size());
    for (ContainerRequest req : scheduledRequests.reduces.values()) {
      pendingReduces.add(req);
    }
    scheduledRequests.reduces.clear();
  }

  private void performReducePreemption(Resource resourceLimit) {
    int hangingMapRequests = getNumOfHangingRequests(scheduledRequests.maps);
    if (hangingMapRequests == 0) {
      return;
    }
    
    int preemptionReduceNumForOneMap =
        ResourceCalculatorUtils.divideAndCeilContainers(mapResourceRequest,
          reduceResourceRequest, getSchedulerResourceTypes());
    int preemptionReduceNumForPreemptionLimit =
        ResourceCalculatorUtils.divideAndCeilContainers(
          Resources.multiply(resourceLimit, maxReducePreemptionLimit),
          reduceResourceRequest, getSchedulerResourceTypes());
    int preemptionReduceNumForAllMaps =
        ResourceCalculatorUtils.divideAndCeilContainers(
          Resources.multiply(mapResourceRequest, hangingMapRequests),
          reduceResourceRequest, getSchedulerResourceTypes());
    
    int toPreempt = Math.min(Math.max(preemptionReduceNumForOneMap,
        preemptionReduceNumForPreemptionLimit),
        preemptionReduceNumForAllMaps);

    LOG.info("Going to preempt " + toPreempt + " due to lack of space for maps");
    assignedRequests.preemptReduce(toPreempt);
  }
 
  private int getNumOfHangingRequests(Map<TaskAttemptId, ContainerRequest> requestMap) {
    if (allocationDelayThresholdMs <= 0) {
      return requestMap.size();
    }
    
    int hangingRequests = 0;
    long currTime = clock.getTime();
    for (ContainerRequest request: requestMap.values()) {
      long delay = currTime - request.requestTimeMs;
      if (delay > allocationDelayThresholdMs) {
        hangingRequests++;
      }
    }
    return hangingRequests;
  }
  
  @Private
  public void scheduleReduces(
      int totalMaps, int completedMaps,
      int scheduledMaps, int scheduledReduces,
      int assignedMaps, int assignedReduces,
      Resource mapResourceReqt, Resource reduceResourceReqt,
      int numPendingReduces,
      float maxReduceRampupLimit, float reduceSlowStart) {
    
    if (numPendingReduces == 0) {
      return;
    }
    
    Resource headRoom = getAvailableResources();
    if (headRoom == null) {
      headRoom = Resources.none();
    }

    LOG.info("Recalculating schedule, headroom=" + headRoom);
    
    if (!checkReduceSlowStart(totalMaps, completedMaps, reduceSlowStart)) {
      return;
    }
    
    if (allMapsAssigned(scheduledMaps, numPendingReduces)) {
      scheduleAllReduces();
      return;
    }

    performReduceScheduling(totalMaps, completedMaps, scheduledMaps, scheduledReduces,
        assignedMaps, assignedReduces, mapResourceReqt, reduceResourceReqt,
        numPendingReduces, maxReduceRampupLimit);
  }

  private boolean checkReduceSlowStart(int totalMaps, int completedMaps, float reduceSlowStart) {
    if (getIsReduceStarted()) {
      return true;
    }
    
    int completedMapsForReduceSlowstart = (int)Math.ceil(reduceSlowStart * totalMaps);
    if (completedMaps < completedMapsForReduceSlowstart) {
      LOG.info("Reduce slow start threshold not met. completedMapsForReduceSlowstart " 
          + completedMapsForReduceSlowstart);
      return false;
    }
    
    LOG.info("Reduce slow start threshold reached. Scheduling reduces.");
    setIsReduceStarted(true);
    return true;
  }

  private boolean allMapsAssigned(int scheduledMaps, int numPendingReduces) {
    return scheduledMaps == 0 && numPendingReduces > 0;
  }

  private void performReduceScheduling(int totalMaps, int completedMaps,
      int scheduledMaps, int scheduledReduces, int assignedMaps, int assignedReduces,
      Resource mapResourceReqt, Resource reduceResourceReqt, int numPendingReduces,
      float maxReduceRampupLimit) {
    
    float completedMapPercent = calculateCompletedMapPercent(totalMaps, completedMaps);
    
    Resource netScheduledMapResource = Resources.multiply(mapResourceReqt, 
        (scheduledMaps + assignedMaps));
    Resource netScheduledReduceResource = Resources.multiply(reduceResourceReqt,
        (scheduledReduces + assignedReduces));

    Resource totalResourceLimit = getResourceLimit();
    
    ResourceLimits limits = calculateResourceLimits(totalResourceLimit, completedMapPercent,
        maxReduceRampupLimit, mapResourceReqt, netScheduledMapResource, scheduledMaps, assignedMaps);

    LOG.info("completedMapPercent " + completedMapPercent
        + " totalResourceLimit:" + totalResourceLimit
        + " finalMapResourceLimit:" + limits.mapLimit
        + " finalReduceResourceLimit:" + limits.reduceLimit
        + " netScheduledMapResource:" + netScheduledMapResource
        + " netScheduledReduceResource:" + netScheduledReduceResource);

    int rampUp = ResourceCalculatorUtils.computeAvailableContainers(
        Resources.subtract(limits.reduceLimit, netScheduledReduceResource),
        reduceResourceReqt, getSchedulerResourceTypes());

    if (rampUp > 0) {
      rampUp = Math.min(rampUp, numPendingReduces);
      LOG.info("Ramping up " + rampUp);
      rampUpReduces(rampUp);
    } else if (rampUp < 0) {
      int rampDown = -1 * rampUp;
      rampDown = Math.min(rampDown, scheduledReduces);
      LOG.info("Ramping down " + rampDown);
      rampDownReduces(rampDown);
    }
  }

  private float calculateCompletedMapPercent(int totalMaps, int completedMaps) {
    if (totalMaps == 0) {
      return 1;
    }
    return (float)completedMaps / totalMaps;
  }

  private ResourceLimits calculateResourceLimits(Resource totalResourceLimit,
      float completedMapPercent, float maxReduceRampupLimit, Resource mapResourceReqt,
      Resource netScheduledMapResource, int scheduledMaps, int assignedMaps) {
    
    Resource idealReduceResourceLimit = Resources.multiply(totalResourceLimit,
        Math.min(completedMapPercent, maxReduceRampupLimit));
    Resource ideaMapResourceLimit = Resources.subtract(totalResourceLimit, idealReduceResourceLimit);

    if (hasEnoughMapCapacity(ideaMapResourceLimit, mapResourceReqt, scheduledMaps, assignedMaps)) {
      Resource unusedMapResourceLimit = Resources.subtract(ideaMapResourceLimit, netScheduledMapResource);
      Resource finalReduceResourceLimit = Resources.add(idealReduceResourceLimit, unusedMapResourceLimit);
      Resource finalMapResourceLimit = Resources.subtract(totalResourceLimit, finalReduceResourceLimit);
      return new ResourceLimits(finalMapResourceLimit, finalReduceResourceLimit);
    }
    
    return new ResourceLimits(ideaMapResourceLimit, idealReduceResourceLimit);
  }

  private boolean hasEnoughMapCapacity(Resource ideaMapResourceLimit, Resource mapResourceReqt,
      int scheduledMaps, int assignedMaps) {
    return ResourceCalculatorUtils.computeAvailableContainers(ideaMapResourceLimit,
        mapResourceReqt, getSchedulerResourceTypes()) >= (scheduledMaps + assignedMaps);
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

    Resource headRoom = getAvailableResources() == null ? Resources.none() :
        Resources.clone(getAvailableResources());
    
    AllocateResponse response = obtainAllocateResponse();
    if (response == null) {
      return null;
    }
    
    Resource newHeadRoom = getAvailableResources() == null ? Resources.none()
        : getAvailableResources();
    List<Container> newContainers = response.getAllocatedContainers();
    
    processNMTokens(response);
    processAMRMToken(response);

    List<ContainerStatus> finishedContainers = response.getCompletedContainersStatuses();
    if (hasResourceChanges(newContainers, finishedContainers, headRoom, newHeadRoom)) {
      recalculateReduceSchedule = true;
      if (LOG.isDebugEnabled() && !headRoom.equals(newHeadRoom)) {
        LOG.debug("headroom=" + newHeadRoom);
      }
    }

    logNewContainers(newContainers);
    computeIgnoreBlacklisting();
    handleUpdatedNodes(response);
    processFinishedContainers(finishedContainers);
    
    return newContainers;
  }

  private AllocateResponse obtainAllocateResponse() throws Exception {
    try {
      AllocateResponse response = makeRemoteRequest();
      retrystartTime = System.currentTimeMillis();
      return response;
    } catch (ApplicationAttemptNotFoundException e) {
      handleApplicationAttemptNotFound(e);
      throw new YarnRuntimeException(
          "Resource Manager doesn't recognize AttemptId: "
              + this.getContext().getApplicationAttemptId(), e);
    } catch (ApplicationMasterNotRegisteredException e) {
      handleApplicationMasterNotRegistered();
      return null;
    } catch (Exception e) {
      handleGeneralException(e);
      throw e;
    }
  }

  private void handleApplicationAttemptNotFound(ApplicationAttemptNotFoundException e) {
    eventHandler.handle(new JobEvent(this.getJob().getID(),
        JobEventType.JOB_AM_REBOOT));
  }

  private void handleApplicationMasterNotRegistered() {
    LOG.info("ApplicationMaster is out of sync with ResourceManager,"
        + " hence resync and send outstanding requests.");
    lastResponseID = 0;
    register();
    addOutstandingRequestOnResync();
  }

  private void handleGeneralException(Exception e) throws Exception {
    if (System.currentTimeMillis() - retrystartTime >= retryInterval) {
      LOG.error("Could not contact RM after " + retryInterval + " milliseconds.");
      eventHandler.handle(new JobEvent(this.getJob().getID(),
          JobEventType.JOB_AM_REBOOT));
      throw new YarnRuntimeException("Could not contact RM after " +
          retryInterval + " milliseconds.");
    }
  }

  private boolean hasResourceChanges(List<Container> newContainers,
      List<ContainerStatus> finishedContainers, Resource headRoom, Resource newHeadRoom) {
    return newContainers.size() + finishedContainers.size() > 0
        || !headRoom.equals(newHeadRoom);
  }

  private void logNewContainers(List<Container> newContainers) {
    if (LOG.isDebugEnabled()) {
      for (Container cont : newContainers) {
        LOG.debug("Received new Container :" + cont);
      }
    }
  }

  private void processNMTokens(AllocateResponse response) {
    if (response.getNMTokens() != null) {
      for (NMToken nmToken : response.getNMTokens()) {
        NMTokenCache.setNMToken(nmToken.getNodeId().toString(),
            nmToken.getToken());
      }
    }
  }

  private void processAMRMToken(AllocateResponse response) throws IOException {
    if (response.getAMRMToken() != null) {
      updateAMRMToken(response.getAMRMToken());
    }
  }

  private void processFinishedContainers(List<ContainerStatus> finishedContainers) {
    for (ContainerStatus cont : finishedContainers) {
      LOG.info("Received completed container " + cont.getContainerId());
      processFinishedContainer(cont);
    }
  }

  private void processFinishedContainer(ContainerStatus cont) {
    TaskAttemptId attemptID = assignedRequests.get(cont.getContainerId());
    if (attemptID == null) {
      LOG.error("Container complete event for unknown container id "
          + cont.getContainerId());
      return;
    }
    
    pendingRelease.remove(cont.getContainerId());
    assignedRequests.remove(attemptID);
    
    eventHandler.handle(createContainerFinishedEvent(cont, attemptID));
    
    String diagnostics = StringInterner.weakIntern(cont.getDiagnostics());
    eventHandler.handle(new TaskAttemptDiagnosticsUpdateEvent(attemptID, diagnostics));
  }

  private void applyConcurrentTaskLimits() {
    applyMapTaskLimits();
    applyReduceTaskLimits();
  }

  private void applyMapTaskLimits() {
    int numScheduledMaps = scheduledRequests.maps.size();
    if (maxRunningMaps <= 0 || numScheduledMaps == 0) {
      return;
    }
    
    int maxRequestedMaps = Math.max(0, maxRunningMaps - assignedRequests.maps.size());
    int numScheduledFailMaps = scheduledRequests.earlierFailedMaps.size();
    int failedMapRequestLimit = Math.min(maxRequestedMaps, numScheduledFailMaps);
    int normalMapRequestLimit = Math.min(
        maxRequestedMaps - failedMapRequestLimit,
        numScheduledMaps - numScheduledFailMaps);
    
    setRequestLimit(PRIORITY_FAST_FAIL_MAP, mapResourceRequest, failedMapRequestLimit);
    setRequestLimit(PRIORITY_MAP, mapResourceRequest, normalMapRequestLimit);
  }

  private void applyReduceTaskLimits() {
    int numScheduledReduces = scheduledRequests.reduces.size();
    if (maxRunningReduces <= 0 || numScheduledReduces == 0) {
      return;
    }
    
    int maxRequestedReduces = Math.max(0, maxRunningReduces - assignedRequests.reduces.size());
    int reduceRequestLimit = Math.min(maxRequestedReduces, numScheduledReduces);
    setRequestLimit(PRIORITY_REDUCE, reduceResourceRequest, reduceRequestLimit);
  }

  private boolean canAssignMaps() {
    return (maxRunningMaps <= 0
        || assignedRequests.maps.size() < maxRunningMaps);
  }

  private boolean canAssignReduces() {
    return (maxRunningReduces <= 0
        || assignedRequests.reduces.size() < maxRunningReduces);
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
    if (isContainerAbortedOrPreempted(cont)) {
      return new TaskAttemptEvent(attemptID, TaskAttemptEventType.TA_KILL);
    }
    return new TaskAttemptEvent(attemptID, TaskAttemptEventType.TA_CONTAINER_COMPLETED);
  }

  private boolean isContainerAbortedOrPreempted(ContainerStatus cont) {
    return cont.getExitStatus() == ContainerExitStatus.ABORTED
        || cont.getExitStatus() == ContainerExitStatus.PREEMPTED;
  }
  
  @SuppressWarnings("unchecked")
  private void handleUpdatedNodes(AllocateResponse response) {
    List<NodeReport> updatedNodes = response.getUpdatedNodes();
    if (updatedNodes.isEmpty()) {
      return;
    }

    eventHandler.handle(new JobUpdatedNodesEvent(getJob().getID(), updatedNodes));

    HashSet<NodeId> unusableNodes = extractUnusableNodes(updatedNodes);
    killTasksOnUnusableNodes(unusableNodes);
  }

  private HashSet<NodeId> extractUnusableNodes(List<NodeReport> updatedNodes) {
    HashSet<NodeId> unusableNodes = new HashSet<NodeId>();
    for (NodeReport nr : updatedNodes) {
      if (nr.getNodeState().isUnusable()) {
        unusableNodes.add(nr.getNodeId());
      }
    }
    return unusableNodes;
  }

  private void killTasksOnUnusableNodes(HashSet<NodeId> unusableNodes) {
    killMapTasksOnUnusableNodes(unusableNodes);
    killReduceTasksOnUnusableNodes(unusableNodes);
  }

  private void killMapTasksOnUnusableNodes(HashSet<NodeId> unusableNodes) {
    for (Map.Entry<TaskAttemptId, Container> entry : assignedRequests.maps.entrySet()) {
      killTaskIfOnUnusableNode(entry.getKey(), entry.getValue(), unusableNodes);
    }
  }

  private void killReduceTasksOnUnusableNodes(HashSet<NodeId> unusableNodes) {
    for (Map.Entry<TaskAttemptId, Container> entry : assignedRequests.reduces.entrySet()) {
      killTaskIfOnUnusableNode(entry.getKey(), entry.getValue(), unusableNodes);
    }
  }

  private void killTaskIfOnUnusableNode(TaskAttemptId tid, Container container,
      HashSet<NodeId> unusableNodes) {
    NodeId taskAttemptNodeId = container.getNodeId();
    if (unusableNodes.contains(taskAttemptNodeId)) {
      LOG.info("Killing taskAttempt:" + tid + " because it is running on unusable node:"
          + taskAttemptNodeId);
      eventHandler.handle(new TaskAttemptKillEvent(tid,
          "TaskAttempt killed because it ran on unusable node" + taskAttemptNodeId));
    }
  }

  @Private
  public Resource getResourceLimit() {
    Resource headRoom = getAvailableResources();
    if (headRoom == null) {
      headRoom = Resources.none();
    }
    Resource assignedMapResource = Resources.multiply(mapResourceRequest, 
        assignedRequests.maps.size());
    Resource assignedReduceResource = Resources.multiply(reduceResourceRequest,
        assignedRequests.reduces.size());
    return Resources.add(headRoom,
        Resources.add(assignedMapResource, assignedReduceResource));
  }

  private static class ResourceLimits {
    final Resource mapLimit;
    final Resource reduceLimit;

    ResourceLimits(Resource mapLimit, Resource reduceLimit) {
      this.mapLimit = mapLimit;
      this.reduceLimit = reduceLimit;
    }
  }

  @Private
  @VisibleForTesting
  class ScheduledRequests {
    
    private final LinkedList<TaskAttemptId> earlierFailedMaps = 
      new LinkedList<TaskAttemptId>();
    
    /** Maps from a host to a list of Map tasks with data on the host */
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
      ContainerRequest request = null;
      
      if (event.getEarlierAttemptFailed()) {
        earlierFailedMaps.add(event.getAttemptID());
        request = new ContainerRequest(event, PRIORITY_FAST_FAIL_MAP);
        LOG.info("Added "+event.getAttemptID()+" to list of failed maps");
      } else {
        addMapHostAndRackMappings(event);
        request = new ContainerRequest(event, PRIORITY_MAP);
      }
      maps.put(event.getAttemptID(), request);
      addContainerReq(request);
    }

    private void addMapHostAndRackMappings(ContainerRequestEvent event) {
      for (String host : event.getHosts()) {
        LinkedList<TaskAttemptId> list = mapsHostMapping.get(host);
        if (list == null) {
          list = new LinkedList<TaskAttemptId>();
          mapsHostMapping.put(host, list);
        }
        list.add(event.getAttemptID());
        if (LOG.isDebugEnabled()) {
          LOG.debug("Added attempt req to host " + host);
        }
      }
      for (String rack: event.getRacks()) {
        LinkedList<TaskAttemptId> list = mapsRackMapping.get(rack);
        if (list == null) {
          list = new LinkedList<TaskAttemptId>();
          mapsRackMapping.put(rack, list);
        }
        list.add(event.getAttemptID());
        if (LOG.isDebugEnabled()) {
          LOG.debug("Added attempt req to rack " + rack);
        }
      }
    }
    
    void addReduce(ContainerRequest req) {
      reduces.put(req.attemptID, req);
      addContainerReq(req);
    }
    
    private void assign(List<Container> allocatedContainers) {
      LOG.info("Got allocated containers " + allocatedContainers.size());
      containersAllocated += allocatedContainers.size();
      
      filterAndAssignContainers(allocatedContainers);
      assignContainers(allocatedContainers);
      releaseUnassignedContainers(allocatedContainers);
    }

    private void filterAndAssignContainers(List<Container> allocatedContainers) {
      Iterator<Container> it = allocatedContainers.iterator();
      while (it.hasNext()) {
        Container allocated = it.next();
        if (!isContainerAssignable(allocated)) {
          containerNotAssigned(allocated);
          it.remove();
        }
      }
    }

    private boolean isContainerAssignable(Container allocated) {
      if (LOG.isDebugEnabled()) {
        LOG.debug("Assigning container " + allocated.getId()
            + " with priority " + allocated.getPriority() + " to NM "
            + allocated.getNodeId());
      }
      
      Priority priority = allocated.getPriority();
      Resource allocatedResource = allocated.getResource();
      
      if (isMapPriority(priority)) {
        return canAssignMapContainer(allocatedResource);
      } else if (PRIORITY_REDUCE.equals(priority)) {
        return canAssignReduceContainer(allocatedResource);
      } else {
        LOG.warn("Container allocated at unwanted priority: " + priority + 
            ". Returning to RM...");
        return false;
      }
    }

    private boolean isMapPriority(Priority priority) {
      return PRIORITY_FAST_FAIL_MAP.equals(priority) || PRIORITY_MAP.equals(priority);
    }

    private boolean canAssignMapContainer(Resource allocatedResource) {
      if (ResourceCalculatorUtils.computeAvailableContainers(allocatedResource,
          mapResourceRequest, getSchedulerResourceTypes()) <= 0 || maps.isEmpty()) {
        LOG.info("Cannot assign container for a map as either "
            + "container memory less than required " + mapResourceRequest
            + " or no pending map tasks - maps.isEmpty=" + maps.isEmpty());
        return false;
      }
      return true;
    }

    private boolean canAssignReduceContainer(Resource allocatedResource) {
      if (ResourceCalculatorUtils.computeAvailableContainers(allocatedResource,
          reduceResourceRequest, getSchedulerResourceTypes()) <= 0 || reduces.isEmpty()) {
        LOG.info("Cannot assign container for a reduce as either "
            + "container memory less than required " + reduceResourceRequest
            + " or no pending reduce tasks - reduces.isEmpty=" + reduces.isEmpty());
        return false;
      }
      return true;
    }

    private void filterBlacklistedContainers(List<Container> allocatedContainers) {
      Iterator<Container> it = allocatedContainers.iterator();
      while (it.hasNext()) {
        Container allocated = it.next();
        String allocatedHost = allocated.getNodeId().getHost();
        if (isNodeBlacklisted(allocatedHost)) {
          handleBlacklistedContainer(allocated, it);
        }
      }
    }

    private void handleBlacklistedContainer(Container allocated, Iterator<Container> it) {
      LOG.info("Got allocated container on a blacklisted host " + allocated.getNodeId().getHost()
          + ". Releasing container " + allocated);

      ContainerRequest toBeReplacedReq = getContainerReqToReplace(allocated);
      if (toBeReplacedReq != null) {
        replaceContainerRequest(toBeReplacedReq);
      } else {
        LOG.info("Could not map allocated container to a valid request."
            + " Releasing allocated container " + allocated);
      }
      
      containerNotAssigned(allocated);
      it.remove();
    }

    private void replaceContainerRequest(ContainerRequest toBeReplacedReq) {
      LOG.info("Placing a new container request for task attempt " + toBeReplacedReq.attemptID);
      ContainerRequest newReq = getFilteredContainerRequest(toBeReplacedReq);
      decContainerReq(toBeReplacedReq);
      
      if (toBeReplacedReq.attemptID.getTaskId().getTaskType() == TaskType.MAP) {
        maps.put(newReq.attemptID, newReq);
      } else {
        reduces.put(newReq.attemptID, newReq);
      }
      addContainerReq(newReq);
    }
    
    @SuppressWarnings("unchecked")
    private void containerAssigned(Container allocated, ContainerRequest assigned) {
      decContainerReq(assigned);
      eventHandler.handle(new TaskAttemptContainerAssignedEvent(
          assigned.attemptID, allocated, applicationACLs));
      assignedRequests.add(allocated, assigned.attemptID);

      if (LOG.isDebugEnabled()) {
        LOG.info("Assigned container (" + allocated + ") to task " + assigned.attemptID 
            + " on node " + allocated.getNodeId().toString());
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
      filterBlacklistedContainers(allocatedContainers);
      
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
        return getFailedMapToReplace();
      } else if (PRIORITY_MAP.equals(priority)) {
        return getMapToReplace(allocated);
      } else if (PRIORITY_REDUCE.equals(priority)) {
        return getReduceToReplace();
      }
      return null;
    }

    private ContainerRequest getFailedMapToReplace() {
      LOG.info("Replacing FAST_FAIL_MAP container");
      Iterator<TaskAttemptId> iter = earlierFailedMaps.iterator();
      while (iter.hasNext()) {
        ContainerRequest req = maps.get(iter.next());
        if (req != null) {
          LOG.info("Found replacement: " + req);
          return req;
        }
      }
      LOG.info("Found replacement: null");
      return null;
    }

    private ContainerRequest getMapToReplace(Container allocated) {
      LOG.info("Replacing MAP container " + allocated.getId());
      String host = allocated.getNodeId().getHost();
      LinkedList<TaskAttemptId> list = mapsHostMapping.get(host);
      
      if (list != null && list.size() > 0) {
        TaskAttemptId tId = list.removeLast();
        if (maps.containsKey(tId)) {
          ContainerRequest req = maps.remove(tId);
          LOG.info("Found replacement: " + req);
          return req;
        }
      }
      
      if (!maps.isEmpty()) {
        TaskAttemptId tId = maps.keySet().iterator().next();
        ContainerRequest req = maps.remove(tId);
        LOG.info("Found replacement: " + req);
        return req;
      }
      
      LOG.info("Found replacement: null");
      return null;
    }

    private ContainerRequest getReduceToReplace() {
      if (!reduces.isEmpty()) {
        TaskAttemptId tId = reduces.keySet().iterator().next();
        ContainerRequest req = reduces.remove(tId);
        LOG.info("Found replacement: " + req);
        return req;
      }
      LOG.info("Found replacement: null");
      return null;
    }
    
    @SuppressWarnings("unchecked")
    private ContainerRequest assignToFailedMap(Container allocated) {
      while (earlierFailedMaps.size() > 0 && canAssignMaps()) {
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
    
    private ContainerRequest assignToReduce(Container allocated) {
      if (reduces.size() > 0 && canAssignReduces()) {
        TaskAttemptId tId = reduces.keySet().iterator().next();
        ContainerRequest assigned = reduces.remove(tId);
        LOG.info("Assigned to reduce");
        return assigned;
      }
      return null;
    }
    
    @SuppressWarnings("unchecked")
    private void assignMapsWithLocality(List<Container> allocatedContainers) {
      assignMapsWithHostLocality(allocatedContainers);
      assignMapsWithRackLocality(allocatedContainers);
      assignMapsWithoutLocality(allocatedContainers);
    }

    private void assignMapsWithHostLocality(List<Container> allocatedContainers) {
      Iterator<Container> it = allocatedContainers.iterator();
      while (it.hasNext() && maps.size() > 0 && canAssignMaps()) {
        Container allocated = it.next();
        Priority priority = allocated.getPriority();
        if (!PRIORITY_MAP.equals(priority)) {
          continue;
        }
        
        String host = allocated.getNodeId().getHost();
        LinkedList<TaskAttemptId> list = mapsHostMapping.get(host);
        while (list != null && list.size() > 0) {
          if (LOG.isDebugEnabled()) {
            LOG.debug("Host matched to the request list " + host);
          }
          TaskAttemptId tId = list.removeFirst();
          if (maps.containsKey(tId)) {
            ContainerRequest assigned = maps.remove(tId);
            containerAssigned(allocated, assigned);
            it.remove();
            JobCounterUpdateEvent jce = new JobCounterUpdateEvent(
                assigned.attemptID.getTaskId().getJobId());
            jce.addCounterUpdate(JobCounter.DATA_LOCAL_MAPS, 1);
            eventHandler.handle(jce);
            hostLocalAssigned++;
            if (LOG.isDebugEnabled()) {
              LOG.debug("Assigned based on host match " + host);
            }
            break;
          }
        }
      }
    }

    private void assignMapsWithRackLocality(List<Container> allocatedContainers) {
      Iterator<Container> it = allocatedContainers.iterator();
      while (it.hasNext() && maps.size() > 0 && canAssignMaps()) {
        Container allocated = it.next();
        Priority priority = allocated.getPriority();
        if (!PRIORITY_MAP.equals(priority)) {
          continue;
        }
        
        String host = allocated.getNodeId().getHost();
        String rack = RackResolver.resolve(host).getNetworkLocation();
        LinkedList<TaskAttemptId> list = mapsRackMapping.get(rack);
        while (list != null && list.size() > 0) {
          TaskAttemptId tId = list.removeFirst();
          if (maps.containsKey(tId)) {
            ContainerRequest assigned = maps.remove(tId);
            containerAssigned(allocated, assigned);
            it.remove();
            JobCounterUpdateEvent jce = new JobCounterUpdateEvent(
                assigned.attemptID.getTaskId().getJobId());
            jce.addCounterUpdate(JobCounter.RACK_LOCAL_MAPS, 1);
            eventHandler.handle(jce);
            rackLocalAssigned++;
            if (LOG.isDebugEnabled()) {
              LOG.debug("Assigned based on rack match " + rack);
            }
            break;
          }
        }
      }
    }

    private void assignMapsWithoutLocality(List<Container> allocatedContainers) {
      Iterator<Container> it = allocatedContainers.iterator();
      while (it.hasNext() && maps.size() > 0 && canAssignMaps()) {
        Container allocated = it.next();
        Priority priority = allocated.getPriority();
        if (!PRIORITY_MAP.equals(priority)) {
          continue;
        }
        
        TaskAttemptId tId = maps.keySet().iterator().next();
        ContainerRequest assigned = maps.remove(tId);
        containerAssigned(allocated, assigned);
        it.remove();
        JobCounterUpdateEvent jce = new JobCounterUpdateEvent(
            assigned.attemptID.getTaskId().getJobId());
        jce.addCounterUpdate(JobCounter.OTHER_LOCAL_MAPS, 1);
        eventHandler.handle(jce);
        if (LOG.isDebugEnabled()) {
          LOG.debug("Assigned based on * match");
        }
      }
    }

    private void releaseUnassignedContainers(List<Container> allocatedContainers) {
      for (Container allocated : allocatedContainers) {
        LOG.info("Releasing unassigned container " + allocated);
        containerNotAssigned(allocated);
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

    @SuppressWarnings("unchecked")
    void preemptReduce(int toPreempt) {
      List<TaskAttemptId> reduceList = new ArrayList<TaskAttemptId>(reduces.keySet());
      Collections.sort(reduceList, new Comparator<TaskAttemptId>() {
        @Override
        public int compare(TaskAttemptId o1, TaskAttemptId o2) {
          return Float.compare(
              getJob().getTask(o1.getTaskId()).getAttempt(o1).getProgress(),
              getJob().getTask(o2.getTaskId()).getAttempt(o2).getProgress());
        }
      });
      
      for (int i = 0; i < toPreempt && reduceList.size() > 0; i++) {
        TaskAttemptId id = reduceList.remove(0);
        LOG.info("Preempting " + id);
        preemptionWaitingReduces.add(id);
        eventHandler.handle(new TaskAttemptKillEvent(id, RAMPDOWN_DIAGNOSTIC));
      }
    }
    
    boolean remove(TaskAttemptId tId) {
      ContainerId containerId = null;
      if (tId.getTaskId().getTaskType().equals(TaskType.MAP)) {
        Container container = maps.remove(tId);
        if (container != null) {
          containerId = container.getId();
        }
      } else {
        Container container = reduces.remove(tId);
        if (container != null) {
          containerId = container.getId();
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
      Container taskContainer;
      if (tId.getTaskId().getTaskType().equals(TaskType.MAP)) {
        taskContainer = maps.get(tId);
      } else {
        taskContainer = reduces.get(tId);
      }

      if (taskContainer == null) {
        return null;
      } else {
        return taskContainer.getId();
      }
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