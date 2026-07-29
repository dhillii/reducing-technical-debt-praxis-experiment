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
  
  private final LinkedList<ContainerRequest> pendingReduces = 
    new LinkedList<ContainerRequest>();

  private final AssignedRequests assignedRequests = new AssignedRequests();
  
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
    ContainerAllocator.EventType eventType = event.getType();
    
    if (eventType == ContainerAllocator.EventType.CONTAINER_REQ) {
      handleContainerRequest(event);
    } else if (eventType == ContainerAllocator.EventType.CONTAINER_DEALLOCATE) {
      handleContainerDeallocate(event);
    } else if (eventType == ContainerAllocator.EventType.CONTAINER_FAILED) {
      handleContainerFailed(event);
    }
  }

  private void handleContainerRequest(ContainerAllocatorEvent event) {
    ContainerRequestEvent reqEvent = (ContainerRequestEvent) event;
    JobId jobId = getJob().getID();
    Resource supportedMaxContainerCapability = getMaxContainerCapability();
    
    if (reqEvent.getAttemptID().getTaskId().getTaskType().equals(TaskType.MAP)) {
      handleMapContainerRequest(reqEvent, jobId, supportedMaxContainerCapability);
    } else {
      handleReduceContainerRequest(reqEvent, jobId, supportedMaxContainerCapability);
    }
  }

  private void handleMapContainerRequest(ContainerRequestEvent reqEvent, JobId jobId, 
      Resource supportedMaxContainerCapability) {
    if (mapResourceRequest.equals(Resources.none())) {
      mapResourceRequest = reqEvent.getCapability();
      eventHandler.handle(new JobHistoryEvent(jobId,
        new NormalizedResourceEvent(
          org.apache.hadoop.mapreduce.TaskType.MAP, mapResourceRequest.getMemory())));
      LOG.info("mapResourceRequest:" + mapResourceRequest);
      
      if (isResourceExceedsMax(mapResourceRequest, supportedMaxContainerCapability)) {
        String diagMsg = "MAP capability required is more than the supported "
            + "max container capability in the cluster. Killing the Job. mapResourceRequest: "
            + mapResourceRequest + " maxContainerCapability:" + supportedMaxContainerCapability;
        LOG.info(diagMsg);
        eventHandler.handle(new JobDiagnosticsUpdateEvent(jobId, diagMsg));
        eventHandler.handle(new JobEvent(jobId, JobEventType.JOB_KILL));
      }
    }
    reqEvent.getCapability().setMemory(mapResourceRequest.getMemory());
    reqEvent.getCapability().setVirtualCores(mapResourceRequest.getVirtualCores());
    scheduledRequests.addMap(reqEvent);
  }

  private void handleReduceContainerRequest(ContainerRequestEvent reqEvent, JobId jobId,
      Resource supportedMaxContainerCapability) {
    if (reduceResourceRequest.equals(Resources.none())) {
      reduceResourceRequest = reqEvent.getCapability();
      eventHandler.handle(new JobHistoryEvent(jobId,
        new NormalizedResourceEvent(
          org.apache.hadoop.mapreduce.TaskType.REDUCE, reduceResourceRequest.getMemory())));
      LOG.info("reduceResourceRequest:" + reduceResourceRequest);
      
      if (isResourceExceedsMax(reduceResourceRequest, supportedMaxContainerCapability)) {
        String diagMsg = "REDUCE capability required is more than the "
            + "supported max container capability in the cluster. Killing the "
            + "Job. reduceResourceRequest: " + reduceResourceRequest
            + " maxContainerCapability:" + supportedMaxContainerCapability;
        LOG.info(diagMsg);
        eventHandler.handle(new JobDiagnosticsUpdateEvent(jobId, diagMsg));
        eventHandler.handle(new JobEvent(jobId, JobEventType.JOB_KILL));
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

  private boolean isResourceExceedsMax(Resource resource, Resource maxCapability) {
    return resource.getMemory() > maxCapability.getMemory()
        || resource.getVirtualCores() > maxCapability.getVirtualCores();
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

  private void handleContainerFailed(ContainerAllocatorEvent event) {
    ContainerFailedEvent fEv = (ContainerFailedEvent) event;
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
    if (scheduledRequests.maps.size() > 0) {
      preemptReducesForMaps();
    }
  }

  private void preemptReducesForMaps() {
    Resource resourceLimit = getResourceLimit();
    Resource availableResourceForMap = Resources.subtract(
        resourceLimit,
        Resources.multiply(reduceResourceRequest,
          assignedRequests.reduces.size() - assignedRequests.preemptionWaitingReduces.size()));
    
    if (ResourceCalculatorUtils.computeAvailableContainers(availableResourceForMap,
        mapResourceRequest, getSchedulerResourceTypes()) <= 0) {
      LOG.info("Ramping down all scheduled reduces:" + scheduledRequests.reduces.size());
      for (ContainerRequest req : scheduledRequests.reduces.values()) {
        pendingReduces.add(req);
      }
      scheduledRequests.reduces.clear();
      
      int hangingMapRequests = getNumOfHangingRequests(scheduledRequests.maps);
      if (hangingMapRequests > 0) {
        preemptReducesForHangingMaps(resourceLimit, hangingMapRequests);
      }
    }
  }

  private void preemptReducesForHangingMaps(Resource resourceLimit, int hangingMapRequests) {
    int preemptionReduceNumForOneMap = ResourceCalculatorUtils.divideAndCeilContainers(
        mapResourceRequest, reduceResourceRequest, getSchedulerResourceTypes());
    int preemptionReduceNumForPreemptionLimit = ResourceCalculatorUtils.divideAndCeilContainers(
        Resources.multiply(resourceLimit, maxReducePreemptionLimit),
        reduceResourceRequest, getSchedulerResourceTypes());
    int preemptionReduceNumForAllMaps = ResourceCalculatorUtils.divideAndCeilContainers(
        Resources.multiply(mapResourceRequest, hangingMapRequests),
        reduceResourceRequest, getSchedulerResourceTypes());
    
    int toPreempt = Math.min(Math.max(preemptionReduceNumForOneMap,
        preemptionReduceNumForPreemptionLimit), preemptionReduceNumForAllMaps);
    
    LOG.info("Going to preempt " + toPreempt + " due to lack of space for maps");
    assignedRequests.preemptReduce(toPreempt);
  }
 
  private int getNumOfHangingRequests(Map<TaskAttemptId, ContainerRequest> requestMap) {
    if (allocationDelayThresholdMs <= 0)
      return requestMap.size();
    int hangingRequests = 0;
    long currTime = clock.getTime();
    for (ContainerRequest request: requestMap.values()) {
      long delay = currTime - request.requestTimeMs;
      if (delay > allocationDelayThresholdMs)
        hangingRequests++;
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
    
    if (!getIsReduceStarted()) {
      if (!checkReduceSlowStart(totalMaps, completedMaps, reduceSlowStart)) {
        return;
      }
      setIsReduceStarted(true);
    }
    
    if (scheduledMaps == 0 && numPendingReduces > 0) {
      LOG.info("All maps assigned. Ramping up all remaining reduces:" + numPendingReduces);
      scheduleAllReduces();
      return;
    }

    scheduleReducesWithHeadroom(totalMaps, completedMaps, scheduledMaps, scheduledReduces,
        assignedMaps, assignedReduces, mapResourceReqt, reduceResourceReqt,
        numPendingReduces, maxReduceRampupLimit);
  }

  private boolean checkReduceSlowStart(int totalMaps, int completedMaps, float reduceSlowStart) {
    int completedMapsForReduceSlowstart = (int)Math.ceil(reduceSlowStart * totalMaps);
    if(completedMaps < completedMapsForReduceSlowstart) {
      LOG.info("Reduce slow start threshold not met. completedMapsForReduceSlowstart " 
          + completedMapsForReduceSlowstart);
      return false;
    } else {
      LOG.info("Reduce slow start threshold reached. Scheduling reduces.");
      return true;
    }
  }

  private void scheduleReducesWithHeadroom(int totalMaps, int completedMaps,
      int scheduledMaps, int scheduledReduces, int assignedMaps, int assignedReduces,
      Resource mapResourceReqt, Resource reduceResourceReqt, int numPendingReduces,
      float maxReduceRampupLimit) {
    
    float completedMapPercent = calculateCompletedMapPercent(totalMaps, completedMaps);
    
    Resource netScheduledMapResource = Resources.multiply(mapResourceReqt, 
        (scheduledMaps + assignedMaps));
    Resource netScheduledReduceResource = Resources.multiply(reduceResourceReqt,
        (scheduledReduces + assignedReduces));

    Resource totalResourceLimit = getResourceLimit();
    
    ReduceResourceLimits limits = calculateReduceResourceLimits(totalResourceLimit,
        completedMapPercent, mapResourceReqt, netScheduledMapResource, maxReduceRampupLimit);

    LOG.info("completedMapPercent " + completedMapPercent
        + " totalResourceLimit:" + totalResourceLimit
        + " finalMapResourceLimit:" + limits.finalMapResourceLimit
        + " finalReduceResourceLimit:" + limits.finalReduceResourceLimit
        + " netScheduledMapResource:" + netScheduledMapResource
        + " netScheduledReduceResource:" + netScheduledReduceResource);

    int rampUp = ResourceCalculatorUtils.computeAvailableContainers(
        Resources.subtract(limits.finalReduceResourceLimit, netScheduledReduceResource),
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
    if (totalMaps != 0) {
      return (float)completedMaps / totalMaps;
    } else {
      return 1;
    }
  }

  private ReduceResourceLimits calculateReduceResourceLimits(Resource totalResourceLimit,
      float completedMapPercent, Resource mapResourceReqt, Resource netScheduledMapResource,
      float maxReduceRampupLimit) {
    
    Resource idealReduceResourceLimit = Resources.multiply(totalResourceLimit,
        Math.min(completedMapPercent, maxReduceRampupLimit));
    Resource ideaMapResourceLimit = Resources.subtract(totalResourceLimit, idealReduceResourceLimit);

    Resource finalMapResourceLimit;
    Resource finalReduceResourceLimit;

    if (ResourceCalculatorUtils.computeAvailableContainers(ideaMapResourceLimit,
        mapResourceReqt, getSchedulerResourceTypes()) >= 0) {
      Resource unusedMapResourceLimit = Resources.subtract(ideaMapResourceLimit, netScheduledMapResource);
      finalReduceResourceLimit = Resources.add(idealReduceResourceLimit, unusedMapResourceLimit);
      finalMapResourceLimit = Resources.subtract(totalResourceLimit, finalReduceResourceLimit);
    } else {
      finalMapResourceLimit = ideaMapResourceLimit;
      finalReduceResourceLimit = idealReduceResourceLimit;
    }

    return new ReduceResourceLimits(finalMapResourceLimit, finalReduceResourceLimit);
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
    AllocateResponse response;
    
    try {
      response = makeRemoteRequest();
      retrystartTime = System.currentTimeMillis();
    } catch (ApplicationAttemptNotFoundException e ) {
      eventHandler.handle(new JobEvent(this.getJob().getID(),
        JobEventType.JOB_AM_REBOOT));
      throw new YarnRuntimeException(
        "Resource Manager doesn't recognize AttemptId: "
            + this.getContext().getApplicationAttemptId(), e);
    } catch (ApplicationMasterNotRegisteredException e) {
      LOG.info("ApplicationMaster is out of sync with ResourceManager,"
          + " hence resync and send outstanding requests.");
      lastResponseID = 0;
      register();
      addOutstandingRequestOnResync();
      return null;
    } catch (Exception e) {
      if (System.currentTimeMillis() - retrystartTime >= retryInterval) {
        LOG.error("Could not contact RM after " + retryInterval + " milliseconds.");
        eventHandler.handle(new JobEvent(this.getJob().getID(),
                                         JobEventType.JOB_AM_REBOOT));
        throw new YarnRuntimeException("Could not contact RM after " +
                                retryInterval + " milliseconds.");
      }
      throw e;
    }
    
    Resource newHeadRoom = getAvailableResources() == null ? Resources.none()
        : getAvailableResources();
    List<Container> newContainers = response.getAllocatedContainers();
    
    processNMTokens(response);
    processAMRMToken(response);

    List<ContainerStatus> finishedContainers = response.getCompletedContainersStatuses();
    if (newContainers.size() + finishedContainers.size() > 0
        || !headRoom.equals(newHeadRoom)) {
      recalculateReduceSchedule = true;
      if (LOG.isDebugEnabled() && !headRoom.equals(newHeadRoom)) {
        LOG.debug("headroom=" + newHeadRoom);
      }
    }

    if (LOG.isDebugEnabled()) {
      for (Container cont : newContainers) {
        LOG.debug("Received new Container :" + cont);
      }
    }

    computeIgnoreBlacklisting();
    handleUpdatedNodes(response);
    processFinishedContainers(finishedContainers);
    
    return newContainers;
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
  }

  private void applyConcurrentTaskLimits() {
    applyMapTaskLimits();
    applyReduceTaskLimits();
  }

  private void applyMapTaskLimits() {
    int numScheduledMaps = scheduledRequests.maps.size();
    if (maxRunningMaps > 0 && numScheduledMaps > 0) {
      int maxRequestedMaps = Math.max(0,
          maxRunningMaps - assignedRequests.maps.size());
      int numScheduledFailMaps = scheduledRequests.earlierFailedMaps.size();
      int failedMapRequestLimit = Math.min(maxRequestedMaps, numScheduledFailMaps);
      int normalMapRequestLimit = Math.min(
          maxRequestedMaps - failedMapRequestLimit,
          numScheduledMaps - numScheduledFailMaps);
      setRequestLimit(PRIORITY_FAST_FAIL_MAP, mapResourceRequest, failedMapRequestLimit);
      setRequestLimit(PRIORITY_MAP, mapResourceRequest, normalMapRequestLimit);
    }
  }

  private void applyReduceTaskLimits() {
    int numScheduledReduces = scheduledRequests.reduces.size();
    if (maxRunningReduces > 0 && numScheduledReduces > 0) {
      int maxRequestedReduces = Math.max(0,
          maxRunningReduces - assignedRequests.reduces.size());
      int reduceRequestLimit = Math.min(maxRequestedReduces, numScheduledReduces);
      setRequestLimit(PRIORITY_REDUCE, reduceResourceRequest, reduceRequestLimit);
    }
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
    if (cont.getExitStatus() == ContainerExitStatus.ABORTED
        || cont.getExitStatus() == ContainerExitStatus.PREEMPTED) {
      return new TaskAttemptEvent(attemptID, TaskAttemptEventType.TA_KILL);
    } else {
      return new TaskAttemptEvent(attemptID, TaskAttemptEventType.TA_CONTAINER_COMPLETED);
    }
  }
  
  @SuppressWarnings("unchecked")
  private void handleUpdatedNodes(AllocateResponse response) {
    List<NodeReport> updatedNodes = response.getUpdatedNodes();
    if (!updatedNodes.isEmpty()) {
      eventHandler.handle(new JobUpdatedNodesEvent(getJob().getID(), updatedNodes));

      HashSet<NodeId> unusableNodes = new HashSet<NodeId>();
      for (NodeReport nr : updatedNodes) {
        NodeState nodeState = nr.getNodeState();
        if (nodeState.isUnusable()) {
          unusableNodes.add(nr.getNodeId());
        }
      }
      killTasksOnUnusableNodes(unusableNodes);
    }
  }

  private void killTasksOnUnusableNodes(HashSet<NodeId> unusableNodes) {
    killTasksOnNodes(assignedRequests.maps, unusableNodes);
    killTasksOnNodes(assignedRequests.reduces, unusableNodes);
  }

  private void killTasksOnNodes(HashMap<TaskAttemptId, Container> taskSet, 
      HashSet<NodeId> unusableNodes) {
    for (Map.Entry<TaskAttemptId, Container> entry : taskSet.entrySet()) {
      TaskAttemptId tid = entry.getKey();
      NodeId taskAttemptNodeId = entry.getValue().getNodeId();
      if (unusableNodes.contains(taskAttemptNodeId)) {
        LOG.info("Killing taskAttempt:" + tid
            + " because it is running on unusable node:" + taskAttemptNodeId);
        eventHandler.handle(new TaskAttemptKillEvent(tid,
            "TaskAttempt killed because it ran on unusable node" + taskAttemptNodeId));
      }
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

  private static class ReduceResourceLimits {
    final Resource finalMapResourceLimit;
    final Resource finalReduceResourceLimit;

    ReduceResourceLimits(Resource finalMapResourceLimit, Resource finalReduceResourceLimit) {
      this.finalMapResourceLimit = finalMapResourceLimit;
      this.finalReduceResourceLimit = finalReduceResourceLimit;
    }
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
      Iterator<Container> it = allocatedContainers.iterator();
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
        
        String allocatedHost = allocated.getNodeId().getHost();
        if (isNodeBlacklisted(allocatedHost)) {
          handleBlacklistedNode(allocated);
          containerNotAssigned(allocated);
          it.remove();
          continue;
        }
      }
    }

    private boolean isContainerAssignable(Container allocated) {
      Priority priority = allocated.getPriority();
      Resource allocatedResource = allocated.getResource();
      
      if (PRIORITY_FAST_FAIL_MAP.equals(priority) || PRIORITY_MAP.equals(priority)) {
        if (ResourceCalculatorUtils.computeAvailableContainers(allocatedResource,
            mapResourceRequest, getSchedulerResourceTypes()) <= 0 || maps.isEmpty()) {
          LOG.info("Cannot assign container " + allocated 
              + " for a map as either container memory less than required " 
              + mapResourceRequest + " or no pending map tasks - maps.isEmpty=" 
              + maps.isEmpty()); 
          return false; 
        }
      } else if (PRIORITY_REDUCE.equals(priority)) {
        if (ResourceCalculatorUtils.computeAvailableContainers(allocatedResource,
            reduceResourceRequest, getSchedulerResourceTypes()) <= 0 || reduces.isEmpty()) {
          LOG.info("Cannot assign container " + allocated 
              + " for a reduce as either container memory less than required " 
              + reduceResourceRequest + " or no pending reduce tasks - reduces.isEmpty=" 
              + reduces.isEmpty()); 
          return false;
        }
      } else {
        LOG.warn("Container allocated at unwanted priority: " + priority + 
            ". Returning to RM...");
        return false;
      }
      return true;
    }

    private void handleBlacklistedNode(Container allocated) {
      LOG.info("Got allocated container on a blacklisted host " 
          + allocated.getNodeId().getHost() + ". Releasing container " + allocated);

      ContainerRequest toBeReplacedReq = getContainerReqToReplace(allocated);
      if (toBeReplacedReq != null) {
        LOG.info("Placing a new container request for task attempt " 
            + toBeReplacedReq.attemptID);
        ContainerRequest newReq = getFilteredContainerRequest(toBeReplacedReq);
        decContainerReq(toBeReplacedReq);
        if (toBeReplacedReq.attemptID.getTaskId().getTaskType() == TaskType.MAP) {
          maps.put(newReq.attemptID, newReq);
        } else {
          reduces.put(newReq.attemptID, newReq);
        }
        addContainerReq(newReq);
      } else {
        LOG.info("Could not map allocated container to a valid request."
            + " Releasing allocated container " + allocated);
      }
    }
    
    @SuppressWarnings("unchecked")
    private void containerAssigned(Container allocated, ContainerRequest assigned) {
      decContainerReq(assigned);
      eventHandler.handle(new TaskAttemptContainerAssignedEvent(
          assigned.attemptID, allocated, applicationACLs));
      assignedRequests.add(allocated, assigned.attemptID);

      if (LOG.isDebugEnabled()) {
        LOG.info("Assigned container (" + allocated + ") to task " 
            + assigned.attemptID + " on node " + allocated.getNodeId().toString());
      }
    }
    
    private void containerNotAssigned(Container allocated) {
      containersReleased++;
      pendingRelease.add(allocated.getId());
      release(allocated.getId());      
    }
    
    private ContainerRequest assignWithoutLocality(Container allocated) {
      ContainerRequest assigned = null;
      Priority priority = allocated.getPriority();
      
      if (PRIORITY_FAST_FAIL_MAP.equals(priority)) {
        LOG.info("Assigning container " + allocated + " to fast fail map");
        assigned = assignToFailedMap(allocated);
      } else if (PRIORITY_REDUCE.equals(priority)) {
        if (LOG.isDebugEnabled()) {
          LOG.debug("Assigning container " + allocated + " to reduce");
        }
        assigned = assignToReduce(allocated);
      }
        
      return assigned;
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

    private void releaseUnassignedContainers(List<Container> allocatedContainers) {
      Iterator<Container> it = allocatedContainers.iterator();
      while (it.hasNext()) {
        Container allocated = it.next();
        LOG.info("Releasing unassigned container " + allocated);
        containerNotAssigned(allocated);
      }
    }
    
    private ContainerRequest getContainerReqToReplace(Container allocated) {
      LOG.info("Finding containerReq for allocated container: " + allocated);
      Priority priority = allocated.getPriority();
      ContainerRequest toBeReplaced = null;
      
      if (PRIORITY_FAST_FAIL_MAP.equals(priority)) {
        toBeReplaced = getFailedMapReplacement();
      } else if (PRIORITY_MAP.equals(priority)) {
        toBeReplaced = getMapReplacement(allocated);
      } else if (PRIORITY_REDUCE.equals(priority)) {
        TaskAttemptId tId = reduces.keySet().iterator().next();
        toBeReplaced = reduces.remove(tId);    
      }
      LOG.info("Found replacement: " + toBeReplaced);
      return toBeReplaced;
    }

    private ContainerRequest getFailedMapReplacement() {
      LOG.info("Replacing FAST_FAIL_MAP container");
      ContainerRequest toBeReplaced = null;
      Iterator<TaskAttemptId> iter = earlierFailedMaps.iterator();
      while (toBeReplaced == null && iter.hasNext()) {
        toBeReplaced = maps.get(iter.next());
      }
      return toBeReplaced;
    }

    private ContainerRequest getMapReplacement(Container allocated) {
      LOG.info("Replacing MAP container " + allocated.getId());
      String host = allocated.getNodeId().getHost();
      LinkedList<TaskAttemptId> list = mapsHostMapping.get(host);
      ContainerRequest toBeReplaced = null;
      
      if (list != null && list.size() > 0) {
        TaskAttemptId tId = list.removeLast();
        if (maps.containsKey(tId)) {
          toBeReplaced = maps.remove(tId);
        }
      } else {
        TaskAttemptId tId = maps.keySet().iterator().next();
        toBeReplaced = maps.remove(tId);          
      }
      return toBeReplaced;
    }
    
    @SuppressWarnings("unchecked")
    private ContainerRequest assignToFailedMap(Container allocated) {
      ContainerRequest assigned = null;
      while (assigned == null && earlierFailedMaps.size() > 0 && canAssignMaps()) {
        TaskAttemptId tId = earlierFailedMaps.removeFirst();      
        if (maps.containsKey(tId)) {
          assigned = maps.remove(tId);
          JobCounterUpdateEvent jce = new JobCounterUpdateEvent(
              assigned.attemptID.getTaskId().getJobId());
          jce.addCounterUpdate(JobCounter.OTHER_LOCAL_MAPS, 1);
          eventHandler.handle(jce);
          LOG.info("Assigned from earlierFailedMaps");
          break;
        }
      }
      return assigned;
    }
    
    private ContainerRequest assignToReduce(Container allocated) {
      ContainerRequest assigned = null;
      if (reduces.size() > 0 && canAssignReduces()) {
        TaskAttemptId tId = reduces.keySet().iterator().next();
        assigned = reduces.remove(tId);
        LOG.info("Assigned to reduce");
      }
      return assigned;
    }
    
    @SuppressWarnings("unchecked")
    private void assignMapsWithLocality(List<Container> allocatedContainers) {
      assignMapsWithHostLocality(allocatedContainers);
      assignMapsWithRackLocality(allocatedContainers);
      assignMapsWithoutLocality(allocatedContainers);
    }

    private void assignMapsWithHostLocality(List<Container> allocatedContainers) {
      Iterator<Container> it = allocatedContainers.iterator();
      while(it.hasNext() && maps.size() > 0 && canAssignMaps()){
        Container allocated = it.next();        
        Priority priority = allocated.getPriority();
        assert PRIORITY_MAP.equals(priority);
        
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
      while(it.hasNext() && maps.size() > 0 && canAssignMaps()){
        Container allocated = it.next();
        Priority priority = allocated.getPriority();
        assert PRIORITY_MAP.equals(priority);
        
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
      while(it.hasNext() && maps.size() > 0 && canAssignMaps()){
        Container allocated = it.next();
        Priority priority = allocated.getPriority();
        assert PRIORITY_MAP.equals(priority);
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
        containerId = maps.remove(tId).getId();
      } else {
        containerId = reduces.remove(tId).getId();
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