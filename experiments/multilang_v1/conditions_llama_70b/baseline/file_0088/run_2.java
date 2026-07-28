// Task.java

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

  // ... (rest of the code remains the same)

  // Extracted methods to reduce complexity
  protected void initializeTask() throws IOException, ClassNotFoundException, InterruptedException {
    jobContext = new JobContextImpl(job, id, reporter);
    taskContext = new TaskAttemptContextImpl(job, taskId, reporter);
    if (getState() == TaskStatus.State.UNASSIGNED) {
      setState(TaskStatus.State.RUNNING);
    }
    // ... (rest of the initialization code)
  }

  protected void updateCounters() {
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
    // ... (rest of the counter update code)
  }

  protected void commitTask() throws IOException {
    int retries = MAX_RETRIES;
    while (true) {
      try {
        while (!umbilical.canCommit(taskId)) {
          try {
            Thread.sleep(1000);
          } catch(InterruptedException ie) {
            //ignore
          }
          reporter.setProgressFlag();
        }
        break;
      } catch (IOException ie) {
        LOG.warn("Failure asking whether task can commit: " + 
            StringUtils.stringifyException(ie));
        if (--retries == 0) {
          //if it couldn't query successfully then delete the output
          discardOutput(taskContext);
          System.exit(68);
        }
      }
    }
    // ... (rest of the commit code)
  }

  // ... (rest of the code remains the same)
}