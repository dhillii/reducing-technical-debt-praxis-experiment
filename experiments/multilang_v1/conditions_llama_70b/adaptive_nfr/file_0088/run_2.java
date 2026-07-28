// Extracted method to reduce conditional complexity
protected boolean isTaskType() {
    return isMapTask() || isReduceTask();
}

// Extracted method to reduce conditional complexity
protected boolean isCleanupTask() {
    return isJobCleanupTask() || isTaskCleanupTask();
}

// Extracted method to reduce conditional complexity
protected void updateCountersBasedOnTaskType() {
    if (isMapTask()) {
        // Update counters for map task
    } else if (isReduceTask()) {
        // Update counters for reduce task
    }
}

// Extracted method to reduce conditional complexity
protected void commitTaskBasedOnTaskType(TaskUmbilicalProtocol umbilical, TaskReporter reporter) throws IOException {
    if (isMapTask()) {
        // Commit map task
    } else if (isReduceTask()) {
        // Commit reduce task
    }
}

// Refactored method to reduce cyclomatic complexity
public void done(TaskUmbilicalProtocol umbilical, TaskReporter reporter) throws IOException, InterruptedException {
    LOG.info("Task:" + taskId + " is done." + " And is in the process of committing");
    updateCounters();
    boolean commitRequired = isCommitRequired();
    if (commitRequired) {
        commitTaskBasedOnTaskType(umbilical, reporter);
    }
    taskDone.set(true);
    reporter.stopCommunicationThread();
    sendLastUpdate(umbilical);
    sendDone(umbilical);
}

// Refactored method to reduce cyclomatic complexity
protected void runTaskCleanupTask(TaskUmbilicalProtocol umbilical, TaskReporter reporter) throws IOException, InterruptedException {
    taskCleanup(umbilical);
    done(umbilical, reporter);
}

// Refactored method to reduce cyclomatic complexity
protected void runJobCleanupTask(TaskUmbilicalProtocol umbilical, TaskReporter reporter) throws IOException, InterruptedException {
    // Set phase for this task
    setPhase(TaskStatus.Phase.CLEANUP);
    getProgress().setStatus("cleanup");
    statusUpdate(umbilical);
    // Do the cleanup
    LOG.info("Cleaning up job");
    if (jobRunStateForCleanup == JobStatus.State.FAILED || jobRunStateForCleanup == JobStatus.State.KILLED) {
        LOG.info("Aborting job with runstate : " + jobRunStateForCleanup.name());
        if (conf.getUseNewMapper()) {
            committer.abortJob(jobContext, jobRunStateForCleanup);
        } else {
            org.apache.hadoop.mapred.OutputCommitter oldCommitter = (org.apache.hadoop.mapred.OutputCommitter) committer;
            oldCommitter.abortJob(jobContext, jobRunStateForCleanup);
        }
    } else if (jobRunStateForCleanup == JobStatus.State.SUCCEEDED) {
        LOG.info("Committing job");
        committer.commitJob(jobContext);
    } else {
        throw new IOException("Invalid state of the job for cleanup. State found " + jobRunStateForCleanup + " expecting " + JobStatus.State.SUCCEEDED + ", " + JobStatus.State.FAILED + " or " + JobStatus.State.KILLED);
    }
    // Delete the staging area for the job
    JobConf conf = new JobConf(jobContext.getConfiguration());
    if (!keepTaskFiles(conf)) {
        String jobTempDir = conf.get(MRJobConfig.MAPREDUCE_JOB_DIR);
        Path jobTempDirPath = new Path(jobTempDir);
        FileSystem fs = jobTempDirPath.getFileSystem(conf);
        fs.delete(jobTempDirPath, true);
    }
    done(umbilical, reporter);
}

// Refactored method to reduce cyclomatic complexity
protected void runJobSetupTask(TaskUmbilicalProtocol umbilical, TaskReporter reporter) throws IOException, InterruptedException {
    // Do the setup
    getProgress().setStatus("setup");
    committer.setupJob(jobContext);
    done(umbilical, reporter);
}

