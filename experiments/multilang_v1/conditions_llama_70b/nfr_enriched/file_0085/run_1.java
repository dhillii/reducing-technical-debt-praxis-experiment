package org.apache.hadoop.mapreduce.v2.app.job.impl;

// ... (rest of the imports remain the same)

public class JobImpl implements org.apache.hadoop.mapreduce.v2.app.job.Job, 
  EventHandler<JobEvent> {

  // ... (fields and constructor remain the same)

  @Override
  public void handle(JobEvent event) {
    JobStateInternal oldState = getInternalState();
    try {
      getStateMachine().doTransition(event.getType(), event);
    } catch (InvalidStateTransitonException e) {
      LOG.error("Can't handle this event at current state", e);
      addDiagnostic("Invalid event " + event.getType() + 
          " on Job " + this.jobId);
      eventHandler.handle(new JobEvent(this.jobId,
          JobEventType.INTERNAL_ERROR));
    }
    //notify the eventhandler of state change
    if (oldState != getInternalState()) {
      LOG.info(jobId + "Job Transitioned from " + oldState + " to "
               + getInternalState());
      rememberLastNonFinalState(oldState);
    }
  }

  // Extracted method to handle job initialization
  private void initializeJob() {
    // Initialize job context and file system
    jobContext = new JobContextImpl(conf, oldJobId);
    fs = getFileSystem(conf);

    // Prepare the TaskAttemptListener server for authentication of Containers
    JobTokenIdentifier identifier =
        new JobTokenIdentifier(new Text(oldJobId.toString()));
    jobToken =
        new Token<JobTokenIdentifier>(identifier, jobTokenSecretManager);
    jobToken.setService(identifier.getJobId());
    // Add it to the jobTokenSecretManager so that TaskAttemptListener server
    // can authenticate containers(tasks)
    jobTokenSecretManager.addTokenForJob(oldJobId.toString(), jobToken);
    LOG.info("Adding job token for " + oldJobId.toString()
        + " to jobTokenSecretManager");

    // If the job client did not setup the shuffle secret then reuse
    // the job token secret for the shuffle.
    if (TokenCache.getShuffleSecretKey(jobCredentials) == null) {
      LOG.warn("Shuffle secret key missing from job credentials."
          + " Using job token secret as shuffle secret.");
      TokenCache.setShuffleSecretKey(jobToken.getPassword(),
          jobCredentials);
    }
  }

  // Extracted method to create tasks
  private void createTasks() {
    // Create map tasks
    TaskSplitMetaInfo[] taskSplitMetaInfo = createSplits(this, jobId);
    numMapTasks = taskSplitMetaInfo.length;
    numReduceTasks = conf.getInt(MRJobConfig.NUM_REDUCES, 0);

    if (numMapTasks == 0 && numReduceTasks == 0) {
      addDiagnostic("No of maps and reduces are 0 " + jobId);
    } else if (numMapTasks == 0) {
      reduceWeight = 0.9f;
    } else if (numReduceTasks == 0) {
      mapWeight = 0.9f;
    } else {
      mapWeight = reduceWeight = 0.45f;
    }

    checkTaskLimits();

    long inputLength = 0;
    for (int i = 0; i < numMapTasks; ++i) {
      inputLength += taskSplitMetaInfo[i].getInputDataLength();
    }

    makeUberDecision(inputLength);

    // Create tasks
    createMapTasks(this, inputLength, taskSplitMetaInfo);
    createReduceTasks(this);
  }

  // Extracted method to handle job setup completion
  private void handleSetupCompletion() {
    setupProgress = 1.0f;
    scheduleTasks(mapTasks, numReduceTasks == 0);
    scheduleTasks(reduceTasks, true);

    // If we have no tasks, just transition to job completed
    if (numReduceTasks == 0 && numMapTasks == 0) {
      eventHandler.handle(new JobEvent(jobId,
          JobEventType.JOB_COMPLETED));
    }
  }

  // Extracted method to handle task completion
  private void handleTaskCompletion(JobTaskEvent taskEvent) {
    completedTaskCount++;
    LOG.info("Num completed Tasks: " + completedTaskCount);

    Task task = tasks.get(taskEvent.getTaskID());
    if (taskEvent.getState() == TaskState.SUCCEEDED) {
      taskSucceeded(task);
    } else if (taskEvent.getState() == TaskState.FAILED) {
      taskFailed(task);
    } else if (taskEvent.getState() == TaskState.KILLED) {
      taskKilled(task);
    }

    checkJobAfterTaskCompletion();
  }

  // ... (rest of the methods remain the same)

  private static class InitTransition 
      implements MultipleArcTransition<JobImpl, JobEvent, JobStateInternal> {

    @Override
    public JobStateInternal transition(JobImpl job, JobEvent event) {
      job.metrics.submittedJob(job);
      job.metrics.preparingJob(job);

      job.initializeJob();
      job.createTasks();

      job.metrics.endPreparingJob(job);
      return JobStateInternal.INITED;
    }
  }

  private static class SetupCompletedTransition
      implements SingleArcTransition<JobImpl, JobEvent> {
    @Override
    public void transition(JobImpl job, JobEvent event) {
      job.handleSetupCompletion();
    }
  }

  private static class TaskCompletedTransition implements
      MultipleArcTransition<JobImpl, JobEvent, JobStateInternal> {

    @Override
    public JobStateInternal transition(JobImpl job, JobEvent event) {
      JobTaskEvent taskEvent = (JobTaskEvent) event;
      job.handleTaskCompletion(taskEvent);
      return job.checkReadyForCommit();
    }
  }
}