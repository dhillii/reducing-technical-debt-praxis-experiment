// ...

public class CapacityScheduler extends
    AbstractYarnScheduler<FiCaSchedulerApp, FiCaSchedulerNode> implements
    PreemptableResourceScheduler, CapacitySchedulerContext, Configurable {

  // ...

  private synchronized void addApplication(ApplicationId applicationId,
      String queueName, String user, boolean isAppRecovering) {
    ApplicationAdditionStrategy strategy = getApplicationAdditionStrategy(queueName, user);
    strategy.addApplication(applicationId, queueName, user, isAppRecovering);
  }

  private ApplicationAdditionStrategy getApplicationAdditionStrategy(String queueName, String user) {
    if (mappings != null && mappings.size() > 0) {
      try {
        String mappedQueue = getMappedQueue(user);
        if (mappedQueue != null) {
          // We have a mapping, should we use it?
          if (queueName.equals(YarnConfiguration.DEFAULT_QUEUE_NAME)
              || overrideWithQueueMappings) {
            LOG.info("Application " + applicationId + " user " + user
                + " mapping [" + queueName + "] to [" + mappedQueue
                + "] override " + overrideWithQueueMappings);
            queueName = mappedQueue;
            RMApp rmApp = rmContext.getRMApps().get(applicationId);
            rmApp.setQueue(queueName);
          }
        }
      } catch (IOException ioex) {
        String message = "Failed to submit application " + applicationId +
            " submitted by user " + user + " reason: " + ioex.getMessage();
        this.rmContext.getDispatcher().getEventHandler()
            .handle(new RMAppRejectedEvent(applicationId, message));
        return new RejectedApplicationAdditionStrategy();
      }
    }

    // sanity checks.
    CSQueue queue = getQueue(queueName);
    if (queue == null) {
      //During a restart, this indicates a queue was removed, which is
      //not presently supported
      if (isAppRecovering) {
        String queueErrorMsg = "Queue named " + queueName
           + " missing during application recovery."
           + " Queue removal during recovery is not presently supported by the"
           + " capacity scheduler, please restart with all queues configured"
           + " which were present before shutdown/restart.";
        LOG.fatal(queueErrorMsg);
        throw new QueueNotFoundException(queueErrorMsg);
      }
      String message = "Application " + applicationId + 
      " submitted by user " + user + " to unknown queue: " + queueName;
      this.rmContext.getDispatcher().getEventHandler()
          .handle(new RMAppRejectedEvent(applicationId, message));
      return new RejectedApplicationAdditionStrategy();
    }
    if (!(queue instanceof LeafQueue)) {
      String message = "Application " + applicationId + 
          " submitted by user " + user + " to non-leaf queue: " + queueName;
      this.rmContext.getDispatcher().getEventHandler()
          .handle(new RMAppRejectedEvent(applicationId, message));
      return new RejectedApplicationAdditionStrategy();
    }
    // Submit to the queue
    try {
      queue.submitApplication(applicationId, user, queueName);
    } catch (AccessControlException ace) {
      // Ignore the exception for recovered app as the app was previously accepted
      if (!isAppRecovering) {
        LOG.info("Failed to submit application " + applicationId + " to queue "
            + queueName + " from user " + user, ace);
        this.rmContext.getDispatcher().getEventHandler()
            .handle(new RMAppRejectedEvent(applicationId, ace.toString()));
        return new RejectedApplicationAdditionStrategy();
      }
    }
    // update the metrics
    queue.getMetrics().submitApp(user);
    SchedulerApplication<FiCaSchedulerApp> application =
        new SchedulerApplication<FiCaSchedulerApp>(queue, user);
    applications.put(applicationId, application);
    LOG.info("Accepted application " + applicationId + " from user: " + user
        + ", in queue: " + queueName);
    if (isAppRecovering) {
      if (LOG.isDebugEnabled()) {
        LOG.debug(applicationId + " is recovering. Skip notifying APP_ACCEPTED");
      }
    } else {
      rmContext.getDispatcher().getEventHandler()
        .handle(new RMAppEvent(applicationId, RMAppEventType.APP_ACCEPTED));
    }
    return new SuccessfulApplicationAdditionStrategy();
  }

  private interface ApplicationAdditionStrategy {
    void addApplication(ApplicationId applicationId, String queueName, String user, boolean isAppRecovering);
  }

  private class RejectedApplicationAdditionStrategy implements ApplicationAdditionStrategy {
    @Override
    public void addApplication(ApplicationId applicationId, String queueName, String user, boolean isAppRecovering) {
      // Do nothing, application was rejected
    }
  }

  private class SuccessfulApplicationAdditionStrategy implements ApplicationAdditionStrategy {
    @Override
    public void addApplication(ApplicationId applicationId, String queueName, String user, boolean isAppRecovering) {
      // Application was successfully added
    }
  }

  // ...

  private synchronized void handle(SchedulerEvent event) {
    SchedulerEventHandler handler = getSchedulerEventHandler(event.getType());
    handler.handle(event);
  }

  private SchedulerEventHandler getSchedulerEventHandler(SchedulerEventType eventType) {
    switch (eventType) {
      case NODE_ADDED:
        return new NodeAddedHandler();
      case NODE_REMOVED:
        return new NodeRemovedHandler();
      case NODE_RESOURCE_UPDATE:
        return new NodeResourceUpdateHandler();
      case NODE_LABELS_UPDATE:
        return new NodeLabelsUpdateHandler();
      case NODE_UPDATE:
        return new NodeUpdateHandler();
      case APP_ADDED:
        return new AppAddedHandler();
      case APP_REMOVED:
        return new AppRemovedHandler();
      case APP_ATTEMPT_ADDED:
        return new AppAttemptAddedHandler();
      case APP_ATTEMPT_REMOVED:
        return new AppAttemptRemovedHandler();
      case CONTAINER_EXPIRED:
        return new ContainerExpiredHandler();
      default:
        LOG.error("Invalid eventtype " + eventType + ". Ignoring!");
        return new IgnoredEventHandler();
    }
  }

  private interface SchedulerEventHandler {
    void handle(SchedulerEvent event);
  }

  private class NodeAddedHandler implements SchedulerEventHandler {
    @Override
    public void handle(SchedulerEvent event) {
      NodeAddedSchedulerEvent nodeAddedEvent = (NodeAddedSchedulerEvent) event;
      addNode(nodeAddedEvent.getAddedRMNode());
      recoverContainersOnNode(nodeAddedEvent.getContainerReports(),
        nodeAddedEvent.getAddedRMNode());
    }
  }

  private class NodeRemovedHandler implements SchedulerEventHandler {
    @Override
    public void handle(SchedulerEvent event) {
      NodeRemovedSchedulerEvent nodeRemovedEvent = (NodeRemovedSchedulerEvent) event;
      removeNode(nodeRemovedEvent.getRemovedRMNode());
    }
  }

  private class NodeResourceUpdateHandler implements SchedulerEventHandler {
    @Override
    public void handle(SchedulerEvent event) {
      NodeResourceUpdateSchedulerEvent nodeResourceUpdatedEvent = 
          (NodeResourceUpdateSchedulerEvent) event;
      updateNodeAndQueueResource(nodeResourceUpdatedEvent.getRMNode(),
        nodeResourceUpdatedEvent.getResourceOption());
    }
  }

  private class NodeLabelsUpdateHandler implements SchedulerEventHandler {
    @Override
    public void handle(SchedulerEvent event) {
      NodeLabelsUpdateSchedulerEvent labelUpdateEvent =
          (NodeLabelsUpdateSchedulerEvent) event;
      
      for (Entry<NodeId, Set<String>> entry : labelUpdateEvent
          .getUpdatedNodeToLabels().entrySet()) {
        NodeId id = entry.getKey();
        Set<String> labels = entry.getValue();
        updateLabelsOnNode(id, labels);
      }
    }
  }

  private class NodeUpdateHandler implements SchedulerEventHandler {
    @Override
    public void handle(SchedulerEvent event) {
      NodeUpdateSchedulerEvent nodeUpdatedEvent = (NodeUpdateSchedulerEvent) event;
      RMNode node = nodeUpdatedEvent.getRMNode();
      nodeUpdate(node);
      if (!scheduleAsynchronously) {
        allocateContainersToNode(getNode(node.getNodeID()));
      }
    }
  }

  private class AppAddedHandler implements SchedulerEventHandler {
    @Override
    public void handle(SchedulerEvent event) {
      AppAddedSchedulerEvent appAddedEvent = (AppAddedSchedulerEvent) event;
      String queueName =
          resolveReservationQueueName(appAddedEvent.getQueue(),
              appAddedEvent.getApplicationId(),
              appAddedEvent.getReservationID());
      if (queueName != null) {
        addApplication(appAddedEvent.getApplicationId(),
            queueName,
            appAddedEvent.getUser(),
            appAddedEvent.getIsAppRecovering());
      }
    }
  }

  private class AppRemovedHandler implements SchedulerEventHandler {
    @Override
    public void handle(SchedulerEvent event) {
      AppRemovedSchedulerEvent appRemovedEvent = (AppRemovedSchedulerEvent) event;
      doneApplication(appRemovedEvent.getApplicationID(),
        appRemovedEvent.getFinalState());
    }
  }

  private class AppAttemptAddedHandler implements SchedulerEventHandler {
    @Override
    public void handle(SchedulerEvent event) {
      AppAttemptAddedSchedulerEvent appAttemptAddedEvent =
          (AppAttemptAddedSchedulerEvent) event;
      addApplicationAttempt(appAttemptAddedEvent.getApplicationAttemptId(),
        appAttemptAddedEvent.getTransferStateFromPreviousAttempt(),
        appAttemptAddedEvent.getIsAttemptRecovering());
    }
  }

  private class AppAttemptRemovedHandler implements SchedulerEventHandler {
    @Override
    public void handle(SchedulerEvent event) {
      AppAttemptRemovedSchedulerEvent appAttemptRemovedEvent =
          (AppAttemptRemovedSchedulerEvent) event;
      doneApplicationAttempt(appAttemptRemovedEvent.getApplicationAttemptID(),
        appAttemptRemovedEvent.getFinalAttemptState(),
        appAttemptRemovedEvent.getKeepContainersAcrossAppAttempts());
    }
  }

  private class ContainerExpiredHandler implements SchedulerEventHandler {
    @Override
    public void handle(SchedulerEvent event) {
      ContainerExpiredSchedulerEvent containerExpiredEvent = 
          (ContainerExpiredSchedulerEvent) event;
      ContainerId containerId = containerExpiredEvent.getContainerId();
      completedContainer(getRMContainer(containerId), 
          SchedulerUtils.createAbnormalContainerStatus(
              containerId, 
              SchedulerUtils.EXPIRED_CONTAINER), 
          RMContainerEventType.EXPIRE);
    }
  }

  private class IgnoredEventHandler implements SchedulerEventHandler {
    @Override
    public void handle(SchedulerEvent event) {
      // Do nothing, event is ignored
    }
  }

  // ...
}