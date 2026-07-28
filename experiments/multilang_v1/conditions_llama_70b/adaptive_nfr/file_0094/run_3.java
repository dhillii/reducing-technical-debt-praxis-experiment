public class LeafQueue extends AbstractCSQueue {

    // ...

    private synchronized void activateApplications() {
        // limit of allowed resource usage for application masters
        Resource amLimit = getAMResourceLimit();
        Resource userAMLimit = getUserAMResourceLimit();

        for (Iterator<FiCaSchedulerApp> i = pendingApplications.iterator(); i.hasNext(); ) {
            FiCaSchedulerApp application = i.next();

            // Check am resource limit
            Resource amIfStarted = Resources.add(application.getAMResource(), queueUsage.getAMUsed());

            if (!Resources.lessThanOrEqual(resourceCalculator, lastClusterResource, amIfStarted, amLimit)) {
                if (getNumActiveApplications() < 1) {
                    LOG.warn("maximum-am-resource-percent is insufficient to start a single application in queue, it is likely set too low.");
                } else {
                    LOG.info("not starting application as amIfStarted exceeds amLimit");
                    continue;
                }
            }

            // Check user am resource limit

            User user = getUser(application.getUser());

            Resource userAmIfStarted = Resources.add(application.getAMResource(), user.getConsumedAMResources());

            if (!Resources.lessThanOrEqual(resourceCalculator, lastClusterResource, userAmIfStarted, userAMLimit)) {
                if (getNumActiveApplications() < 1) {
                    LOG.warn("maximum-am-resource-percent is insufficient to start a single application in queue for user, it is likely set too low.");
                } else {
                    LOG.info("not starting application as amIfStarted exceeds userAmLimit");
                    continue;
                }
            }
            user.activateApplication();
            activeApplications.add(application);
            queueUsage.incAMUsed(application.getAMResource());
            user.getResourceUsage().incAMUsed(application.getAMResource());
            i.remove();
            LOG.info("Application " + application.getApplicationId() + " from user: " + application.getUser() + " activated in queue: " + getQueueName());
        }
    }

    // ...

    private synchronized CSAssignment assignContainersOnNode(Resource clusterResource, FiCaSchedulerNode node, FiCaSchedulerApp application, Priority priority, RMContainer reservedContainer, ResourceLimits currentResoureLimits) {
        // Extracted method to improve readability
        return assignContainersBasedOnRequestType(clusterResource, node, application, priority, reservedContainer, currentResoureLimits);
    }

    private CSAssignment assignContainersBasedOnRequestType(Resource clusterResource, FiCaSchedulerNode node, FiCaSchedulerApp application, Priority priority, RMContainer reservedContainer, ResourceLimits currentResoureLimits) {
        Resource assigned = Resources.none();

        NodeType requestType = null;
        MutableObject allocatedContainer = new MutableObject();

        // Data-local
        ResourceRequest nodeLocalResourceRequest = application.getResourceRequest(priority, node.getNodeName());
        if (nodeLocalResourceRequest != null) {
            requestType = NodeType.NODE_LOCAL;
            assigned = assignNodeLocalContainers(clusterResource, nodeLocalResourceRequest, node, application, priority, reservedContainer, allocatedContainer, currentResoureLimits);
            if (Resources.greaterThan(resourceCalculator, clusterResource, assigned, Resources.none())) {
                return new CSAssignment(assigned, NodeType.NODE_LOCAL);
            }
        }

        // Rack-local
        ResourceRequest rackLocalResourceRequest = application.getResourceRequest(priority, node.getRackName());
        if (rackLocalResourceRequest != null) {
            if (!rackLocalResourceRequest.getRelaxLocality()) {
                return SKIP_ASSIGNMENT;
            }

            if (requestType != NodeType.NODE_LOCAL) {
                requestType = NodeType.RACK_LOCAL;
            }

            assigned = assignRackLocalContainers(clusterResource, rackLocalResourceRequest, node, application, priority, reservedContainer, allocatedContainer, currentResoureLimits);
            if (Resources.greaterThan(resourceCalculator, clusterResource, assigned, Resources.none())) {
                return new CSAssignment(assigned, NodeType.RACK_LOCAL);
            }
        }

        // Off-switch
        ResourceRequest offSwitchResourceRequest = application.getResourceRequest(priority, ResourceRequest.ANY);
        if (offSwitchResourceRequest != null) {
            if (!offSwitchResourceRequest.getRelaxLocality()) {
                return SKIP_ASSIGNMENT;
            }
            if (requestType != NodeType.NODE_LOCAL && requestType != NodeType.RACK_LOCAL) {
                requestType = NodeType.OFF_SWITCH;
            }

            assigned = assignOffSwitchContainers(clusterResource, offSwitchResourceRequest, node, application, priority, reservedContainer, allocatedContainer, currentResoureLimits);

            return new CSAssignment(assigned, NodeType.OFF_SWITCH);
        }

        return SKIP_ASSIGNMENT;
    }

    // ...

    private boolean shouldAllocOrReserveNewContainer(FiCaSchedulerApp application, Priority priority, Resource required) {
        // Extracted method to improve readability
        return shouldAllocateOrReserveBasedOnStarvation(application, priority, required);
    }

    private boolean shouldAllocateOrReserveBasedOnStarvation(FiCaSchedulerApp application, Priority priority, Resource required) {
        int requiredContainers = application.getTotalRequiredResources(priority);
        int reservedContainers = application.getNumReservedContainers(priority);
        int starvation = 0;
        if (reservedContainers > 0) {
            float nodeFactor = Resources.ratio(resourceCalculator, required, getMaximumAllocation());

            // Use percentage of node required to bias against large containers...
            // Protect against corner case where you need the whole node with
            // Math.min(nodeFactor, minimumAllocationFactor)
            starvation = (int) ((application.getReReservations(priority) / (float) reservedContainers) * (1.0f - (Math.min(nodeFactor, getMinimumAllocationFactor()))));

            if (LOG.isDebugEnabled()) {
                LOG.debug("needsContainers:" + " app.#re-reserve=" + application.getReReservations(priority) + " reserved=" + reservedContainers + " nodeFactor=" + nodeFactor + " minAllocFactor=" + getMinimumAllocationFactor() + " starvation=" + starvation);
            }
        }
        return (((starvation + requiredContainers) - reservedContainers) > 0);
    }

    // ...
}