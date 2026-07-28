public class RMContainerAllocator extends RMContainerRequestor implements ContainerAllocator {

  // ...

  @Override
  protected synchronized void heartbeat() throws Exception {
    scheduleStats.updateAndLogIfChanged("Before Scheduling: ");
    List<Container> allocatedContainers = getResources();
    if (allocatedContainers != null && allocatedContainers.size() > 0) {
      scheduledRequests.assign(allocatedContainers);
    }

    if (shouldRecalculateReduceSchedule()) {
      preemptReducesIfNeeded();
      scheduleReduces();
      recalculateReduceSchedule = false;
    }

    scheduleStats.updateAndLogIfChanged("After Scheduling: ");
  }

  private boolean shouldRecalculateReduceSchedule() {
    int completedMaps = getJob().getCompletedMaps();
    int completedTasks = completedMaps + getJob().getCompletedReduces();
    return (lastCompletedTasks != completedTasks) || (scheduledRequests.maps.size() > 0);
  }

  @Override
  protected synchronized void handleEvent(ContainerAllocatorEvent event) {
    if (event.getType() == ContainerAllocator.EventType.CONTAINER_REQ) {
      handleContainerRequestEvent(event);
    } else if (event.getType() == ContainerAllocator.EventType.CONTAINER_DEALLOCATE) {
      handleContainerDeallocateEvent(event);
    } else if (event.getType() == ContainerAllocator.EventType.CONTAINER_FAILED) {
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
      eventHandler.handle(new JobHistoryEvent(jobId, new NormalizedResourceEvent(org.apache.hadoop.mapreduce.TaskType.MAP, mapResourceRequest.getMemory())));
      LOG.info("mapResourceRequest:" + mapResourceRequest);
      if (mapResourceRequest.getMemory() > supportedMaxContainerCapability.getMemory() || mapResourceRequest.getVirtualCores() > supportedMaxContainerCapability.getVirtualCores()) {
        String diagMsg = "MAP capability required is more than the supported max container capability in the cluster. Killing the Job. mapResourceRequest: " + mapResourceRequest + " maxContainerCapability:" + supportedMaxContainerCapability;
        LOG.info(diagMsg);
        eventHandler.handle(new JobDiagnosticsUpdateEvent(jobId, diagMsg));
        eventHandler.handle(new JobEvent(jobId, JobEventType.JOB_KILL));
      }
    }
    reqEvent.getCapability().setMemory(mapResourceRequest.getMemory());
    reqEvent.getCapability().setVirtualCores(mapResourceRequest.getVirtualCores());
    scheduledRequests.addMap(reqEvent);
  }

  private void handleReduceRequest(ContainerRequestEvent reqEvent, Resource supportedMaxContainerCapability, JobId jobId) {
    if (reduceResourceRequest.equals(Resources.none())) {
      reduceResourceRequest = reqEvent.getCapability();
      eventHandler.handle(new JobHistoryEvent(jobId, new NormalizedResourceEvent(org.apache.hadoop.mapreduce.TaskType.REDUCE, reduceResourceRequest.getMemory())));
      LOG.info("reduceResourceRequest:" + reduceResourceRequest);
      if (reduceResourceRequest.getMemory() > supportedMaxContainerCapability.getMemory() || reduceResourceRequest.getVirtualCores() > supportedMaxContainerCapability.getVirtualCores()) {
        String diagMsg = "REDUCE capability required is more than the supported max container capability in the cluster. Killing the Job. reduceResourceRequest: " + reduceResourceRequest + " maxContainerCapability:" + supportedMaxContainerCapability;
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
      LOG.error("Could not deallocate container for task attemptId " + aId);
    }
  }

  private void handleContainerFailedEvent(ContainerAllocatorEvent event) {
    ContainerFailedEvent fEv = (ContainerFailedEvent) event;
    String host = getHost(fEv.getContMgrAddress());
    containerFailedOnHost(host);
  }

  private void scheduleReduces() {
    int totalMaps = getJob().getTotalMaps();
    int completedMaps = getJob().getCompletedMaps();
    int scheduledMaps = scheduledRequests.maps.size();
    int scheduledReduces = scheduledRequests.reduces.size();
    int assignedMaps = assignedRequests.maps.size();
    int assignedReduces = assignedRequests.reduces.size();
    Resource mapResourceReqt = mapResourceRequest;
    Resource reduceResourceReqt = reduceResourceRequest;
    int numPendingReduces = pendingReduces.size();
    float maxReduceRampupLimit = this.maxReduceRampupLimit;
    float reduceSlowStart = this.reduceSlowStart;

    if (numPendingReduces == 0) {
      return;
    }

    Resource headRoom = getAvailableResources();
    if (headRoom == null) {
      headRoom = Resources.none();
    }

    LOG.info("Recalculating schedule, headroom=" + headRoom);

    if (!getIsReduceStarted()) {
      int completedMapsForReduceSlowstart = (int) Math.ceil(reduceSlowStart * totalMaps);
      if (completedMaps < completedMapsForReduceSlowstart) {
        LOG.info("Reduce slow start threshold not met. completedMapsForReduceSlowstart " + completedMapsForReduceSlowstart);
        return;
      } else {
        LOG.info("Reduce slow start threshold reached. Scheduling reduces.");
        setIsReduceStarted(true);
      }
    }

    if (scheduledMaps == 0 && numPendingReduces > 0) {
      LOG.info("All maps assigned. Ramping up all remaining reduces:" + numPendingReduces);
      scheduleAllReduces();
      return;
    }

    float completedMapPercent = 0f;
    if (totalMaps != 0) {
      completedMapPercent = (float) completedMaps / totalMaps;
    } else {
      completedMapPercent = 1;
    }

    Resource netScheduledMapResource = Resources.multiply(mapResourceReqt, (scheduledMaps + assignedMaps));
    Resource netScheduledReduceResource = Resources.multiply(reduceResourceReqt, (scheduledReduces + assignedReduces));

    Resource finalMapResourceLimit;
    Resource finalReduceResourceLimit;

    Resource totalResourceLimit = getResourceLimit();
    Resource idealReduceResourceLimit = Resources.multiply(totalResourceLimit, Math.min(completedMapPercent, maxReduceRampupLimit));
    Resource ideaMapResourceLimit = Resources.subtract(totalResourceLimit, idealReduceResourceLimit);

    if (ResourceCalculatorUtils.computeAvailableContainers(ideaMapResourceLimit, mapResourceReqt, getSchedulerResourceTypes()) >= (scheduledMaps + assignedMaps)) {
      Resource unusedMapResourceLimit = Resources.subtract(ideaMapResourceLimit, netScheduledMapResource);
      finalReduceResourceLimit = Resources.add(idealReduceResourceLimit, unusedMapResourceLimit);
      finalMapResourceLimit = Resources.subtract(totalResourceLimit, finalReduceResourceLimit);
    } else {
      finalMapResourceLimit = ideaMapResourceLimit;
      finalReduceResourceLimit = idealReduceResourceLimit;
    }

    LOG.info("completedMapPercent " + completedMapPercent + " totalResourceLimit:" + totalResourceLimit + " finalMapResourceLimit:" + finalMapResourceLimit + " finalReduceResourceLimit:" + finalReduceResourceLimit + " netScheduledMapResource:" + netScheduledMapResource + " netScheduledReduceResource:" + netScheduledReduceResource);

    int rampUp = ResourceCalculatorUtils.computeAvailableContainers(Resources.subtract(finalReduceResourceLimit, netScheduledReduceResource), reduceResourceReqt, getSchedulerResourceTypes());

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

  // ...
}