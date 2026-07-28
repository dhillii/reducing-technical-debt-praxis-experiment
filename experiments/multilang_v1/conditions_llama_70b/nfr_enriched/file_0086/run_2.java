public class RMContainerAllocator extends RMContainerRequestor implements ContainerAllocator {

  // ... existing code ...

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

  private void preemptReducesIfNeeded() {
    if (reduceResourceRequest.equals(Resources.none())) {
      return; // no reduces
    }
    //check if reduces have taken over the whole cluster and there are 
    //unassigned maps
    if (scheduledRequests.maps.size() > 0) {
      Resource resourceLimit = getResourceLimit();
      Resource availableResourceForMap =
          Resources.subtract(
            resourceLimit,
            Resources.multiply(reduceResourceRequest,
              assignedRequests.reduces.size()
                  - assignedRequests.preemptionWaitingReduces.size()));
      // availableMemForMap must be sufficient to run at least 1 map
      if (ResourceCalculatorUtils.computeAvailableContainers(availableResourceForMap,
        mapResourceRequest, getSchedulerResourceTypes()) <= 0) {
        // to make sure new containers are given to maps and not reduces
        // ramp down all scheduled reduces if any
        // (since reduces are scheduled at higher priority than maps)
        LOG.info("Ramping down all scheduled reduces:"
            + scheduledRequests.reduces.size());
        for (ContainerRequest req : scheduledRequests.reduces.values()) {
          pendingReduces.add(req);
        }
        scheduledRequests.reduces.clear();
 
        //do further checking to find the number of map requests that were
        //hanging around for a while
        int hangingMapRequests = getNumOfHangingRequests(scheduledRequests.maps);
        if (hangingMapRequests > 0) {
          // preempt for making space for at least one map
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
          int toPreempt =
              Math.min(Math.max(preemptionReduceNumForOneMap,
                preemptionReduceNumForPreemptionLimit),
                preemptionReduceNumForAllMaps);

          LOG.info("Going to preempt " + toPreempt
              + " due to lack of space for maps");
          assignedRequests.preemptReduce(toPreempt);
        }
      }
    }
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

  private void scheduleReduces(
      int totalMaps, int completedMaps,
      int scheduledMaps, int scheduledReduces,
      int assignedMaps, int assignedReduces,
      Resource mapResourceReqt, Resource reduceResourceReqt,
      int numPendingReduces,
      float maxReduceRampupLimit, float reduceSlowStart) {
    
    if (numPendingReduces == 0) {
      return;
    }
    
    // get available resources for this job
    Resource headRoom = getAvailableResources();
    if (headRoom == null) {
      headRoom = Resources.none();
    }

    LOG.info("Recalculating schedule, headroom=" + headRoom);
    
    //check for slow start
    if (!getIsReduceStarted()) {//not set yet
      int completedMapsForReduceSlowstart = (int)Math.ceil(reduceSlowStart * 
                      totalMaps);
      if(completedMaps < completedMapsForReduceSlowstart) {
        LOG.info("Reduce slow start threshold not met. " +
              "completedMapsForReduceSlowstart " + 
            completedMapsForReduceSlowstart);
        return;
      } else {
        LOG.info("Reduce slow start threshold reached. Scheduling reduces.");
        setIsReduceStarted(true);
      }
    }
    
    //if all maps are assigned, then ramp up all reduces irrespective of the
    //headroom
    if (scheduledMaps == 0 && numPendingReduces > 0) {
      LOG.info("All maps assigned. " +
          "Ramping up all remaining reduces:" + numPendingReduces);
      scheduleAllReduces();
      return;
    }

    float completedMapPercent = 0f;
    if (totalMaps != 0) {//support for 0 maps
      completedMapPercent = (float)completedMaps/totalMaps;
    } else {
      completedMapPercent = 1;
    }
    
    Resource netScheduledMapResource =
        Resources.multiply(mapResourceReqt, (scheduledMaps + assignedMaps));

    Resource netScheduledReduceResource =
        Resources.multiply(reduceResourceReqt,
          (scheduledReduces + assignedReduces));

    Resource finalMapResourceLimit;
    Resource finalReduceResourceLimit;

    // ramp up the reduces based on completed map percentage
    Resource totalResourceLimit = getResourceLimit();

    Resource idealReduceResourceLimit =
        Resources.multiply(totalResourceLimit,
          Math.min(completedMapPercent, maxReduceRampupLimit));
    Resource ideaMapResourceLimit =
        Resources.subtract(totalResourceLimit, idealReduceResourceLimit);

    // check if there aren't enough maps scheduled, give the free map capacity
    // to reduce.
    // Even when container number equals, there may be unused resources in one
    // dimension
    if (ResourceCalculatorUtils.computeAvailableContainers(ideaMapResourceLimit,
      mapResourceReqt, getSchedulerResourceTypes()) >= (scheduledMaps + assignedMaps)) {
      // enough resource given to maps, given the remaining to reduces
      Resource unusedMapResourceLimit =
          Resources.subtract(ideaMapResourceLimit, netScheduledMapResource);
      finalReduceResourceLimit =
          Resources.add(idealReduceResourceLimit, unusedMapResourceLimit);
      finalMapResourceLimit =
          Resources.subtract(totalResourceLimit, finalReduceResourceLimit);
    } else {
      finalMapResourceLimit = ideaMapResourceLimit;
      finalReduceResourceLimit = idealReduceResourceLimit;
    }

    LOG.info("completedMapPercent " + completedMapPercent
        + " totalResourceLimit:" + totalResourceLimit
        + " finalMapResourceLimit:" + finalMapResourceLimit
        + " finalReduceResourceLimit:" + finalReduceResourceLimit
        + " netScheduledMapResource:" + netScheduledMapResource
        + " netScheduledReduceResource:" + netScheduledReduceResource);

    int rampUp =
        ResourceCalculatorUtils.computeAvailableContainers(Resources.subtract(
                finalReduceResourceLimit, netScheduledReduceResource),
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

  private void scheduleAllReduces() {
    for (ContainerRequest req : pendingReduces) {
      scheduledRequests.addReduce(req);
    }
    pendingReduces.clear();
  }
  
  private void rampUpReduces(int rampUp) {
    //more reduce to be scheduled
    for (int i = 0; i < rampUp; i++) {
      ContainerRequest request = pendingReduces.removeFirst();
      scheduledRequests.addReduce(request);
    }
  }
  
  private void rampDownReduces(int rampDown) {
    //remove from the scheduled and move back to pending
    for (int i = 0; i < rampDown; i++) {
      ContainerRequest request = scheduledRequests.removeReduce();
      pendingReduces.add(request);
    }
  }

  // ... existing code ...

  @SuppressWarnings("unchecked")
  protected synchronized void handleEvent(ContainerAllocatorEvent event) {
    recalculateReduceSchedule = true;
    if (event.getType() == ContainerAllocator.EventType.CONTAINER_REQ) {
      handleContainerRequestEvent(event);
    } else if (
        event.getType() == ContainerAllocator.EventType.CONTAINER_DEALLOCATE) {
      handleContainerDeallocateEvent(event);
    } else if (
        event.getType() == ContainerAllocator.EventType.CONTAINER_FAILED) {
      handleContainerFailedEvent(event);
    }
  }

  private void handleContainerRequestEvent(ContainerAllocatorEvent event) {
    ContainerRequestEvent reqEvent = (ContainerRequestEvent) event;
    JobId jobId = getJob().getID();
    Resource supportedMaxContainerCapability = getMaxContainerCapability();
    if (reqEvent.getAttemptID().getTaskId().getTaskType().equals(TaskType.MAP)) {
      handleMapRequest(reqEvent, supportedMaxContainerCapability, jobId);
    } else {
      handleReduceRequest(reqEvent, supportedMaxContainerCapability, jobId);
    }
  }

  private void handleMapRequest(ContainerRequestEvent reqEvent, Resource supportedMaxContainerCapability, JobId jobId) {
    if (mapResourceRequest.equals(Resources.none())) {
      mapResourceRequest = reqEvent.getCapability();
      eventHandler.handle(new JobHistoryEvent(jobId,
        new NormalizedResourceEvent(
          org.apache.hadoop.mapreduce.TaskType.MAP, mapResourceRequest
            .getMemory())));
      LOG.info("mapResourceRequest:" + mapResourceRequest);
      if (mapResourceRequest.getMemory() > supportedMaxContainerCapability
        .getMemory()
          || mapResourceRequest.getVirtualCores() > supportedMaxContainerCapability
            .getVirtualCores()) {
        String diagMsg =
            "MAP capability required is more than the supported "
                + "max container capability in the cluster. Killing the Job. mapResourceRequest: "
                + mapResourceRequest + " maxContainerCapability:"
                + supportedMaxContainerCapability;
        LOG.info(diagMsg);
        eventHandler.handle(new JobDiagnosticsUpdateEvent(jobId, diagMsg));
        eventHandler.handle(new JobEvent(jobId, JobEventType.JOB_KILL));
      }
    }
    // set the resources
    reqEvent.getCapability().setMemory(mapResourceRequest.getMemory());
    reqEvent.getCapability().setVirtualCores(
      mapResourceRequest.getVirtualCores());
    scheduledRequests.addMap(reqEvent);//maps are immediately scheduled
  }

  private void handleReduceRequest(ContainerRequestEvent reqEvent, Resource supportedMaxContainerCapability, JobId jobId) {
    if (reduceResourceRequest.equals(Resources.none())) {
      reduceResourceRequest = reqEvent.getCapability();
      eventHandler.handle(new JobHistoryEvent(jobId,
        new NormalizedResourceEvent(
          org.apache.hadoop.mapreduce.TaskType.REDUCE,
          reduceResourceRequest.getMemory())));
      LOG.info("reduceResourceRequest:" + reduceResourceRequest);
      if (reduceResourceRequest.getMemory() > supportedMaxContainerCapability
        .getMemory()
          || reduceResourceRequest.getVirtualCores() > supportedMaxContainerCapability
            .getVirtualCores()) {
        String diagMsg =
            "REDUCE capability required is more than the "
                + "supported max container capability in the cluster. Killing the "
                + "Job. reduceResourceRequest: " + reduceResourceRequest
                + " maxContainerCapability:"
                + supportedMaxContainerCapability;
        LOG.info(diagMsg);
        eventHandler.handle(new JobDiagnosticsUpdateEvent(jobId, diagMsg));
        eventHandler.handle(new JobEvent(jobId, JobEventType.JOB_KILL));
      }
    }
    // set the resources
    reqEvent.getCapability().setMemory(reduceResourceRequest.getMemory());
    reqEvent.getCapability().setVirtualCores(
      reduceResourceRequest.getVirtualCores());
    if (reqEvent.getEarlierAttemptFailed()) {
      //add to the front of queue for fail fast
      pendingReduces.addFirst(new ContainerRequest(reqEvent, PRIORITY_REDUCE));
    } else {
      pendingReduces.add(new ContainerRequest(reqEvent, PRIORITY_REDUCE));
      //reduces are added to pending and are slowly ramped up
    }
  }

  private void handleContainerDeallocateEvent(ContainerAllocatorEvent event) {
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
      LOG.error("Could not deallocate container for task attemptId " + 
          aId);
    }
  }

  private void handleContainerFailedEvent(ContainerAllocatorEvent event) {
    ContainerFailedEvent fEv = (ContainerFailedEvent) event;
    String host = getHost(fEv.getContMgrAddress());
    containerFailedOnHost(host);
  }

  // ... existing code ...

  private List<Container> getResources() throws Exception {
    applyConcurrentTaskLimits();

    // will be null the first time
    Resource headRoom =
        getAvailableResources() == null ? Resources.none() :
            Resources.clone(getAvailableResources());
    AllocateResponse response;
    /*
     * If contact with RM is lost, the AM will wait MR_AM_TO_RM_WAIT_INTERVAL_MS
     * milliseconds before aborting. During this interval, AM will still try
     * to contact the RM.
     */
    try {
      response = makeRemoteRequest();
      // Reset retry count if no exception occurred.
      retrystartTime = System.currentTimeMillis();
    } catch (ApplicationAttemptNotFoundException e ) {
      // This can happen if the RM has been restarted. If it is in that state,
      // this application must clean itself up.
      eventHandler.handle(new JobEvent(this.getJob().getID(),
        JobEventType.JOB_AM_REBOOT));
      throw new YarnRuntimeException(
        "Resource Manager doesn't recognize AttemptId: "
            + this.getContext().getApplicationAttemptId(), e);
    } catch (ApplicationMasterNotRegisteredException e) {
      LOG.info("ApplicationMaster is out of sync with ResourceManager,"
          + " hence resync and send outstanding requests.");
      // RM may have restarted, re-register with RM.
      lastResponseID = 0;
      register();
      addOutstandingRequestOnResync();
      return null;
    } catch (Exception e) {
      // This can happen when the connection to the RM has gone down. Keep
      // re-trying until the retryInterval has expired.
      if (System.currentTimeMillis() - retrystartTime >= retryInterval) {
        LOG.error("Could not contact RM after " + retryInterval + " milliseconds.");
        eventHandler.handle(new JobEvent(this.getJob().getID(),
                                         JobEventType.JOB_AM_REBOOT));
        throw new YarnRuntimeException("Could not contact RM after " +
                                retryInterval + " milliseconds.");
      }
      // Throw this up to the caller, which may decide to ignore it and
      // continue to attempt to contact the RM.
      throw e;
    }
    Resource newHeadRoom =
        getAvailableResources() == null ? Resources.none()
            : getAvailableResources();
    List<Container> newContainers = response.getAllocatedContainers();
    // Setting NMTokens
    if (response.getNMTokens() != null) {
      for (NMToken nmToken : response.getNMTokens()) {
        NMTokenCache.setNMToken(nmToken.getNodeId().toString(),
            nmToken.getToken());
      }
    }

    // Setting AMRMToken
    if (response.getAMRMToken() != null) {
      updateAMRMToken(response.getAMRMToken());
    }

    List<ContainerStatus> finishedContainers = response.getCompletedContainersStatuses();
    if (newContainers.size() + finishedContainers.size() > 0
        || !headRoom.equals(newHeadRoom)) {
      //something changed
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

    //Called on each allocation. Will know about newly blacklisted/added hosts.
    computeIgnoreBlacklisting();

    handleUpdatedNodes(response);

    for (ContainerStatus cont : finishedContainers) {
      LOG.info("Received completed container " + cont.getContainerId());
      TaskAttemptId attemptID = assignedRequests.get(cont.getContainerId());
      if (attemptID == null) {
        LOG.error("Container complete event for unknown container id "
            + cont.getContainerId());
      } else {
        pendingRelease.remove(cont.getContainerId());
        assignedRequests.remove(attemptID);
        
        // send the container completed event to Task attempt
        eventHandler.handle(createContainerFinishedEvent(cont, attemptID));
        
        // Send the diagnostics
        String diagnostics = StringInterner.weakIntern(cont.getDiagnostics());
        eventHandler.handle(new TaskAttemptDiagnosticsUpdateEvent(attemptID,
            diagnostics));
      }      
    }
    return newContainers;
  }

  // ... existing code ...

  private void applyConcurrentTaskLimits() {
    int numScheduledMaps = scheduledRequests.maps.size();
    if (maxRunningMaps > 0 && numScheduledMaps > 0) {
      int maxRequestedMaps = Math.max(0,
          maxRunningMaps - assignedRequests.maps.size());
      int numScheduledFailMaps = scheduledRequests.earlierFailedMaps.size();
      int failedMapRequestLimit = Math.min(maxRequestedMaps,
          numScheduledFailMaps);
      int normalMapRequestLimit = Math.min(
          maxRequestedMaps - failedMapRequestLimit,
          numScheduledMaps - numScheduledFailMaps);
      setRequestLimit(PRIORITY_FAST_FAIL_MAP, mapResourceRequest,
          failedMapRequestLimit);
      setRequestLimit(PRIORITY_MAP, mapResourceRequest, normalMapRequestLimit);
    }

    int numScheduledReduces = scheduledRequests.reduces.size();
    if (maxRunningReduces > 0 && numScheduledReduces > 0) {
      int maxRequestedReduces = Math.max(0,
          maxRunningReduces - assignedRequests.reduces.size());
      int reduceRequestLimit = Math.min(maxRequestedReduces,
          numScheduledReduces);
      setRequestLimit(PRIORITY_REDUCE, reduceResourceRequest,
          reduceRequestLimit);
    }
  }

  // ... existing code ...

  private class ScheduledRequests {
    // ... existing code ...

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
        
        // check if allocated container meets memory requirements 
        // and whether we have any scheduled tasks that need 
        // a container to be assigned
        boolean isAssignable = true;
        Priority priority = allocated.getPriority();
        Resource allocatedResource = allocated.getResource();
        if (PRIORITY_FAST_FAIL_MAP.equals(priority) 
            || PRIORITY_MAP.equals(priority)) {
          if (ResourceCalculatorUtils.computeAvailableContainers(allocatedResource,
              mapResourceRequest, getSchedulerResourceTypes()) <= 0
              || maps.isEmpty()) {
            LOG.info("Cannot assign container " + allocated 
                + " for a map as either "
                + " container memory less than required " + mapResourceRequest
                + " or no pending map tasks - maps.isEmpty=" 
                + maps.isEmpty()); 
            isAssignable = false; 
          }
        } 
        else if (PRIORITY_REDUCE.equals(priority)) {
          if (ResourceCalculatorUtils.computeAvailableContainers(allocatedResource,
              reduceResourceRequest, getSchedulerResourceTypes()) <= 0
              || reduces.isEmpty()) {
            LOG.info("Cannot assign container " + allocated 
                + " for a reduce as either "
                + " container memory less than required " + reduceResourceRequest
                + " or no pending reduce tasks - reduces.isEmpty=" 
                + reduces.isEmpty()); 
            isAssignable = false;
          }
        } else {
          LOG.warn("Container allocated at unwanted priority: " + priority + 
              ". Returning to RM...");
          isAssignable = false;
        }
        
        if(!isAssignable) {
          // release container if we could not assign it 
          containerNotAssigned(allocated);
          it.remove();
          continue;
        }
        
        // do not assign if allocated container is on a  
        // blacklisted host
        String allocatedHost = allocated.getNodeId().getHost();
        if (isNodeBlacklisted(allocatedHost)) {
          // we need to request for a new container 
          // and release the current one
          LOG.info("Got allocated container on a blacklisted "
              + " host "+allocatedHost
              +". Releasing container " + allocated);

          // find the request matching this allocated container 
          // and replace it with a new one 
          ContainerRequest toBeReplacedReq = 
              getContainerReqToReplace(allocated);
          if (toBeReplacedReq != null) {
            LOG.info("Placing a new container request for task attempt " 
                + toBeReplacedReq.attemptID);
            ContainerRequest newReq = 
                getFilteredContainerRequest(toBeReplacedReq);
            decContainerReq(toBeReplacedReq);
            if (toBeReplacedReq.attemptID.getTaskId().getTaskType() ==
                TaskType.MAP) {
              maps.put(newReq.attemptID, newReq);
            }
            else {
              reduces.put(newReq.attemptID, newReq);
            }
            addContainerReq(newReq);
          }
          else {
            LOG.info("Could not map allocated container to a valid request."
                + " Releasing allocated container " + allocated);
          }
          
          // release container if we could not assign it 
          containerNotAssigned(allocated);
          it.remove();
          continue;
        }
      }

      assignContainers(allocatedContainers);
       
      // release container if we could not assign it 
      it = allocatedContainers.iterator();
      while (it.hasNext()) {
        Container allocated = it.next();
        LOG.info("Releasing unassigned container " + allocated);
        containerNotAssigned(allocated);
      }
    }
    
    // ... existing code ...

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
    
    // ... existing code ...

    private void assignMapsWithLocality(List<Container> allocatedContainers) {
      // try to assign to all nodes first to match node local
      Iterator<Container> it = allocatedContainers.iterator();
      while(it.hasNext() && maps.size() > 0 && canAssignMaps()){
        Container allocated = it.next();        
        Priority priority = allocated.getPriority();
        assert PRIORITY_MAP.equals(priority);
        // "if (maps.containsKey(tId))" below should be almost always true.
        // hence this while loop would almost always have O(1) complexity
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
            JobCounterUpdateEvent jce =
              new JobCounterUpdateEvent(assigned.attemptID.getTaskId().getJobId());
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
      
      // try to match all rack local
      it = allocatedContainers.iterator();
      while(it.hasNext() && maps.size() > 0 && canAssignMaps()){
        Container allocated = it.next();
        Priority priority = allocated.getPriority();
        assert PRIORITY_MAP.equals(priority);
        // "if (maps.containsKey(tId))" below should be almost always true.
        // hence this while loop would almost always have O(1) complexity
        String host = allocated.getNodeId().getHost();
        String rack = RackResolver.resolve(host).getNetworkLocation();
        LinkedList<TaskAttemptId> list = mapsRackMapping.get(rack);
        while (list != null && list.size() > 0) {
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
            if (LOG.isDebugEnabled()) {
              LOG.debug("Assigned based on rack match " + rack);
            }
            break;
          }
        }
      }
      
      // assign remaining
      it = allocatedContainers.iterator();
      while(it.hasNext() && maps.size() > 0 && canAssignMaps()){
        Container allocated = it.next();
        Priority priority = allocated.getPriority();
        assert PRIORITY_MAP.equals(priority);
        TaskAttemptId tId = maps.keySet().iterator().next();
        ContainerRequest assigned = maps.remove(tId);
        containerAssigned(allocated, assigned);
        it.remove();
        JobCounterUpdateEvent jce =
          new JobCounterUpdateEvent(assigned.attemptID.getTaskId().getJobId());
        jce.addCounterUpdate(JobCounter.OTHER_LOCAL_MAPS, 1);
        eventHandler.handle(jce);
        if (LOG.isDebugEnabled()) {
          LOG.debug("Assigned based on * match");
        }
      }
    }
  }

  // ... existing code ...

  private class AssignedRequests {
    // ... existing code ...

    void preemptReduce(int toPreempt) {
      List<TaskAttemptId> reduceList = new ArrayList<TaskAttemptId>
        (reduces.keySet());
      //sort reduces on progress
      Collections.sort(reduceList,
          new Comparator<TaskAttemptId>() {
        @Override
        public int compare(TaskAttemptId o1, TaskAttemptId o2) {
          return Float.compare(
              getJob().getTask(o1.getTaskId()).getAttempt(o1).getProgress(),
              getJob().getTask(o2.getTaskId()).getAttempt(o2).getProgress());
        }
      });
      
      for (int i = 0; i < toPreempt && reduceList.size() > 0; i++) {
        TaskAttemptId id = reduceList.remove(0);//remove the one on top
        LOG.info("Preempting " + id);
        preemptionWaitingReduces.add(id);
        eventHandler.handle(new TaskAttemptKillEvent(id, RAMPDOWN_DIAGNOSTIC));
      }
    }
    
    // ... existing code ...
  }

  // ... existing code ...
}