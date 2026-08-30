// Refactored RMContainerAllocator.java to reduce cyclomatic and cognitive complexity
// primarily applying guard-clause refactorings, extracting predicates, and limiting nesting.

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
import org.apache.hadoop.yarn.util.resource.ResourceCalculatorUtils;
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
          try {
            ContainerAllocatorEvent event = RMContainerAllocator.this.eventQueue.take();
            try {
              handleEvent(event);
            } catch (Throwable t) {
              LOG.error("Error in handling event type " + event.getType(), t);
              eventHandler.handle(new JobEvent(getJob().getID(), JobEventType.INTERNAL_ERROR));
              return;
            }
          } catch (InterruptedException e) {
            if (!stopped.get()) {
              LOG.error("Returning, interrupted", e);
            }
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
    if ((lastCompletedTasks != completedTasks || scheduledRequests.maps.size() > 0)) {
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
  protected synchronized void serviceStop() throws Exception {
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
      LOG.warn("Very low remaining capacity in the event-queue " + "of RMContainerAllocator: " + remCapacity);
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
      handleContainerRequestEvent((ContainerRequestEvent) event);
    } else if (event.getType() == ContainerAllocator.EventType.CONTAINER_DEALLOCATE) {
      handleContainerDeallocateEvent(event);
    } else if (event.getType() == ContainerAllocator.EventType.CONTAINER_FAILED) {
      ContainerFailedEvent fEv = (ContainerFailedEvent) event;
      String host = getHost(fEv.getContMgrAddress());
      containerFailedOnHost(host);
    }
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
    if (!hasUnassignedMaps()) {
      return;
    }
    Resource resourceLimit = getResourceLimit();
    Resource availableResourceForMap = Resources.subtract(
        resourceLimit,
        Resources.multiply(reduceResourceRequest,
            assignedRequests.reduces.size()
                - assignedRequests.preemptionWaitingReduces.size()));
    if (ResourceCalculatorUtils.computeAvailableContainers(availableResourceForMap,
        mapResourceRequest, getSchedulerResourceTypes()) <= 0) {
      rampDownAllScheduledReduces();

      int hangingMapRequests = getNumOfHangingRequests(scheduledRequests.maps);
      if (hangingMapRequests > 0) {
        preemptReducesForMaps(hangingMapRequests, resourceLimit);
      }
    }
  }

  private boolean hasUnassignedMaps() {
    return scheduledRequests.maps.size() > 0;
  }

  private void rampDownAllScheduledReduces() {
    LOG.info("Ramping down all scheduled reduces: " + scheduledRequests.reduces.size());
    for (ContainerRequest req : scheduledRequests.reduces.values()) {
      pendingReduces.add(req);
    }
    scheduledRequests.reduces.clear();
  }

  private void preemptReducesForMaps(int hangingMapRequests, Resource resourceLimit) {
    int preemptionReduceNumForOneMap = ResourceCalculatorUtils.divideAndCeilContainers(
        mapResourceRequest, reduceResourceRequest, getSchedulerResourceTypes());
    int preemptionReduceNumForPreemptionLimit = ResourceCalculatorUtils.divideAndCeilContainers(
        Resources.multiply(resourceLimit, maxReducePreemptionLimit),
        reduceResourceRequest, getSchedulerResourceTypes());
    int preemptionReduceNumForAllMaps = ResourceCalculatorUtils.divideAndCeilContainers(
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
    long currTime = clock.getTime();
    int hangingRequests = 0;
    for (ContainerRequest request : requestMap.values()) {
      if (currTime - request.requestTimeMs > allocationDelayThresholdMs) {
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
    
    if (!isReduceStartedAndThresholdReached(totalMaps, completedMaps, reduceSlowStart)) {
      return;
    }
    
    if (isAllMapsAssigned(scheduledMaps, numPendingReduces)) {
      LOG.info("All maps assigned. Ramping up all remaining reduces: " + numPendingReduces);
      scheduleAllReduces();
      return;
    }

    calculateAndScheduleReduceRampUp(totalMaps, completedMaps, scheduledMaps, scheduledReduces,
        assignedMaps, assignedReduces, mapResourceReqt, reduceResourceReqt, numPendingReduces,
        maxReduceRampupLimit);
  }

  private boolean isReduceStartedAndThresholdReached(int totalMaps, int completedMaps, float reduceSlowStart) {
    if (getIsReduceStarted()) {
      return true;
    }
    int completedMapsForReduceSlowstart = (int) Math.ceil(reduceSlowStart * totalMaps);
    if (completedMaps >= completedMapsForReduceSlowstart) {
      LOG.info("Reduce slow start threshold reached. Scheduling reduces.");
      setIsReduceStarted(true);
      return true;
    }
    LOG.info("Reduce slow start threshold not met. completedMapsForReduceSlowstart=" 
        + completedMapsForReduceSlowstart);
    return false;
  }

  private boolean isAllMapsAssigned(int scheduledMaps, int numPendingReduces) {
    return scheduledMaps == 0 && numPendingReduces > 0;
  }

  private void calculateAndScheduleReduceRampUp(int totalMaps, int completedMaps,
      int scheduledMaps, int scheduledReduces, int assignedMaps, int assignedReduces,
      Resource mapResourceReqt, Resource reduceResourceReqt, int numPendingReduces,
      float maxReduceRampupLimit) {
    Resource netScheduledMapResource = Resources.multiply(mapResourceReqt, (scheduledMaps + assignedMaps));
    Resource netScheduledReduceResource = Resources.multiply(reduceResourceReqt,
        (scheduledReduces + assignedReduces));

    Resource finalMapResourceLimit;
    Resource finalReduceResourceLimit;

    Resource totalResourceLimit = getResourceLimit();

    float completedMapPercent = (totalMaps == 0) ? 1.0f : (float) completedMaps / totalMaps;
    
    Resource idealReduceResourceLimit = Resources.multiply(totalResourceLimit,
        Math.min(completedMapPercent, maxReduceRampupLimit));
    Resource idealMapResourceLimit = Resources.subtract(totalResourceLimit, idealReduceResourceLimit);

    if (hasEnoughMapCapacity(idealMapResourceLimit, mapResourceReqt, scheduledMaps, assignedMaps)) {
      Resource unusedMapResourceLimit = Resources.subtract(idealMapResourceLimit, netScheduledMapResource);
      finalReduceResourceLimit = Resources.add(idealReduceResourceLimit, unusedMapResourceLimit);
      finalMapResourceLimit = Resources.subtract(totalResourceLimit, finalReduceResourceLimit);
    } else {
      finalMapResourceLimit = idealMapResourceLimit;
      finalReduceResourceLimit = idealReduceResourceLimit;
    }

    LOG.info("completedMapPercent " + completedMapPercent
        + " totalResourceLimit:" + totalResourceLimit
        + " finalMapResourceLimit:" + finalMapResourceLimit
        + " finalReduceResourceLimit:" + finalReduceResourceLimit
        + " netScheduledMapResource:" + netScheduledMapResource
        + " netScheduledReduceResource:" + netScheduledReduceResource);

    int rampUp = ResourceCalculatorUtils.computeAvailableContainers(
        Resources.subtract(finalReduceResourceLimit, netScheduledReduceResource),
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

  private boolean hasEnoughMapCapacity(Resource idealMapResourceLimit, Resource mapResourceReqt,
      int scheduledMaps, int assignedMaps) {
    return ResourceCalculatorUtils.computeAvailableContainers(idealMapResourceLimit,
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

    Resource headRoom = getAvailableResources();
    if (headRoom == null) {
      headRoom = Resources.none();
    } else {
      headRoom = Resources.clone(headRoom);
    }
    AllocateResponse response;
    try {
      response = makeRemoteRequest();
      retrystartTime = System.currentTimeMillis();
    } catch (ApplicationAttemptNotFoundException e) {
      eventHandler.handle(new JobEvent(this.getJob().getID(), JobEventType.JOB_AM_REBOOT));
      throw new YarnRuntimeException(
          "Resource Manager doesn't recognize AttemptId: "
              + this.getContext().getApplicationAttemptId(), e);
    } catch (ApplicationMasterNotRegisteredException e) {
      LOG.info("ApplicationMaster is out of sync with ResourceManager, resync and send outstanding requests.");
      lastResponseID = 0;
      register();
      addOutstandingRequestOnResync();
      return null;
    } catch (Exception e) {
      if (System.currentTimeMillis() - retrystartTime >= retryInterval) {
        LOG.error("Could not contact RM after " + retryInterval + " milliseconds.");
        eventHandler.handle(new JobEvent(this.getJob().getID(), JobEventType.JOB_AM_REBOOT));
        throw new YarnRuntimeException("Could not contact RM after " + retryInterval + " milliseconds.");
      }
      throw e;
    }
    Resource newHeadRoom = getAvailableResources();
    if (newHeadRoom == null) {
      newHeadRoom = Resources.none();
    }
    List<Container> newContainers = response.getAllocatedContainers();
    updateNMTokens(response);
    updateAMRMToken(response);

    if (newContainers.size() + response.getCompletedContainersStatuses().size() > 0
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

    processCompletedContainers(response.getCompletedContainersStatuses());

    return newContainers;
  }

  private void updateNMTokens(AllocateResponse response) {
    if (response.getNMTokens() == null) {
      return;
    }
    for (NMToken nmToken : response.getNMTokens()) {
      NMTokenCache.setNMToken(nmToken.getNodeId().toString(), nmToken.getToken());
    }
  }

  private void updateAMRMToken(AllocateResponse response) throws IOException {
    Token token = response.getAMRMToken();
    if (token == null) {
      return;
    }
    org.apache.hadoop.security.token.Token<AMRMTokenIdentifier> amrmToken =
        new org.apache.hadoop.security.token.Token<AMRMTokenIdentifier>(token
            .getIdentifier().array(), token.getPassword().array(), new Text(
            token.getKind()), new Text(token.getService()));
    UserGroupInformation currentUGI = UserGroupInformation.getCurrentUser();
    currentUGI.addToken(amrmToken);
    amrmToken.setService(ClientRMProxy.getAMRMTokenService(getConfig()));
  }

  private void processCompletedContainers(List<ContainerStatus> finishedContainers) {
    for (ContainerStatus cont : finishedContainers) {
      LOG.info("Received completed container " + cont.getContainerId());
      TaskAttemptId attemptID = assignedRequests.get(cont.getContainerId());
      if (attemptID == null) {
        LOG.error("Container complete event for unknown container id " + cont.getContainerId());
      } else {
        pendingRelease.remove(cont.getContainerId());
        assignedRequests.remove(attemptID);
        
        eventHandler.handle(createContainerFinishedEvent(cont, attemptID));
        
        String diagnostics = StringInterner.weakIntern(cont.getDiagnostics());
        eventHandler.handle(new TaskAttemptDiagnosticsUpdateEvent(attemptID, diagnostics));
      }      
    }
  }

  private void applyConcurrentTaskLimits() {
    int numScheduledMaps = scheduledRequests.maps.size();
    if (maxRunningMaps > 0 && numScheduledMaps > 0) {
      int maxRequestedMaps = Math.max(0, maxRunningMaps - assignedRequests.maps.size());
      int numScheduledFailMaps = scheduledRequests.earlierFailedMaps.size();
      int failedMapRequestLimit = Math.min(maxRequestedMaps,	numScheduledFailMaps);
      int normalMapRequestLimit = Math.min(
          maxRequestedMaps - failedMapRequestLimit,
          numScheduledMaps - numScheduledFailMaps);
      setRequestLimit(PRIORITY_FAST_FAIL_MAP, mapResourceRequest, failedMapRequestLimit);
      setRequestLimit(PRIORITY_MAP, mapResourceRequest, normalMapRequestLimit);
    }

    int numScheduledReduces = scheduledRequests.reduces.size();
    if (maxRunningReduces > 0 && numScheduledReduces > 0) {
      int maxRequestedReduces = Math.max(0, maxRunningReduces - assignedRequests.reduces.size());
      int reduceRequestLimit = Math.min(maxRequestedReduces, numScheduledReduces);
      setRequestLimit(PRIORITY_REDUCE, reduceResourceRequest, reduceRequestLimit);
    }
  }

  private boolean canAssignMaps() {
    return (maxRunningMaps <= 0 || assignedRequests.maps.size() < maxRunningMaps);
  }

  private boolean canAssignReduces() {
    return (maxRunningReduces <= 0 || assignedRequests.reduces.size() < maxRunningReduces);
  }

  @VisibleForTesting
  public TaskAttemptEvent createContainerFinishedEvent(ContainerStatus cont,
      TaskAttemptId attemptID) {
    int exitStatus = cont.getExitStatus();
    if (exitStatus == ContainerExitStatus.ABORTED || exitStatus == ContainerExitStatus.PREEMPTED) {
      return new TaskAttemptEvent(attemptID, TaskAttemptEventType.TA_KILL);
    } else {
      return new TaskAttemptEvent(attemptID, TaskAttemptEventType.TA_CONTAINER_COMPLETED);
    }
  }
  
  @SuppressWarnings("unchecked")
  private void handleUpdatedNodes(AllocateResponse response) {
    List<NodeReport> updatedNodes = response.getUpdatedNodes();
    if (updatedNodes.isEmpty()) {
      return;
    }

    eventHandler.handle(new JobUpdatedNodesEvent(getJob().getID(), updatedNodes));

    HashSet<NodeId> unusableNodes = extractUnusableNodes(updatedNodes);
    killRunningContainersOnUnusableNodes(unusableNodes);
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

  private void killRunningContainersOnUnusableNodes(HashSet<NodeId> unusableNodes) {
    for (int i = 0; i < 2; i++) {
      LinkedHashMap<TaskAttemptId, Container> taskSet = (i == 0) ? assignedRequests.maps
          : assignedRequests.reduces;
      for (Map.Entry<TaskAttemptId, Container> entry : taskSet.entrySet()) {
        TaskAttemptId tid = entry.getKey();
        NodeId taskAttemptNodeId = entry.getValue().getNodeId();
        if (unusableNodes.contains(taskAttemptNodeId)) {
          LOG.info("Killing taskAttempt:" + tid + " because it is running on unusable node:" + taskAttemptNodeId);
          eventHandler.handle(new TaskAttemptKillEvent(tid,
              "TaskAttempt killed because it ran on unusable node: " + taskAttemptNodeId));
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
    Resource assignedMapResource = Resources.multiply(mapResourceRequest, assignedRequests.maps.size());
    Resource assignedReduceResource = Resources.multiply(reduceResourceRequest, assignedRequests.reduces.size());
    return Resources.add(headRoom, Resources.add(assignedMapResource, assignedReduceResource));
  }

  @Private
  @VisibleForTesting
  class ScheduledRequests {
    
    private final LinkedList<TaskAttemptId> earlierFailedMaps = new LinkedList<TaskAttemptId>();
    private final Map<String, LinkedList<TaskAttemptId>> mapsHostMapping = new HashMap<String, LinkedList<TaskAttemptId>>();
    private final Map<String, LinkedList<TaskAttemptId>> mapsRackMapping = new HashMap<String, LinkedList<TaskAttemptId>>();
    @VisibleForTesting
    final Map<TaskAttemptId, ContainerRequest> maps = new LinkedHashMap<TaskAttemptId, ContainerRequest>();
    private final LinkedHashMap<TaskAttemptId, ContainerRequest> reduces = new LinkedHashMap<TaskAttemptId, ContainerRequest>();
    
    boolean remove(TaskAttemptId tId) {
      ContainerRequest req = maps.remove(tId);
      if (req == null) {
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
      if (event.getEarlierAttemptFailed()) {
        earlierFailedMaps.add(event.getAttemptID());
        ContainerRequest request = new ContainerRequest(event, PRIORITY_FAST_FAIL_MAP);
        LOG.info("Added " + event.getAttemptID() + " to list of failed maps");
        maps.put(event.getAttemptID(), request);
        addContainerReq(request);
      } else {
        for (String host : event.getHosts()) {
          addHostMapping(host, event.getAttemptID());
          if (LOG.isDebugEnabled()) {
            LOG.debug("Added attempt req to host " + host);
          }
        }
        for (String rack : event.getRacks()) {
          addRackMapping(rack, event.getAttemptID());
          if (LOG.isDebugEnabled()) {
            LOG.debug("Added attempt req to rack " + rack);
          }
        }
        ContainerRequest request = new ContainerRequest(event, PRIORITY_MAP);
        maps.put(event.getAttemptID(), request);
        addContainerReq(request);
      }
    }

    private void addHostMapping(String host, TaskAttemptId attemptId) {
      LinkedList<TaskAttemptId> list = mapsHostMapping.get(host);
      if (list == null) {
        list = new LinkedList<TaskAttemptId>();
        mapsHostMapping.put(host, list);
      }
      list.add(attemptId);
    }

    private void addRackMapping(String rack, TaskAttemptId attemptId) {
      LinkedList<TaskAttemptId> list = mapsRackMapping.get(rack);
      if (list == null) {
        list = new LinkedList<TaskAttemptId>();
        mapsRackMapping.put(rack, list);
      }
      list.add(attemptId);
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
        if (canAssignContainer(allocated)) {
          assignContainerIfNotBlacklisted(allocated, it);
        } else {
          containerNotAssigned(allocated);
          it.remove();
        }
      }

      assignContainers(allocatedContainers);
      releaseUnassignedContainers(allocatedContainers);
    }

    private boolean canAssignContainer(Container allocated) {
      Priority priority = allocated.getPriority();
      Resource allocatedResource = allocated.getResource();
      if (PRIORITY_FAST_FAIL_MAP.equals(priority) || PRIORITY_MAP.equals(priority)) {
        return ResourceCalculatorUtils.computeAvailableContainers(allocatedResource,
                mapResourceRequest, getSchedulerResourceTypes()) > 0 && !maps.isEmpty();
      }
      if (PRIORITY_REDUCE.equals(priority)) {
        return ResourceCalculatorUtils.computeAvailableContainers(allocatedResource,
                reduceResourceRequest, getSchedulerResourceTypes()) > 0 && !reduces.isEmpty();
      }
      LOG.warn("Container allocated at unwanted priority: " + priority + ". Returning to RM...");
      return false;
    }

    private void assignContainerIfNotBlacklisted(Container allocated, Iterator<Container> it) {
      String allocatedHost = allocated.getNodeId().getHost();
      if (isNodeBlacklisted(allocatedHost)) {
        replaceContainerRequestForBlacklistedHost(allocated, it);
        return;
      }

      ContainerRequest assigned = assignWithoutLocality(allocated);
      if (assigned != null) {
        containerAssigned(allocated, assigned);
        it.remove();
      }
    }

    private void replaceContainerRequestForBlacklistedHost(Container allocated, Iterator<Container> it) {
      LOG.info("Got allocated container on a blacklisted host "+ allocatedHost
          + ". Releasing container " + allocated);
      ContainerRequest toBeReplacedReq = getContainerReqToReplace(allocated);
      if (toBeReplacedReq != null) {
        LOG.info("Placing a new container request for task attempt " + toBeReplacedReq.attemptID);
        ContainerRequest newReq = getFilteredContainerRequest(toBeReplacedReq);
        decContainerReq(toBeReplacedReq);
        if (toBeReplacedReq.attemptID.getTaskId().getTaskType() == TaskType.MAP) {
          maps.put(newReq.attemptID, newReq);
        } else {
          reduces.put(newReq.attemptID, newReq);
        }
        addContainerReq(newReq);
      } else {
        LOG.info("Could not map allocated container to a valid request. Releasing allocated container " + allocated);
      }
      containerNotAssigned(allocated);
      it.remove();
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
      Priority priority = allocated.getPriority();
      if (PRIORITY_FAST_FAIL_MAP.equals(priority)) {
        return findContainerRequestFromEarlierFailedMaps();
      } else if (PRIORITY_MAP.equals(priority)) {
        return findMapContainerRequestFromSameHost(allocated);
      } else if (PRIORITY_REDUCE.equals(priority)) {
        return findReduceContainerRequest();
      }
      return null;
    }

    private ContainerRequest findContainerRequestFromEarlierFailedMaps() {
      Iterator<TaskAttemptId> iter = earlierFailedMaps.iterator();
      while (iter.hasNext()) {
        ContainerRequest req = maps.get(iter.next());
        if (req != null) {
          return req;
        }
      }
      return null;
    }
    
    private ContainerRequest findMapContainerRequestFromSameHost(Container allocated) {
      String host = allocated.getNodeId().getHost();
      LinkedList<TaskAttemptId> list = mapsHostMapping.get(host);
      if (list != null && !list.isEmpty()) {
        TaskAttemptId tId = list.removeLast();
        ContainerRequest req = maps.remove(tId);
        if (req != null) {
          return req;
        }
      }
      TaskAttemptId tId = maps.keySet().iterator().next();
      return maps.remove(tId);
    }
    
    private ContainerRequest findReduceContainerRequest() {
      TaskAttemptId tId = reduces.keySet().iterator().next();
      return reduces.remove(tId);
    }
    
    
    @SuppressWarnings("unchecked")
    private ContainerRequest assignToFailedMap(Container allocated) {
      while (earlierFailedMaps.size() > 0 && canAssignMaps()) {
        TaskAttemptId tId = earlierFailedMaps.removeFirst();      
        ContainerRequest assigned = maps.remove(tId);
        if (assigned != null) {
          JobCounterUpdateEvent jce = new JobCounterUpdateEvent(assigned.attemptID.getTaskId().getJobId());
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
      Iterator<Container> it = allocatedContainers.iterator();
      while (it.hasNext() && maps.size() > 0 && canAssignMaps()) {
        Container allocated = it.next();
        if (!PRIORITY_MAP.equals(allocated.getPriority())) {
          continue;
        }
        String host = allocated.getNodeId().getHost();
        assignToLocalMap(it, allocated, host);
      }
      
      it = allocatedContainers.iterator();
      while (it.hasNext() && maps.size() > 0 && canAssignMaps()) {
        Container allocated = it.next();
        if (!PRIORITY_MAP.equals(allocated.getPriority())) {
          continue;
        }
        String host = allocated.getNodeId().getHost();
        String rack = RackResolver.resolve(host).getNetworkLocation();
        assignToRackLocalMap(it, allocated, rack);
      }
      
      it = allocatedContainers.iterator();
      while (it.hasNext() && maps.size() > 0 && canAssignMaps()) {
        Container allocated = it.next();
        if (!PRIORITY_MAP.equals(allocated.getPriority())) {
          continue;
        }
        assignToNoSpecificMap(it, allocated);
      }
    }

    private void assignToLocalMap(Iterator<Container> it, Container allocated, String host) {
      LinkedList<TaskAttemptId> list = mapsHostMapping.get(host);
      while (list != null && !list.isEmpty()) {
        TaskAttemptId tId = list.removeFirst();
        ContainerRequest assigned = maps.remove(tId);
        if (assigned == null) {
          continue;
        }
        containerAssigned(allocated, assigned);
        it.remove();
        JobCounterUpdateEvent jce = new JobCounterUpdateEvent(assigned.attemptID.getTaskId().getJobId());
        jce.addCounterUpdate(JobCounter.DATA_LOCAL_MAPS, 1);
        eventHandler.handle(jce);
        hostLocalAssigned++;
        if (LOG.isDebugEnabled()) {
          LOG.debug("Assigned based on host match " + host);
        }
        break;
      }
    }
    
    private void assignToRackLocalMap(Iterator<Container> it, Container allocated, String rack) {
      LinkedList<TaskAttemptId> list = mapsRackMapping.get(rack);
      while (list != null && !list.isEmpty()) {
        TaskAttemptId tId = list.removeFirst();
        ContainerRequest assigned = maps.remove(tId);
        if (assigned == null) {
          continue;
        }
        containerAssigned(allocated, assigned);
        it.remove();
        JobCounterUpdateEvent jce = new JobCounterUpdateEvent(assigned.attemptID.getTaskId().getJobId());
        jce.addCounterUpdate(JobCounter.RACK_LOCAL_MAPS, 1);
        eventHandler.handle(jce);
        rackLocalAssigned++;
        if (LOG.isDebugEnabled()) {
          LOG.debug("Assigned based on rack match " + rack);
        }
        break;
      }
    }
    
    private void assignToNoSpecificMap(Iterator<Container> it, Container allocated) {
      TaskAttemptId tId = maps.keySet().iterator().next();
      ContainerRequest assigned = maps.remove(tId);
      containerAssigned(allocated, assigned);
      it.remove();
      JobCounterUpdateEvent jce = new JobCounterUpdateEvent(assigned.attemptID.getTaskId().getJobId());
      jce.addCounterUpdate(JobCounter.OTHER_LOCAL_MAPS, 1);
      eventHandler.handle(jce);
      if (LOG.isDebugEnabled()) {
        LOG.debug("Assigned based on * match");
      }
    }

    @SuppressWarnings("unchecked")
    private void containerAssigned(Container allocated, ContainerRequest assigned) {
      decContainerReq(assigned);
      eventHandler.handle(new TaskAttemptContainerAssignedEvent(
          assigned.attemptID, allocated, applicationACLs));
      assignedRequests.add(allocated, assigned.attemptID);
      if (LOG.isDebugEnabled()) {
        LOG.info("Assigned container (" + allocated + ") " + "to task " + assigned.attemptID + " on node " + allocated.getNodeId().toString());
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
        return assignToFailedMap(allocated);
      } else if (PRIORITY_REDUCE.equals(priority)) {
        return assignToReduce(allocated);
      }
      return null;
    }
    
    private void releaseUnassignedContainers(List<Container> allocatedContainers) {
      Iterator<Container> it = allocatedContainers.iterator();
      while (it.hasNext()) {
        Container allocated = it.next();
        LOG.info("Releasing unassigned container " + allocated);
        containerNotAssigned(allocated);
      }
    }
  }

  @Private
  @VisibleForTesting
  class AssignedRequests {
    private final Map<ContainerId, TaskAttemptId> containerToAttemptMap = new HashMap<ContainerId, TaskAttemptId>();
    private final LinkedHashMap<TaskAttemptId, Container> maps = new LinkedHashMap<TaskAttemptId, Container>();
    @VisibleForTesting
    final LinkedHashMap<TaskAttemptId, Container> reduces = new LinkedHashMap<TaskAttemptId, Container>();
    @VisibleForTesting
    final Set<TaskAttemptId> preemptionWaitingReduces = new HashSet<TaskAttemptId>();
    
    void add(Container container, TaskAttemptId tId) {
      LOG.info("Assigned container " + container.getId().toString() + " to " + tId);
      containerToAttemptMap.put(container.getId(), tId);
      if (tId.getTaskId().getTaskType() == TaskType.MAP) {
        maps.put(tId, container);
      } else {
        reduces.put(tId, container);
      }
    }

    @SuppressWarnings("unchecked")
    void preemptReduce(int toPreempt) {
      List<TaskAttemptId> reduceList = new ArrayList<TaskAttemptId>(reduces.keySet());
      Collections.sort(reduceList,
          new Comparator<TaskAttemptId>() {
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
      ContainerId containerId = maps.remove(tId);
      if (containerId != null) {
        containerToAttemptMap.remove(containerId);
        return true;
      }
      containerId = reduces.remove(tId);
      if (containerId != null) {
        containerToAttemptMap.remove(containerId);
        preemptionWaitingReduces.remove(tId);
        return true;
      }
      return false;
    }
    
    TaskAttemptId get(ContainerId cId) {
      return containerToAttemptMap.get(cId);
    }

    ContainerId get(TaskAttemptId tId) {
      Container taskContainer = maps.get(tId);
      if (taskContainer != null) {
        return taskContainer.getId();
      }
      taskContainer = reduces.get(tId);
      if (taskContainer != null) {
        return taskContainer.getId();
      }
      return null;
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
      int pendingReducesSize = pendingReduces.size();
      int scheduledMapsSize = scheduledRequests.maps.size();
      int scheduledReducesSize = scheduledRequests.reduces.size();
      int assignedMapsSize = assignedRequests.maps.size();
      int assignedReducesSize = assignedRequests.reduces.size();
      int completedMapsSize = getJob().getCompletedMaps();
      int completedReducesSize = getJob().getCompletedReduces();

      if (numPendingReduces != pendingReducesSize) {
        numPendingReduces = pendingReducesSize;
        changed = true;
      }
      if (numScheduledMaps != scheduledMapsSize) {
        numScheduledMaps = scheduledMapsSize;
        changed = true;
      }
      if (numScheduledReduces != scheduledReducesSize) {
        numScheduledReduces = scheduledReducesSize;
        changed = true;
      }
      if (numAssignedMaps != assignedMapsSize) {
        numAssignedMaps = assignedMapsSize;
        changed = true;
      }
      if (numAssignedReduces != assignedReducesSize) {
        numAssignedReduces = assignedReducesSize;
        changed = true;
      }
      if (numCompletedMaps != completedMapsSize) {
        numCompletedMaps = completedMapsSize;
        changed = true;
      }
      if (numCompletedReduces != completedReducesSize) {
        numCompletedReduces = completedReducesSize;
        changed = true;
      }
      if (numContainersAllocated != containersAllocated) {
        numContainersAllocated = containersAllocated;
        changed = true;
      }
      if (numContainersReleased != containersReleased) {
        numContainersReleased = containersReleased;
        changed = true;
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