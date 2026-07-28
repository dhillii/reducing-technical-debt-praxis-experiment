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
            ReduceScheduler reduceScheduler = new ReduceScheduler(this);
            reduceScheduler.scheduleReduces();
            recalculateReduceSchedule = false;
        }

        scheduleStats.updateAndLogIfChanged("After Scheduling: ");
    }

    // ...

    private class ReduceScheduler {
        private final RMContainerAllocator allocator;

        public ReduceScheduler(RMContainerAllocator allocator) {
            this.allocator = allocator;
        }

        public void scheduleReduces() {
            int totalMaps = getJob().getTotalMaps();
            int completedMaps = getJob().getCompletedMaps();
            int scheduledMaps = scheduledRequests.maps.size();
            int scheduledReduces = scheduledRequests.reduces.size();
            int assignedMaps = assignedRequests.maps.size();
            int assignedReduces = assignedRequests.reduces.size();
            Resource mapResourceReqt = allocator.mapResourceRequest;
            Resource reduceResourceReqt = allocator.reduceResourceRequest;
            int numPendingReduces = pendingReduces.size();
            float maxReduceRampupLimit = allocator.maxReduceRampupLimit;
            float reduceSlowStart = allocator.reduceSlowStart;

            if (numPendingReduces == 0) {
                return;
            }

            Resource headRoom = getAvailableResources();
            if (headRoom == null) {
                headRoom = Resources.none();
            }

            LOG.info("Recalculating schedule, headroom=" + headRoom);

            if (!allocator.getIsReduceStarted()) {
                int completedMapsForReduceSlowstart = (int) Math.ceil(reduceSlowStart * totalMaps);
                if (completedMaps < completedMapsForReduceSlowstart) {
                    LOG.info("Reduce slow start threshold not met. completedMapsForReduceSlowstart " + completedMapsForReduceSlowstart);
                    return;
                } else {
                    LOG.info("Reduce slow start threshold reached. Scheduling reduces.");
                    allocator.setIsReduceStarted(true);
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
    }
}