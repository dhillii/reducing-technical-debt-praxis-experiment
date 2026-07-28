// Refactored Task class
public abstract class Task implements Writable, Configurable {
    // Existing fields and methods...

    // Refactored methods
    protected void runTaskCleanupTask(TaskUmbilicalProtocol umbilical, TaskReporter reporter) throws IOException, InterruptedException {
        TaskCleanupStrategy strategy = getTaskCleanupStrategy();
        strategy.execute(umbilical, reporter);
    }

    protected void runJobCleanupTask(TaskUmbilicalProtocol umbilical, TaskReporter reporter) throws IOException, InterruptedException {
        JobCleanupStrategy strategy = getJobCleanupStrategy();
        strategy.execute(umbilical, reporter);
    }

    protected void runJobSetupTask(TaskUmbilicalProtocol umbilical, TaskReporter reporter) throws IOException, InterruptedException {
        JobSetupStrategy strategy = getJobSetupStrategy();
        strategy.execute(umbilical, reporter);
    }

    // Strategy interfaces
    private interface TaskCleanupStrategy {
        void execute(TaskUmbilicalProtocol umbilical, TaskReporter reporter) throws IOException, InterruptedException;
    }

    private interface JobCleanupStrategy {
        void execute(TaskUmbilicalProtocol umbilical, TaskReporter reporter) throws IOException, InterruptedException;
    }

    private interface JobSetupStrategy {
        void execute(TaskUmbilicalProtocol umbilical, TaskReporter reporter) throws IOException, InterruptedException;
    }

    // Strategy implementations
    private class DefaultTaskCleanupStrategy implements TaskCleanupStrategy {
        @Override
        public void execute(TaskUmbilicalProtocol umbilical, TaskReporter reporter) throws IOException, InterruptedException {
            taskCleanup(umbilical);
            done(umbilical, reporter);
        }
    }

    private class DefaultJobCleanupStrategy implements JobCleanupStrategy {
        @Override
        public void execute(TaskUmbilicalProtocol umbilical, TaskReporter reporter) throws IOException, InterruptedException {
            // set phase for this task
            setPhase(TaskStatus.Phase.CLEANUP);
            getProgress().setStatus("cleanup");
            statusUpdate(umbilical);
            // do the cleanup
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
            // delete the staging area for the job
            JobConf conf = new JobConf(jobContext.getConfiguration());
            if (!keepTaskFiles(conf)) {
                String jobTempDir = conf.get(MRJobConfig.MAPREDUCE_JOB_DIR);
                Path jobTempDirPath = new Path(jobTempDir);
                FileSystem fs = jobTempDirPath.getFileSystem(conf);
                fs.delete(jobTempDirPath, true);
            }
            done(umbilical, reporter);
        }
    }

    private class DefaultJobSetupStrategy implements JobSetupStrategy {
        @Override
        public void execute(TaskUmbilicalProtocol umbilical, TaskReporter reporter) throws IOException, InterruptedException {
            // do the setup
            getProgress().setStatus("setup");
            committer.setupJob(jobContext);
            done(umbilical, reporter);
        }
    }

    // Strategy factory methods
    private TaskCleanupStrategy getTaskCleanupStrategy() {
        return new DefaultTaskCleanupStrategy();
    }

    private JobCleanupStrategy getJobCleanupStrategy() {
        return new DefaultJobCleanupStrategy();
    }

    private JobSetupStrategy getJobSetupStrategy() {
        return new DefaultJobSetupStrategy();
    }
}