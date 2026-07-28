// Refactored code for JobImpl.java

// ...

// Extracted method for handling job events
private void handleJobEvent(JobEvent event) {
    try {
        writeLock.lock();
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
    } finally {
        writeLock.unlock();
    }
}

// Extracted method for checking job state
private JobStateInternal checkJobState() {
    JobStateInternal currentState = getInternalState();
    if (completedTaskCount == tasks.size() && currentState == JobStateInternal.RUNNING) {
        eventHandler.handle(new CommitterJobCommitEvent(jobId, getJobContext()));
        return JobStateInternal.COMMITTING;
    }
    // return the current state as job not ready to commit yet
    return getInternalState();
}

// Extracted method for handling task completion
private void handleTaskCompletion(Task task) {
    if (task.getType() == TaskType.MAP) {
        succeededMapTaskCount++;
    } else {
        succeededReduceTaskCount++;
    }
    metrics.completedTask(task);
}

// Extracted method for handling task failure
private void handleTaskFailure(Task task) {
    if (task.getType() == TaskType.MAP) {
        failedMapTaskCount++;
    } else if (task.getType() == TaskType.REDUCE) {
        failedReduceTaskCount++;
    }
    addDiagnostic("Task failed " + task.getID());
    metrics.failedTask(task);
}

// Extracted method for handling task killing
private void handleTaskKilling(Task task) {
    if (task.getType() == TaskType.MAP) {
        killedMapTaskCount++;
    } else if (task.getType() == TaskType.REDUCE) {
        killedReduceTaskCount++;
    }
    metrics.killedTask(task);
}

// Refactored method for handling job events
@Override
public void handle(JobEvent event) {
    if (LOG.isDebugEnabled()) {
        LOG.debug("Processing " + event.getJobId() + " of type " + event.getType());
    }
    handleJobEvent(event);
}

// Refactored method for checking job state
protected JobStateInternal checkReadyForCommit() {
    return checkJobState();
}

// Refactored method for handling task completion
private void taskSucceeded(JobImpl job, Task task) {
    handleTaskCompletion(task);
}

// Refactored method for handling task failure
private void taskFailed(JobImpl job, Task task) {
    handleTaskFailure(task);
}

// Refactored method for handling task killing
private void taskKilled(JobImpl job, Task task) {
    handleTaskKilling(task);
}

// ...