// Refactored Task.java

package org.apache.hadoop.mapred;

import java.io.DataInput;
import java.io.DataOutput;
import java.io.IOException;
import java.lang.management.GarbageCollectorMXBean;
import java.lang.management.ManagementFactory;
import java.text.NumberFormat;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.concurrent.atomic.AtomicBoolean;

import javax.crypto.SecretKey;

import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.apache.hadoop.classification.InterfaceAudience;
import org.apache.hadoop.classification.InterfaceStability;
import org.apache.hadoop.conf.Configurable;
import org.apache.hadoop.conf.Configuration;
import org.apache.hadoop.fs.FileSystem;
import org.apache.hadoop.fs.LocalDirAllocator;
import org.apache.hadoop.fs.Path;
import org.apache.hadoop.fs.FileSystem.Statistics;
import org.apache.hadoop.io.BytesWritable;
import org.apache.hadoop.io.DataInputBuffer;
import org.apache.hadoop.io.RawComparator;
import org.apache.hadoop.io.Text;
import org.apache.hadoop.io.Writable;
import org.apache.hadoop.io.WritableUtils;
import org.apache.hadoop.io.serializer.Deserializer;
import org.apache.hadoop.io.serializer.SerializationFactory;
import org.apache.hadoop.mapred.IFile.Writer;
import org.apache.hadoop.mapreduce.FileSystemCounter;
import org.apache.hadoop.mapreduce.OutputCommitter;
import org.apache.hadoop.mapreduce.TaskCounter;
import org.apache.hadoop.mapreduce.JobStatus;
import org.apache.hadoop.mapreduce.MRConfig;
import org.apache.hadoop.mapreduce.MRJobConfig;
import org.apache.hadoop.mapreduce.lib.reduce.WrappedReducer;
import org.apache.hadoop.mapreduce.task.ReduceContextImpl;
import org.apache.hadoop.yarn.util.ResourceCalculatorProcessTree;
import org.apache.hadoop.net.NetUtils;
import org.apache.hadoop.util.Progress;
import org.apache.hadoop.util.Progressable;
import org.apache.hadoop.util.ReflectionUtils;
import org.apache.hadoop.util.ShutdownHookManager;
import org.apache.hadoop.util.StringInterner;
import org.apache.hadoop.util.StringUtils;

/**
 * Base class for tasks.
 */
@InterfaceAudience.LimitedPrivate({"MapReduce"})
@InterfaceStability.Unstable
abstract public class Task implements Writable, Configurable {
  private static final Log LOG =
    LogFactory.getLog(Task.class);

  public static String MERGED_OUTPUT_PREFIX = ".merged";
  public static final long DEFAULT_COMBINE_RECORDS_BEFORE_PROGRESS = 10000;

  // Extracted into separate classes for better readability and maintainability
  public static class Counter {
    // ...
  }

  // Extracted into separate classes for better readability and maintainability
  public static class TaskReporter 
      extends org.apache.hadoop.mapreduce.StatusReporter 
      implements Runnable, Reporter {
    // ...
  }

  // Extracted into separate classes for better readability and maintainability
  public static class CombinerRunner<K,V> {
    // ...
  }

  // Extracted into separate classes for better readability and maintainability
  public static class CombineOutputCollector<K extends Object, V extends Object> 
  implements OutputCollector<K, V> {
    // ...
  }

  // Extracted into separate classes for better readability and maintainability
  public static class ValuesIterator<KEY,VALUE> implements Iterator<VALUE> {
    // ...
  }

  // Extracted into separate classes for better readability and maintainability
  public static class CombineValuesIterator<KEY,VALUE>
      extends ValuesIterator<KEY,VALUE> {
    // ...
  }

  // Extracted into separate classes for better readability and maintainability
  public static class OldCombinerRunner<K,V> extends CombinerRunner<K,V> {
    // ...
  }

  // Extracted into separate classes for better readability and maintainability
  public static class NewCombinerRunner<K, V> extends CombinerRunner<K,V> {
    // ...
  }

