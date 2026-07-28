public class JobHistoryEventHandler extends AbstractService implements EventHandler<JobHistoryEvent> {

  // ...

  @Override
  public void handle(JobHistoryEvent event) {
    try {
      if (isJobCompletionEvent(event.getHistoryEvent())) {
        maxUnflushedCompletionEvents = maxUnflushedCompletionEvents * postJobCompletionMultiplier;
      }

      eventQueue.put(event);
    } catch (InterruptedException e) {
      throw new YarnRuntimeException(e);
    }
  }

  private boolean isJobCompletionEvent(HistoryEvent historyEvent) {
    return JobCompletionEventType.isJobCompletionEvent(historyEvent.getEventType());
  }

  // ...

  @Private
  public void handleEvent(JobHistoryEvent event) {
    synchronized (lock) {
      EventType eventType = event.getHistoryEvent().getEventType();
      EventProcessor eventProcessor = EventProcessorFactory.getEventProcessor(eventType);
      eventProcessor.processEvent(event, this);
    }
  }

  // ...

  private interface EventProcessor {
    void processEvent(JobHistoryEvent event, JobHistoryEventHandler handler);
  }

  private static class EventProcessorFactory {
    private static final Map<EventType, EventProcessor> eventProcessors = new HashMap<>();

    static {
      eventProcessors.put(EventType.AM_STARTED, new AMStartedEventProcessor());
      eventProcessors.put(EventType.JOB_SUBMITTED, new JobSubmittedEventProcessor());
      eventProcessors.put(EventType.JOB_INITED, new JobInitedEventProcessor());
      eventProcessors.put(EventType.JOB_FINISHED, new JobFinishedEventProcessor());
      eventProcessors.put(EventType.JOB_FAILED, new JobFailedEventProcessor());
      eventProcessors.put(EventType.JOB_KILLED, new JobKilledEventProcessor());
      // ...
    }

    public static EventProcessor getEventProcessor(EventType eventType) {
      return eventProcessors.get(eventType);
    }
  }

  private static abstract class AbstractEventProcessor implements EventProcessor {
    @Override
    public void processEvent(JobHistoryEvent event, JobHistoryEventHandler handler) {
      MetaInfo mi = handler.fileMap.get(event.getJobID());
      try {
        HistoryEvent historyEvent = event.getHistoryEvent();
        if (!(historyEvent instanceof NormalizedResourceEvent)) {
          mi.writeEvent(historyEvent);
        }
        handler.processEventForJobSummary(event.getHistoryEvent(), mi.getJobSummary(), event.getJobID());
        if (handler.timelineClient != null) {
          handler.processEventForTimelineServer(historyEvent, event.getJobID(), event.getTimestamp());
        }
      } catch (IOException e) {
        LOG.error("Error writing History Event: " + event.getHistoryEvent(), e);
        throw new YarnRuntimeException(e);
      }
    }
  }

  private static class AMStartedEventProcessor extends AbstractEventProcessor {
    @Override
    public void processEvent(JobHistoryEvent event, JobHistoryEventHandler handler) {
      super.processEvent(event, handler);
      try {
        AMStartedEvent amStartedEvent = (AMStartedEvent) event.getHistoryEvent();
        handler.setupEventWriter(event.getJobID(), amStartedEvent);
      } catch (IOException ioe) {
        LOG.error("Error JobHistoryEventHandler in handleEvent: " + event, ioe);
        throw new YarnRuntimeException(ioe);
      }
    }
  }

  private static class JobSubmittedEventProcessor extends AbstractEventProcessor {
    @Override
    public void processEvent(JobHistoryEvent event, JobHistoryEventHandler handler) {
      super.processEvent(event, handler);
      JobSubmittedEvent jobSubmittedEvent = (JobSubmittedEvent) event.getHistoryEvent();
      MetaInfo mi = handler.fileMap.get(event.getJobID());
      mi.getJobIndexInfo().setSubmitTime(jobSubmittedEvent.getSubmitTime());
      mi.getJobIndexInfo().setQueueName(jobSubmittedEvent.getJobQueueName());
    }
  }

  private static class JobInitedEventProcessor extends AbstractEventProcessor {
    @Override
    public void processEvent(JobHistoryEvent event, JobHistoryEventHandler handler) {
      super.processEvent(event, handler);
      JobInitedEvent jobInitedEvent = (JobInitedEvent) event.getHistoryEvent();
      MetaInfo mi = handler.fileMap.get(event.getJobID());
      mi.getJobIndexInfo().setJobStartTime(jobInitedEvent.getLaunchTime());
    }
  }

  private static class JobFinishedEventProcessor extends AbstractEventProcessor {
    @Override
    public void processEvent(JobHistoryEvent event, JobHistoryEventHandler handler) {
      super.processEvent(event, handler);
      try {
        JobFinishedEvent jobFinishedEvent = (JobFinishedEvent) event.getHistoryEvent();
        MetaInfo mi = handler.fileMap.get(event.getJobID());
        mi.getJobIndexInfo().setFinishTime(jobFinishedEvent.getFinishTime());
        mi.getJobIndexInfo().setNumMaps(jobFinishedEvent.getFinishedMaps());
        mi.getJobIndexInfo().setNumReduces(jobFinishedEvent.getFinishedReduces());
        mi.getJobIndexInfo().setJobStatus(JobState.SUCCEEDED.toString());
        handler.closeEventWriter(event.getJobID());
        handler.processDoneFiles(event.getJobID());
      } catch (IOException e) {
        throw new YarnRuntimeException(e);
      }
    }
  }

  private static class JobFailedEventProcessor extends AbstractEventProcessor {
    @Override
    public void processEvent(JobHistoryEvent event, JobHistoryEventHandler handler) {
      super.processEvent(event, handler);
      try {
        JobUnsuccessfulCompletionEvent jobUnsuccessfulCompletionEvent = (JobUnsuccessfulCompletionEvent) event.getHistoryEvent();
        MetaInfo mi = handler.fileMap.get(event.getJobID());
        mi.getJobIndexInfo().setFinishTime(jobUnsuccessfulCompletionEvent.getFinishTime());
        mi.getJobIndexInfo().setNumMaps(jobUnsuccessfulCompletionEvent.getFinishedMaps());
        mi.getJobIndexInfo().setNumReduces(jobUnsuccessfulCompletionEvent.getFinishedReduces());
        mi.getJobIndexInfo().setJobStatus(jobUnsuccessfulCompletionEvent.getStatus());
        handler.closeEventWriter(event.getJobID());
        handler.processDoneFiles(event.getJobID());
      } catch (IOException e) {
        throw new YarnRuntimeException(e);
      }
    }
  }

  private static class JobKilledEventProcessor extends AbstractEventProcessor {
    @Override
    public void processEvent(JobHistoryEvent event, JobHistoryEventHandler handler) {
      super.processEvent(event, handler);
      try {
        JobUnsuccessfulCompletionEvent jobUnsuccessfulCompletionEvent = (JobUnsuccessfulCompletionEvent) event.getHistoryEvent();
        MetaInfo mi = handler.fileMap.get(event.getJobID());
        mi.getJobIndexInfo().setFinishTime(jobUnsuccessfulCompletionEvent.getFinishTime());
        mi.getJobIndexInfo().setNumMaps(jobUnsuccessfulCompletionEvent.getFinishedMaps());
        mi.getJobIndexInfo().setNumReduces(jobUnsuccessfulCompletionEvent.getFinishedReduces());
        mi.getJobIndexInfo().setJobStatus(jobUnsuccessfulCompletionEvent.getStatus());
        handler.closeEventWriter(event.getJobID());
        handler.processDoneFiles(event.getJobID());
      } catch (IOException e) {
        throw new YarnRuntimeException(e);
      }
    }
  }

  // ...

  private interface JobCompletionEventType {
    boolean isJobCompletionEvent(EventType eventType);
  }

  private static class JobCompletionEventTypeImpl implements JobCompletionEventType {
    @Override
    public boolean isJobCompletionEvent(EventType eventType) {
      return EnumSet.of(EventType.JOB_FINISHED, EventType.JOB_FAILED, EventType.JOB_KILLED).contains(eventType);
    }
  }

  private static final JobCompletionEventType JOB_COMPLETION_EVENT_TYPE = new JobCompletionEventTypeImpl();
}