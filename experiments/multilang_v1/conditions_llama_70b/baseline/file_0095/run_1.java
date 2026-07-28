public class FairScheduler extends AbstractYarnScheduler<FSAppAttempt, FSSchedulerNode> {
    // ...

    private synchronized void update() {
        updateStarvationStats();
        FSQueue rootQueue = queueMgr.getRootQueue();
        rootQueue.updateDemand();
        rootQueue.setFairShare(clusterResource);
        rootQueue.recomputeShares();
        updateRootQueueMetrics();
    }

    private void updateStarvationStats() {
        lastPreemptionUpdateTime = clock.getTime();
        for (FSLeafQueue sched : queueMgr.getLeafQueues()) {
            sched.updateStarvationStats();
        }
    }

    // ...

    protected synchronized void preemptTasksIfNecessary() {
        if (!shouldAttemptPreemption()) {
            return;
        }

        long curTime = getClock().getTime();
        if (curTime - lastPreemptCheckTime < preemptionInterval) {
            return;
        }
        lastPreemptCheckTime = curTime;

        Resource resToPreempt = Resources.clone(Resources.none());
        for (FSLeafQueue sched : queueMgr.getLeafQueues()) {
            Resources.addTo(resToPreempt, resToPreempt(sched, curTime));
        }
        if (Resources.greaterThan(RESOURCE_CALCULATOR, clusterResource, resToPreempt, Resources.none())) {
            preemptResources(resToPreempt);
        }
    }

    // ...

    private void preemptResources(Resource toPreempt) {
        long start = getClock().getTime();
        if (Resources.equals(toPreempt, Resources.none())) {
            return;
        }

        // ...
    }

    // ...

    private Resource resToPreempt(FSLeafQueue sched, long curTime) {
        long minShareTimeout = sched.getMinSharePreemptionTimeout();
        long fairShareTimeout = sched.getFairSharePreemptionTimeout();
        Resource resDueToMinShare = Resources.none();
        Resource resDueToFairShare = Resources.none();
        if (curTime - sched.getLastTimeAtMinShare() > minShareTimeout) {
            Resource target = Resources.min(RESOURCE_CALCULATOR, clusterResource, sched.getMinShare(), sched.getDemand());
            resDueToMinShare = Resources.max(RESOURCE_CALCULATOR, clusterResource, Resources.none(), Resources.subtract(target, sched.getResourceUsage()));
        }
        if (curTime - sched.getLastTimeAtFairShareThreshold() > fairShareTimeout) {
            Resource target = Resources.min(RESOURCE_CALCULATOR, clusterResource, sched.getFairShare(), sched.getDemand());
            resDueToFairShare = Resources.max(RESOURCE_CALCULATOR, clusterResource, Resources.none(), Resources.subtract(target, sched.getResourceUsage()));
        }
        Resource resToPreempt = Resources.max(RESOURCE_CALCULATOR, clusterResource, resDueToMinShare, resDueToFairShare);
        if (Resources.greaterThan(RESOURCE_CALCULATOR, clusterResource, resToPreempt, Resources.none())) {
            String message = "Should preempt " + resToPreempt + " res for queue " + sched.getName() + ": resDueToMinShare = " + resDueToMinShare + ", resDueToFairShare = " + resDueToFairShare;
            LOG.info(message);
        }
        return resToPreempt;
    }

    // ...
}

class PreemptionManager {
    private FairScheduler fairScheduler;

    public PreemptionManager(FairScheduler fairScheduler) {
        this.fairScheduler = fairScheduler;
    }

    public void preemptTasksIfNecessary() {
        fairScheduler.preemptTasksIfNecessary();
    }

    public void preemptResources(Resource toPreempt) {
        fairScheduler.preemptResources(toPreempt);
    }

    public Resource resToPreempt(FSLeafQueue sched, long curTime) {
        return fairScheduler.resToPreempt(sched, curTime);
    }
}

class UpdateManager {
    private FairScheduler fairScheduler;

    public UpdateManager(FairScheduler fairScheduler) {
        this.fairScheduler = fairScheduler;
    }

    public void update() {
        fairScheduler.update();
    }

    public void updateStarvationStats() {
        fairScheduler.updateStarvationStats();
    }
}