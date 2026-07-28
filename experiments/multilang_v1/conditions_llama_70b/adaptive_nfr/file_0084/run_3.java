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
        return historyEvent.getEventType() == EventType.JOB_FINISHED
                || historyEvent.getEventType() == EventType.JOB_FAILED
                || historyEvent.getEventType() == EventType.JOB_KILLED;
    }

    @Private
    public void handleEvent(JobHistoryEvent event) {
        synchronized (lock) {
            HistoryEvent historyEvent = event.getHistoryEvent();
            MetaInfo mi = fileMap.get(event.getJobID());

            if (historyEvent.getEventType() == EventType.AM_STARTED) {
                try {
                    AMStartedEvent amStartedEvent = (AMStartedEvent) historyEvent;
                    setupEventWriter(event.getJobID(), amStartedEvent);
                } catch (IOException ioe) {
                    LOG.error("Error JobHistoryEventHandler in handleEvent: " + event, ioe);
                    throw new YarnRuntimeException(ioe);
                }
            }

            try {
                if (!(historyEvent instanceof NormalizedResourceEvent)) {
                    mi.writeEvent(historyEvent);
                }
                processEventForJobSummary(historyEvent, mi.getJobSummary(), event.getJobID());
                if (timelineClient != null) {
                    processEventForTimelineServer(historyEvent, event.getJobID(), event.getTimestamp());
                }
            } catch (IOException e) {
                LOG.error("Error writing History Event: " + historyEvent, e);
                throw new YarnRuntimeException(e);
            }

            processEventType(historyEvent, mi, event.getJobID());
        }
    }

    private void processEventType(HistoryEvent historyEvent, MetaInfo mi, JobId jobId) {
        switch (historyEvent.getEventType()) {
            case JOB_SUBMITTED:
                JobSubmittedEvent jobSubmittedEvent = (JobSubmittedEvent) historyEvent;
                mi.getJobIndexInfo().setSubmitTime(jobSubmittedEvent.getSubmitTime());
                mi.getJobIndexInfo().setQueueName(jobSubmittedEvent.getJobQueueName());
                break;
            case JOB_INITED:
                JobInitedEvent jobInitedEvent = (JobInitedEvent) historyEvent;
                mi.getJobIndexInfo().setJobStartTime(jobInitedEvent.getLaunchTime());
                break;
            case JOB_QUEUE_CHANGED:
                JobQueueChangeEvent jobQueueChangeEvent = (JobQueueChangeEvent) historyEvent;
                mi.getJobIndexInfo().setQueueName(jobQueueChangeEvent.getJobQueueName());
                break;
            case JOB_FINISHED:
                JobFinishedEvent jobFinishedEvent = (JobFinishedEvent) historyEvent;
                mi.getJobIndexInfo().setFinishTime(jobFinishedEvent.getFinishTime());
                mi.getJobIndexInfo().setNumMaps(jobFinishedEvent.getFinishedMaps());
                mi.getJobIndexInfo().setNumReduces(jobFinishedEvent.getFinishedReduces());
                mi.getJobIndexInfo().setJobStatus(JobState.SUCCEEDED.toString());
                closeEventWriter(jobId);
                processDoneFiles(jobId);
                break;
            case JOB_ERROR:
                JobUnsuccessfulCompletionEvent jobUnsuccessfulCompletionEvent = (JobUnsuccessfulCompletionEvent) historyEvent;
                mi.getJobIndexInfo().setFinishTime(jobUnsuccessfulCompletionEvent.getFinishTime());
                mi.getJobIndexInfo().setNumMaps(jobUnsuccessfulCompletionEvent.getFinishedMaps());
                mi.getJobIndexInfo().setNumReduces(jobUnsuccessfulCompletionEvent.getFinishedReduces());
                mi.getJobIndexInfo().setJobStatus(jobUnsuccessfulCompletionEvent.getStatus());
                closeEventWriter(jobId);
                if (context.isLastAMRetry()) {
                    processDoneFiles(jobId);
                }
                break;
            case JOB_FAILED:
            case JOB_KILLED:
                JobUnsuccessfulCompletionEvent jobUnsuccessfulCompletionEvent2 = (JobUnsuccessfulCompletionEvent) historyEvent;
                mi.getJobIndexInfo().setFinishTime(jobUnsuccessfulCompletionEvent2.getFinishTime());
                mi.getJobIndexInfo().setNumMaps(jobUnsuccessfulCompletionEvent2.getFinishedMaps());
                mi.getJobIndexInfo().setNumReduces(jobUnsuccessfulCompletionEvent2.getFinishedReduces());
                mi.getJobIndexInfo().setJobStatus(jobUnsuccessfulCompletionEvent2.getStatus());
                closeEventWriter(jobId);
                processDoneFiles(jobId);
                break;
            default:
                break;
        }
    }

    public void processEventForJobSummary(HistoryEvent event, JobSummary summary, JobId jobId) {
        switch (event.getEventType()) {
            case JOB_SUBMITTED:
                JobSubmittedEvent jobSubmittedEvent = (JobSubmittedEvent) event;
                summary.setUser(jobSubmittedEvent.getUserName());
                summary.setQueue(jobSubmittedEvent.getJobQueueName());
                summary.setJobSubmitTime(jobSubmittedEvent.getSubmitTime());
                summary.setJobName(jobSubmittedEvent.getJobName());
                break;
            case NORMALIZED_RESOURCE:
                NormalizedResourceEvent normalizedResourceEvent = (NormalizedResourceEvent) event;
                if (normalizedResourceEvent.getTaskType() == TaskType.MAP) {
                    summary.setResourcesPerMap(normalizedResourceEvent.getMemory());
                } else if (normalizedResourceEvent.getTaskType() == TaskType.REDUCE) {
                    summary.setResourcesPerReduce(normalizedResourceEvent.getMemory());
                }
                break;
            case JOB_INITED:
                JobInitedEvent jobInitedEvent = (JobInitedEvent) event;
                summary.setJobLaunchTime(jobInitedEvent.getLaunchTime());
                break;
            case MAP_ATTEMPT_STARTED:
                TaskAttemptStartedEvent taskAttemptStartedEvent = (TaskAttemptStartedEvent) event;
                if (summary.getFirstMapTaskLaunchTime() == 0) {
                    summary.setFirstMapTaskLaunchTime(taskAttemptStartedEvent.getStartTime());
                }
                break;
            case REDUCE_ATTEMPT_STARTED:
                TaskAttemptStartedEvent taskAttemptStartedEvent2 = (TaskAttemptStartedEvent) event;
                if (summary.getFirstReduceTaskLaunchTime() == 0) {
                    summary.setFirstReduceTaskLaunchTime(taskAttemptStartedEvent2.getStartTime());
                }
                break;
            case JOB_FINISHED:
                JobFinishedEvent jobFinishedEvent = (JobFinishedEvent) event;
                summary.setJobFinishTime(jobFinishedEvent.getFinishTime());
                summary.setNumFinishedMaps(jobFinishedEvent.getFinishedMaps());
                summary.setNumFailedMaps(jobFinishedEvent.getFailedMaps());
                summary.setNumFinishedReduces(jobFinishedEvent.getFinishedReduces());
                summary.setNumFailedReduces(jobFinishedEvent.getFailedReduces());
                if (summary.getJobStatus() == null) {
                    summary.setJobStatus(JobState.SUCCEEDED.toString());
                }
                setSummarySlotSeconds(summary, jobFinishedEvent.getTotalCounters());
                break;
            case JOB_FAILED:
            case JOB_KILLED:
                JobUnsuccessfulCompletionEvent jobUnsuccessfulCompletionEvent = (JobUnsuccessfulCompletionEvent) event;
                summary.setJobStatus(jobUnsuccessfulCompletionEvent.getStatus());
                summary.setNumFinishedMaps(context.getJob(jobId).getTotalMaps());
                summary.setNumFinishedReduces(context.getJob(jobId).getTotalReduces());
                summary.setJobFinishTime(jobUnsuccessfulCompletionEvent.getFinishTime());
                setSummarySlotSeconds(summary, context.getJob(jobId).getAllCounters());
                break;
            default:
                break;
        }
    }

    private void processEventForTimelineServer(HistoryEvent event, JobId jobId, long timestamp) {
        TimelineEvent timelineEvent = new TimelineEvent();
        timelineEvent.setEventType(StringUtils.toUpperCase(event.getEventType().name()));
        timelineEvent.setTimestamp(timestamp);
        TimelineEntity timelineEntity = new TimelineEntity();

        processTimelineEventType(event, timelineEvent, timelineEntity, jobId);
        try {
            timelineClient.putEntities(timelineEntity);
        } catch (IOException ex) {
            LOG.error("Error putting entity " + timelineEntity.getEntityId() + " to TimelineServer", ex);
        } catch (YarnException ex) {
            LOG.error("Error putting entity " + timelineEntity.getEntityId() + " to TimelineServer", ex);
        }
    }

    private void processTimelineEventType(HistoryEvent event, TimelineEvent timelineEvent, TimelineEntity timelineEntity, JobId jobId) {
        switch (event.getEventType()) {
            case JOB_SUBMITTED:
                JobSubmittedEvent jobSubmittedEvent = (JobSubmittedEvent) event;
                timelineEvent.addEventInfo("SUBMIT_TIME", jobSubmittedEvent.getSubmitTime());
                timelineEvent.addEventInfo("QUEUE_NAME", jobSubmittedEvent.getJobQueueName());
                timelineEvent.addEventInfo("JOB_NAME", jobSubmittedEvent.getJobName());
                timelineEvent.addEventInfo("USER_NAME", jobSubmittedEvent.getUserName());
                timelineEvent.addEventInfo("JOB_CONF_PATH", jobSubmittedEvent.getJobConfPath());
                timelineEvent.addEventInfo("ACLS", jobSubmittedEvent.getJobAcls());
                timelineEvent.addEventInfo("JOB_QUEUE_NAME", jobSubmittedEvent.getJobQueueName());
                timelineEvent.addEventInfo("WORKLFOW_ID", jobSubmittedEvent.getWorkflowId());
                timelineEvent.addEventInfo("WORKFLOW_NAME", jobSubmittedEvent.getWorkflowName());
                timelineEvent.addEventInfo("WORKFLOW_NAME_NAME", jobSubmittedEvent.getWorkflowNodeName());
                timelineEvent.addEventInfo("WORKFLOW_ADJACENCIES", jobSubmittedEvent.getWorkflowAdjacencies());
                timelineEvent.addEventInfo("WORKFLOW_TAGS", jobSubmittedEvent.getWorkflowTags());
                timelineEntity.addEvent(timelineEvent);
                timelineEntity.setEntityId(jobId.toString());
                timelineEntity.setEntityType(MAPREDUCE_JOB_ENTITY_TYPE);
                break;
            case JOB_STATUS_CHANGED:
                JobStatusChangedEvent jobStatusChangedEvent = (JobStatusChangedEvent) event;
                timelineEvent.addEventInfo("STATUS", jobStatusChangedEvent.getStatus());
                timelineEntity.addEvent(timelineEvent);
                timelineEntity.setEntityId(jobId.toString());
                timelineEntity.setEntityType(MAPREDUCE_JOB_ENTITY_TYPE);
                break;
            case JOB_INFO_CHANGED:
                JobInfoChangeEvent jobInfoChangeEvent = (JobInfoChangeEvent) event;
                timelineEvent.addEventInfo("SUBMIT_TIME", jobInfoChangeEvent.getSubmitTime());
                timelineEvent.addEventInfo("LAUNCH_TIME", jobInfoChangeEvent.getLaunchTime());
                timelineEntity.addEvent(timelineEvent);
                timelineEntity.setEntityId(jobId.toString());
                timelineEntity.setEntityType(MAPREDUCE_JOB_ENTITY_TYPE);
                break;
            case JOB_INITED:
                JobInitedEvent jobInitedEvent = (JobInitedEvent) event;
                timelineEvent.addEventInfo("START_TIME", jobInitedEvent.getLaunchTime());
                timelineEvent.addEventInfo("STATUS", jobInitedEvent.getStatus());
                timelineEvent.addEventInfo("TOTAL_MAPS", jobInitedEvent.getTotalMaps());
                timelineEvent.addEventInfo("TOTAL_REDUCES", jobInitedEvent.getTotalReduces());
                timelineEvent.addEventInfo("UBERIZED", jobInitedEvent.getUberized());
                timelineEntity.setStartTime(jobInitedEvent.getLaunchTime());
                timelineEntity.addEvent(timelineEvent);
                timelineEntity.setEntityId(jobId.toString());
                timelineEntity.setEntityType(MAPREDUCE_JOB_ENTITY_TYPE);
                break;
            case JOB_PRIORITY_CHANGED:
                JobPriorityChangeEvent jobPriorityChangeEvent = (JobPriorityChangeEvent) event;
                timelineEvent.addEventInfo("PRIORITY", jobPriorityChangeEvent.getPriority().toString());
                timelineEntity.addEvent(timelineEvent);
                timelineEntity.setEntityId(jobId.toString());
                timelineEntity.setEntityType(MAPREDUCE_JOB_ENTITY_TYPE);
                break;
            case JOB_QUEUE_CHANGED:
                JobQueueChangeEvent jobQueueChangeEvent = (JobQueueChangeEvent) event;
                timelineEvent.addEventInfo("QUEUE_NAMES", jobQueueChangeEvent.getJobQueueName());
                timelineEntity.addEvent(timelineEvent);
                timelineEntity.setEntityId(jobId.toString());
                timelineEntity.setEntityType(MAPREDUCE_JOB_ENTITY_TYPE);
                break;
            case JOB_FAILED:
            case JOB_KILLED:
            case JOB_ERROR:
                JobUnsuccessfulCompletionEvent jobUnsuccessfulCompletionEvent = (JobUnsuccessfulCompletionEvent) event;
                timelineEvent.addEventInfo("FINISH_TIME", jobUnsuccessfulCompletionEvent.getFinishTime());
                timelineEvent.addEventInfo("NUM_MAPS", jobUnsuccessfulCompletionEvent.getFinishedMaps());
                timelineEvent.addEventInfo("NUM_REDUCES", jobUnsuccessfulCompletionEvent.getFinishedReduces());
                timelineEvent.addEventInfo("JOB_STATUS", jobUnsuccessfulCompletionEvent.getStatus());
                timelineEvent.addEventInfo("DIAGNOSTICS", jobUnsuccessfulCompletionEvent.getDiagnostics());
                timelineEvent.addEventInfo("FINISHED_MAPS", jobUnsuccessfulCompletionEvent.getFinishedMaps());
                timelineEvent.addEventInfo("FINISHED_REDUCES", jobUnsuccessfulCompletionEvent.getFinishedReduces());
                timelineEntity.addEvent(timelineEvent);
                timelineEntity.setEntityId(jobId.toString());
                timelineEntity.setEntityType(MAPREDUCE_JOB_ENTITY_TYPE);
                break;
            case JOB_FINISHED:
                JobFinishedEvent jobFinishedEvent = (JobFinishedEvent) event;
                timelineEvent.addEventInfo("FINISH_TIME", jobFinishedEvent.getFinishTime());
                timelineEvent.addEventInfo("NUM_MAPS", jobFinishedEvent.getFinishedMaps());
                timelineEvent.addEventInfo("NUM_REDUCES", jobFinishedEvent.getFinishedReduces());
                timelineEvent.addEventInfo("FAILED_MAPS", jobFinishedEvent.getFailedMaps());
                timelineEvent.addEventInfo("FAILED_REDUCES", jobFinishedEvent.getFailedReduces());
                timelineEvent.addEventInfo("FINISHED_MAPS", jobFinishedEvent.getFinishedMaps());
                timelineEvent.addEventInfo("FINISHED_REDUCES", jobFinishedEvent.getFinishedReduces());
                timelineEvent.addEventInfo("MAP_COUNTERS_GROUPS", countersToJSON(jobFinishedEvent.getTotalCounters()));
                timelineEvent.addEventInfo("REDUCE_COUNTERS_GROUPS", countersToJSON(jobFinishedEvent.getReduceCounters()));
                timelineEvent.addEventInfo("TOTAL_COUNTERS_GROUPS", countersToJSON(jobFinishedEvent.getTotalCounters()));
                timelineEvent.addEventInfo("JOB_STATUS", JobState.SUCCEEDED.toString());
                timelineEntity.addEvent(timelineEvent);
                timelineEntity.setEntityId(jobId.toString());
                timelineEntity.setEntityType(MAPREDUCE_JOB_ENTITY_TYPE);
                break;
            case TASK_STARTED:
                TaskStartedEvent taskStartedEvent = (TaskStartedEvent) event;
                timelineEvent.addEventInfo("TASK_TYPE", taskStartedEvent.getTaskType().toString());
                timelineEvent.addEventInfo("START_TIME", taskStartedEvent.getStartTime());
                timelineEvent.addEventInfo("SPLIT_LOCATIONS", taskStartedEvent.getSplitLocations());
                timelineEntity.addEvent(timelineEvent);
                timelineEntity.setEntityId(taskStartedEvent.getTaskId().toString());
                timelineEntity.setEntityType(MAPREDUCE_TASK_ENTITY_TYPE);
                timelineEntity.addRelatedEntity(MAPREDUCE_JOB_ENTITY_TYPE, jobId.toString());
                break;
            case TASK_FAILED:
                TaskFailedEvent taskFailedEvent = (TaskFailedEvent) event;
                timelineEvent.addEventInfo("TASK_TYPE", taskFailedEvent.getTaskType().toString());
                timelineEvent.addEventInfo("STATUS", TaskStatus.State.FAILED.toString());
                timelineEvent.addEventInfo("FINISH_TIME", taskFailedEvent.getFinishTime());
                timelineEvent.addEventInfo("ERROR", taskFailedEvent.getError());
                timelineEvent.addEventInfo("FAILED_ATTEMPT_ID", taskFailedEvent.getFailedAttemptID() == null ? "" : taskFailedEvent.getFailedAttemptID().toString());
                timelineEvent.addEventInfo("COUNTERS_GROUPS", countersToJSON(taskFailedEvent.getCounters()));
                timelineEntity.addEvent(timelineEvent);
                timelineEntity.setEntityId(taskFailedEvent.getTaskId().toString());
                timelineEntity.setEntityType(MAPREDUCE_TASK_ENTITY_TYPE);
                timelineEntity.addRelatedEntity(MAPREDUCE_JOB_ENTITY_TYPE, jobId.toString());
                break;
            case TASK_UPDATED:
                TaskUpdatedEvent taskUpdatedEvent = (TaskUpdatedEvent) event;
                timelineEvent.addEventInfo("FINISH_TIME", taskUpdatedEvent.getFinishTime());
                timelineEntity.addEvent(timelineEvent);
                timelineEntity.setEntityId(taskUpdatedEvent.getTaskId().toString());
                timelineEntity.setEntityType(MAPREDUCE_TASK_ENTITY_TYPE);
                timelineEntity.addRelatedEntity(MAPREDUCE_JOB_ENTITY_TYPE, jobId.toString());
                break;
            case TASK_FINISHED:
                TaskFinishedEvent taskFinishedEvent = (TaskFinishedEvent) event;
                timelineEvent.addEventInfo("TASK_TYPE", taskFinishedEvent.getTaskType().toString());
                timelineEvent.addEventInfo("COUNTERS_GROUPS", countersToJSON(taskFinishedEvent.getCounters()));
                timelineEvent.addEventInfo("FINISH_TIME", taskFinishedEvent.getFinishTime());
                timelineEvent.addEventInfo("STATUS", TaskStatus.State.SUCCEEDED.toString());
                timelineEvent.addEventInfo("SUCCESSFUL_TASK_ATTEMPT_ID", taskFinishedEvent.getSuccessfulTaskAttemptId() == null ? "" : taskFinishedEvent.getSuccessfulTaskAttemptId().toString());
                timelineEntity.addEvent(timelineEvent);
                timelineEntity.setEntityId(taskFinishedEvent.getTaskId().toString());
                timelineEntity.setEntityType(MAPREDUCE_TASK_ENTITY_TYPE);
                timelineEntity.addRelatedEntity(MAPREDUCE_JOB_ENTITY_TYPE, jobId.toString());
                break;
            case MAP_ATTEMPT_STARTED:
            case CLEANUP_ATTEMPT_STARTED:
            case REDUCE_ATTEMPT_STARTED:
            case SETUP_ATTEMPT_STARTED:
                TaskAttemptStartedEvent taskAttemptStartedEvent = (TaskAttemptStartedEvent) event;
                timelineEvent.addEventInfo("TASK_TYPE", taskAttemptStartedEvent.getTaskType().toString());
                timelineEvent.addEventInfo("TASK_ATTEMPT_ID", taskAttemptStartedEvent.getTaskAttemptId().toString());
                timelineEvent.addEventInfo("START_TIME", taskAttemptStartedEvent.getStartTime());
                timelineEvent.addEventInfo("HTTP_PORT", taskAttemptStartedEvent.getHttpPort());
                timelineEvent.addEventInfo("TRACKER_NAME", taskAttemptStartedEvent.getTrackerName());
                timelineEvent.addEventInfo("TASK_TYPE", taskAttemptStartedEvent.getTaskType().toString());
                timelineEvent.addEventInfo("SHUFFLE_PORT", taskAttemptStartedEvent.getShufflePort());
                timelineEvent.addEventInfo("CONTAINER_ID", taskAttemptStartedEvent.getContainerId() == null ? "" : taskAttemptStartedEvent.getContainerId().toString());
                timelineEntity.addEvent(timelineEvent);
                timelineEntity.setEntityId(taskAttemptStartedEvent.getTaskId().toString());
                timelineEntity.setEntityType(MAPREDUCE_TASK_ENTITY_TYPE);
                timelineEntity.addRelatedEntity(MAPREDUCE_JOB_ENTITY_TYPE, jobId.toString());
                break;
            case MAP_ATTEMPT_FAILED:
            case CLEANUP_ATTEMPT_FAILED:
            case REDUCE_ATTEMPT_FAILED:
            case SETUP_ATTEMPT_FAILED:
            case MAP_ATTEMPT_KILLED:
            case CLEANUP_ATTEMPT_KILLED:
            case REDUCE_ATTEMPT_KILLED:
            case SETUP_ATTEMPT_KILLED:
                TaskAttemptUnsuccessfulCompletionEvent taskAttemptUnsuccessfulCompletionEvent = (TaskAttemptUnsuccessfulCompletionEvent) event;
                timelineEvent.addEventInfo("TASK_TYPE", taskAttemptUnsuccessfulCompletionEvent.getTaskType().toString());
                timelineEvent.addEventInfo("TASK_ATTEMPT_ID", taskAttemptUnsuccessfulCompletionEvent.getTaskAttemptId() == null ? "" : taskAttemptUnsuccessfulCompletionEvent.getTaskAttemptId().toString());
                timelineEvent.addEventInfo("FINISH_TIME", taskAttemptUnsuccessfulCompletionEvent.getFinishTime());
                timelineEvent.addEventInfo("ERROR", taskAttemptUnsuccessfulCompletionEvent.getError());
                timelineEvent.addEventInfo("STATUS", taskAttemptUnsuccessfulCompletionEvent.getTaskStatus());
                timelineEvent.addEventInfo("HOSTNAME", taskAttemptUnsuccessfulCompletionEvent.getHostname());
                timelineEvent.addEventInfo("PORT", taskAttemptUnsuccessfulCompletionEvent.getPort());
                timelineEvent.addEventInfo("RACK_NAME", taskAttemptUnsuccessfulCompletionEvent.getRackName());
                timelineEvent.addEventInfo("SHUFFLE_FINISH_TIME", taskAttemptUnsuccessfulCompletionEvent.getFinishTime());
                timelineEvent.addEventInfo("SORT_FINISH_TIME", taskAttemptUnsuccessfulCompletionEvent.getFinishTime());
                timelineEvent.addEventInfo("MAP_FINISH_TIME", taskAttemptUnsuccessfulCompletionEvent.getFinishTime());
                timelineEvent.addEventInfo("COUNTERS_GROUPS", countersToJSON(taskAttemptUnsuccessfulCompletionEvent.getCounters()));
                timelineEntity.addEvent(timelineEvent);
                timelineEntity.setEntityId(taskAttemptUnsuccessfulCompletionEvent.getTaskId().toString());
                timelineEntity.setEntityType(MAPREDUCE_TASK_ENTITY_TYPE);
                timelineEntity.addRelatedEntity(MAPREDUCE_JOB_ENTITY_TYPE, jobId.toString());
                break;
            case MAP_ATTEMPT_FINISHED:
                MapAttemptFinishedEvent mapAttemptFinishedEvent = (MapAttemptFinishedEvent) event;
                timelineEvent.addEventInfo("TASK_TYPE", mapAttemptFinishedEvent.getTaskType().toString());
                timelineEvent.addEventInfo("FINISH_TIME", mapAttemptFinishedEvent.getFinishTime());
                timelineEvent.addEventInfo("STATUS", mapAttemptFinishedEvent.getTaskStatus());
                timelineEvent.addEventInfo("STATE", mapAttemptFinishedEvent.getState());
                timelineEvent.addEventInfo("MAP_FINISH_TIME", mapAttemptFinishedEvent.getMapFinishTime());
                timelineEvent.addEventInfo("COUNTERS_GROUPS", countersToJSON(mapAttemptFinishedEvent.getCounters()));
                timelineEvent.addEventInfo("HOSTNAME", mapAttemptFinishedEvent.getHostname());
                timelineEvent.addEventInfo("PORT", mapAttemptFinishedEvent.getPort());
                timelineEvent.addEventInfo("RACK_NAME", mapAttemptFinishedEvent.getRackName());
                timelineEvent.addEventInfo("ATTEMPT_ID", mapAttemptFinishedEvent.getAttemptId() == null ? "" : mapAttemptFinishedEvent.getAttemptId().toString());
                timelineEntity.addEvent(timelineEvent);
                timelineEntity.setEntityId(mapAttemptFinishedEvent.getTaskId().toString());
                timelineEntity.setEntityType(MAPREDUCE_TASK_ENTITY_TYPE);
                timelineEntity.addRelatedEntity(MAPREDUCE_JOB_ENTITY_TYPE, jobId.toString());
                break;
            case REDUCE_ATTEMPT_FINISHED:
                ReduceAttemptFinishedEvent reduceAttemptFinishedEvent = (ReduceAttemptFinishedEvent) event;
                timelineEvent.addEventInfo("TASK_TYPE", reduceAttemptFinishedEvent.getTaskType().toString());
                timelineEvent.addEventInfo("ATTEMPT_ID", reduceAttemptFinishedEvent.getAttemptId() == null ? "" : reduceAttemptFinishedEvent.getAttemptId().toString());
                timelineEvent.addEventInfo("FINISH_TIME", reduceAttemptFinishedEvent.getFinishTime());
                timelineEvent.addEventInfo("STATUS", reduceAttemptFinishedEvent.getTaskStatus());
                timelineEvent.addEventInfo("STATE", reduceAttemptFinishedEvent.getState());
                timelineEvent.addEventInfo("SHUFFLE_FINISH_TIME", reduceAttemptFinishedEvent.getShuffleFinishTime());
                timelineEvent.addEventInfo("SORT_FINISH_TIME", reduceAttemptFinishedEvent.getSortFinishTime());
                timelineEvent.addEventInfo("COUNTERS_GROUPS", countersToJSON(reduceAttemptFinishedEvent.getCounters()));
                timelineEvent.addEventInfo("HOSTNAME", reduceAttemptFinishedEvent.getHostname());
                timelineEvent.addEventInfo("PORT", reduceAttemptFinishedEvent.getPort());
                timelineEvent.addEventInfo("RACK_NAME", reduceAttemptFinishedEvent.getRackName());
                timelineEntity.addEvent(timelineEvent);
                timelineEntity.setEntityId(reduceAttemptFinishedEvent.getTaskId().toString());
                timelineEntity.setEntityType(MAPREDUCE_TASK_ENTITY_TYPE);
                timelineEntity.addRelatedEntity(MAPREDUCE_JOB_ENTITY_TYPE, jobId.toString());
                break;
            case SETUP_ATTEMPT_FINISHED:
            case CLEANUP_ATTEMPT_FINISHED:
                TaskAttemptFinishedEvent taskAttemptFinishedEvent = (TaskAttemptFinishedEvent) event;
                timelineEvent.addEventInfo("TASK_TYPE", taskAttemptFinishedEvent.getTaskType().toString());
                timelineEvent.addEventInfo("ATTEMPT_ID", taskAttemptFinishedEvent.getAttemptId() == null ? "" : taskAttemptFinishedEvent.getAttemptId().toString());
                timelineEvent.addEventInfo("FINISH_TIME", taskAttemptFinishedEvent.getFinishTime());
                timelineEvent.addEventInfo("STATUS", taskAttemptFinishedEvent.getTaskStatus());
                timelineEvent.addEventInfo("STATE", taskAttemptFinishedEvent.getState());
                timelineEvent.addEventInfo("COUNTERS_GROUPS", countersToJSON(taskAttemptFinishedEvent.getCounters()));
                timelineEvent.addEventInfo("HOSTNAME", taskAttemptFinishedEvent.getHostname());
                timelineEntity.addEvent(timelineEvent);
                timelineEntity.setEntityId(taskAttemptFinishedEvent.getTaskId().toString());
                timelineEntity.setEntityType(MAPREDUCE_TASK_ENTITY_TYPE);
                timelineEntity.addRelatedEntity(MAPREDUCE_JOB_ENTITY_TYPE, jobId.toString());
                break;
            case AM_STARTED:
                AMStartedEvent amStartedEvent = (AMStartedEvent) event;
                timelineEvent.addEventInfo("APPLICATION_ATTEMPT_ID", amStartedEvent.getAppAttemptId() == null ? "" : amStartedEvent.getAppAttemptId().toString());
                timelineEvent.addEventInfo("CONTAINER_ID", amStartedEvent.getContainerId() == null ? "" : amStartedEvent.getContainerId().toString());
                timelineEvent.addEventInfo("NODE_MANAGER_HOST", amStartedEvent.getNodeManagerHost());
                timelineEvent.addEventInfo("NODE_MANAGER_PORT", amStartedEvent.getNodeManagerPort());
                timelineEvent.addEventInfo("NODE_MANAGER_HTTP_PORT", amStartedEvent.getNodeManagerHttpPort());
                timelineEvent.addEventInfo("START_TIME", amStartedEvent.getStartTime());
                timelineEvent.addEventInfo("SUBMIT_TIME", amStartedEvent.getSubmitTime());
                timelineEntity.addEvent(timelineEvent);
                timelineEntity.setEntityId(jobId.toString());
                timelineEntity.setEntityType(MAPREDUCE_JOB_ENTITY_TYPE);
                break;
            default:
                break;
        }
    }

    // ...
}