public class RMContainerAllocator extends RMContainerRequestor implements ContainerAllocator {

    // ...

    @Override
    protected synchronized void heartbeat() throws Exception {
        scheduleStats.updateAndLogIfChanged("Before Scheduling: ");
        List<Container> allocatedContainers = getResources();
        if (allocatedContainers != null && allocatedContainers.size() > 0) {
            scheduledRequests.assign(allocatedContainers);
        }

        int completedMaps = getJob().getCompletedMaps();
        int completedTasks = completedMaps + getJob().getCompletedReduces();
        if ((lastCompletedTasks != completedTasks) || (scheduledRequests.maps.size() > 0)) {
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

    // ...

    private void preemptReducesIfNeeded() {
        if (reduceResourceRequest.equals(Resources.none())) {
            return; // no reduces
        }
        // check if reduces have taken over the whole cluster and there are unassigned maps
        if (scheduledRequests.maps.size() > 0) {
            Resource resourceLimit = getResourceLimit();
            Resource availableResourceForMap = Resources.subtract(
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
                LOG.info("Ramping down all scheduled reduces:" + scheduledRequests.reduces.size());
                for (ContainerRequest req : scheduledRequests.reduces.values()) {
                    pendingReduces.add(req);
                }
                scheduledRequests.reduces.clear();

                // do further checking to find the number of map requests that were
                // hanging around for a while
                int hangingMapRequests = getNumOfHangingRequests(scheduledRequests.maps);
                if (hangingMapRequests > 0) {
                    // preempt for making space for at least one map
                    int preemptionReduceNumForOneMap = ResourceCalculatorUtils.divideAndCeilContainers(mapResourceRequest,
                            reduceResourceRequest, getSchedulerResourceTypes());
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
            }
        }
    }

    // ...

    private int getNumOfHangingRequests(Map<TaskAttemptId, ContainerRequest> requestMap) {
        if (allocationDelayThresholdMs <= 0)
            return requestMap.size();
        int hangingRequests = 0;
        long currTime = clock.getTime();
        for (ContainerRequest request : requestMap.values()) {
            long delay = currTime - request.requestTimeMs;
            if (delay > allocationDelayThresholdMs)
                hangingRequests++;
        }
        return hangingRequests;
    }

    // ...

    private void scheduleReduces(
            int totalMaps, int completedMaps,
            int scheduledMaps, int scheduledReduces,
            int assignedMaps, int assignedReduces,
            Resource mapResourceReqt, Resource reduceResourceReqt,
            int numPendingReduces,
            float maxReduceRampupLimit, float reduceSlowStart) {
        // ...

        // Extracted into separate methods for better readability
        Resource headRoom = getAvailableResources();
        if (headRoom == null) {
            headRoom = Resources.none();
        }

        LOG.info("Recalculating schedule, headroom=" + headRoom);

        // Check for slow start
        if (!getIsReduceStarted()) {
            int completedMapsForReduceSlowstart = (int) Math.ceil(reduceSlowStart * totalMaps);
            if (completedMaps < completedMapsForReduceSlowstart) {
                LOG.info("Reduce slow start threshold not met. " +
                        "completedMapsForReduceSlowstart " + completedMapsForReduceSlowstart);
                return;
            } else {
                LOG.info("Reduce slow start threshold reached. Scheduling reduces.");
                setIsReduceStarted(true);
            }
        }

        // If all maps are assigned, then ramp up all reduces irrespective of the headroom
        if (scheduledMaps == 0 && numPendingReduces > 0) {
            LOG.info("All maps assigned. " +
                    "Ramping up all remaining reduces:" + numPendingReduces);
            scheduleAllReduces();
            return;
        }

        // Calculate the number of reduces to ramp up
        float completedMapPercent = 0f;
        if (totalMaps != 0) {
            completedMapPercent = (float) completedMaps / totalMaps;
        } else {
            completedMapPercent = 1;
        }

        Resource netScheduledMapResource = Resources.multiply(mapResourceReqt, (scheduledMaps + assignedMaps));
        Resource netScheduledReduceResource = Resources.multiply(reduceResourceReqt,
                (scheduledReduces + assignedReduces));

        Resource finalMapResourceLimit;
        Resource finalReduceResourceLimit;

        // Ramp up the reduces based on completed map percentage
        Resource totalResourceLimit = getResourceLimit();

        Resource idealReduceResourceLimit = Resources.multiply(totalResourceLimit,
                Math.min(completedMapPercent, maxReduceRampupLimit));
        Resource ideaMapResourceLimit = Resources.subtract(totalResourceLimit, idealReduceResourceLimit);

        // Check if there aren't enough maps scheduled, give the free map capacity to reduce
        if (ResourceCalculatorUtils.computeAvailableContainers(ideaMapResourceLimit,
                mapResourceReqt, getSchedulerResourceTypes()) >= (scheduledMaps + assignedMaps)) {
            Resource unusedMapResourceLimit = Resources.subtract(ideaMapResourceLimit, netScheduledMapResource);
            finalReduceResourceLimit = Resources.add(idealReduceResourceLimit, unusedMapResourceLimit);
            finalMapResourceLimit = Resources.subtract(totalResourceLimit, finalReduceResourceLimit);
        } else {
            finalMapResourceLimit = ideaMapResourceLimit;
            finalReduceResourceLimit = idealReduceResourceLimit;
        }

        LOG.info("completedMapPercent " + completedMapPercent +
                " totalResourceLimit:" + totalResourceLimit +
                " finalMapResourceLimit:" + finalMapResourceLimit +
                " finalReduceResourceLimit:" + finalReduceResourceLimit +
                " netScheduledMapResource:" + netScheduledMapResource +
                " netScheduledReduceResource:" + netScheduledReduceResource);

        int rampUp = ResourceCalculatorUtils.computeAvailableContainers(Resources.subtract(
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

    // ...

    private void scheduleAllReduces() {
        for (ContainerRequest req : pendingReduces) {
            scheduledRequests.addReduce(req);
        }
        pendingReduces.clear();
    }

    private void rampUpReduces(int rampUp) {
        for (int i = 0; i < rampUp; i++) {
            ContainerRequest request = pendingReduces.removeFirst();
            scheduledRequests.addReduce(request);
        }
    }

    private void rampDownReduces(int rampDown) {
        for (int i = 0; i < rampDown; i++) {
            ContainerRequest request = scheduledRequests.removeReduce();
            pendingReduces.add(request);
        }
    }

    // ...
}