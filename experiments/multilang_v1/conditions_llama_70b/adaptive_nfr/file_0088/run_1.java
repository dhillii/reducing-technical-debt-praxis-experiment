// Refactored code for the Task class to reduce cyclomatic complexity

public abstract class Task implements Writable, Configurable {

    // Existing code...

    // Refactored method to reduce cyclomatic complexity
    protected void runTaskCleanupTask(TaskUmbilicalProtocol umbilical, TaskReporter reporter) throws IOException, InterruptedException {
        taskCleanup(umbilical);
        done(umbilical, reporter);
    }

    // Extracted method to handle task cleanup
    private void taskCleanup(TaskUmbilicalProtocol umbilical) throws IOException {
        setPhase(TaskStatus.Phase.CLEANUP);
        getProgress().setStatus("cleanup");
        statusUpdate(umbilical);
        LOG.info("Running cleanup for the task");
        committer.abortTask(taskContext);
    }

    // Refactored method to reduce cyclomatic complexity
    protected void runJobCleanupTask(TaskUmbilicalProtocol umbilical, TaskReporter reporter) throws IOException, InterruptedException {
        jobCleanup(umbilical, reporter);
    }

    // Extracted method to handle job cleanup
    private void jobCleanup(TaskUmbilicalProtocol umbilical, TaskReporter reporter) throws IOException, InterruptedException {
        setPhase(TaskStatus.Phase.CLEANUP);
        getProgress().setStatus("cleanup");
        statusUpdate(umbilical);
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
        done(umbilical, reporter);
    }

    // Refactored method to reduce cyclomatic complexity
    private void commit(TaskUmbilicalProtocol umbilical, TaskReporter reporter, org.apache.hadoop.mapreduce.OutputCommitter committer) throws IOException {
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
        } catch (IOException iee) {
            LOG.warn("Failure committing: " + StringUtils.stringifyException(iee));
            discardOutput(taskContext);
            throw iee;
        }
    }

    // Existing code...
}