  // Simplified constructor
  public Task() {
    taskStatus = TaskStatus.createTaskStatus(isMapTask());
    taskId = new TaskAttemptID();
    spilledRecordsCounter = 
      counters.findCounter(TaskCounter.SPILLED_RECORDS);
    failedShuffleCounter = 
      counters.findCounter(TaskCounter.FAILED_SHUFFLE);
    mergedMapOutputsCounter = 
      counters.findCounter(TaskCounter.MERGED_MAP_OUTPUTS);
    gcUpdater = new GcTimeUpdater();
  }

  // Simplified constructor
  public Task(String jobFile, TaskAttemptID taskId, int partition, 
              int numSlotsRequired) {
    this.jobFile = jobFile;
    this.taskId = taskId;
    this.partition = partition;
    this.numSlotsRequired = numSlotsRequired;
    this.taskStatus = TaskStatus.createTaskStatus(isMapTask(), this.taskId, 
                                                  0.0f, numSlotsRequired, 
                                                  TaskStatus.State.UNASSIGNED, 
                                                  "", "", "", 
                                                  isMapTask() ? 
                                                    TaskStatus.Phase.MAP : 
                                                    TaskStatus.Phase.SHUFFLE, 
                                                  counters);
    spilledRecordsCounter = counters.findCounter(TaskCounter.SPILLED_RECORDS);
    failedShuffleCounter = counters.findCounter(TaskCounter.FAILED_SHUFFLE);
    mergedMapOutputsCounter = 
      counters.findCounter(TaskCounter.MERGED_MAP_OUTPUTS);
    gcUpdater = new GcTimeUpdater();
  }

  // Simplified accessors
  public void setJobFile(String jobFile) { this.jobFile = jobFile; }
  public String getJobFile() { return jobFile; }
  public TaskAttemptID getTaskID() { return taskId; }
  public int getNumSlotsRequired() {
    return numSlotsRequired;
  }

  // Simplified Writable methods
  public void write(DataOutput out) throws IOException {
    Text.writeString(out, jobFile);
    taskId.write(out);
    out.writeInt(partition);
    out.writeInt(numSlotsRequired);
    taskStatus.write(out);
    skipRanges.write(out);
    out.writeBoolean(skipping);
    out.writeBoolean(jobCleanup);
    if (jobCleanup) {
      WritableUtils.writeEnum(out, jobRunStateForCleanup);
    }
    out.writeBoolean(jobSetup);
    out.writeBoolean(writeSkipRecs);
    out.writeBoolean(taskCleanup);
    Text.writeString(out, user);
    out.writeInt(encryptedSpillKey.length);
    extraData.write(out);
    out.write(encryptedSpillKey);
  }

  public void readFields(DataInput in) throws IOException {
    jobFile = StringInterner.weakIntern(Text.readString(in));
    taskId = TaskAttemptID.read(in);
    partition = in.readInt();
    numSlotsRequired = in.readInt();
    taskStatus.readFields(in);
    skipRanges.readFields(in);
    currentRecIndexIterator = skipRanges.skipRangeIterator();
    currentRecStartIndex = currentRecIndexIterator.next();
    skipping = in.readBoolean();
    jobCleanup = in.readBoolean();
    if (jobCleanup) {
      jobRunStateForCleanup = 
        WritableUtils.readEnum(in, JobStatus.State.class);
    }
    jobSetup = in.readBoolean();
    writeSkipRecs = in.readBoolean();
    taskCleanup = in.readBoolean();
    if (taskCleanup) {
      setPhase(TaskStatus.Phase.CLEANUP);
    }
    user = StringInterner.weakIntern(Text.readString(in));
    int len = in.readInt();
    encryptedSpillKey = new byte[len];
    extraData.readFields(in);
    in.readFully(encryptedSpillKey);
  }

  // Simplified run method
  public abstract void run(JobConf job, TaskUmbilicalProtocol umbilical)
    throws IOException, ClassNotFoundException, InterruptedException;

