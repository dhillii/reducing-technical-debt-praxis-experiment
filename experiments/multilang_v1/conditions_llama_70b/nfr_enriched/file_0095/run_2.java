public class FairScheduler extends AbstractYarnScheduler<FSAppAttempt, FSSchedulerNode> {

    // ...

    /**
     * Recompute the internal variables used by the scheduler - per-job weights,
     * fair shares, deficits, minimum slot allocations, and amount of used and
     * required resources per job.
     */
    protected synchronized void update() {
        updateStarvationStats();
        updateFairShares();
        updateRootQueueMetrics();
    }

    private synchronized void updateStarvationStats() {
        lastPreemptionUpdateTime = clock.getTime();
        for (FSLeafQueue sched : queueMgr.getLeafQueues()) {
            sched.updateStarvationStats();
        }
    }

    private synchronized void updateFairShares() {
        FSQueue rootQueue = queueMgr.getRootQueue();
        rootQueue.updateDemand();
        rootQueue.setFairShare(clusterResource);
        rootQueue.recomputeShares();
    }

    // ...

    /**
     * Check for queues that need tasks preempted, either because they have been
     * below their guaranteed share for minSharePreemptionTimeout or they have
     * been below their fair share threshold for the fairSharePreemptionTimeout. If
     * such queues exist, compute how many tasks of each type need to be preempted
     * and then select the right ones using preemptTasks.
     */
    protected synchronized void preemptTasksIfNecessary() {
        if (!shouldAttemptPreemption()) {
            return;
        }

        long curTime = getClock().getTime();
        if (curTime - lastPreemptCheckTime < preemptionInterval) {
            return;
        }
        lastPreemptCheckTime = curTime;

        Resource resToPreempt = computeResourcesToPreempt();
        if (Resources.greaterThan(RESOURCE_CALCULATOR, clusterResource, resToPreempt, Resources.none())) {
            preemptResources(resToPreempt);
        }
    }

    private Resource computeResourcesToPreempt() {
        Resource resToPreempt = Resources.clone(Resources.none());
        for (FSLeafQueue sched : queueMgr.getLeafQueues()) {
            Resources.addTo(resToPreempt, resToPreempt(sched, getClock().getTime()));
        }
        return resToPreempt;
    }

    // ...

    /**
     * Preempt a quantity of resources. Each round, we start from the root queue,
     * level-by-level, until choosing a candidate application.
     * The policy for prioritizing preemption for each queue depends on its
     * SchedulingPolicy: (1) fairshare/DRF, choose the ChildSchedulable that is
     * most over its fair share; (2) FIFO, choose the childSchedulable that is
     * latest launched.
     * Inside each application, we further prioritize preemption by choosing
     * containers with lowest priority to preempt.
     * We make sure that no queue is placed below its fair share in the process.
     */
    protected void preemptResources(Resource toPreempt) {
        long start = getClock().getTime();
        if (Resources.equals(toPreempt, Resources.none())) {
            return;
        }

        // Scan down the list of containers we've already warned and kill them
        // if we need to.  Remove any containers from the list that we don't need
        // or that are no longer running.
        Iterator<RMContainer> warnedIter = warnedContainers.iterator();
        while (warnedIter.hasNext()) {
            RMContainer container = warnedIter.next();
            if ((container.getState() == RMContainerState.RUNNING ||
                    container.getState() == RMContainerState.ALLOCATED) &&
                    Resources.greaterThan(RESOURCE_CALCULATOR, clusterResource,
                            toPreempt, Resources.none())) {
                warnOrKillContainer(container);
                Resources.subtractFrom(toPreempt, container.getContainer().getResource());
            } else {
                warnedIter.remove();
            }
        }

        try {
            // Reset preemptedResource for each app
            for (FSLeafQueue queue : getQueueManager().getLeafQueues()) {
                queue.resetPreemptedResources();
            }

            while (Resources.greaterThan(RESOURCE_CALCULATOR, clusterResource,
                    toPreempt, Resources.none())) {
                RMContainer container =
                        getQueueManager().getRootQueue().preemptContainer();
                if (container == null) {
                    break;
                } else {
                    warnOrKillContainer(container);
                    warnedContainers.add(container);
                    Resources.subtractFrom(
                            toPreempt, container.getContainer().getResource());
                }
            }
        } finally {
            // Clear preemptedResources for each app
            for (FSLeafQueue queue : getQueueManager().getLeafQueues()) {
                queue.clearPreemptedResources();
            }
        }

        long duration = getClock().getTime() - start;
        fsOpDurations.addPreemptCallDuration(duration);
    }

    // ...

    private synchronized void addApplication(ApplicationId applicationId,
            String queueName, String user, boolean isAppRecovering) {
        // ...
    }

    private synchronized void addApplicationAttempt(
            ApplicationAttemptId applicationAttemptId,
            boolean transferStateFromPreviousAttempt,
            boolean isAttemptRecovering) {
        // ...
    }

    // ...

    private synchronized void removeApplication(ApplicationId applicationId,
            RMAppState finalState) {
        // ...
    }

    private synchronized void removeApplicationAttempt(
            ApplicationAttemptId applicationAttemptId,
            RMAppAttemptState rmAppAttemptFinalState, boolean keepContainers) {
        // ...
    }

    // ...

    private synchronized void nodeUpdate(RMNode nm) {
        // ...
    }

    private synchronized void attemptScheduling(FSSchedulerNode node) {
        // ...
    }

    // ...

    private synchronized String resolveReservationQueueName(String queueName,
            ApplicationId applicationId, ReservationId reservationID) {
        // ...
    }

    // ...

    private synchronized void updateNodeResource(RMNode nm,
            ResourceOption resourceOption) {
        // ...
    }

    // ...
}