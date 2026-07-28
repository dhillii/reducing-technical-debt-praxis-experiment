public class FairScheduler extends AbstractYarnScheduler<FSAppAttempt, FSSchedulerNode> {
    // ...

    private void updateStarvationStats() {
        lastPreemptionUpdateTime = clock.getTime();
        for (FSLeafQueue sched : queueMgr.getLeafQueues()) {
            sched.updateStarvationStats();
        }
    }

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

    protected void preemptResources(Resource toPreempt) {
        // ...
    }

    // ...

    private class PreemptionManager {
        private FairScheduler scheduler;

        public PreemptionManager(FairScheduler scheduler) {
            this.scheduler = scheduler;
        }

        public void updateStarvationStats() {
            scheduler.lastPreemptionUpdateTime = scheduler.clock.getTime();
            for (FSLeafQueue sched : scheduler.queueMgr.getLeafQueues()) {
                sched.updateStarvationStats();
            }
        }

        public void preemptTasksIfNecessary() {
            if (!scheduler.shouldAttemptPreemption()) {
                return;
            }

            long curTime = scheduler.getClock().getTime();
            if (curTime - scheduler.lastPreemptCheckTime < scheduler.preemptionInterval) {
                return;
            }
            scheduler.lastPreemptCheckTime = curTime;

            Resource resToPreempt = Resources.clone(Resources.none());
            for (FSLeafQueue sched : scheduler.queueMgr.getLeafQueues()) {
                Resources.addTo(resToPreempt, scheduler.resToPreempt(sched, curTime));
            }
            if (Resources.greaterThan(RESOURCE_CALCULATOR, scheduler.clusterResource, resToPreempt, Resources.none())) {
                scheduler.preemptResources(resToPreempt);
            }
        }
    }

    private class UpdateThread extends Thread {
        @Override
        public void run() {
            while (!Thread.currentThread().isInterrupted()) {
                try {
                    Thread.sleep(scheduler.updateInterval);
                    long start = scheduler.getClock().getTime();
                    scheduler.update();
                    PreemptionManager preemptionManager = new PreemptionManager(scheduler);
                    preemptionManager.preemptTasksIfNecessary();
                    long duration = scheduler.getClock().getTime() - start;
                    scheduler.fsOpDurations.addUpdateThreadRunDuration(duration);
                } catch (InterruptedException ie) {
                    LOG.warn("Update thread interrupted. Exiting.");
                    return;
                } catch (Exception e) {
                    LOG.error("Exception in fair scheduler UpdateThread", e);
                }
            }
        }
    }

    // ...
}