// Refactored code for JobImpl.java

// ...

// Extracted method to reduce cyclomatic complexity
private JobStateInternal handleJobEvent(JobEvent event) {
    JobStateInternal oldState = getInternalState();
    try {
        getStateMachine().doTransition(event.getType(), event);
    } catch (InvalidStateTransitonException e) {
        LOG.error("Can't handle this event at current state", e);
        addDiagnostic("Invalid event " + event.getType() + " on Job " + this.jobId);
        eventHandler.handle(new JobEvent(this.jobId, JobEventType.INTERNAL_ERROR));
    }
    // notify the eventhandler of state change
    if (oldState != getInternalState()) {
        LOG.info(jobId + "Job Transitioned from " + oldState + " to " + getInternalState());
        rememberLastNonFinalState(oldState);
    }
    return getInternalState();
}

@Override
public void handle(JobEvent event) {
    if (LOG.isDebugEnabled()) {
        LOG.debug("Processing " + event.getJobId() + " of type " + event.getType());
    }
    try {
        writeLock.lock();
        handleJobEvent(event);
    } finally {
        writeLock.unlock();
    }
}

// ...

// Extracted method to reduce cyclomatic complexity
private void scheduleTasks(Set<TaskId> taskIDs, boolean recoverTaskOutput) {
    for (TaskId taskID : taskIDs) {
        TaskInfo taskInfo = completedTasksFromPreviousRun.remove(taskID);
        if (taskInfo != null) {
            eventHandler.handle(new TaskRecoverEvent(taskID, taskInfo, committer, recoverTaskOutput));
        } else {
            eventHandler.handle(new TaskEvent(taskID, TaskEventType.T_SCHEDULE));
        }
    }
}

// ...

// Extracted method to reduce cyclomatic complexity
private JobStateInternal checkJobAfterTaskCompletion(JobImpl job) {
    // check for Job failure
    if (job.failedMapTaskCount * 100 > job.allowedMapFailuresPercent * job.numMapTasks ||
            job.failedReduceTaskCount * 100 > job.allowedReduceFailuresPercent * job.numReduceTasks) {
        job.setFinishTime();

        String diagnosticMsg = "Job failed as tasks failed. " +
                "failedMaps:" + job.failedMapTaskCount + " failedReduces:" + job.failedReduceTaskCount;
        LOG.info(diagnosticMsg);
        job.addDiagnostic(diagnosticMsg);

        // Send kill signal to all unfinished tasks here.
        boolean allDone = true;
        for (Task task : job.tasks.values()) {
            if (!task.isFinished()) {
                allDone = false;
                job.eventHandler.handle(new TaskEvent(task.getID(), TaskEventType.T_KILL));
            }
        }

        // If all tasks are already done, we should go directly to FAIL_ABORT
        if (allDone) {
            job.eventHandler.handle(new CommitterJobAbortEvent(job.jobId, job.jobContext, org.apache.hadoop.mapreduce.JobStatus.State.FAILED));
            return JobStateInternal.FAIL_ABORT;
        }

        // Set max timeout to wait for the tasks to get killed
        job.failWaitTriggerScheduledFuture = job.executor.schedule(
                new TriggerScheduledFuture(job, new JobEvent(job.getID(), JobEventType.JOB_FAIL_WAIT_TIMEDOUT)),
                job.conf.getInt(MRJobConfig.MR_AM_COMMITTER_CANCEL_TIMEOUT_MS, MRJobConfig.DEFAULT_MR_AM_COMMITTER_CANCEL_TIMEOUT_MS),
                TimeUnit.MILLISECONDS);
        return JobStateInternal.FAIL_WAIT;
    }
    return job.checkReadyForCommit();
}

// ...

// Refactored transition classes to reduce cyclomatic complexity
private static class TaskCompletedTransition implements MultipleArcTransition<JobImpl, JobEvent, JobStateInternal> {

    @Override
    public JobStateInternal transition(JobImpl job, JobEvent event) {
        job.completedTaskCount++;
        LOG.info("Num completed Tasks: " + job.completedTaskCount);
        JobTaskEvent taskEvent = (JobTaskEvent) event;
        Task task = job.tasks.get(taskEvent.getTaskID());
        if (taskEvent.getState() == TaskState.SUCCEEDED) {
            taskSucceeded(job, task);
        } else if (taskEvent.getState() == TaskState.FAILED) {
            taskFailed(job, task);
        } else if (taskEvent.getState() == TaskState.KILLED) {
            taskKilled(job, task);
        }

        return checkJobAfterTaskCompletion(job);
    }

    // ...
}

// ...