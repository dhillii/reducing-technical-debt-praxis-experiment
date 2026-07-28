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
      recalculateReduceSchedule();
    }

    scheduleStats.updateAndLogIfChanged("After Scheduling: ");
  }

  private boolean shouldRecalculateReduceSchedule() {
    int completedMaps = getJob().getCompletedMaps();
    int completedTasks = completedMaps + getJob().getCompletedReduces();
    return lastCompletedTasks != completedTasks || scheduledRequests.maps.size() > 0;
  }

  private void recalculateReduceSchedule() {
    preemptReducesIfNeeded();
    scheduleReduces(
        getJob().getTotalMaps(), getJob().getCompletedMaps(),
        scheduledRequests.maps.size(), scheduledRequests.reduces.size(),
        assignedRequests.maps.size(), assignedRequests.reduces.size(),
        mapResourceRequest, reduceResourceRequest,
        pendingReduces.size(), maxReduceRampupLimit, reduceSlowStart);
  }

  // ...

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

    if (!getIsReduceStarted() && !hasReduceSlowStartThresholdBeenMet(totalMaps, completedMaps, reduceSlowStart)) {
      return;
    }

    setIsReduceStarted(true);

    Resource totalResourceLimit = getResourceLimit();
    Resource idealReduceResourceLimit = calculateIdealReduceResourceLimit(totalResourceLimit, completedMaps, totalMaps, maxReduceRampupLimit);
    Resource finalReduceResourceLimit = calculateFinalReduceResourceLimit(idealReduceResourceLimit, totalResourceLimit, mapResourceReqt, scheduledMaps, assignedMaps);

    int rampUp = calculateRampUp(finalReduceResourceLimit, reduceResourceReqt, scheduledReduces, numPendingReduces);
    if (rampUp > 0) {
      rampUpReduces(rampUp);
    } else if (rampUp < 0) {
      rampDownReduces(-rampUp);
    }
  }

  private boolean hasReduceSlowStartThresholdBeenMet(int totalMaps, int completedMaps, float reduceSlowStart) {
    int completedMapsForReduceSlowstart = (int) Math.ceil(reduceSlowStart * totalMaps);
    return completedMaps >= completedMapsForReduceSlowstart;
  }

  private Resource calculateIdealReduceResourceLimit(Resource totalResourceLimit, int completedMaps, int totalMaps, float maxReduceRampupLimit) {
    float completedMapPercent = (float) completedMaps / totalMaps;
    return Resources.multiply(totalResourceLimit, Math.min(completedMapPercent, maxReduceRampupLimit));
  }

  private Resource calculateFinalReduceResourceLimit(Resource idealReduceResourceLimit, Resource totalResourceLimit, Resource mapResourceReqt, int scheduledMaps, int assignedMaps) {
    Resource netScheduledMapResource = Resources.multiply(mapResourceReqt, scheduledMaps + assignedMaps);
    Resource ideaMapResourceLimit = Resources.subtract(totalResourceLimit, idealReduceResourceLimit);

    if (ResourceCalculatorUtils.computeAvailableContainers(ideaMapResourceLimit, mapResourceReqt, getSchedulerResourceTypes()) >= scheduledMaps + assignedMaps) {
      Resource unusedMapResourceLimit = Resources.subtract(ideaMapResourceLimit, netScheduledMapResource);
      return Resources.add(idealReduceResourceLimit, unusedMapResourceLimit);
    } else {
      return idealReduceResourceLimit;
    }
  }

  private int calculateRampUp(Resource finalReduceResourceLimit, Resource reduceResourceReqt, int scheduledReduces, int numPendingReduces) {
    return Math.min(ResourceCalculatorUtils.computeAvailableContainers(Resources.subtract(finalReduceResourceLimit, Resources.multiply(reduceResourceReqt, scheduledReduces)), reduceResourceReqt, getSchedulerResourceTypes()), numPendingReduces);
  }

  // ...
}