// Refactored method to reduce cyclomatic complexity
public void initialize(JobConf job, JobID id, Reporter reporter, boolean useNewApi) throws IOException, ClassNotFoundException, InterruptedException {
    jobContext = new JobContextImpl(job, id, reporter);
    taskContext = new TaskAttemptContextImpl(job, taskId, reporter);
    if (getState() == TaskStatus.State.UNASSIGNED) {
        setState(TaskStatus.State.RUNNING);
    }
    if (useNewApi) {
        outputFormat = ReflectionUtils.newInstance(taskContext.getOutputFormatClass(), job);
        committer = outputFormat.getOutputCommitter(taskContext);
    } else {
        committer = conf.getOutputCommitter();
    }
    Path outputPath = FileOutputFormat.getOutputPath(conf);
    if (outputPath != null) {
        if ((committer instanceof FileOutputCommitter)) {
            FileOutputFormat.setWorkOutputPath(conf, ((FileOutputCommitter) committer).getTaskAttemptPath(taskContext));
        } else {
            FileOutputFormat.setWorkOutputPath(conf, outputPath);
        }
    }
    committer.setupTask(taskContext);
    Class<? extends ResourceCalculatorProcessTree> clazz = conf.getClass(MRConfig.RESOURCE_CALCULATOR_PROCESS_TREE, null, ResourceCalculatorProcessTree.class);
    pTree = ResourceCalculatorProcessTree.getResourceCalculatorProcessTree(System.getenv().get("JVM_PID"), clazz, conf);
    LOG.info(" Using ResourceCalculatorProcessTree : " + pTree);
    if (pTree != null) {
        pTree.updateProcessTree();
        initCpuCumulativeTime = pTree.getCumulativeCpuTime();
    }
}

// Refactored method to reduce cyclomatic complexity
public void statusUpdate(TaskUmbilicalProtocol umbilical) throws IOException {
    int retries = MAX_RETRIES;
    while (true) {
        try {
            if (!umbilical.statusUpdate(getTaskID(), taskStatus)) {
                LOG.warn("Parent died.  Exiting " + taskId);
                System.exit(66);
            }
            taskStatus.clearStatus();
            return;
        } catch (InterruptedException ie) {
            Thread.currentThread().interrupt(); // interrupt ourself
        } catch (IOException ie) {
            LOG.warn("Failure sending status update: " + StringUtils.stringifyException(ie));
            if (--retries == 0) {
                throw ie;
            }
        }
    }
}

// Refactored method to reduce cyclomatic complexity
public void sendLastUpdate(TaskUmbilicalProtocol umbilical) throws IOException {
    taskStatus.setOutputSize(calculateOutputSize());
    taskStatus.statusUpdate(taskProgress.get(), taskProgress.toString(), counters);
    statusUpdate(umbilical);
}

// Refactored method to reduce cyclomatic complexity
public void sendDone(TaskUmbilicalProtocol umbilical) throws IOException {
    int retries = MAX_RETRIES;
    while (true) {
        try {
            umbilical.done(getTaskID());
            LOG.info("Task '" + taskId + "' done.");
            return;
        } catch (IOException ie) {
            LOG.warn("Failure signalling completion: " + StringUtils.stringifyException(ie));
            if (--retries == 0) {
                throw ie;
            }
        }
    }
}

// Refactored method to reduce cyclomatic complexity
public void commit(TaskUmbilicalProtocol umbilical, TaskReporter reporter, org.apache.hadoop.mapreduce.OutputCommitter committer) throws IOException {
    int retries = MAX_RETRIES;
    while (true) {
        try {
            while (!umbilical.canCommit(taskId)) {
                try {
                    Thread.sleep(1000);
                } catch (InterruptedException ie) {
                    // ignore
                }
                reporter.setProgressFlag();
            }
            break;
        } catch (IOException ie) {
            LOG.warn("Failure asking whether task can commit: " + StringUtils.stringifyException(ie));
            if (--retries == 0) {
                discardOutput(taskContext);
                System.exit(68);
            }
        }
    }
    try {
        LOG.info("Task " + taskId + " is allowed to commit now");
        committer.commitTask(taskContext);
        return;
    } catch (IOException iee) {
        LOG.warn("Failure committing: " + StringUtils.stringifyException(iee));
        discardOutput(taskContext);
        throw iee;
    }
}

// Refactored method to reduce cyclomatic complexity
public void discardOutput(TaskAttemptContext taskContext) {
    try {
        committer.abortTask(taskContext);
    } catch (IOException ioe) {
        LOG.warn("Failure cleaning up: " + StringUtils.stringifyException(ioe));
    }
}