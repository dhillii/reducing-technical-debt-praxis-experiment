public class JobHistoryEventHandler extends AbstractService implements EventHandler<JobHistoryEvent> {

    // Existing code...

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
        return EnumSet.of(EventType.JOB_FINISHED, EventType.JOB_FAILED, EventType.JOB_KILLED).contains(historyEvent.getEventType());
    }

    @Private
    public void handleEvent(JobHistoryEvent event) {
        synchronized (lock) {
            handleEventInternal(event);
        }
    }

    private void handleEventInternal(JobHistoryEvent event) {
        if (event.getHistoryEvent().getEventType() == EventType.AM_STARTED) {
            try {
                AMStartedEvent amStartedEvent = (AMStartedEvent) event.getHistoryEvent();
                setupEventWriter(event.getJobID(), amStartedEvent);
            } catch (IOException ioe) {
                LOG.error("Error JobHistoryEventHandler in handleEvent: " + event, ioe);
                throw new YarnRuntimeException(ioe);
            }
        }

        MetaInfo mi = fileMap.get(event.getJobID());
        try {
            HistoryEvent historyEvent = event.getHistoryEvent();
            if (!(historyEvent instanceof NormalizedResourceEvent)) {
                mi.writeEvent(historyEvent);
            }
            processEventForJobSummary(event.getHistoryEvent(), mi.getJobSummary(), event.getJobID());
            if (timelineClient != null) {
                processEventForTimelineServer(historyEvent, event.getJobID(), event.getTimestamp());
            }
            if (LOG.isDebugEnabled()) {
                LOG.debug("In HistoryEventHandler " + event.getHistoryEvent().getEventType());
            }
        } catch (IOException e) {
            LOG.error("Error writing History Event: " + event.getHistoryEvent(), e);
            throw new YarnRuntimeException(e);
        }

        handleEventTypeSpecificLogic(event);
    }

    private void handleEventTypeSpecificLogic(JobHistoryEvent event) {
        switch (event.getHistoryEvent().getEventType()) {
            case JOB_SUBMITTED:
                JobSubmittedEvent jobSubmittedEvent = (JobSubmittedEvent) event.getHistoryEvent();
                mi.getJobIndexInfo().setSubmitTime(jobSubmittedEvent.getSubmitTime());
                mi.getJobIndexInfo().setQueueName(jobSubmittedEvent.getJobQueueName());
                break;
            case JOB_INITED:
                JobInitedEvent jie = (JobInitedEvent) event.getHistoryEvent();
                mi.getJobIndexInfo().setJobStartTime(jie.getLaunchTime());
                break;
            case JOB_QUEUE_CHANGED:
                JobQueueChangeEvent jQueueEvent = (JobQueueChangeEvent) event.getHistoryEvent();
                mi.getJobIndexInfo().setQueueName(jQueueEvent.getJobQueueName());
                break;
            case JOB_FINISHED:
                try {
                    JobFinishedEvent jFinishedEvent = (JobFinishedEvent) event.getHistoryEvent();
                    mi.getJobIndexInfo().setFinishTime(jFinishedEvent.getFinishTime());
                    mi.getJobIndexInfo().setNumMaps(jFinishedEvent.getFinishedMaps());
                    mi.getJobIndexInfo().setNumReduces(jFinishedEvent.getFinishedReduces());
                    mi.getJobIndexInfo().setJobStatus(JobState.SUCCEEDED.toString());
                    closeEventWriter(event.getJobID());
                    processDoneFiles(event.getJobID());
                } catch (IOException e) {
                    throw new YarnRuntimeException(e);
                }
                break;
            case JOB_ERROR:
                try {
                    JobUnsuccessfulCompletionEvent jucEvent = (JobUnsuccessfulCompletionEvent) event.getHistoryEvent();
                    mi.getJobIndexInfo().setFinishTime(jucEvent.getFinishTime());
                    mi.getJobIndexInfo().setNumMaps(jucEvent.getFinishedMaps());
                    mi.getJobIndexInfo().setNumReduces(jucEvent.getFinishedReduces());
                    mi.getJobIndexInfo().setJobStatus(jucEvent.getStatus());
                    closeEventWriter(event.getJobID());
                    if (context.isLastAMRetry()) {
                        processDoneFiles(event.getJobID());
                    }
                } catch (IOException e) {
                    throw new YarnRuntimeException(e);
                }
                break;
            case JOB_FAILED:
            case JOB_KILLED:
                try {
                    JobUnsuccessfulCompletionEvent jucEvent = (JobUnsuccessfulCompletionEvent) event.getHistoryEvent();
                    mi.getJobIndexInfo().setFinishTime(jucEvent.getFinishTime());
                    mi.getJobIndexInfo().setNumMaps(jucEvent.getFinishedMaps());
                    mi.getJobIndexInfo().setNumReduces(jucEvent.getFinishedReduces());
                    mi.getJobIndexInfo().setJobStatus(jucEvent.getStatus());
                    closeEventWriter(event.getJobID());
                    processDoneFiles(event.getJobID());
                } catch (IOException e) {
                    throw new YarnRuntimeException(e);
                }
                break;
            default:
                break;
        }
    }

    // Existing code...
}