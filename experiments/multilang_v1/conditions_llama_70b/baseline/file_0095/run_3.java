public class FairScheduler extends AbstractYarnScheduler<FSAppAttempt, FSSchedulerNode> {
    // ...

    private synchronized void update() {
        long start = getClock().getTime();
        updateStarvationStats();
        FSQueue rootQueue = queueMgr.getRootQueue();
        rootQueue.updateDemand();
        rootQueue.setFairShare(clusterResource);
        rootQueue.recomputeShares();
        updateRootQueueMetrics();
        long duration = getClock().getTime() - start;
        fsOpDurations.addUpdateCallDuration(duration);
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
                    Resources.greaterThan(RESOURCE_CALCULATOR, clusterResource, toPreempt, Resources.none())) {
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

            while (Resources.greaterThan(RESOURCE_CALCULATOR, clusterResource, toPreempt, Resources.none())) {
                RMContainer container = getQueueManager().getRootQueue().preemptContainer();
                if (container == null) {
                    break;
                } else {
                    warnOrKillContainer(container);
                    warnedContainers.add(container);
                    Resources.subtractFrom(toPreempt, container.getContainer().getResource());
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

    private class UpdateThread extends Thread {
        @Override
        public void run() {
            while (!Thread.currentThread().isInterrupted()) {
                try {
                    Thread.sleep(updateInterval);
                    long start = getClock().getTime();
                    update();
                    preemptTasksIfNecessary();
                    long duration = getClock().getTime() - start;
                    fsOpDurations.addUpdateThreadRunDuration(duration);
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

    private class ContinuousSchedulingThread extends Thread {
        @Override
        public void run() {
            while (!Thread.currentThread().isInterrupted()) {
                try {
                    continuousSchedulingAttempt();
                    Thread.sleep(getContinuousSchedulingSleepMs());
                } catch (InterruptedException e) {
                    LOG.warn("Continuous scheduling thread interrupted. Exiting.", e);
                    return;
                }
            }
        }
    }

    // ...

    private synchronized void addApplication(ApplicationId applicationId, String queueName, String user, boolean isAppRecovering) {
        // ...
    }

    // ...

    private synchronized void addApplicationAttempt(ApplicationAttemptId applicationAttemptId, boolean transferStateFromPreviousAttempt, boolean isAttemptRecovering) {
        // ...
    }

    // ...

    private synchronized void removeApplication(ApplicationId applicationId, RMAppState finalState) {
        // ...
    }

    // ...

    private synchronized void removeApplicationAttempt(ApplicationAttemptId applicationAttemptId, RMAppAttemptState rmAppAttemptFinalState, boolean keepContainers) {
        // ...
    }

    // ...

    private synchronized void nodeUpdate(RMNode nm) {
        // ...
    }

    // ...

    private synchronized void attemptScheduling(FSSchedulerNode node) {
        // ...
    }

    // ...

    private synchronized void updateRootQueueMetrics() {
        // ...
    }

    // ...

    private synchronized String resolveReservationQueueName(String queueName, ApplicationId applicationId, ReservationId reservationID) {
        // ...
    }

    // ...

    private synchronized void recoverContainersOnNode(List<ContainerReport> containerReports, RMNode node) {
        // ...
    }

    // ...

    private synchronized void updateNodeResource(RMNode nm, ResourceOption resourceOption) {
        // ...
    }

    // ...

    private synchronized void setRMContext(RMContext rmContext) {
        // ...
    }

    // ...

    private synchronized void initScheduler(Configuration conf) throws IOException {
        // ...
    }

    // ...

    private synchronized void startSchedulerThreads() {
        // ...
    }

    // ...

    @Override
    public synchronized void serviceInit(Configuration conf) throws Exception {
        // ...
    }

    // ...

    @Override
    public synchronized void serviceStart() throws Exception {
        // ...
    }

    // ...

    @Override
    public synchronized void serviceStop() throws Exception {
        // ...
    }

    // ...

    @Override
    public synchronized void reinitialize(Configuration conf, RMContext rmContext) throws IOException {
        // ...
    }

    // ...

    @Override
    public synchronized QueueInfo getQueueInfo(String queueName, boolean includeChildQueues, boolean recursive) throws IOException {
        // ...
    }

    // ...

    @Override
    public synchronized List<QueueUserACLInfo> getQueueUserAclInfo() {
        // ...
    }

    // ...

    @Override
    public synchronized int getNumClusterNodes() {
        // ...
    }

    // ...

    @Override
    public synchronized boolean checkAccess(UserGroupInformation callerUGI, QueueACL acl, String queueName) {
        // ...
    }

    // ...

    @Override
    public synchronized String moveApplication(ApplicationId appId, String queueName) throws YarnException {
        // ...
    }

    // ...

    private synchronized void verifyMoveDoesNotViolateConstraints(FSAppAttempt app, FSLeafQueue oldQueue, FSLeafQueue targetQueue) throws YarnException {
        // ...
    }

    // ...

    private synchronized void executeMove(SchedulerApplication<FSAppAttempt> app, FSAppAttempt attempt, FSLeafQueue oldQueue, FSLeafQueue newQueue) {
        // ...
    }

    // ...

    @VisibleForTesting
    synchronized FSQueue findLowestCommonAncestorQueue(FSQueue queue1, FSQueue queue2) {
        // ...
    }

    // ...

    @Override
    public synchronized void updateNodeResource(RMNode nm, ResourceOption resourceOption) {
        // ...
    }

    // ...

    @Override
    public synchronized EnumSet<SchedulerResourceTypes> getSchedulingResourceTypes() {
        // ...
    }

    // ...

    @Override
    public synchronized Set<String> getPlanQueues() throws YarnException {
        // ...
    }

    // ...

    @Override
    public synchronized void setEntitlement(String queueName, QueueEntitlement entitlement) throws YarnException {
        // ...
    }

    // ...

    @Override
    public synchronized void removeQueue(String queueName) throws YarnException {
        // ...
    }

    // ...

    private synchronized String handleMoveToPlanQueue(String targetQueueName) {
        // ...
    }
}