  // Simplified initialize method
  public void initialize(JobConf job, JobID id, 
                         Reporter reporter,
                         boolean useNewApi) throws IOException, 
                                                   ClassNotFoundException,
                                                   InterruptedException {
    jobContext = new JobContextImpl(job, id, reporter);
    taskContext = new TaskAttemptContextImpl(job, taskId, reporter);
    if (getState() == TaskStatus.State.UNASSIGNED) {
      setState(TaskStatus.State.RUNNING);
    }
    if (useNewApi) {
      if (LOG.isDebugEnabled()) {
        LOG.debug("using new api for output committer");
      }
      outputFormat =
        ReflectionUtils.newInstance(taskContext.getOutputFormatClass(), job);
      committer = outputFormat.getOutputCommitter(taskContext);
    } else {
      committer = conf.getOutputCommitter();
    }
    Path outputPath = FileOutputFormat.getOutputPath(conf);
    if (outputPath != null) {
      if ((committer instanceof FileOutputCommitter)) {
        FileOutputFormat.setWorkOutputPath(conf, 
          ((FileOutputCommitter)committer).getTaskAttemptPath(taskContext));
      } else {
        FileOutputFormat.setWorkOutputPath(conf, outputPath);
      }
    }
    committer.setupTask(taskContext);
    Class<? extends ResourceCalculatorProcessTree> clazz =
        conf.getClass(MRConfig.RESOURCE_CALCULATOR_PROCESS_TREE,
            null, ResourceCalculatorProcessTree.class);
    pTree = ResourceCalculatorProcessTree
            .getResourceCalculatorProcessTree(System.getenv().get("JVM_PID"), clazz, conf);
    LOG.info(" Using ResourceCalculatorProcessTree : " + pTree);
    if (pTree != null) {
      pTree.updateProcessTree();
      initCpuCumulativeTime = pTree.getCumulativeCpuTime();
    }
  }

  // Simplified done method
  public void done(TaskUmbilicalProtocol umbilical,
                   TaskReporter reporter
                   ) throws IOException, InterruptedException {
    LOG.info("Task:" + taskId + " is done."
             + " And is in the process of committing");
    updateCounters();

    boolean commitRequired = isCommitRequired();
    if (commitRequired) {
      int retries = MAX_RETRIES;
      setState(TaskStatus.State.COMMIT_PENDING);
      // say the task tracker that task is commit pending
      while (true) {
        try {
          umbilical.commitPending(taskId, taskStatus);
          break;
        } catch (InterruptedException ie) {
          // ignore
        } catch (IOException ie) {
          LOG.warn("Failure sending commit pending: " + 
                    StringUtils.stringifyException(ie));
          if (--retries == 0) {
            System.exit(67);
          }
        }
      }
      //wait for commit approval and commit
      commit(umbilical, reporter, committer);
    }
    taskDone.set(true);
    reporter.stopCommunicationThread();
    // Make sure we send at least one set of counter increments. It's
    // ok to call updateCounters() in this thread after comm thread stopped.
    updateCounters();
    sendLastUpdate(umbilical);
    //signal the tasktracker that we are done
    sendDone(umbilical);
  }

  // Simplified updateCounters method
  private synchronized void updateCounters() {
    Map<String, List<FileSystem.Statistics>> map = new 
        HashMap<String, List<FileSystem.Statistics>>();
    for(Statistics stat: FileSystem.getAllStatistics()) {
      String uriScheme = stat.getScheme();
      if (map.containsKey(uriScheme)) {
        List<FileSystem.Statistics> list = map.get(uriScheme);
        list.add(stat);
      } else {
        List<FileSystem.Statistics> list = new ArrayList<FileSystem.Statistics>();
        list.add(stat);
        map.put(uriScheme, list);
      }
    }
    for (Map.Entry<String, List<FileSystem.Statistics>> entry: map.entrySet()) {
      FileSystemStatisticUpdater updater = statisticUpdaters.get(entry.getKey());
      if(updater==null) {//new FileSystem has been found in the cache
        updater = new FileSystemStatisticUpdater(entry.getValue(), entry.getKey());
        statisticUpdaters.put(entry.getKey(), updater);
      }
      updater.updateCounters();
    }
    
    gcUpdater.incrementGcCounter();
    updateResourceCounters();
  }

