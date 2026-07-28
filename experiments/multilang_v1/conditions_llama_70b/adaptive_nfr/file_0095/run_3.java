// ...

public synchronized void handle(SchedulerEvent event) {
  SchedulerEventHandler handler = getEventHandler(event.getType());
  handler.handle(event);
}

private SchedulerEventHandler getEventHandler(SchedulerEventType type) {
  return eventHandlers.get(type);
}

private enum SchedulerEventType {
  NODE_ADDED,
  NODE_REMOVED,
  NODE_UPDATE,
  APP_ADDED,
  APP_REMOVED,
  NODE_RESOURCE_UPDATE,
  APP_ATTEMPT_ADDED,
  APP_ATTEMPT_REMOVED,
  CONTAINER_EXPIRED
}

private interface SchedulerEventHandler {
  void handle(SchedulerEvent event);
}

private class NodeAddedHandler implements SchedulerEventHandler {
  @Override
  public void handle(SchedulerEvent event) {
    NodeAddedSchedulerEvent nodeAddedEvent = (NodeAddedSchedulerEvent) event;
    addNode(nodeAddedEvent.getAddedRMNode());
    recoverContainersOnNode(nodeAddedEvent.getContainerReports(), nodeAddedEvent.getAddedRMNode());
  }
}

private class NodeRemovedHandler implements SchedulerEventHandler {
  @Override
  public void handle(SchedulerEvent event) {
    NodeRemovedSchedulerEvent nodeRemovedEvent = (NodeRemovedSchedulerEvent) event;
    removeNode(nodeRemovedEvent.getRemovedRMNode());
  }
}

private class NodeUpdateHandler implements SchedulerEventHandler {
  @Override
  public void handle(SchedulerEvent event) {
    NodeUpdateSchedulerEvent nodeUpdatedEvent = (NodeUpdateSchedulerEvent) event;
    nodeUpdate(nodeUpdatedEvent.getRMNode());
  }
}

private class AppAddedHandler implements SchedulerEventHandler {
  @Override
  public void handle(SchedulerEvent event) {
    AppAddedSchedulerEvent appAddedEvent = (AppAddedSchedulerEvent) event;
    String queueName = resolveReservationQueueName(appAddedEvent.getQueue(), appAddedEvent.getApplicationId(), appAddedEvent.getReservationID());
    if (queueName != null) {
      addApplication(appAddedEvent.getApplicationId(), queueName, appAddedEvent.getUser(), appAddedEvent.getIsAppRecovering());
    }
  }
}

private class AppRemovedHandler implements SchedulerEventHandler {
  @Override
  public void handle(SchedulerEvent event) {
    AppRemovedSchedulerEvent appRemovedEvent = (AppRemovedSchedulerEvent) event;
    removeApplication(appRemovedEvent.getApplicationID(), appRemovedEvent.getFinalState());
  }
}

private class NodeResourceUpdateHandler implements SchedulerEventHandler {
  @Override
  public void handle(SchedulerEvent event) {
    NodeResourceUpdateSchedulerEvent nodeResourceUpdatedEvent = (NodeResourceUpdateSchedulerEvent) event;
    updateNodeResource(nodeResourceUpdatedEvent.getRMNode(), nodeResourceUpdatedEvent.getResourceOption());
  }
}

private class AppAttemptAddedHandler implements SchedulerEventHandler {
  @Override
  public void handle(SchedulerEvent event) {
    AppAttemptAddedSchedulerEvent appAttemptAddedEvent = (AppAttemptAddedSchedulerEvent) event;
    addApplicationAttempt(appAttemptAddedEvent.getApplicationAttemptId(), appAttemptAddedEvent.getTransferStateFromPreviousAttempt(), appAttemptAddedEvent.getIsAttemptRecovering());
  }
}

private class AppAttemptRemovedHandler implements SchedulerEventHandler {
  @Override
  public void handle(SchedulerEvent event) {
    AppAttemptRemovedSchedulerEvent appAttemptRemovedEvent = (AppAttemptRemovedSchedulerEvent) event;
    removeApplicationAttempt(appAttemptRemovedEvent.getApplicationAttemptID(), appAttemptRemovedEvent.getFinalAttemptState(), appAttemptRemovedEvent.getKeepContainersAcrossAppAttempts());
  }
}

private class ContainerExpiredHandler implements SchedulerEventHandler {
  @Override
  public void handle(SchedulerEvent event) {
    ContainerExpiredSchedulerEvent containerExpiredEvent = (ContainerExpiredSchedulerEvent) event;
    ContainerId containerId = containerExpiredEvent.getContainerId();
    completedContainer(getRMContainer(containerId), SchedulerUtils.createAbnormalContainerStatus(containerId, SchedulerUtils.EXPIRED_CONTAINER), RMContainerEventType.EXPIRE);
  }
}

private Map<SchedulerEventType, SchedulerEventHandler> eventHandlers = new HashMap<>();

public FairScheduler() {
  // ...
  eventHandlers.put(SchedulerEventType.NODE_ADDED, new NodeAddedHandler());
  eventHandlers.put(SchedulerEventType.NODE_REMOVED, new NodeRemovedHandler());
  eventHandlers.put(SchedulerEventType.NODE_UPDATE, new NodeUpdateHandler());
  eventHandlers.put(SchedulerEventType.APP_ADDED, new AppAddedHandler());
  eventHandlers.put(SchedulerEventType.APP_REMOVED, new AppRemovedHandler());
  eventHandlers.put(SchedulerEventType.NODE_RESOURCE_UPDATE, new NodeResourceUpdateHandler());
  eventHandlers.put(SchedulerEventType.APP_ATTEMPT_ADDED, new AppAttemptAddedHandler());
  eventHandlers.put(SchedulerEventType.APP_ATTEMPT_REMOVED, new AppAttemptRemovedHandler());
  eventHandlers.put(SchedulerEventType.CONTAINER_EXPIRED, new ContainerExpiredHandler());
}

// ...