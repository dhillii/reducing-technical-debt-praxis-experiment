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
        return EnumSet.of(EventType.JOB_FINISHED, EventType.JOB_FAILED, EventType.JOB_KILLED).contains(historyEvent.getEventType());
    }

    @Private
    public void handleEvent(JobHistoryEvent event) {
        synchronized (lock) {
            HistoryEventType eventType = event.getHistoryEvent().getEventType();
            HistoryEventProcessor processor = getHistoryEventProcessor(eventType);
            processor.process(event);
        }
    }

    private HistoryEventProcessor getHistoryEventProcessor(HistoryEventType eventType) {
        switch (eventType) {
            case AM_STARTED:
                return new AMStartedProcessor();
            case JOB_SUBMITTED:
                return new JobSubmittedProcessor();
            case JOB_INITED:
                return new JobInitedProcessor();
            case JOB_FINISHED:
                return new JobFinishedProcessor();
            case JOB_FAILED:
            case JOB_KILLED:
                return new JobUnsuccessfulCompletionProcessor();
            default:
                return new DefaultProcessor();
        }
    }

    private abstract class HistoryEventProcessor {
        public abstract void process(JobHistoryEvent event);
    }

    private class AMStartedProcessor extends HistoryEventProcessor {
        @Override
        public void process(JobHistoryEvent event) {
            try {
                AMStartedEvent amStartedEvent = (AMStartedEvent) event.getHistoryEvent();
                setupEventWriter(event.getJobID(), amStartedEvent);
            } catch (IOException ioe) {
                LOG.error("Error JobHistoryEventHandler in handleEvent: " + event, ioe);
                throw new YarnRuntimeException(ioe);
            }
        }
    }

    private class JobSubmittedProcessor extends HistoryEventProcessor {
        @Override
        public void process(JobHistoryEvent event) {
            JobSubmittedEvent jobSubmittedEvent = (JobSubmittedEvent) event.getHistoryEvent();
            MetaInfo mi = fileMap.get(event.getJobID());
            mi.getJobIndexInfo().setSubmitTime(jobSubmittedEvent.getSubmitTime());
            mi.getJobIndexInfo().setQueueName(jobSubmittedEvent.getJobQueueName());
        }
    }

    private class JobInitedProcessor extends HistoryEventProcessor {
        @Override
        public void process(JobHistoryEvent event) {
            JobInitedEvent jobInitedEvent = (JobInitedEvent) event.getHistoryEvent();
            MetaInfo mi = fileMap.get(event.getJobID());
            mi.getJobIndexInfo().setJobStartTime(jobInitedEvent.getLaunchTime());
        }
    }

    private class JobFinishedProcessor extends HistoryEventProcessor {
        @Override
        public void process(JobHistoryEvent event) {
            try {
                JobFinishedEvent jobFinishedEvent = (JobFinishedEvent) event.getHistoryEvent();
                MetaInfo mi = fileMap.get(event.getJobID());
                mi.getJobIndexInfo().setFinishTime(jobFinishedEvent.getFinishTime());
                mi.getJobIndexInfo().setNumMaps(jobFinishedEvent.getFinishedMaps());
                mi.getJobIndexInfo().setNumReduces(jobFinishedEvent.getFinishedReduces());
                mi.getJobIndexInfo().setJobStatus(JobState.SUCCEEDED.toString());
                closeEventWriter(event.getJobID());
                processDoneFiles(event.getJobID());
            } catch (IOException e) {
                throw new YarnRuntimeException(e);
            }
        }
    }

    private class JobUnsuccessfulCompletionProcessor extends HistoryEventProcessor {
        @Override
        public void process(JobHistoryEvent event) {
            try {
                JobUnsuccessfulCompletionEvent jobUnsuccessfulCompletionEvent = (JobUnsuccessfulCompletionEvent) event.getHistoryEvent();
                MetaInfo mi = fileMap.get(event.getJobID());
                mi.getJobIndexInfo().setFinishTime(jobUnsuccessfulCompletionEvent.getFinishTime());
                mi.getJobIndexInfo().setNumMaps(jobUnsuccessfulCompletionEvent.getFinishedMaps());
                mi.getJobIndexInfo().setNumReduces(jobUnsuccessfulCompletionEvent.getFinishedReduces());
                mi.getJobIndexInfo().setJobStatus(jobUnsuccessfulCompletionEvent.getStatus());
                closeEventWriter(event.getJobID());
                processDoneFiles(event.getJobID());
            } catch (IOException e) {
                throw new YarnRuntimeException(e);
            }
        }
    }

    private class DefaultProcessor extends HistoryEventProcessor {
        @Override
        public void process(JobHistoryEvent event) {
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
        }
    }

    // ...

    public void processEventForJobSummary(HistoryEvent event, JobSummary summary, JobId jobId) {
        HistoryEventType eventType = event.getEventType();
        JobSummaryProcessor processor = getJobSummaryProcessor(eventType);
        processor.process(event, summary);
    }

    private JobSummaryProcessor getJobSummaryProcessor(HistoryEventType eventType) {
        switch (eventType) {
            case JOB_SUBMITTED:
                return new JobSubmittedSummaryProcessor();
            case NORMALIZED_RESOURCE:
                return new NormalizedResourceSummaryProcessor();
            case JOB_INITED:
                return new JobInitedSummaryProcessor();
            case MAP_ATTEMPT_STARTED:
                return new MapAttemptStartedSummaryProcessor();
            case REDUCE_ATTEMPT_STARTED:
                return new ReduceAttemptStartedSummaryProcessor();
            case JOB_FINISHED:
                return new JobFinishedSummaryProcessor();
            case JOB_FAILED:
            case JOB_KILLED:
                return new JobUnsuccessfulCompletionSummaryProcessor();
            default:
                return new DefaultSummaryProcessor();
        }
    }

    private abstract class JobSummaryProcessor {
        public abstract void process(HistoryEvent event, JobSummary summary);
    }

    private class JobSubmittedSummaryProcessor extends JobSummaryProcessor {
        @Override
        public void process(HistoryEvent event, JobSummary summary) {
            JobSubmittedEvent jobSubmittedEvent = (JobSubmittedEvent) event;
            summary.setUser(jobSubmittedEvent.getUserName());
            summary.setQueue(jobSubmittedEvent.getJobQueueName());
            summary.setJobSubmitTime(jobSubmittedEvent.getSubmitTime());
            summary.setJobName(jobSubmittedEvent.getJobName());
        }
    }

    private class NormalizedResourceSummaryProcessor extends JobSummaryProcessor {
        @Override
        public void process(HistoryEvent event, JobSummary summary) {
            NormalizedResourceEvent normalizedResourceEvent = (NormalizedResourceEvent) event;
            if (normalizedResourceEvent.getTaskType() == TaskType.MAP) {
                summary.setResourcesPerMap(normalizedResourceEvent.getMemory());
            } else if (normalizedResourceEvent.getTaskType() == TaskType.REDUCE) {
                summary.setResourcesPerReduce(normalizedResourceEvent.getMemory());
            }
        }
    }

    private class JobInitedSummaryProcessor extends JobSummaryProcessor {
        @Override
        public void process(HistoryEvent event, JobSummary summary) {
            JobInitedEvent jobInitedEvent = (JobInitedEvent) event;
            summary.setJobLaunchTime(jobInitedEvent.getLaunchTime());
        }
    }

    private class MapAttemptStartedSummaryProcessor extends JobSummaryProcessor {
        @Override
        public void process(HistoryEvent event, JobSummary summary) {
            TaskAttemptStartedEvent taskAttemptStartedEvent = (TaskAttemptStartedEvent) event;
            if (summary.getFirstMapTaskLaunchTime() == 0) {
                summary.setFirstMapTaskLaunchTime(taskAttemptStartedEvent.getStartTime());
            }
        }
    }

    private class ReduceAttemptStartedSummaryProcessor extends JobSummaryProcessor {
        @Override
        public void process(HistoryEvent event, JobSummary summary) {
            TaskAttemptStartedEvent taskAttemptStartedEvent = (TaskAttemptStartedEvent) event;
            if (summary.getFirstReduceTaskLaunchTime() == 0) {
                summary.setFirstReduceTaskLaunchTime(taskAttemptStartedEvent.getStartTime());
            }
        }
    }

    private class JobFinishedSummaryProcessor extends JobSummaryProcessor {
        @Override
        public void process(HistoryEvent event, JobSummary summary) {
            JobFinishedEvent jobFinishedEvent = (JobFinishedEvent) event;
            summary.setJobFinishTime(jobFinishedEvent.getFinishTime());
            summary.setNumFinishedMaps(jobFinishedEvent.getFinishedMaps());
            summary.setNumFailedMaps(jobFinishedEvent.getFailedMaps());
            summary.setNumFinishedReduces(jobFinishedEvent.getFinishedReduces());
            summary.setNumFailedReduces(jobFinishedEvent.getFailedReduces());
            if (summary.getJobStatus() == null) {
                summary.setJobStatus(org.apache.hadoop.mapreduce.JobStatus.State.SUCCEEDED.toString());
            }
            setSummarySlotSeconds(summary, jobFinishedEvent.getTotalCounters());
        }
    }

    private class JobUnsuccessfulCompletionSummaryProcessor extends JobSummaryProcessor {
        @Override
        public void process(HistoryEvent event, JobSummary summary) {
            JobUnsuccessfulCompletionEvent jobUnsuccessfulCompletionEvent = (JobUnsuccessfulCompletionEvent) event;
            summary.setJobStatus(jobUnsuccessfulCompletionEvent.getStatus());
            summary.setNumFinishedMaps(context.getJob(event.getJobID()).getTotalMaps());
            summary.setNumFinishedReduces(context.getJob(event.getJobID()).getTotalReduces());
            summary.setJobFinishTime(jobUnsuccessfulCompletionEvent.getFinishTime());
            setSummarySlotSeconds(summary, context.getJob(event.getJobID()).getAllCounters());
        }
    }

    private class DefaultSummaryProcessor extends JobSummaryProcessor {
        @Override
        public void process(HistoryEvent event, JobSummary summary) {
            // Do nothing
        }
    }

    // ...

    public void processEventForTimelineServer(HistoryEvent event, JobId jobId, long timestamp) {
        HistoryEventType eventType = event.getEventType();
        TimelineServerProcessor processor = getTimelineServerProcessor(eventType);
        processor.process(event, jobId, timestamp);
    }

    private TimelineServerProcessor getTimelineServerProcessor(HistoryEventType eventType) {
        switch (eventType) {
            case JOB_SUBMITTED:
                return new JobSubmittedTimelineServerProcessor();
            case JOB_STATUS_CHANGED:
                return new JobStatusChangedTimelineServerProcessor();
            case JOB_INFO_CHANGED:
                return new JobInfoChangedTimelineServerProcessor();
            case JOB_INITED:
                return new JobInitedTimelineServerProcessor();
            case JOB_PRIORITY_CHANGED:
                return new JobPriorityChangedTimelineServerProcessor();
            case JOB_QUEUE_CHANGED:
                return new JobQueueChangedTimelineServerProcessor();
            case JOB_FAILED:
            case JOB_KILLED:
            case JOB_ERROR:
                return new JobUnsuccessfulCompletionTimelineServerProcessor();
            case JOB_FINISHED:
                return new JobFinishedTimelineServerProcessor();
            case TASK_STARTED:
                return new TaskStartedTimelineServerProcessor();
            case TASK_FAILED:
                return new TaskFailedTimelineServerProcessor();
            case TASK_UPDATED:
                return new TaskUpdatedTimelineServerProcessor();
            case TASK_FINISHED:
                return new TaskFinishedTimelineServerProcessor();
            case MAP_ATTEMPT_STARTED:
            case CLEANUP_ATTEMPT_STARTED:
            case REDUCE_ATTEMPT_STARTED:
            case SETUP_ATTEMPT_STARTED:
                return new TaskAttemptStartedTimelineServerProcessor();
            case MAP_ATTEMPT_FAILED:
            case CLEANUP_ATTEMPT_FAILED:
            case REDUCE_ATTEMPT_FAILED:
            case SETUP_ATTEMPT_FAILED:
            case MAP_ATTEMPT_KILLED:
            case CLEANUP_ATTEMPT_KILLED:
            case REDUCE_ATTEMPT_KILLED:
            case SETUP_ATTEMPT_KILLED:
                return new TaskAttemptUnsuccessfulCompletionTimelineServerProcessor();
            case MAP_ATTEMPT_FINISHED:
                return new MapAttemptFinishedTimelineServerProcessor();
            case REDUCE_ATTEMPT_FINISHED:
                return new ReduceAttemptFinishedTimelineServerProcessor();
            case SETUP_ATTEMPT_FINISHED:
            case CLEANUP_ATTEMPT_FINISHED:
                return new TaskAttemptFinishedTimelineServerProcessor();
            default:
                return new DefaultTimelineServerProcessor();
        }
    }

    private abstract class TimelineServerProcessor {
        public abstract void process(HistoryEvent event, JobId jobId, long timestamp);
    }

    private class JobSubmittedTimelineServerProcessor extends TimelineServerProcessor {
        @Override
        public void process(HistoryEvent event, JobId jobId, long timestamp) {
            JobSubmittedEvent jobSubmittedEvent = (JobSubmittedEvent) event;
            TimelineEvent tEvent = new TimelineEvent();
            tEvent.setEventType(StringUtils.toUpperCase(event.getEventType().name()));
            tEvent.setTimestamp(timestamp);
            TimelineEntity tEntity = new TimelineEntity();
            tEvent.addEventInfo("SUBMIT_TIME", jobSubmittedEvent.getSubmitTime());
            tEvent.addEventInfo("QUEUE_NAME", jobSubmittedEvent.getJobQueueName());
            tEvent.addEventInfo("JOB_NAME", jobSubmittedEvent.getJobName());
            tEvent.addEventInfo("USER_NAME", jobSubmittedEvent.getUserName());
            tEvent.addEventInfo("JOB_CONF_PATH", jobSubmittedEvent.getJobConfPath());
            tEvent.addEventInfo("ACLS", jobSubmittedEvent.getJobAcls());
            tEvent.addEventInfo("JOB_QUEUE_NAME", jobSubmittedEvent.getJobQueueName());
            tEvent.addEventInfo("WORKLFOW_ID", jobSubmittedEvent.getWorkflowId());
            tEvent.addEventInfo("WORKFLOW_NAME", jobSubmittedEvent.getWorkflowName());
            tEvent.addEventInfo("WORKFLOW_NAME_NAME", jobSubmittedEvent.getWorkflowNodeName());
            tEvent.addEventInfo("WORKFLOW_ADJACENCIES", jobSubmittedEvent.getWorkflowAdjacencies());
            tEvent.addEventInfo("WORKFLOW_TAGS", jobSubmittedEvent.getWorkflowTags());
            tEntity.addEvent(tEvent);
            tEntity.setEntityId(jobId.toString());
            tEntity.setEntityType(MAPREDUCE_JOB_ENTITY_TYPE);
            try {
                timelineClient.putEntities(tEntity);
            } catch (IOException ex) {
                LOG.error("Error putting entity " + tEntity.getEntityId() + " to TimelineServer", ex);
            } catch (YarnException ex) {
                LOG.error("Error putting entity " + tEntity.getEntityId() + " to TimelineServer", ex);
            }
        }
    }

    private class JobStatusChangedTimelineServerProcessor extends TimelineServerProcessor {
        @Override
        public void process(HistoryEvent event, JobId jobId, long timestamp) {
            JobStatusChangedEvent jobStatusChangedEvent = (JobStatusChangedEvent) event;
            TimelineEvent tEvent = new TimelineEvent();
            tEvent.setEventType(StringUtils.toUpperCase(event.getEventType().name()));
            tEvent.setTimestamp(timestamp);
            TimelineEntity tEntity = new TimelineEntity();
            tEvent.addEventInfo("STATUS", jobStatusChangedEvent.getStatus());
            tEntity.addEvent(tEvent);
            tEntity.setEntityId(jobId.toString());
            tEntity.setEntityType(MAPREDUCE_JOB_ENTITY_TYPE);
            try {
                timelineClient.putEntities(tEntity);
            } catch (IOException ex) {
                LOG.error("Error putting entity " + tEntity.getEntityId() + " to TimelineServer", ex);
            } catch (YarnException ex) {
                LOG.error("Error putting entity " + tEntity.getEntityId() + " to TimelineServer", ex);
            }
        }
    }

    private class JobInfoChangedTimelineServerProcessor extends TimelineServerProcessor {
        @Override
        public void process(HistoryEvent event, JobId jobId, long timestamp) {
            JobInfoChangeEvent jobInfoChangeEvent = (JobInfoChangeEvent) event;
            TimelineEvent tEvent = new TimelineEvent();
            tEvent.setEventType(StringUtils.toUpperCase(event.getEventType().name()));
            tEvent.setTimestamp(timestamp);
            TimelineEntity tEntity = new TimelineEntity();
            tEvent.addEventInfo("SUBMIT_TIME", jobInfoChangeEvent.getSubmitTime());
            tEvent.addEventInfo("LAUNCH_TIME", jobInfoChangeEvent.getLaunchTime());
            tEntity.addEvent(tEvent);
            tEntity.setEntityId(jobId.toString());
            tEntity.setEntityType(MAPREDUCE_JOB_ENTITY_TYPE);
            try {
                timelineClient.putEntities(tEntity);
            } catch (IOException ex) {
                LOG.error("Error putting entity " + tEntity.getEntityId() + " to TimelineServer", ex);
            } catch (YarnException ex) {
                LOG.error("Error putting entity " + tEntity.getEntityId() + " to TimelineServer", ex);
            }
        }
    }

    private class JobInitedTimelineServerProcessor extends TimelineServerProcessor {
        @Override
        public void process(HistoryEvent event, JobId jobId, long timestamp) {
            JobInitedEvent jobInitedEvent = (JobInitedEvent) event;
            TimelineEvent tEvent = new TimelineEvent();
            tEvent.setEventType(StringUtils.toUpperCase(event.getEventType().name()));
            tEvent.setTimestamp(timestamp);
            TimelineEntity tEntity = new TimelineEntity();
            tEvent.addEventInfo("START_TIME", jobInitedEvent.getLaunchTime());
            tEvent.addEventInfo("STATUS", jobInitedEvent.getStatus());
            tEvent.addEventInfo("TOTAL_MAPS", jobInitedEvent.getTotalMaps());
            tEvent.addEventInfo("TOTAL_REDUCES", jobInitedEvent.getTotalReduces());
            tEvent.addEventInfo("UBERIZED", jobInitedEvent.getUberized());
            tEntity.setStartTime(jobInitedEvent.getLaunchTime());
            tEntity.addEvent(tEvent);
            tEntity.setEntityId(jobId.toString());
            tEntity.setEntityType(MAPREDUCE_JOB_ENTITY_TYPE);
            try {
                timelineClient.putEntities(tEntity);
            } catch (IOException ex) {
                LOG.error("Error putting entity " + tEntity.getEntityId() + " to TimelineServer", ex);
            } catch (YarnException ex) {
                LOG.error("Error putting entity " + tEntity.getEntityId() + " to TimelineServer", ex);
            }
        }
    }

    private class JobPriorityChangedTimelineServerProcessor extends TimelineServerProcessor {
        @Override
        public void process(HistoryEvent event, JobId jobId, long timestamp) {
            JobPriorityChangeEvent jobPriorityChangeEvent = (JobPriorityChangeEvent) event;
            TimelineEvent tEvent = new TimelineEvent();
            tEvent.setEventType(StringUtils.toUpperCase(event.getEventType().name()));
            tEvent.setTimestamp(timestamp);
            TimelineEntity tEntity = new TimelineEntity();
            tEvent.addEventInfo("PRIORITY", jobPriorityChangeEvent.getPriority().toString());
            tEntity.addEvent(tEvent);
            tEntity.setEntityId(jobId.toString());
            tEntity.setEntityType(MAPREDUCE_JOB_ENTITY_TYPE);
            try {
                timelineClient.putEntities(tEntity);
            } catch (IOException ex) {
                LOG.error("Error putting entity " + tEntity.getEntityId() + " to TimelineServer", ex);
            } catch (YarnException ex) {
                LOG.error("Error putting entity " + tEntity.getEntityId() + " to TimelineServer", ex);
            }
        }
    }

    private class JobQueueChangedTimelineServerProcessor extends TimelineServerProcessor {
        @Override
        public void process(HistoryEvent event, JobId jobId, long timestamp) {
            JobQueueChangeEvent jobQueueChangeEvent = (JobQueueChangeEvent) event;
            TimelineEvent tEvent = new TimelineEvent();
            tEvent.setEventType(StringUtils.toUpperCase(event.getEventType().name()));
            tEvent.setTimestamp(timestamp);
            TimelineEntity tEntity = new TimelineEntity();
            tEvent.addEventInfo("QUEUE_NAMES", jobQueueChangeEvent.getJobQueueName());
            tEntity.addEvent(tEvent);
            tEntity.setEntityId(jobId.toString());
            tEntity.setEntityType(MAPREDUCE_JOB_ENTITY_TYPE);
            try {
                timelineClient.putEntities(tEntity);
            } catch (IOException ex) {
                LOG.error("Error putting entity " + tEntity.getEntityId() + " to TimelineServer", ex);
            } catch (YarnException ex) {
                LOG.error("Error putting entity " + tEntity.getEntityId() + " to TimelineServer", ex);
            }
        }
    }

    private class JobUnsuccessfulCompletionTimelineServerProcessor extends TimelineServerProcessor {
        @Override
        public void process(HistoryEvent event, JobId jobId, long timestamp) {
            JobUnsuccessfulCompletionEvent jobUnsuccessfulCompletionEvent = (JobUnsuccessfulCompletionEvent) event;
            TimelineEvent tEvent = new TimelineEvent();
            tEvent.setEventType(StringUtils.toUpperCase(event.getEventType().name()));
            tEvent.setTimestamp(timestamp);
            TimelineEntity tEntity = new TimelineEntity();
            tEvent.addEventInfo("FINISH_TIME", jobUnsuccessfulCompletionEvent.getFinishTime());
            tEvent.addEventInfo("NUM_MAPS", jobUnsuccessfulCompletionEvent.getFinishedMaps());
            tEvent.addEventInfo("NUM_REDUCES", jobUnsuccessfulCompletionEvent.getFinishedReduces());
            tEvent.addEventInfo("JOB_STATUS", jobUnsuccessfulCompletionEvent.getStatus());
            tEvent.addEventInfo("DIAGNOSTICS", jobUnsuccessfulCompletionEvent.getDiagnostics());
            tEvent.addEventInfo("FINISHED_MAPS", jobUnsuccessfulCompletionEvent.getFinishedMaps());
            tEvent.addEventInfo("FINISHED_REDUCES", jobUnsuccessfulCompletionEvent.getFinishedReduces());
            tEntity.addEvent(tEvent);
            tEntity.setEntityId(jobId.toString());
            tEntity.setEntityType(MAPREDUCE_JOB_ENTITY_TYPE);
            try {
                timelineClient.putEntities(tEntity);
            } catch (IOException ex) {
                LOG.error("Error putting entity " + tEntity.getEntityId() + " to TimelineServer", ex);
            } catch (YarnException ex) {
                LOG.error("Error putting entity " + tEntity.getEntityId() + " to TimelineServer", ex);
            }
        }
    }

    private class JobFinishedTimelineServerProcessor extends TimelineServerProcessor {
        @Override
        public void process(HistoryEvent event, JobId jobId, long timestamp) {
            JobFinishedEvent jobFinishedEvent = (JobFinishedEvent) event;
            TimelineEvent tEvent = new TimelineEvent();
            tEvent.setEventType(StringUtils.toUpperCase(event.getEventType().name()));
            tEvent.setTimestamp(timestamp);
            TimelineEntity tEntity = new TimelineEntity();
            tEvent.addEventInfo("FINISH_TIME", jobFinishedEvent.getFinishTime());
            tEvent.addEventInfo("NUM_MAPS", jobFinishedEvent.getFinishedMaps());
            tEvent.addEventInfo("NUM_REDUCES", jobFinishedEvent.getFinishedReduces());
            tEvent.addEventInfo("FAILED_MAPS", jobFinishedEvent.getFailedMaps());
            tEvent.addEventInfo("FAILED_REDUCES", jobFinishedEvent.getFailedReduces());
            tEvent.addEventInfo("FINISHED_MAPS", jobFinishedEvent.getFinishedMaps());
            tEvent.addEventInfo("FINISHED_REDUCES", jobFinishedEvent.getFinishedReduces());
            tEvent.addEventInfo("MAP_COUNTERS_GROUPS", countersToJSON(jobFinishedEvent.getTotalCounters()));
            tEvent.addEventInfo("REDUCE_COUNTERS_GROUPS", countersToJSON(jobFinishedEvent.getReduceCounters()));
            tEvent.addEventInfo("TOTAL_COUNTERS_GROUPS", countersToJSON(jobFinishedEvent.getTotalCounters()));
            tEvent.addEventInfo("JOB_STATUS", JobState.SUCCEEDED.toString());
            tEntity.addEvent(tEvent);
            tEntity.setEntityId(jobId.toString());
            tEntity.setEntityType(MAPREDUCE_JOB_ENTITY_TYPE);
            try {
                timelineClient.putEntities(tEntity);
            } catch (IOException ex) {
                LOG.error("Error putting entity " + tEntity.getEntityId() + " to TimelineServer", ex);
            } catch (YarnException ex) {
                LOG.error("Error putting entity " + tEntity.getEntityId() + " to TimelineServer", ex);
            }
        }
    }

    private class TaskStartedTimelineServerProcessor extends TimelineServerProcessor {
        @Override
        public void process(HistoryEvent event, JobId jobId, long timestamp) {
            TaskStartedEvent taskStartedEvent = (TaskStartedEvent) event;
            TimelineEvent tEvent = new TimelineEvent();
            tEvent.setEventType(StringUtils.toUpperCase(event.getEventType().name()));
            tEvent.setTimestamp(timestamp);
            TimelineEntity tEntity = new TimelineEntity();
            tEvent.addEventInfo("TASK_TYPE", taskStartedEvent.getTaskType().toString());
            tEvent.addEventInfo("START_TIME", taskStartedEvent.getStartTime());
            tEvent.addEventInfo("SPLIT_LOCATIONS", taskStartedEvent.getSplitLocations());
            tEntity.addEvent(tEvent);
            tEntity.setEntityId(taskStartedEvent.getTaskId().toString());
            tEntity.setEntityType(MAPREDUCE_TASK_ENTITY_TYPE);
            tEntity.addRelatedEntity(MAPREDUCE_JOB_ENTITY_TYPE, jobId.toString());
            try {
                timelineClient.putEntities(tEntity);
            } catch (IOException ex) {
                LOG.error("Error putting entity " + tEntity.getEntityId() + " to TimelineServer", ex);
            } catch (YarnException ex) {
                LOG.error("Error putting entity " + tEntity.getEntityId() + " to TimelineServer", ex);
            }
        }
    }

    private class TaskFailedTimelineServerProcessor extends TimelineServerProcessor {
        @Override
        public void process(HistoryEvent event, JobId jobId, long timestamp) {
            TaskFailedEvent taskFailedEvent = (TaskFailedEvent) event;
            TimelineEvent tEvent = new TimelineEvent();
            tEvent.setEventType(StringUtils.toUpperCase(event.getEventType().name()));
            tEvent.setTimestamp(timestamp);
            TimelineEntity tEntity = new TimelineEntity();
            tEvent.addEventInfo("TASK_TYPE", taskFailedEvent.getTaskType().toString());
            tEvent.addEventInfo("STATUS", TaskStatus.State.FAILED.toString());
            tEvent.addEventInfo("FINISH_TIME", taskFailedEvent.getFinishTime());
            tEvent.addEventInfo("ERROR", taskFailedEvent.getError());
            tEvent.addEventInfo("FAILED_ATTEMPT_ID", taskFailedEvent.getFailedAttemptID() == null ? "" : taskFailedEvent.getFailedAttemptID().toString());
            tEvent.addEventInfo("COUNTERS_GROUPS", countersToJSON(taskFailedEvent.getCounters()));
            tEntity.addEvent(tEvent);
            tEntity.setEntityId(taskFailedEvent.getTaskId().toString());
            tEntity.setEntityType(MAPREDUCE_TASK_ENTITY_TYPE);
            tEntity.addRelatedEntity(MAPREDUCE_JOB_ENTITY_TYPE, jobId.toString());
            try {
                timelineClient.putEntities(tEntity);
            } catch (IOException ex) {
                LOG.error("Error putting entity " + tEntity.getEntityId() + " to TimelineServer", ex);
            } catch (YarnException ex) {
                LOG.error("Error putting entity " + tEntity.getEntityId() + " to TimelineServer", ex);
            }
        }
    }

    private class TaskUpdatedTimelineServerProcessor extends TimelineServerProcessor {
        @Override
        public void process(HistoryEvent event, JobId jobId, long timestamp) {
            TaskUpdatedEvent taskUpdatedEvent = (TaskUpdatedEvent) event;
            TimelineEvent tEvent = new TimelineEvent();
            tEvent.setEventType(StringUtils.toUpperCase(event.getEventType().name()));
            tEvent.setTimestamp(timestamp);
            TimelineEntity tEntity = new TimelineEntity();
            tEvent.addEventInfo("FINISH_TIME", taskUpdatedEvent.getFinishTime());
            tEntity.addEvent(tEvent);
            tEntity.setEntityId(taskUpdatedEvent.getTaskId().toString());
            tEntity.setEntityType(MAPREDUCE_TASK_ENTITY_TYPE);
            tEntity.addRelatedEntity(MAPREDUCE_JOB_ENTITY_TYPE, jobId.toString());
            try {
                timelineClient.putEntities(tEntity);
            } catch (IOException ex) {
                LOG.error("Error putting entity " + tEntity.getEntityId() + " to TimelineServer", ex);
            } catch (YarnException ex) {
                LOG.error("Error putting entity " + tEntity.getEntityId() + " to TimelineServer", ex);
            }
        }
    }

    private class TaskFinishedTimelineServerProcessor extends TimelineServerProcessor {
        @Override
        public void process(HistoryEvent event, JobId jobId, long timestamp) {
            TaskFinishedEvent taskFinishedEvent = (TaskFinishedEvent) event;
            TimelineEvent tEvent = new TimelineEvent();
            tEvent.setEventType(StringUtils.toUpperCase(event.getEventType().name()));
            tEvent.setTimestamp(timestamp);
            TimelineEntity tEntity = new TimelineEntity();
            tEvent.addEventInfo("TASK_TYPE", taskFinishedEvent.getTaskType().toString());
            tEvent.addEventInfo("COUNTERS_GROUPS", countersToJSON(taskFinishedEvent.getCounters()));
            tEvent.addEventInfo("FINISH_TIME", taskFinishedEvent.getFinishTime());
            tEvent.addEventInfo("STATUS", TaskStatus.State.SUCCEEDED.toString());
            tEvent.addEventInfo("SUCCESSFUL_TASK_ATTEMPT_ID", taskFinishedEvent.getSuccessfulTaskAttemptId() == null ? "" : taskFinishedEvent.getSuccessfulTaskAttemptId().toString());
            tEntity.addEvent(tEvent);
            tEntity.setEntityId(taskFinishedEvent.getTaskId().toString());
            tEntity.setEntityType(MAPREDUCE_TASK_ENTITY_TYPE);
            tEntity.addRelatedEntity(MAPREDUCE_JOB_ENTITY_TYPE, jobId.toString());
            try {
                timelineClient.putEntities(tEntity);
            } catch (IOException ex) {
                LOG.error("Error putting entity " + tEntity.getEntityId() + " to TimelineServer", ex);
            } catch (YarnException ex) {
                LOG.error("Error putting entity " + tEntity.getEntityId() + " to TimelineServer", ex);
            }
        }
    }

    private class TaskAttemptStartedTimelineServerProcessor extends TimelineServerProcessor {
        @Override
        public void process(HistoryEvent event, JobId jobId, long timestamp) {
            TaskAttemptStartedEvent taskAttemptStartedEvent = (TaskAttemptStartedEvent) event;
            TimelineEvent tEvent = new TimelineEvent();
            tEvent.setEventType(StringUtils.toUpperCase(event.getEventType().name()));
            tEvent.setTimestamp(timestamp);
            TimelineEntity tEntity = new TimelineEntity();
            tEvent.addEventInfo("TASK_TYPE", taskAttemptStartedEvent.getTaskType().toString());
            tEvent.addEventInfo("TASK_ATTEMPT_ID", taskAttemptStartedEvent.getTaskAttemptId().toString());
            tEvent.addEventInfo("START_TIME", taskAttemptStartedEvent.getStartTime());
            tEvent.addEventInfo("HTTP_PORT", taskAttemptStartedEvent.getHttpPort());
            tEvent.addEventInfo("TRACKER_NAME", taskAttemptStartedEvent.getTrackerName());
            tEvent.addEventInfo("TASK_TYPE", taskAttemptStartedEvent.getTaskType().toString());
            tEvent.addEventInfo("SHUFFLE_PORT", taskAttemptStartedEvent.getShufflePort());
            tEvent.addEventInfo("CONTAINER_ID", taskAttemptStartedEvent.getContainerId() == null ? "" : taskAttemptStartedEvent.getContainerId().toString());
            tEntity.addEvent(tEvent);
            tEntity.setEntityId(taskAttemptStartedEvent.getTaskId().toString());
            tEntity.setEntityType(MAPREDUCE_TASK_ENTITY_TYPE);
            tEntity.addRelatedEntity(MAPREDUCE_JOB_ENTITY_TYPE, jobId.toString());
            try {
                timelineClient.putEntities(tEntity);
            } catch (IOException ex) {
                LOG.error("Error putting entity " + tEntity.getEntityId() + " to TimelineServer", ex);
            } catch (YarnException ex) {
                LOG.error("Error putting entity " + tEntity.getEntityId() + " to TimelineServer", ex);
            }
        }
    }

    private class TaskAttemptUnsuccessfulCompletionTimelineServerProcessor extends TimelineServerProcessor {
        @Override
        public void process(HistoryEvent event, JobId jobId, long timestamp) {
            TaskAttemptUnsuccessfulCompletionEvent taskAttemptUnsuccessfulCompletionEvent = (TaskAttemptUnsuccessfulCompletionEvent) event;
            TimelineEvent tEvent = new TimelineEvent();
            tEvent.setEventType(StringUtils.toUpperCase(event.getEventType().name()));
            tEvent.setTimestamp(timestamp);
            TimelineEntity tEntity = new TimelineEntity();
            tEvent.addEventInfo("TASK_TYPE", taskAttemptUnsuccessfulCompletionEvent.getTaskType().toString());
            tEvent.addEventInfo("TASK_ATTEMPT_ID", taskAttemptUnsuccessfulCompletionEvent.getTaskAttemptId() == null ? "" : taskAttemptUnsuccessfulCompletionEvent.getTaskAttemptId().toString());
            tEvent.addEventInfo("FINISH_TIME", taskAttemptUnsuccessfulCompletionEvent.getFinishTime());
            tEvent.addEventInfo("ERROR", taskAttemptUnsuccessfulCompletionEvent.getError());
            tEvent.addEventInfo("STATUS", taskAttemptUnsuccessfulCompletionEvent.getTaskStatus());
            tEvent.addEventInfo("HOSTNAME", taskAttemptUnsuccessfulCompletionEvent.getHostname());
            tEvent.addEventInfo("PORT", taskAttemptUnsuccessfulCompletionEvent.getPort());
            tEvent.addEventInfo("RACK_NAME", taskAttemptUnsuccessfulCompletionEvent.getRackName());
            tEvent.addEventInfo("SHUFFLE_FINISH_TIME", taskAttemptUnsuccessfulCompletionEvent.getFinishTime());
            tEvent.addEventInfo("SORT_FINISH_TIME", taskAttemptUnsuccessfulCompletionEvent.getFinishTime());
            tEvent.addEventInfo("MAP_FINISH_TIME", taskAttemptUnsuccessfulCompletionEvent.getFinishTime());
            tEvent.addEventInfo("COUNTERS_GROUPS", countersToJSON(taskAttemptUnsuccessfulCompletionEvent.getCounters()));
            tEntity.addEvent(tEvent);
            tEntity.setEntityId(taskAttemptUnsuccessfulCompletionEvent.getTaskId().toString());
            tEntity.setEntityType(MAPREDUCE_TASK_ENTITY_TYPE);
            tEntity.addRelatedEntity(MAPREDUCE_JOB_ENTITY_TYPE, jobId.toString());
            try {
                timelineClient.putEntities(tEntity);
            } catch (IOException ex) {
                LOG.error("Error putting entity " + tEntity.getEntityId() + " to TimelineServer", ex);
            } catch (YarnException ex) {
                LOG.error("Error putting entity " + tEntity.getEntityId() + " to TimelineServer", ex);
            }
        }
    }

    private class MapAttemptFinishedTimelineServerProcessor extends TimelineServerProcessor {
        @Override
        public void process(HistoryEvent event, JobId jobId, long timestamp) {
            MapAttemptFinishedEvent mapAttemptFinishedEvent = (MapAttemptFinishedEvent) event;
            TimelineEvent tEvent = new TimelineEvent();
            tEvent.setEventType(StringUtils.toUpperCase(event.getEventType().name()));
            tEvent.setTimestamp(timestamp);
            TimelineEntity tEntity = new TimelineEntity();
            tEvent.addEventInfo("TASK_TYPE", mapAttemptFinishedEvent.getTaskType().toString());
            tEvent.addEventInfo("FINISH_TIME", mapAttemptFinishedEvent.getFinishTime());
            tEvent.addEventInfo("STATUS", mapAttemptFinishedEvent.getTaskStatus());
            tEvent.addEventInfo("STATE", mapAttemptFinishedEvent.getState());
            tEvent.addEventInfo("MAP_FINISH_TIME", mapAttemptFinishedEvent.getMapFinishTime());
            tEvent.addEventInfo("COUNTERS_GROUPS", countersToJSON(mapAttemptFinishedEvent.getCounters()));
            tEvent.addEventInfo("HOSTNAME", mapAttemptFinishedEvent.getHostname());
            tEvent.addEventInfo("PORT", mapAttemptFinishedEvent.getPort());
            tEvent.addEventInfo("RACK_NAME", mapAttemptFinishedEvent.getRackName());
            tEvent.addEventInfo("ATTEMPT_ID", mapAttemptFinishedEvent.getAttemptId() == null ? "" : mapAttemptFinishedEvent.getAttemptId().toString());
            tEntity.addEvent(tEvent);
            tEntity.setEntityId(mapAttemptFinishedEvent.getTaskId().toString());
            tEntity.setEntityType(MAPREDUCE_TASK_ENTITY_TYPE);
            tEntity.addRelatedEntity(MAPREDUCE_JOB_ENTITY_TYPE, jobId.toString());
            try {
                timelineClient.putEntities(tEntity);
            } catch (IOException ex) {
                LOG.error("Error putting entity " + tEntity.getEntityId() + " to TimelineServer", ex);
            } catch (YarnException ex) {
                LOG.error("Error putting entity " + tEntity.getEntityId() + " to TimelineServer", ex);
            }
        }
    }

    private class ReduceAttemptFinishedTimelineServerProcessor extends TimelineServerProcessor {
        @Override
        public void process(HistoryEvent event, JobId jobId, long timestamp) {
            ReduceAttemptFinishedEvent reduceAttemptFinishedEvent = (ReduceAttemptFinishedEvent) event;
            TimelineEvent tEvent = new TimelineEvent();
            tEvent.setEventType(StringUtils.toUpperCase(event.getEventType().name()));
            tEvent.setTimestamp(timestamp);
            TimelineEntity tEntity = new TimelineEntity();
            tEvent.addEventInfo("TASK_TYPE", reduceAttemptFinishedEvent.getTaskType().toString());
            tEvent.addEventInfo("ATTEMPT_ID", reduceAttemptFinishedEvent.getAttemptId() == null ? "" : reduceAttemptFinishedEvent.getAttemptId().toString());
            tEvent.addEventInfo("FINISH_TIME", reduceAttemptFinishedEvent.getFinishTime());
            tEvent.addEventInfo("STATUS", reduceAttemptFinishedEvent.getTaskStatus());
            tEvent.addEventInfo("STATE", reduceAttemptFinishedEvent.getState());
            tEvent.addEventInfo("SHUFFLE_FINISH_TIME", reduceAttemptFinishedEvent.getShuffleFinishTime());
            tEvent.addEventInfo("SORT_FINISH_TIME", reduceAttemptFinishedEvent.getSortFinishTime());
            tEvent.addEventInfo("COUNTERS_GROUPS", countersToJSON(reduceAttemptFinishedEvent.getCounters()));
            tEvent.addEventInfo("HOSTNAME", reduceAttemptFinishedEvent.getHostname());
            tEvent.addEventInfo("PORT", reduceAttemptFinishedEvent.getPort());
            tEvent.addEventInfo("RACK_NAME", reduceAttemptFinishedEvent.getRackName());
            tEntity.addEvent(tEvent);
            tEntity.setEntityId(reduceAttemptFinishedEvent.getTaskId().toString());
            tEntity.setEntityType(MAPREDUCE_TASK_ENTITY_TYPE);
            tEntity.addRelatedEntity(MAPREDUCE_JOB_ENTITY_TYPE, jobId.toString());
            try {
                timelineClient.putEntities(tEntity);
            } catch (IOException ex) {
                LOG.error("Error putting entity " + tEntity.getEntityId() + " to TimelineServer", ex);
            } catch (YarnException ex) {
                LOG.error("Error putting entity " + tEntity.getEntityId() + " to TimelineServer", ex);
            }
        }
    }

    private class TaskAttemptFinishedTimelineServerProcessor extends TimelineServerProcessor {
        @Override
        public void process(HistoryEvent event, JobId jobId, long timestamp) {
            TaskAttemptFinishedEvent taskAttemptFinishedEvent = (TaskAttemptFinishedEvent) event;
            TimelineEvent tEvent = new TimelineEvent();
            tEvent.setEventType(StringUtils.toUpperCase(event.getEventType().name()));
            tEvent.setTimestamp(timestamp);
            TimelineEntity tEntity = new TimelineEntity();
            tEvent.addEventInfo("TASK_TYPE", taskAttemptFinishedEvent.getTaskType().toString());
            tEvent.addEventInfo("ATTEMPT_ID", taskAttemptFinishedEvent.getAttemptId() == null ? "" : taskAttemptFinishedEvent.getAttemptId().toString());
            tEvent.addEventInfo("FINISH_TIME", taskAttemptFinishedEvent.getFinishTime());
            tEvent.addEventInfo("STATUS", taskAttemptFinishedEvent.getTaskStatus());
            tEvent.addEventInfo("STATE", taskAttemptFinishedEvent.getState());
            tEvent.addEventInfo("COUNTERS_GROUPS", countersToJSON(taskAttemptFinishedEvent.getCounters()));
            tEvent.addEventInfo("HOSTNAME", taskAttemptFinishedEvent.getHostname());
            tEntity.addEvent(tEvent);
            tEntity.setEntityId(taskAttemptFinishedEvent.getTaskId().toString());
            tEntity.setEntityType(MAPREDUCE_TASK_ENTITY_TYPE);
            tEntity.addRelatedEntity(MAPREDUCE_JOB_ENTITY_TYPE, jobId.toString());
            try {
                timelineClient.putEntities(tEntity);
            } catch (IOException ex) {
                LOG.error("Error putting entity " + tEntity.getEntityId() + " to TimelineServer", ex);
            } catch (YarnException ex) {
                LOG.error("Error putting entity " + tEntity.getEntityId() + " to TimelineServer", ex);
            }
        }
    }

    private class DefaultTimelineServerProcessor extends TimelineServerProcessor {
        @Override
        public void process(HistoryEvent event, JobId jobId, long timestamp) {
            // Do nothing
        }
    }

    // ...
}