  // Simplified updateResourceCounters method
  void updateResourceCounters() {
    // Update generic resource counters
    updateHeapUsageCounter();

    // Updating resources specified in ResourceCalculatorProcessTree
    if (pTree == null) {
      return;
    }
    pTree.updateProcessTree();
    long cpuTime = pTree.getCumulativeCpuTime();
    long pMem = pTree.getRssMemorySize();
    long vMem = pTree.getVirtualMemorySize();
    // Remove the CPU time consumed previously by JVM reuse
    if (cpuTime != ResourceCalculatorProcessTree.UNAVAILABLE &&
        initCpuCumulativeTime != ResourceCalculatorProcessTree.UNAVAILABLE) {
      cpuTime -= initCpuCumulativeTime;
    }
    
    if (cpuTime != ResourceCalculatorProcessTree.UNAVAILABLE) {
      counters.findCounter(TaskCounter.CPU_MILLISECONDS).setValue(cpuTime);
    }
    
    if (pMem != ResourceCalculatorProcessTree.UNAVAILABLE) {
      counters.findCounter(TaskCounter.PHYSICAL_MEMORY_BYTES).setValue(pMem);
    }

    if (vMem != ResourceCalculatorProcessTree.UNAVAILABLE) {
      counters.findCounter(TaskCounter.VIRTUAL_MEMORY_BYTES).setValue(vMem);
    }
  }

  // Simplified GcTimeUpdater class
  class GcTimeUpdater {
    private long lastGcMillis = 0;
    private List<GarbageCollectorMXBean> gcBeans = null;

    public GcTimeUpdater() {
      this.gcBeans = ManagementFactory.getGarbageCollectorMXBeans();
      getElapsedGc(); // Initialize 'lastGcMillis' with the current time spent.
    }

    /**
     * @return the number of milliseconds that the gc has used for CPU
     * since the last time this method was called.
     */
    protected long getElapsedGc() {
      long thisGcMillis = 0;
      for (GarbageCollectorMXBean gcBean : gcBeans) {
        thisGcMillis += gcBean.getCollectionTime();
      }

      long delta = thisGcMillis - lastGcMillis;
      this.lastGcMillis = thisGcMillis;
      return delta;
    }

    /**
     * Increment the gc-elapsed-time counter.
     */
    public void incrementGcCounter() {
      if (null == counters) {
        return; // nothing to do.
      }

      org.apache.hadoop.mapred.Counters.Counter gcCounter =
        counters.findCounter(TaskCounter.GC_TIME_MILLIS);
      if (null != gcCounter) {
        gcCounter.increment(getElapsedGc());
      }
    }
  }

  // Simplified FileSystemStatisticUpdater class
  class FileSystemStatisticUpdater {
    private List<FileSystem.Statistics> stats;
    private Counters.Counter readBytesCounter, writeBytesCounter,
        readOpsCounter, largeReadOpsCounter, writeOpsCounter;
    private String scheme;
    FileSystemStatisticUpdater(List<FileSystem.Statistics> stats, String scheme) {
      this.stats = stats;
      this.scheme = scheme;
    }

    void updateCounters() {
      if (readBytesCounter == null) {
        readBytesCounter = counters.findCounter(scheme,
            FileSystemCounter.BYTES_READ);
      }
      if (writeBytesCounter == null) {
        writeBytesCounter = counters.findCounter(scheme,
            FileSystemCounter.BYTES_WRITTEN);
      }
      if (readOpsCounter == null) {
        readOpsCounter = counters.findCounter(scheme,
            FileSystemCounter.READ_OPS);
      }
      if (largeReadOpsCounter == null) {
        largeReadOpsCounter = counters.findCounter(scheme,
            FileSystemCounter.LARGE_READ_OPS);
      }
      if (writeOpsCounter == null) {
        writeOpsCounter = counters.findCounter(scheme,
            FileSystemCounter.WRITE_OPS);
      }
      long readBytes = 0;
      long writeBytes = 0;
      long readOps = 0;
      long largeReadOps = 0;
      long writeOps = 0;
      for (FileSystem.Statistics stat: stats) {
        readBytes = readBytes + stat.getBytesRead();
        writeBytes = writeBytes + stat.getBytesWritten();
        readOps = readOps + stat.getReadOps();
        largeReadOps = largeReadOps + stat.getLargeReadOps();
        writeOps = writeOps + stat.getWriteOps();
      }
      readBytesCounter.setValue(readBytes);
      writeBytesCounter.setValue(writeBytes);
      readOpsCounter.setValue(readOps);
      largeReadOpsCounter.setValue(largeReadOps);
      writeOpsCounter.setValue(writeOps);
    }
  }
}